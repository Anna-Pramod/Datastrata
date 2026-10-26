/**
 * Whether this server shows the passphrase pilot surface at all: the one switch in front of the five routes of the pilot gate,
 * `/dashboard`, `/pilot-access`, `/api/pilot-access`, `/api/pilot-access/sign-out` and `/login` (DP1 plan, DG-10 and Task 7).
 *
 * **Why a switch, and why it is off unless a server turns it on.** The gate is a pilot's surface, made for a local screen-share, and
 * the hosted site is public. Deployed as it stands, unconfigured, `/dashboard` would show visitors a page listing the missing variable
 * names, and the sign-in route would stay reachable to anyone; exposing a passphrase gate publicly needs DEP-6, the independent
 * authentication review, which is a DP2 row. So the surface answers only where a server sets `DATASTRATA_PILOT_GATE=on`, and the host
 * never sets it. While it is off, each of the five routes answers 404 before it reads any secret, profile, cookie, header, search
 * parameter or body: a page renders the standard 404, a route handler answers `{"error":"not_found"}`, and the middleware answers 404
 * for `/dashboard` itself. When it is on, the gate behaves exactly as it did before the switch existed.
 *
 * **Why exactly `on`.** The value is on only when it is those two letters, in lower case, with nothing around them. `ON`, ` on`,
 * `true`, `1` and everything else are off, as is the variable unset or empty. A near miss therefore fails closed, the surface hidden
 * rather than shown, and there is one spelling to write in a local start command and to check.
 *
 * **Why this module imports nothing and reads nothing.** The middleware runs on the Edge runtime, which does not promise a complete
 * `process.env`, and it holds its imports to modules that cannot reach a profile; the pages and the route handlers run on Node. Each
 * reads the variable by name, `process.env.DATASTRATA_PILOT_GATE`, as the first thing it does, and hands it here in a record, so the
 * decision is one rule in one place and every caller still chooses where its value comes from. A test holds this module to no imports
 * and no environment read, and the function to reading that one key of the record it is handed.
 */

/** The switch a server sets to show the pilot surface: exactly `on`, server-side only, never `NEXT_PUBLIC_`. The host never sets it. */
export const PILOT_GATE_ENV = 'DATASTRATA_PILOT_GATE';

/** Whether the pilot surface is on: true only when `DATASTRATA_PILOT_GATE` is exactly the string `on`; unset, empty and every other value are off. */
export function pilotSurfaceEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[PILOT_GATE_ENV] === 'on';
}
