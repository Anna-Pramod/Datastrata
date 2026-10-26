import { COVERAGE_WORDS, type CoverageEntry, type CoverageStatus } from '@/lib/coverage';
import { siteCoverage } from '@/lib/site-coverage';

/**
 * The coverage claim, split by status so it cannot be misread.
 *
 * The mockup printed six regimes as one undifferentiated list. The strip and
 * the table print each regime under the status the record earns it — the four
 * words of `COVERAGE_WORDS`, derived in `lib/coverage.ts` and never written
 * here — so "answered as draft" and "planned" cannot read as the same thing.
 * The distinction between "the engine answers this" and "nothing backs this
 * yet" is the one a buyer is entitled to.
 */

/** Precedence order; a status nothing earns is not printed. */
const ORDER: CoverageStatus[] = ['supported', 'draft', 'monitored', 'planned'];

const isAnswerable = (status: CoverageStatus) => status === 'supported' || status === 'draft';

function byStatus(entries: CoverageEntry[]): { status: CoverageStatus; entries: CoverageEntry[] }[] {
  return ORDER
    .map((status) => ({ status, entries: entries.filter((e) => e.status === status) }))
    .filter((group) => group.entries.length > 0);
}

const FOOTNOTE =
  'Draft means a versioned knowledge pack exists and the engine returns cited determinations against it, but the conditions for Supported status are not met. ' +
  'For regimes with a knowledge pack, the adjacent count shows how many requirements have reviewer signatures. ' +
  'Monitored means every listed source was successfully checked within its cadence. ' +
  'Planned means neither a knowledge pack nor qualifying source monitoring exists.';

export function CoverageStrip() {
  const groups = byStatus(siteCoverage());
  return (
    <div
      className="ds-gutter ds-panel"
      style={{ borderTop: '1px solid var(--ds-hairline-1)', borderBottom: '1px solid var(--ds-hairline-1)', paddingBlock: 16 }}
    >
      <div style={{ display: 'flex', gap: 'clamp(16px, 4vw, 48px)', flexWrap: 'wrap', alignItems: 'baseline' }}>
        {groups.map((group) => (
          <span
            key={group.status}
            className="ds-mono"
            style={{
              fontSize: 11.5, letterSpacing: '0.18em',
              color: isAnswerable(group.status) ? 'var(--ds-oxide)' : 'var(--ds-text-muted)',
            }}
          >
            {COVERAGE_WORDS[group.status].toUpperCase()}: {group.entries.map((r) => r.short).join(' · ')}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CoverageTable() {
  const entries = siteCoverage();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {entries.map((r, i) => (
        <div
          key={r.id}
          className="ds-coverage-row"
          style={{
            borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)',
            padding: '20px 0', display: 'grid',
            gridTemplateColumns: 'minmax(120px, 160px) 1fr minmax(96px, auto)', gap: 24, alignItems: 'baseline',
          }}
        >
          <div>
            <div className="ds-h4" style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 15 }}>{r.short}</div>
            <div className="ds-micro" style={{ marginTop: 4 }}>{r.name}</div>
            <div className="ds-micro" style={{ marginTop: 4 }}>{r.detail}</div>
          </div>
          <p className="ds-body" style={{ maxWidth: '58ch' }}>{r.decides}</p>
          <span
            className="ds-chip"
            style={
              isAnswerable(r.status)
                ? { background: 'var(--ds-oxide)', color: '#fff', fontSize: 8.5, letterSpacing: '.08em', padding: '4px 9px', textTransform: 'uppercase' }
                : { border: '1px solid var(--ds-hairline-2)', color: 'var(--ds-text-muted)', fontSize: 8.5, letterSpacing: '.08em', padding: '4px 9px', textTransform: 'uppercase' }
            }
          >
            {COVERAGE_WORDS[r.status]}
          </span>
        </div>
      ))}
      <p className="ds-micro" style={{ borderTop: '1px solid var(--ds-hairline-1)', paddingTop: 14, maxWidth: '76ch' }}>
        {FOOTNOTE}
      </p>
    </div>
  );
}
