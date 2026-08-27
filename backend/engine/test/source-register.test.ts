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
import { loadCorpus } from '../src/corpus/store';
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
  // Empty rather than absent: `authorisedOrigins` is a required field, and a
  // register that simply omits it is not a register. Empty is also truthful for
  // these fixtures — none of them holds a corpus document, and a declaration is
  // required only where a document claims to serve the source (T5.2).
  authorisedOrigins: unknown[] = [],
) => ({ program, updated: '2026-08-14', governingAuthorities, authorisedOrigins, sources });

/** A pack whose sole requirement cites `sourceId`, for firewall fixtures. */
function citingPack(sourceId: string) {
  const base = csrdPack();
  return {
    ...base,
    requirements: [
      { ...base.requirements[0]!, provenance: [{ sourceId, locators: [{ kind: 'provision' as const, text: 'Art. 1' }] }] },
    ],
  };
}

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
    // The firewall's subject is a source a requirement actually cites: a
    // catalogue entry nothing rests on cannot bypass corroboration. `pack`
    // cites SRC-012 on efrag.org, so the news row condemns a real citation.
    expect(() => verifyRegisterIntegrity(reg, citingPack('SRC-012'))).toThrow(/W-091/);
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
   *
   * Five, not six: the 2026-08-27 correction re-attributed S-004 from `SRC-004`
   * to `SRC-002`, its host under Article 5(2). `SRC-004` is now cited by no
   * requirement and leaves this universe. It keeps its governing authority —
   * that authority is a statement about the instrument, not about whether
   * anything rests on it, so the row below is the audited *provenance* set and
   * is deliberately narrower than the set of authorities the register holds.
   */
  const AUDITED = ['SRC-001', 'SRC-002', 'SRC-005', 'SRC-007', 'SRC-008'] as const;

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

  it('holds exactly one tracker — the transposition listing — and no news surface', () => {
    // W-002 became a tracker when the D1a-0b audit established that the NIM
    // collection reports that notifications exist and carries none of the
    // normative text. Asserted by id rather than by count alone, so a second
    // surface quietly demoted would not slip through.
    const trackers = reg.sources.filter((s) => s.tier === 'tracker').map((s) => s.id);
    expect(trackers).toEqual(['W-002']);
    expect(reg.sources.filter((s) => s.tier === 'news')).toHaveLength(0);
  });

  it('marks the Official Journal and EUR-Lex records as the legal record', () => {
    const legal = reg.sources.filter((s) => s.tier === 'legal_record').map((s) => s.id);
    expect(legal).toEqual(expect.arrayContaining(['W-001', 'W-005', 'W-011']));
    // …and the transposition listing is not among them any more.
    expect(legal).not.toContain('W-002');
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

// ---------------------------------------------------------------------------
// authorisedOrigins — the serving-artefact authority surface
// ---------------------------------------------------------------------------

/**
 * What a source has authorised to carry its documents.
 *
 * **A sibling of `governingAuthorities`, never nested inside it.** That row
 * says what kind of authority the *source* is, and whether a determination may
 * rest on it. This one says which *origins* that source has authorised to serve
 * its artefacts. A corpus may legitimately hold a document for a source no
 * requirement cites — `SRC-004` is exactly that today — so corpus validity and
 * requirement citability are not the same question and do not share a row.
 *
 * **What a match will prove, once T5.2 enforces it:** that the source has
 * authorised the origin a document *records*. Not that the bytes were fetched
 * from there — a local actor able to edit the corpus can edit `url` and the
 * hashes together. That stronger claim is envelope E2's and is made nowhere in
 * Task 5.
 *
 * This block is schema and data only. Nothing here matches a declaration
 * against a corpus document; that is T5.2's boundary.
 */
describe('authorisedOrigins schema', () => {
  const origin = (over: Record<string, unknown> = {}) => ({
    kind: 'path_prefix',
    url: 'https://eur-lex.europa.eu/eli/dir/2013/34',
    ...over,
  });
  const row = (over: Record<string, unknown> = {}) => ({
    sourceId: 'SRC-001',
    origins: [origin()],
    rationale: 'Fixture declaration.',
    ...over,
  });
  /** A minimal register carrying whatever authorisedOrigins a case means to test. */
  const withOrigins = (authorisedOrigins: unknown[]) =>
    parseSourceRegister({
      program: 'CSRD',
      updated: '2026-08-27',
      governingAuthorities: [],
      authorisedOrigins,
      sources: [row0()],
    });
  /** One inert surface, because `sources` requires at least one. */
  function row0() {
    return {
      id: 'W-001', tier: 'legal_record', name: 'Fixture', authority: 'Fixture',
      url: 'https://example.invalid/fixture', feed: null, feedNote: 'Fixture.',
      governs: 'Nothing.', cadence: 'weekly', affectsRequirements: [],
      expectedProvenance: [], mustCorroborateWith: [], lastSeen: null,
      discoveredBy: 'fixture', tierRationale: 'Fixture.',
    };
  }

  it('accepts a well-formed declaration of each matcher kind', () => {
    // The positive control. Every refusal below moves exactly one thing from
    // here, so a refusal cannot be some unrelated schema failure.
    expect(() => withOrigins([row()])).not.toThrow();
    expect(() =>
      withOrigins([row({ origins: [origin({ kind: 'exact', url: 'https://eur-lex.europa.eu/eli/dir/2026/470/oj/eng' })] })]),
    ).not.toThrow();
  });

  it('refuses a duplicate sourceId — one source, one answer', () => {
    // Two rows would be two answers to one question with nothing to say which
    // governs: the shape Task 4 spent the provenance migration removing.
    expect(() => withOrigins([row(), row()])).toThrow(/SRC-001 is declared more than once/);
  });

  it('refuses an empty origins list — authorising nothing is not a declaration', () => {
    expect(() => withOrigins([row({ origins: [] })])).toThrow(/authorises nothing/);
  });

  it('refuses a duplicate origin inside one row', () => {
    // Not merely redundant: it makes the row's length stop meaning how many
    // distinct surfaces are authorised.
    expect(() => withOrigins([row({ origins: [origin(), origin()] })])).toThrow(/declared more than once/);
  });

  it('refuses http — a declaration matched by parsing must be unambiguous', () => {
    expect(() => withOrigins([row({ origins: [origin({ url: 'http://eur-lex.europa.eu/eli/dir/2013/34' })] })])).toThrow(
      /must be https/,
    );
  });

  it('refuses credentials in a declaration', () => {
    expect(() =>
      withOrigins([row({ origins: [origin({ url: 'https://user:pw@eur-lex.europa.eu/eli/dir/2013/34' })] })]),
    ).toThrow(/must not carry credentials/);
  });

  it('refuses a query-bearing declaration', () => {
    // These two matchers compare path identity. A query in the declaration
    // would be silently ignored at match time, so the declaration would mean
    // less than it appears to.
    expect(() =>
      withOrigins([row({ origins: [origin({ url: 'https://eur-lex.europa.eu/eli/dir/2013/34?uri=CELEX' })] })]),
    ).toThrow(/must not carry a query/);
  });

  it('refuses a fragment-bearing declaration', () => {
    expect(() =>
      withOrigins([row({ origins: [origin({ url: 'https://eur-lex.europa.eu/eli/dir/2013/34#art19a' })] })]),
    ).toThrow(/must not carry a fragment/);
  });

  it('refuses an unknown matcher kind', () => {
    // The matcher set is closed on purpose: no regex, glob or host kind. A host
    // matcher would be the defect itself — twelve of seventeen CSRD sources
    // share `eur-lex.europa.eu`, so host authority is no authority.
    expect(() => withOrigins([row({ origins: [origin({ kind: 'host' })] })])).toThrow();
    expect(() => withOrigins([row({ origins: [origin({ kind: 'regex' })] })])).toThrow();
  });

  it('refuses an unknown field, so a matcher cannot be smuggled in beside the kind', () => {
    expect(() => withOrigins([row({ origins: [{ ...origin(), pattern: '.*' }] })])).toThrow();
  });

  it('refuses a root path_prefix — that is hostname authority wearing a path', () => {
    // The whole point of a source-scoped declaration. A `/` prefix authorises
    // every artefact on the host, so `SRC-001` would cover the twelve other
    // CSRD sources sharing `eur-lex.europa.eu` — the coincidence §19.2 exists
    // to break.
    for (const url of ['https://eur-lex.europa.eu', 'https://eur-lex.europa.eu/']) {
      expect(() => withOrigins([row({ origins: [origin({ kind: 'path_prefix', url })] })]), url).toThrow(
        /a root prefix authorises the whole host/,
      );
    }
  });

  it('permits an exact declaration at the root, which authorises one path only', () => {
    // The discriminator for the rule above: the refusal is about *prefixes*
    // widening to a host, not about root paths being forbidden outright. An
    // exact root authorises exactly one URL and cannot widen.
    expect(() => withOrigins([row({ origins: [origin({ kind: 'exact', url: 'https://example.invalid/' })] })])).not.toThrow();
  });

  it('refuses duplicates that differ only in host case, default port or trailing slash', () => {
    // Canonical identity, not the authored string. The URL parser settles host
    // case and a default `:443`; the trailing slash is settled by the schema.
    // Without this, four spellings of one permission sit in a row looking like
    // four distinct authorised surfaces.
    const base = 'https://eur-lex.europa.eu/eli/dir/2013/34';
    for (const twin of [
      'https://EUR-LEX.EUROPA.EU/eli/dir/2013/34',
      'https://eur-lex.europa.eu:443/eli/dir/2013/34',
      'https://eur-lex.europa.eu/eli/dir/2013/34/',
    ]) {
      expect(
        () => withOrigins([row({ origins: [origin({ url: base }), origin({ url: twin })] })]),
        twin,
      ).toThrow(/declared more than once/);
    }
  });

  it('still accepts two genuinely different surfaces in one row', () => {
    // The positive control for the duplicate rule: it must catch spellings of
    // one permission without collapsing two real ones.
    expect(() =>
      withOrigins([
        row({
          origins: [
            origin({ url: 'https://eur-lex.europa.eu/eli/dir/2013/34' }),
            origin({ url: 'https://eur-lex.europa.eu/eli/dir/2013/35' }),
          ],
        }),
      ]),
    ).not.toThrow();
  });

  it('requires a rationale, and never consults it when matching', () => {
    // Required because every declarative row in this register states why it
    // exists. Non-operative because a matcher that read prose would make prose
    // operative: the coverage tests below decide entirely on kind and url.
    expect(() => withOrigins([row({ rationale: '' })])).toThrow();
    expect(() => withOrigins([{ sourceId: 'SRC-001', origins: [origin()] }])).toThrow();
  });
});

/**
 * The committed register already declares what the committed corpus will need.
 *
 * T5.2 will refuse a `(document, sourceId)` pair whose recorded origin no
 * declaration covers. This proves the migration authored the rows that pairing
 * requires, over the **real** corpus and the **real** register, before any
 * enforcement exists to depend on them.
 *
 * The coverage check below is written out locally rather than imported. There
 * is no production matcher yet — T5.2 owns it — and once there is, an expected
 * value computed by it would move in step with it and could never fail. This is
 * the independent oracle; the production matcher will be checked against these
 * same documents.
 *
 * It proves the recorded origin is authorised for the source. It does **not**
 * prove the bytes were fetched from that origin: a local actor able to edit the
 * corpus can edit `url` and the hashes together. That is envelope E2's claim.
 */
describe('the committed corpus is covered by the committed register', () => {
  /** `exact` / `path_prefix`, as T5.2 will implement them. Local on purpose. */
  function covers(declared: { kind: string; url: string }, candidateUrl: string): boolean {
    const a = new URL(declared.url);
    const b = new URL(candidateUrl);
    if (a.origin !== b.origin) return false;
    const strip = (p: string) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
    const declaredPath = strip(a.pathname);
    const candidatePath = strip(b.pathname);
    if (declared.kind === 'exact') return candidatePath === declaredPath;
    return candidatePath === declaredPath || candidatePath.startsWith(`${declaredPath}/`);
  }

  const register = loadSourceRegister(monitoringDir, csrdPack()) as unknown as {
    authorisedOrigins: { sourceId: string; origins: { kind: string; url: string }[] }[];
  };
  const documents = loadCorpus(join(monitoringDir, '..', 'corpus')).index.documents;

  it('every (document, source) pair the corpus claims has a covering declaration', () => {
    expect(documents.length).toBeGreaterThan(0);
    let pairs = 0;
    for (const document of documents) {
      expect(document.serves.length, document.docId).toBeGreaterThan(0);
      for (const sourceId of document.serves) {
        pairs += 1;
        const row = register.authorisedOrigins.find((r) => r.sourceId === sourceId);
        expect(row, `${document.docId} serves ${sourceId} with no authorisedOrigins row`).toBeDefined();
        expect(
          row!.origins.some((o) => covers(o, document.url)),
          `${document.docId} (${document.url}) is not covered by any origin declared for ${sourceId}`,
        ).toBe(true);
      }
    }
    // Not vacuous: the loop ran over real pairs.
    expect(pairs).toBe(2);
  });

  it('a declaration authorises its own source and no other on the same host', () => {
    // The §19.2 property, over real data: twelve of seventeen CSRD sources sit
    // on `eur-lex.europa.eu`, so a host-shaped rule would authorise everything
    // for everything. SRC-001's document must not be covered by SRC-004's
    // declaration, nor the reverse.
    const bySource = new Map(register.authorisedOrigins.map((r) => [r.sourceId, r.origins]));
    const host = documents.find((d) => d.serves.includes('SRC-001'))!;
    const amending = documents.find((d) => d.serves.includes('SRC-004'))!;
    expect(new URL(host.url).origin).toBe(new URL(amending.url).origin);

    expect(bySource.get('SRC-004')!.some((o) => covers(o, host.url))).toBe(false);
    expect(bySource.get('SRC-001')!.some((o) => covers(o, amending.url))).toBe(false);
  });

  it('declares nothing for sources no committed artefact serves — today', () => {
    // **A migration assertion about the current CSRD corpus, not a schema
    // invariant.** Nothing forbids a register from declaring an origin for a
    // source no artefact serves yet, and ingesting SRC-007 will legitimately
    // add a row before any document exists to match it. What this pins is that
    // *this* migration authored the minimum: SRC-007 and SRC-008 are
    // registered, cited and ungated by E1, but nothing serves them, so
    // declaring an origin for them would authorise a surface on speculation.
    const declared = register.authorisedOrigins.map((r) => r.sourceId).sort();
    const served = [...new Set(documents.flatMap((d) => d.serves))].sort();
    expect(declared).toEqual(served);
  });

  it('the prefix declaration stops at a path-segment boundary', () => {
    // What makes `path_prefix` source-specific rather than string-shaped.
    const src001 = register.authorisedOrigins.find((r) => r.sourceId === 'SRC-001')!.origins[0]!;
    expect(covers(src001, 'https://eur-lex.europa.eu/eli/dir/2013/34/2026-03-18')).toBe(true);
    expect(covers(src001, 'https://eur-lex.europa.eu/eli/dir/2013/345/oj/eng')).toBe(false);
    expect(covers(src001, 'https://eur-lex.europa.eu/eli/dir/2013/3')).toBe(false);
  });
});
