/**
 * The verification record — what a human actually signs.
 *
 * A signature pins `resultSha256`, so this file decides what a signature can
 * be a signature *of*. That makes it a contract rather than a convenience:
 * B2's agents produce this shape, the sign gate polices it, and the ledger
 * pins a hash of it. Three consequences follow, and each is a rule below
 * rather than a convention.
 *
 * **Validation is two stages, and the seam is load-bearing.** The exported
 * `verificationResultSchema` checks structure only, and every rule that reads
 * two fields at once lives in `assertResultConsistency`. That is not a
 * preference about where validation reads best. The field-accounting guard
 * walks this schema node by node and refuses any node kind it does not
 * recognise — `ZodEffects` included — because a walker that guesses at an
 * unfamiliar node would classify a whole composite as one leaf and hide every
 * field beneath it. That is precisely the failure the guard exists to close.
 * So a `.refine()` here, at the root or buried on `challenges`, would not make
 * the schema untidy; it would make the guard unbuildable and forfeit the
 * acceptance test. Nothing in this file may be wrapped in `.refine()`,
 * `.superRefine()`, `.transform()` or `z.preprocess()`.
 *
 * **`.strict()` everywhere.** An unknown key is a validation failure, not a
 * silently dropped field. `in_catalogue.missReason` reached three modules and
 * a specification without anyone noticing it was inert, and a schema that
 * strips what it does not recognise is how a field gets to be inert without
 * announcing it. Note the contrast with `requirementSchema`, which is
 * deliberately *not* strict: there, stripping is the mechanism that keeps
 * loader-added fields out of `requirementSha256`. Different schema, opposite
 * reason, and the reasoning does not transfer.
 *
 * **A legal conclusion with no evidence at all is unrepresentable.**
 * `checkEvidenceSet` decides whether evidence is *valid*; it cannot decide
 * whether evidence *exists*, because `checkEvidenceSet([])` has nothing to
 * reject and returns clean. So cardinality is structural here — `.min(1)` on
 * both evidence sets — and the verdict-keyed resolution rule is semantic.
 */

import { z } from 'zod';
import { sha256Hex } from '../corpus/hash';
import { evidenceItemSchema, type EvidenceItem, type QuoteEvidence } from '../corpus/evidence';
import { canonicalJson } from './canonical';
import { corpusPinSchema } from './corpus-pin';
import { evidenceSetsOf } from './evidence-sets';

/** A challenge's adjudicated verdict. */
export const challengeVerdictSchema = z.enum(['CONFIRMED', 'MISMATCH', 'OPEN_QUESTION']);

/** A coverage cell's verdict. Everything but `MAPPED` is adverse. */
export const coverageVerdictSchema = z.enum(['MAPPED', 'UNMAPPED', 'UNSUPPORTED', 'UNCERTAIN']);

/** Which way a coverage cell was walked. */
export const coverageDirectionSchema = z.enum(['reading_to_condition', 'condition_to_reading']);

/**
 * The adverse verdicts. Each one is a claim that the reading and the encoding
 * did not meet, and each therefore has to name the challenge that adjudicated
 * it — see `assertResultConsistency`.
 *
 * **Exported because it is the authority, and there must be exactly one.** The
 * pipeline's prosecutor seam demands a `challengeId` on adverse coverage, and
 * that demand only means something if "adverse" is the same word in both places:
 * a fifth coverage verdict that this set did not learn about would have the seam
 * requiring a link the record boundary never checks, or the boundary refusing a
 * link the seam never asked for. `src/pipeline/prosecutors.ts` derives its list
 * from this set rather than restating it.
 */
export const ADVERSE_COVERAGE: ReadonlySet<string> = new Set([
  'UNMAPPED',
  'UNSUPPORTED',
  'UNCERTAIN',
]);

/**
 * The verdicts for which an adjudication has been reached and must be stated.
 *
 * Exported for the same reason `ADVERSE_COVERAGE` and `evidenceIsSolelyAbsence`
 * are: the adjudicator's role seam (`pipeline/adjudicator.ts`) applies the same
 * rule at the boundary of the role that produced the verdict, and two gates over
 * **one** set is a different thing from two sets that agree today. Written
 * separately, the seam could relax while this stayed strict, and the
 * disagreement would surface as a role output that parses and a dossier that
 * cannot be signed, with nothing naming the rule the two differ about.
 */
export const RESOLVED_VERDICTS: ReadonlySet<string> = new Set(['CONFIRMED', 'MISMATCH']);

/**
 * One proposition from the blind reading of the law, with the text behind it.
 * `.min(1)` on `evidence` is the structural half of "no conclusion without
 * evidence".
 */
const readingElementSchema = z
  .object({
    id: z.string(),
    statement: z.string(),
    evidence: z.array(evidenceItemSchema).min(1),
  })
  .strict();

/**
 * One cell of the coverage table. `readingElementId` and `conditionPath` are
 * each optional because a cell walked in one direction may have no counterpart
 * in the other — an `UNMAPPED` reading element is exactly a reading element
 * with no condition path.
 */
const coverageCellSchema = z
  .object({
    direction: coverageDirectionSchema,
    readingElementId: z.string().optional(),
    conditionPath: z.string().optional(),
    verdict: coverageVerdictSchema,
    challengeId: z.string().optional(),
  })
  .strict();

/**
 * One adversarial challenge and its adjudication.
 *
 * `resolution` stays `.optional()` structurally because the obligation is
 * conditional on `verdict`: an `OPEN_QUESTION` is precisely the case where
 * there is nothing to resolve, and requiring a resolution structurally would
 * either demand one for an open question or wrap this object in a refinement
 * — which would hide every field here from the accounting walker.
 *
 * **Two evidence arrays, because there are two propositions and one producer
 * each.** Neither is a redundancy and neither is a superset of the other:
 *
 *     evidence              "There is something here worth challenging."
 *     adjudicationEvidence  "Here is why that challenge is confirmed,
 *                            rejected, or unresolved."
 *
 * The prosecutor owns the first and the adjudicator owns the second, so making
 * one array serve both would require ownership to be shared — which dissolves
 * the rule that every field in this record has a single producer, and leaves a
 * reader unable to tell which role stood behind any given quote. §3.3 binds
 * every adjudicated verdict to evidence, and before this field existed the
 * record could state why a challenge was *raised* and had no way to state why
 * it was *decided*.
 *
 * **`adjudicationEvidence` and not `resolutionEvidence`, and `.min(1)` under
 * all three verdicts including `OPEN_QUESTION`.** An open question has no
 * resolution and is still an adjudicated outcome. `OPEN_QUESTION` must never
 * be readable as "the adjudicator had nothing": it means the evidence in hand
 * was sufficient to establish that *this record cannot settle the challenge*,
 * which is precisely the finding B4's human reviewer inspects. A name tied to
 * `resolution` would have implied the field is absent exactly where the
 * requirement bites hardest, and `.optional()` would have let an empty
 * adjudication pass itself off as an open question.
 *
 * `.min(1)` is the structural half only. The absence-sole rule applies here as
 * to every other evidence-bound conclusion and lives in
 * `assertResultConsistency`: a search that found nothing can no more be the
 * whole of why a challenge was decided than the whole of why it was raised.
 */
const challengeSchema = z
  .object({
    id: z.string(),
    lens: z.string(),
    statement: z.string(),
    verdict: challengeVerdictSchema,
    evidence: z.array(evidenceItemSchema).min(1),
    resolution: z.string().optional(),
    adjudicationEvidence: z.array(evidenceItemSchema).min(1),
  })
  .strict();

/**
 * An outstanding question, and deliberately without a `blocking` flag.
 *
 * The signing rule is that *any* outstanding open question blocks. A per-item
 * `blocking: false` would be a second, competing policy living inside the
 * artefact being judged, letting a result declare its own open question
 * harmless. If non-blocking observations are ever wanted they are a different
 * concept and get their own field; they are not open questions with a flag
 * turned off. `.strict()` is what makes the absence enforced rather than
 * merely intended.
 */
const openQuestionSchema = z.object({ id: z.string(), statement: z.string() }).strict();

/**
 * A structural gap in what was available to read. Structured rather than left
 * to the narrative because the sign CLI must refuse an unresolved gap, and a
 * refusal that depends on parsing prose is not a refusal. An empty array is
 * the normal case.
 *
 * **Three populations, and the third has no document to name.** Schema 1.0.0
 * required a `docId`, on the assumption that everything missing is a missing
 * file. B2's first producer found the counterexample: a requirement whose
 * `sources[]` resolve to no document at all — `docsForSources` returns `[]`,
 * `computeClosure` builds a closure over nothing and throws nothing, and what
 * is missing is *source coverage*, not a named document. Recording `SRC-005`
 * in a field called `docId` was the available workaround and is exactly the
 * defect this shape removes: the structured record would say "document" while
 * the prose beside it said "source", leaving `detail` to correct the field
 * that a machine reads.
 *
 *     corpus_gap  + sourceId   nothing in the corpus serves this source
 *     corpus_gap  + docId      an expected document is absent from the corpus
 *     closure_gap + docId      the document exists; traversal did not reach it
 *
 * **Both identities are optional here, and a discriminated union is not an
 * option.** "Exactly one of the two, and which one depends on `kind`" is a
 * cross-field rule, so by this module's standing rule it lives in
 * `assertResultConsistency` rather than in the schema. A
 * `z.discriminatedUnion` at the element level would not merely be a stylistic
 * alternative: the accounting walker takes its path set from these runtime
 * nodes and a wrapped composite emits one row while every field beneath it
 * goes unaccounted — the hole that guard exists to close. `ZodOptional` is a
 * kind the walker already descends through, so two optional fields stay
 * individually visible to it.
 */
const gapSchema = z
  .object({
    kind: z.enum(['corpus_gap', 'closure_gap']),
    docId: z.string().optional(),
    sourceId: z.string().optional(),
    detail: z.string(),
  })
  .strict();

/**
 * `verification-result.json`, structurally.
 *
 * Must remain a plain `ZodObject` — see the module note. `resultSchemaVersion`
 * is a literal rather than a string so that a result written against a future
 * shape is rejected here instead of being read as if it were this one.
 */
export const verificationResultSchema = z
  .object({
    packId: z.string(),
    requirementId: z.string(),
    requirementVersion: z.number().int().min(1),
    resultSchemaVersion: z.literal('1.2.0'),
    pipelineVersion: z.string(),
    rendererVersion: z.string(),
    requirementInputSha256: z.string(),
    conditionSha256: z.string(),
    renderedConditionSha256: z.string(),
    corpusClosureSha256: z.string(),
    corpus: z.array(corpusPinSchema),
    reading: z.object({ elements: z.array(readingElementSchema) }).strict(),
    coverage: z.object({ cells: z.array(coverageCellSchema) }).strict(),
    challenges: z.array(challengeSchema),
    openQuestions: z.array(openQuestionSchema),
    gaps: z.array(gapSchema),
    narrative: z.string().optional(),
  })
  .strict();

export type VerificationResult = z.infer<typeof verificationResultSchema>;

/** Every cross-field inconsistency found, never only the first. */
export class ResultConsistencyError extends Error {
  problems: string[];

  constructor(problems: string[]) {
    super(`Verification result is inconsistent:\n  ${problems.join('\n  ')}`);
    this.name = 'ResultConsistencyError';
    this.problems = problems;
  }
}

/**
 * The two registers a gap identity may name, handed in rather than read.
 *
 * `src/verification` touches no filesystem, no network and no clock, and both
 * of these live in files — `corpus/index.json` and the pack's `sources.json`.
 * So the caller that has already loaded them supplies them, and a caller that
 * has not can still run every rule that does not need them. What the registers
 * buy is the one rule structure cannot state: that an identifier is recorded in
 * the field belonging to its own register.
 */
export interface GapIdentityRegisters {
  /** Every `docId` the corpus index holds. */
  docIds: readonly string[];
  /** Every source id the source register holds. */
  sourceIds: readonly string[];
}

/**
 * The digest of an entitled closure over nothing: SHA-256 of the empty string.
 *
 * Computed rather than transcribed, so it cannot drift from what
 * `computeClosure` actually returns for an empty entry set. It is a *faithful*
 * hash — the entitled set really is empty — which is why the rule below is
 * about the company it keeps rather than about the value itself.
 */
export const EMPTY_CLOSURE_SHA256 = sha256Hex('');

/**
 * Whether a conclusion's whole evidence set is absence claims.
 *
 * Exported so that the role boundary and the record boundary are two gates over
 * **one** rule rather than two rules that agree today. A reading arriving from
 * an agent is refused at the reader's seam by this predicate, and the assembled
 * record is refused here by the same one; written separately, the seam could
 * relax while this stayed strict, and the disagreement would surface as a role
 * output that parses and a dossier that cannot be signed, with nothing naming
 * the rule the two differ about.
 *
 * An empty set returns `false`: it carries no absence claim to object to, and
 * cardinality is a different rule, enforced structurally by `.min(1)`.
 */
export function evidenceIsSolelyAbsence(items: readonly EvidenceItem[]): boolean {
  return items.length > 0 && items.every((item) => item.kind === 'absence');
}

/** Whether a string is present and carries something other than whitespace. */
function isAdjudicated(resolution: string | undefined): boolean {
  return resolution !== undefined && resolution.trim().length > 0;
}

/**
 * Every id that occurs more than once, each reported once however many times it
 * repeats — three copies of `C1` are one defect to fix, not two problems to
 * read. Insertion order is preserved so the message list is stable.
 */
function repeatedIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    else seen.add(id);
  }
  return [...repeated];
}

/**
 * Every quote an evidence item carries, with the path it sits at.
 *
 * Quotes nest. Walking only the top-level `kind: 'quote'` case would leave the
 * quotes inside an `amendment_chain` hop or either end of a `cross_reference`
 * unchecked — which is the whole of the evidence in exactly the composite
 * items where the reasoning is hardest to follow by eye. The switch is
 * exhaustive over `EvidenceItem`, so adding a kind that carries a quote fails
 * `tsc` here rather than silently exempting it.
 */
function quotesOf(item: EvidenceItem, label: string): Array<{ quote: QuoteEvidence; path: string }> {
  switch (item.kind) {
    case 'quote':
      return [{ quote: item, path: label }];
    case 'amendment_chain':
      return item.hops.map((hop, h) => ({ quote: hop.quote, path: `${label}.hops[${h}].quote` }));
    case 'cross_reference':
      return [
        { quote: item.from, path: `${label}.from` },
        { quote: item.to, path: `${label}.to` },
      ];
    case 'absence':
      return [];
  }
}

/** A hash in message form: enough to tell two apart, short enough to read. */
function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…`;
}

/**
 * The cross-field stage: deterministic, no clock, no I/O, and a plain function
 * rather than a refinement so the schema above stays walkable.
 *
 * Every rule here exists because the sign gate would otherwise be bypassable
 * by a record that is structurally impeccable:
 *
 *  - **An id must name exactly one thing.** `challenges[]`, `reading.elements[]`
 *    and `openQuestions[]` each carry ids that other fields point at, and
 *    uniqueness is logically prior to the resolution rules below: resolution
 *    only means something once an id names one entry. Duplicates are the
 *    subtler failure, because they satisfy the letter of resolution while
 *    defeating its purpose — an adverse cell naming `C1` when two challenges
 *    carry `C1`, one `CONFIRMED` and one `OPEN_QUESTION`, resolves to a real
 *    challenge twice over, and a gate looking for the adjudicator's judgement
 *    finds two and must guess which one adjudicated the gap.
 *  - **A cell's `readingElementId` must name a reading element.** The id is
 *    optional because a cell walked one way may have no counterpart the other,
 *    but a *stated* id that resolves to nothing is a coverage claim about a
 *    proposition the reading never made.
 *  - **Adverse coverage must name the challenge that addressed it.** Without
 *    the link a result can report `UNMAPPED` coverage while carrying no
 *    `MISMATCH` and no `OPEN_QUESTION` — and a gate reading only verdicts
 *    would sign it, with the adjudicator's judgement silently bypassed. The
 *    converse is enforced too: a `MAPPED` cell citing a challenge is claiming
 *    an adjudication for something that did not need one.
 *  - **A reached verdict must state what was reached, and every verdict must
 *    say what it rests on.** `CONFIRMED` and `MISMATCH` are adjudications and
 *    require a resolution; `OPEN_QUESTION` is the absence of one and does not.
 *    A present-but-blank resolution is rejected under any verdict — whitespace
 *    is not an adjudication, and accepting it would let the requirement be
 *    satisfied by a spacebar. The evidence obligation is not conditional in the
 *    same way:
 *
 *        CONFIRMED      non-blank resolution        adjudicationEvidence >= 1
 *        MISMATCH       non-blank resolution        adjudicationEvidence >= 1
 *        OPEN_QUESTION  no resolution, or non-blank adjudicationEvidence >= 1
 *
 *    `.min(1)` on `adjudicationEvidence` carries the third column structurally,
 *    for all three verdicts alike, which is why no rule about cardinality
 *    appears here. What this stage adds is the absence-sole rule below applied
 *    to that array as well, so that an adjudication resting entirely on a
 *    search that found nothing is refused exactly as a raised challenge is.
 *  - **`absence` may never be the sole evidence for a conclusion.** Factory
 *    spec §2.2 states this and claims the schema enforces it; the schema
 *    cannot. `.min(1)` counts items and cannot tell one kind from another, so
 *    a conclusion resting entirely on "I searched and did not find it" parsed
 *    clean. A deterministic search establishes that a phrase does not occur;
 *    it cannot establish that the law contains no economically equivalent
 *    criterion under different words, which is a legal judgment. So `absence`
 *    is a component of reasoning — the quoted operative provision says what
 *    the test is, the absence check says the sought criterion is not in it —
 *    and never the whole of it. Note the rule is over *kinds*, not counts:
 *    two absence items are as insufficient as one.
 *  - **A `docId` must be pinned once.** Two pins sharing a `docId` pin one
 *    document at two texts, and a quote citing that `docId` then resolves to
 *    two authoritative sources. It is the duplicate-id defect one layer down,
 *    sitting under the field that decides what a conclusion rests on.
 *  - **Evidence must rest on the corpus this record itself pins.** Every
 *    quote's `docId` must name a pin, and its `sha256Normalized` must equal
 *    that pin's. Otherwise the evidence came from a text the signature never
 *    froze: freshness would compare the pinned hash against the world while
 *    the reasoning stood on something else. An `absence` item carries no hash,
 *    so only the membership half applies to its `docIds` — but it applies, a
 *    search over a document this record does not pin being a claim about a
 *    text nothing will ever re-check.
 *
 *    `checkEvidenceSet` does not answer this. It validates quotes against the
 *    corpus **on disk**, which is a different question from whether the record
 *    agrees with its own pins: a record can be internally coherent and wrong
 *    about the world, or right about the world and internally incoherent.
 *    Both checks are wanted and neither substitutes for the other.
 *
 *  - **A gap names exactly one identity, and in the field its register owns.**
 *    `gaps[].docId` and `gaps[].sourceId` are both structurally optional
 *    because "which one" depends on `kind`, so the rule is here:
 *
 *        corpus_gap   exactly one of docId and sourceId
 *        closure_gap  docId required, sourceId absent
 *
 *    A `corpus_gap` naming both states two different defects as one and leaves
 *    a reader to guess which; naming neither states nothing at all. A
 *    `closure_gap` naming a source is a category error rather than an omission:
 *    traversal walks documents, so a source has no position in the closure to
 *    be excluded from.
 *
 *    Cardinality alone does not close the original defect, because
 *    `docId: 'SRC-005'` satisfies it. That is why `registers` exists: given the
 *    corpus index and the source register, an identifier can be checked against
 *    the register it belongs to, and a source id recorded as a document is
 *    rejected outright rather than merely discouraged.
 *
 *    The register rules come in **mirrored pairs**, and the symmetry is the
 *    point: a rule that policed only one direction would leave the same lie
 *    expressible the other way round. A `docId` naming a source is rejected and
 *    so is a `sourceId` naming a document; a `closure_gap` over a document the
 *    index does *not* hold is rejected and so is a `corpus_gap` over one it
 *    *does*, because each kind asserts the opposite membership and a gap
 *    contradicting its own kind says nothing a reader can act on. Each
 *    identifier yields at most one problem, so an id in the wrong field is one
 *    defect rather than two.
 *
 *    The registers are optional because they are files and this module reads
 *    none; the cardinality rules above run either way, and only the
 *    cross-register checks need them.
 *
 *  - **A gap-bearing dossier carries no judgment at all.**
 *
 *        gaps.length > 0  =>  reading.elements == []  and  coverage.cells == []
 *                             and challenges == []    and  openQuestions == []
 *
 *    `reading`, `coverage`, `challenges` and `openQuestions` are all required
 *    by the schema, so "the reading is absent" is not a representable record.
 *    The truthful gap-bearing shape is the required containers *canonically
 *    empty* with `gaps[]` carrying the explanation: no agent judgment was
 *    successfully produced, so the judgment-bearing containers hold nothing and
 *    `gaps[]` says why.
 *
 *    **Unconditional on where the run stopped, deliberately.** The record
 *    carries no field saying which role halted, so a rule conditioned on that
 *    would be unenforceable — and it would be the wrong rule anyway. A gap says
 *    the evidence surface itself was incomplete, and §3.0 forbids topping a
 *    reading up: a repaired closure restarts verification from the reader.
 *    Preserving judgments past a gap would give the dossier a hybrid
 *    provenance — some formed under the old closure, some under the new — with
 *    `corpusClosureSha256` able to describe only one of them. An
 *    `OPEN_QUESTION` is the opposite case and carries no such problem: the
 *    surface was complete and simply did not settle the proposition, so a
 *    completed run keeps its whole dossier.
 *
 *    Each container is reported separately rather than as one conjunction,
 *    because a single combined message would let three empty containers mask
 *    the fourth that is not.
 *
 *  - **An empty closure never travels alone.** `computeClosure` over an empty
 *    entry set returns `EMPTY_CLOSURE_SHA256` rather than throwing, and that
 *    digest is *faithful*: the entitled set really is empty. So the rule is not
 *    "never compute it" — a gap-bearing dossier still has to fill
 *    `corpusClosureSha256` and there is no other value it could carry. The rule
 *    is that an empty closure with an empty `gaps[]` is unrepresentable.
 *    Unaccompanied, that digest is a dossier claiming an evidence surface it
 *    never had; accompanied, it is the honest record of a requirement whose
 *    sources serve no document.
 *
 * Every problem is collected before throwing, so a result can be repaired in
 * one pass rather than one round trip per defect.
 */
export function assertResultConsistency(
  result: VerificationResult,
  registers?: GapIdentityRegisters,
): void {
  const problems: string[] = [];
  const challengeIds = new Set(result.challenges.map((c) => c.id));
  const readingElementIds = new Set(result.reading.elements.map((e) => e.id));

  // Uniqueness first: the resolution rules below read these ids as if each one
  // named a single entry, and that is only true once this has been checked.
  const uniqueIn: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['challenges[]', result.challenges.map((c) => c.id)],
    ['reading.elements[]', result.reading.elements.map((e) => e.id)],
    ['openQuestions[]', result.openQuestions.map((q) => q.id)],
  ];
  for (const [path, ids] of uniqueIn) {
    for (const id of repeatedIds(ids)) {
      problems.push(
        `${path}: id ${id} appears more than once; an id must name exactly one entry, or a reference to it resolves to several`,
      );
    }
  }

  // The same rule over the pins, and reported in its own words because the
  // consequence is its own: a repeated docId is a document pinned at two
  // texts, so a quote citing it is evidence from whichever one you pick.
  for (const docId of repeatedIds(result.corpus.map((pin) => pin.docId))) {
    problems.push(
      `corpus[]: docId ${docId} is pinned more than once; a docId must name exactly one pinned text, or a quote citing it rests on two`,
    );
  }

  // Quotes are checked against the *set* of hashes pinned for their docId
  // rather than one chosen pin. With docIds unique — which the rule above
  // enforces — the set holds one hash and the check is exact; where it does
  // not, the duplicate is already reported and a quote agreeing with either
  // pin should not also be reported as contradicting the other. One defect,
  // one problem.
  const pinnedHashes = new Map<string, Set<string>>();
  for (const pin of result.corpus) {
    const hashes = pinnedHashes.get(pin.docId) ?? new Set<string>();
    hashes.add(pin.sha256Normalized);
    pinnedHashes.set(pin.docId, hashes);
  }

  /**
   * The evidence rules, applied to one conclusion's evidence set.
   *
   * `label` is the path of the **array**, not of the conclusion, so that a
   * challenge's two arrays are told apart in every message. Reporting both as
   * `challenges[0] (C1)` would leave a reader who has to repair the record
   * unable to see which producer's evidence is at fault — and the two have
   * different owners, so "somewhere in this challenge" is not an address.
   */
  const checkEvidence = (items: readonly EvidenceItem[], label: string): void => {
    // Through the shared predicate rather than inline, so the reader's seam and
    // this boundary cannot come to disagree about what "sole evidence" means.
    // `.min(1)` makes an empty set unreachable through the schema, but this
    // function is exported and callable directly, and the predicate handles the
    // empty case: it has no absence item to object to.
    if (evidenceIsSolelyAbsence(items)) {
      problems.push(
        `${label}: every evidence item is an absence claim; lexical absence cannot establish that no equivalent criterion exists under different words, so it may not be the sole evidence for a conclusion`,
      );
    }

    items.forEach((item, i) => {
      const itemLabel = `${label}[${i}]`;

      for (const { quote, path } of quotesOf(item, itemLabel)) {
        const hashes = pinnedHashes.get(quote.docId);
        if (hashes === undefined) {
          problems.push(`${path}: quote names docId ${quote.docId}, which no entry in corpus[] pins`);
        } else if (!hashes.has(quote.sha256Normalized)) {
          problems.push(
            `${path}: quote pins ${quote.docId} at hash ${shortHash(quote.sha256Normalized)}, but corpus[] pins it at ${[
              ...hashes,
            ]
              .map(shortHash)
              .join(', ')}`,
          );
        }
      }

      if (item.kind === 'absence') {
        for (const docId of item.docIds) {
          if (!pinnedHashes.has(docId)) {
            problems.push(
              `${itemLabel}: absence claim names docId ${docId}, which no entry in corpus[] pins; a search over a document this record does not pin rests on a text nothing will re-check`,
            );
          }
        }
      }
    });
  };

  // Every evidence set the record carries, from the one enumeration, each
  // checked under its own address. Separately, because a challenge's two arrays
  // checked as a concatenation would let a sole-absence adjudication hide
  // behind the prosecutor's quote — the two conclusions are distinct and each
  // must stand on evidence of its own. And from `evidenceSetsOf` rather than
  // from a list written here, because this function keeping its own list is how
  // the list came to exist in three places: `adjudicationEvidence` reached the
  // record while two of the three went on describing a challenge with one
  // evidence array, and neither said so.
  for (const set of evidenceSetsOf(result)) {
    checkEvidence(set.items, set.recordPath);
  }

  result.coverage.cells.forEach((cell, i) => {
    const label = `coverage.cells[${i}]`;
    if (cell.readingElementId !== undefined && !readingElementIds.has(cell.readingElementId)) {
      problems.push(
        `${label}: names readingElementId ${cell.readingElementId}, which no entry in reading.elements[] carries`,
      );
    }
    if (ADVERSE_COVERAGE.has(cell.verdict)) {
      if (cell.challengeId === undefined) {
        problems.push(
          `${label}: verdict ${cell.verdict} carries no challengeId; adverse coverage must name the challenge that adjudicated it`,
        );
      } else if (!challengeIds.has(cell.challengeId)) {
        problems.push(
          `${label}: verdict ${cell.verdict} names challengeId ${cell.challengeId}, which no entry in challenges[] carries`,
        );
      }
    } else if (cell.challengeId !== undefined) {
      problems.push(
        `${label}: a MAPPED cell names challengeId ${cell.challengeId}; a mapped cell has nothing to adjudicate`,
      );
    }
  });

  result.challenges.forEach((challenge, i) => {
    const label = `challenges[${i}] (${challenge.id})`;
    if (RESOLVED_VERDICTS.has(challenge.verdict)) {
      if (!isAdjudicated(challenge.resolution)) {
        problems.push(
          `${label}: verdict ${challenge.verdict} requires a non-empty resolution; ${
            challenge.resolution === undefined ? 'none is present' : 'the one present is blank'
          }`,
        );
      }
    } else if (challenge.resolution !== undefined && challenge.resolution.trim().length === 0) {
      problems.push(
        `${label}: verdict ${challenge.verdict} may omit a resolution, but a blank one is not an adjudication`,
      );
    }
  });

  const knownDocIds = registers === undefined ? undefined : new Set(registers.docIds);
  const knownSourceIds = registers === undefined ? undefined : new Set(registers.sourceIds);

  result.gaps.forEach((gap, i) => {
    const label = `gaps[${i}]`;
    const docId = gap.docId;
    const sourceId = gap.sourceId;

    // Cardinality first, and per kind. `closure_gap` gets its own two messages
    // rather than sharing the `corpus_gap` one, because the reasons differ: a
    // closure gap always has a document, and never has a source.
    if (gap.kind === 'closure_gap') {
      if (docId === undefined) {
        problems.push(
          `${label}: a closure_gap carries no docId; the document exists and traversal did not reach it, so there is always a document to name`,
        );
      }
      if (sourceId !== undefined) {
        problems.push(
          `${label}: a closure_gap may not name a sourceId (${sourceId}); entitlement traversal walks documents, so a source has no position in the closure to be excluded from`,
        );
      }
    } else if ((docId === undefined) === (sourceId === undefined)) {
      problems.push(
        `${label}: a corpus_gap must name exactly one of docId and sourceId, and this one names ${
          docId === undefined ? 'neither' : `both (docId ${docId}, sourceId ${sourceId})`
        }; a document the corpus does not hold and a source no document serves are different populations, and a gap that names both or neither states neither`,
      );
    }

    // Then the registers, which are the only thing that can tell a document id
    // from a source id. Each identifier yields at most one problem: an id in
    // the wrong field is one defect, and reporting it again as "absent from the
    // register it is not in" would be the same defect counted twice.
    if (knownDocIds !== undefined && knownSourceIds !== undefined) {
      if (docId !== undefined) {
        if (knownSourceIds.has(docId)) {
          problems.push(
            `${label}: docId ${docId} names an entry in the source register, not a document; record it as sourceId — a source id sitting in a field called docId makes the structured record say "document" while meaning "source"`,
          );
        } else if (gap.kind === 'closure_gap' && !knownDocIds.has(docId)) {
          problems.push(
            `${label}: closure_gap names docId ${docId}, which the corpus index does not hold; a document the corpus does not hold is a corpus_gap, not a document the closure failed to reach`,
          );
        } else if (gap.kind === 'corpus_gap' && knownDocIds.has(docId)) {
          problems.push(
            `${label}: corpus_gap names docId ${docId}, which the corpus index does hold; a corpus_gap asserts the document is absent, so naming a held document contradicts the record's own kind — a document the corpus holds but the traversal did not reach is a closure_gap`,
          );
        }
      }
      if (sourceId !== undefined) {
        if (knownDocIds.has(sourceId)) {
          problems.push(
            `${label}: sourceId ${sourceId} names a document in the corpus index, not a source; record it as docId — the mirror of a source id recorded as a document`,
          );
        } else if (!knownSourceIds.has(sourceId)) {
          problems.push(
            `${label}: sourceId ${sourceId} matches no entry in the source register; a gap in source coverage has to name a source that was actually cited`,
          );
        }
      }
    }
  });

  // A gap-bearing dossier carries no substantive judgment. Reported one
  // container at a time rather than as a single conjunction, so each half of
  // the rule can fail on its own: a combined message would let three empty
  // containers cover for the fourth that is not.
  if (result.gaps.length > 0) {
    const populated: ReadonlyArray<readonly [string, number]> = [
      ['reading.elements[]', result.reading.elements.length],
      ['coverage.cells[]', result.coverage.cells.length],
      ['challenges[]', result.challenges.length],
      ['openQuestions[]', result.openQuestions.length],
    ];
    for (const [path, count] of populated) {
      if (count === 0) continue;
      problems.push(
        `gaps[]: the record carries ${result.gaps.length} gap${
          result.gaps.length === 1 ? '' : 's'
        } and ${path} carries ${count} entr${
          count === 1 ? 'y' : 'ies'
        }; a gap means the evidence surface itself was incomplete, so agent verification stopped and every judgment-bearing container must be canonically empty — a repaired closure restarts the run rather than topping the reading up, and a completed run that merely wished for another document records an OPEN_QUESTION, not a gap`,
      );
    }
  }

  // The empty closure never travels alone.
  if (result.corpusClosureSha256 === EMPTY_CLOSURE_SHA256 && result.gaps.length === 0) {
    problems.push(
      `corpusClosureSha256: the entitled closure is empty (${shortHash(
        EMPTY_CLOSURE_SHA256,
      )}, the digest of the empty string) and gaps[] is empty too; an empty closure is a faithful hash of an evidence surface that holds nothing, so it is only ever truthful accompanied by the gap that says why — unaccompanied it is a dossier claiming an entitlement it never had`,
    );
  }

  if (problems.length > 0) throw new ResultConsistencyError(problems);
}

/**
 * Structure, then consistency, in that order — a cross-field rule cannot be
 * evaluated over a value whose fields have not been checked.
 */
export function parseVerificationResult(
  raw: unknown,
  registers?: GapIdentityRegisters,
): VerificationResult {
  const parsed = verificationResultSchema.parse(raw);
  assertResultConsistency(parsed, registers);
  return parsed;
}

/**
 * The hash a signature pins: canonical, and *semantic* rather than byte-wise.
 *
 * Reformatting `verification-result.json` or reordering its keys must produce
 * the identical digest. Hashing the file's bytes would make pretty-printing
 * invalidate a signature over a record that did not change — the
 * raw-versus-normalized lesson from the corpus, one layer up: cosmetic churn
 * that raises a trust alarm teaches everyone to ignore the alarm, and then it
 * is not an alarm.
 *
 * The domain is `verificationResultSchema.parse()`'s output rather than the
 * argument as handed in, matching `requirementSha256`'s precedent. That
 * normalises an absent optional against one explicitly set to `undefined`, and
 * it means a value that has drifted out of the schema cannot be hashed at all
 * — a signature over an invalid record is worse than a missing one.
 *
 * Cross-field consistency is deliberately *not* re-checked here. The hash
 * answers "what is this record?", and `parseVerificationResult` answers
 * "should this record be signed?". Folding the second into the first would
 * make it impossible to compute the current hash of a record that has become
 * inconsistent — which is exactly the moment `stale_result` needs the number.
 */
export function resultSha256(result: VerificationResult): string {
  return sha256Hex(canonicalJson(verificationResultSchema.parse(result)));
}
