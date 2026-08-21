/**
 * Which run a transcript belongs to.
 *
 * `pipelineVersion` says *which pipeline* produced something. It cannot say
 * which question that pipeline was asked, and a directory of transcripts keyed
 * by pipeline alone would collapse every requirement's recording onto one
 * filename. The run identity is the other half: the pipeline, plus the exact
 * question — which pack, which requirement, which authored input, which
 * rendered English, and which entitled closure.
 *
 * **Derived, and with no clock in it.** Recording the same run twice produces
 * the same identity and therefore the same transcript path and the same bytes.
 * A timestamped run id would make the replay suite's inputs unstable in the one
 * dimension it most needs stable, and would make "did this run change?"
 * unanswerable — every re-record would look like a new run.
 *
 * **It is not a pin and nothing compares against it.** Staleness is derived
 * from the signature's pins against current state (`staleness.ts`); this string
 * only files a recording. It carries the pins it does because a recording filed
 * under a question it does not answer is worse than no recording.
 *
 * Pure.
 */

import { sha256Hex } from '../corpus/hash';
import { canonicalJson } from '../verification/canonical';

export const RUN_IDENTITY_SCHEME = 'v1';

export interface RunIdentityInput {
  pipelineVersion: string;
  packId: string;
  requirementId: string;
  requirementInputSha256: string;
  renderedConditionSha256: string;
  corpusClosureSha256: string;
}

/** `run-v1-<64 hex>`, filed as `<packId>/<requirementId>/<runId>.json`. */
export function buildRunId(input: RunIdentityInput): string {
  const payload = {
    scheme: RUN_IDENTITY_SCHEME,
    pipelineVersion: input.pipelineVersion,
    packId: input.packId,
    requirementId: input.requirementId,
    requirementInputSha256: input.requirementInputSha256,
    renderedConditionSha256: input.renderedConditionSha256,
    corpusClosureSha256: input.corpusClosureSha256,
  };
  return `run-${RUN_IDENTITY_SCHEME}-${sha256Hex(canonicalJson(payload))}`;
}
