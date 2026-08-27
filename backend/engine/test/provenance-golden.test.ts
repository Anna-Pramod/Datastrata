/**
 * The provenance-era generation, and the oracle that says what belongs in it.
 *
 * `migration-golden.test.ts` holds the *historical* generation: the artefact
 * recorded before the asserted-ratification migration, its bytes pinned and its
 * adapter's contract still asserted. Its forward comparison — adapt the
 * recording, expect current output to equal it — was retired on 2026-08-27,
 * because the D1(a) provenance migration replaced authored `sources` and
 * `provisions` with authored `provenance`, projected to `sources` and
 * `locators`, and no honest adapter maps a schema transition it predates.
 *
 * This file is the generation that replaces it, in three layers that are
 * deliberately *not* the same kind of evidence:
 *
 * ```text
 * current output == provenance golden      regression / generation evidence
 * output sources == audit expected         semantic migration evidence
 * output locators == provenance projection projection evidence
 * old <-> new structural delta             transition / corroborating evidence
 * ```
 *
 * **The ordering matters.** A golden proves only that today's output equals
 * what was recorded on the day it was recorded; it cannot say the recording was
 * right. So the values in it are checked against sources that existed before
 * it did: the audit's own table for `sources`, and the authored `provenance` in
 * `requirements.json` for `locators`. The transition delta corroborates, and is
 * explicitly *not* the oracle — a whitelist saying "only these three fields
 * moved" would accept any wrong value inside those three fields.
 *
 * Neither golden is ever written by a test. Both were produced once, by an
 * explicit reviewed change, and a red here is a report that behaviour moved.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assess } from '../src/engine/evaluate';
import { canonicalJson } from '../src/verification/canonical';
import { sourceIdsOf } from '../src/knowledge/provenance';
import type { AssessmentResult } from '../src/types';
import { ProfileBuilder, csrdPack, ctx } from './helpers';
import {
  AUDIT_EXPECTED_SOURCES,
  AUDIT_EXPECTED_UNIVERSE,
  CORRECTED_CASE,
} from './audit-expected-provenance';

const here = dirname(fileURLToPath(import.meta.url));
const HISTORICAL = join(here, 'golden', 'migration-engine-golden.json');
const PROVENANCE = join(here, 'golden', 'provenance-engine-golden.json');

const FY_START = '2027-01-01';
const FY_END = '2027-12-31';
const SUBJECT = 'e1';

/** The same fixed profile the historical generation used, so the two compare. */
function fixedProfile() {
  return new ProfileBuilder()
    .euEntity('e1', 'Alpine Industrie SAS', 'FR')
    .num('e1', 'entity.net_turnover_eur', 520_000_000)
    .num('e1', 'entity.avg_employees', 1350)
    .str('e1', 'entity.governing_member_state', 'FR')
    .bool('e1', 'readiness.management_report_section_ready', false)
    .bool('e1', 'readiness.digital_format_ready', true)
    .bool('e1', 'readiness.publication_calendar_ready', false)
    .build();
}

function fixedResult(): AssessmentResult {
  return assess(csrdPack(), fixedProfile(), ctx(FY_START, FY_END, SUBJECT));
}

function canonicalPretty(value: unknown): string {
  const canonical = canonicalJson(value);
  const pretty = JSON.stringify(JSON.parse(canonical), null, 2);
  if (JSON.stringify(JSON.parse(pretty)) !== canonical) {
    throw new Error('Indenting is not a pure reformatting of canonicalJson output');
  }
  return `${pretty}\n`;
}

/**
 * The locator projection, spelled out independently of the production helper.
 *
 * `whole_document` renders as the phrase below. Writing the mapping here is what
 * makes this an oracle rather than a restatement: `locatorTextsOf` is the code
 * under test, and an expected value computed by it would agree with any change
 * to it.
 */
const WHOLE_DOCUMENT = 'the instrument as a whole';
function expectedLocators(requirement: { provenance: readonly { locators: readonly ({ kind: 'provision'; text: string } | { kind: 'whole_document' })[] }[] }): string[] {
  return requirement.provenance.flatMap((entry) =>
    entry.locators.map((locator) => (locator.kind === 'whole_document' ? WHOLE_DOCUMENT : locator.text)),
  );
}

type Determination = {
  requirementId: string;
  sources: string[];
  locators?: string[];
  provisions?: string;
};

function determinationsOf(path: string): Determination[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as { determinations: Determination[] }).determinations;
}

// ---------------------------------------------------------------------------
// Layer 2a — the generation itself
// ---------------------------------------------------------------------------

describe('provenance-era engine golden — the current generation', () => {
  it('matches the recorded artifact exactly, with no adapter in the path', () => {
    // No adapter, deliberately. The historical golden needed one because the
    // ratification migration changed a field's name; this generation was
    // recorded *after* the provenance migration, so anything it needs
    // normalising away would be a behaviour change to investigate.
    const recorded = readFileSync(PROVENANCE, 'utf8');
    const actual = canonicalPretty(fixedResult());
    expect(JSON.parse(actual)).toEqual(JSON.parse(recorded));
    expect(actual).toBe(recorded);
  });

  it('captures a substantial result, so agreement means something', () => {
    // Carried over from the historical generation: a golden over a thin result
    // agrees with almost any implementation.
    const recorded = JSON.parse(readFileSync(PROVENANCE, 'utf8')) as AssessmentResult;
    expect(recorded.determinations.length).toBeGreaterThanOrEqual(1);
    expect(recorded.obligations.length).toBeGreaterThanOrEqual(1);
    expect(recorded.nextQuestions.length).toBeGreaterThanOrEqual(1);
    expect(recorded.gaps.length).toBeGreaterThanOrEqual(1);
    expect(recorded.containsDraftContent).toBe(true);
    expect(new Set(recorded.determinations.map((d) => d.result))).toEqual(
      new Set(['APPLIES', 'DOES_NOT_APPLY', 'INDETERMINATE']),
    );
  });

  it('is a capture of fixed inputs, not of the day it ran', () => {
    const recorded = JSON.parse(readFileSync(PROVENANCE, 'utf8')) as AssessmentResult;
    expect(recorded.context.assessmentDate).toBe('2026-07-26');
    expect(recorded.context.financialYear).toEqual({ start: FY_START, end: FY_END });
    expect(recorded.context.subjectId).toBe(SUBJECT);
  });
});

// ---------------------------------------------------------------------------
// Layer 2b — the independent oracle
// ---------------------------------------------------------------------------

describe('what the generation contains, checked against the audit and the pack', () => {
  it('every determination cites exactly what the audit determined', () => {
    // **The oracle, and the reason this file is not circular.** The expected
    // values come from the committed audit, transcribed by hand in
    // `audit-expected-provenance.ts`. They are not read from either golden and
    // not derived from `requirements.json`, so this fails if the migration
    // authored something the audit did not decide — which no comparison
    // between two generated artefacts could ever detect.
    const live = fixedResult();
    expect(live.determinations.length).toBeGreaterThan(0);
    for (const determination of live.determinations) {
      expect(determination.sources, determination.requirementId).toEqual([
        ...AUDIT_EXPECTED_SOURCES[determination.requirementId]!,
      ]);
    }
  });

  it('every determination projects exactly the migrated requirement’s locators', () => {
    // Projection evidence: output locators against the *authored* provenance in
    // the pack, requirement by requirement.
    //
    // **Reconstructed here rather than read from `locatorTextsOf`.** Calling the
    // production helper would put the same function on both sides of the
    // comparison, so a change to it would move the expected value in step with
    // the actual one and the assertion could never fail — the standard's first
    // failure mode, a check that reproduces the mechanism it checks. Observed:
    // with `locatorTextsOf` on both sides, a mutation prefixing every locator
    // with its `sourceId` left this test green.
    const pack = csrdPack();
    const live = fixedResult();
    for (const determination of live.determinations) {
      const requirement = pack.requirements.find((r) => r.id === determination.requirementId)!;
      expect(determination.locators, determination.requirementId).toEqual(
        expectedLocators(requirement),
      );
      // …and the same requirement's derived sources agree with the audit too,
      // so a determination assembled from some other requirement's provenance
      // cannot pass the pair.
      expect(sourceIdsOf(requirement), determination.requirementId).toEqual([
        ...AUDIT_EXPECTED_SOURCES[determination.requirementId]!,
      ]);
    }
  });

  it('no source identity leaks into a locator', () => {
    // The blind reader is shown locators. A `sourceId` reaching that field
    // would hand it the pack author's answer instead of an address, which is
    // the property `locatorTextsOf` exists to hold.
    const live = fixedResult();
    const everyLocator = live.determinations.flatMap((d) => d.locators ?? []);
    expect(everyLocator.length).toBeGreaterThan(0);
    for (const locator of everyLocator) {
      expect(locator, locator).not.toMatch(/SRC-\d{3}/);
    }
    // Asserted against the real universe as well as the pattern, so a source
    // named some other way would still be caught.
    for (const sourceId of AUDIT_EXPECTED_UNIVERSE) {
      expect(everyLocator.some((l) => l.includes(sourceId))).toBe(false);
    }
  });

  it('the corrected case is visible in the output, named on its own', () => {
    // The 2026-08-27 correction, asserted explicitly rather than left to the
    // loop above. An aggregate check is one an aggregate change can hide.
    const live = fixedResult();
    const corrected = live.determinations.find(
      (d) => d.requirementId === CORRECTED_CASE.requirementId,
    );
    expect(corrected, `${CORRECTED_CASE.requirementId} is in the fixed profile`).toBeDefined();
    expect(corrected!.sources).toEqual([...CORRECTED_CASE.sources]);
    expect(corrected!.locators).toContain(CORRECTED_CASE.locator);
    expect(corrected!.sources).not.toContain(CORRECTED_CASE.absentSource);

    // And nowhere else in the artefact either: the correction removed the last
    // citation of SRC-004, so the whole generation should be free of it.
    expect(readFileSync(PROVENANCE, 'utf8')).not.toContain(CORRECTED_CASE.absentSource);
  });
});

// ---------------------------------------------------------------------------
// Layer 3 — the transition, as corroboration
// ---------------------------------------------------------------------------

describe('the transition from the historical generation to this one', () => {
  /**
   * Corroborating evidence, explicitly not the oracle.
   *
   * What this can show is that the migration moved what it said it would move
   * and left everything else alone. What it cannot show is that the new values
   * are *right* — a delta confined to three fields would accept any wrong value
   * inside those three fields. That question is answered one section up,
   * against the audit.
   */
  const historicalDeterminations = () => determinationsOf(HISTORICAL);
  const provenanceDeterminations = () => determinationsOf(PROVENANCE);

  it('leaves every field outside the determinations identical', () => {
    const strip = (path: string) => {
      const { determinations: _dropped, ...rest } = JSON.parse(readFileSync(path, 'utf8')) as Record<
        string,
        unknown
      >;
      return canonicalPretty(rest);
    };
    expect(strip(PROVENANCE)).toBe(strip(HISTORICAL));
  });

  it('keeps determination order and requirement identity unchanged', () => {
    // Order is meaning here — it is the order determinations are decided in —
    // so this is a sequence comparison, not a set comparison.
    expect(provenanceDeterminations().map((d) => d.requirementId)).toEqual(
      historicalDeterminations().map((d) => d.requirementId),
    );
  });

  it('replaces provisions with locators, everywhere and only there', () => {
    // Both directions: the old field is gone from every determination, and the
    // new one is present on every determination. Asserting only the first would
    // pass against a migration that dropped provenance altogether.
    for (const determination of provenanceDeterminations()) {
      expect(determination, determination.requirementId).not.toHaveProperty('provisions');
      expect(Array.isArray(determination.locators), determination.requirementId).toBe(true);
      expect(determination.locators!.length, determination.requirementId).toBeGreaterThan(0);
    }
    // The old generation genuinely had the old field, so the check above is not
    // vacuously true of an artefact that never carried it.
    expect(historicalDeterminations().some((d) => 'provisions' in d)).toBe(true);
    expect(historicalDeterminations().every((d) => !('locators' in d))).toBe(true);
  });

  it('changes sources only where the audited migration says it may', () => {
    // The whitelist, stated as "the new value is the audited one" rather than
    // "the difference is somewhere in this field". Every determination whose
    // sources moved is accounted for by the audit; every one that did not move
    // is equally accounted for.
    const before = new Map(historicalDeterminations().map((d) => [d.requirementId, d.sources]));
    const moved: string[] = [];
    for (const determination of provenanceDeterminations()) {
      const old = before.get(determination.requirementId)!;
      const expected = [...AUDIT_EXPECTED_SOURCES[determination.requirementId]!];
      expect(determination.sources, determination.requirementId).toEqual(expected);
      if (JSON.stringify(old) !== JSON.stringify(determination.sources)) {
        moved.push(determination.requirementId);
      }
    }
    // The migration was substantial: recorded so a transition that silently
    // stopped moving anything could not read as agreement.
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.length).toBeLessThanOrEqual(provenanceDeterminations().length);
  });

  it('preserves the historical artifact’s bytes while doing so', () => {
    // The transition is additive. Restated here, in the file that reads both
    // generations, so a change to the old one cannot pass unnoticed just
    // because this suite happens to be the one comparing them.
    const digest = createHash('sha256').update(readFileSync(HISTORICAL)).digest('hex');
    expect(digest).toBe('33f3addd3f2ee205195929ac5135f11315c3de7bbc87e1440bb7ed9ceb8f8003');
  });
});
