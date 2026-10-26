/**
 * The checker's timeline, as a customer would receive it, fenced by a recorded
 * golden (DG-8, part 3).
 *
 * **Why this file exists.** The timeline is the free checker's whole answer,
 * and any drift in it, a moved cell, a lost need, a reworded reason, a flag
 * flipped, is a change in what a visitor is told. So one fixed set of answers,
 * the widest slice the questions reach (an EU intermediate parent whose figures
 * show C-6, answered "Not sure", with C-9 and C-10 answered), at a fixed date,
 * is serialised and compared byte for byte with an artefact produced once, by
 * a reviewed, one-off generation kept outside the repository.
 *
 * **Generation evidence and semantic evidence are different layers**, as in
 * `provenance-public-golden.test.ts`:
 *
 * ```text
 * current payload == timeline golden              regression / generation evidence
 * each line's sources == EXPECTED_SOURCES         semantic evidence, independent of the pack
 * each line's locators == provenance projection   projection evidence
 * ```
 *
 * The sources oracle is the engine's composed `EXPECTED_SOURCES`: the audit
 * for its sixteen, as corrected since, the C/G design for the seven after it,
 * and E-2's addition. The audited table alone (`AUDIT_EXPECTED_SOURCES`) holds
 * none of the first-application or duty requirements this timeline is built
 * from, which a test below shows; Tasks 1 and 2 used the composed table for the
 * same reason.
 *
 * **The oracle moved here from the provenance-era golden** (DG-8, part 3; DP1
 * Task 6), whose forward comparison is retired because its fixed answers can no
 * longer be posed. Only what this file did not already hold was moved, and it
 * runs on the live timeline: every line requirement of `CHECK_ROWS` cites
 * exactly its expected sources, no locator carries a source identity, and E-1's
 * correction and E-2's addition reach the surface, each named on its own. Two
 * of those requirements (CSRD-S-007, CSRD-S-024) are shown only to a company
 * outside the EU, so a US company's timeline is read beside the golden's.
 *
 * This test never writes, and holds no path that regenerates the artefact.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { csrdPack } from '@/lib/pack';
import { checkerAnswersSchema, visibleQuestions, type CheckerAnswers } from '@/lib/check-answers';
import { CHECK_ROWS } from '@/lib/check-routes';
import { buildCheckTimeline, type CheckTimeline } from '@/lib/check-timeline';
import {
  AUDIT_EXPECTED_SOURCES,
  AUDIT_EXPECTED_UNIVERSE,
  E1_CORRECTED_CASE,
  E2_ADDED_CASE,
  EXPECTED_SOURCES,
} from '../../../backend/engine/test/audit-expected-provenance';

const GOLDEN = fileURLToPath(new URL('./golden/checker-timeline-public-golden.json', import.meta.url));
const CASES = fileURLToPath(new URL('./checker-cases.json', import.meta.url));

/** The widest slice (plan Task 4, "The new public golden"). */
const FIXED_ANSWERS: CheckerAnswers = {
  country: 'DE',
  group: 'both',
  organisation: 'private_limited',
  employees: 'over_1100',
  turnover: 'over_500m',
  pie: 'not_sure',
  parentReport: 'yes',
  parentOwnEmployees: 'over_900_up_to_1100',
  parentOwnTurnover: 'over_500m',
};
const FIXED_DATE = '2026-10-23';

const payload = (): CheckTimeline => buildCheckTimeline(csrdPack(), FIXED_ANSWERS, FIXED_DATE);
const serialise = (value: CheckTimeline): string => `${JSON.stringify(value, null, 2)}\n`;
const recorded = (): CheckTimeline => JSON.parse(readFileSync(GOLDEN, 'utf8')) as CheckTimeline;

describe('the checker timeline public golden: the generation', () => {
  it('matches the recorded artefact exactly, byte for byte', () => {
    const bytes = readFileSync(GOLDEN, 'utf8');
    const actual = serialise(payload());
    expect(JSON.parse(actual)).toEqual(JSON.parse(bytes));
    // Bytes, not just structure: key order is part of what the route hands back.
    expect(actual).toBe(bytes);
  });

  it('is a capture of fixed inputs, not of the day it ran', () => {
    const golden = recorded();
    expect(golden.assessedAt).toBe(FIXED_DATE);
    expect(golden.assessedAt).not.toBe(new Date().toISOString().slice(0, 10));
  });

  it('captures a substantial payload, so agreement means something', () => {
    const golden = recorded();
    expect(golden.routes.map((r) => r.id)).toEqual(['parent_own', 'consolidated', 'exemption', 'art_40a_gateway', 'national']);
    const cells = golden.routes.flatMap((r) => r.lines.flatMap((l) => l.cells));
    const states = new Set<string>(cells.map((c) => c.state));
    for (const state of ['applies', 'does_not_apply', 'cannot_decide', 'requires_review']) expect([state, states.has(state)]).toEqual([state, true]);
    expect(cells.some((c) => c.needs?.[0]?.reason === 'range_crosses_threshold')).toBe(true);
    expect(golden.content).toEqual({ draft: true, threshold: 'draft_labelled' });
    expect([golden.hypothetical, golden.preliminary, golden.basis]).toEqual([true, true, 'start_year']);
  });

  it('the fixed answers are a flow the questions produce: C-6 shown and answered "Not sure", C-7 shown, C-9 and C-10 offered and answered; and they are checker-cases.json’s golden case', () => {
    expect(checkerAnswersSchema.parse(FIXED_ANSWERS)).toEqual(FIXED_ANSWERS);
    expect(visibleQuestions(FIXED_ANSWERS).map((q) => q.id)).toEqual(['C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-9', 'C-10']);
    const file = JSON.parse(readFileSync(CASES, 'utf8')) as { assessmentDate: string; cases: { id: string; answers: unknown }[] };
    expect(file.cases.find((c) => c.id === 'golden-widest-slice')?.answers).toEqual(FIXED_ANSWERS);
    expect(file.assessmentDate).toBe(FIXED_DATE);
  });
});

describe('what the golden shows, against independent oracles', () => {
  it('each line cites exactly the sources its requirement is expected to cite: the audit as corrected, the C/G design, E-2', () => {
    const live = payload();
    const lines = live.routes.flatMap((r) => r.lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.legalBasis.sources.map((s) => s.id), line.requirement).toEqual([...EXPECTED_SOURCES[line.requirement]!]);
    }
  });

  it('the composed oracle is the one that can speak: the audited table alone holds none of the first-application or duty requirements on this timeline', () => {
    const requirements = payload().routes.flatMap((r) => r.lines.map((l) => l.requirement));
    const outsideAudit = requirements.filter((id) => AUDIT_EXPECTED_SOURCES[id] === undefined);
    expect(outsideAudit).toEqual(expect.arrayContaining(['CSRD-S-017', 'CSRD-S-018', 'CSRD-S-019', 'CSRD-S-020', 'CSRD-S-021']));
    for (const id of requirements) expect([id, EXPECTED_SOURCES[id] !== undefined]).toEqual([id, true]);
  });

  it('each source is shown with its title and address, never a bare identifier', () => {
    const sources = payload().routes.flatMap((r) => r.lines.flatMap((l) => l.legalBasis.sources));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.title, source.id).not.toBe(source.id);
      expect(source.url, source.id).toMatch(/^https:\/\//);
    }
  });

  it('each line shows exactly its requirement’s locators, projected here independently', () => {
    const pack = csrdPack();
    const WHOLE_DOCUMENT = 'the instrument as a whole';
    const lines = payload().routes.flatMap((r) => r.lines);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const requirement = pack.requirements.find((r) => r.id === line.requirement)!;
      const expected = requirement.provenance.flatMap((entry) => entry.locators.map((l) => (l.kind === 'whole_document' ? WHOLE_DOCUMENT : l.text)));
      expect(line.legalBasis.locators, line.requirement).toEqual(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Moved from the provenance-era golden (DG-8, part 3): what this file did not hold
// ---------------------------------------------------------------------------

describe('the audit’s expected sources on the live timeline, moved from the provenance-era golden', () => {
  /** A US company with no group, whose group passes Article 40a's turnover test: the rows only a company outside the EU is shown. */
  const US: CheckerAnswers = { country: 'US', group: 'none', euTurnover: 'both' };
  const lines = () => [payload(), buildCheckTimeline(csrdPack(), US, FIXED_DATE)].flatMap((t) => t.routes.flatMap((r) => r.lines.map((l) => ({ row: r.id, ...l }))));
  const lineFor = (row: string, requirement: string) => {
    const found = lines().find((l) => l.row === row && l.requirement === requirement);
    if (found === undefined) throw new Error(`no ${row} ${requirement} line`);
    return found;
  };

  it('the two timelines between them carry every line requirement of CHECK_ROWS, and each line cites exactly the sources its requirement is expected to cite', () => {
    const carried = new Set(lines().map((l) => l.requirement));
    expect([...new Set(CHECK_ROWS.flatMap((r) => r.lines.map((l) => l.requirement)))].filter((id) => !carried.has(id))).toEqual([]);
    for (const line of lines()) {
      expect(line.legalBasis.sources.map((s) => s.id), `${line.row} ${line.requirement}`).toEqual([...EXPECTED_SOURCES[line.requirement]!]);
    }
  });

  it('shows a customer no source identity in place of an address', () => {
    const everyLocator = lines().flatMap((l) => l.legalBasis.locators);
    expect(everyLocator.length).toBeGreaterThan(0);
    for (const locator of everyLocator) expect(locator, locator).not.toMatch(/SRC-\d{3}/);
    for (const sourceId of AUDIT_EXPECTED_UNIVERSE) expect(everyLocator.some((l) => l.includes(sourceId))).toBe(false);
  });

  it('E-1’s correction reaches the customer surface, named on its own: the Article 40a group test reads does_not_apply before 2028, citing the CSRD beside the host directive', () => {
    // QD-4 E-1 (DG-6, 2026-10-23): the Article 40a group gate starts with financial years beginning on or after 1 January 2028 (CSRD Art 5(2), second subparagraph).
    const line = lineFor('art_40a', E1_CORRECTED_CASE.requirementId);
    expect(line.cells.filter((c) => c.startYear < 2028)).toEqual([2025, 2026, 2027].map((startYear) => ({ startYear, state: 'does_not_apply' })));
    expect(line.legalBasis.sources.map((s) => s.id)).toEqual([...E1_CORRECTED_CASE.sources]);
    expect(line.legalBasis.sources[1]!.title).toContain('2022/2464');
    expect(line.legalBasis.locators).toContain(E1_CORRECTED_CASE.locator);
    // The audit's own entry is not rewritten by the correction.
    expect(AUDIT_EXPECTED_SOURCES[E1_CORRECTED_CASE.requirementId]).toEqual([...E1_CORRECTED_CASE.auditSources]);
  });

  it('E-2’s addition reaches the customer surface, named on its own: the issuer route reads not yet covered, never does not apply, citing the CSRD with both provisions', () => {
    // QD-4 E-2 (DG-7, option A, 2026-10-23): the third-country issuer route (CSRD Art 2 and Art 5(2), third subparagraph) is not encoded (KNW-14).
    const line = lineFor('issuer', E2_ADDED_CASE.requirementId);
    // Each cell whole: rule R's reason (DG-7, option A), and no `needs` key at all, since a known coverage gap is DataStrata's to close and asks the visitor nothing (Task 2).
    expect(line.cells).toEqual([2025, 2026, 2027, 2028].map((startYear) => ({ startYear, state: 'not_yet_covered', reason: 'source_status_unresolved' })));
    expect(line.cells.every((c) => !Object.hasOwn(c, 'needs'))).toBe(true);
    expect(line.legalBasis.sources.map((s) => s.id)).toEqual([...E2_ADDED_CASE.sources]);
    expect(line.legalBasis.sources[0]!.title).toContain('2022/2464');
    expect(line.legalBasis.locators).toEqual([...E2_ADDED_CASE.locators]);
    // An addition, not a correction: the audit holds no entry for it.
    expect(AUDIT_EXPECTED_SOURCES[E2_ADDED_CASE.requirementId]).toBeUndefined();
  });
});
