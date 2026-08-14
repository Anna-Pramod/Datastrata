const SIX_QUESTIONS = [
  'What applies to us?',
  'What just changed?',
  'What must we do, by when?',
  'What evidence is required?',
  'What if we do nothing?',
  'Are we ready to be checked?',
];

export function WhatItDoes() {
  return (
    <section className="section-tight" id="what" aria-labelledby="what-h">
      <div className="wrap two-up">
        <div className="card">
          <span className="eyebrow">How the answer is built</span>
          <h3 id="what-h" style={{ fontSize: 26, margin: '12px 0 10px' }}>
            Sourced facts in, cited determinations out
          </h3>
          <p style={{ font: '500 13.5px/1.6 var(--sans)', color: 'var(--brown)', marginBottom: 18 }}>
            Upload an annual report or product catalogue, point us at a public filing, or type the facts in.
            Extraction proposes; you confirm. Nothing counts as a fact until you have said so, which is why an
            answer can always name the document behind it.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['Deterministic', 'An evaluator decides applicability — not a model. Same facts, same answer, every time.'],
              ['Three-valued', 'Applies, does not apply, or honestly unresolved with the fact that would settle it.'],
              ['Cited', 'Every determination carries its condition trace and the official provision it rests on.'],
            ].map(([term, detail]) => (
              <li key={term} style={{ borderTop: '1px solid var(--line)', paddingTop: 11 }}>
                <strong style={{ font: '700 13px/1.4 var(--sans)' }}>{term}. </strong>
                <span style={{ font: '500 13px/1.55 var(--sans)', color: 'var(--brown)' }}>{detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card card-teal">
          <span className="eyebrow eyebrow-light">What DataStrata does</span>
          <h3 style={{ fontSize: 26, margin: '12px 0 16px' }}>Six questions, answered &amp; maintained</h3>
          <div className="numbered">
            {SIX_QUESTIONS.map((q, i) => (
              <div className="numbered-row" key={q}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
