/**
 * The capture path: a live run, recorded so it can be replayed offline forever
 * after.
 *
 * **Nothing in the default suite executes this.** It is reached only from
 * `pipeline-live.agents.test.ts`, which `vitest.config.ts` excludes and
 * `npm run test:agents` is the only thing that runs — and even there it is
 * inert without the capability token. What the default suite *does* prove about
 * it is the refusal: `pipeline-replay.test.ts` calls `liveCaptureConfigFrom`
 * and `captureLiveRun` with no opt-in and asserts a named failure with the
 * network trap unfired.
 *
 * # Two gates, and a credential is neither of them
 *
 * ```text
 * DATASTRATA_VERIFICATION_AGENTS=1   the capability token — an act, not a state
 * DATASTRATA_AGENT_ENDPOINT          the endpoint, named explicitly
 * DATASTRATA_AGENT_API_KEY           the credential
 * projectResponse                    how this provider's envelope yields content
 * ```
 *
 * The fourth is not an environment variable because it is not a secret and not a
 * string — it is the provider adapter, and B2 has chosen no provider. It is
 * passed in, and its absence is a named refusal *before* any network call: a run
 * that could not read the answer it paid for should never make the request.
 *
 * All four are required and none implies another. An API key sitting in a
 * developer's environment is emphatically **not** permission to spend: the token
 * is a separate variable with an exact value. The endpoint is named rather than
 * defaulted, so there is no host this code will contact unless somebody typed
 * it.
 *
 * **Two environments, and it is worth being exact about which is which.**
 * `liveCaptureConfigFrom` and `assertLiveAgentsEnabled` read the env this
 * function is *handed*; `createLiveAgentRunner` and `LiveAgentRunner.run` read
 * the ambient `process.env`, because that is Task 1's signature and this task
 * does not change it. The composition is fail-closed in both directions — a
 * caller who sets the token only in the injected env still gets
 * `AgentCapabilityError` from the constructor — but a partially-configured
 * caller therefore does not always receive the carefully-worded
 * `LiveCaptureConfigError`, and pretending otherwise would be the kind of claim
 * that reads as a guarantee and is not one.
 *
 * # What is captured, and what a transcript is worth
 *
 * The recording is the one **orchestration already built** — `runRun` hands it
 * over through `RunCapabilities.record` and this writes it down. It is not
 * assembled here, because a second assembly would be a second account of what
 * the roles were sent.
 *
 * `outputJson` is the runner's response text, stored verbatim and unparsed, so
 * replay hands the same bytes to the same seam a live run did. That is the whole
 * "reproduce the validated role output without asking again" property: the
 * validation is not captured, only its input.
 *
 * # Known, and deliberately not decided here
 *
 * `LiveAgentRunner` no longer treats the HTTP body as the role's answer: a
 * `ProviderResponseProjector` sits between them, and a capture with no projector
 * is refused here before the runner is even constructed. What is *not* decided
 * is which projector — that means choosing a provider response shape, and the
 * plan makes the provider, the model and the configuration part of the separate
 * decision that authorises the first live run.
 *
 * **The seam is response-only.** `LiveAgentRunner`'s request headers and body are
 * still shaped for one provider, and `DEFAULT_ROLE_CONFIG` pins `claude-opus-5`.
 * That asymmetry is recorded on `ProviderResponseProjector` and is a second item
 * on the same decision, not something this harness closes.
 */

import { mkdirSync } from 'node:fs';

import { EXIT_OK } from '../src/cli/exit-codes';
import type { VerifyPaths } from '../src/cli/sign';
import { dispatch } from '../src/cli/verify';
import {
  assertLiveAgentsEnabled,
  createLiveAgentRunner,
  liveAgentsEnabled,
  requireResponseProjector,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  type ProviderResponseProjector,
} from '../src/pipeline/live-runner';
import { writeRunTranscript, type RunTranscript } from '../src/pipeline/transcript';

export const LIVE_ENDPOINT_ENV = 'DATASTRATA_AGENT_ENDPOINT';
export const LIVE_API_KEY_ENV = 'DATASTRATA_AGENT_API_KEY';

/**
 * A live capture was asked for without everything it explicitly requires.
 *
 * An exported `LIVE_CAPTURE_GATES` constant stood here briefly and was removed:
 * nothing but this message consumed it, so its *contents* had no unique kill —
 * a mutation dropping an entry reddened nothing, because the only test that read
 * it iterated the very list under test. A constant a suite can confirm only
 * tautologically is worse than prose, because it looks like a contract. What
 * makes each gate load-bearing is that removing its *enforcement* reds a case:
 * the three environment gates below, and `requireResponseProjector` in
 * `captureLiveRun`.
 */
export class LiveCaptureConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `a live capture requires ${LIVE_AGENTS_ENV}, ${LIVE_ENDPOINT_ENV}, ${LIVE_API_KEY_ENV} and a provider response projector, and is missing [${missing.join(', ')}]. A credential on its own is not permission to spend: ${LIVE_AGENTS_ENV}=${LIVE_AGENTS_TOKEN} is a separate, deliberate act, the endpoint is named rather than defaulted so that no host is contacted unless somebody typed it, and the projector is the provider adapter without which the answer could not be read.`,
    );
    this.name = 'LiveCaptureConfigError';
  }
}

export interface LiveCaptureConfig {
  endpoint: string;
  apiKey: string;
}

/**
 * The three variables, or a named refusal listing exactly which are absent.
 *
 * Returns rather than reads `process.env` by default so the refusal is testable
 * without a test having to mutate the ambient environment — which is how a
 * suite comes to depend on the order its files happen to run in.
 *
 * Covers the three *environment* gates. The fourth, `projectResponse`, is not an
 * environment variable — it is the provider adapter — and is checked by
 * `captureLiveRun` through the production `requireResponseProjector`.
 */
export function liveCaptureConfigFrom(env: NodeJS.ProcessEnv): LiveCaptureConfig {
  const missing: string[] = [];
  // Delegated to the production predicate rather than re-testing the variable
  // here. A second copy of "what counts as opted in" is a second answer, and
  // the answer that matters is the one `createLiveAgentRunner` re-checks.
  if (!liveAgentsEnabled(env)) missing.push(LIVE_AGENTS_ENV);
  const endpoint = env[LIVE_ENDPOINT_ENV];
  const apiKey = env[LIVE_API_KEY_ENV];
  if (endpoint === undefined || endpoint === '') missing.push(LIVE_ENDPOINT_ENV);
  if (apiKey === undefined || apiKey === '') missing.push(LIVE_API_KEY_ENV);
  if (missing.length > 0) throw new LiveCaptureConfigError(missing);
  return { endpoint: endpoint!, apiKey: apiKey! };
}

export interface LiveCaptureRequest {
  packId: string;
  requirementId: string;
  /** The world to run over. The caller decides; this reads no repository path. */
  paths: VerifyPaths;
  /** Where the recording is filed. Absolute; `TRANSCRIPT_ROOT` is the fixture one. */
  transcriptRoot: string;
  /** The environment the gates are read from. Never defaulted to `process.env`. */
  env: NodeJS.ProcessEnv;
  /**
   * The provider adapter. Absent until the first live run chooses a provider.
   *
   * Not defaulted to "the whole body", which is what the runner did before this
   * task and is a false generic — an HTTP body is an envelope for every real
   * provider API.
   */
  projectResponse?: ProviderResponseProjector;
}

export interface LiveCaptureOutcome {
  exitCode: number;
  lines: string[];
  transcript: RunTranscript;
  transcriptPath: string;
}

/**
 * One live run, through the production command path, with its recording kept.
 *
 * The gates are checked **before anything is constructed**, so an unauthorised
 * call fails having contacted nothing: `liveCaptureConfigFrom` first, then
 * `assertLiveAgentsEnabled`, then `createLiveAgentRunner` — which re-checks the
 * token a third time at construction and again at every call.
 */
export async function captureLiveRun(request: LiveCaptureRequest): Promise<LiveCaptureOutcome> {
  const config = liveCaptureConfigFrom(request.env);
  assertLiveAgentsEnabled(request.env);
  // Before the runner exists, and therefore long before `fetch`. Checked here as
  // well as inside the runner because this is the layer that knows a capture was
  // *asked for*, and the refusal is more useful the earlier it lands.
  requireResponseProjector(request);

  const runner = createLiveAgentRunner({ ...config, projectResponse: request.projectResponse });

  let recorded: RunTranscript | null = null;
  const outcome = await dispatch(
    ['run', request.packId, request.requirementId],
    request.paths,
    () => true,
    undefined,
    {
      runner,
      record: (transcript) => {
        recorded = transcript;
      },
    },
  );

  if (recorded === null) {
    throw new Error(
      `the live run produced no recording (exit ${outcome.exitCode}):\n${outcome.lines.join('\n')}`,
    );
  }
  if (outcome.exitCode !== EXIT_OK) {
    throw new Error(
      `the live run did not complete (exit ${outcome.exitCode}):\n${outcome.lines.join('\n')}`,
    );
  }

  const transcript: RunTranscript = recorded;
  mkdirSync(request.transcriptRoot, { recursive: true });
  const path = writeRunTranscript(request.transcriptRoot, transcript);
  return { exitCode: outcome.exitCode, lines: outcome.lines, transcript, transcriptPath: path };
}
