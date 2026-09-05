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
import {
  producePins,
  type CurrentCorpusSource,
  type VerificationPins,
} from '../verification/current-state';
import { renderRequirement, RENDERER_VERSION, type RenderContext } from '../verification/render';
import { createAgentRole } from './agent-role';
import type { RoleConfig } from './config';
import { CLOSURE_RENDERER_VERSION, renderEntitledClosure, type EntitledClosure } from './entitlement';
import type { PipelineGap } from './gaps';
import { buildPipelineIdentity, RESULT_SCHEMA_VERSION } from './identity';
import {
  assertValidProviderAdapterIdentity,
  isProviderAdapterSelected,
  ProviderAdapterMismatchError,
  ProviderAdapterNotSelectedError,
  UnverifiedProviderAdapterError,
} from './provider-adapter';
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
import { sourceIdsOf } from '../knowledge/provenance';
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

/**
 * The one gap-bearing run shape, produced once, here.
 *
 * The record invariant is unconditional: a result carrying a gap carries no
 * reading elements, no coverage cells, no challenges and no open questions
 * (`result.ts`). Each role already canonicalises **its own** output on its own
 * halt, and that is correct and stays. What no role can do is canonicalise the
 * roles *before* it — a prosecutor does not own `reading`, and an adjudicator
 * owns neither `reading` nor the coverage table. So a reader-origin gap
 * satisfied the invariant only incidentally, because the reader runs first and
 * nothing downstream ran; a prosecutor-origin gap left `reading.elements`
 * populated and an adjudicator-origin gap left `reading.elements` and
 * `coverage.cells` populated. Both produced an **Invalid** record, and Invalid
 * writes nothing — so two of the three legitimate gap producers silently
 * destroyed the gap they had found.
 *
 * Orchestration owns phase ordering and halt semantics, so it owns whole-run
 * canonicalisation. Not the assembler: Task 5b established that boundary as
 * *transcribe producers → validate → refuse when producers contradict the
 * record*, and an assembler that erased judgments would make an invalid
 * orchestration shape look valid downstream. Not the roles: a role clearing
 * another role's output is a role owning output it did not produce.
 *
 * **It discards judgments and never touches the gap.** `tail.gaps` is the
 * trigger and passes through untouched; no gap is invented, reclassified or
 * reworded here. Everything the record needs that is not a judgment survives
 * intact — the pins, the closure and requirement identity, the pipeline
 * identity, the transcript, the executions, and each role outcome's own
 * `gaps[]`. The raw role outputs on `executions[]` are left exactly as the
 * agents produced them, because the transcript is where a human looks to see
 * what a run had managed before it stopped.
 *
 * **Immutably.** The adjudicator's `input` still points at the reading and the
 * coverage table it was actually shown, and clearing those in place would erase
 * the record of what the run held before it halted.
 *
 * `challenges` and `openQuestions` are cleared as part of the shape rather than
 * to repair a reachable defect: every role path that reaches a gap today
 * already leaves both empty, because a halting adjudicator discards its own
 * adjudications and a run halting earlier never has one. They are part of the
 * canonical shape, so they are stated here, and `pipeline-assemble.test.ts`
 * holds this function to them directly.
 */
export function canonicaliseGapBearingRun(outcome: PipelineRunOutcome): PipelineRunOutcome {
  if (outcome.tail.gaps.length === 0) return outcome;

  return {
    ...outcome,
    reader: {
      ...outcome.reader,
      output: { ...outcome.reader.output, elements: [] },
    },
    prosecution: {
      ...outcome.prosecution,
      table: { cells: [], challenges: [] },
    },
    adjudication:
      outcome.adjudication === null
        ? null
        : { ...outcome.adjudication, challenges: [], openQuestions: [] },
  };
}

/**
 * The run's identity and the record's pins describe one run.
 *
 * Thrown rather than returned: a run whose transcript is filed under different
 * pins from the ones its dossier publishes has no coherent identity, and there
 * is nothing sensible to publish in that state.
 */
export class PinDivergenceError extends Error {
  constructor(readonly fields: readonly string[]) {
    super(
      `the pins the run was bound to and the pins the tail computed disagree on [${fields.join(', ')}]: one shared producer answered twice over the same inputs and gave two answers, so the transcript would be filed against a question the record does not describe`,
    );
    this.name = 'PinDivergenceError';
  }
}

function assertPinsAgree(bound: VerificationPins, computed: VerificationPins): void {
  const fields = (['requirementInputSha256', 'conditionSha256', 'renderedConditionSha256', 'corpusClosureSha256'] as const).filter(
    (field) => bound[field] !== computed[field],
  );
  if (fields.length > 0) throw new PinDivergenceError(fields);
}

/** The identity this configuration and these prompt files add up to. */
export function pipelineVersionFor(input: {
  prompts: PromptSet;
  config: RoleConfig;
  closure: EntitledClosure;
  resultSchemaVersion?: string;
}): string {
  // Validated before it is hashed, not only when an adapter is registered.
  // `{id:' x ',version:'1'}` and `{id:'x',version:'1'}` hash differently, so an
  // unvalidated identity makes two declarations of one adapter two pipelines.
  assertValidProviderAdapterIdentity(input.config.providerAdapter);
  return buildPipelineIdentity({
    promptSha256: promptHashes(input.prompts),
    models: input.config.models,
    roleConfig: {
      prosecutorCount: input.config.prosecutorCount,
      lenses: input.config.lenses,
      order: input.config.order,
    },
    resultSchemaVersion: input.resultSchemaVersion ?? RESULT_SCHEMA_VERSION,
    // The constant, always. There is no input for it: the grammar the roles
    // read under is a fact about this code, not a choice a caller makes.
    closureRendererVersion: CLOSURE_RENDERER_VERSION,
    providerAdapter: input.config.providerAdapter,
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

  // The run's own identity, derived before the first role call.
  //
  // Both halves come from where they already came from: `producePins` is the
  // one shared pin producer the tail, the sign candidate and the review sheet
  // all go through, and `buildRunId` is the one run-identity derivation. What
  // moved is *when* — Task 5e needs the identity before the reader runs, so a
  // replay capability holding a recording of some other question can refuse at
  // a cost of zero role executions rather than after one.
  //
  // The tail computes its pins again, from the same producer over the same
  // inputs, and is left to: the record's pins are the tail's by contract.
  //
  // That leaves two calls where there was one, and this file's first version
  // justified not checking them by saying a precomputed parameter would "put a
  // pin back into the tail's parameters — the one thing `tail.ts` exists to
  // refuse". That conflated two different things. What `tail.ts` refuses is a
  // pin **an agent can influence**; comparing against a value the tail itself
  // would compute is not that, and the comparison is what makes the equality an
  // enforced property rather than an argument about purity. So the run asserts
  // it below — because the transcript is now filed against `boundPins` while
  // the record carries `tail.pins`, and a divergence would be invisible
  // forever: a later replay binds against `boundPins` again, so the recording
  // and the binding would stay consistent while the published record disagreed
  // with both.
  const boundPins = producePins({
    requirement: input.requirement,
    renderContext: input.renderContext,
    closure: input.closure.pinInput,
    corpus: input.corpus,
  });
  const runId = buildRunId({
    pipelineVersion,
    packId: input.packId,
    requirementId: input.requirementId,
    requirementInputSha256: boundPins.requirementInputSha256,
    renderedConditionSha256: boundPins.renderedConditionSha256,
    corpusClosureSha256: boundPins.corpusClosureSha256,
  });

  // The capability must speak the protocol the identity was derived over.
  //
  // `pipelineVersion` is computed from the *configured* adapter identity, so a
  // capability executing some other protocol would make the recorded identity
  // describe a pipeline that did not run — the same defect as a prosecutor
  // answering under a lens nobody configured.
  //
  // **Which capabilities are exempt is decided by what they claim to be, not by
  // what they omit.** An earlier version tested only `adapter !== undefined`,
  // which made *not declaring one* an exemption: a capability announcing
  // `kind: 'live'` and simply leaving the field off ran to completion and
  // published an identity nothing had checked. A missing declaration from
  // something that executes a provider protocol is an unverifiable claim, not a
  // pass. Replay is exempt because it declares `kind: 'replay'` — it speaks no
  // protocol at all, which is what keeps it provider-independent while still
  // reproducing the identity of the run it replays.
  const configuredAdapter = input.config.providerAdapter;
  if (runner.kind === 'live') {
    // Two different repairs, so two different refusals: the configuration chose
    // no provider, or the capability brought no protocol.
    if (!isProviderAdapterSelected(configuredAdapter)) {
      throw new ProviderAdapterNotSelectedError();
    }
    if (runner.adapter === undefined) {
      throw new UnverifiedProviderAdapterError(configuredAdapter);
    }
  }
  if (runner.adapter !== undefined) {
    if (
      runner.adapter.id !== configuredAdapter.id ||
      runner.adapter.version !== configuredAdapter.version
    ) {
      throw new ProviderAdapterMismatchError(configuredAdapter, runner.adapter);
    }
  }

  // Before the first role call, and for the same reason the guard above is
  // first: a capability holding the wrong recording must refuse before the run
  // does any work. A
  // live runner implements neither hook and is unaffected.
  runner.bind?.({
    runId,
    packId: input.packId,
    requirementId: input.requirementId,
    pipelineVersion,
    requirementInputSha256: boundPins.requirementInputSha256,
    renderedConditionSha256: boundPins.renderedConditionSha256,
    corpusClosureSha256: boundPins.corpusClosureSha256,
  });

  // The projection, built once and by the one function that is allowed to read
  // an `AuthoredRequirement` on the reader's behalf. Nothing below reaches for
  // `input.requirement` again on the reader's account.
  const reader = await runBlindReader({
    input: readerInputFor({
      packId: input.packId,
      requirement: input.requirement,
      closure: input.closure,
    }),
    sourceIds: sourceIdsOf(input.requirement),
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
    closureRendererVersion: CLOSURE_RENDERER_VERSION,
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

  // `runId` was derived above, from the same producer over the same inputs the
  // tail has just walked. Deriving it a second time here from `tail.pins` would
  // be a second construction of the run identity, and the transcript would then
  // be filed under whichever of the two happened to be computed last.
  const transcript: RunTranscript = {
    transcriptSchemaVersion: TRANSCRIPT_SCHEMA_VERSION,
    runId,
    packId: input.packId,
    requirementId: input.requirementId,
    pipelineVersion,
    requirementInputSha256: boundPins.requirementInputSha256,
    renderedConditionSha256: boundPins.renderedConditionSha256,
    corpusClosureSha256: boundPins.corpusClosureSha256,
    roles: [
      ...(reader.execution === null ? [] : [reader.execution.transcript]),
      ...prosecutorExecutions.map((execution) => execution.transcript),
      ...(adjudicatorExecution === null ? [] : [adjudicatorExecution.transcript]),
    ],
  };

  // One producer, called twice, and the two answers are the same answer.
  // `producePins` is pure and both calls receive the same object references, so
  // this cannot fail today — which is the point: an invariant with nothing
  // observing it is an invariant until somebody makes `EntitledClosure` mutable
  // or gives `producePins` a cache.
  assertPinsAgree(boundPins, tail.pins);

  // The run is over as far as the agents are concerned. A replay capability
  // refuses here when the recording held exchanges nothing asked for; a live
  // runner implements nothing and this is a no-op.
  //
  // `halted` is settled above, before the tail, so the placement is not forced
  // by it — an earlier draft of this comment claimed it was, which would have
  // survived a refactor as a reason not to move something that can move. What
  // the argument *is*: a halted run is owed fewer exchanges, because agent
  // verification stops at a gap, so `halted` has to be passed rather than
  // assumed. Requiring a correct halt to have consumed every recorded exchange
  // would turn the halt into a replay failure.
  runner.settle?.({ halted });

  // The last thing that happens, and the only place it happens. Once the tail
  // has collated, `tail.gaps` is the whole run's answer to "was the evidence
  // surface complete", and a gap there invalidates every substantive judgment
  // any role formed against it — including the ones formed before the halt, by
  // roles that have no way to reach back and clear them.
  return canonicaliseGapBearingRun({
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
  });
}
