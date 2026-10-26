/**
 * The free check's request, from the moment it is sent until it is applied or abandoned (DP1 plan, Task 6; Codex's review of
 * Task 6, finding 3).
 *
 * **Why this module exists.** A visitor can act while a check is in flight: run another check, change an answer, go back, follow
 * a step, try again. The flow used to apply whatever arrived, so a late answer to answers the visitor had already left replaced
 * the check they were on, and an older request's end cleared the loading state of a newer one. The rule is one sentence: **a
 * request's ending is applied only if nothing has superseded it since it was sent.** Held inside a React component it could be
 * checked only in a browser; here it is a plain object whose `fetch` and timers are handed in, so a test drives delayed
 * responses, aborts and timeouts in Node, with no DOM.
 *
 * **What supersedes a request is the flow's to say,** and `CheckFlow.tsx` calls `supersede` at each point: a restart, any
 * navigation, any change to an answer or a typed figure. A newer `start` supersedes the request before it. **What superseding
 * does is fixed here:** the request's fetch is aborted, its timer cleared, `running` set false, and its ending, whenever it comes
 * and whatever it is, changes nothing.
 *
 * **One ending per request.** Whichever comes first, a response, a failure or the timeout, settles the request, and anything
 * after it is ignored. The timeout settles the request itself and then aborts the fetch, so the abort's rejection reaches a
 * request that is no longer current and is never reported as a network failure as well. An abort caused by superseding reaches a
 * request that is not current either, and shows nothing: it is not a timeout.
 *
 * **`running` is owned here,** reported through `onRunning`: true from `start` until the current request settles or is
 * superseded. A superseded request's ending never touches it, so a late answer to an older request cannot clear the flag of the
 * one in flight.
 *
 * The request itself is the one the flow always sent: one POST of `requestBody(answers)` as JSON to `/api/check`, abandoned after
 * `CHECK_TIMEOUT_MS`, with each failure mapped to its state by `errorStateFor`. Client-safe: the check flow imports it. At run
 * time it imports the view model only; the answers and the timeline are imported for their types.
 */

import type { CheckerAnswers } from './check-answers';
import type { CheckTimeline } from './check-timeline';
import { CHECK_TIMEOUT_MS, errorStateFor, requestBody, type CheckOutcome } from './check-view';
import type { ErrorState } from './wording';

/** How a request ended, as the flow shows it: one value, a result or an error, never both (EXP-6). */
export type CheckSettlement =
  | { kind: 'result'; timeline: CheckTimeline; answers: CheckerAnswers }
  | { kind: 'error'; state: ErrorState; answers: CheckerAnswers };

/** What a request needs from its surroundings, handed in so a test can hold the network and the clock. */
export interface CheckRequestEnvironment {
  fetch(url: string, init: RequestInit): Promise<Response>;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** The page's own fetch and timers, looked up when each is called, as the flow uses them. */
export const browserEnvironment: CheckRequestEnvironment = {
  fetch: (url, init) => fetch(url, init),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface CheckRequests {
  /** Sends a check of these answers, superseding any request in flight. `apply` receives its ending, only while it is current. */
  start(answers: CheckerAnswers, apply: (settlement: CheckSettlement) => void): void;
  /** Abandons the request in flight, if any: aborted, its timer cleared, `running` false, and its ending ignored. */
  supersede(): void;
}

interface InFlight {
  controller: AbortController;
  timer: unknown;
}

const CHECK_URL = '/api/check';

/** The response read into an ending. A 200 that is not a timeline is the server's own failure, never a result. */
async function exchange(environment: CheckRequestEnvironment, body: CheckerAnswers, signal: AbortSignal): Promise<CheckSettlement> {
  const failed = (failure: CheckOutcome): CheckSettlement => ({ kind: 'error', state: errorStateFor(failure), answers: body });
  const response = await environment.fetch(CHECK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) return failed({ kind: 'status', status: response.status });
  const timeline = (await response.json()) as CheckTimeline;
  return Array.isArray(timeline?.routes) ? { kind: 'result', timeline, answers: body } : failed({ kind: 'status', status: 500 });
}

export function checkRequests(onRunning: (running: boolean) => void, environment: CheckRequestEnvironment = browserEnvironment): CheckRequests {
  /** The one request whose ending may be applied; null when none is in flight. */
  let current: InFlight | null = null;

  /** Stops the request in flight, if any, without reporting `running`; returns whether there was one. */
  const abandon = (): boolean => {
    const request = current;
    if (request === null) return false;
    current = null;
    environment.clearTimeout(request.timer);
    request.controller.abort();
    return true;
  };

  return {
    start(answers, apply) {
      abandon();
      const body = requestBody(answers);
      const request: InFlight = { controller: new AbortController(), timer: undefined };

      /** Applies an ending, only if this request is still the current one; the first ending makes it no longer current. */
      const settle = (settlement: CheckSettlement): void => {
        if (current !== request) return;
        current = null;
        environment.clearTimeout(request.timer);
        onRunning(false);
        apply(settlement);
      };

      current = request;
      onRunning(true);
      request.timer = environment.setTimeout(() => {
        settle({ kind: 'error', state: errorStateFor({ kind: 'timeout' }), answers: body });
        request.controller.abort();
      }, CHECK_TIMEOUT_MS);
      exchange(environment, body, request.controller.signal).then(settle, () => settle({ kind: 'error', state: errorStateFor({ kind: 'network' }), answers: body }));
    },

    supersede() {
      if (abandon()) onRunning(false);
    },
  };
}
