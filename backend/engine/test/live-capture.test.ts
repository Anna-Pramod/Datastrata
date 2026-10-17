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
 *
 * The route runs `claude-code-cli@2` by default (the Opus 5.5 migration), so
 * a second dummy stands in for its pinned 2.1.295 executable: the same script
 * over streams `@2`'s projection accepts and a gate answer of the shape
 * 2.1.280's strings showed, every value a literal written here rather than
 * read off the `@2` profile. The `@1` cases
 * pass `@1` explicitly, over an injected launch, which is the only way the
 * route still runs it.
 *
 * Every `@2` `execution.json` carries D-9's trust block (Task 5c). Every
 * `@2` execution a case here files has its whole block asserted (Task 5c
 * review repair R5; a refusal that creates nothing files none), and the
 * block's rules are also proved directly, through `trustOf`, over records
 * the harness's own composition assembles from the fixtures, with inputs no
 * execution produces: a check that only ever met the harness's own
 * combinations could not show which rule decided.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { VerifyPaths } from '../src/cli/sign';
import { LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV } from '../src/cli/live-wiring';
import { ANTHROPIC_MESSAGES_ADAPTER, ANTHROPIC_MESSAGES_IDENTITY, roleOutputJsonSchema } from '../src/pipeline/anthropic-messages';
import { CLAUDE_CODE_CLI_ADAPTER, CLAUDE_CODE_CLI_IDENTITY, CLAUDE_CODE_CLI_V2_ADAPTER, CLAUDE_CODE_CLI_V3_ADAPTER, CliOverageError, STRUCTURED_OUTPUT_TOOL } from '../src/pipeline/claude-code-cli';
import { ExecutablePinMismatchError, type LaunchFunction } from '../src/pipeline/claude-code-cli-transport';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { EvidenceObservationFailedError, LIVE_AGENTS_ENV, LIVE_AGENTS_TOKEN, ProcessTransportError, type ProcessFacts, type ProviderHttpResponse, type ProviderTransport } from '../src/pipeline/live-runner';
import type { RoleRequest } from '../src/pipeline/roles';
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
  gateVerdictErrorOf,
  LIFETIME_MARGIN_MS,
  LIVE_EXECUTION_ROOT,
  LiveCaptureConfigError,
  liveCaptureConfigFrom,
  maxRoleLaunchesFor,
  MAX_EXECUTION_LIFETIME_MS,
  MAX_TIMER_MS,
  MODEL_OUTPUT_PATHS,
  observeStream,
  parseStreamLines,
  REDACTED,
  redactObservation,
  runFirstLiveCase,
  runFirstSubscriptionCase,
  runSubscriptionCommand,
  sanitiseStream,
  sanitiseStreamEvent,
  STREAM_REDACTED_KEYS,
  SUBSCRIPTION_CAPTURE_ENV,
  SUBSCRIPTION_CAPTURE_TOKEN,
  subscriptionCaptureSelected,
  SUBSCRIPTION_FORBIDDEN_ENV_NAMES,
  SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES,
  SUBSCRIPTION_ROLE_CONFIG,
  SUBSCRIPTION_ROLE_CONFIG_V1,
  SUBSCRIPTION_ROLE_CONFIG_V3,
  subscriptionRoleConfigFor,
  SubscriptionBudgetError,
  SubscriptionCaptureConfigError,
  SubscriptionEnvironmentError,
  subscriptionErrorOf,
  subscriptionExecutableFor,
  subscriptionLifetimeMs,
  SubscriptionRouteMismatchError,
  subscriptionForbiddenEnvNames,
  trustOf,
  unconfirmedLaunches,
  UnsupportedLifetimeError,
  UnsupportedTimeoutError,
  UsageResetPendingError,
  type LaunchLine,
  type TrustInputs,
} from './live-capture';
import { usageViolations } from './included-usage';
import { DEFAULT_TIMEOUT_MS, MAX_RETRY_AFTER_MS } from '../src/pipeline/live-runner';
import { offlineGuard } from './setup/offline-guard';
import { allowDummyDir, processGuard } from './setup/process-guard';
import { adjudication, cannedAnthropicTransport, engineRoot, FIXTURE_TRANSCRIPT_ROOT, PACK_ID, prosecution, reading, READING_ONE, RESOLUTION, syntheticCapability, type SyntheticResponses } from './replay-fixtures';

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
/** `@2`'s environment: the same, with the launch budget at its largest, one launch per role of the default configuration. */
const SUB_ENV_V2 = { ...SUB_ENV, [LIVE_MAX_ATTEMPTS_ENV]: '9' };
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
/**
 * 2.1.280's two directories. Real ones carry the operator's home; these carry
 * neither the inherited HOME nor USER literal and match no email pattern, so
 * nothing but the key rule can keep them out of a filed stream.
 */
const GATE_PROJECTS_DIR = '/Volumes/ds-dirs-PROJECTS-6e6e6e/projects';
const GATE_CONFIG_DIR = '/Volumes/ds-dirs-CONFIG-7d7d7d/config';
/** 2.1.280's gate answer: `@1`'s keys, `analyticsDisabled` true, and both directories. */
const GATE_V2 = { ...GATE_OK, analyticsDisabled: true, projectsDirectory: GATE_PROJECTS_DIR, configDirectory: GATE_CONFIG_DIR };
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
let streamSrcDirV2: string;
let children: ChildProcess[];
/**
 * Children launched outside `recordingLaunch` — by the production default
 * spawn — tracked by the pid their launch line reports, so the same two scans
 * cover them (Task 5a review repair N6).
 */
let reportedPids: number[];
const everyChildPid: number[] = [];

beforeEach(() => {
  subScratch = realpathSync(mkdtempSync(join(tmpdir(), 'ds-capture-sub-')));
  allowDummyDir(subScratch);
  recordDir = join(subScratch, 'record');
  tempRoot = join(subScratch, 'tmp');
  streamSrcDir = join(subScratch, 'streams-src');
  streamSrcDirV2 = join(subScratch, 'streams-src-v2');
  mkdirSync(recordDir);
  mkdirSync(tempRoot);
  mkdirSync(streamSrcDir);
  mkdirSync(streamSrcDirV2);
  children = [];
  reportedPids = [];
});

afterEach(async () => {
  // Every child this test launched must be gone, group included — observed,
  // then cleaned, then asserted, in that order, so a leftover is a red test
  // and not a stray on the machine.
  const tracked = [...children.flatMap((child) => (child.pid === undefined ? [] : [child.pid])), ...reportedPids];
  const leftovers = tracked.filter((pid) => groupAlive(pid));
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

/**
 * A 2.1.295 `stream-json` stream for one role, which `@2`'s projection
 * accepts: the literal shapes of `claude-code-cli-v2.test.ts`'s `build()`,
 * written again here as literals and never read off the `@2` profile — CLI
 * 2.1.295 and `claude-opus-5-5` at init, in `message_start`, on the assistant
 * restatement and as the one `modelUsage` entry; `permissionMode` default and
 * `fast_mode_state` "off" at init and on the result; one system status note,
 * "requesting"; one compliant rate-limit event; a result that completed with
 * the last message's stop reason and a standard speed. The fixture output is
 * the StructuredOutput call's input, in deltas, as in `syntheticStream`.
 */
function syntheticStreamV2(output: unknown, requestId: string): string {
  const text = JSON.stringify(output);
  const deltas: string[] = [];
  for (let i = 0; i < text.length; i += 700) deltas.push(text.slice(i, i + 700));
  const meta = { session_id: SESSION_ID, uuid: UUID };
  const se = (kind: string, extra: Record<string, unknown> = {}) => ({ type: 'stream_event', event: { type: kind, ...extra }, parent_tool_use_id: null, ...meta });
  const usage = (extra: Record<string, unknown> = {}) => ({ input_tokens: 2, output_tokens: 82, cache_creation_input_tokens: 626, cache_read_input_tokens: 0, ...extra });
  const events: unknown[] = [
    { type: 'system', subtype: 'init', apiKeySource: 'none', claude_code_version: '2.1.295', model: 'claude-opus-5-5', permissionMode: 'default', fast_mode_state: 'off', tools: ['StructuredOutput'], mcp_servers: [], ...meta },
    { type: 'system', subtype: 'status', status: 'requesting', ...meta },
    se('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 2, output_tokens: 25 } } }),
    se('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'StructuredOutput', input: {} } }),
    ...deltas.map((partial) => se('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: partial } })),
    { type: 'assistant', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'StructuredOutput', input: output }], stop_reason: null, usage: usage() }, request_id: requestId, parent_tool_use_id: null, ...meta },
    se('content_block_stop', { index: 0 }),
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Structured output provided successfully' }] }, parent_tool_use_id: null, ...meta },
    se('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null, stop_details: null }, usage: usage() }),
    se('message_stop'),
    { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled', resetsAt: 1790075400 }, ...meta },
    { type: 'result', subtype: 'success', is_error: false, num_turns: 2, result: text, stop_reason: 'tool_use', terminal_reason: 'completed', fast_mode_state: 'off', structured_output: output, modelUsage: { 'claude-opus-5-5': { inputTokens: 2, outputTokens: 82, canonicalModel: 'claude-opus-5-5' } }, usage: usage({ speed: 'standard' }), total_cost_usd: 0.00832, ...meta },
  ];
  return events.map((event) => JSON.stringify(event)).join('\n') + '\n';
}

/** The per-role `@2` streams, one file per role or per prosecutor lens, in their own directory. */
function writeStreamSourcesV2(): void {
  writeFileSync(join(streamSrcDirV2, 'reader.jsonl'), syntheticStreamV2(reading(), 'req_v2_reader'));
  for (const lens of DEFAULT_ROLE_CONFIG.lenses) writeFileSync(join(streamSrcDirV2, `prosecutor-${lens}.jsonl`), syntheticStreamV2(prosecution(lens), `req_v2_prosecutor_${lens}`));
  writeFileSync(join(streamSrcDirV2, 'adjudicator.jsonl'), syntheticStreamV2(adjudication(), 'req_v2_adjudicator'));
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
  /**
   * Which executable the dummy stands in for: `@1`'s 2.1.226 (the default),
   * or `@2`'s 2.1.295, which serves `syntheticStreamV2` streams, answers the
   * gate with `GATE_V2` unless told otherwise, and copies the answer it
   * prints to `gate-v2-stdout.txt` in the record directory.
   */
  variant?: 'v1' | 'v2';
  /** The gate stalls instead of answering: `true` sleeps, and dies on TERM; `'ignore-term'` traps TERM first, then loops until killed. */
  gateStall?: boolean | 'ignore-term';
  /** Role launch (1-based, gate excluded) that sleeps this many seconds before serving its stream: a bounded delay, then an ordinary answer. */
  delayAt?: { launch: number; seconds: number };
  /** Role launches (1-based, gate excluded) that serve the stream given here instead of their role's own (Task 5b). */
  streams?: Record<number, string>;
  /** Role launch that prints the text given here, writes `ready` and stalls: a partial stream from a launch that never finishes (Task 5b). */
  partialThenStallAt?: { launch: number; stdout: string };
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
 * `auth status --json` answers from `gate.json` (`gate-v2.json` for the `@2`
 * variant). A role launch counts itself, writes the environment it was
 * handed to `env-<n>.txt` in the record directory (never under an execution
 * directory), reads its role off the `# Role:` heading of the system-prompt
 * file it was handed, its lens off stdin, and serves the matching stream —
 * unless this launch is the one told to fail or stall.
 */
function writeCaptureDummy(behaviour: DummyBehaviour = {}): { path: string; sha256: string; sizeBytes: number } {
  const v2 = behaviour.variant === 'v2';
  if (v2) writeStreamSourcesV2();
  else writeStreamSources();
  writeFileSync(join(recordDir, v2 ? 'gate-v2.json' : 'gate.json'), JSON.stringify(behaviour.gate ?? (v2 ? GATE_V2 : GATE_OK)) + '\n');
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
  if (behaviour.delayAt !== undefined) hooks.push(`if [ "$n" = "${behaviour.delayAt.launch}" ]; then /bin/sleep ${behaviour.delayAt.seconds}; fi`);
  const sourceDir = v2 ? streamSrcDirV2 : streamSrcDir;
  for (const [launch, text] of Object.entries(behaviour.streams ?? {})) {
    writeFileSync(join(sourceDir, `launch-${launch}.jsonl`), text);
    hooks.push(`if [ "$n" = "${launch}" ]; then f="launch-${launch}"; fi`);
  }
  if (behaviour.partialThenStallAt !== undefined) {
    writeFileSync(join(sourceDir, 'partial.jsonl'), behaviour.partialThenStallAt.stdout);
    hooks.push(`if [ "$n" = "${behaviour.partialThenStallAt.launch}" ]; then\n  /bin/cat "$S/partial.jsonl"\n  : > "$R/ready"\n  /bin/sleep 600\nfi`);
  }
  const script = [
    '#!/bin/sh',
    `R=${JSON.stringify(recordDir)}`,
    `S=${JSON.stringify(v2 ? streamSrcDirV2 : streamSrcDir)}`,
    // `warmDummy`'s launch: counted nowhere, answers nothing.
    'if [ "$1" = "warm" ]; then exit 0; fi',
    'if [ "$1" = "auth" ]; then',
    // Before anything else, so the gate already ignores TERM when it logs itself.
    ...(behaviour.gateStall === 'ignore-term' ? ['  trap "" TERM'] : []),
    '  printf "GATE\\n" >> "$R/launches.log"',
    ...(behaviour.orphanAt === 'gate' ? [ORPHAN_WRITER] : []),
    ...(behaviour.gateStall === true ? ['  /bin/sleep 600'] : []),
    ...(behaviour.gateStall === 'ignore-term' ? ['  while :; do /bin/sleep 1; done'] : []),
    v2 ? '  /bin/cat "$R/gate-v2.json" | /usr/bin/tee "$R/gate-v2-stdout.txt"' : '  /bin/cat "$R/gate.json"',
    '  exit 0',
    'fi',
    'n=$(/bin/cat "$R/count" 2>/dev/null || printf 0)',
    'n=$((n + 1))',
    'printf %s "$n" > "$R/count"',
    'printf "LAUNCH %s\\n" "$n" >> "$R/launches.log"',
    '/usr/bin/env > "$R/env-$n.txt"',
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
  const path = join(subScratch, v2 ? 'claude-dummy-v2.sh' : 'claude-dummy.sh');
  writeFileSync(path, script, { mode: 0o700 });
  const bytes = readFileSync(path);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length };
}

/**
 * Runs a freshly written dummy once, through its `warm` path, before a case
 * whose timing starts at the gate. The first exec of a new script file on
 * this machine is slow (measured 2026-09-26: a fresh two-line script took
 * 148 to 190 ms on its first run and 5 ms after; in this suite an unwarmed
 * gate dummy had not run its first line within a 300 ms deadline, nor
 * logged itself within a 500 ms gate timeout), long enough for a short
 * deadline to reach a gate that has not yet run its first line. The warm
 * launch is counted nowhere: it writes no marker and serves nothing.
 */
function warmDummy(pin: { path: string }): void {
  const warm = spawnSync(pin.path, ['warm'], { encoding: 'utf8' });
  expect(warm.status, 'the dummy\'s warm launch').toBe(0);
}

/** The real `spawn`, with every child remembered for cleanup and for the leftover scan. */
const recordingLaunch: LaunchFunction = (file, args, options) => {
  const child = spawn(file, args, options);
  children.push(child);
  if (child.pid !== undefined) everyChildPid.push(child.pid);
  return child;
};

/** A child the production default spawn launched, remembered by the pid the transport reported, for both scans. */
function trackReportedPid(pid: number): void {
  reportedPids.push(pid);
  everyChildPid.push(pid);
}

type CaptureOver = Partial<Parameters<typeof captureLiveRun>[0]>;
type SubOver = NonNullable<Parameters<typeof captureLiveRun>[0]['subscription']>;

/**
 * One subscription capture over the given dummy. `@1` is passed explicitly —
 * the route defaults to `@3` — and before `over`, so a case can hand in
 * another adapter, or none to take the route's default.
 */
function captureSubscription(pin: { path: string; sha256: string; sizeBytes: number }, over: CaptureOver = {}, sub: SubOver = {}) {
  return captureLiveRun({
    packId: FIRST_LIVE_CASE.packId,
    requirementId: FIRST_LIVE_CASE.requirementId,
    paths: paths(),
    executionRoot: root(),
    env: SUB_ENV,
    route: 'subscription',
    subscription: { executable: pin, launch: recordingLaunch, inheritedEnv: { ...INHERITED }, interrupts: new EventEmitter(), termGraceMs: 300, killGraceMs: 300, tempRoot, ...sub },
    adapter: CLAUDE_CODE_CLI_ADAPTER,
    ...over,
  });
}

/** The environment a dummy role launch recorded, as NAME → VALUE, with what `/bin/sh` adds of its own set aside. */
function roleEnvOf(n: number): Record<string, string> {
  const shellAdded = new Set(['PWD', 'OLDPWD', 'SHLVL', '_']);
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(recordDir, `env-${n}.txt`), 'utf8').split('\n')) {
    if (line === '') continue;
    const at = line.indexOf('=');
    const name = line.slice(0, at);
    if (!shellAdded.has(name)) env[name] = line.slice(at + 1);
  }
  return env;
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

// ---------------------------------------------------------------------------
// The trust block D-9 files in every @2 execution.json (Task 5c)
// ---------------------------------------------------------------------------

/** D-9's methods (Task 5c, a parent decision P-5c-5), as literals written here and never read off the harness. */
const TRUST_EXECUTION_METHOD = 'the harness\'s own account: the gate, the launches, the drain, cleanup confirmation and usage stops';
const TRUST_SCHEMA_METHOD = 'role outputs parsed at their seams (RoleOutputError otherwise), then assembleVerificationResult (structure, cross-field consistency, pins, gap identity, version registry)';
const TRUST_EVIDENCE_METHOD = 'checkResultEvidence: every evidence set from evidenceSetsOf, judged by the signing gate\'s own checkEvidenceSet against the corpus the run authorised; quotes and absence terms compared whitespace-collapsed and lower-cased, not byte-exact; edges looked up across the loaded corpus index, not only the entitled closure; whether evidence supports its proposition is not assessed';
const TRUST_SUBSTANTIVE = { status: 'unassessed', method: 'none at capture time' };

type TrustTier = { status: string; method: string };

/** One whole trust block, as literals: each tier's status, the error's name, and the evidence sets or `null`. */
function trustBlock(
  execution: 'completed' | 'failed',
  error: string | null,
  schema: 'valid' | 'invalid' | 'unassessed',
  evidence: 'passed' | 'failed' | 'withheld' | 'unassessed',
  sets: readonly unknown[] | null,
) {
  return {
    execution: { status: execution, method: TRUST_EXECUTION_METHOD, error },
    schemaValidity: { status: schema, method: TRUST_SCHEMA_METHOD },
    evidenceValidity: { status: evidence, method: TRUST_EVIDENCE_METHOD, sets },
    substantiveCorrectness: TRUST_SUBSTANTIVE,
  };
}

/** A set `checkResultEvidence` reports clean. */
const cleanSet = (recordPath: string, label: string) => ({ recordPath, label, ok: true, problems: [] as string[] });

/**
 * Every evidence set of the record the fixture outputs assemble into — `reading()`, `prosecution(lens)` for each of
 * the seven lenses, `adjudication()` — every one clean, in the record's order: the two reading elements, then the
 * fourteen challenges in prosecutor order, each challenge's own evidence before its adjudication's. Literals, never
 * read off `evidenceSetsOf`.
 */
const CLEAN_SETS = [
  cleanSet('reading.elements[0] (RE-1).evidence', 'reading element RE-1'),
  cleanSet('reading.elements[1] (RE-2).evidence', 'reading element RE-2'),
  cleanSet('challenges[0] (P0-C1).evidence', 'challenge P0-C1'),
  cleanSet('challenges[0] (P0-C1).adjudicationEvidence', 'challenge P0-C1 adjudication'),
  cleanSet('challenges[1] (P0-C2).evidence', 'challenge P0-C2'),
  cleanSet('challenges[1] (P0-C2).adjudicationEvidence', 'challenge P0-C2 adjudication'),
  cleanSet('challenges[2] (P1-C1).evidence', 'challenge P1-C1'),
  cleanSet('challenges[2] (P1-C1).adjudicationEvidence', 'challenge P1-C1 adjudication'),
  cleanSet('challenges[3] (P1-C2).evidence', 'challenge P1-C2'),
  cleanSet('challenges[3] (P1-C2).adjudicationEvidence', 'challenge P1-C2 adjudication'),
  cleanSet('challenges[4] (P2-C1).evidence', 'challenge P2-C1'),
  cleanSet('challenges[4] (P2-C1).adjudicationEvidence', 'challenge P2-C1 adjudication'),
  cleanSet('challenges[5] (P2-C2).evidence', 'challenge P2-C2'),
  cleanSet('challenges[5] (P2-C2).adjudicationEvidence', 'challenge P2-C2 adjudication'),
  cleanSet('challenges[6] (P3-C1).evidence', 'challenge P3-C1'),
  cleanSet('challenges[6] (P3-C1).adjudicationEvidence', 'challenge P3-C1 adjudication'),
  cleanSet('challenges[7] (P3-C2).evidence', 'challenge P3-C2'),
  cleanSet('challenges[7] (P3-C2).adjudicationEvidence', 'challenge P3-C2 adjudication'),
  cleanSet('challenges[8] (P4-C1).evidence', 'challenge P4-C1'),
  cleanSet('challenges[8] (P4-C1).adjudicationEvidence', 'challenge P4-C1 adjudication'),
  cleanSet('challenges[9] (P4-C2).evidence', 'challenge P4-C2'),
  cleanSet('challenges[9] (P4-C2).adjudicationEvidence', 'challenge P4-C2 adjudication'),
  cleanSet('challenges[10] (P5-C1).evidence', 'challenge P5-C1'),
  cleanSet('challenges[10] (P5-C1).adjudicationEvidence', 'challenge P5-C1 adjudication'),
  cleanSet('challenges[11] (P5-C2).evidence', 'challenge P5-C2'),
  cleanSet('challenges[11] (P5-C2).adjudicationEvidence', 'challenge P5-C2 adjudication'),
  cleanSet('challenges[12] (P6-C1).evidence', 'challenge P6-C1'),
  cleanSet('challenges[12] (P6-C1).adjudicationEvidence', 'challenge P6-C1 adjudication'),
  cleanSet('challenges[13] (P6-C2).evidence', 'challenge P6-C2'),
  cleanSet('challenges[13] (P6-C2).adjudicationEvidence', 'challenge P6-C2 adjudication'),
];

/** Text DOC-32013L0034 does not hold: RE-1's quote, fabricated, on that document's id and real hash. */
const FABRICATED_QUOTE = 'FABRICATED 5C TEXT: no sentence of this directive reads this way';

/** `CLEAN_SETS` with RE-1's set failed by the fabricated quote, in `checkEvidenceSet`'s words: literals. */
const FABRICATED_SETS = [
  { recordPath: 'reading.elements[0] (RE-1).evidence', label: 'reading element RE-1', ok: false, problems: [`evidence[0]: quote not found in DOC-32013L0034: "${FABRICATED_QUOTE}"`] },
  ...CLEAN_SETS.slice(1),
];

/** `reading()` with RE-1's quote text replaced by `FABRICATED_QUOTE`, its docId and its real hash kept. */
function fabricatedReading() {
  const output = reading();
  output.elements[0]!.evidence[0]!.text = FABRICATED_QUOTE;
  return output;
}

/** A well-formed SHA-256 that is not DOC-32013L0034's. */
const WRONG_HASH = '5c'.repeat(32);

/** `reading()` with RE-1's quote pinning DOC-32013L0034 at `WRONG_HASH`: the seam takes any string there, and assembly compares it with the pin. */
function wrongHashReading() {
  const output = reading();
  output.elements[0]!.evidence[0]!.sha256Normalized = WRONG_HASH;
  return output;
}

/** `reading()` with RE-1 resting on an absence claim alone: well-formed evidence, which the reader's seam refuses as sole evidence. */
function absenceOnlyReading() {
  const output = reading();
  return { ...output, elements: [{ ...output.elements[0]!, evidence: [{ kind: 'absence', docIds: ['DOC-32013L0034'], term: 'ABSENCE 5C a term no reading needs' }] }, output.elements[1]!] };
}

/** A reader that halts: no element, and one gap naming a document the corpus does not hold. */
function haltedReading() {
  return { elements: [], gaps: [{ kind: 'corpus_gap', docId: 'DOC-NOT-HELD-5C', detail: 'SYNTHETIC FIXTURE: the reader halted on a document the corpus does not hold' }] };
}

/**
 * What a `@2` `execution.json` says of trust, read back. The key is filed; the stringified block says "verified"
 * nowhere — checked first, so a word planted in a status or a method reds here by name; then each tier's status,
 * the evidence tier's first, so a measurement taken too early or over the wrong record reds naming what it found;
 * then the whole block. Returns the block as filed.
 */
function expectTrust(summaryPath: string, expected: ReturnType<typeof trustBlock>): Record<string, unknown> {
  const summary = summaryOf(summaryPath);
  expect(Object.hasOwn(summary, 'trust'), 'execution.json carries a trust key').toBe(true);
  const trust = summary['trust'] as Record<string, TrustTier> | null;
  expect(JSON.stringify(trust), 'the trust block, stringified').not.toMatch(/verified/i);
  expect(trust?.['evidenceValidity']?.status, 'trust.evidenceValidity.status').toBe(expected.evidenceValidity.status);
  expect(trust?.['schemaValidity']?.status, 'trust.schemaValidity.status').toBe(expected.schemaValidity.status);
  expect(trust?.['execution']?.status, 'trust.execution.status').toBe(expected.execution.status);
  expect(trust, 'the whole trust block').toStrictEqual(expected);
  return trust as Record<string, unknown>;
}

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

/** SIGKILL to every child of this test whose group is still alive, as `afterEach` does, but inside the case. */
function endLiveChildren(): void {
  for (const child of children) {
    if (child.pid === undefined || !groupAlive(child.pid)) continue;
    for (const target of [-child.pid, child.pid]) {
      try {
        process.kill(target, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
}

/**
 * A capture's outcome, or `null` when it has not settled within `ms`. A
 * capture still running then has its children ended and is awaited (bounded),
 * so a stalled gate is ended by the case itself and the case reds on its own
 * assertion rather than on vitest's timeout; `afterEach` stays the backstop.
 */
async function settleWithin<T>(pending: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  const first = await Promise.race([pending, late]);
  clearTimeout(timer);
  if (first !== null) return first;
  endLiveChildren();
  await Promise.race([pending.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 5000))]);
  return null;
}

/** Waits until the dummy has logged its gate launch: the gate child is running. */
async function awaitGateLaunched(): Promise<void> {
  const deadline = Date.now() + 5000;
  while (gateLaunchCount() === 0) {
    if (Date.now() > deadline) throw new Error('the dummy never logged its gate launch');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * The gate's timer, held by the case instead of the clock (Task 5a review
 * repair N1): a `setTimeout` armed at `delay` ms — an injected gate timeout
 * no other timer in the capture uses — is recorded, not scheduled, and `fire`
 * runs the harness's own callback at the instant the case chooses; with
 * `fireOnArm` it runs in the microtask after the timer is armed, while the
 * gate's pin check is still reading the file. Every other timer is scheduled
 * as usual. A handle is still returned, a real no-op timer of the same
 * delay, so the harness's `clearTimeout` has something to clear. The two
 * instants reached this way — before the gate child exists, and after it has
 * answered but before its verdict is read — are too narrow for a real timer
 * to be aimed at.
 */
function holdTimersAt(delay: number, fireOnArm = false): { fire: () => void; counts: () => { armed: number; fired: number }; restore: () => void } {
  const schedule = globalThis.setTimeout;
  const held: Array<() => void> = [];
  let armed = 0;
  let fired = 0;
  const fire = (): void => {
    for (const callback of held.splice(0)) {
      fired += 1;
      callback();
    }
  };
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    if (ms !== delay) return schedule(callback, ms, ...args);
    armed += 1;
    held.push(() => callback(...args));
    if (fireOnArm) queueMicrotask(fire);
    return schedule(() => {}, ms);
  }) as unknown as typeof setTimeout);
  return { fire, counts: () => ({ armed, fired }), restore: () => spy.mockRestore() };
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
    expect(SUBSCRIPTION_ROLE_CONFIG_V1).toEqual({ ...DEFAULT_ROLE_CONFIG, providerAdapter: CLAUDE_CODE_CLI_IDENTITY });
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
    // @1's running execution.json, read while the reader stalls and asserted once the run has finished, so a red here
    // cannot leave the stalled child running (Task 5c).
    const [running] = readdirSync(join(root(), 'csrd', 'CSRD-S-002'));
    const runningSummary = summaryOf(join(root(), 'csrd', 'CSRD-S-002', running!, 'execution.json'));
    interrupts.emit('SIGINT');
    const outcome = await pending;
    // While the reader stalled, @1's running execution.json filed no trust key (Task 5c, a parent decision P-5c-1);
    // V2-U10 is the positive control, @2's running summary filing it as null.
    expect(runningSummary['status']).toBe('running');
    expect(Object.hasOwn(runningSummary, 'trust'), '@1\'s running execution.json carries a trust key').toBe(false);
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
    const outcome = await captureSubscription(pin, { route: undefined, adapter: CLAUDE_CODE_CLI_ADAPTER });
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
    // The process-channel adapter is refused by the channel rule, which comes first: its message.
    await expect(capture({ adapter: CLAUDE_CODE_CLI_ADAPTER, transport: canned })).rejects.toThrow('the adapter claude-code-cli@1 speaks the process channel, which only the subscription route runs');
    // The same refusal by identity alone, for an adapter that carries the CLI identity over an HTTP channel.
    await expect(capture({ adapter: { ...ANTHROPIC_MESSAGES_ADAPTER, identity: { ...CLAUDE_CODE_CLI_IDENTITY } }, transport: canned })).rejects.toBeInstanceOf(CaptureRouteConflictError);
    // ... by the identity rule, whose message names the identity it was handed.
    await expect(capture({ adapter: { ...ANTHROPIC_MESSAGES_ADAPTER, identity: { ...CLAUDE_CODE_CLI_IDENTITY } }, transport: canned })).rejects.toThrow('the adapter identity is claude-code-cli@1, which only the subscription route runs');
    // And by channel alone: a process-channel adapter under an identity the CLI rule does not name is
    // still refused, naming the channel, so each of the two rules is known to decide on its own.
    await expect(capture({ adapter: { ...CLAUDE_CODE_CLI_ADAPTER, identity: { id: "other-process-adapter", version: "1" } }, transport: canned })).rejects.toThrow(/process channel/);
    expect(canned.calls).toHaveLength(0);
    expect(existsSync(root())).toBe(false);
  });

  it('E3b — the @2 twin: an adapter carrying claude-code-cli@2 over the HTTP channel is refused by the identity rule, naming @2; the canned transport is never called and nothing is created', async () => {
    const canned = cannedAnthropicTransport();
    const twin = { ...ANTHROPIC_MESSAGES_ADAPTER, identity: { id: 'claude-code-cli', version: '2' } };
    // Absent means http: the channel rule does not decide this case, so the identity rule must.
    expect(twin.channel ?? 'http').toBe('http');
    await expect(capture({ adapter: twin, transport: canned })).rejects.toBeInstanceOf(CaptureRouteConflictError);
    await expect(capture({ adapter: twin, transport: canned })).rejects.toThrow('the adapter identity is claude-code-cli@2, which only the subscription route runs');
    expect(canned.calls).toHaveLength(0);
    expect(existsSync(root())).toBe(false);
    // Positive control: the same canned transport under the HTTP adapter is called, and the run is filed.
    const control = await capture({ transport: canned });
    expect(control.status, JSON.stringify(control.error)).toBe('completed');
    expect(canned.calls).toHaveLength(9);
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
    expect([...STREAM_REDACTED_KEYS].sort()).toEqual(['configDirectory', 'cwd', 'email', 'orgId', 'orgName', 'projectsDirectory', 'session_id', 'uuid']);
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

  it('P5 — the observation reads request ids, turns, rate-limit events and usage, and a thinking figure only when reported; and, as reported, what the stream says about included usage — every model position, the CLI version and betas, the rate-limit fields, the fast-mode states and speeds, the stops with their category but never the explanation, the API-error kinds, the counts and the per-request context (Task 5b)', () => {
    /** What a stream that reports nothing about included usage observes of it: every init and result event is read, so no event is an empty list (Task 5b review repair R4). */
    const NO_USAGE = { reportedModels: [], cliVersion: null, initBetas: [], rateLimits: [], fastMode: { init: [], result: [], speeds: [] }, stops: [], apiErrors: [], blockTypes: {}, systemSubtypes: {}, reportedContextTokens: null };
    const parsed = parseStreamLines([
      JSON.stringify({ type: 'assistant', request_id: 'req_1' }),
      'garbage',
      JSON.stringify({ type: 'rate_limit_event' }),
      JSON.stringify({ type: 'rate_limit_event' }),
      JSON.stringify({ type: 'assistant', request_id: 'req_2' }),
      JSON.stringify({ type: 'result', num_turns: 4, usage: { input_tokens: 1, thinking_tokens: 7 } }),
    ].join('\n'));
    expect(observeStream(parsed)).toStrictEqual({
      requestIds: ['req_1', 'req_2'],
      numTurns: 4,
      thinkingTokens: 7,
      rateLimitEvents: 2,
      reportedUsage: { input_tokens: 1, thinking_tokens: 7 },
      ...NO_USAGE,
      // Two assistant events naming no model: each an entry with the model absent, never defaulted.
      reportedModels: [{ line: 1, where: 'assistant message.model', onApiError: false }, { line: 5, where: 'assistant message.model', onApiError: false }],
      // Two rate-limit events with no rate_limit_info: each recorded as what it is.
      rateLimits: [{ line: 3, info: null, notAnObject: 'absent' }, { line: 4, info: null, notAnObject: 'absent' }],
      fastMode: { init: [], result: [{ line: 6, fields: {} }], speeds: [] },
      reportedContextTokens: 1,
    });
    expect(observeStream(parseStreamLines(JSON.stringify({ type: 'result', num_turns: '4', usage: { input_tokens: 1 } })))).toStrictEqual({ requestIds: [], numTurns: null, thinkingTokens: null, rateLimitEvents: 0, reportedUsage: { input_tokens: 1 }, ...NO_USAGE, fastMode: { init: [], result: [{ line: 1, fields: {} }], speeds: [] }, reportedContextTokens: 1 });
    // A gate-only stream and an empty one observe nothing.
    expect(observeStream([])).toStrictEqual({ requestIds: [], numTurns: null, thinkingTokens: null, rateLimitEvents: 0, reportedUsage: null, ...NO_USAGE });
    expect(observeStream(parseStreamLines(`${JSON.stringify(GATE_V2)}\n`))).toStrictEqual({ requestIds: [], numTurns: null, thinkingTokens: null, rateLimitEvents: 0, reportedUsage: null, ...NO_USAGE });

    // A distinct string at every model position, overage in use, fast mode on at the result, a fast speed, and a
    // refusal carrying a category and an explanation; around them, model output that must not be copied.
    const EXPLANATION = 'EXPLANATION-P5-7b7b7b declined for a reason';
    const input = [
      { type: 'system', subtype: 'init', model: 'model-at-init', claude_code_version: '2.1.280', fast_mode_state: 'off', fast_mode_reason: 'reason-at-init', betas: ['beta-one'], permissionMode: 'default' },
      { type: 'stream_event', event: { type: 'message_start', message: { model: 'model-at-message-start', usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30 } } } },
      { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } } },
      { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'MODEL-OUTPUT-THINKING' } } },
      { type: 'assistant', message: { model: 'model-at-assistant', content: [{ type: 'text', text: 'MODEL-OUTPUT-TEXT' }], stop_reason: null, usage: { input_tokens: 5, speed: 'standard' } }, request_id: 'req_p5' },
      { type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'refusal', stop_details: { category: 'frontier_llm', explanation: EXPLANATION } }, usage: { output_tokens: 3 } } },
      // The three fields the plan names beside D-6's are copied; overageDisabledReason, which no rule names, is the control left out (Task 5b review repair M2).
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageInUse: true, overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled', resetsAt: 1790075400, utilization: 0.25, unifiedWindows: [{ rateLimitType: 'seven_day', utilization: 0.5 }], surpassedThreshold: 0.75, canUserPurchaseCredits: false, hasChargeableSavedPaymentMethod: false } },
      { type: 'system', subtype: 'api_error', error: 'model_requires_usage_credits' },
      { type: 'result', subtype: 'success', result: 'MODEL-OUTPUT-RESULT', structured_output: { x: 'MODEL-OUTPUT-STRUCTURED' }, stop_reason: 'end_turn', fast_mode_state: 'on', modelUsage: { 'model-at-usage-key': { canonicalModel: 'model-at-canonical' } }, usage: { input_tokens: 100, speed: 'fast' } },
    ];
    const text = input.map((event) => JSON.stringify(event)).join('\n');
    const observation = observeStream(parseStreamLines(text));
    expect(observation).toStrictEqual({
      requestIds: ['req_p5'],
      numTurns: null,
      thinkingTokens: null,
      rateLimitEvents: 1,
      reportedUsage: { input_tokens: 100, speed: 'fast' },
      reportedModels: [
        { line: 1, where: 'init.model', model: 'model-at-init', onApiError: false },
        { line: 2, where: 'message_start message.model', model: 'model-at-message-start', onApiError: false },
        { line: 5, where: 'assistant message.model', model: 'model-at-assistant', onApiError: false },
        { line: 9, where: 'result.modelUsage key', model: 'model-at-usage-key', onApiError: false },
        { line: 9, where: 'result.modelUsage["model-at-usage-key"].canonicalModel', model: 'model-at-canonical', onApiError: false },
      ],
      cliVersion: '2.1.280',
      initBetas: [{ line: 1, betas: ['beta-one'] }],
      rateLimits: [{ line: 7, info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageInUse: true, overageStatus: 'rejected', resetsAt: 1790075400, utilization: 0.25, unifiedWindows: [{ rateLimitType: 'seven_day', utilization: 0.5 }], surpassedThreshold: 0.75, canUserPurchaseCredits: false, hasChargeableSavedPaymentMethod: false }, notAnObject: null }],
      fastMode: {
        init: [{ line: 1, fields: { fast_mode_state: 'off', fast_mode_reason: 'reason-at-init' } }],
        result: [{ line: 9, fields: { fast_mode_state: 'on' } }],
        speeds: [{ line: 5, where: 'assistant message.usage', speed: 'standard', onApiError: false }, { line: 9, where: 'result usage', speed: 'fast', onApiError: false }],
      },
      stops: [{ line: 6, where: 'message_delta', reason: 'refusal', category: 'frontier_llm' }, { line: 9, where: 'result', reason: 'end_turn' }],
      apiErrors: [{ line: 8, where: 'system api_error', kinds: ['model_requires_usage_credits'] }],
      blockTypes: { thinking: 1 },
      systemSubtypes: { init: 1, api_error: 1 },
      // The largest request: 10 + 20 + 30 at message_start, not the result's 100, which a request reported.
      reportedContextTokens: 60,
    });
    // The explanation and the model's output are absent from the observation, and present in its input (the positive control).
    expect(text).toContain(EXPLANATION);
    expect(JSON.stringify(observation)).not.toContain(EXPLANATION);
    expect(JSON.stringify(observation)).not.toContain('declined');
    // The unnamed rate-limit field is in the input and not in the observation (Task 5b review repair M2).
    expect(text).toContain('overageDisabledReason');
    expect(JSON.stringify(observation)).not.toContain('overageDisabledReason');
    for (const output of ['MODEL-OUTPUT-THINKING', 'MODEL-OUTPUT-TEXT', 'MODEL-OUTPUT-RESULT', 'MODEL-OUTPUT-STRUCTURED']) {
      expect(text).toContain(output);
      expect(JSON.stringify(observation)).not.toContain(output);
    }
  });

  it('P6 — the observation as filed: the value of every redacted key is replaced wherever the observation copied a subtree — a reported model, an init\'s betas, a rate-limit reading\'s scope and window, the fast_mode* fields, a stop, a result\'s usage — the key kept, the count maps and everything else as read (Task 5b review repair R15, a parent decision P-5b-11)', () => {
    const input = [
      { type: 'system', subtype: 'init', claude_code_version: '2.1.280', model: { name: 'm', session_id: 'SECRET-MODEL-SESSION' }, fast_mode_state: 'off', fast_mode_detail: { email: 'SECRET-FAST-EMAIL' }, betas: [{ uuid: 'SECRET-BETA-UUID' }] },
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', overageScope: { orgName: 'SECRET-SCOPE-ORGNAME', level: 'org' }, unifiedWindows: [{ rateLimitType: 'seven_day', orgId: 'SECRET-WINDOW-ORGID' }] } },
      { type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_details: { category: { cwd: 'SECRET-STOP-CWD' } } } } },
      { type: 'result', fast_mode_state: 'off', usage: { input_tokens: 1, projectsDirectory: 'SECRET-USAGE-DIR', speed: 'standard' } },
      // A subtype that is a redacted key's name: a count, kept as counted.
      { type: 'system', subtype: 'uuid' },
    ];
    const observation = observeStream(parseStreamLines(input.map((event) => JSON.stringify(event)).join('\n')));
    const redacted = redactObservation(observation, literals);
    for (const secret of ['SECRET-MODEL-SESSION', 'SECRET-FAST-EMAIL', 'SECRET-BETA-UUID', 'SECRET-SCOPE-ORGNAME', 'SECRET-WINDOW-ORGID', 'SECRET-STOP-CWD', 'SECRET-USAGE-DIR']) {
      // Positive control: the observation as read carries each.
      expect(JSON.stringify(observation), secret).toContain(secret);
      expect(JSON.stringify(redacted), secret).not.toContain(secret);
    }
    expect(redacted).toStrictEqual({
      ...observation,
      reportedModels: [{ line: 1, where: 'init.model', model: { name: 'm', session_id: REDACTED }, onApiError: false }],
      initBetas: [{ line: 1, betas: [{ uuid: REDACTED }] }],
      rateLimits: [{ line: 2, info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', overageScope: { orgName: REDACTED, level: 'org' }, unifiedWindows: [{ rateLimitType: 'seven_day', orgId: REDACTED }] }, notAnObject: null }],
      fastMode: { init: [{ line: 1, fields: { fast_mode_state: 'off', fast_mode_detail: { email: REDACTED } } }], result: [{ line: 4, fields: { fast_mode_state: 'off' } }], speeds: [{ line: 4, where: 'result usage', speed: 'standard', onApiError: false }] },
      stops: [{ line: 3, where: 'message_delta', reason: 'end_turn', category: { cwd: REDACTED } }],
      reportedUsage: { input_tokens: 1, projectsDirectory: REDACTED, speed: 'standard' },
    });
    expect(redacted.systemSubtypes).toStrictEqual({ init: 1, uuid: 1 });
    // The observation handed in is not modified.
    expect(observation.reportedUsage).toStrictEqual({ input_tokens: 1, projectsDirectory: 'SECRET-USAGE-DIR', speed: 'standard' });
  });

  it('P6b — the observation as filed is held to the stream\'s value rule too: every string matching an email pattern or carrying the inherited HOME or USER value is [REDACTED] wherever the observation copied it, and a count map\'s key that would be is renamed [REDACTED], its count added to any already there; every other string, and every count, is kept (Task 5b review repair N3, a parent decision P-5b-11, extended)', () => {
    const input = [
      { type: 'system', subtype: 'init', claude_code_version: '2.1.280', model: `model-of-${INHERITED.USER}`, fast_mode_state: 'off', fast_mode_reason: 'fast-owner@example.invalid', betas: ['beta-kept', `${INHERITED.HOME}/beta`] },
      { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', overageScope: `scope of ${INHERITED.USER}`, unifiedWindows: [{ rateLimitType: 'seven_day', contact: 'window-contact@example.invalid', notes: ['kept-note', `${INHERITED.HOME}/window`] }] } },
      { type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'block-owner@example.invalid' } } },
      { type: 'stream_event', event: { type: 'content_block_start', index: 1, content_block: { type: `${INHERITED.HOME}/block` } } },
      { type: 'stream_event', event: { type: 'content_block_start', index: 2, content_block: { type: 'text' } } },
      { type: 'system', subtype: `subtype-of-${INHERITED.USER}` },
      // A subtype that is the redaction marker itself: a count already under the name the renamed keys join.
      { type: 'system', subtype: REDACTED },
      { type: 'system', subtype: 'subtype-owner@example.invalid' },
      { type: 'result', fast_mode_state: 'off', stop_reason: 'end_turn', stop_details: { category: `category at ${INHERITED.HOME}` }, usage: { input_tokens: 1, speed: 'standard', note: `usage of ${INHERITED.USER}` } },
    ];
    const observation = observeStream(parseStreamLines(input.map((event) => JSON.stringify(event)).join('\n')));
    const redacted = redactObservation(observation, literals);
    // The count maps first: a sensitive key renamed and merged, its count kept as a number; the others as counted.
    expect(observation.blockTypes).toStrictEqual({ 'block-owner@example.invalid': 1, [`${INHERITED.HOME}/block`]: 1, text: 1 });
    expect(redacted.blockTypes).toStrictEqual({ [REDACTED]: 2, text: 1 });
    expect(observation.systemSubtypes).toStrictEqual({ init: 1, [`subtype-of-${INHERITED.USER}`]: 1, [REDACTED]: 1, 'subtype-owner@example.invalid': 1 });
    expect(redacted.systemSubtypes).toStrictEqual({ init: 1, [REDACTED]: 3 });
    for (const value of [INHERITED.HOME, INHERITED.USER, '@example.invalid']) {
      // Positive control: the observation as read carries each.
      expect(JSON.stringify(observation), value).toContain(value);
      expect(JSON.stringify(redacted), value).not.toContain(value);
    }
    expect(redacted).toStrictEqual({
      ...observation,
      reportedModels: [{ line: 1, where: 'init.model', model: REDACTED, onApiError: false }],
      initBetas: [{ line: 1, betas: ['beta-kept', REDACTED] }],
      rateLimits: [{ line: 2, info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', overageScope: REDACTED, unifiedWindows: [{ rateLimitType: 'seven_day', contact: REDACTED, notes: ['kept-note', REDACTED] }] }, notAnObject: null }],
      fastMode: { init: [{ line: 1, fields: { fast_mode_state: 'off', fast_mode_reason: REDACTED } }], result: [{ line: 9, fields: { fast_mode_state: 'off' } }], speeds: [{ line: 9, where: 'result usage', speed: 'standard', onApiError: false }] },
      stops: [{ line: 9, where: 'result', reason: 'end_turn', category: REDACTED }],
      blockTypes: { [REDACTED]: 2, text: 1 },
      systemSubtypes: { init: 1, [REDACTED]: 3 },
      reportedUsage: { input_tokens: 1, speed: 'standard', note: REDACTED },
    });
    // The observation handed in is not modified.
    expect(observation.reportedUsage).toStrictEqual({ input_tokens: 1, speed: 'standard', note: `usage of ${INHERITED.USER}` });
  });

  it('P6c — a JSON key "__proto__" survives the observation\'s redaction as an own entry: a window keyed "__proto__" that reports status "rejected" is copied with its status, not made the copy\'s prototype, and a count map\'s "__proto__" key keeps its count (Task 5b review repair O1)', () => {
    // JSON.parse, unlike an object literal, makes "__proto__" an own key: the shape a stream's text can carry.
    const windows = JSON.parse('{"__proto__":{"status":"rejected","resetsAt":1790500000}}') as Record<string, unknown>;
    // Positive control: the input carries the key as its own entry, with the status the copy must keep.
    expect(Object.hasOwn(windows, '__proto__')).toBe(true);
    expect((Object.getOwnPropertyDescriptor(windows, '__proto__')?.value as Record<string, unknown>)['status']).toBe('rejected');
    const subtypes = JSON.parse('{"init":1,"__proto__":2}') as Record<string, number>;
    expect(Object.hasOwn(subtypes, '__proto__')).toBe(true);
    const base = observeStream(parseStreamLines(JSON.stringify({ type: 'system', subtype: 'init' })));
    const observation = {
      ...base,
      rateLimits: [{ line: 2, info: { status: 'allowed', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', unifiedWindows: windows }, notAnObject: null }],
      systemSubtypes: subtypes,
    } as typeof base;
    const redacted = redactObservation(observation, literals);
    const copied = redacted.rateLimits[0]?.info?.['unifiedWindows'] as Record<string, unknown>;
    expect(Object.hasOwn(copied, '__proto__'), 'the copy holds "__proto__" as its own entry').toBe(true);
    expect(Object.getPrototypeOf(copied), 'the copy\'s prototype is untouched').toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(copied, '__proto__')?.value).toStrictEqual({ status: 'rejected', resetsAt: 1790500000 });
    expect(JSON.stringify(copied)).toBe('{"__proto__":{"status":"rejected","resetsAt":1790500000}}');
    expect(Object.hasOwn(redacted.systemSubtypes, '__proto__'), 'the count map holds "__proto__" as its own key').toBe(true);
    expect(JSON.stringify(redacted.systemSubtypes)).toBe('{"init":1,"__proto__":2}');
  });
});

describe('the first subscription case, the function the agents suite calls', () => {
  it('F1 — runs the first live case over the subscription route, on @3 with its permission mode requested, with a lifetime derived from the launch budget by D-5\'s formula, and refuses a forbidden environment before anything exists', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const outcome = await runFirstSubscriptionCase({ env: SUB_ENV_V2, executionRoot: root(), subscription: { executable: pin, launch: recordingLaunch, inheritedEnv: { ...INHERITED }, interrupts: new EventEmitter(), termGraceMs: 300, killGraceMs: 300, tempRoot } });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.route).toBe('subscription');
    expect(summaryOf(outcome.summaryPath)['adapter']).toBe('claude-code-cli@3');
    expect(summaryOf(outcome.summaryPath)['requested']).toMatchObject({ permissionMode: 'default' });
    expect(launchLinesOf(outcome.launchesPath!)[1]!.argv.slice(13, 15)).toEqual(['--permission-mode', 'default']);
    // D-5's lifetime for a budget of 9, hand-computed: 9 × 1,815,000 + 60,000 + 15,000 + 60,000.
    expect(summaryOf(outcome.summaryPath)['deadlineMs']).toBe(16_470_000);
    expect(summaryOf(outcome.summaryPath)['deadlineMs']).toBe(subscriptionLifetimeMs({ maxRunAttempts: 9 }));
    await expect(runFirstSubscriptionCase({ env: { ...SUB_ENV, ANTHROPIC_API_KEY: 'k' }, executionRoot: join(scratch, 'other'), subscription: { executable: pin, launch: recordingLaunch, inheritedEnv: { ...INHERITED }, interrupts: new EventEmitter(), tempRoot } })).rejects.toBeInstanceOf(SubscriptionEnvironmentError);
    expect(existsSync(join(scratch, 'other'))).toBe(false);
    // The trust block the completed @2 run filed (Task 5c review repair R5).
    expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  });
});

// ===========================================================================
// claude-code-cli@2 on the subscription route (Opus 5.5 migration, Task 5a)
// ===========================================================================

describe('the subscription route runs claude-code-cli@2 from its profile, and @1 over injected launches only', () => {
  // Every `@2` value below is a literal written here, never read off the
  // `@2` profile or adapter: an expectation computed from the profile would
  // agree with any change made to it.
  const V2_SETTINGS = '{"switchModelsOnFlag":false,"fastMode":false,"autoContinueAtUsageLimit":false}';
  const V1_SETTINGS = '{"switchModelsOnFlag":false}';
  const V2_PIPELINE_VERSION = 'pipeline-v3-737f8d5015ea4249eef93cfa66c0b1b9bbb323fd633e7d5a71c26f453f8ce90e';
  const V1_PIPELINE_VERSION = 'pipeline-v3-fd3ed34d558145c09ef7105506c76767d1dc335ce2d82d57fbc6e2c148509ae5';
  const V2_SHA256 = '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6';
  const V1_SHA256 = '013a1cf17df5ff1dcc189d5d6fd3fdd5f097ddc3cd41aa9992e99805574febbe';
  /** `@2`'s thirteen launch controls. */
  const V2_CONTROLS = {
    CLAUDE_CODE_MAX_RETRIES: '0',
    MAX_STRUCTURED_OUTPUT_RETRIES: '0',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000',
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_NO_MODEL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_FAST_MODE: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_RETRY: '1',
    CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS: '1',
  };
  /** `@1`'s nine, as they always were. */
  const V1_CONTROLS = {
    CLAUDE_CODE_MAX_RETRIES: '0',
    MAX_STRUCTURED_OUTPUT_RETRIES: '0',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16000',
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    DISABLE_AUTOUPDATER: '1',
  };
  const V2_UNOBSERVED = {
    outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000, which 2.1.295 honours statically up to the model\'s own limit; wire-level max_tokens unobserved',
    effort: 'effort high passed as --effort; its application unobserved',
    thinking: 'always on for claude-opus-5-5, and counted toward the 64000 ceiling; not asserted',
    modelCatalog: 'not pinned by the executable hash: the embedded catalog expires at 2026-10-15T05:28:34Z, and a remote catalog is assumed blocked by CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, unverified',
    extraUsage: 'overageEnabled is reported only on some allowed_warning events (2.1.295, statically); its absence is not read as extra usage off, and extra usage being off remains the user-confirmed precondition of D-6',
  };
  const INHERITED_ENV = { HOME: INHERITED.HOME, USER: INHERITED.USER, PATH: INHERITED.PATH };
  /** The reader's full recorded argv under `@2`: every element a literal but the role's schema. */
  const V2_READER_ARGV = [
    '-p',
    '--model',
    'claude-opus-5-5',
    '--effort',
    'high',
    '--safe-mode',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--settings',
    V2_SETTINGS,
    '--system-prompt-file',
    '<system-prompt-file>',
    '--json-schema',
    JSON.stringify(roleOutputJsonSchema('reader')),
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ];
  /** Runs one capture on `@2`, handed in explicitly (the route's default is `@3`), under `@2`'s budget of 9. */
  const captureV2 = (pin: { path: string; sha256: string; sizeBytes: number }, over: CaptureOver = {}, sub: SubOver = {}) =>
    captureSubscription(pin, { env: SUB_ENV_V2, adapter: CLAUDE_CODE_CLI_V2_ADAPTER, ...over }, sub);

  it('V2-E1 — nine role launches through a @2 dummy, @2 handed in explicitly, complete: the @2 identity, the requested pin, unobserved, budgets and gate on file, the profile\'s two timeouts reaching their timers, and a runId apart from @1\'s and the HTTP route\'s', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    // Every timer the capture registers, observed for its duration only (Task 5a review repair R8): the
    // profile's launch timeout must reach the runner, which arms it once per role launch, and its gate
    // timeout the gate's own timer, once — not merely be restated under `budgets`.
    const timers = vi.spyOn(globalThis, 'setTimeout');
    let outcome: Awaited<ReturnType<typeof captureV2>>;
    let delays: unknown[];
    try {
      outcome = await captureV2(pin);
    } finally {
      delays = timers.mock.calls.map((call) => call[1]);
      timers.mockRestore();
    }
    expect(delays.filter((delay) => delay === 1_800_000), 'timers armed at the launch timeout of 1,800,000 ms').toHaveLength(9);
    expect(delays.filter((delay) => delay === 60_000), 'timers armed at the gate timeout of 60,000 ms').toHaveLength(1);
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.route).toBe('subscription');
    expect(gateLaunchCount()).toBe(1);
    expect(roleLaunchCount()).toBe(9);
    expect(outcome.launches).toBe(9);
    expect(outcome.gateLaunches).toBe(1);
    // The identity Task 3 pinned for @2, reached end to end through the harness's own configuration.
    const transcript = parseRunTranscript(readFileSync(outcome.transcriptPath!, 'utf8'), outcome.transcriptPath!);
    expect(transcript.pipelineVersion).toBe(V2_PIPELINE_VERSION);
    expect(transcript.roles.map((role) => role.model)).toEqual(Array<string>(9).fill('claude-opus-5-5'));
    expect(existsSync(outcome.resultPath!)).toBe(true);
    expect(attemptsOf(outcome.attemptsPath).map((a) => [`${a['role']}[${a['index']}]`, a['outcome'], a['launched']])).toEqual(ROLE_NAMES.map((name) => [name, 'completed', true]));

    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'completed', route: 'subscription', attemptUnit: 'cli_launch', adapter: 'claude-code-cli@2', transport: 'injected-launch', synthetic: true, launches: 9, gateLaunches: 1, error: null, runId: outcome.runId });
    expect(summary['requested']).toEqual({ pin: { version: '2.1.295', sha256: V2_SHA256, sizeBytes: 239695888 }, permittedModels: ['claude-opus-5-5'], effort: 'high', maxOutputTokens: 64000, settings: V2_SETTINGS, settingsFrom: 'profile' });
    // The executable actually launched: the dummy, injected, under the version the profile pins.
    expect(summary['pin']).toEqual({ version: '2.1.295', sha256: pin.sha256, sizeBytes: pin.sizeBytes, injected: true });
    expect(summary['unobserved']).toEqual(V2_UNOBSERVED);
    expect(JSON.stringify(summary['unobserved'])).toContain('CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000');
    expect(JSON.stringify(summary['unobserved'])).not.toContain('16000');
    expect(summary['budgets']).toEqual({ launchTimeoutMs: 1_800_000, gateTimeoutMs: 60_000, lifetimeMs: 16_470_000, injected: false });
    // Budget 9 succeeds, and every launch it admits was used.
    expect(summary['ledger']).toMatchObject({ maxRunAttempts: 9, attemptsUsed: 9, attemptsRemaining: 0, launchesStarted: 9 });
    expect(summary['gate']).toMatchObject({ pass: true, reasons: [], fields: { analyticsDisabled: 'true', projectsDirectory: 'PRESENT', configDirectory: 'PRESENT', email: 'PRESENT' } });
    // A clean @2 run: its usage stop is on file, and there is none (Task 5b).
    expect(summary['usageStop']).toBeNull();
    // D-9's four tiers (Task 5c): the whole block, literal. The run completed, its record assembled valid, and every
    // evidence set the record carries, thirty, is found in the corpus the run authorised.
    const trust = expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
    expect((trust['evidenceValidity'] as { sets: Array<{ ok: boolean }> }).sets.every((set) => set.ok)).toBe(true);
    // The positive control for every absence of "verified" in a trust block (here and in every case below): the
    // stringified block does carry its statuses.
    expect(JSON.stringify(trust)).toContain('passed');
    assertNothingFiled(outcome.executionDir, [...NEVER_FILED, GATE_PROJECTS_DIR, GATE_CONFIG_DIR]);

    // The same question on @1 and on the HTTP route: three pipelines, three runIds.
    const v1 = await captureSubscription(writeCaptureDummy(), { executionId: 'v1-control' });
    expect(v1.status, JSON.stringify(v1.error)).toBe('completed');
    const http = await capture({ executionId: 'http-control' });
    expect(http.status, JSON.stringify(http.error)).toBe('completed');
    expect(outcome.runId).toMatch(/^run-v1-[0-9a-f]{64}$/);
    expect(outcome.runId).not.toBe(v1.runId);
    expect(outcome.runId).not.toBe(http.runId);
  }, 20_000);

  it('V2-E2 — every @2 role launch ran under exactly the thirteen controls at @2\'s values beside the three inherited variables, and the reader under the full argv @2 describes', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const outcome = await captureV2(pin);
    expect(roleLaunchCount()).toBe(9);
    // What each child saw, recorded by the child: the shell's own variables set aside, nothing else admitted.
    for (let n = 1; n <= 9; n += 1) expect(roleEnvOf(n), `the environment role launch ${n} saw`).toEqual({ ...V2_CONTROLS, ...INHERITED_ENV });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    const launches = launchLinesOf(outcome.launchesPath!);
    expect([launches[1]!.role, launches[1]!.index]).toEqual(['reader', 0]);
    expect(launches[1]!.argv).toEqual(V2_READER_ARGV);
    // A characterisation pin (Task 5a review repair R9): the sha256 of the reader's --json-schema text as the
    // code emitted it on 2026-09-26, recorded from that code. The literal argv above computes this element from
    // roleOutputJsonSchema, so it agrees with any schema change; this pin does not, so a change is seen here.
    expect(launches[1]!.argv[17]).toBe('--json-schema');
    expect(createHash('sha256').update(launches[1]!.argv[18]!, 'utf8').digest('hex'), 'sha256 of the reader\'s --json-schema text').toBe('ca1406ec0b32b8d6d42736a3128ba5439a0860ea8ce27dc3b9a10fcb92d85cfd');
    for (const line of launches.slice(1)) {
      expect(line.envNames).toEqual(['CLAUDE_CODE_DISABLE_FAST_MODE', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK', 'CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK', 'CLAUDE_CODE_DISABLE_REFUSAL_RETRY', 'CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', 'CLAUDE_CODE_MAX_RETRIES', 'CLAUDE_CODE_NO_MODEL_FALLBACK', 'DISABLE_AUTOUPDATER', 'DISABLE_ERROR_REPORTING', 'DISABLE_TELEMETRY', 'HOME', 'MAX_STRUCTURED_OUTPUT_RETRIES', 'PATH', 'USER']);
      expect(line.argv[14]).toBe(V2_SETTINGS);
    }
    // The trust block the completed run filed (Task 5c review repair R5).
    expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  });

  it('V1-X1 — an explicit @1 capture over an injected launch runs as it always did: nine controls at the 16000 ceiling, the 2.1.226 pin, 16000 in unobserved, the transport\'s default --settings, and @1\'s identity', async () => {
    const pin = writeCaptureDummy();
    const outcome = await captureSubscription(pin, { adapter: CLAUDE_CODE_CLI_ADAPTER });
    expect(roleLaunchCount()).toBe(9);
    for (let n = 1; n <= 9; n += 1) expect(roleEnvOf(n), `the environment role launch ${n} saw`).toEqual({ ...V1_CONTROLS, ...INHERITED_ENV });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    const transcript = parseRunTranscript(readFileSync(outcome.transcriptPath!, 'utf8'), outcome.transcriptPath!);
    expect(transcript.pipelineVersion).toBe(V1_PIPELINE_VERSION);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary['adapter']).toBe('claude-code-cli@1');
    expect(summary['pin']).toEqual({ version: '2.1.226', sha256: pin.sha256, sizeBytes: pin.sizeBytes, injected: true });
    expect(summary['requested']).toEqual({ pin: { version: '2.1.226', sha256: V1_SHA256, sizeBytes: 279661952 }, permittedModels: ['claude-opus-5'], effort: 'high', maxOutputTokens: 16000, settings: V1_SETTINGS, settingsFrom: 'transport default' });
    expect(summary['unobserved']).toEqual({ outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000; wire-level max_tokens unobserved', thinking: 'CLI-decided for effort high; not asserted' });
    // `@1`'s profile sets no time budgets: the runner's default bounds each launch, and the gate has no timer.
    expect(summary['budgets']).toEqual({ launchTimeoutMs: 600_000, gateTimeoutMs: null, lifetimeMs: null, injected: false });
    const launches = launchLinesOf(outcome.launchesPath!);
    for (const line of launches.slice(1)) expect(line.argv.slice(13, 15)).toEqual(['--settings', V1_SETTINGS]);
    // `@1`'s gate rules, not `@2`'s: nine fields, no directory among them.
    expect(Object.keys((summary['gate'] as { fields: Record<string, string> }).fields)).toEqual(['loggedIn', 'authMethod', 'apiProvider', 'apiKeySource', 'forcedLoginMethod', 'subscriptionType', 'email', 'orgId', 'orgName']);
  });

  it('D1 — @1 with no injected launch would spawn the real executable: refused by name before any directory exists and before the gate, while the same request over an injected launch proceeds', async () => {
    // The pin and HOME are injected and nonexistent-safe: were the refusal missing, the dummy is all that could run.
    const pin = writeCaptureDummy();
    let caught: unknown;
    try {
      await captureSubscription(pin, { adapter: CLAUDE_CODE_CLI_ADAPTER }, { launch: undefined });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SubscriptionRouteMismatchError);
    expect((caught as Error).message).toContain('claude-code-cli@1 was handed in without an injected launch');
    // The refusal's prefix states the route as D-1 left it (Task 5a review repair R6).
    expect((caught as Error).message).toContain('the subscription route runs claude-code-cli@3 or claude-code-cli@2, or claude-code-cli@1 over an injected launch only');
    expect(existsSync(root())).toBe(false);
    expect(gateLaunchCount()).toBe(0);
    // By identity, not by object: a copy of @1 is @1 — refused under the same class, with the same words (Task 5a review repair R11).
    const copy = captureSubscription(pin, { adapter: { ...CLAUDE_CODE_CLI_ADAPTER } }, { launch: undefined });
    await expect(copy).rejects.toBeInstanceOf(SubscriptionRouteMismatchError);
    await expect(copy).rejects.toThrow('claude-code-cli@1 was handed in without an injected launch');
    expect(existsSync(root())).toBe(false);
    // Positive control: the same request with an injected launch passes the refusal and runs, gate first.
    const outcome = await captureSubscription(pin, { adapter: CLAUDE_CODE_CLI_ADAPTER });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    expect(roleLaunchCount()).toBe(9);
  });

  it('V2-X1 — subscriptionExecutableFor is pure: each adapter\'s profile pin, resolved against the home it is handed', () => {
    const v2 = { path: '/Users/someone/.local/share/datastrata/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude', sha256: V2_SHA256, sizeBytes: 239695888 };
    expect(subscriptionExecutableFor(CLAUDE_CODE_CLI_V2_ADAPTER, '/Users/someone')).toEqual(v2);
    expect(subscriptionExecutableFor({ identity: { id: 'claude-code-cli', version: '2' } }, '/Users/someone/')).toEqual(v2);
    expect(subscriptionExecutableFor(CLAUDE_CODE_CLI_ADAPTER, '/Users/someone')).toEqual({ path: '/Users/someone/.local/share/claude/versions/2.1.226', sha256: V1_SHA256, sizeBytes: 279661952 });
    expect(() => subscriptionExecutableFor(ANTHROPIC_MESSAGES_ADAPTER, '/Users/someone')).toThrow(SubscriptionRouteMismatchError);
    expect(() => subscriptionExecutableFor(ANTHROPIC_MESSAGES_ADAPTER, '/Users/someone')).toThrow('the adapter handed in is anthropic-messages@1');
  });

  it('V2-B1 — subscriptionLifetimeMs is D-5\'s formula over @2\'s timeouts at the default graces: hand-computed literals at two budgets, and at stated timeouts', () => {
    // 9 × (1,800,000 + 5,000 + 5,000 + 5,000) + 60,000 + (5,000 + 5,000 + 5,000) + 60,000
    expect(subscriptionLifetimeMs({ maxRunAttempts: 9 })).toBe(16_470_000);
    // 1 × 1,815,000 + 60,000 + 15,000 + 60,000: the per-launch term and the fixed term, each pinned by the pair.
    expect(subscriptionLifetimeMs({ maxRunAttempts: 1 })).toBe(1_950_000);
    // 2 × (1,000 + 15,000) + 200 + 15,000 + 60,000
    expect(subscriptionLifetimeMs({ maxRunAttempts: 2 }, { launchTimeoutMs: 1_000, gateTimeoutMs: 200 })).toBe(107_200);
    expect(() => assertSupportedLifetime(subscriptionLifetimeMs({ maxRunAttempts: 9 }))).not.toThrow();
  });

  it('V2-B2 — a @2 launch budget of 10, above the configuration\'s nine role launches, is refused by name after the route\'s own refusals and before anything exists', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const env10 = { ...SUB_ENV, [LIVE_MAX_ATTEMPTS_ENV]: '10' };
    let caught: unknown;
    try {
      await captureV2(pin, { env: env10 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SubscriptionBudgetError);
    expect((caught as Error).name).toBe('SubscriptionBudgetError');
    expect((caught as Error).message).toContain('claude-code-cli@2 admits a launch budget of at most 9');
    expect((caught as Error).message).toContain('DATASTRATA_AGENT_MAX_ATTEMPTS states 10');
    // The counts the configuration makes, the prosecutors handed in rather than derived (Task 5a review repair R7).
    expect((caught as Error).message).toContain('(one reader, 7 prosecutors, one adjudicator)');
    expect(existsSync(root())).toBe(false);
    expect(gateLaunchCount()).toBe(0);
    expect(roleLaunchCount()).toBe(0);
    // The route's own refusals come first, whatever the budget: the environment, the adapter, the transport —
    // each by its class and its words (Task 5a review repair R11).
    const environment = captureV2(pin, { env: { ...env10, ANTHROPIC_API_KEY: 'k' } });
    await expect(environment).rejects.toBeInstanceOf(SubscriptionEnvironmentError);
    await expect(environment).rejects.toThrow('the subscription route refuses to run with [ANTHROPIC_API_KEY] set');
    const adapter = captureV2(pin, { env: env10, adapter: ANTHROPIC_MESSAGES_ADAPTER });
    await expect(adapter).rejects.toBeInstanceOf(SubscriptionRouteMismatchError);
    await expect(adapter).rejects.toThrow('the adapter handed in is anthropic-messages@1');
    const transport = captureV2(pin, { env: env10, transport: cannedAnthropicTransport() });
    await expect(transport).rejects.toBeInstanceOf(SubscriptionRouteMismatchError);
    await expect(transport).rejects.toThrow('an HTTP transport was handed in');
    expect(existsSync(root())).toBe(false);
    expect(gateLaunchCount()).toBe(0);
  });

  it('V2-B3 — a gate that outlives its own timeout (200 ms, under a 5,000 ms deadline) is ended and filed as GateTimeout, cancellation reason gate_timeout, well inside the deadline, with no role launched', async () => {
    const pin = writeCaptureDummy({ variant: 'v2', gateStall: true });
    // Warmed, as V2-GT1's, V2-GT5's and V2-GT6's are, so a slow first exec of the fresh script cannot let the
    // 200 ms timer end the gate before the script has run (Task 5a review repair N7).
    warmDummy(pin);
    const started = Date.now();
    const outcome = await captureV2(pin, { deadlineMs: 5_000 }, { gateTimeoutMs: 200 });
    const elapsed = Date.now() - started;
    expect(outcome.cancellationReason).toBe('gate_timeout');
    expect(outcome.error?.name).toBe('GateTimeout');
    expect(outcome.error?.message).toContain('gate timeout of 200 ms');
    // The path this timeout took, in its own words: the running gate child was ended (Task 5a review repair N2;
    // the positive control for V2-GT10's and V2-GT11's absences).
    expect(outcome.error?.message).toContain('the gate child was ended');
    expect(elapsed).toBeLessThan(5_000);
    expect(outcome.status).toBe('failed');
    expect(outcome.cancelled).toBe(true);
    expect(roleLaunchCount()).toBe(0);
    expect(outcome.launches).toBe(0);
    expect(outcome.gateLaunches).toBe(1);
    expect(outcome.gate).toBeNull();
    expect(attemptsOf(outcome.attemptsPath)).toEqual([]);
    // The gate's launch line is filed: a child that started, was still running when the timer fired, and was ended
    // by the transport's TERM — reaped, its group gone. (The transport's facts, not the dummy's own markers: at
    // 200 ms a loaded machine can end the shell before it writes one.)
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches.map((line) => line.kind)).toEqual(['gate']);
    expect(launches[0]!.facts).toMatchObject({ started: true, exitCode: null, signal: 'SIGTERM' });
    expect(launches[0]!.facts.termination).toMatchObject({ forced: true, childReaped: true, groupGone: true });
    expect(launches[0]!.facts.termination!.signalsSent).toContain('SIGTERM');
    expect(groupAlive(launches[0]!.facts.pid!)).toBe(false);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'gate_timeout', synthetic: true, launches: 0, gateLaunches: 1, error: { name: 'GateTimeout' } });
    // 9 × 1,815,000 + 200 + 15,000 + 60,000, over the injected gate timeout.
    expect(summary['budgets']).toEqual({ launchTimeoutMs: 1_800_000, gateTimeoutMs: 200, lifetimeMs: 16_410_200, injected: true });
    // No role ran, so nothing was assessed (Task 5c).
    expectTrust(outcome.summaryPath, trustBlock('failed', 'GateTimeout', 'unassessed', 'unassessed', null));
  }, 20_000);

  it('V2-B4 — a role launch that outlives the launch timeout handed to the runner is booked as a timeout, not a cancellation, well inside the deadline', async () => {
    const pin = writeCaptureDummy({ variant: 'v2', stallAt: { launch: 1, mode: 'sleep' } });
    const started = Date.now();
    const outcome = await captureV2(pin, { deadlineMs: 5_000 }, { launchTimeoutMs: 1_000 });
    const elapsed = Date.now() - started;
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts.map((a) => a['outcome'])).toEqual(['timeout']);
    expect(attempts[0]).toMatchObject({ role: 'reader', index: 0, launched: true, possiblyBilled: true, detail: 'aborted after 1000 ms' });
    expect(outcome.error?.name).toBe('ProviderTimeoutError');
    expect(outcome.error?.message).toContain('enforced local limit of 1000 ms');
    expect(outcome.cancellationReason).toBe('role_failed:reader[0]');
    expect(elapsed).toBeLessThan(5_000);
    expect(roleLaunchCount()).toBe(1);
    // The launch was running when the timeout fired, and the transport ended it: TERM, reaped, its group gone.
    const stalled = launchLinesOf(outcome.launchesPath!)[1]!;
    expect([stalled.role, stalled.index]).toEqual(['reader', 0]);
    expect(stalled.facts).toMatchObject({ started: true, exitCode: null, signal: 'SIGTERM' });
    expect(stalled.facts.termination!.signalsSent).toContain('SIGTERM');
    expect(groupAlive(stalled.facts.pid!)).toBe(false);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', synthetic: true, launches: 1 });
    // 9 × (1,000 + 15,000) + 60,000 + 15,000 + 60,000, over the injected launch timeout.
    expect(summary['budgets']).toEqual({ launchTimeoutMs: 1_000, gateTimeoutMs: 60_000, lifetimeMs: 279_000, injected: true });
    // The launch timed out in the roles, so nothing was assessed (Task 5c review repair R5).
    expectTrust(outcome.summaryPath, trustBlock('failed', 'ProviderTimeoutError', 'unassessed', 'unassessed', null));
  }, 20_000);

  it('V2-R1 — the gate\'s two directories are filed nowhere under the execution directory, though the dummy printed both: redacted by key in the gate stream, labelled in the gate result', async () => {
    // Neither value carries anything the literal or email rules would catch, so only the key rule can keep them out.
    for (const value of [GATE_PROJECTS_DIR, GATE_CONFIG_DIR]) {
      expect(value).not.toContain(INHERITED.HOME);
      expect(value).not.toContain(INHERITED.USER);
      expect(value).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    }
    const pin = writeCaptureDummy({ variant: 'v2' });
    const outcome = await captureV2(pin);
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(filesCarrying(outcome.executionDir, GATE_PROJECTS_DIR), 'files under the execution directory carrying the projects directory').toEqual([]);
    expect(filesCarrying(outcome.executionDir, GATE_CONFIG_DIR), 'files under the execution directory carrying the config directory').toEqual([]);
    // Positive controls: the gate printed both values ...
    const printed = readFileSync(join(recordDir, 'gate-v2-stdout.txt'), 'utf8');
    expect(printed).toContain(GATE_PROJECTS_DIR);
    expect(printed).toContain(GATE_CONFIG_DIR);
    // ... its stream was filed, both keys in it with their values replaced ...
    const gateStream = JSON.parse(readFileSync(join(outcome.streamsDir!, 'gate-launch1.sanitised.jsonl'), 'utf8').trim()) as Record<string, unknown>;
    expect(gateStream).toEqual({ ...GATE_V2, email: REDACTED, orgId: REDACTED, orgName: REDACTED, projectsDirectory: REDACTED, configDirectory: REDACTED });
    // ... and the gate read them as present.
    expect(outcome.gate?.fields).toMatchObject({ projectsDirectory: 'PRESENT', configDirectory: 'PRESENT' });
    // The trust block the completed run filed (Task 5c review repair R5).
    expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  });

  it('V2-H1 — @2\'s transport handed a description @1\'s adapter builds (a test adapter with @2\'s identity and invocation) launches no role child: the transport refuses it by --settings, and the execution fails naming that', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const paired = { ...CLAUDE_CODE_CLI_V2_ADAPTER, buildRequest: CLAUDE_CODE_CLI_ADAPTER.buildRequest };
    const outcome = await captureV2(pin, { adapter: paired });
    expect(roleLaunchCount(), 'role children launched for a description whose settings the profile never stated').toBe(0);
    expect(outcome.status).toBe('failed');
    // The runner books a refusal it cannot classify as ambiguous; the refusal's own name and words ride in the message.
    expect(outcome.error?.name).toBe('ProviderAmbiguousFailureError');
    expect(outcome.error?.message).toContain('LaunchSettingsMismatchError');
    expect(outcome.error?.message).toContain('--settings');
    expect(outcome.error?.message).toContain('the launch description and the transport\'s profile disagree');
    expect(outcome.launches).toBe(0);
    // The gate did run: what refused was the role launch, not the route.
    expect(gateLaunchCount()).toBe(1);
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ role: 'reader', index: 0, launched: false, possiblyBilled: false });
    expect(attempts[0]!['detail']).toContain('LaunchSettingsMismatchError');
    expect(readdirSync(tempRoot)).toEqual([]);
    expect(outcome.transcriptPath).toBeNull();
    // The refusal was thrown from the roles, so the command reached no stage, and nothing was assessed (Task 5c).
    expectTrust(outcome.summaryPath, trustBlock('failed', 'ProviderAmbiguousFailureError', 'unassessed', 'unassessed', null));
  });

  it('V2-AT1 — the agents suite\'s subscription timeout is computed with subscriptionLifetimeMs: read from its source text, never imported or run', () => {
    const text = readFileSync(join(engineRoot, 'test', 'pipeline-live.agents.test.ts'), 'utf8');
    const block = (name: string): string => {
      const start = text.indexOf(`const ${name} = (() => {`);
      expect(start, `the block defining ${name}`).toBeGreaterThan(-1);
      return text.slice(start, text.indexOf('})();', start));
    };
    const subscription = block('subscriptionTestTimeoutMs');
    expect(subscription).toContain('subscriptionLifetimeMs(subscriptionCaptureConfigFrom(process.env).budget)');
    expect(subscription).not.toContain('executionLifetimeMs(');
    // Positive control: the same reading finds the HTTP case's lifetime function in its own block.
    const http = block('lifetimeMs');
    expect(http).toContain('executionLifetimeMs(liveCaptureConfigFrom(process.env).budget)');
    expect(http).not.toContain('subscriptionLifetimeMs(');
    // The subscription case's timeout is that value, and the old local name, which shadowed the export, is gone.
    expect(text).toContain('    subscriptionTestTimeoutMs + LIFETIME_MARGIN_MS,\n  );');
    expect(text).not.toMatch(/const subscriptionLifetimeMs\b/);
    expect(text).toMatch(/import \{[^}]*\bsubscriptionLifetimeMs,[^}]*\} from '\.\/live-capture';/);
  });

  it('V2-B5 — maxRoleLaunchesFor follows the configuration it is handed, and SubscriptionBudgetError names the prosecutor count it is handed (Task 5a review repair R7)', () => {
    // Configurations the harness cannot produce: its own make nine role launches, so only a direct call shows the count is computed.
    expect(maxRoleLaunchesFor({ prosecutorCount: 3 })).toBe(5);
    expect(maxRoleLaunchesFor({ prosecutorCount: 7 })).toBe(9);
    expect(maxRoleLaunchesFor({ prosecutorCount: 0 })).toBe(2);
    const error = new SubscriptionBudgetError('claude-code-cli@2', 10, 9, 7);
    expect(error).toBeInstanceOf(SubscriptionBudgetError);
    expect(error.name).toBe('SubscriptionBudgetError');
    expect(error.message).toContain('claude-code-cli@2 admits a launch budget of at most 9');
    expect(error.message).toContain('(one reader, 7 prosecutors, one adjudicator)');
    expect(error.message).toContain('DATASTRATA_AGENT_MAX_ATTEMPTS states 10');
    // The count is the one handed in, never the maximum less two: a pair no configuration makes tells the two apart.
    expect(new SubscriptionBudgetError('claude-code-cli@2', 10, 9, 4).message).toContain('(one reader, 4 prosecutors, one adjudicator)');
  });

  it('V2-GT1 — a deadline ends a stalled @2 gate through the gate\'s own controller, which follows the lifetime: filed as the deadline\'s cancellation, not GateTimeout, far inside the profile\'s gate timeout (Task 5a review repair R1)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2', gateStall: true });
    warmDummy(pin);
    const started = Date.now();
    // The gate timeout is the profile's 60,000 ms, which cannot fire during this case: only the lifetime can end the gate.
    const outcome = await settleWithin(captureV2(pin, { deadlineMs: 500 }), 8_000);
    const elapsed = Date.now() - started;
    expect(outcome, 'the gate outlived the deadline: the capture had not finished 8,000 ms after a 500 ms deadline').not.toBeNull();
    expect(outcome!.cancellationReason).toBe('deadline of 500 ms');
    expect(outcome!.error?.name).toBe('ProcessTransportError');
    expect(outcome!.error?.message).toContain('aborted while the child was running (deadline of 500 ms)');
    expect(outcome!.status).toBe('failed');
    expect(outcome!.cancelled).toBe(true);
    expect(elapsed).toBeLessThan(8_000);
    expect(outcome!.gateLaunches).toBe(1);
    expect(gateLaunchCount()).toBe(1);
    expect(roleLaunchCount()).toBe(0);
    expect(outcome!.launches).toBe(0);
    expect(outcome!.gate).toBeNull();
    // The gate child was running when the deadline fired, and the transport ended it: TERM, reaped, its group gone.
    const [gateLine] = launchLinesOf(outcome!.launchesPath!);
    expect(gateLine!.kind).toBe('gate');
    expect(gateLine!.facts).toMatchObject({ started: true, exitCode: null, signal: 'SIGTERM' });
    expect(gateLine!.facts.termination).toMatchObject({ forced: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true });
    expect(groupAlive(gateLine!.facts.pid!)).toBe(false);
    const summary = summaryOf(outcome!.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'deadline of 500 ms', gateLaunches: 1, launches: 0, error: { name: 'ProcessTransportError' } });
    expect(summary['budgets']).toEqual({ launchTimeoutMs: 1_800_000, gateTimeoutMs: 60_000, lifetimeMs: 16_470_000, injected: false });
    // No role ran, so nothing was assessed (Task 5c review repair R5).
    expectTrust(outcome!.summaryPath, trustBlock('failed', 'ProcessTransportError', 'unassessed', 'unassessed', null));
  }, 20_000);

  it('V2-GT2 — the first SIGINT while a @2 gate stalls ends it through the gate\'s own controller: filed as the operator\'s cancellation, not GateTimeout, in bounded time (Task 5a review repair R1)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2', gateStall: true });
    const interrupts = new EventEmitter();
    const pending = captureV2(pin, {}, { interrupts });
    await awaitGateLaunched();
    const sent = Date.now();
    interrupts.emit('SIGINT');
    const outcome = await settleWithin(pending, 8_000);
    const elapsed = Date.now() - sent;
    expect(outcome, 'the gate outlived the interrupt: the capture had not finished 8,000 ms after the first SIGINT').not.toBeNull();
    expect(outcome!.cancellationReason).toBe('operator:SIGINT');
    expect(outcome!.interruptedBy).toBe('SIGINT');
    expect(outcome!.interrupts.map((i) => [i.signal, i.action])).toEqual([['SIGINT', 'abort']]);
    expect(outcome!.error?.name).toBe('ProcessTransportError');
    expect(outcome!.error?.message).toContain('aborted while the child was running (operator:SIGINT)');
    expect(outcome!.status).toBe('failed');
    expect(outcome!.cancelled).toBe(true);
    expect(elapsed).toBeLessThan(8_000);
    expect(outcome!.gateLaunches).toBe(1);
    expect(roleLaunchCount()).toBe(0);
    expect(outcome!.launches).toBe(0);
    const [gateLine] = launchLinesOf(outcome!.launchesPath!);
    expect(gateLine!.facts).toMatchObject({ started: true, exitCode: null, signal: 'SIGTERM' });
    expect(gateLine!.facts.termination!.signalsSent).toEqual(['SIGTERM']);
    expect(groupAlive(gateLine!.facts.pid!)).toBe(false);
    expect(interrupts.listenerCount('SIGINT') + interrupts.listenerCount('SIGTERM')).toBe(0);
    expect(summaryOf(outcome!.summaryPath)).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'operator:SIGINT', interruptedBy: 'SIGINT', error: { name: 'ProcessTransportError' } });
    // No role ran, so nothing was assessed (Task 5c review repair R5).
    expectTrust(outcome!.summaryPath, trustBlock('failed', 'ProcessTransportError', 'unassessed', 'unassessed', null));
  }, 20_000);

  it('V2-GT3 — the gate\'s timer is cleared once the gate has answered: a run that outlasts an injected gate timeout of 1,000 ms after a prompt gate completes (Task 5a review repair R2)', async () => {
    // The reader sleeps two seconds before answering, so the run is still in its first role when a leaked
    // gate timer of 1,000 ms would fire.
    const pin = writeCaptureDummy({ variant: 'v2', delayAt: { launch: 1, seconds: 2 } });
    const started = Date.now();
    const outcome = await captureV2(pin, {}, { gateTimeoutMs: 1_000 });
    const elapsed = Date.now() - started;
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(outcome.cancelled).toBe(false);
    expect(outcome.cancellationReason).toBeNull();
    expect(outcome.error).toBeNull();
    expect(roleLaunchCount()).toBe(9);
    // The run did outlast the gate timeout: the reader launched after the gate's timer was armed and ran longer than it.
    const launches = launchLinesOf(outcome.launchesPath!);
    expect([launches[1]!.role, launches[1]!.index]).toEqual(['reader', 0]);
    expect(launches[1]!.facts.durationMs).toBeGreaterThan(1_000);
    expect(elapsed).toBeGreaterThan(1_000);
    // 9 × 1,815,000 + 1,000 + 15,000 + 60,000, over the injected gate timeout.
    expect(summaryOf(outcome.summaryPath)['budgets']).toEqual({ launchTimeoutMs: 1_800_000, gateTimeoutMs: 1_000, lifetimeMs: 16_411_000, injected: true });
    // The trust block the completed run filed (Task 5c review repair R5).
    expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 20_000);

  it('V2-GT4 — subscriptionErrorOf files GateTimeout only for the transport\'s own abort of the gate launch under the gate timer; every other error keeps its own name, and says when the timer had fired (Task 5a review repair R3)', () => {
    const facts: ProcessFacts = { started: false, pid: null, exitCode: null, signal: null, durationMs: 0, stdoutBytes: 0, stderrBytes: 0, promptFileBytes: null, stdinBytes: null, promptFileRemoved: null, promptFileRemovalError: null, termination: null };
    const running = new ProcessTransportError('aborted while the child was running (gate_timeout)', facts);
    const beforeLaunch = new ProcessTransportError('aborted before launch', facts);
    const note = 'the gate timer of 60000 ms had fired, and the lifetime was aborted for gate_timeout';
    // All three conditions: the gate call, the transport's abort (either wording), the lifetime aborted for gate_timeout.
    expect(subscriptionErrorOf(running, 'gate', 'gate_timeout', 60_000)).toEqual({ name: 'GateTimeout', message: 'the authentication gate did not finish within its gate timeout of 60000 ms; the gate child was ended and no role was dispatched' });
    expect(subscriptionErrorOf(beforeLaunch, 'gate', 'gate_timeout', 60_000).name).toBe('GateTimeout');
    // The error, alone: a pin mismatch and an evidence failure thrown by the gate call under the same reason keep their names.
    const pinMismatch = subscriptionErrorOf(new ExecutablePinMismatchError('/pinned/claude not readable (ENOENT)'), 'gate', 'gate_timeout', 60_000);
    expect(pinMismatch.name).toBe('ExecutablePinMismatchError');
    expect(pinMismatch.message).toContain('executable pin mismatch: /pinned/claude not readable (ENOENT)');
    expect(pinMismatch.message).toContain(note);
    const evidence = subscriptionErrorOf(new EvidenceObservationFailedError('onLaunch refused the gate launch record: Error: EISDIR'), 'gate', 'gate_timeout', 60_000);
    expect(evidence.name).toBe('EvidenceObservationFailedError');
    expect(evidence.message).toContain('onLaunch refused the gate launch record: Error: EISDIR');
    expect(evidence.message).toContain(note);
    // The same class in other words: the transport's own output bound is not an abort.
    const overflow = subscriptionErrorOf(new ProcessTransportError('output_too_large: stdout+stderr exceeded 10 bytes', facts), 'gate', 'gate_timeout', 60_000);
    expect(overflow.name).toBe('ProcessTransportError');
    expect(overflow.message).toContain('output_too_large');
    expect(overflow.message).toContain(note);
    // The reason, alone: the transport's abort under a deadline, or a lifetime not aborted at all, is the transport's error, unannotated.
    expect(subscriptionErrorOf(new ProcessTransportError('aborted while the child was running (deadline of 300 ms)', facts), 'gate', 'deadline of 300 ms', 60_000)).toEqual({ name: 'ProcessTransportError', message: 'aborted while the child was running (deadline of 300 ms)' });
    expect(subscriptionErrorOf(beforeLaunch, 'gate', undefined, 60_000)).toEqual({ name: 'ProcessTransportError', message: 'aborted before launch' });
    // The phase, alone: the same abort thrown once the roles were dispatched is never a gate timeout.
    const role = subscriptionErrorOf(running, 'roles', 'gate_timeout', 60_000);
    expect(role.name).toBe('ProcessTransportError');
    expect(role.message).toContain('aborted while the child was running (gate_timeout)');
    expect(role.message).toContain(note);
  });

  it('V2-GT5 — the gate timer firing while a deadline is still ending a TERM-ignoring gate leaves the deadline\'s account: ProcessTransportError, deadline of 300 ms (Task 5a review repair R3)', async () => {
    // TERM at the deadline (300 ms) is ignored, KILL follows a TERM grace (300 ms) later, at about 600 ms, and the
    // gate timer (450 ms) fires between the two, while the gate is still being ended. Both are timers, so they
    // fire in that order.
    const pin = writeCaptureDummy({ variant: 'v2', gateStall: 'ignore-term' });
    // Warmed, so the gate has run its first line — the trap — long before the deadline.
    warmDummy(pin);
    const outcome = await settleWithin(captureV2(pin, { deadlineMs: 300 }, { gateTimeoutMs: 450 }), 8_000);
    expect(outcome, 'the capture had not finished 8,000 ms after a 300 ms deadline').not.toBeNull();
    // The race was run: the gate ignored TERM, was killed, and outlived the gate timer's 450 ms.
    const [gateLine] = launchLinesOf(outcome!.launchesPath!);
    expect(gateLine!.kind).toBe('gate');
    expect(gateLine!.facts.termination!.signalsSent).toEqual(['SIGTERM', 'SIGKILL']);
    expect(gateLine!.facts.signal).toBe('SIGKILL');
    expect(gateLine!.facts.durationMs).toBeGreaterThanOrEqual(450);
    expect(groupAlive(gateLine!.facts.pid!)).toBe(false);
    expect(outcome!.cancellationReason).toBe('deadline of 300 ms');
    expect(outcome!.error?.name).toBe('ProcessTransportError');
    expect(outcome!.error?.message).toBe('aborted while the child was running (deadline of 300 ms)');
    expect(outcome!.status).toBe('failed');
    expect(roleLaunchCount()).toBe(0);
    expect(summaryOf(outcome!.summaryPath)).toMatchObject({ cancellationReason: 'deadline of 300 ms', error: { name: 'ProcessTransportError' } });
    // No role ran, so nothing was assessed (Task 5c review repair R5).
    expectTrust(outcome!.summaryPath, trustBlock('failed', 'ProcessTransportError', 'unassessed', 'unassessed', null));
  }, 20_000);

  /** One uninjected `@2` capture, `@2` handed in explicitly (the route's default is `@3`): no launch, no executable, only the nonexistent inherited HOME and the harness's small graces. */
  const captureUninjected = (executionId: string, sub: SubOver = {}) =>
    captureLiveRun({
      packId: FIRST_LIVE_CASE.packId,
      requirementId: FIRST_LIVE_CASE.requirementId,
      paths: paths(),
      executionRoot: root(),
      env: SUB_ENV_V2,
      route: 'subscription',
      adapter: CLAUDE_CODE_CLI_V2_ADAPTER,
      executionId,
      subscription: { inheritedEnv: { ...INHERITED }, interrupts: new EventEmitter(), termGraceMs: 300, killGraceMs: 300, tempRoot, ...sub },
    });
  /** `@2`'s pin resolved under the nonexistent inherited HOME, written out. */
  const V2_PIN_UNDER_INHERITED_HOME = '/nonexistent/ds-capture-home/.local/share/datastrata/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude';

  it('V2-D2 — @2 with neither an injected launch nor an injected executable passes the D-1 refusal and the budget cap, resolves @2\'s own pin under the inherited HOME, and is refused by the pin check before any spawn: transport spawn, synthetic false (Task 5a review repair R4)', async () => {
    // The inherited HOME is the nonexistent literal, so the default executable resolves where nothing exists: the
    // pin check refuses it by stat before any launch, and the process guard is the second layer. Nothing under
    // the real HOME is resolved, stat'ed or hashed.
    const guardCalls = processGuard().calls.length;
    let outcome: Awaited<ReturnType<typeof captureLiveRun>> | undefined;
    let refused: unknown = null;
    try {
      outcome = await captureUninjected('no-injection');
    } catch (error) {
      refused = error;
    }
    expect(refused, 'the @2 execution with no injected launch was refused before anything was created').toBeNull();
    expect(existsSync(outcome!.executionDir)).toBe(true);
    expect(outcome!.status).toBe('failed');
    expect(outcome!.error?.name).toBe('ExecutablePinMismatchError');
    // This pins today's behaviour, which predates the migration, and is a recorded limitation for the checkpoint,
    // not a guarantee: `describeError(thrown, '')` redacts nothing, so `execution.json.error` carries the pin path
    // resolved against the inherited HOME — and in production `execution.json` also carries absolute paths under
    // the operator's HOME in `transcriptPath`, `resultPath` and `lines`. NEVER_FILED is tested only with a fake
    // HOME outside the execution root (Task 5a review repair N8).
    expect(outcome!.error?.message).toContain(`executable pin mismatch: ${V2_PIN_UNDER_INHERITED_HOME} not readable (ENOENT)`);
    expect(outcome!.gateLaunches).toBe(0);
    expect(outcome!.launches).toBe(0);
    expect(outcome!.gate).toBeNull();
    expect(processGuard().calls.slice(guardCalls), 'launches the process guard saw').toEqual([]);
    const summary = summaryOf(outcome!.summaryPath);
    expect(summary).toMatchObject({ adapter: 'claude-code-cli@2', transport: 'spawn', synthetic: false, status: 'failed', error: { name: 'ExecutablePinMismatchError' } });
    expect(summary['pin']).toEqual({ version: '2.1.295', sha256: '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6', sizeBytes: 239695888, injected: false });
    expect(summary['budgets']).toEqual({ launchTimeoutMs: 1_800_000, gateTimeoutMs: 60_000, lifetimeMs: 16_470_000, injected: false });
    // Refused at the gate's pin check: nothing was assessed (Task 5c).
    expectTrust(outcome!.summaryPath, trustBlock('failed', 'ExecutablePinMismatchError', 'unassessed', 'unassessed', null));
    // Positive control for the guard's empty log: the same request with only the dummy's pin injected launches its
    // gate through the same default launch, and the guard records that launch. Its gate refuses, so no role runs.
    const pin = writeCaptureDummy({ variant: 'v2', gate: { ...GATE_V2, apiKeySource: 'ANTHROPIC_API_KEY' } });
    const before = processGuard().calls.length;
    const control = await captureUninjected('pin-only', { executable: pin });
    expect(processGuard().calls.slice(before)).toEqual([`spawn ${pin.path}`]);
    expect(control.gateLaunches).toBe(1);
    expect(control.error?.name).toBe(GATE_REFUSED_ERROR_NAME);
    expect(summaryOf(control.summaryPath)).toMatchObject({ transport: 'spawn', synthetic: true, pin: { injected: true } });
    // That gate child was launched by the production default spawn, outside `recordingLaunch`: tracked by the pid its
    // launch line reports, before anything else is asserted, so both scans cover it; then its end, as the transport
    // reports it — started, exited on its own with code 0 and no signal, its pipes closed, and `termination: null`,
    // which the transport writes only for a child it saw exit unsignalled with its group gone (Task 5a review repair N6).
    const [gateLine] = launchLinesOf(control.launchesPath!);
    const gatePid = gateLine!.facts.pid;
    if (typeof gatePid === 'number') trackReportedPid(gatePid);
    expect(gateLine!.kind).toBe('gate');
    expect(gatePid, 'the gate child\'s pid, as the transport reported it').toEqual(expect.any(Number));
    expect(gateLine!.facts).toMatchObject({ started: true, exitCode: 0, signal: null, termination: null });
    expect(gateLine!.streamsClosed).toBe(true);
    expect(groupAlive(gatePid!), 'the gate child\'s group, after the capture').toBe(false);
    // The gate refused on @2: nothing was assessed (Task 5c). Last, after the gate child is tracked (Task 5c review
    // repair R3), so a red here cannot skip the tracking that would catch a stranded child.
    expectTrust(control.summaryPath, trustBlock('failed', 'AuthenticationGateRefused', 'unassessed', 'unassessed', null));
  });

  it.each([
    ['gateTimeoutMs', { gateTimeoutMs: 10_000 }, { launchTimeoutMs: 1_800_000, gateTimeoutMs: 10_000, lifetimeMs: 16_420_000, injected: true }],
    ['launchTimeoutMs', { launchTimeoutMs: 10_000 }, { launchTimeoutMs: 10_000, gateTimeoutMs: 60_000, lifetimeMs: 360_000, injected: true }],
  ] as const)('V2-D3 — the same uninjected @2 request with %s injected is synthetic, its budgets marked injected, though the launch and the executable are not (Task 5a review repair R4)', async (_option, sub, budgets) => {
    const guardCalls = processGuard().calls.length;
    const outcome = await captureUninjected('timeout-only', sub);
    expect(outcome.error?.name).toBe('ExecutablePinMismatchError');
    expect(outcome.error?.message).toContain(`executable pin mismatch: ${V2_PIN_UNDER_INHERITED_HOME} not readable (ENOENT)`);
    expect(outcome.gateLaunches).toBe(0);
    expect(processGuard().calls.slice(guardCalls)).toEqual([]);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary['synthetic'], 'synthetic, with only a time bound injected').toBe(true);
    expect(summary).toMatchObject({ transport: 'spawn', pin: { injected: false } });
    expect(summary['budgets']).toEqual(budgets);
    // Refused at the gate's pin check: nothing was assessed (Task 5c review repair R5).
    expectTrust(outcome.summaryPath, trustBlock('failed', 'ExecutablePinMismatchError', 'unassessed', 'unassessed', null));
  });

  it('V2-GT6 — an evidence failure while the gate timer ends a stalled gate keeps its own name and says the timer had fired: it is not filed as GateTimeout (Task 5a review repair R3)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2', gateStall: true });
    warmDummy(pin);
    const executionId = 'gate-evidence-failure';
    const launchesPath = join(root(), 'csrd', 'CSRD-S-002', executionId, 'launches.jsonl');
    // The gate's launch line cannot be filed: its file is made a directory as the gate is launched, so the
    // record the transport hands over once the timer has ended the gate is refused (EISDIR).
    const breaking: LaunchFunction = (file, args, options) => {
      rmSync(launchesPath);
      mkdirSync(launchesPath);
      return recordingLaunch(file, args, options);
    };
    const outcome = await captureV2(pin, { executionId }, { launch: breaking, gateTimeoutMs: 500 });
    expect(outcome.error?.name).toBe('EvidenceObservationFailedError');
    expect(outcome.error?.message).toContain('onLaunch refused the gate launch record');
    expect(outcome.error?.message).toContain('EISDIR');
    expect(outcome.error?.message).toContain('the gate timer of 500 ms had fired');
    // The timer did fire and end the gate: the cancellation reason is its own, and nothing was dispatched.
    expect(outcome.cancellationReason).toBe('gate_timeout');
    expect(outcome.cancelled).toBe(true);
    expect(outcome.status).toBe('failed');
    expect(gateLaunchCount()).toBe(1);
    expect(outcome.gateLaunches).toBe(0);
    expect(roleLaunchCount()).toBe(0);
    expect(summaryOf(outcome.summaryPath)).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'gate_timeout', error: { name: 'EvidenceObservationFailedError' } });
    // No role ran, so nothing was assessed (Task 5c review repair R5).
    expectTrust(outcome.summaryPath, trustBlock('failed', 'EvidenceObservationFailedError', 'unassessed', 'unassessed', null));
  }, 20_000);

  /** GateTimeout's words for each way the gate's timer can meet the gate launch, as literals (Task 5a review repair N2). */
  const GATE_TIMEOUT_ENDED = 'the gate child was ended';
  const GATE_TIMEOUT_BEFORE_LAUNCH = 'the timer fired before the gate child was launched (none was)';
  const GATE_TIMEOUT_AFTER_ANSWER = 'the timer fired after the gate child had answered, so its verdict was not taken';

  it('V2-GT7 — gateVerdictErrorOf files a verdict the gate call returned after the gate timer had fired as GateTimeout, and leaves a verdict under any other reason, or none, to its own handling (Task 5a review repair N1)', () => {
    // The timer's reason: the verdict is not taken.
    expect(gateVerdictErrorOf('gate_timeout', 60_000)).toEqual({ name: 'GateTimeout', message: 'the authentication gate did not finish within its gate timeout of 60000 ms; the timer fired after the gate child had answered, so its verdict was not taken, and no role was dispatched' });
    expect(gateVerdictErrorOf('gate_timeout', 7_919)?.message).toContain('gate timeout of 7919 ms');
    // Any other reason, or a lifetime not aborted at all: nothing is filed here, and the verdict's own handling applies.
    expect(gateVerdictErrorOf('deadline of 300 ms', 60_000)).toBeNull();
    expect(gateVerdictErrorOf(undefined, 60_000)).toBeNull();
    expect(gateVerdictErrorOf('operator:SIGINT', 60_000)).toBeNull();
    expect(gateVerdictErrorOf('role_failed:reader[0]', 60_000)).toBeNull();
  });

  it('V2-GT8 — GateTimeout says how the timer met the gate launch: the running child was ended; the timer fired before the child was launched, and none was; the timer fired after the child had answered, and its verdict was not taken — each in its own words and none in another\'s (Task 5a review repair N2)', () => {
    const facts: ProcessFacts = { started: false, pid: null, exitCode: null, signal: null, durationMs: 0, stdoutBytes: 0, stderrBytes: 0, promptFileBytes: null, stdinBytes: null, promptFileRemoved: null, promptFileRemovalError: null, termination: null };
    // The transport ended the running gate child: the one path on which the timer ended a child.
    const ended = subscriptionErrorOf(new ProcessTransportError('aborted while the child was running (gate_timeout)', facts), 'gate', 'gate_timeout', 60_000);
    expect(ended.name).toBe('GateTimeout');
    expect(ended.message).toContain(GATE_TIMEOUT_ENDED);
    expect(ended.message).not.toContain(GATE_TIMEOUT_BEFORE_LAUNCH);
    expect(ended.message).not.toContain(GATE_TIMEOUT_AFTER_ANSWER);
    // The transport refused to launch: the timer fired during the pin check, before the gate child existed.
    const beforeLaunch = subscriptionErrorOf(new ProcessTransportError('aborted before launch', facts), 'gate', 'gate_timeout', 60_000);
    expect(beforeLaunch.name).toBe('GateTimeout');
    expect(beforeLaunch.message).toContain(GATE_TIMEOUT_BEFORE_LAUNCH);
    expect(beforeLaunch.message).not.toContain(GATE_TIMEOUT_ENDED);
    expect(beforeLaunch.message).not.toContain(GATE_TIMEOUT_AFTER_ANSWER);
    // The gate call returned a verdict after the timer had fired: the child had answered and nothing ended it.
    const afterAnswer = gateVerdictErrorOf('gate_timeout', 60_000);
    expect(afterAnswer?.name).toBe('GateTimeout');
    expect(afterAnswer?.message).toContain(GATE_TIMEOUT_AFTER_ANSWER);
    expect(afterAnswer?.message).not.toContain(GATE_TIMEOUT_ENDED);
    expect(afterAnswer?.message).not.toContain(GATE_TIMEOUT_BEFORE_LAUNCH);
    // Each whole, as filed.
    expect(ended.message).toBe('the authentication gate did not finish within its gate timeout of 60000 ms; the gate child was ended and no role was dispatched');
    expect(beforeLaunch.message).toBe('the authentication gate did not finish within its gate timeout of 60000 ms; the timer fired before the gate child was launched (none was), and no role was dispatched');
    expect(afterAnswer?.message).toBe('the authentication gate did not finish within its gate timeout of 60000 ms; the timer fired after the gate child had answered, so its verdict was not taken, and no role was dispatched');
  });

  it('V2-GT9 — only the transport\'s own class is its abort: a plain Error, a TypeError and another Error subclass carrying the transport\'s abort words under the gate timer keep their own names, while a ProcessTransportError with the same words is GateTimeout (Task 5a review repair N3)', () => {
    const facts: ProcessFacts = { started: false, pid: null, exitCode: null, signal: null, durationMs: 0, stdoutBytes: 0, stderrBytes: 0, promptFileBytes: null, stdinBytes: null, promptFileRemoved: null, promptFileRemovalError: null, termination: null };
    const note = 'the gate timer of 60000 ms had fired, and the lifetime was aborted for gate_timeout';
    for (const words of ['aborted before launch', 'aborted while the child was running (gate_timeout)']) {
      // Positive control: the transport's own class, in these words, is the gate timeout.
      expect(subscriptionErrorOf(new ProcessTransportError(words, facts), 'gate', 'gate_timeout', 60_000).name, `ProcessTransportError: ${words}`).toBe('GateTimeout');
      // The same words from anything else are not the transport's abort: the words alone decide nothing.
      for (const thrown of [new Error(words), new TypeError(words), new EvidenceObservationFailedError(words)]) {
        const filed = subscriptionErrorOf(thrown, 'gate', 'gate_timeout', 60_000);
        expect(filed.name, `${thrown.name}: ${words}`).toBe(thrown.name);
        expect(filed.message, `${thrown.name}: ${words}`).toBe(`${words} (${note})`);
      }
    }
  });

  it('V2-GT10 — the gate timer firing after the gate child has answered, while its launch is being filed, fails the execution as GateTimeout saying the verdict was not taken: the child exited on its own, nothing ended it, and no role was dispatched (Task 5a review repair N1, N2)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const gateTimer = holdTimersAt(7_919);
    // The harness's clock is first read after the gate child is launched as the gate's launch line is filed — after
    // the child has answered, exited and closed its pipes, before the verdict is returned — and at that reading the
    // held gate timer is fired. The verdict is then read in the microtasks that follow, so this is the instant at
    // which the call site, not the transport, meets the timer.
    let firedAtGateLine = false;
    const clock = (): Date => {
      if (!firedAtGateLine && children.length === 1) {
        firedAtGateLine = true;
        gateTimer.fire();
      }
      return new Date();
    };
    let outcome: Awaited<ReturnType<typeof captureV2>>;
    try {
      outcome = await captureV2(pin, { now: clock }, { gateTimeoutMs: 7_919 });
    } finally {
      gateTimer.restore();
    }
    expect(firedAtGateLine, 'the held gate timer was fired as the gate line was filed').toBe(true);
    expect(gateTimer.counts()).toEqual({ armed: 1, fired: 1 });
    expect(outcome.error?.name).toBe('GateTimeout');
    expect(outcome.error?.message).toContain('gate timeout of 7919 ms');
    expect(outcome.error?.message).toContain(GATE_TIMEOUT_AFTER_ANSWER);
    expect(outcome.error?.message).not.toContain(GATE_TIMEOUT_ENDED);
    expect(outcome.error?.message).not.toContain(GATE_TIMEOUT_BEFORE_LAUNCH);
    expect(outcome.cancellationReason).toBe('gate_timeout');
    expect(outcome.cancelled).toBe(true);
    expect(outcome.status).toBe('failed');
    // The verdict was returned, and passed, and was not taken: nothing was dispatched.
    expect(outcome.gate).toMatchObject({ pass: true, reasons: [] });
    expect(roleLaunchCount()).toBe(0);
    expect(outcome.launches).toBe(0);
    expect(attemptsOf(outcome.attemptsPath)).toEqual([]);
    // The gate child ran, answered and exited by itself: no signal was sent, and its group was seen gone.
    expect(gateLaunchCount()).toBe(1);
    expect(outcome.gateLaunches).toBe(1);
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches.map((line) => line.kind)).toEqual(['gate']);
    expect(launches[0]!.facts).toMatchObject({ started: true, exitCode: 0, signal: null, termination: null });
    expect(launches[0]!.streamsClosed).toBe(true);
    expect(groupAlive(launches[0]!.facts.pid!)).toBe(false);
    expect(summaryOf(outcome.summaryPath)).toMatchObject({ status: 'failed', cancelled: true, cancellationReason: 'gate_timeout', gate: { pass: true }, error: { name: 'GateTimeout' } });
    // The verdict was not taken and no role ran: nothing was assessed (Task 5c).
    expectTrust(outcome.summaryPath, trustBlock('failed', 'GateTimeout', 'unassessed', 'unassessed', null));
  }, 20_000);

  it('V2-GT11 — the gate timer firing during the gate\'s pin check fails the execution as GateTimeout saying no gate child was launched, and none was; the same request with the timer held unfired launches its gate (Task 5a review repair N2)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2', gate: { ...GATE_V2, apiKeySource: 'ANTHROPIC_API_KEY' } });
    const gateTimer = holdTimersAt(7_919, true);
    let outcome: Awaited<ReturnType<typeof captureV2>>;
    try {
      outcome = await captureV2(pin, {}, { gateTimeoutMs: 7_919 });
    } finally {
      gateTimer.restore();
    }
    expect(gateTimer.counts()).toEqual({ armed: 1, fired: 1 });
    expect(outcome.error?.name).toBe('GateTimeout');
    expect(outcome.error?.message).toContain('gate timeout of 7919 ms');
    expect(outcome.error?.message).toContain(GATE_TIMEOUT_BEFORE_LAUNCH);
    expect(outcome.error?.message).not.toContain(GATE_TIMEOUT_ENDED);
    expect(outcome.error?.message).not.toContain(GATE_TIMEOUT_AFTER_ANSWER);
    expect(outcome.cancellationReason).toBe('gate_timeout');
    expect(outcome.status).toBe('failed');
    expect(outcome.gate).toBeNull();
    // No gate child existed: nothing spawned, the dummy never ran, no launch directory was made, no line filed.
    expect(children).toHaveLength(0);
    expect(gateLaunchCount()).toBe(0);
    expect(outcome.gateLaunches).toBe(0);
    expect(readFileSync(outcome.launchesPath!, 'utf8')).toBe('');
    expect(readdirSync(tempRoot)).toEqual([]);
    expect(roleLaunchCount()).toBe(0);
    // No gate child and no role: nothing was assessed (Task 5c).
    expectTrust(outcome.summaryPath, trustBlock('failed', 'GateTimeout', 'unassessed', 'unassessed', null));
    // Positive control: the same request, the timer held but never fired, launches its gate child, which refuses.
    const control = holdTimersAt(7_919);
    let controlled: Awaited<ReturnType<typeof captureV2>>;
    try {
      controlled = await captureV2(pin, {}, { gateTimeoutMs: 7_919 });
    } finally {
      control.restore();
    }
    expect(control.counts()).toEqual({ armed: 1, fired: 0 });
    expect(controlled.error?.name).toBe(GATE_REFUSED_ERROR_NAME);
    expect(controlled.cancellationReason).toBeNull();
    expect(children).toHaveLength(1);
    expect(gateLaunchCount()).toBe(1);
    expect(controlled.gateLaunches).toBe(1);
    expect(roleLaunchCount()).toBe(0);
    expectTrust(controlled.summaryPath, trustBlock('failed', 'AuthenticationGateRefused', 'unassessed', 'unassessed', null));
  }, 20_000);

  it.each(['launchTimeoutMs', 'gateTimeoutMs'] as const)('V2-B6 — an injected %s that is not a positive integer of at most 2^31 - 1 ms is refused by name before anything exists, and the largest one is accepted (Task 5a review repair R10)', async (option) => {
    const pin = writeCaptureDummy({ variant: 'v2', gate: { ...GATE_V2, apiKeySource: 'ANTHROPIC_API_KEY' } });
    const injected = (value: number): SubOver => (option === 'launchTimeoutMs' ? { launchTimeoutMs: value } : { gateTimeoutMs: value });
    for (const bad of [0, -1, 1.5, Number.NaN, 2 ** 31]) {
      let caught: unknown;
      try {
        await captureV2(pin, {}, injected(bad));
      } catch (error) {
        caught = error;
      }
      expect(caught, `${option} ${String(bad)}`).toBeInstanceOf(UnsupportedTimeoutError);
      expect((caught as Error).message, `${option} ${String(bad)}`).toContain(`refusing subscription.${option} of ${String(bad)} ms`);
      expect((caught as Error).message).toContain('a positive integer of at most 2147483647 ms');
      expect(existsSync(root()), `${option} ${String(bad)}`).toBe(false);
    }
    expect(gateLaunchCount()).toBe(0);
    // Positive control: the largest value the timers honour passes the check, and the execution runs as far as its gate.
    const accepted = await captureV2(pin, {}, injected(2_147_483_647));
    expect(accepted.error?.name).toBe(GATE_REFUSED_ERROR_NAME);
    expect(existsSync(accepted.executionDir)).toBe(true);
    expect(gateLaunchCount()).toBe(1);
    expect(summaryOf(accepted.summaryPath)['budgets']).toMatchObject({ [option]: 2_147_483_647, injected: true });
    // The gate refused on @2: nothing was assessed (Task 5c review repair R5).
    expectTrust(accepted.summaryPath, trustBlock('failed', 'AuthenticationGateRefused', 'unassessed', 'unassessed', null));
  }, 20_000);
});

// ===========================================================================
// Included usage on the @2 route (Opus 5.5 migration, Task 5b)
// ===========================================================================

describe('included usage on the @2 route: the usage stop, the in-flight stops, the backstop and the reset-pending check', () => {
  // Every `@2` value below is a literal written here, never read off the `@2` profile or adapter; every stop
  // stream is `syntheticStreamV2`'s, changed in one respect, and one `@2`'s projection classifies as intended.
  const NOTE = 'a resume is a new, separately approved execution';
  /** The clean stream's window resets at 1790075400, 2026-09-22T11:10:00Z; this instant is before it. */
  const BEFORE_RESET = '2026-09-22T10:00:00.000Z';
  const BOUNDARY = "reportedContextTokens 190001, above the per-request ceiling of 190000 (the plan's proposed value, for the user to confirm)";
  /** Runs one capture on `@2`, handed in explicitly (the route's default is `@3`), under `@2`'s budget of 9. */
  const captureV2 = (pin: { path: string; sha256: string; sizeBytes: number }, over: CaptureOver = {}, sub: SubOver = {}) =>
    captureSubscription(pin, { env: SUB_ENV_V2, adapter: CLAUDE_CODE_CLI_V2_ADAPTER, ...over }, sub);

  type Ev = Record<string, unknown>;
  const LENSES = DEFAULT_ROLE_CONFIG.lenses;
  /** Role launch `launch`'s `@2` stream as events, for its role's fixture output: `syntheticStreamV2`'s literals, parsed back so a case changes one thing. */
  const eventsFor = (launch: number): Ev[] => {
    const text =
      launch === 1 ? syntheticStreamV2(reading(), 'req_v2_reader')
      : launch === 9 ? syntheticStreamV2(adjudication(), 'req_v2_adjudicator')
      : syntheticStreamV2(prosecution(LENSES[launch - 2]!), `req_v2_prosecutor_${LENSES[launch - 2]!}`);
    return text.trim().split('\n').map((line) => JSON.parse(line) as Ev);
  };
  const isType = (type: string) => (event: Ev): boolean => event['type'] === type;
  /** The 1-based line of the first event matching; throws rather than returning 0, so a case cannot miss its target silently. */
  const lineOf = (events: Ev[], pred: (event: Ev) => boolean): number => {
    const i = events.findIndex(pred);
    if (i < 0) throw new Error('no event matching the predicate');
    return i + 1;
  };
  const rateInfoOf = (events: Ev[]): Ev => events[lineOf(events, isType('rate_limit_event')) - 1]!['rate_limit_info'] as Ev;
  const assistantUsageOf = (events: Ev[]): Ev => (events[lineOf(events, isType('assistant')) - 1]!['message'] as Ev)['usage'] as Ev;
  const messageDeltaOf = (events: Ev[]): Ev => events[lineOf(events, (event) => event['type'] === 'stream_event' && (event['event'] as Ev)['type'] === 'message_delta') - 1]!['event'] as Ev;
  /** Role launch `launch`'s stream with one change, as the text the dummy serves and the events it holds. */
  const streamWith = (launch: number, change: (events: Ev[]) => void): { text: string; events: Ev[] } => {
    const events = eventsFor(launch);
    change(events);
    return { text: `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, events };
  };
  /** An assistant API-error item shaped like the auth-failed probe's, carrying `kind` in its `error` field. */
  const apiErrorItem = (kind: string): Ev => ({
    type: 'assistant',
    error: kind,
    is_api_error_message: true,
    message: { id: 'err_1', type: 'message', role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'API Error' }], stop_reason: 'stop_sequence', stop_sequence: '', usage: { input_tokens: 0, output_tokens: 0, speed: null } },
    parent_tool_use_id: null,
    session_id: SESSION_ID,
    uuid: UUID,
  });

  /**
   * What every stop asserts: failed; the error's name and a fragment of its message; the whole usage stop; the
   * role launches, counted by the dummy and by the ledger; no transcript and no transcript directory; no result
   * file; the stopping launch's stream filed; and every attempt's outcome.
   */
  function expectStopped(
    outcome: Awaited<ReturnType<typeof captureV2>>,
    expected: { error: string; fragment: string; usageStop: unknown; roleLaunches: number; stoppedSeq: number; outcomes: string[] },
  ): LaunchLine {
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe(expected.error);
    expect(outcome.error?.message).toContain(expected.fragment);
    expect(summaryOf(outcome.summaryPath)['usageStop']).toStrictEqual(expected.usageStop);
    expect(roleLaunchCount(), 'role launches the dummy counted').toBe(expected.roleLaunches);
    expect(outcome.launches, 'role launches the ledger counted').toBe(expected.roleLaunches);
    expect(outcome.transcriptPath).toBeNull();
    expect(existsSync(join(outcome.executionDir, 'transcript'))).toBe(false);
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    const stopped = launchLinesOf(outcome.launchesPath!).find((line) => line.seq === expected.stoppedSeq);
    expect(stopped?.kind).toBe('role');
    expect(existsSync(join(outcome.executionDir, stopped!.stream!)), 'the stopping launch\'s stream is filed').toBe(true);
    expect(attemptsOf(outcome.attemptsPath).map((a) => `${a['role']}[${a['index']}] ${a['outcome']}`)).toEqual(expected.outcomes);
    // Every stop is thrown from the roles, so the command reached no stage and nothing was assessed; no harness rule
    // withheld anything, so the evidence tier is unassessed rather than withheld (Task 5c).
    expectTrust(outcome.summaryPath, trustBlock('failed', expected.error, 'unassessed', 'unassessed', null));
    return stopped!;
  }

  it('V2-U1 — exhausted at the second role launch (prosecutor[0], launch 3): CliIncludedUsageExhaustedError, and a usage stop of kind exhausted carrying the event\'s resetsAt', async () => {
    const { text, events } = streamWith(2, (ev) => { rateInfoOf(ev)['status'] = 'rejected'; });
    const line = lineOf(events, isType('rate_limit_event'));
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 2: text } }));
    expectStopped(outcome, {
      error: 'CliIncludedUsageExhaustedError',
      fragment: `the rate_limit_event at line ${line} reports status "rejected" (rateLimitType "five_hour", resetsAt 1790075400)`,
      usageStop: {
        kind: 'exhausted',
        facts: [{ fact: 'rate_limit_rejected', kind: 'exhausted', seq: 3, role: 'prosecutor', index: 0, detail: `rate_limit_event at line ${line}: rate_limit_info.status "rejected"`, resetsAt: 1790075400 }],
        seq: 3,
        role: 'prosecutor',
        index: 0,
        resetsAt: 1790075400,
        note: NOTE,
      },
      roleLaunches: 2,
      stoppedSeq: 3,
      outcomes: ['reader[0] completed', 'prosecutor[0] projection_refused'],
    });
    expect(outcome.cancellationReason).toBe('role_failed:prosecutor[0]');
  }, 20_000);

  it('V2-U2 — overage at the reader (overageStatus "allowed"): CliOverageError, and a usage stop of kind overage', async () => {
    const { text, events } = streamWith(1, (ev) => { rateInfoOf(ev)['overageStatus'] = 'allowed'; });
    const line = lineOf(events, isType('rate_limit_event'));
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }));
    expectStopped(outcome, {
      error: 'CliOverageError',
      fragment: `the rate_limit_event at line ${line} reports overage: overageStatus "allowed"`,
      usageStop: {
        kind: 'overage',
        facts: [{ fact: 'overage_status_not_rejected', kind: 'overage', seq: 2, role: 'reader', index: 0, detail: `rate_limit_event at line ${line}: rate_limit_info.overageStatus "allowed"`, resetsAt: 1790075400 }],
        seq: 2,
        role: 'reader',
        index: 0,
        resetsAt: 1790075400,
        note: NOTE,
      },
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
  }, 20_000);

  it('V2-U3 — credits at prosecutor[1] (launch 4, an API-error item asking for usage credits): CliCreditsRequiredError, and a usage stop of kind credits with no reset time', async () => {
    const { text, events } = streamWith(3, (ev) => { ev.splice(lineOf(ev, isType('rate_limit_event')) - 1, 0, apiErrorItem('model_requires_usage_credits')); });
    const line = lineOf(events, (event) => event['is_api_error_message'] === true);
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 3: text } }));
    expectStopped(outcome, {
      error: 'CliCreditsRequiredError',
      fragment: `the CLI reported API error "model_requires_usage_credits" on an assistant API-error item at line ${line}`,
      usageStop: {
        kind: 'credits',
        facts: [{ fact: 'credits_required', kind: 'credits', seq: 4, role: 'prosecutor', index: 1, detail: `assistant API-error item at line ${line}: API-error kind "model_requires_usage_credits"`, resetsAt: null }],
        seq: 4,
        role: 'prosecutor',
        index: 1,
        resetsAt: null,
        note: NOTE,
      },
      roleLaunches: 3,
      stoppedSeq: 4,
      outcomes: ['reader[0] completed', 'prosecutor[0] completed', 'prosecutor[1] projection_refused'],
    });
  }, 20_000);

  it('V2-U4 — substitution at the reader (a system model_fallback event): CliModelSubstitutionError, and no usage stop, beside the three above', async () => {
    const { text } = streamWith(1, (ev) => { ev.splice(2, 0, { type: 'system', subtype: 'model_fallback', session_id: SESSION_ID, uuid: UUID }); });
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }));
    expectStopped(outcome, {
      error: 'CliModelSubstitutionError',
      fragment: 'a system event of subtype "model_fallback" at line 3',
      usageStop: null,
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
  }, 20_000);

  it('V2-U5 — a refusal at the reader carrying a category and an explanation: ProviderRefusalError, and no usage stop; the explanation is in no launch line and nowhere in execution.json but the refusal\'s own message, and is in the filed stream', async () => {
    const EXPLANATION = 'EXPLANATION-U5-4e4e4e the request was declined';
    const { text, events } = streamWith(1, (ev) => { Object.assign(messageDeltaOf(ev)['delta'] as Ev, { stop_reason: 'refusal', stop_details: { category: 'frontier_llm', explanation: EXPLANATION } }); });
    const deltaLine = lineOf(events, (event) => event['type'] === 'stream_event' && (event['event'] as Ev)['type'] === 'message_delta');
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }));
    const stopped = expectStopped(outcome, {
      error: 'ProviderRefusalError',
      fragment: 'the model refused (category frontier_llm)',
      usageStop: null,
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
    // The observation records the stop by its reason and category.
    expect(stopped.observed?.stops).toContainEqual({ line: deltaLine, where: 'message_delta', reason: 'refusal', category: 'frontier_llm' });
    expect(readFileSync(outcome.launchesPath!, 'utf8')).not.toContain(EXPLANATION);
    const { error: filedError, ...rest } = summaryOf(outcome.summaryPath);
    expect(JSON.stringify(rest)).not.toContain(EXPLANATION);
    // Recorded, not hidden — a characterisation, accepted (Task 5b review repair R16, a parent decision P-5b-12): D-7
    // has the refusal carry its explanation as reported, in ProviderRefusalError's own message, which the harness files
    // verbatim as execution.json.error and the runner books as attempts.jsonl's detail ("<name>: <message>"). At this
    // position a sensitive explanation never gets that far: it sits under event.delta, a model-output path, where the
    // stream sanitiser withholds a sensitive pattern and onLaunch fails the launch before anything projects it. At the
    // four other positions (a result's or an assistant message's stop_details, apiRefusalExplanation on a system
    // model_refusal_no_fallback event or an API-error item) it does get that far: an open risk under the user's open
    // decision 13, named in live-capture.ts's header (Task 5b review repair N6, a parent decision P-5b-12, narrowed).
    expect((filedError as { message: string }).message).toContain(EXPLANATION);
    const attempts = attemptsOf(outcome.attemptsPath);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!['detail']).toContain('ProviderRefusalError: ');
    expect(attempts[0]!['detail']).toContain(EXPLANATION);
    // Positive control: the filed stream carries it, under event.delta, a model-output path kept verbatim.
    expect(readFileSync(join(outcome.executionDir, stopped.stream!), 'utf8')).toContain(EXPLANATION);
  }, 20_000);

  it('V2-U6 — fast mode at the reader (init fast_mode_state "cooldown"): CliFastModeError, and a usage stop of kind fast_mode', async () => {
    const { text } = streamWith(1, (ev) => { ev[0]!['fast_mode_state'] = 'cooldown'; });
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }));
    expectStopped(outcome, {
      error: 'CliFastModeError',
      fragment: 'the stream reports fast mode — init fast_mode_state "cooldown" at line 1',
      usageStop: {
        kind: 'fast_mode',
        facts: [{ fact: 'fast_mode_init', kind: 'fast_mode', seq: 2, role: 'reader', index: 0, detail: 'init at line 1: fast_mode_state "cooldown"', resetsAt: null }],
        seq: 2,
        role: 'reader',
        index: 0,
        resetsAt: null,
        note: NOTE,
      },
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
  }, 20_000);

  it('V2-U7 — the long-context boundary at role launch 3 (prosecutor[1]), a request of 190,001 tokens the projection accepts: UsageStopError after exactly three role launches, cancellation usage_stop:prosecutor[1], and that launch booked completed', async () => {
    // 2 + 626 + 189,373: one token above the ceiling, on the assistant's request.
    const { text } = streamWith(3, (ev) => { assistantUsageOf(ev)['cache_read_input_tokens'] = 189373; });
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 3: text } }));
    expectStopped(outcome, {
      error: 'UsageStopError',
      fragment: 'included usage stops the run after launch 4 (prosecutor[1]): usage stop long_context_boundary',
      usageStop: {
        kind: 'long_context_boundary',
        facts: [{ fact: 'long_context_boundary', kind: 'long_context_boundary', seq: 4, role: 'prosecutor', index: 1, detail: BOUNDARY, resetsAt: null }],
        seq: 4,
        role: 'prosecutor',
        index: 1,
        resetsAt: null,
        note: NOTE,
      },
      roleLaunches: 3,
      stoppedSeq: 4,
      outcomes: ['reader[0] completed', 'prosecutor[0] completed', 'prosecutor[1] completed'],
    });
    expect(outcome.error?.message).toContain(BOUNDARY);
    expect(outcome.error?.message).toContain(NOTE);
    expect(outcome.cancellationReason).toBe('usage_stop:prosecutor[1]');
  }, 20_000);

  it('V2-U8 — an unnatural reset at role launch 2, under an injected clock before the first reading\'s reset time: UsageStopError after two role launches; the same streams under the real clock, past that reset, complete', async () => {
    const readerLine = lineOf(eventsFor(1), isType('rate_limit_event'));
    const { text, events } = streamWith(2, (ev) => { rateInfoOf(ev)['resetsAt'] = 1790071800; });
    const line = lineOf(events, isType('rate_limit_event'));
    const pin = writeCaptureDummy({ variant: 'v2', streams: { 2: text } });
    const outcome = await captureV2(pin, { executionId: 'early', now: () => new Date(BEFORE_RESET) });
    expectStopped(outcome, {
      error: 'UsageStopError',
      fragment: 'included usage stops the run after launch 3 (prosecutor[0]): usage stop unnatural_reset',
      usageStop: {
        kind: 'unnatural_reset',
        facts: [{
          fact: 'unnatural_reset',
          kind: 'unnatural_reset',
          seq: 3,
          role: 'prosecutor',
          index: 0,
          detail: `rate_limit_event at line ${line}: window "five_hour" at rate_limit_info reports resetsAt 1790071800, earlier than 1790075400 as reported at launch 2 line ${readerLine}, while this launch's time 2026-09-22T10:00:00.000Z is before that reset at 2026-09-22T11:10:00.000Z`,
          resetsAt: 1790071800,
        }],
        seq: 3,
        role: 'prosecutor',
        index: 0,
        resetsAt: null,
        note: NOTE,
      },
      roleLaunches: 2,
      stoppedSeq: 3,
      outcomes: ['reader[0] completed', 'prosecutor[0] completed'],
    });
    expect(outcome.cancellationReason).toBe('usage_stop:prosecutor[0]');
    // Positive control: the same two streams under the real clock, days after 11:10Z on 2026-09-22 — a natural reset — complete.
    rmSync(join(recordDir, 'count'));
    const natural = await captureV2(pin, { executionId: 'natural' });
    expect(natural.status, JSON.stringify(natural.error)).toBe('completed');
    expect(roleLaunchCount()).toBe(11);
    expect(summaryOf(natural.summaryPath)['usageStop']).toBeNull();
    // The dummy did serve the earlier reset again at the second role launch.
    expect(launchLinesOf(natural.launchesPath!)[2]!.observed?.rateLimits.map((reading) => reading.info?.['resetsAt'])).toEqual([1790071800]);
    // The trust block the completed control filed; the stopped run's is expectStopped's (Task 5c review repair R5).
    expectTrust(natural.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U9 — reset pending: after a real exhausted stop whose resetsAt is ahead of the injected clock, a new execution for the same requirement or another is refused before anything is created; exactly at the reset it proceeds; a record at depth three that cannot be read is refused, naming it', async () => {
    const { text } = streamWith(2, (ev) => { rateInfoOf(ev)['status'] = 'rejected'; });
    const pin = writeCaptureDummy({ variant: 'v2', streams: { 2: text } });
    const stopped = await captureV2(pin, { executionId: 'stopped' });
    expect(summaryOf(stopped.summaryPath)['usageStop']).toMatchObject({ kind: 'exhausted', resetsAt: 1790075400 });
    const caseDir = join(root(), 'csrd', 'CSRD-S-002');
    expect(readdirSync(caseDir)).toEqual(['stopped']);
    expect(gateLaunchCount()).toBe(1);
    for (const over of [{ executionId: 'refused' }, { requirementId: 'CSRD-S-001', executionId: 'refused-elsewhere' }]) {
      let caught: unknown;
      try {
        await captureV2(pin, { ...over, now: () => new Date(BEFORE_RESET) });
      } catch (error) {
        caught = error;
      }
      expect(caught, JSON.stringify(over)).toBeInstanceOf(UsageResetPendingError);
      expect((caught as Error).name).toBe('UsageResetPendingError');
      expect((caught as Error).message).toContain(`the execution ${join('csrd', 'CSRD-S-002', 'stopped')} under the execution root stopped for included usage until 2026-09-22T11:10:00.000Z (usageStop.resetsAt 1790075400, epoch seconds)`);
      expect((caught as Error).message).toContain('this one would start at 2026-09-22T10:00:00.000Z, before it');
      expect((caught as Error).message).toContain(NOTE);
    }
    // Nothing was created: no new execution directory, no case directory for the other requirement, no gate launch.
    expect(readdirSync(caseDir)).toEqual(['stopped']);
    expect(readdirSync(join(root(), 'csrd'))).toEqual(['CSRD-S-002']);
    expect(gateLaunchCount()).toBe(1);
    // Positive control: exactly at the reset, the same request proceeds and runs.
    const cleanPin = writeCaptureDummy({ variant: 'v2' });
    const atReset = await captureV2(cleanPin, { executionId: 'at-reset', now: () => new Date(1790075400 * 1000) }).catch((error: unknown) => error);
    expect(atReset, 'the execution starting exactly at the reset').not.toBeInstanceOf(UsageResetPendingError);
    expect((atReset as Awaited<ReturnType<typeof captureV2>>).status).toBe('completed');
    expect(gateLaunchCount()).toBe(2);
    expect(readdirSync(caseDir).sort()).toEqual(['at-reset', 'stopped']);

    // A record at depth three that cannot be read fails the check closed, whatever the clock, and names the file.
    const other = join(scratch, 'other-root');
    const handwritten = join(other, 'csrd', 'CSRD-S-002', 'handwritten');
    mkdirSync(handwritten, { recursive: true });
    const unreadable: [string, string][] = [
      ['{"status": "failed", "usageStop": {"resetsAt": 17', 'cannot be read as JSON'],
      ['[1, 2]', 'is not a JSON object'],
      ['{"usageStop": "exhausted"}', 'carries a usageStop that is neither null nor an object'],
      // The reset-hold repair widened this rule to every value that is not a usable reset, so its words changed (V2-U19).
      ['{"usageStop": {"resetsAt": "1790075400"}}', 'carries usageStop.resetsAt "1790075400", which is neither null nor a usable reset time (a safe integer of epoch seconds greater than 0)'],
    ];
    for (const [content, words] of unreadable) {
      writeFileSync(join(handwritten, 'execution.json'), content);
      let caught: unknown;
      try {
        await captureV2(cleanPin, { executionRoot: other, executionId: 'after-handwritten', now: () => new Date('2030-01-01T00:00:00.000Z') });
      } catch (error) {
        caught = error;
      }
      expect(caught, content).toBeInstanceOf(UsageResetPendingError);
      expect((caught as Error).message, content).toContain(`the earlier execution record ${join('csrd', 'CSRD-S-002', 'handwritten', 'execution.json')} under the execution root ${words}`);
    }
    expect(readdirSync(join(other, 'csrd', 'CSRD-S-002'))).toEqual(['handwritten']);
    expect(gateLaunchCount()).toBe(2);
    // Positive control: the same record, readable and with no reset pending, lets the same request proceed.
    // Its facts an array of objects, as a filed stop's are (Task 5b review repair M4 refuses any other shape).
    writeFileSync(join(handwritten, 'execution.json'), JSON.stringify({ status: 'failed', usageStop: { kind: 'unobserved', facts: [{ fact: 'rate_limit_unobserved', kind: 'unobserved', resetsAt: null }], resetsAt: null } }));
    const proceeds = await captureV2(cleanPin, { executionRoot: other, executionId: 'after-handwritten', now: () => new Date('2030-01-01T00:00:00.000Z') });
    expect(proceeds.status, JSON.stringify(proceeds.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(3);
    // The trust blocks this case's three executions filed (Task 5c review repair R5): the stop, with nothing assessed;
    // the run exactly at the reset and the run beside the readable record, each completed and measured passed.
    expectTrust(stopped.summaryPath, trustBlock('failed', 'CliIncludedUsageExhaustedError', 'unassessed', 'unassessed', null));
    expectTrust((atReset as Awaited<ReturnType<typeof captureV2>>).summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
    expectTrust(proceeds.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 40_000);

  /** A hand-written earlier execution record at `<executionRoot>/<relative>/execution.json`. */
  const writeRecord = (executionRoot: string, relative: string, record: unknown): void => {
    mkdirSync(join(executionRoot, relative), { recursive: true });
    writeFileSync(join(executionRoot, relative, 'execution.json'), JSON.stringify(record));
  };
  /** A finished execution's record whose usage stop is exhausted until `resetsAt`. */
  const exhaustedUntil = (resetsAt: number) => ({ status: 'failed', usageStop: { kind: 'exhausted', facts: [], seq: 2, role: 'reader', index: 0, resetsAt, note: NOTE } });
  /** What a capture threw, or what it returned instead. */
  const settled = (pending: Promise<unknown>): Promise<unknown> => pending.then((outcome) => outcome, (error: unknown) => error);
  /** A finished execution's record whose usage stop is `kind`, carrying `facts`, with no reset time. */
  const finishedWithoutReset = (kind: string, facts: unknown) => ({ status: 'failed', usageStop: { kind, facts, seq: 2, role: 'reader', index: 0, resetsAt: null, note: NOTE } });
  /** One fact of `kind` as a finished record files it. */
  const filedFact = (fact: string, kind: string, resetsAt: unknown = null) => ({ fact, kind, seq: 2, role: 'reader', index: 0, detail: 'a hand-written fact', resetsAt });
  /** The words the no-reset-time rule refuses in (Task 5b review repair M4, a parent decision P-5b-14). */
  const NO_RESET_TIME = 'recorded an exhaustion or overage that reported no reset time as a number (usageStop.resetsAt null), so an operator must review it before any new subscription execution starts';

  it('V2-U9k — a finished record whose usage stop records an exhaustion or overage with no reset time as a number holds every new execution until reviewed, whatever the clock; a usage stop whose facts are not an array of objects is refused as unreadable; each by name, before anything exists; a finished record whose stop is fast_mode with resetsAt null proceeds (Task 5b review repair M4, a parent decision P-5b-14)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'no-reset-root');
    const recorded = join('csrd', 'CSRD-S-002', 'recorded');
    const named = join(recorded, 'execution.json');
    const later = () => new Date('2030-01-01T00:00:00.000Z');
    const refused: [string, unknown, string][] = [
      ['exhausted, its reset a string', finishedWithoutReset('exhausted', [filedFact('rate_limit_rejected', 'exhausted', '2026-09-27T18:00:00Z')]), NO_RESET_TIME],
      ['overage, no reset reported', finishedWithoutReset('overage', [filedFact('overage_in_use', 'overage')]), NO_RESET_TIME],
      ['an exhausted fact behind a fast_mode one', finishedWithoutReset('exhausted', [filedFact('fast_mode_init', 'fast_mode'), filedFact('rate_limit_rejected', 'exhausted')]), NO_RESET_TIME],
      ['facts absent', { status: 'failed', usageStop: { kind: 'exhausted', resetsAt: null } }, 'carries usageStop.facts absent, which is not an array of objects, so whether it stopped for included usage is unknown'],
      ['facts a string', finishedWithoutReset('exhausted', 'rejected'), 'carries usageStop.facts "rejected", which is not an array of objects, so whether it stopped for included usage is unknown'],
      ['facts an array of numbers', finishedWithoutReset('exhausted', [1]), 'carries usageStop.facts [1], which is not an array of objects, so whether it stopped for included usage is unknown'],
    ];
    for (const [what, record, words] of refused) {
      writeRecord(executionRoot, recorded, record);
      const caught = await settled(captureV2(pin, { executionRoot, executionId: 'after-recorded', now: later }));
      const message = caught instanceof Error ? caught.message : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
      expect(caught, what).toBeInstanceOf(UsageResetPendingError);
      expect(message, what).toContain(`the earlier execution record ${named} under the execution root ${words}`);
      expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002')), what).toEqual(['recorded']);
    }
    expect(gateLaunchCount()).toBe(0);
    // Positive control: a finished record whose stop is fast_mode, its resetsAt null, holds nothing: the same request runs.
    writeRecord(executionRoot, recorded, finishedWithoutReset('fast_mode', [filedFact('fast_mode_init', 'fast_mode')]));
    const proceeds = await captureV2(pin, { executionRoot, executionId: 'after-recorded', now: later });
    expect(proceeds.status, JSON.stringify(proceeds.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    // The trust block the completed control filed (Task 5c review repair R5).
    expectTrust(proceeds.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U9l — end to end: a @2 run exhausted at the reader whose rejected rate_limit_event reports no resetsAt is refused by the projection as exhausted and files a stop of kind exhausted whose resetsAt is null; a second capture under the same root, years later, is refused by the no-reset-time rule, creating nothing (Task 5b review repair M4, a parent decision P-5b-14)', async () => {
    const { text } = streamWith(1, (ev) => { const info = rateInfoOf(ev); info['status'] = 'rejected'; delete info['resetsAt']; });
    const stopped = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }), { executionId: 'stopped' });
    expect(stopped.status).toBe('failed');
    expect(stopped.error?.name).toBe('CliIncludedUsageExhaustedError');
    expect(summaryOf(stopped.summaryPath)['usageStop']).toMatchObject({ kind: 'exhausted', resetsAt: null });
    const caseDir = join(root(), 'csrd', 'CSRD-S-002');
    expect(readdirSync(caseDir)).toEqual(['stopped']);
    const gates = gateLaunchCount();
    const caught = await settled(captureV2(writeCaptureDummy({ variant: 'v2' }), { executionId: 'after', now: () => new Date('2030-01-01T00:00:00.000Z') }));
    const message = caught instanceof Error ? caught.message : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
    expect(caught).toBeInstanceOf(UsageResetPendingError);
    expect(message).toContain(`the earlier execution record ${join('csrd', 'CSRD-S-002', 'stopped', 'execution.json')} under the execution root ${NO_RESET_TIME}`);
    expect(readdirSync(caseDir)).toEqual(['stopped']);
    expect(gateLaunchCount()).toBe(gates);
    // The trust block the stopped run filed: refused in the roles, nothing assessed (Task 5c review repair R5).
    expectTrust(stopped.summaryPath, trustBlock('failed', 'CliIncludedUsageExhaustedError', 'unassessed', 'unassessed', null));
  }, 30_000);

  // The spend controls' D3: an API-error item of kind usage_limit_reached, in 2.1.295's shape on a 429 by the parent's
  // static reading (the coarse kind in error, the kind in apiError, params from the response headers).
  const usageLimitItem = (params: Ev | null): Ev => ({ ...apiErrorItem('rate_limit'), apiError: 'usage_limit_reached', ...(params === null ? {} : { apiErrorParams: params }) });

  it('V2-U14 — usage_limit_reached at the reader, reporting no reset: CliIncludedUsageExhaustedError after exactly one role launch, no later role launched, a stop of kind exhausted whose resetsAt is null; a following execution under the same root, years later, is refused for an operator\'s review, creating nothing (the spend controls\' D3)', async () => {
    const { text, events } = streamWith(1, (ev) => { ev.splice(lineOf(ev, isType('rate_limit_event')) - 1, 0, usageLimitItem(null)); });
    const line = lineOf(events, (event) => event['is_api_error_message'] === true);
    const stopped = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }), { executionId: 'stopped' });
    const caseDir = join(root(), 'csrd', 'CSRD-S-002');
    expect(readdirSync(caseDir)).toEqual(['stopped']);
    const gates = gateLaunchCount();
    const caught = await settled(captureV2(writeCaptureDummy({ variant: 'v2' }), { executionId: 'after', now: () => new Date('2030-01-01T00:00:00.000Z') }));
    const message = caught instanceof Error ? caught.message : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
    // Soft, and before the stop is asserted, so a defect that files the wrong stop shows the following execution's
    // fate too, not only the first assertion it breaks.
    expect.soft(caught, 'the following execution').toBeInstanceOf(UsageResetPendingError);
    expect.soft(message).toContain(`the earlier execution record ${join('csrd', 'CSRD-S-002', 'stopped', 'execution.json')} under the execution root ${NO_RESET_TIME}`);
    expect.soft(readdirSync(caseDir)).toEqual(['stopped']);
    expect.soft(gateLaunchCount()).toBe(gates);
    expectStopped(stopped, {
      error: 'CliIncludedUsageExhaustedError',
      fragment: `the CLI reported API error "usage_limit_reached" on an assistant API-error item at line ${line} (it reports no rate_limit_info in its params, so no rateLimitType and no reset time are carried)`,
      usageStop: {
        kind: 'exhausted',
        facts: [{ fact: 'usage_limit_reached', kind: 'exhausted', seq: 2, role: 'reader', index: 0, detail: `assistant API-error item at line ${line}: API-error kind "usage_limit_reached"`, resetsAt: null }],
        seq: 2,
        role: 'reader',
        index: 0,
        resetsAt: null,
        note: NOTE,
      },
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
  }, 30_000);

  it('V2-U15 — usage_limit_reached at the reader whose params report a finite reset: a stop of kind exhausted holding that reset, and a following start before it refused, naming that time (the spend controls\' D3)', async () => {
    const { text, events } = streamWith(1, (ev) => { ev.splice(lineOf(ev, isType('rate_limit_event')) - 1, 0, usageLimitItem({ rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 1790089800 } })); });
    const line = lineOf(events, (event) => event['is_api_error_message'] === true);
    const stopped = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }), { executionId: 'stopped' });
    const caseDir = join(root(), 'csrd', 'CSRD-S-002');
    const gates = gateLaunchCount();
    const caught = await settled(captureV2(writeCaptureDummy({ variant: 'v2' }), { executionId: 'refused', now: () => new Date(BEFORE_RESET) }));
    const message = caught instanceof Error ? caught.message : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
    // Soft, and before the stop is asserted, as in V2-U14.
    expect.soft(caught, 'the following start').toBeInstanceOf(UsageResetPendingError);
    expect.soft(message).toContain(`the execution ${join('csrd', 'CSRD-S-002', 'stopped')} under the execution root stopped for included usage until 2026-09-22T15:10:00.000Z (usageStop.resetsAt 1790089800, epoch seconds)`);
    expect.soft(message).toContain('this one would start at 2026-09-22T10:00:00.000Z, before it');
    expect.soft(readdirSync(caseDir)).toEqual(['stopped']);
    expect.soft(gateLaunchCount()).toBe(gates);
    expectStopped(stopped, {
      error: 'CliIncludedUsageExhaustedError',
      fragment: `the CLI reported API error "usage_limit_reached" on an assistant API-error item at line ${line} (rateLimitType "five_hour", resetsAt 1790089800)`,
      usageStop: {
        kind: 'exhausted',
        facts: [{ fact: 'usage_limit_reached', kind: 'exhausted', seq: 2, role: 'reader', index: 0, detail: `assistant API-error item at line ${line}: API-error kind "usage_limit_reached"`, resetsAt: 1790089800 }],
        seq: 2,
        role: 'reader',
        index: 0,
        resetsAt: 1790089800,
        note: NOTE,
      },
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
  }, 30_000);

  // The reset-hold repair. An exhaustion reporting no usable reset beside one reporting a time holds every later
  // execution until an operator reviews it, by two protections that each hold alone: usageStopOf files the stop's
  // resetsAt as null (V2-U16), and the reset-pending check reads each exhausted and overage fact itself, so a record
  // written before the repair, a usable aggregate beside an unknown fact, holds too (V2-U17), and its aggregate cannot
  // shorten the hold (V2-U18). A usable reset is a safe integer of epoch seconds greater than 0 (V2-U17, V2-U19).
  /** The words both protections' refusals end in. */
  const OPERATOR_REVIEW = 'so an operator must review it before any new subscription execution starts';
  /** The usable reset the clean stream's rate_limit_event reports: 2026-09-22T11:10:00Z. */
  const KNOWN_RESET = 1790075400;
  /** What a capture threw, as its message, or that it was not refused. */
  const refusalOf = (caught: unknown): string => (caught instanceof Error ? `${caught.name}: ${caught.message}` : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`);

  it.each([
    [
      '(a) the carrier first, its params missing, then the rejected rate_limit_event',
      (ev: Ev[]) => { rateInfoOf(ev)['status'] = 'rejected'; ev.splice(lineOf(ev, isType('rate_limit_event')) - 1, 0, usageLimitItem(null)); },
      true,
      null,
    ],
    [
      '(b) the rejected rate_limit_event first, then the carrier, its params\' resetsAt "soon"',
      (ev: Ev[]) => { rateInfoOf(ev)['status'] = 'rejected'; ev.splice(lineOf(ev, isType('rate_limit_event')), 0, usageLimitItem({ rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 'soon' } })); },
      false,
      'soon',
    ],
  ] as const)('V2-U16 — end to end, the user\'s reproducer, %s: the projection refuses the reader as exhausted; the filed stop is exhausted, resetsAt null, both facts with their own resets; a following execution under the same root one second after the known reset is refused for an operator\'s review, creating nothing and launching no gate (the reset-hold repair)', async (_order, change, carrierFirst, carriedReset) => {
    const { text, events } = streamWith(1, change);
    const eventLine = lineOf(events, isType('rate_limit_event'));
    const carrierLine = lineOf(events, (event) => event['is_api_error_message'] === true);
    expect(carrierLine < eventLine, 'the order the row names').toBe(carrierFirst);
    const stopped = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }), { executionId: 'stopped' });
    const caseDir = join(root(), 'csrd', 'CSRD-S-002');
    expect(readdirSync(caseDir)).toEqual(['stopped']);
    const gates = gateLaunchCount();
    const caught = await settled(captureV2(writeCaptureDummy({ variant: 'v2' }), { executionId: 'after', now: () => new Date((KNOWN_RESET + 1) * 1000) }));
    const message = refusalOf(caught);
    // Soft, and before the stop is asserted, as in V2-U14: a defect in either protection shows the following
    // execution's fate and the filed stop together. Either protection's refusal names the record and asks for review.
    expect.soft(caught, 'the following execution').toBeInstanceOf(UsageResetPendingError);
    expect.soft(message).toContain(`the earlier execution record ${join('csrd', 'CSRD-S-002', 'stopped', 'execution.json')} under the execution root `);
    expect.soft(message).toContain(OPERATOR_REVIEW);
    expect.soft(readdirSync(caseDir), 'the case directory after the following execution').toEqual(['stopped']);
    expect.soft(gateLaunchCount(), 'gate launches after the following execution').toBe(gates);
    const carrierFact = { fact: 'usage_limit_reached', kind: 'exhausted', seq: 2, role: 'reader', index: 0, detail: `assistant API-error item at line ${carrierLine}: API-error kind "usage_limit_reached"`, resetsAt: carriedReset };
    const eventFact = { fact: 'rate_limit_rejected', kind: 'exhausted', seq: 2, role: 'reader', index: 0, detail: `rate_limit_event at line ${eventLine}: rate_limit_info.status "rejected"`, resetsAt: 1790075400 };
    expectStopped(stopped, {
      error: 'CliIncludedUsageExhaustedError',
      fragment: carrierFirst
        ? `the CLI reported API error "usage_limit_reached" on an assistant API-error item at line ${carrierLine} (it reports no rate_limit_info in its params, so no rateLimitType and no reset time are carried)`
        : `the rate_limit_event at line ${eventLine} reports status "rejected" (rateLimitType "five_hour", resetsAt 1790075400)`,
      usageStop: { kind: 'exhausted', facts: carrierFirst ? [carrierFact, eventFact] : [eventFact, carrierFact], seq: 2, role: 'reader', index: 0, resetsAt: null, note: NOTE },
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
  }, 30_000);

  /** A finished record a stop written before the repair could leave: an exhausted aggregate at the known reset beside `facts`. */
  const heldUntilKnownReset = (facts: unknown[]) => ({ status: 'failed', usageStop: { kind: 'exhausted', facts, seq: 2, role: 'reader', index: 0, resetsAt: KNOWN_RESET, note: NOTE } });
  /** A usage_limit_reached fact as filed, its resetsAt the row's value, or left out altogether when the row gives none (absent). */
  const limitFact = (unknown: readonly unknown[]) => ({ fact: 'usage_limit_reached', kind: 'exhausted', seq: 2, role: 'reader', index: 0, detail: 'a hand-written fact', ...(unknown.length === 0 ? {} : { resetsAt: unknown[0] }) });
  /** The unknown resets, each with the words a refusal shows it in; the fraction lies before the known reset, so only the rule refuses it. */
  const UNKNOWN_RESETS = [
    ['absent', [], 'absent'],
    ['null', [null], 'null'],
    ['a string', ['soon'], '"soon"'],
    ['0', [0], '0'],
    ['a negative', [-1], '-1'],
    ['a fraction', [1790075399.5], '1790075399.5'],
  ] as const;

  it.each(UNKNOWN_RESETS.flatMap(([what, unknown, shown]) => [
    [`${what}, the unknown fact second`, [filedFact('rate_limit_rejected', 'exhausted', KNOWN_RESET), limitFact(unknown)], 1, shown],
    [`${what}, the unknown fact first`, [limitFact(unknown), filedFact('rate_limit_rejected', 'exhausted', KNOWN_RESET)], 0, shown],
  ] as const))('V2-U17 — the guard alone, over a hand-written finished record with a usable aggregate (1790075400) beside rate_limit_rejected at 1790075400 and usage_limit_reached whose resetsAt is %s: a start one second after the aggregate is refused, naming the fact, creating nothing and launching no gate (the reset-hold repair)', async (_what, facts, position, shown) => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'mixed-root');
    const recorded = join('csrd', 'CSRD-S-002', 'recorded');
    writeRecord(executionRoot, recorded, heldUntilKnownReset([...facts]));
    const written = readFileSync(join(executionRoot, recorded, 'execution.json'), 'utf8');
    const caught = await settled(captureV2(pin, { executionRoot, executionId: 'after-recorded', now: () => new Date((KNOWN_RESET + 1) * 1000) }));
    const message = refusalOf(caught);
    expect(caught, message).toBeInstanceOf(UsageResetPendingError);
    expect(message).toContain(`the earlier execution record ${join(recorded, 'execution.json')} under the execution root recorded, at usageStop.facts[${position}], the exhausted fact "usage_limit_reached" with resetsAt ${shown}, which is not a usable reset time (a safe integer of epoch seconds greater than 0), ${OPERATOR_REVIEW}`);
    expect([(caught as UsageResetPendingError).resetsAt, (caught as UsageResetPendingError).recordedBy]).toEqual([null, recorded]);
    expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002'))).toEqual(['recorded']);
    // The check only reads: the record it refused on is left byte for byte as it was, for the operator to review.
    expect(readFileSync(join(executionRoot, recorded, 'execution.json'), 'utf8'), 'the record after the check').toBe(written);
    expect(gateLaunchCount()).toBe(0);
  }, 30_000);

  it('V2-U18 — the aggregate cannot shorten the hold: a finished record whose usageStop.resetsAt 1790075400 is earlier than its overage fact\'s usable 1790079000 refuses a start between the two, naming the later and where it was recorded, creating nothing; a start exactly at the later proceeds and completes (the reset-hold repair)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'shorter-root');
    const recorded = join('csrd', 'CSRD-S-002', 'recorded');
    writeRecord(executionRoot, recorded, { status: 'failed', usageStop: { kind: 'overage', facts: [filedFact('rate_limit_rejected', 'exhausted', 1790075400), filedFact('overage_in_use', 'overage', 1790079000)], seq: 2, role: 'reader', index: 0, resetsAt: 1790075400, note: NOTE } });
    const caught = await settled(captureV2(pin, { executionRoot, executionId: 'between', now: () => new Date(1790077000 * 1000) }));
    const message = refusalOf(caught);
    expect(caught, message).toBeInstanceOf(UsageResetPendingError);
    expect(message).toContain(`the execution ${recorded} under the execution root stopped for included usage until 2026-09-22T12:10:00.000Z (usageStop.facts[1].resetsAt 1790079000, epoch seconds), the latest any earlier execution recorded`);
    expect(message).toContain('this one would start at 2026-09-22T11:36:40.000Z, before it');
    expect([(caught as UsageResetPendingError).resetsAt, (caught as UsageResetPendingError).recordedBy]).toEqual([1790079000, recorded]);
    expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002'))).toEqual(['recorded']);
    expect(gateLaunchCount()).toBe(0);
    // Positive control: exactly at the later reset, the same request proceeds and completes.
    const atLater = await settled(captureV2(pin, { executionRoot, executionId: 'at-later', now: () => new Date(1790079000 * 1000) }));
    expect(atLater, refusalOf(atLater)).not.toBeInstanceOf(UsageResetPendingError);
    expect((atLater as Awaited<ReturnType<typeof captureV2>>).status).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002')).sort()).toEqual(['at-later', 'recorded']);
    expectTrust((atLater as Awaited<ReturnType<typeof captureV2>>).summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it.each([
    ['0', 0, '0'],
    ['a negative', -1, '-1'],
    ['a fraction', 1790075400.5, '1790075400.5'],
  ] as const)('V2-U19 — a present usageStop.resetsAt that is neither null nor usable, %s, is refused by name whatever the clock, creating nothing and launching no gate; a string is V2-U9\'s row (the reset-hold repair)', async (_what, aggregate, shown) => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'unusable-aggregate-root');
    const recorded = join('csrd', 'CSRD-S-002', 'recorded');
    writeRecord(executionRoot, recorded, exhaustedUntil(aggregate));
    const caught = await settled(captureV2(pin, { executionRoot, executionId: 'after-recorded', now: () => new Date('2030-01-01T00:00:00.000Z') }));
    const message = refusalOf(caught);
    expect(caught, message).toBeInstanceOf(UsageResetPendingError);
    expect(message).toContain(`the earlier execution record ${join(recorded, 'execution.json')} under the execution root carries usageStop.resetsAt ${shown}, which is neither null nor a usable reset time (a safe integer of epoch seconds greater than 0)`);
    expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002'))).toEqual(['recorded']);
    expect(gateLaunchCount()).toBe(0);
  }, 30_000);

  it('V2-U20 — the positive control: a finished record whose aggregate 1790079000 and every exhausted and overage fact report usable resets, beside facts of other kinds whose resets are unknown and not read, refuses a start one second before the latest, naming it, and a start exactly at it proceeds and completes (the reset-hold repair; V2-U9 holds a filed stop exactly at its reset, V2-U9b the latest across records)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'usable-root');
    const recorded = join('csrd', 'CSRD-S-002', 'recorded');
    const facts = [
      filedFact('rate_limit_rejected', 'exhausted', 1790075400),
      filedFact('fast_mode_init', 'fast_mode'),
      filedFact('overage_in_use', 'overage', 1790079000),
      filedFact('unnatural_reset', 'unnatural_reset', 'soon'),
    ];
    writeRecord(executionRoot, recorded, { status: 'failed', usageStop: { kind: 'overage', facts, seq: 2, role: 'reader', index: 0, resetsAt: 1790079000, note: NOTE } });
    const caught = await settled(captureV2(pin, { executionRoot, executionId: 'before-latest', now: () => new Date(1790078999 * 1000) }));
    const message = refusalOf(caught);
    expect(caught, message).toBeInstanceOf(UsageResetPendingError);
    expect(message).toContain(`the execution ${recorded} under the execution root stopped for included usage until 2026-09-22T12:10:00.000Z (usageStop.resetsAt 1790079000, epoch seconds), the latest any earlier execution recorded`);
    expect(message).toContain('this one would start at 2026-09-22T12:09:59.000Z, before it');
    expect([(caught as UsageResetPendingError).resetsAt, (caught as UsageResetPendingError).recordedBy]).toEqual([1790079000, recorded]);
    expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002'))).toEqual(['recorded']);
    expect(gateLaunchCount()).toBe(0);
    // Exactly at the latest, the same request proceeds and completes.
    const atLatest = await settled(captureV2(pin, { executionRoot, executionId: 'at-latest', now: () => new Date(1790079000 * 1000) }));
    expect(atLatest, refusalOf(atLatest)).not.toBeInstanceOf(UsageResetPendingError);
    expect((atLatest as Awaited<ReturnType<typeof captureV2>>).status).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002')).sort()).toEqual(['at-latest', 'recorded']);
    expectTrust((atLatest as Awaited<ReturnType<typeof captureV2>>).summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U9b — the latest reset any earlier execution recorded holds, whichever directory holds it: two finished records under one root at 1790075400 and 1790079000, and the same two values swapped, under a clock at 1790077000 between them (Task 5b review repair R6)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'latest-root');
    for (const [a, b, holder] of [[1790075400, 1790079000, 'b'], [1790079000, 1790075400, 'a']] as const) {
      writeRecord(executionRoot, join('csrd', 'CSRD-S-002', 'a'), exhaustedUntil(a));
      writeRecord(executionRoot, join('csrd', 'CSRD-S-002', 'b'), exhaustedUntil(b));
      const caught = await settled(captureV2(pin, { executionRoot, executionId: 'between', now: () => new Date(1790077000 * 1000) }));
      expect(caught, `the reset held in ${holder}`).toBeInstanceOf(UsageResetPendingError);
      expect((caught as Error).message).toContain(`the execution ${join('csrd', 'CSRD-S-002', holder)} under the execution root stopped for included usage until 2026-09-22T12:10:00.000Z (usageStop.resetsAt 1790079000, epoch seconds), the latest any earlier execution recorded`);
      expect((caught as Error).message).toContain('this one would start at 2026-09-22T11:36:40.000Z, before it');
      expect([(caught as UsageResetPendingError).resetsAt, (caught as UsageResetPendingError).recordedBy]).toEqual([1790079000, join('csrd', 'CSRD-S-002', holder)]);
    }
    // Nothing was created, and no gate launched.
    expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002')).sort()).toEqual(['a', 'b']);
    expect(gateLaunchCount()).toBe(0);
  }, 20_000);

  it('V2-U9c — the check holds @1 too: after a stopped @2 execution, an explicit @1 injected capture before its reset is refused in the same words and creates nothing; exactly at the reset the same @1 request proceeds, and runs (Task 5b review repair R7)', async () => {
    const { text } = streamWith(2, (ev) => { rateInfoOf(ev)['status'] = 'rejected'; });
    const stopped = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 2: text } }), { executionId: 'stopped' });
    expect(summaryOf(stopped.summaryPath)['usageStop']).toMatchObject({ kind: 'exhausted', resetsAt: 1790075400 });
    const caseDir = join(root(), 'csrd', 'CSRD-S-002');
    expect(gateLaunchCount()).toBe(1);
    const v1Pin = writeCaptureDummy();
    const caught = await settled(captureSubscription(v1Pin, { executionId: 'v1-refused', now: () => new Date(BEFORE_RESET) }));
    expect(caught).toBeInstanceOf(UsageResetPendingError);
    expect((caught as Error).message).toContain(`the execution ${join('csrd', 'CSRD-S-002', 'stopped')} under the execution root stopped for included usage until 2026-09-22T11:10:00.000Z (usageStop.resetsAt 1790075400, epoch seconds)`);
    expect((caught as Error).message).toContain('this one would start at 2026-09-22T10:00:00.000Z, before it');
    expect((caught as Error).message).toContain(NOTE);
    expect(readdirSync(caseDir)).toEqual(['stopped']);
    expect(gateLaunchCount()).toBe(1);
    // Positive control: the same @1 request exactly at the reset proceeds past the check, and runs.
    const atReset = await settled(captureSubscription(v1Pin, { executionId: 'v1-at-reset', now: () => new Date(1790075400 * 1000) }));
    expect(atReset).not.toBeInstanceOf(UsageResetPendingError);
    const ran = atReset as Awaited<ReturnType<typeof captureSubscription>>;
    expect(ran.status, JSON.stringify(ran.error)).toBe('completed');
    expect(summaryOf(ran.summaryPath)['adapter']).toBe('claude-code-cli@1');
    expect(gateLaunchCount()).toBe(2);
    expect(readdirSync(caseDir).sort()).toEqual(['stopped', 'v1-at-reset']);
    // The trust block the stopped @2 run filed (Task 5c review repair R5); the completed control is @1, which files none.
    expectTrust(stopped.summaryPath, trustBlock('failed', 'CliIncludedUsageExhaustedError', 'unassessed', 'unassessed', null));
  }, 30_000);

  it('V2-U9d — any pack: a finished record at other-pack/REQ-1/x whose reset is ahead of the clock refuses a csrd capture, naming it, before anything exists (Task 5b review repair R8)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'any-pack-root');
    writeRecord(executionRoot, join('other-pack', 'REQ-1', 'x'), exhaustedUntil(1790079000));
    const caught = await settled(captureV2(pin, { executionRoot, executionId: 'csrd-refused', now: () => new Date(BEFORE_RESET) }));
    expect(caught).toBeInstanceOf(UsageResetPendingError);
    expect((caught as Error).message).toContain(`the execution ${join('other-pack', 'REQ-1', 'x')} under the execution root stopped for included usage until 2026-09-22T12:10:00.000Z (usageStop.resetsAt 1790079000, epoch seconds)`);
    expect(readdirSync(executionRoot)).toEqual(['other-pack']);
    expect(gateLaunchCount()).toBe(0);
  }, 20_000);

  // One case per status, so a rule narrowed to one of them reds by name in the others (Task 5b review repair N8).
  it.each([
    ['"running"', { status: 'running', usageStop: null }],
    ['absent', { usageStop: null }],
    ['"cancelled"', { status: 'cancelled', usageStop: null }],
  ] as const)('V2-U9e — an earlier execution that never finished fails the check closed: a record whose status is %s, neither "completed" nor "failed", is refused, naming it and saying its usage stop was never written; the same record finished, with no usage stop, lets the same request run (Task 5b review repair R9, a parent decision P-5b-9)', async (status, record) => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'unfinished-root');
    const crashed = join('csrd', 'CSRD-S-002', 'crashed');
    const later = () => new Date('2030-01-01T00:00:00.000Z');
    writeRecord(executionRoot, crashed, record);
    const caught = await settled(captureV2(pin, { executionRoot, executionId: 'after-crashed', now: later }));
    expect(caught, JSON.stringify(record)).toBeInstanceOf(UsageResetPendingError);
    expect((caught as Error).message).toContain(`the earlier execution record ${join(crashed, 'execution.json')} under the execution root has status ${status}, neither "completed" nor "failed"`);
    expect((caught as Error).message).toContain('whose usage stop, if any, was never written');
    expect((caught as Error).message).toContain('an operator must review it before any new subscription execution starts');
    expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002'))).toEqual(['crashed']);
    expect(gateLaunchCount()).toBe(0);
    // Positive control: the same record, finished and with no usage stop, lets the same request run.
    writeRecord(executionRoot, crashed, { status: 'completed', usageStop: null });
    const proceeds = await captureV2(pin, { executionRoot, executionId: 'after-crashed', now: later });
    expect(proceeds.status, JSON.stringify(proceeds.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    // The trust block the completed control filed (Task 5c review repair R5).
    expectTrust(proceeds.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U9f — the walk neither follows nor passes over a symbolic link, at the pack, requirement, execution or record level: each is refused by name before anything exists (Task 5b review repair R10, a parent decision P-5b-10)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    // Where each link points: a record whose reset is pending, so following a link would be refused under another name.
    const target = (name: string, relative: string): string => {
      const dir = join(scratch, name);
      writeRecord(dir, relative, exhaustedUntil(1790079000));
      return join(dir, relative);
    };
    const links: [string, string, string][] = [
      [join('csrd', 'CSRD-S-002', 'linked'), target('elsewhere-execution', ''), 'an execution directory'],
      [join('csrd', 'CSRD-S-LINKED'), join(target('elsewhere-requirement', 'x'), '..'), 'a requirement directory'],
      ['linked-pack', join(target('elsewhere-pack', join('REQ-1', 'x')), '..', '..'), 'a pack directory'],
      [join('csrd', 'CSRD-S-002', 'x', 'execution.json'), join(target('elsewhere-record', ''), 'execution.json'), 'an execution record'],
    ];
    // Each level in its own root, every one asserted (softly, so each level's answer is read, not only the first's).
    for (const [relative, pointsTo, what] of links) {
      const executionRoot = join(scratch, `link-root-${relative.split(/[\\/]/).join('-')}`);
      mkdirSync(join(executionRoot, relative, '..'), { recursive: true });
      symlinkSync(pointsTo, join(executionRoot, relative));
      const caught = await settled(captureV2(pin, { executionRoot, executionId: 'after-link', now: () => new Date(BEFORE_RESET) }));
      const message = caught instanceof Error ? caught.message : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
      expect.soft(caught, what).toBeInstanceOf(UsageResetPendingError);
      expect.soft(message, what).toContain(`${relative} under the execution root is a symbolic link, which this check neither follows nor passes over`);
      expect.soft(existsSync(join(executionRoot, 'csrd', 'CSRD-S-002', 'after-link')), `${what}: an execution directory was created`).toBe(false);
    }
    expect(gateLaunchCount()).toBe(0);
  }, 30_000);

  it('V2-U9m — a regular file where the walk expects a directory is passed over: files at the root, pack and requirement levels, and the capture proceeds and completes; a directory beside them holding a pending record still refuses, as V2-U9b\'s do (Task 5b review repair M6)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'files-root');
    const files = ['README', join('csrd', 'README'), join('csrd', 'CSRD-S-002', 'README')];
    mkdirSync(join(executionRoot, 'csrd', 'CSRD-S-002'), { recursive: true });
    for (const file of files) writeFileSync(join(executionRoot, file), 'not an execution\n');
    const proceeds = await settled(captureV2(pin, { executionRoot, executionId: 'beside-files', now: () => new Date(BEFORE_RESET) }));
    expect(proceeds, 'a file at any level is passed over').not.toBeInstanceOf(Error);
    expect((proceeds as Awaited<ReturnType<typeof captureV2>>).status).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    // Positive counterpart: a directory beside the same files, holding a record whose reset is pending, refuses.
    writeRecord(executionRoot, join('csrd', 'CSRD-S-002', 'pending'), exhaustedUntil(1790079000));
    const caught = await settled(captureV2(pin, { executionRoot, executionId: 'after-pending', now: () => new Date(BEFORE_RESET) }));
    expect(caught).toBeInstanceOf(UsageResetPendingError);
    expect([(caught as UsageResetPendingError).resetsAt, (caught as UsageResetPendingError).recordedBy]).toEqual([1790079000, join('csrd', 'CSRD-S-002', 'pending')]);
    for (const file of files) expect(existsSync(join(executionRoot, file)), file).toBe(true);
    expect(gateLaunchCount()).toBe(1);
    // The trust block the completed control filed (Task 5c review repair R5).
    expectTrust((proceeds as Awaited<ReturnType<typeof captureV2>>).summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U9g —an execution directory the walk cannot examine is refused by name before anything exists, not passed over; the same directory, readable again and holding no record, is passed over, and the same request runs (Task 5b review repair R10, a parent decision P-5b-10)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    // Its record cannot be looked up (EACCES), which is not the absence of a record (ENOENT).
    const lockedRoot = join(scratch, 'locked-root');
    const locked = join(lockedRoot, 'csrd', 'CSRD-S-002', 'locked');
    mkdirSync(locked, { recursive: true });
    chmodSync(locked, 0o000);
    let caught: unknown;
    try {
      caught = await settled(captureV2(pin, { executionRoot: lockedRoot, executionId: 'after-locked', now: () => new Date(BEFORE_RESET) }));
    } finally {
      // Restored before anything else, so the scratch directory's cleanup can remove it.
      chmodSync(locked, 0o700);
    }
    expect(caught).toBeInstanceOf(UsageResetPendingError);
    expect((caught as Error).message).toContain(`the earlier execution record ${join('csrd', 'CSRD-S-002', 'locked', 'execution.json')} under the execution root cannot be examined (EACCES)`);
    expect(readdirSync(join(lockedRoot, 'csrd', 'CSRD-S-002'))).toEqual(['locked']);
    expect(gateLaunchCount()).toBe(0);
    // Positive control: the same directory readable again, holding no record, is passed over, and the same request runs.
    const proceeds = await captureV2(pin, { executionRoot: lockedRoot, executionId: 'after-locked', now: () => new Date(BEFORE_RESET) });
    expect(proceeds.status, JSON.stringify(proceeds.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    // The trust block the completed control filed (Task 5c review repair R5).
    expectTrust(proceeds.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U9h — a requirement directory the walk cannot list is refused by name before anything exists, not passed over: csrd/OTHER-REQ unlistable refuses a capture into csrd/CSRD-S-002; the same directory, listable again and empty, is passed over, and the same request runs (Task 5b review repair N4)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const executionRoot = join(scratch, 'unlistable-root');
    const otherRequirement = join(executionRoot, 'csrd', 'OTHER-REQ');
    mkdirSync(otherRequirement, { recursive: true });
    chmodSync(otherRequirement, 0o000);
    let caught: unknown;
    try {
      caught = await settled(captureV2(pin, { executionRoot, executionId: 'after-unlistable', now: () => new Date(BEFORE_RESET) }));
    } finally {
      // Restored before anything else, so the scratch directory's cleanup can remove it.
      chmodSync(otherRequirement, 0o700);
    }
    const message = caught instanceof Error ? `${caught.name}: ${caught.message}` : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
    expect(caught, message).toBeInstanceOf(UsageResetPendingError);
    expect(message).toContain(`the directory ${join('csrd', 'OTHER-REQ')} under the execution root cannot be listed (EACCES)`);
    expect(readdirSync(join(executionRoot, 'csrd'))).toEqual(['OTHER-REQ']);
    expect(gateLaunchCount()).toBe(0);
    // Positive control: the same directory listable again, and empty, is passed over, and the same request runs.
    const proceeds = await captureV2(pin, { executionRoot, executionId: 'after-unlistable', now: () => new Date(BEFORE_RESET) });
    expect(proceeds.status, JSON.stringify(proceeds.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    // The trust block the completed control filed (Task 5c review repair R5).
    expectTrust(proceeds.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U9i — an execution root that cannot be examined for a reason other than its absence is refused by name before anything exists: its parent unsearchable, so the root cannot be looked up (EACCES); the same root, examinable again, is walked, and the same request runs (Task 5b review repair N4)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const sealed = join(scratch, 'sealed');
    const executionRoot = join(sealed, 'root');
    mkdirSync(executionRoot, { recursive: true });
    chmodSync(sealed, 0o000);
    let caught: unknown;
    try {
      caught = await settled(captureV2(pin, { executionRoot, executionId: 'after-sealed', now: () => new Date(BEFORE_RESET) }));
    } finally {
      // Restored before anything else, so the scratch directory's cleanup can remove it.
      chmodSync(sealed, 0o700);
    }
    const message = caught instanceof Error ? `${caught.name}: ${caught.message}` : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
    expect(caught, message).toBeInstanceOf(UsageResetPendingError);
    expect(message).toContain('the execution root cannot be examined (EACCES), so whether an earlier execution under it stopped for included usage is unknown');
    expect(readdirSync(executionRoot)).toEqual([]);
    expect(gateLaunchCount()).toBe(0);
    // Positive control: the same root, examinable again and empty, is walked, and the same request runs.
    const proceeds = await captureV2(pin, { executionRoot, executionId: 'after-sealed', now: () => new Date(BEFORE_RESET) });
    expect(proceeds.status, JSON.stringify(proceeds.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    // The trust block the completed control filed (Task 5c review repair R5).
    expectTrust(proceeds.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U9j — a symbolic link as the execution root is refused by name before anything exists, as at every level below it: neither followed nor passed over; the directory it points to, named directly, is walked, and the same request runs (Task 5b review repair N5, a parent decision P-5b-10, extended)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const real = join(scratch, 'real-root');
    mkdirSync(real);
    const linked = join(scratch, 'linked-root');
    symlinkSync(real, linked);
    const caught = await settled(captureV2(pin, { executionRoot: linked, executionId: 'after-linked-root', now: () => new Date(BEFORE_RESET) }));
    const message = caught instanceof Error ? `${caught.name}: ${caught.message}` : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
    expect(caught, message).toBeInstanceOf(UsageResetPendingError);
    expect(message).toContain('the execution root is a symbolic link, which this check neither follows nor passes over');
    // Nothing was created, through the link or beside it.
    expect(lstatSync(linked).isSymbolicLink()).toBe(true);
    expect(readdirSync(real)).toEqual([]);
    expect(gateLaunchCount()).toBe(0);
    // The link named with a trailing separator, which POSIX lstat follows, is refused as the link itself (Task 5b
    // review repair O2): nothing is created and nothing launches.
    const trailing = await settled(captureV2(pin, { executionRoot: `${linked}/`, executionId: 'after-linked-root', now: () => new Date(BEFORE_RESET) }));
    const trailingMessage = trailing instanceof Error ? `${trailing.name}: ${trailing.message}` : `not refused: the capture returned status ${String((trailing as { status?: unknown }).status)}`;
    expect(trailing, trailingMessage).toBeInstanceOf(UsageResetPendingError);
    expect(trailingMessage).toContain('the execution root is a symbolic link, which this check neither follows nor passes over');
    expect(lstatSync(linked).isSymbolicLink()).toBe(true);
    expect(readdirSync(real)).toEqual([]);
    expect(gateLaunchCount()).toBe(0);
    // Positive control: the directory the link points to, named directly, is walked, and the same request runs.
    const proceeds = await captureV2(pin, { executionRoot: real, executionId: 'after-linked-root', now: () => new Date(BEFORE_RESET) });
    expect(proceeds.status, JSON.stringify(proceeds.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    // The trust block the completed control filed (Task 5c review repair R5).
    expectTrust(proceeds.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U10 — a launch ended at an injected launch timeout, whose partial stdout is one rejected rate_limit_event line: ProviderTimeoutError, outcome timeout, and a usage stop of kind exhausted with that line\'s resetsAt; while it ran, execution.json said running with a usage stop of none', async () => {
    const partial = `${JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', resetsAt: 1790079000 }, session_id: SESSION_ID, uuid: UUID })}\n`;
    const pin = writeCaptureDummy({ variant: 'v2', partialThenStallAt: { launch: 1, stdout: partial } });
    const pending = captureV2(pin, { deadlineMs: 5_000, executionId: 'partial' }, { launchTimeoutMs: 1_000 });
    await awaitReady();
    expect(summaryOf(join(root(), 'csrd', 'CSRD-S-002', 'partial', 'execution.json'))).toMatchObject({ status: 'running', usageStop: null });
    // Read while the launch stalls, asserted once the run has finished (Task 5c).
    const running = summaryOf(join(root(), 'csrd', 'CSRD-S-002', 'partial', 'execution.json'));
    const outcome = await pending;
    // The trust block was on file from the start as none yet: the key filed, its value null (Task 5c, a parent decision
    // P-5c-1); U4 holds @1's running summary to no key at all.
    expect(running['status']).toBe('running');
    expect(Object.hasOwn(running, 'trust'), '@2\'s running execution.json carries a trust key').toBe(true);
    expect(running['trust']).toBeNull();
    expect(outcome.error?.name).toBe('ProviderTimeoutError');
    expect(outcome.error?.message).toContain('enforced local limit of 1000 ms');
    expect(attemptsOf(outcome.attemptsPath).map((a) => a['outcome'])).toEqual(['timeout']);
    expect(roleLaunchCount()).toBe(1);
    expect(summaryOf(outcome.summaryPath)['usageStop']).toStrictEqual({
      kind: 'exhausted',
      facts: [{ fact: 'rate_limit_rejected', kind: 'exhausted', seq: 2, role: 'reader', index: 0, detail: 'rate_limit_event at line 1: rate_limit_info.status "rejected"', resetsAt: 1790079000 }],
      seq: 2,
      role: 'reader',
      index: 0,
      resetsAt: 1790079000,
      note: NOTE,
    });
    // The partial stream was filed, and the launch was ended by the transport.
    const stalled = launchLinesOf(outcome.launchesPath!)[1]!;
    expect(stalled.facts).toMatchObject({ started: true, exitCode: null, signal: 'SIGTERM' });
    expect(readFileSync(join(outcome.executionDir, stalled.stream!), 'utf8')).toContain('"status":"rejected"');
    // Once finished, the four tiers: the launch timed out in the roles, so nothing was assessed (Task 5c).
    expectTrust(outcome.summaryPath, trustBlock('failed', 'ProviderTimeoutError', 'unassessed', 'unassessed', null));
  }, 20_000);

  /** `@2`'s projection applied to the envelope with `overageInUse: true` neutralised: exactly the overage rule is skipped. */
  const withoutOverageInUse = (body: string): string => {
    const envelope = JSON.parse(body) as { stdout: string };
    return JSON.stringify({ ...envelope, stdout: envelope.stdout.split('"overageInUse":true').join('"overageInUse":false') });
  };
  const LENIENT = { ...CLAUDE_CODE_CLI_V2_ADAPTER, projectResponse: (body: string, request: RoleRequest) => CLAUDE_CODE_CLI_V2_ADAPTER.projectResponse(withoutOverageInUse(body), request) };

  it('V2-U11 — the backstop: a test adapter with @2\'s identity and invocation whose projection skips exactly the overage rule lets one overage launch through; the run completes its nine launches and writes its result, and is failed as IncludedUsageUnconfirmed, the result deleted and withheld; over a clean dummy the same adapter completes', async () => {
    const { text, events } = streamWith(5, (ev) => { rateInfoOf(ev)['overageInUse'] = true; });
    const line = lineOf(events, isType('rate_limit_event'));
    // The stream is one @2's own projection refuses as overage, and the test adapter accepts.
    const envelope = JSON.stringify({ exitCode: 0, signal: null, stdout: text, stderrBytes: 0 });
    const request: RoleRequest = { role: 'prosecutor', index: 3, model: 'claude-opus-5-5', promptSha256: 'a'.repeat(64), messages: [{ from: 'prompt', content: '# Role: prosecutor' }, { from: 'input', content: '# Lens' }] };
    expect(() => CLAUDE_CODE_CLI_V2_ADAPTER.projectResponse(envelope, request)).toThrow(CliOverageError);
    expect(() => LENIENT.projectResponse(envelope, request)).not.toThrow();
    expect(LENIENT.identity).toEqual({ id: 'claude-code-cli', version: '2' });

    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 5: text } }), { adapter: LENIENT, executionId: 'backstop' });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('IncludedUsageUnconfirmed');
    expect(outcome.error?.message).toContain(`overage_in_use (overage) at launch 6 (prosecutor[3]): rate_limit_event at line ${line}: rate_limit_info.overageInUse true`);
    expect(roleLaunchCount()).toBe(9);
    expect(outcome.launches).toBe(9);
    expect(attemptsOf(outcome.attemptsPath).map((a) => a['outcome'])).toEqual(Array<string>(9).fill('completed'));
    // The pipeline wrote its result, and the harness deleted it.
    expect(outcome.exitCode).toBe(0);
    expect(outcome.lines[0]).toBe(`Wrote ${resultFileOf(outcome.executionDir)}`);
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    expect(outcome.resultWithheld).toBe(true);
    expect(outcome.transcriptPath).toBeNull();
    expect(outcome.resultPath).toBeNull();
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'failed', resultWithheld: true, transcriptPath: null, resultPath: null, error: { name: 'IncludedUsageUnconfirmed' } });
    expect(summary['usageStop']).toStrictEqual({
      kind: 'overage',
      facts: [{ fact: 'overage_in_use', kind: 'overage', seq: 6, role: 'prosecutor', index: 3, detail: `rate_limit_event at line ${line}: rate_limit_info.overageInUse true`, resetsAt: 1790075400 }],
      seq: 6,
      role: 'prosecutor',
      index: 3,
      resetsAt: 1790075400,
      note: NOTE,
    });
    // The trust block is taken after the backstop withheld the result (D-9; Task 5c): the record had assembled valid,
    // and the evidence tier is withheld, never passed, with no sets.
    expectTrust(outcome.summaryPath, trustBlock('failed', 'IncludedUsageUnconfirmed', 'valid', 'withheld', null));

    // Positive control: the same test adapter over the clean dummy completes, with no usage stop.
    const control = await captureV2(writeCaptureDummy({ variant: 'v2' }), { adapter: LENIENT, executionId: 'backstop-control' });
    expect(control.status, JSON.stringify(control.error)).toBe('completed');
    expect(existsSync(control.resultPath!)).toBe(true);
    expect(summaryOf(control.summaryPath)['usageStop']).toBeNull();
    // ... and its evidence, measured, passes: the same record withheld above would have measured passed.
    expectTrust(control.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 30_000);

  it('V2-U12 — @1 files no usageStop key and has neither stop, though the same rules find facts in its 2.1.226 streams; @2 files usageStop as null on a clean run; both launch lines carry the observation', async () => {
    const v1 = await captureSubscription(writeCaptureDummy(), { executionId: 'v1' });
    expect(Object.hasOwn(summaryOf(v1.summaryPath), 'usageStop'), '@1\'s execution.json carries a usageStop key').toBe(false);
    expect(v1.status, JSON.stringify(v1.error)).toBe('completed');
    // Why @1 is exempt (Task 5b, a parent decision P-5b-8): its streams report no fast-mode state, and the rules find it.
    const v1Lines = launchLinesOf(v1.launchesPath!);
    expect(usageViolations(v1Lines).map((f) => f.fact)).toContain('fast_mode_init');
    expect(v1Lines[1]!.observed).toMatchObject({ cliVersion: '2.1.226', fastMode: { init: [{ line: 1, fields: {} }] } });
    const v2 = await captureV2(writeCaptureDummy({ variant: 'v2' }), { executionId: 'v2' });
    expect(v2.status, JSON.stringify(v2.error)).toBe('completed');
    const v2Summary = summaryOf(v2.summaryPath);
    expect(Object.hasOwn(v2Summary, 'usageStop')).toBe(true);
    expect(v2Summary['usageStop']).toBeNull();
    expect(launchLinesOf(v2.launchesPath!)[1]!.observed).toMatchObject({ cliVersion: '2.1.295', reportedContextTokens: 628, fastMode: { init: [{ line: 1, fields: { fast_mode_state: 'off' } }] } });
    // The trust block is @2's alone (Task 5c, a parent decision P-5c-1): @1 files no trust key, and @2's clean run, the
    // positive control, files the four tiers.
    expect(Object.hasOwn(summaryOf(v1.summaryPath), 'trust'), '@1\'s execution.json carries a trust key').toBe(false);
    expectTrust(v2.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 20_000);

  it('V2-U12b — @1 has no in-flight stop: an explicit @1 injected capture whose third role launch reports a request of 190,001 tokens completes its nine role launches with no usageStop key, though the rules find the boundary in that launch\'s line (Task 5b review repair R14)', async () => {
    // The 2.1.226 stream prosecutor[1] is served, its message_start reporting 190,001 input tokens.
    const lens = LENSES[1]!;
    const events = syntheticStream('prosecutor', prosecution(lens), `req_synth_prosecutor_${lens}`).trim().split('\n').map((line) => JSON.parse(line) as Ev);
    const start = events[lineOf(events, (event) => event['type'] === 'stream_event' && (event['event'] as Ev)['type'] === 'message_start') - 1]!;
    ((start['event'] as Ev)['message'] as Ev)['usage'] = { input_tokens: 190001, output_tokens: 1 };
    const outcome = await captureSubscription(writeCaptureDummy({ streams: { 3: `${events.map((event) => JSON.stringify(event)).join('\n')}\n` } }), { executionId: 'v1-boundary' });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(roleLaunchCount()).toBe(9);
    expect(outcome.launches).toBe(9);
    expect(Object.hasOwn(summaryOf(outcome.summaryPath), 'usageStop'), '@1\'s execution.json carries a usageStop key').toBe(false);
    // Positive control: the third role launch (launch 4) served the boundary, and the rules find it in its line.
    const lines = launchLinesOf(outcome.launchesPath!);
    expect([lines[3]!.role, lines[3]!.index, lines[3]!.observed?.reportedContextTokens]).toEqual(['prosecutor', 1, 190001]);
    expect(usageViolations(lines).filter((f) => f.fact === 'long_context_boundary').map((f) => f.seq)).toEqual([4]);
  }, 20_000);

  it('V2-U13 — the launch line\'s observation is held to the stream\'s key rule: an orgId inside unifiedWindows of an accepted @2 stream is filed nowhere under the execution directory, though the dummy served it, and the filed observation keeps the key, redacted (Task 5b review repair R15, a parent decision P-5b-11)', async () => {
    const SECRET = 'org_OBSERVED_SECRET_31';
    const { text } = streamWith(1, (ev) => { rateInfoOf(ev)['unifiedWindows'] = [{ rateLimitType: 'seven_day', orgId: SECRET }]; });
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }), { executionId: 'observed-secret' });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    // Positive control: the stream the dummy served carries it.
    expect(readFileSync(join(streamSrcDirV2, 'launch-1.jsonl'), 'utf8')).toContain(SECRET);
    expect(filesCarrying(outcome.executionDir, SECRET), 'files under the execution directory carrying the orgId').toEqual([]);
    expect(launchLinesOf(outcome.launchesPath!)[1]!.observed?.rateLimits[0]?.info?.['unifiedWindows']).toStrictEqual([{ rateLimitType: 'seven_day', orgId: REDACTED }]);
    // The trust block the completed run filed (Task 5c review repair R5).
    expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
  }, 20_000);

  it('V2-U13b — the observation is held to the stream\'s value rule too: an email-pattern string and a string carrying the inherited HOME inside unifiedWindows, beside a rejected window with its own reset, no longer refuse the launch line; the line and its stream are filed, neither value is in any file under the execution directory though the dummy served both, and the usage stop holds the rejected window\'s own reset (Task 5b review repair N3, a parent decision P-5b-11, extended)', async () => {
    const EMAIL = 'limits-contact@example.invalid';
    const HOME_PATH = `${INHERITED.HOME}/usage/limits.json`;
    const { text, events } = streamWith(1, (ev) => {
      rateInfoOf(ev)['unifiedWindows'] = [{ rateLimitType: 'five_hour', contact: EMAIL, source: HOME_PATH }, { rateLimitType: 'seven_day', status: 'rejected', resetsAt: 1790079000 }];
    });
    const line = lineOf(events, isType('rate_limit_event'));
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }), { executionId: 'observed-values' });
    // The projection refuses the launch as exhausted, at the window; onLaunch's leak check refuses nothing, so the line is filed.
    expect(`${outcome.error?.name}: ${outcome.error?.message}`, 'the leak check refused the launch line').not.toContain('would carry');
    const stopped = expectStopped(outcome, {
      error: 'CliIncludedUsageExhaustedError',
      fragment: 'reports status "rejected" at unifiedWindows[1].status (rateLimitType "seven_day", resetsAt 1790079000)',
      usageStop: {
        kind: 'exhausted',
        facts: [{ fact: 'rate_limit_rejected', kind: 'exhausted', seq: 2, role: 'reader', index: 0, detail: `rate_limit_event at line ${line}: rate_limit_info.unifiedWindows[1].status "rejected"`, resetsAt: 1790079000 }],
        seq: 2,
        role: 'reader',
        index: 0,
        resetsAt: 1790079000,
        note: NOTE,
      },
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
    expect(launchLinesOf(outcome.launchesPath!).map((filed) => [filed.seq, filed.kind])).toEqual([[1, 'gate'], [2, 'role']]);
    const served = readFileSync(join(streamSrcDirV2, 'launch-1.jsonl'), 'utf8');
    for (const value of [EMAIL, INHERITED.HOME]) {
      // Positive control: the stream the dummy served carries it.
      expect(served, `the dummy served ${value}`).toContain(value);
      expect(filesCarrying(outcome.executionDir, value), `files under the execution directory carrying ${value}`).toEqual([]);
    }
    // The filed observation keeps both keys, their values redacted, and the rejected window as reported.
    expect(stopped.observed?.rateLimits[0]?.info?.['unifiedWindows']).toStrictEqual([{ rateLimitType: 'five_hour', contact: REDACTED, source: REDACTED }, { rateLimitType: 'seven_day', status: 'rejected', resetsAt: 1790079000 }]);
  }, 20_000);

  it('V2-U13c — a window keyed "__proto__" in the stream\'s own JSON text, reporting status "rejected" with its own reset: the filed launch line\'s observation keeps the entry, and the usage stop is exhausted at that window\'s reset, so the reset-pending hold is not lost (Task 5b review repair O1)', async () => {
    // The key is written as raw JSON text: JSON.stringify of an object literal cannot produce an own "__proto__" key.
    const PLACEHOLDER = 'unified-windows-placeholder';
    const RAW = '"unifiedWindows":{"__proto__":{"status":"rejected","resetsAt":1790500000}}';
    const { text: placeheld, events } = streamWith(1, (ev) => { rateInfoOf(ev)['unifiedWindows'] = PLACEHOLDER; });
    const text = placeheld.replace(`"unifiedWindows":"${PLACEHOLDER}"`, RAW);
    const line = lineOf(events, isType('rate_limit_event'));
    // Positive control: the served line carries the key as its own entry, with the rejected status.
    expect(text).toContain(RAW);
    expect(text).not.toContain(PLACEHOLDER);
    const servedWindows = (JSON.parse(text.trim().split('\n')[line - 1]!)['rate_limit_info'] as Ev)['unifiedWindows'] as Ev;
    expect(Object.hasOwn(servedWindows, '__proto__')).toBe(true);
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }), { executionId: 'proto-window' });
    const stopped = expectStopped(outcome, {
      error: 'CliIncludedUsageExhaustedError',
      fragment: 'reports status "rejected" at unifiedWindows["__proto__"].status',
      usageStop: {
        kind: 'exhausted',
        facts: [{ fact: 'rate_limit_rejected', kind: 'exhausted', seq: 2, role: 'reader', index: 0, detail: `rate_limit_event at line ${line}: rate_limit_info.unifiedWindows["__proto__"].status "rejected"`, resetsAt: 1790500000 }],
        seq: 2,
        role: 'reader',
        index: 0,
        resetsAt: 1790500000,
        note: NOTE,
      },
      roleLaunches: 1,
      stoppedSeq: 2,
      outcomes: ['reader[0] projection_refused'],
    });
    // The filed observation keeps the "__proto__" window as its own entry, with the status it reported.
    const filedWindows = stopped.observed?.rateLimits[0]?.info?.['unifiedWindows'] as Ev;
    expect(Object.hasOwn(filedWindows, '__proto__'), 'the filed observation holds "__proto__" as its own entry').toBe(true);
    expect(Object.getOwnPropertyDescriptor(filedWindows, '__proto__')?.value).toStrictEqual({ status: 'rejected', resetsAt: 1790500000 });
  }, 20_000);

  // claude-code-cli@3 on the same route (plan 2026-10-17, Task 5, sites 6 and 7): the same stop, the same hold from an
  // earlier record, its own stop holding the next, and the running record, each beside its negative control.
  describe('and claude-code-cli@3, held to every one of them', () => {
    /** Runs one capture on `@3`, handed in, under its budget of 9; the `v2` dummy serves it and records its argv. */
    const captureV3 = (pin: { path: string; sha256: string; sizeBytes: number }, over: CaptureOver = {}, sub: SubOver = {}) =>
      captureSubscription(pin, { env: SUB_ENV_V2, adapter: CLAUDE_CODE_CLI_V3_ADAPTER, ...over }, sub);

    it('V3-U1 — exhausted at prosecutor[0] (launch 3) on @3: CliIncludedUsageExhaustedError and the usage stop @2 files; the negative control, a clean @3 run, files a usage stop of none and completes', async () => {
      const { text, events } = streamWith(2, (ev) => { rateInfoOf(ev)['status'] = 'rejected'; });
      const line = lineOf(events, isType('rate_limit_event'));
      const outcome = await captureV3(writeCaptureDummy({ variant: 'v2', streams: { 2: text } }));
      expect(summaryOf(outcome.summaryPath)['adapter']).toBe('claude-code-cli@3');
      expectStopped(outcome, {
        error: 'CliIncludedUsageExhaustedError',
        fragment: `the rate_limit_event at line ${line} reports status "rejected" (rateLimitType "five_hour", resetsAt 1790075400)`,
        usageStop: {
          kind: 'exhausted',
          facts: [{ fact: 'rate_limit_rejected', kind: 'exhausted', seq: 3, role: 'prosecutor', index: 0, detail: `rate_limit_event at line ${line}: rate_limit_info.status "rejected"`, resetsAt: 1790075400 }],
          seq: 3,
          role: 'prosecutor',
          index: 0,
          resetsAt: 1790075400,
          note: NOTE,
        },
        roleLaunches: 2,
        stoppedSeq: 3,
        outcomes: ['reader[0] completed', 'prosecutor[0] projection_refused'],
      });
      // The stop's reset is long past by the real clock, so it holds nothing here.
      const clean = await captureV3(writeCaptureDummy({ variant: 'v2' }), { executionId: 'clean' });
      expect(clean.status, JSON.stringify(clean.error)).toBe('completed');
      expect(summaryOf(clean.summaryPath)).toMatchObject({ adapter: 'claude-code-cli@3', usageStop: null });
    }, 30_000);

    it('V3-U2 — a reset pending under the root holds @3 too: after a @2 stop whose reset is ahead of the clock, an @3 start is refused before anything is created; the negative control, exactly at the reset, proceeds', async () => {
      const { text } = streamWith(2, (ev) => { rateInfoOf(ev)['status'] = 'rejected'; });
      const stopped = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 2: text } }), { executionId: 'stopped' });
      expect(summaryOf(stopped.summaryPath)['usageStop']).toMatchObject({ kind: 'exhausted', resetsAt: 1790075400 });
      const caseDir = join(root(), 'csrd', 'CSRD-S-002');
      const gates = gateLaunchCount();
      const caught = await settled(captureV3(writeCaptureDummy({ variant: 'v2' }), { executionId: 'refused', now: () => new Date(BEFORE_RESET) }));
      const message = caught instanceof Error ? caught.message : `not refused: the capture returned status ${String((caught as { status?: unknown }).status)}`;
      expect(caught, message).toBeInstanceOf(UsageResetPendingError);
      expect(message).toContain(`the execution ${join('csrd', 'CSRD-S-002', 'stopped')} under the execution root stopped for included usage until 2026-09-22T11:10:00.000Z (usageStop.resetsAt 1790075400, epoch seconds)`);
      expect(message).toContain('this one would start at 2026-09-22T10:00:00.000Z, before it');
      expect(readdirSync(caseDir)).toEqual(['stopped']);
      expect(gateLaunchCount()).toBe(gates);
      const atReset = await captureV3(writeCaptureDummy({ variant: 'v2' }), { executionId: 'at-reset', now: () => new Date(1790075400 * 1000) });
      expect(atReset.status, JSON.stringify(atReset.error)).toBe('completed');
      expect(summaryOf(atReset.summaryPath)['adapter']).toBe('claude-code-cli@3');
      expect(readdirSync(caseDir).sort()).toEqual(['at-reset', 'stopped']);
    }, 30_000);

    it('V3-U2b — the record the 2026-10-17 @2 probe filed, failed with a usage stop of null, holds nothing: an @3 start under its root proceeds; the same record with an exhausted stop whose reset is ahead holds the next @3 start there, so the root is read', async () => {
      const executionRoot = join(scratch, 'probe-record-root');
      const probeRecord = join('synthetic-probe', 'opus55-minimal-shape', 'failed-no-stop');
      writeRecord(executionRoot, probeRecord, { status: 'failed', adapter: 'claude-code-cli@2', usageStop: null });
      const proceeds = await captureV3(writeCaptureDummy({ variant: 'v2' }), { executionRoot, executionId: 'after-probe', now: () => new Date(BEFORE_RESET) });
      expect(proceeds.status, JSON.stringify(proceeds.error)).toBe('completed');
      expect(summaryOf(proceeds.summaryPath)).toMatchObject({ adapter: 'claude-code-cli@3', usageStop: null });
      // The sibling: the same record, now stopped until a reset ahead of the clock, holds the next start before anything exists.
      writeRecord(executionRoot, probeRecord, exhaustedUntil(1790079000));
      const caught = await settled(captureV3(writeCaptureDummy({ variant: 'v2' }), { executionRoot, executionId: 'held', now: () => new Date(BEFORE_RESET) }));
      expect(caught).toBeInstanceOf(UsageResetPendingError);
      expect((caught as Error).message).toContain(`the execution ${probeRecord} under the execution root stopped for included usage until 2026-09-22T12:10:00.000Z`);
      expect(readdirSync(join(executionRoot, 'csrd', 'CSRD-S-002'))).toEqual(['after-probe']);
    }, 30_000);

    it('V3-U3 — @3\'s own stop holds the next execution under its root (usage_limit_reached at the reader with a finite reset, then a following start before it refused); the same start under another root is not held there, the hold binding only its own root', async () => {
      const { text } = streamWith(1, (ev) => { ev.splice(lineOf(ev, isType('rate_limit_event')) - 1, 0, usageLimitItem({ rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: 1790089800 } })); });
      const stopped = await captureV3(writeCaptureDummy({ variant: 'v2', streams: { 1: text } }), { executionId: 'stopped' });
      expect(stopped.status).toBe('failed');
      expect(summaryOf(stopped.summaryPath)).toMatchObject({ adapter: 'claude-code-cli@3', usageStop: { kind: 'exhausted', resetsAt: 1790089800 } });
      const caseDir = join(root(), 'csrd', 'CSRD-S-002');
      const following = await settled(captureV2(writeCaptureDummy({ variant: 'v2' }), { executionId: 'held', now: () => new Date(BEFORE_RESET) }));
      const message = following instanceof Error ? following.message : `not refused: the capture returned status ${String((following as { status?: unknown }).status)}`;
      expect(following, message).toBeInstanceOf(UsageResetPendingError);
      expect(message).toContain(`the execution ${join('csrd', 'CSRD-S-002', 'stopped')} under the execution root stopped for included usage until 2026-09-22T15:10:00.000Z (usageStop.resetsAt 1790089800, epoch seconds)`);
      expect(readdirSync(caseDir)).toEqual(['stopped']);
      const elsewhere = await captureV3(writeCaptureDummy({ variant: 'v2' }), { executionRoot: join(scratch, 'another-root'), executionId: 'elsewhere', now: () => new Date(BEFORE_RESET) });
      expect(elsewhere.status, JSON.stringify(elsewhere.error)).toBe('completed');
    }, 30_000);

    it('V3-U4 — while an @3 launch runs, execution.json says running with a trust key of null and a usage stop of none; the launch ended at its timeout with one rejected partial line files the stop (the in-flight stop, on @3)', async () => {
      const partial = `${JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', isUsingOverage: false, overageStatus: 'rejected', resetsAt: 1790079000 }, session_id: SESSION_ID, uuid: UUID })}\n`;
      const pin = writeCaptureDummy({ variant: 'v2', partialThenStallAt: { launch: 1, stdout: partial } });
      const pending = captureV3(pin, { deadlineMs: 5_000, executionId: 'partial' }, { launchTimeoutMs: 1_000 });
      await awaitReady();
      const running = summaryOf(join(root(), 'csrd', 'CSRD-S-002', 'partial', 'execution.json'));
      const outcome = await pending;
      expect(running).toMatchObject({ status: 'running', adapter: 'claude-code-cli@3', usageStop: null });
      expect(Object.hasOwn(running, 'trust'), '@3\'s running execution.json carries a trust key').toBe(true);
      expect(running['trust']).toBeNull();
      expect(outcome.error?.name).toBe('ProviderTimeoutError');
      expect(summaryOf(outcome.summaryPath)['usageStop']).toMatchObject({ kind: 'exhausted', seq: 2, role: 'reader', index: 0, resetsAt: 1790079000 });
    }, 20_000);
  });
});

// ===========================================================================
// Trust in four tiers on the @2 route (Opus 5.5 migration, D-9, Task 5c)
// ===========================================================================

describe('the trust block on the @2 route: four tiers, each a status and its method, taken after every withhold decision (plan 2026-09-25, D-9; Task 5c)', () => {
  // Every expectation is a literal written in this file — the methods, the sets, the statuses — never read off the
  // harness, the `@2` profile or `evidenceSetsOf`.
  /** Runs one capture on `@2`, handed in explicitly (the route's default is `@3`), under `@2`'s budget of 9. */
  const captureV2 = (pin: { path: string; sha256: string; sizeBytes: number }, over: CaptureOver = {}, sub: SubOver = {}) =>
    captureSubscription(pin, { env: SUB_ENV_V2, adapter: CLAUDE_CODE_CLI_V2_ADAPTER, ...over }, sub);
  /** A `@2` dummy whose reader serves `output`, in a stream `@2`'s projection accepts; every other role serves its fixture. */
  const readerServes = (output: unknown) => writeCaptureDummy({ variant: 'v2', streams: { 1: syntheticStreamV2(output, 'req_v2_reader') } });
  /** A verification directory of its own under the scratch root, holding the pack's real registry, as an execution's does. */
  const verificationDirFor = (name: string): string => {
    const dir = join(scratch, name);
    mkdirSync(join(dir, 'requirement-versions'), { recursive: true });
    cpSync(join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`), join(dir, 'requirement-versions', `${PACK_ID}.json`));
    return dir;
  };
  /**
   * `runSubscriptionCommand` over the replay capability: the harness's own composition of the production command —
   * the real pack, corpus and registry, the pipeline, assembly and the writer — every role answered from the
   * fixtures, `overrides` aside.
   */
  const commandOver = (verificationDir: string, overrides: SyntheticResponses = {}, requirementId: string = FIRST_LIVE_CASE.requirementId) =>
    runSubscriptionCommand(PACK_ID, requirementId, { ...paths(), verificationDir }, DEFAULT_ROLE_CONFIG, syntheticCapability(overrides), () => {});

  it('V2-T1 — trustOf, called directly over real records: every stage, and none, against the withhold facts and the evidence outcomes, each rule deciding alone: withheld beats passed and failed, either withhold fact alone withholds, a schema tier not valid is never measured, no set at all is unassessed with sets [], and no status or method says "verified"', async () => {
    // The records, each written by the harness's own composition over the replay capability, so every row's record is
    // one assembly produced and parsed: the fixtures as they are; RE-1's quote text fabricated on its real document and
    // hash; and a reader that halts on a gap, whose record is schema-valid and carries no evidence set.
    const passing = await commandOver(verificationDirFor('passing'));
    const fabricated = await commandOver(verificationDirFor('fabricated'), { reading: fabricatedReading() });
    const halted = await commandOver(verificationDirFor('halted'), { reading: haltedReading() as unknown as ReturnType<typeof reading> });
    for (const [name, command] of [['passing', passing], ['fabricated', fabricated], ['halted', halted]] as const) {
      expect(command.stage, `${name}: ${command.outcome.lines.join(' | ')}`).toBe('written');
    }
    const corpus = passing.world!.corpus;
    const records = { passing: passing.written!.result, fabricated: fabricated.written!.result, halted: halted.written!.result };
    // The halted record is the canonical gap-bearing one: every judgment container empty, one gap.
    expect([records.halted.reading.elements.length, records.halted.coverage.cells.length, records.halted.challenges.length, records.halted.gaps.length]).toEqual([0, 0, 0, 1]);

    // The schema tier each stage files, as literals.
    const SCHEMA = { written: 'valid', write_failed: 'valid', result_invalid: 'invalid', role_output_refused: 'invalid', world_refused: 'unassessed', none: 'unassessed' } as const;
    const stageOf = (key: keyof typeof SCHEMA): TrustInputs['stage'] => (key === 'none' ? null : key);
    const NEITHER = { resultWithheld: false, withheldBy: null };
    const WITHHELD = [
      ['a deletion alone', { resultWithheld: true, withheldBy: null }],
      ['a withhold rule alone', { resultWithheld: false, withheldBy: 'TerminationUnconfirmed' }],
      ['both', { resultWithheld: true, withheldBy: 'IncludedUsageUnconfirmed' }],
    ] as const;
    const rows: Array<[string, TrustInputs, ReturnType<typeof trustBlock>]> = [];
    // Withheld beats every stage and every evidence outcome, passed and failed included, and either fact alone
    // withholds: a deletion with no rule, or a rule with no deletion (the TerminationUnconfirmed rows are the backstop
    // no natural caller reaches; V2-T8).
    for (const key of Object.keys(SCHEMA) as Array<keyof typeof SCHEMA>) {
      for (const [facts, withheld] of WITHHELD) {
        for (const [evidence, result] of Object.entries(records)) {
          rows.push([`${key}, ${facts}, the ${evidence} record handed`, { error: 'RunRefused', stage: stageOf(key), result, corpus, ...withheld }, trustBlock('failed', 'RunRefused', SCHEMA[key], 'withheld', null)]);
        }
      }
    }
    // Not withheld, a schema tier not valid: never measured, though a record whose evidence would pass, or fail, is
    // handed with its corpus — inputs the harness never produces, which is the point (TEST-EVIDENCE-STANDARD, failure
    // mode 4: the schema conjunct shown to decide alone).
    for (const key of ['result_invalid', 'role_output_refused', 'world_refused', 'none'] as const) {
      for (const [evidence, result] of Object.entries(records)) {
        rows.push([`${key}, not withheld, the ${evidence} record handed`, { error: 'RunRefused', stage: stageOf(key), result, corpus, ...NEITHER }, trustBlock('failed', 'RunRefused', SCHEMA[key], 'unassessed', null)]);
      }
    }
    rows.push(
      // The rows the harness produces.
      ['written, passing', { error: null, stage: 'written', result: records.passing, corpus, ...NEITHER }, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS)],
      ['written, fabricated', { error: null, stage: 'written', result: records.fabricated, corpus, ...NEITHER }, trustBlock('completed', null, 'valid', 'failed', FABRICATED_SETS)],
      ['written, halted: no evidence set', { error: null, stage: 'written', result: records.halted, corpus, ...NEITHER }, trustBlock('completed', null, 'valid', 'unassessed', [])],
      ['write_failed: valid, and no written record', { error: 'RunRefused', stage: 'write_failed', result: null, corpus, ...NEITHER }, trustBlock('failed', 'RunRefused', 'valid', 'unassessed', null)],
      // write_failed handed a record, inputs the harness never produces: the schema tier admits the measurement, not
      // the stage's name.
      ['write_failed, not withheld, the passing record handed', { error: 'RunRefused', stage: 'write_failed', result: records.passing, corpus, ...NEITHER }, trustBlock('failed', 'RunRefused', 'valid', 'passed', CLEAN_SETS)],
      ['write_failed, not withheld, the fabricated record handed', { error: 'RunRefused', stage: 'write_failed', result: records.fabricated, corpus, ...NEITHER }, trustBlock('failed', 'RunRefused', 'valid', 'failed', FABRICATED_SETS)],
      ['write_failed, not withheld, the halted record handed', { error: 'RunRefused', stage: 'write_failed', result: records.halted, corpus, ...NEITHER }, trustBlock('failed', 'RunRefused', 'valid', 'unassessed', [])],
      ['role_output_refused, as the harness holds it', { error: 'RunRefused', stage: 'role_output_refused', result: null, corpus, ...NEITHER }, trustBlock('failed', 'RunRefused', 'invalid', 'unassessed', null)],
      ['result_invalid, as the harness holds it', { error: 'RunRefused', stage: 'result_invalid', result: null, corpus, ...NEITHER }, trustBlock('failed', 'RunRefused', 'invalid', 'unassessed', null)],
      ['world_refused, as the harness holds it: no world', { error: 'RunRefused', stage: 'world_refused', result: null, corpus: null, ...NEITHER }, trustBlock('failed', 'RunRefused', 'unassessed', 'unassessed', null)],
      ['no stage, as the harness holds it', { error: 'GateTimeout', stage: null, result: null, corpus: null, ...NEITHER }, trustBlock('failed', 'GateTimeout', 'unassessed', 'unassessed', null)],
      // The measurement's other two conjuncts, each failing alone beside a valid schema tier.
      ['written, passing, no corpus handed', { error: null, stage: 'written', result: records.passing, corpus: null, ...NEITHER }, trustBlock('completed', null, 'valid', 'unassessed', null)],
      ['written, no record handed', { error: null, stage: 'written', result: null, corpus, ...NEITHER }, trustBlock('completed', null, 'valid', 'unassessed', null)],
      // An error's name is data, carried verbatim even where it says "unverified" (a parent decision P-5c-4).
      ['no stage, an error whose name says unverified', { error: 'UnverifiedProviderAdapterError', stage: null, result: null, corpus: null, ...NEITHER }, trustBlock('failed', 'UnverifiedProviderAdapterError', 'unassessed', 'unassessed', null)],
      // The withhold rule apart from the execution tier (Task 5c review repair R2): every withheld row above names an
      // error, so these two, with none, show that either withhold fact alone withholds a completed execution's record.
      ['written, a deletion alone, the passing record handed, no error', { error: null, stage: 'written', result: records.passing, corpus, resultWithheld: true, withheldBy: null }, trustBlock('completed', null, 'valid', 'withheld', null)],
      ['written, a withhold rule alone, the passing record handed, no error', { error: null, stage: 'written', result: records.passing, corpus, resultWithheld: false, withheldBy: 'TerminationUnconfirmed' }, trustBlock('completed', null, 'valid', 'withheld', null)],
    );
    // The whole cross-product of six stages (none among them), four withhold facts and three records is 72 rows, plus
    // the eight rows with no record, no corpus, or a name to carry, and the two withheld rows with no error.
    expect(rows).toHaveLength(6 * 3 * 3 + 4 * 3 + 16);
    for (const [label, inputs, expected] of rows) {
      const trust = trustOf(inputs);
      // The block's own vocabulary first, so a planted word reds here by name: no status and no method says "verified".
      for (const [tier, value] of Object.entries(trust)) {
        expect(value.status, `${label}: ${tier}.status`).not.toMatch(/verified/i);
        expect(value.method, `${label}: ${tier}.method`).not.toMatch(/verified/i);
      }
      expect(trust.evidenceValidity.status, `${label}: evidenceValidity.status`).toBe(expected.evidenceValidity.status);
      expect(trust.schemaValidity.status, `${label}: schemaValidity.status`).toBe(expected.schemaValidity.status);
      expect(trust.substantiveCorrectness, `${label}: substantiveCorrectness`).toStrictEqual(TRUST_SUBSTANTIVE);
      expect(trust, label).toStrictEqual(expected);
    }
  }, 30_000);

  it('V2-T2 — runSubscriptionCommand says how far it got beside the outcome it always gave: written, role_output_refused, result_invalid, write_failed and world_refused, each with the world and the written record the trust block reads; an error it does not map propagates unchanged (Task 5c, a parent decision P-5c-6)', async () => {
    // written: the fixtures as they are.
    const writtenDir = verificationDirFor('written');
    const written = await commandOver(writtenDir);
    const destination = join(writtenDir, 'csrd', 'CSRD-S-002', 'verification-result.json');
    expect(written.stage, written.outcome.lines.join(' | ')).toBe('written');
    expect(written.outcome.exitCode).toBe(0);
    expect(written.outcome.lines[0]).toBe(`Wrote ${destination}`);
    expect(written.written?.status).toBe('written');
    expect(written.written?.path).toBe(destination);
    expect(written.written?.result.requirementId).toBe('CSRD-S-002');
    expect(existsSync(destination)).toBe(true);
    expect(written.world?.requirement.id).toBe('CSRD-S-002');

    // role_output_refused: RE-1 rests on an absence claim alone, which the reader's seam refuses.
    const seamDir = verificationDirFor('seam');
    const seam = await commandOver(seamDir, { reading: absenceOnlyReading() as unknown as ReturnType<typeof reading> });
    expect(seam.stage, seam.outcome.lines.join(' | ')).toBe('role_output_refused');
    expect(seam.outcome.exitCode).toBe(1);
    expect(seam.outcome.lines[0]).toBe('REFUSED — a role output was refused at its own boundary.');
    expect(seam.outcome.lines[1]).toContain('every evidence item is an absence claim');
    expect(seam.world?.requirement.id).toBe('CSRD-S-002');
    expect(seam.written).toBeNull();
    expect(existsSync(join(seamDir, 'csrd'))).toBe(false);

    // result_invalid: RE-1's quote pins DOC-32013L0034 at a well-formed hash the corpus does not hold; the seam takes
    // it, every role runs, and assembly refuses the record.
    const invalidDir = verificationDirFor('invalid');
    const invalid = await commandOver(invalidDir, { reading: wrongHashReading() });
    expect(invalid.stage, invalid.outcome.lines.join(' | ')).toBe('result_invalid');
    expect(invalid.outcome.exitCode).toBe(1);
    expect(invalid.outcome.lines[0]).toBe('REFUSED — the run did not produce a verification result, so nothing was written.');
    expect(invalid.outcome.lines.join('\n')).toContain('quote pins DOC-32013L0034 at hash');
    expect(invalid.world?.requirement.id).toBe('CSRD-S-002');
    expect(invalid.written).toBeNull();
    expect(existsSync(join(invalidDir, 'csrd'))).toBe(false);

    // write_failed: the record assembles valid and the filesystem refuses to publish it, a non-empty directory standing
    // where the record would be renamed to.
    const blockedDir = verificationDirFor('blocked');
    mkdirSync(join(blockedDir, 'csrd', 'CSRD-S-002', 'verification-result.json', 'occupied'), { recursive: true });
    const blocked = await commandOver(blockedDir);
    expect(blocked.stage, blocked.outcome.lines.join(' | ')).toBe('write_failed');
    expect(blocked.outcome.exitCode).toBe(2);
    expect(blocked.outcome.lines[0]).toBe('INTEGRITY FAILURE — the record was valid and the filesystem refused it at the publish stage.');
    expect(blocked.world?.requirement.id).toBe('CSRD-S-002');
    expect(blocked.written).toBeNull();

    // world_refused: a requirement the pack does not hold, refused by readWorld and mapped by outcomeFor; no world.
    const refused = await commandOver(verificationDirFor('world'), {}, 'CSRD-S-999');
    expect(refused).toStrictEqual({ outcome: { exitCode: 64, lines: ['Usage: pack csrd carries no requirement CSRD-S-999.'] }, stage: 'world_refused', world: null, written: null });

    // An error it does not map propagates unchanged, the same object, as every projection refusal and usage stop does.
    const thrown = new Error('RUNNER-REJECTED-5C');
    const rejecting = { ...syntheticCapability(), run: () => Promise.reject(thrown) };
    await expect(runSubscriptionCommand(PACK_ID, 'CSRD-S-002', { ...paths(), verificationDir: verificationDirFor('thrown') }, DEFAULT_ROLE_CONFIG, rejecting, () => {})).rejects.toBe(thrown);
  }, 30_000);

  it('V2-T3 — a reader output @2\'s projection accepts and the reader\'s seam refuses (RE-1 resting on an absence claim alone): failed as RunRefused after one role launch, no result file; trust says the schema tier is invalid and evidence unassessed, with no sets', async () => {
    const outcome = await captureV2(readerServes(absenceOnlyReading()), { executionId: 'seam' });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('RunRefused');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.lines[0]).toBe('REFUSED — a role output was refused at its own boundary.');
    expect(outcome.lines[1]).toContain('every evidence item is an absence claim');
    // The projection accepted the launch; the seam refused what it carried, and nothing later launched.
    expect(attemptsOf(outcome.attemptsPath).map((a) => `${a['role']}[${a['index']}] ${a['outcome']}`)).toEqual(['reader[0] completed']);
    expect(roleLaunchCount()).toBe(1);
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    expect(outcome.resultWithheld).toBe(false);
    expectTrust(outcome.summaryPath, trustBlock('failed', 'RunRefused', 'invalid', 'unassessed', null));
  }, 20_000);

  it('V2-T4 — fabricated text: the reader\'s RE-1 quote replaced by text its document does not hold, on DOC-32013L0034 and its real hash: the run completes, its result and transcript are written and kept, and execution.json itself files it so; trust measures the evidence failed, naming RE-1\'s set, every other set clean', async () => {
    const outcome = await captureV2(readerServes(fabricatedReading()), { executionId: 'fabricated' });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    // The measurement gates nothing: the result is written, kept, and carries the fabricated quote.
    expect(outcome.resultPath).toBe(resultFileOf(outcome.executionDir));
    expect(existsSync(outcome.resultPath!)).toBe(true);
    expect(readFileSync(outcome.resultPath!, 'utf8')).toContain(FABRICATED_QUOTE);
    expect(outcome.resultWithheld).toBe(false);
    // ... nor the filed account (Task 5c review repair R1): execution.json, written apart from the returned object,
    // says completed, with no error and nothing withheld, and files the result and the transcript the run returned.
    // The returned transcript path is held non-null and on disk first, so two nulled paths cannot agree.
    expect(outcome.transcriptPath).not.toBeNull();
    expect(existsSync(outcome.transcriptPath!)).toBe(true);
    const filed = summaryOf(outcome.summaryPath);
    expect(filed['status'], 'execution.json status').toBe('completed');
    expect(filed['error'], 'execution.json error').toBeNull();
    expect(filed['resultWithheld'], 'execution.json resultWithheld').toBe(false);
    expect(filed['resultPath'], 'execution.json resultPath').toBe(outcome.resultPath);
    expect(filed['transcriptPath'], 'execution.json transcriptPath').toBe(outcome.transcriptPath);
    const trust = expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'failed', FABRICATED_SETS));
    const sets = (trust['evidenceValidity'] as { sets: Array<{ recordPath: string; label: string; ok: boolean; problems: string[] }> }).sets;
    const failing = sets.filter((set) => !set.ok);
    expect(failing.map((set) => [set.recordPath, set.label])).toEqual([['reading.elements[0] (RE-1).evidence', 'reading element RE-1']]);
    expect(failing[0]!.problems.length).toBeGreaterThan(0);
    expect(failing[0]!.problems[0]).toContain('quote not found in DOC-32013L0034');
    // Every other set is present, and clean.
    expect(sets).toHaveLength(30);
    expect(sets.filter((set) => set.ok)).toHaveLength(29);
  }, 20_000);

  it('V2-T5 — a reader quote naming DOC-32013L0034 at a well-formed hash the corpus does not hold passes the seam and is refused by assembly: every role ran, failed as RunRefused, no result file; trust says the schema tier is invalid and evidence unassessed (the result_invalid stage, reached through the harness)', async () => {
    const outcome = await captureV2(readerServes(wrongHashReading()), { executionId: 'wrong-hash' });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('RunRefused');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.lines[0]).toBe('REFUSED — the run did not produce a verification result, so nothing was written.');
    expect(outcome.lines.join('\n')).toContain('quote pins DOC-32013L0034 at hash');
    // Assembly, not the seam: all nine roles answered, and the writer refused the record.
    expect(roleLaunchCount()).toBe(9);
    expect(attemptsOf(outcome.attemptsPath).map((a) => a['outcome'])).toEqual(Array<string>(9).fill('completed'));
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    expectTrust(outcome.summaryPath, trustBlock('failed', 'RunRefused', 'invalid', 'unassessed', null));
  }, 20_000);

  it('V2-T6 — a reader that halts on a gap: one role launch, its gap-bearing result written with no evidence set; completed, and trust has nothing to measure: evidence unassessed with sets []', async () => {
    const outcome = await captureV2(readerServes(haltedReading()), { executionId: 'halted' });
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(roleLaunchCount()).toBe(1);
    expect(outcome.launches).toBe(1);
    expect(outcome.lines[3]).toBe('  gaps: 1');
    expect(existsSync(outcome.resultPath!)).toBe(true);
    const result = JSON.parse(readFileSync(outcome.resultPath!, 'utf8')) as { reading: { elements: unknown[] }; challenges: unknown[]; gaps: Array<{ kind: string; docId?: string }> };
    expect([result.reading.elements.length, result.challenges.length]).toEqual([0, 0]);
    expect(result.gaps.map((gap) => [gap.kind, gap.docId])).toEqual([['corpus_gap', 'DOC-NOT-HELD-5C']]);
    expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'unassessed', []));
  }, 20_000);

  it('V2-T7 — a requirement the pack does not hold: the gate passes, readWorld refuses it and outcomeFor maps the refusal, so no role launches; failed as RunRefused, and trust says neither schema nor evidence was assessed', async () => {
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2' }), { requirementId: 'CSRD-S-999', executionId: 'world-refused' });
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('RunRefused');
    expect(outcome.exitCode).toBe(64);
    expect(outcome.lines).toEqual(['Usage: pack csrd carries no requirement CSRD-S-999.']);
    expect(gateLaunchCount()).toBe(1);
    expect(roleLaunchCount()).toBe(0);
    expect(outcome.launches).toBe(0);
    expectTrust(outcome.summaryPath, trustBlock('failed', 'RunRefused', 'unassessed', 'unassessed', null));
  }, 20_000);

  it('V2-T8 — T1 on @2: the last role launch given up on with its streams still held is refused by the transport at once, so the run never completes and nothing is written or withheld; trust files the failure with schema and evidence unassessed (the TerminationUnconfirmed withhold rule is the backstop no natural caller reaches, pinned by V2-T1\'s withheldBy rows)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    let spawns = 0;
    // T1's facade, for the tenth launch (the adjudicator): the real child answers and exits, its group is gone, and
    // the pipes are never seen to close.
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
    const outcome = await captureV2(pin, { executionId: 'unclosed' }, { launch: unclosed });
    expect(roleLaunchCount()).toBe(9);
    expect(attemptsOf(outcome.attemptsPath).map((a) => a['outcome'])).toEqual([...Array<string>(8).fill('completed'), 'ambiguous']);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('ProviderAmbiguousFailureError');
    expect(outcome.error?.message).toContain('streams_not_closed');
    expect(outcome.terminationUnconfirmed).toBe(true);
    expect(outcome.exitCode).toBeNull();
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    expect(outcome.resultWithheld).toBe(false);
    expect(summaryOf(outcome.summaryPath)).toMatchObject({ terminationUnconfirmed: true, resultWithheld: false });
    expect(launchLinesOf(outcome.launchesPath!)[9]).toMatchObject({ seq: 10, role: 'adjudicator', index: 0, streamsClosed: false });
    expectTrust(outcome.summaryPath, trustBlock('failed', 'ProviderAmbiguousFailureError', 'unassessed', 'unassessed', null));
  }, 20_000);

  it('V2-T9 — U1 on @2: the sensitive payload in the reader\'s structured output fails the execution closed after one role launch, the payload filed nowhere; trust says evidence withheld', async () => {
    const outcome = await captureV2(readerServes(reading(`${READING_ONE} (${SENSITIVE_PAYLOAD})`)), { executionId: 'leak-reader' });
    expect(filesCarrying(outcome.executionDir, SENSITIVE_MARKER), 'files under the execution directory carrying the planted marker').toEqual([]);
    expect(filesCarrying(outcome.executionDir, SENSITIVE_EMAIL), 'files under the execution directory carrying the planted email').toEqual([]);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('SensitiveOutputWithheldError');
    expect(roleLaunchCount()).toBe(1);
    expect(outcome.resultWithheld).toBe(true);
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    expectTrust(outcome.summaryPath, trustBlock('failed', 'SensitiveOutputWithheldError', 'unassessed', 'withheld', null));
  }, 20_000);

  it('V2-T10 — U2 on @2: the payload in the adjudicator\'s, the last role, where the pipeline would otherwise have completed: no transcript and no result, and trust says evidence withheld, never passed', async () => {
    const leaky = adjudication();
    leaky.adjudications[0]!.resolution = `${RESOLUTION} (${SENSITIVE_PAYLOAD})`;
    const outcome = await captureV2(writeCaptureDummy({ variant: 'v2', streams: { 9: syntheticStreamV2(leaky, 'req_v2_adjudicator') } }), { executionId: 'leak-adjudicator' });
    expect(filesCarrying(outcome.executionDir, SENSITIVE_MARKER), 'files under the execution directory carrying the planted marker').toEqual([]);
    expect(filesCarrying(outcome.executionDir, SENSITIVE_EMAIL), 'files under the execution directory carrying the planted email').toEqual([]);
    expect(outcome.status).toBe('failed');
    expect(outcome.error?.name).toBe('SensitiveOutputWithheldError');
    expect(roleLaunchCount()).toBe(9);
    expect(attemptsOf(outcome.attemptsPath).slice(0, 8).every((a) => a['outcome'] === 'completed')).toBe(true);
    expect(outcome.exitCode).toBeNull();
    expect(outcome.transcriptPath).toBeNull();
    expect(outcome.resultWithheld).toBe(true);
    expect(existsSync(resultFileOf(outcome.executionDir))).toBe(false);
    expectTrust(outcome.summaryPath, trustBlock('failed', 'SensitiveOutputWithheldError', 'unassessed', 'withheld', null));
  }, 20_000);
});

// ===========================================================================
// claude-code-cli@3 on the subscription route (plan 2026-10-17, Task 5)
// ===========================================================================

describe('the subscription route runs claude-code-cli@3 by default: --permission-mode default requested, and every protection @2 has, each beside its negative control', () => {
  // Every `@3` value below is a literal written here, never read off the `@3` profile or adapter.
  const V2_SETTINGS = '{"switchModelsOnFlag":false,"fastMode":false,"autoContinueAtUsageLimit":false}';
  const V3_PIPELINE_VERSION = 'pipeline-v3-ecb06a30764aff78ecf25bde4a8c3e25fcf4d827ce336a5cd757863ae8eb332d';
  const V2_PIPELINE_VERSION = 'pipeline-v3-737f8d5015ea4249eef93cfa66c0b1b9bbb323fd633e7d5a71c26f453f8ce90e';
  const V2_SHA256 = '494870c9763b5ea370b6165e7e04af589a7b2472bf0de18ffb25477f8230bdf6';
  /** `@3`'s thirteen launch controls: `@2`'s. */
  const V3_CONTROLS = {
    CLAUDE_CODE_MAX_RETRIES: '0',
    MAX_STRUCTURED_OUTPUT_RETRIES: '0',
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000',
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_NO_MODEL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_FAST_MODE: '1',
    CLAUDE_CODE_DISABLE_REFUSAL_RETRY: '1',
    CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS: '1',
  };
  const V2_UNOBSERVED = {
    outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000, which 2.1.295 honours statically up to the model\'s own limit; wire-level max_tokens unobserved',
    effort: 'effort high passed as --effort; its application unobserved',
    thinking: 'always on for claude-opus-5-5, and counted toward the 64000 ceiling; not asserted',
    modelCatalog: 'not pinned by the executable hash: the embedded catalog expires at 2026-10-15T05:28:34Z, and a remote catalog is assumed blocked by CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, unverified',
    extraUsage: 'overageEnabled is reported only on some allowed_warning events (2.1.295, statically); its absence is not read as extra usage off, and extra usage being off remains the user-confirmed precondition of D-6',
  };
  const V3_UNOBSERVED = {
    ...V2_UNOBSERVED,
    permissionMode: '--permission-mode default requested, and the init event held to exactly "default"; that 2.1.295 applies the flag is a static reading of its bytes only, and why the 2026-10-17 @2 probe reported "auto" with no flag supplied is unknown',
  };
  const INHERITED_ENV = { HOME: INHERITED.HOME, USER: INHERITED.USER, PATH: INHERITED.PATH };
  /** The reader's full recorded argv under `@3`: `@2`'s, with the one pair after --no-session-persistence. */
  const V3_READER_ARGV = [
    '-p',
    '--model',
    'claude-opus-5-5',
    '--effort',
    'high',
    '--safe-mode',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--permission-mode',
    'default',
    '--settings',
    V2_SETTINGS,
    '--system-prompt-file',
    '<system-prompt-file>',
    '--json-schema',
    JSON.stringify(roleOutputJsonSchema('reader')),
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
  ];
  const settledOf = (pending: Promise<unknown>): Promise<unknown> => pending.then((outcome) => outcome, (error: unknown) => error);
  /** One capture with no adapter handed in, so the route's default runs, under a budget of 9. */
  const captureDefault = (pin: { path: string; sha256: string; sizeBytes: number }, over: CaptureOver = {}, sub: SubOver = {}) =>
    captureSubscription(pin, { env: SUB_ENV_V2, adapter: undefined, ...over }, sub);

  it('V3-E1 — with no adapter handed in, the route runs @3: nine role launches complete under @3\'s identity, pin, controls, permission mode, unobserved statements, budgets, gate, trust and a usage stop of none; @2 handed in and @1 are the negative controls', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const outcome = await captureDefault(pin);
    expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
    expect(gateLaunchCount()).toBe(1);
    expect(roleLaunchCount()).toBe(9);
    for (let n = 1; n <= 9; n += 1) expect(roleEnvOf(n), `the environment role launch ${n} saw`).toEqual({ ...V3_CONTROLS, ...INHERITED_ENV });
    // Configuration and profile selection, reached end to end: @3's identity on the transcript.
    const transcript = parseRunTranscript(readFileSync(outcome.transcriptPath!, 'utf8'), outcome.transcriptPath!);
    expect(transcript.pipelineVersion).toBe(V3_PIPELINE_VERSION);
    const summary = summaryOf(outcome.summaryPath);
    expect(summary).toMatchObject({ status: 'completed', route: 'subscription', attemptUnit: 'cli_launch', adapter: 'claude-code-cli@3', launches: 9, gateLaunches: 1, error: null, runId: outcome.runId });
    expect(summary['requested']).toEqual({ pin: { version: '2.1.295', sha256: V2_SHA256, sizeBytes: 239695888 }, permittedModels: ['claude-opus-5-5'], effort: 'high', maxOutputTokens: 64000, settings: V2_SETTINGS, settingsFrom: 'profile', permissionMode: 'default' });
    expect(summary['unobserved']).toEqual(V3_UNOBSERVED);
    expect(summary['budgets']).toEqual({ launchTimeoutMs: 1_800_000, gateTimeoutMs: 60_000, lifetimeMs: 16_470_000, injected: false });
    expect(summary['ledger']).toMatchObject({ maxRunAttempts: 9, attemptsUsed: 9, attemptsRemaining: 0, launchesStarted: 9 });
    expect(summary['usageStop']).toBeNull();
    expectTrust(outcome.summaryPath, trustBlock('completed', null, 'valid', 'passed', CLEAN_SETS));
    const launches = launchLinesOf(outcome.launchesPath!);
    expect(launches[1]!.argv).toEqual(V3_READER_ARGV);
    for (const line of launches.slice(1)) expect(line.argv.slice(12, 15)).toEqual(['--no-session-persistence', '--permission-mode', 'default']);

    // Negative control: @2 handed in runs as it always did, its identity, no mode requested, recorded or stated.
    const v2 = await captureSubscription(writeCaptureDummy({ variant: 'v2' }), { env: SUB_ENV_V2, adapter: CLAUDE_CODE_CLI_V2_ADAPTER, executionId: 'v2-control' });
    expect(v2.status, JSON.stringify(v2.error)).toBe('completed');
    const v2Summary = summaryOf(v2.summaryPath);
    expect(v2Summary['adapter']).toBe('claude-code-cli@2');
    expect(parseRunTranscript(readFileSync(v2.transcriptPath!, 'utf8'), v2.transcriptPath!).pipelineVersion).toBe(V2_PIPELINE_VERSION);
    expect(Object.hasOwn(v2Summary['requested'] as object, 'permissionMode'), '@2\'s requested carries a permission mode').toBe(false);
    expect(v2Summary['unobserved']).toEqual(V2_UNOBSERVED);
    for (const line of launchLinesOf(v2.launchesPath!).slice(1)) expect(line.argv).not.toContain('--permission-mode');
    expect(v2.runId).not.toBe(outcome.runId);
    // Negative control for the trust protection: @1 files no trust key at all, nor any permission mode.
    const v1 = await captureSubscription(writeCaptureDummy(), { executionId: 'v1-control' });
    expect(v1.status, JSON.stringify(v1.error)).toBe('completed');
    expect(Object.hasOwn(summaryOf(v1.summaryPath), 'trust'), '@1\'s execution.json carries a trust key').toBe(false);
    expect(Object.hasOwn(summaryOf(v1.summaryPath)['requested'] as object, 'permissionMode')).toBe(false);
  }, 30_000);

  it('V3-R1 — an identity no entry knows, claude-code-cli@4, is refused by name before anything exists, as the adapter handed in and in each lookup; @3 is answered by its own entries, and @2 by its own', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const v4 = { ...CLAUDE_CODE_CLI_V3_ADAPTER, identity: { id: 'claude-code-cli', version: '4' } };
    const caught = await settledOf(captureSubscription(pin, { env: SUB_ENV_V2, adapter: v4 }));
    expect(caught).toBeInstanceOf(SubscriptionRouteMismatchError);
    expect((caught as Error).message).toContain('the adapter handed in is claude-code-cli@4');
    expect(existsSync(root())).toBe(false);
    expect(gateLaunchCount()).toBe(0);
    expect(() => subscriptionRoleConfigFor({ identity: { id: 'claude-code-cli', version: '4' } })).toThrow('the adapter handed in is claude-code-cli@4');
    expect(() => subscriptionExecutableFor({ identity: { id: 'claude-code-cli', version: '4' } }, '/Users/someone')).toThrow(SubscriptionRouteMismatchError);
    expect(subscriptionRoleConfigFor(CLAUDE_CODE_CLI_V3_ADAPTER)).toBe(SUBSCRIPTION_ROLE_CONFIG_V3);
    expect(subscriptionRoleConfigFor({ identity: { id: 'claude-code-cli', version: '3' } })).toBe(SUBSCRIPTION_ROLE_CONFIG_V3);
    expect(subscriptionRoleConfigFor(CLAUDE_CODE_CLI_V2_ADAPTER)).toBe(SUBSCRIPTION_ROLE_CONFIG);
    expect(SUBSCRIPTION_ROLE_CONFIG_V3).not.toBe(SUBSCRIPTION_ROLE_CONFIG);
    expect(subscriptionExecutableFor(CLAUDE_CODE_CLI_V3_ADAPTER, '/Users/someone')).toEqual({
      path: '/Users/someone/.local/share/datastrata/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude',
      sha256: V2_SHA256,
      sizeBytes: 239695888,
    });
  });

  it('V3-B1 — an @3 launch budget of 10, above the nine role launches, is refused by name, naming claude-code-cli@3, before anything exists; nine is the positive control (V3-E1)', async () => {
    const env10 = { ...SUB_ENV, [LIVE_MAX_ATTEMPTS_ENV]: '10' };
    const caught = await settledOf(captureDefault(writeCaptureDummy({ variant: 'v2' }), { env: env10 }));
    expect(caught).toBeInstanceOf(SubscriptionBudgetError);
    expect((caught as Error).message).toContain('claude-code-cli@3 admits a launch budget of at most 9');
    expect((caught as Error).message).toContain('DATASTRATA_AGENT_MAX_ATTEMPTS states 10');
    expect(existsSync(root())).toBe(false);
    expect(gateLaunchCount()).toBe(0);
    expect(roleLaunchCount()).toBe(0);
  });

  it('V3-H1 — @3\'s transport handed a description without the permission mode (an adapter with @3\'s identity whose request drops the key) launches no role child: refused by the mode, the gate only having run; @3 itself launches (V3-E1)', async () => {
    const pin = writeCaptureDummy({ variant: 'v2' });
    const dropped = {
      ...CLAUDE_CODE_CLI_V3_ADAPTER,
      buildRequest: (request: RoleRequest, config: Parameters<typeof CLAUDE_CODE_CLI_V3_ADAPTER.buildRequest>[1]) => {
        const built = CLAUDE_CODE_CLI_V3_ADAPTER.buildRequest(request, config);
        const { permissionMode: _dropped, ...spec } = JSON.parse(built.body) as Record<string, unknown>;
        return { ...built, body: JSON.stringify(spec) };
      },
    };
    const outcome = await captureSubscription(pin, { env: SUB_ENV_V2, adapter: dropped });
    expect(roleLaunchCount(), 'role children launched for a description without the profile\'s mode').toBe(0);
    expect(outcome.status).toBe('failed');
    // The runner books a refusal it cannot classify as ambiguous; the refusal's own name and words ride in the message.
    expect(outcome.error?.name).toBe('ProviderAmbiguousFailureError');
    expect(outcome.error?.message).toContain('LaunchPermissionModeMismatchError');
    expect(outcome.error?.message).toContain('the launch description\'s --permission-mode is absent, and the transport\'s profile permission mode is "default"');
    expect(outcome.launches).toBe(0);
    expect(gateLaunchCount()).toBe(1);
    expect(launchLinesOf(outcome.launchesPath!).filter((line) => line.kind === 'role')).toEqual([]);
    expect(readdirSync(tempRoot)).toEqual([]);
  });
});
