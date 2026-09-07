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
 *   attempts.jsonl                  one AttemptRecord per HTTP attempt, in order
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
 * `execution.json` carries `httpAttempts`, which is the runner's own
 * `ledger.attemptsUsed` — sends, retries included — and separately
 * `unsentEvents`, the admission, budget and cancellation refusals that sent
 * nothing, and `recordsWritten`, their sum as lines of `attempts.jsonl`.
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
 * DATASTRATA_AGENT_ENDPOINT          the endpoint, named explicitly
 * DATASTRATA_AGENT_API_KEY           the credential
 * DATASTRATA_AGENT_MAX_ATTEMPTS      the run's HTTP attempt budget, retries included
 * DATASTRATA_AGENT_MAX_INPUT_BYTES   the largest request body admitted per attempt
 * adapter                            the named provider protocol itself
 * ```
 *
 * All are required and none implies another. `liveCaptureConfigFrom` and
 * `assertLiveAgentsEnabled` read the env this function is *handed*;
 * `createLiveAgentRunner` and `LiveAgentRunner.run` read the ambient
 * `process.env`, so the composition is fail-closed in both directions.
 *
 * # What is kept, and what it is worth
 *
 * The transcript is the one orchestration built. `outputJson` is the runner's
 * response text, stored verbatim, so replay hands the same bytes to the same
 * seam. `attempts.jsonl` is the runner's own account of every HTTP attempt:
 * status, request id, the usage the envelope reported or `null` for unknown,
 * and the outcome — the figures a bill is reconciled against. The credential
 * is redacted by the runner and, as a second layer, by this file before any
 * summary is written.
 */

import { appendFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve, sep } from 'node:path';

import { EXIT_OK } from '../src/cli/exit-codes';
import { liveBudgetFrom, LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV } from '../src/cli/live-wiring';
import { ANTHROPIC_MESSAGES_ADAPTER } from '../src/pipeline/anthropic-messages';
import type { VerifyPaths } from '../src/cli/sign';
import { dispatch } from '../src/cli/verify';
import {
  assertLiveAgentsEnabled,
  createLiveAgentRunner,
  DEFAULT_TIMEOUT_MS,
  liveAgentsEnabled,
  MAX_RETRY_AFTER_MS,
  requireProviderAdapter,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  type AttemptRecord,
  type BudgetLedger,
  type LiveAgentRunner,
  type ProviderTransport,
  type RunBudget,
} from '../src/pipeline/live-runner';
import type { ProviderAdapter } from '../src/pipeline/provider-adapter';
import { TRANSCRIPT_ROOT, writeRunTranscript, type RunTranscript } from '../src/pipeline/transcript';
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
  /** The provider adapter. Refused before construction when absent. */
  adapter?: ProviderAdapter;
  /** Injected by offline tests. A genuine execution supplies none and is marked as such. */
  transport?: ProviderTransport;
  /** Fixed by tests; otherwise a timestamp with a random suffix. Not an identity of anything. */
  executionId?: string;
  /** Wall clock for timestamps in the diagnostics. Never used for identity. */
  now?: () => Date;
  /** After this many milliseconds the execution is cancelled: in-flight attempt aborted, waits ended, no further sends. */
  deadlineMs?: number;
  /** The fixture root the guard compares against. Defaults to the real one. */
  fixtureRoot?: string;
}

export interface LiveCaptureOutcome {
  status: 'completed' | 'failed';
  executionId: string;
  executionDir: string;
  /** The run identity, once orchestration derived it. `null` for an execution that did not complete. */
  runId: string | null;
  transcriptPath: string | null;
  resultPath: string | null;
  attemptsPath: string;
  summaryPath: string;
  /** HTTP attempts actually sent, retries included: the runner's `ledger.attemptsUsed`. */
  httpAttempts: number;
  /** Refusals that sent nothing: admission, budget, cancellation before send. */
  unsentEvents: number;
  /** Lines in `attempts.jsonl`: `httpAttempts + unsentEvents`. */
  recordsWritten: number;
  cancelled: boolean;
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

/**
 * One live execution, through the production command path, with everything it
 * produced filed together.
 *
 * The gates are checked **before anything is constructed or written**:
 * `liveCaptureConfigFrom` first, then `assertLiveAgentsEnabled`, then the
 * adapter, then the execution root — so an unauthorised or misdirected call
 * fails having contacted nothing and created nothing.
 */
export async function captureLiveRun(request: LiveCaptureRequest): Promise<LiveCaptureOutcome> {
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
  const attemptsPath = join(executionDir, 'attempts.jsonl');
  const summaryPath = join(executionDir, 'execution.json');
  const adapterName = `${adapter.identity.id}@${adapter.identity.version}`;
  const synthetic = request.transport !== undefined;

  const writeSummary = (fields: Record<string, unknown>): void => {
    const summary = {
      packId: request.packId,
      requirementId: request.requirementId,
      executionId,
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
    error = thrown instanceof Error
      ? { name: thrown.name, message: redact(thrown.message, config.apiKey) }
      : { name: 'UnknownFailure', message: redact(String(thrown), config.apiKey) };
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
  const resultPath = transcript !== null && existsSync(resultCandidate) ? resultCandidate : null;
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
    resultPath,
  });

  return { status, executionId, executionDir, runId: transcript?.runId ?? null, transcriptPath, resultPath, attemptsPath, summaryPath, httpAttempts, unsentEvents, recordsWritten, cancelled, ledger, error, exitCode, lines };
}

export interface FirstLiveCaseOptions {
  /** The environment the gates and the budget are read from. */
  env: NodeJS.ProcessEnv;
  /** Where the execution is filed. The agents suite passes `LIVE_EXECUTION_ROOT` under the engine root. */
  executionRoot: string;
  /** Injected by offline tests only. A genuine execution supplies none. */
  transport?: ProviderTransport;
  now?: () => Date;
  /** Defaults to `executionLifetimeMs` of the stated budget. */
  deadlineMs?: number;
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
  const deadlineMs = options.deadlineMs ?? executionLifetimeMs(liveCaptureConfigFrom(options.env).budget);
  return captureLiveRun({
    packId: FIRST_LIVE_CASE.packId,
    requirementId: FIRST_LIVE_CASE.requirementId,
    paths: {
      packDir: join(engineRoot, 'knowledge', FIRST_LIVE_CASE.packId),
      corpusDir: join(engineRoot, 'corpus'),
      verificationDir: join(engineRoot, 'verification'),
    },
    executionRoot: options.executionRoot,
    env: options.env,
    adapter: ANTHROPIC_MESSAGES_ADAPTER,
    deadlineMs,
    ...(options.transport === undefined ? {} : { transport: options.transport }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}
