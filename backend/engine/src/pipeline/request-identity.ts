/**
 * What a recorded exchange was an answer *to*.
 *
 * A transcript is only replayable if a recording cannot be consumed by a
 * question it did not answer. `role` and `index` alone do not establish that:
 * every run of every requirement has a `reader[0]`, so a reader recording made
 * against one requirement will satisfy a lookup made against another, and the
 * run continues with an authoritative-looking reading of a law nobody read.
 *
 * So each recorded exchange pins the request it answered, as a digest over the
 * request in full:
 *
 * ```text
 * role, index          which execution
 * model, promptSha256  which pipeline identity inputs it ran under
 * lens                 which pass, for the roles that have one
 * messages             everything the role was actually shown
 * ```
 *
 * **`messages` is what makes this a binding rather than a label.** The prompt
 * file's text and the interpolated input are both messages, and the interpolated
 * input is where the requirement, the rendered condition, the entitled closure,
 * the blind reading and the assembled coverage table land. A digest over them is
 * therefore a digest over the whole question — which is why there is no separate
 * "requirement fingerprint" field here. A second field naming the requirement
 * would be a second, weaker answer to a question this one already answers
 * exactly, and the two would be free to disagree.
 *
 * **Not a pin, and nothing signs it.** The six authoritative pins are the
 * deterministic tail's (`roles.ts`); this digest never enters a
 * `VerificationResult` and no signature compares against it. It files and
 * validates a recording, and that is its whole job.
 *
 * Pure.
 */

import { sha256Hex } from '../corpus/hash';
import { canonicalJson } from '../verification/canonical';
import type { RoleRequest } from './roles';
import type { RoleTranscript } from './transcript';

export const REQUEST_IDENTITY_SCHEME = 'v1';

/**
 * The digest of one request.
 *
 * Built from an explicit object rather than from the `RoleRequest` value
 * directly, so that a field added to `RoleRequest` for some unrelated reason
 * does not silently move every recorded fingerprint and retire the whole
 * transcript corpus. Widening the binding is then a deliberate edit here.
 */
export function requestSha256(request: RoleRequest): string {
  const payload = {
    scheme: REQUEST_IDENTITY_SCHEME,
    role: request.role,
    index: request.index,
    model: request.model,
    promptSha256: request.promptSha256,
    // `null` rather than omitted: a role with no lens and a role whose lens is
    // absent must digest the same way whichever key order canonicalisation
    // produces, and an omitted key would make the two shapes distinguishable
    // only by their absence.
    lens: request.lens ?? null,
    messages: request.messages.map((message) => ({ from: message.from, content: message.content })),
  };
  return sha256Hex(canonicalJson(payload));
}

/**
 * The request a recorded exchange was an answer to, reconstructed from what the
 * recording itself holds.
 *
 * The inverse of what `agent-role.ts` does, and it lives here beside
 * `requestSha256` precisely so the two are read together: one builds the digest
 * from a request, the other rebuilds the request from the record, and a change
 * to either that the other does not follow must be visible in one file.
 *
 * **The agent's reply is dropped**, because it was not part of the question. A
 * recording's `messages` are the request's messages plus the response appended
 * after it arrived; the digest was taken before that append. Filtering on
 * `from === 'agent'` rather than on position keeps that true however many
 * messages a future exchange records.
 *
 * **This reconstruction is deliberately unable to invent anything.** Every field
 * comes from the stored entry, so if the reconstruction and the original
 * construction ever disagreed, *every* valid transcript would fail its own
 * integrity check — loudly, at the read boundary, rather than one forged
 * transcript passing quietly. That asymmetry is why the check is worth having
 * in this direction.
 */
export function recordedRequest(entry: RoleTranscript): RoleRequest {
  return {
    role: entry.role,
    index: entry.index,
    model: entry.model,
    promptSha256: entry.promptSha256,
    ...(entry.lens === undefined ? {} : { lens: entry.lens }),
    messages: entry.messages.filter((message) => message.from !== 'agent'),
  };
}
