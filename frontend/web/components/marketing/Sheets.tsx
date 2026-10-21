/**
 * The three "sheets" beside the story steps, plus the isoline profile.
 * Diagrams, not dashboards — every number shown is one the CSRD pack actually
 * carries (the Article 19a thresholds), and no sheet implies data we don't have.
 */

const W = 430;
const H = 240;

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="ds-card">
      <div style={{ padding: 14 }}>{children}</div>
      <div
        className="ds-mono"
        style={{
          borderTop: '1px solid var(--ds-hairline-1)', fontSize: 9.5, letterSpacing: '0.2em',
          color: 'var(--ds-text-faint)', textAlign: 'center', padding: '8px 0',
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** Sheet 01 — a condition resolving, including the one that cannot. */
export function SheetApplicability() {
  const rows = [
    { mark: '✓', text: 'COUNTRY OF INCORPORATION ∈ EU', state: 'true' },
    { mark: '✓', text: 'LEGAL FORM ∈ ANNEX I / II', state: 'true' },
    { mark: '?', text: 'NET TURNOVER > €450,000,000', state: 'indet' },
    { mark: '✓', text: 'AVERAGE EMPLOYEES > 1,000', state: 'true' },
  ];
  return (
    <Frame label="SHEET 01 · APPLICABILITY">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="A four-condition test in which one condition cannot be resolved from a range.">
        {rows.map((r, i) => {
          const y = 20 + i * 38;
          const oxide = r.state === 'indet';
          return (
            <g key={r.text}>
              <rect x="0" y={y - 14} width={W} height="28" fill={oxide ? 'var(--ds-oxide-wash)' : 'transparent'} />
              <text x="4" y={y + 4} fontFamily="var(--ds-font-mono)" fontSize="13" fontWeight="700" fill={oxide ? 'var(--ds-oxide)' : 'var(--ds-ink)'}>{r.mark}</text>
              <text x="26" y={y + 4} fontFamily="var(--ds-font-mono)" fontSize="10.5" letterSpacing="0.06em" fill={oxide ? 'var(--ds-oxide)' : 'var(--ds-text-body)'}>{r.text}</text>
              <line x1="0" x2={W} y1={y + 17} y2={y + 17} stroke="var(--ds-hairline-1)" />
            </g>
          );
        })}
        <text x="0" y={196} fontFamily="var(--ds-font-mono)" fontSize="9" letterSpacing="0.18em" fill="var(--ds-text-faint)">RESULT</text>
        <rect x="0" y={206} width="186" height="22" fill="var(--ds-oxide)" />
        <text x="9" y={221} fontFamily="var(--ds-font-mono)" fontSize="9.5" letterSpacing="0.1em" fill="#fff">REQUIRES ONE MORE FACT</text>
        <text x="196" y={221} fontFamily="var(--ds-font-mono)" fontSize="8.5" fill="var(--ds-text-ghost)">not a no. never a silent no.</text>
      </svg>
    </Frame>
  );
}

/**
 * Sheet 02 — a pending act, deposited but not binding. The act is one the pack
 * lists, not one a scan found: nothing scans the source register yet, and the
 * sheet's status line says so instead of reporting a check that never ran.
 */
export function SheetChange() {
  return (
    <Frame label="SHEET 02 · CHANGE EVENT, SETTLING">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="A pending act shown resting above the record, not yet part of it.">
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" x2={W} y1={60 + i * 24} y2={60 + i * 24} stroke="var(--ds-hairline-1)" />
        ))}
        <rect x="150" y="34" width="10" height="10" fill="var(--ds-orange)" />
        <line x1="155" x2="155" y1="44" y2="156" stroke="var(--ds-orange)" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x="172" y="36" fontFamily="var(--ds-font-mono)" fontSize="10" fill="var(--ds-ink)">PENDING ACT</text>
        <text x="172" y="49" fontFamily="var(--ds-font-mono)" fontSize="8.5" fill="var(--ds-text-ghost)">scoped to the requirements it would move</text>
        <line x1="0" x2={W} y1="156" y2="156" stroke="var(--ds-oxide)" strokeWidth="1.8" />
        <text x="0" y="180" fontFamily="var(--ds-font-mono)" fontSize="9" letterSpacing="0.16em" fill="var(--ds-text-faint)">THE RECORD · UNCHANGED</text>
        <text x="0" y="206" fontFamily="var(--ds-font-mono)" fontSize="10" letterSpacing="0.06em" fill="var(--ds-text-nav)">NO CHANGE MONITORING RUNS YET</text>
        <text x="0" y="222" fontFamily="var(--ds-font-mono)" fontSize="8.5" fill="var(--ds-text-ghost)">pending law never binds; it waits above the line</text>
      </svg>
    </Frame>
  );
}

/**
 * Sheet 03 — obligations as the engine instantiates them: each with an owner
 * role and a deadline rule. Nobody is assigned and nothing exports to a
 * calendar yet, so the sheet shows neither.
 */
export function SheetSchedule() {
  const rows = ['SUSTAINABILITY STATEMENT', 'LIMITED ASSURANCE ENGAGEMENT', 'DIGITAL TAGGING · ESEF'];
  return (
    <Frame label="SHEET 03 · SCHEDULE">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Obligations laid out with an owner role and a deadline rule.">
        {rows.map((r, i) => {
          const y = 30 + i * 52;
          return (
            <g key={r}>
              <text x="0" y={y} fontFamily="var(--ds-font-mono)" fontSize="9.5" letterSpacing="0.08em" fill="var(--ds-text-body)">{r}</text>
              <rect x="0" y={y + 10} width={W} height="6" fill="var(--ds-hairline-3)" />
              <rect x="0" y={y + 10} width={110 + i * 84} height="6" fill="var(--ds-oxide)" />
              <text x="0" y={y + 32} fontFamily="var(--ds-font-mono)" fontSize="8.5" fill="var(--ds-text-ghost)">owner role · deadline rule</text>
            </g>
          );
        })}
        <line x1="0" x2={W} y1="196" y2="196" stroke="var(--ds-hairline-1)" />
        <text x="0" y="216" fontFamily="var(--ds-font-mono)" fontSize="9" letterSpacing="0.16em" fill="var(--ds-text-faint)">EACH ONE TRACES BACK TO ITS DETERMINATION</text>
      </svg>
    </Frame>
  );
}

/**
 * Strata section — the record as a cut core, in oblique projection.
 *
 * Five layers, not one per regime: this is a section drawing, not a chart. The
 * inked front layer is what the engine answers for, as draft; the layers
 * receding behind it are what is planned. The real counts live in the coverage
 * table two sections below, where they can be read precisely — a drawing that
 * tried to be both would do neither well.
 *
 * Depth is carried by the extruded faces and their gradients, never by shadow —
 * the system is flat, and this is a drawing, not a raised surface.
 *
 * Motion (8.5s): the section builds back-to-front, each surface drawing on an
 * expo-out curve while its face fades in behind it; the block breathes with a
 * 2px parallax drift; a scan travels the cut face; and the inked layer takes a
 * final, single emphasis before the cycle fades and repeats.
 */
export function StrataSection({ answerable, planned }: { answerable: number; planned: number }) {
  const W = 380, H = 214;
  const CYCLE = 8500;
  const LAYERS = 5;          // compositional, not one-per-regime
  const INKED = 1;           // the front layer is the answerable record
  const EASE_DRAW = 'cubic-bezier(.22,1,.36,1)';

  const DX = 14, DY = 22, DEPTH = 20;
  const baseY = 170;
  const surfaceLen = 430;

  const layer = (i: number) => {
    const ox = i * DX;
    const oy = baseY - i * DY;
    const a = 16 - i * 1.8;
    const top = `M ${14 + ox} ${oy} C ${72 + ox} ${oy - a}, ${118 + ox} ${oy + a * 0.7}, ${162 + ox} ${oy - a * 0.35} S ${248 + ox} ${oy - a}, ${300 + ox} ${oy - a * 0.25}`;
    const face = `${top} l 0 ${DEPTH} C ${248 + ox} ${oy - a + DEPTH}, ${206 + ox} ${oy - a * 0.35 + DEPTH}, ${162 + ox} ${oy - a * 0.35 + DEPTH} S ${72 + ox} ${oy + a * 0.7 + DEPTH}, ${14 + ox} ${oy + DEPTH} Z`;
    return { top, face };
  };

  const drawA = 0.06, drawB = 0.54;
  const per = (drawB - drawA) / LAYERS;
  const pct = (f: number) => `${(f * 100).toFixed(2)}%`;

  const css: string[] = [
    `@keyframes strata-cycle{0%{opacity:0}5%{opacity:1}91%{opacity:1}100%{opacity:0}}`,
    // the block breathes — 2px, enough to feel alive, not enough to notice
    `@keyframes strata-drift{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-2px,0)}}`,
    // The closing gesture is an extraction, not a sweep: the answerable layer lifts
    // clear of the stack, holds long enough to be read, and re-seats. That is the
    // claim of the section — any layer can be taken out and inspected — and it is
    // a different move from the live trace's travelling read.
    `@keyframes strata-lift{0%,${pct(0.56)}{transform:translate(0,0);animation-timing-function:cubic-bezier(.22,1,.36,1)}${pct(0.68)}{transform:translate(-7px,-11px)}${pct(0.8)}{transform:translate(-7px,-11px);animation-timing-function:cubic-bezier(.5,0,.3,1)}${pct(0.9)},100%{transform:translate(0,0)}}`,
    // extraction leaders: the gap the lift opens, marked the way a drawing marks it
    `@keyframes strata-lead{0%,${pct(0.62)}{opacity:0}${pct(0.7)},${pct(0.8)}{opacity:1}${pct(0.87)},100%{opacity:0}}`,
  ];
  for (let i = 0; i < LAYERS; i++) {
    const order = LAYERS - 1 - i; // back first, inked layer lands last
    const t0 = drawA + order * per;
    css.push(
      `@keyframes strata-top-${i}{0%,${pct(t0)}{stroke-dashoffset:${surfaceLen}px;animation-timing-function:${EASE_DRAW}}${pct(t0 + per * 1.15)},100%{stroke-dashoffset:0}}`,
      `@keyframes strata-face-${i}{0%,${pct(t0 + per * 0.35)}{opacity:0}${pct(t0 + per * 1.3)},100%{opacity:1}}`,
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`A cut section of the record: the inked front layer is the ${answerable} regime answerable as draft, the layers receding behind it are the ${planned} that are planned.`}>
      <defs>
        {Array.from({ length: LAYERS }, (_, i) => {
          const enc = i < INKED;
          return (
            <linearGradient key={i} id={`strata-g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={enc ? 'var(--ds-oxide)' : '#C9BCB2'} stopOpacity={enc ? 0.4 : 0.34} />
              <stop offset="55%" stopColor={enc ? 'var(--ds-oxide)' : '#C9BCB2'} stopOpacity={enc ? 0.18 : 0.14} />
              <stop offset="100%" stopColor={enc ? 'var(--ds-oxide)' : '#C9BCB2'} stopOpacity={enc ? 0.06 : 0.03} />
            </linearGradient>
          );
        })}
      </defs>
      <style>{css.join('')}</style>

      <g style={{ animation: `strata-cycle ${CYCLE}ms linear infinite` }}>
        <g style={{ animation: `strata-drift ${CYCLE}ms ease-in-out infinite` }}>
          {Array.from({ length: LAYERS }, (_, k) => LAYERS - 1 - k).map((i) => {
            const enc = i < INKED;
            const { top, face } = layer(i);
            const stroke = enc ? 'var(--ds-oxide)' : 'var(--ds-mark-neutral)';
            const body = (
              <>
                <path d={face} fill={`url(#strata-g${i})`} stroke="none"
                  style={{ animation: `strata-face-${i} ${CYCLE}ms linear infinite` }} />
                {/* bevel: a paler line just under the cut edge gives the surface thickness */}
                <path className="ds-draw" d={top} fill="none" stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="1.6"
                  transform="translate(0,1.4)" strokeDasharray={surfaceLen} strokeDashoffset={surfaceLen}
                  style={{ animation: `strata-top-${i} ${CYCLE}ms linear infinite` }} />
                <path className="ds-draw" d={top} fill="none" stroke={stroke} strokeWidth={enc ? 2 : 1.05}
                  strokeDasharray={surfaceLen} strokeDashoffset={surfaceLen}
                  style={{ animation: `strata-top-${i} ${CYCLE}ms linear infinite` }} />
              </>
            );
            return enc ? (
              <g key={i}>
                {/* leaders mark the gap the extraction opens */}
                <g style={{ animation: `strata-lead ${CYCLE}ms linear infinite` }}>
                  <line x1={14} x2={14} y1={baseY - 11} y2={baseY + 2} stroke="var(--ds-oxide)" strokeWidth="1" strokeDasharray="2 3" />
                  <line x1={300} x2={300} y1={baseY - 11} y2={baseY + 2} stroke="var(--ds-oxide)" strokeWidth="1" strokeDasharray="2 3" />
                </g>
                <g style={{ animation: `strata-lift ${CYCLE}ms linear infinite` }}>{body}</g>
              </g>
            ) : (
              <g key={i}>{body}</g>
            );
          })}
        </g>
        <text x="16" y={H - 6} fontFamily="var(--ds-font-mono)" fontSize="8.5" letterSpacing="0.12em" fill="var(--ds-text-faint)">
          INKED = ANSWERABLE AS DRAFT · BENEATH = PLANNED
        </text>
      </g>
    </svg>
  );
}
