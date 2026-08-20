/**
 * Canonical hashing — tests.
 *
 * These pin the exact distinctions the brief calls out as load-bearing:
 * key order must not matter, array order must; a delimiter-joined encoding
 * would let a crafted string value collide two structurally different
 * conditions, which is the defect this module exists to not reintroduce;
 * and a case `label` must be invisible to `logicalPayloadSha256` even
 * though it is very visible to a human reading the requirement.
 */

import { describe, expect, it } from 'vitest';
import {
  canonicalizeCondition,
  conditionSha256,
  logicalPayloadSha256,
  requirementInputSha256,
} from '../src/verification/canonical';
import type { Condition, Requirement, SelectionCase } from '../src/types';

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'REQ-TEST',
    title: 'Test requirement',
    program: 'CSRD',
    decisionArea: 'Test area',
    plainEnglish: 'Test requirement plain English.',
    scopeType: 'legal_entity',
    relationshipClass: 'direct_legal',
    severity: 'medium',
    kind: 'boolean',
    condition: { op: 'exists', fact: 'entity.turnover' },
    legalStatus: 'in_force',
    ratification: { status: 'draft' },
    sources: ['SRC-TEST'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// canonicalizeCondition / conditionSha256
// ---------------------------------------------------------------------------

describe('canonicalizeCondition / conditionSha256', () => {
  it('is stable under key reordering', () => {
    const a: Condition = { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450000000 };
    // Same fields, different construction order in the object literal.
    const b: Condition = { value: 450000000, cmp: 'gt', fact: 'entity.turnover', op: 'cmp' } as Condition;
    expect(canonicalizeCondition(a)).toBe(canonicalizeCondition(b));
    expect(conditionSha256(a)).toBe(conditionSha256(b));
  });

  it('is NOT stable under array reordering: all[a, b] differs from all[b, a]', () => {
    const a: Condition = { op: 'exists', fact: 'entity.a' };
    const b: Condition = { op: 'exists', fact: 'entity.b' };
    const ab: Condition = { op: 'all', of: [a, b] };
    const ba: Condition = { op: 'all', of: [b, a] };
    expect(conditionSha256(ab)).not.toBe(conditionSha256(ba));
  });

  it('escapes rather than delimiter-joins: a value containing a delimiter-like character does not collide', () => {
    // Two different naive joins are precedented enough to both need a probe
    // that actually collides under them — a test with teeth against only one
    // model can pass against an implementation broken the other way.
    //
    // Model B — FIXED DECLARED-ORDER join: `[op, fact, value].join('|')`,
    // no key sorting. This is not hypothetical: it is the exact defect
    // pre-fix `src/corpus/closure.ts` (commit 21278c2) shipped and was fixed
    // at Critical severity (commit 2484a8f), joining declared-order fields
    // with a delimiter instead of JSON-encoding each one. Under this model,
    // "eq" + "|" + fact + "|" + value is fixed-position, so
    //   fact="a|b", value="c"  ->  "eq|a|b|c"
    //   fact="a",   value="b|c" -> "eq|a|b|c"
    // collide directly: the pipe inside `fact` is indistinguishable from the
    // field-separating pipe.
    const left: Condition = { op: 'eq', fact: 'a|b', value: 'c' };
    const right: Condition = { op: 'eq', fact: 'a', value: 'b|c' };
    expect(conditionSha256(left)).not.toBe(conditionSha256(right));

    // Model A — SORTED-KEY join: `Object.keys(c).sort().map(k =>
    // c[k]).join('|')` (fact, op, value in alphabetical order). Here "eq"
    // sits between the two variable fields, so the pair above does NOT
    // collide (the fixed "eq" token anchors a different split). A collision
    // under this model needs the fixed middle token to appear twice inside
    // the flattened string, so a different split reproduces it:
    //   fact="a|eq|b", value="c"    -> "a|eq|b" + "|eq|" + "c"
    //   fact="a",      value="b|eq|c" -> "a" + "|eq|" + "b|eq|c"
    // both flatten to "a|eq|b|eq|c".
    //
    // Neither pair is redundant with the other — they discriminate different
    // naive serialisations, and a real (escaping) encoding must reject both.
    // JSON.stringify keeps every pair apart because it quotes and escapes
    // field content instead of concatenating it.
    const leftSortedKey: Condition = { op: 'eq', fact: 'a|eq|b', value: 'c' };
    const rightSortedKey: Condition = { op: 'eq', fact: 'a', value: 'b|eq|c' };
    expect(conditionSha256(leftSortedKey)).not.toBe(conditionSha256(rightSortedKey));

    // Same declared-order probe with a comma, in case the encoding were
    // comma-joined instead: "eq,a,b,c" either way.
    const leftComma: Condition = { op: 'eq', fact: 'a,b', value: 'c' };
    const rightComma: Condition = { op: 'eq', fact: 'a', value: 'b,c' };
    expect(conditionSha256(leftComma)).not.toBe(conditionSha256(rightComma));
  });

  it('nested key reordering inside array elements is still stable', () => {
    const a: Condition = {
      op: 'all',
      of: [
        { op: 'cmp', fact: 'x', cmp: 'gt', value: 1 },
        { op: 'eq', fact: 'y', value: true },
      ],
    };
    const b: Condition = {
      op: 'all',
      of: [
        { value: 1, op: 'cmp', cmp: 'gt', fact: 'x' } as Condition,
        { value: true, fact: 'y', op: 'eq' } as Condition,
      ],
    };
    expect(conditionSha256(a)).toBe(conditionSha256(b));
  });
});

// ---------------------------------------------------------------------------
// logicalPayloadSha256
// ---------------------------------------------------------------------------

describe('logicalPayloadSha256', () => {
  it('boolean kind: covers the condition', () => {
    const r1 = requirement({ kind: 'boolean', condition: { op: 'exists', fact: 'entity.a' } });
    const r2 = requirement({ kind: 'boolean', condition: { op: 'exists', fact: 'entity.b' } });
    expect(logicalPayloadSha256(r1)).not.toBe(logicalPayloadSha256(r2));
  });

  function selectionCase(overrides: Partial<SelectionCase> = {}): SelectionCase {
    return {
      when: { op: 'exists', fact: 'entity.a' },
      value: 'v1',
      label: 'Case one',
      ...overrides,
    };
  }

  it('reordering two selection cases changes the hash', () => {
    const caseA = selectionCase({ when: { op: 'exists', fact: 'entity.a' }, value: 'A' });
    const caseB = selectionCase({ when: { op: 'exists', fact: 'entity.b' }, value: 'B' });
    const r1 = requirement({ kind: 'selection', condition: undefined, cases: [caseA, caseB], defaultValue: 'D' });
    const r2 = requirement({ kind: 'selection', condition: undefined, cases: [caseB, caseA], defaultValue: 'D' });
    expect(logicalPayloadSha256(r1)).not.toBe(logicalPayloadSha256(r2));
  });

  it("changing a case's emitted value changes the hash", () => {
    const base = requirement({
      kind: 'selection',
      condition: undefined,
      cases: [selectionCase({ value: 'A' })],
      defaultValue: 'D',
    });
    const changed = requirement({
      kind: 'selection',
      condition: undefined,
      cases: [selectionCase({ value: 'A2' })],
      defaultValue: 'D',
    });
    expect(logicalPayloadSha256(base)).not.toBe(logicalPayloadSha256(changed));
  });

  it('changing defaultValue changes the hash', () => {
    const base = requirement({
      kind: 'selection',
      condition: undefined,
      cases: [selectionCase()],
      defaultValue: 'D1',
    });
    const changed = requirement({
      kind: 'selection',
      condition: undefined,
      cases: [selectionCase()],
      defaultValue: 'D2',
    });
    expect(logicalPayloadSha256(base)).not.toBe(logicalPayloadSha256(changed));
  });

  it("changing a case's label leaves logicalPayloadSha256 unchanged", () => {
    const base = requirement({
      kind: 'selection',
      condition: undefined,
      cases: [selectionCase({ label: 'Original wording' })],
      defaultValue: 'D',
    });
    const relabeled = requirement({
      kind: 'selection',
      condition: undefined,
      cases: [selectionCase({ label: 'Improved wording, still the same rule' })],
      defaultValue: 'D',
    });
    expect(logicalPayloadSha256(base)).toBe(logicalPayloadSha256(relabeled));
  });
});

// ---------------------------------------------------------------------------
// requirementInputSha256
// ---------------------------------------------------------------------------

describe('requirementInputSha256', () => {
  it('editing caution leaves requirementInputSha256 unchanged', () => {
    const base = requirement({ caution: undefined });
    const withCaution = requirement({ caution: 'Handle with care.' });
    expect(requirementInputSha256(base)).toBe(requirementInputSha256(withCaution));
  });

  it('editing sources[] changes requirementInputSha256', () => {
    const base = requirement({ sources: ['SRC-A'] });
    const changed = requirement({ sources: ['SRC-A', 'SRC-B'] });
    expect(requirementInputSha256(base)).not.toBe(requirementInputSha256(changed));
  });

  it('editing the condition changes requirementInputSha256', () => {
    const base = requirement({ condition: { op: 'exists', fact: 'entity.a' } });
    const changed = requirement({ condition: { op: 'exists', fact: 'entity.b' } });
    expect(requirementInputSha256(base)).not.toBe(requirementInputSha256(changed));
  });

  it('covers the provision citation', () => {
    const base = requirement({ provisions: 'Art. 5(1)' });
    const changed = requirement({ provisions: 'Art. 5(2)' });
    expect(requirementInputSha256(base)).not.toBe(requirementInputSha256(changed));
  });
});
