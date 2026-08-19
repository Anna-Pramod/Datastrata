import type { ReactNode } from 'react';

/** Strata mark: stacked layers, the live one in oxide. */
export function StrataMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <rect x="1" y="3" width="20" height="2.5" fill="var(--ds-mark-neutral)" />
      <rect x="1" y="7.5" width="20" height="2.5" fill="var(--ds-text-faint)" />
      <rect x="1" y="12" width="20" height="2.5" fill="var(--ds-oxide)" />
      <rect x="1" y="16.5" width="20" height="2.5" fill="var(--ds-ink)" />
    </svg>
  );
}

export function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <span className="ds-wordmark" style={{ fontSize: size }}>
      <StrataMark size={size + 3} />
      DataStrata
    </span>
  );
}

type ButtonVariant = 'primary' | 'secondary';

export function Button({
  children, variant = 'primary', small, loading, ...rest
}: {
  children: ReactNode; variant?: ButtonVariant; small?: boolean; loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ['ds-btn', variant === 'primary' ? 'ds-btn-primary' : 'ds-btn-secondary', small ? 'ds-btn-sm' : '']
    .filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest} disabled={rest.disabled || loading}>
      {loading ? <><PlotterLine /> Verifying…</> : children}
    </button>
  );
}

/** Loading indicator: a plotter line drawing, never a spinner. */
export function PlotterLine() {
  return (
    <svg width="56" height="12" viewBox="0 0 56 12" aria-hidden="true" focusable="false">
      <path
        d="M0 6 L8 6 L11 2 L14 10 L17 6 L26 6 L29 3 L32 9 L35 6 L56 6"
        fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeDasharray="70" strokeDashoffset="70"
        style={{ animation: 'dsDraw 1.2s linear infinite' }}
      />
    </svg>
  );
}

export function CapacityChip({ children }: { children: ReactNode }) {
  return <span className="ds-chip ds-chip-capacity">{children}</span>;
}

export function StatusChip({ children }: { children: ReactNode }) {
  return <span className="ds-chip ds-chip-status">{children}</span>;
}

export function NeutralChip({ children }: { children: ReactNode }) {
  return <span className="ds-chip ds-chip-neutral">{children}</span>;
}

/** The only orange surface in the system (design-system.md §3 rule 1). */
export function DeadlineChip({ children }: { children: ReactNode }) {
  return (
    <span className="ds-chip ds-chip-deadline">
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, background: 'var(--ds-ink)', display: 'inline-block', transform: 'rotate(45deg)' }}
      />
      {children}
    </span>
  );
}

export function LegendChip({ swatch, children }: { swatch: 'solid' | 'outline' | 'hatch' | 'blank'; children: ReactNode }) {
  const style: React.CSSProperties =
    swatch === 'solid' ? { background: 'var(--ds-oxide)' }
    : swatch === 'outline' ? { border: '1px solid var(--ds-oxide)' }
    : swatch === 'hatch' ? { background: 'var(--ds-oxide-wash)', border: '1px solid var(--ds-oxide)' }
    : { border: '1px solid var(--ds-hairline-2)' };
  return (
    <span className="ds-chip ds-chip-legend">
      <span className="ds-chip-swatch" aria-hidden="true" style={style} />
      {children}
    </span>
  );
}

export function Field({
  label, htmlFor, error, hint, children,
}: { label: string; htmlFor?: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className={`ds-field${error ? ' ds-field-error' : ''}`}>
      <label className="ds-field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error ? <span className="ds-micro">{hint}</span> : null}
      {error ? <span className="ds-field-msg">{error}</span> : null}
    </div>
  );
}

export function EvidenceBar({ label, value, note }: { label: string; value: number; note?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span className="ds-body-sm" style={{ color: 'var(--ds-text-body)' }}>{label}</span>
        <span className="ds-mono" style={{ fontSize: 12, color: 'var(--ds-text-muted)' }}>
          {String(pct).padStart(3, '0')}%
        </span>
      </div>
      {/* Never red at any value (design-system.md, EvidenceBar). */}
      <div className="ds-bar-track" role="img" aria-label={`${label}: ${pct} percent`}>
        <div className="ds-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {note ? <span className="ds-micro">{note}</span> : null}
    </div>
  );
}
