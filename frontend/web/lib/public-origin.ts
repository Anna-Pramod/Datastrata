/**
 * The origin browsers use to reach the site, configured rather than derived: the one place a configured value is judged fit to
 * build a redirect from, and the one place a sign-in or sign-out post is judged to have come from it.
 *
 * **Why the origin is configured.** The pilot access gate sends a refused browser to `/pilot-access`, and the middleware that does
 * so cannot answer with a relative `Location`: `NextResponse.redirect` refuses one, and a hand-built one is re-parsed by Next's
 * middleware adapter without a base and reaches the client as a 500 (pilot readiness investigation, B3.1 and B3.2). The absolute URL
 * cannot be taken from the request either. Next builds `request.url` from the hostname the server was started with, not the one the
 * browser used; it ignores `Host`, `X-Forwarded-Host`, `X-Forwarded-Port` and `Forwarded`, and takes the scheme from any
 * `X-Forwarded-Proto` that contains `https`, which any client can send (B3.3). Behind a proxy, a server bound to 127.0.0.1 would send
 * real browsers to `https://localhost:<port>`. One configured origin, `DATASTRATA_PUBLIC_ORIGIN`, gave the same correct `Location`
 * under every header set in every server mode tried (B3.5), and it trusts no header at all.
 *
 * **Why a value must be exactly an origin.** The redirect is the value with a path appended, so the value must be what a browser
 * itself writes as an origin: the scheme and host in lower case, a port only when it is not the scheme's default, and nothing else,
 * no path, trailing slash, query, fragment, user name or surrounding space. The rule is applied by comparison, not by repair: the
 * value must equal the `origin` the URL parser gives for it. A value that differs is a mistake to report, not one to guess past,
 * because the same value is what the cross-site check (B2) compares a browser's `Origin` header with, and that comparison is exact.
 *
 * **Why `https`, or `http` on `localhost` alone.** The session cookie travels to this origin. Over plain http on any other name it
 * would cross the network unencrypted; on `localhost` it never leaves the machine, which is what a local evaluation needs.
 *
 * **Why a loopback address is refused.** Next's middleware adapter re-parses an absolute `Location` with its own URL parser, which
 * rewrites any `127.x.x.x` or `[::1]` host to `localhost` (`next/dist/server/web/next-url.js`, `adapter.js`). A configured
 * `http://127.0.0.1:3000` would reach the browser as `http://localhost:3000/...`, a different host from the one it signed in on,
 * where its session cookie is not sent. The loopback check comes before the scheme check, so such a value is told to write
 * `localhost` rather than told it needs https.
 *
 * **Why a problem never prints the value.** The middleware's 503 prints the problem, and a value written in the wrong variable can
 * be a secret. Each problem names the variable, says which rule the value broke and what form is wanted, in placeholders, as the
 * access module's problems do.
 *
 * **Why the cross-site judgement lives here too (B2).** Sign-in and sign-out are form posts, and a form on any website can post to
 * them from a visitor's browser: without a check, any page a visitor opens could spend the shared limiter's five failures, which
 * locks every pilot user out, or sign the visitor out. A browser says where a post came from in two headers that it writes itself
 * and no page can set: `Origin` and `Sec-Fetch-Site`. `sameOriginVerdict` judges them against the configured origin, the value the
 * redirects are built from, and names the case that decided:
 * - `origin`: the request carries `Origin`. It is compared exactly with the configured origin, which is correct because a browser
 *   writes its origin in exactly the form `readPublicOrigin` demands of the value, so a different scheme, host or port, a trailing
 *   slash, the opaque origin `null` and two joined values are all refused. `Sec-Fetch-Site` is not consulted, because `Origin`
 *   already says which origin the post came from. With no usable origin to compare with (sign-out only; sign-in refuses an
 *   unusable origin first), the `Origin` cannot be judged, and only `Sec-Fetch-Site: same-origin` lets the request through, so
 *   sign-out keeps working on a misconfigured server for a browser that sends `Sec-Fetch-Site`.
 * - `sec-fetch-site`: the request carries `Sec-Fetch-Site` and no `Origin`. Only `same-origin` is allowed: `same-site` (a sibling
 *   subdomain), `cross-site`, `none` and anything else are refused.
 * - `neither`: allowed, as a compatibility exception, not as a judgement that the request is safe. Scripts, `curl` and an
 *   operator's own checks send neither header, and refusing them would break the scripted sign-in the gate has always accepted;
 *   the limiter and the passphrase still apply to them. The exception rests on an assumption about the pilot's browsers, not on
 *   anything the request proves: current versions of the major browsers send `Origin` on every POST, so from them a post with
 *   neither header does not arise. An older browser, or one whose headers an extension or an intermediary proxy strips, can send
 *   one, and such a post may be driven by another site and carry the cookies that browser holds for this host; it is let through
 *   unjudged. What it can do is bounded. It cannot carry the session cookie, which is scoped to `/dashboard` and so is never sent
 *   to these routes. Through sign-in it still needs the passphrase and is counted by the shared limiter, which any client can
 *   already spend by posting directly (pilot readiness B1). Through sign-out it can clear that browser's session cookie, which
 *   costs its owner a sign-in.
 *
 * **Why nothing is imported and nothing is read.** The middleware runs on the Edge runtime and the sign-in route on Node; both
 * hand this module the value they read by name and act on its verdict, and the routes hand it the two header values they read. It
 * is pure, so every rule is tested by calling it directly.
 */

/** The origin browsers use to reach the site, for example `https://pilot.example.org`. Server-side only, never `NEXT_PUBLIC_`. */
export const PUBLIC_ORIGIN_ENV = 'DATASTRATA_PUBLIC_ORIGIN';

export type PublicOrigin = { ok: true; origin: string } | { ok: false; problem: string };

/** What every problem asks for, in placeholders: no example host or port, so no value can be mistaken for an echo of itself. */
const WANTED =
  'Set it to the origin browsers use to reach this site: https://<host>, or https://<host>:<port>, or http://localhost:<port> on one machine.';

const NOT_EXACT = `${PUBLIC_ORIGIN_ENV} is not an origin as a browser writes one: the scheme and host in lower case, a port only when it is not the scheme's default, and no path, trailing slash, query, fragment, user name or surrounding space. ${WANTED}`;
const NOT_HTTPS = `${PUBLIC_ORIGIN_ENV} does not use https, and only localhost may use plain http. ${WANTED}`;
const LOOPBACK = `${PUBLIC_ORIGIN_ENV} names a loopback address, which Next rewrites to localhost in a redirect, so a browser would be moved off the host its session cookie belongs to; write localhost in its place. ${WANTED}`;

/** An IPv4 address in 127.0.0.0/8 as the URL parser writes it, or the IPv6 loopback in its brackets; any other spelling is not an origin. */
function isLoopback(hostname: string): boolean {
  return hostname === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/**
 * The configured origin, or the one problem that makes it unusable: unset, blank, not exactly an origin, a loopback address, or
 * neither https nor http on localhost, judged in that order.
 */
export function readPublicOrigin(value: string | undefined): PublicOrigin {
  if (value === undefined) return { ok: false, problem: `${PUBLIC_ORIGIN_ENV} is not set. ${WANTED}` };
  if (value.trim() === '') return { ok: false, problem: `${PUBLIC_ORIGIN_ENV} is set but blank. ${WANTED}` };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, problem: NOT_EXACT };
  }
  if (url.origin !== value) return { ok: false, problem: NOT_EXACT };
  if (isLoopback(url.hostname)) return { ok: false, problem: LOOPBACK };
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return { ok: false, problem: NOT_HTTPS };
  return { ok: true, origin: url.origin };
}

/** The two headers a browser writes to say where a request came from, as the caller read them: null where a header is absent. */
export interface FetchOriginHeaders {
  origin: string | null;
  secFetchSite: string | null;
}

/** Which of the three cases decided (`origin`, `sec-fetch-site` or `neither`, by the headers present), and whether the request may go on. */
export interface SameOriginVerdict {
  case: 'origin' | 'sec-fetch-site' | 'neither';
  allowed: boolean;
}

/** The one value of `Sec-Fetch-Site` that says a request came from this origin. */
const SAME_ORIGIN = 'same-origin';

/**
 * Whether a request came from the site itself, judged from its `Origin` and `Sec-Fetch-Site` against `publicOrigin`, the configured
 * origin when it is usable and null when it is not. The module comment gives the three cases and why each is decided as it is.
 */
export function sameOriginVerdict({ origin, secFetchSite }: FetchOriginHeaders, publicOrigin: string | null): SameOriginVerdict {
  if (origin !== null) return { case: 'origin', allowed: publicOrigin === null ? secFetchSite === SAME_ORIGIN : origin === publicOrigin };
  if (secFetchSite !== null) return { case: 'sec-fetch-site', allowed: secFetchSite === SAME_ORIGIN };
  return { case: 'neither', allowed: true };
}
