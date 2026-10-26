'use client';

/**
 * The free check: its questions one at a time, and its result (DP1 plan,
 * Task 6; CHK-1, CHK-3, EXP-4, EXP-5, EXP-6, PRF-14).
 *
 * **Why this file exists.** It is the only place a visitor's answers are held,
 * and the ways it can go wrong are quiet: a question shown that the answers
 * hide, a choice made for the visitor, an answer to a hidden question posted
 * (the route refuses it), an earlier result left on screen beside a failure, a
 * next step that leads nowhere. So:
 *
 * - the questions are exactly `visibleQuestions`' for the answers so far, one
 *   at a time in its order, each a labelled radio group with "Not sure" and
 *   nothing preselected; C-9 and C-10 are asked only through the result's offer,
 *   which appears only where `visibleQuestions` lists them;
 * - the answers are posted once, as a JSON body, through `requestBody`, which
 *   drops any answer a later change hid and sends "Another country" upper-case;
 * - the outcome is one value, a result or an error, so a failure always
 *   replaces the result it follows and never sits beside it (EXP-6); focus
 *   moves to the result's heading, or to the error, when either appears;
 * - a request that takes longer than `CHECK_TIMEOUT_MS` is abandoned and says
 *   so in the timeout's own words;
 * - a request is sent, timed and settled by `lib/check-request.ts`, never here,
 *   and only the current request's ending is applied (Codex's review of Task 6,
 *   finding 3). A restart, any navigation, any change to an answer or a typed
 *   figure, and a newer submission supersede the request in flight: it is
 *   aborted, and its ending changes nothing here, neither the answers, the
 *   outcome, the screen, the loading state nor the focus. So every handler
 *   below that does one of those calls `requests.supersede()` first, and the
 *   outcome is set only inside the callback `submit` hands the module.
 *
 * Nothing is stored: the answers live in this component's memory and in the
 * one request body, and nowhere else (plan §1).
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/primitives';
import { CheckError, CheckTimeline } from '@/components/marketing/CheckTimeline';
import {
  CHECK_QUESTIONS,
  checkerAnswersSchema,
  EU_COUNTRIES,
  NON_EU_COUNTRIES,
  OTHER_COUNTRIES,
  questionWording,
  visibleQuestions,
  type AnswerOption,
  type CheckerAnswers,
  type CheckQuestion,
  type QuestionId,
} from '@/lib/check-answers';
import { checkRequests, type CheckSettlement } from '@/lib/check-request';
import { checkView } from '@/lib/check-view';

type Outcome = CheckSettlement;
type Screen = { kind: 'question'; id: QuestionId } | { kind: 'outcome' };

const TYPED = 'typed';
const OFFER: readonly QuestionId[] = ['C-9', 'C-10'];

function questionOf(id: QuestionId): CheckQuestion {
  const found = CHECK_QUESTIONS.find((q) => q.id === id);
  if (found === undefined) throw new Error(`no question ${id}`);
  return found;
}

/** The questions asked in turn: the offer's pair, or every required question the answers so far show. */
function sequenceFor(id: QuestionId, answers: CheckerAnswers): QuestionId[] {
  if (OFFER.includes(id)) return [...OFFER];
  return visibleQuestions(answers)
    .filter((q) => !q.optional)
    .map((q) => q.id);
}

/** A typed figure as an answer, when the schema takes it: digits, with an optional decimal point, no separators. */
function typedAnswer(text: string, field: CheckQuestion['field'], answers: CheckerAnswers): { exact: number } | undefined {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const answer = { exact: Number(trimmed) };
  return checkerAnswersSchema.safeParse({ group: answers.group, [field]: answer }).success ? answer : undefined;
}

function isAnswered(question: CheckQuestion, answers: CheckerAnswers): boolean {
  const value = answers[question.field];
  if (value === undefined) return false;
  return question.id !== 'C-1' || value !== 'other' || answers.countryOther !== undefined;
}

/**
 * `plannedRegimes` arrives from the server page as the short names of the
 * regimes the coverage register reads as planned: this is a client component,
 * and the register's inputs are read from the pack on the server.
 */
export function CheckFlow({ plannedRegimes }: { plannedRegimes: string[] }) {
  const [answers, setAnswers] = useState<CheckerAnswers>({});
  /** The text of each typed figure; a key present means "type the figure" is the choice. */
  const [typed, setTyped] = useState<Partial<Record<QuestionId, string>>>({});
  const [screen, setScreen] = useState<Screen>({ kind: 'question', id: 'C-1' });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [running, setRunning] = useState(false);
  /** This page's requests: the module owns the loading state and applies only the current request's ending. */
  const [requests] = useState(() => checkRequests(setRunning));
  const moved = useRef(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    // Not on the first render: the page opens at its top, not inside the form.
    if (!moved.current) return;
    if (screen.kind === 'question') questionRef.current?.focus();
    else if (outcome?.kind === 'result') resultRef.current?.focus();
    else errorRef.current?.focus();
  }, [screen, outcome]);

  // Leaving the page abandons a request in flight, so its fetch is aborted and its ending reaches no flow that is gone.
  useEffect(() => () => requests.supersede(), [requests]);

  /** Shows a screen and lets focus follow it. Only `go`, `restart`, `back` and a settled request call it. */
  const show = (next: Screen) => {
    moved.current = true;
    setScreen(next);
  };

  /** Any navigation leaves the check a request in flight was sent for, so it supersedes that request first. */
  const go = (next: Screen) => {
    requests.supersede();
    show(next);
  };

  const restart = () => {
    requests.supersede();
    setAnswers({});
    setTyped({});
    setOutcome(null);
    show({ kind: 'question', id: 'C-1' });
  };

  /** Sends the answers through the request lifecycle. The callback runs only for the current request's ending (finding 3). */
  function submit(current: CheckerAnswers) {
    requests.start(current, (settled) => {
      setAnswers(settled.answers);
      setOutcome(settled);
      show({ kind: 'outcome' });
    });
  }

  if (screen.kind === 'outcome' && outcome !== null) {
    const view = outcome.kind === 'result' ? checkView(outcome.timeline, outcome.answers) : null;
    return (
      <div className="ds-gutter" style={{ paddingBlock: 'clamp(40px, 6vw, 72px)' }}>
        {view !== null ? <CheckTimeline view={view} headingRef={resultRef} onStep={(id) => go({ kind: 'question', id })} /> : null}
        {outcome.kind === 'error' ? <CheckError state={outcome.state} focusRef={errorRef} /> : null}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 32 }}>
          {view !== null && view.offer !== null ? (
            // The offer's sentence is wider than a 320-pixel screen, so it wraps rather than widen the page (EXP-4).
            <Button onClick={() => go({ kind: 'question', id: 'C-9' })} style={{ whiteSpace: 'normal', textAlign: 'left' }}>
              {view.offer}
            </Button>
          ) : null}
          {outcome.kind === 'error' ? (
            <Button onClick={() => submit(outcome.answers)} loading={running}>
              Try again
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => go({ kind: 'question', id: 'C-1' })}>
            Change your answers
          </Button>
          <Button variant="secondary" onClick={restart}>
            ← Run another check
          </Button>
        </div>

        {view !== null ? (
          <section className="ds-panel" style={{ border: '1px solid var(--ds-hairline-2)', padding: 24, maxWidth: '78ch', marginTop: 40 }}>
            <p className="ds-label ds-check-meta" style={{ marginBottom: 12 }}>What this result is not</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {view.rows.some((row) => row.id === 'national') ? (
                <li className="ds-body-sm">
                  Not a final legal conclusion. CSRD is directive-based law and no country pack is ratified yet, so national transposition, filing calendar
                  and exercised options still require review.
                </li>
              ) : null}
              <li className="ds-body-sm">Not evidenced. You stated these facts; a real profile replaces them with sourced, dated documents.</li>
              <li className="ds-body-sm">
                Not the whole regulatory picture. This check covers CSRD only.
                {plannedRegimes.length > 0 ? ` ${plannedRegimes.join(', ')} are planned, with no knowledge pack yet, so they are neither included nor excluded here.` : null}
              </li>
            </ul>
            <p className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', marginTop: 16 }}>
              A record built from a company&apos;s own profile is available to pilot evaluations by arrangement.
            </p>
          </section>
        ) : null}
      </div>
    );
  }

  const id = screen.kind === 'question' ? screen.id : 'C-1';
  const question = questionOf(id);
  const sequence = sequenceFor(id, answers);
  const at = Math.max(0, sequence.indexOf(id));
  const answered = isAnswered(question, answers);
  const following = sequence[at + 1];
  const hintId = `${id}-hint`;

  const choose = (value: string) => {
    requests.supersede();
    if (value === TYPED) {
      const text = typed[id] ?? '';
      setTyped((t) => ({ ...t, [id]: text }));
      setAnswers((a) => ({ ...a, [question.field]: typedAnswer(text, question.field, a) }) as CheckerAnswers);
      return;
    }
    setTyped((t) => {
      const rest = { ...t };
      delete rest[id];
      return rest;
    });
    setAnswers((a) => {
      const next = { ...a, [question.field]: value } as CheckerAnswers;
      if (id === 'C-1' && value !== 'other') delete next.countryOther;
      return next;
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!answered || running) return;
    if (following !== undefined) go({ kind: 'question', id: following });
    else submit(answers);
  };

  const back = () => {
    requests.supersede();
    if (at > 0) {
      show({ kind: 'question', id: sequence[at - 1]! });
    } else if (OFFER.includes(id) && outcome !== null) {
      // Leaving the offer unposted: its answers go with it, so C-9 and C-10 are only ever sent together, as Task 4's sweep poses them.
      setAnswers(outcome.answers);
      setTyped((t) => {
        const rest = { ...t };
        for (const pair of OFFER) delete rest[pair];
        return rest;
      });
      show({ kind: 'outcome' });
    }
  };

  const value = answers[question.field];
  const selected = typed[id] !== undefined || (typeof value === 'object' && value !== null) ? TYPED : (value as string | undefined);

  return (
    <div className="ds-gutter" style={{ paddingBlock: 'clamp(40px, 6vw, 72px)' }}>
      <form onSubmit={onSubmit} style={{ maxWidth: 780 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
          <p className="ds-mono ds-oxide" style={{ fontSize: 11, letterSpacing: '.2em' }}>
            QUESTION {String(at + 1).padStart(2, '0')} / {String(sequence.length).padStart(2, '0')}
          </p>
          <p className="ds-micro ds-check-meta">EVERY QUESTION IS A FACT THE LAW TURNS ON</p>
        </div>
        <div className="ds-bar-track" style={{ marginBottom: 40 }}>
          <div className="ds-bar-fill" style={{ width: `${((at + 1) / sequence.length) * 100}%`, transition: 'width 150ms linear' }} />
        </div>

        <fieldset className="ds-question" aria-describedby={question.hint !== undefined ? hintId : undefined}>
          <legend style={{ marginBottom: 12 }}>
            <h1 ref={questionRef} tabIndex={-1} className="ds-h2" style={{ maxWidth: '24ch' }}>
              {questionWording(id, answers)}
            </h1>
          </legend>
          {question.hint !== undefined ? (
            <p id={hintId} className="ds-body-sm" style={{ color: 'var(--ds-text-muted)', marginBottom: 24, maxWidth: '62ch' }}>
              {question.hint}
            </p>
          ) : (
            <div style={{ marginBottom: 24 }} />
          )}

          {id === 'C-1' ? (
            <>
              <Choices legend="EU Member States" name={id} options={EU_COUNTRIES} selected={selected} onChoose={choose} />
              <Choices legend="Outside the EU" name={id} options={NON_EU_COUNTRIES} selected={selected} onChoose={choose} />
              <Choices name={id} options={question.options.filter((o) => o.id === 'other' || o.id === 'not_sure')} selected={selected} onChoose={choose} />
              {value === 'other' ? (
                <label className="ds-field" style={{ marginTop: 18, maxWidth: 340 }}>
                  <span className="ds-field-label ds-check-meta">{question.options.find((o) => o.id === 'other')?.label}</span>
                  <select
                    className="ds-input"
                    value={answers.countryOther ?? ''}
                    onChange={(e) => {
                      requests.supersede();
                      const code = e.target.value === '' ? undefined : e.target.value.toUpperCase();
                      setAnswers((a) => ({ ...a, countryOther: code }));
                    }}
                  >
                    <option value="" />
                    {OTHER_COUNTRIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : (
            <Choices
              name={id}
              options={
                question.typed === undefined
                  ? question.options
                  : [...question.options.filter((o) => o.id !== 'not_sure'), { id: TYPED, label: question.typed.label }, ...question.options.filter((o) => o.id === 'not_sure')]
              }
              selected={selected}
              onChoose={choose}
            />
          )}

          {question.typed !== undefined && selected === TYPED ? (
            <label className="ds-field" style={{ marginTop: 18, maxWidth: 340 }}>
              <span className="ds-field-label ds-check-meta">{question.typed.label}</span>
              <input
                className="ds-input"
                inputMode="decimal"
                autoComplete="off"
                value={typed[id] ?? ''}
                aria-invalid={(typed[id] ?? '') !== '' && typeof value !== 'object'}
                onChange={(e) => {
                  requests.supersede();
                  const text = e.target.value;
                  setTyped((t) => ({ ...t, [id]: text }));
                  setAnswers((a) => ({ ...a, [question.field]: typedAnswer(text, question.field, a) }) as CheckerAnswers);
                }}
              />
              {typeof value === 'object' && value !== null ? (
                <span className="ds-micro ds-check-meta">
                  = {question.typed.measure === 'money' ? '€' : ''}
                  {value.exact.toLocaleString('en-GB', { maximumFractionDigits: 2 })}
                </span>
              ) : null}
            </label>
          ) : null}
        </fieldset>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 44, flexWrap: 'wrap' }}>
          {at > 0 || (OFFER.includes(id) && outcome !== null) ? (
            <Button type="button" variant="secondary" small onClick={back}>
              ← Back
            </Button>
          ) : null}
          {following !== undefined ? (
            <Button type="submit" small disabled={!answered}>
              Next →
            </Button>
          ) : (
            <Button type="submit" loading={running} disabled={!answered}>
              Run the check →
            </Button>
          )}
          <span className="ds-micro ds-check-meta" style={{ marginLeft: 4 }}>
            {answered ? '' : 'ANSWER THIS QUESTION TO CONTINUE'}
          </span>
        </div>
      </form>
    </div>
  );
}

/** One radio group: each option a label around its own radio, nothing preselected. */
function Choices({
  legend,
  name,
  options,
  selected,
  onChoose,
}: {
  legend?: string;
  name: string;
  options: readonly AnswerOption[];
  selected: string | undefined;
  onChoose: (value: string) => void;
}) {
  const radios = (
    <div className="ds-choices">
      {options.map((option) => (
        <label key={option.id} className="ds-choice">
          <input type="radio" name={name} value={option.id} checked={selected === option.id} onChange={() => onChoose(option.id)} />
          <span>
            <span style={{ fontWeight: 600, fontSize: 14.5, display: 'block' }}>{option.label}</span>
            {option.hint !== undefined ? <span className="ds-micro ds-check-meta" style={{ display: 'block', marginTop: 4 }}>{option.hint}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
  if (legend === undefined) return <div style={{ marginBottom: 14 }}>{radios}</div>;
  return (
    <fieldset className="ds-question" style={{ marginBottom: 14 }}>
      <legend className="ds-label ds-check-meta" style={{ marginBottom: 10 }}>
        {legend}
      </legend>
      {radios}
    </fieldset>
  );
}
