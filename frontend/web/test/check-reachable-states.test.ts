/**
 * The reachable (line kind, state) pairs, held to what the checker actually
 * shows (DP1 plan, Task 5; the user's instruction of 2026-10-25).
 *
 * **Why this file exists.** Task 5 words every state a cell can show, and it
 * reads which states each line kind can show from `reachableCellStates`. Two
 * defects would pass quietly. A pair the checker shows but the export omits
 * leaves a cell with no words. A pair the export declares but the checker never
 * shows (for example an exemption "available", which needs facts the checker
 * never asks) asks for words nobody will see, and hides the fact that the
 * export is a hand list. So the export is compared, in both directions, with
 * the pairs actually observed: over the 40 authored cases through
 * `buildCheckTimeline`, and over every reachable flow through Task 4's own
 * enumeration and memoised engine (no second enumeration). Every failure names
 * the pair and its direction.
 *
 * The restriction rule that keeps the unreachable APPLIES results out is
 * tested on its own: its positive control (S-017 reaches APPLIES and stays),
 * its input (the facts the checker can set, from `buildCheckProfile`), and its
 * premise, read from the engine itself: every operator that reads a fact gives
 * INDETERMINATE when that fact is absent.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateCondition, type EvalEnv } from '../../../backend/engine/src/condition/evaluate';
import type { Condition, KnowledgePack, ScopeObject } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';
import { checkerAnswersSchema } from '@/lib/check-answers';
import { LINE_KINDS } from '@/lib/check-routes';
import {
  buildCheckTimeline,
  CELL_STATES,
  checkerFactTypes,
  evaluateForGuard,
  guardContext,
  guardCountries,
  reachableCellStates,
  reachableFlows,
  reachableResults,
} from '@/lib/check-timeline';

interface CasesFile {
  assessmentDate: string;
  cases: { id: string; answers: Record<string, unknown> }[];
}

const FILE = JSON.parse(readFileSync(fileURLToPath(new URL('./checker-cases.json', import.meta.url)), 'utf8')) as CasesFile;

/** The export as `kind state` pairs. */
function exportedPairs(pack: KnowledgePack): Set<string> {
  return new Set(LINE_KINDS.flatMap((kind) => reachableCellStates(pack, kind).map((state) => `${kind} ${state}`)));
}

/** Every disagreement, named by pair and direction. */
function disagreements(exported: ReadonlySet<string>, observed: ReadonlySet<string>): string[] {
  return [
    ...[...observed].filter((pair) => !exported.has(pair)).map((pair) => `${pair}: observed but not exported`),
    ...[...exported].filter((pair) => !observed.has(pair)).map((pair) => `${pair}: exported but never observed`),
  ].sort();
}

describe('reachableCellStates', () => {
  const pack = csrdPack();

  it('gives every line kind its states in CELL_STATES order, each once', () => {
    for (const kind of LINE_KINDS) {
      const states = reachableCellStates(pack, kind);
      const ordered = CELL_STATES.filter((state) => states.includes(state));
      expect([kind, [...states]]).toEqual([kind, ordered]);
    }
  });

  it('equals the pairs the 40 authored cases show through buildCheckTimeline, in both directions', () => {
    expect(FILE.cases).toHaveLength(40);
    const observed = new Set<string>();
    for (const c of FILE.cases) {
      const timeline = buildCheckTimeline(pack, checkerAnswersSchema.parse(c.answers), FILE.assessmentDate);
      for (const route of timeline.routes) for (const line of route.lines) for (const cell of line.cells) observed.add(`${line.kind} ${cell.state}`);
    }
    expect(disagreements(exportedPairs(pack), observed)).toEqual([]);
  });

  it(
    'equals the pairs observed over every reachable flow, through Task 4’s enumeration and memoised engine, in both directions',
    () => {
      const started = performance.now();
      const ctx = guardContext(pack);
      const rejected = { count: 0 };
      const observed = new Set<string>();
      let flows = 0;
      for (const { answers } of reachableFlows(ctx, guardCountries(pack), rejected)) {
        flows += 1;
        const evaluation = evaluateForGuard(ctx, answers);
        const kindOf = new Map(evaluation.lines.map((line) => [`${line.row} ${line.requirement}`, line.kind]));
        for (const [key, state] of evaluation.display) {
          const kind = kindOf.get(key.slice(0, key.lastIndexOf(' ')));
          if (kind === undefined) throw new Error(`no line for displayed cell ${key}`);
          observed.add(`${kind} ${state}`);
        }
      }
      const seconds = (performance.now() - started) / 1000;
      console.log(`reachable sweep: ${flows} flows, ${ctx.engine.stats.runs} engine runs, ${seconds.toFixed(1)} s; observed ${[...observed].sort().join(', ')}`);
      expect(rejected.count).toBe(0);
      expect(flows).toBeGreaterThan(100_000);
      expect(disagreements(exportedPairs(pack), observed)).toEqual([]);
    },
    1_800_000,
  );
});

describe('the restriction rule: a requirement cannot be APPLIES when its condition cannot be TRUE while every fact the checker never sets is absent', () => {
  const pack = csrdPack();

  it('positive control: S-017, which reaches APPLIES, is not restricted, and first_application keeps applies', () => {
    expect(reachableResults(pack, 'CSRD-S-017')).toContain('APPLIES');
    expect(reachableCellStates(pack, 'first_application')).toContain('applies');
  });

  it('S-005, S-006, S-019 and S-008 cannot be APPLIES: each needs a fact the checker never sets', () => {
    const restricted = ['CSRD-S-005', 'CSRD-S-006', 'CSRD-S-019', 'CSRD-S-008'].map((id) => [id, reachableResults(pack, id).includes('APPLIES')]);
    expect(restricted).toEqual([
      ['CSRD-S-005', false],
      ['CSRD-S-006', false],
      ['CSRD-S-019', false],
      ['CSRD-S-008', false],
    ]);
    // The rule restricts APPLIES only: the other two results stay.
    for (const id of ['CSRD-S-005', 'CSRD-S-008']) expect([id, [...reachableResults(pack, id)]]).toEqual([id, ['DOES_NOT_APPLY', 'INDETERMINATE']]);
  });

  it('its input comes from buildCheckProfile over the reachable answers: the figures, the group answers and C-7’s fact are set; the parent report’s standard, the subsidiary’s EU turnover and the governing Member State are not', () => {
    const facts = checkerFactTypes(pack);
    const probe = (factType: string) => [factType, facts.has(factType)];
    expect(['entity.avg_employees', 'group.consolidated_net_turnover_eur', 'entity.is_subsidiary', 'parent.report_includes_entity', 'third_country.eu_turnover_year_1_eur'].map(probe)).toEqual([
      ['entity.avg_employees', true],
      ['group.consolidated_net_turnover_eur', true],
      ['entity.is_subsidiary', true],
      ['parent.report_includes_entity', true],
      ['third_country.eu_turnover_year_1_eur', true],
    ]);
    expect(['parent.report_standard', 'third_country.eu_subsidiary_turnover_eur', 'entity.governing_member_state', 'entity.is_large_undertaking'].map(probe)).toEqual([
      ['parent.report_standard', false],
      ['third_country.eu_subsidiary_turnover_eur', false],
      ['entity.governing_member_state', false],
      ['entity.is_large_undertaking', false],
    ]);
  });

  it('its premise, from the engine: every operator that reads a fact gives INDETERMINATE when the fact is absent; the two that range over descendants give a definite result over none', () => {
    const scope: ScopeObject = { id: 'e1', type: 'legal_entity', name: 'Your entity' };
    const env: EvalEnv = {
      ctx: { assessmentDate: '2026-10-25', financialYear: { start: '2027-01-01', end: '2027-12-31' }, subjectId: 'e1' },
      resolveFact: (_factType, at) => ({ present: false, scopeId: at.id, missingReason: 'missing_fact' }),
      resolveRequirementRef: () => ({ result: 'INDETERMINATE', needs: [] }),
      descendantsOfType: () => [],
      catalogue: () => ({ entries: { DE: true }, missReason: 'catalogue_unknown' }),
      packFlag: () => true,
    };
    const absent: Condition[] = [
      { op: 'cmp', fact: 'x', cmp: 'gt', value: 1 },
      { op: 'eq', fact: 'x', value: true },
      { op: 'in_set', fact: 'x', set: ['a'] },
      { op: 'in_catalogue', fact: 'x', catalogue: 'c' },
      { op: 'prefix_in', fact: 'x', prefixes: ['a'] },
      { op: 'exists', fact: 'x' },
      { op: 'count_cmp', fact: 'x', cmp: 'gt', value: 1 },
      { op: 'year_diff_lt', fromFact: 'x', years: 1 },
    ];
    expect(absent.map((c) => [c.op, evaluateCondition(c, scope, env).truth])).toEqual(absent.map((c) => [c.op, 'INDETERMINATE']));
    expect(evaluateCondition({ op: 'quantifier_any', scopeType: 'legal_entity', where: { op: 'exists', fact: 'x' } }, scope, env).truth).toBe('DOES_NOT_APPLY');
    expect(evaluateCondition({ op: 'sum_cmp', scopeType: 'legal_entity', fact: 'x', cmp: 'gt', value: 1 }, scope, env).truth).toBe('DOES_NOT_APPLY');
  });

  it('fails closed: a condition operator the rule does not know is refused, never read as unable to apply', () => {
    const pack2 = structuredClone(pack);
    const target = pack2.requirements.find((r) => r.id === 'CSRD-S-008')!;
    target.condition = { op: 'mystery' } as unknown as Condition;
    expect(() => reachableResults(pack2, 'CSRD-S-008')).toThrow(/mystery/);
  });
});
