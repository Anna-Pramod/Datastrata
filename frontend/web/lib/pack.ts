/**
 * Server-side access to the real CSRD knowledge pack, **with its verification
 * status resolved**.
 *
 * Loaded through the engine's own validating loader, so the site gets the same
 * referentially-checked content the CLI and tests get. A load failure is not
 * swallowed: if the content firewall rejects the pack, the site fails loudly
 * rather than answering from a half-loaded record.
 *
 * **Why this file gained a resolver.** `loadPack(dir)` with no options loads
 * every signature as `draft, ['freshness_unchecked']` — honest, and structurally
 * unable to ever say otherwise. So the site as shipped could not report a
 * verified requirement even when the repository held a fresh signature for it.
 * Design §3: `loadPack` acquires no corpus or result I/O, and the resolver
 * closes over that state instead.
 *
 * **One resolver, one code path, both surfaces.** The six pages are statically
 * generated and bake `packStats()` into HTML at build time; `/api/check` is
 * `force-dynamic` and reads the same pack per process. Both go through
 * `csrdPack()` -> `loadVerifiedCsrdPack()`. Two surfaces building their own
 * resolvers would agree today and diverge on the first normalizer, corpus-path
 * or hash-producer change, and the failure would be static pages and the
 * checker API reporting different statuses *within one deployment* — which no
 * test comparing either surface against itself can see.
 *
 * **And no second freshness algorithm.** Nothing here decides whether a
 * signature still holds. `currentStateOf` builds the record the signing path
 * builds, `resolvedStaleness` composes the same detection and the same
 * `normalizer_changed` resolution the sign CLI and the review sheet compose.
 * This module resolves paths, opens files and hands values over; a public
 * resolver that merely *happened* to implement equivalent comparisons would be
 * a second definition of freshness, and it would diverge in the direction where
 * the site and the review sheet disagree about the same signature.
 */

import 'server-only';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  computeClosure,
  currentStateOf,
  docsForSources,
  IntegrityFailureError,
  loadCorpus,
  loadPack,
  resolvedStaleness,
  verificationResultSchema,
} from '@datastrata/engine';
import type {
  CheckedFreshness,
  FreshnessResolver,
  KnowledgePack,
  LoadedCorpus,
  VerificationResult,
} from '@datastrata/engine';

/** The pack this site publishes. The engine itself is program-agnostic. */
const PACK_ID = 'csrd';

/**
 * Where the engine's state lives, relative to the process's working directory.
 *
 * The candidates are computed per call rather than frozen at module load: the
 * value they are built from is `process.cwd()`, and a constant captured at
 * import time silently answers for the directory the module happened to be
 * loaded in.
 */
function candidateRoots(): string[] {
  return [
    join(process.cwd(), '..', '..', 'backend', 'engine'),
    join(process.cwd(), 'backend', 'engine'),
  ];
}

/**
 * The one answer to "which repository am I reading?".
 *
 * Design §3.2. It is the **engine root**, not the pack directory, because the
 * resolver's inputs — corpus, ledger, registry, pinned results — hang off the
 * same root as the authored knowledge. Probing separately for the pack and for
 * the verification state would be two answers to one question, and they would
 * disagree exactly once, in production.
 */
export function engineRoot(): string {
  const candidates = candidateRoots();
  const found = candidates.find((root) => existsSync(join(root, 'knowledge', PACK_ID, 'pack.json')));
  if (found === undefined) {
    throw new Error(
      `CSRD knowledge pack not found. Looked for knowledge/${PACK_ID}/pack.json under:\n${candidates.join('\n')}\n` +
        'The site expects the engine at backend/engine relative to the repository root.',
    );
  }
  return found;
}

/** The four conventional locations, all derived from the one root. */
const packDirOf = (root: string): string => join(root, 'knowledge', PACK_ID);
const corpusDirOf = (root: string): string => join(root, 'corpus');
const verificationDirOf = (root: string): string => join(root, 'verification');
const resultPathOf = (root: string, packId: string, requirementId: string): string =>
  join(verificationDirOf(root), packId, requirementId, 'verification-result.json');

/** An integrity failure in the resolver's own terms, with the path that caused it. */
function integrityFailure(code: 'unresolved_gap' | 'invalid_result', detail: string): never {
  throw new IntegrityFailureError([{ code, detail }]);
}

/**
 * Reads and structurally validates the result a signature pinned.
 *
 * Absence is an integrity failure and not an empty answer.
 * `CurrentState.resultSha256` is non-nullable precisely so that "there is no
 * result" cannot be expressed as a freshness outcome: a signature over a result
 * the repository no longer holds is a damaged record, and reporting it as
 * merely stale would understate it.
 */
function readPinnedResult(root: string, packId: string, requirementId: string): VerificationResult {
  const path = resultPathOf(root, packId, requirementId);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    integrityFailure(
      'invalid_result',
      `no verification result at ${path}, but ${packId}/${requirementId} carries a governing signature over one`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    integrityFailure('invalid_result', `${path} is not valid JSON — ${String(error)}`);
  }

  const structural = verificationResultSchema.safeParse(parsed);
  if (!structural.success) {
    integrityFailure(
      'invalid_result',
      `${path} does not satisfy the verification-result schema — ${structural.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return structural.data;
}

/**
 * The site's freshness resolver: the deployed revision's verification state,
 * read through the engine's own primitives.
 *
 * **The corpus is loaded once, lazily.** Lazily because a repository with
 * nothing signed never reaches this code, and loading and re-hashing the whole
 * corpus to answer no questions would be a cost the public path pays for
 * nothing. Once because within a deployed process the corpus is immutable
 * (design §5) — the deployed unit is a revision, so re-reading gains no
 * freshness.
 *
 * **It throws rather than reporting ignorance.** `FreshnessResolver` returns
 * `CheckedFreshness`, so `{ checked: false }` is unrepresentable here by type:
 * *"I could not check"* and *"I did not check"* must not collapse into each
 * other. A missing result, an uncomputable closure or a pinned document the
 * corpus no longer holds are all damaged records, and each raises
 * `IntegrityFailureError` — which `/api/check` turns into a refusal, never into
 * a status.
 */
export function buildCsrdFreshnessResolver(root: string): FreshnessResolver {
  const corpusDir = corpusDirOf(root);
  let corpus: LoadedCorpus | undefined;

  return ({ packId, requirement, entry, renderContext }): CheckedFreshness => {
    corpus ??= loadCorpus(corpusDir);
    const loaded = corpus;

    let closure;
    try {
      closure = computeClosure(loaded.index, docsForSources(loaded.index, requirement.sources));
    } catch (error) {
      integrityFailure(
        'unresolved_gap',
        `the entitled closure for ${packId}/${requirement.id} cannot be computed: ${String(error)}`,
      );
    }

    // A pinned document the corpus no longer holds is tampering-shaped rather
    // than stale, and `deriveStaleness` deliberately contributes no reason for
    // it — the check belongs to the caller, and this is the caller.
    for (const pinned of entry.corpus) {
      if (!loaded.index.documents.some((document) => document.docId === pinned.docId)) {
        integrityFailure(
          'unresolved_gap',
          `${pinned.docId} is pinned by governing entry ${entry.entryId} but is absent from the corpus at ${corpusDir} — this is tampering-shaped, not staleness`,
        );
      }
    }

    const current = currentStateOf({
      requirement,
      renderContext,
      closure: { sha256: closure.sha256, docIds: closure.docIds },
      corpus: loaded,
      result: readPinnedResult(root, packId, requirement.id),
    });

    return { checked: true, reasons: resolvedStaleness(entry, current, loaded) };
  };
}

/**
 * The verification-aware pack for one engine root, memoised per root.
 *
 * **Keyed by the canonical root, never by a single module-level value.** The
 * parameter exists so a fixture repository and the real repository run the
 * *same* production path; a lone `cached ??= load(root)` would let whichever
 * root was loaded first govern every later call, and would make cross-root
 * tests pass or fail by test order rather than by behaviour. Production has one
 * root and one revision, so the map holds one entry there and the key never
 * earns its keep — which is the point: it costs nothing and it removes a class
 * of defect that is invisible until the day something else calls in.
 *
 * **Process-lifetime caching is justified by the deployment model, not
 * inherited from the pack cache** (design §5, §5.1). Within a deployed process
 * the ledger, corpus, registry and results are immutable, so re-reading them
 * gains no freshness. Should verification state ever become writable
 * independently of deployment, this strategy is invalid and must change before
 * that workflow ships — process lifetime is not a valid invalidation key for
 * state that can change under a running process.
 */
const packs = new Map<string, KnowledgePack>();

/** The same root spelled two ways must not be two cache entries. */
function cacheKey(root: string): string {
  try {
    return realpathSync(resolve(root));
  } catch {
    return resolve(root);
  }
}

export function loadVerifiedCsrdPack(root: string): KnowledgePack {
  const key = cacheKey(root);
  const hit = packs.get(key);
  if (hit !== undefined) return hit;

  const verificationDir = verificationDirOf(root);
  const pack = loadPack(packDirOf(root), {
    versionRegistryDir: join(verificationDir, 'requirement-versions'),
    ledgerPath: join(verificationDir, 'signatures.jsonl'),
    freshnessResolver: buildCsrdFreshnessResolver(root),
  });
  packs.set(key, pack);
  return pack;
}

/**
 * The pack, for every surface that has no opinion about which repository it is
 * reading — which is all of them in production.
 */
export function csrdPack(): KnowledgePack {
  return loadVerifiedCsrdPack(engineRoot());
}

export function sourceById(pack: KnowledgePack, id: string) {
  const s = pack.sources.find((x) => x.id === id);
  return s ? { id: s.id, title: s.title, url: s.url } : { id, title: id, url: '' };
}

/**
 * Every headline figure the site prints, derived from the pack rather than
 * written into copy. The mockup's "6 REGIMES READ / 14 OBLIGATIONS FOUND" were
 * placeholders and are deliberately not reproduced.
 */
export function packStats() {
  const pack = csrdPack();
  return {
    version: pack.version,
    legalSnapshot: pack.legalSnapshot,
    requirements: pack.requirements.length,
    inForce: pack.requirements.filter((r) => r.legalStatus === 'in_force').length,
    // Derived from the signature ledger by the loader — never asserted in the
    // authored content — with freshness resolved by `buildCsrdFreshnessResolver`
    // over the verification state in this deployed revision. It reads 0 while
    // the repository holds no signature, which is now a fact about the record
    // rather than a structural ceiling: a fresh governing signature moves it.
    ratified: pack.requirements.filter((r) => r.derivedStatus === 'ratified').length,
    sources: pack.sources.length,
    obligationTemplates: pack.obligationTemplates.length,
    questions: pack.questions.length,
    factTypes: pack.factTypes.length,
    pendingActs: pack.changeWatch.length,
    ratifiedCountryPacks: Object.keys(pack.catalogues.ratified_country_packs?.entries ?? {}).length,
  };
}

export interface ActMark {
  id: string;
  /** OJ year of the instrument, from its own number (2013/34, (EU) 2026/470...). */
  year: number;
  /** Short OJ reference, e.g. "2026/470". */
  ref: string;
  /** The name a reader recognises — "Omnibus I", "CSRD", "Stop-the-clock". */
  name: string;
  title: string;
}

export interface PendingMark {
  id: string;
  title: string;
  /** Adopted acts carry no OJ number precisely because they are not published yet. */
  note: string;
}

const OJ_NUMBER = /\b(?:\(EU\)\s*)?((?:19|20)\d{2})\/(\d+)/;

/**
 * The reader-facing name of an act, taken from the clause the pack's own source
 * title puts after the em-dash ("Directive (EU) 2026/470 — Omnibus I"). A number
 * like "2026/470" means nothing to a visitor; "Omnibus I" does.
 *
 * The short forms below are trims of those curated titles, not new claims:
 * 2025/794 is the Stop-the-clock Directive (adopted 14 Apr 2025) and 2025/1416
 * the ESRS quick-fix (11 Jul 2025) — both verified against the OJ record.
 */
const SHORTEN: [RegExp, string][] = [
  [/\(host instrument\)/i, ''],
  [/^EU Taxonomy Regulation$/i, 'EU Taxonomy'],
  [/^Taxonomy Article 8 disclosures$/i, 'Taxonomy Art. 8'],
  [/^stop-the-clock$/i, 'Stop-the-clock'],
];

function actName(title: string): string {
  const tail = title.split(/\s+—\s+/)[1] ?? title;
  let name = tail.trim();
  for (const [re, to] of SHORTEN) name = name.replace(re, to).trim();
  return name;
}

/**
 * The live trace's series — the legal record accumulating, act by act.
 *
 * Every mark is a real source in the pack. In-force instruments carry an OJ
 * number, so they can be placed on a year and counted cumulatively: that
 * accumulation IS the sediment the product is named for. Adopted-but-not-in-force
 * acts have no OJ number yet — which is exactly why they are drawn resting above
 * the record rather than raising it (product law 4: pending law never binds).
 */
export function traceSeries(): { acts: ActMark[]; pending: PendingMark[] } {
  const pack = csrdPack();
  const acts: ActMark[] = [];
  const pending: PendingMark[] = [];

  for (const s of pack.sources) {
    const inForce = /^in force/i.test(s.statusAtSnapshot);
    const m = OJ_NUMBER.exec(s.title);
    if (inForce && m) {
      acts.push({ id: s.id, year: Number(m[1]), ref: `${m[1]}/${m[2]}`, name: actName(s.title), title: s.title });
    } else if (/adopted/i.test(s.statusAtSnapshot) && /not in force|pending/i.test(s.statusAtSnapshot)) {
      pending.push({ id: s.id, title: actName(s.title) || s.title, note: 'no OJ number yet' });
    }
  }
  acts.sort((a, b) => a.year - b.year || a.ref.localeCompare(b.ref));
  return { acts, pending };
}

/**
 * The institutions whose records the pack is built from, counted from the
 * sources themselves. This is the honest version of a logo wall: we have no
 * customers to name, but we can say exactly whose official record we read.
 */
export function sourceInstitutions(): { name: string; detail: string; count: number }[] {
  const pack = csrdPack();
  const buckets: Record<string, { name: string; detail: string; count: number }> = {
    eurlex: { name: 'EUR-Lex', detail: 'The Official Journal, the legal record itself', count: 0 },
    commission: { name: 'European Commission', detail: 'Delegated acts, notices and explanatory information', count: 0 },
    efrag: { name: 'EFRAG', detail: 'Standard-setting and implementation guidance', count: 0 },
  };
  for (const s of pack.sources) {
    const host = new URL(s.url).hostname;
    if (host.includes('eur-lex')) buckets.eurlex.count += 1;
    else if (host.includes('efrag')) buckets.efrag.count += 1;
    else if (host.includes('europa.eu')) buckets.commission.count += 1;
  }
  return Object.values(buckets).filter((b) => b.count > 0).sort((a, b) => b.count - a.count);
}
