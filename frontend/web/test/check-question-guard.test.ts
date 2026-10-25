/**
 * The question guard: every conditional question is shown only where it can
 * change a result, and hidden only where hiding it leaves nothing definitive
 * that its answer could reverse (laws 16 and 3; proposal §3, P-e; DG-19
 * option B).
 *
 * **Why this file exists.** A question shown where no answer to it matters
 * costs the visitor time for nothing; a question hidden where its answer
 * matters, with a default standing in for it, tells the visitor something the
 * law does not. Neither throws. The guard checks both directions for C-6, C-7,
 * C-8 and C-9 with C-10, in **each** reachable combination of the other
 * answers: a check over all combinations at once would pass a question that
 * matters somewhere and is shown everywhere (plan Task 4).
 *
 * The parts are tested here on their own first (failure mode 4), each beside
 * the case that must fail it: the genuine-change rule, which compares engine
 * results and never displayed cells (T4f4); a shown question with no genuine
 * change (T4f's shape); a hidden question whose mapping gives its fact a
 * default (T4f2's shape); the C-7 rule in both directions; the `not_checked`
 * rule in both directions.
 *
 * **The two reductions the guard relies on are proven here, before it runs.**
 * The full answer space is millions of combinations, so the guard shares work
 * in two ways, and each is a claim this file tests rather than assumes:
 *
 * 1. **The EU Member States as one class** (the parent's brief). Every condition
 *    reading a country the checker sets reads it through a catalogue, and all
 *    27 codes sit identically in every catalogue; then every code is shown to
 *    give identical determinations and identical questions over a covering set.
 * 2. **An engine result depends only on the facts its requirement reads.** The
 *    guard remembers each requirement's result by the year and the facts its
 *    condition reads, directly or through the requirements it references. The
 *    remembered results are shown to equal `assess` called directly, and every
 *    fact the engine's own trace says it read is shown to lie in that set.
 *
 * Every other answer is enumerated in full: every band, every typed figure at
 * each threshold and one unit either side, "Not sure", every listed and
 * every typed non-EU country.
 */

import { describe, expect, it } from 'vitest';
import { assess } from '@datastrata/engine';
import type { Determination, Profile, ReasonCode, Truth } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';
import {
  buildCheckProfile,
  CHECK_ENTITY_ID,
  checkerAnswersSchema,
  EU_COUNTRY_CODES,
  visibleQuestions,
  type CheckerAnswers,
} from '@/lib/check-answers';
import {
  c7RuleProblem,
  CHECK_START_YEARS,
  countryClasses,
  evaluateForGuard,
  genuineChange,
  guardContext,
  guardFigureAnswers,
  hiddenProblem,
  memoisedEngine,
  notCheckedRuleProblem,
  questionGuardReport,
  requirementReadSet,
  shownProblem,
  type EngineOutcome,
  type GuardEvaluation,
} from '@/lib/check-timeline';
import { CHECK_ROWS } from '@/lib/check-routes';

const DATE = '2026-10-24';
const accepted = (raw: Record<string, unknown>): CheckerAnswers => checkerAnswersSchema.parse(raw);

// ---------------------------------------------------------------------------
// The genuine-change rule, directly (plan Task 4; DG-19; teeth T4f4)
// ---------------------------------------------------------------------------

const outcome = (result: Truth, reason?: ReasonCode): EngineOutcome => ({ result, reason, needs: [] });

function evaluation(engine: Record<number, Record<string, EngineOutcome>>, display: Record<string, string>): GuardEvaluation {
  return {
    lines: [
      { row: 'individual', kind: 'first_application', requirement: 'CSRD-S-017' },
      { row: 'individual', kind: 'duty', requirement: 'CSRD-S-020' },
      { row: 'exemption', kind: 'exemption', requirement: 'CSRD-S-005', relieves: 'CSRD-S-017' },
    ],
    engine: new Map(Object.entries(engine).map(([year, results]) => [Number(year), new Map(Object.entries(results))])),
    display: new Map(Object.entries(display)),
  };
}

const ENGINE_SAME = {
  2025: { 'CSRD-S-017': outcome('DOES_NOT_APPLY'), 'CSRD-S-020': outcome('DOES_NOT_APPLY'), 'CSRD-S-005': outcome('INDETERMINATE', 'missing_fact') },
  2026: { 'CSRD-S-017': outcome('DOES_NOT_APPLY'), 'CSRD-S-020': outcome('DOES_NOT_APPLY'), 'CSRD-S-005': outcome('INDETERMINATE', 'missing_fact') },
  2027: { 'CSRD-S-017': outcome('APPLIES'), 'CSRD-S-020': outcome('INDETERMINATE', 'upstream_indeterminate'), 'CSRD-S-005': outcome('INDETERMINATE', 'missing_fact') },
  2028: { 'CSRD-S-017': outcome('APPLIES'), 'CSRD-S-020': outcome('INDETERMINATE', 'upstream_indeterminate'), 'CSRD-S-005': outcome('INDETERMINATE', 'missing_fact') },
};
const shownAs = (exemption: string) =>
  Object.fromEntries(CHECK_START_YEARS.map((y) => [`exemption CSRD-S-005 ${y}`, exemption]));

describe('the genuine-change rule, directly', () => {
  it('identical engine results whose displayed lines differ only by not_checked are no change', () => {
    const a = evaluation(ENGINE_SAME, shownAs('not_checked'));
    const b = evaluation(ENGINE_SAME, shownAs('cannot_decide'));
    // The display really does differ: the rule must not look at it.
    expect(a.display).not.toEqual(b.display);
    expect(genuineChange(a, b)).toBe(false);
  });

  it('positive control: the same pair with one relevant engine result different is a change', () => {
    const changed = structuredClone(ENGINE_SAME);
    changed[2027]['CSRD-S-020'] = outcome('APPLIES');
    expect(genuineChange(evaluation(ENGINE_SAME, shownAs('not_checked')), evaluation(changed, shownAs('not_checked')))).toBe(true);
  });

  it('a different reason is a different engine result', () => {
    const changed = structuredClone(ENGINE_SAME);
    changed[2028]['CSRD-S-020'] = outcome('INDETERMINATE', 'missing_fact');
    expect(genuineChange(evaluation(ENGINE_SAME, {}), evaluation(changed, {}))).toBe(true);
  });

  it('an exemption that changes only in a year its relieved route does not apply is no change; in a year it may apply, it is', () => {
    const in2025 = structuredClone(ENGINE_SAME);
    in2025[2025]['CSRD-S-005'] = outcome('DOES_NOT_APPLY');
    expect(genuineChange(evaluation(ENGINE_SAME, {}), evaluation(in2025, {}))).toBe(false);
    const in2027 = structuredClone(ENGINE_SAME);
    in2027[2027]['CSRD-S-005'] = outcome('DOES_NOT_APPLY');
    expect(genuineChange(evaluation(ENGINE_SAME, {}), evaluation(in2027, {}))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Each check, provoked alone on one combination (failure mode 4)
// ---------------------------------------------------------------------------

describe('each check of the guard, on one combination', () => {
  const ctx = guardContext(csrdPack());

  it('shown: C-6 for an EU company with 450 or fewer employees makes no genuine change, and the problem names C-6 and the combination (T4f’s shape)', () => {
    const others = accepted({ country: 'DE', group: 'none', organisation: 'private_limited', employees: '450_or_fewer', turnover: 'up_to_400m' });
    const problem = shownProblem(ctx, 'C-6', others);
    expect(problem).toContain('C-6');
    expect(problem).toContain('"employees":"450_or_fewer"');
    // Positive control: with more than 1,100 employees, C-6 changes the 2025 first-wave line.
    expect(shownProblem(ctx, 'C-6', accepted({ country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'up_to_400m' }))).toBeNull();
  });

  it('shown: C-7 for an owned company below both thresholds makes no relevant change, though S-005 and S-006 move (T4f3’s shape); above them, it does', () => {
    const small = accepted({ country: 'DE', group: 'owned', organisation: 'private_limited', employees: '450_or_fewer', turnover: 'up_to_400m' });
    const atNo = evaluateForGuard(ctx, { ...small, parentReport: 'no' });
    const atYes = evaluateForGuard(ctx, { ...small, parentReport: 'yes' });
    // The exemption itself moves with C-7 ...
    expect([atNo.engine.get(2027)!.get('CSRD-S-005')!.result, atYes.engine.get(2027)!.get('CSRD-S-005')!.result]).toEqual(['DOES_NOT_APPLY', 'INDETERMINATE']);
    // ... but the route it relieves does not apply in any year, so the move is not relevant.
    expect(CHECK_START_YEARS.map((y) => atNo.engine.get(y)!.get('CSRD-S-017')!.result)).toEqual(['DOES_NOT_APPLY', 'DOES_NOT_APPLY', 'DOES_NOT_APPLY', 'DOES_NOT_APPLY']);
    expect(shownProblem(ctx, 'C-7', small)).toContain('C-7');
    expect(shownProblem(ctx, 'C-7', accepted({ country: 'DE', group: 'owned', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'yes' }))).toBeNull();
  });

  it('hidden: a mapping that gives the hidden C-8 a default for an EU owned company is named, with the gateway row and its 2028 column (T4f2’s shape)', () => {
    const withDefault = (a: CheckerAnswers): Profile => {
      const profile = buildCheckProfile(a);
      if (a.euTurnover !== undefined) return profile;
      const under = { kind: 'range', min: 0, max: 450_000_000 } as const;
      const fact = (factType: string) => ({ factType, scopeId: 'org1', value: under, confirmed: true, source: { kind: 'customer_statement' as const, ref: 'default' } });
      return { ...profile, facts: [...profile.facts, fact('third_country.eu_turnover_year_1_eur'), fact('third_country.eu_turnover_year_2_eur')] };
    };
    const combination = accepted({ country: 'DE', group: 'owned', organisation: 'private_limited', employees: '450_or_fewer', turnover: 'up_to_400m' });
    const problem = hiddenProblem(guardContext(csrdPack(), { profileOf: withDefault }), 'C-8', combination);
    expect(problem).toContain('C-8');
    expect(problem).toContain('art_40a_gateway');
    expect(problem).toContain('2028');
    // Positive control: the shipped mapping sets nothing for the hidden C-8, and the same combination passes.
    expect(hiddenProblem(ctx, 'C-8', combination)).toBeNull();
  });

  it('the C-7 rule: shown where the relieved route does not apply in any year is named; hidden where it may apply is named', () => {
    const small = accepted({ country: 'DE', group: 'owned', organisation: 'private_limited', employees: '450_or_fewer', turnover: 'up_to_400m' });
    const large = accepted({ country: 'DE', group: 'owned', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'no' });
    expect(c7RuleProblem(ctx, small, false)).toBeNull();
    expect(c7RuleProblem(ctx, small, true)).toContain('C-7');
    expect(c7RuleProblem(ctx, large, true)).toBeNull();
    expect(c7RuleProblem(ctx, large, false)).toContain('C-7');
  });

  it('the not_checked rule: a settled cell shown not_checked is named, and an open cell shown evaluated is named', () => {
    const fundParent = accepted({ country: 'DE', group: 'parent', organisation: 'fund', employees: 'over_1100', turnover: 'over_500m' });
    const openParent = accepted({ country: 'DE', group: 'parent', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'yes' });
    expect(notCheckedRuleProblem(ctx, fundParent)).toBeNull();
    expect(notCheckedRuleProblem(ctx, openParent)).toBeNull();
    const settledShownUnchecked = notCheckedRuleProblem(ctx, fundParent, () => 'not_checked');
    expect(settledShownUnchecked).toContain('parent_own');
    expect(settledShownUnchecked).toContain('"organisation":"fund"');
    const openShownEvaluated = notCheckedRuleProblem(ctx, openParent, () => 'cannot_decide');
    expect(openShownEvaluated).toContain('parent_own');
    expect(openShownEvaluated).toContain('not_checked');
  });
});

// ---------------------------------------------------------------------------
// The figure answers posed: written out from §4.3 and the pack's thresholds
// ---------------------------------------------------------------------------

describe('the figure answers the guard poses (plan Task 4: bands from the tables, typed figures at each threshold and one unit either side)', () => {
  it('headcount: the five bands, "Not sure", and 499, 500, 501, 999, 1,000 and 1,001; money: the three bands, "Not sure", and €450m less a cent, exactly, and plus a cent', () => {
    expect(guardFigureAnswers(csrdPack())).toEqual({
      headcount: [
        '450_or_fewer',
        'over_450_up_to_550',
        'over_550_up_to_900',
        'over_900_up_to_1100',
        'over_1100',
        'not_sure',
        { exact: 499 },
        { exact: 500 },
        { exact: 501 },
        { exact: 999 },
        { exact: 1000 },
        { exact: 1001 },
      ],
      money: ['up_to_400m', 'over_400m_up_to_500m', 'over_500m', 'not_sure', { exact: 449_999_999.99 }, { exact: 450_000_000 }, { exact: 450_000_000.01 }],
    });
  });

  it('every one of them is an answer the schema takes, for C-4, C-5, C-9 and C-10 alike', () => {
    const { headcount, money } = guardFigureAnswers(csrdPack());
    for (const employees of headcount) for (const turnover of money) {
      expect(checkerAnswersSchema.safeParse({ group: 'parent', employees, turnover, parentOwnEmployees: employees, parentOwnTurnover: turnover }).success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The reductions, proven
// ---------------------------------------------------------------------------

/** A covering set: every kind of visitor, each figure answer, and answers to hidden questions posed as the guard poses them. */
function coveringAnswers(countries: readonly Record<string, string>[]): CheckerAnswers[] {
  const groups = ['none', 'parent', 'owned', 'both', 'not_sure'] as const;
  const organisations = ['private_limited', 'public_limited', 'bank', 'insurer', 'fund', 'something_else', 'not_sure'] as const;
  const employees = ['450_or_fewer', 'over_450_up_to_550', 'over_550_up_to_900', 'over_900_up_to_1100', 'over_1100', 'not_sure', { exact: 1000 }] as const;
  const turnovers = ['up_to_400m', 'over_400m_up_to_500m', 'over_500m', 'not_sure', { exact: 450_000_000.01 }] as const;
  const yesNo = ['yes', 'no', 'not_sure', undefined] as const;
  const euTurnover = ['both', 'recent_only', 'earlier_only', 'no', 'not_sure', undefined] as const;
  const out: CheckerAnswers[] = [];
  countries.forEach((country, i) => {
    for (const group of groups) {
      for (let k = 0; k < 7; k += 1) {
        const n = i + k;
        const raw: Record<string, unknown> = {
          ...country,
          group,
          organisation: organisations[n % organisations.length],
          employees: employees[n % employees.length],
          turnover: turnovers[n % turnovers.length],
          pie: yesNo[n % yesNo.length],
          parentReport: yesNo[(n + 1) % yesNo.length],
          euTurnover: euTurnover[n % euTurnover.length],
        };
        if (group === 'parent' || group === 'both') {
          raw.parentOwnEmployees = employees[(n + 2) % employees.length];
          raw.parentOwnTurnover = turnovers[(n + 3) % turnovers.length];
        }
        out.push(accepted(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined))));
        if (group === 'parent' || group === 'both') {
          const { parentOwnEmployees: _e, parentOwnTurnover: _t, ...withoutOwn } = raw;
          out.push(accepted(Object.fromEntries(Object.entries(withoutOwn).filter(([, v]) => v !== undefined))));
        }
      }
    }
  });
  return out;
}

const projection = (d: Determination) => `${d.requirementId}@${d.scopeId}: ${d.result} ${d.reason ?? '-'} ${JSON.stringify(d.needs)}`;
const run = (profile: Profile, year: number) =>
  assess(csrdPack(), profile, { assessmentDate: DATE, financialYear: { start: `${year}-01-01`, end: `${year}-12-31` }, subjectId: CHECK_ENTITY_ID }).determinations;

describe('reduction 1: the 27 Member States are one class', () => {
  it('the premise, from the pack: every condition reading a country the checker sets reads it through a catalogue, and every Member State sits identically in every catalogue', () => {
    const classes = countryClasses(csrdPack());
    expect(classes.premise).toEqual([]);
    expect(classes.eu).toEqual([[...EU_COUNTRY_CODES]]);
  });

  it('the conclusion, over a covering set: every Member State gives DE’s determinations, every requirement, every start year', () => {
    const differences: string[] = [];
    let compared = 0;
    const covering = coveringAnswers([{ country: 'DE' }]);
    for (const answers of covering) {
      const reference = new Map(CHECK_START_YEARS.map((y) => [y, run(buildCheckProfile(answers), y).map(projection)]));
      for (const code of EU_COUNTRY_CODES) {
        const other = { ...answers, country: code } as CheckerAnswers;
        for (const year of CHECK_START_YEARS) {
          compared += 1;
          const got = run(buildCheckProfile(other), year).map(projection);
          if (JSON.stringify(got) !== JSON.stringify(reference.get(year))) differences.push(`${code} ${year} ${JSON.stringify(answers)}`);
        }
      }
    }
    expect(differences).toEqual([]);
    // Every Member State, every start year, every covering answer set was compared.
    expect(covering.length).toBeGreaterThan(40);
    expect(compared).toBe(covering.length * 27 * 4);
  });

  it('the conclusion, over the same set: every Member State is shown DE’s questions', () => {
    const differences: string[] = [];
    for (const answers of coveringAnswers([{ country: 'DE' }])) {
      const reference = JSON.stringify(visibleQuestions(answers));
      for (const code of EU_COUNTRY_CODES) {
        if (JSON.stringify(visibleQuestions({ ...answers, country: code } as CheckerAnswers)) !== reference) differences.push(`${code} ${JSON.stringify(answers)}`);
      }
    }
    expect(differences).toEqual([]);
  });

  it('positive control: a pack in which one Member State sits apart splits the class, so the reduction would not hide it', () => {
    const pack = structuredClone(csrdPack());
    pack.catalogues.ratified_country_packs!.entries.DE = true;
    const classes = countryClasses(pack);
    expect(classes.eu.length).toBe(2);
    expect(classes.eu).toContainEqual(['DE']);
  });

  it('positive control: a condition reading the country other than through a catalogue voids the premise', () => {
    const pack = structuredClone(csrdPack());
    const s001 = pack.requirements.find((r) => r.id === 'CSRD-S-001')!;
    s001.condition = { op: 'all', of: [{ op: 'eq', fact: 'entity.incorporation_country', value: 'DE' }, s001.condition!] };
    const classes = countryClasses(pack);
    expect(classes.premise.join('\n')).toContain('CSRD-S-001');
    expect(classes.eu).toEqual(EU_COUNTRY_CODES.map((code) => [code]));
  });
});

/** Every requirement on a line, and every route an exemption relieves. */
const LINE_REQUIREMENTS = [...new Set(CHECK_ROWS.flatMap((row) => row.lines.flatMap((line) => [line.requirement, ...(line.relieves === undefined ? [] : [line.relieves])])))];

describe('reduction 2: a remembered engine result is the engine’s result', () => {
  const countries: Record<string, string>[] = [{ country: 'DE' }, { country: 'US' }, { country: 'other', countryOther: 'AR' }, { country: 'other', countryOther: 'IL' }, { country: 'not_sure' }];

  it('the remembered outcome equals assess called directly, for every line requirement, every start year and every covering answer set', () => {
    const engine = memoisedEngine(csrdPack(), DATE);
    const differences: string[] = [];
    let compared = 0;
    for (const answers of coveringAnswers(countries)) {
      const profile = buildCheckProfile(answers);
      for (const year of CHECK_START_YEARS) {
        const direct = run(profile, year);
        for (const id of LINE_REQUIREMENTS) {
          const d = direct.find((x) => x.requirementId === id)!;
          const want = { result: d.result, reason: d.reason, needs: d.needs };
          const got = engine.outcome(profile, year, id);
          compared += 1;
          if (JSON.stringify({ result: got.result, reason: got.reason, needs: got.needs }) !== JSON.stringify(want)) differences.push(`${id} ${year} ${JSON.stringify(answers)}`);
        }
      }
    }
    expect(differences).toEqual([]);
    expect(compared).toBeGreaterThan(5_000);
    // Positive control: the memory was used, so the comparison above tested remembered results and not only fresh runs.
    expect(engine.stats.hits).toBeGreaterThan(0);
    expect(engine.stats.runs).toBeGreaterThan(0);
  });

  it('every fact the engine’s own trace and needs say a requirement read lies in that requirement’s read set', () => {
    const pack = csrdPack();
    const outside: string[] = [];
    let seen = 0;
    const factsUsed = (node: Determination['trace']): string[] => [
      ...(node.factsUsed ?? []).map((f) => f.factType),
      ...(node.children ?? []).flatMap(factsUsed),
    ];
    for (const answers of coveringAnswers(countries)) {
      for (const year of CHECK_START_YEARS) {
        for (const d of run(buildCheckProfile(answers), year)) {
          if (!LINE_REQUIREMENTS.includes(d.requirementId)) continue;
          const reads = requirementReadSet(pack, d.requirementId);
          for (const fact of [...factsUsed(d.trace), ...d.needs.map((n) => n.factType)]) {
            seen += 1;
            if (!reads.has(fact)) outside.push(`${d.requirementId} read ${fact}`);
          }
        }
      }
    }
    expect([...new Set(outside)]).toEqual([]);
    expect(seen).toBeGreaterThan(1_000);
  });

  it('the read set follows references: the duty reads the figures behind its first application and the parent’s report behind its exemptions', () => {
    const reads = requirementReadSet(csrdPack(), 'CSRD-S-020');
    expect(reads.has('entity.avg_employees')).toBe(true);
    expect(reads.has('entity.net_turnover_eur')).toBe(true);
    expect(reads.has('parent.report_includes_entity')).toBe(true);
    // Counterexample: the group's figures are not the company's duty's.
    expect(reads.has('group.avg_employees')).toBe(false);
  });

  it('positive control: a fact inside the read set moves the remembered result; one outside it does not', () => {
    const engine = memoisedEngine(csrdPack(), DATE);
    const base = accepted({ country: 'DE', group: 'none', organisation: 'private_limited', employees: 'over_1100', turnover: 'over_500m', pie: 'yes' });
    const at = (a: CheckerAnswers) => engine.outcome(buildCheckProfile(a), 2027, 'CSRD-S-017').result;
    expect(at(base)).toBe('APPLIES');
    expect(at({ ...base, employees: '450_or_fewer' })).toBe('DOES_NOT_APPLY');
    expect(at({ ...base, euTurnover: 'no' })).toBe('APPLIES');
  });
});

// ---------------------------------------------------------------------------
// The guard over the real pack
// ---------------------------------------------------------------------------

describe('the question guard over the real pack', () => {
  it(
    'finds no question shown where it changes nothing, none hidden where it could reverse a definitive cell, and the C-7 and not_checked rules hold in both directions',
    () => {
      const started = performance.now();
      const report = questionGuardReport(csrdPack());
      const seconds = (performance.now() - started) / 1000;
      console.log(`question guard: ${seconds.toFixed(1)} s, ${JSON.stringify(report.counts)}`);
      expect(report.problems).toEqual([]);
      // Positive controls (failure mode 7): every check ran over real combinations.
      for (const question of ['C-6', 'C-7', 'C-8', 'C-9+C-10'] as const) {
        expect([question, report.counts.shown[question] > 0, report.counts.hidden[question] > 0]).toEqual([question, true, true]);
      }
      expect(report.counts.c7Rule).toBeGreaterThan(0);
      expect(report.counts.notCheckedRule).toBeGreaterThan(0);
      expect(report.counts.flows).toBeGreaterThan(100_000);
    },
    1_800_000,
  );
});
