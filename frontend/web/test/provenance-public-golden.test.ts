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
 *
 * # What this file no longer does — retired 2026-10-26 (DG-8, part 3)
 *
 * It used to assert that the current payload equals this recording exactly.
 * **That comparison is retired**, because its fixed answers can no longer be
 * posed: the free check moved to the start-year timeline (DP1 Task 6), its
 * strict answer schema refuses every key these answers use, and the module that
 * built this payload is gone. As on 2026-08-27, no adapter is added, because an
 * adapter would be the pretence that the surface did not change. What is
 * retired is the comparison; the artefact stays, bytes pinned, as the record of
 * what the surface looked like before DP1.
 *
 * The independent oracle that ran on the live payload now runs on the record
 * itself, so the record is still held to the audit, the pack's provenance and
 * the named corrections; and its live counterparts that the timeline can carry
 * (every line requirement's sources, no source identity in a locator, E-1 and
 * E-2 on the surface) moved to `checker-timeline-public-golden.test.ts`, the
 * new generation's own test.
 *
 * ```text
 * migration-public-golden       historical generation — the recorded bytes
 * provenance-public-golden      the provenance-era generation — the recorded bytes, held to its oracle
 * checker-timeline-public-golden the DP1 generation — compared forward, with the oracle moved to it
 * ```
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { csrdPack } from '@/lib/pack';
import { checkerAnswersSchema } from '@/lib/check-answers';
import {
  AUDIT_EXPECTED_SOURCES,
  AUDIT_EXPECTED_UNIVERSE,
  CORRECTED_CASE,
  E1_CORRECTED_CASE,
  E2_ADDED_CASE,
  EXPECTED_SOURCES,
  POST_AUDIT_ADDITIONS,
  POST_AUDIT_CORRECTIONS,
  POST_AUDIT_SOURCES,
} from '../../../backend/engine/test/audit-expected-provenance';

const HISTORICAL = fileURLToPath(new URL('./golden/migration-public-golden.json', import.meta.url));
const PROVENANCE = fileURLToPath(new URL('./golden/provenance-public-golden.json', import.meta.url));

/**
 * The answers and the payload as this generation recorded them. Their modules
 * were deleted with the old checker (DP1 Task 6), so the shapes are written out
 * here, as the record holds them; only the fields read below.
 */
interface RecordedAnswers {
  country: string;
  legalForm: string;
  financialYear: string;
  groupPosition: string;
  turnover: string;
  employees: string;
  reportedFy2024: string;
  governingChoice: string;
  exclusion: string;
}

interface RecordedDetermination {
  id: string;
  result: string;
  reason?: string;
  reasonCopy?: string;
  needs: unknown[];
  sources: { id: string; title: string; url: string }[];
  locators?: string[];
  provisions?: string;
}

interface RecordedPayload {
  assessedAt: string;
  financialYear: { start: string; end: string };
  containsDraftContent: boolean;
  headline: string;
  counts: { applies: number; doesNotApply: number; indeterminate: number };
  determinations: RecordedDetermination[];
  obligations: unknown[];
  nextQuestions: unknown[];
}

/** The same fixed answers the historical generation used, so the two compare. */
const FIXED_ANSWERS: RecordedAnswers = {
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

/** This generation's bytes, pinned: what "preserved" means, made checkable. */
const PROVENANCE_SHA256 = 'f0ff1dcd563ff6f2fd0d3f736d9499d2fc40d6be59c6420cbded37be9d268503';

/** The record of the surface: the oracle below reads it, as it used to read the live payload that equalled it. */
const recorded = (): RecordedPayload => JSON.parse(readFileSync(PROVENANCE, 'utf8')) as RecordedPayload;

function determinationsOf(path: string): RecordedDetermination[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as { determinations: RecordedDetermination[] })
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

describe('provenance-era public golden — the generation, preserved', () => {
  it('is byte-identical to the generation it recorded', () => {
    // Any edit — a reformat, a regeneration, a helpful update — reddens here and names itself.
    const digest = createHash('sha256').update(readFileSync(PROVENANCE)).digest('hex');
    expect(digest).toBe(PROVENANCE_SHA256);
  });

  it('can no longer be posed to the revised checker, which is why its forward comparison is retired (DG-8, part 3)', () => {
    const refused = checkerAnswersSchema.safeParse(FIXED_ANSWERS);
    expect(refused.success).toBe(false);
    // The questions changed, not only the values: six of its keys are ones the strict schema does not know,
    // and its two figures are bands the check no longer has.
    const issues = refused.success ? [] : refused.error.issues;
    const unknownKeys = issues.flatMap((issue) => (issue.code === 'unrecognized_keys' ? issue.keys : []));
    expect(unknownKeys.sort()).toEqual(['exclusion', 'financialYear', 'governingChoice', 'groupPosition', 'legalForm', 'reportedFy2024']);
    expect(issues.map((issue) => issue.path.join('.')).filter((path) => path !== '').sort()).toEqual(['employees', 'turnover']);
    // Positive control: the schema takes the answers the revised checker asks.
    expect(checkerAnswersSchema.safeParse({ country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'no' }).success).toBe(true);
  });

  it('captures a substantial payload, so agreement means something', () => {
    const record = recorded();
    expect(record.determinations.length).toBeGreaterThanOrEqual(1);
    expect(record.obligations.length).toBeGreaterThanOrEqual(1);
    expect(record.nextQuestions.length).toBeGreaterThanOrEqual(1);
    expect(record.containsDraftContent).toBe(true);
    expect(record.headline.length).toBeGreaterThan(0);
    expect(record.determinations.some((d) => d.reasonCopy !== undefined)).toBe(true);
    expect(record.determinations.some((d) => d.sources.length > 0)).toBe(true);
    expect(record.counts.applies).toBeGreaterThanOrEqual(1);
  });

  it('is a capture of fixed inputs, not of the day it ran', () => {
    const record = recorded();
    expect(record.assessedAt).toBe(FIXED_DATE);
    expect(record.assessedAt).not.toBe(new Date().toISOString().slice(0, 10));
    expect(record.financialYear).toEqual({ start: '2027-01-01', end: '2027-12-31' });
  });
});

// ---------------------------------------------------------------------------
// Layer 2b — the independent oracle
// ---------------------------------------------------------------------------

describe('what a customer was shown, checked against the audit and the pack', () => {
  it('every determination cites exactly the instruments the audit determined', () => {
    // The expected values come from the committed audit, not from either
    // golden and not from the pack. This is what a comparison between two
    // generated artefacts cannot do.
    const live = recorded();
    expect(live.determinations.length).toBeGreaterThan(0);
    for (const determination of live.determinations) {
      // The audit for the sixteen, as corrected since (E-1 for S-007); the C/G
      // design (2026-10-20) for the seven after it; E-2 for S-024.
      expect(
        determination.sources.map((source) => source.id),
        determination.id,
      ).toEqual([...EXPECTED_SOURCES[determination.id]!]);
    }
  });

  it('every determination shows exactly the migrated requirement’s locators', () => {
    const pack = csrdPack();
    const live = recorded();
    for (const determination of live.determinations) {
      const requirement = pack.requirements.find((r) => r.id === determination.id)!;
      expect(determination.locators, determination.id).toEqual(
        expectedLocators(requirement as never),
      );
    }
  });

  it('shows a customer no source identity in place of an address', () => {
    const live = recorded();
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
    const live = recorded();
    const corrected = live.determinations.find((d) => d.id === CORRECTED_CASE.requirementId);
    expect(corrected, `${CORRECTED_CASE.requirementId} is in the fixed payload`).toBeDefined();
    expect(corrected!.sources.map((s) => s.id)).toEqual([...CORRECTED_CASE.sources]);
    expect(corrected!.locators).toContain(CORRECTED_CASE.locator);

    // The customer is shown the host directive, with its own title — the point
    // of the correction, not merely a different identifier.
    expect(corrected!.sources[0]!.title).toContain('2022/2464');
    expect(readFileSync(PROVENANCE, 'utf8')).not.toContain(CORRECTED_CASE.absentSource);
  });

  it('E-1’s correction reaches the customer surface, named on its own', () => {
    // QD-4 E-1 (DG-6, 2026-10-23): the Article 40a group gate starts with
    // financial years beginning on or after 1 January 2028 (CSRD Art 5(2),
    // second subparagraph). The fixed answers are FY2027, so the gate is a
    // definitive no, and the customer is shown the CSRD beside Article 40a.
    const live = recorded();
    const corrected = live.determinations.find((d) => d.id === E1_CORRECTED_CASE.requirementId);
    expect(corrected, `${E1_CORRECTED_CASE.requirementId} is in the fixed payload`).toBeDefined();
    expect(corrected!.result).toBe('DOES_NOT_APPLY');
    expect(corrected!.reason).toBeUndefined();
    expect(corrected!.needs).toEqual([]);
    expect(corrected!.sources.map((s) => s.id)).toEqual([...E1_CORRECTED_CASE.sources]);
    expect(corrected!.sources[1]!.title).toContain('2022/2464');
    expect(corrected!.locators).toContain(E1_CORRECTED_CASE.locator);
    // The audit's own entry is not rewritten by the correction.
    expect(AUDIT_EXPECTED_SOURCES[E1_CORRECTED_CASE.requirementId]).toEqual([...E1_CORRECTED_CASE.auditSources]);
  });

  it('E-2’s addition reaches the customer surface, named on its own', () => {
    // QD-4 E-2 (DG-7, option A, 2026-10-23): the third-country issuer route
    // (CSRD Art 2 and Art 5(2), third subparagraph) is not encoded. The fixed
    // answers are a DE company, so the gate is closed — a definitive no, as for
    // every EU issuer, whose duty runs through S-001, S-002, S-017 and S-018 —
    // and the customer is shown the CSRD with both provisions.
    const live = recorded();
    const added = live.determinations.find((d) => d.id === E2_ADDED_CASE.requirementId);
    expect(added, `${E2_ADDED_CASE.requirementId} is in the fixed payload`).toBeDefined();
    expect(added!.result).toBe('DOES_NOT_APPLY');
    expect(added!.reason).toBeUndefined();
    expect(added!.needs).toEqual([]);
    expect(added!.sources.map((s) => s.id)).toEqual([...E2_ADDED_CASE.sources]);
    expect(added!.sources[0]!.title).toContain('2022/2464');
    expect(added!.locators).toEqual([...E2_ADDED_CASE.locators]);
    // An addition, not a correction: the audit holds no entry for it.
    expect(AUDIT_EXPECTED_SOURCES[E2_ADDED_CASE.requirementId]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — the transition, as corroboration
// ---------------------------------------------------------------------------

describe('the transition from the historical public generation to this one', () => {
  it('leaves every field outside the determinations identical, except the counts the seven C/G determinations add, the one result E-1 settles and the one determination E-2 adds', () => {
    const outside = (path: string) => {
      const { determinations: _dropped, counts, ...rest } = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> & {
        counts: RecordedPayload['counts'];
      };
      return { rest: JSON.stringify(rest, null, 2), counts };
    };
    // Headline, obligations, next questions, dates — the whole of the surface
    // that was *not* meant to move. The counts did move on 2026-10-20, by
    // exactly the seven determinations the C/G composition adds for the fixed
    // standalone profile: CSRD-S-017 and CSRD-S-020 apply; CSRD-S-018, S-019,
    // S-021, S-022 and S-023 do not; nothing new is unresolved.
    //
    // On 2026-10-23 E-1 (QD-4, DG-6) settled one more: CSRD-S-007, the Article
    // 40a group gate, moves from unresolved to does-not-apply for this FY2027
    // profile, because the route applies only from financial years starting on
    // or after 1 January 2028 (CSRD Art 5(2), second subparagraph). The
    // headline's unresolved count falls by exactly that one, and nothing else
    // outside the determinations moves.
    //
    // On 2026-10-23 E-2 (QD-4, DG-7) added CSRD-S-024, the third-country issuer
    // route. The fixed answers are a DE company, so it does not apply: one more
    // does-not-apply, and nothing unresolved, so the headline does not move.
    const E1_UNRESOLVED_BEFORE = '2 determination(s) unresolved';
    const E1_UNRESOLVED_AFTER = '1 determination(s) unresolved';
    const before = outside(HISTORICAL);
    const after = outside(PROVENANCE);
    expect(before.rest).toContain(E1_UNRESOLVED_BEFORE);
    expect(after.rest).toBe(before.rest.replace(E1_UNRESOLVED_BEFORE, E1_UNRESOLVED_AFTER));
    expect(after.counts).toEqual({
      applies: before.counts.applies + 2,
      doesNotApply: before.counts.doesNotApply + 5 + 1 + 1,
      indeterminate: before.counts.indeterminate - 1,
    });
  });

  it('keeps the sixteen historical determinations in order as a prefix; the seven of the C/G composition follow, then E-2’s addition, in id order', () => {
    const ids = determinationsOf(PROVENANCE).map((d) => d.id);
    const historical = determinationsOf(HISTORICAL).map((d) => d.id);
    expect(ids.slice(0, historical.length)).toEqual(historical);
    // E-2 (QD-4, DG-7, 2026-10-23) appended CSRD-S-024 after the seven.
    expect(ids.slice(historical.length)).toEqual([...Object.keys(POST_AUDIT_SOURCES), ...Object.keys(POST_AUDIT_ADDITIONS)]);
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

  it('changes cited instruments only where the audited migration, or an approved correction since, says it may', () => {
    const before = new Map(determinationsOf(HISTORICAL).map((d) => [d.id, d.sources.map((s) => s.id)]));
    const moved: string[] = [];
    for (const determination of determinationsOf(PROVENANCE)) {
      const now = determination.sources.map((s) => s.id);
      if (!before.has(determination.id)) {
        // Authored after the audit: the design's sources (or, for E-2's
        // CSRD-S-024, its own change's), and nothing moved.
        const authored = POST_AUDIT_SOURCES[determination.id] ?? POST_AUDIT_ADDITIONS[determination.id];
        expect(now, determination.id).toEqual([...authored!]);
        continue;
      }
      // The audit's value, unless an approved correction has moved it since.
      const expected = POST_AUDIT_CORRECTIONS[determination.id] ?? AUDIT_EXPECTED_SOURCES[determination.id]!;
      expect(now, determination.id).toEqual([...expected]);
      if (JSON.stringify(before.get(determination.id)) !== JSON.stringify(now)) {
        moved.push(determination.id);
      }
    }
    expect(moved.length).toBeGreaterThan(0);
    // E-1 is the one correction, named on its own: this generation cites what
    // E-1 set, which is not what the audit decided.
    expect(Object.keys(POST_AUDIT_CORRECTIONS)).toEqual([E1_CORRECTED_CASE.requirementId]);
    expect([...E1_CORRECTED_CASE.sources]).not.toEqual(AUDIT_EXPECTED_SOURCES[E1_CORRECTED_CASE.requirementId]);
    expect(moved).toContain(E1_CORRECTED_CASE.requirementId);
  });

  it('preserves the historical artifact’s bytes while doing so', () => {
    const digest = createHash('sha256').update(readFileSync(HISTORICAL)).digest('hex');
    expect(digest).toBe('7bcdb2416085bf4f4c44e4aa2a4c04e776544ddc1c1ec26366f2e122a6ced8ae');
  });
});
