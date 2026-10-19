/**
 * The customer-visible provenance-era generation, and its oracle.
 *
 * `migration-public-golden.test.ts` keeps the historical generation — the
 * payload as customers saw it before the D1(a) audit — with its bytes pinned.
 * Its forward comparison was retired on 2026-08-27: the audit changed which
 * instrument each determination cites, and the provenance migration replaced
 * `provisions` with `locators`. Both are on the surface a customer reads, and
 * both were meant to move.
 *
 * The layers here mirror the engine's, and are different kinds of evidence:
 *
 * ```text
 * current payload == provenance golden      regression / generation evidence
 * payload sources == audit expected         semantic migration evidence
 * payload locators == provenance projection projection evidence
 * old <-> new structural delta              transition / corroborating evidence
 * ```
 *
 * The audit table is imported from the engine's test tree rather than copied,
 * for the reason that module states: two hand-copies of an oracle drift, and
 * the drift is invisible until they disagree. Reaching across the workspace is
 * how `fixture-repository.ts` already reads the engine's signing code.
 *
 * This test never writes. Both artefacts were produced once, by an explicit
 * reviewed change.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCheckResponse, type CheckResponse } from '@/lib/checkResponse';
import { csrdPack } from '@/lib/pack';
import type { CheckerAnswers } from '@/lib/checker';
import {
  AUDIT_EXPECTED_SOURCES,
  AUDIT_EXPECTED_UNIVERSE,
  CORRECTED_CASE,
  EXPECTED_SOURCES,
  POST_AUDIT_SOURCES,
} from '../../../backend/engine/test/audit-expected-provenance';

const HISTORICAL = fileURLToPath(new URL('./golden/migration-public-golden.json', import.meta.url));
const PROVENANCE = fileURLToPath(new URL('./golden/provenance-public-golden.json', import.meta.url));

/** The same fixed answers the historical generation used, so the two compare. */
const FIXED_ANSWERS: CheckerAnswers = {
  country: 'DE',
  legalForm: 'private_limited_company',
  financialYear: '2027',
  groupPosition: 'standalone',
  turnover: 'gt600',
  employees: 'gt1500',
  reportedFy2024: 'no',
  governingChoice: 'same',
  // Q-039: not excluded by Article 1(4), stated — an in-scope undertaking is the scenario.
  exclusion: 'no',
};
const FIXED_DATE = '2026-07-26';

const payload = () => buildCheckResponse(csrdPack(), FIXED_ANSWERS, FIXED_DATE);
const serialise = (value: CheckResponse) => `${JSON.stringify(value, null, 2)}\n`;

type PublicDetermination = {
  id: string;
  sources: { id: string; title: string; url: string }[];
  locators?: string[];
  provisions?: string;
};

function determinationsOf(path: string): PublicDetermination[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as { determinations: PublicDetermination[] })
    .determinations;
}

/**
 * The locator projection, written out here rather than imported.
 *
 * `whole_document` renders as the phrase below. Spelling the mapping out makes
 * this an independent reconstruction of what the payload should carry; calling
 * the same helper the payload was built with would only prove the helper is
 * deterministic.
 */
const WHOLE_DOCUMENT = 'the instrument as a whole';
function expectedLocators(requirement: {
  provenance: { locators: ({ kind: 'provision'; text: string } | { kind: 'whole_document' })[] }[];
}): string[] {
  return requirement.provenance.flatMap((entry) =>
    entry.locators.map((locator) => (locator.kind === 'whole_document' ? WHOLE_DOCUMENT : locator.text)),
  );
}

// ---------------------------------------------------------------------------
// Layer 2a — the generation itself
// ---------------------------------------------------------------------------

describe('provenance-era public golden — the current generation', () => {
  it('matches the recorded artifact exactly, byte for byte', () => {
    const recorded = readFileSync(PROVENANCE, 'utf8');
    const actual = serialise(payload());
    expect(JSON.parse(actual)).toEqual(JSON.parse(recorded));
    // Bytes, not just structure: key order is part of what the route hands back.
    expect(actual).toBe(recorded);
  });

  it('captures a substantial payload, so agreement means something', () => {
    const recorded = JSON.parse(readFileSync(PROVENANCE, 'utf8')) as CheckResponse;
    expect(recorded.determinations.length).toBeGreaterThanOrEqual(1);
    expect(recorded.obligations.length).toBeGreaterThanOrEqual(1);
    expect(recorded.nextQuestions.length).toBeGreaterThanOrEqual(1);
    expect(recorded.containsDraftContent).toBe(true);
    expect(recorded.headline.length).toBeGreaterThan(0);
    expect(recorded.determinations.some((d) => d.reasonCopy !== undefined)).toBe(true);
    expect(recorded.determinations.some((d) => d.sources.length > 0)).toBe(true);
    expect(recorded.counts.applies).toBeGreaterThanOrEqual(1);
  });

  it('is a capture of fixed inputs, not of the day it ran', () => {
    const recorded = JSON.parse(readFileSync(PROVENANCE, 'utf8')) as CheckResponse;
    expect(recorded.assessedAt).toBe(FIXED_DATE);
    expect(recorded.assessedAt).not.toBe(new Date().toISOString().slice(0, 10));
    expect(recorded.financialYear).toEqual({ start: '2027-01-01', end: '2027-12-31' });
  });
});

// ---------------------------------------------------------------------------
// Layer 2b — the independent oracle
// ---------------------------------------------------------------------------

describe('what a customer is shown, checked against the audit and the pack', () => {
  it('every determination cites exactly the instruments the audit determined', () => {
    // The expected values come from the committed audit, not from either
    // golden and not from the pack. This is what a comparison between two
    // generated artefacts cannot do.
    const live = payload();
    expect(live.determinations.length).toBeGreaterThan(0);
    for (const determination of live.determinations) {
      // The audit for the sixteen; the C/G design (2026-10-20) for the seven after it.
      expect(
        determination.sources.map((source) => source.id),
        determination.id,
      ).toEqual([...EXPECTED_SOURCES[determination.id]!]);
    }
  });

  it('every determination shows exactly the migrated requirement’s locators', () => {
    const pack = csrdPack();
    const live = payload();
    for (const determination of live.determinations) {
      const requirement = pack.requirements.find((r) => r.id === determination.id)!;
      expect(determination.locators, determination.id).toEqual(
        expectedLocators(requirement as never),
      );
    }
  });

  it('shows a customer no source identity in place of an address', () => {
    const live = payload();
    const everyLocator = live.determinations.flatMap((d) => d.locators ?? []);
    expect(everyLocator.length).toBeGreaterThan(0);
    for (const locator of everyLocator) {
      expect(locator, locator).not.toMatch(/SRC-\d{3}/);
    }
    for (const sourceId of AUDIT_EXPECTED_UNIVERSE) {
      expect(everyLocator.some((l) => l.includes(sourceId))).toBe(false);
    }
  });

  it('the corrected case reaches the customer surface, named on its own', () => {
    const live = payload();
    const corrected = live.determinations.find((d) => d.id === CORRECTED_CASE.requirementId);
    expect(corrected, `${CORRECTED_CASE.requirementId} is in the fixed payload`).toBeDefined();
    expect(corrected!.sources.map((s) => s.id)).toEqual([...CORRECTED_CASE.sources]);
    expect(corrected!.locators).toContain(CORRECTED_CASE.locator);

    // The customer is shown the host directive, with its own title — the point
    // of the correction, not merely a different identifier.
    expect(corrected!.sources[0]!.title).toContain('2022/2464');
    expect(readFileSync(PROVENANCE, 'utf8')).not.toContain(CORRECTED_CASE.absentSource);
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — the transition, as corroboration
// ---------------------------------------------------------------------------

describe('the transition from the historical public generation to this one', () => {
  it('leaves every field outside the determinations identical, except the counts the seven C/G determinations add', () => {
    const outside = (path: string) => {
      const { determinations: _dropped, counts, ...rest } = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> & {
        counts: CheckResponse['counts'];
      };
      return { rest: JSON.stringify(rest, null, 2), counts };
    };
    // Headline, obligations, next questions, dates — the whole of the surface
    // that was *not* meant to move. The counts did move on 2026-10-20, by
    // exactly the seven determinations the C/G composition adds for the fixed
    // standalone profile: CSRD-S-017 and CSRD-S-020 apply; CSRD-S-018, S-019,
    // S-021, S-022 and S-023 do not; nothing new is unresolved.
    const before = outside(HISTORICAL);
    const after = outside(PROVENANCE);
    expect(after.rest).toBe(before.rest);
    expect(after.counts).toEqual({
      applies: before.counts.applies + 2,
      doesNotApply: before.counts.doesNotApply + 5,
      indeterminate: before.counts.indeterminate,
    });
  });

  it('keeps the sixteen historical determinations in order as a prefix; the seven of the C/G composition follow, in id order', () => {
    const ids = determinationsOf(PROVENANCE).map((d) => d.id);
    const historical = determinationsOf(HISTORICAL).map((d) => d.id);
    expect(ids.slice(0, historical.length)).toEqual(historical);
    expect(ids.slice(historical.length)).toEqual(Object.keys(POST_AUDIT_SOURCES));
  });

  it('replaces provisions with locators, everywhere and only there', () => {
    for (const determination of determinationsOf(PROVENANCE)) {
      expect(determination, determination.id).not.toHaveProperty('provisions');
      expect(Array.isArray(determination.locators), determination.id).toBe(true);
    }
    // Not vacuous: the old generation genuinely carried the old field. It was
    // authored on three requirements only, which is why this is `some`.
    expect(determinationsOf(HISTORICAL).some((d) => 'provisions' in d)).toBe(true);
    expect(determinationsOf(HISTORICAL).every((d) => !('locators' in d))).toBe(true);
  });

  it('changes cited instruments only where the audited migration says it may', () => {
    const before = new Map(determinationsOf(HISTORICAL).map((d) => [d.id, d.sources.map((s) => s.id)]));
    const moved: string[] = [];
    for (const determination of determinationsOf(PROVENANCE)) {
      const now = determination.sources.map((s) => s.id);
      if (!before.has(determination.id)) {
        // Authored after the audit: the design's sources, and nothing moved.
        expect(now, determination.id).toEqual([...POST_AUDIT_SOURCES[determination.id]!]);
        continue;
      }
      expect(now, determination.id).toEqual([...AUDIT_EXPECTED_SOURCES[determination.id]!]);
      if (JSON.stringify(before.get(determination.id)) !== JSON.stringify(now)) {
        moved.push(determination.id);
      }
    }
    expect(moved.length).toBeGreaterThan(0);
  });

  it('preserves the historical artifact’s bytes while doing so', () => {
    const digest = createHash('sha256').update(readFileSync(HISTORICAL)).digest('hex');
    expect(digest).toBe('7bcdb2416085bf4f4c44e4aa2a4c04e776544ddc1c1ec26366f2e122a6ced8ae');
  });
});
