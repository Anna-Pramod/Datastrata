/**
 * The free checker's standard wording: one source for every word a DP1 screen
 * shows about a state, a reason, a next step, a label or an error (DP1 plan,
 * Task 5; EXP-9, EXP-3, APP-11, KNW-10).
 *
 * **Why this module exists.** The timeline payload carries ids, kinds, states
 * and reason codes, never words (CHK-2). If each screen worded them itself, the
 * same state would read differently from screen to screen, and the quiet
 * defects would follow: an exemption line read like the duty, an EU result
 * without "at EU level" (law 6), two states that look alike, a next step that
 * asks again for an answer the visitor gave, or words that suggest the
 * visitor's case was kept or will be followed up when DP1 keeps nothing. So
 * the words live here as data, `wordingProblems` holds them to those rules,
 * and every screen reads them through the functions below.
 *
 * **What the words may say.**
 * - A state's words say what its line kind gives it (Task 4's line-kind
 *   table), and no more: a duty's "does not apply" is "No reporting duty at EU
 *   level", never "exempt"; a first application is a scope test, not a duty.
 * - Every state carries a glyph, a visible character, so no state is told
 *   apart by colour alone (EXP-3). The module carries no colour at all; orange
 *   is kept for change events and deadlines, which DP1 does not have.
 * - Only a missing answer, a band that straddles a threshold, or the reason
 *   the pack gives an asked fact when it is absent (the legal form's
 *   `legal_ambiguity`, an unanswered C-3) gives a step that asks the visitor
 *   for an answer. A route the pack does not cover, a country or form not in
 *   the catalogue, and national law are DataStrata's review: the step says so
 *   and asks nothing (carried from Task 2).
 * - Nothing implies the visitor's answers or case were kept, queued or passed
 *   to anyone, and no step offers a capability DP1 does not have. A step says
 *   what the visitor can do now: find a figure in their own documents, then
 *   answer or change an answer.
 *
 * Client-safe: Task 6's view model and component import it. At run time it
 * imports only the coverage register's words and the country names; the
 * engine, the routes and the timeline are imported for their types alone.
 */

import type { ReasonCode } from '@datastrata/engine';
import type { QuestionId } from './check-answers';
import type { LineKind, RowId } from './check-routes';
import type { CellState } from './check-timeline';
import { countryName } from './countries';
import { COVERAGE_WORDS } from './coverage';

// ---------------------------------------------------------------------------
// The shape of the words
// ---------------------------------------------------------------------------

/** What a cell shows for its line kind and state. */
export interface StateWords {
  words: string;
  /** A visible character, so the state never rests on colour alone. */
  glyph: string;
}

/** What the visitor can do next. */
export interface NextStep {
  words: string;
  /** The questions the step asks the visitor to answer or change; empty for a step that asks nothing. */
  asks: readonly QuestionId[];
}

/** A fact's steps: for a missing answer, and for a band that straddles a threshold (the missing step where none is given). */
export interface FactSteps {
  missing: NextStep;
  range?: NextStep;
  /**
   * For a fact the free check asks: the reason the pack gives it when it is
   * absent (fact-types.json `missingReason`), where that is neither
   * `missing_fact` nor a review reason. A need with this reason is an
   * unanswered question, so it gets the missing step.
   */
  absentReason?: ReasonCode;
}

/** The reasons whose step is the same for every fact. */
export type FactFreeReason = Exclude<ReasonCode, 'missing_fact' | 'range_crosses_threshold'>;

export type ErrorState = 'bad_request' | 'too_large' | 'rate_limited' | 'refused' | 'network' | 'timeout' | 'not_found' | 'server_error';

export interface ErrorWords {
  /** The HTTP status, or `null` where none arrives (a network failure, a timeout). */
  status: number | null;
  words: string;
}

/** The content threshold the timeline reports (`content.threshold`, KNW-10). */
export type ContentThreshold = 'draft_labelled';

export interface Wording {
  /** A pair the line-kind table never shows has no entry. */
  states: Partial<Record<LineKind, Partial<Record<CellState, StateWords>>>>;
  rows: Record<RowId, string>;
  /** By row, then by the line's requirement. */
  lines: Record<RowId, Record<string, string>>;
  reasons: Record<ReasonCode, string>;
  factSteps: Record<string, FactSteps>;
  reasonSteps: Record<FactFreeReason, NextStep>;
  /** For an open row state whose cells name no fact, and the one row note the plan keeps (Article 40a's gateway). */
  rowSteps: Partial<Record<RowId, Partial<Record<CellState, NextStep>>>>;
  labels: {
    preliminary: string;
    draft: string;
    columnHeading: string;
    /** `{year}` stands for the start year. */
    startYear: string;
    threshold: Record<ContentThreshold, string>;
    /** `{country}` stands for the country's name. */
    national: { country: string; notSure: string; unanswered: string };
  };
  errors: Record<ErrorState, ErrorWords>;
}

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

/** The glyphs, one per state, shared across kinds so a state looks the same on every line. */
const GLYPH: Record<CellState, string> = {
  applies: '●',
  does_not_apply: '○',
  cannot_decide: '?',
  not_checked: '–',
  not_yet_covered: '◇',
  requires_review: '§',
};

const CANNOT_DECIDE: StateWords = { words: 'Cannot decide yet', glyph: GLYPH.cannot_decide };
const NOT_CHECKED: StateWords = { words: 'Not checked', glyph: GLYPH.not_checked };

/**
 * DataStrata's review: a route the pack does not cover, a code its catalogue
 * does not hold, national law, conflicting sources. It asks nothing.
 */
export const REVIEW_STEP: NextStep = { words: 'This requires DataStrata review. Your answers cannot settle it here.', asks: [] };

const ANSWER = 'then answer or change your answer.';

/** A fact the free check does not ask: where the visitor can find it, and that the check cannot settle it. */
const notAsked = (what: string, where: string): FactSteps => ({
  missing: { words: `The free check does not ask ${what}, so your answers cannot settle it here. ${where}`, asks: [] },
});

const FIRST_APPLICATION = 'First application';
const DUTY = 'Duty after exemptions';

export const DP1_WORDING: Wording = {
  states: {
    first_application: {
      applies: { words: 'Scope test met at EU level', glyph: GLYPH.applies },
      does_not_apply: { words: 'Scope test not met at EU level', glyph: GLYPH.does_not_apply },
      cannot_decide: CANNOT_DECIDE,
      not_checked: NOT_CHECKED,
    },
    duty: {
      applies: { words: 'Reporting duty at EU level', glyph: GLYPH.applies },
      does_not_apply: { words: 'No reporting duty at EU level', glyph: GLYPH.does_not_apply },
      cannot_decide: CANNOT_DECIDE,
      not_checked: NOT_CHECKED,
    },
    exemption: {
      applies: { words: 'This exemption is available at EU level', glyph: GLYPH.applies },
      does_not_apply: { words: 'This exemption is not available at EU level', glyph: GLYPH.does_not_apply },
      cannot_decide: CANNOT_DECIDE,
      not_checked: NOT_CHECKED,
    },
    group_test: {
      applies: { words: 'Article 40a test met', glyph: GLYPH.applies },
      does_not_apply: { words: 'Article 40a test not met', glyph: GLYPH.does_not_apply },
      cannot_decide: CANNOT_DECIDE,
    },
    gateway: {
      applies: { words: 'This company reports for the group under Article 40a', glyph: GLYPH.applies },
      does_not_apply: { words: 'This company does not report for the group under Article 40a', glyph: GLYPH.does_not_apply },
      cannot_decide: CANNOT_DECIDE,
    },
    coverage_gap: {
      not_yet_covered: { words: 'Requires review: the route for this company is not yet covered', glyph: GLYPH.not_yet_covered },
      cannot_decide: CANNOT_DECIDE,
    },
    national: {
      requires_review: { words: 'Requires review', glyph: GLYPH.requires_review },
    },
  },

  rows: {
    individual: "Your company's own sustainability report (Article 19a)",
    parent_own: "The parent company's own report (Article 19a)",
    consolidated: "The group's consolidated report (Article 29a)",
    exemption: "Exemption through a parent's group report",
    art_40a: "A non-EU group's EU reporting (Article 40a, from 2028)",
    art_40a_gateway: 'Your company as the EU subsidiary that reports for a non-EU group (Article 40a, from 2028)',
    issuer: 'Shares or bonds on an EU regulated market (Transparency Directive)',
    national: 'National law',
  },

  lines: {
    individual: { 'CSRD-S-017': FIRST_APPLICATION, 'CSRD-S-020': DUTY },
    parent_own: { 'CSRD-S-017': FIRST_APPLICATION, 'CSRD-S-020': DUTY },
    consolidated: { 'CSRD-S-018': FIRST_APPLICATION, 'CSRD-S-021': DUTY },
    exemption: {
      'CSRD-S-019': "The group, through a higher parent's report",
      'CSRD-S-005': "Through an EU parent's report",
      'CSRD-S-006': "Through a non-EU parent's report",
    },
    art_40a: { 'CSRD-S-007': 'EU-turnover test' },
    art_40a_gateway: { 'CSRD-S-008': 'This company as the reporting subsidiary' },
    issuer: { 'CSRD-S-024': 'Not yet covered' },
    national: { 'CSRD-S-013': 'National-law status' },
  },

  reasons: {
    missing_fact: "We can't decide this yet: a fact it needs is missing",
    range_crosses_threshold: 'Your band includes the threshold this route tests',
    catalogue_unknown: "Your answer is not yet in DataStrata's catalogue",
    source_conflict: 'The legal sources conflict on this point',
    legal_ambiguity: 'This turns on a legal classification that is not settled yet',
    customer_scope_ambiguity: 'It is unclear which company in your group this concerns',
    national_law_unresolved: 'National-law status requires review',
    upstream_indeterminate: 'This depends on another result that cannot be decided yet',
    source_status_unresolved: "This route is not yet covered by DataStrata's content",
    not_yet_effective: 'Adopted, not yet in force',
  },

  factSteps: {
    // Asked by the free check (C-1 to C-10).
    'entity.incorporation_country': {
      missing: { words: `We need the country where your company is registered. Its company-register extract states it; ${ANSWER}`, asks: ['C-1'] },
    },
    'entity.is_parent_undertaking': {
      missing: {
        words: `Group position unknown: your company was checked on its own. Your group chart, or the list of shareholdings in the notes to your accounts, shows your group position; ${ANSWER}`,
        asks: ['C-2'],
      },
    },
    'entity.is_subsidiary': {
      missing: {
        words: `Group position unknown: your company was checked on its own. Your group chart, or the list of shareholdings in the notes to your accounts, shows your group position; ${ANSWER}`,
        asks: ['C-2'],
      },
    },
    'entity.legal_form': {
      absentReason: 'legal_ambiguity',
      missing: { words: `We need the kind of organisation. Your articles of association or company-register extract state the legal form; ${ANSWER}`, asks: ['C-3'] },
    },
    'entity.excluded_by_article_1_4': {
      missing: {
        words: `We need to know whether your company is an investment fund (a UCITS or an alternative investment fund). Its articles of association or fund documents say so; ${ANSWER}`,
        asks: ['C-3'],
      },
    },
    'entity.avg_employees': {
      missing: { words: `We need your headcount. The notes to your company's own accounts state its average number of employees for the year; ${ANSWER}`, asks: ['C-4', 'C-9'] },
      range: {
        words: "Your band includes the employee threshold this route tests (500 or 1,000). Find your company's own average number of employees in the notes to its accounts, then type the number instead of choosing a band.",
        asks: ['C-4', 'C-9'],
      },
    },
    'group.avg_employees': {
      missing: { words: `We need the group's headcount. The notes to the consolidated accounts state the group's average number of employees; ${ANSWER}`, asks: ['C-4'] },
      range: {
        words: "Your band includes the employee threshold this route tests (500 or 1,000). Find the group's average number of employees in the notes to the consolidated accounts, then type the number instead of choosing a band.",
        asks: ['C-4'],
      },
    },
    'entity.net_turnover_eur': {
      missing: { words: `We need your turnover. Your company's own income statement shows its net turnover (revenue after rebates and VAT); ${ANSWER}`, asks: ['C-5', 'C-10'] },
      range: {
        words: "Your band includes the €450m threshold. Find your company's own net turnover in its income statement, then type the figure instead of choosing a band.",
        asks: ['C-5', 'C-10'],
      },
    },
    'group.consolidated_net_turnover_eur': {
      missing: { words: `We need the group's turnover. The consolidated income statement shows the group's net turnover; ${ANSWER}`, asks: ['C-5'] },
      range: {
        words: "Your band includes the €450m threshold. Find the group's net turnover in the consolidated income statement, then type the figure instead of choosing a band.",
        asks: ['C-5'],
      },
    },
    'entity.is_public_interest_entity': {
      missing: { words: `Ask your auditor whether your company is a public-interest entity, or check its auditor's report; ${ANSWER}`, asks: ['C-6'] },
    },
    'parent.report_includes_entity': {
      missing: {
        words: `Whether your parent company's group sustainability report includes your company is one condition of this exemption. Check the published report, ${ANSWER}`,
        asks: ['C-7'],
      },
    },
    'third_country.eu_turnover_year_1_eur': {
      missing: {
        words: `We need your group's EU turnover for the last two financial years. The segment note (revenue by geography) in the consolidated accounts shows it; ${ANSWER}`,
        asks: ['C-8'],
      },
    },
    'third_country.eu_turnover_year_2_eur': {
      missing: {
        words: `We need your group's EU turnover for the last two financial years. The segment note (revenue by geography) in the consolidated accounts shows it; ${ANSWER}`,
        asks: ['C-8'],
      },
    },
    'group.ultimate_parent_country': {
      missing: {
        words:
          "Where your group's ultimate parent is registered decides this. The free check takes it from your country answer only when your company heads its own group, and does not ask it otherwise; your group chart names it.",
        asks: [],
      },
    },

    // Not asked by the free check: where the visitor can find each.
    'entity.is_large_undertaking': notAsked('whether your company is a large undertaking under the Accounting Directive', 'The notes to your accounts state its size class.'),
    'group.is_large_group': notAsked('whether your group is a large group under the Accounting Directive', 'The notes to the consolidated accounts state it.'),
    'entity.member_state_transition_option': notAsked('whether your Member State uses the 2025–26 transition option', "Your Member State's law sets it."),
    'parent.reporting_parent_country': notAsked('where the parent company that reports for your group is established', 'Your group chart names it.'),
    'parent.report_includes_all_subsidiaries': notAsked("whether your parent's report includes every company your company owns", "The parent's report lists the companies it covers."),
    'parent.report_standard': notAsked("which standard your parent's report is prepared under", "The parent's report names it."),
    'parent.report_public_url': notAsked("where your parent's report is published", "The parent's website or the register where it files gives it."),
    'parent.assurance_opinion_available': notAsked("whether your parent's report carries an assurance opinion", "The parent's report includes it if so."),
    'parent.taxonomy_information_included': notAsked("whether your parent's report includes EU Taxonomy information", "The parent's report shows it if so."),
    'entity.exemption_disclosures_in_management_report': notAsked('whether your management report carries the exemption disclosures', 'Your management report shows them if so.'),
    'entity.article_37_exempt_publishing_consolidated_report': notAsked(
      "whether your company uses the Article 37 exemption and publishes its parent's consolidated management report",
      'Your accounts state it if so.',
    ),
    'entity.national_publication_conditions_met': notAsked('whether your national publication conditions are met', 'Your national law sets them.'),
    'entity.is_financial_holding_undertaking': notAsked('whether the parent company is a financial holding undertaking', 'Its accounts state it.'),
    'group.subsidiaries_business_models_independent': notAsked("whether the subsidiaries' business models are independent of one another", 'Your group structure decides it.'),
    'entity.art_29a_7a_option_exercised': notAsked('whether the parent company uses the Article 29a(7a) option', 'Its consolidated management report shows it.'),
    'third_country.eu_subsidiary_turnover_eur': notAsked("your company's own EU net turnover for Article 40a", 'Your segment note or income statement shows it.'),
    'entity.governing_member_state': notAsked("which Member State's law governs your report", 'The national line names your country of registration.'),
  },

  reasonSteps: {
    source_status_unresolved: REVIEW_STEP,
    catalogue_unknown: REVIEW_STEP,
    national_law_unresolved: REVIEW_STEP,
    source_conflict: REVIEW_STEP,
    legal_ambiguity: { words: 'This needs a legal judgment that the free check cannot make. Your answers cannot settle it here.', asks: [] },
    customer_scope_ambiguity: { words: 'The free check cannot tell which company in your group this concerns, so your answers cannot settle it here.', asks: [] },
    upstream_indeterminate: { words: 'This follows another result on this page that cannot be decided yet. Settle that result first.', asks: [] },
    not_yet_effective: { words: 'This rule is adopted but not yet in force. This result does not assess preparation steps.', asks: [] },
  },

  rowSteps: {
    issuer: {
      not_yet_covered: { words: 'Not yet covered: this route requires DataStrata review. Your answers cannot settle it here.', asks: [] },
    },
    parent_own: {
      not_checked: {
        words: "Not checked: the parent company's own figures decide this. Give its own headcount and turnover with “Check the parent company on its own too”.",
        asks: ['C-9', 'C-10'],
      },
    },
    exemption: {
      not_checked: {
        words:
          "Not checked: this exemption is assessed only where the route it relieves could apply for the figures given. For a company that also owns others, the parent company's own figures, given with “Check the parent company on its own too”, can bring it into the check.",
        asks: [],
      },
    },
    art_40a: {
      applies: {
        words: 'Which EU subsidiary or branch reports for the group under Article 40a depends on facts the free check does not ask. Your group structure decides it.',
        asks: [],
      },
    },
  },

  labels: {
    preliminary: 'Preliminary result, from your answers alone',
    draft: COVERAGE_WORDS.draft,
    columnHeading: 'If your size stays about the same',
    startYear: 'Financial years that start in {year}',
    threshold: {
      draft_labelled: `This check evaluates draft content and labels every result from it “${COVERAGE_WORDS.draft}”.`,
    },
    national: {
      country: "Country of registration: {country}. The free check does not ask which Member State's law governs your report.",
      notSure: "Country of registration: answered “Not sure”. The free check does not ask which Member State's law governs your report.",
      unanswered: "Country of registration: not answered. The free check does not ask which Member State's law governs your report.",
    },
  },

  errors: {
    bad_request: { status: 400, words: 'These answers could not be checked. Review your answers and try again. No result is shown.' },
    too_large: { status: 413, words: 'This request is too large to check. Review your answers and try again. No result is shown.' },
    rate_limited: { status: 429, words: 'Too many checks in a short time. Try again in a minute. No result is shown.' },
    refused: { status: 503, words: 'The check is unavailable: it refuses to show a result it cannot stand behind. No result is shown. Try again later.' },
    network: { status: null, words: 'The check could not be reached. Check your connection and try again. No result is shown.' },
    timeout: { status: null, words: 'The check took too long to answer. Try again. No result is shown.' },
    not_found: { status: 404, words: 'Page not found. The address may be mistyped, or the page may have moved.' },
    server_error: { status: 500, words: 'Something went wrong on our side. Try again later. No result is shown.' },
  },
};

// ---------------------------------------------------------------------------
// Reading the words
// ---------------------------------------------------------------------------

/** A state's words and glyph for its line kind. A pair the line-kind table never shows is refused, never worded by a guess. */
export function stateWords(kind: LineKind, state: CellState): StateWords {
  const entry = DP1_WORDING.states[kind]?.[state];
  if (entry === undefined) throw new Error(`no words for ${kind} ${state}: the line-kind table never shows that pair`);
  return entry;
}

export function rowLabel(rowId: RowId): string {
  const label = DP1_WORDING.rows[rowId];
  if (label === undefined) throw new Error(`no label for row ${rowId}`);
  return label;
}

export function lineLabel(rowId: RowId, requirementId: string): string {
  const label = DP1_WORDING.lines[rowId]?.[requirementId];
  if (label === undefined) throw new Error(`no label for the ${requirementId} line of row ${rowId}`);
  return label;
}

export function reasonWords(code: ReasonCode): string {
  const words = DP1_WORDING.reasons[code];
  if (words === undefined) throw new Error(`no words for reason ${code}`);
  return words;
}

/**
 * The next step for one need. Only `missing_fact`, `range_crosses_threshold`
 * and a fact's own declared absent reason (`FactSteps.absentReason`) give a
 * step that can ask the visitor for an answer, and only for a fact the free
 * check asks. Every other reason gives the same step for every fact, and a
 * review reason always gives `REVIEW_STEP`, whatever a fact declares.
 */
export function nextStep(factType: string, reason: ReasonCode): NextStep {
  if (reason === 'missing_fact' || reason === 'range_crosses_threshold') {
    const steps = DP1_WORDING.factSteps[factType];
    if (steps === undefined) throw new Error(`no next step for ${factType}`);
    return reason === 'range_crosses_threshold' ? (steps.range ?? steps.missing) : steps.missing;
  }
  const step = DP1_WORDING.reasonSteps[reason];
  if (step === undefined) throw new Error(`no next step for reason ${reason}`);
  if (step === REVIEW_STEP) return step;
  const steps = DP1_WORDING.factSteps[factType];
  return steps?.absentReason === reason ? steps.missing : step;
}

/** The next step for a row state whose cells name no fact (the issuer row's coverage gap, a line not checked). */
export function rowStep(rowId: RowId, state: CellState): NextStep {
  const step = DP1_WORDING.rowSteps[rowId]?.[state];
  if (step === undefined) throw new Error(`no next step for row ${rowId} in state ${state}`);
  return step;
}

export const PRELIMINARY_LABEL = DP1_WORDING.labels.preliminary;
export const DRAFT_LABEL = DP1_WORDING.labels.draft;
export const COLUMN_HEADING = DP1_WORDING.labels.columnHeading;

/** A column's heading: "financial years that start in" the year (§4.2). */
export function startYearHeading(year: number): string {
  return DP1_WORDING.labels.startYear.replace('{year}', String(year));
}

/** The content threshold in force (KNW-10), with its decision. */
export function thresholdWords(threshold: ContentThreshold): string {
  const words = DP1_WORDING.labels.threshold[threshold];
  if (words === undefined) throw new Error(`no words for the content threshold ${String(threshold)}`);
  return words;
}

/** The national line's note: the country of registration as answered (an ISO code, `not_sure`, or `null` when unanswered). */
export function nationalLineNote(country: string | null): string {
  const { national } = DP1_WORDING.labels;
  if (country === null) return national.unanswered;
  if (country === 'not_sure') return national.notSure;
  const name = countryName(country);
  if (name === undefined) throw new Error(`${country} is not an ISO 3166-1 alpha-2 code`);
  return national.country.replace('{country}', name);
}

export const ERROR_STATES: Readonly<Record<ErrorState, ErrorWords>> = DP1_WORDING.errors;

export function errorWords(state: ErrorState): string {
  return DP1_WORDING.errors[state].words;
}

// ---------------------------------------------------------------------------
// The rules, as named problems
// ---------------------------------------------------------------------------

/** Every text a wording object holds, each named by where it lives. */
export function wordingEntries(wording: Wording): { entry: string; text: string }[] {
  const out: { entry: string; text: string }[] = [];
  for (const [kind, states] of Object.entries(wording.states)) {
    for (const [state, entry] of Object.entries(states ?? {})) if (entry !== undefined) out.push({ entry: `state ${kind} ${state}`, text: entry.words });
  }
  for (const [row, label] of Object.entries(wording.rows)) out.push({ entry: `row ${row}`, text: label });
  for (const [row, lines] of Object.entries(wording.lines)) {
    for (const [requirement, label] of Object.entries(lines)) out.push({ entry: `line ${row} ${requirement}`, text: label });
  }
  for (const [code, words] of Object.entries(wording.reasons)) out.push({ entry: `reason ${code}`, text: words });
  for (const [fact, steps] of Object.entries(wording.factSteps)) {
    out.push({ entry: `fact-step ${fact} missing`, text: steps.missing.words });
    if (steps.range !== undefined) out.push({ entry: `fact-step ${fact} range`, text: steps.range.words });
  }
  for (const [reason, step] of Object.entries(wording.reasonSteps)) out.push({ entry: `reason-step ${reason}`, text: step.words });
  for (const [row, states] of Object.entries(wording.rowSteps)) {
    for (const [state, step] of Object.entries(states ?? {})) if (step !== undefined) out.push({ entry: `row-step ${row} ${state}`, text: step.words });
  }
  const { labels } = wording;
  out.push({ entry: 'label preliminary', text: labels.preliminary });
  out.push({ entry: 'label draft', text: labels.draft });
  out.push({ entry: 'label column-heading', text: labels.columnHeading });
  out.push({ entry: 'label start-year', text: labels.startYear });
  for (const [threshold, words] of Object.entries(labels.threshold)) out.push({ entry: `label threshold ${threshold}`, text: words });
  for (const [variant, words] of Object.entries(labels.national)) out.push({ entry: `label national ${variant}`, text: words });
  for (const [state, error] of Object.entries(wording.errors)) out.push({ entry: `error ${state}`, text: error.words });
  return out;
}

/** One rule a wording entry breaks: the check, the entry, and what is wrong. */
export interface WordingProblem {
  check: string;
  entry: string;
  detail: string;
}

/** What the rules are checked against, each read from its own source by the caller. */
export interface WordingInputs {
  /** The reachable (kind, state) pairs: Task 4's `reachableCellStates`. */
  reachable: Readonly<Record<LineKind, readonly CellState[]>>;
  /** The engine's reason codes, from its runtime schema. */
  reasonCodes: readonly string[];
  /** Every fact type a row requirement's determination can need. */
  factTypes: readonly string[];
  /** `CHECK_ROWS`. */
  rows: readonly { id: RowId; lines: readonly { requirement: string }[] }[];
  /** The open row states whose cells name no fact. */
  openRowStates: readonly { row: RowId; state: CellState }[];
  /** The fact types the checker's answers can set: a step may ask only for one of these. */
  settableFacts: ReadonlySet<string>;
  /** The EU line kinds, whose definitive states say "at EU level" (law 6). */
  euKinds: readonly LineKind[];
  definitiveStates: readonly CellState[];
  /** What a kind's definitive words must name, and must never borrow from another kind. */
  kindMeanings: Partial<Record<LineKind, { names: string; never: readonly string[] }>>;
  /** The reason the pack gives each fact type when it is absent (fact-types.json `missingReason`, else `missing_fact`). */
  factMissingReasons: Readonly<Record<string, string>>;
  /** The reasons that are DataStrata's review and never ask. */
  reviewReasons: readonly string[];
  phrases: {
    /** Words that would say the visitor's answers or case were kept, sent or acted on. */
    impliedCase: readonly string[];
    /** Capabilities DP1 does not have. */
    unbuiltCapability: readonly string[];
    placeholders: readonly string[];
    /** Notes to content authors that never stand beside a result. */
    authorNotes: readonly string[];
  };
}

/** Apostrophes and quotation marks folded, so "We’ll" reads as "we'll". */
const fold = (text: string): string => text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** A phrase as a whole word or words: "sent" is found in "were sent", never in "presented". */
function containsPhrase(text: string, phrase: string): boolean {
  const escaped = fold(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(fold(text));
}

/**
 * Every rule the words break, each named by check and entry so a test or a
 * teeth check reads exactly which word failed. Pure over a wording object and
 * its inputs.
 */
export function wordingProblems(wording: Wording, inputs: WordingInputs): WordingProblem[] {
  const problems: WordingProblem[] = [];
  const add = (check: string, entry: string, detail: string): void => {
    problems.push({ check, entry, detail });
  };

  // States: every reachable pair worded; within a kind, no two states alike; law 6; each kind's own meaning.
  for (const [kind, states] of Object.entries(inputs.reachable) as [LineKind, readonly CellState[]][]) {
    for (const state of states) {
      const entry = wording.states[kind]?.[state];
      if (entry === undefined || entry.words.trim() === '' || entry.glyph.trim() === '') add('state-words', `state ${kind} ${state}`, 'reachable, but has no words and glyph');
    }
  }
  for (const [kind, states] of Object.entries(wording.states) as [LineKind, Partial<Record<CellState, StateWords>>][]) {
    const entries = Object.entries(states) as [CellState, StateWords][];
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [a, x] = entries[i]!;
        const [b, y] = entries[j]!;
        if (fold(x.words) === fold(y.words)) add('state-distinct', `state ${kind} ${a} and ${b}`, `share the words "${x.words}"`);
        if (x.glyph === y.glyph) add('state-distinct', `state ${kind} ${a} and ${b}`, `share the glyph "${x.glyph}"`);
      }
    }
  }
  for (const kind of inputs.euKinds) {
    for (const state of inputs.definitiveStates) {
      const entry = wording.states[kind]?.[state];
      if (entry !== undefined && !entry.words.includes('at EU level')) add('eu-level', `state ${kind} ${state}`, 'lacks "at EU level"');
    }
  }
  for (const [kind, meaning] of Object.entries(inputs.kindMeanings) as [LineKind, { names: string; never: readonly string[] }][]) {
    for (const state of inputs.definitiveStates) {
      const entry = wording.states[kind]?.[state];
      if (entry === undefined) continue;
      if (!fold(entry.words).includes(fold(meaning.names))) add('kind-meaning', `state ${kind} ${state}`, `does not name "${meaning.names}"`);
      for (const borrowed of meaning.never) if (fold(entry.words).includes(fold(borrowed))) add('kind-meaning', `state ${kind} ${state}`, `borrows "${borrowed}"`);
    }
  }
  const kinds = Object.keys(wording.states) as LineKind[];
  for (const state of inputs.definitiveStates) {
    for (let i = 0; i < kinds.length; i += 1) {
      for (let j = i + 1; j < kinds.length; j += 1) {
        const x = wording.states[kinds[i]!]?.[state];
        const y = wording.states[kinds[j]!]?.[state];
        if (x !== undefined && y !== undefined && fold(x.words) === fold(y.words)) add('kind-meaning', `state ${kinds[i]} and ${kinds[j]} ${state}`, `share the words "${x.words}"`);
      }
    }
  }

  // Reasons, labels and steps: every input has its entry.
  for (const code of inputs.reasonCodes) {
    const words = (wording.reasons as Record<string, string | undefined>)[code];
    if (words === undefined || words.trim() === '') add('reason-words', `reason ${code}`, 'an engine reason code with no words');
  }
  for (const row of inputs.rows) {
    if ((wording.rows[row.id] ?? '').trim() === '') add('row-label', `row ${row.id}`, 'no label');
    for (const line of row.lines) {
      if ((wording.lines[row.id]?.[line.requirement] ?? '').trim() === '') add('line-label', `line ${row.id} ${line.requirement}`, 'no label');
    }
  }
  for (const fact of inputs.factTypes) {
    const steps = wording.factSteps[fact];
    if (steps === undefined || steps.missing.words.trim() === '') add('fact-step', `fact-step ${fact}`, 'a fact type that can appear in needs, with no next step');
  }
  for (const { row, state } of inputs.openRowStates) {
    const step = wording.rowSteps[row]?.[state];
    if (step === undefined || step.words.trim() === '') add('row-step', `row-step ${row} ${state}`, 'an open state naming no fact, with no next step of its own');
  }
  for (const [fact, steps] of Object.entries(wording.factSteps)) {
    for (const [variant, step] of [['missing', steps.missing], ['range', steps.range]] as const) {
      if (step !== undefined && step.asks.length > 0 && !inputs.settableFacts.has(fact)) {
        add('asks-unsettable', `fact-step ${fact} ${variant}`, `asks ${step.asks.join(', ')} for a fact no answer sets`);
      }
    }
  }
  // A fact's own absent reason, both directions against the pack: an asked fact whose absent reason is neither
  // missing_fact nor a review reason declares it; no step declares a reason the pack does not give its fact.
  for (const fact of inputs.factTypes) {
    const absent = inputs.factMissingReasons[fact] ?? 'missing_fact';
    if (!inputs.settableFacts.has(fact) || absent === 'missing_fact' || inputs.reviewReasons.includes(absent)) continue;
    if (wording.factSteps[fact]?.absentReason !== absent) {
      add('absent-reason', `fact-step ${fact}`, `the pack gives this asked fact ${absent} when it is absent, and the step does not declare it`);
    }
  }
  for (const [fact, steps] of Object.entries(wording.factSteps)) {
    if (steps.absentReason === undefined) continue;
    const absent = inputs.factMissingReasons[fact] ?? 'missing_fact';
    if (steps.absentReason !== absent) add('absent-reason', `fact-step ${fact}`, `declares ${steps.absentReason}, which the pack does not give it (it gives ${absent})`);
    else if (inputs.reviewReasons.includes(steps.absentReason)) add('absent-reason', `fact-step ${fact}`, `declares ${steps.absentReason}, a review reason, which never asks`);
    else if (!inputs.settableFacts.has(fact)) add('absent-reason', `fact-step ${fact}`, `declares ${steps.absentReason} for a fact no answer sets`);
  }
  for (const [reason, step] of Object.entries(wording.reasonSteps)) {
    if (step.asks.length > 0) add('asks-reason', `reason-step ${reason}`, `asks ${step.asks.join(', ')}, though only a missing answer, a straddled band or a fact's own absent reason may ask`);
  }

  // Phrases, over every entry.
  const scans: [string, readonly string[]][] = [
    ['implied-case', inputs.phrases.impliedCase],
    ['unbuilt-capability', inputs.phrases.unbuiltCapability],
    ['placeholder', inputs.phrases.placeholders],
    ['author-note', inputs.phrases.authorNotes],
  ];
  for (const { entry, text } of wordingEntries(wording)) {
    for (const [check, phrases] of scans) {
      for (const phrase of phrases) if (containsPhrase(text, phrase)) add(check, entry, `contains "${phrase}"`);
    }
  }
  return problems;
}
