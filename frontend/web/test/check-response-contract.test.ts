/**
 * The timeline payload's contract: exactly the fields `SENT_FIELDS` declares,
 * a truthful draft flag, a caller's date, and a refusal rather than an
 * invented label (CHK-2; KNW-10; law 3; plan Task 4).
 *
 * **Why this file exists.** CHK-2's acceptance is that everything the check
 * computes is shown or deliberately not sent. Task 6 renders every path in
 * `SENT_FIELDS`; that is only meaningful if the payload carries exactly those
 * paths and no others. So the payload's actual key paths are walked over a
 * fixture set that between them populate every row, every state and every
 * optional field, and compared with the declared list in both directions,
 * beside the fields CHK-2 says are not sent (teeth T4e).
 *
 * The draft flag is the status-truth boundary's at the timeline: a signed,
 * fresh repository clears it, a drifted signature and the repository as it
 * stands keep it. The signed repository is `fixture-repository.ts`'s, the
 * shared signed-and-fresh fixture whose signatures the sign CLI's own
 * producers compute.
 */

import { describe, expect, it } from 'vitest';
import { IntegrityFailureError } from '@datastrata/engine';
import type { Condition, KnowledgePack } from '@datastrata/engine';
import { csrdPack, loadVerifiedCsrdPack } from '@/lib/pack';
import { checkerAnswersSchema, type CheckerAnswers } from '@/lib/check-answers';
import { CHECK_ROWS } from '@/lib/check-routes';
import {
  buildCheckTimeline,
  CELL_STATES,
  CHECK_START_YEARS,
  SENT_FIELDS,
  TimelineRefusalError,
  type CheckTimeline,
} from '@/lib/check-timeline';
import { buildFixtureRepository } from './fixture-repository';

const DATE = '2026-10-23';
const accepted = (raw: Record<string, unknown>): CheckerAnswers => checkerAnswersSchema.parse(raw);

/** Between them: every row, every cell state, a reason, needs, and each kind of country answer. */
const FIXTURES: CheckerAnswers[] = [
  { country: 'DE', group: 'both', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'not_sure', parentReport: 'yes', parentOwnEmployees: 'over_900_up_to_1100', parentOwnTurnover: 'over_500m' },
  { country: 'DE', group: 'both', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'yes', parentReport: 'yes' },
  { country: 'DE', group: 'owned', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'no', parentReport: 'no' },
  { country: 'US', group: 'none', euTurnover: 'both' },
  { country: 'other', countryOther: 'AR', group: 'none', euTurnover: 'both' },
  { country: 'not_sure', group: 'both' },
  { group: 'none' },
].map((a) => accepted(a));

/** Every JSON path in a value, arrays written `[]`, as SENT_FIELDS declares them. */
function paths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    const here = `${prefix}[]`;
    const inner = value.flatMap((v) => paths(v, here));
    return inner.length === 0 ? [here] : inner;
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) => paths(v, prefix === '' ? key : `${prefix}.${key}`));
  }
  return [prefix];
}

describe('SENT_FIELDS is exactly what the payload carries (CHK-2)', () => {
  const pack = csrdPack();
  const timelines = FIXTURES.map((a) => buildCheckTimeline(pack, a, DATE));

  it('the fixtures populate every row, every cell state, a reason and needs (positive control)', () => {
    const rows = new Set(timelines.flatMap((t) => t.routes.map((r) => r.id)));
    const states = new Set(timelines.flatMap((t) => t.routes.flatMap((r) => r.lines.flatMap((l) => l.cells.map((c) => c.state)))));
    expect([...rows].sort()).toEqual(CHECK_ROWS.map((r) => r.id).sort());
    expect([...states].sort()).toEqual([...CELL_STATES].sort());
  });

  it('every path the payload carries is declared, and every declared path is carried', () => {
    const carried = new Set(timelines.flatMap((t) => paths(t)));
    const declared = new Set<string>(SENT_FIELDS);
    expect({ undeclared: [...carried].filter((p) => !declared.has(p)).sort(), neverCarried: [...declared].filter((p) => !carried.has(p)).sort() }).toEqual({
      undeclared: [],
      neverCarried: [],
    });
  });

  it('nothing CHK-2 keeps back is sent: obligations, gaps, evidence expectations, next questions, cautions, the determination list, labels', () => {
    // Positive control (failure mode 7): the walk sees the payload's deepest keys.
    expect(timelines.flatMap((t) => paths(t))).toContain('routes[].lines[].cells[].needs[].factType');
    for (const t of timelines) {
      const keys = paths(t).flatMap((p) => p.replace(/\[\]/g, '').split('.'));
      for (const kept of ['obligations', 'gaps', 'evidenceExpectation', 'nextQuestions', 'caution', 'cautions', 'determinations', 'label', 'labels', 'draftLabel']) {
        expect([kept, keys.includes(kept)]).toEqual([kept, false]);
      }
      // A determination's own fields stay with the engine too.
      expect(keys.includes('trace')).toBe(false);
      expect(keys.includes('scopeId')).toBe(false);
    }
  });

  it('every line has four cells, one per start year, in order', () => {
    for (const t of timelines) {
      expect(t.startYears).toEqual([...CHECK_START_YEARS]);
      for (const route of t.routes) for (const line of route.lines) expect(line.cells.map((c) => c.startYear)).toEqual([...CHECK_START_YEARS]);
    }
  });
});

describe('the draft flag (KNW-10; the status-truth boundary at the timeline)', () => {
  const answers = FIXTURES[0]!;

  it('a signed, fresh repository gives content.draft false', () => {
    const fixture = buildFixtureRepository();
    const pack = loadVerifiedCsrdPack(fixture.engineRoot);
    expect(pack.requirements.every((r) => r.derivedStatus === 'ratified')).toBe(true);
    const timeline = buildCheckTimeline(pack, answers, DATE);
    expect(timeline.content).toEqual({ draft: false, threshold: 'draft_labelled' });
  });

  it('a drifted signature gives content.draft true', () => {
    const fixture = buildFixtureRepository({ driftResult: true });
    expect(buildCheckTimeline(loadVerifiedCsrdPack(fixture.engineRoot), answers, DATE).content.draft).toBe(true);
  });

  it('the repository as it stands gives content.draft true', () => {
    expect(buildCheckTimeline(csrdPack(), answers, DATE).content).toEqual({ draft: true, threshold: 'draft_labelled' });
  });

  it('the cells do not move with the flag: the boundary changes what may be called verified, not what is assessed', () => {
    const signed = buildCheckTimeline(loadVerifiedCsrdPack(buildFixtureRepository().engineRoot), answers, DATE);
    const draft = buildCheckTimeline(csrdPack(), answers, DATE);
    expect(signed.routes).toEqual(draft.routes);
  });
});

describe('the date is the caller’s, and each column is its own start year', () => {
  it('assessedAt echoes the date supplied, and nothing else moves with it', () => {
    const pack = csrdPack();
    const a = buildCheckTimeline(pack, FIXTURES[0]!, '2026-10-23');
    const b = buildCheckTimeline(pack, FIXTURES[0]!, '2031-01-15');
    expect([a.assessedAt, b.assessedAt]).toEqual(['2026-10-23', '2031-01-15']);
    expect({ ...b, assessedAt: a.assessedAt }).toEqual(a);
    expect(a.assessedAt).not.toBe(new Date().toISOString().slice(0, 10));
  });

  it('a rule true in one start year alone reads applies in that column alone', () => {
    const pack: KnowledgePack = structuredClone(csrdPack());
    const s017 = pack.requirements.find((r) => r.id === 'CSRD-S-017')!;
    s017.condition = { op: 'fy_start_year_in', years: [2026] } as Condition;
    const timeline = buildCheckTimeline(pack, accepted({ country: 'DE', group: 'none', organisation: 'private_limited', employees: '450_or_fewer', turnover: 'up_to_400m' }), DATE);
    const line = timeline.routes.find((r) => r.id === 'individual')!.lines.find((l) => l.requirement === 'CSRD-S-017')!;
    expect(line.cells.map((c) => `${c.startYear} ${c.state}`)).toEqual(['2025 does_not_apply', '2026 applies', '2027 does_not_apply', '2028 does_not_apply']);
  });
});

describe('a state a line kind cannot show is refused, never invented (law 3)', () => {
  const de = accepted({ country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'yes' });

  it('the national line reading APPLIES refuses with a typed error naming the requirement and the year (Task 6 maps it to 503)', () => {
    const pack: KnowledgePack = structuredClone(csrdPack());
    pack.requirements.find((r) => r.id === 'CSRD-S-013')!.condition = { op: 'in_catalogue', fact: 'entity.incorporation_country', catalogue: 'eu_member_states' } as Condition;
    let thrown: unknown;
    try {
      buildCheckTimeline(pack, de, DATE);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TimelineRefusalError);
    expect((thrown as TimelineRefusalError).requirement).toBe('CSRD-S-013');
    expect((thrown as Error).message).toContain('CSRD-S-013');
    expect((thrown as Error).message).toContain('2025');
    // Positive control: the real pack never reaches it for the same answers.
    expect(buildCheckTimeline(csrdPack(), de, DATE).routes.find((r) => r.id === 'national')!.lines[0]!.cells.every((c) => c.state === 'requires_review')).toBe(true);
  });

  it('the issuer line reading a definitive result refuses too: a coverage gap never reads does_not_apply (KNW-14)', () => {
    const pack: KnowledgePack = structuredClone(csrdPack());
    pack.catalogues.encoded_issuer_routes!.entries.US = false;
    expect(() => buildCheckTimeline(pack, accepted({ country: 'US', group: 'none', euTurnover: 'no' }), DATE)).toThrow(TimelineRefusalError);
  });

  it('an integrity failure from the pack propagates unchanged: the timeline never catches it', () => {
    const failure = new IntegrityFailureError([{ code: 'invalid_result', detail: 'fixture: a damaged record' }]);
    const damaged = new Proxy(structuredClone(csrdPack()), {
      get(target, key, receiver) {
        if (key === 'requirements') throw failure;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    let thrown: unknown;
    try {
      buildCheckTimeline(damaged, de, DATE);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
  });
});

describe('the payload’s shape, typed', () => {
  it('the fixed fields are the literal values the contract names', () => {
    const t: CheckTimeline = buildCheckTimeline(csrdPack(), FIXTURES[0]!, DATE);
    expect({ basis: t.basis, hypothetical: t.hypothetical, preliminary: t.preliminary, pack: Object.keys(t.pack) }).toEqual({
      basis: 'start_year',
      hypothetical: true,
      preliminary: true,
      pack: ['id', 'version', 'legalSnapshot'],
    });
  });
});
