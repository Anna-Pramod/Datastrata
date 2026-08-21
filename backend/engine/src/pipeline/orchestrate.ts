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
import { lensFor, type RoleConfig } from './config';
import { renderEntitledClosure, type EntitledClosure } from './entitlement';
import type { PipelineGap } from './gaps';
import { buildPipelineIdentity, RESULT_SCHEMA_VERSION } from './identity';
import type { PromptSet } from './prompts';
import { promptHashes } from './prompts';
import { readerInputFor, runBlindReader, type ReaderInput, type ReaderOutcome } from './reader';
import {
  parseRoleOutput,
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

export interface ProsecutorInput {
  reading: ReaderOutput;
  /** The exact English the reviewer reads, from `renderRequirement`. */
  renderedCondition: string;
  lens: string;
  closure: EntitledClosure;
}

export interface AdjudicatorInput {
  reading: ReaderOutput;
  renderedCondition: string;
  prosecutions: readonly ProsecutorOutput[];
  closure: EntitledClosure;
}

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
  executions: PipelineExecutions;
  transcript: RunTranscript;
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
 * How a role's inputs are written into the message it receives.
 *
 * Plain, stable text rather than a bespoke format per role: it is transcript
 * content, so it has to be reproducible, and it is what a human reads when a
 * replayed run disagrees with a live one.
 */


function renderProsecutorInput(input: ProsecutorInput): string {
  return [
    `# Lens\n\n${input.lens}`,
    `# Blind reading\n\n${JSON.stringify(input.reading, null, 2)}`,
    `# Rendered condition\n\n${input.renderedCondition}`,
    `# Entitled closure (${input.closure.sha256})\n\n${renderEntitledClosure(input.closure)}`,
  ].join('\n\n');
}

function renderAdjudicatorInput(input: AdjudicatorInput): string {
  return [
    `# Blind reading\n\n${JSON.stringify(input.reading, null, 2)}`,
    `# Rendered condition\n\n${input.renderedCondition}`,
    `# Prosecutions\n\n${JSON.stringify(input.prosecutions, null, 2)}`,
    `# Entitled closure (${input.closure.sha256})\n\n${renderEntitledClosure(input.closure)}`,
  ].join('\n\n');
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
  const halted = reader.gaps.length > 0;

  const prosecutorExecutions: RoleExecution<ProsecutorOutput>[] = [];
  for (let index = 0; halted === false && index < input.config.prosecutorCount; index += 1) {
    const lens = lensFor(input.config, index);
    const prosecutor = createAgentRole<ProsecutorInput, ProsecutorOutput>({
      name: 'prosecutor',
      index,
      model: input.config.models.prosecutor,
      prompt: input.prompts.prosecutor,
      runner,
      renderInput: renderProsecutorInput,
      parse: (raw) => parseRoleOutput('prosecutor', index, raw),
    });
    prosecutorExecutions.push(
      await prosecutor.run({
        reading: reader.output,
        renderedCondition,
        lens,
        closure: input.closure,
      }),
    );
  }

  let adjudicatorExecution: RoleExecution<AdjudicatorOutput> | null = null;
  if (halted === false) {
    const adjudicator = createAgentRole<AdjudicatorInput, AdjudicatorOutput>({
      name: 'adjudicator',
      index: 0,
      model: input.config.models.adjudicator,
      prompt: input.prompts.adjudicator,
      runner,
      renderInput: renderAdjudicatorInput,
      parse: (raw) => parseRoleOutput('adjudicator', 0, raw),
    });
    adjudicatorExecution = await adjudicator.run({
      reading: reader.output,
      renderedCondition,
      prosecutions: prosecutorExecutions.map((execution) => execution.output),
      closure: input.closure,
    });
  }

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
      prosecutions: prosecutorExecutions.map((execution) => execution.output),
      adjudication: adjudicatorExecution === null ? null : adjudicatorExecution.output,
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
