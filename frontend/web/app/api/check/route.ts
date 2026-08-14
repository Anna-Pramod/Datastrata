/**
 * POST /api/check — the free checker's answer.
 *
 * This runs the real applicability engine over the real CSRD knowledge pack.
 * There is no lookup table and no model call: the verdicts, reason codes and
 * citations below are whatever `assess()` returned. If the engine says
 * INDETERMINATE, the page says INDETERMINATE.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assess } from '@datastrata/engine';
import type { Determination, Profile, AssessmentContext } from '@datastrata/engine';
import { csrdPack, sourceById } from '@/lib/pack';
import {
  buildAssessmentInput,
  factLabel,
  headlineRequirements,
  REASON_COPY,
  type CheckerAnswers,
} from '@/lib/checker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const answersSchema = z.object({
  country: z.string().max(4).optional(),
  legalForm: z.string().max(64).optional(),
  groupPosition: z.enum(['standalone', 'parent', 'subsidiary', 'parent_and_subsidiary']).optional(),
  turnover: z.string().max(32).optional(),
  employees: z.string().max(32).optional(),
});

export async function POST(request: Request) {
  let answers: CheckerAnswers;
  try {
    answers = answersSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Malformed checker answers.' }, { status: 400 });
  }

  const pack = csrdPack();
  // The engine never reads the clock — the assessment date is an input, and it
  // is echoed back so every result is reproducible.
  const assessmentDate = new Date().toISOString().slice(0, 10);
  const input = buildAssessmentInput(answers, assessmentDate);
  const result = assess(pack, input.profile as Profile, input.context as AssessmentContext);

  const byId = new Map<string, Determination>();
  for (const d of result.determinations) {
    // One entity in the checker's graph, so first match per requirement is it.
    if (!byId.has(d.requirementId)) byId.set(d.requirementId, d);
  }

  const results = headlineRequirements(answers)
    .map((id) => byId.get(id))
    .filter((d): d is Determination => Boolean(d))
    .map((d) => ({
      id: d.requirementId,
      title: d.requirementTitle,
      decisionArea: d.decisionArea,
      result: d.result,
      selected: d.selected,
      reason: d.reason,
      reasonCopy: d.reason ? REASON_COPY[d.reason] ?? d.reason : undefined,
      severity: d.severity,
      needs: d.needs.map((n) => ({ factType: n.factType, label: factLabel(n.factType), reason: n.reason })),
      sources: d.sources.map((s) => sourceById(pack, s)),
      provisions: d.provisions,
      caution: d.caution,
      legalStatus: d.legalStatus,
    }));

  const counts = {
    applies: result.determinations.filter((d) => d.result === 'APPLIES').length,
    doesNotApply: result.determinations.filter((d) => d.result === 'DOES_NOT_APPLY').length,
    indeterminate: result.determinations.filter((d) => d.result === 'INDETERMINATE').length,
  };

  return NextResponse.json({
    assessedAt: assessmentDate,
    financialYear: result.context.financialYear,
    pack: { id: pack.id, version: pack.version, legalSnapshot: pack.legalSnapshot, program: pack.program },
    containsDraftContent: result.containsDraftContent,
    headline: result.summary.headline,
    statusFlags: result.summary.statusFlags,
    nationalLawResolved: result.summary.nationalLawResolved,
    counts,
    results,
    obligations: result.obligations.map((o) => ({
      id: o.templateId,
      obligation: o.obligation,
      deadlineLogic: o.deadlineLogic,
      evidenceExpectation: o.evidenceExpectation,
    })),
    nextQuestions: result.nextQuestions.slice(0, 3).map((q) => ({
      id: q.question.id,
      text: q.question.text,
      whyAsked: q.question.whyAsked,
      unblocks: q.blockedDeterminations.length,
    })),
  });
}
