/**
 * Reader → prosecutors → adjudicator → deterministic tail.
 *
 * The order in §2.5's data flow, wired over the injected runner and nothing
 * else. Three properties are worth stating because they are decisions rather
 * than consequences.
 *
 * **The runner guard runs first, before anything else happens.** Not after the
 * closure is walked and the prompts are read — those are work, and a run with
 * no runner must not begin doing work. `requireRunner` throws
 * `MissingAgentRunnerError` with nothing contacted (`runner.ts`).
 *
 * **The identity is derived here and handed down.** Nothing accepts a
 * `pipelineVersion` parameter, at any level, so there is no seam at which a
 * caller could assert one. It is built from the prompt-file hashes, the model
 * ids, the role configuration, the result schema version and the closure's own
 * traversal policy.
 *
 * **Roles do not exist yet, and this file does not pretend otherwise.** Tasks
 * 2–4 build the reader's blindness projection, the prosecutors' lens discipline
 * and the adjudicator's verdict binding. What is here is the skeleton those
 * tasks fill: the sequencing, the transcript, the identity, and the seam every
 * role output passes through. Under Task 1 the runner is a stub supplying
 * structurally valid outputs, and a stub's output is not a reading of anything.
 *
 * Sequential, deliberately. Prosecutors are independent and could run at once;
 * running them in order keeps the transcript's `roles[]` in a fixed order, and a
 * transcript whose contents depend on scheduling is a replay input that is not
 * quite the same twice.
 */

import type { AuthoredRequirement } from '../types';
import type { CurrentCorpusSource } from '../verification/current-state';
import { renderRequirement, RENDERER_VERSION, type RenderContext } from '../verification/render';
import { createAgentRole } from './agent-role';
import type { RoleConfig } from './config';
import { renderEntitledClosure, type EntitledClosure } from './entitlement';
import type { PipelineGap } from './gaps';
import { buildPipelineIdentity, RESULT_SCHEMA_VERSION } from './identity';
import type { PromptSet } from './prompts';
import { promptHashes } from './prompts';
import { readerInputFor, runBlindReader, type ReaderInput, type ReaderOutcome } from './reader';
import {
  conditionPathsFor,
  runProsecutors,
  type ProsecutorInput,
  type ProsecutorsOutcome,
} from './prosecutors';
import {
  runAdjudicator,
  adjudicatorInputFor,
  type AdjudicatorInput,
  type AdjudicatorOutcome,
} from './adjudicator';
import {
  type AdjudicatorOutput,
  type ProsecutorOutput,
  type ReaderOutput,
} from './role-outputs';
import type { RoleExecution } from './roles';
import { requireRunner, type AgentRunner } from './runner';
import { buildRunId } from './run-identity';
import { runDeterministicTail, type TailOutcome } from './tail';
import {
  TRANSCRIPT_SCHEMA_VERSION,
  type RunTranscript,
} from './transcript';

/**
 * Re-exported so callers reach one `ReaderInput`, and it is the projection.
 *
 * The type itself lives in `reader.ts` beside the function that builds it,
 * because blindness is a property of the projection and its builder together: a
 * shape declared here and populated there is a shape somebody can populate a
 * second way.
 */
export type { ReaderInput };

/**
 * Re-exported for the same reason `ReaderInput` is: the type lives beside the
 * function that builds it, because what a prosecutor may be handed is a property
 * of the projection and its builder together.
 */
export type { ProsecutorInput };

/**
 * Re-exported for the same reason `ReaderInput` and `ProsecutorInput` are: the
 * type lives beside the function that builds it, because what an adjudicator
 * may be handed is a property of the projection and its builder together. A
 * shape declared here and populated there is a shape somebody can populate a
 * second way — and the second way is where a prosecutor's execution arrives.
 */
export type { AdjudicatorInput };

export interface PipelineRunInput {
  packId: string;
  requirementId: string;
  requirement: AuthoredRequirement;
  renderContext: RenderContext;
  /** The single capability object all three roles read through. */
  closure: EntitledClosure;
  corpus: CurrentCorpusSource;
  prompts: PromptSet;
  config: RoleConfig;
  /**
   * The runner. Typed as possibly absent on purpose: the guard is what makes
   * "no runner" a named refusal rather than a `TypeError` somewhere downstream.
   */
  runner: AgentRunner | null | undefined;
  rendererVersion?: string;
  resultSchemaVersion?: string;
}

/**
 * The executions that happened, and `null` for the ones that did not.
 *
 * Nullable rather than absent-by-convention because agent verification stops at
 * a gap (§3.0): a run that halted in the reader has no prosecutor and no
 * adjudicator, and a shape that could not say so would force a synthetic empty
 * adjudication into the record — a role output nobody produced, indistinguishable
 * from an adjudicator that ran and found nothing.
 *
 * `reader` is nullable for the sharper case still: a requirement whose entitled
 * closure is empty has no evidence surface, so no agent runs at all.
 */
export interface PipelineExecutions {
  reader: RoleExecution<ReaderOutput> | null;
  prosecutors: RoleExecution<ProsecutorOutput>[];
  adjudicator: RoleExecution<AdjudicatorOutput> | null;
}

export interface PipelineRunOutcome {
  runId: string;
  pipelineVersion: string;
  /** What the reader was entitled to, what it returned, and its gaps. */
  reader: ReaderOutcome;
  /**
   * The prosecutors' executions, their gaps, and the assembled bidirectional
   * coverage table.
   *
   * Carried on the outcome rather than reassembled by a caller: the table's
   * challenge ids are qualified by the prosecutor that raised them, and a second
   * assembly would have to reproduce that qualification to make the same links.
   */
  prosecution: ProsecutorsOutcome;
  executions: PipelineExecutions;
  transcript: RunTranscript;
  /**
   * The adjudication, and `null` when no adjudicator ran.
   *
   * Carried on the outcome rather than reassembled by a caller because
   * `openQuestions[]` is a projection with exactly one producer: a caller
   * deriving its own from `challenges[]` would be the second author the
   * projection exists to prevent, and the two would be free to disagree.
   */
  adjudication: AdjudicatorOutcome | null;
  tail: TailOutcome;
  /**
   * Whether agent verification stopped at a gap.
   *
   * Derived from `reader.gaps`, never asserted by a caller and never taken from
   * a role: a run that halted is a run whose gap list is non-empty, and the two
   * cannot be made to disagree.
   */
  halted: boolean;
}

/**
 * The gaps that name a source rather than a document.
 *
 * The tail collates every gap a *role* produced out of the role outputs it is
 * handed, and a role only ever names a document. The source-shaped gap is
 * produced before the first call — there is no role to have produced it — so it
 * is handed to the tail separately. Filtering on the absence of `docId` rather
 * than on `kind` keeps the two independent: `corpus_gap` covers both shapes, and
 * a filter on `kind` would swallow the document-shaped half and count it twice.
 */
function sourceShapedGaps(gaps: readonly PipelineGap[]): PipelineGap[] {
  return gaps.filter((gap) => gap.docId === undefined);
}

/** The identity this configuration and these prompt files add up to. */
export function pipelineVersionFor(input: {
  prompts: PromptSet;
  config: RoleConfig;
  closure: EntitledClosure;
  resultSchemaVersion?: string;
}): string {
  return buildPipelineIdentity({
    promptSha256: promptHashes(input.prompts),
    models: input.config.models,
    roleConfig: {
      prosecutorCount: input.config.prosecutorCount,
      lenses: input.config.lenses,
      order: input.config.order,
    },
    resultSchemaVersion: input.resultSchemaVersion ?? RESULT_SCHEMA_VERSION,
    closurePolicy: input.closure.policy,
  });
}

export async function runVerificationPipeline(
  input: PipelineRunInput,
): Promise<PipelineRunOutcome> {
  // First. Nothing above this line does any work, and nothing below it runs
  // without a runner that was handed in.
  const runner = requireRunner(input.runner);

  const resultSchemaVersion = input.resultSchemaVersion ?? RESULT_SCHEMA_VERSION;
  const rendererVersion = input.rendererVersion ?? RENDERER_VERSION;
  const pipelineVersion = pipelineVersionFor({
    prompts: input.prompts,
    config: input.config,
    closure: input.closure,
    resultSchemaVersion,
  });

  const renderedCondition = renderRequirement(input.requirement, input.renderContext);

  // The projection, built once and by the one function that is allowed to read
  // an `AuthoredRequirement` on the reader's behalf. Nothing below reaches for
  // `input.requirement` again on the reader's account.
  const reader = await runBlindReader({
    input: readerInputFor({
      packId: input.packId,
      requirement: input.requirement,
      closure: input.closure,
    }),
    sourceIds: input.requirement.sources,
    prompt: input.prompts.reader,
    model: input.config.models.reader,
    runner,
  });

  // §3.0: agent verification stops at the gap. Not "halt and write" — the
  // deterministic tail below still computes pins and collates, because a dossier
  // that cannot be parsed is Invalid whatever else is true of it. What stops is
  // substantive judgment: no prosecutor is asked to compare a reading that was
  // discarded, and no adjudicator is asked to decide between challenges nobody
  // made. A reading produced under an incomplete surface cannot be topped up,
  // so the repair is to fix the corpus and restart from the reader.
  const readerHalted = reader.gaps.length > 0;

  // The address vocabulary of the encoding, derived from the same requirement
  // `renderedCondition` was rendered from. Not a fifth input: it is the
  // structural index of something the prosecutor is already shown, and it is
  // what anchors the `condition_to_reading` direction to the real tree.
  const conditionPaths = conditionPathsFor(input.requirement, input.renderContext);

  const prosecution: ProsecutorsOutcome = readerHalted
    ? { executions: [], outputs: [], gaps: [], halted: false, table: { cells: [], challenges: [] } }
    : await runProsecutors({
        reading: reader.output,
        renderedCondition,
        conditionPaths,
        closure: input.closure,
        config: input.config,
        prompt: input.prompts.prosecutor,
        runner,
      });

  // §3.0 binds the prosecutors to the same closure as the reader, so a run can
  // stop in either place. `halted` is derived from the gap lists rather than
  // asserted, so it and the gaps it describes cannot disagree.
  const agentHalted = readerHalted || prosecution.halted;
  const prosecutorExecutions = prosecution.executions;

  // §3.3, and the projection is built here rather than inline: `adjudicatorInputFor`
  // is the only function allowed to assemble what an adjudicator is shown, and
  // it takes the *assembled table* — Task 3's cells and its narrow challenge
  // seeds — never a `ProsecutorOutput`, a `RoleExecution` or a transcript. The
  // adjudicator settles claims; the arguments that produced them are not its
  // business and have nowhere in its input to sit.
  const adjudication: AdjudicatorOutcome | null =
    agentHalted === false
      ? await runAdjudicator({
          input: adjudicatorInputFor({
            reading: reader.output,
            renderedCondition,
            table: prosecution.table,
            closure: input.closure,
          }),
          prompt: input.prompts.adjudicator,
          model: input.config.models.adjudicator,
          runner,
        })
      : null;
  const adjudicatorExecution: RoleExecution<AdjudicatorOutput> | null =
    adjudication === null ? null : adjudication.execution;

  // §3.0 binds all three roles to the same closure, so a run can stop in any of
  // the three places. Derived from the gap lists rather than asserted, so
  // `halted` and the gaps it describes cannot disagree.
  const halted = agentHalted || (adjudication !== null && adjudication.halted);

  const tail = runDeterministicTail({
    packId: input.packId,
    requirementId: input.requirementId,
    requirement: input.requirement,
    renderContext: input.renderContext,
    closure: input.closure.pinInput,
    corpus: input.corpus,
    pipelineVersion,
    rendererVersion,
    resultSchemaVersion,
    roleOutputs: {
      reading: reader.output,
      prosecutions: prosecution.outputs,
      adjudication: adjudication === null ? null : adjudication.output,
    },
    // The gaps no role could have named: the shape that names a *source*
    // rather than a document is produced before the first call.
    gaps: sourceShapedGaps(reader.gaps),
  });

  const runId = buildRunId({
    pipelineVersion,
    packId: input.packId,
    requirementId: input.requirementId,
    requirementInputSha256: tail.pins.requirementInputSha256,
    renderedConditionSha256: tail.pins.renderedConditionSha256,
    corpusClosureSha256: tail.pins.corpusClosureSha256,
  });

  const transcript: RunTranscript = {
    transcriptSchemaVersion: TRANSCRIPT_SCHEMA_VERSION,
    runId,
    packId: input.packId,
    requirementId: input.requirementId,
    pipelineVersion,
    requirementInputSha256: tail.pins.requirementInputSha256,
    renderedConditionSha256: tail.pins.renderedConditionSha256,
    corpusClosureSha256: tail.pins.corpusClosureSha256,
    roles: [
      ...(reader.execution === null ? [] : [reader.execution.transcript]),
      ...prosecutorExecutions.map((execution) => execution.transcript),
      ...(adjudicatorExecution === null ? [] : [adjudicatorExecution.transcript]),
    ],
  };

  return {
    runId,
    pipelineVersion,
    reader,
    prosecution,
    adjudication,
    executions: {
      reader: reader.execution,
      prosecutors: prosecutorExecutions,
      adjudicator: adjudicatorExecution,
    },
    transcript,
    tail,
    halted,
  };
}
