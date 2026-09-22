/**
 * The live runner's transport: bounded, retried, timed out, and never spending
 * during offline tests (B-ADAPTER).
 *
 * The runner performs the request an adapter describes. What it adds is the
 * behaviour a real endpoint demands and a canned one never does: a timeout
 * that a hung connection cannot outlive, a bounded retry on the statuses the
 * official errors reference marks transient, no retry on a client error or on
 * a timeout that may already have been billed, and diagnostics that name the
 * status, the error type and the request id without ever carrying the
 * credential. The transport is injected here so every case runs against a
 * fake and the network trap proves the real one was never reached.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspect } from 'node:util';
import {
  AttemptBudgetExhaustedError,
  ExecutionCancelledError,
  fetchTransport,
  InputAdmissionError,
  InvalidBudgetError,
  LiveAgentRunner,
  ObservationFailedError,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  MAX_RETRY_AFTER_MS,
  ProviderAmbiguousFailureError,
  ProviderHttpError,
  ProviderTimeoutError,
  RETRYABLE_STATUSES,
  TransportFailure,
  type AttemptRecord,
  type ProviderHttpResponse,
  type ProviderTransport,
} from '../src/pipeline/live-runner';
import { ANTHROPIC_MESSAGES_ADAPTER, ProviderOutputTruncatedError, ProviderRefusalError, ProviderResponseError } from '../src/pipeline/anthropic-messages';
import type { RoleRequest } from '../src/pipeline/roles';
import { installNetworkTrap } from './helpers';
import { stubReaderOutput } from './pipeline-fixtures';

const KEY = 'sk-ant-secret-9f8e7d6c';
const ENDPOINT = 'https://api.example.invalid/v1/messages';

function roleRequest(): RoleRequest {
  return {
    role: 'reader',
    index: 0,
    model: 'claude-opus-5',
    promptSha256: 'a'.repeat(64),
    messages: [
      { from: 'prompt', content: 'prompt' },
      { from: 'input', content: 'input' },
    ],
  };
}

const ok = (text = JSON.stringify(stubReaderOutput()), stop = 'end_turn', usage?: Record<string, unknown>): ProviderHttpResponse => ({
  status: 200,
  headers: { 'request-id': 'req_ok' },
  body: JSON.stringify({ type: 'message', content: [{ type: 'text', text }], stop_reason: stop, ...(usage === undefined ? {} : { usage }) }),
});
const failure = (status: number, type: string, headers: Record<string, string> = {}): ProviderHttpResponse => ({
  status,
  headers: { 'request-id': `req_${status}`, ...headers },
  body: JSON.stringify({ type: 'error', error: { type, message: `${type} happened` }, request_id: `req_${status}` }),
});

/** A transport that answers from a script and records what it was sent. */
function scripted(answers: Array<ProviderHttpResponse | Error | 'hang'>) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const transport: ProviderTransport = (request, signal) => {
    calls.push({ url: request.url, headers: { ...request.headers }, body: request.body });
    const next = answers.shift();
    if (next === undefined) throw new Error('script exhausted');
    if (next === 'hang') {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  return { transport, calls };
}

function runner(transport: ProviderTransport, over: Partial<ConstructorParameters<typeof LiveAgentRunner>[0]> = {}) {
  const slept: number[] = [];
  const records: AttemptRecord[] = [];
  const instance = new LiveAgentRunner({
    observe: (record) => {
      records.push(record);
    },
    endpoint: ENDPOINT,
    apiKey: KEY,
    adapter: ANTHROPIC_MESSAGES_ADAPTER,
    transport,
    timeoutMs: 50,
    maxAttempts: 3,
    backoffMs: 1000,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
    ...over,
  });
  return { instance, slept, records };
}

/**
 * The trap is installed for every case, not only the ones that assert on it:
 * a red test must not be able to reach the network either. `T9` checks the
 * trap's own calls; every other case ends with it unfired.
 */
let trap: ReturnType<typeof installNetworkTrap>;
beforeEach(() => {
  trap = installNetworkTrap();
});
afterEach(() => {
  delete process.env[LIVE_AGENTS_ENV];
  trap.restore();
});

describe('a fake transport, and the real one never reached', () => {
  it('T1 — completes through the adapter and the fake, with the credential in the request header only and the trap unfired', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([ok()]);
    const { instance } = runner(transport);
    const response = await instance.run(roleRequest());
    expect(JSON.parse(response.outputJson)).toEqual(stubReaderOutput());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(ENDPOINT);
    expect(calls[0]!.headers['x-api-key']).toBe(KEY);
    expect(calls[0]!.body).not.toContain(KEY);
    expect(trap.calls).toEqual([]);
  });

  it('T9 — the default transport is fetch, so a runner built without one reaches the trap and nothing else', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { instance } = runner(fetchTransport, { maxAttempts: 1 });
    await expect(instance.run(roleRequest())).rejects.toThrow(/NETWORK TRAP/);
    expect(trap.calls).toEqual([ENDPOINT]);
  });
});

describe('bounded retry on transient statuses', () => {
  it('T2 — a 429 is retried after the retry-after delay, and the second answer is the result', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([failure(429, 'rate_limit_error', { 'retry-after': '2' }), ok()]);
    const { instance, slept } = runner(transport);
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);
    expect(slept).toEqual([2000]);
  });

  it('T3 — three 5xx answers exhaust the attempts; the refusal names the status, the type, the request id and the count', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([failure(529, 'overloaded_error'), failure(500, 'api_error'), failure(503, 'api_error')]);
    const { instance, slept } = runner(transport);
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect(String((error as Error).message)).toMatch(/reader\[0\].*503.*api_error.*req_503.*3 attempts/);
    expect(calls).toHaveLength(3);
    expect(slept).toEqual([1000, 2000]);
    expect(RETRYABLE_STATUSES.has(529)).toBe(true);
  });

  it('T6 — a failure the transport can vouch for as pre-submission is retried, then succeeds', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([new TransportFailure('before_send', 'connection refused'), ok()]);
    const { instance } = runner(transport);
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);
  });
});

describe('the provider\'s delay is honoured, never shortened', () => {
  it('R1 — a retry-after longer than the permitted wait is refused without sleeping and without retrying: an earlier retry would fail', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([failure(429, 'rate_limit_error', { 'retry-after': '120' }), ok()]);
    const { instance, slept } = runner(transport);
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect((error as Error).message).toMatch(/retry-after 120 s.*permitted wait/);
    expect(calls).toHaveLength(1);
    expect(slept).toEqual([]);
    expect(MAX_RETRY_AFTER_MS).toBe(60_000);
  });

  it('R2 — a retry-after inside the permitted wait is waited for exactly, not the backoff', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport } = scripted([failure(429, 'rate_limit_error', { 'retry-after': '45' }), ok()]);
    const { instance, slept } = runner(transport);
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    expect(slept).toEqual([45_000]);
  });

  it('R3 — a spend-cap 429 carries no retry-after and is refused at once: retrying fails until access resumes', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const spendCap: ProviderHttpResponse = {
      status: 429,
      headers: { 'request-id': 'req_cap' },
      body: JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'You have reached your API usage limits', details: { error_code: 'enforced_spend_limit_reached' } }, request_id: 'req_cap' }),
    };
    const { transport, calls } = scripted([spendCap, ok()]);
    const { instance, slept } = runner(transport);
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect((error as Error).message).toMatch(/enforced_spend_limit_reached/);
    expect(calls).toHaveLength(1);
    expect(slept).toEqual([]);
  });
});

describe('ambiguous failures are not retried', () => {
  it('R4 — a failure after the request was submitted is refused as ambiguous, naming that processing and billing are unknown; nothing is resent', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    // A plain TypeError is what fetch rejects with, and it cannot say whether
    // the request had left: treated as ambiguous.
    const { transport, calls } = scripted([new TypeError('fetch failed: socket hang up while reading the response'), ok()]);
    const { instance, slept } = runner(transport);
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderAmbiguousFailureError);
    expect((error as Error).message).toMatch(/unknown whether the provider processed/);
    expect(calls).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  it('R5 — only a failure the transport reports as before submission is retried', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([new TransportFailure('before_send', 'connection refused'), ok()]);
    const { instance } = runner(transport);
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);
    expect(instance.attempts).toBe(2);
  });

  it('R6 — the runner accounts for every HTTP attempt, and the ceiling per role invocation is the attempt bound', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport } = scripted([failure(500, 'api_error'), failure(500, 'api_error'), ok()]);
    const { instance } = runner(transport);
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    expect(instance.attempts).toBe(3);
    expect(instance.maxAttempts).toBe(3);
  });
});

describe('diagnostics never carry the credential', () => {
  const secretIn = (text: string) => `${text} ${KEY} ${text}`;

  it('C1 — a transport failure whose message contains the key is reported with the key redacted', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport } = scripted([new TransportFailure('before_send', secretIn('dial failed with header')), new TransportFailure('before_send', secretIn('again'))]);
    const { instance } = runner(transport, { maxAttempts: 2 });
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).message).toContain('[redacted]');
    const ambiguous = await runner(scripted([new TypeError(secretIn('socket'))]).transport).instance.run(roleRequest()).catch((e: unknown) => e);
    expect((ambiguous as Error).message).not.toContain(KEY);
  });

  it('C2 — an error envelope whose fields echo the key is reported with the key redacted, its status and attempt count kept', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const echo: ProviderHttpResponse = {
      status: 400,
      headers: { 'request-id': secretIn('req') },
      body: JSON.stringify({ type: 'error', error: { type: secretIn('invalid_request_error'), message: secretIn('bad key') }, request_id: secretIn('req') }),
    };
    const { instance } = runner(scripted([echo]).transport);
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).message).toMatch(/400.*\[redacted\].*1 attempt/);
  });

  /**
   * The whole surface an error exposes, not only `message`: what Node prints
   * for an uncaught rejection at the process edge is `util.inspect`, which
   * includes the stack and every own enumerable property. An error whose
   * message is clean and whose `explanation` property still holds the key
   * leaks it the moment it escapes.
   */
  const ownStrings = (error: unknown): Record<string, string> =>
    Object.fromEntries(Object.getOwnPropertyNames(error).map((k) => [k, (error as Record<string, unknown>)[k]]).filter((e): e is [string, string] => typeof e[1] === 'string'));

  it('C3 — a refusal carrying provider text with the key is reported with the key redacted from the message, the stack, every exposed property and util.inspect; its classification survives', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const refused: ProviderHttpResponse = {
      status: 200,
      headers: {},
      body: JSON.stringify({ type: 'message', content: [{ type: 'text', text: '{}' }], stop_reason: 'refusal', stop_details: { type: 'refusal', category: secretIn('cyber'), explanation: secretIn('declined') } }),
    };
    // Positive control: the adapter's own error does expose the key through
    // its properties and through inspect, so the runner is what removes it.
    const raw = new ProviderRefusalError(roleRequest(), secretIn('cyber'), secretIn('declined'));
    expect(raw.explanation).toContain(KEY);
    expect(inspect(raw)).toContain(KEY);

    const { instance } = runner(scripted([refused]).transport);
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderRefusalError);
    expect((error as Error).name).toBe('ProviderRefusalError');
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).message).toContain('[redacted]');
    expect((error as Error).stack ?? '').not.toContain(KEY);
    for (const [property, value] of Object.entries(ownStrings(error))) {
      expect(value, property).not.toContain(KEY);
    }
    expect(inspect(error)).not.toContain(KEY);
    // The safe parts of the classification are still there to read.
    expect((error as ProviderRefusalError).category).toContain('cyber');
    expect((error as ProviderRefusalError).category).toContain('[redacted]');
    expect((error as ProviderRefusalError).explanation).toContain('declined');
  });

  it('C4 — an error envelope under a 2xx status whose type, message and request id echo the key is reported with the key redacted from the whole error; type and request id survive in redacted form', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const echoed: ProviderHttpResponse = {
      status: 200,
      headers: {},
      body: JSON.stringify({ type: 'error', error: { type: secretIn('invalid_request_error'), message: secretIn('bad key') }, request_id: secretIn('req') }),
    };
    const { instance } = runner(scripted([echoed]).transport);
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderResponseError);
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).stack ?? '').not.toContain(KEY);
    for (const [property, value] of Object.entries(ownStrings(error))) {
      expect(value, property).not.toContain(KEY);
    }
    expect(inspect(error)).not.toContain(KEY);
    expect((error as ProviderResponseError).errorType).toContain('invalid_request_error');
    expect((error as ProviderResponseError).errorType).toContain('[redacted]');
    expect((error as ProviderResponseError).detail).toContain('bad key');
    expect((error as ProviderResponseError).requestId).toContain('req');
    expect((error as ProviderResponseError).requestId).not.toContain(KEY);
  });
});

describe('what is not retried', () => {
  it('T4 — a client error is refused at once, naming its type and request id, and carrying no credential', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([failure(400, 'invalid_request_error')]);
    const { instance, slept } = runner(transport);
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect((error as Error).message).toMatch(/400.*invalid_request_error.*req_400/);
    expect((error as Error).message).not.toContain(KEY);
    expect(calls).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  it('T5 — a request that outlives the timeout is aborted and refused, not retried: it may already have been billed', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted(['hang', ok()]);
    const { instance } = runner(transport, { timeoutMs: 20 });
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect((error as Error).message).toMatch(/20 ms/);
    expect(calls).toHaveLength(1);
  });

  it('T7 — a completed answer that the adapter refuses is not retried: the request succeeded and the content is unusable', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([ok('{"elements": [', 'max_tokens'), ok()]);
    const { instance } = runner(transport);
    await expect(instance.run(roleRequest())).rejects.toBeInstanceOf(ProviderOutputTruncatedError);
    expect(calls).toHaveLength(1);
  });

  it('T8 — no refusal on any path carries the credential, and the gate still precedes the transport', async () => {
    const { transport, calls } = scripted([ok()]);
    const { instance } = runner(transport);
    await expect(instance.run(roleRequest())).rejects.toThrow(/DATASTRATA_VERIFICATION_AGENTS/);
    expect(calls).toHaveLength(0);
  });
});

describe('per-attempt observability: every HTTP attempt leaves a record, before any error is thrown', () => {
  // `channel` is the one key the process channel added to an HTTP record;
  // `live-runner-channel.test.ts` holds the pre-change shapes as literals.
  const RECORD_KEYS = ['attempt', 'channel', 'delayMs', 'detail', 'index', 'outcome', 'possiblyBilled', 'requestId', 'role', 'runAttempt', 'sent', 'status', 'usage'];

  it('O1 — a completed attempt records role, attempt, status, request id, usage and outcome; usage is read from the envelope', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { instance, records } = runner(scripted([ok(undefined, 'end_turn', { input_tokens: 1234, output_tokens: 56, cache_read_input_tokens: 7 })]).transport);
    await instance.run(roleRequest());
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ role: 'reader', index: 0, attempt: 1, runAttempt: 1, sent: true, status: 200, requestId: 'req_ok', outcome: 'completed', possiblyBilled: false, delayMs: null });
    expect(records[0]!.usage).toEqual({ inputTokens: 1234, outputTokens: 56, cacheCreationInputTokens: null, cacheReadInputTokens: 7 });
    expect(Object.keys(records[0]!).sort()).toEqual(RECORD_KEYS);
    expect(instance.ledger).toMatchObject({ attemptsUsed: 1, knownInputTokens: 1234, knownOutputTokens: 56, unknownUsageAttempts: 0, possiblyBilledAttempts: 0 });
  });

  it('O2 — an envelope with no usage records usage as unknown, never as zero, and the attempt as possibly billed', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { instance, records } = runner(scripted([ok()]).transport);
    await instance.run(roleRequest());
    expect(records[0]!.usage).toBeNull();
    expect(records[0]!.outcome).toBe('completed');
    expect(records[0]!.possiblyBilled).toBe(true);
    expect(instance.ledger).toMatchObject({ knownInputTokens: 0, knownOutputTokens: 0, unknownUsageAttempts: 1, possiblyBilledAttempts: 1 });
  });

  it('O3 — a completed request whose projection is refused still leaves its record, with usage, the refusal named, and no credential anywhere in it', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const refused: ProviderHttpResponse = {
      status: 200,
      headers: { 'request-id': 'req_refusal' },
      body: JSON.stringify({ type: 'message', content: [{ type: 'text', text: '{}' }], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'x', explanation: `declined ${KEY}` }, usage: { input_tokens: 9, output_tokens: 2 } }),
    };
    const { instance, records } = runner(scripted([refused]).transport);
    await expect(instance.run(roleRequest())).rejects.toThrow(/refused/);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 200, requestId: 'req_refusal', outcome: 'projection_refused', possiblyBilled: false });
    expect(records[0]!.usage).toEqual({ inputTokens: 9, outputTokens: 2, cacheCreationInputTokens: null, cacheReadInputTokens: null });
    expect(records[0]!.detail).toContain('ProviderRefusalError');
    expect(JSON.stringify(records)).not.toContain(KEY);
  });

  it('O4 — a retried invocation records each attempt separately, with the delay the runner scheduled', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { instance, records } = runner(scripted([failure(429, 'rate_limit_error', { 'retry-after': '2' }), ok()]).transport);
    await instance.run(roleRequest());
    expect(records.map((r) => [r.attempt, r.runAttempt, r.status, r.outcome, r.delayMs, r.requestId])).toEqual([
      [1, 1, 429, 'retry_scheduled', 2000, 'req_429'],
      [2, 2, 200, 'completed', null, 'req_ok'],
    ]);
    expect(records[0]!.detail).toContain('rate_limit_error');
    expect(instance.attempts).toBe(2);
  });

  it('O5 — a timeout and an ambiguous transport failure are recorded as possibly billed, with no status, and the credential redacted', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const hung = runner(scripted(['hang']).transport, { timeoutMs: 20 });
    await expect(hung.instance.run(roleRequest())).rejects.toBeInstanceOf(ProviderTimeoutError);
    expect(hung.records[0]).toMatchObject({ sent: true, status: null, requestId: null, usage: null, outcome: 'timeout', possiblyBilled: true });
    const broken = runner(scripted([new TypeError(`socket ${KEY}`)]).transport);
    await expect(broken.instance.run(roleRequest())).rejects.toBeInstanceOf(ProviderAmbiguousFailureError);
    expect(broken.records[0]).toMatchObject({ sent: true, status: null, outcome: 'ambiguous', possiblyBilled: true });
    expect(broken.records[0]!.detail).toContain('[redacted]');
    expect(JSON.stringify(broken.records)).not.toContain(KEY);
    // A vouched pre-submission failure is the one transport failure that is not possibly billed.
    const early = runner(scripted([new TransportFailure('before_send', 'refused'), ok()]).transport);
    await early.instance.run(roleRequest());
    expect(early.records.map((r) => [r.outcome, r.possiblyBilled])).toEqual([['retry_scheduled', false], ['completed', true]]);
  });
});

describe('budget controls: admission before send, and a retry-inclusive attempt budget across the whole runner', () => {
  it('B1 — a request body larger than the admitted input size is refused before the transport is called, and recorded as not sent', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([ok()]);
    const { instance, records } = runner(transport, { budget: { maxRunAttempts: 5, maxInputBytesPerAttempt: 10 } });
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InputAdmissionError);
    expect((error as Error).message).toMatch(/reader\[0\].*bytes.*admitted/);
    expect(calls).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ sent: false, outcome: 'not_sent', status: null, usage: null, possiblyBilled: false });
    expect(instance.ledger).toMatchObject({ attemptsUsed: 0, maxInputBytesPerAttempt: 10 });
    // Positive control: the same body is admitted under a larger limit.
    const admitted = runner(scripted([ok()]).transport, { budget: { maxRunAttempts: 5, maxInputBytesPerAttempt: 1_000_000 } });
    await expect(admitted.instance.run(roleRequest())).resolves.toBeTruthy();
    expect(admitted.instance.ledger.largestInputBytes).toBeGreaterThan(10);
  });

  it('B2 — the attempt budget counts every HTTP attempt across invocations, and an exhausted budget refuses before sending', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([ok(), failure(500, 'api_error'), failure(500, 'api_error'), ok()]);
    const { instance, records } = runner(transport, { budget: { maxRunAttempts: 3, maxInputBytesPerAttempt: 1_000_000 } });
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    const error = await instance.run({ ...roleRequest(), role: 'prosecutor', index: 2, lens: 'missing_criterion' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AttemptBudgetExhaustedError);
    expect((error as Error).message).toMatch(/prosecutor\[2\].*3 of 3/);
    expect(calls).toHaveLength(3);
    expect(instance.ledger).toMatchObject({ maxRunAttempts: 3, attemptsUsed: 3, attemptsRemaining: 0 });
    expect(records.map((r) => [r.role, r.runAttempt, r.sent, r.outcome])).toEqual([
      ['reader', 1, true, 'completed'],
      ['prosecutor', 2, true, 'retry_scheduled'],
      ['prosecutor', 3, true, 'retry_scheduled'],
      ['prosecutor', 3, false, 'not_sent'],
    ]);
  });

  it('B3 — an ambiguous attempt consumes budget exactly like a completed one: it may have been billed', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([new TypeError('fetch failed'), ok(), ok()]);
    const { instance } = runner(transport, { budget: { maxRunAttempts: 2, maxInputBytesPerAttempt: 1_000_000 } });
    await expect(instance.run(roleRequest())).rejects.toBeInstanceOf(ProviderAmbiguousFailureError);
    expect(instance.ledger).toMatchObject({ attemptsUsed: 1, possiblyBilledAttempts: 1, unknownUsageAttempts: 1 });
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    await expect(instance.run(roleRequest())).rejects.toBeInstanceOf(AttemptBudgetExhaustedError);
    expect(calls).toHaveLength(2);
  });

  it('B4 — without a budget the runner admits any size and bounds attempts per invocation only', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { instance } = runner(scripted([ok(), ok(), ok(), ok()]).transport);
    for (let i = 0; i < 4; i += 1) await instance.run(roleRequest());
    expect(instance.ledger.maxRunAttempts).toBeNull();
    expect(instance.ledger.attemptsUsed).toBe(4);
  });
});

describe('budget values are validated as finite positive safe integers before anything is sent', () => {
  it('V1 — an explicitly supplied runner budget with an unsafe, infinite, fractional, zero or negative value is refused by name at construction; the safe-integer boundary is accepted', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const bad: Array<[string, number]> = [
      ['maxRunAttempts', 0], ['maxRunAttempts', -1], ['maxRunAttempts', 1.5], ['maxRunAttempts', Number.NaN], ['maxRunAttempts', Number.POSITIVE_INFINITY],
      ['maxRunAttempts', Number.MAX_SAFE_INTEGER + 1], ['maxRunAttempts', 1e20],
      ['maxInputBytesPerAttempt', 0], ['maxInputBytesPerAttempt', Number.POSITIVE_INFINITY], ['maxInputBytesPerAttempt', Number.MAX_SAFE_INTEGER + 2],
    ];
    for (const [field, value] of bad) {
      const { transport, calls } = scripted([ok()]);
      const budget = { maxRunAttempts: 3, maxInputBytesPerAttempt: 1_000_000, [field]: value };
      expect(() => runner(transport, { budget }), `${field}=${value}`).toThrow(InvalidBudgetError);
      expect(() => runner(transport, { budget }), `${field}=${value}`).toThrow(new RegExp(`${field}.*safe integer`));
      expect(calls, `${field}=${value}`).toHaveLength(0);
    }
    // Positive control: the largest safe integer is a valid budget, and an ordinary one runs.
    const boundary = runner(scripted([ok()]).transport, { budget: { maxRunAttempts: Number.MAX_SAFE_INTEGER, maxInputBytesPerAttempt: Number.MAX_SAFE_INTEGER } });
    await expect(boundary.instance.run(roleRequest())).resolves.toBeTruthy();
    expect(boundary.instance.ledger.maxRunAttempts).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('an observer that fails is not a projection that failed', () => {
  it('S1 — an observer throwing after a metered success is reported as an observation failure; usage is booked once, no second record is attempted, and the runner sends nothing further', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const seen: AttemptRecord[] = [];
    const { transport, calls } = scripted([ok(undefined, 'end_turn', { input_tokens: 100, output_tokens: 7 }), ok()]);
    const instance = new LiveAgentRunner({
      endpoint: ENDPOINT, apiKey: KEY, adapter: ANTHROPIC_MESSAGES_ADAPTER, transport, timeoutMs: 50, sleep: () => Promise.resolve(),
      observe: (record) => { seen.push(record); throw new Error(`disk full while writing ${KEY}`); },
    });
    const error = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ObservationFailedError);
    expect((error as Error).message).toMatch(/observer.*disk full/);
    expect((error as Error).message).not.toContain(KEY);
    expect((error as Error).name).not.toBe('ProviderRefusalError');
    // The one HTTP attempt was completed and metered exactly once.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ outcome: 'completed', status: 200 });
    expect(instance.ledger).toMatchObject({ attemptsUsed: 1, knownInputTokens: 100, knownOutputTokens: 7, unknownUsageAttempts: 0 });
    // Halted: the next invocation refuses before sending, with the same classification.
    const again = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(ObservationFailedError);
    expect(calls).toHaveLength(1);
    expect(instance.ledger.attemptsUsed).toBe(1);
  });

  it('S2 — positive control: a projection refusal with a working observer keeps its own classification and its single record', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { instance, records } = runner(scripted([ok('{}', 'max_tokens', { input_tokens: 5, output_tokens: 16000 })]).transport);
    await expect(instance.run(roleRequest())).rejects.toBeInstanceOf(ProviderOutputTruncatedError);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: 'projection_refused', possiblyBilled: false });
    expect(instance.ledger).toMatchObject({ attemptsUsed: 1, knownOutputTokens: 16000 });
  });
});

describe('an execution can be cancelled, and cancellation stops every further send', () => {
  it('X1 — a signal aborted in flight cancels the attempt: recorded as cancelled and possibly billed, refused by name, and no later invocation sends', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const controller = new AbortController();
    const { transport, calls } = scripted(['hang', ok()]);
    const { instance, records } = runner(transport, { timeoutMs: 10_000, signal: controller.signal });
    const pending = instance.run(roleRequest());
    setTimeout(() => controller.abort('test deadline'), 30);
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExecutionCancelledError);
    expect((error as Error).name).not.toBe('ProviderTimeoutError');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ sent: true, outcome: 'cancelled', possiblyBilled: true, status: null });
    const again = await instance.run(roleRequest()).catch((e: unknown) => e);
    expect(again).toBeInstanceOf(ExecutionCancelledError);
    expect(records[1]).toMatchObject({ sent: false, outcome: 'cancelled', possiblyBilled: false });
    expect(calls).toHaveLength(1);
  });

  it('X2 — a signal aborted during a scheduled wait ends the wait at once, through the production sleep, and the retry is never sent', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const controller = new AbortController();
    const { transport, calls } = scripted([failure(429, 'rate_limit_error', { 'retry-after': '30' }), ok()]);
    // No injected sleep: the runner's own abortable wait is what is under test.
    const { instance, records } = runner(transport, { sleep: undefined, signal: controller.signal });
    const started = Date.now();
    const pending = instance.run(roleRequest());
    setTimeout(() => controller.abort('test deadline'), 50);
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExecutionCancelledError);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(calls).toHaveLength(1);
    expect(records.map((r) => [r.sent, r.outcome, r.delayMs])).toEqual([[true, 'retry_scheduled', 30_000], [false, 'cancelled', null]]);
  });

  it('X3 — positive control: without a signal the same script completes through the production sleep after its short wait', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const { transport, calls } = scripted([failure(503, 'api_error', { 'retry-after': '1' }), ok()]);
    const { instance } = runner(transport, { sleep: undefined });
    const started = Date.now();
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
    expect(calls).toHaveLength(2);
  });
});

describe('a cancellation reason is untrusted text: redacted at the runner before any observer sees it', () => {
  const reason = `deadline of 200 ms reached for ${KEY}`;

  it('X4 — cancelled before the first send: the record carries the reason with the key redacted and the useful text kept', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const controller = new AbortController();
    controller.abort(reason);
    const { transport, calls } = scripted([ok()]);
    const { instance, records } = runner(transport, { signal: controller.signal });
    await expect(instance.run(roleRequest())).rejects.toBeInstanceOf(ExecutionCancelledError);
    expect(calls).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ sent: false, outcome: 'cancelled' });
    expect(records[0]!.detail).toContain('deadline of 200 ms');
    expect(records[0]!.detail).toContain('[redacted]');
    expect(JSON.stringify(records)).not.toContain(KEY);
  });

  it('X5 — cancelled in flight: the in-flight record carries the reason with the key redacted', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const controller = new AbortController();
    const { transport } = scripted(['hang']);
    const { instance, records } = runner(transport, { timeoutMs: 10_000, signal: controller.signal });
    const pending = instance.run(roleRequest());
    setTimeout(() => controller.abort(reason), 30);
    await expect(pending).rejects.toBeInstanceOf(ExecutionCancelledError);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ sent: true, outcome: 'cancelled' });
    expect(records[0]!.detail).toContain('deadline of 200 ms');
    expect(records[0]!.detail).toContain('[redacted]');
    expect(JSON.stringify(records)).not.toContain(KEY);
  });

  it('X6 — cancelled during a retry wait: the unsent record after the wait carries the reason with the key redacted', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const controller = new AbortController();
    const { transport, calls } = scripted([failure(429, 'rate_limit_error', { 'retry-after': '30' }), ok()]);
    const { instance, records } = runner(transport, { sleep: undefined, signal: controller.signal });
    const pending = instance.run(roleRequest());
    setTimeout(() => controller.abort(reason), 50);
    await expect(pending).rejects.toBeInstanceOf(ExecutionCancelledError);
    expect(calls).toHaveLength(1);
    expect(records.map((r) => r.outcome)).toEqual(['retry_scheduled', 'cancelled']);
    expect(records[1]!.detail).toContain('deadline of 200 ms');
    expect(records[1]!.detail).toContain('[redacted]');
    expect(JSON.stringify(records)).not.toContain(KEY);
  });
});
