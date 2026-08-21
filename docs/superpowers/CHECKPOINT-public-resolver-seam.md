# The public resolver seam — COMPLETE 2026-08-21

Describes revision **`fef8f55`** on `feature/b1b-ii-a-record`, not a working
tree. Acceptance was run from committed HEAD with `git status` clean.

```
npm test                            29 frontend + 909 engine
npm run typecheck                   exit 0
npm run test:standalone             exit 0, real /api/check request answered
grep -ri csrd backend/engine/src    5, unchanged
migration goldens                   6 + 3 passing, artifacts byte-unchanged
real repository                     no signatures.jsonl; ratified = 0; all draft
```

---

## Causal correction — supersedes the earlier Task 2 diagnosis

**Task 2 did not create the tracing defect.** The defect already existed in
Task 1: nft statically folded a `process.cwd()`-derived **directory** probe and
recursively emitted that directory as a runtime asset. While the probe targeted
`knowledge/csrd`, the unintended emit was small enough to look legitimate.
Task 2's one-root change moved the same probe to the engine root, enlarging the
latent defect from the pack directory to essentially the whole engine tree.

The repair was to probe for the concrete `knowledge/<packId>/pack.json` file and
derive the root from that manifest, leaving runtime state to the explicit
verification-closure declaration.

**This wording replaces, and does not coexist with, two earlier claims that are
wrong:** that "Task 2 broke tracing", and that `outputFileTracingIncludes` was
inherently inert in this repository. Both appear in earlier drafts and in
Task 3's original report. Neither is true.

Two plausible causes were investigated and disproven. Do not re-run them:

- **The `index.ts` → `cli/sign` barrel edge is real but not causal.** The web
  runtime does import `resolvedStaleness` from CLI code. Severing that edge left
  the artifact byte-identically at 70 files. The leak is an **asset emit**, not a
  module edge.
- **Neither the cross-package relative imports in the frontend test helpers, nor
  frontend tests being type-checked by Next.** Removing the entire frontend test
  directory left the artifact at 70 files unchanged.

---

## The evidence chain

```
closure declaration present
  -> ledger traced into artifact
  -> source == artifact
  -> 16 x ratified []

ledger declaration removed
  -> ledger ABSENT from artifact
  -> /api/check still 200
  -> artifact = 16 x draft []
  -> source != artifact

declaration restored
  -> exact agreement returns
```

Verified from the committed repair, mutating **the declaration and never the
artifact**, with the mutation confirmed on the emitted glob representation
rather than by grep — the declaration's prose names "ledger" six times and a
grep would have lied.

The disagreement is specific and was confirmed directly rather than inferred:
an absent ledger yields **`draft, []`** — no governing entry at all — and not
`freshness_unchecked`, which would require a governing signature whose freshness
went unevaluated.

Task 2.5's registry mutant proves the same chain for the **fatal** half: remove
the version-registry member, rebuild, and the isolated request fails naming
`requirement-versions/csrd.json`. Together the two prove the declaration governs
both fatal absence and silent degradation.

---

## Public resolver seam — CLOSED

- Standalone is the deployment contract; `.next/standalone` is the deployable
  artifact; the source checkout is outside the runtime contract.
- One resolver serves both rendering modes, memoised by canonical root.
- The route may refuse but may not downgrade: an integrity failure produces no
  status payload rather than `freshness_unchecked` over a record known broken.
- Source and isolated runs agree on the canonical status projection.
- `VERIFICATION_RUNTIME_INPUTS` governs artifact contents, proven in both
  directions.
- CI enforces it: `npm run test:standalone`, one recipe for CI and humans, kept
  out of `npm test`, triggered on `frontend/web/**` **and** `backend/engine/**`.

## Operational signing gate — STILL CLOSED

Completing this phase proves the deployed site can faithfully **consume**
verification truth. It does not create the verification truth that may be
signed. Outstanding before a first real signature is permitted:

1. B2 produces real `verification-result.json` records through the sanctioned
   producer.
2. The **real repository**, not a fixture, holds the verification material the
   resolver requires.
3. A real fresh signature reaches the shipped public path as
   `verified`/`ratified`.
4. A real pinned-input mutation demotes that same path with the **specific**
   expected staleness reason.
5. Restoration returns it to the signed status.
6. Those mutations carry the same red/green teeth discipline established here.

---

## Over-inclusion is a correctness hazard, not bundle bloat

The permanent artifact-hygiene guard exists for a reason worth stating, because
it is not obvious: **tests, docs, `CLAUDE.md` and unrelated review artifacts
reaching production can accidentally satisfy undeclared filesystem
dependencies.** When everything ships whether declared or not, removing a member
from the closure changes no outcome — so the declaration cannot be tested, and
every liveness and agreement check stays green over a mechanism that has stopped
governing anything.

That is exactly how this regression survived three tasks unnoticed. The guard
rejects `backend/engine/test/**`, `docs/**` and `CLAUDE.md`, paired with a
positive control (authored knowledge must be present) so the absences cannot be
satisfied vacuously by an empty artifact. It is a guardrail; the trace mutants
remain the evidence.

---

## Recorded deviations

- **Commit-boundary mixing, accepted rather than rewritten.**
  `scripts/standalone-harness.mjs` was created by Task 3 and modified by
  Task 2.5 to add the hygiene guard, so a piece of Task 3's harness extraction
  landed inside Task 2.5's commit (`09055f3`). It is genuinely shared
  infrastructure and that commit's message explains the guard.
- **Task 1's "18 files, selective" baseline was itself misleading** and was
  treated as the healthy state during investigation. It was the same defect
  rooted lower. The reviewer's framing of the whole investigation as "Task 2
  broke it" followed from that error.

## Method note

When both mandated hypotheses died, Task 2.5 stopped guessing and **asked the
tracer directly** — temporarily patching Next's trace plugin in `node_modules`
(backed up, restored, hash-verified) to dump nft's `reasons` map, which named
`lib/pack.ts` as the sole parent of all 69 leaked files. It then reproduced the
behaviour in a synthetic probe outside the repository and bisected the path
shape until one form emitted a whole tree and another emitted a single file.
That is what turned a plausible story into a cause.
