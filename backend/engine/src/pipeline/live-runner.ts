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
  ProviderHttpRequest,
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

/** What a transport hands back: status, headers as sent, body as text. */
export interface ProviderHttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}

/**
 * Performs one HTTP request. Injected so every offline test runs against a
 * fake and the network trap can prove the real one was never reached; the
 * production wiring supplies `fetchTransport` and nothing else does.
 */
export type ProviderTransport = (request: ProviderHttpRequest, signal: AbortSignal) => Promise<ProviderHttpResponse>;

/**
 * A transport could not deliver an answer.
 *
 * `phase` is the whole point. `before_send` means the transport can vouch
 * that nothing left the process — a refused connection, a failed DNS lookup
 * it observed itself — and such a failure may be retried, because nothing
 * was processed. `unknown` is everything else: the request may have been
 * submitted, processed and billed before the failure, and a retry would be a
 * second request. `fetch` cannot tell the two apart, so the real transport
 * reports `unknown` for every rejection, and the runner refuses rather than
 * guesses.
 */
export class TransportFailure extends Error {
  constructor(
    readonly phase: 'before_send' | 'unknown',
    detail: string,
  ) {
    super(detail);
    this.name = 'TransportFailure';
  }
}

/** The real transport: global `fetch`, with the abort signal the runner's timeout controls. */
export const fetchTransport: ProviderTransport = async (request, signal) => {
  let response: Response;
  try {
    response = await fetch(request.url, { method: request.method, headers: { ...request.headers }, body: request.body, signal });
  } catch (error) {
    // The abort is the runner's own timeout and is reported as such upstream.
    if (signal.aborted) throw error;
    // `fetch` does not say whether the request had left before it failed.
    throw new TransportFailure('unknown', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }
  const headers: Record<string, string> = {};
  // A canned response in a test may carry no Headers object; a real one does.
  if (typeof response.headers?.forEach === 'function') {
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  }
  return { status: response.status, headers, body: await response.text() };
};

/**
 * Statuses the official errors reference marks transient: request timeout
 * and conflict, rate limiting, internal errors, gateway timeouts and
 * overload. A 429 is retried only with the provider's `retry-after`, waited
 * for exactly: the rate-limit reference says earlier retries fail, and the
 * spend-cap 429 carries no header and fails until access resumes. Everything
 * else is refused on the first answer. A timeout is never retried, and neither
 * is a transport failure of unknown phase, because in both the request may
 * already have been processed and billed.
 */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

/**
 * Ten minutes — an enforced local limit, not a promise about latency. The
 * errors reference recommends streaming for requests that may run past ten
 * minutes; a bounded `max_tokens` does not itself prove a request finishes
 * inside it, and no latency has been measured. A request that outlives this
 * is aborted and refused, never retried.
 */
export const DEFAULT_TIMEOUT_MS = 600_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_MS = 1_000;
/**
 * The longest wait the runner will honour. A `retry-after` beyond it is never
 * shortened — an early retry fails — so the request is refused instead,
 * naming the delay the provider asked for, and the caller decides.
 */
export const MAX_RETRY_AFTER_MS = 60_000;

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
  /** Defaults to `fetchTransport`. Tests inject a fake. */
  transport?: ProviderTransport;
  timeoutMs?: number;
  /** Total attempts, first included. */
  maxAttempts?: number;
  backoffMs?: number;
  /** Injected so a retry test does not wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** The endpoint answered with a status the runner will not, or can no longer, retry. */
export class ProviderHttpError extends Error {
  constructor(
    readonly role: string,
    readonly status: number,
    readonly errorType: string | null,
    readonly requestId: string | null,
    readonly attempts: number,
  ) {
    super(
      `${role}: the model endpoint answered ${status}${errorType === null ? '' : ` ${errorType}`}${requestId === null ? '' : ` (request ${requestId})`} after ${attempts} attempt${attempts === 1 ? '' : 's'}`,
    );
    this.name = 'ProviderHttpError';
  }
}

/** The request outlived the timeout. Not retried: it may already have been processed and billed. */
export class ProviderTimeoutError extends Error {
  constructor(readonly role: string, readonly timeoutMs: number) {
    super(`${role}: the model endpoint did not answer within the enforced local limit of ${timeoutMs} ms; the request was aborted and is not retried, because it may already have been processed and billed`);
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * The transport failed and cannot say whether the request had been submitted.
 * Not retried: a second request could be a second processed, billed request.
 */
export class ProviderAmbiguousFailureError extends Error {
  constructor(readonly role: string, detail: string, readonly attempts: number) {
    super(`${role}: the transport failed after the request may have been submitted (${detail}); it is unknown whether the provider processed or billed it, so it is not retried (attempt ${attempts})`);
    this.name = 'ProviderAmbiguousFailureError';
  }
}

/** The production wait; tests inject a recording sleep instead. */
const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Every occurrence of the credential in untrusted text, replaced. */
function redact(text: string, secret: string): string {
  return secret.length === 0 ? text : text.split(secret).join('[redacted]');
}

/**
 * Redacts the credential from the whole surface an error exposes, in place.
 *
 * What Node prints for an uncaught rejection is `util.inspect`, which shows
 * the stack and every own enumerable property — so a clean `message` beside
 * an `explanation` property still holding the key leaks it the moment the
 * error escapes. Every own string property is rewritten, `stack` included:
 * on current V8 it is an accessor whose header is formatted once, from the
 * message as it stood then, so it is read and written back through its
 * setter rather than left to reformat. An `Error` in `cause` is treated the
 * same way. Mutated rather than wrapped, so no unredacted original survives
 * behind another property.
 */
function redactError(error: unknown, secret: string, depth = 0): void {
  if (!(error instanceof Error) || secret.length === 0 || depth > 4) return;
  const record = error as unknown as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(error)) {
    const descriptor = Object.getOwnPropertyDescriptor(error, name);
    if (descriptor === undefined) continue;
    const settable = descriptor.set !== undefined || descriptor.writable === true;
    const value = descriptor.get !== undefined ? descriptor.get.call(error) : descriptor.value;
    if (!settable || typeof value !== 'string') continue;
    record[name] = redact(value, secret);
  }
  redactError((error as { cause?: unknown }).cause, secret, depth + 1);
}

/** Returns the adapter, or refuses. No fallback, and no default adapter. */
export function requireProviderAdapter(
  options: Pick<LiveRunnerOptions, 'adapter'>,
): ProviderAdapter {
  if (options.adapter === undefined) throw new MissingProviderAdapterError();
  return options.adapter;
}

/**
 * The error type, error code and request id an error body carries, without
 * trusting its shape, and with the credential redacted from every field: a
 * provider's text is untrusted, and this is the boundary that knows the key.
 */
function diagnose(response: ProviderHttpResponse, secret: string): { errorType: string | null; errorCode: string | null; requestId: string | null } {
  let errorType: string | null = null;
  let errorCode: string | null = null;
  let requestId: string | null = response.headers['request-id'] ?? null;
  try {
    const parsed = JSON.parse(response.body) as { error?: { type?: unknown; details?: { error_code?: unknown } }; request_id?: unknown };
    if (typeof parsed?.error?.type === 'string') errorType = parsed.error.type;
    if (typeof parsed?.error?.details?.error_code === 'string') errorCode = parsed.error.details.error_code;
    if (requestId === null && typeof parsed?.request_id === 'string') requestId = parsed.request_id;
  } catch {
    // A non-JSON error body is diagnosed by status alone.
  }
  const clean = (value: string | null): string | null => (value === null ? null : redact(value, secret));
  return { errorType: clean(errorType), errorCode: clean(errorCode), requestId: clean(requestId) };
}

/** The provider's `retry-after`, in ms, or `null` when absent or unreadable. */
function retryAfterMs(response: ProviderHttpResponse): number | null {
  const header = response.headers['retry-after'];
  const seconds = header === undefined ? Number.NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

export class LiveAgentRunner implements AgentRunner {
  readonly kind = 'live' as const;
  /** Every HTTP attempt this runner has made, across all role invocations — the spend-accounting figure. */
  #attempts = 0;

  constructor(private readonly options: LiveRunnerOptions) {}

  get adapter(): ProviderAdapterIdentity | undefined {
    return this.options.adapter?.identity;
  }

  get attempts(): number {
    return this.#attempts;
  }

  get maxAttempts(): number {
    return Math.max(1, this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
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
    const transport = this.options.transport ?? fetchTransport;
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxAttempts = this.maxAttempts;
    const backoffMs = this.options.backoffMs ?? DEFAULT_BACKOFF_MS;
    const sleep = this.options.sleep ?? defaultSleep;
    const secret = this.options.apiKey;
    const role = `${request.role}[${request.index}]`;

    for (let attempt = 1; ; attempt += 1) {
      this.#attempts += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: ProviderHttpResponse;
      try {
        response = await transport(spec, controller.signal);
      } catch (error) {
        clearTimeout(timer);
        if (controller.signal.aborted) throw new ProviderTimeoutError(role, timeoutMs);
        // The credential is redacted from every message the transport
        // produced before anything is decided about it: this is the boundary
        // that knows the key, and the text is untrusted.
        const detail = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error), secret);
        if (error instanceof TransportFailure && error.phase === 'before_send') {
          // Vouched pre-submission: nothing was processed, so it may be retried.
          if (attempt >= maxAttempts) throw new ProviderHttpError(role, 0, `connection failure (${detail})`, null, attempt);
          await sleep(Math.min(backoffMs * 2 ** (attempt - 1), MAX_RETRY_AFTER_MS));
          continue;
        }
        // Anything else — a TypeError from fetch, a failure of unknown phase,
        // a defect in this code — is not retried. The suite's offline guard
        // arrives here too, and its message survives the redaction.
        throw new ProviderAmbiguousFailureError(role, detail, attempt);
      }
      clearTimeout(timer);

      if (response.status >= 200 && response.status < 300) {
        // The envelope goes to the adapter; the role sees only the model's
        // content. A completed answer the adapter refuses — truncated, refused,
        // malformed — is not retried: the request succeeded and the content is
        // unusable, and asking again would be a different run's answer. The
        // refusal's text came from the provider and is redacted like any other,
        // from every property the error exposes, not only its message.
        try {
          return { outputJson: adapter.projectResponse(response.body, request) };
        } catch (error) {
          redactError(error, secret);
          throw error;
        }
      }
      const { errorType, errorCode, requestId } = diagnose(response, secret);
      const named = errorCode === null ? errorType : `${errorType ?? 'error'} ${errorCode}`;
      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= maxAttempts) {
        throw new ProviderHttpError(role, response.status, named, requestId, attempt);
      }
      const askedMs = retryAfterMs(response);
      // A 429 without the header is the spend-cap form, or an acceleration
      // limit: the reference says retrying fails until access resumes.
      if (response.status === 429 && askedMs === null) {
        throw new ProviderHttpError(role, response.status, `${named ?? 'rate_limit_error'} with no retry-after: retrying fails until access resumes`, requestId, attempt);
      }
      if (askedMs !== null && askedMs > MAX_RETRY_AFTER_MS) {
        throw new ProviderHttpError(role, response.status, `${named ?? 'transient'} with retry-after ${askedMs / 1000} s, more than the permitted wait of ${MAX_RETRY_AFTER_MS / 1000} s; not retried early, because an earlier retry would fail`, requestId, attempt);
      }
      await sleep(askedMs ?? Math.min(backoffMs * 2 ** (attempt - 1), MAX_RETRY_AFTER_MS));
    }
  }
}

export function createLiveAgentRunner(options: LiveRunnerOptions): AgentRunner {
  assertLiveAgentsEnabled();
  requireProviderAdapter(options);
  return new LiveAgentRunner(options);
}
