/**
 * The capture path: one live execution, with everything it produced kept
 * together, outside every fixture root.
 *
 * **Nothing in the default suite executes this against a provider.** The
 * agents suite reaches it, and even there it is inert without the capability
 * token, the endpoint, the credential and a stated budget. What the default
 * suite proves about it, offline and under the network guard, is in
 * `live-capture.test.ts`: the S-002 route completes through the accepted
 * adapter over an injected transport, a failed execution keeps its
 * diagnostics and writes no transcript, and nothing overwrites.
 *
 * # Why executions, not runs, are what gets filed
 *
 * A recording under `test/verification-transcripts/` is filed by `runId`,
 * which is derived from the run's inputs and is therefore the same for every
 * genuine execution of one question under one pipeline identity. That is the
 * right property for replay — a recording answers to the question it was made
 * from — and the wrong one for evidence of what happened when: two genuine
 * executions of S-002 would name one file, and the second would overwrite the
 * first. The identity semantics are not changed to get unique names. Instead
 * each execution gets its own directory under `LIVE_EXECUTION_ROOT`, named by
 * an execution id that is not an identity of anything, and inside it the
 * transcript is still filed by `runId`, the dossier under its own
 * `verification/` root, and the per-attempt diagnostics beside both:
 *
 * ```text
 * <executionRoot>/<packId>/<requirementId>/<executionId>/
 *   execution.json                  status, ids, adapter, ledger, error, timestamps
 *   attempts.jsonl                  one AttemptRecord per attempt, in order
 *   launches.jsonl                  subscription route: one line per child launched, gate included
 *   streams/                        subscription route: each launch's stdout, sanitised
 *   transcript/<packId>/<requirementId>/<runId>.json   only if the run completed
 *   verification/<packId>/<requirementId>/verification-result.json   the dossier
 * ```
 *
 * An execution root inside the fixture root — or containing it — is refused
 * before anything is written, and an execution id that already exists is
 * refused rather than reused. Promoting a genuine transcript into the fixture
 * tree remains a human act on a reviewed file. The fixture root the guard
 * compares against defaults to the real one and is injectable, so the guard
 * can be exercised — and mutated — against a disposable tree.
 *
 * # Two routes
 *
 * `route: 'http'` (everything the paragraphs above describe) reaches a provider
 * through `anthropic-messages@1` over an injected or real `fetch`.
 * `route: 'subscription'` (B-CLI-ADAPTER) reaches Claude through the pinned
 * Claude Code CLI on a Max subscription, over `claude-code-cli@1` and the
 * process transport, and it is the **only** place in the repository that
 * constructs a runner over that adapter — `verify run` refuses the identity
 * by name (`SubscriptionRouteCaptureOnlyError`). **The environment selects
 * the route**: `DATASTRATA_SUBSCRIPTION_CAPTURE=1` and nothing else selects
 * the subscription route, its absence the HTTP route, and a request whose
 * stated route, adapter, transport or variables belong to the other one is
 * refused by name (`CaptureRouteConflictError`) before anything is created —
 * there is no default that could quietly send a subscription request to the
 * HTTP path or the reverse. What differs on the subscription route:
 *
 * - **Configuration.** The token and the two budget variables are required;
 *   the endpoint and the credential are *refused* if present, and so is any
 *   `ANTHROPIC_*`, `CLAUDE_CODE_USE_*`, `CLAUDE_CODE_SIMPLE` or
 *   `CLAUDE_CODE_SAFE_MODE` variable — each would make the CLI authenticate
 *   or behave other than the accepted probe did. The refusal names variables,
 *   never values. The environment is the one this function is *handed*;
 *   `process.env` is never read here.
 * - **An execution-scoped gate.** Before any role is dispatched the
 *   transport runs `auth status --json` under the same pin and environment;
 *   the verdict (labels and process facts, never the account's email or
 *   organisation identifiers) is filed as `execution.json.gate`, and a
 *   refusal ends the execution with nothing dispatched.
 * - **Every child is evidence.** The transport hands each launch's record and
 *   stdout to `onLaunch`, which appends one line to `launches.jsonl` and
 *   writes the stdout, sanitised, under `streams/`. A record that cannot be
 *   written is an `EvidenceObservationFailedError` and halts the run.
 * - **The first failure ends the run.** A rejected role aborts the
 *   execution's lifetime at once (`role_failed:<role>[<index>]`), so nothing
 *   later is sent and any child still running is ended.
 * - **Interrupts are handled, and recorded.** The first `SIGINT`/`SIGTERM`
 *   aborts the lifetime (`operator:<signal>`); a second escalates termination
 *   through the transport. Listeners go on an injectable emitter, `process`
 *   by default, and come off in `finally`.
 * - **Drain before the final status.** The final `execution.json` is written
 *   only after `transport.drain()` has waited, bounded, for every tracked
 *   child; `terminationUnconfirmed` says whether any launch record — gate or
 *   role — shows a child the transport could not confirm reaped, a group it
 *   could not confirm gone, or pipes still held when the launch was given
 *   up on (`streamsClosed: false`). **An unconfirmed cleanup never publishes
 *   a run.** The transport refuses such a launch where it happens: a gate
 *   blocks with `streams_not_closed` and no role starts; a role launch
 *   throws naming `streams_not_closed` (as a leftover throws naming
 *   `leftover_processes_terminated`), the runner books it as possibly
 *   billed, nothing projects its output, and the role wrapper below aborts
 *   the lifetime so nothing later launches. Acting on the record only after
 *   the run let a gate with unclosed pipes pass and let a role with unclosed
 *   pipes be taken for an answer while later roles launched. The post-drain
 *   rule (`unconfirmedLaunches`) stays as the backstop: a run that somehow
 *   completed with an unconfirmed launch is filed as failed under
 *   `TerminationUnconfirmed`, no transcript is written, a result the pipeline
 *   already wrote is deleted and `resultWithheld` says so, and every observed
 *   fact stays in `launches.jsonl` and `execution.json`.
 * - **The command is composed here.** `runRun` (`src/cli/run.ts`) fixes
 *   `DEFAULT_ROLE_CONFIG`, whose `providerAdapter` is the HTTP identity, and
 *   orchestration refuses a live runner whose adapter differs from the
 *   configured one — correctly, because the identity is a `pipelineVersion`
 *   input and the subscription route *is* a different pipeline (D-1). Nothing
 *   under `src/` is changed for this: the subscription path composes the same
 *   production functions `runRun` composes (`readWorld`,
 *   `EntitledClosure.forSources`, `loadPromptSet`, `runVerificationPipeline`,
 *   `writeVerificationResult`) with `SUBSCRIPTION_ROLE_CONFIG`, which differs
 *   from the default in that one field.
 *
 * # What the sanitised streams keep, and what they never keep
 *
 * Each stdout line that parses as a JSON object is written back with
 * `session_id`, `uuid`, `cwd`, `email`, `orgId` and `orgName` replaced
 * wherever they occur as keys, and every other string that matches an email
 * pattern or contains the inherited `HOME` or `USER` value replaced by
 * `[REDACTED]`. The model's own output — `event.delta`, `event.content_block`,
 * `message.content`, `result` and `structured_output` — is never modified,
 * because a modified model output would be a different answer from the one
 * the transcript records. If such a subtree contains a sensitive pattern the
 * stream is withheld, the launch line says why by path and kind
 * (`streamOmitted`), and the execution **fails closed** under
 * `SensitiveOutputWithheldError`: an answer that cannot be filed is not
 * handed to the role, so it reaches neither the transcript nor the result,
 * and the payload appears nowhere under the execution directory. The same
 * rule holds for the partial stdout of a launch ended by an abort.
 * A line that is not a JSON object is written as `{"unparsed": true, "bytes": N}`.
 *
 * # Lifetime
 *
 * An execution has a deadline. `runFirstLiveCase` derives it from the stated
 * budget: every permitted attempt at its full local timeout plus the longest
 * permitted wait, and a minute besides (`executionLifetimeMs`). When it fires,
 * the runner aborts the attempt in flight, ends any wait, and refuses every
 * later send; the execution is filed as failed with `cancelled: true`. A test
 * runner's own timeout is therefore never what stops provider work — the
 * harness is, with its account written.
 *
 * # Counts that must agree
 *
 * `execution.json` carries `attemptUnit`, naming what the ledger counted. On
 * the HTTP route `httpAttempts` is the runner's own `ledger.attemptsUsed` —
 * sends, retries included. On the subscription route `httpAttempts` is
 * `null`: the CLI makes the HTTP requests and this harness sees none of them;
 * `launches` is `ledger.launchesStarted`, children that existed, and
 * `gateLaunches` counts the gate's own. Separately, `unsentEvents` are the
 * admission, budget and cancellation refusals that sent nothing, and
 * `recordsWritten` their sum with the sent attempts as lines of
 * `attempts.jsonl`.
 *
 * # What a failed execution leaves
 *
 * `attempts.jsonl` and `execution.json` with `status: "failed"` and the error's
 * name and redacted message. No `transcript/` directory: orchestration hands
 * over a transcript only when the run completes, and this file writes nothing
 * shaped like a recording for a run that did not. Incomplete evidence is kept
 * as diagnostics, never presented as a completed transcript.
 *
 * # Gates, and a credential is none of them
 *
 * ```text
 * DATASTRATA_VERIFICATION_AGENTS=1   the capability token — an act, not a state
 * DATASTRATA_AGENT_ENDPOINT          http: the endpoint, named explicitly; subscription: refused
 * DATASTRATA_AGENT_API_KEY           http: the credential; subscription: refused
 * DATASTRATA_AGENT_MAX_ATTEMPTS      the run's attempt (http) or launch (subscription) budget
 * DATASTRATA_AGENT_MAX_INPUT_BYTES   the largest request body admitted per attempt
 * adapter                            the named provider protocol itself
 * ```
 *
 * All are required and none implies another. `liveCaptureConfigFrom`,
 * `subscriptionCaptureConfigFrom` and `assertLiveAgentsEnabled` read the env
 * this function is *handed*; `createLiveAgentRunner` and `LiveAgentRunner.run`
 * read the ambient `process.env`, so the composition is fail-closed in both
 * directions.
 *
 * # What is kept, and what it is worth
 *
 * The transcript is the one orchestration built. `outputJson` is the runner's
 * response text, stored verbatim, so replay hands the same bytes to the same
 * seam. `attempts.jsonl` is the runner's own account of every attempt:
 * status, request id, the usage the envelope or the CLI reported or `null`
 * for unknown, and the outcome — the figures a bill is reconciled against.
 * The credential, where there is one, is redacted by the runner and, as a
 * second layer, by this file before any summary is written.
 */

import { appendFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { join, resolve, sep } from 'node:path';

import { EXIT_INTEGRITY_FAILURE, EXIT_OK, EXIT_REFUSED, type CliOutcome } from '../src/cli/exit-codes';
import { liveBudgetFrom, LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV } from '../src/cli/live-wiring';
import { ANTHROPIC_MESSAGES_ADAPTER } from '../src/pipeline/anthropic-messages';
import { outcomeFor, readRegistryOrFail, readWorld, resultPath, type CurrentWorld, type VerifyPaths } from '../src/cli/sign';
import { dispatch } from '../src/cli/verify';
import { CLAUDE_CODE_CLI_ADAPTER, CLAUDE_CODE_CLI_IDENTITY, CLI_LAUNCH_URL, LAUNCH_CONTROL_ENV, PINNED_CLI, resolvePinnedCliPath } from '../src/pipeline/claude-code-cli';
import {
  createSpawnTransport,
  type ExecutablePin,
  type GateResult,
  type InheritedEnv,
  type LaunchFunction,
  type LaunchRecord,
} from '../src/pipeline/claude-code-cli-transport';
import { DEFAULT_ROLE_CONFIG, type RoleConfig } from '../src/pipeline/config';
import { EntitledClosure } from '../src/pipeline/entitlement';
import {
  assertLiveAgentsEnabled,
  createLiveAgentRunner,
  DEFAULT_TIMEOUT_MS,
  EvidenceObservationFailedError,
  liveAgentsEnabled,
  MAX_RETRY_AFTER_MS,
  requireProviderAdapter,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  type AttemptRecord,
  type BudgetLedger,
  type LiveAgentRunner,
  type ProcessFacts,
  type ProviderTransport,
  type RunBudget,
} from '../src/pipeline/live-runner';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import { loadPromptSet } from '../src/pipeline/prompts';
import type { ProviderAdapter } from '../src/pipeline/provider-adapter';
import { RoleOutputError } from '../src/pipeline/roles';
import type { AgentRunner } from '../src/pipeline/runner';
import { TRANSCRIPT_ROOT, writeRunTranscript, type RunTranscript } from '../src/pipeline/transcript';
import { writeVerificationResult } from '../src/pipeline/write-result';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { engineRoot } from './replay-fixtures';

export { LIVE_ENDPOINT_ENV, LIVE_API_KEY_ENV };

/** Where genuine executions are filed, relative to the engine root. Under `test/` so no artifact ever carries one; never the fixture root. */
export const LIVE_EXECUTION_ROOT = join('test', 'live-executions');

/** The first live case: the recommended requirement, declared once. */
export const FIRST_LIVE_CASE = { packId: 'csrd', requirementId: 'CSRD-S-002' } as const;

/** The fixture tree replay reads, which no execution may be filed inside or around. Injectable for tests; this is production's value. */
export const DEFAULT_FIXTURE_ROOT = resolve(engineRoot, TRANSCRIPT_ROOT);

/**
 * The longest an execution under a budget may take: every permitted attempt
 * at the full local timeout plus the longest permitted wait, and a minute of
 * margin. An enforced bound on wall time, derived from enforced bounds; not a
 * latency estimate.
 */
export function executionLifetimeMs(budget: RunBudget): number {
  return budget.maxRunAttempts * (DEFAULT_TIMEOUT_MS + MAX_RETRY_AFTER_MS) + 60_000;
}

/**
 * The largest delay a timer honours: 2^31 - 1 ms, about 24.8 days. Node's
 * `setTimeout` does not refuse a larger value; it fires after one millisecond
 * and warns, which would turn an accepted attempt budget into an execution
 * cancelled at once, its account saying "deadline". The lifetime is therefore
 * checked against this range before anything is created, and the outer test
 * timeout — the lifetime plus `LIFETIME_MARGIN_MS` — must fit it too.
 */
export const MAX_TIMER_MS = 2 ** 31 - 1;
/** What the agents test adds above the harness deadline for its own timeout. */
export const LIFETIME_MARGIN_MS = 60_000;
/** The largest deadline the harness accepts: leaves room for the outer margin inside the timer range. */
export const MAX_EXECUTION_LIFETIME_MS = MAX_TIMER_MS - LIFETIME_MARGIN_MS;

/** A deadline the timers cannot honour as stated. Refused by name, before any execution file exists. */
export class UnsupportedLifetimeError extends Error {
  constructor(readonly deadlineMs: unknown) {
    super(`refusing an execution lifetime of ${String(deadlineMs)} ms: a deadline must be a positive integer of at most ${MAX_EXECUTION_LIFETIME_MS} ms, so that it and the outer margin of ${LIFETIME_MARGIN_MS} ms fit the timer range of ${MAX_TIMER_MS} ms; a larger value would fire after one millisecond, not never`);
    this.name = 'UnsupportedLifetimeError';
  }
}

/** The complete check, applied to a derived lifetime and to an explicit override alike. */
export function assertSupportedLifetime(deadlineMs: number): void {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > MAX_EXECUTION_LIFETIME_MS) throw new UnsupportedLifetimeError(deadlineMs);
}

/**
 * A live capture was asked for without everything it explicitly requires.
 *
 * An exported `LIVE_CAPTURE_GATES` constant stood here briefly and was removed:
 * nothing but this message consumed it, so its *contents* had no unique kill —
 * a mutation dropping an entry reddened nothing, because the only test that read
 * it iterated the very list under test. What makes each gate load-bearing is
 * that removing its *enforcement* reds a case.
 */
export class LiveCaptureConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `a live capture requires ${LIVE_AGENTS_ENV}, ${LIVE_ENDPOINT_ENV}, ${LIVE_API_KEY_ENV}, ${LIVE_MAX_ATTEMPTS_ENV}, ${LIVE_MAX_INPUT_BYTES_ENV} and a provider adapter, and is missing [${missing.join(', ')}]. A credential on its own is not permission to spend: ${LIVE_AGENTS_ENV}=${LIVE_AGENTS_TOKEN} is a separate, deliberate act, the endpoint is named rather than defaulted so that no host is contacted unless somebody typed it, the budget is stated rather than defaulted, and the adapter is the provider protocol without which no request can be built and no answer read.`,
    );
    this.name = 'LiveCaptureConfigError';
  }
}

/** The execution root would put genuine executions inside, or around, the fixture tree replay reads. */
export class ExecutionRootError extends Error {
  constructor(readonly executionRoot: string, readonly fixtureRoot: string) {
    super(`refusing execution root ${executionRoot}: it lies inside, or contains, the replay fixture root ${fixtureRoot}, where recordings are filed by run identity and a genuine execution would overwrite or be mistaken for one`);
    this.name = 'ExecutionRootError';
  }
}

/** An execution directory with this id already exists. Nothing in it is touched. */
export class ExecutionExistsError extends Error {
  constructor(readonly executionDir: string) {
    super(`refusing to reuse execution directory ${executionDir}: an execution is filed once, and a second under the same id would overwrite evidence of the first`);
    this.name = 'ExecutionExistsError';
  }
}

export interface LiveCaptureConfig {
  endpoint: string;
  apiKey: string;
  budget: RunBudget;
}

/**
 * The environment gates, or a named refusal listing exactly which are absent.
 * The budget's *values* are then parsed by the production wiring, which
 * refuses a non-integer by name.
 */
export function liveCaptureConfigFrom(env: NodeJS.ProcessEnv): LiveCaptureConfig {
  const missing: string[] = [];
  if (!liveAgentsEnabled(env)) missing.push(LIVE_AGENTS_ENV);
  for (const name of [LIVE_ENDPOINT_ENV, LIVE_API_KEY_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV]) {
    const value = env[name];
    if (value === undefined || value === '') missing.push(name);
  }
  if (missing.length > 0) throw new LiveCaptureConfigError(missing);
  return { endpoint: env[LIVE_ENDPOINT_ENV]!, apiKey: env[LIVE_API_KEY_ENV]!, budget: liveBudgetFrom(env) };
}

// ---------------------------------------------------------------------------
// The subscription route's configuration
// ---------------------------------------------------------------------------

export type CaptureRoute = 'http' | 'subscription';

/** The route selector: present with exactly this value, the capture takes the subscription route; absent, the HTTP route. */
export const SUBSCRIPTION_CAPTURE_ENV = 'DATASTRATA_SUBSCRIPTION_CAPTURE';
export const SUBSCRIPTION_CAPTURE_TOKEN = '1';

/** `true` only for the exact value, as for the capability token. */
export function subscriptionCaptureSelected(env: NodeJS.ProcessEnv): boolean {
  return env[SUBSCRIPTION_CAPTURE_ENV] === SUBSCRIPTION_CAPTURE_TOKEN;
}

/** The route the environment selects. This is the only place a route is defaulted. */
export function captureRouteFor(env: NodeJS.ProcessEnv): CaptureRoute {
  return subscriptionCaptureSelected(env) ? 'subscription' : 'http';
}

/**
 * The request and the environment disagree about which route this is: a
 * stated route the selector contradicts, or an adapter, a transport or a
 * variable that belongs to the other route. Refused by name before anything
 * is constructed or written, because a capture that takes the wrong route
 * spends against the wrong account.
 */
export class CaptureRouteConflictError extends Error {
  constructor(detail: string) {
    super(`the HTTP and subscription routes exclude each other, and this request straddles them: ${detail}. ${SUBSCRIPTION_CAPTURE_ENV}=${SUBSCRIPTION_CAPTURE_TOKEN} selects the subscription route and nothing else does; without it the HTTP route is taken, and a request carrying the other route's adapter, transport or variables is refused rather than routed`);
    this.name = 'CaptureRouteConflictError';
  }
}

/** Variables whose presence, by exact name, refuses the subscription route. */
export const SUBSCRIPTION_FORBIDDEN_ENV_NAMES: readonly string[] = [LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, 'CLAUDE_CODE_SIMPLE', 'CLAUDE_CODE_SAFE_MODE'];
/** Prefixes any of whose variables refuses the subscription route. */
export const SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES: readonly string[] = ['ANTHROPIC_', 'CLAUDE_CODE_USE_'];
/** The three variables the child inherits on the subscription route, read from the handed environment unless injected. */
export const SUBSCRIPTION_INHERITED_ENV_NAMES: readonly (keyof InheritedEnv)[] = ['HOME', 'USER', 'PATH'];

/** Every forbidden variable the environment carries, by name, sorted. Presence is the key being set at all, empty or not. */
export function subscriptionForbiddenEnvNames(env: NodeJS.ProcessEnv): string[] {
  const names: string[] = [];
  for (const name of Object.keys(env)) {
    if (env[name] === undefined) continue;
    if (SUBSCRIPTION_FORBIDDEN_ENV_NAMES.includes(name) || SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) names.push(name);
  }
  return names.sort();
}

/**
 * The environment carries a variable the subscription route refuses. Names
 * only: a value here could be a credential, and the point of the refusal is
 * that no credential reaches this route.
 */
export class SubscriptionEnvironmentError extends Error {
  constructor(readonly names: readonly string[]) {
    super(
      `the subscription route refuses to run with [${names.join(', ')}] set: the CLI authenticates through its own subscription session, and each of ${SUBSCRIPTION_FORBIDDEN_ENV_NAMES.join(', ')} and any ${SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES.map((p) => `${p}*`).join(' or ')} variable would make it authenticate or behave other than the accepted probe did; unset them and run again`,
    );
    this.name = 'SubscriptionEnvironmentError';
  }
}

/** The subscription route lacks a variable it requires. */
export class SubscriptionCaptureConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `a subscription capture requires ${LIVE_AGENTS_ENV}=${LIVE_AGENTS_TOKEN}, ${LIVE_MAX_ATTEMPTS_ENV} (the launch budget), ${LIVE_MAX_INPUT_BYTES_ENV}, and the inherited ${SUBSCRIPTION_INHERITED_ENV_NAMES.join(', ')} unless injected; missing [${missing.join(', ')}]. No endpoint and no credential: the CLI's own session authenticates, and the budget is stated rather than defaulted.`,
    );
    this.name = 'SubscriptionCaptureConfigError';
  }
}

/** The subscription route was handed an adapter or a transport that is not its own. */
export class SubscriptionRouteMismatchError extends Error {
  constructor(detail: string) {
    super(`the subscription route runs claude-code-cli@1 over the process transport and nothing else: ${detail}`);
    this.name = 'SubscriptionRouteMismatchError';
  }
}

export interface SubscriptionCaptureConfig {
  budget: RunBudget;
}

/**
 * The subscription route's gates: forbidden variables first, because a
 * credential in the environment is the more serious fact and is refused
 * before anything else is considered; then the required ones.
 */
export function subscriptionCaptureConfigFrom(env: NodeJS.ProcessEnv): SubscriptionCaptureConfig {
  const forbidden = subscriptionForbiddenEnvNames(env);
  if (forbidden.length > 0) throw new SubscriptionEnvironmentError(forbidden);
  const missing: string[] = [];
  if (!liveAgentsEnabled(env)) missing.push(LIVE_AGENTS_ENV);
  for (const name of [LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV]) {
    const value = env[name];
    if (value === undefined || value === '') missing.push(name);
  }
  if (missing.length > 0) throw new SubscriptionCaptureConfigError(missing);
  return { budget: liveBudgetFrom(env) };
}

/**
 * The role configuration the subscription route runs under: the default in
 * every field but the adapter identity, which is the CLI's. A different
 * `pipelineVersion` and a different `runId` from the HTTP route's, by design.
 */
export const SUBSCRIPTION_ROLE_CONFIG: RoleConfig = { ...DEFAULT_ROLE_CONFIG, providerAdapter: CLAUDE_CODE_CLI_IDENTITY };

// ---------------------------------------------------------------------------
// Stream sanitisation, pure
// ---------------------------------------------------------------------------

/** Keys whose values are replaced wherever they occur outside a model-output subtree. */
export const STREAM_REDACTED_KEYS: ReadonlySet<string> = new Set(['session_id', 'uuid', 'cwd', 'email', 'orgId', 'orgName']);
/** Dotted paths, from the event root, below which nothing is modified. */
export const MODEL_OUTPUT_PATHS: readonly string[] = ['event.delta', 'event.content_block', 'message.content', 'result', 'structured_output'];
export const REDACTED = '[REDACTED]';
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** An inherited value that must never appear in filed evidence, with the name it is reported under. */
export interface SensitiveLiteral {
  name: string;
  value: string;
}

/** Why a string is sensitive, or `null`. Empty literals match nothing: `''.includes` would match everything. */
function sensitivityOf(text: string, literals: readonly SensitiveLiteral[]): string | null {
  if (EMAIL_PATTERN.test(text)) return 'email pattern';
  for (const literal of literals) {
    if (literal.value.length > 0 && text.includes(literal.value)) return `${literal.name} literal`;
  }
  return null;
}

/** The first sensitive string anywhere under a value, described, or `null`. */
function firstSensitiveIn(value: unknown, literals: readonly SensitiveLiteral[]): string | null {
  if (typeof value === 'string') return sensitivityOf(value, literals);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstSensitiveIn(item, literals);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      const found = sensitivityOf(key, literals) ?? firstSensitiveIn(item, literals);
      if (found !== null) return found;
    }
  }
  return null;
}

export interface SanitisedEvent {
  event: Record<string, unknown>;
  /** Set when a model-output subtree carried a sensitive pattern; the event must then not be filed. Names the path and the kind, never the value. */
  omitted: string | null;
}

/**
 * One stream event, sanitised: redacted keys and sensitive strings replaced
 * outside the model-output subtrees, which are returned byte-for-byte and
 * scanned. Pure, so each rule can be exercised alone.
 */
export function sanitiseStreamEvent(event: Record<string, unknown>, literals: readonly SensitiveLiteral[]): SanitisedEvent {
  let omitted: string | null = null;
  const walk = (value: unknown, path: readonly string[]): unknown => {
    const dotted = path.join('.');
    if (MODEL_OUTPUT_PATHS.includes(dotted)) {
      const found = firstSensitiveIn(value, literals);
      if (found !== null && omitted === null) omitted = `model output at ${dotted} contains an ${found}`.replace('an HOME', 'a HOME').replace('an USER', 'a USER');
      return value;
    }
    if (typeof value === 'string') return sensitivityOf(value, literals) === null ? value : REDACTED;
    if (Array.isArray(value)) return value.map((item, i) => walk(item, [...path, String(i)]));
    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = STREAM_REDACTED_KEYS.has(key) ? REDACTED : walk(item, [...path, key]);
      }
      return out;
    }
    return value;
  };
  return { event: walk(event, []) as Record<string, unknown>, omitted };
}

/**
 * A model-output subtree carried a sensitive pattern. The sanitiser never
 * modifies model output, so it cannot be filed; and an execution whose answer
 * cannot be filed cannot go on — the payload would otherwise reach the role
 * output, the transcript and the result, where nothing scans it. Thrown from
 * `onLaunch` after the launch line has been written, so the facts and the
 * reason (path and kind, never the value) are on record; the transport
 * rethrows it unchanged, the runner books `observation_failed` and halts,
 * and the execution fails closed under this name.
 */
export class SensitiveOutputWithheldError extends EvidenceObservationFailedError {
  constructor(readonly seq: number, readonly launchName: string, readonly reason: string, facts?: ProcessFacts) {
    super(`launch ${seq} (${launchName}) is withheld: ${reason}; the stream is not filed and the execution fails closed, because the model's output is never modified and cannot be filed as it is`, facts);
    this.name = 'SensitiveOutputWithheldError';
  }
}

export interface ParsedStreamLine {
  /** The event, when the line parsed as one JSON object; otherwise `null`. */
  event: Record<string, unknown> | null;
  bytes: number;
}

/** Every non-blank stdout line: the object it parses to, or its byte count. */
export function parseStreamLines(stdout: string): ParsedStreamLine[] {
  const out: ParsedStreamLine[] = [];
  for (const text of stdout.split(/\r?\n/)) {
    if (text.trim() === '') continue;
    let event: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) event = parsed as Record<string, unknown>;
    } catch {
      // Filed as unparsed, by size.
    }
    out.push({ event, bytes: Buffer.byteLength(text, 'utf8') });
  }
  return out;
}

export interface SanitisedStream {
  /** One JSON line per stdout line, in order. Empty when `omitted` is set. */
  lines: string[];
  omitted: string | null;
}

/** The whole stream, sanitised, or withheld with the first reason. */
export function sanitiseStream(parsed: readonly ParsedStreamLine[], literals: readonly SensitiveLiteral[]): SanitisedStream {
  const lines: string[] = [];
  for (const { event, bytes } of parsed) {
    if (event === null) {
      lines.push(JSON.stringify({ unparsed: true, bytes }));
      continue;
    }
    const sanitised = sanitiseStreamEvent(event, literals);
    if (sanitised.omitted !== null) return { lines: [], omitted: sanitised.omitted };
    lines.push(JSON.stringify(sanitised.event));
  }
  return { lines, omitted: null };
}

/** What one role launch's stream said about itself, read from the CLI's own events; `null` where the stream said nothing. */
export interface StreamObservation {
  /** Every `request_id` on an `assistant` event, in order. */
  requestIds: string[];
  /** `result.num_turns`. */
  numTurns: number | null;
  /** `result.usage.thinking_tokens`, a figure the CLI 2.1.226 stream has not been seen to report; `null` means it reported none. */
  thinkingTokens: number | null;
  /** How many `rate_limit_event` lines arrived. */
  rateLimitEvents: number;
  /** `result.usage`, as reported. */
  reportedUsage: Record<string, unknown> | null;
}

function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Reads the observation off the parsed events. Never throws: a stream that says nothing observes nothing. */
export function observeStream(parsed: readonly ParsedStreamLine[]): StreamObservation {
  const observation: StreamObservation = { requestIds: [], numTurns: null, thinkingTokens: null, rateLimitEvents: 0, reportedUsage: null };
  for (const { event } of parsed) {
    if (event === null) continue;
    if (event['type'] === 'assistant' && typeof event['request_id'] === 'string') observation.requestIds.push(event['request_id']);
    if (event['type'] === 'rate_limit_event') observation.rateLimitEvents += 1;
    if (event['type'] === 'result') {
      observation.numTurns = countOrNull(event['num_turns']);
      const usage = event['usage'];
      if (typeof usage === 'object' && usage !== null && !Array.isArray(usage)) {
        observation.reportedUsage = usage as Record<string, unknown>;
        observation.thinkingTokens = countOrNull((usage as Record<string, unknown>)['thinking_tokens']);
      }
    }
  }
  return observation;
}

// ---------------------------------------------------------------------------
// The request and the outcome
// ---------------------------------------------------------------------------

/** What tests inject on the subscription route; production supplies none of it. */
export interface SubscriptionCaptureOptions {
  /** The pin. Defaults to `PINNED_CLI` resolved against the handed environment's `HOME`. */
  executable?: ExecutablePin;
  /** The launch function. Defaults to the real `spawn`. */
  launch?: LaunchFunction;
  /** The three inherited variables. Defaults to `HOME`, `USER`, `PATH` from the handed environment. */
  inheritedEnv?: InheritedEnv;
  /** Where `SIGINT`/`SIGTERM` are listened for. Defaults to `process`. */
  interrupts?: EventEmitter;
  termGraceMs?: number;
  killGraceMs?: number;
  tempRoot?: string;
}

export interface LiveCaptureRequest {
  packId: string;
  requirementId: string;
  /**
   * The world to run over. `verificationDir` is read for its
   * `requirement-versions/<packId>.json`, which is copied into the execution's
   * own verification root; nothing is written under the caller's directory.
   */
  paths: VerifyPaths;
  /** Where this execution is filed. Absolute. Refused if it meets the fixture root. */
  executionRoot: string;
  /** The environment the gates are read from. Never defaulted to `process.env`. */
  env: NodeJS.ProcessEnv;
  /** Which route. Defaults to `http`. */
  route?: CaptureRoute;
  /** The provider adapter. Refused before construction when absent. On the subscription route it must be the CLI adapter, and defaults to it. */
  adapter?: ProviderAdapter;
  /** Injected by offline tests on the HTTP route. A genuine execution supplies none and is marked as such. Refused on the subscription route. */
  transport?: ProviderTransport;
  /** Subscription route only. */
  subscription?: SubscriptionCaptureOptions;
  /** Fixed by tests; otherwise a timestamp with a random suffix. Not an identity of anything. */
  executionId?: string;
  /** Wall clock for timestamps in the diagnostics. Never used for identity. */
  now?: () => Date;
  /** After this many milliseconds the execution is cancelled: in-flight attempt aborted, waits ended, no further sends. */
  deadlineMs?: number;
  /** The fixture root the guard compares against. Defaults to the real one. */
  fixtureRoot?: string;
}

/** One operator interrupt, as handled. */
export interface InterruptRecord {
  signal: 'SIGINT' | 'SIGTERM';
  at: string;
  action: 'abort' | 'escalate';
}

export interface LiveCaptureOutcome {
  status: 'completed' | 'failed';
  route: CaptureRoute;
  executionId: string;
  executionDir: string;
  /** The run identity, once orchestration derived it. `null` for an execution that did not complete. */
  runId: string | null;
  transcriptPath: string | null;
  resultPath: string | null;
  attemptsPath: string;
  summaryPath: string;
  /** Subscription route only; `null` on the HTTP route. */
  launchesPath: string | null;
  streamsDir: string | null;
  /** HTTP attempts actually sent, retries included: the runner's `ledger.attemptsUsed`. `null` on the subscription route, where they are unknown. */
  httpAttempts: number | null;
  /** Children that started: the runner's `ledger.launchesStarted`. Zero on the HTTP route. */
  launches: number;
  gateLaunches: number;
  /** Refusals that sent nothing: admission, budget, cancellation before send. */
  unsentEvents: number;
  /** Lines in `attempts.jsonl`: sent attempts plus `unsentEvents`. */
  recordsWritten: number;
  cancelled: boolean;
  cancellationReason: string | null;
  gate: GateResult | null;
  interrupts: InterruptRecord[];
  interruptedBy: 'SIGINT' | 'SIGTERM' | null;
  terminationUnconfirmed: boolean;
  /** The harness withheld the run's outputs: a completed run whose termination was unconfirmed, or a launch whose model output could not be filed. Any result already written was deleted. */
  resultWithheld: boolean;
  ledger: BudgetLedger;
  error: { name: string; message: string } | null;
  exitCode: number | null;
  lines: string[];
}

function redact(text: string, secret: string): string {
  return secret.length === 0 ? text : text.split(secret).join('[redacted]');
}

function contains(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** The execution directory, made once, with the requirement-versions register copied in. */
function prepareExecutionDir(request: LiveCaptureRequest, executionId: string): { executionDir: string; verificationDir: string } {
  const caseDir = join(request.executionRoot, request.packId, request.requirementId);
  const executionDir = join(caseDir, executionId);
  mkdirSync(caseDir, { recursive: true });
  try {
    mkdirSync(executionDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ExecutionExistsError(executionDir);
    throw error;
  }
  const verificationDir = join(executionDir, 'verification');
  mkdirSync(join(verificationDir, 'requirement-versions'), { recursive: true });
  cpSync(join(request.paths.verificationDir, 'requirement-versions', `${request.packId}.json`), join(verificationDir, 'requirement-versions', `${request.packId}.json`));
  return { executionDir, verificationDir };
}

function describeError(thrown: unknown, secret: string): { name: string; message: string } {
  return thrown instanceof Error
    ? { name: thrown.name, message: redact(thrown.message, secret) }
    : { name: 'UnknownFailure', message: redact(String(thrown), secret) };
}

/**
 * One live execution, through the production command path, with everything it
 * produced filed together.
 *
 * The gates are checked **before anything is constructed or written**:
 * the route's configuration first, then `assertLiveAgentsEnabled`, then the
 * adapter, then the execution root — so an unauthorised or misdirected call
 * fails having contacted nothing and created nothing.
 */
export async function captureLiveRun(request: LiveCaptureRequest): Promise<LiveCaptureOutcome> {
  // The route, before anything else: the selector decides, and a stated
  // route that contradicts it is refused rather than obeyed.
  const selected = subscriptionCaptureSelected(request.env);
  const selectorPresent = request.env[SUBSCRIPTION_CAPTURE_ENV] !== undefined;
  let route: CaptureRoute;
  if (request.route === undefined) route = captureRouteFor(request.env);
  else {
    if (request.route === 'http' && selectorPresent) throw new CaptureRouteConflictError(`route http was requested with ${SUBSCRIPTION_CAPTURE_ENV} set`);
    if (request.route === 'subscription' && !selected) throw new CaptureRouteConflictError(`route subscription was requested without ${SUBSCRIPTION_CAPTURE_ENV}=${SUBSCRIPTION_CAPTURE_TOKEN}`);
    route = request.route;
  }
  if (route === 'subscription') return captureSubscriptionRun(request);
  // The HTTP path refuses anything of the other route's: the selector in any
  // form, a process-channel adapter, or the CLI identity on any channel.
  if (selectorPresent) throw new CaptureRouteConflictError(`the HTTP route was derived while ${SUBSCRIPTION_CAPTURE_ENV} is set to a value other than ${SUBSCRIPTION_CAPTURE_TOKEN}`);
  if (request.adapter !== undefined) {
    const { identity } = request.adapter;
    if (request.adapter.channel === 'process') throw new CaptureRouteConflictError(`the adapter ${identity.id}@${identity.version} speaks the process channel, which only the subscription route runs`);
    if (identity.id === CLAUDE_CODE_CLI_IDENTITY.id && identity.version === CLAUDE_CODE_CLI_IDENTITY.version) throw new CaptureRouteConflictError(`the adapter identity is claude-code-cli@1, which only the subscription route runs`);
  }
  const config = liveCaptureConfigFrom(request.env);
  assertLiveAgentsEnabled(request.env);
  const adapter = requireProviderAdapter(request);
  const fixtureRoot = resolve(request.fixtureRoot ?? DEFAULT_FIXTURE_ROOT);
  if (contains(fixtureRoot, request.executionRoot) || contains(request.executionRoot, fixtureRoot)) {
    throw new ExecutionRootError(resolve(request.executionRoot), fixtureRoot);
  }
  // Before the first directory exists: a lifetime the timer cannot honour is
  // refused here, whether derived from the budget or supplied explicitly.
  if (request.deadlineMs !== undefined) assertSupportedLifetime(request.deadlineMs);

  const now = request.now ?? (() => new Date());
  const startedAt = now();
  const executionId = request.executionId ?? `${stamp(startedAt)}-${randomBytes(3).toString('hex')}`;
  const { executionDir, verificationDir } = prepareExecutionDir(request, executionId);
  const attemptsPath = join(executionDir, 'attempts.jsonl');
  const summaryPath = join(executionDir, 'execution.json');
  const adapterName = `${adapter.identity.id}@${adapter.identity.version}`;
  const synthetic = request.transport !== undefined;

  const writeSummary = (fields: Record<string, unknown>): void => {
    const summary = {
      packId: request.packId,
      requirementId: request.requirementId,
      executionId,
      route: 'http',
      attemptUnit: 'http_attempt',
      adapter: adapterName,
      transport: synthetic ? 'injected' : 'fetch',
      synthetic,
      budget: config.budget,
      deadlineMs: request.deadlineMs ?? null,
      startedAt: startedAt.toISOString(),
      ...fields,
    };
    writeFileSync(summaryPath, redact(`${JSON.stringify(summary, null, 2)}\n`, config.apiKey), 'utf8');
  };
  writeSummary({ status: 'running', runId: null, finishedAt: null, httpAttempts: 0, unsentEvents: 0, recordsWritten: 0, cancelled: false, ledger: null, exitCode: null, lines: [], error: null });

  let unsentEvents = 0;
  let recordsWritten = 0;
  const observe = (record: AttemptRecord): void => {
    appendFileSync(attemptsPath, redact(`${JSON.stringify({ at: now().toISOString(), ...record })}\n`, config.apiKey), 'utf8');
    recordsWritten += 1;
    if (!record.sent) unsentEvents += 1;
  };
  // `attempts.jsonl` exists even for an execution that never sends: an empty
  // file says "no attempt was made", where an absent one would say nothing.
  writeFileSync(attemptsPath, '', 'utf8');

  // The lifetime: one controller for the whole execution, handed to the
  // runner, fired by the deadline and cleared when the execution ends.
  const lifetime = new AbortController();
  const deadline = request.deadlineMs === undefined ? null : setTimeout(() => lifetime.abort(`deadline of ${request.deadlineMs} ms`), request.deadlineMs);

  const runner = createLiveAgentRunner({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    adapter,
    budget: config.budget,
    observe,
    signal: lifetime.signal,
    ...(request.transport === undefined ? {} : { transport: request.transport }),
  }) as LiveAgentRunner;

  // A holder rather than a `let`: the assignment happens inside a callback,
  // and TypeScript would otherwise narrow the variable to `null` for good.
  const handed: { transcript: RunTranscript | null } = { transcript: null };
  let exitCode: number | null = null;
  let lines: string[] = [];
  let error: { name: string; message: string } | null = null;
  try {
    const outcome = await dispatch(
      ['run', request.packId, request.requirementId],
      { ...request.paths, verificationDir },
      () => true,
      undefined,
      {
        runner,
        record: (transcript) => {
          handed.transcript = transcript;
        },
      },
    );
    exitCode = outcome.exitCode;
    lines = outcome.lines.map((line) => redact(line, config.apiKey));
    if (outcome.exitCode !== EXIT_OK) {
      error = { name: 'RunRefused', message: `the run did not complete (exit ${outcome.exitCode}): ${lines.join(' | ')}` };
    } else if (handed.transcript === null) {
      error = { name: 'NoRecording', message: `the run exited ${outcome.exitCode} but orchestration handed over no transcript` };
    }
  } catch (thrown) {
    error = describeError(thrown, config.apiKey);
  } finally {
    if (deadline !== null) clearTimeout(deadline);
  }
  const cancelled = lifetime.signal.aborted;

  const transcript: RunTranscript | null = error === null ? handed.transcript : null;
  let transcriptPath: string | null = null;
  if (transcript !== null) {
    transcriptPath = writeRunTranscript(join(executionDir, 'transcript'), transcript);
  }
  const resultCandidate = join(verificationDir, request.packId, request.requirementId, 'verification-result.json');
  const resultPathOut = transcript !== null && existsSync(resultCandidate) ? resultCandidate : null;
  const status: LiveCaptureOutcome['status'] = transcript !== null ? 'completed' : 'failed';
  const ledger = runner.ledger;
  // `httpAttempts` is the ledger's figure, never a count of observer calls:
  // the two must agree, and the ledger is the runner's own account.
  const httpAttempts = ledger.attemptsUsed;
  writeSummary({
    status,
    runId: transcript?.runId ?? null,
    finishedAt: now().toISOString(),
    httpAttempts,
    unsentEvents,
    recordsWritten,
    cancelled,
    ledger,
    exitCode,
    lines,
    error,
    transcriptPath,
    resultPath: resultPathOut,
  });

  return {
    status,
    route: 'http',
    executionId,
    executionDir,
    runId: transcript?.runId ?? null,
    transcriptPath,
    resultPath: resultPathOut,
    attemptsPath,
    summaryPath,
    launchesPath: null,
    streamsDir: null,
    httpAttempts,
    launches: 0,
    gateLaunches: 0,
    unsentEvents,
    recordsWritten,
    cancelled,
    cancellationReason: cancelled ? String(lifetime.signal.reason) : null,
    gate: null,
    interrupts: [],
    interruptedBy: null,
    terminationUnconfirmed: false,
    resultWithheld: false,
    ledger,
    error,
    exitCode,
    lines,
  };
}

// ---------------------------------------------------------------------------
// The subscription route
// ---------------------------------------------------------------------------

/** The name of the gate's refusal in `execution.json.error`. */
export const GATE_REFUSED_ERROR_NAME = 'AuthenticationGateRefused';

/** Stated once, filed on every subscription summary: what this route configures without observing. */
export const SUBSCRIPTION_UNOBSERVED = Object.freeze({
  outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000; wire-level max_tokens unobserved',
  thinking: 'CLI-decided for effort high; not asserted',
});
export const SUBSCRIPTION_MEASURED = Object.freeze({
  admittedLaunchInputBytes: 'UTF-8 length of the JSON launch description; upper bound on prompt-file + stdin bytes; not the provider request size',
});

/** One line of `launches.jsonl`. */
export interface LaunchLine {
  at: string;
  seq: number;
  kind: LaunchRecord['kind'];
  role: string | null;
  index: number | null;
  argv: string[];
  envNames: string[];
  facts: ProcessFacts;
  /** Both pipes were seen to close; `false` means the launch was given up on while an untracked process still held them. */
  streamsClosed: boolean;
  /** Relative to the execution directory; `null` when withheld. */
  stream: string | null;
  streamOmitted: string | null;
  observed: StreamObservation | null;
}

/**
 * Every launch whose cleanup was not confirmed, with the facts that say so:
 * a termination whose child was not seen reaped or whose group was not seen
 * gone, or a launch — gate or role — whose pipes were still held when it was
 * given up on. The transport refuses such a launch where it happens, so no
 * natural caller reaches this rule with a clean error; it is the backstop,
 * pure so each fact can be proved to trip it alone.
 */
export function unconfirmedLaunches(lines: readonly LaunchLine[]): string[] {
  return lines.flatMap((line) => {
    const facts: string[] = [];
    if (line.facts.termination !== null) {
      if (!line.facts.termination.childReaped) facts.push('childReaped false');
      if (line.facts.termination.groupGone !== true) facts.push(`groupGone ${String(line.facts.termination.groupGone)}`);
    }
    if (!line.streamsClosed) facts.push('streamsClosed false');
    return facts.length === 0 ? [] : [`launch ${line.seq} (${line.kind === 'gate' ? 'gate' : `${line.role}[${line.index}]`}): ${facts.join(', ')}`];
  });
}

/**
 * `runRun` without `DEFAULT_ROLE_CONFIG`: the same production functions in
 * the same order, over `SUBSCRIPTION_ROLE_CONFIG`. See the header for why
 * this is composed here rather than reached through `dispatch`.
 */
async function runSubscriptionCommand(
  packId: string,
  requirementId: string,
  paths: VerifyPaths,
  runner: AgentRunner,
  record: (transcript: RunTranscript) => void,
): Promise<CliOutcome> {
  let world: CurrentWorld;
  let registry: ReturnType<typeof readRegistryOrFail>;
  try {
    world = readWorld(paths, packId, requirementId);
    registry = readRegistryOrFail(paths, packId);
  } catch (error) {
    const mapped = outcomeFor(error);
    if (mapped !== null) return mapped;
    throw error;
  }
  const closure = EntitledClosure.forSources(world.corpus, world.sourceRegister, world.pack, sourceIdsOf(world.requirement));
  let run;
  try {
    run = await runVerificationPipeline({
      packId,
      requirementId,
      requirement: world.requirement,
      renderContext: world.renderCtx,
      closure,
      corpus: world.corpus,
      prompts: loadPromptSet(),
      config: SUBSCRIPTION_ROLE_CONFIG,
      runner,
    });
  } catch (error) {
    if (error instanceof RoleOutputError) {
      return { exitCode: EXIT_REFUSED, lines: ['REFUSED — a role output was refused at its own boundary.', `  - role_output: ${error.message}`, '  No verification result was written.'] };
    }
    throw error;
  }
  record(run.transcript);
  const written = writeVerificationResult({
    run,
    requirement: world.requirement,
    registry,
    registers: {
      docIds: world.corpus.index.documents.map((document) => document.docId),
      sourceIds: world.pack.sources.map((source) => source.id),
    },
    destination: resultPath(paths, packId, requirementId),
  });
  if (written.status === 'invalid') {
    return { exitCode: EXIT_REFUSED, lines: ['REFUSED — the run did not produce a verification result, so nothing was written.', ...written.error.message.split('\n').map((line) => `  - invalid_result: ${line.trim()}`)] };
  }
  if (written.status === 'write_failed') {
    return { exitCode: EXIT_INTEGRITY_FAILURE, lines: [`INTEGRITY FAILURE — the record was valid and the filesystem refused it at the ${written.stage} stage.`, `  ${written.error.message}`] };
  }
  return { exitCode: EXIT_OK, lines: [`Wrote ${written.path}`, `  resultSha256 ${written.resultSha256}`, `  pipelineVersion ${written.result.pipelineVersion}`, `  gaps: ${written.result.gaps.length === 0 ? 'none' : written.result.gaps.length}`] };
}

async function captureSubscriptionRun(request: LiveCaptureRequest): Promise<LiveCaptureOutcome> {
  const sub = request.subscription ?? {};
  const config = subscriptionCaptureConfigFrom(request.env);
  assertLiveAgentsEnabled(request.env);
  const adapter = request.adapter ?? CLAUDE_CODE_CLI_ADAPTER;
  if (adapter.identity.id !== CLAUDE_CODE_CLI_IDENTITY.id || adapter.identity.version !== CLAUDE_CODE_CLI_IDENTITY.version) {
    throw new SubscriptionRouteMismatchError(`the adapter handed in is ${adapter.identity.id}@${adapter.identity.version}`);
  }
  if (request.transport !== undefined) throw new SubscriptionRouteMismatchError('an HTTP transport was handed in; the process transport is constructed here and only its launch function is injectable');
  // The inherited variables, from the handed environment unless injected —
  // checked before any directory exists, like every other gate.
  let inheritedEnv: InheritedEnv;
  if (sub.inheritedEnv !== undefined) inheritedEnv = { ...sub.inheritedEnv };
  else {
    const missing = SUBSCRIPTION_INHERITED_ENV_NAMES.filter((name) => request.env[name] === undefined || request.env[name] === '');
    if (missing.length > 0) throw new SubscriptionCaptureConfigError(missing);
    inheritedEnv = { HOME: request.env['HOME']!, USER: request.env['USER']!, PATH: request.env['PATH']! };
  }
  const executable: ExecutablePin = sub.executable ?? { path: resolvePinnedCliPath(inheritedEnv.HOME), sha256: PINNED_CLI.sha256, sizeBytes: PINNED_CLI.sizeBytes };
  const fixtureRoot = resolve(request.fixtureRoot ?? DEFAULT_FIXTURE_ROOT);
  if (contains(fixtureRoot, request.executionRoot) || contains(request.executionRoot, fixtureRoot)) {
    throw new ExecutionRootError(resolve(request.executionRoot), fixtureRoot);
  }
  if (request.deadlineMs !== undefined) assertSupportedLifetime(request.deadlineMs);

  const now = request.now ?? (() => new Date());
  const startedAt = now();
  const executionId = request.executionId ?? `${stamp(startedAt)}-${randomBytes(3).toString('hex')}`;
  const { executionDir, verificationDir } = prepareExecutionDir(request, executionId);
  const attemptsPath = join(executionDir, 'attempts.jsonl');
  const launchesPath = join(executionDir, 'launches.jsonl');
  const streamsDir = join(executionDir, 'streams');
  const summaryPath = join(executionDir, 'execution.json');
  const synthetic = sub.launch !== undefined || sub.executable !== undefined;
  const literals: SensitiveLiteral[] = [
    { name: 'HOME', value: inheritedEnv.HOME },
    { name: 'USER', value: inheritedEnv.USER },
  ];

  const launchLines: LaunchLine[] = [];
  const interrupts: InterruptRecord[] = [];
  let interruptedBy: InterruptRecord['signal'] | null = null;
  let gate: GateResult | null = null;
  let drainedAt: string | null = null;
  /** The harness rule, if any, that withheld the run's outputs. */
  let withheldBy: 'SensitiveOutputWithheldError' | 'TerminationUnconfirmed' | null = null;

  const writeSummary = (fields: Record<string, unknown>): void => {
    const summary = {
      packId: request.packId,
      requirementId: request.requirementId,
      executionId,
      route: 'subscription',
      attemptUnit: 'cli_launch',
      adapter: `${adapter.identity.id}@${adapter.identity.version}`,
      transport: sub.launch === undefined ? 'spawn' : 'injected-launch',
      synthetic,
      pin: { version: PINNED_CLI.version, sha256: executable.sha256, sizeBytes: executable.sizeBytes, injected: sub.executable !== undefined },
      budget: config.budget,
      deadlineMs: request.deadlineMs ?? null,
      startedAt: startedAt.toISOString(),
      unobserved: SUBSCRIPTION_UNOBSERVED,
      measured: SUBSCRIPTION_MEASURED,
      gate,
      interrupts,
      interruptedBy,
      launchesPath: 'launches.jsonl',
      streamsDir: 'streams',
      ...fields,
    };
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  };
  writeSummary({ status: 'running', runId: null, finishedAt: null, drainedAt: null, httpAttempts: null, launches: 0, gateLaunches: 0, unsentEvents: 0, recordsWritten: 0, cancelled: false, cancellationReason: null, terminationUnconfirmed: false, resultWithheld: false, cliObserved: null, ledger: null, exitCode: null, lines: [], error: null });

  let unsentEvents = 0;
  let recordsWritten = 0;
  const observe = (record: AttemptRecord): void => {
    appendFileSync(attemptsPath, `${JSON.stringify({ at: now().toISOString(), ...record })}\n`, 'utf8');
    recordsWritten += 1;
    if (!record.sent) unsentEvents += 1;
  };
  writeFileSync(attemptsPath, '', 'utf8');
  writeFileSync(launchesPath, '', 'utf8');
  mkdirSync(streamsDir);

  // Evidence of every launch. Anything thrown here reaches the transport,
  // which raises EvidenceObservationFailedError and halts the runner: an
  // execution whose account cannot be written must not go on launching.
  const onLaunch = (record: LaunchRecord, stdout: string): void => {
    const seq = launchLines.length + 1;
    const { kind, role, index, argv, envNames, streamsClosed, ...facts } = record;
    const parsed = parseStreamLines(stdout);
    const sanitised = sanitiseStream(parsed, literals);
    const observed = kind === 'role' ? observeStream(parsed) : null;
    const name = kind === 'gate' ? `gate-launch${seq}` : `role-${role}[${index}]-launch${seq}`;
    const streamFile = `${name}.sanitised.jsonl`;
    const line: LaunchLine = {
      at: now().toISOString(),
      seq,
      kind,
      role,
      index,
      argv: [...argv],
      envNames: [...envNames],
      facts,
      streamsClosed,
      stream: sanitised.omitted === null ? join('streams', streamFile) : null,
      streamOmitted: sanitised.omitted,
      observed,
    };
    // The record itself must carry no inherited value: the argv holds the
    // prompt path's placeholder, never the path, and nothing here should
    // hold HOME or USER. Fail closed if it would.
    const serialised = JSON.stringify(line);
    const leak = sensitivityOf(serialised, literals);
    if (leak !== null) throw new Error(`the launch record for ${name} would carry an ${leak}; not filed`);
    if (sanitised.omitted === null) writeFileSync(join(streamsDir, streamFile), sanitised.lines.map((l) => `${l}\n`).join(''), 'utf8');
    appendFileSync(launchesPath, `${serialised}\n`, 'utf8');
    launchLines.push(line);
    // The line is on record — facts, and the reason by path and kind — and
    // now the execution fails closed: a model output that cannot be filed is
    // not handed on to the role, the transcript or the result.
    if (sanitised.omitted !== null) {
      withheldBy = 'SensitiveOutputWithheldError';
      throw new SensitiveOutputWithheldError(seq, name, sanitised.omitted, facts);
    }
  };

  const transport = createSpawnTransport({
    executable,
    inheritedEnv,
    controls: LAUNCH_CONTROL_ENV,
    onLaunch,
    ...(sub.launch === undefined ? {} : { launch: sub.launch }),
    ...(sub.tempRoot === undefined ? {} : { tempRoot: sub.tempRoot }),
    ...(sub.termGraceMs === undefined ? {} : { termGraceMs: sub.termGraceMs }),
    ...(sub.killGraceMs === undefined ? {} : { killGraceMs: sub.killGraceMs }),
  });

  const lifetime = new AbortController();
  const deadline = request.deadlineMs === undefined ? null : setTimeout(() => lifetime.abort(`deadline of ${request.deadlineMs} ms`), request.deadlineMs);

  const inner = createLiveAgentRunner({
    endpoint: CLI_LAUNCH_URL,
    apiKey: '',
    adapter,
    transport,
    budget: config.budget,
    observe,
    signal: lifetime.signal,
    maxAttempts: 1,
  }) as LiveAgentRunner;
  // The first failure ends the execution: the lifetime is aborted before the
  // rejection propagates, so nothing later is sent and any child still
  // tracked is ended by the transport.
  const runner: AgentRunner = {
    kind: inner.kind,
    adapter: inner.adapter,
    async run(roleRequest) {
      try {
        return await inner.run(roleRequest);
      } catch (thrown) {
        if (!lifetime.signal.aborted) lifetime.abort(`role_failed:${roleRequest.role}[${roleRequest.index}]`);
        throw thrown;
      }
    },
  };

  const interruptSource: EventEmitter = sub.interrupts ?? process;
  const onInterrupt = (signal: InterruptRecord['signal']) => (): void => {
    if (interrupts.length === 0) {
      interruptedBy = signal;
      interrupts.push({ signal, at: now().toISOString(), action: 'abort' });
      lifetime.abort(`operator:${signal}`);
      return;
    }
    interrupts.push({ signal, at: now().toISOString(), action: 'escalate' });
    transport.escalate();
  };
  const onSigint = onInterrupt('SIGINT');
  const onSigterm = onInterrupt('SIGTERM');
  interruptSource.on('SIGINT', onSigint);
  interruptSource.on('SIGTERM', onSigterm);

  const handed: { transcript: RunTranscript | null } = { transcript: null };
  let exitCode: number | null = null;
  let lines: string[] = [];
  let error: { name: string; message: string } | null = null;
  try {
    gate = await transport.runGate(lifetime.signal);
    if (!gate.pass) {
      error = { name: GATE_REFUSED_ERROR_NAME, message: `the authentication gate refused the execution before any role was dispatched: ${gate.reasons.join('; ')}` };
    } else {
      const outcome = await runSubscriptionCommand(request.packId, request.requirementId, { ...request.paths, verificationDir }, runner, (transcript) => {
        handed.transcript = transcript;
      });
      exitCode = outcome.exitCode;
      lines = outcome.lines;
      if (outcome.exitCode !== EXIT_OK) {
        error = { name: 'RunRefused', message: `the run did not complete (exit ${outcome.exitCode}): ${lines.join(' | ')}` };
      } else if (handed.transcript === null) {
        error = { name: 'NoRecording', message: `the run exited ${outcome.exitCode} but orchestration handed over no transcript` };
      }
    }
  } catch (thrown) {
    error = describeError(thrown, '');
  } finally {
    if (deadline !== null) clearTimeout(deadline);
    interruptSource.off('SIGINT', onSigint);
    interruptSource.off('SIGTERM', onSigterm);
  }

  // Every tracked child, reaped or given up on, before the final status is
  // written: an account that says "failed" while a child still runs would be
  // an account of a different state than the machine is in.
  await transport.drain();
  drainedAt = now().toISOString();
  const cancelled = lifetime.signal.aborted;
  // Every launch whose cleanup was not confirmed, with the facts that say so:
  // a termination whose child was not seen reaped or whose group was not
  // seen gone, or a role launch whose pipes were still held when it was
  // given up on. Such an execution has a child, or a holder of its output,
  // that this harness could not account for, and its transcript is not
  // published as a completed one.
  const unconfirmed = unconfirmedLaunches(launchLines);
  const terminationUnconfirmed = unconfirmed.length > 0;
  if (error === null && terminationUnconfirmed) {
    withheldBy = 'TerminationUnconfirmed';
    error = { name: 'TerminationUnconfirmed', message: `the run completed but its cleanup was not confirmed, so nothing it produced is published: ${unconfirmed.join('; ')}` };
  }

  const transcript: RunTranscript | null = error === null ? handed.transcript : null;
  let transcriptPath: string | null = null;
  if (transcript !== null) transcriptPath = writeRunTranscript(join(executionDir, 'transcript'), transcript);
  const resultCandidate = join(verificationDir, request.packId, request.requirementId, 'verification-result.json');
  // A result the pipeline wrote for an execution that is not completed is
  // deleted: a dossier under a failed execution would be evidence of a run
  // this harness has refused to vouch for.
  let resultWithheld = withheldBy !== null;
  if (transcript === null && existsSync(resultCandidate)) {
    rmSync(resultCandidate);
    resultWithheld = true;
  }
  const resultPathOut = transcript !== null && existsSync(resultCandidate) ? resultCandidate : null;
  const status: LiveCaptureOutcome['status'] = transcript !== null ? 'completed' : 'failed';
  const ledger = inner.ledger;
  const roleLines = launchLines.filter((line) => line.kind === 'role');
  const cliObserved = {
    requestIds: roleLines.flatMap((line) => line.observed?.requestIds ?? []),
    numTurns: roleLines.map((line) => line.observed?.numTurns ?? null),
    thinkingTokens: roleLines.map((line) => line.observed?.thinkingTokens ?? null),
    rateLimitEvents: roleLines.reduce((sum, line) => sum + (line.observed?.rateLimitEvents ?? 0), 0),
    reportedUsage: roleLines.map((line) => ({ role: line.role, index: line.index, seq: line.seq, usage: line.observed?.reportedUsage ?? null })),
  };
  const launches = ledger.launchesStarted;
  const gateLaunches = launchLines.filter((line) => line.kind === 'gate').length;
  const cancellationReason = cancelled ? String(lifetime.signal.reason) : null;
  writeSummary({
    status,
    runId: transcript?.runId ?? null,
    finishedAt: now().toISOString(),
    drainedAt,
    httpAttempts: null,
    launches,
    gateLaunches,
    unsentEvents,
    recordsWritten,
    cancelled,
    cancellationReason,
    terminationUnconfirmed,
    resultWithheld,
    cliObserved,
    ledger,
    exitCode,
    lines,
    error,
    transcriptPath,
    resultPath: resultPathOut,
  });

  return {
    status,
    route: 'subscription',
    executionId,
    executionDir,
    runId: transcript?.runId ?? null,
    transcriptPath,
    resultPath: resultPathOut,
    attemptsPath,
    summaryPath,
    launchesPath,
    streamsDir,
    httpAttempts: null,
    launches,
    gateLaunches,
    unsentEvents,
    recordsWritten,
    cancelled,
    cancellationReason,
    gate,
    interrupts,
    interruptedBy,
    terminationUnconfirmed,
    resultWithheld,
    ledger,
    error,
    exitCode,
    lines,
  };
}

// ---------------------------------------------------------------------------
// The first live case, on either route
// ---------------------------------------------------------------------------

export interface FirstLiveCaseOptions {
  /** The environment the gates, the route and the budget are read from. */
  env: NodeJS.ProcessEnv;
  /** Where the execution is filed. The agents suite passes `LIVE_EXECUTION_ROOT` under the engine root. */
  executionRoot: string;
  /** Injected by offline tests only, HTTP route. A genuine execution supplies none; the subscription route refuses one. */
  transport?: ProviderTransport;
  /** Injected by offline tests only, subscription route. A genuine execution supplies none, and launches the pinned CLI. */
  subscription?: SubscriptionCaptureOptions;
  now?: () => Date;
  /** Defaults to `executionLifetimeMs` of the stated budget on the route the environment selects. */
  deadlineMs?: number;
}

/** The world the first live case runs over: the real pack, corpus and registry. */
function firstLiveCasePaths(): VerifyPaths {
  return {
    packDir: join(engineRoot, 'knowledge', FIRST_LIVE_CASE.packId),
    corpusDir: join(engineRoot, 'corpus'),
    verificationDir: join(engineRoot, 'verification'),
  };
}

/**
 * The first live case, exactly as the agents suite runs it — the same
 * function, so what the offline tests prove over an injected transport is
 * the route the authorised run takes: the accepted adapter, the real pack and
 * corpus, the real requirement-versions registry, and a lifetime derived from
 * the stated budget. Every gate is checked by `captureLiveRun` before anything
 * is constructed or written.
 */
export async function runFirstLiveCase(options: FirstLiveCaseOptions): Promise<LiveCaptureOutcome> {
  // The route is the environment's, never stated here: the adapter and the
  // budget follow it, and `captureLiveRun` derives the same answer again.
  const route = captureRouteFor(options.env);
  const budget = route === 'http' ? liveCaptureConfigFrom(options.env).budget : subscriptionCaptureConfigFrom(options.env).budget;
  const deadlineMs = options.deadlineMs ?? executionLifetimeMs(budget);
  return captureLiveRun({
    packId: FIRST_LIVE_CASE.packId,
    requirementId: FIRST_LIVE_CASE.requirementId,
    paths: firstLiveCasePaths(),
    executionRoot: options.executionRoot,
    env: options.env,
    adapter: route === 'http' ? ANTHROPIC_MESSAGES_ADAPTER : CLAUDE_CODE_CLI_ADAPTER,
    deadlineMs,
    ...(options.transport === undefined ? {} : { transport: options.transport }),
    ...(options.subscription === undefined ? {} : { subscription: options.subscription }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

export type FirstSubscriptionCaseOptions = Omit<FirstLiveCaseOptions, 'transport'>;

/**
 * The first live case, on the condition that the environment selects the
 * subscription route: the same function as `runFirstLiveCase`, refused by
 * name when `DATASTRATA_SUBSCRIPTION_CAPTURE=1` is absent, because a
 * subscription run authenticates as the operator and the caller asked for
 * that route specifically.
 */
export async function runFirstSubscriptionCase(options: FirstSubscriptionCaseOptions): Promise<LiveCaptureOutcome> {
  if (!subscriptionCaptureSelected(options.env)) throw new CaptureRouteConflictError(`the subscription case was asked for without ${SUBSCRIPTION_CAPTURE_ENV}=${SUBSCRIPTION_CAPTURE_TOKEN}`);
  return runFirstLiveCase(options);
}
