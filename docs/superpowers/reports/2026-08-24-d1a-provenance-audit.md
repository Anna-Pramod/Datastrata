# D1a-0b — the provenance audit

**Date:** 2026-08-24
**Base:** `fdc0fe5` *Read the cited source set through one function*
**Task:** D1a-0b of `docs/superpowers/plans/2026-08-24-d1a-corpus-provenance.md`. Document only — no code, no data, no schema.
**Governs:** where this audit and the spec's §12 disposition table disagree, **this audit governs the expectation**. It does not change any settled architectural rule.

---

## 1. Method, and the one positive control

For every requirement the trace is:

```
condition  →  operative proposition  →  current authoritative text  →  source  →  locator
```

"Current authoritative text" means text the corpus serves, cited as `file:line` in `backend/engine/corpus/normalized/`, or — where the corpus serves nothing — the named instrument that would have to be ingested. Locators for unserved instruments are recorded as *deferred*: naming a provision we cannot read would be a claim, not evidence.

**Positive control for the method.** The spec located Art. 19a(9)'s subsidiary exemption at `32013L0034.txt:1545`. Reproduced independently here by searching for the exempting language rather than by opening that line: `grep -n "exempted subsidiary undertaking"` returns `:1545` as its first hit, and the paragraph carries both the EU-parent and third-country-parent branches. The method locates what it claims to locate.

**Its limit, stated.** The corpus serves two documents. Ten requirements cite at least one unserved source, and for those the audit can establish *whether a source is required* — which is the question Task 3 needs — but not quote its text. That is a consequence of auditing before ingestion, which is the plan's own ordering.

---

## 2. Finding A — source authority is not serving-artefact authenticity

**This is a design finding and it is a pre-Task-4 spec/plan gate.** Task 3 may proceed once Task 2 lands; the gate binds provenance authoring, not register work.

The corpus serves `DOC-32013L0034` as *"consolidated, in force from 2026-03-18 (CELEX 02013L0034-20260318)"*. A EUR-Lex consolidation shows the applicable rules at a point in time; it carries **no legal effect** and exists for documentation. Legal effect is produced by the authentic electronic Official Journal.

Nothing in the corpus schema records that distinction. `CorpusDocument` carries `url`, `versionLabel`, `retrievedOn` and hashes — an artefact pinned as "the text", with no field saying whether it is the authentic publication or an official reading of one. Three things are being conflated:

```
requirement provenance      the current legal instrument + the exact proposition
serving/read artefact       e.g. the official EUR-Lex consolidated text
authentic authority basis   the OJ publication(s) that gave that wording effect
```

**The rule this audit applies** (as directed, and consistent with spec §3 rule 2 and §14 rule 1, *pack-required only*; §14 rule 2 is an ingestion rule and is not authority for this): *currency, not lineage* governs the **requirement-provenance** layer. A requirement cites the current host instrument where the proposition is incorporated into that host; an amending act remains provenance only where the proposition is **uniquely** contained in it, such as a standalone transitional provision. Amending acts are **not** retained merely because authentic legal effect derives from OJ publications.

**The amendment required before Task 4:** the spec must state that an official consolidation may serve as a pinned current-reading artefact **without being represented as an authentic, legally effective publication**, and the corpus must be able to say which it holds. The exact metadata/authority mechanism is deliberately not designed here.

---

## 3. Finding B — the served host already carries almost every operative proposition

The consolidated Accounting Directive's own header lists its amending acts, and **M8 is Directive (EU) 2026/470** (`32013L0034.txt:102`, act named at the M8 entry). The Omnibus is therefore *already incorporated* into the document the corpus serves as `SRC-001`.

Every proposition traced below is in that document:

| Proposition | `32013L0034.txt` |
|---|---|
| Art. 19a(1) — EUR 450 000 000 and 1 000 employees | `:1311` |
| Art. 29a — same thresholds on a consolidated basis | `:2309` |
| Art. 19a(1) — clearly identifiable, dedicated section | `:1313` (consolidated: `:2311`) — in the host, but **not** provenance for S-014: §6.2 |
| Art. 19a(9) — subsidiary exemption, EU and third-country parent, equivalence route | `:1545` (conditions `:1553`–`:1579`) |
| Art. 34 — limited-assurance opinion | `:3099` |
| Art. 40a — third-country group gate: > €450m EU turnover in **each of the last two consecutive financial years** | `:3479` (Art. 40a heading at `:3459`) |
| Art. 40a — EUR 200 000 000 subsidiary / branch gateways | `:3469` / `:3477` |
| "protected undertaking" definition; ≤ 1 000 employees; self-declaration | `:1401`; `:1405`; `:1415` |
| Statutory right to decline; duty to inform of excess and of the right | `:1417`; `:1429`, `:1437` |
| "voluntary standards" = the Art. 29ca standards (the cap) | `:1413` |
| Purpose limitation — other purposes, incl. due diligence, unaffected | `:1447` |
| First-three-years value-chain relief | `:1453` (consolidated: `:2449`) |

**What `SRC-004` uniquely holds.** Only its own transitional and amending provisions, which are *not* in the host: the FY2025–26 national relief option (`32026L0470.txt:1057`), and the amendment to Article 5(2) of Directive (EU) 2022/2464 that closes the first-wave window (`:981`, `:1021`). Searching the host for `1 January 2025`/`31 December 2026` returns nothing.

**Consequence.** `SRC-004` is currently cited by fourteen of sixteen requirements. Under the rule in §2 it is *lineage* for all but one of them. This inverts the spec's §12 expectation, which treated `SRC-004` as the served backbone and `SRC-002` as the marginal case. The audit governs.

---

## 4. Finding C — `ratified_country_packs` is not derived from the country packs

`grep` over `backend/engine/src`, `frontend/web` and `scripts` finds **no production code that reads `knowledge/csrd/country-packs/*.json`**. The single hit anywhere is `frontend/web/lib/pack.ts:321`, which counts entries of the *catalogue*, not the packs.

The catalogue is hand-maintained. `catalogues.json` records `"ratified_country_packs": { "entries": {}, "missReason": "national_law_unresolved" }`, and `country-packs/_template.json:18` documents ratification step (4) as *"the member state is added to `catalogues.json` → `ratified_country_packs` with value true"* — a manual edit.

```
country-pack file  ──✗ no production derivation ✗──▶  catalogues.json entry  ──▶  S-013 gate
```

**Therefore:** the empty catalogue is **not** evidence that the country-pack mechanism is wired. It is evidence that no Member State has been hand-added. `DE.json`'s claim — *"S-013 correctly returns `national_law_unresolved` for DE until this pack is completed, golden-tested and ratified"* — is true today for a reason that does not involve `DE.json` at all.

This is a gap between the spec's §10 architecture (*"referenced through the country pack"*) and its implementation, not a contradiction of it. Recorded here; not fixed here.

---

## 5. The sixteen-requirement matrix

Tier is the source's `monitoring/source-register.json` row; **no row** means the source has none (six sources are rowless — Task 3's input). ⁺ `SRC-007` and `SRC-008` each appear in **two** rows with **different** tiers — W-004 `official_body` and W-005 `legal_record`. The matrix shows `legal_record`; Task 3 must resolve which row governs.
Locators are `32013L0034.txt` unless another file is named. *deferred* = the instrument is unserved, so no locator can be quoted yet.

| # | Proposition the determination rests on | Cited now | Locator | Tier | Survives? | Remove | Add | Country dep. |
|---|---|---|---|---|---|---|---|---|
| **S-001** | EU incorporation + Accounting-Directive legal form + turnover > €450m + > 1 000 employees (Art. 19a(1)) | SRC-004, SRC-001 | `:1311`; scope extension `:169` | `legal_record` / **no row** | SRC-001 ✔ · SRC-004 ✘ lineage | SRC-004 | — | no |
| **S-002** | Parent + group exceeds the same two thresholds consolidated (Art. 29a) | SRC-004, SRC-001 | `:2309` | as above | SRC-001 ✔ · SRC-004 ✘ | SRC-004 | — | no |
| **S-003** | Prior FY2024 reporters are a distinct population, closed by the amended wave window | SRC-004, SRC-006 | Art. 5(2) of Dir. 2022/2464 as amended — amending instruction at `32026L0470.txt:981`, `:1021`; **host text unserved** (*deferred*) | `legal_record` / **no row** | **neither survives as authored** | SRC-006, SRC-004 | **SRC-002** | no |
| **S-004** | Member States may relieve undertakings below either amended threshold for FY beginning 2025-01-01 – 2026-12-31, where the option is exercised | SRC-004, SRC-015 | `32026L0470.txt:1057` — **uniquely** in the amending act | `legal_record` / `legal_record` | SRC-004 ✔ **uniquely** · SRC-015 ✘ | SRC-015 | — | **yes** — `entity.member_state_transition_option` |
| **S-005** | Subsidiary exemption where included in a qualifying EU-parent consolidated report and the publication/identification conditions are met (Art. 19a(9)) | SRC-002, SRC-004 | `:1545`, conditions `:1553`–`:1579` | **no row** / `legal_record` | neither survives | SRC-002, SRC-004 | **SRC-001** | no |
| **S-006** | Same exemption via a third-country parent reporting under ESRS or standards determined equivalent, with assurance and Taxonomy information | SRC-002, SRC-004, SRC-009 | `:1545` (third-country branch + equivalence route), assurance/publication `:1569`, Taxonomy `:1575` | **no row** / `legal_record` / **no row** | none survives | SRC-002, SRC-004, SRC-009 | **SRC-001** | no |
| **S-007** | Non-EU ultimate parent with > €450m EU turnover in each of two consecutive years (Art. 40a) | SRC-004, SRC-001 | `:3479` | `legal_record` / **no row** | SRC-001 ✔ · SRC-004 ✘ | SRC-004 | — | no |
| **S-008** | Art. 40a routes through an EU subsidiary exceeding €200m in the preceding FY | SRC-004 | `:3469` | `legal_record` | ✘ lineage | SRC-004 | **SRC-001** | no |
| **S-009** | Branch is the gateway where no qualifying subsidiary exists and the branch exceeded €200m | SRC-004 | `:3477` | `legal_record` | ✘ lineage | SRC-004 | **SRC-001** | no |
| **S-010** | ≤ 1 000-employee value-chain undertaking is protected from above-cap CSRD-purpose requests; purpose-limited | SRC-004, SRC-010 | definition `:1401`, threshold `:1405`, self-declaration `:1415`, purpose limitation `:1447` | `legal_record` / `official_body` | neither survives | SRC-004, SRC-010 | **SRC-001** | no |
| **S-011** | Above-cap items may be declined; requestor must identify the excess and communicate the right; the cap is the Art. 29ca voluntary standard | SRC-004, SRC-010, SRC-008 | decline `:1417`, inform `:1429`/`:1437`, cap definition `:1413`; **item catalogue** *deferred* (voluntary-standard act annex) | `legal_record` / `official_body` / `legal_record` | SRC-008 ✔ **uniquely** · others ✘ | SRC-004, SRC-010 | **SRC-001** | no |
| **S-012** | Which ESRS version applies: the 2023 set, or the revised set once effective (incl. FY2026 early adoption) | SRC-005, SRC-006, SRC-007 | SRC-005 = the act itself; SRC-007 **Art. 2(1)(a)** and **Art. 3** (§7.1) | **no row** / **no row** / `legal_record`⁺ | SRC-005 ✔ · SRC-007 ✔ **uniquely** · SRC-006 ✘ | SRC-006 | — | no |
| **S-013** | A final answer must rest on the governing Member State's transposition; until ratified, no EU-level screen is final | SRC-015, SRC-001 | `:4267` — Member States shall bring into force the measures necessary to comply | `legal_record` / **no row** | SRC-001 ✔ · SRC-015 ✘ | SRC-015 | — | **yes** — `entity.governing_member_state` |
| **S-014** | A reporting duty exists where a threshold route applies and no exemption removes it (title + composition; the dedicated-section rule is `plainEnglish` only — §6.1) | SRC-002, SRC-004 | `:1311`, `:2309` (the duty itself) | **no row** / `legal_record` | neither survives | SRC-002, SRC-004 | **SRC-001** | no |
| **S-015** | Statutory sustainability information is subject to limited assurance | SRC-002, SRC-004 | `:3099` (Art. 34(1), 2nd subpara., point (aa)) | **no row** / `legal_record` | neither survives | SRC-002, SRC-004 | **SRC-001** | no |
| **S-016** | For the first three reporting years, unavailable value-chain information may be explained | SRC-004 | `:1453` (consolidated `:2449`) | `legal_record` | ✘ lineage | SRC-004 | **SRC-001** | no |

---

## 6. The reading rule this audit applies, settled from the renderer

### 6.1 What the current requirement model treats as the authored proposition

Item 3 of the review asked whether *"`requirement_ref` condition = trigger, `plainEnglish` = authored consequence"* is an accepted interpretation. It is **not** — and the model supplies a better answer, so nothing is deferred to Task 4 and there is no contradiction to report.

`renderRequirement` (`verification/render.ts:421-441`) builds what the prosecutors check the reading against:

```
`${requirement.id} — ${requirement.title}`

This applies when:
<rendered condition>
```

The **title is inside the rendered text**, and that text is what `renderedConditionSha256` pins. `plainEnglish` is rendered nowhere, enters no hash, and reaches no role. `caution` likewise. `logicalPayloadSha256` covers the condition (or the ordered `cases`' `when`/`value` — never a case `label`).

**The rule, therefore:**

```
verified surface   =  title  +  condition (rendered)
NOT verified       =  plainEnglish, caution, case labels
```

### 6.2 Applied to S-015 — settled, not deferred

S-015's condition is `requirement_ref(CSRD-S-014, APPLIES)` — the trigger. Its consequence is carried by its **title**, *"Limited assurance over sustainability reporting"*, which the renderer puts into the verified surface. The consequence is therefore authored and verified, and it rests on Art. 34 of the host at `:3099`. **`SRC-001` is genuine provenance for S-015.** The reading is fixed by the renderer, not by any later decision: Task 4 implements provenance and does not reinterpret requirement semantics.

The same rule **corrects S-014**, in the other direction. Its dedicated-section sentence is `plainEnglish` only and is not verified; its title and composition carry "a reporting duty exists". Its locator moves from `:1313` (dedicated section) to `:1311`/`:2309` (the duty). That correction is applied in §5.

**Q5 stands** on the corrected basis: what S-015 determines is the limited-assurance consequence, which is in the host; provider eligibility lives in `caution` and in Directive 2006/43/EC, and is not part of the verified surface. No Audit Directive source is required.

---

## 7. S-012 — resolved without ingestion

Researched read-only against official artefacts; **nothing was added to the corpus**.

S-012 is a `selection`. Its logical payload is the ordered `cases`' `when`/`value` pairs and `defaultValue` — case **labels are excluded**. So the determination is exactly: *choose `ESRS_2023` unless the revised act is in force, in which case `ESRS_REVISED_2026` for FY ≥ 2027 or for FY2026 on early adoption.*

### 7.1 What each cited source supplies

**`SRC-005` — Delegated Regulation (EU) 2023/2772 — SURVIVES.**
It *is* the value `ESRS_2023`: the act adopted under Art. 29b that constitutes the baseline standard set. No other instrument establishes the identity of the thing selected. Read at EUR-Lex (CELEX 32023R2772, OJ L 2023/2772, 22.12.2023, in force).

**`SRC-006` — Delegated Regulation (EU) 2025/1416 — DOES NOT SURVIVE.**
Read verbatim at EUR-Lex (CELEX 32025R1416). Its whole operative content:

> *Article 1 — Amendments to Delegated Regulation (EU) 2023/2772. Annex I to Delegated Regulation (EU) 2023/2772 is amended in accordance with the Annex to this Regulation.*
> *Article 2 — … It shall apply with respect to financial years beginning on or after 1 January 2025.*

and its Annex begins *"in ESRS 1, Appendix C, 'List of phased-in Disclosure Requirements', is replaced by the following"*.

So it amends **Annex I of 2023/2772** — it changes *what the 2023 ESRS contain* (which disclosure requirements are phased in), not *which version applies*. S-012 selects a version; the quick-fix bears on neither branch. The only place it appears in S-012 is the case **label** "(incl. quick-fix)", which the logical payload excludes. Under *currency, not lineage*, the current 2023 ESRS is 2023/2772 as amended, and the host instrument is `SRC-005`. **`SRC-006` is removed** — the same pattern as `SRC-004`, one layer down.

*Not to be confused with an ingestion question.* EUR-Lex's consolidation of 2023/2772 is dated 01/01/2025 and therefore predates the quick-fix (OJ 10.11.2025). Anyone ingesting `SRC-005` must ingest base **and** amending act to read the current Annex I (spec §14 rule 2). That is a D1a-2 completeness matter; it does not make 2025/1416 *requirement provenance* for S-012.

**`SRC-007` — the revised ESRS delegated act, C(2026) 5010 — SURVIVES, uniquely, and its locators are pinned.**

Read as official text at EUR-Lex (`PI_COM:C(2026)5010`, HTML rendition). The two provisions S-012's cases rest on, verbatim:

> **Article 2 — Transitional provisions for financial years starting between 1 January and 31 December 2026**
> *1. For the financial years starting between 1 January 2026 and 31 December 2026, undertakings falling within the scope of Delegated Regulation (EU) 2023/2772 may apply either of the following: (a) the sustainability reporting standards set out in Annex I to Delegated Regulation (EU) 2023/2772 as last amended by Commission Delegated Regulation (EU) 2025/1416 or the sustainability reporting standards set out in Annex I to this Regulation; …*

> **Article 3 — Entry into force and application**
> *This Regulation shall enter into force on [O.P.: please insert the date = date of adoption plus 4 months plus 1 week]. It shall apply to the financial years beginning on or after 1 January 2027.*

**Locators for S-012:**

```
SRC-007  Art. 2(1)(a)  → FY beginning in 2026 may use the revised standards
SRC-007  Art. 3        → the revised Regulation applies to FY beginning
                          on or after 1 January 2027
```

Those map exactly onto S-012's case 3 (`fy_start_year_in [2026]` + `early_adoption_revised_esrs`) and case 2 (`fy_starts_on_or_after 2027-01-01`). Nothing else establishes either. **`SRC-007` survives, uniquely.**

**Status corroborated by the act's own text.** Article 3's entry-into-force date is still an unfilled placeholder — *"[O.P.: please insert the date …]"* — which is the act saying of itself that it is adopted and not yet in force. That is what S-012's `pack_flag revised_esrs_in_force` and its `caution` already assert.

**Correction to an earlier claim in this workstream, now resolved.** The FY2026/FY2027 proposition was previously asserted from a search-result synthesis, and this audit refused it on that basis. It is restored here **only** from the official text quoted above.

**Why Article 2(1)(a) does not revive `SRC-006`.** It defines the FY2026 alternative as *"Annex I to Delegated Regulation (EU) 2023/2772 **as last amended by** Commission Delegated Regulation (EU) 2025/1416"* — naming the quick-fix. That is a statement about the *content* of the baseline, in the same currency-not-lineage shape as everything else in this audit: the instrument S-012 selects is 2023/2772, in its current amended form, and 2025/1416 is the amendment to it. The reference strengthens the **ingestion** requirement — `SRC-005` must be ingested as base **plus** amending act to read the current Annex I — and leaves the provenance disposition unchanged.

**The PDF question is an ingestion/normalisation matter, not a locator or provenance blocker.** The Commission's own distribution is a browser-download-gated PDF, but EUR-Lex serves the same act as searchable official text, which is where these locators come from. Envelope E1's deterministic extraction is needed to bring the artefact into the corpus; it is not needed to author `SRC-007`'s provenance.

### 7.2 Missing source for S-012? No

The enabling article — standards "adopted pursuant to Article 29b" — is in the host, but S-012 does not determine the enabling power; it determines which adopted instrument governs. `SRC-001` is therefore **not** added. This is the one judgement call in the row and it is recorded as such.

**S-012's audited set: `SRC-005`, `SRC-007`.**

---

## 8. The five mandatory evidence questions

**Q1 — S-005 / S-014 / S-015 → does `SRC-002` survive? No.**
Every proposition those three rest on is in the served host: the exemption at `:1545`, the reporting duty at `:1311`/`:2309`, the limited-assurance opinion at `:3099`. Nothing they determine is uniquely in Directive (EU) 2022/2464.

Per §6, S-014's verified surface is its title plus its rendered composition — *a reporting duty exists* — so its provenance is the duty at `:1311`/`:2309` and therefore `SRC-001`. The dedicated-section sentence is `plainEnglish` and is not part of it. Its own Art. 5 timing, which would be 2022/2464's candidate unique content, appears only in `caution` and is likewise unverified. `SRC-002` is removed from all three.

**Q2 — S-003 → does `SRC-006` survive? No, and `SRC-004` does not survive either.**
Delegated Regulation (EU) 2025/1416 postpones *ESRS disclosure application dates*; it says nothing about which undertakings formed the FY2024 wave. The wave window is Article 5(2) of Directive (EU) 2022/2464 as amended, and the corpus holds only the *amending instruction* (`32026L0470.txt:981`, `:1021`), not the host text. Under §2 the citation belongs to the host instrument: **S-003 loses `SRC-006` and `SRC-004` and gains `SRC-002`**, which is unserved and will gap until ingested. The audit does not soften this to preserve reachability.

**Q3 / Q4 — the S-004 and S-013 national-law paths.** §7.

**Q5 — S-015 → is Directive 2006/43/EC genuinely required? No.**

Review challenged this row, because S-015's `condition` is a bare `requirement_ref(CSRD-S-014, APPLIES)`. §6 settles it from the renderer: the verified surface is the requirement's **title** plus its rendered condition, and S-015's title carries the consequence.

```
verified surface  =  title + rendered condition        (render.ts:421-441)
S-015 title       =  "Limited assurance over sustainability reporting"
                     → the consequence, authored and verified
                     → supported by Art. 34, host `:3099`  → SRC-001

S-014's excluded material is different in kind: the timing statement sits in
`caution` and the dedicated-section rule in `plainEnglish`. Neither is
rendered, hashed, or shown to any role.
```

On that reading, S-015's proposition is the limited-assurance consequence, it is in the host, and **2006/43 is not required**: provider eligibility and appointment — the parts that do live in the amended Audit Directive — appear only in S-015's `caution` as a national-overlay pointer. `sources.json` carrying no Audit Directive entry is **correct**, not an omission.

**Settled, not conditional.** §6 fixes the reading from `renderRequirement`; Task 4 implements provenance and does not reinterpret requirement semantics. S-015's verified surface carries the limited-assurance consequence, Art. 34 at `:3099` supports it, `SRC-001` is its provenance, and Directive 2006/43/EC is not required for the verified proposition.

---

## 9. The `SRC-010` substitution test — **PASSES**

Spec §17 requires that `SRC-010` may stop being cited only if, proposition by proposition, the operative text is shown to be contained elsewhere. The spec words this as *"`SRC-004` is shown to contain everything"*; the audit locates the propositions in `SRC-001`'s document instead and says so plainly, under the governs-clause in the header. All four are in the served host — and note they are in `SRC-001`'s document, not only in `SRC-004`'s:

| Proposition | Located |
|---|---|
| Protected undertaking: ≤ 1 000 average employees in the preceding FY | `:1401`, `:1405` |
| Statutory right to decline above-cap items | `:1417` |
| Requestor must identify the excess and communicate the right | `:1429`, `:1437` |
| Purpose limitation — requests for other purposes, including due diligence, unaffected | `:1447` |

Whether the Commission explanatory page adds anything of its own cannot be read here — it is unserved — so no claim is made about its contents; the test is the positive one above, and it passes. `SRC-010` is removed from S-010 and S-011 and remains a monitoring row (W-009).

**S-011's surviving dependency is unaffected:** its cap *item catalogue* is the Art. 29ca voluntary standard, which the host defines by reference (`:1413`) but does not contain. `SRC-008` survives, unserved.

---

## 10. S-004 and S-013 — two layers, proved separately

The committed plan asked for one experiment spanning both. It cannot: `orchestrate.ts:310` calls `requireRunner` **before** `runBlindReader` at `:415`, so a run cannot begin without a runner; and `national_law_unresolved` is produced by the assessment path, not the verification path. Both probes below use the production entry points, a synthetic request-counting runner that never touches the network, and scratch destinations. Run independently; outcomes not averaged.

### 10.1 Verification layer — `runRun`

**Control** — current pack, real corpus, scratch `verificationDir`, counting runner:

```
CSRD-S-004   exitCode 0   runner requests 0   []
             gaps [{"kind":"corpus_gap","sourceId":"SRC-015",
                    "detail":"no document in the corpus serves SRC-015: …"}]

CSRD-S-013   exitCode 0   runner requests 0   []
             gaps [{"kind":"corpus_gap","sourceId":"SRC-015", … }]
```

**Candidate** — `SRC-015` removed from that one requirement, real corpus, scratch out, same runner:

```
CSRD-S-004   sources ["SRC-004","SRC-015"] -> ["SRC-004"]
             registry v2 4159ff13df77… -> 02c78ca134a2…  (scratch only)
             runner requests 2  ["reader","prosecutor"]     ← barrier removed
             no corpus_gap(SRC-015)

CSRD-S-013   sources ["SRC-015","SRC-001"] -> ["SRC-001"]
             registry v2 cae8a5bc5e64… -> 763424a55058…  (scratch only)
             runner requests 2  ["reader","prosecutor"]     ← barrier removed
             no corpus_gap(SRC-015)
```

Both candidates then refuse at `role_output` because the counting stub returns reader-shaped JSON to a prosecutor. **That is a harness artefact, not a finding**: the proposition under test — the source-completeness barrier is gone and the run proceeds — is established by the gap's absence and by the run reaching the runner at all.

**Causal narrowness.** Each candidate pack differs from the real pack in exactly one authored field (that requirement's `sources`), plus the minimum registry bookkeeping `assertVersionIntegrity` requires — the digest for the existing version, rewritten **in the scratch registry only**. Version numbers, condition logic, country packs, the register and the corpus are untouched, and W-002 is not retiered.

### 10.2 Assessment layer — `assess()`, two runs

**Run 1 — sparse profile, no fact confirmed.** Every fact absent:

```
CSRD-S-004  INDETERMINATE  reason missing_fact
  needs … {"factType":"entity.incorporation_country","reason":"missing_fact"}
        … {"factType":"entity.member_state_transition_option",
           "reason":"national_law_unresolved"}

CSRD-S-013  INDETERMINATE  reason missing_fact
  needs … {"factType":"entity.incorporation_country","reason":"missing_fact"}
        … {"factType":"entity.governing_member_state",
           "reason":"national_law_unresolved"}   (twice)
```

This run gives the **discriminating contrast in one output**: `entity.incorporation_country` declares no `missingReason` in `fact-types.json` and so reports `missing_fact`, while the two country facts declare `national_law_unresolved` and report it. Both counterexample and target are *absent*, so the contrast isolates the reason vocabulary rather than presence-versus-absence.

What it does **not** show is which code path produced the reason. `condition/evaluate.ts:199` returns `missing(...)` — carrying the **fact's** `missingReason` — whenever the fact is absent; the catalogue branch at `:204` is reached only when the fact **binds**. In run 1 `entity.governing_member_state` did not bind, so both of S-013's needs came from the fact-type declaration and `ratified_country_packs` was never consulted.

**Run 2 — the same profile with facts confirmed and `entity.governing_member_state` bound to `DE`**, so the catalogue branch is genuinely exercised (`DE` is not in `entries`, which is `{}`):

```
CSRD-S-004  INDETERMINATE  reason national_law_unresolved
  needs [{"factType":"entity.member_state_transition_option",
          "reason":"national_law_unresolved"}]

CSRD-S-013  INDETERMINATE  reason national_law_unresolved
  needs [{"factType":"entity.governing_member_state",
          "reason":"national_law_unresolved"}]
```

Every other conjunct now resolves, and each requirement is left holding exactly its own country fact. **The two mechanisms are now distinguished by evidence rather than by assertion:**

```
S-004  fact absent          → condition/evaluate.ts:199 missing(), fact-type missingReason
S-013  fact bound, not in   → condition/evaluate.ts:204 catalogue branch,
       ratified_country_packs  cond.missReason ?? cat.missReason
```

*Why run 1's facts did not bind:* `ProfileFact.confirmed` is the trust boundary (`types.ts:86-91`) and `FactValue` is a tagged union; run 1 supplied neither. Run 2 supplies both. Run 1 is retained because its `missing_fact` sibling is the discriminator run 2 no longer contains.

### 10.3 The two layers are orthogonal

Removing `SRC-015` does **not** cause `national_law_unresolved`. Verification provenance and entity assessment are different layers; the audit asserts only what each probe shows:

```
verification   SRC-015 cited  → corpus_gap(SRC-015), zero runner requests
               SRC-015 absent → barrier removed, run proceeds
assessment     independently of provenance, both requirements surface
               national_law_unresolved for their own country fact
```

**Disposition.** `SRC-015` is removed from S-004 and S-013. Removing it does not turn visible missing evidence into invisible missing evidence: the assessment gate fires on its own mechanism, unchanged by the citation.

**Qualified by Finding C.** Run 2 shows S-013's gate firing *through the catalogue*, with `DE` bound and absent from `entries`. That is the mechanism working. It is **not** evidence that the country-pack layer behind it works: no production derivation connects country-pack ratification to that catalogue, so what run 2 proves is that an unratified state is refused, not that ratification is wired. The replacement evidentiary vehicle the spec describes is *designed*, not *implemented*.

---

## 11. The source universe this audit produces

**Removals (24 citations):** `SRC-004` from S-001, S-002, S-003, S-005, S-006, S-007, S-008, S-009, S-010, S-011, S-014, S-015, S-016 (13) · `SRC-002` from S-005, S-006, S-014, S-015 (4) · `SRC-006` from S-003 and S-012 (2) · `SRC-009` from S-006 (1) · `SRC-010` from S-010, S-011 (2) · `SRC-015` from S-004, S-013 (2).

**Additions:** `SRC-001` to S-005, S-006, S-008, S-009, S-010, S-011, S-014, S-015, S-016 · `SRC-002` to S-003.

**Re-attributions:** `SRC-002` leaves four requirements and arrives at one different one. `SRC-004` retreats from fourteen requirements to one.

32 citations today − 24 removals + 10 additions = **18**, across **six** sources:

| Source | Cited by | Served? |
|---|---|---|
| `SRC-001` | S-001, S-002, S-005, S-006, S-007, S-008, S-009, S-010, S-011, S-013, S-014, S-015, S-016 (13) | **yes** |
| `SRC-002` | S-003 (1) | no |
| `SRC-004` | S-004 (1) | **yes** |
| `SRC-005` | S-012 (1) | no |
| `SRC-007` | S-012 (1) | no |
| `SRC-008` | S-011 (1) | no |

**Cited by no requirement after this audit:** `SRC-006`, `SRC-009`, `SRC-010`, `SRC-015` (each removed here). `SRC-003` was already cited by nothing and is untouched. Each remains a monitoring target; none is deleted from the catalogue by this audit.

**Register rows Task 3 must create** (rowless sources still in the universe): `SRC-001`, `SRC-002`, `SRC-005`. `SRC-003` (never cited), `SRC-006` and `SRC-009` (removed here) are rowless and outside the universe — Task 3 decides whether the catalogue keeps them, per its own scoping rule.

**Reachability is not stated here.** It is measured at D1a-3 from the corpus that actually results, and no target is set.

---

## 12. Pre-Task-4 gates and tracked capability gaps

### 12.1 Pre-Task-4 gate — blocks provenance authoring, not Task 3

**G-1 — Finding A's spec amendment (the only one).** The spec must state that an **official consolidation may serve as a pinned current-reading artefact without being represented as an authentic, legally effective publication**, and the corpus must be able to say which it holds:

```
source authority        !=        serving-artefact authenticity / legal effect
```

Task 4 authors provenance against the *current legal instrument*; this audit's whole disposition rests on that separation, so it is stated in the spec before Task 4 acts on it. **Not implemented during Task 2**, by instruction, and the metadata mechanism stays undesigned until the audit's impact is priced.

> **Closure note — 2026-08-27.** G-1 was subsequently closed after Task 3, before Task 4. D1(a) spec revision 4 (§7.1) now distinguishes three independent axes — **source authority**, **serving-artefact authenticity**, **temporal legal status**. Requirement provenance names the current host instrument and locator, not the serving artefact, so an official consolidation may serve a `legal_record` source without the consolidation itself being represented as the authentic legally effective publication. Artefact-level standing/authenticity is deferred to envelope **E2**. This does not reopen *currency, not lineage*, and does not block Task 4 provenance authoring.
>
> The finding above is left as written: it records what the audit established, and the closure records what was done about it.

**No other gate.** `SRC-007`'s locators are pinned from EUR-Lex official text (§7.1); S-013's locator is pinned at `:4267`; S-015's semantics are settled by `renderRequirement` (§6). None of the three is a Task-4 decision.

**Not a gate: envelope E1.** Deterministic PDF extraction is needed to *ingest* `SRC-007` into the corpus, because the Commission distributes it as a download-gated PDF. It is an ingestion/normalisation capability question for D1a-2 and E1, not a locator or provenance blocker.

*Note on `:4267`*: it is the Accounting Directive's own transposition article. It establishes the proposition S-013 gates on — that this law operates through national measures — and nothing narrower is in the served host. The later, act-specific transposition deadlines (the Omnibus's 19 March 2027) live in the amending acts, which S-013 does not cite and does not need: S-013 gates on *whether* national law is resolved, not on any deadline.

### 12.2 Tracked architecture gap — national-law capability

Verified, and it is not a Task-4 gate because nothing in D1(a) depends on it:

```
no production code reads country-packs/*.json
ratified_country_packs is represented by hand in catalogues.json
```

The probes prove that the **current unratified state is conservative** — an unratified Member State is refused, and refused through the catalogue branch (§10.2, run 2). They do **not** prove that country-pack ratification is wired into assessment, because nothing derives the catalogue from the packs.

**Required follow-up, as its own piece of work:**

```
national legal evidence
   → country-pack ratification
      → derived / validated catalogue state
         → assessment
```

Until that path exists **and has teeth**, no production claim is warranted that a country pack can resolve national law. This gap does not by itself require `SRC-015` to remain legal provenance: the tracker is not the national measure, and §10 shows the gate standing without it.

### 12.3 Judgement calls recorded rather than hidden

1. **S-012 adds no `SRC-001`** (§7.2) — the requirement determines which adopted instrument governs, not the enabling power.
2. **S-006 drops `SRC-009`** — the determination rests on the host's equivalence *mechanism*, not on the Notice's gloss. If the gloss is judged load-bearing for the `EQUIVALENT` value, `SRC-009` returns.
3. **`SRC-007`/`SRC-008` tier ambiguity** — each appears in two register rows with different tiers (W-004 `official_body`, W-005 `legal_record`). Task 3 resolves which governs.

---

## 13. Repository inertness

Measured after all six probe runs (four verification, two assessment):

```
REAL repository
  verification-result.json  0
  signatures.jsonl          0
  promotions.jsonl          0
  transcript fixture        91ad7485be357206  (unchanged)
  git diff --name-only      docs/superpowers/plans/2026-08-24-d1a-corpus-provenance.md
                            — prose only: this audit's Task-2 probe redesign and
                              the Finding A amendment note. No other tracked file.
  git status --short        two untracked: this report, and the pre-existing,
                            unrelated b3 plan draft
  requirements.json, requirement-versions, country packs, corpus, register,
  schema, src/ — all untouched

SCRATCH
  two candidate packs, two scratch registries, four verificationDir trees —
  all under the session scratchpad, none inside the repository, none staged
```

The scratch `verification-result.json` files written by the two control runs are the **expected** B2 output for a gap-bearing run and are quoted in §8.1 as positive evidence.

---

## 14. Status

**Task-2 audit: closed.** All sixteen rows are resolved, including S-012, which was determined from official artefacts read read-only rather than left pending ingestion. The audited source universe is final.

```
audit finding, subsequently closed before Task 4 — see D1(a) spec revision 4
  G-1  Finding A spec amendment — source authority != serving-artefact
       authenticity / legal effect

closed, not gates
  S-012 locators   SRC-005 = the act; SRC-007 Art. 2(1)(a) and Art. 3
  S-013 locator    pinned at 32013L0034.txt:4267
  S-015 semantics  settled by renderRequirement (§6)

ingestion capability, not a gate
  envelope E1 deterministic PDF extraction, to bring SRC-007 into the corpus

separate national-law capability gap
  country-pack → ratified catalogue production wiring (§12.2)
```

Task 3 is not blocked by any of these: it creates register rows for the audited universe.
