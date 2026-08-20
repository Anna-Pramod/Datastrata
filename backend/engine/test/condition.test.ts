import { describe, expect, it } from 'vitest';
import { cmpRange, evaluateCondition, type EvalEnv } from '../src/condition/evaluate';
import { assess } from '../src/engine/evaluate';
import type { Condition, KnowledgePack, ScopeObject } from '../src/types';
import { ProfileBuilder, ctx } from './helpers';

const scope: ScopeObject = { id: 'e1', type: 'legal_entity', name: 'TestCo' };

function stubEnv(facts: Record<string, { kind: 'number'; value: number } | { kind: 'range'; min: number; max: number } | { kind: 'boolean'; value: boolean } | { kind: 'string'; value: string }>): EvalEnv {
  return {
    ctx: ctx('2027-01-01', '2027-12-31', 'e1'),
    resolveFact: (id) => {
      const v = facts[id];
      if (!v) return { present: false, scopeId: 'e1', missingReason: 'missing_fact' };
      return { present: true, value: v, scopeId: 'e1', missingReason: 'missing_fact' };
    },
    resolveRequirementRef: () => ({ result: 'INDETERMINATE', needs: [] }),
    descendantsOfType: () => [],
    catalogue: (name) => {
      if (name === 'cat') return { entries: { KNOWN_IN: true, KNOWN_OUT: false }, missReason: 'catalogue_unknown' };
      throw new Error('unknown catalogue');
    },
    packFlag: () => undefined,
  };
}

describe('range-safe threshold comparison', () => {
  it('straddling range is INDETERMINATE, never a guess', () => {
    expect(cmpRange({ min: 900, max: 1100 }, 'gt', 1000)).toBe('INDETERMINATE');
    expect(cmpRange({ min: 1001, max: 1200 }, 'gt', 1000)).toBe('APPLIES');
    expect(cmpRange({ min: 800, max: 1000 }, 'gt', 1000)).toBe('DOES_NOT_APPLY'); // inclusive max == threshold fails strict >
    expect(cmpRange({ min: 200, max: 900 }, 'lte', 1000)).toBe('APPLIES');
    expect(cmpRange({ min: 900, max: 1100 }, 'lte', 1000)).toBe('INDETERMINATE');
  });
});

describe('Kleene three-valued logic', () => {
  const T: Condition = { op: 'eq', fact: 'flag_true', value: true };
  const F: Condition = { op: 'eq', fact: 'flag_true', value: false };
  const U: Condition = { op: 'eq', fact: 'absent', value: true };
  const env = stubEnv({ flag_true: { kind: 'boolean', value: true } });

  it('all: FALSE dominates INDETERMINATE (a definitive miss resolves the conjunction)', () => {
    expect(evaluateCondition({ op: 'all', of: [F, U] }, scope, env).truth).toBe('DOES_NOT_APPLY');
    expect(evaluateCondition({ op: 'all', of: [T, U] }, scope, env).truth).toBe('INDETERMINATE');
  });

  it('any: TRUE dominates INDETERMINATE', () => {
    expect(evaluateCondition({ op: 'any', of: [T, U] }, scope, env).truth).toBe('APPLIES');
    expect(evaluateCondition({ op: 'any', of: [F, U] }, scope, env).truth).toBe('INDETERMINATE');
  });

  it('not keeps INDETERMINATE unresolved — unknown never flips to a definitive answer', () => {
    const r = evaluateCondition({ op: 'not', of: U }, scope, env);
    expect(r.truth).toBe('INDETERMINATE');
    expect(r.needs.length).toBeGreaterThan(0);
  });
});

describe('the no-silent-DOES_NOT_APPLY law', () => {
  it('a missing fact yields INDETERMINATE with a need, not a negative', () => {
    const env = stubEnv({});
    const r = evaluateCondition({ op: 'cmp', fact: 'entity.net_turnover_eur', cmp: 'gt', value: 450_000_000 }, scope, env);
    expect(r.truth).toBe('INDETERMINATE');
    expect(r.reason).toBe('missing_fact');
    expect(r.needs).toEqual([{ factType: 'entity.net_turnover_eur', scopeId: 'e1', reason: 'missing_fact' }]);
  });

  it('a catalogue miss yields INDETERMINATE(catalogue_unknown), never no-match', () => {
    const env = stubEnv({ code: { kind: 'string', value: 'NEVER_SEEN' } });
    const r = evaluateCondition({ op: 'in_catalogue', fact: 'code', catalogue: 'cat' }, scope, env);
    expect(r.truth).toBe('INDETERMINATE');
    expect(r.reason).toBe('catalogue_unknown');
  });

  it('a known catalogue negative IS a definitive no', () => {
    const env = stubEnv({ code: { kind: 'string', value: 'KNOWN_OUT' } });
    expect(evaluateCondition({ op: 'in_catalogue', fact: 'code', catalogue: 'cat' }, scope, env).truth).toBe('DOES_NOT_APPLY');
  });
});

describe('trust boundary: unconfirmed facts are invisible to the evaluator', () => {
  it('an extracted-but-unconfirmed fact behaves as missing', () => {
    const pack = miniPack();
    const p = new ProfileBuilder().entity('e1', 'TestCo');
    p.fact('e1', 'test.flag', { kind: 'boolean', value: true }, /* confirmed */ false);
    const result = assess(pack, p.build(), ctx('2027-01-01', '2027-12-31', 'e1'));
    expect(result.determinations[0]!.result).toBe('INDETERMINATE');
    expect(result.determinations[0]!.reason).toBe('missing_fact');
  });
});

describe('legal-status gate: pending acts never instantiate obligations', () => {
  it('an adopted_not_effective requirement can APPLY but produces no obligation', () => {
    const pack = miniPack('adopted_not_effective');
    const p = new ProfileBuilder().entity('e1', 'TestCo').bool('e1', 'test.flag', true);
    const result = assess(pack, p.build(), ctx('2027-01-01', '2027-12-31', 'e1'));
    expect(result.determinations[0]!.result).toBe('APPLIES');
    expect(result.obligations).toHaveLength(0); // the product law
  });

  it('the same requirement in force DOES instantiate the obligation', () => {
    const pack = miniPack('in_force');
    const p = new ProfileBuilder().entity('e1', 'TestCo').bool('e1', 'test.flag', true);
    const result = assess(pack, p.build(), ctx('2027-01-01', '2027-12-31', 'e1'));
    expect(result.obligations).toHaveLength(1);
  });
});

function miniPack(legalStatus: 'in_force' | 'adopted_not_effective' = 'in_force'): KnowledgePack {
  return {
    id: 'mini',
    version: '0.0.1',
    program: 'TEST',
    legalSnapshot: '2026-07-26',
    packFlags: {},
    sources: [
      {
        id: 'SRC-T',
        title: 'Test source',
        legalType: 'test',
        statusAtSnapshot: 'in force',
        usedFor: 'test',
        url: 'https://example.org',
      },
    ],
    factTypes: [
      { id: 'test.flag', scopeType: 'legal_entity', dataType: 'boolean', module: 'test', reusableAcrossPrograms: 'yes' },
    ],
    requirements: [
      {
        id: 'T-001',
        version: 1,
        title: 'Test requirement',
        program: 'TEST',
        decisionArea: 'Test',
        plainEnglish: 'test',
        scopeType: 'legal_entity',
        relationshipClass: 'direct_legal',
        severity: 'high',
        kind: 'boolean',
        condition: { op: 'eq', fact: 'test.flag', value: true },
        legalStatus,
        ratification: { status: 'draft' },
        sources: ['SRC-T'],
      },
    ],
    obligationTemplates: [
      {
        id: 'OT-001',
        obligation: 'Do the thing',
        actor: 'Entity',
        trigger: { allOf: ['T-001'] },
        defaultOwnerRole: 'Owner',
        deadlineLogic: 'ASAP',
        evidenceExpectation: 'Proof',
        completionCriterion: 'Done',
      },
    ],
    gapTests: [],
    questions: [],
    catalogues: {},
    changeWatch: [],
  };
}
