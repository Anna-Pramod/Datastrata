/**
 * The live trace reads standing from the pack's structured field, never from
 * free text.
 *
 * `traceSeries` used to regex-match `statusAtSnapshot` — a second, undeclared
 * derivation of the one fact the pack is the single owner of. It now reads
 * `temporalStanding`. The tooth is about the data path: a source whose
 * structured standing and whose note disagree must be placed by the standing.
 */

import { describe, expect, it } from 'vitest';
import { csrdPack, traceSeries } from '@/lib/pack';

describe('traceSeries', () => {
  it('places in-force instruments with an OJ number as acts, and adopted-not-effective ones as pending', () => {
    const { acts, pending } = traceSeries();
    const pack = csrdPack();
    const inForceWithNumber = pack.sources.filter(
      (s) => s.temporalStanding === 'in_force' && /\b(?:\(EU\)\s*)?(?:19|20)\d{2}\/\d+/.test(s.title),
    );
    expect(acts.map((a) => a.id).sort()).toEqual(inForceWithNumber.map((s) => s.id).sort());
    expect(pending.map((p) => p.id).sort()).toEqual(['SRC-007', 'SRC-008']);
    // Not vacuous: both series are populated by the real pack.
    expect(acts.length).toBeGreaterThan(0);
  });

  it('is driven by temporalStanding, not by the free-text note', () => {
    // A note that says "in force" beside an adopted standing must still read
    // as pending; the note carries no machine meaning.
    for (const s of csrdPack().sources) {
      if (s.id === 'SRC-007') expect(s.statusNote).toMatch(/adopted/i);
    }
    const { pending } = traceSeries();
    expect(pending.find((p) => p.id === 'SRC-007')).toBeDefined();
    // And nothing in the projection was read off a note: every pending mark
    // corresponds to an `adopted_not_effective` standing, every act to
    // `in_force`.
    const byId = new Map(csrdPack().sources.map((s) => [s.id, s.temporalStanding]));
    for (const p of pending) expect(byId.get(p.id)).toBe('adopted_not_effective');
    for (const a of traceSeries().acts) expect(byId.get(a.id)).toBe('in_force');
  });
});
