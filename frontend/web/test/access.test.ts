/**
 * The pilot access gate's pure decision module — what it is held to.
 *
 * Stage 1a (2026-10-20). A configured profile must be unobtainable without a
 * session issued from the server-side secret, and the decision is made twice,
 * by the middleware and again by the dashboard page, through one pure module
 * that reads no clock and does no I/O. These tests hand it the environment,
 * the cookie header and the request time and read the verdict, so every
 * refusal the gate can make is seen here, and each is seen failing against a
 * mutant the plan names: a verify that skips `subtle.verify` (the tampered
 * field and the wrong secret), a removed expiry comparison (now at the expiry
 * instant), a configuration that accepts a blank secret (the blank case) and
 * a `secure` flag hard-coded false (the HTTPS case).
 *
 * The token's signature is checked against an oracle built from `node:crypto`
 * in this file, not from the module under test, so the format the design
 * states (HMAC-SHA-256 under a key derived from the secret, base64url without
 * padding) is pinned independently of the code that produces it (evidence
 * standard, failure mode 1). Every negative verdict is paired with the
 * positive case one step away from it: the millisecond before expiry, the
 * issue time equal to the revocation instant, the right passphrase beside the
 * near-miss, the allowed decision beside the six refusals (failure mode 7).
 *
 * A revocation instant later than the request time is a configuration problem
 * (final review, 2026-10-21): a session issued under it would be born revoked,
 * so signing in would loop until the instant passed. `readAccessConfigAt` adds
 * that rule to `readAccessConfig` for one request time and `accessDecision`
 * judges the configuration through it, with the same `now` it judges the token
 * at. Each side of the boundary is here: a millisecond later is refused, with a
 * problem that names the variable and prints no part of either instant; the
 * equal instant is usable, and a session issued at it is allowed at it while
 * one issued a millisecond earlier is revoked.
 */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_PATH,
  ACCESS_REVOKED_BEFORE_ENV,
  ACCESS_SECRET_ENV,
  ACCESS_SECRET_MIN_LENGTH,
  ACCESS_SESSION_SECONDS,
  accessCookie,
  accessDecision,
  AttemptLimiter,
  clearedAccessCookie,
  cookieValue,
  issueAccessToken,
  passphraseMatches,
  readAccessConfig,
  readAccessConfigAt,
  verifyAccessToken,
  type AccessConfig,
} from '@/lib/access';

const SECRET = 'correct horse battery staple';
const NOW = new Date('2026-10-20T12:00:00.000Z');
const SESSION_MS = ACCESS_SESSION_SECONDS * 1000;
const NONCE = 'n0nce-0123456789abcdef';
const FIFTEEN = 'fifteen-chars!!';
const SIXTEEN = 'sixteen-chars!!!';

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

/** The token with one dot-separated field replaced and the signature left as issued. */
function withField(token: string, index: number, value: string): string {
  const parts = token.split('.');
  parts[index] = value;
  return parts.join('.');
}

/** The signature the design states, computed by Node's own HMAC rather than by the module under test. */
function oracleSignature(secret: string, payload: string): string {
  const key = createHmac('sha256', secret).update('datastrata-pilot-access-v1').digest();
  return createHmac('sha256', key).update(payload).digest('base64url');
}

function problemsOf(config: AccessConfig): string[] {
  if (config.ok) throw new Error('expected the configuration to be refused and it was accepted');
  return config.problems;
}

describe('readAccessConfig', () => {
  it('refuses an unset secret with a sentence naming the variable', () => {
    const config = readAccessConfig({});
    expect(config).toEqual({ ok: false, problems: [expect.stringContaining(ACCESS_SECRET_ENV)] });
    expect(problemsOf(config)[0]).toMatch(/not set/);
  });

  it('refuses a secret that is blank after trimming, however long the whitespace', () => {
    for (const blank of ['   ', ' '.repeat(ACCESS_SECRET_MIN_LENGTH), '\t\n']) {
      const config = readAccessConfig({ [ACCESS_SECRET_ENV]: blank });
      expect(config).toEqual({ ok: false, problems: [expect.stringContaining(ACCESS_SECRET_ENV)] });
      expect(problemsOf(config)[0]).toMatch(/blank/);
    }
  });

  it('refuses a 15-character secret, naming the minimum and not the value', () => {
    expect(FIFTEEN).toHaveLength(ACCESS_SECRET_MIN_LENGTH - 1);
    const config = readAccessConfig({ [ACCESS_SECRET_ENV]: FIFTEEN });
    expect(config).toEqual({ ok: false, problems: [expect.stringContaining(ACCESS_SECRET_ENV)] });
    expect(problemsOf(config)[0]).toContain(String(ACCESS_SECRET_MIN_LENGTH));
    expect(problemsOf(config)[0]).not.toContain(FIFTEEN);
  });

  it('accepts a 16-character secret exactly as set, with no revocation instant', () => {
    expect(SIXTEEN).toHaveLength(ACCESS_SECRET_MIN_LENGTH);
    expect(readAccessConfig({ [ACCESS_SECRET_ENV]: SIXTEEN })).toEqual({ ok: true, secret: SIXTEEN, revokedBefore: null });
  });

  it('refuses a revoked-before value that is not an ISO-8601 instant, naming that variable and not the value', () => {
    for (const bad of ['yesterday-ish', '2026-10-20', '2026-13-01T00:00:00Z', '2026-02-30T00:00:00Z', '']) {
      const config = readAccessConfig({ [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: bad });
      expect(config).toEqual({ ok: false, problems: [expect.stringContaining(ACCESS_REVOKED_BEFORE_ENV)] });
      if (bad !== '') expect(problemsOf(config)[0]).not.toContain(bad);
    }
  });

  it('accepts an ISO-8601 instant as the revocation instant, in UTC or with an offset', () => {
    expect(readAccessConfig({ [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: '2026-10-19T00:00:00Z' })).toEqual({
      ok: true,
      secret: SECRET,
      revokedBefore: new Date('2026-10-19T00:00:00.000Z'),
    });
    expect(readAccessConfig({ [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: '2026-10-19T02:30:00.250+02:30' })).toEqual({
      ok: true,
      secret: SECRET,
      revokedBefore: new Date('2026-10-19T00:00:00.250Z'),
    });
  });

  it('reports every problem in one refusal', () => {
    const problems = problemsOf(readAccessConfig({ [ACCESS_SECRET_ENV]: FIFTEEN, [ACCESS_REVOKED_BEFORE_ENV]: 'soon' }));
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain(ACCESS_SECRET_ENV);
    expect(problems[1]).toContain(ACCESS_REVOKED_BEFORE_ENV);
  });
});

describe('readAccessConfigAt', () => {
  /** A millisecond after the request time, written as an operator would write it. */
  const LATE = at(1).toISOString();

  it('refuses a revocation instant a millisecond later than the request time, with one problem naming the variable and printing no part of either instant', () => {
    expect(LATE).toBe('2026-10-20T12:00:00.001Z');
    const config = readAccessConfigAt({ [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: LATE }, NOW);
    expect(config).toEqual({ ok: false, problems: [expect.stringContaining(ACCESS_REVOKED_BEFORE_ENV)] });
    const [problem] = problemsOf(config);
    for (const part of [LATE, LATE.slice(0, 10), LATE.slice(11, 23), NOW.toISOString(), NOW.toISOString().slice(11, 23)]) {
      expect(problem, `the problem prints ${part}`).not.toContain(part);
    }
    // Every part of an instant that tells one from another is a digit, so a problem with no digit prints none of either.
    expect(problem).not.toMatch(/\d/);
  });

  it('accepts a revocation instant equal to the request time: equality is usable', () => {
    expect(readAccessConfigAt({ [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: NOW.toISOString() }, NOW)).toEqual({
      ok: true,
      secret: SECRET,
      revokedBefore: NOW,
    });
  });

  it('accepts a revocation instant earlier than the request time, and no revocation instant at all, as readAccessConfig does', () => {
    expect(readAccessConfigAt({ [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: at(-1).toISOString() }, NOW)).toEqual({
      ok: true,
      secret: SECRET,
      revokedBefore: at(-1),
    });
    expect(readAccessConfigAt({ [ACCESS_SECRET_ENV]: SECRET }, NOW)).toEqual({ ok: true, secret: SECRET, revokedBefore: null });
  });

  it('reports the later instant beside the other problems in one refusal, after them', () => {
    const problems = problemsOf(readAccessConfigAt({ [ACCESS_SECRET_ENV]: FIFTEEN, [ACCESS_REVOKED_BEFORE_ENV]: LATE }, NOW));
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain(ACCESS_SECRET_ENV);
    expect(problems[1]).toContain(ACCESS_REVOKED_BEFORE_ENV);
    expect(problems[1]).not.toMatch(/\d/);
  });

  it('keeps the refusals readAccessConfig makes: a revocation value that is not an instant is one problem, not two', () => {
    const problems = problemsOf(readAccessConfigAt({ [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: 'soon' }, NOW));
    expect(problems).toEqual(problemsOf(readAccessConfig({ [ACCESS_SECRET_ENV]: SECRET, [ACCESS_REVOKED_BEFORE_ENV]: 'soon' })));
    expect(problems).toHaveLength(1);
  });
});

describe('issueAccessToken and verifyAccessToken', () => {
  it('issues v1.<issuedAtMs>.<expiresAtMs>.<nonce>.<signature>, twelve hours long, and verifies it under the same secret', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    const parts = token.split('.');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toBe(String(NOW.getTime()));
    expect(parts[2]).toBe(String(NOW.getTime() + SESSION_MS));
    expect(parts[3]).toBe(NONCE);
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(verifyAccessToken(token, SECRET, at(1), null)).resolves.toEqual({ ok: true, issuedAt: NOW, expiresAt: at(SESSION_MS) });
  });

  it('signs with HMAC-SHA-256 under HMAC(secret, "datastrata-pilot-access-v1"), base64url without padding (independent oracle)', async () => {
    const payload = `v1.${NOW.getTime()}.${NOW.getTime() + SESSION_MS}.${NONCE}`;
    await expect(issueAccessToken(SECRET, NOW, NONCE)).resolves.toBe(`${payload}.${oracleSignature(SECRET, payload)}`);
  });

  it('refuses to issue with a nonce the token format cannot carry', async () => {
    await expect(issueAccessToken(SECRET, NOW, 'a.b')).rejects.toThrow(/nonce/);
    await expect(issueAccessToken(SECRET, NOW, '')).rejects.toThrow(/nonce/);
  });

  it('rejects a tampered expiry field as bad_signature rather than honouring the longer session', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    const extended = withField(token, 2, String(NOW.getTime() + 2 * SESSION_MS));
    await expect(verifyAccessToken(extended, SECRET, at(1), null)).resolves.toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a tampered nonce as bad_signature', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(withField(token, 3, 'other'), SECRET, at(1), null)).resolves.toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a token issued under another secret as bad_signature', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(token, `${SECRET}!`, at(1), null)).resolves.toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('checks the signature before trusting any field: a wrong secret past expiry is bad_signature, not expired', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(token, `${SECRET}!`, at(SESSION_MS + 60_000), null)).resolves.toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('treats now equal to the expiry instant as expired', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(token, SECRET, at(SESSION_MS), null)).resolves.toEqual({ ok: false, reason: 'expired' });
  });

  it('is still valid one millisecond before the expiry instant', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(token, SECRET, at(SESSION_MS - 1), null)).resolves.toEqual({ ok: true, issuedAt: NOW, expiresAt: at(SESSION_MS) });
  });

  it('rejects a token issued before the revocation instant as revoked', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(token, SECRET, at(60_000), at(1))).resolves.toEqual({ ok: false, reason: 'revoked' });
  });

  it('keeps a token issued exactly at the revocation instant: issuedAt < revokedBefore is strict', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(token, SECRET, at(60_000), NOW)).resolves.toEqual({ ok: true, issuedAt: NOW, expiresAt: at(SESSION_MS) });
  });

  it('reports expired before revoked when both apply', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(token, SECRET, at(SESSION_MS), at(1))).resolves.toEqual({ ok: false, reason: 'expired' });
  });

  it('is malformed for garbage and for an empty string, without throwing', async () => {
    await expect(verifyAccessToken('garbage', SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'malformed' });
    await expect(verifyAccessToken('', SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('is malformed for the wrong number of fields', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    const parts = token.split('.');
    await expect(verifyAccessToken(parts.slice(1).join('.'), SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'malformed' });
    await expect(verifyAccessToken(`${token}.extra`, SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });

  it('is malformed for non-numeric issue or expiry times', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    for (const bad of ['abc', '1e12', '-1', '1.5', '']) {
      await expect(verifyAccessToken(withField(token, 1, bad), SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'malformed' });
      await expect(verifyAccessToken(withField(token, 2, bad), SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('is malformed for a signature that is not base64url', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    for (const bad of ['abc+def/ghi=', 'has space', '']) {
      await expect(verifyAccessToken(withField(token, 4, bad), SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'malformed' });
    }
  });

  it('is malformed for a version other than v1', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(verifyAccessToken(withField(token, 0, 'v2'), SECRET, NOW, null)).resolves.toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('passphraseMatches', () => {
  it('accepts the configured passphrase', async () => {
    await expect(passphraseMatches(SECRET, SECRET)).resolves.toBe(true);
  });

  it('rejects a near-miss that differs in one character', async () => {
    await expect(passphraseMatches('correct horse battery stapla', SECRET)).resolves.toBe(false);
  });

  it('rejects a submission of a different length', async () => {
    await expect(passphraseMatches(SECRET.slice(0, -1), SECRET)).resolves.toBe(false);
    await expect(passphraseMatches(`${SECRET} `, SECRET)).resolves.toBe(false);
  });

  it('rejects an empty submission', async () => {
    await expect(passphraseMatches('', SECRET)).resolves.toBe(false);
  });
});

describe('accessCookie and clearedAccessCookie', () => {
  const expected = (secure: boolean) => ({
    name: ACCESS_COOKIE,
    value: 'tok',
    httpOnly: true,
    sameSite: 'strict',
    path: ACCESS_COOKIE_PATH,
    maxAge: ACCESS_SESSION_SECONDS,
    secure,
  });

  it('is HttpOnly, SameSite=Strict, Path=/dashboard, Max-Age=43200 and not Secure for plain-HTTP loopback', () => {
    expect(ACCESS_COOKIE).toBe('ds_pilot_access');
    expect(ACCESS_COOKIE_PATH).toBe('/dashboard');
    expect(ACCESS_SESSION_SECONDS).toBe(43200);
    expect(accessCookie('tok', { https: false, production: false })).toEqual(expected(false));
  });

  it('is Secure for an HTTPS request', () => {
    expect(accessCookie('tok', { https: true, production: false })).toEqual(expected(true));
  });

  it('is Secure in production even over plain HTTP', () => {
    expect(accessCookie('tok', { https: false, production: true })).toEqual(expected(true));
  });

  it('clears with an empty value and Max-Age=0 on the same name and path, Secure by the same rule', () => {
    expect(clearedAccessCookie({ https: false, production: false })).toEqual({ ...expected(false), value: '', maxAge: 0 });
    expect(clearedAccessCookie({ https: true, production: false })).toEqual({ ...expected(true), value: '', maxAge: 0 });
  });
});

describe('cookieValue', () => {
  it('returns the named cookie from a header carrying several', () => {
    expect(cookieValue(`other=1; ${ACCESS_COOKIE}=v1.1.2.n.s; last=3`, ACCESS_COOKIE)).toBe('v1.1.2.n.s');
    expect(cookieValue(`${ACCESS_COOKIE}=only`, ACCESS_COOKIE)).toBe('only');
  });

  it('returns null for a null header, an absent cookie, and a name that is only a prefix', () => {
    expect(cookieValue(null, ACCESS_COOKIE)).toBeNull();
    expect(cookieValue('', ACCESS_COOKIE)).toBeNull();
    expect(cookieValue('other=1; last=3', ACCESS_COOKIE)).toBeNull();
    expect(cookieValue(`${ACCESS_COOKIE}_x=1`, ACCESS_COOKIE)).toBeNull();
  });

  it('keeps "=" inside a value', () => {
    expect(cookieValue(`${ACCESS_COOKIE}=a=b==`, ACCESS_COOKIE)).toBe('a=b==');
  });
});

describe('accessDecision', () => {
  const env = { [ACCESS_SECRET_ENV]: SECRET };
  const header = (token: string) => `other=1; ${ACCESS_COOKIE}=${token}`;

  it('is unconfigured, naming the variable and echoing no value, when the secret is unusable, even with a cookie signed under it', async () => {
    const token = await issueAccessToken(FIFTEEN, NOW, NONCE);
    const decision = await accessDecision({ env: { [ACCESS_SECRET_ENV]: FIFTEEN }, cookieHeader: header(token), now: at(1) });
    expect(decision).toEqual({ kind: 'unconfigured', problems: [expect.stringContaining(ACCESS_SECRET_ENV)] });
    expect(JSON.stringify(decision)).not.toContain(FIFTEEN);
    await expect(accessDecision({ env: {}, cookieHeader: null, now: NOW })).resolves.toMatchObject({ kind: 'unconfigured' });
  });

  it('denies no_session when the request carries no access cookie', async () => {
    await expect(accessDecision({ env, cookieHeader: null, now: NOW })).resolves.toEqual({ kind: 'denied', reason: 'no_session' });
    await expect(accessDecision({ env, cookieHeader: 'other=1', now: NOW })).resolves.toEqual({ kind: 'denied', reason: 'no_session' });
  });

  it('denies malformed when the cookie is not a token', async () => {
    await expect(accessDecision({ env, cookieHeader: header('garbage'), now: NOW })).resolves.toEqual({ kind: 'denied', reason: 'malformed' });
  });

  it('denies bad_signature for a token issued under another secret', async () => {
    const token = await issueAccessToken(`${SECRET}!`, NOW, NONCE);
    await expect(accessDecision({ env, cookieHeader: header(token), now: at(1) })).resolves.toEqual({ kind: 'denied', reason: 'bad_signature' });
  });

  it('denies expired for a token older than the session', async () => {
    const token = await issueAccessToken(SECRET, at(-SESSION_MS), NONCE);
    await expect(accessDecision({ env, cookieHeader: header(token), now: NOW })).resolves.toEqual({ kind: 'denied', reason: 'expired' });
  });

  it('denies revoked for a token issued before the configured revocation instant', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    const revoking = { ...env, [ACCESS_REVOKED_BEFORE_ENV]: at(1).toISOString() };
    await expect(accessDecision({ env: revoking, cookieHeader: header(token), now: at(60_000) })).resolves.toEqual({ kind: 'denied', reason: 'revoked' });
  });

  it('allows a valid session and reports when it expires', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    await expect(accessDecision({ env, cookieHeader: header(token), now: at(60_000) })).resolves.toEqual({ kind: 'allowed', expiresAt: at(SESSION_MS) });
  });

  it('is unconfigured, naming the revocation variable, when the revocation instant is a millisecond later than the request time, even for a session issued at the request time', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    const late = { ...env, [ACCESS_REVOKED_BEFORE_ENV]: at(1).toISOString() };
    await expect(accessDecision({ env: late, cookieHeader: header(token), now: NOW })).resolves.toEqual({
      kind: 'unconfigured',
      problems: [expect.stringContaining(ACCESS_REVOKED_BEFORE_ENV)],
    });
  });

  it('allows a session issued at the revocation instant when the request is at that instant too: the equal-instant positive control', async () => {
    const token = await issueAccessToken(SECRET, NOW, NONCE);
    const cutoffNow = { ...env, [ACCESS_REVOKED_BEFORE_ENV]: NOW.toISOString() };
    await expect(accessDecision({ env: cutoffNow, cookieHeader: header(token), now: NOW })).resolves.toEqual({ kind: 'allowed', expiresAt: at(SESSION_MS) });
  });

  it('denies revoked a session issued a millisecond before that same revocation instant, at the same request time', async () => {
    const token = await issueAccessToken(SECRET, at(-1), NONCE);
    const cutoffNow = { ...env, [ACCESS_REVOKED_BEFORE_ENV]: NOW.toISOString() };
    await expect(accessDecision({ env: cutoffNow, cookieHeader: header(token), now: NOW })).resolves.toEqual({ kind: 'denied', reason: 'revoked' });
  });
});

describe('AttemptLimiter', () => {
  it('allows five failures and refuses the sixth attempt within the window', () => {
    const limiter = new AttemptLimiter();
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.allowed('10.0.0.1', at(i * 1000))).toBe(true);
      limiter.recordFailure('10.0.0.1', at(i * 1000));
    }
    expect(limiter.allowed('10.0.0.1', at(5000))).toBe(false);
  });

  it('allows again once the failures are older than the fifteen-minute window', () => {
    const limiter = new AttemptLimiter();
    for (let i = 0; i < 5; i += 1) limiter.recordFailure('k', NOW);
    expect(limiter.allowed('k', at(900_000))).toBe(false);
    expect(limiter.allowed('k', at(900_001))).toBe(true);
  });

  it('counts failures per key', () => {
    const limiter = new AttemptLimiter();
    for (let i = 0; i < 5; i += 1) limiter.recordFailure('a', NOW);
    expect(limiter.allowed('a', at(1))).toBe(false);
    expect(limiter.allowed('b', at(1))).toBe(true);
  });

  it('takes a custom limit and window', () => {
    const limiter = new AttemptLimiter(2, 1000);
    limiter.recordFailure('k', NOW);
    expect(limiter.allowed('k', at(1))).toBe(true);
    limiter.recordFailure('k', NOW);
    expect(limiter.allowed('k', at(1))).toBe(false);
    expect(limiter.allowed('k', at(1001))).toBe(true);
  });
});
