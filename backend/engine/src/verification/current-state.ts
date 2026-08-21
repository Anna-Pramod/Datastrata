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
 * Pure, like the rest of `src/verification/`: the closure and the parsed result
 * are handed in, and the corpus is consulted only through an accessor its
 * caller already holds. Nothing here opens a file.
 */

import type { AuthoredRequirement } from '../types';
import { requirementInputSha256 } from './canonical';
import type { RenderContext } from './render';
import { resultSha256, type VerificationResult } from './result';
import { candidateConditionSha256, candidateRenderedConditionSha256 } from './sign';
import type { CurrentState } from './staleness';

/**
 * The corpus, reduced to the one question this module asks of it.
 *
 * A structural type rather than `LoadedCorpus`, so that nothing here depends on
 * the module that opens files — and so a caller holding a corpus by some other
 * route can still be compared against.
 */
export interface CurrentCorpusSource {
  document(docId: string): {
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
export interface CurrentStateInput {
  /** The authored requirement, which is what every pinned hash is taken over. */
  requirement: AuthoredRequirement;
  /** `{ factTypes, catalogues }` — what the rendered condition is rendered with. */
  renderContext: RenderContext;
  /** The entitled closure as it stands now. */
  closure: { sha256: string; docIds: readonly string[] };
  /** The corpus the closure's documents are read out of. */
  corpus: CurrentCorpusSource;
  /** The pinned verification result, already parsed. */
  result: VerificationResult;
}

/**
 * Current state in the shape `deriveStaleness` compares an entry against.
 *
 * `versionLabel` is deliberately not carried: `CurrentCorpusDocument` has no
 * such field, because a publisher's label is display and comparing it would
 * make a re-labelled but byte-identical document look like drift.
 */
export function currentStateOf(input: CurrentStateInput): CurrentState {
  const { requirement, renderContext, closure, corpus, result } = input;
  return {
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderContext),
    corpusClosureSha256: closure.sha256,
    resultSha256: resultSha256(result),
    corpus: closure.docIds.map((docId) => {
      const document = corpus.document(docId);
      return {
        docId,
        sha256Raw: document.sha256Raw,
        sha256Normalized: document.sha256Normalized,
        normalizerVersion: document.normalizerVersion,
      };
    }),
  };
}
