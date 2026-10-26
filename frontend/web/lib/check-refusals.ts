/**
 * What `POST /api/check` tells a visitor when it produces no assessment: a fixed sentence and, for a refusal, a code from a
 * closed set (DP1 plan, Task 6; Codex's review of Task 6, findings 1 and 2).
 *
 * **Why this module exists.** The route's failures carry diagnostics written for the people who run the site. An integrity
 * refusal's detail names the deployment's absolute paths and the pinned file that failed (`lib/pack.ts`); a timeline refusal's
 * message names a requirement, a line kind, a year and a result; an unexpected error can carry anything its message was built
 * from, a path or an answer among them. A public body built from them sends those to any visitor whose check reaches the
 * failure. So every body the route answers without an assessment is built here, from constants and codes alone, and the tests
 * hold each one exactly. (A route file may export only what Next.js allows, so the parts a test names live here.)
 *
 * **The diagnosis is not lost.** The failure is counted by the route's one structured line (`check.refused`, with its status),
 * `/healthz` reports the same damage, and the release can be reproduced locally at its commit, where the thrown error and its
 * detail are in reach. What is withheld is the raw diagnostic, from the visitor and from the host's logs.
 */

import type { IntegrityFailureError } from '@datastrata/engine';

/** The engine's refusal codes, as an integrity failure carries them. */
type RefusalCode = IntegrityFailureError['refusals'][number]['code'];

/**
 * Every code an integrity refusal can carry, listed once. A record over the engine's type, so a code added to the engine and
 * not here, or listed here and not there, fails the typecheck rather than reaching a visitor as something else.
 */
const CODES: Record<RefusalCode, true> = {
  mismatch: true,
  open_question: true,
  evidence_failed: true,
  unresolved_gap: true,
  invalid_result: true,
  candidate_inconsistent: true,
  integrity_failure: true,
  red_suite: true,
  unpromoted_pipeline: true,
  undesignated_evidence: true,
  unsupported_proposition: true,
};

/** The closed set an integrity refusal body's codes are drawn from. */
export const INTEGRITY_REFUSAL_CODES: readonly RefusalCode[] = Object.keys(CODES) as RefusalCode[];

/** The integrity refusal's sentence (503), unchanged since before Task 6. */
export const INTEGRITY_REFUSAL =
  'The verification record for this pack is damaged, so the check is unavailable. No assessment is produced from an unverifiable record.';

/** The timeline refusal's sentence (503), unchanged since Task 6. */
export const TIMELINE_REFUSAL = 'A line of this check would have to show a state its kind cannot, so the check is refused and no assessment is produced.';

/** The timeline refusal's one code: a line asked to show a state its kind cannot (`TimelineRefusalError`). */
export const TIMELINE_REFUSAL_CODE = 'line_state_refused';

/**
 * The sentence for any other failure (500). It is not state wording: the page shows its own words for any 500
 * (`ERROR_STATES.server_error`), so this is for a caller reading the body, and says only that nothing was produced.
 */
export const UNEXPECTED_FAILURE = 'The check could not be completed, so no assessment was produced.';

/** A refusal's code as the body carries it: itself when it is in the set, and otherwise the integrity failure it is. */
function publicCode(code: unknown): RefusalCode {
  return typeof code === 'string' && Object.hasOwn(CODES, code) ? (code as RefusalCode) : 'integrity_failure';
}

/** The 503 body for a damaged verification record: the sentence, and each refusal's code, in order; never its detail. */
export function integrityRefusalBody(error: IntegrityFailureError): { error: string; refusals: RefusalCode[] } {
  return { error: INTEGRITY_REFUSAL, refusals: error.refusals.map((refusal) => publicCode(refusal.code)) };
}

/** The 503 body for a line asked to show a state its kind cannot: the sentence and the one code; never the error's message. */
export function timelineRefusalBody(): { error: string; refusal: typeof TIMELINE_REFUSAL_CODE } {
  return { error: TIMELINE_REFUSAL, refusal: TIMELINE_REFUSAL_CODE };
}

/** The 500 body for any other error the handler raises: the sentence alone. */
export function unexpectedFailureBody(): { error: string } {
  return { error: UNEXPECTED_FAILURE };
}
