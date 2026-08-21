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

import type { RoleName, RoleRequest } from './roles';
import type { RunTranscript } from './transcript';

/** What a runner is: replayed from a recording, or live against a model. */
export type RunnerKind = 'replay' | 'live';

/** One role's raw response. Parsing it is the seam's job, not the runner's. */
export interface RoleResponse {
  /** The response text, exactly as returned. */
  outputJson: string;
}

/**
 * The only way orchestration reaches an agent.
 *
 * Narrow on purpose: a runner receives a fully-assembled request and returns
 * text. It does not choose a model, does not know what role means, and does not
 * validate — so a replay runner and a live runner differ in exactly one thing,
 * which is where the response comes from.
 */
export interface AgentRunner {
  readonly kind: RunnerKind;
  run(request: RoleRequest): Promise<RoleResponse>;
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

/** A recorded exchange the replay runner could not find. */
export class TranscriptReplayError extends Error {
  constructor(
    readonly role: RoleName,
    readonly index: number,
    readonly runId: string,
  ) {
    super(
      `transcript ${runId} holds no recorded exchange for ${role}[${index}]: the recording and the run being replayed do not describe the same pipeline`,
    );
    this.name = 'TranscriptReplayError';
  }
}

/**
 * Replays a recorded run. No network, no spend, no model.
 *
 * Matched by `role` and `index` rather than by call order, so a reordering bug
 * in orchestration surfaces as a missing exchange instead of as prosecutor 2's
 * answer quietly standing in for prosecutor 1's.
 */
export function replayRunner(transcript: RunTranscript): AgentRunner {
  const byKey = new Map(transcript.roles.map((entry) => [`${entry.role}:${entry.index}`, entry]));
  return {
    kind: 'replay',
    run(request: RoleRequest): Promise<RoleResponse> {
      const recorded = byKey.get(`${request.role}:${request.index}`);
      if (recorded === undefined) {
        throw new TranscriptReplayError(request.role, request.index, transcript.runId);
      }
      return Promise.resolve({ outputJson: recorded.outputJson });
    },
  };
}
