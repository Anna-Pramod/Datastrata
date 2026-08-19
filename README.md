# DataStrata

Regulatory intelligence platform for sustainability market access. For a given organisation it answers, continuously: **what applies, what changed, what must be done by when, what proof is required, what happens if nothing is done, and are we ready to be checked.**

The architecture is two graphs and one join:

| Layer | What it holds | Rule |
|---|---|---|
| Shared regulatory knowledge | Sources, requirements, conditions, obligation templates, evidence expectations | Built once, maintained once, used by every customer |
| Private customer graph | Entities, products, trade lanes, sourced facts, determinations, obligations, evidence, history | Strictly isolated, attributable, exportable |
| The join | A shared requirement evaluated against private facts, bound to a specific entity/product/lane | Everything upstream creates it; everything downstream satisfies and proves it |

## Repository map

```
backend/        The deterministic core — runs the law
  engine/       Applicability engine v0.1 (TypeScript). Knowledge packs as data.

frontend/       The product surface — shows the answer
  web/          The real site (Next.js). Seismograph/Oxide.
  prototypes/   Superseded .dc.html exploration + runtime
  screenshots/  Rendered stills of those prototypes

docs/           The specification the code is built against
  briefs/       Product architecture (Pass 2) + UI/UX mockup brief
  source-documents/  Original .docx of the above

New website design/   The current design direction (Seismograph/Oxide) and its
                      token + component handoff. This is what frontend/web implements.
```

Start with `docs/briefs/product-architecture-pass2.txt` for the product, then `backend/engine/CLAUDE.md` for the engineering laws.

## Current state

| Piece | Status |
|---|---|
| Applicability engine | Working library + CLI. 74 tests, green. CSRD pack encoded, all content `draft` (unratified). |
| Country packs | Stubs only — no ratified country, so every result correctly ends "national-law status requires review". |
| Frontend | Landing, 8-step check, sample dashboard and login shell built for real (Next.js, `frontend/web`) in the Seismograph/Oxide language. Check and dashboard run the engine. |
| Persistence / API / tenancy | Not built — deliberate. The engine is a pure library until concierge volume justifies wrapping it. |
| Change monitoring | Tiered source register (`backend/engine/monitoring/`) built, schema-validated, cross-checked against the pack, and tested; `/sweep map` discovers candidates. Watch sweep + scheduling not built, automation not enabled. |

## Running things

```bash
# Backend
cd backend/engine
npm install
npm test
npm run assess -- examples/p001-eu-standalone.json

# Frontend — the real site
cd frontend/web
npm install
npm run dev                                    # http://localhost:3000

# Frontend — the remaining screens, still prototypes
open frontend/prototypes/app-modern.dc.html    # any modern browser
```

## The product laws (they govern both halves)

1. **No silent "does not apply."** Missing facts produce `INDETERMINATE` with a reason code, never a negative.
2. **Deterministic core, probabilistic edges.** AI drafts and explains; it never decides applicability, never publishes into the knowledge record.
3. **Unconfirmed facts are invisible.** Extraction proposes; a human confirms before a fact can affect an answer.
4. **Everything cites.** Every determination carries its derivation trace and official sources.
5. **Versions, not overwrites.** History is appended so the defence file survives.
