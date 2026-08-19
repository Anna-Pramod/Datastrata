import { ENCODED, REGIMES, WATCHED } from '@/lib/regimes';

/**
 * The coverage claim, split so it cannot be misread.
 *
 * The mockup printed six regimes as one undifferentiated list. Only CSRD has a
 * knowledge pack, so the strip states encoded and watched separately — the
 * distinction between "we can answer this" and "we are tracking this" is the
 * one a buyer is entitled to.
 */
export function CoverageStrip() {
  return (
    <div
      className="ds-gutter ds-panel"
      style={{ borderTop: '1px solid var(--ds-hairline-1)', borderBottom: '1px solid var(--ds-hairline-1)', paddingBlock: 16 }}
    >
      <div style={{ display: 'flex', gap: 'clamp(16px, 4vw, 48px)', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <span className="ds-mono" style={{ fontSize: 11.5, letterSpacing: '0.18em', color: 'var(--ds-oxide)' }}>
          ENCODED: {ENCODED.map((r) => r.short).join(' · ')}
        </span>
        <span className="ds-mono" style={{ fontSize: 11.5, letterSpacing: '0.18em', color: 'var(--ds-text-muted)' }}>
          WATCHED: {WATCHED.map((r) => r.short).join(' · ')}
        </span>
      </div>
    </div>
  );
}

export function CoverageTable() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {REGIMES.map((r, i) => (
        <div
          key={r.id}
          style={{
            borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)',
            padding: '20px 0', display: 'grid',
            gridTemplateColumns: 'minmax(120px, 160px) 1fr minmax(96px, auto)', gap: 24, alignItems: 'baseline',
          }}
        >
          <div>
            <div className="ds-h4" style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 15 }}>{r.short}</div>
            <div className="ds-micro" style={{ marginTop: 4 }}>{r.name}</div>
          </div>
          <p className="ds-body" style={{ maxWidth: '58ch' }}>{r.decides}</p>
          <span
            className="ds-chip"
            style={
              r.status === 'encoded'
                ? { background: 'var(--ds-oxide)', color: '#fff', fontSize: 8.5, letterSpacing: '.08em', padding: '4px 9px', textTransform: 'uppercase' }
                : { border: '1px solid var(--ds-hairline-2)', color: 'var(--ds-text-muted)', fontSize: 8.5, letterSpacing: '.08em', padding: '4px 9px', textTransform: 'uppercase' }
            }
          >
            {r.status === 'encoded' ? 'Encoded · answerable' : 'Watched · not yet encoded'}
          </span>
        </div>
      ))}
      <p className="ds-micro" style={{ borderTop: '1px solid var(--ds-hairline-1)', paddingTop: 14, maxWidth: '76ch' }}>
        Encoded means a versioned knowledge pack exists and the engine returns cited determinations against it.
        Watched means the sources are tracked and the scope is understood, but nothing is answerable yet. We
        would rather show you this line than let you assume the wrong one.
      </p>
    </div>
  );
}
