/**
 * The free checker's plain questions, and the facts each answer gives the
 * engine (QD-1; proposal §4.1, §4.3 and §4.4; DP1 plan, Task 3).
 *
 * **Why this module exists.** The checker's answers are the only facts the
 * engine sees about a visitor, and the ways they go wrong are silent:
 *
 * - **A figure stands in for another.** A group's headcount written as the
 *   company's own (or the reverse) moves a route with no error at all, because
 *   the engine keeps whichever fact it is given; a second fact for the same
 *   fact type and scope silently replaces the first (`engine/facts.ts`). So C-4
 *   and C-5 are scoped by the group answer (CD-5), C-9 and C-10 are refused
 *   unless the visitor is a parent, and no answer ever writes two facts for one
 *   key.
 * - **An unknown is dropped.** "Not sure" is stored as the engine's explicit
 *   unknown, from the source "Free check answer: not sure", in exactly one
 *   place below. A question never answered stores nothing, so "asked, not sure"
 *   and "never asked" stay distinct (§4.4; PRF-6).
 * - **A band is inexact.** A band's stored range must be true of every figure
 *   in it, and must give exactly §4.3's stated result against every threshold
 *   the pack holds. `bandGuardProblems` checks that against the loaded pack with
 *   the engine's own comparison, so a new threshold is reviewed, not passed.
 *
 * **Mapping and visibility are separate.** `buildCheckProfile` sets a
 * question's facts whenever its answer is present; whether a question is shown
 * is decided only by `visibleQuestions` (Task 4's question guard poses a hidden
 * question's answers through this seam).
 *
 * **Why the engine is imported this way.** A client component (`CheckFlow`)
 * imports this module, and the engine's index pulls in the loader and
 * `node:fs`. So the engine is imported for types only, and `cmpRange` is taken
 * from `condition/evaluate`, which itself imports types only (as `lib/evidence`
 * deep-imports engine source). Neither `@/lib/pack` nor `server-only` is
 * imported here.
 */

import { z } from 'zod';
import type { FactValue, KnowledgePack, Profile, ProfileFact, Truth } from '@datastrata/engine';
import { cmpRange } from '../../../backend/engine/src/condition/evaluate';
import { countryName, ISO_COUNTRIES, isIsoCountryCode } from './countries';

export interface AnswerOption {
  id: string;
  label: string;
  hint?: string;
}

// ---------------------------------------------------------------------------
// Countries (C-1)
// ---------------------------------------------------------------------------

/** The 27 Member States, in the order today's checker lists them. */
export const EU_COUNTRY_CODES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'] as const;

/** The 14 non-EU countries today's checker lists. Every other country comes through "Another country". */
export const LISTED_NON_EU_COUNTRY_CODES = ['GB', 'US', 'CH', 'NO', 'IN', 'CN', 'JP', 'TR', 'BR', 'CA', 'AU', 'ZA', 'KR', 'AE'] as const;

type EuCode = (typeof EU_COUNTRY_CODES)[number];
type ListedCountryCode = EuCode | (typeof LISTED_NON_EU_COUNTRY_CODES)[number];

const EU_CODE_SET: ReadonlySet<string> = new Set(EU_COUNTRY_CODES);
const isEuCode = (code: string): boolean => EU_CODE_SET.has(code);

function named(code: string): AnswerOption {
  const label = countryName(code);
  if (label === undefined) throw new Error(`${code} is not an ISO 3166-1 alpha-2 code`);
  return { id: code, label };
}

export const EU_COUNTRIES: readonly AnswerOption[] = EU_COUNTRY_CODES.map(named);
export const NON_EU_COUNTRIES: readonly AnswerOption[] = LISTED_NON_EU_COUNTRY_CODES.map(named);

/** "Another country": every ISO code except the Member States, which the EU list already carries. */
export const OTHER_COUNTRIES: readonly AnswerOption[] = ISO_COUNTRIES.filter((c) => !isEuCode(c.code)).map((c) => ({ id: c.code, label: c.name }));

// ---------------------------------------------------------------------------
// The legal thresholds the questions' visibility reads (stated once)
// ---------------------------------------------------------------------------

/** CSRD Article 5(2)(a): more than 500 employees, the 2024–26 first wave. */
export const FIRST_WAVE_EMPLOYEES = 500;
/** Articles 19a(1) and 29a(1): more than 1,000 employees. */
export const LARGE_EMPLOYEES = 1_000;
/** Articles 19a(1), 29a(1) and 40a(1): more than €450 million. */
export const TURNOVER_EUR = 450_000_000;

/** §4.3: the largest exact integer the engine's number type holds, for "no upper bound stated". */
export const NO_UPPER_BOUND = 9007199254740991;

// ---------------------------------------------------------------------------
// The bands (§4.3)
// ---------------------------------------------------------------------------

/** A band's result against a threshold, as §4.3's tables state it: "No", "Cannot tell", "Yes". */
export type StatedResult = 'no' | 'cannot_tell' | 'yes';

/**
 * A band's meaning as a half-open interval: the lower end is inclusive for the
 * first band and exclusive after it; the upper end is inclusive, or absent.
 */
export interface BandMeaning {
  lower: number;
  lowerInclusive: boolean;
  upper: number | null;
}

export interface Band {
  id: string;
  label: string;
  meaning: BandMeaning;
  /** The engine range stored for every figure in the band. */
  stored: { min: number; max: number };
  /** The stated result for exceeding each legal threshold, keyed by the threshold. */
  exceeds: Readonly<Record<number, StatedResult>>;
}

/** A set of bands, and the fact types its stored ranges are written to. */
export interface BandSet {
  name: string;
  /** Headcount is continuous (an average); money is reported in whole cents. */
  measure: 'headcount' | 'money';
  factTypes: readonly string[];
  bands: readonly Band[];
}

/** §4.3, "Average employees". Closed ranges: a shared end point is never a threshold. */
export const EMPLOYEE_BANDS = [
  {
    id: '450_or_fewer',
    label: '450 or fewer',
    meaning: { lower: 0, lowerInclusive: true, upper: 450 },
    stored: { min: 0, max: 450 },
    exceeds: { [FIRST_WAVE_EMPLOYEES]: 'no', [LARGE_EMPLOYEES]: 'no' },
  },
  {
    id: 'over_450_up_to_550',
    label: 'More than 450, up to 550 (about 500)',
    meaning: { lower: 450, lowerInclusive: false, upper: 550 },
    stored: { min: 450, max: 550 },
    exceeds: { [FIRST_WAVE_EMPLOYEES]: 'cannot_tell', [LARGE_EMPLOYEES]: 'no' },
  },
  {
    id: 'over_550_up_to_900',
    label: 'More than 550, up to 900',
    meaning: { lower: 550, lowerInclusive: false, upper: 900 },
    stored: { min: 550, max: 900 },
    exceeds: { [FIRST_WAVE_EMPLOYEES]: 'yes', [LARGE_EMPLOYEES]: 'no' },
  },
  {
    id: 'over_900_up_to_1100',
    label: 'More than 900, up to 1,100 (about 1,000)',
    meaning: { lower: 900, lowerInclusive: false, upper: 1_100 },
    stored: { min: 900, max: 1_100 },
    exceeds: { [FIRST_WAVE_EMPLOYEES]: 'yes', [LARGE_EMPLOYEES]: 'cannot_tell' },
  },
  {
    id: 'over_1100',
    label: 'More than 1,100',
    meaning: { lower: 1_100, lowerInclusive: false, upper: null },
    stored: { min: 1_100, max: NO_UPPER_BOUND },
    exceeds: { [FIRST_WAVE_EMPLOYEES]: 'yes', [LARGE_EMPLOYEES]: 'yes' },
  },
] as const satisfies readonly Band[];

/** §4.3, "Net turnover, EUR". After the first band, each starts one cent above the band before. */
export const TURNOVER_BANDS = [
  {
    id: 'up_to_400m',
    label: 'Up to €400 million',
    meaning: { lower: 0, lowerInclusive: true, upper: 400_000_000 },
    stored: { min: 0, max: 400_000_000 },
    exceeds: { [TURNOVER_EUR]: 'no' },
  },
  {
    id: 'over_400m_up_to_500m',
    label: 'More than €400m, up to €500m (about €450m)',
    meaning: { lower: 400_000_000, lowerInclusive: false, upper: 500_000_000 },
    stored: { min: 400_000_000.01, max: 500_000_000 },
    exceeds: { [TURNOVER_EUR]: 'cannot_tell' },
  },
  {
    id: 'over_500m',
    label: 'More than €500 million',
    meaning: { lower: 500_000_000, lowerInclusive: false, upper: null },
    stored: { min: 500_000_000.01, max: NO_UPPER_BOUND },
    exceeds: { [TURNOVER_EUR]: 'yes' },
  },
] as const satisfies readonly Band[];

/** §4.3, "EU turnover for Art 40a": the two values a year can take, "under" and "over" €450m. */
export const EU_TURNOVER_YEAR_BANDS = [
  {
    id: 'up_to_450m',
    label: 'Up to €450 million',
    meaning: { lower: 0, lowerInclusive: true, upper: 450_000_000 },
    stored: { min: 0, max: 450_000_000 },
    exceeds: { [TURNOVER_EUR]: 'no' },
  },
  {
    id: 'over_450m',
    label: 'More than €450 million',
    meaning: { lower: 450_000_000, lowerInclusive: false, upper: null },
    stored: { min: 450_000_000.01, max: NO_UPPER_BOUND },
    exceeds: { [TURNOVER_EUR]: 'yes' },
  },
] as const satisfies readonly Band[];

const rangeOf = (band: Band): FactValue => ({ kind: 'range', min: band.stored.min, max: band.stored.max });
const UNDER_450M = rangeOf(EU_TURNOVER_YEAR_BANDS[0]);
const OVER_450M = rangeOf(EU_TURNOVER_YEAR_BANDS[1]);

/** One C-8 answer: what it stores for each year, and the gate §4.3 states for it. */
export interface EuTurnoverAnswer {
  id: string;
  label: string;
  /** The most recent financial year. */
  year1: FactValue;
  /** The year before. */
  year2: FactValue;
  gate: 'met' | 'not_met' | 'missing';
}

/** §4.3's third table. The two "only" answers name the year, so nothing is invented. */
export const EU_TURNOVER_ANSWERS = [
  { id: 'both', label: 'Yes, both years', year1: OVER_450M, year2: OVER_450M, gate: 'met' },
  { id: 'recent_only', label: 'Only the most recent year', year1: OVER_450M, year2: UNDER_450M, gate: 'not_met' },
  { id: 'earlier_only', label: 'Only the year before', year1: UNDER_450M, year2: OVER_450M, gate: 'not_met' },
  { id: 'no', label: 'No', year1: UNDER_450M, year2: UNDER_450M, gate: 'not_met' },
  { id: 'not_sure', label: 'Not sure', year1: { kind: 'unknown' }, year2: { kind: 'unknown' }, gate: 'missing' },
] as const satisfies readonly EuTurnoverAnswer[];

/** The fact types the banded answers are written to. */
const FACT = {
  entityEmployees: 'entity.avg_employees',
  groupEmployees: 'group.avg_employees',
  entityTurnover: 'entity.net_turnover_eur',
  groupTurnover: 'group.consolidated_net_turnover_eur',
  euTurnoverYear1: 'third_country.eu_turnover_year_1_eur',
  euTurnoverYear2: 'third_country.eu_turnover_year_2_eur',
} as const;

/** Every band set, each declaring the fact types it stands for: the band guard's input. */
export const CHECK_BAND_SETS: readonly BandSet[] = [
  { name: 'employees', measure: 'headcount', factTypes: [FACT.entityEmployees, FACT.groupEmployees], bands: EMPLOYEE_BANDS },
  { name: 'turnover', measure: 'money', factTypes: [FACT.entityTurnover, FACT.groupTurnover], bands: TURNOVER_BANDS },
  { name: 'eu_turnover', measure: 'money', factTypes: [FACT.euTurnoverYear1, FACT.euTurnoverYear2], bands: EU_TURNOVER_YEAR_BANDS },
];

// ---------------------------------------------------------------------------
// The answers, and their schema
// ---------------------------------------------------------------------------

type EmployeeBandId = (typeof EMPLOYEE_BANDS)[number]['id'];
type TurnoverBandId = (typeof TURNOVER_BANDS)[number]['id'];
type EuTurnoverAnswerId = (typeof EU_TURNOVER_ANSWERS)[number]['id'];

const COUNTRY_ANSWERS = [...EU_COUNTRY_CODES, ...LISTED_NON_EU_COUNTRY_CODES, 'other', 'not_sure'] as const;
const GROUP_ANSWERS = ['none', 'parent', 'owned', 'both', 'not_sure'] as const;
const ORGANISATION_ANSWERS = ['private_limited', 'public_limited', 'bank', 'insurer', 'fund', 'something_else', 'not_sure'] as const;
const YES_NO_ANSWERS = ['yes', 'no', 'not_sure'] as const;

/**
 * Decimal places of a number as written in its shortest round-trip form.
 *
 * Multiplying by 100 and testing for an integer misreads binary fractions
 * (`0.29 * 100` is not an integer), so the count is read from the decimal
 * digits JavaScript itself prints, exponent included (`1e-7` has seven).
 */
function decimalPlaces(x: number): number {
  const match = /^-?\d+(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(x));
  if (match === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, (match[1]?.length ?? 0) - Number(match[2] ?? 0));
}

const typedFigure = z.number().finite().nonnegative();
/** A headcount may be an average with any number of decimals. */
const typedHeadcount = z.object({ exact: typedFigure }).strict();
/** Money is reported in whole cents at most. */
const typedMoney = z
  .object({ exact: typedFigure.refine((x) => decimalPlaces(x) <= 2, 'money is stated in whole cents: at most two decimals') })
  .strict();

const headcountAnswer = z.union([z.enum<EmployeeBandId | 'not_sure', [EmployeeBandId | 'not_sure', ...EmployeeBandId[]]>(['not_sure', ...EMPLOYEE_BANDS.map((b) => b.id)]), typedHeadcount]);
const moneyAnswer = z.union([z.enum<TurnoverBandId | 'not_sure', [TurnoverBandId | 'not_sure', ...TurnoverBandId[]]>(['not_sure', ...TURNOVER_BANDS.map((b) => b.id)]), typedMoney]);
const yesNoAnswer = z.enum(YES_NO_ANSWERS);

const answersObject = z
  .object({
    country: z.enum(COUNTRY_ANSWERS).optional(),
    countryOther: z
      .string()
      .refine(isIsoCountryCode, 'not an ISO 3166-1 alpha-2 code')
      .refine((code) => !isEuCode(code), 'a Member State is chosen from the EU list, not as another country')
      .optional(),
    group: z.enum(GROUP_ANSWERS).optional(),
    organisation: z.enum(ORGANISATION_ANSWERS).optional(),
    employees: headcountAnswer.optional(),
    turnover: moneyAnswer.optional(),
    pie: yesNoAnswer.optional(),
    parentReport: yesNoAnswer.optional(),
    euTurnover: z.enum(EU_TURNOVER_ANSWERS.map((a) => a.id) as [EuTurnoverAnswerId, ...EuTurnoverAnswerId[]]).optional(),
    parentOwnEmployees: headcountAnswer.optional(),
    parentOwnTurnover: moneyAnswer.optional(),
  })
  .strict();

/**
 * The visitor's answers: strict at every level, so a key from today's checker
 * (`financialYear`, `governingState`, `holding`, …) or any other unknown key is
 * refused rather than stripped.
 */
export const checkerAnswersSchema = answersObject.superRefine((a, ctx) => {
  if (a.country === 'other' && a.countryOther === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['countryOther'], message: '"Another country" needs the country\'s ISO code' });
  }
  if (a.country !== 'other' && a.countryOther !== undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['countryOther'], message: 'countryOther is answered only with "Another country"' });
  }
  // C-9 and C-10 write the entity's own figures. Anywhere but a parent, C-4 and
  // C-5 already write them, and the engine would silently keep the later one.
  for (const field of ['parentOwnEmployees', 'parentOwnTurnover'] as const) {
    if (a[field] !== undefined && a.group !== 'parent' && a.group !== 'both') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is asked only of a parent or an intermediate parent` });
    }
  }
});

/** One field per question, each optional; one definition, inferred from the schema. */
export type CheckerAnswers = z.infer<typeof checkerAnswersSchema>;

type HeadcountAnswer = NonNullable<CheckerAnswers['employees']>;
type MoneyAnswer = NonNullable<CheckerAnswers['turnover']>;

// ---------------------------------------------------------------------------
// The questions (§4.1)
// ---------------------------------------------------------------------------

export type QuestionId = 'C-1' | 'C-2' | 'C-3' | 'C-4' | 'C-5' | 'C-6' | 'C-7' | 'C-8' | 'C-9' | 'C-10';
export type AnswerField = Exclude<keyof CheckerAnswers, 'countryOther'>;

/** The plain wording, by group position where §4.1 varies it. */
export interface QuestionWording {
  default: string;
  parent?: string;
  both?: string;
}

export interface CheckQuestion {
  id: QuestionId;
  /** The answer's field in `CheckerAnswers`. C-1's "Another country" adds `countryOther`, chosen from `OTHER_COUNTRIES`. */
  field: AnswerField;
  wording: QuestionWording;
  hint?: string;
  options: readonly AnswerOption[];
  /** C-4, C-5, C-9 and C-10 also take a typed figure, `{ exact }`. */
  typed?: { measure: 'headcount' | 'money'; label: string };
}

const NOT_SURE_OPTION: AnswerOption = { id: 'not_sure', label: 'Not sure' };
const YES_NO_OPTIONS: readonly AnswerOption[] = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }, NOT_SURE_OPTION];
const bandOptions = (bands: readonly Band[]): AnswerOption[] => [...bands.map((b) => ({ id: b.id, label: b.label })), NOT_SURE_OPTION];

const C4_HINT = 'The average for the year, as your accounts state it';
const C5_HINT = "Revenue after rebates and VAT; banks and insurers, we'll confirm the right figure later";
const C6 =
  'Is your company a public-interest entity? That means its shares or bonds are admitted to trading on an EU regulated market (growth markets and other multilateral trading facilities do not count), it is a bank or an insurer, or its country has designated it a public-interest entity. Your auditor will know.';
const HEADCOUNT_TYPED = { measure: 'headcount', label: 'Type the number' } as const;
const MONEY_TYPED = { measure: 'money', label: 'Type the figure' } as const;

/**
 * C-1 to C-10, worded as §4.1 words them. C-5's sentences are drafted (§4.1
 * gives none: "scoped exactly as C-4"); Task 5 brings them for approval.
 */
export const CHECK_QUESTIONS: readonly CheckQuestion[] = [
  {
    id: 'C-1',
    field: 'country',
    wording: { default: 'Where is your company registered?' },
    options: [...EU_COUNTRIES, ...NON_EU_COUNTRIES, { id: 'other', label: 'Another country' }, NOT_SURE_OPTION],
  },
  {
    id: 'C-2',
    field: 'group',
    wording: { default: 'Is your company part of a group?' },
    options: [
      { id: 'none', label: 'No' },
      { id: 'parent', label: 'Yes, we are the parent (top) company' },
      { id: 'owned', label: 'Yes, another company owns us' },
      { id: 'both', label: 'Yes, we own companies and another company owns us' },
      NOT_SURE_OPTION,
    ],
  },
  {
    id: 'C-3',
    field: 'organisation',
    wording: { default: 'What kind of organisation is it?' },
    options: [
      { id: 'private_limited', label: 'Private limited company', hint: 'e.g. GmbH, SARL, SAS, BV, Ltd' },
      { id: 'public_limited', label: 'Public limited company', hint: 'e.g. AG, SE, SA, NV, plc' },
      { id: 'bank', label: 'Bank' },
      { id: 'insurer', label: 'Insurer' },
      { id: 'fund', label: 'Investment fund', hint: 'UCITS or alternative investment fund' },
      { id: 'something_else', label: 'Something else', hint: 'cooperative, foundation, partnership, public body …' },
      NOT_SURE_OPTION,
    ],
  },
  {
    id: 'C-4',
    field: 'employees',
    wording: {
      default: 'About how many people work for your company?',
      parent: 'About how many people work across the whole group?',
      both: 'About how many people work in your company and the companies it owns?',
    },
    hint: C4_HINT,
    options: bandOptions(EMPLOYEE_BANDS),
    typed: HEADCOUNT_TYPED,
  },
  {
    id: 'C-5',
    field: 'turnover',
    wording: {
      default: 'About how much turnover does your company have in a year?',
      parent: 'About how much turnover does the whole group have in a year?',
      both: 'About how much turnover do your company and the companies it owns have in a year?',
    },
    hint: C5_HINT,
    options: bandOptions(TURNOVER_BANDS),
    typed: MONEY_TYPED,
  },
  {
    id: 'C-6',
    field: 'pie',
    wording: { default: C6, parent: C6.replace('Is your company', 'Is the parent company') },
    options: YES_NO_OPTIONS,
  },
  {
    id: 'C-7',
    field: 'parentReport',
    wording: { default: 'Does your parent company publish a group sustainability report that includes your company?' },
    options: YES_NO_OPTIONS,
  },
  {
    id: 'C-8',
    field: 'euTurnover',
    wording: { default: "Has your group's turnover from the EU been more than €450 million in each of the last two financial years?" },
    options: EU_TURNOVER_ANSWERS.map((a) => ({ id: a.id, label: a.label })),
  },
  {
    id: 'C-9',
    field: 'parentOwnEmployees',
    wording: { default: 'How many people does the parent company itself employ?' },
    hint: C4_HINT,
    options: bandOptions(EMPLOYEE_BANDS),
    typed: HEADCOUNT_TYPED,
  },
  {
    id: 'C-10',
    field: 'parentOwnTurnover',
    wording: { default: "And the parent company's own turnover?" },
    hint: C5_HINT,
    options: bandOptions(TURNOVER_BANDS),
    typed: MONEY_TYPED,
  },
];

/** The sentence to ask, given the group position answered so far. */
export function questionWording(id: QuestionId, answers: CheckerAnswers): string {
  const question = CHECK_QUESTIONS.find((q) => q.id === id);
  if (question === undefined) throw new Error(`no question ${id}`);
  const { wording } = question;
  if (answers.group === 'parent' && wording.parent !== undefined) return wording.parent;
  if (answers.group === 'both' && wording.both !== undefined) return wording.both;
  return wording.default;
}

// ---------------------------------------------------------------------------
// Which questions are shown (§4.1 "Shown when"; §4.5)
// ---------------------------------------------------------------------------

export interface VisibleQuestion {
  id: QuestionId;
  /** C-9 and C-10: offered on the result ("Check the parent company on its own too") to a parent that is not a fund, never required. */
  optional: boolean;
}

const isEuAnswer = (a: CheckerAnswers): boolean => a.country !== undefined && isEuCode(a.country);
/** Every Member State is listed, so a typed country is non-EU (§4.1, C-8). */
const isNonEuAnswer = (a: CheckerAnswers): boolean =>
  a.country === 'other' || (a.country !== undefined && a.country !== 'not_sure' && !isEuCode(a.country));

/**
 * Whether a figure answer could exceed a threshold: a band whose upper end lies
 * above it, a typed figure above it, "Not sure", or no answer yet.
 */
function couldExceed(answer: HeadcountAnswer | MoneyAnswer | undefined, bands: readonly Band[], threshold: number): boolean {
  if (answer === undefined || answer === 'not_sure') return true;
  if (typeof answer === 'object') return answer.exact > threshold;
  const band = bands.find((b) => b.id === answer);
  if (band === undefined) throw new Error(`no band ${answer}`);
  return band.meaning.upper === null || band.meaning.upper > threshold;
}

/**
 * The company's own first-application route (S-017) could be met in some start
 * year shown: the public-interest answer is not "No" and the headcount could
 * exceed 500 (2025–26), or the headcount could exceed 1,000 and the turnover
 * €450 million (2027–28). An absent public-interest answer is not "No".
 */
function firstApplicationCouldBeMet(a: CheckerAnswers, employees: HeadcountAnswer | undefined, turnover: MoneyAnswer | undefined): boolean {
  return (
    (a.pie !== 'no' && couldExceed(employees, EMPLOYEE_BANDS, FIRST_WAVE_EMPLOYEES)) ||
    (couldExceed(employees, EMPLOYEE_BANDS, LARGE_EMPLOYEES) && couldExceed(turnover, TURNOVER_BANDS, TURNOVER_EUR))
  );
}

/**
 * C-7 (DG-19, option B): only where an exemption could relieve a route that
 * could be met. An owned company on its own figures (C-4, C-5); an
 * intermediate parent on its own figures (C-9, C-10) or its sub-group's (C-4,
 * C-5). Never a fund, never outside the EU.
 */
function asksParentReport(a: CheckerAnswers): boolean {
  if (a.group === 'owned') return firstApplicationCouldBeMet(a, a.employees, a.turnover);
  if (a.group === 'both') {
    return firstApplicationCouldBeMet(a, a.parentOwnEmployees, a.parentOwnTurnover) || firstApplicationCouldBeMet(a, a.employees, a.turnover);
  }
  return false;
}

/** The questions to show for the answers so far, in order C-1 to C-10. */
export function visibleQuestions(answers: CheckerAnswers): VisibleQuestion[] {
  const shown: VisibleQuestion[] = [];
  const show = (id: QuestionId, optional = false) => shown.push({ id, optional });
  const eu = isEuAnswer(answers);
  const fund = answers.organisation === 'fund';
  const parent = answers.group === 'parent' || answers.group === 'both';

  show('C-1');
  show('C-2');
  if (eu) {
    show('C-3');
    show('C-4');
    show('C-5');
  }
  // C-6 matters only where C-4's answer could exceed 500 (the first wave).
  if (eu && !fund && couldExceed(answers.employees, EMPLOYEE_BANDS, FIRST_WAVE_EMPLOYEES)) show('C-6');
  if (eu && !fund && asksParentReport(answers)) show('C-7');
  if (isNonEuAnswer(answers)) show('C-8');
  // Not for a fund: Article 1(4) settles its own route whatever its figures.
  if (eu && parent && !fund) {
    show('C-9', true);
    show('C-10', true);
  }
  return shown;
}

// ---------------------------------------------------------------------------
// The engine profile
// ---------------------------------------------------------------------------

/** The scope objects' ids, as today's checker has them; Task 4 sets `subjectId` to the entity. */
export const CHECK_ORGANISATION_ID = 'org1';
export const CHECK_ENTITY_ID = 'e1';

const ANSWER_SOURCE = 'Free check answer';
const NOT_SURE_SOURCE = 'Free check answer: not sure';
/** Ruling R4: where the "not an investment fund" label lives on a fact. */
const NOT_A_FUND_SOURCE = 'Free check answer: not an investment fund';

/** "Not sure", before it becomes a fact. */
const NOT_SURE: unique symbol = Symbol('not sure');
type Stated = FactValue | typeof NOT_SURE;

const bool = (value: boolean): FactValue => ({ kind: 'boolean', value });
const str = (value: string): FactValue => ({ kind: 'string', value });

/** C-2 (ruling R6). */
const GROUP_FACTS: Record<NonNullable<CheckerAnswers['group']>, { parent: Stated; subsidiary: Stated }> = {
  none: { parent: bool(false), subsidiary: bool(false) },
  parent: { parent: bool(true), subsidiary: bool(false) },
  owned: { parent: bool(false), subsidiary: bool(true) },
  both: { parent: bool(true), subsidiary: bool(true) },
  not_sure: { parent: NOT_SURE, subsidiary: NOT_SURE },
};

/** C-3: the legal form and the Article 1(4) exclusion, with the source each is labelled with. */
interface OrganisationFacts {
  legalForm: Stated;
  excluded: Stated;
  excludedSource: string;
}
const notAFund = (legalForm: string): OrganisationFacts => ({ legalForm: str(legalForm), excluded: bool(false), excludedSource: NOT_A_FUND_SOURCE });
const ORGANISATION_FACTS: Record<NonNullable<CheckerAnswers['organisation']>, OrganisationFacts> = {
  private_limited: notAFund('private_limited_company'),
  public_limited: notAFund('public_limited_company'),
  bank: notAFund('credit_institution'),
  insurer: notAFund('insurance_undertaking'),
  // A catalogue miss: the size routes stay open rather than being decided by a guess.
  something_else: notAFund('other'),
  // Ruling R3: the answer names no legal form, and an unknown never decides a
  // route; Article 1(4) decides the fund's routes regardless.
  fund: { legalForm: { kind: 'unknown' }, excluded: bool(true), excludedSource: ANSWER_SOURCE },
  not_sure: { legalForm: NOT_SURE, excluded: NOT_SURE, excludedSource: ANSWER_SOURCE },
};

/** A figure answer, stored exactly: a band's range, a typed figure as entered, or "Not sure". */
function figure(answer: HeadcountAnswer | MoneyAnswer, bands: readonly Band[]): Stated {
  if (answer === 'not_sure') return NOT_SURE;
  if (typeof answer === 'object') return { kind: 'number', value: answer.exact };
  const band = bands.find((b) => b.id === answer);
  if (band === undefined) throw new Error(`no band ${answer}`);
  return rangeOf(band);
}

const yesNo = (answer: NonNullable<CheckerAnswers['pie']>): Stated =>
  answer === 'not_sure' ? NOT_SURE : bool(answer === 'yes');

/** C-1's stored value, which C-8 mirrors as the ultimate parent's country. */
function countryOf(a: CheckerAnswers): Stated | undefined {
  if (a.country === undefined) return undefined;
  if (a.country === 'not_sure') return NOT_SURE;
  if (a.country === 'other') return a.countryOther === undefined ? undefined : str(a.countryOther);
  return str(a.country satisfies ListedCountryCode);
}

/**
 * The engine profile for a visitor's answers: an organisation, and the
 * visitor's legal entity under it, with one confirmed customer statement per
 * fact. Each question's facts are set whenever its answer is present, whether
 * or not the question is shown; an absent answer sets nothing.
 */
export function buildCheckProfile(answers: CheckerAnswers): Profile {
  const facts: ProfileFact[] = [];

  /** The one place an answer becomes a fact, and the one place "Not sure" becomes the engine's unknown. */
  const put = (factType: string, scopeId: string, value: Stated, ref: string = ANSWER_SOURCE): void => {
    const known = value !== NOT_SURE;
    facts.push({
      factType,
      scopeId,
      value: known ? value : { kind: 'unknown' },
      confirmed: true,
      source: { kind: 'customer_statement', ref: known ? ref : NOT_SURE_SOURCE },
    });
  };

  // C-1
  const country = countryOf(answers);
  if (country !== undefined) put('entity.incorporation_country', CHECK_ENTITY_ID, country);

  // C-2
  if (answers.group !== undefined) {
    const group = GROUP_FACTS[answers.group];
    put('entity.is_parent_undertaking', CHECK_ENTITY_ID, group.parent);
    put('entity.is_subsidiary', CHECK_ENTITY_ID, group.subsidiary);
  }

  // C-3
  if (answers.organisation !== undefined) {
    const organisation = ORGANISATION_FACTS[answers.organisation];
    put('entity.legal_form', CHECK_ENTITY_ID, organisation.legalForm);
    put('entity.excluded_by_article_1_4', CHECK_ENTITY_ID, organisation.excluded, organisation.excludedSource);
  }

  // C-4 and C-5, scoped (CD-5): the group's figures for a parent or an
  // intermediate parent, the company's own otherwise. Never both.
  const groupFigures = answers.group === 'parent' || answers.group === 'both';
  if (answers.employees !== undefined) {
    put(groupFigures ? FACT.groupEmployees : FACT.entityEmployees, groupFigures ? CHECK_ORGANISATION_ID : CHECK_ENTITY_ID, figure(answers.employees, EMPLOYEE_BANDS));
  }
  if (answers.turnover !== undefined) {
    put(groupFigures ? FACT.groupTurnover : FACT.entityTurnover, groupFigures ? CHECK_ORGANISATION_ID : CHECK_ENTITY_ID, figure(answers.turnover, TURNOVER_BANDS));
  }

  // C-6 and C-7
  if (answers.pie !== undefined) put('entity.is_public_interest_entity', CHECK_ENTITY_ID, yesNo(answers.pie));
  if (answers.parentReport !== undefined) put('parent.report_includes_entity', CHECK_ENTITY_ID, yesNo(answers.parentReport));

  // C-8: both years on the organisation, per §4.3; and, where the visitor is
  // the top of its own group, the ultimate parent's country is C-1's.
  if (answers.euTurnover !== undefined) {
    const answer = EU_TURNOVER_ANSWERS.find((a) => a.id === answers.euTurnover);
    if (answer === undefined) throw new Error(`no EU-turnover answer ${answers.euTurnover}`);
    const notSure = answers.euTurnover === 'not_sure';
    put(FACT.euTurnoverYear1, CHECK_ORGANISATION_ID, notSure ? NOT_SURE : answer.year1);
    put(FACT.euTurnoverYear2, CHECK_ORGANISATION_ID, notSure ? NOT_SURE : answer.year2);
    if ((answers.group === 'none' || answers.group === 'parent') && country !== undefined) {
      put('group.ultimate_parent_country', CHECK_ORGANISATION_ID, country);
    }
  }

  // C-9 and C-10: the parent company's own figures, on the entity. The schema
  // admits them only for a parent, whose C-4 and C-5 are on the organisation.
  if (answers.parentOwnEmployees !== undefined) put(FACT.entityEmployees, CHECK_ENTITY_ID, figure(answers.parentOwnEmployees, EMPLOYEE_BANDS));
  if (answers.parentOwnTurnover !== undefined) put(FACT.entityTurnover, CHECK_ENTITY_ID, figure(answers.parentOwnTurnover, TURNOVER_BANDS));

  return {
    scopeObjects: [
      { id: CHECK_ORGANISATION_ID, type: 'organization', name: 'Your organisation' },
      { id: CHECK_ENTITY_ID, type: 'legal_entity', name: 'Your entity', parentId: CHECK_ORGANISATION_ID },
    ],
    facts,
  };
}

// ---------------------------------------------------------------------------
// The band guard (§4.3)
// ---------------------------------------------------------------------------

/** One comparison of a banded fact type with a numeric threshold, found in the pack. */
export interface BandedThreshold {
  requirementId: string;
  factType: string;
  /** The comparison operator (`gt`, `lte`, …). */
  op: string;
  value: number;
}

/**
 * Every comparison in the pack between one of `factTypes` and a numeric
 * threshold, in every requirement's condition and every selection case.
 *
 * The walk is structural: it visits every object and recurses into all of its
 * values, naming no nesting operator, so an operator added to the condition
 * language later cannot hide a threshold from it.
 */
export function findBandedThresholds(pack: KnowledgePack, factTypes: readonly string[]): BandedThreshold[] {
  const wanted = new Set(factTypes);
  const found: BandedThreshold[] = [];
  const visit = (node: unknown, requirementId: string): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, requirementId);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (
      typeof record.op === 'string' &&
      typeof record.fact === 'string' &&
      wanted.has(record.fact) &&
      typeof record.cmp === 'string' &&
      typeof record.value === 'number'
    ) {
      found.push({ requirementId, factType: record.fact, op: record.cmp, value: record.value });
    }
    for (const child of Object.values(record)) visit(child, requirementId);
  };
  for (const requirement of pack.requirements) {
    visit(requirement.condition, requirement.id);
    for (const selection of requirement.cases ?? []) visit(selection.when, requirement.id);
  }
  return found;
}

const STATED_TRUTH: Record<StatedResult, Truth> = { no: 'DOES_NOT_APPLY', cannot_tell: 'INDETERMINATE', yes: 'APPLIES' };
const SAID: Record<Truth, string> = { DOES_NOT_APPLY: 'does not exceed', INDETERMINATE: 'cannot tell', APPLIES: 'exceeds' };
const negate = (truth: Truth): Truth => (truth === 'APPLIES' ? 'DOES_NOT_APPLY' : truth === 'DOES_NOT_APPLY' ? 'APPLIES' : truth);

/** Whether each band's stored range holds every reportable value of its meaning, and no more than a cent below it. */
function containmentProblems(set: BandSet): string[] {
  const problems: string[] = [];
  for (const band of set.bands) {
    const { lower, lowerInclusive, upper } = band.meaning;
    const { min, max } = band.stored;
    if (set.measure === 'money' && !lowerInclusive) {
      // Whole cents: the first reportable amount above the lower end, exactly.
      const oneCentAbove = (Math.round(lower * 100) + 1) / 100;
      if (min !== oneCentAbove) problems.push(`band '${band.id}': expected stored min = ${oneCentAbove} (one cent above ${lower}), found ${min}`);
    } else if (!(min <= lower)) {
      problems.push(`band '${band.id}': expected stored min ≤ ${lower}, found ${min}`);
    }
    if (upper === null) {
      if (max !== NO_UPPER_BOUND) problems.push(`band '${band.id}': expected stored max = ${NO_UPPER_BOUND} (no upper bound), found ${max}`);
    } else if (!(max >= upper)) {
      problems.push(`band '${band.id}': expected stored max ≥ ${upper}, found ${max}`);
    }
  }
  return problems;
}

/**
 * Every way the bands could misreport against the pack's thresholds:
 *
 * 1. the engine's `cmpRange` over a band's stored range differs from the
 *    band's stated result (`lte` is read as the negation of exceeding; any
 *    other operator on a banded fact is itself a problem);
 * 2. a threshold in the pack has no stated result in the band's table;
 * 3. a stored range does not hold every reportable value of the band's
 *    meaning, or (money) starts other than exactly one cent above it;
 * 4. a headcount threshold equals a headcount band boundary.
 *
 * Pure over a pack object, so a check can hand it an in-memory copy.
 */
export function bandGuardProblems(pack: KnowledgePack, bands: readonly BandSet[]): string[] {
  const problems: string[] = [];
  for (const set of bands) {
    problems.push(...containmentProblems(set));

    const byValue = new Map<number, Map<string, Set<string>>>();
    for (const t of findBandedThresholds(pack, set.factTypes)) {
      const ops = byValue.get(t.value) ?? new Map<string, Set<string>>();
      const requirements = ops.get(t.op) ?? new Set<string>();
      requirements.add(t.requirementId);
      ops.set(t.op, requirements);
      byValue.set(t.value, ops);
    }

    for (const value of [...byValue.keys()].sort((a, b) => a - b)) {
      const ops = byValue.get(value)!;
      const all = [...new Set([...ops.values()].flatMap((requirements) => [...requirements]))].sort().join(', ');

      if (set.measure === 'headcount') {
        const edges = set.bands.flatMap((band) => [
          ...(band.meaning.lower === value ? [`the lower end of band '${band.id}'`] : []),
          ...(band.meaning.upper === value ? [`the upper end of band '${band.id}'`] : []),
        ]);
        // Upper ends first, so a boundary reads in the order the bands meet at it.
        edges.sort((a, b) => Number(a.startsWith('the lower')) - Number(b.startsWith('the lower')));
        if (edges.length > 0) problems.push(`headcount threshold ${value} (${all}): expected no band boundary at ${value}, found ${edges.join(' and ')}`);
      }

      for (const op of [...ops.keys()].sort()) {
        const requirements = [...ops.get(op)!].sort().join(', ');
        if (op !== 'gt' && op !== 'lte') {
          problems.push(`band set '${set.name}' at ${value} (${requirements}): expected the operator gt or lte, found ${op}`);
          continue;
        }
        const where = op === 'gt' ? requirements : `${requirements}; lte, read as not exceeding`;
        for (const band of set.bands) {
          const stated = (band.exceeds as Record<number, StatedResult | undefined>)[value];
          if (stated === undefined) {
            problems.push(`band '${band.id}' at ${value} (${where}): expected a stated result, found none`);
            continue;
          }
          const found = op === 'gt' ? cmpRange(band.stored, 'gt', value) : negate(cmpRange(band.stored, 'lte', value));
          if (found !== STATED_TRUTH[stated]) {
            problems.push(`band '${band.id}' at ${value} (${where}): expected ${SAID[STATED_TRUTH[stated]]}, got ${SAID[found]}`);
          }
        }
      }
    }
  }
  return problems;
}
