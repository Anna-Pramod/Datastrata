/**
 * POST /api/pilot-access/sign-out: clears the session cookie on this browser, and nothing else.
 *
 * **Why it reads no secret.** Signing out has to work on a server whose gate is unconfigured, or whose secret was just rotated,
 * and clearing a cookie by name and path needs neither. It takes two things from the machine, each read by name for each request:
 * the mode, because the cleared cookie carries `Secure` by the same rule as the one it replaces, and `DATASTRATA_PUBLIC_ORIGIN`.
 *
 * **Why it reads the pilot switch first.** Sign-out is part of the pilot surface, which answers only where a server sets
 * `DATASTRATA_PILOT_GATE=on` (DP1 plan, DG-10). The switch is read by name, for each request, before anything else, and unless it is
 * `on` the route answers 404 and neither the origin nor the mode is read.
 *
 * **Why it reads the public origin.** A form on any website could otherwise post here and sign a visitor out, so a sign-out from
 * another site is refused (pilot readiness B2) by comparing the post's `Origin` with the configured origin. The value goes to the
 * handler as it is, and no body is read. Where it is unusable the handler still signs out a browser that says it posted from the
 * same origin, so a misconfigured server can still be left.
 *
 * **Why it is only a clear.** The session is a stateless signed token, so this cannot revoke it: the token stays valid in any
 * browser that holds a copy until it expires, or until access is revoked by rotating the secret or by setting
 * `DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE`. The access page says so.
 *
 * **Why the Node runtime, `force-dynamic` and no middleware.** The same as the sign-in route beside it: the answer depends on the
 * mode and must not be cached, and a sign-out that needed a session to reach it could not be used by someone whose session has
 * ended.
 */

import { signOutRoute } from '@/lib/pilot-access-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = signOutRoute({
  pilotSurface: () => process.env.DATASTRATA_PILOT_GATE,
  publicOrigin: () => process.env.DATASTRATA_PUBLIC_ORIGIN,
  production: () => process.env.NODE_ENV === 'production',
});
