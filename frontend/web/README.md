# web — the DataStrata site

Next.js 15 (App Router, React 19, TypeScript) in the **Seismograph / Oxide** design language.

Design source: `New website design/` — option **5a** (screens) + **7a** (live trace).
Handoff honoured: `New website design/handoff/tokens.css` (copied verbatim to `app/tokens.css`)
and `handoff/design-system.md` (all seven system rules).

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
```

## Routes

| Route | What it is |
|---|---|
| `/` | Landing. Full 5a section order. Every figure read from the live CSRD pack. |
| `/check` | The free check — 8 steps, then a cited report. Real `assess()` calls. |
| `/dashboard` | "See a sample report". Real assessment over a sample group profile. |
| `/company` | About us — mission, principles, what we read, team, what's next. |
| `/contact` | Contact form + direct email. |
| `/login` | Visual shell. There is no auth; the screen says so rather than faking it. |
| `/api/check` | POST → the engine. No lookup table, no model call in the path. |
| `/api/contact` | POST → `CONTACT_WEBHOOK_URL`. 503 with an honest message when unset. |

## The backend really is connected

`POST /api/check` imports `assess()` from `backend/engine` and evaluates the actual CSRD
knowledge pack. `/` and `/dashboard` are server components that read the pack directly.
Verified end-to-end by driving the real UI:

| Input | What the engine returned |
|---|---|
| FR · private ltd · FY2027 · standalone · **€400m–€600m** · >1,500 · no FY2024 report | 1 applies · 6 does not apply · **6 unresolved**; S-001 `range_crosses_threshold` — "Your band crosses the legal threshold" |
| Sample group, 6 entities (dashboard) | 11 applies · 27 does not apply · 30 requires judgment · **10 obligations instantiated** |

The €400m–€600m and 800–1,500 bands exist so a visitor can watch the product refuse to guess.

## Built from the engine, not from the mockup

The mockup's placeholder numbers were explicitly discarded (user instruction, Aug 2026):

| Mockup | Here | Why |
|---|---|---|
| `6 REGIMES READ` / `14 OBLIGATIONS FOUND` | `16 requirements encoded` / `17 official sources` | Read from the pack. Only one regime is encoded. |
| Live trace: obligations accumulating 12→14 over invented months | Real accumulation: the 8 dated in-force instruments in the pack, stepping 2013 → 2026, with the 2 adopted-not-in-force acts as deposits **above** the final tread | The years come from the acts' own OJ numbers. Pending acts have no OJ number yet — which is exactly why they don't raise the count (product law 4). |
| Coverage: six regimes as one list | `ENCODED: CSRD` / `WATCHED: CBAM · BRSR Core · IFRS S1–S2 · CSDDD · EUDR · ESPR` | A buyer is entitled to know which answer they're getting. |
| Dashboard: invented A/N/J matrix | Real `assess()` over `lib/sample.ts`; CSRD row = each entity's CSRD-S-014 determination | The company is fake and labelled; the determinations are not. |
| Evidence health 92/78/64 | Record health: requirements 100%, citations 100%, **expert ratification 0%** | There is no evidence subsystem. 0% ratified is the truth. |
| Deadline chip "CBAM Q3 — due 31 Oct" | The pack's one real dated expectation | The only orange surface in the system. |

A fourth cell state, **`unencoded`**, was added to the cross-section chart. The design had
three. Without a fourth, a watched regime's empty cell reads as "does not apply" — a silent
negative, which is the one thing the product must never produce.

No specific legal dates appear in marketing copy: they move (EUDR has slipped twice), and a
stale date on a compliance vendor's homepage is worse than none. Dates appear inside the
product, cited and versioned.

## Motion

Two visualisations loop continuously. Looping is an explicit override of `design-system.md`
§3 rule 7 ("nothing loops except the endpoint pulse"), made at the user's request. Both are
pure CSS keyframes over one shared cycle — no JavaScript, no animation library — and
`prefers-reduced-motion: reduce` kills all of it and forces every drawn stroke to finished.

**Live trace (12s).** One continuous sweep draws the whole step path on an expo-out curve
(`cubic-bezier(.22,1,.36,1)`). Each act's deposit, impact ring and label arrive exactly as
the sweep passes its riser — the timings are computed from cumulative path length, not
guessed. A gradient body fills under the record, then the record is **re-read**: a light travels
*along the path itself*, climbing each riser and tracking each tread, before the cycle fades
out and back rather than snapping.

**Strata section (8.5s).** A cut core in oblique projection: each layer has a wavy top
surface, a white bevel giving the cut its thickness, and an extruded face, offset back-and-up
so the stack reads as depth. It builds back-to-front so the inked layer lands last; the block
breathes on a 2px parallax drift; then the encoded layer **lifts clear of the stack**, holds
long enough to be read with dashed leaders marking the gap it opens, and re-seats. Depth comes from the face gradients, not
shadow — the system is flat, and this is a drawing, not a raised surface.

It draws **five layers, not one per regime**. This is a section drawing, not a chart: the
inked front layer is what is encoded, the layers behind it are what is watched, and the exact
counts live in the coverage table two sections below where they can be read precisely. A
drawing that tried to be both would do neither well.

The two closing gestures are deliberately different. Both visualisations once ended with the
same horizontal light sweep, which read as a house tic rather than an idea. Now each one moves
the way its own subject moves: the trace is *re-read along its length*, because it is a
record of events in sequence; the section is *taken apart*, because its claim is that any
layer can be lifted out and inspected.

Act labels are names, not numbers. "2026/470" means nothing to a visitor; **Omnibus I** does.
The names are the clause each source title already puts after its em-dash, trimmed for
length — not new claims. Two were verified against the OJ record: 2025/794 is the
Stop-the-clock Directive (14 Apr 2025) and 2025/1416 the ESRS quick-fix (11 Jul 2025).

## Structure

```
app/
  tokens.css        the handoff file, verbatim (font vars repointed at next/font)
  globals.css       component layer built on those tokens
  layout.tsx        Archivo / Inter / JetBrains Mono, self-hosted
  page.tsx          landing (server)
  check/            the 8-step flow + report
  dashboard/        sample record (server)
  login/            visual shell
  api/check/route.ts
components/ui/        primitives — Button, Field, chips, EvidenceBar, StrataMark
components/marketing/ MarketingNav, LiveTrace, CoverageStrip, Sheets, CheckFlow, LoginCard, Footer
components/app/       Sidebar, Topbar, CrossSectionChart
lib/
  pack.ts           server-only pack access + derived stats + trace events
  regimes.ts        the approved coverage register (encoded vs watched)
  checker.ts        the 8 questions, bands, answers → engine Profile
  sample.ts         the sample group profile behind /dashboard
```

**Deviation from the handoff:** it proposes Tailwind. This app has no Tailwind, so the
components are plain CSS classes reading the same custom properties. Every rule in
`design-system.md` §3 still holds — radius 0, shadow none, orange budget, oxide-as-error,
neutral "you are current", 1px ink frames, tabular numerals, 150ms linear.

## How it reaches the engine

No packaging changes were made to the engine — it stays a plain library with no build step.

- `tsconfig.json` maps `@datastrata/engine` → `../../backend/engine/src/index.ts`
- `next.config.mjs` sets `experimental.externalDir` so Next compiles that source
- `zod` is duplicated here because the engine's loader needs it resolvable from this app
- `outputFileTracingIncludes` ships the engine's runtime files into the standalone build

`lib/pack.ts` loads the pack once through the engine's own validating loader. If the content
firewall rejects the pack, the site fails loudly rather than answering from a half-loaded record.

## Deployment

**The deployable artifact is `.next/standalone`, not this checkout.** `next.config.mjs` sets
`output: 'standalone'`, so `next build` assembles a self-contained server tree. Because
`outputFileTracingRoot` is the repository root, that tree mirrors the repository beneath it and
**the server entry point is `.next/standalone/frontend/web/server.js`**, not
`.next/standalone/server.js`. Next omits `.next/static` and `public/` from the tree by
convention; copy them alongside for anything that serves a page.

**The source checkout is outside the runtime contract.** If the standalone server cannot answer
with the repository absent, the build is not deployable — so anything the engine reads at
runtime through a computed path must be named in `outputFileTracingIncludes`. Today that means
authored knowledge plus `verification/requirement-versions/`, which `assertVersionIntegrity`
requires and whose absence is a hard `VersionIntegrityError`.

```
npm run test:standalone
```

builds the artifact, copies it to a directory outside the repository, proves its isolation guard
is live, and requires `/api/check` to answer correctly with this checkout forbidden. It is
**deliberately excluded from `npm test`**: the fast suite and `npm run typecheck` both run where
the repository is reachable, so neither can see a missing traced file — both were green against
an artifact whose `/api/check` was a 500. CI runs this same recipe
(`.github/workflows/standalone.yml`) on every PR touching `frontend/web/`, `backend/engine/` or
the root build files, and on every push to `main`.

## Company page — what still needs filling in

Structure follows a conventional about-us (Datamaran's was the reference). Two sections are
deliberate substitutions: there is **no customer logo wall**, because there are no customers
to name — in its place, the institutions whose official record the pack is built from, counted
from the sources (10 EUR-Lex · 4 European Commission · 3 EFRAG). And there is **no press
section**, because there is no press — in its place, the real build order.

Everything a company page needs that only DataStrata can supply lives in `lib/company.ts`,
left visibly unfilled rather than invented:

- `TEAM[].name` / `.bio` — the two people, and what each is accountable for
- `COMPANY.email` — currently `hello@datastrata.example`, a placeholder
- `COMPANY.legalEntity`, `COMPANY.locations` — registered entity and where you operate

The page renders honestly with them blank ("Name to be published"), so it can ship before
they are filled — but it should not be published to customers in that state.

**Contact delivery:** set `CONTACT_WEBHOOK_URL` to any endpoint that accepts a JSON POST —
Formspree, Zapier, Make, a Slack incoming webhook, your own handler. Until it is set the route
returns 503 with a plain message and the form offers a `mailto:` fallback that carries the
visitor's text across, so nobody is silently dropped. A rendered honeypot field blocks the
simplest bots.

## Tested

Driven end-to-end at 1440px and 390px: every page for landmarks, heading structure, form
labels, link status, console errors and horizontal overflow; the checker for answer-changing,
back-navigation, both step-8 paths, run and restart; the contact form for validation and its
honeypot. All clean at both widths.

## Known limits

- **No auth, no tenancy, no persistence.** `/login` is a shell and says so on submit.
- **Sidebar items other than Home are not links.** They are designed, not shipped.
- **CSRD only.** Six regimes are watched; the site never implies they are answerable.
- **Preliminary by construction.** Check answers are `customer_statement` facts and all pack
  content is `draft`, so every result carries the unratified banner.
- **No analytics, no cookies, no third-party requests.** Fonts are self-hosted at build time.
