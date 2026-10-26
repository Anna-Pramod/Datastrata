/**
 * POST /api/check — the free check's answer: the start-year timeline (DP1
 * plan, Tasks 4 and 6).
 *
 * Runs the real applicability engine over the real CSRD knowledge pack, once
 * per start year. There is no lookup table and no model call anywhere in this
 * path: every cell below is the determination `assess()` returned for its
 * line's own requirement. If the engine says INDETERMINATE, the cell says
 * "cannot decide yet".
 *
 * The route holds no logic of its own. It reads the request within its limit,
 * refuses answers the questions could not have produced, reads the clock, and
 * hands the answers to `buildCheckTimeline`, whose payload it returns as it is.
 *
 * **The answers are the questions'.** `checkerAnswersSchema` is strict, so a key
 * the check does not ask is refused rather than stripped. An answer to a
 * question that `visibleQuestions` would not show for the other answers is
 * refused with 400 too, never silently dropped, so a request cannot produce a
 * result the questions could not.
 *
 * **It may refuse; it may not downgrade** (design §6). The freshness resolver
 * throws `IntegrityFailureError` when the verification record it was asked to
 * judge is damaged — a missing pinned result, an uncomputable closure, a pinned
 * document the corpus no longer holds. That reaches this route through
 * `loadPack`, which deliberately puts no `try` around the resolver, and through
 * `buildCheckTimeline`, which never catches it.
 *
 * Two responses are available and only one is honest:
 *
 * ```
 * refuse     503, no status at all               permitted
 * downgrade  200 with content.draft             forbidden
 * ```
 *
 * Downgrading would report `freshness_unchecked` over a record *known* to be
 * broken — the forbidden catch from the status-truth-boundary design §5, moved
 * one layer out and therefore harder to see. So the catch below returns a body
 * carrying no `content`, no `routes` and no cells: nothing a caller could
 * mistake for an assessment, and the same body as before the timeline. A line
 * asked to show a state its kind cannot (`TimelineRefusalError`: the national
 * line reading APPLIES, a coverage gap reading definitive) is refused the same
 * way, rather than given an invented label (law 3). Every other error is
 * rethrown, because a refusal that swallows unrelated failures is a refusal
 * that hides them.
 *
 * **The body is read within 8 KiB** (`lib/request-body.ts`, pilot readiness
 * B4), far above the short answers the check sends. A larger body is answered
 * 413 before it is parsed; one within the limit is parsed by the same
 * `request.json()` as before, over the bytes that were read.
 */

import { NextResponse } from 'next/server';
import { IntegrityFailureError } from '@datastrata/engine';
import { checkerAnswersSchema, type CheckerAnswers } from '@/lib/check-answers';
import { buildCheckTimeline, TimelineRefusalError } from '@/lib/check-timeline';
import { answeredHiddenQuestions } from '@/lib/check-view';
import { logEvent, type LogEventName } from '@/lib/log';
import { csrdPack } from '@/lib/pack';
import { CHECK_BODY_LIMIT, readBodyWithin, withBoundedBody } from '@/lib/request-body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The handler, with exactly one log line per request (DP1 plan, Task 8).
 *
 * The line is written in `finally`, so every path writes it once: each answer `answer` gives, and a thrown error, which is logged
 * as `check.refused` with the 500 Next then sends and rethrown unchanged. It is made from the status and the duration alone:
 * nothing from the request reaches `logEvent`, so no answer, header, query or address can (§1, "Logs carry no answers").
 */
export async function POST(request: Request): Promise<Response> {
  const started = performance.now();
  let status = 500;
  try {
    const response = await answer(request);
    status = response.status;
    return response;
  } finally {
    logEvent({ event: eventFor(status), route: '/api/check', status, ms: performance.now() - started });
  }
}

/** The event each status is logged as: a 503 refusal and the 500 of a thrown error are both refusals. */
function eventFor(status: number): LogEventName {
  if (status === 200) return 'check.answered';
  if (status === 413) return 'check.too_large';
  if (status === 400) return 'check.malformed';
  return 'check.refused';
}

async function answer(request: Request) {
  const body = await readBodyWithin(request, CHECK_BODY_LIMIT);
  if (!body.ok) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
  }

  let answers: CheckerAnswers;
  try {
    answers = checkerAnswersSchema.parse(await withBoundedBody(request, body.bytes).json());
  } catch {
    return NextResponse.json({ error: 'Malformed check answers.' }, { status: 400 });
  }

  const hidden = answeredHiddenQuestions(answers);
  if (hidden.length > 0) {
    return NextResponse.json({ error: 'An answer was given to a question these answers do not show.', questions: hidden }, { status: 400 });
  }

  // The engine never reads the clock — the assessment date is an input, and it
  // is echoed back so the result is reproducible.
  const assessmentDate = new Date().toISOString().slice(0, 10);

  try {
    return NextResponse.json(buildCheckTimeline(csrdPack(), answers, assessmentDate));
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
    if (error instanceof TimelineRefusalError) {
      return NextResponse.json(
        {
          error: 'A line of this check would have to show a state its kind cannot, so the check is refused and no assessment is produced.',
          refusal: error.message,
        },
        { status: 503 },
      );
    }
    throw error;
  }
}
