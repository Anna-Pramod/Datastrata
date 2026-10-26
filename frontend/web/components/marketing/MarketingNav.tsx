import Link from 'next/link';
import { Wordmark } from '@/components/ui/primitives';

const LINKS = [
  { href: '/#product', label: 'Product', key: 'product' },
  { href: '/#how', label: 'How it works', key: 'how' },
  { href: '/#coverage', label: 'Coverage', key: 'coverage' },
  { href: '/company', label: 'Company', key: 'company' },
  { href: '/contact', label: 'Contact', key: 'contact' },
] as const;

export function MarketingNav({ current }: { current?: (typeof LINKS)[number]['key'] }) {
  return (
    <nav className="ds-nav ds-gutter" aria-label="Primary">
      <Link href="/"><Wordmark /></Link>

      <div className="ds-nav-links">
        {LINKS.map((l) => (
          <Link key={l.key} href={l.href} aria-current={current === l.key ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </div>

      <Link className="ds-btn ds-btn-primary ds-btn-sm ds-nav-cta" href="/check" style={{ marginLeft: 'auto' }}>
        Check what applies →
      </Link>

      {/* Below 900px the inline links are hidden, so navigation moves in here.
          A <details> disclosure keeps it keyboard-operable with no JavaScript. */}
      <details className="ds-nav-menu">
        <summary aria-label="Menu">Menu</summary>
        <div className="ds-nav-panel">
          {LINKS.map((l) => (
            <Link key={l.key} href={l.href} aria-current={current === l.key ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
          <Link href="/check" style={{ color: 'var(--ds-oxide)' }}>Check what applies →</Link>
        </div>
      </details>
    </nav>
  );
}
