# C/G — timing and exemption composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session, with no subagent (the session's standing rule: every teeth check is run by the session itself, from a copy taken first, restored by hash). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CSRD pack decides *whether the Article 19a/29a measures apply to this undertaking for this financial year* (Article 5(2) of Directive (EU) 2022/2464) separately from *whether the size test passes* and from *whether an exemption removes the duty*, composes the three per reporting route, and requires the coverage of the undertaking **and its subsidiaries** wherever the cited provision requires both — so a FY2026 group above the new thresholds is not told to report, a first-wave public-interest entity below them is not told it has no duty, and an individual exemption never extinguishes a consolidated duty.

**Architecture:** Seven new boolean requirements authored at version 1 — `CSRD-S-017` and `CSRD-S-018` (individual and consolidated first application over `SRC-002` Article 5(2), each ANY of the point (a) criteria for FY2024–26 and the point (b) date composed with the size test, under a top-level Article 1(4) exclusion conjunct), `CSRD-S-022` (the fifth-subparagraph derogation on a consolidated basis), `CSRD-S-019` (the Article 29a(8)/(9) consolidated exemption over a declared sub-group coverage fact and the second-subparagraph disclosures), `CSRD-S-023` (the Article 29a(7a) financial-holding option as a deferred bracket that never silently reads "not exercised"), `CSRD-S-020` and `CSRD-S-021` (the individual and consolidated duties, each timing minus its own exemptions) — and three re-authored: `CSRD-S-014` version 4 becomes the disjunction of the two duties, `CSRD-S-005` and `CSRD-S-006` version 4 require coverage of the undertaking's subsidiaries where it has any (Article 19a(9), "such undertaking and its subsidiary undertakings"). Eight new facts are stated, never derived — including the Article 3(4)/(7) size-category status, because Article 3(10)'s two-consecutive-years rule is not representable yet — and seven questionnaire items collect them behind gates that ask only what an unresolved determination needs. No engine module changes. The two provenance goldens are rewritten once as a reviewed change, with their transition layer re-specified as a stated partition.

**Tech Stack:** TypeScript (strict), zod (no new dependency), vitest, Python 3 with `-I` for file edits, the candidate's own binaries under `node_modules/.bin`.

## Global Constraints

- `docs/superpowers/TEST-EVIDENCE-STANDARD.md` applies to every task: a green check is evidence only when it is known to fail against the defect it names; a red check is evidence only once its message names the intended assertion. Each task below carries one teeth check naming its defect, run from a copy taken first and restored by hash — and no mutation campaign beyond those (the user: "No broad mutation campaign").
- The baseline for each task is **the previous task's finishing count**, never a fixed number; Task 0 records the starting counts (engine 83 files / 3223 tests; frontend 8 / 54 at HEAD `8844dd3`).
- `backend/engine/src/` is not edited: `grep -ri csrd backend/engine/src/` stays at exactly seven hits; `src/engine`, `src/condition`, `src/verification`, `src/pipeline` untouched.
- The user's resolutions, verbatim and binding: two timing requirements (individual, consolidated), the pre-2027 first-wave route independent of the new thresholds; timing and exemptions composed separately per route; coverage of the entity **and its subsidiaries** where the cited provision requires both, including S-005/S-006, with counterexample rows 1 and 8 corrected (entity-only coverage cannot establish the individual exemption either); the Article 1(4) exclusion applied to both historical and later timing branches; S-003 kept as historical context, reporting history never substituting for legal eligibility; the national-law gate explicit at the existing summary boundary; large-undertaking/group status as a sourced, reviewable status fact (unknown unresolved), never derived from a single-year threshold calculation; F's full elective-option implementation deferred, but never silently assuming the option unexercised where it could affect the assessed holding undertaking.
- Registry entries are appended with the engine's own `requirementSha256`, after a control that reproduces the current entries of every requirement about to be re-authored; no existing entry changes. Every historical recording keeps its bytes; the two migration goldens are read, never written; the two provenance goldens are written once, by a one-off script outside the repository, after the diff has been read and explained; no regeneration path is added to the repository.
- Offline: no network, no inference, no live run, no capture package, no promotion, no signing, no publishing, no commit; `pipeline-live.agents.test.ts` never run; nothing under `pilot-evidence/` touched (verified read-only before and after); `b1b-record` untouched.
- The user runs every `git add` and `git commit`; subjects are imperative sentence-case, explain why, carry no prefix and no trailer.

---

## File structure

| File | Responsibility after this plan |
|---|---|
| `backend/engine/knowledge/csrd/fact-types.json` (modify) | eight new stated facts: `entity.is_public_interest_entity`, `entity.is_large_undertaking`, `group.is_large_group`, `parent.report_includes_all_subsidiaries`, `entity.exemption_disclosures_in_management_report`, `entity.is_financial_holding_undertaking`, `group.subsidiaries_business_models_independent`, `entity.art_29a_7a_option_exercised` |
| `backend/engine/knowledge/csrd/questionnaire.json` (modify) | `Q-040`–`Q-046`, gated on the unresolved determination that needs each fact |
| `backend/engine/knowledge/csrd/requirements.json` (modify) | `CSRD-S-005` v4, `CSRD-S-006` v4, `CSRD-S-014` v4; `CSRD-S-017`–`CSRD-S-023` v1, appended in id order |
| `backend/engine/knowledge/csrd/obligation-templates.json` (modify) | `O-010` also triggers on `CSRD-S-022`; `O-011` also on `CSRD-S-019` |
| `backend/engine/verification/requirement-versions/csrd.json` (modify) | ten appended entries |
| `backend/engine/test/knowledge-timing-and-exemption-composition.test.ts` (create) | the facts and gates; each new requirement as authored; the twelve counterexample rows as regression tests; the F bracket; the registry |
| `backend/engine/test/audit-expected-provenance.ts` (modify) | `POST_AUDIT_SOURCES` (the seven, from this design) and `EXPECTED_SOURCES` (audit ∪ post-audit); the audited table and its arithmetic untouched |
| `backend/engine/test/{knowledge-integrity,min-status,pipeline-source-completeness,verification-features,pipeline-reader,corpus-src002-ingestion,corpus-src005-ingestion,loader-freshness,status-truth-boundary,knowledge-scope-vs-timing,golden-profiles,knowledge-article-1-4-exclusion}.test.ts` (modify) | counts 16 → 23, 39 → 46 questions; the version table; the composition as re-specified; P-003 and the exclusion test's consolidated fixture state `entity.is_financial_holding_undertaking = false` |
| `backend/engine/test/provenance-golden.test.ts`, `frontend/web/test/provenance-public-golden.test.ts` (modify) | the source oracle over `EXPECTED_SOURCES`; the transition layer re-specified as a partition (what C/G moved, what it left) |
| `backend/engine/test/golden/provenance-engine-golden.json`, `frontend/web/test/golden/provenance-public-golden.json` (rewrite once) | the C/G generation |
| `frontend/web/lib/checker.ts`, `app/api/check/route.ts`, `components/marketing/CheckFlow.tsx`, `test/check-response.test.ts`, `test/status-truth-boundary-public.test.ts` (modify) | `holding?: 'yes' \| 'no' \| 'unknown'` for a parent, nothing preselected; `FACT_COPY` for the eight facts; the ledger fixture signs all 23 |
| `docs/superpowers/specs/2026-10-19-timing-and-exemption-composition-design.md` (modify) | status, the resolutions, rows 1 and 8 corrected, measured before/after outcomes, the open source questions |
| `docs/superpowers/CHECKPOINT-opus55-cg-timing-and-exemption-composition.md` (create) | what was found, decided and handed forward |

---

### Task 0: Baseline, controls and the "before" measurement

**Files:** none changed in the repository. Scripts in the session notes folder.

- [ ] **Step 1: Record the counts and digests** — the engine and frontend suite counts at HEAD (from the E closing: 83 / 3223, 8 / 54), the sha256 of both provenance goldens, both migration goldens, the six S-001 recordings and `PROVENANCE.md`, `requirements.json`, the registry.
- [ ] **Step 2: Registry control** — `register-digests.mts <engine> --check CSRD-S-005 CSRD-S-006 CSRD-S-014` prints `EQUAL (control holds)` for each at version 3, and confirms that re-serialising the registry reproduces its bytes exactly (so later appends change nothing but the appended lines).
- [ ] **Step 3: Measure the twelve rows before** — `measure-rows.mts <engine> before` builds each counterexample profile without the facts that do not exist yet and prints, per row, the results of S-001, S-002, S-004, S-005, S-006, S-014 and the summary flags. Saved as `logs/rows-before.log`; the design's "Today" column is checked against it.

### Task 1: The eight facts, the seven questions and the two triggers (red first)

**Files:** `fact-types.json`, `questionnaire.json`, `obligation-templates.json`; test: `knowledge-timing-and-exemption-composition.test.ts` (create), `knowledge-integrity.test.ts`.

**Interfaces produced:** the fact ids above (`boolean`; `legal_entity` except `group.*` which are `organization`; `missingReason: missing_fact` on every one, as decided for E: an unanswered question is a missing answer, and the public checker then says so rather than calling the law ambiguous); `Q-040` PIE status, `Q-041` large-undertaking status, `Q-042` large-group status, `Q-043` sub-group coverage, `Q-044` exemption disclosures, `Q-045` financial-holding status, `Q-046` the option (independence and exercise).

- [ ] **Step 1: Write the failing tests** — a `describe('the facts the composition states, never derives')` asserting each fact's scope, type and `missing_fact`, that the two size-category labels name Article 3(4)/3(7) and the notes name Article 3(10); a `describe('the questions, shown only to the determination that needs them')` asserting through `assess` + `rankNextQuestions`: Q-045 is not offered to a standalone (`e1`, FY2027) and is offered to a parent whose consolidated duty is unresolved for want of it (positive and negative in one test); Q-040/Q-041 are offered to a FY2025 EU entity whose first application is unresolved and not to the same entity at FY2027; `O-010` triggers on `CSRD-S-022` and `O-011` on `CSRD-S-019`. Run: red with `expected undefined to be defined` / `expected [] to contain 'Q-045'` (the questions reference requirements that do not exist yet; `loadPack` will refuse a question naming an unknown requirement, so the question gates land in Task 2/3 — this task lands the facts, the triggers and the question records whose gates reference existing facts only, and the gate assertions stay red until Task 4).
- [ ] **Step 2: Author** the eight fact records after `entity.excluded_by_article_1_4` (identity and exemption facts) and after `group.avg_employees` (the two group facts); the seven question records appended after `Q-039`; the two trigger lines.
- [ ] **Step 3: Run** the new file and `knowledge-integrity` (questions 39 → 46, fact types ≥ 55): the fact and trigger describes green; the gate describes red until Task 4.
- [ ] **Teeth (defect: a question shown to an entity it cannot concern)** — mutate `Q-045`'s gate to `{"always": true}` in a copy-first edit; the "not offered to a standalone" assertion must redden with `expected [...] not to contain 'Q-045'`; restore by hash.

### Task 2: The timing requirements `CSRD-S-017`, `CSRD-S-018`, `CSRD-S-022`

**Files:** `requirements.json`, the registry; test: the new file.

**Behaviour (the encoding):**

```text
CSRD-S-017  Individual first application (Article 5(2))     timing_context, legal_entity, high, SRC-002 + SRC-001
  ALL of:
    not eq entity.excluded_by_article_1_4 = true               (Article 1(4): excluded in every year — both branches)
    ANY of:
      ALL of:  fy_start_year_in [2024, 2025, 2026]              (point (a)(i), financial years starting 2024–2026)
               in_catalogue entity.incorporation_country eu_member_states
               in_catalogue entity.legal_form accounting_directive_forms
               eq entity.is_public_interest_entity = true
               eq entity.is_large_undertaking = true
               cmp entity.avg_employees gt 500
      ALL of:  fy_starts_on_or_after 2027-01-01                 (point (b)(i))
               requirement_ref CSRD-S-001 expect APPLIES
CSRD-S-018  Consolidated first application                   as above with is_parent_undertaking, group.is_large_group, group.avg_employees gt 500, CSRD-S-002
CSRD-S-022  FY2025–26 national transition exemption, consolidated basis   direct_legal_exemption, high, SRC-002 fifth subparagraph
  ALL of: in_catalogue incorporation eu; fy_start_year_in [2025, 2026]; ANY(not group turnover gt 450 000 000, not group.avg_employees gt 1 000); eq entity.member_state_transition_option = true
```

- [ ] **Step 1: Write the failing tests** — the encoding as authored (the exclusion conjunct is the first conjunct of the top-level ALL of both timing requirements; branch A carries the three identity criteria and the 500-employee test; branch B references the size test; locators and sources as above); behaviour rows 3, 4, 5, 6, 9, 10, 11, 12 at the timing level (S-017/S-018/S-022 only). Run: red with `pack has no CSRD-S-017`.
- [ ] **Step 2: Author** the three records, appended after `CSRD-S-016`; `register-digests.mts <engine> CSRD-S-017 CSRD-S-018 CSRD-S-022` appends version-1 entries.
- [ ] **Step 3: Run** the new file: the timing describes green.
- [ ] **Teeth (defect: a FY2026 non-first-wave group above the new thresholds read as already in)** — mutant: delete `fy_starts_on_or_after 2027-01-01` from S-018 branch B and re-register the mutant digest; row 3 must redden with `expected 'APPLIES' to be 'DOES_NOT_APPLY'`; restore both files by hash and re-register nothing (the copies carry the right registry).

### Task 3: Coverage — `CSRD-S-005`/`CSRD-S-006` v4, `CSRD-S-019`, and the `CSRD-S-023` bracket

**Files:** `requirements.json`, the registry; test: the new file.

**Behaviour:**

```text
CSRD-S-005 v4 / CSRD-S-006 v4: the conjunct  eq parent.report_includes_entity = true  is followed by
  ANY of: eq entity.is_parent_undertaking = false            (no subsidiaries: inclusion of the undertaking suffices)
          eq parent.report_includes_all_subsidiaries = true  (Article 19a(9): "such undertaking and its subsidiary undertakings")
CSRD-S-019  Consolidated exemption via a higher parent's qualifying report   direct_legal_exemption, high, SRC-001 Article 29a(8), Article 29a(9)
  ALL of: eq is_parent_undertaking = true; eq is_subsidiary = true; eq parent.report_includes_entity = true; eq parent.report_includes_all_subsidiaries = true;
          ANY of [ ALL(in_catalogue group.ultimate_parent_country eu_member_states, eq parent.report_standard = ESRS),
                   ALL(not in_catalogue …, in_set parent.report_standard [ESRS, EQUIVALENT], eq parent.assurance_opinion_available = true, eq parent.taxonomy_information_included = true) ];
          exists parent.report_public_url; eq entity.exemption_disclosures_in_management_report = true; eq entity.national_publication_conditions_met = true
CSRD-S-023  Financial-holding option, Article 29a(7a) — deferred encoding   direct_legal_exemption, high, SRC-001 Article 29a(7a), Article 2(15)
  ALL of: eq is_parent_undertaking = true; eq entity.is_financial_holding_undertaking = true; eq group.subsidiaries_business_models_independent = true; eq entity.art_29a_7a_option_exercised = true
```

- [ ] **Step 1: Write the failing tests** — S-005 v4: a non-parent subsidiary fully covered stays APPLIES (P-004's shape, unchanged); an intermediate parent whose own subsidiaries are not covered is DOES_NOT_APPLY; coverage unanswered is INDETERMINATE naming `parent.report_includes_all_subsidiaries`. S-019: rows 1, 2, 7 at the exemption level; the third-country branch; coverage false never exempts even with every disclosure made. S-023: a standalone is DOES_NOT_APPLY; a parent with holding status absent is INDETERMINATE naming the fact; holding false is DOES_NOT_APPLY; holding true with the option and independence stated true is APPLIES; holding true with the option unanswered is INDETERMINATE. Run: red.
- [ ] **Step 2: Author**; `register-digests.mts <engine> CSRD-S-005 CSRD-S-006 CSRD-S-019 CSRD-S-023` after the Task 0 control.
- [ ] **Step 3: Run** the new file: coverage and bracket describes green; `knowledge-article-1-4-exclusion.test.ts` still 16/16.
- [ ] **Teeth (defect: inclusion of the parent alone treated as Article 29a(8) coverage)** — mutant: remove `eq parent.report_includes_all_subsidiaries = true` from S-019, re-register; row 1's exemption assertion must redden with `expected 'APPLIES' to be 'DOES_NOT_APPLY'`; restore by hash.

### Task 4: The composition — `CSRD-S-020`, `CSRD-S-021`, `CSRD-S-014` v4, the twelve rows

**Files:** `requirements.json`, the registry; tests: the new file, `knowledge-scope-vs-timing.test.ts`.

```text
CSRD-S-020  Individual reporting duty (Article 19a)      direct_legal, critical, "Reporting duty", SRC-001 Article 19a(1) + SRC-002 Article 5(2)
  ALL of: requirement_ref CSRD-S-017 APPLIES; not ANY(requirement_ref CSRD-S-004, CSRD-S-005, CSRD-S-006 APPLIES)
CSRD-S-021  Consolidated reporting duty (Article 29a)    direct_legal, critical, "Reporting duty", SRC-001 Article 29a(1), 29a(8) + SRC-002
  ALL of: requirement_ref CSRD-S-018 APPLIES; not ANY(requirement_ref CSRD-S-022, CSRD-S-019, CSRD-S-023 APPLIES)
CSRD-S-014 v4  ANY of: requirement_ref CSRD-S-020 APPLIES; requirement_ref CSRD-S-021 APPLIES   (sources unchanged: SRC-001 19a(1), 29a(1))
```

- [ ] **Step 1: Write the failing tests** — the twelve rows end to end (the duty-level outcomes of §5 of the design with rows 1 and 8 corrected: in both, S-005 is DOES_NOT_APPLY because the entity's subsidiaries are not covered, so S-020 APPLIES beside S-021 APPLIES); S-014 v4 references exactly S-020 and S-021; S-003 is composed into nothing; the obligations and summary flags of rows 2 and 3. Re-specify `knowledge-scope-vs-timing`'s composition test: S-014 composes the two route duties, S-020 composes S-017 with S-004/S-005/S-006, S-021 composes S-018 with S-022/S-019/S-023, S-003 appears in none. Run: red.
- [ ] **Step 2: Author**; register `CSRD-S-014 CSRD-S-020 CSRD-S-021`.
- [ ] **Step 3: Run** the new file, `knowledge-scope-vs-timing`, `knowledge-article-1-4-exclusion` (its consolidated fixture gains `entity.is_financial_holding_undertaking = false`), `golden-profiles` (P-003 gains the same): green.
- [ ] **Teeth (defect: an individual exemption extinguishing the consolidated duty)** — mutant: add `requirement_ref CSRD-S-005 APPLIES` to S-021's negated ANY, re-register; row 8 must redden with `expected 'DOES_NOT_APPLY' to be 'APPLIES'` on S-021; restore by hash.

### Task 5: The suite-wide pins that count or enumerate requirements

**Files:** `audit-expected-provenance.ts`, `knowledge-integrity`, `min-status`, `pipeline-source-completeness`, `verification-features`, `pipeline-reader`, `corpus-src002-ingestion`, `corpus-src005-ingestion`, `loader-freshness`, `status-truth-boundary` (engine) and `status-truth-boundary-public` (frontend).

- [ ] **Step 1:** `POST_AUDIT_SOURCES` (S-017 `['SRC-002','SRC-001']`, S-018 the same, S-019 `['SRC-001']`, S-020 `['SRC-001','SRC-002']`, S-021 the same, S-022 `['SRC-002']`, S-023 `['SRC-001']`) and `EXPECTED_SOURCES = { ...AUDIT_EXPECTED_SOURCES, ...POST_AUDIT_SOURCES }`, with the comment stating the authority of each half; the audited table, universe and citation count untouched.
- [ ] **Step 2:** every `toHaveLength(16)` over the pack's requirements becomes 23, each with its comment; `MODEL_REACHABLE` 14 → 21 (both sources of every new requirement are served); `min-status`'s `CURRENT_VERSION` table (S-002 5; S-001, S-005, S-006, S-014 4; S-017–S-023 1; else 3), its version-3 pin and the historical-table coverage restricted to the sixteen pre-migration requirements by name; both `ALL_IDS` ledgers sign 23 (named by the same rule), `stats.requirements` 23 and `stats.ratified` 23 in the public boundary.
- [ ] **Step 3: Run** those files: green. No teeth beyond the red-first count failures, which name each pin.

### Task 6: The public checker's holding question

**Files:** `lib/checker.ts`, `app/api/check/route.ts`, `components/marketing/CheckFlow.tsx`; test: `check-response.test.ts`.

- [ ] **Step 1: Write the failing tests** — a parent above both thresholds with `holding: 'no'`: S-021 APPLIES and S-014 APPLIES; the same with `holding` absent: S-021 INDETERMINATE, `needs` naming `entity.is_financial_holding_undertaking` with the label "Whether the entity is a financial holding undertaking (answer needed)", `reasonCopy` "An earlier question is unresolved" (the duty's reason is `upstream_indeterminate`); `holding: 'yes'`: S-021 INDETERMINATE naming the independence and option facts; a standalone with `holding` absent is unaffected (S-021 DOES_NOT_APPLY). Run: red.
- [ ] **Step 2:** `CheckerAnswers.holding?: 'yes' | 'no' | 'unknown'` → `entity.is_financial_holding_undertaking` stated for yes/no, nothing otherwise; `FACT_COPY` for the eight facts; the zod enum; a step after the group-position step shown only when the entity is a parent, `Chips` over `YES_NO_UNSURE`, nothing preselected; header comment updated.
- [ ] **Step 3: Run** the frontend suite and `tsc --noEmit`: green except the public golden (Task 7).
- [ ] **Teeth (defect: a silent "not a holding" default)** — mutant: state the fact unconditionally as `holding === 'yes'`; the absent case must redden with `expected 'APPLIES' to be 'INDETERMINATE'`; restore by hash.

### Task 7: The two provenance goldens, as a reviewed change

- [ ] **Step 1: State the expected diff** before generating: seven new determinations appended in id order (engine: S-017 APPLIES, S-018 DNA, S-019 DNA, S-020 APPLIES, S-021 DNA, S-022 DNA, S-023 DNA for `e1`); S-005 and S-006 gain the coverage ANY in their traces; S-014's trace becomes `any of 2` over two `requirement_ref` children; counts in the public artefact +2 applies, +5 does-not-apply; everything else — results of the sixteen, reasons, needs, obligations, gaps, next questions, summary, headline — identical.
- [ ] **Step 2: Re-specify the transition layer** of both golden tests as a partition: the sixteen historical determinations keep their order and identity as a prefix, the seven post-audit ones follow; every field outside the determinations identical except, in the public artefact, `counts`, whose delta is exactly the seven; the source oracle over `EXPECTED_SOURCES`.
- [ ] **Step 3:** generate with the one-off scripts (copies of the E scripts, the fixture unchanged), `diff -u`, read every hunk against Step 1, install, diff again, run both golden files green; migration goldens' sha256 unchanged.

### Task 8: Checks

- [ ] Engine suite (expect 84 files), frontend suite, `tsc --noEmit` ×2, `grep -ri csrd backend/engine/src/` = 7, the six recordings' digests and `PROVENANCE.md` unchanged, both migration goldens unchanged, `measure-rows.mts <engine> after` → `logs/rows-after.log`, frozen evidence re-verified, `git status --porcelain` exactly the intended files.

### Task 9: Documents and hand-over

- [ ] The design spec: status, the user's resolutions, rows 1 and 8 corrected, the measured before/after table, the open source questions; the checkpoint; the session note with the full diff and the commit command.

### Review corrections (2026-10-20), after Task 9 and before the commit

- [ ] **R1 — the disclosures condition of S-005/S-006, with the Article 37 alternative stated.** Red first: true / false / unknown disclosures for an EU and a third-country reporting parent; the Article 37 alternative stated true → exempt, unanswered after the disclosures are stated false → unresolved naming it; `Q-044` offered to an ordinary subsidiary; `Q-048` only once the disclosures are stated false. Encode `ANY(disclosures = true, article37 = true)` in S-005, S-006 and S-019; the new fact `entity.article_37_exempt_publishing_consolidated_report`; replace row 2b, add rows 2c and 5b. Teeth: delete the ANY from S-005 → the false/false case reddens.
- [ ] **R2 — the reporting parent's country.** Red first: both mixed directions and the unknown country; S-007 still on the ultimate parent. The fact `parent.reporting_parent_country`, `Q-047`, `Q-016`'s gate; S-005/S-006/S-019 over it; P-004 states it. Teeth: revert S-005 to the ultimate parent's country → the EU-reporting-below-US-ultimate case reddens. The composition teeth retargeted to row 5b (S-021 negating S-004).
- [ ] Registry entries replaced in place (created in this uncommitted change); the engine golden rewritten once more; full suites and typechecks once; the documents.
