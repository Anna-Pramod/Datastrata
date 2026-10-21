/**
 * The pilot access gate's decision — pure, shared by the middleware and the
 * dashboard page, and the only thing between a request and a configured
 * profile.
 *
 * **Why one pure module.** Stage 1a puts everything under `/dashboard`, and
 * with it the only reader of a configured profile, behind a session issued
 * from a server-side secret. The gate is enforced twice, by `middleware.ts`
 * before any rendering and by the page before it reads the profile, so that
 * neither a routing change nor a middleware regression can expose the record.
 * Two enforcement points that each made their own decision could disagree;
 * both call this module, which takes the environment, the request's cookie
 * header and the request time, reads no clock and does no I/O, and is
 * therefore tested directly with every verdict it can give.
 *
 * **Why a stateless signed token.** The smallest mechanism that meets the
 * requirement without a user store; it is explicitly temporary, replaced by
 * database sessions and accounts in increment 1c. The token carries its own
 * issue and expiry instants and a nonce, and its signature is HMAC-SHA-256
 * over those fields under a key derived from the secret,
 * `HMAC(secret, 'datastrata-pilot-access-v1')`, so the passphrase itself is
 * never the signing key. Rotating the secret invalidates every token at once;
 * `DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE` refuses every token issued before an
 * instant without changing the passphrase. Expiry is absolute, twelve hours
 * from issue, with no sliding renewal.
 *
 * **Why Web Crypto only.** The middleware runs on the Edge runtime, which has
 * no `node:crypto`; `crypto.subtle` exists in both runtimes and its `verify`
 * compares in constant time. The signature is verified before any field of
 * the token is trusted, and expiry and revocation are judged only on a token
 * whose signature holds. The passphrase comparison is also a `verify`: a fresh
 * random HMAC key signs the secret's bytes, and that signature is verified
 * against the submitted bytes, so no byte-by-byte comparison and no length
 * check of the secret ever runs in this code.
 *
 * **Why refusal is the default.** A missing, blank or short secret, a
 * revocation instant that is not an ISO-8601 instant, or one later than the
 * request time, makes every decision `unconfigured`: the gate never falls
 * open, and the synthetic profile is never substituted for a refusal. Problems
 * name the variable and never its value, because the page and the
 * middleware's 503 print them. Malformed tokens are a verdict, never a throw,
 * so a hostile cookie cannot turn a refusal into an error page that says more
 * than it should.
 *
 * **Why a revocation instant later than the request time is a configuration
 * problem.** Every token issued before the instant is refused, so under a
 * later one a session issued now is refused as revoked the moment it is
 * presented, and signing in loops until the instant passes; local time written
 * with `Z` east of UTC is enough to cause it. Refused as configuration, it is
 * a 503 that names the variable, and no session is issued. `readAccessConfigAt`
 * is the one place the rule is applied, at one request time: `accessDecision`
 * hands it the `now` it then judges the token at, and the sign-in handler the
 * instant it limits and issues at. An instant equal to the request time is
 * usable: a session issued at it is kept, and every earlier one is revoked.
 */

/** The passphrase an operator hands to the person who may look. Server-side only, never `NEXT_PUBLIC_`. */
export const ACCESS_SECRET_ENV = 'DATASTRATA_PILOT_ACCESS_SECRET';
/** An ISO-8601 instant; every token issued before it is refused. Server-side only. */
export const ACCESS_REVOKED_BEFORE_ENV = 'DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE';
export const ACCESS_COOKIE = 'ds_pilot_access';
/** Twelve hours, absolute from issue; the cookie's Max-Age matches but is not relied on. */
export const ACCESS_SESSION_SECONDS = 43200;
export const ACCESS_SECRET_MIN_LENGTH = 16;
/** The token travels only to the protected path. */
export const ACCESS_COOKIE_PATH = '/dashboard';

const TOKEN_VERSION = 'v1';
/** The label the signing key is derived under; a different label would be a different key for the same secret. */
const KEY_DERIVATION_LABEL = 'datastrata-pilot-access-v1';
const HMAC_SHA256 = { name: 'HMAC', hash: 'SHA-256' } as const;
/** An instant in milliseconds as the token carries it: digits only, within the safe-integer range. */
const INSTANT_MS = /^\d{1,15}$/;
/** What a nonce may be made of: cookie-safe and free of the token's own separator. */
const NONCE_FORM = /^[A-Za-z0-9_-]+$/;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const encoder = new TextEncoder();

export type AccessConfig =
  | { ok: true; secret: string; revokedBefore: Date | null }
  | { ok: false; problems: string[] };

export type TokenRefusal = 'malformed' | 'bad_signature' | 'expired' | 'revoked';

export type TokenVerdict =
  | { ok: true; issuedAt: Date; expiresAt: Date }
  | { ok: false; reason: TokenRefusal };

export interface CookieAttributes {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: 'strict';
  path: typeof ACCESS_COOKIE_PATH;
  maxAge: number;
  secure: boolean;
}

/** What the cookie's `Secure` attribute is decided from: the request's protocol and the deployment's mode. */
export interface RequestTransport {
  https: boolean;
  production: boolean;
}

export type AccessDecision =
  | { kind: 'unconfigured'; problems: string[] }
  | { kind: 'denied'; reason: 'no_session' | TokenRefusal }
  | { kind: 'allowed'; expiresAt: Date };

/**
 * An ISO-8601 instant, `YYYY-MM-DDTHH:MM[:SS[.fraction]](Z|±HH:MM)`, parsed
 * here rather than by `Date.parse` so that what counts as an instant does not
 * depend on the runtime's lenient parsing, and so that a day the calendar does
 * not have (30 February) is refused rather than carried into March.
 */
function parseIsoInstant(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:(Z)|([+-])(\d{2}):(\d{2}))$/.exec(text);
  if (match === null) return null;
  const [year, month, day, hour, minute] = [1, 2, 3, 4, 5].map((i) => Number(match[i]));
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const millis = match[7] === undefined ? 0 : Number(match[7].padEnd(3, '0').slice(0, 3));
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  let offsetMinutes = 0;
  if (match[8] === undefined) {
    const offsetHours = Number(match[10]);
    const offsetMins = Number(match[11]);
    if (offsetHours > 23 || offsetMins > 59) return null;
    offsetMinutes = (match[9] === '-' ? -1 : 1) * (offsetHours * 60 + offsetMins);
  }
  return new Date(asUtc - offsetMinutes * 60_000);
}

/**
 * The configuration, or every problem with it. The secret is kept exactly as
 * set, whitespace included, because it is the passphrase the operator handed
 * out; blankness and length are judged on the trimmed value, so padding earns
 * no credit. Problems name the variable and never its value.
 */
export function readAccessConfig(env: Readonly<Record<string, string | undefined>>): AccessConfig {
  const problems: string[] = [];
  const remedy = `Set it to a passphrase of at least ${ACCESS_SECRET_MIN_LENGTH} characters.`;
  const secret = env[ACCESS_SECRET_ENV];
  if (secret === undefined) {
    problems.push(`${ACCESS_SECRET_ENV} is not set. ${remedy}`);
  } else if (secret.trim() === '') {
    problems.push(`${ACCESS_SECRET_ENV} is set but blank. ${remedy}`);
  } else if (secret.trim().length < ACCESS_SECRET_MIN_LENGTH) {
    problems.push(`${ACCESS_SECRET_ENV} is shorter than ${ACCESS_SECRET_MIN_LENGTH} characters. ${remedy}`);
  }

  const revokedText = env[ACCESS_REVOKED_BEFORE_ENV];
  let revokedBefore: Date | null = null;
  if (revokedText !== undefined) {
    revokedBefore = parseIsoInstant(revokedText.trim());
    if (revokedBefore === null) {
      problems.push(
        `${ACCESS_REVOKED_BEFORE_ENV} is set but is not an ISO-8601 instant of the form YYYY-MM-DDTHH:MM:SSZ (an offset such as +02:00 may replace Z). Set it to one, or unset it to revoke nothing by time.`,
      );
    }
  }

  if (problems.length > 0 || secret === undefined) return { ok: false, problems };
  return { ok: true, secret, revokedBefore };
}

/** The problem a revocation instant later than the request time is reported as: the variable named, and neither instant printed. */
const REVOKED_BEFORE_IS_LATER = `${ACCESS_REVOKED_BEFORE_ENV} is later than this server's clock, so a session issued now would be refused as revoked; write the instant in UTC, no later than now, or unset it to revoke nothing by time.`;

/**
 * The configuration as `readAccessConfig` reads it, judged at one request time: a revocation instant later than `now` is a problem
 * as well, and one equal to `now` is usable (revocation is `issuedAt < revokedBefore`, so a session issued at it is kept). The time
 * problem joins the others, after them, so one refusal still reports every problem; like them, it names the variable and prints no
 * value. `readAccessConfig` keeps no instant when it refuses, so the instant is then parsed again by the same parser, and a value it
 * refused as malformed adds nothing more. `accessDecision` and the sign-in handler decide configuration through this function alone.
 */
export function readAccessConfigAt(env: Readonly<Record<string, string | undefined>>, now: Date): AccessConfig {
  const config = readAccessConfig(env);
  const revokedText = env[ACCESS_REVOKED_BEFORE_ENV];
  const revokedBefore = config.ok ? config.revokedBefore : revokedText === undefined ? null : parseIsoInstant(revokedText.trim());
  if (revokedBefore === null || revokedBefore.getTime() <= now.getTime()) return config;
  return { ok: false, problems: [...(config.ok ? [] : config.problems), REVOKED_BEFORE_IS_LATER] };
}

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const triple = (bytes[i] << 16) | ((remaining > 1 ? bytes[i + 1] : 0) << 8) | (remaining > 2 ? bytes[i + 2] : 0);
    out += BASE64URL_ALPHABET[(triple >>> 18) & 63] + BASE64URL_ALPHABET[(triple >>> 12) & 63];
    if (remaining > 1) out += BASE64URL_ALPHABET[(triple >>> 6) & 63];
    if (remaining > 2) out += BASE64URL_ALPHABET[triple & 63];
  }
  return out;
}

/** Strict: the base64url alphabet only, no padding, a possible length, and zero trailing bits, so one byte string has one encoding. */
function fromBase64Url(text: string) {
  if (text.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let written = 0;
  for (const char of text) {
    buffer = ((buffer << 6) | BASE64URL_ALPHABET.indexOf(char)) & 0x3fff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[written] = (buffer >>> bits) & 0xff;
      written += 1;
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) return null;
  return bytes;
}

/** The signing key: `HMAC-SHA-256(secret, label)` imported as an HMAC key, so the passphrase itself never signs. */
async function signingKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const secretKey = await crypto.subtle.importKey('raw', encoder.encode(secret), HMAC_SHA256, false, ['sign']);
  const derived = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(KEY_DERIVATION_LABEL));
  return crypto.subtle.importKey('raw', derived, HMAC_SHA256, false, usages);
}

/**
 * `v1.<issuedAtMs>.<expiresAtMs>.<nonce>.<signature>`, the signature being
 * HMAC-SHA-256 over the first four fields in base64url without padding. The
 * nonce comes from the caller (the route handler draws it from
 * `crypto.getRandomValues`); one the format cannot carry is refused here, at
 * issue, rather than discovered as `malformed` at the first request.
 */
export async function issueAccessToken(secret: string, now: Date, nonce: string): Promise<string> {
  if (!NONCE_FORM.test(nonce)) {
    throw new RangeError('The access token nonce must be non-empty and use only letters, digits, "-" and "_".');
  }
  const issuedAt = now.getTime();
  const expiresAt = issuedAt + ACCESS_SESSION_SECONDS * 1000;
  const payload = `${TOKEN_VERSION}.${issuedAt}.${expiresAt}.${nonce}`;
  const key = await signingKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The verdict on a token. Shape first (anything else is `malformed`, never a
 * throw), then the signature through `crypto.subtle.verify` before any field
 * is trusted, then expiry (`expiresAt <= now`) and revocation
 * (`issuedAt < revokedBefore`), in that order.
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
  now: Date,
  revokedBefore: Date | null,
): Promise<TokenVerdict> {
  const parts = token.split('.');
  if (parts.length !== 5) return { ok: false, reason: 'malformed' };
  const [version, issuedText, expiresText, nonce, signatureText] = parts;
  if (version !== TOKEN_VERSION || !INSTANT_MS.test(issuedText) || !INSTANT_MS.test(expiresText) || !NONCE_FORM.test(nonce)) {
    return { ok: false, reason: 'malformed' };
  }
  const signature = fromBase64Url(signatureText);
  if (signature === null || signature.length === 0) return { ok: false, reason: 'malformed' };

  const key = await signingKey(secret, ['verify']);
  const payload = encoder.encode(`${version}.${issuedText}.${expiresText}.${nonce}`);
  const genuine = await crypto.subtle.verify('HMAC', key, signature, payload);
  if (!genuine) return { ok: false, reason: 'bad_signature' };

  const issuedAt = new Date(Number(issuedText));
  const expiresAt = new Date(Number(expiresText));
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  if (revokedBefore !== null && issuedAt.getTime() < revokedBefore.getTime()) return { ok: false, reason: 'revoked' };
  return { ok: true, issuedAt, expiresAt };
}

/**
 * Whether the submitted passphrase is the secret, in constant time and with
 * Web Crypto only: a fresh random HMAC key signs the secret's bytes, and
 * `subtle.verify` checks that signature against the submitted bytes. Two
 * inputs of different length or differing in one byte give different MACs,
 * and the comparison of the MACs is the platform's constant-time one.
 */
export async function passphraseMatches(submitted: string, secret: string): Promise<boolean> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', keyBytes, HMAC_SHA256, false, ['sign', 'verify']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(secret));
  return crypto.subtle.verify('HMAC', key, mac, encoder.encode(submitted));
}

/** The named cookie's value from a `Cookie` header, as sent, or null. The first match wins, as browsers order the most specific path first. */
export function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (cookieHeader === null) return null;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim();
  }
  return null;
}

/**
 * The session cookie as the design states it: `HttpOnly`, `SameSite=Strict`,
 * `Path=/dashboard`, `Max-Age` matching the session, and `Secure` whenever the
 * request is HTTPS or the deployment is production, omitted only for
 * plain-HTTP loopback so the local look keeps working.
 */
export function accessCookie(token: string, request: RequestTransport): CookieAttributes {
  return {
    name: ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    path: ACCESS_COOKIE_PATH,
    maxAge: ACCESS_SESSION_SECONDS,
    secure: request.https || request.production,
  };
}

/** The same cookie emptied and expired, which clears it on that browser; the token itself stays valid until expiry or revocation. */
export function clearedAccessCookie(request: RequestTransport): CookieAttributes {
  return { ...accessCookie('', request), maxAge: 0 };
}

/**
 * The decision both enforcement points act on. Configuration is judged first,
 * at the request time, so an unusable secret refuses even a cookie signed
 * under it and a revocation instant later than the request refuses every
 * session; then the cookie (absent or empty is `no_session`); then the token.
 * One `now` serves the whole decision: the time rule and the token's expiry
 * and revocation are judged at the same instant.
 */
export async function accessDecision(input: {
  env: Readonly<Record<string, string | undefined>>;
  cookieHeader: string | null;
  now: Date;
}): Promise<AccessDecision> {
  const config = readAccessConfigAt(input.env, input.now);
  if (!config.ok) return { kind: 'unconfigured', problems: config.problems };
  const token = cookieValue(input.cookieHeader, ACCESS_COOKIE);
  if (token === null || token === '') return { kind: 'denied', reason: 'no_session' };
  const verdict = await verifyAccessToken(token, config.secret, input.now, config.revokedBefore);
  if (!verdict.ok) return { kind: 'denied', reason: verdict.reason };
  return { kind: 'allowed', expiresAt: verdict.expiresAt };
}

/**
 * Failed attempts per client, kept in process memory: `limit` failures within
 * `windowMs` and the next attempt is refused until the oldest is older than
 * the window. Adequate for a single local process and recorded as a
 * limitation; it is handed the time like everything else here.
 */
export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly limit = 5,
    private readonly windowMs = 900_000,
  ) {}

  allowed(key: string, now: Date): boolean {
    return this.recent(key, now).length < this.limit;
  }

  recordFailure(key: string, now: Date): void {
    for (const other of [...this.failures.keys()]) this.recent(other, now);
    this.failures.set(key, [...this.recent(key, now), now.getTime()]);
  }

  /** The key's failures still inside the window, with the rest forgotten; a key with none left is dropped. */
  private recent(key: string, now: Date): number[] {
    const cutoff = now.getTime() - this.windowMs;
    const kept = (this.failures.get(key) ?? []).filter((at) => at >= cutoff);
    if (kept.length === 0) this.failures.delete(key);
    else this.failures.set(key, kept);
    return kept;
  }
}
