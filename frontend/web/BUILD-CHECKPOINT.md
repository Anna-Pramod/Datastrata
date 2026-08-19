# BUILD CHECKPOINT — Seismograph/Oxide site
Resume file. If a session ends mid-build, read this first, then continue at the first unchecked batch.

## Mandate (from the user, this session)
- Rebuild `frontend/web` in the **Seismograph / Oxide** language from `New website design/`
  (option **5a** screens + **7a** live trace). Handoff: `New website design/handoff/{tokens.css,design-system.md}`.
- Build **all three screens**: landing, login (visual shell — no auth exists), dashboard home.
- **Wire the backend.** Checker = multi-step page at `/check`, 8 questions, real `assess()` calls.
- **Derive from the real engine. The mockup's placeholder numbers do not hold.**
  (No "6 REGIMES READ", no "14 OBLIGATIONS FOUND", no invented customer matrix.)
- Coverage, approved by the user: **encoded = CSRD**; **watched = CBAM, BRSR, IFRS, CSDDD, EUDR, ESPR**.
- **No specific legal dates in marketing copy** (they move; dates belong inside a cited determination).

## Real figures (verified from the pack — re-verify if the pack changes)
16 requirements (all `in_force`, all `draft`/unratified) · 17 sources · 17 obligation templates ·
38 questions · 51 fact types · 4 changeWatch items · 0 ratified country packs · pack 0.1.0, snapshot 2026-07-26.

## Non-negotiable system rules (design-system.md §3)
1. Orange (`--ds-orange`) = change-event marks + the deadline chip. NOWHERE else.
2. Oxide is also the error colour. Never add a separate red.
3. "You are current" is neutral ink, never green.
4. Radius 0, shadow none — except `--ds-shadow-popover` on floating popovers.
5. Every frame `1px solid ink`; internal structure uses the 3 warm hairlines, never grey.
6. All numerals tabular; mono labels UPPERCASE with the label/micro tracking.
7. UI state changes 150ms linear; one-shot entries ease-out; nothing loops but the endpoint pulse.

## Batches
- [x] B1 — `app/tokens.css` (handoff verbatim) + `app/globals.css` (component layer, plain CSS not Tailwind)
- [x] B2 — `app/layout.tsx` (Archivo/Inter/JetBrains Mono), `lib/pack.ts`, `lib/regimes.ts`, `components/ui/*`
- [x] B3 — `components/marketing/*`: MarketingNav, LiveTrace, StatShelf, CoverageStrip, Footer
- [x] B4 — `app/page.tsx` (landing, 5a section order)
- [x] B5 — `lib/checker.ts` (8 steps), `app/api/check/route.ts`, `app/check/*` (flow + report)
- [x] B6 — `app/login/page.tsx` (visual shell, states)
- [x] B7 — `app/dashboard/*` (sample profile → real assess(), CrossSectionChart, BriefingRail)
- [x] B9 — /company + /contact (+ /api/contact, lib/company.ts). Datamaran used as a STRUCTURAL
       reference only; no content copied. Logo wall -> institutions we read; press -> build order.
       Real names/email/entity are TODO in lib/company.ts and must be filled before publishing.
- [x] B8 — build + typecheck + drive with CDP + screenshots + README rewrite

## Decisions already made (do not re-litigate)
- Plain CSS classes (`ds-*`) reading the tokens, not Tailwind — no Tailwind in this app.
- Landing hero shelf shows real pack figures, not the mockup's invented ones.
- LiveTrace = REAL ACCUMULATION, not flat. Series = the 8 dated in-force instruments in
  `sources.json`, placed by the year in their own OJ number, stepping 2013 -> 2026. The 2
  adopted-not-in-force acts are deposits ABOVE the final tread and never raise the count
  (product law 4). An earlier flat version was rejected by the user — do not go back to it.
- MOTION: hero trace (12s) and the 03-The-Record strata section (14s) LOOP continuously.
  Deliberate override of design-system.md rule 7, granted by the user. Pure CSS keyframes
  over one shared cycle; no JS. Reduced motion still kills it. The user asked for a
  "professional, high-end, polished" feel — expo-out draw easing, settle overshoot on marks,
  gradient body fill, impact rings, an instrument scan pass, and a fade-out/in loop rather
  than a snap. Do not flatten this back to linear draws.
- TRACE LABELS = ACT NAMES, never OJ numbers. Names come from the clause after the em-dash in
  each source title (Omnibus I, CSRD, Stop-the-clock, ESRS Set 1...), trimmed via SHORTEN in
  lib/pack.ts. Numbers alone were rejected by the user as meaningless to a reader.
- The 03 graphic is 3D (oblique projection with extruded faces), not flat contours. 8.5s,
  FIVE layers — compositional, NOT one-per-regime (the user asked for fewer; the exact counts
  live in the coverage table instead). Alternatives A/B/C (core sample, plate registration,
  append-only column) were built, reviewed and REJECTED; RecordVisuals.tsx and /lab/record are
  deleted. Do not rebuild them.
- NO SHARED SWEEP. The trace and the 03 section must not use the same closing gesture — a
  horizontal light sweep in both read as a tic. Trace = a light travelling ALONG the path
  (dash segment via stroke-dashoffset). Section 03 = the encoded layer LIFTS out of the stack
  with dashed extraction leaders, holds, and re-seats.
- Dashboard = real `assess()` over a **sample multi-entity profile** authored in `lib/sample.ts`,
  labelled as a sample. Watched-regime rows render a distinct "not encoded" cell state.
- Evidence Health card → "RECORD HEALTH" with real pack metrics (ratification 0/16 is the truth).
- Deadline chip (only orange surface) = a real dated changeWatch expectation, not an invented deadline.

## Engine connection (already working, keep)
`tsconfig` path alias `@datastrata/engine` → `../../backend/engine/src/index.ts`;
`next.config.mjs` `experimental.externalDir` + `outputFileTracingIncludes` for `knowledge/**/*.json`.
Engine itself must stay untouched — 74 tests green (was 45 when this file was written; the engine has grown since).

## Test sweep (Aug 2026) — defects found and fixed
1. Checker step 8 was a dead end on BOTH paths — a single un-changeable option. EU now asks
   Q-012 properly (same / a different Member State + select / not sure); non-EU asks the
   Article 40a EU-turnover test, which unlocks S-007 APPLIES — an outcome the checker could
   never previously reach. "Not sure" contributes no fact, so the engine reports unresolved.
2. `<svg height="auto">` — invalid attribute, console error on / and /login. Moved to CSS.
3. /dashboard had no <h1>.
4. /dashboard scrolled horizontally on mobile (147px). Cause: the cross-section table's
   `min-width: 680` propagated layout overflow out of its `overflow-x:auto` wrapper.
   `max-width`, `min-width:0` and `overflow-x:clip` on ancestors all FAILED; `contain: content`
   on the wrapper (.ds-scroll-x) is the fix that works while keeping the inner scroll.
5. Below 900px the nav hid every link — no way to reach Company/Contact. Added a <details>
   mobile menu (no JS).
6. No favicon (404) and no robots.txt. Added app/icon.svg + app/robots.ts.
7. Dashboard sidebar/rail did not stack on narrow screens.

Audit scripts live in the session scratchpad (audit.mjs / interact.mjs / hscroll.mjs). Re-run
them after UI changes: they check h1 count, landmarks, labels, alt text, link status, console
errors, horizontal scroll at 390px, and drive the checker + contact form.

## Verify before declaring done
```bash
cd frontend/web && npm run typecheck && npm run build
cd ../../backend/engine && npm test        # must still be 45 passing
```
Then drive the real UI (CDP scripts pattern used earlier) and LOOK at the screenshots.
