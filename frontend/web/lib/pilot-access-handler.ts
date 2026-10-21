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
 * **Why a refusal is a status to a script and a redirect to a browser.** A form post is answered with whatever the browser then
 * shows, and a bare 401 after a form post is a blank page. A client that accepts HTML, by the rule the middleware uses, is sent
 * back to `/pilot-access?reason=refused`, `limited` or `unconfigured`, where a fixed map says it in a sentence. Any other client
 * gets the status the decision gave and a one-key JSON body naming the same reason. A success is a 303 to `/dashboard` for everyone.
 *
 * **Why a plain `Response` with a relative `Location`.** `NextResponse.redirect` demands an absolute URL, and Next normalises a
 * loopback request URL to `localhost`, which would move a browser off the host its session cookie belongs to (design section 5).
 * A 303 built here carries exactly `/dashboard`, `/pilot-access` or `/pilot-access?reason=...`, so the browser stays on the host it
 * used. Every response carries `Cache-Control: no-store`.
 *
 * **Why the protocol is the request's own.** `Secure` is set when the request URL is HTTPS or the deployment is production, and
 * left off only for plain-HTTP loopback so the local look keeps working. `X-Forwarded-Proto` is written by the client, so it is
 * not read.
 *
 * **Why a refusal logs a status and nothing else.** The line is `pilot-access: refused (<status>)`. The submitted passphrase, the
 * secret and any token are never handed to a logger, and a response body is one of three fixed strings, so neither can reach a
 * log or a client by way of this module.
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
 * `input.now`, the one instant the limiter and the token use as well, so no second clock is read inside the decision.
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
]);

/** The sentence for a reason from the query string, or null for anything that is not exactly one of the eight; the input is never echoed. */
export function accessReasonMessage(reason: string | undefined): string | null {
  if (reason === undefined) return null;
  return REASON_MESSAGES.get(reason) ?? null;
}

/** The reason a refusal is sent to the access page with. */
const REFUSAL_REASON = { 401: 'refused', 429: 'limited', 503: 'unconfigured' } as const;

/** Whether the client asked for a page: `text/html` anywhere in `Accept`, in any letter case, as the middleware reads it. */
function wantsHtml(accept: string | null): boolean {
  return accept !== null && accept.toLowerCase().includes('text/html');
}

/** Whether the request itself arrived over HTTPS. The URL says; a header the client writes does not. */
function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

/** A 303 to a path on the host the request used: relative, uncacheable, and carrying the cookie when there is one. */
function redirect(location: string, cookie?: CookieAttributes): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store', Location: location });
  if (cookie !== undefined) headers.append('Set-Cookie', serialiseCookie(cookie));
  return new Response(null, { status: 303, headers });
}

function respond(outcome: AccessOutcome, accept: string | null): Response {
  if (outcome.status === 303) return redirect(outcome.location, outcome.cookie);
  const reason = REFUSAL_REASON[outcome.status];
  if (wantsHtml(accept)) return redirect(`/pilot-access?reason=${reason}`);
  return new Response(JSON.stringify({ error: reason }), {
    status: outcome.status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}

/**
 * The handler for `POST /api/pilot-access` over the values it is handed. The shared limiter key is the only key it uses, and it
 * reads two request headers, `Content-Type` for the body and `Accept` for how a refusal is delivered.
 */
export function accessRoute(deps: AccessRouteDeps): (request: Request) => Promise<Response> {
  return async (request) => {
    const passphrase = await readPassphrase(request);
    const outcome = await handleAccessRequest(
      {
        env: deps.env(),
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
    return respond(outcome, request.headers.get('accept'));
  };
}

/** The handler for `POST /api/pilot-access/sign-out`: it reads no secret and no body, so it clears the cookie whatever the gate's state. */
export function signOutRoute(deps: SignOutRouteDeps): (request: Request) => Response {
  return (request) => {
    const outcome = handleSignOut({ https: isHttps(request), production: deps.production() });
    return redirect(outcome.location, outcome.cookie);
  };
}
