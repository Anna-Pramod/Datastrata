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
  fetchTransport,
  LiveAgentRunner,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  MAX_RETRY_AFTER_MS,
  ProviderAmbiguousFailureError,
  ProviderHttpError,
  ProviderTimeoutError,
  RETRYABLE_STATUSES,
  TransportFailure,
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

const ok = (text = JSON.stringify(stubReaderOutput()), stop = 'end_turn'): ProviderHttpResponse => ({
  status: 200,
  headers: { 'request-id': 'req_ok' },
  body: JSON.stringify({ type: 'message', content: [{ type: 'text', text }], stop_reason: stop }),
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
  const instance = new LiveAgentRunner({
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
  return { instance, slept };
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
