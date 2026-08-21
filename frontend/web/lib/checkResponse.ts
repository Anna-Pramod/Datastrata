/**
 * The check's answer as a value, so it can be fenced by a recorded golden.
 *
 * This lives apart from the route for two reasons. It takes the assessment date
 * as an argument rather than reading the clock, so the same answers produce the
 * same payload today and next year — a payload that drifts on its own cannot be
 * held to a golden. And it stays clear of `next/server`, so the customer-visible
 * result can be built and compared without standing up Next's runtime.
 *
 * The payload shape below is written out rather than inferred: a field dropped
 * from the object is then a compile error instead of a silent omission from
 * every customer's result.
 */

import { assess } from '@datastrata/engine';
import type {
  AssessmentContext,
  Determination,
  KnowledgePack,
  Profile,
  ReasonCode,
  RelationshipClass,
  Severity,
  Truth,
} from '@datastrata/engine';
import { sourceById } from '@/lib/pack';
import { buildAssessmentInput, factLabel, REASON_COPY, type CheckerAnswers } from '@/lib/checker';

/** A citation reduced to what the page prints. */
export interface CheckSource {
  id: string;
  title: string;
  url: string;
}

/** A fact the engine wants, in the customer's words. */
export interface CheckNeed {
  factType: string;
  label: string;
}

export interface CheckDetermination {
  id: string;
  title: string;
  decisionArea: string;
  result: Truth;
  selected?: string;
  reason?: ReasonCode;
  reasonCopy?: string;
  severity: Severity;
  relationshipClass: RelationshipClass;
  needs: CheckNeed[];
  sources: CheckSource[];
  provisions?: string;
  caution?: string;
}

export interface CheckObligation {
  id: string;
  obligation: string;
  actor: string;
  ownerRole: string;
  deadlineLogic: string;
  evidenceExpectation: string;
  derivedFrom: string[];
}

export interface CheckGap {
  id: string;
  test: string;
  priority: Severity;
  firstAction: string;
  consequence: string;
}

export interface CheckNextQuestion {
  id: string;
  text: string;
  whyAsked: string;
  unblocks: number;
}

export interface CheckResponse {
  assessedAt: string;
  financialYear: { start: string; end: string };
  pack: { id: string; version: string; legalSnapshot: string; program: string };
  containsDraftContent: boolean;
  headline: string;
  nationalLawResolved: boolean;
  counts: { applies: number; doesNotApply: number; indeterminate: number };
  determinations: CheckDetermination[];
  obligations: CheckObligation[];
  gaps: CheckGap[];
  nextQuestions: CheckNextQuestion[];
}

/**
 * The caller supplies the clock. Nothing below reads it.
 */
export function buildCheckResponse(
  pack: KnowledgePack,
  answers: CheckerAnswers,
  assessmentDate: string,
): CheckResponse {
  const input = buildAssessmentInput(answers, assessmentDate);
  const result = assess(pack, input.profile as Profile, input.context as AssessmentContext);

  // One entity in the check's scope graph, so first match per requirement is it.
  const seen = new Set<string>();
  const determinations = result.determinations
    .filter((d) => (seen.has(d.requirementId) ? false : (seen.add(d.requirementId), true)))
    .map((d: Determination) => ({
      id: d.requirementId,
      title: d.requirementTitle,
      decisionArea: d.decisionArea,
      result: d.result,
      selected: d.selected,
      reason: d.reason,
      reasonCopy: d.reason ? REASON_COPY[d.reason] ?? d.reason : undefined,
      severity: d.severity,
      relationshipClass: d.relationshipClass,
      needs: d.needs.map((n) => ({ factType: n.factType, label: factLabel(n.factType) })),
      sources: d.sources.map((s) => sourceById(pack, s)),
      provisions: d.provisions,
      caution: d.caution,
    }));

  return {
    assessedAt: assessmentDate,
    financialYear: result.context.financialYear,
    pack: { id: pack.id, version: pack.version, legalSnapshot: pack.legalSnapshot, program: pack.program },
    containsDraftContent: result.containsDraftContent,
    headline: result.summary.headline,
    nationalLawResolved: result.summary.nationalLawResolved,
    counts: {
      applies: determinations.filter((d) => d.result === 'APPLIES').length,
      doesNotApply: determinations.filter((d) => d.result === 'DOES_NOT_APPLY').length,
      indeterminate: determinations.filter((d) => d.result === 'INDETERMINATE').length,
    },
    determinations,
    obligations: result.obligations.map((o) => ({
      id: o.templateId,
      obligation: o.obligation,
      actor: o.actor,
      ownerRole: o.defaultOwnerRole,
      deadlineLogic: o.deadlineLogic,
      evidenceExpectation: o.evidenceExpectation,
      derivedFrom: o.derivedFrom,
    })),
    gaps: result.gaps
      .filter((g) => g.status !== 'satisfied')
      .map((g) => ({ id: g.gapId, test: g.readinessTest, priority: g.priority, firstAction: g.firstAction, consequence: g.consequence })),
    nextQuestions: result.nextQuestions.slice(0, 4).map((q) => ({
      id: q.question.id,
      text: q.question.text,
      whyAsked: q.question.whyAsked,
      unblocks: q.blockedDeterminations.length,
    })),
  };
}
