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
 */
const ADVERSE_COVERAGE: ReadonlySet<string> = new Set(['UNMAPPED', 'UNSUPPORTED', 'UNCERTAIN']);

/** The verdicts for which an adjudication has been reached and must be stated. */
const RESOLVED_VERDICTS: ReadonlySet<string> = new Set(['CONFIRMED', 'MISMATCH']);

/**
 * A pinned corpus document, as the closure held it at verification time. Both
 * hashes are retained: `sha256Normalized` is the text a conclusion rests on,
 * and `sha256Raw` moving alone means the publisher reissued the file without
 * changing the words — advisory, not invalidating.
 */
const corpusPinSchema = z
  .object({
    docId: z.string(),
    versionLabel: z.string(),
    sha256Raw: z.string(),
    sha256Normalized: z.string(),
    normalizerVersion: z.string(),
  })
  .strict();

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
 */
const challengeSchema = z
  .object({
    id: z.string(),
    lens: z.string(),
    statement: z.string(),
    verdict: challengeVerdictSchema,
    evidence: z.array(evidenceItemSchema).min(1),
    resolution: z.string().optional(),
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
 * A structural gap in what was available to read: a document the corpus does
 * not hold, or one the closure never reached. Structured rather than left to
 * the narrative because the sign CLI must refuse an unresolved gap, and a
 * refusal that depends on parsing prose is not a refusal. An empty array is
 * the normal case.
 */
const gapSchema = z
  .object({
    kind: z.enum(['corpus_gap', 'closure_gap']),
    docId: z.string(),
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
    resultSchemaVersion: z.literal('1.0.0'),
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
 *  - **A reached verdict must state what was reached.** `CONFIRMED` and
 *    `MISMATCH` are adjudications and require a resolution; `OPEN_QUESTION`
 *    is the absence of one and does not. A present-but-blank resolution is
 *    rejected under any verdict — whitespace is not an adjudication, and
 *    accepting it would let the requirement be satisfied by a spacebar.
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
 * Every problem is collected before throwing, so a result can be repaired in
 * one pass rather than one round trip per defect.
 */
export function assertResultConsistency(result: VerificationResult): void {
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

  /** The evidence rules, applied to one conclusion's evidence set. */
  const checkEvidence = (items: readonly EvidenceItem[], label: string): void => {
    // `.min(1)` makes an empty set unreachable through the schema, but this
    // function is exported and callable directly: an empty set has no absence
    // item to object to, and `every` over it would report one.
    if (items.length > 0 && items.every((item) => item.kind === 'absence')) {
      problems.push(
        `${label}: every evidence item is an absence claim; lexical absence cannot establish that no equivalent criterion exists under different words, so it may not be the sole evidence for a conclusion`,
      );
    }

    items.forEach((item, i) => {
      const itemLabel = `${label}.evidence[${i}]`;

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

  result.reading.elements.forEach((element, i) => {
    checkEvidence(element.evidence, `reading.elements[${i}] (${element.id})`);
  });
  result.challenges.forEach((challenge, i) => {
    checkEvidence(challenge.evidence, `challenges[${i}] (${challenge.id})`);
  });

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

  if (problems.length > 0) throw new ResultConsistencyError(problems);
}

/**
 * Structure, then consistency, in that order — a cross-field rule cannot be
 * evaluated over a value whose fields have not been checked.
 */
export function parseVerificationResult(raw: unknown): VerificationResult {
  const parsed = verificationResultSchema.parse(raw);
  assertResultConsistency(parsed);
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
