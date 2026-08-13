/**
 * Gap ledger (v0 slice): applicable obligation − accepted existing credit = gap.
 * Only runs once readiness facts start existing in the profile; an unanswered
 * readiness module produces no wall of red (Pass 2 §1 Phase 3: credit first).
 */

import type { Gap, KnowledgePack, ObligationInstance, Profile } from '../types';
import type { FactResolver } from './facts';

export function deriveGaps(pack: KnowledgePack, obligations: ObligationInstance[], resolver: FactResolver, profile: Profile): Gap[] {
  const anyReadinessFacts = profile.facts.some((f) => f.confirmed && f.factType.startsWith('readiness.'));
  if (!anyReadinessFacts) return [];

  const gaps: Gap[] = [];
  for (const ob of obligations) {
    for (const test of pack.gapTests.filter((t) => t.obligationTemplate === ob.templateId)) {
      let status: Gap['status'] = 'unknown';
      if (test.readinessFact) {
        const scope = resolver.scope(ob.scopeId);
        const rf = scope ? resolver.resolve(test.readinessFact, scope) : undefined;
        if (rf?.present && rf.value) {
          const v =
            rf.value.kind === 'boolean' ? (rf.value.value ? 'yes' : 'no') : rf.value.kind === 'string' ? rf.value.value : String(rf.value.kind);
          status = (test.satisfiedWhen ?? ['yes']).includes(v) ? 'satisfied' : 'open';
        }
      }
      gaps.push({
        gapId: test.id,
        obligationTemplateId: ob.templateId,
        scopeId: ob.scopeId,
        readinessTest: test.readinessTest,
        status,
        priority: test.priority,
        firstAction: test.firstAction,
        consequence: test.consequence,
        existingEvidenceToCredit: test.existingEvidenceToCredit,
      });
    }
  }
  return gaps;
}
