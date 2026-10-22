/**
 * The pilot access sign-in as values in and values out: the logic behind `POST /api/pilot-access`, `POST /api/pilot-access/sign-out`
 * and the sentences on `/pilot-access`.
 *
 * **Why this is not in the route files.** Next accepts nothing from a `route.ts` but its handlers and its segment config, so a route
 * file cannot export the function it is built from, and whatever lives only there cannot be called by a test. The decision, the
 * request-to-response path and the cookie serialiser live here as functions of an environment, a clock, a limiter, a nonce source
 * and a mode that the caller hands in, and the two route files only bind the real ones. What is left in them (which variable a
 * value is read from, which clock, which limiter) is small enough to be held by driving the exported `POST` itself.
 *
 * **Why one shared limiter key.** Failed attempts are counted under the single key `'local'`, never under a client address. On a
 * loopback server every request arrives from 127.0.0.1, and `X-Forwarded-For` holds whatever the client writes, so a key derived
 * from it would let a guesser escape the limit by changing the header on each attempt. A per-client key needs a trusted proxy that
 * sets the address itself, and Stage 1a configures none, so no address header is read anywhere in this module. The cost is a
 * stated limitation (design section 5): five wrong attempts from anyone refuse everyone, the authorised person included, for up
 * to fifteen minutes.
 *
 * **Why the limiter is asked before the comparison, and why attempts take turns.** The configuration is judged first, by the rule
 * the gate uses and at the attempt's own instant (`readAccessConfigAt`, under which a revocation instant later than the attempt is a
 * configuration problem, so sign-in never issues a session the gate would refuse as revoked), so an unusable gate says 503 whatever
 * the limiter holds and records nothing. Then the limiter, so a refused attempt is never compared
 * at all and a guesser cannot learn from a 429 whether the sixth guess was right. Then the comparison. Only a wrong or missing
 * passphrase is recorded: an attempt refused for the limit or for the configuration adds nothing, which keeps the lock to the
 * fifteen minutes the design states instead of extending it for as long as someone keeps trying. The comparison is asynchronous,
 * so attempts that arrive together would all be let in by a limiter that none of them had yet been charged to; they take turns on
 * the limiter instead, in arrival order, and a burst can compare at most five passphrases.
 *
 * **Why an unusable public origin is refused first of all, and never counted.** The gate's redirects are built from
 * `DATASTRATA_PUBLIC_ORIGIN` (pilot readiness B3), configured rather than derived because the request URL Next hands a handler is
 * built from the hostname the server was started with, not the one the browser used, and its scheme from any `X-Forwarded-Proto`
 * containing `https`. While the origin is unusable the gate answers every `/dashboard` request 503, so a session issued now could
 * not be used, and the cross-site check (B2) has nothing to compare a browser's `Origin` with. Sign-in therefore judges the origin
 * before anything else, by the same `readPublicOrigin` the middleware uses, and answers an unusable one as an unconfigured gate:
 * 503 and `unconfigured`, before the body is read, the limiter asked or a passphrase compared, and without recording a failure.
 * The handler's own redirects stay relative (below); the origin decides whether sign-in is open, not where it sends anyone.
 *
 * **Why a cross-site post is refused, on sign-in after the origin and before the body, and never counted.** A form on any website
 * can post to both routes from a visitor's browser. Without a check, any page a visitor opens could spend the shared limiter's
 * five failures and lock every pilot user out, or sign the visitor out (pilot readiness B2). Both routes therefore judge the
 * request's `Origin` and `Sec-Fetch-Site` against the configured origin with `sameOriginVerdict`, whose module comment gives the
 * rule, and answer a post from another site 403 and `cross_site`. Sign-in judges it once the origin is known to be usable, since
 * an unusable one is answered 503 first and gives nothing to compare with, and before the body is read: a cross-site post is
 * never read, the limiter is neither asked nor charged and nothing is compared, because it is not an attempt by anyone at the
 * page. A request with neither header goes through as a compatibility exception, so scripted sign-in keeps working, and the limiter
 * and the passphrase still apply to it. That is not proof it came from a script: an older browser, or one whose headers an
 * extension or proxy strips, can send neither, and such a post from another site is let through unjudged (`public-origin.ts`
 * states the assumption and what such a post can do). Sign-out reads the origin as well and
 * nothing else of the configuration. Where the origin is unusable, a browser's `Sec-Fetch-Site: same-origin` still signs it out,
 * so a misconfigured server can still be left. A refused sign-out carries no `Set-Cookie`, so the session it was aimed at is not
 * cleared.
 *
 * **Why a body too large is refused before the rest, and never counted.** The passphrase is read from at most 4 KiB
 * (`readBodyWithin`, pilot readiness B4). A larger body is answered 413 before the configuration, the limiter or the comparison is
 * reached, and is not recorded as a failure: no passphrase was read from it, so it cannot have been a wrong one, and the limiter
 * counts wrong passphrases.
 *
 * **Why a refusal is a status to a script and a redirect to a browser.** A form post is answered with whatever the browser then
 * shows, and a bare 401 after a form post is a blank page. A client that accepts HTML, by the rule the middleware uses, is sent
 * back to `/pilot-access?reason=refused`, `limited`, `unconfigured`, `too_large` or `cross_site`, where a fixed map says it in a
 * sentence. Any other client gets the status and a one-key JSON body naming the same reason. A success is a 303 to `/dashboard`
 * for everyone. Sign-out refuses by the same rule: a cross-site sign-out is 403 to a script and a 303 to `cross_site` to a browser.
 *
 * **Why a plain `Response` with a relative `Location`.** `NextResponse.redirect` demands an absolute URL, and Next normalises a
 * loopback request URL to `localhost`, which would move a browser off the host its session cookie belongs to (design section 5).
 * A 303 built here carries exactly `/dashboard`, `/pilot-access` or `/pilot-access?reason=...`, and Next passes a route handler's
 * `Location` through untouched (investigation B3.2), so the browser stays on the host it used, behind a proxy too. Every response
 * carries `Cache-Control: no-store`.
 *
 * **Why the protocol is the request URL's.** `Secure` is set when the request URL is HTTPS or the deployment is production, and
 * left off only for plain-HTTP loopback so the local look keeps working. This module reads no protocol header, but Next has read
 * one already: it builds the request URL with `https` whenever `X-Forwarded-Proto` contains `https`, a header any client can write
 * (investigation B3.3). A client can therefore add `Secure` to its own cookie, and never remove it, and production sets `Secure`
 * regardless.
 *
 * **Why a refusal logs a status and nothing else.** The line is `pilot-access: refused (<status>)`. The submitted passphrase, the
 * secret and any token are never handed to a logger, and a response body is empty or the fixed one-key JSON body for its reason,
 * so neither can reach a log or a client by way of this module. Nor can the `Origin` a cross-site post was sent with: a refusal
 * names the reason, never the site.
 *
 * **Why the reason on the page is looked up and never echoed.** The access page takes its reason from the query string, which
 * anyone can write. `accessReasonMessage` answers from a fixed `Map`, so a name every object inherits (`constructor`) is not a
 * key, and gives null for everything else: no text a visitor puts in a link can appear on the page as the gate's own words.
 */

import {
  accessCookie,
  clearedAccessCookie,
  issueAccessToken,
  passphraseMatches,
  readAccessConfigAt,
  type AttemptLimiter,
  type CookieAttributes,
  type RequestTransport,
} from '@/lib/access';
import { PUBLIC_ORIGIN_ENV, readPublicOrigin, sameOriginVerdict, type FetchOriginHeaders } from '@/lib/public-origin';
import { PILOT_ACCESS_BODY_LIMIT, readBodyWithin, withBoundedBody } from '@/lib/request-body';

/** The one key every attempt is counted under; the module comment says why no address is used. */
export const SHARED_LIMITER_KEY = 'local';

export interface AccessInput {
  env: Readonly<Record<string, string | undefined>>;
  now: Date;
  clientKey: string;
  /** What the request carried as `passphrase`; null when it carried nothing usable. */
  passphrase: string | null;
  https: boolean;
  production: boolean;
  /** Drawn by the caller; the token format refuses one it cannot carry. */
  nonce: string;
}

export type AccessOutcome =
  | { status: 503 }
  | { status: 429 }
  | { status: 401 }
  | { status: 303; location: '/dashboard'; cookie: CookieAttributes };

export interface SignOutOutcome {
  status: 303;
  location: '/pilot-access';
  cookie: CookieAttributes;
}

/** Everything the access route reads from the machine it runs on, as functions so each is read afresh for each request. */
export interface AccessRouteDeps {
  env: () => Readonly<Record<string, string | undefined>>;
  now: () => Date;
  limiter: AttemptLimiter;
  nonce: () => string;
  production: () => boolean;
}

export interface SignOutRouteDeps {
  /** `DATASTRATA_PUBLIC_ORIGIN` as the route reads it, by name, for each request: the one value of the configuration sign-out reads. */
  publicOrigin: () => string | undefined;
  production: () => boolean;
}

/** Where each limiter's queue ends: the attempt that arrives next waits for this to settle. Keyed by limiter, so unrelated limiters never wait on each other. */
const turns = new WeakMap<AttemptLimiter, Promise<unknown>>();

/**
 * Runs `task` once every earlier task on the same limiter has settled, so that the limiter is read and written by one attempt at a
 * time. A task that throws fails that attempt alone: the queue is kept as a promise that never rejects.
 */
function inTurn<T>(limiter: AttemptLimiter, task: () => Promise<T>): Promise<T> {
  const run = (turns.get(limiter) ?? Promise.resolve()).then(task);
  turns.set(limiter, run.catch(() => undefined));
  return run;
}

/**
 * The decision on one attempt: 503 when the gate is unconfigured, 429 when the limiter refuses, 401 for a wrong or missing
 * passphrase (recorded as a failure), and otherwise 303 to `/dashboard` with the session cookie. The configuration is judged at
 * `input.now`, the one instant the limiter and the token use as well, so no second clock is read inside the decision. The public
 * origin is not judged here: `accessRoute` refuses an unusable one before the body is read, and so before this is reached.
 */
export async function handleAccessRequest(input: AccessInput, limiter: AttemptLimiter): Promise<AccessOutcome> {
  const config = readAccessConfigAt(input.env, input.now);
  if (!config.ok) return { status: 503 };
  return inTurn(limiter, async (): Promise<AccessOutcome> => {
    if (!limiter.allowed(input.clientKey, input.now)) return { status: 429 };
    const matched = input.passphrase !== null && (await passphraseMatches(input.passphrase, config.secret));
    if (!matched) {
      limiter.recordFailure(input.clientKey, input.now);
      return { status: 401 };
    }
    const token = await issueAccessToken(config.secret, input.now, input.nonce);
    return { status: 303, location: '/dashboard', cookie: accessCookie(token, { https: input.https, production: input.production }) };
  });
}

/** Sign-out clears the cookie on this browser and nothing else; the token itself stays valid until it expires or is revoked. */
export function handleSignOut(request: RequestTransport): SignOutOutcome {
  return { status: 303, location: '/pilot-access', cookie: clearedAccessCookie(request) };
}

/** The `Set-Cookie` value for a cookie: `name=value; Path=...; Max-Age=...; HttpOnly; SameSite=...`, and `; Secure` exactly when `secure`. */
export function serialiseCookie(cookie: CookieAttributes): string {
  const sameSite = cookie.sameSite.charAt(0).toUpperCase() + cookie.sameSite.slice(1);
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${cookie.path}`, `Max-Age=${cookie.maxAge}`];
  if (cookie.httpOnly) parts.push('HttpOnly');
  parts.push(`SameSite=${sameSite}`);
  if (cookie.secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * The `passphrase` a request carried, from a url-encoded form, a multipart form or a JSON object, or null when it carried none
 * of those: a missing field, a value that is not a string, a body that does not parse and a media type that is none of the three
 * all give null, so the caller answers them as a wrong passphrase and never as a server error.
 */
export async function readPassphrase(request: Request): Promise<string | null> {
  const mediaType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  try {
    if (mediaType === 'application/json') {
      const body: unknown = await request.json();
      const value = typeof body === 'object' && body !== null ? (body as { passphrase?: unknown }).passphrase : undefined;
      return typeof value === 'string' ? value : null;
    }
    if (mediaType === 'application/x-www-form-urlencoded' || mediaType === 'multipart/form-data') {
      const value = (await request.formData()).get('passphrase');
      return typeof value === 'string' ? value : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** 128 random bits as 22 base64url characters, which is what the token format carries as a nonce. */
export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The sentence for each reason the gate or the route sends a visitor to the access page with. A `Map`, so no inherited name is a key. */
const REASON_MESSAGES = new Map<string, string>([
  ['no_session', 'Enter the passphrase to open the dashboard.'],
  ['expired', 'That session has ended. Sessions last 12 hours. Enter the passphrase to start a new one.'],
  ['revoked', 'That session is no longer accepted. Enter the passphrase to start a new one.'],
  ['bad_signature', 'That session was not accepted. Enter the passphrase to start a new one.'],
  ['malformed', 'That session could not be read. Enter the passphrase to start a new one.'],
  ['refused', 'That passphrase was not accepted.'],
  ['limited', 'Too many passphrases were refused. Wait fifteen minutes, then try again.'],
  ['unconfigured', 'Pilot access is not configured on this server, so no passphrase can be accepted.'],
  ['too_large', 'That request was too large to be a sign-in.'],
  ['cross_site', 'That request did not come from this site, so it was refused.'],
]);

/** The sentence for a reason from the query string, or null for anything that is not exactly one of the ten; the input is never echoed. */
export function accessReasonMessage(reason: string | undefined): string | null {
  if (reason === undefined) return null;
  return REASON_MESSAGES.get(reason) ?? null;
}

/** The reason a refusal is sent to the access page with. */
const REFUSAL_REASON = { 401: 'refused', 403: 'cross_site', 413: 'too_large', 429: 'limited', 503: 'unconfigured' } as const;

/** Whether the client asked for a page: `text/html` anywhere in `Accept`, in any letter case, as the middleware reads it. */
function wantsHtml(accept: string | null): boolean {
  return accept !== null && accept.toLowerCase().includes('text/html');
}

/** The two headers a browser writes to say where a request came from, as `sameOriginVerdict` takes them; null where one is absent. */
function fetchOriginHeaders(request: Request): FetchOriginHeaders {
  return { origin: request.headers.get('origin'), secFetchSite: request.headers.get('sec-fetch-site') };
}

/** The configured origin when it is usable and null when it is not, which is what `sameOriginVerdict` compares an `Origin` with. */
function usableOrigin(value: string | undefined): string | null {
  const read = readPublicOrigin(value);
  return read.ok ? read.origin : null;
}

/** Whether the request URL is HTTPS: the scheme Next gave it, which a client's `X-Forwarded-Proto` can make `https` and never `http`. */
function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

/** A 303 to a path on the host the request used: relative, uncacheable, and carrying the cookie when there is one. */
function redirect(location: string, cookie?: CookieAttributes): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store', Location: location });
  if (cookie !== undefined) headers.append('Set-Cookie', serialiseCookie(cookie));
  return new Response(null, { status: 303, headers });
}

/** A refusal: a relative 303 to the access page with the reason for a browser, and the status with the reason as JSON for anything else. */
function refuse(status: keyof typeof REFUSAL_REASON, accept: string | null): Response {
  const reason = REFUSAL_REASON[status];
  if (wantsHtml(accept)) return redirect(`/pilot-access?reason=${reason}`);
  return new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

function respond(outcome: AccessOutcome, accept: string | null): Response {
  if (outcome.status === 303) return redirect(outcome.location, outcome.cookie);
  return refuse(outcome.status, accept);
}

/**
 * The handler for `POST /api/pilot-access` over the values it is handed. The shared limiter key is the only key it uses, and it
 * reads four request headers: `Accept` for how a refusal is delivered, `Origin` and `Sec-Fetch-Site` for where the post came from,
 * and `Content-Type` for the body; the body reader reads `Content-Length` as well, to refuse a body declared too large. The
 * environment is read once, first: an unusable public origin is answered as unconfigured, and then a cross-site post is refused,
 * before the body is touched.
 */
export function accessRoute(deps: AccessRouteDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const accept = request.headers.get('accept');
    const env = deps.env();
    if (!readPublicOrigin(env[PUBLIC_ORIGIN_ENV]).ok) {
      console.warn('pilot-access: refused (503)');
      return refuse(503, accept);
    }
    if (!sameOriginVerdict(fetchOriginHeaders(request), usableOrigin(env[PUBLIC_ORIGIN_ENV])).allowed) {
      console.warn('pilot-access: refused (403)');
      return refuse(403, accept);
    }
    const body = await readBodyWithin(request, PILOT_ACCESS_BODY_LIMIT);
    if (!body.ok) {
      console.warn('pilot-access: refused (413)');
      return refuse(413, accept);
    }
    const passphrase = await readPassphrase(withBoundedBody(request, body.bytes));
    const outcome = await handleAccessRequest(
      {
        env,
        now: deps.now(),
        clientKey: SHARED_LIMITER_KEY,
        passphrase,
        https: isHttps(request),
        production: deps.production(),
        nonce: deps.nonce(),
      },
      deps.limiter,
    );
    if (outcome.status !== 303) console.warn(`pilot-access: refused (${outcome.status})`);
    return respond(outcome, accept);
  };
}

/**
 * The handler for `POST /api/pilot-access/sign-out`. It reads the public origin and three request headers, `Origin` and
 * `Sec-Fetch-Site` for where the post came from and `Accept` for how a refusal is delivered, and no secret and no body: it clears
 * the cookie whatever the gate's state for a post from the site, and refuses one from another site without touching the cookie.
 */
export function signOutRoute(deps: SignOutRouteDeps): (request: Request) => Response {
  return (request) => {
    if (!sameOriginVerdict(fetchOriginHeaders(request), usableOrigin(deps.publicOrigin())).allowed) {
      console.warn('pilot-access: refused (403)');
      return refuse(403, request.headers.get('accept'));
    }
    const outcome = handleSignOut({ https: isHttps(request), production: deps.production() });
    return redirect(outcome.location, outcome.cookie);
  };
}
