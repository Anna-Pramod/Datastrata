/**
 * The free check's request lifecycle: a request's ending is applied only if nothing has superseded it since it was sent (Codex's
 * review of Task 6, finding 3; DP1 plan, Task 6).
 *
 * **Why this file exists.** A visitor can act while a check is in flight: run another check, change an answer, go back, follow a
 * step, try again. The flow used to apply whatever arrived, so a late answer to answers the visitor had left replaced the check
 * they were on, and an older request's end cleared the loading state of a newer one. None of that can be seen without delayed
 * responses, so the lifecycle is driven here through `checkRequests` with its `fetch` and timers handed in: every response is a
 * deferred promise the test settles when it chooses, and the clock moves only when the test moves it. No DOM is involved.
 *
 * Every "nothing is applied" is paired, in the same test, with a case where the same harness does apply something, so a module
 * that never applied anything would fail here too (failure mode 7). The flow's wiring to this module is held by
 * `check-flow-wiring.test.ts`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckerAnswers } from '@/lib/check-answers';
import { checkRequests, type CheckRequestEnvironment, type CheckSettlement } from '@/lib/check-request';
import { CHECK_TIMEOUT_MS, requestBody } from '@/lib/check-view';

// ---------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface SentRequest {
  url: string;
  init: RequestInit;
  response: Deferred<Response>;
}

/**
 * A fetch that records each call with its own deferred response. With `honoursAbort` it rejects the response with an
 * `AbortError` when the request's signal aborts, as a browser's does; without it the response arrives whenever the test says,
 * which is how a late answer reaches a page that has moved on.
 */
function fakeFetch(honoursAbort: boolean): { fetch: CheckRequestEnvironment['fetch']; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const fetch = (url: string, init: RequestInit): Promise<Response> => {
    const response = deferred<Response>();
    if (honoursAbort) init.signal?.addEventListener('abort', () => response.reject(new DOMException('The operation was aborted.', 'AbortError')));
    sent.push({ url, init, response });
    return response.promise;
  };
  return { fetch, sent };
}

/** A clock that moves only when `advance` is called. `pending` lists the delays of the timers still set. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; ms: number; callback: () => void }>();
  return {
    setTimeout: (callback: () => void, ms: number): unknown => {
      const id = next++;
      timers.set(id, { at: now + ms, ms, callback });
      return id;
    },
    clearTimeout: (handle: unknown): void => {
      timers.delete(handle as number);
    },
    advance(ms: number): void {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    pending: (): number[] => [...timers.values()].map((timer) => timer.ms),
  };
}

/** Lets every pending promise reaction, and the response body's read, run. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function harness({ honoursAbort = false }: { honoursAbort?: boolean } = {}) {
  const clock = fakeClock();
  const network = fakeFetch(honoursAbort);
  /** Every value `running` was set to, in order: the module owns the flag and reports each change. */
  const running: boolean[] = [];
  const applied: CheckSettlement[] = [];
  const requests = checkRequests((value) => running.push(value), { fetch: network.fetch, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  const apply = (settlement: CheckSettlement): void => {
    applied.push(settlement);
  };
  return { clock, network, running, applied, requests, apply };
}

/** A 200 carrying a timeline (anything with `routes`), told apart by `marker`. */
const timeline = (marker: string): Response => new Response(JSON.stringify({ routes: [], marker }), { status: 200, headers: { 'content-type': 'application/json' } });

const ANSWERS = { country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'no' } as CheckerAnswers;
/** The same company with its headcount changed: the answer a visitor edits while the first check is in flight. */
const CHANGED = { ...ANSWERS, employees: '450_or_fewer', turnover: 'up_to_400m' } as CheckerAnswers;
/** "Another country", typed lower-case: what the flow posts goes through `requestBody`, which sends it upper-case. */
const OTHER = { country: 'other', countryOther: 'ar', group: 'none', euTurnover: 'both' } as CheckerAnswers;

const result = (marker: string, answers: CheckerAnswers): CheckSettlement => ({ kind: 'result', timeline: { routes: [], marker } as never, answers: requestBody(answers) });
const failure = (state: string, answers: CheckerAnswers): CheckSettlement => ({ kind: 'error', state, answers: requestBody(answers) }) as CheckSettlement;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// The positive controls: the current request's ending is applied
// ---------------------------------------------------------------------------

describe('the current request', () => {
  it('is sent as before, and its success is applied once, with the timeline and the answers it posted, and running ends', async () => {
    const { network, clock, running, applied, requests, apply } = harness();
    requests.start(OTHER, apply);

    // The same request the flow always sent: one POST of the shown answers, "Another country" upper-case, timed at 15 seconds.
    expect(network.sent).toHaveLength(1);
    const [{ url, init }] = network.sent as [SentRequest];
    expect([url, init.method, init.headers, init.body]).toEqual(['/api/check', 'POST', { 'content-type': 'application/json' }, JSON.stringify(requestBody(OTHER))]);
    expect(JSON.parse(String(init.body))).toMatchObject({ countryOther: 'AR' });
    expect(init.signal?.aborted).toBe(false);
    expect(clock.pending()).toEqual([CHECK_TIMEOUT_MS]);
    expect(running).toEqual([true]);
    expect(applied).toEqual([]);

    network.sent[0]!.response.resolve(timeline('A'));
    await settle();
    expect(applied).toEqual([result('A', OTHER)]);
    expect(running).toEqual([true, false]);
    expect(clock.pending()).toEqual([]);
  });

  it('is reported as a timeout when it times out, once, and its fetch is aborted; the abort that follows is not also a network failure', async () => {
    const { network, clock, running, applied, requests, apply } = harness({ honoursAbort: true });
    requests.start(ANSWERS, apply);

    clock.advance(CHECK_TIMEOUT_MS - 1);
    await settle();
    expect(applied).toEqual([]);
    expect(running).toEqual([true]);

    clock.advance(1);
    await settle();
    expect(applied).toEqual([failure('timeout', ANSWERS)]);
    expect(network.sent[0]!.init.signal?.aborted).toBe(true);
    expect(running).toEqual([true, false]);
  });

  it('reports each other ending in its own error state, as the flow did: a status, a 200 that is not a timeline, a body that is not JSON, a failed fetch', async () => {
    const cases: [string, (sent: SentRequest) => void, string][] = [
      ['503', (sent) => sent.response.resolve(new Response('{"error":"x"}', { status: 503 })), 'refused'],
      ['500', (sent) => sent.response.resolve(new Response('{"error":"x"}', { status: 500 })), 'server_error'],
      ['429', (sent) => sent.response.resolve(new Response('', { status: 429 })), 'rate_limited'],
      ['200 without routes', (sent) => sent.response.resolve(new Response('{"error":"x"}', { status: 200 })), 'server_error'],
      ['200 not JSON', (sent) => sent.response.resolve(new Response('<html>', { status: 200 })), 'network'],
      ['a rejected fetch', (sent) => sent.response.reject(new TypeError('Failed to fetch')), 'network'],
    ];
    for (const [name, end, state] of cases) {
      const { network, applied, running, requests, apply } = harness();
      requests.start(ANSWERS, apply);
      end(network.sent[0]!);
      await settle();
      expect([name, applied, running]).toEqual([name, [failure(state, ANSWERS)], [true, false]]);
    }
  });
});

// ---------------------------------------------------------------------------
// A superseded request changes nothing
// ---------------------------------------------------------------------------

describe('a superseded request', () => {
  it('restart while in flight: the response that then arrives changes nothing, and the next request is applied', async () => {
    const { network, clock, running, applied, requests, apply } = harness();
    requests.start(ANSWERS, apply);
    requests.supersede();
    expect(running).toEqual([true, false]);
    expect(clock.pending()).toEqual([]);

    network.sent[0]!.response.resolve(timeline('A'));
    await settle();
    clock.advance(CHECK_TIMEOUT_MS);
    await settle();
    expect(applied).toEqual([]);
    expect(running).toEqual([true, false]);

    // The control, on the same harness: a request nothing supersedes is applied.
    requests.start(ANSWERS, apply);
    network.sent[1]!.response.resolve(timeline('B'));
    await settle();
    expect(applied).toEqual([result('B', ANSWERS)]);
    expect(running).toEqual([true, false, true, false]);
  });

  it('an answer changed while in flight: the response to the old answers changes nothing, and the changed answers are what is posted next', async () => {
    const { network, running, applied, requests, apply } = harness();
    requests.start(ANSWERS, apply);
    requests.supersede(); // the visitor changes C-4
    network.sent[0]!.response.resolve(timeline('old answers'));
    await settle();
    expect(applied).toEqual([]);
    expect(running).toEqual([true, false]);

    requests.start(CHANGED, apply);
    expect(network.sent[1]!.init.body).toBe(JSON.stringify(requestBody(CHANGED)));
    network.sent[1]!.response.resolve(timeline('changed answers'));
    await settle();
    expect(applied).toEqual([result('changed answers', CHANGED)]);
  });

  it('"Try again" (B) after A failed: A, settling late, changes nothing; B is applied; running stays true until B settles', async () => {
    const { network, clock, running, applied, requests, apply } = harness();
    requests.start(ANSWERS, apply);
    clock.advance(CHECK_TIMEOUT_MS); // A times out: the visitor sees the timeout and presses "Try again"
    await settle();
    expect(applied).toEqual([failure('timeout', ANSWERS)]);

    requests.start(ANSWERS, apply);
    expect(running).toEqual([true, false, true]);
    network.sent[0]!.response.resolve(timeline('A, late')); // A's response arrives after all
    await settle();
    expect(applied).toEqual([failure('timeout', ANSWERS)]);
    expect(running.at(-1)).toBe(true);
    expect(running).toEqual([true, false, true]);

    network.sent[1]!.response.resolve(timeline('B'));
    await settle();
    expect(applied).toEqual([failure('timeout', ANSWERS), result('B', ANSWERS)]);
    expect(running).toEqual([true, false, true, false]);
  });

  it('a newer submission while A is still in flight: A is aborted and changes nothing, even when it fails late; running stays true until B settles', async () => {
    const { network, running, applied, requests, apply } = harness();
    requests.start(ANSWERS, apply);
    requests.start(CHANGED, apply);
    expect(running).toEqual([true, true]);
    network.sent[0]!.response.resolve(new Response('', { status: 503 }));
    await settle();
    expect(applied).toEqual([]);
    expect(running.at(-1)).toBe(true);

    network.sent[1]!.response.resolve(timeline('B'));
    await settle();
    expect(applied).toEqual([result('B', CHANGED)]);
    expect(running).toEqual([true, true, false]);
  });

  it('superseded after its response arrived but before its body was read: the body that then arrives changes nothing, by a restart and by a newer submission alike', async () => {
    /** A 200 whose body is still being read: `json()` settles only when the test resolves `body`, whatever the signal does. */
    const reading = () => {
      const body = deferred<unknown>();
      return { body, response: { ok: true, status: 200, json: () => body.promise } as unknown as Response };
    };

    // The control: the same sequence with nothing superseding it is applied.
    {
      const { network, running, applied, requests, apply } = harness();
      requests.start(ANSWERS, apply);
      const read = reading();
      network.sent[0]!.response.resolve(read.response);
      await settle(); // the response has arrived; its body is being read
      read.body.resolve({ routes: [], marker: 'read' });
      await settle();
      expect(applied).toEqual([result('read', ANSWERS)]);
      expect(running).toEqual([true, false]);
    }

    // A restart while the body is being read.
    {
      const { network, running, applied, requests, apply } = harness();
      requests.start(ANSWERS, apply);
      const read = reading();
      network.sent[0]!.response.resolve(read.response);
      await settle();
      requests.supersede();
      expect(network.sent[0]!.init.signal?.aborted).toBe(true);
      read.body.resolve({ routes: [], marker: 'late body' });
      await settle();
      expect(applied).toEqual([]);
      // `running` went false at the restart, and the late body did not set it again.
      expect(running).toEqual([true, false]);
    }

    // A newer submission while the body is being read: the late body neither lands nor clears the newer request's `running`.
    {
      const { network, running, applied, requests, apply } = harness();
      requests.start(ANSWERS, apply);
      const read = reading();
      network.sent[0]!.response.resolve(read.response);
      await settle();
      requests.start(CHANGED, apply);
      read.body.resolve({ routes: [], marker: 'late body' });
      await settle();
      expect(applied).toEqual([]);
      expect(running).toEqual([true, true]);
      network.sent[1]!.response.resolve(timeline('B'));
      await settle();
      expect(applied).toEqual([result('B', CHANGED)]);
      expect(running).toEqual([true, true, false]);
    }
  });

  it('is aborted, and its abort is reported as neither a timeout nor a network failure; a rejection of the current request is', async () => {
    const { network, clock, running, applied, requests, apply } = harness({ honoursAbort: true });
    requests.start(ANSWERS, apply);
    requests.supersede();
    await settle(); // the fetch has rejected with its AbortError by now
    clock.advance(CHECK_TIMEOUT_MS);
    await settle();
    expect(applied).toEqual([]);
    expect(running).toEqual([true, false]);

    // The control: the same rejection path, on a request nothing superseded, is reported.
    requests.start(ANSWERS, apply);
    network.sent[1]!.response.reject(new TypeError('Failed to fetch'));
    await settle();
    expect(applied).toEqual([failure('network', ANSWERS)]);
  });

  it('has its fetch signal aborted, by a restart and by a newer submission alike; the current request’s signal is not', () => {
    const { network, requests, apply } = harness();
    requests.start(ANSWERS, apply);
    requests.start(CHANGED, apply);
    expect(network.sent.map((sent) => sent.init.signal?.aborted)).toEqual([true, false]);
    requests.supersede();
    expect(network.sent.map((sent) => sent.init.signal?.aborted)).toEqual([true, true]);
  });

  it('superseding with nothing in flight changes nothing: no running change, no abort', async () => {
    const { network, running, applied, requests, apply } = harness();
    requests.supersede();
    expect(running).toEqual([]);
    requests.start(ANSWERS, apply);
    network.sent[0]!.response.resolve(timeline('A'));
    await settle();
    // After the ending is applied, the flow's own navigation to the result supersedes nothing that is in flight.
    requests.supersede();
    expect(running).toEqual([true, false]);
    expect(applied).toEqual([result('A', ANSWERS)]);
  });
});

// ---------------------------------------------------------------------------
// The environment the flow uses
// ---------------------------------------------------------------------------

describe('the default environment', () => {
  it('is the page’s own fetch and timers: a request through it is sent with the global fetch and times out on the global clock', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const network = fakeFetch(true);
    const fetchSpy = vi.fn(network.fetch);
    vi.stubGlobal('fetch', fetchSpy);
    const running: boolean[] = [];
    const applied: CheckSettlement[] = [];
    const requests = checkRequests((value) => running.push(value));

    requests.start(ANSWERS, (settlement) => applied.push(settlement));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/check');
    vi.advanceTimersByTime(CHECK_TIMEOUT_MS);
    await settle();
    expect(applied).toEqual([failure('timeout', ANSWERS)]);
    expect(running).toEqual([true, false]);
  });
});
