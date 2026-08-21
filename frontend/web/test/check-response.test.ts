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
