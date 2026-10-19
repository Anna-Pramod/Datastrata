# Dispositions — the twelve adjudicated r5 verdicts on `CSRD-S-002` (version 4)

**Date:** 2026-10-19. **Record:** the fifth genuine S-002 capture, execution `subscription-executions/csrd/CSRD-S-002/20261019T141716Z-b588bc` (manifest `cd70ae8ad33f6b770290c25429dc2f6bbe718e6b0e825455f9edda18ee6e69b0`, 16 entries; trust: execution completed, schema valid, evidence passed on 39 of 39 sets, substantive unassessed), run against candidate HEAD `52aadb3`; the checkpoint is committed as `1a87f7e` (`CHECKPOINT-opus55-s002-capture-r5.md`). **Basis:** the author review of 2026-10-19 (`2026-10-19T1531Z-r5-author-review-twelve-verdicts.md` in the shared side-session notes, sha256 `e88a039ff5b1467220d7ae08bca222cc02c4c883a2f89f45d771b73b323527b8`; its summary table counts the catalogue-dependent verdicts as four, which this record follows), the user's decision on it of the same day, and the pack files at `1a87f7e`. **What this record is not:** a promotion or signature of the r5 dossier, a change to any requirement, a judgment on the roles' quotes beyond the evidence check already recorded.

The twelve verdicts (CONFIRMED 2, MISMATCH 7, OPEN_QUESTION 3) group into eight issues, A to H. The disposition classes are: *supported catalogue disposition* (the objection is answered by pack data the roles could not see, and the classification assumption behind that data is stated); *dispositioned duplicate* (a point already decided); *deferred* (a real point whose fix needs a versioned plan); *implemented* (a supported encoding defect, corrected red first); *unresolved option* (a real branch the pack does not yet model, kept explicit); *carried to design* (a pack-level gap with a design on file); *accepted, no change*.

## The twelve verdicts

| Challenge id (full) | Lens | Verdict | Issue | Disposition |
|---|---|---|---|---|
| `P0-MC-1-annex-ii-qualifier` | missing_criterion | OPEN_QUESTION | B | supported catalogue disposition (assumption B1 below); no change |
| `P0-MC-2-temporal-applicability` | missing_criterion | MISMATCH | C | dispositioned duplicate of the 2026-10-18 scope-versus-timing decision; pack-level gap carried to the design |
| `P1-C1-legal-form-conjoined-not-alternative` | wrong_conjunction | MISMATCH | A | supported catalogue disposition (assumptions A1–A3); no change |
| `P3-C1-turnover-no-balance-sheet-anchor` | wrong_measurement_period | OPEN_QUESTION | D | deferred: a versioned label plan is needed |
| `P3-C2-no-financial-year-applicability` | wrong_measurement_period | MISMATCH | C | dispositioned duplicate; carried to the design |
| `P4-C1-legal-form-gate-excludes-art1-3-financial-undertakings` | wrong_scope_type_or_addressee | MISMATCH | A | supported catalogue disposition (assumptions A1–A3); no change |
| `P4-C2-annex-ii-forms-conditional` | wrong_scope_type_or_addressee | OPEN_QUESTION | B | supported catalogue disposition (assumption B1); no change |
| `P5-C1-m8-version-applied-without-temporal-standing` | superseded_or_miscited_provision | MISMATCH | C | dispositioned duplicate; carried to the design |
| `P6-C1-efsf-and-financial-products-exclusion` | missing_exclusion | MISMATCH | E | implemented: the Article 1(4) exclusion branch (S-002 v5, S-001 v4), red first; landing held at the golden stop (see E) |
| `P6-C2-financial-holding-derogation` | missing_exclusion | CONFIRMED | F | unresolved option, kept explicit in the duty composition design |
| `P6-C3-intermediate-parent-exemption` | missing_exclusion | MISMATCH | G | carried to the design; not closed by citations |
| `P6-C4-group-composition-derogation` | missing_exclusion | CONFIRMED | H | accepted; no scope change |

Every verdict is accounted for once: four under A/B, three under C, and one each under D, E, F, G and H.

## A — Article 1(3) insurers and credit institutions against the legal-form gate (`P1-C1`, `P4-C1`)

**Objection.** All[1], `entity.legal_form in_catalogue accounting_directive_forms`, is a mandatory conjunct; Article 1(3) applies Articles 19a and 29a to insurance undertakings and credit institutions "regardless of their legal form", so the gate wrongly excludes them, and no catalogue of listed forms can express "regardless of legal form".

**Disposition: supported catalogue disposition; no change to the condition.** The verdicts' premise — that the catalogue holds Annex I/II forms only — is false in fact, and the roles could not know it: `catalogues.json` is not in the closure and the rendered condition names the catalogue without its entries. The classification assumptions on which the disposition rests, stated so they can be challenged in their own right:

- **A1.** `entity.legal_form` records **regulated status**, not corporate form, for the two Article 1(3) classes: its enum carries `credit_institution` and `insurance_undertaking` as values beside the corporate forms, and `accounting_directive_forms` lists both as `true` (note: "Annex I/II legal forms + Art. 1 extensions"). An insurer or bank is therefore recorded by what it is regulated as and passes all[1] whatever its corporate form; the questionnaire (Q-003) collects the value from legal information.
- **A2.** The thresholds all[3] and all[4] (consolidated net turnover above EUR 450 000 000, consolidated employees above 1 000) are the ones Article 1(3), first subparagraph, requires of those undertakings ("provided they exceed" the same thresholds), so the gate's admission of them leads to the right test, not a wider one.
- **A3.** An unmapped form is recorded as `other`, which the catalogue does not list: the evaluator returns `INDETERMINATE` with `catalogue_unknown` and the catalogue note routes it to analyst review — never silently out of scope.
- **National law.** The Article 1(3), second subparagraph, option for Member States to exclude the Directive 2013/36/EU Article 2(5) institutions is national law and belongs to the country packs behind `CSRD-S-013`, where every other national option sits; a country pack that exercises it will carry the exclusion for that Member State.
- **Residual, noted and not changed.** The sector-specific net-turnover definitions of Article 2(5) for insurers and credit institutions (Directive 91/674/EEC Articles 35 and 66(2); Directive 86/635/EEC) are stated nowhere in the pack; `group.consolidated_net_turnover_eur`'s label does not say which definition applies. A label note or a sector fact is a candidate for the versioned label plan under D.
- **Why these were raised blind.** The roles see the catalogue's name, never its contents. Showing membership to the roles is an engine question (a closure-renderer grammar change that moves every identity) and is not decided here.

## B — The Annex II member-liability proviso (`P0-MC-1`, `P4-C2`)

**Objection.** Article 1(1)(b) brings Annex II types (partnerships, limited partnerships, unlimited companies) within the Directive only where every member with otherwise unlimited liability in fact has limited liability through Annex I-type or comparable third-country members; the rendered legal-form test carries no such qualifier, so the encoding either over- or under-reaches, and the catalogue's contents being invisible the point was left open.

**Disposition: supported catalogue disposition; resolved against `catalogues.json`; no change.**

- **B1.** The proviso is **folded into the enum pair** the questionnaire collects: `partnership_all_members_limited` is listed `true` and `partnership_natural_persons_unlimited` is listed `false`. The direction of the test is right in both cases the roles posed; the judgment the proviso calls for (indirect members, comparable third-country forms) is absorbed into the choice of value at intake, and `other` routes to analyst review (A3).
- **Residual.** The pair is coarse, as the catalogue note says; Member-State form mappings belong in the country packs.

## C — Which financial years the thresholds govern (`P0-MC-2`, `P3-C2`, `P5-C1`)

**Objection, stated three ways.** The condition carries no financial-year criterion, so the amended (M8) thresholds are applied to periods they do not alone govern; wrong before financial years starting 1 January 2027; the point (a) criteria for FY2024–26 are outside the closure.

**Disposition: dispositioned duplicates; no change to S-002; the pack-level gap is carried to the design.** The point was decided on 2026-10-18 (`HANDOFF-2026-10-18-s002-scope-vs-timing.md`): S-002 is the consolidated size test only, its text says so (version 4), and the financial-year question lives in `S-003`/`S-004`/`S-013` and the composition `S-014`; `knowledge-scope-vs-timing.test.ts` pins that division. Against S-002 alone the three verdicts are the known objection. What is real is the pack-level gap the author review named: `S-014` derives a duty from the thresholds and three exemptions with no first-application rule, so for FY2025–26 a non-first-wave group above the thresholds reads as having a duty and a first-wave public-interest entity below them reads as having none. That gap, and S-003's `reported_csrd_fy2024` shortcut, are the subject of `docs/superpowers/specs/2026-10-19-timing-and-exemption-composition-design.md` (§0, §2, §5 rows 3, 5, 9, 10). No closure is widened: `32022L2464.txt` serves `SRC-002`, and the timing requirements the design proposes cite it themselves.

## D — The turnover criterion's measurement point and period (`P3-C1`)

**Objection.** "consolidated net turnover exceeds 450 000 000 EUR" states no reference date or period; Article 29a(1) measures the group on its balance-sheet date for the financial year.

**Disposition: deferred.** A legitimate reading of the label, already recognised on 2026-10-18. The fact label is shared with `S-001` and is rendered into the recorded S-001 transcripts and into every S-002 record's rendered condition; changing it moves `renderedConditionSha256` and with it every run identity, so a label change needs a **versioned plan** (a renderer-grammar or label version, with the recordings retired rather than broken), not an edit. The questionnaire already asks which financial year is assessed (Q-004) and collects the consolidated figure for it (Q-009, reviewed each financial year). Candidate wording for that plan: "consolidated net turnover for the financial year ending on the balance sheet date". The Article 2(5) sector-definition residual under A joins the same plan.

## E — The Article 1(4) exclusion (`P6-C1`)

**Objection.** Article 1(4), as replaced by Directive (EU) 2026/470, says Articles 19a, 29a and 29d do not apply to the European Financial Stability Facility or to the financial products listed in points (b) and (f) of Article 2(12) of Regulation (EU) 2019/2088; the condition has no negated branch, so an excluded entity meeting all[0]–all[4] reads as in scope.

**Disposition: supported encoding defect; implemented red first.** A boolean fact `entity.excluded_by_article_1_4` (missing reason `legal_ambiguity`, so an absent or unknown answer leaves the test unresolved and never reads as "not excluded"), a questionnaire item shown once the entity is EU-incorporated with a known legal form, and `not(eq entity.excluded_by_article_1_4 true)` as the last conjunct of both size tests' ALL, with an `Article 1(4)` locator on `SRC-001` beside the threshold provision: `CSRD-S-002` version 4 → 5, `CSRD-S-001` version 3 → 4, the registry entries appended with the engine's own `requirementSha256` after the control reproduced the recorded version 4 and version 3 digests. The change, its red-first test file (`knowledge-article-1-4-exclusion.test.ts`), the three teeth checks and the dry assessment are recorded in the session note of 2026-10-19 (`2026-10-19T1550Z-e-exclusion-and-cg-design.md` in the shared side-session notes). **Landing is held at the dry-assessment stop the user set:** with the branch in place the provenance engine golden, the frontend provenance public golden, three golden profiles (P-001, P-003, P-004) and the committed S-001 replay recording's binding all change, because every existing fixture lacks the new fact and S-001's verification input moved. None of those is edited here; the user decides how the goldens and the recording are updated, and the reviewable patch is ready to apply.

## F — The Article 29a(7a) financial-holding option (`P6-C2`)

**Objection, confirmed by the adjudicator.** Article 29a(7a) (M8) requires Member States to let parents that are financial holding undertakings whose subsidiaries' business models and operations are independent choose not to include the paragraph 1 information; an elective opt-out leaves the parent within paragraph 1 until exercised, so S-002 is right to say nothing.

**Disposition: agree; no S-002 change; an explicit unresolved option in the duty composition.** The design (§4) carries it as a bracketed branch of the consolidated duty, `CSRD-S-022`, with the four facts it would need (financial-holding status under Article 2(15), independence of the subsidiaries' business models and operations, the option exercised, the Member State's implementation through `S-013`) and the cost stated: the gating fact must be asked of every parent for non-holdings to stay definitive, the same fixture-and-golden consequence as E. Decision open (design §6, item 1).

## G — The Article 29a(8)/(9) intermediate-parent exemption (`P6-C3`)

**Objection.** A mandatory exemption with no branch: a parent that is itself a subsidiary is exempted from Article 29a(1)–(5) where it *and its subsidiary undertakings* are included in another undertaking's consolidated management report (or a third-country parent's qualifying consolidated sustainability reporting), subject to the second-subparagraph disclosures; Article 29a(9) extends it to public-interest entities.

**Disposition: carried to the design; not closed by citations.** The author review's first recommendation — Article 29a(8)/(9) locators on `S-005`/`S-006` — is withdrawn as a closure: it would describe the gap more accurately without closing it, because `S-005`/`S-006` test `parent.report_includes_entity`, which says the intermediate parent is included and nothing about its subsidiaries, and `S-014` negates the whole duty on either. The design (§3) states why that fact cannot establish Article 29a(8) coverage (Article 23(9)–(10) exclusions, a third-country parent's different sustainability perimeter), proposes `CSRD-S-019` over a declared full-coverage fact `parent.report_includes_entity_and_subsidiaries` with the Article 29a(8)(a)(i)–(iii) disclosures as facts and the third-country and public-interest-entity branches, and shows in the counterexample table (§5 rows 1, 2, 7, 8) that an individual exemption no longer extinguishes a consolidated duty. Whether `S-005`/`S-006` should demand sub-group coverage too — Article 19a(9) uses the same words — is a listed decision (§6, item 4).

## H — The Article 29a(4a) group-composition derogation (`P6-C4`)

**Objection, confirmed by the adjudicator.** Article 29a(4a) (M8) lets the parent leave the paragraph 1 information out for undertakings acquired or merged during the financial year and for subsidiaries leaving the group, while indicating significant events; a content-level, elective carve-out that does not change to whom Article 29a(1) applies.

**Disposition: accepted; no scope change anywhere.** Content-level relief belongs with the reporting-content requirements, if ever encoded.

## Standing of the r5 dossier after these dispositions

Unchanged: completed, schema-valid, evidence-valid, substantive unassessed; not promoted, not signed. The one supported encoding defect (E) is corrected in a change that is ready and held; the dossier's verdicts on version 4 remain the record of what the roles found in version 4, and a later capture binds to version 5 under a new `requirementInputSha256` and run identity.
