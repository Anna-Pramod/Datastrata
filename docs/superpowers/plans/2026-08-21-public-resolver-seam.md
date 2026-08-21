# The public resolver seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the deployed site a way to obtain verification truth — and prove the artifact that carries it actually contains what it needs.

**Architecture:** Four tasks. Task 0 establishes standalone as the deployment contract and proves its current closure, independently of everything downstream. Tasks 1–3 expand that closure, wire one shared resolver across both rendering modes, and prove the deployed artifact agrees with the source.

**Tech Stack:** TypeScript (strict, ESM), Next.js 15.5.23, zod (installed 3.25.76), vitest. No new runtime dependencies.

## Global Constraints

- **`docs/superpowers/TEST-EVIDENCE-STANDARD.md` is normative.** Read it before writing a teeth check. It now lists **seven** ways a test passes while proving nothing; failure mode 7 was discovered by the task immediately preceding this plan.
- **A red check is not evidence until its failure message names the assertion you intended.**
- **`npm run test:standalone` is separate from `npm test`.** A real production build plus server startup is a deployment test, not a unit test. Do not add it to the fast suite, and do not let a standalone failure hide among 900 engine tests.
- **One recipe, two callers.** CI and humans run the *same* `npm run test:standalone`. Two shell recipes create two definitions of "isolated standalone", and the weaker becomes the real one.
- **The isolation validity rule.** The standalone test is valid **only** when the server process cannot resolve runtime files from the source checkout. A successful request while the repository remains reachable does not count as deployment evidence.
- **No new runtime dependencies.** TypeScript strict with `noUncheckedIndexedAccess`.
- **Program-agnostic.** `grep -ri csrd backend/engine/src/` stays at exactly **five**.
- **`loadPack` acquires no corpus or result I/O.** The resolver closes over that state.
- **Every file starts with a JSDoc block saying *why* it exists.**
- **Commit style:** imperative sentence-case, no prefix, **no `Co-Authored-By` trailer**. **The user runs every `git add` and `git commit`.**
- Baseline: **12 frontend + 909 engine** green, `npm run typecheck` exit 0. Each task's baseline is the previous task's finishing count.

## Spec reference

`docs/superpowers/specs/2026-08-21-public-resolver-seam-design.md` governs. Read §1.2, §2.1, §2.2, §3, §4, §5, §6, §9 before starting. **Do not reopen deployment architecture**: standalone is the contract, the source checkout is outside the runtime contract, CI is authoritative, and one verification truth path serves both static pages and `/api/check`.

## File structure

| File | Responsibility |
|---|---|
| `frontend/web/next.config.mjs` | **Modified** — `output: 'standalone'`; tracing from the shared closure |
| `frontend/web/verification-runtime-inputs.mjs` | **New** — the deployable verification-state closure, imported by config and tests |
| `frontend/web/lib/pack.ts` | **Modified** — one root, `buildCsrdFreshnessResolver`, `loadVerifiedCsrdPack` |
| `frontend/web/app/api/check/route.ts` | **Modified** — integrity refusal, no downgrade |
| `scripts/test-standalone.mjs` | **New** — the isolated-artifact harness, the one recipe |
| `.github/workflows/*.yml` | **New** — the repository's first CI |
| `package.json` | **Modified** — `test:standalone` |

**Dependency order:** Task 0 → Task 1 → Task 2 → Task 3. Strict.

---

### Task 0: Establish and prove the standalone deployment contract

Spec §1.2, §2.1, §2.2. **Independent of everything downstream, and deliberately so.**

There is no deployed site. This is not repairing an incident — it is adopting a deployment contract and proving its closure before anything ships.

**Files:** `frontend/web/next.config.mjs`, `scripts/test-standalone.mjs`, `.github/workflows/`, `package.json`, `frontend/web/README.md`.

**The evidence sequence, and its ordering is load-bearing:**

```
uncorrected standalone
   -> observe and INSPECT the failure
   -> repair
   -> success
   -> remove the repair
   -> the same intended failure returns
   -> restore
   -> success
```

**If the tracing fix lands before the first isolated build, the evidence is gone.** You would have constructed a test that passes after the answer is already known, rather than shown the defect existed in the artifact. Build the **uncorrected** artifact first. This is the step most easily skipped and the entire reason for the ordering.

**Required behaviours:**

1. **`output: 'standalone'` is added** and `.next/standalone` documented as the deployable server artifact. Until now the tracing config has never taken effect, so it has never been checked.
2. **Inspect the first failure; do not assume it.** The version registry is the *predicted* omission. It may not be the only one and it may not fire first. **Name every omission you repair.** If something unpredicted fails first, that is a finding, not an obstacle.
3. **Repair only the current mandatory closure** — authored knowledge and the version-integrity registry. **Do not pre-implement Task 1's five-member closure.** The ledger is read today but its absence means "empty ledger" and does not fail; corpus and results are not read by the public path at all yet.
4. **`npm run test:standalone` is the one recipe**, owning build → isolate → start → request → assert, and used identically by CI and by hand.
5. **Isolation is real.** The server runs from a directory outside the repository tree and must not reach `../../backend/engine/...`. Do not copy the repository beside the artifact after the build.
6. **CI runs it** on PRs touching `frontend/web/**`, `backend/engine/**`, or root package/build files, and on pushes to the deployment branch. **Do not narrow to `next.config.mjs`** — the registry case is exactly an engine change that alters the web runtime closure without touching Next config.

**A practical note that will otherwise cost an hour.** Next's standalone output does **not** include `.next/static` or `public/` — they are copied alongside by convention. An API-only request may not need them; a page request will. And `outputFileTracingRoot` is the repo root, so the standalone tree mirrors the repository structure beneath it. Find the real server entry point rather than assuming `.next/standalone/server.js`.

**Teeth check.** Steps 5–7 of the evidence sequence *are* the teeth check: remove the repair, confirm the isolated request fails **naming the missing artifact** — not a generic 500, not a stack terminating somewhere unrelated — then restore and confirm success. Record every output verbatim.

**Then, and only then**, the design's wording may change from *pre-deployment packaging defect, known incomplete by inspection* to *reproduced against the artifact*.

- [ ] **Step 1: Add `output: 'standalone'`** and document the artifact
- [ ] **Step 2: Build and isolate the UNCORRECTED artifact**; request `/api/check`
- [ ] **Step 3: Inspect and record the failure** — what actually fired, in full
- [ ] **Step 4: Repair only the current mandatory closure**
- [ ] **Step 5: Rebuild, isolate, prove success**
- [ ] **Step 6: Remove the repair; prove the specific failure returns; restore; prove green**
- [ ] **Step 7: Wire `npm run test:standalone` and the CI job**
- [ ] **Step 8: `npm test && npm run typecheck && npm run test:standalone`**, then hand over the commit

---

### Task 1: Define the deployable verification-state closure

Spec §4. The closure is defined by what it is *for*, not by the files known today.

**Files:** `frontend/web/verification-runtime-inputs.mjs`, `next.config.mjs`. **No test file** — see behaviour 4.

**Required behaviours:**

1. **`VERIFICATION_RUNTIME_INPUTS` is the single declaration**, imported by `next.config.mjs` and by the tests. It is `.mjs` because `next.config.mjs` cannot import the engine's TypeScript.
2. **The five members, semantically:** authored knowledge; version-integrity registry; signature ledger; corpus state required for freshness — **including retained raw bytes where `normalizer_changed` resolution needs them**; pinned verification results.
3. **Do not weaken freshness to reduce tracing.** The trace follows the freshness derivation, never the reverse.
4. **Behaviour-derived read coverage belongs to Task 2, not here — and the reason matters.** The public freshness resolver does not exist yet. Instrumenting reads now can only record what *today's loader* touches: knowledge and the registry. A test doing that while claiming to prove the five-member closure would be asserting coverage of corpus and result members **that nothing has yet read** — a passing test whose subject does not exist. That is precisely the overclaim the evidence standard exists to prevent, and it would pass vacuously by construction.

   So Task 1 **declares** the closure and wires the tracing; Task 2 **enforces** the read→glob property once `buildCsrdFreshnessResolver` makes "derived from behaviour" literally true.

5. **Task 1's demonstration must use a dependency that actually exists at this point.** The masking teeth check below is performed against a real current runtime dependency — the version registry — not against a corpus or result path nothing reads yet.

**Teeth check — one check, two halves.**

**The masking demonstration**, which is the assumption everything rests on. Leave one input untraced. Start the server **with the repository reachable** and show the request **succeeds anyway**. Then run the authoritative isolated form and watch the same configuration fail. That is the masking condition shown rather than asserted, and it is why §9.1 exists.

There is no coverage mutant in this task, because there is no coverage test in this task. It arrives with Task 2.

- [ ] **Step 1: Create `verification-runtime-inputs.mjs`** as member records, and consume its flat projection from the config
- [ ] **Step 2: Confirm `npm run test:standalone` still passes** — Task 0's repair must survive the migration
- [ ] **Step 3: Empty the registry member's globs**, and **confirm the mutation landed** by asserting on the *emitted globs*, not by grepping the file — its prose names `requirement-versions` and a grep will lie
- [ ] **Step 4: Half A** — checkout-resident server: request succeeds, and **record the read** of the untraced file from the repository
- [ ] **Step 5: Half B** — isolated artifact: same configuration fails naming the missing dependency
- [ ] **Step 6: Restore, confirm by hash, prove all three gates green**, then hand over the commit

---

### Task 2: Wire the shared public freshness resolver

Spec §3, §5, §6.

**Files:** `frontend/web/lib/pack.ts`, `frontend/web/app/api/check/route.ts`, a read-coverage test — **and `backend/engine/src/**` where extracting a reusable helper is the right way to avoid a second freshness algorithm (see behaviour 7).**

**Interfaces:** `buildCsrdFreshnessResolver(root): FreshnessResolver`, `loadVerifiedCsrdPack(root): KnowledgePack` (memoised).

**Required behaviours:**

1. **One root, discovered once**, shared by the pack and the verification state. Two probes that could disagree are a second answer to "which repository am I reading?".
2. **One resolver.** Build-time pages and `/api/check` both go through `loadVerifiedCsrdPack`. **Two surfaces must not construct their own**, even with identical code — they diverge on the first normalizer or corpus-path change, and the failure is pages and the API disagreeing *within one deployment*, which no test comparing either surface against itself can see.
3. **Revision-scoped memoisation is preserved and now justified**: within a deployed process the verification files are immutable, so re-reading gains no freshness.
4. **Fail-closed survives.** No resolver still yields `freshness_unchecked`, never `verified`.
5. **The route may refuse; it may not downgrade.** An `IntegrityFailureError` reaching the route produces a refusal with **no status payload at all** — no `containsDraftContent` computed from unchecked freshness. Refusing is honest; downgrading is the forbidden catch one layer out.
6. **No result producer.** Fixtures at the existing `verification/<packId>/<requirementId>/verification-result.json` path.

7. **No second freshness algorithm. This is the most important constraint in the task.** The web resolver **composes existing engine primitives** — `deriveStaleness`, `resolveNormalizerChanged`, the canonical hash producers, corpus closure and result hashing — and must not recreate freshness semantics inside `lib/pack.ts`.

   The signing path already contains the logic that decides whether a signature still holds. A public resolver that merely *happens* to implement equivalent comparisons today is a second definition of freshness, and it will diverge — silently, and in the direction where the site and the review sheet disagree about the same signature.

   **"One resolver for pages and API" only prevents web-vs-web divergence. It does nothing about signing/review truth versus public-site truth.** That is a different seam and behaviour 7 is what closes it.

   **If extracting a reusable helper into `backend/engine/src/` is what it takes, do that** rather than forcing the implementation into the two frontend files. An engine change is the correct answer here; a duplicated comparison is not.

8. **Behaviour-derived read coverage, moved here from Task 1.** Now that the resolver exists, instrument its reads and assert every recorded path is matched by a glob in `VERIFICATION_RUNTIME_INPUTS`.

   **The anti-vacuity property is resolver-owned member coverage, not a non-empty read set.** Corrected during Task 2's execution, which proved why: **the loader itself reads knowledge, registry and ledger**, so a resolver that does *literally nothing* still produces a non-empty read set — and a stub returning `{ checked: true, reasons: [] }` is outcome-identical to a fresh answer, so a status assertion does not catch it either. Verified: stubbing the resolver to read nothing leaves the non-empty assertion **green** and only the span assertion fails.

   So assert, as **named members**: the observed reads include the resolver-owned ones — at minimum **corpus state and pinned verification results** — and the signed fixture actually resolves to the expected **non-draft** state. The mutant must kill the **span**, not merely the existence of reads.

   **What it runs against.** *"Instrument the resolver over the real repository"* is impossible today: the real ledger is empty, so the loader stops at `freshness_unchecked` and the resolver is never entered. The evidence comes from **the production path pointed at a fixture repository through the normal `process.cwd()` discovery seam** — not a test-only override, not module mocking. State that explicitly in the test, so a future reader does not mistake synthetic verification state for a test-only production path.

   **Retained raw bytes, precisely.** `loadCorpus` reads raw files **eagerly**, so fresh-path read coverage already proves their *packaging*. What remains branch-specific is **`normalizer_changed` resolution** — `renormalisedHashes` only renormalises when the pinned `normalizerVersion` differs — and that needs its own fixture and mutant to prove the retained bytes actually **affect the outcome**. Do not describe the bytes themselves as drift-only reads; the read is eager, the resolution is conditional.

**Teeth check, three.** Remove one glob and confirm the coverage test fails **naming the uncovered path**; then confirm it also fails when the resolver is stubbed to read nothing, proving the non-vacuity assertion bites. Mutate the route to catch the integrity failure and continue — the refusal test must fail **specifically because a status payload was produced where none should exist**. And give the two surfaces separate resolvers with a deliberate difference; confirm a test detects the disagreement. If nothing does, the cross-surface property is untested and you should **stop and report**.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm each fails for the reason you intended**
- [ ] **Step 3: Implement the shared root, resolver and `loadVerifiedCsrdPack`**
- [ ] **Step 4: Implement the route's refusal boundary**
- [ ] **Step 5: Perform both teeth checks**; record every output
- [ ] **Step 6: `npm test && npm run typecheck && npm run test:standalone`**, then hand over the commit

---

### Task 3: Prove deployment agreement and close the seam prerequisite

Spec §4.3, §7.

**Liveness is not correctness.** HTTP success proves the artifact serves the request; it does not prove the answer is right. An untraced ledger loads cleanly, returns 200, and reports every requirement unsigned. Neither half substitutes for the other.

**Required behaviours:**

1. **Liveness** — the isolated artifact serves the request. Catches hard-failing closure members.
2. **Agreement** — the isolated artifact and a source-repository run produce the **same derived-status projection** for the same fixture. Catches silently-degrading members.
3. **Compare a small canonical projection**, not whole HTTP payloads: `requirementId`, `derivedStatus`, `statusReasons`. That makes the assertion target explicit and the diff readable.
4. **The fixture must contain at least one genuinely signed requirement**, or agreement compares two all-draft answers and proves nothing.

5. **How the signed fixture reaches the artifact — specified, because the wrong answer voids the test.** The production path discovers canonical repository locations, so an implementer left to solve this alone may reach for module mocking, a test-only production backdoor, or **copying verification files into `.next/standalone` after the build**. Any of those makes the agreement test pass **while bypassing the very tracing property it claims to prove**.

   The rule: **build from a temporary fixture repository or worktree whose verification state is installed at the real production paths before `next build`.**

   ```
   fixture repository state
          |
          +-- source run ------> canonical status projection
          |
          +-- next build
                 |
          standalone artifact ONLY
                 |
          isolated run --------> canonical status projection

                    compare
   ```

   **No post-build injection of a ledger, corpus or result is permitted.** If the harness puts a file into the artifact, an untraced member still appears present and the deployment test proves nothing. **The tracing mechanism — not the harness — must be what moves ledger, corpus and results into the runtime artifact.** That is the whole claim under test.
6. **The four properties:** fresh → `verified`; drift → the **specific** stale reason; a missing silently-degrading member → **disagreement**; resolver integrity failure → API refusal with no status payload.

**Teeth check.** Untrace the **ledger** — the silently-degrading member. Liveness must **pass** and agreement must **fail**. That single result is the whole justification for having two halves, and if agreement also passes, the fixture has nothing signed and proves nothing.

**Final acceptance state**, to be reproduced in the report and the commit:

**Public resolver seam — CLOSED.** Standalone is the deployment contract with its closure proven against the artifact; one resolver serves both surfaces; the route refuses rather than downgrades; source and isolated runs agree.

**Operational signing gate — STILL CLOSED.** Outstanding: B2's real result producer; the live resolver over real verification records; a real fresh signature reaching the public path as `verified`; and real pinned-input drift demoting that same path. **Completing this plan is not permission to sign.**

- [ ] **Step 1: Build the fixture** with at least one signed requirement
- [ ] **Step 2: Write the liveness and agreement assertions**, failing
- [ ] **Step 3: Run them; confirm each fails for the reason you intended**
- [ ] **Step 4: Get all four properties green**
- [ ] **Step 5: Perform the ledger teeth check**; record that liveness passes while agreement fails
- [ ] **Step 6: `npm test && npm run typecheck && npm run test:standalone`**, then hand over the commit

---

## Self-review

**Three amendments made after the plan was first written, before Task 1 was dispatched.** Behaviour-derived read coverage moved from Task 1 to Task 2, because the resolver it claims to measure does not exist until Task 2 and the test would otherwise pass vacuously while asserting the whole closure. Task 3 gained an explicit fixture-repository mechanism, because the plausible shortcuts — mocking, a production backdoor, post-build injection — each make the agreement test pass while bypassing the tracing property under test. Task 2 gained the no-second-freshness-algorithm constraint and permission to change `backend/engine/src/`, because one-resolver-for-both-web-surfaces does nothing about signing truth versus public truth.

**Spec coverage.** §1.2's Task 0 ordering and §2.1/§2.2's framing are Task 0. §4.1's semantic closure and §4.2's artifact-level property are Tasks 1 and 0 respectively — the harness is built in Task 0 and reused thereafter. §4.3's liveness/agreement split is Task 3. §3.1's one-resolver rule and §3.2's one-root rule are Task 2. §5's revision caching is Task 2 behaviour 3. §6's refuse-not-downgrade is Task 2 behaviour 5 with its own mutant. §9's enforcement is Task 0 behaviours 4–6; §9.1's isolation rule is a Global Constraint with its demonstration in Task 1.

**Type consistency.** `FreshnessResolver` and `FreshnessResolverInput` come from the engine unchanged. `VERIFICATION_RUNTIME_INPUTS` is declared in Task 1 and consumed by `next.config.mjs` and the tests. `loadVerifiedCsrdPack` is produced in Task 2 and exercised in Task 3.

**Known scope edges, stated.** Task 0 installs the repository's first CI, which is more scope than a tracing repair implies. And the standalone harness cannot run inside `npm test`, so the fast suite can be green while deployment is broken — which is the entire reason the gate exists, and the reason its CI trigger must stay wide.
