/**
 * Why this file exists: the other offline-guard tests import the setup
 * module, and importing it installs the guard. They therefore prove the guard
 * works, not that vitest installed it before any test module ran. This file
 * imports nothing from the setup module and nothing from `src`, checks the
 * guard's marker by literal name before touching `fetch`, and only then calls
 * `fetch` to see the guard answer. Remove `setupFiles` from `vitest.config.ts`
 * and this file goes red without attempting a network call, because the
 * marker check fails first.
 */
import { describe, expect, it } from 'vitest';

describe('the offline guard precedes every test module', () => {
  it('G0 — a module that imports nothing from the setup finds the guard already installed, by its literal name, and gets refused by it', async () => {
    // Literal, on purpose: an import from the setup module would install the
    // guard and prove nothing about `setupFiles`.
    expect(globalThis.fetch.name).toBe('offlineGuardFetch');
    // The guard throws synchronously and a real fetch rejects; the async
    // wrapper turns either into a rejection, so the assertion is the same
    // for both and the message decides.
    await expect((async () => fetch('https://precedence.example.invalid/v1/messages'))()).rejects.toThrow('OFFLINE GUARD: the default suite attempted a network call');
  });
});
