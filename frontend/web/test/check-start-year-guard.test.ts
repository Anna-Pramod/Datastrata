/**
 * The start-year guard: why the checker may run each start year from
 * 1 January and call the result exact for any start month (proposal §4.2).
 *
 * **Why this file exists.** The timeline runs the engine once per start year,
 * with the period starting on 1 January. That is exact only while every period
 * test in the pack reads the start year alone or compares the start with a
 * 1 January date, and no test reads the period's end. A rule dated 1 July, or
 * a new operator that reads the end, would make a visitor whose year starts in
 * April read the wrong column, and nothing would fail. So:
 *
 * - the guard walks every requirement's condition tree in the loaded pack;
 * - the operators it must classify come from the engine's runtime condition
 *   schema, so an operator it does not know fails it (failure mode 1);
 * - each problem is provoked alone, on an in-memory copy of the pack or a
 *   stated operator list, never on a file (failure modes 2 and 4);
 * - and the claim itself is checked behaviourally, independently of the
 *   guard's classification: every start month, and every period end, gives the
 *   1 January result over a covering set of answers, with a positive control
 *   showing the comparison sees a difference when one exists.
 */

import { describe, expect, it } from 'vitest';
import { assess } from '@datastrata/engine';
import type { Condition, KnowledgePack } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';
import { buildCheckProfile, CHECK_ENTITY_ID, checkerAnswersSchema, type CheckerAnswers } from '@/lib/check-answers';
import { conditionOperators, startYearGuardProblems, CHECK_START_YEARS } from '@/lib/check-timeline';
import { conditionSchema } from '../../../backend/engine/src/knowledge/schema';

const clonePack = (): KnowledgePack => structuredClone(csrdPack());

/** This file's own search for a node, independent of the guard's walk. */
function nodes(pack: KnowledgePack, requirementId: string, op: string): Record<string, unknown>[] {
  const requirement = pack.requirements.find((r) => r.id === requirementId);
  const hits: Record<string, unknown>[] = [];
  const search = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(search);
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.op === op) hits.push(record);
    Object.values(record).forEach(search);
  };
  search(requirement?.condition);
  for (const selection of requirement?.cases ?? []) search(selection.when);
  return hits;
}

describe('the start-year guard, over the real pack', () => {
  it('finds no problem', () => {
    expect(startYearGuardProblems(csrdPack())).toEqual([]);
  });

  it('classifies exactly the operators the engine’s runtime condition schema holds, read from the schema itself', () => {
    // Read here from zod's own structure, so a list typed into the guard cannot stand in for it.
    const union = (conditionSchema as unknown as { schema: { options: { shape: { op: { value: string } } }[] } }).schema;
    const fromSchema = union.options.map((o) => o.shape.op.value).sort();
    expect(fromSchema.length).toBeGreaterThan(10);
    expect([...conditionOperators()].sort()).toEqual(fromSchema);
  });

  it('the walk reaches the period tests §4.2 names (positive control, failure mode 7)', () => {
    const pack = csrdPack();
    expect(nodes(pack, 'CSRD-S-017', 'fy_start_year_in').length).toBeGreaterThan(0);
    expect(nodes(pack, 'CSRD-S-017', 'fy_starts_on_or_after').map((n) => n.date)).toEqual(['2027-01-01']);
    expect(nodes(pack, 'CSRD-S-007', 'fy_starts_on_or_after').map((n) => n.date)).toEqual(['2028-01-01']);
    expect(nodes(pack, 'CSRD-S-016', 'year_diff_lt').length).toBe(1);
  });
});

describe('each problem, provoked alone (failure mode 4)', () => {
  it('T4b’s mutation: one fy_starts_on_or_after date moved to 1 July names the requirement and the date', () => {
    const pack = clonePack();
    const [node] = nodes(pack, 'CSRD-S-017', 'fy_starts_on_or_after');
    node!.date = '2027-07-01';
    expect(nodes(pack, 'CSRD-S-017', 'fy_starts_on_or_after').map((n) => n.date)).toEqual(['2027-07-01']);
    expect(startYearGuardProblems(pack)).toEqual([
      'CSRD-S-017: fy_starts_on_or_after compares the period start with 2027-07-01, not with a 1 January date',
    ]);
    // The real pack is untouched by the copy's mutation.
    expect(startYearGuardProblems(csrdPack())).toEqual([]);
  });

  it('a date in a selection case is read too', () => {
    const pack = clonePack();
    const s012 = pack.requirements.find((r) => r.id === 'CSRD-S-012')!;
    s012.cases = [...(s012.cases ?? []), { when: { op: 'fy_starts_on_or_after', date: '2026-04-01' }, value: 'ESRS_2023' }];
    expect(startYearGuardProblems(pack)).toEqual([
      'CSRD-S-012: fy_starts_on_or_after compares the period start with 2026-04-01, not with a 1 January date',
    ]);
  });

  it('an operator in the pack that the guard does not classify is a problem, wherever it is nested', () => {
    const pack = clonePack();
    const s017 = pack.requirements.find((r) => r.id === 'CSRD-S-017')!;
    s017.condition = { op: 'all', of: [{ op: 'fy_ends_before', date: '2027-12-31' } as unknown as Condition, s017.condition!] };
    expect(startYearGuardProblems(pack)).toEqual([
      "CSRD-S-017: operator 'fy_ends_before' is not one the start-year guard classifies",
    ]);
  });

  it('an operator the engine’s schema holds and the guard does not classify is a problem, though no requirement uses it yet', () => {
    expect(startYearGuardProblems(csrdPack(), [...conditionOperators(), 'fy_ends_before'])).toEqual([
      "operator 'fy_ends_before' in the engine's condition schema is not classified by the start-year guard",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The claim, behaviourally: any start month, any period end, the same result
// ---------------------------------------------------------------------------

/** Answers reaching every route the pack's period tests sit on: both waves, the national option, Article 40a, a parent's group. */
const COVERING: CheckerAnswers[] = [
  { country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'yes' },
  { country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_900_up_to_1100', turnover: 'over_400m_up_to_500m', pie: 'not_sure' },
  { country: 'DE', group: 'parent', organisation: 'public_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'yes', parentOwnEmployees: 'over_550_up_to_900', parentOwnTurnover: 'up_to_400m' },
  { country: 'FR', group: 'both', organisation: 'bank', employees: 'over_1100', turnover: 'over_500m', pie: 'no', parentReport: 'yes' },
  { country: 'US', group: 'none', euTurnover: 'both' },
  { country: 'not_sure', group: 'owned' },
].map((a) => checkerAnswersSchema.parse(a));

type Period = { start: string; end: string };

function results(pack: KnowledgePack, answers: CheckerAnswers, period: Period): string[] {
  return assess(pack, buildCheckProfile(answers), { assessmentDate: '2026-10-24', financialYear: period, subjectId: CHECK_ENTITY_ID }).determinations.map(
    (d) => `${d.requirementId}@${d.scopeId}: ${d.result} ${d.reason ?? ''} ${JSON.stringify(d.needs)}`,
  );
}

/** A twelve-month year starting on the first of `month` in `year`. */
function twelveMonths(year: number, month: number): Period {
  const pad = (n: number) => String(n).padStart(2, '0');
  const endMonth = month === 1 ? 12 : month - 1;
  const endYear = month === 1 ? year : year + 1;
  const endDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  return { start: `${year}-${pad(month)}-01`, end: `${endYear}-${pad(endMonth)}-${pad(endDay)}` };
}

describe('§4.2 "exact for any start month", independently of the guard', () => {
  it('every start month gives the 1 January result, for every start year and every covering answer set', () => {
    const pack = csrdPack();
    const differences: string[] = [];
    for (const year of CHECK_START_YEARS) {
      for (const answers of COVERING) {
        const january = results(pack, answers, twelveMonths(year, 1));
        for (const month of [2, 4, 7, 10, 12]) {
          if (JSON.stringify(results(pack, answers, twelveMonths(year, month))) !== JSON.stringify(january)) differences.push(`${year}-${month} ${JSON.stringify(answers)}`);
        }
      }
    }
    expect(differences).toEqual([]);
  });

  it('the period’s end never changes a result: a short, a long and a calendar year read alike', () => {
    const pack = csrdPack();
    const differences: string[] = [];
    for (const year of CHECK_START_YEARS) {
      for (const answers of COVERING) {
        const calendar = results(pack, answers, { start: `${year}-01-01`, end: `${year}-12-31` });
        for (const end of [`${year}-06-30`, `${year + 1}-03-31`, `${year + 2}-12-31`]) {
          if (JSON.stringify(results(pack, answers, { start: `${year}-01-01`, end })) !== JSON.stringify(calendar)) differences.push(`${end} ${JSON.stringify(answers)}`);
        }
      }
    }
    expect(differences).toEqual([]);
  });

  it('positive control: with one date moved to 1 July (T4b’s copy), an August start reads differently from January, so the comparison above can see a difference', () => {
    const pack = clonePack();
    nodes(pack, 'CSRD-S-017', 'fy_starts_on_or_after')[0]!.date = '2027-07-01';
    const answers = COVERING[0]!;
    expect(results(pack, answers, twelveMonths(2027, 8))).not.toEqual(results(pack, answers, twelveMonths(2027, 1)));
  });
});
