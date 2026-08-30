# D1a-3 — topology, closure and context measurement

**Date:** 2026-08-30
**Base:** `1849673` *Serve the article the corpus was only amending* (branch `feature/b1b-ii-a-record`)
**Task:** Task 10 of `docs/superpowers/plans/2026-08-24-d1a-corpus-provenance.md`. Spec §15 and §20. **Report only** — no production code, no tests, no corpus artefacts, no requirement data, no dependencies.
**Scope of authority:** this report *measures*. It settles no disposition, changes no contract, and prescribes no target. Spec §22 forbids a model-reachable count from being a goal, and nothing here treats one as such.

Every number below cites the command that produced it. §14 carries the commands and the two measurement scripts verbatim, so the whole report is reproducible at `1849673`.

---

## 1. Method, and what it can and cannot prove

Two independent measurements, deliberately separated, over the full sixteen-requirement population.

**Measurement A — static closure and rendered size.** Built through the real production constructors and nothing else: `loadCorpus`, `parseSourceRegister`, `loadPack`, `authoriseCorpus`, `EntitledClosure.forSources`, `docsForSources`, `closure.corpusServes`, `renderEntitledClosure`, `readerInputFor` + `renderReaderInput`. No traversal, no serving predicate and no renderer is reimplemented; a second implementation would be a second answer to what a signature was entitled to.

**Measurement B — production-path request counting.** `runRun` — the same function `dispatch` delegates to — invoked once per requirement into a temporary world, with `installNetworkTrap()` armed for the whole population and a deterministic replay runner that records every `RoleRequest` it is handed. **No provider was contacted** — and that holds structurally, not merely by observation: the injected runner is a `replay` stub, so no code path to a provider exists in these runs. The trap was armed as a second, independent check and recorded **zero** calls across all sixteen runs (§9); its own doc-comment notes that an empty `calls` array is vacuously green for a runner reaching `node:http(s)` directly, so it corroborates the structural argument rather than carrying it.

**The two are cross-checked against each other.** For all sixteen requirements the `corpusClosureSha256` published in the dossier by Measurement B is byte-identical to the digest Measurement A computed independently through `EntitledClosure.forSources`. An expected value read back out of the artefact under test would agree with a writer that published any closure at all; these are two computations of the same quantity by different routes, and they agree sixteen times out of sixteen.

**Instrumentation lives outside the repository.** Task 10 is report-only, so neither script is committed and neither writes into the repository: both copy `knowledge/csrd`, `corpus`, `monitoring` and `verification/requirement-versions` into `mkdtemp` worlds and remove them afterwards. `git status` is byte-unchanged before and after (§14.4). The scripts are reproduced in full in §14.5 so that "the command that produced it" is a complete instruction rather than a reference to something that no longer exists.

**What this method cannot do, stated before any number.** There is **no tokenizer in this repository** — the engine's only runtime dependency is `zod` (`backend/engine/package.json`), and `grep -rlin "tokenizer\|tiktoken\|countTokens" backend/engine/src backend/engine/test` returns nothing. Adding one is a dependency decision that belongs to envelope E1, not to a report-only boundary. Every character and byte count below is therefore **exact and measured**; every token figure is an **estimate**, labelled as one, with its basis stated (§10). No context-window or B3 feasibility conclusion is drawn from an estimate.

---

## 2. Gates at `1849673`

| Gate | Command | Result |
|---|---|---|
| Engine tests | `cd backend/engine && npx vitest run` | **54 files / 1574 tests, all passing** |
| Frontend tests | `cd frontend/web && npx vitest run` | **7 files / 48 tests, all passing** |
| Typecheck | `cd backend/engine && npx tsc --noEmit` | **exit 0** |
| Standalone | `npm run test:standalone` | **PASS** |
| Program-agnosticism | `grep -ri csrd backend/engine/src/ \| wc -l` | **7** |

These match the landed T9 state exactly. The measurement below was taken against this tree.

---

## 3. The four identity constants

| Constant | Defined at | Value |
|---|---|---|
| `RESULT_SCHEMA_VERSION` | `pipeline/identity.ts:51` | **`1.2.0`** |
| `PIPELINE_IDENTITY_SCHEME` | `pipeline/identity.ts:68` | **`v2`** |
| `TRANSCRIPT_SCHEMA_VERSION` | `pipeline/transcript.ts:102` | **`1.1.0`** |
| `NORMALIZER_VERSION` | `corpus/normalize.ts:20` | **`1.0.2`** |

**All four are unchanged, and no change was intended in this boundary.** `resultSchemaVersion` was additionally read back off all sixteen *published* dossiers in Measurement B and is `1.2.0` in every one — the constant and what the pipeline actually writes agree.

**Which four, and why — a judgement call recorded rather than hidden.** Neither plan §Task 10 nor spec §20 enumerates the set; both say "the four identity constants". Plan §1's reconnaissance table names three (`resultSchemaVersion` / `PIPELINE_IDENTITY_SCHEME` / `TRANSCRIPT_SCHEMA_VERSION`), and D1(a) is a corpus boundary whose fourth governing constant is `NORMALIZER_VERSION` — spec §16.3 and plan §E1 both track it by name as the thing a PDF extractor would bump. That is the reading taken here. So that the choice cannot hide a moved value, the **other three** version constants in the engine are recorded too, and are also unchanged:

| Also recorded | Defined at | Value |
|---|---|---|
| `RENDERER_VERSION` | `verification/render.ts:89` | `1.1.0` |
| `REQUEST_IDENTITY_SCHEME` | `pipeline/request-identity.ts:42` | `v1` |
| `RUN_IDENTITY_SCHEME` | `pipeline/run-identity.ts:28` | `v1` |

Every run in Measurement B produced the same `pipelineVersion`: `pipeline-v2-740eac000de7f3a6f9eb1008b1a197fe8c7f82f6f852e39599af50c0639e1a74`.

---

## 4. What the corpus holds

Four documents, all at `NORMALIZER_VERSION` `1.0.2`. Character counts are of the normalized text a role actually reads; byte counts are the on-disk size of the normalized file.

| `docId` | Serves | Version label | Chars | Bytes |
|---|---|---|---|---|
| `DOC-32013L0034` | `SRC-001` | consolidated, in force from 2026-03-18 (CELEX 02013L0034-20260318) | 269,071 | 271,285 |
| `DOC-32022L2464` | `SRC-002` | consolidated text dated 2026-03-18 (CELEX 02022L2464-20260318) | 138,987 | 139,593 |
| `DOC-32023R2772` | `SRC-005` | consolidated text applicable from 2025-01-01 (CELEX 02023R2772-20250101) | 889,207 | 893,269 |
| `DOC-32026L0470` | `SRC-004` | as published | 133,932 | 134,416 |

**One edge in the whole corpus:** `EDGE-32013L0034-amendedBy-32026L0470`, from `DOC-32013L0034` to `DOC-32026L0470`, `celex_metadata` provenance. Every other document declares `edges: []`.

`DOC-32022L2464`'s pins are `sha256Raw` `6578c015…6821e` and `sha256Normalized` `c9c9780f…6a70`, matching the T9 record.

### 4.1 Source population

| | Sources |
|---|---|
| Cited by at least one requirement | `SRC-001`, `SRC-002`, `SRC-005`, `SRC-007`, `SRC-008` |
| Served by the corpus | `SRC-001`, `SRC-002`, `SRC-004`, `SRC-005` |
| **Cited and unserved** — the residual gaps | **`SRC-007`, `SRC-008`** |
| Served but cited by nothing | `SRC-004` |

The pack's `sources.json` declares **17** sources; the register carries **6** governing-authority rows — exactly the four served plus the two cited-and-unserved. **Eleven declared sources are neither cited nor served and carry no authority row:** `SRC-003`, `SRC-006`, and `SRC-009` through `SRC-017`.

That population is unserved for a categorically different reason than `SRC-007`/`SRC-008` are: nothing depends on any of them, so their absence produces **no gap anywhere** and costs no requirement its reachability. Only a *cited* unserved source halts a run. `SRC-003` is named here because T9 explicitly recorded keeping it separately unserved, but it is one instance of eleven, not the only one — and the separation between "declared but unrelied-on" and "cited but missing" is preserved rather than collapsed.

---

## 5. The partition — exactly 14 reachable / 2 gap-bearing

Measured, not assumed. A requirement is **gap-bearing** when at least one source it cites is unserved; `runBlindReader` then returns before constructing the agent role, so the run halts before the first model request.

| | Count | Requirements |
|---|---|---|
| **Model-reachable** | **14** | S-001…S-010, S-013, S-014, S-015, S-016 |
| **Gap-bearing** | **2** | **S-011** (`corpus_gap` on `SRC-008`), **S-012** (`corpus_gap` on `SRC-007`) |

All sixteen requirements are at **version 3**. Both gap-bearing runs exited `EXIT_OK` — a gap is a recorded finding, not a failure.

---

## 6. Per-requirement topology

`entry` is what `docsForSources` seeds the traversal with; `closure` is what `computeClosure` returns; `inherited` is the difference — documents reached by structural traversal alone.

| Requirement | v | Cited sources | Unserved | Entry | Inherited by traversal | Closure docs | `corpusClosureSha256` |
|---|---|---|---|---|---|---|---|
| CSRD-S-001 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-002 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-003 | 3 | `SRC-002` | — | `DOC-32022L2464` | — | 1 | `5cb68b8b…f903` |
| CSRD-S-004 | 3 | `SRC-002` | — | `DOC-32022L2464` | — | 1 | `5cb68b8b…f903` |
| CSRD-S-005 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-006 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-007 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-008 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-009 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-010 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| **CSRD-S-011** | 3 | `SRC-001`, **`SRC-008`** | **`SRC-008`** | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| **CSRD-S-012** | 3 | `SRC-005`, **`SRC-007`** | **`SRC-007`** | `DOC-32023R2772` | — | 1 | `98eef179…8de9` |
| CSRD-S-013 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-014 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-015 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |
| CSRD-S-016 | 3 | `SRC-001` | — | `DOC-32013L0034` | `DOC-32026L0470` | 2 | `ef2e7a8c…74fb` |

**Three distinct closures across sixteen requirements:**

| Digest | Members | Documents |
|---|---|---|
| `ef2e7a8c131257b3498ef06531e8e7ec30c1accee1a5be230f008e8c459774fb` | 13 | `DOC-32013L0034` + `DOC-32026L0470` |
| `5cb68b8bc3e066a39fd5463852b0690cfa177ada00d5d77aa6df001f3a94f903` | 2 | `DOC-32022L2464` |
| `98eef179e6f984c19eee76944e94ec4b945031d056c6f842179dbafa2de38de9` | 1 | `DOC-32023R2772` |

---

## 7. Structural traversal — which requirements inherit a document they do not cite

Spec §15 asks this explicitly, and the answer is the report's most consequential structural finding.

**`DOC-32026L0470` reaches thirteen requirements without being cited by any of them.**

It serves `SRC-004`, and `SRC-004` is cited by **no requirement in the pack** (§4.1). It enters thirteen closures solely by `CLOSURE_POLICY_V0` following the single `amendedBy` edge out of `DOC-32013L0034`: S-001, S-002, S-005, S-006, S-007, S-008, S-009, S-010, S-011, S-013, S-014, S-015, S-016.

Two consequences, recorded rather than acted on:

1. **Its rendered contribution is 134,004 of the 403,231 rendered characters — 33.2% of the closure those thirteen requirements share, and twelve of them put that closure in front of a reader today — and no requirement's authored provenance asked for it.** (133,932 of those are the document's own text; the remainder is its `## …` heading.) That is the intended behaviour of §3.1's "`sources[]` is an entry point, not a fence", not a defect: the Omnibus is what amends the host instrument, and a reader shown the host without its amendment would be reading superseded law.
2. **It is the live instance of the §15 warning.** Spec §15 predicted that ingesting an amending act with an edge to a large document would pull that document into unrelated closures at no depth cost, and used `2025/1416 → 2023/2772` as the hypothetical. The mechanism is not hypothetical — it is already running in thirteen of sixteen closures. It is benign here only because `DOC-32026L0470` is small and legally necessary. **Nothing in the current corpus prevents the same edge shape from attaching an 889,207-character document to all thirteen of those closures, none of which cites it** (twelve reach a model today; S-011 is the thirteenth and currently halts). That is exactly why §15 says any future decision to ingest an amending act must be taken with this consequence in view.

`DOC-32023R2772` has no edges and therefore reaches **only** S-012. `DOC-32022L2464` has no edges and reaches only S-003 and S-004.

---

## 8. Rendered sizes — exact

All figures **exact and measured**. "Rendered closure" is `renderEntitledClosure(closure)`; "reader input" is `renderReaderInput(readerInputFor(…))`, which is the closure render plus the requirement header and the locator block; "reader request payload" is the concatenated **message content** of the `RoleRequest` the runner was handed — the role prompt followed by the reader input — and exists only where a request was actually made. Two details, so the figure is not over-read. `agent-role.ts` fixes the *order* of the two messages and performs no joining; the blank line between them is the measurement script's own serialization, so the uniform **+3,522** against the reader-input column is the 3,520-character reader prompt plus a 2-character separator **the pipeline never emits**. In the other direction, the request object's scalar fields — `role`, `index`, `model`, `promptSha256` — are excluded. This column is therefore the model-facing *text*, not a wire-payload measurement, and is not offered as one.

| Requirement | Rendered closure chars | bytes | Reader input chars | bytes | Reader request payload chars |
|---|---|---|---|---|---|
| CSRD-S-001 | 403,231 | 405,937 | 403,386 | 406,092 | 406,908 |
| CSRD-S-002 | 403,231 | 405,937 | 403,386 | 406,092 | 406,908 |
| CSRD-S-003 | 139,105 | 139,715 | 139,258 | 139,868 | 142,780 |
| CSRD-S-004 | 139,105 | 139,715 | 139,278 | 139,888 | 142,800 |
| CSRD-S-005 | 403,231 | 405,937 | 403,386 | 406,092 | 406,908 |
| CSRD-S-006 | 403,231 | 405,937 | 403,386 | 406,092 | 406,908 |
| CSRD-S-007 | 403,231 | 405,937 | 403,383 | 406,089 | 406,905 |
| CSRD-S-008 | 403,231 | 405,937 | 403,383 | 406,089 | 406,905 |
| CSRD-S-009 | 403,231 | 405,937 | 403,383 | 406,089 | 406,905 |
| CSRD-S-010 | 403,231 | 405,937 | 403,386 | 406,092 | 406,908 |
| **CSRD-S-011** | *403,231* | *405,937* | *403,412* | *406,118* | **none — halted** |
| **CSRD-S-012** | *889,363* | *893,429* | *889,555* | *893,621* | **none — halted** |
| CSRD-S-013 | 403,231 | 405,937 | 403,382 | 406,088 | 406,904 |
| CSRD-S-014 | 403,231 | 405,937 | 403,401 | 406,107 | 406,923 |
| CSRD-S-015 | 403,231 | 405,937 | 403,385 | 406,091 | 406,907 |
| CSRD-S-016 | 403,231 | 405,937 | 403,386 | 406,092 | 406,908 |

**The two italicised rows are hypothetical and must not be read as pipeline cost.** S-011 and S-012 halt in `runBlindReader` before any role is constructed, so neither render is ever produced in production. The figures state the size of the **available closure** — what the render *would* be over the documents the corpus does serve, if the missing source were served and the closure were otherwise unchanged. They are reported because the size of a gap-bearing requirement's available evidence is a real property of the corpus; they are not measurements of anything the pipeline did.

**Derived totals over the 14 model-reachable requirements** (sums of the exact figures above):

- reader input: **5,119,169 chars**
- reader request payload: **5,168,477 chars**
- largest actual model-facing request: **406,923 chars (CSRD-S-014)**

---

## 9. Request counts — the production path

`DEFAULT_ROLE_CONFIG.prosecutorCount` is **3**, so a fully-served requirement is expected to make `2 + prosecutorCount` = **5** requests.

| Population | Requirements | Requests each | Reader | Prosecutor | Adjudicator |
|---|---|---|---|---|---|
| Model-reachable | 14 | **5** | 1 | 3 | 1 |
| Gap-bearing | 2 | **0** | 0 | 0 | 0 |

- **Every one of the fourteen made exactly 5 requests.** No requirement over- or under-ran the expected shape.
- **Both gap-bearing requirements made exactly 0 requests, of every role.** S-011 published one `corpus_gap` naming `SRC-008`; S-012 published one `corpus_gap` naming `SRC-007`. Neither published any other gap.
- **Total across the population: 70 requests.**
- **`installNetworkTrap().calls` is `[]` after all sixteen runs.** No live provider was contacted. The load-bearing reason is structural — the runner is a `replay` stub — with the trap as corroboration; see §1.

The zero is load-bearing and is not asserted alone: the same script, the same runner and the same trap produced fourteen non-zero counts in the same execution. A pipeline that never called anything would have failed those fourteen.

---

## 10. Token figures — estimates only, and no feasibility conclusion

**No deterministic tokenizer was selected or run.** None exists in the repository, and introducing one is an E1 dependency decision. Per plan §Task 10's own alternative, token counts are therefore **estimates**, and the exact quantities of record are the characters and bytes in §8.

**Method, stated:** characters ÷ 3.5, the ratio spec §15 adopted for consolidated legal English. It is a heuristic over one language and one register, applied to the whole rendered string including headings and digests. It is not a tokenizer output and no arithmetic below should be treated as one.

| Quantity (exact chars) | Estimate at ~3.5 chars/token |
|---|---|
| Reader input, a requirement at the modal `SRC-001` value — 403,386 | ≈ 115k tokens |
| Reader input, one of the two `SRC-002` requirements — 139,258 | ≈ 40k tokens |
| Largest actual request payload — 406,923 | ≈ 116k tokens |
| **S-012 available closure, hypothetical — 889,555** | **≈ 254k tokens** |

The first two rows are **representative, not group constants**: reader input varies within a closure because the locator block does. Across the `SRC-001` group's **twelve served** requirements the value takes five forms (403,382 / 403,383 / 403,385 / 403,386 / 403,401), with 403,386 the modal one; S-011's *403,412* is a sixth, and is hypothetical — it is never produced (§8, §11). The `SRC-002` group's two requirements take 139,258 and 139,278. §8 carries the exact figure for every requirement.

**No B3 feasibility failure is recorded, for two independent reasons — either alone is sufficient.**

1. **No candidate is named.** Plan §Task 10 and spec §15 gate feasibility on "a candidate pipeline we intend to benchmark". No candidate model, and therefore no documented context limit, is fixed anywhere in this boundary's tracked scope. A feasibility verdict is candidate-specific by construction (spec §15: *"that candidate fails B3 feasibility"*), and there is no candidate here to fail.
2. **The number is an estimate, and the largest one is hypothetical anyway.** The 254k figure is a heuristic conversion, and it describes a render **the pipeline never performs**: S-012 is gap-bearing on `SRC-007` and halts before the reader. Treating an estimated size of an unexecuted render as a measured pipeline failure would be false twice over.

**What is nonetheless true and worth carrying forward, stated as a question and not a verdict:** the largest surface any *reachable* requirement puts in front of a model today is 406,923 characters, and the largest surface the corpus *could* put there once `SRC-007` is served is 889,555 characters — more than double. Whether either exceeds a given context window is answerable only against a named candidate with a documented limit, using that candidate's tokenizer and this pipeline's request serialization. That measurement belongs to B3, and this report does not attempt it.

---

## 11. The two residual gaps

**S-011 — `corpus_gap` on `SRC-008`** (Commission voluntary sustainability standard delegated act, adopted 3 July 2026). Its `SRC-001` half is fully served: its available closure digest `ef2e7a8c…74fb` is *identical* to that of the **twelve** fully-served `SRC-001` requirements. (The digest group has thirteen members; S-011 is the thirteenth.) The gap costs it not one document but its right to run at all — which is the source-completeness invariant working as designed. Zero requests.

**S-012 — `corpus_gap` on `SRC-007`** (Commission revised ESRS delegated act, adopted 3 July 2026). This one deserves the report's most careful sentence, because its two facts point opposite ways:

> S-012 has by far the **largest available served closure** in the pack — `DOC-32023R2772`, 889,207 normalized characters, 889,363 rendered — and it is **the requirement furthest from reaching a model**. It makes **zero** requests. Its 889,555-character reader input is a hypothetical over the available closure, not a cost the pipeline pays.

Substantial served evidence is not partial reachability. A requirement whose authored provenance declares two sources and whose corpus holds one is halted exactly as firmly as one whose corpus holds none — the completeness check is over the declared set, not over the volume of what happened to resolve.

**Both gaps are Class-B and belong to Task 12**, gated behind E1–E4. Neither is debt: spec §21 states that a residual gap on an adopted-not-effective act is a truthful finding. This report does not design, schedule or estimate that work.

---

## 12. One superseded figure in spec §15, recorded

Spec §15's measurement table was taken at commit `1e16f24`, **before** `SRC-005` was ingested. Three of its four rows reproduce exactly at `1849673`; one does not.

| §15 row | §15 value (at `1e16f24`) | Measured now | |
|---|---|---|---|
| `DOC-32013L0034` normalized | 269,071 chars | 269,071 | ✅ unchanged |
| `DOC-32026L0470` normalized | 133,932 chars | 133,932 | ✅ unchanged |
| Rendered closure, both documents | 403,231 chars | 403,231 | ✅ exact match |
| `2023/2772` `#text` as served | **906,920 chars** | **889,207 chars** | ⚠️ superseded, −17,713 |

The last row measured the *served `#text`* before ingestion; the corpus now pins the *normalized* artefact produced by `NORMALIZER_VERSION` `1.0.2`, which is 889,207 characters. **This is not a new finding and not a discrepancy in the corpus** — T6 already records 889,207 in `test/corpus-src005-ingestion.test.ts:195` (in a comment, so nothing enforces it), and the pinned `sha256Normalized` `e120ea16…1858` is verified green by the integrity checks in §2's suite. It is recorded here because §15's table is the figure a later reader would reach for, and one of its rows no longer describes the artefact the corpus holds.

The first three rows reproducing exactly — including the rendered-closure figure, which passes through traversal, both documents and the renderer — is a strong positive control that this report's method and §15's are measuring the same things.

---

## 13. Limits, and judgement calls recorded rather than hidden

1. **Token counts are estimates.** §10. No tokenizer was selected, run, or added.
2. **No live model was called and none was simulated for cost.** Requests are counted, not priced. Output tokens, latency and retry behaviour are unmeasured and unmeasurable here.
3. **The replay runner returns a fixed, minimal well-formed output.** Request *counts* are therefore exact for a run that proceeds without agent-emitted gaps; a live run whose reader emitted a document gap would halt earlier and make fewer. The count of 5 is the shape of a complete run, which is what §20 asks for.
4. **"The four identity constants" is an interpretation.** §3 states which four, why, and records the other three so the choice cannot conceal a movement.
5. **Rendered sizes for S-011 and S-012 are hypothetical**, and are marked as such everywhere they appear. §8, §10, §11.
6. **This report does not re-audit provenance.** Whether each requirement cites the right sources is D1a-0b's question, corrected through T9; this measures the consequences of the answers already landed.
7. **Out of scope by instruction, and deliberately not addressed here:** the possible `SRC-005` matcher-narrowness test gap inherited from T6; `DOC-32013L0034`'s pre-existing "in force from" version label; and the four non-blocking T9 NITs. Each needs independent assessment.

---

## 14. Reproduction

All commands run from the repository root at `1849673` unless stated. Both scripts are written to a scratch path outside the repository and write nothing into it.

### 14.1 State verification

```
git rev-parse --abbrev-ref HEAD          # feature/b1b-ii-a-record
git log -1 --format='%h %s'              # 1849673 Serve the article the corpus was only amending
git status --porcelain                   # the two user-owned untracked files, plus this report
```

### 14.2 Gates (§2)

```
cd backend/engine && npx vitest run                 # 54 files / 1574 tests
cd frontend/web  && npx vitest run                  # 7 files / 48 tests
cd backend/engine && npx tsc --noEmit               # exit 0
npm run test:standalone                             # PASS
grep -ri csrd backend/engine/src/ | wc -l           # 7
```

### 14.3 The two measurements

```
cd backend/engine && npx tsx <scratch>/measure-closure.mts   > closure.json
cd backend/engine && npx tsx <scratch>/measure-requests.mts  > requests.json
```

`measure-closure.mts` produces §3, §4, §6, §7 and the first four columns of §8. `measure-requests.mts` produces §5, §9, the last column of §8, and the published-digest cross-check. The `.mts` extension is required: the scratch directory is outside the workspace, so `tsx` needs the explicit ESM signal for top-level `await`.

### 14.4 Repository inertness

```
git status --porcelain    # before and after both scripts — byte-identical output
```

Confirmed across both script runs: only `L_2022322EN.01001501.xml.pdf` and `docs/superpowers/plans/2026-08-24-b3-benchmark-and-promotion.md`, both user-owned, both untouched. `git log -1 --format='%h'` remains `1849673`. This report file is written by hand afterwards and is the boundary's only addition; neither script produces it.

### 14.5 The measurement scripts, verbatim

**`measure-closure.mts`**

```ts
/**
 * D1a Task 10 — static closure and rendered-size measurement.
 *
 * Runs the REAL production constructors: loadCorpus, loadPack, parseSourceRegister,
 * authoriseCorpus, EntitledClosure.forSources, docsForSources, renderEntitledClosure,
 * readerInputFor + renderReaderInput, closure.corpusServes.
 *
 * Writes nothing into the repository: the world is a copy under a tmp dir.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENGINE = '/Users/vivin/Documents/DataStrata/b1b-record/backend/engine';

const { loadCorpus } = await import(`${ENGINE}/src/corpus/store`);
const { authoriseCorpus } = await import(`${ENGINE}/src/corpus/authority`);
const { parseSourceRegister } = await import(`${ENGINE}/src/monitoring/register`);
const { loadPack } = await import(`${ENGINE}/src/knowledge/loader`);
const { EntitledClosure, renderEntitledClosure } = await import(`${ENGINE}/src/pipeline/entitlement`);
const { docsForSources } = await import(`${ENGINE}/src/corpus/closure`);
const { readerInputFor, renderReaderInput } = await import(`${ENGINE}/src/pipeline/reader`);
const { sourceIdsOf } = await import(`${ENGINE}/src/knowledge/provenance`);
const { PIPELINE_IDENTITY_SCHEME, RESULT_SCHEMA_VERSION } = await import(`${ENGINE}/src/pipeline/identity`);
const { TRANSCRIPT_SCHEMA_VERSION } = await import(`${ENGINE}/src/pipeline/transcript`);
const { NORMALIZER_VERSION } = await import(`${ENGINE}/src/corpus/normalize`);
const { RENDERER_VERSION } = await import(`${ENGINE}/src/verification/render`);
const { REQUEST_IDENTITY_SCHEME } = await import(`${ENGINE}/src/pipeline/request-identity`);
const { RUN_IDENTITY_SCHEME } = await import(`${ENGINE}/src/pipeline/run-identity`);

const PACK_ID = 'csrd';
const root = mkdtempSync(join(tmpdir(), 't10-closure-'));
mkdirSync(join(root, 'knowledge'), { recursive: true });
cpSync(join(ENGINE, 'knowledge', PACK_ID), join(root, 'knowledge', PACK_ID), { recursive: true });
cpSync(join(ENGINE, 'corpus'), join(root, 'corpus'), { recursive: true });
cpSync(join(ENGINE, 'monitoring'), join(root, 'monitoring'), { recursive: true });
const versionRegistryDir = join(root, 'verification', 'requirement-versions');
mkdirSync(versionRegistryDir, { recursive: true });
cpSync(
  join(ENGINE, 'verification', 'requirement-versions', `${PACK_ID}.json`),
  join(versionRegistryDir, `${PACK_ID}.json`),
);

const corpus = loadCorpus(join(root, 'corpus'));
const register = parseSourceRegister(
  JSON.parse(readFileSync(join(root, 'monitoring', 'source-register.json'), 'utf8')),
);
const pack = loadPack(join(root, 'knowledge', PACK_ID), { versionRegistryDir });
const authorised = authoriseCorpus(corpus, register, pack);

const bytes = (s: string) => Buffer.byteLength(s, 'utf8');

// ---- corpus inventory -----------------------------------------------------
const docs = corpus.index.documents.map((d: any) => {
  const path = join(root, 'corpus', d.normalizedPath);
  const text = readFileSync(path, 'utf8');
  return {
    docId: d.docId,
    title: d.title,
    versionLabel: d.versionLabel,
    serves: d.serves,
    edges: (d.edges ?? []).map((e: any) => `${e.kind}->${e.docId ?? e.to ?? '?'}`),
    chars: text.length,
    bytes: statSync(path).size,
  };
});

// ---- per-requirement ------------------------------------------------------
const rows = pack.requirements
  .slice()
  .sort((a: any, b: any) => a.id.localeCompare(b.id))
  .map((requirement: any) => {
    const sourceIds = sourceIdsOf(requirement);
    const closure = EntitledClosure.forSources(authorised, register, requirement.sources);
    const served = sourceIds.filter((s: string) => closure.corpusServes(s));
    const unserved = sourceIds.filter((s: string) => !closure.corpusServes(s));
    const entry = docsForSources(corpus.index, [...requirement.sources]);
    const inherited = closure.docIds.filter((d: string) => !entry.includes(d));
    const rendered = renderEntitledClosure(closure);
    const readerInput = renderReaderInput(
      readerInputFor({ packId: PACK_ID, requirement, closure }),
    );
    return {
      id: requirement.id,
      version: requirement.version,
      sources: sourceIds,
      served,
      unserved,
      gapBearing: unserved.length > 0,
      entryDocIds: entry,
      closureDocIds: [...closure.docIds],
      inheritedByTraversal: inherited,
      edgeIds: [...closure.edgeIds],
      closureSha256: closure.sha256,
      renderedClosureChars: rendered.length,
      renderedClosureBytes: bytes(rendered),
      readerInputChars: readerInput.length,
      readerInputBytes: bytes(readerInput),
    };
  });

console.log(JSON.stringify({
  identityConstants: {
    RESULT_SCHEMA_VERSION,
    PIPELINE_IDENTITY_SCHEME,
    TRANSCRIPT_SCHEMA_VERSION,
    NORMALIZER_VERSION,
    alsoRecorded: { RENDERER_VERSION, REQUEST_IDENTITY_SCHEME, RUN_IDENTITY_SCHEME },
  },
  requirementCount: pack.requirements.length,
  documents: docs,
  requirements: rows,
}, null, 2));

rmSync(root, { recursive: true, force: true });
```

**`measure-requests.mts`**

```ts
/**
 * D1a Task 10 — production-path request counting over all sixteen requirements.
 *
 * Runs `runRun` — the same function `dispatch` delegates to — once per
 * requirement, into a temporary world, with the existing test network trap
 * armed. No provider is contacted: the runner is a deterministic replay stub
 * that records every RoleRequest it is handed.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENGINE = '/Users/vivin/Documents/DataStrata/b1b-record/backend/engine';

const { runRun } = await import(`${ENGINE}/src/cli/run`);
const { resultPath } = await import(`${ENGINE}/src/cli/sign`);
const { EXIT_OK } = await import(`${ENGINE}/src/cli/exit-codes`);
const { DEFAULT_ROLE_CONFIG } = await import(`${ENGINE}/src/pipeline/config`);
const { conditionPathsFor, qualifiedChallengeId } = await import(`${ENGINE}/src/pipeline/prosecutors`);
const { loadCorpus } = await import(`${ENGINE}/src/corpus/store`);
const { authoriseCorpus } = await import(`${ENGINE}/src/corpus/authority`);
const { parseSourceRegister } = await import(`${ENGINE}/src/monitoring/register`);
const { loadPack } = await import(`${ENGINE}/src/knowledge/loader`);
const { EntitledClosure } = await import(`${ENGINE}/src/pipeline/entitlement`);
const { verificationResultSchema } = await import(`${ENGINE}/src/verification/result`);
const { installNetworkTrap } = await import(`${ENGINE}/test/helpers`);

const PACK_ID = 'csrd';
const world = mkdtempSync(join(tmpdir(), 't10-requests-'));
mkdirSync(join(world, 'knowledge'), { recursive: true });
cpSync(join(ENGINE, 'knowledge', PACK_ID), join(world, 'knowledge', PACK_ID), { recursive: true });
cpSync(join(ENGINE, 'corpus'), join(world, 'corpus'), { recursive: true });
cpSync(join(ENGINE, 'monitoring'), join(world, 'monitoring'), { recursive: true });

const register = parseSourceRegister(
  JSON.parse(readFileSync(join(world, 'monitoring', 'source-register.json'), 'utf8')),
);
const corpus = loadCorpus(join(world, 'corpus'));

const trap = installNetworkTrap();
const results: any[] = [];

for (const requirementId of [...Array(16)].map((_, i) => `CSRD-S-${String(i + 1).padStart(3, '0')}`)) {
  const verificationDir = mkdtempSync(join(tmpdir(), 't10-out-'));
  mkdirSync(join(verificationDir, 'requirement-versions'), { recursive: true });
  cpSync(
    join(ENGINE, 'verification', 'requirement-versions', `${PACK_ID}.json`),
    join(verificationDir, 'requirement-versions', `${PACK_ID}.json`),
  );
  const paths = {
    packDir: join(world, 'knowledge', PACK_ID),
    corpusDir: join(world, 'corpus'),
    verificationDir,
  };

  const pack = loadPack(paths.packDir, { versionRegistryDir: join(verificationDir, 'requirement-versions') });
  const requirement = pack.requirements.find((r: any) => r.id === requirementId)!;
  const condPaths = conditionPathsFor(requirement, {
    factTypes: pack.factTypes,
    catalogues: pack.catalogues,
  });
  const entitledDocIds = EntitledClosure.forSources(
    authoriseCorpus(corpus, register, pack), register, requirement.sources,
  ).docIds;

  const quote = () => {
    const docId = entitledDocIds[0] ?? corpus.index.documents[0]!.docId;
    const doc = corpus.document(docId);
    const text = readFileSync(join(world, 'corpus', doc.normalizedPath), 'utf8');
    return [{
      kind: 'quote' as const,
      docId,
      sha256Normalized: doc.sha256Normalized,
      text: text.split('\n').find((l) => l.trim().length > 40)!.trim(),
    }];
  };

  const requests: any[] = [];
  const capability = {
    runner: {
      kind: 'replay' as const,
      run(request: any) {
        requests.push({ role: request.role, chars: request.messages.map((m: any) => m.content).join('\n\n').length });
        if (request.role === 'reader') {
          return Promise.resolve({ outputJson: JSON.stringify({
            elements: [{ id: 'RE-1', statement: 'Probe element.', evidence: quote() }], gaps: [],
          })});
        }
        if (request.role === 'prosecutor') {
          const lens = /^# Lens\n\n(.+)$/m.exec(
            request.messages.find((m: any) => m.from === 'input')?.content ?? '')?.[1] ?? 'x';
          return Promise.resolve({ outputJson: JSON.stringify({
            lens,
            coverage: [
              { direction: 'reading_to_condition', readingElementId: 'RE-1', conditionPath: condPaths[0], verdict: 'MAPPED' },
              { direction: 'condition_to_reading', conditionPath: condPaths[condPaths.length - 1], verdict: 'UNSUPPORTED', challengeId: 'C1' },
            ],
            challenges: [{ id: 'C1', lens, statement: 'Probe challenge.', evidence: quote() }],
            gaps: [],
          })});
        }
        const ids: string[] = [];
        for (let i = 0; i < DEFAULT_ROLE_CONFIG.prosecutorCount; i += 1) ids.push(qualifiedChallengeId(i, 'C1'));
        return Promise.resolve({ outputJson: JSON.stringify({
          adjudications: ids.map((challengeId) => ({
            challengeId, verdict: 'CONFIRMED', resolution: 'Probe resolution.', evidence: quote(),
          })), gaps: [],
        })});
      },
    },
  };

  const outcome = await runRun({ packId: PACK_ID, requirementId }, paths, capability as any);
  const published = verificationResultSchema.parse(
    JSON.parse(readFileSync(resultPath(paths, PACK_ID, requirementId), 'utf8')),
  );

  results.push({
    requirementId,
    exitCode: outcome.exitCode,
    exitOk: outcome.exitCode === EXIT_OK,
    totalRequests: requests.length,
    reader: requests.filter((r) => r.role === 'reader').length,
    prosecutor: requests.filter((r) => r.role === 'prosecutor').length,
    adjudicator: requests.filter((r) => r.role === 'adjudicator').length,
    readerRequestChars: requests.find((r) => r.role === 'reader')?.chars ?? null,
    gaps: published.gaps.map((g: any) => ({ kind: g.kind, sourceId: g.sourceId, docId: g.docId })),
    status: published.status,
    corpusClosureSha256: published.corpusClosureSha256,
    requirementInputSha256: published.requirementInputSha256,
    pipelineVersion: published.pipelineVersion,
    resultSchemaVersion: published.resultSchemaVersion,
  });
  rmSync(verificationDir, { recursive: true, force: true });
}

trap.restore();
console.log(JSON.stringify({
  prosecutorCount: DEFAULT_ROLE_CONFIG.prosecutorCount,
  expectedReachableRequests: 2 + DEFAULT_ROLE_CONFIG.prosecutorCount,
  networkTrapCalls: trap.calls,
  results,
}, null, 2));
rmSync(world, { recursive: true, force: true });
```

---

## 15. Status

**Task 10 complete.** The sixteen-requirement population was measured through the real production path with request counting, at `1849673`, with the network trap armed and no provider contacted.

- Partition: **14 model-reachable / 2 gap-bearing**, measured — S-011 on `SRC-008`, S-012 on `SRC-007`.
- Requests: **5 for each of the fourteen** (`2 + prosecutorCount`, `prosecutorCount = 3`); **0 for each of the two**; 70 total; **0 network calls**.
- Closure digests: three distinct, and all sixteen published `corpusClosureSha256` values reproduce the independently computed ones.
- The four identity constants are **unchanged**, and no change was intended.
- Sizes are **exact in characters and bytes**. Token figures are **estimates** with their basis stated; **no B3 feasibility conclusion is drawn**, and none can be until a candidate with a documented context limit and its tokenizer are named.
- Structural traversal puts `DOC-32026L0470` — cited by no requirement — into **thirteen** closures, making spec §15's warning about amending-act edges a present mechanism rather than a hypothetical.
- One spec §15 figure is **superseded** by ingestion and is recorded in §12.

**Not done here, by instruction:** Task 12, envelopes E1–E4, any retrieval or closure redesign, and the three disclosed out-of-scope observations in §13.7.
