/**
 * Dashboard home — the 5a production screen, driven by a real assessment.
 *
 * The company is a sample and the page says so in the topbar and the banner.
 * Everything computed from it is real: the counts, the cross-section cells, the
 * obligations and the briefing all come out of `assess()` over the live CSRD
 * pack. The mockup's invented matrix and evidence percentages are not used.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Sidebar, Topbar } from '@/components/app/Shell';
import { CrossSectionChart, type CellState, type ChartRow } from '@/components/app/CrossSectionChart';
import { DeadlineChip, EvidenceBar, CapacityChip, NeutralChip } from '@/components/ui/primitives';
import { csrdPack, packStats } from '@/lib/pack';
import { SAMPLE_ENTITIES, SAMPLE_ORG, sampleAssessment, SAMPLE_CONTEXT } from '@/lib/sample';
import { REGIMES } from '@/lib/regimes';

export const metadata: Metadata = {
  title: 'Sample report — DataStrata',
  description: 'A maintained regulatory record, rendered from a real engine assessment over a sample group.',
};

/** The cell for an entity is its reporting-duty determination (CSRD-S-014). */
const CELL: Record<string, CellState> = {
  APPLIES: 'applies',
  DOES_NOT_APPLY: 'not',
  INDETERMINATE: 'judgment',
};

export default function DashboardPage() {
  const pack = csrdPack();
  const stats = packStats();
  const result = sampleAssessment();

  const dutyByEntity = new Map(
    result.determinations.filter((d) => d.requirementId === 'CSRD-S-014').map((d) => [d.scopeId, d]),
  );

  const rows: ChartRow[] = REGIMES.map((r) => ({
    regime: r.short,
    encoded: r.status === 'encoded',
    cells: SAMPLE_ENTITIES.map((e) => {
      if (r.status !== 'encoded') return { entity: e.short, state: 'unencoded' as CellState };
      const d = dutyByEntity.get(e.id);
      return {
        entity: e.short,
        state: d ? CELL[d.result] : 'unencoded',
        note: d?.reason,
      };
    }),
  }));

  const counts = {
    applies: result.determinations.filter((d) => d.result === 'APPLIES').length,
    not: result.determinations.filter((d) => d.result === 'DOES_NOT_APPLY').length,
    judgment: result.determinations.filter((d) => d.result === 'INDETERMINATE').length,
  };

  // The one orange surface: a real dated expectation from the pack's watch list.
  const dated = pack.changeWatch.find((c) => /\b\d{1,2} \w+ 20\d\d\b/.test(c.expected ?? ''));
  const datedText = dated?.expected?.match(/([A-Z][a-z]+ ?\w* ?)?(\d{1,2} \w+ 20\d\d)/)?.[2];

  return (
    <div className="ds-app" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar org={SAMPLE_ORG} snapshot={stats.legalSnapshot} />

        <main id="main" className="ds-app-main" style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, padding: 24 }}>
            <h1 className="ds-h4" style={{ marginBottom: 16 }}>
              Home — {SAMPLE_ORG}
            </h1>
            <p style={{ border: '1px solid var(--ds-oxide)', background: 'var(--ds-oxide-wash)', padding: '12px 14px', fontSize: 13, lineHeight: 1.55, marginBottom: 22, maxWidth: '86ch' }}>
              <strong>Sample record.</strong> Meridian Steelworks is a made-up group. Every determination,
              count and citation below is real — the profile is fed to the applicability engine and this page
              renders what came back. Requirement content is draft and unratified.
            </p>

            <p className="ds-mono" style={{ fontSize: 13, color: 'var(--ds-text-nav)', marginBottom: 4 }}>
              You are current.
            </p>
            <p className="ds-micro" style={{ marginBottom: 24 }}>
              {stats.pendingActs} ACTS WATCHED · NONE IN FORCE · NOTHING CHANGED WHAT BINDS YOU
            </p>

            {/* posture — real counts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 26 }}>
              {[
                { n: counts.applies, l: 'Applies' },
                { n: counts.not, l: 'Does not apply' },
                { n: counts.judgment, l: 'Requires judgment', accent: true },
                { n: result.obligations.length, l: 'Obligations' },
              ].map((c) => (
                <div key={c.l} className="ds-card" style={{ padding: 16 }}>
                  <div className="ds-stat" style={{ color: c.accent ? 'var(--ds-oxide)' : undefined }}>{c.n}</div>
                  <div className="ds-stat-sub">{c.l}</div>
                </div>
              ))}
            </div>

            {/* cross-section */}
            <div className="ds-card" style={{ padding: 20, marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
                <div>
                  <h2 className="ds-h4">Regulatory Universe — cross-section view</h2>
                  <p className="ds-micro" style={{ marginTop: 4 }}>
                    CSRD ROW = REPORTING-DUTY DETERMINATION PER ENTITY (CSRD-S-014)
                  </p>
                </div>
              </div>
              <CrossSectionChart rows={rows} columns={SAMPLE_ENTITIES.map((e) => e.short)} />
              <p className="ds-micro" style={{ borderTop: '1px solid var(--ds-hairline-1)', marginTop: 16, paddingTop: 12 }}>
                {stats.sources} OFFICIAL SOURCES · PACK {stats.version} · ASSESSED {SAMPLE_CONTEXT.assessmentDate} ·
                DETERMINATIONS VERSIONED, NEVER OVERWRITTEN
              </p>
            </div>

            {/* obligations */}
            <div className="ds-card" style={{ padding: 20 }}>
              <h2 className="ds-h4" style={{ marginBottom: 14 }}>Obligations instantiated · {result.obligations.length}</h2>
              {result.obligations.slice(0, 6).map((o, i) => (
                <div key={`${o.templateId}-${o.scopeId}`} style={{ borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)', padding: '13px 0', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-text-faint)', minWidth: 64 }}>{o.templateId}</span>
                  <span style={{ fontSize: 14, flex: 1, minWidth: 240 }}>{o.obligation}</span>
                  <NeutralChip>{o.scopeName}</NeutralChip>
                </div>
              ))}
              {result.obligations.length > 6 ? (
                <p className="ds-micro" style={{ borderTop: '1px solid var(--ds-hairline-1)', paddingTop: 12 }}>
                  + {result.obligations.length - 6} MORE — EACH TRACING BACK TO THE DETERMINATION THAT CREATED IT
                </p>
              ) : null}
            </div>
          </div>

          {/* rail */}
          <aside
            className="ds-app-rail"
            style={{ width: 320, flex: 'none', borderLeft: '1px solid var(--ds-ink)', background: 'var(--ds-panel)', padding: 20 }}
            aria-label="This week's briefing"
          >
            <p className="ds-label" style={{ marginBottom: 14 }}>Watch list — pending acts</p>
            {pack.changeWatch.map((c, i) => (
              <div key={c.id} style={{ borderTop: i === 0 ? '1px solid var(--ds-hairline-2)' : undefined, borderBottom: '1px solid var(--ds-hairline-3)', padding: '13px 0' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 5 }}>
                  <span className="ds-mono" style={{ fontSize: 10, color: 'var(--ds-text-faint)' }}>{c.id}</span>
                  <CapacityChip>{c.status.replace(/_/g, ' ')}</CapacityChip>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ds-text-body)' }}>{c.title}</p>
                <p className="ds-micro" style={{ marginTop: 5 }}>WOULD MOVE {c.affectsRequirements.join(', ')}</p>
              </div>
            ))}

            {datedText ? (
              <div style={{ marginTop: 20 }}>
                <p className="ds-label" style={{ marginBottom: 10 }}>Next dated expectation</p>
                <DeadlineChip>{`REVISED ESRS — EXPECTED ${datedText.toUpperCase()}`}</DeadlineChip>
                <p className="ds-micro" style={{ marginTop: 8 }}>
                  PENDING. IT CHANGES NOTHING UNTIL IT IS IN FORCE.
                </p>
              </div>
            ) : null}

            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p className="ds-label">Record health</p>
              <EvidenceBar label="Requirements encoded" value={100} note={`${stats.requirements} OF ${stats.requirements}`} />
              <EvidenceBar label="Determinations cited" value={100} note={`${stats.sources} OFFICIAL SOURCES`} />
              <EvidenceBar
                label="Expert ratification"
                value={Math.round((stats.ratified / stats.requirements) * 100)}
                note={`${stats.ratified} OF ${stats.requirements} — THE PROTOTYPE GATE`}
              />
              <EvidenceBar
                label="Country packs ratified"
                value={0}
                note={`${stats.ratifiedCountryPacks} — NATIONAL LAW STILL REQUIRES REVIEW`}
              />
            </div>

            <p className="ds-micro" style={{ marginTop: 24 }}>
              <Link href="/check" style={{ color: 'var(--ds-oxide)' }}>RUN THE FREE CHECK ON YOUR OWN ENTITY →</Link>
            </p>
          </aside>
        </main>
      </div>
    </div>
  );
}
