/**
 * The net under the asserted-ratification migration, recorded before it moves.
 *
 * Spec §7.1 requires the current implementation's behaviour to be captured
 * *before* any migration code changes, because a golden taken afterwards
 * records the new behaviour and agrees with it by construction. This file is
 * that capture at the engine level: one fixed profile through `assess()`, whole
 * `AssessmentResult`, compared against a committed artifact. Task 6 deletes
 * asserted `ratification` out of seven consumers and has to keep this green.
 *
 * The artifact is serialised with `canonicalJson`, so a change in object key
 * order — which carries no meaning and can churn on any JSON round-trip —
 * cannot make this test red, while array order, which *is* meaning (the order
 * determinations are decided in, the order questions are ranked in), still can.
 *
 * **The recorded artifact predates the migration and is not rewritten.** The
 * engine's output was *intended* to change shape — `ratificationStatus` became
 * `derivedStatus` and the type widened from two statuses to three — so spec
 * §7.2 holds this level to exact equality on every unchanged field plus one
 * explicitly named transformation, applied to the recording rather than to the
 * result. `adaptRecording` below is that transformation, written out rather
 * than derived, and it must not grow: anything it needs to normalise beyond the
 * single mapping is an unintended behaviour change, and the response is to
 * investigate rather than to widen it. This is the opposite standard from the
 * public golden, which takes no adapter at all because nothing a customer reads
 * was meant to move.
 *
 * **This artifact is updated only by an explicit, reviewed change.** There is no
 * regeneration script anywhere in this repository, and this test never writes.
 * A red golden is a report that behaviour moved: read the diff and decide
 * whether the move was intended. Regenerating it to green is not a fix — it
 * deletes the only evidence that anything happened, and a migration that
 * rewrites its own expected output proves nothing.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assess } from '../src/engine/evaluate';
import { canonicalJson } from '../src/verification/canonical';
import type { AssessmentResult } from '../src/types';
import { ProfileBuilder, csrdPack, ctx } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(here, 'golden', 'migration-engine-golden.json');

/** Every literal the capture depends on, in one place and nowhere else. */
const FY_START = '2027-01-01';
const FY_END = '2027-12-31';
const SUBJECT = 'e1';

/**
 * A French entity over both Article 19a thresholds, with three readiness facts
 * answered so the gap ledger runs at all.
 *
 * The profile is chosen for width rather than realism: it produces APPLIES,
 * DOES_NOT_APPLY and INDETERMINATE determinations, obligations, gaps in all
 * three states (open, satisfied, unknown), a full question ranking and a
 * summary carrying three status flags. A golden over a thin result would agree
 * with almost any implementation, which is why the non-triviality assertions
 * below are part of the required test set rather than decoration.
 */
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

/** `ctx` pins `assessmentDate: '2026-07-26'`; the financial year is pinned here. */
function fixedResult(): AssessmentResult {
  return assess(csrdPack(), fixedProfile(), ctx(FY_START, FY_END, SUBJECT));
}

/**
 * Canonical text, indented so a reviewer can read the diff of a change they are
 * being asked to approve. The round trip through `JSON.parse` preserves key
 * insertion order for string keys, and the guard below refuses to let that be
 * assumed: if indenting ever stopped being a pure reformatting of
 * `canonicalJson`'s output, the artifact would no longer be the canonical form
 * it claims to be.
 */
function canonicalPretty(value: unknown): string {
  const canonical = canonicalJson(value);
  const pretty = JSON.stringify(JSON.parse(canonical), null, 2);
  if (JSON.stringify(JSON.parse(pretty)) !== canonical) {
    throw new Error('Indenting is not a pure reformatting of canonicalJson output');
  }
  return `${pretty}\n`;
}

/**
 * The one sanctioned transformation, spelled out:
 *
 * ```
 * ratificationStatus: 'draft'   ->   derivedStatus: 'draft', statusReasons: []
 * ```
 *
 * Applied to the pre-migration recording, per determination, and to nothing
 * else in the result. Every guard below exists so this cannot quietly become a
 * general-purpose normaliser: a determination without the old field, or with a
 * value the mapping does not name, throws rather than passing through. A
 * migration that had also moved some other field would then have to widen this
 * function in the diff a reviewer reads, which is the only thing that makes
 * "the adapter must not grow" enforceable.
 *
 * Returns the count as well as the value: an adapter that transformed nothing
 * would make the comparison below vacuous, and `applied` is what lets the test
 * assert that it did work rather than merely that it ran.
 */
function adaptRecording(recording: unknown): { adapted: unknown; applied: number } {
  const result = recording as { determinations: unknown[] };
  let applied = 0;
  const determinations = result.determinations.map((value) => {
    const determination = value as Record<string, unknown>;
    if (!('ratificationStatus' in determination)) {
      throw new Error('adapter: a recorded determination has no ratificationStatus to map');
    }
    const { ratificationStatus, ...rest } = determination;
    if (ratificationStatus !== 'draft') {
      throw new Error(
        `adapter: the only mapping is ratificationStatus 'draft'; saw ${JSON.stringify(ratificationStatus)}`,
      );
    }
    applied += 1;
    return { ...rest, derivedStatus: 'draft', statusReasons: [] };
  });
  return { adapted: { ...result, determinations }, applied };
}

function readArtifact(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `Recorded golden missing: ${path}. It is created and updated only by an ` +
        'explicit, reviewed change — never regenerated by a test or a migration.',
    );
  }
}

describe('engine migration golden', () => {
  it('matches the recorded artifact exactly, under the one named transformation', () => {
    const { adapted } = adaptRecording(JSON.parse(readArtifact(ARTIFACT)));
    const recorded = canonicalPretty(adapted);
    const actual = canonicalPretty(fixedResult());
    // Structural comparison first: on failure vitest prints which field moved.
    expect(JSON.parse(actual)).toEqual(JSON.parse(recorded));
    // Then exact text, which also holds array order and the canonical form.
    expect(actual).toBe(recorded);
  });

  it('leaves the recording untouched apart from that mapping', () => {
    // The adapter is the whole of the licensed difference, so what it does
    // *not* touch has to be checked too: everything outside `determinations`
    // compares byte-for-byte against the pre-migration recording, with no
    // adapter in the path at all.
    const recording = JSON.parse(readArtifact(ARTIFACT)) as Record<string, unknown>;
    const { adapted } = adaptRecording(recording);
    const withoutDeterminations = (value: Record<string, unknown>) => {
      const { determinations: _dropped, ...rest } = value;
      return canonicalPretty(rest);
    };
    expect(withoutDeterminations(adapted as Record<string, unknown>)).toBe(
      withoutDeterminations(recording),
    );
    expect(withoutDeterminations(fixedResult() as unknown as Record<string, unknown>)).toBe(
      withoutDeterminations(recording),
    );
  });

  it('actually transforms, so agreement is not vacuous', () => {
    // A migration that quietly kept `ratificationStatus` alive as an alias would
    // make the adapter unnecessary, and the comparison above would still pass.
    // These are what make that visible.
    const recording = JSON.parse(readArtifact(ARTIFACT)) as { determinations: unknown[] };
    const { adapted, applied } = adaptRecording(recording);
    expect(applied).toBe(recording.determinations.length);
    expect(applied).toBeGreaterThan(0);
    expect(canonicalPretty(adapted)).not.toBe(canonicalPretty(recording));

    const live = fixedResult();
    for (const determination of live.determinations) {
      expect(determination).not.toHaveProperty('ratificationStatus');
      expect(determination.derivedStatus).toBe('draft');
      expect(determination.statusReasons).toEqual([]);
    }
  });

  it('refuses to map anything the transformation does not name', () => {
    // The guard that keeps the adapter from becoming a normaliser. A second
    // status value, or a determination missing the field, is a behaviour change
    // to investigate — never something to absorb here.
    expect(() => adaptRecording({ determinations: [{ ratificationStatus: 'ratified' }] })).toThrow(
      /only mapping is ratificationStatus 'draft'/,
    );
    expect(() => adaptRecording({ determinations: [{ requirementId: 'X' }] })).toThrow(
      /no ratificationStatus to map/,
    );
  });

  it('captures a substantial result, so agreement means something', () => {
    const recorded = JSON.parse(readArtifact(ARTIFACT)) as AssessmentResult;
    expect(recorded.determinations.length).toBeGreaterThanOrEqual(1);
    expect(recorded.obligations.length).toBeGreaterThanOrEqual(1);
    expect(recorded.nextQuestions.length).toBeGreaterThanOrEqual(1);
    // Gaps only exist once readiness facts are answered; the fixture answers three.
    expect(recorded.gaps.length).toBeGreaterThanOrEqual(1);
    expect(recorded.containsDraftContent).toBe(true);
    // Width: all three truth values are exercised, not just the easy one.
    expect(new Set(recorded.determinations.map((d) => d.result))).toEqual(
      new Set(['APPLIES', 'DOES_NOT_APPLY', 'INDETERMINATE']),
    );
  });

  it('is a capture of fixed inputs, not of the day it ran', () => {
    const recorded = JSON.parse(readArtifact(ARTIFACT)) as AssessmentResult;
    expect(recorded.context.assessmentDate).toBe('2026-07-26');
    expect(recorded.context.financialYear).toEqual({ start: FY_START, end: FY_END });
    expect(recorded.context.subjectId).toBe(SUBJECT);
  });
});
