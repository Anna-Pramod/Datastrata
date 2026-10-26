/**
 * The pilot access gate's middleware — what it is held to.
 *
 * Stage 1a (2026-10-20). The middleware is the first of two places the gate is
 * enforced and the only one a visitor meets before any page code runs, so what
 * it answers a stranger, a browser, a script and a half-configured server with
 * is the whole of its job. The response policy is `decideResponse`, a pure
 * function, tested here without the Next runtime; `middlewareWith` is then
 * driven with real `NextRequest`s, a synthetic environment and a fixed clock,
 * with sessions issued by the access module's own `issueAccessToken`, so the
 * decision under test is the one production makes. The exported `middleware`,
 * the one function Next runs, only binds the real environment and the real
 * clock to `middlewareWith`, and it is driven too, with synthetic values: both
 * access variables are set with `vi.stubEnv` and `Date` alone is faked, and
 * all of it is put back after each case. Every such case stubs both
 * variables, so nothing the real environment holds can reach the export, and
 * no other case in this file reads or writes `process.env`. Those cases
 * establish that each variable is read under its own name and that the clock
 * is the global `Date`, to the millisecond; the source-level cases at the end
 * establish only what the source contains: its imports, its `process.env`
 * reads and its matcher.
 *
 * Every refusal is paired with the pass one step away from it: the same cookie
 * a millisecond before its expiry and at it, the same session under a usable
 * and an unusable configuration, the same request with and without a session,
 * a revocation instant equal to the issue instant and one a millisecond after
 * it. A middleware that answered 503, 303 or 401 to everyone would satisfy
 * every refusal case, and one that answered 200 to everyone would satisfy the
 * pass cases (evidence standard, failure modes 5 and 7). A pass is also
 * checked to be `next()` (the `x-middleware-next` header) and not a response
 * of its own: a bare 200 would end the request and still look like success.
 * The three defects the plan names are what these cases are written to catch:
 * an unconfigured gate mapped to `next()` (the 503 cases), a dropped
 * `Cache-Control` (the header cases, one per outcome) and a matcher widened to
 * `/:path*` (the matcher case); the exported-middleware cases add a clock that
 * is a constant, two variables read under each other's names, and a body that
 * lets everything through. "Never reads the profile" is checked rather than
 * stated: the source's imports are held to `next/server`, the access module,
 * the public-origin module and the hosting-mode module (failure mode 6).
 *
 * The 503 is the only thing the middleware says to an operator, so it says what
 * is wrong (final review, 2026-10-21): "Pilot access is not configured on this
 * server." and then each problem the configuration has, one per line, each
 * naming its variable and none printing a value. The first implementation
 * answered every unconfigured gate with one constant asking for the secret, so
 * a bad revocation setting was reported as a missing secret. The revocation
 * diagnostic is an assertion of its own (`expectRevocationDiagnostic`), with
 * the unusable secret as its control, and every 503 is scanned for the
 * configured values and the submitted cookie beside a scan that finds each of
 * them where it was sent (failure mode 7). A revocation instant later than the
 * request time is one of those problems, beside the equal instant, which is
 * usable.
 *
 * The redirect goes to a configured origin (pilot readiness B3, 2026-10-22).
 * Middleware cannot redirect relatively, and the URL Next hands it carries the
 * hostname the server was started with, not the one the browser used
 * (investigation B3.1–B3.3), so a refused browser is sent to exactly
 * `<DATASTRATA_PUBLIC_ORIGIN>/pilot-access?reason=<reason>`. The configured
 * environment of every case therefore carries a usable origin,
 * `https://gate.example.test`, which is unlike any host a request below
 * arrives on, so a redirect built from the request cannot pass for one built
 * from the origin. The exact `Location` is checked through `decideResponse` and
 * through `middlewareWith` with a request whose URL is
 * `http://localhost:3000/dashboard`, with none of and each of the headers a
 * client could use to steer it (`Host`, `X-Forwarded-Host`,
 * `X-Forwarded-Proto`), each shown to arrive on the request. An unusable
 * origin makes the gate fail closed: every request, a valid session included,
 * is answered 503 naming the variable, beside the same request answered 303,
 * 401 or 200 once the variable is set. The source cases hold that the module
 * no longer reads the request's URL and reads the variable by name. The
 * validator's own rules are `public-origin.test.ts`'s.
 *
 * The pilot surface is switched on in every case here (DP1 Task 7, DG-10). The gate answers only where a server sets
 * `DATASTRATA_PILOT_GATE=on`, and with any other value, or none, the middleware answers 404 before it reads anything else, so every
 * environment this file builds carries the switch as `on` (`SURFACE_ON`) and the exported-middleware cases stub it, and nothing else
 * about any case changed. The switch itself, and the 404, are `hosting-mode.test.ts`'s. The source cases hold the module to one more
 * import, the hosting-mode module, which imports nothing, and one more read by name, the switch.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_COOKIE,
  ACCESS_REVOKED_BEFORE_ENV,
  ACCESS_SECRET_ENV,
  ACCESS_SECRET_MIN_LENGTH,
  ACCESS_SESSION_SECONDS,
  issueAccessToken,
  type AccessDecision,
} from '@/lib/access';
import { PILOT_GATE_ENV } from '@/lib/hosting-mode';
import { PUBLIC_ORIGIN_ENV } from '@/lib/public-origin';
import { config, decideResponse, middleware, middlewareWith } from '../middleware';

const SECRET = 'correct horse battery staple';
const OTHER_SECRET = 'battery staple horse correct';
const FIFTEEN = 'fifteen-chars!!';
const NOW = new Date('2026-10-20T12:00:00.000Z');
const HOUR_MS = 3_600_000;
const SESSION_MS = ACCESS_SESSION_SECONDS * 1000;
const NONCE = 'n0nce-0123456789abcdef';
const ORIGIN = 'http://127.0.0.1:3000';
const DASHBOARD = `${ORIGIN}/dashboard`;
/** What a browser sends for a navigation. */
const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
/** The first line of every 503, the operator's headline; the configuration's own problems follow it, one per line. */
const NOT_CONFIGURED = 'Pilot access is not configured on this server.';
/** The origin the gate's redirects are built from: a reserved test name, and the host of no request in this file. */
const PUBLIC_ORIGIN = 'https://gate.example.test';
/** The variable alone, set to the origin above: what every configured environment here carries beside the secret. */
const CONFIGURED_ORIGIN = { [PUBLIC_ORIGIN_ENV]: PUBLIC_ORIGIN };
/** The pilot surface switched on (DP1 Task 7): every environment built here carries it, so each case reaches the gate it is about. */
const SURFACE_ON = { [PILOT_GATE_ENV]: 'on' };
/** A request URL as Next builds it for a server on one machine: the hostname it was started with, not the configured origin. */
const LOCAL_DASHBOARD = 'http://localhost:3000/dashboard';

type Gate = ReturnType<typeof middlewareWith>;
type DeniedReason = Extract<AccessDecision, { kind: 'denied' }>['reason'];

const env = { ...SURFACE_ON, [ACCESS_SECRET_ENV]: SECRET, ...CONFIGURED_ORIGIN };
const gate: Gate = middlewareWith(env, () => NOW);

/** The clock and the timers as they are before any case fakes anything, so a case can show what the fake left alone. */
const REAL = { Date, setTimeout, setImmediate, queueMicrotask };

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

/** A request for the dashboard, or for `url`, carrying exactly the headers given. */
function request(headers: Record<string, string> = {}, url = DASHBOARD): NextRequest {
  return new NextRequest(url, { headers });
}

/** The Cookie header a browser holding a session issued at `issuedAt` under `secret` would send. */
async function cookieFor(secret: string, issuedAt: Date): Promise<string> {
  return `${ACCESS_COOKIE}=${await issueAccessToken(secret, issuedAt, NONCE)}`;
}

/** The media type alone, so a case does not depend on how the platform spells the charset. */
function mediaType(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}

/** Where a redirect points, resolved against `base`; a response with no Location is a failure here, not an empty string. */
function locationOf(response: Response, base: string): URL {
  const location = response.headers.get('location');
  if (location === null) throw new Error(`expected a redirect with a Location header and got status ${response.status} without one`);
  return new URL(location, base);
}

/** A redirect's target as path and query, so a case compares the route and not the origin. */
function pathAndQuery(response: Response, base = ORIGIN): string {
  const target = locationOf(response, base);
  return target.pathname + target.search;
}

/**
 * The revocation diagnostic, an assertion of its own: a 503 caused by the revocation setting names that variable and does not ask
 * for a new secret. The constant body the first implementation gave every unconfigured gate, which asked for the secret, passes every
 * assertion a revocation case makes before this one and fails here, so a mutation that restores it is read by this assertion's name.
 */
function expectRevocationDiagnostic(body: string): void {
  expect(body, 'revocation diagnostic: the 503 names DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE').toContain(ACCESS_REVOKED_BEFORE_ENV);
  expect(body, 'revocation diagnostic: the 503 does not ask for a new secret').not.toContain(ACCESS_SECRET_ENV);
  expect(body, 'revocation diagnostic: the 503 does not mention the public origin').not.toContain('DATASTRATA_PUBLIC_ORIGIN');
}

/** The control's diagnostic: a 503 caused by the secret names that variable and does not mention the revocation setting or the origin. */
function expectSecretDiagnostic(body: string): void {
  expect(body, 'secret diagnostic: the 503 names DATASTRATA_PILOT_ACCESS_SECRET').toContain(ACCESS_SECRET_ENV);
  expect(body, 'secret diagnostic: the 503 does not mention the revocation setting').not.toContain(ACCESS_REVOKED_BEFORE_ENV);
  expect(body, 'secret diagnostic: the 503 does not mention the public origin').not.toContain('DATASTRATA_PUBLIC_ORIGIN');
}

/** A 503 caused by the public origin alone: the first sentence, then one problem naming that variable, and neither access variable. */
function expectOriginDiagnostic(body: string): void {
  expect(body.split('\n'), 'origin diagnostic: the first sentence, then the origin problem on a line of its own').toEqual([
    NOT_CONFIGURED,
    expect.stringMatching(/^DATASTRATA_PUBLIC_ORIGIN /),
  ]);
  expect(body, 'origin diagnostic: the 503 does not ask for a new secret').not.toContain(ACCESS_SECRET_ENV);
  expect(body, 'origin diagnostic: the 503 does not mention the revocation setting').not.toContain(ACCESS_REVOKED_BEFORE_ENV);
}

/** Every header and the body of a request or a response, as one string to search. */
async function everythingIn(message: { headers: Headers; text(): Promise<string> }): Promise<string> {
  return `${JSON.stringify([...message.headers.entries()])}\n${await message.text()}`;
}

/**
 * Every refusal the gate can give, each with the gate and the cookie that
 * provoke it through the real decision. Keyed by the reason, so a sixth reason
 * in the access module is a type error here until a case provokes it.
 */
const PROVOKE: Record<DeniedReason, () => Promise<{ gate: Gate; cookie: string | null }>> = {
  no_session: async () => ({ gate, cookie: null }),
  malformed: async () => ({ gate, cookie: `${ACCESS_COOKIE}=garbage` }),
  bad_signature: async () => ({ gate, cookie: await cookieFor(OTHER_SECRET, NOW) }),
  expired: async () => ({ gate, cookie: await cookieFor(SECRET, at(-13 * HOUR_MS)) }),
  // The request is at the revocation instant, which is usable: one later than the request is a configuration problem (a 503), not a revocation.
  revoked: async () => ({
    gate: middlewareWith({ ...env, [ACCESS_REVOKED_BEFORE_ENV]: at(1).toISOString() }, () => at(1)),
    cookie: await cookieFor(SECRET, NOW),
  }),
};
const REASONS = Object.keys(PROVOKE) as DeniedReason[];

/** The response to a request that fails as `reason`, from a client sending `accept`. */
async function refusedBy(reason: DeniedReason, accept: string): Promise<Response> {
  const provoked = await PROVOKE[reason]();
  return provoked.gate(request(provoked.cookie === null ? { accept } : { accept, cookie: provoked.cookie }));
}

describe('decideResponse', () => {
  const asked = (accept: string | null) => ({ accept, origin: { ok: true, origin: PUBLIC_ORIGIN } as const });
  const denied = (reason: DeniedReason): AccessDecision => ({ kind: 'denied', reason });

  it('answers an unconfigured gate with 503 in plain text: the first sentence, then each problem on a line of its own, in order, whatever the client accepts', () => {
    const decision: AccessDecision = {
      kind: 'unconfigured',
      problems: ['DATASTRATA_PILOT_ACCESS_SECRET is shorter than 16 characters.', 'DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE is set but is not an instant.'],
    };
    for (const accept of [BROWSER_ACCEPT, 'application/json', null]) {
      expect(decideResponse(decision, asked(accept))).toEqual({
        status: 503,
        body:
          'Pilot access is not configured on this server.\n' +
          'DATASTRATA_PILOT_ACCESS_SECRET is shorter than 16 characters.\n' +
          'DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE is set but is not an instant.',
        contentType: 'text/plain; charset=utf-8',
      });
    }
  });

  it.each(REASONS)('sends a client that accepts HTML to the access page on the configured origin when the session fails as %s, with the reason in the query', (reason) => {
    expect(decideResponse(denied(reason), asked(BROWSER_ACCEPT))).toEqual({
      status: 303,
      location: `https://gate.example.test/pilot-access?reason=${reason}`,
    });
  });

  const origins: [string, string][] = [
    ['https://gate.example.test', 'https://gate.example.test/pilot-access?reason=no_session'],
    ['https://gate.example.test:8443', 'https://gate.example.test:8443/pilot-access?reason=no_session'],
    ['http://localhost:3000', 'http://localhost:3000/pilot-access?reason=no_session'],
  ];
  it.each(origins)('builds the 303 on the configured origin %s exactly, as the absolute URL %s', (origin, location) => {
    expect(decideResponse(denied('no_session'), { accept: BROWSER_ACCEPT, origin: { ok: true, origin } })).toEqual({ status: 303, location });
  });

  describe('under an unusable public origin', () => {
    /** Whatever the origin module says; the middleware's job is where the line goes, not its wording. */
    const ORIGIN_PROBLEM = 'DATASTRATA_PUBLIC_ORIGIN is not usable (a problem written for this test).';
    const unusable = { ok: false, problem: ORIGIN_PROBLEM } as const;
    const usable = { ok: true, origin: PUBLIC_ORIGIN } as const;
    const allowed: AccessDecision = { kind: 'allowed', expiresAt: at(SESSION_MS) };
    const unconfigured: AccessDecision = { kind: 'unconfigured', problems: ['The first access problem.', 'The second access problem.'] };

    const decisions: [string, AccessDecision, string, number][] = [
      ['a denied session', denied('no_session'), 'Pilot access is not configured on this server.\nDATASTRATA_PUBLIC_ORIGIN is not usable (a problem written for this test).', 303],
      ['an allowed session', allowed, 'Pilot access is not configured on this server.\nDATASTRATA_PUBLIC_ORIGIN is not usable (a problem written for this test).', 200],
      [
        'an unconfigured gate',
        unconfigured,
        'Pilot access is not configured on this server.\nThe first access problem.\nThe second access problem.\nDATASTRATA_PUBLIC_ORIGIN is not usable (a problem written for this test).',
        503,
      ],
    ];
    it.each(decisions)('answers %s with 503 in plain text, whatever the client accepts: the first sentence, the access problems, then the origin problem', (_name, decision, body, usableStatus) => {
      for (const accept of [BROWSER_ACCEPT, 'application/json', null]) {
        expect(decideResponse(decision, { accept, origin: unusable }), String(accept)).toEqual({ status: 503, body, contentType: 'text/plain; charset=utf-8' });
      }
      // The control: the same decision for a browser under a usable origin is answered as the decision says, not 503 for everyone.
      expect(decideResponse(decision, { accept: BROWSER_ACCEPT, origin: usable }).status).toBe(usableStatus);
    });
  });

  it.each(REASONS)('answers any other client with 401 and the reason as JSON when the session fails as %s', (reason) => {
    expect(decideResponse(denied(reason), asked('application/json'))).toEqual({
      status: 401,
      body: `{"error":"unauthorized","reason":"${reason}"}`,
      contentType: 'application/json',
    });
  });

  const asksForHtml: [string, string][] = [
    ['a browser navigation', BROWSER_ACCEPT],
    ['text/html alone', 'text/html'],
    ['upper case', 'TEXT/HTML'],
    ['text/html listed after another type, in mixed case', 'application/json, Text/Html;q=0.5'],
  ];
  it.each(asksForHtml)('takes %s as asking for HTML', (_name, accept) => {
    expect(decideResponse(denied('no_session'), asked(accept)).status).toBe(303);
  });

  const doesNotAskForHtml: [string, string | null][] = [
    ['JSON', 'application/json'],
    ['a wildcard (*/*)', '*/*'],
    ['a client-side navigation payload', 'text/x-component'],
    ['XHTML alone', 'application/xhtml+xml'],
    ['an empty header', ''],
    ['a missing header', null],
  ];
  it.each(doesNotAskForHtml)('does not take %s as asking for HTML', (_name, accept) => {
    expect(decideResponse(denied('no_session'), asked(accept)).status).toBe(401);
  });

  it('lets an allowed session through as a bare 200, whatever the client accepts', () => {
    const decision: AccessDecision = { kind: 'allowed', expiresAt: at(SESSION_MS) };
    for (const accept of [BROWSER_ACCEPT, 'application/json', null]) {
      expect(decideResponse(decision, asked(accept))).toEqual({ status: 200 });
    }
  });
});

describe('middlewareWith', () => {
  it('answers 503 in plain text, and no redirect, when no secret is configured: the first sentence, then the problem naming the secret', async () => {
    const response = await middlewareWith({ ...SURFACE_ON, ...CONFIGURED_ORIGIN }, () => NOW)(request({ accept: BROWSER_ACCEPT }));
    expect(response.status).toBe(503);
    expect(mediaType(response)).toBe('text/plain');
    const body = await response.text();
    expect(body.startsWith(NOT_CONFIGURED), 'the 503 begins with the first sentence').toBe(true);
    expectSecretDiagnostic(body);
    expect(response.headers.get('location')).toBeNull();
  });

  it('refuses with 503 naming the setting at fault when the configuration is unusable, a session the same server accepts once it is fixed included', async () => {
    expect(FIFTEEN).toHaveLength(ACCESS_SECRET_MIN_LENGTH - 1);
    const headers = { accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, NOW) };

    const usable = await gate(request(headers));
    expect(usable.status).toBe(200);
    expect(usable.headers.get('x-middleware-next')).toBe('1');

    const shortSecret = await middlewareWith({ ...SURFACE_ON, ...CONFIGURED_ORIGIN, [ACCESS_SECRET_ENV]: FIFTEEN }, () => NOW)(request(headers));
    expect(shortSecret.status).toBe(503);
    const shortSecretBody = await shortSecret.text();
    expect(shortSecretBody.startsWith(NOT_CONFIGURED), 'the 503 begins with the first sentence').toBe(true);
    expectSecretDiagnostic(shortSecretBody);

    const badRevocation = await middlewareWith({ ...env, [ACCESS_REVOKED_BEFORE_ENV]: 'soon' }, () => NOW)(request(headers));
    expect(badRevocation.status).toBe(503);
    const badRevocationBody = await badRevocation.text();
    expect(badRevocationBody.startsWith(NOT_CONFIGURED), 'the 503 begins with the first sentence').toBe(true);
    expectRevocationDiagnostic(badRevocationBody);
  });

  it('sends a browser without a session to the access page with 303', async () => {
    const response = await gate(request({ accept: BROWSER_ACCEPT }));
    expect(response.status).toBe(303);
    expect(pathAndQuery(response)).toBe('/pilot-access?reason=no_session');
  });

  // Before B3 this case held the opposite: the redirect stayed within the origin the request arrived on. That origin is Next's (the
  // hostname it was started with, a loopback address rewritten to localhost), not the browser's, so the redirect now goes to the
  // configured origin whatever the request's.
  it.each(['http://localhost:3000', 'https://pilot.example.test', 'http://127.0.0.1:3000', 'http://0.0.0.0:3000'])(
    'redirects to the configured origin, not the origin the request arrived on (%s), and carries nothing of the path or query it asked for',
    async (origin) => {
      const response = await gate(request({ accept: BROWSER_ACCEPT }, `${origin}/dashboard/records/42?tab=facts`));
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('https://gate.example.test/pilot-access?reason=no_session');
    },
  );

  it('answers a script without a session with 401 and the reason as JSON, not a redirect', async () => {
    const response = await gate(request({ accept: 'application/json' }));
    expect(response.status).toBe(401);
    expect(mediaType(response)).toBe('application/json');
    expect(await response.text()).toBe('{"error":"unauthorized","reason":"no_session"}');
    expect(response.headers.get('location')).toBeNull();
  });

  it('answers a client-side navigation payload request (RSC) with 401 JSON rather than a redirect, and passes it with a session', async () => {
    const payload = { accept: 'text/x-component', rsc: '1' };
    const url = `${DASHBOARD}?_rsc=1x2y3`;

    const refused = await gate(request(payload, url));
    expect(refused.status).toBe(401);
    expect(refused.headers.get('location')).toBeNull();
    expect(mediaType(refused)).toBe('application/json');
    expect(await refused.text()).toBe('{"error":"unauthorized","reason":"no_session"}');

    const passed = await gate(request({ ...payload, cookie: await cookieFor(SECRET, NOW) }, url));
    expect(passed.status).toBe(200);
    expect(passed.headers.get('x-middleware-next')).toBe('1');
  });

  it.each([BROWSER_ACCEPT, 'application/json', 'text/x-component'])(
    'passes a valid session on to the page, among other cookies, whatever the client accepts (%s)',
    async (accept) => {
      const cookie = `theme=dark; ${await cookieFor(SECRET, at(-HOUR_MS))}; last=3`;
      const response = await gate(request({ accept, cookie }));
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it.each(REASONS)('refuses a session that fails as %s: 303 to the access page on the configured origin for a browser, 401 JSON for anything else', async (reason) => {
    const browser = await refusedBy(reason, BROWSER_ACCEPT);
    expect(browser.status).toBe(303);
    expect(browser.headers.get('location')).toBe(`https://gate.example.test/pilot-access?reason=${reason}`);

    const script = await refusedBy(reason, 'application/json');
    expect(script.status).toBe(401);
    expect(await script.text()).toBe(`{"error":"unauthorized","reason":"${reason}"}`);
  });

  it('judges the session at the instant its clock gives: one cookie passes a millisecond before its expiry and is refused at it', async () => {
    const headers = { accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, NOW) };

    const before = await middlewareWith(env, () => at(SESSION_MS - 1))(request(headers));
    expect(before.status).toBe(200);
    expect(before.headers.get('x-middleware-next')).toBe('1');

    const after = await middlewareWith(env, () => at(SESSION_MS))(request(headers));
    expect(after.status).toBe(303);
    expect(pathAndQuery(after)).toBe('/pilot-access?reason=expired');
  });
});

describe('the configured public origin, through middlewareWith', () => {
  /**
   * Requests a client could send to steer a redirect, each on the URL Next would hand the middleware. In a running server Next
   * ignores `Host` and `X-Forwarded-Host` and turns the scheme to https for any `X-Forwarded-Proto` containing `https` (investigation
   * B3.3); the last two rows are the URLs it then builds, and the URL a standalone server started on 0.0.0.0 builds.
   */
  const steered: [string, string, Record<string, string>][] = [
    ['no proxy header', LOCAL_DASHBOARD, {}],
    ['Host: evil.example', LOCAL_DASHBOARD, { host: 'evil.example' }],
    ['X-Forwarded-Host: evil.example', LOCAL_DASHBOARD, { 'x-forwarded-host': 'evil.example' }],
    ['X-Forwarded-Proto: https', LOCAL_DASHBOARD, { 'x-forwarded-proto': 'https' }],
    ['all three at once', LOCAL_DASHBOARD, { host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' }],
    ['X-Forwarded-Proto: https on the https URL Next builds from it', 'https://localhost:3000/dashboard', { 'x-forwarded-proto': 'https' }],
    ['the URL a server started on 0.0.0.0 builds', 'http://0.0.0.0:3000/dashboard', {}],
  ];
  it.each(steered)('sends a browser without a session to exactly the configured origin under %s', async (_name, url, headers) => {
    const sent = request({ accept: BROWSER_ACCEPT, ...headers }, url);
    // The control: the request carries every header as written, so the row tests what it names.
    for (const [name, value] of Object.entries(headers)) expect(sent.headers.get(name), name).toBe(value);

    const response = await gate(sent);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://gate.example.test/pilot-access?reason=no_session');
  });

  it('follows the variable and not the request: the same request is sent to whichever origin is configured', async () => {
    const sent = () => request({ accept: BROWSER_ACCEPT }, LOCAL_DASHBOARD);
    const onPort = await middlewareWith({ ...env, [PUBLIC_ORIGIN_ENV]: 'https://gate.example.test:8443' }, () => NOW)(sent());
    expect(onPort.headers.get('location')).toBe('https://gate.example.test:8443/pilot-access?reason=no_session');
    const local = await middlewareWith({ ...env, [PUBLIC_ORIGIN_ENV]: 'http://localhost:3000' }, () => NOW)(sent());
    expect(local.headers.get('location')).toBe('http://localhost:3000/pilot-access?reason=no_session');
  });

  /** Requests the gate answers differently, each with the status it gets once the variable is set. */
  const requests: [string, () => Promise<Record<string, string>>, number][] = [
    ['a browser without a session', async () => ({ accept: BROWSER_ACCEPT }), 303],
    ['a script without a session', async () => ({ accept: 'application/json' }), 401],
    ['a browser with an expired session', async () => ({ accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, at(-13 * HOUR_MS)) }), 303],
    ['a browser with a valid session', async () => ({ accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, at(-HOUR_MS)) }), 200],
    ['a script with a valid session', async () => ({ accept: 'application/json', cookie: await cookieFor(SECRET, at(-HOUR_MS)) }), 200],
  ];
  it.each(requests)('answers %s 503 naming DATASTRATA_PUBLIC_ORIGIN while it is not set, private and varying on the cookie, and as the session says once it is', async (_name, headers, configured) => {
    const unset = await middlewareWith({ ...SURFACE_ON, [ACCESS_SECRET_ENV]: SECRET }, () => NOW)(request(await headers(), LOCAL_DASHBOARD));
    expect(unset.status).toBe(503);
    expect(mediaType(unset)).toBe('text/plain');
    expect(unset.headers.get('location')).toBeNull();
    expect(unset.headers.get('x-middleware-next')).toBeNull();
    expect(unset.headers.get('cache-control')).toBe('private, no-store');
    expect(unset.headers.get('vary')).toBe('Cookie');
    const body = await unset.text();
    expectOriginDiagnostic(body);
    expect(body.split('\n')[1]).toMatch(/^DATASTRATA_PUBLIC_ORIGIN is not set\. /);

    // The control: the same request, with the variable set.
    const set = await gate(request(await headers(), LOCAL_DASHBOARD));
    expect(set.status).toBe(configured);
  });

  const unusableOrigins: [string, string][] = [
    ['blank', ''],
    ['written with a trailing slash', 'https://gate.example.test/'],
    ['plain http on a name other than localhost', 'http://gate.example.test'],
    ['a loopback address over plain http', 'http://127.0.0.1:3000'],
    ['a loopback address over https, which only the loopback rule refuses', 'https://127.0.0.1'],
  ];
  it.each(unusableOrigins)('answers a valid session 503 naming DATASTRATA_PUBLIC_ORIGIN when it is %s', async (_name, origin) => {
    const headers = { accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, at(-HOUR_MS)) };
    const response = await middlewareWith({ ...env, [PUBLIC_ORIGIN_ENV]: origin }, () => NOW)(request(headers, LOCAL_DASHBOARD));
    expect(response.status).toBe(503);
    expectOriginDiagnostic(await response.text());
  });

  it('puts the origin problem after the access problems when both are unusable: the first sentence, the secret, then the origin', async () => {
    const response = await middlewareWith({ ...SURFACE_ON }, () => NOW)(request({ accept: BROWSER_ACCEPT }, LOCAL_DASHBOARD));
    expect(response.status).toBe(503);
    expect((await response.text()).split('\n')).toEqual([
      NOT_CONFIGURED,
      expect.stringMatching(/^DATASTRATA_PILOT_ACCESS_SECRET is not set\. /),
      expect.stringMatching(/^DATASTRATA_PUBLIC_ORIGIN is not set\. /),
    ]);
  });
});

describe('the exported middleware', () => {
  // The export binds the real environment and the real clock to `middlewareWith`, so these cases give it synthetic values for both:
  // the two access variables and the public origin through `vi.stubEnv` and the clock through a fake `Date`. Every case calls
  // `setUp` first, which stubs all three variables and the pilot switch (as `on`), so nothing the real environment holds can reach
  // the export; `afterEach` puts the environment and the clock back.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  /**
   * The three variables set (`undefined` removes one; the origin is the usable one unless a case says otherwise) and the clock at
   * `now`. `Date` alone is faked, and the fake is installed before the time is set: vitest refuses the install if the time was set
   * first.
   */
  function setUp(settings: { secret: string | undefined; revokedBefore?: string; publicOrigin?: string | null }, now: Date = NOW): void {
    vi.stubEnv(PILOT_GATE_ENV, 'on');
    vi.stubEnv(ACCESS_SECRET_ENV, settings.secret);
    vi.stubEnv(ACCESS_REVOKED_BEFORE_ENV, settings.revokedBefore);
    vi.stubEnv(PUBLIC_ORIGIN_ENV, settings.publicOrigin === undefined ? PUBLIC_ORIGIN : (settings.publicOrigin ?? undefined));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  }

  it('fakes Date alone, so these cases measure the export and not the fake: timers stay real and Web Crypto still settles', async () => {
    setUp({ secret: SECRET });
    expect(globalThis.Date).not.toBe(REAL.Date);
    expect(Date.now()).toBe(NOW.getTime());
    expect(globalThis.setTimeout).toBe(REAL.setTimeout);
    expect(globalThis.setImmediate).toBe(REAL.setImmediate);
    expect(globalThis.queueMicrotask).toBe(REAL.queueMicrotask);
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array([1]));
    expect(digest.byteLength).toBe(32);
  });

  it('passes a session issued an hour ago under the stubbed secret, the control for the refusals below', async () => {
    setUp({ secret: SECRET });
    const response = await middleware(request({ accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, at(-HOUR_MS)) }));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('refuses a session issued thirteen hours ago as expired', async () => {
    setUp({ secret: SECRET });
    const response = await middleware(request({ accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, at(-13 * HOUR_MS)) }));
    expect(response.status).toBe(303);
    expect(pathAndQuery(response)).toBe('/pilot-access?reason=expired');
  });

  it('reads the clock exactly: one session passes a millisecond before its expiry and is refused at it', async () => {
    const headers = { accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, NOW) };
    setUp({ secret: SECRET }, at(SESSION_MS - 1));

    const before = await middleware(request(headers));
    expect(before.status).toBe(200);
    expect(before.headers.get('x-middleware-next')).toBe('1');

    vi.setSystemTime(at(SESSION_MS));
    const after = await middleware(request(headers));
    expect(after.status).toBe(303);
    expect(pathAndQuery(after)).toBe('/pilot-access?reason=expired');
  });

  it('reads the revocation instant under its own name: a session issued at it passes, and is refused a millisecond after it', async () => {
    const headers = { accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, NOW) };
    // The clock is a millisecond past the issue instant, so neither revocation instant below is later than the request, which would
    // be a configuration problem (a 503) rather than a revocation.
    setUp({ secret: SECRET, revokedBefore: NOW.toISOString() }, at(1));

    const kept = await middleware(request(headers));
    expect(kept.status).toBe(200);
    expect(kept.headers.get('x-middleware-next')).toBe('1');

    vi.stubEnv(ACCESS_REVOKED_BEFORE_ENV, at(1).toISOString());
    const revoked = await middleware(request(headers));
    expect(revoked.status).toBe(303);
    expect(pathAndQuery(revoked)).toBe('/pilot-access?reason=revoked');
  });

  const unusableSecrets: [string, string | undefined][] = [
    ['not set', undefined],
    ['blank', ''],
  ];
  it.each(unusableSecrets)('answers 503 naming the secret when the secret is %s, for a session it passes once the secret is set', async (_name, secret) => {
    const headers = { accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, at(-HOUR_MS)) };
    setUp({ secret: SECRET });

    const configured = await middleware(request(headers));
    expect(configured.status).toBe(200);
    expect(configured.headers.get('x-middleware-next')).toBe('1');

    vi.stubEnv(ACCESS_SECRET_ENV, secret);
    const response = await middleware(request(headers));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body.startsWith(NOT_CONFIGURED), 'the 503 begins with the first sentence').toBe(true);
    expectSecretDiagnostic(body);
  });

  it('reads the public origin under its own name, for each request: the 303 goes to the origin the variable holds, and to the new one once it changes', async () => {
    setUp({ secret: SECRET });
    const first = await middleware(request({ accept: BROWSER_ACCEPT }, LOCAL_DASHBOARD));
    expect(first.status).toBe(303);
    expect(first.headers.get('location')).toBe('https://gate.example.test/pilot-access?reason=no_session');

    vi.stubEnv(PUBLIC_ORIGIN_ENV, 'https://other-gate.example.test:8443');
    const second = await middleware(request({ accept: BROWSER_ACCEPT }, LOCAL_DASHBOARD));
    expect(second.headers.get('location')).toBe('https://other-gate.example.test:8443/pilot-access?reason=no_session');
  });

  it('answers 503 naming the public origin while it is not set, for a session it passes once the origin is set', async () => {
    const headers = { accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, at(-HOUR_MS)) };
    setUp({ secret: SECRET, publicOrigin: null });

    const unset = await middleware(request(headers, LOCAL_DASHBOARD));
    expect(unset.status).toBe(503);
    expectOriginDiagnostic(await unset.text());

    vi.stubEnv(PUBLIC_ORIGIN_ENV, PUBLIC_ORIGIN);
    const set = await middleware(request(headers, LOCAL_DASHBOARD));
    expect(set.status).toBe(200);
    expect(set.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('the 503 for an unusable configuration', () => {
  // Every request here carries the session cookie with a marker for its value, which no response may echo.
  const COOKIE_MARKER = 'cookie-marker-5b1e93';
  const sent = { accept: BROWSER_ACCEPT, cookie: `${ACCESS_COOKIE}=${COOKIE_MARKER}` };
  /** One millisecond later than the request time: a well-formed instant, and still a configuration problem. */
  const LATE = at(1).toISOString();

  const revocationMistakes: [string, string][] = [
    ['blank (whitespace)', '   '],
    ['a word, not an instant', 'soon-7f3a'],
    ['a date without a time', '2026-10-21'],
    ['an instant a millisecond later than the request time', LATE],
  ];
  it.each(revocationMistakes)('names the revocation setting, and does not ask for a new secret, when the secret is valid and the revocation value is %s', async (_name, revokedBefore) => {
    const response = await middlewareWith({ ...env, [ACCESS_REVOKED_BEFORE_ENV]: revokedBefore }, () => NOW)(request(sent));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body.startsWith(NOT_CONFIGURED), 'the 503 begins with the first sentence').toBe(true);
    expectRevocationDiagnostic(body);
    expect(body.split('\n'), 'the first sentence, then the one problem on a line of its own').toEqual([NOT_CONFIGURED, expect.stringContaining(ACCESS_REVOKED_BEFORE_ENV)]);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')?.split(',').map((name) => name.trim())).toContain('Cookie');
  });

  it('passes a session issued at the revocation instant when the request is at that instant, and revokes one issued a millisecond before: the equal instant is usable', async () => {
    const atTheCutoff = middlewareWith({ ...env, [ACCESS_REVOKED_BEFORE_ENV]: LATE }, () => at(1));

    const kept = await atTheCutoff(request({ accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, at(1)) }));
    expect(kept.status).toBe(200);
    expect(kept.headers.get('x-middleware-next')).toBe('1');

    const earlier = await atTheCutoff(request({ accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, NOW) }));
    expect(earlier.status).toBe(303);
    expect(pathAndQuery(earlier)).toBe('/pilot-access?reason=revoked');
  });

  const secretMistakes: [string, Record<string, string | undefined>][] = [
    ['unset', { ...SURFACE_ON, ...CONFIGURED_ORIGIN }],
    ['15 characters', { ...SURFACE_ON, ...CONFIGURED_ORIGIN, [ACCESS_SECRET_ENV]: FIFTEEN }],
  ];
  it.each(secretMistakes)('names the secret, and not the revocation setting, when the secret is %s and no revocation value is set: the control for the diagnostic above', async (_name, unusable) => {
    const response = await middlewareWith(unusable, () => NOW)(request(sent));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body.startsWith(NOT_CONFIGURED), 'the 503 begins with the first sentence').toBe(true);
    expectSecretDiagnostic(body);
  });

  /** Every 503 this block provokes, with the configured values it must not echo. Whitespace is not a marker, so the blank case has none of its own. */
  const every503: [string, Record<string, string | undefined>, string[]][] = [
    ['a blank revocation value', { ...env, [ACCESS_REVOKED_BEFORE_ENV]: '   ' }, [SECRET, PUBLIC_ORIGIN]],
    ['a revocation value that is a word', { ...env, [ACCESS_REVOKED_BEFORE_ENV]: 'soon-7f3a' }, [SECRET, PUBLIC_ORIGIN, 'soon-7f3a']],
    ['a revocation value that is a date alone', { ...env, [ACCESS_REVOKED_BEFORE_ENV]: '2026-10-21' }, [SECRET, PUBLIC_ORIGIN, '2026-10-21']],
    ['a revocation instant later than the request time', { ...env, [ACCESS_REVOKED_BEFORE_ENV]: LATE }, [SECRET, PUBLIC_ORIGIN, LATE]],
    ['no secret', { ...SURFACE_ON, ...CONFIGURED_ORIGIN }, [PUBLIC_ORIGIN]],
    ['a 15-character secret', { ...SURFACE_ON, ...CONFIGURED_ORIGIN, [ACCESS_SECRET_ENV]: FIFTEEN }, [PUBLIC_ORIGIN, FIFTEEN]],
    ['an origin with a path', { ...env, [PUBLIC_ORIGIN_ENV]: 'https://gate-7c41.example.test/p-3e9a' }, [SECRET, 'https://gate-7c41.example.test/p-3e9a']],
    ['an origin over plain http', { ...env, [PUBLIC_ORIGIN_ENV]: 'http://gate-5d2b.example.test' }, [SECRET, 'http://gate-5d2b.example.test']],
  ];
  it.each(every503)('holds no configured value and not the submitted cookie in the body or any header of the 503 for %s', async (_name, configured, values) => {
    const response = await middlewareWith(configured, () => NOW)(request(sent));
    expect(response.status).toBe(503);
    const everything = await everythingIn(response);
    for (const value of [...values, COOKIE_MARKER]) expect(everything, `the 503 echoes ${value}`).not.toContain(value);
  });

  it('is a scan that finds each of those values where it was sent and in a response that carries it, which is what makes the silence above mean something', async () => {
    // The request every case above sends carries the cookie marker, and each configuration carries the values its case looks for.
    expect(await everythingIn(request(sent))).toContain(COOKIE_MARKER);
    for (const [name, configured, values] of every503) {
      for (const value of values) expect(Object.values(configured), name).toContain(value);
    }
    // And the scan reads a header as well as the body.
    const leaking = new Response(`${SECRET} ${LATE} ${PUBLIC_ORIGIN}`, {
      headers: { 'x-leak': `${COOKIE_MARKER} soon-7f3a 2026-10-21 ${FIFTEEN} https://gate-7c41.example.test/p-3e9a http://gate-5d2b.example.test` },
    });
    const found = await everythingIn(leaking);
    for (const value of [SECRET, LATE, PUBLIC_ORIGIN, COOKIE_MARKER, 'soon-7f3a', '2026-10-21', FIFTEEN, 'https://gate-7c41.example.test/p-3e9a', 'http://gate-5d2b.example.test']) {
      expect(found, value).toContain(value);
    }
  });
});

describe('every response the middleware returns', () => {
  const outcomes: [string, () => Promise<Response>, number][] = [
    ['the 503 for an unconfigured gate', () => middlewareWith({ ...SURFACE_ON, ...CONFIGURED_ORIGIN }, () => NOW)(request({ accept: BROWSER_ACCEPT })), 503],
    ['the 503 for an unusable public origin', async () => middlewareWith({ ...SURFACE_ON, [ACCESS_SECRET_ENV]: SECRET }, () => NOW)(request({ accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, NOW) })), 503],
    ['the 303 to the access page', () => gate(request({ accept: BROWSER_ACCEPT })), 303],
    ['the 401 for a script', () => gate(request({ accept: 'application/json' })), 401],
    ['the pass-through of a valid session', async () => gate(request({ accept: BROWSER_ACCEPT, cookie: await cookieFor(SECRET, NOW) })), 200],
    // DP1 Task 7: a usable gate with no pilot switch in its record, so the 404 is the switch's.
    ['the 404 while the pilot surface is off', () => middlewareWith({ [ACCESS_SECRET_ENV]: SECRET, ...CONFIGURED_ORIGIN }, () => NOW)(request({ accept: BROWSER_ACCEPT })), 404],
  ];

  it.each(outcomes)('%s is private, uncacheable and varies on the cookie', async (_name, run, status) => {
    const response = await run();
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
  });
});

describe('the middleware module', () => {
  const SOURCE = fileURLToPath(new URL('../middleware.ts', import.meta.url));

  /** The module's code with its comments removed, so prose that names a forbidden module is not taken for importing it. */
  function code(): string {
    return readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  it('exports the function Next looks for, by the name Next looks for', () => {
    expect(typeof middleware).toBe('function');
  });

  it('matches exactly /dashboard/:path*, which leaves the access page and its API outside the gate', () => {
    expect(config.matcher).toEqual(['/dashboard/:path*']);
  });

  // DP1 Task 7 added the hosting-mode module, the pilot switch, to this list; it imports nothing (`hosting-mode.test.ts`).
  it('imports only next/server, the access module, the public-origin module and the hosting-mode module, so it can never reach a profile, the pack or the record', () => {
    const imported = [...code().matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
    expect(imported).toEqual(['@/lib/access', '@/lib/hosting-mode', '@/lib/public-origin', 'next/server']);
  });

  // Which key each read feeds is not visible here, because the set of names is the same either way round; the exported-middleware
  // cases above hold that, by setting one variable at a time. DP1 Task 7 added the pilot switch, read by name like the others.
  it('uses process.env only as static reads of the pilot switch, the two access variables and the public origin, each once, and never as a whole', () => {
    const reads = [...code().matchAll(/process\.env(?:\.\w+|\[|\b)/g)].map((match) => match[0]).sort();
    expect(reads).toEqual(['process.env.DATASTRATA_PILOT_GATE', `process.env.${ACCESS_REVOKED_BEFORE_ENV}`, `process.env.${ACCESS_SECRET_ENV}`, 'process.env.DATASTRATA_PUBLIC_ORIGIN'].sort());
  });

  it('builds no URL from the request: it reads neither the request URL nor nextUrl, which carry the hostname Next was started with', () => {
    const fromTheRequest = /\.url\b|\bnextUrl\b/;
    // The pattern, and the control that it matches the reads it is there to forbid, the one this module made before B3 among them.
    for (const read of ['new URL(plan.location, request.url)', 'request.nextUrl.origin', 'const { url } = request; req.url']) expect(read).toMatch(fromTheRequest);
    expect(code()).not.toMatch(fromTheRequest);
  });

  it('reads request headers only by the names cookie and accept, so no Host or X-Forwarded-* header can choose where a redirect goes', () => {
    const named = [...code().matchAll(/\.headers\s*\.\s*get\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1].toLowerCase()).sort();
    expect(named).toEqual(['accept', 'cookie']);
    expect([...code().matchAll(/\brequest\.headers\b/g)]).toHaveLength(2);
    const steering = /forwarded|['"]host['"]/i;
    for (const read of ["request.headers.get('x-forwarded-host')", "headers.get('Host')", "request.headers.get('X-Forwarded-Proto')"]) expect(read).toMatch(steering);
    expect(code()).not.toMatch(steering);
  });
});
