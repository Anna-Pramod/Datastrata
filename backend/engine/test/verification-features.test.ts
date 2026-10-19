/**
 * Binding-preserving feature model — tests.
 *
 * These tests exist to answer one question the renderer cannot answer about
 * itself: does the English actually say what the `Condition` says? Re-running
 * the renderer and diffing its own output proves only that it is
 * deterministic. So every case here drives two *independent* producers — the
 * AST side (`featuresFromRequirement`) and the text side
 * (`featuresFromEnglish`, written from `docs/verification-grammar.md` alone) —
 * and asserts they agree, or, for the corruption cases, that they disagree in
 * the exact place the corruption was introduced.
 *
 * The corruption cases are the load-bearing ones. A checker that reports zero
 * divergences on correct input and *also* zero on wrong input is worth
 * nothing, so each defect shape the plan names — a mis-grouped number, a
 * swapped pair of thresholds, a wrong unit, a reordered selection case — gets
 * its own test proving the checker sees it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderCondition, renderRequirement } from '../src/verification/render';
import {
  compareConditionFeatures,
  compareRequirementFeatures,
  conditionFeaturesFromEnglish,
  EnglishParseError,
  featuresFromCondition,
  featuresFromEnglish,
  featuresFromRequirement,
} from '../src/verification/features';
import type { AuthoredRequirement, Condition, FactType, Requirement, ScopeType } from '../src/types';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { csrdPack } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

function factType(id: string, overrides: Partial<FactType> = {}): FactType {
  return {
    id,
    scopeType: 'legal_entity',
    dataType: 'number_or_range',
    module: 'Test module',
    reusableAcrossPrograms: 'yes',
    ...overrides,
  };
}

const FACT_TYPES: FactType[] = [
  factType('entity.turnover', { label: 'net turnover', unit: 'EUR' }),
  factType('entity.employees', { label: 'average number of employees', unit: 'employees' }),
  factType('entity.is_parent', { label: 'is a parent undertaking', dataType: 'boolean' }),
  factType('entity.qualifying_subsidiary_exists', { label: 'qualifying EU subsidiary exists', dataType: 'boolean' }),
  factType('entity.reported_fy2024', { label: 'reported under CSRD for FY2024', dataType: 'boolean' }),
  factType('entity.country', { label: 'country of incorporation', dataType: 'country' }),
  factType('entity.standard', { label: "standard used to prepare the parent's report", dataType: 'enum' }),
  factType('entity.report_url', { label: "URL where the parent's report is published", dataType: 'url' }),
  factType('entity.cn_code', { label: 'CN code', dataType: 'enum' }),
  factType('entity.items_above_cap', {
    label: 'request items above the voluntary-standard cap',
    unit: 'items',
    dataType: 'item_list',
  }),
  factType('facility.throughput', { label: 'annual throughput', unit: 'tonnes' }),
  factType('reporting.first_reporting_year', { label: 'first reporting year', dataType: 'year' }),
];

const ctx = { factTypes: FACT_TYPES, catalogues: {} };

function requirement(
  id: string,
  shape: { condition?: Condition; cases?: Requirement['cases']; defaultValue?: string },
): Requirement {
    // **Category B: a loaded requirement**, so it is built the way the loader
    // builds one — the authored record first, then the derived state attached
    // on top, with `sources` produced by the production derivation rather than
    // written by hand. Writing both `provenance` and a literal `sources` is the
    // two-authorities shape the migration removed, and a fixture is exactly
    // where it would creep back in unnoticed.
  const authored: AuthoredRequirement = {
    id,
    version: 1,
    title: 'Example requirement',
    program: 'TEST',
    decisionArea: 'Test area',
    plainEnglish: 'Example.',
    scopeType: 'legal_entity',
    relationshipClass: 'direct_legal',
    severity: 'high',
    kind: shape.cases ? 'selection' : 'boolean',
    legalStatus: 'in_force',
    provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Article 1' }] }],
    ...shape,
  };
  return { ...authored, derivedStatus: 'ratified', statusReasons: [], sources: sourceIdsOf(authored) };
}

const TURNOVER: Condition = { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450000000 };
const EMPLOYEES: Condition = { op: 'cmp', fact: 'entity.employees', cmp: 'gt', value: 1000 };

// ---------------------------------------------------------------------------
// The seventeen-primitive fixture table
//
// Typed as `Record<Condition['op'], Condition>`, so the *union* decides the
// keys: adding an eighteenth primitive to `Condition` makes `npm run
// typecheck` fail here until a fixture is added. Hand-listing the ops would
// have made the table silently stale instead.
// ---------------------------------------------------------------------------

const PRIMITIVE_FIXTURES: Record<Condition['op'], Condition> = {
  all: { op: 'all', of: [TURNOVER, EMPLOYEES] },
  any: { op: 'any', of: [TURNOVER, { op: 'eq', fact: 'entity.is_parent', value: true }] },
  not: { op: 'not', of: { op: 'all', of: [TURNOVER, EMPLOYEES] } },
  cmp: TURNOVER,
  eq: { op: 'eq', fact: 'entity.standard', value: 'ESRS' },
  in_set: { op: 'in_set', fact: 'entity.standard', set: ['ESRS', 'EQUIVALENT'] },
  in_catalogue: { op: 'in_catalogue', fact: 'entity.country', catalogue: 'eu_member_states' },
  prefix_in: { op: 'prefix_in', fact: 'entity.cn_code', prefixes: ['72', '73'] },
  exists: { op: 'exists', fact: 'entity.report_url' },
  count_cmp: { op: 'count_cmp', fact: 'entity.items_above_cap', cmp: 'gt', value: 0 },
  quantifier_any: {
    op: 'quantifier_any',
    scopeType: 'facility',
    where: { op: 'cmp', fact: 'facility.throughput', cmp: 'gte', value: 1000 },
  },
  sum_cmp: { op: 'sum_cmp', scopeType: 'facility', fact: 'facility.throughput', cmp: 'gt', value: 5000 },
  fy_starts_on_or_after: { op: 'fy_starts_on_or_after', date: '2027-01-01' },
  fy_start_year_in: { op: 'fy_start_year_in', years: [2025, 2026] },
  year_diff_lt: { op: 'year_diff_lt', fromFact: 'reporting.first_reporting_year', years: 3 },
  requirement_ref: { op: 'requirement_ref', requirement: 'CSRD-S-007', expect: 'APPLIES' },
  pack_flag: { op: 'pack_flag', flag: 'revised_esrs_in_force' },
};

/** condition -> render -> read back; the round trip the plan is built on. */
function roundTrip(condition: Condition): string[] {
  const english = renderCondition(condition, ctx);
  return compareConditionFeatures(featuresFromCondition(condition, ctx), conditionFeaturesFromEnglish(english, ctx));
}

// ---------------------------------------------------------------------------

describe('the seventeen-primitive parity table', () => {
  it('has a fixture for every op in the Condition union', () => {
    const keys = Object.keys(PRIMITIVE_FIXTURES).sort();
    expect(keys).toHaveLength(17);
    for (const [key, fixture] of Object.entries(PRIMITIVE_FIXTURES)) {
      expect(fixture.op).toBe(key);
    }
  });

  for (const [op, fixture] of Object.entries(PRIMITIVE_FIXTURES)) {
    it(`round-trips ${op} with zero divergences`, () => {
      expect(roundTrip(fixture)).toEqual([]);
    });
  }
});

describe('composite and conditionally-structural forms', () => {
  const cases: [string, Condition][] = [
    ['flat not', { op: 'not', of: TURNOVER }],
    ['doubled flat not', { op: 'not', of: { op: 'not', of: TURNOVER } }],
    ['structural quantifier_any', {
      op: 'quantifier_any',
      scopeType: 'facility',
      where: { op: 'all', of: [TURNOVER, EMPLOYEES] },
    }],
    ['not wrapping a structural quantifier_any', {
      op: 'not',
      of: { op: 'quantifier_any', scopeType: 'facility', where: { op: 'all', of: [TURNOVER, EMPLOYEES] } },
    }],
    ['flat quantifier_any wrapping a flat not', {
      op: 'quantifier_any',
      scopeType: 'trade_lane',
      where: { op: 'not', of: TURNOVER },
    }],
    ['nested all/any', {
      op: 'all',
      of: [TURNOVER, { op: 'any', of: [EMPLOYEES, { op: 'not', of: { op: 'all', of: [TURNOVER, EMPLOYEES] } }] }],
    }],
    ['eq boolean false, "is" label', { op: 'eq', fact: 'entity.is_parent', value: false }],
    ['eq boolean false, "exists" label', { op: 'eq', fact: 'entity.qualifying_subsidiary_exists', value: false }],
    ['eq boolean false, fallback label', { op: 'eq', fact: 'entity.reported_fy2024', value: false }],
    ['eq number with unit', { op: 'eq', fact: 'entity.turnover', value: 100 }],
    ['in_set of one', { op: 'in_set', fact: 'entity.standard', set: ['ESRS'] }],
    ['in_set of three', { op: 'in_set', fact: 'entity.standard', set: ['ESRS', 'EQUIVALENT', 'OTHER'] }],
    ['in_catalogue with a miss-reason override', {
      op: 'in_catalogue',
      fact: 'entity.country',
      catalogue: 'ratified_country_packs',
      missReason: 'national_law_unresolved',
    }],
    ['not wrapping an in_catalogue with a miss-reason override', {
      op: 'not',
      of: {
        op: 'in_catalogue',
        fact: 'entity.country',
        catalogue: 'ratified_country_packs',
        missReason: 'national_law_unresolved',
      },
    }],
    ['in_set of numbers with a unit', { op: 'in_set', fact: 'entity.turnover', set: [1000, 2000000] }],
    ['prefix_in of three', { op: 'prefix_in', fact: 'entity.cn_code', prefixes: ['7208', '7209', '7210'] }],
    ['all four comparators', {
      op: 'all',
      of: [
        { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1 },
        { op: 'cmp', fact: 'entity.turnover', cmp: 'gte', value: 2 },
        { op: 'cmp', fact: 'entity.turnover', cmp: 'lt', value: 3 },
        { op: 'cmp', fact: 'entity.turnover', cmp: 'lte', value: 4 },
      ],
    }],
  ];

  for (const [name, condition] of cases) {
    it(`round-trips ${name}`, () => {
      expect(roundTrip(condition)).toEqual([]);
    });
  }
});

describe('requirement-level round trips', () => {
  it('round-trips a boolean requirement', () => {
    const r = requirement('R-BOOL', { condition: { op: 'all', of: [TURNOVER, EMPLOYEES] } });
    const english = renderRequirement(r, ctx);
    expect(compareRequirementFeatures(featuresFromRequirement(r, ctx), featuresFromEnglish(english, ctx))).toEqual([]);
  });

  it('round-trips a boolean requirement with no condition', () => {
    const r = requirement('R-EMPTY', {});
    const english = renderRequirement(r, ctx);
    const fromEnglish = featuresFromEnglish(english, ctx);
    expect(fromEnglish.condition).toBeUndefined();
    expect(compareRequirementFeatures(featuresFromRequirement(r, ctx), fromEnglish)).toEqual([]);
  });

  it('round-trips a selection requirement with inline and block cases', () => {
    const r = requirement('R-SEL', {
      cases: [
        { when: TURNOVER, value: 'CASE_A', label: 'first case' },
        { when: { op: 'all', of: [TURNOVER, EMPLOYEES] }, value: 'CASE_B' },
      ],
      defaultValue: 'FALLBACK',
    });
    const english = renderRequirement(r, ctx);
    expect(compareRequirementFeatures(featuresFromRequirement(r, ctx), featuresFromEnglish(english, ctx))).toEqual([]);
  });

  it('round-trips a selection requirement with no default value', () => {
    const r = requirement('R-SEL-NODEF', { cases: [{ when: TURNOVER, value: 'CASE_A' }] });
    const english = renderRequirement(r, ctx);
    const fromEnglish = featuresFromEnglish(english, ctx);
    expect(fromEnglish.defaultValue).toBeUndefined();
    expect(compareRequirementFeatures(featuresFromRequirement(r, ctx), fromEnglish)).toEqual([]);
  });

  it('does not mistake a selection-case block header for a Condition marker', () => {
    // The §3 counter-example: both the case header and the quantifier marker
    // end in ':', and only the second is a Condition-tree marker.
    const r = requirement('R-SEL-Q', {
      cases: [
        {
          when: { op: 'quantifier_any', scopeType: 'facility', where: { op: 'all', of: [TURNOVER, EMPLOYEES] } },
          value: 'CASE_Q',
        },
      ],
      defaultValue: 'FALLBACK',
    });
    const english = renderRequirement(r, ctx);
    const fromEnglish = featuresFromEnglish(english, ctx);
    expect(fromEnglish.cases?.[0]?.when.shape).toBe('quantifier_any<facility>(all(cmp,cmp))');
    expect(compareRequirementFeatures(featuresFromRequirement(r, ctx), fromEnglish)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Corruption cases — the checker must SEE these
// ---------------------------------------------------------------------------

describe('divergences the checker must catch', () => {
  const both: Condition = { op: 'all', of: [TURNOVER, EMPLOYEES] };

  function divergences(english: string): string[] {
    return compareConditionFeatures(featuresFromCondition(both, ctx), conditionFeaturesFromEnglish(english, ctx));
  }

  it('catches a value-formatting defect that drops a digit', () => {
    const corrupted = [
      'ALL of:',
      '  1. net turnover exceeds 45 000 000 EUR',
      '  2. average number of employees exceeds 1 000 employees',
    ].join('\n');
    const found = divergences(corrupted);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('all[0]');
    expect(found[0]).toContain('threshold');
    expect(found[0]).toContain('450000000');
    expect(found[0]).toContain('45000000');
  });

  it('catches the turnover/employee swap, at both paths', () => {
    const swapped = [
      'ALL of:',
      '  1. net turnover exceeds 1 000',
      '  2. average number of employees exceeds 450 000 000 EUR',
    ].join('\n');
    const found = divergences(swapped);
    expect(found.some((d) => d.startsWith('all[0]') && d.includes('threshold'))).toBe(true);
    expect(found.some((d) => d.startsWith('all[1]') && d.includes('threshold'))).toBe(true);
  });

  it('catches a threshold with the right digits and the wrong unit', () => {
    const wrongUnit = [
      'ALL of:',
      '  1. net turnover exceeds 450 000 000 USD',
      '  2. average number of employees exceeds 1 000 employees',
    ].join('\n');
    const found = divergences(wrongUnit);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('all[0]');
    expect(found[0]).toContain('unit');
    expect(found[0]).toContain('EUR');
    expect(found[0]).toContain('USD');
  });

  it('catches a dropped unit — proving the English side reads the text, not factUnit()', () => {
    // If the English side looked the unit up from the fact type it had just
    // identified, it would supply "EUR" here from the pack and agree with
    // itself. It must instead find no unit token in the text and diverge.
    const noUnit = [
      'ALL of:',
      '  1. net turnover exceeds 450 000 000',
      '  2. average number of employees exceeds 1 000 employees',
    ].join('\n');
    const found = divergences(noUnit);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('all[0]');
    expect(found[0]).toContain('unit');
    expect(found[0]).toContain('EUR');
  });

  it('catches a corrupted comparator, naming the path and the feature', () => {
    const wrongCmp = [
      'ALL of:',
      '  1. net turnover exceeds 450 000 000 EUR',
      '  2. average number of employees is at most 1 000 employees',
    ].join('\n');
    const found = divergences(wrongCmp);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('all[1]');
    expect(found[0]).toContain('comparator');
    expect(found[0]).toContain('gt');
    expect(found[0]).toContain('lte');
  });

  it('catches a corrupted fact label', () => {
    const wrongFact = [
      'ALL of:',
      '  1. net turnover exceeds 450 000 000 EUR',
      '  2. net turnover exceeds 1 000 employees',
    ].join('\n');
    const found = divergences(wrongFact);
    expect(found.some((d) => d.startsWith('all[1]') && d.includes('fact'))).toBe(true);
  });

  it('catches a changed operator tree via shape, not merely depth', () => {
    const wrongTree = [
      'ANY of:',
      '  1. net turnover exceeds 450 000 000 EUR',
      '  2. average number of employees exceeds 1 000 employees',
    ].join('\n');
    const found = divergences(wrongTree);
    expect(found.some((d) => d.includes('shape'))).toBe(true);
  });

  it('gives distinct shapes to distinct trees of equal depth', () => {
    const left: Condition = { op: 'all', of: [TURNOVER, { op: 'any', of: [EMPLOYEES, TURNOVER] }] };
    const right: Condition = { op: 'any', of: [{ op: 'all', of: [TURNOVER, EMPLOYEES] }, TURNOVER] };
    expect(featuresFromCondition(left, ctx).shape).not.toBe(featuresFromCondition(right, ctx).shape);
  });

  it('catches a dropped negation', () => {
    const negated: Condition = { op: 'all', of: [{ op: 'not', of: TURNOVER }, EMPLOYEES] };
    const withoutNot = [
      'ALL of:',
      '  1. net turnover exceeds 450 000 000 EUR',
      '  2. average number of employees exceeds 1 000 employees',
    ].join('\n');
    const found = compareConditionFeatures(
      featuresFromCondition(negated, ctx),
      conditionFeaturesFromEnglish(withoutNot, ctx),
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.includes('shape') || d.includes('negated'))).toBe(true);
  });

  it('catches two reordered selection cases', () => {
    const cases: Requirement['cases'] = [
      { when: TURNOVER, value: 'CASE_A' },
      { when: EMPLOYEES, value: 'CASE_B' },
    ];
    const r = requirement('R-SEL', { cases, defaultValue: 'FALLBACK' });
    const reordered = requirement('R-SEL', {
      cases: [cases[1] as NonNullable<Requirement['cases']>[number], cases[0] as NonNullable<Requirement['cases']>[number]],
      defaultValue: 'FALLBACK',
    });
    const found = compareRequirementFeatures(
      featuresFromRequirement(r, ctx),
      featuresFromEnglish(renderRequirement(reordered, ctx), ctx),
    );
    expect(found.some((d) => d.startsWith('case[0]'))).toBe(true);
    expect(found.some((d) => d.startsWith('case[1]'))).toBe(true);
  });

  it('catches a changed selection case value', () => {
    const r = requirement('R-SEL', { cases: [{ when: TURNOVER, value: 'CASE_A' }], defaultValue: 'FALLBACK' });
    const wrong = requirement('R-SEL', { cases: [{ when: TURNOVER, value: 'CASE_Z' }], defaultValue: 'FALLBACK' });
    const found = compareRequirementFeatures(
      featuresFromRequirement(r, ctx),
      featuresFromEnglish(renderRequirement(wrong, ctx), ctx),
    );
    expect(found.some((d) => d.startsWith('case[0]') && d.includes('value'))).toBe(true);
  });

  it('catches a changed default value', () => {
    const r = requirement('R-SEL', { cases: [{ when: TURNOVER, value: 'CASE_A' }], defaultValue: 'FALLBACK' });
    const wrong = requirement('R-SEL', { cases: [{ when: TURNOVER, value: 'CASE_A' }], defaultValue: 'OTHER' });
    const found = compareRequirementFeatures(
      featuresFromRequirement(r, ctx),
      featuresFromEnglish(renderRequirement(wrong, ctx), ctx),
    );
    expect(found.some((d) => d.includes('defaultValue'))).toBe(true);
  });

  it('reports divergence rather than throwing', () => {
    expect(() => divergences('ALL of:\n  1. net turnover exceeds 1 EUR\n  2. net turnover exceeds 2 EUR')).not.toThrow();
  });

  it('throws EnglishParseError on a rendering it cannot read at all', () => {
    // The counterpart to the line above, and the reason the header of
    // features.ts now says so: an unreadable rendering is not "no
    // divergences", it is a finding the caller has to wrap for.
    expect(() => conditionFeaturesFromEnglish('net turnover flurbles 3', ctx)).toThrow(EnglishParseError);
  });
});

// ---------------------------------------------------------------------------
// in_catalogue's miss reason — the field that was invisible end to end
//
// Rendered from `{fact, catalogue}` only, recorded from `{fact, catalogue}`
// only and declared as `{fact, catalogue}` in the grammar document, an
// `in_catalogue`'s `missReason` could be added or deleted with no effect on
// the English and no divergence reported — while `conditionSha256` moved. It
// decides the reason code a catalogue miss emits (`evaluate.ts` reads
// `cond.missReason ?? cat.missReason`), which is the entire content of the
// pack's national-law gate.
// ---------------------------------------------------------------------------

describe('in_catalogue miss reason', () => {
  const withReason: Condition = {
    op: 'in_catalogue',
    fact: 'entity.country',
    catalogue: 'ratified_country_packs',
    missReason: 'national_law_unresolved',
  };
  const withoutReason: Condition = { op: 'in_catalogue', fact: 'entity.country', catalogue: 'ratified_country_packs' };

  it('renders the reason code, de-slugged like every other identifier', () => {
    expect(renderCondition(withReason, ctx)).toBe(
      "country of incorporation is listed in the 'ratified country packs' catalogue; a miss is recorded as 'national law unresolved'",
    );
    expect(renderCondition(withReason, ctx)).not.toContain('national_law_unresolved');
  });

  it('says nothing at all when the condition carries no override', () => {
    expect(renderCondition(withoutReason, ctx)).toBe(
      "country of incorporation is listed in the 'ratified country packs' catalogue",
    );
    expect(renderCondition(withoutReason, ctx)).not.toContain('miss');
  });

  it('renders the two differently — the whole defect was that it did not', () => {
    expect(renderCondition(withReason, ctx)).not.toBe(renderCondition(withoutReason, ctx));
  });

  it('reports a missReason divergence when the English drops it', () => {
    const found = compareConditionFeatures(
      featuresFromCondition(withReason, ctx),
      conditionFeaturesFromEnglish(renderCondition(withoutReason, ctx), ctx),
    );
    expect(found.some((d) => d.includes('missReason'))).toBe(true);
  });

  it('reports a missReason divergence when the English invents one', () => {
    const found = compareConditionFeatures(
      featuresFromCondition(withoutReason, ctx),
      conditionFeaturesFromEnglish(renderCondition(withReason, ctx), ctx),
    );
    expect(found.some((d) => d.includes('missReason'))).toBe(true);
  });

  it('reports a missReason divergence when the English names a different reason code', () => {
    const other: Condition = { ...withReason, missReason: 'catalogue_unknown' } as Condition;
    const found = compareConditionFeatures(
      featuresFromCondition(withReason, ctx),
      conditionFeaturesFromEnglish(renderCondition(other, ctx), ctx),
    );
    expect(found.some((d) => d.includes('missReason'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The header — the line binding the argument to a provision
// ---------------------------------------------------------------------------

describe('the requirement header', () => {
  const cond: Condition = { op: 'all', of: [TURNOVER, EMPLOYEES] };

  it('records the id and title from both sides', () => {
    const r = requirement('R-BOOL', { condition: cond });
    const fromEnglish = featuresFromEnglish(renderRequirement(r, ctx), ctx);
    expect(fromEnglish.id).toBe('R-BOOL');
    expect(fromEnglish.title).toBe('Example requirement');
    expect(featuresFromRequirement(r, ctx).id).toBe('R-BOOL');
  });

  it('catches the right condition rendered under the wrong id', () => {
    const r = requirement('R-RIGHT', { condition: cond });
    const wrong = requirement('R-WRONG', { condition: cond });
    const found = compareRequirementFeatures(
      featuresFromRequirement(r, ctx),
      featuresFromEnglish(renderRequirement(wrong, ctx), ctx),
    );
    expect(found.some((d) => d.includes('id') && d.includes('R-RIGHT') && d.includes('R-WRONG'))).toBe(true);
  });

  it('catches a changed title', () => {
    const r = requirement('R-BOOL', { condition: cond });
    const retitled: Requirement = { ...r, title: 'A different requirement' };
    const found = compareRequirementFeatures(
      featuresFromRequirement(r, ctx),
      featuresFromEnglish(renderRequirement(retitled, ctx), ctx),
    );
    expect(found.some((d) => d.includes('title'))).toBe(true);
  });

  it('splits at the first separator, so a title carrying its own em dash survives whole', () => {
    const r = requirement('R-DASH', { condition: cond });
    const dashed: Requirement = { ...r, title: 'Scope — and its limits' };
    const fromEnglish = featuresFromEnglish(renderRequirement(dashed, ctx), ctx);
    expect(fromEnglish.id).toBe('R-DASH');
    expect(fromEnglish.title).toBe('Scope — and its limits');
    expect(compareRequirementFeatures(featuresFromRequirement(dashed, ctx), fromEnglish)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The grammar ambiguity that used to live here, now closed
//
// A single-item `in_set` and an `eq` on the same value once rendered to the
// identical line, and this suite pinned that collision as expected behaviour:
// the parser reported `eq` for both and the comparison surfaced the ambiguity
// as an op divergence — on *correct* input. The templates are now injective
// (§4.3's `is one of: `), so these assert the opposite: the two render
// differently and each round-trips clean.
// ---------------------------------------------------------------------------

describe('in_set and eq are injective (grammar §4.3)', () => {
  const asEq: Condition = { op: 'eq', fact: 'entity.standard', value: 'ESRS' };
  const asSet: Condition = { op: 'in_set', fact: 'entity.standard', set: ['ESRS'] };

  it('a single-item in_set does not render as the equivalent eq', () => {
    expect(renderCondition(asSet, ctx)).not.toBe(renderCondition(asEq, ctx));
    expect(renderCondition(asSet, ctx)).toBe("standard used to prepare the parent's report is one of: ESRS");
    expect(renderCondition(asEq, ctx)).toBe("standard used to prepare the parent's report is ESRS");
  });

  it('each round-trips with zero divergences, at one item and at several', () => {
    expect(roundTrip(asSet)).toEqual([]);
    expect(roundTrip(asEq)).toEqual([]);
    expect(roundTrip({ op: 'in_set', fact: 'entity.standard', set: ['ESRS', 'EQUIVALENT'] })).toEqual([]);
  });

  it('reading one back as the other is a divergence, in both directions', () => {
    const setSaidAsEq = compareConditionFeatures(
      featuresFromCondition(asSet, ctx),
      conditionFeaturesFromEnglish(renderCondition(asEq, ctx), ctx),
    );
    expect(setSaidAsEq.some((d) => d.includes('op') || d.includes('shape'))).toBe(true);

    const eqSaidAsSet = compareConditionFeatures(
      featuresFromCondition(asEq, ctx),
      conditionFeaturesFromEnglish(renderCondition(asSet, ctx), ctx),
    );
    expect(eqSaidAsSet.some((d) => d.includes('op') || d.includes('shape'))).toBe(true);
  });

  it('an eq value containing " or " stays one literal rather than splitting into a set', () => {
    const odd: Condition = { op: 'eq', fact: 'entity.standard', value: 'ESRS or nothing' };
    expect(roundTrip(odd)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The false-positive control: real content
// ---------------------------------------------------------------------------

describe('the CSRD pack — false-positive control', () => {
  const pack = csrdPack();
  const packCtx = { factTypes: pack.factTypes, catalogues: pack.catalogues };

  it('has twenty-three requirements', () => {
    expect(pack.requirements).toHaveLength(23);
  });

  for (const r of pack.requirements) {
    it(`reports zero divergences for ${r.id}`, () => {
      const english = renderRequirement(r, packCtx);
      expect(compareRequirementFeatures(featuresFromRequirement(r, packCtx), featuresFromEnglish(english, packCtx))).toEqual([]);
    });
  }

  // A checker that reports zero on correct input and also zero on wrong input
  // is worth nothing. These mutations perturb the *rendered English* of the
  // real pack one token at a time; every one of them must surface. Without
  // this, the zero above would be indistinguishable from a vacuous comparison.
  const mutations: [string, (s: string) => string][] = [
    ['a flipped comparator', (s) => s.replace('exceeds', 'is below')],
    ['a dropped digit', (s) => s.replace('450 000 000', '45 000 000')],
    ['a changed unit', (s) => s.replace(' EUR', ' USD')],
    ['a flipped conjunction', (s) => s.replace('ALL of:', 'ANY of:')],
    ['a changed truth token', (s) => s.replace('APPLIES', 'INDETERMINATE')],
    ['a changed catalogue', (s) => s.replace('eu member states', 'eea member states')],
  ];

  for (const [name, mutate] of mutations) {
    it(`catches ${name} in every requirement it applies to`, () => {
      let applicable = 0;
      let missed = 0;
      for (const r of pack.requirements) {
        const english = renderRequirement(r, packCtx);
        const corrupted = mutate(english);
        if (corrupted === english) continue;
        applicable += 1;
        let found: string[];
        try {
          found = compareRequirementFeatures(featuresFromRequirement(r, packCtx), featuresFromEnglish(corrupted, packCtx));
        } catch {
          continue; // an unreadable mutation is also a detection
        }
        if (found.length === 0) missed += 1;
      }
      expect(applicable).toBeGreaterThan(0);
      expect(missed).toBe(0);
    });
  }

  it('reports zero divergences across all sixteen at once', () => {
    const all = pack.requirements.flatMap((r) =>
      compareRequirementFeatures(
        featuresFromRequirement(r, packCtx),
        featuresFromEnglish(renderRequirement(r, packCtx), packCtx),
      ).map((d) => `${r.id}: ${d}`),
    );
    expect(all).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Field-level accounting — the guard against the next dropped field
//
// Op-level `never` exhaustiveness catches a dropped *op*: add an eighteenth
// member to the `Condition` union and `renderFlat`'s switch fails to compile.
// Nothing caught a dropped *field*. `in_catalogue.missReason` existed on the
// type, was read by the evaluator, decided a critical requirement's reason
// code — and was rendered by nothing, recorded by nothing, and declared by
// nothing, so deleting it from the pack changed no English and produced no
// divergence.
//
// So every field of every `Condition` member is accounted for here by a
// probe: a base condition and a mutation of that one field. The probe list is
// hand-maintained, but the field list it must cover is *derived* — parsed out
// of the `Condition` union in `src/types.ts`, and cross-checked against the
// type-driven `PRIMITIVE_FIXTURES` keys so the parse cannot silently miss a
// member. Adding an optional field to any primitive fails this test until
// someone writes a probe for it, and the probe only passes once the renderer
// emits the field and the feature model records it.
// ---------------------------------------------------------------------------

/**
 * The `Condition` union's declared fields, per op, read out of the type
 * declaration itself. Deliberately a text derivation: TypeScript types are
 * erased at runtime, so a *real* derivation of the declared shape can only
 * come from the declaration text — and the alternative, hand-listing the
 * fields here too, is the staleness this test exists to prevent.
 */
function declaredConditionFields(): Map<string, string[]> {
  const source = readFileSync(join(here, '..', 'src', 'types.ts'), 'utf8');
  const start = source.indexOf('export type Condition =');
  expect(start, 'the Condition union declaration was not found in src/types.ts').toBeGreaterThan(-1);
  const end = source.indexOf('};', start);
  expect(end, 'the end of the Condition union declaration was not found').toBeGreaterThan(start);
  const declaration = source.slice(start, end + 1);

  const byOp = new Map<string, string[]>();
  for (const member of declaration.matchAll(/\{([^{}]*)\}/g)) {
    const body = member[1] ?? '';
    const op = /\bop:\s*'([^']+)'/.exec(body)?.[1];
    expect(op, `a Condition union member has no literal op: ${JSON.stringify(body)}`).toBeDefined();
    const fields = body
      .split(';')
      .map((part) => /^\s*(\w+)\??\s*:/.exec(part)?.[1])
      .filter((name): name is string => name !== undefined);
    expect(fields, `no fields parsed for op ${op}`).toContain('op');
    byOp.set(op as string, fields);
  }
  return byOp;
}

/**
 * One probe per declared field: `base` and a `mutated` copy differing in that
 * field alone. `op` itself is excluded — it is the union's discriminator, not
 * a payload field, and the seventeen-fixture parity table above already
 * covers every value it can take.
 */
const FIELD_PROBES: Record<string, { base: Condition; mutated: Condition }> = {
  'all.of': {
    base: { op: 'all', of: [TURNOVER, EMPLOYEES] },
    mutated: { op: 'all', of: [TURNOVER, TURNOVER] },
  },
  'any.of': {
    base: { op: 'any', of: [TURNOVER, EMPLOYEES] },
    mutated: { op: 'any', of: [TURNOVER, TURNOVER] },
  },
  'not.of': {
    base: { op: 'not', of: TURNOVER },
    mutated: { op: 'not', of: EMPLOYEES },
  },
  'cmp.fact': {
    base: TURNOVER,
    mutated: { op: 'cmp', fact: 'entity.employees', cmp: 'gt', value: 450000000 },
  },
  'cmp.cmp': {
    base: TURNOVER,
    mutated: { op: 'cmp', fact: 'entity.turnover', cmp: 'lt', value: 450000000 },
  },
  'cmp.value': {
    base: TURNOVER,
    mutated: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 45000000 },
  },
  'eq.fact': {
    base: { op: 'eq', fact: 'entity.standard', value: 'ESRS' },
    mutated: { op: 'eq', fact: 'entity.cn_code', value: 'ESRS' },
  },
  'eq.value': {
    base: { op: 'eq', fact: 'entity.standard', value: 'ESRS' },
    mutated: { op: 'eq', fact: 'entity.standard', value: 'EQUIVALENT' },
  },
  'in_set.fact': {
    base: { op: 'in_set', fact: 'entity.standard', set: ['ESRS', 'EQUIVALENT'] },
    mutated: { op: 'in_set', fact: 'entity.cn_code', set: ['ESRS', 'EQUIVALENT'] },
  },
  'in_set.set': {
    base: { op: 'in_set', fact: 'entity.standard', set: ['ESRS', 'EQUIVALENT'] },
    mutated: { op: 'in_set', fact: 'entity.standard', set: ['ESRS', 'OTHER'] },
  },
  'in_catalogue.fact': {
    base: { op: 'in_catalogue', fact: 'entity.country', catalogue: 'eu_member_states' },
    mutated: { op: 'in_catalogue', fact: 'entity.cn_code', catalogue: 'eu_member_states' },
  },
  'in_catalogue.catalogue': {
    base: { op: 'in_catalogue', fact: 'entity.country', catalogue: 'eu_member_states' },
    mutated: { op: 'in_catalogue', fact: 'entity.country', catalogue: 'eea_member_states' },
  },
  'in_catalogue.missReason': {
    base: {
      op: 'in_catalogue',
      fact: 'entity.country',
      catalogue: 'ratified_country_packs',
      missReason: 'national_law_unresolved',
    },
    mutated: { op: 'in_catalogue', fact: 'entity.country', catalogue: 'ratified_country_packs' },
  },
  'prefix_in.fact': {
    base: { op: 'prefix_in', fact: 'entity.cn_code', prefixes: ['72', '73'] },
    mutated: { op: 'prefix_in', fact: 'entity.standard', prefixes: ['72', '73'] },
  },
  'prefix_in.prefixes': {
    base: { op: 'prefix_in', fact: 'entity.cn_code', prefixes: ['72', '73'] },
    mutated: { op: 'prefix_in', fact: 'entity.cn_code', prefixes: ['72', '99'] },
  },
  'exists.fact': {
    base: { op: 'exists', fact: 'entity.report_url' },
    mutated: { op: 'exists', fact: 'entity.cn_code' },
  },
  'count_cmp.fact': {
    base: { op: 'count_cmp', fact: 'entity.items_above_cap', cmp: 'gt', value: 0 },
    mutated: { op: 'count_cmp', fact: 'entity.employees', cmp: 'gt', value: 0 },
  },
  'count_cmp.cmp': {
    base: { op: 'count_cmp', fact: 'entity.items_above_cap', cmp: 'gt', value: 0 },
    mutated: { op: 'count_cmp', fact: 'entity.items_above_cap', cmp: 'lte', value: 0 },
  },
  'count_cmp.value': {
    base: { op: 'count_cmp', fact: 'entity.items_above_cap', cmp: 'gt', value: 0 },
    mutated: { op: 'count_cmp', fact: 'entity.items_above_cap', cmp: 'gt', value: 5 },
  },
  'quantifier_any.scopeType': {
    base: { op: 'quantifier_any', scopeType: 'facility', where: TURNOVER },
    mutated: { op: 'quantifier_any', scopeType: 'trade_lane', where: TURNOVER },
  },
  'quantifier_any.where': {
    base: { op: 'quantifier_any', scopeType: 'facility', where: TURNOVER },
    mutated: { op: 'quantifier_any', scopeType: 'facility', where: EMPLOYEES },
  },
  'sum_cmp.scopeType': {
    base: { op: 'sum_cmp', scopeType: 'facility', fact: 'facility.throughput', cmp: 'gt', value: 5000 },
    mutated: { op: 'sum_cmp', scopeType: 'trade_lane', fact: 'facility.throughput', cmp: 'gt', value: 5000 },
  },
  'sum_cmp.fact': {
    base: { op: 'sum_cmp', scopeType: 'facility', fact: 'facility.throughput', cmp: 'gt', value: 5000 },
    mutated: { op: 'sum_cmp', scopeType: 'facility', fact: 'entity.turnover', cmp: 'gt', value: 5000 },
  },
  'sum_cmp.cmp': {
    base: { op: 'sum_cmp', scopeType: 'facility', fact: 'facility.throughput', cmp: 'gt', value: 5000 },
    mutated: { op: 'sum_cmp', scopeType: 'facility', fact: 'facility.throughput', cmp: 'lte', value: 5000 },
  },
  'sum_cmp.value': {
    base: { op: 'sum_cmp', scopeType: 'facility', fact: 'facility.throughput', cmp: 'gt', value: 5000 },
    mutated: { op: 'sum_cmp', scopeType: 'facility', fact: 'facility.throughput', cmp: 'gt', value: 6000 },
  },
  'fy_starts_on_or_after.date': {
    base: { op: 'fy_starts_on_or_after', date: '2027-01-01' },
    mutated: { op: 'fy_starts_on_or_after', date: '2028-01-01' },
  },
  'fy_start_year_in.years': {
    base: { op: 'fy_start_year_in', years: [2025, 2026] },
    mutated: { op: 'fy_start_year_in', years: [2025, 2027] },
  },
  'year_diff_lt.fromFact': {
    base: { op: 'year_diff_lt', fromFact: 'reporting.first_reporting_year', years: 3 },
    mutated: { op: 'year_diff_lt', fromFact: 'entity.turnover', years: 3 },
  },
  'year_diff_lt.years': {
    base: { op: 'year_diff_lt', fromFact: 'reporting.first_reporting_year', years: 3 },
    mutated: { op: 'year_diff_lt', fromFact: 'reporting.first_reporting_year', years: 5 },
  },
  'requirement_ref.requirement': {
    base: { op: 'requirement_ref', requirement: 'CSRD-S-007', expect: 'APPLIES' },
    mutated: { op: 'requirement_ref', requirement: 'CSRD-S-008', expect: 'APPLIES' },
  },
  'requirement_ref.expect': {
    base: { op: 'requirement_ref', requirement: 'CSRD-S-007', expect: 'APPLIES' },
    mutated: { op: 'requirement_ref', requirement: 'CSRD-S-007', expect: 'INDETERMINATE' },
  },
  'pack_flag.flag': {
    base: { op: 'pack_flag', flag: 'revised_esrs_in_force' },
    mutated: { op: 'pack_flag', flag: 'voluntary_standard_in_force' },
  },
};

describe('every Condition field is accounted for', () => {
  const declared = declaredConditionFields();

  it('derives the union from src/types.ts, matching the type-driven fixture keys', () => {
    expect([...declared.keys()].sort()).toEqual(Object.keys(PRIMITIVE_FIXTURES).sort());
  });

  it('has a probe for every declared field of every op, and none for a field that does not exist', () => {
    const probed = new Map<string, string[]>();
    for (const key of Object.keys(FIELD_PROBES)) {
      const dot = key.indexOf('.');
      const op = key.slice(0, dot);
      probed.set(op, [...(probed.get(op) ?? []), key.slice(dot + 1)]);
    }
    for (const [op, fields] of declared) {
      const expected = fields.filter((f) => f !== 'op').sort();
      expect([...(probed.get(op) ?? [])].sort(), `field probes for op ${op}`).toEqual(expected);
    }
    expect([...probed.keys()].sort()).toEqual([...declared.keys()].sort());
  });

  for (const [key, probe] of Object.entries(FIELD_PROBES)) {
    it(`${key}: the renderer emits it and the feature model records it`, () => {
      const baseEnglish = renderCondition(probe.base, ctx);
      const mutatedEnglish = renderCondition(probe.mutated, ctx);
      expect(mutatedEnglish, `changing ${key} left the rendered English identical`).not.toBe(baseEnglish);

      const found = compareConditionFeatures(
        featuresFromCondition(probe.base, ctx),
        conditionFeaturesFromEnglish(mutatedEnglish, ctx),
      );
      expect(found.length, `changing ${key} produced no divergence`).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Every ScopeType survives the round trip, in both the flat and the
// structural quantifier form. `MARKER`'s scope alternation is built from
// `SCOPE_PHRASES` rather than hand-copied, and this is what proves the
// derivation covers the enum: the table is keyed by `ScopeType`, so a tenth
// scope fails to compile until it is listed.
// ---------------------------------------------------------------------------

describe('quantifier_any over every scope type', () => {
  const SCOPES: Record<ScopeType, true> = {
    organization: true,
    legal_entity: true,
    branch: true,
    facility: true,
    product: true,
    trade_lane: true,
    supplier: true,
    request: true,
    counterparty: true,
  };

  for (const scopeType of Object.keys(SCOPES) as ScopeType[]) {
    it(`round-trips ${scopeType}, flat and structural`, () => {
      expect(roundTrip({ op: 'quantifier_any', scopeType, where: TURNOVER })).toEqual([]);
      expect(roundTrip({ op: 'quantifier_any', scopeType, where: { op: 'all', of: [TURNOVER, EMPLOYEES] } })).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Why the vocabulary gate now requires distinct labels
//
// `fact` is compared as a *label*, not an id — deliberately, since the label
// is the one thing both sides may look up. The price is that two facts
// sharing a label are indistinguishable here, and a threshold rebound from
// one to the other reports nothing. This test pins that consequence so the
// reason for `assertFactVocabularyCoverage`'s distinctness clause is written
// down where the hole would otherwise be; the gate is what stops a pack from
// ever reaching this state.
// ---------------------------------------------------------------------------

describe('label collisions are invisible to the comparison', () => {
  it('a swap between two same-labelled facts reports zero divergences', () => {
    const collidingTypes: FactType[] = [
      factType('entity.headcount', { label: 'headcount', unit: 'employees' }),
      factType('group.headcount', { label: 'headcount', unit: 'employees' }),
    ];
    const collidingCtx = { factTypes: collidingTypes, catalogues: {} };
    const entityBound: Condition = { op: 'cmp', fact: 'entity.headcount', cmp: 'gt', value: 1000 };
    const groupBound: Condition = { op: 'cmp', fact: 'group.headcount', cmp: 'gt', value: 1000 };

    const found = compareConditionFeatures(
      featuresFromCondition(entityBound, collidingCtx),
      conditionFeaturesFromEnglish(renderCondition(groupBound, collidingCtx), collidingCtx),
    );
    expect(found).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The import boundary, asserted at symbol level
// ---------------------------------------------------------------------------

describe('the import boundary', () => {
  it('imports nothing beyond types.ts, node builtins, and exactly factLabel and factUnit', () => {
    const source = readFileSync(join(here, '..', 'src', 'verification', 'features.ts'), 'utf8');
    const imports: { symbols: string[]; from: string }[] = [];
    const re = /import\s+(?:type\s+)?(?:\{([^}]*)\}|(\*\s+as\s+\w+)|(\w+))\s+from\s+'([^']+)'/g;
    for (const m of source.matchAll(re)) {
      const braced = m[1];
      const symbols = braced
        ? braced.split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0] ?? '').filter(Boolean)
        : ['*'];
      imports.push({ symbols, from: m[4] ?? '' });
    }

    // Every import statement in the file was recognised by the scanner.
    const statementCount = (source.match(/^\s*import\b/gm) ?? []).length;
    expect(imports).toHaveLength(statementCount);

    for (const imp of imports) {
      if (imp.from.startsWith('node:')) continue;
      if (imp.from === '../types') continue;
      expect(imp.from, `unexpected import source ${imp.from}`).toBe('./vocabulary');
      expect(new Set(imp.symbols)).toEqual(new Set(['factLabel', 'factUnit']));
    }

    // Explicitly: no call to the banned value formatter, no render.ts, no
    // third semantics module. Comments are stripped first — the file is
    // allowed to *explain* why the formatter is banned, just not to use it.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/renderValue/);
    expect(code).not.toMatch(/from\s+'\.\/render'/);
    expect(code).not.toMatch(/from\s+'\.\/canonical'/);
  });
});
