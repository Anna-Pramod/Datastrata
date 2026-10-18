/**
 * The two gap classes, and the machinery that decides which one happened.
 *
 * §4.2 keeps `corpus_gap` and `closure_gap` apart because they are answered
 * differently — one by ingesting a document, the other by recording a
 * relationship or widening the traversal policy — and because collapsing them
 * "would hide exactly the population B3 needs to count". A pipeline that
 * reported one kind for both would still halt correctly and would make the
 * counts meaningless.
 *
 * **The machinery classifies; the role does not.** A role may say *that* it
 * needed a document it could not reach, and it may name the document. Whether
 * that document is absent from the corpus or merely unreachable within it is a
 * fact about `corpus/index.json` and the closure, not a judgment, so it is
 * derived here from `EntitledClosure.entitled` and `EntitledClosure.corpusHolds`
 * rather than taken from the role's own `kind`. An agent's belief about corpus
 * membership is not evidence of corpus membership, and a pipeline that trusted
 * it would let a model decide which population its own halt is counted in.
 *
 * **`corpus_gap` has two shapes and only one of them names a document.**
 *
 *     corpus_gap  + sourceId   nothing in the corpus serves this source
 *     corpus_gap  + docId      an expected document is absent from the corpus
 *     closure_gap + docId      the document exists; traversal did not reach it
 *
 * The first shape is unreachable from the closure machinery — `docsForSources`
 * returns only documents it found, so it can never hand `computeClosure` an id
 * to reject, and `computeClosure` over an empty entry set builds a closure over
 * nothing and throws nothing. It is produced here instead, before any role runs,
 * from the requirement's own `sources[]`.
 *
 * **`ClosureEntryNotFoundError` has no producer here, deliberately.** It is
 * thrown when an entry document the corpus does not hold is seeded into a
 * closure, and `entitlement.ts` lets it escape rather than converting it: a
 * closure that cannot be *built* is not a run that halted partway, it is a run
 * that never had an entitlement to halt within, and nothing exists yet for a
 * gap to be recorded against. A converter for it lived here briefly with no
 * caller — `EntitledClosure.forSources` seeds only ids `docsForSources` found,
 * so the throw cannot arise through the pipeline at all — and was removed. If a
 * path is ever built that seeds an arbitrary entry id, the shape it needs
 * (`corpus_gap` + `docId`) is what `gapForUnreachableDocument` already returns.
 *
 * Pure: no filesystem, no network, no clock. The closure it is handed did all
 * the reading.
 */

import type { VerificationResult } from '../verification/result';
import { AmbiguousDocumentReferenceError } from './document-reference';
import type { EntitledClosure } from './entitlement';

/**
 * A gap in the shape the record carries it, which is the shape produced here.
 *
 * Taken off `verificationResultSchema` rather than declared again: the sign
 * gate refuses on `result.gaps[]`, so a producer emitting a near-miss of that
 * shape would produce halts the gate cannot read.
 */
export type PipelineGap = VerificationResult['gaps'][number];

/**
 * A gap that names a document, which is every gap a *role* can produce.
 *
 * The narrowing is load-bearing rather than decorative: a role knows about
 * documents and nothing else, so a producer handing one back has to guarantee
 * `docId` is present, and `roleGapSchema` requires it. Widening this to
 * `PipelineGap` would make the seam schema and the producer disagree about a
 * required field, and the disagreement would only surface when a gap reached
 * the record with neither identity filled in.
 */
export type DocumentGap = PipelineGap & { docId: string };

/**
 * A role claimed a gap over a document it was entitled to read.
 *
 * Not a gap, and not silently converted into one. The role held the text — the
 * closure handed it over — so a halt naming it is a false halt, and recording it
 * as a gap would put a document in `gaps[]` that a human is then asked to
 * ingest or relate, when the corpus already holds it inside the closure. It is
 * a defect in the role's output and it is named as one.
 */
export class EntitledDocumentIsNotAGapError extends Error {
  constructor(
    readonly docId: string,
    readonly closureSha256: string,
    /** How the role named it, when that differs from the id. */
    readonly reference: string = docId,
  ) {
    super(
      `${docId}${reference === docId ? '' : ` (named as ${reference})`} is inside the entitled closure ${closureSha256}, so it cannot be a gap: the role was handed this document's text, and a halt naming it would send a human to ingest a document the corpus already holds`,
    );
    this.name = 'EntitledDocumentIsNotAGapError';
  }
}

/**
 * Which kind of gap a document the closure did not hand over represents.
 *
 * The single point where the two classes are told apart. Every producer below
 * goes through it, so a change to the discrimination changes both kinds
 * together rather than leaving one caller behind.
 */
export function classifyUnreachableDocument(
  closure: EntitledClosure,
  docId: string,
): 'corpus_gap' | 'closure_gap' {
  if (closure.entitled(docId)) {
    throw new EntitledDocumentIsNotAGapError(docId, closure.sha256);
  }
  return closure.corpusHolds(docId) ? 'closure_gap' : 'corpus_gap';
}

/**
 * The gap a refused document request produces.
 *
 * `detail` states the answer as well as the fact, because the two kinds are
 * repaired by different people doing different things and a reader of
 * `gaps[]` should not have to know the taxonomy to act on one.
 *
 * **The reference is resolved before it is classified.** A role names a
 * document in its own words; `EntitledClosure.resolveDocumentReference` says
 * which held document, if any, those words identify. A resolved reference is
 * classified under the document's own id — so a held document named by a
 * declared alias is the `closure_gap` it is, never a `corpus_gap` whose
 * "ingest it" would send a human after a document already ingested — and the
 * detail keeps the role's identifier beside it. An unknown reference, one no
 * id or declared alias identifies, is a `corpus_gap` under the reference
 * itself, which is all that can honestly be said of it. An ambiguous one is
 * refused, because choosing for the role would be the engine deciding what
 * the role meant.
 */
export function gapForUnreachableDocument(
  closure: EntitledClosure,
  reference: string,
  context?: string,
): DocumentGap {
  const resolution = closure.resolveDocumentReference(reference);
  if (resolution.outcome === 'ambiguous') {
    throw new AmbiguousDocumentReferenceError(reference, resolution.candidates);
  }

  let kind: 'corpus_gap' | 'closure_gap';
  let docId: string;
  let because: string;
  if (resolution.outcome === 'unknown') {
    kind = 'corpus_gap';
    docId = reference;
    because = `no document id or declared alias in the corpus identifies ${reference}; if it names a document the corpus should hold, ingest it (or declare the alias), then restart verification`;
  } else {
    docId = resolution.docId;
    if (closure.entitled(docId)) throw new EntitledDocumentIsNotAGapError(docId, closure.sha256, reference);
    kind = classifyUnreachableDocument(closure, docId);
    const named = docId === reference ? '' : ` (named by the role as ${reference})`;
    because =
      kind === 'closure_gap'
        ? `the corpus holds ${docId}${named}, but the entitled closure ${closure.sha256} does not reach it under the traversal policy in force; record the relationship that connects it or widen the policy, then restart verification`
        : `the corpus holds no document ${docId}${named} at all; ingest it, then restart verification`;
  }
  return {
    kind,
    docId,
    detail: context === undefined ? because : `${context} — ${because}`,
  };
}

/**
 * The shape no document id can express: a source nothing in the corpus serves.
 *
 * One gap per unserved source rather than one gap for the set, because each
 * source is repaired on its own — finding the act behind `SRC-006` does not
 * find the act behind `SRC-007` — and a single gap naming three sources would
 * be reported resolved when one of them was.
 *
 * The identifier goes in `sourceId` and never in `docId`. A `SRC-###` value in
 * a field called `docId` would make the machine-readable record say "document"
 * while `detail` explained it meant "source", which is the exact semantic debt
 * the two-identity gap shape exists to remove.
 */
export function corpusGapsForUnservedSources(sourceIds: readonly string[]): PipelineGap[] {
  return sourceIds.map((sourceId) => ({
    kind: 'corpus_gap' as const,
    sourceId,
    detail: `no document in the corpus serves ${sourceId}: the requirement cites this source, and the evidence surface it names does not exist rather than being unreachable — ingest the material this source cites, then restart verification`,
  }));
}

/**
 * Every cited source the corpus does not serve — one gap each, whatever the
 * closure's size.
 *
 * # The decision this reverses, and why it was wrong
 *
 * This function was previously `emptyClosureGaps`, guarded on
 * `closure.docIds.length === 0`, and its reasoning was recorded here:
 *
 * > *"Guarded on the closure being empty rather than on the source list, so a
 * > requirement one of whose three sources is served produces no gap here: the
 * > closure it opens onto is real, and `sources[]` is an entry point rather
 * > than a fence at the closure's edge. A per-source rule would report a gap
 * > every time a source's document happened to be reached through another
 * > source's entry instead of its own."*
 *
 * The stated worry does not arise, and the check it rejected is not the check
 * it described. `corpusServes(S)` asks whether **any document declares
 * `serves: [S]`** — the same declaration `docsForSources` selects entry
 * documents by. A document that serves `S` therefore makes `corpusServes(S)`
 * true no matter which source's entry the traversal happened to reach it
 * through, so the false positive the guard was protecting against cannot occur.
 * What the guard actually suppressed was the true positive: a source that
 * **nothing serves at all**.
 *
 * The cost was measured against the real pack this engine ships knowledge for.
 * Ten of its sixteen requirements cite at least one unserved source; nine of
 * those obtain a non-empty closure from their *other* sources and, under the old
 * guard, published a Complete, zero-gap, signable dossier over an evidence
 * surface their own author had declared incomplete.
 *
 * # The rule
 *
 * A requirement's `sources[]` is an **authored provenance claim**. A factory
 * holding only `SRC-A` has no authority to decide `SRC-B` was unnecessary
 * because `SRC-A` yielded a usable document — that lets missing evidence become
 * quietly thinner evidence, over which an agent then forms a judgment. So
 * source completeness is checked per source and is **independent of closure
 * cardinality**:
 *
 * ```text
 * some entitled evidence exists        closure.docIds.length > 0
 * every declared source is backed      ∀ s ∈ sources: corpusServes(s)
 * ```
 *
 * Two propositions. The second is this function's.
 *
 * **The filter is load-bearing and not tidiness.** `corpusGapsForUnservedSources`
 * asserts of every id it is handed that nothing serves it, and checks nothing —
 * it was correct before only because its one caller had already established
 * that the closure, and therefore every source, was empty of documents. Handing
 * it the raw list under the new rule would emit a gap claiming
 * `no document in the corpus serves SRC-004` about a source that is served.
 * Removing the old guard without adding this filter converts an under-report
 * into a false report.
 */
export function unservedSourceGaps(
  closure: EntitledClosure,
  sourceIds: readonly string[],
): PipelineGap[] {
  return corpusGapsForUnservedSources(sourceIds.filter((id) => !closure.corpusServes(id)));
}
