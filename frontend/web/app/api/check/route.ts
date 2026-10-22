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
 *
 * **It may refuse; it may not downgrade** (design §6). The freshness resolver
 * throws `IntegrityFailureError` when the verification record it was asked to
 * judge is damaged — a missing pinned result, an uncomputable closure, a pinned
 * document the corpus no longer holds. That reaches this route through
 * `loadPack`, which deliberately puts no `try` around the resolver.
 *
 * Two responses are available and only one is honest:
 *
 * ```
 * refuse     503, no status at all               permitted
 * downgrade  200 with containsDraftContent       forbidden
 * ```
 *
 * Downgrading would report `freshness_unchecked` over a record *known* to be
 * broken — the forbidden catch from the status-truth-boundary design §5, moved
 * one layer out and therefore harder to see. So the catch below returns a body
 * carrying no `containsDraftContent`, no determinations and no counts: nothing
 * a caller could mistake for an assessment. Every other error is rethrown,
 * because a refusal that swallows unrelated failures is a refusal that hides
 * them.
 *
 * **The body is read within 8 KiB** (`lib/request-body.ts`, pilot readiness
 * B4), far above the thirteen short answers the check sends. A larger body is
 * answered 413 before it is parsed; one within the limit is parsed by the same
 * `request.json()` as before, over the bytes that were read.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { IntegrityFailureError } from '@datastrata/engine';
import type { KnowledgePack } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';
import { buildCheckResponse } from '@/lib/checkResponse';
import type { CheckerAnswers } from '@/lib/checker';
import { CHECK_BODY_LIMIT, readBodyWithin, withBoundedBody } from '@/lib/request-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const answersSchema = z.object({
  country: z.string().max(4).optional(),
  legalForm: z.string().max(64).optional(),
  exclusion: z.enum(['yes', 'no', 'unknown']).optional(),
  financialYear: z.string().regex(/^\d{4}$/).optional(),
  groupPosition: z.enum(['standalone', 'parent', 'subsidiary', 'parent_and_subsidiary']).optional(),
  holding: z.enum(['yes', 'no', 'unknown']).optional(),
  turnover: z.string().max(32).optional(),
  employees: z.string().max(32).optional(),
  reportedFy2024: z.string().max(16).optional(),
  parentReport: z.string().max(16).optional(),
  governingChoice: z.enum(['same', 'other', 'unknown']).optional(),
  governingState: z.string().max(4).optional(),
  euTurnover: z.enum(['both', 'one', 'neither', 'unknown']).optional(),
});

export async function POST(request: Request) {
  const body = await readBodyWithin(request, CHECK_BODY_LIMIT);
  if (!body.ok) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  }

  let answers: CheckerAnswers;
  try {
    answers = answersSchema.parse(await withBoundedBody(request, body.bytes).json());
  } catch {
    return NextResponse.json({ error: 'Malformed check answers.' }, { status: 400 });
  }

  let pack: KnowledgePack;
  try {
    pack = csrdPack();
  } catch (error) {
    if (error instanceof IntegrityFailureError) {
      return NextResponse.json(
        {
          error:
            'The verification record for this pack is damaged, so the check is unavailable. ' +
            'No assessment is produced from an unverifiable record.',
          refusals: error.refusals.map((refusal) => `${refusal.code}: ${refusal.detail}`),
        },
        { status: 503 },
      );
    }
    throw error;
  }

  // The engine never reads the clock — the assessment date is an input, and it
  // is echoed back so the result is reproducible.
  const assessmentDate = new Date().toISOString().slice(0, 10);

  return NextResponse.json(buildCheckResponse(pack, answers, assessmentDate));
}
