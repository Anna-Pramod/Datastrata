/**
 * The acceptance test for the asserted-to-derived migration.
 *
 * Spec §7.2 states the invariant this file exists to hold: with an empty ledger
 * all sixteen requirements read `draft`, `minStatus: 'draft'` evaluates all
 * sixteen, and `containsDraftContent` is true. That is not a cleanup check. It
 * is the statement that deleting an asserted field changed *how* the status is
 * known and not *what* it says — every other test in the suite would stay green
 * against a migration that quietly started hiding content.
 *
 * §7.3's filter is the second half. `includeDraft` was a boolean that no caller
 * anywhere passed, so it had never run; `minStatus` is a three-way floor
 * defaulting to `'draft'` so that stays true. The three level tests below are
 * what stop the migration from switching a filter on by accident, and they use
 * deliberately **closed** sets of requirements: `requirement_ref` makes an
 * arbitrary cut throw, so each level's set is chosen to reference nothing
 * outside itself.
 *
 * §7.4's load error is the third. `requirementSchema` is not `.strict()` — it
 * strips unknown keys, which is what keeps loader-attached fields out of
 * `requirementSha256` — so a `ratification` left behind in the authored JSON
 * would otherwise vanish in silence. The check has to be explicit, and these
 * tests assert on the message text rather than merely that something threw.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { FROZEN_HISTORICAL_DIGESTS } from './historical-version-digests';

import { assess, type MinStatus } from '../src/engine/evaluate';
import {
  entryId,
  LedgerIntegrityError,
  revocationEntrySchema,
  signingEntrySchema,
  type LedgerEntry,
  type UnsignedLedgerEntry,
} from '../src/verification/ledger';
import { loadPack, PackIntegrityError, verifyIntegrity } from '../src/knowledge/loader';
import type { AssessmentResult, KnowledgePack, Requirement } from '../src/types';
import { requirementSha256 } from '../src/verification/canonical';
import { parseVersionRegistry, registerVersion, VersionIntegrityError } from '../src/verification/registry';
import type { DerivedStatus } from '../src/verification/status';
import { ProfileBuilder, csrdPack, ctx } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const PACK_DIR = join(here, '..', 'knowledge', 'csrd');
const REGISTRY_DIR = join(here, '..', 'verification', 'requirement-versions');

/**
 * Wide enough that every one of the four scope types in the pack has an object
 * to be evaluated against, so "all 16 evaluated" is a statement about the filter
 * rather than about which scopes the fixture happened to supply.
 */
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

const evaluatedIds = (result: AssessmentResult): string[] =>
  [...new Set(result.determinations.map((d) => d.requirementId))].sort();

/**
 * Closed under `requirement_ref`, checked by the test that follows them.
 *
 * `CSRD-S-014` cites five other requirements and `CSRD-S-016` cites it, so a
 * cut chosen by index would make the engine throw on a dangling reference and
 * the level test would report a content error as if it were a filter result.
 */
const RATIFIED_IDS = ['CSRD-S-001', 'CSRD-S-002', 'CSRD-S-003'];
const VERIFIED_IDS = ['CSRD-S-004', 'CSRD-S-005', 'CSRD-S-006'];

function statusFor(id: string): DerivedStatus {
  if (RATIFIED_IDS.includes(id)) return 'ratified';
  if (VERIFIED_IDS.includes(id)) return 'verified';
  return 'draft';
}

/** The real pack with derived statuses substituted — nothing else moved. */
function packWithStatuses(): KnowledgePack {
  const pack = csrdPack();
  return {
    ...pack,
    requirements: pack.requirements.map(
      (r): Requirement => ({ ...r, derivedStatus: statusFor(r.id), statusReasons: [] }),
    ),
  };
}

const at = (minStatus: MinStatus) =>
  assess(packWithStatuses(), wideProfile(), CTX(), { minStatus });

describe('the empty-ledger invariant', () => {
  const pack = csrdPack();
  const result = assess(pack, wideProfile(), CTX());

  it('reads all twenty-three requirements as draft', () => {
    expect(pack.requirements).toHaveLength(23);
    for (const r of pack.requirements) {
      expect(r.derivedStatus, r.id).toBe('draft');
      expect(r.statusReasons, r.id).toEqual([]);
    }
  });

  it('evaluates all twenty-three at the default floor', () => {
    expect(evaluatedIds(result)).toHaveLength(23);
  });

  it('reports that the answer contains draft content', () => {
    expect(result.containsDraftContent).toBe(true);
  });

  it('stamps the derived status and its reasons onto every determination', () => {
    expect(result.determinations.length).toBeGreaterThan(0);
    for (const d of result.determinations) {
      expect(d.derivedStatus, d.requirementId).toBe('draft');
      expect(d.statusReasons, d.requirementId).toEqual([]);
    }
  });
});

describe('minStatus, one test per level', () => {
  it('defaults to draft, which is what keeps the migration bit-identical', () => {
    const defaulted = assess(csrdPack(), wideProfile(), CTX());
    const explicit = assess(csrdPack(), wideProfile(), CTX(), { minStatus: 'draft' });
    expect(defaulted).toEqual(explicit);
  });

  it('draft yields every requirement', () => {
    expect(evaluatedIds(at('draft'))).toHaveLength(23);
  });

  it('verified yields verified plus ratified, and nothing draft', () => {
    expect(evaluatedIds(at('verified'))).toEqual([...RATIFIED_IDS, ...VERIFIED_IDS].sort());
    expect(at('verified').containsDraftContent).toBe(false);
  });

  it('ratified yields ratified only', () => {
    expect(evaluatedIds(at('ratified'))).toEqual([...RATIFIED_IDS].sort());
    expect(at('ratified').containsDraftContent).toBe(false);
  });

  it('the level sets are closed under requirement_ref, so a cut cannot throw', () => {
    // Guards the three tests above: if a later content edit adds a reference out
    // of one of these sets, this fails here rather than as a confusing
    // "requirement_ref to unknown requirement" inside a filter test.
    expect(() => at('verified')).not.toThrow();
    expect(() => at('ratified')).not.toThrow();
  });
});

describe('an asserted ratification left in the authored content', () => {
  const temps: string[] = [];
  afterAll(() => {
    for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  });

  /**
   * A pack directory whose `CSRD-S-002` still carries `ratification`, with the
   * leftover-carrying content's own hash registered so the pack gets past
   * version integrity. Without that registration `VersionIntegrityError` fires
   * first and the check under test never runs — which would let a missing check
   * record itself as a pass.
   */
  function packDirCarryingRatification(): { dir: string; registryDir: string } {
    const root = mkdtempSync(join(tmpdir(), 'leftover-ratification-'));
    temps.push(root);
    const dir = join(root, 'csrd');
    const registryDir = join(root, 'requirement-versions');
    cpSync(PACK_DIR, dir, { recursive: true });
    cpSync(REGISTRY_DIR, registryDir, { recursive: true });

    const requirements = JSON.parse(readFileSync(join(dir, 'requirements.json'), 'utf8')) as Requirement[];
    const target = requirements.find((r) => r.id === 'CSRD-S-002');
    if (target === undefined) throw new Error('fixture: CSRD-S-002 is not in the pack');
    (target as unknown as Record<string, unknown>)['ratification'] = { status: 'draft' };
    writeFileSync(join(dir, 'requirements.json'), `${JSON.stringify(requirements, null, 2)}\n`, 'utf8');

    // The leftover is stripped before hashing, so this is the *unchanged* hash;
    // registering it is a no-op that documents why the load gets this far.
    const registryFile = join(registryDir, 'csrd.json');
    let registry = parseVersionRegistry(JSON.parse(readFileSync(registryFile, 'utf8')));
    registry = registerVersion(registry, target.id, target.version, requirementSha256(target));
    writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

    return { dir, registryDir };
  }

  it('fails the load, naming the requirement and the field', () => {
    const { dir, registryDir } = packDirCarryingRatification();
    let thrown: unknown;
    try {
      loadPack(dir, { versionRegistryDir: registryDir });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PackIntegrityError);
    // Not merely that it threw: version integrity would also throw, from a
    // different check, and would read as a pass here.
    expect(thrown).not.toBeInstanceOf(VersionIntegrityError);
    const message = (thrown as Error).message;
    expect(message).toContain('CSRD-S-002');
    expect(message).toContain('ratification');
    expect(message).toContain('status is derived from the signature ledger');
  });

  it('fails a directly constructed pack too, so the check is not a loader accident', () => {
    const pack = csrdPack();
    const [first, ...rest] = pack.requirements;
    if (first === undefined) throw new Error('fixture: the pack has no requirements');
    const carrying = { ...first, ratification: { status: 'draft' } } as unknown as Requirement;
    expect(() => verifyIntegrity({ ...pack, requirements: [carrying, ...rest] })).toThrow(
      /CSRD-S-001.*ratification/s,
    );
  });

  it('accepts the real pack, so the check is not firing on everything', () => {
    expect(() => verifyIntegrity(csrdPack())).not.toThrow();
  });
});

describe('the loader reads the ledger, rather than answering draft unconditionally', () => {
  // Without this the empty-ledger invariant above would pass just as well
  // against a loader that hardcoded `draft` — every requirement is draft today,
  // so "all draft" is the one answer a broken implementation also gives.
  const temps: string[] = [];
  afterAll(() => {
    for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  });

  const HASH = (c: string): string => c.repeat(64);

  function signing(requirementId: string, kind: 'verified' | 'ratified') {
    const fields = {
      kind,
      packId: 'csrd',
      packVersion: '0.1.0',
      requirementId,
      requirementVersion: 2,
      requirementSha256: HASH('a'),
      requirementInputSha256: HASH('b'),
      conditionSha256: HASH('c'),
      renderedConditionSha256: HASH('d'),
      rendererVersion: 'renderer-1.0.0',
      closureRendererVersion: 'closure-renderer-1.0.0',
      corpusClosureSha256: HASH('e'),
      corpus: [
        {
          docId: 'DOC-1',
          versionLabel: '2026-01-01',
          sha256Raw: HASH('f'),
          sha256Normalized: HASH('0'),
          normalizerVersion: 'normalize-1.0.0',
          artefactAuthenticity: 'official_consolidation',
          nonOperativeSections: [],
          sources: [{ sourceId: 'SRC-001', temporalStanding: 'in_force' }],
        },
      ],
      resultSha256: HASH('1'),
      pipelineVersion: 'pipeline-0.1.0',
      by: 'A. Reviewer',
      on: '2026-08-21',
    };
    return signingEntrySchema.parse({ ...fields, entryId: entryId(fields as unknown as UnsignedLedgerEntry) });
  }

  function revocation(target: LedgerEntry) {
    const fields = {
      kind: 'revoked',
      packId: target.packId,
      requirementId: target.requirementId,
      revokes: target.entryId,
      by: 'B. Reviewer',
      on: '2026-08-22',
      reason: 'withdrawn pending re-verification',
    };
    return revocationEntrySchema.parse({ ...fields, entryId: entryId(fields as unknown as UnsignedLedgerEntry) });
  }

  function ledgerFile(text: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'loader-ledger-'));
    temps.push(dir);
    const file = join(dir, 'signatures.jsonl');
    writeFileSync(file, text, 'utf8');
    return file;
  }

  /**
   * Three authority states, three distinguishable answers — and with no
   * resolver supplied, every one of them is `draft`.
   *
   * That is the point rather than a weakening. Before the freshness seam this
   * test asserted `verified` for a signature the loader had not checked, which
   * was the over-claim itself written down as an expectation. What discriminates
   * now is the *reason set*: a signature nobody evaluated says
   * `['freshness_unchecked']`, a withdrawal says `['revoked']`, and an untouched
   * requirement says `[]`. A loader that hardcoded `draft` would produce three
   * empty arrays and fail here, so the block's original guarantee survives the
   * behaviour change intact.
   *
   * The `[]` case is load-bearing in the other direction too: `draft, []` keeps
   * its exact meaning of *"no governing signature"*, and `freshness_unchecked`
   * must never appear merely because nothing is signed.
   */
  it('projects a governing signature, a governing revocation and an absence', () => {
    const verified = signing('CSRD-S-001', 'verified');
    const ratified = signing('CSRD-S-004', 'ratified');
    const withdrawn = signing('CSRD-S-002', 'verified');
    const entries = [verified, ratified, withdrawn, revocation(withdrawn)];
    const pack = loadPack(PACK_DIR, {
      ledgerPath: ledgerFile(`${entries.map((e) => JSON.stringify(e)).join('\n')}\n`),
    });
    const byId = new Map(pack.requirements.map((r) => [r.id, r]));

    // Signed, but nobody evaluated the signature's freshness.
    expect(byId.get('CSRD-S-001')?.derivedStatus).toBe('draft');
    expect(byId.get('CSRD-S-001')?.statusReasons).toEqual(['freshness_unchecked']);
    expect(byId.get('CSRD-S-004')?.derivedStatus).toBe('draft');
    expect(byId.get('CSRD-S-004')?.statusReasons).toEqual(['freshness_unchecked']);
    // Withdrawn: freshness is not consulted, so the reason is the withdrawal.
    expect(byId.get('CSRD-S-002')?.derivedStatus).toBe('draft');
    expect(byId.get('CSRD-S-002')?.statusReasons).toEqual(['revoked']);
    // Untouched by the ledger, so still the unsigned answer — and specifically
    // not `['freshness_unchecked']`, which would be a second vocabulary for
    // "nobody signed this".
    expect(byId.get('CSRD-S-003')?.derivedStatus).toBe('draft');
    expect(byId.get('CSRD-S-003')?.statusReasons).toEqual([]);
  });

  /**
   * The positive control for the test above.
   *
   * "A signature the loader has not checked is never `verified`" is satisfied
   * by a loader in which *nothing* is ever `verified`. Only the pair is
   * evidence, so the same ledger is loaded again with a resolver that evaluated
   * freshness and found nothing stale, and the entry's own `kind` comes back.
   */
  it('reports the entry kind once a resolver has actually evaluated freshness', () => {
    const verified = signing('CSRD-S-001', 'verified');
    const ratified = signing('CSRD-S-004', 'ratified');
    const pack = loadPack(PACK_DIR, {
      ledgerPath: ledgerFile(`${[verified, ratified].map((e) => JSON.stringify(e)).join('\n')}\n`),
      freshnessResolver: () => ({ checked: true, reasons: [] }),
    });
    const byId = new Map(pack.requirements.map((r) => [r.id, r]));

    expect(byId.get('CSRD-S-001')?.derivedStatus).toBe('verified');
    expect(byId.get('CSRD-S-001')?.statusReasons).toEqual([]);
    expect(byId.get('CSRD-S-004')?.derivedStatus).toBe('ratified');
    expect(byId.get('CSRD-S-004')?.statusReasons).toEqual([]);
  });

  /**
   * The status has to reach the engine, and it has to be a status the loader
   * could only have arrived at by reading the ledger *and* being told the
   * signature was fresh.
   *
   * The resolver is what makes `ratified` reachable at all now, so `minStatus:
   * 'ratified'` selecting exactly one requirement is a statement about both
   * halves of the seam rather than about the filter alone.
   */
  it('carries those statuses through to minStatus and containsDraftContent', () => {
    const pack = loadPack(PACK_DIR, {
      ledgerPath: ledgerFile(`${JSON.stringify(signing('CSRD-S-003', 'ratified'))}\n`),
      freshnessResolver: () => ({ checked: true, reasons: [] }),
    });
    const result = assess(pack, wideProfile(), CTX(), { minStatus: 'ratified' });
    expect(evaluatedIds(result)).toEqual(['CSRD-S-003']);
    expect(result.containsDraftContent).toBe(false);
    expect(result.determinations.every((d) => d.derivedStatus === 'ratified')).toBe(true);
  });

  it('withholds that same status when no resolver evaluated the signature', () => {
    // The counterexample to the test above, on the identical ledger: without an
    // evaluation the ratification does not clear a `ratified` floor, and the
    // answer is empty rather than confidently wrong.
    const pack = loadPack(PACK_DIR, {
      ledgerPath: ledgerFile(`${JSON.stringify(signing('CSRD-S-003', 'ratified'))}\n`),
    });
    const result = assess(pack, wideProfile(), CTX(), { minStatus: 'ratified' });
    expect(evaluatedIds(result)).toEqual([]);
  });

  it('refuses a damaged ledger rather than reading it as nothing signed', () => {
    // The failure that matters: a history that cannot be read must not be
    // indistinguishable from a history in which nobody signed anything.
    expect(() => loadPack(PACK_DIR, { ledgerPath: ledgerFile('{"kind":"verified"\n') })).toThrow(
      LedgerIntegrityError,
    );
    expect(() => loadPack(PACK_DIR, { ledgerPath: ledgerFile('not json at all\n') })).toThrow(
      /line 1/,
    );
  });

  it('treats an absent ledger file as an empty one', () => {
    const pack = loadPack(PACK_DIR, { ledgerPath: join(tmpdir(), 'no-such-ledger-file.jsonl') });
    for (const r of pack.requirements) expect(r.derivedStatus, r.id).toBe('draft');
  });
});

describe('the version registry after the bump', () => {
  const registry = parseVersionRegistry(
    JSON.parse(readFileSync(join(REGISTRY_DIR, 'csrd.json'), 'utf8')),
  );

  /**
   * The requirements re-authored since the version-3 bump: CSRD-S-002's
   * plain-English text gained its scope-not-timing statement on 2026-10-18
   * (`HANDOFF-2026-10-18-s002-scope-vs-timing.md`, version 4), and on
   * 2026-10-19 both size tests gained the Article 1(4) exclusion branch
   * (`knowledge-article-1-4-exclusion.test.ts`): CSRD-S-002 stands at 5 and
   * CSRD-S-001 at 4. On 2026-10-20 the C/G composition
   * (`knowledge-timing-and-exemption-composition.test.ts`) took CSRD-S-005,
   * CSRD-S-006 and CSRD-S-014 to 4 and authored CSRD-S-017 to CSRD-S-023 at
   * version 1 — the first requirements with no pre-migration history. Every
   * other requirement is still at 3. Stated as a table rather than a blanket
   * number so that a further re-authoring has to be declared here.
   */
  const AUTHORED_AFTER_MIGRATION = ['CSRD-S-017', 'CSRD-S-018', 'CSRD-S-019', 'CSRD-S-020', 'CSRD-S-021', 'CSRD-S-022', 'CSRD-S-023'];
  const CURRENT_VERSION = (id: string): number =>
    id === 'CSRD-S-002' ? 5
    : ['CSRD-S-001', 'CSRD-S-005', 'CSRD-S-006', 'CSRD-S-014'].includes(id) ? 4
    : AUTHORED_AFTER_MIGRATION.includes(id) ? 1
    : 3;

  it('records every requirement at its current version, matching its current content', () => {
    const pack = csrdPack();
    for (const r of pack.requirements) {
      expect(r.version, r.id).toBe(CURRENT_VERSION(r.id));
      expect(registry[r.id]?.[String(r.version)], r.id).toBe(requirementSha256(r));
    }
    // The version-3 digests are still bound to version 3 for every pre-migration
    // requirement, S-002 included: a later version appends, it never rewrites.
    // The seven authored at version 1 have no version 3 to keep.
    for (const r of pack.requirements) {
      if (AUTHORED_AFTER_MIGRATION.includes(r.id)) expect(registry[r.id]?.['3'], r.id).toBeUndefined();
      else expect(registry[r.id]?.['3'], r.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('still holds every historical digest, byte-for-byte, so old versions keep their meaning', () => {
    // Historical preservation, over **all thirty-two** committed entries —
    // sixteen requirements at version 1 and sixteen at version 2 — against
    // literals frozen from committed history rather than against anything the
    // migration produced. A registry that "still parses" is not the property; a
    // registry whose old digests are the old digests is.
    //
    // The previous shape of this test pinned seven version-2 values and no
    // version-1 value at all, so twenty-five of the thirty-two could be
    // rewritten with the whole suite green. Verified 2026-08-27 by rewriting
    // `CSRD-S-010`'s version-2 digest: 1459 tests passed.
    expect(FROZEN_HISTORICAL_DIGESTS).toHaveLength(32);
    for (const [id, version, digest] of FROZEN_HISTORICAL_DIGESTS) {
      expect(registry[id]?.[version], `${id} v${version}`).toBe(digest);
    }

    // The table covers the pre-migration pack rather than a subset of it:
    // sixteen requirements, each at both historical versions. Without this,
    // deleting rows from the oracle would weaken the check silently and stay
    // green. The seven authored on 2026-10-20 have no history to freeze.
    const covered = new Map<string, string[]>();
    for (const [id, version] of FROZEN_HISTORICAL_DIGESTS) {
      covered.set(id, [...(covered.get(id) ?? []), version].sort());
    }
    expect(covered.size).toBe(16);
    for (const [id, versions] of covered) expect(versions, id).toEqual(['1', '2']);
    expect([...covered.keys()].sort()).toEqual(
      csrdPack().requirements.map((r) => r.id).filter((id) => !AUTHORED_AFTER_MIGRATION.includes(id)).sort(),
    );
  });

  it('keeps the three versions distinct, so a version number names one content', () => {
    // Structural, and separate from the preservation table above: equal digests
    // across versions would mean a version number named nothing, and that would
    // be true even if every frozen literal still matched.
    const pack = csrdPack();
    for (const r of pack.requirements) {
      // A requirement authored at version 1 has one content and one digest.
      if (AUTHORED_AFTER_MIGRATION.includes(r.id)) {
        expect(Object.keys(registry[r.id] ?? {}), r.id).toEqual(['1']);
        continue;
      }
      const [one, two, three] = [registry[r.id]?.['1'], registry[r.id]?.['2'], registry[r.id]?.['3']];
      for (const [label, value] of [['1', one], ['2', two], ['3', three]] as const) {
        expect(value, `${r.id} v${label}`).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(one, r.id).not.toBe(two);
      expect(two, r.id).not.toBe(three);
      expect(one, r.id).not.toBe(three);
    }
  });

  it('holds exactly the versions 1 to the current one, and nothing beyond', () => {
    // A stray higher version would mean some requirement was re-authored
    // without being declared in `CURRENT_VERSION` above; a missing lower one
    // would mean history was dropped. Only S-002 has a version 5; S-001,
    // S-005, S-006 and S-014 have a version 4; the seven C/G requirements have
    // version 1 alone; the next requirement is the control.
    for (const r of csrdPack().requirements) {
      const expected = Array.from({ length: CURRENT_VERSION(r.id) }, (_, i) => String(i + 1));
      expect(Object.keys(registry[r.id] ?? {}).sort(), r.id).toEqual(expected);
    }
    expect(registry['CSRD-S-002']?.['5']).toMatch(/^[0-9a-f]{64}$/);
    expect(registry['CSRD-S-001']?.['4']).toMatch(/^[0-9a-f]{64}$/);
    expect(registry['CSRD-S-001']?.['5']).toBeUndefined();
    expect(registry['CSRD-S-003']?.['4']).toBeUndefined();
  });
});
