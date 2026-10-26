/**
 * The pilot access gate's first enforcement point: a request for the dashboard
 * without a valid session is answered here, before any page code runs.
 *
 * **Why the gate is enforced twice.** Stage 1a puts everything under
 * `/dashboard`, and with it the only page that reads a configured profile,
 * behind a session issued from a server-side secret. This file refuses early;
 * the page decides again, through the same `accessDecision`, before it reads
 * the profile, because a matcher changed by mistake or a regression below
 * would otherwise leave the record with nothing in front of it. For the same
 * reason this file reads no profile and imports neither the record, the pack
 * nor the filesystem: a defect here can wave a request through to the page,
 * which decides again, but cannot itself disclose a profile, and a test holds
 * its imports to `next/server`, the access module, the public-origin module
 * and the hosting-mode module, the last two importing nothing.
 *
 * **Why the pilot switch is read first, and alone while it is off.** The gate
 * is a pilot's surface and the hosted site is public (DP1 plan, DG-10): unless
 * a server sets `DATASTRATA_PILOT_GATE=on`, `/dashboard` answers 404 here,
 * decided before the decision, the cookie, the public origin or any access
 * variable is read, so a server that never turned the surface on never reaches
 * the gate's configuration at all. The 404 is plain data like every other
 * answer (`surfaceOffResponse`): `{"error":"not_found"}` as JSON, private and
 * varying on the cookie like the rest, and never a cookie. It is answered
 * directly rather than by a rewrite to the 404 page, because a rewrite needs an
 * absolute URL, which this file builds only from the configured origin, and
 * reading that origin is reading configuration the switch exists to leave
 * unread. The page decides the switch again, as it decides the gate again, and
 * renders the standard 404 if a request ever reaches it with the switch off.
 *
 * **Why the answer is a pure function of the decision.** `decideResponse` maps
 * the decision, the client's `Accept` header and the configured origin's
 * verdict to a status, a body and a location as plain data, so the whole
 * response policy is tested without the Next runtime and the adapter below
 * only translates it. An unconfigured gate is the operator's fault, so it
 * answers 503, never a redirect to a sign-in page that could not succeed, and
 * the body says what is wrong: "Pilot access is not configured on this
 * server." and then each problem the configuration has, one per line. Each
 * names its variable and none prints a value, so a revocation setting at fault
 * is reported as that, and a new secret is asked for only when the secret is
 * itself the problem. A refused browser navigation goes to the sign-in page
 * with 303, so that a refused POST is retried as a GET; anything else (a
 * script, a client-side navigation's payload request) gets 401 and the reason
 * as JSON, since a redirect would answer a request for data with a page.
 *
 * **Why the redirect goes to a configured origin, never to the request's.**
 * Middleware cannot redirect relatively: `NextResponse.redirect` refuses a
 * relative URL, and a hand-built relative `Location` is re-parsed by Next's
 * adapter without a base and reaches the client as a 500. Nor is the request
 * URL the browser's: Next builds it from the hostname the server was started
 * with, ignores `Host` and `X-Forwarded-Host`, and takes its scheme from any
 * `X-Forwarded-Proto` containing `https` (pilot readiness investigation,
 * B3.1–B3.3), so a server bound to 127.0.0.1 behind a proxy would send real
 * browsers to `https://localhost:<port>`. The 303 therefore goes to exactly
 * `<DATASTRATA_PUBLIC_ORIGIN>/pilot-access?reason=<reason>`, built from the
 * origin `lib/public-origin.ts` has validated, and nothing here reads the
 * request's URL. An unusable origin fails the gate closed like an unusable
 * secret: every request, a valid session's included, is answered 503 with the
 * access module's problems (if any) and then the origin's, because a gate that
 * could not send a refused browser anywhere sensible must not let anyone
 * through on the strength of a configuration it already knows is wrong.
 *
 * **Why every response is private and varies on the cookie.** The answer
 * depends on a cookie, so no shared cache may replay a pass to a visitor
 * without a session, or a refusal to one with a session. The pass-through
 * carries the headers too.
 *
 * **Why the environment is read here, by name.** This runs on the Edge
 * runtime, which does not promise a complete `process.env` object: what a host
 * supplies there can be limited to the variables a file names as
 * `process.env.NAME`. The pilot switch, the two access variables and the
 * public origin are read by name for each request, the switch first and the
 * other three only once it is on, and handed to the gate as a record. The
 * values are those the server process holds, its environment as taken when
 * the server starts, so the switch, the secret and the origin must be set
 * before the server starts, and a change made in a shell takes effect when the
 * server restarts. `middlewareWith` takes that record and a clock, which is how
 * tests supply both.
 *
 * **Why the matcher is exact.** Next reads `config` without running this
 * module, so it must be a literal. `/pilot-access` and `/api/pilot-access`
 * stay outside it on purpose: a gated sign-in page would redirect a refusal to
 * a page that is itself refused.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_REVOKED_BEFORE_ENV, ACCESS_SECRET_ENV, accessDecision, type AccessDecision } from '@/lib/access';
import { PILOT_GATE_ENV, pilotSurfaceEnabled } from '@/lib/hosting-mode';
import { PUBLIC_ORIGIN_ENV, readPublicOrigin, type PublicOrigin } from '@/lib/public-origin';

/** An answer as plain data, which is what lets the policy be tested without the Next runtime. */
export interface ResponsePlan {
  status: 200 | 303 | 401 | 404 | 503;
  /** Where a 303 points: an absolute URL on the configured public origin, handed to `NextResponse.redirect` as it is. */
  location?: string;
  body?: string;
  contentType?: string;
}

/** The 503's first line, said to an operator; the configuration's own problems follow it, one per line, naming variables and no value. */
const NOT_CONFIGURED = 'Pilot access is not configured on this server.';

/** Whether the client asked for a page: `text/html` anywhere in `Accept`, in any letter case. */
function wantsHtml(accept: string | null): boolean {
  return accept !== null && accept.toLowerCase().includes('text/html');
}

/** The 503: the first line, then each problem on a line of its own, in the order given. */
function notConfigured(problems: string[]): ResponsePlan {
  return { status: 503, body: [NOT_CONFIGURED, ...problems].join('\n'), contentType: 'text/plain; charset=utf-8' };
}

/**
 * What a decision is answered with, given the client's `Accept` and the configured origin's verdict. An unusable origin is a 503
 * for every decision, its problem after the access module's; a usable one is where a refused browser is sent, as an absolute URL.
 */
export function decideResponse(decision: AccessDecision, request: { accept: string | null; origin: PublicOrigin }): ResponsePlan {
  if (!request.origin.ok) {
    return notConfigured([...(decision.kind === 'unconfigured' ? decision.problems : []), request.origin.problem]);
  }
  switch (decision.kind) {
    case 'unconfigured':
      return notConfigured(decision.problems);
    case 'denied':
      if (wantsHtml(request.accept)) {
        return { status: 303, location: new URL(`/pilot-access?reason=${decision.reason}`, request.origin.origin).href };
      }
      return { status: 401, body: JSON.stringify({ error: 'unauthorized', reason: decision.reason }), contentType: 'application/json' };
    case 'allowed':
      return { status: 200 };
  }
}

/** The answer while the pilot surface is off, for every request: 404 and a one-key JSON body, decided from the switch alone. */
export function surfaceOffResponse(): ResponsePlan {
  return { status: 404, body: JSON.stringify({ error: 'not_found' }), contentType: 'application/json' };
}

/**
 * The variables the gate reads, named in full: the Edge runtime does not
 * promise a complete `process.env` object, and a host may supply only the
 * variables a file names as `process.env.NAME`, so `process.env` is never handed
 * on as a whole. The pilot switch is read first, and while it is off nothing
 * else is: the record then holds the switch alone, and `middlewareWith` answers
 * 404 from it. A test holds the names here to the switch's, the access
 * module's and the origin module's.
 */
function pilotEnvironment(): Record<string, string | undefined> {
  const surface = { [PILOT_GATE_ENV]: process.env.DATASTRATA_PILOT_GATE };
  if (!pilotSurfaceEnabled(surface)) return surface;
  return {
    ...surface,
    [ACCESS_SECRET_ENV]: process.env.DATASTRATA_PILOT_ACCESS_SECRET,
    [ACCESS_REVOKED_BEFORE_ENV]: process.env.DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE,
    [PUBLIC_ORIGIN_ENV]: process.env.DATASTRATA_PUBLIC_ORIGIN,
  };
}

/** The plan as a Next response. Every response, the pass-through and the surface-off 404 included, is private and varies on the cookie. */
function toResponse(plan: ResponsePlan): NextResponse {
  let response: NextResponse;
  if (plan.status === 200) {
    response = NextResponse.next();
  } else if (plan.location !== undefined) {
    response = NextResponse.redirect(plan.location, plan.status);
  } else {
    response = new NextResponse(plan.body, {
      status: plan.status,
      headers: plan.contentType === undefined ? undefined : { 'Content-Type': plan.contentType },
    });
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Cookie');
  return response;
}

/**
 * The middleware over an environment and a clock it is handed, which is how
 * the tests drive it: the switch is the hosting-mode module's, the decision is
 * the access module's, the origin's verdict is the origin module's, the
 * response is `surfaceOffResponse`'s or `decideResponse`'s, and nothing here
 * reads the machine it runs on. While the switch is off, it is the one key of
 * the environment read and nothing of the request is; otherwise, of the
 * request, only the `Cookie` and `Accept` headers are read.
 */
export function middlewareWith(
  env: Readonly<Record<string, string | undefined>>,
  now: () => Date,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    if (!pilotSurfaceEnabled(env)) return toResponse(surfaceOffResponse());
    const decision = await accessDecision({ env, cookieHeader: request.headers.get('cookie'), now: now() });
    const origin = readPublicOrigin(env[PUBLIC_ORIGIN_ENV]);
    return toResponse(decideResponse(decision, { accept: request.headers.get('accept'), origin }));
  };
}

/** What Next runs: `middlewareWith` over the real clock and the real environment, read for each request as the server process holds it, which is as it was when the server started. */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  return middlewareWith(pilotEnvironment(), () => new Date())(request);
}

/** A literal, because Next reads it without running this module. */
export const config = { matcher: ['/dashboard/:path*'] };
