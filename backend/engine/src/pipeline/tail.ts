/**
 * The deterministic tail — §3.4's "no agent participates", as a module.
 *
 * Its own interface and its own file, because a tail that lives inside
 * orchestration is a tail whose inputs are whatever orchestration happens to
 * have in scope. Here the inputs are declared, and which of them may carry a
 * pinned value is the point.
 *
 * **`pipelineVersion` is a parameter, and it is an authoritative pin.** The
 * guarantee is not that no pin arrives as an argument — this one does. It is
 * that **no pin an agent can influence** arrives as one. `pipelineVersion` is
 * derived by `identity.ts` from prompt-file hashes, model ids, role
 * configuration, the result schema version and the closure policy; every one of
 * those is fixed before the first role runs, and no role output is among them.
 * `rendererVersion` and `resultSchemaVersion` are handed down for the same
 * reason. The five pins a role could otherwise reach for — the requirement
 * input, condition, rendered-condition and closure hashes, and `corpus[]` — are
 * computed here and have no parameter at all.
 *
 * **Every pin is computed, and computed by the shared producer.**
 * `producePins` in `src/verification/current-state.ts` is the same function the
 * sign CLI's candidate and the review sheet's current state go through. That is
 * not tidiness. Candidate consistency compares a result's pinned inputs against
 * a candidate entry built from current state; if the tail derived those hashes
 * its own way, the two constructions would drift, and the drift would surface as
 * `verify sign` refusing every dossier this pipeline produces with
 * `candidate_inconsistent` — never as a diff anybody could read.
 *
 * **It must not accept a pin from an agent, and it has nowhere to put one.**
 * `roleOutputs` is typed `PinFree`, so a role output declaring a pin does not
 * compile; the seam schemas are `.strict()`, so one arriving through `unknown`
 * is rejected; and this function reads no field of `roleOutputs` when computing
 * `pins`. A pipeline that accepted an agent-supplied pin would have the model
 * choosing the number its own work is checked against.
 *
 * **Task 1's tail computes pins and collates structural gaps, and stops
 * there.** Assembling a whole `verification-result.json` needs verdicts,
 * coverage and adjudications — judgments this task has none of, real or
 * otherwise. Task 5 assembles the result through this same interface.
 *
 * Pure.
 */

import { type PinInput, producePins, type CurrentCorpusSource, type VerificationPins } from '../verification/current-state';
import type { AuthoredRequirement } from '../types';
import type { RenderContext } from '../verification/render';
import type { PipelineGap } from './gaps';
import type { ReaderOutput, ProsecutorOutput, AdjudicatorOutput } from './role-outputs';

/**
 * Everything the roles produced, in the shape the tail consumes it.
 *
 * `adjudication` is nullable because agent verification stops at a gap: a run
 * that halted in the reader has no adjudication, and the alternative to `null`
 * is a synthetic empty one — a role output nobody produced, indistinguishable
 * in the record from an adjudicator that ran and decided nothing.
 *
 * `reading` is *not* nullable, and the asymmetry is the record's shape rather
 * than an oversight: the result schema requires `reading`, so a halted run's
 * reading is the canonically empty one, not an absent one.
 */
export interface PipelineRoleOutputs {
  reading: ReaderOutput;
  prosecutions: readonly ProsecutorOutput[];
  adjudication: AdjudicatorOutput | null;
}

export interface TailInput {
  packId: string;
  requirementId: string;
  /** The authored requirement every pin is taken over. */
  requirement: AuthoredRequirement;
  renderContext: RenderContext;
  /** The entitled closure, as `EntitledClosure.pinInput` hands it over. */
  closure: PinInput['closure'];
  corpus: CurrentCorpusSource;
  /** Derived by `identity.ts`. Never chosen, and never supplied by a role. */
  pipelineVersion: string;
  rendererVersion: string;
  /** From `CLOSURE_RENDERER_VERSION`, via the orchestrator; the record names it. */
  closureRendererVersion: string;
  resultSchemaVersion: string;
  roleOutputs: PipelineRoleOutputs;
  /**
   * Gaps produced by the pipeline itself rather than by a role.
   *
   * A role can only name a document, so the `corpus_gap` shape that names a
   * *source* — nothing in the corpus serves it — has no role output to arrive
   * in. It is discovered before the first call and handed in here.
   *
   * **It does not imply an empty closure.** A requirement citing two sources,
   * one served and one not, opens onto a real non-empty closure *and* carries a
   * source gap. Conflating the two is the defect `gaps.ts` records reversing;
   * this docstring stated it as the reason the field exists, which is why it is
   * corrected here rather than left as prose nobody re-reads.
   */
  gaps?: readonly PipelineGap[];
}

export interface TailOutcome {
  packId: string;
  requirementId: string;
  pipelineVersion: string;
  rendererVersion: string;
  closureRendererVersion: string;
  resultSchemaVersion: string;
  /** Computed here, from the world. Never read off a role output. */
  pins: VerificationPins;
  /**
   * Every structural gap any role halted on, in role order.
   *
   * A collation rather than a judgment: a gap says a document was needed and
   * could not be reached, which is a fact about the closure. The sign gate
   * refuses on an unresolved one (§4.5); deciding whether it is resolved is
   * nobody's business here.
   */
  gaps: PipelineGap[];
}

export function runDeterministicTail(input: TailInput): TailOutcome {
  const pins = producePins({
    requirement: input.requirement,
    renderContext: input.renderContext,
    closure: input.closure,
    corpus: input.corpus,
  });

  const { reading, prosecutions, adjudication } = input.roleOutputs;
  const gaps: PipelineGap[] = [
    ...(input.gaps ?? []),
    ...reading.gaps,
    ...prosecutions.flatMap((prosecution) => prosecution.gaps),
    ...(adjudication === null ? [] : adjudication.gaps),
  ];

  return {
    packId: input.packId,
    requirementId: input.requirementId,
    pipelineVersion: input.pipelineVersion,
    rendererVersion: input.rendererVersion,
    closureRendererVersion: input.closureRendererVersion,
    resultSchemaVersion: input.resultSchemaVersion,
    pins,
    gaps,
  };
}
