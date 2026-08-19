/**
 * POST /api/check — the free check's answer.
 *
 * Runs the real applicability engine over the real CSRD knowledge pack. There
 * is no lookup table and no model call anywhere in this path: the verdicts,
 * reason codes, obligations and citations below are whatever `assess()`
 * returned. If the engine says INDETERMINATE, the page says INDETERMINATE.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assess } from '@datastrata/engine';
import type { AssessmentContext, Determination, Profile } from '@datastrata/engine';
import { csrdPack, sourceById } from '@/lib/pack';
import { buildAssessmentInput, factLabel, REASON_COPY, type CheckerAnswers } from '@/lib/checker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const answersSchema = z.object({
  country: z.string().max(4).optional(),
  legalForm: z.string().max(64).optional(),
  financialYear: z.string().regex(/^\d{4}$/).optional(),
  groupPosition: z.enum(['standalone', 'parent', 'subsidiary', 'parent_and_subsidiary']).optional(),
  turnover: z.string().max(32).optional(),
  employees: z.string().max(32).optional(),
  reportedFy2024: z.string().max(16).optional(),
  parentReport: z.string().max(16).optional(),
  governingChoice: z.enum(['same', 'other', 'unknown']).optional(),
  governingState: z.string().max(4).optional(),
  euTurnover: z.enum(['both', 'one', 'neither', 'unknown']).optional(),
});

export async function POST(request: Request) {
  let answers: CheckerAnswers;
  try {
    answers = answersSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Malformed check answers.' }, { status: 400 });
  }

  const pack = csrdPack();
  // The engine never reads the clock — the assessment date is an input, and it
  // is echoed back so the result is reproducible.
  const assessmentDate = new Date().toISOString().slice(0, 10);
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

  return NextResponse.json({
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
  });
}
