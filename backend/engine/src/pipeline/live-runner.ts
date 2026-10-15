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
 *
 * **Every attempt is accounted for, and the account precedes the error.** An
 * `AttemptRecord` goes to the injected observer before the runner throws
 * anything about that attempt, so a failed run still says what it sent, what
 * came back, and what the provider reported metering. A `RunBudget` is
 * enforced before each send: a body above the admitted size and an attempt
 * beyond the run's retry-inclusive budget are refused unsent. What the budget
 * enforces is exact — bytes and attempts — and what it does not is stated:
 * tokens and money are the provider's figures, known only afterwards, and
 * unknown after an ambiguous failure, which spends its attempt all the same.
 * Budget values are validated as finite positive safe integers at
 * construction. A caller's `AbortSignal` bounds the execution's lifetime:
 * it aborts the attempt in flight, ends any wait, and refuses every later
 * send. An observer that throws halts the runner under its own name; the
 * attempt it was handed had already been booked once.
 *
 * **Two channels, one record shape.** An adapter declares its `channel`:
 * `http` — the default, and everything described above — or `process`, where
 * the "transport" launches a local child (the pinned Claude Code CLI on a
 * subscription) and this file observes no HTTP exchange at all. The channel
 * is fixed at construction from the adapter and stamped on every record,
 * including one for an attempt that was never sent, because it is a property
 * of what the run *was going to do*, and a reader must never infer it from
 * what came back. On the process channel the HTTP fields keep their exact
 * meaning rather than being reinterpreted: `status` is the HTTP status
 * observed, so it is `null` — a synthetic 200 would be a claim about a wire
 * this file never saw; `possiblyBilled` follows `launched`, because a child
 * that started may have reached the provider whether or not the CLI reported
 * usage; and the ledger names the unit it counted and records the HTTP attempt
 * count as unknown. Retry-by-status, `retry-after` and error diagnosis are
 * HTTP facts, so a response carrying process facts skips them entirely and
 * goes to projection. A transport that could not observe its own evidence
 * throws `EvidenceObservationFailedError`: booked once under its own outcome,
 * it halts the runner as an observer failure does, and is rethrown unwrapped,
 * so the harness that owns the evidence sees the failure under its own name.
 */

import type { AgentRunner, RoleResponse } from './runner';
import type { RoleRequest } from './roles';
import type {
  InvocationIdentity,
  ProviderAdapter,
  ProviderAdapterIdentity,
  ProviderEndpointConfig,
  ProviderHttpRequest,
  ProviderUsage,
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

/**
 * What a process transport observed of one child, whether or not the child
 * produced an answer. Every field is what the transport saw, never what it
 * intended: `started` is true only once a child existed; `termination` is
 * present only when the transport had to end one, and records what it
 * observed of that rather than what it sent; the prompt-file fields say
 * whether the evidence on disk was removed rather than assuming it was.
 * `null` means unobserved, as everywhere else in the record.
 */
export interface ProcessFacts {
  started: boolean;
  pid: number | null;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  promptFileBytes: number | null;
  stdinBytes: number | null;
  promptFileRemoved: boolean | null;
  promptFileRemovalError: string | null;
  termination: {
    forced: boolean;
    processGroupMade: boolean;
    signalsSent: string[];
    childReaped: boolean;
    groupGone: boolean | null;
  } | null;
}

/**
 * What a transport hands back: status, headers as sent, body as text. A
 * process transport adds `process`; its `status` is then a placeholder the
 * runner never records, because no HTTP status was observed.
 */
export interface ProviderHttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
  process?: ProcessFacts;
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

/**
 * A transport could not observe its own evidence: a launch record it was to
 * hand over was refused, a capture it owed could not be written. Distinct
 * from every provider and process failure because the answer, if any, is not
 * the problem — the account of the attempt is. The runner books the attempt
 * once under `observation_failed`, halts, and rethrows this instance
 * unwrapped, so the harness that owns the evidence sees its own failure and
 * not a transport failure of unknown phase. Transports throw it or a
 * subclass; `process` carries what was observed of the child, when there was
 * one to observe.
 */
export class EvidenceObservationFailedError extends Error {
  constructor(
    detail: string,
    readonly process?: ProcessFacts,
  ) {
    super(detail);
    this.name = 'EvidenceObservationFailedError';
  }
}

/**
 * A process transport ended a child, or lost one, before an answer: an
 * abort, an output bound exceeded, a child that would not exit. It always
 * carries the facts, because a launch that started and was then terminated
 * is exactly the account the ledger needs, and `started` is what decides
 * whether the attempt may have been billed. The runner classifies it from
 * its own abort reason — cancelled, timed out — not from this error's name.
 */
export class ProcessTransportError extends Error {
  constructor(
    detail: string,
    readonly process: ProcessFacts,
  ) {
    super(detail);
    this.name = 'ProcessTransportError';
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

/**
 * What one attempt did, as the runner saw it. Nothing here came from a header
 * the runner did not read. `observation_failed` is the transport's own
 * account failing, not the attempt: the answer, if there was one, is
 * discarded because it cannot be evidenced.
 */
export type AttemptOutcome =
  | 'completed'
  | 'projection_refused'
  | 'retry_scheduled'
  | 'refused'
  | 'timeout'
  | 'ambiguous'
  | 'cancelled'
  | 'not_sent'
  | 'observation_failed';

/**
 * One record per attempt, emitted before the runner throws anything about
 * it, so a run that fails still leaves an account of every request it made.
 * `runAttempt` counts across the whole runner — the spend figure; `attempt`
 * counts within one role invocation. `usage` is what the adapter read from
 * the envelope, or `null` for unknown, never zero. `possiblyBilled` is true
 * for every sent attempt whose usage is unknown, except a failure the
 * transport vouched for as pre-submission: an error status is usually not
 * billed, but the runner does not know that, and says so. `cancelled` with
 * `sent: true` is an attempt aborted in flight by the caller's signal, and is
 * possibly billed; with `sent: false` it is an invocation refused because the
 * signal had already fired. `detail` is redacted diagnostic text; no header,
 * no body, no credential.
 *
 * On the process channel the same fields keep the same meaning and three are
 * added. `status` stays the HTTP status observed, which is none, so `null`.
 * `possiblyBilled` follows `launched`: a child that started may have reached
 * the provider whatever the CLI reported, and one that never started cannot
 * have. An HTTP record carries `channel: 'http'` and nothing else new.
 */
export interface AttemptRecord {
  role: string;
  index: number;
  attempt: number;
  runAttempt: number;
  /** Declared by the adapter before anything ran, and stamped on every record, sent or not. */
  channel: 'http' | 'process';
  sent: boolean;
  status: number | null;
  requestId: string | null;
  usage: ProviderUsage | null;
  outcome: AttemptOutcome;
  detail: string | null;
  possiblyBilled: boolean;
  delayMs: number | null;
  /** Process channel: a child was actually started. Absent where no launch was attempted, and on the HTTP channel, whose unit is the request. */
  launched?: boolean;
  /** Process channel: what the transport observed of the child, when it had facts to give. */
  process?: ProcessFacts;
  /** Where a non-null `usage` came from. Stamped `cli_report` on the process channel; the HTTP channel's records are unchanged and carry none. */
  usageSource?: 'provider_envelope' | 'cli_report';
}

export type AttemptObserver = (record: AttemptRecord) => void;

/**
 * What the runner enforces before each send. Both are exact on what they
 * measure and only that: bytes of request body, and HTTP attempts. Neither is
 * a token count or a sum of money — those would need the provider's own
 * figures, which arrive after the request, if at all. The attempt budget is
 * retry-inclusive across the whole runner, and an attempt that ended
 * ambiguously has spent its unit exactly as a completed one has, because it
 * may have been billed.
 */
export interface RunBudget {
  maxRunAttempts: number;
  maxInputBytesPerAttempt: number;
}

/**
 * The runner's own account of what it has spent, in units it can measure.
 * `attemptUnit` names the unit `attemptsUsed` counts, from the channel. On
 * the process channel the CLI makes the HTTP requests and this file sees none
 * of them, so `httpAttemptsObserved` is `null` — unknown, never zero — and
 * `launchesStarted` is the count that can be known: children that existed.
 */
export interface BudgetLedger {
  attemptUnit: 'http_attempt' | 'cli_launch';
  maxRunAttempts: number | null;
  attemptsUsed: number;
  attemptsRemaining: number | null;
  maxInputBytesPerAttempt: number | null;
  largestInputBytes: number;
  knownInputTokens: number;
  knownOutputTokens: number;
  unknownUsageAttempts: number;
  possiblyBilledAttempts: number;
  /** `attemptsUsed` on the HTTP channel; `null` on the process channel. */
  httpAttemptsObserved: number | null;
  /** Records with `launched: true`. Zero on the HTTP channel, which launches nothing. */
  launchesStarted: number;
}

/** A budget value that cannot be counted with: not a finite positive safe integer. Refused at construction, before anything is sent. */
export class InvalidBudgetError extends Error {
  constructor(readonly field: keyof RunBudget, readonly value: unknown) {
    super(`the run budget's ${field} is ${String(value)}, which is not a finite positive safe integer; nothing is sent under a budget that cannot be counted exactly`);
    this.name = 'InvalidBudgetError';
  }
}

/**
 * Both budget values, after whatever conversion produced them, must be
 * finite positive safe integers: an overflowed or rounded figure would let
 * the runner count attempts or bytes against a bound that is not the one
 * stated. Applied to every budget the runner is given, however it was made.
 */
export function assertRunBudget(budget: RunBudget): void {
  for (const field of ['maxRunAttempts', 'maxInputBytesPerAttempt'] as const) {
    const value: unknown = budget[field];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new InvalidBudgetError(field, value);
  }
}

/**
 * The observer refused an attempt record. Its own classification, distinct
 * from anything the provider or the projection did: the HTTP attempt it
 * describes was booked exactly once before the observer was called, and the
 * runner sends nothing further, because an execution whose account cannot be
 * written must not go on spending.
 */
export class ObservationFailedError extends Error {
  constructor(readonly role: string, detail: string) {
    super(`${role}: the attempt observer failed (${detail}); the attempt was booked once and nothing further is sent`);
    this.name = 'ObservationFailedError';
  }
}

/** The caller's signal cancelled the execution: in flight, during a scheduled wait, or before a send. */
export class ExecutionCancelledError extends Error {
  constructor(readonly role: string, readonly attempt: number, readonly during: 'send' | 'wait' | 'before_send') {
    super(
      during === 'send'
        ? `${role}: the execution was cancelled while attempt ${attempt} was in flight; the request may already have been processed and billed, and nothing further is sent`
        : `${role}: the execution was cancelled ${during === 'wait' ? 'during a scheduled wait' : 'before attempt ' + attempt + ' was sent'}; nothing further is sent`,
    );
    this.name = 'ExecutionCancelledError';
  }
}

/** The request body is larger than the admitted size. Refused before the send, so nothing is spent. */
export class InputAdmissionError extends Error {
  constructor(readonly role: string, readonly bytes: number, readonly maxBytes: number) {
    super(`${role}: the request body is ${bytes} bytes, more than the ${maxBytes} bytes admitted per attempt; not sent`);
    this.name = 'InputAdmissionError';
  }
}

/** Every HTTP attempt the run was allowed has been made. Refused before the send, so nothing more is spent. */
export class AttemptBudgetExhaustedError extends Error {
  constructor(readonly role: string, readonly used: number, readonly max: number) {
    super(`${role}: the run's attempt budget is exhausted (${used} of ${max} HTTP attempts used, each possibly billed); not sent`);
    this.name = 'AttemptBudgetExhaustedError';
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
  /** Defaults to `fetchTransport`. Tests inject a fake. */
  transport?: ProviderTransport;
  timeoutMs?: number;
  /** Total attempts per role invocation, first included. */
  maxAttempts?: number;
  backoffMs?: number;
  /** Injected so a retry test does not wait. The default honours `signal`, ending a wait at once when it fires. */
  sleep?: (ms: number, signal: AbortSignal | undefined) => Promise<void>;
  /** Enforced before each send. Absent means no admission limit and no run-wide attempt budget. Validated at construction. */
  budget?: RunBudget;
  /** Receives every attempt record, before any error about that attempt is thrown. A throwing observer halts the runner. */
  observe?: AttemptObserver;
  /** The caller's lifetime: when it fires, the in-flight attempt is aborted, any wait ends, and nothing further is sent. */
  signal?: AbortSignal;
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

/** The production wait, ended early by the caller's signal; tests inject a recording sleep instead. */
const defaultSleep = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

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

/**
 * The process facts an error carries, if it carries any. Duck-typed rather
 * than `instanceof`, deliberately: a transport may subclass `TransportFailure`
 * or throw a class of its own, and what the record needs is not the class but
 * whether a child started — the one fact that decides whether the attempt may
 * have been billed. An object with a boolean `started` is taken at its word.
 */
function processFactsOf(error: unknown): ProcessFacts | null {
  if (typeof error !== 'object' || error === null) return null;
  const facts = (error as { process?: unknown }).process;
  if (typeof facts !== 'object' || facts === null) return null;
  return typeof (facts as { started?: unknown }).started === 'boolean' ? (facts as ProcessFacts) : null;
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
  #largestInputBytes = 0;
  #knownInputTokens = 0;
  #knownOutputTokens = 0;
  #unknownUsageAttempts = 0;
  #possiblyBilledAttempts = 0;
  #launchesStarted = 0;
  /** Set once the observer, or a transport's own evidence observation, has failed: every later invocation refuses with it, unsent and unrecorded. */
  #halted: ObservationFailedError | EvidenceObservationFailedError | null = null;
  /** Fixed here from the adapter's declaration, and never revised by anything a transport returns. */
  readonly #channel: 'http' | 'process';

  constructor(private readonly options: LiveRunnerOptions) {
    if (options.budget !== undefined) assertRunBudget(options.budget);
    // A runner with no adapter refuses at `run()` before any record exists,
    // so the default here is never stamped on a record it does not describe.
    this.#channel = options.adapter?.channel ?? 'http';
  }

  get adapter(): ProviderAdapterIdentity | undefined {
    return this.options.adapter?.identity;
  }

  /** The invocation the adapter declares, read from it and never restated: what orchestration compares with the configured one. */
  get invocation(): InvocationIdentity | undefined {
    return this.options.adapter?.invocation;
  }

  get attempts(): number {
    return this.#attempts;
  }

  get maxAttempts(): number {
    return Math.max(1, this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  }

  get ledger(): BudgetLedger {
    const budget = this.options.budget;
    return {
      attemptUnit: this.#channel === 'http' ? 'http_attempt' : 'cli_launch',
      maxRunAttempts: budget?.maxRunAttempts ?? null,
      attemptsUsed: this.#attempts,
      attemptsRemaining: budget === undefined ? null : Math.max(0, budget.maxRunAttempts - this.#attempts),
      maxInputBytesPerAttempt: budget?.maxInputBytesPerAttempt ?? null,
      largestInputBytes: this.#largestInputBytes,
      knownInputTokens: this.#knownInputTokens,
      knownOutputTokens: this.#knownOutputTokens,
      unknownUsageAttempts: this.#unknownUsageAttempts,
      possiblyBilledAttempts: this.#possiblyBilledAttempts,
      // The CLI makes the HTTP requests on the process channel and this file
      // sees none of them: unknown, never zero.
      httpAttemptsObserved: this.#channel === 'http' ? this.#attempts : null,
      launchesStarted: this.#launchesStarted,
    };
  }

  /**
   * Books the record into the ledger exactly once, then hands it to the
   * observer. Called before the matching throw, always, and never from inside
   * a block that would reclassify what it throws: an observer that fails is
   * an observation failure, booked already, and it halts the runner.
   */
  #emit(record: AttemptRecord): void {
    if (record.sent) {
      if (record.usage === null) this.#unknownUsageAttempts += 1;
      else {
        this.#knownInputTokens += record.usage.inputTokens;
        this.#knownOutputTokens += record.usage.outputTokens;
      }
      if (record.possiblyBilled) this.#possiblyBilledAttempts += 1;
    }
    if (record.launched === true) this.#launchesStarted += 1;
    if (this.options.observe === undefined) return;
    try {
      this.options.observe(record);
    } catch (error) {
      const detail = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error), this.options.apiKey);
      this.#halted = new ObservationFailedError(`${record.role}[${record.index}]`, detail);
      throw this.#halted;
    }
  }

  async run(request: RoleRequest): Promise<RoleResponse> {
    // Both gates before the request, and in this order: permission to spend,
    // then the ability to speak the protocol at all. Checking after the call
    // would mean paying for an answer that could not be read.
    assertLiveAgentsEnabled();
    const adapter = requireProviderAdapter(this.options);
    // A halted runner refuses without recording: the observer is what failed.
    if (this.#halted !== null) throw this.#halted;
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
    const budget = this.options.budget;
    const signal = this.options.signal;
    const role = `${request.role}[${request.index}]`;
    const bodyBytes = Buffer.byteLength(spec.body, 'utf8');

    // The channel is on every record from here, sent or not: a refusal before
    // the send is still a refusal on this channel.
    const record = (
      attempt: number,
      fields: Pick<AttemptRecord, 'sent' | 'status' | 'requestId' | 'usage' | 'outcome' | 'detail' | 'possiblyBilled' | 'delayMs'> & Partial<Pick<AttemptRecord, 'launched' | 'process' | 'usageSource'>>,
    ): AttemptRecord => ({
      role: request.role,
      index: request.index,
      attempt,
      runAttempt: this.#attempts,
      channel: this.#channel,
      ...fields,
    });
    const unsent = (attempt: number, outcome: 'not_sent' | 'cancelled', detail: string): AttemptRecord =>
      record(attempt, { sent: false, status: null, requestId: null, usage: null, outcome, detail, possiblyBilled: false, delayMs: null });

    for (let attempt = 1; ; attempt += 1) {
      // Cancellation, admission and budget, before the send and before the
      // counter moves: a refused attempt is not an attempt, and nothing about
      // it can be billed.
      if (signal?.aborted) {
        // The reason is the caller's text, and the observer must never see the credential in it.
        this.#emit(unsent(attempt, 'cancelled', `cancelled before send (${redact(String(signal.reason), secret)})`));
        throw new ExecutionCancelledError(role, attempt, attempt === 1 ? 'before_send' : 'wait');
      }
      if (budget !== undefined && bodyBytes > budget.maxInputBytesPerAttempt) {
        this.#emit(unsent(attempt, 'not_sent', `request body ${bodyBytes} bytes exceeds the admitted ${budget.maxInputBytesPerAttempt}`));
        throw new InputAdmissionError(role, bodyBytes, budget.maxInputBytesPerAttempt);
      }
      if (budget !== undefined && this.#attempts >= budget.maxRunAttempts) {
        this.#emit(unsent(attempt, 'not_sent', `attempt budget exhausted: ${this.#attempts} of ${budget.maxRunAttempts} used`));
        throw new AttemptBudgetExhaustedError(role, this.#attempts, budget.maxRunAttempts);
      }
      this.#attempts += 1;
      this.#largestInputBytes = Math.max(this.#largestInputBytes, bodyBytes);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
      const cancel = (): void => controller.abort('cancelled');
      signal?.addEventListener('abort', cancel, { once: true });
      let response: ProviderHttpResponse;
      try {
        response = await transport(spec, controller.signal);
      } catch (error) {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        // The credential is redacted from every message the transport
        // produced before anything is decided about it: this is the boundary
        // that knows the key, and the text is untrusted.
        const detail = redact(error instanceof Error ? `${error.name}: ${error.message}` : String(error), secret);
        // Facts about a child travel on the error, whatever its class. When
        // there are any, `possiblyBilled` follows `launched` — a child that
        // started may have reached the provider, one that never started cannot
        // have — and the HTTP rule below is the fallback, not the override.
        const facts = processFactsOf(error);
        const observed = facts === null ? {} : { launched: facts.started, process: facts };
        const possiblyBilled = (httpRule: boolean): boolean => (facts === null ? httpRule : facts.started);
        if (error instanceof EvidenceObservationFailedError) {
          // The transport's account of the attempt failed, not the attempt.
          // Booked once under its own outcome, then the runner halts as it does
          // for an observer failure, and the error keeps its identity: wrapping
          // it as ambiguous would tell the harness the provider is in doubt
          // when it is the harness's own evidence that is.
          redactError(error, secret);
          this.#emit(record(attempt, { sent: true, status: null, requestId: null, usage: null, outcome: 'observation_failed', detail, possiblyBilled: possiblyBilled(true), delayMs: null, ...observed }));
          this.#halted = error;
          throw error;
        }
        if (controller.signal.aborted) {
          if (controller.signal.reason === 'cancelled') {
            this.#emit(record(attempt, { sent: true, status: null, requestId: null, usage: null, outcome: 'cancelled', detail: `cancelled in flight (${redact(String(signal?.reason), secret)})`, possiblyBilled: possiblyBilled(true), delayMs: null, ...observed }));
            throw new ExecutionCancelledError(role, attempt, 'send');
          }
          this.#emit(record(attempt, { sent: true, status: null, requestId: null, usage: null, outcome: 'timeout', detail: `aborted after ${timeoutMs} ms`, possiblyBilled: possiblyBilled(true), delayMs: null, ...observed }));
          throw new ProviderTimeoutError(role, timeoutMs);
        }
        // Vouched pre-submission: nothing was processed, so it may be retried.
        // Facts that say a child started contradict the vouching, and the
        // contradiction is resolved the expensive way: not retried.
        if (error instanceof TransportFailure && error.phase === 'before_send' && facts?.started !== true) {
          if (attempt >= maxAttempts) {
            this.#emit(record(attempt, { sent: true, status: null, requestId: null, usage: null, outcome: 'refused', detail, possiblyBilled: false, delayMs: null, ...observed }));
            throw new ProviderHttpError(role, 0, `connection failure (${detail})`, null, attempt);
          }
          const delayMs = Math.min(backoffMs * 2 ** (attempt - 1), MAX_RETRY_AFTER_MS);
          this.#emit(record(attempt, { sent: true, status: null, requestId: null, usage: null, outcome: 'retry_scheduled', detail, possiblyBilled: false, delayMs, ...observed }));
          await sleep(delayMs, signal);
          continue;
        }
        // Anything else — a TypeError from fetch, a failure of unknown phase,
        // a defect in this code — is not retried. The suite's offline guard
        // arrives here too, and its message survives the redaction.
        this.#emit(record(attempt, { sent: true, status: null, requestId: null, usage: null, outcome: 'ambiguous', detail, possiblyBilled: possiblyBilled(true), delayMs: null, ...observed }));
        throw new ProviderAmbiguousFailureError(role, detail, attempt);
      }
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);

      // A response carrying process facts is an answer from a child, and
      // goes to projection unconditionally: its `status` is a placeholder, and
      // retry-by-status, `retry-after` and error diagnosis are HTTP facts
      // about a wire this file never saw.
      if (response.process !== undefined || (response.status >= 200 && response.status < 300)) {
        // The envelope goes to the adapter; the role sees only the model's
        // content. A completed answer the adapter refuses — truncated, refused,
        // malformed — is not retried: the request succeeded and the content is
        // unusable, and asking again would be a different run's answer. The
        // refusal's text came from the provider and is redacted like any other,
        // from every property the error exposes, not only its message.
        //
        // Projection and observation are kept apart on purpose: the
        // projection's outcome is decided first, in its own try, and the one
        // record for this attempt is emitted after it, outside any catch — so
        // an observer that fails is reported as exactly that, and never as a
        // refusal the adapter did not make.
        const facts = response.process;
        const usage = adapter.readUsage?.(response.body) ?? null;
        const requestId = response.headers['request-id'] === undefined ? null : redact(response.headers['request-id'], secret);
        // HTTP: unknown usage is the one reason to suspect a bill for a
        // completed request. Process: a started child is the reason, whatever
        // the CLI reported, and no HTTP status was observed to record.
        const possiblyBilled = facts === undefined ? usage === null : facts.started;
        const status = facts === undefined ? response.status : null;
        const observed = facts === undefined ? {} : { launched: facts.started, process: facts, ...(usage === null ? {} : { usageSource: 'cli_report' as const }) };
        let outputJson: string | null = null;
        let refusal: Error | null = null;
        try {
          outputJson = adapter.projectResponse(response.body, request);
        } catch (error) {
          redactError(error, secret);
          refusal = error instanceof Error ? error : new Error(redact(String(error), secret));
        }
        if (refusal === null) {
          this.#emit(record(attempt, { sent: true, status, requestId, usage, outcome: 'completed', detail: null, possiblyBilled, delayMs: null, ...observed }));
          return { outputJson: outputJson! };
        }
        this.#emit(record(attempt, { sent: true, status, requestId, usage, outcome: 'projection_refused', detail: `${refusal.name}: ${refusal.message}`, possiblyBilled, delayMs: null, ...observed }));
        throw refusal;
      }
      const { errorType, errorCode, requestId } = diagnose(response, secret);
      const named = errorCode === null ? errorType : `${errorType ?? 'error'} ${errorCode}`;
      const refused = (reason: string | null, thrown: Error): never => {
        this.#emit(record(attempt, { sent: true, status: response.status, requestId, usage: null, outcome: 'refused', detail: reason, possiblyBilled: true, delayMs: null }));
        throw thrown;
      };
      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= maxAttempts) {
        refused(named, new ProviderHttpError(role, response.status, named, requestId, attempt));
      }
      const askedMs = retryAfterMs(response);
      // A 429 without the header is the spend-cap form, or an acceleration
      // limit: the reference says retrying fails until access resumes.
      if (response.status === 429 && askedMs === null) {
        const reason = `${named ?? 'rate_limit_error'} with no retry-after: retrying fails until access resumes`;
        refused(reason, new ProviderHttpError(role, response.status, reason, requestId, attempt));
      }
      if (askedMs !== null && askedMs > MAX_RETRY_AFTER_MS) {
        const reason = `${named ?? 'transient'} with retry-after ${askedMs / 1000} s, more than the permitted wait of ${MAX_RETRY_AFTER_MS / 1000} s; not retried early, because an earlier retry would fail`;
        refused(reason, new ProviderHttpError(role, response.status, reason, requestId, attempt));
      }
      const delayMs = askedMs ?? Math.min(backoffMs * 2 ** (attempt - 1), MAX_RETRY_AFTER_MS);
      this.#emit(record(attempt, { sent: true, status: response.status, requestId, usage: null, outcome: 'retry_scheduled', detail: named, possiblyBilled: true, delayMs }));
      await sleep(delayMs, signal);
    }
  }
}

export function createLiveAgentRunner(options: LiveRunnerOptions): AgentRunner {
  assertLiveAgentsEnabled();
  requireProviderAdapter(options);
  return new LiveAgentRunner(options);
}
