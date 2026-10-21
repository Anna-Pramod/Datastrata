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
 * its imports to `next/server` and the access module.
 *
 * **Why the answer is a pure function of the decision.** `decideResponse` maps
 * the decision and the client's `Accept` header to a status, a body and a
 * location as plain data, so the whole response policy is tested without the
 * Next runtime and the adapter below only translates it. An unconfigured gate
 * is the operator's fault, so it answers 503, never a redirect to a sign-in
 * page that could not succeed, and the body says what is wrong: "Pilot access
 * is not configured on this server." and then each problem the configuration
 * has, one per line. Each names its variable and none prints a value, so a
 * revocation setting at fault is reported as that, and a new secret is asked
 * for only when the secret is itself the problem. A refused browser
 * navigation goes to the sign-in page with 303, so that a refused POST is
 * retried as a GET; anything else (a script, a client-side navigation's
 * payload request) gets 401 and the reason as JSON, since a redirect would
 * answer a request for data with a page.
 *
 * **Why every response is private and varies on the cookie.** The answer
 * depends on a cookie, so no shared cache may replay a pass to a visitor
 * without a session, or a refusal to one with a session. The pass-through
 * carries the headers too.
 *
 * **Why the environment is read here, by name.** This runs on the Edge
 * runtime, which does not promise a complete `process.env` object: what a host
 * supplies there can be limited to the variables a file names as
 * `process.env.NAME`. The two variables are read by name for each request and
 * handed to the gate as a record. The values are those the server process
 * holds, its environment as taken when the server starts, so the secret must
 * be set before the server starts, and a change made in a shell takes effect
 * when the server restarts. `middlewareWith` takes that record and a clock,
 * which is how tests supply both.
 *
 * **Why the matcher is exact.** Next reads `config` without running this
 * module, so it must be a literal. `/pilot-access` and `/api/pilot-access`
 * stay outside it on purpose: a gated sign-in page would redirect a refusal to
 * a page that is itself refused.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_REVOKED_BEFORE_ENV, ACCESS_SECRET_ENV, accessDecision, type AccessDecision } from '@/lib/access';

/** An answer as plain data, which is what lets the policy be tested without the Next runtime. */
export interface ResponsePlan {
  status: 200 | 303 | 401 | 503;
  /** Where a 303 points: a path and query on the request's own origin, resolved against the request URL by the adapter. */
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

/**
 * What a decision is answered with. Only `accept` is read: the redirect target
 * is a path on the request's own origin, which the adapter resolves against
 * `url`.
 */
export function decideResponse(decision: AccessDecision, request: { accept: string | null; url: string }): ResponsePlan {
  switch (decision.kind) {
    case 'unconfigured':
      return { status: 503, body: [NOT_CONFIGURED, ...decision.problems].join('\n'), contentType: 'text/plain; charset=utf-8' };
    case 'denied':
      if (wantsHtml(request.accept)) return { status: 303, location: `/pilot-access?reason=${decision.reason}` };
      return { status: 401, body: JSON.stringify({ error: 'unauthorized', reason: decision.reason }), contentType: 'application/json' };
    case 'allowed':
      return { status: 200 };
  }
}

/**
 * The two variables the gate reads, named in full: the Edge runtime does not
 * promise a complete `process.env` object, and a host may supply only the
 * variables a file names as `process.env.NAME`, so `process.env` is never handed
 * on as a whole. A test holds the names here to the access module's.
 */
function pilotEnvironment(): Record<string, string | undefined> {
  return {
    [ACCESS_SECRET_ENV]: process.env.DATASTRATA_PILOT_ACCESS_SECRET,
    [ACCESS_REVOKED_BEFORE_ENV]: process.env.DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE,
  };
}

/** The plan as a Next response. Every response, the pass-through included, is private and varies on the cookie. */
function toResponse(plan: ResponsePlan, request: NextRequest): NextResponse {
  let response: NextResponse;
  if (plan.status === 200) {
    response = NextResponse.next();
  } else if (plan.location !== undefined) {
    response = NextResponse.redirect(new URL(plan.location, request.url), plan.status);
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
 * the tests drive it: the decision is the access module's, the response is
 * `decideResponse`'s, and nothing here reads the machine it runs on.
 */
export function middlewareWith(
  env: Readonly<Record<string, string | undefined>>,
  now: () => Date,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const decision = await accessDecision({ env, cookieHeader: request.headers.get('cookie'), now: now() });
    return toResponse(decideResponse(decision, { accept: request.headers.get('accept'), url: request.url }), request);
  };
}

/** What Next runs: `middlewareWith` over the real clock and the real environment, read for each request as the server process holds it, which is as it was when the server started. */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  return middlewareWith(pilotEnvironment(), () => new Date())(request);
}

/** A literal, because Next reads it without running this module. */
export const config = { matcher: ['/dashboard/:path*'] };
