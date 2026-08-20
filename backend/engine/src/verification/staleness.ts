/**
 * Derived staleness — did the world move underneath this signature?
 *
 * Computed at read time and never written back. The signature is immutable, so
 * the only honest thing a reader can do with drift is *describe* it; rewriting
 * the entry would destroy the record of what was actually signed.
 *
 * **It returns a set, never a ranked primary.** `stale_encoding` and
 * `stale_source_text` co-occur when a condition was corrected *and* the law's
 * text moved, and both must reach the person deciding what to do. A precedence
 * order would have to invent which is "the" reason and would silently hide the
 * other — so the result is sorted and deduplicated for stable comparison, and
 * carries no notion of a winner.
 *
 * **`revoked` is not a member of `StalenessReason`.** Nothing moved underneath
 * a revoked signature; a person deliberately withdrew its authority.
 *
 *     staleness = the world moved · revocation = a person withdrew authority
 *
 * The type is what enforces the separation, not the discipline of this file:
 * `deriveStatus` handles revocation instead, and cannot be tempted to read it
 * out of a staleness set that could never contain it.
 *
 * **`stale_render` derives from the output hash, never from `rendererVersion`.**
 * A renderer bump that does not change *this rule's* English must not
 * invalidate a signature — the version is pinned for diagnosis only. That is
 * why `CurrentState` has no `rendererVersion` field, and its absence is a
 * design decision rather than an omission: an alarm that fires on cosmetic
 * churn is an alarm that gets ignored, and then it has stopped working.
 *
 * **Integrity failure is not staleness, and this file cannot express it.** Two
 * cases belong to the caller, which must raise an integrity failure with its
 * own category and exit code *before* calling here:
 *
 *  - **A missing verification result.** `CurrentState.resultSha256` is
 *    non-nullable, so the case is unrepresentable rather than merely
 *    unhandled.
 *  - **A document pinned by the entry but absent from `current.corpus`.** In
 *    an append-only, git-tracked corpus a signed snapshot cannot vanish
 *    through ordinary drift; it is tampering-shaped, and filing it beside "the
 *    law changed" would understate it. Such a document contributes no reason
 *    here — deliberately, so that nobody mistakes a quiet staleness flag for
 *    the loud failure the situation warrants.
 *
 * Detection is also where `normalizer_changed` stops. Renormalising the
 * retained raw bytes to decide whether the text actually moved resolves it,
 * and that work belongs to the checker that owns the normalizer.
 *
 * Pure — no filesystem, no network, no clock, and no mutation of either
 * argument.
 */

import type { SigningEntry } from './ledger';

/**
 * Every way a signature can be out of date. `fresh` is the empty set rather
 * than a member: an enum value for "nothing" invites `reasons.includes('fresh')`
 * to become the freshness test, which then quietly disagrees with the set.
 */
export type StalenessReason =
  | 'source_reissued'
  | 'stale_source_text'
  | 'stale_encoding'
  | 'stale_render'
  | 'stale_closure'
  | 'stale_result'
  | 'normalizer_changed';

/**
 * A corpus document as it stands now. The shape deliberately omits
 * `versionLabel`: a publisher's label is display, and comparing it would make
 * a re-labelled but byte-identical document look like drift.
 */
export interface CurrentCorpusDocument {
  docId: string;
  sha256Raw: string;
  sha256Normalized: string;
  normalizerVersion: string;
}

/**
 * Everything the entry pinned, recomputed from the world as it is now.
 *
 * There is no `rendererVersion` and no `pipelineVersion` here: neither is
 * compared, so accepting them would imply that they might be. Nor is there a
 * nullable result hash — see the file header on why the integrity cases are
 * excluded by the types rather than handled by the logic.
 */
export interface CurrentState {
  requirementInputSha256: string;
  conditionSha256: string;
  renderedConditionSha256: string;
  corpusClosureSha256: string;
  resultSha256: string;
  corpus: CurrentCorpusDocument[];
}

/**
 * The reasons that withhold `verified`.
 *
 * `source_reissued` is the sole exclusion: the publisher reissued the file and
 * the words are identical, so the conclusion still rests on the same text.
 * Everything else means something the signer relied on is no longer what they
 * relied on.
 */
export const BLOCKING: ReadonlySet<StalenessReason> = new Set<StalenessReason>([
  'stale_source_text',
  'stale_encoding',
  'stale_render',
  'stale_closure',
  'stale_result',
  'normalizer_changed',
]);

/** Whether any reason in the set withholds `verified`. */
export function blocks(reasons: StalenessReason[]): boolean {
  return reasons.some((reason) => BLOCKING.has(reason));
}

/**
 * Per document, in strict order, stopping at the first branch that applies.
 *
 * The order is the point. Normalized hashes produced by *different* normalizer
 * versions are not comparable, so a version change must end the inference for
 * this document rather than merely adding a reason beside the hash comparison.
 * Reporting `stale_source_text` from incomparable hashes would claim the law's
 * text moved on the evidence of an algorithm change — a false alarm about the
 * one thing this machinery exists to detect truthfully.
 *
 * Returns at most one reason, which is what makes "never both for the same
 * document" structural rather than a rule to remember.
 */
function documentReason(
  pinned: SigningEntry['corpus'][number],
  now: CurrentCorpusDocument,
): StalenessReason | null {
  if (pinned.normalizerVersion !== now.normalizerVersion) return 'normalizer_changed';
  if (pinned.sha256Normalized !== now.sha256Normalized) return 'stale_source_text';
  if (pinned.sha256Raw !== now.sha256Raw) return 'source_reissued';
  return null;
}

/**
 * Every way this signature is out of date, sorted and deduplicated.
 *
 * Documents contribute independently: one closure may yield
 * `normalizer_changed` for document A and `stale_source_text` for document B,
 * and both belong in the answer. So every document is examined — there is no
 * early return once a reason has been found, because the first finding is not
 * more important than the second, merely earlier in the array.
 */
export function deriveStaleness(entry: SigningEntry, current: CurrentState): StalenessReason[] {
  const reasons = new Set<StalenessReason>();

  // One reason, two triggers: the encoding a signature rests on is both what
  // the agents consumed and the condition subtree itself, and either moving
  // means the signature is over an encoding that no longer exists.
  if (
    entry.requirementInputSha256 !== current.requirementInputSha256 ||
    entry.conditionSha256 !== current.conditionSha256
  ) {
    reasons.add('stale_encoding');
  }

  if (entry.renderedConditionSha256 !== current.renderedConditionSha256) {
    reasons.add('stale_render');
  }

  if (entry.corpusClosureSha256 !== current.corpusClosureSha256) {
    reasons.add('stale_closure');
  }

  if (entry.resultSha256 !== current.resultSha256) {
    reasons.add('stale_result');
  }

  const now = new Map(current.corpus.map((doc) => [doc.docId, doc]));
  for (const pinned of entry.corpus) {
    const found = now.get(pinned.docId);
    // Absent means integrity failure, raised by the caller before reaching
    // here. Silence is correct: a staleness reason would understate it.
    if (found === undefined) continue;
    const reason = documentReason(pinned, found);
    if (reason !== null) reasons.add(reason);
  }

  return [...reasons].sort();
}
