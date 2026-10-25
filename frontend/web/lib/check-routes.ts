/**
 * The free checker's route rows: which legal routes a visitor sees, and which
 * single requirement each line of a row reports (proposal §4.2 and §9.2; rule
 * R; DP1 plan, Task 4).
 *
 * **Why this module exists.** Rule R keeps the routes apart: the individual
 * duty, the consolidated duty, the exemptions, Article 40a and the issuer route
 * are each assessed and shown on their own line, and an unasked or unencoded
 * route is shown as such, never dropped. The defects this table guards against
 * are silent: a row missing for a visitor who has that route, a line reading
 * a neighbouring requirement's result, an exemption line read as if it were the
 * duty. So the table is data, one line per requirement, and every line's kind
 * fixes what its states may claim (`LINE_KINDS`); `lib/check-timeline.ts` reads
 * each cell from the line's own requirement and nothing else.
 *
 * Labels here are drafts for Task 5's approval (`draftLabel`). They are never
 * sent: the payload carries ids and kinds, and the wording module words them.
 *
 * Client-safe: it imports only the answers module's country list.
 */

import { EU_COUNTRY_CODES, type CheckerAnswers } from './check-answers';

/**
 * What a line reports, which fixes what each of its states means (plan Task 4,
 * "The line kinds"):
 *
 * - `first_application`: whether the Article 19a or 29a measures apply to the
 *   company or group for years starting that year (a scope test, not a duty);
 * - `duty`: whether a reporting duty remains after the exemptions the pack
 *   encodes;
 * - `exemption`: whether one exemption is available;
 * - `group_test`: whether a non-EU group passes Article 40a's EU-turnover test;
 * - `gateway`: whether this EU company is the subsidiary through which a non-EU
 *   group reports under Article 40a;
 * - `coverage_gap`: a route the pack does not encode; never "applies" or "does
 *   not apply";
 * - `national`: the national-law gate; reads "requires review" in DP1.
 */
export const LINE_KINDS = ['first_application', 'duty', 'exemption', 'group_test', 'gateway', 'coverage_gap', 'national'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const ROW_IDS = ['individual', 'parent_own', 'consolidated', 'exemption', 'art_40a', 'art_40a_gateway', 'issuer', 'national'] as const;
export type RowId = (typeof ROW_IDS)[number];

/** C-2's answer; an unanswered C-2 is read as "Not sure", so that no route it could bring is dropped. */
export type GroupPosition = 'none' | 'parent' | 'owned' | 'both' | 'not_sure';

export interface CheckLineSpec {
  kind: LineKind;
  /** The one requirement whose determination fills the line's cells. */
  requirement: string;
  /** Draft for Task 5's approval; never sent. */
  draftLabel: string;
  /** An exemption line: the first-application route it relieves (S-017 for S-005 and S-006; S-018 for S-019). */
  relieves?: string;
  /** Where the row shows a line to fewer group positions than the row itself. */
  onlyFor?: readonly GroupPosition[];
}

export interface CheckRowSpec {
  id: RowId;
  /** Draft for Task 5's approval; never sent. */
  draftLabel: string;
  /** The group positions for which an EU company sees the row. */
  eu: readonly GroupPosition[];
  /** Whether a non-EU company sees the row, whatever its group position. */
  nonEu: boolean;
  lines: readonly CheckLineSpec[];
}

const ALL_GROUPS: readonly GroupPosition[] = ['none', 'parent', 'owned', 'both', 'not_sure'];

const FIRST_APPLICATION = 'First application';
const DUTY = 'Duty after exemptions';

/**
 * The row table (plan Task 4, "The rows"; proposal §4.2 and §9.2), in the
 * order rows are shown. Each line reports exactly one requirement.
 */
export const CHECK_ROWS: readonly CheckRowSpec[] = [
  {
    id: 'individual',
    draftLabel: "Your company's own sustainability report (Article 19a)",
    eu: ['none', 'owned', 'not_sure'],
    nonEu: false,
    lines: [
      { kind: 'first_application', requirement: 'CSRD-S-017', draftLabel: FIRST_APPLICATION },
      { kind: 'duty', requirement: 'CSRD-S-020', draftLabel: DUTY },
    ],
  },
  {
    id: 'parent_own',
    draftLabel: "The parent company's own report (Article 19a)",
    eu: ['parent', 'both'],
    nonEu: false,
    lines: [
      { kind: 'first_application', requirement: 'CSRD-S-017', draftLabel: FIRST_APPLICATION },
      { kind: 'duty', requirement: 'CSRD-S-020', draftLabel: DUTY },
    ],
  },
  {
    id: 'consolidated',
    draftLabel: "The group's consolidated report (Article 29a)",
    eu: ['parent', 'both', 'not_sure'],
    nonEu: false,
    lines: [
      { kind: 'first_application', requirement: 'CSRD-S-018', draftLabel: FIRST_APPLICATION },
      { kind: 'duty', requirement: 'CSRD-S-021', draftLabel: DUTY },
    ],
  },
  {
    id: 'exemption',
    draftLabel: "Exemption through a parent's group report",
    eu: ['owned', 'both', 'not_sure'],
    nonEu: false,
    lines: [
      {
        kind: 'exemption',
        requirement: 'CSRD-S-019',
        draftLabel: "The group, through a higher parent's report",
        relieves: 'CSRD-S-018',
        onlyFor: ['both'],
      },
      { kind: 'exemption', requirement: 'CSRD-S-005', draftLabel: "Through an EU parent's report", relieves: 'CSRD-S-017' },
      { kind: 'exemption', requirement: 'CSRD-S-006', draftLabel: "Through a non-EU parent's report", relieves: 'CSRD-S-017' },
    ],
  },
  {
    id: 'art_40a',
    draftLabel: "A non-EU group's EU reporting (Article 40a, from 2028)",
    eu: [],
    nonEu: true,
    lines: [{ kind: 'group_test', requirement: 'CSRD-S-007', draftLabel: 'EU-turnover test' }],
  },
  {
    id: 'art_40a_gateway',
    draftLabel: 'Your company as the EU subsidiary that reports for a non-EU group (Article 40a, from 2028)',
    eu: ['owned', 'both'],
    nonEu: false,
    lines: [{ kind: 'gateway', requirement: 'CSRD-S-008', draftLabel: 'This company as the reporting subsidiary' }],
  },
  {
    id: 'issuer',
    draftLabel: 'Shares or bonds on an EU regulated market (Transparency Directive)',
    eu: [],
    nonEu: true,
    lines: [{ kind: 'coverage_gap', requirement: 'CSRD-S-024', draftLabel: 'Not yet covered' }],
  },
  {
    id: 'national',
    draftLabel: 'National law',
    eu: ALL_GROUPS,
    nonEu: false,
    lines: [{ kind: 'national', requirement: 'CSRD-S-013', draftLabel: 'National-law status' }],
  },
];

const EU_CODES: ReadonlySet<string> = new Set(EU_COUNTRY_CODES);

/**
 * Which side of the EU border C-1's answer puts the company on. "Another
 * country" is never an EU code (the schema refuses one), so it is non-EU. "Not
 * sure", or no answer, is unknown: both sides' rows are shown (plan Task 4,
 * "With C-1 'Not sure'"), since the engine reads an unanswered country exactly
 * as an unknown one and no route may be dropped.
 */
export function countrySide(answers: CheckerAnswers): 'eu' | 'non_eu' | 'unknown' {
  if (answers.country === undefined || answers.country === 'not_sure') return 'unknown';
  if (answers.country === 'other') return 'non_eu';
  return EU_CODES.has(answers.country) ? 'eu' : 'non_eu';
}

/** C-2's answer, an unanswered one read as "Not sure" for the same reason. */
export function groupPosition(answers: CheckerAnswers): GroupPosition {
  return answers.group ?? 'not_sure';
}

export interface ShownRow {
  row: CheckRowSpec;
  lines: readonly CheckLineSpec[];
}

/**
 * The rows a visitor sees, in table order, each with the lines it shows them.
 * A row the table does not show for the visitor is absent; a row it shows is
 * never dropped (plan Task 4, "Row presence"). Presence reads C-1 and C-2 only.
 */
export function shownRows(answers: CheckerAnswers): ShownRow[] {
  const side = countrySide(answers);
  const group = groupPosition(answers);
  const shown: ShownRow[] = [];
  for (const row of CHECK_ROWS) {
    const forEu = side !== 'non_eu' && row.eu.includes(group);
    const forNonEu = side !== 'eu' && row.nonEu;
    if (!forEu && !forNonEu) continue;
    shown.push({ row, lines: row.lines.filter((line) => line.onlyFor === undefined || line.onlyFor.includes(group)) });
  }
  return shown;
}
