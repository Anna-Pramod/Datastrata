/**
 * The freshness seam, where the loader stops over-claiming.
 *
 * Spec §5 and §5.1. Until this seam existed the loader held a governing
 * signature and reported its `kind` — `verified` or `ratified` — having looked
 * at no corpus, no rendered condition and no pinned result. That is the whole
 * defect: *absence of a freshness evaluation is never evidence of freshness.*
 *
 * The tests here are about the seam rather than about status arithmetic, which
 * `verification-status.test.ts` already covers exhaustively. Four properties
 * carry the design:
 *
 * 1. **Fail closed.** No resolver means `draft, ['freshness_unchecked']` —
 *    specifically not `draft, []`, which means "nobody signed this" and is the
 *    comfortable lie the reason vocabulary exists to prevent.
 * 2. **The resolver is asked only where the question has meaning.** Unsigned and
 *    revoked requirements never invoke it, asserted by counting calls rather
 *    than by reasoning about the branch structure.
 * 3. **Exceptions propagate.** "I checked and the record is broken" must never
 *    become "I have not checked." A `catch` here would convert an
 *    `IntegrityFailureError` into unchecked freshness, and the mutation teeth
 *    check for this file exists because §5 can only state that rule in prose.
 * 4. **The resolver is handed pack-local deterministic inputs, fully formed.**
 *    The authored requirement — no `derivedStatus`, no `statusReasons`, because
 *    a projection may not be an input to the content it is projected from — and
 *    a `RenderContext` whose `catalogues` is populated. The second is what the
 *    staging change in §5.1 buys: attaching status inside the object literal
 *    left `catalogues` unparsed at the moment status was attached.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { loadPack, PackIntegrityError } from '../src/knowledge/loader';
import type { FreshnessResolver, FreshnessResolverInput } from '../src/knowledge/loader';
import {
  entryId,
  LedgerIntegrityError,
  revocationEntrySchema,
  signingEntrySchema,
  type LedgerEntry,
  type UnsignedLedgerEntry,
} from '../src/verification/ledger';
import { IntegrityFailureError } from '../src/verification/sign';
import { requirementSha256 } from '../src/verification/canonical';
import { parseVersionRegistry, registerVersion, VersionIntegrityError } from '../src/verification/registry';
import type { CheckedFreshness } from '../src/verification/status';
import type { Requirement } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const PACK_DIR = join(here, '..', 'knowledge', 'csrd');
const REGISTRY_DIR = join(here, '..', 'verification', 'requirement-versions');

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
    corpusClosureSha256: HASH('e'),
    corpus: [
      {
        docId: 'DOC-1',
        versionLabel: '2026-01-01',
        sha256Raw: HASH('f'),
        sha256Normalized: HASH('0'),
        normalizerVersion: 'normalize-1.0.0',
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
  const dir = mkdtempSync(join(tmpdir(), 'loader-freshness-'));
  temps.push(dir);
  const file = join(dir, 'signatures.jsonl');
  writeFileSync(file, text, 'utf8');
  return file;
}

const ledgerOf = (...entries: LedgerEntry[]): string =>
  ledgerFile(`${entries.map((e) => JSON.stringify(e)).join('\n')}\n`);

/**
 * A resolver that records what it was asked, so "never invoked" is a counted
 * fact rather than an inference from reading the loader's branches.
 */
function spyResolver(answer: (input: FreshnessResolverInput) => CheckedFreshness) {
  const calls: FreshnessResolverInput[] = [];
  const resolver: FreshnessResolver = (input) => {
    calls.push(input);
    return answer(input);
  };
  return { resolver, calls };
}

const fresh = (): CheckedFreshness => ({ checked: true, reasons: [] });

describe('a governing signature with no resolver', () => {
  it('loads draft with freshness_unchecked, and specifically not draft with no reasons', () => {
    const pack = loadPack(PACK_DIR, { ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified')) });
    const target = pack.requirements.find((r) => r.id === 'CSRD-S-001');

    expect(target?.derivedStatus).toBe('draft');
    // `draft, []` means "nobody signed this". Somebody did; nobody checked.
    expect(target?.statusReasons).toEqual(['freshness_unchecked']);
    expect(target?.statusReasons).not.toEqual([]);
  });

  it('does the same for a ratification, which is the louder of the two claims', () => {
    const pack = loadPack(PACK_DIR, { ledgerPath: ledgerOf(signing('CSRD-S-004', 'ratified')) });
    const target = pack.requirements.find((r) => r.id === 'CSRD-S-004');

    expect(target?.derivedStatus).toBe('draft');
    expect(target?.statusReasons).toEqual(['freshness_unchecked']);
  });
});

describe('a governing signature with a resolver', () => {
  it('reports the entry kind when the resolver finds nothing stale', () => {
    const { resolver, calls } = spyResolver(fresh);
    const pack = loadPack(PACK_DIR, {
      ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified'), signing('CSRD-S-004', 'ratified')),
      freshnessResolver: resolver,
    });
    const byId = new Map(pack.requirements.map((r) => [r.id, r]));

    expect(byId.get('CSRD-S-001')?.derivedStatus).toBe('verified');
    expect(byId.get('CSRD-S-001')?.statusReasons).toEqual([]);
    expect(byId.get('CSRD-S-004')?.derivedStatus).toBe('ratified');
    expect(byId.get('CSRD-S-004')?.statusReasons).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('carries a blocking reason set through whole, advisory reasons included', () => {
    const { resolver } = spyResolver(() => ({
      checked: true,
      reasons: ['source_reissued', 'stale_result'],
    }));
    const pack = loadPack(PACK_DIR, {
      ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified')),
      freshnessResolver: resolver,
    });
    const target = pack.requirements.find((r) => r.id === 'CSRD-S-001');

    expect(target?.derivedStatus).toBe('draft');
    expect(target?.statusReasons).toEqual(['source_reissued', 'stale_result']);
  });

  it('keeps the entry kind for an advisory-only reason set', () => {
    const { resolver } = spyResolver(() => ({ checked: true, reasons: ['source_reissued'] }));
    const pack = loadPack(PACK_DIR, {
      ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified')),
      freshnessResolver: resolver,
    });
    const target = pack.requirements.find((r) => r.id === 'CSRD-S-001');

    expect(target?.derivedStatus).toBe('verified');
    expect(target?.statusReasons).toEqual(['source_reissued']);
  });
});

describe('the requirements the question does not arise for', () => {
  it('never invokes the resolver when nothing is signed', () => {
    const { resolver, calls } = spyResolver(fresh);
    const pack = loadPack(PACK_DIR, {
      ledgerPath: join(tmpdir(), 'no-such-ledger-file.jsonl'),
      freshnessResolver: resolver,
    });

    expect(pack.requirements).toHaveLength(16);
    expect(calls).toHaveLength(0);
    for (const r of pack.requirements) {
      expect(r.derivedStatus, r.id).toBe('draft');
      expect(r.statusReasons, r.id).toEqual([]);
    }
  });

  it('never invokes the resolver for a revoked signature', () => {
    const withdrawn = signing('CSRD-S-002', 'verified');
    const { resolver, calls } = spyResolver(fresh);
    const pack = loadPack(PACK_DIR, {
      ledgerPath: ledgerOf(withdrawn, revocation(withdrawn)),
      freshnessResolver: resolver,
    });
    const target = pack.requirements.find((r) => r.id === 'CSRD-S-002');

    expect(target?.derivedStatus).toBe('draft');
    expect(target?.statusReasons).toEqual(['revoked']);
    expect(calls).toHaveLength(0);
  });

  it('asks exactly once per governing signature and not once per requirement', () => {
    // Sixteen requirements, one signature. A resolver called sixteen times would
    // still produce the right statuses, and would be paying for fifteen answers
    // `deriveStatus` discards.
    const { resolver, calls } = spyResolver(fresh);
    loadPack(PACK_DIR, {
      ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified')),
      freshnessResolver: resolver,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.requirement.id).toBe('CSRD-S-001');
  });
});

describe('what the resolver is handed', () => {
  it('receives the authored requirement, with no projected status fields on it', () => {
    const { resolver, calls } = spyResolver(fresh);
    loadPack(PACK_DIR, {
      ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified')),
      freshnessResolver: resolver,
    });
    const input = calls[0];
    if (input === undefined) throw new Error('the resolver was never called');

    expect(input.packId).toBe('csrd');
    expect(input.requirement.id).toBe('CSRD-S-001');
    // Not `toBeUndefined`: the claim is that the key is absent, and a present
    // key holding `undefined` would satisfy the weaker assertion.
    expect(Object.keys(input.requirement)).not.toContain('derivedStatus');
    expect(Object.keys(input.requirement)).not.toContain('statusReasons');
    expect(input.entry.kind).toBe('verified');
    expect(input.entry.requirementId).toBe('CSRD-S-001');
  });

  it('receives a render context whose catalogues are populated, not an empty object', () => {
    // The staging change in §5.1 is what makes this true: `attachDerivedStatus`
    // used to run at the `requirements:` property while `catalogues:` was parsed
    // four properties later, so the render context could not exist yet.
    const { resolver, calls } = spyResolver(fresh);
    loadPack(PACK_DIR, {
      ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified')),
      freshnessResolver: resolver,
    });
    const input = calls[0];
    if (input === undefined) throw new Error('the resolver was never called');

    expect(input.renderContext.factTypes.length).toBeGreaterThan(0);
    expect(Object.keys(input.renderContext.catalogues).length).toBeGreaterThan(0);
    // The pack's own catalogues, not a placeholder that happens to be non-empty.
    const pack = loadPack(PACK_DIR, { ledgerPath: join(tmpdir(), 'no-such-ledger-file.jsonl') });
    expect(Object.keys(input.renderContext.catalogues).sort()).toEqual(
      Object.keys(pack.catalogues).sort(),
    );
    expect(input.renderContext.factTypes).toEqual(pack.factTypes);
  });
});

describe('a resolver that cannot complete its check', () => {
  const missingResult = (): never => {
    throw new IntegrityFailureError([
      { code: 'integrity_failure', detail: 'missing pinned result' },
    ]);
  };

  it('propagates the IntegrityFailureError rather than reporting unchecked freshness', () => {
    let thrown: unknown;
    try {
      loadPack(PACK_DIR, {
        ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified')),
        freshnessResolver: missingResult,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown, 'loadPack returned instead of propagating the resolver failure').toBeInstanceOf(
      IntegrityFailureError,
    );
    expect((thrown as IntegrityFailureError).category).toBe('integrity_failure');
    expect((thrown as Error).message).toContain('missing pinned result');
  });

  it('does not return a pack at all, so no surface can read draft + freshness_unchecked', () => {
    // The failure the mutation teeth check targets: a `catch` substituting
    // `{ checked: false }` would make this call succeed and hand back a
    // requirement claiming nobody had checked, when somebody checked and found
    // the record broken.
    let pack: unknown;
    try {
      pack = loadPack(PACK_DIR, {
        ledgerPath: ledgerOf(signing('CSRD-S-001', 'verified')),
        freshnessResolver: missingResult,
      });
    } catch {
      pack = undefined;
    }

    expect(pack, 'the resolver failure was swallowed and a pack was produced').toBeUndefined();
  });
});

describe('the checks that must survive the staging change', () => {
  it('refuses a damaged ledger before any resolver could be called', () => {
    // §5: a damaged history is not the resolver's to discover. `parseLedger`
    // runs before `governingEntry`, so this is ordering, asserted rather than
    // assumed.
    const { resolver, calls } = spyResolver(fresh);
    expect(() =>
      loadPack(PACK_DIR, {
        ledgerPath: ledgerFile('{"kind":"verified"\n'),
        freshnessResolver: resolver,
      }),
    ).toThrow(LedgerIntegrityError);
    expect(calls).toHaveLength(0);
  });

  it('still catches a leftover asserted ratification, which only the raw array shows', () => {
    // `verifyIntegrity` reads the requirements as the file wrote them. zod
    // strips `ratification`, so staging the parse must not quietly start passing
    // the parsed records instead.
    const root = mkdtempSync(join(tmpdir(), 'loader-freshness-leftover-'));
    temps.push(root);
    const dir = join(root, 'csrd');
    const registryDir = join(root, 'requirement-versions');
    cpSync(PACK_DIR, dir, { recursive: true });
    cpSync(REGISTRY_DIR, registryDir, { recursive: true });

    const requirements = JSON.parse(
      readFileSync(join(dir, 'requirements.json'), 'utf8'),
    ) as Requirement[];
    const target = requirements.find((r) => r.id === 'CSRD-S-002');
    if (target === undefined) throw new Error('fixture: CSRD-S-002 is not in the pack');
    (target as unknown as Record<string, unknown>)['ratification'] = { status: 'draft' };
    writeFileSync(join(dir, 'requirements.json'), `${JSON.stringify(requirements, null, 2)}\n`, 'utf8');

    const registryFile = join(registryDir, 'csrd.json');
    let registry = parseVersionRegistry(JSON.parse(readFileSync(registryFile, 'utf8')));
    registry = registerVersion(registry, target.id, target.version, requirementSha256(target));
    writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

    let thrown: unknown;
    try {
      loadPack(dir, { versionRegistryDir: registryDir });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PackIntegrityError);
    expect(thrown).not.toBeInstanceOf(VersionIntegrityError);
    expect((thrown as Error).message).toContain('CSRD-S-002');
    expect((thrown as Error).message).toContain('ratification');
  });
});
