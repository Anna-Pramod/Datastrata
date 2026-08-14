'use client';

import { useState } from 'react';
import {
  EMPLOYEE_BANDS,
  EU_COUNTRIES,
  GROUP_POSITIONS,
  LEGAL_FORMS,
  NON_EU_COUNTRIES,
  TURNOVER_BANDS,
  type CheckerAnswers,
} from '@/lib/checker';

interface Verdict {
  id: string;
  title: string;
  decisionArea: string;
  result: 'APPLIES' | 'DOES_NOT_APPLY' | 'INDETERMINATE';
  selected?: string;
  reason?: string;
  reasonCopy?: string;
  needs: { factType: string; label: string; reason: string }[];
  sources: { id: string; title: string; url: string }[];
  provisions?: string;
  caution?: string;
}

interface CheckResponse {
  assessedAt: string;
  financialYear: { start: string; end: string };
  pack: { id: string; version: string; legalSnapshot: string; program: string };
  containsDraftContent: boolean;
  headline: string;
  nationalLawResolved: boolean;
  counts: { applies: number; doesNotApply: number; indeterminate: number };
  results: Verdict[];
  obligations: { id: string; obligation: string; deadlineLogic: string }[];
  nextQuestions: { id: string; text: string; whyAsked: string; unblocks: number }[];
}

const BADGE: Record<Verdict['result'], { glyph: string; label: string; className: string }> = {
  APPLIES: { glyph: '●', label: 'Applies', className: 'badge badge-applies' },
  DOES_NOT_APPLY: { glyph: '○', label: 'Does not apply', className: 'badge badge-not' },
  INDETERMINATE: { glyph: '◐', label: 'Not resolved', className: 'badge badge-indeterminate' },
};

function ChipGroup({
  legend,
  why,
  options,
  value,
  onChange,
}: {
  legend: string;
  why: string;
  options: { id: string; label: string; hint?: string }[];
  value?: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="step-label">{legend}</legend>
      <span className="step-why">{why}</span>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className="chip"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
          >
            {o.label}
            {o.hint ? <span className="chip-hint">{o.hint}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Checker() {
  const [answers, setAnswers] = useState<CheckerAnswers>({});
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const set = (patch: Partial<CheckerAnswers>) => {
    setAnswers((a) => ({ ...a, ...patch }));
    setResult(null);
    setError(null);
  };

  const ready = Boolean(answers.country && answers.legalForm && answers.groupPosition);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error(`The engine returned ${res.status}.`);
      setResult((await res.json()) as CheckResponse);
    } catch (e) {
      // Truth-preserving error state (brief §14): say what failed, claim nothing.
      setError(
        e instanceof Error
          ? `${e.message} No determination was produced — nothing below should be read as an answer.`
          : 'The check could not be completed.',
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="section" id="checker" aria-labelledby="checker-h">
      <div className="wrap">
        <div className="card card-dark checker">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="eyebrow eyebrow-light">Free checker</span>
            <span className="checker-sub">no sign-up · runs the real engine</span>
          </div>
          <h2 id="checker-h">Does CSRD reporting apply to your entity?</h2>
          <p className="checker-sub" style={{ maxWidth: 620, marginTop: 10 }}>
            Five questions, each one a fact the law actually turns on. Answer with a band if that is all you
            have — where a band crosses a legal threshold we will tell you so instead of guessing.
          </p>

          <div className="steps">
            <div>
              <label className="step-label" htmlFor="country">Where is the entity incorporated?</label>
              <span className="step-why">Routes EU / non-EU scope and the governing Member State.</span>
              <select
                id="country"
                className="select"
                value={answers.country ?? ''}
                onChange={(e) => set({ country: e.target.value || undefined })}
              >
                <option value="">Select a country…</option>
                <optgroup label="EU Member States">
                  {EU_COUNTRIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Outside the EU">
                  {NON_EU_COUNTRIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <ChipGroup
              legend="What is its legal form?"
              why="The Accounting Directive perimeter is defined by legal form, not by size."
              options={LEGAL_FORMS}
              value={answers.legalForm}
              onChange={(id) => set({ legalForm: id })}
            />

            <ChipGroup
              legend="Where does it sit in a group?"
              why="Selects the individual, consolidated and exemption routes."
              options={GROUP_POSITIONS}
              value={answers.groupPosition}
              onChange={(id) => set({ groupPosition: id as CheckerAnswers['groupPosition'] })}
            />

            <ChipGroup
              legend="Net turnover for the financial year"
              why="Article 19a turns on EUR 450 million. A band that crosses it stays unresolved — deliberately."
              options={TURNOVER_BANDS}
              value={answers.turnover}
              onChange={(id) => set({ turnover: id })}
            />

            <ChipGroup
              legend="Average number of employees"
              why="The second cumulative threshold: 1,000 employees during the financial year."
              options={EMPLOYEE_BANDS}
              value={answers.employees}
              onChange={(id) => set({ employees: id })}
            />
          </div>

          <div className="checker-actions">
            <button type="button" className="btn btn-mustard" onClick={run} disabled={!ready || running}>
              {running ? <><span className="spinner" aria-hidden="true" /> Evaluating…</> : 'Run free check →'}
            </button>
            <span className="checker-note">
              {ready
                ? 'Evaluates every CSRD requirement in the pack against your answers.'
                : 'Answer the first three questions to run the check.'}
            </span>
          </div>

          {error ? <p className="error" role="alert">{error}</p> : null}

          {result ? <Result data={result} /> : null}
        </div>
      </div>
    </section>
  );
}

function Result({ data }: { data: CheckResponse }) {
  return (
    <div className="result" aria-live="polite">
      {data.containsDraftContent ? (
        <p className="result-banner">
          <strong>Prototype — unratified content.</strong> These determinations run on draft requirement
          records that have not yet been expert-ratified. Not for reliance.
        </p>
      ) : null}

      <p className="result-headline">{data.headline}</p>
      <p className="result-meta">
        {data.counts.applies} applies · {data.counts.doesNotApply} does not apply ·{' '}
        {data.counts.indeterminate} unresolved
        <br />
        Assessed {data.assessedAt} for FY {data.financialYear.start} → {data.financialYear.end} ·{' '}
        {data.pack.program} pack {data.pack.version}, legal snapshot {data.pack.legalSnapshot}
      </p>

      <div className="verdicts">
        {data.results.map((v) => {
          const badge = BADGE[v.result];
          return (
            <article key={v.id} className="verdict">
              <span className={badge.className}>
                <span aria-hidden="true">{badge.glyph}</span>
                {badge.label}
              </span>
              <h3 className="verdict-title">{v.title}</h3>
              <p className="verdict-id">{v.id} · {v.decisionArea}</p>
              {v.selected ? <p className="verdict-reason">Selected: {v.selected}</p> : null}
              {v.reasonCopy ? <p className="verdict-reason" style={{ marginTop: 8 }}>{v.reasonCopy}.</p> : null}
              {v.needs.length > 0 ? (
                <p className="verdict-needs">
                  Resolve with: <strong>{v.needs.map((n) => n.label).join(', ')}</strong>
                </p>
              ) : null}
              {v.sources.length > 0 ? (
                <p className="verdict-sources">
                  {v.sources.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 ? ' · ' : ''}
                      {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.id}</a> : s.id}
                    </span>
                  ))}
                  {v.provisions ? ` — ${v.provisions}` : ''}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      {!data.nationalLawResolved ? (
        <p className="caution">
          This is an EU-level screen, not a final legal conclusion. CSRD is directive-based law: no country
          pack is ratified yet, so the national transposition, filing calendar and exercised options for your
          Member State still require review.
        </p>
      ) : null}

      {data.nextQuestions.length > 0 ? (
        <>
          <p className="eyebrow eyebrow-light" style={{ marginTop: 22, display: 'block' }}>
            What we would ask next
          </p>
          <div className="next-q">
            {data.nextQuestions.map((q) => (
              <p key={q.id} className="next-q-item">
                <span>{q.id}</span>
                <span>
                  {q.text}
                  <span className="next-q-why">{q.whyAsked}</span>
                </span>
              </p>
            ))}
          </div>
        </>
      ) : null}

      <div className="checker-actions">
        {/* Placeholder destination until the product exists. */}
        <a className="btn btn-sm btn-cream" href="#pricing">Turn this into a sourced profile →</a>
        <span className="checker-note">
          A full profile replaces stated answers with sourced, dated facts — and keeps the answer current as
          the law moves.
        </span>
      </div>
    </div>
  );
}
