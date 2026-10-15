/**
 * Evidence validity, measured over a run's result before any signature exists.
 *
 * The sign gate already re-finds every quote and re-runs every absence search
 * against the corpus, and refuses a record whose evidence fails. That check
 * only runs at signing, and only as a refusal. A run needs the same answer
 * earlier and in another form: plan D-9's evidence-validity tier records, for
 * every `@2` execution, whether the evidence the result carries is really in
 * the corpus the run authorised — as a measurement, with no signature in
 * prospect and nothing to refuse. Without it, "the result was written" is the
 * only statement a run could make about its quotes, and writing a result proves
 * nothing about whether its quotes exist.
 *
 * **One enumeration, one check, so the two answers cannot drift.** The sets
 * come from `evidenceSetsOf` and each is judged by `checkEvidenceSet`, called
 * exactly as the gate calls it, so a set this module reports failed is a set
 * the gate refuses as `evidence_failed`, with the same problems in the same
 * order. `sign.ts` is deliberately not refactored to call this function — the
 * plan keeps the gate untouched — so the two loops are held in step by a test
 * that runs both over the same records and compares the gate's refusal details
 * with this module's failed sets, not by sharing code.
 *
 * **What it measures, and what it does not.**
 *
 *   - Quotes and absence terms are compared by `checkEvidenceSet`'s rule:
 *     both sides through `normalizeWhitespace` and then `toLowerCase`. Runs of
 *     spaces and tabs collapse and both sides are lower-cased — a plain
 *     lower-casing, not Unicode case folding — but a line break is not a
 *     space, so a quote that joins two paragraphs with a space is not found.
 *   - A quote must pin the document hash the corpus holds, exactly.
 *   - Quotes are found in, and edges looked up across, every document the
 *     loaded corpus holds, not only the run's entitled closure. Holding a
 *     record to the documents it pins is the consistency pass's rule, not
 *     this measurement's.
 *   - Whether the evidence *supports* its proposition is not assessed. That is
 *     evidence use, and the reviewer's.
 *
 * **Every set is reported, passing ones included,** so a consumer can show a
 * clean set as clean rather than infer it from an absence. The top-level `ok`
 * is true exactly when every set is ok. Over a record with no evidence set —
 * the canonical gap-bearing record, which is schema-valid with every
 * judgment-bearing container empty — `ok` is true and `sets` is empty: nothing
 * failed, which is not the same as evidence having been found, and `sets`
 * is how a caller tells the two apart.
 *
 * The result is taken as given. The gate reaches its evidence loop only for a
 * schema-valid record, and the agreement between the two is claimed, and
 * tested, over schema-valid records; schema validity is a tier of its own.
 *
 * Pure: no filesystem, no network, no clock. The corpus is handed in, already
 * loaded, and neither it nor the result is written to.
 */

import { checkEvidenceSet } from '../corpus/evidence';
import type { LoadedCorpus } from '../corpus/store';
import { evidenceSetsOf } from './evidence-sets';
import type { VerificationResult } from './result';

/** One evidence set's verdict, addressed as the record and a refusal address it. */
export interface EvidenceSetValidity {
  /** Where in the record the set sits: `challenges[0] (C1).adjudicationEvidence`. */
  recordPath: string;
  /** How a refusal names it: `challenge C1 adjudication`. */
  label: string;
  ok: boolean;
  /** Every problem `checkEvidenceSet` found, in its order; empty when `ok`. */
  problems: string[];
}

/** Every evidence set of one result, measured against one corpus. */
export interface ResultEvidenceValidity {
  /** True exactly when every set is ok — and so true when there is no set at all. */
  ok: boolean;
  /** One entry per set of `evidenceSetsOf(result)`, in that order. */
  sets: EvidenceSetValidity[];
}

/**
 * Re-finds the evidence of every set in `result` against `corpus`.
 *
 * The same sets, the same check and the same order as the sign gate's corpus
 * re-check, returned as a measurement instead of thrown as refusals.
 */
export function checkResultEvidence(result: VerificationResult, corpus: LoadedCorpus): ResultEvidenceValidity {
  const sets = evidenceSetsOf(result).map((set): EvidenceSetValidity => {
    const checked = checkEvidenceSet(set.items, corpus);
    return { recordPath: set.recordPath, label: set.label, ok: checked.ok, problems: checked.problems };
  });
  return { ok: sets.every((set) => set.ok), sets };
}
