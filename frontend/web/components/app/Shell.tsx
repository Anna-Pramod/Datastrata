import Link from 'next/link';
import { Wordmark } from '@/components/ui/primitives';

const NAV = [
  'Home', 'Regulatory Universe', 'Obligations', 'Changes',
  'Actions & Calendar', 'Evidence', 'Reports', 'Company Profile',
];

export function Sidebar() {
  return (
    <aside
      className="ds-app-side"
      style={{
        width: 232, flex: 'none', background: 'var(--ds-panel)',
        borderRight: '1px solid var(--ds-ink)', display: 'flex', flexDirection: 'column',
      }}
      aria-label="Sections"
    >
      <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--ds-hairline-3)' }}>
        <Link href="/"><Wordmark size={16} /></Link>
      </div>
      <nav style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n, i) => {
          const active = i === 0;
          return (
            <span
              key={n}
              aria-current={active ? 'page' : undefined}
              className="ds-mono"
              style={{
                fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '10px 12px',
                background: active ? 'var(--ds-oxide)' : 'transparent',
                color: active ? '#fff' : 'var(--ds-text-nav)',
                display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center',
              }}
            >
              {n}
              {!active ? <span className="ds-micro" style={{ color: 'var(--ds-text-ghost)' }}>-</span> : null}
            </span>
          );
        })}
      </nav>
      <p className="ds-micro" style={{ padding: '14px 16px', marginTop: 'auto' }}>
        Home is the only screen built. The rest are designed, not shipped; they are not links yet.
      </p>
    </aside>
  );
}

/** `label` names what kind of record this is — the page decides it from the record, never from copy here. */
export function Topbar({ org, label, snapshot }: { org: string; label: string; snapshot: string }) {
  return (
    <header
      style={{
        height: 60, flex: 'none', borderBottom: '1px solid var(--ds-ink)',
        display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px',
      }}
    >
      <span className="ds-mono" style={{ fontSize: 12.5, fontWeight: 700 }}>{org}</span>
      <span className="ds-chip ds-chip-capacity">{label}</span>
      <span className="ds-micro" style={{ marginLeft: 'auto' }}>LEGAL SNAPSHOT {snapshot}</span>
      <span
        aria-hidden="true"
        className="ds-mono"
        style={{
          width: 32, height: 32, border: '1px solid var(--ds-ink)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
        }}
      >
        AK
      </span>
    </header>
  );
}
