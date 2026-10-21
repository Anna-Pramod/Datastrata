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
| `/check` | The free check — 9 questions, 10 for a parent undertaking, then a cited report. Real `assess()` calls. |
| `/dashboard` | The record, behind the pilot access gate (see Pilot access). Without a valid session the middleware refuses before any page code runs (a browser gets 303 to `/pilot-access`, a script 401, and every request 503 while the gate is not configured), and the page decides again before it reads the profile. Real assessment over the profile `DATASTRATA_PILOT_PROFILE` names, or the synthetic development profile while nothing is configured; a profile that cannot be served is a refusal, never the sample. Dynamic. |
| `/company` | About us — mission, principles, what we read, team, what's next. |
| `/contact` | Contact page. The form renders only when `CONTACT_WEBHOOK_URL` is set; no address is published. |
| `/login` | A plain card: accounts are not live; pilot evaluations use a passphrase at `/pilot-access` (see Pilot access). |
| `/pilot-access` | The public sign-in page for pilot evaluations: one passphrase field posting to `/api/pilot-access`. A refusal's reason is shown from a fixed set of sentences; the query string is never echoed. Dynamic, `no-store`. |
| `/api/check` | POST → the engine. No lookup table, no model call in the path. |
| `/api/contact` | POST → `CONTACT_WEBHOOK_URL`. 503 with an honest message when unset. |
| `/api/pilot-access` | POST → the passphrase, compared with `DATASTRATA_PILOT_ACCESS_SECRET` in constant time. Accepted: a relative 303 to `/dashboard` with the 12-hour `ds_pilot_access` session cookie (`HttpOnly`, `SameSite=Strict`, `Path=/dashboard`). Refused: 401 (wrong passphrase), 429 (five failures in 15 minutes, one limit shared by everyone) or 503 (the gate is not configured), as a one-key JSON body to a script and as a relative 303 to `/pilot-access?reason=…` to a browser. `no-store`. |
| `/api/pilot-access/sign-out` | POST → clears the session cookie on this browser and sends it to `/pilot-access`; the token itself stays valid until it expires or is revoked. `no-store`. |

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
| `6 REGIMES READ` / `14 OBLIGATIONS FOUND` | `23 requirements encoded` / `17 official sources` | Read from the pack. Only one regime has a pack, and it is draft. |
| Live trace: obligations accumulating 12→14 over invented months | Real accumulation: the 8 dated in-force instruments in the pack, stepping 2013 → 2026, with the 2 adopted-not-in-force acts as deposits **above** the final tread | The years come from the acts' own OJ numbers. Pending acts have no OJ number yet — which is exactly why they don't raise the count (product law 4). |
| Coverage: six regimes as one list | `DRAFT · EVALUATION ONLY: CSRD` / `PLANNED: CBAM · BRSR Core · IFRS S1-S2 · CSDDD · EUDR · ESPR`, each status derived by `lib/coverage.ts` | A buyer is entitled to know which answer they're getting. |
| Dashboard: invented A/N/J matrix | Real `assess()` over the configured profile document (`lib/record.ts`; the synthetic development profile by default); CSRD row = each entity's CSRD-S-014 determination; every requirement's verification status as loaded | The company is whichever record is configured, labelled as such; the determinations are not invented. |
| Evidence health 92/78/64 | Record health: four derived lines (requirements signed 0 of 23, sources listed 17, regimes monitored 0, country packs ratified 0) and two bars, **governing signatures 0 of 23** and **country packs ratified 0** | There is no evidence subsystem. No signature is the truth, and the one model-produced dossier on file (r5, CSRD-S-002 version 4) is shown as historical evidence, not as verification of the current text. |
| Deadline chip "CBAM Q3 — due 31 Oct" | The pack's one real dated expectation | The only orange surface in the system. |

A fourth cell state, **`unencoded`**, was added to the cross-section chart. The design had
three. Without a fourth, a planned regime's empty cell reads as "does not apply" — a silent
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
inked front layer is what is answerable, the layers behind it are what is planned, and the exact
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
  check/            the check flow + report
  dashboard/        the record, behind the pilot access gate (server, dynamic)
  login/            a plain card: accounts are not live; pilot access is by passphrase
  pilot-access/     the passphrase form (server, dynamic, public)
  api/check/route.ts
  api/pilot-access/ route.ts: POST sign-in; sign-out/route.ts: POST sign-out (Node runtime)
components/ui/        primitives — Button, Field, chips, EvidenceBar, StrataMark
components/marketing/ MarketingNav, LiveTrace, CoverageStrip, Sheets, CheckFlow, LoginCard, Footer
components/app/       Sidebar, Topbar, CrossSectionChart
middleware.ts         the access gate's first enforcement point, on /dashboard/:path*
lib/
  access.ts         the access gate's pure decision: configuration, session token, cookie, limiter
  pilot-access-handler.ts  the sign-in and sign-out logic behind the two routes, and the access page's sentences
  dashboard-view.ts the dashboard page's own gate, decided before it reads the profile
  contact-delivery.ts  whether the contact form can deliver (CONTACT_WEBHOOK_URL set)
  pack.ts           server-only pack access + derived stats + trace events
  coverage.ts       the coverage register: supported / draft / monitored / planned, derived (replaces regimes.ts)
  site-coverage.ts  the register over this revision's pack and source register (server-only)
  checker.ts        the questions (9, 10 for a parent undertaking), bands, answers → engine Profile
  profile.ts        the pilot profile document: its schema, referential checks and loader (DATASTRATA_PILOT_PROFILE)
  record.ts         the record behind /dashboard: select, validate, assess (server-only; read only once the gate allows)
  dashboard.ts      the record screen's view model
  evidence.ts       the r5 dossier's historical-evidence notice, computed against the current pack
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

## Pilot profile

`/dashboard` renders one profile document, selected on the server:

| `DATASTRATA_PILOT_PROFILE` | What renders |
|---|---|
| unset | `profiles/synthetic-meridian.json`, the synthetic development profile, labelled as such in the topbar and the banner |
| a path to a readable, valid document | that company's record, labelled "Pilot record · evaluation" |
| set but blank, unreadable, not JSON, or invalid | a refusal naming the variable, the kind of failure and every problem by field — never the sample |

The variable is server-side only (never `NEXT_PUBLIC_`); the file is read per request through
`lib/record.ts`; its path is logged on the server and never rendered. Keep a pilot's file outside
the repository. Nothing under `public/` is involved, and the page is dynamic, so no company data is
baked into a build.

A document has three parts. `profile` and `context` are exactly what the engine's `assess()` takes
(`backend/engine/examples/*.json` shows the shape); `record` is what the page labels it by:

```json
{
  "record": {
    "kind": "pilot",
    "name": "Acme Holdings SE",
    "note": "Facts as stated on the onboarding call of 2026-10-20; nothing inferred.",
    "statedOn": "2026-10-20",
    "shortNames": { "e-1": "Acme SE · DE" }
  },
  "context": { "assessmentDate": "2026-10-20", "financialYear": { "start": "2027-01-01", "end": "2027-12-31" }, "subjectId": "org" },
  "profile": { "scopeObjects": [], "facts": [] }
}
```

Every fact carries its `source` and its `confirmed` flag. A value `{ "kind": "unknown" }` is a
stated unknown and stays one; an unconfirmed fact is kept in the record and never seen by the
evaluator; nothing is inferred from a fact's absence. The loader (`lib/profile.ts`) is strict: an
unknown key, a fact type the pack does not know, a fact stated on the wrong kind of scope object, a
duplicate, a value kind that does not fit, or a dangling scope reference is refused, and every
problem is listed at once.

The page shows each requirement's verification status as the site loaded it (`draft`, `verified`
or `ratified`, with reasons), the stated facts with their sources, and the r5 verification
dossier for CSRD-S-002 labelled by what it binds (`lib/evidence.ts` compares its pinned input with
the current requirement's at request time).

Local start for a screen-shared evaluation, from this workspace directory (`frontend/web`, which
owns the `dev` script), bound to the loopback interface only:

```bash
cd frontend/web
DATASTRATA_PILOT_PROFILE=/absolute/path/to/pilot.json npm run dev -- -H 127.0.0.1 -p 3000
```

then open `/pilot-access` on the host you will use, for example `http://localhost:3000/pilot-access`,
sign in, and stay on that host. A browser without a session that asks for `/dashboard` is sent to
`/pilot-access` on `localhost`, because Next normalises a loopback host to `localhost` in the
middleware's redirect, and the session cookie belongs to the host that set it. The file is read on
every request, so editing it and reloading shows the new assessment. A refusal shows on the page;
the reason with the path is on the terminal running the server. `next dev` fetches the layout's
three Google fonts on first compile; offline, Next falls back to system fonts with a warning. From a
production build, run the standalone server described under Deployment with the same variable in
its environment.

### Pilot access

`/dashboard` is served only to a browser holding a valid access session, issued at `/pilot-access`
from a passphrase checked on the server. Two variables, both server-side only (never `NEXT_PUBLIC_`):

| Variable | Meaning |
|---|---|
| `DATASTRATA_PILOT_ACCESS_SECRET` | The passphrase, at least 16 characters. Use a generated random secret, not a phrase, for example the output of `openssl rand -base64 32`, because a captured session token allows passphrase guesses to be tested offline, outside the sign-in limit. While it is unset (or blank, or shorter) every request under `/dashboard` is refused with 503: an unconfigured gate fails closed, never open. |
| `DATASTRATA_PILOT_ACCESS_REVOKED_BEFORE` | Optional. An ISO-8601 instant (`YYYY-MM-DDTHH:MM:SSZ`); every session token issued before it is refused. It must not be later than the server's clock, or every request is refused with 503 naming this variable. |

Both variables are read from the server process's environment, so set them before the server starts;
a change made in the shell takes effect when the server restarts.

A session lasts 12 hours from issue. Rotating the secret revokes every session at once; setting the
revoked-before instant revokes every session issued before it without changing the passphrase. The
passphrase is entered at `/pilot-access`. `POST /api/pilot-access/sign-out`, the topbar's Sign out,
clears the session cookie on this browser only; the token itself stays valid until it expires or is
revoked. The local start above needs `DATASTRATA_PILOT_ACCESS_SECRET` in the same environment, or
`/dashboard` answers 503.

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
- `COMPANY.legalEntity`, `COMPANY.locations` — registered entity and where you operate

The page renders honestly with them blank ("Name to be published"), so it can ship before
they are filled — but it should not be published to customers in that state.

**Contact delivery:** set `CONTACT_WEBHOOK_URL` to any endpoint that accepts a JSON POST —
Formspree, Zapier, Make, a Slack incoming webhook, your own handler. The form is rendered only
when it is set (checked on the server per request); otherwise the page says contact details are
published when the inbox is connected, and the route returns 503 with a plain message. A rendered
honeypot field blocks the simplest bots.

## Tested

Driven end-to-end at 1440px and 390px: every page for landmarks, heading structure, form
labels, link status, console errors and horizontal overflow; the checker for answer-changing,
back-navigation, both step-8 paths, run and restart; the contact form for validation and its
honeypot. All clean at both widths.

## Known limits

- **No accounts, no tenancy, no persistence.** `/login` says so; `/dashboard` is reached by the pilot-access passphrase.
- **Sidebar items other than Home are not links.** They are designed, not shipped.
- **CSRD only.** Six regimes are planned; the site never implies they are answerable.
- **Preliminary by construction.** Check answers are `customer_statement` facts and all pack
  content is `draft`, so every result carries the unratified banner.
- **No analytics, no third-party requests, and one cookie:** the pilot-access session `ds_pilot_access`
  (HttpOnly, `Path=/dashboard`), set only by a successful sign-in. Fonts are self-hosted at build time.
