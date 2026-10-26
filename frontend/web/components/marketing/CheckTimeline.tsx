/**
 * The check's result, printed: the timeline's view model as a table, and the
 * error a failed check shows instead (DP1 plan, Task 6; CHK-2, CHK-3, EXP-3,
 * EXP-4, EXP-5, EXP-6).
 *
 * **Why this file exists.** The flow holds the answers and the request; this
 * holds no state and no effects, so what a visitor reads is a function of
 * `checkView`'s output alone and can be rendered and checked without a browser.
 * Every field the route sends reaches the markup (CHK-2, "rendered or not
 * sent"): what a visitor reads as words, and each code the words translate (a
 * state, a reason, a line's kind and requirement, a cell's needs) as a `data-`
 * attribute beside them, never as visible text. No word is chosen here; every
 * one comes from the view, and so from the approved wording.
 *
 * The table has row and column headers. Below 760 pixels its lines stack, each
 * cell carrying its own start year (`globals.css`, "the check"), and the roles
 * are written out because some browsers drop a table's meaning once its
 * display changes. A glyph is hidden from assistive technology: it repeats the
 * words beside it, so no state rests on the glyph or on colour alone (EXP-3).
 */

import type { Ref } from 'react';
import type { QuestionId } from '@/lib/check-answers';
import type { CheckView, StepView } from '@/lib/check-view';
import { ERROR_STATES, type ErrorState } from '@/lib/wording';

export function CheckTimeline({
  view,
  headingRef,
  onStep,
}: {
  view: CheckView;
  /** The result's heading, which the flow focuses when the result appears. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Takes the visitor to the question a step links. */
  onStep?: (question: QuestionId) => void;
}) {
  const span = view.columns.length;
  return (
    <section
      className="ds-timeline"
      data-check-result=""
      data-assessed-at={view.assessedAt}
      data-basis={view.basis}
      data-hypothetical={String(view.hypothetical)}
      data-preliminary={String(view.preliminary)}
      data-pack-id={view.pack.id}
      data-pack-version={view.pack.version}
      data-legal-snapshot={view.pack.legalSnapshot}
      data-draft={String(view.content.draft)}
      data-threshold={view.content.threshold}
      data-country={view.country ?? ''}
    >
      <h1 ref={headingRef} tabIndex={-1} className="ds-h2" data-label="preliminary" style={{ maxWidth: '26ch', marginBottom: 18 }}>
        {view.labels.heading}
      </h1>
      {view.labels.draft !== null ? (
        <p className="ds-timeline-draft" data-label="draft">
          {view.labels.draft}
        </p>
      ) : null}
      <p className="ds-body-sm" data-label="threshold" style={{ maxWidth: '74ch', marginTop: 14, color: 'var(--ds-text-body)' }}>
        {view.labels.threshold}
      </p>
      <p className="ds-micro ds-check-meta" style={{ marginTop: 10, marginBottom: 28 }}>
        ASSESSED {view.assessedAt} · {view.pack.id.toUpperCase()} PACK {view.pack.version} · LEGAL SNAPSHOT {view.pack.legalSnapshot}
      </p>

      <table role="table" className="ds-timeline-table">
        <thead role="rowgroup">
          <tr role="row">
            <td role="cell" />
            <th role="columnheader" scope="colgroup" colSpan={span} data-label="column-heading">
              {view.labels.columnHeading}
            </th>
          </tr>
          <tr role="row">
            <td role="cell" />
            {view.columns.map((column) => (
              <th key={column.startYear} role="columnheader" scope="col" data-start-year={column.startYear}>
                {column.heading}
              </th>
            ))}
          </tr>
        </thead>
        {view.rows.map((row) => (
          <tbody key={row.id} role="rowgroup" data-row={row.id}>
            <tr role="row">
              <th role="rowheader" scope="rowgroup" colSpan={span + 1} className="ds-timeline-route">
                {row.label}
                {row.note !== null ? <span className="ds-timeline-note">{row.note}</span> : null}
              </th>
            </tr>
            {row.lines.map((line) => (
              <tr key={line.requirement} role="row" data-line={`${row.id} ${line.requirement}`} data-kind={line.kind} data-requirement={line.requirement}>
                <th role="rowheader" scope="row" className="ds-timeline-line">
                  {line.label}
                  <span className="ds-timeline-basis">
                    {line.legalBasis.sources.map((source) => (
                      <a key={source.id} href={source.url} data-source={source.id} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                    ))}
                    {line.legalBasis.locators.length > 0 ? <span>{line.legalBasis.locators.join('; ')}</span> : null}
                  </span>
                </th>
                {line.cells.map((cell) => (
                  <td
                    key={cell.startYear}
                    role="cell"
                    data-cell={`${row.id} ${line.requirement} ${cell.startYear}`}
                    data-start-year={cell.startYear}
                    data-state={cell.state}
                    data-reason={cell.reasonCode ?? undefined}
                    data-needs={cell.needs.length > 0 ? cell.needs.map((need) => `${need.factType} ${need.reason}`).join('; ') : undefined}
                  >
                    <span className="ds-timeline-year">{cell.heading}</span>
                    <span className="ds-timeline-state">
                      <span aria-hidden="true" className="ds-timeline-glyph">
                        {cell.glyph}
                      </span>{' '}
                      {cell.words}
                    </span>
                    {cell.reason !== null ? <span className="ds-timeline-reason">{cell.reason}</span> : null}
                    {cell.step !== null ? <Step step={cell.step} onStep={onStep} /> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}

/** A cell's next step, and the question it links, as the visitor is asked it. */
function Step({ step, onStep }: { step: StepView; onStep?: (question: QuestionId) => void }) {
  const { asks } = step;
  return (
    <span className="ds-timeline-step">
      {step.words}
      {asks !== null ? (
        <button type="button" className="ds-btn-link ds-timeline-ask" data-asks={asks} onClick={onStep === undefined ? undefined : () => onStep(asks)}>
          {step.askLabel}
        </button>
      ) : null}
    </span>
  );
}

/** What a failed check shows in place of a result: its own words, and nothing of any earlier result. */
export function CheckError({ state, focusRef }: { state: ErrorState; focusRef?: Ref<HTMLParagraphElement> }) {
  return (
    <p
      ref={focusRef}
      tabIndex={-1}
      role="alert"
      data-error={state}
      style={{ border: '1px solid var(--ds-oxide)', background: 'var(--ds-oxide-wash)', color: 'var(--ds-text-body)', padding: '14px 16px', fontSize: 14.5, maxWidth: '74ch' }}
    >
      {ERROR_STATES[state].words}
    </p>
  );
}
