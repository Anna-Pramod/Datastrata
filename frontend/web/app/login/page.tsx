import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginCard } from '@/components/marketing/LoginCard';
import { LiveTrace } from '@/components/marketing/LiveTrace';
import { Wordmark } from '@/components/ui/primitives';
import { packStats, traceSeries } from '@/lib/pack';

export const metadata: Metadata = {
  title: 'Sign in · DataStrata',
  description: 'Accounts are not live yet. Pilot evaluations use a passphrase, entered at /pilot-access.',
};

export default function LoginPage() {
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
