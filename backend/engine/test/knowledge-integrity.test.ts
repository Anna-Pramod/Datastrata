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

  it('all v0 content is honestly marked draft (unratified)', () => {
    for (const r of pack.requirements) expect(r.ratification.status, r.id).toBe('draft');
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
