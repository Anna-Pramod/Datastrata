/**
 * The surface register is the second content firewall. sources.json says what
 * may be cited; this file says where we look and how much weight each place
 * carries. A malformed row is a build failure, not a runtime surprise.
 */

import { describe, expect, it } from 'vitest';
import { parseSourceRegister, RegisterIntegrityError, verifyRegisterIntegrity } from '../src/monitoring/register';
import type { RegisterSource } from '../src/monitoring/types';
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

const register = (sources: RegisterSource[]) => ({ program: 'TEST', updated: '2026-08-14', sources });

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
});
