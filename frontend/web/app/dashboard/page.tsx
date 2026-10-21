/**
 * Dashboard home — the record screen, driven by a real assessment over the
 * profile the environment selects.
 *
 * The company is whichever document `DATASTRATA_PILOT_PROFILE` names, or the
 * synthetic development profile while nothing is configured, and the page says
 * which in the topbar and the banner. Everything computed from it is real: the
 * counts, the cross-section cells, the obligations, the per-requirement results
 * and each requirement's verification status all come out of `assess()` over
 * the live CSRD pack as the site loaded it. A profile that cannot be served is
 * a refusal printed in full — the variable, the kind of failure, every problem
 * by field — and never the sample in its place.
 *
 * The page decides access for itself, before it reads the profile.
 * `middleware.ts` refuses a stranger before any page code runs; this is the
 * second enforcement point, so that a routing change or a middleware regression
 * cannot expose a configured profile. `gatedRecord` is handed `pilotRecord` as
 * its reader and calls it for an allowed session only: the page never calls it
 * itself, and a test holds that by reading this file. The gate's two refusals
 * render only if the middleware is absent, so they are plain: they print the
 * gate's own problems, which name variables and never values, and the fixed
 * sentence for the reason, and read nothing else of the environment.
 *
 * Every page rendered for a session the gate has verified, the record and the
 * refusal for a profile that cannot be served, shows in its topbar when that
 * session ends and offers sign-out: the refusal prints profile text, and
 * without the control nothing would end the session from that page. The gate's
 * own two refusals show neither, since one has no verified session and the
 * other cannot verify one.
 *
 * Dynamic, so the profile file is read per request and nothing about a pilot
 * company is baked into the build. The file's path is read on the server and
 * is never rendered; only the variable's name is.
 */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sidebar, Topbar } from '@/components/app/Shell';
import { CrossSectionChart, type CellState, type ChartRow } from '@/components/app/CrossSectionChart';
import { CapacityChip, DeadlineChip, EvidenceBar, NeutralChip, StatusChip } from '@/components/ui/primitives';
import { entityColumns, factRows, requirementStatusRows, statusSummary, type EntityResult } from '@/lib/dashboard';
import { gatedRecord } from '@/lib/dashboard-view';
import { historicalEvidenceNotice, S002_R5_DOSSIER } from '@/lib/evidence';
import { packStats } from '@/lib/pack';
import { accessReasonMessage } from '@/lib/pilot-access-handler';
import { PILOT_PROFILE_ENV } from '@/lib/profile';
import { pilotRecord } from '@/lib/record';
import { siteCoverage } from '@/lib/site-coverage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Record · DataStrata',
  description: 'The regulatory record, rendered from a real engine assessment over the configured profile.',
};

/** The cell for an entity is its reporting-duty determination (CSRD-S-014). */
const CELL: Record<string, CellState> = {
  APPLIES: 'applies',
  DOES_NOT_APPLY: 'not',
  INDETERMINATE: 'judgment',
};

const GLYPH: Record<string, string> = { APPLIES: '●', DOES_NOT_APPLY: '○', INDETERMINATE: '◐' };
const WORD: Record<string, string> = { APPLIES: 'applies', DOES_NOT_APPLY: 'does not apply', INDETERMINATE: 'requires judgment' };

function cellTitle(entity: string, result: EntityResult | undefined): string {
  if (result === undefined) return `${entity}: not evaluated for this object`;
  const reason = result.reason === undefined ? '' : ` (${result.reason.replace(/_/g, ' ')})`;
  const selected = result.selected === undefined ? '' : ` → ${result.selected}`;
  return `${entity}: ${WORD[result.result]}${selected}${reason}`;
}

const bannerStyle = {
  border: '1px solid var(--ds-oxide)',
  background: 'var(--ds-oxide-wash)',
  padding: '12px 14px',
  fontSize: 13,
  lineHeight: 1.55,
  marginBottom: 22,
  maxWidth: '86ch',
} as const;

const cardTable = { borderCollapse: 'collapse', width: '100%', fontSize: 12.5 } as const;
const th = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--ds-ink)', fontWeight: 600, whiteSpace: 'nowrap' } as const;
const td = { padding: '6px 8px', borderBottom: '1px solid var(--ds-hairline-3)', verticalAlign: 'top' } as const;

/**
 * The frame every refusal shares: the sidebar, a topbar that says "Refused", and one column of text. `session` is given only by a
 * refusal rendered for a visitor whose session the gate has verified; the topbar then shows it and offers sign-out.
 */
function Refusal({
  org, snapshot, session, children,
}: { org: string; snapshot: string; session?: { expiresAt: Date }; children: ReactNode }) {
  return (
    <div className="ds-app" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar org={org} label="Refused" snapshot={snapshot} session={session} />
        <main id="main" className="ds-app-main" style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, padding: 24, maxWidth: '86ch' }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  // The gate comes first and is handed the reader, never given a record: nothing below runs the reader for a request it did not allow.
  const gate = await gatedRecord(
    { env: process.env, cookieHeader: (await headers()).get('cookie'), now: new Date() },
    { record: pilotRecord },
  );
  const stats = packStats();

  if (gate.status === 'unconfigured') {
    return (
      <Refusal org="Pilot access" snapshot={stats.legalSnapshot}>
        <h1 className="ds-h4" style={{ marginBottom: 16 }}>Pilot access is not configured</h1>
        <p style={bannerStyle}>
          <strong>This server cannot check a session, so it shows no record to anyone.</strong>
        </p>
        <ul style={{ margin: '0 0 22px 18px', padding: 0, fontSize: 13, lineHeight: 1.6 }}>
          {gate.problems.map((problem) => (
            <li key={problem} className="ds-mono" style={{ fontSize: 12 }}>{problem}</li>
          ))}
        </ul>
        <p className="ds-micro">NO PROFILE WAS READ · EACH PROBLEM NAMES A VARIABLE, NEVER ITS VALUE</p>
      </Refusal>
    );
  }

  if (gate.status === 'denied') {
    const message = accessReasonMessage(gate.reason);
    return (
      <Refusal org="Pilot access" snapshot={stats.legalSnapshot}>
        <h1 className="ds-h4" style={{ marginBottom: 16 }}>Sign in to view this record</h1>
        {message === null ? null : <p style={bannerStyle}>{message}</p>}
        <p style={{ marginBottom: 22 }}>
          <Link className="ds-btn ds-btn-primary" href="/pilot-access">Go to pilot access</Link>
        </p>
        <p className="ds-micro">NO PROFILE WAS READ FOR THIS REQUEST</p>
      </Refusal>
    );
  }

  const record = gate.record;

  if (!record.ok) {
    const { error } = record;
    return (
      <Refusal org="No profile loaded" snapshot={stats.legalSnapshot} session={{ expiresAt: gate.expiresAt }}>
        <h1 className="ds-h4" style={{ marginBottom: 16 }}>No profile could be loaded</h1>
        <p style={bannerStyle}>
          <strong>{error.headline}</strong>
        </p>
        {error.problems.length > 0 ? (
          <ul style={{ margin: '0 0 22px 18px', padding: 0, fontSize: 13, lineHeight: 1.6 }}>
            {error.problems.map((problem) => (
              <li key={problem} className="ds-mono" style={{ fontSize: 12 }}>{problem}</li>
            ))}
          </ul>
        ) : null}
        <p className="ds-micro">
          THE VARIABLE IS {PILOT_PROFILE_ENV} · THE SERVER LOG CARRIES THE PATH AND THE SYSTEM ERROR · NOTHING IS
          SUBSTITUTED FOR THE CONFIGURED PROFILE
        </p>
      </Refusal>
    );
  }

  const { document, assessment: result, pack } = record;
  const entities = entityColumns(document);
  const organisation = document.profile.scopeObjects.find((scope) => scope.type === 'organization');
  const columns = [...(organisation === undefined ? [] : [{ id: organisation.id, name: organisation.name, short: 'Organisation' }]), ...entities];
  const rows = requirementStatusRows(pack, result, columns.map((column) => column.id));
  const facts = factRows(document, pack);
  const summary = statusSummary(pack);
  const notice = historicalEvidenceNotice(S002_R5_DOSSIER, pack);
  const isSynthetic = document.record.kind === 'synthetic';
  const label = isSynthetic ? 'Synthetic development profile' : 'Pilot record · evaluation';

  const dutyByEntity = new Map(
    result.determinations.filter((d) => d.requirementId === 'CSRD-S-014').map((d) => [d.scopeId, d]),
  );

  // A row is drawn from the engine only for a regime the register says the
  // engine answers for — supported or draft; a planned or monitored regime has
  // no pack and no determinations, and its cells say so.
  const coverage = siteCoverage();
  const chartRows: ChartRow[] = coverage.map((r) => {
    const encoded = r.status === 'draft' || r.status === 'supported';
    return {
      regime: r.short,
      status: r.status,
      encoded,
      cells: entities.map((e) => {
        if (!encoded) return { entity: e.short, state: 'unencoded' as CellState };
        const d = dutyByEntity.get(e.id);
        return {
          entity: e.short,
          state: d ? CELL[d.result] : 'unencoded',
          note: d?.reason,
        };
      }),
    };
  });

  const counts = {
    applies: result.determinations.filter((d) => d.result === 'APPLIES').length,
    not: result.determinations.filter((d) => d.result === 'DOES_NOT_APPLY').length,
    judgment: result.determinations.filter((d) => d.result === 'INDETERMINATE').length,
  };

  // The one orange surface: a real dated expectation from the pack's watch
  // list, shown with the item's own title rather than a name written here.
  const dated = pack.changeWatch.find((c) => /\b\d{1,2} \w+ 20\d\d\b/.test(c.expected ?? ''));
  const datedText = dated?.expected?.match(/([A-Z][a-z]+ ?\w* ?)?(\d{1,2} \w+ 20\d\d)/)?.[2];
  const nextDated = dated !== undefined && datedText !== undefined ? { title: dated.title, date: datedText } : undefined;

  // Regimes the register reads as monitored: none until a scanner has checked
  // every surface within cadence, so the count is derived, never a literal 0.
  const monitored = coverage.filter((r) => r.status === 'monitored').length;

  const signed = summary.verified + summary.ratified;

  return (
    <div className="ds-app" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar org={document.record.name} label={label} snapshot={stats.legalSnapshot} session={{ expiresAt: gate.expiresAt }} />

        <main id="main" className="ds-app-main" style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0, padding: 24 }}>
            <h1 className="ds-h4" style={{ marginBottom: 16 }}>
              Home · {document.record.name}
            </h1>
            <p style={bannerStyle}>
              {isSynthetic ? (
                <>
                  <strong>Synthetic development profile.</strong> {document.record.note} No pilot profile is configured
                  ({PILOT_PROFILE_ENV} is unset).{' '}
                </>
              ) : (
                <>
                  <strong>Pilot record · evaluation only.</strong> {document.record.note} Facts as stated by{' '}
                  {document.record.name}{document.record.statedOn ? ` on ${document.record.statedOn}` : ''}, each with its
                  source; nothing is inferred from an absent or unknown fact.{' '}
                </>
              )}
              Every determination, count and citation below is real: the profile is fed to the applicability engine and
              this page renders what came back.{' '}
              {result.containsDraftContent
                ? 'Requirement content is draft and unratified. '
                : 'Every requirement evaluated here carries a governing signature. '}
              {stats.ratifiedCountryPacks === 0
                ? 'No country pack is ratified, so national-law status requires review and no result is a final legal conclusion. '
                : ''}
              Not for reliance.
            </p>

            <p className="ds-mono" style={{ fontSize: 13, color: 'var(--ds-text-nav)', marginBottom: 4 }}>
              No change monitoring runs yet.
            </p>
            <p className="ds-micro" style={{ marginBottom: 24 }}>
              {stats.pendingActs} PENDING ACTS LISTED FROM THE PACK · NONE IN FORCE · EACH CHANGES NOTHING UNTIL IT APPLIES
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
                  <h2 className="ds-h4">Regulatory Universe: cross-section view</h2>
                  <p className="ds-micro" style={{ marginTop: 4 }}>
                    CSRD ROW = REPORTING-DUTY DETERMINATION PER ENTITY (CSRD-S-014)
                  </p>
                </div>
              </div>
              <CrossSectionChart rows={chartRows} columns={entities.map((e) => e.short)} />
              <p className="ds-micro" style={{ borderTop: '1px solid var(--ds-hairline-1)', marginTop: 16, paddingTop: 12 }}>
                {stats.sources} OFFICIAL SOURCES · PACK {stats.version} · ASSESSED {document.context.assessmentDate} · FY{' '}
                {document.context.financialYear.start} → {document.context.financialYear.end}
              </p>
            </div>

            {/* requirements: results per scope object, status per requirement */}
            <div className="ds-card" style={{ padding: 20, marginBottom: 22 }}>
              <h2 className="ds-h4" style={{ marginBottom: 6 }}>Requirements · results and verification status</h2>
              <p className="ds-micro" style={{ marginBottom: 14 }}>
                {signed} OF {stats.requirements} CARRY A GOVERNING SIGNATURE · {summary.ratified} RATIFIED · {summary.verified}{' '}
                VERIFIED · {summary.draft} DRAFT · ● APPLIES ○ DOES NOT APPLY ◐ REQUIRES JUDGMENT — NOT EVALUATED FOR THIS OBJECT
              </p>
              <div className="ds-scroll-x">
                <table style={cardTable}>
                  <caption className="ds-vh">Each requirement&apos;s determination per scope object, with its verification status as loaded.</caption>
                  <thead>
                    <tr>
                      <th scope="col" style={th}>Requirement</th>
                      <th scope="col" style={th}>Status</th>
                      {columns.map((column) => (
                        <th key={column.id} scope="col" style={{ ...th, textAlign: 'center' }} title={column.name}>
                          <span className="ds-mono" style={{ fontSize: 9.5, letterSpacing: '.04em', color: 'var(--ds-text-muted)' }}>{column.short}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 500 }}>
                          <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-text-faint)' }}>{row.id} · v{row.version}</span>
                          <br />
                          {row.title}
                        </th>
                        <td style={td}>
                          <StatusChip>{row.status}</StatusChip>
                          {row.reasons.length > 0 ? (
                            <span className="ds-micro" style={{ display: 'block', marginTop: 4 }}>{row.reasons.join(', ').replace(/_/g, ' ')}</span>
                          ) : null}
                        </td>
                        {columns.map((column) => {
                          const cell = row.results[column.id];
                          return (
                            <td key={column.id} style={{ ...td, textAlign: 'center' }} title={cellTitle(column.name, cell)}>
                              <span aria-label={cellTitle(column.name, cell)} style={{ color: cell?.result === 'INDETERMINATE' ? 'var(--ds-oxide)' : undefined }}>
                                {cell === undefined ? '—' : GLYPH[cell.result]}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* obligations */}
            <div className="ds-card" style={{ padding: 20, marginBottom: 22 }}>
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
                  + {result.obligations.length - 6} MORE · EACH TRACING BACK TO THE DETERMINATION THAT CREATED IT
                </p>
              ) : null}
              {result.obligations.length === 0 ? (
                <p className="ds-micro">NONE INSTANTIATED · AN OBLIGATION FIRES ONLY FROM AN IN-FORCE REQUIREMENT THAT APPLIES</p>
              ) : null}
            </div>

            {/* stated facts */}
            <details className="ds-card" style={{ padding: 20, marginBottom: 22 }}>
              <summary className="ds-h4" style={{ cursor: 'pointer' }}>Stated facts · {facts.length}</summary>
              <p className="ds-micro" style={{ margin: '8px 0 14px' }}>
                EVERY FACT AS STATED, WITH ITS SOURCE · A STATED UNKNOWN STAYS UNKNOWN · AN UNCONFIRMED FACT IS NEVER SEEN BY THE EVALUATOR
              </p>
              <div className="ds-scroll-x">
                <table style={cardTable}>
                  <caption className="ds-vh">The facts of the profile, each with its source and confirmation.</caption>
                  <thead>
                    <tr>
                      <th scope="col" style={th}>Scope object</th>
                      <th scope="col" style={th}>Fact</th>
                      <th scope="col" style={th}>Value</th>
                      <th scope="col" style={th}>Source</th>
                      <th scope="col" style={th}>Standing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facts.map((fact, i) => (
                      <tr key={`${fact.scopeId}-${fact.factType}-${i}`}>
                        <td style={td}>{fact.scopeName}</td>
                        <td style={td}>
                          {fact.label}
                          <br />
                          <span className="ds-mono" style={{ fontSize: 10.5, color: 'var(--ds-text-faint)' }}>{fact.factType}</span>
                        </td>
                        <td style={td}>{fact.value}</td>
                        <td style={td}>{fact.source}{fact.asOf ? ` · as of ${fact.asOf}` : ''}</td>
                        <td style={td}>{fact.confirmed ? <NeutralChip>confirmed</NeutralChip> : <CapacityChip>unconfirmed · not used</CapacityChip>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* verification evidence: the r5 dossier, labelled by what it binds */}
            <div className="ds-card" style={{ padding: 20 }}>
              <h2 className="ds-h4" style={{ marginBottom: 6 }}>Verification evidence · {S002_R5_DOSSIER.requirementId}</h2>
              <p className="ds-micro" style={{ marginBottom: 14 }}>
                THE ONE MODEL-PRODUCED VERIFICATION RECORD ON FILE · READ AND DISPOSITIONED BY THE AUTHOR · SHOWN FOR WHAT IT BINDS
              </p>
              <p style={{ ...bannerStyle, marginBottom: 12 }}>
                <strong>{notice.bindsCurrent ? 'Binds the current text.' : 'Historical evidence for version ' + notice.boundVersion + '.'}</strong>{' '}
                {notice.headline}
              </p>
              <p style={{ fontSize: 13, lineHeight: 1.55, maxWidth: '86ch', marginBottom: 14 }}>{notice.standing}</p>
              <dl className="ds-mono" style={{ fontSize: 11.5, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', marginBottom: 14 }}>
                <dt style={{ color: 'var(--ds-text-faint)' }}>execution</dt><dd style={{ margin: 0 }}>{S002_R5_DOSSIER.executionId} · {S002_R5_DOSSIER.startedAt} → {S002_R5_DOSSIER.finishedAt} · {S002_R5_DOSSIER.adapter}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>manifest</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{S002_R5_DOSSIER.manifestSha256}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>run</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{S002_R5_DOSSIER.runId}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>pipeline</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>{S002_R5_DOSSIER.pipelineVersion}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>bound input</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>version {notice.boundVersion} · {notice.boundInputSha256}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>current input</dt><dd style={{ margin: 0, wordBreak: 'break-all' }}>version {notice.currentVersion} · {notice.currentInputSha256}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>record</dt><dd style={{ margin: 0 }}>{S002_R5_DOSSIER.counts.readingElements} reading elements · {S002_R5_DOSSIER.counts.challenges} challenges · {S002_R5_DOSSIER.counts.evidenceSets} evidence sets · {S002_R5_DOSSIER.counts.quotes} quotes</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>verdicts</dt><dd style={{ margin: 0 }}>{S002_R5_DOSSIER.verdicts.confirmed} CONFIRMED · {S002_R5_DOSSIER.verdicts.mismatch} MISMATCH · {S002_R5_DOSSIER.verdicts.openQuestion} OPEN_QUESTION · the signing gate refuses MISMATCH and OPEN_QUESTION categorically</dd>
              </dl>
              <h3 className="ds-label" style={{ marginBottom: 8 }}>The twelve verdicts, dispositioned by the author (2026-10-19)</h3>
              {S002_R5_DOSSIER.dispositions.map((d, i) => (
                <div key={d.issue} style={{ borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)', padding: '10px 0', fontSize: 13, lineHeight: 1.5 }}>
                  <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-text-faint)', marginRight: 8 }}>{d.issue}</span>
                  <strong>{d.title}</strong>
                  <span className="ds-micro" style={{ display: 'block', margin: '3px 0' }}>{d.verdicts}</span>
                  {d.disposition}
                </div>
              ))}
              <p className="ds-micro" style={{ borderTop: '1px solid var(--ds-hairline-1)', marginTop: 12, paddingTop: 12 }}>
                TRANSCRIBED FROM {S002_R5_DOSSIER.records.join(' AND ')} · THE SEALED EXECUTION RECORD IS HELD OUTSIDE THE REPOSITORY UNDER ITS ID AND MANIFEST DIGEST
              </p>
            </div>
          </div>

          {/* rail */}
          <aside
            className="ds-app-rail"
            style={{ width: 320, flex: 'none', borderLeft: '1px solid var(--ds-ink)', background: 'var(--ds-panel)', padding: 20 }}
            aria-label="Pending acts and record health"
          >
            <p className="ds-label" style={{ marginBottom: 14 }}>Pending acts · from the pack</p>
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

            {nextDated ? (
              <div style={{ marginTop: 20 }}>
                <p className="ds-label" style={{ marginBottom: 10 }}>Next dated expectation</p>
                {/* The chip never wraps and the item's title is a sentence, so the chip
                    carries the date and the title is printed beneath it. */}
                <DeadlineChip>{`EXPECTED ${nextDated.date.toUpperCase()}`}</DeadlineChip>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ds-text-body)', marginTop: 8 }}>{nextDated.title}</p>
                <p className="ds-micro" style={{ marginTop: 5 }}>
                  PENDING. IT CHANGES NOTHING UNTIL IT IS IN FORCE.
                </p>
              </div>
            ) : null}

            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p className="ds-label">Record health</p>
              {/* Derived lines, not bars at 100: "encoded" and "cited" are not grades
                  the ledger or the register gives, so nothing here is scored. */}
              <dl className="ds-mono" style={{ fontSize: 11.5, display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', margin: 0 }}>
                <dt style={{ color: 'var(--ds-text-faint)' }}>requirements signed</dt><dd style={{ margin: 0 }}>{signed} OF {stats.requirements}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>sources listed</dt><dd style={{ margin: 0 }}>{stats.sources}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>regimes monitored</dt><dd style={{ margin: 0 }}>{monitored}</dd>
                <dt style={{ color: 'var(--ds-text-faint)' }}>country packs ratified</dt><dd style={{ margin: 0 }}>{stats.ratifiedCountryPacks}</dd>
              </dl>
              <EvidenceBar
                label="Governing signatures"
                value={Math.round((signed / stats.requirements) * 100)}
                note={`${signed} OF ${stats.requirements} SIGNED · ${summary.ratified} RATIFIED · THE PROTOTYPE GATE`}
              />
              <EvidenceBar
                label="Country packs ratified"
                value={0}
                note={`${stats.ratifiedCountryPacks} · NATIONAL LAW STILL REQUIRES REVIEW`}
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
