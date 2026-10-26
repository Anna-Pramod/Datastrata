/**
 * The check's view model: the timeline payload put into the approved words,
 * cell by cell, with the one next step each open cell offers (DP1 plan,
 * Task 6; CHK-3, APP-11, EXP-3, KNW-10).
 *
 * **Why this file exists.** The payload carries ids, kinds, states and reason
 * codes; the wording module holds the words. The join between them is where a
 * visitor is quietly misled: a cell worded with another kind's or another
 * state's words, an open cell with no reason or no step, or a step that offers
 * a question the visitor is never shown. The last is the user's rule of
 * 2026-10-26: a cell's step is that of its first need (range first) whose fact
 * a question shown to this visitor sets in this visitor's context, C-4/C-9 and
 * C-5/C-10 being alternatives; where no need has one, the first need whose step
 * asks nothing; and never a hidden question. Read literally, "the first need's
 * step" offers the hidden-C-6 parent the question C-6, which it is never shown,
 * so that case is pinned here by name, beside its counterexamples, and the rule
 * is then held over every reachable flow of Task 4's enumeration.
 *
 * The sweep builds each flow's cells from Task 4's memoised engine
 * (`evaluateForGuard`) rather than `buildCheckTimeline`, which would take hours
 * over 396,565 flows. That reconstruction restates one rule of the timeline
 * module (a cell's needs: each once, range first), so it is first shown equal
 * to `buildCheckTimeline` over the 40 authored cases and over a sample of the
 * sweep itself (failure mode 1).
 *
 * Every expectation about which question a step links is written here from the
 * plan and the proposal, never read back from the module.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { csrdPack, loadVerifiedCsrdPack } from '@/lib/pack';
import { buildCheckProfile, checkerAnswersSchema, visibleQuestions, type CheckerAnswers, type QuestionId } from '@/lib/check-answers';
import { LINE_KINDS, type LineKind, type RowId } from '@/lib/check-routes';
import {
  buildCheckTimeline,
  CHECK_START_YEARS,
  evaluateForGuard,
  guardContext,
  guardCountries,
  memoisedEngine,
  reachableCellStates,
  reachableFlows,
  type CellNeed,
  type CellState,
  type CheckCell,
  type CheckRoute,
  type CheckTimeline,
  type EngineOutcome,
  type GuardContext,
} from '@/lib/check-timeline';
import {
  COLUMN_HEADING,
  DP1_WORDING,
  DRAFT_LABEL,
  lineLabel,
  nationalLineNote,
  nextStep,
  PRELIMINARY_LABEL,
  REVIEW_STEP,
  reasonWords,
  rowLabel,
  rowStep,
  startYearHeading,
  stateWords,
  thresholdWords,
} from '@/lib/wording';
import {
  answeredHiddenQuestions,
  checkView,
  factsSetBy,
  PARENT_OWN_OFFER,
  requestBody,
  shownAnswers,
  type CellView,
  type CheckView,
} from '@/lib/check-view';
import { buildFixtureRepository } from './fixture-repository';

interface CasesFile {
  assessmentDate: string;
  cases: { id: string; answers: Record<string, unknown> }[];
}

const FILE = JSON.parse(readFileSync(fileURLToPath(new URL('./checker-cases.json', import.meta.url)), 'utf8')) as CasesFile;
const DATE = FILE.assessmentDate;
const pack = csrdPack();
const accepted = (raw: Record<string, unknown>): CheckerAnswers => checkerAnswersSchema.parse(raw);
const viewOf = (answers: CheckerAnswers): CheckView => checkView(buildCheckTimeline(pack, answers, DATE), answers);
const CASES = FILE.cases.map((c) => ({ id: c.id, answers: accepted(c.answers) }));

/** Every cell of a view, with the row and line it sits on. */
function cellsOf(view: CheckView): { row: RowId; kind: LineKind; requirement: string; cell: CellView }[] {
  return view.rows.flatMap((row) => row.lines.flatMap((line) => line.cells.map((cell) => ({ row: row.id, kind: line.kind, requirement: line.requirement, cell }))));
}

const shownIds = (answers: CheckerAnswers): Set<QuestionId> => new Set(visibleQuestions(answers).map((q) => q.id));

// ---------------------------------------------------------------------------
// Words: each cell its own line kind's and state's
// ---------------------------------------------------------------------------

describe('each cell is worded by its own line kind and state', () => {
  const views = CASES.map((c) => ({ id: c.id, view: viewOf(c.answers) }));

  it('positive control: the 40 authored cases reach every reachable pair of line kind and state', () => {
    const observed = new Set(views.flatMap(({ view }) => cellsOf(view).map((c) => `${c.kind} ${c.cell.state}`)));
    const exported = new Set(LINE_KINDS.flatMap((kind) => reachableCellStates(pack, kind).map((state) => `${kind} ${state}`)));
    expect([...observed].sort()).toEqual([...exported].sort());
  });

  it('each cell shows the words and glyph of its own kind and state', () => {
    const wrong: string[] = [];
    for (const { id, view } of views) {
      for (const { row, kind, requirement, cell } of cellsOf(view)) {
        const own = stateWords(kind, cell.state);
        if (cell.words !== own.words || cell.glyph !== own.glyph) wrong.push(`${id}: ${row} ${requirement} ${cell.startYear} shows "${cell.words}" ${cell.glyph}, not "${own.words}" ${own.glyph}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('counterexample: no cell shows another state’s words of its own kind', () => {
    const borrowed: string[] = [];
    for (const { id, view } of views) {
      for (const { row, kind, requirement, cell } of cellsOf(view)) {
        for (const [state, other] of Object.entries(DP1_WORDING.states[kind] ?? {})) {
          if (state !== cell.state && other !== undefined && other.words === cell.words) borrowed.push(`${id}: ${row} ${requirement} ${cell.startYear} (${cell.state}) shows ${state}'s words`);
        }
      }
    }
    expect(borrowed).toEqual([]);
  });

  it('counterexample: no definitive cell shows the same state’s words from another kind; a duty line never shows exemption words', () => {
    const borrowed: string[] = [];
    let duty = 0;
    for (const { id, view } of views) {
      for (const { row, kind, requirement, cell } of cellsOf(view)) {
        if (cell.state !== 'applies' && cell.state !== 'does_not_apply') continue;
        if (kind === 'duty') duty += 1;
        for (const other of LINE_KINDS) {
          const words = DP1_WORDING.states[other]?.[cell.state]?.words;
          if (other !== kind && words !== undefined && words === cell.words) borrowed.push(`${id}: ${row} ${requirement} ${cell.startYear} (${kind}) shows ${other}'s ${cell.state} words`);
        }
        if (kind === 'duty') {
          for (const state of ['applies', 'does_not_apply'] as const) {
            if (cell.words === stateWords('exemption', state).words) borrowed.push(`${id}: duty line ${requirement} ${cell.startYear} shows exemption words`);
          }
        }
      }
    }
    expect(duty).toBeGreaterThan(0);
    expect(borrowed).toEqual([]);
  });

  it('every cell carrying a reason shows its words, and every cannot_decide cell has a reason and a next step (APP-11)', () => {
    const missing: string[] = [];
    let open = 0;
    for (const { id, view } of views) {
      for (const { row, requirement, cell } of cellsOf(view)) {
        if (cell.reasonCode !== null && cell.reason !== reasonWords(cell.reasonCode)) missing.push(`${id}: ${row} ${requirement} ${cell.startYear} reason words`);
        if (cell.state !== 'cannot_decide') continue;
        open += 1;
        if (cell.reason === null) missing.push(`${id}: ${row} ${requirement} ${cell.startYear} has no reason`);
        if (cell.step === null) missing.push(`${id}: ${row} ${requirement} ${cell.startYear} has no step`);
      }
    }
    expect(open).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('each row and line carries its own label, each line its legal basis exactly as sent, and the national row its note', () => {
    for (const c of CASES) {
      const timeline = buildCheckTimeline(pack, c.answers, DATE);
      const view = checkView(timeline, c.answers);
      expect(view.rows.map((r) => r.id)).toEqual(timeline.routes.map((r) => r.id));
      for (const [i, row] of view.rows.entries()) {
        expect([c.id, row.label]).toEqual([c.id, rowLabel(row.id)]);
        expect([c.id, row.id, row.note]).toEqual([c.id, row.id, row.id === 'national' ? nationalLineNote(timeline.country) : null]);
        for (const [j, line] of row.lines.entries()) {
          const sent = timeline.routes[i]!.lines[j]!;
          expect([c.id, line.kind, line.requirement, line.label, line.legalBasis]).toEqual([c.id, sent.kind, sent.requirement, lineLabel(row.id, sent.requirement), sent.legalBasis]);
          expect(line.cells.map((cell) => [cell.startYear, cell.state, cell.reasonCode, cell.needs])).toEqual(
            sent.cells.map((cell) => [cell.startYear, cell.state, cell.reason ?? null, cell.needs ?? []]),
          );
        }
      }
    }
  });
});

describe('the banners and the column headings', () => {
  const answers = CASES.find((c) => c.id === 'golden-widest-slice')!.answers;

  it('the preliminary label, the draft label while content.draft is true, the threshold in force, the hypothetical heading and each start year’s column', () => {
    const view = viewOf(answers);
    expect(view.labels).toEqual({ heading: PRELIMINARY_LABEL, draft: DRAFT_LABEL, threshold: thresholdWords('draft_labelled'), columnHeading: COLUMN_HEADING });
    expect(view.columns).toEqual(CHECK_START_YEARS.map((startYear) => ({ startYear, heading: startYearHeading(startYear) })));
  });

  it('counterexample: a signed, fresh repository gives no draft label, and keeps the others', () => {
    const signed = loadVerifiedCsrdPack(buildFixtureRepository().engineRoot);
    const view = checkView(buildCheckTimeline(signed, answers, DATE), answers);
    expect(view.content.draft).toBe(false);
    expect(view.labels).toEqual({ heading: PRELIMINARY_LABEL, draft: null, threshold: thresholdWords('draft_labelled'), columnHeading: COLUMN_HEADING });
  });
});

// ---------------------------------------------------------------------------
// The next step (the user's rule of 2026-10-26)
// ---------------------------------------------------------------------------

/** One open cell's step, as `row requirement year → question (fact)`. */
const stepLine = (c: { row: RowId; requirement: string; cell: CellView }): string =>
  `${c.row} ${c.requirement} ${c.cell.startYear} → ${c.cell.step?.asks ?? 'asks nothing'}${c.cell.step?.fact ? ` (${c.cell.step.fact})` : ''}`;

describe('the next step: the first need whose fact a question the visitor is shown sets in the visitor’s context', () => {
  it('the hidden-C-6 case: an EU parent with C-4 "450 or fewer" and C-9 "Not sure" gets C-9’s headcount step on its own lines, never C-6’s', () => {
    const answers = accepted({
      country: 'DE',
      group: 'parent',
      organisation: 'private_limited',
      employees: '450_or_fewer',
      turnover: 'over_500m',
      parentOwnEmployees: 'not_sure',
      parentOwnTurnover: 'over_500m',
    });
    const shown = shownIds(answers);
    // Positive controls: C-6 is hidden here, and the first need of the first-wave cells is C-6's fact, so reading "the first need's step" literally would offer it.
    expect([shown.has('C-6'), shown.has('C-9')]).toEqual([false, true]);
    const own = cellsOf(viewOf(answers)).filter((c) => c.row === 'parent_own' && c.cell.state === 'cannot_decide');
    expect(own.length).toBeGreaterThan(0);
    const firstWave = own.filter((c) => c.cell.startYear === 2025 || c.cell.startYear === 2026);
    expect(firstWave.map((c) => c.cell.needs[0]?.factType)).toEqual(firstWave.map(() => 'entity.is_public_interest_entity'));
    expect(own.map(stepLine)).toEqual(own.map((c) => `parent_own ${c.requirement} ${c.cell.startYear} → C-9 (entity.avg_employees)`));
    expect(own.every((c) => c.cell.step?.words === nextStep('entity.avg_employees', 'missing_fact').words)).toBe(true);
  });

  it('counterexample: an individual company’s headcount and turnover steps link C-4 and C-5; a parent’s own link C-9 and C-10; the group’s link C-4 and C-5', () => {
    const company = { country: 'DE', group: 'none', organisation: 'private_limited', pie: 'yes' } as const;
    const parent = { country: 'DE', group: 'parent', organisation: 'private_limited', pie: 'yes' } as const;
    // Each fixture straddles one threshold with one band, so the cell's first (range) need is that figure.
    const headcount = viewOf(accepted({ ...company, employees: 'over_450_up_to_550', turnover: 'over_500m' }));
    const turnover = viewOf(accepted({ ...company, employees: 'over_1100', turnover: 'over_400m_up_to_500m' }));
    const parentHeadcount = viewOf(accepted({ ...parent, employees: 'over_900_up_to_1100', turnover: 'over_500m', parentOwnEmployees: 'over_450_up_to_550', parentOwnTurnover: 'over_500m' }));
    const parentTurnover = viewOf(accepted({ ...parent, employees: 'over_1100', turnover: 'over_400m_up_to_500m', parentOwnEmployees: 'over_1100', parentOwnTurnover: 'over_400m_up_to_500m' }));
    const at = (view: CheckView, row: RowId, requirement: string, year: number) => {
      const found = cellsOf(view).find((c) => c.row === row && c.requirement === requirement && c.cell.startYear === year);
      if (found === undefined) throw new Error(`no ${row} ${requirement} ${year}`);
      return stepLine(found);
    };
    expect([at(headcount, 'individual', 'CSRD-S-017', 2025), at(turnover, 'individual', 'CSRD-S-017', 2027)]).toEqual([
      'individual CSRD-S-017 2025 → C-4 (entity.avg_employees)',
      'individual CSRD-S-017 2027 → C-5 (entity.net_turnover_eur)',
    ]);
    expect([at(parentHeadcount, 'parent_own', 'CSRD-S-017', 2025), at(parentTurnover, 'parent_own', 'CSRD-S-017', 2027)]).toEqual([
      'parent_own CSRD-S-017 2025 → C-9 (entity.avg_employees)',
      'parent_own CSRD-S-017 2027 → C-10 (entity.net_turnover_eur)',
    ]);
    expect([at(parentHeadcount, 'consolidated', 'CSRD-S-018', 2027), at(parentTurnover, 'consolidated', 'CSRD-S-018', 2027)]).toEqual([
      'consolidated CSRD-S-018 2027 → C-4 (group.avg_employees)',
      'consolidated CSRD-S-018 2027 → C-5 (group.consolidated_net_turnover_eur)',
    ]);
  });

  it('where no need has such a question, the step is the first need whose step asks nothing: the consolidated duty’s holding status, which the free check does not ask', () => {
    const answers = CASES.find((c) => c.id === 'parent-group-large-parent-unchecked')!.answers;
    const cell = cellsOf(viewOf(answers)).find((c) => c.row === 'consolidated' && c.requirement === 'CSRD-S-021' && c.cell.startYear === 2027)!;
    expect(cell.cell.needs.map((n) => n.factType)).toEqual(['entity.is_financial_holding_undertaking', 'group.subsidiaries_business_models_independent', 'entity.art_29a_7a_option_exercised']);
    expect(cell.cell.step).toEqual({ words: nextStep('entity.is_financial_holding_undertaking', 'missing_fact').words, asks: null, askLabel: null, fact: 'entity.is_financial_holding_undertaking' });
  });

  it('a review reason asks nothing: the national line’s review step, and an uncatalogued country’s issuer line', () => {
    const de = cellsOf(viewOf(CASES.find((c) => c.id === 'eu-no-group-settled')!.answers)).filter((c) => c.row === 'national');
    expect(de.length).toBe(4);
    expect(de.every((c) => c.cell.state === 'requires_review' && c.cell.step?.words === REVIEW_STEP.words && c.cell.step.asks === null)).toBe(true);
    const ar = cellsOf(viewOf(CASES.find((c) => c.id === 'non-eu-uncatalogued-country')!.answers)).filter((c) => c.row === 'issuer');
    expect(ar.every((c) => c.cell.state === 'cannot_decide' && c.cell.step?.words === REVIEW_STEP.words && c.cell.step.asks === null)).toBe(true);
  });

  it('cells that name no fact take their row’s step: the issuer’s not_yet_covered, the parent’s own not_checked (which links C-9), the exemption’s not_checked', () => {
    const issuer = cellsOf(viewOf(CASES.find((c) => c.id === 'non-eu-group-both-years')!.answers)).filter((c) => c.row === 'issuer');
    expect(issuer.map((c) => [c.cell.state, c.cell.step?.words, c.cell.step?.asks])).toEqual(issuer.map(() => ['not_yet_covered', rowStep('issuer', 'not_yet_covered').words, null]));
    const parentOwn = cellsOf(viewOf(CASES.find((c) => c.id === 'parent-group-large-parent-unchecked')!.answers)).filter((c) => c.row === 'parent_own' && c.cell.state === 'not_checked');
    expect(parentOwn.length).toBeGreaterThan(0);
    expect(parentOwn.every((c) => c.cell.step?.words === rowStep('parent_own', 'not_checked').words && c.cell.step.asks === 'C-9')).toBe(true);
    const exemption = cellsOf(viewOf(CASES.find((c) => c.id === 'owned-below-both')!.answers)).filter((c) => c.row === 'exemption');
    expect(exemption.every((c) => c.cell.state === 'not_checked' && c.cell.step?.words === rowStep('exemption', 'not_checked').words && c.cell.step.asks === null)).toBe(true);
  });

  it('a row step that would offer a question the visitor is not shown is not offered: a country-“Not sure” intermediate parent’s own not_checked cells show no step, while its country step asks C-1', () => {
    const answers = CASES.find((c) => c.id === 'not-sure-country-intermediate-parent')!.answers;
    const shown = shownIds(answers);
    expect([shown.has('C-9'), rowStep('parent_own', 'not_checked').asks]).toEqual([false, ['C-9', 'C-10']]);
    const cells = cellsOf(viewOf(answers));
    const own = cells.filter((c) => c.row === 'parent_own');
    expect(own.map((c) => `${c.requirement} ${c.cell.startYear} ${c.cell.state} ${c.cell.step === null ? 'no step' : c.cell.step.asks}`)).toEqual(
      own.map((c) => `${c.requirement} ${c.cell.startYear} not_checked no step`),
    );
    expect(cells.some((c) => c.cell.step?.asks === 'C-1' && c.cell.step.fact === 'entity.incorporation_country')).toBe(true);
  });

  it('a step’s link carries the question as the visitor is asked it', () => {
    const answers = CASES.find((c) => c.id === 'not-sure-employees')!.answers;
    const cell = cellsOf(viewOf(answers)).find((c) => c.cell.step?.asks === 'C-4')!;
    expect(cell.cell.step?.askLabel).toBe('About how many people work for your company?');
  });
});

describe('"sets in this visitor’s context": a definite answer changes the fact, compared with "Not sure"', () => {
  it('C-4 sets the group’s headcount for a parent and the company’s otherwise; C-9 sets the parent company’s own', () => {
    const parent = accepted({ country: 'DE', group: 'parent' });
    const none = accepted({ country: 'DE', group: 'none' });
    const probe = (set: ReadonlySet<string>) => ['entity.avg_employees', 'group.avg_employees'].map((f) => [f, set.has(f)]);
    expect(probe(factsSetBy(parent, 'C-4'))).toEqual([['entity.avg_employees', false], ['group.avg_employees', true]]);
    expect(probe(factsSetBy(none, 'C-4'))).toEqual([['entity.avg_employees', true], ['group.avg_employees', false]]);
    expect(probe(factsSetBy(parent, 'C-9'))).toEqual([['entity.avg_employees', true], ['group.avg_employees', false]]);
  });

  it('a fact present in every answer proves nothing: C-8 always writes the ultimate parent’s country for a company at the top of its group, so C-8 does not set it', () => {
    const us = accepted({ country: 'US', group: 'none' });
    const unsure = buildCheckProfile({ ...us, euTurnover: 'not_sure' }).facts.map((f) => f.factType);
    expect(unsure).toEqual(expect.arrayContaining(['group.ultimate_parent_country', 'third_country.eu_turnover_year_1_eur']));
    const set = factsSetBy(us, 'C-8');
    expect([...set].sort()).toEqual(['third_country.eu_turnover_year_1_eur', 'third_country.eu_turnover_year_2_eur']);
  });
});

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/** Task 4's rule for a cell's needs (`check-timeline.ts`, `cellNeeds`): each fact and reason once, range first. Restated; its exactness is tested below. */
function cellNeedsOf(needs: EngineOutcome['needs']): CellNeed[] {
  const seen = new Set<string>();
  const unique: CellNeed[] = [];
  for (const need of needs) {
    const key = `${need.factType} ${need.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ factType: need.factType, reason: need.reason });
  }
  return [...unique.filter((n) => n.reason === 'range_crosses_threshold'), ...unique.filter((n) => n.reason !== 'range_crosses_threshold')];
}

/** A flow's timeline, its cells built from the guard's evaluation over the memoised engine. Legal basis is left empty: the step rule never reads it. */
function sweepTimeline(ctx: GuardContext, answers: CheckerAnswers): CheckTimeline {
  const evaluation = evaluateForGuard(ctx, answers);
  const routes: CheckRoute[] = [];
  for (const line of evaluation.lines) {
    let route = routes[routes.length - 1];
    if (route === undefined || route.id !== line.row) {
      route = { id: line.row, lines: [] };
      routes.push(route);
    }
    route.lines.push({
      kind: line.kind,
      requirement: line.requirement,
      legalBasis: { sources: [], locators: [] },
      cells: CHECK_START_YEARS.map((startYear): CheckCell => {
        const state = evaluation.display.get(`${line.row} ${line.requirement} ${startYear}`) as CellState | undefined;
        if (state === undefined) throw new Error(`no displayed state for ${line.row} ${line.requirement} ${startYear}`);
        if (state === 'not_checked') return { startYear, state };
        const outcome = evaluation.engine.get(startYear)!.get(line.requirement)!;
        const cell: CheckCell = { startYear, state };
        if (outcome.reason !== undefined) cell.reason = outcome.reason;
        const needs = state === 'not_yet_covered' ? [] : cellNeedsOf(outcome.needs);
        if (needs.length > 0) cell.needs = needs;
        return cell;
      }),
    });
  }
  const country = answers.country === undefined ? null : answers.country === 'other' ? (answers.countryOther ?? null) : answers.country;
  return {
    assessedAt: DATE,
    basis: 'start_year',
    startYears: [...CHECK_START_YEARS],
    hypothetical: true,
    preliminary: true,
    pack: { id: pack.id, version: pack.version, legalSnapshot: pack.legalSnapshot },
    content: { draft: true, threshold: 'draft_labelled' },
    country,
    routes,
  };
}

const withoutBasis = (routes: CheckRoute[]) => routes.map((r) => ({ id: r.id, lines: r.lines.map((l) => ({ kind: l.kind, requirement: l.requirement, cells: l.cells })) }));

describe('the step rule over every reachable flow (Task 4’s enumeration)', () => {
  /** The guard's context at the cases' date, so a reconstruction compares with `buildCheckTimeline` at the same date. */
  const ctx: GuardContext = { ...guardContext(pack), engine: memoisedEngine(pack, DATE) };

  it('the reconstruction equals buildCheckTimeline over the 40 authored cases', () => {
    for (const c of CASES) {
      expect([c.id, withoutBasis(sweepTimeline(ctx, c.answers).routes)]).toEqual([c.id, withoutBasis(buildCheckTimeline(pack, c.answers, DATE).routes)]);
    }
  });

  it(
    'no cell’s step offers a question the visitor is not shown; every cannot_decide cell has a step; and the only open cells without one are the country-“Not sure” parents’ own not_checked cells',
    () => {
      const started = performance.now();
      const rejected = { count: 0 };
      const offersHidden = new Map<string, number>();
      const noStep = new Map<string, number>();
      const stepless = new Map<string, number>();
      const sampled: string[] = [];
      let flows = 0;
      let cannotDecide = 0;
      for (const { answers, visible } of reachableFlows(ctx, guardCountries(pack), rejected)) {
        flows += 1;
        const timeline = sweepTimeline(ctx, answers);
        if (flows % 997 === 0) {
          const direct = withoutBasis(buildCheckTimeline(pack, answers, DATE).routes);
          if (JSON.stringify(direct) !== JSON.stringify(withoutBasis(timeline.routes))) sampled.push(JSON.stringify(answers));
        }
        const shown = new Set(visible.map((q) => q.id));
        for (const { row, requirement, cell } of cellsOf(checkView(timeline, answers))) {
          if (cell.state === 'cannot_decide') cannotDecide += 1;
          if (cell.step !== null && cell.step.asks !== null && !shown.has(cell.step.asks)) {
            const key = `${row} ${requirement} ${cell.state} offers ${cell.step.asks}, which the visitor is not shown: ${JSON.stringify(answers)}`;
            offersHidden.set(key, (offersHidden.get(key) ?? 0) + 1);
          }
          if (cell.step === null && cell.state === 'cannot_decide') {
            const key = `${row} ${requirement} ${cell.startYear} cannot_decide with needs ${JSON.stringify(cell.needs)}: ${JSON.stringify(answers)}`;
            noStep.set(key, (noStep.get(key) ?? 0) + 1);
          }
          if (cell.step === null && (cell.state === 'not_checked' || cell.state === 'not_yet_covered' || cell.state === 'requires_review')) {
            const key = `${row} ${cell.state} · country ${String(answers.country)} · group ${String(answers.group)}`;
            stepless.set(key, (stepless.get(key) ?? 0) + 1);
          }
        }
      }
      const seconds = (performance.now() - started) / 1000;
      console.log(`step sweep: ${flows} flows, ${cannotDecide} cannot_decide cells, ${seconds.toFixed(1)} s; open cells without a step: ${JSON.stringify([...stepless])}`);
      expect(rejected.count).toBe(0);
      expect(flows).toBeGreaterThan(100_000);
      expect(sampled).toEqual([]);
      expect([...offersHidden.keys()].slice(0, 8)).toEqual([]);
      expect([...noStep.keys()].slice(0, 8)).toEqual([]);
      expect(cannotDecide).toBeGreaterThan(1_000_000);
      // Measured on 2026-10-26 by a one-off sweep before this rule was written: 16 cells, 8 for each, every one of whose row step asks the hidden C-9 and C-10.
      expect([...stepless].sort()).toEqual([
        ['parent_own not_checked · country not_sure · group both', 8],
        ['parent_own not_checked · country not_sure · group parent', 8],
      ]);
    },
    1_800_000,
  );
});

// ---------------------------------------------------------------------------
// Answers the visitor was not shown, and the request body
// ---------------------------------------------------------------------------

describe('answers to questions the visitor is not shown', () => {
  const de = { country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'no' } as const;

  it('names C-8 sent for a German company, and nothing for the same answer from a US company (positive control)', () => {
    expect(answeredHiddenQuestions(accepted({ ...de, euTurnover: 'both' }))).toEqual(['C-8']);
    expect(answeredHiddenQuestions(accepted({ country: 'US', group: 'none', euTurnover: 'both' }))).toEqual([]);
    expect(answeredHiddenQuestions(accepted(de))).toEqual([]);
  });

  it('names C-6 answered where C-4 hides it, and C-7 answered by a company with no group', () => {
    expect(answeredHiddenQuestions(accepted({ ...de, employees: '450_or_fewer', pie: 'yes' }))).toEqual(['C-6']);
    expect(answeredHiddenQuestions(accepted({ ...de, parentReport: 'yes' }))).toEqual(['C-7']);
  });

  it('shownAnswers drops them, so a changed earlier answer never posts a hidden one: C-4 changed to "450 or fewer" drops C-6', () => {
    const changed = accepted({ ...de, employees: '450_or_fewer', turnover: 'up_to_400m', pie: 'yes' });
    expect(shownAnswers(changed)).toEqual({ country: 'DE', group: 'none', organisation: 'private_limited', employees: '450_or_fewer', turnover: 'up_to_400m' });
    expect(answeredHiddenQuestions(shownAnswers(changed))).toEqual([]);
    // A country changed to the US drops every EU question and keeps C-8.
    expect(shownAnswers({ ...changed, country: 'US', euTurnover: 'no' })).toEqual({ country: 'US', group: 'none', euTurnover: 'no' });
  });

  it('the request body sends countryOther upper-case, which the schema needs: it refuses lower case', () => {
    expect(requestBody({ country: 'other', countryOther: 'ar', group: 'none', euTurnover: 'both' } as CheckerAnswers)).toEqual({ country: 'other', countryOther: 'AR', group: 'none', euTurnover: 'both' });
    expect(checkerAnswersSchema.safeParse({ country: 'other', countryOther: 'ar', group: 'none' }).success).toBe(false);
    expect(checkerAnswersSchema.safeParse({ country: 'other', countryOther: 'AR', group: 'none' }).success).toBe(true);
  });
});

describe('the offer "Check the parent company on its own too"', () => {
  it('is offered only where visibleQuestions lists C-9 and C-10: an EU parent, never a fund, never an owned company', () => {
    const offerFor = (raw: Record<string, unknown>) => viewOf(accepted(raw)).offer;
    const base = { country: 'DE', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'yes' };
    expect([offerFor({ ...base, group: 'parent' }), offerFor({ ...base, group: 'both', parentReport: 'yes' })]).toEqual([PARENT_OWN_OFFER, PARENT_OWN_OFFER]);
    expect([offerFor({ ...base, group: 'parent', organisation: 'fund', pie: undefined }), offerFor({ ...base, group: 'owned', parentReport: 'yes' }), offerFor({ country: 'US', group: 'parent', euTurnover: 'both' })]).toEqual([null, null, null]);
  });

  it('is the sentence the approved row steps quote', () => {
    expect(rowStep('parent_own', 'not_checked').words).toContain(`“${PARENT_OWN_OFFER}”`);
    expect(rowStep('exemption', 'not_checked').words).toContain(`“${PARENT_OWN_OFFER}”`);
  });
});

// ---------------------------------------------------------------------------
// The old modules are gone
// ---------------------------------------------------------------------------

describe('the old modules are gone', () => {
  const WEB = fileURLToPath(new URL('..', import.meta.url));
  const REPO = join(WEB, '..', '..');
  const DIRS = [join(WEB, 'app'), join(WEB, 'components'), join(WEB, 'lib'), join(WEB, 'test'), join(REPO, 'scripts')];
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx|mjs|cjs|js)$/.test(e.name) ? [join(dir, e.name)] : []));
  /** Every module specifier a file imports, requires or loads dynamically. */
  const specifiers = (path: string): string[] =>
    [...readFileSync(path, 'utf8').matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  const OLD = /(^|\/)lib\/(checker|checkResponse)(\.ts)?$/;

  it('lib/checker.ts and lib/checkResponse.ts no longer exist', () => {
    expect([existsSync(join(WEB, 'lib', 'checker.ts')), existsSync(join(WEB, 'lib', 'checkResponse.ts'))]).toEqual([false, false]);
  });

  it('no file under app/, components/, lib/, test/ or scripts/ imports either; positive control: the scan finds the flow importing the view model', () => {
    const scanned = DIRS.flatMap(files);
    const importers = scanned.flatMap((path) => specifiers(path).filter((s) => OLD.test(s)).map((s) => `${relative(REPO, path)}: ${s}`));
    expect(importers).toEqual([]);
    expect(specifiers(join(WEB, 'components', 'marketing', 'CheckFlow.tsx'))).toContain('@/lib/check-view');
    expect(OLD.test('@/lib/checker') && OLD.test('@/lib/checkResponse') && !OLD.test('@/lib/check-view')).toBe(true);
  });
});
