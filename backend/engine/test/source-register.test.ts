/**
 * The surface register is the second content firewall. sources.json says what
 * may be cited; this file says where we look and how much weight each place
 * carries. A malformed row is a build failure, not a runtime surprise.
 */

import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  governingAuthorityFor,
  isCitableSource,
  loadSourceRegister,
  NoGoverningAuthorityError,
  parseSourceRegister,
  RegisterIntegrityError,
  TIER_POLICY,
  verifyCitationCoverage,
  verifyRegisterIntegrity,
} from '../src/monitoring/register';
import type { RegisterSource, SourceAuthority } from '../src/monitoring/types';
import { csrdPack } from './helpers';

/** A minimal valid row. Tests override single fields to isolate one failure. */
function row(over: Partial<RegisterSource> = {}): RegisterSource {
  return {
    id: 'W-001',
    tier: 'legal_record',
    name: 'EUR-Lex — a directive',
    authority: 'EU Publications Office',
    url: 'https://eur-lex.europa.eu/eli/dir/2026/470/oj/eng',
    feed: null,
    feedNote: 'Not yet investigated',
    governs: 'Legal status and corrigenda',
    cadence: 'weekly',
    affectsRequirements: [],
    expectedProvenance: [],
    mustCorroborateWith: [],
    lastSeen: null,
    discoveredBy: 'test fixture',
    tierRationale: 'The Official Journal is the legal record',
    ...over,
  };
}

// Program defaults to the real pack's program so fixtures cross-validate
// against csrdPack() out of the box; tests that need a mismatch override it.
const register = (
  sources: RegisterSource[],
  program = 'CSRD',
  governingAuthorities: SourceAuthority[] = [],
) => ({ program, updated: '2026-08-14', governingAuthorities, sources });

/** The real register's directory, needed by more than one block. */
const monitoringDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'monitoring');

/** A minimal valid governing authority. */
function authority(over: Partial<SourceAuthority> = {}): SourceAuthority {
  return { sourceId: 'SRC-001', tier: 'legal_record', rationale: 'An EU directive is the legal record', ...over };
}

describe('source register schema', () => {
  it('accepts a well-formed register', () => {
    const parsed = parseSourceRegister(register([row()]));
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0]?.tier).toBe('legal_record');
  });

  it('rejects a tier outside the four allowed values', () => {
    expect(() => parseSourceRegister(register([row({ tier: 'blog' as never })]))).toThrow();
  });

  it('rejects an unknown field, so typos cannot pass silently', () => {
    const bad = register([{ ...row(), tierr: 'news' } as never]);
    expect(() => parseSourceRegister(bad)).toThrow();
  });

  it('rejects a duplicate source id', () => {
    const dup = register([row({ id: 'W-001' }), row({ id: 'W-001', name: 'Another' })]);
    expect(() => parseSourceRegister(dup)).toThrow(RegisterIntegrityError);
  });

  it('requires a tierRationale, so a tier is never assigned without a stated reason', () => {
    expect(() => parseSourceRegister(register([row({ tierRationale: '' })]))).toThrow();
  });
});

describe('tier corroboration policy', () => {
  it('accepts a tracker row that declares it must corroborate with the legal record', () => {
    const parsed = parseSourceRegister(
      register([row({ tier: 'tracker', mustCorroborateWith: ['legal_record'] })]),
    );
    expect(parsed.sources[0]?.mustCorroborateWith).toEqual(['legal_record']);
  });

  it('rejects a tracker row that claims it needs no corroboration', () => {
    expect(() =>
      parseSourceRegister(register([row({ tier: 'tracker', mustCorroborateWith: [] })])),
    ).toThrow(RegisterIntegrityError);
  });

  it('rejects a news row that claims it needs no corroboration', () => {
    expect(() =>
      parseSourceRegister(register([row({ tier: 'news', mustCorroborateWith: [] })])),
    ).toThrow(RegisterIntegrityError);
  });

  it('rejects a legal_record row that claims it needs corroboration', () => {
    expect(() =>
      parseSourceRegister(register([row({ tier: 'legal_record', mustCorroborateWith: ['legal_record'] })])),
    ).toThrow(RegisterIntegrityError);
  });

  it('names the offending source and both tiers in the error', () => {
    try {
      parseSourceRegister(register([row({ id: 'W-042', tier: 'news', mustCorroborateWith: [] })]));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as RegisterIntegrityError).problems[0]).toContain('W-042');
      expect((e as RegisterIntegrityError).problems[0]).toContain('legal_record');
    }
  });
});

describe('register ↔ pack referential integrity', () => {
  const pack = csrdPack();

  it('accepts references that resolve against the pack', () => {
    const reg = parseSourceRegister(
      register([row({ affectsRequirements: ['CSRD-S-001'], expectedProvenance: ['SRC-004'] })]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).not.toThrow();
  });

  it('rejects a reference to a requirement that does not exist', () => {
    const reg = parseSourceRegister(register([row({ affectsRequirements: ['CSRD-S-999'] })]));
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/CSRD-S-999/);
  });

  it('rejects provenance pointing at a source that does not exist', () => {
    const reg = parseSourceRegister(register([row({ expectedProvenance: ['SRC-999'] })]));
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/SRC-999/);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const reg = parseSourceRegister(
      register([row({ affectsRequirements: ['CSRD-S-998'], expectedProvenance: ['SRC-997'] })]),
    );
    try {
      verifyRegisterIntegrity(reg, pack);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as RegisterIntegrityError).problems).toHaveLength(2);
    }
  });

  it('rejects a register whose program does not match the pack', () => {
    // Empty affectsRequirements/expectedProvenance would otherwise cross-validate
    // cleanly against any pack — the program check is what catches the mismatch.
    const reg = parseSourceRegister(register([row()], 'OTHER-PROGRAM'));
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/OTHER-PROGRAM/);
  });
});

describe('citation firewall', () => {
  const pack = csrdPack();

  it('allows an official_body surface to share a host with a cited source', () => {
    // SRC-011 is a finance.ec.europa.eu page; the Commission is citable.
    const reg = parseSourceRegister(
      register([
        row({
          tier: 'official_body',
          url: 'https://finance.ec.europa.eu/some/other/page_en',
          tierRationale: 'European Commission, authoritative but not the legal record',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).not.toThrow();
  });

  it('rejects a pack citing a host registered as a tracker', () => {
    const reg = parseSourceRegister(
      register([
        row({
          id: 'W-090',
          tier: 'tracker',
          // Deliberately a host the CSRD pack really cites.
          url: 'https://eur-lex.europa.eu/some/commentary',
          mustCorroborateWith: ['legal_record'],
          tierRationale: 'Fixture: pretend commentary to prove the firewall fires',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/W-090/);
  });

  it('rejects a pack citing a host registered as news', () => {
    const reg = parseSourceRegister(
      register([
        row({
          id: 'W-091',
          tier: 'news',
          url: 'https://www.efrag.org/newsroom',
          mustCorroborateWith: ['legal_record'],
          tierRationale: 'Fixture: pretend press surface to prove the firewall fires',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/W-091/);
  });

  it('ignores a www. prefix when matching hosts', () => {
    const reg = parseSourceRegister(
      register([
        row({
          id: 'W-092',
          tier: 'tracker',
          url: 'https://www.eur-lex.europa.eu/commentary',
          mustCorroborateWith: ['legal_record'],
          tierRationale: 'Fixture: same host as SRC-001 with a www prefix',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/W-092/);
  });

  it('does not flag a tracker row at a host the pack never cites', () => {
    // Proves the firewall discriminates by host, not merely by the presence of
    // an uncitable row — an implementation that threw on any uncitable row
    // regardless of the pack would also pass every test above.
    const reg = parseSourceRegister(
      register([
        row({
          id: 'W-093',
          tier: 'tracker',
          url: 'https://example.org/tracker',
          mustCorroborateWith: ['legal_record'],
          tierRationale: 'Fixture: tracker at a host the pack never cites',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).not.toThrow();
  });
});

describe('a source\'s governing authority, distinct from the surfaces that watch it', () => {
  it('resolves a source to the one statement of what it is', () => {
    const reg = parseSourceRegister(register([row()], 'CSRD', [authority()]));
    expect(governingAuthorityFor(reg, 'SRC-001').tier).toBe('legal_record');
    expect(isCitableSource(reg, 'SRC-001')).toBe(true);
  });

  it('refuses a source with no authority rather than inferring one from a surface', () => {
    // The counterexample that keeps the positive claim from passing vacuously:
    // W-001 names SRC-004 in expectedProvenance and is a legal_record row, so a
    // tier could be *inferred* here. The lookup refuses instead.
    const reg = parseSourceRegister(
      register([row({ expectedProvenance: ['SRC-004'] })], 'CSRD', [authority()]),
    );
    expect(() => governingAuthorityFor(reg, 'SRC-004')).toThrow(NoGoverningAuthorityError);
    expect(() => governingAuthorityFor(reg, 'SRC-004')).toThrow(/SRC-004/);
  });

  it('requires the field, so a register cannot omit governing authority silently', () => {
    // Without this, making the schema `.optional()` leaves the whole suite green
    // and the record becomes advisory (evidence standard, failure mode 6).
    expect(() =>
      parseSourceRegister({ program: 'CSRD', updated: '2026-08-14', sources: [row()] }),
    ).toThrow(/governingAuthorities/);
  });

  it('rejects two governing authorities for one source', () => {
    expect(() =>
      parseSourceRegister(
        register([row()], 'CSRD', [authority(), authority({ tier: 'tracker' })]),
      ),
    ).toThrow(/SRC-001: more than one governing authority/);
  });

  it('requires a rationale, so a source tier is never assigned without a stated reason', () => {
    // Schema violations surface as ZodError, matching the sibling tierRationale
    // test above; only cross-row problems become RegisterIntegrityError.
    expect(() =>
      parseSourceRegister(register([row()], 'CSRD', [authority({ rationale: '' })])),
    ).toThrow(/rationale/);
  });

  it('rejects an authority for a source the pack does not carry', () => {
    const reg = parseSourceRegister(register([row()], 'CSRD', [authority({ sourceId: 'SRC-999' })]));
    expect(() => verifyRegisterIntegrity(reg, csrdPack())).toThrow(/authority for SRC-999/);
  });

  it('keeps the two surfaces watching the pending acts at disagreeing tiers', () => {
    // W-004 (official_body) and W-005 (legal_record) both watch SRC-007 and
    // SRC-008. That is not a contradiction: they are different surfaces for the
    // same pending acts, and W-004's own onEvent says the OJ record governs the
    // event. The authority is stated separately, and this asserts the surfaces
    // still disagree — if they ever stopped, this test would stop discriminating.
    const reg = loadSourceRegister(monitoringDir, csrdPack());
    for (const sourceId of ['SRC-007', 'SRC-008']) {
      const watchers = reg.sources.filter((s) => s.expectedProvenance.includes(sourceId));
      expect(watchers.map((s) => s.id).sort(), sourceId).toEqual(['W-004', 'W-005']);
      expect(new Set(watchers.map((s) => s.tier)), sourceId).toEqual(
        new Set(['official_body', 'legal_record']),
      );
      expect(governingAuthorityFor(reg, sourceId).tier, sourceId).toBe('legal_record');
    }
  });
});

describe('the governing authority decides citability, not a surface sharing its host', () => {
  it('refuses a cited source whose governing authority may not be cited', () => {
    // The disagreement the record exists to prevent: the host rule would call
    // this citable, because eur-lex.europa.eu carries citable surfaces. The
    // authority says tracker, and the authority governs.
    const pack = csrdPack();
    const cited = pack.sources[0]!;
    const reg = parseSourceRegister(
      register([row()], 'CSRD', [authority({ sourceId: cited.id, tier: 'tracker' })]),
    );
    expect(() => verifyCitationCoverage(reg, pack)).toThrow(
      new RegExp(`${cited.id} appears in sources.json, but its governing authority is tracker`),
    );
  });

  it('still falls back to the host rule for a source with no governing authority', () => {
    // The positive sibling: without it, the check above would pass equally
    // against an implementation that refused every source. Narrowed to one
    // source so the fixture does not have to carry every host the pack cites.
    const pack = csrdPack();
    const eurLexSource = pack.sources.find((s) => s.url.includes('eur-lex.europa.eu'))!;
    const onePack = { ...pack, sources: [eurLexSource] };
    const reg = parseSourceRegister(register([row()], 'CSRD', []));
    expect(() => verifyCitationCoverage(reg, onePack)).not.toThrow();
  });
});

describe('the audited provenance universe resolves to governing authority', () => {
  /**
   * The universe the D1a-0b audit produced
   * (`docs/superpowers/reports/2026-08-24-d1a-provenance-audit.md` §11).
   * Written out rather than derived from requirements.json, because the pack
   * still carries the pre-audit citations until Task 4 re-authors them — a
   * derivation would assert the old universe and pass for the wrong reason.
   */
  const AUDITED = ['SRC-001', 'SRC-002', 'SRC-004', 'SRC-005', 'SRC-007', 'SRC-008'] as const;

  it('every audited source has exactly one governing authority, and it permits citation', () => {
    const reg = loadSourceRegister(monitoringDir, csrdPack());
    for (const sourceId of AUDITED) {
      const matches = reg.governingAuthorities.filter((a) => a.sourceId === sourceId);
      expect(matches, `${sourceId} governing authority count`).toHaveLength(1);
      // The tier by name, not merely `citable` — official_body is citable too,
      // so asserting citability alone would pass a silent downgrade.
      expect(matches[0]!.tier, `${sourceId} tier`).toBe('legal_record');
      expect(TIER_POLICY[matches[0]!.tier].citable, `${sourceId} citable`).toBe(true);
    }
  });

  it('a source the audit removed has no authority — the check is not satisfied by everything', () => {
    // The counterexample. SRC-010 and SRC-015 were cited before the audit and
    // are not in the audited universe; if the assertion above passed for them
    // too it would be measuring nothing.
    const reg = loadSourceRegister(monitoringDir, csrdPack());
    for (const sourceId of ['SRC-010', 'SRC-015']) {
      expect(() => governingAuthorityFor(reg, sourceId)).toThrow(NoGoverningAuthorityError);
    }
  });
});

describe('the real CSRD source register', () => {
  const pack = csrdPack();
  const dir = monitoringDir;
  const reg = loadSourceRegister(dir, pack);

  it('loads, validates and cross-references cleanly', () => {
    expect(() => verifyRegisterIntegrity(reg, pack)).not.toThrow();
    expect(reg.program).toBe('CSRD');
  });

  it('loads without a pack when no cross-validation is needed', () => {
    const bare = loadSourceRegister(dir);
    expect(bare.sources).toHaveLength(13);
  });

  it('carries every surface migrated from the watchlist, plus the three the audit added', () => {
    // W-001..W-010 came from watchlist.json; W-011..W-013 were added by the
    // D1a-0b audit, which made SRC-001, SRC-002 and SRC-005 load-bearing while
    // nothing watched them. The count is asserted alongside both endpoints so a
    // silently dropped row cannot pass.
    expect(reg.sources).toHaveLength(13);
    const ids = reg.sources.map((s) => s.id);
    expect(ids).toContain('W-001');
    expect(ids).toContain('W-010');
    expect(ids).toContain('W-011');
    expect(ids).toContain('W-013');
  });

  it('states a tier rationale and a feed note for every surface', () => {
    for (const s of reg.sources) {
      expect(s.tierRationale.length, s.id).toBeGreaterThan(0);
      expect(s.feedNote.length, s.id).toBeGreaterThan(0);
    }
  });

  it('holds no tracker or news surface yet — those arrive with the first map sweep', () => {
    expect(reg.sources.every((s) => s.tier === 'legal_record' || s.tier === 'official_body')).toBe(true);
  });

  it('marks the Official Journal and EUR-Lex records as the legal record', () => {
    const legal = reg.sources.filter((s) => s.tier === 'legal_record').map((s) => s.id);
    expect(legal).toEqual(expect.arrayContaining(['W-001', 'W-002', 'W-005']));
  });

  it('passes verifyCitationCoverage against the real pack', () => {
    expect(() => verifyCitationCoverage(reg, pack)).not.toThrow();
  });

  it('rejects a register missing a host the pack cites', () => {
    const thin = parseSourceRegister(register([row({ url: 'https://example.org/act' })]));
    expect(() => verifyCitationCoverage(thin, pack)).toThrow(RegisterIntegrityError);
  });

  it('rejects a register whose only matching row is at a non-citable tier', () => {
    // Same host as the real legal record (W-001/W-005), but registered as a
    // tracker — coverage must require a *citable* surface, not merely a
    // registered one at the right host.
    const wrongTier = parseSourceRegister(
      register([
        row({
          tier: 'tracker',
          url: 'https://eur-lex.europa.eu/some/commentary',
          mustCorroborateWith: ['legal_record'],
          tierRationale: 'Fixture: right host, wrong tier — must not satisfy coverage',
        }),
      ]),
    );
    try {
      verifyCitationCoverage(wrongTier, pack);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as RegisterIntegrityError).problems.some((p) => p.includes('eur-lex.europa.eu'))).toBe(true);
    }
  });
});
