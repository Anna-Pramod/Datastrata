/**
 * Knowledge-pack loader + content firewall.
 *
 * Every pack is validated structurally (zod) and referentially before the
 * engine will touch it: unknown FactTypes, dangling source citations,
 * requirement_refs to nothing, obligation triggers pointing at missing
 * requirements — all are load-time errors, never runtime surprises. A
 * referenced FactType with no human label, an unresolved `labelNote`, or
 * (where it is compared numerically) no unit is the same kind of failure —
 * see `assertFactVocabularyCoverage` — so it is gated here too, not left to
 * surface downstream as a wrong-looking rendered sentence.
 * This is the first layer of "regression testing for law" (Pass 2 §4).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { AuthoredRequirement, Condition, KnowledgePack, Requirement } from '../types';
import { assertFactVocabularyCoverage } from '../verification/vocabulary';
import { requirementSha256 } from '../verification/canonical';
import { assertVersionIntegrity, parseVersionRegistry, VersionIntegrityError } from '../verification/registry';
import { governingEntry, parseLedger, type SigningEntry } from '../verification/ledger';
import { parseSourceRegister, verifyRequirementCitability } from '../monitoring/register';
import type { RenderContext } from '../verification/render';
import { sourceIdsOf } from './provenance';
import {
  deriveStatus,
  toStatusInput,
  type CheckedFreshness,
  type FreshnessAssessment,
} from '../verification/status';
import {
  catalogueSchema,
  factTypeSchema,
  gapTestSchema,
  manifestSchema,
  obligationTemplateSchema,
  questionSchema,
  requirementSchema,
  sourceRecordSchema,
} from './schema';

export class PackIntegrityError extends Error {
  constructor(public problems: string[]) {
    super(`Knowledge pack failed integrity checks:\n - ${problems.join('\n - ')}`);
  }
}

function collectFactRefs(c: Condition, into: Set<string>): void {
  switch (c.op) {
    case 'all':
    case 'any':
      c.of.forEach((x) => collectFactRefs(x, into));
      break;
    case 'not':
      collectFactRefs(c.of, into);
      break;
    case 'quantifier_any':
      collectFactRefs(c.where, into);
      break;
    case 'cmp':
    case 'eq':
    case 'in_set':
    case 'in_catalogue':
    case 'prefix_in':
    case 'exists':
    case 'count_cmp':
      into.add(c.fact);
      break;
    case 'sum_cmp':
      into.add(c.fact);
      break;
    case 'year_diff_lt':
      into.add(c.fromFact);
      break;
    default:
      break;
  }
}

function collectReqRefs(c: Condition, into: Set<string>): void {
  if (c.op === 'all' || c.op === 'any') c.of.forEach((x) => collectReqRefs(x, into));
  else if (c.op === 'not') collectReqRefs(c.of, into);
  else if (c.op === 'quantifier_any') collectReqRefs(c.where, into);
  else if (c.op === 'requirement_ref') into.add(c.requirement);
}

function collectCatalogueRefs(c: Condition, into: Set<string>): void {
  if (c.op === 'all' || c.op === 'any') c.of.forEach((x) => collectCatalogueRefs(x, into));
  else if (c.op === 'not') collectCatalogueRefs(c.of, into);
  else if (c.op === 'quantifier_any') collectCatalogueRefs(c.where, into);
  else if (c.op === 'in_catalogue') into.add(c.catalogue);
}

/**
 * Where the verification records live, relative to a pack directory.
 *
 * They sit under `verification/`, not beside the authored content they police
 * — a hash file or a signature ledger shelved next to regulatory knowledge
 * invites being read as knowledge. Packs live at `<engine>/knowledge/<packId>`,
 * so the directory is two levels up. The convention is expressed once, here,
 * and each path can be overridden per call rather than re-derived at each call
 * site.
 */
function defaultVerificationDir(packDir: string): string {
  return join(packDir, '..', '..', 'verification');
}

/** `verification/requirement-versions/<packId>.json` — the version registry. */
function defaultVersionRegistryDir(packDir: string): string {
  return join(defaultVerificationDir(packDir), 'requirement-versions');
}

/** The append-only signature ledger, under the same `verification/` root. */
function defaultLedgerPath(packDir: string): string {
  return join(defaultVerificationDir(packDir), 'signatures.jsonl');
}

function readRegisterFile(dir: string): unknown {
  return JSON.parse(readFileSync(join(dir, 'source-register.json'), 'utf8'));
}

/** `monitoring/` — the surface register, beside `knowledge/`. */
function defaultSourceRegisterDir(packDir: string): string {
  return join(packDir, '..', '..', 'monitoring');
}

/**
 * Everything the loader hands a resolver, and deliberately nothing more.
 *
 * The requirement is the **authored** shape: derived verification status is not
 * an input to the content whose verification status is being established, and
 * the type is what says so rather than a comment.
 *
 * `renderContext` is here because a live resolver has to compare the entry's
 * pinned `conditionSha256` and `renderedConditionSha256` against *current*
 * values, which means calling `candidateConditionSha256(requirement)` and
 * `candidateRenderedConditionSha256(requirement, ctx)`. Were only the entry
 * supplied, obtaining those current values would mean loading the very pack
 * whose statuses are being resolved — a recursive `loadPack()`.
 *
 * **This is not "everything the resolver needs".** The loader supplies the
 * pack-local deterministic inputs; the resolver closes over the external
 * verification state it owns — corpus, result storage, verification paths.
 * That division is the whole reason `loadPack` acquires no corpus or result
 * I/O, and describing the input the other way is how someone later justifies
 * adding exactly that.
 */
export interface FreshnessResolverInput {
  packId: string;
  /** The authored requirement, before any status is attached. */
  requirement: AuthoredRequirement;
  /** The governing entry whose freshness is in question. */
  entry: SigningEntry;
  /** `{ factTypes, catalogues }` from the pack being assembled. */
  renderContext: RenderContext;
}

/**
 * Answers "was this signature's freshness evaluated, and what was found?".
 *
 * It returns `CheckedFreshness` and never `FreshnessAssessment`, so no resolver
 * outcome can produce `{ checked: false }`. That value keeps exactly one
 * provenance — a caller deliberately did not supply a resolver — which is what
 * stops *"I could not check"* and *"I did not check"* from collapsing into one
 * another. A resolver that cannot complete its check throws; it does not report
 * ignorance, and this loader does not convert one into the other.
 */
export type FreshnessResolver = (input: FreshnessResolverInput) => CheckedFreshness;

export interface LoadPackOptions {
  /** Overrides the directory holding `<packId>.json`. Defaults to the convention above. */
  versionRegistryDir?: string;
  /** Overrides `verification/signatures.jsonl`. An absent file is an empty ledger. */
  ledgerPath?: string;
  /**
   * Evaluates the freshness of each governing signature. Absent means nothing
   * was evaluated, which loads as `draft, ['freshness_unchecked']` — never as
   * the signature's own `kind`.
   */
  freshnessResolver?: FreshnessResolver;
  /**
   * Overrides the directory holding `source-register.json`. Defaults to the
   * convention above.
   *
   * **An absent register is a load failure**, not a skipped check: the register
   * is where requirement-side citability is decided, and a check that switches
   * itself off when its input is missing is not a check. This paragraph
   * previously said the opposite — *"an absent register file is not a failure —
   * many packs are built in temporary directories with no monitoring tree"* —
   * and that convenience was the defect: `monitoring/` reached no deployed
   * artifact, so the public site skipped citability entirely. A temporary world
   * that means to be a runtime world now installs a register
   * (`test/world-register.ts`); one that means to test the absence asserts
   * `SourceRegisterMissingError`.
   */
  sourceRegisterDir?: string;
}

/**
 * Every requirement's status, projected from the ledger at load time.
 *
 * **The loader answers from the ledger, and about freshness it answers only
 * what it was told.** Staleness is the other axis of the projection, and
 * computing it needs the corpus, the rendered condition and the pinned
 * verification result — none of which `loadPack` reads, and none of which it
 * may acquire. So the loader does not compute freshness; it takes a resolver
 * that owns that external state, and where no resolver is supplied it says so.
 * `{ checked: false }` is the only value it can honestly produce on its own,
 * and it produces `draft, ['freshness_unchecked']` rather than the signature's
 * own `kind`. Until this seam existed the loader passed
 * `{ checked: true, reasons: [] }` — *"I checked and nothing is stale"* —
 * having checked nothing, which meant the moment the ledger held a signature
 * that had since gone stale, the public site would have called it `verified`.
 *
 * An absent ledger file is an empty ledger: nothing has been signed, so every
 * requirement is `draft` with no reasons. A ledger that exists but cannot be
 * parsed is **not** treated as empty — `parseLedger` throws and the load fails,
 * because a damaged history reading as "nothing signed" is the one failure mode
 * an append-only record exists to prevent. That call sits above the map, so a
 * damaged history is settled before any authority is resolved and before a
 * resolver could be reached: a damaged ledger is not the resolver's to
 * discover, and must not be folded into its integrity failures.
 *
 * **The resolver is asked only where the question has meaning.** An unsigned
 * requirement has no signature for freshness to be about, and a revocation's
 * freshness is irrelevant — only a fresh signature restores authority, never
 * the world settling back down. Both would cost real work to produce a value
 * `deriveStatus` discards, so neither branch calls it.
 *
 * **There is deliberately no `try` around the resolver.** A resolver throws
 * when trusted material is missing or damaged, and catching that to substitute
 * `{ checked: false }` would turn *"I checked and the record is broken"* into
 * *"I have not checked"* — the one conversion §5 of the design forbids. A
 * caller further out can still catch and lie, but that now takes visible code a
 * reviewer can see rather than a silent fallback here.
 */
function attachDerivedStatus(
  packId: string,
  requirements: AuthoredRequirement[],
  ledgerFile: string,
  renderContext: RenderContext,
  freshnessResolver?: FreshnessResolver,
): Requirement[] {
  let text: string;
  try {
    text = readFileSync(ledgerFile, 'utf8');
  } catch {
    text = '';
  }
  const entries = parseLedger(text);
  // `sources` is attached here, beside the status, because both are projections
  // over authored knowledge rather than authored knowledge itself. Doing it in
  // one place keeps `sourceIdsOf` the only derivation and keeps the projected
  // field out of `requirementSchema.parse()`'s output — and therefore out of
  // `requirementSha256`, exactly as `derivedStatus` is kept out.
  const projected = (r: AuthoredRequirement) => ({ ...r, sources: sourceIdsOf(r) });
  return requirements.map((r) => {
    const governing = governingEntry(entries, packId, r.id);
    if (governing === null) return { ...projected(r), ...deriveStatus(toStatusInput(null)) };
    if (governing.kind === 'revoked') return { ...projected(r), ...deriveStatus(toStatusInput(governing)) };
    // The assessment goes in unexamined and unmodified: it is the whole of what
    // the resolver found, and second-guessing any part of it here would create
    // a quietly different opinion about the same question.
    const freshness: FreshnessAssessment =
      freshnessResolver === undefined
        ? { checked: false }
        : freshnessResolver({ packId, requirement: r, entry: governing, renderContext });
    return { ...projected(r), ...deriveStatus(toStatusInput(governing, freshness)) };
  });
}

/**
 * Reads the registry and asserts every requirement still hashes to the digest
 * recorded against its declared `version`.
 *
 * A missing registry file is a failure rather than a skipped check. Treating
 * absence as "nothing to verify" would mean the one action that disables
 * version integrity everywhere — deleting a file — is also the one action
 * that produces no complaint, and an integrity check that can be switched off
 * by accident is not an integrity check.
 */
function assertRequirementVersions(pack: KnowledgePack, registryDir: string): void {
  const path = join(registryDir, `${pack.id}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new VersionIntegrityError([
      `no version registry for pack ${pack.id} at ${path} — every requirement's version is unverifiable without it`,
    ]);
  }
  assertVersionIntegrity(pack.requirements, parseVersionRegistry(JSON.parse(raw)), requirementSha256);
}

export function loadPack(dir: string, options: LoadPackOptions = {}): KnowledgePack {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

  const m = manifestSchema.parse(read('pack.json'));

  // Raw as well as parsed: zod strips unknown keys, so a deleted authored field
  // such as `ratification` is invisible in the parsed record and has to be
  // looked for in what the file actually said. `verifyIntegrity` below is
  // handed this array and not `pack.requirements`.
  const rawRequirements: unknown[] = read('requirements.json');

  // Staged before construction rather than parsed inside the object literal.
  // Object literal properties evaluate in order, and `attachDerivedStatus` ran
  // at `requirements:` while `catalogues:` was parsed four properties later —
  // so the render context a resolver needs did not yet exist at the moment
  // status was attached. Beyond making the resolver possible, the staging says
  // something the old shape obscured: status attachment is a projection over
  // already-parsed authored knowledge, not a step halfway through building the
  // pack.
  const sources = z.array(sourceRecordSchema).parse(read('sources.json'));
  const factTypes = z.array(factTypeSchema).parse(read('fact-types.json'));
  const catalogues = z.record(catalogueSchema).parse(read('catalogues.json'));
  const authoredRequirements = z.array(requirementSchema).parse(rawRequirements);

  const renderContext: RenderContext = { factTypes, catalogues };

  const requirements = attachDerivedStatus(
    m.id,
    authoredRequirements,
    options.ledgerPath ?? defaultLedgerPath(dir),
    renderContext,
    options.freshnessResolver,
  );

  const pack: KnowledgePack = {
    ...m,
    sources,
    factTypes,
    requirements,
    obligationTemplates: z.array(obligationTemplateSchema).parse(read('obligation-templates.json')),
    gapTests: z.array(gapTestSchema).parse(read('gap-tests.json')),
    questions: z.array(questionSchema).parse(read('questionnaire.json')),
    catalogues,
  };
  refuseAuthoredDerivedFields(rawRequirements);
  verifyIntegrity(pack, rawRequirements);

  // Requirement-side citability, on the production load path.
  //
  // `verifyRequirementCitability` asks whether the register permits each cited
  // source to back a determination — the question the pack-side firewall does
  // not ask. It runs here, in the loader every production entry point goes
  // through (`readWorld`, the review sheet, the public site), rather than only
  // in `loadSourceRegister`, which nothing calls yet.
  //
  // **An absent register refuses, and this is the second time that rule has had
  // to be learned in this file.** The check was originally guarded by
  // `existsSync`, so a pack loaded where no register sat was answered as though
  // every citation were permitted. That is the shape `assertRequirementVersions`
  // rejects sixty lines below for the same reason: an integrity check that can
  // be switched off by deleting a file is not an integrity check. It was not
  // hypothetical — `monitoring/` was not in the deployable closure, so the
  // deployed site skipped citability entirely while the comment above claimed
  // it ran there. The register is now a declared runtime input
  // (`frontend/web/verification-runtime-inputs.mjs`, member
  // `source-authority-register`).
  //
  // **Two states, deliberately not conflated.** A *missing register* is a
  // missing integrity dependency and refuses here, before any policy runs. A
  // *present register that carries no governing authority for some source* is a
  // different thing — an explicit, settled fallback path that
  // `verifyRequirementCitability` and the host rule evaluate on their own terms
  // until Task 5 replaces them. Falling through to the host rule when the
  // register itself is absent would let a fallback pretend to decide a question
  // nothing had the evidence to answer.
  //
  // **Boundary with Task 5.** This establishes whether a *source* may be cited.
  // Whether a corpus *artefact* is an authorised origin for the source it claims
  // to serve is `AuthorisedCorpus`, and is not decided here.
  const registerDir = options.sourceRegisterDir ?? defaultSourceRegisterDir(dir);
  const registerPath = join(registerDir, 'source-register.json');
  if (!existsSync(registerPath)) {
    throw new SourceRegisterMissingError(registerPath, pack.id);
  }
  verifyRequirementCitability(parseSourceRegister(readRegisterFile(registerDir)), pack);
  assertFactVocabularyCoverage(pack);
  assertRequirementVersions(pack, options.versionRegistryDir ?? defaultVersionRegistryDir(dir));
  return pack;
}

/**
 * Refuses a requirement that still authors a field the loader now derives.
 *
 * **Raw records only, and that is the whole point.** `requirementSchema` is not
 * `.strict()`, so a field it no longer declares is stripped in silence: it
 * would be invisible in the parsed pack, invisible to `requirementSha256`, and
 * invisible to a reviewer reading the loaded object — while sitting in the file
 * looking authoritative. A leftover `sources` is a second authored answer to
 * the question `provenance` now owns, and nothing would say which wins.
 *
 * It cannot live in `verifyIntegrity`, whose default subject is
 * `pack.requirements` — those are *projected*, and the projection attaches
 * `sources` deliberately. Checking them would refuse every correctly loaded
 * pack. `ratification` is different and stays there: nothing attaches it, so
 * the raw and projected shapes agree.
 */
/**
 * The source register a pack's citability check depends on is not there.
 *
 * Its own error rather than a `PackIntegrityError` so a caller — and a test —
 * can tell "the integrity dependency is missing" apart from "the pack is
 * internally wrong". They call for different repairs: one is a packaging or
 * deployment fault, the other an authoring fault.
 */
export class SourceRegisterMissingError extends Error {
  constructor(
    readonly path: string,
    readonly packId: string,
  ) {
    super(
      `no source register at ${path} — pack ${packId} cannot be loaded without it, ` +
        'because requirement-side citability is checked against it on every load and a ' +
        'check that skips itself when its input is missing is not a check. If this is a ' +
        'deployed artifact, the `source-authority-register` runtime input did not reach it.',
    );
    this.name = 'SourceRegisterMissingError';
  }
}

export function refuseAuthoredDerivedFields(rawRequirements: readonly unknown[]): void {
  const derived: Array<{ field: string; why: string }> = [
    {
      field: 'sources',
      why: 'the cited source set is derived from `provenance` and may not be authored; delete the field',
    },
    {
      field: 'provisions',
      why: 'provision citations moved into `provenance[].locators`; delete the field',
    },
  ];
  const problems: string[] = [];
  for (const record of rawRequirements) {
    if (typeof record !== 'object' || record === null) continue;
    const id = (record as { id?: unknown }).id;
    const named = typeof id === 'string' ? id : 'a requirement';
    for (const { field, why } of derived) {
      if (field in record) problems.push(`${named}: carries an authored \`${field}\` field — ${why}`);
    }
  }
  if (problems.length > 0) throw new PackIntegrityError(problems);
}

/**
 * Referential integrity, plus the one check the schema cannot make.
 *
 * `authored` is the requirement records **as the file wrote them**, before zod
 * stripped what it does not declare. It matters for exactly one rule: a
 * `ratification` left behind after status became derived would otherwise be
 * discarded in silence, since `requirementSchema` is not `.strict()` and the
 * content hash is taken over the parsed record. Verified during the migration —
 * dropping the field from the schema produced the same `requirementSha256`
 * whether or not the data still carried it, so nothing else in the system can
 * see the leftover.
 *
 * It defaults to `pack.requirements`, so a pack object constructed in code
 * rather than read from disk is checked on the same rule.
 */
export function verifyIntegrity(pack: KnowledgePack, authored: readonly unknown[] = pack.requirements): void {
  const problems: string[] = [];
  const sourceIds = new Set(pack.sources.map((s) => s.id));

  for (const record of authored) {
    if (typeof record !== 'object' || record === null || !('ratification' in record)) continue;
    const id = (record as { id?: unknown }).id;
    problems.push(
      `${typeof id === 'string' ? id : 'a requirement'}: carries an asserted \`ratification\` field — ` +
        'status is derived from the signature ledger and may not be authored; delete the field',
    );
  }

  const factIds = new Set(pack.factTypes.map((f) => f.id));
  const reqIds = new Set(pack.requirements.map((r) => r.id));
  const tplIds = new Set(pack.obligationTemplates.map((t) => t.id));

  for (const r of pack.requirements) {
    for (const s of sourceIdsOf(r)) if (!sourceIds.has(s)) problems.push(`${r.id}: cites unknown source ${s}`);
    if (r.kind === 'boolean' && !r.condition) problems.push(`${r.id}: boolean requirement missing condition`);
    if (r.kind === 'selection' && (!r.cases || r.cases.length === 0)) problems.push(`${r.id}: selection requirement missing cases`);
    const conds = [
      ...(r.condition ? [r.condition] : []),
      ...(r.cases ?? []).map((c) => c.when),
    ];
    for (const c of conds) {
      const facts = new Set<string>();
      const refs = new Set<string>();
      const cats = new Set<string>();
      collectFactRefs(c, facts);
      collectReqRefs(c, refs);
      collectCatalogueRefs(c, cats);
      for (const f of facts) if (!factIds.has(f)) problems.push(`${r.id}: references unknown FactType ${f}`);
      for (const ref of refs) if (!reqIds.has(ref)) problems.push(`${r.id}: requirement_ref to unknown requirement ${ref}`);
      for (const cat of cats) if (!pack.catalogues[cat]) problems.push(`${r.id}: references unknown catalogue ${cat}`);
    }
    for (const t of r.obligationTemplates ?? []) if (!tplIds.has(t)) problems.push(`${r.id}: references unknown obligation template ${t}`);
  }

  for (const t of pack.obligationTemplates) {
    for (const ref of [...(t.trigger.allOf ?? []), ...(t.trigger.anyOf ?? [])]) {
      if (!reqIds.has(ref)) problems.push(`${t.id}: trigger references unknown requirement ${ref}`);
    }
    if ((t.trigger.allOf ?? []).length === 0 && (t.trigger.anyOf ?? []).length === 0) {
      problems.push(`${t.id}: has no trigger — obligations must derive from determinations`);
    }
  }

  for (const g of pack.gapTests) {
    if (!tplIds.has(g.obligationTemplate)) problems.push(`${g.id}: references unknown obligation template ${g.obligationTemplate}`);
    if (g.readinessFact && !factIds.has(g.readinessFact)) problems.push(`${g.id}: references unknown FactType ${g.readinessFact}`);
  }

  for (const q of pack.questions) {
    for (const f of q.factTypes) if (!factIds.has(f)) problems.push(`${q.id}: references unknown FactType ${f}`);
  }

  for (const w of pack.changeWatch) {
    for (const r of w.affectsRequirements) if (!reqIds.has(r)) problems.push(`${w.id}: affects unknown requirement ${r}`);
    for (const s of w.sources) if (!sourceIds.has(s)) problems.push(`${w.id}: cites unknown source ${s}`);
  }

  if (problems.length > 0) throw new PackIntegrityError(problems);
}
