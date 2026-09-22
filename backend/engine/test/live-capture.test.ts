/**
 * The deliberate S-002 capture route, proved offline (pre-live preparation).
 *
 * A genuine run is evidence only if what it produced survives together: the
 * transcript, the dossier it wrote and the per-attempt diagnostics that say
 * what each attempt did. The historical fixtures under
 * `test/verification-transcripts/` are filed by run identity, which is
 * deterministic — so two genuine executions of one question derive one
 * `runId`, and filing them there would overwrite. This harness files by
 * *execution* instead, under its own root, and never inside a fixture root.
 * A failed execution keeps its diagnostics and writes no transcript, so
 * incomplete evidence is never shaped like a completed recording.
 *
 * Two routes are proved here. The HTTP route runs under the suite-wide
 * offline guard with an injected transport; nothing can reach a provider. The
 * subscription route (B-CLI-ADAPTER) runs the real process transport against
 * `/bin/sh` dummies this file writes under a temp directory registered with
 * the process guard: one executable stands in for the pinned CLI, answering
 * `auth status --json` from a file and each role launch with a synthetic
 * `stream-json` stream built here from the same fixture outputs the HTTP
 * canned transport serves. Real children, real signals, real files — so what
 * is asserted about termination, redaction and ordering was observed, not
 * declared. No child outlives its test, and the last thing this file does is
 * look for one.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { VerifyPaths } from '../src/cli/sign';
import { LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV } from '../src/cli/live-wiring';
import { ANTHROPIC_MESSAGES_ADAPTER, ANTHROPIC_MESSAGES_IDENTITY } from '../src/pipeline/anthropic-messages';
import { CLAUDE_CODE_CLI_ADAPTER, CLAUDE_CODE_CLI_IDENTITY, STRUCTURED_OUTPUT_TOOL } from '../src/pipeline/claude-code-cli';
import type { LaunchFunction } from '../src/pipeline/claude-code-cli-transport';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { LIVE_AGENTS_ENV, LIVE_AGENTS_TOKEN, type ProviderHttpResponse, type ProviderTransport } from '../src/pipeline/live-runner';
import { parseRunTranscript, TRANSCRIPT_ROOT } from '../src/pipeline/transcript';
import {
  assertSupportedLifetime,
  captureLiveRun,
  captureRouteFor,
  CaptureRouteConflictError,
  DEFAULT_FIXTURE_ROOT,
  ExecutionExistsError,
  ExecutionRootError,
  executionLifetimeMs,
  FIRST_LIVE_CASE,
  GATE_REFUSED_ERROR_NAME,
  LIFETIME_MARGIN_MS,
  LIVE_EXECUTION_ROOT,
  LiveCaptureConfigError,
  liveCaptureConfigFrom,
  MAX_EXECUTION_LIFETIME_MS,
  MAX_TIMER_MS,
  MODEL_OUTPUT_PATHS,
  observeStream,
  parseStreamLines,
  REDACTED,
  runFirstLiveCase,
  runFirstSubscriptionCase,
  sanitiseStream,
  sanitiseStreamEvent,
  STREAM_REDACTED_KEYS,
  SUBSCRIPTION_CAPTURE_ENV,
  SUBSCRIPTION_CAPTURE_TOKEN,
  subscriptionCaptureSelected,
  SUBSCRIPTION_FORBIDDEN_ENV_NAMES,
  SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES,
  SUBSCRIPTION_ROLE_CONFIG,
  SubscriptionCaptureConfigError,
  SubscriptionEnvironmentError,
  SubscriptionRouteMismatchError,
  subscriptionForbiddenEnvNames,
  unconfirmedLaunches,
  UnsupportedLifetimeError,
  type LaunchLine,
} from './live-capture';
import { DEFAULT_TIMEOUT_MS, MAX_RETRY_AFTER_MS } from '../src/pipeline/live-runner';
import { offlineGuard } from './setup/offline-guard';
import { allowDummyDir } from './setup/process-guard';
import { adjudication, cannedAnthropicTransport, engineRoot, FIXTURE_TRANSCRIPT_ROOT, PACK_ID, prosecution, reading, READING_ONE, RESOLUTION } from './replay-fixtures';

const KEY = 'sk-ant-capture-0f0f0f';
const ENV = {
  [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN,
  [LIVE_ENDPOINT_ENV]: 'https://capture.invalid/v1/messages',
  [LIVE_API_KEY_ENV]: KEY,
  [LIVE_MAX_ATTEMPTS_ENV]: '27',
  [LIVE_MAX_INPUT_BYTES_ENV]: '4000000',
};

let scratch = '';
let savedToken: string | undefined;
beforeEach(() => {
  // Isolated and restored, never merely deleted: whatever the ambient shell
  // carried is put back exactly, so this file changes nothing outside itself.
  savedToken = process.env[LIVE_AGENTS_ENV];
  process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
  scratch = mkdtempSync(join(tmpdir(), 'live-capture-test-'));
  mkdirSync(join(scratch, 'source', 'requirement-versions'), { recursive: true });
  cpSync(join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`), join(scratch, 'source', 'requirement-versions', `${PACK_ID}.json`));
});
afterEach(() => {
  if (savedToken === undefined) delete process.env[LIVE_AGENTS_ENV];
  else process.env[LIVE_AGENTS_ENV] = savedToken;
  rmSync(scratch, { recursive: true, force: true });
});
const attemptsOf = (path: string) => readFileSync(path, 'utf8').trim().split('\n').filter((l) => l.length > 0).map((line) => JSON.parse(line) as Record<string, unknown>);
const summaryOf = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

const paths = (): VerifyPaths => ({ packDir: join(engineRoot, 'knowledge', PACK_ID), corpusDir: join(engineRoot, 'corpus'), verificationDir: join(scratch, 'source') });
const root = () => join(scratch, 'executions');
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const filesUnder = (dir: string): string[] => readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));

function capture(over: Partial<Parameters<typeof captureLiveRun>[0]> = {}) {
  return captureLiveRun({
    packId: FIRST_LIVE_CASE.packId,
    requirementId: FIRST_LIVE_CASE.requirementId,
    paths: paths(),
    executionRoot: root(),
    env: ENV,
    adapter: ANTHROPIC_MESSAGES_ADAPTER,
    transport: cannedAnthropicTransport(),
    ...over,
  });
}

describe('the first live case is declared once, and files outside every fixture root', () => {
  it('C6 — the case is csrd/CSRD-S-002 through anthropic-messages@1, and the execution root is under test/ but never the fixture root', () => {
    expect(FIRST_LIVE_CASE).toEqual({ packId: 'csrd', requirementId: 'CSRD-S-002' });
    expect(ANTHROPIC_MESSAGES_ADAPTER.identity).toEqual(ANTHROPIC_MESSAGES_IDENTITY);
    expect(LIVE_EXECUTION_ROOT.startsWith('test/') || LIVE_EXECUTION_ROOT.startsWith(join('test', ''))).toBe(true);
    expect(resolve(engineRoot, LIVE_EXECUTION_ROOT).startsWith(resolve(engineRoot, TRANSCRIPT_ROOT))).toBe(false);
    expect(resolve(engineRoot, TRANSCRIPT_ROOT).startsWith(resolve(engineRoot, LIVE_EXECUTION_ROOT))).toBe(false);
    // The S-002 requirement really is in the pack, so the case is not a name.
    const pack = JSON.parse(readFileSync(join(engineRoot, 'knowledge', PACK_ID, 'requirements.json'), 'utf8')) as { requirements?: Array<{ id: string }> } | Array<{ id: string }>;
    const ids = (Array.isArray(pack) ? pack : pack.requirements ?? []).map((r) => r.id);
    expect(ids).toContain(FIRST_LIVE_CASE.requirementId);
  });

  it('C5 — an execution root inside the fixture root, or the fixture root inside it, is refused before anything is written', async () => {
    // A disposable fixture tree stands in for the historical one, so a mutant
    // that drops the guard writes into scratch and never near the recordings.
    // The production default is asserted separately to be the real root.
    expect(DEFAULT_FIXTURE_ROOT).toBe(resolve(engineRoot, TRANSCRIPT_ROOT));
    expect(DEFAULT_FIXTURE_ROOT).toBe(resolve(FIXTURE_TRANSCRIPT_ROOT));
    const disposableFixtureRoot = join(scratch, 'fixtures', 'verification-transcripts');
    mkdirSync(disposableFixtureRoot, { recursive: true });
    for (const bad of [disposableFixtureRoot, join(disposableFixtureRoot, 'genuine'), join(scratch, 'fixtures'), scratch]) {
      await expect(capture({ executionRoot: bad, fixtureRoot: disposableFixtureRoot }), bad).rejects.toBeInstanceOf(ExecutionRootError);
    }
    expect(readdirSync(disposableFixtureRoot)).toEqual([]);
    expect(existsSync(join(scratch, 'csrd'))).toBe(false);
    // Positive control: a sibling of the disposable fixture root is accepted by the same guard.
    const beside = await capture({ executionRoot: join(scratch, 'beside'), fixtureRoot: disposableFixtureRoot });
    expect(beside.status).toBe('completed');
  });
});

describe('a completed execution keeps transcript, dossier and diagnostics together', () => {
  it('C1 — S-002 through the accepted adapter over a canned transport completes; the execution directory holds all three, none carries the credential, and the guard was never reached', async () => {
    const before = offlineGuard().calls.length;
    const outcome = await capture();
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.route).toBe('http');
    expect(outcome.executionDir.startsWith(join(root(), 'csrd', 'CSRD-S-002'))).toBe(true);
    expect(outcome.runId).toMatch(/^run-v1-[0-9a-f]{64}$/);
    expect(outcome.transcriptPath).toBe(join(outcome.executionDir, 'transcript', 'csrd', 'CSRD-S-002', `${outcome.runId}.json`));
    expect(outcome.resultPath).toBe(join(outcome.executionDir, 'verification', 'csrd', 'CSRD-S-002', 'verification-result.json'));
    for (const path of [outcome.transcriptPath!, outcome.resultPath!, outcome.attemptsPath, outcome.summaryPath]) expect(existsSync(path), path).toBe(true);
    const transcript = parseRunTranscript(readFileSync(outcome.transcriptPath!, 'utf8'), outcome.transcriptPath!);
    expect(transcript.requirementId).toBe('CSRD-S-002');
    expect(transcript.roles).toHaveLength(9);
    const attempts = readFileSync(outcome.attemptsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(attempts).toHaveLength(9);
    expect(attempts.map((a) => `${a['role']}[${a['index']}]`)).toEqual(['reader[0]', 'prosecutor[0]', 'prosecutor[1]', 'prosecutor[2]', 'prosecutor[3]', 'prosecutor[4]', 'prosecutor[5]', 'prosecutor[6]', 'adjudicator[0]']);
    expect(attempts.every((a) => a['outcome'] === 'completed' && a['status'] === 200 && typeof a['at'] === 'string')).toBe(true);
    const summary = JSON.parse(readFileSync(outcome.summaryPath, 'utf8')) as Record<string, unknown>;
    expect(summary).toMatchObject({ status: 'completed', route: 'http', attemptUnit: 'http_attempt', packId: 'csrd', requirementId: 'CSRD-S-002', runId: outcome.runId, synthetic: true, adapter: 'anthropic-messages@1', error: null, httpAttempts: 9, unsentEvents: 0, recordsWritten: 9 });
    expect(summary['ledger']).toMatchObject({ attemptsUsed: 9, maxRunAttempts: 27, attemptsRemaining: 18 });
    // The HTTP summary gained the two route fields and nothing else.
    expect(Object.keys(summary).sort()).toEqual(['adapter', 'attemptUnit', 'budget', 'cancelled', 'deadlineMs', 'error', 'executionId', 'exitCode', 'finishedAt', 'httpAttempts', 'ledger', 'lines', 'packId', 'recordsWritten', 'requirementId', 'resultPath', 'route', 'runId', 'startedAt', 'status', 'synthetic', 'transcriptPath', 'transport', 'unsentEvents']);
    expect(typeof summary['startedAt']).toBe('string');
    expect(typeof summary['finishedAt']).toBe('string');
    for (const file of filesUnder(outcome.executionDir)) expect(readFileSync(file, 'utf8'), file).not.toContain(KEY);
    expect(offlineGuard().calls.length).toBe(before);
  });

  it('C2 — a second execution of the same question derives the same runId and is filed beside the first, which stays byte-identical', async () => {
    const first = await capture();
    const firstFiles = new Map(filesUnder(first.executionDir).map((f) => [f, sha(f)]));
    const second = await capture();
    expect(second.status).toBe('completed');
    expect(second.runId).toBe(first.runId);
    expect(second.executionDir).not.toBe(first.executionDir);
    expect(second.transcriptPath).not.toBe(first.transcriptPath);
    for (const [file, digest] of firstFiles) expect(sha(file), file).toBe(digest);
    expect(readdirSync(join(root(), 'csrd', 'CSRD-S-002')).sort()).toEqual([first.executionId, second.executionId].sort());
    // The transcript bytes agree between the two executions: identity is the run's, not the execution's.
    expect(sha(first.transcriptPath!)).toBe(sha(second.transcriptPath!));
  });

  it('C7 — an execution id that already exists is refused rather than overwritten', async () => {
    const first = await capture({ executionId: 'fixed-id' });
    const digests = new Map(filesUnder(first.executionDir).map((f) => [f, sha(f)]));
    await expect(capture({ executionId: 'fixed-id' })).rejects.toBeInstanceOf(ExecutionExistsError);
    for (const [file, digest] of digests) expect(sha(file), file).toBe(digest);
  });
});

describe('a failed execution keeps its diagnostics and writes no transcript', () => {
  const failing = (status: number): ProviderHttpResponse => ({ status, headers: { 'request-id': `req_${status}` }, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: `boom ${KEY}` }, request_id: `req_${status}` }) });

  it('C3 — three 500s exhaust the reader; the summary names the failure with the credential redacted, the attempts are all there, and no transcript or result exists', async () => {
    const outcome = await capture({ transport: () => Promise.resolve(failing(500)) });
    expect(outcome.status).toBe('failed');
    expect(outcome.runId).toBeNull();
    expect(outcome.transcriptPath).toBeNull();
    expect(outcome.resultPath).toBeNull();
    expect(outcome.error?.name).toBe('ProviderHttpError');
    expect(outcome.error?.message).toMatch(/500.*api_error.*3 attempts/);
    expect(existsSync(join(outcome.executionDir, 'transcript'))).toBe(false);
    expect(existsSync(join(outcome.executionDir, 'verification', 'csrd', 'CSRD-S-002', 'verification-result.json'))).toBe(false);
    const attempts = readFileSync(outcome.attemptsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(attempts.map((a) => [a['role'], a['attempt'], a['status'], a['outcome']])).toEqual([['reader', 1, 500, 'retry_scheduled'], ['reader', 2, 500, 'retry_scheduled'], ['reader', 3, 500, 'refused']]);
    const summary = JSON.parse(readFileSync(outcome.summaryPath, 'utf8')) as Record<string, unknown>;
    expect(summary).toMatchObject({ status: 'failed', runId: null, error: { name: 'ProviderHttpError' } });
    for (const file of filesUnder(outcome.executionDir)) expect(readFileSync(file, 'utf8'), file).not.toContain(KEY);
  });

  it('C4 — a refusal in the third invocation fails the execution after two completed attempts; both are preserved, and the incomplete run is not shaped as a transcript', async () => {
    const canned = cannedAnthropicTransport();
    let calls = 0;
    const transport: ProviderTransport = (request, signal) => {
      calls += 1;
      if (calls === 3) return Promise.resolve({ status: 200, headers: { 'request-id': 'req_refusal' }, body: JSON.stringify({ type: 'message', content: [{ type: 'text', text: '{}' }], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'x', explanation: `no ${KEY}` }, usage: { input_tokens: 3, output_tokens: 1 } }) });
      return canned(request, signal);
    };
    const outcome = await capture({ transport });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('ProviderRefusalError');
    expect(outcome.transcriptPath).toBeNull();
    expect(existsSync(join(outcome.executionDir, 'transcript'))).toBe(false);
    const attempts = readFileSync(outcome.attemptsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(attempts.map((a) => [`${a['role']}[${a['index']}]`, a['outcome']])).toEqual([['reader[0]', 'completed'], ['prosecutor[0]', 'completed'], ['prosecutor[1]', 'projection_refused']]);
    expect(attempts[2]!['usage']).toEqual({ inputTokens: 3, outputTokens: 1, cacheCreationInputTokens: null, cacheReadInputTokens: null });
    for (const file of filesUnder(outcome.executionDir)) expect(readFileSync(file, 'utf8'), file).not.toContain(KEY);
  });

  it('C8 — the budget is enforced through the capture route: an attempt budget of two refuses the third invocation before sending, and the execution is failed with its two attempts kept', async () => {
    const canned = cannedAnthropicTransport();
    const outcome = await capture({ env: { ...ENV, [LIVE_MAX_ATTEMPTS_ENV]: '2' }, transport: canned });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('AttemptBudgetExhaustedError');
    expect(canned.calls).toHaveLength(2);
    const attempts = readFileSync(outcome.attemptsPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(attempts.map((a) => [a['runAttempt'], a['sent'], a['outcome']])).toEqual([[1, true, 'completed'], [2, true, 'completed'], [2, false, 'not_sent']]);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ httpAttempts: 2, unsentEvents: 1, recordsWritten: 3 });
    expect(summary['ledger']).toMatchObject({ maxRunAttempts: 2, attemptsUsed: 2, attemptsRemaining: 0 });
    expect(outcome.httpAttempts).toBe(outcome.ledger.attemptsUsed);
  });

  it('C9 — an input rejected at admission sends nothing: the summary and the ledger both say zero HTTP attempts, and the one unsent event is kept apart', async () => {
    const canned = cannedAnthropicTransport();
    const outcome = await capture({ env: { ...ENV, [LIVE_MAX_INPUT_BYTES_ENV]: '10' }, transport: canned });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('InputAdmissionError');
    expect(canned.calls).toHaveLength(0);
    expect(attemptsOf(outcome.attemptsPath).map((a) => [a['sent'], a['outcome']])).toEqual([[false, 'not_sent']]);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ httpAttempts: 0, unsentEvents: 1, recordsWritten: 1 });
    expect(summary['ledger']).toMatchObject({ attemptsUsed: 0, possiblyBilledAttempts: 0 });
    expect(outcome.ledger.attemptsUsed).toBe(0);
    expect(outcome.httpAttempts).toBe(0);
  });

  it('C10 — a retried invocation counts every send: summary and ledger agree on ten HTTP attempts for nine invocations', async () => {
    const canned = cannedAnthropicTransport();
    let calls = 0;
    const transport: ProviderTransport = (request, signal) => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ status: 503, headers: { 'request-id': 'req_503', 'retry-after': '0' }, body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'busy' }, request_id: 'req_503' }) });
      return canned(request, signal);
    };
    const outcome = await capture({ transport });
    expect(outcome.status).toBe('completed');
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts).toHaveLength(10);
    expect(attempts.slice(0, 2).map((a) => [a['attempt'], a['runAttempt'], a['outcome']])).toEqual([[1, 1, 'retry_scheduled'], [2, 2, 'completed']]);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ httpAttempts: 10, unsentEvents: 0, recordsWritten: 10 });
    // The canned envelopes carry usage, so only the 503 is possibly billed.
    expect(summary['ledger']).toMatchObject({ attemptsUsed: 10, possiblyBilledAttempts: 1, unknownUsageAttempts: 1 });
    expect(outcome.httpAttempts).toBe(outcome.ledger.attemptsUsed);
  });
});

describe('the opted-in route, proved offline: the same function the agents suite calls, over an injected transport, under the guard', () => {
  const routeEnv = (over: Record<string, string> = {}) => ({ ...ENV, ...over });

  it('R1 — the route completes for the first live case into the given execution root, with a lifetime derived from the stated budget', async () => {
    const before = offlineGuard().calls.length;
    const canned = cannedAnthropicTransport();
    const outcome = await runFirstLiveCase({ env: routeEnv(), executionRoot: root(), transport: canned });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.executionDir.startsWith(join(root(), 'csrd', 'CSRD-S-002'))).toBe(true);
    expect(canned.calls).toHaveLength(9);
    expect(summaryOf(outcome.summaryPath)['deadlineMs']).toBe(executionLifetimeMs({ maxRunAttempts: 27, maxInputBytesPerAttempt: 4_000_000 }));
    expect(executionLifetimeMs({ maxRunAttempts: 27, maxInputBytesPerAttempt: 1 })).toBe(27 * (DEFAULT_TIMEOUT_MS + MAX_RETRY_AFTER_MS) + 60_000);
    expect(offlineGuard().calls.length).toBe(before);
  });

  it('R2 — a delayed execution waits the provider\'s short delay through the production sleep and still completes', async () => {
    const canned = cannedAnthropicTransport();
    let calls = 0;
    const transport: ProviderTransport = (request, signal) => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ status: 429, headers: { 'request-id': 'req_429', 'retry-after': '1' }, body: JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' }, request_id: 'req_429' }) });
      return canned(request, signal);
    };
    const started = Date.now();
    const outcome = await runFirstLiveCase({ env: routeEnv(), executionRoot: root(), transport });
    expect(outcome.status).toBe('completed');
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
    expect(attemptsOf(outcome.attemptsPath)[0]).toMatchObject({ outcome: 'retry_scheduled', delayMs: 1000, status: 429 });
    expect(outcome.httpAttempts).toBe(10);
  });

  it('R3 — a cancelled execution stops at its deadline: the in-flight attempt is recorded as cancelled, nothing further is sent, and the summary says why', async () => {
    const hanging: ProviderTransport = (_request, signal) => new Promise((_, reject) => { signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }); });
    const started = Date.now();
    const outcome = await runFirstLiveCase({ env: routeEnv(), executionRoot: root(), transport: hanging, deadlineMs: 200 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('ExecutionCancelledError');
    expect(outcome.transcriptPath).toBeNull();
    expect(attemptsOf(outcome.attemptsPath).map((a) => [a['sent'], a['outcome'], a['possiblyBilled']])).toEqual([[true, 'cancelled', true]]);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', deadlineMs: 200, cancelled: true, httpAttempts: 1, unsentEvents: 0 });
    expect(summary['ledger']).toMatchObject({ attemptsUsed: 1, possiblyBilledAttempts: 1 });
  });

  it('R4 — the route refuses by name when the environment lacks a budget, and constructs nothing', async () => {
    const env = routeEnv();
    delete (env as Record<string, string>)[LIVE_MAX_ATTEMPTS_ENV];
    await expect(runFirstLiveCase({ env, executionRoot: root(), transport: cannedAnthropicTransport() })).rejects.toThrow(new RegExp(LIVE_MAX_ATTEMPTS_ENV));
    expect(existsSync(root())).toBe(false);
  });
});

describe('an execution lifetime must fit the timer range, outer margin included, or be refused by name before anything is written', () => {
  const perAttemptMs = DEFAULT_TIMEOUT_MS + MAX_RETRY_AFTER_MS;
  // The largest attempt budget whose derived lifetime plus the outer margin still fits a timer.
  const largestSupportedAttempts = Math.floor((MAX_TIMER_MS - LIFETIME_MARGIN_MS - 60_000) / perAttemptMs);

  it('L1 — the constants: the timer ceiling, and the lifetime ceiling below it by the outer margin', () => {
    expect(MAX_TIMER_MS).toBe(2 ** 31 - 1);
    expect(MAX_EXECUTION_LIFETIME_MS).toBe(MAX_TIMER_MS - LIFETIME_MARGIN_MS);
    expect(LIFETIME_MARGIN_MS).toBe(60_000);
    // The ordinary budget is far inside the range.
    expect(executionLifetimeMs({ maxRunAttempts: 27, maxInputBytesPerAttempt: 1 })).toBe(17_880_000);
    expect(() => assertSupportedLifetime(executionLifetimeMs({ maxRunAttempts: 27, maxInputBytesPerAttempt: 1 }))).not.toThrow();
    // The boundary, both sides.
    expect(() => assertSupportedLifetime(executionLifetimeMs({ maxRunAttempts: largestSupportedAttempts, maxInputBytesPerAttempt: 1 }))).not.toThrow();
    expect(() => assertSupportedLifetime(executionLifetimeMs({ maxRunAttempts: largestSupportedAttempts + 1, maxInputBytesPerAttempt: 1 }))).toThrow(UnsupportedLifetimeError);
    expect(() => assertSupportedLifetime(MAX_EXECUTION_LIFETIME_MS)).not.toThrow();
    for (const bad of [MAX_EXECUTION_LIFETIME_MS + 1, MAX_TIMER_MS, 2 ** 31, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertSupportedLifetime(bad), String(bad)).toThrow(UnsupportedLifetimeError);
      expect(() => assertSupportedLifetime(bad), String(bad)).toThrow(/timer|lifetime/);
    }
  });

  it('L2 — an accepted attempt budget whose derived lifetime overflows the timer is refused by name by the route, and no execution directory is created', async () => {
    const outcome = runFirstLiveCase({ env: { ...ENV, [LIVE_MAX_ATTEMPTS_ENV]: String(largestSupportedAttempts + 1) }, executionRoot: root(), transport: cannedAnthropicTransport() });
    await expect(outcome).rejects.toBeInstanceOf(UnsupportedLifetimeError);
    await expect(outcome).rejects.toThrow(new RegExp(String(MAX_EXECUTION_LIFETIME_MS)));
    expect(existsSync(root())).toBe(false);
    // Positive control: the largest supported budget derives a lifetime the route accepts and runs to completion.
    const accepted = await runFirstLiveCase({ env: { ...ENV, [LIVE_MAX_ATTEMPTS_ENV]: String(largestSupportedAttempts) }, executionRoot: root(), transport: cannedAnthropicTransport() });
    expect(accepted.status).toBe('completed');
    expect(summaryOf(accepted.summaryPath)['deadlineMs']).toBe(executionLifetimeMs({ maxRunAttempts: largestSupportedAttempts, maxInputBytesPerAttempt: 4_000_000 }));
  });

  it('L3 — an explicit deadline override is validated the same way: an overflowing, zero, negative or fractional deadline is refused by name with nothing written, and one at the ceiling is accepted', async () => {
    for (const bad of [MAX_EXECUTION_LIFETIME_MS + 1, 2 ** 31, 2 ** 32, 0, -5, 1.5]) {
      await expect(capture({ deadlineMs: bad }), String(bad)).rejects.toBeInstanceOf(UnsupportedLifetimeError);
    }
    expect(existsSync(root())).toBe(false);
    const atCeiling = await capture({ deadlineMs: MAX_EXECUTION_LIFETIME_MS });
    expect(atCeiling.status).toBe('completed');
    expect(atCeiling.cancelled).toBe(false);
    expect(summaryOf(atCeiling.summaryPath)['deadlineMs']).toBe(MAX_EXECUTION_LIFETIME_MS);
  });

  it('L4 — the cancellation reason written by the harness carries no credential, and keeps the deadline it names', async () => {
    const hanging: ProviderTransport = (_request, signal) => new Promise((_, reject) => { signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }); });
    const outcome = await runFirstLiveCase({ env: ENV, executionRoot: root(), transport: hanging, deadlineMs: 150 });
    expect(outcome.cancelled).toBe(true);
    const [record] = attemptsOf(outcome.attemptsPath);
    expect(record!['detail']).toContain('deadline of 150 ms');
    for (const file of filesUnder(outcome.executionDir)) expect(readFileSync(file, 'utf8'), file).not.toContain(KEY);
  });
});

// ===========================================================================
// The subscription route, against real dummies
// ===========================================================================

/** The subscription environment: the token, the route selector and the budget, and nothing that names a host or a credential. */
const SUB_ENV = {
  [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN,
  [SUBSCRIPTION_CAPTURE_ENV]: SUBSCRIPTION_CAPTURE_TOKEN,
  [LIVE_MAX_ATTEMPTS_ENV]: '27',
  [LIVE_MAX_INPUT_BYTES_ENV]: '4000000',
};
/** A model output that carries a sensitive pattern: an email, and beside it a marker with no pattern of its own, so a leak of the payload is found by either. */
const SENSITIVE_EMAIL = 'leak-probe@example.invalid';
const SENSITIVE_MARKER = 'MARKER-D3-PAYLOAD-5c5c5c';
const SENSITIVE_PAYLOAD = `${SENSITIVE_MARKER} contact ${SENSITIVE_EMAIL}`;
/** What the child inherits. The values are literals a sanitised stream must never carry. */
const INHERITED = { HOME: '/nonexistent/ds-capture-home', USER: 'ds-capture-user', PATH: '/usr/bin:/bin' } as const;
/** The gate's answer, with identifiers that must appear nowhere under the execution directory. */
const GATE_EMAIL = 'operator@example.invalid';
const GATE_ORG_ID = 'org_CAPTURE_SECRET_00019';
const GATE_ORG_NAME = 'Capture Org Secret Name';
const GATE_OK = { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max', email: GATE_EMAIL, orgId: GATE_ORG_ID, orgName: GATE_ORG_NAME };
/** Stream metadata the sanitiser must remove. */
const SESSION_ID = 'sess-SECRET-0001';
const UUID = 'uuid-SECRET-0001';
const ROLE_NAMES = ['reader[0]', 'prosecutor[0]', 'prosecutor[1]', 'prosecutor[2]', 'prosecutor[3]', 'prosecutor[4]', 'prosecutor[5]', 'prosecutor[6]', 'adjudicator[0]'];
/** Every value that must appear in no file of a subscription execution. */
const NEVER_FILED = [GATE_EMAIL, GATE_ORG_ID, GATE_ORG_NAME, SESSION_ID, UUID, INHERITED.HOME, INHERITED.USER];

let subScratch: string;
let recordDir: string;
let tempRoot: string;
let streamSrcDir: string;
let children: ChildProcess[];
const everyChildPid: number[] = [];

beforeEach(() => {
  subScratch = realpathSync(mkdtempSync(join(tmpdir(), 'ds-capture-sub-')));
  allowDummyDir(subScratch);
  recordDir = join(subScratch, 'record');
  tempRoot = join(subScratch, 'tmp');
  streamSrcDir = join(subScratch, 'streams-src');
  mkdirSync(recordDir);
  mkdirSync(tempRoot);
  mkdirSync(streamSrcDir);
  children = [];
});

afterEach(async () => {
  // Every child this test launched must be gone, group included — observed,
  // then cleaned, then asserted, in that order, so a leftover is a red test
  // and not a stray on the machine.
  const leftovers = children.filter((child) => child.pid !== undefined && groupAlive(child.pid)).map((child) => child.pid!);
  for (const pid of leftovers) {
    for (const target of [-pid, pid]) {
      try {
        process.kill(target, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  // A grandchild that left its group (`orphanAt`) is nobody's child here; a
  // case that went red before ending it must not strand a `sleep 600`.
  const grandchildPidFile = join(recordDir, 'grandchild.pid');
  if (existsSync(grandchildPidFile)) {
    const pid = Number(readFileSync(grandchildPidFile, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 1) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone, as the case asserted.
      }
    }
  }
  rmSync(subScratch, { recursive: true, force: true });
  expect(leftovers, 'children whose process group outlived the test').toEqual([]);
});

afterAll(() => {
  // A `sleep 600` whose process group is one of this file's children would
  // be a stray this file left. Other files' dummies may be alive at this
  // moment and are not this file's to judge, so the match is by group.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ds-capture-pgrep-')));
  allowDummyDir(dir);
  const script = join(dir, 'pgrep-groups.sh');
  writeFileSync(script, '#!/bin/sh\n/usr/bin/pgrep -f "sleep 600" | while read p; do /bin/ps -o pgid= -p "$p"; done\nexit 0\n', { mode: 0o700 });
  const scan = spawnSync(script, [], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  const groups = scan.stdout.split('\n').map((line) => Number(line.trim())).filter((n) => Number.isInteger(n) && n > 0);
  expect(groups.filter((pgid) => everyChildPid.includes(pgid)), 'sleep 600 processes in a group this file launched').toEqual([]);
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function groupAlive(pid: number): boolean {
  return alive(-pid);
}

type RoleName = 'reader' | 'prosecutor' | 'adjudicator';

/**
 * A synthetic `stream-json` stream for one role: init, one message carrying
 * one StructuredOutput call delivered in deltas, the CLI's assistant and user
 * restatements, a rate-limit event and a success result — the shape of the
 * accepted probe, with the fixture output as the call's input. It carries
 * metadata the sanitiser must remove (session, uuid, cwd), a USER literal in
 * a non-model string, and an email in the user event's `tool_use_result`,
 * so the sanitised copy has something to prove.
 */
function syntheticStream(role: RoleName, output: unknown, requestId: string): string {
  const model = DEFAULT_ROLE_CONFIG.models[role];
  const text = JSON.stringify(output);
  const deltas: string[] = [''];
  for (let i = 0; i < text.length; i += 700) deltas.push(text.slice(i, i + 700));
  const meta = { session_id: SESSION_ID, uuid: UUID };
  const events: unknown[] = [
    { type: 'system', subtype: 'init', apiKeySource: 'none', claude_code_version: '2.1.226', cwd: `${INHERITED.HOME}/work`, mcp_servers: [], model, output_style: `default (${INHERITED.USER})`, tools: [STRUCTURED_OUTPUT_TOOL], ...meta },
    { type: 'system', subtype: 'status', status: 'requesting', ...meta },
    { type: 'stream_event', event: { type: 'message_start', message: { id: 'msg_synth', model, role: 'assistant', type: 'message', content: [], usage: { input_tokens: 2, output_tokens: 1 } } }, ...meta },
    { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_synth', name: STRUCTURED_OUTPUT_TOOL, input: {} } }, ...meta },
    ...deltas.map((partial) => ({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: partial } }, ...meta })),
    { type: 'assistant', message: { id: 'msg_synth', model, role: 'assistant', type: 'message', content: [{ type: 'tool_use', id: 'toolu_synth', name: STRUCTURED_OUTPUT_TOOL, input: output }] }, request_id: requestId, timestamp: '2026-09-22T00:00:00.000Z', ...meta },
    { type: 'stream_event', event: { type: 'content_block_stop', index: 0 }, ...meta },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_synth', content: 'Structured output provided successfully' }] }, tool_use_result: `Structured output provided successfully; notified ${GATE_EMAIL}`, ...meta },
    { type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 82 } }, ...meta },
    { type: 'stream_event', event: { type: 'message_stop' }, ...meta },
    { type: 'rate_limit_event', rate_limit_info: { isUsingOverage: false, status: 'allowed', rateLimitType: 'five_hour' }, ...meta },
    { type: 'result', subtype: 'success', is_error: false, num_turns: 2, duration_ms: 1, result: text, structured_output: output, modelUsage: { [model]: {} }, usage: { input_tokens: 2, output_tokens: 82, cache_creation_input_tokens: 626, cache_read_input_tokens: 0 }, ...meta },
  ];
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

/** The per-role streams the dummy serves, one file per role or per prosecutor lens. */
function writeStreamSources(): void {
  writeFileSync(join(streamSrcDir, 'reader.jsonl'), syntheticStream('reader', reading(), 'req_synth_reader'));
  for (const lens of DEFAULT_ROLE_CONFIG.lenses) writeFileSync(join(streamSrcDir, `prosecutor-${lens}.jsonl`), syntheticStream('prosecutor', prosecution(lens), `req_synth_prosecutor_${lens}`));
  writeFileSync(join(streamSrcDir, 'adjudicator.jsonl'), syntheticStream('adjudicator', adjudication(), 'req_synth_adjudicator'));
  // The same two roles with the sensitive payload inside the model's own
  // output — a reading statement, an adjudication resolution — so the
  // sanitiser cannot redact it and the harness must withhold instead.
  writeFileSync(join(streamSrcDir, 'leak-reader.jsonl'), syntheticStream('reader', reading(`${READING_ONE} (${SENSITIVE_PAYLOAD})`), 'req_synth_reader'));
  const leaky = adjudication();
  leaky.adjudications[0]!.resolution = `${RESOLUTION} (${SENSITIVE_PAYLOAD})`;
  writeFileSync(join(streamSrcDir, 'leak-adjudicator.jsonl'), syntheticStream('adjudicator', leaky, 'req_synth_adjudicator'));
}

interface DummyBehaviour {
  /** Role launch (1-based, gate excluded) that exits 1 without answering. */
  failAt?: number;
  /** Role launch that writes `ready` and stalls: `sleep` dies on TERM; `ignore-term` traps TERM and loops; `leak-then-sleep` first writes the leak stream, then sleeps. */
  stallAt?: { launch: number; mode: 'sleep' | 'ignore-term' | 'leak-then-sleep' };
  /** Role launch that starts a `sleep 600` in its own group and exits without waiting for it. */
  leftoverAt?: number;
  /** Role launch (reader or adjudicator) that answers with the leak stream. */
  sensitiveAt?: number;
  /**
   * The launch — a role by 1-based count, or the gate — that starts a
   * session-detached grandchild holding the inherited stdout, then answers
   * and exits cleanly. The grandchild is outside the child's group, so the
   * transport cannot end it and its pipes never close: the launch is given
   * up on after the grace with `streamsClosed: false`.
   */
  orphanAt?: number | 'gate';
  /** The gate's answer. */
  gate?: Record<string, unknown>;
}

/**
 * The transport test's grandchild, verbatim: perl calls `setsid` (macOS has
 * no binary for it), writes its pid to `grandchild.pid` once it has left the
 * group, and sleeps holding stdout. The shell waits for the pid file so it
 * does not exit while perl is still inside the group — that would be a
 * leftover, a different rule.
 */
const ORPHAN_WRITER = [
  `/usr/bin/perl -e 'use POSIX; POSIX::setsid(); open(my $f, ">", "$ARGV[0]/grandchild.pid"); print $f $$; close $f; sleep 600' "$R" &`,
  'while [ ! -s "$R/grandchild.pid" ]; do /bin/sleep 0.01; done',
].join('\n');

/**
 * The one executable the transport launches for both the gate and the roles.
 * `auth status --json` answers from `gate.json`. A role launch counts itself,
 * reads its role off the `# Role:` heading of the system-prompt file it was
 * handed, its lens off stdin, and serves the matching stream — unless this
 * launch is the one told to fail or stall.
 */
function writeCaptureDummy(behaviour: DummyBehaviour = {}): { path: string; sha256: string; sizeBytes: number } {
  writeStreamSources();
  writeFileSync(join(recordDir, 'gate.json'), JSON.stringify(behaviour.gate ?? GATE_OK) + '\n');
  const hooks: string[] = [];
  if (behaviour.failAt !== undefined) hooks.push(`if [ "$n" = "${behaviour.failAt}" ]; then exit 1; fi`);
  if (behaviour.stallAt !== undefined) {
    const body =
      behaviour.stallAt.mode === 'sleep' ? ': > "$R/ready"\n  /bin/sleep 600'
      : behaviour.stallAt.mode === 'leak-then-sleep' ? '/bin/cat "$S/leak-$f.jsonl"\n  : > "$R/ready"\n  /bin/sleep 600'
      : 'trap "" TERM\n  : > "$R/ready"\n  while :; do /bin/sleep 1; done';
    hooks.push(`if [ "$n" = "${behaviour.stallAt.launch}" ]; then\n  ${body}\nfi`);
  }
  if (behaviour.leftoverAt !== undefined) hooks.push(`if [ "$n" = "${behaviour.leftoverAt}" ]; then /bin/sleep 600 & echo $! > "$R/leftover.pid"; fi`);
  if (behaviour.sensitiveAt !== undefined) hooks.push(`if [ "$n" = "${behaviour.sensitiveAt}" ]; then f="leak-$f"; fi`);
  if (typeof behaviour.orphanAt === 'number') hooks.push(`if [ "$n" = "${behaviour.orphanAt}" ]; then\n  ${ORPHAN_WRITER}\nfi`);
  const script = [
    '#!/bin/sh',
    `R=${JSON.stringify(recordDir)}`,
    `S=${JSON.stringify(streamSrcDir)}`,
    'if [ "$1" = "auth" ]; then',
    '  printf "GATE\\n" >> "$R/launches.log"',
    ...(behaviour.orphanAt === 'gate' ? [ORPHAN_WRITER] : []),
    '  /bin/cat "$R/gate.json"',
    '  exit 0',
    'fi',
    'n=$(/bin/cat "$R/count" 2>/dev/null || printf 0)',
    'n=$((n + 1))',
    'printf %s "$n" > "$R/count"',
    'printf "LAUNCH %s\\n" "$n" >> "$R/launches.log"',
    'pf=""; prev=""',
    'for a in "$@"; do',
    '  if [ "$prev" = "--system-prompt-file" ]; then pf="$a"; fi',
    '  prev="$a"',
    'done',
    'role=$(/usr/bin/sed -n "s/^# Role: //p" "$pf" | /usr/bin/head -n 1)',
    '/bin/cat > "$R/stdin-$n.txt"',
    'lens=$(/usr/bin/awk \'/^# Lens$/ { getline; getline; print; exit }\' "$R/stdin-$n.txt")',
    'case "$role" in',
    '  *reader*) f="reader" ;;',
    '  *prosecutor*) f="prosecutor-$lens" ;;',
    '  *adjudicator*) f="adjudicator" ;;',
    '  *) printf "unknown role %s\\n" "$role" >&2; exit 3 ;;',
    'esac',
    ...hooks,
    '/bin/cat "$S/$f.jsonl"',
    '',
  ].join('\n');
  const path = join(subScratch, 'claude-dummy.sh');
  writeFileSync(path, script, { mode: 0o700 });
  const bytes = readFileSync(path);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length };
}

/** The real `spawn`, with every child remembered for cleanup and for the leftover scan. */
const recordingLaunch: LaunchFunction = (file, args, options) => {
  const child = spawn(file, args, options);
  children.push(child);
  if (child.pid !== undefined) everyChildPid.push(child.pid);
  return child;
};

type CaptureOver = Partial<Parameters<typeof captureLiveRun>[0]>;
type SubOver = NonNullable<Parameters<typeof captureLiveRun>[0]['subscription']>;

function captureSubscription(pin: { path: string; sha256: string; sizeBytes: number }, over: CaptureOver = {}, sub: SubOver = {}) {
  return captureLiveRun({
    packId: FIRST_LIVE_CASE.packId,
    requirementId: FIRST_LIVE_CASE.requirementId,
    paths: paths(),
    executionRoot: root(),
    env: SUB_ENV,
    route: 'subscription',
    subscription: { executable: pin, launch: recordingLaunch, inheritedEnv: { ...INHERITED }, interrupts: new EventEmitter(), termGraceMs: 300, killGraceMs: 300, tempRoot, ...sub },
    ...over,
  });
}

/** Role launches the dummy counted, from its own log; the gate is excluded. */
function roleLaunchCount(): number {
  const log = join(recordDir, 'launches.log');
  if (!existsSync(log)) return 0;
  return readFileSync(log, 'utf8').split('\n').filter((line) => line.startsWith('LAUNCH')).length;
}

function gateLaunchCount(): number {
  const log = join(recordDir, 'launches.log');
  if (!existsSync(log)) return 0;
  return readFileSync(log, 'utf8').split('\n').filter((line) => line === 'GATE').length;
}

const launchLinesOf = (path: string): LaunchLine[] => readFileSync(path, 'utf8').trim().split('\n').filter((l) => l.length > 0).map((line) => JSON.parse(line) as LaunchLine);

async function awaitReady(): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!existsSync(join(recordDir, 'ready'))) {
    if (Date.now() > deadline) throw new Error('dummy never wrote ready');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function assertNothingFiled(dir: string, values: readonly string[]): void {
  for (const file of filesUnder(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const value of values) expect(text, `${file} carries ${value}`).not.toContain(value);
  }
}

/** Every file under `dir` whose bytes carry `value`: the recursive grep, relative to `dir`. */
function filesCarrying(dir: string, value: string): string[] {
  return filesUnder(dir).filter((file) => readFileSync(file, 'utf8').includes(value)).map((file) => file.slice(dir.length + 1));
}

/** The pid a dummy wrote to `recordDir/<name>`, once it is there. */
async function strayPid(name: string): Promise<number> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const text = existsSync(join(recordDir, name)) ? readFileSync(join(recordDir, name), 'utf8').trim() : '';
    if (/^\d+$/.test(text)) return Number(text);
    if (Date.now() > deadline) throw new Error(`dummy never wrote ${name}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const resultFileOf = (executionDir: string) => join(executionDir, 'verification', 'csrd', 'CSRD-S-002', 'verification-result.json');

/**
 * The grandchild an `orphanAt` dummy started: proved alive after the run —
 * the transport could not have reached it, and must not have claimed to —
 * then ended by the case, and proved gone.
 */
async function endGrandchild(): Promise<void> {
  const pid = await strayPid('grandchild.pid');
  expect(alive(pid), 'the grandchild the transport could not reach should still be alive after the run').toBe(true);
  process.kill(pid, 'SIGKILL');
  const deadline = Date.now() + 5000;
  while (alive(pid)) {
    if (Date.now() > deadline) throw new Error('the grandchild never died');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(alive(pid)).toBe(false);
}

describe('the subscription route completes over dummies, and files every launch', () => {
  it('S1 — nine role launches after one gate launch: transcript replayable, ledger in launches, HTTP attempts unknown, every child evidenced and nothing identifying filed', async () => {
    const pin = writeCaptureDummy();
    const outcome = await captureSubscription(pin);
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.route).toBe('subscription');
    expect(outcome.runId).toMatch(/^run-v1-[0-9a-f]{64}$/);
    expect(outcome.resultPath).toBe(join(outcome.executionDir, 'verification', 'csrd', 'CSRD-S-002', 'verification-result.json'));
    expect(existsSync(outcome.resultPath!)).toBe(true);
    expect(outcome.resultWithheld).toBe(false);
    const transcript = parseRunTranscript(readFileSync(outcome.transcriptPath!, 'utf8'), outcome.transcriptPath!);
    expect(transcript.roles).toHaveLength(9);
    expect(transcript.requirementId).toBe('CSRD-S-002');
    // The model's output does reach the filed evidence when it is clean: the
    // positive control for every "appears nowhere" assertion below.
    expect(filesCarrying(outcome.executionDir, READING_ONE).length).toBeGreaterThanOrEqual(3);
    // A different pipeline from the HTTP route's, by the adapter identity alone.
    expect(SUBSCRIPTION_ROLE_CONFIG).toEqual({ ...DEFAULT_ROLE_CONFIG, providerAdapter: CLAUDE_CODE_CLI_IDENTITY });
    const http = await capture({ executionId: 'http-control' });
    expect(http.runId).not.toBe(outcome.runId);

    // The dummy's own count agrees with the ledger's.
    expect(gateLaunchCount()).toBe(1);
    expect(roleLaunchCount()).toBe(9);
    expect(outcome.launches).toBe(9);
    expect(outcome.gateLaunches).toBe(1);
    expect(outcome.httpAttempts).toBeNull();

    // attempts.jsonl: one process-channel record per role, no HTTP status, usage from the CLI's report.
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts.map((a) => `${a['role']}[${a['index']}]`)).toEqual(ROLE_NAMES);
    for (const a of attempts) {
      expect(a).toMatchObject({ channel: 'process', status: null, outcome: 'completed', launched: true, sent: true, possiblyBilled: true, usageSource: 'cli_report' });
      expect((a['process'] as Record<string, unknown>)['exitCode']).toBe(0);
      expect(a['usage']).toEqual({ inputTokens: 2, outputTokens: 82, cacheCreationInputTokens: 626, cacheReadInputTokens: 0 });
    }

    // launches.jsonl: the gate first, then every role, argv with the placeholder and never a path.
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches.map((l) => l.kind)).toEqual(['gate', ...Array<'role'>(9).fill('role')]);
    expect(launches.map((l) => l.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(launches.slice(1).map((l) => `${l.role}[${l.index}]`)).toEqual(ROLE_NAMES);
    expect(launches[0]!.argv).toEqual(['auth', 'status', '--json']);
    for (const line of launches.slice(1)) {
      expect(line.argv[15]).toBe('--system-prompt-file');
      expect(line.argv[16]).toBe('<system-prompt-file>');
      expect(line.argv.join(' ')).not.toContain(tempRoot);
      expect(line.envNames).toEqual(['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK', 'CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_MAX_RETRIES', 'DISABLE_AUTOUPDATER', 'DISABLE_ERROR_REPORTING', 'DISABLE_TELEMETRY', 'HOME', 'MAX_STRUCTURED_OUTPUT_RETRIES', 'PATH', 'USER']);
      expect(line.facts).toMatchObject({ started: true, exitCode: 0, signal: null, termination: null, promptFileRemoved: true });
      expect(line.streamOmitted).toBeNull();
      expect(line.streamsClosed).toBe(true);
      expect(line.stream).toBe(join('streams', `role-${line.role}[${line.index}]-launch${line.seq}.sanitised.jsonl`));
      expect(line.observed).toMatchObject({ numTurns: 2, rateLimitEvents: 1, thinkingTokens: null });
    }
    expect(launches[0]!.stream).toBe(join('streams', 'gate-launch1.sanitised.jsonl'));
    expect(launches[0]!.observed).toBeNull();
    expect(readdirSync(outcome.streamsDir!).sort()).toEqual(['gate-launch1.sanitised.jsonl', 'role-adjudicator[0]-launch10.sanitised.jsonl', 'role-prosecutor[0]-launch3.sanitised.jsonl', 'role-prosecutor[1]-launch4.sanitised.jsonl', 'role-prosecutor[2]-launch5.sanitised.jsonl', 'role-prosecutor[3]-launch6.sanitised.jsonl', 'role-prosecutor[4]-launch7.sanitised.jsonl', 'role-prosecutor[5]-launch8.sanitised.jsonl', 'role-prosecutor[6]-launch9.sanitised.jsonl', 'role-reader[0]-launch2.sanitised.jsonl']);

    // execution.json: the plan's fields, and the gate as labels.
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({
      status: 'completed',
      route: 'subscription',
      attemptUnit: 'cli_launch',
      adapter: 'claude-code-cli@1',
      transport: 'injected-launch',
      synthetic: true,
      httpAttempts: null,
      launches: 9,
      gateLaunches: 1,
      unsentEvents: 0,
      recordsWritten: 9,
      cancelled: false,
      cancellationReason: null,
      interrupts: [],
      interruptedBy: null,
      terminationUnconfirmed: false,
      resultWithheld: false,
      error: null,
      runId: outcome.runId,
      unobserved: { outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000; wire-level max_tokens unobserved', thinking: 'CLI-decided for effort high; not asserted' },
      measured: { admittedLaunchInputBytes: 'UTF-8 length of the JSON launch description; upper bound on prompt-file + stdin bytes; not the provider request size' },
    });
    expect(summary['ledger']).toMatchObject({ attemptUnit: 'cli_launch', attemptsUsed: 9, launchesStarted: 9, httpAttemptsObserved: null, possiblyBilledAttempts: 9, maxRunAttempts: 27 });
    expect(summary['gate']).toMatchObject({ pass: true, reasons: [], fields: { loggedIn: 'true', subscriptionType: '"max"', apiKeySource: 'ABSENT', email: 'PRESENT', orgId: 'PRESENT', orgName: 'PRESENT' } });
    expect((summary['gate'] as { process: Record<string, unknown> }).process).toMatchObject({ started: true, exitCode: 0 });
    const observed = summary['cliObserved'] as Record<string, unknown>;
    expect(observed['requestIds']).toEqual(['req_synth_reader', ...DEFAULT_ROLE_CONFIG.lenses.map((lens) => `req_synth_prosecutor_${lens}`), 'req_synth_adjudicator']);
    expect(observed['numTurns']).toEqual(Array<number>(9).fill(2));
    expect(observed['thinkingTokens']).toEqual(Array<null>(9).fill(null));
    expect(observed['rateLimitEvents']).toBe(9);
    expect(observed['reportedUsage']).toHaveLength(9);
    expect((observed['reportedUsage'] as Array<Record<string, unknown>>)[0]).toEqual({ role: 'reader', index: 0, seq: 2, usage: { input_tokens: 2, output_tokens: 82, cache_creation_input_tokens: 626, cache_read_input_tokens: 0 } });
    expect(typeof summary['drainedAt']).toBe('string');
    expect(Date.parse(summary['finishedAt'] as string)).toBeGreaterThanOrEqual(Date.parse(summary['drainedAt'] as string));

    // Nothing identifying anywhere: the gate's identifiers, the stream metadata, the inherited values.
    assertNothingFiled(outcome.executionDir, NEVER_FILED);
    expect(readdirSync(tempRoot)).toEqual([]);
    for (const child of children) expect(alive(child.pid!)).toBe(false);
  });

  it('S2 — a sanitised stream redacts by key and by pattern outside the model output, and leaves the model output byte-for-byte', async () => {
    const pin = writeCaptureDummy();
    const outcome = await captureSubscription(pin);
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    const lines = readFileSync(join(outcome.streamsDir!, 'role-reader[0]-launch2.sanitised.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    const init = lines[0]!;
    expect(init).toMatchObject({ type: 'system', subtype: 'init', session_id: REDACTED, uuid: REDACTED, cwd: REDACTED, output_style: REDACTED, model: 'claude-opus-5', apiKeySource: 'none' });
    const user = lines.find((l) => l['type'] === 'user')!;
    expect(user['tool_use_result']).toBe(REDACTED);
    expect((user['message'] as { content: unknown[] }).content).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_synth', content: 'Structured output provided successfully' }]);
    const result = lines.at(-1)!;
    expect(result['structured_output']).toEqual(reading());
    expect(result['result']).toBe(JSON.stringify(reading()));
    expect(result['session_id']).toBe(REDACTED);
    const deltas = lines.filter((l) => (l['event'] as { type?: string } | undefined)?.type === 'content_block_delta').map((l) => ((l['event'] as { delta: { partial_json: string } }).delta.partial_json));
    expect(deltas.join('')).toBe(JSON.stringify(reading()));
    // The gate's stream is filed with its identifiers redacted by key.
    const gate = JSON.parse(readFileSync(join(outcome.streamsDir!, 'gate-launch1.sanitised.jsonl'), 'utf8').trim()) as Record<string, unknown>;
    expect(gate).toEqual({ ...GATE_OK, email: REDACTED, orgId: REDACTED, orgName: REDACTED });
  });
});

describe('the subscription route refuses before anything runs', () => {
  it('S3 — a gate that reports an API key source refuses the execution: no role launch, status failed, the refusal named, and the identifiers still nowhere', async () => {
    const pin = writeCaptureDummy({ gate: { ...GATE_OK, apiKeySource: 'ANTHROPIC_API_KEY' } });
    const outcome = await captureSubscription(pin);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe(GATE_REFUSED_ERROR_NAME);
    expect(outcome.error?.message).toContain('apiKeySource present');
    expect(gateLaunchCount()).toBe(1);
    expect(roleLaunchCount()).toBe(0);
    expect(outcome.launches).toBe(0);
    expect(outcome.gateLaunches).toBe(1);
    expect(attemptsOf(outcome.attemptsPath)).toEqual([]);
    expect(launchLinesOf(outcome.launchesPath!).map((l) => l.kind)).toEqual(['gate']);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', cancelled: false, launches: 0, gateLaunches: 1, gate: { pass: false, reasons: ['apiKeySource present ("ANTHROPIC_API_KEY"), required absent'] }, error: { name: GATE_REFUSED_ERROR_NAME } });
    expect(outcome.transcriptPath).toBeNull();
    assertNothingFiled(outcome.executionDir, NEVER_FILED);
  });

  it.each([
    LIVE_API_KEY_ENV,
    LIVE_ENDPOINT_ENV,
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_SIMPLE',
    'CLAUDE_CODE_SAFE_MODE',
  ])('S4 — %s in the environment refuses the route by name, never by value, and creates nothing', async (name) => {
    const value = 'FORBIDDEN-VALUE-7f7f7f7f';
    const pin = writeCaptureDummy();
    let caught: unknown;
    try {
      await captureSubscription(pin, { env: { ...SUB_ENV, [name]: value } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SubscriptionEnvironmentError);
    expect((caught as Error).message).toContain(name);
    expect((caught as Error).message).not.toContain(value);
    expect((caught as SubscriptionEnvironmentError).names).toEqual([name]);
    expect(existsSync(root())).toBe(false);
    expect(gateLaunchCount()).toBe(0);
  });

  it('S5 — presence is the key being set: an empty credential is still refused; the required variables are named when missing; the pure scan lists every offender sorted', async () => {
    const pin = writeCaptureDummy();
    await expect(captureSubscription(pin, { env: { ...SUB_ENV, [LIVE_API_KEY_ENV]: '' } })).rejects.toBeInstanceOf(SubscriptionEnvironmentError);
    const missing = { ...SUB_ENV } as Record<string, string>;
    delete missing[LIVE_MAX_ATTEMPTS_ENV];
    await expect(captureSubscription(pin, { env: missing })).rejects.toThrow(new RegExp(`missing \\[${LIVE_MAX_ATTEMPTS_ENV}\\]`));
    await expect(captureSubscription(pin, { env: missing })).rejects.toBeInstanceOf(SubscriptionCaptureConfigError);
    await expect(captureSubscription(pin, { env: { ...SUB_ENV, [LIVE_AGENTS_ENV]: 'yes' } })).rejects.toThrow(new RegExp(`missing \\[${LIVE_AGENTS_ENV}\\]`));
    // Without injected inherited values, the handed environment must carry them.
    await expect(captureSubscription(pin, {}, { inheritedEnv: undefined })).rejects.toThrow(/missing \[HOME, USER, PATH\]/);
    expect(existsSync(root())).toBe(false);
    expect(subscriptionForbiddenEnvNames({ ZZZ: '1', CLAUDE_CODE_USE_X: '', ANTHROPIC_MODEL: 'm', [LIVE_ENDPOINT_ENV]: 'e', CLAUDE_CODE_SAFE: 'not forbidden', HOME: '/h' })).toEqual(['ANTHROPIC_MODEL', 'CLAUDE_CODE_USE_X', LIVE_ENDPOINT_ENV]);
    expect(SUBSCRIPTION_FORBIDDEN_ENV_NAMES).toEqual([LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, 'CLAUDE_CODE_SIMPLE', 'CLAUDE_CODE_SAFE_MODE']);
    expect(SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES).toEqual(['ANTHROPIC_', 'CLAUDE_CODE_USE_']);
  });

  it('S6 — the route is its own: an HTTP adapter or an HTTP transport handed to it is refused by name with nothing written', async () => {
    const pin = writeCaptureDummy();
    await expect(captureSubscription(pin, { adapter: ANTHROPIC_MESSAGES_ADAPTER })).rejects.toBeInstanceOf(SubscriptionRouteMismatchError);
    await expect(captureSubscription(pin, { transport: cannedAnthropicTransport() })).rejects.toBeInstanceOf(SubscriptionRouteMismatchError);
    expect(existsSync(root())).toBe(false);
    expect(gateLaunchCount()).toBe(0);
  });
});

describe('the subscription route ends at the first failure, and accounts for it', () => {
  it('S7 — the third role launch exits 1: exactly three role launches, the error names the role, the lifetime was aborted for it, and no transcript', async () => {
    const pin = writeCaptureDummy({ failAt: 3 });
    const outcome = await captureSubscription(pin);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('CliExitError');
    expect(outcome.error?.message).toMatch(/prosecutor\[1\]/);
    expect(roleLaunchCount()).toBe(3);
    expect(outcome.launches).toBe(3);
    expect(attemptsOf(outcome.attemptsPath).map((a) => [`${a['role']}[${a['index']}]`, a['outcome'], a['launched']])).toEqual([['reader[0]', 'completed', true], ['prosecutor[0]', 'completed', true], ['prosecutor[1]', 'projection_refused', true]]);
    expect(launchLinesOf(outcome.launchesPath!).map((l) => [l.kind, l.role, l.index, l.facts.exitCode])).toEqual([['gate', null, null, 0], ['role', 'reader', 0, 0], ['role', 'prosecutor', 0, 0], ['role', 'prosecutor', 1, 1]]);
    expect(readdirSync(outcome.streamsDir!)).toHaveLength(4);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'role_failed:prosecutor[1]', launches: 3, gateLaunches: 1, recordsWritten: 3, terminationUnconfirmed: false });
    expect(outcome.cancelled).toBe(true);
    expect(outcome.transcriptPath).toBeNull();
    expect(existsSync(join(outcome.executionDir, 'transcript'))).toBe(false);
  });

  it('S8 — a deadline during the second role launch cancels it: facts retained in both files, the child gone, and the summary written after the drain', async () => {
    const pin = writeCaptureDummy({ stallAt: { launch: 2, mode: 'sleep' } });
    const started = Date.now();
    const outcome = await captureSubscription(pin, { deadlineMs: 2000 });
    expect(Date.now() - started).toBeLessThan(6000);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('ExecutionCancelledError');
    expect(outcome.cancelled).toBe(true);
    expect(outcome.cancellationReason).toBe('deadline of 2000 ms');
    expect(roleLaunchCount()).toBe(2);
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts.map((a) => [`${a['role']}[${a['index']}]`, a['outcome'], a['launched'], a['possiblyBilled']])).toEqual([['reader[0]', 'completed', true, true], ['prosecutor[0]', 'cancelled', true, true]]);
    const facts = attempts[1]!['process'] as Record<string, unknown>;
    expect(facts['termination']).toEqual({ forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true });
    expect(facts['signal']).toBe('SIGTERM');
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches).toHaveLength(3);
    const stalled = launches[2]!;
    expect([stalled.role, stalled.index]).toEqual(['prosecutor', 0]);
    expect(stalled.facts.termination?.signalsSent).toEqual(['SIGTERM']);
    expect(stalled.facts.termination?.childReaped).toBe(true);
    expect(existsSync(join(outcome.executionDir, stalled.stream!))).toBe(true);
    expect(alive(stalled.facts.pid!)).toBe(false);
    expect(groupAlive(stalled.facts.pid!)).toBe(false);
    // Ordering: the launch line was filed after the child exited; the drain
    // completed after that; the final summary was written after the drain.
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'deadline of 2000 ms', terminationUnconfirmed: false, launches: 2, deadlineMs: 2000 });
    expect(summary['drainedAt']).toEqual(expect.any(String));
    expect(Date.parse(summary['drainedAt'] as string)).toBeGreaterThanOrEqual(Date.parse(stalled.at));
    expect(Date.parse(summary['finishedAt'] as string)).toBeGreaterThanOrEqual(Date.parse(summary['drainedAt'] as string));
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  it('S9 — the evidence file made unwritable before the first role launch: EvidenceObservationFailedError under its own name, one attempt record, no further launch', async () => {
    const pin = writeCaptureDummy();
    const executionId = 'observer-failure';
    const launchesPath = join(root(), 'csrd', 'CSRD-S-002', executionId, 'launches.jsonl');
    let spawns = 0;
    const breaking: LaunchFunction = (file, args, options) => {
      spawns += 1;
      // The gate's line has been filed; the first role's cannot be.
      if (spawns === 2) {
        rmSync(launchesPath);
        mkdirSync(launchesPath);
      }
      return recordingLaunch(file, args, options);
    };
    const outcome = await captureSubscription(pin, { executionId }, { launch: breaking });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('EvidenceObservationFailedError');
    expect(outcome.error?.message).toMatch(/EISDIR/);
    expect(roleLaunchCount()).toBe(1);
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ role: 'reader', index: 0, channel: 'process', outcome: 'observation_failed', launched: true, possiblyBilled: true, status: null });
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'role_failed:reader[0]', launches: 1, gateLaunches: 1, recordsWritten: 1, error: { name: 'EvidenceObservationFailedError' } });
    expect(outcome.transcriptPath).toBeNull();
  });
});

describe('operator interrupts and unconfirmed termination', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)('S10 — a first %s aborts the lifetime and a second escalates through the transport: both recorded, the TERM-ignoring child reached twice then killed, reaped and gone', async (signal) => {
    const pin = writeCaptureDummy({ stallAt: { launch: 2, mode: 'ignore-term' } });
    const interrupts = new EventEmitter();
    const pending = captureSubscription(pin, {}, { interrupts });
    await awaitReady();
    // Two interrupts in one tick: the second's escalation reaches the child's
    // group before the abort path's own termination does, so the group sees
    // TERM from each — the one observation that distinguishes "escalated"
    // from "aborted once", because the abort path alone would KILL anyway.
    interrupts.emit(signal);
    interrupts.emit(signal);
    const outcome = await pending;
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('ExecutionCancelledError');
    expect(outcome.cancelled).toBe(true);
    expect(outcome.cancellationReason).toBe(`operator:${signal}`);
    expect(outcome.interruptedBy).toBe(signal);
    expect(outcome.interrupts.map((i) => [i.signal, i.action])).toEqual([[signal, 'abort'], [signal, 'escalate']]);
    expect(outcome.interrupts.every((i) => typeof i.at === 'string')).toBe(true);
    const stalled = launchLinesOf(outcome.launchesPath!)[2]!;
    const sent = stalled.facts.termination!.signalsSent;
    expect(sent.filter((s) => s === 'SIGTERM')).toHaveLength(2);
    expect(sent).toContain('SIGKILL');
    expect(stalled.facts.termination).toMatchObject({ forced: true, processGroupMade: true, childReaped: true, groupGone: true });
    expect(stalled.facts.signal).toBe('SIGKILL');
    expect(alive(stalled.facts.pid!)).toBe(false);
    expect(groupAlive(stalled.facts.pid!)).toBe(false);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ cancelled: true, cancellationReason: `operator:${signal}`, interruptedBy: signal, terminationUnconfirmed: false });
    expect((summary['interrupts'] as Array<{ action: string }>).map((i) => i.action)).toEqual(['abort', 'escalate']);
    expect(interrupts.listenerCount('SIGINT') + interrupts.listenerCount('SIGTERM')).toBe(0);
    expect(roleLaunchCount()).toBe(2);
  });

  it('S11 — a child the transport cannot see exit is given up on within its grace, and the summary says the termination is unconfirmed', async () => {
    const pin = writeCaptureDummy({ stallAt: { launch: 2, mode: 'sleep' } });
    let spawns = 0;
    // For the stalled launch, a facade over the real child that forwards
    // spawn, error and the streams but never 'exit' or 'close', and whose
    // kill() does nothing: the transport signals the real group, and the real
    // child dies, but nothing tells the transport so.
    const unseen: LaunchFunction = (file, args, options) => {
      spawns += 1;
      const real = recordingLaunch(file, args, options);
      if (spawns !== 3) return real;
      const facade = new EventEmitter() as EventEmitter & Record<string, unknown>;
      Object.defineProperty(facade, 'pid', { get: () => real.pid });
      facade['stdin'] = real.stdin;
      facade['stdout'] = real.stdout;
      facade['stderr'] = real.stderr;
      facade['exitCode'] = null;
      facade['signalCode'] = null;
      facade['kill'] = () => false;
      real.once('spawn', () => facade.emit('spawn'));
      real.on('error', (error) => facade.emit('error', error));
      return facade as unknown as ChildProcess;
    };
    const interrupts = new EventEmitter();
    const pending = captureSubscription(pin, {}, { launch: unseen, interrupts, termGraceMs: 150, killGraceMs: 150 });
    await awaitReady();
    interrupts.emit('SIGINT');
    const outcome = await pending;
    expect(outcome.status).toBe('failed');
    expect(outcome.cancelled).toBe(true);
    expect(outcome.interruptedBy).toBe('SIGINT');
    const stalled = launchLinesOf(outcome.launchesPath!)[2]!;
    expect(stalled.facts.termination).toMatchObject({ forced: true, childReaped: false });
    expect(stalled.facts.termination!.signalsSent).toContain('SIGTERM');
    expect(outcome.terminationUnconfirmed).toBe(true);
    expect(summaryOf(outcome.summaryPath)).toMatchObject({ terminationUnconfirmed: true, cancelled: true, cancellationReason: 'operator:SIGINT' });
    // The real child did die of the TERM the transport sent; only the observation was withheld.
    expect(groupAlive(stalled.facts.pid!)).toBe(false);
    // Positive control for `false`: the same field from the same seam in S8 and S10 is false when the exit was seen.
    expect(attemptsOf(outcome.attemptsPath)[1]).toMatchObject({ outcome: 'cancelled', launched: true });
  });
});

describe('D2 — an unconfirmed termination or a leftover never publishes a completed transcript', () => {
  it('T1 — the last role launch given up on with its streams still held (a facade that never emits close) is refused by the transport at once, not by the post-drain rule: the run never completes, no result is written, no transcript, every fact kept, terminationUnconfirmed still true', async () => {
    const pin = writeCaptureDummy();
    let spawns = 0;
    // For the last role launch, a facade over the real child that forwards
    // spawn, error, exit and the streams but never 'close': the real child
    // answers and exits, its group is gone, and the pipes are never seen to
    // close — the shape of a grandchild that left the group holding stdout.
    const unclosed: LaunchFunction = (file, args, options) => {
      spawns += 1;
      const real = recordingLaunch(file, args, options);
      if (spawns !== 10) return real;
      const facade = new EventEmitter() as EventEmitter & Record<string, unknown>;
      Object.defineProperty(facade, 'pid', { get: () => real.pid });
      facade['stdin'] = real.stdin;
      facade['stdout'] = real.stdout;
      facade['stderr'] = real.stderr;
      facade['exitCode'] = null;
      facade['signalCode'] = null;
      facade['kill'] = () => false;
      real.once('spawn', () => facade.emit('spawn'));
      real.on('error', (error) => facade.emit('error', error));
      real.once('exit', (code, sig) => facade.emit('exit', code, sig));
      return facade as unknown as ChildProcess;
    };
    const outcome = await captureSubscription(pin, {}, { launch: unclosed });
    // The adjudicator's launch is the ninth role launch and the last: the
    // transport refused it before projection, so the pipeline never completed
    // and no result was ever written. Before this rule the run completed and
    // the post-drain `TerminationUnconfirmed` rule withheld the result after
    // the fact; that rule stays as a backstop (proved alone below) but is no
    // longer what fires here.
    expect(roleLaunchCount()).toBe(9);
    expect(attemptsOf(outcome.attemptsPath).map((a) => a['outcome'])).toEqual([...Array<string>(8).fill('completed'), 'ambiguous']);
    expect(outcome.exitCode).toBeNull();
    expect(outcome.lines).toEqual([]);
    expect(outcome.cancelled).toBe(true);
    expect(outcome.cancellationReason).toBe('role_failed:adjudicator[0]');
    expect(existsSync(join(outcome.executionDir, 'transcript')), 'a transcript directory exists under an execution whose cleanup was unconfirmed').toBe(false);
    expect(outcome.transcriptPath).toBeNull();
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('ProviderAmbiguousFailureError');
    expect(outcome.error?.message).toContain('streams_not_closed');
    expect(outcome.error?.message).toMatch(/adjudicator\[0\]/);
    expect(outcome.terminationUnconfirmed).toBe(true);
    expect(outcome.runId).toBeNull();
    expect(outcome.resultPath).toBeNull();
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    // Nothing was written, so nothing was withheld: the field reports a deletion, and there was none.
    expect(outcome.resultWithheld).toBe(false);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', terminationUnconfirmed: true, resultWithheld: false, transcriptPath: null, resultPath: null, launches: 9, error: { name: 'ProviderAmbiguousFailureError' } });
    expect(summary['runId']).toBeNull();
    // The facts stayed: the tenth launch line says exactly what was and was not seen.
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches).toHaveLength(10);
    expect(launches.slice(0, 9).every((l) => l.streamsClosed === true)).toBe(true);
    expect(launches[9]).toMatchObject({ seq: 10, role: 'adjudicator', index: 0, streamsClosed: false });
    expect(launches[9]!.facts).toMatchObject({ exitCode: 0, termination: null });
    expect(existsSync(join(outcome.executionDir, launches[9]!.stream!))).toBe(true);
    expect(groupAlive(launches[9]!.facts.pid!)).toBe(false);
  });

  it('T2 — a role launch whose child leaves a sleep in its group is refused, not answered: failed, the error names leftover_processes_terminated, the leftover ended, the facts and the output kept, no transcript', async () => {
    const pin = writeCaptureDummy({ leftoverAt: 2 });
    const outcome = await captureSubscription(pin);
    const leftover = await strayPid('leftover.pid');
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.message).toContain('leftover_processes_terminated');
    expect(outcome.error?.message).toMatch(/prosecutor\[0\]/);
    expect(outcome.cancelled).toBe(true);
    expect(outcome.cancellationReason).toBe('role_failed:prosecutor[0]');
    expect(roleLaunchCount()).toBe(2);
    expect(outcome.launches).toBe(2);
    expect(outcome.transcriptPath).toBeNull();
    expect(existsSync(join(outcome.executionDir, 'transcript'))).toBe(false);
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts.map((a) => [`${a['role']}[${a['index']}]`, a['outcome'], a['launched'], a['possiblyBilled']])).toEqual([['reader[0]', 'completed', true, true], ['prosecutor[0]', 'ambiguous', true, true]]);
    expect((attempts[1]!['process'] as Record<string, unknown>)['termination']).toEqual({ forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true });
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches).toHaveLength(3);
    const refused = launches[2]!;
    expect([refused.role, refused.index]).toEqual(['prosecutor', 0]);
    expect(refused.facts.exitCode).toBe(0);
    expect(refused.facts.termination).toEqual({ forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true });
    expect(refused.streamsClosed).toBe(true);
    // The output the child wrote was filed as evidence; it was only not taken as the answer.
    expect(existsSync(join(outcome.executionDir, refused.stream!))).toBe(true);
    expect(alive(leftover)).toBe(false);
    expect(groupAlive(refused.facts.pid!)).toBe(false);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', terminationUnconfirmed: false, transcriptPath: null, resultPath: null, launches: 2, error: { name: 'ProviderAmbiguousFailureError' } });
    expect((summary['error'] as { message: string }).message).toContain('leftover_processes_terminated');
  });
});

describe('D2b — a launch given up on with its pipes still held is refused where it happens, not at finalisation', () => {
  // The defect: `streamsClosed: false` was acted on only after the whole run,
  // so a gate with unclosed pipes passed and the roles started, and a role
  // with unclosed pipes was projected as an answer and later roles launched.
  // Each case here is a real grandchild holding stdout from outside the
  // child's group; the launch count is asserted first, because the count is
  // what the defect changes. V4 is the control: the same dummy with no
  // grandchild completes with every launch's pipes seen to close.

  it('V1 — the gate with unclosed pipes refuses the execution: zero role launches, the refusal named, gate.reasons carries streams_not_closed, terminationUnconfirmed: true', async () => {
    const pin = writeCaptureDummy({ orphanAt: 'gate' });
    const outcome = await captureSubscription(pin);
    expect(roleLaunchCount(), 'role launches after a gate whose pipes were still held when it was given up on').toBe(0);
    expect(outcome.launches).toBe(0);
    expect(gateLaunchCount()).toBe(1);
    expect(outcome.gateLaunches).toBe(1);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe(GATE_REFUSED_ERROR_NAME);
    expect(outcome.error?.message).toContain('streams_not_closed');
    expect(outcome.gate).toMatchObject({ pass: false, reasons: ['streams_not_closed'], fields: { loggedIn: 'true', subscriptionType: '"max"', apiKeySource: 'ABSENT' } });
    expect(outcome.gate!.process).toMatchObject({ started: true, exitCode: 0, termination: null });
    expect(outcome.terminationUnconfirmed).toBe(true);
    expect(outcome.cancelled).toBe(false);
    expect(attemptsOf(outcome.attemptsPath)).toEqual([]);
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches.map((l) => l.kind)).toEqual(['gate']);
    expect(launches[0]).toMatchObject({ seq: 1, kind: 'gate', streamsClosed: false });
    expect(launches[0]!.facts).toMatchObject({ exitCode: 0, termination: null });
    expect(existsSync(join(outcome.executionDir, launches[0]!.stream!))).toBe(true);
    expect(groupAlive(launches[0]!.facts.pid!)).toBe(false);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', launches: 0, gateLaunches: 1, terminationUnconfirmed: true, transcriptPath: null, resultPath: null, gate: { pass: false, reasons: ['streams_not_closed'] }, error: { name: GATE_REFUSED_ERROR_NAME } });
    expect(outcome.transcriptPath).toBeNull();
    assertNothingFiled(outcome.executionDir, NEVER_FILED);
    await endGrandchild();
  });

  it('V2 — the reader with unclosed pipes: exactly one role launch, no later role, the error names streams_not_closed and reader[0], booked launched and possiblyBilled, no transcript, no result, terminationUnconfirmed: true', async () => {
    const pin = writeCaptureDummy({ orphanAt: 1 });
    const outcome = await captureSubscription(pin);
    expect(roleLaunchCount(), 'role launches after the reader was given up on with its pipes still held').toBe(1);
    expect(outcome.launches).toBe(1);
    expect(outcome.gateLaunches).toBe(1);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('ProviderAmbiguousFailureError');
    expect(outcome.error?.message).toContain('streams_not_closed');
    expect(outcome.error?.message).toMatch(/reader\[0\]/);
    expect(outcome.cancelled).toBe(true);
    expect(outcome.cancellationReason).toBe('role_failed:reader[0]');
    expect(outcome.terminationUnconfirmed).toBe(true);
    expect(outcome.transcriptPath).toBeNull();
    expect(existsSync(join(outcome.executionDir, 'transcript'))).toBe(false);
    expect(outcome.resultPath).toBeNull();
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts.map((a) => [`${a['role']}[${a['index']}]`, a['outcome'], a['launched'], a['possiblyBilled']])).toEqual([['reader[0]', 'ambiguous', true, true]]);
    expect(attempts[0]!['detail']).toContain('streams_not_closed');
    expect((attempts[0]!['process'] as Record<string, unknown>)['exitCode']).toBe(0);
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches.map((l) => [l.kind, l.role, l.index, l.streamsClosed])).toEqual([['gate', null, null, true], ['role', 'reader', 0, false]]);
    expect(launches[1]!.facts).toMatchObject({ exitCode: 0, signal: null, termination: null, promptFileRemoved: true });
    // The output the child wrote was filed as evidence; it was only not taken as the answer.
    expect(existsSync(join(outcome.executionDir, launches[1]!.stream!))).toBe(true);
    expect(groupAlive(launches[1]!.facts.pid!)).toBe(false);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'role_failed:reader[0]', launches: 1, gateLaunches: 1, recordsWritten: 1, terminationUnconfirmed: true, transcriptPath: null, resultPath: null, error: { name: 'ProviderAmbiguousFailureError' } });
    expect((summary['error'] as { message: string }).message).toContain('streams_not_closed');
    expect(summary['ledger']).toMatchObject({ attemptsUsed: 1, launchesStarted: 1, possiblyBilledAttempts: 1 });
    await endGrandchild();
  });

  it('V3 — a middle prosecutor with unclosed pipes: the role launch count equals its position and nothing runs after it', async () => {
    const pin = writeCaptureDummy({ orphanAt: 4 });
    const outcome = await captureSubscription(pin);
    expect(roleLaunchCount(), 'role launches after prosecutor[2] was given up on with its pipes still held').toBe(4);
    expect(outcome.launches).toBe(4);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('ProviderAmbiguousFailureError');
    expect(outcome.error?.message).toContain('streams_not_closed');
    expect(outcome.error?.message).toMatch(/prosecutor\[2\]/);
    expect(outcome.cancellationReason).toBe('role_failed:prosecutor[2]');
    expect(outcome.terminationUnconfirmed).toBe(true);
    expect(attemptsOf(outcome.attemptsPath).map((a) => [`${a['role']}[${a['index']}]`, a['outcome']])).toEqual([['reader[0]', 'completed'], ['prosecutor[0]', 'completed'], ['prosecutor[1]', 'completed'], ['prosecutor[2]', 'ambiguous']]);
    const launches = launchLinesOf(outcome.launchesPath!);
    // The three before it closed their pipes; only the fourth did not — the counterexample beside the claim.
    expect(launches.map((l) => [l.role, l.index, l.streamsClosed])).toEqual([[null, null, true], ['reader', 0, true], ['prosecutor', 0, true], ['prosecutor', 1, true], ['prosecutor', 2, false]]);
    expect(outcome.transcriptPath).toBeNull();
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    expect(summaryOf(outcome.summaryPath)).toMatchObject({ status: 'failed', launches: 4, terminationUnconfirmed: true, error: { name: 'ProviderAmbiguousFailureError' } });
    await endGrandchild();
  });

  it('V4 — positive control: the same dummy with no grandchild completes, nine role launches, every launch line streamsClosed: true, terminationUnconfirmed: false', async () => {
    const pin = writeCaptureDummy();
    const outcome = await captureSubscription(pin);
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(roleLaunchCount()).toBe(9);
    expect(outcome.launches).toBe(9);
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches).toHaveLength(10);
    expect(launches.map((l) => l.streamsClosed)).toEqual(Array<boolean>(10).fill(true));
    expect(outcome.terminationUnconfirmed).toBe(false);
    expect(outcome.resultWithheld).toBe(false);
    expect(outcome.error).toBeNull();
    expect(existsSync(join(recordDir, 'grandchild.pid'))).toBe(false);
    expect(summaryOf(outcome.summaryPath)).toMatchObject({ status: 'completed', terminationUnconfirmed: false, resultWithheld: false, error: null });
  });

  describe('the post-drain backstop, each fact alone through the pure rule', () => {
    // The transport now refuses every launch it gives up on, so no natural
    // caller reaches this rule with a clean error; it is the last line if one
    // ever does, and a rule nothing checks is a comment.
    const cleanFacts = { started: true, pid: 4242, exitCode: 0, signal: null, durationMs: 1, stdoutBytes: 1, stderrBytes: 0, promptFileBytes: null, stdinBytes: 0, promptFileRemoved: null, promptFileRemovalError: null, termination: null };
    const line = (over: Omit<Partial<LaunchLine>, 'facts'> & { facts?: Partial<LaunchLine['facts']> }): LaunchLine => ({
      at: '2026-09-22T00:00:00.000Z',
      seq: 1,
      kind: 'role',
      role: 'reader',
      index: 0,
      argv: [],
      envNames: [],
      streamsClosed: true,
      stream: null,
      streamOmitted: null,
      observed: null,
      ...over,
      facts: { ...cleanFacts, ...(over.facts ?? {}) },
    });
    const forced = { forced: true as const, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true as boolean | null };

    it('B1 — a clean role line and a forced termination fully observed are confirmed (the control)', () => {
      expect(unconfirmedLaunches([line({})])).toEqual([]);
      expect(unconfirmedLaunches([line({ facts: { termination: { ...forced } } })])).toEqual([]);
    });

    it('B2 — a gate whose pipes were not seen to close is unconfirmed, named as the gate', () => {
      expect(unconfirmedLaunches([line({ kind: 'gate', role: null, index: null, streamsClosed: false })])).toEqual(['launch 1 (gate): streamsClosed false']);
    });

    it('B3 — a role whose pipes were not seen to close is unconfirmed, named by role and index', () => {
      expect(unconfirmedLaunches([line({ seq: 5, role: 'prosecutor', index: 3, streamsClosed: false })])).toEqual(['launch 5 (prosecutor[3]): streamsClosed false']);
    });

    it('B4 — a child not seen reaped, and a group not seen gone, each alone', () => {
      expect(unconfirmedLaunches([line({ facts: { termination: { ...forced, childReaped: false } } })])).toEqual(['launch 1 (reader[0]): childReaped false']);
      expect(unconfirmedLaunches([line({ facts: { termination: { ...forced, groupGone: false } } })])).toEqual(['launch 1 (reader[0]): groupGone false']);
      expect(unconfirmedLaunches([line({ facts: { termination: { ...forced, groupGone: null } } })])).toEqual(['launch 1 (reader[0]): groupGone null']);
    });

    it('B5 — every fact of one launch is listed together, and only the unconfirmed launches appear', () => {
      expect(unconfirmedLaunches([line({}), line({ seq: 2, streamsClosed: false, facts: { termination: { ...forced, childReaped: false, groupGone: null } } }), line({ seq: 3 })])).toEqual(['launch 2 (reader[0]): childReaped false, groupGone null, streamsClosed false']);
    });
  });
});

describe('D3 — a sensitive model output fails the whole execution closed', () => {
  /** Everything the payload must be absent from, and the one place it may be named by kind only. */
  function assertWithheld(outcome: Awaited<ReturnType<typeof captureSubscription>>, seq: number, role: string, roleLaunches: number): void {
    // The payload is nowhere under the execution directory — neither the value the sanitiser can name nor the marker it cannot — before anything else is asked.
    expect(filesCarrying(outcome.executionDir, SENSITIVE_MARKER), 'files under the execution directory carrying the planted marker').toEqual([]);
    expect(filesCarrying(outcome.executionDir, SENSITIVE_EMAIL), 'files under the execution directory carrying the planted email').toEqual([]);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('SensitiveOutputWithheldError');
    expect(outcome.error?.message).toMatch(new RegExp(`launch ${seq}\\b`));
    expect(outcome.error?.message).toMatch(/model output at event\.delta contains an email pattern/);
    expect(outcome.cancelled).toBe(true);
    expect(outcome.cancellationReason).toBe(`role_failed:${role}`);
    expect(roleLaunchCount()).toBe(roleLaunches);
    expect(outcome.launches).toBe(roleLaunches);
    expect(outcome.transcriptPath).toBeNull();
    expect(outcome.runId).toBeNull();
    expect(existsSync(join(outcome.executionDir, 'transcript'))).toBe(false);
    expect(outcome.resultPath).toBeNull();
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    expect(outcome.resultWithheld).toBe(true);
    // One attempt record for the withheld launch, under the runner's own outcome.
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts).toHaveLength(roleLaunches);
    expect(attempts.at(-1)).toMatchObject({ outcome: 'observation_failed', launched: true, possiblyBilled: true });
    expect(attempts.at(-1)!['detail']).toContain('SensitiveOutputWithheldError');
    // The launch line was filed before the throw: facts, and the reason by path and kind.
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches).toHaveLength(seq);
    const withheld = launches[seq - 1]!;
    expect(withheld.seq).toBe(seq);
    expect(withheld.stream).toBeNull();
    expect(withheld.streamOmitted).toBe('model output at event.delta contains an email pattern');
    expect(withheld.facts.started).toBe(true);
    expect(readdirSync(outcome.streamsDir!)).toHaveLength(seq - 1);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', resultWithheld: true, transcriptPath: null, resultPath: null, error: { name: 'SensitiveOutputWithheldError' } });
  }

  it('U1 — in the reader\'s structured output: the first role fails the execution, one launch, no stream file, the payload filed nowhere', async () => {
    const pin = writeCaptureDummy({ sensitiveAt: 1 });
    const outcome = await captureSubscription(pin);
    assertWithheld(outcome, 2, 'reader[0]', 1);
    expect(outcome.error?.message).toMatch(/reader\[0\]/);
  });

  it('U2 — in the adjudicator\'s: the last role, where the pipeline would otherwise have completed, and still no transcript and no result', async () => {
    const pin = writeCaptureDummy({ sensitiveAt: 9 });
    const outcome = await captureSubscription(pin);
    assertWithheld(outcome, 10, 'adjudicator[0]', 9);
    expect(attemptsOf(outcome.attemptsPath).slice(0, 8).every((a) => a['outcome'] === 'completed')).toBe(true);
    expect(outcome.exitCode).toBeNull();
  });

  it('U3 — positive control: the same run with the same streams minus the payload completes, and the clean reading is filed in the stream, the transcript and the result', async () => {
    const pin = writeCaptureDummy();
    const outcome = await captureSubscription(pin);
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.resultWithheld).toBe(false);
    const carrying = filesCarrying(outcome.executionDir, READING_ONE);
    expect(carrying).toContain(join('streams', 'role-reader[0]-launch2.sanitised.jsonl'));
    expect(carrying).toContain(join('transcript', 'csrd', 'CSRD-S-002', `${outcome.runId}.json`));
    expect(carrying).toContain(join('verification', 'csrd', 'CSRD-S-002', 'verification-result.json'));
    expect(filesCarrying(outcome.executionDir, SENSITIVE_MARKER)).toEqual([]);
  });

  it('U4 — the partial stdout handed on an abort is held to the same rule: a stalled reader that had already written the payload is withheld, not merely cancelled', async () => {
    const pin = writeCaptureDummy({ stallAt: { launch: 1, mode: 'leak-then-sleep' } });
    const interrupts = new EventEmitter();
    const pending = captureSubscription(pin, {}, { interrupts });
    await awaitReady();
    interrupts.emit('SIGINT');
    const outcome = await pending;
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('SensitiveOutputWithheldError');
    expect(outcome.interruptedBy).toBe('SIGINT');
    expect(outcome.cancellationReason).toBe('operator:SIGINT');
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches).toHaveLength(2);
    expect(launches[1]).toMatchObject({ seq: 2, role: 'reader', stream: null, streamOmitted: 'model output at event.delta contains an email pattern' });
    expect(launches[1]!.facts.termination?.signalsSent).toContain('SIGTERM');
    expect(readdirSync(outcome.streamsDir!)).toEqual(['gate-launch1.sanitised.jsonl']);
    expect(attemptsOf(outcome.attemptsPath).map((a) => a['outcome'])).toEqual(['observation_failed']);
    expect(filesCarrying(outcome.executionDir, SENSITIVE_EMAIL)).toEqual([]);
    expect(filesCarrying(outcome.executionDir, SENSITIVE_MARKER)).toEqual([]);
    expect(outcome.transcriptPath).toBeNull();
    expect(outcome.resultWithheld).toBe(true);
    expect(groupAlive(launches[1]!.facts.pid!)).toBe(false);
  });
});

describe('D5 — the HTTP and subscription routes are selected by the environment, and exclude each other', () => {
  const SELECTOR = SUBSCRIPTION_CAPTURE_ENV;
  const subEnvWithoutSelector = (): Record<string, string> => {
    const env = { ...SUB_ENV } as Record<string, string>;
    delete env[SELECTOR];
    return env;
  };

  it('E0 — the selector is DATASTRATA_SUBSCRIPTION_CAPTURE with the exact value 1, and the route is derived from it', () => {
    expect(SELECTOR).toBe('DATASTRATA_SUBSCRIPTION_CAPTURE');
    expect(SUBSCRIPTION_CAPTURE_TOKEN).toBe('1');
    expect(subscriptionCaptureSelected({})).toBe(false);
    expect(subscriptionCaptureSelected({ [SELECTOR]: 'true' })).toBe(false);
    expect(subscriptionCaptureSelected({ [SELECTOR]: '1' })).toBe(true);
    expect(captureRouteFor(ENV)).toBe('http');
    expect(captureRouteFor(SUB_ENV)).toBe('subscription');
    expect(ENV).not.toHaveProperty(SELECTOR);
  });

  it('E1 — a subscription-only environment with the route omitted takes the subscription path: no HTTP configuration is read, the guard is never reached, and the dummies ran', async () => {
    // The HTTP configuration would refuse this environment outright — so if
    // the HTTP path had been entered, the outcome below could not exist.
    expect(() => liveCaptureConfigFrom(SUB_ENV)).toThrow(LiveCaptureConfigError);
    const before = offlineGuard().calls.length;
    const pin = writeCaptureDummy();
    const outcome = await captureSubscription(pin, { route: undefined });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.route).toBe('subscription');
    expect(summaryOf(outcome.summaryPath)).toMatchObject({ route: 'subscription', attemptUnit: 'cli_launch', adapter: 'claude-code-cli@1', transport: 'injected-launch', launches: 9, gateLaunches: 1, httpAttempts: null });
    expect(gateLaunchCount()).toBe(1);
    expect(roleLaunchCount()).toBe(9);
    expect(offlineGuard().calls.length).toBe(before);
  });

  it('E2 — positive control: an HTTP environment without the selector and the route omitted takes the HTTP path as before', async () => {
    const canned = cannedAnthropicTransport();
    const outcome = await capture({ transport: canned });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.route).toBe('http');
    expect(summaryOf(outcome.summaryPath)).toMatchObject({ route: 'http', attemptUnit: 'http_attempt', adapter: 'anthropic-messages@1' });
    expect(canned.calls).toHaveLength(9);
    expect(gateLaunchCount()).toBe(0);
  });

  it('E3 — the CLI adapter with the route omitted and no selector is refused by name on the HTTP path, and nothing is created', async () => {
    const canned = cannedAnthropicTransport();
    await expect(capture({ adapter: CLAUDE_CODE_CLI_ADAPTER, transport: canned })).rejects.toBeInstanceOf(CaptureRouteConflictError);
    await expect(capture({ adapter: CLAUDE_CODE_CLI_ADAPTER, transport: canned })).rejects.toThrow(/process channel|claude-code-cli@1/);
    // The same refusal by identity alone, for an adapter that carries the CLI identity over an HTTP channel.
    await expect(capture({ adapter: { ...ANTHROPIC_MESSAGES_ADAPTER, identity: { ...CLAUDE_CODE_CLI_IDENTITY } }, transport: canned })).rejects.toBeInstanceOf(CaptureRouteConflictError);
    // And by channel alone: a process-channel adapter under an identity the CLI rule does not name is
    // still refused, naming the channel, so each of the two rules is known to decide on its own.
    await expect(capture({ adapter: { ...CLAUDE_CODE_CLI_ADAPTER, identity: { id: "other-process-adapter", version: "1" } }, transport: canned })).rejects.toThrow(/process channel/);
    expect(canned.calls).toHaveLength(0);
    expect(existsSync(root())).toBe(false);
  });

  it('E4 — route http with the selector set contradicts the environment: refused by name, nothing created', async () => {
    const canned = cannedAnthropicTransport();
    for (const value of ['1', 'yes']) {
      await expect(capture({ route: 'http', env: { ...ENV, [SELECTOR]: value }, transport: canned }), value).rejects.toBeInstanceOf(CaptureRouteConflictError);
    }
    // And with the route omitted, a selector that is present but not exactly 1 derives http and is then refused on the HTTP path.
    await expect(capture({ env: { ...ENV, [SELECTOR]: 'yes' }, transport: canned })).rejects.toBeInstanceOf(CaptureRouteConflictError);
    expect(canned.calls).toHaveLength(0);
    expect(existsSync(root())).toBe(false);
  });

  it('E5 — route subscription without the selector contradicts the environment: refused by name, no gate launch, nothing created', async () => {
    const pin = writeCaptureDummy();
    await expect(captureSubscription(pin, { env: subEnvWithoutSelector() })).rejects.toBeInstanceOf(CaptureRouteConflictError);
    await expect(captureSubscription(pin, { env: subEnvWithoutSelector() })).rejects.toThrow(new RegExp(SELECTOR));
    // The route functions the agents suite calls derive the same answer.
    await expect(runFirstSubscriptionCase({ env: subEnvWithoutSelector(), executionRoot: root(), subscription: { executable: pin, launch: recordingLaunch, inheritedEnv: { ...INHERITED }, interrupts: new EventEmitter(), tempRoot } })).rejects.toBeInstanceOf(CaptureRouteConflictError);
    expect(gateLaunchCount()).toBe(0);
    expect(existsSync(root())).toBe(false);
  });

  it('E6 — an HTTP adapter with the selector set is refused by name whichever way it arrives, and nothing is created', async () => {
    const pin = writeCaptureDummy();
    const canned = cannedAnthropicTransport();
    // Route omitted, subscription-only environment: the derived route is subscription and the adapter is not its own.
    await expect(captureSubscription(pin, { route: undefined, adapter: ANTHROPIC_MESSAGES_ADAPTER })).rejects.toBeInstanceOf(SubscriptionRouteMismatchError);
    // Route omitted, HTTP environment plus the selector: the derived route is subscription and the endpoint and credential are refused by name.
    await expect(capture({ env: { ...ENV, [SELECTOR]: '1' }, transport: canned })).rejects.toBeInstanceOf(SubscriptionEnvironmentError);
    // Route http stated: the contradiction itself.
    await expect(capture({ route: 'http', env: { ...ENV, [SELECTOR]: '1' }, transport: canned })).rejects.toBeInstanceOf(CaptureRouteConflictError);
    // runFirstLiveCase under a subscription environment takes the subscription route, so an injected HTTP transport is refused there too.
    await expect(runFirstLiveCase({ env: SUB_ENV, executionRoot: root(), transport: canned })).rejects.toBeInstanceOf(SubscriptionRouteMismatchError);
    expect(canned.calls).toHaveLength(0);
    expect(gateLaunchCount()).toBe(0);
    expect(existsSync(root())).toBe(false);
  });
});

describe('the stream sanitiser, rule by rule', () => {
  const literals = [{ name: 'HOME', value: INHERITED.HOME }, { name: 'USER', value: INHERITED.USER }];

  it('P1 — redacted keys, email patterns and inherited literals are replaced outside the model output; everything else is kept', () => {
    const { event, omitted } = sanitiseStreamEvent(
      { type: 'system', session_id: 'a', uuid: 'b', cwd: 'c', email: 'd', orgId: 'e', orgName: 'f', nested: { session_id: 'g', note: `home at ${INHERITED.HOME}`, who: INHERITED.USER, contact: 'x.y+z@example.invalid', fine: 'kept', n: 3, list: ['ok', 'a@b.cd'] } },
      literals,
    );
    expect(omitted).toBeNull();
    expect(event).toEqual({ type: 'system', session_id: REDACTED, uuid: REDACTED, cwd: REDACTED, email: REDACTED, orgId: REDACTED, orgName: REDACTED, nested: { session_id: REDACTED, note: REDACTED, who: REDACTED, contact: REDACTED, fine: 'kept', n: 3, list: ['ok', REDACTED] } });
    expect([...STREAM_REDACTED_KEYS].sort()).toEqual(['cwd', 'email', 'orgId', 'orgName', 'session_id', 'uuid']);
  });

  it('P2 — the five model-output subtrees are returned untouched, even when they carry a redacted key name', () => {
    expect(MODEL_OUTPUT_PATHS).toEqual(['event.delta', 'event.content_block', 'message.content', 'result', 'structured_output']);
    const delta = { type: 'input_json_delta', partial_json: '{"session_id":"kept","cwd":"kept"}' };
    const block = { type: 'tool_use', name: 'StructuredOutput', input: { uuid: 'kept' } };
    const { event } = sanitiseStreamEvent({ type: 'stream_event', session_id: 'x', event: { type: 'content_block_delta', delta, content_block: block } }, literals);
    expect(event).toEqual({ type: 'stream_event', session_id: REDACTED, event: { type: 'content_block_delta', delta, content_block: block } });
    const content = [{ type: 'text', text: 'the session_id was kept' }];
    expect(sanitiseStreamEvent({ type: 'assistant', message: { content, model: 'm' } }, literals).event).toEqual({ type: 'assistant', message: { content, model: 'm' } });
    const output = { session_id: 'kept', cwd: 'kept' };
    expect(sanitiseStreamEvent({ type: 'result', result: JSON.stringify(output), structured_output: output, uuid: 'u' }, literals).event).toEqual({ type: 'result', result: JSON.stringify(output), structured_output: output, uuid: REDACTED });
  });

  it('P3 — a sensitive pattern inside a model-output subtree withholds the whole stream and names the path and the kind, never the value', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ type: 'result', structured_output: { statement: `see ${INHERITED.USER}` } }, 'model output at structured_output contains a USER literal'],
      [{ type: 'result', result: `wrote ${INHERITED.HOME}/x` }, 'model output at result contains a HOME literal'],
      [{ type: 'assistant', message: { content: [{ text: 'mail someone@example.invalid' }] } }, 'model output at message.content contains an email pattern'],
      [{ type: 'stream_event', event: { delta: { partial_json: '"a@b.cd"' } } }, 'model output at event.delta contains an email pattern'],
    ];
    for (const [event, reason] of cases) {
      const sanitised = sanitiseStreamEvent(event, literals);
      expect(sanitised.omitted).toBe(reason);
      expect(sanitised.omitted).not.toContain(INHERITED.USER);
      expect(sanitised.omitted).not.toContain('example.invalid');
    }
    const parsed = parseStreamLines('{"type":"system","cwd":"c"}\n{"type":"result","structured_output":{"x":"a@b.cd"}}\n');
    expect(sanitiseStream(parsed, literals)).toEqual({ lines: [], omitted: 'model output at structured_output contains an email pattern' });
    // Positive control: the same stream without the pattern is filed in full.
    const clean = parseStreamLines('{"type":"system","cwd":"c"}\n{"type":"result","structured_output":{"x":"y"}}\n');
    expect(sanitiseStream(clean, literals)).toEqual({ lines: ['{"type":"system","cwd":"[REDACTED]"}', '{"type":"result","structured_output":{"x":"y"}}'], omitted: null });
  });

  it('P4 — a line that is not a JSON object is filed by size; empty literals match nothing', () => {
    const parsed = parseStreamLines('not json at all\n\n[1,2]\n"str"\n{"type":"x"}\n');
    expect(parsed.map((p) => [p.event === null, p.bytes])).toEqual([[true, 15], [true, 5], [true, 5], [false, 12]]);
    expect(sanitiseStream(parsed, literals).lines).toEqual(['{"unparsed":true,"bytes":15}', '{"unparsed":true,"bytes":5}', '{"unparsed":true,"bytes":5}', '{"type":"x"}']);
    expect(sanitiseStreamEvent({ a: 'anything' }, [{ name: 'USER', value: '' }]).event).toEqual({ a: 'anything' });
  });

  it('P5 — the observation reads request ids, turns, rate-limit events and usage, and a thinking figure only when reported', () => {
    const parsed = parseStreamLines([
      JSON.stringify({ type: 'assistant', request_id: 'req_1' }),
      'garbage',
      JSON.stringify({ type: 'rate_limit_event' }),
      JSON.stringify({ type: 'rate_limit_event' }),
      JSON.stringify({ type: 'assistant', request_id: 'req_2' }),
      JSON.stringify({ type: 'result', num_turns: 4, usage: { input_tokens: 1, thinking_tokens: 7 } }),
    ].join('\n'));
    expect(observeStream(parsed)).toEqual({ requestIds: ['req_1', 'req_2'], numTurns: 4, thinkingTokens: 7, rateLimitEvents: 2, reportedUsage: { input_tokens: 1, thinking_tokens: 7 } });
    expect(observeStream(parseStreamLines(JSON.stringify({ type: 'result', num_turns: '4', usage: { input_tokens: 1 } })))).toEqual({ requestIds: [], numTurns: null, thinkingTokens: null, rateLimitEvents: 0, reportedUsage: { input_tokens: 1 } });
    expect(observeStream([])).toEqual({ requestIds: [], numTurns: null, thinkingTokens: null, rateLimitEvents: 0, reportedUsage: null });
  });
});

describe('the first subscription case, the function the agents suite calls', () => {
  it('F1 — runs the first live case over the subscription route with a lifetime derived from the launch budget, and refuses a forbidden environment before anything exists', async () => {
    const pin = writeCaptureDummy();
    const outcome = await runFirstSubscriptionCase({ env: SUB_ENV, executionRoot: root(), subscription: { executable: pin, launch: recordingLaunch, inheritedEnv: { ...INHERITED }, interrupts: new EventEmitter(), termGraceMs: 300, killGraceMs: 300, tempRoot } });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.route).toBe('subscription');
    expect(summaryOf(outcome.summaryPath)['deadlineMs']).toBe(executionLifetimeMs({ maxRunAttempts: 27, maxInputBytesPerAttempt: 4_000_000 }));
    await expect(runFirstSubscriptionCase({ env: { ...SUB_ENV, ANTHROPIC_API_KEY: 'k' }, executionRoot: join(scratch, 'other'), subscription: { executable: pin, launch: recordingLaunch, inheritedEnv: { ...INHERITED }, interrupts: new EventEmitter(), tempRoot } })).rejects.toBeInstanceOf(SubscriptionEnvironmentError);
    expect(existsSync(join(scratch, 'other'))).toBe(false);
  });
});
