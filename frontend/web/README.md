# web — the public site

Next.js 15 (App Router, React 19, TypeScript). The landing page in the **retro** direction, built as a real page rather than a mockup.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
```

## The free checker runs the real engine

`POST /api/check` imports `assess()` from `backend/engine` and evaluates the actual CSRD knowledge pack. There is no lookup table, no mock, and no model call anywhere in the path. Every verdict, reason code, citation and "what we would ask next" on the page came out of the evaluator.

Verified behaviour:

| Answers | What the engine returns |
|---|---|
| DE · listed · standalone · >€600m · >1,500 staff | S-001 **APPLIES**, S-014 **APPLIES**, 10 obligations instantiated, S-013 unresolved |
| FR · private ltd · standalone · **€400m–€600m** · >1,500 | S-001 **INDETERMINATE** `range_crosses_threshold`; S-014/S-015 **INDETERMINATE** `upstream_indeterminate` |
| IE · private ltd · standalone · no size answers | S-001 **INDETERMINATE** `missing_fact`, needs exact turnover + headcount |
| GB · private ltd · parent · >€600m · >1,500 | EU-entity route **DOES NOT APPLY**; Art. 40a gate (S-007) **INDETERMINATE**, needs group EU turnover |

The €400m–€600m and 800–1,500 bands exist precisely to demonstrate the product's core claim: a band that crosses a legal threshold stays honestly unresolved and names the fact that would settle it.

## How it connects to the engine

No packaging changes were made to the engine — it stays a plain library with no build step.

- `tsconfig.json` maps `@datastrata/engine` → `../../backend/engine/src/index.ts`
- `next.config.mjs` sets `experimental.externalDir` so Next compiles that source from outside this app
- `zod` is duplicated here because the engine's loader needs it resolvable from this app
- `outputFileTracingIncludes` ships `knowledge/**/*.json` into a standalone build, since the loader reads the pack from disk at runtime

`lib/pack.ts` loads the pack once through the engine's own validating loader. If the content firewall rejects the pack, the site fails loudly rather than answering from a half-loaded record.

## Layout

```
app/
  layout.tsx        fonts (self-hosted via next/font), metadata, skip link
  page.tsx          server component — pack-derived numbers, not hard-coded copy
  globals.css       the retro design system
  api/check/route.ts   the engine call
components/       Nav · Hero · Checker (client) · WhatItDoes · ChangeWatch · Pricing · Footer
lib/
  checker.ts        questions, bands, answers → engine Profile. Shared client/server.
  pack.ts           server-only pack access
```

## Deliberate departures from the prototype

| Prototype | Here | Why |
|---|---|---|
| Sector chips → CBAM/EUDR/CSRD verdicts | Five CSRD facts → real determinations | Only the CSRD pack exists. CBAM/EUDR verdicts were mockup fiction, and CSRD applicability does not depend on sector. |
| Fake OCR drop-zone that "finds 5 facts" | Descriptive panel on how facts are sourced | No extraction pipeline is built. A widget that pretends to process a document is a lie in an interaction. |
| "11 changes reviewed · 1 affected you" | Real `changeWatch` entries and pack counts | Those numbers now come from the pack, so they cannot drift from the truth. |
| £490 / £1,900 price tags | Tiers without figures | Pricing is not validated; the stage story still lands. |
| Bright orange text and buttons | Rust (5.9:1) and deep teal (6.8:1) | The prototype's `#d55e28` fails WCAG AA at 3.45:1 on cream. Orange is kept for decoration, borders and large display type. |

## Known limits

- **Placeholder CTAs.** "Sign in", "Talk to us" and the post-result CTA scroll within the page. There is no auth, no CRM and no email capture yet.
- **CSRD only.** The page says so; it does not imply broader coverage.
- **Preliminary by construction.** Checker answers are `customer_statement` facts, not sourced documents, and all pack content is `draft` — so every result carries the unratified banner.
- **No analytics, no cookies, no third-party requests.** Fonts are self-hosted at build time.
