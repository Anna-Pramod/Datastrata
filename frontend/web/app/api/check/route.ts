/**
 * POST /api/check — the free check's answer.
 *
 * Runs the real applicability engine over the real CSRD knowledge pack. There
 * is no lookup table and no model call anywhere in this path: the verdicts,
 * reason codes, obligations and citations below are whatever `assess()`
 * returned. If the engine says INDETERMINATE, the page says INDETERMINATE.
 *
 * The route holds no logic of its own. It reads the request, reads the clock,
 * and hands both to `buildCheckResponse`, which is where the payload is built
 * and where it can be tested without Next's runtime.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { csrdPack } from '@/lib/pack';
import { buildCheckResponse } from '@/lib/checkResponse';
import type { CheckerAnswers } from '@/lib/checker';

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

  return NextResponse.json(buildCheckResponse(pack, answers, assessmentDate));
}
