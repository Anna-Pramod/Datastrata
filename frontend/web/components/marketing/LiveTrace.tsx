import type { ActMark, PendingMark } from '@/lib/pack';

/**
 * LiveTrace (7a — accumulation steps).
 *
 * The encoded record accumulating, act by act: every riser is a real legal
 * instrument in the pack, placed by the year in its own OJ number and labelled
 * with the name a reader would recognise. The two adopted-but-not-yet-in-force
 * acts rest ABOVE the final tread — they are watched and scoped, and they do not
 * raise the count, because pending law never binds (product law 4).
 *
 * Motion: one continuous sweep draws the whole step path on an expo-out curve;
 * each act's mark, ring and label arrive exactly as the sweep passes its riser;
 * an instrument scan then travels the finished trace before the cycle fades and
 * repeats. Looping is a deliberate override of design-system.md §3 rule 7, at
 * the user's request. Reduced motion finishes every stroke instantly.
 */

type Variant = 'hero' | 'compact' | 'foot';

const DIMS = {
  hero: { w: 1248, h: 208, floor: 150, ceil: 58, labels: true },
  compact: { w: 706, h: 186, floor: 136, ceil: 52, labels: false },
  foot: { w: 1440, h: 112, floor: 80, ceil: 34, labels: false },
} as const;

const CYCLE = 12000;
const EASE_DRAW = 'cubic-bezier(.22,1,.36,1)';
const EASE_SETTLE = 'cubic-bezier(.34,1.56,.64,1)';
const EASE_READ = 'cubic-bezier(.45,0,.25,1)';
const READ_SEG = 34;

export function LiveTrace({
  acts, pending, requirements, snapshot, variant = 'hero', idPrefix = 'lt',
}: {
  acts: ActMark[]; pending: PendingMark[]; requirements: number;
  snapshot: string; variant?: Variant; idPrefix?: string;
}) {
  const d = DIMS[variant];
  const padL = variant === 'foot' ? 96 : 20;
  const padR = variant === 'foot' ? 96 : 20;
  const span = d.w - padL - padR;
  const n = Math.max(acts.length, 1);
  const colW = span / (n + 0.6);
  const levelH = (d.floor - d.ceil) / n;
  const xAt = (i: number) => padL + colW * i;
  const yAt = (lvl: number) => d.floor - levelH * lvl;
  const endX = d.w - padR;
  const runout = endX - xAt(n);

  // One polyline: riser, tread, riser, tread… then a run-out to today.
  const stepD = `M ${padL} ${d.floor} ` + acts.map((_, i) => `V ${yAt(i + 1)} H ${xAt(i + 1)}`).join(' ') + ` H ${endX}`;
  const areaD = `${stepD} V ${d.floor} Z`;
  const total = n * (levelH + colW) + runout;

  // Where along the cycle the sweep reaches each act's riser.
  const DRAW_A = 0.04, DRAW_B = 0.52;
  const reach = (i: number) => (i * (levelH + colW) + levelH) / total;
  const at = (i: number) => DRAW_A + reach(i) * (DRAW_B - DRAW_A);
  const pct = (f: number) => `${(f * 100).toFixed(2)}%`;

  const css: string[] = [
    `@keyframes ${idPrefix}-cycle{0%{opacity:0}3%{opacity:1}93%{opacity:1}100%{opacity:0}}`,
    `@keyframes ${idPrefix}-path{0%,${pct(DRAW_A)}{stroke-dashoffset:${total.toFixed(1)}px;animation-timing-function:${EASE_DRAW}}${pct(DRAW_B)},100%{stroke-dashoffset:0}}`,
    `@keyframes ${idPrefix}-area{0%,${pct(DRAW_B)}{opacity:0}${pct(DRAW_B + 0.1)},100%{opacity:1}}`,
    `@keyframes ${idPrefix}-late{0%,${pct(DRAW_B)}{opacity:0;transform:scale(.6);animation-timing-function:${EASE_SETTLE}}${pct(DRAW_B + 0.05)},100%{opacity:1;transform:none}}`,
    // The read runs ALONG the record — climbing each riser, tracking each tread —
    // rather than crossing it as a flat band. It is the trace being re-read, and
    // it is deliberately a different gesture from the section-03 visual.
    `@keyframes ${idPrefix}-read{0%,${pct(0.56)}{stroke-dashoffset:${READ_SEG}px;opacity:0;animation-timing-function:${EASE_READ}}${pct(0.6)}{opacity:1}${pct(0.8)}{opacity:1}${pct(0.86)},100%{stroke-dashoffset:${(-total).toFixed(1)}px;opacity:0}}`,
  ];
  acts.forEach((_, i) => {
    const f = at(i);
    css.push(
      `@keyframes ${idPrefix}-m${i}{0%,${pct(f)}{opacity:0;transform:translateY(-7px);animation-timing-function:${EASE_SETTLE}}${pct(f + 0.035)},100%{opacity:1;transform:none}}`,
      `@keyframes ${idPrefix}-r${i}{0%,${pct(f)}{opacity:.5;transform:scale(.25)}${pct(f + 0.06)},100%{opacity:0;transform:scale(1)}}`,
    );
  });

  const anim = (name: string, extra?: React.CSSProperties): React.CSSProperties => ({
    animation: `${idPrefix}-${name} ${CYCLE}ms linear infinite`, ...extra,
  });
  const ring: React.CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center' };

  return (
    <svg
      viewBox={`0 0 ${d.w} ${d.h}`} width="100%" role="img"
      aria-label={`The encoded record accumulating: ${acts.map((a) => a.name).join(', ')} — ${acts.length} instruments in force carrying ${requirements} requirements. ${pending.length} further acts are adopted but not in force and do not change what binds today.`}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    >
      <defs>
        <linearGradient id={`${idPrefix}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ds-oxide)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--ds-oxide)" stopOpacity="0.01" />
        </linearGradient>
        <radialGradient id={`${idPrefix}-glow`}>
          <stop offset="0%" stopColor="var(--ds-oxide)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--ds-oxide)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <style>{css.join('')}</style>

      <g style={anim('cycle')}>
        {/* paper rhythm */}
        <g stroke="var(--ds-hairline-1)" strokeWidth="1">
          {Array.from({ length: Math.floor(d.h / 24) }, (_, i) => (
            <line key={i} x1={padL} x2={endX} y1={(i + 1) * 24} y2={(i + 1) * 24} />
          ))}
        </g>

        {/* body under the record */}
        <path d={areaD} fill={`url(#${idPrefix}-fill)`} style={anim('area')} />

        {/* the record itself — one continuous draw */}
        <path
          className="ds-draw" d={stepD} fill="none" stroke="var(--ds-oxide)" strokeWidth="1.8"
          strokeLinejoin="miter" strokeDasharray={total} strokeDashoffset={total} style={anim('path')}
        />

        {acts.map((a, i) => {
          const x = xAt(i);
          const y = yAt(i + 1);
          return (
            <g key={a.id}>
              <title>{`${a.title} · in force`}</title>
              <circle cx={x} cy={y} r="13" fill="none" stroke="var(--ds-orange)" strokeWidth="1"
                style={anim(`r${i}`, ring)} />
              <g style={anim(`m${i}`)}>
                <rect x={x - 3.5} y={y - 3.5} width="7" height="7" fill="var(--ds-orange)" />
                {d.labels ? (
                  <>
                    <text x={x + 9} y={y - 9} className="ds-mono" fontSize="10" fill="var(--ds-ink)">{a.name}</text>
                    <text x={x - 3} y={d.floor + 17} className="ds-mono" fontSize="9" letterSpacing="0.06em" fill="var(--ds-text-faint)">{a.year}</text>
                  </>
                ) : null}
              </g>
            </g>
          );
        })}

        {/* adopted, not in force — resting above the record */}
        <g style={anim('late')}>
          {pending.map((p, i) => {
            const x = endX - 30 - i * 26;
            const y = yAt(n) - 30;
            return (
              <g key={p.id}>
                <title>{`${p.title} — adopted, not in force (${p.note})`}</title>
                <line x1={x} x2={x} y1={y + 7} y2={yAt(n) - 3} stroke="var(--ds-orange)" strokeWidth="1.2" strokeDasharray="2 3" opacity="0.75" />
                <rect x={x - 3.5} y={y} width="7" height="7" fill="none" stroke="var(--ds-orange)" strokeWidth="1.4" />
              </g>
            );
          })}
          {d.labels && pending.length > 0 ? (
            <text x={endX - 30 - (pending.length - 1) * 26 - 10} y={yAt(n) - 36} textAnchor="end"
              className="ds-mono" fontSize="8.5" fill="var(--ds-text-ghost)">
              {`${pending.length} adopted · not in force`}
            </text>
          ) : null}
        </g>

        {/* today */}
        <g style={anim('late')}>
          <circle cx={endX} cy={yAt(n)} r="20" fill={`url(#${idPrefix}-glow)`} className="ds-pulse" />
          <circle cx={endX} cy={yAt(n)} r="3.5" fill="var(--ds-oxide)" />
        </g>

        {/* the record being re-read: a light that travels the path itself */}
        <g style={{ pointerEvents: 'none' }}>
          <path d={stepD} fill="none" stroke="var(--ds-oxide)" strokeWidth="9" strokeOpacity="0.13"
            strokeLinecap="round" strokeDasharray={`${READ_SEG} ${total}`} style={anim('read')} />
          <path d={stepD} fill="none" stroke="var(--ds-oxide)" strokeWidth="2.6"
            strokeLinecap="round" strokeDasharray={`${READ_SEG} ${total}`} style={anim('read')} />
        </g>

        {d.labels ? (
          <text x={padL} y={d.h - 6} className="ds-mono" fontSize="9" letterSpacing="0.09em"
            fill="var(--ds-text-faint)" style={anim('late')}>
            {`${acts.length} ACTS IN FORCE · ${requirements} REQUIREMENTS ENCODED · ${pending.length} ADOPTED, NOT IN FORCE · SNAPSHOT ${snapshot}`}
          </text>
        ) : null}
      </g>
    </svg>
  );
}
