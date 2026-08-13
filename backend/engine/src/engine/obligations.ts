/**
 * Obligation instantiation: positive, in-force, requirement-level
 * determinations bind obligation templates to customer scope objects.
 *
 * PRODUCT LAWS enforced here:
 *  - No obligation from an unresolved (INDETERMINATE) determination.
 *  - No obligation from a rule that is not yet legally in force
 *    (adopted_not_effective / proposed stay in Change Watch).
 *  - One obligation per (template, scope) — the individual and consolidated
 *    routes never duplicate work (golden profile P-003).
 */

import type { Determination, KnowledgePack, ObligationInstance, Profile, Requirement } from '../types';

export function instantiateObligations(
  pack: KnowledgePack,
  reqById: Map<string, Requirement>,
  determinations: Determination[],
  _profile: Profile,
): ObligationInstance[] {
  const eligible = determinations.filter((d) => {
    if (d.result !== 'APPLIES') return false;
    const req = reqById.get(d.requirementId);
    return req !== undefined && req.legalStatus === 'in_force';
  });
  const appliesByScope = new Map<string, Set<string>>(); // scopeId -> requirement ids with APPLIES
  for (const d of eligible) {
    const set = appliesByScope.get(d.scopeId) ?? new Set<string>();
    set.add(d.requirementId);
    appliesByScope.set(d.scopeId, set);
  }

  const out: ObligationInstance[] = [];
  const seen = new Set<string>();

  for (const tpl of pack.obligationTemplates) {
    const anyOf = tpl.trigger.anyOf ?? [];
    const allOf = tpl.trigger.allOf ?? [];

    for (const [scopeId, applied] of appliesByScope) {
      const anyOk = anyOf.length === 0 || anyOf.some((r) => applied.has(r));
      const allOk = allOf.length === 0 || allOf.every((r) => applied.has(r));
      if (!(anyOk && allOk)) continue;
      if (anyOf.length === 0 && allOf.length === 0) continue; // a template must be triggered by something
      const key = `${tpl.id}::${scopeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const scopeDet = eligible.find((d) => d.scopeId === scopeId)!;
      const derivedFrom = [...applied].filter((r) => anyOf.includes(r) || allOf.includes(r));
      out.push({
        templateId: tpl.id,
        obligation: tpl.obligation,
        actor: tpl.actor,
        scopeId,
        scopeName: scopeDet.scopeName,
        defaultOwnerRole: tpl.defaultOwnerRole,
        deadlineLogic: tpl.deadlineLogic,
        evidenceExpectation: tpl.evidenceExpectation,
        completionCriterion: tpl.completionCriterion,
        derivedFrom,
      });
    }
  }
  return out;
}
