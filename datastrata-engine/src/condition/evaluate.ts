/**
 * Three-valued evaluator for the closed condition language.
 *
 * Semantics (Kleene logic):
 *  - all: FALSE if any child FALSE; else INDETERMINATE if any child INDETERMINATE; else TRUE
 *  - any: TRUE if any child TRUE; else INDETERMINATE if any child INDETERMINATE; else FALSE
 *  - not: swaps TRUE/FALSE; INDETERMINATE stays INDETERMINATE
 *
 * Range-safe comparisons (Pass 3 §7.2): a range value that straddles a legal
 * threshold yields INDETERMINATE(range_crosses_threshold) — never a guess.
 *
 * PRODUCT LAW: a missing fact, unknown code, or unresolved upstream result can
 * never produce DOES_NOT_APPLY on its own. Unknown propagates as INDETERMINATE
 * with a reason code. (Pack Gate A: "Fail if any unknown code, missing fact or
 * unresolved exception can silently produce Does not apply.")
 */

import type {
  AssessmentContext,
  CmpOp,
  Condition,
  FactNeed,
  FactSource,
  FactValue,
  ReasonCode,
  ScopeObject,
  ScopeType,
  TraceNode,
  Truth,
} from '../types';

export class EngineContentError extends Error {}

export interface ResolvedFact {
  present: boolean;
  value?: FactValue;
  scopeId: string;
  source?: FactSource;
  missingReason: ReasonCode;
}

export interface RefOutcome {
  result: Truth;
  reason?: ReasonCode;
  needs: FactNeed[];
}

export interface EvalEnv {
  ctx: AssessmentContext;
  /** Resolve a fact type against the scope object currently being evaluated. */
  resolveFact(factTypeId: string, scope: ScopeObject): ResolvedFact;
  /** Resolve a prior requirement determination (dependency edge). */
  resolveRequirementRef(requirementId: string, scope: ScopeObject): RefOutcome;
  /** Descendant scope objects of the given scope, of a given type. */
  descendantsOfType(scope: ScopeObject, type: ScopeType): ScopeObject[];
  catalogue(name: string): { entries: Record<string, boolean>; missReason: ReasonCode };
  packFlag(flag: string): boolean | undefined;
}

export interface Outcome {
  truth: Truth;
  reason?: ReasonCode;
  needs: FactNeed[];
  trace: TraceNode;
}

const TRUE: Truth = 'APPLIES';
const FALSE: Truth = 'DOES_NOT_APPLY';
const INDET: Truth = 'INDETERMINATE';

function out(truth: Truth, trace: TraceNode, reason?: ReasonCode, needs: FactNeed[] = []): Outcome {
  trace.truth = truth;
  if (reason) trace.reason = reason;
  return { truth, reason: truth === INDET ? reason : undefined, needs: truth === INDET ? needs : [], trace };
}

function factTrace(op: string, detail: string, rf: ResolvedFact, factType: string): TraceNode {
  return {
    op,
    detail,
    truth: INDET,
    factsUsed: rf.present && rf.value ? [{ factType, scopeId: rf.scopeId, value: rf.value, source: rf.source }] : [],
  };
}

function missing(op: string, factType: string, rf: ResolvedFact): Outcome {
  const trace = factTrace(op, `${factType}: not available (${rf.missingReason})`, rf, factType);
  return out(INDET, trace, rf.missingReason, [{ factType, scopeId: rf.scopeId, reason: rf.missingReason }]);
}

function numeric(v: FactValue, where: string): { min: number; max: number } {
  if (v.kind === 'number') return { min: v.value, max: v.value };
  if (v.kind === 'year') return { min: v.value, max: v.value };
  if (v.kind === 'range') {
    if (v.min > v.max) throw new EngineContentError(`Invalid range (min>max) at ${where}`);
    return { min: v.min, max: v.max };
  }
  throw new EngineContentError(`Expected numeric fact value at ${where}, got kind=${v.kind}`);
}

/** Range-safe threshold comparison. Returns TRUE/FALSE/INDET. */
export function cmpRange(r: { min: number; max: number }, op: CmpOp, t: number): Truth {
  switch (op) {
    case 'gt':
      if (r.min > t) return TRUE;
      if (r.max <= t) return FALSE;
      return INDET;
    case 'gte':
      if (r.min >= t) return TRUE;
      if (r.max < t) return FALSE;
      return INDET;
    case 'lt':
      if (r.max < t) return TRUE;
      if (r.min >= t) return FALSE;
      return INDET;
    case 'lte':
      if (r.max <= t) return TRUE;
      if (r.min > t) return FALSE;
      return INDET;
  }
}

function scalar(v: FactValue, where: string): string | number | boolean {
  switch (v.kind) {
    case 'string':
      return v.value;
    case 'boolean':
      return v.value;
    case 'number':
      return v.value;
    case 'year':
      return v.value;
    case 'date':
      return v.value;
    default:
      throw new EngineContentError(`Expected scalar fact value at ${where}, got kind=${v.kind}`);
  }
}

function fyStartYear(ctx: AssessmentContext): number {
  const y = Number(ctx.financialYear.start.slice(0, 4));
  if (!Number.isFinite(y)) throw new EngineContentError(`Bad financialYear.start: ${ctx.financialYear.start}`);
  return y;
}

export function evaluateCondition(cond: Condition, scope: ScopeObject, env: EvalEnv): Outcome {
  switch (cond.op) {
    case 'all':
    case 'any': {
      const children = cond.of.map((c) => evaluateCondition(c, scope, env));
      const trace: TraceNode = { op: cond.op, detail: `${cond.op} of ${cond.of.length}`, truth: INDET, children: children.map((c) => c.trace) };
      const winner: Truth = cond.op === 'all' ? FALSE : TRUE;
      if (children.some((c) => c.truth === winner)) return out(winner, trace);
      const indet = children.filter((c) => c.truth === INDET);
      if (indet.length > 0) {
        const first = indet[0]!;
        return out(INDET, trace, first.reason ?? 'missing_fact', indet.flatMap((c) => c.needs));
      }
      return out(cond.op === 'all' ? TRUE : FALSE, trace);
    }

    case 'not': {
      const child = evaluateCondition(cond.of, scope, env);
      const trace: TraceNode = { op: 'not', detail: 'not', truth: INDET, children: [child.trace] };
      if (child.truth === INDET) return out(INDET, trace, child.reason, child.needs);
      return out(child.truth === TRUE ? FALSE : TRUE, trace);
    }

    case 'cmp': {
      const rf = env.resolveFact(cond.fact, scope);
      if (!rf.present || !rf.value) return missing('cmp', cond.fact, rf);
      const r = numeric(rf.value, cond.fact);
      const truth = cmpRange(r, cond.cmp, cond.value);
      const shown = r.min === r.max ? `${r.min}` : `[${r.min}..${r.max}]`;
      const trace = factTrace('cmp', `${cond.fact} (${shown}) ${cond.cmp} ${cond.value}`, rf, cond.fact);
      if (truth === INDET)
        return out(INDET, trace, 'range_crosses_threshold', [{ factType: cond.fact, scopeId: rf.scopeId, reason: 'range_crosses_threshold' }]);
      return out(truth, trace);
    }

    case 'eq': {
      const rf = env.resolveFact(cond.fact, scope);
      if (!rf.present || !rf.value) return missing('eq', cond.fact, rf);
      const v = scalar(rf.value, cond.fact);
      const trace = factTrace('eq', `${cond.fact} (${String(v)}) == ${String(cond.value)}`, rf, cond.fact);
      return out(v === cond.value ? TRUE : FALSE, trace);
    }

    case 'in_set': {
      const rf = env.resolveFact(cond.fact, scope);
      if (!rf.present || !rf.value) return missing('in_set', cond.fact, rf);
      const v = scalar(rf.value, cond.fact);
      const trace = factTrace('in_set', `${cond.fact} (${String(v)}) in [${cond.set.length} values]`, rf, cond.fact);
      return out((cond.set as (string | number | boolean)[]).includes(v) ? TRUE : FALSE, trace);
    }

    case 'in_catalogue': {
      const rf = env.resolveFact(cond.fact, scope);
      if (!rf.present || !rf.value) return missing('in_catalogue', cond.fact, rf);
      const v = String(scalar(rf.value, cond.fact));
      const cat = env.catalogue(cond.catalogue);
      const trace = factTrace('in_catalogue', `${cond.fact} (${v}) in catalogue ${cond.catalogue}`, rf, cond.fact);
      if (!(v in cat.entries)) {
        const reason = cond.missReason ?? cat.missReason;
        // Catalogue miss NEVER silently resolves — it is an unresolved code, not a "no".
        return out(INDET, trace, reason, [{ factType: cond.fact, scopeId: rf.scopeId, reason }]);
      }
      return out(cat.entries[v] ? TRUE : FALSE, trace);
    }

    case 'prefix_in': {
      const rf = env.resolveFact(cond.fact, scope);
      if (!rf.present || !rf.value) return missing('prefix_in', cond.fact, rf);
      const v = String(scalar(rf.value, cond.fact));
      const trace = factTrace('prefix_in', `${cond.fact} (${v}) starts with any of ${cond.prefixes.join(',')}`, rf, cond.fact);
      return out(cond.prefixes.some((p) => v.startsWith(p)) ? TRUE : FALSE, trace);
    }

    case 'exists': {
      const rf = env.resolveFact(cond.fact, scope);
      const trace = factTrace('exists', `${cond.fact} exists`, rf, cond.fact);
      if (!rf.present || !rf.value) {
        // Absence of an answer is not evidence of absence of the thing.
        return out(INDET, trace, rf.missingReason, [{ factType: cond.fact, scopeId: rf.scopeId, reason: rf.missingReason }]);
      }
      if (rf.value.kind === 'string' && rf.value.value.trim() === '') return out(FALSE, trace);
      return out(TRUE, trace);
    }

    case 'count_cmp': {
      const rf = env.resolveFact(cond.fact, scope);
      if (!rf.present || !rf.value) return missing('count_cmp', cond.fact, rf);
      if (rf.value.kind !== 'list') throw new EngineContentError(`count_cmp expects list fact: ${cond.fact}`);
      const n = rf.value.values.length;
      const truth = cmpRange({ min: n, max: n }, cond.cmp, cond.value);
      const trace = factTrace('count_cmp', `count(${cond.fact}) (${n}) ${cond.cmp} ${cond.value}`, rf, cond.fact);
      return out(truth, trace);
    }

    case 'quantifier_any': {
      const objs = env.descendantsOfType(scope, cond.scopeType);
      const children = objs.map((o) => evaluateCondition(cond.where, o, env));
      const trace: TraceNode = {
        op: 'quantifier_any',
        detail: `any ${cond.scopeType} (${objs.length} evaluated) where …`,
        truth: INDET,
        children: children.map((c) => c.trace),
      };
      if (children.some((c) => c.truth === TRUE)) return out(TRUE, trace);
      const indet = children.filter((c) => c.truth === INDET);
      if (indet.length > 0) return out(INDET, trace, indet[0]!.reason ?? 'missing_fact', indet.flatMap((c) => c.needs));
      return out(FALSE, trace);
    }

    case 'sum_cmp': {
      const objs = env.descendantsOfType(scope, cond.scopeType);
      let min = 0;
      let max = 0;
      const needs: FactNeed[] = [];
      let anyMissing = false;
      const used: TraceNode['factsUsed'] = [];
      for (const o of objs) {
        const rf = env.resolveFact(cond.fact, o);
        if (!rf.present || !rf.value) {
          anyMissing = true;
          needs.push({ factType: cond.fact, scopeId: o.id, reason: rf.missingReason });
          continue;
        }
        const r = numeric(rf.value, cond.fact);
        min += r.min;
        max += r.max;
        used!.push({ factType: cond.fact, scopeId: rf.scopeId, value: rf.value, source: rf.source });
      }
      const trace: TraceNode = {
        op: 'sum_cmp',
        detail: `sum(${cond.fact} over ${cond.scopeType}) [${min}..${anyMissing ? '?' : max}] ${cond.cmp} ${cond.value}`,
        truth: INDET,
        factsUsed: used,
      };
      if (anyMissing) {
        // A partial sum can still definitively EXCEED a floor (gt/gte with known part above t).
        if ((cond.cmp === 'gt' && min > cond.value) || (cond.cmp === 'gte' && min >= cond.value)) return out(TRUE, trace);
        return out(INDET, trace, 'missing_fact', needs);
      }
      return out(cmpRange({ min, max }, cond.cmp, cond.value), trace);
    }

    case 'fy_starts_on_or_after': {
      const truth = env.ctx.financialYear.start >= cond.date ? TRUE : FALSE;
      return out(truth, { op: 'fy_starts_on_or_after', detail: `FY start ${env.ctx.financialYear.start} >= ${cond.date}`, truth });
    }

    case 'fy_start_year_in': {
      const y = fyStartYear(env.ctx);
      const truth = cond.years.includes(y) ? TRUE : FALSE;
      return out(truth, { op: 'fy_start_year_in', detail: `FY start year ${y} in [${cond.years.join(', ')}]`, truth });
    }

    case 'year_diff_lt': {
      const rf = env.resolveFact(cond.fromFact, scope);
      if (!rf.present || !rf.value) return missing('year_diff_lt', cond.fromFact, rf);
      const from = numeric(rf.value, cond.fromFact);
      const y = fyStartYear(env.ctx);
      const truth = cmpRange({ min: y - from.max, max: y - from.min }, 'lt', cond.years);
      const trace = factTrace('year_diff_lt', `FY ${y} − ${cond.fromFact} < ${cond.years}`, rf, cond.fromFact);
      if (truth === INDET)
        return out(INDET, trace, 'range_crosses_threshold', [{ factType: cond.fromFact, scopeId: rf.scopeId, reason: 'range_crosses_threshold' }]);
      return out(truth, trace);
    }

    case 'requirement_ref': {
      const ref = env.resolveRequirementRef(cond.requirement, scope);
      const trace: TraceNode = { op: 'requirement_ref', detail: `${cond.requirement} is ${ref.result} (expected ${cond.expect})`, truth: INDET };
      if (ref.result === INDET) return out(INDET, trace, 'upstream_indeterminate', ref.needs);
      return out(ref.result === cond.expect ? TRUE : FALSE, trace);
    }

    case 'pack_flag': {
      const v = env.packFlag(cond.flag);
      const trace: TraceNode = { op: 'pack_flag', detail: `pack flag ${cond.flag} = ${String(v)}`, truth: INDET };
      if (v === undefined) return out(INDET, trace, 'source_status_unresolved', []);
      return out(v ? TRUE : FALSE, trace);
    }
  }
}
