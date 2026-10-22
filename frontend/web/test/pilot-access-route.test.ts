/**
 * The pilot access sign-in page and its two route handlers — what they are held to.
 *
 * Stage 1a (2026-10-20). `/pilot-access` and `/api/pilot-access` are the only way to obtain a session, and they stand outside the
 * middleware on purpose: a gated sign-in page would redirect a refusal to a page that is itself refused. Nothing in front of the
 * sign-in handler catches its mistakes, so they are caught here. A wrong passphrase answered with a cookie, a limiter that is
 * skipped, or a cookie that lost an attribute would leave the gate open while every other test in the suite stayed green.
 *
 * The handler is held at four levels, each reaching a defect the level above cannot. `handleAccessRequest` is the decision, given
 * the environment, the instant, the key and the passphrase as values: every outcome it can give is seen here, with the limiter
 * recorded rather than replaced and the passphrase comparison witnessed rather than replaced, so a case can say that a refused
 * attempt was never compared. `accessRoute` and `signOutRoute` are the request-to-response path over injected values, which is
 * where the cookie header, the redirects, the body shapes, the status mapping and the log line are seen. The exported `POST` of
 * each route module is then driven with synthetic values (`vi.stubEnv` for the access variables and `NODE_ENV`, a fake `Date`
 * alone, a fresh module per case so each starts with an empty limiter), because the wiring of a route file (the clock it reads,
 * the variable each value comes from, the key it hands the limiter) is not reachable from the factory: a route file may export
 * nothing but its handlers and segment config. The last block reads the source, for what only the source can show: the imports,
 * the header and environment reads, and the page, which this suite cannot import. It is a `.tsx` module and the site's tsconfig
 * leaves JSX to Next (`jsx: preserve`), so the runner is not set up to transform one and no other test imports one; its one pure
 * function, `accessReasonMessage`, is tested directly and the markup is held by its source.
 *
 * Every refusal is paired with the pass one step away from it, because a handler that refused everyone would satisfy every
 * refusal case and one that accepted everyone would satisfy every pass case (evidence standard, failure modes 5 and 7): the wrong
 * passphrase beside the right one on the same route, the fifteenth minute beside the millisecond after it, an unusable
 * configuration beside the same attempt once it is fixed, a refusal that logs beside a success that does not. The properties the
 * plan names are what the cases are written to catch: a wrong passphrase that gets the success outcome (the 401 and "no
 * Set-Cookie" cases), a limiter check that is gone (the 429 cases), `Secure` forced on (the plain-HTTP cookie cases) and a
 * limiter keyed on a client-written address (the spoofed-address cases, with every address header a proxy-aware server might
 * trust). Three things the plan does not name are held too. The design's "five in fifteen minutes" is false without two of them:
 * attempts that arrive together are compared one at a time, so a burst cannot test more than five passphrases in a window, and an
 * attempt refused for the limit is not itself counted, so the lock ends fifteen minutes after the failures that caused it ("for up
 * to fifteen minutes", design section 5). The third is what a browser sees: the plan's 401, 429 and 503 are what a script is
 * answered, and a client that accepts HTML is sent back to the access page with the reason by a relative 303, by the rule the
 * middleware already uses, because a browser handed a bare 401 after a form post shows a blank page and the page's sentences for
 * `refused`, `limited` and `unconfigured` could otherwise never be reached.
 *
 * Expected values are literals, not computed from the code under test: the cookie strings, the redirect targets, the JSON bodies,
 * the sentences and the log line. Sessions are checked with the access module's own `verifyAccessToken`, which has its own oracle
 * in `access.test.ts`, so the token's validity does not rest on the handler agreeing with itself (failure mode 1).
 *
 * A revocation instant later than the request time is a configuration problem (final review, 2026-10-21), judged by the rule the
 * gate uses (`readAccessConfigAt`) at the attempt's own instant: the right passphrase is answered 503, a browser is sent to
 * `unconfigured`, no cookie is set and the limiter is neither asked nor charged. Without the rule, sign-in issued a session the
 * gate then refused as revoked, a loop that lasted until the instant passed. Beside it is the equal instant, which is usable: the
 * session issued at it is allowed by `accessDecision` at that instant, and one issued a millisecond earlier is revoked.
 *
 * A body too large to be a sign-in (pilot readiness B4, 2026-10-22) is refused before anything else is decided: 413 and
 * `{"error":"too_large"}` to a script, a relative 303 to `too_large` to a browser, no cookie, and neither the configuration, the
 * limiter nor the comparison reached. "Not charged" is paired with the wrong passphrase that fits, which the same route does ask
 * about, compare and charge; through the exported `POST`, six oversize posts leave the next wrong passphrase answered 401 where six
 * failures would have answered it 429. The declared path is shown unread by a stream that records its pulls, beside the same
 * stream pulled and signed in at exactly 4096 bytes.
 *
 * An unusable public origin (pilot readiness B3, 2026-10-22) is answered as an unconfigured gate, first of all: 503 and
 * `{"error":"unconfigured"}` to a script, a relative 303 to `unconfigured` to a browser, no cookie, the body never pulled, the
 * limiter neither asked nor charged and nothing compared, beside the same recorded request signed in once the origin is usable. A
 * body too large is answered 503 while the origin is unusable and 413 once it is usable. Through the exported `POST`, posts
 * refused for the origin leave the next wrong passphrase answered 401, not 429. Every configured environment in this file carries
 * a usable origin, `https://gate.example.test`, so a case about the secret, the limiter or the body still reaches what it is about;
 * where a case means an unconfigured secret, the origin is set and only the secret is missing. The sign-in's own redirects stay
 * relative: route handlers pass `Location` through untouched (investigation B3.2), so the origin decides whether sign-in is open,
 * not where it sends anyone.
 *
 * A cross-site post (pilot readiness B2, 2026-10-22) is refused on both routes: 403 and `{"error":"cross_site"}` to a script, a
 * relative 303 to `cross_site` to a browser, and no cookie, so a sign-out from another site clears nothing. It is cross-site by
 * `Origin` alone, by `Sec-Fetch-Site` alone, or by both as a current browser sends them, and each request first shows it carries
 * the headers its row names, so a platform that dropped them could not pass a row vacuously. Every refusal stands beside the same
 * request from the site, with `Origin` and `Sec-Fetch-Site: same-origin`, and beside the request with neither header that scripts
 * send, both of which go through. Sign-in judges the post after the origin and before the body: the recorded stream is never
 * pulled, the limiter is neither asked nor charged and nothing is compared, beside the same recorded stream pulled, asked, charged
 * and compared when it comes from the site. Through the exported `POST`, six cross-site posts leave the next wrong passphrase from
 * the site answered 401, not 429. Sign-out is judged against the origin it reads by name; with an unusable one, a browser's
 * `Sec-Fetch-Site: same-origin` still signs out and an `Origin` without it is refused. The verdict itself is tested row by row,
 * directly, in `public-origin.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_REVOKED_BEFORE_ENV,
  ACCESS_SECRET_ENV,
  AttemptLimiter,
  accessDecision,
  issueAccessToken,
  verifyAccessToken,
  type AccessDecision,
  type CookieAttributes,
} from '@/lib/access';
import {
  SHARED_LIMITER_KEY,
  accessReasonMessage,
  accessRoute,
  handleAccessRequest,
  handleSignOut,
  randomNonce,
  readPassphrase,
  serialiseCookie,
  signOutRoute,
  type AccessInput,
  type AccessOutcome,
  type AccessRouteDeps,
} from '@/lib/pilot-access-handler';
import { PUBLIC_ORIGIN_ENV } from '@/lib/public-origin';

/**
 * Every passphrase the handler compares with the secret, recorded. The real comparison is called through unchanged: this is a
 * witness, not a substitute. It exists for the one assertion an outcome cannot make, that a refused attempt was refused before its
 * passphrase was compared. A handler that compared first and consulted the limiter afterwards answers every case here the same way
 * and differs only in what an attacker could learn from the time it took.
 */
const witness = vi.hoisted(() => ({ compared: [] as string[] }));

vi.mock('@/lib/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/access')>();
  return {
    ...actual,
    passphraseMatches: (submitted: string, secret: string) => {
      witness.compared.push(submitted);
      return actual.passphraseMatches(submitted, secret);
    },
  };
});

const SECRET = 'correct horse battery staple';
const OTHER_SECRET = 'battery staple horse correct';
const FIFTEEN = 'fifteen-chars!!';
const WRONG = 'wrong passphrase 9f3c71';
const NOW = new Date('2026-10-20T12:00:00.000Z');
const SESSION_MS = 43_200_000;
const WINDOW_MS = 900_000;
const NONCE = 'n0nce-0123456789abcdef';
const ORIGIN = 'http://127.0.0.1:3000';
const ACCESS_URL = `${ORIGIN}/api/pilot-access`;
const SIGN_OUT_URL = `${ORIGIN}/api/pilot-access/sign-out`;
const HTTPS_ACCESS_URL = 'https://pilot.example.test/api/pilot-access';
const HTTPS_SIGN_OUT_URL = 'https://pilot.example.test/api/pilot-access/sign-out';
/** What a browser sends when a form is submitted. */
const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';
/** Everything after the token in the session cookie of a plain-HTTP loopback request: the attributes the design states, and no `Secure`. */
const COOKIE_TAIL = '; Path=/dashboard; Max-Age=43200; HttpOnly; SameSite=Strict';
/** The session cookie as sign-out clears it: the same name and path, empty, expired. */
const CLEARED_COOKIE = 'ds_pilot_access=; Path=/dashboard; Max-Age=0; HttpOnly; SameSite=Strict';
const REFUSAL_BODIES: Record<401 | 403 | 429 | 503, string> = {
  401: '{"error":"refused"}',
  403: '{"error":"cross_site"}',
  429: '{"error":"limited"}',
  503: '{"error":"unconfigured"}',
};
/** Whether the request is HTTPS, whether the deployment is production, and whether the cookie is therefore Secure. */
const TRANSPORTS: [boolean, boolean, boolean][] = [
  [false, false, false],
  [true, false, true],
  [false, true, true],
  [true, true, true],
];

/** The configured public origin: a reserved test name. The sign-in's redirects stay relative, so it only has to be usable. */
const PUBLIC_ORIGIN = 'https://gate.example.test';
/** The variable alone, set to the origin above: an environment whose secret is not configured but whose origin is. */
const CONFIGURED_ORIGIN = { [PUBLIC_ORIGIN_ENV]: PUBLIC_ORIGIN };
const ENV = { [ACCESS_SECRET_ENV]: SECRET, ...CONFIGURED_ORIGIN };

/** Another site, whose pages post to the gate in the cross-site cases. */
const EVIL_ORIGIN = 'https://evil.example';
/** What a browser sends with a form post from the configured origin itself. */
const FROM_THE_SITE = { origin: PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' };
/** A post from another site, by each header alone and by both as a current browser sends them. */
const CROSS_SITE: [string, Record<string, string>][] = [
  ['by Origin alone', { origin: EVIL_ORIGIN }],
  ['by Sec-Fetch-Site alone', { 'sec-fetch-site': 'cross-site' }],
  ['by both, as a current browser sends them', { origin: EVIL_ORIGIN, 'sec-fetch-site': 'cross-site' }],
];
/** Every way a post that goes through can come: what a browser sends from the site, each header alone, and neither, the compatibility exception scripts rely on. */
const SAME_SITE: [string, Record<string, string>][] = [
  ['with Origin and Sec-Fetch-Site: same-origin', FROM_THE_SITE],
  ['with Origin alone', { origin: PUBLIC_ORIGIN }],
  ['with Sec-Fetch-Site: same-origin alone', { 'sec-fetch-site': 'same-origin' }],
  ['with neither header', {}],
];

/** That `request` really carries each header its case names, so a header the platform dropped cannot make a case pass vacuously. */
function expectCarries(request: Request, headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) expect(request.headers.get(name), `the request carries ${name}`).toBe(value);
}

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

/** An attempt at the right passphrase over plain-HTTP loopback at `NOW`, with the fields in `overrides` replaced. */
function attempt(overrides: Partial<AccessInput> = {}): AccessInput {
  return { env: ENV, now: NOW, clientKey: SHARED_LIMITER_KEY, passphrase: SECRET, https: false, production: false, nonce: NONCE, ...overrides };
}

/**
 * The real limiter, with every question it was asked and every failure it was told of written down; it still decides. The fields
 * are named so as not to collide with the base class's own private state.
 */
class RecordingLimiter extends AttemptLimiter {
  readonly asked: { key: string; at: number }[] = [];
  readonly recorded: { key: string; at: number }[] = [];

  override allowed(key: string, now: Date): boolean {
    this.asked.push({ key, at: now.getTime() });
    return super.allowed(key, now);
  }

  override recordFailure(key: string, now: Date): void {
    this.recorded.push({ key, at: now.getTime() });
    super.recordFailure(key, now);
  }
}

function formPost(passphrase: string, headers: Record<string, string> = {}, url = ACCESS_URL): Request {
  return new Request(url, { method: 'POST', body: new URLSearchParams({ passphrase }), headers });
}

function jsonPost(body: string, headers: Record<string, string> = {}, url = ACCESS_URL): Request {
  return new Request(url, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });
}

function multipartPost(passphrase: string, url = ACCESS_URL): Request {
  const body = new FormData();
  body.set('passphrase', passphrase);
  return new Request(url, { method: 'POST', body });
}

/** A url-encoded sign-in of exactly `bytes` bytes: the passphrase field, then padding in a field the handler does not read. */
function paddedForm(passphrase: string, bytes: number): string {
  const head = `${new URLSearchParams({ passphrase })}&pad=`;
  if (head.length > bytes) throw new Error(`a sign-in for this passphrase needs more than ${bytes} bytes`);
  return `${head}${'x'.repeat(bytes - head.length)}`;
}

/** A form post of `bytes` bytes that declares no length, so only the streamed count can find it too large. */
function streamedPost(passphrase: string, bytes: number, headers: Record<string, string> = {}): Request {
  return new Request(ACCESS_URL, {
    method: 'POST',
    body: paddedForm(passphrase, bytes),
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
  });
}

/**
 * A form post of `bytes` bytes that declares its true length, over a stream handed out a chunk per pull with every pull written
 * down. The high-water mark of zero means nothing is pulled before a read, so a count of zero says the body was never read.
 */
function declaredPost(passphrase: string, bytes: number, headers: Record<string, string> = {}) {
  const body = new TextEncoder().encode(paddedForm(passphrase, bytes));
  const record = { pulls: 0 };
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        record.pulls += 1;
        if (offset >= body.byteLength) {
          controller.close();
          return;
        }
        controller.enqueue(body.slice(offset, offset + 1024));
        offset += 1024;
      },
    },
    { highWaterMark: 0 },
  );
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    body: stream,
    duplex: 'half',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': String(bytes), ...headers },
  };
  return { request: new Request(ACCESS_URL, init), record };
}

/** The token and the attributes of the one cookie a success carries; a missing, doubled or misnamed `Set-Cookie` fails here, by name. */
function sessionOf(response: Response): { token: string; attributes: string } {
  const cookies = response.headers.getSetCookie();
  if (cookies.length !== 1) throw new Error(`expected exactly one Set-Cookie and found ${cookies.length}`);
  const match = /^ds_pilot_access=([^;]+)(;.*)$/.exec(cookies[0]);
  if (match === null) throw new Error('the Set-Cookie header is not a ds_pilot_access cookie with a value');
  return { token: match[1], attributes: match[2] };
}

async function tokenOf(outcome: AccessOutcome): Promise<string> {
  if (outcome.status !== 303) throw new Error(`expected a session and got status ${outcome.status}`);
  return outcome.cookie.value;
}

/** A different claimed client on every call, in every header a proxy-aware server might read the client's address from. */
function claimingToBe(n: number): Record<string, string> {
  return {
    'x-forwarded-for': `203.0.113.${n}`,
    'x-real-ip': `198.51.100.${n}`,
    forwarded: `for=192.0.2.${n}`,
    'cf-connecting-ip': `203.0.113.${100 + n}`,
    'true-client-ip': `198.51.100.${100 + n}`,
    'x-client-ip': `192.0.2.${100 + n}`,
    'fastly-client-ip': `203.0.113.${200 + n}`,
    'x-cluster-client-ip': `198.51.100.${200 + n}`,
  };
}

/** The access route over injected values: the secret in `ENV`, the clock at `NOW`, a recording limiter, a fixed nonce, plain-HTTP mode. */
function routeWith(overrides: Partial<Omit<AccessRouteDeps, 'limiter'>> = {}) {
  const limiter = new RecordingLimiter();
  const route = accessRoute({ env: () => ENV, now: () => NOW, limiter, nonce: () => NONCE, production: () => false, ...overrides });
  return { route, limiter };
}

/** Every header and the body of a response, as one string to search. */
const everythingIn = async (response: Response): Promise<string> => `${JSON.stringify([...response.headers.entries()])}\n${await response.text()}`;

/** Five wrong attempts through `route`, which lock the shared key. */
async function lockOut(route: (request: Request) => Promise<Response>, headers: Record<string, string> = {}): Promise<void> {
  for (let i = 0; i < 5; i += 1) expect((await route(formPost(WRONG, headers))).status).toBe(401);
}

beforeEach(() => {
  witness.compared.length = 0;
  // Every refusal logs a line by design. The cases that read the log read this spy; the rest keep the test output clean.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('handleAccessRequest', () => {
  it('answers 503 under an unusable configuration, even to the passphrase that would have matched, and neither consults nor charges the limiter', async () => {
    const unusable: [string, Record<string, string | undefined>][] = [
      ['no secret', CONFIGURED_ORIGIN],
      ['a blank secret', { ...CONFIGURED_ORIGIN, [ACCESS_SECRET_ENV]: '   ' }],
      ['a 15-character secret', { ...CONFIGURED_ORIGIN, [ACCESS_SECRET_ENV]: FIFTEEN }],
      ['a revocation instant that is not an instant', { ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: 'soon' }],
    ];
    for (const [name, env] of unusable) {
      witness.compared.length = 0;
      const limiter = new RecordingLimiter();
      // The passphrase equals the secret wherever one is set, so only the refusal of the configuration can account for the 503.
      const passphrase = env[ACCESS_SECRET_ENV] ?? SECRET;
      await expect(handleAccessRequest(attempt({ env, passphrase }), limiter), name).resolves.toStrictEqual({ status: 503 });
      expect(limiter.asked, name).toEqual([]);
      expect(limiter.recorded, name).toEqual([]);
      expect(witness.compared, name).toEqual([]);
    }

    // The control: the same attempt under a usable configuration reaches the limiter, is compared and is accepted.
    witness.compared.length = 0;
    const limiter = new RecordingLimiter();
    const usable = { ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: '2026-10-19T00:00:00Z' };
    expect((await handleAccessRequest(attempt({ env: usable }), limiter)).status).toBe(303);
    expect(limiter.asked).toHaveLength(1);
    expect(witness.compared).toEqual([SECRET]);
  });

  it('answers 503 to the right passphrase when the revocation instant is a millisecond later than the attempt, and neither consults nor charges the limiter nor compares the passphrase', async () => {
    const limiter = new RecordingLimiter();
    const late = { ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: at(1).toISOString() };
    await expect(handleAccessRequest(attempt({ env: late }), limiter)).resolves.toStrictEqual({ status: 503 });
    expect(limiter.asked).toEqual([]);
    expect(limiter.recorded).toEqual([]);
    expect(witness.compared).toEqual([]);
  });

  it('accepts the right passphrase when the revocation instant equals the attempt\'s instant, and the gate allows that session at that instant; one issued a millisecond earlier is revoked', async () => {
    const limiter = new RecordingLimiter();
    const cutoffNow = { ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: NOW.toISOString() };
    const token = await tokenOf(await handleAccessRequest(attempt({ env: cutoffNow }), limiter));
    // The positive control for the case above: this attempt did reach the limiter and the comparison.
    expect(limiter.asked).toEqual([{ key: 'local', at: NOW.getTime() }]);
    expect(witness.compared).toEqual([SECRET]);

    await expect(accessDecision({ env: cutoffNow, cookieHeader: `ds_pilot_access=${token}`, now: NOW })).resolves.toEqual({
      kind: 'allowed',
      expiresAt: at(SESSION_MS),
    });
    const earlier = await issueAccessToken(SECRET, at(-1), NONCE);
    await expect(accessDecision({ env: cutoffNow, cookieHeader: `ds_pilot_access=${earlier}`, now: NOW })).resolves.toEqual({
      kind: 'denied',
      reason: 'revoked',
    });
  });

  const wrongPassphrases: [string, string | null][] = [
    ['a different phrase', WRONG],
    ['a near miss that differs in one character', 'correct horse battery stapla'],
    ['the secret with a trailing space', `${SECRET} `],
    ['an empty string', ''],
    ['no passphrase at all', null],
  ];
  it.each(wrongPassphrases)('answers 401 to %s, charges the limiter once against the key it was handed, and issues nothing', async (_name, passphrase) => {
    const limiter = new RecordingLimiter();
    const outcome = await handleAccessRequest(attempt({ passphrase, clientKey: 'client-a' }), limiter);
    expect(outcome).toStrictEqual({ status: 401 });
    expect(limiter.recorded).toEqual([{ key: 'client-a', at: NOW.getTime() }]);
  });

  it('answers 303 to /dashboard with the session cookie for the right passphrase, and charges the limiter nothing', async () => {
    const limiter = new RecordingLimiter();
    const outcome = await handleAccessRequest(attempt(), limiter);
    expect(outcome).toEqual({
      status: 303,
      location: '/dashboard',
      cookie: { name: 'ds_pilot_access', value: expect.any(String), httpOnly: true, sameSite: 'strict', path: '/dashboard', maxAge: 43200, secure: false },
    });
    expect(limiter.asked).toEqual([{ key: 'local', at: NOW.getTime() }]);
    expect(limiter.recorded).toEqual([]);
  });

  it('issues a token that verifies under the configured secret for the instant of the request, for twelve hours, and under no other secret', async () => {
    const token = await tokenOf(await handleAccessRequest(attempt(), new AttemptLimiter()));
    expect(token.split('.')[3]).toBe(NONCE);
    await expect(verifyAccessToken(token, SECRET, NOW, null)).resolves.toEqual({ ok: true, issuedAt: NOW, expiresAt: at(SESSION_MS) });
    await expect(verifyAccessToken(token, SECRET, at(SESSION_MS - 1), null)).resolves.toMatchObject({ ok: true });
    await expect(verifyAccessToken(token, SECRET, at(SESSION_MS), null)).resolves.toEqual({ ok: false, reason: 'expired' });
    await expect(verifyAccessToken(token, OTHER_SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'bad_signature' });
  });

  it.each(TRANSPORTS)('sets Secure from the request: https=%s and production=%s give secure=%s', async (https, production, secure) => {
    const outcome = await handleAccessRequest(attempt({ https, production }), new AttemptLimiter());
    expect(outcome.status).toBe(303);
    if (outcome.status === 303) expect(outcome.cookie.secure).toBe(secure);
  });

  it('compares the passphrase exactly as submitted: a secret with padding is matched with its padding and not without it', async () => {
    const padded = '  spaced secret phrase  ';
    const env = { [ACCESS_SECRET_ENV]: padded };
    expect((await handleAccessRequest(attempt({ env, passphrase: padded }), new AttemptLimiter())).status).toBe(303);
    expect((await handleAccessRequest(attempt({ env, passphrase: padded.trim() }), new AttemptLimiter())).status).toBe(401);
  });

  const hostile: [string, string][] = [
    ['a lone surrogate', '\uD800'],
    ['a NUL', '\u0000'],
    ['a hundred thousand characters', 'x'.repeat(100_000)],
  ];
  it.each(hostile)('answers 401, and does not throw, for %s', async (_name, passphrase) => {
    await expect(handleAccessRequest(attempt({ passphrase }), new AttemptLimiter())).resolves.toStrictEqual({ status: 401 });
  });

  it('refuses the sixth attempt within the window with 429 before comparing it, the right passphrase included, and does not count that refusal', async () => {
    const limiter = new RecordingLimiter();
    for (let i = 0; i < 5; i += 1) {
      await expect(handleAccessRequest(attempt({ now: at(i * 1000), passphrase: WRONG }), limiter)).resolves.toStrictEqual({ status: 401 });
    }
    // The first five were compared, one each: the witness sees the comparison happen, so its silence below means something.
    expect(witness.compared).toEqual(Array.from({ length: 5 }, () => WRONG));

    await expect(handleAccessRequest(attempt({ now: at(5000) }), limiter)).resolves.toStrictEqual({ status: 429 });
    await expect(handleAccessRequest(attempt({ now: at(5001), passphrase: WRONG }), limiter)).resolves.toStrictEqual({ status: 429 });
    expect(witness.compared).toHaveLength(5);
    expect(limiter.recorded).toHaveLength(5);
  });

  it('lets the same right passphrase in again the millisecond after the oldest failure leaves the window, and not a millisecond before', async () => {
    const limiter = new RecordingLimiter();
    for (let i = 0; i < 5; i += 1) await handleAccessRequest(attempt({ now: at(i * 1000), passphrase: WRONG }), limiter);
    await expect(handleAccessRequest(attempt({ now: at(WINDOW_MS) }), limiter)).resolves.toStrictEqual({ status: 429 });
    expect((await handleAccessRequest(attempt({ now: at(WINDOW_MS + 1) }), limiter)).status).toBe(303);
  });

  it('does not extend the lock by refusing attempts during it: five more attempts late in the window change when it ends by nothing', async () => {
    const limiter = new RecordingLimiter();
    for (let i = 0; i < 5; i += 1) await handleAccessRequest(attempt({ passphrase: WRONG }), limiter);
    for (let i = 0; i < 5; i += 1) {
      await expect(handleAccessRequest(attempt({ now: at(840_000), passphrase: WRONG }), limiter)).resolves.toStrictEqual({ status: 429 });
    }
    expect(limiter.recorded).toHaveLength(5);
    expect((await handleAccessRequest(attempt({ now: at(WINDOW_MS + 1) }), limiter)).status).toBe(303);
  });

  it('answers 503 rather than 429 to an unconfigured gate that has failures on record, and 429 again once it is configured', async () => {
    const limiter = new RecordingLimiter();
    for (let i = 0; i < 5; i += 1) await handleAccessRequest(attempt({ passphrase: WRONG }), limiter);
    const askedBefore = limiter.asked.length;
    await expect(handleAccessRequest(attempt({ env: CONFIGURED_ORIGIN, now: at(1) }), limiter)).resolves.toStrictEqual({ status: 503 });
    expect(limiter.asked).toHaveLength(askedBefore);
    await expect(handleAccessRequest(attempt({ now: at(2) }), limiter)).resolves.toStrictEqual({ status: 429 });
  });

  it('counts the limit per key, so the key the caller hands it is what an attacker would have to vary', async () => {
    const limiter = new AttemptLimiter();
    for (let i = 0; i < 5; i += 1) await handleAccessRequest(attempt({ clientKey: 'a', passphrase: WRONG }), limiter);
    await expect(handleAccessRequest(attempt({ clientKey: 'a' }), limiter)).resolves.toStrictEqual({ status: 429 });
    expect((await handleAccessRequest(attempt({ clientKey: 'b' }), limiter)).status).toBe(303);
  });

  it('compares at most five passphrases in a window even when they all arrive together: twenty wrong ones and then the right one are five 401s and sixteen 429s', async () => {
    const limiter = new AttemptLimiter();
    const passphrases = [...Array.from({ length: 20 }, () => WRONG), SECRET];
    const outcomes = await Promise.all(passphrases.map((passphrase) => handleAccessRequest(attempt({ passphrase }), limiter)));
    expect(outcomes.map((outcome) => outcome.status)).toEqual([401, 401, 401, 401, 401, ...Array.from({ length: 16 }, () => 429)]);
    expect(outcomes.filter((outcome) => outcome.status === 303)).toEqual([]);
    // Five passphrases were compared, however many arrived: the sixteen refused were never tested against the secret.
    expect(witness.compared).toEqual(Array.from({ length: 5 }, () => WRONG));
  });

  it('keeps taking turns after an attempt throws: a nonce the token cannot carry fails that attempt alone', async () => {
    const limiter = new AttemptLimiter();
    await expect(handleAccessRequest(attempt({ nonce: 'not a nonce' }), limiter)).rejects.toThrow(RangeError);
    expect((await handleAccessRequest(attempt(), limiter)).status).toBe(303);
  });
});

describe('handleSignOut', () => {
  it('goes to the access page with the cookie emptied and expired on the name and path it was set under', () => {
    expect(handleSignOut({ https: false, production: false })).toEqual({
      status: 303,
      location: '/pilot-access',
      cookie: { name: 'ds_pilot_access', value: '', httpOnly: true, sameSite: 'strict', path: '/dashboard', maxAge: 0, secure: false },
    });
  });

  it.each(TRANSPORTS)('clears Secure by the same rule as setting it: https=%s and production=%s give secure=%s', (https, production, secure) => {
    expect(handleSignOut({ https, production }).cookie.secure).toBe(secure);
  });
});

describe('serialiseCookie', () => {
  const session: CookieAttributes = { name: 'ds_pilot_access', value: 'tok.en', httpOnly: true, sameSite: 'strict', path: '/dashboard', maxAge: 43200, secure: false };

  it('writes name=value, Path, Max-Age, HttpOnly and SameSite=Strict in that order, without Secure when the cookie is not secure', () => {
    expect(serialiseCookie(session)).toBe('ds_pilot_access=tok.en; Path=/dashboard; Max-Age=43200; HttpOnly; SameSite=Strict');
  });

  it('appends Secure, last, exactly when the cookie is secure', () => {
    expect(serialiseCookie({ ...session, secure: true })).toBe('ds_pilot_access=tok.en; Path=/dashboard; Max-Age=43200; HttpOnly; SameSite=Strict; Secure');
  });

  it('writes the cleared cookie with an empty value and Max-Age=0', () => {
    expect(serialiseCookie({ ...session, value: '', maxAge: 0 })).toBe('ds_pilot_access=; Path=/dashboard; Max-Age=0; HttpOnly; SameSite=Strict');
    expect(serialiseCookie({ ...session, value: '', maxAge: 0, secure: true })).toBe('ds_pilot_access=; Path=/dashboard; Max-Age=0; HttpOnly; SameSite=Strict; Secure');
  });
});

describe('accessReasonMessage', () => {
  type DeniedReason = Extract<AccessDecision, { kind: 'denied' }>['reason'];

  /** What the middleware sends a refused browser here with. Keyed by the access module's own reasons, so a sixth is a type error until it has a sentence. */
  const FROM_THE_MIDDLEWARE: Record<DeniedReason, string> = {
    no_session: 'Enter the passphrase to open the dashboard.',
    expired: 'That session has ended. Sessions last 12 hours. Enter the passphrase to start a new one.',
    revoked: 'That session is no longer accepted. Enter the passphrase to start a new one.',
    bad_signature: 'That session was not accepted. Enter the passphrase to start a new one.',
    malformed: 'That session could not be read. Enter the passphrase to start a new one.',
  };
  /** What the sign-in route sends a refused browser back with. */
  const FROM_THE_ROUTE = {
    refused: 'That passphrase was not accepted.',
    limited: 'Too many passphrases were refused. Wait fifteen minutes, then try again.',
    unconfigured: 'Pilot access is not configured on this server, so no passphrase can be accepted.',
    too_large: 'That request was too large to be a sign-in.',
    cross_site: 'That request did not come from this site, so it was refused.',
  };
  const SENTENCES: [string, string][] = [...Object.entries(FROM_THE_MIDDLEWARE), ...Object.entries(FROM_THE_ROUTE)];

  it.each(SENTENCES)('says the sentence for %s', (reason, sentence) => {
    expect(accessReasonMessage(reason)).toBe(sentence);
  });

  it('knows exactly the ten reasons the gate and the two routes send, and says a different sentence for each', () => {
    expect(SENTENCES).toHaveLength(10);
    expect(new Set(SENTENCES.map(([, sentence]) => sentence)).size).toBe(10);
  });

  it('tells a refused passphrase to wait fifteen minutes only when the limit is what refused it', () => {
    expect(accessReasonMessage('limited')).toContain('fifteen minutes');
    expect(accessReasonMessage('refused')).not.toContain('fifteen minutes');
  });

  const arbitrary: [string, string | undefined][] = [
    ['a missing reason', undefined],
    ['an empty string', ''],
    ['a reason the gate does not send', 'denied'],
    ['a known reason in capitals', 'EXPIRED'],
    ['a known reason with padding', ' expired'],
    ['markup', '<script>alert(1)</script>'],
    ['text that would read as an instruction', 'Your account has been closed, call 0800 000 000'],
    ['a name every object inherits', 'constructor'],
    ['another inherited name', 'toString'],
    ['the prototype key', '__proto__'],
    ['hasOwnProperty', 'hasOwnProperty'],
  ];
  it.each(arbitrary)('gives null, and echoes nothing, for %s', (_name, reason) => {
    expect(accessReasonMessage(reason)).toBeNull();
  });
});

describe('readPassphrase', () => {
  const urlencoded = (body: string, type = 'application/x-www-form-urlencoded') =>
    new Request(ACCESS_URL, { method: 'POST', body, headers: { 'content-type': type } });

  it('reads the passphrase field of a url-encoded form, decoding it, and keeps what it was given', async () => {
    await expect(readPassphrase(urlencoded('passphrase=correct+horse%20battery%26staple'))).resolves.toBe('correct horse battery&staple');
    await expect(readPassphrase(formPost('pässphräse ✓'))).resolves.toBe('pässphräse ✓');
    await expect(readPassphrase(formPost('  padded  '))).resolves.toBe('  padded  ');
  });

  it('reads the passphrase field of a multipart form', async () => {
    await expect(readPassphrase(multipartPost('from a multipart form'))).resolves.toBe('from a multipart form');
  });

  it('reads the passphrase property of a JSON object, whatever the case or parameters of its media type', async () => {
    await expect(readPassphrase(jsonPost('{"passphrase":"from json"}'))).resolves.toBe('from json');
    await expect(readPassphrase(jsonPost('{"passphrase":"from json"}', { 'content-type': 'Application/JSON; charset=utf-8' }))).resolves.toBe('from json');
  });

  const unusable: [string, () => Request][] = [
    ['a form without the field', () => urlencoded('other=1')],
    ['an empty form', () => urlencoded('')],
    ['a multipart form without the field', () => { const body = new FormData(); body.set('other', '1'); return new Request(ACCESS_URL, { method: 'POST', body }); }],
    ['a file in the field', () => { const body = new FormData(); body.set('passphrase', new File(['x'], 'x.txt')); return new Request(ACCESS_URL, { method: 'POST', body }); }],
    ['JSON that does not parse', () => jsonPost('{"passphrase":')],
    ['an empty JSON body', () => jsonPost('')],
    ['JSON that is a string', () => jsonPost('"correct horse battery staple"')],
    ['JSON that is an array', () => jsonPost('["correct horse battery staple"]')],
    ['JSON null', () => jsonPost('null')],
    ['JSON without the property', () => jsonPost('{"other":"x"}')],
    ['a number in the property', () => jsonPost('{"passphrase":42}')],
    ['null in the property', () => jsonPost('{"passphrase":null}')],
    ['an array in the property', () => jsonPost('{"passphrase":["a"]}')],
    ['an object in the property', () => jsonPost('{"passphrase":{"a":"b"}}')],
    ['a multipart body that is not one', () => urlencoded('garbage', 'multipart/form-data')],
    ['plain text, which is not a form', () => new Request(ACCESS_URL, { method: 'POST', body: 'passphrase=correct horse' })],
    ['JSON sent as a form', () => urlencoded('{"passphrase":"x"}')],
    ['no body and no media type', () => new Request(ACCESS_URL, { method: 'POST' })],
  ];
  it.each(unusable)('gives null, and does not throw, for %s', async (_name, build) => {
    await expect(readPassphrase(build())).resolves.toBeNull();
  });
});

describe('randomNonce', () => {
  it('is 22 base64url characters, which the token format carries', async () => {
    const nonce = randomNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const token = await tokenOf(await handleAccessRequest(attempt({ nonce }), new AttemptLimiter()));
    expect(token.split('.')[3]).toBe(nonce);
  });

  it('differs from one call to the next', () => {
    const drawn = new Set(Array.from({ length: 200 }, () => randomNonce()));
    expect(drawn.size).toBe(200);
  });
});

describe('accessRoute', () => {
  it('answers a form post of the right passphrase with 303 to /dashboard and the session cookie, HttpOnly and SameSite=Strict, with no Secure over plain HTTP', async () => {
    const { route } = routeWith();
    const response = await route(formPost(SECRET));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/dashboard');
    const { token, attributes } = sessionOf(response);
    expect(attributes).toBe(COOKIE_TAIL);
    expect(attributes).not.toContain('Secure');
    expect(token.split('.')[3]).toBe(NONCE);
    await expect(verifyAccessToken(token, SECRET, NOW, null)).resolves.toEqual({ ok: true, issuedAt: NOW, expiresAt: at(SESSION_MS) });
    expect(await response.text()).toBe('');
  });

  it('answers a wrong passphrase with 401, the refusal body and no redirect, where the right one on the same route is answered 303', async () => {
    const { route } = routeWith();
    const refused = await route(formPost(WRONG));
    expect(refused.status).toBe(401);
    expect(refused.headers.get('location')).toBeNull();
    expect(refused.headers.get('content-type')).toBe('application/json');
    expect(await refused.text()).toBe(REFUSAL_BODIES[401]);

    expect((await route(formPost(SECRET))).status).toBe(303);
  });

  it('sets no cookie for a wrong passphrase, where the right one on the same route gets the session cookie', async () => {
    const { route } = routeWith();
    const refused = await route(formPost(WRONG));
    expect(refused.headers.getSetCookie()).toEqual([]);
    expect(refused.headers.get('set-cookie')).toBeNull();

    const accepted = await route(formPost(SECRET));
    expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
  });

  it('takes the passphrase from JSON and from a multipart form as it does from a url-encoded one, and refuses a wrong one in each', async () => {
    const shapes: [string, (passphrase: string) => Request][] = [
      ['url-encoded', (passphrase) => formPost(passphrase)],
      ['JSON', (passphrase) => jsonPost(JSON.stringify({ passphrase }))],
      ['multipart', (passphrase) => multipartPost(passphrase)],
    ];
    for (const [name, build] of shapes) {
      const { route } = routeWith();
      expect((await route(build(WRONG))).status, `${name}, wrong`).toBe(401);
      const accepted = await route(build(SECRET));
      expect(accepted.status, `${name}, right`).toBe(303);
      expect(sessionOf(accepted).attributes, name).toBe(COOKIE_TAIL);
    }
  });

  it('counts a request with no usable passphrase as a failure and answers it 401, never 500', async () => {
    const { route, limiter } = routeWith();
    const unusable = [
      jsonPost('{"passphrase":'),
      jsonPost('{"passphrase":42}'),
      new Request(ACCESS_URL, { method: 'POST', body: 'passphrase=text', headers: { 'content-type': 'text/plain' } }),
      new Request(ACCESS_URL, { method: 'POST' }),
      multipartPost(''),
    ];
    for (const request of unusable) expect((await route(request)).status).toBe(401);
    expect(limiter.recorded).toHaveLength(5);
    expect((await route(formPost(SECRET))).status).toBe(429);
  });

  it('sets Secure for an HTTPS request or in production, and never for plain-HTTP loopback alone, whatever the client claims about its protocol', async () => {
    const plain = await routeWith().route(formPost(SECRET));
    expect(sessionOf(plain).attributes).toBe(COOKIE_TAIL);

    const https = await routeWith().route(formPost(SECRET, {}, HTTPS_ACCESS_URL));
    expect(sessionOf(https).attributes).toBe(`${COOKIE_TAIL}; Secure`);

    const production = await routeWith({ production: () => true }).route(formPost(SECRET));
    expect(sessionOf(production).attributes).toBe(`${COOKIE_TAIL}; Secure`);

    // A header the client writes is not evidence of TLS: the handler reads the protocol from the request URL alone. In a running
    // server Next has already folded any `X-Forwarded-Proto` containing `https` into that URL (investigation B3.3), which can add
    // `Secure` to the client's own cookie and never remove it; this case holds the handler, not Next.
    const claimed =await routeWith().route(formPost(SECRET, { 'x-forwarded-proto': 'https', forwarded: 'proto=https', 'x-forwarded-ssl': 'on' }));
    expect(sessionOf(claimed).attributes).toBe(COOKIE_TAIL);
  });

  it('refuses the sixth attempt with 429, the right passphrase included, and no Set-Cookie', async () => {
    const { route, limiter } = routeWith();
    await lockOut(route);
    const sixth = await route(formPost(SECRET));
    expect(sixth.status).toBe(429);
    expect(sixth.headers.getSetCookie()).toEqual([]);
    expect(sixth.headers.get('content-type')).toBe('application/json');
    expect(await sixth.text()).toBe(REFUSAL_BODIES[429]);
    expect(limiter.recorded).toHaveLength(5);
  });

  it('does not let a claimed address escape the shared limit: five wrong attempts, each claiming a different client, still refuse the right passphrase from yet another', async () => {
    const { route, limiter } = routeWith();
    for (let n = 1; n <= 5; n += 1) expect((await route(formPost(WRONG, claimingToBe(n)))).status, `attempt ${n}`).toBe(401);

    const sixth = await route(formPost(SECRET, claimingToBe(6)));
    expect(sixth.status).toBe(429);
    expect(sixth.headers.getSetCookie()).toEqual([]);
    expect(sixth.headers.get('set-cookie')).toBeNull();

    // Every question and every failure went to the one shared key, whatever the request claimed.
    expect(limiter.asked.map((entry) => entry.key)).toEqual(Array.from({ length: 6 }, () => 'local'));
    expect(limiter.recorded.map((entry) => entry.key)).toEqual(Array.from({ length: 5 }, () => 'local'));
  });

  it('accepts the same right passphrase, claiming the same address, when no failures came first: the control for the refusal above', async () => {
    const { route, limiter } = routeWith();
    const response = await route(formPost(SECRET, claimingToBe(6)));
    expect(response.status).toBe(303);
    expect(sessionOf(response).attributes).toBe(COOKIE_TAIL);
    expect(limiter.asked.map((entry) => entry.key)).toEqual(['local']);
  });

  const unusableSecrets: [string, Record<string, string | undefined>][] = [
    ['not set', CONFIGURED_ORIGIN],
    ['blank', { ...CONFIGURED_ORIGIN, [ACCESS_SECRET_ENV]: '' }],
    ['15 characters', { ...CONFIGURED_ORIGIN, [ACCESS_SECRET_ENV]: FIFTEEN }],
  ];
  it.each(unusableSecrets)('answers 503 with no Set-Cookie when the secret is %s, to the passphrase that would have matched, and accepts it once the secret is usable', async (_name, env) => {
    let current: Record<string, string | undefined> = env;
    const { route, limiter } = routeWith({ env: () => current });
    const refused = await route(formPost(env[ACCESS_SECRET_ENV] ?? SECRET));
    expect(refused.status).toBe(503);
    expect(refused.headers.getSetCookie()).toEqual([]);
    expect(await refused.text()).toBe(REFUSAL_BODIES[503]);
    expect(limiter.recorded).toEqual([]);

    current = ENV;
    expect((await route(formPost(SECRET))).status).toBe(303);
  });

  it('refuses with 503 when the revocation instant is not an instant, and accepts once it is one', async () => {
    let revokedBefore = 'soon';
    const { route } = routeWith({ env: () => ({ ...ENV, [ACCESS_REVOKED_BEFORE_ENV]: revokedBefore }) });
    expect((await route(formPost(SECRET))).status).toBe(503);
    revokedBefore = '2026-10-19T00:00:00Z';
    expect((await route(formPost(SECRET))).status).toBe(303);
  });

  describe('a client that accepts HTML', () => {
    const browser = { accept: BROWSER_ACCEPT };

    it('is sent back to the access page with the reason by a relative 303, with no cookie, for each of the three refusals', async () => {
      const { route } = routeWith();
      const refused = await route(formPost(WRONG, browser));
      expect(refused.status).toBe(303);
      expect(refused.headers.get('location')).toBe('/pilot-access?reason=refused');
      expect(refused.headers.getSetCookie()).toEqual([]);
      expect(await refused.text()).toBe('');

      for (let i = 0; i < 4; i += 1) await route(formPost(WRONG, browser));
      const limited = await route(formPost(SECRET, browser));
      expect(limited.status).toBe(303);
      expect(limited.headers.get('location')).toBe('/pilot-access?reason=limited');
      expect(limited.headers.getSetCookie()).toEqual([]);

      const unconfigured = await routeWith({ env: () => CONFIGURED_ORIGIN }).route(formPost(SECRET, browser));
      expect(unconfigured.status).toBe(303);
      expect(unconfigured.headers.get('location')).toBe('/pilot-access?reason=unconfigured');
      expect(unconfigured.headers.getSetCookie()).toEqual([]);
    });

    it('is sent to /dashboard with the cookie when the passphrase is right, as a script is', async () => {
      const response = await routeWith().route(formPost(SECRET, browser));
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(response).attributes).toBe(COOKIE_TAIL);
    });

    it('takes text/html anywhere in Accept, in any letter case, as asking for a page, and nothing else', async () => {
      const asksForHtml = ['text/html', 'TEXT/HTML', 'application/json, Text/Html;q=0.5', BROWSER_ACCEPT];
      for (const accept of asksForHtml) {
        const response = await routeWith().route(formPost(WRONG, { accept }));
        expect(response.status, accept).toBe(303);
        expect(response.headers.get('location'), accept).toBe('/pilot-access?reason=refused');
      }
      const doesNot: Record<string, string>[] = [{ accept: 'application/json' }, { accept: '*/*' }, { accept: 'application/xhtml+xml' }, {}];
      for (const headers of doesNot) {
        const response = await routeWith().route(formPost(WRONG, headers));
        expect(response.status, JSON.stringify(headers)).toBe(401);
        expect(response.headers.get('location'), JSON.stringify(headers)).toBeNull();
      }
    });

    it('is sent only to reasons the access page has a sentence for', async () => {
      const { route } = routeWith();
      const locations = [(await route(formPost(WRONG, browser))).headers.get('location')];
      for (let i = 0; i < 4; i += 1) await route(formPost(WRONG, browser));
      locations.push((await route(formPost(SECRET, browser))).headers.get('location'));
      locations.push((await routeWith({ env: () => CONFIGURED_ORIGIN }).route(formPost(SECRET, browser))).headers.get('location'));
      locations.push((await routeWith().route(streamedPost(SECRET, 4097, browser))).headers.get('location'));
      locations.push((await routeWith().route(formPost(SECRET, { ...browser, origin: EVIL_ORIGIN }))).headers.get('location'));
      expect(locations).toEqual([
        '/pilot-access?reason=refused',
        '/pilot-access?reason=limited',
        '/pilot-access?reason=unconfigured',
        '/pilot-access?reason=too_large',
        '/pilot-access?reason=cross_site',
      ]);
      for (const location of locations) {
        const reason = new URL(location ?? '', ORIGIN).searchParams.get('reason');
        expect(accessReasonMessage(reason ?? undefined), String(location)).not.toBeNull();
      }
    });
  });

  describe('a body too large to be a sign-in', () => {
    const TOO_LARGE = '{"error":"too_large"}';
    const browser = { accept: BROWSER_ACCEPT };

    it('answers a script 413 with the refusal body, no-store, no cookie and no redirect when the body declares more than 4096 bytes, without reading it', async () => {
      const { request, record } = declaredPost(SECRET, 4097);
      const response = await routeWith().route(request);
      expect(response.status).toBe(413);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await response.text()).toBe(TOO_LARGE);
      expect(record.pulls).toBe(0);
    });

    it('reads the same right passphrase declaring exactly 4096 bytes and signs it in, which is what makes "without reading" above mean something', async () => {
      const { request, record } = declaredPost(SECRET, 4096);
      const response = await routeWith().route(request);
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(response).attributes).toBe(COOKIE_TAIL);
      expect(record.pulls).toBeGreaterThan(0);
    });

    it('answers a script 413 for 4097 bytes that declare no length or declare fewer, and signs in the same passphrase sent in exactly 4096', async () => {
      const { route } = routeWith();
      for (const [name, request] of [
        ['undeclared', streamedPost(SECRET, 4097)],
        ['declared as 64', streamedPost(SECRET, 4097, { 'content-length': '64' })],
      ] as const) {
        const response = await route(request);
        expect(response.status, name).toBe(413);
        expect(response.headers.get('cache-control'), name).toBe('no-store');
        expect(response.headers.getSetCookie(), name).toEqual([]);
        expect(await response.text(), name).toBe(TOO_LARGE);
      }
      const accepted = await route(streamedPost(SECRET, 4096));
      expect(accepted.status).toBe(303);
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
    });

    it('sends a browser to /pilot-access?reason=too_large by a relative 303 with no cookie, on the declared and the streamed path', async () => {
      const { route } = routeWith();
      for (const [name, request] of [
        ['declared', declaredPost(SECRET, 4097, browser).request],
        ['streamed', streamedPost(SECRET, 4097, browser)],
      ] as const) {
        const response = await route(request);
        expect(response.status, name).toBe(303);
        expect(response.headers.get('location'), name).toBe('/pilot-access?reason=too_large');
        expect(response.headers.get('cache-control'), name).toBe('no-store');
        expect(response.headers.getSetCookie(), name).toEqual([]);
        expect(await response.text(), name).toBe('');
      }
    });

    it('is refused before the limiter and the comparison and never charged: after six, the limiter was neither asked nor told and nothing was compared', async () => {
      const { route, limiter } = routeWith();
      for (let i = 0; i < 3; i += 1) {
        expect((await route(declaredPost(WRONG, 4097).request)).status, `declared ${i + 1}`).toBe(413);
        expect((await route(streamedPost(WRONG, 4097))).status, `streamed ${i + 1}`).toBe(413);
      }
      expect(limiter.asked).toEqual([]);
      expect(limiter.recorded).toEqual([]);
      expect(witness.compared).toEqual([]);

      // The control: on the same route a wrong passphrase that fits is asked about, compared and charged.
      expect((await route(formPost(WRONG))).status).toBe(401);
      expect(limiter.asked).toEqual([{ key: 'local', at: NOW.getTime() }]);
      expect(limiter.recorded).toEqual([{ key: 'local', at: NOW.getTime() }]);
      expect(witness.compared).toEqual([WRONG]);
    });

    // "Unconfigured" here is the secret: the origin is usable, so the body is reached. An unusable origin is judged before the body
    // (B3), and its case is in the block below.
    it('is answered 413 by a gate whose secret is not configured too, which answers the same passphrase in a body that fits 503', async () => {
      const { route, limiter } = routeWith({ env: () => CONFIGURED_ORIGIN });
      expect((await route(streamedPost(SECRET, 4097))).status).toBe(413);
      expect((await route(streamedPost(SECRET, 4096))).status).toBe(503);
      expect(limiter.asked).toEqual([]);
    });

    it('holds no submitted value in its answer to a script or a browser, on either path', async () => {
      const { route } = routeWith();
      const responses: Response[] = [];
      for (const passphrase of [SECRET, WRONG]) {
        responses.push(await route(declaredPost(passphrase, 4097).request));
        responses.push(await route(streamedPost(passphrase, 4097)));
        responses.push(await route(declaredPost(passphrase, 4097, browser).request));
        responses.push(await route(streamedPost(passphrase, 4097, browser)));
      }
      // What is scanned is the too-large refusal each time: a session or another refusal would make the silence below say nothing.
      expect(responses.map((response) => `${response.status} ${response.headers.get('location')}`)).toEqual(
        Array.from({ length: 2 }, () => ['413 null', '413 null', '303 /pilot-access?reason=too_large', '303 /pilot-access?reason=too_large']).flat(),
      );
      const seen = await Promise.all(responses.map(everythingIn));
      expect(seen).toHaveLength(8);
      expect(seen.join('\n')).not.toContain(SECRET);
      expect(seen.join('\n')).not.toContain(WRONG);
      expect(seen.join('\n')).not.toContain(new URLSearchParams({ passphrase: SECRET }).toString());
    });
  });

  describe('an unusable public origin', () => {
    const browser = { accept: BROWSER_ACCEPT };
    /** The secret is usable in each; only the origin is not. */
    const unusableOrigins: [string, Record<string, string | undefined>][] = [
      ['not set', { [ACCESS_SECRET_ENV]: SECRET }],
      ['blank', { [ACCESS_SECRET_ENV]: SECRET, [PUBLIC_ORIGIN_ENV]: '' }],
      ['written with a trailing slash', { [ACCESS_SECRET_ENV]: SECRET, [PUBLIC_ORIGIN_ENV]: 'https://gate.example.test/' }],
      ['plain http on a name other than localhost', { [ACCESS_SECRET_ENV]: SECRET, [PUBLIC_ORIGIN_ENV]: 'http://gate.example.test' }],
      ['a loopback address over plain http', { [ACCESS_SECRET_ENV]: SECRET, [PUBLIC_ORIGIN_ENV]: 'http://127.0.0.1:3000' }],
      ['a loopback address over https, which only the loopback rule refuses', { [ACCESS_SECRET_ENV]: SECRET, [PUBLIC_ORIGIN_ENV]: 'https://127.0.0.1' }],
    ];

    it.each(unusableOrigins)('answers the right passphrase 503 unconfigured with no cookie when the origin is %s, without pulling the body, asking or charging the limiter, or comparing', async (_name, env) => {
      const { route, limiter } = routeWith({ env: () => env });
      const { request, record } = declaredPost(SECRET, 64);
      const response = await route(request);
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await response.text()).toBe('{"error":"unconfigured"}');
      expect(record.pulls).toBe(0);
      expect(limiter.asked).toEqual([]);
      expect(limiter.recorded).toEqual([]);
      expect(witness.compared).toEqual([]);
    });

    it('pulls, asks about, compares and signs in the same recorded request once the origin is usable, which is what makes the silence above mean something', async () => {
      const { route, limiter } = routeWith();
      const { request, record } = declaredPost(SECRET, 64);
      const response = await route(request);
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(response).attributes).toBe(COOKIE_TAIL);
      expect(record.pulls).toBeGreaterThan(0);
      expect(limiter.asked).toEqual([{ key: 'local', at: NOW.getTime() }]);
      expect(witness.compared).toEqual([SECRET]);
    });

    it('sends a browser to /pilot-access?reason=unconfigured by a relative 303 with no cookie, where the same browser is signed in once the origin is usable', async () => {
      const refused = await routeWith({ env: () => ({ [ACCESS_SECRET_ENV]: SECRET }) }).route(formPost(SECRET, browser));
      expect(refused.status).toBe(303);
      expect(refused.headers.get('location')).toBe('/pilot-access?reason=unconfigured');
      expect(refused.headers.get('cache-control')).toBe('no-store');
      expect(refused.headers.getSetCookie()).toEqual([]);
      expect(await refused.text()).toBe('');

      const accepted = await routeWith().route(formPost(SECRET, browser));
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
    });

    it('is judged before the size of the body: a body too large is answered 503 while the origin is unusable, and 413 once it is usable', async () => {
      let env: Record<string, string | undefined> = { [ACCESS_SECRET_ENV]: SECRET };
      const { route } = routeWith({ env: () => env });
      const declared = declaredPost(SECRET, 4097);
      expect((await route(declared.request)).status).toBe(503);
      expect((await route(streamedPost(SECRET, 4097))).status).toBe(503);
      expect(declared.record.pulls).toBe(0);
      env = ENV;
      expect((await route(streamedPost(SECRET, 4097))).status).toBe(413);
    });

    it('logs "pilot-access: refused (503)" and nothing that was submitted or configured', async () => {
      const warn = vi.mocked(console.warn);
      const origin = 'https://gate-7c41.example.test/p-3e9a';
      const { route } = routeWith({ env: () => ({ [ACCESS_SECRET_ENV]: SECRET, [PUBLIC_ORIGIN_ENV]: origin }) });
      await route(formPost(SECRET));
      await route(formPost(WRONG, browser));
      expect(warn.mock.calls).toEqual([['pilot-access: refused (503)'], ['pilot-access: refused (503)']]);
      for (const value of [SECRET, WRONG, origin, 'gate-7c41']) expect(JSON.stringify(warn.mock.calls), value).not.toContain(value);
    });

    it('holds neither the passphrase, the secret nor the configured origin in any header or body of its answers', async () => {
      const origin = 'https://gate-7c41.example.test/p-3e9a';
      const { route } = routeWith({ env: () => ({ [ACCESS_SECRET_ENV]: SECRET, [PUBLIC_ORIGIN_ENV]: origin }) });
      const responses = [await route(formPost(SECRET)), await route(formPost(WRONG, browser))];
      // What is scanned is the origin refusal each time: a session or another refusal would make the silence below say nothing.
      expect(responses.map((response) => `${response.status} ${response.headers.get('location')}`)).toEqual(['503 null', '303 /pilot-access?reason=unconfigured']);
      const everything = (await Promise.all(responses.map(everythingIn))).join('\n');
      for (const value of [SECRET, WRONG, origin, 'gate-7c41', 'p-3e9a']) expect(everything, value).not.toContain(value);
      // The control: the scan finds each of them in an answer that carries them.
      const leaking = await everythingIn(new Response(`${SECRET} ${WRONG}`, { headers: { 'x-leak': origin } }));
      for (const value of [SECRET, WRONG, origin, 'gate-7c41', 'p-3e9a']) expect(leaking, value).toContain(value);
    });
  });

  describe('a cross-site post', () => {
    const browser = { accept: BROWSER_ACCEPT };

    it.each(CROSS_SITE)('answers a script 403 cross_site with no-store, no cookie and no redirect when the post is cross-site %s, where the same post from the site signs in', async (_name, headers) => {
      const { route } = routeWith();
      const request = formPost(SECRET, headers);
      expectCarries(request, headers);
      const response = await route(request);
      expect(response.status).toBe(403);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await response.text()).toBe('{"error":"cross_site"}');

      const accepted = await route(formPost(SECRET, FROM_THE_SITE));
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
    });

    it.each(CROSS_SITE)('sends a browser to /pilot-access?reason=cross_site by a relative 303 with no cookie when the post is cross-site %s, where the same browser from the site is signed in', async (_name, headers) => {
      const { route } = routeWith();
      const request = formPost(SECRET, { ...browser, ...headers });
      expectCarries(request, headers);
      const refused = await route(request);
      expect(refused.status).toBe(303);
      expect(refused.headers.get('location')).toBe('/pilot-access?reason=cross_site');
      expect(refused.headers.get('cache-control')).toBe('no-store');
      expect(refused.headers.getSetCookie()).toEqual([]);
      expect(await refused.text()).toBe('');

      const accepted = await route(formPost(SECRET, { ...browser, ...FROM_THE_SITE }));
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
    });

    it.each(SAME_SITE)('signs in a browser posting from the site %s, as it signs in a script', async (_name, headers) => {
      const request = formPost(SECRET, { ...browser, ...headers });
      expectCarries(request, headers);
      const response = await routeWith().route(request);
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(response).attributes).toBe(COOKIE_TAIL);
    });

    it.each(CROSS_SITE)('never pulls the body of a post that is cross-site %s, where the same recorded stream from the site is pulled and signed in', async (_name, headers) => {
      const refused = declaredPost(SECRET, 64, headers);
      expectCarries(refused.request, headers);
      expect((await routeWith().route(refused.request)).status).toBe(403);
      expect(refused.record.pulls).toBe(0);

      const accepted = declaredPost(SECRET, 64, FROM_THE_SITE);
      const response = await routeWith().route(accepted.request);
      expect(response.status).toBe(303);
      expect(sessionOf(response).attributes).toBe(COOKIE_TAIL);
      expect(accepted.record.pulls).toBeGreaterThan(0);
    });

    it('neither asks nor charges the limiter, nor compares, for a cross-site post of the right or a wrong passphrase, where a wrong passphrase from the site is asked about, compared and charged', async () => {
      const { route, limiter } = routeWith();
      for (const [name, headers] of CROSS_SITE) {
        for (const passphrase of [SECRET, WRONG]) expect((await route(formPost(passphrase, headers))).status, name).toBe(403);
      }
      expect(limiter.asked).toEqual([]);
      expect(limiter.recorded).toEqual([]);
      expect(witness.compared).toEqual([]);

      // The control: on the same route a wrong passphrase from the site is asked about, compared and charged.
      expect((await route(formPost(WRONG, FROM_THE_SITE))).status).toBe(401);
      expect(limiter.asked).toEqual([{ key: 'local', at: NOW.getTime() }]);
      expect(limiter.recorded).toEqual([{ key: 'local', at: NOW.getTime() }]);
      expect(witness.compared).toEqual([WRONG]);
    });

    it('is judged after the public origin and before the size of the body: an unusable origin answers it 503, and a cross-site body too large is answered 403 unread, where the same body from the site is 413', async () => {
      const unconfigured = await routeWith({ env: () => ({ [ACCESS_SECRET_ENV]: SECRET }) }).route(formPost(SECRET, { origin: EVIL_ORIGIN }));
      expect(unconfigured.status).toBe(503);

      const { route } = routeWith();
      const declared = declaredPost(SECRET, 4097, { origin: EVIL_ORIGIN });
      expect((await route(declared.request)).status).toBe(403);
      expect(declared.record.pulls).toBe(0);
      expect((await route(streamedPost(SECRET, 4097, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
      expect((await route(streamedPost(SECRET, 4097, FROM_THE_SITE))).status).toBe(413);
    });

    it('logs "pilot-access: refused (403)" and nothing that was submitted or sent', async () => {
      const warn = vi.mocked(console.warn);
      const { route } = routeWith();
      for (const [, headers] of CROSS_SITE) await route(formPost(WRONG, headers));
      await route(formPost(SECRET, { ...browser, origin: EVIL_ORIGIN }));
      expect(warn.mock.calls).toEqual(Array.from({ length: 4 }, () => ['pilot-access: refused (403)']));
      for (const value of [SECRET, WRONG, EVIL_ORIGIN, 'evil']) expect(JSON.stringify(warn.mock.calls), value).not.toContain(value);
    });

    it('holds neither the passphrase nor the Origin it was sent in any header or body of its answers to a script or a browser', async () => {
      const { route } = routeWith();
      const responses: Response[] = [];
      for (const passphrase of [SECRET, WRONG]) {
        responses.push(await route(formPost(passphrase, { origin: EVIL_ORIGIN })));
        responses.push(await route(formPost(passphrase, { ...browser, origin: EVIL_ORIGIN })));
      }
      // What is scanned is the cross-site refusal each time: a session or another refusal would make the silence below say nothing.
      expect(responses.map((response) => `${response.status} ${response.headers.get('location')}`)).toEqual(
        Array.from({ length: 2 }, () => ['403 null', '303 /pilot-access?reason=cross_site']).flat(),
      );
      const everything = (await Promise.all(responses.map(everythingIn))).join('\n');
      for (const value of [SECRET, WRONG, EVIL_ORIGIN, 'evil']) expect(everything, value).not.toContain(value);
      // The control: the scan finds each of them in an answer that carries them.
      const leaking = await everythingIn(new Response(`${SECRET} ${WRONG}`, { headers: { 'x-leak': EVIL_ORIGIN } }));
      for (const value of [SECRET, WRONG, EVIL_ORIGIN, 'evil']) expect(leaking, value).toContain(value);
    });
  });

  describe('every response', () => {
    const outcomes: [string, () => Promise<Response>, number][] = [
      ['the 503 for an unusable public origin', () => routeWith({ env: () => ({ [ACCESS_SECRET_ENV]: SECRET }) }).route(formPost(SECRET)), 503],
      ['the 303 back to the access page for an unusable public origin', () => routeWith({ env: () => ({ [ACCESS_SECRET_ENV]: SECRET }) }).route(formPost(SECRET, { accept: BROWSER_ACCEPT })), 303],
      ['the 303 that carries the session', () => routeWith().route(formPost(SECRET)), 303],
      ['the 303 back to the access page', () => routeWith().route(formPost(WRONG, { accept: BROWSER_ACCEPT })), 303],
      ['the 303 back to the access page for a body too large', () => routeWith().route(streamedPost(SECRET, 4097, { accept: BROWSER_ACCEPT })), 303],
      ['the 403 for a cross-site post', () => routeWith().route(formPost(SECRET, { origin: EVIL_ORIGIN })), 403],
      ['the 303 back to the access page for a cross-site post', () => routeWith().route(formPost(SECRET, { accept: BROWSER_ACCEPT, 'sec-fetch-site': 'cross-site' })), 303],
      ['the 401 for a wrong passphrase', () => routeWith().route(formPost(WRONG)), 401],
      ['the 413 for a body too large', () => routeWith().route(streamedPost(SECRET, 4097)), 413],
      ['the 429 for too many attempts', async () => { const { route } = routeWith(); await lockOut(route); return route(formPost(SECRET)); }, 429],
      ['the 503 for an unconfigured gate', () => routeWith({ env: () => CONFIGURED_ORIGIN }).route(formPost(SECRET)), 503],
    ];

    it.each(outcomes)('%s is uncacheable', async (_name, run, status) => {
      const response = await run();
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('holds neither the secret nor a submitted passphrase in any header or body of a refusal, a redirect or a success', async () => {
      const { route } = routeWith();
      const seen: string[] = [];
      seen.push(await everythingIn(await route(formPost(WRONG))));
      for (let i = 0; i < 4; i += 1) seen.push(await everythingIn(await route(formPost(WRONG))));
      seen.push(await everythingIn(await route(formPost(SECRET))));
      seen.push(await everythingIn(await route(formPost(WRONG, { accept: BROWSER_ACCEPT }))));
      seen.push(await everythingIn(await routeWith({ env: () => CONFIGURED_ORIGIN }).route(formPost(SECRET))));
      seen.push(await everythingIn(await routeWith().route(formPost(SECRET))));
      seen.push(await everythingIn(await routeWith().route(formPost(SECRET, { accept: BROWSER_ACCEPT }))));
      expect(seen).toHaveLength(10);
      const everything = seen.join('\n');
      expect(everything).not.toContain(SECRET);
      expect(everything).not.toContain(WRONG);
    });

    it('is a scan that would find a leak in a header or in a body, which is what makes its silence above mean something', async () => {
      const leaking = new Response(WRONG, { headers: { 'x-leak': SECRET } });
      const found = await everythingIn(leaking);
      expect(found).toContain(SECRET);
      expect(found).toContain(WRONG);
    });
  });

  describe('the log', () => {
    it('says "pilot-access: refused (<status>)" for each refusal and nothing else, and never the passphrase or the secret', async () => {
      const warn = vi.mocked(console.warn);
      const others = (['log', 'info', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
      let env: Record<string, string | undefined> = ENV;
      const { route } = routeWith({ env: () => env });

      for (let i = 0; i < 5; i += 1) await route(formPost(WRONG));
      expect(warn.mock.calls).toEqual(Array.from({ length: 5 }, () => ['pilot-access: refused (401)']));

      await route(formPost(SECRET));
      expect(warn.mock.calls.at(-1)).toEqual(['pilot-access: refused (429)']);

      env = CONFIGURED_ORIGIN;
      await route(formPost(SECRET));
      expect(warn.mock.calls.at(-1)).toEqual(['pilot-access: refused (503)']);
      expect(warn).toHaveBeenCalledTimes(7);

      for (const other of others) expect(other).not.toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain(WRONG);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
    });

    it('logs nothing for a success, which does carry a token, and logs the refusal a browser is redirected for by its status, not by the redirect', async () => {
      const warn = vi.mocked(console.warn);
      const accepted = await routeWith().route(formPost(SECRET));
      const { token } = sessionOf(accepted);
      expect(token.length).toBeGreaterThan(0);
      expect(warn).not.toHaveBeenCalled();

      // The control: the same spy sees a refusal, so its silence above is not an unplugged spy.
      const redirected = await routeWith().route(formPost(WRONG, { accept: BROWSER_ACCEPT }));
      expect(redirected.status).toBe(303);
      expect(warn.mock.calls).toEqual([['pilot-access: refused (401)']]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
    });

    it('says "pilot-access: refused (413)" for a body too large, a script\'s or a browser\'s, and nothing that was in it', async () => {
      const warn = vi.mocked(console.warn);
      const { route } = routeWith();
      await route(declaredPost(SECRET, 4097).request);
      await route(streamedPost(WRONG, 4097, { accept: BROWSER_ACCEPT }));
      expect(warn.mock.calls).toEqual([['pilot-access: refused (413)'], ['pilot-access: refused (413)']]);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(WRONG);
    });
  });
});

describe('signOutRoute', () => {
  /**
   * The sign-out over injected values: `signOutWith` hands it exactly the origin given, unset included, and `signOut` the configured
   * `PUBLIC_ORIGIN`. Two functions rather than a defaulted parameter, because a default would turn an explicit `undefined` (the
   * unset row below) into the configured origin, and that row would pass without testing an unset origin at all.
   */
  const signOutWith = (publicOrigin: string | undefined, production = false) =>
    signOutRoute({ publicOrigin: () => publicOrigin, production: () => production });
  const signOut = (production = false) => signOutWith(PUBLIC_ORIGIN, production);
  const post = (url = SIGN_OUT_URL, headers: Record<string, string> = {}) => new Request(url, { method: 'POST', headers });
  const browser = { accept: BROWSER_ACCEPT };

  it.each(CROSS_SITE)('refuses a sign-out that is cross-site %s with 403 cross_site to a script and a relative 303 to cross_site to a browser, with no Set-Cookie, so the cookie is not cleared', async (_name, headers) => {
    const request = post(SIGN_OUT_URL, headers);
    expectCarries(request, headers);
    const script = await signOut()(request);
    expect(script.status).toBe(403);
    expect(script.headers.get('content-type')).toBe('application/json');
    expect(script.headers.get('cache-control')).toBe('no-store');
    expect(script.headers.get('location')).toBeNull();
    expect(script.headers.getSetCookie()).toEqual([]);
    expect(await script.text()).toBe('{"error":"cross_site"}');

    const page = await signOut()(post(SIGN_OUT_URL, { ...browser, ...headers }));
    expect(page.status).toBe(303);
    expect(page.headers.get('location')).toBe('/pilot-access?reason=cross_site');
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.getSetCookie()).toEqual([]);
    expect(await page.text()).toBe('');
  });

  it.each(SAME_SITE)('clears the cookie for a sign-out from the site %s, to a script and to a browser: the control for the refusals above', async (_name, headers) => {
    const request = post(SIGN_OUT_URL, headers);
    expectCarries(request, headers);
    for (const response of [await signOut()(request), await signOut()(post(SIGN_OUT_URL, { ...browser, ...headers }))]) {
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/pilot-access');
      expect(response.headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
    }
  });

  describe('with an unusable public origin', () => {
    const unusableOrigins: [string, string | undefined][] = [
      ['not set', undefined],
      ['blank', ''],
      ['written with a trailing slash', 'https://gate.example.test/'],
      ['a loopback address', 'http://127.0.0.1:3000'],
    ];
    /** What a sign-out from the site sends where no origin can be compared: each is cleared. */
    const clears: [string, Record<string, string>][] = [
      ['Origin and Sec-Fetch-Site: same-origin, as a current browser sends from the site', FROM_THE_SITE],
      ['Sec-Fetch-Site: same-origin alone', { 'sec-fetch-site': 'same-origin' }],
      ['neither header', {}],
    ];
    /** What cannot be judged without an origin, or says it came from elsewhere: each is refused. */
    const refuses: [string, Record<string, string>][] = [
      ['Origin without Sec-Fetch-Site', { origin: PUBLIC_ORIGIN }],
      ['another site by Origin alone', { origin: EVIL_ORIGIN }],
      ['Origin with Sec-Fetch-Site: same-site', { origin: PUBLIC_ORIGIN, 'sec-fetch-site': 'same-site' }],
      ['Sec-Fetch-Site: cross-site alone', { 'sec-fetch-site': 'cross-site' }],
    ];

    it.each(unusableOrigins)('still signs out a browser that sends Sec-Fetch-Site: same-origin, and a request with neither header, when the origin is %s', async (_name, publicOrigin) => {
      for (const [name, headers] of clears) {
        const response = await signOutWith(publicOrigin)(post(SIGN_OUT_URL, headers));
        expect(response.status, name).toBe(303);
        expect(response.headers.get('location'), name).toBe('/pilot-access');
        expect(response.headers.getSetCookie(), name).toEqual([CLEARED_COOKIE]);
      }
    });

    it.each(unusableOrigins)('refuses an Origin it cannot judge without Sec-Fetch-Site: same-origin, with 403 and no Set-Cookie, when the origin is %s', async (_name, publicOrigin) => {
      for (const [name, headers] of refuses) {
        const response = await signOutWith(publicOrigin)(post(SIGN_OUT_URL, headers));
        expect(response.status, name).toBe(403);
        expect(response.headers.getSetCookie(), name).toEqual([]);
        expect(await response.text(), name).toBe('{"error":"cross_site"}');
      }
    });
  });

  it('logs "pilot-access: refused (403)" for a cross-site sign-out, and nothing for one it clears', async () => {
    const warn = vi.mocked(console.warn);
    await signOut()(post(SIGN_OUT_URL, FROM_THE_SITE));
    await signOut()(post());
    expect(warn).not.toHaveBeenCalled();

    // The control: the same spy sees the refusal, so its silence above is not an unplugged spy.
    await signOut()(post(SIGN_OUT_URL, { origin: EVIL_ORIGIN }));
    await signOut()(post(SIGN_OUT_URL, { ...browser, 'sec-fetch-site': 'cross-site' }));
    expect(warn.mock.calls).toEqual([['pilot-access: refused (403)'], ['pilot-access: refused (403)']]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('evil');
  });

  it('answers 303 to /pilot-access with the cookie emptied and expired on its own name and path, and an empty body', async () => {
    const response = await signOut()(post());
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/pilot-access');
    expect(response.headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('is Secure for an HTTPS request or in production, and not for plain-HTTP loopback alone', async () => {
    expect((await signOut()(post())).headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
    expect((await signOut()(post(HTTPS_SIGN_OUT_URL))).headers.getSetCookie()).toEqual([`${CLEARED_COOKIE}; Secure`]);
    expect((await signOut(true)(post())).headers.getSetCookie()).toEqual([`${CLEARED_COOKIE}; Secure`]);
    expect((await signOut()(post(SIGN_OUT_URL, { 'x-forwarded-proto': 'https' }))).headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
  });

  it('answers the same whether or not the request carries a session, and the same to a script as to a browser', async () => {
    const bare = await signOut()(post());
    const variants: Record<string, string>[] = [{ cookie: 'ds_pilot_access=v1.1.2.n.c' }, { accept: BROWSER_ACCEPT }, { accept: 'application/json' }];
    for (const headers of variants) {
      const response = await signOut()(post(SIGN_OUT_URL, headers));
      expect(response.status).toBe(bare.status);
      expect(response.headers.get('location')).toBe('/pilot-access');
      expect(response.headers.getSetCookie()).toEqual(bare.headers.getSetCookie());
    }
  });
});

describe('the exported routes', () => {
  // The route files bind the real environment, clock, mode and limiter to the factories. Every case calls `setUp` first, which stubs
  // all four variables the routes read and fakes `Date` alone, so nothing the real environment holds can reach a route; `afterEach`
  // puts the environment and the clock back. Each case then loads a fresh copy of the module, so every case starts with an empty limiter.
  interface Wiring {
    secret: string | null;
    revokedBefore: string | null;
    publicOrigin: string | null;
    nodeEnv: string;
  }

  function setUp(wiring: Partial<Wiring> = {}, now: Date = NOW): void {
    const { secret, revokedBefore, publicOrigin, nodeEnv }: Wiring = { secret: SECRET, revokedBefore: null, publicOrigin: PUBLIC_ORIGIN, nodeEnv: 'test', ...wiring };
    vi.stubEnv(ACCESS_SECRET_ENV, secret ?? undefined);
    vi.stubEnv(ACCESS_REVOKED_BEFORE_ENV, revokedBefore ?? undefined);
    vi.stubEnv(PUBLIC_ORIGIN_ENV, publicOrigin ?? undefined);
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  }

  async function freshAccessRoute() {
    vi.resetModules();
    return import('@/app/api/pilot-access/route');
  }

  async function freshSignOutRoute() {
    vi.resetModules();
    return import('@/app/api/pilot-access/sign-out/route');
  }

  const routeModules: [string, () => Promise<{ POST: unknown; runtime: string; dynamic: string }>][] = [
    ['/api/pilot-access', freshAccessRoute],
    ['/api/pilot-access/sign-out', freshSignOutRoute],
  ];
  it.each(routeModules)('the module for %s exports POST, runtime = nodejs and dynamic = force-dynamic, and nothing else, which is all Next accepts of a route file', async (_path, load) => {
    setUp();
    const route = await load();
    expect(Object.keys(route).sort()).toEqual(['POST', 'dynamic', 'runtime']);
    expect(typeof route.POST).toBe('function');
    expect(route.runtime).toBe('nodejs');
    expect(route.dynamic).toBe('force-dynamic');
  });

  describe('the access route', () => {
    it('refuses a wrong passphrase and accepts the right one under the stubbed secret, and issues the session at the instant of the clock it reads', async () => {
      setUp();
      const { POST } = await freshAccessRoute();

      const refused = await POST(formPost(WRONG));
      expect(refused.status).toBe(401);
      expect(refused.headers.getSetCookie()).toEqual([]);

      const accepted = await POST(formPost(SECRET));
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('/dashboard');
      const { token, attributes } = sessionOf(accepted);
      expect(attributes).toBe(COOKIE_TAIL);
      await expect(verifyAccessToken(token, SECRET, NOW, null)).resolves.toEqual({ ok: true, issuedAt: NOW, expiresAt: at(SESSION_MS) });
      await expect(verifyAccessToken(token, SECRET, at(SESSION_MS), null)).resolves.toEqual({ ok: false, reason: 'expired' });
    });

    it('reads the clock afresh for each request, not once: a later request is issued a session at the later instant', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      const later = at(3_600_000);
      await POST(formPost(SECRET));
      vi.setSystemTime(later);
      const { token } = sessionOf(await POST(formPost(SECRET)));
      await expect(verifyAccessToken(token, SECRET, later, null)).resolves.toMatchObject({ ok: true, issuedAt: later });
    });

    it('reads the secret from its own variable: the revocation instant, though long enough to be a passphrase, is not one', async () => {
      const revokedBefore = '2026-10-19T00:00:00Z';
      expect(revokedBefore.length).toBeGreaterThanOrEqual(16);
      setUp({ revokedBefore });
      const { POST } = await freshAccessRoute();
      expect((await POST(formPost(revokedBefore))).status).toBe(401);
      expect((await POST(formPost(SECRET))).status).toBe(303);
    });

    it('reads the environment for each request, and answers 503 with no session while the secret is not set, blank or too short', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      expect((await POST(formPost(SECRET))).status).toBe(303);

      for (const unusable of [undefined, '', FIFTEEN]) {
        vi.stubEnv(ACCESS_SECRET_ENV, unusable);
        const refused = await POST(formPost(unusable ?? SECRET));
        expect(refused.status, String(unusable)).toBe(503);
        expect(refused.headers.getSetCookie(), String(unusable)).toEqual([]);
      }

      vi.stubEnv(ACCESS_SECRET_ENV, SECRET);
      expect((await POST(formPost(SECRET))).status).toBe(303);
    });

    it('reads the revocation instant under its own name: one that is not an instant refuses with 503, and one that is leaves the gate open', async () => {
      setUp({ revokedBefore: 'soon' });
      const { POST } = await freshAccessRoute();
      const refused = await POST(formPost(SECRET));
      expect(refused.status).toBe(503);
      expect(refused.headers.getSetCookie()).toEqual([]);

      vi.stubEnv(ACCESS_REVOKED_BEFORE_ENV, '2026-10-19T00:00:00Z');
      expect((await POST(formPost(SECRET))).status).toBe(303);
    });

    it('answers the right passphrase with 503 and no session while the revocation instant is later than the clock, a script with the status and a browser with the relative 303 to unconfigured, and charges the limiter nothing', async () => {
      setUp({ revokedBefore: at(1).toISOString() });
      const { POST } = await freshAccessRoute();

      const script = await POST(formPost(SECRET));
      expect(script.status).toBe(503);
      expect(script.headers.getSetCookie()).toEqual([]);
      expect(script.headers.get('set-cookie')).toBeNull();
      expect(await script.text()).toBe(REFUSAL_BODIES[503]);

      const browser = await POST(formPost(SECRET, { accept: BROWSER_ACCEPT }));
      expect(browser.status).toBe(303);
      expect(browser.headers.get('location')).toBe('/pilot-access?reason=unconfigured');
      expect(browser.headers.getSetCookie()).toEqual([]);
      expect(browser.headers.get('set-cookie')).toBeNull();

      // Nothing was charged: five wrong passphrases more are refused for the configuration as well, and once the instant is unset
      // the right passphrase is accepted, where five failures on record would have answered it 429.
      for (let i = 0; i < 5; i += 1) expect((await POST(formPost(WRONG))).status, `wrong passphrase ${i + 1}`).toBe(503);
      vi.stubEnv(ACCESS_REVOKED_BEFORE_ENV, undefined);
      const accepted = await POST(formPost(SECRET));
      expect(accepted.status).toBe(303);
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
    });

    it('accepts the right passphrase when the revocation instant equals the clock, and the session it sets passes the gate at that instant', async () => {
      const cutoff = NOW.toISOString();
      setUp({ revokedBefore: cutoff });
      const { POST } = await freshAccessRoute();

      const accepted = await POST(formPost(SECRET));
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('/dashboard');
      const { token, attributes } = sessionOf(accepted);
      expect(attributes).toBe(COOKIE_TAIL);
      await expect(
        accessDecision({ env: { [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: cutoff }, cookieHeader: `ds_pilot_access=${token}`, now: NOW }),
      ).resolves.toEqual({ kind: 'allowed', expiresAt: at(SESSION_MS) });

      const browser = await POST(formPost(SECRET, { accept: BROWSER_ACCEPT }));
      expect(browser.status).toBe(303);
      expect(browser.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(browser).attributes).toBe(COOKIE_TAIL);
    });

    it('holds neither the passphrase nor a configured value in any header or body of the answers to a later or an equal revocation instant', async () => {
      const late = at(1).toISOString();
      const cutoff = NOW.toISOString();
      setUp({ revokedBefore: late });
      const { POST } = await freshAccessRoute();
      const seen: string[] = [];
      seen.push(await everythingIn(await POST(formPost(SECRET))));
      seen.push(await everythingIn(await POST(formPost(SECRET, { accept: BROWSER_ACCEPT }))));
      vi.stubEnv(ACCESS_REVOKED_BEFORE_ENV, cutoff);
      seen.push(await everythingIn(await POST(formPost(SECRET))));
      seen.push(await everythingIn(await POST(formPost(SECRET, { accept: BROWSER_ACCEPT }))));
      expect(seen).toHaveLength(4);
      const everything = seen.join('\n');
      for (const value of [SECRET, late, cutoff]) expect(everything, `an answer carries ${value}`).not.toContain(value);
    });

    it('is a scan that finds the passphrase in the request those cases send and both instants in a response that carries them, which is what makes the silence above mean something', async () => {
      setUp();
      expect(new URLSearchParams(await formPost(SECRET).text()).get('passphrase')).toBe(SECRET);
      const late = at(1).toISOString();
      const cutoff = NOW.toISOString();
      const found = await everythingIn(new Response(late, { headers: { 'x-leak': `${cutoff} ${SECRET}` } }));
      for (const value of [SECRET, late, cutoff]) expect(found, value).toContain(value);
    });

    it('reads the mode from NODE_ENV: Secure over plain HTTP in production, and not in test', async () => {
      setUp({ nodeEnv: 'test' });
      const { POST } = await freshAccessRoute();
      expect(sessionOf(await POST(formPost(SECRET))).attributes).toBe(COOKIE_TAIL);

      vi.stubEnv('NODE_ENV', 'production');
      expect(sessionOf(await POST(formPost(SECRET))).attributes).toBe(`${COOKIE_TAIL}; Secure`);

      vi.stubEnv('NODE_ENV', 'development');
      expect(sessionOf(await POST(formPost(SECRET))).attributes).toBe(COOKIE_TAIL);
    });

    it('reads the protocol from the request: Secure over HTTPS in test mode', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      expect(sessionOf(await POST(formPost(SECRET, {}, HTTPS_ACCESS_URL))).attributes).toBe(`${COOKIE_TAIL}; Secure`);
      expect(sessionOf(await POST(formPost(SECRET, { 'x-forwarded-proto': 'https' }))).attributes).toBe(COOKIE_TAIL);
    });

    it('limits five failures in fifteen minutes on the clock it reads: refused at the fifteenth minute, accepted the millisecond after', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      await lockOut(POST);

      vi.setSystemTime(at(1000));
      expect((await POST(formPost(SECRET))).status).toBe(429);
      vi.setSystemTime(at(WINDOW_MS));
      expect((await POST(formPost(SECRET))).status).toBe(429);

      vi.setSystemTime(at(WINDOW_MS + 1));
      const accepted = await POST(formPost(SECRET));
      expect(accepted.status).toBe(303);
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
    });

    it('does not let a claimed address escape the shared limit, in any header a proxy-aware server might trust', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      for (let n = 1; n <= 5; n += 1) expect((await POST(formPost(WRONG, claimingToBe(n)))).status, `attempt ${n}`).toBe(401);

      const sixth = await POST(formPost(SECRET, claimingToBe(6)));
      expect(sixth.status).toBe(429);
      expect(sixth.headers.getSetCookie()).toEqual([]);
    });

    it('accepts the same right passphrase, claiming the same address, on a route with no failures: the control for the refusal above', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      const response = await POST(formPost(SECRET, claimingToBe(6)));
      expect(response.status).toBe(303);
      expect(sessionOf(response).attributes).toBe(COOKIE_TAIL);
    });

    it('keeps one limiter for the life of the module and starts with an empty one in a fresh module, which is what makes these cases independent', async () => {
      setUp();
      const first = await freshAccessRoute();
      await lockOut(first.POST);
      expect((await first.POST(formPost(SECRET))).status).toBe(429);

      const second = await freshAccessRoute();
      expect((await second.POST(formPost(SECRET))).status).toBe(303);
    });

    it('draws a new nonce for every session: two sign-ins in the same instant are not given the same token', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      const one = sessionOf(await POST(formPost(SECRET))).token;
      const two = sessionOf(await POST(formPost(SECRET))).token;
      expect(one).not.toBe(two);
      expect(one.split('.')[3]).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(two.split('.')[3]).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(one.split('.')[3]).not.toBe(two.split('.')[3]);
      await expect(verifyAccessToken(one, SECRET, NOW, null)).resolves.toMatchObject({ ok: true });
      await expect(verifyAccessToken(two, SECRET, NOW, null)).resolves.toMatchObject({ ok: true });
    });

    it('sends a browser that was refused back to the access page, and a script the status', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      const browser = await POST(formPost(WRONG, { accept: BROWSER_ACCEPT }));
      expect(browser.status).toBe(303);
      expect(browser.headers.get('location')).toBe('/pilot-access?reason=refused');
      const script = await POST(formPost(WRONG));
      expect(script.status).toBe(401);
      expect(script.headers.get('location')).toBeNull();
    });

    it('answers a body too large with 413 to a script and a relative 303 to too_large for a browser, on the declared and the streamed path, and signs in a body of exactly 4096', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      const declared = declaredPost(SECRET, 4097);
      const script = await POST(declared.request);
      expect(script.status).toBe(413);
      expect(await script.text()).toBe('{"error":"too_large"}');
      expect(script.headers.getSetCookie()).toEqual([]);
      expect(declared.record.pulls).toBe(0);

      const streamed = await POST(streamedPost(SECRET, 4097));
      expect(streamed.status).toBe(413);
      expect(await streamed.text()).toBe('{"error":"too_large"}');
      expect(streamed.headers.getSetCookie()).toEqual([]);

      for (const request of [declaredPost(SECRET, 4097, { accept: BROWSER_ACCEPT }).request, streamedPost(SECRET, 4097, { accept: BROWSER_ACCEPT })]) {
        const browser = await POST(request);
        expect(browser.status).toBe(303);
        expect(browser.headers.get('location')).toBe('/pilot-access?reason=too_large');
        expect(browser.headers.getSetCookie()).toEqual([]);
      }

      const accepted = await POST(streamedPost(SECRET, 4096));
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
    });

    it('never charges a body too large to the limiter: after six, a wrong passphrase is answered 401 and not 429, and it then takes four more to lock', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      for (let i = 0; i < 3; i += 1) {
        expect((await POST(declaredPost(WRONG, 4097).request)).status, `declared ${i + 1}`).toBe(413);
        expect((await POST(streamedPost(WRONG, 4097))).status, `streamed ${i + 1}`).toBe(413);
      }
      expect((await POST(formPost(WRONG))).status).toBe(401);

      // The control: this module's limiter is live, and it is the five wrong passphrases, not the six bodies, that lock it.
      for (let i = 0; i < 4; i += 1) expect((await POST(formPost(WRONG))).status, `wrong passphrase ${i + 2}`).toBe(401);
      expect((await POST(formPost(SECRET))).status).toBe(429);
    });

    it('reads the public origin under its own name, for each request: while it is not set or is unusable the right passphrase is answered 503 with no session, and once it is usable the same passphrase is accepted', async () => {
      setUp({ publicOrigin: null });
      const { POST } = await freshAccessRoute();

      const script = await POST(formPost(SECRET));
      expect(script.status).toBe(503);
      expect(await script.text()).toBe(REFUSAL_BODIES[503]);
      expect(script.headers.getSetCookie()).toEqual([]);
      const browser = await POST(formPost(SECRET, { accept: BROWSER_ACCEPT }));
      expect(browser.status).toBe(303);
      expect(browser.headers.get('location')).toBe('/pilot-access?reason=unconfigured');
      expect(browser.headers.getSetCookie()).toEqual([]);

      vi.stubEnv(PUBLIC_ORIGIN_ENV, 'https://gate.example.test/');
      expect((await POST(formPost(SECRET))).status).toBe(503);

      vi.stubEnv(PUBLIC_ORIGIN_ENV, PUBLIC_ORIGIN);
      const accepted = await POST(formPost(SECRET));
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);
    });

    it('never charges a post refused for the origin to the limiter: after six, a wrong passphrase is answered 401 and not 429, and it then takes four more to lock', async () => {
      setUp({ publicOrigin: null });
      const { POST } = await freshAccessRoute();
      for (let i = 0; i < 6; i += 1) expect((await POST(formPost(WRONG))).status, `refused for the origin ${i + 1}`).toBe(503);

      vi.stubEnv(PUBLIC_ORIGIN_ENV, PUBLIC_ORIGIN);
      expect((await POST(formPost(WRONG))).status).toBe(401);
      // The control: this module's limiter is live, and it is the five wrong passphrases, not the six refusals, that lock it.
      for (let i = 0; i < 4; i += 1) expect((await POST(formPost(WRONG))).status, `wrong passphrase ${i + 2}`).toBe(401);
      expect((await POST(formPost(SECRET))).status).toBe(429);
    });

    it('refuses a cross-site post against the public origin it reads by name, for each request: another site gets 403 or a 303 to cross_site, the configured origin is signed in, and once the variable names another origin the first is another site', async () => {
      setUp();
      const { POST } = await freshAccessRoute();

      const script = await POST(formPost(SECRET, { origin: EVIL_ORIGIN }));
      expect(script.status).toBe(403);
      expect(await script.text()).toBe(REFUSAL_BODIES[403]);
      expect(script.headers.getSetCookie()).toEqual([]);
      const browser = await POST(formPost(SECRET, { accept: BROWSER_ACCEPT, 'sec-fetch-site': 'cross-site' }));
      expect(browser.status).toBe(303);
      expect(browser.headers.get('location')).toBe('/pilot-access?reason=cross_site');
      expect(browser.headers.getSetCookie()).toEqual([]);

      const accepted = await POST(formPost(SECRET, { accept: BROWSER_ACCEPT, ...FROM_THE_SITE }));
      expect(accepted.status).toBe(303);
      expect(accepted.headers.get('location')).toBe('/dashboard');
      expect(sessionOf(accepted).attributes).toBe(COOKIE_TAIL);

      const moved = 'https://moved.example.test';
      vi.stubEnv(PUBLIC_ORIGIN_ENV, moved);
      expect((await POST(formPost(SECRET, FROM_THE_SITE))).status).toBe(403);
      const followed = await POST(formPost(SECRET, { origin: moved, 'sec-fetch-site': 'same-origin' }));
      expect(followed.status).toBe(303);
      expect(sessionOf(followed).attributes).toBe(COOKIE_TAIL);
    });

    it('never charges a cross-site post to the limiter: after six, a wrong passphrase from the site is answered 401 and not 429, and it then takes four more to lock', async () => {
      setUp();
      const { POST } = await freshAccessRoute();
      for (let i = 0; i < 6; i += 1) {
        const [name, headers] = CROSS_SITE[i % CROSS_SITE.length];
        expect((await POST(formPost(WRONG, headers))).status, `cross-site ${i + 1}, ${name}`).toBe(403);
      }

      expect((await POST(formPost(WRONG, FROM_THE_SITE))).status).toBe(401);
      // The control: this module's limiter is live, and it is the five wrong passphrases, not the six cross-site posts, that lock it.
      for (let i = 0; i < 4; i += 1) expect((await POST(formPost(WRONG, FROM_THE_SITE))).status, `wrong passphrase ${i + 2}`).toBe(401);
      expect((await POST(formPost(SECRET, FROM_THE_SITE))).status).toBe(429);
    });
  });

  describe('the sign-out route', () => {
    it('clears the session cookie and goes to the access page, and reads the mode from NODE_ENV', async () => {
      setUp({ nodeEnv: 'test' });
      const { POST } = await freshSignOutRoute();
      const plain = await POST(new Request(SIGN_OUT_URL, { method: 'POST' }));
      expect(plain.status).toBe(303);
      expect(plain.headers.get('location')).toBe('/pilot-access');
      expect(plain.headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
      expect(plain.headers.get('cache-control')).toBe('no-store');

      vi.stubEnv('NODE_ENV', 'production');
      const production = await POST(new Request(SIGN_OUT_URL, { method: 'POST' }));
      expect(production.headers.getSetCookie()).toEqual([`${CLEARED_COOKIE}; Secure`]);
    });

    it('signs out on a server that has no secret configured, which it does not read', async () => {
      setUp({ secret: null });
      const { POST } = await freshSignOutRoute();
      const response = await POST(new Request(SIGN_OUT_URL, { method: 'POST' }));
      expect(response.status).toBe(303);
      expect(response.headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
    });

    it('signs out on a server whose public origin is not set, for a request with neither header and for a browser that sends Sec-Fetch-Site: same-origin, and refuses an Origin it cannot judge', async () => {
      setUp({ publicOrigin: null });
      const { POST } = await freshSignOutRoute();
      for (const [name, headers] of [['neither header', {}], ['what a browser sends from the site', FROM_THE_SITE]] as const) {
        const response = await POST(new Request(SIGN_OUT_URL, { method: 'POST', headers }));
        expect(response.status, name).toBe(303);
        expect(response.headers.get('location'), name).toBe('/pilot-access');
        expect(response.headers.getSetCookie(), name).toEqual([CLEARED_COOKIE]);
      }

      const refused = await POST(new Request(SIGN_OUT_URL, { method: 'POST', headers: { origin: PUBLIC_ORIGIN } }));
      expect(refused.status).toBe(403);
      expect(refused.headers.getSetCookie()).toEqual([]);
    });

    it('refuses a cross-site sign-out against the public origin it reads by name, for each request, with no Set-Cookie, and clears the cookie for a sign-out from that origin', async () => {
      setUp();
      const { POST } = await freshSignOutRoute();

      const script = await POST(new Request(SIGN_OUT_URL, { method: 'POST', headers: { origin: EVIL_ORIGIN } }));
      expect(script.status).toBe(403);
      expect(await script.text()).toBe(REFUSAL_BODIES[403]);
      expect(script.headers.getSetCookie()).toEqual([]);
      const browser = await POST(new Request(SIGN_OUT_URL, { method: 'POST', headers: { accept: BROWSER_ACCEPT, 'sec-fetch-site': 'cross-site' } }));
      expect(browser.status).toBe(303);
      expect(browser.headers.get('location')).toBe('/pilot-access?reason=cross_site');
      expect(browser.headers.getSetCookie()).toEqual([]);

      const cleared = await POST(new Request(SIGN_OUT_URL, { method: 'POST', headers: { accept: BROWSER_ACCEPT, ...FROM_THE_SITE } }));
      expect(cleared.status).toBe(303);
      expect(cleared.headers.get('location')).toBe('/pilot-access');
      expect(cleared.headers.getSetCookie()).toEqual([CLEARED_COOKIE]);

      const moved = 'https://moved.example.test';
      vi.stubEnv(PUBLIC_ORIGIN_ENV, moved);
      expect((await POST(new Request(SIGN_OUT_URL, { method: 'POST', headers: { origin: PUBLIC_ORIGIN } }))).status).toBe(403);
      const followed = await POST(new Request(SIGN_OUT_URL, { method: 'POST', headers: { origin: moved } }));
      expect(followed.status).toBe(303);
      expect(followed.headers.getSetCookie()).toEqual([CLEARED_COOKIE]);
    });
  });
});

describe('the sign-in modules', () => {
  const sourcePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
  const HANDLER = '../lib/pilot-access-handler.ts';
  const ACCESS_ROUTE = '../app/api/pilot-access/route.ts';
  const SIGN_OUT_ROUTE = '../app/api/pilot-access/sign-out/route.ts';
  const PAGE = '../app/pilot-access/page.tsx';
  const REQUEST_BODY = '../lib/request-body.ts';
  const PUBLIC_ORIGIN_MODULE = '../lib/public-origin.ts';

  /** The module's code with its comments removed, so prose that names a forbidden module or header is not taken for using it. */
  function code(relative: string): string {
    return readFileSync(sourcePath(relative), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  /** The modules a file imports, once each: a value import and a type import from one module are one dependency. */
  const importsOf = (relative: string) => [
    ...new Set([...code(relative).matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1])),
  ].sort();

  it('keeps the handler to the access module, the public-origin module and the body reader, the last two importing nothing, so nothing here can reach a profile, the pack or the record', () => {
    expect(importsOf(HANDLER)).toEqual(['@/lib/access', '@/lib/public-origin', '@/lib/request-body']);
    expect(importsOf(REQUEST_BODY)).toEqual([]);
    expect(importsOf(PUBLIC_ORIGIN_MODULE)).toEqual([]);
  });

  it('keeps the sign-in route to the access module, the handler and the public-origin module, and the sign-out route to the handler', () => {
    expect(importsOf(ACCESS_ROUTE)).toEqual(['@/lib/access', '@/lib/pilot-access-handler', '@/lib/public-origin']);
    expect(importsOf(SIGN_OUT_ROUTE)).toEqual(['@/lib/pilot-access-handler']);
  });

  it('keeps the page to Next, the site primitives and the handler, so a public page can never reach a profile, the pack or the record', () => {
    expect(importsOf(PAGE)).toEqual(['@/components/ui/primitives', '@/lib/pilot-access-handler', 'next', 'next/link']);
  });

  it('reads a request header only by the names accept (in sign-in and in sign-out), content-type, origin and sec-fetch-site, and the body reader only content-length and content-type, so no address header can be the limiter key', () => {
    const named = (relative: string) =>
      [...code(relative).matchAll(/\.headers\s*\.\s*get\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1].toLowerCase()).sort();
    // Every use of `.headers` is one of the named reads: the handler holds no other, and neither does the body reader.
    const uses = (relative: string) => [...code(relative).matchAll(/\.headers\b/g)].length;
    expect(named(HANDLER)).toEqual(['accept', 'accept', 'content-type', 'origin', 'sec-fetch-site']);
    expect(uses(HANDLER)).toBe(5);
    expect(named(REQUEST_BODY)).toEqual(['content-length', 'content-type']);
    expect(uses(REQUEST_BODY)).toBe(2);
    for (const route of [ACCESS_ROUTE, SIGN_OUT_ROUTE, PUBLIC_ORIGIN_MODULE]) {
      expect(named(route)).toEqual([]);
      expect(uses(route)).toBe(0);
    }
    // The pattern for an address header, and the control that it matches the reads it is there to forbid.
    const addressHeader = /forwarded|real-ip|client-ip|connecting-ip|\.ip\b/i;
    for (const read of ["request.headers.get('x-forwarded-for')", "headers.get('X-Real-IP')", "headers.get('cf-connecting-ip')", "headers.get('true-client-ip')", 'request.ip']) {
      expect(read).toMatch(addressHeader);
    }
    for (const relative of [HANDLER, ACCESS_ROUTE, SIGN_OUT_ROUTE, REQUEST_BODY, PUBLIC_ORIGIN_MODULE]) {
      expect(code(relative), relative).not.toMatch(addressHeader);
    }
  });

  it('reads process.env only as static reads of the two access variables, the public origin and NODE_ENV in the access route, of the public origin and NODE_ENV in the sign-out route, and not at all in the handler, the body reader or the public-origin module', () => {
    const reads = (relative: string) => [...code(relative).matchAll(/process\.env(?:\.\w+|\[|\b)/g)].map((match) => match[0]).sort();
    expect(reads(HANDLER)).toEqual([]);
    expect(reads(REQUEST_BODY)).toEqual([]);
    expect(reads(PUBLIC_ORIGIN_MODULE)).toEqual([]);
    expect(reads(ACCESS_ROUTE)).toEqual(
      [`process.env.${ACCESS_REVOKED_BEFORE_ENV}`, `process.env.${ACCESS_SECRET_ENV}`, 'process.env.DATASTRATA_PUBLIC_ORIGIN', 'process.env.NODE_ENV'].sort(),
    );
    expect(reads(SIGN_OUT_ROUTE)).toEqual(['process.env.DATASTRATA_PUBLIC_ORIGIN', 'process.env.NODE_ENV']);
  });

  describe('the page', () => {
    const page = () => code(PAGE).replace(/\s+/g, ' ');

    it('is an async server component that awaits searchParams, the Promise Next 15 passes, and is rendered per request', () => {
      expect(page()).toMatch(/export default async function PilotAccessPage\(/);
      expect(page()).toMatch(/\bawait searchParams\b/);
      expect(page()).toContain("export const dynamic = 'force-dynamic'");
      expect(page()).not.toMatch(/['"]use client['"]/);
    });

    it('holds one form that posts to the access route, and in it one password input named passphrase that the browser is asked not to remember', () => {
      expect(page().match(/<form\b/g)).toHaveLength(1);
      expect(page().match(/<input\b/g)).toHaveLength(1);
      expect(page()).toMatch(/<form\b[^>]*\bmethod="post"/);
      expect(page()).toMatch(/<form\b[^>]*\baction="\/api\/pilot-access"/);
      expect(page()).toMatch(/<input\b[^>]*\btype="password"/);
      expect(page()).toMatch(/<input\b[^>]*\bname="passphrase"/);
      expect(page()).toMatch(/<input\b[^>]*\bautoComplete="off"/);
    });

    it('carries the note that a session lasts 12 hours and the note that signing out clears only this browser', () => {
      expect(page()).toContain('A session lasts 12 hours');
      expect(page()).toContain('Signing out clears the session in this browser only');
    });

    it('says the reason as text from the fixed map and never as markup', () => {
      expect(page()).toMatch(/accessReasonMessage\(/);
      expect(page()).toContain('{message}');
      expect(page()).not.toContain('dangerouslySetInnerHTML');
    });
  });
});
