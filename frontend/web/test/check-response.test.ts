/**
 * The check payload must be a function of its inputs alone.
 *
 * Spec §7.1 requires a public rendered golden over the customer-visible checker
 * result, and a golden can only fence a payload that does not move on its own.
 * The route used to read the clock, so the same answers produced a different
 * payload tomorrow; these tests hold the line that the date is an argument and
 * that nothing else in the builder consults the machine it runs on.
 *
 * Since DP1 Task 6 the payload is the start-year timeline (`buildCheckTimeline`;
 * its golden is `checker-timeline-public-golden`), and these cases are
 * re-expressed over it with their meaning kept: the same answers give the same
 * payload, the date is the caller's, the draft flag is truthful, an answer the
 * law turns on is never defaulted, and a question the check no longer asks is
 * never assumed answered.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assess } from '@datastrata/engine';
import type { Determination } from '@datastrata/engine';
import { buildCheckTimeline, type CheckCell, type CheckLine } from '@/lib/check-timeline';
import { csrdPack } from '@/lib/pack';
import { buildCheckProfile, CHECK_ENTITY_ID, checkerAnswersSchema, type CheckerAnswers } from '@/lib/check-answers';
import { checkView } from '@/lib/check-view';
import { DP1_WORDING } from '@/lib/wording';

/** A German company with no group over both thresholds — every question it is shown answered. */
const EU_ABOVE_THRESHOLD: CheckerAnswers = {
  country: 'DE',
  group: 'none',
  // C-3: an ordinary undertaking, not an investment fund, so not excluded by Article 1(4). Stated, not defaulted.
  organisation: 'private_limited',
  employees: 'over_1100',
  turnover: 'over_500m',
  pie: 'no',
};

/** Deliberately in the past, so it can never coincide with the machine's clock. */
const FIXED_DATE = '2026-07-26';

const today = () => new Date().toISOString().slice(0, 10);

/** One line of the timeline for these answers, by row and requirement. */
function lineOf(answers: CheckerAnswers, row: string, requirement: string): CheckLine {
  const found = buildCheckTimeline(csrdPack(), answers, FIXED_DATE)
    .routes.find((r) => r.id === row)
    ?.lines.find((l) => l.requirement === requirement);
  if (found === undefined) throw new Error(`no ${row} ${requirement} line in the payload`);
  return found;
}
const cellIn = (line: CheckLine, year: number): CheckCell => line.cells.find((c) => c.startYear === year)!;

describe('buildCheckTimeline', () => {
  it('returns deeply equal payloads for identical arguments', () => {
    const pack = csrdPack();
    const first = buildCheckTimeline(pack, EU_ABOVE_THRESHOLD, FIXED_DATE);
    const second = buildCheckTimeline(pack, EU_ABOVE_THRESHOLD, FIXED_DATE);
    expect(first).toEqual(second);
  });

  it('echoes the assessment date it was given, not the date it ran on', () => {
    // Guards the guard: a fixed date equal to today would assert nothing.
    expect(FIXED_DATE).not.toBe(today());
    const response = buildCheckTimeline(csrdPack(), EU_ABOVE_THRESHOLD, FIXED_DATE);
    expect(response.assessedAt).toBe(FIXED_DATE);
    expect(response.assessedAt).not.toBe(today());
  });

  it('reports draft content for an EU entity above both thresholds', () => {
    const response = buildCheckTimeline(csrdPack(), EU_ABOVE_THRESHOLD, FIXED_DATE);
    expect(response.content.draft).toBe(true);
  });

  it('reads no clock anywhere in its own source, or in the answers and routes it builds from', () => {
    for (const module of ['../lib/check-timeline.ts', '../lib/check-answers.ts', '../lib/check-routes.ts']) {
      const source = readFileSync(fileURLToPath(new URL(module, import.meta.url)), 'utf8');
      const offenders = source
        .split('\n')
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => /new Date|Date\.now|performance\.now/.test(line))
        .map(([n, line]) => `${module}:${n}:${line}`);
      expect(offenders).toEqual([]);
    }
  });
});

/**
 * The Article 1(4) exclusion answer, through the public path.
 *
 * Since DP1 it is part of C-3 ("What kind of organisation is it?"): "Investment
 * fund" sets the exclusion, every other kind sets it false, labelled "not an
 * investment fund", and "Not sure" sets it unknown (plan Task 3); before, it was
 * the separate question Q-039. A fund is definitively outside Article 19a and
 * any other kind leaves it in. An absent or "Not sure" answer contributes no
 * default, so the company's own route stays open with the exclusion named as
 * a missing fact, and the step the visitor reads asks for the kind of
 * organisation — never that the law is ambiguous, because it is the answer
 * that is missing.
 */
describe('the Article 1(4) exclusion answer', () => {
  const individual = (answers: CheckerAnswers) => lineOf(answers, 'individual', 'CSRD-S-017');
  /** The in-scope answers with C-3 removed, so each case states its own. */
  const { organisation: _stated, ...withoutOrganisation } = EU_ABOVE_THRESHOLD;

  it('"not a fund" with an in-scope EU profile: the individual route applies', () => {
    const line = individual({ ...withoutOrganisation, organisation: 'private_limited' });
    for (const year of [2027, 2028]) {
      const cell = cellIn(line, year);
      expect([year, cell.state, cell.reason, cell.needs]).toEqual([year, 'applies', undefined, undefined]);
    }
  });

  it('"Investment fund": the company is definitively outside Article 19a in every start year, with no reason code and nothing to resolve', () => {
    const answers = checkerAnswersSchema.parse({ ...withoutOrganisation, organisation: 'fund', pie: undefined });
    const line = individual(answers);
    expect(line.cells).toEqual([2025, 2026, 2027, 2028].map((startYear) => ({ startYear, state: 'does_not_apply' })));
    expect(line.legalBasis.locators).toContain('Article 1(4)');
  });

  it.each([
    ['absent', withoutOrganisation],
    ['"Not sure"', { ...withoutOrganisation, organisation: 'not_sure' as const }],
  ])('%s: the route stays open, naming the missing exclusion answer, and the visitor’s step asks for the kind of organisation rather than calling the law ambiguous', (_label, answers) => {
    const cell = cellIn(individual(answers), 2027);
    expect(cell.state).toBe('cannot_decide');
    // S-017's 2027 branch is `requirement_ref CSRD-S-001 expect APPLIES`, and S-001 is open, so the line's own reason is the upstream one.
    expect(cell.reason).toBe('upstream_indeterminate');
    // No default: C-3 unanswered or "Not sure" leaves both its facts open, the legal form (whose absent reason the pack
    // gives as legal_ambiguity) and the Article 1(4) exclusion, named as missing rather than assumed false; in this order.
    expect(cell.needs).toEqual([
      { factType: 'entity.legal_form', reason: 'legal_ambiguity' },
      { factType: 'entity.excluded_by_article_1_4', reason: 'missing_fact' },
    ]);
    const viewed = checkView(buildCheckTimeline(csrdPack(), answers, FIXED_DATE), answers)
      .rows.find((r) => r.id === 'individual')!
      .lines.find((l) => l.requirement === 'CSRD-S-017')!
      .cells.find((c) => c.startYear === 2027)!;
    // The reason words the visitor reads (WORDING-TABLE.md, approved 2026-10-26), never that the law is ambiguous:
    // not the payload before DP1's "The law is ambiguous here", nor the approved legal_ambiguity words.
    expect(viewed.reason).toBe('This depends on another result that cannot be decided yet');
    expect(viewed.reason).not.toBe('The law is ambiguous here');
    expect(viewed.reason).not.toBe('This turns on a legal classification that is not settled yet');
    const step = viewed.step;
    // The approved C-3 step (WORDING-TABLE.md, entity.legal_form, its absent reason legal_ambiguity): it names the missing answer and asks C-3.
    expect(step?.asks).toBe('C-3');
    expect(step?.words).toBe('We need the kind of organisation. Your articles of association or company-register extract state the legal form; then answer or change your answer.');
    // The customer-facing step says the answer is what is missing, never the legal-judgment step.
    expect(step?.words).not.toBe(DP1_WORDING.reasonSteps.legal_ambiguity.words);
  });
});

/**
 * The financial-holding status of a parent (Q-045).
 *
 * Article 29a(7a) lets a financial holding undertaking choose not to include
 * the consolidated sustainability information, so a parent's consolidated duty
 * (CSRD-S-021) is unresolved until its holding status is stated; the option is
 * never assumed unexercised. A company with no group has no consolidated duty
 * for the status to touch.
 *
 * The free check no longer asks it: DP1 moved Q-045 to onboarding (proposal
 * §4.1, "What moves out"; plan Task 3), and the strict schema refuses a
 * `holding` answer. So through the public path the duty stays open, naming the
 * status, and its step asks nothing. That stating the status is exactly what
 * settles it is shown by adding that one fact to the checker's own profile and
 * calling the engine directly, as onboarding will: "no" makes the duty apply,
 * "yes" leaves the option's own conditions open.
 */
describe('the financial-holding status of a parent', () => {
  const PARENT: CheckerAnswers = { ...EU_ABOVE_THRESHOLD, group: 'parent' };
  const HOLDING = 'entity.is_financial_holding_undertaking';

  /** The engine's determination for financial years starting in 2027, over the checker's profile with the holding status stated. */
  function stated(answers: CheckerAnswers, value: boolean | undefined, id: string): Determination {
    const profile = buildCheckProfile(answers);
    if (value !== undefined) {
      profile.facts.push({ factType: HOLDING, scopeId: CHECK_ENTITY_ID, value: { kind: 'boolean', value }, confirmed: true, source: { kind: 'customer_statement', ref: 'Onboarding answer' } });
    }
    const result = assess(csrdPack(), profile, { assessmentDate: FIXED_DATE, financialYear: { start: '2027-01-01', end: '2027-12-31' }, subjectId: CHECK_ENTITY_ID });
    const found = result.determinations.find((d) => d.requirementId === id);
    if (found === undefined) throw new Error(`no ${id} determination`);
    return found;
  }

  it('"no", once stated: the consolidated duty of a parent above both thresholds applies', () => {
    expect(stated(PARENT, false, 'CSRD-S-021').result).toBe('APPLIES');
    expect(stated(PARENT, false, 'CSRD-S-014').result).toBe('APPLIES');
  });

  it('unstated, as the free check leaves it: the consolidated duty stays open and names the holding status — the option is never assumed unexercised — and its step asks nothing', () => {
    expect(checkerAnswersSchema.safeParse({ ...PARENT, holding: 'no' }).success).toBe(false);
    const cell = cellIn(lineOf(PARENT, 'consolidated', 'CSRD-S-021'), 2027);
    expect(cell.state).toBe('cannot_decide');
    expect(cell.reason).toBe('upstream_indeterminate');
    expect(cell.needs?.map((n) => n.factType)).toContain(HOLDING);
    const step = checkView(buildCheckTimeline(csrdPack(), PARENT, FIXED_DATE), PARENT)
      .rows.find((r) => r.id === 'consolidated')!
      .lines.find((l) => l.requirement === 'CSRD-S-021')!
      .cells.find((c) => c.startYear === 2027)!.step;
    // The approved step for a fact the free check does not ask (WORDING-TABLE.md, entity.is_financial_holding_undertaking, missing_fact): it asks nothing.
    expect(step).toEqual({
      words: 'The free check does not ask whether the parent company is a financial holding undertaking, so your answers cannot settle it here. Its accounts state it.',
      asks: null,
      askLabel: null,
      fact: HOLDING,
    });
    expect(stated(PARENT, undefined, 'CSRD-S-021').needs.map((n) => n.factType)).toContain(HOLDING);
  });

  it('"yes", once stated: what is then missing is the option’s own conditions, which the check does not ask (deferred)', () => {
    const d = stated(PARENT, true, 'CSRD-S-021');
    expect(d.result).toBe('INDETERMINATE');
    expect(d.needs.map((n) => n.factType)).toEqual(expect.arrayContaining(['entity.art_29a_7a_option_exercised', 'group.subsidiaries_business_models_independent']));
    // The holding status itself is known, so it is not among the needs: this is
    // what tells a stated "yes" apart from a status the checker ignored.
    expect(d.needs.map((n) => n.factType)).not.toContain(HOLDING);
  });

  it('a company with no group is untouched by the status, stated or not: it is shown no consolidated row, and nothing it is shown names the status', () => {
    expect(stated(EU_ABOVE_THRESHOLD, undefined, 'CSRD-S-021').result).toBe('DOES_NOT_APPLY');
    expect(stated(EU_ABOVE_THRESHOLD, true, 'CSRD-S-021').result).toBe('DOES_NOT_APPLY');
    const timeline = buildCheckTimeline(csrdPack(), EU_ABOVE_THRESHOLD, FIXED_DATE);
    expect(timeline.routes.map((r) => r.id)).not.toContain('consolidated');
    expect(timeline.routes.flatMap((r) => r.lines.flatMap((l) => l.cells.flatMap((c) => (c.needs ?? []).map((n) => n.factType))))).not.toContain(HOLDING);
    // Positive control: the parent's timeline does carry a consolidated row naming it.
    expect(buildCheckTimeline(csrdPack(), PARENT, FIXED_DATE).routes.map((r) => r.id)).toContain('consolidated');
  });
});
