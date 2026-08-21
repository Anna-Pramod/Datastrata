# B1b-ii-b — Signing, surfaces, migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the record B1b-ii-a built into a thing a human can sign, withdraw and read — and then move the public site from an asserted status to a derived one without changing a single byte a customer sees.

**Architecture:** Two CLIs (`sign`, `revoke`) and a review sheet over `src/verification/`, then a compile-time migration that deletes asserted `ratification` and has the loader attach `derivedStatus`. The migration lands last and is fenced by two recorded goldens captured before anything moves.

**Tech Stack:** TypeScript (strict, ESM), zod (declared `^3.23.8`, installed **3.25.76** — the walker in `accounting.ts` was probed against the installed version, so that is the number that matters), vitest. Frontend is Next.js 15 / React 19. No new runtime dependencies; vitest in `frontend/web` is a devDependency.

## Why this plan is specified by behaviour, not reference code

B1a's plan supplied full reference implementations and eight defects were found in that code, while implementers made zero transcription errors. B1b-i and B1b-ii-a specified interfaces and behaviours instead, and the defects that remained were in *specification* rather than transcribed code — cheaper to find, because reviews read specifications closely. B1b-ii-a's execution bore this out again: every task surfaced a real defect, and each one was a specification error (a wrong `csrd` count, an incomplete classification table, a contradiction between the plan and factory §4.3), never a mistyped line.

This plan gives exact interfaces, exact behaviours and exact test cases, and leaves implementation to the implementer. Where a value is required it is given verbatim and must be used verbatim.

## Global Constraints

- **`docs/superpowers/TEST-EVIDENCE-STANDARD.md` governs what counts as evidence in every task of this plan.** Read it before writing a teeth check. It is a standing standard, not a note on this phase.

- **No new runtime dependencies.** `zod` only; `node:*` builtins fine. `vitest` may be added to `frontend/web` as a **devDependency**.
- **TypeScript strict, with `noUncheckedIndexedAccess: true`.**
- **Program-agnostic.** No regulation name in `backend/engine/src/`. `grep -ri csrd backend/engine/src/` must stay at exactly **five** hits: `types.ts` (1), `cli/assess.ts` (1), `verification/render.ts` (2, both `CSRD-S-013`), `engine/summary.ts` (1).
- **`src/verification/` stays pure** — no filesystem, network or clock. The CLIs under `src/cli/` do the reading and writing; `src/verification/` is handed values.
- **Every file starts with a JSDoc block saying *why* the file exists**, not what it does — match `src/corpus/store.ts`.
- **Invisible or visually ambiguous characters in code are escape sequences** (non-breaking spaces, combining marks, zero-width). Visible punctuation stays literal.
- **Commit message style is imperative sentence-case with no prefix.** No `Co-Authored-By` trailer.
- **The user runs every `git add` and `git commit`.** Implementers leave work in the tree and hand over the commands.
- **`npm test` green before every hand-off.** No test performs a network fetch.
- Work from the repo root and `backend/engine`. The suite stands at **705 tests** green at the start of this plan; each task's baseline is the previous task's finishing count.

## Spec reference

`docs/superpowers/specs/2026-08-20-b1b-ii-record-design.md` — §5, §5.1, §7, §7.1–§7.4 and §8 govern this plan. `docs/superpowers/specs/2026-08-20-verification-factory-design.md` §4.5 (refusals) and §4.6 (review sheet) supply detail. Where the two differ, the B1b-ii document governs.

## What B1b-ii-a hands forward

Four obligations, all recorded in `docs/superpowers/CHECKPOINT-b1b-ii-a.md`. Each is assigned to a task here:

| Obligation | Task |
|---|---|
| `normalizer_changed` is over-broad — narrow it by renormalising retained raw bytes | Task 4 |
| Missing pinned result / vanished pinned document must be raised as `INTEGRITY_FAILURE` by the caller | Task 3 |
| A tampered `entryId` makes the ledger unreadable, so `revoke` refuses — surface it as forensics-required | Task 4 |
| ~~The registry keys versions as strings while every type uses numbers — needs a deliberate `String(version)`~~ **— retired at Task 3: the hazard does not exist as stated.** JavaScript coerces a number index to a string key, so `registry[id][2]` and `registry[id]['2']` are the same lookup (verified). The defect is only reachable through a `Map` or a strict key comparison, neither of which the code uses. The `version: 2` test was written anyway and confirmed to have teeth against a `Map`-keyed mutant | Task 3, closed |

## File structure

| File | Responsibility |
|---|---|
| `frontend/web/lib/checkResponse.ts` | **New** — the check payload as a pure function of answers and date |
| `frontend/web/app/api/check/route.ts` | **Modified** — thin wrapper; supplies the clock, holds no logic |
| `frontend/web/vitest.config.ts` | **New** — the frontend's first test runner |
| `backend/engine/src/verification/promotions.ts` | **New** — parse `promotions.jsonl`, resolve a `pipelineVersion` to its promotion record |
| `backend/engine/src/verification/sign.ts` | **New** — `buildSignature`, candidate consistency, the refusal set. Pure |
| `backend/engine/src/cli/sign.ts` | **New** — reads the world, calls `sign.ts`, appends, verifies after write |
| `backend/engine/src/cli/revoke.ts` | **New** — the sanctioned revocation write path |
| `backend/engine/src/cli/review-sheet.ts` | **New** — HTML generation, git-ignored output |
| `backend/engine/src/engine/evaluate.ts` | **Modified** — `includeDraft` becomes `minStatus` |
| `backend/engine/src/knowledge/loader.ts` | **Modified** — attaches `derivedStatus` and `statusReasons` |
| `backend/engine/src/types.ts` | **Modified** — `Ratification` deleted; `Determination.derivedStatus` |
| `backend/engine/knowledge/csrd/requirements.json` | **Modified** — `ratification` deleted from all 16 |
| `frontend/web/lib/pack.ts` | **Modified** — counts by `derivedStatus` |

**Dependency order:** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6. Tasks 3–5 touch no product behaviour and could in principle run before Tasks 1–2, but the goldens are cheap and are the safety net for Task 6, so they go first: a net you install after the fall is not a net.

---

### Task 1: A clock-free check response, and a test runner for the surface that has none

Spec §7.1 requires a **public rendered golden** — the user-visible checker result, byte-identical before and after. Two things block that today, and both are this task.

**`frontend/web` has no test runner and no tests at all.** Root `npm test` runs `--workspace @datastrata/engine` only. A golden that cannot be executed is a document, not a test.

**The payload reads the clock.** `app/api/check/route.ts` computes `const assessmentDate = new Date().toISOString().slice(0, 10)`, so the same answers produce a different payload tomorrow. Spec §7.1: *"Freeze nondeterminism before capturing: assessment date, any incidental ordering."* The engine already takes the date through `AssessmentContext` rather than the clock, which is what makes this tractable — the route is the only clock in the path.

**Files:**
- Create: `frontend/web/lib/checkResponse.ts`
- Create: `frontend/web/vitest.config.ts`
- Create: `frontend/web/test/check-response.test.ts`
- Modify: `frontend/web/app/api/check/route.ts`
- Modify: `frontend/web/package.json` (vitest devDependency, `test` script)
- Modify: `package.json` (root `test` runs both workspaces)

**Interfaces:**
- Produces:
  - `interface CheckResponse` — the exact payload shape the route returns today, written out as a type rather than inferred, so a later field drop is a compile error rather than a silent omission
  - `buildCheckResponse(pack: KnowledgePack, answers: CheckerAnswers, assessmentDate: string): CheckResponse`

**Required behaviours:**

1. **`buildCheckResponse` is pure and takes the date as a parameter.** No `new Date()`, no `Date.now()`, no `performance.now()` anywhere in `checkResponse.ts`. The route supplies the clock and nothing else does.
2. **The route becomes a thin wrapper**: parse the body, call `csrdPack()`, compute the date, call `buildCheckResponse`, wrap in `NextResponse.json`. Every mapping, filter, count and copy lookup moves into `checkResponse.ts` unchanged. **Move the logic; do not rewrite it.** A payload that changes shape in this task destroys the golden before it is taken.
3. **The payload is byte-identical to today's** for the same answers and date. This is the whole point of the task and is asserted in Task 2.
4. **`vitest` is a devDependency of `frontend/web`**, never a runtime dependency, and no test performs a network fetch. The route's `next/server` import must not be pulled into the test — that is why the pure builder is a separate file.
5. **Root `npm test` runs both workspaces**, so a frontend regression fails the same command everything else fails.

**Required test cases:** `buildCheckResponse` called twice with identical arguments returns deeply equal payloads; the returned `assessedAt` equals the date passed in, **not** today's date; a payload for a known EU-above-threshold answer set carries `containsDraftContent: true` (all 16 requirements are draft today); `grep -nE "new Date|Date\.now|performance\.now" frontend/web/lib/checkResponse.ts` returns nothing.

**A live finding from Task 1's execution, carried forward.** The route's date is `new Date().toISOString().slice(0, 10)` — **UTC**, not local. During Task 1 the teeth check ran just after local midnight and produced `2026-08-20` while the machine's local date was already `2026-08-21`. Two customers answering identically minutes apart can therefore receive different `assessedAt` values, and a golden keyed to the ambient date would flake once a day. Task 2 is safe because `buildCheckResponse` takes the date as an argument and the golden pins a literal. The behaviour is **pre-existing and was preserved verbatim**, as this task required; it now sits in exactly one line of the route where a later task can address it deliberately. It is not Task 1's to fix.

**A pre-existing route bug, found and correctly left alone.** `answersSchema` types `reportedFy2024` and `parentReport` as `z.string().max(16)` while the two adjacent fields use `z.enum`. `checker.ts` only produces a fact for exactly `'yes'` or `'no'`, so any other value — including the `'unknown'` the UI offers — is accepted and silently contributes nothing. Arguably intended, but the looseness is inconsistent with its neighbours. **Do not fix it before Task 2 records the golden**, since it sits inside the payload path. Revisit once the golden exists and the change is fenced.

**Teeth check.** Change `buildCheckResponse` to compute its own date instead of using the parameter. The `assessedAt` test must fail. Revert and confirm green. A test asserting only "two calls agree" would pass against that implementation, which is why the fixed-date assertion is the one that carries the property.

- [ ] **Step 1: Add vitest to `frontend/web` and wire root `npm test`** to run both workspaces; confirm an empty suite runs
- [ ] **Step 2: Write the failing tests** for all four required cases
- [ ] **Step 3: Run them; confirm they fail for the right reason**
- [ ] **Step 4: Extract `buildCheckResponse`** by moving the route's body verbatim, changing only the date source
- [ ] **Step 5: Reduce the route to a wrapper** and confirm `npm run typecheck` passes across both workspaces
- [ ] **Step 6: Perform the teeth check**; record both outputs
- [ ] **Step 7: `npm test && npm run typecheck`**, then hand over the commit command

---

### Task 2: Record both goldens before anything moves

Spec §7.1. **Before any migration code changes**, record two levels from the current implementation. The second catches frontend behaviour the first cannot see.

**Files:**
- Create: `backend/engine/test/golden/migration-engine-golden.json`
- Create: `backend/engine/test/migration-golden.test.ts`
- Create: `frontend/web/test/golden/migration-public-golden.json`
- Create: `frontend/web/test/migration-public-golden.test.ts`

**Interfaces:**
- Consumes: `buildCheckResponse` (Task 1); `assess`, `ProfileBuilder`, `ctx`, `csrdPack` (existing test helpers).

**Required behaviours:**

1. **One fixed profile, one fixed assessment date, one fixed financial year**, all literals in the test. Reuse `ProfileBuilder` and `ctx` from `test/helpers.ts`; `ctx` already pins `assessmentDate: '2026-07-26'`. Choose a profile that exercises a wide slice — an EU entity above both thresholds, so determinations, obligations, gaps and next questions are all non-empty. A golden over an empty result proves nothing.
2. **The engine golden covers the whole `AssessmentResult`**: determinations, obligations, gaps, next questions, summary and `containsDraftContent`. Serialise with the existing `canonicalJson` from `src/verification/canonical.ts` so object key order cannot churn the artifact while array order — which is meaning — is preserved.
3. **The public golden is `buildCheckResponse`'s payload** for a fixed answer set and the same fixed date.
4. **Neither golden may be regenerated by a later task.** Spec §7.1: *"a migration that rewrites its own expected output proves nothing."* If a regeneration script exists at all it lives outside `test/`, is never invoked by `npm test`, and says so in its own header. The comparison tests read the committed artifact and compare; they never write.
5. **Record what each golden is for, in the test file's JSDoc**, including the sentence that the artifact is updated only by an explicit reviewed change. The next person to see a red golden must not reach for regeneration as the fix.

**Required test cases:** the engine golden matches the recorded artifact exactly; the public golden matches its recorded artifact exactly; both artifacts are non-trivial — assert the engine golden has at least one determination, one obligation and one next question, so an accidentally-empty capture cannot pass as agreement.

**Teeth check — and the obvious version of it proves nothing. Corrected after Task 2's execution found this.**

The intuitive check is: change a threshold in `knowledge/csrd/requirements.json` and confirm both goldens fail. They do fail. **But they never compare anything.** `requirementSha256` covers the whole authored record, so editing any `cmp` amount trips version integrity at `loadPack`, and *every test that loads the pack* dies with `VersionIntegrityError` before a single golden field is read — including tests that have nothing to do with goldens. Verified: the naive mutation reddens Task 1's four check-response tests too, for exactly this reason. "Both goldens fail" is satisfied literally while telling you nothing about either golden.

So run it in two stages and treat only the second as evidence:

- **Stage A** — mutate the threshold. Both goldens fail with `VersionIntegrityError`. This confirms the registry works; it says nothing about the goldens.
- **Stage B** — bump that requirement to `version: 2` and register the resulting hash so the mutated pack loads. **Now** both goldens must fail on *content*, with real diffs. Confirm the engine diff shows determinations moving, and that the public diff shows frontend-only fields moving — `reasonCopy`, `counts`, `headline` — which the engine golden cannot see. That divergence is the proof that the two levels watch different things.

Revert both the mutation and the registry entry from copies taken first, and confirm fully green.

**On reverting:** use `cp` from your own copy. `git checkout` is *safe* here — `requirements.json` is committed and clean against HEAD, and HEAD carries all 16 `version` fields. An earlier draft of this plan warned it would drop them; that warning was true only while B1b-ii-a was uncommitted and is now stale. `cp` remains the better habit because it does not depend on what happens to be committed at the time.

- [ ] **Step 1: Write the capture and comparison tests**, with the artifacts absent so they fail
- [ ] **Step 2: Run them; confirm they fail because the artifact is missing**, not for a fixture error
- [ ] **Step 3: Generate both artifacts once**, print them, and read them — confirm the determinations, obligations and questions look like the profile you described
- [ ] **Step 4: Re-run; both green**
- [ ] **Step 5: Perform the teeth check**; record the failing output of both goldens and the green output after revert
- [ ] **Step 6: `npm test && npm run typecheck`**, then hand over the commit command

---

### Task 3: The promotion ledger and the frozen signature candidate

Spec §5 and §5.1. This is the task where the design's most important correction lives.

**Files:**
- Create: `backend/engine/src/verification/promotions.ts`
- Create: `backend/engine/src/verification/sign.ts`
- Create: `backend/engine/test/verification-promotions.test.ts`
- Create: `backend/engine/test/verification-sign.test.ts`

**Interfaces:**
- Consumes: `SigningEntry`, `entryId` (ledger); `VerificationResult`, `resultSha256` (result); `StalenessReason` (staleness); `requirementSha256`, `requirementInputSha256`, `conditionSha256` (canonical); `checkEvidenceSet` (corpus/evidence).
- Produces:
  - `parsePromotions(text: string): PromotionRecord[]` and `isPromoted(records: PromotionRecord[], pipelineVersion: string): boolean`
  - `type RefusalCode = 'mismatch' | 'open_question' | 'evidence_failed' | 'unresolved_gap' | 'invalid_result' | 'candidate_inconsistent' | 'integrity_failure' | 'red_suite' | 'unpromoted_pipeline'`
  - `interface SignatureCandidate { entry: SigningEntry; advisories: StalenessReason[] }` — `entry` carries its own `entryId`, already computed
  - `buildSignature(input: SignatureInput): SignatureCandidate` — pure; one frozen derivation
  - `assertSignable(candidate: SignatureCandidate, checks: SignabilityInput): void` — throws `RefusalError { refusals: Array<{ code: RefusalCode; detail: string }> }`

**Required behaviours:**

1. **One frozen derivation.** `buildSignature` receives already-read values — pack, corpus closure, result, rendered condition, promotions — and returns an immutable candidate. Every precondition runs against **that object**, and the line the CLI appends is **that object** serialised. There is no window between checking and writing because the checked values and the written values are the same values. `buildSignature` reads nothing itself; the CLI (Task 4) does the reading, once.
2. **The gate is candidate consistency, not existing staleness.** This is the correction that matters most in the design. Candidate consistency compares the *result's* pinned inputs against *current* state: `requirementInputSha256`, `conditionSha256`, `renderedConditionSha256`, `corpusClosureSha256`, and each pinned document's `sha256Normalized`. Any difference is **blocking**.
3. **Existing-signature staleness never blocks a signing.** Staleness belongs to the existing governing entry, and **signing is how a stale status is repaired**. If `CSRD-S-001` reads `stale_encoding` today because its condition was corrected, that is precisely why a fresh verification exists and wants signing. Refusing on it inverts the mechanism and makes recovery impossible exactly when it is required. Existing staleness is displayed and never blocking.
4. **A pinned `sha256Raw` differing while `sha256Normalized` matches is advisory**, not blocking — the same raw-versus-normalized logic as §4.3, since the words did not move. It lands in `candidate.advisories`.
5. **The refusal set, verbatim from spec §4.5 as corrected:** any `MISMATCH` verdict; outstanding `OPEN_QUESTION` items; a failing evidence check including a failing `absence` re-search; an unresolved `corpus_gap` or `closure_gap`; an invalid result schema; **candidate inconsistency**; an integrity failure; a red test suite; a `pipelineVersion` with no promotion record. `assertSignable` reports **every** refusal, not the first — a signer fixing one thing at a time learns the next problem only after re-running, and refusal is the feature.
6. **Integrity failures are a separate category from refusals in origin but are surfaced here.** A missing pinned result file or a document pinned by an existing entry but absent from the current corpus is an `INTEGRITY_FAILURE` per §4.4, carrying its own exit code — **this is B1b-ii-a's handed-forward obligation and Task 3 is where it lands.** `CurrentState.resultSha256` is non-nullable precisely so this case cannot masquerade as staleness.
7. **The registry keys versions as strings.** `requirementVersion` is a `number` on the requirement, the result and the ledger entry; `verification/requirement-versions/<packId>.json` keys by string. The lookup needs a deliberate `String(version)` — B1b-ii-a's handed-forward obligation. Write a test that signs a requirement at `version: 2` and confirm the registry lookup resolves, so an implementation indexing by number fails rather than reporting a missing registration.
8. **`promotions.jsonl` parsing follows the ledger's framing rules** — one JSON object per line, at most one trailing empty segment discarded, internal blank and whitespace-only lines are integrity failures, physical 1-based line numbers, no `.filter(Boolean)`. Reuse the discipline `ledger.ts` established rather than inventing a second, laxer reader for the same file format.

**`conditionSha256` is underspecified for `selection` requirements, and one live requirement is affected. Found at Task 3.** The ledger types `conditionSha256` as non-optional and factory §4.2 defines it as the canonicalised condition subtree — but a `selection` requirement has no top-level `condition`; its logic lives in ordered `cases[]`. **`CSRD-S-012` is exactly that shape, and is the only one of the sixteen without a `condition` key** (verified). Under a literal reading it could never be signed.

Resolved by exporting `candidateConditionSha256(requirement)`, which falls back to `logicalPayloadSha256` for the selection case. Exported and documented rather than buried, because **the result producer (B2) and the entry builder must agree on which hash this field holds** — two callers guessing differently would produce a permanent, silent candidate inconsistency for every selection requirement in the pack. Carry this to B2, and to factory §4.2 when it is next touched.

**A scope boundary, stated.** `verification/pipeline/<version>.json` and the benchmark metrics inside a promotion record belong to **B3**, not here. This task builds the *gate* — sign refuses a `pipelineVersion` with no promotion record — and the minimal reader that answers it. A promotion record here needs only `pipelineVersion`, `by` and `on`; B3 adds the metrics that justify it. Building the gate now is what stops B1b-ii-b shipping a sign CLI with a known-missing refusal.

**Required test cases:** each of the nine refusals fires individually and names itself; two simultaneous refusals are both reported; a clean candidate passes; candidate inconsistency fires for each of the five compared hashes independently; a differing `sha256Raw` with matching `sha256Normalized` does **not** refuse and appears in `advisories`; a `pipelineVersion` absent from promotions refuses; a missing pinned result raises `INTEGRITY_FAILURE` rather than a refusal; the `version: 2` registry lookup resolves.

**Teeth check, and it is the most important one in this plan.** Construct a requirement whose **existing governing entry is stale** — `stale_encoding`, say — and whose **candidate is consistent**. `assertSignable` must **pass**. Then temporarily add existing-staleness to the refusal set and confirm that test fails. This is the exact defect the design corrected in place, and a suite that does not have this test would accept the inverted implementation without complaint. Record both outputs.

- [ ] **Step 1: Write the failing tests**, including the stale-existing-signature case
- [ ] **Step 2: Run them; confirm they fail for the right reason**
- [ ] **Step 3: Implement `promotions.ts`**, reusing `ledger.ts`'s framing discipline
- [ ] **Step 4: Implement `sign.ts`**
- [ ] **Step 5: Perform the teeth check**; record both outputs
- [ ] **Step 6: `npm test && npm run typecheck`**, then hand over the commit command

---

### Task 4: The append, verification after write, and revoke

Spec §5. The freeze closes the check-then-recompute gap; the post-write read catches the world moving underneath the whole operation, which the freeze cannot.

**Files:**
- Create: `backend/engine/src/cli/sign.ts`
- Create: `backend/engine/src/cli/revoke.ts`
- Create: `backend/engine/test/cli-sign.test.ts`
- Modify: `backend/engine/package.json` (a `verify` script)
- Modify: `backend/engine/src/verification/staleness.ts` (narrow `normalizer_changed`)

**Interfaces:**
- Consumes: everything from Task 3; `parseLedger`, `governingEntry`, `verifyLedgerIntegrity` (ledger); `deriveStaleness`, `deriveStatus`.
- Produces: `npm run verify -- sign <packId> <requirementId> --by "<name>"` and `npm run verify -- revoke <packId> <requirementId> --revokes <entryId> --by "<name>" --reason "<text>"`.

**Required behaviours:**

1. **Verify after write, variant-aware.** Re-read the ledger **from disk** and assert, together:

   ```
   verified | ratified:
     governing.entryId === candidate.entryId
     AND staleness(governing) is empty
     AND derivedStatus === candidate.kind

   revoked:
     governing.entryId === candidate.entryId
     AND derivedStatus === 'draft'
     AND statusReasons contains 'revoked'
   ```

   A revocation has no freshness to assert and must not be measured against a status it never claims.
2. **Asserting `governing.entryId === candidate.entryId` is the load-bearing half.** Confirming freshness alone is not enough: another signing event could become governing between the append and the check — today only through operator error, later through genuine concurrency — and a check asking only *"is the governing entry fresh?"* would report success for **someone else's entry**. Asserting the governing entry **is the one just written** is what makes the report about this operation.
3. **Revocation refuses on an unreadable ledger, and says why.** A tampered `entryId` makes the whole ledger unreadable, so `revoke` cannot operate on it — B1b-ii-a's handed-forward obligation. This is correct: spec §3 guarantees a revocation carries no *verification pins*, so withdrawal does not depend on a recomputable corpus or an intact result file; it is **not** a guarantee that a compromised ledger stays writable. Surface it as **forensics required**, distinct from an ordinary refusal, with its own exit code and a message saying the history itself is in question.
4. **Narrow `normalizer_changed`** — B1b-ii-a's handed-forward obligation, and the one with a live cost. As shipped, any `normalizerVersion` difference yields `normalizer_changed`, which **blocks every signature in the pack on every normalizer bump** — precisely the alarm-fatigue failure the raw-versus-normalized split exists to prevent. Factory §4.3 defines the state as the *outcome of renormalising*: renormalise the retained raw bytes under the current normalizer and compare; **identical means still fresh**. `deriveStaleness` is pure and cannot do this, so the resolution belongs to the CLI layer, which has the bytes. Keep `deriveStaleness`'s detection intact and **resolve** its result before display and before the post-write assertion.
5. **Raise the structural-result case before `buildSignature`, and map it to the same exit code. Found at Task 3.** The `invalid_result` refusal is only partly reachable through the natural path: `buildSignature` calls `resultSha256`, which runs `verificationResultSchema.parse`, so a **structurally** invalid result throws before a candidate exists and `assertSignable` never sees it. Only cross-field inconsistency reaches the gate — deliberately, since `resultSha256` does not re-run `assertResultConsistency`, which is what lets `stale_result` hash a record that has drifted. So the CLI must validate structurally **first** and report it as `invalid_result` rather than letting a raw `ZodError` escape. `assertSignable` re-validates anyway, so a caller handing it a cast object is still caught; this is about the CLI's own seam.

6. **Classify the promotion record in the field-accounting guard. Found at Task 3.** `promotionRecordSchema` entered the system in Task 3 carrying three fields that `RECORD_SCHEMAS` does not walk, so none has a role — precisely the class §6 exists to close, reproduced by the task that added the schema. Add it to the guard's schema map under `promotion.*` and classify each field. `pipelineVersion` is `signability` at minimum, since signing refuses without a matching record. Task 3 correctly left `accounting.ts` alone because it was not in its file list; it is in yours.

7. **Exit codes are distinct and documented**: success; refusal; integrity failure; forensics-required. A caller scripting the CLI must be able to tell "you may not sign this yet" from "this repository is damaged".
8. **The CLI does all reading and writing.** `src/verification/` stays pure. The append is a single `appendFileSync` of one line plus `\n`, matching the framing `parseLedger` requires.

**`renderedConditionSha256` carries the same hazard as `conditionSha256`, twice over. Found at Task 4.** Task 3 exported `candidateConditionSha256` because `selection` requirements have no top-level condition. The field beside it is worse: `renderCondition` cannot be called on `CSRD-S-012` at all, **and** even for a boolean requirement `renderCondition` and `renderRequirement` produce different text from the same input. **Three** parties must agree on this value — B2's result producer, the entry builder, and Task 5's review sheet — and disagreement surfaces as a permanent, silent candidate inconsistency rather than an error anyone can read. Resolved as `candidateRenderedConditionSha256` using `renderRequirement`, since factory §4.2 defines the field as "the exact English prosecutors and the reviewer read". **Carry to B2 and to factory §4.2 alongside Task 3's note.**

**A fifth exit code, deliberately outside the documented four. Found at Task 4.** A usage error — unknown subcommand, missing `--by`, a requirement the pack does not carry — is a fact about the invocation, not the repository. Folding it into refusal would let a typo read as "you may not sign this yet", which a script might then try to work around. Uses `64` (sysexits `EX_USAGE`), leaving the plan's documented four exactly as specified.

**`testSuiteGreen` cannot be computed by `runSign`. Found at Task 4.** The gate refuses a red suite and running the suite is nominally the CLI's job — but a `runSign` that shells out to `npm test` cannot be called from inside `npm test`, which is where every test of it runs. The dispatcher runs the suite and passes the boolean; the escape hatch is named `--skip-suite` so it cannot be mistaken for a convenience.

**Two notes carried from Task 3.** Factory §4.5's four-field "signable summary" (`overallOutcome`, `mismatches`, `allEvidenceValid`) names **no field the result schema has**, and none should be added: a result declaring its own signability would be the same defect `openQuestions[]` avoided by carrying no `blocking` flag. All three are derived from `challenges[]`, `openQuestions[]`, `gaps[]` and `checkEvidenceSet` instead. Separately, `src/verification/` stays pure across `assertSignable` **only because `LoadedCorpus` is eager** — its accessors read preloaded maps, not disk. A future lazy `LoadedCorpus` would silently reintroduce filesystem access into a module the constraints say has none.

**Required test cases:** a clean sign appends and verifies; the post-write check fails when a **different** entry becomes governing between append and check — simulate by appending a second entry inside the test before verification runs; a revocation verifies against the revoked triple and not the signing one; a revocation of a non-existent target is rejected at load; an unreadable ledger yields forensics-required rather than a refusal; each exit code is produced by its own case; a `normalizer_changed` whose renormalised text is identical resolves to fresh; one whose renormalised text differs stays blocking.

**Teeth check, two of them.** First: make the post-write check assert only that the governing entry is fresh, dropping the `entryId` comparison. The concurrent-append test must fail — if it passes, the test is not exercising the race and needs rebuilding. Second: revert the `normalizer_changed` narrowing and confirm the identical-renormalisation test fails. Record both outputs.

- [ ] **Step 1: Write the failing tests**, including the concurrent-append race
- [ ] **Step 2: Run them; confirm they fail for the right reason**
- [ ] **Step 3: Implement the sign CLI** with verify-after-write
- [ ] **Step 4: Implement the revoke CLI**
- [ ] **Step 5: Narrow `normalizer_changed` at the CLI layer**
- [ ] **Step 6: Perform both teeth checks**; record all outputs
- [ ] **Step 7: `npm test && npm run typecheck`**, then hand over the commit command

---

**A lesson from Task 4's review that applies to every remaining task.** Task 4's three post-write conjuncts **mask one another**, and a suite meeting this plan's stated test list would not have noticed. Through the normal path every *blocking* staleness reason also flips `derivedStatus` to `draft`, so the freshness conjunct and the status conjunct each fully cover the other — mutating either away left the suite green. Worse, `derivedStatus === kind` is **unreachable** through `runSign` at all, since the entry just written carries the kind being claimed, and the revoked triple is a tautology because `deriveStatus` answers `draft` plus `revoked` for every revocation.

Closed by calling the exported `verifyAfterWrite` **directly** with states the normal path cannot produce: an advisory-only `source_reissued` (non-blocking staleness with status still `verified`, isolating freshness); a `verified` entry checked against a `ratified` expectation (isolating status); a signature checked against a `revoked` expectation; and a governing revocation checked both ways (isolating variant-awareness).

**The generalisation: a conjunction tested only through its natural caller may have conjuncts that cannot fail.** Coverage says the line ran; it does not say the line decided anything. Where a task asserts several conditions together, test the predicate directly with inputs the caller cannot generate.

### Task 5: The review sheet

Factory spec §4.6. The reviewer never opens JSON.

**Files:**
- Create: `backend/engine/src/cli/review-sheet.ts`
- Create: `backend/engine/test/cli-review-sheet.test.ts`
- Modify: `backend/engine/.gitignore` (the generated output)

**Interfaces:**
- Consumes: the ledger, staleness, status, result and render modules.
- Produces: `npm run verify -- sheet`, writing git-ignored HTML.

**Required behaviours:**

1. **Portfolio header:** counts by derived status and by staleness reason.
2. **Per requirement:** derived status and its staleness reasons; the English condition from `render.ts`; the bidirectional coverage table; challenges with adjudicated verdicts; evidence linked into the corpus; open questions; facts consumed and the questions that collect them; obligations that fire; **golden profiles exercising the rule, or an explicit warning that none do**; and the sign-off block.
3. **Say what is absent rather than omitting it.** A requirement with no signature, no result file, or no golden profile gets a stated *"none"* — an omitted section reads as a section that passed. This is the same discipline `absence` evidence follows: the claim must be visible to be checkable.
4. **Benchmark metrics are B3's and must be labelled, not faked.** The sheet resolves the `pipelineVersion` bound to each requirement's signature through its promotion record. Until B3 exists, a promotion record carries no metrics, and the sheet must print *"no benchmark metrics — pipeline promotion records carry none until B3"* rather than leaving the block out. The factory spec's rule that the live run is **"labelled as governing nothing until promoted"** applies from day one.
5. **The same rendered English the prosecutors argued against.** The sheet must call `render.ts`, never re-derive its own phrasing, so the reviewer and the pipeline are looking at identical text. That identity is what makes the rendered hash worth pinning into a signature.
6. **Output is git-ignored** and the generator never writes into `test/` or `verification/`. **Enforce that second half rather than stating it** — Task 5 made an out-path inside those trees a usage error, on the grounds that a property nothing checks is a comment.
7. **A signature whose pinned result has vanished has no derivable status, and the sheet must not invent one.** `CurrentState.resultSha256` is non-nullable, so staleness cannot be computed at all in that case. Rather than print `verified` over a dossier nobody can find, report §4.4's integrity failure and carry a fourth header bucket, *"not derivable (integrity failure)"*. Added at Task 5; the plan had not covered it.

**A content finding, surfaced by the sheet and confirmed independently: `CSRD-S-012` has no entitled evidence surface at all.** Its `sources[]` (`SRC-005`, `SRC-006`, `SRC-007`) resolve to **zero** corpus documents — the only one of the sixteen for which that is true. Nobody could have read the law behind it, and **no quote evidence can ever be produced for it**, because there is nothing to quote. This is a `corpus_gap` that quoting cannot reveal, which is why the sheet prints the entitled closure as its own block rather than leaving it implicit.

Combined with Task 3's finding — `CSRD-S-012` is also the only `selection` requirement with no top-level `condition` — **this one requirement cannot currently be verified or signed end to end.** That is a content and corpus-ingest backlog item, not a code defect, and neither plan should paper over it. Record it for B2.

**Where the `normalizer_changed` narrowing actually pays off — carried from Task 4.** Task 4 found its own post-write use of the narrowing is **vacuous today**: a freshly written candidate takes its corpus pins from the *current* corpus, so pinned and current `normalizerVersion` always agree and the reason can never fire there. The live cost is entirely in **displayed existing staleness** — which is this sheet. A sheet showing raw `normalizer_changed` for every requirement after a normalizer bump, on a day when no law moved, is the alarm-fatigue failure in its most visible form. Resolve before display.

**Required test cases:** a requirement with no ledger entry renders `draft` with an explicit no-signature note; a revoked requirement shows `revoked`; a requirement with blocking staleness shows every reason, not one; a requirement with no golden profile carries the stated warning; the rendered condition in the sheet equals **`renderRequirement()`**'s output — **corrected at Task 5's review; this line originally said `renderCondition()` and was wrong.** `renderCondition` cannot be called on `CSRD-S-012` at all, and it produces different text from `renderRequirement` even for a boolean requirement. The sheet must agree with `candidateRenderedConditionSha256`, or the reviewer reads different English from the text the signature pins. Assert by comparing the hash of the sheet's own rendered block against the hash it prints beside it, not by eye; the benchmark block prints the not-yet-available text.

**Teeth check.** Give a requirement two staleness reasons and confirm the sheet shows both. An implementation printing `reasons[0]` passes a one-reason test and fails this one — and "shows why" collapsing to "shows one why" is exactly how a reviewer forms a wrong picture while every test stays green.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail for the right reason**
- [ ] **Step 3: Implement the sheet**
- [ ] **Step 4: Generate it against the real pack and read it** — confirm a human could review from it without opening JSON
- [ ] **Step 5: Perform the teeth check**; record both outputs
- [ ] **Step 6: `npm test && npm run typecheck`**, then hand over the commit command

---

### Task 6: The migration — `minStatus`, derived status, and the death of asserted `ratification`

Spec §7.2, §7.3 and §7.4. **This is the first change in the project that alters what a customer-facing surface reads.** Everything before it was additive.

It is one task because the compiler makes it one: deleting `Requirement.ratification` breaks all seven consumers simultaneously, and a tree that does not typecheck cannot be split into reviewable halves.

**Files:** (the fixture-carrying test files are **nine**, not six as an earlier draft said: `condition`, `knowledge-integrity`, `verification-canonical` at two sites, `-features`, `-mutation`, `-registry`, `-render`, `-sign`, `-vocabulary`.)
- Modify: `backend/engine/src/types.ts` — delete `Ratification`; `Determination.ratificationStatus` becomes `derivedStatus: DerivedStatus` plus `statusReasons: StatusReason[]`
- Modify: `backend/engine/src/knowledge/schema.ts` — delete the `ratification` field; an asserted status becomes a **load error**
- Modify: `backend/engine/src/knowledge/loader.ts` — attach `derivedStatus` and `statusReasons` from the ledger
- Modify: `backend/engine/src/engine/evaluate.ts` — `includeDraft` becomes `minStatus`; the determination stamp; `containsDraftContent`
- Modify: `backend/engine/knowledge/csrd/requirements.json` — delete `ratification` from all 16
- Modify: `frontend/web/lib/pack.ts` — count by `derivedStatus`
- Modify: `backend/engine/test/knowledge-integrity.test.ts` and the six fixture-carrying test files
- Test: `backend/engine/test/min-status.test.ts`

**Interfaces:**
- Produces: `type MinStatus = 'draft' | 'verified' | 'ratified'`; `AssessOptions.minStatus?: MinStatus`.

**Required behaviours:**

1. **The invariant, and it is a hard acceptance test rather than a cleanup step.** With an empty ledger:

   ```
   16 requirements       -> all derivedStatus = draft
   minStatus = draft     -> all 16 evaluated
   containsDraftContent  -> true
   ```

2. **`minStatus` defaults to `'draft'`** so current behaviour is bit-identical. A boolean cannot express a three-way choice, and leaving it would force a wrong guess about where `verified` sits. `minStatus: 'verified'` yields verified plus ratified; `minStatus: 'ratified'` yields ratified only. One test per level.
3. **The public checker is NOT moved to `minStatus: 'verified'`.** That is a later product decision about what the site should claim, and bundling it here would hide a product change inside an infrastructure one. Note the existing `includeDraft` was inert — it defaults to `true` and **no caller anywhere passes it** — so this migration must not quietly activate a filter that has never run.
4. **The public golden holds to exact observable equality.** The rendered checker payload for the fixed profile is byte-identical before and after. Nothing about the customer-visible surface is intended to change, so nothing may.
5. **The engine golden holds to exact equality on every unchanged field, plus one named transformation**, written out in the test and not derived:

   ```
   ratificationStatus: 'draft'   ->   derivedStatus: 'draft', statusReasons: []
   ```

   **The adapter must not grow.** Anything it needs to normalise beyond that single mapping is an unintended behaviour change, and the correct response is to investigate rather than to widen the adapter. Demanding literal identity of the engine golden would be asking for a contradiction, and an implementer facing a contradiction is liable to resolve it by keeping a compatibility alias — which would defeat the compile-time migration this design chose precisely so that every consumer is visited.
6. **An asserted status left in `requirements.json` is a load error, not an ignored field — and this costs code.** `requirementSchema` is not `.strict()`; it **strips** unknown keys, which is exactly what keeps loader-added fields out of `requirementSha256`. So once the field leaves the schema, a leftover `ratification` in the JSON does not fail — it silently vanishes.

   **Verified against the current tree**, by dropping `ratification` from the live schema and hashing `CSRD-S-001` both with the field still in the data and without it:

   ```
   before                        c687f4c6cc56ab3699da6a86...
   after schema drop             0308f0850cd13429ac94f776...
   after schema drop + data gone 0308f0850cd13429ac94f776...   <- identical
   ```

   **Two corrections from Task 6's execution.** `0308f085…` is the **version-1** hash — the probe held `version: 1` constant. Because `version` is itself authored content, the hash actually registered for `CSRD-S-001` at version 2 is `fb5820d2…`. An implementer comparing against `0308f085…` would think something had gone wrong.

   And the masking warning attached to teeth check 1 below is **inverted for this case**. A leftover `ratification` does *not* trip version integrity first: it is stripped before hashing, so the hash matches the registered one and the load passes. Confirmed at Task 6 — with a leftover in place `requirementSha256` was byte-identical to the registered version-2 hash. **The explicit `verifyIntegrity` check is the only thing standing between a leftover and total silence**, which strengthens behaviour 6 rather than weakening it.

   The last two agreeing is the finding: leftover data is invisible to the hash, so nothing detects it on its own. Add an explicit check in `verifyIntegrity` naming any requirement that still carries a `ratification` key. Without it the spec's guarantee in §7.4 is simply false.

   An ordering hint falls out of the same probe: deleting the field from `requirements.json` **before** removing it from the schema fails loudly, because zod still requires it. Removing it from the schema first fails silently. Do the JSON last.
7. **Deleting `ratification` changes `requirementSha256` for all 16 requirements** — the first two hashes above, differing, are that claim verified rather than assumed. The hash covers the whole authored record, so the version-integrity registry **will** fail the load. That is the registry working exactly as designed, not a fault to route around. Bump every requirement to `version: 2` and register the new hashes; **do not** rewrite the version-1 entries, which `registerVersion` refuses anyway. The registry retains both, so version 1 keeps its permanent meaning: the content that existed when `ratification` was asserted.
8. **No `ratified` content.** The status exists and is reserved; nothing sets it. No change to what the public checker *claims* — only to how status is derived.

**Required test cases:** the three-line invariant above, asserted exactly; one test per `minStatus` level; a `requirements.json` still carrying `ratification` fails the load naming the requirement; both goldens pass with the named adapter applied to the engine one and nothing applied to the public one; the adapter is exercised — assert it actually transforms, so an implementation that made the change unnecessary is visible rather than silently vacuous; version integrity passes at `version: 2` and the registry still holds every version-1 hash.

**Teeth check, three of them, and the second is the one this whole plan is built around.**

First: leave `ratification` on one requirement in `requirements.json` and confirm the load fails **naming that requirement and that field**. Beware the same masking Task 2 found: by this point every requirement has been bumped to `version: 2` and re-registered, so a leftover `ratification` changes that requirement's hash and trips `VersionIntegrityError` *first* — which would let you record a pass while the `verifyIntegrity` check you are actually testing is broken or absent. Either register the leftover-carrying content's hash so the pack loads and the intended check is what fires, or test `verifyIntegrity` directly against a constructed pack object, bypassing the registry gate. **Assert on the message text**, not merely that it threw. Revert.

Second: **change something a customer would see** — alter a `REASON_COPY` string in `frontend/web/lib/checker.ts` — and confirm the **public golden fails**. This is the net. If it does not fail, the public golden is not watching the surface it claims to watch, and Task 6 must stop until it does. Revert.

Third: widen the engine adapter to normalise a second field and confirm a reviewer would see it — the adapter is written out in the test, so this is a readability check rather than an assertion, but perform it and record what the diff looked like, because "the adapter must not grow" is only enforceable if growth is visible.

**A note on teeth check 3 from execution:** the widened adapter **still passed**, because `evaluatedAt` already held the value the widened adapter wrote. An adapter normalising a field the migration did not move is vacuous *and invisible to the suite* — which is precisely why this is a readability check, and why the adapter is written out in the test rather than derived. Growth is caught by a reader, not by a run.

Record all outputs. Restore every mutation from a copy taken first. (`git checkout` on `requirements.json` is safe now that B1b-ii-a is committed — an earlier draft warned otherwise and that warning is stale — but `cp` does not depend on the commit state, so prefer it.)

- [ ] **Step 1: Write the failing tests** — the invariant, the three `minStatus` levels, the load error
- [ ] **Step 2: Run them; confirm they fail for the right reason**
- [ ] **Step 3: Delete `ratification`** from the type, the schema and all 16 requirements; add the `verifyIntegrity` leftover check
- [ ] **Step 4: Attach `derivedStatus` and `statusReasons` in the loader** from the ledger, with an absent ledger yielding `draft` and `[]`
- [ ] **Step 5: Replace `includeDraft` with `minStatus`** and update the determination stamp and `containsDraftContent`
- [ ] **Step 6: Follow the compiler** to every remaining consumer, including `frontend/web/lib/pack.ts`
- [ ] **Step 7: Bump all 16 to `version: 2`** and register the new hashes; confirm version 1 is retained
- [ ] **Step 8: Apply the named adapter to the engine golden**; confirm the public golden needs none
- [ ] **Step 9: Perform all three teeth checks**; record every output
- [ ] **Step 10: `npm test && npm run typecheck`**, then hand over the commit command

---

## Handed to B2 — a blocking prerequisite, not a nicety

**The loader over-claims a signed-but-stale requirement as `verified`.** Found at Task 6's review and confirmed directly.

`loadPack` calls `deriveStatus(governing, [])` — an **empty** staleness set — because it has no corpus, no rendered condition and no pinned result to compute one from. The consequence:

```
deriveStatus(signed, [])              ->  { derivedStatus: 'verified', statusReasons: [] }
deriveStatus(signed, ['stale_result'])->  { derivedStatus: 'draft',    statusReasons: ['stale_result'] }
```

So once anything is signed, a signature that has since gone stale reads **`verified`** through the loader, and that propagates to three places: the `minStatus` filter in `evaluate.ts`, `containsDraftContent` (the prototype banner), and the public site's counts in `frontend/web/lib/pack.ts`.

**It is unreachable today** — the ledger is empty, every requirement derives to `draft`, and the migration invariant holds. It goes live the moment B2 signs anything.

The alternatives were each worse at this layer, which is why it was recorded rather than fixed: pulling the corpus, the renderer and every pinned result into `loadPack` puts verification I/O on every page load and couples the loader to the whole verification surface; and answering with a partial staleness set would be a different, quieter lie. The honest summary is Task 6's own: **a surface that must not over-claim needs the review sheet, not the pack.**

**Three ways B2 could close it**, for whoever picks this up:

1. **Fail safe** — a governing signature whose freshness cannot be established reports `draft`. Never over-claims, and matches the conservative direction B1b-ii-a already took with `normalizer_changed`. Cost: the site keeps reading `draft` after signing until a caller supplies real staleness.
2. **Resolve at the caller** — `loadPack` grows an optional staleness resolver; the sheet and the sign CLI pass a real one, page loads pass none and get the conservative answer.
3. **Compute in the loader** — most correct, largest change, and the one that makes every page load pay for corpus I/O.

**Do not let B2 sign anything before this is decided.** The whole point of deriving status was that a requirement stops reading `draft` only when a person signs it *and that signature still holds*; the second half is currently unenforced at this surface.

---

## Self-review

**Spec coverage.** §5's frozen derivation and verify-after-write are Tasks 3 and 4; §5.1's candidate-consistency correction is Task 3's behaviour 3 and its teeth check. §4.5's nine refusals are Task 3's behaviour 5. §4.6's review sheet is Task 5. §7.1's capture-first requirement is Task 2, with Task 1 as its prerequisite. §7.2's two golden contracts and the named adapter are Task 6's behaviours 4 and 5. §7.3's `minStatus` is Task 6's behaviour 2, including the instruction *not* to move the public checker to `verified`. §7.4's consumer changes and the load error are Task 6's behaviours 6 and 8. §8's ordering — CLIs before migration — is preserved, with the goldens moved ahead of both.

**All four B1b-ii-a obligations are assigned:** `normalizer_changed` narrowing and the forensics-required revoke path to Task 4; `INTEGRITY_FAILURE` raising and the `String(version)` registry lookup to Task 3.

**Deferred to B3, correctly.** `verification/pipeline/<version>.json`, the benchmark suite, and the metrics inside a promotion record. Task 3 builds the promotion *gate* and the minimal reader so the sign CLI does not ship with a missing refusal; Task 5 labels the metrics as unavailable rather than omitting the block.

**Type consistency checked.** `MinStatus` (Task 6) is a distinct type from `DerivedStatus` (B1b-ii-a) although they share members — one is a filter floor, the other a state. `SignatureCandidate.entry` is a `SigningEntry` carrying its own `entryId`, so Task 4 appends `candidate.entry` and compares `candidate.entry.entryId` against the re-read governing entry. `RefusalCode` is defined in Task 3 and consumed unchanged by Task 4's exit-code mapping. `CheckResponse` is defined in Task 1 and consumed by Task 2's golden.

**Known scope edge, stated.** Task 6 bumps every requirement to `version: 2` because deleting `ratification` moves `requirementSha256`. That is the registry working as designed, but it means the first real exercise of the version-bump workflow happens during the riskiest task in the plan. An implementer who mistakes it for a failure may try to "fix" the registry by rewriting version 1 — which `registerVersion` refuses, correctly. Behaviour 7 says so explicitly for that reason.
