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
 * **Detection is where `normalizer_changed` stops, and resolution is a second
 * step.** `deriveStaleness` can see only that `normalizerVersion` moved, since
 * a version string is all an entry carries. Factory §4.3 defines the state as
 * the *outcome* of renormalising the retained raw bytes, which needs the bytes
 * — so the caller that can open the raw store computes those hashes and hands
 * them to `resolveNormalizerChanged` below, which does the comparing. Detection
 * stays in one place and this file still reads nothing.
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

/**
 * The hash of each pinned document's retained raw bytes, renormalised under the
 * *current* normalizer, keyed by `docId`.
 *
 * A map rather than a callback. A callback would let this module reach the
 * filesystem by proxy while still looking pure, and the constraint that
 * `src/verification/` reads nothing is worth more than the convenience: the CLI
 * opens the raw store, this function only compares.
 *
 * A `docId` absent from the map means the question could not be answered — the
 * corpus no longer holds the document, or its recorded selector no longer
 * matches. That is not the same as "the text is unchanged", and it is treated
 * as the former.
 */
export type Renormalisation = ReadonlyMap<string, string>;

/**
 * Narrows `normalizer_changed` from a version difference to the outcome of
 * renormalising — factory §4.3's actual definition.
 *
 * `deriveStaleness` can only detect that `normalizerVersion` moved, because it
 * is pure and a version string is all an entry carries. §4.3 defines the state
 * as something else entirely:
 *
 * > the checker **renormalises the stored raw bytes** under the new normalizer
 * > and compares. Identical means still `fresh`. Different means the
 * > normalizer's opinion of the text changed — a distinct, blocking state for a
 * > human to adjudicate.
 *
 * **Why the distinction is not cosmetic.** The normalizer *will* change; that
 * is why raw bytes are retained at all. Treating every bump as blocking would
 * withhold `verified` from every signature in the pack at once, on a day when
 * nothing about any law moved — the alarm-fatigue failure the raw-versus-
 * normalized split exists to prevent. An alarm that fires on cosmetic churn is
 * an alarm that gets ignored, and then it has stopped working.
 *
 * **Detection stays where it is.** This function resolves an already-derived
 * set; it does not re-derive one. `deriveStaleness` is unchanged and remains the
 * single place a reason is *found*, so there is no second, subtly different
 * detector for a later reader to consult by accident.
 *
 * **It fails closed, in two directions.** The reason survives unless *every*
 * document that triggered it renormalises to exactly the hash the entry pinned:
 * a document missing from `renormalised` keeps it, and one whose renormalised
 * hash differs keeps it. Proving freshness requires evidence; the absence of
 * evidence is not the evidence of absence.
 *
 * Every other reason passes through untouched. `normalizer_changed` is the only
 * state whose definition needs bytes.
 */
export function resolveNormalizerChanged(
  entry: SigningEntry,
  current: CurrentState,
  reasons: readonly StalenessReason[],
  renormalised: Renormalisation,
): StalenessReason[] {
  const kept = new Set<StalenessReason>(reasons);
  if (!kept.has('normalizer_changed')) return [...kept].sort();

  const now = new Map(current.corpus.map((doc) => [doc.docId, doc]));
  // The trigger condition, stated once more rather than imported: it is the
  // first branch of `documentReason`, and the two must agree about which
  // documents are in question. A document whose version did not move never
  // contributed the reason, so its renormalisation says nothing about it.
  const inQuestion = entry.corpus.filter((pinned) => {
    const found = now.get(pinned.docId);
    return found !== undefined && found.normalizerVersion !== pinned.normalizerVersion;
  });

  const allReproduce =
    inQuestion.length > 0 &&
    inQuestion.every((pinned) => renormalised.get(pinned.docId) === pinned.sha256Normalized);

  if (allReproduce) kept.delete('normalizer_changed');
  return [...kept].sort();
}
