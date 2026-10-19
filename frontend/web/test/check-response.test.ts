/**
 * The check payload must be a function of its inputs alone.
 *
 * Spec §7.1 requires a public rendered golden over the customer-visible checker
 * result, and a golden can only fence a payload that does not move on its own.
 * The route used to read the clock, so the same answers produced a different
 * payload tomorrow; these tests hold the line that the date is an argument and
 * that nothing else in the builder consults the machine it runs on.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCheckResponse } from '@/lib/checkResponse';
import { csrdPack } from '@/lib/pack';
import type { CheckerAnswers } from '@/lib/checker';

/** A German entity over both thresholds — the widest slice the check can reach. */
const EU_ABOVE_THRESHOLD: CheckerAnswers = {
  country: 'DE',
  legalForm: 'private_limited_company',
  financialYear: '2027',
  groupPosition: 'standalone',
  turnover: 'gt600',
  employees: 'gt1500',
  reportedFy2024: 'no',
  governingChoice: 'same',
  // Q-039: an ordinary undertaking, not excluded by Article 1(4). Stated, not defaulted.
  exclusion: 'no',
};

/** Deliberately in the past, so it can never coincide with the machine's clock. */
const FIXED_DATE = '2026-07-26';

const today = () => new Date().toISOString().slice(0, 10);

describe('buildCheckResponse', () => {
  it('returns deeply equal payloads for identical arguments', () => {
    const pack = csrdPack();
    const first = buildCheckResponse(pack, EU_ABOVE_THRESHOLD, FIXED_DATE);
    const second = buildCheckResponse(pack, EU_ABOVE_THRESHOLD, FIXED_DATE);
    expect(first).toEqual(second);
  });

  it('echoes the assessment date it was given, not the date it ran on', () => {
    // Guards the guard: a fixed date equal to today would assert nothing.
    expect(FIXED_DATE).not.toBe(today());
    const response = buildCheckResponse(csrdPack(), EU_ABOVE_THRESHOLD, FIXED_DATE);
    expect(response.assessedAt).toBe(FIXED_DATE);
    expect(response.assessedAt).not.toBe(today());
  });

  it('reports draft content for an EU entity above both thresholds', () => {
    const response = buildCheckResponse(csrdPack(), EU_ABOVE_THRESHOLD, FIXED_DATE);
    expect(response.containsDraftContent).toBe(true);
  });

  it('reads no clock anywhere in its own source', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../lib/checkResponse.ts', import.meta.url)),
      'utf8',
    );
    const offenders = source
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /new Date|Date\.now|performance\.now/.test(line))
      .map(([n, line]) => `${n}:${line}`);
    expect(offenders).toEqual([]);
  });
});

/**
 * The Article 1(4) exclusion question (Q-039), through the public path.
 *
 * "Yes" takes the entity out of Article 19a definitively and "no" leaves it
 * in; an absent or "I'm not sure" answer contributes no fact at all, so the
 * engine reports the size test as unresolved with `missing_fact`. The copy a
 * visitor reads then says a fact is missing and names the question — never
 * that the law is ambiguous, because it is the answer that is missing.
 */
describe('the Article 1(4) exclusion answer', () => {
  const s001 = (answers: CheckerAnswers) => {
    const found = buildCheckResponse(csrdPack(), answers, FIXED_DATE).determinations.find((d) => d.id === 'CSRD-S-001');
    if (found === undefined) throw new Error('no CSRD-S-001 determination in the payload');
    return found;
  };
  /** The in-scope answers with the exclusion answer removed, so each case states its own. */
  const { exclusion: _stated, ...withoutExclusion } = EU_ABOVE_THRESHOLD;

  it('"no" with an in-scope EU profile: the individual size test applies', () => {
    const d = s001({ ...withoutExclusion, exclusion: 'no' });
    expect(d.result).toBe('APPLIES');
    expect(d.reason).toBeUndefined();
    expect(d.needs).toEqual([]);
  });

  it('"yes": the entity is definitively outside Article 19a, with no reason code and nothing to resolve', () => {
    const d = s001({ ...withoutExclusion, exclusion: 'yes' });
    expect(d.result).toBe('DOES_NOT_APPLY');
    expect(d.reason).toBeUndefined();
    expect(d.needs).toEqual([]);
    expect(d.locators).toContain('Article 1(4)');
  });

  it.each([
    ['absent', withoutExclusion],
    ['"I\'m not sure"', { ...withoutExclusion, exclusion: 'unknown' as const }],
  ])('%s: the size test stays unresolved, naming the missing answer and not calling the law ambiguous', (_label, answers) => {
    const d = s001(answers);
    expect(d.result).toBe('INDETERMINATE');
    expect(d.reason).toBe('missing_fact');
    expect(d.reasonCopy).toBe('A fact we need is missing');
    expect(d.reasonCopy).not.toBe('The law is ambiguous here');
    expect(d.needs.map((n) => n.factType)).toEqual(['entity.excluded_by_article_1_4']);
    // The customer-facing label says the answer is what is missing.
    expect(d.needs[0]?.label).toBe('Whether Article 1(4) excludes the entity (answer needed)');
  });
});
