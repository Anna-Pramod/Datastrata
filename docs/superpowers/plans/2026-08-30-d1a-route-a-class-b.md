# D1a Route A — class-B capability and ingestion

**Date:** 2026-08-30
**Base:** `89b0b86` *Measure what the corpus now costs to read* (branch `feature/b1b-ii-a-record`)
**Parent plan:** `docs/superpowers/plans/2026-08-24-d1a-corpus-provenance.md` — envelopes E1–E4 and Task 12.
**Parent spec:** `docs/superpowers/specs/2026-08-24-d1a-corpus-provenance-design.md` — §6, §7, §7.1, §9, §12.4, §15, §16, §19.
**Status:** plan only. No production code, schema, corpus data or spec text is modified by this document. Normative corrections are stated as exact diffs in §3 and applied by **B-NORM**, not here.

**Repaired 2026-09-04 (B-PLAN-4)** against the 2026-09-02 constitutional audit. Every finding adopted was first re-verified against the tree at `b40dcf6`; §0.1 records what was adopted, what was rejected and why. This is the fourth repair. §11 now states readiness **per boundary, with the evidence that established it**, and makes no global completeness claim.

**Path convention.** Every `src/…` and `test/…` path is relative to **`backend/engine/`**, as are `knowledge/`, `corpus/`, `monitoring/` and `verification/`. Only `docs/…` and `scripts/…` are repository-root-relative.

**Sequence (re-ordered 2026-09-04, §11):** `B-NORM → [B-FIX-WITNESS] → B-E2 → B-INGEST → A-0 → (B-E4 → B-T12 | B-OJ)`. B-E2 precedes B-E4 because it is needed under every route; B-E4 and B-T12 are route-specific and conditional on the publication gate. **E1 and E3 remain deferred** (§8).

---

## 0. Decisions carried in

Settled by the user; treated as given, not re-argued.

| # | Decision |
|---|---|
| D-1 | **Route A** — EUR-Lex HTML expressions are the serving artefacts. E1 leaves Task 12's critical path but is **not** retired globally. |
| D-2 | **E4** approved as a generic **full-URL exact** matcher, named **`exact_query`**. Generic; neither EUR-Lex nor `intcom` may appear in production code. |
| D-3 | **Composite artefact accepted.** The memorandum does not make it inadmissible and no selector or normalization machinery may strip it. **A mandatory role-facing rule must say the memorandum is non-operative** — §6.3. |
| D-4 | **E2-b.** A directly cited adopted-not-effective instrument may be an entitlement entry point, with structured standing exposed to every role, never presented as current law. |
| D-5 | **Temporal standing → instrument/source axis; authenticity → artefact axis.** Exactly **one** structured owner — §6.1. |
| D-6 | **Traversal:** direct citation admits; structural expansion must not. Proved in a purpose-built world. Task 12 stays zero-edge. |
| D-7 | **E3 deferred** until an OJ successor exists. |
| D-8 | **Expansion quantifier: R-b.** A multi-source artefact is indivisible; if **any** served source is not `in_force`, structural expansion is refused. Direct citation still admits it. |
| D-9 | **Authenticity vocabulary approved:** `authentic_publication`, `official_consolidation`, `official_pre_publication_text`. |
| D-10 | **`FIELD_ROLES`:** `['integrity','audit']` for the identity-bearing pin fields. **Do not add `display`** merely because standing is model-facing; the display consumer is traced and settled in §6.5.4. |
| D-11 | **Network: N-2 selected.** No pre-fetch control-flow change in this sequence. N-1 recorded as deferred hardening; the **no-write** guarantee remains mandatory. |
| D-12 | **I-2 approved in principle**, including retirement of the one current transcript generation, **conditional on the version-surface audit in §6.5.2 closing.** |

### Two corrections carried in

**C-1 — cross-source origin uniqueness is not a defect.** One artefact may legitimately serve several sources, so the same URL may need a declaration under each. The defect is the path-only matcher's breadth. **No global URL-uniqueness invariant is introduced**; the per-row duplicate check (`src/monitoring/register.ts:181–193`) is untouched.

**C-2 — identity commitment is a design blocker.** Anything E2 or D-3 adds to a model-facing render must be committed by the relevant identity mechanism. The same recorded closure identity must not be able to render different standing, authenticity or operative-status text.

### 0.1 Repairs of 2026-09-04 — decisions taken by engineering evidence

Each row names the finding as verified against the tree, the decision, and the alternative rejected. User-level decisions are **not** taken here; they are listed in §11.2.

| # | Finding (verified 2026-09-04) | Decision | Rejected |
|---|---|---|---|
| R-1 | Row `#27`'s prescription writes *"this sub-plan"* into the parent plan and leaves a false closing sentence live (§3.8) | Prescription rewritten to name this plan by path and to scope the sentence to E1/E3 | Applying as written — would re-fire A-NORM-1 |
| R-2 | Parent plan `:22` carries the *"exactly **five**"* grep contract, unmapped | Row `#34`, routed to §3.9 | Leaving it — the parent plan would contradict the corrected `CLAUDE.md` on the same command |
| R-3 | §4's ledger (18 final / 12 to re-apply) was wrong. Verified row by row: 20 final, 2 no-ops, 13 pending | Ledger restated from the tree; residue checks that can fail added (§4) | A prose ledger without checks — it was green over a tree carrying four live contradictions |
| R-4 | §8 conflated OJ publication with entry into force; W-005's `governs` calls publication *"the moment pending law becomes effective law"* | B-OJ is two dated events (§8); A-0 gains publication, non-service and objection branches (§10.1) | One cascade at publication — would assert `in_force` before the act is law, or red B7 |
| R-5 | R-b gated structural expansion only; `closure.ts:134–137` also follows `references` edges | R-b restated over every traversal step; T5 / M-T5 (§6.4) | — |
| R-6 | The planned closure-policy identity was an opaque label; R-b could change without moving it, so M-B8 was tautological | Behavioural `expansion` field on `ClosurePolicy`, read by `computeClosure`, hashed in the existing `closurePolicy` payload block (§6.5.2) | An opaque identity string |
| R-7 | `closureRendererVersion` on the signing entry was to be a `buildSignature` parameter — a value the signature did nothing with | Sourced from the **result** and copied at signing exactly as `pipelineVersion` is (`sign.ts:366`); the ledger field stays, at `['audit']` (§6.5.5) | Dropping the ledger field — the strict schema is cheapest to settle before the first real signature, not after |
| R-8 | `exact` / `path_prefix` silently ignore a candidate query (`origin.ts:88–93`); `corpus-authority.test.ts:233–237` asserts that acceptance | One rule across kinds: a candidate query or fragment is **refused** under the path kinds and compared under `exact_query` (§5.0) | *"`exact` and `path_prefix` behaviour must not change"* — already contradicted by §5.1's kind-agnostic fragment refusal |
| R-9 | Decoded-multiset comparison had an unspecified comparator and a false *"Required"* | **Raw-search exact comparison**; the decoded apparatus, old A5/A6/A9 and M-A3/M-A4 withdrawn (§5.0) | Decoded comparison — collapses spellings nobody declared into one permission, for a convenience B-T12 does not need |
| R-10 | Ingest follows redirects, accepts any `response.ok` status, and replaces an unparseable `index.json` with an empty one (`ingest.ts:114–120`, `:220–224`). On 2026-09-04 the declared EUR-Lex URLs answered a 302 and 202 interstitials (§2.4) | **B-INGEST**, an unconditional boundary carved out of B-E4 on review, makes ingest refuse a redirect, a non-200 status and a non-`ENOENT` index failure before any write (§5.4) | Deferring with N-1 — either observed response would have been stored as the artefact |
| R-11 | `changeWatch[].status` is a fourth structured-looking carrier of standing; both engine goldens embed the four-item `changeWatch` array | Tooth B7b: a `changeWatch` status drawn from the standing enum must equal its listed instruments' `temporalStanding`; values unchanged (§6.1) | Renaming the two values — moves both goldens for no determination change |
| R-12 | `statusAtSnapshot` carries authored notes the structured field cannot (SRC-009 *"pre-Omnibus in parts"*, SRC-012 *"Guidance primarily for 2023 ESRS"*) | The approved rename to `statusNote` stands; nothing reads it once the frontend is repointed | Deleting — discards authored notes on the seven non-instrument sources, which have no structured standing until B-STANDING-ALL |
| R-13 | B-E2's impacted set was hand-enumerated; the partition tests at `pipeline-replay.test.ts:1718–1777` red after B-E2 and selecting by `runId` does not repair them | §7.2's name-set sweep applies to B-E2 over both workspaces; the partition block is rewritten static-vs-static (§6.5.4) | — |
| R-14 | Real source ids serve as fixture roles in seven files, and B9 reds `pipeline-closure-citability.test.ts:244–254` because `SRC-012` is a non-instrument | **B-FIX-WITNESS** scoped as a test-only boundary, go/no-go decided after B-NORM (§4.1) | Folding it into B-E2 — mixes a behaviour-preserving retarget with an identity move |
| R-15 | *"Everything is closed"* was falsified three times | Per-boundary readiness with dated evidence, and an explicit list of open user decisions (§11) | — |

**Not adopted, with reasons.** *A blanket rule that a requirement citing a non-in-force source must itself be non-in-force* — S-011 derives its obligation from the in-force Directive (Article 19a(3)) and uses `SRC-008` for a conditional cap catalogue; the logical use of each such source is traced per requirement before any model change, so this is recorded in §8 as a post-Route-A question, not a rule. *Calling `nonOperativeSections` a fourth standing axis* — it partitions material within one artefact, and §3.3's condition-5 text already says so. *Holding every ledger-schema addition until the first signature is imminent* — rejected for `closureRendererVersion` (R-7): the strict schema is cheapest to settle now. *Folding prompt delimiting and the section-blind evidence check into B-E2* — both are real and are named in §8 as **B-PROMPT** and **B-EVID-SPAN**, kept out of B-E2 so the identity boundary stays bounded; a second `pipelineVersion` move before any promotion exists costs nothing. *Deleting `statusAtSnapshot`* — R-12.

---

## 1. Current-state reconnaissance

Verified read-only at `89b0b86`.

| Gate | Value |
|---|---|
| HEAD / branch | `89b0b86` on `feature/b1b-ii-a-record`, clean but for two user-owned untracked files |
| Engine / frontend tests | **54 files / 1574** · **7 / 48** |
| `typecheck` / `test:standalone` / csrd grep | 0 / PASS / **7** |
| Partition | **14 model-reachable / 2 gap-bearing** (S-011 on `SRC-008`, S-012 on `SRC-007`) |

`test/` holds 55 `*.test.ts`; `pipeline-live.agents.test.ts` runs only under `vitest.agents.config.ts`. `test:standalone` is defined in the **repository-root** `package.json`.

### 1.1 The origin matcher today

`AuthorisedOrigin` (`src/monitoring/types.ts:108–119`) is `'exact' | 'path_prefix'` with a `url`. `originAuthorises` (`src/monitoring/origin.ts:88–93`) compares `URL.origin` plus `canonicalOriginPath` and nothing else:

> *"A candidate's query and fragment do not participate … a source whose document identity genuinely turns on a query needs a **new declared matcher kind**, not a loosening of these two."*

Schema refuses non-https (`register.ts:107–109`), credentials (`:110–112`), query (`:113–115`), fragment (`:116–118`), root prefix (`:119–129`). Duplicates refused **per row** (`:181–193`).

### 1.2 Where temporal status already lives — the pack, its watch list, and the site

This evidence settles D-5's ownership question (§6.1) and was missed in the previous draft.

| Location | Form | Status |
|---|---|---|
| `knowledge/csrd/pack.json` → `packFlags` | `{revised_esrs_in_force: false, voluntary_standard_in_force: false}` | **Determination-bearing.** Read by `src/engine/evaluate.ts:91` via `packFlag` |
| `knowledge/csrd/requirements.json` → **CSRD-S-012** | `{"op":"pack_flag","flag":"revised_esrs_in_force"}` inside its `cases[]` | The requirement citing `SRC-007` **already branches on this act's temporal status** |
| `knowledge/csrd/sources.json` → `statusAtSnapshot` | free text — *"Adopted; scrutiny/publication pending — NOT in force at snapshot"* | Unstructured, unvalidated; read only by the frontend regex below |
| `knowledge/csrd/pack.json` → `changeWatch[].status` *(added 2026-09-04)* | `z.string()`; CW-001 and CW-002 carry `adopted_not_effective` beside CW-003 `in_progress` and CW-004 `in_development` | Watch-progress prose borrowing the standing vocabulary for two rows; the four-item array is embedded in both engine goldens. Toothed by B7b (§6.1) |
| `frontend/web/lib/pack.ts:419–423` *(added 2026-09-04)* | `traceSeries` regex-matches `statusAtSnapshot` | A fifth, undeclared derivation of standing from free text; repointed by B-E2 (§6.5.2) |

`pack.json` also carries `legalSnapshot: '2026-07-26'` — the pack is explicitly a point-in-time legal snapshot. **`CorpusDocument` has no status field at all** (`src/corpus/types.ts:41–66`), and the requirement-side enum already exists (`src/knowledge/schema.ts:155`).

### 1.3 The identity chain, traced

| Mechanism | Composition | Commits standing? |
|---|---|---|
| `corpusClosureSha256` | `closure.ts:173` — `JSON.stringify(['doc', id, doc.sha256Normalized])` plus edge lines | **No** |
| `CorpusPin` | `src/verification/corpus-pin.ts:61–69` — `.strict()`, five fields | **No** |
| `requestSha256` | `src/pipeline/request-identity.ts:52–67` — digests `messages[].content` | **Mechanically yes**; nothing renders standing today |
| `pipelineVersion` | `src/pipeline/identity.ts:104–134` — hashes `closurePolicy: {referenceDepth, structuralKinds, referenceKinds}` | **No — and not traversal semantics either** (§6.5.2) |
| Transcript replay | records `corpusClosureSha256`; `pipeline-replay.test.ts:1440` asserts equality | inherits the gap |

### 1.4 The closure API a standing-aware traversal must cross

`computeClosure(index, entryDocIds, policy = CLOSURE_POLICY_V0)` (`closure.ts:96–99`) is **pure over `CorpusIndex`** — no register, no pack; the only `serves` read is `docsForSources` (`:82`).

**`computeClosure`'s production callers: exactly one** — `src/pipeline/entitlement.ts:293`. `src/cli/sign.ts:67` and `src/cli/review-sheet.ts:64` *import* it but never call it; all three CLIs build closures through `EntitledClosure.forSources`. The re-export at `src/index.ts:16` follows the signature. **Eleven** test files call `computeClosure` directly; `test/pipeline-fixtures.ts` mentions it only in a comment (`:105`).

**`EntitledClosure.forSources` is the surface that actually has to change, and it cannot reach the pack today.** `AuthorisedCorpus` is `CorpusCapability & brand` — `index`, `document`, `normalizedText` (`src/corpus/authority.ts:71–88`) — and `authoriseCorpus(corpus, register, pack)` **discards the pack at the door** (`:127–133`). `forSources(source, register, sourceIds, policy?)` (`entitlement.ts:286–291`) therefore has no route to standing. Its **three production callers** must all be crossed:

```
src/cli/sign.ts:343          src/cli/review-sheet.ts:508          src/cli/run.ts:181
```

The pack is already in scope at each (`sign.ts:292`, `review-sheet.ts:496`, `run.ts:151` via `world.pack`), so this is plumbing, not a dead end.

**44 invocations across `src/` and `test/`; 7 already pass a policy; 37 are two-argument.**

### 1.5 Retirement precedent

`replay-fixtures.ts:77` declares `SUPERSEDED_RUN_IDS`; `pipeline-replay.test.ts:199–204` filters it. Its comment (`:73–75`) records that `corpusClosureSha256` did **not** move in the provenance migration. B-E2 would be the **first** retirement to move it. Two runs exist; `run-v1-764e571e…` is already superseded, so B-E2 retires exactly **one**: `run-v1-e77e9d0d…`.

---

## 2. External evidence (Route A)

Retrieved read-only 2026-08-30; bytes passed through `normalize(raw, '#text')` in memory. **Not corroborated by the repository** — §10.1 makes re-verification a mandatory gate.

| | C(2026)5010 | C(2026)5011 |
|---|---|---|
| HTTP / redirects | 200, none | 200, none |
| Content-Type | `text/html; charset=UTF-8` | `text/html; charset=UTF-8` |
| Raw bytes / `sha256Raw` | 1,445,056 / `081b777d84ebca1a…` | 423,175 / `0f1b222ee537a39a…` |
| `normalize(raw,'#text')` | **504,343 chars** / `146f449cf516bedc…` | **112,246 chars** / `0a871b48cc51c9af…` |
| Memorandum / enacting / Annex I / Annex II | 0–22,364 / –29,167 / –383,997 / –504,343 | 0–19,178 / –25,258 / –87,243 / –112,246 |

Truncation probes (`available at`, `download`, `.pdf`, `continued in`) **absent in both**; annexes inline and complete.

**Locators verified verbatim.** 5010 *Article 2(1)(a)* (ESRS version choice — S-012's question) and *Article 3*, which still reads `[O.P.: please insert the date = date of adoption plus 4 months plus 1 week]`. 5011 *Article 3(2)* — *"the value chain cap shall only comprise the datapoints specified in Annex II"* — with Annex II at 87,243 the catalogue table. Decline-right language appears **only in 5011's memorandum** and describes a ***statutory*** right, so S-011's `SRC-001` → *Article 19a(3)* citation is correct as authored.

**Both official titles carry an unassigned number** — `COMMISSION DELEGATED REGULATION (EU) …/...` — further evidence of pre-publication status and the reason §7.1's `versionLabel` is written neutrally.

### 2.1 `PI_COM` — closed

`legal-content/EN/{HIS,ALL}/?uri=PI_COM:C(2026)5010` and `…5011` return HTTP 200 with **byte-identical content** to the `intcom:` views. **No separate internal-procedure record; no objection-period date on any retrieved page.** No deadline inferred from Article 3. Investigation closed by user decision.

**Consequence for E4:** one artefact is reachable under at least three query spellings (literal-paren, percent-encoded canonical, `PI_COM:`). Authority is per declared URL: a different query naming the same document is not authorised unless separately declared. Intended.

### 2.2 Publication state — four negative checks

Commission page verbatim *"not in force until it is published in the Official Journal"* · EUR-Lex metadata shows only `Date of document: 03/07/2026` — **no "Date of effect", no "Date of publication", no CELEX 3-series id** · EUR-Lex search for acts citing *"Delegated Regulation (EU) 2023/2772"* returns `32025R1416, 32023R2772, 32025R0422, 32024L1306, 32025R1176` — **no 2026 regulation** · the unfilled O.P. placeholder. **No OJ/CELEX expression exists as of 2026-08-30.** Re-checked 2026-09-04: the Commission page still says *not in force* for both acts; EUR-Lex could not be read by a non-browser client that day (§2.4).

### 2.3 Size, recorded not judged

`DOC-C2026-5010` at 504,343 chars would be the corpus's **second largest** — 0.57× `DOC-32023R2772` (889,207), 1.87× `DOC-32013L0034` (269,071). `DOC-C2026-5011` at 112,246 would be the smallest. S-012 cites both `SRC-005` and `SRC-007`, so its closure would hold both large documents — on the order of **1.39M rendered characters**. Task 10 recorded S-012's available closure at 889,363 and stated no context conclusion is possible without a named candidate and its tokenizer. Spec §15 is explicit that a context limit may not decide what the law is. **B-T12 records sizes; every context judgment defers to Task 13** (§7.3 C8) — and to the user's decision D-U2 (§11.2), which Task 13 cannot take on its own.

### 2.4 Observation 2026-09-04 — the declared URLs did not serve the artefacts to a non-browser client

Re-checked read-only at the URLs this plan already records (§2, §2.1, §7.1); no URL was constructed. Without a cookie jar, `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=intcom:C(2026)5010` and `…5011` answered **`302 Moved Temporarily`** to `https://eur-lex.europa.eu:443/TodayOJ/index.html?uri=intcom:C(2026)…` — a 13,692-byte Official Journal index page, byte-identical for both (`sha256Raw 6e85709ade11d426…`), containing none of the artefact's strings. With a cookie jar and a browser user agent, the same URLs, the percent-encoded spelling, the `PI_COM` view **and the unrelated `CELEX:32023R2772` view** all answered **`202`** with an identical 2,035-byte body — an interstitial, not a document. The Commission page (register W-004's URL) answered 200 and still reads *"not in force until it is published in the Official Journal"* for both acts.

**What this establishes, and what it does not.** It does not show that the expressions are withdrawn or superseded: the identical 202 body on an unrelated CELEX view marks access control toward non-browser clients, and the Commission page is unchanged. It **does** establish two things this plan had not provided for:

1. **A-0 has a third outcome** — *the declared URL does not serve the artefact* — and B-T12 cannot run while it holds (§10.1 (b)).
2. **Ingest would have stored either response as the artefact.** `fetchDocument` (`src/cli/ingest.ts:114–120`) follows redirects by default and accepts any `response.ok` status, and 202 is `ok`. The raw-reproduces-normalized check passes over an index page or an interstitial, leaving only the locator checks (C4, A-T12-1) between them and the corpus. B-INGEST (§5.4) makes ingest refuse both before any write, whichever way A-0 falls.

The §2 measurements of 2026-08-30 stand as what was served then; they are not re-asserted for today.

---

## 3. Normative corrections — applied by B-NORM, not here

**Thirty-four stale passages across three files** (`#34`–`#35` added 2026-09-04, §0.1). An earlier revision of this plan claimed nine and was wrong: an independent audit found stale normative text outside that set, and a sweep against `018da3f` confirmed every lead and found more. A first B-NORM attempt on 2026-09-01 then **aborted under A-NORM-1**, having applied all thirty rows the map carried at the time: applying them exposed further live contradictions the map did not list, most of them stale text left *on lines the boundary had just edited*. Those findings are folded in here as rows `#32`–`#33` and as changed treatments on **twelve** existing rows — of which four (`#18`, `#23`, `#26`, `#27`) are the fragment-application failures that caused the abort, the other eight being cross-reference, wording and governed-deviation repairs. **B-NORM cannot rely on a broad supersession note while false normative sentences remain live** — each would either survive as a contradiction or trip A-NORM-1 on contact, which is exactly what §3.1 caused, and is why §3.1 now **replaces** rather than annotates.

#### 3.0 The complete passage map

Swept for six defect classes: standing located on `CorpusDocument`/"the corpus" rather than the pack source — **including framing that merely implies that placement**; Task 12 coupled to PDF extraction or to all of E1–E4; four-artefact assumptions; E1 on Route A's critical path; E3 required before an OJ successor exists; stale sequence descriptions.

**A mapped row governs its whole passage, not only the fragment quoted below.** The 2026-09-01 abort was caused by clause-by-clause application: rows `#18`, `#23`, `#26` and `#27` were each discharged by replacing the quoted fragment, leaving stale text alive on the same line. The quoted text identifies the row; the sentence, table cell or paragraph containing it is the unit that must end up true.

**Every line number in this map is a committed-baseline coordinate**, against `80ac013` — before any B-NORM edit. The aborted pass shifted both files (spec `+14`, parent plan `+2`), so against the current working tree those numbers point elsewhere, and several land on a **different mapped row's** passage: baseline spec `:611` (row `#10`, condition 5) is now the §16 head that row `#8` owns, and baseline plan `:528` (row `#23`, the E2 row) is now a table separator. **Locate every passage by its quoted text, never by line number.** That is how the aborted pass was executed, and it is the only method that survives a partially-applied tree.

| # | File | Line | Stale text | Class | Diff |
|---|---|---|---|---|---|
| 1 | spec | `:267` | §6 row B — *"corpus document carrying `adopted_not_effective` status"* | standing-on-corpus | §3.3 |
| 2 | spec | `:291` | §7 Rule — *"representable **in the corpus**"* | standing-on-corpus | **§3.7** |
| 3 | spec | `:341` | §7.1 "Who owns enforcement", both sentences | standing-on-corpus | §3.3 |
| 4 | spec | `:349` | §7.1 — *"it may not enter the corpus until its status is representable"* | standing-on-corpus | **§3.7** |
| 5 | spec | `:394` | §9 `CorpusDocument { legalStatus, … }` | standing-on-corpus | §3.3 |
| 6 | spec | `:473–474` | §12 disposition — SRC-007/008 *"ingest **after** the §16 capability"* | E1-on-critical-path | **§3.7** |
| 7 | spec | `:511–514` | §12.4 the four PDF filenames | four-artefact | §3.1 |
| 8 | spec | `:605` | §16 head — *"may not be ingested until all eight are settled"* | E1-on-critical-path | §3.2 |
| 9 | spec | `:607`, `:609` | §16 conditions **1 and 3** — PDF acquisition; `NORMALIZER_VERSION` bump. *(`:608` is condition 2, which §3.2 **retains**)* | E1-on-critical-path | §3.2 |
| 10 | spec | `:611` | §16 condition 5 — *"One artefact-level classification"* | standing-on-corpus | §3.3 |
| 11 | spec | `:517` | §12.4 — *"served from host `ec.europa.eu`, which is not in the citable host set (F-5). Capability requirements in §16"* | four-artefact + E1-on-critical-path | §3.1 |
| 12 | spec | `:408` | §9 — *"If the OJ text differs from **the adopted PDF**"* | four-artefact (format noun) | **§3.7** |
| 13 | spec | `:777` | §21 D1a-4 row — *"PDF normalization, authority validation…"* | E1-on-critical-path | **§3.7** |
| 14 | plan | `:11` | *"a PDF extractor is a dependency question belonging to envelope E1's sub-plan"* | **not stale** — still true generally; recorded so the sweep is auditable | — |
| 15 | plan | `:7` | *"Thirteen implementation tasks and **four deferred capability envelopes**"* | sequence | **§3.8** |
| 16 | plan | `:9` | *"Class-B capability (E1–E4) is a gated sub-plan boundary"* | sequence | **§3.8** |
| 17 | plan | `:136` | flow diagram — *"OPTIONAL E1–E4 envelopes ─► approved sub-plan ─► T12"* | sequence | **§3.8** |
| 18 | plan | `:143` | Task 13 — *"does not wait on the optional branch"*, **and** the dangling *"if **it** was deferred"* that repair leaves behind | sequence | **§3.8** |
| 19 | plan | `:458` | *"`SRC-007` and `SRC-008` … are Class-B, gated behind envelopes E1–E4"* | sequence + E1-on-critical-path | **§3.8** |
| 20 | plan | `:521` | heading — *"Envelopes E1–E4 — class-B capability (deferred, not implementation-ready)"* | sequence | **§3.8** |
| 21 | plan | `:523` | *"each requires a dedicated implementation sub-plan before execution"* | sequence | **§3.8** |
| 22 | plan | `:527` | E1 row | E1-on-critical-path | **§3.8** |
| 23 | plan | `:528` | E2 row, **both cells** — subject *"`CorpusDocument` **document standing**"*; acceptance *"mutating **either** classification away"*, two where corrected condition 5 carries three | standing-on-corpus | **§3.8** |
| 24 | plan | `:530` | E4 row | capability restatement | §3.4 |
| 25 | plan | `:536` | Task 12 — *"Gated behind E1–E4… Four artefacts (two acts, two annexes)"* | four-artefact + sequence | §3.5 |
| 26 | plan | `:547` | Task 13, **the whole lead** — *"independent of the optional branch"* **and** *"If E1–E4 and Task 12 completed"* | sequence | **§3.8** |
| 27 | plan | `:642` | §5 readiness — *"envelopes E1–E4 and Task 12, which depends on them"*, **and** the next sentence's *"each needs a dedicated sub-plan written when its gate opens"*, false for Task 12 once Route A exists | sequence | **§3.8** |
| 28 | plan | `:687` | sequence table — *"E1–E4 sub-plan, if approved \| D1a-4"* | sequence | **§3.8** |
| 29 | plan | `:703` | Risk 5 — *"If no PDF extractor… E1–E4 and Task 12 stay deferred"* | E1-on-critical-path | **§3.8** |
| 30 | plan | `:717` | audit row — *"E1–E4 are capability envelopes requiring their own sub-plan"* | sequence | **§3.8** |
| 31 | `CLAUDE.md` | `:52–54` | *"must stay at exactly **five** pre-existing hits"* — the gate is **seven** | stale contract | **§3.9** |
| 32 | spec | `:289` | §7 *"The gap this exposes"* — **`CorpusDocument` has no status field at all**… *"nothing about legal effect"*, which reads as locating the remedy on the document | standing-on-corpus (framing) | §3.3 |
| 33 | spec | `:814` | §24 — *"the field names and value set for **document standing** … how **the classification** reaches a role"*, singular against the two-axis model | standing-on-corpus (framing) | §3.3 |
| 34 | plan | `:22` | Global Constraints — *"must stay at exactly **five** pre-existing hits"* — the gate is **seven**; found unmapped by the 2026-09-02 audit | stale contract | **§3.9** |
| 35 | spec | `:4` | Status line — *"revision 4 — complete… No implementation. Nothing ingested"* — true at base `1e16f24`, read as present tense on a document B-NORM annotates | stale framing (state at base) | **§3.10** |

**Thirty-four stale passages plus one verified-not-stale (`#14`) — thirty-five rows.** The unit is **the row**, and one row (`#9`) carries two line references, so §4's spec reference list is longer than its row count by one; both numbers are given there rather than left to be inferred. Rows `#32`–`#33` were added by the 2026-09-01 A-NORM-1 abort, and `#34`–`#35` by the 2026-09-04 repair; all four are appended **out of file order deliberately**, so that every earlier row number stays stable across the reports and diffs that already cite them. Rows were added by four successive sweeps, the later ones after independent audits found the earlier sweeps incomplete — recorded because it is the reason §4 verifies against this table rather than against a remembered total.

B-NORM's file scope in §4 is the operative list.

### 3.1 spec §12.4 — the PDF assumption is superseded

**Replacement, not annotation — corrected 2026-09-01.** An earlier revision proposed only an addition at the end of §12.4 and left `:517` untouched. The aborted B-NORM run applied it exactly, and the false sentence survived two lines above its own retraction — the precise failure §3's opening forbids. The stale sentence is therefore **replaced**; the four PDF filenames at `:511–514` stay as the record of what the Commission page offered, which the correction note reframes.

> **Proposed replacement of `:517`** — the whole sentence, both clauses:
>
> > They were linked as PDFs from host `ec.europa.eu`. **Route A does not ingest them from that surface** — see the correction below. Artefact-origin authority is §19's; §16's PDF conditions are **not invoked** for these two sources (§16 as corrected).
>
> **Proposed addition** immediately after it:
>
> > **Corrected 2026-08-30 — the artefacts are not PDF-only.** This section recorded only the Commission landing page's PDF links, listed above as the record of what that page offered. EUR-Lex serves both adopted acts as **complete HTML expressions including their annexes**, which the existing `NORMALIZER_VERSION 1.0.2` extractor handles with the `#text` selector — verified at `89b0b86`. Route A ingests those expressions. The retired sentence also claimed `ec.europa.eu` *"is not in the citable host set (F-5)"*: **F-5's host rule was retired at Task 5** (`src/monitoring/register.ts:312`), so that claim had already stopped being true on its own terms, and `ec.europa.eu` is not the serving host under Route A either.

### 3.2 spec §16 — scope, not retirement

> **Proposed addition** to the head of §16:
>
> > **Scope, corrected 2026-08-30.** **Conditions 1 and 3 are PDF-specific: they govern only an artefact for which no official machine-readable expression exists.** `SRC-007` and `SRC-008` are not such artefacts (§12.4 as corrected), so those two are **not invoked**. The remaining conditions are format-independent and govern every Class-B artefact, Route A's included.
> >
> > Condition **2** applies, read in HTML terms rather than PDF ones: the raw/normalized hash split is retained exactly as it is for every other document — `sha256Raw` over the bytes as served, `sha256Normalized` over the extracted text. Conditions **4, 6 and 8 apply unchanged**. Condition **5 is amended in place below**, per the Route A sub-plan's §3.3.
> >
> > Condition **7** (lifecycle and supersession metadata) is **settled as not-yet-applicable rather than unmet**: no OJ successor exists, so there is no lifecycle relation to record. The head's *"may not be ingested until all eight are settled"* is satisfied — a condition with no subject is settled by that fact, and it reopens the moment an OJ expression appears.

### 3.3 spec §16 condition 5, §7.1's enforcement paragraph, §9, §6's mapping table, §7's gap paragraph and §24 — one collapse, six times

§7.1 fixes three axes and states *"no field may answer two"*, assigning temporal status to the **instrument**. Six other passages then assign it to the **artefact**, or frame it as though they did — the last two found by the 2026-09-01 abort:

| Passage | Offending text |
|---|---|
| §16 condition 5 | *"One artefact-level classification answering two adjacent questions"* |
| §7.1 "Who owns enforcement" | *"the artefact-level classification…"* (sentence 1) and *"put a document-level field on `CorpusDocument`"* (sentence 2) |
| §9 | its `CorpusDocument` code block, which lists `legalStatus` beside the lifecycle relation *(paraphrased — the others in this column are verbatim)* |
| §6 mapping table, row B | *"`legal_record` row + corpus document carrying `adopted_not_effective` status"* |
| §7 *"The gap this exposes"* (`:289`) | *"**`CorpusDocument` has no status field at all**… nothing about legal effect"* — accurate about today's code, but bolded as *the* gap it reads as locating the remedy on the document |
| §24 (`:814`) | *"the field names and **value set** for document standing… how **the classification** reaches a role"* — singular where the corrected design has two fields on two axes |

> **Proposed replacement — §16 condition 5:**
>
> > 5. **Document standing, reaching verification** — temporal legal status (§7) **and** serving-artefact authenticity (§7.1), carried as **two fields on two axes**: temporal standing per instrument in the knowledge pack, authenticity per artefact on the corpus document (§9 as corrected). A role is shown a derived projection of both. No single field answers both questions.
> >
> >    **A third distinction rides with them, and is normative rather than an implementation detail: within a composite artefact, official explanatory material is not operative provision.** An artefact may lawfully carry both — an explanatory memorandum ahead of the enacting terms — and neither of the two axes above says so: temporal standing answers *when the instrument takes effect* and authenticity answers *what kind of artefact this is*, and both apply equally to every part of the document. A role must therefore be told, per artefact, which sections are non-operative, and that statement must be committed by the same identity mechanisms as the other two. Where an artefact serves sources of differing standing, the statement must say that legal effect differs by served source.
> >
> >    **This is a within-artefact region annotation, not a fourth standing axis.** §7.1's three dimensions — source authority, serving-artefact authenticity, temporal legal status — each classify a whole object, and each remains exactly as §7.1 states it. Non-operative sections partition *within* a single artefact, which is why neither document-level axis can express it, and why §7.1's *"no field may answer two"* is unweakened rather than superseded. §7.1's heading and its three-dimension block are **not** stale and are not on §3.0's map.
>
> **Proposed replacement — the whole "Who owns enforcement" paragraph of §7.1** (both sentences; the collapse appears in each — *"artefact-level classification"* in the first, *"document-level field on `CorpusDocument`"* in the second, so replacing either alone leaves it standing):
>
> > **Envelope E2**, widened from *temporal legal status* to **document standing**: the classification that must reach verification so that no role mistakes an official reading for the authentic text, nor an adopted act for effective law, **nor official explanatory material for an operative provision**. E2 places **authenticity on `CorpusDocument`** and reads **temporal standing from the knowledge pack**, which already owns it, deriving the role-facing projection from both, and carries the artefact's own statement of which sections are non-operative. Authenticity belongs on the artefact because it is a property of the artefact; temporal status belongs to the instrument and is therefore read from the pack rather than copied onto every artefact that serves it.
>
> **Proposed replacement — the `CorpusDocument` block of §9:**
>
> > **Corrected 2026-08-30, per decision D-5 of the Route A sub-plan** (`docs/superpowers/plans/2026-08-30-d1a-route-a-class-b.md`). Storage follows §7.1's axis assignment:
> >
> > ```
> > knowledge pack (sources)   temporalStanding      per instrument
> > CorpusDocument             artefactAuthenticity  per artefact
> > CorpusDocument             lifecycle identity / successor–predecessor  (E3, deferred)
> > ```
> >
> > A role is shown a derived projection combining both, assembled at entitlement and never stored pre-combined. Neither field may be derived from the other, and neither may be inferred from `versionLabel`.
>
> **Placement (added 2026-09-04).** The corrected block sits **above** §9's lead-in *"Required semantics, carried by document-level lifecycle metadata rather than by the edge graph:"*, so the lead-in still introduces the semantics block it was written for. The frozen tree has the block between the lead-in and the semantics, and its opening reads *"Corrected 2026-08-30 (D-5)"* without the attribution above; the resumed pass fixes both.
>
> **Proposed replacement — §6 mapping table, row B:**
>
> > | B — adopted, not yet in force | `legal_record` row + corpus document whose **artefact authenticity** is recorded, with the instrument's `adopted_not_effective` **temporal standing held in the knowledge pack** (§7, §9) |

> **Proposed addition — §7's "The gap this exposes" paragraph (`:289`, row `#32`).** The paragraph is **not replaced**: every clause in it is true, `CorpusDocument` genuinely has no status field (`corpus/types.ts:41`, verified 2026-09-01), and the closing sentence states the real gap — that standing does not reach the reader. What it lacks is any statement of *where* the remedy goes, so a reader meeting the bolded absence before `:291` infers a legal-status field on the document, which D-5 forbids. One sentence is appended:
>
> > *(Corrected 2026-08-30: the absence recorded here is real and still true, but it does not locate the remedy. Under §7.1 and §9 as corrected the remedy is **split by axis** — artefact authenticity is added to `CorpusDocument`; temporal standing is held per instrument in the knowledge pack and never copied onto the artefacts serving it. The gap this paragraph names is that standing does not reach the reader, not that `CorpusDocument` lacks a legal-status field.)*

> **Proposed replacement — §24's document-standing bullet (`:814`, row `#33`):**
>
> > - the field names for **document standing** — carried as **two fields on two axes** (§7.1, §9 as corrected): serving-artefact authenticity per artefact, temporal standing per instrument in the knowledge pack — together with the artefact's own statement of which sections are non-operative, and how each of the three reaches a role (envelope E2).

### 3.4 parent plan — restate E4

> | **E4** | **Generic full-URL exact artefact origin** (`exact_query`) | A source whose artefact identity lives in a URL query can declare it exactly. Scheme, host, port, path **and complete query** compared together, under an injective canonical key. No host, regex or glob kind; no host or scheme-specific identifier in production code |

### 3.5 parent plan Task 12 — four artefacts becomes two

Parent plan `:536` reads *"Four artefacts (two acts, two annexes), same shape and same ingestion invariant as Tasks 6–9, plus: the `adopted_not_effective` status asserted through the production path, and S-011's cap-catalogue dependency shown to resolve to the annex."* Route A ingests **two**, each carrying its act *and* both annexes.

> **Proposed replacement:**
>
> > Gated behind the Route A sub-plan's boundaries being approved and green. **Two artefacts** — one complete HTML expression per act, each carrying its enacting terms and both annexes — same ingestion invariant as Tasks 6–9, plus: the instrument's `adopted_not_effective` standing asserted through the production path, and S-011's cap-catalogue dependency shown to resolve to **Annex II within the same artefact**.

*(**§3.6 is retired.** It proposed a standalone corrected-sequence note routed from no row of §3.0's map — the map B-NORM treats as operative — so it was an instruction with no source insertion point and no route to an applying boundary. Its content is folded into §3.8's `:136` correction, the row that actually carries the sequence repair. The heading number is retired rather than reused, so §3.0's routing, §3.8's fourteen passages and §4's counts are all unchanged.)*

### 3.7 spec §7's two "in the corpus" sentences, §12's disposition rows, and §21's D1a-4 row

> **§7 Rule (`:291`) — proposed replacement:**
>
> > **Rule:** an adopted-not-effective artefact may enter the corpus only when its temporal status is **representable and reaching verification** — held on the instrument in the knowledge pack (§9 as corrected), projected to every role beside the artefact's own authenticity — so no role can treat a future act as current operative law. Until then the requirement citing it halts, and that halt is correct.
>
> **§7.1 (`:349`) — proposed replacement:**
>
> > §7 gates an **adopted-not-effective** artefact: it may not enter the corpus until its status is representable **and reaches verification**, because a role shown that document would read a future obligation as a current one.
>
> **§12 disposition rows (`:473–474`) — proposed replacement of the middle cell in both:**
>
> > ingest under Route A once **document standing (E2) and artefact origin (E4)** are in place; §16's PDF conditions are not invoked (§12.4, §16 as corrected)
>
> **§9 (`:408`) — replace the *first sentence only*; the paragraph's second sentence (*"Exact field names are implementation-plan work; the semantics above are not."*) is untouched:**
>
> > If the OJ text differs from the **adopted text**, **both are preserved**, and the later artefact becomes the current legal record according to its temporal status.
>
> *(Route A's adopted artefacts are HTML expressions; "the adopted PDF" was written when only the Commission PDFs were in view. The preservation rule itself is unchanged and §8's B-OJ cascade depends on it.)*
>
> **§21 D1a-4 row (`:777`) — proposed replacement:**
>
> > | **D1a-4** | Adopted-not-effective corpus capability: **document standing**, artefact-origin authority, lifecycle metadata (§7, §9, §19). **PDF normalization belongs to §16 and is not invoked where an official machine-readable expression exists** |

### 3.8 parent plan — the E1/E4 gating cluster

**Fourteen passages.** Thirteen assert together that Task 12 waits on all four envelopes and on a PDF extractor; the fourteenth (`:528`, the E2 row) is a **standing-on-corpus** repair that lands here because it sits inside the same envelope table and would otherwise be edited twice. Every row §3.0 routes here has a diff below — an earlier revision listed seven and left four routed rows with no correction, which would have tripped A-NORM-1 on contact.

> **`:7` architecture header** — replace *"Thirteen implementation tasks and **four deferred capability envelopes**"* with *"Thirteen implementation tasks and **two deferred capability envelopes (E1, E3)**; E2 and E4 are on Route A's critical path."*
>
> **`:9` readiness header** — replace *"**Class-B capability (E1–E4) is a gated sub-plan boundary, not a set of implementation-ready tasks** — see §5"* with *"**Class-B capability is split: E2 and E4 are planned and approved under Route A; E1 and E3 remain gated sub-plan boundaries** — see §5."*
>
> **`:136` flow diagram** — replace the `OPTIONAL E1–E4 envelopes ─► approved sub-plan ─► T12` branch with `ROUTE A  B-NORM ─► B-E2 ─► B-E4 ─► B-T12   (E1, E3 deferred)`, and record beneath the diagram what the redrawn branch no longer spells out, carrying the same **Corrected** prefix the other in-place notes use: *"**Corrected 2026-08-30.** Task 12 proceeds under Route A via `docs/superpowers/plans/2026-08-30-d1a-route-a-class-b.md`, sequence `B-NORM → B-E2 → B-E4 → B-T12`, the last two conditional on that plan's publication gate. **E1 is not on Task 12's critical path** and E3 is deferred until an OJ successor exists."* Row `#17` **is** the sequence repair, so the corrected-sequence note lands with it rather than standing alone. This absorbs the retired §3.6: it adds **no** row. *(Order corrected 2026-09-04 with §11's re-sequencing; the frozen tree carries `B-E4 → B-E2` and row `#17` is therefore pending again — §4.)*
>
> **`:143` Task 13 framing** — replace *"does not wait on the optional branch"* with *"does not wait on the deferred envelopes (E1, E3)"*, and the conditional *"If class-B capability was approved and completed"* with *"If Route A's boundaries and Task 12 completed"*. **Then repair the pronoun the second replacement strands:** *"if **it** was deferred"* becomes *"if **they** were deferred"*, its antecedent (*"the optional branch"*) having been removed by this same edit. The paragraph's closing sentence — *"An explicitly optional capability must not become a release dependency by accident of drawing"* — **stays**, and the reason is worth stating because the `:547` correction below condemns text for pointing at a branch the diagram no longer draws: this sentence points at no branch. It states a **rule about drawing**, and the rule still binds — E1 and E3 are explicitly optional capabilities, and the corrected `:136` diagram still carries them as *"(E1, E3 deferred)"*. It is therefore not on the map.
>
> **`:458` what-that-leaves** — replace *"they are Class-B, **gated behind envelopes E1–E4**, and belong to Task 12"* with *"they are Class-B and belong to Task 12, which under Route A depends on **E2 and E4 only** (§12.4 as corrected)."*
>
> **`:521` envelopes heading** — replace *"Envelopes E1–E4 — class-B capability (deferred, not implementation-ready)"* with *"Envelopes E1–E4 — class-B capability (**E2 and E4 planned under Route A; E1 and E3 deferred**)"*.
>
> **`:523` the "not tasks" paragraph** — narrow it to the deferred pair: *"**E1 and E3 are capability envelopes, not tasks.** Each states the spec's acceptance conditions and its gate, and each requires a dedicated sub-plan before execution — writing file lists and mutants for them now would be speculation about a dependency that has not been selected. **E2 and E4 have such a sub-plan** (`docs/superpowers/plans/2026-08-30-d1a-route-a-class-b.md`), so this paragraph no longer governs them."*
>
> **`:527` E1 row** — append: *"**Not on Route A's critical path** — invoked only for an artefact with no official machine-readable expression (§12.4 as corrected)."*
>
> **`:528` E2 row — replace the whole row, both cells.** Substituting only the subject fragment leaves an ungrammatical clause and a tail restating what the new text already says, and leaves the acceptance cell counting **two** classifications where corrected condition 5 carries **three**. The cross-reference is written *spec §9* because the parent plan has its own `## 9. Self-review`:
>
> > | **E2** | **Document standing** reaching verification — artefact authenticity on `CorpusDocument`, temporal standing on the knowledge-pack source (**spec** §9 as corrected), and the artefact's own statement of which sections are non-operative | No role can read an `adopted_not_effective` document as current law, nor an official consolidation as the authentic publication, nor official explanatory material as operative provision; mutating **any of the three** away reds a run-level assertion |
>
> **`:547` Task 13 — replace the whole lead sentence and its conditional**, not the conditional alone. The 2026-09-01 run replaced only the conditional; *"independent of the optional branch"* survived on the same line, contradicting the corrected `:143` and pointing at a branch the corrected `:136` diagram no longer draws:
>
> > **Runs after all required work, independent of the deferred envelopes (E1, E3).** If Route A's boundaries and Task 12 completed, it measures with `SRC-007`/`SRC-008` represented and their temporal status recorded. If they were deferred, it measures both as residual gaps, records that the inability to represent adopted-not-effective evidence is itself the truthful finding, and **D1(a) completes**.
>
> **`:642` §5 readiness — the whole paragraph (prescription corrected 2026-09-04, R-1).** The first replacement — *"envelopes E1–E4 and Task 12, which depends on them"* → *"envelopes E1 and E3, and Task 12, which depends on E2 and E4 only"* — is applied in the frozen tree and stands. The previous revision's second replacement wrote *"this sub-plan's B-T12"* **into the parent plan**, where *this sub-plan* denotes the parent plan itself, and left the paragraph's closing sentence live and false for Task 12; applying it would have re-fired A-NORM-1. The paragraph's second and third sentences are replaced together:
>
> > They carry the spec's acceptance conditions and a gate. E1 and E3 each need a dedicated sub-plan written when their gate opens; Task 12's sub-plan exists — boundary B-T12 of `docs/superpowers/plans/2026-08-30-d1a-route-a-class-b.md`. Claiming implementation-readiness for E1 or E3 would put speculative file lists and mutants against a dependency nobody has selected.
>
> Leaving the old second sentence would assert Task 12 still lacks a sub-plan, two pages after `:523` records that it has one; leaving the old third would condemn Task 12's own file lists.
>
> **`:687` sequence table** — replace *"E1–E4 sub-plan, if approved | D1a-4"* with *"Route A sub-plan (B-NORM, B-E2, B-E4) | D1a-4"*. *(Order corrected 2026-09-04 with §11; the frozen tree carries `(B-NORM, B-E4, B-E2)`, so row `#28` is pending — §4. An enumeration in a sequence table is a sequence claim.)*
>
> **`:703` Risk 5** — replace with: *"**Risk 5 — E1's dependency, no longer on the critical path.** Route A ingests official HTML expressions, so Task 12 does not wait on a PDF extractor. E1 reopens only if an artefact has no machine-readable expression; a residual gap on such an artefact remains a truthful finding."*

> **`:717` audit row** — replace *"E1–E4 are capability envelopes requiring their own sub-plan"* with *"E1 and E3 are capability envelopes requiring their own sub-plan; E2 and E4 are planned under the Route A sub-plan"*.

---

### 3.9 root `CLAUDE.md` — the CSRD grep contract

**A stale contract with no owner, and this plan takes ownership rather than leaving it as an observation.** `CLAUDE.md:52–54` states the program-agnosticism gate must stay at *"exactly **five** pre-existing hits: `types.ts` (1), `cli/assess.ts` (1), `verification/render.ts` (2), `engine/summary.ts` (1)"*. The established gate — asserted by this plan's §1, by Task 10's report and by every recent boundary — is **seven**. Verified at `018da3f`: `grep -ri csrd backend/engine/src/ | wc -l` = **7**.

> **Proposed replacement for the count and its enumeration.** The two additional hits are identified here rather than left for B-NORM to discover: **`src/monitoring/types.ts:113`** and **`src/monitoring/register.ts:83`**, both docstring sentences reading *"twelve of seventeen CSRD sources share `eur-lex.europa.eu`"* — program-agnosticism-compliant prose explaining why a host matcher is no permission. The corrected contract reads **seven**, enumerated as `types.ts` (1), `cli/assess.ts` (1), `verification/render.ts` (2), `engine/summary.ts` (1), `monitoring/types.ts` (1), `monitoring/register.ts` (1). **The correction states the true count; it does not license new hits** — and that clause is carried **into the file itself** as a closing sentence, not left only here: *"The count states the true pre-existing total; it does not license new program-specific references."* A contract that states a number without stating its own limit invites the next boundary to read the number as headroom.

**This is the one B-NORM passage outside the parent spec and parent plan**, and it is included deliberately: leaving a documented gate contradicting the gate every boundary actually runs is the same defect class as the rest of §3, one file over. If the user prefers, it can be split into a preceding micro-boundary — but it must not stay unowned.

> **Parent plan `:22` (row `#34`, added 2026-09-04, R-2) — proposed replacement of the whole bullet:**
>
> > - **Program-agnostic.** `grep -ri csrd backend/engine/src/` must stay at exactly **seven** pre-existing hits: `types.ts` (1), `cli/assess.ts` (1), `verification/render.ts` (2), `engine/summary.ts` (1), `monitoring/types.ts` (1), `monitoring/register.ts` (1). The count states the true pre-existing total; it does not license new program-specific references.

Four earlier plans also say *five* (`2026-08-21-status-truth-boundary.md:17`, `2026-08-21-b1b-ii-b-signing-surfaces-migration.md:23`, `2026-08-21-public-resolver-seam.md:19`, `2026-08-21-b2-pipeline.md:30`). They are dated records of finished boundaries whose base genuinely had five and are **not** on the map: a plan's Global Constraints describe the tree it was executed against.

### 3.10 spec status line — state at base, not present tense (row `#35`)

Spec `:4` reads *"Design, revision 4 — complete. §7.1 added 2026-08-27… No implementation. Nothing ingested, no requirement edited, no schema changed, no PDF support written."* Every clause was true at base `1e16f24`; read today, after Tasks 4–10, the last sentence is false, and *complete* sits above a document carrying dated corrections. The audit recommended a *"State at <sha>"* marker rather than a seventh defect class; one sentence does it.

> **Proposed addition** at the end of `:4`:
>
> > **State at base `1e16f24`.** The present-tense clauses above describe that tree; Tasks 4–10 have since landed. Passages carrying a dated correction note are governed by `docs/superpowers/plans/2026-08-30-d1a-route-a-class-b.md` §3.

The parent plan's header already dates itself against its base and needs no equivalent.

---

## 4. Boundary B-NORM — apply the normative corrections

**Docs only.** The code must not be implemented against normative text this plan declares contradictory.

- **Files — three, and the passage list is §3.0's map, not a summary of it:**

  | File | Rows |
  |---|---|
  | `docs/superpowers/specs/2026-08-24-d1a-corpus-provenance-design.md` | `#1`–`#13`, `#32`, `#33`, `#35` — 16 rows, 17 line references (`#9` carries `:607` and `:609`) |
  | `docs/superpowers/plans/2026-08-24-d1a-corpus-provenance.md` | `#14`–`#30`, `#34` — 18 rows, one of them (`#14`) verified not stale |
  | `CLAUDE.md` | `#31` |

- **The state of the frozen tree, verified row by row on 2026-09-04** (the previous ledger — eighteen final, twelve to re-apply — was wrong and is withdrawn):

  | Disposition | Rows |
  |---|---|
  | **Already in final form — must come out byte-identical (20)** | `#1` `#2` `#3` `#4` `#6` `#8` `#9` `#12` `#13` `#15` `#16` `#19` `#20` `#21` `#22` `#24` `#25` `#29` `#30` `#31` |
  | **No change by design (2)** | `#7` (the four filenames stay), `#14` (not stale) |
  | **Pending (13)** | `#5` §9 block — attribution and placement (§3.3) · `#10` condition 5 — third paragraph missing (§3.3) · `#11` `:517` — the stale sentence still stands two lines above its retraction; replace it and bring the note to §3.1's text · `#17` `:136` — diagram and note carry the old `B-E4 → B-E2` order (§3.8) · `#18` — *"if it was deferred"* → *"if they were deferred"* · `#23` — E2 row, both cells · `#26` — Task 13 lead sentence · `#27` — §5 readiness, second and third sentences (§3.8 as corrected) · `#28` `:687` — sequence-table enumeration carries the old order (§3.8) · `#32` §7 gap paragraph · `#33` §24 bullet · `#34` parent plan `:22` (§3.9) · `#35` spec `:4` (§3.10) |

- **No code, no schema, no data, no test changes. No engine gate may move.**
- **Evidence — checks that can fail, not a prose ledger.** A docs boundary has no runtime behaviour to red, so its evidence is the diff and the residue. All of the following must hold before the boundary is reported:

  ```
  git diff --stat                              → exactly the three files above
  cd backend/engine && npx vitest run          → 54 files / 1574 tests  (unchanged from b40dcf6)
  npm run typecheck                            → exit 0
  grep -ri csrd backend/engine/src/ | wc -l    → 7
  ```

  Residue, as `grep -c` per file (S = spec, P = parent plan, C = root `CLAUDE.md`):

  | Fragment | S | P | C |
  |---|---|---|---|
  | `optional branch` | 0 | 0 | 0 |
  | `if it was deferred` | 0 | 0 | 0 |
  | `if they were deferred` | 0 | 1 | 0 |
  | `mutating either classification` | 0 | 0 | 0 |
  | `mutating any of the three` | 0 | 1 | 0 |
  | `gated behind envelopes E1` | 0 | 0 | 0 |
  | `One artefact-level classification` | 0 | 0 | 0 |
  | `document-level field on` | 0 | 0 | 0 |
  | `adopted PDF` | 0 | 0 | 0 |
  | `exactly \*\*five\*\*` | 0 | 0 | 0 |
  | `exactly \*\*seven\*\*` | 0 | 1 | 1 |
  | `does not license` | 0 | 1 | 1 |
  | `the classification reaches a role` | 0 | 0 | 0 |
  | `two fields on two axes` | 2 | 0 | 0 |
  | `not a fourth standing axis` | 1 | 0 | 0 |
  | `does not locate the remedy` | 1 | 0 | 0 |
  | `not in the citable host set` | 1 *(inside §3.1's note only)* | 0 | 0 |
  | `Corrected 2026-08-30` | 3 *(§12.4, §9, §7 gap)* | 1 *(`:136`)* | 0 |
  | `deferred envelopes (E1, E3)` | 0 | 2 | 0 |
  | `B-NORM → B-E2 → B-E4 → B-T12` | 0 | 1 | 0 |
  | `B-NORM → B-E4` | 0 | 0 | 0 |
  | `B-NORM, B-E2, B-E4` | 0 | 1 | 0 |
  | `B-NORM, B-E4, B-E2` | 0 | 0 | 0 |
  | `boundary B-T12 of` | 0 | 1 | 0 |
  | `State at base` | 1 | 0 | 0 |

  A count off by one is a failed boundary, not a note.
- **Resuming over the partially-applied tree.** This plan repair is committed first, on its own; the frozen pass then remains the only uncommitted change, so B-NORM's own `git diff --stat` is again exactly the three files above. The resumed pass verifies **each row's final text against §3** by quoted-text anchor, never by line number (§3.0), and touches no row in the *already final* set.
- **Abort A-NORM-1:** if applying a correction reveals a *further* contradiction not listed in §3 — including stale text surviving beside a corrected fragment in the same passage — stop and report rather than widening the diff. It fired on 2026-09-01; its unit is the whole mapped passage.
- **Commit boundary:** one commit. *Say once where standing lives.*

### 4.1 Boundary B-FIX-WITNESS — synthetic witnesses before the corpus moves (conditional, test-only)

**Purpose.** Every ingestion since Task 5 has repointed four to seven test files because real source ids play fixture roles: `SRC-007` is *undeclared*, `SRC-012` *unclassified*, `SRC-004` *uncited*, S-011/S-012 *the gap-bearing pair*. B-T12 would repoint them again, and B-E2's B9 reds `pipeline-closure-citability.test.ts:244–254` because `SRC-012` is a non-instrument with no standing. Retargeting before the corpus moves keeps the retarget behaviour-preserving; doing it inside B-E2 or B-T12 mixes it with an identity move or a partition change.

**Go/no-go is decided after B-NORM**, and the boundary is taken only if every retarget is behaviour-preserving **and every synthetic witness can be shown red against its named defect**. A witness that cannot red is not moved; it is reported.

| Scope (tests only) | Change |
|---|---|
| `test/corpus-authority.test.ts:97–116` · `test/corpus-authority-roots.test.ts:101, :126–142` · `test/corpus-ingest.test.ts:556–566, :655–685` · `frontend/web/test/pack-authority.test.ts:102–108` | the *undeclared cited source* witness moves from `SRC-007` to a synthetic `SRC-9xx` declared through a scratch register, with the refusal **reason** pinned, not only its subject |
| `test/pipeline-closure-citability.test.ts:221–254` | the multi-source fixtures move to a synthetic register, so they no longer depend on `SRC-007` being undeclared in the committed one |
| `test/pipeline-source-completeness.test.ts:730, :738` | a non-vacuity guard: an `it.each` over a live-derived array asserts the array is non-empty, or names the class it expects to be empty |
| `test/pipeline-replay.test.ts:207–212` | `superseded()` → `supersededById(runId)`; call sites `:1724`, `:1754`, `:1774` |
| `test/source-register.test.ts:418` | import `AUDIT_EXPECTED_UNIVERSE` from `test/audit-expected-provenance.ts` instead of hand-copying it |

**Evidence.** `npx vitest list --run` in **both** workspaces before and after: the name set is identical, or every difference is dispositioned by name; no file under `src/` changes; every moved witness is shown red against its named defect once. Gates unchanged.

**Abort A-FIX-1:** a red that is not the retargeted test itself, or a name that disappears without a disposition — stop; the boundary is behaviour-preserving or it is not taken.

**Commit boundary:** one commit. *Let a witness keep its subject when the corpus moves.*

---

## 5. Boundary B-E4 — `exact_query`

Spec §19; parent plan E4 as restated. **No corpus data, no pack data, no identity moves.**

### 5.0 Semantics (corrected 2026-09-04 — R-8, R-9)

Additive for the committed rows: the four `exact` / `path_prefix` declarations and every URL in `corpus/index.json` — all ELI paths, none carrying a query (verified 2026-09-04) — behave identically after the change. **One rule about queries applies across all three kinds**, not a carve-out per kind:

| Rule | Decision |
|---|---|
| Scheme / credentials | https only; no credentials — on **both** sides. The declaration side inherits `register.ts:107–112`; the candidate side is new (§5.1) |
| Host / port | `URL.origin` — folds host case and a default `:443` |
| Path | `canonicalOriginPath` — trailing slash settled, case preserved |
| **Candidate query under `exact` / `path_prefix`** | **Refused.** A recorded URL carrying a query is not covered by a path-kind declaration. Today `originAuthorises` ignores it (`origin.ts:88–93`), so an `exact` row at a query-routed path would authorise every `?uri=` document for that source — host authority wearing a path. `corpus-authority.test.ts:233–237` asserts the old acceptance and is inverted |
| **Query under `exact_query`** | **Raw `URL.search`, compared exactly** after parsing. No decoding, no reordering, no multiset. A declaration authorises the one spelling it names; `C%282026%295010` and `C(2026)5010` are two declarations if both are wanted. B-T12 declares and fetches one spelling per artefact (§7.1) and ingest records `--url` verbatim, so nothing needs equivalence |
| Fragment | refused on both sides |
| Empty query | a declaration of this kind whose `search` is `''` is refused — it would be `exact` renamed. `?` alone parses to `''` and is refused; `?&&` is non-empty and authorises exactly that spelling, which is harmless and is documented |
| Canonical key | `canonicalOriginKey` becomes `JSON.stringify([kind, origin, canonicalPath, search])`. Injective because `search` is one string, not a delimiter-joined list; JSON for uniformity with `closure.ts:157–162`, not as a bug fix — the concatenated form has no collision and no tooth pretends otherwise. A10 guards the re-encoding against regression |

**Withdrawn:** the decoded-pair multiset, its comparator, `canonicalQueryKey`, percent-encoding equivalence (old A5), reordering (old A6), the injectivity cases (old A9) and mutations M-A3 / M-A4. *Rejected alternative, recorded:* decoded comparison collapses three spellings into one permission — a convenience with an unspecified comparator (`Array.sort()` string-coerces pairs and breaks the promised order-insensitivity) that authorises spellings nobody declared. If a future source genuinely needs equivalence, that is a fourth kind with its own decision, not a loosening of this one.

**Per C-1, no cross-source uniqueness rule is added.**

### 5.1 Files

| File | Change |
|---|---|
| `src/monitoring/types.ts` | third union member `exact_query`; docstring carries the query, fragment, injectivity and edge-case rules |
| `src/monitoring/origin.ts` | `originAuthorises`: refuse a candidate query under the path kinds; compare raw `search` under `exact_query`; `canonicalOriginKey` re-encoded as a JSON tuple |
| `src/monitoring/register.ts` | zod enum member; `superRefine` permits a query **for this kind only**, still refuses fragments, refuses a queryless declaration of this kind |
| `src/corpus/schema.ts` | `CorpusDocument.url` is `z.string().url()` (`:48`) and accepts a fragment and credentials today — the candidate-side refusal of both lands here |
| `test/source-register.test.ts` | schema acceptance and refusals |
| `test/corpus-authority.test.ts` | the refusal matrix, including the candidate-query refusals under the path kinds |
| `test/corpus-authority-roots.test.ts` | composition roots still validate |
| `test/corpus-ingest.test.ts` | ingest preflight refusal before any write (A11) |
| `test/corpus-schema.test.ts` | candidate-side fragment refusal |

### 5.2 Teeth — each able to red alone

Fixtures generic; no EUR-Lex host or `intcom` literal in production code.

- **A1** A declaration for *X* refuses *Y* on the same path with a different query value.
- **A2** Refuses a queryless URL on the declared path.
- **A3** Refuses the same query on a different host, and on a different path.
- **A4** Refuses an added, a removed, a duplicated (`?a=1&a=1` ≠ `?a=1`) and a mutated parameter.
- **A5** A candidate URL carrying a query is refused under `exact` **and** under `path_prefix`, with the queryless sibling accepted in the same test (evidence-standard rule 7).
- **A6** Under `exact_query`, a different spelling of the same decoded query (`C%282026%295010` against `C(2026)5010`) is refused — one declaration, one spelling — and the identical spelling is accepted beside it.
- **A7** Fragment refused on the declaration side **and** the candidate side.
- **A8** A declaration of this kind with no query is refused.
- **A9 — canonical key.** Two `exact_query` declarations differing only in `search` produce different keys and are not duplicates; two spellings of one URL (host case, `:443`, trailing slash) produce one key and are refused as duplicates in a row.
- **A10** **Existing origins unchanged:** the four committed rows and their tests behave byte-identically; `SRC-001`'s `path_prefix` still refuses `/eli/dir/2013/345`.
- **A11** **Ingest refuses before any repository write** when a declaration is absent: assert the refusal *and* that `index.json`, `raw/` and `normalized/` are byte-unchanged.

### 5.3 Mutations

| | Mutation | Expected first red |
|---|---|---|
| M-A1 | New branch ignores the query (falls back to path equality) | A1, naming the source and both documents — not a golden diff |
| M-A2 | Accept a superset of declared parameters | A4's added-parameter case |
| M-A3 | Ignore the candidate query under the path kinds — today's behaviour | A5 |
| M-A4 | Compare decoded `searchParams` instead of raw `search` | A6 |
| M-A5 | Drop the query from `canonicalOriginKey` | the per-row duplicate test |
| M-A6 | Widen `exact` to ignore path boundaries | A10 |

### 5.4 Network — N-2 kept; and **Boundary B-INGEST**, carved out of B-E4 (D-11, R-10; review 2026-09-04)

`src/cli/ingest.ts` fetches at `:190`; the authority preflight `assertCorpusAuthority` runs at `:265`. So an unauthorised ingest still performs **one fetch before refusing**, and "no network call occurred" is **not** provable under the current control flow. Per D-11, **N-1** — moving the origin check ahead of `fetchDocument` — remains deferred hardening. **A11's no-write guarantee is mandatory and unaffected.**

**What changes is what a fetch may return — and it changes in its own boundary, B-INGEST, not in B-E4.** B-E4 runs only if A-0 reads *served*; under A-0 (a) the OJ artefact would be ingested through the same `fetchDocument` by B-OJ event 1, so the response rules must not sit in a route-conditional boundary. B-INGEST is unconditional, lands after B-E2 and before A-0 whichever way A-0 falls (§11), touches `src/cli/ingest.ts` and `test/corpus-ingest.test.ts` only, and moves no identity. On 2026-09-04 the declared URLs answered a 302 to an index page and 202 interstitials (§2.4); `fetchDocument` (`:114–120`) would have accepted both — it follows redirects by default and tests `response.ok`, which is true for 202. A response is the artefact only if the declared URL answered it directly:

- `fetch(url, { redirect: 'manual', … })`; any 3xx is refused with its `Location` in the error, and nothing is written. The authority preflight runs over `--url`; a redirect target is a different surface nobody declared, and following it would authorise by request rather than by response.
- status **200** exactly; any other status is refused. `response.url` is then the request URL by construction and is asserted anyway.
- the `index.json` read (`:220–224`) catches **only** `ENOENT`. Any other failure is a refusal: an index that cannot be parsed must not be replaced by an empty one and then overwritten with a single document.

**Teeth — each able to red alone:**

- **A12** `fetchDocument` receives a `302` carrying a `Location` (stubbed `fetch`, as `corpus-ingest.test.ts:457` and `:610` already stub it) → ingest refuses, naming the location, with `index.json`, `raw/` and `normalized/` byte-unchanged.
- **A13** A `202` — or any non-200 status — is refused likewise; the positive sibling is a `200` that proceeds to the authority preflight.
- **A14** An unparseable `index.json` → refused before any write, naming the parse failure; an **absent** `index.json` still starts an empty index and proceeds.

| | Mutation | Expected first red |
|---|---|---|
| M-A7 | Follow redirects (default `fetch`) | A12 |
| M-A8 | Accept `response.ok` instead of status 200 | A13 |
| M-A9 | Catch every `index.json` read failure, not only `ENOENT` | A14 |

**Commit boundary:** one commit. *Store only what the declared URL actually answered.*

### 5.5 Identity, abort, protected

**Identity consequences: none.** `authorisedOrigins` is not in `corpusClosureSha256` or `CorpusPin`; no version moves.

**Abort A-E4-1:** if the matcher cannot be expressed without naming a host, scheme-specific identifier or encoding quirk in production code, stop — D-2's genericity is not met.

**Commit boundary:** one commit. *Let a source authorise a document its query identifies.*

---

## 6. Boundary B-E2 — standing, authenticity, operative status, identity, traversal

Spec §7, §7.1, §9 and §16 condition 5 **as corrected by B-NORM**.

**The identity distinction, stated precisely.** B-E2 is **not** the only boundary that moves an identity — B-T12 deliberately moves S-011's and S-012's closure digests (§7.3 C5a/C5b). The truthful distinction is narrower: **B-E2 is the only boundary that changes identity *schemes* and moves *every* existing closure digest**, whereas **B-T12 moves exactly two closure values and bumps no scheme.**

### 6.1 One owner for temporal standing (D-5)

**The knowledge pack owns temporal standing. The register owns authority tier and authorised origins. Neither borrows the other's fact.**

The decision is domain-driven, not plumbing-driven: §1.2 shows the pack **already** owns this fact in a determination-bearing way — `packFlags.revised_esrs_in_force` is read by `src/engine/evaluate.ts:91`, and **CSRD-S-012, the very requirement citing `SRC-007`, already branches on it**. `pack.json` carries `legalSnapshot`, so "the status as at this snapshot" is exactly what a pack asserts. The register holds *policy about* sources — what authority they carry, which surfaces may serve them — and `verifyRegisterIntegrity` already treats the pack as the source of source identity. Putting standing in the register would make the register authoritative for a legal fact the pack already determines with.

| Store | Owns | Does **not** own |
|---|---|---|
| `knowledge/csrd/sources.json` | **`temporalStanding`** — `in_force \| adopted_not_effective \| proposed \| superseded`, matching `schema.ts:155`'s enum | authority tier, origins, artefact facts |
| `monitoring/source-register.json` | `governingAuthorities`, `authorisedOrigins` | **temporal standing — no field is added here** |
| `corpus/index.json` | `artefactAuthenticity`, `nonOperativeSections` | temporal standing |

#### Coverage: which sources must carry a standing, and the migration table

**The rule: optional in the catalogue, fail-closed at the closure boundary.**

> `temporalStanding` is **optional** on a catalogue source, and **required for every `(document, servedSource)` pair entering an `EntitledClosure`**. A served source without one is a **refusal**, never a default.

Required-for-all was considered and rejected on truthfulness. The catalogue holds **17** sources and only **10** are instruments with a temporal legal status; the other **7** are guidance, hubs, projects and trackers for which none of `in_force | adopted_not_effective | proposed | superseded` is true. Forcing a value on those would be a fabricated legal claim, which is the failure the whole two-axis design exists to prevent. **No default is inferred anywhere** — absence is absence, and it only becomes an error when such a source is actually served.

| Source | `legalType` | `statusAtSnapshot` today | `temporalStanding` |
|---|---|---|---|
| SRC-001 | EU Directive | *In force, as amended* | `in_force` |
| SRC-002 | EU Directive | *In force, as amended* | `in_force` |
| SRC-003 | EU Directive | *In force* | `in_force` |
| SRC-004 | EU Directive | *In force; national transposition due 19 Mar 2027* | `in_force` |
| SRC-005 | EU Delegated Regulation | *In force baseline at snapshot* | `in_force` |
| SRC-006 | EU Delegated Regulation | *In force* | `in_force` |
| **SRC-007** | Delegated act | *Adopted; scrutiny/publication pending — NOT in force at snapshot* | **`adopted_not_effective`** |
| **SRC-008** | Delegated act | *Adopted; not in force at snapshot* | **`adopted_not_effective`** |
| SRC-009 | Official Commission guidance | *Current guidance; not legislation; pre-Omnibus in parts* | **absent** — a Notice is not an instrument with a temporal legal status |
| SRC-010 | Official Commission explanation | *Current explanation* | **absent** |
| SRC-011 | Official policy/source hub | *Continuously updated* | **absent** |
| SRC-012 | Official technical-adviser guidance | *Guidance primarily for 2023 ESRS* | **absent** |
| SRC-013 | Official technical knowledge hub | *Continuously updated* | **absent** |
| SRC-014 | Official standard-setting project | *Active; standard pending* | **absent** |
| SRC-015 | Official national-law tracker | *Country-specific and evolving* | **absent** |
| SRC-016 | EU Regulation | *In force* | `in_force` |
| SRC-017 | EU Delegated Regulation | *In force, as amended* | `in_force` |

Ten instruments carry a standing; seven do not. **Every source served today (`SRC-001`, `SRC-002`, `SRC-004`, `SRC-005`) and every source B-T12 serves (`SRC-007`, `SRC-008`) is in the instrument set**, so the fail-closed rule is satisfiable at both boundaries.

#### The consequence for non-instruments — O-1 selected, implementation deferred

**Absence plus fail-closed makes the seven non-instrument sources permanently unservable, and the parent spec plans to serve one of them.** The conflict is concrete, not theoretical:

| Evidence | Location |
|---|---|
| *"Its Notice is immutable and **ingestible**; its tier stays `official_body` with `sufficientAlone: 'non_binding_only'`"* | spec §7, `:293` |
| `SRC-009 \| S-006 \| **ingest**, weight preserved \| `official_body` row (new) + corpus document` | spec §12 disposition, `:472` |
| D1a-2 — *"Ingest the immutable surviving evidentiary artefacts — expected `SRC-005`, `SRC-006`, **`SRC-009`**…"* | spec §21, `:775` |

So the spec intends `SRC-009` to be ingested and cited at its preserved tier. Under the rule as drafted it could never enter a closure. Neither the repository nor the specification selected a resolution, so it was put to the user as the product question it is. **It is now decided: O-1, with implementation deferred.** The three options are kept below because a decision is only auditable beside what it rejected — smallest first:

| | Option | Assessment |
|---|---|---|
| **O-1** | **A structured `not_applicable` value**, declared explicitly on every non-instrument source. `temporalStanding` becomes required for **all 17**; the seven declare `not_applicable`. | **Selected.** Fail-closed is preserved — *absence* still refuses, because absence is no longer expressible. It never pretends guidance has an effective date: `not_applicable` is a claim about the *kind* of source, which is exactly what is true. It costs one enum value on a **new** field, so nothing existing is reinterpreted, and the requirement-side `legalStatus` enum (`schema.ts:155`) is untouched — the two vocabularies stop being identical, which the plan should say out loud rather than let drift. |
| **O-2** | **Derive applicability from `legalType`** — require standing only where `legalType` names an instrument. | **Rejected.** `legalType` is free text (`z.string()`, `schema.ts:96`) with values like *"Official policy/source hub"*. Inferring a structural rule from free text is the anti-pattern D-5 exists to remove, one field over. |
| **O-3** | **Declare non-instruments permanently unservable** and correct spec §7/§12/§21 to withdraw the intent to ingest `SRC-009`. | **Rejected.** Coherent, and cheapest in code, but it is a **product decision** — it removes official Commission guidance from the corpus permanently — and the direction taken is the opposite: official guidance and other non-instrument sources must remain ingestible. B-NORM's passage map therefore does **not** grow by the three spec passages this option would have required. |

**O-1 selected; implementation deferred to a named future sub-plan before the first non-instrument ingestion.** The product direction is settled — official guidance and other non-instrument sources remain ingestible, and deriving applicability from free-text `legalType` stays rejected. **Route A implements none of it:** no boundary in this plan adds `not_applicable`, makes `temporalStanding` required, or serves a non-instrument source. It therefore blocks nothing here — no non-instrument source is served today or by B-T12, so the fail-closed rule is satisfiable exactly as drafted.

**Boundary B-STANDING-ALL — the deferred implementation, scoped here and planned elsewhere.** It must settle, together and before the first non-instrument source is served: the `not_applicable` enum value and the `sources.json` schema migration introducing it; `temporalStanding` becoming **required across all seventeen sources**; how a `not_applicable` standing renders on the review sheet and in the closure grammar; R-b's treatment of a served non-instrument, whose indivisibility rule was written for instruments; the fixtures and mutations that hold the fail-closed rule once absence stops being expressible; and the identity consequences of a pack-shape change made after B-E2's surfaces have already moved. **No file list is written here** — that would be speculation about a tree B-E2 and B-T12 have not yet produced. On the current sequence the gate is D1a-2's `SRC-009` ingestion.

**Tooth B9 — the fail-closed rule.** A synthetic world whose served source carries no `temporalStanding` must **refuse** at closure construction, naming the source; its sibling with a standing present succeeds. **M-B10:** default a missing standing to `in_force` → B9 reds.

**The two other pack expressions, resolved rather than left to drift:**

- **`statusAtSnapshot` becomes non-authoritative.** It is free text no code reads. **Approved: replace it with `temporalStanding` plus an optional `statusNote`** whose docstring says it carries no machine meaning. Free text cannot be mechanically checked against a structured value, so the only way to prevent contradiction is to stop the free-text field making the claim. *Retaining it as-is is the alternative and is rejected: it would leave two structured-looking answers, which is what D-5 forbids.* *Deleting it outright was considered on 2026-09-04 and rejected (R-12): seven non-instrument sources carry authored notes there — "pre-Omnibus in parts", "Guidance primarily for 2023 ESRS" — that no structured field holds until B-STANDING-ALL.*
- **`packFlags` stay, and are cross-checked in *both* directions.** They are program-specific evaluation switches consumed by program-agnostic engine code (`Record<string, boolean>`); deriving them from generic standing would put CSRD concepts in generic code and breach the plan-wide program-agnosticism constraint. They are a **different vocabulary for an overlapping fact**, so the overlap is made mechanical.

  **The quantifier is a biconditional, stated deliberately:** `packFlags.revised_esrs_in_force === true` **⟺** `SRC-007.temporalStanding === 'in_force'`, and `voluntary_standard_in_force` **⟺** `SRC-008`. Tooth **B7** asserts both directions. No one-way slack is taken, and the reason it is not needed is worth recording: entry into force and *application* are different questions, and the pack already separates them — C(2026) 5010 enters into force on a fixed date but applies to financial years beginning on or after 1 Jan 2027, and **CSRD-S-012 handles that with a separate `fy_starts_on_or_after` case** rather than by weakening the flag. So the flag means entry into force, which is exactly what `temporalStanding === 'in_force'` means, and any divergence between them is a half-updated pack rather than a legitimate distinction.

- **`changeWatch[].status` (added 2026-09-04, R-11).** CW-001 and CW-002 carry `adopted_not_effective` in a `z.string()` beside CW-003 `in_progress` and CW-004 `in_development`: watch-progress prose that borrows the standing vocabulary for two rows, and the dashboard renders it. The values stay — both engine goldens embed the four-item `changeWatch` array, and renaming would move them for no determination change. **Tooth B7b:** for every `changeWatch` item whose `status` is a member of the standing enum, every instrument in its `sources[]` that carries a `temporalStanding` carries that same value (`SRC-010`, a non-instrument, is skipped by construction). **M-B19:** in a scratch pack set CW-001 to `in_force` while `SRC-007` stays `adopted_not_effective` → B7b reds. The `changeWatchItemSchema` docstring says the field is watch progress, not standing.

**How entitlement receives it without duplication.** `authoriseCorpus(corpus, register, pack)` (`src/corpus/authority.ts:127–133`) **already takes the pack** at every composition root. `EntitledClosure.forSources` derives the standing map from the pack's sources and passes it to `computeClosure` (§6.4). Nothing is copied into the register or the corpus index.

**Abort A-E2-4:** if standing cannot be read at entitlement without writing it into the register or the corpus index, stop — the ownership decision has failed and D-5 must be revisited.

### 6.2 Authenticity, and the orthogonality it must demonstrate

`artefactAuthenticity` on `CorpusDocument`: `authentic_publication | official_consolidation | official_pre_publication_text` (D-9).

| Document | served source → `temporalStanding` (pack) | `artefactAuthenticity` (document) |
|---|---|---|
| `DOC-32013L0034` | SRC-001 → `in_force` | `official_consolidation` |
| `DOC-32022L2464` | SRC-002 → `in_force` | `official_consolidation` |
| `DOC-32023R2772` | SRC-005 → `in_force` | `official_consolidation` |
| `DOC-32026L0470` | SRC-004 → `in_force` | `authentic_publication` |
| `DOC-C2026-5010` | SRC-007 → **`adopted_not_effective`** | **`official_pre_publication_text`** |
| `DOC-C2026-5011` | SRC-008 → **`adopted_not_effective`** | **`official_pre_publication_text`** |

Three of the four combinations occur — authentic-and-in-force, non-authentic-and-in-force, neither — which shows that **standing does not determine authenticity**: `DOC-32026L0470` and `DOC-32013L0034` share `in_force` and differ in authenticity, and M-B3 targets exactly that. On this six-row table authenticity *does* happen to determine standing. That is a coincidence of the current corpus, not a rule; the design forbids the derivation rather than relying on a counterexample, and the fourth combination — an `authentic_publication` serving an `adopted_not_effective` source — is exactly the state B-OJ's first event produces (§8). *(Sentence corrected 2026-09-04; the previous "neither field is derivable from the other" overstated the table.)* The third authenticity value is required: an official pre-publication text is neither the authentic publication nor a consolidation of law in force.

**Per-pair, not scalar (C-1).** `serves` is `string[]`, so standing resolves per `(document, sourceId)` pair, as `assertClosureCitability` already quantifies citability (`entitlement.ts:239–247`):

```
DocumentStanding = {
  artefactAuthenticity,                            // from the document
  nonOperativeSections,                            // from the document
  sources: [ {sourceId, temporalStanding}, … ]     // sorted, one per serves[] entry
}
```

A list, not a reduction, so a multi-source artefact cannot silently lose one source's standing.

### 6.3 The operative-status rule (D-3)

**The previous draft was wrong here, and the user is right.** `adopted_not_effective` answers *when the instrument takes effect*; `official_pre_publication_text` answers *what kind of artefact this is*. **Neither says the explanatory memorandum is non-operative**, and both apply equally to the enacting terms and the annexes. Labelling the artefact does not discharge D-3.

**The rule, carried as data and rendered as a projection.** `CorpusDocument` gains:

```
nonOperativeSections: string[]      // REQUIRED; [] on documents that declare none
```

**One canonical representation, because three spellings of "none" would otherwise hash three ways.** `undefined`, `null` and `[]` must not mean the same thing while producing different closure lines and pins, so the field is **required** and its empty case is **`[]`**; `undefined` and `null` are refused at schema. Entries are further constrained so a given intended list has exactly one expression:

| Aspect | Rule |
|---|---|
| Whitespace | entries must be already-trimmed and non-empty; an untrimmed or empty entry is **refused**, never silently normalised |
| Duplicates | **refused** at schema, not de-duplicated — silent de-duplication would let two authorings differ in the file and agree in the hash |
| Ordering | **authored document order, and significant** — it is the order the sections appear in the artefact, so the same set in two orders is two different claims about the document, not two spellings of one |

With duplicates, blanks and the three spellings of "none" all refused, one *intended list* — order included — has exactly one expression. Nothing validates authored order against the artefact's actual section order; that is a claim the author makes and B-T12's C2 checks for these two artefacts.

The heading strings are data — generic, with no EU- or CSRD-specific literal in production code, exactly as `serves` and `contentSelector` are.

**The rendered clause is a projection over standing, and it may only assert what the declaration actually supports.** The renderer knows which headings were **declared** non-operative. It does **not** know that everything else is operative — a remainder can hold titles, metadata, recitals, procedural material, or a further non-operative section nobody declared. So the clause never characterises the remainder.

**It does not characterise the declared sections either.** `nonOperativeSections` carries opaque generic heading strings; a declared section might be an explanatory memorandum, but it might equally be recitals, a preamble or procedural material. Calling it *"official explanatory material"* would be the same overclaim one step to the left, so the clause says only what the field actually asserts: **not operative**.

**The gating is per-component, deliberately.** The *always* component is emitted only for a document with a non-empty `nonOperativeSections` — it names those headings. **The standing components below are emitted for every document**, declared sections or not: a document serving an `adopted_not_effective` source must carry the *"not current law"* sentence whether or not it happens to declare an explanatory section, and coupling the strongest human-readable warning to an unrelated field would be an accident waiting to be inherited. `renderEntitledClosure` emits:

| Component | Text |
|---|---|
| **Always** | *Material under &lt;declared headings&gt; is **not an operative provision** of this document. This says nothing about any section not named here: it must not be read as a statement that the rest of the document is operative.* |
| all served sources `in_force` | nothing further — **no** not-yet-effective claim is made *(emitted for every document, not only those with declared sections)* |
| all served sources `adopted_not_effective` | *The adopted legal material in this document is not current law.* |
| **mixed** | *This artefact serves sources of differing legal standing. It must not be treated as current law for any source shown as adopted-not-effective.* |

The per-source standing block is rendered beside it in every case (§6.2), so the clause and the standing it depends on are one projection rather than two claims free to disagree.

**No production sentence names "the enacting terms and annexes".** That is true of these two artefacts and unknowable for a future one, and a renderer must not assert a document structure it cannot see. **B-T12 proves the specific claim separately** (§7.3 C2) — that for `DOC-C2026-5010` and `DOC-C2026-5011` the operative material is the enacting terms and the annexes — as evidence about those two artefacts rather than as a sentence baked into the renderer.

**Committed by the same mechanisms as standing.** The clause is part of `renderEntitledClosure`'s output, so `requestSha256` digests it; `nonOperativeSections` enters the closure canonical line beside `artefactAuthenticity` (§6.5.1), so `corpusClosureSha256` moves when it changes. C-2 holds for the operative-status rule exactly as for standing.

**Teeth — all three roles, because three roles read the closure:**

- **B4a / B4b / B4c** the clause appears in the rendered input of the **reader**, of **each prosecutor**, and of the **adjudicator**. Three assertions: one passing role proves nothing about the others. All three route through `renderEntitledClosure` (`src/pipeline/reader.ts:126`, `prosecutors.ts:361`, `adjudicator.ts:329`), so the assertions are cheap and the coverage is real. *(`orchestrate.ts:41` also imports the renderer but never calls it — there is no fourth role-facing surface to cover.)*
- **B4d** a document declaring **no** non-operative sections renders **no *always* component** — the positive sibling, so the tooth cannot pass by emitting that component unconditionally. **Scoped to the always component deliberately:** such a document still renders its standing components (B4i), so a tooth asserting the absence of *all* clause text would contradict B4i and red it.
- **B4e — the `in_force` case asserts nothing extra.** A document all of whose served sources are `in_force`, carrying declared sections, renders the always-component **and no not-yet-effective claim**; its `adopted_not_effective` sibling renders the *"not current law"* sentence. Without B4e the clause could assert non-effectiveness of law in force.
- **B4f — mixed standing.** A document serving one `in_force` and one `adopted_not_effective` source renders the **mixed** component — *must not be treated as current law for any source shown as adopted-not-effective* — and its two single-standing siblings render their own forms, so a renderer emitting one clause for all three cases cannot pass.
- **B4g — canonical form.** `undefined` and `null` are refused; `[]` is accepted and renders nothing; an untrimmed, empty or duplicated entry is refused.
- **B4h — the clause never characterises the remainder, nor the declared sections.** Every rendered form carries the *"says nothing about any section not named here"* qualification; **no** form asserts the remainder is operative; and no form calls the declared material *"explanatory"* — only *not operative*.
- **B4i — the standing components are not gated on a declaration.** A document declaring `[]` and serving an `adopted_not_effective` source **still** renders the *"not current law"* sentence. **M-B17:** gate the standing components on a non-empty `nonOperativeSections` → B4i reds.
- **M-B6** delete the clause from the renderer → B4a–B4c red.
- **M-B7** render the clause but drop `nonOperativeSections` from the closure line → the C-2 tooth (**B2**) reds, proving the clause is committed and not merely displayed.
- **M-B9** make the second sentence fixed text rather than a standing projection → **B4e** reds.

**Pinning section order in B-T12 remains** (§7.3 C2) but is explicitly **not** the discharge of D-3: it proves the artefact has the structure the declaration names, not that any role was told what it means.

### 6.4 Traversal — entry point versus expansion (D-6, D-8)

`computeClosure` is pure over `CorpusIndex` (§1.4) and standing lives in the pack, so it cannot consult standing as written.

**Resolution: give `forSources` the pack, derive once, pass explicitly.** `forSources` cannot reach the pack today (§1.4), so it **gains the pack as a parameter** beside the register it already takes for citability — standing is the same kind of input from the same kind of authority. It derives the map and passes it down.

*The alternative — handing `forSources` a prebuilt standing map — is rejected: it would let a caller pass a map disagreeing with the pack, which is the same second-source-of-truth failure the standing map itself is constrained to avoid (see the bullets below).* Taking the pack keeps exactly one derivation owner.

**The settled signature, used identically everywhere in this plan:**

```
computeClosure(index, entryDocIds, standing, policy?)
```

- **`standing` is required and precedes the defaulted `policy`.** Required, because an optional parameter would let a caller omit it and compute a *different digest for the same closure* — C-2 through the back door; every call site lacking standing then **fails to compile**, the tooth this codebase already uses for `AuthorisedCorpus`. Placed **before** `policy` because `policy` is defaulted (`closure.ts:99`) and appending after it would force **37** two-argument call sites to spell out `CLOSURE_POLICY_V1`.
- **It carries only the pack-derived half:** `ReadonlyMap<docId, readonly {sourceId, temporalStanding}[]>`. `artefactAuthenticity` and `nonOperativeSections` are already on `CorpusDocument` and therefore already in the `CorpusIndex` `computeClosure` receives; passing them again would let a caller hand in a map disagreeing with the index, and §6.5.1 would hash the map's copy — a digest not describing the corpus. They are read from `doc`.
- `closure.ts` stays pure: no filesystem, no register, no pack import — it receives a map and reads it.

**The expansion rule — R-b (D-8).** A document is **expansion-eligible** — reachable by **any traversal step, structural or `references`**, from a document that does not serve it — only if **every** source it serves is `in_force`. **Corrected 2026-09-04 (R-5):** `computeClosure` follows `references` edges forwards at a depth cost (`closure.ts:134–137`), and a gate on the structural branch alone would leave a `references` edge pulling future-law material into a closure. The rule is applied where a neighbour is about to be enqueued, whichever branch found it, and an ineligible neighbour is **not enqueued** — it neither enters the closure nor expands further. A multi-source artefact is indivisible: its text is rendered whole, so if any served source is adopted-not-effective, R-a would expose future-law material through an unrelated structural path. **Direct citation still admits the artefact** (`docsForSources`), so R-b is the conservative rule that actually satisfies D-6.

**The purpose-built world.** The real pack cannot prove this — the corpus holds **exactly one edge** and B-T12 adds none. Identifiers are new: `SRC-901`/`SRC-902`/`SYN-R-A` are already bound at `test/pipeline-source-completeness.test.ts:182–184`, in a world whose docstring (`:175–179`) says edges were *deliberately dropped* so traversal would not occur.

**The previous draft's world could not prove R-b, and this is the correction.** It gave the multi-source target `serves: [SRC-911, SRC-912]` while the probing requirement cited `SRC-911` — and `docsForSources` (`src/corpus/closure.ts:78–85`) selects **any** document whose `serves` intersects the wanted set. The target was therefore a **direct entry**, admitted under D-8 by both quantifiers, so T4 could not red on a flip and M-T3 was false. The same draft's T2 expected `{DOC-RN}` alone, which is also wrong: structural edges are followed **in both directions** (`closure.ts:130–133`, the `structural.has(e.kind)` branch — `:132` forward, `:133` reverse), so a closure entered at the target reaches its edge partner too.

**The corrected world. The probing requirement cites neither source the multi-source target serves, and the target is reachable only through a structural edge.**

**The four documents are the real corpus's files, copied and re-labelled**, as `pipeline-source-completeness.test.ts:170–179` already requires of synthetic corpora: a hand-written document cannot satisfy the raw-reproduces-normalized check under the real normalizer, and faking that is how a fixture starts lying about integrity. The corpus holds exactly four documents, which is the number this world needs; their `edges` are replaced with the three declared here.

```
standing:  SRC-911 in_force   SRC-912 adopted_not_effective   SRC-913 in_force
           SRC-914 in_force   SRC-915 in_force                SRC-916 in_force

DOC-RM serves [SRC-911]           ──amendedBy──▶  DOC-RN serves [SRC-912, SRC-913]   ← MIXED target
DOC-RQ serves [SRC-914]           ──amendedBy──▶  DOC-RP serves [SRC-915, SRC-916]   ← all-in_force target
DOC-RQ                            ──references─▶  DOC-RN                              (forward-only, depth 1 — the reference branch R-b must also gate)

STD-R-MIXED    cites [SRC-911]    (neither SRC-912 nor SRC-913 — the target is expansion-only)
STD-R-INFORCE  cites [SRC-914]    (neither SRC-915 nor SRC-916 — likewise)
STD-R-DIRECT   cites [SRC-912]    (direct citation of the adopted-not-effective source)
```

**Exact closure sets, computed under both quantifiers, entry documents included:**

| Requirement | Entry | Closure under **R-b** | Closure under R-a |
|---|---|---|---|
| `STD-R-MIXED` | `{DOC-RM}` | **`{DOC-RM}`** | `{DOC-RM, DOC-RN}` |
| `STD-R-INFORCE` | `{DOC-RQ}` | **`{DOC-RP, DOC-RQ}`** | `{DOC-RM, DOC-RN, DOC-RP, DOC-RQ}` — `DOC-RN` arrives along the reference edge, and `DOC-RM` follows it back along `DOC-RN`'s structural edge |
| `STD-R-DIRECT` | `{DOC-RN}` | **`{DOC-RM, DOC-RN}`** | `{DOC-RM, DOC-RN}` |

**Two rows differ between the quantifiers, and each is a detector for one branch:** `STD-R-MIXED` for the structural branch (T1), `STD-R-INFORCE` for the reference branch (T5). `STD-R-DIRECT` is unchanged by the added edge because `references` is followed forwards only (`closure.ts:134`). Under M-T5 — R-b on the structural branch only — `STD-R-INFORCE` likewise gains `DOC-RN` and then `DOC-RM`, so T5's assertion that `DOC-RN` is absent reds, and T4's exact set reds with it.

- **T1 — expansion refused on mixed standing.** `STD-R-MIXED`'s closure is **exactly `{DOC-RM}`**. `DOC-RN` serves one `in_force` and one `adopted_not_effective` source and does not arrive.
- **T2 — direct citation admits, and the closure is stated in full.** `STD-R-DIRECT`'s closure is **exactly `{DOC-RM, DOC-RN}`**: `DOC-RN` as the cited entry despite its adopted-not-effective source, **and** `DOC-RM` reached back along the same edge because it is expansion-eligible. T1 and T2 hold **in one world**, so a blanket exclusion cannot pass.
- **T3 — standing-driven, not document-driven.** Flip `SRC-912` to `in_force` and `STD-R-MIXED`'s closure becomes **`{DOC-RM, DOC-RN}`**. Without T3 an implementation hardcoding "`DOC-RN` never expands" would be green.
- **T4 — R-b is not "block every multi-source document".** `STD-R-INFORCE`'s closure is **exactly `{DOC-RP, DOC-RQ}`**: `DOC-RP` serves **two** sources and expands, because both are `in_force`. T4 is the *unflipped* case that keeps R-b honest — it states positively that multi-source expansion works when standing permits. *(It is not the sole detector of M-T4: a blanket multi-source refusal also reds T3, since `DOC-RN` serves two sources there. T4 names the proposition directly rather than leaving it inferable from another tooth's failure.)*
- **M-T1** delete the standing consultation → **T1** reds, naming `DOC-RN` as arriving by expansion. *(M-T1 and M-T3 produce identical closures in this world, because `DOC-RN` happens to serve one `in_force` source. Both correctly red T1; they are listed separately because they are different edits with different intents — removing the gate versus weakening it — not because either detects something the other misses.)*
- **M-T2** exclude adopted-not-effective documents entirely, entries included → **T2** reds.
- **M-T3 — the quantifier flip.** Change R-b to R-a (eligible if *any* served source is `in_force`) → **T1** reds, its closure gaining `DOC-RN`. This is the single load-bearing tooth for the quantifier, and unlike the previous draft's version it genuinely moves.
- **M-T4** refuse expansion into any document serving more than one source → **T4** reds.
- **T5 — the reference branch is gated (added 2026-09-04, R-5).** `STD-R-INFORCE`'s closure does **not** contain `DOC-RN`, which is reachable from `DOC-RQ` only along the `references` edge; the assertion names the edge. **M-T5** apply R-b on the structural branch only → T5 reds (and T4 with it). Without T5 an implementation gating one branch satisfies T1–T4.

**`STRUCTURAL_EDGE_KINDS`' docstring must be corrected** in the same commit: *"Kinds that lead to the same law in its currently governing form"* is the premise this rule refines — an adopted-not-effective amendment leads to a **future** governing form.

### 6.5 Identity — closing C-2, and the version-surface audit

#### 6.5.1 Where standing enters

| | Approach | Verdict |
|---|---|---|
| I-1 | Closure canonical line only | Closes C-2; leaves `CorpusPin` unable to describe what was pinned |
| I-2 | **Canonical line *and* `CorpusPin`** | **Selected (D-12)** — one source of truth, both surfaces consistent |
| I-3 | Separate `corpusStandingSha256`, closure hash unchanged | **Rejected on two grounds.** It leaves the same `corpusClosureSha256` able to render different standing (C-2), **and it is not cheaper**: `verificationResultSchema` is `.strict()` with `resultSchemaVersion` a `z.literal('1.2.0')` (`result.ts:233`), so adding any field moves the literal. I-3 pays the identical bump and retirement while adding a second pin surface that can disagree with the first |

The canonical line becomes `['doc', id, sha256Normalized, artefactAuthenticity, nonOperativeSections, sourcesStanding]` in a fixed canonical form, JSON-encoded as the existing line is.

#### 6.5.2 The version-surface audit — every constant whose contract touches this change

D-12 makes I-2's approval conditional on this table closing.

| Constant | Contract | Verdict |
|---|---|---|
| `RESULT_SCHEMA_VERSION` (`src/verification/result.ts:233`) | `z.literal`, `.strict()` schema | **BUMP `1.2.0` → `1.3.0`.** `CorpusPin` gains fields. The literal is edited **here**; `identity.ts:51–52` *derives* it and is not the edit site |
| `CLOSURE_POLICY_V0` (`src/corpus/closure.ts:47`) | docstring: structural edges *"do not lead somewhere new, they lead to the same law in the form that currently governs, so they cost no depth"* | **BUMP → `CLOSURE_POLICY_V1`.** That premise becomes false: an edge to an adopted-not-effective document no longer expands. **A rename alone is cosmetic** — `identityPayload` hashes only `{referenceDepth, structuralKinds, referenceKinds}` (`identity.ts:129–133`), all unchanged — so the policy carries a **behavioural field** `expansion: 'unconditional' \| 'served_sources_in_force'` (R-6): read by `computeClosure` to decide whether R-b applies, `'served_sources_in_force'` in `CLOSURE_POLICY_V1`, and written into the payload's `closurePolicy` block beside the three existing fields. An opaque identity string was rejected — R-b could change without it moving. **B17:** in §6.4's world, `computeClosure` under `expansion: 'unconditional'` reproduces R-a's closures and under `'served_sources_in_force'` R-b's; **B18:** `pipelineVersion` differs between two otherwise identical identity inputs whose policies differ only in `expansion`. **M-B8** (restated): leave `expansion` out of the payload → B18 reds |
| `PIPELINE_IDENTITY_SCHEME` (`src/pipeline/identity.ts:68`) | *"Carried in the identity string so that a change to **what** is hashed is visible in the value rather than silently producing a different number for the same pipeline"* | **BUMP `v2` → `v3`.** Adding the closure-policy identity to `identityPayload` is a change to what is hashed — exactly the event this constant exists to make visible |
| `NORMALIZER_VERSION` (`src/corpus/normalize.ts:20`) | bump on any change to `extractText`/`normalize` | **Unchanged at `1.0.2`.** Route A uses the existing extractor untouched |
| `RENDERER_VERSION` (`src/verification/render.ts:89`) | *"any change to emitted text obliges a bump"* — but it versions the **condition** renderer in `src/verification/render.ts` | **Unchanged at `1.1.0`.** The condition renderer is untouched; its docstring is narrowed to say so |
| **`CLOSURE_RENDERER_VERSION`** *(new)* | the same contract, for `renderEntitledClosure`'s grammar | **NEW at `1.0.0`, and hashed.** B-E2 and D-3 both change that grammar and no constant covered it. It **enters `identityPayload`** as a `PipelineIdentityInput` field, `closureRendererVersion`, supplied by the orchestrator from the constant exactly as `resultSchemaVersion` is — never caller-authored — and is therefore covered by `PIPELINE_IDENTITY_SCHEME v3` |
| `TRANSCRIPT_SCHEMA_VERSION` (`src/pipeline/transcript.ts:102`) | transcript **shape**; explicitly *"Unrelated to `resultSchemaVersion`"* | **Unchanged at `1.1.0`** — no transcript field is added. **Its docstring says "which stays `1.2.0`" and becomes stale**; correcting that sentence is part of B-E2 |
| `REQUEST_IDENTITY_SCHEME` (`src/pipeline/request-identity.ts:42`) | payload built from an explicit object so an unrelated `RoleRequest` field cannot move fingerprints | **Unchanged at `v1`.** No `RoleRequest` field is added; message *content* changes, which the payload already covers by design |
| `RUN_IDENTITY_SCHEME` (`src/pipeline/run-identity.ts:28`) | files a recording under the pins it answers | **Unchanged at `v1`.** Pin *values* move; the scheme's input set does not |

**The knowledge-plane surfaces, audited separately.** B-E2 adds a structured source field and renames `statusAtSnapshot`, so the pack side needs the same treatment as the pipeline side. Claiming "every constant" without it would have been premature.

| Pack/knowledge surface | Contract | Verdict |
|---|---|---|
| `sourceRecordSchema` (`src/knowledge/schema.ts:93`) | none — the pack has **no per-file schema version** | **A genuine absence, recorded rather than invented.** The shape changes with nothing to bump. Introducing a pack-schema version is out of scope here and is not smuggled in |
| `pack.version` (`manifestSchema`, `src/knowledge/schema.ts:225`; today `0.1.0`) | authored string whose **documented bump rule is a pack-flag flip** (`backend/engine/CLAUDE.md:65`), not a schema-shape change; recorded on every signature (`src/verification/ledger.ts:117`, `['integrity','audit']` at `accounting.ts:304`) **and embedded in every engine result** by `src/engine/evaluate.ts:201` as `` `${pack.id}@${pack.version} (legal snapshot …)` `` | **Unchanged at `0.1.0`** — see the note below |
| `requirementInputSha256` (`src/verification/canonical.ts:155`) | covers **only** `provenance` + `logicalPayloadSha256` | **Unchanged.** `sources.json` is not in the payload, so **no requirement version moves** — the claim in §6.5.4 is proved here, not assumed |
| `ledger.signing.rendererVersion` (`src/verification/ledger.ts:124`, `['audit']`) | records which renderer produced the English a signature pins — today the **condition** renderer | **DECIDED: the signature also records `closureRendererVersion`.** A renderer version hashed into `pipelineVersion` but absent from the signature record would leave the human-verification answer incomplete — a verifier could not say which grammar produced the closure text the signature attests to. Requirements in §6.5.5 |
| `frontend/web/lib/pack.ts:419–423` | none — it **regex-matches `statusAtSnapshot`** (`/^in force/i`, and `/adopted/i` with `/not in force\|pending/i`) | **Must be repointed to `temporalStanding`.** This is a **second, undeclared derivation of standing from free text** — precisely what D-5's single-owner rule forbids — and the rename would break it anyway. Finding it is the strongest argument for the rename |

**Why `pack.version` does not bump, and what it would have cost.** A bump was the intuitive answer and it is wrong here. `evaluate.ts:201` embeds the version string in every assessed requirement, and **both goldens carry `csrd@0.1.0 (legal snapshot 2026-07-26)` eleven times each** (`test/golden/migration-engine-golden.json`, `provenance-engine-golden.json`), compared exactly against `assess(csrdPack(), …)` by `provenance-golden.test.ts` and `migration-golden.test.ts`. Bumping would red both and force 22 embedded strings to be re-recorded — **re-recording a protected historical artefact for a change that moves no determination**. **The documented bump rule is tied to a flag flip, and B-E2 does not flip a flag.** `backend/engine/CLAUDE.md:65` states the contract: *"If the revised ESRS / voluntary standard enter into force: flip the pack flag in `pack.json`, **bump `version`**, run tests, and note the delta."* The trigger is entry into force — a determination change — not a schema-shape change. B-E2 flips no flag and moves no determination, so the rule does not fire.

Nothing an assessment reads changes. `assess` reads `pack.requirements`, `factTypes`, `catalogues`, `packFlags`, `changeWatch`, and — at the line under discussion — `pack.id`, `pack.version` and `pack.legalSnapshot`; B-E2 touches **none** of them. What it does touch is `sources.json`, and **nothing under `src/engine/` reads `pack.sources` at all** (every `pack.sources` reader is in `corpus/`, `cli/`, `knowledge/loader.ts` or `monitoring/`), so no determination can move. **No pack-version bump rule is triggered by B-E2's schema-shape change; the documented rule applies when the pack flag flips**, and B-E2 flips none.

So the version stays, §9's protection of the goldens holds, and the residue is recorded **accurately**, which an earlier draft did not manage: **two pack source-record shapes will be indistinguishable by any authored pack identifier.** Not by `pack.version` — unchanged by decision. Not by `legalSnapshot` — unchanged, because the legal snapshot has not moved. Not by any requirement digest — `requirementInputSha256` covers `provenance` + `logicalPayloadSha256` and never reads `sources.json`, which is the same fact that makes this decision safe. Claiming either of the last two as a discriminator would have been false.

What *does* distinguish them is narrower and worth naming exactly: **the repository bytes**, and — once a shape is actually used by corpus execution — **the standing-aware `corpusClosureSha256`, the `pipelineVersion` under `PIPELINE_IDENTITY_SCHEME v3`, and `RESULT_SCHEMA_VERSION 1.3.0`**. That is why leaving `pack.version` alone is defensible rather than merely convenient: the practical identity consequence is carried on the corpus and pipeline surfaces, where the shape change has effect, and **no assessment determination moves at all**. The real gap — that the pack has no per-file schema version — is the row above. **If the user prefers the bump, it is a decision with a stated price:** both goldens re-recorded under an explicit, argued disposition, with `test/golden/*.json` moved out of §9 and both golden test files added to §6.6. This plan does not take that trade unilaterally.

**Abort A-E2-5:** if implementation shows the closure-policy identity cannot be added to `identityPayload` without a further scheme change beyond `v3`, stop and re-open this audit rather than absorbing it.

**Abort A-E2-6:** if recording `CLOSURE_RENDERER_VERSION` on the signature (the `ledger.signing.rendererVersion` row above) cannot ride the `RESULT_SCHEMA_VERSION 1.3.0` bump already required — for instance because it forces a second ledger variant or a further schema version — **stop and report** rather than absorbing it into B-E2.

#### 6.5.3 `CLOSURE_RENDERER_VERSION` — the gap, and the decision that closes it

`renderEntitledClosure` (`src/pipeline/entitlement.ts:120–128`) produces model-facing text and had **no version constant**. `RENDERER_VERSION` covers `src/verification/render.ts` only. B-E2 and D-3 both change the closure render grammar.

It was never *uncommitted* — `requestSha256` digests the content, and after I-2 the inputs are in `corpusClosureSha256`. What was missing is a named answer to *"which grammar produced the English this signature was taken over"*, which is exactly the question `RENDERER_VERSION`'s docstring says a version exists to answer.

**Decided: introduce `CLOSURE_RENDERER_VERSION`, and hash it.** It must

1. version `renderEntitledClosure`'s emitted grammar, inheriting `RENDERER_VERSION`'s rule that *any* change to emitted text obliges a bump;
2. **enter `identityPayload`** (`src/pipeline/identity.ts:104–134`) — a constant that is exported but not hashed is a label, and this plan does not create one;
3. be covered by `PIPELINE_IDENTITY_SCHEME → v3`, whose bump is *already* required because the payload gains the closure-policy identity; both additions are the same event and one scheme bump carries both;
4. carry a tooth — **B10: changing `CLOSURE_RENDERER_VERSION` moves `pipelineVersion`** — with **M-B11:** remove it from `identityPayload` while leaving the export in place → B10 reds, which is precisely the exported-but-unhashed failure;
5. appear in B-E2's file list (§6.6) and in the audit table above.

`RENDERER_VERSION`'s own docstring is narrowed in the same commit to say it versions the condition renderer, so the two constants cannot be read as competing for one surface.

#### 6.5.4 Consequences of I-2, in full

- **Every `corpusClosureSha256` moves.** All three current digests change.
- **`RESULT_SCHEMA_VERSION` → `1.3.0`; `PIPELINE_IDENTITY_SCHEME` → `v3`; `CLOSURE_POLICY_V0` → `V1` with a hashed identity.** `pipelineVersion` moves for all three reasons and — unlike the previous draft — now moves *because traversal semantics changed*, not merely as a side effect of a schema literal.
- **Requirement versions do not move.** All sixteen stay at v3; `verification/requirement-versions/csrd.json` untouched.
- **Exactly one transcript generation retires — and a replacement must be *recorded*, not merely promised.** `pipeline-replay.test.ts:199–204`'s `committed()` asserts `toHaveLength(1)` over the non-superseded generations. Retiring the only live one leaves **zero** and reds that helper before any assertion about content.

  **The order is fixed by a real dependency, and an earlier revision of this plan had it backwards.** `PROVENANCE.md` is not edited — it is *generated*. `test/record-replay-fixture.ts:120–169` rewrites the whole file on every run from a hardcoded template, with the generation table at `:149–152`:

  ```
  '| pre-D1(a) | `run-v1-764e571e…` | retired 2026-08-27 |',
  `| provenance-era | \`${transcript.runId.slice(0, 20)}…\` | current |`,
  ```

  Running the recorder *before* correcting that template would label the **new** standing-era recording *"provenance-era … current"*, erase the retiring run's row entirely, and regenerate the stale `:158` sentence as a freshly written false statement — a false provenance record produced by the very step meant to establish provenance. Appending to `PROVENANCE.md` by hand is not the alternative: the next run clobbers it. **The corrected recorder must execute before its own output is accepted.** So B-E2 schedules:

  1. **Correct the recorder first, before it is run.** In `test/record-replay-fixture.ts`: the hardcoded table (`:149–152`) gains a `provenance-era | run-v1-e77e9d0d… | retired` row while its interpolated row becomes the **standing-era** `current` entry; the heading *"## Two generations live here"* (`:140`) becomes three; and the prose at `:158` — *"`renderedConditionSha256` and `corpusClosureSha256` did **not** move"* — is corrected to say that this retirement, unlike the provenance migration, **does** move `corpusClosureSha256`. Nothing has been generated yet, so no false record is ever written. *(The recorder imports `engineRoot`, `FIXTURE_TRANSCRIPT_ROOT`, `PACK_ID`, `REQUIREMENT_ID` and `syntheticCapability` from `replay-fixtures.ts` — **not** `SUPERSEDED_RUN_IDS` — so this edit's only ordering constraint is that it precede step 3.)*
  2. **Land B-E2's implementation and the retirement bookkeeping the replacement depends on.** The identity moves must already be in the tree — `RESULT_SCHEMA_VERSION 1.3.0`, `PIPELINE_IDENTITY_SCHEME v3`, `CLOSURE_POLICY_V1`, `CLOSURE_RENDERER_VERSION 1.0.0` — or the recording carries the identity B-E2 has just superseded. **Append the retiring `runId`** — `run-v1-e77e9d0d…` — to `SUPERSEDED_RUN_IDS` (`replay-fixtures.ts:77`), leaving its file in place as the record of a run that happened, and **extend `replay-fixtures.ts:73–75`'s comment** with the same correction step 1 made to its twin sentence inside the recorder. Appending here rather than after the run is what makes the recorder's hardcoded *"retired"* row true at the moment it is generated. **`superseded()` (`pipeline-replay.test.ts:207–212`) needs the same pass:** it asserts `toHaveLength(SUPERSEDED_RUN_IDS.length)` and then returns `retired[0]!`, which with two retired identities selects **by position** — the very thing `committed()`'s own docstring says `readTranscriptsFor` refuses to do. Its three call sites (`:1724`, `:1754`, `:1774`) all mean the pre-D1(a) recording, so it must select by `runId`. `pipeline-replay` is already in §6.6's file list; this names what changes inside it.
  3. **Run the corrected recorder against that post-B-E2 tree** — `npx tsx test/record-replay-fixture.ts`, which drives `syntheticCapability` with **no network and no credential** (`PROVENANCE.md`: *"No model was contacted and no credential existed in the process that wrote it"*). The recording then carries the new `corpusClosureSha256`, `pipelineVersion` and `resultSchemaVersion`, and the `PROVENANCE.md` it regenerates is the corrected one.
  4. **The new transcript lands as a new file** under `test/verification-transcripts/csrd/CSRD-S-001/`. `writeRunTranscript` files by `runId` (`transcript.ts:437–442`) and the `runId` has moved, so **neither existing recording is overwritten or deleted** — §9's append-only rule holds by construction rather than by care. The *"never overwriting a file"* rule stated inside `PROVENANCE.md` governs the **transcript artefacts**, which this honours; `PROVENANCE.md` itself is regenerated by design, which is exactly why it is corrected at its source in step 1 rather than edited here.
  5. **Verify the three explanations agree** — stated as a check rather than assumed: the regenerated `PROVENANCE.md` table and prose, the two entries in `SUPERSEDED_RUN_IDS`, and `replay-fixtures.ts:73–75`'s comment must tell one story about which generations exist, which are retired, and what moved. `committed()` returns exactly one live generation; `superseded()` finds both retired files present.

  **A-E2-7:** if the replacement cannot be recorded without a network call or a credential, **stop** — the recorder's no-model guarantee is the reason these fixtures are admissible evidence.
- **The provenance-migration partition tests red after B-E2, and selecting by `runId` does not repair them (R-13).** `pipeline-replay.test.ts:1718–1777` derives its binding from a **live** `verifyRun` against the retired pre-D1(a) recording and asserts `corpusClosureSha256` unchanged; after I-2 every closure digest moves, so the three-field list gains a fourth and the *"closure untouched"* assertion fails. The block is rewritten **static-vs-static**: the two retired recordings are compared to each other with the exported `bindingDifferences`, asserting the provenance migration moved exactly `{pipelineVersion, requirementInputSha256, runId}`; a new block compares the provenance-era recording against the standing-era one, asserting exactly `{pipelineVersion, corpusClosureSha256, runId}` moved — B-E2's own partition, stated positively. `superseded()` becomes `supersededById(runId)` if B-FIX-WITNESS has not already done it. Every retired file's digest is pinned. **B16:** the standing-era partition block. **M-B20:** leave the new fields out of the closure line → B16 reds (and B2).
- **B-E2 is swept the way §7.2 sweeps B-T12 — by test *name*, over both workspaces.** Known impacted, verified 2026-09-04, a floor and not a set: `test/pipeline-fixtures.ts:412–416` builds a pack whose four sources carry no standing and is imported by **fourteen** `*.test.ts` files and two helper modules (`replay-fixtures.ts`, `pipeline-run-fixtures.ts`) — under B9 every served fixture source needs a `temporalStanding`, so this is a fixture change, not the comment-only change §1.4 records for `computeClosure`; **thirteen** engine test files hardcode `'1.2.0'`; **fourteen** hand-build signing entries; **thirteen** call `forSources`; `frontend/web/test/fixture-repository.ts` calls two-argument `computeClosure` (`:175`), pins `resultSchemaVersion: '1.2.0'` (`:100`) and hand-builds a signing entry (`:194`); `provider-adapter.test.ts:86` pins `GOLDEN_IDENTITY`, which B-E2 re-derives — its new value is recorded under a written disposition, never silently replaced; `pipeline-closure-citability.test.ts:244–254` serves `SRC-012`, a non-instrument, and reds under B9 until retargeted (B-FIX-WITNESS, §4.1, if taken first). No `traceSeries` test exists (`frontend/web/test/` verified); B-E2 adds one.
- **Both goldens unaffected — and the reason is not only the one it appears to be.** Neither embeds `corpusClosureSha256` or `sha256Normalized`, so the identity moves above miss them. But both **do** embed `csrd@0.1.0 (legal snapshot 2026-07-26)` eleven times each, via `src/engine/evaluate.ts:201`, and would red on a `pack.version` bump. They stay green because §6.5.2 decides **not** to bump it.
- **`FIELD_ROLES` (D-10), with the display consumer now traced rather than deferred.** `test/verification-accounting.test.ts:282–286` asserts every result-schema path is classified; new pin fields surface under `ledger.signing.corpus[].*` **and** `result.corpus[].*`.

  **`freshness` is ruled out** by what the role means: `forFreshness` (`current-state.ts:200–207`) projects `docId, sha256Raw, sha256Normalized, normalizerVersion`, and `documentReason` (`staleness.ts:137–143`) compares only the last three — exactly the set roled `['freshness','audit']` (`accounting.ts:299–301`). The analogue is `docId`, the other identity-bearing field freshness does not compare, roled `['integrity','audit']` on both roots (`:298`, `:392`).

  **The display consumer exists and is named — but it does not imply the `display` role, and an earlier revision of this plan got that wrong.** `src/cli/review-sheet.ts:1020–1030` renders a *"Documents this signature pins"* table iterating `signature.corpus`. It renders **four** pin fields, and **three of them are not `display`**: `docId` `['integrity','audit']` (`:298`), `sha256Normalized` `['freshness','audit']` (`:299`), `normalizerVersion` `['freshness','audit']` (`:301`). Only `versionLabel` is `['display','audit']` (`:305`). **So there is no "per-table convention" — that claim was false and is withdrawn.**

  Read against the definition (`accounting.ts:74`, *"`display` — shown to a human; decides nothing"*), the table is consistent and the discriminator is the second clause: `versionLabel` takes `display` because it **decides nothing**; the other three decide integrity or freshness and take those roles instead. Being rendered is necessary for `display`, not sufficient.

  **Decision, on that reading:** after I-2 the new pin fields enter `corpusClosureSha256` — they **decide**. They are therefore identity-bearing exactly as `docId` is, and take the same role, on **both** roots:

  | Root | Roles | Why |
  |---|---|---|
  | `ledger.signing.corpus[].*` | **`['integrity','audit']`** | identity-bearing after I-2 — the `docId` analogue. **No `display`**: they do not "decide nothing" |
  | `result.corpus[].*` | **`['integrity','audit']`** | same reasoning; unchanged |

  **Rendering is required regardless, and is toothed independently.** Standing must appear on the review sheet because "standing reaching verification" (spec §16 condition 5) is not satisfied by a field a verifier cannot see — but that obligation rests on §6.5.6's teeth, not on a `FIELD_ROLES` role. The two are now decoupled, which is what the false convention had obscured.

  **This adds a production file to B-E2:** `src/cli/review-sheet.ts`. **The exact columns, formats and teeth are specified in §6.5.6**, because *"standing columns"* is not a specification once the ledger carries authenticity, per-source standing, declared non-operative sections and a closure-renderer version. Every field taking `display` must be shown, and each is separately toothed.

  *Standing having no `freshness` role does not mean it has no freshness consequence: after I-2 it enters `corpusClosureSha256`, which `deriveStaleness` does compare (`staleness.ts:173` → `stale_closure`). The role describes the field, not the effect.*

**Abort A-E2-1:** if I-2 cannot be implemented without moving a **requirement** version, stop — standing has leaked onto the requirement axis.

#### 6.5.5 `closureRendererVersion` on the signing entry — required, not optional

Decided; no conditional phrasing remains anywhere in this plan. B-E2 must deliver all of:

1. **`ledger.signing.closureRendererVersion`** — a field on `signingEntrySchema` (`src/verification/ledger.ts:112–138`), beside `rendererVersion` (`:124`). The schema is `.strict()`, so the field must be declared, not merely written.
2. **A `FIELD_ROLES` row** for `ledger.signing.closureRendererVersion`, at **`['audit']`**. The forcing test is `test/verification-accounting.test.ts:278–280` — `assertFieldAccounting(RECORD_SCHEMAS)`, and `RECORD_SCHEMAS` (`accounting.ts:253–258`) includes `'ledger.signing': signingEntrySchema`, so any emitted path without a role throws. *(`:288`'s "cover both ledger variants" asserts three hardcoded paths and would **not** red.)*

   **Why `['audit']` and not `['display','audit']`, against first appearances.** Being rendered on the review sheet does **not** imply `display` in this table, and the sibling proves it: `ledger.signing.rendererVersion` is `['audit']` (`accounting.ts:295`) and *is* rendered on the same signoff table (`review-sheet.ts:1011`). So are `pipelineVersion` `['signability','audit']` (`:303`) and `corpusClosureSha256` `['freshness','audit']` (`:296`). `closureRendererVersion` is the exact analogue of `rendererVersion` — same kind of value, same table, same purpose — and takes the same role. **Landing it at `['display','audit']` beside an identically-situated `['audit']` sibling would introduce an inconsistency this plan has no reason to create.**

   **No "per-table convention" is claimed** — §6.5.4 examined that idea and withdrew it: three of the four pin fields rendered in the pins table are *not* `display`. The argument here rests only on the sibling: `closureRendererVersion` is the exact analogue of `rendererVersion`, same table, same kind of value, so it takes the same role. **Rendering is required either way** — tooth B11d stands on its own and does not depend on any role.
3. **Population during signing — copied from the result, never passed in (corrected 2026-09-04, R-7).** `renderEntitledClosure` runs only inside the three roles, so the grammar a signature should name is the one the *run* used, which the result carries (item 5). `buildSignature` copies `result.closureRendererVersion` exactly as it copies `result.pipelineVersion` (`sign.ts:366`) and gains **no** parameter. `rendererVersion` is different — the condition renderer runs again at signing, so its value is the signer's — and the asymmetry is the point: a signing-time parameter would record a value the signature did nothing with.
4. **Round-trip verification** — the recorded value survives write and re-read through the ledger. **No separate refusal is added:** a result produced under another grammar carries another `pipelineVersion`, and the promotion gate already refuses it; `closureRendererVersion` is the *name* for what that digest hides, at `['audit']`.
5. **The result surface carries it too — decided, not deferred.** `verificationResultSchema` already carries `rendererVersion` (`src/verification/result.ts:235`) at `['audit']` (`accounting.ts:371`), so a result verifier is *given* the condition-renderer grammar identity today. Leaving the closure renderer out would answer that question for one grammar and not the other, on the same record. **`pipelineVersion` is not a substitute**: it is a digest, so it proves *that* something changed without saying *what*, which is the exact reason `RENDERER_VERSION`'s docstring says a named version exists. `RESULT_SCHEMA_VERSION` is **already** moving to `1.3.0` for the pin fields, so the field is free now and would otherwise force a second bump later — the outcome this decision exists to prevent. **`result.closureRendererVersion` at `['audit']`**, matching `result.rendererVersion`. **Tooth B15:** a published result's `closureRendererVersion` equals the constant. **M-B18:** omit it from the result while keeping it on the signature → B15 reds.
6. **Tooth B14 — the recorded value is the result's.** A signature's `closureRendererVersion` equals its result's, and the result's equals `CLOSURE_RENDERER_VERSION` (B15). **M-B16:** take it from the constant or a parameter at signing instead of from the result → B14 reds on a result recorded under a different grammar.

**A-E2-6 is narrowed accordingly.** It no longer covers *whether* the field should exist — that is settled — but only an **unexpected additional schema or version consequence**: if adding it forces a second ledger variant, a further schema version beyond `RESULT_SCHEMA_VERSION 1.3.0`, or a migration of existing ledger lines, **stop and report** rather than absorbing it.

#### 6.5.6 The review-sheet surface, specified exactly

*"Standing columns"* was underspecified once the ledger carries three separate document facts plus a signature-level one. **Every one of the four must actually appear**, and **none of the four is required by a `FIELD_ROLES` role** — all are `['integrity','audit']` or `['audit']` (§6.5.4, §6.5.5). The obligation is spec §16 condition 5's *"document standing, reaching verification"*: a verifier who cannot see that a pinned document is adopted-not-effective, or which grammar produced the closure text, has not been reached. The teeth below are what make that mechanical.

**The signature-metadata table** (`src/cli/review-sheet.ts:999–1018`, the `signoff` `row(label, value)` list) gains one row, immediately after `rendererVersion` (`:1011`):

```
row('closureRendererVersion', esc(signature.closureRendererVersion))
```

**The pins table** (`:1020–1030`) goes from four columns to **seven**:

| Column | Source | Format |
|---|---|---|
| `docId` | existing | unchanged |
| `version` | existing (`versionLabel`) | unchanged |
| `sha256Normalized` | existing | unchanged |
| `normalizer` | existing (`normalizerVersion`) | unchanged |
| **`authenticity`** | `artefactAuthenticity` | the enum value verbatim — `authentic_publication`, `official_consolidation` or `official_pre_publication_text` |
| **`standing`** | per-source temporal standing | **`SRC-NNN in_force`**, one entry per served source, **sorted by `sourceId`** and joined by `; `. **Source ids are preserved, never collapsed** — the multi-source case is exactly where a reader needs to know *which* source is not yet effective. Example: `SRC-001 in_force; SRC-008 adopted_not_effective` |
| **`nonOperative`** | `nonOperativeSections` | the declared headings in authored order, joined by `; `; **`—`** when the canonical `[]` |

The empty-state row at `:1023` carries `colspan="4"` today and becomes `colspan="7"`; missing it would leave a malformed table rather than a visible defect, so it is named here.

**B11a–B11d cover all four surfaces, each able to red alone.** A temporal-standing-only assertion does not justify `display` on the other pin fields, nor prove the signature-level row renders at all:

- **B11a** `authenticity` renders the artefact's value, with an `official_consolidation` sibling in the same sheet showing a different one.
- **B11b** `standing` renders **one entry per served source with its `SRC-NNN` preserved**, proved on a **multi-source** document — a single-source-only assertion cannot distinguish a correct renderer from one that prints the first source and drops the rest.
- **B11c** `nonOperative` renders the declared headings, and `—` for a document declaring `[]`.
- **B11d** `closureRendererVersion` appears in the signature-metadata table and equals the constant.
- **M-B14** drop **any one** of the four → the corresponding B11 sub-tooth reds. Four separate mutations, not one: a single mutation deleting all four would let three unbacked `display` claims hide behind one assertion.

### 6.6 Files

| File | Change |
|---|---|
| `knowledge/csrd/sources.json` | **`temporalStanding` per source** (authoritative); `statusAtSnapshot` → `statusNote` (non-authoritative) |
| `src/knowledge/schema.ts` | source schema gains `temporalStanding`; `statusNote` docstring says it carries no machine meaning |
| **`src/types.ts`** (`:303`) | the `SourceRecord` interface mirrors the zod shape and carries `statusAtSnapshot`; it must move with the schema or the two disagree |
| **`test/condition.test.ts`** (`:122`) | builds a synthetic source with `statusAtSnapshot: 'in force'` |
| **`test/pipeline-source-completeness.test.ts`** (`:227`) | the inline `write('sources.json', …)` at `:226–229` sets `statusAtSnapshot: 'in_force'` for `SRC-901`/`SRC-902`, **both of which are served** in that world — under **B9's fail-closed rule they refuse immediately** unless given a structured `temporalStanding`. This is the largest single test consequence of B9 and the previous draft missed it |
| `src/corpus/types.ts`, `schema.ts` | `artefactAuthenticity`, `nonOperativeSections` on `CorpusDocument` |
| `src/corpus/closure.ts` | signature `(index, entryDocIds, standing, policy?)`; R-b over both branches; canonical line; `CLOSURE_POLICY_V1` with `expansion: 'served_sources_in_force'`; `STRUCTURAL_EDGE_KINDS` docstring |
| `src/index.ts` | re-export signature follows |
| `src/cli/sign.ts` (`:343`), `src/cli/review-sheet.ts` (`:508`), `src/cli/run.ts` (`:181`) | supply the pack at their `EntitledClosure.forSources` calls |
| `src/pipeline/entitlement.ts` | derive `DocumentStanding` from the pack; pass standing to `computeClosure`; `EntitledDocument` gains the projection; `renderEntitledClosure` emits standing **and** the operative-status clause; **declare `CLOSURE_RENDERER_VERSION = '1.0.0'`** |
| `src/pipeline/identity.ts` | `PIPELINE_IDENTITY_SCHEME` → `v3`; `identityPayload` gains `closurePolicy.expansion` and a `closureRendererVersion` input field |
| `src/verification/result.ts` | `resultSchemaVersion` literal → `1.3.0` (`:233`); `corpusPinSchema` parse site (`:240`); **`closureRendererVersion` beside `rendererVersion` (`:235`)** |
| `src/verification/corpus-pin.ts` | pin gains the standing fields |
| `src/verification/accounting.ts` | new `FIELD_ROLES` rows at **`['integrity','audit']`** under **both** `ledger.signing.corpus[].*` and `result.corpus[].*` (§6.5.4 — no `display`, because these fields decide); plus **`ledger.signing.closureRendererVersion`** and **`result.closureRendererVersion`**, both at **`['audit']`**, matching their `rendererVersion` siblings |
| `src/verification/sign.ts` | `CorpusPin[]` construction (`:340–346`) populates the new pin fields; `buildSignature` copies `closureRendererVersion` from the result beside `pipelineVersion` (`:366`) — no new parameter (R-7) |
| `src/verification/ledger.ts` | `corpusPinSchema` parse site (`:126`); **`signingEntrySchema` (`:112–138`) gains `closureRendererVersion`** beside `rendererVersion` (`:124`) — §6.5.5 |
| `src/verification/current-state.ts` | `forFreshness` — deliberate decision to exclude standing (§6.5.4) |
| `src/verification/render.ts` | narrow `RENDERER_VERSION`'s docstring to the condition renderer |
| `src/pipeline/transcript.ts` | correct the stale *"stays `1.2.0`"* sentence |
| `src/cli/review-sheet.ts` (`:999–1030`) | the exact columns and rows in §6.5.6 — three new pins columns, the `colspan` correction, and the `closureRendererVersion` metadata row (teeth B11a–B11d) |
| `src/cli/ingest.ts` | the CLI contract in §6.6.1 — **not** invented during implementation |
| `corpus/index.json` | both new fields on the four existing documents |
| `frontend/web/lib/pack.ts` (`:419–423`) | **repoint `traceSeries` from regex over `statusAtSnapshot` to `temporalStanding`** — a second, undeclared derivation of standing that D-5 forbids (§6.5.2) |
| `test/` | `corpus-closure`, `pipeline-entitlement`, `pipeline-reader`, `pipeline-seam`, `pipeline-closure-citability`, `cli-sign`, `cli-review-sheet`, `corpus-store`, `corpus-src002-ingestion`, `corpus-src005-ingestion`, `verification-pins`, `verification-accounting`, `pipeline-replay`, `replay-fixtures`, **`record-replay-fixture` (the generation table and the "did not move" prose — §6.5.4 step 1)**, `source-register`, `knowledge-integrity`, `corpus-ingest` (the CLI contract, B12/B13), plus the new standing/traversal world. **`signingEntrySchema` is `.strict()` (`ledger.ts:138`), so a required `closureRendererVersion` reds every hand-built signing entry**: `verification-ledger` (`unsignedSigning()` at `:45–73` sets `rendererVersion` at `:56` and no closure renderer) and `verification-sign` (the signature now copies a result field that its fixtures must carry) are therefore in scope and named. **Frontend:** `frontend/web/test/fixture-repository.ts` (`computeClosure` arity, the `'1.2.0'` literal, a hand-built signing entry) and a **new** `frontend/web/test/trace-series.test.ts` — no `traceSeries` test exists today. **Verified 2026-09-04:** `pipeline-fixtures.ts` (standing on the four fixture sources — not comment-only), the thirteen `'1.2.0'` files, the fourteen hand-built signing entries and `provider-adapter` (`GOLDEN_IDENTITY` re-derived under a written disposition) are in scope; the complete set is the §6.5.4 name sweep's, not this table's |

#### 6.6.1 The ingest CLI contract, specified here

`src/cli/ingest.ts` parses with `arg(argv, name)`, which is `indexOf`-based and therefore returns **only the first** occurrence of a flag. Repeatability has to be designed, not assumed.

| Flag | Required? | Repeatable? | Behaviour |
|---|---|---|---|
| `--authenticity <value>` | **required** | no | one of `authentic_publication \| official_consolidation \| official_pre_publication_text`. **No default** — an artefact whose authenticity nobody stated must not be ingested, and inferring it from the URL or the selector would be the free-text inference D-5 removes |
| `--non-operative-section "<heading>"` | optional | **yes** | each occurrence appends one heading. Absent ⇒ **`[]`**, the canonical empty (§6.3) — never `undefined` |

**Repeatability needs a second helper**, since `arg()` cannot express it: a sibling `args(argv, name): string[]` collecting **every** occurrence. A comma-joined single flag was rejected — `--serves` can use commas because `SRC-NNN` cannot contain one, whereas a section heading can.

**Preflight validation, before any write and beside the existing origin-authority preflight:** `--authenticity` must parse against the enum, naming the value and the permitted set on failure; each `--non-operative-section` must be non-empty and already-trimmed, and the collected list must be duplicate-free — the same rules the schema enforces, applied at the boundary so a refusal happens before bytes land. On any failure ingest exits non-zero having written nothing, keeping the promise `corpus-ingest.test.ts` already makes.

**Usage text** gains both flags. Two teeth: **B12** a repeated `--non-operative-section` yields both headings in order, and omitting it yields `[]`; **B13** an unknown `--authenticity` value is refused before any write, with `index.json`, `raw/` and `normalized/` byte-unchanged.

**The three CLI rows above are `forSources` callers, not `computeClosure` callers** (§1.4). Neither `sign.ts` nor `review-sheet.ts` calls `computeClosure`; both — and `run.ts` — call `EntitledClosure.forSources`, whose signature gains the pack, so all three must be crossed. The previous draft's claim that they needed no change was a non sequitur.

### 6.7 Teeth and mutations

- **B1** No role-facing request omits standing: every document in a rendered closure carries it, over the real pack.
- **B2 — the C-2 invariant.** Changing `artefactAuthenticity`, `nonOperativeSections`, **or** a served source's `temporalStanding` moves `corpusClosureSha256`.
- **B3** An `adopted_not_effective` document's render states it; an `in_force` sibling in the same test carries no such marker.
- **B4a–B4i** the operative-status clause reaches reader, each prosecutor and the adjudicator; a document with no declared sections renders no *always* component; the three standing projections render distinctly, including **mixed**, and are **not** gated on a declaration; the clause characterises neither the remainder nor the declared sections; and the canonical-form rules are enforced (§6.3).
- **B5** `CorpusPin` round-trips the new fields through sign and verify.
- **B6** A multi-source document renders one entry per served source, sorted.
- **B7 — the `packFlags` biconditional (§6.1).** Reds in **both** directions: if `packFlags.revised_esrs_in_force` is `true` while `SRC-007.temporalStanding !== 'in_force'`, **and** if it is `false` while the standing *is* `in_force` — the direction that catches a pack whose flag lags the standing. Same for `voluntary_standard_in_force`/`SRC-008`.
- **B8** The retired generation is still readable and still filtered by `SUPERSEDED_RUN_IDS`.
- **M-B1** drop standing from the closure line → B2 reds (not a golden diff).
- **M-B2** drop standing from the render → B1 reds.
- **M-B3** derive authenticity from `temporalStanding` → §6.2's table reds on `DOC-32026L0470` (authentic **and** in force).
- **M-B4** derive standing from `versionLabel` → reds on `DOC-32022L2464`, whose label says neither.
- **M-B5** reduce the per-source list to a scalar → B6 reds.
- **M-B6 / M-B7 / M-B9** as §6.3 — delete the clause; drop `nonOperativeSections` from the closure line; make the second sentence fixed text rather than a standing projection.
- **M-B12** collapse the mixed case into the all-`adopted_not_effective` form → **B4f** reds.
- **M-B15** restore *"The remainder of this document is its operative material"* to any rendered form → **B4h** reds.
- **M-B13** accept `undefined` as equivalent to `[]` → **B4g** reds, and the two spellings would otherwise hash differently.
- **B9 / M-B10** the fail-closed standing rule (§6.1).
- **B10 — `CLOSURE_RENDERER_VERSION` is hashed:** changing it moves `pipelineVersion`.
- **B14 / B15 — the result records it and the signature copies it** (§6.5.5): the result's `closureRendererVersion` equals the constant (B15); the signature's equals the result's (B14). **M-B16:** take it from the constant or a parameter at signing → B14 reds. **M-B18:** omit it from the result while keeping it on the signature → B15 reds.
- **B7b / M-B19** the `changeWatch` agreement (§6.1).
- **T5 / M-T5** the reference branch (§6.4).
- **B16 / M-B20** the standing-era partition (§6.5.4).
- **B17 / B18** the behavioural `expansion` field — closures under both values, and `pipelineVersion` moving between them — with **M-B8** restated (§6.5.2).
- **B11a–B11d — every rendered surface is backed** (§6.5.6): authenticity; per-source standing with `SRC-NNN` preserved, proved on a multi-source document; declared non-operative sections including the `[]` case; and `closureRendererVersion` in the signature metadata. **None of the four rests on a `FIELD_ROLES` role** — all are `['integrity','audit']` or `['audit']`, and the rendering obligation is spec §16 condition 5's, proved here. **M-B14** is four mutations, one per surface.
- **B12 / B13 — the ingest CLI contract** (§6.6.1): a repeated `--non-operative-section` yields both headings in order and its absence yields `[]`; an unknown `--authenticity` value is refused before any write, with `index.json`, `raw/` and `normalized/` byte-unchanged.
- **M-B8** leave the closure-policy identity out of `identityPayload` → a test asserting `pipelineVersion` moves when traversal semantics change reds.
- **M-B11** remove `CLOSURE_RENDERER_VERSION` from `identityPayload` while leaving the export → **B10** reds.

**Commit boundary:** one commit. *Say what a document is before showing it to anyone.*

---

## 7. Boundary B-T12 — ingest the two HTML artefacts

Parent plan Task 12. **Zero edges.** Gated on B-NORM, B-E2, B-INGEST and B-E4 landing green **and on A-0 reading *unpublished, served, unobjected* on the day** (§10.1). As of 2026-09-04, A-0 (b) holds (§2.4): B-T12 is not runnable.

### 7.1 Artefacts — complete, no ellipses

| Field | `DOC-C2026-5010` | `DOC-C2026-5011` |
|---|---|---|
| **canonical URL** | `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=intcom:C%282026%295010` | `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=intcom:C%282026%295011` |
| **title** *(exact, as served)* | `COMMISSION DELEGATED REGULATION (EU) …/... of 3.7.2026 amending Delegated Regulation (EU) 2023/2772 as regards the simplification of certain sustainability reporting standards` | `COMMISSION DELEGATED REGULATION (EU) …/... of 3.7.2026 supplementing Directive 2013/34/EU of the European Parliament and of the Council by establishing sustainability reporting standards for voluntary use by undertakings protected by the value chain cap` |
| **docId** | `DOC-C2026-5010` | `DOC-C2026-5011` |
| **slug** | `C2026-5010` | `C2026-5011` |
| **rawPath** | `raw/C2026-5010.html` | `raw/C2026-5011.html` |
| **normalizedPath** | `normalized/C2026-5010.txt` | `normalized/C2026-5011.txt` |
| **versionLabel** | `adopted text of 3 July 2026 (C(2026) 5010 final); no OJ number assigned` | `adopted text of 3 July 2026 (C(2026) 5011 final); no OJ number assigned` |
| **retrievedOn** | the ISO date of the B-T12 fetch, recorded at ingest | same |
| **contentSelector** | `#text` | `#text` |
| **serves** | `["SRC-007"]` | `["SRC-008"]` |
| **edges** | `[]` | `[]` |
| **artefactAuthenticity** | `official_pre_publication_text` | `official_pre_publication_text` |
| **nonOperativeSections** | `["EXPLANATORY MEMORANDUM"]` | `["EXPLANATORY MEMORANDUM"]` |

**`title` is the served official title, reproduced without paraphrase**, including the unassigned `(EU) …/...` expression (U+2026 followed by `/...`) — itself evidence of pre-publication status. The previous draft carried explanatory paraphrases with parenthetical summaries; those are gone, and stable C-document identity lives in `docId` and `versionLabel` rather than in a rewritten title.

**One transformation is applied and is declared rather than glossed as "verbatim".** EUR-Lex serves the heading as **three blocks**:

```
COMMISSION DELEGATED REGULATION (EU) …/...
of 3.7.2026
amending Delegated Regulation (EU) 2023/2772 as regards the simplification of certain sustainability reporting standards
```

`title` is a **single-space flattening** of those three, in order, with no other edit. `CorpusDocument.title` is a one-line field, so some flattening is unavoidable; naming the separator and the block boundaries is what keeps it checkable. The date appears in both `title` (because the official heading contains it) and `versionLabel` (because the artefact is identified by it) — that is duplication of a *measured* fact, not two authorities for a claim.

`versionLabel` is deliberately neutral — it names the artefact and its date and records that no OJ number is assigned. It makes **no claim about legal effect**; effect is carried by `temporalStanding` (§6.1).

**`sha256Raw`, `sha256Normalized` and `normalizerVersion` are deliberately absent from this table.** They are *measured at ingest*, not authored, and §2's 16-hex values are a pre-flight observation of a live page, not a commitment — §10.1 may replace the artefact entirely. Recording them here as if authored would invite "update until they match". `normalizerVersion` will be `1.0.2` (§6.5.2).

Origin rows — **two, one per source, `exact_query`, naming only these canonical URLs** — land in this commit, not in advance. `temporalStanding` for `SRC-007`/`SRC-008` is declared in B-E2.

### 7.2 Files, and how the impacted set is actually determined

**The lesson of this plan's own review history.** Five successive reviews each found impacted assertions that a hand-enumeration had missed — including in tables written specifically to fix the previous miss. That is evidence about the method, not about any reviewer: **a plan cannot enumerate by hand every assertion that depends on a global property of the real corpus.** So this section stops trying. The table that follows is **illustrative and known-incomplete**, and must never be read as a coverage claim.

**B-T12's first step, before any expectation is edited:**

```
1. build the candidate world (both artefacts + both origin rows)
2. capture the test-set as NAMES, not a count:  npx vitest list --run   (in BOTH workspaces)
3. diff names before/after, and run the suite
4. disposition every difference
```

**Every red:**

```
(a) an expectation that is simply now different   → update it, recording the old value
(b) a witness that has died                       → retarget to a purpose-built world
(c) an unexpected failure                         → STOP; something else moved (A-T12-3)
```

**Every silent change — and this is the half a red-only sweep misses:**

```
(d) a test NAME that disappeared from the list    → a vanished case; disposition as (b)
(e) a test that still passes on a DIFFERENT branch → widen the assertion to pin the
                                                     branch or reason it now exercises
```

**(d) is a name-set diff, never a total count.** A scalar total is the wrong instrument for a partition that redistributes, and this suite proves it: `pipeline-source-completeness.test.ts:730` `it.each(DETERMINISTIC_GAP)` registers **2** cases today and `:738` `it.each(MODEL_REACHABLE)` registers **14**. After B-T12 they become **0 and 16** — those two blocks total 16 both times (the file registers 31 cases in all) and the suite total stays **1574**, so a count check never fires while two halt-assertions vanish silently. `it.each([])` registers zero tests and passes without error in the pinned vitest **2.1.9** (verified by probe), so nothing else announces it either.

**(e) exists because a green test can change meaning.** `corpus-src002-ingestion.test.ts:226–253` asserts only `{docId, sourceId}` and keeps passing once the refusal reason moves from `'no declaration'` to `'no matching authorised origin'`.

**What is and is not mechanical, stated plainly.** Steps 1–4 mechanise (a), (b), (c) through the suite run and (d) through the name diff. **They do not mechanise (e) at all** — an (e) test's name is unchanged and it still passes, so nothing in the sweep points at it. Two partial instruments narrow the search without closing it: every file the red set or the name diff touches must have its *remaining green* tests re-read for a moved branch, and any assertion matching on a refusal, gap or status **value** must pin that value rather than only its subject. Beyond that, **(e) is found by hand** — the method this section has just called unreliable. That residue is real and is not dressed up: it is why A-T12-2 gates on coverage judgment rather than on a green suite, and why the witness classes below are named rather than counted on.

#### Known impacted sites — a floor, not a set

| File | Change |
|---|---|
| `corpus/index.json`, `corpus/raw/`, `corpus/normalized/` | the two artefacts |
| `monitoring/source-register.json` | two `exact_query` `authorisedOrigins` rows |
| `test/corpus-src002-ingestion.test.ts:316–326` | `expect(bearing).toEqual(['CSRD-S-011','CSRD-S-012'])` → `[]`; `toBe(14)` → `16` |
| `test/corpus-src002-ingestion.test.ts:339–348` | separate `it()` asserting `gapsOf('CSRD-S-011') == ['SRC-008']` / `gapsOf('CSRD-S-012') == ['SRC-007']`; both become `[]` |
| `test/corpus-src002-ingestion.test.ts:226–253` | **(e)** — stays green while the refusal branch changes; comment `:230–233` goes false |
| `test/corpus-src005-ingestion.test.ts:291, :302–303, :321–334` | `docsForSources(index,['SRC-007']) === []`; `corpusServes('SRC-007') === false`; `docIds === [DOC]`; `bearing` contains `CSRD-S-012` |
| `test/pipeline-reader.test.ts:924–936, :991–1025` | S-012's halt in full. *(The block at `:858–901` survives — `toEqual([])`, `toHaveLength(16)`, `>0` at `:900` — but its comments at `:888–889`, `:893–898` go stale. `:991–1025` is the impacted half of an `it` running `:991–1071`.)* |
| `test/pipeline-source-completeness.test.ts:85, :463, :465, :512–523, :557, :565, :570, :626–653, :723, :724, :730` | `PARTIAL`; S-011's `SRC-008` gap; **`:512–523`, S-011 through `runRun` over the real world asserting zero requests**; S-012's `SRC-007` gap; **the `unresolved_gap` sign-gate witness at `:630–653`**; `DETERMINISTIC_GAP`; `toHaveLength(14)` → `16`; **`:730` vanishes silently — (d), by name, not count** |
| `test/pipeline-source-completeness.test.ts:496–510` | **(e)** — `corpusClosureSha256` is compared against `closureShaFor(REAL, PARTIAL)`, so both sides move together and it stays green while ceasing to be a gap-bearing run |
| `test/cli-run.test.ts:103, :450` | `GAP_REQ = 'CSRD-S-012'` exercising a gap-bearing run — `:450` reds |
| `test/cli-run.test.ts:616, :745` | **(e)** — `:616` refuses on `no_execution_capability` **before** orchestration begins (`verifyRun(…, {})`, no capability), so all four assertions survive while the test silently stops exercising a gap-bearing run; its comment `:610–615` explains the guard precedence it still proves. `:745` sweeps `GAP_REQ` and stays green |
| `test/corpus-authority.test.ts:97–116` | `{sourceId:'SRC-007', reason:'no declaration'}`. Its own comment (`:103–104`) already predicts *"which will need this fixture repointed again"* |
| `test/corpus-ingest.test.ts:556–566` | `toContain('no declaration')` for `SRC-007` |
| `test/corpus-ingest.test.ts:655–685` | **(e)** — asserts only doc/source/`'Nothing was written.'`, so it passes on the new branch; comment `:655` goes false |
| `test/corpus-authority-roots.test.ts:101` | `toContain('no declaration')`. `buildWorld` copies the **real** `monitoring/` and `corpus/` (`:51–52`) and relabels `DOC-32013L0034` to `serves:['SRC-007']` (`:63`); once declared, the `'no declaration'` branch at `src/corpus/authority.ts:167–172` stops firing and control reaches `'no matching authorised origin'` at `:173–175`. Proves the **wiring**, where `corpus-authority.test.ts` proves the validator — a separate retarget decision |
| `test/corpus-authority-roots.test.ts:126–142` | **(e)** — asserts only `toMatch(/SRC-007/)`; same silent branch change |
| **`test/pipeline-closure-citability.test.ts:221–242, :244–254`** | **REDS, and not for a partition reason.** `registerWith` (`:54–64`) reads the **committed** register and appends; `src/monitoring/register.ts:167–172` refuses a `sourceId` declared more than once **across rows** — distinct from the per-row origin-key check at `:181–193` that C-1 concerns. Once B-T12 declares `SRC-007`, the fixture's appended `SRC-007` row makes `parseSourceRegister` **throw at `:232` and `:248`**, before any assertion. The test's own comment (`:225–228`) predicts exactly this |
| `test/source-register.test.ts:747–758` | **stays green only because B-T12 lands the register rows and the artefacts in one commit.** It asserts `declared == served` over the real register and corpus, so rows added *ahead* of the artefacts would red it — a real ordering constraint on §7.1. Comment `:748–754` goes false |
| **`frontend/web/test/pack-authority.test.ts:102–108`** | relabels `DOC-32013L0034` to `SRC-007` and asserts `'no declaration'` — **reds after B-T12**, and an engine-only `vitest list` never sees it. Witness class 2's **fourth** member (added 2026-09-04) |
| `test/pipeline-reader.test.ts:939–989` | **(e)** — stays green while ceasing to exercise the gap producer; its own comment records two earlier subject changes |
| new `test/corpus-t12-ingestion.test.ts` | C0–C8 |

**Checked and *not* affected:** `test/cli-review-sheet.test.ts:95`'s `SELECTION = 'CSRD-S-012'` asserts nothing partition-dependent — `:836–837` check `toContain('DOC-32023R2772')` and the absence of the empty-surface warning, both still true. Only its comment at `:831–834` goes stale.

#### Four witness classes die, and each needs replacing rather than deleting

1. **The gap machinery**, across five files — `corpus-src002-ingestion`, `corpus-src005-ingestion`, `pipeline-reader`, `pipeline-source-completeness`, `cli-run`.
2. **The `'no declaration'` origin refusal**, as four propositions in four files — the validator (`corpus-authority`), the ingest path (`corpus-ingest`), the wiring (`corpus-authority-roots`) and the frontend resolver (`frontend/web/test/pack-authority.test.ts:102–108`). After B-T12 **every cited source** carries a declaration, so the real register no longer models an undeclared cited source at all.
3. **The `unresolved_gap` sign gate** (`pipeline-source-completeness:630–653`): with no gap-bearing requirement, the real pack no longer witnesses a refusal to sign over an unresolved gap.
4. **The multi-source citability fixtures** (`pipeline-closure-citability:221–254`), which depend on `SRC-007` being *undeclared in the committed register* so their appended row does not collide. They must move to another undeclared source or to a fully synthetic register.

All four move to **purpose-built worlds** inside B-T12; **A-T12-2 covers them**. Retargeting is required work inside this boundary, not a follow-up — deleting or weakening those assertions would retire the coverage silently.

### 7.3 Evidence — including the T9 run-level standard

- **C0 — mechanical dependency on B-E2.** In a scratch copy of the pack with `SRC-007`'s `temporalStanding` removed, `EntitledClosure.forSources` for S-012 **refuses** (B9), naming `SRC-007`; over the real pack it succeeds. This makes B-T12 depend on B-E2 by construction rather than by ordering: an artefact serving a source without standing cannot become evidence.
- **C1** Ingest through the production path; each fetch answered **200 at the declared URL with no redirect** (B-INGEST, §5.4 — a 302 or a 202 interstitial is a refusal, not an artefact); both hashes reproduce; the raw-reproduces-normalized check passes under `NORMALIZER_VERSION 1.0.2` **unchanged**.
- **C2** Structural boundaries pinned: each normalized text contains `EXPLANATORY MEMORANDUM`, `HAS ADOPTED THIS REGULATION`, its Article headings and its Annex headings, in that order, at recorded offsets. *(Structure only — D-3 is discharged by §6.3, not here.)*
- **C3** **S-011 resolves with no provenance or schema change:** its closure holds `DOC-C2026-5011`, whose text contains Annex II's cap catalogue. `whole_document` on `SRC-008` is truthful because one artefact carries act and annex.
- **C4** **S-012's locators resolve:** the text contains Article 2(1)(a) and Article 3.
- **C5 — the closure-digest propositions, against the *landed B-E2* baseline.** The previous draft compared against `89b0b86`'s digests. That was wrong: **B-E2 moves every closure digest** (§6.5.4), and B-T12 runs after it, so the digests at `89b0b86` do not survive into this boundary and must not be described as if they do. The comparison is against a baseline **captured, not authored**:
  - **C5-0 — capture.** Immediately after B-E2 lands and before B-T12 changes anything, record all sixteen `corpusClosureSha256` values through the production constructor. **This plan does not author their literal values**, and must not: they are outputs of a boundary that has not run.
  - **C5a** **S-011's digest moves** — `DOC-C2026-5011` enters as a cited-source entry point; its closure goes from two documents to three.
  - **C5b** **S-012's digest moves** — `DOC-C2026-5010` enters as a cited-source entry point; its closure goes from one document to two.
  - **C5c** **The other fourteen are byte-identical to the captured baseline.** Cardinality is unchanged by B-E2 and may be stated here: twelve share one digest and two share another, and the twelve-group is what remains of a thirteen-member group once S-011 leaves it. **Zero edges is what proves C5c** — no unrelated requirement acquires either document by structural traversal.
  - **M-C3** add any structural edge from either new document to `DOC-32013L0034` → **C5c reds**, naming the requirements that wrongly acquired it.
- **C6 — run-level reachability, the T9 standard.** Through `runRun` with a **stub replay runner** and `installNetworkTrap()` armed:
  - S-011 and S-012 each become **model-reachable**;
  - each produces exactly **`2 + prosecutorCount` = 5** requests (1 reader, 3 prosecutors, 1 adjudicator);
  - **`installNetworkTrap().calls` is explicitly `[]`**, asserted;
  - **no live provider call occurs** — structurally, because the runner is a replay stub, with the trap as corroboration;
  - the final partition is **exactly 16 reachable / 0 gap-bearing**, measured over all sixteen — **a gate, not a headline**: it measures that every cited source is served, and says nothing about entitlement quality or context feasibility (D-U2, §11.2).
- **C7 — the gap machinery stays independently alive**, proved in purpose-built worlds (§7.2), with its own zero-request assertion so "no requirement gaps" cannot be confused with "gapping no longer works".
- **C8 — sizes recorded, not judged** (§2.3): resulting rendered-closure sizes for S-011 and S-012 recorded as measurements; every context conclusion deferred to Task 13.
- **M-C1** corrupt one byte of a normalized file → `loadCorpus` reds naming `sha256Normalized` **for that docId**.
- **M-C2** remove an origin row → ingest refuses before any write (A11).

**Does NOT prove:** that either act is in force. The point of the standing field is that it never can.

**Commit boundary:** one commit. *Serve the two acts that are adopted but not yet law.*

---

## 8. Deferred

**E1 — PDF extraction.** Not required for Task 12 (§2, §3.1). **Not retired**: spec §16 conditions 1 and 3 remain valid for any artefact with no official HTML expression. **Reopens if** the HTML expression is withdrawn or proves incomplete for a cited locator (A-T12-1), or a newly cited source is PDF-only. `NORMALIZER_VERSION` stays `1.0.2`; no dependency is installed.

**E3 — lifecycle successor relation.** No subject exists (§2.2). **Reopens when** an OJ/CELEX expression appears (§10.1). Its acceptance condition — a lifecycle relation must not change any `corpusClosureSha256` — is honoured negatively meanwhile by B-T12's zero-edge rule.

**N-1 — pre-fetch authority check.** Deferred hardening (D-11, §5.4). The no-write guarantee remains mandatory.

**B-OJ — the post-publication cascade, as two dated events (corrected 2026-09-04, R-4).** The previous revision chained *"temporalStanding → in_force"* and the `packFlags` flip off *OJ publication*. That conflates two events. For C(2026) 5010, Article 3 anchors entry into force to adoption plus four months plus one week (§2 — the placeholder is unfilled); for C(2026) 5011, Article 4 sets it at the third day after publication (audit, 2026-09-02; re-read at A-0, never inferred). Publication is an earlier, separate event, and register row W-005's `governs` — *"the moment pending law becomes effective law"* — is wrong for 5010. Under B7's biconditional, following the old cascade at publication would either assert `in_force` before the act is law (S-012 selects the revised ESRS early — product law 4) or red B7. The two-axis model already represents the intermediate state: `authentic_publication` **with** `adopted_not_effective`. Named, not planned — no speculative file list, because the artefacts do not exist yet:

```
Event 1 — OJ publication            (date: as published; never inferred)
  → A-0 (a) fires (§10.1): the preferred artefact is recomputed, not ingested by default
  → the OJ expression is a NEW artefact, artefactAuthenticity = authentic_publication,
    at an ELI path the existing exact / path_prefix kinds already cover
  → temporalStanding UNCHANGED: adopted_not_effective — standing is the instrument's
  → E3 acquires its subject: pre-publication text and OJ text are two artefacts of one
    instrument, related by lifecycle metadata outside closure traversal (spec §9)
  → the pre-publication artefacts are retained, not replaced (spec §9: "both are preserved")
  → W-005's governs text is corrected to name publication, not effect
  → no packFlags, pack.version, golden or legalSnapshot movement

Event 2 — entry into force          (date: per the act's own article, read from the OJ text)
  → the instrument's temporalStanding moves adopted_not_effective → in_force
  → packFlags.revised_esrs_in_force / voluntary_standard_in_force flip, under B7
  → engine/CLAUDE.md:65's documented rule fires: pack.version bumps; legalSnapshot moves
  → both goldens' 22 embedded "csrd@0.1.0 (legal snapshot …)" strings move, and are
    re-recorded under an explicit disposition — legitimate here, because a determination
    HAS moved (S-012's selection changes), unlike in B-E2
  → every closure holding the pre-publication artefact goes stale_closure (staleness.ts:173)
    — correct: the roles read text labelled "not current law"

Branch — objection or withdrawal during scrutiny
  → A-0 (c) fires: stop and report. The standing enum has no value for a withdrawn act
    (`proposed` is not it); representing that state is a legal-modelling decision (D-U4)
```

**The contrast with B-E2 is the point.** B-E2 declines a `pack.version` bump because nothing determinative moves; event 2 takes it because something does. Recording the cascade here stops the golden re-recording from arriving later as an unexplained cost, stops E3 from being reopened before it has a subject, and stops event 1 from being mistaken for event 2.

**Further boundaries the 2026-09-02 audit surfaced — named here and kept out of Route A so its boundaries stay bounded:**

- **B-PROMPT** — corpus text reaches the roles undelimited: `renderEntitledClosure` emits `## docId — title (versionLabel)` plus the raw normalized text (`entitlement.ts:125`) in the pipeline's own heading syntax, and no prompt says closure text is evidence to quote, never instruction to follow. Fence each document with BEGIN/END markers carrying `docId` and hash, escape leading `#` lines, add one rule per prompt. Moves `pipelineVersion` (prompts are hashed) — cheap while no promotion exists. **Must land before the first live run.**
- **B-EVID-SPAN** — `checkQuote` (`src/corpus/evidence.ts:137`) verifies a quote by hash plus substring over the whole normalized text, so a quote drawn entirely from a declared non-operative section passes every gate. C2 records the declared headings' offsets; a quote whose every occurrence lies inside a declared span can be flagged at sign time. Until then §6.3's rule is **disclosure to the roles only**; §6.3 and §7.3's *"Does NOT prove"* are read with that limit.
- **W-005 `governs` prose** — one register line, never consulted by matching; corrected at event 1 or as a micro-boundary.
- **S-011's `SRC-008` locator is `whole_document`**, so A-T12-1 cannot fire for it and C3's substring check is the only content guard. Tightening it to provision locators moves a requirement version and is a post-Route-A decision.
- **Product law 4 has one operative owner** — obligations are gated only by the requirement's `legalStatus` (`obligations.ts:24`), and nothing links a source's standing to a requirement's status. S-011 derives its obligation from the in-force Directive and uses `SRC-008` conditionally, so **no blanket rule is adopted**; the logical use of each non-in-force source is traced per requirement before any model change.
- **`verify sign --skip-suite`** (`verify.ts:233`) sets `testSuiteGreen` without recording the skip in the ledger entry. Inert while `unpromoted_pipeline` refuses every signature; must be closed — record the skip in `note`, or gate it on an explicit environment token — **before the first promotion record exists.**

---

## 9. Protected artefacts

| Artefact | Status |
|---|---|
| `L_2022322EN.01001501.xml.pdf` (user-owned, untracked) | **never** opened, moved, altered or included |
| `docs/superpowers/plans/2026-08-24-b3-benchmark-and-promotion.md` (user-owned, untracked) | **never** opened, moved, altered or included |
| `verification/requirement-versions/csrd.json` | append-only; **no requirement version moves in this plan** |
| `test/golden/*.json` | unchanged; neither embeds a corpus hash |
| `test/verification-transcripts/csrd/CSRD-S-001/` | append-only. B-E2 retires **one** generation via `SUPERSEDED_RUN_IDS`; nothing deleted or overwritten |
| `verification/CSRD-S-001.md` | unchanged |
| `docs/superpowers/specs/2026-08-24-d1a-corpus-provenance-design.md`, `docs/superpowers/plans/2026-08-24-d1a-corpus-provenance.md`, root `CLAUDE.md` | modified **only** by B-NORM, only as §3 states. **These three files are B-NORM's entire write set** (§4) — root `CLAUDE.md` included, because §3.9's grep contract lives there. No other file in the repository is touched by that boundary |
| The three deferred observations (SRC-005 matcher, `DOC-32013L0034` label, four T9 NITs) | out of scope, unaddressed |
| `src/` under B-FIX-WITNESS | untouched — that boundary is tests only (§4.1) |

---

## 10. Abort conditions

| | Condition | Action |
|---|---|---|
| **A-0** | **Pre-ingest gate, three outcomes** — §10.1 | stop: (a) recompute under B-OJ event 1, (b) wait or re-plan the artefact, (c) report |
| A-FIX-1 | A B-FIX-WITNESS retarget reds anything but the retargeted test, or drops a test name without disposition | stop; the boundary is behaviour-preserving or it is not taken (§4.1) |
| A-NORM-1 | Applying a §3 correction reveals a further contradiction not listed — **including stale text surviving beside a corrected fragment in the same passage** | stop; do not widen the diff. Repair §3, then resume. Fired 2026-09-01; this revision is that repair |
| A-E4-1 | The matcher cannot be expressed generically without naming a host or scheme-specific identifier in production code | stop; abstraction is wrong |
| A-E2-1 | I-2 cannot be implemented without moving a **requirement** version | stop; standing has leaked onto the requirement axis |
| A-E2-2 | T1 and T2 cannot both be green in one world | stop; the rule is a blanket exclusion, not D-6's |
| A-E2-3 | `standing` cannot be a **required** `computeClosure` parameter without a caller that has no pack | stop and report: such a caller builds an entitled closure it cannot justify |
| A-E2-4 | Standing cannot reach entitlement without writing it into the register or the corpus index | stop; the §6.1 ownership decision has failed |
| A-E2-5 | The closure-policy identity cannot enter `identityPayload` without a scheme change beyond `v3` | stop; re-open the §6.5.2 audit |
| A-E2-6 | Recording `closureRendererVersion` has an **unexpected additional** schema/version consequence — a second ledger variant, a version beyond `RESULT_SCHEMA_VERSION 1.3.0`, or a migration of existing ledger lines | stop and report. **Not** an abort on whether the field should exist: §6.5.5 settles that |
| A-E2-7 | The replacement transcript generation cannot be recorded without a network call or a credential | stop; the recorder's no-model guarantee is why these fixtures are admissible evidence |
| A-T12-1 | A cited locator is absent from the ingested normalized text | stop; Route A's completeness premise has failed and E1 reopens |
| A-T12-2 | Retargeting **any** dying witness class would reduce coverage — the four §7.2 names (gap machinery, `'no declaration'` origin refusal, `unresolved_gap` sign gate, multi-source citability fixtures) **and any fifth the sweep surfaces** | stop; §7.2's synthetic worlds are required, not optional |
| A-T12-3 | §7.2's sweep produces a red that is not disposition (a) or (b), **or a name-set difference (d) that no dying-witness class explains** | stop; something moved that this plan did not predict |

### 10.1 The pre-ingest gate (mandatory, three outcomes)

**Immediately before B-T12 runs**, re-verify against the Commission page (register W-004's URL) **and** the declared EUR-Lex URLs in §7.1, with a client that reproduces §2's result — status 200, no redirect, the artefact's strings present. Construct no URL; infer no date, identifier or scrutiny outcome.

| Outcome | Meaning | Action |
|---|---|---|
| **(a) published** — an OJ/CELEX expression exists | Route A's pre-publication artefact is superseded as the preferred artefact | **Stop.** Recompute under B-OJ event 1 (§8): the OJ expression, `authentic_publication`, standing unchanged, an ELI-path declaration the existing kinds cover — `exact_query` unnecessary for *these* artefacts, though not wrong. The pre-publication text may still be ingested as history under E3 — a decision, not a default |
| **(b) not served** — the declared URL answers a redirect, a non-200 status, or a body without the artefact (the 2026-09-04 state, §2.4) | Nothing can be pinned | **Stop.** B-T12 is not runnable. Do not follow a redirect into an ingest and do not substitute a URL; re-run the gate later, or, if the expression is gone, re-plan the artefact |
| **(c) objected or withdrawn** — Parliament or Council objection, or Commission withdrawal | The instrument will not enter into force as adopted | **Stop and report.** The standing vocabulary cannot express it (§8); the representation is the user's decision (D-U4) |

Only *unpublished, served, unobjected* lets B-T12 proceed.

---

## 11. Sequencing and readiness

```
B-PLAN-4       this repair (2026-09-04)                Route A plan only · no gate moves
B-NORM         apply 34 normative passages (§3, §4)    docs only · residue checks · no gate moves
B-FIX-WITNESS  unbind witnesses from live corpus       tests only · go/no-go after B-NORM (§4.1)
B-E2           standing, authenticity, operative       moves every corpusClosureSha256;
               status, identity, traversal             RESULT_SCHEMA_VERSION → 1.3.0,
                                                       PIPELINE_IDENTITY_SCHEME → v3,
                                                       CLOSURE_POLICY_V1 (expansion field),
                                                       CLOSURE_RENDERER_VERSION new 1.0.0
── user decision D-U1 (§11.2): the product milestone next, or continue Route A ──
B-INGEST       ingest response rules (§5.4)           no identity moves · unconditional
A-0            three-outcome gate (§10.1)              read-only
B-E4           exact_query origin matcher              no identity moves · only if A-0 = served
B-T12          ingest two HTML artefacts, zero edges   partition 14/2 → 16/0, as a gate
   or
B-OJ           event 1 / event 2 (§8)                  if A-0 = published
E1, E3, N-1 deferred; B-PROMPT, B-EVID-SPAN, B-STANDING-ALL named (§6.1, §8)
```

**Why B-E2 precedes B-E4 (re-ordered 2026-09-04).** B-E2 is required under every route and for every future adopted act, and it takes the identity bumps once, before any promotion evidence exists. B-E4 serves only the query-addressed pre-publication URLs; an OJ expression sits at an ELI path the existing kinds cover, so B-T12 may never run if publication comes first. B-E4 and B-E2 are independent, so the swap costs nothing. B-E4 still lands before B-T12.

### 11.1 Readiness, per boundary, with the evidence that established it

| Boundary | Ready? | Evidence (date) | What would change the answer |
|---|---|---|---|
| **B-NORM** | **Yes** | pending set verified row by row against the frozen tree, 2026-09-04 (§4); prescriptions `#17`, `#27`, `#28`, `#34`, `#35` repaired or added here | A-NORM-1 on contact — repair §3 again; do not widen the diff |
| **B-FIX-WITNESS** | **Scoped; go/no-go after B-NORM** | seven files carry real ids as fixture roles; `DETERMINISTIC_GAP` shrinks to `[]` at B-T12 and vitest 2.1.9 registers nothing for `it.each([])`; `superseded()` selects by position; `source-register.test.ts:418` hand-copies what `test/audit-expected-provenance.ts:45` exports (§4.1) | taken only if every retarget is behaviour-preserving and every synthetic witness reds against its named defect |
| **B-E2** | **Yes, with §6 as corrected** | §6.4 T5, §6.5.2 R-6, §6.5.4 R-13 and the sweep, §6.5.5 R-7, §6.6 additions — each verified against the tree 2026-09-04 | A-E2-1…7 |
| **B-INGEST** | **Yes** | §5.4; the 2026-09-04 responses (§2.4) are the failing cases A12/A13 reproduce | — |
| **B-E4** | **Yes, conditional on A-0** | §5 as corrected (R-8, R-9); no `index.json` URL carries a query (verified 2026-09-04) | A-0 (a) makes it unnecessary for these artefacts; it stays correct |
| **B-T12** | **No — A-0 (b) holds** | 2026-09-04: the declared URLs answered a 302 and 202 interstitials to a non-browser client (§2.4) | A-0 reading *unpublished, served, unobjected* |
| **B-OJ** | Named, not planned | no OJ expression exists (§2.2; Commission page 2026-09-04) | A-0 (a) |

### 11.2 Decisions that are the user's, and are open

| # | Decision | Why it is not taken here |
|---|---|---|
| **D-U1** | After B-E2: pursue the product milestone — a B2 checkpoint, a named provider adapter, a promotion record, one live run of an already-reachable requirement, `verify sign` — or continue Route A to A-0 | Opening the untracked B3 plan requires authorisation; live provider calls are never authorised by this plan; Route A serves two of sixteen requirements |
| **D-U2** | S-012's full-closure feasibility: after B-T12 its rendered closure is on the order of 1.39M characters (§2.3); spec §15 says a context limit may not decide what the law is, and no candidate model, tokenizer or documented limit is named | Product and legal meaning — whether S-012 is verified over the full closure, over a narrowed one, or declared feasibility-failed. Needed before B-T12's 16/0 is read as more than source coverage |
| **D-U3** | `CW-001.expected` says entry into force *"expected 20 Nov 2026"*; 5010's Article 3 arithmetic (3 July + 4 months + 1 week) gives 10 November | A legal check on pack data; not inferred here |
| **D-U4** | Representation of an objected or withdrawn act (A-0 (c)) | Only if it happens; a legal-modelling choice |
| **D-U5** | `pack.version` stays `0.1.0` at B-E2 (§6.5.2) | Taken and defensible; recorded so it can be reversed at the stated price |

**Settled and not reopened:** D-1…D-12; C-1, C-2; R-1…R-15 (§0.1); `FIELD_ROLES` at `['integrity','audit']` on both pin roots and `['audit']` for both `closureRendererVersion` fields; O-1 with B-STANDING-ALL deferred (§6.1); I-2; the three authenticity values; R-b over every traversal step; raw-search `exact_query`; `statusAtSnapshot → statusNote`.

**No global completeness claim is made.** Each boundary re-reads §11.1 against the tree before it starts, and a finding that changes a boundary's readiness is a dated repair to this plan, not a footnote.
