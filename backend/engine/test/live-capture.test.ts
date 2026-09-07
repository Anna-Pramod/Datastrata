/**
 * The deliberate S-002 capture route, proved offline (pre-live preparation).
 *
 * A genuine run is evidence only if what it produced survives together: the
 * transcript, the dossier it wrote and the per-attempt diagnostics that say
 * what each HTTP attempt did. The historical fixtures under
 * `test/verification-transcripts/` are filed by run identity, which is
 * deterministic — so two genuine executions of one question derive one
 * `runId`, and filing them there would overwrite. This harness files by
 * *execution* instead, under its own root, and never inside a fixture root.
 * A failed execution keeps its diagnostics and writes no transcript, so
 * incomplete evidence is never shaped like a completed recording.
 *
 * Every case runs under the suite-wide offline guard with an injected
 * transport; nothing here can reach a provider.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { VerifyPaths } from '../src/cli/sign';
import { LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV } from '../src/cli/live-wiring';
import { ANTHROPIC_MESSAGES_ADAPTER, ANTHROPIC_MESSAGES_IDENTITY } from '../src/pipeline/anthropic-messages';
import { LIVE_AGENTS_ENV, LIVE_AGENTS_TOKEN, type ProviderHttpResponse, type ProviderTransport } from '../src/pipeline/live-runner';
import { parseRunTranscript, TRANSCRIPT_ROOT } from '../src/pipeline/transcript';
import { assertSupportedLifetime, captureLiveRun, DEFAULT_FIXTURE_ROOT, ExecutionExistsError, ExecutionRootError, executionLifetimeMs, FIRST_LIVE_CASE, LIFETIME_MARGIN_MS, LIVE_EXECUTION_ROOT, MAX_EXECUTION_LIFETIME_MS, MAX_TIMER_MS, runFirstLiveCase, UnsupportedLifetimeError } from './live-capture';
import { DEFAULT_TIMEOUT_MS, MAX_RETRY_AFTER_MS } from '../src/pipeline/live-runner';
import { offlineGuard } from './setup/offline-guard';
import { cannedAnthropicTransport, engineRoot, FIXTURE_TRANSCRIPT_ROOT, PACK_ID } from './replay-fixtures';

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
    expect(summary).toMatchObject({ status: 'completed', packId: 'csrd', requirementId: 'CSRD-S-002', runId: outcome.runId, synthetic: true, adapter: 'anthropic-messages@1', error: null, httpAttempts: 9, unsentEvents: 0, recordsWritten: 9 });
    expect(summary['ledger']).toMatchObject({ attemptsUsed: 9, maxRunAttempts: 27, attemptsRemaining: 18 });
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
