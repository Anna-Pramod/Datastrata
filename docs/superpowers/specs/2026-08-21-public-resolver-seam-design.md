# The public resolver seam

**Date:** 2026-08-21
**Status:** Design approved, ready for implementation planning
**Refines:** `2026-08-21-status-truth-boundary-design.md` §9. Where the two differ, this document governs.
**Scope:** Program-agnostic engine change plus one Next.js app change. Blocks the operational signing gate.

---

## 1. Why this exists

The status truth boundary closed the architecture gate: `deriveStatus(governing, [])` no longer compiles, the loader fails closed to `freshness_unchecked`, and the four-stage sequence proves fresh, stale and unchecked are distinct through both the engine and the customer-facing payload.

It did **not** give the production site a way to obtain that truth. `lib/pack.ts` calls:

```ts
cached = loadPack(dir);
```

with **no options**. The site as shipped can never supply a resolver, so `packStats().ratified` is structurally pinned at 0 and `containsDraftContent` can never clear. Task 3 reached the public path by mocking at the module boundary — correct for a test, and not a claim the site can resolve anything.

**So the operational signing gate cannot close by adding B2's result producer alone.** A real fresh signature would reach the site and still read `freshness_unchecked`. This design is the missing prerequisite.

**The narrow question:** how does the deployed server construct a verification-aware pack without making `loadPack` own corpus/result I/O, and what invalidates that projection?

### 1.1 The decision, in one paragraph

> **Verification state travels with the deployed revision.** Static surfaces resolve it at build time; dynamic server surfaces resolve it from the same traced inputs and the same shared resolver, memoised for that immutable server revision. The standalone bundle must contain the complete verification-state closure, and an **isolated-production test proves that closure** rather than trusting file-tracing configuration by inspection. **No materialised status projection is introduced.**

That preserves B1b-ii §2's "no second source of truth" decision while addressing a deployment failure mode §2 never contemplated.

### 1.2 Phasing: the existing defect is repaired first, on its own

§2.1's tracing defect is **logically independent of this design**. `loadPack` already requires the version registry; the resolver seam only expands that runtime closure later. So it is repaired first, as its own task and its own commit.

**Task 0 — establish the deployment contract and prove its closure.**

1. **Establish the deployment contract.** Add `output: 'standalone'` and document that `.next/standalone` is the deployable server artifact.
2. **Build the uncorrected artifact first.** Do **not** add registry tracing yet.
3. **Start `.next/standalone` isolated from the repository** and hit `/api/check`.
4. **Confirm whether the predicted missing-registry failure occurs**, and inspect the exact failure. Record what actually fired, including anything unpredicted.
5. **Add the version registry to the current runtime closure** — plus only whatever else step 4 proved necessary.
6. **Rebuild and prove `/api/check` succeeds in isolation.**
7. **Mutate the trace back out**, prove the specific failure returns, restore, prove green.
8. **Install that isolated-artifact test as the deployment CI gate.**

Step 2 is the one most easily skipped and is the whole point of the ordering: building the *uncorrected* artifact first is what makes step 4 an observation rather than a prediction confirmed by construction.

This is not repairing a production incident — there is none. It is adopting a deployment contract and proving its closure before anything ships, which is a better position than the one a discovered outage would have left.

**Why the resolver seam must not absorb it.** Repairing tracing at the same time as adding corpus, ledger, results, resolver construction, request-time error handling and caching means a green isolated build cannot say **which** change repaired the defect. Worse, the resolver work could introduce a *different* missing-file failure that masks the registry one — the right red colour for the wrong assertion, which this project has now hit four times.

Keeping them apart leaves a reviewable baseline:

```
After Task 0:     knowledge + version registry            -> /api/check works isolated
After the seam:   + ledger + corpus closure + retained
                    raw material where required + results -> verification-aware /api/check works
```

Commit A says *"standalone is now the deployment contract, and this is the closure it needs today."* Commit B says *"the application gains a resolver; therefore its deployable state closure expands to this."* Those are materially different claims and the history should not merge them.

---

## 2. Two rendering modes, and the hazard between them

Verified in the current tree.

**The six pages are statically generated at build time.** `app/page.tsx`, `check`, `company`, `contact`, `login` and `dashboard` all call `packStats()`; **no page exports `dynamic` or `revalidate`, and none uses `cookies()`, `headers()` or `searchParams`.** So `packStats()` runs during `next build` and its output — including `ratified` — is baked into static HTML.

For those pages, deployment invalidation is not a policy we choose. It is already the mechanism, and it is stronger than process-lifetime caching: the value cannot drift from the deployed revision because it is *part of* the deployed revision.

**`/api/check` is `force-dynamic`** and calls `csrdPack()` per request, memoised for the process lifetime.

### 2.1 A pre-deployment packaging defect, not a production bug

**The repository has not yet been deployed.** Its configuration indicates an *intended* standalone deployment but does not currently enable standalone output. Once standalone becomes the explicit deployment contract, the existing tracing set is **known to be incomplete by inspection**, because `loadPack` requires the version-integrity registry while only knowledge JSON is included.

`next.config.mjs` traces:

```js
outputFileTracingIncludes: {
  '/api/check': ['../../backend/engine/knowledge/**/*.json'],
}
```

Nothing under `verification/` appears. And `assertRequirementVersions` reads `verification/requirement-versions/<packId>.json`, throwing a hard `VersionIntegrityError` when it is absent — deliberately, because an integrity check that can be switched off by deleting a file is not an integrity check. A computed `readFileSync(join(dir, …))` path is not statically traceable, so nothing supplies it implicitly.

**Task 0 enables the intended artifact first, then reproduces the omission against that artifact before repairing it.**

**Reproduced, and no longer known-by-inspection.** The uncorrected standalone artifact, started outside the repository, answered `POST /api/check` with a 500 and `VersionIntegrityError: no version registry for pack csrd at <artifact>/backend/engine/verification/requirement-versions/csrd.json`. The registry was both the predicted omission and the actual first failure, and it was the only one — no other member of the current mandatory closure fired. The defect is now closed and held closed by `npm run test:standalone`.

This framing is more precise than either "production bug" or "configuration-implied production defect", both of which presume a running deployment that does not exist. There is no incident and no outage. There is a deployment contract about to be adopted, and a packaging closure that is already insufficient for it.

A live resolver widens the same gap — it adds corpus, ledger and pinned results to the set of runtime reads — but it does not create it.

### 2.2 `output: 'standalone'` is being introduced deliberately

`next.config.mjs` sets `outputFileTracingRoot` and `outputFileTracingIncludes` but **does not set `output: 'standalone'`**. Without it Next computes the trace into `.nft.json` files and never assembles a `.next/standalone` directory, so the tracing configuration has never taken effect. `frontend/web/README.md:134` nonetheless describes it as shipping files "into a standalone build".

**Standalone is the chosen deployment architecture**, adopted here as an explicit decision rather than inferred from an existing environment:

```
source repository
      |
  npm run build
      |
  .next/standalone
      |
  isolated deployment test
      |
  deployable artifact
```

**The source checkout is not part of the runtime contract. If the standalone server cannot operate with the repository absent, the build is not deployable.**

Because there is no legacy deployment to preserve, the full-repository model is not considered. Standalone fits the architecture already being built: the runtime closure becomes explicit, testable, minimal and reproducible, instead of depending on an arbitrary repository checkout happening to be present on a server.

Two consequences for Task 0:

1. **Expect more than the registry to be missing.** A configuration that has never taken effect has never been checked. The first isolated run may fail on something else first, or on several things in sequence. Task 0's job is to reach a correct isolated `/api/check` and **name every omission it had to repair on the way** — the registry is the omission that was *predicted*, not necessarily the only one or the first to fire.
2. **There is no CI in this repository** — no `.github/`, no workflow files. Task 0 installs the first deployment-artifact gate *and* the first CI. Scope worth naming rather than discovering.

The upside of having no legacy: the first deployment model is born with its deployment invariants tested from day one, rather than acquiring them after an incident.

---

## 3. The architecture

**`lib/pack.ts` builds the live resolver and passes it to `loadPack`.** One code path serves both rendering modes: at build for the pages, per process for the API route. `loadPack` acquires no corpus or result I/O — the resolver closes over that state, exactly as the status-truth-boundary design specifies.

```
repository state (corpus, ledger, results)
        |
        v
lib/pack.ts  builds FreshnessResolver
        |
        v
loadPack(dir, { freshnessResolver })
        |
        v
pack.requirements[].derivedStatus
        |
        +--> packStats().ratified        (baked at build)
        +--> containsDraftContent        (per process, /api/check)
        +--> minStatus floors
```

**No materialised projection file.** B1b-ii §2's rejection stands and this design does not disturb it: one resolver, one code path, no second apparent source of truth. If measured cost ever demands a cache, it is a derived artifact carrying `sourceLedgerSha256`, `packSha256` and `generatedByVersion`, whose consumer refuses it when those no longer match — never a writable source of status.

### 3.1 One resolver, one code path

`lib/pack.ts` owns two exports and **both surfaces use the same one**:

```
buildCsrdFreshnessResolver(root)   -> FreshnessResolver
loadVerifiedCsrdPack(root)         -> KnowledgePack     (memoised)
```

Build-time pages and `/api/check` both go through `loadVerifiedCsrdPack`. **Do not let the two surfaces construct their own resolvers**, even if the code would initially be identical:

```
pages -> resolver A
API   -> resolver B      <-- forbidden
```

Two resolvers that agree today diverge the first time a normalizer version, a corpus path or a hash producer changes, and the failure is static pages and the checker API reporting different statuses **within one deployment** — a disagreement no test comparing either surface against itself can see.

### 3.2 Where the resolver's inputs come from

`lib/pack.ts` already resolves the pack directory by probing `CANDIDATE_ROOTS`. The resolver's inputs — corpus, ledger, results — resolve from the same repository root, and **the probe must not be duplicated**: one root, discovered once, shared by pack and resolver. Two probes that could disagree would be a second answer to "which repository am I reading?".

---

## 4. The deployable verification-state closure

### 4.1 Define the set semantically, not as the files found today

Listing "corpus, ledger, results" would repeat the mistake that produced §2.1 — a set enumerated from what was known at the time, which silently stops being complete. The set is defined by what it is **for**:

```
  authored knowledge
+ version-integrity registry
+ signature ledger
+ corpus state required for freshness
+ pinned verification results
= deployable verification state
```

**This is the closure *after* the resolver seam lands. It is not what the program reads today.** Task 0 repairs only what the current program requires as **mandatory**: authored knowledge and the version-integrity registry. The ledger is read today, but its absence deliberately means "empty ledger", so it does not trigger the suspected failure; the corpus and pinned results are not read by the public path at all until the resolver exists. **Task 0 must not pre-implement this closure** — it repairs a packaging defect, and the closure expands when the runtime semantics actually change.

Every member is load-bearing:

- **Version-integrity registry** — `loadPack` hard-fails without it (§2.1). It is not optional and it is not new; it is the member already missing.
- **Signature ledger** — an absent ledger currently reads as *empty*, i.e. "nothing signed". That degrades silently rather than failing, which is safe but wrong: a deployed site would report every requirement unsigned while the repository holds signatures.
- **Corpus state required for freshness** — including **retained raw bytes** where `normalizer_changed` resolution needs them. **Do not weaken freshness to reduce tracing.** If the resolver must renormalise raw bytes to avoid the pack-wide false alarm B1b-ii-b narrowed, those bytes are part of the closure. The tail wags nothing here: the trace follows the freshness derivation, never the reverse.
- **Pinned verification results** — at the existing `verification/<packId>/<requirementId>/verification-result.json` path.

Anything the resolver or the loader reads at runtime is a member by definition. The declaration lives in one plain module, since `next.config.mjs` is ESM JavaScript and cannot import the engine's TypeScript:

```js
// verification-runtime-inputs.mjs — the deployable verification-state closure
export const VERIFICATION_RUNTIME_INPUTS = [ /* one record per member */ ];
export function verificationTracingGlobs() { /* flat projection for the config */ }
```

**Member records, not a flat glob array.** Corrected at Task 1. A bare list cannot satisfy Task 2's requirement that recorded reads **span resolver-owned members**, because a glob carries no member identity. Each record names the member, what it is *for*, its `onAbsence` behaviour (`fatal` or `silent` — the ledger is the silent one, per §4.3), and its current globs. The config consumes the flat projection, so there is still exactly one declaration.

```js
outputFileTracingIncludes: { '/api/check': VERIFICATION_RUNTIME_INPUTS }
```

### 4.2 Prove the closure against the built artifact, not the configuration

**A local test cannot prove the standalone bundle contains a dynamically-read file, because the repository itself masks the omission.** Asserting that `next.config.mjs` contains a glob is inspection dressed as evidence — it confirms someone wrote the glob, not that the file arrives.

So the acceptance property is stated against the **built artifact**:

> Build the production standalone output, run `/api/check` with the source repository unavailable or outside the runtime search path, and prove the verification-aware pack loads from the traced artifact alone.

**The teeth check, six steps:**

1. Remove one required tracing include — the pinned result or the ledger.
2. Build the standalone output.
3. Start it **in isolation** from the source repository.
4. Hit the verification-aware API path.
5. Confirm the failure **specifically names the missing required artifact** — not a generic 500, not a stack trace terminating somewhere unrelated.
6. Restore the include, rebuild, and prove the same request succeeds.

Step 6 is the positive control and is not optional: without it, "the request fails when an input is missing" is satisfied by a build that fails for every reason, including reasons that have nothing to do with tracing. Step 5 is what distinguishes this from a red suite.

### 4.3 What the isolated build cannot prove

**The harness proves the closure only for members whose absence is fatal.** A member that degrades silently is invisible to it, and the ledger is exactly that case: `attachDerivedStatus` catches a failed read and substitutes an empty string, so an untraced ledger loads cleanly and reports every requirement unsigned. `/api/check` returns 200. The build test passes. The site is wrong.

That is failure mode 7 arriving inside the very harness built to prevent failure mode 6: *"does the request succeed"* is a negative observation, satisfied by a system that succeeds while answering falsely.

So the acceptance property has two halves, and the second is required once the ledger enters the closure:

1. **Liveness** — the isolated artifact serves the request. Catches hard-failing members.
2. **Agreement** — the isolated artifact reports the **same derived statuses** as a run over the full source repository, for the same fixture. Catches silently-degrading members.

Half 2 needs a fixture with at least one *signed* requirement, or the comparison is between two all-draft answers and proves nothing.

**A source-level read-coverage test is still worth having**, as a fast inner loop: instrument the resolver's reads over the real repository, assert every recorded path is matched by a glob in `VERIFICATION_RUNTIME_INPUTS`, and assert the recorded set is **non-empty** and spans more than one member. It catches a new read on the day it is written. But it is the cheap check, not the evidence — §4.2's isolated build is the evidence, because it is the only one gathered where the repository cannot mask the answer.

---

## 5. Invalidation, and why process-lifetime caching is now justified

**The deployed unit is a revision.** Verification state reaches the site by one route only:

```
signature / result / revocation / corpus change
        |
      commit
        |
      build
        |
      deploy
```

Within one deployed server process those files are **immutable**. Re-reading and rehashing them on every `/api/check` request would gain no freshness, because there is no newer state to observe. So the projection is computed once per unit and reused:

```
build-time page:
    resolver -> verification-aware pack -> static HTML

runtime API process:
    first request -> resolver -> verification-aware pack
    later requests -> the same memoised pack

new verification state:
    new deployment -> new build and new process -> new projection
```

Both surfaces have the same invalidation boundary — the deployed revision — reached by different routes, so they cannot disagree while that revision is fixed.

An earlier design argued against copying `csrdPack()`'s process cache onto operational state. That argument was correct **while the deployment model was an assumption**; it is now an established property, and the cache is justified rather than inherited.

> Public verification status reflects the verification state contained in the deployed revision. Signing locally, or committing verification state without deploying that revision, does not change the live site's status.

### 5.1 The cache invariant, stated so it can be violated visibly

> **Process-lifetime caching is valid only while verification state is deployment-immutable.** If signatures, results, revocations or corpus state become writable independently of deployment, this cache strategy becomes invalid and must change **before that workflow ships** — split the pack cache, or key status by verification-state identity (ledger and content hashes). Process lifetime is not a valid invalidation key for state that can change under a running process.

The same sentence retires the build-time bake: a statically rendered page cannot observe a change that arrives without a rebuild. Any workflow that makes verification state mutable at runtime invalidates **both** mechanisms at once, which is why the invariant is stated over the deployment model rather than over either cache.

**At sixteen requirements this is the moment to measure, not optimise.** No third cache is added.

---

## 6. Failure at request time

An `IntegrityFailureError` from the resolver propagates out of `loadPack`. On `/api/check` that reaches the route.

**The route may catch and refuse. It may not catch and downgrade.** The distinction is exact:

- **Refusing** — returning a 503 with a message saying the verification record is damaged and the check is unavailable — produces **no status at all**. It is honest and it is permitted.
- **Downgrading** — catching and continuing with unresolved freshness — reports `freshness_unchecked` over a record known to be broken. That is the forbidden catch from the status-truth-boundary design §5, one layer out.

The test that distinguishes them: under a resolver that throws, the route must produce **no `containsDraftContent` field at all**, rather than one computed from unchecked freshness.

---

## 7. The production positive-control path

Closing the operational gate requires proving the site can report `verified`, not merely that it declines to over-claim.

1. A signed, fresh fixture reaches `packStats().ratified` as a non-zero count **through `lib/pack.ts` as shipped** — no module mocking, the real resolver over a fixture repository root.
2. The same fixture moves a pinned input; the same path demotes with the specific reason.
3. The **built standalone artifact**, started in isolation from the source repository, serves that same request correctly — §4.2. The source-level read-coverage check is the inner loop; this is the evidence.
4. Under a throwing resolver, `/api/check` refuses rather than downgrades (§6).

Item 1 is the positive control the whole gate turns on. Without it, "the site never over-claims" is satisfied by a site that can never claim anything — the degenerate implementation the status-truth-boundary teeth checks were built to exclude, arriving one layer out.

---

## 8. Sequence

The isolated-production harness is built in Task 0 and outlives it, guarding two generations of runtime dependency:

1. **Task 0 — standalone tracing repair.** Reproduce the registry omission in isolation; repair it; install the production-artifact regression harness.
2. **The public resolver seam.** Shared resolver factory; one root for pack and verification state; expanded closure; build-time pages and the dynamic API on the same verification-aware pack; request-time integrity refusal; revision caching semantics.
3. **Resolver-seam isolated teeth check.** Reuse Task 0's harness, mutating a *resolver-specific* closure member — the pinned result is the best specimen, since its absence hard-fails and is easy to name. Add the agreement half of §4.3 once the ledger is in the closure.
4. **B2's result producer and the real live resolver.**
5. **The operational signing-gate test.** A real fresh signature reaches the public path as `verified`; real pinned-input drift demotes that same path with the expected reason.

**Only after step 5 is the first real signature permitted.**

Task 0's teeth check is unusually strong because it was discovered *from* the defect rather than designed against a hypothetical:

```
current tracing        -> isolated build fails
inspect                -> missing requirement-version registry
add registry tracing   -> isolated build succeeds
remove it again        -> fails for the same specific reason
restore                -> succeeds
```

Both directions, with a real incident behind it.

---

## 9. Enforcement

**CI is authoritative.** A change cannot merge if the standalone deployment artifact cannot answer correctly in isolation.

Three layers, deliberately separate:

```
npm test                  fast behavioural tests
npm run typecheck         compile-time contracts
npm run test:standalone   deployment-artifact truth
```

`test:standalone` is **excluded from `npm test`**: a real production build plus server startup is an integration test, and burying its failure among 900 engine tests makes it harder to read, not easier.

**One recipe, two callers.** The same `npm run test:standalone` runs in CI and by hand before a deploy. Do not maintain a CI shell recipe and a human one — that creates two definitions of "isolated standalone", and the weaker one becomes the real one.

**Pre-deploy is a second opportunity, not the primary mechanism.** A documented gate has the weakness of any unenforced checklist: the change most likely to need it is the change where somebody forgets.

**Cadence.** Run it on every PR touching `frontend/web/**`, `backend/engine/**`, or root package and build files, and on every push to the deployment branch. **Do not narrow the filter to `next.config.mjs`.** The registry defect is precisely the case where an *engine* change silently altered the web application's runtime file closure without touching Next configuration. If CI cost becomes material, fix it with dependency caching — never by weakening which semantic changes trigger the test.

### 9.1 The isolation validity rule

> **The standalone deployment test is valid only when the server process cannot resolve runtime files from the source checkout. A successful request while the repository remains reachable does not count as deployment evidence.**

The harness must not copy or install the repository beside the standalone server after the build. Doing so recreates the exact masking condition the test exists to remove. The runtime process gets the standalone artifact, whatever Next traced into it, and normal environment variables — nothing else.

**This rule gets its own teeth check**, because it is the assumption everything else rests on: with an input deliberately untraced, demonstrate that the request **succeeds anyway** where the repository is reachable, then watch the same configuration fail in isolation.

**The masking server must be checkout-resident, not an unguarded artifact.** Corrected at Task 1, which found the obvious reading does not work. Next's generated `server.js` begins with `process.chdir(__dirname)`, and `lib/pack.ts` resolves `CANDIDATE_ROOTS` through `process.cwd()` — so the standalone artifact always finds its pack **inside itself**, and switching the isolation guard off changes nothing. An implementer following the earlier wording would see the demonstration fail and reasonably conclude the design's premise had collapsed.

The masking condition is real and lives one layer out: a server running **inside the source checkout** — which is precisely what `npm test`, `npm run dev` and a pre-deploy `next start` are. Demonstrate it there, and make the evidence a **recorded read** of the untraced file from the checkout, not merely a 200. A successful response says the request tolerated the omission; the read record says it resolved the dependency out of the repository.

---

## 10. Non-goals

- **No materialised projection file.** §3 states the condition under which that decision would be revisited.
- **No move to `minStatus: 'verified'` on the public checker.** Resolving freshness and filtering out drafts remain separate product decisions; this design only makes the first possible.
- **No B2 result producer.** This seam is built and tested against fixture results at the existing `verification/<packId>/<requirementId>/verification-result.json` path.
- **No caching beyond what exists.** Build-time bake and process memoisation are the two mechanisms; no third is added until measured.
