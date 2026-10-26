/**
 * The free checker's standard wording, held to the rules that make one word
 * mean one thing on every screen (DP1 plan, Task 5; EXP-9, EXP-3).
 *
 * **Why this file exists.** A state's words are what a visitor acts on, and the
 * ways they go wrong are all quiet: a cell with no words, two states that look
 * alike, an exemption line that reads like the duty, an EU result without "at
 * EU level", a next step that asks again for an answer the visitor already
 * gave, words that suggest the visitor's case was saved or will be followed up
 * (DP1 keeps nothing), or a step that offers a capability DP1 does not have.
 * None of these throws.
 *
 * So every input a rule needs is read from its own source, never typed here:
 * the reachable (kind, state) pairs from Task 4's export, the reason codes from
 * the engine's runtime schema, the fact types by walking the row requirements'
 * conditions (following `requirement_ref`), the rows and lines from
 * `CHECK_ROWS`, and the open cells that name no fact from the authored cases.
 * The phrase lists are declared here, as phrases rather than bare words, each
 * with a planted positive control. `wordingProblems` names the entry that
 * fails, so a red run says which word is wrong.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { KnowledgePack } from '@datastrata/engine';
import { reasonSchema } from '../../../backend/engine/src/knowledge/schema';
import { csrdPack } from '@/lib/pack';
import { CHECK_QUESTIONS, checkerAnswersSchema } from '@/lib/check-answers';
import { CHECK_ROWS, LINE_KINDS, type LineKind } from '@/lib/check-routes';
import { buildCheckTimeline, checkerFactTypes, reachableCellStates, type CellState } from '@/lib/check-timeline';
import { COVERAGE_WORDS } from '@/lib/coverage';
import {
  COLUMN_HEADING,
  DP1_WORDING,
  DRAFT_LABEL,
  ERROR_STATES,
  errorWords,
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
  wordingEntries,
  wordingProblems,
  type Wording,
  type WordingInputs,
} from '@/lib/wording';

// ---------------------------------------------------------------------------
// The inputs, each from its own source
// ---------------------------------------------------------------------------

const pack = csrdPack();

/** Task 4's export: the pairs a cell can show. */
const REACHABLE = Object.fromEntries(LINE_KINDS.map((kind) => [kind, reachableCellStates(pack, kind)])) as Record<LineKind, readonly CellState[]>;

/** The engine's reason codes, from its runtime schema. */
const REASON_CODES: readonly string[] = reasonSchema.options;

/**
 * Every fact type a row requirement's determination can need: each `fact` and
 * `fromFact` in its condition and cases, following `requirement_ref`. Walked
 * here, independently of the timeline module's own read sets.
 */
function needFactTypes(p: KnowledgePack): string[] {
  const facts = new Set<string>();
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.fact === 'string') facts.add(record.fact);
    if (typeof record.fromFact === 'string') facts.add(record.fromFact);
    if (record.op === 'requirement_ref' && typeof record.requirement === 'string') walk(record.requirement);
    Object.values(record).forEach(visit);
  };
  const walk = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const requirement = p.requirements.find((r) => r.id === id);
    if (requirement === undefined) throw new Error(`no requirement ${id}`);
    visit(requirement.condition);
    (requirement.cases ?? []).forEach((c) => visit(c.when));
  };
  CHECK_ROWS.forEach((row) => row.lines.forEach((line) => walk(line.requirement)));
  return [...facts].sort();
}
const NEED_FACTS = needFactTypes(pack);

interface CasesFile {
  assessmentDate: string;
  cases: { id: string; answers: Record<string, unknown> }[];
}
const CASES = JSON.parse(readFileSync(fileURLToPath(new URL('./checker-cases.json', import.meta.url)), 'utf8')) as CasesFile;

/** The open (row, state) pairs whose cells name no fact, as the authored cases show them. */
function openRowStatesNamingNoFact(): { row: (typeof CHECK_ROWS)[number]['id']; state: CellState }[] {
  const found = new Map<string, { row: (typeof CHECK_ROWS)[number]['id']; state: CellState }>();
  for (const c of CASES.cases) {
    const timeline = buildCheckTimeline(pack, checkerAnswersSchema.parse(c.answers), CASES.assessmentDate);
    for (const route of timeline.routes) {
      for (const line of route.lines) {
        for (const cell of line.cells) {
          if (cell.state === 'applies' || cell.state === 'does_not_apply' || (cell.needs?.length ?? 0) > 0) continue;
          found.set(`${route.id} ${cell.state}`, { row: route.id, state: cell.state });
        }
      }
    }
  }
  return [...found.values()];
}
const OPEN_ROW_STATES = openRowStatesNamingNoFact();

/** DP1 keeps nothing (plan §1): phrases that would say the visitor's answers or case were kept, sent or acted on. */
const IMPLIED_CASE = [
  'saved',
  'stored',
  'kept',
  'queued',
  'sent',
  'submitted',
  'assigned',
  'recorded',
  'on file',
  'we will review',
  "we'll review",
  'we will check',
  "we'll check",
  'we will look',
  "we'll look",
  'in touch',
  'your case',
  'a case',
  'opens a case',
  'we will contact',
  "we'll contact",
  'follow up',
  'we have received',
  'received your',
  // A promised follow-up (the user's direction of 2026-10-26, after C-5's hint read "we'll confirm the right figure later"):
  // DP1 keeps nothing, so nothing is confirmed, told or sent afterwards. Phrases only: "later" alone stays valid ("Try again later").
  "we'll confirm",
  'we will confirm',
  "we'll let you know",
  'we will let you know',
  "we'll get back",
  'we will get back',
  "we'll update you",
  'we will update you',
  'confirm later',
  'figure later',
  'later on',
  'at a later',
];

/** Capabilities DP1 does not have (A4): DP2's onboarding, uploads, accounts and the rest. */
const UNBUILT_CAPABILITY = [
  'upload',
  'onboarding',
  'sign in',
  'sign up',
  'log in',
  'login',
  'account',
  'dashboard',
  'email you',
  'e-mail you',
  'emailed',
  'invite',
  'colleague',
  'needs you',
  'briefing',
  'case list',
  'change centre',
  'change center',
  'notify',
  'notification',
  'subscribe',
  'link your',
  'link or upload',
  'magic link',
  'reminder',
];

const PLACEHOLDERS = ['TODO', 'TBD', 'to be published', 'lorem'];

/**
 * Internal documents and ids a visitor cannot read: the vision and its choices,
 * the proposal, the plan, board rows and gates (the user's correction of
 * 2026-10-26, which removed "(vision, choice 4)" from the threshold label).
 * Legal citations such as "Article 40a" are not internal and stay.
 */
const INTERNAL_REFERENCE = /vision|choice \d|proposal|\bplan\b|\bDP\d|\b(KNW|EXP|APP|CHK|PRF|DG|QD|CD|CG)-\d|\blaw \d|§\s?\d|Task \d|CSRD-S-/i;

/** S-024's caution is a note to content authors, never DP1 wording (plan Task 5). */
const AUTHOR_NOTES = ['Never read as'];

/** Law 6: the EU line kinds, whose definitive states say "at EU level". Not `group_test`, `gateway` or `coverage_gap`. */
const EU_KINDS: readonly LineKind[] = ['first_application', 'duty', 'exemption'];
const DEFINITIVE: readonly CellState[] = ['applies', 'does_not_apply'];

/**
 * What each kind's definitive words must name, and must never borrow (Task 4's
 * line-kind table): a first application is a scope test, not a duty; a duty is
 * never "exempt"; an exemption is never a duty.
 */
const KIND_MEANINGS: WordingInputs['kindMeanings'] = {
  first_application: { names: 'scope test', never: ['duty', 'exempt'] },
  duty: { names: 'reporting duty', never: ['exempt', 'scope test'] },
  exemption: { names: 'exemption', never: ['duty'] },
};

/** The reason the pack gives each fact type when it is absent: fact-types.json `missingReason`, `missing_fact` where none is given (as `engine/facts.ts` reads it). */
const FACT_MISSING_REASONS: Record<string, string> = Object.fromEntries(pack.factTypes.map((f) => [f.id, f.missingReason ?? 'missing_fact']));

/** DataStrata's review: these reasons never ask the visitor anything (carried from Task 2). */
const REVIEW_REASONS = ['source_status_unresolved', 'catalogue_unknown', 'national_law_unresolved'] as const;

const INPUTS: WordingInputs = {
  reachable: REACHABLE,
  reasonCodes: REASON_CODES,
  factTypes: NEED_FACTS,
  rows: CHECK_ROWS,
  openRowStates: OPEN_ROW_STATES,
  settableFacts: checkerFactTypes(pack),
  euKinds: EU_KINDS,
  definitiveStates: DEFINITIVE,
  kindMeanings: KIND_MEANINGS,
  factMissingReasons: FACT_MISSING_REASONS,
  reviewReasons: REVIEW_REASONS,
  phrases: { impliedCase: IMPLIED_CASE, unbuiltCapability: UNBUILT_CAPABILITY, placeholders: PLACEHOLDERS, authorNotes: AUTHOR_NOTES },
};

/** The named problems of one check, for the real wording or a planted copy. */
const problemsOf = (check: string, wording: Wording = DP1_WORDING): string[] =>
  wordingProblems(wording, INPUTS)
    .filter((p) => p.check === check)
    .map((p) => `${p.entry}: ${p.detail}`);

// ---------------------------------------------------------------------------
// The inputs are real (failure mode 7)
// ---------------------------------------------------------------------------

describe('the inputs are read from their sources, and are not empty', () => {
  it('the fact walk follows references: it reaches the figures behind S-001, the parent report behind S-005 and the governing Member State', () => {
    for (const fact of ['entity.avg_employees', 'entity.net_turnover_eur', 'parent.report_standard', 'entity.governing_member_state', 'third_country.eu_subsidiary_turnover_eur']) {
      expect([fact, NEED_FACTS.includes(fact)]).toEqual([fact, true]);
    }
  });

  it('the open cells naming no fact include the issuer row’s not_yet_covered and the not_checked cells of parent_own and the exemption lines', () => {
    const keys = OPEN_ROW_STATES.map((o) => `${o.row} ${o.state}`).sort();
    expect(keys).toEqual(expect.arrayContaining(['exemption not_checked', 'issuer not_yet_covered', 'parent_own not_checked']));
  });

  it('every reachable pair is a pair of real kinds and states, and every kind reaches at least one state', () => {
    for (const kind of LINE_KINDS) expect([kind, REACHABLE[kind].length > 0]).toEqual([kind, true]);
  });
});

// ---------------------------------------------------------------------------
// The plan's tests (Task 5, "Tests")
// ---------------------------------------------------------------------------

describe('review steps ask nothing (carried from Task 2)', () => {
  it('for every fact type that can appear in needs, nextStep with R, catalogue_unknown and national_law_unresolved is the review step', () => {
    const asking: string[] = [];
    for (const fact of NEED_FACTS) {
      for (const reason of REVIEW_REASONS) {
        const step = nextStep(fact, reason);
        if (step.asks.length > 0 || step.words !== REVIEW_STEP.words) asking.push(`${fact} ${reason}: ${JSON.stringify(step)}`);
      }
    }
    expect(asking).toEqual([]);
    expect(REVIEW_STEP.asks).toEqual([]);
  });

  it('the national line’s need on entity.governing_member_state gets the review step, never a question, whatever its reason', () => {
    expect(nextStep('entity.governing_member_state', 'national_law_unresolved')).toEqual(REVIEW_STEP);
    expect(nextStep('entity.governing_member_state', 'missing_fact').asks).toEqual([]);
  });

  it('counterexample: nextStep for the country with missing_fact asks for the country (C-1)', () => {
    const step = nextStep('entity.incorporation_country', 'missing_fact');
    expect(step.asks).toEqual(['C-1']);
    expect(step.words.toLowerCase()).toContain('country');
  });

  it('only missing_fact, range_crosses_threshold, or the fact’s own declared non-review absent reason give a step that asks: every other reason asks nothing, for every fact type', () => {
    const asking = NEED_FACTS.flatMap((fact) =>
      REASON_CODES.filter((r) => r !== 'missing_fact' && r !== 'range_crosses_threshold' && r !== DP1_WORDING.factSteps[fact]?.absentReason)
        .filter((reason) => nextStep(fact, reason as never).asks.length > 0)
        .map((reason) => `${fact} ${reason}`),
    );
    expect(asking).toEqual([]);
  });

  it('counterexample: the legal form’s own absent reason, legal_ambiguity, asks C-3 (an unanswered C-3); the parent report’s standard, which the check does not ask, still asks nothing', () => {
    const step = nextStep('entity.legal_form', 'legal_ambiguity');
    expect(step.asks).toEqual(['C-3']);
    expect(step.words).toContain('kind of organisation');
    expect(nextStep('parent.report_standard', 'legal_ambiguity').asks).toEqual([]);
  });

  it('a step asks only for a fact the checker can set (from buildCheckProfile)', () => {
    expect(problemsOf('asks-unsettable')).toEqual([]);
  });
});

describe('a fact’s own absent reason asks (round 2, R1)', () => {
  it('the pack gives the legal form legal_ambiguity when it is absent, so the check below has something to check', () => {
    expect(FACT_MISSING_REASONS['entity.legal_form']).toBe('legal_ambiguity');
    expect(INPUTS.settableFacts.has('entity.legal_form')).toBe(true);
  });

  it('both directions, against the pack’s fact types: every asked fact whose absent reason is neither missing_fact nor a review reason declares it, and no step declares a reason the pack does not give its fact', () => {
    expect(problemsOf('absent-reason')).toEqual([]);
  });

  it('positive controls: an undeclared reason and a wrongly declared one are each named', () => {
    const undeclared = structuredClone(DP1_WORDING);
    delete undeclared.factSteps['entity.legal_form']!.absentReason;
    expect(problemsOf('absent-reason', undeclared)).toEqual([
      'fact-step entity.legal_form: the pack gives this asked fact legal_ambiguity when it is absent, and the step does not declare it',
    ]);
    const wrong = structuredClone(DP1_WORDING);
    wrong.factSteps['entity.avg_employees']!.absentReason = 'legal_ambiguity';
    expect(problemsOf('absent-reason', wrong)).toEqual(['fact-step entity.avg_employees: declares legal_ambiguity, which the pack does not give it (it gives missing_fact)']);
  });
});

describe('no wording entry carries S-024’s author note', () => {
  it('no entry contains "Never read as"', () => {
    expect(problemsOf('author-note')).toEqual([]);
  });

  it('positive control: a planted "Never read as" is named', () => {
    const planted = structuredClone(DP1_WORDING);
    planted.reasons.source_status_unresolved = 'Never read as "does not apply"';
    expect(problemsOf('author-note', planted)).toEqual(['reason source_status_unresolved: contains "Never read as"']);
  });
});

describe('no implied case (carried from Task 2; DP1 keeps nothing)', () => {
  it('no state, reason, next-step, label or error entry claims anything was saved, stored, kept, queued, sent, submitted or assigned', () => {
    expect(problemsOf('implied-case')).toEqual([]);
  });

  it('positive control: the scanner flags a planted "We’ll review your case"', () => {
    const planted = structuredClone(DP1_WORDING);
    planted.rowSteps.issuer!.not_yet_covered = { words: 'We’ll review your case', asks: [] };
    expect(problemsOf('implied-case', planted)).toEqual([
      'row-step issuer not_yet_covered: contains "we\'ll review"',
      'row-step issuer not_yet_covered: contains "your case"',
    ]);
  });

  it('the scan covers every kind of entry: states, rows, lines, reasons, steps, labels and errors', () => {
    const kinds = new Set(wordingEntries(DP1_WORDING).map((e) => e.entry.split(' ')[0]));
    expect([...kinds].sort()).toEqual(['error', 'fact-step', 'label', 'line', 'reason', 'reason-step', 'row', 'row-step', 'state']);
  });
});

/**
 * Every text a question shows the visitor (the user's direction of 2026-10-26:
 * the question hints go through the same check): each wording variant, the
 * hint, each option's label and hint, and the typed-figure label.
 */
function questionTexts(): { entry: string; text: string }[] {
  return CHECK_QUESTIONS.flatMap((q) => [
    ...Object.entries(q.wording).map(([variant, text]) => ({ entry: `${q.id} wording ${variant}`, text })),
    ...(q.hint === undefined ? [] : [{ entry: `${q.id} hint`, text: q.hint }]),
    ...q.options.flatMap((o) => [{ entry: `${q.id} option ${o.id}`, text: o.label }, ...(o.hint === undefined ? [] : [{ entry: `${q.id} option ${o.id} hint`, text: o.hint }])]),
    ...(q.typed === undefined ? [] : [{ entry: `${q.id} typed`, text: q.typed.label }]),
  ]);
}

/**
 * The implied-case problems of texts outside the wording module, found by the
 * same `wordingProblems` and `wordingEntries` that scan the module: each text is
 * placed in an otherwise empty wording object, as a step's words, so no second
 * matcher is written here (failure mode 1).
 */
function impliedCaseIn(texts: { entry: string; text: string }[]): string[] {
  const empty: Wording = {
    states: {},
    rows: {} as Wording['rows'],
    lines: {} as Wording['lines'],
    reasons: {} as Wording['reasons'],
    factSteps: Object.fromEntries(texts.map((t) => [t.entry, { missing: { words: t.text, asks: [] } }])),
    reasonSteps: {} as Wording['reasonSteps'],
    rowSteps: {},
    labels: { preliminary: '', draft: '', columnHeading: '', startYear: '', threshold: {} as Wording['labels']['threshold'], national: { country: '', notSure: '', unanswered: '' } },
    errors: {} as Wording['errors'],
  };
  return wordingProblems(empty, INPUTS)
    .filter((p) => p.check === 'implied-case')
    .map((p) => `${p.entry.replace(/^fact-step /, '').replace(/ missing$/, '')}: ${p.detail}`);
}

describe('no promised follow-up, in the questions too (the user’s direction, 2026-10-26)', () => {
  const NEW_HINT = 'Revenue after rebates and VAT. Banks and insurers: if you are unsure which figure to use, choose ‘Not sure’.';
  const OLD_HINT = "Revenue after rebates and VAT; banks and insurers, we'll confirm the right figure later";

  it('the scan reads every question: each wording variant, hint, option and typed label, C-5’s and C-10’s new hint among them', () => {
    const texts = questionTexts();
    const ids = new Set(texts.map((t) => t.entry.split(' ')[0]));
    expect([...ids].sort()).toEqual(CHECK_QUESTIONS.map((q) => q.id).sort());
    expect(texts.filter((t) => t.text === NEW_HINT).map((t) => t.entry)).toEqual(['C-5 hint', 'C-10 hint']);
  });

  it('no question text promises a follow-up or implies a kept case', () => {
    expect(impliedCaseIn(questionTexts())).toEqual([]);
  });

  it('positive control: the old C-5 hint is flagged, by the promise and by the deferral', () => {
    expect(impliedCaseIn([{ entry: 'C-5 hint before 2026-10-26', text: OLD_HINT }])).toEqual([
      'C-5 hint before 2026-10-26: contains "we\'ll confirm"',
      'C-5 hint before 2026-10-26: contains "figure later"',
    ]);
  });

  it('counterexample: "later" alone is no promise, so the errors’ "Try again later" is not flagged', () => {
    expect(wordingEntries(DP1_WORDING).filter((e) => e.text.includes('Try again later')).map((e) => e.entry)).toEqual(['error refused', 'error server_error']);
    expect(problemsOf('implied-case')).toEqual([]);
  });
});

describe('no unbuilt capability is named as available (A4)', () => {
  it('no entry names onboarding, an upload, an account, a dashboard, an email or an invitation', () => {
    expect(problemsOf('unbuilt-capability')).toEqual([]);
  });

  it('positive control: a planted "upload your parent’s report" is named', () => {
    const planted = structuredClone(DP1_WORDING);
    planted.factSteps['parent.report_includes_entity']!.missing = { words: 'Upload your parent’s report', asks: ['C-7'] };
    expect(problemsOf('unbuilt-capability', planted)).toEqual(['fact-step parent.report_includes_entity missing: contains "upload"']);
  });
});

describe('every engine reason code has an entry', () => {
  it('the codes are read from the engine’s runtime reason schema', () => {
    expect(REASON_CODES.length).toBeGreaterThanOrEqual(10);
    expect(problemsOf('reason-words')).toEqual([]);
    for (const code of REASON_CODES) expect([code, reasonWords(code as never).length > 0]).toEqual([code, true]);
  });

  it('the drafts the plan names are kept', () => {
    expect(reasonWords('national_law_unresolved')).toBe('National-law status requires review');
  });
});

describe('every reachable pair of line kind and state has words and a glyph', () => {
  it('read from Task 4’s export', () => {
    expect(problemsOf('state-words')).toEqual([]);
    for (const kind of LINE_KINDS) {
      for (const state of REACHABLE[kind]) {
        const { words, glyph } = stateWords(kind, state);
        expect([kind, state, words.length > 0, glyph.length > 0]).toEqual([kind, state, true, true]);
      }
    }
  });

  it('the pairs the line-kind table gives a meaning although DP1 does not reach them have words too', () => {
    expect(stateWords('exemption', 'applies').words).toContain('This exemption is available');
    expect(stateWords('gateway', 'applies').words).toContain('This company reports for the group');
  });
});

describe('every row and line in CHECK_ROWS has a label', () => {
  it('rows and lines', () => {
    expect(problemsOf('row-label')).toEqual([]);
    expect(problemsOf('line-label')).toEqual([]);
    for (const row of CHECK_ROWS) {
      expect(rowLabel(row.id).length).toBeGreaterThan(0);
      for (const line of row.lines) expect([row.id, line.requirement, lineLabel(row.id, line.requirement).length > 0]).toEqual([row.id, line.requirement, true]);
    }
  });
});

describe('the "at EU level" rule (law 6)', () => {
  it('every definitive state of an EU line kind says "at EU level"', () => {
    expect(problemsOf('eu-level')).toEqual([]);
  });

  it('counterexample: group_test, gateway and coverage_gap are not EU kinds, so words without the phrase raise nothing there', () => {
    expect(EU_KINDS).not.toContain('group_test');
    expect(EU_KINDS).not.toContain('gateway');
    expect(EU_KINDS).not.toContain('coverage_gap');
    expect(stateWords('group_test', 'applies').words).not.toContain('at EU level');
    const planted = structuredClone(DP1_WORDING);
    planted.states.duty!.does_not_apply = { words: 'No reporting duty', glyph: '○' };
    expect(problemsOf('eu-level', planted)).toEqual(['state duty does_not_apply: lacks "at EU level"']);
  });
});

describe('no kind borrows another’s meaning', () => {
  it('a duty line’s applies and does_not_apply words differ from an exemption line’s, and each names its own kind', () => {
    expect(problemsOf('kind-meaning')).toEqual([]);
    for (const state of DEFINITIVE) expect([state, stateWords('duty', state).words]).not.toEqual([state, stateWords('exemption', state).words]);
  });

  it('counterexample: a duty worded "Exempt" is named', () => {
    const planted = structuredClone(DP1_WORDING);
    planted.states.duty!.does_not_apply = { words: 'Exempt at EU level', glyph: '○' };
    expect(problemsOf('kind-meaning', planted)).toEqual([
      'state duty does_not_apply: does not name "reporting duty"',
      'state duty does_not_apply: borrows "exempt"',
    ]);
  });
});

describe('next steps', () => {
  it('every fact type that can appear in needs has a next step', () => {
    expect(NEED_FACTS.length).toBeGreaterThan(20);
    expect(problemsOf('fact-step')).toEqual([]);
    for (const fact of NEED_FACTS) {
      for (const reason of ['missing_fact', 'range_crosses_threshold'] as const) expect([fact, reason, nextStep(fact, reason).words.length > 0]).toEqual([fact, reason, true]);
    }
  });

  it('every open row state that names no fact has its own next step, keyed by row and state', () => {
    expect(problemsOf('row-step')).toEqual([]);
    for (const { row, state } of OPEN_ROW_STATES) expect([row, state, rowStep(row, state).words.length > 0]).toEqual([row, state, true]);
  });

  it('the issuer row’s not_yet_covered step is DataStrata’s review and asks nothing', () => {
    const step = rowStep('issuer', 'not_yet_covered');
    expect(step.asks).toEqual([]);
    expect(step.words).toContain('requires DataStrata review');
  });
});

describe('within each line kind, no two states share words or a glyph', () => {
  it('checked pair by pair', () => {
    expect(problemsOf('state-distinct')).toEqual([]);
  });

  it('counterexample: two states given one glyph are both named', () => {
    const planted = structuredClone(DP1_WORDING);
    planted.states.gateway!.cannot_decide = { ...planted.states.gateway!.cannot_decide!, glyph: planted.states.gateway!.does_not_apply!.glyph };
    expect(problemsOf('state-distinct', planted)).toEqual([`state gateway does_not_apply and cannot_decide: share the glyph "${planted.states.gateway!.does_not_apply!.glyph}"`]);
  });

  it('a glyph is a visible character, and the module carries no colour: a state entry holds words and a glyph only', () => {
    for (const [kind, states] of Object.entries(DP1_WORDING.states)) {
      for (const [state, entry] of Object.entries(states ?? {})) {
        expect([kind, state, Object.keys(entry!).sort()]).toEqual([kind, state, ['glyph', 'words']]);
        expect([kind, state, /\S/.test(entry!.glyph)]).toEqual([kind, state, true]);
      }
    }
  });
});

describe('no wording contains a placeholder marker', () => {
  it('no TODO, TBD, "to be published" or lorem', () => {
    expect(problemsOf('placeholder')).toEqual([]);
  });

  it('positive control: a planted TBD is named', () => {
    const planted = structuredClone(DP1_WORDING);
    planted.labels.preliminary = 'Preliminary (TBD)';
    expect(problemsOf('placeholder', planted)).toEqual(['label preliminary: contains "TBD"']);
  });
});

describe('stateWords refuses a pair the line-kind table never shows', () => {
  it('coverage_gap applies or does_not_apply, national applies or does_not_apply', () => {
    for (const [kind, state] of [
      ['coverage_gap', 'applies'],
      ['coverage_gap', 'does_not_apply'],
      ['national', 'applies'],
      ['national', 'does_not_apply'],
    ] as const) {
      expect(() => stateWords(kind, state)).toThrow(`${kind} ${state}`);
    }
  });

  it('positive control: a pair the table shows is not refused', () => {
    expect(stateWords('coverage_gap', 'not_yet_covered').words).toContain('not yet covered');
  });
});

// ---------------------------------------------------------------------------
// The labels and the error states
// ---------------------------------------------------------------------------

describe('no internal reference (the user’s correction, 2026-10-26)', () => {
  const internal = (wording: Wording) => wordingEntries(wording).filter((e) => INTERNAL_REFERENCE.test(e.text)).map((e) => e.entry);

  it('no visitor-facing entry names an internal document or id', () => {
    expect(internal(DP1_WORDING)).toEqual([]);
  });

  it('positive control: the removed "(vision, choice 4)", planted back on the threshold label, is named', () => {
    const planted: Wording = { ...DP1_WORDING, labels: { ...DP1_WORDING.labels, threshold: { draft_labelled: `${DP1_WORDING.labels.threshold.draft_labelled} (vision, choice 4)` } } };
    expect(internal(planted)).toEqual(['label threshold draft_labelled']);
  });
});

describe('the labels', () => {
  it('"Draft · evaluation only" is the register’s own word', () => {
    expect(DRAFT_LABEL).toBe(COVERAGE_WORDS.draft);
  });

  it('the preliminary label, the column heading and each start year’s column', () => {
    expect(PRELIMINARY_LABEL).toMatch(/^Preliminary/);
    expect(COLUMN_HEADING).toBe('If your size stays about the same');
    expect(startYearHeading(2027)).toBe('Financial years that start in 2027');
  });

  it('the threshold in force names the draft label, and no internal document (the user’s correction, 2026-10-26)', () => {
    const words = thresholdWords('draft_labelled');
    expect(words).toContain(DRAFT_LABEL);
    expect(words).not.toMatch(INTERNAL_REFERENCE);
  });

  it('the national line names the country of registration, with its own variants for "Not sure" and unanswered', () => {
    const de = nationalLineNote('DE');
    const notSure = nationalLineNote('not_sure');
    const unanswered = nationalLineNote(null);
    expect(de).toContain('Germany');
    expect(new Set([de, notSure, unanswered]).size).toBe(3);
    expect(notSure).toContain('Not sure');
    expect(unanswered).not.toContain('Germany');
  });
});

describe('the error states', () => {
  it('400, 413, 429, the 503 refusal, a network failure, a timeout, 404 and 500, each with its own words', () => {
    expect(Object.fromEntries(Object.entries(ERROR_STATES).map(([state, e]) => [state, e.status]))).toEqual({
      bad_request: 400,
      too_large: 413,
      rate_limited: 429,
      refused: 503,
      network: null,
      timeout: null,
      not_found: 404,
      server_error: 500,
    });
    const words = Object.values(ERROR_STATES).map((e) => e.words);
    expect(new Set(words).size).toBe(words.length);
  });

  it('429 says to try again in a minute', () => {
    expect(errorWords('rate_limited').toLowerCase()).toContain('try again in a minute');
  });

  it('no check error presents an earlier result as current: each says no result is shown', () => {
    for (const [state, e] of Object.entries(ERROR_STATES)) {
      if (state === 'not_found') continue;
      expect([state, e.words.includes('No result is shown')]).toEqual([state, true]);
    }
  });
});

// ---------------------------------------------------------------------------
// Client safety
// ---------------------------------------------------------------------------

describe('the module is client-safe', () => {
  it('imports nothing at run time but the coverage words and the country names: no engine, no pack, no server-only', () => {
    const source = readFileSync(fileURLToPath(new URL('../lib/wording.ts', import.meta.url)), 'utf8');
    const runtime = [...source.matchAll(/^import\s+(?!type\s)[^;]*?from\s+'([^']+)';/gms)].map((m) => m[1]);
    expect(runtime.sort()).toEqual(['./countries', './coverage']);
    expect(source).not.toContain("'server-only'");
  });
});
