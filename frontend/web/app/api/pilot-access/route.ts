/**
 * POST /api/pilot-access: the one place the sign-in logic meets the machine it runs on.
 *
 * **Why so little is here.** Next accepts nothing from a route file but its handlers and its segment config, so everything that can
 * be tested lives in `lib/pilot-access-handler.ts`, and this file only chooses the real values to hand it: the two access
 * variables, the public origin, the mode, the clock, a nonce source and a limiter. Each is something a slip here would get wrong
 * with no other test noticing (a secret read from the wrong variable, a clock read once at load, a limiter made for each request
 * and so counting nothing), which is why the route tests drive this exported `POST` itself with synthetic values.
 *
 * **Why the environment is read here, by name, for each request.** The two access variables, `DATASTRATA_PUBLIC_ORIGIN` and
 * `NODE_ENV` are read as static `process.env.NAME` reads, as the middleware reads them, and afresh for each request, so the answer
 * is always about the configuration as this process holds it (its environment, taken when the server starts). `process.env` is
 * never handed on as a whole. The origin is read here although this route redirects relatively: the handler refuses sign-in while
 * the origin is unusable, because the gate then refuses every session it could issue.
 *
 * **Why one limiter, made once.** Failed attempts are counted in process memory, which is adequate for the single local process
 * Stage 1a runs and is a stated limitation (design sections 2 and 5): it starts empty whenever the process restarts or the dev
 * server reloads this module. It is made once because a limiter that lives for a single request counts nothing.
 *
 * **Why the Node runtime, and why `force-dynamic`.** The limiter is process memory and the secret comes from the process
 * environment, and the Edge runtime promises neither a long-lived module nor a complete environment. The answer depends on the
 * environment, the clock and earlier failures, so nothing about it may be prerendered or cached.
 *
 * **Why this route stands outside the middleware.** The middleware matches `/dashboard/:path*` only. A gated sign-in route could
 * never be reached by someone who has no session yet.
 */

import { ACCESS_REVOKED_BEFORE_ENV, ACCESS_SECRET_ENV, AttemptLimiter } from '@/lib/access';
import { accessRoute, randomNonce } from '@/lib/pilot-access-handler';
import { PUBLIC_ORIGIN_ENV } from '@/lib/public-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = accessRoute({
  env: () => ({
    [ACCESS_SECRET_ENV]: process.env.DATASTRATA_PILOT_ACCESS_SECRET,
    [ACCESS_REVOKED_BEFORE_ENV]: process.env.DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE,
    [PUBLIC_ORIGIN_ENV]: process.env.DATASTRATA_PUBLIC_ORIGIN,
  }),
  now: () => new Date(),
  limiter: new AttemptLimiter(),
  nonce: randomNonce,
  production: () => process.env.NODE_ENV === 'production',
});
