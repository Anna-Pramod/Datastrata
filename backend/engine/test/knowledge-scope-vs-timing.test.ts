/**
 * The pack distinguishes "meets the consolidated size thresholds" from "must
 * report for this financial year", and says so where a reader will see it.
 *
 * Why this file exists: the first genuine S-002 capture (2026-10-18) halted
 * because a prosecutor, working the measurement-period lens, objected that
 * CSRD-S-002 "is not tied to any financial year" and asked for Article 5(2) of
 * Directive (EU) 2022/2464 to decide it. The pack keeps that question out of
 * S-002: CSRD-S-003 and CSRD-S-004 carry the Article 5(2) timing (S-003 as
 * wave history, S-004 as the FY2025–26 national exemption), CSRD-S-014
 * composes the threshold and exemption results into the reporting duty — S-004
 * directly, S-003 not — and S-014's own caution delegates the first reporting
 * year and the filing calendar to the national overlay and the timing rules.
 * S-002 is the size test and nothing more — but until this change its own text
 * did not say so, while S-001's and S-014's did. These tests hold the
 * division of labour as checked properties, so that a later edit cannot quietly
 * fold timing into the size test or lose the cross-reference, and they pin the
 * fact that the correction moved the description and not the verification
 * input.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPack } from '../src/knowledge/loader';
import type { Condition, Requirement } from '../src/types';
import { requirementInputSha256 } from '../src/verification/canonical';

const pack = loadPack(join(__dirname, '..', 'knowledge', 'csrd'));
const byId = new Map(pack.requirements.map((requirement) => [requirement.id, requirement]));

function requirement(id: string): Requirement {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`pack has no ${id}`);
  return found;
}

/** A boolean requirement's condition; a selection has none, and these four are all boolean. */
function conditionOf(req: Requirement): Condition {
  if (req.condition === undefined) throw new Error(`${req.id} carries no condition`);
  return req.condition;
}

/** Each locator's text, or its kind where the locator names the whole document. */
function locatorTexts(req: Requirement): string[] {
  return req.provenance.flatMap((p) => p.locators.map((l) => ('text' in l ? l.text : l.kind)));
}

/** Every operator name in a condition tree, in order of appearance. */
function opsOf(condition: Condition): string[] {
  const ops: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record['op'] === 'string') ops.push(record['op']);
    for (const value of Object.values(record)) walk(value);
  };
  walk(condition);
  return ops;
}

/** The operators that bind a condition to a financial year or a date. */
const TEMPORAL = /^fy_|^year_|date/;

function referencedRequirements(condition: Condition): { requirement: string; expect: string }[] {
  const refs: { requirement: string; expect: string }[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record['op'] === 'requirement_ref') {
      refs.push({ requirement: String(record['requirement']), expect: String(record['expect']) });
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(condition);
  return refs;
}

/**
 * The verification input the S-002 capture pinned (`requirementInputSha256`
 * in its filed `verification-result.json`, execution 20261018T121625Z-2d4de0).
 * The correction below edits what the requirement *says*, never what it
 * *verifies*, so this digest must not move.
 */
const S002_CAPTURED_INPUT_SHA256 = 'fecc50505cb4779323b70203924c012b783bf5186e34ecf9ed4d3df20b6fea95';

describe('CSRD-S-002 is the consolidated size test, and the pack keeps timing elsewhere', () => {
  const s002 = requirement('CSRD-S-002');
  const s003 = requirement('CSRD-S-003');
  const s004 = requirement('CSRD-S-004');
  const s014 = requirement('CSRD-S-014');

  it('S-002 says, where a reviewer reads it, that it is the size test and where the financial-year question lives', () => {
    // The review sheet renders `plainEnglish`; the roles never see it, and no
    // golden records it, which is why the statement lives here.
    for (const token of ['CSRD-S-014', 'CSRD-S-003', 'CSRD-S-004', 'Article 5(2)']) {
      expect(s002.plainEnglish, token).toContain(token);
    }
    // A description edit is a revision: the version moved with it, and the
    // registry binds the new text (loadPack above would have refused otherwise).
    expect(s002.version).toBe(4);
  });

  it('S-001 carries the matching scope-not-duty note, so the two size tests say the same thing', () => {
    expect(requirement('CSRD-S-001').caution).toContain('CSRD-S-014');
  });

  it('S-002’s condition binds no financial year or date; S-004’s does, to the Article 5(2) years', () => {
    expect(opsOf(conditionOf(s002)).filter((op) => TEMPORAL.test(op))).toEqual([]);
    expect(opsOf(conditionOf(s004)).filter((op) => TEMPORAL.test(op))).toEqual(['fy_start_year_in']);
    expect(JSON.stringify(conditionOf(s004))).toContain('"years":[2025,2026]');
    // The regex is live: a temporal operator is recognised when present.
    expect(TEMPORAL.test('fy_start_year_in')).toBe(true);
    expect(TEMPORAL.test('cmp')).toBe(false);
  });

  it('the timing requirements cite Article 5(2) of SRC-002; the size test cites Article 29a(1) of SRC-001 only', () => {
    for (const timing of [s003, s004]) {
      expect(timing.provenance.map((p) => p.sourceId), timing.id).toEqual(['SRC-002']);
      expect(locatorTexts(timing).some((text) => text.startsWith('Article 5(2)')), timing.id).toBe(true);
    }
    expect(s002.provenance.map((p) => p.sourceId)).toEqual(['SRC-001']);
    expect(locatorTexts(s002)).toEqual(['Article 29a(1)']);
  });

  it('S-014, the reporting duty, composes the size test with the FY2025–26 exemption rather than restating either; S-003 is not composed into it', () => {
    const refs = referencedRequirements(conditionOf(s014));
    expect(refs).toContainEqual({ requirement: 'CSRD-S-002', expect: 'APPLIES' });
    expect(refs).toContainEqual({ requirement: 'CSRD-S-004', expect: 'APPLIES' });
    expect(refs.map((r) => r.requirement)).not.toContain('CSRD-S-003');
    // And S-014 itself says where first-year applicability is decided: not here.
    expect(s014.caution).toMatch(/First reporting year/);
    // S-002 itself references nothing: it is a leaf the duty builds on.
    expect(referencedRequirements(conditionOf(s002))).toEqual([]);
  });

  it('the correction moved the description, not the verification input the capture pinned', () => {
    expect(requirementInputSha256(s002)).toBe(S002_CAPTURED_INPUT_SHA256);
    // Positive control for the digest: a condition edit would move it.
    const widened: Requirement = {
      ...s002,
      condition: { op: 'all', of: [...(conditionOf(s002) as { op: 'all'; of: Condition[] }).of, { op: 'fy_start_year_in', years: [2027] }] },
    };
    expect(requirementInputSha256(widened)).not.toBe(S002_CAPTURED_INPUT_SHA256);
  });
});
