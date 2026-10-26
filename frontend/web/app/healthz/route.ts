/**
 * GET /healthz — whether this deployment can answer the check, and what it is answering from (DP1 plan, Task 8; PLT-6, its DP1
 * part).
 *
 * The uptime monitor and Task 13's acceptance read it. It answers 200 only when the pack loaded with its integrity, every
 * runtime-input directory was readable and a fixed synthetic check gave its expected cells; otherwise 503, with the same report
 * marked `refused` (`lib/health.ts` says why each part exists and how the digests are made). Both carry `Cache-Control:
 * no-store`, so no cache between the monitor and the function can answer for a deployment that has since changed.
 *
 * **Rendered for each request.** A route Next prerenders bakes in what it read at build (Task 7 found it on `/login`), and a
 * health check answered from the build's state would report the build, not the running deployment. So it is `force-dynamic`, and
 * the engine root and the two host variables are read when it answers.
 *
 * **Refused, never downgraded, and never explained.** `engineRoot()`'s error names the absolute paths it looked at, so it is
 * caught here and becomes every part's failure; every later failure is caught in `gatherHealth` as its own part's. No error text,
 * path, stack or variable name reaches the body or the log. The route writes one log line when it refuses and none when it
 * answers 200, so the host's logs show a refusal without a line every time the monitor calls.
 */

import { NextResponse } from 'next/server';
import { gatherHealth, healthReport } from '@/lib/health';
import { logEvent } from '@/lib/log';
import { engineRoot } from '@/lib/pack';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): Response {
  const started = performance.now();
  const report = healthReport({
    ...gatherHealth(locatedEngineRoot()),
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  });
  const status = report.status === 'ok' ? 200 : 503;
  if (status === 503) logEvent({ event: 'health.refused', route: '/healthz', status, ms: performance.now() - started });
  return NextResponse.json(report, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** The engine root, or `null` when none can be found. Its error is dropped: the text names absolute paths. */
function locatedEngineRoot(): string | null {
  try {
    return engineRoot();
  } catch {
    return null;
  }
}
