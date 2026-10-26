/**
 * One structured log line, carrying nothing a visitor sent (DP1 plan, Task 8; PLT-6, its DP1 part; §1, "Logs carry no answers";
 * §4.3).
 *
 * **Why a module for one line.** DataStrata stores no checker answers, and the answers exist only in the browser and in one
 * request's memory. A log line is the one thing a route writes that outlives the request: the host keeps runtime logs (Task 9,
 * record V4). So what a line may carry is fixed here, once, rather than at each call: the time, the event, the route, the status,
 * the duration and the release, and nothing else. That is enough to see a hosted fault (a run of `check.refused`, a `/healthz`
 * refusal, a release that changed) and nothing about who asked or what they answered.
 *
 * **Why the line is built from named fields.** The line is written from `event.event`, `event.route`, `event.status` and
 * `event.ms` by name, never by spreading or copying the caller's object, so a property a caller adds (a body, the answers, a
 * header) can never reach the output, whatever the caller passes. `event` is a closed type of the event names in use, so a new
 * event is a change here, not a string invented at a call site.
 *
 * **Why `release` is read here.** It is the platform's commit SHA as `releaseOf` believes it, the same function the health report
 * uses, so a line and `/healthz` can never name different releases. It is read when the line is written, as the routes are
 * rendered per request.
 *
 * **Why a failed write is ignored.** A log line must never change an answer: a route's response is already decided when its line
 * is written, and an exception from the write would replace it.
 */

import { releaseOf } from '@/lib/health';

/** Every event a line may name: the check's four outcomes and the health check's refusal. */
export const LOG_EVENTS = ['check.answered', 'check.too_large', 'check.malformed', 'check.refused', 'health.refused'] as const;
export type LogEventName = (typeof LOG_EVENTS)[number];

/** The routes that write a line. */
export type LoggedRoute = '/api/check' | '/healthz';

export interface LogEvent {
  event: LogEventName;
  route: LoggedRoute;
  /** The HTTP status the route answered. */
  status: number;
  /** How long the handler ran, in milliseconds; written rounded to a whole number. */
  ms: number;
}

/**
 * Writes one JSON line to standard output: `at` (ISO 8601, UTC), `event`, `route`, `status`, `ms` (whole milliseconds) and
 * `release`, exactly those six keys, in that order.
 */
export function logEvent(event: LogEvent): void {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    event: event.event,
    route: event.route,
    status: event.status,
    ms: Math.round(event.ms),
    release: releaseOf(process.env.VERCEL_GIT_COMMIT_SHA),
  });
  try {
    process.stdout.write(`${line}\n`);
  } catch {
    // Deliberately nothing: see "Why a failed write is ignored" above.
  }
}
