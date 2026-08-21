/**
 * The public freshness resolver, exercised the way the site runs it.
 *
 * Plan Task 2; design §3, §3.1, §3.2, §5, §6. Nothing here replaces a
 * production function. Each test points a process at a fixture repository whose
 * layout is the production layout, and the shipped probe in `lib/pack.ts` finds
 * it, the shipped `loadPack` loads it, and the shipped resolver reads its
 * verification state. The one thing standing in for production is the
 * *repository*, because the real one deliberately holds no signatures yet.
 *
 * What each block is for:
 *
 * ```
 * the resolver          fresh -> ratified; drift -> the specific reason;
 *                       a missing pinned result -> integrity failure
 * retained raw bytes    a normalizer version that moved, resolved BOTH ways
 * memoisation           keyed by root, so answers do not depend on test order
 * one resolver          both surfaces answer from one load of one pack
 * the route             refuses without a status, and serves one when it can
 * ```
 *
 * **`process.chdir` is the seam, and it is the honest one.** `lib/pack.ts`
 * discovers its root from `process.cwd()`, exactly as the deployed server does.
 * Pointing the working directory at a fixture repository exercises that
 * discovery instead of bypassing it, which is what an environment-variable
 * override or a module mock would have done.
 */

import { describe, expect, it, vi } from 'vitest';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { IntegrityFailureError } from '@datastrata/engine';
import type { KnowledgePack } from '@datastrata/engine';
import { buildFixtureRepository } from './fixture-repository';
import type { CheckerAnswers } from '@/lib/checker';
import type { CheckResponse } from '@/lib/checkResponse';

/**
 * Every `loadPack` the site performs, recorded.
 *
 * The real implementation is called through unchanged — this is a witness, not
 * a substitute. It exists for one assertion the outcome cannot make on its own:
 * that both surfaces reached *one* load of *one* pack. Two surfaces whose
 * resolvers are identical today agree today, so the disagreement they will
 * eventually produce is invisible to any comparison of outputs; the count is
 * what sees the second code path on the day it is written rather than on the
 * day it first differs.
 */
const witness = vi.hoisted(() => ({ loadPackCalls: [] as { dir: string; options: unknown }[] }));

vi.mock('@datastrata/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@datastrata/engine')>();
  return {
    ...actual,
    loadPack: (dir: string, options?: unknown) => {
      witness.loadPackCalls.push({ dir, options });
      return actual.loadPack(dir, options as Parameters<typeof actual.loadPack>[1]);
    },
  };
});

const { csrdPack, loadVerifiedCsrdPack, packStats } = await import('@/lib/pack');
const { POST } = await import('@/app/api/check/route');

/** A German entity over both thresholds — the widest slice the check reaches. */
const ANSWERS: CheckerAnswers = {
  country: 'DE',
  legalForm: 'private_limited_company',
  financialYear: '2027',
  groupPosition: 'standalone',
  turnover: 'gt600',
  employees: 'gt1500',
  reportedFy2024: 'no',
  governingChoice: 'same',
};

/** Runs `fn` as a process whose working directory is `dir`, and puts it back. */
async function inRepository<T>(dir: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

function statusOf(pack: KnowledgePack, requirementId: string) {
  const requirement = pack.requirements.find((r) => r.id === requirementId);
  if (requirement === undefined) throw new Error(`no requirement ${requirementId}`);
  return { derivedStatus: requirement.derivedStatus, statusReasons: requirement.statusReasons };
}

async function check(): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await POST(
    new Request('http://localhost/api/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ANSWERS),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('the resolver, over a repository that actually holds verification state', () => {
  it('reports a fresh governing signature as ratified, with no reasons', () => {
    const fixture = buildFixtureRepository();
    const pack = loadVerifiedCsrdPack(fixture.engineRoot);

    expect(statusOf(pack, 'CSRD-S-001')).toEqual({ derivedStatus: 'ratified', statusReasons: [] });
    expect(pack.requirements.filter((r) => r.derivedStatus === 'ratified')).toHaveLength(
      fixture.allIds.length,
    );
  });

  it('reports the specific reason when a pinned input moved, not a generic draft', () => {
    const fixture = buildFixtureRepository({ driftResult: true });
    const pack = loadVerifiedCsrdPack(fixture.engineRoot);

    // Exactly `stale_result`, and exactly once: the drift is in the pinned
    // result hash alone, so any other reason appearing here would mean the
    // resolver is comparing something it was not asked about.
    expect(statusOf(pack, 'CSRD-S-001')).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['stale_result'],
    });
  });

  it('raises an integrity failure, naming the path, when the pinned result is gone', () => {
    const fixture = buildFixtureRepository({ omitResults: true });

    let thrown: unknown;
    try {
      loadVerifiedCsrdPack(fixture.engineRoot);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(IntegrityFailureError);
    const refusals = (thrown as IntegrityFailureError).refusals;
    expect(refusals.map((r) => r.code)).toEqual(['invalid_result']);
    expect(refusals[0]?.detail).toContain(
      join(fixture.engineRoot, 'verification', 'csrd', 'CSRD-S-001', 'verification-result.json'),
    );
  });

  it('never yields freshness_unchecked — a resolver that ran either answers or throws', () => {
    const fixture = buildFixtureRepository({ driftResult: true });
    const pack = loadVerifiedCsrdPack(fixture.engineRoot);

    expect(pack.requirements.flatMap((r) => r.statusReasons)).not.toContain('freshness_unchecked');
  });
});

/**
 * The one closure member that is a conditional branch.
 *
 * `resolveNormalizerChanged` renormalises retained raw bytes **only** when a
 * pinned `normalizerVersion` differs from the corpus's current one. A fresh
 * signature never reaches it, so a recorder watching the fresh path proves
 * nothing about the raw bytes. These two cases are the branch itself, resolved
 * in both directions: the reason is dropped when the bytes reproduce the pinned
 * hash and kept when they do not. A stub that returned either answer
 * unconditionally fails one of them.
 */
describe('retained raw bytes, where normalizer drift makes them load-bearing', () => {
  it('clears a normalizer version difference when the raw bytes renormalise to the pinned hash', () => {
    const fixture = buildFixtureRepository({ pinNormalizerVersion: '1.0.1-superseded' });
    const pack = loadVerifiedCsrdPack(fixture.engineRoot);

    expect(statusOf(pack, 'CSRD-S-001')).toEqual({ derivedStatus: 'ratified', statusReasons: [] });
  });

  it('keeps it when they do not — the absence of evidence is not evidence of absence', () => {
    const fixture = buildFixtureRepository({
      pinNormalizerVersion: '1.0.1-superseded',
      pinUnreproducibleNormalizedHash: true,
    });
    const pack = loadVerifiedCsrdPack(fixture.engineRoot);

    expect(statusOf(pack, 'CSRD-S-001')).toEqual({
      derivedStatus: 'draft',
      statusReasons: ['normalizer_changed'],
    });
  });
});

/**
 * Memoisation, and the defect it would have if `root` were decorative.
 *
 * A single module-level `cached ??= load(root)` makes the first root loaded
 * govern every later call, so these assertions would pass or fail **by test
 * order**. Both orders are therefore run, over the same two repositories, and
 * each asserts the same per-root answer.
 */
describe('the memoised pack is keyed by root, not by whichever root arrived first', () => {
  const signed = buildFixtureRepository();
  const unsigned = buildFixtureRepository({ requirementIds: [] });

  const ratifiedCount = (root: string): number =>
    loadVerifiedCsrdPack(root).requirements.filter((r) => r.derivedStatus === 'ratified').length;

  it('answers for the root it was given, signed first', () => {
    expect(ratifiedCount(signed.engineRoot)).toBe(signed.allIds.length);
    expect(ratifiedCount(unsigned.engineRoot)).toBe(0);
    expect(ratifiedCount(signed.engineRoot)).toBe(signed.allIds.length);
    expect(ratifiedCount(unsigned.engineRoot)).toBe(0);
  });

  it('answers for the root it was given, unsigned first', () => {
    const other = buildFixtureRepository({ requirementIds: [] });
    const alsoSigned = buildFixtureRepository();

    expect(ratifiedCount(other.engineRoot)).toBe(0);
    expect(ratifiedCount(alsoSigned.engineRoot)).toBe(alsoSigned.allIds.length);
    expect(ratifiedCount(other.engineRoot)).toBe(0);
    expect(ratifiedCount(alsoSigned.engineRoot)).toBe(alsoSigned.allIds.length);
  });

  it('reuses one pack per root, and canonicalises the root before deciding', () => {
    const fixture = buildFixtureRepository();

    expect(loadVerifiedCsrdPack(fixture.engineRoot)).toBe(loadVerifiedCsrdPack(fixture.engineRoot));
    expect(loadVerifiedCsrdPack(join(fixture.engineRoot, '.', ''))).toBe(
      loadVerifiedCsrdPack(fixture.engineRoot),
    );
    expect(loadVerifiedCsrdPack(unsigned.engineRoot)).not.toBe(
      loadVerifiedCsrdPack(signed.engineRoot),
    );
  });
});

describe('one resolver, one code path, both surfaces', () => {
  it('gives the static pages and the dynamic API the same answer from one load', async () => {
    const fixture = buildFixtureRepository();
    witness.loadPackCalls.length = 0;

    const { stats, response } = await inRepository(fixture.repoRoot, async () => {
      // The build-time surface first, then the request-time one, in the order a
      // deployment performs them.
      const surface = { stats: packStats(), pack: csrdPack() };
      const answer = await check();
      return { stats: surface.stats, response: answer };
    });

    // The page surface says every requirement is ratified...
    expect(stats.ratified).toBe(fixture.allIds.length);
    // ...so the API surface must not still be drawing the draft banner. A route
    // holding its own resolver — even one differing in a single comparison —
    // reports these two facts inconsistently within one deployment.
    expect(response.status).toBe(200);
    expect((response.body as unknown as CheckResponse).containsDraftContent).toBe(false);

    // And there was one load, so there is one resolver and one pack.
    expect(witness.loadPackCalls).toHaveLength(1);
    // `realpathSync` because `process.chdir` canonicalises: the fixture lives
    // under a symlinked temporary directory, and the discovered root is spelled
    // the way the process's own working directory spells it.
    expect(witness.loadPackCalls[0]?.dir).toBe(
      join(realpathSync(fixture.engineRoot), 'knowledge', 'csrd'),
    );
    expect(
      (witness.loadPackCalls[0]?.options as { freshnessResolver?: unknown })?.freshnessResolver,
    ).toBeTypeOf('function');
  });
});

/**
 * Design §6. The refusal and its positive control are in the same block on
 * purpose: "the response carries no `containsDraftContent`" is a negative
 * observation, and on its own it is satisfied by a route that never produces
 * one at all.
 */
describe('the route refuses rather than downgrades', () => {
  it('produces no status payload when the verification record is damaged', async () => {
    const fixture = buildFixtureRepository({ omitResults: true });

    const { status, body } = await inRepository(fixture.repoRoot, check);

    // The absence of a status is asserted before the status code, and the
    // ordering is deliberate. A route that catches the integrity failure and
    // carries on with unresolved freshness answers 200 *with* an assessment;
    // asserting the code first makes such a run fail on "expected 200 to be
    // 503", which names the symptom rather than the property. The claim under
    // test is that no status was produced, so that is what has to go red.
    expect(body).not.toHaveProperty('containsDraftContent');
    expect(body).not.toHaveProperty('determinations');
    expect(body).not.toHaveProperty('counts');
    expect(status).toBe(503);
    expect(String(body['error'])).toContain('damaged');
  });

  it('produces one when it can, so the refusal above is a decision and not a ceiling', async () => {
    const fixture = buildFixtureRepository();

    const { status, body } = await inRepository(fixture.repoRoot, check);

    expect(status).toBe(200);
    expect(body).toHaveProperty('containsDraftContent');
    expect((body as unknown as CheckResponse).determinations.length).toBeGreaterThanOrEqual(1);
  });
});
