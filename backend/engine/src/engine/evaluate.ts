/**
 * The deterministic assessment runner.
 *
 * assess(pack, profile, ctx) → determinations + obligations + gaps + next
 * questions + program summary. Same inputs and pack version always produce the
 * same output (no clock reads, no randomness, no model calls).
 *
 * A requirement's verification status arrives already derived, attached by the
 * loader from the signature ledger. Nothing here asks whether anyone signed
 * anything; it reads `derivedStatus` the way it reads `severity`, which is what
 * keeps the engine ignorant of the ledger's existence.
 */

import type {
  AssessmentContext,
  AssessmentResult,
  Determination,
  KnowledgePack,
  Profile,
  Requirement,
  ScopeObject,
} from '../types';
import { EngineContentError, evaluateCondition, type EvalEnv, type Outcome, type RefOutcome } from '../condition/evaluate';
import { FactResolver } from './facts';
import { instantiateObligations } from './obligations';
import { deriveGaps } from './gaps';
import { rankNextQuestions } from './nextQuestion';
import { summarise } from './summary';
import { locatorTextsOf, sourceIdsOf } from '../knowledge/provenance';

/**
 * The lowest derived status a requirement may hold and still be evaluated.
 *
 * A distinct type from `DerivedStatus` although the members coincide: one is a
 * floor a caller chooses, the other a state a requirement is in. Collapsing
 * them would make `minStatus: 'ratified'` read as "requirements that are
 * ratified" rather than "at least ratified", which is the same wrong guess the
 * old boolean forced.
 */
export type MinStatus = 'draft' | 'verified' | 'ratified';

/** Lowest first. A requirement is included when its rank is at or above the floor. */
const STATUS_RANK: Record<MinStatus, number> = { draft: 0, verified: 1, ratified: 2 };

export interface AssessOptions {
  /**
   * The lowest derived status to evaluate. Defaults to `'draft'`, which
   * includes everything and is what makes the migration from `includeDraft`
   * bit-identical: that boolean defaulted to `true` and no caller ever passed
   * it, so the filter had never run and must not start running here.
   *
   * Customer-warranted output raises this floor, or clearly banners the
   * prototype status (the CLI does the latter). Raising it is a product
   * decision about what the surface claims, taken deliberately at the call
   * site — never a side effect of a migration.
   */
  minStatus?: MinStatus;
}

interface Memo {
  outcome: Outcome;
  selected?: string;
}

export function assess(pack: KnowledgePack, profile: Profile, ctx: AssessmentContext, opts: AssessOptions = {}): AssessmentResult {
  const floor = STATUS_RANK[opts.minStatus ?? 'draft'];
  const resolver = new FactResolver(profile, pack.factTypes);
  const requirements = pack.requirements.filter((r) => STATUS_RANK[r.derivedStatus] >= floor);
  const reqById = new Map(requirements.map((r) => [r.id, r]));

  const memo = new Map<string, Memo>();
  const inFlight = new Set<string>();

  const env: EvalEnv = {
    ctx,
    resolveFact: (factTypeId, scope) => resolver.resolve(factTypeId, scope),
    resolveRequirementRef: (requirementId, scope): RefOutcome => {
      const target = reqById.get(requirementId);
      if (!target) throw new EngineContentError(`requirement_ref to unknown requirement: ${requirementId}`);
      const refScope = resolveRefScope(target, scope);
      if (!refScope) return { result: 'INDETERMINATE', reason: 'customer_scope_ambiguity', needs: [] };
      const m = evaluateRequirement(target, refScope);
      return { result: m.outcome.truth, reason: m.outcome.reason, needs: m.outcome.needs };
    },
    descendantsOfType: (scope, type) => resolver.descendantsOfType(scope, type),
    catalogue: (name) => {
      const cat = pack.catalogues[name];
      if (!cat) throw new EngineContentError(`Unknown catalogue: ${name}`);
      return cat;
    },
    packFlag: (flag) => pack.packFlags[flag],
  };

  function resolveRefScope(target: Requirement, from: ScopeObject): ScopeObject | undefined {
    if (target.scopeType === from.type) return from;
    // Nearest ancestor of the target's scope type (entity -> organization etc.)
    let cur: ScopeObject | undefined = from;
    while (cur) {
      if (cur.type === target.scopeType) return cur;
      cur = cur.parentId ? resolver.scope(cur.parentId) : undefined;
    }
    // Fall back: unambiguous single object of that type in the profile.
    const candidates = profile.scopeObjects.filter((o) => o.type === target.scopeType);
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  function evaluateRequirement(req: Requirement, scope: ScopeObject): Memo {
    const key = `${req.id}::${scope.id}`;
    const cached = memo.get(key);
    if (cached) return cached;
    if (inFlight.has(key)) throw new EngineContentError(`Cyclic requirement_ref involving ${req.id}`);
    inFlight.add(key);
    try {
      let m: Memo;
      if (req.kind === 'selection') {
        m = evaluateSelection(req, scope);
      } else {
        if (!req.condition) throw new EngineContentError(`Boolean requirement without condition: ${req.id}`);
        m = { outcome: evaluateCondition(req.condition, scope, env) };
      }
      memo.set(key, m);
      return m;
    } finally {
      inFlight.delete(key);
    }
  }

  function evaluateSelection(req: Requirement, scope: ScopeObject): Memo {
    if (!req.cases || req.cases.length === 0) throw new EngineContentError(`Selection requirement without cases: ${req.id}`);
    const children = [] as Outcome[];
    for (const c of req.cases) {
      const o = evaluateCondition(c.when, scope, env);
      children.push(o);
      if (o.truth === 'APPLIES') {
        return {
          outcome: {
            truth: 'APPLIES',
            needs: [],
            trace: { op: 'selection', detail: `selected ${c.value}`, truth: 'APPLIES', children: children.map((x) => x.trace) },
          },
          selected: c.value,
        };
      }
      if (o.truth === 'INDETERMINATE') {
        return {
          outcome: {
            truth: 'INDETERMINATE',
            reason: o.reason,
            needs: o.needs,
            trace: { op: 'selection', detail: 'blocked before a case resolved', truth: 'INDETERMINATE', children: children.map((x) => x.trace) },
          },
        };
      }
    }
    if (req.defaultValue !== undefined) {
      return {
        outcome: {
          truth: 'APPLIES',
          needs: [],
          trace: { op: 'selection', detail: `selected default ${req.defaultValue}`, truth: 'APPLIES', children: children.map((x) => x.trace) },
        },
        selected: req.defaultValue,
      };
    }
    return {
      outcome: {
        truth: 'DOES_NOT_APPLY',
        needs: [],
        trace: { op: 'selection', detail: 'no case matched', truth: 'DOES_NOT_APPLY', children: children.map((x) => x.trace) },
      },
    };
  }

  // --- Evaluate every requirement against every matching scope object ------
  const determinations: Determination[] = [];
  for (const req of requirements) {
    const scopes = profile.scopeObjects.filter((o) => o.type === req.scopeType);
    for (const scope of scopes) {
      const m = evaluateRequirement(req, scope);
      determinations.push({
        requirementId: req.id,
        requirementTitle: req.title,
        program: req.program,
        decisionArea: req.decisionArea,
        scopeId: scope.id,
        scopeName: scope.name,
        result: m.outcome.truth,
        selected: m.selected,
        relationshipClass: req.relationshipClass,
        severity: req.severity,
        reason: m.outcome.reason,
        needs: m.outcome.needs,
        trace: m.outcome.trace,
        sources: sourceIdsOf(req),
        locators: locatorTextsOf(req),
        caution: req.caution,
        legalStatus: req.legalStatus,
        derivedStatus: req.derivedStatus,
        statusReasons: req.statusReasons,
        evaluatedAt: ctx.assessmentDate,
        packVersion: `${pack.id}@${pack.version} (legal snapshot ${pack.legalSnapshot})`,
      });
    }
  }

  const obligations = instantiateObligations(pack, reqById, determinations, profile);
  const gaps = deriveGaps(pack, obligations, resolver, profile);
  const nextQuestions = rankNextQuestions(pack, determinations, profile);
  const summary = summarise(pack, determinations);
  const containsDraftContent = determinations.some((d) => d.derivedStatus === 'draft');

  return { context: ctx, determinations, obligations, gaps, nextQuestions, summary, changeWatch: pack.changeWatch, containsDraftContent };
}

export { bestResult } from './results';
