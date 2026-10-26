/**
 * The free checker's result as a visitor reads it: the timeline payload joined
 * to the approved words, cell by cell, with the one next step each cell offers
 * (DP1 plan, Task 6; CHK-3, APP-11, EXP-3, EXP-6, KNW-10).
 *
 * **Why this module exists.** `buildCheckTimeline` sends ids, kinds, states and
 * reason codes, and `lib/wording.ts` holds the words. The join between them is
 * where a visitor is quietly misled: a cell worded with another kind's words, an
 * open cell with no reason or no step, a step that offers a question the visitor
 * is never shown, a question count the copy states that no visitor answers, an
 * answer to a hidden question posted and silently assessed. So the join is pure,
 * over the payload and the visitor's answers, and `CheckTimeline` only prints
 * what it returns.
 *
 * **The next step** (the user's rule of 2026-10-26; proposal §4.2, "the one step
 * that would settle it"). A cell's needs are taken in the order the timeline
 * sends them, range first. The step is that of the first need whose fact a
 * question shown to this visitor sets in this visitor's context. C-4 and C-9 are
 * alternatives for a headcount, C-5 and C-10 for a turnover, and the step links
 * whichever of the pair sets the fact for this visitor. Where no need has such a
 * question, the step is that of the first need whose step asks nothing (a fact
 * the free check does not ask, or a review reason). A cell that names no fact
 * takes its row's own step. A step never offers a question the visitor is not
 * shown, so a row step that would is not offered at all: a parent whose country
 * is "Not sure" is not offered C-9 and C-10, and its own lines read "Not
 * checked" while the same result's country step asks C-1.
 *
 * **"Sets in this visitor's context"** is read from `buildCheckProfile`, the one
 * place an answer becomes a fact, never from a map of question to fact. A
 * question sets a fact when some definite answer to it, the visitor's other
 * answers held, gives that fact a value other than "Not sure" gives. "Not sure"
 * stores the fact as unknown, so the fact's presence alone proves nothing (the
 * parent's sweep at Task 5, `factsSetBy`).
 *
 * Client-safe: the check flow, a client component, imports it. At run time it
 * imports the answers module and the wording module only; the timeline and the
 * routes are imported for their types.
 */

import type { ReasonCode } from '@datastrata/engine';
import {
  buildCheckProfile,
  CHECK_QUESTIONS,
  EU_COUNTRY_CODES,
  LISTED_NON_EU_COUNTRY_CODES,
  questionWording,
  visibleQuestions,
  type CheckerAnswers,
  type CheckQuestion,
  type QuestionId,
} from './check-answers';
import type { LineKind, RowId } from './check-routes';
import type { CellNeed, CellState, CheckCell, CheckSource, CheckTimeline, StartYear } from './check-timeline';
import {
  COLUMN_HEADING,
  DP1_WORDING,
  DRAFT_LABEL,
  ERROR_STATES,
  lineLabel,
  nationalLineNote,
  nextStep,
  PRELIMINARY_LABEL,
  reasonWords,
  rowLabel,
  startYearHeading,
  stateWords,
  thresholdWords,
  type ErrorState,
} from './wording';

// ---------------------------------------------------------------------------
// The questions
// ---------------------------------------------------------------------------

const QUESTIONS: ReadonlyMap<QuestionId, CheckQuestion> = new Map(CHECK_QUESTIONS.map((q) => [q.id, q]));

function question(id: QuestionId): CheckQuestion {
  const found = QUESTIONS.get(id);
  if (found === undefined) throw new Error(`no question ${id}`);
  return found;
}

/**
 * The offer on the result that asks C-9 and C-10 (proposal §4.1). The approved
 * row steps quote it, so it is stated once, here, and a test holds the two
 * together.
 */
export const PARENT_OWN_OFFER = 'Check the parent company on its own too';

/**
 * The questions answered that `visibleQuestions` does not show for these
 * answers, in order C-1 to C-10. The route refuses such answers with 400 rather
 * than dropping them, so a request cannot produce a result the questions could
 * not; the flow drops them before it posts.
 */
export function answeredHiddenQuestions(answers: CheckerAnswers): QuestionId[] {
  const shown = new Set(visibleQuestions(answers).map((q) => q.id));
  return CHECK_QUESTIONS.filter((q) => answers[q.field] !== undefined && !shown.has(q.id)).map((q) => q.id);
}

/**
 * The answers without those to questions they hide, dropped until none is
 * left, since changing an earlier answer can hide a later one; and "Another
 * country" only with its answer.
 */
export function shownAnswers(answers: CheckerAnswers): CheckerAnswers {
  let current: CheckerAnswers = { ...answers };
  for (let hidden = answeredHiddenQuestions(current); hidden.length > 0; hidden = answeredHiddenQuestions(current)) {
    const next: CheckerAnswers = { ...current };
    for (const id of hidden) delete next[question(id).field];
    current = next;
  }
  if (current.country !== 'other') delete current.countryOther;
  return current;
}

/** What the flow posts: the answers to the questions shown, with "Another country" as the upper-case ISO code the schema requires. */
export function requestBody(answers: CheckerAnswers): CheckerAnswers {
  const body = shownAnswers(answers);
  if (body.countryOther !== undefined) body.countryOther = body.countryOther.toUpperCase();
  return body;
}

// ---------------------------------------------------------------------------
// "Sets in this visitor's context"
// ---------------------------------------------------------------------------

/** Each fact type's stated facts in the profile of these answers, as one comparable string. */
function factValues(answers: CheckerAnswers): Map<string, string> {
  const values = new Map<string, string>();
  for (const fact of buildCheckProfile(answers).facts) values.set(fact.factType, `${values.get(fact.factType) ?? ''}${JSON.stringify(fact)}`);
  return values;
}

/**
 * The fact types question `id` sets for a visitor with these answers: those to
 * which some definite answer gives a value other than the one "Not sure" gives,
 * every other answer held.
 */
export function factsSetBy(answers: CheckerAnswers, id: QuestionId): ReadonlySet<string> {
  const { field, options } = question(id);
  const unsure = factValues({ ...answers, [field]: 'not_sure' } as CheckerAnswers);
  const set = new Set<string>();
  for (const option of options) {
    if (option.id === 'not_sure') continue;
    for (const [factType, value] of factValues({ ...answers, [field]: option.id } as CheckerAnswers)) {
      if (unsure.get(factType) !== value) set.add(factType);
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// How many questions the copy may say
// ---------------------------------------------------------------------------

export interface QuestionCount {
  /** The fewest questions any visitor must answer. */
  fewest: number;
  /** The most. */
  most: number;
  /** The optional questions a parent may add on the result (C-9, C-10). */
  optional: number;
}

let questionCount: QuestionCount | undefined;

/**
 * The question count the copy states (proposal §4.5), read from
 * `visibleQuestions` and never written: every way through the questions from
 * each of §4.5's visitor types, which C-1's side of the EU border (or "Not
 * sure") and C-2's answer tell apart, each shown question answered with each
 * of its options, in the order shown.
 */
export function checkQuestionCount(): QuestionCount {
  if (questionCount !== undefined) return questionCount;
  const count: QuestionCount = { fewest: Number.POSITIVE_INFINITY, most: 0, optional: 0 };
  const walk = (answers: CheckerAnswers): void => {
    const visible = visibleQuestions(answers);
    const next = visible.find((q) => !q.optional && answers[question(q.id).field] === undefined);
    if (next === undefined) {
      const required = visible.filter((q) => !q.optional).length;
      count.fewest = Math.min(count.fewest, required);
      count.most = Math.max(count.most, required);
      count.optional = Math.max(count.optional, visible.length - required);
      return;
    }
    const { field, options } = question(next.id);
    for (const option of options) walk({ ...answers, [field]: option.id } as CheckerAnswers);
  };
  for (const country of [EU_COUNTRY_CODES[0], LISTED_NON_EU_COUNTRY_CODES[0], 'not_sure'] as const) {
    for (const group of question('C-2').options) walk({ country, group: group.id } as CheckerAnswers);
  }
  questionCount = count;
  return count;
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export interface StepView {
  words: string;
  /** The one question the step links: shown to this visitor and, for a need, setting its fact for them. Null for a step that asks nothing. */
  asks: QuestionId | null;
  /** That question as the visitor is asked it. */
  askLabel: string | null;
  /** The fact the step would settle; null for a row's own step, which names none. */
  fact: string | null;
}

export interface CellView {
  startYear: StartYear;
  /** The column's heading, repeated in the cell for when the columns stack. */
  heading: string;
  state: CellState;
  words: string;
  glyph: string;
  reasonCode: ReasonCode | null;
  reason: string | null;
  needs: CellNeed[];
  step: StepView | null;
}

export interface LineView {
  kind: LineKind;
  requirement: string;
  label: string;
  legalBasis: { sources: CheckSource[]; locators: string[] };
  cells: CellView[];
}

export interface RowView {
  id: RowId;
  label: string;
  /** The national line's note, naming the country of registration as answered; null on every other row. */
  note: string | null;
  lines: LineView[];
}

export interface CheckView {
  assessedAt: string;
  basis: CheckTimeline['basis'];
  startYears: StartYear[];
  hypothetical: boolean;
  preliminary: boolean;
  pack: CheckTimeline['pack'];
  content: CheckTimeline['content'];
  country: string | null;
  labels: {
    /** The result's heading: it is preliminary. */
    heading: string;
    /** "Draft · evaluation only" while the content is draft; null otherwise. */
    draft: string | null;
    /** The content threshold in force (KNW-10). */
    threshold: string;
    /** The hypothetical heading over the start-year columns. */
    columnHeading: string;
  };
  columns: { startYear: StartYear; heading: string }[];
  rows: RowView[];
  /** The offer that asks C-9 and C-10, where `visibleQuestions` lists them; null elsewhere. */
  offer: string | null;
}

/**
 * The view of a timeline for the visitor whose answers produced it. Pure: the
 * same timeline and answers give the same view.
 */
export function checkView(timeline: CheckTimeline, answers: CheckerAnswers): CheckView {
  const shown = new Set(visibleQuestions(answers).map((q) => q.id));
  const sets = new Map<QuestionId, ReadonlySet<string>>();
  const setsFact = (id: QuestionId, factType: string): boolean => {
    let set = sets.get(id);
    if (set === undefined) {
      set = factsSetBy(answers, id);
      sets.set(id, set);
    }
    return set.has(factType);
  };
  const linked = (words: string, asks: QuestionId | null, fact: string | null): StepView => ({
    words,
    asks,
    askLabel: asks === null ? null : questionWording(asks, answers),
    fact,
  });

  const stepFor = (row: RowId, cell: CheckCell): StepView | null => {
    const needs = cell.needs ?? [];
    if (needs.length > 0) {
      for (const need of needs) {
        const step = nextStep(need.factType, need.reason);
        const asks = step.asks.find((id) => shown.has(id) && setsFact(id, need.factType));
        if (asks !== undefined) return linked(step.words, asks, need.factType);
      }
      for (const need of needs) {
        const step = nextStep(need.factType, need.reason);
        if (step.asks.length === 0) return linked(step.words, null, need.factType);
      }
      return null;
    }
    // A cell that names no fact: its row's own step, never one offering a question the visitor is not shown.
    const own = DP1_WORDING.rowSteps[row]?.[cell.state];
    if (own === undefined || own.asks.some((id) => !shown.has(id))) return null;
    return linked(own.words, own.asks[0] ?? null, null);
  };

  return {
    assessedAt: timeline.assessedAt,
    basis: timeline.basis,
    startYears: [...timeline.startYears],
    hypothetical: timeline.hypothetical,
    preliminary: timeline.preliminary,
    pack: timeline.pack,
    content: timeline.content,
    country: timeline.country,
    labels: {
      heading: PRELIMINARY_LABEL,
      draft: timeline.content.draft ? DRAFT_LABEL : null,
      threshold: thresholdWords(timeline.content.threshold),
      columnHeading: COLUMN_HEADING,
    },
    columns: timeline.startYears.map((startYear) => ({ startYear, heading: startYearHeading(startYear) })),
    rows: timeline.routes.map((route) => ({
      id: route.id,
      label: rowLabel(route.id),
      note: route.id === 'national' ? nationalLineNote(timeline.country) : null,
      lines: route.lines.map((line) => ({
        kind: line.kind,
        requirement: line.requirement,
        label: lineLabel(route.id, line.requirement),
        legalBasis: line.legalBasis,
        cells: line.cells.map((cell) => {
          const { words, glyph } = stateWords(line.kind, cell.state);
          return {
            startYear: cell.startYear,
            heading: startYearHeading(cell.startYear),
            state: cell.state,
            words,
            glyph,
            reasonCode: cell.reason ?? null,
            reason: cell.reason === undefined ? null : reasonWords(cell.reason),
            needs: cell.needs ?? [],
            step: stepFor(route.id, cell),
          };
        }),
      })),
    })),
    offer: shown.has('C-9') && shown.has('C-10') ? PARENT_OWN_OFFER : null,
  };
}

// ---------------------------------------------------------------------------
// A request that fails
// ---------------------------------------------------------------------------

/**
 * How long the page waits for the check before it says so: 15 seconds. The
 * engine's work is a millisecond or two per check (measured on 2026-10-26 over
 * the slowest answer shapes, a parent without its own figures among them), so
 * anything near this is the network or the host; 15 seconds leaves a cold start
 * on the host and a slow mobile connection a wide margin, and still tells a
 * waiting visitor within a quarter of a minute.
 */
export const CHECK_TIMEOUT_MS = 15_000;

/** How a check request ended, when it did not end in a timeline. */
export type CheckOutcome = { kind: 'status'; status: number } | { kind: 'network' } | { kind: 'timeout' };

/** The check's error states that arrive as a status, each matched by the status the wording module gives it. */
const STATUS_STATES: readonly ErrorState[] = ['bad_request', 'too_large', 'rate_limited', 'refused'];

/** The error state a failed request shows: its own for 400, 413, 429, 503, a network failure and a timeout; the server's own failure for anything else. */
export function errorStateFor(outcome: CheckOutcome): ErrorState {
  if (outcome.kind !== 'status') return outcome.kind;
  return STATUS_STATES.find((state) => ERROR_STATES[state].status === outcome.status) ?? 'server_error';
}
