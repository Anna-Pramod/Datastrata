/**
 * The structured log line, and `/api/check`'s one line per request (DP1 plan, Task 8; §1, "Logs carry no answers"; §4.3).
 *
 * **Why this file exists.** DataStrata keeps no checker answers, and a log line is the one place a route writes something that
 * outlives the request: the host keeps runtime logs (Task 9, record V4). So the line's whole content is fixed — `at`, `event`,
 * `route`, `status`, `ms` and `release`, nothing else — and these tests hold it there in both directions (failure mode 7):
 *
 * ```
 * the line exists      exactly one per request, on every path, a thrown error included, with its six keys and the right event
 * the line is empty    of every value and every answer key the visitor sent, on the 200 path and on each refusal
 * ```
 *
 * The plan's own request (a typed turnover of 123456789.01 and `countryOther` "XK") is refused 400 by the schema, because
 * `lib/countries.ts` holds no user-assigned code. It is kept, and two answered requests carry the same distinctive values the
 * schema accepts. They are two because no single request can carry both: a typed turnover is asked only of an EU company (C-5),
 * and "Another country" is never an EU one.
 *
 * Every channel a route could write to is captured by spies installed before each test and restored after it: standard output,
 * standard error and the five console methods. The scans for what was sent cover all of them, and no line from one test is seen by
 * the next. The route is driven directly with standard requests, as `public-api-body-limits.test.ts` drives it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { format } from 'node:util';
import type { Condition } from '@datastrata/engine';
import { buildCheckTimeline } from '@/lib/check-timeline';
import { checkerAnswersSchema } from '@/lib/check-answers';
import { csrdPack } from '@/lib/pack';
import { healthReport } from '@/lib/health';
import { LOG_EVENTS, logEvent, type LogEvent } from '@/lib/log';
import { POST } from '@/app/api/check/route';
import { buildFixtureRepository } from './fixture-repository';

const CHECK_URL = 'http://127.0.0.1:3000/api/check';
/** The instant the clock is held at; the check's assessment date follows from it. */
const NOW = new Date('2026-07-26T12:00:00.000Z');
const ASSESSMENT_DATE = '2026-07-26';
const SHA = 'fa1eade47b73733d6312d5abfad33ce9e4068081';
const KEYS = ['at', 'event', 'route', 'status', 'ms', 'release'];

/** The distinctive values: the plan's turnover, and a real non-EU country no other test uses. */
const TURNOVER = 123456789.01;
const COUNTRY = 'KZ';
/** Every key the answer schema accepts, read from the schema itself. */
const ANSWER_KEYS = Object.keys(checkerAnswersSchema.innerType().shape);

/** An EU company typing its turnover, every question it is shown answered: assessed, 200. */
const TYPED_TURNOVER = { country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: { exact: TURNOVER }, pie: 'no' };
/** A company in "another country", every question it is shown answered: assessed, 200. */
const OTHER_COUNTRY = { country: 'other', countryOther: COUNTRY, group: 'none', euTurnover: 'both' };
/** The plan's request: XK is not an assigned ISO code, so the schema refuses it, 400. */
const PLAN_XK = { country: 'other', countryOther: 'XK', group: 'none', turnover: { exact: TURNOVER } };
/** Both values in one request the schema accepts: the turnover answers a question this company is not shown, 400. */
const HIDDEN_TURNOVER = { ...OTHER_COUNTRY, turnover: { exact: TURNOVER } };

/** A German company with no group, every question answered, as the other check tests use. */
const ANSWERS = { country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'no' };

function post(body: string): Request {
  return new Request(CHECK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
}

/** Runs `fn` as a process whose working directory is `dir`, and puts it back (as `public-resolver-seam.test.ts`). */
async function inRepository<T>(dir: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

/**
 * Everything written during one test, by channel: standard output and standard error, and the five console methods. Vitest gives
 * each worker its own console, whose output never passes through `process.stdout.write`, so a spy on stdout alone would miss a
 * `console.log(body)` (the independent review's surviving mutant). Each stdout write is one entry.
 */
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
type Channel = 'stdout' | 'stderr' | `console.${(typeof CONSOLE_METHODS)[number]}`;
let captured: Record<Channel, string[]>;
const resetCapture = (): void => {
  captured = { stdout: [], stderr: [], 'console.log': [], 'console.info': [], 'console.warn': [], 'console.error': [], 'console.debug': [] };
};
const lines = (): string[] => captured.stdout.join('').split('\n').filter((line) => line.length > 0);
/** Every channel's output as one text, for the scans: nothing sent may reach any of them. */
const everything = (): string => (Object.keys(captured) as Channel[]).map((channel) => captured[channel].join('')).join('\n');
/** What reached any channel but standard output, as `channel: text`, so a failure names where it went. */
const elsewhere = (): string[] =>
  (Object.keys(captured) as Channel[]).filter((channel) => channel !== 'stdout' && captured[channel].length > 0).map((channel) => `${channel}: ${captured[channel].join('')}`);

beforeEach(() => {
  resetCapture();
  for (const [stream, channel] of [[process.stdout, 'stdout'], [process.stderr, 'stderr']] as const) {
    vi.spyOn(stream, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      captured[channel].push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stdout.write);
  }
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      captured[`console.${method}`].push(`${format(...args)}\n`);
    });
  }
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', undefined);
  vi.stubEnv('VERCEL_DEPLOYMENT_ID', undefined);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  expect([process.stdout.write, process.stderr.write, ...CONSOLE_METHODS.map((method) => console[method])].map((fn) => vi.isMockFunction(fn))).toEqual([false, false, false, false, false, false, false]);
});

/** The one line written, parsed. Fails, naming the count, unless there is exactly one. */
function theLine(): { raw: string; parsed: Record<string, unknown> } {
  const all = lines();
  expect(all, `exactly one log line for the request, got ${all.length}`).toHaveLength(1);
  return { raw: all[0]!, parsed: JSON.parse(all[0]!) as Record<string, unknown> };
}

/**
 * What the visitor sent that a line carries: each distinctive value, and each answer key written as a JSON key. Searched in the
 * line as written and with its escaped quotes undone, so a body embedded as a string is found too.
 */
function sentIn(line: string, values: readonly string[]): string[] {
  const texts = [line, line.replaceAll('\\"', '"')];
  return [...values, ...ANSWER_KEYS.map((key) => `"${key}":`)].filter((needle) => texts.some((text) => text.includes(needle)));
}

// ---------------------------------------------------------------------------
// logEvent
// ---------------------------------------------------------------------------

describe('logEvent', () => {
  it('names a closed set of events, the ones in use', () => {
    expect([...LOG_EVENTS]).toEqual(['check.answered', 'check.too_large', 'check.malformed', 'check.refused', 'health.refused']);
  });

  it('writes one JSON line, in one write, with exactly the six keys in order: the time, the event, the route, the status, whole milliseconds, the release', () => {
    logEvent({ event: 'check.answered', route: '/api/check', status: 200, ms: 12.6 });
    expect(captured.stdout).toHaveLength(1);
    expect(captured.stdout.join('').endsWith('\n')).toBe(true);
    expect(elsewhere()).toEqual([]);
    const { parsed } = theLine();
    expect(Object.keys(parsed)).toEqual(KEYS);
    expect(parsed).toEqual({ at: NOW.toISOString(), event: 'check.answered', route: '/api/check', status: 200, ms: 13, release: 'unknown' });
  });

  it('builds the line from the named fields alone, so a property a caller adds can never reach it', () => {
    const stray = { event: 'check.answered', route: '/api/check', status: 200, ms: 1, body: '{"turnover":{"exact":123456789.01}}', answers: { countryOther: COUNTRY } };
    logEvent(stray as LogEvent);
    const { parsed } = theLine();
    const found = sentIn(everything(), ['123456789.01', '123456789', COUNTRY]);
    expect(found, `the output carries what the caller added: ${found.join(', ')}`).toEqual([]);
    expect(Object.keys(parsed)).toEqual(KEYS);
    // The control: the same scan finds the values in what the caller handed over.
    expect(sentIn(JSON.stringify(stray), ['123456789.01', COUNTRY])).toEqual(['123456789.01', COUNTRY, '"countryOther":', '"turnover":']);
  });

  it('gives the release through the same function as the health report, read when the line is written', () => {
    for (const value of [undefined, SHA, SHA.toUpperCase(), ` ${SHA}`, SHA.slice(0, 39)]) {
      resetCapture();
      vi.stubEnv('VERCEL_GIT_COMMIT_SHA', value);
      logEvent({ event: 'health.refused', route: '/healthz', status: 503, ms: 0 });
      const { parsed } = theLine();
      const report = healthReport({ commitSha: value, deploymentId: undefined, pack: null, inputs: { knowledge: null, corpus: null, verification: null, monitoring: null }, fixedCheck: false });
      expect([String(value), parsed['release']]).toEqual([String(value), report.release]);
    }
    // The counterexample in the same test: the valid SHA really is written as itself.
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SHA);
    resetCapture();
    logEvent({ event: 'health.refused', route: '/healthz', status: 503, ms: 0 });
    expect(theLine().parsed['release']).toBe(SHA);
  });
});

describe('the capture', () => {
  it('sees a line written in this test', () => {
    logEvent({ event: 'check.answered', route: '/api/check', status: 200, ms: 0 });
    expect(lines()).toHaveLength(1);
  });

  it('does not see it in the next one', () => {
    expect(lines()).toEqual([]);
    expect(everything().trim()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// POST /api/check: one line, no answers
// ---------------------------------------------------------------------------

describe('POST /api/check writes one line and no answer', () => {
  it.each([
    ['an EU company typing its turnover, assessed', TYPED_TURNOVER, 200, 'check.answered', ['123456789.01', '123456789']],
    ['a company in another country, assessed', OTHER_COUNTRY, 200, 'check.answered', [COUNTRY]],
    ['the plan’s request, XK refused by the schema', PLAN_XK, 400, 'check.malformed', ['123456789.01', '123456789', 'XK']],
    ['both values, the turnover answering a question not shown', HIDDEN_TURNOVER, 400, 'check.malformed', ['123456789.01', '123456789', COUNTRY]],
  ] as const)('%s: one line with its six keys, the route and the status, and nothing it sent', async (_name, answers, status, event, values) => {
    const sent = JSON.stringify(answers);
    const response = await POST(post(sent));
    expect(response.status).toBe(status);

    // The positive control first: exactly one line exists, and it is JSON (failure mode 7).
    const { raw, parsed } = theLine();

    // Then the property: no channel carries anything that was sent, naming whatever it found. Asserted before the line's fields,
    // because a body smuggled into a named field would otherwise fail on that field and never say what leaked.
    const found = sentIn(everything(), values);
    expect(found, `the output carries what the visitor sent: ${found.join(', ')}`).toEqual([]);
    expect(raw.length).toBeGreaterThan(0);
    // And nothing at all was written but the one line: no console call, nothing on standard error.
    expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
    // The control for the absence: the same scan finds every value, and the answer keys, in what was sent.
    expect(sentIn(sent, values)).toEqual(expect.arrayContaining([...values, ...Object.keys(answers).map((key) => `"${key}":`)]));

    // And the line's fields: its six keys, the event, the route, the status and the release.
    expect(Object.keys(parsed)).toEqual(KEYS);
    expect({ event: parsed['event'], route: parsed['route'], status: parsed['status'], release: parsed['release'] }).toEqual({ event, route: '/api/check', status, release: 'unknown' });
    expect(Number.isInteger(parsed['ms'])).toBe(true);
    expect(parsed['at']).toBe(NOW.toISOString());
  });

  it('answers the typed-turnover request exactly as before: the timeline for those answers', async () => {
    const response = await POST(post(JSON.stringify(TYPED_TURNOVER)));
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(buildCheckTimeline(csrdPack(), checkerAnswersSchema.parse(TYPED_TURNOVER), ASSESSMENT_DATE))));
  });

  it('writes no header, address or query: an answered request carrying a forwarded address, a user agent, a cookie and a query writes none of them on any channel', async () => {
    // A documentation address (RFC 5737), and markers no other output could contain by chance.
    const MARKS = ['203.0.113.77', 'DataStrataProbe/9.9', 'ua-marker-31f0', 'ds_t8_cookie', 'cookie-marker-5c1a', 'query-marker-77e2', '?q='];
    const request = new Request(`${CHECK_URL}?q=query-marker-77e2`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.77',
        'user-agent': 'DataStrataProbe/9.9 (ua-marker-31f0)',
        cookie: 'ds_t8_cookie=cookie-marker-5c1a',
      },
      body: JSON.stringify(ANSWERS),
    });
    // The control: the request really carries each of them, and the scan finds every mark where they are.
    const carried = JSON.stringify([...request.headers.entries(), request.url]);
    expect(MARKS.filter((mark) => carried.includes(mark))).toEqual(MARKS);

    const response = await POST(request);
    expect(response.status).toBe(200);
    const { parsed } = theLine();
    const found = MARKS.filter((mark) => everything().includes(mark));
    expect(found, `the request's header, address or query reached the output: ${found.join(', ')}`).toEqual([]);
    expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
    expect(parsed).toMatchObject({ event: 'check.answered', route: '/api/check', status: 200 });
  });

  it('logs a body over 8 KiB as check.too_large, 413, once, with the response unchanged', async () => {
    const big = `${JSON.stringify(ANSWERS).slice(0, -1)}${' '.repeat(8200)}}`;
    const response = await POST(post(big));
    expect(response.status).toBe(413);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('{"error":"Request body too large."}');
    expect(theLine().parsed).toMatchObject({ event: 'check.too_large', route: '/api/check', status: 413 });
    expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
  });

  it('logs a body the schema refuses as check.malformed, 400, once', async () => {
    const response = await POST(post('{"country":'));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":"Malformed check answers."}');
    expect(theLine().parsed).toMatchObject({ event: 'check.malformed', route: '/api/check', status: 400 });
    expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
  });

  it('logs an answer to a question these answers do not show as check.malformed, 400, once', async () => {
    const response = await POST(post(JSON.stringify({ ...ANSWERS, euTurnover: 'both' })));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('{"error":"An answer was given to a question these answers do not show.","questions":["C-8"]}');
    expect(theLine().parsed).toMatchObject({ event: 'check.malformed', route: '/api/check', status: 400 });
    expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
  });

  it('logs a damaged verification record (IntegrityFailureError) as check.refused, 503, once, and the refusal path carries no path into the line', async () => {
    const fixture = buildFixtureRepository({ omitResults: true });
    const response = await inRepository(fixture.repoRoot, () => POST(post(JSON.stringify(ANSWERS))));
    expect(response.status).toBe(503);
    const { raw, parsed } = theLine();
    expect(parsed).toMatchObject({ event: 'check.refused', route: '/api/check', status: 503 });
    expect(raw).not.toContain(fixture.repoRoot);
    expect(raw).not.toContain('verification-result.json');
    // What the route itself writes on a refusal is the line alone.
    expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
  });

  it('logs a line asked to show a state its kind cannot (TimelineRefusalError) as check.refused, 503, once', async () => {
    vi.resetModules();
    vi.doMock('@/lib/pack', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/pack')>();
      const refusing = structuredClone(actual.csrdPack());
      refusing.requirements.find((r) => r.id === 'CSRD-S-013')!.condition = { op: 'in_catalogue', fact: 'entity.incorporation_country', catalogue: 'eu_member_states' } as Condition;
      return { ...actual, csrdPack: () => refusing };
    });
    try {
      const { POST: refusingPost } = await import('@/app/api/check/route');
      const response = await refusingPost(post(JSON.stringify(ANSWERS)));
      expect(response.status).toBe(503);
      expect(Object.keys((await response.json()) as object)).toEqual(['error', 'refusal']);
      expect(theLine().parsed).toMatchObject({ event: 'check.refused', route: '/api/check', status: 503 });
      expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
    } finally {
      vi.doUnmock('@/lib/pack');
      vi.resetModules();
    }
  });

  it('logs any other error as check.refused with the 500 Next then sends, once, and rethrows the error unchanged', async () => {
    const planted = new Error('a failure no refusal names');
    vi.resetModules();
    vi.doMock('@/lib/pack', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/pack')>();
      return {
        ...actual,
        csrdPack: () => {
          throw planted;
        },
      };
    });
    try {
      const { POST: throwingPost } = await import('@/app/api/check/route');
      await expect(throwingPost(post(JSON.stringify(ANSWERS)))).rejects.toBe(planted);
      const { raw, parsed } = theLine();
      expect(parsed).toMatchObject({ event: 'check.refused', route: '/api/check', status: 500 });
      expect(raw).not.toContain(planted.message);
      // What the route itself writes before the error leaves it is the line alone; Next prints the error later, outside the handler.
      expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
    } finally {
      vi.doUnmock('@/lib/pack');
      vi.resetModules();
    }
  });
});
