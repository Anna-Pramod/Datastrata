/**
 * The mutation suite — the acceptance gate for the whole verification plan.
 *
 * `render.ts` turns a `Condition` into English; `features.ts` reads both the
 * `Condition` and the English back into a binding-preserving feature model
 * and diffs them. Task 4's own tests prove that pair agrees on correct input.
 * That is necessary but not sufficient: a checker that agrees with correct
 * input and *also* agrees with wrong input is worthless, and nothing so far
 * has driven a real renderer defect through it end to end.
 *
 * So every case here follows one fixed sequence:
 *
 *   1. Take a real requirement's **logical payload** — its `condition`, or
 *      its `cases[]`/`defaultValue` — and mutate it.
 *   2. Render the *mutated* requirement to English.
 *   3. Compare that English against the features of the *original,
 *      unmutated* requirement.
 *
 * Step 3 is the direction the whole suite depends on. Comparing the mutated
 * English against the *mutated* requirement's own features would compare a
 * mutated thing to itself and pass trivially — the corruption and the
 * yardstick would move together. Comparing mutated English against the
 * *original* yardstick is what simulates the actual failure this checker
 * exists to catch: a renderer that describes something the (real, filed,
 * ratified-or-not) requirement does not say.
 *
 * The synthetic fixtures for `prefix_in`, `quantifier_any` and `sum_cmp`
 * (mutations 11-13) are the exception to "a real requirement's logical
 * payload" — CSRD exercises neither primitive, so there is no real payload
 * to mutate. They follow the identical three-step sequence against a
 * hand-built one-atom requirement instead.
 *
 * Mutation 10 ("displayed value corrupted") is the other exception: a
 * formatting defect that drops a digit or a separator happens in the
 * renderer's *string output*, not in the `Condition` tree — there is no
 * payload edit that produces "shows 45 000 000 for 450000000" the way a
 * `value` edit produces a genuinely different number. That one corrupts the
 * rendered English of the real, unmutated CSRD-S-001 directly, then compares
 * against the same original's features — step 3 unchanged, step 1-2 folded
 * into a single textual edit standing in for the renderer bug it simulates.
 */

import { describe, expect, it } from 'vitest';
import { renderRequirement, type RenderContext } from '../src/verification/render';
import { compareRequirementFeatures, featuresFromEnglish, featuresFromRequirement } from '../src/verification/features';
import type { Condition, FactType, KnowledgePack, Requirement } from '../src/types';
import { csrdPack } from './helpers';

// ---------------------------------------------------------------------------
// Shared machinery
// ---------------------------------------------------------------------------

function requirementById(pack: KnowledgePack, id: string): Requirement {
  const found = pack.requirements.find((r) => r.id === id);
  if (!found) throw new Error(`fixture requirement not found: ${id}`);
  return found;
}

/** Deep-clones `original` and hands the clone to `edit` for in-place mutation. */
function mutate(original: Requirement, edit: (clone: Requirement) => void): Requirement {
  const clone = structuredClone(original);
  edit(clone);
  return clone;
}

/** Replaces a flat `all`'s children. Throws if `r.condition` is not `all` — a fixture-shape assumption, not a runtime possibility this suite should silently tolerate. */
function withAllChildren(r: Requirement, transform: (of: Condition[]) => Condition[]): Requirement {
  return mutate(r, (clone) => {
    if (clone.condition?.op !== 'all') throw new Error(`fixture assumption failed: ${clone.id} condition is not \`all\``);
    clone.condition = { op: 'all', of: transform(clone.condition.of) };
  });
}

/**
 * The load-bearing helper: renders `mutated`, then compares that English
 * against `original`'s features. Every mutation test below calls this with
 * `original` fixed and only `mutated` varying — never the reverse.
 */
function divergencesFor(original: Requirement, mutated: Requirement, ctx: RenderContext): string[] {
  const english = renderRequirement(mutated, ctx);
  return compareRequirementFeatures(featuresFromRequirement(original, ctx), featuresFromEnglish(english, ctx));
}

const pack = csrdPack();
const packCtx: RenderContext = { factTypes: pack.factTypes, catalogues: pack.catalogues };

// ---------------------------------------------------------------------------
// Mutations 1-6: CSRD-S-001 — the turnover/employee threshold pair
//
// condition = ALL of: [in_catalogue(country), in_catalogue(legal_form),
//                       cmp(net_turnover_eur, gt, 450000000),
//                       cmp(avg_employees, gt, 1000)]
// so the turnover atom sits at all[2] and the employees atom at all[3].
// ---------------------------------------------------------------------------

describe('CSRD-S-001 mutations', () => {
  const original = requirementById(pack, 'CSRD-S-001');

  it('1. wrong conjunction: all -> any is a shape divergence', () => {
    const mutated = mutate(original, (clone) => {
      if (clone.condition?.op !== 'all') throw new Error('fixture assumption failed: CSRD-S-001 condition is not `all`');
      clone.condition = { op: 'any', of: clone.condition.of };
    });
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.includes('shape'))).toBe(true);
  });

  it('2. dropped atom: removing avg_employees is an atom-set / shape divergence', () => {
    const mutated = withAllChildren(original, (of) => of.filter((c) => !('fact' in c && c.fact === 'entity.avg_employees')));
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.includes('shape'))).toBe(true);
    expect(found.some((d) => d.startsWith('all[3]') && d.includes('atom'))).toBe(true);
  });

  it('3. inverted comparator: gt -> lt on turnover is a comparator divergence at all[2]', () => {
    const mutated = withAllChildren(original, (of) =>
      of.map((c) => (c.op === 'cmp' && c.fact === 'entity.net_turnover_eur' ? { ...c, cmp: 'lt' as const } : c)),
    );
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.startsWith('all[2]') && d.includes('comparator'))).toBe(true);
  });

  it('4. wrong threshold: 450000000 -> 40000000 on turnover is a threshold divergence at all[2]', () => {
    const mutated = withAllChildren(original, (of) =>
      of.map((c) => (c.op === 'cmp' && c.fact === 'entity.net_turnover_eur' ? { ...c, value: 40000000 } : c)),
    );
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.startsWith('all[2]') && d.includes('threshold'))).toBe(true);
  });

  it('5. wrong unit: turnover threshold carrying the employee unit is a unit divergence at all[2]', () => {
    // `Condition` carries no `unit` field of its own — a `cmp` atom's unit is
    // always derived from `factUnit(fact, ...)`. The only logical-payload
    // edit that can make the turnover atom's *threshold* carry the
    // employees' unit is retargeting which fact it reads, while leaving its
    // comparator and value untouched.
    const mutated = withAllChildren(original, (of) =>
      of.map((c) => (c.op === 'cmp' && c.fact === 'entity.net_turnover_eur' ? { ...c, fact: 'entity.avg_employees' } : c)),
    );
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.startsWith('all[2]') && d.includes('unit'))).toBe(true);
  });

  it('6. swapped bindings: exchanging the two thresholds is a threshold divergence at BOTH paths', () => {
    const mutated = withAllChildren(original, (of) =>
      of.map((c) => {
        if (c.op === 'cmp' && c.fact === 'entity.net_turnover_eur') return { ...c, value: 1000 };
        if (c.op === 'cmp' && c.fact === 'entity.avg_employees') return { ...c, value: 450000000 };
        return c;
      }),
    );
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.startsWith('all[2]') && d.includes('threshold'))).toBe(true);
    expect(found.some((d) => d.startsWith('all[3]') && d.includes('threshold'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mutation 7: wrong nesting, against the nested rule CSRD-S-004
//
// condition = ALL of: [in_catalogue(country), fy_start_year_in([2025,2026]),
//                       ANY of: [not(cmp turnover), not(cmp employees)],
//                       eq(member_state_transition_option, true)]
//
// Re-associating the nested `any` into its parent `all` — splicing the
// `any`'s two children directly into the `all` in its place — turns
// "either threshold fails" (any of two negations) into "both thresholds
// fail" (both negations, unconditionally). Same atoms, same negations,
// different tree.
// ---------------------------------------------------------------------------

describe('CSRD-S-004 mutation', () => {
  const original = requirementById(pack, 'CSRD-S-004');

  it('7. wrong nesting: re-associating the nested any into its parent all is a shape divergence', () => {
    const mutated = mutate(original, (clone) => {
      if (clone.condition?.op !== 'all') throw new Error('fixture assumption failed: CSRD-S-004 condition is not `all`');
      const of = clone.condition.of;
      const anyIndex = of.findIndex((c) => c.op === 'any');
      if (anyIndex === -1) throw new Error('fixture assumption failed: CSRD-S-004 has no nested `any`');
      const nestedAny = of[anyIndex];
      if (!nestedAny || nestedAny.op !== 'any') throw new Error('unreachable');
      clone.condition = { op: 'all', of: [...of.slice(0, anyIndex), ...nestedAny.of, ...of.slice(anyIndex + 1)] };
    });
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.includes('shape'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mutations 8-9: CSRD-S-012 — the only selection requirement
//
// cases = [not(pack_flag) -> ESRS_2023,
//          fy_starts_on_or_after(2027-01-01) -> ESRS_REVISED_2026,
//          all(fy_start_year_in([2026]), eq(early_adoption, true)) -> ESRS_REVISED_2026]
// defaultValue = ESRS_2023
// ---------------------------------------------------------------------------

describe('CSRD-S-012 mutations', () => {
  const original = requirementById(pack, 'CSRD-S-012');

  it('8. case reordering: swapping cases[0] and cases[1] is a case-order divergence', () => {
    const mutated = mutate(original, (clone) => {
      const cases = clone.cases;
      const c0 = cases?.[0];
      const c1 = cases?.[1];
      if (!cases || !c0 || !c1) throw new Error('fixture assumption failed: CSRD-S-012 has fewer than two cases');
      clone.cases = [c1, c0, ...cases.slice(2)];
    });
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.startsWith('case[0]'))).toBe(true);
    expect(found.some((d) => d.startsWith('case[1]'))).toBe(true);
  });

  it('9. default changed: ESRS_2023 -> ESRS_REVISED_2026 is a default divergence', () => {
    const mutated = mutate(original, (clone) => {
      if (clone.defaultValue === undefined) throw new Error('fixture assumption failed: CSRD-S-012 has no defaultValue');
      clone.defaultValue = 'ESRS_REVISED_2026';
    });
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.includes('defaultValue'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mutation 10: displayed value corrupted — a renderer formatting defect,
// simulated directly on the rendered English of the real, unmutated
// CSRD-S-001, rather than on its Condition tree (see the file header).
// ---------------------------------------------------------------------------

describe('displayed-value corruption', () => {
  const original = requirementById(pack, 'CSRD-S-001');

  it('10. a threshold displayed with a digit dropped is a threshold divergence at all[2]', () => {
    const english = renderRequirement(original, packCtx);
    // Pin the exact substring being corrupted, so a future renderer change
    // that reformats this line fails loudly here rather than silently
    // turning this test into a no-op replace.
    expect(english).toContain('net turnover exceeds 450 000 000 EUR');
    const corrupted = english.replace('450 000 000 EUR', '45 000 000 EUR');
    expect(corrupted).not.toBe(english);
    const found = compareRequirementFeatures(featuresFromRequirement(original, packCtx), featuresFromEnglish(corrupted, packCtx));
    expect(found.some((d) => d.startsWith('all[2]') && d.includes('threshold'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mutation 14: CSRD-S-013 — the national-law completeness gate
//
// Its third clause is an `in_catalogue` over `ratified_country_packs` with
// `missReason: 'national_law_unresolved'`, which is the requirement's entire
// purpose: a Member State whose pack is not yet ratified must resolve to that
// reason code, not to the catalogue's own default. Deleting the field used to
// leave the rendered English byte-identical and the comparison silent, while
// `conditionSha256` moved — a signature attesting review of an encoding the
// reviewer was never shown.
// ---------------------------------------------------------------------------

describe('CSRD-S-013 mutation', () => {
  const original = requirementById(pack, 'CSRD-S-013');

  it('14. deleted miss reason: dropping missReason is a missReason divergence at all[2]', () => {
    const mutated = mutate(original, (clone) => {
      if (clone.condition?.op !== 'all') throw new Error('fixture assumption failed: CSRD-S-013 condition is not `all`');
      const of = clone.condition.of;
      const index = of.findIndex((c) => c.op === 'in_catalogue' && c.missReason !== undefined);
      if (index === -1) throw new Error('fixture assumption failed: CSRD-S-013 has no in_catalogue carrying a missReason');
      const target = of[index];
      if (!target || target.op !== 'in_catalogue') throw new Error('unreachable');
      const { missReason: _dropped, ...withoutReason } = target;
      clone.condition = { op: 'all', of: [...of.slice(0, index), withoutReason, ...of.slice(index + 1)] };
    });
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.startsWith('all[2]') && d.includes('missReason'))).toBe(true);
  });

  it('14b. the rendered English actually changes — the defect was that it did not', () => {
    const english = renderRequirement(original, packCtx);
    expect(english).toContain("a miss is recorded as 'national law unresolved'");
  });
});

// ---------------------------------------------------------------------------
// Mutations 15-16: the header. The one line binding the whole argument to a
// provision, and the line the checker used to throw away — a rendering could
// carry the right condition under the wrong id and report nothing.
// ---------------------------------------------------------------------------

describe('header mutations', () => {
  const original = requirementById(pack, 'CSRD-S-001');

  it('15. wrong requirement id: the condition of one requirement under another id is an id divergence', () => {
    const mutated = mutate(original, (clone) => {
      clone.id = 'CSRD-S-002';
    });
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.includes('id') && d.includes('CSRD-S-001') && d.includes('CSRD-S-002'))).toBe(true);
  });

  it('16. wrong title: a retitled requirement is a title divergence', () => {
    const mutated = mutate(original, (clone) => {
      clone.title = 'Some other threshold entirely';
    });
    const found = divergencesFor(original, mutated, packCtx);
    expect(found.some((d) => d.includes('title'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mutations 11-13: synthetic fixtures for prefix_in, quantifier_any and
// sum_cmp — CSRD exercises none of the three. Higher risk precisely because
// no real content exists to catch a mistake in these paths.
// ---------------------------------------------------------------------------

function syntheticFactType(id: string, overrides: Partial<FactType> = {}): FactType {
  return {
    id,
    scopeType: 'legal_entity',
    dataType: 'number_or_range',
    module: 'Synthetic fixture',
    reusableAcrossPrograms: 'yes',
    ...overrides,
  };
}

const SYNTHETIC_FACT_TYPES: FactType[] = [
  syntheticFactType('entity.cn_code', { label: 'CN code', dataType: 'enum' }),
  syntheticFactType('facility.throughput', { label: 'annual throughput', unit: 'tonnes' }),
];

const syntheticCtx: RenderContext = { factTypes: SYNTHETIC_FACT_TYPES, catalogues: {} };

function syntheticRequirement(id: string, condition: Condition): Requirement {
  return {
    id,
    title: 'Synthetic fixture',
    program: 'TEST',
    decisionArea: 'Synthetic',
    plainEnglish: 'Synthetic fixture for the mutation suite.',
    scopeType: 'legal_entity',
    relationshipClass: 'direct_legal',
    severity: 'high',
    kind: 'boolean',
    legalStatus: 'in_force',
    ratification: { status: 'ratified' },
    sources: [],
    condition,
  };
}

describe('synthetic fixture mutations', () => {
  it('11. prefix_in corrupted: altering one prefix is a literal divergence at root', () => {
    const original = syntheticRequirement('SYN-PREFIX-001', {
      op: 'prefix_in',
      fact: 'entity.cn_code',
      prefixes: ['72', '73'],
    });
    const mutated = mutate(original, (clone) => {
      if (clone.condition?.op !== 'prefix_in') throw new Error('fixture assumption failed: not `prefix_in`');
      clone.condition = { ...clone.condition, prefixes: ['99', '73'] };
    });
    const found = divergencesFor(original, mutated, syntheticCtx);
    expect(found.some((d) => d.startsWith('root') && d.includes('literal'))).toBe(true);
  });

  it('12. quantifier_any corrupted: changing the quantified scopeType is an atom / shape divergence', () => {
    const original = syntheticRequirement('SYN-QUANT-001', {
      op: 'quantifier_any',
      scopeType: 'facility',
      where: { op: 'cmp', fact: 'facility.throughput', cmp: 'gte', value: 1000 },
    });
    const mutated = mutate(original, (clone) => {
      if (clone.condition?.op !== 'quantifier_any') throw new Error('fixture assumption failed: not `quantifier_any`');
      clone.condition = { ...clone.condition, scopeType: 'trade_lane' };
    });
    const found = divergencesFor(original, mutated, syntheticCtx);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.includes('shape'))).toBe(true);
  });

  it('13. sum_cmp corrupted: changing the comparator is a comparator divergence at root', () => {
    const original = syntheticRequirement('SYN-SUM-001', {
      op: 'sum_cmp',
      scopeType: 'facility',
      fact: 'facility.throughput',
      cmp: 'gt',
      value: 5000,
    });
    const mutated = mutate(original, (clone) => {
      if (clone.condition?.op !== 'sum_cmp') throw new Error('fixture assumption failed: not `sum_cmp`');
      clone.condition = { ...clone.condition, cmp: 'lte' };
    });
    const found = divergencesFor(original, mutated, syntheticCtx);
    expect(found.some((d) => d.startsWith('root') && d.includes('comparator'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The clean control: the unmutated requirement reports zero divergences.
// Without this, "every mutation is detected" would be indistinguishable
// from a comparator that flags everything indiscriminately.
// ---------------------------------------------------------------------------

describe('clean control', () => {
  it('the unmutated CSRD-S-001 reports zero divergences against itself', () => {
    const original = requirementById(pack, 'CSRD-S-001');
    expect(divergencesFor(original, original, packCtx)).toEqual([]);
  });

  it('the unmutated CSRD-S-012 reports zero divergences against itself', () => {
    const original = requirementById(pack, 'CSRD-S-012');
    expect(divergencesFor(original, original, packCtx)).toEqual([]);
  });
});
