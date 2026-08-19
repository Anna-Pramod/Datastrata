# Seismograph / Oxide — component system
Source of truth: `DataStrata Directions.dc.html`, option **5a** (screens) + **7a** (live trace). Tokens: `handoff/tokens.css`.

## 1 · Stack placement (Next.js + Tailwind)
- `app/globals.css`: `@import "./tokens.css";` then Tailwind layers.
- Fonts via `next/font/google`: Archivo (700, 800), Inter (400, 500, 700), JetBrains Mono (400, 500, 700). Expose as CSS vars and point the `--ds-font-*` tokens at them.
- Global rules: `html { font-family: var(--ds-font-ui); color: var(--ds-text); }` · all numerals `font-variant-numeric: tabular-nums` · selection color oxide/white.
- `prefers-reduced-motion: reduce` → kill all animation AND force drawn strokes finished (`.ds-draw { stroke-dashoffset: 0 !important }`).

## 2 · tailwind.config.ts (extend)
```ts
extend: {
  colors: {
    paper: 'var(--ds-paper)', panel: 'var(--ds-panel)', ink: 'var(--ds-ink)',
    hairline: { 1: 'var(--ds-hairline-1)', 2: 'var(--ds-hairline-2)', 3: 'var(--ds-hairline-3)' },
    body: 'var(--ds-text-body)', muted: 'var(--ds-text-muted)', faint: 'var(--ds-text-faint)',
    ghost: 'var(--ds-text-ghost)', nav: 'var(--ds-text-nav)',
    oxide: { DEFAULT: 'var(--ds-oxide)', hover: 'var(--ds-oxide-hover)', tint: 'var(--ds-oxide-tint)', wash: 'var(--ds-oxide-wash)' },
    orange: 'var(--ds-orange)', markneutral: 'var(--ds-mark-neutral)',
  },
  fontFamily: { display: 'var(--ds-font-display)', ui: 'var(--ds-font-ui)', mono: 'var(--ds-font-mono)' },
  fontSize: {
    'display-1': ['62px', { lineHeight: '1.03', letterSpacing: '-0.029em', fontWeight: '800' }],
    'display-2': ['52px', { lineHeight: '1.05', letterSpacing: '-0.027em', fontWeight: '800' }],
    h2: ['37px', { lineHeight: '1.12', letterSpacing: '-0.022em', fontWeight: '800' }],
    h3: ['30px', { lineHeight: '1.14', letterSpacing: '-0.017em', fontWeight: '800' }],
    h4: ['20px', { lineHeight: '1.3', letterSpacing: '-0.015em', fontWeight: '700' }],
    'body-lg': ['17px', '1.65'], body: ['15.5px', '1.6'], 'body-sm': ['13px', '1.5'],
    caption: ['11.5px', { lineHeight: '1.5', letterSpacing: '0.05em' }],
    label: ['10px', { lineHeight: '1.4', letterSpacing: '0.18em' }],
    micro: ['9px', { lineHeight: '1.4', letterSpacing: '0.09em' }],
    'stat-lg': ['72px', '1'], stat: ['38px', '1'],
  },
  borderRadius: { none: '0', DEFAULT: '0' },        // the system is square
  boxShadow: { none: 'none', focus: 'var(--ds-ring-focus)', error: 'var(--ds-ring-error)', popover: 'var(--ds-shadow-popover)' },
  transitionDuration: { fast: '150ms' },
  transitionTimingFunction: { ui: 'linear' },
  keyframes: {
    dsDraw: { to: { strokeDashoffset: '0' } },
    dsFadeIn: { from: { opacity: '0' } },
    dsDropIn: { from: { opacity: '0', transform: 'translateY(-14px)' } },
    dsPulse: { '0%,100%': { opacity: '.45' }, '50%': { opacity: '1' } },
  },
  animation: {
    'draw-tread': 'dsDraw 1s linear forwards',
    'draw-riser': 'dsDraw .3s linear forwards',
    'register-in': 'dsFadeIn .5s ease-out backwards',
    'deposit-in': 'dsDropIn .45s ease-out backwards',
    'endpoint-pulse': 'dsPulse 3s ease-in-out infinite',
  },
}
```

## 3 · System rules (non-negotiable)
1. **Orange budget** — `orange` marks change events (risers, deposits, spikes) and the deadline chip. Nothing else, ever.
2. **Oxide is also the error color.** Never add a separate red; error UIs reuse oxide + `oxide-wash`.
3. **"You are current" is neutral ink**, never green. Calm is the absence of alarm color.
4. **Radius 0, shadow none** — the single exception is `shadow-popover` on floating popovers/menus.
5. **Every frame is `border: 1px solid ink`**; internal structure uses the 3 warm hairlines, never grey.
6. All numerals tabular; all mono labels UPPERCASE with `tracking` from the label/micro scale.
7. UI state changes: 150ms linear. One-shot entries: ease-out. Nothing loops except the endpoint pulse.

## 4 · Component inventory

### `MarketingNav`
72px row, `border-b ink`, gutter 96px. Wordmark (strata mark + Archivo 800 19px) · links `font-mono text-[12px] tracking-[.8px] text-nav uppercase` · CTA = Button/primary-sm.
States — link default: `text-nav` · hover/active: `text-oxide border-b-2 border-oxide pb-[2px]` (150ms) · focus: focus ring.

### `Button`
Primary: `bg-oxide text-white font-bold` (15.5px/14px sm, py-3.5 px-6, radius 0).
States — hover: `bg-oxide-hover` · focus-visible: `shadow-focus` · disabled: `bg-[--ds-disabled-bg] text-[--ds-disabled-text]` · **loading**: `bg-oxide-hover` + plotter-line SVG (56×12 path, `animate-[dsDraw_1.2s_linear_infinite]`) + "Verifying…" — width locked, no spinner.
Secondary: `border border-ink text-ink font-medium bg-paper`; hover: `bg-panel`.
Link (mono): `font-mono text-[11px] tracking-wide text-oxide border-b border-oxide/40 uppercase`; hover: full-opacity border.

### `Input` (+ `Field` wrapper)
Label: mono label scale, `text-faint`, uppercase; error label flips `text-oxide`.
Box: `border-hairline-2 bg-paper px-3 py-3 text-[15px]`, radius 0.
States — placeholder: `text-[--ds-text-placeholder]` · focus: `border-oxide shadow-focus` + oxide caret · error: `border-oxide shadow-error` + microcopy `font-mono text-micro text-oxide` · readonly/loading: `bg-[--ds-panel-input] text-faint` · disabled: as readonly + no pointer.
Never show an error before first submit attempt (see login EMPTY state).

### `Card` / `Frame`
`border border-ink bg-paper`, radius 0, no shadow. Variants: panel card (`bg-panel`), quiet card (`border-hairline-2`).

### `Popover` (citation trace)
`border border-ink bg-paper shadow-popover p-4 w-[356px]`. Anatomy: header (mono micro faint + status chip) · rows `grid grid-cols-[52px_1fr] gap-2` with FACT/TEST/RULE/DUTY mono keys · RULE value is an oxide link · footer rule + version line (`V3 · EFFECTIVE … · SIGNED`) + "FULL TRACE →" (nowrap). Anchor cell gets a 2px ink ring + dashed crosshair to both axes.

### `Chip`
Legend: `border-hairline-2 font-mono text-[9px] tracking-wide px-2 py-1` + 7px swatch (solid oxide = deterministic · outlined = expert-signed · dashed = judgment).
Capacity: `border border-oxide text-oxide font-mono text-[7.5px] uppercase px-1.5` (DETERMINISTIC / EXPERT-SIGNED).
Status (solid): `bg-oxide text-white font-mono text-[8.5px] px-2 py-[3px]` (e.g. APPLIES · DETERMINISTIC).
**Deadline** (the only orange surface): `bg-orange text-ink font-mono text-[10px] font-bold px-3 py-2.5` + 8px ink square rotated 45°.

### `StatCell` / `StatShelf`
Number `font-mono font-bold tabular` (stat-lg 72 hero / stat 38 dashboard), sublabel mono label faint. Accent number = oxide. Hero: 3 cells as **equal thirds (`flex-1`) spanning the full content width**, hairline-1 dividers, over `border-t ink`; **the LiveTrace sits under the shelf on its own full-width row** (7a integration).

### `LiveTrace` (7a — accumulation steps)
Anatomy: baseline grid (hairline-1, 24px) · month axis (mono micro) · oxide tread path 1.8px · **orange risers** + 8px deposit squares · register entry per riser (title mono 10 ink · meta mono 9 faint · capacity chip · lowercase gloss `text-ghost` 8.5) · survey ticks on treads (markneutral, 6px) = sweeps with 0 deltas · endpoint dot + pulsing halo + tag "FLAT = MAINTAINED · 14 IN FORCE · YOU ARE CURRENT".
Choreography (one pass, ~3.5s): tread 0–1s → riser 1s (300ms) → deposit settles 1.05s → register fades 1.3s → riser 2 at 1.7s → final tread 2.05–3.15s → ticks 3s → endpoint + tag 3.2–3.3s. Reduced motion: finished drawing.
Variants: `hero` 1248×200 full · `tablet` 706×180 (titles + dates, no chips/glosses) · `mobile` 342×150 (steps + counts only) · `foot` 1440×110 (quiet, unlabeled — login footer).

### `CrossSectionChart` (regulatory universe)
Grid 6 regimes × 8 cores, 44px rows. Cell states — applies: `bg-oxide` solid · does not apply: `bg-paper border-hairline-2` · judgment: oxide 45° hatch on `oxide-wash` · deadline ≤90d: ink corner triangle · **hover**: 2px ink ring + dashed crosshair to axis labels + citation Popover. Row labels mono 12; column labels rotated −31°. Legend = Chip/legend row. Provenance strip below: mono micro faint, `border-t hairline-1` ("SOURCES … · LAST SWEEP … · DETERMINATIONS VERSIONED, NEVER OVERWRITTEN").

### `SidebarNavItem`
`font-mono text-[11.5px] tracking-wide uppercase px-3 py-2.5 text-nav` + 18px stroke icon.
States — active: `bg-oxide text-white` (icon white) · hover: `bg-oxide-tint text-ink` · focus: focus ring inset. Sidebar: 232px, `bg-panel border-r ink`.

### `Topbar`
60px, `border-b ink`: org switcher (mono 12.5 bold + chevron) · search `border-hairline-2 bg-paper` w-[380px] mono placeholder faint · avatar 32px `border ink` mono initials.

### `EvidenceBar`
Label body-sm + mono tabular value (zero-padded, e.g. `092%`) · 6px track `bg-hairline-3`, fill `bg-oxide`, radius 0. Never red at any value.

### `BriefingItem`
Date mono 10 faint tabular · body 13/1.5 · capacity tag mono micro oxide (DETERMINISTIC / EXPERT-SIGNED) or neutral nav ("YOU ARE CURRENT · FLAT TRACE"). Divider `border-b hairline-3`.

### `LoginCard`
448px, `border ink bg-paper p-9` on 24px paper grid (`bg-image: repeating hairline-1 grid`), quiet LiveTrace/foot at page bottom + motto line.
States — EMPTY: placeholders, primary button disabled, no errors shown · FOCUS: oxide border + ring + blinking oxide caret · LOADING: inputs readonly-fill, button loading variant, mono status "CHECKING AGAINST THE RECORD…" · ERROR: oxide-wash banner (`border-oxide`, 8px rotated square glyph, "…2 attempts remaining"), password field error state + microcopy, magic-link emphasized.

### `Footer`
`border-t-2 ink`: wordmark + disclaimer ("regulatory intelligence, not legal advice") · 2 mono-labeled link columns · legal row mono caption faint: `© 2026 DATASTRATA / CALM IS A MEASURABLE OUTPUT`.

## 5 · Suggested file structure
```
app/globals.css                  ← imports handoff/tokens.css
components/ui/                   Button, Input, Field, Card, Chip, Popover, EvidenceBar
components/marketing/            MarketingNav, Hero, StatShelf, LiveTrace (variants), Footer
components/app/                  Sidebar, SidebarNavItem, Topbar, StatCards, CrossSectionChart,
                                 CitationTracePopover, BriefingRail, DeadlineChip
lib/tokens.ts                    typed re-export of token names for charts (SVG uses raw hex from CSS vars)
```
