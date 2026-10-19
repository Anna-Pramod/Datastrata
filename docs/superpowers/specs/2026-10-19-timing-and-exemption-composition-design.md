# Timing and exemption composition — one concrete design for issues C and G

**Date:** 2026-10-19
**Status:** Design for decision. Nothing here is implemented; no requirement, fact type, questionnaire item, golden, prompt, corpus entry or engine module was changed for this document.
**Scope:** The CSRD pack's reporting-duty composition (`CSRD-S-014`), the Article 5(2) first-application rule of Directive (EU) 2022/2464 (issue C of the r5 author review) and the Article 29a(8)/(9) consolidated exemption (issue G). Issues A, B, D, E, F and H are dispositioned in `docs/superpowers/DISPOSITIONS-opus55-s002-r5-verdicts.md`; E's implementation is a separate change.
**Sources read:** `corpus/normalized/32013L0034.txt` (consolidated 2026-03-18): Article 1(3)–(4), Article 2(1) and (15), Article 3(4), (7) and (10), Article 19a(1) and (9)–(10), Article 29a(1), (4a), (7a), (8) and (9), Article 48i; `corpus/normalized/32022L2464.txt` (consolidated 2026-03-18, CELEX 02022L2464-20260318): Article 5(2), first to fifth subparagraphs. `32022L2464.txt` serves `SRC-002` and is **not** in `CSRD-S-002`'s closure; it is the author's source for the timing requirements proposed below, which cite `SRC-002` themselves. No closure is widened by this design.
**Standard:** `docs/superpowers/TEST-EVIDENCE-STANDARD.md` applies to every task a plan derives from this design; each must carry a teeth check naming the defect it detects.

## 0. The two defects, stated as behaviour

Today `CSRD-S-014` (version 3) derives a duty from `any(S-001 APPLIES, S-002 APPLIES) and not any(S-004, S-005, S-006 APPLIES)`, cited to `SRC-001` Articles 19a(1) and 29a(1). Two things are wrong with that composition, and neither is a defect in `CSRD-S-001` or `CSRD-S-002`:

- **C — the duty has no first-application rule.** Article 5(2) of Directive 2022/2464, as amended by Directive (EU) 2025/794 (M1) and Directive (EU) 2026/470 (M2), applies the Article 19a/29a measures for financial years starting 1 January 2024 to 31 December 2026 **only** to the point (a) population — large undertakings that are public-interest entities with more than 500 employees, and public-interest-entity parents of large groups with more than 500 employees on a consolidated basis — and from 1 January 2027 to the point (b) population, which is exactly the population `S-001`/`S-002` test. A non-first-wave group above the new thresholds assessed for FY2026 therefore has no duty yet; today's S-014 asserts one. The reverse error is quieter and larger: a first-wave public-interest entity with 700 employees and EUR 300 million turnover has a FY2025 and FY2026 duty unless its Member State exercised the fifth-subparagraph derogation; today's S-014 denies it, because S-001 and S-002 test the new thresholds and nothing in the composition tests the point (a) criteria. S-014's own caution points at "timing rules (R-005)", which exist in no pack file.
- **G — one exemption removes both duties.** `S-005` and `S-006` encode Article 19a(9), the individual exemption, over `parent.report_includes_entity`; S-014 negates the whole duty when either applies. Article 29a(8) exempts a parent that is itself a subsidiary from the consolidated obligations only where "such parent undertaking **and its subsidiary undertakings** are included" in the higher consolidated report, subject to the second-subparagraph disclosures. A fact stating that the intermediate parent is included says nothing about its subsidiaries, so today's S-014 removes a consolidated duty that Article 29a(8) leaves standing, and never asks for the Article 29a(8)(a) disclosures. Adding Article 29a(8)/(9) locators to S-005/S-006, as the author review first recommended, would describe the gap more accurately without closing it.

The design keeps the three questions apart — *does the size test pass* (scope), *do the measures apply to this undertaking for this financial year* (timing), *does an exemption remove the duty* (exemption) — and composes them per route.

## 1. Threshold scope stays in `CSRD-S-001` and `CSRD-S-002` (i)

Unchanged in meaning: `S-001` is Article 19a(1) as amended (EU incorporation, Accounting Directive form, net turnover above EUR 450 000 000, average employees above 1 000, and — once issue E lands — not excluded by Article 1(4)); `S-002` is Article 29a(1) on a consolidated basis. Neither binds a financial year, and `knowledge-scope-vs-timing.test.ts` keeps it so. They answer the point (b) question for the assessed financial year's balance-sheet date, and only that.

One consequence the composition must respect: **before FY2027 the size test that matters is not S-001/S-002.** The point (a) population is defined by Article 3(4) "large undertaking", public-interest-entity status under Article 2(1), and 500 employees — criteria that S-001 does not test and must not absorb. So the point (a) route cannot be written as "S-001 APPLIES and timing APPLIES"; it carries its own criteria (§2), and S-001/S-002 enter the composition only through the point (b) route.

## 2. Route-specific timing requirements over `SRC-002` Article 5(2) (ii)

Two new boolean requirements, `relationshipClass: timing_context`, `scopeType: legal_entity`, both citing `SRC-002` with provision locators on Article 5(2). Each says, for the assessed financial year, whether the Article 19a (individual) or Article 29a (consolidated) measures apply to this undertaking under one of the two routes. The financial-year operators read the assessment context (`fy_start_year_in`, `fy_starts_on_or_after` use `ctx.financialYear.start`, which Q-004 feeds); `entity.financial_year_start` already exists as the fact behind that context.

### 2.1 `CSRD-S-017` — Individual first application (Article 5(2), first subparagraph, points (a)(i) and (b)(i))

```text
ANY of:
  A. point (a)(i), financial years starting 1 January 2024 – 31 December 2026
     ALL of:
       fy_start_year_in [2024, 2025, 2026]
       eq  entity.is_public_interest_entity = true          (Article 2(1))
       eq  entity.is_large_undertaking = true               (Article 3(4); see §2.5)
       cmp entity.avg_employees gt 500
  B. point (b)(i), financial years starting on or after 1 January 2027
     ALL of:
       fy_starts_on_or_after 2027-01-01
       requirement_ref CSRD-S-001 expect APPLIES
```

Locators: `Article 5(2), first subparagraph, point (a)(i)`; `Article 5(2), first subparagraph, point (b)(i)`. Caution: "Which measures apply in a given year is decided by the governing Member State's transposition (CSRD-S-013); this is the Directive's own calendar."

### 2.2 `CSRD-S-018` — Consolidated first application (points (a)(ii) and (b)(ii))

```text
ANY of:
  A. point (a)(ii)
     ALL of:
       fy_start_year_in [2024, 2025, 2026]
       eq  entity.is_parent_undertaking = true
       eq  entity.is_public_interest_entity = true
       eq  group.is_large_group = true                      (Article 3(7); see §2.5)
       cmp group.avg_employees gt 500
  B. point (b)(ii)
     ALL of:
       fy_starts_on_or_after 2027-01-01
       requirement_ref CSRD-S-002 expect APPLIES
```

Three-valued behaviour is what the product laws require: in FY2026 a group above the new thresholds that is not a public-interest entity reads `DOES_NOT_APPLY` on branch A (fact false) and `DOES_NOT_APPLY` on branch B (date false), so `S-018` is definitively `DOES_NOT_APPLY` — no duty yet, and no silent unknown. An unanswered `is_public_interest_entity` leaves branch A `INDETERMINATE` and therefore `S-018` unresolved for FY2024–26, which is right.

### 2.3 The fifth-subparagraph derogation, generalised to both routes

Article 5(2), fifth subparagraph (M2): by way of derogation from point (a) of the first and third subparagraphs, Member States may exempt undertakings or issuers that do not exceed EUR 450 000 000 net turnover **or** 1 000 employees, "on a consolidated basis where applicable", for financial years starting 1 January 2025 to 31 December 2026. It relieves the point (a) population only — the point (b) population has no duty before FY2027 anyway — and only where the Member State exercised the option.

- `CSRD-S-004` (version 3 today) is the individual form: EU incorporation, `fy_start_year_in [2025, 2026]`, below either individual threshold, `entity.member_state_transition_option = true`. It keeps its facts and meaning; its place in the composition moves to the individual route (§4).
- `CSRD-S-004c` (new; the id is a placeholder for the next free number) is the consolidated twin: EU incorporation, `fy_start_year_in [2025, 2026]`, `any(not group.consolidated_net_turnover_eur gt 450 000 000, not group.avg_employees gt 1 000)`, `entity.member_state_transition_option = true`. Locator: `Article 5(2), fifth subparagraph`. Caution as S-004's: a national option, resolved through the country pack.

"On a consolidated basis where applicable" is read as: the consolidated figures govern a parent's consolidated duty, the individual figures its individual duty. A parent that is relieved on one basis and not the other keeps the duty that is not relieved; the two routes stay separate.

### 2.4 The issuer provisions of the third subparagraph — noted, not encoded

Article 5(2), third subparagraph, applies the Article 2 measures (the amendments to Directive 2004/109/EC) to issuers on the same (a)/(b) calendar, with the point (a) population defined without the public-interest-entity test (issuers on a regulated market are public-interest entities under Article 2(1)(a) of Directive 2013/34/EU in any case). The pack encodes no Transparency Directive obligation and cites no source for Directive 2004/109/EC; an issuer's Accounting Directive duty is already reached through `S-017`/`S-018` because listing makes it a public-interest entity. Noted in `S-017`'s/`S-018`'s caution; no requirement.

### 2.5 The facts each route needs

| Fact | Status | Source of the value | Note |
|---|---|---|---|
| `entity.financial_year_start` | exists (Q-004) | reporting period | feeds `ctx.financialYear`; the operators read the context, not the fact |
| `entity.avg_employees`, `group.avg_employees` | exist (Q-008, Q-010) | employee notes | the 500-employee tests reuse them; Q-008 is gated on S-001 being unresolved today and would need the timing requirement added to its gate |
| `entity.is_public_interest_entity` | **new**, boolean, `missingReason: legal_ambiguity` | Article 2(1): regulated-market securities, credit institution, insurance undertaking, Member-State designation | `legal_form` ∈ {listed_company, credit_institution, insurance_undertaking} is sufficient but not necessary (point (d) designation is national law); so a fact, pre-filled from the legal form where it implies the status, asked otherwise; the Member-State designations belong in country packs |
| `entity.is_large_undertaking` | **new** — or a derived requirement | Article 3(4): exceeds two of three of balance sheet total EUR 25 000 000, net turnover EUR 50 000 000, 250 employees | expressible in the closed language as `any(all(a,b), all(a,c), all(b,c))` over three `cmp` atoms if `entity.balance_sheet_total_eur` is added (the fact the 2026-08-14 design already noted as absent); Article 3(10)'s two-consecutive-years rule for changing category is a residual either way; a derived requirement `CSRD-S-0xx Large undertaking (Article 3(4))` is preferred over an asserted boolean because it is checkable |
| `group.is_large_group` | **new** — or derived | Article 3(7): the same two-of-three on a consolidated basis | needs `group.consolidated_balance_sheet_total_eur` (new) |
| `entity.member_state_transition_option` | exists (Q-013) | national implementing measure, via the country pack | unchanged; `S-013` keeps every final answer unresolved until the pack is ratified |
| `entity.is_parent_undertaking` | exists (Q-005) | consolidation statement | unchanged |

### 2.6 What becomes of `CSRD-S-003`'s `reported_csrd_fy2024`

Under this design the point (a) population is decided for the assessed year by its own criteria, so `entity.reported_csrd_fy2024` stops being a proxy for first-wave status. Three options, for decision (§6): retire `S-003` and Q-011; keep `S-003` as `timing_context` history whose only consumers are the review sheet and the "never tell a former reporter to stop" caution (it is composed into nothing today, which `knowledge-scope-vs-timing.test.ts` pins); or turn the fact into a consistency check — a former FY2024 reporter whose point (a) criteria now fail routes to analyst review rather than to a silent "no duty". The recommendation is the third, as a questionnaire-level check rather than a requirement, with `S-003` kept until a country pack needs it.

## 3. A consolidated exemption requirement for Article 29a(8)/(9) (iii)

### 3.1 Why `parent.report_includes_entity` cannot establish Article 29a(8) coverage

The fact's label is "entity included in the parent's consolidated sustainability report". It is a statement about the intermediate parent P alone. Article 29a(8), first subparagraph, exempts P "if such parent undertaking and its subsidiary undertakings are included" in the higher report, and the second sentence says the same for a third-country parent's consolidated sustainability reporting. A higher parent can include P while leaving one or more of P's subsidiaries outside its consolidation — Article 23(9) and (10) permit exclusion where an undertaking is immaterial, subject to severe long-term restrictions, disproportionately costly to include, or held exclusively for resale — and a third-country parent's sustainability perimeter need not coincide with its financial one at all. In every such case `parent.report_includes_entity = true` is true and Article 29a(8) is not met. No reading of the single fact closes that gap; only a representation of the coverage of P's subsidiaries does. (The same words — "such undertaking and its subsidiary undertakings" — appear in Article 19a(9), so `S-005`/`S-006` under-test the individual exemption for a subsidiary that is itself a parent; §6 lists that as a decision rather than widening this design.)

### 3.2 Representing coverage

Two candidates; the first is recommended now, the second is the evidence-backed form once the profile model carries P's subsidiaries as scope objects.

**(B) A declared full-coverage fact plus the Article 29a(8)(a) disclosures as facts.**

| Fact | Type | Meaning |
|---|---|---|
| `parent.report_includes_entity_and_subsidiaries` | boolean, `legal_entity`, `missingReason: legal_ambiguity` | the higher report includes this parent **and every one of its subsidiary undertakings** (Article 29a(8), first subparagraph) |
| `entity.exemption_disclosures_in_management_report` | boolean, `legal_entity` | P's management report carries the name and registered office of the reporting parent, the weblinks to its consolidated (sustainability) report and assurance opinion, and the statement that P is exempted (Article 29a(8), second subparagraph, points (a)(i)–(iii)) |
| `parent.report_standard`, `parent.report_public_url`, `parent.assurance_opinion_available`, `parent.taxonomy_information_included`, `entity.national_publication_conditions_met`, `group.ultimate_parent_country` | exist | reused as in S-005/S-006 |

The declared fact is an attestation, which is what the customer or analyst can actually give today; its label says "every one of its subsidiary undertakings", and an unanswered or unknown value leaves the exemption unresolved, so the consolidated duty stands until coverage is established — the Kleene direction the product laws require.

**(A) A perimeter comparison.** `group.reporting_perimeter_entities` (an `entity_list` collected in Q-006) is the group's own list of EU entities, not the higher report's perimeter, and the closed condition language has no list-inclusion operator. What it does have is `quantifier_any` over descendant scope objects: with P's subsidiaries modelled as `legal_entity` objects under P, each carrying `parent.report_includes_entity`, coverage is `all(eq parent.report_includes_entity true, not(quantifier_any legal_entity where not(eq parent.report_includes_entity true)))` — "P is included and no subsidiary is uncovered", with a missing value on any subsidiary propagating to `INDETERMINATE`. Its hazard is the empty case: a parent with no subsidiary objects in the profile would read "no subsidiary is uncovered" as true, so the form needs a guard (`count_cmp group.reporting_perimeter_entities gte 1` and a declared perimeter-completeness fact) before it can replace (B). Carried as evidence still needed (§6).

### 3.3 `CSRD-S-019` — Consolidated exemption via a higher parent's qualifying report (Article 29a(8) and (9))

`relationshipClass: direct_legal_exemption`, `scopeType: legal_entity`, cited to `SRC-001` with locators `Article 29a(8)` and `Article 29a(9)`.

```text
ALL of:
  eq  entity.is_parent_undertaking = true
  eq  entity.is_subsidiary = true
  eq  parent.report_includes_entity_and_subsidiaries = true
  ANY of:                                                    (which kind of higher report)
    ALL of:                                                  (EU parent: consolidated management report under Articles 29 and 29a)
      in_catalogue group.ultimate_parent_country eu_member_states
      eq  parent.report_standard = ESRS
    ALL of:                                                  (third-country parent: Article 29a(8), first subparagraph, second sentence, and points (b)–(c))
      not in_catalogue group.ultimate_parent_country eu_member_states
      in_set parent.report_standard [ESRS, EQUIVALENT]
      eq  parent.assurance_opinion_available = true
      eq  parent.taxonomy_information_included = true
  exists parent.report_public_url                             (points (a)(ii) and (b): published, with weblinks)
  eq  entity.exemption_disclosures_in_management_report = true (points (a)(i)–(iii))
  eq  entity.national_publication_conditions_met = true       (publication under Article 30 and the governing Member State's law, including its language option)
```

- **Public-interest entities (Article 29a(9), M8).** The exemption "shall also apply to public-interest entities", so the requirement carries no public-interest-entity carve-out; a pre-M8 encoding would have needed one, and the absence is deliberate and cited.
- **Third-country parents.** "Equivalent" standards rest on an implementing act under Article 23(4) of Directive 2004/109/EC; `S-006`'s caution about `EQUIVALENT` needing a formal equivalence basis applies verbatim. Assurance and the Article 8 Taxonomy disclosures are conditions (b) and (c) of the second subparagraph, reused from `S-006`.
- **Special cases, not encoded.** Credit institutions permanently affiliated to a central body (Article 29a(8), fifth subparagraph) and insurance undertakings under group supervision (sixth subparagraph) are treated as subsidiaries of the central body or group parent; Article 48i(4) treats transitional Union-subsidiary consolidated reporting as qualifying until 6 January 2030. These are country-pack and analyst matters, named in the caution.
- **Residual.** `group.ultimate_parent_country` is a proxy for the *reporting* parent's country; where an intermediate parent above P reports, a `parent.reporting_parent_country` fact would be more exact. Noted, not added.

Obligations: the existing exemption-maintenance obligation (O-011) instantiates on `S-019 APPLIES`; a new obligation template for the Article 29a(8)(a) disclosures is the natural companion and is outside this design's scope.

## 4. The composition (iv)

`CSRD-S-014` is split into two route requirements and becomes their disjunction, so every consumer of "a reporting duty exists" — obligations, questionnaire gates, `S-015`, `S-016`, the public checker's base set — keeps its reference while the routes become separately visible and separately exempt.

```text
CSRD-S-020  Individual reporting duty (Article 19a)                 direct_legal, critical
  ALL of:
    requirement_ref CSRD-S-017 expect APPLIES                        (the measures apply this year, by route (a)(i) or (b)(i))
    NOT: ANY of:
      requirement_ref CSRD-S-004 expect APPLIES                      (FY2025–26 national derogation, individual basis)
      requirement_ref CSRD-S-005 expect APPLIES                      (Article 19a(9), EU parent)
      requirement_ref CSRD-S-006 expect APPLIES                      (Article 19a(9), third-country parent)

CSRD-S-021  Consolidated reporting duty (Article 29a)               direct_legal, critical
  ALL of:
    requirement_ref CSRD-S-018 expect APPLIES                        (route (a)(ii) or (b)(ii))
    NOT: ANY of:
      requirement_ref CSRD-S-004c expect APPLIES                     (FY2025–26 national derogation, consolidated basis)
      requirement_ref CSRD-S-019 expect APPLIES                      (Article 29a(8)/(9))
      [ requirement_ref CSRD-S-022 expect APPLIES ]                  (Article 29a(7a) financial-holding option — issue F, see below)

CSRD-S-014  Reporting duty (post-exemption), version 4
  ANY of:
    requirement_ref CSRD-S-020 expect APPLIES
    requirement_ref CSRD-S-021 expect APPLIES
```

- **Why the threshold tests are not conjuncts of S-020/S-021.** `S-001`/`S-002` enter through `S-017`/`S-018`'s point (b) branch. Writing "S-001 APPLIES and S-017 APPLIES" would deny every FY2024–26 point (a) duty for undertakings below the new thresholds (§1), which is the second error in §0.
- **The Article 29a(7a) option (F) is an explicit, unresolved branch.** Article 29a(7a) (M8) requires Member States to let parent undertakings that are financial holding undertakings (Article 2(15)) whose subsidiaries' business models and operations are independent "choose not to include" the paragraph 1 information. The branch is written in brackets because encoding it needs four facts nobody collects (`entity.is_financial_holding_undertaking`, `group.subsidiaries_business_models_independent`, `entity.art_29a_7a_option_exercised`, and the Member State's implementation via `S-013`), and the first of them is a gate that must be asked of every parent to keep non-holdings definitive — the same shape as issue E's fact, with the same effect on fixtures and goldens. The decision (§6) is whether to encode it now with that question, or leave the bracketed line in S-021's caution until a holding company is actually assessed.
- **Behind `S-013`, as today.** The national-law gate is `INDETERMINATE` for every Member State until a country pack is ratified. Adding `requirement_ref CSRD-S-013 expect APPLIES` as a conjunct of S-020/S-021 would make every duty unresolved and blank the product; the design keeps the gate where it is today — the summary's `nationalLawResolved` and `national_review_required` flag, S-013's caution, and the headline's "NOT a final legal conclusion" — and S-020/S-021 remain EU-level screens that say so. If the user prefers the in-condition gate, it is one conjunct per route and a golden change.
- **Excluded undertakings (E).** With E landed, an Article 1(4) exclusion makes `S-001`/`S-002` `DOES_NOT_APPLY`, so the point (b) branches fail definitively. The point (a) branches do not reference S-001/S-002, so the exclusion conjunct must also be added to `S-017`/`S-018` branch A (Article 1(4) excludes the entity from Articles 19a and 29a in every year). Recorded here so the timing requirements do not reintroduce the defect E removes.

## 5. Counterexamples, with expected outcomes (v)

Facts not listed are as the profile needs them to satisfy every other branch; "today" is `CSRD-S-014` version 3 at `1a87f7e`; "design" is §4. FY2027 unless stated. P is an EU intermediate parent that is a subsidiary of U; S2 is P's subsidiary.

| # | Case | Today (S-014 v3) | Under the design | Why |
|---|---|---|---|---|
| 1 | P (group above both thresholds, P individually above both) included in U's ESRS report; S2 not included; P's report carries the 19a(9) disclosures | `S-005` APPLIES → S-014 **DOES_NOT_APPLY**: both duties removed | S-020 individual duty **DOES_NOT_APPLY** (S-005 APPLIES, on today's single-entity fact); S-021 consolidated duty **APPLIES**, because `parent.report_includes_entity_and_subsidiaries` is false so S-019 DOES_NOT_APPLY | Article 29a(8) requires P *and its subsidiaries* covered. Today's S-014 wrongly removes the consolidated duty. (Article 19a(9) carries the same words; whether S-005 should also demand S2's coverage is a §6 decision.) |
| 2 | As 1, but U's report covers P's whole sub-group and P's management report carries the 29a(8)(a)(i)–(iii) disclosures | S-014 DOES_NOT_APPLY (by S-005, with no coverage or disclosure test) | S-019 APPLIES → S-021 **DOES_NOT_APPLY**; S-020 DOES_NOT_APPLY; O-011 and the 29a(8)(a) disclosure obligations instantiate | The consolidated duty is removed on the law's own conditions, and the price of the exemption — the disclosures — is recorded as an obligation |
| 3 | FY2026; group above both new thresholds; not a public-interest entity; never a FY2024 reporter | S-002 APPLIES, no exemption → S-014 **APPLIES** (a duty asserted) | S-018 branch A fails (not a PIE), branch B fails (FY2026) → S-018 DOES_NOT_APPLY → S-021 **DOES_NOT_APPLY**; no duty yet, first duty FY2027 | Article 5(2)(b)(ii): the new-threshold population reports from financial years starting on or after 1 January 2027 |
| 4 | FY2026; first-wave PIE parent of a large group, 800 employees consolidated, EUR 300 million consolidated turnover; the Member State exercised the FY2025–26 derogation | S-002 DOES_NOT_APPLY (below the new thresholds) → S-014 DOES_NOT_APPLY: right answer, wrong reason | S-018 branch A APPLIES (window, PIE, large group, >500); S-004c APPLIES (FY2026, below either threshold, option true) → S-021 **DOES_NOT_APPLY** | Article 5(2), fifth subparagraph; the relief is national and is recorded as such |
| 5 | As 4, option **not** exercised | S-014 **DOES_NOT_APPLY** (no duty found) | S-018 branch A APPLIES; S-004c DOES_NOT_APPLY (option false) → S-021 **APPLIES** | Article 5(2)(a)(ii) keeps the first-wave population in for FY2024–26; today's composition denies a real duty |
| 6 | FY2027; group above both thresholds, any PIE status | S-014 APPLIES | S-018 branch B: FY2027 and S-002 APPLIES → S-021 **APPLIES** | Article 5(2)(b)(ii) |
| 7 | A public-interest-entity intermediate parent fully covered by U's qualifying report, disclosures made | S-014 DOES_NOT_APPLY (by S-005) | S-019 APPLIES with no PIE carve-out → S-021 **DOES_NOT_APPLY** | Article 29a(9) (M8) extends the exemption to public-interest entities |
| 8 | EU subsidiary E, individually above both thresholds, covered by U's qualifying report (S-005 APPLIES); E is itself the parent of a sub-group above the consolidated thresholds that U's report does **not** cover | S-014 **DOES_NOT_APPLY**: the consolidated duty vanishes with the individual exemption | S-020 DOES_NOT_APPLY (individual exemption); S-021 **APPLIES** (S-018 B via S-002; S-019 DOES_NOT_APPLY on coverage) | An individual exemption must not extinguish a consolidated duty |
| 9 | FY2025; standalone first-wave PIE, large undertaking, 700 employees, EUR 200 million turnover; option not exercised | S-001 DOES_NOT_APPLY → S-014 **DOES_NOT_APPLY** | S-017 branch A APPLIES; S-004 DOES_NOT_APPLY → S-020 **APPLIES** | Article 5(2)(a)(i): the individual first-wave duty today's composition cannot find |
| 10 | FY2027; the same first-wave PIE, still below the new thresholds | S-014 DOES_NOT_APPLY | S-017 branch A fails (window), branch B fails (S-001 DOES_NOT_APPLY) → S-020 **DOES_NOT_APPLY** | The first-wave population drops out of Article 19a from FY2027 unless it meets the new thresholds |
| 11 | Any case with `entity.is_public_interest_entity` or the coverage fact unanswered, FY2024–26 | n/a | the affected branch is `INDETERMINATE`; the duty is unresolved, never a silent "no duty" | Product law 1 |
| 12 | Any case where the entity is excluded by Article 1(4) (issue E) | n/a (E not yet landed) | S-001/S-002 DOES_NOT_APPLY; with the exclusion conjunct also in S-017/S-018 branch A, every route is definitively out | Article 1(4) excludes the entity from Articles 19a and 29a in every year |

Rows 1, 3, 5, 8 and 9 are the cases today's composition gets wrong; rows 2, 4, 6, 7 and 10 are the cases it gets right for the wrong reason or by coincidence; rows 11 and 12 are the unresolved and excluded controls.

## 6. Evidence still needed, and the remaining decisions (vi)

**Evidence still needed**

- **National transposition facts through `S-013`:** which Member States exercised the FY2025–26 derogation, their Article 2(1)(d) public-interest-entity designations, the Article 1(3) second-subparagraph option for Directive 2013/36/EU Article 2(5) institutions, and the language option of Article 29a(8), third subparagraph. Until a country pack is ratified every final answer stays "requires national review", as today.
- **Whether `group.reporting_perimeter_entities` can carry the coverage set.** It is the group's own EU-entity list, not the higher report's perimeter; the closed language has no list-inclusion operator; the `quantifier_any` form in §3.2 needs subsidiaries as scope objects and an empty-set guard. Until then the declared coverage fact (B) is the representation.
- **Golden impact of any `S-014` change.** `S-014` is recorded in `test/golden/provenance-engine-golden.json` (e1: APPLIES, with its caution and a two-child trace), in `frontend/web/test/golden/provenance-public-golden.json`, and asserted by `golden-profiles.test.ts` P-001, P-003 and P-004. A version bump that changes its condition changes its trace, so the provenance goldens change; the public golden's `counts` and `headline` change wherever a fixture's duty moves; new mandatory facts (public-interest-entity status, coverage) turn fixtures that lack them `INDETERMINATE`. This is the same decision issue E raised on 2026-10-19 (the goldens are read, never regenerated; an update is an explicit reviewed change), and it is a precondition for implementing this design, not a detail of it.
- **The size-category facts:** `entity.balance_sheet_total_eur` and `group.consolidated_balance_sheet_total_eur`, needed to derive Article 3(4)/(7) status; Article 3(10)'s two-consecutive-years rule.

**Remaining decisions**

1. **F — the Article 29a(7a) option.** Encode `CSRD-S-022` now (four new facts, a mandatory "is the parent a financial holding undertaking?" question with the fixture and golden consequences of §6) or keep the bracketed branch in `S-021`'s caution until a holding is assessed.
2. **`S-003`'s future.** Retire; keep as context; or convert `reported_csrd_fy2024` into a consistency check (recommended, §2.6).
3. **One timing requirement with a route parameter, or two.** The closed language has no parameters, and `requirement_ref` expects a truth value, not a selected case, so a single `selection`-kind timing requirement could not be composed into S-020/S-021. Two boolean requirements (`S-017`, `S-018`) are recommended; four (one per Article 5(2) point) is the alternative if the (a) and (b) branches should be separately citable.
4. **Whether `S-005`/`S-006` should demand sub-group coverage too.** Article 19a(9) uses the same "and its subsidiary undertakings" wording; tightening them is textually right and changes P-004's fixture.
5. **Where the national-law gate sits:** summary level (as today, recommended) or as a conjunct of S-020/S-021.
6. **Whether the Article 1(4) exclusion is restated in `S-017`/`S-018` branch A** (recommended, §4) or the point (a) population is first filtered through a shared "within Article 1" requirement.

## 7. What a plan derived from this design must carry

One task per requirement, red first; a teeth check per task naming the defect (for the timing requirements: FY2026 non-PIE above thresholds must not read APPLIES; for S-019: `parent.report_includes_entity = true` with the coverage fact false must not exempt; for S-020/S-021: an individual exemption with a standing consolidated duty must leave S-021 APPLIES); the registry entries appended with the engine's `requirementSha256` after the control; the dry assessment of the goldens before any pack edit, with a stop if a golden would change; and the questionnaire gates for Q-008/Q-010 extended to the timing requirements. Nothing here authorises a capture package, a live run, a promotion or a signature.
