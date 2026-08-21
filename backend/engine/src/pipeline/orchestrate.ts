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
import type { EntitledClosure } from './entitlement';
import { buildPipelineIdentity, RESULT_SCHEMA_VERSION } from './identity';
import type { PromptSet } from './prompts';
import { promptHashes } from './prompts';
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
 * What the reader receives: the provision citation and the capability.
 *
 * The condition, `plainEnglish`, `caution`, the facts and the obligation
 * templates are absent, which is §3.1's blindness. Task 2 makes the absence a
 * compile-time projection rather than a shape somebody remembered to build.
 */
export interface ReaderInput {
  provisions: string | undefined;
  closure: EntitledClosure;
}

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

export interface PipelineExecutions {
  reader: RoleExecution<ReaderOutput>;
  prosecutors: RoleExecution<ProsecutorOutput>[];
  adjudicator: RoleExecution<AdjudicatorOutput>;
}

export interface PipelineRunOutcome {
  runId: string;
  pipelineVersion: string;
  executions: PipelineExecutions;
  transcript: RunTranscript;
  tail: TailOutcome;
}

/**
 * How a role's inputs are written into the message it receives.
 *
 * Plain, stable text rather than a bespoke format per role: it is transcript
 * content, so it has to be reproducible, and it is what a human reads when a
 * replayed run disagrees with a live one.
 */
function renderClosure(closure: EntitledClosure): string {
  return closure
    .documents()
    .map((document) => `## ${document.docId} — ${document.title} (${document.versionLabel})\n\n${document.text}`)
    .join('\n\n');
}

function renderReaderInput(input: ReaderInput): string {
  return [
    `# Provisions\n\n${input.provisions ?? '(none cited)'}`,
    `# Entitled closure (${input.closure.sha256})\n\n${renderClosure(input.closure)}`,
  ].join('\n\n');
}

function renderProsecutorInput(input: ProsecutorInput): string {
  return [
    `# Lens\n\n${input.lens}`,
    `# Blind reading\n\n${JSON.stringify(input.reading, null, 2)}`,
    `# Rendered condition\n\n${input.renderedCondition}`,
    `# Entitled closure (${input.closure.sha256})\n\n${renderClosure(input.closure)}`,
  ].join('\n\n');
}

function renderAdjudicatorInput(input: AdjudicatorInput): string {
  return [
    `# Blind reading\n\n${JSON.stringify(input.reading, null, 2)}`,
    `# Rendered condition\n\n${input.renderedCondition}`,
    `# Prosecutions\n\n${JSON.stringify(input.prosecutions, null, 2)}`,
    `# Entitled closure (${input.closure.sha256})\n\n${renderClosure(input.closure)}`,
  ].join('\n\n');
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

  const reader = createAgentRole<ReaderInput, ReaderOutput>({
    name: 'reader',
    index: 0,
    model: input.config.models.reader,
    prompt: input.prompts.reader,
    runner,
    renderInput: renderReaderInput,
    parse: (raw) => parseRoleOutput('reader', 0, raw),
  });
  const readerExecution = await reader.run({
    provisions: input.requirement.provisions,
    closure: input.closure,
  });

  const prosecutorExecutions: RoleExecution<ProsecutorOutput>[] = [];
  for (let index = 0; index < input.config.prosecutorCount; index += 1) {
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
        reading: readerExecution.output,
        renderedCondition,
        lens,
        closure: input.closure,
      }),
    );
  }

  const adjudicator = createAgentRole<AdjudicatorInput, AdjudicatorOutput>({
    name: 'adjudicator',
    index: 0,
    model: input.config.models.adjudicator,
    prompt: input.prompts.adjudicator,
    runner,
    renderInput: renderAdjudicatorInput,
    parse: (raw) => parseRoleOutput('adjudicator', 0, raw),
  });
  const adjudicatorExecution = await adjudicator.run({
    reading: readerExecution.output,
    renderedCondition,
    prosecutions: prosecutorExecutions.map((execution) => execution.output),
    closure: input.closure,
  });

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
      reading: readerExecution.output,
      prosecutions: prosecutorExecutions.map((execution) => execution.output),
      adjudication: adjudicatorExecution.output,
    },
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
      readerExecution.transcript,
      ...prosecutorExecutions.map((execution) => execution.transcript),
      adjudicatorExecution.transcript,
    ],
  };

  return {
    runId,
    pipelineVersion,
    executions: {
      reader: readerExecution,
      prosecutors: prosecutorExecutions,
      adjudicator: adjudicatorExecution,
    },
    transcript,
    tail,
  };
}
