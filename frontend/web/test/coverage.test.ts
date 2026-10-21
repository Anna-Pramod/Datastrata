/**
 * The coverage register prints only a status the record can back.
 *
 * `lib/regimes.ts` asserted `encoded` and `watched` by hand, so the site could
 * say "watched" about six regimes no register row, pack or check stood behind.
 * The register replaces the words with a derivation: `supported` needs a
 * release policy that declares the regime and supports its closure; `draft`
 * needs a knowledge pack; `monitored` needs every register row checked within
 * cadence; everything else is `planned`. Each rule is a conjunction, so each
 * conjunct is driven to fail alone (evidence standard, failure mode 4) and the
 * two mutants the plan names — `supported` from signatures alone, `monitored`
 * from rows alone — are each caught by a case that names them.
 *
 * `coverageRegister` is pure and tested over hand-built inputs; `siteCoverage`
 * is the site's own assembly over the real repository, and is checked here so
 * the printed words trace to the record as it stands: CSRD draft with nothing
 * signed, six regimes planned, nothing supported or monitored.
 */

import { describe, expect, it } from 'vitest';
import {
  answerable,
  coverageRegister,
  COVERAGE_WORDS,
  planned,
  REGIME_CATALOGUE,
  type CoverageEntry,
  type CoverageInputs,
} from '@/lib/coverage';
import { siteCoverage } from '@/lib/site-coverage';

const SEVEN = ['csrd', 'cbam', 'brsr', 'ifrs', 'csddd', 'eudr', 'espr'];
const SIX_PLANNED = SEVEN.filter((id) => id !== 'csrd');

const NONE: CoverageInputs = { packs: [], monitoring: [] };

type Pack = CoverageInputs['packs'][number];
type Monitoring = CoverageInputs['monitoring'][number];

const csrdPack = (signed: number, releasePolicy: Pack['releasePolicy'] = null): Pack => ({
  regimeId: 'csrd',
  requirements: 23,
  signed,
  releasePolicy,
});

const cbamRows = (sources: number, checkedWithinCadence: number): Monitoring => ({
  regimeId: 'cbam',
  sources,
  checkedWithinCadence,
});

function entry(entries: CoverageEntry[], id: string): CoverageEntry {
  const found = entries.find((e) => e.id === id);
  if (found === undefined) throw new Error(`no coverage entry for ${id}`);
  return found;
}

describe('coverageRegister', () => {
  it('reads CSRD with a pack, 0 of 23 signed and no release policy as draft', () => {
    const csrd = entry(coverageRegister({ packs: [csrdPack(0)], monitoring: [] }), 'csrd');
    expect(csrd.status).toBe('draft');
    expect(csrd.detail).toBe('0 of 23 requirements signed');
  });

  it('keeps a fully signed pack at draft while no release policy exists', () => {
    // Mutant M1 — `supported` granted on `signed > 0` without a policy — turns
    // this status into `supported`.
    const csrd = entry(coverageRegister({ packs: [csrdPack(23)], monitoring: [] }), 'csrd');
    expect(csrd.status).toBe('draft');
    expect(csrd.detail).toBe('23 of 23 requirements signed');
  });

  it('grants supported when a release policy declares the regime and supports its closure', () => {
    const csrd = entry(
      coverageRegister({ packs: [csrdPack(23, { declares: true, closureSupported: true })], monitoring: [] }),
      'csrd',
    );
    expect(csrd.status).toBe('supported');
    expect(csrd.detail).toBe('23 of 23 requirements signed; release policy supports the closure');
  });

  it('withholds supported when the policy declares the regime but not its closure', () => {
    const csrd = entry(
      coverageRegister({ packs: [csrdPack(23, { declares: true, closureSupported: false })], monitoring: [] }),
      'csrd',
    );
    expect(csrd.status).toBe('draft');
  });

  it('withholds supported when the closure is supported but the policy does not declare the regime', () => {
    const csrd = entry(
      coverageRegister({ packs: [csrdPack(23, { declares: false, closureSupported: true })], monitoring: [] }),
      'csrd',
    );
    expect(csrd.status).toBe('draft');
  });

  it('reads a regime whose every register row was checked within cadence as monitored', () => {
    const cbam = entry(coverageRegister({ packs: [], monitoring: [cbamRows(3, 3)] }), 'cbam');
    expect(cbam.status).toBe('monitored');
    expect(cbam.detail).toBe('3 sources checked within cadence');
  });

  it('reads a regime with one row unchecked within cadence as planned, not monitored', () => {
    // Mutant M2 — `monitored` granted on `sources > 0` alone — turns this
    // status into `monitored`.
    const cbam = entry(coverageRegister({ packs: [], monitoring: [cbamRows(3, 2)] }), 'cbam');
    expect(cbam.status).toBe('planned');
    expect(cbam.detail).toBe('no knowledge pack, no monitored source');
  });

  it('reads a regime with register rows and no check at all as planned', () => {
    // Today's shape for every regime with rows: no scanner exists.
    const cbam = entry(coverageRegister({ packs: [], monitoring: [cbamRows(3, 0)] }), 'cbam');
    expect(cbam.status).toBe('planned');
  });

  it('does not read an empty monitoring row as monitored', () => {
    // 0 of 0 satisfies `checked === sources`; the `sources > 0` conjunct alone
    // keeps an empty register from reading as monitored.
    const cbam = entry(coverageRegister({ packs: [], monitoring: [cbamRows(0, 0)] }), 'cbam');
    expect(cbam.status).toBe('planned');
  });

  it('lets a pack decide the status before monitoring does', () => {
    const csrd = entry(
      coverageRegister({ packs: [csrdPack(0)], monitoring: [{ regimeId: 'csrd', sources: 3, checkedWithinCadence: 3 }] }),
      'csrd',
    );
    expect(csrd.status).toBe('draft');
    expect(csrd.detail).toBe('0 of 23 requirements signed');
  });

  it('reads the six catalogue regimes without a pack or monitoring as planned', () => {
    const entries = coverageRegister({ packs: [csrdPack(0)], monitoring: [] });
    for (const id of SIX_PLANNED) {
      const e = entry(entries, id);
      expect(e.status).toBe('planned');
      expect(e.detail).toBe('no knowledge pack, no monitored source');
    }
    // Positive control in the same output: the one regime with a pack is not planned.
    expect(entry(entries, 'csrd').status).toBe('draft');
  });

  it('prints the four status words as the proposal fixes them', () => {
    expect(COVERAGE_WORDS.draft).toBe('Draft · evaluation only');
    expect(COVERAGE_WORDS).toEqual({
      supported: 'Supported',
      draft: 'Draft · evaluation only',
      monitored: 'Monitored',
      planned: 'Planned',
    });
  });

  it('carries exactly the seven catalogue regimes, in catalogue order', () => {
    expect(REGIME_CATALOGUE.map((r) => r.id)).toEqual(SEVEN);
    expect(coverageRegister(NONE).map((e) => e.id)).toEqual(SEVEN);
    // The catalogue's words travel with the entry.
    const csrd = entry(coverageRegister(NONE), 'csrd');
    expect(csrd.short).toBe('CSRD');
    expect(csrd.name).toBe('Corporate Sustainability Reporting Directive');
    expect(csrd.decides).toMatch(/sustainability statement/);
  });

  it('splits entries into answerable (supported or draft) and planned', () => {
    const entries = coverageRegister({
      packs: [csrdPack(0), { regimeId: 'eudr', requirements: 4, signed: 4, releasePolicy: { declares: true, closureSupported: true } }],
      monitoring: [cbamRows(3, 3)],
    });
    expect(answerable(entries).map((e) => e.id)).toEqual(['csrd', 'eudr']);
    expect(planned(entries).map((e) => e.id)).toEqual(['brsr', 'ifrs', 'csddd', 'espr']);
    // The monitored regime belongs to neither helper.
    expect(entry(entries, 'cbam').status).toBe('monitored');
  });
});

describe('siteCoverage', () => {
  it('reads the repository as CSRD draft with 0 of 23 signed, six regimes planned, nothing supported or monitored', () => {
    const entries = siteCoverage();
    expect(entries.map((e) => e.id)).toEqual(SEVEN);
    const csrd = entry(entries, 'csrd');
    expect(csrd.status).toBe('draft');
    expect(csrd.detail).toBe('0 of 23 requirements signed');
    expect(answerable(entries).map((e) => e.id)).toEqual(['csrd']);
    expect(planned(entries).map((e) => e.id)).toEqual(SIX_PLANNED);
    expect(entries.filter((e) => e.status === 'supported' || e.status === 'monitored')).toEqual([]);
  });
});
