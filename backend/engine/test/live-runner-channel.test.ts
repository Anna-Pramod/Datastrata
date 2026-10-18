/**
 * The runner's two channels: the HTTP channel unchanged to the byte, and the
 * process channel accounted for by what a child did rather than by what a
 * wire said (B-CLI-ADAPTER Task 1).
 *
 * The first half is a regression golden. Every HTTP record and ledger shape
 * below was captured from the runner at `1104e8f`, before the channel
 * existed, by running these same scripts; a helper strips the fields the
 * channel added and the remainder must equal the capture exactly. The
 * literals are deliberately not derived from the runner under test — a golden
 * that the code regenerates is a golden that agrees with every defect.
 *
 * The second half drives a fake process transport through the four paths
 * the plan names: a child that answered, a launch that never started, a
 * child terminated by the caller's signal, and a transport that could not
 * observe its own evidence. `possiblyBilled` follows `launched` on every one,
 * because the CLI's usage report is not what decides whether a started child
 * reached the provider. The network trap stands for every case: a process
 * channel that quietly fell back to `fetch` would fire it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EvidenceObservationFailedError,
  ExecutionCancelledError,
  LiveAgentRunner,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  ProcessTransportError,
  ProviderTimeoutError,
  TransportFailure,
  type AttemptRecord,
  type BudgetLedger,
  type ProcessFacts,
  type ProviderHttpResponse,
  type ProviderTransport,
} from '../src/pipeline/live-runner';
import { ANTHROPIC_MESSAGES_ADAPTER } from '../src/pipeline/anthropic-messages';
import type { ProviderAdapter, ProviderUsage } from '../src/pipeline/provider-adapter';
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

/** A transport that answers from a script; on abort it rejects with whatever `onAbort` makes. */
function scripted(answers: Array<ProviderHttpResponse | Error | 'hang'>, onAbort: () => Error = () => Object.assign(new Error('aborted'), { name: 'AbortError' })) {
  const calls: string[] = [];
  const transport: ProviderTransport = (request, signal) => {
    calls.push(request.url);
    const next = answers.shift();
    if (next === undefined) throw new Error('script exhausted');
    if (next === 'hang') {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(onAbort()));
      });
    }
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  return { transport, calls };
}

type Options = ConstructorParameters<typeof LiveAgentRunner>[0];

function runner(transport: ProviderTransport, over: Partial<Options> = {}) {
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
    sleep: () => Promise.resolve(),
    ...over,
  });
  return { instance, records };
}

const settle = (pending: Promise<unknown>): Promise<string | null> => pending.then(() => null, (e: unknown) => (e as Error).name);

let trap: ReturnType<typeof installNetworkTrap>;
beforeEach(() => {
  trap = installNetworkTrap();
  process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
});
afterEach(() => {
  delete process.env[LIVE_AGENTS_ENV];
  trap.restore();
});

// ---------------------------------------------------------------------------
// HTTP channel: the pre-change shapes, verbatim
// ---------------------------------------------------------------------------

/** What the channel added to a record. Stripped before comparing with the capture. */
const RECORD_CHANNEL_KEYS = ['channel', 'launched', 'process', 'usageSource'] as const;
/** What the channel added to the ledger. */
const LEDGER_CHANNEL_KEYS = ['attemptUnit', 'httpAttemptsObserved', 'launchesStarted'] as const;

function stripRecord(record: AttemptRecord): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  for (const key of RECORD_CHANNEL_KEYS) delete copy[key];
  return copy;
}
function stripLedger(ledger: BudgetLedger): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...ledger };
  for (const key of LEDGER_CHANNEL_KEYS) delete copy[key];
  return copy;
}

/**
 * The UTF-8 length of the Messages adapter's request for `roleRequest()`: 2384
 * at `1104e8f`, plus the 108 bytes the reader's structured-output schema grew
 * by on 2026-10-18 when `sha256Normalized` gained its 64-hex `pattern`
 * (`corpus/evidence.ts`; the reader schema went from 2,168 to 2,276 bytes).
 * The body embeds that schema, so this is the one capture literal the schema
 * moves; every other record and ledger field is as captured.
 */
const BODY_BYTES = 2384 + 108;

const http = (over: Partial<AttemptRecord> = {}): Record<string, unknown> => ({
  role: 'reader', index: 0, attempt: 1, runAttempt: 1, sent: true, status: 200, requestId: 'req_ok', usage: null, outcome: 'completed', detail: null, possiblyBilled: true, delayMs: null, ...over,
});
const ledgerAt = (over: Partial<BudgetLedger> = {}): Record<string, unknown> => ({
  maxRunAttempts: null, attemptsUsed: 1, attemptsRemaining: null, maxInputBytesPerAttempt: null, largestInputBytes: BODY_BYTES, knownInputTokens: 0, knownOutputTokens: 0, unknownUsageAttempts: 1, possiblyBilledAttempts: 1, ...over,
});

interface HttpCase {
  run: () => Promise<{ instance: LiveAgentRunner; records: AttemptRecord[] }>;
  error: string | null;
  records: Array<Record<string, unknown>>;
  ledger: Record<string, unknown>;
}

const run = async (r: ReturnType<typeof runner>, ...requests: RoleRequest[]) => {
  let error: string | null = null;
  for (const request of requests) error = await settle(r.instance.run(request));
  return { ...r, error };
};

/**
 * Captured at `1104e8f` by running these scripts against the pre-change
 * runner and printing every record and ledger. Nothing here was produced by
 * the runner under test.
 */
const HTTP_CASES: Record<string, HttpCase> = {
  completed_with_usage: {
    run: () => run(runner(scripted([ok(undefined, 'end_turn', { input_tokens: 1234, output_tokens: 56, cache_read_input_tokens: 7 })]).transport), roleRequest()),
    error: null,
    records: [http({ usage: { inputTokens: 1234, outputTokens: 56, cacheCreationInputTokens: null, cacheReadInputTokens: 7 }, possiblyBilled: false })],
    ledger: ledgerAt({ knownInputTokens: 1234, knownOutputTokens: 56, unknownUsageAttempts: 0, possiblyBilledAttempts: 0 }),
  },
  completed_no_usage: {
    run: () => run(runner(scripted([ok()]).transport), roleRequest()),
    error: null,
    records: [http()],
    ledger: ledgerAt(),
  },
  retry_429_then_ok: {
    run: () => run(runner(scripted([failure(429, 'rate_limit_error', { 'retry-after': '2' }), ok()]).transport), roleRequest()),
    error: null,
    records: [http({ status: 429, requestId: 'req_429', outcome: 'retry_scheduled', detail: 'rate_limit_error', delayMs: 2000 }), http({ attempt: 2, runAttempt: 2 })],
    ledger: ledgerAt({ attemptsUsed: 2, unknownUsageAttempts: 2, possiblyBilledAttempts: 2 }),
  },
  before_send_then_ok: {
    run: () => run(runner(scripted([new TransportFailure('before_send', 'connection refused'), ok()]).transport), roleRequest()),
    error: null,
    records: [http({ status: null, requestId: null, outcome: 'retry_scheduled', detail: 'TransportFailure: connection refused', possiblyBilled: false, delayMs: 1000 }), http({ attempt: 2, runAttempt: 2 })],
    ledger: ledgerAt({ attemptsUsed: 2, unknownUsageAttempts: 2, possiblyBilledAttempts: 1 }),
  },
  before_send_exhausted: {
    run: () => run(runner(scripted([new TransportFailure('before_send', 'a'), new TransportFailure('before_send', 'b')]).transport, { maxAttempts: 2 }), roleRequest()),
    error: 'ProviderHttpError',
    records: [
      http({ status: null, requestId: null, outcome: 'retry_scheduled', detail: 'TransportFailure: a', possiblyBilled: false, delayMs: 1000 }),
      http({ attempt: 2, runAttempt: 2, status: null, requestId: null, outcome: 'refused', detail: 'TransportFailure: b', possiblyBilled: false }),
    ],
    ledger: ledgerAt({ attemptsUsed: 2, unknownUsageAttempts: 2, possiblyBilledAttempts: 0 }),
  },
  timeout: {
    run: () => run(runner(scripted(['hang']).transport, { timeoutMs: 20 }), roleRequest()),
    error: 'ProviderTimeoutError',
    records: [http({ status: null, requestId: null, outcome: 'timeout', detail: 'aborted after 20 ms' })],
    ledger: ledgerAt(),
  },
  ambiguous: {
    run: () => run(runner(scripted([new TypeError('fetch failed')]).transport), roleRequest()),
    error: 'ProviderAmbiguousFailureError',
    records: [http({ status: null, requestId: null, outcome: 'ambiguous', detail: 'TypeError: fetch failed' })],
    ledger: ledgerAt(),
  },
  projection_refused: {
    run: () => run(runner(scripted([ok('{"elements": [', 'max_tokens', { input_tokens: 5, output_tokens: 16000 })]).transport), roleRequest()),
    error: 'ProviderOutputTruncatedError',
    records: [
      http({
        usage: { inputTokens: 5, outputTokens: 16000, cacheCreationInputTokens: null, cacheReadInputTokens: null },
        outcome: 'projection_refused',
        detail: "ProviderOutputTruncatedError: reader[0]: the model's output stopped at max_tokens (16000); the partial content is not published as a role result",
        possiblyBilled: false,
      }),
    ],
    ledger: ledgerAt({ knownInputTokens: 5, knownOutputTokens: 16000, unknownUsageAttempts: 0, possiblyBilledAttempts: 0 }),
  },
  client_error_refused: {
    run: () => run(runner(scripted([failure(400, 'invalid_request_error')]).transport), roleRequest()),
    error: 'ProviderHttpError',
    records: [http({ status: 400, requestId: 'req_400', outcome: 'refused', detail: 'invalid_request_error' })],
    ledger: ledgerAt(),
  },
  not_sent_admission: {
    run: () => run(runner(scripted([ok()]).transport, { budget: { maxRunAttempts: 5, maxInputBytesPerAttempt: 10 } }), roleRequest()),
    error: 'InputAdmissionError',
    records: [http({ runAttempt: 0, sent: false, status: null, requestId: null, outcome: 'not_sent', detail: `request body ${BODY_BYTES} bytes exceeds the admitted 10`, possiblyBilled: false })],
    ledger: ledgerAt({ maxRunAttempts: 5, attemptsUsed: 0, attemptsRemaining: 5, maxInputBytesPerAttempt: 10, largestInputBytes: 0, unknownUsageAttempts: 0, possiblyBilledAttempts: 0 }),
  },
  not_sent_budget_exhausted: {
    run: () => run(runner(scripted([ok(), ok()]).transport, { budget: { maxRunAttempts: 1, maxInputBytesPerAttempt: 1_000_000 } }), roleRequest(), roleRequest()),
    error: 'AttemptBudgetExhaustedError',
    records: [http(), http({ sent: false, status: null, requestId: null, outcome: 'not_sent', detail: 'attempt budget exhausted: 1 of 1 used', possiblyBilled: false })],
    ledger: ledgerAt({ maxRunAttempts: 1, attemptsRemaining: 0, maxInputBytesPerAttempt: 1_000_000 }),
  },
  cancelled_before_send: {
    run: () => {
      const controller = new AbortController();
      controller.abort('test deadline');
      return run(runner(scripted([ok()]).transport, { signal: controller.signal }), roleRequest());
    },
    error: 'ExecutionCancelledError',
    records: [http({ runAttempt: 0, sent: false, status: null, requestId: null, outcome: 'cancelled', detail: 'cancelled before send (test deadline)', possiblyBilled: false })],
    ledger: ledgerAt({ attemptsUsed: 0, largestInputBytes: 0, unknownUsageAttempts: 0, possiblyBilledAttempts: 0 }),
  },
  cancelled_in_flight: {
    run: async () => {
      const controller = new AbortController();
      const r = runner(scripted(['hang']).transport, { timeoutMs: 10_000, signal: controller.signal });
      const pending = r.instance.run(roleRequest());
      setTimeout(() => controller.abort('test deadline'), 20);
      return { ...r, error: await settle(pending) };
    },
    error: 'ExecutionCancelledError',
    records: [http({ status: null, requestId: null, outcome: 'cancelled', detail: 'cancelled in flight (test deadline)' })],
    ledger: ledgerAt(),
  },
};

describe('HTTP channel regression: every pre-change record and ledger shape survives, with only the channel stamped', () => {
  for (const [name, expected] of Object.entries(HTTP_CASES)) {
    it(`H — ${name}: records and ledger equal the 1104e8f capture once the channel fields are stripped; channel is http on every record; no launch field appears`, async () => {
      const { instance, records, error } = await (expected.run() as Promise<{ instance: LiveAgentRunner; records: AttemptRecord[]; error: string | null }>);
      expect(error).toBe(expected.error);
      expect(records.map(stripRecord)).toEqual(expected.records);
      expect(stripLedger(instance.ledger)).toEqual(expected.ledger);
      for (const record of records) {
        expect(record.channel).toBe('http');
        // Absent, not `false` or `undefined`-valued: an HTTP record is identical to before plus `channel`.
        for (const key of ['launched', 'process', 'usageSource']) expect(Object.hasOwn(record, key), `${name}: ${key}`).toBe(false);
      }
      expect(instance.ledger).toMatchObject({ attemptUnit: 'http_attempt', httpAttemptsObserved: instance.ledger.attemptsUsed, launchesStarted: 0 });
      expect(trap.calls).toEqual([]);
    });
  }

  it('H0 — the capture is not empty and covers every outcome the HTTP channel can record', () => {
    const outcomes = new Set(Object.values(HTTP_CASES).flatMap((c) => c.records.map((r) => r['outcome'])));
    expect([...outcomes].sort()).toEqual(['ambiguous', 'cancelled', 'completed', 'not_sent', 'projection_refused', 'refused', 'retry_scheduled', 'timeout']);
  });
});

// ---------------------------------------------------------------------------
// Process channel
// ---------------------------------------------------------------------------

/**
 * A process-channel adapter whose envelope is a plain `{output, usage}`
 * object. What matters here is `channel`, not the CLI's stream format, which
 * is Task 2's adapter and its own tests.
 */
const PROCESS_ADAPTER: ProviderAdapter = {
  identity: { id: 'fake-process', version: '1' },
  channel: 'process',
  buildRequest: (request) => ({ url: 'fake-process:pinned', method: 'SPAWN', headers: {}, body: JSON.stringify(request.messages) }),
  projectResponse: (body) => (JSON.parse(body) as { output: string }).output,
  readUsage: (body) => (JSON.parse(body) as { usage?: ProviderUsage | null }).usage ?? null,
};

const facts = (over: Partial<ProcessFacts> = {}): ProcessFacts => ({
  started: true,
  pid: 4242,
  exitCode: 0,
  signal: null,
  durationMs: 12,
  stdoutBytes: 100,
  stderrBytes: 0,
  promptFileBytes: 42,
  stdinBytes: 5,
  promptFileRemoved: true,
  promptFileRemovalError: null,
  termination: null,
  ...over,
});
const neverStarted = (): ProcessFacts =>
  facts({ started: false, pid: null, exitCode: null, durationMs: 0, stdoutBytes: 0, stderrBytes: 0, promptFileBytes: null, stdinBytes: null, promptFileRemoved: null });
const terminated = (): ProcessFacts =>
  facts({ exitCode: null, signal: 'SIGTERM', termination: { forced: true, processGroupMade: true, signalsSent: ['SIGTERM'], childReaped: true, groupGone: true } });

const USAGE: ProviderUsage = { inputTokens: 10, outputTokens: 3, cacheCreationInputTokens: null, cacheReadInputTokens: null };
const answered = (process: ProcessFacts, usage: ProviderUsage | null = USAGE): ProviderHttpResponse => ({
  // The status a process transport returns is a placeholder; the runner must never record it.
  status: 0,
  headers: {},
  body: JSON.stringify({ output: JSON.stringify(stubReaderOutput()), usage }),
  process,
});

/** No credential on the subscription route: the adapter is process, the key is empty. */
const processRunner = (transport: ProviderTransport, over: Partial<Options> = {}) => runner(transport, { adapter: PROCESS_ADAPTER, apiKey: '', endpoint: '', ...over });

const base = { role: 'reader', index: 0, attempt: 1, runAttempt: 1, channel: 'process', sent: true, status: null, requestId: null, usage: null, detail: null, delayMs: null } as const;

describe('process channel: accounted for by what the child did', () => {
  it('P-a — a child that answered: status null, launched, possibly billed regardless of usage, usage tagged as the CLI\'s report, and no HTTP rule applied to the placeholder status', async () => {
    const launched = facts();
    const { transport, calls } = scripted([answered(launched)]);
    const { instance, records } = processRunner(transport);
    const response = await instance.run(roleRequest());
    expect(JSON.parse(response.outputJson)).toEqual(stubReaderOutput());
    expect(calls).toEqual(['fake-process:pinned']);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({ ...base, outcome: 'completed', usage: USAGE, possiblyBilled: true, launched: true, process: launched, usageSource: 'cli_report' });
    expect(instance.ledger).toEqual({
      attemptUnit: 'cli_launch', maxRunAttempts: null, attemptsUsed: 1, attemptsRemaining: null, maxInputBytesPerAttempt: null, largestInputBytes: Buffer.byteLength(JSON.stringify(roleRequest().messages)),
      knownInputTokens: 10, knownOutputTokens: 3, unknownUsageAttempts: 0, possiblyBilledAttempts: 1, httpAttemptsObserved: null, launchesStarted: 1,
    });

    // Counterexample in the same suite: with no usage the record is possibly
    // billed for the same reason — the child started — and carries no source.
    const silent = processRunner(scripted([answered(launched, null)]).transport);
    await silent.instance.run(roleRequest());
    expect(silent.records[0]).toEqual({ ...base, outcome: 'completed', possiblyBilled: true, launched: true, process: launched });
    expect(Object.hasOwn(silent.records[0]!, 'usageSource')).toBe(false);
    expect(silent.instance.ledger).toMatchObject({ unknownUsageAttempts: 1, possiblyBilledAttempts: 1, launchesStarted: 1 });
    expect(trap.calls).toEqual([]);
  });

  it('P-b — a launch that never started, vouched pre-submission: not possibly billed, retried as before_send, facts retained; the retry that started is counted', async () => {
    const notStarted = neverStarted();
    const refused = Object.assign(new TransportFailure('before_send', 'executable pin mismatch'), { process: notStarted });
    const started = facts();
    const { transport, calls } = scripted([refused, answered(started)]);
    const { instance, records } = processRunner(transport);
    await expect(instance.run(roleRequest())).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ ...base, outcome: 'retry_scheduled', detail: 'TransportFailure: executable pin mismatch', possiblyBilled: false, delayMs: 1000, launched: false, process: notStarted });
    expect(records[1]).toEqual({ ...base, attempt: 2, runAttempt: 2, outcome: 'completed', usage: USAGE, possiblyBilled: true, launched: true, process: started, usageSource: 'cli_report' });
    // Two launches attempted, one child started: the two figures differ, and the ledger says so.
    expect(instance.ledger).toMatchObject({ attemptUnit: 'cli_launch', attemptsUsed: 2, launchesStarted: 1, possiblyBilledAttempts: 1, httpAttemptsObserved: null });
  });

  it('P-c — a child terminated by the caller\'s signal: cancelled, facts retained, possibly billed because it started; the channel is on the record refused before the next send too', async () => {
    const controller = new AbortController();
    const ended = terminated();
    const { transport, calls } = scripted(['hang', answered(facts())], () => new ProcessTransportError('terminated after abort', ended));
    const { instance, records } = processRunner(transport, { timeoutMs: 10_000, signal: controller.signal });
    const pending = instance.run(roleRequest());
    setTimeout(() => controller.abort('test deadline'), 30);
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExecutionCancelledError);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({ ...base, outcome: 'cancelled', detail: 'cancelled in flight (test deadline)', possiblyBilled: true, launched: true, process: ended });
    // Refused before the send: still this channel, and no launch to report.
    await expect(instance.run(roleRequest())).rejects.toBeInstanceOf(ExecutionCancelledError);
    expect(records).toHaveLength(2);
    expect(records[1]).toEqual({ ...base, runAttempt: 1, sent: false, outcome: 'cancelled', detail: 'cancelled before send (test deadline)', possiblyBilled: false });
    expect(Object.hasOwn(records[1]!, 'launched')).toBe(false);
    expect(calls).toHaveLength(1);
    expect(instance.ledger).toMatchObject({ attemptsUsed: 1, launchesStarted: 1, possiblyBilledAttempts: 1 });

    // Timeout keeps its classification too, from the runner's own reason, with the same facts.
    const slow = processRunner(scripted(['hang'], () => new ProcessTransportError('terminated after timeout', ended)).transport, { timeoutMs: 20 });
    await expect(slow.instance.run(roleRequest())).rejects.toBeInstanceOf(ProviderTimeoutError);
    expect(slow.records[0]).toEqual({ ...base, outcome: 'timeout', detail: 'aborted after 20 ms', possiblyBilled: true, launched: true, process: ended });

    // Counterexample: a child the transport says never started is cancelled but not possibly billed.
    const early = new AbortController();
    const unborn = processRunner(scripted(['hang'], () => new ProcessTransportError('aborted before spawn', neverStarted())).transport, { timeoutMs: 10_000, signal: early.signal });
    const waiting = unborn.instance.run(roleRequest());
    setTimeout(() => early.abort('test deadline'), 30);
    await expect(waiting).rejects.toBeInstanceOf(ExecutionCancelledError);
    expect(unborn.records[0]).toMatchObject({ outcome: 'cancelled', launched: false, possiblyBilled: false });
    expect(unborn.instance.ledger).toMatchObject({ attemptsUsed: 1, launchesStarted: 0, possiblyBilledAttempts: 0 });
  });

  it('P-d — a transport that could not observe its evidence: one record, outcome observation_failed, the same error instance rethrown, and the next run refused with it', async () => {
    const observed = facts();
    const failed = new EvidenceObservationFailedError('launches.jsonl: EACCES', observed);
    const { transport, calls } = scripted([failed, answered(facts())]);
    const { instance, records } = processRunner(transport);
    await expect(instance.run(roleRequest())).rejects.toBe(failed);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({ ...base, outcome: 'observation_failed', detail: 'EvidenceObservationFailedError: launches.jsonl: EACCES', possiblyBilled: true, launched: true, process: observed });
    // Halted: the same instance, no new record, nothing further launched.
    await expect(instance.run(roleRequest())).rejects.toBe(failed);
    expect(records).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(instance.ledger).toMatchObject({ attemptsUsed: 1, launchesStarted: 1, possiblyBilledAttempts: 1, unknownUsageAttempts: 1 });

    // Without facts the record still says what it can: sent, unobserved, and possibly billed by the HTTP rule.
    const bare = new EvidenceObservationFailedError('stream capture refused');
    const blind = processRunner(scripted([bare]).transport);
    await expect(blind.instance.run(roleRequest())).rejects.toBe(bare);
    expect(blind.records[0]).toEqual({ ...base, outcome: 'observation_failed', detail: 'EvidenceObservationFailedError: stream capture refused', possiblyBilled: true });
    expect(blind.instance.ledger).toMatchObject({ launchesStarted: 0, possiblyBilledAttempts: 1 });
  });
});
