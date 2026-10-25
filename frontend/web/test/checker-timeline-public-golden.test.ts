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
 * This test never writes, and holds no path that regenerates the artefact.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { csrdPack } from '@/lib/pack';
import { checkerAnswersSchema, visibleQuestions, type CheckerAnswers } from '@/lib/check-answers';
import { buildCheckTimeline, type CheckTimeline } from '@/lib/check-timeline';
import { AUDIT_EXPECTED_SOURCES, EXPECTED_SOURCES } from '../../../backend/engine/test/audit-expected-provenance';

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
