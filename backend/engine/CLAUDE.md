# DataStrata Applicability Engine — Claude Code guide

This repo is DataStrata's applicability engine v1: a **deterministic, three-valued, source-cited evaluator** over versioned regulatory knowledge packs. CSRD is the first pack; CBAM must fit the same engine with zero program-specific code (that is the standing architecture gate).

Strategy context lives in the DataStrata Claude project: `strategy/pass-1-product-strategy.md`, `strategy/pass-2-product-design.md`, `strategy/pass-3-applicability-engine.md`, `engineering/applicability-engine-v0.md`.

## Product laws (never violate — tests enforce most of these)

1. **No silent DOES_NOT_APPLY.** A missing fact, unknown code, straddling range, or unresolved upstream result yields `INDETERMINATE` with a reason code. Only definitive evidence yields a definitive no.
2. **Deterministic core, probabilistic edges.** The evaluator makes every applicability decision. AI may draft pack content, extract candidate facts, and explain stored results — it never decides applicability, never publishes into a pack, never generates an all-clear.
3. **Unconfirmed facts are invisible.** `ProfileFact.confirmed=false` (e.g. OCR candidates) never reaches the evaluator.
4. **Pending law never binds.** `legalStatus: adopted_not_effective | proposed` requirements can evaluate but never instantiate obligations; pending acts live in `changeWatch` and pack flags (e.g. `revised_esrs_in_force`).
5. **National-law gate.** No final legal conclusion while `CSRD-S-013` is unresolved for the governing Member State. A negative EU screen reads "threshold not met; national-law status requires review", never "CSRD does not apply".
6. **Closed condition language.** Do not add free-form expressions, script hooks, or model calls to conditions. A new primitive is allowed only if it is reusable across ≥2 programs — document it in `docs/architecture.md` and add unit tests. One special-case function for a single regulation is a failed gate.
7. **Everything cites.** Every requirement carries `sources` (IDs into `sources.json`) and every content edit must state its legal justification in the commit message.
8. **Draft vs ratified.** All content starts `ratification.status: "draft"`. Only Anna (or a named expert) flips to `ratified` after review. Customer-facing output from draft content must carry the prototype banner (the CLI does this automatically).
9. **Tiered sources, structural corroboration.** `monitoring/source-register.json`
   tiers every surface as `legal_record | official_body | tracker | news`. A
   `tracker` or `news` surface may never appear in a pack's `sources.json` — the
   test suite enforces it — so a non-official claim has no path into a citation
   except through an official record.

## Commands

```bash
npm test          # vitest — golden profiles + condition semantics + pack integrity. MUST be green before any commit.
npm run typecheck # tsc --noEmit
npm run assess -- examples/p001-eu-standalone.json          # cited scope report
npm run assess -- examples/p008-protected-supplier.json --json
```

## Map

```
src/types.ts                 schema v0 (facts, conditions, requirements, determinations, obligations)
src/condition/evaluate.ts    three-valued evaluator (Kleene logic, range-safe thresholds) + trace
src/engine/facts.ts          fact resolution across the scope graph (trust boundary lives here)
src/engine/evaluate.ts       assess(): requirements × scope objects → determinations (memoised refs)
src/engine/obligations.ts    obligation instantiation (in-force + APPLIES only, deduped per scope)
src/engine/nextQuestion.ts   adaptive interview compiler (rank unresolved facts by blocked weight)
src/engine/summary.ts        program summary — a projection, never the authoritative output
src/knowledge/loader.ts      zod validation + referential integrity (the content firewall)
knowledge/csrd/              the CSRD knowledge pack (ALL regulatory content is data here)
knowledge/csrd/country-packs national overlays; ratified ones are listed in catalogues.json
src/monitoring/register.ts   source-register schema, tier policy, citation firewall
monitoring/source-register.json  every surface watched, tiered; corroboration rules are data
monitoring/automation-prompt.md  draft watch-sweep prompt (Plan C; not yet enabled)
monitoring/proposals/        /sweep map output awaiting human acceptance
test/golden-profiles.test.ts P-001..P-010 — regression testing for law. Never weaken an assertion
                             without a written legal justification.
```

## How to do common tasks

**Add/change a requirement (content session):**
1. Read the official source; add/update the `sources.json` record (status at snapshot matters).
2. Edit `knowledge/csrd/requirements.json` — plain English + condition in the closed language + citations + caution.
3. If a new fact is needed, add it to `fact-types.json` (with `missingReason`) and wire a question in `questionnaire.json`.
4. Add or extend a golden profile capturing the new behaviour, including its "must not happen".
5. `npm test`. An unexpected flip of an existing golden profile blocks the change until reviewed.
6. Leave `ratification.status: "draft"`; record what changed and why (source + date) in the commit message.

**A watched source changed (from a monitoring brief):**
- Only encode from the official legal record (EUR-Lex/OJ), not from news. Track status precisely: proposed → adopted_not_effective → in_force → transposed.
- If the revised ESRS / voluntary standard enter into force: flip the pack flag in `pack.json`, bump `version`, run tests, and note the delta — S-012 selections will change; that is the designed behaviour.

**Add a country pack:** copy `country-packs/_template.json`, resolve every `requires_research` field with official citations, add country golden profiles, get ratification, then add the Member State to `catalogues.json → ratified_country_packs`. Until that last step, S-013 correctly keeps the country unresolved.

**Add the CBAM pack (the architecture stress test):** new folder `knowledge/cbam/` with the same file shapes; the engine must need at most new *reusable* primitives (`prefix_in`, `sum_cmp`, `quantifier_any` already exist for CN codes, the 50t threshold, and lane quantification). Any CSRD- or CBAM-specific branch in `src/` means the design has failed — stop and rethink content-side.

## Style

- TypeScript strict; no new runtime dependencies without discussion (currently: zod only).
- Engine code stays program-agnostic: grep for "CSRD" under `src/` should only ever hit comments/docs.
- No `Date.now()` in engine logic — the assessment date comes from `AssessmentContext` (determinism).
- Keep evaluator changes small and unit-tested; content changes belong in JSON, not code.
