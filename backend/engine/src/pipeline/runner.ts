/**
 * The injected runner, and the guard in front of it.
 *
 * §5.2 gives the two suites structurally different powers: the machinery suite
 * runs on recorded transcripts, blocks commits, and performs no network call
 * and no spend; the agents suite runs live, blocks pipeline promotion, and never
 * blocks a commit. That separation has to be *structural* rather than
 * conventional, and dependency injection alone does not make it so. A live
 * runner that stays importable and callable under ordinary vitest is one
 * forgotten argument away from a green CI run that quietly bought tokens.
 *
 * So the separation is three things, and this file is one of them:
 *
 *  1. **A guard.** A run handed no runner fails *before* performing any I/O,
 *     loudly and by name, rather than falling back to anything. There is no
 *     default runner in this module and there is no import of the live one.
 *  2. **A capability gate** on the live entrypoint (`live-runner.ts`), which
 *     refuses to run without an explicit environment token.
 *  3. **Suite separation**: `vitest.config.ts` excludes `*.agents.test.ts` from
 *     the default run, and `npm run test:agents` is the only thing that runs it.
 *
 * The guard is deliberately the *first* thing orchestration does. A guard that
 * fired after the closure was built and the prompts were loaded would still be
 * correct and would still be worse: the failure would arrive after the run had
 * begun doing work, and the thing being prevented is a run beginning at all.
 *
 * Pure with respect to I/O: this module has no network and no filesystem in it.
 */

import type { RoleRequest } from './roles';

/** What a runner is: replayed from a recording, or live against a model. */
export type RunnerKind = 'replay' | 'live';

/** One role's raw response. Parsing it is the seam's job, not the runner's. */
export interface RoleResponse {
  /** The response text, exactly as returned. */
  outputJson: string;
}

/**
 * Which run a capability is about to execute.
 *
 * Handed to `bind` before the first role call, and derived entirely by
 * orchestration out of the world it was given — the same `pipelineVersion` the
 * result pins, the same pins the shared producer computes, the same `runId`
 * the transcript is filed under. A capability that needed to compute any of it
 * for itself would be a second derivation of the run's identity.
 */
export interface RunBinding {
  runId: string;
  packId: string;
  requirementId: string;
  pipelineVersion: string;
  requirementInputSha256: string;
  renderedConditionSha256: string;
  corpusClosureSha256: string;
}

/** How a run ended, so a capability can check what it was owed. */
export interface RunSettlement {
  /** True when a gap stopped agent verification before the last role ran. */
  halted: boolean;
}

/**
 * The only way orchestration reaches an agent.
 *
 * Narrow on purpose: a runner receives a fully-assembled request and returns
 * text. It does not choose a model, does not know what role means, and does not
 * validate — so a replay runner and a live runner differ in exactly one thing,
 * which is where the response comes from.
 *
 * `bind` and `settle` are the two optional edges of that, and both are
 * *questions orchestration answers*, never work it delegates:
 *
 * ```text
 * bind(binding)     before the first role call — "this is the run you are about
 *                   to answer for". A replay capability refuses here when its
 *                   recording describes a different run, so a mismatched
 *                   transcript costs zero role executions.
 * settle(outcome)   after the last one — "the run is over". A replay capability
 *                   refuses here when the recording held exchanges nothing
 *                   consumed, which is how a recording of a *larger* pipeline
 *                   fails instead of quietly satisfying a smaller one.
 * ```
 *
 * Optional because a live runner has nothing to check: it answers whatever it
 * is asked and has no recording to be wrong about. Making them required would
 * put two empty methods on the one implementation that spends money.
 */
export interface AgentRunner {
  readonly kind: RunnerKind;
  /** Called once, before any role runs. Throwing refuses the whole run. */
  bind?(binding: RunBinding): void;
  run(request: RoleRequest): Promise<RoleResponse>;
  /** Called once, after the last role ran. Throwing refuses the whole run. */
  settle?(outcome: RunSettlement): void;
}

/**
 * No runner was supplied.
 *
 * The message names the situation rather than describing a null: a caller
 * reading it in CI needs to know that the machinery suite is supposed to hand
 * in a replay runner, and that nothing was contacted.
 */
export class MissingAgentRunnerError extends Error {
  constructor() {
    super(
      'no agent runner was supplied: the verification machinery runs on recorded transcripts and must be handed a replay runner. Refusing before any network I/O rather than falling back to a live runner — a live run belongs to `npm run test:agents`, never to `npm test`.',
    );
    this.name = 'MissingAgentRunnerError';
  }
}

/**
 * The guard. Returns the runner it was given, or refuses.
 *
 * There is no second parameter and no fallback. Anything that made "…or else
 * use this one" expressible here would make the default suite one argument away
 * from a live call.
 */
export function requireRunner(runner: AgentRunner | null | undefined): AgentRunner {
  if (runner === null || runner === undefined) throw new MissingAgentRunnerError();
  return runner;
}
