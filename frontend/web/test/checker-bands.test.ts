/**
 * The checker's answer bands, held to §4.3's tables and to the pack's own
 * thresholds.
 *
 * **Why this file exists.** A band is honest only if the engine, comparing its
 * stored range with every threshold the pack holds for that figure, reaches
 * exactly the result §4.3 states for it: "No", "Cannot tell" or "Yes". A band
 * stored one cent too high, or a threshold moved onto a headcount boundary,
 * would change a route while nothing failed. So the thresholds are found by
 * walking the loaded pack rather than read from a list, the comparison is the
 * engine's own `cmpRange` (failure mode 1), and each of the guard's four
 * problems is provoked alone, directly, on a synthetic band set or a cloned
 * pack (failure mode 4).
 *
 * **Why §4.3 is written out below.** The tables are copied from the proposal
 * (`specs/2026-10-23-questionnaire-research-and-question-refinement.md`, §4.3)
 * into this file, never read back from `lib/check-answers.ts`. A band and its
 * expectation derived from one source would drift together, and the guard
 * would agree with the drift.
 */

import { describe, expect, it } from 'vitest';
import { cmpRange } from '@datastrata/engine';
import type { Condition, FactValue, KnowledgePack, Truth } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';
import {
  bandGuardProblems,
  buildCheckProfile,
  CHECK_BAND_SETS,
  checkerAnswersSchema,
  EMPLOYEE_BANDS,
  EU_TURNOVER_ANSWERS,
  EU_TURNOVER_YEAR_BANDS,
  findBandedThresholds,
  TURNOVER_BANDS,
  type Band,
  type BandSet,
  type CheckerAnswers,
} from '@/lib/check-answers';

/** §4.3: "the largest exact integer the engine's number type holds", for "no upper bound stated". */
const MAX = 9007199254740991;

type Said = 'No' | 'Cannot tell' | 'Yes';
const SAID: Record<Said, 'no' | 'cannot_tell' | 'yes'> = { No: 'no', 'Cannot tell': 'cannot_tell', Yes: 'yes' };

interface Row {
  id: string;
  shown: string;
  lower: number;
  lowerInclusive: boolean;
  upper: number | null;
  stored: [number, number];
  said: Record<number, Said>;
}

/** §4.3, "Average employees": Shown · Meaning · Stored · Exceeds 500 · Exceeds 1,000. */
const EMPLOYEES_4_3: Row[] = [
  { id: '450_or_fewer', shown: '450 or fewer', lower: 0, lowerInclusive: true, upper: 450, stored: [0, 450], said: { 500: 'No', 1000: 'No' } },
  { id: 'over_450_up_to_550', shown: 'More than 450, up to 550 (about 500)', lower: 450, lowerInclusive: false, upper: 550, stored: [450, 550], said: { 500: 'Cannot tell', 1000: 'No' } },
  { id: 'over_550_up_to_900', shown: 'More than 550, up to 900', lower: 550, lowerInclusive: false, upper: 900, stored: [550, 900], said: { 500: 'Yes', 1000: 'No' } },
  { id: 'over_900_up_to_1100', shown: 'More than 900, up to 1,100 (about 1,000)', lower: 900, lowerInclusive: false, upper: 1100, stored: [900, 1100], said: { 500: 'Yes', 1000: 'Cannot tell' } },
  { id: 'over_1100', shown: 'More than 1,100', lower: 1100, lowerInclusive: false, upper: null, stored: [1100, MAX], said: { 500: 'Yes', 1000: 'Yes' } },
];

/** §4.3, "Net turnover, EUR": Shown · Meaning · Stored · Exceeds €450m. */
const TURNOVER_4_3: Row[] = [
  { id: 'up_to_400m', shown: 'Up to €400 million', lower: 0, lowerInclusive: true, upper: 400_000_000, stored: [0, 400_000_000], said: { 450_000_000: 'No' } },
  { id: 'over_400m_up_to_500m', shown: 'More than €400m, up to €500m (about €450m)', lower: 400_000_000, lowerInclusive: false, upper: 500_000_000, stored: [400_000_000.01, 500_000_000], said: { 450_000_000: 'Cannot tell' } },
  { id: 'over_500m', shown: 'More than €500 million', lower: 500_000_000, lowerInclusive: false, upper: null, stored: [500_000_000.01, MAX], said: { 450_000_000: 'Yes' } },
];

/**
 * §4.3, "EU turnover for Art 40a": the two per-year values the third table
 * uses, "over" (`{range, 450000000.01, 9007199254740991}`) and "under"
 * (`{range, 0, 450000000}`), read against "more than €450m".
 */
const EU_YEAR_4_3: Row[] = [
  { id: 'up_to_450m', shown: 'Up to €450 million', lower: 0, lowerInclusive: true, upper: 450_000_000, stored: [0, 450_000_000], said: { 450_000_000: 'No' } },
  { id: 'over_450m', shown: 'More than €450 million', lower: 450_000_000, lowerInclusive: false, upper: null, stored: [450_000_000.01, MAX], said: { 450_000_000: 'Yes' } },
];

const OVER: FactValue = { kind: 'range', min: 450_000_000.01, max: MAX };
const UNDER: FactValue = { kind: 'range', min: 0, max: 450_000_000 };
const UNKNOWN: FactValue = { kind: 'unknown' };

/** §4.3, "EU turnover for Art 40a": Answer · Year 1 (most recent) · Year 2 (the year before) · Gate. */
const EU_TURNOVER_4_3: { id: string; answer: string; year1: FactValue; year2: FactValue; gate: 'Met' | 'Not met' | 'Missing' }[] = [
  { id: 'both', answer: 'Yes, both years', year1: OVER, year2: OVER, gate: 'Met' },
  { id: 'recent_only', answer: 'Only the most recent year', year1: OVER, year2: UNDER, gate: 'Not met' },
  { id: 'earlier_only', answer: 'Only the year before', year1: UNDER, year2: OVER, gate: 'Not met' },
  { id: 'no', answer: 'No', year1: UNDER, year2: UNDER, gate: 'Not met' },
  { id: 'not_sure', answer: 'Not sure', year1: UNKNOWN, year2: UNKNOWN, gate: 'Missing' },
];
const GATE: Record<'Met' | 'Not met' | 'Missing', 'met' | 'not_met' | 'missing'> = { Met: 'met', 'Not met': 'not_met', Missing: 'missing' };

const toBand = (row: Row): Band => ({
  id: row.id,
  label: row.shown,
  meaning: { lower: row.lower, lowerInclusive: row.lowerInclusive, upper: row.upper },
  stored: { min: row.stored[0], max: row.stored[1] },
  exceeds: Object.fromEntries(Object.entries(row.said).map(([threshold, said]) => [Number(threshold), SAID[said]])),
});

const EMPLOYEE_FACTS = ['entity.avg_employees', 'group.avg_employees'];
const TURNOVER_FACTS = ['entity.net_turnover_eur', 'group.consolidated_net_turnover_eur'];
const EU_YEAR_FACTS = ['third_country.eu_turnover_year_1_eur', 'third_country.eu_turnover_year_2_eur'];

/** §4.3's three tables as band sets, built in this file: the guard's tests never depend on the module's band data. */
const ORACLE_EMPLOYEES: BandSet = { name: 'employees', measure: 'headcount', factTypes: EMPLOYEE_FACTS, bands: EMPLOYEES_4_3.map(toBand) };
const ORACLE_TURNOVER: BandSet = { name: 'turnover', measure: 'money', factTypes: TURNOVER_FACTS, bands: TURNOVER_4_3.map(toBand) };
const ORACLE_EU_YEAR: BandSet = { name: 'eu_turnover', measure: 'money', factTypes: EU_YEAR_FACTS, bands: EU_YEAR_4_3.map(toBand) };
const ORACLE_SETS: BandSet[] = [ORACLE_EMPLOYEES, ORACLE_TURNOVER, ORACLE_EU_YEAR];

/** One band of a set, replaced. */
const replaceBand = (set: BandSet, id: string, patch: Partial<Band>): BandSet => ({
  ...set,
  bands: set.bands.map((band) => (band.id === id ? { ...band, ...patch } : band)),
});

/** A deep copy of the loaded pack: the guard is pure over a pack object, so no file is ever touched. */
const clonePack = (): KnowledgePack => structuredClone(csrdPack());

/** This file's own search for one comparison node, independent of the module's walk. */
function comparisonNode(pack: KnowledgePack, requirementId: string, fact: string, value: number): Record<string, unknown> {
  const requirement = pack.requirements.find((r) => r.id === requirementId);
  const hits: Record<string, unknown>[] = [];
  const search = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(search);
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record.fact === fact && record.value === value) hits.push(record);
    Object.values(record).forEach(search);
  };
  search(requirement?.condition);
  if (hits.length !== 1) throw new Error(`expected one ${fact} node at ${value} in ${requirementId}, found ${hits.length}`);
  return hits[0]!;
}

const accepted = (raw: unknown): CheckerAnswers => checkerAnswersSchema.parse(raw);

describe('the band guard, over the real pack', () => {
  it('the real pack and the real bands give no problems', () => {
    expect(bandGuardProblems(csrdPack(), CHECK_BAND_SETS)).toEqual([]);
  });

  it('§4.3 as the proposal wrote it passes the guard against the real pack', () => {
    // The design itself is consistent with the pack's thresholds: the tables
    // below are this file's, not the module's.
    expect(bandGuardProblems(csrdPack(), ORACLE_SETS)).toEqual([]);
  });
});

describe('the walk finds the thresholds (positive controls, failure mode 7)', () => {
  it("finds at least one threshold for every banded fact type it is given, and CSRD-S-001's 1,000-employee threshold", () => {
    const pack = csrdPack();
    for (const factType of [...EMPLOYEE_FACTS, ...TURNOVER_FACTS, ...EU_YEAR_FACTS]) {
      expect([factType, findBandedThresholds(pack, [factType]).length > 0]).toEqual([factType, true]);
    }
    expect(findBandedThresholds(pack, EMPLOYEE_FACTS)).toContainEqual({
      requirementId: 'CSRD-S-001',
      factType: 'entity.avg_employees',
      op: 'gt',
      value: 1000,
    });
    // And it reads a threshold under `not` (CSRD-S-004 holds its figures inside `not`).
    expect(findBandedThresholds(pack, ['entity.net_turnover_eur'])).toContainEqual({
      requirementId: 'CSRD-S-004',
      factType: 'entity.net_turnover_eur',
      op: 'gt',
      value: 450_000_000,
    });
  });

  it('walks structurally: a threshold under an operator it has never seen, or in a selection case, is still found', () => {
    const pack = clonePack();
    const s017 = pack.requirements.find((r) => r.id === 'CSRD-S-017')!;
    // A nesting operator the engine does not have yet, with the comparison two levels down.
    s017.condition = {
      op: 'some_future_nesting',
      branches: { first: [{ op: 'cmp', fact: 'entity.avg_employees', cmp: 'gt', value: 777 }] },
    } as unknown as Condition;
    const s012 = pack.requirements.find((r) => r.id === 'CSRD-S-012')!;
    s012.cases = [...(s012.cases ?? []), { when: { op: 'cmp', fact: 'group.avg_employees', cmp: 'gt', value: 666 }, value: 'ESRS_2023' }];

    const found = findBandedThresholds(pack, EMPLOYEE_FACTS);
    expect(found).toContainEqual({ requirementId: 'CSRD-S-017', factType: 'entity.avg_employees', op: 'gt', value: 777 });
    expect(found).toContainEqual({ requirementId: 'CSRD-S-012', factType: 'group.avg_employees', op: 'gt', value: 666 });
  });
});

describe('each problem, provoked alone (failure mode 4)', () => {
  it('a comparison mismatch names the band, the threshold, the requirements, and what was expected and found', () => {
    const wrong = replaceBand(ORACLE_TURNOVER, 'over_400m_up_to_500m', { exceeds: { 450_000_000: 'yes' } });
    expect(bandGuardProblems(csrdPack(), [wrong])).toEqual([
      "band 'over_400m_up_to_500m' at 450000000 (CSRD-S-001, CSRD-S-002, CSRD-S-004, CSRD-S-022): expected exceeds, got cannot tell",
    ]);
  });

  it('an operator the table states nothing for is a problem', () => {
    const pack = clonePack();
    comparisonNode(pack, 'CSRD-S-017', 'entity.avg_employees', 500).cmp = 'gte';
    expect(bandGuardProblems(pack, [ORACLE_EMPLOYEES])).toEqual([
      "band set 'employees' at 500 (CSRD-S-017): expected the operator gt or lte, found gte",
    ]);
  });

  it('lte is read as the negation of exceeding', () => {
    const pack = clonePack();
    comparisonNode(pack, 'CSRD-S-001', 'entity.avg_employees', 1000).cmp = 'lte';
    // Read as its negation, every stated result still holds: no problem.
    expect(bandGuardProblems(pack, [ORACLE_EMPLOYEES])).toEqual([]);
    // The positive control: the same reading catches a wrong stated result, at lte and at gt alike.
    const wrong = replaceBand(ORACLE_EMPLOYEES, 'over_900_up_to_1100', { exceeds: { 500: 'yes', 1000: 'yes' } });
    expect(bandGuardProblems(pack, [wrong])).toEqual([
      "band 'over_900_up_to_1100' at 1000 (CSRD-S-002, CSRD-S-004, CSRD-S-022): expected exceeds, got cannot tell",
      "band 'over_900_up_to_1100' at 1000 (CSRD-S-001; lte, read as not exceeding): expected exceeds, got cannot tell",
    ]);
  });

  it('a threshold with no stated result is a problem, so a new threshold is reviewed rather than passed', () => {
    const missing = replaceBand(ORACLE_EMPLOYEES, 'over_900_up_to_1100', { exceeds: { 500: 'yes' } });
    expect(bandGuardProblems(csrdPack(), [missing])).toEqual([
      "band 'over_900_up_to_1100' at 1000 (CSRD-S-001, CSRD-S-002, CSRD-S-004, CSRD-S-022): expected a stated result, found none",
    ]);
  });

  it('a stored range that does not hold every reportable value of the band, or holds more than one cent below it, is a problem', () => {
    const pack = csrdPack();
    // Headcount is continuous: the closed range must reach the band's lower end.
    expect(bandGuardProblems(pack, [replaceBand(ORACLE_EMPLOYEES, 'over_450_up_to_550', { stored: { min: 451, max: 550 } })])).toEqual([
      "band 'over_450_up_to_550': expected stored min ≤ 450, found 451",
    ]);
    expect(bandGuardProblems(pack, [replaceBand(ORACLE_EMPLOYEES, 'over_900_up_to_1100', { stored: { min: 900, max: 1099 } })])).toEqual([
      "band 'over_900_up_to_1100': expected stored max ≥ 1100, found 1099",
    ]);
    // No upper bound is stated as exactly 9007199254740991.
    expect(bandGuardProblems(pack, [replaceBand(ORACLE_EMPLOYEES, 'over_1100', { stored: { min: 1100, max: 1_000_000 } })])).toEqual([
      "band 'over_1100': expected stored max = 9007199254740991 (no upper bound), found 1000000",
    ]);
    // Money after the first band starts exactly one cent above the band's lower end: neither tighter nor looser.
    expect(bandGuardProblems(pack, [replaceBand(ORACLE_TURNOVER, 'over_400m_up_to_500m', { stored: { min: 400_000_000.02, max: 500_000_000 } })])).toEqual([
      "band 'over_400m_up_to_500m': expected stored min = 400000000.01 (one cent above 400000000), found 400000000.02",
    ]);
    expect(bandGuardProblems(pack, [replaceBand(ORACLE_TURNOVER, 'over_400m_up_to_500m', { stored: { min: 400_000_000, max: 500_000_000 } })])).toEqual([
      "band 'over_400m_up_to_500m': expected stored min = 400000000.01 (one cent above 400000000), found 400000000",
    ]);
    // The first money band holds its inclusive lower end.
    expect(bandGuardProblems(pack, [replaceBand(ORACLE_TURNOVER, 'up_to_400m', { stored: { min: 0.01, max: 400_000_000 } })])).toEqual([
      "band 'up_to_400m': expected stored min ≤ 0, found 0.01",
    ]);
  });

  it('a headcount threshold equal to a headcount band boundary is a problem', () => {
    // Bands cut at 500, with every stated result true of its stored range, so
    // nothing but the boundary is wrong: the closed range [500, 900] cannot
    // say "exceeds 500", which is why §4.3 keeps 500 and 1,000 off the edges.
    const onTheEdge: BandSet = {
      name: 'employees',
      measure: 'headcount',
      factTypes: EMPLOYEE_FACTS,
      bands: [
        { id: 'b1', label: 'b1', meaning: { lower: 0, lowerInclusive: true, upper: 450 }, stored: { min: 0, max: 450 }, exceeds: { 500: 'no', 1000: 'no' } },
        { id: 'b2', label: 'b2', meaning: { lower: 450, lowerInclusive: false, upper: 500 }, stored: { min: 450, max: 500 }, exceeds: { 500: 'no', 1000: 'no' } },
        { id: 'b3', label: 'b3', meaning: { lower: 500, lowerInclusive: false, upper: 900 }, stored: { min: 500, max: 900 }, exceeds: { 500: 'cannot_tell', 1000: 'no' } },
        { id: 'b4', label: 'b4', meaning: { lower: 900, lowerInclusive: false, upper: 1100 }, stored: { min: 900, max: 1100 }, exceeds: { 500: 'yes', 1000: 'cannot_tell' } },
        { id: 'b5', label: 'b5', meaning: { lower: 1100, lowerInclusive: false, upper: null }, stored: { min: 1100, max: MAX }, exceeds: { 500: 'yes', 1000: 'yes' } },
      ],
    };
    expect(bandGuardProblems(csrdPack(), [onTheEdge])).toEqual([
      "headcount threshold 500 (CSRD-S-017, CSRD-S-018): expected no band boundary at 500, found the upper end of band 'b2' and the lower end of band 'b3'",
    ]);
  });
});

describe('§4.3 pinned: the module states exactly the proposal’s tables', () => {
  it('average employees', () => {
    expect(EMPLOYEE_BANDS).toEqual(EMPLOYEES_4_3.map(toBand));
  });

  it('net turnover', () => {
    expect(TURNOVER_BANDS).toEqual(TURNOVER_4_3.map(toBand));
  });

  it('EU turnover for Article 40a: the per-year values and every answer with its two years and its gate', () => {
    expect(EU_TURNOVER_YEAR_BANDS).toEqual(EU_YEAR_4_3.map(toBand));
    expect(EU_TURNOVER_ANSWERS).toEqual(
      EU_TURNOVER_4_3.map((row) => ({ id: row.id, label: row.answer, year1: row.year1, year2: row.year2, gate: GATE[row.gate] })),
    );
  });

  it("each EU-turnover answer's stated gate is what the engine's comparison gives at CSRD-S-007's thresholds", () => {
    expect(EU_TURNOVER_ANSWERS.map((a) => a.id)).toEqual(EU_TURNOVER_4_3.map((row) => row.id));
    const pack = csrdPack();
    const [year1] = findBandedThresholds(pack, ['third_country.eu_turnover_year_1_eur']);
    const [year2] = findBandedThresholds(pack, ['third_country.eu_turnover_year_2_eur']);
    expect([year1, year2]).toEqual([
      { requirementId: 'CSRD-S-007', factType: 'third_country.eu_turnover_year_1_eur', op: 'gt', value: 450_000_000 },
      { requirementId: 'CSRD-S-007', factType: 'third_country.eu_turnover_year_2_eur', op: 'gt', value: 450_000_000 },
    ]);
    const compare = (value: FactValue, threshold: number): Truth =>
      value.kind === 'range' ? cmpRange(value, 'gt', threshold) : 'INDETERMINATE';
    for (const answer of EU_TURNOVER_ANSWERS) {
      const results = [compare(answer.year1, year1!.value), compare(answer.year2, year2!.value)];
      const gate = results.includes('DOES_NOT_APPLY') ? 'not_met' : results.every((r) => r === 'APPLIES') ? 'met' : 'missing';
      expect([answer.id, gate]).toEqual([answer.id, answer.gate]);
    }
  });

  it('the band sets are these tables, each for the fact types it declares', () => {
    expect(CHECK_BAND_SETS.map((set) => ({ name: set.name, measure: set.measure, factTypes: [...set.factTypes] }))).toEqual([
      { name: 'employees', measure: 'headcount', factTypes: EMPLOYEE_FACTS },
      { name: 'turnover', measure: 'money', factTypes: TURNOVER_FACTS },
      { name: 'eu_turnover', measure: 'money', factTypes: EU_YEAR_FACTS },
    ]);
    expect(CHECK_BAND_SETS.map((set) => set.bands)).toEqual([EMPLOYEE_BANDS, TURNOVER_BANDS, EU_TURNOVER_YEAR_BANDS]);
  });
});

describe('the declared fact types are the ones the answers write', () => {
  it('the band sets declare exactly the fact types C-4, C-5, C-9, C-10 and C-8 write, cross-checked by running buildCheckProfile', () => {
    const groups: CheckerAnswers['group'][] = ['none', 'parent', 'owned', 'both', 'not_sure', undefined];
    const scenarios: [Record<string, unknown>, keyof CheckerAnswers][] = [];
    for (const group of groups) {
      scenarios.push([{ group, employees: 'over_1100' }, 'employees']);
      scenarios.push([{ group, turnover: 'over_500m' }, 'turnover']);
      scenarios.push([{ group, employees: { exact: 1200.5 } }, 'employees']);
      scenarios.push([{ group, turnover: { exact: 600_000_000.5 } }, 'turnover']);
      scenarios.push([{ country: 'US', group, euTurnover: 'both' }, 'euTurnover']);
      scenarios.push([{ country: 'US', group, euTurnover: 'recent_only' }, 'euTurnover']);
      if (group === 'parent' || group === 'both') {
        scenarios.push([{ group, parentOwnEmployees: 'over_1100' }, 'parentOwnEmployees']);
        scenarios.push([{ group, parentOwnTurnover: 'over_500m' }, 'parentOwnTurnover']);
      }
    }

    const key = (f: { factType: string; scopeId: string }) => `${f.factType}::${f.scopeId}`;
    const figures = new Set<string>();
    const others = new Set<string>();
    for (const [raw, field] of scenarios) {
      const answers = accepted(raw);
      const without: CheckerAnswers = { ...answers };
      delete without[field];
      const before = new Set(buildCheckProfile(without).facts.map(key));
      for (const f of buildCheckProfile(answers).facts) {
        if (before.has(key(f))) continue;
        (f.value.kind === 'range' || f.value.kind === 'number' ? figures : others).add(f.factType);
      }
    }

    // Positive control: the figures §4.1's "Facts set" column names for these questions.
    expect([...figures].sort()).toEqual([...EMPLOYEE_FACTS, ...TURNOVER_FACTS, ...EU_YEAR_FACTS].sort());
    expect([...new Set(CHECK_BAND_SETS.flatMap((set) => set.factTypes))].sort()).toEqual([...figures].sort());
    // C-8's one fact that is not a figure (R9), so the filter above hides nothing else.
    expect([...others]).toEqual(['group.ultimate_parent_country']);
  });
});
