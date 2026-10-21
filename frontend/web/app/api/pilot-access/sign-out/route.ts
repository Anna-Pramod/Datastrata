/**
 * POST /api/pilot-access/sign-out: clears the session cookie on this browser, and nothing else.
 *
 * **Why it reads no secret.** Signing out has to work on a server whose gate is unconfigured, or whose secret was just rotated,
 * and clearing a cookie by name and path needs neither. The only thing it takes from the machine is the mode, because the cleared
 * cookie carries `Secure` by the same rule as the one it replaces.
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

export const POST = signOutRoute({ production: () => process.env.NODE_ENV === 'production' });
