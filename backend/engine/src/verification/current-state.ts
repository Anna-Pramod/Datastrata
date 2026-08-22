/**
 * How the world *now* is put into the shape a signature is compared against.
 *
 * `deriveStaleness` answers "did the world move underneath this signature?" by
 * comparing an entry against a `CurrentState`. Producing that `CurrentState` is
 * a separate job, and it is the one every surface that judges a signature has
 * to do first: the sign CLI before and after it writes, the review sheet, and —
 * from the public resolver seam onwards — the deployed site.
 *
 * **Each of those built it themselves.** The sign CLI had a private
 * `currentStateOf`; the review sheet assembled the same six fields in an object
 * literal of its own. Two constructions of one record already disagreed about
 * nothing only because nobody had changed either yet, and a third would have
 * made "the site and the review sheet agree about this signature" a coincidence
 * rather than a property. What the freshness comparison is *over* is exactly as
 * load-bearing as the comparison itself, so it belongs in one place with the
 * type it produces.
 *
 * **This is not a second freshness algorithm and cannot become one.** It
 * decides nothing: it calls the same canonical hash producers the signing path
 * calls, over the inputs it is handed, and returns a record. Every judgement
 * still happens in `deriveStaleness` and `resolveNormalizerChanged`.
 *
 * **One producer, one traversal, two widths.** A pinned corpus document is
 * recorded five fields wide — a signature and a verification result both carry
 * `versionLabel` — and compared four fields wide, because a publisher's label is
 * display and comparing it would make a re-labelled but byte-identical document
 * look like drift. Those are two different obligations over one walk of the
 * closure, and the walk had already been written twice: `producePins` did it
 * without the label, and `src/cli/sign.ts` did it again with one. So the
 * producer emits the **wider** shape and `pinsForFreshness` projects it onto the
 * narrower, rather than each caller widening a narrow one for itself:
 *
 *     producePins  ──▶  VerificationPins        (docId, versionLabel, 3 hashes)
 *                         │                       what a record and a ledger pin
 *                         ├──▶ pinsForFreshness ──▶ CurrentState  (docId, 3 hashes)
 *                         │                          what deriveStaleness compares
 *                         └──▶ the signature candidate, and the result
 *
 * The direction matters: widening is a second visit to the corpus and narrowing
 * is not, so only this direction has one traversal in it.
 *
 * Pure, like the rest of `src/verification/`: the closure and the parsed result
 * are handed in, and the corpus is consulted only through an accessor its
 * caller already holds. Nothing here opens a file.
 */

import type { AuthoredRequirement } from '../types';
import { requirementInputSha256 } from './canonical';
import type { RenderContext } from './render';
import { resultSha256, type VerificationResult } from './result';
import {
  candidateConditionSha256,
  candidateRenderedConditionSha256,
  type CorpusPin,
} from './sign';
import type { CurrentCorpusDocument, CurrentState } from './staleness';

/**
 * The corpus, reduced to the one question this module asks of it.
 *
 * A structural type rather than `LoadedCorpus`, so that nothing here depends on
 * the module that opens files — and so a caller holding a corpus by some other
 * route can still be compared against.
 *
 * `versionLabel` is asked for even though freshness never compares it, because
 * the *record* pins it: a signature and a verification result both carry the
 * label the document bore when it was read, and a producer that could not see
 * it would force every record-shaped caller to walk the corpus a second time to
 * fetch it. Which is exactly what `src/cli/sign.ts` did.
 */
export interface CurrentCorpusSource {
  document(docId: string): {
    versionLabel: string;
    sha256Raw: string;
    sha256Normalized: string;
    normalizerVersion: string;
  };
}

/**
 * Everything a `CurrentState` is derived from.
 *
 * The closure arrives already computed, with its hash and its document ids,
 * because computing it is where the surfaces legitimately differ: the sign CLI
 * refuses an uncomputable closure with `unresolved_gap`, the review sheet
 * records it as an integrity problem beside the requirement, and a resolver
 * raises an integrity failure. Those are three different reports of one
 * condition, and folding them in here would force one of them onto all three.
 */
export interface PinInput {
  /** The authored requirement, which is what every pinned hash is taken over. */
  requirement: AuthoredRequirement;
  /** `{ factTypes, catalogues }` — what the rendered condition is rendered with. */
  renderContext: RenderContext;
  /** The entitled closure as it stands now. */
  closure: { sha256: string; docIds: readonly string[] };
  /** The corpus the closure's documents are read out of. */
  corpus: CurrentCorpusSource;
}

export interface CurrentStateInput extends PinInput {
  /** The pinned verification result, already parsed. */
  result: VerificationResult;
}

/**
 * The pins that exist before a result does: `CurrentState` minus `resultSha256`,
 * with the corpus at its **record** width rather than its freshness width.
 *
 * Two subtractions, and each is the point rather than a convenience.
 *
 * `resultSha256` is necessarily post-assembly — the result does not exist at the
 * moment its own inputs are pinned — while these are computed from the
 * requirement, the render context and the closure alone, which is exactly the
 * set a producer of results needs before it has one.
 *
 * `corpus` is `CorpusPin[]`, the five-field pin `corpus-pin.ts` defines once and
 * both the record and the ledger require, and **not**
 * `CurrentCorpusDocument[]`. This is
 * the richer of the two shapes, so the freshness record is derived from it by
 * `pinsForFreshness` below and never the other way round: a producer that
 * emitted the narrow shape would leave every record-shaped caller to widen it,
 * which is precisely how `src/cli/sign.ts` came to hold a second walk of the
 * closure and how the pipeline's adjudicator test came to patch `versionLabel`
 * back in by hand.
 *
 * The scalar pins are `Omit`-ed from `CurrentState` rather than restated, so a
 * hash added to one cannot go missing from the other.
 */
export interface VerificationPins extends Omit<CurrentState, 'resultSha256' | 'corpus'> {
  corpus: CorpusPin[];
}

/**
 * The one producer of the result-independent pins.
 *
 * The module header above records what three constructions of this record
 * already cost and why a fourth would have made agreement a coincidence. B2's
 * pipeline is that fourth caller: its deterministic tail computes every pin the
 * result it emits carries, and `src/cli/sign.ts` builds the candidate those
 * pins are compared against out of these same helpers. Two constructions that
 * drift do not surface as a diff anybody can read — they surface as
 * `candidate_inconsistent` on every dossier the pipeline ever produces.
 *
 * So this is an extraction rather than a second implementation, and
 * `currentStateOf` below is this function, projected, plus one more hash.
 *
 * **This is the only walk of `closure.docIds` that produces a pin.** There were
 * two: this one, and a private one in `src/cli/sign.ts` that differed only by
 * carrying `versionLabel`. Both were correct, and that was the problem — the
 * narrower shape cannot be widened without a second visit to the corpus, so
 * every caller needing a record-shaped pin was going to grow a walk of its own.
 * The walk therefore emits the **wider** shape, and freshness takes a projection
 * of it.
 */
export function producePins(input: PinInput): VerificationPins {
  const { requirement, renderContext, closure, corpus } = input;
  return {
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderContext),
    corpusClosureSha256: closure.sha256,
    corpus: closure.docIds.map((docId) => {
      const document = corpus.document(docId);
      return {
        docId,
        versionLabel: document.versionLabel,
        sha256Raw: document.sha256Raw,
        sha256Normalized: document.sha256Normalized,
        normalizerVersion: document.normalizerVersion,
      };
    }),
  };
}

/**
 * One pinned document, reduced to what freshness is allowed to see.
 *
 * `versionLabel` is dropped here, deliberately and by name: a publisher's label
 * is display, and comparing it would make a re-labelled but byte-identical
 * document look like drift. `CurrentCorpusDocument` has no such field precisely
 * so that the omission is expressible in the type rather than remembered.
 *
 * **Every surviving field is named, and that is load-bearing.** The obvious
 * spellings — `{ ...pin }`, or `const { versionLabel, ...rest } = pin` — both
 * make the *next* field added to `CorpusPin` a freshness input by default, with
 * no line of code changed and no test to notice: whatever the record learns to
 * pin, `deriveStaleness` would silently start being handed. Naming the four
 * inverts that default. A new pin field is inert for freshness until somebody
 * adds it here on purpose, which is the decision this project wants made
 * deliberately rather than inherited.
 *
 * Note what this does **not** claim to do. Dropping the field is defence in
 * depth, not the guarantee: the guarantee is that `deriveStaleness` compares
 * three fields per document and `versionLabel` is not one of them. This keeps
 * the record freshness is measured over honest to its type; it is not what
 * stops a label from moving a status.
 */
function forFreshness(pin: CorpusPin): CurrentCorpusDocument {
  return {
    docId: pin.docId,
    sha256Raw: pin.sha256Raw,
    sha256Normalized: pin.sha256Normalized,
    normalizerVersion: pin.normalizerVersion,
  };
}

/**
 * The record pins, projected onto what freshness may compare.
 *
 * Exported because the projection is a decision, and a decision nothing can
 * name is a decision nothing can test.
 *
 * **Every field is named here too, scalars included, for the reason
 * `forFreshness` names its four.** This read `const { corpus, ...hashes } = pins`
 * — a named projection over the documents and "everything else" over the
 * scalars. The asymmetry was not harmless: `VerificationPins` is the *record*
 * shape, so a scalar legitimately added to the record contract would have
 * arrived in `CurrentState` and become a freshness input with no line changed
 * here and nothing asserting it should not. Widening `VerificationPins` by one
 * scalar compiled clean and landed the field in `CurrentState`; it was noticed
 * only sideways, by the `.strict()` record and ledger schemas rejecting it
 * elsewhere.
 *
 * Naming the four makes the same widening a compile-or-test decision. A scalar
 * that should be compared is added here on purpose; one that should not be —
 * `rendererVersion` and `pipelineVersion` are the standing examples, pinned for
 * diagnosis and deliberately never compared — stays out without anyone having to
 * remember why.
 */
export function pinsForFreshness(pins: VerificationPins): Omit<CurrentState, 'resultSha256'> {
  return {
    requirementInputSha256: pins.requirementInputSha256,
    conditionSha256: pins.conditionSha256,
    renderedConditionSha256: pins.renderedConditionSha256,
    corpusClosureSha256: pins.corpusClosureSha256,
    corpus: pins.corpus.map(forFreshness),
  };
}

/**
 * Current state in the shape `deriveStaleness` compares an entry against: the
 * shared pin producer, projected onto the freshness shape, plus the one pin
 * that can only be taken once the result it covers exists.
 */
export function currentStateOf(input: CurrentStateInput): CurrentState {
  return { ...pinsForFreshness(producePins(input)), resultSha256: resultSha256(input.result) };
}
