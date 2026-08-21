/**
 * The live entrypoint, behind an explicit capability gate.
 *
 * This is the only module in the repository that talks to a model, and it is
 * the only one that spends money. §5.2 says the agents suite "blocks pipeline
 * promotion" and "never blocks a commit", which means `npm test` must be unable
 * to reach this code — not merely uninclined to.
 *
 * **Nothing in `src/` imports this file.** `runner.ts` holds the guard and has
 * no reference to it; orchestration reaches agents only through the injected
 * `AgentRunner`. The import boundary is asserted by a test, because a boundary
 * maintained by intention is a boundary until somebody adds a convenient
 * default.
 *
 * **The gate is checked at every call, not only at construction.** A gate that
 * fired only in the factory would be defeated by a constructed instance being
 * held across a change of environment, and — more to the point — by anything
 * that constructs the class directly. `run()` re-checks, so an instance is
 * inert without the token no matter how it was obtained.
 *
 * **The token is an environment variable with an exact value**, not a
 * truthiness test. `DATASTRATA_VERIFICATION_AGENTS=1` set by a developer who
 * means it is a different act from a stray non-empty string in a CI
 * environment.
 */

import type { AgentRunner, RoleResponse } from './runner';
import type { RoleRequest } from './roles';

/** The capability token's variable, and the one value that opens the gate. */
export const LIVE_AGENTS_ENV = 'DATASTRATA_VERIFICATION_AGENTS';
export const LIVE_AGENTS_TOKEN = '1';

/** The gate refused. Never a refusal to sign — a refusal to spend. */
export class AgentCapabilityError extends Error {
  constructor() {
    super(
      `live agent runs are gated: set ${LIVE_AGENTS_ENV}=${LIVE_AGENTS_TOKEN} and run \`npm run test:agents\`. The default suite runs on recorded transcripts and must never reach a model.`,
    );
    this.name = 'AgentCapabilityError';
  }
}

/** Throws unless the capability token is present with its exact value. */
export function liveAgentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[LIVE_AGENTS_ENV] === LIVE_AGENTS_TOKEN;
}

export function assertLiveAgentsEnabled(env: NodeJS.ProcessEnv = process.env): void {
  if (!liveAgentsEnabled(env)) throw new AgentCapabilityError();
}

export interface LiveRunnerOptions {
  /** The model API endpoint. Supplied, never defaulted to a live host. */
  endpoint: string;
  /** Read from the environment by the agents entrypoint, never hard-coded. */
  apiKey: string;
}

/**
 * A runner that actually calls a model.
 *
 * Deliberately thin: the request is already assembled by the role, so this
 * turns messages into a request body, performs one `fetch`, and returns the
 * response text. Everything interesting about a run happens outside it.
 */
export class LiveAgentRunner implements AgentRunner {
  readonly kind = 'live' as const;

  constructor(private readonly options: LiveRunnerOptions) {}

  async run(request: RoleRequest): Promise<RoleResponse> {
    assertLiveAgentsEnabled();
    const response = await fetch(this.options.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.options.apiKey,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map((message) => ({
          role: message.from === 'agent' ? 'assistant' : 'user',
          content: message.content,
        })),
      }),
    });
    if (!response.ok) {
      throw new Error(
        `${request.role}[${request.index}]: the model endpoint answered ${response.status}`,
      );
    }
    return { outputJson: await response.text() };
  }
}

/** The gated factory. Refuses before constructing anything. */
export function createLiveAgentRunner(options: LiveRunnerOptions): AgentRunner {
  assertLiveAgentsEnabled();
  return new LiveAgentRunner(options);
}
