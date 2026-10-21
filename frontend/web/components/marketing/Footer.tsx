import Link from 'next/link';
import { Wordmark } from '@/components/ui/primitives';
import { COVERAGE_WORDS } from '@/lib/coverage';
import { siteCoverage } from '@/lib/site-coverage';

export function Footer({ packVersion, legalSnapshot }: { packVersion: string; legalSnapshot: string }) {
  return (
    <footer style={{ borderTop: '2px solid var(--ds-ink)' }} className="ds-gutter">
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingTop: 56 }}>
        <div style={{ width: 380, maxWidth: '100%' }}>
          <div style={{ marginBottom: 16 }}><Wordmark size={17} /></div>
          <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', maxWidth: '34ch' }}>
            DataStrata provides regulatory intelligence, not legal advice.
          </p>
          <p className="ds-micro" style={{ marginTop: 14, maxWidth: '46ch' }}>
            CSRD knowledge pack {packVersion}, legal snapshot {legalSnapshot}. All requirement content is
            draft and unratified; no country pack is ratified, so no result is a final legal conclusion.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'clamp(32px, 8vw, 96px)', flexWrap: 'wrap' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Product">
            <span className="ds-label">Product</span>
            <a className="ds-body-sm" href="/#product">Product</a>
            <a className="ds-body-sm" href="/#how">How it works</a>
            <a className="ds-body-sm" href="/#coverage">Coverage</a>
            <Link className="ds-body-sm" href="/check">Free check</Link>
          </nav>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Company">
            <span className="ds-label">Company</span>
            <Link className="ds-body-sm" href="/company">About us</Link>
            <Link className="ds-body-sm" href="/contact">Contact</Link>
            <Link className="ds-body-sm" href="/login">Sign in</Link>
          </nav>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Coverage">
            <span className="ds-label">Coverage</span>
            {siteCoverage().map((r) => (
              <span className="ds-body-sm" key={r.id} style={{ color: 'var(--ds-text-body)' }}>
                {r.short}{' '}
                <span className="ds-micro">{COVERAGE_WORDS[r.status]}</span>
              </span>
            ))}
          </nav>
        </div>
      </div>
      <div
        className="ds-mono"
        style={{
          borderTop: '1px solid var(--ds-hairline-1)', marginTop: 44, padding: '18px 0 24px',
          display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          fontSize: 10.5, letterSpacing: '0.16em', color: 'var(--ds-text-faint)',
        }}
      >
        <span>© 2026 DATASTRATA</span>
        <span>CALM IS A MEASURABLE OUTPUT</span>
      </div>
    </footer>
  );
}
