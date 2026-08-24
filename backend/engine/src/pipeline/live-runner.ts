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
 *
 * **And the token is not the only thing missing until a provider is chosen.**
 * Both directions of the provider protocol now live behind one named, versioned
 * `ProviderAdapter` (`provider-adapter.ts`): it builds the request and it
 * projects the response. This file holds no `x-api-key`, no `{model, messages}`
 * body and no assumption that a response body is an answer. It performs the
 * request an adapter describes and hands the adapter's projected content to the
 * ordinary role boundary.
 *
 * ```text
 * RoleRequest -> adapter.buildRequest -> fetch -> adapter.projectResponse
 *             -> model-content string -> the same seam replay goes through
 * ```
 *
 * **The adapter's identity is a `pipelineVersion` input**, so this file cannot
 * choose one: the identity is declared in `RoleConfig` and the adapter is
 * resolved from it. A runner executing an adapter whose identity differs from
 * the configured one is refused by orchestration, because the recorded identity
 * would otherwise describe a pipeline that did not run.
 *
 * **A run with no adapter refuses before the request**, for the same reason the
 * token gate does: the thing being prevented is the spend, not the misreading
 * afterwards.
 */

import type { AgentRunner, RoleResponse } from './runner';
import type { RoleRequest } from './roles';
import type {
  ProviderAdapter,
  ProviderAdapterIdentity,
  ProviderEndpointConfig,
} from './provider-adapter';

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

/** A live run was configured with no provider adapter to speak through. */
export class MissingProviderAdapterError extends Error {
  constructor() {
    super(
      'no provider adapter was supplied: a provider protocol is request *and* response — an HTTP body is an envelope, not a role output, and the headers and body a provider expects are its own. No adapter has been chosen, and refusing here rather than guessing is the point. Supplying one is part of authorising the first live run, and because its identity is a pipelineVersion input, doing so also changes which pipeline this is.',
    );
    this.name = 'MissingProviderAdapterError';
  }
}

export interface LiveRunnerOptions extends ProviderEndpointConfig {
  /**
   * The provider protocol this runner speaks.
   *
   * Optional in the type and **required at runtime**, deliberately. A required
   * field would make "a live run with no adapter" a compile error, and the
   * property worth holding is that a *configured* run refuses before it spends
   * money — a runtime refusal with a name, provable by a test.
   */
  adapter?: ProviderAdapter;
}

/** Returns the adapter, or refuses. No fallback, and no default adapter. */
export function requireProviderAdapter(
  options: Pick<LiveRunnerOptions, 'adapter'>,
): ProviderAdapter {
  if (options.adapter === undefined) throw new MissingProviderAdapterError();
  return options.adapter;
}

/**
 * A runner that actually calls a model.
 *
 * Deliberately thin, and thinner than it was: the adapter builds the request and
 * projects the response, so this performs one `fetch` over a description it did
 * not write and returns a string it did not extract. It knows no auth
 * convention, no body shape and no envelope. Everything interesting about a run
 * happens outside it.
 */
export class LiveAgentRunner implements AgentRunner {
  readonly kind = 'live' as const;

  constructor(private readonly options: LiveRunnerOptions) {}

  /**
   * The provider semantics this runner actually speaks.
   *
   * Read by orchestration and compared against the configured identity, so a
   * capability cannot execute one protocol while the record claims another.
   * `undefined` until an adapter is supplied — and a run that reaches `run()`
   * without one refuses there.
   */
  get adapter(): ProviderAdapterIdentity | undefined {
    return this.options.adapter?.identity;
  }

  async run(request: RoleRequest): Promise<RoleResponse> {
    // Both gates before the request, and in this order: permission to spend,
    // then the ability to speak the protocol at all. Checking after the call
    // would mean paying for an answer that could not be read.
    assertLiveAgentsEnabled();
    const adapter = requireProviderAdapter(this.options);

    // The adapter owns the whole request: URL, method, headers, body. This file
    // contributes nothing provider-shaped and knows no auth convention.
    const spec = adapter.buildRequest(request, {
      endpoint: this.options.endpoint,
      apiKey: this.options.apiKey,
    });
    const response = await fetch(spec.url, {
      method: spec.method,
      headers: { ...spec.headers },
      body: spec.body,
    });
    if (!response.ok) {
      throw new Error(
        `${request.role}[${request.index}]: the model endpoint answered ${response.status}`,
      );
    }
    // The envelope goes to the adapter; the role sees only the model's content.
    // `outputJson` is that content, so it is what the seam parses, what the
    // transcript records, and what replay serves — one payload, at one boundary,
    // and no provider-specific validation path anywhere after it.
    return { outputJson: adapter.projectResponse(await response.text(), request) };
  }
}

/** The gated factory. Refuses before constructing anything. */
export function createLiveAgentRunner(options: LiveRunnerOptions): AgentRunner {
  assertLiveAgentsEnabled();
  requireProviderAdapter(options);
  return new LiveAgentRunner(options);
}
