import { LegendChip } from '@/components/ui/primitives';
import { COVERAGE_WORDS, type CoverageStatus } from '@/lib/coverage';

export type CellState = 'applies' | 'not' | 'judgment' | 'unencoded';

export interface ChartRow {
  regime: string;
  /** The register's status for the regime; a row the engine does not answer for prints its word. */
  status: CoverageStatus;
  encoded: boolean;
  cells: { entity: string; state: CellState; note?: string }[];
}

/**
 * Regulatory universe — cross-section view.
 *
 * The CSRD row is real: each cell is that entity's reporting-duty determination
 * from the engine. A row for a regime the engine does not answer for is drawn in
 * a fourth state, `unencoded`, which the legend names explicitly — an empty cell
 * must never be mistaken for "does not apply". That distinction is the product's
 * first law. Such a row is labelled with the register's own word for its status
 * (`COVERAGE_WORDS`), never with a word written here.
 */
export function CrossSectionChart({ rows, columns }: { rows: ChartRow[]; columns: string[] }) {
  const cellStyle = (state: CellState): React.CSSProperties => {
    switch (state) {
      case 'applies': return { background: 'var(--ds-oxide)' };
      case 'not': return { background: 'var(--ds-paper)', border: '1px solid var(--ds-hairline-2)' };
      case 'judgment': return {
        background: 'var(--ds-oxide-wash)', border: '1px solid var(--ds-oxide)',
        backgroundImage: 'repeating-linear-gradient(45deg, var(--ds-oxide) 0 1px, transparent 1px 6px)',
      };
      default: return { background: 'var(--ds-panel)', border: '1px dashed var(--ds-hairline-2)' };
    }
  };
  const glyph = (s: CellState) => (s === 'applies' ? 'Applies' : s === 'not' ? 'Does not apply' : s === 'judgment' ? 'Requires judgment' : 'Not encoded');

  return (
    <div>
      <div className="ds-scroll-x">
        <table style={{ borderCollapse: 'collapse', minWidth: 680, width: '100%' }}>
          <caption className="ds-vh">
            Cross-section of the regimes in the coverage register against the record&apos;s legal entities.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 132 }} />
              {columns.map((c) => (
                <th key={c} scope="col" style={{ padding: '0 0 10px', verticalAlign: 'bottom' }}>
                  <span className="ds-mono" style={{ fontSize: 9.5, letterSpacing: '.04em', color: 'var(--ds-text-muted)', display: 'block', textAlign: 'center' }}>
                    {c}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.regime}>
                <th scope="row" style={{ textAlign: 'left', padding: '0 12px 6px 0', verticalAlign: 'middle' }}>
                  <span className="ds-mono" style={{ fontSize: 12, color: r.encoded ? 'var(--ds-ink)' : 'var(--ds-text-faint)' }}>
                    {r.regime}
                  </span>
                  {!r.encoded ? <span className="ds-micro" style={{ display: 'block' }}>{COVERAGE_WORDS[r.status]}</span> : null}
                </th>
                {r.cells.map((c) => (
                  <td key={c.entity} style={{ padding: 3 }}>
                    <span
                      title={`${r.regime} × ${c.entity}: ${glyph(c.state)}${c.note ? ` · ${c.note}` : ''}`}
                      style={{ display: 'block', height: 34, ...cellStyle(c.state) }}
                    />
                    <span className="ds-vh">{`${r.regime}, ${c.entity}: ${glyph(c.state)}`}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <LegendChip swatch="solid">Applies</LegendChip>
        <LegendChip swatch="blank">Does not apply</LegendChip>
        <LegendChip swatch="hatch">Requires judgment</LegendChip>
        <LegendChip swatch="outline">Not encoded: neither included nor excluded</LegendChip>
      </div>
    </div>
  );
}
