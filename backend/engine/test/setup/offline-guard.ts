/**
 * The suite-wide offline guard — installed before any test module loads.
 *
 * Until B-ADAPTER's repair the default suite had no guard of its own: each
 * test that could reach the network remembered, or forgot, to install the
 * trap in `helpers.ts`. One forgot, and a red test reached the real `fetch`
 * (with a reserved `.invalid` name and a synthetic key; what happened beyond
 * that call is not established — see the B2 checkpoint's incident note).
 * Protection that depends on every future
 * test remembering is not protection. This module runs from `setupFiles`, so
 * it is in place for every test file, every red test and every mutant the
 * default configuration executes — and it is deliberately absent from the
 * agents configuration, which is the one suite allowed to spend.
 *
 * **What it covers.** The live runner's only network path is `globalThis.fetch`
 * (`fetchTransport`), and `pipeline-runner.test.ts` asserts that no engine
 * source imports any other network module. So the guard replaces `fetch`
 * with a function that records the destination and throws. It is never
 * restored: `installNetworkTrap` and the canned-fetch helpers save the guard
 * as their "original" and put it back when they restore, so a test that
 * stubs `fetch` for its own purposes still returns to the guard afterwards.
 *
 * **What it does not claim.** It cannot stop a test that reaches the
 * network through a path other than `fetch`; the static import check is what
 * keeps such a path out of the engine. And it is not the reason the live
 * runner refuses to spend — that is the capability token and the wiring —
 * it is the backstop that turns a mistake into a loud failure.
 */

export const OFFLINE_GUARD_MESSAGE = 'OFFLINE GUARD: the default suite attempted a network call';

export interface OfflineGuard {
  readonly calls: string[];
}

const GUARD_KEY = Symbol.for('datastrata.offline-guard');

function urlOf(input: unknown): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : String((input as { url?: unknown })?.url ?? input);
}

const guard: OfflineGuard = { calls: [] };
(globalThis as unknown as Record<symbol, OfflineGuard>)[GUARD_KEY] = guard;

/**
 * Named, so a test that imports nothing from this module can tell whether the
 * guard was installed before it ran — `offline-guard-precedence.test.ts` is
 * that test, and it is the only evidence that `setupFiles` does the
 * installing. Importing this module installs the guard too, which is why the
 * tests that import it cannot serve as that evidence.
 */
export const OFFLINE_GUARD_FETCH_NAME = 'offlineGuardFetch';

const offlineGuardFetch = (input: unknown): never => {
  const url = urlOf(input);
  guard.calls.push(url);
  throw new Error(`${OFFLINE_GUARD_MESSAGE} to ${url}`);
};
Object.defineProperty(offlineGuardFetch, 'name', { value: OFFLINE_GUARD_FETCH_NAME });
globalThis.fetch = offlineGuardFetch as unknown as typeof fetch;

/** The guard's record, for the positive controls in `offline-guard.test.ts`. */
export function offlineGuard(): OfflineGuard {
  const installed = (globalThis as unknown as Record<symbol, OfflineGuard | undefined>)[GUARD_KEY];
  if (installed === undefined) throw new Error('the offline guard is not installed; vitest.config.ts must list test/setup/offline-guard.ts in setupFiles');
  return installed;
}
