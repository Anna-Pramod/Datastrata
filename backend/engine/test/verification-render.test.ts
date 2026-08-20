/**
 * Renderer — tests.
 *
 * These are pure-function tests against synthetic fixtures, deliberately not
 * routed through the real CSRD pack: the renderer must be correct in
 * isolation for every one of the seventeen `Condition` primitives, including
 * the three CBAM-shaped ones (`quantifier_any`, `sum_cmp`, `prefix_in`) that
 * the current CSRD pack never exercises. Reading the real pack's output is a
 * separate, non-test step (see the task report) — a synthetic fixture lets
 * every op be tested in isolation, with a value shaped to make its
 * load-bearing tokens (fact label, comparator phrase, value, unit) easy to
 * assert on directly.
 */

import { describe, expect, it } from 'vitest';
import { renderCondition, renderRequirement, RENDERER_VERSION } from '../src/verification/render';
import type { RenderContext } from '../src/verification/render';
import type { Condition, FactType, Requirement } from '../src/types';

// ---------------------------------------------------------------------------
// Fixture builders
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
  factType('entity.items_above_cap', { label: 'request items above the voluntary-standard cap', unit: 'items', dataType: 'item_list' }),
  factType('facility.throughput', { label: 'annual throughput', unit: 'tonnes' }),
  factType('reporting.first_reporting_year', { label: 'first reporting year', dataType: 'year' }),
];

function ctx(factTypes: FactType[] = FACT_TYPES): RenderContext {
  return { factTypes, catalogues: {} };
}

function requirement(id: string, shape: { condition?: Condition; cases?: Requirement['cases']; defaultValue?: string }): Requirement {
  return {
    id,
    title: `Test requirement ${id}`,
    program: 'CSRD',
    decisionArea: 'Test area',
    plainEnglish: 'Test requirement plain English.',
    scopeType: 'legal_entity',
    relationshipClass: 'direct_legal',
    severity: 'medium',
    kind: shape.cases ? 'selection' : 'boolean',
    condition: shape.condition,
    cases: shape.cases,
    defaultValue: shape.defaultValue,
    legalStatus: 'in_force',
    ratification: { status: 'draft' },
    sources: ['SRC-TEST'],
  };
}

// ---------------------------------------------------------------------------
// RENDERER_VERSION
// ---------------------------------------------------------------------------

describe('RENDERER_VERSION', () => {
  it('starts at 1.0.0', () => {
    expect(RENDERER_VERSION).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// One test per primitive: load-bearing tokens
// ---------------------------------------------------------------------------

describe('renderCondition — one primitive at a time', () => {
  it('cmp: fact label, comparator phrase, value and unit', () => {
    const out = renderCondition({ op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450000000 }, ctx());
    expect(out).toContain('net turnover');
    expect(out).toContain('exceeds');
    expect(out).toContain('450 000 000');
    expect(out).toContain('EUR');
  });

  it('eq (boolean true): bare fact label as an elliptical clause', () => {
    const out = renderCondition({ op: 'eq', fact: 'entity.is_parent', value: true }, ctx());
    expect(out).toContain('is a parent undertaking');
    expect(out).not.toMatch(/\byes\b/);
  });

  it('eq (boolean false): negates without a bare "is X is no"', () => {
    const out = renderCondition({ op: 'eq', fact: 'entity.qualifying_subsidiary_exists', value: false }, ctx());
    expect(out).toContain('does not exist');
  });

  it('eq (string): fact label and value verbatim', () => {
    const out = renderCondition({ op: 'eq', fact: 'entity.standard', value: 'ESRS' }, ctx());
    expect(out).toContain("standard used to prepare the parent's report");
    expect(out).toContain('ESRS');
  });

  it('in_set: fact label and every candidate value', () => {
    const out = renderCondition({ op: 'in_set', fact: 'entity.standard', set: ['ESRS', 'EQUIVALENT'] }, ctx());
    expect(out).toContain("standard used to prepare the parent's report");
    expect(out).toContain('ESRS');
    expect(out).toContain('EQUIVALENT');
  });

  it('in_catalogue: fact label and a readable (de-slugged) catalogue name', () => {
    const out = renderCondition({ op: 'in_catalogue', fact: 'entity.country', catalogue: 'eu_member_states' }, ctx());
    expect(out).toContain('country of incorporation');
    expect(out).toContain('eu member states');
    expect(out).not.toContain('eu_member_states');
  });

  it('prefix_in: fact label and every prefix', () => {
    const out = renderCondition({ op: 'prefix_in', fact: 'entity.cn_code', prefixes: ['72', '73'] }, ctx());
    expect(out).toContain('CN code');
    expect(out).toContain('72');
    expect(out).toContain('73');
  });

  it('exists: fact label', () => {
    const out = renderCondition({ op: 'exists', fact: 'entity.report_url' }, ctx());
    expect(out).toContain("URL where the parent's report is published");
  });

  it('count_cmp: fact label, comparator phrase, value and unit', () => {
    const out = renderCondition({ op: 'count_cmp', fact: 'entity.items_above_cap', cmp: 'gt', value: 0 }, ctx());
    expect(out).toContain('request items above the voluntary-standard cap');
    expect(out).toContain('exceeds');
    expect(out).toContain('0');
    expect(out).toContain('items');
  });

  it('quantifier_any: scope type and inner clause', () => {
    const out = renderCondition(
      { op: 'quantifier_any', scopeType: 'facility', where: { op: 'cmp', fact: 'facility.throughput', cmp: 'gte', value: 1000 } },
      ctx(),
    );
    expect(out).toContain('facility');
    expect(out).toContain('annual throughput');
    expect(out).toContain('is at least');
    expect(out).toContain('1 000');
    expect(out).toContain('tonnes');
  });

  it('sum_cmp: fact label, scope type, comparator phrase, value and unit', () => {
    const out = renderCondition({ op: 'sum_cmp', scopeType: 'facility', fact: 'facility.throughput', cmp: 'gt', value: 5000 }, ctx());
    expect(out).toContain('annual throughput');
    expect(out).toContain('facility');
    expect(out).toContain('exceeds');
    expect(out).toContain('5 000');
    expect(out).toContain('tonnes');
  });

  it('fy_starts_on_or_after: the date verbatim', () => {
    const out = renderCondition({ op: 'fy_starts_on_or_after', date: '2027-01-01' }, ctx());
    expect(out).toContain('2027-01-01');
  });

  it('fy_start_year_in: every candidate year', () => {
    const out = renderCondition({ op: 'fy_start_year_in', years: [2025, 2026] }, ctx());
    expect(out).toContain('2025');
    expect(out).toContain('2026');
  });

  it('year_diff_lt: the fact label and the year count', () => {
    const out = renderCondition({ op: 'year_diff_lt', fromFact: 'reporting.first_reporting_year', years: 3 }, ctx());
    expect(out).toContain('first reporting year');
    expect(out).toContain('3');
  });

  it('requirement_ref: requirement id and expected truth, verbatim', () => {
    const out = renderCondition({ op: 'requirement_ref', requirement: 'CSRD-S-007', expect: 'APPLIES' }, ctx());
    expect(out).toContain('CSRD-S-007');
    expect(out).toContain('APPLIES');
    // Rule 7: never paraphrase the three-valued truth into "applies"/"does not apply".
    expect(out).not.toContain('applies');
  });

  it('pack_flag: the flag name', () => {
    const out = renderCondition({ op: 'pack_flag', flag: 'revised_esrs_in_force' }, ctx());
    expect(out).toContain('revised esrs in force');
  });

  it('all: ALL of: marker with every child numbered', () => {
    const out = renderCondition(
      {
        op: 'all',
        of: [
          { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450000000 },
          { op: 'cmp', fact: 'entity.employees', cmp: 'gt', value: 1000 },
        ],
      },
      ctx(),
    );
    expect(out).toContain('ALL of:');
    expect(out).toContain('1.');
    expect(out).toContain('2.');
  });

  it('any: ANY of: marker with every child numbered', () => {
    const out = renderCondition(
      {
        op: 'any',
        of: [
          { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450000000 },
          { op: 'cmp', fact: 'entity.employees', cmp: 'gt', value: 1000 },
        ],
      },
      ctx(),
    );
    expect(out).toContain('ANY of:');
  });

  it('not: does not flip the inner comparator', () => {
    const out = renderCondition({ op: 'not', of: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1000 } }, ctx());
    expect(out).toContain('exceeds');
  });
});

// ---------------------------------------------------------------------------
// Nesting is unambiguous (grammar contract)
// ---------------------------------------------------------------------------

describe('renderCondition — nesting grammar', () => {
  const a: Condition = { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1 };
  const b: Condition = { op: 'cmp', fact: 'entity.employees', cmp: 'gt', value: 2 };

  it('produces exact fixed markers with two-space indentation per level', () => {
    const nested: Condition = { op: 'all', of: [a, { op: 'any', of: [a, b] }] };
    const out = renderCondition(nested, ctx());
    const lines = out.split('\n');
    expect(lines[0]).toBe('ALL of:');
    expect(lines.some((l) => l === '  2. ANY of:')).toBe(true);
    // ANY's own children are indented two further spaces (four total).
    expect(lines.some((l) => /^ {4}1\. /.test(l))).toBe(true);
    expect(lines.some((l) => /^ {4}2\. /.test(l))).toBe(true);
  });

  it('all[a, any[b, c]] renders differently from any[all[a, b], c]', () => {
    const shapeOne: Condition = { op: 'all', of: [a, { op: 'any', of: [a, b] }] };
    const shapeTwo: Condition = { op: 'any', of: [{ op: 'all', of: [a, b] }, a] };
    expect(renderCondition(shapeOne, ctx())).not.toBe(renderCondition(shapeTwo, ctx()));
    expect(renderCondition(shapeOne, ctx()).split('\n')[0]).toBe('ALL of:');
    expect(renderCondition(shapeTwo, ctx()).split('\n')[0]).toBe('ANY of:');
  });

  it('not renders the fixed NOT: marker when wrapping a compound clause', () => {
    const out = renderCondition({ op: 'not', of: { op: 'all', of: [a, b] } }, ctx());
    expect(out.split('\n')[0]).toBe('NOT:');
    expect(out).toContain('ALL of:');
  });
});

// ---------------------------------------------------------------------------
// not must not perform a logical transformation the evaluator does not
// ---------------------------------------------------------------------------

describe('renderCondition — not never flips a comparator', () => {
  it('not(cmp gt 1000) never contains the lte phrase', () => {
    const out = renderCondition({ op: 'not', of: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1000 } }, ctx());
    expect(out).not.toContain('is at most');
    expect(out).toContain('exceeds');
  });
});

// ---------------------------------------------------------------------------
// All four comparators render distinctly
// ---------------------------------------------------------------------------

describe('renderCondition — comparators render distinctly', () => {
  it('gt, gte, lt, lte all produce different phrases', () => {
    const phraseFor = (cmp: 'gt' | 'gte' | 'lt' | 'lte') =>
      renderCondition({ op: 'cmp', fact: 'entity.turnover', cmp, value: 100 }, ctx());
    const phrases = new Set([phraseFor('gt'), phraseFor('gte'), phraseFor('lt'), phraseFor('lte')]);
    expect(phrases.size).toBe(4);
  });

  it('gt and gte never render identically', () => {
    const gt = renderCondition({ op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 100 }, ctx());
    const gte = renderCondition({ op: 'cmp', fact: 'entity.turnover', cmp: 'gte', value: 100 }, ctx());
    expect(gt).not.toBe(gte);
  });
});

// ---------------------------------------------------------------------------
// renderRequirement — selection requirements
// ---------------------------------------------------------------------------

describe('renderRequirement — selection requirements', () => {
  it('renders cases in order and names the default as an explicit fallback', () => {
    const req = requirement('R-SEL', {
      cases: [
        { when: { op: 'eq', fact: 'entity.standard', value: 'ESRS' }, value: 'CASE_A', label: 'first case' },
        { when: { op: 'eq', fact: 'entity.standard', value: 'EQUIVALENT' }, value: 'CASE_B', label: 'second case' },
      ],
      defaultValue: 'FALLBACK',
    });
    const out = renderRequirement(req, ctx());
    const iA = out.indexOf('CASE_A');
    const iB = out.indexOf('CASE_B');
    const iDefault = out.indexOf('FALLBACK');
    expect(iA).toBeGreaterThan(-1);
    expect(iB).toBeGreaterThan(iA);
    expect(iDefault).toBeGreaterThan(iB);
  });

  it('renders a case whose "when" is a compound condition using the same block grammar', () => {
    const req = requirement('R-SEL-2', {
      cases: [
        {
          when: { op: 'all', of: [{ op: 'eq', fact: 'entity.standard', value: 'ESRS' }, { op: 'eq', fact: 'entity.is_parent', value: true }] },
          value: 'CASE_C',
        },
      ],
      defaultValue: 'FALLBACK',
    });
    const out = renderRequirement(req, ctx());
    expect(out).toContain('ALL of:');
    expect(out).toContain('CASE_C');
  });
});

// ---------------------------------------------------------------------------
// renderRequirement — boolean requirements
// ---------------------------------------------------------------------------

describe('renderRequirement — boolean requirements', () => {
  it('embeds the rendered condition', () => {
    const req = requirement('R-BOOL', {
      condition: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450000000 },
    });
    const out = renderRequirement(req, ctx());
    expect(out).toContain('R-BOOL');
    expect(out).toContain('net turnover');
    expect(out).toContain('exceeds');
  });
});

// ---------------------------------------------------------------------------
// Purity / determinism
// ---------------------------------------------------------------------------

describe('renderCondition — purity', () => {
  it('renders identical input identically twice', () => {
    const cond: Condition = {
      op: 'all',
      of: [
        { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450000000 },
        { op: 'not', of: { op: 'exists', fact: 'entity.report_url' } },
      ],
    };
    expect(renderCondition(cond, ctx())).toBe(renderCondition(cond, ctx()));
  });
});
