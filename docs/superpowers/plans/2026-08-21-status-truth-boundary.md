# The status truth boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible for any surface to report `verified` without a positively evaluated freshness check — by changing the types, not by adding a rule.

**Architecture:** Three tasks. Make invalid status states unrepresentable; put the freshness seam into the loader; prove the boundary holds through the customer-facing path. Entirely fixture-driven — no live resolver, no results directory, no new I/O in `loadPack`.

**Tech Stack:** TypeScript (strict, ESM), zod (declared `^3.23.8`, installed **3.25.76**), vitest. No new runtime dependencies.

## Global Constraints

- **`docs/superpowers/TEST-EVIDENCE-STANDARD.md` is normative.** Read it before writing a teeth check. Every task carries one, naming the defect it must detect, with output recorded verbatim.
- **A red check is not evidence until its failure message names the assertion you intended.** This plan's predecessor produced two teeth checks that reddened the suite while proving nothing. Read every message.
- **No new runtime dependencies.** `zod` only; `node:*` builtins fine.
- **TypeScript strict, with `noUncheckedIndexedAccess: true`.** `tsconfig.json` includes `test`, so `@ts-expect-error` assertions are compiled by `npm run typecheck` — 62 test files are in the program today.
- **Program-agnostic.** `grep -ri csrd backend/engine/src/` must stay at exactly **five** pre-existing hits: `types.ts` (1), `cli/assess.ts` (1), `verification/render.ts` (2), `engine/summary.ts` (1).
- **`src/verification/` stays pure** — no filesystem, network or clock. **`loadPack` must acquire no corpus or result I/O in this plan**; that is an acceptance criterion of Task 2, not a style preference.
- **Every file starts with a JSDoc block saying *why* it exists**, not what it does.
- **Commit message style is imperative sentence-case with no prefix.** No `Co-Authored-By` trailer.
- **The user runs every `git add` and `git commit`.** Leave work in the tree and hand over the commands.
- Baseline: **7 frontend + 875 engine** green, `npm run typecheck` exit 0 for both workspaces. Each task's baseline is the previous task's finishing count.

## Spec reference

`docs/superpowers/specs/2026-08-21-status-truth-boundary-design.md` governs. Read §3, §3.1, §4, §5, §5.1 and §7 before starting. Where it differs from `2026-08-20-b1b-ii-record-design.md`, this design governs.

## Why this plan is specified by behaviour, not reference code

B1a's plan supplied full reference implementations and eight defects were found in the plan's own code, while implementers made zero transcription errors. Plans since specify interfaces and behaviours; the defects that remain are in specification, which reviews catch more cheaply. Where §5.1 gives code verbatim — the loader staging block — it is because the evaluation-order trap is the thing being communicated, and prose describing it would be reconstructed wrongly.

## File structure

| File | Responsibility |
|---|---|
| `src/types.ts` | **Modified** — gains `export type AuthoredRequirement` |
| `src/verification/status.ts` | **Modified** — `StatusInput`, `CheckedFreshness`, `FreshnessAssessment`, `freshness_unchecked`, `toStatusInput`, exhaustive `deriveStatus` |
| `src/verification/sign.ts` | **Modified** — both candidate hash producers widen to `AuthoredRequirement`; the `revoked` call site migrates |
| `src/cli/review-sheet.ts` | **Modified** — the `signature === null` call site migrates |
| `src/knowledge/loader.ts` | **Modified** — staged construction, `freshnessResolver` option, resolver invocation rules |
| `test/verification-status.test.ts` | **Modified** — existing 18 tests migrate; boundary and exhaustiveness tests added |
| `test/loader-freshness.test.ts` | **New** — the seam: invocation rules, propagation, no-I/O |
| `test/status-truth-boundary.test.ts` | **New** — the four-stage acceptance sequence through the public path |

**Dependency order:** Task 1 → Task 2 → Task 3. Strict; each depends on the previous.

---

### Task 1: Make invalid status states unrepresentable

Spec §3 and §3.1. The defect is not that someone forgot to compute staleness — it is that `[]` is a valid value meaning the opposite of what the caller meant. This task removes the ability to say it.

**Files:**
- Modify: `src/types.ts`, `src/verification/status.ts`, `src/verification/sign.ts`, `src/cli/review-sheet.ts`
- Test: `test/verification-status.test.ts`

**Interfaces:**
- Produces:
  - `export type AuthoredRequirement = Omit<Requirement, 'derivedStatus' | 'statusReasons'>` **in `types.ts`**
  - `interface CheckedFreshness { checked: true; reasons: StalenessReason[] }`
  - `type FreshnessAssessment = { checked: false } | CheckedFreshness`
  - `type StatusInput = { kind: 'unsigned' } | { kind: 'revoked'; entry: RevocationEntry } | { kind: 'signed'; entry: SigningEntry; freshness: FreshnessAssessment }`
  - `type StatusReason = StalenessReason | 'revoked' | 'freshness_unchecked'`
  - `deriveStatus(input: StatusInput): RequirementStatus`
  - `toStatusInput` — three overloads, exactly as §3.1 gives them

**Required behaviours:**

1. **The outer discriminant is mandatory.** A nested-discriminant shape does not compile; §3 records the exact error. Do not attempt it.
2. **`deriveStatus` switches exhaustively** over `input.kind` with an `assertNever`-style terminal branch, so a future `{ kind: 'suspended' }` fails the build rather than acquiring default behaviour.
3. **`toStatusInput` has no `LedgerEntry | null` overload** and no optional freshness parameter. Accepting an unnarrowed union with optional freshness rebuilds the defect one layer up.
4. **`freshness_unchecked` joins `StatusReason` only.** `deriveStaleness` must remain unable to return it, enforced by the type.
5. **The projection is exactly §4's table.** `draft, []` keeps its current meaning — no governing signature — and `freshness_unchecked` never appears merely because nothing is signed.
6. **Both candidate hash producers widen to `AuthoredRequirement`.** Widen the parameter; do not cast at the call site and do not import from `loader.ts`. The signature is making a claim: derived status is not an input to the content whose status is being established.
7. **The two already-correct call sites migrate.** `sign.ts` (inside `expected.kind === 'revoked'`) becomes `{ kind: 'revoked', entry }`; `review-sheet.ts` (inside `signature === null`) becomes `{ kind: 'unsigned' }` or the revoked form as its branch requires. They were correct **by comment**; they become correct by construction.

**Required test cases:** every row of §4's projection table; the existing 18 status tests migrated and still green; a `signed` input with `{ checked: false }` yields `draft, ['freshness_unchecked']`; a `signed` input with `{ checked: true, reasons: [] }` yields `entry.kind, []`; advisory-only reasons keep `entry.kind`; blocking reasons yield `draft` with the **full** set.

**Plus the compile-time boundary, both sides:**

```ts
// @ts-expect-error freshness_unchecked is epistemic status, not staleness
const impossible: StalenessReason = 'freshness_unchecked';
const valid: StatusReason = 'freshness_unchecked';
```

Widening `StalenessReason` makes the `@ts-expect-error` itself fail the build. The positive line states the other half, so the test asserts the boundary rather than only its exclusion.

**Teeth checks, three:**

1. **The old API must be gone.** Confirm `deriveStatus(governing, [])` no longer compiles. Record the error.
2. **Each illegal `toStatusInput` call errors.** Write §3.1's four illegal calls under `@ts-expect-error` and confirm `npm run typecheck` passes — then delete one directive and confirm typecheck *fails*, proving the directives are load-bearing rather than decorative.
3. **Exhaustiveness bites.** Add a fourth `StatusInput` member temporarily and confirm `deriveStatus` fails to compile at the `assertNever` branch. Revert.

Record all outputs verbatim.

- [ ] **Step 1: Write the failing tests**, including the compile-time boundary
- [ ] **Step 2: Run them; confirm they fail for the reason you intended** — read the messages
- [ ] **Step 3: Move `AuthoredRequirement` to `types.ts`** and widen both hash producers
- [ ] **Step 4: Implement the type model and `deriveStatus`**
- [ ] **Step 5: Migrate the two already-correct call sites**
- [ ] **Step 6: Perform all three teeth checks**; record every output
- [ ] **Step 7: `npm test && npm run typecheck`**, then hand over the commit command

---

### Task 2: Put the freshness seam into the loader

Spec §5 and §5.1. The loader is the unsound call site, and this is where it becomes fail-closed.

**Files:**
- Modify: `src/knowledge/loader.ts`
- Test: `test/loader-freshness.test.ts` (new)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces:
  - `interface FreshnessResolverInput { packId: string; requirement: AuthoredRequirement; entry: SigningEntry; renderContext: RenderContext }`
  - `type FreshnessResolver = (input: FreshnessResolverInput) => CheckedFreshness`
  - `LoadPackOptions` gains `freshnessResolver?: FreshnessResolver`

**Required behaviours:**

1. **Stage pack construction before building the object.** §5.1 gives the block verbatim; use it. `attachDerivedStatus` currently runs at the `requirements:` property while `catalogues:` is parsed four properties later, so the render context does not exist when status is attached. Object literal properties evaluate in order.
2. **`verifyIntegrity` keeps receiving the RAW `requirements.json` array.** That is what Task 6's leftover-`ratification` check reads, and zod strips it from the parsed record. Breaking this silently disables a guarantee; §5.1 says so and the test list below pins it.
3. **The resolver is invoked only for a governing `SigningEntry`.** Unsigned and revoked requirements never call it.
4. **No resolver → `toStatusInput(signing, { checked: false })`.** Never `verified`.
5. **Resolver present → its `CheckedFreshness` goes into the signed `StatusInput` unexamined and unmodified.**
6. **Resolver exceptions propagate.** The loader must not catch them and manufacture unchecked freshness. §5 states the rule; the teeth check gives it force.
7. **`loadPack` acquires no corpus or result I/O.** The resolver closes over external verification state; the loader supplies only pack-local deterministic inputs. This is an acceptance criterion, verified by grep in the report.
8. **A damaged ledger never reaches the resolver.** `parseLedger` runs before `governingEntry`, so `LedgerIntegrityError` is thrown first. Assert the ordering rather than assuming it.

**Required test cases:** unsigned requirement — resolver **not called** (spy asserts zero invocations); revoked requirement — resolver not called; signed with no resolver → `draft, ['freshness_unchecked']`, asserted with `toEqual` and specifically **not** `draft, []`; signed with a resolver returning `{ checked: true, reasons: [] }` → `verified, []`; signed with a resolver returning blocking reasons → `draft` with the full set; the resolver receives the **authored** requirement (no `derivedStatus` key present on the input object) and a render context whose `catalogues` is populated; a damaged ledger throws `LedgerIntegrityError` and the resolver is never called; the leftover-`ratification` check still fires after staging.

**Teeth checks, two — the first is the one that matters most in this plan:**

1. **Mutate the loader to catch the resolver's exception and substitute `{ checked: false }`.** The propagation test must fail **specifically because an `IntegrityFailureError` was expected to escape**. Read the message and confirm that is what it says. A red suite alone does not count — this is precisely the case §5 leaves to prose plus a test, so if the test does not discriminate, §5's rule is unenforced. If it does not bite, **stop and report**.
2. **Revert the staging change** so `catalogues` is parsed after `requirements`, and confirm the render-context test fails naming the empty or missing catalogues rather than crashing elsewhere.

Record both verbatim.

- [ ] **Step 1: Write the failing tests**, including the resolver spy and the propagation case
- [ ] **Step 2: Run them; confirm each fails for the reason you intended**
- [ ] **Step 3: Stage pack construction** per §5.1, preserving the raw array for `verifyIntegrity`
- [ ] **Step 4: Add the resolver option and the invocation rules**
- [ ] **Step 5: Perform both teeth checks**; record every output
- [ ] **Step 6: Confirm no new I/O** — `grep -nE "readFileSync|existsSync|corpus|verification-result" src/knowledge/loader.ts` gains nothing beyond the ledger and registry reads already there
- [ ] **Step 7: `npm test && npm run typecheck`**, then hand over the commit command

---

### Task 3: Prove the customer-facing truth boundary

Spec §7. The two previous tasks make the over-claim unrepresentable; this one proves it, through the surface that would have carried it.

**Files:**
- Test: `test/status-truth-boundary.test.ts` (new)
- Modify: `frontend/web/test/` only if the public path needs a fixture seam — **prefer no production change**; if one is unavoidable, stop and report before making it.

**Interfaces:**
- Consumes: everything from Tasks 1 and 2. Produces no new exports.

**Required behaviours:**

1. **The four-stage acceptance sequence, in order**, through the same loader / customer-facing projection seam:

   ```
   1. signed + fresh fixture            -> verified
   2. mutate pinned vs current result   -> draft, ['stale_result']   specifically
   3. suppress freshness resolution     -> draft, ['freshness_unchecked']  and NOT draft, []
   4. restore                           -> verified again
   ```

   **Steps 1 and 4 are the positive control and are mandatory.** "A stale signed requirement cannot appear `verified`" is satisfied by a system in which nothing ever appears `verified` — a stubbed resolver, a fixture that never signed, a filter that drops everything. That is failure mode 5 in the standard. Only the pair is evidence.

2. **Every red output in the sequence is read** and confirmed to name the intended assertion rather than an upstream version-integrity or pack-integrity gate. Task 2 of the previous phase found a mutation that reddened everything by tripping `loadPack`; the same trap exists here because these fixtures load a pack.

3. **The migration golden stays green throughout, and this is an architectural test.** With an empty ledger, unsigned remains `draft, []`, byte-compatible with B1b-ii-b's expectation and its one sanctioned adapter mapping. It proves the new distinction does not retroactively redefine the unsigned state. **Do not regenerate either golden artifact.** No regeneration path exists in the repository and none may be added.

4. **The public path exercises the same projection.** `containsDraftContent` and the public counts must follow the same fixture through all four stages, since those are the three places the over-claim propagated.

**Required test cases:** the four stages above, each asserted on the exact `statusReasons` array rather than on `derivedStatus` alone; `containsDraftContent` tracks the sequence; the engine and public goldens both pass unchanged; an unsigned requirement is `draft, []` in the same run, so the two draft-producing paths are distinguished within one test file rather than across two.

**Teeth check.** After the sequence is green, **replace the fixture resolver with one that returns `{ checked: true, reasons: [] }` unconditionally** — the "everything is always fresh" implementation. Stage 2 must fail. Then replace it with one that always reports blocking staleness — the "everything is always draft" implementation. Stages 1 and 4 must fail. Recording both is what proves the sequence discriminates in both directions rather than only refusing to over-claim.

- [ ] **Step 1: Write the four-stage sequence**, failing
- [ ] **Step 2: Run it; confirm each stage fails for the reason you intended**
- [ ] **Step 3: Build the fixtures** — a signed ledger entry, a pinned result, a resolver over them
- [ ] **Step 4: Get all four stages green**
- [ ] **Step 5: Confirm both goldens pass unchanged** and neither artifact was written
- [ ] **Step 6: Perform the teeth check in both directions**; record every output
- [ ] **Step 7: `npm test && npm run typecheck`**, then hand over the commit command

---

## Final acceptance state

On completion, state both gates explicitly in the report and the commit message:

**Architecture gate — CLOSED.**
- `StatusInput` introduced; `deriveStatus(governing, reasons)` no longer compiles.
- A loader without a resolver yields `freshness_unchecked`, never `verified`.
- `sign.ts` and `review-sheet.ts` are structurally `unsigned` / `revoked`.
- The fixture resolver contract is established and `loadPack` acquires no verification I/O.
- Positive and negative controls prove the boundary discriminates in both directions.
- The migration golden remains green and unregenerated.

**Operational signing gate — STILL CLOSED.**

Completing this plan is **not** permission to create the first real signature. That additionally requires: B2's real result producer writing to the existing `verification/<packId>/<requirementId>/verification-result.json` path; the live resolver reading it; a fresh real signature reaching the customer-facing path as `verified`; and mutating one of its pinned inputs demoting that same path correctly.

Until then the system is *safe* — it reports `freshness_unchecked` — but that is not the desired operating state, and a green suite here must not be read as readiness to sign.

## Self-review

**Spec coverage.** §3's type model and §3.1's overloads are Task 1, with the compile-time boundary and exhaustiveness as its teeth. §4's projection table is Task 1's test list and Task 3's acceptance sequence. §5's resolver contract and no-catch rule are Task 2, the latter given force by its first teeth check. §5.1's staging block and neutral `AuthoredRequirement` ownership are Tasks 2 and 1 respectively. §6's fixture-first scope is honoured — no task creates a results directory or a live resolver. §7.2's four-stage sequence is Task 3; §7.3's no-catch test is Task 2; §7.4's migration golden and compile-time assertions are Tasks 3 and 1. §8's two gates are the final acceptance state. §9's caching position requires no code and is asserted by the absence of a status cache.

**Type consistency.** `AuthoredRequirement` is defined in `types.ts` (Task 1) and consumed by `sign.ts`'s widened producers (Task 1) and `FreshnessResolverInput` (Task 2). `CheckedFreshness` is the resolver's return type in Task 2 and a `FreshnessAssessment` member in Task 1. `StatusInput` is produced in Task 1 and consumed unchanged in Tasks 2 and 3.

**Known scope edge, stated.** Task 2 (Step 6) asserts `loadPack` acquires no verification I/O by grep, which is weaker than a structural guarantee. A structural one would require moving ledger reading out of the loader entirely, which is a larger change than this prerequisite justifies and would disturb B1b-ii-b's committed seam. The grep is recorded as a criterion so its weakness is visible rather than assumed away.
