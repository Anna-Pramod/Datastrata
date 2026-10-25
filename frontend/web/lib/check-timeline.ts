/**
 * The free checker's answer: a dated timeline of separate routes, one engine
 * run per start year (proposal §4.2; rule R; DP1 plan, Task 4).
 *
 * **Why this module exists.** The check used to answer one financial year with
 * one list of determinations. A visitor reads it as "does the CSRD apply to
 * us", which the law answers route by route and year by year: the first wave
 * for 2025–26, the new thresholds from 2027, Article 40a from 2028, each route
 * with its own exemptions. So the payload is a row per route and a line per
 * requirement, each line's four cells filled from that requirement's own
 * determination for financial years starting in 2025, 2026, 2027 and 2028.
 * The defects this guards against are all quiet:
 *
 * - **a cell from the wrong place**: one route's result, reason or needs on
 *   another's line, or a column run for the wrong year;
 * - **a definitive state the engine did not give**: an open result shown as
 *   settled, an unencoded route shown as "does not apply" (KNW-14), a national
 *   line shown as anything but "requires review";
 * - **a hidden route**: a line that is not evaluated must say so
 *   (`not_checked`), never vanish, and never hide a result its answers could
 *   not change;
 * - **a request answered from the clock**: the assessment date is the
 *   caller's.
 *
 * **What is deliberately not sent** (CHK-2): obligations, gaps, evidence
 * expectations, next questions, cautions, the determination list and labels.
 * `SENT_FIELDS` declares every path the payload may carry, and a test walks the
 * payload against it.
 *
 * **The guards.** `startYearGuardProblems` holds the pack to the premise that
 * makes one 1 January run exact for any start month. `questionGuardProblems`
 * holds the questions to laws 16 and 3: each conditional question shown only
 * where an answer to it changes an engine result that matters, and hidden only
 * where nothing definitive could be reversed by its answer (DG-19, option B).
 * Both are pure over a pack object.
 *
 * Server-side: it reads the engine and `lib/pack`. `IntegrityFailureError` from
 * the pack is never caught here, so the route can refuse exactly as today.
 */

import { assess } from '@datastrata/engine';
import type {
  AssessmentContext,
  AssessmentResult,
  Determination,
  FactNeed,
  KnowledgePack,
  Profile,
  ReasonCode,
  Truth,
} from '@datastrata/engine';
import { conditionSchema } from '../../../backend/engine/src/knowledge/schema';
import { sourceById } from '@/lib/pack';
import {
  buildCheckProfile,
  CHECK_BAND_SETS,
  CHECK_ENTITY_ID,
  CHECK_QUESTIONS,
  EU_COUNTRY_CODES,
  findBandedThresholds,
  LISTED_NON_EU_COUNTRY_CODES,
  OTHER_COUNTRIES,
  visibleQuestions,
  type CheckerAnswers,
  type QuestionId,
} from '@/lib/check-answers';
import {
  CHECK_ROWS,
  countrySide,
  groupPosition,
  shownRows,
  type CheckLineSpec,
  type LineKind,
  type RowId,
} from '@/lib/check-routes';

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

/** Each column reads "financial years that start in" the year (§4.2). */
export const CHECK_START_YEARS = [2025, 2026, 2027, 2028] as const;
export type StartYear = (typeof CHECK_START_YEARS)[number];

/** Every state a cell can take. A line's kind fixes what each one means (`LINE_KINDS`). */
export const CELL_STATES = ['applies', 'does_not_apply', 'cannot_decide', 'not_checked', 'not_yet_covered', 'requires_review'] as const;
export type CellState = (typeof CELL_STATES)[number];

/** The checker's content threshold in force (KNW-10): draft content is evaluated, and labelled. */
export const CONTENT_THRESHOLD = 'draft_labelled';

export interface CellNeed {
  factType: string;
  reason: ReasonCode;
}

export interface CheckCell {
  startYear: StartYear;
  state: CellState;
  /** The line's own requirement's reason, where its determination gives one. Absent for `not_checked`. */
  reason?: ReasonCode;
  /** That determination's needs; never on `not_checked` or `not_yet_covered`. */
  needs?: CellNeed[];
}

export interface CheckSource {
  id: string;
  title: string;
  url: string;
}

export interface CheckLine {
  kind: LineKind;
  requirement: string;
  legalBasis: { sources: CheckSource[]; locators: string[] };
  cells: CheckCell[];
}

export interface CheckRoute {
  id: RowId;
  lines: CheckLine[];
}

export interface CheckTimeline {
  /** The caller's UTC date, echoed; never the clock. */
  assessedAt: string;
  basis: 'start_year';
  startYears: StartYear[];
  hypothetical: true;
  preliminary: true;
  pack: { id: string; version: string; legalSnapshot: string };
  content: { draft: boolean; threshold: typeof CONTENT_THRESHOLD };
  /** C-1 as answered: an ISO 3166-1 alpha-2 code, `not_sure`, or `null` when unanswered. For the national line's note. */
  country: string | null;
  routes: CheckRoute[];
}

/** Every JSON path the payload may carry, arrays written `[]`. Task 6 renders each one (CHK-2). */
export const SENT_FIELDS = [
  'assessedAt',
  'basis',
  'startYears[]',
  'hypothetical',
  'preliminary',
  'pack.id',
  'pack.version',
  'pack.legalSnapshot',
  'content.draft',
  'content.threshold',
  'country',
  'routes[].id',
  'routes[].lines[].kind',
  'routes[].lines[].requirement',
  'routes[].lines[].legalBasis.sources[].id',
  'routes[].lines[].legalBasis.sources[].title',
  'routes[].lines[].legalBasis.sources[].url',
  'routes[].lines[].legalBasis.locators[]',
  'routes[].lines[].cells[].startYear',
  'routes[].lines[].cells[].state',
  'routes[].lines[].cells[].reason',
  'routes[].lines[].cells[].needs[].factType',
  'routes[].lines[].cells[].needs[].reason',
] as const;

/**
 * A line's requirement gave a result its kind cannot show: APPLIES on the
 * national line (unreachable in DP1: the checker never sets the governing
 * Member State, and no country pack is ratified), or a definitive result on a
 * coverage gap. The check refuses rather than invent a label (law 3); Task 6
 * maps this to 503.
 */
export class TimelineRefusalError extends Error {
  constructor(
    readonly requirement: string,
    readonly kind: LineKind,
    readonly startYear: StartYear,
    readonly result: Truth,
  ) {
    super(
      `${requirement} on a ${kind} line reads ${result} for financial years starting in ${startYear}, a state that line kind cannot show; the check refuses rather than invent a label`,
    );
    this.name = 'TimelineRefusalError';
  }
}

// ---------------------------------------------------------------------------
// The engine, as the timeline reads it
// ---------------------------------------------------------------------------

/** One requirement's engine result: what a cell is made from. */
export interface EngineOutcome {
  result: Truth;
  reason?: ReasonCode;
  needs: readonly FactNeed[];
}

/** The engine's result for one requirement, in one start year, over one profile. */
interface Engine {
  outcome(profile: Profile, year: StartYear, requirementId: string): EngineOutcome;
}

/** One run per start year: the period starts on 1 January and ends on 31 December (§4.2; the start-year guard). */
function contextFor(year: StartYear, assessmentDate: string): AssessmentContext {
  return { assessmentDate, financialYear: { start: `${year}-01-01`, end: `${year}-12-31` }, subjectId: CHECK_ENTITY_ID };
}

const byRequirement = new WeakMap<AssessmentResult, Map<string, Determination>>();

/** The checker's profile has one organisation and one entity, so each requirement has one determination. */
function determinationOf(result: AssessmentResult, requirementId: string): Determination {
  let index = byRequirement.get(result);
  if (index === undefined) {
    index = new Map(result.determinations.map((d) => [d.requirementId, d]));
    byRequirement.set(result, index);
  }
  const determination = index.get(requirementId);
  if (determination === undefined) throw new Error(`the engine gave no determination for ${requirementId}`);
  return determination;
}

const outcomeOf = (d: Determination): EngineOutcome => ({ result: d.result, reason: d.reason, needs: d.needs });

/** `assess` itself, once per profile and start year within one call. */
function directEngine(pack: KnowledgePack, assessmentDate: string): Engine & { run(profile: Profile, year: StartYear): AssessmentResult } {
  const runs = new WeakMap<Profile, Map<StartYear, AssessmentResult>>();
  const run = (profile: Profile, year: StartYear): AssessmentResult => {
    let years = runs.get(profile);
    if (years === undefined) {
      years = new Map();
      runs.set(profile, years);
    }
    let result = years.get(year);
    if (result === undefined) {
      result = assess(pack, profile, contextFor(year, assessmentDate));
      years.set(year, result);
    }
    return result;
  };
  return { run, outcome: (profile, year, id) => outcomeOf(determinationOf(run(profile, year), id)) };
}

const sameOutcome = (a: EngineOutcome, b: EngineOutcome): boolean => a.result === b.result && a.reason === b.reason;

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** Rule R's reason code for a route the pack does not encode (DG-7, option A). */
const NOT_ENCODED: ReasonCode = 'source_status_unresolved';

/**
 * A determination's needs as a cell carries them: each fact and reason once,
 * and the facts behind a straddled range first (§4.6.1: "the exact figure
 * ranked first"); otherwise in the engine's order.
 */
function cellNeeds(needs: readonly FactNeed[]): CellNeed[] {
  const seen = new Set<string>();
  const unique: CellNeed[] = [];
  for (const need of needs) {
    const key = `${need.factType}\u0000${need.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ factType: need.factType, reason: need.reason });
  }
  return [...unique.filter((n) => n.reason === 'range_crosses_threshold'), ...unique.filter((n) => n.reason !== 'range_crosses_threshold')];
}

/**
 * What a line of `kind` shows for its own requirement's result (plan Task 4,
 * "The mapping" and "The exceptions"). APPLIES and DOES_NOT_APPLY are shown as
 * they are; INDETERMINATE is never turned into a definitive state.
 */
function stateOf(kind: LineKind, requirement: string, year: StartYear, outcome: EngineOutcome): Exclude<CellState, 'not_checked'> {
  if (kind === 'national') {
    if (outcome.result === 'APPLIES') throw new TimelineRefusalError(requirement, kind, year, outcome.result);
    return 'requires_review';
  }
  if (kind === 'coverage_gap') {
    if (outcome.result !== 'INDETERMINATE') throw new TimelineRefusalError(requirement, kind, year, outcome.result);
    return outcome.reason === NOT_ENCODED ? 'not_yet_covered' : 'cannot_decide';
  }
  if (outcome.result === 'APPLIES') return 'applies';
  if (outcome.result === 'DOES_NOT_APPLY') return 'does_not_apply';
  return 'cannot_decide';
}

function cellOf(kind: LineKind, requirement: string, year: StartYear, outcome: EngineOutcome): CheckCell {
  const state = stateOf(kind, requirement, year, outcome);
  const cell: CheckCell = { startYear: year, state };
  if (outcome.reason !== undefined) cell.reason = outcome.reason;
  // A known coverage gap is DataStrata's to close, not a question for the visitor (Task 2).
  const needs = state === 'not_yet_covered' ? [] : cellNeeds(outcome.needs);
  if (needs.length > 0) cell.needs = needs;
  return cell;
}

// ---------------------------------------------------------------------------
// Which lines are not checked
// ---------------------------------------------------------------------------

const ownFiguresAnswered = (a: CheckerAnswers): boolean => a.parentOwnEmployees !== undefined && a.parentOwnTurnover !== undefined;

/**
 * Whether the checker evaluates a line for these answers (plan Task 4,
 * "`not_checked`"). Only where it deliberately does not:
 *
 * - every exemption line while C-7 is not asked;
 * - an intermediate parent's exemptions for its own route (S-005, S-006) until
 *   C-9 and C-10 are answered;
 * - the parent's own lines until C-9 and C-10 are answered, cell by cell, and
 *   only while some answer to them would change the cell (Task 3's carried
 *   rule: `not_checked` never hides a settled determination).
 */
function linePolicy(row: RowId, line: CheckLineSpec, answers: CheckerAnswers, c7Asked: boolean): 'evaluate' | 'not_checked' | 'unless_settled' {
  if (line.kind === 'exemption') {
    if (!c7Asked) return 'not_checked';
    if (groupPosition(answers) === 'both' && line.relieves === 'CSRD-S-017' && !ownFiguresAnswered(answers)) return 'not_checked';
    return 'evaluate';
  }
  if (row === 'parent_own' && !ownFiguresAnswered(answers)) return 'unless_settled';
  return 'evaluate';
}

type Headcount = NonNullable<CheckerAnswers['employees']>;
type Money = NonNullable<CheckerAnswers['turnover']>;

/** The figure answers: every band, "Not sure", and a typed figure at each threshold and one unit either side. */
export interface FigureAnswers {
  headcount: readonly Headcount[];
  money: readonly Money[];
}

const optionIds = (id: QuestionId): string[] => {
  const question = CHECK_QUESTIONS.find((q) => q.id === id);
  if (question === undefined) throw new Error(`no question ${id}`);
  return question.options.map((o) => o.id);
};

/**
 * Typed figures at every threshold the pack compares these facts with, and one
 * unit either side: one employee, or one cent (§4.3, money in whole cents).
 */
function typedAround(pack: KnowledgePack, factTypes: readonly string[], centsPerUnit: number): { exact: number }[] {
  const thresholds = [...new Set(findBandedThresholds(pack, factTypes).map((t) => t.value))].sort((a, b) => a - b);
  const out: { exact: number }[] = [];
  for (const t of thresholds) {
    for (const step of [-1, 0, 1]) {
      const value = Math.round(t * centsPerUnit + step) / centsPerUnit;
      if (value >= 0 && !out.some((o) => o.exact === value)) out.push({ exact: value });
    }
  }
  return out;
}

const figureAnswersByPack = new WeakMap<KnowledgePack, FigureAnswers>();

export function guardFigureAnswers(pack: KnowledgePack): FigureAnswers {
  const cached = figureAnswersByPack.get(pack);
  if (cached !== undefined) return cached;
  const set = (name: string) => {
    const found = CHECK_BAND_SETS.find((s) => s.name === name);
    if (found === undefined) throw new Error(`no band set ${name}`);
    return found;
  };
  const answers: FigureAnswers = {
    headcount: [...(optionIds('C-4') as Headcount[]), ...typedAround(pack, set('employees').factTypes, 1)],
    money: [...(optionIds('C-5') as Money[]), ...typedAround(pack, set('turnover').factTypes, 100)],
  };
  figureAnswersByPack.set(pack, answers);
  return answers;
}

/** C-9 and C-10's answers, varying only what is unanswered. */
function ownCompletions(pack: KnowledgePack, answers: CheckerAnswers): CheckerAnswers[] {
  const figures = guardFigureAnswers(pack);
  const employees = answers.parentOwnEmployees === undefined ? figures.headcount : [answers.parentOwnEmployees];
  const turnovers = answers.parentOwnTurnover === undefined ? figures.money : [answers.parentOwnTurnover];
  return employees.flatMap((parentOwnEmployees) => turnovers.map((parentOwnTurnover) => ({ ...answers, parentOwnEmployees, parentOwnTurnover })));
}

interface LineCells {
  spec: CheckLineSpec;
  cells: CheckCell[];
}
interface RouteCells {
  row: RowId;
  lines: LineCells[];
}

/**
 * Every shown row's cells, each from its own line's requirement, under the
 * `not_checked` rules. Shared by `buildCheckTimeline` and the question guard,
 * which hand it different engines over the same rules.
 */
function routeCells(pack: KnowledgePack, answers: CheckerAnswers, engine: Engine, profileOf: (a: CheckerAnswers) => Profile, profile: Profile = profileOf(answers)): RouteCells[] {
  const c7Asked = visibleQuestions(answers).some((q) => q.id === 'C-7');
  let completions: CheckerAnswers[] | undefined;
  const completionProfiles: Profile[] = [];
  /** Whether some C-9/C-10 answer changes this requirement's outcome in this year; profiles are built only as far as needed. */
  const someAnswerChanges = (year: StartYear, requirement: string, outcome: EngineOutcome): boolean => {
    completions ??= ownCompletions(pack, answers);
    for (let i = 0; i < completions.length; i += 1) {
      completionProfiles[i] ??= profileOf(completions[i]!);
      if (!sameOutcome(engine.outcome(completionProfiles[i]!, year, requirement), outcome)) return true;
    }
    return false;
  };

  return shownRows(answers).map(({ row, lines }) => ({
    row: row.id,
    lines: lines.map((spec) => {
      const policy = linePolicy(row.id, spec, answers, c7Asked);
      const cells = CHECK_START_YEARS.map((year): CheckCell => {
        if (policy === 'not_checked') return { startYear: year, state: 'not_checked' };
        const outcome = engine.outcome(profile, year, spec.requirement);
        if (policy === 'unless_settled' && someAnswerChanges(year, spec.requirement, outcome)) return { startYear: year, state: 'not_checked' };
        return cellOf(spec.kind, spec.requirement, year, outcome);
      });
      return { spec, cells };
    }),
  }));
}

function answeredCountry(answers: CheckerAnswers): string | null {
  if (answers.country === undefined) return null;
  if (answers.country === 'other') return answers.countryOther ?? null;
  return answers.country;
}

/**
 * The timeline for a visitor's answers, at the caller's date. One engine run
 * per start year over the same profile; each cell its own line's requirement's
 * determination for that year.
 */
export function buildCheckTimeline(pack: KnowledgePack, answers: CheckerAnswers, assessmentDate: string): CheckTimeline {
  const engine = directEngine(pack, assessmentDate);
  const profile = buildCheckProfile(answers);
  const runs = CHECK_START_YEARS.map((year) => engine.run(profile, year));
  const routes = routeCells(pack, answers, engine, buildCheckProfile, profile).map(
    ({ row, lines }): CheckRoute => ({
      id: row,
      lines: lines.map(({ spec, cells }): CheckLine => {
        const determination = determinationOf(runs[0]!, spec.requirement);
        return {
          kind: spec.kind,
          requirement: spec.requirement,
          legalBasis: { sources: determination.sources.map((id) => sourceById(pack, id)), locators: [...determination.locators] },
          cells,
        };
      }),
    }),
  );
  return {
    assessedAt: assessmentDate,
    basis: 'start_year',
    startYears: [...CHECK_START_YEARS],
    hypothetical: true,
    preliminary: true,
    pack: { id: pack.id, version: pack.version, legalSnapshot: pack.legalSnapshot },
    content: { draft: runs.some((run) => run.containsDraftContent), threshold: CONTENT_THRESHOLD },
    country: answeredCountry(answers),
    routes,
  };
}

// ---------------------------------------------------------------------------
// The start-year guard (§4.2)
// ---------------------------------------------------------------------------

/**
 * How each operator of the condition language reads the financial period.
 * `start_year` reads the start's year alone; `start_date` compares the start
 * with a date, which must be a 1 January; `end` would read the period's end,
 * which no operator may.
 */
const PERIOD_READS: Readonly<Record<string, 'none' | 'start_year' | 'start_date' | 'end'>> = {
  all: 'none',
  any: 'none',
  not: 'none',
  cmp: 'none',
  eq: 'none',
  in_set: 'none',
  in_catalogue: 'none',
  prefix_in: 'none',
  exists: 'none',
  count_cmp: 'none',
  quantifier_any: 'none',
  sum_cmp: 'none',
  requirement_ref: 'none',
  pack_flag: 'none',
  fy_start_year_in: 'start_year',
  year_diff_lt: 'start_year',
  fy_starts_on_or_after: 'start_date',
};

/** The operators of the engine's runtime condition schema, read from the schema itself. */
export function conditionOperators(): string[] {
  const union = (conditionSchema as unknown as { schema: { optionsMap: Map<string, unknown> } }).schema;
  return [...union.optionsMap.keys()];
}

/** Every condition node of a requirement, in its condition and its selection cases, however nested. */
function conditionNodes(requirement: KnowledgePack['requirements'][number]): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.op === 'string') found.push(record);
    for (const child of Object.values(record)) visit(child);
  };
  visit(requirement.condition);
  for (const selection of requirement.cases ?? []) visit(selection.when);
  return found;
}

/**
 * Every way the pack could make a 1 January run inexact for another start
 * month: an operator the guard does not classify (from the schema or in the
 * pack), an operator that reads the period's end, or a start compared with a
 * date other than 1 January. Pure over a pack object.
 */
export function startYearGuardProblems(pack: KnowledgePack, operators: readonly string[] = conditionOperators()): string[] {
  const problems: string[] = [];
  for (const op of operators) {
    if (!(op in PERIOD_READS)) problems.push(`operator '${op}' in the engine's condition schema is not classified by the start-year guard`);
  }
  for (const op of Object.keys(PERIOD_READS)) {
    if (!operators.includes(op)) problems.push(`the start-year guard classifies '${op}', which the engine's condition schema does not hold`);
  }
  for (const requirement of pack.requirements) {
    for (const node of conditionNodes(requirement)) {
      const op = node.op as string;
      const reads = PERIOD_READS[op];
      if (reads === undefined) {
        problems.push(`${requirement.id}: operator '${op}' is not one the start-year guard classifies`);
      } else if (reads === 'end') {
        problems.push(`${requirement.id}: operator '${op}' reads the period's end`);
      } else if (reads === 'start_date' && !/^\d{4}-01-01$/.test(String(node.date))) {
        problems.push(`${requirement.id}: ${op} compares the period start with ${String(node.date)}, not with a 1 January date`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The question guard: what it shares, and why that is exact
// ---------------------------------------------------------------------------

/**
 * The fact types a requirement reads: every `fact` or `fromFact` in its
 * condition and selection cases, and in those of every requirement it
 * references, however nested. Structural, so an operator added later cannot
 * hide a read. Its completeness is tested against the engine's own trace.
 */
const readSets = new WeakMap<KnowledgePack, Map<string, ReadonlySet<string>>>();

export function requirementReadSet(pack: KnowledgePack, requirementId: string): ReadonlySet<string> {
  let cache = readSets.get(pack);
  if (cache === undefined) {
    cache = new Map();
    readSets.set(pack, cache);
  }
  const hit = cache.get(requirementId);
  if (hit !== undefined) return hit;
  const reads = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const requirement = pack.requirements.find((r) => r.id === id);
    if (requirement === undefined) throw new Error(`no requirement ${id}`);
    for (const node of conditionNodes(requirement)) {
      for (const key of ['fact', 'fromFact']) if (typeof node[key] === 'string') reads.add(node[key] as string);
      if (node.op === 'requirement_ref' && typeof node.requirement === 'string') walk(node.requirement);
    }
  };
  walk(requirementId);
  cache.set(requirementId, reads);
  return reads;
}

/** Every requirement on a line, and every route an exemption line relieves. */
const LINE_REQUIREMENTS: readonly string[] = [
  ...new Set(CHECK_ROWS.flatMap((row) => row.lines.flatMap((line) => [line.requirement, ...(line.relieves === undefined ? [] : [line.relieves])]))),
];

export interface MemoisedEngine extends Engine {
  stats: { runs: number; hits: number };
  /** The fact types whose stated values differ between two profiles. */
  changedFacts(a: Profile, b: Profile): Set<string>;
}

/**
 * The engine, remembering each requirement's outcome by the start year and
 * the stated values of exactly the facts it reads. Two profiles that agree on
 * those facts share one outcome; the claim that this is exact is tested
 * against `assess` called directly. A miss runs `assess` itself, once, and
 * remembers every line requirement's outcome from that run.
 */
export function memoisedEngine(pack: KnowledgePack, assessmentDate: string): MemoisedEngine {
  const values = new Map<string, number>();
  const intern = (value: string): number => {
    let id = values.get(value);
    if (id === undefined) {
      id = values.size;
      values.set(value, id);
    }
    return id;
  };
  /** Per profile: each fact type's stated values, interned, in profile order; and the scope graph's shape. */
  const projections = new WeakMap<Profile, { facts: Map<string, number>; shape: number; keys: Map<string, string> }>();
  const projectionOf = (profile: Profile) => {
    let projection = projections.get(profile);
    if (projection === undefined) {
      const raw = new Map<string, string>();
      for (const fact of profile.facts) {
        const stated = `${fact.scopeId}\u0002${fact.confirmed ? 1 : 0}\u0002${JSON.stringify(fact.value)}`;
        const before = raw.get(fact.factType);
        raw.set(fact.factType, before === undefined ? stated : `${before}\u0003${stated}`);
      }
      projection = {
        facts: new Map([...raw].map(([factType, stated]) => [factType, intern(stated)])),
        shape: intern(JSON.stringify(profile.scopeObjects)),
        keys: new Map(),
      };
      projections.set(profile, projection);
    }
    return projection;
  };
  const readLists = new Map<string, string[]>();
  const readList = (id: string): string[] => {
    let list = readLists.get(id);
    if (list === undefined) {
      list = [...requirementReadSet(pack, id)].sort();
      readLists.set(id, list);
    }
    return list;
  };
  const keyOf = (profile: Profile, id: string): string => {
    const projection = projectionOf(profile);
    let key = projection.keys.get(id);
    if (key === undefined) {
      key = `${id}:${projection.shape}:${readList(id).map((factType) => projection.facts.get(factType) ?? '').join(',')}`;
      projection.keys.set(id, key);
    }
    return key;
  };

  const remembered = new Map<string, EngineOutcome>();
  const stats = { runs: 0, hits: 0 };
  return {
    stats,
    outcome(profile, year, id) {
      const key = `${year}|${keyOf(profile, id)}`;
      const hit = remembered.get(key);
      if (hit !== undefined) {
        stats.hits += 1;
        return hit;
      }
      stats.runs += 1;
      const result = assess(pack, profile, contextFor(year, assessmentDate));
      for (const other of new Set([...LINE_REQUIREMENTS, id])) {
        remembered.set(`${year}|${keyOf(profile, other)}`, outcomeOf(determinationOf(result, other)));
      }
      return remembered.get(key)!;
    },
    changedFacts(a, b) {
      const pa = projectionOf(a).facts;
      const pb = projectionOf(b).facts;
      const changed = new Set<string>();
      for (const [factType, id] of pa) if (pb.get(factType) !== id) changed.add(factType);
      for (const factType of pb.keys()) if (!pa.has(factType)) changed.add(factType);
      return changed;
    },
  };
}

/**
 * The EU Member States the guard may treat as one class, derived from the
 * pack each time it runs. The premise: every condition reading a country the
 * checker writes (found by mapping two Member States and comparing the facts)
 * reads it through a catalogue or for its presence. Then two codes with the
 * same entry in every catalogue give the same result everywhere. If the
 * premise fails, every code is its own class and nothing is shared.
 */
export function countryClasses(pack: KnowledgePack): { eu: string[][]; premise: string[] } {
  const probe = (country: string) => buildCheckProfile({ country: country as CheckerAnswers['country'], group: 'none', euTurnover: 'both' });
  const [first, second] = EU_COUNTRY_CODES;
  const a = probe(first);
  const b = probe(second);
  const countryFacts = new Set(
    a.facts.filter((fact) => !b.facts.some((other) => other.factType === fact.factType && JSON.stringify(other.value) === JSON.stringify(fact.value))).map((f) => f.factType),
  );
  const premise: string[] = [];
  for (const requirement of pack.requirements) {
    for (const node of conditionNodes(requirement)) {
      if (typeof node.fact === 'string' && countryFacts.has(node.fact) && node.op !== 'in_catalogue' && node.op !== 'exists') {
        premise.push(`${requirement.id}: '${String(node.op)}' reads ${node.fact} other than through a catalogue`);
      }
    }
  }
  if (premise.length > 0 || countryFacts.size === 0) return { eu: EU_COUNTRY_CODES.map((code) => [code]), premise };
  const catalogues = Object.keys(pack.catalogues).sort();
  const classes = new Map<string, string[]>();
  for (const code of EU_COUNTRY_CODES) {
    const signature = catalogues.map((name) => String(pack.catalogues[name]!.entries[code])).join(',');
    classes.set(signature, [...(classes.get(signature) ?? []), code]);
  }
  return { eu: [...classes.values()], premise };
}

// ---------------------------------------------------------------------------
// The question guard: the checks, one combination at a time
// ---------------------------------------------------------------------------

export type GuardQuestion = 'C-6' | 'C-7' | 'C-8' | 'C-9+C-10';
export const GUARD_QUESTIONS: readonly GuardQuestion[] = ['C-6', 'C-7', 'C-8', 'C-9+C-10'];
const QUESTION_FIELDS: Record<GuardQuestion, readonly (keyof CheckerAnswers)[]> = {
  'C-6': ['pie'],
  'C-7': ['parentReport'],
  'C-8': ['euTurnover'],
  'C-9+C-10': ['parentOwnEmployees', 'parentOwnTurnover'],
};

export interface GuardContext {
  pack: KnowledgePack;
  engine: MemoisedEngine;
  profileOf: (answers: CheckerAnswers) => Profile;
  /** Each question's answers, as partial answer sets. */
  answers: Record<GuardQuestion, readonly CheckerAnswers[]>;
}

const GUARD_DATE = '2026-10-24';

export function guardContext(pack: KnowledgePack, options: { profileOf?: (answers: CheckerAnswers) => Profile } = {}): GuardContext {
  const figures = guardFigureAnswers(pack);
  return {
    pack,
    engine: memoisedEngine(pack, GUARD_DATE),
    profileOf: options.profileOf ?? buildCheckProfile,
    answers: {
      'C-6': optionIds('C-6').map((pie) => ({ pie }) as CheckerAnswers),
      'C-7': optionIds('C-7').map((parentReport) => ({ parentReport }) as CheckerAnswers),
      'C-8': optionIds('C-8').map((euTurnover) => ({ euTurnover }) as CheckerAnswers),
      'C-9+C-10': figures.headcount.flatMap((parentOwnEmployees) => figures.money.map((parentOwnTurnover) => ({ parentOwnEmployees, parentOwnTurnover }))),
    },
  };
}

const FIELD_ORDER: readonly (keyof CheckerAnswers)[] = [
  'country',
  'countryOther',
  'group',
  'organisation',
  'employees',
  'turnover',
  'pie',
  'parentReport',
  'euTurnover',
  'parentOwnEmployees',
  'parentOwnTurnover',
];

/** A combination, named in a fixed key order. */
function describe(answers: CheckerAnswers): string {
  return JSON.stringify(Object.fromEntries(FIELD_ORDER.filter((k) => answers[k] !== undefined).map((k) => [k, answers[k]])));
}

function without(answers: CheckerAnswers, fields: readonly (keyof CheckerAnswers)[]): CheckerAnswers {
  const rest: CheckerAnswers = { ...answers };
  for (const field of fields) delete rest[field];
  return rest;
}

/** One combination as the guard compares it: the lines shown, the engine's outcomes, and (lazily) the cells displayed. */
export interface GuardEvaluation {
  lines: readonly { row: RowId; kind: LineKind; requirement: string; relieves?: string }[];
  /** Per start year, the engine's outcome for every line's requirement and every relieved route. */
  engine: ReadonlyMap<number, ReadonlyMap<string, EngineOutcome>>;
  /** The state displayed, keyed `row requirement year`. Never read by `genuineChange`. */
  readonly display: ReadonlyMap<string, string>;
}

export function evaluateForGuard(ctx: GuardContext, answers: CheckerAnswers): GuardEvaluation {
  const profile = ctx.profileOf(answers);
  const lines = shownRows(answers).flatMap(({ row, lines: specs }) =>
    specs.map((spec) => ({ row: row.id, kind: spec.kind, requirement: spec.requirement, relieves: spec.relieves })),
  );
  const needed = [...new Set(lines.flatMap((l) => [l.requirement, ...(l.relieves === undefined ? [] : [l.relieves])]))];
  const engine = new Map(
    CHECK_START_YEARS.map((year) => [year as number, new Map(needed.map((id) => [id, ctx.engine.outcome(profile, year, id)]))]),
  );
  let display: Map<string, string> | undefined;
  return {
    lines,
    engine,
    get display() {
      display ??= new Map(
        routeCells(ctx.pack, answers, ctx.engine, ctx.profileOf).flatMap(({ row, lines: ls }) =>
          ls.flatMap(({ spec, cells }) => cells.map((c) => [`${row} ${spec.requirement} ${c.startYear}`, c.state] as const)),
        ),
      );
      return display;
    },
  };
}

const notDoesNotApply = (o: EngineOutcome | undefined): boolean => o !== undefined && o.result !== 'DOES_NOT_APPLY';

/**
 * Whether two evaluations differ in a relevant engine result (DG-19, option
 * B): the requirement of any line other than an exemption line, in any start
 * year; or an exemption, in a year when the route it relieves is not "does not
 * apply" in either. A result is APPLIES, DOES_NOT_APPLY, or INDETERMINATE with
 * its reason. Displayed cells are never compared: showing or hiding a line is
 * not a change.
 */
export function genuineChange(a: GuardEvaluation, b: GuardEvaluation): boolean {
  for (const year of CHECK_START_YEARS) {
    const ea = a.engine.get(year);
    const eb = b.engine.get(year);
    if (ea === undefined || eb === undefined) continue;
    for (const line of a.lines) {
      if (line.kind === 'exemption') {
        const relieved = line.relieves ?? '';
        if (!notDoesNotApply(ea.get(relieved)) && !notDoesNotApply(eb.get(relieved))) continue;
      }
      const x = ea.get(line.requirement);
      const y = eb.get(line.requirement);
      if (x === undefined || y === undefined) throw new Error(`no engine outcome for ${line.requirement} in ${year}`);
      if (!sameOutcome(x, y)) return true;
    }
  }
  return false;
}

/**
 * The shown direction, for one combination of the other answers: some answer
 * to the question makes a genuine change. Visibility is not consulted here;
 * the guard calls it where the question is shown.
 */
export function shownProblem(ctx: GuardContext, question: GuardQuestion, others: CheckerAnswers): string | null {
  const rest = without(others, QUESTION_FIELDS[question]);
  const [first, ...more] = ctx.answers[question];
  const reference = evaluateForGuard(ctx, { ...rest, ...first });
  for (const answer of more) {
    if (genuineChange(reference, evaluateForGuard(ctx, { ...rest, ...answer }))) return null;
  }
  return `${question} is shown where no answer to it makes a genuine change in any start year: ${describe(rest)}`;
}

/**
 * The hidden direction, for one combination with the question unasked: no
 * answer to it changes a cell that reads definitive while it is unasked. The
 * display of the unasked combination is held fixed: a line shown
 * `not_checked` is open, and an answer that would only show or hide a line is
 * no change (DG-19). Lines whose requirement reads none of the facts the
 * answer changes keep their outcome by the memory's own construction.
 */
export function hiddenProblem(ctx: GuardContext, question: GuardQuestion, combination: CheckerAnswers, unasked?: RouteCells[]): string | null {
  const cells = unasked ?? routeCells(ctx.pack, combination, ctx.engine, ctx.profileOf);
  const before = ctx.profileOf(combination);
  for (const answer of ctx.answers[question]) {
    const posed = { ...combination, ...answer };
    const after = ctx.profileOf(posed);
    const changed = ctx.engine.changedFacts(before, after);
    if (changed.size === 0) continue;
    for (const { row, lines } of cells) {
      for (const { spec, cells: lineCells } of lines) {
        const reads = requirementReadSet(ctx.pack, spec.requirement);
        if (![...changed].some((f) => reads.has(f))) continue;
        for (const cell of lineCells) {
          if (cell.state === 'not_checked' || cell.state === 'cannot_decide') continue;
          const answered = stateOf(spec.kind, spec.requirement, cell.startYear, ctx.engine.outcome(after, cell.startYear, spec.requirement));
          if (answered !== cell.state) {
            return `${question} is hidden where its answer ${describe(answer)} changes a definitive cell: ${row} ${spec.requirement} ${cell.startYear} reads ${cell.state} unasked and ${answered} answered; combination ${describe(combination)}`;
          }
        }
      }
    }
  }
  return null;
}

/**
 * The routes C-7's answer can relieve (Task 3's rule, in engine terms): those
 * of the exemption lines shown to the visitor, for an owned company (its own
 * route) or an intermediate parent (its own and its sub-group's). C-7 is for
 * owned companies and intermediate parents only (§4.1), and a company shown
 * no exemption row (a non-EU one) has nothing for it to relieve.
 */
function c7Relieves(answers: CheckerAnswers): string[] {
  const group = groupPosition(answers);
  if (group !== 'owned' && group !== 'both') return [];
  const exemption = shownRows(answers).find((r) => r.row.id === 'exemption');
  return [...new Set((exemption?.lines ?? []).map((l) => l.relieves ?? ''))].sort();
}

/**
 * The C-7 rule, both directions: C-7 is shown exactly when a route it relieves
 * is not "does not apply" in some start year. Not checked for an unknown
 * country: the checker stops after C-1 and C-2 there (§4.4), so no figure is
 * asked that C-7's rule could read.
 */
export function c7RuleProblem(ctx: GuardContext, combination: CheckerAnswers, shown: boolean): string | null {
  if (countrySide(combination) === 'unknown') return null;
  const profile = ctx.profileOf(combination);
  let open: string | null = null;
  for (const id of c7Relieves(combination)) {
    for (const year of CHECK_START_YEARS) {
      if (open === null && ctx.engine.outcome(profile, year, id).result !== 'DOES_NOT_APPLY') open = `${id} in ${year}`;
    }
  }
  if (shown && open === null) return `C-7 is shown where no route it relieves (${c7Relieves(combination).join(', ') || 'none'}) can apply in any start year: ${describe(combination)}`;
  if (!shown && open !== null) return `C-7 is hidden where the route it relieves is not "does not apply" (${open}): ${describe(combination)}`;
  return null;
}

/**
 * The `not_checked` rule for the parent's own lines, both directions, for a
 * parent or intermediate parent with C-9 and C-10 unanswered: a cell reads
 * `not_checked` exactly when some C-9/C-10 answer changes its engine
 * determination; otherwise it reads that determination.
 */
export function notCheckedRuleProblem(
  ctx: GuardContext,
  combination: CheckerAnswers,
  display?: (row: RowId, requirement: string, year: StartYear) => string,
): string | null {
  const group = groupPosition(combination);
  if ((group !== 'parent' && group !== 'both') || combination.parentOwnEmployees !== undefined || combination.parentOwnTurnover !== undefined) return null;
  const parentOwn = shownRows(combination).find((r) => r.row.id === 'parent_own');
  if (parentOwn === undefined) return null;
  let cells: RouteCells[] | undefined;
  const shown =
    display ??
    ((row: RowId, requirement: string, year: StartYear): string => {
      cells ??= routeCells(ctx.pack, combination, ctx.engine, ctx.profileOf);
      const line = cells.find((r) => r.row === row)?.lines.find((l) => l.spec.requirement === requirement);
      return line?.cells.find((c) => c.startYear === year)?.state ?? 'absent';
    });
  const profile = ctx.profileOf(combination);
  for (const spec of parentOwn.lines) {
    for (const year of CHECK_START_YEARS) {
      const base = ctx.engine.outcome(profile, year, spec.requirement);
      const changer = ctx.answers['C-9+C-10'].find((answer) => !sameOutcome(ctx.engine.outcome(ctx.profileOf({ ...combination, ...answer }), year, spec.requirement), base));
      const state = shown('parent_own', spec.requirement, year);
      if (changer !== undefined && state !== 'not_checked') {
        return `parent_own ${spec.requirement} ${year} reads ${state}, but C-9/C-10 answer ${describe(changer)} changes its determination, so it must read not_checked: ${describe(combination)}`;
      }
      if (changer === undefined) {
        const settled = stateOf(spec.kind, spec.requirement, year, base);
        if (state !== settled) return `parent_own ${spec.requirement} ${year} reads ${state}, but no C-9/C-10 answer changes its determination, so it must read ${settled}: ${describe(combination)}`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The question guard: every reachable combination
// ---------------------------------------------------------------------------

const QUESTION_ORDER: readonly QuestionId[] = ['C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-8', 'C-9', 'C-10'];
const FIELD_OF: Record<QuestionId, keyof CheckerAnswers> = {
  'C-1': 'country',
  'C-2': 'group',
  'C-3': 'organisation',
  'C-4': 'employees',
  'C-5': 'turnover',
  'C-6': 'pie',
  'C-7': 'parentReport',
  'C-8': 'euTurnover',
  'C-9': 'parentOwnEmployees',
  'C-10': 'parentOwnTurnover',
};

/**
 * Whether answers are a flow the questions can produce: every shown question
 * answered except the optional pair, which is answered whole or not at all,
 * and no answer to a question not shown.
 */
function isFlow(answers: CheckerAnswers, visible: ReturnType<typeof visibleQuestions>): boolean {
  for (const id of QUESTION_ORDER) {
    const entry = visible.find((q) => q.id === id);
    const answered = answers[FIELD_OF[id]] !== undefined;
    if (answered && entry === undefined) return false;
    if (!answered && entry !== undefined && !entry.optional) return false;
  }
  return (answers.parentOwnEmployees === undefined) === (answers.parentOwnTurnover === undefined);
}

interface Step {
  question: QuestionId;
  answers: readonly CheckerAnswers[];
  optional?: boolean;
}

/**
 * Every reachable flow: each question answered, with each of its answers,
 * exactly where `visibleQuestions` shows it; the optional C-9 and C-10 left
 * unanswered or answered together. Questions are taken in the order their
 * visibility depends on them (C-9 and C-10 before C-7), and each flow is
 * checked against `visibleQuestions` as a whole; a flow that fails is counted,
 * not used.
 */
function* reachableFlows(ctx: GuardContext, countries: readonly CheckerAnswers[], rejected: { count: number }): Generator<{ answers: CheckerAnswers; visible: ReturnType<typeof visibleQuestions> }> {
  const figures = guardFigureAnswers(ctx.pack);
  const steps: Step[] = [
    { question: 'C-2', answers: optionIds('C-2').map((group) => ({ group }) as CheckerAnswers) },
    { question: 'C-3', answers: optionIds('C-3').map((organisation) => ({ organisation }) as CheckerAnswers) },
    { question: 'C-4', answers: figures.headcount.map((employees) => ({ employees })) },
    { question: 'C-5', answers: figures.money.map((turnover) => ({ turnover })) },
    { question: 'C-6', answers: ctx.answers['C-6'] },
    { question: 'C-9', answers: ctx.answers['C-9+C-10'], optional: true },
    { question: 'C-7', answers: ctx.answers['C-7'] },
    { question: 'C-8', answers: ctx.answers['C-8'] },
  ];
  function* walk(partial: CheckerAnswers, index: number): Generator<{ answers: CheckerAnswers; visible: ReturnType<typeof visibleQuestions> }> {
    if (index === steps.length) {
      const visible = visibleQuestions(partial);
      if (isFlow(partial, visible)) yield { answers: partial, visible };
      else rejected.count += 1;
      return;
    }
    const step = steps[index]!;
    if (!visibleQuestions(partial).some((q) => q.id === step.question)) {
      yield* walk(partial, index + 1);
      return;
    }
    if (step.optional) yield* walk(partial, index + 1);
    for (const answer of step.answers) yield* walk({ ...partial, ...answer }, index + 1);
  }
  for (const country of countries) yield* walk(country, 0);
}

/** C-1's answers: one Member State per class (`countryClasses`), every listed and every typed non-EU country, and "Not sure". */
function guardCountries(pack: KnowledgePack): CheckerAnswers[] {
  const representatives = countryClasses(pack).eu.map((codes) => codes[0]!);
  return [
    ...representatives.map((country) => ({ country }) as CheckerAnswers),
    ...LISTED_NON_EU_COUNTRY_CODES.map((country) => ({ country }) as CheckerAnswers),
    ...OTHER_COUNTRIES.map((c) => ({ country: 'other', countryOther: c.id }) as CheckerAnswers),
    { country: 'not_sure' },
  ];
}

export interface QuestionGuardReport {
  problems: string[];
  counts: {
    flows: number;
    rejected: number;
    shown: Record<GuardQuestion, number>;
    hidden: Record<GuardQuestion, number>;
    c7Rule: number;
    notCheckedRule: number;
    engineRuns: number;
  };
}

/**
 * The question guard over every reachable combination (plan Task 4). For C-6,
 * C-7, C-8 and C-9 with C-10: in **each** combination of the other answers
 * where the question is shown, some answer to it makes a genuine change; in
 * each where it is hidden, no answer to it changes a definitive cell. And the
 * C-7 rule and the `not_checked` rule, both directions. Reports the first
 * failing combination of each check, with how many more there are.
 */
export function questionGuardReport(pack: KnowledgePack): QuestionGuardReport {
  const ctx = guardContext(pack);
  const zero = (): Record<GuardQuestion, number> => ({ 'C-6': 0, 'C-7': 0, 'C-8': 0, 'C-9+C-10': 0 });
  const counts: QuestionGuardReport['counts'] = { flows: 0, rejected: 0, shown: zero(), hidden: zero(), c7Rule: 0, notCheckedRule: 0, engineRuns: 0 };
  const first = new Map<string, string>();
  const failing = new Map<string, number>();
  const note = (check: string, problem: string | null): void => {
    if (problem === null) return;
    failing.set(check, (failing.get(check) ?? 0) + 1);
    if (!first.has(check)) first.set(check, problem);
  };

  /** The optional pair's combinations of other answers, each checked once. */
  const ownChecked = new Set<string>();
  /** Whether `answers` is this question's first answer that makes `others` a flow, so each combination is checked once. */
  const isFirstFlowFor = (question: GuardQuestion, others: CheckerAnswers, answers: CheckerAnswers): boolean => {
    for (const candidate of ctx.answers[question]) {
      const whole = { ...others, ...candidate };
      if (isFlow(whole, visibleQuestions(whole))) return QUESTION_FIELDS[question].every((f) => whole[f] === answers[f]);
    }
    return false;
  };

  const rejected = { count: 0 };
  for (const { answers, visible } of reachableFlows(ctx, guardCountries(pack), rejected)) {
    counts.flows += 1;
    const shownIds = new Set(visible.map((q) => q.id));
    const group = groupPosition(answers);
    let unasked: RouteCells[] | undefined;
    const unaskedCells = (): RouteCells[] => (unasked ??= routeCells(pack, answers, ctx.engine, ctx.profileOf));

    for (const question of GUARD_QUESTIONS) {
      const shown = shownIds.has(question === 'C-9+C-10' ? 'C-9' : question);
      const fields = QUESTION_FIELDS[question];
      if (shown) {
        if (fields.some((f) => answers[f] === undefined)) continue; // the optional pair unanswered: its combinations come from the answered flows
        const others = without(answers, fields);
        if (question === 'C-9+C-10') {
          const key = describe(others);
          if (ownChecked.has(key)) continue;
          ownChecked.add(key);
        } else if (!isFirstFlowFor(question, others, answers)) {
          continue;
        }
        counts.shown[question] += 1;
        note(`shown ${question}`, shownProblem(ctx, question, others));
      } else {
        // The schema refuses C-9 and C-10 except for a parent or an intermediate parent.
        if (question === 'C-9+C-10' && group !== 'parent' && group !== 'both') continue;
        counts.hidden[question] += 1;
        note(`hidden ${question}`, hiddenProblem(ctx, question, answers, unaskedCells()));
      }
    }

    if (countrySide(answers) !== 'unknown') {
      counts.c7Rule += 1;
      note('C-7 rule', c7RuleProblem(ctx, answers, shownIds.has('C-7')));
    }
    if ((group === 'parent' || group === 'both') && answers.parentOwnEmployees === undefined && shownRows(answers).some((r) => r.row.id === 'parent_own')) {
      counts.notCheckedRule += 1;
      note('not_checked rule', notCheckedRuleProblem(ctx, answers));
    }
  }
  counts.rejected = rejected.count;
  counts.engineRuns = ctx.engine.stats.runs;

  const problems = [...first.entries()].map(([check, problem]) => {
    const more = (failing.get(check) ?? 1) - 1;
    return more > 0 ? `${problem} (and ${more} more such combinations)` : problem;
  });
  if (rejected.count > 0) problems.push(`the enumeration built ${rejected.count} answer sets that visibleQuestions does not produce: a question's visibility now depends on a later answer`);
  return { problems, counts };
}

/** The question guard's problems (plan Task 4): pure over a pack object. */
export function questionGuardProblems(pack: KnowledgePack): string[] {
  return questionGuardReport(pack).problems;
}
