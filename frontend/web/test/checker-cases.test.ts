/**
 * The free checker's timeline, held to the authored cases, and each line held
 * to its own requirement.
 *
 * **Why this file exists.** The timeline is where a visitor reads whether a
 * route applies, and its defects are quiet ones: a column run for the wrong
 * year, one route's result shown on another's line, an exemption line reading
 * the duty, an unencoded route shown as "does not apply", a need that asks the
 * visitor again for what they already said. None of these throws. So the
 * expected rows and cells come from `checker-cases.json`, written from the
 * proposal's tables and the law before the module existed (§4.2, §4.3, §4.4,
 * §4.6, §9.2; rule R; KNW-14), never from the module's output; and a second
 * runner here checks every line against the engine's own raw output for the
 * line's named requirement, called directly with `assess` rather than through
 * `buildCheckTimeline` (plan Task 4, "One requirement per line").
 *
 * Failure messages name the case, the row, the requirement and the start year,
 * so a red run says which column is wrong (teeth T4a).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assess } from '@datastrata/engine';
import type { Determination, FactNeed } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';
import { buildCheckProfile, CHECK_ENTITY_ID, checkerAnswersSchema, visibleQuestions, type CheckerAnswers } from '@/lib/check-answers';
import { CHECK_ROWS, LINE_KINDS } from '@/lib/check-routes';
import { buildCheckTimeline, CELL_STATES, CHECK_START_YEARS, type CheckTimeline } from '@/lib/check-timeline';

// ---------------------------------------------------------------------------
// The authored file
// ---------------------------------------------------------------------------

interface CaseLine {
  kind: string;
  requirement: string;
  cells: string[];
}
interface CaseRoute {
  id: string;
  lines: CaseLine[];
}
interface CheckerCase {
  id: string;
  cites: string;
  why: string;
  answers: Record<string, unknown>;
  country: string | null;
  routes: CaseRoute[];
}
interface CasesFile {
  assessmentDate: string;
  startYears: number[];
  every: { basis: string; startYears: number[]; hypothetical: boolean; preliminary: boolean; contentThreshold: string };
  cases: CheckerCase[];
}

const CASES_PATH = fileURLToPath(new URL('./checker-cases.json', import.meta.url));
const FILE = JSON.parse(readFileSync(CASES_PATH, 'utf8')) as CasesFile;
const DATE = FILE.assessmentDate;

/** The question each answer field belongs to (§4.1). `countryOther` travels with C-1. */
const FIELD_QUESTION: Record<string, string> = {
  country: 'C-1',
  countryOther: 'C-1',
  group: 'C-2',
  organisation: 'C-3',
  employees: 'C-4',
  turnover: 'C-5',
  pie: 'C-6',
  parentReport: 'C-7',
  euTurnover: 'C-8',
  parentOwnEmployees: 'C-9',
  parentOwnTurnover: 'C-10',
};

/** The EU Member States (§4.1, C-1), for the sweeps below. */
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);

// ---------------------------------------------------------------------------
// Rendering a payload cell in the file's grammar
// ---------------------------------------------------------------------------

type Cell = CheckTimeline['routes'][number]['lines'][number]['cells'][number];

/**
 * `<state> [<reason> [<firstNeed>[:<needReason>]]]`. The need's reason is
 * rendered only where the expectation writes one, so the comparison asserts
 * exactly what the case states.
 */
function render(cell: Cell, withNeedReason: boolean): string {
  const parts: string[] = [cell.state];
  if (cell.reason !== undefined) parts.push(cell.reason);
  const first = cell.needs?.[0];
  if (first !== undefined) parts.push(withNeedReason ? `${first.factType}:${first.reason}` : first.factType);
  return parts.join(' ');
}

const wantsNeedReason = (expected: string): boolean => (expected.split(' ')[2] ?? '').includes(':');

// ---------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------

describe('checker-cases.json is a well-formed oracle', () => {
  it('names the four start years, and every case gives four cells per line', () => {
    expect(FILE.startYears).toEqual([2025, 2026, 2027, 2028]);
    expect(FILE.cases.length).toBeGreaterThanOrEqual(30);
    for (const c of FILE.cases) {
      for (const route of c.routes) {
        for (const line of route.lines) expect([c.id, route.id, line.requirement, line.cells.length]).toEqual([c.id, route.id, line.requirement, 4]);
      }
    }
  });

  it('every case id is unique, and every case cites its section', () => {
    const ids = FILE.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of FILE.cases) expect([c.id, c.cites.length > 0, c.why.length > 0]).toEqual([c.id, true, true]);
  });

  it('between them the cases reach every row, every line kind and every cell state (failure mode 7)', () => {
    const rows = new Set<string>();
    const kinds = new Set<string>();
    const states = new Set<string>();
    for (const c of FILE.cases) {
      for (const route of c.routes) {
        rows.add(route.id);
        for (const line of route.lines) {
          kinds.add(line.kind);
          for (const cell of line.cells) states.add(cell.split(' ')[0]!);
        }
      }
    }
    expect([...rows].sort()).toEqual(CHECK_ROWS.map((r) => r.id).sort());
    expect([...kinds].sort()).toEqual([...LINE_KINDS].sort());
    expect([...states].sort()).toEqual([...CELL_STATES].sort());
  });
});

describe('every case, against buildCheckTimeline', () => {
  const pack = csrdPack();

  for (const c of FILE.cases) {
    describe(c.id, () => {
      it('the answers are accepted, and are a flow the questions can produce: every answer to a shown question, every shown question answered', () => {
        const answers = checkerAnswersSchema.parse(c.answers);
        const shown = visibleQuestions(answers);
        const answered = [...new Set(Object.keys(c.answers).map((field) => FIELD_QUESTION[field]))];
        const hidden = answered.filter((q) => !shown.some((v) => v.id === q));
        const unanswered = shown.filter((v) => !v.optional && !answered.includes(v.id)).map((v) => v.id);
        expect({ hidden, unanswered }).toEqual({ hidden: [], unanswered: [] });
      });

      it('carries the fixed fields: start-year basis, four years, hypothetical, preliminary, the threshold in force, the date and the country', () => {
        const timeline = buildCheckTimeline(pack, checkerAnswersSchema.parse(c.answers), DATE);
        expect({
          assessedAt: timeline.assessedAt,
          basis: timeline.basis,
          startYears: timeline.startYears,
          hypothetical: timeline.hypothetical,
          preliminary: timeline.preliminary,
          contentThreshold: timeline.content.threshold,
          country: timeline.country,
        }).toEqual({
          assessedAt: DATE,
          basis: FILE.every.basis,
          startYears: FILE.every.startYears,
          hypothetical: FILE.every.hypothetical,
          preliminary: FILE.every.preliminary,
          contentThreshold: FILE.every.contentThreshold,
          country: c.country,
        });
      });

      it('shows exactly the expected rows, in order, each with exactly its lines', () => {
        const timeline = buildCheckTimeline(pack, checkerAnswersSchema.parse(c.answers), DATE);
        const shape = (routes: { id: string; lines: { kind: string; requirement: string }[] }[]) =>
          routes.map((r) => `${r.id}: ${r.lines.map((l) => `${l.kind} ${l.requirement}`).join(', ')}`);
        expect(shape(timeline.routes)).toEqual(shape(c.routes));
      });

      for (const route of c.routes) {
        it(`row ${route.id}: every cell, by start year`, () => {
          const timeline = buildCheckTimeline(pack, checkerAnswersSchema.parse(c.answers), DATE);
          const actual = timeline.routes.find((r) => r.id === route.id);
          expect(actual, `case ${c.id} shows row ${route.id}`).toBeDefined();
          const got: string[] = [];
          const want: string[] = [];
          route.lines.forEach((line, i) => {
            const actualLine = actual!.lines[i];
            CHECK_START_YEARS.forEach((year, y) => {
              const expected = line.cells[y]!;
              want.push(`${line.requirement} ${year}: ${expected}`);
              const cell = actualLine?.cells.find((x) => x.startYear === year);
              got.push(`${actualLine?.requirement ?? 'no line'} ${year}: ${cell === undefined ? 'no cell' : render(cell, wantsNeedReason(expected))}`);
            });
          });
          expect(got, `case ${c.id}, row ${route.id}`).toEqual(want);
        });
      }
    });
  }
});

describe('sweeps over every case (law 6; KNW-14)', () => {
  const pack = csrdPack();
  const timelines = FILE.cases.map((c) => ({ c, t: buildCheckTimeline(pack, checkerAnswersSchema.parse(c.answers), DATE) }));

  it('every EU result, and every result for an unknown country, carries the national line reading requires_review in every year; a non-EU result carries none', () => {
    let eu = 0;
    let nonEu = 0;
    for (const { c, t } of timelines) {
      const national = t.routes.find((r) => r.id === 'national');
      const euOrUnknown = c.country === 'not_sure' || (c.country !== null && EU.has(c.country));
      if (euOrUnknown) {
        eu += 1;
        expect([c.id, national?.lines.flatMap((l) => l.cells.map((x) => x.state))]).toEqual([c.id, ['requires_review', 'requires_review', 'requires_review', 'requires_review']]);
      } else {
        nonEu += 1;
        expect([c.id, national]).toEqual([c.id, undefined]);
      }
    }
    // Both sides were seen.
    expect(eu).toBeGreaterThan(0);
    expect(nonEu).toBeGreaterThan(0);
  });

  it('the issuer line never reads does_not_apply, and a not_yet_covered cell never carries a need (Task 2); an open issuer cell for an unknown country does (positive control)', () => {
    let notYetCovered = 0;
    let openWithNeed = 0;
    for (const { c, t } of timelines) {
      for (const line of t.routes.find((r) => r.id === 'issuer')?.lines ?? []) {
        for (const cell of line.cells) {
          expect([c.id, cell.startYear, cell.state]).not.toEqual([c.id, cell.startYear, 'does_not_apply']);
          if (cell.state === 'not_yet_covered') {
            notYetCovered += 1;
            expect([c.id, cell.startYear, cell.needs]).toEqual([c.id, cell.startYear, undefined]);
          }
          if (cell.state === 'cannot_decide' && (cell.needs?.length ?? 0) > 0) openWithNeed += 1;
        }
      }
    }
    expect(notYetCovered).toBeGreaterThan(0);
    expect(openWithNeed).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// One requirement per line, against the raw engine output
// ---------------------------------------------------------------------------

/**
 * The mapping, written out here rather than imported (plan Task 4, "The
 * mapping" and "The exceptions"): an independent reconstruction of what each
 * line kind shows for its own requirement's determination.
 */
function expectedState(kind: string, d: Determination): string {
  if (kind === 'national') return 'requires_review';
  if (d.result === 'APPLIES') return 'applies';
  if (d.result === 'DOES_NOT_APPLY') return 'does_not_apply';
  if (kind === 'coverage_gap' && d.reason === 'source_status_unresolved') return 'not_yet_covered';
  return 'cannot_decide';
}

/** The payload's needs rule, written out: identical needs once each, the facts behind a straddled range first. */
function expectedNeeds(needs: FactNeed[]): { factType: string; reason: string }[] {
  const seen = new Set<string>();
  const unique: { factType: string; reason: string }[] = [];
  for (const n of needs) {
    const key = `${n.factType} ${n.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ factType: n.factType, reason: n.reason });
  }
  return [...unique.filter((n) => n.reason === 'range_crosses_threshold'), ...unique.filter((n) => n.reason !== 'range_crosses_threshold')];
}

describe('one requirement per line: each cell is its own requirement’s determination for that year, from assess called directly', () => {
  const pack = csrdPack();

  for (const c of FILE.cases) {
    it(c.id, () => {
      const answers: CheckerAnswers = checkerAnswersSchema.parse(c.answers);
      const profile = buildCheckProfile(answers);
      const raw = new Map(
        CHECK_START_YEARS.map((year) => [
          year,
          assess(pack, profile, { assessmentDate: DATE, financialYear: { start: `${year}-01-01`, end: `${year}-12-31` }, subjectId: CHECK_ENTITY_ID }).determinations,
        ]),
      );
      const timeline = buildCheckTimeline(pack, answers, DATE);
      const mismatches: string[] = [];
      let evaluated = 0;
      for (const route of timeline.routes) {
        for (const line of route.lines) {
          const where = `${route.id} ${line.kind} ${line.requirement}`;
          const first = raw.get(2025)!.find((d) => d.requirementId === line.requirement);
          if (first === undefined) {
            mismatches.push(`${where}: the engine holds no determination for it`);
            continue;
          }
          const basis = { sources: first.sources, locators: first.locators };
          const shown = { sources: line.legalBasis.sources.map((s) => s.id), locators: line.legalBasis.locators };
          if (JSON.stringify(shown) !== JSON.stringify(basis)) mismatches.push(`${where}: legal basis ${JSON.stringify(shown)}, its requirement cites ${JSON.stringify(basis)}`);
          for (const cell of line.cells) {
            const d = raw.get(cell.startYear as 2025)!.find((x) => x.requirementId === line.requirement)!;
            if (cell.state === 'not_checked') {
              if (cell.reason !== undefined || cell.needs !== undefined) mismatches.push(`${where} ${cell.startYear}: not_checked sends the engine's result`);
              continue;
            }
            evaluated += 1;
            const state = expectedState(line.kind, d);
            const needs = state === 'not_yet_covered' ? [] : expectedNeeds(d.needs);
            const want = { state, reason: d.reason, needs };
            const got = { state: cell.state, reason: cell.reason, needs: cell.needs ?? [] };
            if (JSON.stringify(got) !== JSON.stringify(want)) {
              mismatches.push(`${where} ${cell.startYear}: shows ${JSON.stringify(got)}, its requirement's determination gives ${JSON.stringify(want)}`);
            }
          }
        }
      }
      expect(mismatches).toEqual([]);
      expect(evaluated).toBeGreaterThan(0);
    });
  }
});
