/**
 * The same four stages, at the surface a customer actually reads.
 *
 * Spec §7.2, §1. The over-claim `deriveStatus(governing, [])` propagated to
 * three places, and two of them are here: `containsDraftContent`, which draws
 * the prototype banner, and the site's headline counts in `lib/pack.ts`. The
 * engine's `test/status-truth-boundary.test.ts` proves the boundary at the
 * loader and the `minStatus` floor; this file proves the same fixture survives
 * the projection into the payload the route hands back.
 *
 * ```
 * 1. signed + fresh fixture           -> ratified count 16, no draft banner
 * 2. mutate pinned vs current result  -> ratified count 0, banner back
 * 3. suppress freshness resolution    -> ratified count 0, banner back
 * 4. restore                          -> ratified count 16, banner gone
 * ```
 *
 * **`csrdPack()` is the real entry point and is not replaced.** The site loads
 * the pack itself, caches it in module scope and passes no options — so the
 * only honest way to put a fixture ledger behind it is to intercept the
 * `loadPack` it calls and reset the module between stages. No production file
 * changes; the seam is the module boundary, and `packStats()` and
 * `buildCheckResponse()` run exactly as shipped.
 *
 * That arrangement checks itself in a way worth stating: if the interception
 * silently stopped working, stages 1 and 4 would fail because nothing would
 * ever read `ratified`; if the module cache were not being reset, stages 2, 3
 * and 4 would fail because they would be reading stage 1's pack. Neither can
 * pass by accident.
 *
 * **`counts` is here as the counterexample, not as a second positive claim.**
 * The applies / does-not-apply / indeterminate counts are taken at the default
 * `draft` floor, so they must be *identical* in all four stages: the boundary
 * changes what the site may call verified, and must not change which
 * requirements a customer is assessed against. A run in which those moved would
 * be a regression the public golden also catches, and asserting the invariant
 * beside the varying ones is what stops "the counts followed the sequence" from
 * being a claim no output could contradict.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { entryId, signingEntrySchema, type SigningEntry, type UnsignedLedgerEntry } from '../../../backend/engine/src/verification/ledger';
import { deriveStaleness, type CurrentState } from '../../../backend/engine/src/verification/staleness';
import type { CheckerAnswers } from '@/lib/checker';
import type { CheckResponse } from '@/lib/checkResponse';

/**
 * The site's own `LoadPackOptions`, read off `loadPack` itself rather than
 * restated here — the engine's index does not export the type, and a local
 * copy of it would agree with a fixture resolver of the wrong shape.
 */
type PackOptions = NonNullable<Parameters<(typeof import('@datastrata/engine'))['loadPack']>[1]>;

/**
 * The options handed to the site's own `loadPack` call, swapped per stage.
 *
 * `vi.hoisted` because `vi.mock`'s factory is lifted above every import, so a
 * plain module-level binding would be in its temporal dead zone. Type
 * annotations are erased, so naming `PackOptions` above it is not.
 */
const stage = vi.hoisted(() => ({ options: {} as PackOptions }));

vi.mock('@datastrata/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@datastrata/engine')>();
  return {
    ...actual,
    loadPack: (dir: string) => actual.loadPack(dir, stage.options),
  };
});

const HASH = (c: string): string => c.repeat(64);

const ALL_IDS = Array.from({ length: 16 }, (_, i) => `CSRD-S-${String(i + 1).padStart(3, '0')}`);

/** The corpus, closure and pinned result as they stood when the pack was signed. */
function pristineWorld(): CurrentState {
  return {
    requirementInputSha256: HASH('b'),
    conditionSha256: HASH('c'),
    renderedConditionSha256: HASH('d'),
    corpusClosureSha256: HASH('e'),
    resultSha256: HASH('1'),
    corpus: [
      { docId: 'DOC-1', sha256Raw: HASH('f'), sha256Normalized: HASH('0'), normalizerVersion: 'normalize-1.0.0' },
    ],
  };
}

function signing(requirementId: string, world: CurrentState): SigningEntry {
  const pinnedDoc = world.corpus[0];
  if (pinnedDoc === undefined) throw new Error('fixture: the world has no corpus document to pin');
  const fields = {
    kind: 'ratified' as const,
    packId: 'csrd',
    packVersion: '0.1.0',
    requirementId,
    requirementVersion: 2,
    requirementSha256: HASH('a'),
    requirementInputSha256: world.requirementInputSha256,
    conditionSha256: world.conditionSha256,
    renderedConditionSha256: world.renderedConditionSha256,
    rendererVersion: 'renderer-1.0.0',
    corpusClosureSha256: world.corpusClosureSha256,
    corpus: [{ ...pinnedDoc, versionLabel: '2026-01-01' }],
    resultSha256: world.resultSha256,
    pipelineVersion: 'pipeline-0.1.0',
    by: 'A. Reviewer',
    on: '2026-08-21',
  };
  return signingEntrySchema.parse({ ...fields, entryId: entryId(fields as unknown as UnsignedLedgerEntry) });
}

/**
 * Written once, from the pristine world, and byte-identical in every stage.
 * The signatures do not move; the record underneath them does.
 */
async function writeLedger(): Promise<string> {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const file = join(mkdtempSync(join(tmpdir(), 'public-truth-boundary-')), 'signatures.jsonl');
  const entries = ALL_IDS.map((id) => signing(id, pristineWorld()));
  writeFileSync(file, `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');
  return file;
}

const LEDGER = await writeLedger();

/** The real staleness derivation over a fixture world — never a canned answer. */
const resolverOver = (world: CurrentState) =>
  ({ entry }: { entry: SigningEntry }) => ({ checked: true as const, reasons: deriveStaleness(entry, world) });

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

const FIXED_DATE = '2026-07-26';

/**
 * One stage: install the options the site's `loadPack` will be called with,
 * drop the module cache so `csrdPack()`'s memoised pack is rebuilt, and read
 * both public surfaces from freshly-loaded modules.
 */
async function publicSurface(options: PackOptions) {
  stage.options = options;
  vi.resetModules();
  const { packStats, csrdPack } = await import('@/lib/pack');
  const { buildCheckResponse } = await import('@/lib/checkResponse');
  const response = buildCheckResponse(csrdPack(), ANSWERS, FIXED_DATE);
  return { stats: packStats(), response };
}

const fresh = () => ({ ledgerPath: LEDGER, freshnessResolver: resolverOver(pristineWorld()) });
const drifted = () => ({
  ledgerPath: LEDGER,
  freshnessResolver: resolverOver({ ...pristineWorld(), resultSha256: HASH('2') }),
});
const unchecked = () => ({ ledgerPath: LEDGER });

/**
 * The reference the four stages are held to, taken from the site's **shipped**
 * configuration — no ledger, no resolver — rather than from stage 1.
 *
 * Borrowing it from stage 1 made a stage-1 failure cascade into stages 2 and 3
 * as `to deeply equal undefined`, which names the coupling rather than the
 * assertion those stages exist to make. Sourcing it independently is what keeps
 * every red output in the sequence attributable to the stage that produced it.
 */
let invariantCounts: CheckResponse['counts'];

beforeAll(async () => {
  invariantCounts = (await publicSurface({})).response.counts;
});

describe('the customer-facing surface, through the four stages', () => {
  it('stage 1 — an evaluated, current signature reads ratified and clears the banner', async () => {
    const { stats, response } = await publicSurface(fresh());

    expect(stats.ratified).toBe(16);
    expect(response.containsDraftContent).toBe(false);

    expect(response.counts).toEqual(invariantCounts);
    expect(response.counts.applies).toBeGreaterThanOrEqual(1);
    expect(response.determinations.length).toBeGreaterThanOrEqual(1);
  });

  it('stage 2 — drift between the pinned and current result takes the count to zero', async () => {
    const { stats, response } = await publicSurface(drifted());

    expect(stats.ratified).toBe(0);
    expect(response.containsDraftContent).toBe(true);
    // The determinations a customer is assessed against must not move with it.
    expect(response.counts).toEqual(invariantCounts);
  });

  it('stage 3 — an unevaluated signature reads exactly as a stale one does', async () => {
    const { stats, response } = await publicSurface(unchecked());

    expect(stats.ratified).toBe(0);
    expect(response.containsDraftContent).toBe(true);
    expect(response.counts).toEqual(invariantCounts);
  });

  it('stage 4 — restoring the record restores the count and clears the banner again', async () => {
    // The drift is applied and observed on this stage's own object before it is
    // put back, so "restore" is a performed step and not a second pristine run.
    const world = pristineWorld();
    const pinned = pristineWorld();

    world.resultSha256 = HASH('2');
    const stale = await publicSurface({ ledgerPath: LEDGER, freshnessResolver: resolverOver(world) });
    expect(stale.stats.ratified).toBe(0);
    expect(stale.response.containsDraftContent).toBe(true);

    world.resultSha256 = pinned.resultSha256;
    expect(world).toEqual(pinned);

    const { stats, response } = await publicSurface({
      ledgerPath: LEDGER,
      freshnessResolver: resolverOver(world),
    });
    expect(stats.ratified).toBe(16);
    expect(response.containsDraftContent).toBe(false);
    expect(response.counts).toEqual(invariantCounts);
  });
});

describe('what the site itself does, with no resolver anywhere', () => {
  /**
   * The shipped configuration: `lib/pack.ts` calls `loadPack(dir)` with no
   * options at all, so every signature loads unevaluated. The count reads zero
   * and the banner stays up — fail-closed, and the state the operational gate
   * in the plan says the system is in until B2 supplies a live resolver.
   *
   * On its own this asserts nothing: a count that is always zero satisfies it.
   * The stages above are its positive control, and this is here to record that
   * the *default* path is the safe one rather than merely that a safe path
   * exists.
   */
  it('reads zero ratified and keeps the draft banner up', async () => {
    const { stats, response } = await publicSurface({});

    expect(stats.ratified).toBe(0);
    expect(response.containsDraftContent).toBe(true);
    expect(stats.requirements).toBe(16);
  });
});
