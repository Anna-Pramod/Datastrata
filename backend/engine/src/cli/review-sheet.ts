/**
 * The review sheet — the surface a human actually decides on.
 *
 * Factory §4.6 states the requirement in five words: **the reviewer never opens
 * JSON**. Everything else in the verification factory produces machine-readable
 * artefacts for machines to compare; this file produces the one artefact whose
 * only consumer is a person, and it is the last thing that stands between a
 * dossier and a signature. So its failure mode is not a wrong number. It is a
 * *quiet* one.
 *
 * **Absence is stated, never omitted.** A requirement with no signature, no
 * verification result, no golden profile or no obligation gets a printed
 * "none". An omitted section reads as a section that passed — the reviewer
 * scans for problems and finds nothing, which is indistinguishable from finding
 * nothing wrong. This is the same discipline `absence` evidence follows in the
 * corpus: a claim has to be visible to be checkable. Every "none" in this file
 * is load-bearing for that reason, not a nicety.
 *
 * **Benchmark metrics are B3's, and are labelled rather than faked.** The sheet
 * resolves the `pipelineVersion` bound to a requirement's *signature* through
 * its promotion record — never whichever live run happened most recently, which
 * is precisely the substitution §5.1 exists to prevent. Until B3 lands, a
 * promotion record carries no metrics at all, so the block prints that it
 * carries none. Printing nothing would leave the reviewer to assume the
 * pipeline had been measured.
 *
 * **The English is the renderer's, never this file's.** `renderRequirement` is
 * called; no phrase is re-derived here. That identity is the whole reason
 * `renderedConditionSha256` is worth pinning into a signature: prosecutors
 * argued against that text, the signature hashes that text, and the reviewer
 * reads that text. Task 4's note is the trap — `renderCondition` and
 * `renderRequirement` produce *different* output from the same input, and
 * `renderCondition` cannot be called on a `selection` requirement at all — so
 * the sheet goes through `candidateRenderedConditionSha256`'s own renderer and
 * prints the hash beside the text, which is what makes the agreement checkable
 * by eye as well as by test.
 *
 * **`normalizer_changed` is resolved before display, and this is where that
 * work pays off.** Task 4 found its own post-write use vacuous: a freshly
 * written candidate takes its pins from the current corpus, so pinned and
 * current `normalizerVersion` always agree there. The live cost is entirely
 * here. A sheet showing raw `normalizer_changed` against every requirement in
 * the pack after a normalizer bump — on a day when no law moved — is the
 * alarm-fatigue failure in its most visible form, and a reviewer who learns to
 * scroll past the banner has lost the banner. So `resolvedStaleness` from the
 * sign CLI is reused rather than reimplemented: one resolver, one answer.
 *
 * **Staleness is only computable where a signature exists and its result is on
 * disk.** `CurrentState.resultSha256` is non-nullable by design, so a governing
 * signature whose pinned result has vanished has no derivable staleness and
 * therefore no derivable status. That is §4.4's `INTEGRITY_FAILURE`, and the
 * sheet reports it as one instead of quietly showing `verified` over a dossier
 * nobody can find.
 *
 * **Reads widely; writes exactly one file.** The generator never writes into
 * `test/` or `verification/` and refuses an `--out` that would, because a
 * generated artifact landing among the append-only records is the one mistake
 * that cannot be undone by regenerating.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { ClosureEntryNotFoundError, computeClosure, docsForSources } from '../corpus/closure';
import { loadCorpus, type LoadedCorpus } from '../corpus/store';
import { CorpusIntegrityError } from '../corpus/schema';
import { authoriseCorpus, CorpusAuthorityError, type AuthorisedCorpus } from '../corpus/authority';
import { EntitledClosure } from '../pipeline/entitlement';
import type { SourceRegister } from '../monitoring/types';
import type { CorpusDocument } from '../corpus/types';
import { loadPackContext, PackIntegrityError } from '../knowledge/loader';
import type {
  KnowledgePack,
  ObligationTemplate,
  Question,
  Requirement,
} from '../types';
import { currentStateOf } from '../verification/current-state';
import { evidenceSetsOf } from '../verification/evidence-sets';
import type { EvidenceItem } from '../corpus/evidence';
import {
  governingEntry,
  type LedgerEntry,
  type RevocationEntry,
  type SigningEntry,
} from '../verification/ledger';
import {
  parsePromotions,
  PromotionsIntegrityError,
  type PromotionRecord,
} from '../verification/promotions';
import { RENDERER_VERSION, renderRequirement, type RenderContext } from '../verification/render';
import { VersionIntegrityError } from '../verification/registry';
import { verificationResultSchema, type VerificationResult } from '../verification/result';
import { candidateRenderedConditionSha256 } from '../verification/sign';
import { BLOCKING, type CurrentState, type StalenessReason } from '../verification/staleness';
import { deriveStatus, toStatusInput, type RequirementStatus } from '../verification/status';
import { factLabel, factsReferencedBy } from '../verification/vocabulary';
import { sourceIdsOf } from '../knowledge/provenance';
import { cliFailure, outcomeFor, readLedgerOrFail, resolvedStaleness, type VerifyPaths } from './sign';
import {
  EXIT_INTEGRITY_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  type CliOutcome,
} from './exit-codes';

/**
 * The sentence factory §4.6 obliges until B3 exists.
 *
 * A constant so the three places that print it cannot drift into three
 * different promises about the same missing thing.
 */
const NO_BENCHMARK_METRICS =
  'no benchmark metrics — pipeline promotion records carry none until B3';

/** Every staleness reason, in a fixed order, so the header table has stable rows. */
const ALL_STALENESS_REASONS: readonly StalenessReason[] = [
  'source_reissued',
  'stale_source_text',
  'stale_encoding',
  'stale_render',
  'stale_closure',
  'stale_result',
  'normalizer_changed',
];

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * What the sheet reads and writes, on top of what the signing CLIs need.
 *
 * `goldenProfilesPath` is the golden-profile suite's **source file**, and
 * pointing a generator at a test file deserves the explanation. §4.6 requires
 * the sheet to name the golden profiles exercising each rule, and the profiles
 * exist only as `describe` blocks in that suite — there is no separate registry
 * to consult. Passing the path in, rather than hardcoding it, is what keeps the
 * dependency visible and lets a test point somewhere else. The parse below is
 * program-agnostic: it looks for the *pack's own* requirement ids inside each
 * block, so it carries no knowledge of any regulation.
 */
export interface SheetPaths extends VerifyPaths {
  goldenProfilesPath: string;
  /** Where the HTML lands. Never inside `test/` or `verification/`. */
  outPath: string;
}

export interface SheetArgs {
  packId: string;
}

// ---------------------------------------------------------------------------
// The model — everything the sheet says, as data
// ---------------------------------------------------------------------------

/** One evidence quote, resolved against the corpus the reviewer can open. */
export interface SheetEvidence {
  /** `quote`, `amendment_chain`, `cross_reference` or `absence`. */
  kind: string;
  docIds: string[];
  /** The corpus documents behind those ids, where the corpus holds them. */
  documents: Array<{ docId: string; title: string; url: string; versionLabel: string } | { docId: string; missing: true }>;
  /** The quoted text, or the searched-for term for an `absence` claim. */
  text: string;
}

/** One conclusion and the evidence under it. */
export interface SheetEvidenceSet {
  label: string;
  statement: string;
  items: SheetEvidence[];
}

/** The pipeline bound to this requirement's signature, and what promoted it. */
export interface SheetBenchmark {
  pipelineVersion: string | null;
  promotion: PromotionRecord | null;
}

export interface SheetRequirement {
  id: string;
  title: string;
  plainEnglish: string;
  version: number;
  legalStatus: string;
  /** The `SRC-###` records the requirement cites, as authored. */
  sources: string[];
  /** `null` when staleness — and therefore status — cannot be derived at all. */
  status: RequirementStatus | null;
  /** The resolved staleness set. Empty for an unsigned or revoked requirement. */
  staleness: StalenessReason[];
  /** §4.4's category, kept apart from staleness and stated loudly. */
  integrityProblems: string[];
  governing: LedgerEntry | null;
  signature: SigningEntry | null;
  revocation: RevocationEntry | null;
  /** `renderRequirement`'s output — the exact English a signature hashes. */
  renderedCondition: string;
  renderedConditionSha256: string;
  result: VerificationResult | null;
  /** Why there is no result, when there is none. */
  resultProblem: string | null;
  evidence: SheetEvidenceSet[];
  facts: Array<{ factType: string; label: string; questions: Question[] }>;
  obligations: ObligationTemplate[];
  goldenProfiles: string[];
  benchmark: SheetBenchmark;
  closureDocIds: string[];
  closureProblem: string | null;
}

export interface SheetModel {
  packId: string;
  packVersion: string;
  legalSnapshot: string;
  rendererVersion: string;
  requirements: SheetRequirement[];
  /** Stated when the golden-profile suite could not be read at all. */
  goldenProfilesProblem: string | null;
}

// ---------------------------------------------------------------------------
// Golden profiles, parsed out of the suite that defines them
// ---------------------------------------------------------------------------

/**
 * Which golden profiles exercise which requirement.
 *
 * A profile is a top-level `describe('<label>', …)` block in the golden-profile
 * suite, and it exercises every requirement id that appears anywhere inside it.
 * The ids come from the caller — the pack's own — so this function names no
 * regulation and needs no pattern for one.
 *
 * Blocks are found by `\ndescribe(` rather than by a general search, which
 * confines the match to column zero and so to the top-level suites. A nested
 * `describe` would be attributed to its parent, which is the right answer for a
 * sheet naming *profiles*: the parent is the profile.
 */
export function goldenProfilesByRequirement(
  source: string,
  requirementIds: readonly string[],
): Map<string, string[]> {
  const byRequirement = new Map<string, string[]>();
  for (const id of requirementIds) byRequirement.set(id, []);

  // `split` on the marker: segment 0 is whatever precedes the first block.
  const segments = `\n${source}`.split('\ndescribe(');
  for (const segment of segments.slice(1)) {
    const quoted = /^(['"`])([\s\S]*?)\1/.exec(segment);
    if (quoted === null) continue;
    const label = quoted[2];
    if (label === undefined) continue;
    for (const id of requirementIds) {
      if (segment.includes(id)) byRequirement.get(id)?.push(label);
    }
  }
  return byRequirement;
}

// ---------------------------------------------------------------------------
// Reading the world
// ---------------------------------------------------------------------------

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** `verification/<packId>/<requirementId>/verification-result.json`. */
function resultPathFor(paths: SheetPaths, packId: string, requirementId: string): string {
  return resolve(paths.verificationDir, packId, requirementId, 'verification-result.json');
}

/**
 * Reads one requirement's result, or says why there is none.
 *
 * Structure only, and a failure is reported rather than thrown: a sheet that
 * refused to render because one dossier of sixteen is malformed would hide the
 * fifteen a reviewer could still act on, and the malformed one is exactly what
 * they need to be told about.
 */
function readResult(
  paths: SheetPaths,
  packId: string,
  requirementId: string,
): { result: VerificationResult | null; problem: string | null } {
  const path = resultPathFor(paths, packId, requirementId);
  const raw = readIfPresent(path);
  if (raw === null) {
    return { result: null, problem: `none — no verification result on disk at ${path}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { result: null, problem: `none — ${path} is not valid JSON: ${detail}` };
  }
  const structural = verificationResultSchema.safeParse(parsed);
  if (!structural.success) {
    const detail = structural.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    return { result: null, problem: `none — ${path} does not satisfy the result schema: ${detail}` };
  }
  return { result: structural.data, problem: null };
}

function readPromotionsOrFail(paths: SheetPaths): PromotionRecord[] {
  const text = readIfPresent(resolve(paths.verificationDir, 'promotions.jsonl')) ?? '';
  try {
    return parsePromotions(text);
  } catch (error) {
    if (error instanceof PromotionsIntegrityError) {
      throw cliFailure(EXIT_INTEGRITY_FAILURE, [
        'INTEGRITY FAILURE — the promotion ledger cannot be read.',
        ...error.problems.map((problem) => `  - ${problem}`),
      ]);
    }
    throw error;
  }
}

/** Every evidence item's docIds, whatever shape the item takes. */
function evidenceDocIds(item: EvidenceItem): string[] {
  switch (item.kind) {
    case 'quote':
      return [item.docId];
    case 'amendment_chain':
      return item.hops.map((hop) => hop.quote.docId);
    case 'cross_reference':
      return [item.from.docId, item.to.docId];
    case 'absence':
      return [...item.docIds];
  }
}

/** The text worth showing for an evidence item. */
function evidenceText(item: EvidenceItem): string {
  switch (item.kind) {
    case 'quote':
      return item.text;
    case 'amendment_chain':
      return item.hops.map((hop) => `${hop.edgeId}: ${hop.quote.text}`).join('\n');
    case 'cross_reference':
      return `${item.from.text}\n  ↳ (${item.edgeId}) ${item.to.text}`;
    case 'absence':
      return `searched for "${item.term}" and did not find it`;
  }
}

function describeEvidence(item: EvidenceItem, corpus: LoadedCorpus): SheetEvidence {
  const docIds = evidenceDocIds(item);
  return {
    kind: item.kind,
    docIds,
    documents: docIds.map((docId) => {
      let document: CorpusDocument;
      try {
        document = corpus.document(docId);
      } catch {
        return { docId, missing: true as const };
      }
      return {
        docId,
        title: document.title,
        url: document.url,
        versionLabel: document.versionLabel,
      };
    }),
    text: evidenceText(item),
  };
}

/**
 * Assembles the whole model, reading everything once.
 *
 * The order matters in one place: the ledger is read through the sign CLI's own
 * `readLedgerOrFail`, so an unreadable history is **forensics required** here
 * exactly as it is there. A sheet generated over a ledger nobody can parse
 * would be a confident-looking document built on a file whose contents are in
 * question, which is worse than no sheet.
 */
export function gatherSheet(packId: string, paths: SheetPaths): SheetModel {
  let pack: KnowledgePack;
  let sourceRegister: SourceRegister;
  try {
    // The context, so the register authorising the corpus below is the one
    // whose integrity was checked against this pack.
    ({ pack, sourceRegister } = loadPackContext(paths.packDir, {
      versionRegistryDir: resolve(paths.verificationDir, 'requirement-versions'),
    }));
  } catch (error) {
    if (error instanceof VersionIntegrityError || error instanceof PackIntegrityError) {
      throw cliFailure(EXIT_INTEGRITY_FAILURE, [
        'INTEGRITY FAILURE — the knowledge pack does not load.',
        ...error.problems.map((problem) => `  - ${problem}`),
      ]);
    }
    throw error;
  }

  if (pack.id !== packId) {
    throw cliFailure(EXIT_USAGE, [
      `Usage: ${paths.packDir} holds pack ${pack.id}, but ${packId} was named.`,
    ]);
  }

  let corpus: LoadedCorpus & AuthorisedCorpus;
  try {
    // Loaded, then authorised — the review sheet reports closure documents and
    // digests, so an unauthorised document reaching it would be reported as
    // evidence a requirement rests on.
    corpus = authoriseCorpus(loadCorpus(paths.corpusDir), sourceRegister, pack);
  } catch (error) {
    if (error instanceof CorpusIntegrityError) {
      throw cliFailure(EXIT_INTEGRITY_FAILURE, [
        'INTEGRITY FAILURE — the corpus does not load.',
        ...error.problems.map((problem) => `  - ${problem}`),
      ]);
    }
    if (error instanceof CorpusAuthorityError) {
      throw cliFailure(EXIT_INTEGRITY_FAILURE, [
        'INTEGRITY FAILURE — the corpus is not authorised for the sources it claims.',
        ...error.failures.map((f) => `  - ${f.docId} claims ${f.sourceId} with origin ${f.url} — ${f.reason}`),
      ]);
    }
    throw error;
  }

  const entries: LedgerEntry[] = readLedgerOrFail(paths);
  const promotions = readPromotionsOrFail(paths);

  const goldenSource = readIfPresent(paths.goldenProfilesPath);
  const goldenProfiles =
    goldenSource === null
      ? new Map<string, string[]>()
      : goldenProfilesByRequirement(
          goldenSource,
          pack.requirements.map((r) => r.id),
        );

  const renderCtx: RenderContext = { factTypes: pack.factTypes, catalogues: pack.catalogues };
  const heldDocIds = new Set(corpus.index.documents.map((d) => d.docId));

  const requirements = pack.requirements.map((requirement) =>
    gatherRequirement({
      requirement,
      pack,
      packId,
      paths,
      corpus,
      sourceRegister,
      heldDocIds,
      entries,
      promotions,
      renderCtx,
      goldenProfiles: goldenProfiles.get(requirement.id) ?? [],
    }),
  );

  return {
    packId,
    packVersion: pack.version,
    legalSnapshot: pack.legalSnapshot,
    rendererVersion: RENDERER_VERSION,
    requirements,
    goldenProfilesProblem:
      goldenSource === null
        ? `the golden-profile suite could not be read at ${paths.goldenProfilesPath}, so no requirement can be shown as exercised`
        : null,
  };
}

interface GatherOneInput {
  requirement: Requirement;
  pack: KnowledgePack;
  packId: string;
  paths: SheetPaths;
  corpus: LoadedCorpus & AuthorisedCorpus;
  /** The same object that authorised `corpus`; closure admission reads tiers from it. */
  sourceRegister: SourceRegister;
  heldDocIds: ReadonlySet<string>;
  entries: LedgerEntry[];
  promotions: PromotionRecord[];
  renderCtx: RenderContext;
  goldenProfiles: string[];
}

function gatherRequirement(input: GatherOneInput): SheetRequirement {
  const { requirement, pack, packId, paths, corpus, sourceRegister, entries, renderCtx } = input;

  const governing = governingEntry(entries, packId, requirement.id);
  const signature = governing !== null && governing.kind !== 'revoked' ? governing : null;
  const revocation = governing !== null && governing.kind === 'revoked' ? governing : null;

  const { result, problem: resultProblem } = readResult(paths, packId, requirement.id);

  let closureDocIds: string[] = [];
  let closureSha256: string | null = null;
  let closureProblem: string | null = null;
  try {
    const closure = EntitledClosure.forSources(corpus, sourceRegister, sourceIdsOf(requirement));
    closureDocIds = [...closure.docIds];
    closureSha256 = closure.sha256;
  } catch (error) {
    closureProblem =
      error instanceof ClosureEntryNotFoundError
        ? `the entitled closure cannot be computed: ${error.message}`
        : `the entitled closure cannot be computed: ${String(error)}`;
  }

  const integrityProblems: string[] = [];
  let staleness: StalenessReason[] = [];
  let status: RequirementStatus | null;

  if (signature === null) {
    // Nothing signed, or a revocation governs. This used to be correct by
    // comment — "deriveStatus consults staleness in neither case, so nothing
    // needs to be computed for it" — beside a call that passed an empty
    // staleness set anyway. It is now correct by construction: neither variant
    // has anywhere to put a freshness assessment, so nothing has to be trusted
    // to ignore one.
    status = deriveStatus(revocation === null ? toStatusInput(null) : toStatusInput(revocation));
  } else {
    for (const pinned of signature.corpus) {
      if (!input.heldDocIds.has(pinned.docId)) {
        integrityProblems.push(
          `${pinned.docId} is pinned by governing entry ${signature.entryId} but is absent from the corpus — this is tampering-shaped, not staleness`,
        );
      }
    }

    if (result === null) {
      // `CurrentState.resultSha256` is non-nullable on purpose, so this case is
      // unrepresentable rather than merely unhandled: with no result there is
      // no current state, no staleness, and therefore no derivable status.
      integrityProblems.push(
        `the verification result pinned by governing entry ${signature.entryId} is absent, so staleness — and therefore status — cannot be derived`,
      );
      status = null;
    } else if (closureSha256 === null) {
      integrityProblems.push(
        `${closureProblem ?? 'the entitled closure cannot be computed'}, so staleness — and therefore status — cannot be derived`,
      );
      status = null;
    } else {
      // Built by `currentStateOf`, not assembled here. This literal and the
      // sign CLI's private copy were two constructions of the record freshness
      // is measured over, and the public resolver would have been a third; the
      // sheet and the site disagreeing about one signature is exactly the
      // failure that would not show up in any test comparing either surface
      // against itself.
      const current: CurrentState = currentStateOf({
        requirement,
        renderContext: renderCtx,
        closure: { sha256: closureSha256, docIds: closureDocIds },
        corpus,
        result,
      });
      // Task 4's resolver, reused rather than reimplemented: this is the
      // surface where `normalizer_changed`'s narrowing actually pays off.
      staleness = resolvedStaleness(signature, current, corpus);
      // Checked, and here is what was found. The sheet is the other surface
      // entitled to say so: it has the corpus, the closure and the pinned
      // result in hand, and the two integrity branches above are where it
      // refuses rather than guesses when it does not.
      status = deriveStatus(toStatusInput(signature, { checked: true, reasons: staleness }));
    }
  }

  // Every evidence set the record carries, from `evidenceSetsOf` — the record's
  // one enumeration, shared with the sign gate and with the record's own
  // consistency pass. The sheet used to walk the record itself, and that walk
  // was one of the three that had to be found and corrected by hand when
  // `adjudicationEvidence` arrived; a reviewer was shown why every argument
  // started and nothing about why any of them ended, worst exactly where it
  // matters most, because an `OPEN_QUESTION` has no `resolution` for the
  // challenges table to print either.
  //
  // What the sheet still owns is the rendering: `describeEvidence` resolves
  // each item against the corpus, which is this module's business and not the
  // pure enumerator's. What it no longer owns is *which* arrays exist.
  //
  // `set.heading` keeps the two arrays of a challenge visibly apart, and
  // `set.statement` puts the sentence each stands behind beside it. Merged
  // under one heading, two arrays with two producers would leave a reviewer
  // unable to say which role stood behind any given quote — the same reason the
  // sign gate refuses them as separate sets and the record names them
  // separately in every consistency message.
  const evidence: SheetEvidenceSet[] =
    result === null
      ? []
      : evidenceSetsOf(result).map((set) => ({
          label: set.heading,
          statement: set.statement,
          items: set.items.map((item) => describeEvidence(item, corpus)),
        }));

  const facts = factsReferencedBy(requirement).map((factType) => ({
    factType,
    label: factLabel(factType, pack.factTypes),
    questions: pack.questions.filter((question) => question.factTypes.includes(factType)),
  }));

  const obligations = pack.obligationTemplates.filter(
    (template) =>
      (template.trigger.allOf ?? []).includes(requirement.id) ||
      (template.trigger.anyOf ?? []).includes(requirement.id),
  );

  const pipelineVersion = signature?.pipelineVersion ?? null;
  const promotion =
    pipelineVersion === null
      ? null
      : (input.promotions.find((record) => record.pipelineVersion === pipelineVersion) ?? null);

  return {
    id: requirement.id,
    title: requirement.title,
    plainEnglish: requirement.plainEnglish,
    version: requirement.version,
    legalStatus: requirement.legalStatus,
    sources: sourceIdsOf(requirement),
    status,
    staleness,
    integrityProblems,
    governing,
    signature,
    revocation,
    renderedCondition: renderRequirement(requirement, renderCtx),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderCtx),
    result,
    resultProblem,
    evidence,
    facts,
    obligations,
    goldenProfiles: input.goldenProfiles,
    benchmark: { pipelineVersion, promotion },
    closureDocIds,
    closureProblem,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Legal text is full of `<`, `&` and quotation marks. All five, always. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label: string, value: string | number): string {
  return `<tr><td>${esc(label)}</td><td>${value}</td></tr>`;
}

/** A `<p>` that always prints, carrying `none — …` when there is nothing to print. */
function stated(className: string, heading: string, body: string): string {
  return `<p class="${className}"><span class="k">${esc(heading)}</span> ${body}</p>`;
}

const STYLE = `
:root { color-scheme: light dark; }
body { font: 15px/1.55 ui-sans-serif, system-ui, sans-serif; margin: 0 auto; max-width: 68rem; padding: 2rem 1.5rem 6rem; }
h1 { font-size: 1.6rem; margin-bottom: .25rem; }
h2 { font-size: 1.15rem; margin-top: 2.5rem; border-bottom: 1px solid currentColor; padding-bottom: .3rem; }
h3 { font-size: .95rem; margin: 1.4rem 0 .4rem; text-transform: uppercase; letter-spacing: .06em; opacity: .75; }
table { border-collapse: collapse; margin: .5rem 0; width: 100%; }
th, td { border: 1px solid rgba(128,128,128,.45); padding: .3rem .5rem; text-align: left; vertical-align: top; font-size: .9rem; }
caption { text-align: left; font-weight: 600; padding: .3rem 0; }
pre { background: rgba(128,128,128,.12); padding: .75rem; overflow-x: auto; white-space: pre-wrap; font-size: .88rem; }
code { font-size: .85em; word-break: break-all; }
.k { font-weight: 600; }
.none { opacity: .8; font-style: italic; }
.warn { border-left: 4px solid #b45309; padding-left: .6rem; font-weight: 600; }
.integrity { border-left: 4px solid #b91c1c; padding-left: .6rem; font-weight: 600; }
section.requirement { margin-top: 3rem; }
`;

function renderPortfolio(model: SheetModel): string {
  const statusCounts: Record<string, number> = { draft: 0, verified: 0, ratified: 0 };
  let notDerivable = 0;
  let unsigned = 0;
  let revoked = 0;
  const stalenessCounts = new Map<StalenessReason, number>(
    ALL_STALENESS_REASONS.map((reason) => [reason, 0]),
  );

  for (const requirement of model.requirements) {
    if (requirement.status === null) notDerivable += 1;
    else statusCounts[requirement.status.derivedStatus] =
      (statusCounts[requirement.status.derivedStatus] ?? 0) + 1;
    if (requirement.governing === null) unsigned += 1;
    if (requirement.revocation !== null) revoked += 1;
    for (const reason of requirement.staleness) {
      stalenessCounts.set(reason, (stalenessCounts.get(reason) ?? 0) + 1);
    }
  }

  const total = model.requirements.length;
  const blocked = model.requirements.filter((r) =>
    r.staleness.some((reason) => BLOCKING.has(reason)),
  ).length;

  return [
    '<section class="portfolio">',
    '<h2>Portfolio</h2>',
    '<table class="counts status-counts">',
    '<caption>By derived status</caption>',
    '<thead><tr><th>Status</th><th>Requirements</th></tr></thead>',
    '<tbody>',
    row('draft', statusCounts['draft'] ?? 0),
    row('verified', statusCounts['verified'] ?? 0),
    row('ratified', statusCounts['ratified'] ?? 0),
    row('not derivable (integrity failure)', notDerivable),
    '</tbody></table>',
    '<table class="counts staleness-counts">',
    '<caption>By staleness reason</caption>',
    '<thead><tr><th>Reason</th><th>Requirements</th></tr></thead>',
    '<tbody>',
    ...ALL_STALENESS_REASONS.map((reason) => row(reason, stalenessCounts.get(reason) ?? 0)),
    '</tbody></table>',
    `<p class="portfolio-note">${unsigned} of ${total} requirements carry no signature at all, and read <code>draft</code> for that reason rather than for any drift.</p>`,
    `<p class="portfolio-note">${revoked} requirement${revoked === 1 ? ' has' : 's have'} been revoked; ${blocked} carr${blocked === 1 ? 'ies' : 'y'} blocking staleness.</p>`,
    `<p class="benchmark-header">Most recent live benchmark run: <span class="none">none recorded — live benchmark runs arrive with B3, and a live run is in any case labelled as governing nothing until promoted (factory §4.6). ${esc(NO_BENCHMARK_METRICS)}.</span></p>`,
    model.goldenProfilesProblem === null
      ? ''
      : `<p class="warn">${esc(model.goldenProfilesProblem)}</p>`,
    '</section>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function renderStatus(requirement: SheetRequirement): string {
  const lines: string[] = [];

  if (requirement.status === null) {
    lines.push(
      '<p class="status integrity">Derived status: <strong>not derivable</strong> — see the integrity failure below.</p>',
    );
  } else {
    lines.push(
      `<p class="status">Derived status: <strong>${esc(requirement.status.derivedStatus)}</strong></p>`,
    );
    // Every reason, never the first: `stale_encoding` and `stale_source_text`
    // co-occur, and a reviewer shown one of them repairs half the problem.
    lines.push(
      `<p class="status-reasons"><span class="k">Reasons:</span> ${
        requirement.status.statusReasons.length === 0
          ? '<span class="none">none</span>'
          : esc(requirement.status.statusReasons.join(', '))
      }</p>`,
    );
  }

  for (const problem of requirement.integrityProblems) {
    lines.push(`<p class="integrity">INTEGRITY FAILURE — ${esc(problem)}</p>`);
  }
  return lines.join('\n');
}

function renderCoverage(requirement: SheetRequirement): string {
  const lines = ['<h3>Coverage, both directions</h3>'];
  if (requirement.result === null) {
    lines.push(stated('coverage', 'Coverage:', `<span class="none">${esc(requirement.resultProblem ?? 'none')}</span>`));
    return lines.join('\n');
  }
  for (const direction of ['reading_to_condition', 'condition_to_reading'] as const) {
    const cells = requirement.result.coverage.cells.filter((cell) => cell.direction === direction);
    lines.push(`<table class="coverage" data-direction="${direction}">`);
    lines.push(`<caption>${direction}</caption>`);
    lines.push('<thead><tr><th>Reading element</th><th>Condition path</th><th>Verdict</th><th>Adjudicated by</th></tr></thead><tbody>');
    if (cells.length === 0) {
      lines.push('<tr><td colspan="4" class="none">none — no cell was walked in this direction</td></tr>');
    }
    for (const cell of cells) {
      lines.push(
        `<tr><td>${esc(cell.readingElementId ?? '—')}</td><td>${esc(cell.conditionPath ?? '—')}</td><td>${esc(cell.verdict)}</td><td>${esc(cell.challengeId ?? '—')}</td></tr>`,
      );
    }
    lines.push('</tbody></table>');
  }
  return lines.join('\n');
}

function renderChallenges(requirement: SheetRequirement): string {
  const lines = ['<h3>Challenges and adjudicated verdicts</h3>'];
  if (requirement.result === null) {
    lines.push(`<p class="none">${esc(requirement.resultProblem ?? 'none')}</p>`);
    return lines.join('\n');
  }
  if (requirement.result.challenges.length === 0) {
    lines.push('<p class="none">none — no prosecutor raised a challenge against this encoding</p>');
    return lines.join('\n');
  }
  lines.push('<table class="challenges"><thead><tr><th>Id</th><th>Lens</th><th>Challenge</th><th>Verdict</th><th>Resolution</th></tr></thead><tbody>');
  for (const challenge of requirement.result.challenges) {
    const resolution =
      challenge.resolution !== undefined && challenge.resolution.trim().length > 0
        ? esc(challenge.resolution)
        : '<span class="none">not adjudicated</span>';
    lines.push(
      `<tr><td>${esc(challenge.id)}</td><td>${esc(challenge.lens)}</td><td>${esc(challenge.statement)}</td><td>${esc(challenge.verdict)}</td><td>${resolution}</td></tr>`,
    );
  }
  lines.push('</tbody></table>');
  return lines.join('\n');
}

/**
 * The entitled closure, before any evidence is quoted from it.
 *
 * Printed even — especially — when it is empty. An empty closure means the
 * requirement's `sources[]` resolve to no corpus document at all, so nobody
 * *could* have read the law behind it: factory §4.2's `corpus_gap`, and the one
 * fact about a requirement's evidence that quoting cannot reveal, because there
 * is nothing to quote. A reviewer scrolling past a silent evidence section
 * would take it for a rule whose evidence merely had not been gathered yet.
 */
function renderClosure(requirement: SheetRequirement): string {
  const lines = ['<h3>The entitled evidence surface</h3>'];
  if (requirement.closureProblem !== null) {
    lines.push(`<p class="warn">${esc(requirement.closureProblem)}</p>`);
    return lines.join('\n');
  }
  if (requirement.closureDocIds.length === 0) {
    lines.push(
      `<p class="warn">none — the requirement cites ${esc(
        requirement.sources.join(', ') || 'no source',
      )}, and the corpus holds no document serving any of them. Nobody could have read the law behind this rule.</p>`,
    );
    return lines.join('\n');
  }
  lines.push('<ul class="closure">');
  for (const docId of requirement.closureDocIds) {
    lines.push(`<li><code>${esc(docId)}</code></li>`);
  }
  lines.push('</ul>');
  return lines.join('\n');
}

function renderEvidence(requirement: SheetRequirement): string {
  const lines = ['<h3>Evidence, linked into the corpus</h3>'];
  if (requirement.result === null) {
    lines.push(`<p class="none">${esc(requirement.resultProblem ?? 'none')}</p>`);
    return lines.join('\n');
  }
  if (requirement.evidence.length === 0) {
    lines.push('<p class="none">none — this result carries no evidence at all</p>');
    return lines.join('\n');
  }
  for (const set of requirement.evidence) {
    lines.push(`<p class="evidence-set"><span class="k">${esc(set.label)}:</span> ${esc(set.statement)}</p>`);
    lines.push('<ul class="evidence">');
    for (const item of set.items) {
      const documents = item.documents
        .map((document) =>
          'missing' in document
            ? `<span class="integrity">${esc(document.docId)} — absent from the corpus</span>`
            : `<a href="${esc(document.url)}"><code>${esc(document.docId)}</code></a> ${esc(document.title)} (${esc(document.versionLabel)})`,
        )
        .join('; ');
      lines.push(`<li><span class="k">${esc(item.kind)}</span> — ${documents}<pre>${esc(item.text)}</pre></li>`);
    }
    lines.push('</ul>');
  }
  return lines.join('\n');
}

function renderOpenQuestions(requirement: SheetRequirement): string {
  const lines = ['<h3>Open questions</h3>'];
  if (requirement.result === null) {
    lines.push(`<p class="none">${esc(requirement.resultProblem ?? 'none')}</p>`);
    return lines.join('\n');
  }
  if (requirement.result.openQuestions.length === 0) {
    lines.push('<p class="none">none — no question was left outstanding</p>');
    return lines.join('\n');
  }
  lines.push('<ul class="open-questions">');
  for (const question of requirement.result.openQuestions) {
    lines.push(`<li><code>${esc(question.id)}</code> ${esc(question.statement)}</li>`);
  }
  lines.push('</ul>');
  return lines.join('\n');
}

function renderFacts(requirement: SheetRequirement): string {
  const lines = ['<h3>Facts consumed, and the questions that collect them</h3>'];
  if (requirement.facts.length === 0) {
    lines.push('<p class="none">none — this requirement consumes no customer fact</p>');
    return lines.join('\n');
  }
  lines.push('<table class="facts"><thead><tr><th>Fact</th><th>Label</th><th>Collected by</th></tr></thead><tbody>');
  for (const fact of requirement.facts) {
    const questions =
      fact.questions.length === 0
        ? '<span class="none">none — no question collects this fact</span>'
        : fact.questions
            .map((question) => `<code>${esc(question.id)}</code> ${esc(question.text)}`)
            .join('<br>');
    lines.push(
      `<tr><td><code>${esc(fact.factType)}</code></td><td>${esc(fact.label)}</td><td>${questions}</td></tr>`,
    );
  }
  lines.push('</tbody></table>');
  return lines.join('\n');
}

function renderObligations(requirement: SheetRequirement): string {
  const lines = ['<h3>Obligations that fire</h3>'];
  if (requirement.obligations.length === 0) {
    lines.push('<p class="none">none — this requirement fires no obligation template</p>');
    return lines.join('\n');
  }
  lines.push('<table class="obligations"><thead><tr><th>Template</th><th>Obligation</th><th>Actor</th><th>Deadline logic</th></tr></thead><tbody>');
  for (const template of requirement.obligations) {
    lines.push(
      `<tr><td><code>${esc(template.id)}</code></td><td>${esc(template.obligation)}</td><td>${esc(template.actor)}</td><td>${esc(template.deadlineLogic)}</td></tr>`,
    );
  }
  lines.push('</tbody></table>');
  return lines.join('\n');
}

function renderGoldenProfiles(requirement: SheetRequirement): string {
  const lines = ['<h3>Golden profiles exercising this rule</h3>'];
  if (requirement.goldenProfiles.length === 0) {
    lines.push(
      '<p class="warn">WARNING: no golden profile exercises this rule — nothing in the regression suite would notice if its behaviour changed.</p>',
    );
    return lines.join('\n');
  }
  lines.push('<ul class="golden-profiles">');
  for (const profile of requirement.goldenProfiles) lines.push(`<li>${esc(profile)}</li>`);
  lines.push('</ul>');
  return lines.join('\n');
}

/**
 * §4.6's benchmark block, resolved through the *signature's* promotion record
 * rather than through the latest live run — the substitution §5.1 exists to
 * prevent. Three states, and all three print.
 */
function renderBenchmark(requirement: SheetRequirement): string {
  const lines = ['<h3>Benchmark metrics</h3>'];
  const { pipelineVersion, promotion } = requirement.benchmark;
  if (pipelineVersion === null) {
    lines.push(
      `<p class="benchmark"><span class="none">none — no signature, so no pipelineVersion is bound to this requirement. ${esc(NO_BENCHMARK_METRICS)}.</span></p>`,
    );
    return lines.join('\n');
  }
  if (promotion === null) {
    lines.push(
      `<p class="benchmark warn">pipelineVersion <code>${esc(pipelineVersion)}</code> has no promotion record: nobody approved the pipeline that produced this dossier. ${esc(NO_BENCHMARK_METRICS)}.</p>`,
    );
    return lines.join('\n');
  }
  lines.push(
    `<p class="benchmark">pipelineVersion <code>${esc(pipelineVersion)}</code>, promoted by ${esc(promotion.by)} on ${esc(promotion.on)}. <span class="none">${esc(NO_BENCHMARK_METRICS)}.</span></p>`,
  );
  return lines.join('\n');
}

function renderSignOff(requirement: SheetRequirement): string {
  const lines = ['<h3>Sign-off</h3>'];

  if (requirement.revocation !== null) {
    const revocation = requirement.revocation;
    lines.push(
      `<p class="signoff revoked"><span class="k">Revoked</span> by ${esc(revocation.by)} on ${esc(revocation.on)} — ${esc(revocation.reason)}</p>`,
      `<p class="signoff"><span class="k">Entry:</span> <code>${esc(revocation.entryId)}</code>, withdrawing <code>${esc(revocation.revokes)}</code></p>`,
      '<p class="none">Only a fresh signature restores authority; a revocation is never undone by the world settling back down.</p>',
    );
    return lines.join('\n');
  }

  const signature = requirement.signature;
  if (signature === null) {
    lines.push(
      '<p class="signoff none">none — no signature; nobody has stood behind this requirement, so it reads <code>draft</code> and nothing has gone stale against it.</p>',
    );
    return lines.join('\n');
  }

  lines.push(
    '<table class="signoff"><tbody>',
    row('level', esc(signature.kind)),
    row('by', esc(signature.by)),
    row('on', esc(signature.on)),
    row('entryId', `<code>${esc(signature.entryId)}</code>`),
    row('packVersion', esc(signature.packVersion)),
    row('requirementVersion', String(signature.requirementVersion)),
    row('requirementSha256', `<code>${esc(signature.requirementSha256)}</code>`),
    row('requirementInputSha256', `<code>${esc(signature.requirementInputSha256)}</code>`),
    row('conditionSha256', `<code>${esc(signature.conditionSha256)}</code>`),
    row('renderedConditionSha256', `<code>${esc(signature.renderedConditionSha256)}</code>`),
    row('rendererVersion', esc(signature.rendererVersion)),
    row('corpusClosureSha256', `<code>${esc(signature.corpusClosureSha256)}</code>`),
    row('resultSha256', `<code>${esc(signature.resultSha256)}</code>`),
    row('pipelineVersion', `<code>${esc(signature.pipelineVersion)}</code>`),
    row(
      'note',
      signature.note === undefined ? '<span class="none">none</span>' : esc(signature.note),
    ),
    '</tbody></table>',
    '<table class="pins"><caption>Documents this signature pins</caption><thead><tr><th>docId</th><th>version</th><th>sha256Normalized</th><th>normalizer</th></tr></thead><tbody>',
  );
  if (signature.corpus.length === 0) {
    lines.push('<tr><td colspan="4" class="none">none — this signature pins no corpus document</td></tr>');
  }
  for (const pin of signature.corpus) {
    lines.push(
      `<tr><td><code>${esc(pin.docId)}</code></td><td>${esc(pin.versionLabel)}</td><td><code>${esc(pin.sha256Normalized)}</code></td><td>${esc(pin.normalizerVersion)}</td></tr>`,
    );
  }
  lines.push('</tbody></table>');
  return lines.join('\n');
}

function renderRequirementSection(requirement: SheetRequirement): string {
  return [
    `<section class="requirement" data-requirement="${esc(requirement.id)}" id="req-${esc(requirement.id)}">`,
    `<h2>${esc(requirement.id)} — ${esc(requirement.title)}</h2>`,
    `<p class="plain-english">${esc(requirement.plainEnglish)}</p>`,
    `<p class="meta">version ${requirement.version} · legal status <code>${esc(requirement.legalStatus)}</code></p>`,
    renderStatus(requirement),
    '<h3>The condition, in the English the signature pins</h3>',
    `<pre class="rendered-condition">${esc(requirement.renderedCondition)}</pre>`,
    `<p class="rendered-hash"><span class="k">renderedConditionSha256:</span> <code>${esc(requirement.renderedConditionSha256)}</code> (renderer ${esc(RENDERER_VERSION)}). This is the text the prosecutors argued against and the hash a signature pins.</p>`,
    renderCoverage(requirement),
    renderChallenges(requirement),
    renderClosure(requirement),
    renderEvidence(requirement),
    renderOpenQuestions(requirement),
    renderFacts(requirement),
    renderObligations(requirement),
    renderGoldenProfiles(requirement),
    renderBenchmark(requirement),
    renderSignOff(requirement),
    '</section>',
  ].join('\n');
}

/**
 * The whole sheet, as one self-contained HTML document.
 *
 * Pure: a model in, a string out. Every read happened in `gatherSheet`, so a
 * test can hand this function a constructed model and exercise a state the real
 * world cannot currently produce.
 */
export function renderSheet(model: SheetModel): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Verification review sheet — ${esc(model.packId)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<h1>Verification review sheet</h1>',
    `<p class="meta">Pack <code>${esc(model.packId)}</code> version <code>${esc(model.packVersion)}</code> · legal snapshot ${esc(model.legalSnapshot)} · ${model.requirements.length} requirements · renderer ${esc(model.rendererVersion)}</p>`,
    '<p class="meta">Generated, git-ignored, and never authoritative: the ledger is. Everything below is a projection of it.</p>',
    renderPortfolio(model),
    ...model.requirements.map(renderRequirementSection),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The operation
// ---------------------------------------------------------------------------

/** Whether `child` is inside `parent`, both already resolved. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Refuses an output path that would land among artefacts nothing may rewrite.
 *
 * `verification/` is append-only and `test/` holds the recorded goldens; a
 * generated file dropped into either is the one mistake regeneration cannot
 * undo, and a generator is exactly the sort of thing that gets pointed at a
 * directory by a hurried `--out`.
 */
function outPathProblem(paths: SheetPaths, outPath: string): string | null {
  const verificationDir = resolve(paths.verificationDir);
  if (isInside(verificationDir, outPath) || outPath === verificationDir) {
    return `refusing to write the sheet into ${verificationDir}: that directory holds append-only records, not generated files.`;
  }
  if (
    resolve(outPath)
      .split(sep)
      .some((segment) => segment === 'test')
  ) {
    return `refusing to write the sheet into a test/ directory (${outPath}): recorded goldens live there and a generator must not be able to touch them.`;
  }
  return null;
}

/**
 * Generates the sheet, or explains why it could not.
 *
 * Returns rather than exits, so the exit-code mapping stays a value a test can
 * assert on. Nothing is written unless the whole model was gathered: a
 * half-written sheet over an unreadable ledger is worse than none.
 */
export function runSheet(args: SheetArgs, paths: SheetPaths): CliOutcome {
  try {
    const outPath = resolve(paths.outPath);
    const problem = outPathProblem(paths, outPath);
    if (problem !== null) return { exitCode: EXIT_USAGE, lines: [`Usage: ${problem}`] };

    const model = gatherSheet(args.packId, paths);
    const html = renderSheet(model);

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf8');

    const unsigned = model.requirements.filter((r) => r.governing === null).length;
    const blocked = model.requirements.filter((r) =>
      r.staleness.some((reason) => BLOCKING.has(reason)),
    ).length;
    const notDerivable = model.requirements.filter((r) => r.status === null).length;

    return {
      exitCode: EXIT_OK,
      lines: [
        `Wrote the review sheet to ${outPath}.`,
        `  ${model.requirements.length} requirements · ${unsigned} unsigned · ${blocked} with blocking staleness · ${notDerivable} with no derivable status.`,
        '  The sheet is generated and git-ignored; the ledger remains authoritative.',
      ],
    };
  } catch (error) {
    const mapped = outcomeFor(error);
    if (mapped !== null) return mapped;
    throw error;
  }
}
