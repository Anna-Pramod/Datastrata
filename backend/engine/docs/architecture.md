# Architecture — schema v0 (implemented)

This implements Pass 3 §7 (schema v0) and the Pass 2 knowledge architecture at two-person scale. The engine is program-agnostic; every regulatory statement is data in a knowledge pack.

## The one-sentence model

**Shared knowledge** (sources → requirements-with-conditions → obligation templates) **× private profile** (scope objects + sourced, confirmed facts) **→ determinations** (three-valued, traced, cited) **→ obligations → gaps**, with the interview compiled from whatever is still unresolved.

## Three-valued evaluation (Kleene)

| op  | rule |
|-----|------|
| all | any FALSE → FALSE; else any INDET → INDET; else TRUE |
| any | any TRUE → TRUE; else any INDET → INDET; else FALSE |
| not | swaps TRUE/FALSE; INDET stays INDET |

Consequences that matter legally:
- A definitive miss on one cumulative threshold resolves the conjunction (850 employees kills Art. 19a scope even with turnover unknown).
- Unknown never becomes "no": missing facts, straddling ranges, catalogue misses and unresolved upstream refs all surface as `INDETERMINATE` + reason + the facts needed (`needs[]`), which is what the interview compiler consumes.
- `not(INDET) = INDET`: an unresolved exemption keeps the post-exemption duty unresolved instead of asserting it.

Range semantics: values may be `{min,max}` (inclusive). `range gt t`: `min>t → TRUE`, `max≤t → FALSE`, else `INDETERMINATE(range_crosses_threshold)` — the highest-information next question and ranked with a bonus accordingly.

## Condition language (closed, v0 primitives)

`all / any / not · cmp (range-safe) · eq · in_set · in_catalogue · prefix_in · exists · count_cmp · quantifier_any · sum_cmp · fy_starts_on_or_after · fy_start_year_in · year_diff_lt · requirement_ref · pack_flag`

- Statically analysable: the loader extracts every fact/requirement/catalogue reference — the dependency graph, interview and impact analysis fall out for free.
- `prefix_in`, `sum_cmp`, `quantifier_any` exist now (unused by CSRD) so CBAM's CN-code, 50-tonne aggregation and lane logic land as content, not engine work.
- `in_catalogue` distinguishes *known-out* (FALSE) from *never-seen* (INDET + missReason) — Gate A's "no unknown code silently produces does-not-apply".
- `pack_flag` carries knowledge-side state (e.g. `revised_esrs_in_force=false`): pending acts flip determinations only when the pack says the law is effective. Flipping a flag is a versioned pack change that re-runs golden profiles.

## Fact resolution (`src/engine/facts.ts`)

Each FactType declares the scope type it attaches to. Evaluating a requirement on scope S resolves a fact by: same object → linked counterparty (requests) → nearest ancestor of the declared type. Only `confirmed` facts resolve — the OCR/extraction trust boundary is structural, not procedural.

## Deviations from the pack workbook (deliberate, with reasons)

1. **Obligations moved off the raw threshold rules.** Sheet 05 mapped S-001/S-002 → O-001..O-009 *and* S-014/S-015 → the same templates; that double-instantiates and breaks golden P-003 (no duplicates) and P-004 (exempt subsidiary must not get reporting obligations). Templates now trigger on the post-exemption duty (S-014/S-015); thresholds stay scope-only.
2. **`selection` requirement kind added** for S-012 (ESRS version). The sheet's nested-IF isn't boolean; ordered `cases` with three-valued gating is reusable (CBAM default-values selection will need it too).
3. **Reason codes normalised** to a canonical set (`missing_fact, range_crosses_threshold, catalogue_unknown, source_conflict, legal_ambiguity, customer_scope_ambiguity, national_law_unresolved, upstream_indeterminate, source_status_unresolved`); sheet-specific labels (threshold_range, perimeter_unresolved…) map onto these.
4. **`reporting.first_reporting_year` and the S-016 inputs are organization-scoped** (sheet had entity) — the transition window runs at reporting-perimeter level; simplifies cross-scope refs in v0.
5. **Q-021 (value-chain router) gates on `S-014 = DOES_NOT_APPLY`** rather than "after screen": an in-scope reporter shouldn't be walked through supplier-protection questions (golden P-001's must-not-happen).
6. **Ratification is a field, not a promise:** `ratification.status draft|ratified` on every requirement; CLI banners draft content. This is the expert sign-off gate from Pass 2 §5 made concrete.

## What is NOT built yet (deliberately — Pass 3 build order)

- OCR/candidate-fact extraction pipeline (schema supports it: `confirmed=false` + `source.kind='extraction'`).
- RegulatoryEvent → selective re-evaluation → delta briefing (step 7). The pack's `changeWatch` + monitoring watchlist prepare it; determinations are pure functions, so diffing two runs is trivial.
- Country packs with content (stubs + the S-013 gate exist; encoding a pilot country is a content sprint, not engine work).
- Persistence/tenancy/API. The engine is a pure library on purpose — Postgres + thin API wrap it when concierge volume justifies it (Pass 2 §8 build honesty).

## The standing architecture gate

CBAM + one buyer/voluntary program must express in this schema with ≥90% of requirements needing no new engine code and no program-specific branches under `src/`. Track any missing primitive; accept it only if ≥2 programs want it.
