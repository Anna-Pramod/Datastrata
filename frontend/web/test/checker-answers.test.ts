/**
 * The free checker's questions and the facts each answer sets, held to the
 * approved design rather than to the module itself.
 *
 * **Why this file exists.** The checker's answers are the only facts the engine
 * sees about a visitor, and the defects that matter here are silent ones:
 *
 * - a group figure written as the company's own, or the reverse, moves a route
 *   with no error at all, because the engine keeps whichever fact it is given
 *   (`facts.ts`: a second fact for one fact type and scope replaces the first);
 * - an unknown dropped instead of stored makes "asked, not sure" read exactly
 *   like "never asked" (§4.4; PRF-6);
 * - a question shown where its answer cannot change a result, or hidden where
 *   it can, breaks law 16 or law 3.
 *
 * So every oracle below is written from the proposal
 * (`specs/2026-10-23-questionnaire-research-and-question-refinement.md`, §4.1,
 * §4.3, §4.4, §4.5) and from the plan's rulings for Task 3, never read back
 * from `lib/check-answers.ts`. Every positive claim sits beside the
 * counterexample that must not appear (failure mode 5), and every "never"
 * beside proof that the scan saw something (failure mode 7).
 */

import { describe, expect, it } from 'vitest';
import { assess } from '@datastrata/engine';
import type { FactValue } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';
import {
  buildCheckProfile,
  CHECK_ENTITY_ID,
  CHECK_ORGANISATION_ID,
  CHECK_QUESTIONS,
  checkerAnswersSchema,
  EU_COUNTRIES,
  NON_EU_COUNTRIES,
  questionWording,
  visibleQuestions,
  type CheckerAnswers,
  type QuestionId,
} from '@/lib/check-answers';
import { countryName, ISO_COUNTRIES } from '@/lib/countries';

// ---------------------------------------------------------------------------
// The oracle: written from the proposal and the plan, not from the module
// ---------------------------------------------------------------------------

/** The source refs the plan names (Task 3, "Not sure"; rulings R4 and R5). */
const ANSWER = 'Free check answer';
const NOT_SURE = 'Free check answer: not sure';
const NOT_A_FUND = 'Free check answer: not an investment fund';

const MAX = 9007199254740991;
const UNKNOWN: FactValue = { kind: 'unknown' };
const range = (min: number, max: number): FactValue => ({ kind: 'range', min, max });
const num = (value: number): FactValue => ({ kind: 'number', value });
const bool = (value: boolean): FactValue => ({ kind: 'boolean', value });
const str = (value: string): FactValue => ({ kind: 'string', value });

/** The 27 Member States, as §4.1 lists them under "EU Member States". */
const EU_CODES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'] as const;
/** The 14 non-EU countries today's checker lists (`lib/checker.ts`, NON_EU_COUNTRIES), which the plan keeps. */
const LISTED_NON_EU = ['GB', 'US', 'CH', 'NO', 'IN', 'CN', 'JP', 'TR', 'BR', 'CA', 'AU', 'ZA', 'KR', 'AE'] as const;

const GROUPS = ['none', 'parent', 'owned', 'both', 'not_sure'] as const;
const ORGANISATIONS = ['private_limited', 'public_limited', 'bank', 'insurer', 'fund', 'something_else', 'not_sure'] as const;
const YES_NO = ['yes', 'no', 'not_sure'] as const;
const EU_TURNOVER = ['both', 'recent_only', 'earlier_only', 'no', 'not_sure'] as const;

type Headcount = NonNullable<CheckerAnswers['employees']>;
type Money = NonNullable<CheckerAnswers['turnover']>;

/** §4.3, "Average employees": every answer and what it stores. */
const HEADCOUNT_ANSWERS: [string, Headcount, FactValue, string][] = [
  ['450 or fewer', '450_or_fewer', range(0, 450), ANSWER],
  ['more than 450, up to 550', 'over_450_up_to_550', range(450, 550), ANSWER],
  ['more than 550, up to 900', 'over_550_up_to_900', range(550, 900), ANSWER],
  ['more than 900, up to 1,100', 'over_900_up_to_1100', range(900, 1100), ANSWER],
  ['more than 1,100', 'over_1100', range(1100, MAX), ANSWER],
  ['a typed 480.25', { exact: 480.25 }, num(480.25), ANSWER],
  ['Not sure', 'not_sure', UNKNOWN, NOT_SURE],
];

/** §4.3, "Net turnover, EUR": every answer and what it stores. */
const MONEY_ANSWERS: [string, Money, FactValue, string][] = [
  ['up to €400 million', 'up_to_400m', range(0, 400_000_000), ANSWER],
  ['more than €400m, up to €500m', 'over_400m_up_to_500m', range(400_000_000.01, 500_000_000), ANSWER],
  ['more than €500 million', 'over_500m', range(500_000_000.01, MAX), ANSWER],
  ['a typed €450,000,000.01', { exact: 450_000_000.01 }, num(450_000_000.01), ANSWER],
  ['Not sure', 'not_sure', UNKNOWN, NOT_SURE],
];

/** §4.3, "EU turnover for Art 40a": "over" and "under". */
const OVER_450M = range(450_000_000.01, MAX);
const UNDER_450M = range(0, 450_000_000);

/** CD-5 scoping (§4.1; plan Task 3; ruling R7): where C-4 and C-5 land for each C-2 answer. */
const SCOPINGS: { group: CheckerAnswers['group']; employees: string; turnover: string }[] = [
  { group: 'none', employees: 'entity.avg_employees @ legal_entity', turnover: 'entity.net_turnover_eur @ legal_entity' },
  { group: 'owned', employees: 'entity.avg_employees @ legal_entity', turnover: 'entity.net_turnover_eur @ legal_entity' },
  { group: 'not_sure', employees: 'entity.avg_employees @ legal_entity', turnover: 'entity.net_turnover_eur @ legal_entity' },
  { group: undefined, employees: 'entity.avg_employees @ legal_entity', turnover: 'entity.net_turnover_eur @ legal_entity' },
  { group: 'parent', employees: 'group.avg_employees @ organization', turnover: 'group.consolidated_net_turnover_eur @ organization' },
  { group: 'both', employees: 'group.avg_employees @ organization', turnover: 'group.consolidated_net_turnover_eur @ organization' },
];

/** §4.1's "Facts set" column, every fact type in it. */
const FACT_TYPES_4_1 = [
  'entity.incorporation_country',
  'entity.is_parent_undertaking',
  'entity.is_subsidiary',
  'entity.legal_form',
  'entity.excluded_by_article_1_4',
  'entity.avg_employees',
  'group.avg_employees',
  'entity.net_turnover_eur',
  'group.consolidated_net_turnover_eur',
  'entity.is_public_interest_entity',
  'parent.report_includes_entity',
  'third_country.eu_turnover_year_1_eur',
  'third_country.eu_turnover_year_2_eur',
  'group.ultimate_parent_country',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const accepted = (raw: unknown): CheckerAnswers => checkerAnswersSchema.parse(raw);
const refused = (raw: unknown): boolean => !checkerAnswersSchema.safeParse(raw).success;

interface Stored {
  value: FactValue;
  ref: string | undefined;
}
const stated = (value: FactValue, ref: string = ANSWER): Stored => ({ value, ref });

/** The profile's facts, keyed "fact type @ scope type" so a failure names both. */
function facts(answers: CheckerAnswers): Record<string, Stored> {
  const profile = buildCheckProfile(answers);
  const typeOf = new Map(profile.scopeObjects.map((o) => [o.id, o.type]));
  const out: Record<string, Stored> = {};
  for (const f of profile.facts) {
    out[`${f.factType} @ ${typeOf.get(f.scopeId) ?? `unknown scope '${f.scopeId}'`}`] = { value: f.value, ref: f.source?.ref };
  }
  return out;
}

/** What one answer adds: the facts present with it and absent (or different) without it. */
function contribution(answers: CheckerAnswers, field: keyof CheckerAnswers): Record<string, Stored> {
  const rest: CheckerAnswers = { ...answers };
  delete rest[field];
  const without = facts(rest);
  return Object.fromEntries(
    Object.entries(facts(answers)).filter(([key, value]) => JSON.stringify(without[key]) !== JSON.stringify(value)),
  );
}

const show = (value: unknown): string => JSON.stringify(value) ?? 'absent';

/**
 * Answer sets covering every answer of every question at least once, under
 * every C-2 answer and every kind of country, each accepted by the schema.
 */
function coveringAnswerSets(): CheckerAnswers[] {
  const countries: Record<string, string>[] = [
    ...EU_CODES.map((country) => ({ country })),
    ...LISTED_NON_EU.map((country) => ({ country })),
    { country: 'other', countryOther: 'AR' },
    { country: 'other', countryOther: 'IL' },
    { country: 'not_sure' },
    {},
  ];
  const headcounts = HEADCOUNT_ANSWERS.map(([, answer]) => answer);
  const moneys = MONEY_ANSWERS.map(([, answer]) => answer);
  const sets: unknown[] = [{}];
  countries.forEach((country, i) => {
    for (const group of [...GROUPS, undefined]) {
      // Round robin over seven steps: every list here has at most seven answers.
      for (let k = 0; k < 7; k += 1) {
        const n = i + k;
        const set: Record<string, unknown> = {
          ...country,
          organisation: ORGANISATIONS[n % ORGANISATIONS.length],
          employees: headcounts[n % headcounts.length],
          turnover: moneys[n % moneys.length],
          pie: YES_NO[n % YES_NO.length],
          parentReport: YES_NO[(n + 1) % YES_NO.length],
          euTurnover: EU_TURNOVER[n % EU_TURNOVER.length],
        };
        if (group !== undefined) set.group = group;
        if (group === 'parent' || group === 'both') {
          set.parentOwnEmployees = headcounts[(n + 2) % headcounts.length];
          set.parentOwnTurnover = moneys[(n + 3) % moneys.length];
        }
        sets.push(set);
      }
    }
  });
  return sets.map(accepted);
}

const COVERING = coveringAnswerSets();

// ---------------------------------------------------------------------------
// The mapping: one case per answer, with its counterexamples in the same assertion
// ---------------------------------------------------------------------------

describe('the mapping (§4.1 "Facts set")', () => {
  it('the covering answer sets reach every answer of every question', () => {
    const seen = new Set<string>();
    for (const answers of COVERING) {
      for (const [field, value] of Object.entries(answers)) {
        if (value !== undefined) seen.add(`${field}=${typeof value === 'object' ? 'typed' : String(value)}`);
      }
    }
    const expected = [
      ...[...EU_CODES, ...LISTED_NON_EU, 'other', 'not_sure'].map((v) => `country=${v}`),
      ...GROUPS.map((v) => `group=${v}`),
      ...ORGANISATIONS.map((v) => `organisation=${v}`),
      ...HEADCOUNT_ANSWERS.flatMap(([, v]) => [`employees=${typeof v === 'object' ? 'typed' : v}`, `parentOwnEmployees=${typeof v === 'object' ? 'typed' : v}`]),
      ...MONEY_ANSWERS.flatMap(([, v]) => [`turnover=${typeof v === 'object' ? 'typed' : v}`, `parentOwnTurnover=${typeof v === 'object' ? 'typed' : v}`]),
      ...YES_NO.flatMap((v) => [`pie=${v}`, `parentReport=${v}`]),
      ...EU_TURNOVER.map((v) => `euTurnover=${v}`),
    ];
    expect(expected.filter((answer) => !seen.has(answer))).toEqual([]);
  });

  it('builds the two scope objects today\'s checker builds, the entity under the organisation, with their ids exported', () => {
    expect(buildCheckProfile(accepted({})).scopeObjects).toEqual([
      { id: 'org1', type: 'organization', name: 'Your organisation' },
      { id: 'e1', type: 'legal_entity', name: 'Your entity', parentId: 'org1' },
    ]);
    expect([CHECK_ORGANISATION_ID, CHECK_ENTITY_ID]).toEqual(['org1', 'e1']);
  });

  it('an absent answer sets nothing; an answered one sets its fact', () => {
    expect(buildCheckProfile(accepted({})).facts).toEqual([]);
    expect(facts(accepted({ pie: 'yes' }))).toEqual({ 'entity.is_public_interest_entity @ legal_entity': stated(bool(true)) });
  });

  it('every fact is a confirmed customer statement, from the answer, the not-sure or the not-a-fund source', () => {
    const problems: string[] = [];
    const refs = new Map<string, number>();
    for (const answers of COVERING) {
      for (const f of buildCheckProfile(answers).facts) {
        const ref = f.source?.ref ?? 'none';
        refs.set(ref, (refs.get(ref) ?? 0) + 1);
        if (f.confirmed !== true) problems.push(`${f.factType}: not confirmed`);
        if (f.source?.kind !== 'customer_statement') problems.push(`${f.factType}: source kind ${show(f.source?.kind)}`);
        if (![ANSWER, NOT_SURE, NOT_A_FUND].includes(ref)) problems.push(`${f.factType}: source ref ${ref}`);
        // An unknown comes only from "Not sure", except the fund's legal form (ruling R3).
        const fundForm = f.factType === 'entity.legal_form' && answers.organisation === 'fund';
        if ((f.value.kind === 'unknown') !== (ref === NOT_SURE) && !fundForm) problems.push(`${f.factType}: ${show(f.value)} from ${ref}`);
        if (ref === NOT_A_FUND && (f.factType !== 'entity.excluded_by_article_1_4' || show(f.value) !== show(bool(false)))) {
          problems.push(`${f.factType}: ${show(f.value)} labelled not an investment fund`);
        }
      }
    }
    expect(problems).toEqual([]);
    // Positive control: all three sources occur.
    expect([ANSWER, NOT_SURE, NOT_A_FUND].map((ref) => (refs.get(ref) ?? 0) > 0)).toEqual([true, true, true]);
  });

  describe('C-1, where the company is registered', () => {
    for (const code of [...EU_CODES, ...LISTED_NON_EU]) {
      it(`${code} sets the country of incorporation, and nothing else`, () => {
        expect(facts(accepted({ country: code }))).toEqual({ 'entity.incorporation_country @ legal_entity': stated(str(code)) });
      });
    }
    it('"Another country" sets the typed ISO code, and nothing else', () => {
      expect(facts(accepted({ country: 'other', countryOther: 'AR' }))).toEqual({
        'entity.incorporation_country @ legal_entity': stated(str('AR')),
      });
    });
    it('"Not sure" sets the country as unknown, from the not-sure source', () => {
      expect(facts(accepted({ country: 'not_sure' }))).toEqual({
        'entity.incorporation_country @ legal_entity': stated(UNKNOWN, NOT_SURE),
      });
    });
  });

  describe('C-2, the group position (ruling R6)', () => {
    const cases: [CheckerAnswers['group'], Stored, Stored][] = [
      ['none', stated(bool(false)), stated(bool(false))],
      ['parent', stated(bool(true)), stated(bool(false))],
      ['owned', stated(bool(false)), stated(bool(true))],
      ['both', stated(bool(true)), stated(bool(true))],
      ['not_sure', stated(UNKNOWN, NOT_SURE), stated(UNKNOWN, NOT_SURE)],
    ];
    for (const [group, parent, subsidiary] of cases) {
      it(`"${group}" sets both group booleans, and nothing else`, () => {
        expect(facts(accepted({ group }))).toEqual({
          'entity.is_parent_undertaking @ legal_entity': parent,
          'entity.is_subsidiary @ legal_entity': subsidiary,
        });
      });
    }
  });

  describe('C-3, the kind of organisation', () => {
    const notAFund = (legalForm: string) => ({
      'entity.legal_form @ legal_entity': stated(str(legalForm)),
      'entity.excluded_by_article_1_4 @ legal_entity': stated(bool(false), NOT_A_FUND),
    });
    const cases: [CheckerAnswers['organisation'], Record<string, Stored>][] = [
      ['private_limited', notAFund('private_limited_company')],
      ['public_limited', notAFund('public_limited_company')],
      ['bank', notAFund('credit_institution')],
      ['insurer', notAFund('insurance_undertaking')],
      // "Something else" maps to `other`, a catalogue miss.
      ['something_else', notAFund('other')],
      // The fund: excluded by Article 1(4); its answer names no legal form (ruling R3).
      ['fund', { 'entity.legal_form @ legal_entity': stated(UNKNOWN), 'entity.excluded_by_article_1_4 @ legal_entity': stated(bool(true)) }],
      ['not_sure', { 'entity.legal_form @ legal_entity': stated(UNKNOWN, NOT_SURE), 'entity.excluded_by_article_1_4 @ legal_entity': stated(UNKNOWN, NOT_SURE) }],
    ];
    for (const [organisation, expected] of cases) {
      it(`"${organisation}" sets the legal form and the Article 1(4) exclusion, and nothing else`, () => {
        expect(facts(accepted({ organisation }))).toEqual(expected);
      });
    }
  });

  describe('C-4 and C-5, scoped by C-2 (CD-5; ruling R7)', () => {
    it("a parent's C-4 sets group.avg_employees and no entity.avg_employees", () => {
      const added = contribution(accepted({ group: 'parent', employees: 'over_1100' }), 'employees');
      expect(Object.keys(added)).toEqual(['group.avg_employees @ organization']);
      expect(added).toEqual({ 'group.avg_employees @ organization': stated(range(1100, MAX)) });
    });
    it("an owned company's C-4 sets entity.avg_employees and no group.avg_employees", () => {
      const added = contribution(accepted({ group: 'owned', employees: 'over_1100' }), 'employees');
      expect(Object.keys(added)).toEqual(['entity.avg_employees @ legal_entity']);
      expect(added).toEqual({ 'entity.avg_employees @ legal_entity': stated(range(1100, MAX)) });
    });
    it("an intermediate parent's C-4 sets group.avg_employees and no entity.avg_employees", () => {
      const added = contribution(accepted({ group: 'both', employees: 'over_1100' }), 'employees');
      expect(Object.keys(added)).toEqual(['group.avg_employees @ organization']);
    });
    it("a parent's C-5 sets group.consolidated_net_turnover_eur and no entity.net_turnover_eur", () => {
      const added = contribution(accepted({ group: 'parent', turnover: 'over_500m' }), 'turnover');
      expect(Object.keys(added)).toEqual(['group.consolidated_net_turnover_eur @ organization']);
      expect(added).toEqual({ 'group.consolidated_net_turnover_eur @ organization': stated(range(500_000_000.01, MAX)) });
    });
    it("an owned company's C-5 sets entity.net_turnover_eur and no group.consolidated_net_turnover_eur", () => {
      const added = contribution(accepted({ group: 'owned', turnover: 'over_500m' }), 'turnover');
      expect(Object.keys(added)).toEqual(['entity.net_turnover_eur @ legal_entity']);
    });
    it("an intermediate parent's C-5 sets group.consolidated_net_turnover_eur and no entity.net_turnover_eur", () => {
      const added = contribution(accepted({ group: 'both', turnover: 'over_500m' }), 'turnover');
      expect(Object.keys(added)).toEqual(['group.consolidated_net_turnover_eur @ organization']);
    });

    for (const scoping of SCOPINGS) {
      for (const [name, answer, value, ref] of HEADCOUNT_ANSWERS) {
        it(`C-4 with group ${show(scoping.group)}, "${name}": only ${scoping.employees}`, () => {
          expect(contribution(accepted({ group: scoping.group, employees: answer }), 'employees')).toEqual({
            [scoping.employees]: stated(value, ref),
          });
        });
      }
      for (const [name, answer, value, ref] of MONEY_ANSWERS) {
        it(`C-5 with group ${show(scoping.group)}, "${name}": only ${scoping.turnover}`, () => {
          expect(contribution(accepted({ group: scoping.group, turnover: answer }), 'turnover')).toEqual({
            [scoping.turnover]: stated(value, ref),
          });
        });
      }
    }
  });

  describe('C-6 and C-7', () => {
    const cases: [(typeof YES_NO)[number], Stored][] = [
      ['yes', stated(bool(true))],
      ['no', stated(bool(false))],
      ['not_sure', stated(UNKNOWN, NOT_SURE)],
    ];
    for (const [answer, expected] of cases) {
      it(`C-6 "${answer}" sets entity.is_public_interest_entity, and nothing else`, () => {
        expect(facts(accepted({ pie: answer }))).toEqual({ 'entity.is_public_interest_entity @ legal_entity': expected });
      });
      it(`C-7 "${answer}" sets parent.report_includes_entity, and nothing else`, () => {
        expect(facts(accepted({ parentReport: answer }))).toEqual({ 'parent.report_includes_entity @ legal_entity': expected });
      });
    }
  });

  describe('C-8, the EU-turnover test (§4.3; ruling R9)', () => {
    const cases: [(typeof EU_TURNOVER)[number], Stored, Stored][] = [
      ['both', stated(OVER_450M), stated(OVER_450M)],
      ['recent_only', stated(OVER_450M), stated(UNDER_450M)],
      ['earlier_only', stated(UNDER_450M), stated(OVER_450M)],
      ['no', stated(UNDER_450M), stated(UNDER_450M)],
      ['not_sure', stated(UNKNOWN, NOT_SURE), stated(UNKNOWN, NOT_SURE)],
    ];
    for (const [euTurnover, year1, year2] of cases) {
      it(`"${euTurnover}" sets both years on the organisation, and nothing else`, () => {
        expect(facts(accepted({ euTurnover }))).toEqual({
          'third_country.eu_turnover_year_1_eur @ organization': year1,
          'third_country.eu_turnover_year_2_eur @ organization': year2,
        });
      });
    }

    const PARENT_COUNTRY = 'group.ultimate_parent_country @ organization';
    it('for "no group" and for a parent, also sets the ultimate parent\'s country as C-1 stored it', () => {
      expect(contribution(accepted({ country: 'US', group: 'none', euTurnover: 'both' }), 'euTurnover')[PARENT_COUNTRY]).toEqual(stated(str('US')));
      expect(contribution(accepted({ country: 'other', countryOther: 'AR', group: 'parent', euTurnover: 'no' }), 'euTurnover')[PARENT_COUNTRY]).toEqual(
        stated(str('AR')),
      );
      expect(contribution(accepted({ country: 'not_sure', group: 'none', euTurnover: 'not_sure' }), 'euTurnover')[PARENT_COUNTRY]).toEqual(
        stated(UNKNOWN, NOT_SURE),
      );
    });
    it("never for an owned company, an intermediate parent, a group 'Not sure' or no group answer", () => {
      for (const group of ['owned', 'both', 'not_sure', undefined] as const) {
        expect([group, Object.keys(contribution(accepted({ country: 'US', group, euTurnover: 'both' }), 'euTurnover'))]).toEqual([
          group,
          ['third_country.eu_turnover_year_1_eur @ organization', 'third_country.eu_turnover_year_2_eur @ organization'],
        ]);
      }
    });
    it('nothing for the parent country when C-1 is unanswered, or when C-8 is', () => {
      expect(Object.keys(contribution(accepted({ group: 'none', euTurnover: 'both' }), 'euTurnover'))).toEqual([
        'third_country.eu_turnover_year_1_eur @ organization',
        'third_country.eu_turnover_year_2_eur @ organization',
      ]);
      expect(facts(accepted({ country: 'US', group: 'none' }))).not.toHaveProperty([PARENT_COUNTRY]);
      // Positive control in the same shape: with C-8 answered, it is there.
      expect(facts(accepted({ country: 'US', group: 'none', euTurnover: 'no' }))).toHaveProperty([PARENT_COUNTRY]);
    });
  });

  describe('C-9 and C-10, the parent company on its own', () => {
    for (const group of ['parent', 'both'] as const) {
      for (const [name, answer, value, ref] of HEADCOUNT_ANSWERS) {
        it(`C-9 for ${group}, "${name}": only entity.avg_employees`, () => {
          expect(contribution(accepted({ group, employees: 'over_1100', parentOwnEmployees: answer }), 'parentOwnEmployees')).toEqual({
            'entity.avg_employees @ legal_entity': stated(value, ref),
          });
        });
      }
      for (const [name, answer, value, ref] of MONEY_ANSWERS) {
        it(`C-10 for ${group}, "${name}": only entity.net_turnover_eur`, () => {
          expect(contribution(accepted({ group, turnover: 'over_500m', parentOwnTurnover: answer }), 'parentOwnTurnover')).toEqual({
            'entity.net_turnover_eur @ legal_entity': stated(value, ref),
          });
        });
      }
    }
  });
});

describe('"Not sure" against "never asked" (§4.4; PRF-6)', () => {
  const BASE = { country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m' } as const;
  const PIE = 'entity.is_public_interest_entity @ legal_entity';

  it('A: C-6 answered "Not sure" holds the unknown fact, from the not-sure source', () => {
    expect(facts(accepted({ ...BASE, pie: 'not_sure' }))[PIE]).toEqual(stated(UNKNOWN, NOT_SURE));
  });
  it('B: the same answers without C-6 hold no such fact', () => {
    const answers = accepted(BASE);
    expect(visibleQuestions(answers).map((q) => q.id)).toContain('C-6');
    expect(facts(answers)).not.toHaveProperty([PIE]);
  });
  it('C: C-6 answered "Yes" holds the boolean (positive control)', () => {
    expect(facts(accepted({ ...BASE, pie: 'yes' }))[PIE]).toEqual(stated(bool(true)));
  });
  it('D: where C-6 is never shown, nothing is held for it', () => {
    const answers = accepted({ ...BASE, employees: '450_or_fewer' });
    expect(visibleQuestions(answers).map((q) => q.id)).toEqual(['C-1', 'C-2', 'C-3', 'C-4', 'C-5']);
    expect(facts(answers)).not.toHaveProperty([PIE]);
    expect(Object.keys(facts(answers)).length).toBeGreaterThan(0);
  });
});

describe('mapping and visibility are separate (ruling R11)', () => {
  it("a hidden question's answer still sets its facts", () => {
    const answers = accepted({ country: 'US', group: 'none', organisation: 'bank', employees: '450_or_fewer', pie: 'yes' });
    expect(visibleQuestions(answers).map((q) => q.id)).toEqual(['C-1', 'C-2', 'C-8']);
    expect(facts(answers)).toMatchObject({
      'entity.legal_form @ legal_entity': stated(str('credit_institution')),
      'entity.avg_employees @ legal_entity': stated(range(0, 450)),
      'entity.is_public_interest_entity @ legal_entity': stated(bool(true)),
    });
  });
});

// ---------------------------------------------------------------------------
// Visibility against §4.5
// ---------------------------------------------------------------------------

const ORDER: QuestionId[] = ['C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-8', 'C-9', 'C-10'];

/** §4.3's upper ends, for "could exceed" (ruling R2): a band whose upper end lies above the threshold. */
const EMPLOYEE_UPPER: Record<string, number | null> = {
  '450_or_fewer': 450,
  over_450_up_to_550: 550,
  over_550_up_to_900: 900,
  over_900_up_to_1100: 1100,
  over_1100: null,
};
const TURNOVER_UPPER: Record<string, number | null> = { up_to_400m: 400_000_000, over_400m_up_to_500m: 500_000_000, over_500m: null };

/** "Could exceed" (plan Task 3; ruling R2): a band reaching above, a typed figure above, "Not sure", or unanswered. */
function couldExceed(answer: Headcount | Money | undefined, upper: Record<string, number | null>, threshold: number): boolean {
  if (answer === undefined || answer === 'not_sure') return true;
  if (typeof answer === 'object') return answer.exact > threshold;
  const top = upper[answer];
  if (top === undefined) throw new Error(`no §4.3 band ${answer}`);
  return top === null || top > threshold;
}

/**
 * C-6: §4.5 "C-6 if more than 450 employees, or unsure", for a band; §4.1 "not
 * a fund"; ruling R1 for a typed figure (it could exceed 500) and for C-4
 * unanswered.
 */
function expectsC6(a: CheckerAnswers): boolean {
  if (a.organisation === 'fund') return false;
  const e = a.employees;
  if (e === undefined || e === 'not_sure') return true;
  if (typeof e === 'object') return e.exact > 500;
  return e !== '450_or_fewer';
}

/** C-7: DG-19 option B, as ruling R2 makes it exact. */
function expectsC7(a: CheckerAnswers): boolean {
  if (a.organisation === 'fund') return false;
  const own = (employees: Headcount | undefined, turnover: Money | undefined): boolean =>
    (a.pie !== 'no' && couldExceed(employees, EMPLOYEE_UPPER, 500)) ||
    (couldExceed(employees, EMPLOYEE_UPPER, 1000) && couldExceed(turnover, TURNOVER_UPPER, 450_000_000));
  if (a.group === 'owned') return own(a.employees, a.turnover);
  if (a.group === 'both') return own(a.parentOwnEmployees, a.parentOwnTurnover) || own(a.employees, a.turnover);
  return false;
}

const EMPLOYEE_VARIANTS: (Headcount | undefined)[] = [
  '450_or_fewer',
  'over_450_up_to_550',
  'over_550_up_to_900',
  'over_900_up_to_1100',
  'over_1100',
  { exact: 480 },
  { exact: 500 },
  { exact: 500.5 },
  { exact: 1000 },
  { exact: 1000.5 },
  'not_sure',
  undefined,
];
const TURNOVER_VARIANTS: (Money | undefined)[] = ['up_to_400m', 'over_400m_up_to_500m', 'over_500m', { exact: 450_000_000 }, { exact: 450_000_000.01 }, 'not_sure', undefined];
const ORGANISATION_VARIANTS: CheckerAnswers['organisation'][] = [...ORGANISATIONS, undefined];
const PIE_VARIANTS: CheckerAnswers['pie'][] = [...YES_NO, undefined];

type Own = [Headcount | undefined, Money | undefined];
const OWN_FEW: Own[] = [
  [undefined, undefined],
  ['450_or_fewer', 'up_to_400m'],
  ['over_1100', 'over_500m'],
  ['not_sure', 'not_sure'],
];
const OWN_MANY: Own[] = (['450_or_fewer', 'over_550_up_to_900', 'over_1100', { exact: 500 }, { exact: 1000.5 }, 'not_sure', undefined] as (Headcount | undefined)[]).flatMap(
  (e) => (['up_to_400m', 'over_400m_up_to_500m', { exact: 450_000_000 }, 'not_sure', undefined] as (Money | undefined)[]).map((t): Own => [e, t]),
);

const compact = (raw: Record<string, unknown>): CheckerAnswers =>
  Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as CheckerAnswers;

function euVariants(
  group: CheckerAnswers['group'],
  own: Own[] = [[undefined, undefined]],
  organisations: CheckerAnswers['organisation'][] = ORGANISATION_VARIANTS,
  countries: readonly ('DE' | 'SE')[] = ['DE', 'SE'],
): CheckerAnswers[] {
  const out: CheckerAnswers[] = [];
  for (const country of countries)
    for (const organisation of organisations)
      for (const employees of EMPLOYEE_VARIANTS)
        for (const turnover of TURNOVER_VARIANTS)
          for (const pie of PIE_VARIANTS)
            for (const [parentOwnEmployees, parentOwnTurnover] of own)
              out.push(compact({ country, group, organisation, employees, turnover, pie, parentOwnEmployees, parentOwnTurnover }));
  return out;
}

/** Answers to questions a visitor is not shown, which visibility must ignore (mapping is separate). */
const STRAY_ANSWERS: Record<string, unknown>[] = [
  {},
  { organisation: 'bank', employees: 'over_1100', turnover: 'over_500m', pie: 'yes', parentReport: 'no' },
  { organisation: 'fund', employees: '450_or_fewer', turnover: 'up_to_400m', euTurnover: 'both' },
];

function nonEuVariants(): CheckerAnswers[] {
  const countries: Record<string, string>[] = [
    ...LISTED_NON_EU.map((country) => ({ country })),
    { country: 'other', countryOther: 'AR' },
    { country: 'other', countryOther: 'US' },
    { country: 'other' },
  ];
  return countries.flatMap((country) =>
    [...GROUPS, undefined].flatMap((group) => STRAY_ANSWERS.map((stray) => compact({ ...country, group, ...stray }))),
  );
}

function countryNotSureVariants(): CheckerAnswers[] {
  return [...GROUPS, undefined].flatMap((group) => STRAY_ANSWERS.map((stray) => compact({ country: 'not_sure', group, ...stray })));
}

/**
 * C-9 and C-10: §4.5's optional questions for a parent, except a fund (the
 * parent's ruling R13, 2026-10-24). Article 1(4) settles a fund's own route
 * whatever its figures, so they could change nothing (law 16; §3, P-e), as for
 * C-6 and C-7.
 */
const c9c10 = (a: CheckerAnswers): QuestionId[] => (a.organisation === 'fund' ? [] : ['C-9', 'C-10']);

interface Row {
  visitor: string;
  core: QuestionId[];
  conditional: QuestionId[];
  optional: (a: CheckerAnswers) => QuestionId[];
  /** The "Total" column, without the optional questions. */
  total: [number, number];
  variants: () => CheckerAnswers[];
  shows: (a: CheckerAnswers) => QuestionId[];
}

const EU_CORE: QuestionId[] = ['C-1', 'C-2', 'C-3', 'C-4', 'C-5'];
const c6 = (a: CheckerAnswers): QuestionId[] => (expectsC6(a) ? ['C-6'] : []);
const c6c7 = (a: CheckerAnswers): QuestionId[] => [...c6(a), ...(expectsC7(a) ? (['C-7'] as QuestionId[]) : [])];

/** §4.5, "How many questions each visitor answers", row by row. The supplier path (QD-2) is not built. */
const SECTION_4_5: Row[] = [
  { visitor: 'EU company, no group', core: EU_CORE, conditional: ['C-6'], optional: () => [], total: [5, 6], variants: () => euVariants('none'), shows: c6 },
  { visitor: 'EU parent', core: EU_CORE, conditional: ['C-6'], optional: c9c10, total: [5, 6], variants: () => euVariants('parent', OWN_FEW), shows: c6 },
  { visitor: 'EU subsidiary', core: EU_CORE, conditional: ['C-6', 'C-7'], optional: () => [], total: [5, 7], variants: () => euVariants('owned'), shows: c6c7 },
  {
    visitor: 'EU intermediate parent (owns and is owned)',
    core: EU_CORE,
    conditional: ['C-6', 'C-7'],
    optional: c9c10,
    total: [5, 7],
    variants: () => euVariants('both', OWN_MANY, ['private_limited', 'fund', 'not_sure', undefined], ['DE']),
    shows: c6c7,
  },
  { visitor: 'EU, group position "Not sure"', core: EU_CORE, conditional: ['C-6'], optional: () => [], total: [5, 6], variants: () => euVariants('not_sure'), shows: c6 },
  // "3 (5)": C-11 and C-12 come only after their content changes.
  { visitor: 'Non-EU company or group', core: ['C-1', 'C-2', 'C-8'], conditional: [], optional: () => [], total: [3, 3], variants: nonEuVariants, shows: () => [] },
  { visitor: 'Country "Not sure"', core: ['C-1', 'C-2'], conditional: [], optional: () => [], total: [2, 2], variants: countryNotSureVariants, shows: () => [] },
];

const ids = (list: { id: QuestionId; optional: boolean }[]): string => list.map((q) => (q.optional ? `${q.id}?` : q.id)).join(' ');

describe('visibility against §4.5', () => {
  for (const row of SECTION_4_5) {
    it(`§4.5 "${row.visitor}"`, () => {
      const mismatches: string[] = [];
      const counts: number[] = [];
      for (const answers of row.variants()) {
        const shown = row.shows(answers);
        const optional = row.optional(answers);
        const expected = ORDER.filter((id) => row.core.includes(id) || shown.includes(id) || optional.includes(id)).map((id) => ({
          id,
          optional: optional.includes(id),
        }));
        const got = visibleQuestions(answers);
        if (show(got) !== show(expected)) mismatches.push(`${show(answers)}: expected ${ids(expected)}, got ${ids(got)}`);
        counts.push(got.filter((q) => !q.optional).length);
      }
      expect({ mismatches: mismatches.length, first: mismatches.slice(0, 8) }).toEqual({ mismatches: 0, first: [] });
      // The "Total" column: both ends are reached.
      expect([Math.min(...counts), Math.max(...counts)]).toEqual(row.total);
    });
  }

  it('before C-1 is answered, only C-1 and C-2 are shown', () => {
    expect(visibleQuestions(accepted({}))).toEqual([
      { id: 'C-1', optional: false },
      { id: 'C-2', optional: false },
    ]);
  });

  describe('C-6, made exact for typed figures (ruling R1)', () => {
    const c6shown = (employees: Headcount) => visibleQuestions(accepted({ country: 'DE', group: 'none', employees })).some((q) => q.id === 'C-6');
    it('a typed 480 or 500 hides C-6; 500.5 shows it', () => {
      expect([c6shown({ exact: 480 }), c6shown({ exact: 500 }), c6shown({ exact: 500.5 })]).toEqual([false, false, true]);
    });
    it('"450 or fewer" hides C-6; every other band and "Not sure" show it', () => {
      expect(
        (['450_or_fewer', 'over_450_up_to_550', 'over_550_up_to_900', 'over_900_up_to_1100', 'over_1100', 'not_sure'] as Headcount[]).map(c6shown),
      ).toEqual([false, true, true, true, true, true]);
    });
    it('is not widened for C-9 or C-10', () => {
      const answers = accepted({ country: 'DE', group: 'both', employees: '450_or_fewer', parentOwnEmployees: 'over_1100' });
      expect(visibleQuestions(answers).some((q) => q.id === 'C-6')).toBe(false);
    });
  });

  describe('C-9 and C-10, offered to a parent that is not a fund (ruling R13)', () => {
    const offered = (raw: Record<string, unknown>) =>
      visibleQuestions(accepted(raw)).filter((q) => q.id === 'C-9' || q.id === 'C-10');
    it('a fund parent or intermediate parent is not offered them; the same company not a fund is, both marked optional', () => {
      for (const group of ['parent', 'both'] as const) {
        const large = { country: 'DE', group, employees: 'over_1100', turnover: 'over_500m' };
        expect([group, offered({ ...large, organisation: 'fund' })]).toEqual([group, []]);
        expect([group, offered({ ...large, organisation: 'private_limited' })]).toEqual([
          group,
          [
            { id: 'C-9', optional: true },
            { id: 'C-10', optional: true },
          ],
        ]);
      }
    });
  });

  describe('C-7, the approved rule (DG-19 option B; ruling R2)', () => {
    const c7shown = (raw: Record<string, unknown>) => visibleQuestions(accepted(raw)).some((q) => q.id === 'C-7');
    const DE = { country: 'DE', organisation: 'private_limited' } as const;

    it('an owned company small on every figure is not asked; one above both thresholds is', () => {
      expect(c7shown({ ...DE, group: 'owned', employees: '450_or_fewer', turnover: 'up_to_400m' })).toBe(false);
      expect(c7shown({ ...DE, group: 'owned', employees: 'over_1100', turnover: 'over_500m' })).toBe(true);
    });
    it('an owned company with public-interest "No" and 550–900 employees is not asked; with "Not sure" it is', () => {
      expect(c7shown({ ...DE, group: 'owned', employees: 'over_550_up_to_900', turnover: 'over_500m', pie: 'no' })).toBe(false);
      expect(c7shown({ ...DE, group: 'owned', employees: 'over_550_up_to_900', turnover: 'over_500m', pie: 'not_sure' })).toBe(true);
    });
    it('an intermediate parent without C-9 and C-10 is asked, its own figures counting as "could"', () => {
      expect(c7shown({ ...DE, group: 'both', employees: '450_or_fewer', turnover: 'up_to_400m' })).toBe(true);
    });
    it('an intermediate parent small on every figure is not asked; large on its own figures alone, it is', () => {
      const small = { ...DE, group: 'both', employees: '450_or_fewer', turnover: 'up_to_400m' };
      expect(c7shown({ ...small, parentOwnEmployees: '450_or_fewer', parentOwnTurnover: 'up_to_400m' })).toBe(false);
      expect(c7shown({ ...small, parentOwnEmployees: 'over_1100', parentOwnTurnover: 'over_500m' })).toBe(true);
    });
    it('a fund is never asked; the same company not a fund is', () => {
      const large = { country: 'DE', group: 'owned', employees: 'over_1100', turnover: 'over_500m' };
      expect(c7shown({ ...large, organisation: 'fund' })).toBe(false);
      expect(c7shown({ ...large, organisation: 'bank' })).toBe(true);
    });
    it('a non-EU company is never asked; the same company in the EU is', () => {
      const large = { group: 'owned', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m' };
      expect(c7shown({ ...large, country: 'US' })).toBe(false);
      expect(c7shown({ ...large, country: 'other', countryOther: 'AR' })).toBe(false);
      expect(c7shown({ ...large, country: 'DE' })).toBe(true);
    });
    it('no group, a parent and group "Not sure" are never asked', () => {
      for (const group of ['none', 'parent', 'not_sure'] as const) {
        expect([group, c7shown({ ...DE, group, employees: 'over_1100', turnover: 'over_500m' })]).toEqual([group, false]);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// The question model
// ---------------------------------------------------------------------------

describe('the question model (§4.1)', () => {
  const C6 =
    'Is your company a public-interest entity? That means its shares or bonds are admitted to trading on an EU regulated market (growth markets and other multilateral trading facilities do not count), it is a bank or an insurer, or its country has designated it a public-interest entity. Your auditor will know.';
  const C4_HINT = 'The average for the year, as your accounts state it';
  const C5_HINT = "Revenue after rebates and VAT; banks and insurers, we'll confirm the right figure later";
  const NOT_SURE_OPTION = { id: 'not_sure', label: 'Not sure' };
  const YES_NO_OPTIONS = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, NOT_SURE_OPTION];
  const HEADCOUNT_OPTIONS = [
    { id: '450_or_fewer', label: '450 or fewer' },
    { id: 'over_450_up_to_550', label: 'More than 450, up to 550 (about 500)' },
    { id: 'over_550_up_to_900', label: 'More than 550, up to 900' },
    { id: 'over_900_up_to_1100', label: 'More than 900, up to 1,100 (about 1,000)' },
    { id: 'over_1100', label: 'More than 1,100' },
    NOT_SURE_OPTION,
  ];
  const MONEY_OPTIONS = [
    { id: 'up_to_400m', label: 'Up to €400 million' },
    { id: 'over_400m_up_to_500m', label: 'More than €400m, up to €500m (about €450m)' },
    { id: 'over_500m', label: 'More than €500 million' },
    NOT_SURE_OPTION,
  ];

  it('C-1 to C-10, in order, each with its answer field', () => {
    expect(CHECK_QUESTIONS.map((q) => [q.id, q.field])).toEqual([
      ['C-1', 'country'],
      ['C-2', 'group'],
      ['C-3', 'organisation'],
      ['C-4', 'employees'],
      ['C-5', 'turnover'],
      ['C-6', 'pie'],
      ['C-7', 'parentReport'],
      ['C-8', 'euTurnover'],
      ['C-9', 'parentOwnEmployees'],
      ['C-10', 'parentOwnTurnover'],
    ]);
  });

  it("the plain wording is §4.1's, verbatim where §4.1 gives it", () => {
    const byId = Object.fromEntries(CHECK_QUESTIONS.map((q) => [q.id, { wording: q.wording, hint: q.hint }]));
    expect(byId).toEqual({
      'C-1': { wording: { default: 'Where is your company registered?' }, hint: undefined },
      'C-2': { wording: { default: 'Is your company part of a group?' }, hint: undefined },
      'C-3': { wording: { default: 'What kind of organisation is it?' }, hint: undefined },
      'C-4': {
        wording: {
          default: 'About how many people work for your company?',
          parent: 'About how many people work across the whole group?',
          both: 'About how many people work in your company and the companies it owns?',
        },
        hint: C4_HINT,
      },
      // Drafted parallel to C-4 (§4.1 gives no sentence: "scoped exactly as C-4"); Task 5 brings it for approval.
      'C-5': {
        wording: {
          default: 'About how much turnover does your company have in a year?',
          parent: 'About how much turnover does the whole group have in a year?',
          both: 'About how much turnover do your company and the companies it owns have in a year?',
        },
        hint: C5_HINT,
      },
      'C-6': { wording: { default: C6, parent: C6.replace('Is your company', 'Is the parent company') }, hint: undefined },
      'C-7': { wording: { default: 'Does your parent company publish a group sustainability report that includes your company?' }, hint: undefined },
      'C-8': {
        wording: { default: "Has your group's turnover from the EU been more than €450 million in each of the last two financial years?" },
        hint: undefined,
      },
      'C-9': { wording: { default: 'How many people does the parent company itself employ?' }, hint: C4_HINT },
      'C-10': { wording: { default: "And the parent company's own turnover?" }, hint: C5_HINT },
    });
  });

  it('the wording follows the group position where §4.1 varies it', () => {
    expect(questionWording('C-4', accepted({ group: 'parent' }))).toBe('About how many people work across the whole group?');
    expect(questionWording('C-4', accepted({ group: 'both' }))).toBe('About how many people work in your company and the companies it owns?');
    expect(questionWording('C-4', accepted({ group: 'owned' }))).toBe('About how many people work for your company?');
    expect(questionWording('C-6', accepted({ group: 'parent' }))).toMatch(/^Is the parent company a public-interest entity\?/);
    expect(questionWording('C-6', accepted({ group: 'both' }))).toMatch(/^Is your company a public-interest entity\?/);
  });

  it("the answers are §4.1's and §4.3's, every one with an id the schema takes", () => {
    const byId = Object.fromEntries(CHECK_QUESTIONS.map((q) => [q.id, { options: q.options, typed: q.typed }]));
    expect(byId['C-1']?.options.map((o) => o.id)).toEqual([...EU_CODES, ...LISTED_NON_EU, 'other', 'not_sure']);
    expect(byId['C-1']?.options.slice(-2)).toEqual([{ id: 'other', label: 'Another country' }, NOT_SURE_OPTION]);
    expect(byId['C-2']).toEqual({
      options: [
        { id: 'none', label: 'No' },
        { id: 'parent', label: 'Yes, we are the parent (top) company' },
        { id: 'owned', label: 'Yes, another company owns us' },
        { id: 'both', label: 'Yes, we own companies and another company owns us' },
        NOT_SURE_OPTION,
      ],
      typed: undefined,
    });
    expect(byId['C-3']).toEqual({
      options: [
        { id: 'private_limited', label: 'Private limited company', hint: 'e.g. GmbH, SARL, SAS, BV, Ltd' },
        { id: 'public_limited', label: 'Public limited company', hint: 'e.g. AG, SE, SA, NV, plc' },
        { id: 'bank', label: 'Bank' },
        { id: 'insurer', label: 'Insurer' },
        { id: 'fund', label: 'Investment fund', hint: 'UCITS or alternative investment fund' },
        { id: 'something_else', label: 'Something else', hint: 'cooperative, foundation, partnership, public body …' },
        NOT_SURE_OPTION,
      ],
      typed: undefined,
    });
    expect(byId['C-4']).toEqual({ options: HEADCOUNT_OPTIONS, typed: { measure: 'headcount', label: 'Type the number' } });
    expect(byId['C-5']).toEqual({ options: MONEY_OPTIONS, typed: { measure: 'money', label: 'Type the figure' } });
    expect(byId['C-6']).toEqual({ options: YES_NO_OPTIONS, typed: undefined });
    expect(byId['C-7']).toEqual({ options: YES_NO_OPTIONS, typed: undefined });
    expect(byId['C-8']).toEqual({
      options: [
        { id: 'both', label: 'Yes, both years' },
        { id: 'recent_only', label: 'Only the most recent year' },
        { id: 'earlier_only', label: 'Only the year before' },
        { id: 'no', label: 'No' },
        NOT_SURE_OPTION,
      ],
      typed: undefined,
    });
    expect(byId['C-9']).toEqual(byId['C-4']);
    expect(byId['C-10']).toEqual(byId['C-5']);

    // Every option is an answer the schema accepts for its field.
    const refusedOptions = CHECK_QUESTIONS.flatMap((q) =>
      q.options
        .filter((o) => refused(q.field === 'parentOwnEmployees' || q.field === 'parentOwnTurnover' ? { group: 'parent', [q.field]: o.id } : { [q.field]: o.id, ...(o.id === 'other' ? { countryOther: 'AR' } : {}) }))
        .map((o) => `${q.id} ${o.id}`),
    );
    expect(refusedOptions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

describe('the schema (plan Task 3; ruling R8; ruling R10)', () => {
  it('refuses an unknown key; accepts the same answers without it', () => {
    expect(refused({ country: 'DE', colour: 'green' })).toBe(true);
    expect(refused({ country: 'DE' })).toBe(false);
  });

  it("refuses every removed key of today's checker", () => {
    const removed: Record<string, unknown> = {
      financialYear: '2027',
      governingChoice: 'same',
      governingState: 'DE',
      reportedFy2024: 'no',
      holding: 'no',
      legalForm: 'private_limited_company',
      groupPosition: 'standalone',
      exclusion: 'no',
    };
    expect(Object.keys(removed).filter((key) => !refused({ country: 'DE', [key]: removed[key] }))).toEqual([]);
  });

  it('takes every field of the plan, and only those', () => {
    const all = {
      country: 'other',
      countryOther: 'AR',
      group: 'both',
      organisation: 'private_limited',
      employees: 'over_1100',
      turnover: 'over_500m',
      pie: 'yes',
      parentReport: 'not_sure',
      euTurnover: 'no',
      parentOwnEmployees: { exact: 12.5 },
      parentOwnTurnover: { exact: 1_000_000.5 },
    };
    expect(Object.keys(accepted(all)).sort()).toEqual(Object.keys(all).sort());
  });

  it('refuses a country that is not listed, which must come through "Another country"', () => {
    expect(refused({ country: 'AR' })).toBe(true);
    expect(refused({ country: 'other', countryOther: 'AR' })).toBe(false);
  });

  describe('countryOther', () => {
    it('is required with "Another country"', () => {
      expect(refused({ country: 'other' })).toBe(true);
      expect(refused({ country: 'other', countryOther: 'AR' })).toBe(false);
    });
    it('is refused with any other country answer, or with none', () => {
      expect(refused({ country: 'US', countryOther: 'AR' })).toBe(true);
      expect(refused({ country: 'not_sure', countryOther: 'AR' })).toBe(true);
      expect(refused({ countryOther: 'AR' })).toBe(true);
      expect(refused({ country: 'US' })).toBe(false);
    });
    it('must be an ISO 3166-1 alpha-2 code', () => {
      expect(['XK', 'ZZ', 'UK', 'ar', 'ARG', ''].filter((code) => !refused({ country: 'other', countryOther: code }))).toEqual([]);
      expect(refused({ country: 'other', countryOther: 'IL' })).toBe(false);
    });
    it('refuses an EU code, because the EU list carries every Member State', () => {
      expect(EU_CODES.filter((code) => !refused({ country: 'other', countryOther: code }))).toEqual([]);
      expect(refused({ country: 'other', countryOther: 'NO' })).toBe(false);
    });
  });

  describe("the parent company's own figures (C-9, C-10)", () => {
    for (const field of ['parentOwnEmployees', 'parentOwnTurnover'] as const) {
      const answer = field === 'parentOwnEmployees' ? 'over_1100' : 'over_500m';
      it(`${field} is refused unless the group answer is a parent or both`, () => {
        for (const group of ['none', 'owned', 'not_sure', undefined] as const) {
          expect([group, refused(compact({ group, [field]: answer }))]).toEqual([group, true]);
        }
        for (const group of ['parent', 'both'] as const) {
          expect([group, refused({ group, [field]: answer })]).toEqual([group, false]);
        }
      });
    }
  });

  describe('typed figures', () => {
    const FIELDS = ['employees', 'turnover', 'parentOwnEmployees', 'parentOwnTurnover'] as const;
    const withFigure = (field: (typeof FIELDS)[number], figure: unknown) =>
      field.startsWith('parentOwn') ? { group: 'parent', [field]: figure } : { [field]: figure };

    it('refuse a negative or non-finite figure, in every field', () => {
      for (const field of FIELDS) {
        for (const exact of [-1, -0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
          expect([field, exact, refused(withFigure(field, { exact }))]).toEqual([field, exact, true]);
        }
        expect([field, refused(withFigure(field, { exact: 0 })), refused(withFigure(field, { exact: 480 }))]).toEqual([field, false, false]);
      }
    });
    it('refuse anything but a strict { exact: number }', () => {
      for (const field of FIELDS) {
        expect([field, refused(withFigure(field, { exact: 5, unit: 'EUR' }))]).toEqual([field, true]);
        expect([field, refused(withFigure(field, { exact: '5' }))]).toEqual([field, true]);
        expect([field, refused(withFigure(field, 5))]).toEqual([field, true]);
        expect([field, refused(withFigure(field, { exact: 5 }))]).toEqual([field, false]);
      }
    });
    it('money carries at most two decimals: 0.29, 1.1 and 450000000.01 accepted; 1.005, 0.001 and 1e-7 refused', () => {
      for (const field of ['turnover', 'parentOwnTurnover'] as const) {
        expect([0.29, 1.1, 450_000_000.01, 12, 0].map((exact) => refused(withFigure(field, { exact })))).toEqual([false, false, false, false, false]);
        expect([1.005, 0.001, 1e-7].map((exact) => refused(withFigure(field, { exact })))).toEqual([true, true, true]);
      }
    });
    it('headcount may carry any decimals (an average)', () => {
      for (const field of ['employees', 'parentOwnEmployees'] as const) {
        expect([1.005, 0.001, 1e-7, 480.123456].map((exact) => refused(withFigure(field, { exact })))).toEqual([false, false, false, false]);
      }
    });
  });

  it("refuses an answer from another question's list, or from today's checker", () => {
    expect(refused({ turnover: 'gt600' })).toBe(true);
    expect(refused({ turnover: 'over_1100' })).toBe(true);
    expect(refused({ employees: 'over_500m' })).toBe(true);
    expect(refused({ group: 'standalone' })).toBe(true);
    expect(refused({ euTurnover: 'one' })).toBe(true);
    expect(refused({ pie: 'unknown' })).toBe(true);
    expect(refused({ turnover: 'over_500m', employees: 'over_1100', group: 'none', euTurnover: 'recent_only', pie: 'not_sure' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Over every covering answer set
// ---------------------------------------------------------------------------

describe('over a covering set of answers', () => {
  it('every fact type the checker sets exists in the loaded pack, on the scope type the pack declares for it', () => {
    const pack = csrdPack();
    const declared = new Map(pack.factTypes.map((ft) => [ft.id, ft.scopeType]));
    const problems: string[] = [];
    const seen = new Set<string>();
    let scanned = 0;
    for (const answers of COVERING) {
      const profile = buildCheckProfile(answers);
      const typeOf = new Map(profile.scopeObjects.map((o) => [o.id, o.type]));
      for (const f of profile.facts) {
        scanned += 1;
        seen.add(f.factType);
        const scopeType = declared.get(f.factType);
        if (scopeType === undefined) problems.push(`${f.factType}: not a fact type of the pack`);
        else if (typeOf.get(f.scopeId) !== scopeType) problems.push(`${f.factType}: set on ${show(typeOf.get(f.scopeId))}, the pack declares ${scopeType}`);
      }
    }
    expect(problems).toEqual([]);
    // Positive control: the scan saw facts, and exactly the fact types §4.1 names.
    expect(scanned).toBeGreaterThan(COVERING.length);
    expect([...seen].sort()).toEqual([...FACT_TYPES_4_1].sort());
  });

  it('no accepted answer set produces two facts for one fact type and scope (ruling R12)', () => {
    const duplicates: string[] = [];
    let scanned = 0;
    for (const answers of COVERING) {
      const keys = buildCheckProfile(answers).facts.map((f) => `${f.factType} @ ${f.scopeId}`);
      scanned += keys.length;
      const repeated = keys.filter((key, i) => keys.indexOf(key) !== i);
      if (repeated.length > 0) duplicates.push(`${show(answers)}: ${repeated.join(', ')}`);
    }
    expect(duplicates.slice(0, 5)).toEqual([]);
    expect(scanned).toBeGreaterThan(COVERING.length);
  });

  it('no answer set produces entity.governing_member_state, a removed fact, or the listed_company form (ruling R10)', () => {
    const forbidden = ['entity.governing_member_state', 'entity.reported_csrd_fy2024', 'entity.is_financial_holding_undertaking'];
    const found: string[] = [];
    let scanned = 0;
    for (const answers of COVERING) {
      for (const f of buildCheckProfile(answers).facts) {
        scanned += 1;
        if (forbidden.includes(f.factType)) found.push(`${show(answers)}: ${f.factType}`);
        if (f.factType === 'entity.legal_form' && f.value.kind === 'string' && f.value.value === 'listed_company') found.push(`${show(answers)}: listed_company`);
      }
    }
    expect(found.slice(0, 5)).toEqual([]);
    // Positive control: the scan saw facts (the fact-types test above shows which).
    expect(scanned).toBeGreaterThan(COVERING.length);
  });
});

// ---------------------------------------------------------------------------
// The country lists
// ---------------------------------------------------------------------------

describe('the country lists', () => {
  it("the EU list is exactly the Member States the pack catalogues true", () => {
    const pack = csrdPack();
    const memberStates = Object.entries(pack.catalogues.eu_member_states!.entries)
      .filter(([, inEu]) => inEu)
      .map(([code]) => code)
      .sort();
    expect(memberStates).toHaveLength(27);
    expect(EU_COUNTRIES.map((c) => c.id).sort()).toEqual(memberStates);
  });

  it("the listed non-EU countries are today's fourteen, each catalogued false in the pack", () => {
    const entries = csrdPack().catalogues.eu_member_states!.entries;
    expect(NON_EU_COUNTRIES.map((c) => c.id)).toEqual([...LISTED_NON_EU]);
    expect(NON_EU_COUNTRIES.filter((c) => entries[c.id] !== false).map((c) => c.id)).toEqual([]);
  });

  it('the ISO list has 249 unique two-letter codes, and every listed code is in it under its countries.ts name', () => {
    const codes = ISO_COUNTRIES.map((c) => c.code);
    expect(codes).toHaveLength(249);
    expect(new Set(codes).size).toBe(249);
    expect(codes.filter((code) => !/^[A-Z]{2}$/.test(code))).toEqual([]);
    expect(ISO_COUNTRIES.filter((c) => c.name.trim() === '').map((c) => c.code)).toEqual([]);
    const listed = [...EU_COUNTRIES, ...NON_EU_COUNTRIES];
    expect(listed).toHaveLength(41);
    expect(listed.filter((c) => !codes.includes(c.id) || countryName(c.id) !== c.label).map((c) => c.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// One engine check: "Another country" with a code the pack does not catalogue
// ---------------------------------------------------------------------------

describe('"Another country" through the engine', () => {
  it('a code the pack does not catalogue reads catalogue_unknown; one it catalogues false reads does-not-apply', () => {
    const pack = csrdPack();
    const catalogue = pack.catalogues.eu_member_states!.entries;
    expect([catalogue.AR, catalogue.IL]).toEqual([undefined, false]);

    const individualScope = (countryOther: string) => {
      const answers = accepted({ country: 'other', countryOther, group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m' });
      const result = assess(pack, buildCheckProfile(answers), {
        assessmentDate: '2026-07-26',
        financialYear: { start: '2027-01-01', end: '2027-12-31' },
        subjectId: CHECK_ENTITY_ID,
      });
      return result.determinations.find((d) => d.requirementId === 'CSRD-S-001' && d.scopeId === CHECK_ENTITY_ID);
    };

    const uncatalogued = individualScope('AR');
    expect([uncatalogued?.result, uncatalogued?.reason]).toEqual(['INDETERMINATE', 'catalogue_unknown']);
    expect(uncatalogued?.needs).toContainEqual({ factType: 'entity.incorporation_country', scopeId: CHECK_ENTITY_ID, reason: 'catalogue_unknown' });
    expect(individualScope('IL')?.result).toBe('DOES_NOT_APPLY');
  });
});
