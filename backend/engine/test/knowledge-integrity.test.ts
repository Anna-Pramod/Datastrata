/**
 * Content firewall: the CSRD pack must load, validate, and cross-reference
 * cleanly. A dangling citation or unknown FactType is a build failure, not a
 * runtime surprise.
 */

import { describe, expect, it } from 'vitest';
import { csrdPack } from './helpers';

describe('CSRD knowledge pack integrity', () => {
  const pack = csrdPack();

  it('loads and passes referential integrity (loader throws otherwise)', () => {
    expect(pack.id).toBe('csrd');
  });

  it('has the expected content inventory', () => {
    expect(pack.requirements).toHaveLength(16);
    expect(pack.sources).toHaveLength(17);
    expect(pack.obligationTemplates).toHaveLength(17);
    expect(pack.gapTests).toHaveLength(16);
    expect(pack.questions).toHaveLength(38);
    expect(pack.factTypes.length).toBeGreaterThanOrEqual(47);
  });

  it('every requirement cites at least one official source', () => {
    for (const r of pack.requirements) expect(r.sources.length, r.id).toBeGreaterThan(0);
  });

  it('all v0 content derives as draft — nothing has been signed', () => {
    // Derived from the ledger by the loader, not asserted in the JSON. With an
    // empty ledger this is spec §7.2's invariant, and it is the reason the
    // prototype banner is still honest.
    for (const r of pack.requirements) {
      expect(r.derivedStatus, r.id).toBe('draft');
      expect(r.statusReasons, r.id).toEqual([]);
    }
  });

  it('no country pack is ratified yet — the national-law gate must stay closed', () => {
    expect(Object.keys(pack.catalogues['ratified_country_packs']!.entries)).toHaveLength(0);
  });

  it('pending acts are pack flags, not silently-on law', () => {
    expect(pack.packFlags['revised_esrs_in_force']).toBe(false);
    expect(pack.packFlags['voluntary_standard_in_force']).toBe(false);
  });

  it('the pack carries a national-law completeness gate', () => {
    expect(pack.requirements.some((r) => r.relationshipClass === 'legal_status_gate')).toBe(true);
  });
});

/**
 * Temporal standing is authored once, on the source record, and every other
 * expression of the same fact in the pack must agree with it. Two such
 * expressions exist: the pack flags the engine evaluates with, and the
 * change-watch items the dashboard renders. Neither may become a second
 * authority, so each is cross-checked here in both directions.
 */
describe('temporal standing has one owner in the pack', () => {
  const pack = csrdPack();
  const standingOf = (id: string) => pack.sources.find((s) => s.id === id)?.temporalStanding;

  it('every instrument carries a standing and no non-instrument does', () => {
    const instruments = ['SRC-001', 'SRC-002', 'SRC-003', 'SRC-004', 'SRC-005', 'SRC-006', 'SRC-007', 'SRC-008', 'SRC-016', 'SRC-017'];
    for (const id of instruments) expect(standingOf(id), id).toBeDefined();
    for (const s of pack.sources) {
      if (!instruments.includes(s.id)) expect(s.temporalStanding, s.id).toBeUndefined();
    }
    expect(standingOf('SRC-007')).toBe('adopted_not_effective');
    expect(standingOf('SRC-008')).toBe('adopted_not_effective');
    // The retired free-text field is gone from every record, not merely renamed on some.
    for (const s of pack.sources) expect(s).not.toHaveProperty('statusAtSnapshot');
  });

  it('B7 — the pack flags and the two adopted acts’ standing agree, in both directions', () => {
    // Biconditional: the flag means entry into force, which is exactly what
    // `in_force` means; the pack keeps application dates in the requirement's
    // own cases, so no one-way slack is needed. Asserted per pair.
    const pairs: [string, string][] = [
      ['revised_esrs_in_force', 'SRC-007'],
      ['voluntary_standard_in_force', 'SRC-008'],
    ];
    const disagreements = (p: typeof pack) =>
      pairs.filter(([flag, source]) => {
        const standing = p.sources.find((s) => s.id === source)?.temporalStanding;
        return (p.packFlags[flag] === true) !== (standing === 'in_force');
      }).map(([flag]) => flag);
    for (const [flag] of pairs) expect(pack.packFlags[flag], flag).toBeDefined();
    expect(disagreements(pack)).toEqual([]);
    // Positive controls, both directions, through the same rule: a flag up
    // while the act is not in force, and an act in force while its flag lags.
    expect(disagreements({ ...pack, packFlags: { ...pack.packFlags, revised_esrs_in_force: true } })).toEqual(['revised_esrs_in_force']);
    expect(disagreements({ ...pack, sources: pack.sources.map((s) => (s.id === 'SRC-008' ? { ...s, temporalStanding: 'in_force' as const } : s)) })).toEqual(['voluntary_standard_in_force']);
  });

  it('B7b — a changeWatch status drawn from the standing vocabulary agrees with its instruments’ standing', () => {
    const vocabulary = new Set(['in_force', 'adopted_not_effective', 'proposed', 'superseded']);
    const disagreements = (p: typeof pack): { checked: number; failures: string[] } => {
      let checked = 0;
      const failures: string[] = [];
      for (const watch of p.changeWatch) {
        if (!vocabulary.has(watch.status)) continue; // watch-progress prose, e.g. in_progress
        for (const sourceId of watch.sources) {
          const standing = p.sources.find((s) => s.id === sourceId)?.temporalStanding;
          if (standing === undefined) continue; // a non-instrument listed beside the act (SRC-010)
          checked += 1;
          if (standing !== watch.status) failures.push(`${watch.id} ${sourceId}`);
        }
      }
      return { checked, failures };
    };
    // Not vacuous: the two adopted acts are watched under a standing value.
    expect(disagreements(pack)).toEqual({ checked: 2, failures: [] });
    // Positive control through the same rule: a watch whose status
    // contradicts its instrument is named.
    const contradicting = { ...pack, changeWatch: pack.changeWatch.map((w) => (w.id === 'CW-001' ? { ...w, status: 'in_force' } : w)) };
    expect(disagreements(contradicting).failures).toEqual(['CW-001 SRC-007']);
  });
});
