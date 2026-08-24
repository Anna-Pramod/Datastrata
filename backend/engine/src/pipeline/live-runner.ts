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
 * A response body is an envelope, so a runner with no `ProviderResponseProjector`
 * cannot read what it would pay for. That is the second runtime gate, checked
 * before `fetch` for the same reason the first one is: the thing being prevented
 * is the request, not the misreading afterwards.
 *
 * **The gate is response-only.** The request this file builds — its `x-api-key`
 * header and its `{model, messages}` body — is still shaped for one provider,
 * and `ProviderResponseProjector`'s own documentation records that asymmetry
 * rather than letting the new gate imply the whole file is provider-neutral.
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

/**
 * Turns one provider's HTTP response body into the exact model content string.
 *
 * The seam exists because the alternative is a false generic. An HTTP body is a
 * provider **envelope** — the model's words sit inside provider-specific
 * structure, under a different key in every API — and code that treats the whole
 * body as the role's answer is not "provider-agnostic", it is silently committed
 * to the one provider whose body happens to be bare. This repository has no
 * endpoint configured and documents no internal contract, so there is no such
 * provider here: the assumption was simply unstated.
 *
 * Ownership, and the reason this type lives in this file and nowhere else:
 *
 * ```text
 * provider adapter   envelope        -> model content     (here)
 * role boundary      model content   -> validated output  (agent-role.ts + role-outputs.ts)
 * transcript         records the exact boundary payload   (transcript.ts)
 * ```
 *
 * `outputJson` is therefore the **projected content**, which is what a role
 * parses and what replay serves — so replay never learns that envelopes exist,
 * and `transcript.ts` and `replay.ts` hold no provider knowledge at all.
 *
 * The `request` is passed because some providers key their content by the role
 * or the call, and a projector that needed it would otherwise have to be
 * constructed per request.
 *
 * **B2 chooses no *response* provider, and this seam is response-only.** Which
 * projector to use is part of the explicit first-live-run decision, alongside
 * the model, the endpoint, the configuration and the maximum spend.
 *
 * # The request side is not seamed, and says so
 *
 * The argument above — that treating a body as content is not provider-agnostic
 * but silently committed to one provider — applies verbatim in the other
 * direction, and this task did not fix that direction:
 *
 * ```text
 * request   `x-api-key` header + {model, messages:[{role, content}]} body   COMMITTED
 * response  ProviderResponseProjector                                       SEAMED
 * ```
 *
 * `DEFAULT_ROLE_CONFIG` also pins `claude-opus-5` (`config.ts`), and that model
 * id is a `pipelineVersion` input. So the honest statement is **not** "this
 * repository has chosen no provider" — it is that the response direction now
 * refuses to guess, while the request direction still carries an unstated
 * assumption. Narrowing this claim rather than widening the seam is deliberate:
 * a request adapter is a second design decision, and the first live run is where
 * both belong. Recorded here so the asymmetry is a known item on that decision
 * rather than something the next reader has to rediscover.
 *
 * # The projector needs an identity, and B2 does not give it one
 *
 * **An obligation on the first-live-run decision, recorded before it is met.**
 * This type is a bare function, so a projector is currently anonymous. That is
 * tolerable while nothing may be signed and no run is paid for, and it is not
 * tolerable afterwards:
 *
 * ```text
 * projector A   {content:[{text}]} -> content[0].text
 * projector B   {content:[{text}]} -> content.map(t => t.text).join('')
 * ```
 *
 * Both are defensible readings of one envelope, and they can disagree about
 * **what the model's answer was** — which changes `outputJson`, changes what the
 * seam validates, changes the recorded transcript, and therefore changes
 * `resultSha256`. An execution whose provenance cannot say which projection
 * produced its answer is one B3 cannot measure and B4 cannot reconstruct,
 * exactly as a run that could not say which prompt file it used would be —
 * §5.1's reasoning, one layer further out.
 *
 * So before any real run, decide explicitly whether adapter identity becomes a
 * `pipelineVersion` input — alongside prompt-file hashes, model ids and role
 * configuration — or a separate pinned execution-provenance field. Both are
 * arguable: it is not a prompt, but it does determine the answer.
 *
 * **What must not happen is deciding it implicitly**, by passing an anonymous
 * closure to the first paid run and discovering afterwards that nothing recorded
 * which projection was in force.
 */
export type ProviderResponseProjector = (body: string, request: RoleRequest) => string;

/** A live run was configured with no way to read the provider's answer. */
export class MissingResponseProjectorError extends Error {
  constructor() {
    super(
      'no provider response projector was supplied: an HTTP response body is a provider envelope, not a role output, and no projector has been chosen for any provider. Refusing before any network call rather than making a request whose answer cannot be read correctly — supplying the projector is part of authorising the first live run. Note the seam is response-only: the request headers and body in this file are still shaped for one provider, which is a separate item on that same decision.',
    );
    this.name = 'MissingResponseProjectorError';
  }
}

export interface LiveRunnerOptions {
  /** The model API endpoint. Supplied, never defaulted to a live host. */
  endpoint: string;
  /** Read from the environment by the agents entrypoint, never hard-coded. */
  apiKey: string;
  /**
   * How this provider's response body yields the model's content.
   *
   * Optional in the type and **required at runtime**, deliberately. A required
   * field would make "a live run with no projector" a compile error, and the
   * property worth holding is that a *configured* run refuses before it spends
   * money — which is a runtime refusal with a name, provable by a test.
   */
  projectResponse?: ProviderResponseProjector;
}

/** Returns the projector, or refuses. No fallback, and no default projector. */
export function requireResponseProjector(
  options: Pick<LiveRunnerOptions, 'projectResponse'>,
): ProviderResponseProjector {
  if (options.projectResponse === undefined) throw new MissingResponseProjectorError();
  return options.projectResponse;
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
    // Both gates before the request, and in this order: permission to spend,
    // then the ability to read what the spend bought. Checking the projector
    // after the call would mean paying for an answer and then discovering it
    // could not be interpreted.
    assertLiveAgentsEnabled();
    const project = requireResponseProjector(this.options);
    // Provider-shaped, and not seamed. `x-api-key` is one provider family's auth
    // header and the body below is one API's request shape; another provider
    // needs `Authorization: Bearer` and a different envelope. Task 5e seamed the
    // response direction only, and the first live run owns this one.
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
    // The envelope goes to the adapter; the role sees only the model's content.
    // `outputJson` is that content, so it is what the seam parses, what the
    // transcript records, and what replay serves — one payload, at one boundary.
    return { outputJson: project(await response.text(), request) };
  }
}

/** The gated factory. Refuses before constructing anything. */
export function createLiveAgentRunner(options: LiveRunnerOptions): AgentRunner {
  assertLiveAgentsEnabled();
  requireResponseProjector(options);
  return new LiveAgentRunner(options);
}
