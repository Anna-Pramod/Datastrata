/**
 * Fact and value vocabulary — tests.
 *
 * These are pure-function tests against synthetic fixtures, deliberately not
 * routed through `loadPack`/the real CSRD pack: the vocabulary layer must be
 * correct in isolation from how (or whether) a pack was loaded, and using
 * synthetic fixtures lets the coverage-gate tests exercise failure paths
 * (unlabelled facts, `requires review`, missing units) that the real,
 * fully-labelled pack can no longer produce once Step 5 is done.
 */

import { describe, expect, it } from 'vitest';
import {
  assertFactVocabularyCoverage,
  factLabel,
  factsReferencedBy,
  factUnit,
  mechanicalLabel,
  renderValue,
} from '../src/verification/vocabulary';
import type { Condition, FactType, KnowledgePack, Requirement } from '../src/types';

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

function requirement(id: string, shape: { condition?: Condition; cases?: Requirement['cases'] }): Requirement {
  return {
    id,
    version: 1,
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
    legalStatus: 'in_force',
    derivedStatus: 'draft',
    statusReasons: [],
    sources: ['SRC-TEST'],
    provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Article 1' }] }],
  };
}

function pack(factTypes: FactType[], requirements: Requirement[]): KnowledgePack {
  return {
    id: 'test-pack',
    version: '0.0.0',
    program: 'CSRD',
    legalSnapshot: '2026-01-01',
    packFlags: {},
    sources: [],
    factTypes,
    requirements,
    obligationTemplates: [],
    gapTests: [],
    questions: [],
    catalogues: {},
    changeWatch: [],
  };
}

// ---------------------------------------------------------------------------
// mechanicalLabel
// ---------------------------------------------------------------------------

describe('mechanicalLabel', () => {
  it('drops the scope prefix and replaces underscores with spaces', () => {
    expect(mechanicalLabel('entity.net_turnover_eur')).toBe('net turnover eur');
  });

  it('does not expand abbreviations', () => {
    // A correct expansion would read "EUR amount"; the mechanical fallback
    // must not guess that — a visibly unfinished string beats a wrong one.
    expect(mechanicalLabel('entity.eur_amt')).toBe('eur amt');
  });

  it('handles a fact id with no scope prefix', () => {
    expect(mechanicalLabel('standalone_fact')).toBe('standalone fact');
  });
});

// ---------------------------------------------------------------------------
// factLabel
// ---------------------------------------------------------------------------

describe('factLabel', () => {
  it('returns the explicit label when present', () => {
    const types = [factType('entity.net_turnover_eur', { label: 'net turnover' })];
    expect(factLabel('entity.net_turnover_eur', types)).toBe('net turnover');
  });

  it('falls back to the mechanical label when no explicit label is set', () => {
    const types = [factType('entity.net_turnover_eur')];
    expect(factLabel('entity.net_turnover_eur', types)).toBe('net turnover eur');
  });

  it('falls back to the mechanical label when the fact type is not found at all', () => {
    expect(factLabel('entity.unknown_fact', [])).toBe('unknown fact');
  });
});

// ---------------------------------------------------------------------------
// factUnit
// ---------------------------------------------------------------------------

describe('factUnit', () => {
  it('returns the explicit unit when present', () => {
    const types = [factType('entity.net_turnover_eur', { unit: 'EUR' })];
    expect(factUnit('entity.net_turnover_eur', types)).toBe('EUR');
  });

  it('returns null when no unit is set', () => {
    const types = [factType('entity.net_turnover_eur')];
    expect(factUnit('entity.net_turnover_eur', types)).toBeNull();
  });

  it('returns null when the fact type is not found at all', () => {
    expect(factUnit('entity.unknown_fact', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// renderValue
// ---------------------------------------------------------------------------

describe('renderValue', () => {
  it('formats large numbers with ordinary-space thousands separators', () => {
    expect(renderValue(450000000)).toBe('450 000 000');
  });

  it('uses U+0020 space characters specifically, not narrow or non-breaking spaces', () => {
    const rendered = renderValue(450000000);
    expect(rendered).toBe('450 000 000');
    expect(rendered).not.toMatch(/[\u00a0\u202f\u2009\u2007]/);
  });

  it('leaves numbers under 1000 unseparated', () => {
    expect(renderValue(999)).toBe('999');
  });

  it('appends the unit when one is given', () => {
    expect(renderValue(450000000, 'EUR')).toBe('450 000 000 EUR');
    expect(renderValue(1000, 'employees')).toBe('1 000 employees');
  });

  it('omits the unit entirely when none is given', () => {
    expect(renderValue(1000, null)).toBe('1 000');
    expect(renderValue(1000)).toBe('1 000');
  });

  it('renders booleans as yes/no, ignoring any unit', () => {
    expect(renderValue(true)).toBe('yes');
    expect(renderValue(false)).toBe('no');
    expect(renderValue(true, 'EUR')).toBe('yes');
  });

  it('renders strings verbatim, ignoring any unit', () => {
    expect(renderValue('ESRS_2023')).toBe('ESRS_2023');
    expect(renderValue('ESRS_2023', 'EUR')).toBe('ESRS_2023');
  });
});

// ---------------------------------------------------------------------------
// factsReferencedBy
// ---------------------------------------------------------------------------

describe('factsReferencedBy', () => {
  it('collects a fact from a simple cmp condition', () => {
    const r = requirement('R-1', { condition: { op: 'cmp', fact: 'entity.a', cmp: 'gt', value: 1 } });
    expect(factsReferencedBy(r)).toEqual(['entity.a']);
  });

  it('walks nested all/any/not', () => {
    const r = requirement('R-2', {
      condition: {
        op: 'all',
        of: [
          { op: 'any', of: [{ op: 'eq', fact: 'entity.b', value: true }, { op: 'exists', fact: 'entity.c' }] },
          { op: 'not', of: { op: 'in_set', fact: 'entity.d', set: ['x'] } },
        ],
      },
    });
    expect(factsReferencedBy(r)).toEqual(['entity.b', 'entity.c', 'entity.d']);
  });

  it('reaches a fact nested inside quantifier_any', () => {
    const r = requirement('R-3', {
      condition: { op: 'quantifier_any', scopeType: 'legal_entity', where: { op: 'cmp', fact: 'entity.nested', cmp: 'gt', value: 5 } },
    });
    expect(factsReferencedBy(r)).toEqual(['entity.nested']);
  });

  it('collects the fact from sum_cmp', () => {
    const r = requirement('R-4', {
      condition: { op: 'sum_cmp', scopeType: 'organization', fact: 'group.total', cmp: 'gt', value: 100 },
    });
    expect(factsReferencedBy(r)).toEqual(['group.total']);
  });

  it('collects fromFact from year_diff_lt', () => {
    const r = requirement('R-5', {
      condition: { op: 'year_diff_lt', fromFact: 'reporting.start_year', years: 3 },
    });
    expect(factsReferencedBy(r)).toEqual(['reporting.start_year']);
  });

  it('walks every case of a selection requirement, including a fact nested inside quantifier_any', () => {
    const r = requirement('R-6', {
      cases: [
        { when: { op: 'eq', fact: 'entity.case_a', value: 'X' }, value: 'X' },
        {
          when: { op: 'quantifier_any', scopeType: 'legal_entity', where: { op: 'exists', fact: 'entity.case_b' } },
          value: 'Y',
        },
      ],
    });
    expect(factsReferencedBy(r)).toEqual(['entity.case_a', 'entity.case_b']);
  });

  it('dedupes and sorts, across both condition and cases', () => {
    const r = requirement('R-7', {
      condition: { op: 'all', of: [{ op: 'exists', fact: 'z.last' }, { op: 'exists', fact: 'a.first' }] },
      cases: [{ when: { op: 'exists', fact: 'a.first' }, value: 'X' }],
    });
    // Note: this requirement mixes condition + cases only as a fixture convenience;
    // factsReferencedBy must walk both regardless of `kind`.
    expect(factsReferencedBy(r)).toEqual(['a.first', 'z.last']);
  });

  it('returns an empty array for a requirement with neither condition nor cases', () => {
    const r = requirement('R-8', {});
    expect(factsReferencedBy(r)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// assertFactVocabularyCoverage
// ---------------------------------------------------------------------------

describe('assertFactVocabularyCoverage', () => {
  it('does not throw when every referenced fact is labelled, and units are present where required', () => {
    const types = [
      factType('entity.turnover', { label: 'net turnover', unit: 'EUR' }),
      factType('entity.country', { label: 'country of incorporation' }),
    ];
    const reqs = [
      requirement('R-1', {
        condition: {
          op: 'all',
          of: [
            { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1 },
            { op: 'exists', fact: 'entity.country' },
          ],
        },
      }),
    ];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).not.toThrow();
  });

  it('does not require a label for a fact that is not referenced by any requirement', () => {
    const types = [factType('entity.unused')]; // no label at all
    const reqs: Requirement[] = [];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).not.toThrow();
  });

  it('throws, naming every offender, when two referenced facts are unlabelled', () => {
    const types = [factType('entity.a'), factType('entity.b')];
    const reqs = [
      requirement('R-1', {
        condition: { op: 'all', of: [{ op: 'exists', fact: 'entity.a' }, { op: 'exists', fact: 'entity.b' }] },
      }),
    ];
    let error: Error | undefined;
    try {
      assertFactVocabularyCoverage(pack(types, reqs));
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain('entity.a');
    expect(error!.message).toContain('entity.b');
  });

  it('throws when a referenced fact carries labelNote: "requires review", even though it has a label', () => {
    const types = [factType('entity.uncertain', { label: 'best guess so far', labelNote: 'requires review' })];
    const reqs = [requirement('R-1', { condition: { op: 'exists', fact: 'entity.uncertain' } })];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).toThrow(/requires review/);
  });

  it('throws when a cmp-referenced fact has a label but no unit', () => {
    const types = [factType('entity.turnover', { label: 'net turnover' })]; // no unit
    const reqs = [requirement('R-1', { condition: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1 } })];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).toThrow(/entity\.turnover/);
  });

  it('throws when a count_cmp-referenced fact has a label but no unit', () => {
    const types = [factType('entity.items', { label: 'items above cap' })];
    const reqs = [requirement('R-1', { condition: { op: 'count_cmp', fact: 'entity.items', cmp: 'gt', value: 0 } })];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).toThrow(/entity\.items/);
  });

  it('throws when a sum_cmp-referenced fact has a label but no unit', () => {
    const types = [factType('group.total', { label: 'group total' })];
    const reqs = [
      requirement('R-1', { condition: { op: 'sum_cmp', scopeType: 'organization', fact: 'group.total', cmp: 'gt', value: 1 } }),
    ];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).toThrow(/group\.total/);
  });

  it('does not require a unit for a fact referenced only via non-numeric-comparison ops', () => {
    const types = [
      factType('entity.country', { label: 'country of incorporation' }),
      factType('entity.flag', { label: 'some flag' }),
    ];
    const reqs = [
      requirement('R-1', {
        condition: {
          op: 'all',
          of: [
            { op: 'in_catalogue', fact: 'entity.country', catalogue: 'eu_member_states' },
            { op: 'eq', fact: 'entity.flag', value: true },
          ],
        },
      }),
    ];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Distinctness — the fourth clause.
  //
  // The rendered English names a fact by its label, and the independent
  // feature model compares `fact` as that label rather than as an id. Two
  // referenced facts sharing a label are therefore one fact to the checker,
  // and a threshold rebound from one to the other reports nothing at all —
  // the single binding error a binding-preserving model cannot see.
  // -------------------------------------------------------------------------

  it('throws when two referenced facts share an explicit label, naming both', () => {
    const types = [
      factType('entity.turnover', { label: 'net turnover', unit: 'EUR' }),
      factType('group.turnover', { label: 'net turnover', unit: 'EUR' }),
    ];
    const reqs = [
      requirement('R-1', {
        condition: {
          op: 'all',
          of: [
            { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1 },
            { op: 'cmp', fact: 'group.turnover', cmp: 'gt', value: 2 },
          ],
        },
      }),
    ];
    let error: Error | undefined;
    try {
      assertFactVocabularyCoverage(pack(types, reqs));
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain('entity.turnover');
    expect(error!.message).toContain('group.turnover');
    expect(error!.message).toContain('net turnover');
  });

  it('throws on a collision created by the mechanical fallback dropping the scope prefix', () => {
    // `mechanicalLabel` drops everything up to the first `.`, so `entity.x`
    // and `group.x` collide by construction the moment both are referenced —
    // even though neither carries an explicit label at all.
    const types = [factType('entity.headcount'), factType('group.headcount')];
    const reqs = [
      requirement('R-1', {
        condition: {
          op: 'all',
          of: [{ op: 'exists', fact: 'entity.headcount' }, { op: 'exists', fact: 'group.headcount' }],
        },
      }),
    ];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).toThrow(/both render as the label "headcount"/);
  });

  it('names every colliding pair, not just the group, when three facts share a label', () => {
    const types = [
      factType('a.x', { label: 'shared' }),
      factType('b.x', { label: 'shared' }),
      factType('c.x', { label: 'shared' }),
    ];
    const reqs = [
      requirement('R-1', {
        condition: {
          op: 'all',
          of: [
            { op: 'exists', fact: 'a.x' },
            { op: 'exists', fact: 'b.x' },
            { op: 'exists', fact: 'c.x' },
          ],
        },
      }),
    ];
    let error: Error | undefined;
    try {
      assertFactVocabularyCoverage(pack(types, reqs));
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toContain('a.x and b.x');
    expect(error!.message).toContain('a.x and c.x');
    expect(error!.message).toContain('b.x and c.x');
  });

  it('does not object to a label shared with a fact no requirement references', () => {
    // The gate is about what reaches a rendering. An unreferenced fact never
    // does, so a duplicate label there is not yet a binding hazard.
    const types = [
      factType('entity.turnover', { label: 'net turnover', unit: 'EUR' }),
      factType('group.turnover', { label: 'net turnover', unit: 'EUR' }),
    ];
    const reqs = [requirement('R-1', { condition: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1 } })];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).not.toThrow();
  });

  it('treats a fact used in cmp inside a selection case the same as one in a boolean condition', () => {
    const types = [factType('entity.turnover', { label: 'net turnover' })]; // no unit
    const reqs = [
      requirement('R-1', {
        cases: [{ when: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1 }, value: 'X' }],
      }),
    ];
    expect(() => assertFactVocabularyCoverage(pack(types, reqs))).toThrow(/entity\.turnover/);
  });
});
