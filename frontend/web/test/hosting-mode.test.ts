/**
 * The pilot surface's switch, and the five routes it closes — what they are held to (DP1 plan, Task 7; DG-10).
 *
 * **Why this file exists.** The passphrase gate is a pilot's surface, not the public site's. Exposing it on the host needs DEP-6, the
 * independent authentication review, which is a DP2 row, and a gate deployed unconfigured would show visitors `/dashboard`'s list of
 * missing variable names and leave sign-in reachable. So the surface is on only when a server sets `DATASTRATA_PILOT_GATE=on`. With any
 * other value, or none, `/dashboard`, `/pilot-access`, `/api/pilot-access`, `/api/pilot-access/sign-out` and `/login` answer 404 before
 * they read any secret, profile, cookie, header, search parameter or body. The host never sets the variable; a local screen-share does.
 *
 * **What is counted.** "Nothing is read" is a count taken at each seam a route reads through, never a statement:
 * - the environment: for one call, `process.env` is replaced by a proxy over itself that writes down every `DATASTRATA_` variable
 *   read, in order, so what the route files, the pages and the exported middleware read by name is seen; the record `middlewareWith`
 *   is handed is such a proxy too;
 * - the access module's decision and passphrase comparison, `accessDecision` and `passphraseMatches`, as spies over the real ones;
 * - the profile reader `pilotRecord`, replaced by a spy, because the real one reads the profile file;
 * - the cookie and the headers: `next/headers` as a spy (the dashboard page), and each request's own `headers.get`;
 * - the search parameters (`/pilot-access`) as a thenable that counts its reads, and a body as `bodyUsed`;
 * - the pack (`/login`), as spies over the real `packStats` and `traceSeries`;
 * - each route handler's dependencies, as spies, so "the switch was read" and "the secret was read" are two calls counted apart.
 *
 * Every zero is paired with the same seam read under `on`, with the request's input (evidence standard, failure mode 7): a route that
 * never read anything would satisfy every zero, and one that read before it decided fails them.
 *
 * **What a page's 404 is here.** A page calls Next's own `notFound()`, which throws the error Next renders as `app/not-found.tsx` with
 * status 404. The real function is called through a spy, so a case sees both that it was called and that what reached the caller is
 * Next's 404 signal, its `digest` `NEXT_HTTP_ERROR_FALLBACK;404`. That a production server then answers 404 with the standard page is a
 * property of the running server, checked by the parent on a production build with the switch off and on.
 *
 * **The values.** The five off values are the plan's: unset, empty, `off`, `ON` and `true`. `pilotSurfaceEnabled` itself is held to
 * more near misses as well (`On`, ` on`, `on `, `1`). Every route is driven with a request that would pass with the surface on (the
 * right passphrase, a valid session, a usable configuration), so a 404 is the switch's answer and not a refusal of the gate's.
 *
 * **The pages' metadata (fix round 1, F1).** Next resolves a page's metadata beside its body and streams it into the document even
 * when the body calls `notFound()`, so a static `metadata` export put the page's title and description, "Pilot access", "Sign in",
 * "passphrase", into the 404 a visitor got with the switch off. Each of the three pages therefore exports no static `metadata` and
 * gives its metadata through `generateMetadata`, which reads the switch first and gives nothing of the page's while it is off. The
 * expected metadata with the switch on is written here as literals, today's titles, descriptions and robots exactly.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Metadata } from 'next';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** What the `next/headers` spy hands the dashboard page (set by each case), and what the profile reader's spy returns: a refusal the page prints. */
const held = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  profileRefusal: {
    ok: false,
    error: { code: 'marker', headline: 'The profile reader was called (a marker written for this test).', problems: [] as string[], operatorDetail: '' },
  },
}));

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/navigation')>();
  return { ...actual, notFound: vi.fn(actual.notFound) };
});
vi.mock('next/headers', () => ({ headers: vi.fn(async () => held.requestHeaders) }));
vi.mock('@/lib/record', () => ({ pilotRecord: vi.fn(() => held.profileRefusal) }));
vi.mock('@/lib/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/access')>();
  return { ...actual, accessDecision: vi.fn(actual.accessDecision), passphraseMatches: vi.fn(actual.passphraseMatches) };
});
vi.mock('@/lib/pack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pack')>();
  return { ...actual, packStats: vi.fn(actual.packStats), traceSeries: vi.fn(actual.traceSeries) };
});

import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ACCESS_COOKIE, ACCESS_REVOKED_BEFORE_ENV, ACCESS_SECRET_ENV, AttemptLimiter, accessDecision, issueAccessToken, passphraseMatches } from '@/lib/access';
import { PILOT_GATE_ENV, pilotSurfaceEnabled } from '@/lib/hosting-mode';
import { packStats, traceSeries } from '@/lib/pack';
import { accessReasonMessage, accessRoute, signOutRoute } from '@/lib/pilot-access-handler';
import { PUBLIC_ORIGIN_ENV } from '@/lib/public-origin';
import { pilotRecord } from '@/lib/record';
import { POST as signInPost } from '@/app/api/pilot-access/route';
import { POST as signOutPost } from '@/app/api/pilot-access/sign-out/route';
import DashboardPage from '@/app/dashboard/page';
import * as dashboardPageModule from '@/app/dashboard/page';
import LoginPage from '@/app/login/page';
import * as loginPageModule from '@/app/login/page';
import PilotAccessPage from '@/app/pilot-access/page';
import * as pilotAccessPageModule from '@/app/pilot-access/page';
import { middleware, middlewareWith, surfaceOffResponse } from '../middleware';

const SECRET = 'correct horse battery staple';
const WRONG = 'wrong passphrase 9f3c71';
const NONCE = 'n0nce-0123456789abcdef';
const NOW = new Date('2026-10-20T12:00:00.000Z');
/** The configured origin: a reserved test name, and the host of no request in this file. */
const PUBLIC_ORIGIN = 'https://gate.example.test';
const DASHBOARD_URL = 'http://localhost:3000/dashboard';
const SIGN_IN_URL = 'http://127.0.0.1:3000/api/pilot-access';
const SIGN_OUT_URL = 'http://127.0.0.1:3000/api/pilot-access/sign-out';
const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
/** What a browser sends with a form post from the configured origin itself. */
const FROM_THE_SITE = { origin: PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' };
/** The body every route handler answers while the surface is off, and the middleware too. */
const NOT_FOUND_BODY = '{"error":"not_found"}';
/** What Next's `notFound()` throws, by which its boundary renders the 404 page: a literal here, not read from Next. */
const NEXT_NOT_FOUND_DIGEST = 'NEXT_HTTP_ERROR_FALLBACK;404';
/** A usable gate: the secret and the origin, no revocation instant. */
const CONFIGURED: Readonly<Record<string, string>> = { [ACCESS_SECRET_ENV]: SECRET, [PUBLIC_ORIGIN_ENV]: PUBLIC_ORIGIN };
/** The cleared session cookie sign-out sends, over plain HTTP outside production. */
const CLEARED_COOKIE = 'ds_pilot_access=; Path=/dashboard; Max-Age=0; HttpOnly; SameSite=Strict';

/** The plan's five: with any of these, or none, the surface is off. `undefined` is the variable unset. */
const OFF: [string, string | undefined][] = [
  ['unset', undefined],
  ['empty', ''],
  ['off', 'off'],
  ['ON', 'ON'],
  ['true', 'true'],
];

/** The Cookie header of a browser holding a session issued at NOW under the configured secret. */
async function sessionCookie(): Promise<string> {
  return `${ACCESS_COOKIE}=${await issueAccessToken(SECRET, NOW, NONCE)}`;
}

/** The environment record the middleware is handed, with the switch at `value` (absent when undefined). */
function withSwitch(value: string | undefined): Record<string, string | undefined> {
  return value === undefined ? { ...CONFIGURED } : { ...CONFIGURED, [PILOT_GATE_ENV]: value };
}

/** A record that writes down every key read from it, in order. */
function recording(record: Record<string, string | undefined>): { env: Record<string, string | undefined>; reads: string[] } {
  const reads: string[] = [];
  const env = new Proxy(record, {
    get(target, key) {
      if (typeof key === 'string') reads.push(key);
      return Reflect.get(target, key);
    },
  });
  return { env, reads };
}

/**
 * Runs `call` with `process.env` replaced by a proxy over itself that writes down every `DATASTRATA_` variable read, in order, and puts
 * the real object back afterwards whatever happens. What `call` returned or threw is handed back as it settled.
 */
async function readingEnv<T>(call: () => T | Promise<T>): Promise<{ settled: PromiseSettledResult<Awaited<T>>; reads: string[] }> {
  const real = process.env;
  const reads: string[] = [];
  process.env = new Proxy(real, {
    get(target, key) {
      if (typeof key === 'string' && key.startsWith('DATASTRATA_')) reads.push(key);
      return Reflect.get(target, key);
    },
  });
  try {
    const [settled] = await Promise.allSettled([Promise.resolve().then(call)]);
    return { settled, reads };
  } finally {
    process.env = real;
  }
}

/** The value a call returned; a call that threw fails here, by its error. */
function fulfilled<T>(settled: PromiseSettledResult<T>): T {
  if (settled.status === 'rejected') throw new Error(`expected the call to return, and it threw: ${String(settled.reason)}`);
  return settled.value;
}

/** What a call threw; a call that returned fails here. */
function rejection(settled: PromiseSettledResult<unknown>): unknown {
  if (settled.status === 'fulfilled') throw new Error('expected the call to throw Next\'s 404, and it returned');
  return settled.reason;
}

/** The media type alone, so a case does not depend on how the platform spells the charset. */
function mediaType(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * The machine as the five routes read it: a usable gate (the secret, the origin, no revocation instant), the switch at `value`
 * (`undefined` unsets it) and `Date` alone faked, at NOW. `afterEach` puts all of it back.
 */
function configure(value: string | undefined): void {
  vi.stubEnv(PILOT_GATE_ENV, value);
  vi.stubEnv(ACCESS_SECRET_ENV, SECRET);
  vi.stubEnv(ACCESS_REVOKED_BEFORE_ENV, undefined);
  vi.stubEnv(PUBLIC_ORIGIN_ENV, PUBLIC_ORIGIN);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
}

/** Every string in an element tree as the page wrote it, read without rendering any component: text children, through props.children. */
function textsIn(node: unknown): string[] {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textsIn);
  if (node !== null && typeof node === 'object' && 'props' in node) return textsIn((node as { props: { children?: unknown } }).props.children);
  return [];
}

/** The right passphrase, posted as a browser posts the form from the site: it signs in whenever the surface is on. */
function rightPassphrase(): Request {
  return new Request(SIGN_IN_URL, { method: 'POST', body: new URLSearchParams({ passphrase: SECRET }), headers: { accept: BROWSER_ACCEPT, ...FROM_THE_SITE } });
}

/** A sign-out posted as a browser posts it from the site: it clears the cookie whenever the surface is on. */
function siteSignOut(): Request {
  return new Request(SIGN_OUT_URL, { method: 'POST', headers: { accept: BROWSER_ACCEPT, ...FROM_THE_SITE } });
}

/** The search parameters Next hands `/pilot-access`, as a thenable that counts how often it is read. */
function searchParamsOf(params: Record<string, string>) {
  const then = vi.fn((resolve: (value: Record<string, string>) => unknown) => resolve(params));
  return { searchParams: { then } as unknown as Promise<Record<string, string | string[] | undefined>>, then };
}

beforeEach(() => {
  vi.clearAllMocks();
  held.requestHeaders = new Headers();
  // Every sign-in refusal logs a line by design; the cases here do not read the log.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pilotSurfaceEnabled', () => {
  it('reads the variable DATASTRATA_PILOT_GATE', () => {
    expect(PILOT_GATE_ENV).toBe('DATASTRATA_PILOT_GATE');
  });

  it('is on when the variable is exactly "on"', () => {
    expect(pilotSurfaceEnabled({ [PILOT_GATE_ENV]: 'on' })).toBe(true);
  });

  const nearMisses: [string, Record<string, string | undefined>][] = [
    ['the variable absent', {}],
    ['the variable unset (undefined)', { [PILOT_GATE_ENV]: undefined }],
    ['empty', { [PILOT_GATE_ENV]: '' }],
    ['"off"', { [PILOT_GATE_ENV]: 'off' }],
    ['"ON"', { [PILOT_GATE_ENV]: 'ON' }],
    ['"On"', { [PILOT_GATE_ENV]: 'On' }],
    ['" on" (a leading space)', { [PILOT_GATE_ENV]: ' on' }],
    ['"on " (a trailing space)', { [PILOT_GATE_ENV]: 'on ' }],
    ['"true"', { [PILOT_GATE_ENV]: 'true' }],
    ['"1"', { [PILOT_GATE_ENV]: '1' }],
  ];
  it.each(nearMisses)('is off for %s', (_name, env) => {
    expect(pilotSurfaceEnabled(env)).toBe(false);
  });

  it('takes the switch from that variable alone: "on" in any other variable leaves it off', () => {
    expect(pilotSurfaceEnabled({ [ACCESS_SECRET_ENV]: 'on', DATASTRATA_PILOT: 'on', PILOT_GATE: 'on', datastrata_pilot_gate: 'on' })).toBe(false);
  });

  it('reads that one key of the record it is handed and no other, on or off', () => {
    for (const value of ['on', 'off', undefined]) {
      const { env, reads } = recording(withSwitch(value));
      pilotSurfaceEnabled(env);
      expect(reads, String(value)).toEqual([PILOT_GATE_ENV]);
    }
  });
});

describe('the hosting-mode module', () => {
  const code = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const importsOf = (relative: string) =>
    [...new Set([...code(relative).matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1]))].sort();

  it('imports nothing and reads no process.env, so the Edge middleware can import it and still reach no profile, and each caller decides where the value comes from', () => {
    expect(importsOf('../lib/hosting-mode.ts')).toEqual([]);
    expect(code('../lib/hosting-mode.ts')).not.toMatch(/process\.env/);
    // The control: the same scan finds the imports and the environment reads of a module that has them.
    expect(importsOf('../middleware.ts')).toContain('@/lib/hosting-mode');
    expect(code('../middleware.ts')).toMatch(/process\.env/);
  });

  it('leaves no page of the surface prerendered at build: /dashboard, /pilot-access and /login are rendered for each request, so the switch is read when a server answers', () => {
    for (const page of ['../app/dashboard/page.tsx', '../app/pilot-access/page.tsx', '../app/login/page.tsx']) {
      expect(code(page), page).toContain("export const dynamic = 'force-dynamic'");
    }
  });
});

describe('/dashboard, at the middleware', () => {
  it('has a plan for the surface off, as plain data: 404, {"error":"not_found"}, application/json', () => {
    expect(surfaceOffResponse()).toEqual({ status: 404, body: NOT_FOUND_BODY, contentType: 'application/json' });
  });

  it.each(OFF)('answers 404 while DATASTRATA_PILOT_GATE is %s, private and varying on the cookie, with no cookie set, having read the switch and nothing else: no access variable, no origin, no header', async (_name, value) => {
    const { env, reads } = recording(withSwitch(value));
    const request = new NextRequest(DASHBOARD_URL, { headers: { accept: BROWSER_ACCEPT, cookie: await sessionCookie() } });
    const headerReads = vi.spyOn(request.headers, 'get');

    const response = await middlewareWith(env, () => NOW)(request);
    const read = [...reads];

    expect(response.status).toBe(404);
    expect(mediaType(response)).toBe('application/json');
    expect(await response.text()).toBe(NOT_FOUND_BODY);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(read, 'what the middleware read of the environment it was handed').toEqual([PILOT_GATE_ENV]);
    expect(accessDecision).not.toHaveBeenCalled();
    expect(headerReads).not.toHaveBeenCalled();
  });

  it('positive control: with "on", the same request passes, after one decision asked with this request\'s cookie, and the switch is the first thing read', async () => {
    const cookie = await sessionCookie();
    const { env, reads } = recording(withSwitch('on'));
    const request = new NextRequest(DASHBOARD_URL, { headers: { accept: BROWSER_ACCEPT, cookie } });
    const headerReads = vi.spyOn(request.headers, 'get');

    const response = await middlewareWith(env, () => NOW)(request);
    const read = [...reads];

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(headerReads.mock.calls.map(([name]) => name).sort()).toEqual(['accept', 'cookie']);
    expect(read[0]).toBe(PILOT_GATE_ENV);
    expect(read).toContain(ACCESS_SECRET_ENV);
    expect(read).toContain(PUBLIC_ORIGIN_ENV);
    expect(accessDecision).toHaveBeenCalledTimes(1);
    const [asked] = vi.mocked(accessDecision).mock.calls[0];
    expect(asked.env).toBe(env);
    expect(asked.cookieHeader).toBe(cookie);
    expect(asked.now).toEqual(NOW);
  });

  it.each(OFF)('as Next runs it, answers 404 while DATASTRATA_PILOT_GATE is %s, having read that variable and no other', async (_name, value) => {
    configure(value);
    const request = new NextRequest(DASHBOARD_URL, { headers: { accept: BROWSER_ACCEPT, cookie: await sessionCookie() } });

    const { settled, reads } = await readingEnv(() => middleware(request));

    const response = fulfilled(settled);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(NOT_FOUND_BODY);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(reads).toEqual([PILOT_GATE_ENV]);
    expect(accessDecision).not.toHaveBeenCalled();
  });

  it('positive control, as Next runs it: with "on" it reads the switch first, then the three gate variables once each, and passes the session; the switch is read again for the next request', async () => {
    configure('on');
    const cookie = await sessionCookie();
    const request = () => new NextRequest(DASHBOARD_URL, { headers: { accept: BROWSER_ACCEPT, cookie } });

    const on = await readingEnv(() => middleware(request()));
    expect(on.reads).toEqual([PILOT_GATE_ENV, ACCESS_SECRET_ENV, ACCESS_REVOKED_BEFORE_ENV, PUBLIC_ORIGIN_ENV]);
    expect(fulfilled(on.settled).status).toBe(200);
    expect(fulfilled(on.settled).headers.get('x-middleware-next')).toBe('1');
    expect(accessDecision).toHaveBeenCalledTimes(1);

    vi.stubEnv(PILOT_GATE_ENV, 'off');
    const off = await readingEnv(() => middleware(request()));
    expect(off.reads).toEqual([PILOT_GATE_ENV]);
    expect(fulfilled(off.settled).status).toBe(404);
  });
});

describe('/dashboard, at the page', () => {
  it.each(OFF)('renders the standard 404 while DATASTRATA_PILOT_GATE is %s: notFound() before the cookie, the gate, the profile or the pack is read', async (_name, value) => {
    configure(value);
    held.requestHeaders = new Headers({ cookie: await sessionCookie() });

    const { settled, reads } = await readingEnv(() => DashboardPage());

    expect(rejection(settled)).toMatchObject({ digest: NEXT_NOT_FOUND_DIGEST });
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(reads).toEqual([PILOT_GATE_ENV]);
    expect(headers).not.toHaveBeenCalled();
    expect(accessDecision).not.toHaveBeenCalled();
    expect(pilotRecord).not.toHaveBeenCalled();
    expect(packStats).not.toHaveBeenCalled();
  });

  it('positive control: with "on" the page reads the cookie once, asks the gate once with it, and reads the profile once for the session the gate allows', async () => {
    configure('on');
    const cookie = await sessionCookie();
    held.requestHeaders = new Headers({ cookie });

    const { settled, reads } = await readingEnv(() => DashboardPage());

    fulfilled(settled);
    expect(notFound).not.toHaveBeenCalled();
    expect(headers).toHaveBeenCalledTimes(1);
    expect(accessDecision).toHaveBeenCalledTimes(1);
    expect(vi.mocked(accessDecision).mock.calls[0][0].cookieHeader).toBe(cookie);
    expect(pilotRecord).toHaveBeenCalledTimes(1);
    expect(packStats).toHaveBeenCalledTimes(1);
    expect(reads[0]).toBe(PILOT_GATE_ENV);
    expect(reads).toContain(ACCESS_SECRET_ENV);
  });
});

describe('/pilot-access', () => {
  it.each(OFF)('renders the standard 404 while DATASTRATA_PILOT_GATE is %s, before its search parameters are read', async (_name, value) => {
    configure(value);
    const { searchParams, then } = searchParamsOf({ reason: 'refused' });

    const { settled, reads } = await readingEnv(() => PilotAccessPage({ searchParams }));

    expect(rejection(settled)).toMatchObject({ digest: NEXT_NOT_FOUND_DIGEST });
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(reads).toEqual([PILOT_GATE_ENV]);
    expect(then).not.toHaveBeenCalled();
  });

  it('positive control: with "on" the page reads its search parameters once and says the sentence for the reason this request carried', async () => {
    configure('on');
    const { searchParams, then } = searchParamsOf({ reason: 'refused' });

    const { settled } = await readingEnv(() => PilotAccessPage({ searchParams }));

    const page = fulfilled(settled);
    expect(notFound).not.toHaveBeenCalled();
    expect(then).toHaveBeenCalledTimes(1);
    const sentence = accessReasonMessage('refused');
    expect(sentence).toEqual(expect.stringMatching(/\S/));
    expect(textsIn(page)).toContain(sentence);
  });
});

describe('/login', () => {
  it.each(OFF)('renders the standard 404 while DATASTRATA_PILOT_GATE is %s, before the pack is read', async (_name, value) => {
    configure(value);

    const { settled, reads } = await readingEnv(() => LoginPage());

    expect(rejection(settled)).toMatchObject({ digest: NEXT_NOT_FOUND_DIGEST });
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(reads).toEqual([PILOT_GATE_ENV]);
    expect(packStats).not.toHaveBeenCalled();
    expect(traceSeries).not.toHaveBeenCalled();
  });

  it('positive control: with "on" the page reads the pack once for each of its two figures and renders', async () => {
    configure('on');

    const { settled, reads } = await readingEnv(() => LoginPage());

    fulfilled(settled);
    expect(reads).toEqual([PILOT_GATE_ENV]);
    expect(notFound).not.toHaveBeenCalled();
    expect(packStats).toHaveBeenCalledTimes(1);
    expect(traceSeries).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/pilot-access', () => {
  /** The route over spies: each dependency counts its calls, and together they would sign the right passphrase in with the surface on. */
  function spiedRoute(surface: string | undefined) {
    const deps = {
      pilotSurface: vi.fn(() => surface),
      env: vi.fn(() => CONFIGURED),
      now: vi.fn(() => NOW),
      limiter: new AttemptLimiter(),
      nonce: vi.fn(() => NONCE),
      production: vi.fn(() => false),
    };
    const asked = vi.spyOn(deps.limiter, 'allowed');
    return { route: accessRoute(deps), deps, asked };
  }

  it.each(OFF)('answers 404 while DATASTRATA_PILOT_GATE is %s: {"error":"not_found"}, no-store and no cookie, having read the switch and not the environment, a header, the body or the limiter', async (_name, value) => {
    const { route, deps, asked } = spiedRoute(value);
    const request = rightPassphrase();
    const headerReads = vi.spyOn(request.headers, 'get');

    const response = await route(request);

    expect(response.status).toBe(404);
    expect(mediaType(response)).toBe('application/json');
    expect(await response.text()).toBe(NOT_FOUND_BODY);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get('location')).toBeNull();
    expect(deps.pilotSurface).toHaveBeenCalledTimes(1);
    for (const [name, dependency] of Object.entries({ env: deps.env, now: deps.now, nonce: deps.nonce, production: deps.production })) {
      expect(dependency, name).not.toHaveBeenCalled();
    }
    expect(asked).not.toHaveBeenCalled();
    expect(passphraseMatches).not.toHaveBeenCalled();
    expect(headerReads).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it('positive control: with "on" each request reads the environment once and compares its own passphrase once; the right one sets ds_pilot_access', async () => {
    const { route, deps, asked } = spiedRoute('on');

    const wrong = new Request(SIGN_IN_URL, { method: 'POST', body: new URLSearchParams({ passphrase: WRONG }), headers: FROM_THE_SITE });
    const refused = await route(wrong);
    expect(refused.status).toBe(401);
    expect(refused.headers.getSetCookie()).toEqual([]);
    expect(deps.env).toHaveBeenCalledTimes(1);
    for (const [name, dependency] of Object.entries({ now: deps.now, nonce: deps.nonce, production: deps.production })) {
      expect(dependency, name).toHaveBeenCalledTimes(1);
    }
    expect(passphraseMatches).toHaveBeenCalledTimes(1);
    expect(passphraseMatches).toHaveBeenLastCalledWith(WRONG, SECRET);

    const request = rightPassphrase();
    const headerReads = vi.spyOn(request.headers, 'get');
    const accepted = await route(request);
    expect(headerReads).toHaveBeenCalledWith('accept');
    expect(deps.env).toHaveBeenCalledTimes(2);
    for (const [name, dependency] of Object.entries({ now: deps.now, nonce: deps.nonce, production: deps.production })) {
      expect(dependency, name).toHaveBeenCalledTimes(2);
    }
    expect(asked).toHaveBeenCalledTimes(2);
    expect(passphraseMatches).toHaveBeenCalledTimes(2);
    expect(passphraseMatches).toHaveBeenLastCalledWith(SECRET, SECRET);
    expect(request.bodyUsed).toBe(true);
    expect(accepted.status).toBe(303);
    expect(accepted.headers.get('location')).toBe('/dashboard');
    expect(accepted.headers.getSetCookie()).toEqual([expect.stringMatching(/^ds_pilot_access=v1\.[^;]+; Path=\/dashboard; Max-Age=43200; HttpOnly; SameSite=Strict$/)]);
  });

  it.each(OFF)('as the route file wires it, answers 404 while DATASTRATA_PILOT_GATE is %s, having read that variable and no other, and signs the same request in once the switch is on', async (_name, value) => {
    configure(value);

    const off = await readingEnv(() => signInPost(rightPassphrase()));
    const refused = fulfilled(off.settled);
    expect(refused.status).toBe(404);
    expect(await refused.text()).toBe(NOT_FOUND_BODY);
    expect(refused.headers.get('cache-control')).toBe('no-store');
    expect(refused.headers.getSetCookie()).toEqual([]);
    expect(off.reads).toEqual([PILOT_GATE_ENV]);

    vi.stubEnv(PILOT_GATE_ENV, 'on');
    const on = await readingEnv(() => signInPost(rightPassphrase()));
    expect(on.reads[0]).toBe(PILOT_GATE_ENV);
    expect(on.reads).toContain(ACCESS_SECRET_ENV);
    const accepted = fulfilled(on.settled);
    expect(accepted.status).toBe(303);
    expect(accepted.headers.getSetCookie()).toEqual([expect.stringMatching(/^ds_pilot_access=v1\./)]);
  });
});

describe('POST /api/pilot-access/sign-out', () => {
  /** The sign-out over spies: with the surface on, the same post from the site clears the cookie. */
  function spiedSignOut(surface: string | undefined) {
    const deps = { pilotSurface: vi.fn(() => surface), publicOrigin: vi.fn(() => PUBLIC_ORIGIN), production: vi.fn(() => false) };
    return { route: signOutRoute(deps), deps };
  }

  it.each(OFF)('answers 404 while DATASTRATA_PILOT_GATE is %s: {"error":"not_found"}, no-store and no cookie, having read the switch and not the origin, the mode or a header', async (_name, value) => {
    const { route, deps } = spiedSignOut(value);
    const request = siteSignOut();
    const headerReads = vi.spyOn(request.headers, 'get');

    const response = await route(request);

    expect(response.status).toBe(404);
    expect(mediaType(response)).toBe('application/json');
    expect(await response.text()).toBe(NOT_FOUND_BODY);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get('location')).toBeNull();
    expect(deps.pilotSurface).toHaveBeenCalledTimes(1);
    expect(deps.publicOrigin).not.toHaveBeenCalled();
    expect(deps.production).not.toHaveBeenCalled();
    expect(headerReads).not.toHaveBeenCalled();
  });

  it('positive control: with "on" each request reads the origin once and is judged by its own headers: a post from another site is refused and the post from the site clears the cookie', async () => {
    const { route, deps } = spiedSignOut('on');

    const crossSite = await route(new Request(SIGN_OUT_URL, { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(crossSite.status).toBe(403);
    expect(crossSite.headers.getSetCookie()).toEqual([]);
    expect(deps.publicOrigin).toHaveBeenCalledTimes(1);
    expect(deps.production, 'a refused sign-out sets no cookie, so it asks no mode').not.toHaveBeenCalled();

    const request = siteSignOut();
    const headerReads = vi.spyOn(request.headers, 'get');
    const cleared = await route(request);
    expect(headerReads).toHaveBeenCalledWith('origin');
    expect(deps.publicOrigin).toHaveBeenCalledTimes(2);
    expect(deps.production).toHaveBeenCalledTimes(1);
    expect(cleared.status).toBe(303);
    expect(cleared.headers.get('location')).toBe('/pilot-access');
    expect(cleared.headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
  });

  it.each(OFF)('as the route file wires it, answers 404 while DATASTRATA_PILOT_GATE is %s, having read that variable and no other, and clears the cookie once the switch is on', async (_name, value) => {
    configure(value);

    const off = await readingEnv(() => signOutPost(siteSignOut()));
    const refused = fulfilled(off.settled);
    expect(refused.status).toBe(404);
    expect(await refused.text()).toBe(NOT_FOUND_BODY);
    expect(refused.headers.getSetCookie()).toEqual([]);
    expect(off.reads).toEqual([PILOT_GATE_ENV]);

    vi.stubEnv(PILOT_GATE_ENV, 'on');
    const on = await readingEnv(() => signOutPost(siteSignOut()));
    expect(on.reads).toEqual([PILOT_GATE_ENV, PUBLIC_ORIGIN_ENV]);
    const cleared = fulfilled(on.settled);
    expect(cleared.status).toBe(303);
    expect(cleared.headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
  });
});

describe('the metadata of the surface\'s three pages (fix round 1, F1)', () => {
  /** Each page's module, and its metadata as it is with the switch on: today's titles, descriptions and robots, written as literals. */
  const PAGES: [string, Record<string, unknown>, Metadata][] = [
    ['/dashboard', dashboardPageModule, {
      title: 'Record · DataStrata',
      description: 'The regulatory record, rendered from a real engine assessment over the configured profile.',
    }],
    ['/pilot-access', pilotAccessPageModule, {
      title: 'Pilot access · DataStrata',
      description: 'Enter the passphrase for a pilot evaluation.',
      robots: { index: false, follow: false },
    }],
    ['/login', loginPageModule, {
      title: 'Sign in · DataStrata',
      description: 'Accounts are not live yet. Pilot evaluations use a passphrase, entered at /pilot-access.',
    }],
  ];
  const metadataOf = (module: Record<string, unknown>) => (module.generateMetadata as () => Promise<Metadata>)();

  it.each(PAGES)('%s exports no static metadata, which Next would stream into the 404 document whatever the switch says, and gives its metadata through generateMetadata', (_path, module) => {
    expect(Object.keys(module)).not.toContain('metadata');
    expect(module.metadata).toBeUndefined();
    expect(typeof module.generateMetadata).toBe('function');
  });

  const OFF_PAGES = PAGES.flatMap(([path, module, metadata]) => OFF.map(([name, value]) => [path, name, module, metadata, value] as const));
  it.each(OFF_PAGES)('%s, while DATASTRATA_PILOT_GATE is %s: generateMetadata gives none of the page\'s metadata, having read the switch and nothing else', async (_path, _name, module, metadata, value) => {
    configure(value);

    const { settled, reads } = await readingEnv(() => metadataOf(module));

    const given = fulfilled(settled);
    expect(given).toStrictEqual({});
    const written = JSON.stringify(given);
    expect(written).not.toContain(String(metadata.title));
    expect(written).not.toContain(String(metadata.description));
    expect(reads).toEqual([PILOT_GATE_ENV]);
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each(PAGES)('positive control: %s, with "on", gives exactly its metadata, having read the switch alone', async (_path, module, metadata) => {
    configure('on');

    const { settled, reads } = await readingEnv(() => metadataOf(module));

    const given = fulfilled(settled);
    expect(given).toStrictEqual(metadata);
    expect(JSON.stringify(given)).toContain(String(metadata.title));
    expect(reads).toEqual([PILOT_GATE_ENV]);
  });
});
