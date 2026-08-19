'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, CapacityChip, NeutralChip, StatusChip } from '@/components/ui/primitives';
import {
  EMPLOYEE_BANDS, EU_COUNTRIES, EU_TURNOVER_OPTIONS, FINANCIAL_YEARS, GOVERNING_CHOICES,
  GROUP_POSITIONS, LEGAL_FORMS, NON_EU_COUNTRIES, TURNOVER_BANDS, YES_NO_UNSURE,
  isEu, stepEightIsParentReport, type CheckerAnswers, type Option,
} from '@/lib/checker';
import { WATCHED } from '@/lib/regimes';

interface Verdict {
  id: string; title: string; decisionArea: string;
  result: 'APPLIES' | 'DOES_NOT_APPLY' | 'INDETERMINATE';
  selected?: string; reason?: string; reasonCopy?: string;
  needs: { factType: string; label: string }[];
  sources: { id: string; title: string; url: string }[];
  provisions?: string; caution?: string;
}
interface CheckResponse {
  assessedAt: string;
  financialYear: { start: string; end: string };
  pack: { version: string; legalSnapshot: string; program: string };
  containsDraftContent: boolean;
  headline: string;
  nationalLawResolved: boolean;
  counts: { applies: number; doesNotApply: number; indeterminate: number };
  determinations: Verdict[];
  obligations: { id: string; obligation: string; ownerRole: string; deadlineLogic: string; evidenceExpectation: string; derivedFrom: string[] }[];
  gaps: { id: string; test: string; priority: string; firstAction: string }[];
  nextQuestions: { id: string; text: string; whyAsked: string; unblocks: number }[];
}

const VERDICT = {
  APPLIES: { glyph: '●', label: 'Applies' },
  DOES_NOT_APPLY: { glyph: '○', label: 'Does not apply' },
  INDETERMINATE: { glyph: '◐', label: 'Not resolved' },
} as const;

function Chips({ options, value, onPick, name }: { options: Option[]; value?: string; onPick: (id: string) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(o.id)}
            style={{
              border: `1px solid ${on ? 'var(--ds-oxide)' : 'var(--ds-hairline-2)'}`,
              background: on ? 'var(--ds-oxide)' : 'var(--ds-paper)',
              color: on ? '#fff' : 'var(--ds-text)',
              padding: '13px 16px', textAlign: 'left', minWidth: 150,
              transition: 'background 150ms linear, border-color 150ms linear',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14.5, display: 'block' }}>{o.label}</span>
            {o.hint ? (
              <span className="ds-mono" style={{ fontSize: 9, letterSpacing: '.06em', display: 'block', marginTop: 4, color: on ? 'rgba(255,255,255,.78)' : 'var(--ds-text-ghost)' }}>
                {o.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function CheckFlow() {
  const [a, setA] = useState<CheckerAnswers>({ financialYear: '2027' });
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const parentRoute = stepEightIsParentReport(a);

  const steps = [
    {
      q: 'Where is the entity incorporated?',
      why: 'Q-003 · routes EU / non-EU scope and the governing Member State.',
      answered: Boolean(a.country),
      node: (
        <select
          className="ds-input" style={{ maxWidth: 340 }} value={a.country ?? ''}
          onChange={(e) => setA((p) => ({ ...p, country: e.target.value || undefined }))}
          aria-label="Country of incorporation"
        >
          <option value="">Select a country…</option>
          <optgroup label="EU Member States">
            {EU_COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </optgroup>
          <optgroup label="Outside the EU">
            {NON_EU_COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </optgroup>
        </select>
      ),
    },
    {
      q: 'What is its legal form?',
      why: 'Q-003 · the Accounting Directive perimeter is defined by legal form, not by size.',
      answered: Boolean(a.legalForm),
      node: <Chips name="Legal form" options={LEGAL_FORMS} value={a.legalForm} onPick={(id) => setA((p) => ({ ...p, legalForm: id }))} />,
    },
    {
      q: 'Which financial year are you assessing?',
      why: 'Q-004 · determines the threshold period, the wave and any transitional option.',
      answered: Boolean(a.financialYear),
      node: <Chips name="Financial year" options={FINANCIAL_YEARS} value={a.financialYear} onPick={(id) => setA((p) => ({ ...p, financialYear: id }))} />,
    },
    {
      q: 'Where does it sit in a group?',
      why: 'Q-005 · selects the individual, consolidated and exemption routes.',
      answered: Boolean(a.groupPosition),
      node: <Chips name="Group position" options={GROUP_POSITIONS} value={a.groupPosition} onPick={(id) => setA((p) => ({ ...p, groupPosition: id as CheckerAnswers['groupPosition'] }))} />,
    },
    {
      q: 'Net turnover for that financial year',
      why: 'Q-007 · Article 19a turns on EUR 450 million. A band that crosses it stays unresolved — deliberately.',
      answered: Boolean(a.turnover),
      node: <Chips name="Net turnover" options={TURNOVER_BANDS} value={a.turnover} onPick={(id) => setA((p) => ({ ...p, turnover: id }))} />,
    },
    {
      q: 'Average number of employees',
      why: 'Q-008 · the second cumulative threshold: 1,000 employees during the financial year.',
      answered: Boolean(a.employees),
      node: <Chips name="Average employees" options={EMPLOYEE_BANDS} value={a.employees} onPick={(id) => setA((p) => ({ ...p, employees: id }))} />,
    },
    {
      q: 'Did this entity report under CSRD for financial year 2024?',
      why: 'Q-011 · identifies first-wave status and the FY2025–26 transition questions.',
      answered: Boolean(a.reportedFy2024),
      node: <Chips name="FY2024 reporting" options={YES_NO_UNSURE} value={a.reportedFy2024} onPick={(id) => setA((p) => ({ ...p, reportedFy2024: id }))} />,
    },
    parentRoute
      ? {
          q: "Is the entity included in a parent's qualifying consolidated sustainability report?",
          why: 'Q-014 · the subsidiary exemption route. An exempt subsidiary must not be handed reporting obligations.',
          answered: Boolean(a.parentReport),
          node: <Chips name="Parent report" options={YES_NO_UNSURE} value={a.parentReport} onPick={(id) => setA((p) => ({ ...p, parentReport: id }))} />,
        }
      : isEu(a.country)
      ? {
          q: "Which Member State's accounting law governs the entity?",
          why: 'Q-012 · selects national transposition, options, filing and publication rules.',
          answered: a.governingChoice === 'same' || a.governingChoice === 'unknown' || (a.governingChoice === 'other' && Boolean(a.governingState)),
          node: (
            <>
              <Chips
                name="Governing Member State"
                options={GOVERNING_CHOICES.map((o) =>
                  o.id === 'same'
                    ? { ...o, label: `${EU_COUNTRIES.find((c) => c.id === a.country)?.label ?? 'The country of incorporation'}` }
                    : o,
                )}
                value={a.governingChoice}
                onPick={(id) => setA((p) => ({ ...p, governingChoice: id as CheckerAnswers['governingChoice'], governingState: id === 'other' ? p.governingState : undefined }))}
              />
              {a.governingChoice === 'other' ? (
                <select
                  className="ds-input" style={{ maxWidth: 340, marginTop: 16 }}
                  aria-label="Governing Member State"
                  value={a.governingState ?? ''}
                  onChange={(e) => setA((p) => ({ ...p, governingState: e.target.value || undefined }))}
                >
                  <option value="">Select a Member State…</option>
                  {EU_COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              ) : null}
              {a.governingChoice === 'unknown' ? (
                <p className="ds-micro" style={{ marginTop: 14, maxWidth: '56ch' }}>
                  Left unanswered, so the national-law gate stays unresolved rather than assuming an answer.
                </p>
              ) : null}
            </>
          ),
        }
      : {
          q: 'Does the group generate more than €450 million of turnover inside the EU?',
          why: 'Q-016 · Article 40a. A non-EU group comes into scope through EU turnover, not through this entity\'s own thresholds — and the test must be met in each of the last two financial years.',
          answered: Boolean(a.euTurnover),
          node: (
            <>
              <Chips name="EU turnover" options={EU_TURNOVER_OPTIONS} value={a.euTurnover} onPick={(id) => setA((p) => ({ ...p, euTurnover: id as CheckerAnswers['euTurnover'] }))} />
              <p className="ds-micro" style={{ marginTop: 14, maxWidth: '58ch' }}>
                A non-EU entity has no governing Member State for the CSRD test, so the engine looks at the
                Article 40a third-country route instead.
              </p>
            </>
          ),
        },
  ];

  const total = steps.length;
  const current = steps[step];
  const allAnswered = steps.every((s) => s.answered);

  async function run() {
    setRunning(true); setError(null);
    try {
      const res = await fetch('/api/check', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(a),
      });
      if (!res.ok) throw new Error(`The engine returned ${res.status}.`);
      setReport((await res.json()) as CheckResponse);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error
        ? `${e.message} No determination was produced — nothing below should be read as an answer.`
        : 'The check could not be completed.');
    } finally { setRunning(false); }
  }

  if (report) return <Report data={report} onRestart={() => { setReport(null); setStep(0); }} />;

  return (
    <div className="ds-gutter" style={{ paddingBlock: 'clamp(40px, 6vw, 72px)' }}>
      <div style={{ maxWidth: 780 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
          <p className="ds-mono ds-oxide" style={{ fontSize: 11, letterSpacing: '.2em' }}>
            STEP {String(step + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </p>
          <p className="ds-micro">EVERY QUESTION IS A FACT THE LAW TURNS ON</p>
        </div>
        <div className="ds-bar-track" style={{ marginBottom: 40 }}>
          <div className="ds-bar-fill" style={{ width: `${((step + 1) / total) * 100}%`, transition: 'width 150ms linear' }} />
        </div>

        <h1 className="ds-h2" style={{ marginBottom: 12, maxWidth: '20ch' }}>{current.q}</h1>
        <p className="ds-mono" style={{ fontSize: 11, letterSpacing: '.08em', color: 'var(--ds-text-faint)', marginBottom: 28 }}>
          {current.why}
        </p>

        {current.node}

        {error ? (
          <p role="alert" style={{ marginTop: 28, border: '1px solid var(--ds-oxide)', background: 'var(--ds-oxide-wash)', color: 'var(--ds-oxide)', padding: '14px 16px', fontSize: 13.5 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 44, flexWrap: 'wrap' }}>
          {step > 0 ? <Button variant="secondary" small onClick={() => setStep((s) => s - 1)}>← Back</Button> : null}
          {step < total - 1 ? (
            <Button small onClick={() => setStep((s) => s + 1)} disabled={!current.answered}>Next →</Button>
          ) : (
            <Button onClick={run} loading={running} disabled={!allAnswered}>Run the check →</Button>
          )}
          <span className="ds-micro" style={{ marginLeft: 4 }}>
            {allAnswered ? 'EVALUATES EVERY REQUIREMENT IN THE CSRD PACK' : 'ANSWER THIS STEP TO CONTINUE'}
          </span>
        </div>
      </div>
    </div>
  );
}

function Group({ title, items }: { title: string; items: Verdict[] }) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginBottom: 40 }}>
      <p className="ds-label" style={{ marginBottom: 14 }}>{title} · {items.length}</p>
      <div>
        {items.map((v, i) => (
          <article key={v.id} style={{ borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)', padding: '18px 0' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-text-faint)', minWidth: 92 }}>{v.id}</span>
              <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-ink)' }} aria-hidden="true">{VERDICT[v.result].glyph}</span>
              <h3 className="ds-h4" style={{ fontFamily: 'var(--ds-font-ui)', fontSize: 15.5, flex: 1, minWidth: 220 }}>{v.title}</h3>
              {v.selected ? <CapacityChip>{v.selected}</CapacityChip> : null}
            </div>
            <div style={{ paddingLeft: 106, marginTop: 6 }}>
              {v.reasonCopy ? <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)' }}>{v.reasonCopy}.</p> : null}
              {v.needs.length > 0 ? (
                <p className="ds-body-sm" style={{ marginTop: 6 }}>
                  <span className="ds-mono" style={{ fontSize: 9.5, letterSpacing: '.16em', color: 'var(--ds-text-faint)' }}>RESOLVE WITH </span>
                  <strong>{v.needs.map((n) => n.label).join(' · ')}</strong>
                </p>
              ) : null}
              <p className="ds-micro" style={{ marginTop: 8 }}>
                {v.sources.map((s, j) => (
                  <span key={s.id}>
                    {j > 0 ? ' · ' : ''}
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--ds-oxide)' }}>{s.id}</a> : s.id}
                  </span>
                ))}
                {v.provisions ? ` — ${v.provisions}` : ''}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Report({ data, onRestart }: { data: CheckResponse; onRestart: () => void }) {
  const by = (r: Verdict['result']) => data.determinations.filter((d) => d.result === r);
  return (
    <div className="ds-gutter" style={{ paddingBlock: 'clamp(40px, 6vw, 72px)' }}>
      <p className="ds-mono ds-oxide" style={{ fontSize: 11, letterSpacing: '.2em', marginBottom: 20 }}>YOUR RESULT · PRELIMINARY</p>
      <h1 className="ds-h2" style={{ maxWidth: '26ch', marginBottom: 22 }}>{data.headline}</h1>

      {data.containsDraftContent ? (
        <p style={{ border: '1px solid var(--ds-oxide)', background: 'var(--ds-oxide-wash)', padding: '14px 16px', maxWidth: '74ch', marginBottom: 28, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ds-text-body)' }}>
          <strong>Prototype — unratified content.</strong> These determinations run on draft requirement
          records that have not been expert-ratified, from answers you stated rather than documents we
          sourced. Not for reliance.
        </p>
      ) : null}

      <div className="ds-shelf" style={{ marginBottom: 12 }}>
        <div className="ds-shelf-cell"><div className="ds-stat">{data.counts.applies}</div><div className="ds-stat-sub">Applies</div></div>
        <div className="ds-shelf-div" />
        <div className="ds-shelf-cell"><div className="ds-stat">{data.counts.doesNotApply}</div><div className="ds-stat-sub">Does not apply</div></div>
        <div className="ds-shelf-div" />
        <div className="ds-shelf-cell"><div className="ds-stat ds-oxide">{data.counts.indeterminate}</div><div className="ds-stat-sub">Not resolved</div></div>
        <div className="ds-shelf-div" />
        <div className="ds-shelf-cell"><div className="ds-stat">{data.obligations.length}</div><div className="ds-stat-sub">Obligations instantiated</div></div>
      </div>
      <p className="ds-micro" style={{ marginBottom: 44 }}>
        ASSESSED {data.assessedAt} · FY {data.financialYear.start} → {data.financialYear.end} ·{' '}
        {data.pack.program} PACK {data.pack.version} · LEGAL SNAPSHOT {data.pack.legalSnapshot}
      </p>

      <Group title="Applies" items={by('APPLIES')} />
      <Group title="Not resolved" items={by('INDETERMINATE')} />
      <Group title="Does not apply" items={by('DOES_NOT_APPLY')} />

      {data.obligations.length > 0 ? (
        <section style={{ marginBottom: 40 }}>
          <p className="ds-label" style={{ marginBottom: 14 }}>Obligations instantiated · {data.obligations.length}</p>
          {data.obligations.map((o, i) => (
            <div key={o.id} style={{ borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)', padding: '16px 0' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span className="ds-mono" style={{ fontSize: 11, color: 'var(--ds-text-faint)', minWidth: 92 }}>{o.id}</span>
                <p style={{ fontSize: 15, flex: 1, minWidth: 240 }}>{o.obligation}</p>
                <NeutralChip>{o.ownerRole}</NeutralChip>
              </div>
              <p className="ds-micro" style={{ paddingLeft: 106, marginTop: 6 }}>
                {o.deadlineLogic} · FROM {o.derivedFrom.join(', ')}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {data.nextQuestions.length > 0 ? (
        <section style={{ marginBottom: 40 }}>
          <p className="ds-label" style={{ marginBottom: 14 }}>What we would ask next</p>
          {data.nextQuestions.map((q, i) => (
            <div key={q.id} style={{ borderTop: i === 0 ? '1px solid var(--ds-ink)' : '1px solid var(--ds-hairline-1)', padding: '16px 0', display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="ds-mono ds-oxide" style={{ fontSize: 11, minWidth: 92 }}>{q.id}</span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <p style={{ fontSize: 15 }}>{q.text}</p>
                <p className="ds-micro" style={{ marginTop: 4 }}>{q.whyAsked}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="ds-panel" style={{ border: '1px solid var(--ds-hairline-2)', padding: 24, maxWidth: '78ch', marginBottom: 32 }}>
        <p className="ds-label" style={{ marginBottom: 12 }}>What this result is not</p>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!data.nationalLawResolved ? (
            <li className="ds-body-sm">
              Not a final legal conclusion. CSRD is directive-based law and no country pack is ratified yet,
              so national transposition, filing calendar and exercised options still require review.
            </li>
          ) : null}
          <li className="ds-body-sm">
            Not evidenced. You stated these facts; a real profile replaces them with sourced, dated documents.
          </li>
          <li className="ds-body-sm">
            Not the whole regulatory picture. This check covers CSRD only.{' '}
            {WATCHED.map((r) => r.short).join(', ')} are watched but not yet encoded, so they are neither
            included nor excluded here.
          </li>
        </ul>
      </section>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="secondary" onClick={onRestart}>← Run another check</Button>
        <Link className="ds-btn ds-btn-primary" href="/dashboard">See how this is maintained →</Link>
      </div>
    </div>
  );
}
