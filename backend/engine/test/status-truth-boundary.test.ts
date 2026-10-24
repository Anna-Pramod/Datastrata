/**
 * The truth boundary, proved through the surface that would have carried the
 * over-claim.
 *
 * Spec §7.2. Tasks 1 and 2 made *"I did not check"* and *"I checked and nothing
 * is stale"* two different values and moved the seam into the loader. Neither
 * of those is evidence that the boundary holds at the surface a customer reads,
 * because both are statements about the parts. This file follows **one fixture
 * through four stages** and asserts on the exact `statusReasons` array at each,
 * plus the three places the old `deriveStatus(governing, [])` propagated to:
 * the `minStatus` floor, `containsDraftContent`, and the counts.
 *
 * ```
 * 1. signed + fresh fixture           -> verified
 * 2. mutate pinned vs current result  -> draft, ['stale_result']
 * 3. suppress freshness resolution    -> draft, ['freshness_unchecked']
 * 4. restore                          -> verified again
 * ```
 *
 * **Stages 1 and 4 are the positive control and they are the point.** "A stale
 * signed requirement cannot appear `verified`" is satisfied by a system in
 * which *nothing ever* appears `verified` — a stubbed resolver, a fixture that
 * never signed, a filter that drops everything. That is failure mode 5 in
 * `docs/superpowers/TEST-EVIDENCE-STANDARD.md`, and only the pair is evidence.
 * The teeth check for this file runs in **both** directions for the same
 * reason: a resolver that reports everything fresh must break stage 2, and a
 * resolver that reports everything stale must break stages 1 and 4.
 *
 * **The ledger never moves; the world does.** All sixteen entries are written
 * once from the pristine world and are byte-identical in every stage. What
 * changes is the *current* side of the comparison, which is what "mutate the
 * pinned-versus-current relationship" means: the signature still says what it
 * always said, and it is the record underneath it that drifted.
 *
 * **The staleness is derived, not asserted by the fixture.** The resolver runs
 * the real `deriveStaleness` against a fixture world standing in for the corpus
 * and result store §6 deliberately does not build yet. A resolver that simply
 * returned `['stale_result']` in stage 2 would agree with any loader at all,
 * including one that ignored it.
 *
 * **`draft, []` and `draft, ['freshness_unchecked']` are distinguished inside a
 * single load**, not across two files. They are the two draft-producing paths,
 * and the whole design turns on their not collapsing: `freshness_unchecked`
 * must never appear merely because nothing is signed, and `draft, []` must
 * never appear for a signature nobody evaluated.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { assess, type MinStatus } from '../src/engine/evaluate';
import { loadPack, type FreshnessResolver } from '../src/knowledge/loader';
import { entryId, signingEntrySchema, type SigningEntry, type UnsignedLedgerEntry } from '../src/verification/ledger';
import { deriveStaleness, type CurrentState } from '../src/verification/staleness';
import type { AssessmentResult, KnowledgePack, Requirement } from '../src/types';
import { ProfileBuilder, ctx } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const PACK_DIR = join(here, '..', 'knowledge', 'csrd');

const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const HASH = (c: string): string => c.repeat(64);

/** The twenty-four requirements the pack actually holds (sixteen, plus the seven of the C/G composition of 2026-10-20, plus CSRD-S-024 from E-2 on 2026-10-23), named rather than counted. */
const ALL_IDS = Array.from({ length: 24 }, (_, i) => `CSRD-S-${String(i + 1).padStart(3, '0')}`);

/**
 * The one requirement signed as `ratified` rather than `verified`.
 *
 * It is here so the sequence proves the projection returns the *entry's own
 * kind* and not a flat `verified`. Chosen because `min-status.test.ts` already
 * establishes that `{CSRD-S-003}` is closed under `requirement_ref`, so a
 * `ratified` floor selecting exactly it is a statement about the filter rather
 * than about a dangling reference.
 */
const RATIFIED_ID = 'CSRD-S-003';

/**
 * The world as it stood when the signatures were made — the corpus, the closure
 * and the pinned verification result, standing in for the storage §6 leaves to
 * B2. `CurrentState` is its type because that is exactly what it is: the *now*
 * side of the comparison, which the stages move and the ledger does not.
 */
function pinWithoutRanges<T extends { operativeRanges?: unknown }>(doc: T): Omit<T, 'operativeRanges'> {
  const { operativeRanges: _ranges, ...rest } = doc;
  return rest;
}

function pristineWorld(): CurrentState {
  return {
    requirementInputSha256: HASH('b'),
    conditionSha256: HASH('c'),
    renderedConditionSha256: HASH('d'),
    corpusClosureSha256: HASH('e'),
    resultSha256: HASH('1'),
    evidenceSets: [],
    corpus: [
      {
        docId: 'DOC-1',
        sha256Raw: HASH('f'),
        sha256Normalized: HASH('0'),
        normalizerVersion: 'normalize-1.0.0',
        operativeRanges: [],
      },
    ],
  };
}

/** A signature pinning the world as it stood, which is what signing means. */
function signing(requirementId: string, kind: 'verified' | 'ratified', world: CurrentState): SigningEntry {
  const pinnedDoc = world.corpus[0];
  if (pinnedDoc === undefined) throw new Error('fixture: the world has no corpus document to pin');
  const fields = {
    kind,
    packId: 'csrd',
    packVersion: '0.1.0',
    requirementId,
    requirementVersion: 2,
    requirementSha256: HASH('a'),
    requirementInputSha256: world.requirementInputSha256,
    conditionSha256: world.conditionSha256,
    renderedConditionSha256: world.renderedConditionSha256,
    rendererVersion: 'renderer-1.0.0',
    closureRendererVersion: 'closure-renderer-1.0.0',
    corpusClosureSha256: world.corpusClosureSha256,
    // The ledger pin carries no declarations: `operativeRanges` is freshness width, not record width.
    corpus: [{ ...pinWithoutRanges(pinnedDoc), versionLabel: '2026-01-01', artefactAuthenticity: 'official_consolidation' as const, nonOperativeSections: [], sources: [{ sourceId: 'SRC-001', temporalStanding: 'in_force' as const }] }],
    resultSha256: world.resultSha256,
    // Explicit and empty: this world has no evidence set to designate, and an
    // entry without any designation reads as `stale_ranges` by design.
    evidenceUse: [],
    pipelineVersion: 'pipeline-0.1.0',
    by: 'A. Reviewer',
    on: '2026-08-21',
  };
  return signingEntrySchema.parse({ ...fields, entryId: entryId(fields as unknown as UnsignedLedgerEntry) });
}

function ledgerFile(entries: SigningEntry[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'status-truth-boundary-'));
  temps.push(dir);
  const file = join(dir, 'signatures.jsonl');
  writeFileSync(file, `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');
  return file;
}

/**
 * The fixture resolver: the real staleness derivation, over a fixture world.
 *
 * It reports what it found and nothing else — no opinion about whether that
 * blocks, which is `deriveStatus`'s to hold. Returning `CheckedFreshness` is
 * what makes `{ checked: false }` unreachable from here, so stage 3 can only be
 * produced by *withholding* a resolver rather than by one answering "unknown".
 */
const resolverOver = (world: CurrentState): FreshnessResolver =>
  ({ entry }) => ({ checked: true, reasons: deriveStaleness(entry, world) });

/** Every entry written once, from the pristine world, and never rewritten. */
const LEDGER = ledgerFile(
  ALL_IDS.map((id) => signing(id, id === RATIFIED_ID ? 'ratified' : 'verified', pristineWorld())),
);

const load = (resolver?: FreshnessResolver): KnowledgePack =>
  loadPack(PACK_DIR, { ledgerPath: LEDGER, freshnessResolver: resolver });

const statusOf = (pack: KnowledgePack, id: string): Requirement => {
  const found = pack.requirements.find((r) => r.id === id);
  if (found === undefined) throw new Error(`fixture: ${id} is not in the pack`);
  return found;
};

function wideProfile() {
  return new ProfileBuilder()
    .org('o1', 'Alpine Group')
    .euEntity('e1', 'Alpine Industrie SAS', 'FR', { parentId: 'o1' })
    .branch('b1', 'Paris branch', 'e1')
    .counterparty('c1', 'Banque Alpine')
    .request('r1', 'Bank sustainability data request', 'e1', 'c1')
    .build();
}

const CTX = () => ctx('2027-01-01', '2027-12-31', 'e1');

const evaluate = (pack: KnowledgePack, minStatus?: MinStatus): AssessmentResult =>
  assess(pack, wideProfile(), CTX(), minStatus === undefined ? {} : { minStatus });

const evaluatedIds = (result: AssessmentResult): string[] =>
  [...new Set(result.determinations.map((d) => d.requirementId))].sort();

/**
 * The whole pack's reason sets in one value, so a stage asserts what *every*
 * requirement says rather than what a sampled one says. A boundary that held
 * for `CSRD-S-001` and leaked through the other fifteen would pass a spot
 * check.
 */
const everyReasonSet = (pack: KnowledgePack): string[][] =>
  pack.requirements.map((r) => r.statusReasons);

const repeated = <T,>(value: T, times = ALL_IDS.length): T[] => Array.from({ length: times }, () => value);

describe('stage 1 — a signed requirement whose freshness was evaluated and found current', () => {
  const pack = load(resolverOver(pristineWorld()));

  it('reports the entry kind with no reasons, which is the positive control', () => {
    expect(statusOf(pack, 'CSRD-S-001').derivedStatus).toBe('verified');
    expect(statusOf(pack, 'CSRD-S-001').statusReasons).toEqual([]);
  });

  it('keeps a ratification at ratified rather than flattening it to verified', () => {
    expect(statusOf(pack, RATIFIED_ID).derivedStatus).toBe('ratified');
    expect(statusOf(pack, RATIFIED_ID).statusReasons).toEqual([]);
  });

  it('says the same for all sixteen, so the boundary is not holding by sample', () => {
    expect(everyReasonSet(pack)).toEqual(repeated<string[]>([]));
    expect(pack.requirements.every((r) => r.derivedStatus !== 'draft')).toBe(true);
  });

  it('carries that through minStatus, containsDraftContent and the counts', () => {
    const all = evaluate(pack);
    expect(all.containsDraftContent).toBe(false);
    expect(all.determinations.length).toBeGreaterThan(0);
    expect(all.determinations.every((d) => d.derivedStatus !== 'draft')).toBe(true);

    expect(evaluatedIds(evaluate(pack, 'verified'))).toEqual(ALL_IDS);
    expect(evaluatedIds(evaluate(pack, 'ratified'))).toEqual([RATIFIED_ID]);
  });
});

describe('stage 2 — the pinned result and the current one no longer agree', () => {
  const drifted: CurrentState = { ...pristineWorld(), resultSha256: HASH('2') };
  const pack = load(resolverOver(drifted));

  it('demotes to draft with stale_result, and specifically that reason alone', () => {
    expect(statusOf(pack, 'CSRD-S-001').derivedStatus).toBe('draft');
    expect(statusOf(pack, 'CSRD-S-001').statusReasons).toEqual(['stale_result']);
  });

  it('demotes the ratification too — a louder claim is not a safer one', () => {
    expect(statusOf(pack, RATIFIED_ID).derivedStatus).toBe('draft');
    expect(statusOf(pack, RATIFIED_ID).statusReasons).toEqual(['stale_result']);
  });

  it('says the same for all sixteen', () => {
    expect(everyReasonSet(pack)).toEqual(repeated<string[]>(['stale_result']));
  });

  it('withdraws the requirement from every floor above draft, and flips the banner', () => {
    const all = evaluate(pack);
    expect(all.containsDraftContent).toBe(true);
    expect(all.determinations.every((d) => d.derivedStatus === 'draft')).toBe(true);
    // The reason travels with the status, so a surface can say *why* it refuses.
    for (const d of all.determinations) expect(d.statusReasons, d.requirementId).toEqual(['stale_result']);

    expect(evaluatedIds(evaluate(pack, 'verified'))).toEqual([]);
    expect(evaluatedIds(evaluate(pack, 'ratified'))).toEqual([]);
  });
});

describe('stage 3 — nothing evaluated the signature at all', () => {
  const pack = load();

  it('reports freshness_unchecked, and specifically not the empty reason set', () => {
    expect(statusOf(pack, 'CSRD-S-001').derivedStatus).toBe('draft');
    expect(statusOf(pack, 'CSRD-S-001').statusReasons).toEqual(['freshness_unchecked']);
    // `draft, []` means "nobody signed this". Sixteen people signed; nobody checked.
    expect(statusOf(pack, 'CSRD-S-001').statusReasons).not.toEqual([]);
  });

  it('says the same for all sixteen, none of them draft with no reasons', () => {
    expect(everyReasonSet(pack)).toEqual(repeated<string[]>(['freshness_unchecked']));
  });

  it('reaches the floor and the banner as draft, exactly as a stale one does', () => {
    const all = evaluate(pack);
    expect(all.containsDraftContent).toBe(true);
    expect(evaluatedIds(evaluate(pack, 'verified'))).toEqual([]);
    expect(evaluatedIds(evaluate(pack, 'ratified'))).toEqual([]);
  });
});

describe('stage 4 — the record is restored', () => {
  /**
   * The restore is performed rather than assumed: the world is mutated to the
   * stage-2 state, the demotion is observed on that same object, and only then
   * is it put back. A stage 4 that merely built a second pristine world would
   * assert that two identical inputs agree, which is not a restore.
   */
  const world = pristineWorld();
  const pinned = pristineWorld();

  it('demotes while drifted and returns to the entry kind once put back', () => {
    world.resultSha256 = HASH('2');
    expect(statusOf(load(resolverOver(world)), 'CSRD-S-001').statusReasons).toEqual(['stale_result']);

    world.resultSha256 = pinned.resultSha256;
    expect(world).toEqual(pinned);

    const restored = load(resolverOver(world));
    expect(statusOf(restored, 'CSRD-S-001').derivedStatus).toBe('verified');
    expect(statusOf(restored, 'CSRD-S-001').statusReasons).toEqual([]);
    expect(statusOf(restored, RATIFIED_ID).derivedStatus).toBe('ratified');
    expect(everyReasonSet(restored)).toEqual(repeated<string[]>([]));
  });

  it('restores the floor, the banner and the counts along with the status', () => {
    const restored = load(resolverOver(world));
    const all = evaluate(restored);
    expect(all.containsDraftContent).toBe(false);
    expect(evaluatedIds(evaluate(restored, 'verified'))).toEqual(ALL_IDS);
    expect(evaluatedIds(evaluate(restored, 'ratified'))).toEqual([RATIFIED_ID]);
  });
});

describe('the two draft-producing paths, distinguished inside one load', () => {
  /**
   * Fifteen signed, one not. `draft, []` and `draft, ['freshness_unchecked']`
   * are the two ways a requirement reads draft, and the design turns on their
   * not collapsing into one another — so they are separated in a single pack
   * rather than in two test files that could each be right about a different
   * loader.
   */
  const UNSIGNED_ID = 'CSRD-S-016';
  const partial = ledgerFile(
    ALL_IDS.filter((id) => id !== UNSIGNED_ID).map((id) =>
      signing(id, id === RATIFIED_ID ? 'ratified' : 'verified', pristineWorld()),
    ),
  );

  it('keeps unsigned at draft with no reasons while the signed ones are verified', () => {
    const pack = loadPack(PACK_DIR, {
      ledgerPath: partial,
      freshnessResolver: resolverOver(pristineWorld()),
    });

    expect(statusOf(pack, UNSIGNED_ID).derivedStatus).toBe('draft');
    expect(statusOf(pack, UNSIGNED_ID).statusReasons).toEqual([]);
    expect(statusOf(pack, 'CSRD-S-001').derivedStatus).toBe('verified');
    expect(statusOf(pack, 'CSRD-S-001').statusReasons).toEqual([]);
  });

  it('never lends freshness_unchecked to the unsigned one when the rest go unchecked', () => {
    // Both draft, and for different reasons that the reason set keeps apart.
    const pack = loadPack(PACK_DIR, { ledgerPath: partial });

    expect(statusOf(pack, UNSIGNED_ID).statusReasons).toEqual([]);
    expect(statusOf(pack, 'CSRD-S-001').statusReasons).toEqual(['freshness_unchecked']);
  });

  it('never lends the empty reason set to a signed one when the unsigned one earns it', () => {
    // The same claim from the other side, on the stage-2 world: the unsigned
    // requirement is unaffected by drift it was never signed against.
    const pack = loadPack(PACK_DIR, {
      ledgerPath: partial,
      freshnessResolver: resolverOver({ ...pristineWorld(), resultSha256: HASH('2') }),
    });

    expect(statusOf(pack, UNSIGNED_ID).statusReasons).toEqual([]);
    expect(statusOf(pack, 'CSRD-S-001').statusReasons).toEqual(['stale_result']);
  });
});
