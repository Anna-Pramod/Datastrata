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
import { z } from 'zod';
import {
  canonicalizeCondition,
  canonicalJson,
  conditionSha256,
  logicalPayloadSha256,
  requirementInputSha256,
  requirementSha256,
} from '../src/verification/canonical';
import { requirementSchema } from '../src/knowledge/schema';
import type { Condition, Requirement, SelectionCase } from '../src/types';

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: 'REQ-TEST',
    version: 1,
    provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Art. 1' }] }],
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
    derivedStatus: 'draft',
    statusReasons: [],
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

  it('editing the condition changes requirementInputSha256', () => {
    const base = requirement({ condition: { op: 'exists', fact: 'entity.a' } });
    const changed = requirement({ condition: { op: 'exists', fact: 'entity.b' } });
    expect(requirementInputSha256(base)).not.toBe(requirementInputSha256(changed));
  });

  it('covers the locator text', () => {
    const base = requirement({
      provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Art. 5(1)' }] }],
    });
    const changed = requirement({
      provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Art. 5(2)' }] }],
    });
    expect(requirementInputSha256(base)).not.toBe(requirementInputSha256(changed));
  });

  it('covers the cited source identity', () => {
    // The derived `sources` is deliberately absent from the payload, so this is
    // the assertion that proves changing a sourceId still moves the hash — it
    // moves because the provenance it was read from moved.
    const base = requirement({
      provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Art. 5(1)' }] }],
    });
    const changed = requirement({
      provenance: [{ sourceId: 'SRC-002', locators: [{ kind: 'provision', text: 'Art. 5(1)' }] }],
    });
    expect(requirementInputSha256(base)).not.toBe(requirementInputSha256(changed));
  });

  it('covers a whole-document locator distinctly from a provision one', () => {
    const whole = requirement({
      provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'whole_document' }] }],
    });
    const specific = requirement({
      provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Art. 5(1)' }] }],
    });
    expect(requirementInputSha256(whole)).not.toBe(requirementInputSha256(specific));
  });
});

// ---------------------------------------------------------------------------
// requirementSha256
//
// This block characterises what the hash *covers*, and it exists because the
// registry it feeds is unavoidably trust-on-first-use: a correct and an
// incorrect digest look equally random, so reading `csrd.json` proves nothing
// about it. What can be established independently is the domain — which edits
// move the hash and which do not — and that is what these tests pin, before
// any digest is written down.
//
// Two properties matter more than the individual cases. The hash must cover
// the *authored* record only, so a field the loader attaches later cannot
// masquerade as a content revision; and it must follow the pack's zod schema
// rather than a hand-written list of field names, so a newly authored field
// enters the hash without anybody remembering to add it.
// ---------------------------------------------------------------------------

/** Every authored field populated, so an edit to any one of them is testable. */
function fullRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return requirement({
    ruleRef: 'R-001',
    condition: { op: 'exists', fact: 'entity.turnover' },
    cases: [{ when: { op: 'exists', fact: 'entity.turnover' }, value: 'set_1', label: 'Set one' }],
    defaultValue: 'set_0',
    provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Art. 19a(1)' }] }],
    caution: 'Handle with care.',
    obligationTemplates: ['OT-001'],
    ...overrides,
  });
}

/**
 * One content edit per field the authored schema declares. The list is checked
 * against `requirementSchema.shape` below, so adding a field to the schema
 * fails this suite until someone has decided what editing it should mean.
 */
const AUTHORED_EDITS: Array<[string, Partial<Requirement>]> = [
  ['id', { id: 'REQ-OTHER' }],
  ['version', { version: 2 }],
  ['ruleRef', { ruleRef: 'R-002' }],
  ['title', { title: 'A different requirement' }],
  ['program', { program: 'OTHER' }],
  ['decisionArea', { decisionArea: 'Another area' }],
  ['plainEnglish', { plainEnglish: 'Different plain English.' }],
  ['scopeType', { scopeType: 'organization' }],
  ['relationshipClass', { relationshipClass: 'contractual' }],
  ['severity', { severity: 'low' }],
  ['kind', { kind: 'selection' }],
  ['condition', { condition: { op: 'exists', fact: 'entity.employees' } }],
  ['cases', { cases: [{ when: { op: 'exists', fact: 'entity.employees' }, value: 'set_2' }] }],
  ['defaultValue', { defaultValue: 'set_9' }],
  ['legalStatus', { legalStatus: 'proposed' }],
  [
    'provenance',
    { provenance: [{ sourceId: 'SRC-002', locators: [{ kind: 'provision', text: 'Art. 19a(2)' }] }] },
  ],
  ['caution', { caution: 'A different caution.' }],
  ['obligationTemplates', { obligationTemplates: ['OT-002'] }],
];

/**
 * Rebuilds every plain object with its keys in reverse order, recursively,
 * leaving array order alone. JSON promises no field order, so the same
 * requirement read from two encodings must hash the same; array order is
 * meaning and must not be touched by this helper.
 *
 * Deliberately not `JSON.stringify(value, keyList)` — the replacer-array form
 * filters keys at *every* depth, so it silently strips nested objects rather
 * than reordering them, and the resulting test would pass or fail for reasons
 * having nothing to do with key order.
 */
function reverseKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeyOrder);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).reverse()) out[key] = reverseKeyOrder(record[key]);
    return out;
  }
  return value;
}

describe('requirementSha256', () => {
  it('is a lowercase sha256 hex digest', () => {
    expect(requirementSha256(fullRequirement())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same content', () => {
    expect(requirementSha256(fullRequirement())).toBe(requirementSha256(fullRequirement()));
  });

  it('has an edit case for every field the authored schema declares', () => {
    // Derived from the schema, never a second hand-written list: this is what
    // turns "someone added an authored field" into a red suite.
    const declared = Object.keys(requirementSchema.shape).sort();
    const covered = AUTHORED_EDITS.map(([name]) => name).sort();
    expect(covered).toEqual(declared);
  });

  it.each(AUTHORED_EDITS)('moves when %s is edited', (_name, edit) => {
    expect(requirementSha256(fullRequirement(edit))).not.toBe(requirementSha256(fullRequirement()));
  });

  it('is stable under JSON key reordering, at every level', () => {
    const base = fullRequirement();
    const reordered = reverseKeyOrder(base) as Requirement;
    expect(Object.keys(reordered)).not.toEqual(Object.keys(base));
    expect(reordered).toEqual(base); // same content, different key order
    expect(requirementSha256(reordered)).toBe(requirementSha256(base));
  });

  it('is stable under whitespace and pretty-printing changes', () => {
    const base = fullRequirement();
    const compact = JSON.parse(JSON.stringify(base)) as Requirement;
    const pretty = JSON.parse(JSON.stringify(base, null, 4)) as Requirement;
    expect(requirementSha256(pretty)).toBe(requirementSha256(compact));
  });

  it('covers the whole authored record, unlike requirementInputSha256', () => {
    // The two hashes answer different questions and must not be collapsed:
    // editing `caution` is not a change to the verification input, but it is
    // a change to what the author wrote.
    const base = fullRequirement();
    const edited = fullRequirement({ caution: 'A different caution.' });
    expect(requirementInputSha256(edited)).toBe(requirementInputSha256(base));
    expect(requirementSha256(edited)).not.toBe(requirementSha256(base));
  });

  it('ignores fields the loader attaches after validation', () => {
    // `derivedStatus`/`statusReasons` are projections, not authored content.
    // If they entered the hash, every status recomputation would read as a
    // requirement revision and trip version integrity.
    const base = fullRequirement();
    const enriched = { ...base, derivedStatus: 'verified', statusReasons: ['stale_render'] } as unknown as Requirement;
    expect(requirementSha256(enriched)).toBe(requirementSha256(base));
  });

  it('ignores any undeclared key, not merely the two the loader adds today', () => {
    const base = fullRequirement();
    const noisy = { ...base, someFutureProjection: { nested: [1, 2, 3] } } as unknown as Requirement;
    expect(requirementSha256(noisy)).toBe(requirementSha256(base));
  });

  it('follows the schema, not a list of field names', () => {
    // The discriminating test. A hand-written whitelist and a schema-derived
    // hash agree on every case above; they disagree the moment the schema
    // declares a field the list has never heard of. Declaring one at runtime
    // is the only way to ask that question without waiting for the future
    // edit that would otherwise ship silently wrong.
    const base = fullRequirement();
    const withExtra = { ...base, experimentalField: 'declared by the schema' } as unknown as Requirement;

    // Undeclared, so stripped: identical hash.
    expect(requirementSha256(withExtra)).toBe(requirementSha256(base));

    // `_cached` memoises the shape zod parses against, so it has to be
    // dropped alongside the shape itself or the redeclaration is ignored.
    const cache = requirementSchema as unknown as { _cached: unknown };
    const originalShape = requirementSchema._def.shape;
    try {
      requirementSchema._def.shape = () => ({ ...originalShape(), experimentalField: z.string().optional() });
      cache._cached = null;
      // Now declared, so hashed: the digest must move.
      expect(requirementSha256(withExtra)).not.toBe(requirementSha256(base));
    } finally {
      requirementSchema._def.shape = originalShape;
      cache._cached = null;
    }

    // Restored: back to stripping it.
    expect(requirementSha256(withExtra)).toBe(requirementSha256(base));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys and leaves array order alone', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson([{ b: 1, a: 2 }, 'z', 'a'])).toBe('[{"a":2,"b":1},"z","a"]');
  });

  it('sorts recursively, at every depth', () => {
    expect(canonicalJson({ outer: { z: { y: 1, x: 2 }, a: [{ q: 1, p: 2 }] } })).toBe(
      '{"outer":{"a":[{"p":2,"q":1}],"z":{"x":2,"y":1}}}',
    );
  });

  it('escapes string content rather than joining it, so a crafted value cannot shift a field boundary', () => {
    // The B1a closure-hash defect: a delimiter-joined encoding lets a value
    // containing the delimiter collide two structurally different records.
    const a = canonicalJson({ one: 'x":"y', two: 'z' });
    const b = canonicalJson({ one: 'x', two: '"y","two":"z' });
    expect(a).not.toBe(b);
  });

  it('treats an absent optional and an explicit undefined identically', () => {
    expect(canonicalJson({ a: 1 })).toBe(canonicalJson({ a: 1, b: undefined }));
  });

  it('handles the scalar and null cases', () => {
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(7)).toBe('7');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
  });

  it('is the one serialiser the condition hash uses', () => {
    // Not "produces the same answer as" — the same function. Two canonical
    // serialisers are two definitions of what a signature covers.
    const condition: Condition = {
      op: 'all',
      of: [
        { op: 'exists', fact: 'entity.turnover' },
        { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 50_000_000 },
      ],
    };
    expect(canonicalizeCondition(condition)).toBe(canonicalJson(condition));
  });
});
