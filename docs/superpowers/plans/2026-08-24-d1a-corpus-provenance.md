# D1(a) — corpus provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every requirement one authored place to say what its determination rests on, make that place mandatory, structured and authority-checked, and make it impossible for a document to become entitled without its source and artefact authority having been validated first.

**Architecture:** Thirteen implementation tasks and four deferred capability envelopes. The seam and the audit come first; the audit's findings then determine the register universe, the migration's expected state, and which provenance corrections are knowable in time to land in one version bump rather than two.

**What this plan is ready for:** implementation through Task 10 (D1a-0a → D1a-3) and the provenance corrections whose evidence exists by then. **Class-B capability (E1–E4) is a gated sub-plan boundary, not a set of implementation-ready tasks** — see §5.

**Tech Stack:** TypeScript (strict, ESM), zod, vitest. No new runtime dependencies in any task in this plan; a PDF extractor is a dependency question belonging to envelope E1's sub-plan.

## Global Constraints

- **`docs/superpowers/TEST-EVIDENCE-STANDARD.md` is normative.** Read it before writing a teeth check. Every task carries one, naming the defect it must detect, with output recorded verbatim.
- **A red check is not evidence until its failure message names the assertion you intended.** Failure mode 2 has recurred in this repository three times.
- **A mutation is evidence only after confirming the intended semantic change actually landed.** Grep for the construct you removed; diff the file; assert the count went to zero — *before* interpreting either colour.
- **Never regenerate an expected value to make a test pass.** Task 4 is a hash migration; "update until green" is indistinguishable from a broken migration.
- **Historical evidence is appended to, never overwritten.** Version-registry entries, transcript recordings and goldens each record what was true under a previous pipeline. §4 states the policy and every task inherits it.
- **No new runtime dependencies.** `zod` and `node:*` only.
- **TypeScript strict, with `noUncheckedIndexedAccess`.** `tsconfig.json` includes `test`, so `@ts-expect-error` assertions are compiled by `npm run typecheck`.
- **Program-agnostic.** `grep -ri csrd backend/engine/src/` must stay at exactly **five** pre-existing hits.
- **`src/verification/` stays pure** — no filesystem, network or clock.
- **Every file starts with a JSDoc block saying *why* it exists**, not what it does.
- **Commit message style is imperative sentence-case with no prefix.** No `Co-Authored-By` trailer.
- **The user runs every `git add` and `git commit`.** Leave work in the tree and hand over the commands.
- **No model is called.** No `test:agents`, no promotion, no real signing, no B3 work. The B3 draft at `docs/superpowers/plans/2026-08-24-b3-benchmark-and-promotion.md` is untracked and stays untracked.
- Baseline at plan start: **29 frontend + 1411 engine** green across **46 engine test files**; `npm run typecheck` exit 0; `npm run test:standalone` exit 0. Each task's baseline is the previous task's finishing count, never a fixed number.

## Spec reference

`docs/superpowers/specs/2026-08-24-d1a-corpus-provenance-design.md` (committed at `b68bb8e`) governs. Its architecture is settled and this plan does not reopen it. Where implementation reconnaissance finds a **direct contradiction** with the repository, stop and report rather than deciding locally.

**Gate G-1 — CLOSED 2026-08-27.** The D1a-0b audit raised it (`reports/2026-08-24-d1a-provenance-audit.md` §2) and spec **§7.1** now settles it: source authority, serving-artefact authenticity and temporal legal status are three independent axes, an official consolidation may validly serve a `legal_record` source for current reading while itself being a non-authentic reading artefact, and *currency, not lineage* is unchanged — authentic OJ lineage belongs to artefact-level provenance, never to the authored source set. The invariant Task 4 relies on is stated there: **provenance names the current host instrument and its locator, never an artefact, and never gains an amending act merely because that act is where the authentic wording was published.** No metadata is designed; enforcement belongs to envelope **E2** (widened to *document standing*), explicitly not to Task 5.

---

## 1. Current-state reconnaissance

Verified against the worktree at `b68bb8e`.

| Gate | Value |
|---|---|
| HEAD | `b68bb8e` *Give a requirement one place to say what it rests on*, clean but for the untracked B3 draft |
| Frontend / engine tests | 29 / 1411 across 46 engine test files |
| `typecheck` / `test:standalone` / csrd hits | 0 / 0 / 5 |
| `resultSchemaVersion` / `PIPELINE_IDENTITY_SCHEME` / `TRANSCRIPT_SCHEMA_VERSION` | 1.2.0 / v2 / 1.1.0 |

### 1.1 The authored shape today

```ts
// knowledge/schema.ts:156-157
sources: z.array(z.string()).min(1),
provisions: z.string().optional(),
// types.ts:259
export type AuthoredRequirement = Omit<Requirement, 'derivedStatus' | 'statusReasons'>;
```

All sixteen requirements are at **version 2**, each with a version-1 digest recorded in `verification/requirement-versions/csrd.json` (`{ requirementId: { version: requirementSha256 } }`). `provisions` is populated on three: S-001, S-002, S-007.

### 1.2 The thirteen `requirement.sources` call sites

`pipeline/orchestrate.ts:420`; `cli/run.ts:180`; `cli/sign.ts:318`; `cli/review-sheet.ts:491`, `:613`, `:825`; `cli/assess.ts:61`; `knowledge/loader.ts:346`; `verification/canonical.ts:153`; `engine/evaluate.ts:193`; `frontend/web/lib/pack.ts:206`; `frontend/web/lib/checkResponse.ts:123` → `components/marketing/CheckFlow.tsx:286`.

`changeWatchItemSchema.sources` (validated at `loader.ts:387`) is a **different field** on change-watch items. It stays authored and is out of scope everywhere in this plan.

### 1.3 The six `provisions` sites

`pipeline/reader.ts:95`, `:112`; `verification/canonical.ts:152`; `engine/evaluate.ts:194`; `cli/assess.ts:61`; `frontend/web/lib/checkResponse.ts:124` → `components/marketing/CheckFlow.tsx:292`.

### 1.4 Three composition roots load a corpus

`cli/sign.ts:274` `readWorld` (serves `verify run` and `verify sign`); `cli/review-sheet.ts:409`; `frontend/web/lib/pack.ts` `buildCsrdFreshnessResolver`. The third is in the **frontend workspace**, so anything Task 5 introduces must be exported from `backend/engine/src/index.ts`.

### 1.5 Five facts that shape the sequence

**R-1. `zod` strips unknown keys.** A leftover authored `sources` would be invisible — including to `requirementSha256`, which hashes `requirementSchema.parse()`'s output. The repository already carries the counter-measure: `loader.ts:330-337` walks the *raw* records to refuse an asserted `ratification`. The same shape is required for a leftover `sources` (Task 4).

**R-2. The engine golden carries both migrating fields.** `test/golden/migration-engine-golden.json` (48 KB) contains 15 `"sources"` and 2 `"provisions"` occurrences, and `migration-golden.test.ts` holds it to exact equality with **one** named adapter whose docstring says it "must not grow". **Settled — see §4.2.**

**R-3. `pipelineVersion` will move.** `promptSha256` hashes the **prompt file**, not the assembled prompt (`pipeline/prompts.ts`), so the rendered reader input alone would not move it — but `prompts/verification/reader.md:10` names the `provisions` field in prose, and the rename changes that file. `identityPayload` hashes `prompts.reader`, so `pipelineVersion` moves.

**R-4. The committed replay recording will stop binding — and the refusal is a *selection* miss, not a field-by-field rejection.** The lookup topology, traced end to end:

```
buildRunId({ pipelineVersion, packId, requirementId,
             requirementInputSha256, renderedConditionSha256,
             corpusClosureSha256 })                       run-identity.ts:41
   ↓
bind(binding)
   transcripts.filter(t => t.runId === binding.runId)     replay.ts:382  ← exact, runId only
   no claimant → TranscriptRunMismatchError(
                   binding,
                   closest(binding, transcripts),          replay.ts:388  ← differences, for the message
                   offeredRunIds)
   a claimant  → re-verified field by field                replay.ts:425
```

`buildRunId` hashes `pipelineVersion` and `requirementInputSha256`, both of which Task 4 moves, so the derived `runId` moves too and **the old recording can never be selected**. It is therefore never the subject of the strict per-field validator at `replay.ts:425`. It *is* still examined: `closest()` runs `bindingDifferences` over every retained recording to build the error's `.differences`. So the field enumeration is obtainable — through the near-miss explanation, not through a rejection of a selected recording.

`readTranscriptsFor` (`replay.ts:515`) reads **every** `.json` in the requirement's directory and requires each to be filed as `${runId}.json`, so a second recording sits beside the first with no harness change. The fixture's own `PROVENANCE.md` states the doctrine this plan follows: *"replacing this file is a decision rather than a fix: it retires the recorded outputs as evidence."*

**R-5. Six pack sources have no register row** — `SRC-001`, `SRC-002`, `SRC-003`, `SRC-005`, `SRC-006`, `SRC-009` — and `SRC-001` is one of the two sources the corpus actually serves. **The provenance contract requires every `provenance.sourceId` to resolve to a register row, so register completeness must precede the migration that enforces it.** This is why Task 3 sits where it does.

### 1.6 The authority surfaces

- `verifyCitationCoverage` (`monitoring/register.ts:145`) compares `pack.sources[].url` **hosts** against citable register hosts: `eur-lex.europa.eu`, `finance.ec.europa.eu`, `knowledgehub.efrag.org`, `efrag.org`.
- `verifyCorpusServesCoverage` (`corpus/schema.ts:220`) is exported from `src/index.ts` and called **only** from two test files.
- `EntitledClosure.forSources` (`entitlement.ts:163`) takes a structural `EntitlementSource` — `{ index, document(), normalizedText() }` — deliberately.
- There is **no requirement-side citability check**: `loader.ts:346` verifies only that a cited id is known to the pack.

---

## 2. Dependency graph

```
T1  sourceIdsOf seam
 ↓
T2  16-requirement provenance audit  (bidirectional: may remove, add or re-attribute)
 ↓
T3  source-register completeness, over the audit's source universe
 ↓
T4  atomic provenance + v3 migration
      + requirement-side citability
      + new golden and new replay recording, both generations preserved
 ↓
T5  AuthorisedCorpus production boundary
 ↓
T6 ─ T7 ─ T8 ─ T9   surviving immutable evidence ingestion (T7 needs T6; T9 conditional)
 ↓
T10 topology / closure / context remeasurement
 │
 ├─ REQUIRED   T11  deferred provenance correction — for whatever subset
 │              remains unresolved after Task 4 (§4.3)
 │
 ├─ OPTIONAL   E1–E4 envelopes ─► approved sub-plan ─► T12 ingest SRC-007/008
 │
 └──────────────────────────────────────────────────────────┐
                                                            ↓
T13 final topology measurement
```

**T13 runs after all REQUIRED D1(a) work and does not wait on the optional branch.** If class-B capability was approved and completed, it measures with `SRC-007`/`SRC-008` represented; if it was deferred, it measures them as truthful residual gaps and records why, and **D1(a) may still complete**. An explicitly optional capability must not become a release dependency by accident of drawing.

Three orderings are load-bearing and each has a reason:

- **T3 before T4** — the migration installs an invariant requiring every `provenance.sourceId` to resolve to a register row. Enforcing it before the rows exist would make the real pack unloadable (R-5).
- **T2 before T3** — the register universe is *whatever the audit leaves or discovers*, not the six rows known today. T2 is bidirectional and may add a source (Directive 2006/43/EC is the live candidate).
- **T2 before T4's acceptance state** — the audit may change which sources a requirement cites, so the migration's expected gap and reachability state is derived from the audit artefact, never from today's partition.

---

## 3. Task breakdown

Every task states: files, the authoritative producer/consumer changed, schema/version consequences, migration strategy, positive controls, production-path teeth, the mutation that must land, the expected first relevant red, acceptance gates, what it does **not** prove, and its commit boundary.

---

### Task 1 — One derivation for the source-id set, while `sources` is still authored

Spec §5.2. Creates the seam **before** there is anything to derive from, so the later switch is one function body rather than thirteen edits under a moving schema.

- **Files:** new `src/knowledge/provenance.ts`; the thirteen call sites in §1.2; new `test/knowledge-provenance.test.ts`; a run-level test for the wiring teeth.
- **Authoritative producer/consumer changed:** none yet. `sourceIdsOf(requirement)` is introduced returning `requirement.sources` verbatim; every consumer stops reading the field directly.
- **Schema/version consequences:** none. No authored content changes; no hash moves; the registry is untouched.
- **Migration strategy:** mechanical redirection with a green baseline throughout. The transitional body **must carry a comment stating plainly that it reads the authored field today and that Task 4 replaces the body**.
- **Positive controls:** a real `verify run` fixture still reaches the reader and produces `2 + prosecutorCount` requests; the public freshness resolver still computes the same closure hash as at `b68bb8e`.
- **Production-path teeth:** mutate `sourceIdsOf` to `return []` and confirm **run-level** tests red — not a unit test of the helper.
- **Mutation that must land:** `sourceIdsOf → []`. Confirm by grepping that no `\.sources\b` read on a requirement remains outside `provenance.ts` (change-watch excepted).
- **Expected first relevant red:** a source-completeness or request-count assertion in `pipeline-source-completeness.test.ts`. A red naming `ClosureEntryNotFoundError` means the mutation reached a different seam; investigate rather than accept.
- **Acceptance gates:** counts unchanged from baseline; `typecheck` 0; `test:standalone` 0; the grep returns only `provenance.ts`.
- **Does NOT prove:** that provenance exists, that locators are mandatory, or that the derivation is correct for anything but the identity function.
- **Commit boundary:** one commit. *Read the cited source set through one function.*

---

### Task 2 — The provenance audit

Spec §13, §17, §18.2. **Document only. No code, no data.** This is the evidence Tasks 3 and 4 are built from.

- **Files:** new `docs/superpowers/reports/2026-08-24-d1a-provenance-audit.md`.
- **Authoritative producer/consumer changed:** none.
- **Schema/version consequences:** none — but its findings determine both.

**The audit rule.** For every requirement, attempt to locate every operative proposition in the authoritative current evidence its provenance claims. If a proposition cannot be located, investigate whether:

```
a) the locator is wrong
b) the source declaration is wrong
c) a source is missing
d) the proposition itself is over-authored
```

**A currently reachable requirement is not presumed correct merely because the old source-completeness machinery allowed it to run.** Reachability under today's authored sources says a document was found for every cited id; it says nothing about whether the cited ids are the right ones, or whether they cover the propositions the determination actually rests on. Under-provenanced-but-reachable is precisely the defect class D1(a) exists to discover, and it is *more* likely in the six reachable requirements than in the ten that halt, because nothing has ever forced anyone to look at them.

- **Required matrix — all sixteen requirements, one row each:**

  ```
  requirement | condition proposition | provenance source | exact locator
              | authority tier | survives? | newly discovered missing source
              | country-pack dependency
  ```

  Every "authoritative current text" cell cites `file:line` in the normalized corpus, or names the document that would have to be ingested. The matrix's `provenance source` column is the **source universe** Task 3 consumes.

- **Five evidence questions, resolved not assumed:**
  1. **S-005 / S-014 / S-015 → SRC-002.** Spec §13.1 locates Art. 19a(9) at `normalized/32013L0034.txt:1545`, the dedicated-section rule at `:1313`/`:2311`, the Art. 34 opinion at `:3099`. Determine whether anything those three rest on is uniquely in 2022/2464 (its own Article 5 is the live candidate).
  2. **S-003 → SRC-006.** The FY2025–26 relief option is at `normalized/32026L0470.txt:1057`. Determine whether S-003 rests on a postponement act or on Omnibus Art. 5 timing.
  3. **S-004 national-law path.** The paired production-path experiment below. Record the chain: condition → country fact requested → country-pack lookup → national-measure evidence or absence → determination/gap.
  4. **S-013 national-law path.** The same paired experiment, run **independently**. Do not infer either from the other, and do not average their outcomes.
  5. **Possible 2006/43 dependency (S-015).** `sources.json` carries no Audit Directive entry. Determine whether the Art. 34 text already in the corpus fully supports S-015, or whether a source is missing.
- **The SRC-010 substitution test runs here** (spec §17), against the propositions located at `32026L0470.txt:450`, `:456`, `:458`, `:478`, `:622`, `:642`, `:80`. Its outcome decides whether S-010/S-011 carry `SRC-010` into version 3 (§4.3).
- **Positive controls:** the audit **procedure** must be shown able to trace a known proposition end to end — pick one already located in the spec, reproduce it independently, and record the trace. This proves the method works. It does **not** preordain that all six currently reachable requirements remain fully supported; a reachable requirement that fails tracing is a finding, not a method error.
#### The national-law probes (questions 3 and 4)

**Amended 2026-08-24, during execution.** The original design asked for one experiment spanning both layers. It cannot work, for two reasons established against the tree and recorded in the audit report:

- `orchestrate.ts:310` calls `requireRunner(input.runner)` **before** `runBlindReader` at `:415`. A gap-bearing requirement does **not** halt before the runner is needed; withholding the runner refuses the run with `no_execution_capability` before source completeness is ever evaluated. A **synthetic, non-network, request-counting** runner must be supplied, and its request count is the evidence.
- `national_law_unresolved` is not produced on the `runRun` path at all. It arises in the **assessment** path — `condition/evaluate.ts` resolving a fact's `missingReason` or the `ratified_country_packs` catalogue miss, reached through `engine/evaluate.ts` `assess()`.

Verification provenance and entity assessment are **orthogonal layers**, and each gets its own proof. Run S-004 and S-013 independently; never average their outcomes.

**Verification control** — real/current pack, real corpus, scratch `verificationDir`, synthetic counting runner:

```
expect   corpus_gap(SRC-015)
         runner requests = 0
```

**Verification candidate** — temporary pack with `SRC-015` removed from that requirement only, temporary valid version bookkeeping in the scratch registry, real corpus, scratch `verificationDir`, same synthetic runner:

```
expect   corpus_gap(SRC-015) absent
         source-completeness barrier removed
```

**Do not require zero runner requests here.** Reaching the runner is the correct positive result: it is what "the barrier is gone" looks like.

**Assessment proof** — run the production `assess()` path independently and establish, per requirement:

```
S-004  → entity.member_state_transition_option → national_law_unresolved
S-013  → entity.governing_member_state         → national_law_unresolved
```

**Do not claim that removing `SRC-015` causes `national_law_unresolved`.** The layers are independent and the audit must say only what each probe shows.

**Also trace the producer of `ratified_country_packs`.** Its `entries` are empty and the evaluator does not read `DE.json`/`IE.json`. Establish whether `country-pack ratification → ratified_country_packs` is wired at all. If there is no production derivation, that is an audit finding — the empty catalogue is then **not** proof that the country-pack implementation is wired.

**Causal narrowness is part of the evidence.** Record a manifest showing the candidate pack differs from the real pack only in the intended authored removal plus the version bookkeeping integrity requires. The experiment must not retier W-002, modify country packs, ratify anything, change condition logic, or alter the corpus.

**Isolation is native and must be used.** `runRun(args, paths, capabilities)` (`cli/run.ts:161`) takes `VerifyPaths { packDir, corpusDir, verificationDir }`, and every write destination derives from it (`cli/sign.ts:172-182`). The orchestration exercised is the real one; only the destinations move, and the runner is synthetic. **"Run in the real pack and delete whatever appeared" is not acceptable** while isolated destinations exist.

- **Mutation that must land:** none — this task produces evidence rather than behaviour. Its integrity check is that a reviewer picks three rows at random and reproduces them from the cited artefacts.
- **Expected first relevant red:** not applicable.
- **Acceptance gates:** sixteen rows; every `survives?` answered with a citation; four probe runs (A and B, for S-004 and S-013) carrying real command output and the causal-narrowness manifest; the SRC-010 substitution test answered pass/fail with its evidence; the branch decision stated per requirement, unaveraged.

  **Residue, stated against the right target.** A gap-bearing `runRun` is *expected* under B2 to write a canonical result to the `verificationDir` it was given, so a `verification-result.json` in scratch is **positive evidence, not residue**:

  ```
  REAL repository
    verification-result.json   0 / unchanged
    signatures.jsonl           0
    promotions.jsonl           0
    transcript fixtures        unchanged
    requirements.json          unchanged
    country packs              unchanged
    corpus                     unchanged
    requirement-versions       unchanged
    git status --short         exactly one new document

  SCRATCH A and B
    exactly the production outputs each probe should produce —
    inspected, quoted and cited in the audit report
  ```

  The temporary candidate pack and its temporary registry entry live outside the repository tree and are never staged.
- **Does NOT prove:** anything about the schema, and nothing about whether removals are *safe to land* — only about what the text says and what the production path does.
- **Commit boundary:** one commit. *Trace every requirement to the text it actually rests on.*

---

### Task 3 — Source-register completeness over the audited universe

Spec §14 rule 4, §19.2. Register data only.

- **Files:** `backend/engine/monitoring/source-register.json`; `knowledge/csrd/sources.json` (official title for SRC-006 per spec §12.2, plus any source Task 2 discovered); `test/source-register.test.ts`.
- **Authoritative producer/consumer changed:** the register.
- **Input is the audit's source universe, not a fixed list.** Every source Task 2 leaves in a requirement's provenance, or discovers as newly required, must have a row with tier, `authority`, `governs`, `cadence`, `expectedProvenance`, `tierRationale` and the `mustCorroborateWith` its tier dictates. The six rowless sources of R-5 are the *expected* set; if Task 2 removed one from every requirement, it needs a row only if something still cites it, and if Task 2 added Directive 2006/43/EC it needs one too. **Do not hard-code six.**
- **Schema/version consequences:** none to requirements. `verifyRegisterIntegrity` enforces `mustCorroborateWith` per tier.
- **Migration strategy:** additive. **W-002 is NOT retiered here** — the retier belongs to whichever commit removes the last citation that rests on it (§4.3).
- **Three categories, kept apart.** They have collapsed into one before and the wording here prevents it:

  ```
  monitoring target       a row in monitoring/source-register.json
  pack source catalogue   an entry in knowledge/csrd/sources.json
  cited source            a sourceId in some requirement's provenance
  ```

  The **audited provenance source universe** is the third set. It is a subset of the second — Task 2 may leave a catalogue entry that no requirement cites — and it is what this task must cover.

- **The invariant this task establishes:** *every audited provenance source resolves to exactly one register row whose tier permits citation.* Catalogue entries nothing cites keep their existing contract (`verifyCitationCoverage` over `pack.sources[].url` hosts) and are **not** required to gain a row here. No new obligation is placed on the catalogue; if one is ever wanted, it is a separate register-integrity invariant needing its own justification.
- **Positive controls:** the real pack still loads; `loadSourceRegister(dir, pack)` still passes `verifyRegisterIntegrity` and the pre-existing `verifyCitationCoverage` unchanged.
- **Production-path teeth:** every source id in any requirement's audited provenance resolves to exactly one row's `expectedProvenance` — with a counterexample in the same suite (a synthetic cited source with no row must fail), so the assertion is not satisfied vacuously (evidence-standard rule 7).
- **Mutation that must land:** delete the new `SRC-001` row → the completeness assertion reds naming `SRC-001`.
- **Expected first relevant red:** the register-completeness assertion. A red naming `mustCorroborateWith` means the mutation removed more than intended.
- **Acceptance gates:** every audited source has a row; each new row's `tierRationale` states why that tier and not the next one up; `typecheck` 0.
- **Does NOT prove:** that any document's origin is authorised for its source (Task 5), or that a citation's tier is checked (Task 4).
- **Commit boundary:** one commit. *Give every cited source a row that says what kind of authority it is.*

---

### Task 4 — The provenance migration

Spec §4.2, §5.1–§5.6, §11, §19.2. **One commit; it cannot be split** (§4.1).

- **Files:**
  - `src/knowledge/schema.ts` — `provenance` added with its invariants; `sources` and `provisions` removed from `requirementSchema`
  - `src/types.ts` — `AuthoredRequirement` becomes `Omit<Requirement, 'derivedStatus' | 'statusReasons' | 'sources'>`
  - `src/knowledge/loader.ts` — attaches derived `sources`; refuses a leftover authored `sources` on the raw record (R-1); **requirement-side citability** (below); `:346` validation moves to provenance entries
  - `src/knowledge/provenance.ts` — `sourceIdsOf` body switches to `provenance[*].sourceId`
  - `src/verification/canonical.ts` — `requirementInputSha256({ provenance, logicalPayloadSha256 })`
  - `src/pipeline/reader.ts` — `ReaderInput` carries locators, never `sourceId`; positive projection
  - `prompts/verification/reader.md` — the field renamed in prose (R-3)
  - `src/engine/evaluate.ts`, `src/cli/assess.ts`, `frontend/web/lib/checkResponse.ts`, `frontend/web/components/marketing/CheckFlow.tsx`
  - `knowledge/csrd/requirements.json` — all sixteen: `provenance` authored **from Task 2's matrix**, `sources`/`provisions` removed, `version` → 3
  - `verification/requirement-versions/csrd.json` — a version-3 entry **appended** per requirement
  - `test/golden/…` — a **new** provenance-era recording; the existing golden and adapter untouched (§4.2)
  - `test/verification-transcripts/csrd/CSRD-S-001/` — a **new** recording beside the existing one (§4.2)
  - **`monitoring/source-register.json` — conditional, PASS / PASS only** (W-002 → `tracker`, with the `mustCorroborateWith` its tier dictates). Untouched in every other outcome
- **Authoritative producer/consumer changed:** the authored requirement itself.
- **The §7.1 invariant governs what a locator may name.** Provenance names the current host instrument and the locator within it — never an artefact, and never an amending act added merely because that act is where the authentic wording was first published. An amending act enters provenance only on §3 rule 2's ground: the requirement rests on a proposition uniquely contained in it. Gate G-1 is closed, so this needs no metadata to exist.
- **Requirement-side citability lands here, not later.** Every `provenance.sourceId` must resolve to a register row whose tier is `citable`. Task 3 has made the rows exist. Proving the rule uses a **synthetic** tracker-backed provenance entry (must refuse) with an `official_body` positive control in the same suite (must pass) — otherwise the check is indistinguishable from "refuse everything".
- **What the committed Task-4 tree contains, stated per probe outcome so there is no ambiguity (§4.3):**

  ```
  during the task, before any retier
      W-002 remains legal_record, so the real pack stays loadable
      while the citability rule is being installed and tested

  each requirement, independently
      probe passed → it no longer cites SRC-015 in this commit
      probe failed → it still cites SRC-015 in this commit

  W-002 in this commit
      tracker        only if the commit leaves ZERO requirements
                     citing SRC-015 (the PASS / PASS outcome)
      legal_record   in every other outcome
  ```

  In every outcome the committed tree is internally consistent: while W-002 is `legal_record`, a citation of it is valid under the new citability rule; once W-002 is `tracker`, nothing cites it. A requirement whose own path is proven does **not** wait for the other — that would author a version knowingly carrying provenance the audit disproved.
- **Schema/version consequences:** every requirement moves 2 → 3, carrying the audit's truthful provenance. Versions 1 and 2 stay byte-identical. `requirementSha256`, `requirementInputSha256` and `pipelineVersion` all move; the old replay recording stops binding (R-4).
- **Migration strategy:**
  1. Land the schema and the loader's derivation with old data present — **the tree is red here, intentionally**, and that red is the evidence the schema enforces.
  2. Author `provenance` for all sixteen from Task 2's matrix, including every removal, addition and re-attribution the audit found.
  3. Bump versions and **append** registry entries. Never edit an existing entry.
  4. Golden and replay per §4.2 — preserve, then add.
- **Acceptance state is derived from the audit, never from today's partition.** The test contract is:

  ```
  auditExpectedSources(requirement)   from the committed audit artefact
        ↓
  sourceIdsOf(migratedRequirement)    must equal it, per requirement
        ↓
  expected pre-ingestion gap / reachability state, computed from that set
  ```

  The migration proves that **the structured representation preserves the audited provenance truth** — not that it preserves the old six-reachable/ten-gapped partition. If the post-migration partition happens to match today's, record that as a measurement in Task 10; do not write it into the contract in advance.
- **Positive controls:**
  - a requirement whose audited provenance is unchanged in content but re-expressed structurally produces the same entitled closure and the same `corpusClosureSha256`;
  - every requirement whose audited source set is fully served reaches the reader with `2 + prosecutorCount` requests;
  - every requirement with at least one unserved audited source produces exactly the gap set its audited provenance predicts, and **zero** agent requests.
- **Production-path teeth (six, each able to red alone):**
  - **P1 locator → identity.** Change one locator; `requirementInputSha256` moves. The assertion names the hash property, not a literal digest.
  - **P2 sourceId → entitlement and identity.** Change one `sourceId`; the derived source set (and therefore the closure or gap set) **and** the hash both move, asserted separably.
  - **P3 blindness.** A rendered reader input contains the locator text and contains no `SRC-` identifier — with the positive sibling in the same test (evidence-standard rule 7).
  - **P4 no second authority.** Authored JSON still carrying a `sources` key is **refused at load**, not stripped (R-1).
  - **P5 registry history.** Versions 1 and 2 are byte-identical to `b68bb8e`; version 3 is appended.
  - **P6 citability.** A synthetic tracker-backed provenance entry is refused; an `official_body` entry is accepted.
- **Mutations that must land:** M-P1 drop `provenance` from the hash payload; M-P2 make `sourceIdsOf` return a constant; M-P3 include `sourceId` in the reader projection; M-P4 delete the raw-record refusal; M-P5 rewrite a version-2 digest in place; M-P6 delete the tier check.
- **Expected first relevant red:** for M-P1, a canonical-hash test naming `requirementInputSha256` — **not** a golden diff and **not** `VersionIntegrityError`. A `VersionIntegrityError` at `loadPack` means the mutation reached version integrity before the hash assertion ran (failure mode 2); re-target at the payload construction and re-read the message.
- **Acceptance gates:** all workspaces green; `typecheck` 0; `test:standalone` 0; six teeth recorded verbatim; `git diff b68bb8e -- verification/requirement-versions/csrd.json` shows **only additions**; `git diff b68bb8e -- test/golden/migration-engine-golden.json` and the old transcript file show **no change**; `grep -c '"sources"' knowledge/csrd/requirements.json` returns 0.
- **Does NOT prove:** that authority is validated at the corpus boundary (Task 5), or that any document has been ingested.
- **Commit boundary:** one commit. *Give a requirement one authored place to say what it rests on.*

---

### Task 5 — The `AuthorisedCorpus` boundary

Spec §19.

- **Files:** new `src/corpus/authority.ts`; **`src/cli/ingest.ts`** (see the topology below); `src/corpus/store.ts`; `src/corpus/schema.ts` (wire `verifyCorpusServesCoverage`); `src/pipeline/entitlement.ts` (`forSources` signature); `src/cli/sign.ts`; `src/cli/review-sheet.ts`; `frontend/web/lib/pack.ts`; `src/index.ts`; `test/corpus-authority.test.ts` (new); `test/corpus-ingest.test.ts`; `test/pipeline-entitlement.test.ts`; `test/cli-run.test.ts`; the fixture builders.
- **Authoritative producer/consumer changed:** the corpus capability. `EntitledClosure.forSources` stops accepting a structural `EntitlementSource`.

- **The call topology, traced and settled.** The spec requires validation at both boundaries, and reconnaissance shows there is **no shared lower-level function that both cross with the knowledge the check needs**:

  ```
  ingest main()                          load path
    fetchDocument                          loadCorpus
    buildDocumentEntry                       parseCorpusIndex        ← shared, pack-ignorant
      parseCorpusIndex   ← shared            verifyCorpusIntegrity   ← shared, pack-ignorant
    mergeIntoIndex                           hash/normalizer checks
    verifyCorpusIntegrity ← shared              ↓
       ↓  ««« nothing pack- or register-aware runs here »»»
    writeFileSync raw / normalized / index.json
  ```

  `parseCorpusIndex` and `verifyCorpusIntegrity` are crossed by both, but `verifyCorpusServesCoverage`'s own docstring forbids giving them what the check needs: the corpus *"must not acquire pack knowledge; only this check needs a pack"*. So the shared validator is its own function in `src/corpus/authority.ts`, invoked at **two** call sites: the ingest preflight (after `verifyCorpusIntegrity(merged)`, **before** the first `writeFileSync`) and the `AuthorisedCorpus` construction. `cli/ingest.ts` gains the register and pack paths it does not take today — it accepts only `--corpus-dir` at present.
- **Schema/version consequences:** the register may gain a per-source artefact-origin declaration (spec §19.4) — generic, no host named in code. No requirement version moves.
- **Migration strategy:** build the validator with register and pack in hand; invoke it at the ingest preflight; construct `AuthorisedCorpus` at all three composition roots (§1.4); then narrow `forSources`. The narrowing lands in the same commit — a validator nothing requires is a comment — and so does the ingest preflight, because a use-time guard alone still lets an unauthorised artefact become committed corpus state.
- **Positive controls:** the real corpus, pack and register load and produce the same `corpusClosureSha256` for a served requirement as before. **Fixtures get a builder that runs the same validation over synthetic data — there is no unchecked test-only constructor.**
- **Production-path teeth — both directions, because either alone leaves a route open:**
  - **P7 ingress.** Attempt to ingest an artefact whose origin is not authorised for the source it claims to serve → **refused before any corpus state is committed**. Assert the refusal *and* that `index.json`, `raw/` and `normalized/` are byte-unchanged — ingest already promises "Nothing was written" on other failures, and this must keep that promise.
  - **P8 use-time.** Place invalid corpus state directly on disk, behind ingest's back, then load → `AuthorisedCorpus` refuses and the state can never reach an `EntitledClosure`. Together P7 and P8 prove *ordinary ingestion cannot create it* **and** *another route cannot smuggle it in*.
  - **P9** a document serving a source with no citable row → load refuses, naming the source.
  - **P10** a document whose origin is authorised for `SRC-Y` only, serving `SRC-X` on the same host → refuses, naming the **source**, not the host.
  - **P11** unwire `verifyCorpusServesCoverage` → a real load/run test reds.
- **The run-level wiring tooth, and what a mutant can honestly prove.** If `forSources` requires the branded type, deleting the construction at `readWorld` **fails typecheck** rather than producing a runtime red — a compile error is real evidence of the type boundary, but it is *not* evidence that the production root invokes validation. Two independent propositions are needed:

  ```
  compile-time   a raw corpus cannot satisfy the entitlement signature
                 → a @ts-expect-error test, compiled by npm run typecheck

  runtime        the production composition root actually runs the validator
                 → a mutant that changes the wiring while still compiling
  ```

  For the runtime half, mutate through whatever raw construction path the implementation must itself possess — the validator's own constructor, misused at `readWorld` to build the branded value without validating. **If the only available bypass is an explicit unsafe cast or deleting the branded requirement itself, record that distinction rather than manufacturing a meaningless mutant**; in that case the runtime proposition is carried instead by an invocation assertion at `readWorld` paired with a positive control (evidence-standard rule 7), and the plan says so out loud.
- **Mutations that must land:** M-P7 (ingress origin), M-P8 (use-time smuggling), M-P9, M-P10 (compare hosts instead of source-scoped origins), M-P11, plus the runtime-wiring mutant above.
- **Expected first relevant red:** for the wiring mutant, a `cli-run` or entitlement test naming the run or the closure — **not** `corpus-authority.test.ts`. If only the direct validator test reds, the production path is not wired and the task is not done; that is the exact defect this task removes. For M-P7, a `corpus-ingest` assertion naming the unauthorised source, with the untouched-files assertion beside it.
- **Acceptance gates:** both call sites validate; all three composition roots construct through the validator; no `EntitledClosure.forSources` call takes an unvalidated object; frontend green; `typecheck` 0.
- **Does NOT prove:** anything about which sources a requirement may cite — that is Task 4's citability rule — and nothing about an artefact's **authenticity**. Origin authority admits a EUR-Lex consolidation as a valid origin for `SRC-001` without asserting it is the authentic publication (spec §7.1, §19.2). Scope unchanged; the boundary is only stated so nobody later reads `AuthorisedCorpus` as having answered it.
- **Commit boundary:** one commit. *Make a document earn entitlement before it can be read.*

---

### Tasks 6–9 — Ingest the surviving immutable evidence

Spec §14. One commit per document, each through `cli/ingest.ts` **as modified by Task 5** — no per-document change to it, but not "unchanged": every ingestion now passes the authority preflight before anything is written.

| Task | Document | Notes |
|---|---|---|
| **T6** | `2023/2772` consolidated 01/01/2025 → `SRC-005` | ≈907k chars. Ingest whole |
| **T7** | `2025/1416` → `SRC-006`, with an `amends` edge to T6's document | Ordering: the edge needs a live endpoint |
| **T8** | Commission Notice `C/2024/6792` → `SRC-009` | `official_body`; likely first user of the whole-document locator |
| **T9** | `2022/2464` consolidated 18/03/2026 → `SRC-002` | **Only if Task 2 left a real dependency.** If not, skip and record why |

**The ingestion invariant — per source, computed from the audited provenance, never from one representative requirement.** For each source `SRC-X`:

```
before ingestion
  every requirement whose audited provenance contains SRC-X carries
  corpus_gap(SRC-X), unless SRC-X was already served

after ingestion
  corpus_gap(SRC-X) disappears from exactly that provenance-dependent
  population, and from no other requirement

  every unrelated source gap is unchanged

  agent reachability changes ONLY for requirements whose FINAL blocking
  source gap was SRC-X
```

The affected population is computed by filtering on `sourceIdsOf(requirement)`. **Two positive controls are required, and together they are the point:**

- a requirement for which `SRC-X` was the last unserved source → its gap set empties **and** it genuinely reaches the agents (`2 + prosecutorCount` requests);
- a requirement with another unserved source → `corpus_gap(SRC-X)` disappears **and** requests stay **zero**. S-012 is the live example: ingesting `SRC-005` must remove `corpus_gap(SRC-005)` while S-012 still halts on `SRC-006` and/or `SRC-007`.

Asserting only the first would let "one gap disappeared" pass as "the requirement reached the reader", which is false for every multi-gap requirement.

**Structural closure expansion is a separate observation and must not be conflated with it.** Serving relationships decide which source gaps disappear; structural edges decide which documents enter a closure. T7's `amends` edge is predicted to pull the 907k-char ESRS text into S-003's closure without changing S-003's gap set at all. Record both facts separately; neither is evidence for the other.

For each task:

- **Files:** `corpus/index.json`, `corpus/raw/<slug>.html`, `corpus/normalized/<slug>.txt`; a per-document integrity case.
- **Schema/version consequences:** none to requirements. `corpusClosureSha256` moves for every requirement whose closure now includes the document — recorded in Task 10.
- **Migration strategy:** fetch, normalize, hash, index through the existing path; edges declared with `eli_metadata`/`celex_metadata`/`human` provenance and a `recordedOn`.
- **Mutation that must land:** corrupt one byte of the normalized file → `loadCorpus` reds naming `sha256Normalized` for that `docId`. A red naming a different document means the wrong file was touched.
- **Acceptance gates:** integrity green; the affected population changes exactly as the invariant predicts and nothing else does, except structural expansion, which is recorded rather than suppressed.
- **Does NOT prove:** that the document is legally sufficient for the requirement — only that it is present, pinned and reachable.
- **Commit boundary:** one commit each.

---

### Task 10 — Topology, closure and context measurement

Spec §15, §20. **Report only.** New `docs/superpowers/reports/2026-08-24-d1a-topology.md`.

Measured per requirement, through the real production path with request counting: the model-reachable / gap-bearing partition and which gap each halting requirement carries; closure documents; rendered closure chars and bytes; input tokens (exact for the candidate pipeline's tokenizer, or estimated with the basis stated); **which requirements inherit a document through structural traversal**; zero agent requests for every gap-bearing requirement; the four identity constants.

Every number cites the command that produced it. If a rendered input exceeds a candidate pipeline's context window, record it as a **B3 feasibility failure for that candidate** and stop; do not redesign closure or retrieval here.

- **Commit boundary:** one commit. *Measure what the corpus now costs to read.*

---

### Task 11 — Deferred provenance correction — **over whatever subset remains unresolved**

Runs **only** for the requirements whose Task 2 paired probe failed (§4.3). On PASS / PASS both were corrected in Task 4 and **this task does not exist**. On PASS / FAIL or FAIL / PASS it covers **one** requirement; on FAIL / FAIL, both. Nothing here assumes the subset is `{S-004, S-013}`.

- **Files:** the country-path fix for each unresolved requirement; `knowledge/csrd/requirements.json` (each such requirement → version 4); `verification/requirement-versions/csrd.json` (append); **`monitoring/source-register.json` — only in the commit that removes the last remaining `SRC-015` citation** (W-002 → `tracker`).
- **Atomicity — the final removal, not every removal.** The retier is in the same commit as the citation removal that leaves **zero** requirements citing `SRC-015`. If two requirements are unresolved and are repaired separately, the first commit removes its citation and leaves W-002 as `legal_record` — valid, because a citation of a `legal_record` row passes the citability rule — and the second commit removes the last citation and retiers. The general citability rule already exists from Task 4; this task is not where it is introduced.
- **Production-path teeth:** retiering W-002 in a commit that leaves **any** `SRC-015` citation standing must make the pack fail to load, naming the tracker-backed citation. After each change, the corrected requirement must still surface the unresolved national-law state through the real path — a requirement that quietly becomes reachable because its gap disappeared is the visible-to-invisible failure the spec forbids.
- **Commit boundary:** one commit per repaired requirement; the last of them carries the retier. *Watch the transposition tracker instead of citing it.*

---

### Envelopes E1–E4 — class-B capability (deferred, not implementation-ready)

Spec §7, §9, §16. **These are capability envelopes, not tasks.** Each states the spec's acceptance conditions and its gate; **each requires a dedicated implementation sub-plan before execution.** Writing file lists and mutants now would be speculation about a dependency that has not been selected and an API that does not exist.

| Envelope | Subject | Acceptance condition from the spec |
|---|---|---|
| **E1** | Deterministic PDF text extraction; `NORMALIZER_VERSION` bump from `1.0.2` | Byte-identical extraction across machines, or the envelope fails. A new runtime dependency needs its own approval |
| **E2** | `CorpusDocument` **document standing** reaching verification — temporal legal status (§7) and serving-artefact authenticity (§7.1) | No role can read an `adopted_not_effective` document as current law, nor an official consolidation as the authentic publication; mutating either classification away reds a run-level assertion |
| **E3** | Lifecycle metadata and successor–predecessor relation, **outside** closure traversal | Adding a lifecycle relation must **not** change any `corpusClosureSha256`. Implementing it as an edge must red that assertion |
| **E4** | Source-scoped artefact origin for Commission PDFs | Extends Task 5's declaration; generic, no host named in code |

---

### Task 12 — Ingest `SRC-007` / `SRC-008`

Gated behind E1–E4's sub-plan being approved and green. Four artefacts (two acts, two annexes), same shape and same ingestion invariant as Tasks 6–9, plus: the `adopted_not_effective` status asserted through the production path, and S-011's cap-catalogue dependency shown to resolve to the annex.

- **Does NOT prove:** that either act is in force. The point of the status field is that it never can.
- **Commit boundary:** one commit.

---

### Task 13 — Final topology measurement

Same shape as Task 10, over the finished tree. Records the resulting partition **as a measurement**, states which residual gaps are truthful and why, and either unblocks B3 or names the feasibility failure that does not.

**Runs after all required work, independent of the optional branch.** If E1–E4 and Task 12 completed, it measures with `SRC-007`/`SRC-008` represented and their temporal status recorded. If they were deferred, it measures both as residual gaps, records that the inability to represent adopted-not-effective evidence is itself the truthful finding, and **D1(a) completes**.

- **Commit boundary:** one commit. *Record what the corpus can and cannot answer.*

---

## 4. Migration, preservation and version policy

### 4.1 Why Task 4 cannot be split

**Split A — provenance optional first, mandatory later.** Adding `provenance` while `sources` is still authored changes `requirementSha256`, forcing a version bump; removing authored `sources` later changes it again, forcing a second. Two versions for one meaning change, and the first would record a shape that never meant anything different legally. Rejected.

**Split B — schema first, data later.** Impossible while provenance is mandatory: the pack stops loading the moment the schema requires a field the data lacks. The intermediate commit is a broken tree, not a smaller boundary.

**Adopted — Task 1 extracts the seam, Task 2 produces the locators, Task 3 makes the authority resolvable, Task 4 switches everything at once.** After the first three, Task 4 is *mechanical*: thirteen call sites already read one function, every locator is written down and reviewed, and every source id resolves.

### 4.2 Preservation policy — append, never overwrite

**Settled: historical evidence is never rewritten.** This applies uniformly.

**The engine golden (R-2).** `test/golden/migration-engine-golden.json` and its existing adapter are **preserved byte-for-byte**. The adapter's docstring — *"must not grow: anything it needs to normalise beyond the single mapping is an unintended behaviour change"* — is treated as a contract, not a comment. The provenance-era engine shape gets a **new, explicitly named and versioned recording** with its own test. If a compatibility test genuinely needs a transformation from the historical shape into the provenance-era shape, it gets a **new named transformation whose scope is that migration**; no branch is added to the old adapter. Evidence required when Task 4 lands: `git diff b68bb8e -- test/golden/migration-engine-golden.json` and the same diff for `migration-golden.test.ts`'s adapter both empty, plus the new recording's test green.

**The replay recording (R-4).** The committed `run-v1-764e571e….json` is **retained byte-for-byte** and remains evidence for the old binding. The sequence is:

1. **Compare the two bindings directly**, before invoking replay at all. Reconstruct the old run binding (from the retained recording) and the new one (from the migrated pack), and assert that **exactly three** `BINDING_FIELDS` differ: `pipelineVersion`, `requirementInputSha256`, and the derived `runId` — the last because `runId` is itself a binding field and `buildRunId` hashes the first two. `packId`, `requirementId`, `renderedConditionSha256` and `corpusClosureSha256` must be **identical**; that half is the discriminating assertion, because it proves only the predicted things moved. Any other field differing means **stop**.
2. **Then observe the production refusal.** Replay the new run against the retained recordings and confirm it throws `TranscriptRunMismatchError` — a *selection* miss (no recording claims the new `runId`), not a rejection of a selected recording. Assert on the error's `.differences`, which `closest()` computes over the retained old recording, and on `.offered` listing the old `runId`. **Do not require this error to enumerate fields that selection prevented it from examining** — it reports a near-miss explanation, and the authoritative field-level proof is step 1.
3. Record a **new** fixture through the sanctioned offline machinery: `npx tsx test/record-replay-fixture.ts` from `backend/engine`, driving `syntheticCapability`. No live model, no credential.
4. File it as `${runId}.json` beside the old one. `readTranscriptsFor` reads every `.json` in the directory, enforces the filing rule, and selects exactly by `runId`, so both generations coexist with **no harness change**.
5. Update `PROVENANCE.md` to describe both generations and why the first is retained.

Do not edit the old transcript. If step 4 turns out to be blocked, that is a migration-design finding to raise explicitly, not to route around.

**The version registry.** Versions 1 and 2 stay byte-identical; version 3 is appended; any version 4 is appended. `git diff` over the registry must show only additions, in every commit, forever.

### 4.3 Version sequence, reconciled against the audit

The criterion: a version is authored only for a state of knowledge that genuinely existed. Carrying a citation the audit has already proven wrong into version 3, purely to correct it in version 4, would manufacture an intermediate authored meaning we already know to be false.

**`SRC-010` / S-010 / S-011 — criterion B, folded into version 3.** The substitution test is entirely textual and runs inside Task 2 (spec §17). Nothing about it depends on a capability that does not exist at Task 4. So if the test passes, `SRC-010` is removed **in Task 4**, and S-010/S-011 have no version 4. (S-011 keeps its `SRC-008` dependency and therefore keeps gapping; removing `SRC-010` does not make it reachable.) If the test fails, `SRC-010` stays cited and the failure is recorded — also in version 3, and truthfully so.

**`SRC-015` / S-004 / S-013 — decided per requirement, by that requirement's own paired probe.**

The two provenance decisions are **independent**; the register retier is their **shared dependency**. Treating them as one branch would make a requirement whose replacement path is proven keep a citation the audit has disproven, purely because a *different* requirement is still unresolved — which is exactly the manufactured intermediate meaning this section exists to prevent.

**The invariant, in two halves:**

> A requirement drops `SRC-015` as soon as **its own** replacement provenance path is proven. W-002 is retiered to `tracker` only in a commit that also leaves **zero** requirements citing `SRC-015`.

The four possible probe outcomes:

```
PASS / PASS
  S-004  remove SRC-015 in v3
  S-013  remove SRC-015 in v3
  W-002  retier tracker in the same Task-4 commit
  no v4 required for this issue; Task 11 does not exist

PASS / FAIL
  S-004  remove SRC-015 in v3
  S-013  retain SRC-015 in v3 — its boundary is not yet proven
  W-002  remains temporarily legal_record
  later  fix S-013, then remove its citation — the last one —
         and retier W-002 to tracker, at v4

FAIL / PASS
  symmetric

FAIL / FAIL
  S-004  retain SRC-015 in v3
  S-013  retain SRC-015 in v3
  W-002  remains temporarily legal_record
  later  each repair determines its own removal; the W-002 retier occurs
         only in the commit that removes the final citation
```

**Atomicity, stated exactly.** The **final** citation removal and the retier are in the same commit. Earlier removals are not — and need not be, because while any citation remains, W-002 is still `legal_record` and every remaining citation is valid under the citability rule. This is weaker than "removal and retier are always atomic", and it is the correct strength: it keeps *no committed state contains a requirement citing W-002 after W-002 is a tracker* while no longer forcing a version to carry disproven provenance.

**No averaging, and no coupling either.** One requirement's outcome neither licenses nor blocks the other's removal.

**Resulting version plan:**

| Requirements | v3 | v4 |
|---|---|---|
| all sixteen | Task 4 (the schema migration) | — |
| S-010, S-011 | Task 4, with `SRC-010` resolved | none |
| S-004 | Task 4 — `SRC-015` removed if its probe passed, retained if not | only if its probe failed, at Task 11 |
| S-013 | Task 4 — `SRC-015` removed if its probe passed, retained if not | only if its probe failed, at Task 11 |
| W-002 tier | `tracker` at Task 4 **only** on PASS / PASS | otherwise at the Task 11 commit that removes the final citation |

---

## 5. Readiness claim

**Implementation-ready:** Tasks 1–10, plus Task 11 over whatever subset Task 2 leaves unresolved, and Task 13.

**Not implementation-ready:** envelopes E1–E4 and Task 12, which depends on them. They carry the spec's acceptance conditions and a gate; each needs a dedicated sub-plan written when its gate opens. Claiming otherwise would put speculative file lists and mutants against a dependency nobody has selected.

---

## 6. Mutation and evidence matrix

| # | Mutation | Must red | First relevant red names | Guards against |
|---|---|---|---|---|
| M-1 | `sourceIdsOf` returns `[]` | run-level source-completeness | gap set or request count | thirteen call sites not actually redirected |
| M-3 | delete the new `SRC-001` register row | register completeness | `SRC-001` | rowless sources inheriting authority |
| M-P1 | drop `provenance` from the `requirementInputSha256` payload | `verification-canonical` | `requirementInputSha256` | locator edits not moving identity |
| M-P2 | `sourceIdsOf` returns a constant | entitlement **and** hash, separately | closure/gap set; the hash | sourceId edits not moving entitlement |
| M-P3 | include `sourceId` in the reader projection | blindness assertion | a `SRC-` id in the rendered input | identity leaking to the blind reader |
| M-P4 | delete the loader's raw-record refusal | leftover-`sources` refusal | the leftover key | zod silently stripping a second authority |
| M-P5 | rewrite a version-2 digest in place | registry-history assertion | the altered version | historical meaning overwritten |
| M-P6 | delete the citability check | synthetic tracker-citation test | the tracker-backed citation | the settled invariant being prose |
| M-P7 | ingest an artefact whose origin is unauthorised for the source it claims | `corpus-ingest` refusal **and** untouched-files assertion | the unauthorised source | an unauthorised artefact becoming corpus state |
| M-P8 | place invalid corpus state on disk behind ingest's back | load/entitlement refusal | the source id | a second route smuggling state past the preflight |
| M-P9 | delete the tier check in the corpus validator | authority test | the source id | non-citable sources backing documents |
| M-P10 | compare hosts instead of source-scoped origins | same-host counterexample | the source id, not the host | host coincidence conferring authority |
| M-P11 | unwire `verifyCorpusServesCoverage` | a real load/run test | the load path | the defect at §1.6 |
| M-W | build the branded value at `readWorld` without validating (must still compile) | a real `verify run` test | the run or the closure | validator wired only at compile time |
| M-T | `@ts-expect-error`: hand `forSources` a raw corpus | `npm run typecheck` | the entitlement signature | the type boundary being nominal only |
| M-R | reconstruct the two run bindings and compare | binding-field assertion | exactly `pipelineVersion`, `requirementInputSha256`, `runId` | claiming a field enumeration selection cannot produce |
| M-6..9 | corrupt one normalized byte | `loadCorpus` | `sha256Normalized` + `docId` | ingestion not actually pinned |
| M-I | assert only the final-gap control in an ingestion task | the multi-gap control | requests still zero for S-012 | "one gap gone" reading as "reader reached" |
| M-E3 | implement the lifecycle relation as an edge | closure-hash invariance | `corpusClosureSha256` | lifecycle expanding entitlement |
| M-11 | retier W-002 in a commit leaving any `SRC-015` citation standing | pack integrity | the tracker-backed citation | a committed state citing a tracker |

Every row is subject to evidence-standard rule 2: confirm the mutation landed before interpreting either colour, and if the message does not name the intended assertion, the mutation is wrong.

---

## 7. Expected commit sequence

| # | Commit | Spec stage |
|---|---|---|
| 1 | Read the cited source set through one function | D1a-0a |
| 2 | Trace every requirement to the text it actually rests on | D1a-0b |
| 3 | Give every cited source a row that says what kind of authority it is | D1a-0a |
| 4 | Give a requirement one authored place to say what it rests on | D1a-0a + D1a-1 (+ D1a-6 for each requirement whose probe passed) |
| 5 | Make a document earn entitlement before it can be read | D1a-0a |
| 6–9 | Four ingestion commits, one per document (9 conditional) | D1a-2 |
| 10 | Measure what the corpus now costs to read | D1a-3 |
| 11 | Watch the transposition tracker instead of citing it — **only for the unresolved subset**; one commit each, the last carrying the retier | D1a-6 |
| — | E1–E4 sub-plan, if approved | D1a-4 |
| 12 | Ingest the two adopted acts, as adopted | D1a-5 |
| 13 | Record what the corpus can and cannot answer | D1a-7 |

---

## 8. Risks that could legitimately stop implementation

**Risk 1 — the engine golden. SETTLED, no decision outstanding.** Preserve the existing golden and adapter byte-for-byte; add a new versioned provenance-era recording; never branch the old adapter (§4.2). The evidence required at Task 4 is two empty diffs plus one new green test.

**Risk 2 — replay binding.** The mismatch must name exactly `pipelineVersion` and `requirementInputSha256`. Any other field means something moved that this plan did not predict — stop and report. The old recording is never edited (§4.2).

**Risk 3 — the audit contradicts the spec's expectations.** The spec's §12 disposition table is an expectation the audit governs. But if the audit contradicts a *settled* spec decision — for instance, that a locator cannot be expressed without naming its source to the reader — stop and report rather than deciding locally.

**Risk 4 — Task 5 and the public site.** `AuthorisedCorpus` must cross into the frontend workspace, and the standalone artifact gate has produced this class of failure before.

**Risk 5 — E1's dependency.** If no PDF extractor gives byte-identical output across environments, E1–E4 and Task 12 stay deferred and the two adopted acts remain truthful gaps. An acceptable outcome, not a failure.

---

## 9. Self-review

| Question | Answer |
|---|---|
| 1. Does any task enforce provenance before its register authority exists? | No. Register completeness is Task 3; the citability rule and the resolve-to-a-row invariant land in Task 4 |
| 2. Does any test assume today's 6/10 topology after the audit may change provenance? | No. Task 4's acceptance derives from `auditExpectedSources`; the partition is a Task 10 measurement |
| 3. Does any single-source ingestion test equate "one gap disappeared" with "the reader was reached"? | No. The invariant is population-based and requires both controls, with S-012 named as the multi-gap case |
| 4. Does any migration overwrite historical evidence? | No. §4.2 makes preservation uniform across goldens, transcripts and the version registry, with diff-empty acceptance gates |
| 5. Is requirement-side citability a production invariant before W-002 is retiered? | Yes. It lands in Task 4; the retier is atomic with the **final** citation removal (§4.3) |
| 6. Does any planned version represent a provenance state already known to be wrong? | No. §4.3 applies the criterion per source **and per requirement**: `SRC-010` folds into v3; each of S-004 and S-013 drops `SRC-015` in v3 as soon as its own path is proven, and defers to v4 only where the fix genuinely does not exist yet |
| 7. Are deferred envelopes described honestly? | Yes. E1–E4 are capability envelopes requiring their own sub-plan, and §5 states the readiness claim explicitly |
| 8. Does the replay proof require a failure the lookup order cannot produce? | No. §4.2 step 1 compares the two bindings directly and asserts three moved fields including `runId`; step 2 asserts a *selection* miss and reads `.differences` as a near-miss explanation, not as a rejection |
| 9. Is authority validated at ingestion as well as at entitlement? | Yes. Task 5 modifies `cli/ingest.ts` and states why no shared lower-level function can carry the check; both directions have their own tooth |
| 10. Is the Task-4 committed tree unambiguous in every probe outcome? | Yes. Task 4 states the file set and the end state per outcome, and notes that a citation of a `legal_record` row stays valid while W-002 has not been retiered |
| 11. Can an optional capability become a release dependency? | No. §2 and Task 13 both state that the final measurement runs after required work only |
| 12. Do the audit probes leave residue in the repository? | No. Task 2 redirects `verificationDir` (and the temporary registry it derives) through the production function's own parameter, and measures inertness against the **real** repository — scratch outputs are positive evidence, not residue |
| 14. Can the probe actually answer the branch question? | Yes, and only as a pair. A current-pack run is masked by the source-completeness guard, so Task 2 runs a control **and** a candidate-provenance run per requirement, and reports the transition rather than a single observation |
| 15. Does the candidate experiment weaken any invariant to run? | No. Version integrity is satisfied honestly — the temporary registry entry lives in scratch, because `registryDir` derives from `verificationDir` — and the candidate pack differs only in the one authored removal, proven by a recorded manifest |
| 13. Do "pack source", "cited source" and "monitoring target" stay distinct? | Yes. Task 3 names the three categories and scopes its invariant to the audited provenance universe only |

---

## 10. Final acceptance state

D1(a) is complete when:

- every requirement carries `provenance` with at least one locator per cited source, and the pack refuses to load without it;
- every `provenance.sourceId` resolves to a register row whose tier permits citation, proven by a mutation that removes the check — and `SRC-015` is cited only while W-002 is still `legal_record`, with the retier landing in the commit that removes the final citation;
- there is exactly one production derivation of the source-id set, and no authored `sources` survives in any requirement;
- a source identity cannot reach the blind reader, proven by a mutation that makes it try;
- no document enters an entitled closure without validated source and artefact authority, proven by a **run-level** bypass mutant;
- the surviving immutable evidence is ingested, pinned and reachable, with each source's affected population measured against its audited provenance;
- adopted-not-effective material is either representable with its status visible to verification, or absent and truthfully gapped;
- every generation of historical evidence — goldens, transcripts, version digests — is still present and unedited;
- the resulting model-reachable partition is **measured and recorded**, never targeted;
- `npm test`, `npm run typecheck` and `npm run test:standalone` are green, the repository is inert, no model was called, and no promotion or real signature was produced.
