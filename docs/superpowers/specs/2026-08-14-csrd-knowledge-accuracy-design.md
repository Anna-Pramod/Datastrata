# CSRD knowledge accuracy — source register, verification, sweep and coverage

**Date:** 2026-08-14
**Status:** Design approved, ready for implementation planning
**Scope:** CSRD pack only. Structures are program-agnostic so CBAM inherits them.

## 1. The problem

The engine is sound. The content is unverified.

All 16 CSRD requirements carry `ratification.status: "draft"`. Nobody has sat with the legal text and confirmed the encoding matches it. The landing-page checker is answering questions from strangers using content no human has signed. Three distinct gaps:

| Gap | Symptom |
|---|---|
| **Unverified** | 16 rules encoded, 0 checked against source text |
| **Unauthorable** | Content lives in JSON; changing it requires an engineer |
| **Unmapped** | No record of which provisions are encoded, which aren't, which were deliberately skipped |

Priority is verification first, coverage third, authoring deferred (see §8).

### Two failure modes, one often mistaken for the other

- **Encoding error** — the law says X, the rule says Y. Caught only by reading source text against the encoding. A source sweep will never catch this: the source hasn't changed, our reading of it was wrong.
- **Staleness** — the rule was right, the law moved. Caught only by a sweep.

Both draw on the same source register. Neither substitutes for the other.

### Concrete findings from reading the repo (2026-08-14)

These are the design's motivating evidence, not speculation:

1. **`CSRD-S-001` may be missing a criterion.** It encodes Art. 19a as `turnover > €450m AND employees > 1,000`, annotated *"Both thresholds are cumulative."* The Accounting Directive's Art. 3 size test is historically a **two-of-three** test including balance sheet total. `fact-types.json` contains **no balance-sheet-total fact** (all 51 checked). Either Omnibus I replaced the test, or a criterion and its fact were dropped. Unresolved — verification item #1.
2. **Two rules have zero test coverage.** `CSRD-S-006` and `CSRD-S-016` are referenced by no assertion in `golden-profiles.test.ts`. They could be encoded wrongly and all 45 tests would still pass.
3. **No country is ratified.** `catalogues.json → ratified_country_packs.entries` is `{}`, so `CSRD-S-013` never resolves and *every* answer ends "national-law status requires review."
4. **The public checker reaches six rules.** `BASE_REQUIREMENTS` in `frontend/web/lib/checker.ts` is `S-014, S-001, S-002, S-015, S-013`, plus `S-007` for non-EU visitors. Those six are making public claims today.

### Target user (governs the national-status design)

The customer is not a company checking whether it is non-compliant today. It is a company in 2026 asking *"what is coming at me, and what should I have ready before it lands."* Omnibus I's transposition deadline is 19 Mar 2027; most Member States have not transposed. **Not-yet-transposed is the market, not a dead end.**

This needs no architectural change. Product law 4 (`adopted_not_effective` requirements evaluate but never instantiate obligations) already separates "will apply" from "binds now", and `gap-tests.json` already holds the readiness spine.

## 2. Decisions taken

| Decision | Choice | Reasoning |
|---|---|---|
| Sweep's first output | Map **and** change report, map first | The change report must watch a source list a human has corrected |
| Source transparency | Clickable URL on every source; provenance chain on every non-official claim; machine feed where one exists | Auditability is a product property, not a nicety |
| Who signs off | The user — self-taught, works in ESG, not issuing legal opinion | Design to the truth; AI assists, never signs |
| National law | EU-level verified **+** live per-country transposition status **+** country packs encoded as transpositions land | Serves the preparing customer without overclaiming |
| Storage | JSON stays source of truth; generate a human-readable review sheet from it | Spreadsheets cannot hold nested conditions, cannot diff, cannot review |
| Authoring tool | Deferred until after the 16-rule verification pass | Design it once the work is understood; revisitable |

Rejected: spreadsheet-as-source-of-truth for requirements. Conditions nest three levels deep (`all[ …, any[ not(…), not(…) ], … ]`); putting that in a cell means inventing a language with no validation, no diff and no review history.

## 3. The source register

### The trap avoided

Two registers already exist and overlap:

- `knowledge/csrd/sources.json` — 15 **legal documents** requirements cite (`SRC-001` = Accounting Directive)
- `monitoring/watchlist.json` — 10 **web pages** watched (`W-001` = the EUR-Lex page for Omnibus I)

Adding a third "sources" list would produce three registers and no truth. Instead:

- **`sources.json` stays the citation record — official legal instruments only.** Nothing else may enter, because requirements cite from it.
- **The new register is a register of *surfaces*** — every place we look — and it absorbs `watchlist.json`.

**This makes corroboration structural rather than procedural.** A news article cannot become a citation because news sites cannot exist in `sources.json`. The only path from "a tracker said something" into the record runs through an official legal document. There is no other door to forget.

### Four tiers

| Tier | Examples | Sufficient alone? | Citable? |
|---|---|---|---|
| `legal_record` | EUR-Lex, Official Journal, national gazettes | Yes — this *is* the law | Yes |
| `official_body` | Commission pages, EFRAG, national ministries | **Non-binding facts only** (expected dates, guidance, consultations) | Yes |
| `tracker` | Big Four briefings, law-firm notes, CSRD trackers | No — must corroborate | Never |
| `news` | Press | No — must corroborate | Never |

The middle tier carries the load. The Commission stating "entry into force expected 20 Nov" is authoritative enough for a horizon entry but **not** enough to flip a pack flag; only OJ publication is. `automation-prompt.md` already asserts this in prose — the tier system makes it enforceable.

### Row schema — `monitoring/source-register.json`

```json
{
  "id": "W-011",
  "tier": "tracker",
  "name": "Example CSRD implementation tracker",
  "authority": "Who operates it",
  "url": "https://…",
  "feed": null,
  "feedNote": "HTML only — no feed offered",
  "governs": "National transposition status across Member States",
  "affectsRequirements": ["CSRD-S-013"],
  "mustCorroborateWith": ["legal_record"],
  "expectedProvenance": ["SRC-015"],
  "cadence": "weekly",
  "lastSeen": null,
  "discoveredBy": "sweep-map 2026-08-14",
  "tierRationale": "Commercial commentary; not an issuing authority"
}
```

- `url` — always present, always clickable (transparency requirement B)
- `feed` / `feedNote` — machine feed where one exists (EUR-Lex ELI/CELEX, OJ daily L-series), honest null otherwise (requirement A). Records which sources are fragile HTML scrapes.
- `mustCorroborateWith` — derived from tier, stored explicitly so tests can assert consistency
- `expectedProvenance` — which `SRC-###` a claim from this surface should trace back to (requirement C)
- `affectsRequirements` — impact analysis becomes a lookup, not research

### `knowledge/csrd/national-status.json`

Customer-facing content, not monitoring plumbing — therefore in the knowledge pack and loader-validated. One row per Member State:

```json
{
  "country": "DE",
  "status": "draft_published",
  "asOf": "2026-08-14",
  "expectedDate": "2027-03-19",
  "citation": { "sourceId": "SRC-015", "url": "https://…", "title": "…" },
  "note": "Draft implementing bill published 3 Jun 2026"
}
```

`status` ∈ `not_started | draft_published | adopted | in_force`.

This converts a flat "requires national review" into *"Germany has not transposed Omnibus I as of 14 Aug 2026; draft bill published 3 Jun 2026; deadline 19 Mar 2027 [source]."*

Note: this table is **informational and cited**. It does not resolve `CSRD-S-013`, which still requires a ratified country pack. A country enters `ratified_country_packs` only through the existing ratification route.

### Resulting file layout

Paths are relative to `backend/engine/` unless stated otherwise.

```
knowledge/csrd/sources.json          citation record — official instruments only (unchanged)
knowledge/csrd/national-status.json  per-country transposition status — cited, customer-facing (new)
knowledge/csrd/coverage.json         provision-level coverage map (new, §6)
monitoring/source-register.json      every surface we look at, tiered (new; absorbs watchlist.json)
monitoring/state/last-seen.json      sweep state (new)
monitoring/briefs/YYYY-MM-DD-csrd.md dated change briefs (new)
verification/CSRD-S-0NN.md           per-requirement verification log (new, §4)
verification/review-sheet.md         generated review document (new, §4; git-ignored output)

<repo root>/.claude/commands/sweep.md the /sweep command (new, §5)
```

## 4. The verification pass

> **Superseded 2026-08-20** by `2026-08-20-verification-factory-design.md`, which
> replaces this section with an agent-driven, program-agnostic pipeline: a
> snapshotted legal corpus, a blind independent reading, adversarial prosecution,
> evidence-bound adjudication, an immutable signature ledger with derived status
> and staleness, and a measured benchmark gate. The section is retained for the
> reasoning behind the review sheet, the adversarial check and the three-level
> status, all of which carry forward. Two details here are now stale: the test
> count (74, not 45) and the "six public requirements" ordering — the rebuilt
> site runs `assess()` over the whole pack.

### Parts

**1. Review sheet, generated from the pack.** One page per requirement containing:

- Plain English as encoded
- **The condition rendered in normal sentences**, not JSON — requires a condition→English renderer covering all v0 primitives
- Cited sources with clickable URLs and the `provisions` string
- Facts consumed, and which questions collect them
- Obligations that fire if the rule comes out true
- Golden profiles exercising it (or a warning that none do)
- Sign-off block

The reviewer never reads JSON.

**2. Adversarial AI check, run before review.** Prompted to **refute**, not confirm — confirmation bias produces agreement, which is worthless. It reads the cited legal text, enumerates every way the encoding could diverge, defaults to "mismatch" when uncertain, and quotes the article text for each challenge. It edits nothing. Output is a shorter, sharper list for human adjudication.

Example of the expected output shape (finding #1 from §1):

> `CSRD-S-001` requires turnover **and** employees cumulatively. Art. 3 of the Accounting Directive states a two-of-three test including balance sheet total. The pack has no balance-sheet-total fact. Either the encoding dropped a criterion or Omnibus I replaced the test — cannot resolve from the pack alone.

**3. Three-level status, recorded in the pack.** Replaces the current `draft | ratified` binary:

| Status | Means | Customer-facing treatment |
|---|---|---|
| `draft` | Encoded, unchecked | Prototype banner (current behaviour) |
| `verified` | Checked against source text by a named person on a date — **not legal advice** | Caveat, but usable |
| `ratified` | Professionally opined | Clean. Reserved; unused for now |

New fields on `ratification`: `verifiedBy`, `verifiedOn`, `verifiedAgainst` (exact source version and date), `openQuestions[]`.

`openQuestions[]` is load-bearing: it stops "I checked but couldn't fully settle this" from silently becoming "it's fine."

Requires changes to `src/types.ts`, `src/knowledge/loader.ts`, and the CLI banner logic in `src/cli/assess.ts`.

**4. Verification log per requirement** — `verification/CSRD-S-0NN.md`. What was checked, against which text and version, what the adversarial pass challenged, how each challenge was resolved, who signed and when. Appended, never overwritten (product law 5). This is the defence file: the answer to *"why does your tool say this?"*

### Order

The six requirements the public checker reaches — `S-014, S-001, S-002, S-015, S-013, S-007` — are verified first, because they are making claims to the public today. The remaining ten follow.

### Safety net

Any correction re-runs the 45 existing tests. An unexpected golden-profile flip blocks the change until reviewed and justified in writing (existing rule in `CLAUDE.md`).

## 5. The sweep

### Governing principle

**A source we couldn't read is not a source that said nothing.** A failed fetch is reported as *"W-007: fetch failed, not checked"* and never folded into an all-clear. This is product law 1 applied to monitoring.

**Every finding carries a URL and a quoted snippet from the page.** No quote, no finding. This is the anti-hallucination control: a claim cannot be reported if the words cannot be shown.

### Mode `map`

Builds and extends the register. Uses `WebSearch` to discover candidate surfaces and `WebFetch` to confirm each one resolves and to read what it actually covers — official bodies, national gazettes, EFRAG, major trackers and the outlets that break regulatory stories. For each candidate it proposes a register row and states **how it was found** and **why the tier was assigned** (`discoveredBy`, `tierRationale`). Detects machine feeds. Links to requirement IDs and expected `SRC-###` provenance. Flags dead links and duplicates in existing content.

A candidate that cannot be fetched appears in the proposed diff with **no tier assigned** and a note explaining why. It cannot be accepted into the register until a human assigns one. Tier is never inferred from a domain name or reputation. The register itself therefore only ever holds the four valid tiers, which is what §7's loader test asserts.

Output is a **proposed diff**, accepted or rejected row by row. Never writes directly. Re-run when adding a program or a country.

### Mode `watch`

For each source due by cadence: fetch (feed where available, page otherwise), compare against `last-seen.json`, classify `MATERIAL` / `RELEVANT` / `NOISE`.

Corroboration flow:

```
Finding from tracker or news
        │
        ├── enters brief as UNCORROBORATED
        │
        └── sweep searches for the official record
                ├── found     → promoted, cited to legal_record, may propose a pack change
                └── not found → "Claims we could not verify" section
                                 · visible to the operator, clearly labelled
                                 · MUST NOT propose a pack change
                                 · MUST NOT reach a customer surface
```

The quarantine branch is deliberate. A tracker reporting something real but ahead of publication is a genuine early signal: visible, not actionable, until the official record catches up. Nothing discarded; nothing unverified leaked.

### What the sweep never does

Edit a requirement, flip a pack flag, or change a determination. It proposes, in the existing language: *"flip `packFlags.revised_esrs_in_force`, bump the pack version, run `npm test`, re-check `CSRD-S-012`."* Same trust boundary as the OCR pipeline — the machine proposes, a human publishes.

### State location — deliberate change from `automation-prompt.md`

Current spec puts last-seen state in a Cowork project doc. Moving it into the repo: `monitoring/state/last-seen.json` and `monitoring/briefs/YYYY-MM-DD-csrd.md`. Reasons: git-tracked history, diffable changes, and **the accumulated brief folder is the change ledger** — the "N changes watched, M mattered, zero surprises" evidence Pass 2 identifies as the renewal case. A commercial asset, not a log file.

### Invocation

A single project command, `<repo root>/.claude/commands/sweep.md`, taking the mode as its argument:

```
/sweep map
/sweep watch
```

On-command only. No scheduling until the output is trusted. `watch` takes minutes across 20–40 sources — it fetches real pages.

`watch` also refreshes `national-status.json` from the EUR-Lex national-transposition page (`W-002`) and national gazettes.

## 6. The coverage map

Three axes, all computable from the repo.

**Legal coverage** — `knowledge/csrd/coverage.json`. One row per provision that could create a duty: article, source ID, status ∈ `encoded` (→ requirement IDs) / `not_encoded` / `out_of_scope` / `unknown`. **`out_of_scope` requires a written reason.** This is what distinguishes a decision from a defect.

**Interview coverage** — the pack holds 51 facts and 38 questions; the public checker asks five. Correct for a free teaser, but stated explicitly so the checker's output is never mistaken for a full assessment.

**Test coverage** — which requirements are exercised by golden profiles. Currently surfaces `CSRD-S-006` and `CSRD-S-016` at zero.

All three render through the same generator as the review sheet.

## 7. Testing and error handling

Added to the existing 45 tests:

- **Loader validation of new files** — every referenced requirement ID resolves, every `SRC-###` resolves, every tier is one of four, `mustCorroborateWith` is consistent with tier. Fails at load, not at runtime.
- **The firewall, enforced** — no `tracker` or `news` source may appear in `sources.json`. Corroboration becomes a property the suite defends.
- **No unsigned verification** — a `verified` requirement lacking `verifiedBy` / `verifiedOn` / `verifiedAgainst` fails the build.
- **No untested rule** — every requirement must be exercised by a golden profile, or be explicitly listed as untested with a reason.
- **Corroboration logic on fixtures** — a tracker finding with no official record must be provably unpromotable. (Network fetching is not unit-tested; classification and promotion logic is.)

Error handling:

| Condition | Behaviour |
|---|---|
| Fetch fails | Recorded as not-checked. Never part of an all-clear. |
| Tier ambiguous | `map` proposes; a human assigns. |
| Pack fails validation | Site refuses to answer (already true in `frontend/web/lib/pack.ts`) |
| Correction flips a golden profile | Blocked until reviewed and justified in writing |

## 8. Non-goals

- **No authoring workbench yet.** Deferred until after the 16-rule pass. The review sheet delivers most of its value (read every rule in plain English, mark corrections); building the tool before the work is understood means guessing at requirements. Consequence, accepted: changing rule *content* requires an engineering session. Revisitable.
- **No scheduled automation.** On-command only until the output is trusted.
- **No database, API or tenancy.** The engine stays a library (Pass 2 §8 build honesty).
- **No country-pack content beyond transposition status.** Encoded country by country as transpositions land.
- **No AI writing into the pack.** Ever. Product law 2.

## 9. Build order

1. Source register schema; absorb `watchlist.json`; loader validation
2. `/sweep map` → run → operator corrects the register
3. Review-sheet generator + condition→English renderer + adversarial check + `verified` status schema change
4. **Verify the six public requirements** → sign
5. `/sweep watch` + brief format + `national-status.json`
6. Coverage map generator
7. Remaining ten requirements

Steps 1–2 are the shared foundation. Step 4 is the first point at which the site's public claims rest on checked content.

**This spec is larger than one implementation plan.** Natural plan boundaries:

| Plan | Steps | Delivers |
|---|---|---|
| **A — Foundation** | 1–2 | A corrected, tiered, cited source register |
| **B — Verification** | 3–4 | The six public requirements checked and signed |
| **C — Operation** | 5–7 | Change detection, national status, coverage, remaining ten rules |

Each is planned and executed separately. Plan A must complete before B, because the verification pass reads legal text from sources the register names.

## 10. Open items carried into implementation

- ~~Resolve finding #1 (`CSRD-S-001` two-of-three vs cumulative, and whether a balance-sheet-total fact is missing).~~ **Resolved 2026-08-14: encoding correct.** Omnibus I Art. 1(4)(a) replaced Art. 19a(1)'s "large undertakings" formulation with a direct cumulative test; Art. 3(4) no longer applies to this rule. No balance-sheet-total fact needed; no `at_least_n_of` primitive needed. Full record in `backend/engine/verification/CSRD-S-001.md`.
  - **New, carried forward:** the operative wording is *"on their balance sheet **dates**"* (plural), and Art. 3(10) generally requires criteria to be exceeded on two consecutive balance sheet dates. The encoding tests a single year and the pack holds no prior-year facts. Unresolved — must be settled before `CSRD-S-001` can be signed.
  - **New, carried forward:** `CSRD-S-002` (Art. 29a) is a separate provision and is **not** settled by the Art. 19a check. Verify separately.
- Decide `CSRD-S-006` and `CSRD-S-016`: write golden profiles, or list them as untested with a reason.
- Choose the pilot country for the first encoded country pack (`IE` and `DE` stubs exist). Not needed before step 5.
