/**
 * What the dashboard page decides for itself before it reads a configured profile, and the one line of its topbar that depends on the
 * answer.
 *
 * **Why the page decides again.** `middleware.ts` refuses a stranger before any page code runs, but it is the first place the gate is
 * enforced and not the only one. A matcher edited by mistake, a route moved out from under `/dashboard` or a middleware that failed to
 * load would each leave the page answering whoever asks, and the page is the only reader of a configured profile. So the page asks the
 * module the middleware asks (`accessDecision`, over the same environment, cookie and clock) before it reads anything, and neither
 * enforcement point relies on the other.
 *
 * **Why the reader is handed in and called in one branch.** Reading the profile is the act the gate guards: it opens the file the
 * environment names, assesses it and logs a refusal's operator detail. `gatedRecord` takes the reader as a function and calls it for an
 * allowed session only, so "the profile was not read" is a count a test can take. A page that read first and decided afterwards would
 * read the profile for every stranger and show them nothing; handing the reader over instead of calling it makes that order hard to
 * write by accident, and a test holds the page to it. The module imports only the access module, so it has no reader of its own to call
 * by another route, and it is generic in what the reader returns because the page hands it `pilotRecord` and a test hands it a counter.
 *
 * **Why a refusal is a value carrying the gate's own words.** `unconfigured` brings the access module's problems, which name a variable
 * and never its value, so the page may print them. `denied` brings the reason as the gate gave it, and the page looks the sentence up
 * in the sign-in handler's fixed map, so this module holds no wording and nothing a visitor writes can reach it.
 *
 * **Why the expiry is written here, in UTC.** The topbar tells the person when their session ends and they act on it, so the label is
 * the minute with the zone spelled out: it needs neither the server's time zone nor the reader's. It is a pure function in this module
 * so that a test can hold it with values, because the page and the topbar are JSX and the runner does not transform JSX.
 */

import { accessDecision } from '@/lib/access';

export type GatedRecord<T> =
  | { status: 'unconfigured'; problems: string[] }
  | { status: 'denied'; reason: string }
  | { status: 'allowed'; record: T; expiresAt: Date };

/**
 * The decision on one visit, and the record only if it is yes: `deps.record` is called once in the allowed branch and in no other.
 * The environment, the Cookie header and the clock are the caller's; this function reads none of them itself.
 */
export async function gatedRecord<T>(
  input: { env: Readonly<Record<string, string | undefined>>; cookieHeader: string | null; now: Date },
  deps: { record: () => T },
): Promise<GatedRecord<T>> {
  const decision = await accessDecision(input);
  if (decision.kind === 'unconfigured') return { status: 'unconfigured', problems: decision.problems };
  if (decision.kind === 'denied') return { status: 'denied', reason: decision.reason };
  return { status: 'allowed', record: deps.record(), expiresAt: decision.expiresAt };
}

/**
 * An instant as the topbar writes it, `2026-10-21 05:30 UTC`: the minute, in UTC, read through `toISOString` and so independent of
 * the process's time zone. Seconds are dropped and never rounded up, because a label that rounded up would say a session lasts longer
 * than it does.
 */
export function utcMinute(instant: Date): string {
  const iso = instant.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}
