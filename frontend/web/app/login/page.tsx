/**
 * /login: the plain card that says accounts are not live, and points a pilot evaluation to `/pilot-access`.
 *
 * **Why it can be a 404, and why it is rendered for each request.** The page is part of the pilot surface, which answers only where
 * a server sets `DATASTRATA_PILOT_GATE=on` (DP1 plan, DG-10): unless it is `on`, the page calls `notFound()` as the first thing it
 * does, before the pack is read, and Next renders the standard 404. Nothing else about the page depends on the request, so without
 * `force-dynamic` Next would prerender it at `next build` and a server would serve the build's answer, whatever its own switch says;
 * rendered for each request, it answers by the switch of the server that serves it. Its metadata is decided the same way, by
 * `generateMetadata`: none while the switch is off, because Next streams a page's metadata into the document even when the page calls
 * `notFound()`, and a static export put "Sign in" and the pointer to `/pilot-access` into the 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoginCard } from '@/components/marketing/LoginCard';
import { LiveTrace } from '@/components/marketing/LiveTrace';
import { Wordmark } from '@/components/ui/primitives';
import { PILOT_GATE_ENV, pilotSurfaceEnabled } from '@/lib/hosting-mode';
import { packStats, traceSeries } from '@/lib/pack';

export const dynamic = 'force-dynamic';

/** The pilot switch, read by name for each request (DG-10): the page's metadata and its body each ask it before anything else. */
function surfaceOn(): boolean {
  return pilotSurfaceEnabled({ [PILOT_GATE_ENV]: process.env.DATASTRATA_PILOT_GATE });
}

/** The page's metadata while the pilot surface is on. */
const METADATA: Metadata = {
  title: 'Sign in · DataStrata',
  description: 'Accounts are not live yet. Pilot evaluations use a passphrase, entered at /pilot-access.',
};

/** None while the pilot surface is off, so the 404 says nothing of this page; `METADATA` while it is on. `{}` rather than a second `notFound()`, because the body already answers 404 first. */
export async function generateMetadata(): Promise<Metadata> {
  if (!surfaceOn()) return {};
  return METADATA;
}

export default function LoginPage() {
  if (!surfaceOn()) notFound();
  const stats = packStats();
  const series = traceSeries();
  return (
    <div className="ds-grid-paper" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="ds-gutter" style={{ paddingTop: 28 }}>
        <Link href="/"><Wordmark size={17} /></Link>
      </div>

      <main id="main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>
        <LoginCard />
      </main>

      {/* quiet foot trace — the same component, unlabelled */}
      <div style={{ borderTop: '1px solid var(--ds-hairline-1)', background: 'var(--ds-paper)' }}>
        <LiveTrace acts={series.acts} pending={series.pending} requirements={stats.requirements} snapshot={stats.legalSnapshot} variant="foot" idPrefix="foot" />
        <div
          className="ds-gutter ds-mono"
          style={{
            display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
            paddingBottom: 20, fontSize: 10, letterSpacing: '0.16em', color: 'var(--ds-text-faint)',
          }}
        >
          <span>{series.acts.length} ACTS IN FORCE · {stats.requirements} REQUIREMENTS ENCODED · {series.pending.length} PENDING</span>
          <span>SNAPSHOT {stats.legalSnapshot}</span>
        </div>
      </div>
    </div>
  );
}
