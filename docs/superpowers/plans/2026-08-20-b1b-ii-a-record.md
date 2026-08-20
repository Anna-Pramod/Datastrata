# B1b-ii-a — The record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a human's verification judgement recordable, derivable and revocable — a validated result schema, an append-only ledger of two variants, a staleness set, a derived status projection, and a field-accounting guard that knows what authority each field exercises.

**Architecture:** Five pure modules under `backend/engine/src/verification/`, plus a version-integrity registry under `verification/`. Nothing here touches product behaviour: no CLI, no site change, no migration. Every part is exercisable from fixtures. B1b-ii-b consumes this to build signing, the review sheet and the public migration.

**Tech Stack:** TypeScript (strict, ESM), zod 3.25.76, vitest. No new runtime dependencies.

## Why this plan is specified by behaviour, not reference code

B1a's plan supplied full reference implementations and eight defects were found in that code, while implementers made zero transcription errors. B1b-i specified interfaces and behaviours instead, and the defects that remained were in *specification* rather than transcribed code — cheaper to find, because reviews read specifications closely.

This plan gives exact interfaces, exact behaviours and exact test cases, and leaves implementation to the implementer. Where a value is required it is given verbatim and must be used verbatim.

## Global Constraints

- **No new runtime dependencies.** `zod` only; `node:*` builtins fine.
- **TypeScript strict, with `noUncheckedIndexedAccess: true`.**
- **Program-agnostic.** No regulation name in `src/`. `grep -ri csrd backend/engine/src/` must not gain a hit beyond the three pre-existing ones (`types.ts` comment, `assess.ts` pack path, `summary.ts` comment).
- **`src/verification/` is pure** — no filesystem, network or clock. Loading from disk belongs to `src/knowledge/loader.ts` and to tests.
- **Every file starts with a JSDoc block saying *why* the file exists**, not what it does — match `src/corpus/store.ts`.
- **Invisible or visually ambiguous characters in code are escape sequences** (non-breaking spaces, combining marks, zero-width). Visible punctuation stays literal.
- **Commit message style is imperative sentence-case with no prefix.** No `Co-Authored-By` trailer.
- **`npm test` green before every commit.** No test performs a network fetch.
- Work from `backend/engine`. The suite stands at **477 tests** green at the start of this plan.

## Spec reference

`docs/superpowers/specs/2026-08-20-b1b-ii-record-design.md` — read §3, §3.1, §4, §4.1 and §6 before starting. Where it differs from `2026-08-20-verification-factory-design.md`, the B1b-ii document governs.

## File structure

| File | Responsibility |
|---|---|
| `src/verification/registry.ts` | Version-integrity registry: parse, validate, bind a version to a content hash |
| `src/verification/result.ts` | `verification-result.json` zod schema; canonical semantic hash of a result |
| `src/verification/ledger.ts` | Ledger zod schemas (two variants), parse, referential validation, governing-entry resolution |
| `src/verification/staleness.ts` | `deriveStaleness(entry, current)` → an unordered set of reasons |
| `src/verification/status.ts` | `deriveStatus(governing, staleness)` → `derivedStatus` + `statusReasons[]` |
| `src/verification/accounting.ts` | Field roles, the zod path walker, and the completeness guard |
| `src/verification/canonical.ts` | **Modified** — gains `canonicalJson()`, shared by condition and result hashing |
| `verification/requirement-versions/<packId>.json` | The registry's data (new directory) |

Tests: `test/verification-registry.test.ts`, `verification-result.test.ts`, `verification-ledger.test.ts`, `verification-staleness.test.ts`, `verification-status.test.ts`, `verification-accounting.test.ts`.

**Dependency order:** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6. Tasks 1 and 2 are independent of each other.

---

### Task 1: The version-integrity registry

Spec §3.1. A signature pins `requirementVersion`, which does not exist yet. Content changing without a version bump must fail the build — and that check needs a record of what content each version described, because an unsigned requirement has no ledger entry to compare against.

**Files:**
- Create: `src/verification/registry.ts`
- Create: `verification/requirement-versions/csrd.json`
- Modify: `src/types.ts` (add `version: number` to `Requirement`)
- Modify: `knowledge/csrd/requirements.json` (add `version: 1` to all 16)
- Modify: `src/knowledge/loader.ts` (schema + the integrity check)
- Test: `test/verification-registry.test.ts`

**Interfaces:**
- Produces:
  - `interface VersionRegistry { [requirementId: string]: { [version: string]: string } }`
  - `parseVersionRegistry(raw: unknown): VersionRegistry`
  - `registerVersion(registry: VersionRegistry, requirementId: string, version: number, sha256: string): VersionRegistry` — pure; returns a new registry
  - `assertVersionIntegrity(requirements: Requirement[], registry: VersionRegistry, hashOf: (r: Requirement) => string): void`
  - `class VersionIntegrityError extends Error { problems: string[] }`

**Required behaviours:**

1. **It lives under `verification/`, not `knowledge/`.** The requirement is authoritative for its content; the registry only enforces that a declared version stays bound to the hash it named. Beside authored regulatory content it would read as content.
2. **Every historical mapping is retained**, keyed by version as a string: `{ "CSRD-S-001": { "1": "sha256hex", "2": "..." } }`. A version number therefore has permanent meaning.
3. **`assertVersionIntegrity` fails** when a requirement's current hash differs from the hash recorded against its current `version`, **and** when a requirement's `version` has no entry at all. The error names every offender, not the first.
4. **`registerVersion` refuses to overwrite.** Registering an existing `(requirementId, version)` with a *different* hash throws. Registering it with the *same* hash is a no-op that returns an equal registry. This is what makes "a version number has permanent meaning" an API property rather than documentation.
5. **`version` is an integer ≥ 1**, rejected by the loader schema otherwise.

**Required test cases:** a clean pack and registry pass; a content edit without a bump fails naming the requirement; a bump without registration fails; re-registering the same `(id, version)` with a different hash throws; with the same hash is a no-op; two offenders are both named; `version: 0` and `version: 1.5` are rejected by the schema.

- [ ] **Step 1: Write the failing tests** for all five behaviours
- [ ] **Step 2: Run them; confirm they fail for the right reason**
- [ ] **Step 3: Implement `registry.ts`**
- [ ] **Step 4: Add `version: 1` to all 16 requirements and `version: number` to the `Requirement` type**
- [ ] **Step 5: Generate `verification/requirement-versions/csrd.json`** by computing each requirement's `requirementSha256` with `requirementInputSha256`'s sibling from `canonical.ts`. **Print the file and read it** — 16 entries, each version `"1"`. If a hash looks wrong, stop and report rather than committing a registry that blesses whatever the code currently produces.
- [ ] **Step 6: Wire `assertVersionIntegrity` into the loader** so a mismatch fails `npm test`
- [ ] **Step 7: Prove the gate bites** — change one character in one requirement's `plainEnglish`, confirm `npm test` fails naming that requirement, revert, confirm green. Record both outputs.
- [ ] **Step 8: `npm test && npm run typecheck`, then commit**

---

### Task 2: The verification-result schema and its canonical hash

Spec §4.1. This is the interface B2's agents will produce. It does not exist yet, so this task defines it.

**Files:**
- Create: `src/verification/result.ts`
- Modify: `src/verification/canonical.ts` (add `canonicalJson`)
- Test: `test/verification-result.test.ts`

**Interfaces:**
- Produces:
  - `canonicalJson(value: unknown): string` in `canonical.ts` — key-sorted, JSON-escaped, deterministic
  - `verificationResultSchema` (zod), exported for the accounting guard to walk
  - `type VerificationResult = z.infer<typeof verificationResultSchema>`
  - `parseVerificationResult(raw: unknown): VerificationResult`
  - `resultSha256(result: VerificationResult): string`

**The schema.** Model the pipeline's output as the factory spec §3.5 describes it:

```
packId, requirementId, requirementVersion
resultSchemaVersion            literal '1.0.0'
pipelineVersion, rendererVersion
requirementInputSha256, conditionSha256, renderedConditionSha256
corpusClosureSha256
corpus[]                       { docId, versionLabel, sha256Raw, sha256Normalized, normalizerVersion }
reading                        { elements: [{ id, statement, evidence[] }] }
coverage                       { cells: [{ direction, readingElementId?, conditionPath?, verdict }] }
challenges[]                   { id, lens, statement, verdict, evidence[], resolution? }
openQuestions[]                { id, statement, blocking }
narrative?                     string
```

`evidence[]` reuses the `EvidenceItem` union already defined in `src/corpus/evidence.ts` — import its zod schema if one exists, otherwise define the zod mirror in `result.ts` and add a test asserting the two agree on a round-trip fixture. Do not fork the type.

`verdict` on a challenge is `'CONFIRMED' | 'MISMATCH' | 'OPEN_QUESTION'`. Coverage `verdict` is `'MAPPED' | 'UNMAPPED' | 'UNSUPPORTED' | 'UNCERTAIN'`. `direction` is `'reading_to_condition' | 'condition_to_reading'`.

**Required behaviours:**

1. **`canonicalJson` is key-sorted and escaped**, never delimiter-joined. Recursive through objects and arrays; array order preserved (order is meaning), object key order normalised (order is not).
2. **`resultSha256` is a canonical *semantic* hash**: `parse → validate → canonicalJson → sha256Hex`. It must **not** hash the raw file. Reformatting the file, or reordering its keys, must produce the identical hash — otherwise cosmetic churn becomes a trust alarm, which is the raw-versus-normalized lesson from the corpus applied one layer up.
3. **All zod objects are `.strict()`.** An unknown key is a validation failure, not a silently dropped field — that is how `missReason` escaped in B1b-i.

**Required test cases:** key reordering yields an identical `resultSha256`; whitespace/pretty-printing yields an identical hash; changing a challenge `verdict` changes the hash; changing an `evidence[]` item changes the hash; an unknown top-level key is rejected; an unknown key nested inside `challenges[]` is rejected; the `EvidenceItem` round-trip agrees with `src/corpus/evidence.ts`.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `canonicalJson` in `canonical.ts`**, and refactor `canonicalizeCondition` to use it if it does not already — one canonical serialiser, not two
- [ ] **Step 4: Implement `result.ts`**
- [ ] **Step 5: Focused tests green, then `npm test && npm run typecheck`**
- [ ] **Step 6: Commit**

---

### Task 3: The ledger

Spec §3. Two variants, not one shape with optional fields.

**Files:**
- Create: `src/verification/ledger.ts`
- Test: `test/verification-ledger.test.ts`

**Interfaces:**
- Produces:
  - `signingEntrySchema`, `revocationEntrySchema`, `ledgerEntrySchema` (a `z.discriminatedUnion('kind', …)`), all exported for the accounting guard
  - `type SigningEntry`, `type RevocationEntry`, `type LedgerEntry`
  - `entryId(entry: Omit<LedgerEntry, 'entryId'>): string` — canonical hash of the entry excluding `entryId` itself
  - `parseLedger(lines: string[]): LedgerEntry[]` — one JSON object per line
  - `verifyLedgerIntegrity(entries: LedgerEntry[]): void` — throws `LedgerIntegrityError`
  - `governingEntry(entries: LedgerEntry[], packId: string, requirementId: string): LedgerEntry | null`
  - `class LedgerIntegrityError extends Error { problems: string[] }`

**Entry shapes** are exactly as spec §3 gives them. A `RevocationEntry` carries **no verification pins** — only `entryId`, `kind`, `packId`, `requirementId`, `revokes`, `by`, `on`, `reason`. That is deliberate: revocation must remain possible when the corpus is broken, the result file is gone, or the encoding has drifted, which is when withdrawal matters most.

**Required behaviours:**

1. **`governingEntry` returns the last entry by file position** matching `(packId, requirementId)`, or `null`. **Never order by `on`** — dates collide, can be mistyped, and are signer-supplied; position is a property of the append-only file.
2. **`entryId` is computed over the canonical form excluding `entryId`**, so it is verifiable: recomputing an entry's id from its own contents must reproduce the stored value.
3. **Referential validation**, all at load, each naming the offending entry:
   - `revokes` names an `entryId` appearing **earlier** in the file
   - the target shares the same `packId` and `requirementId`
   - the target is a `SigningEntry`, **not** a `RevocationEntry` — un-revoking is a fresh signature, never a revocation of a revocation
   - every `entryId` is unique across the ledger
   - every entry's stored `entryId` matches its recomputed value
4. **A malformed line fails the whole load**, naming the line number. An append-only file that nothing can rewrite must not be partially readable.

**Required test cases:** empty ledger → `governingEntry` is `null`; two signings → the later governs; signing then revocation → the revocation governs; `revokes` naming a later entry is rejected; naming a different requirement is rejected; naming a different pack is rejected; naming another revocation is rejected; a duplicate `entryId` is rejected; a tampered `entryId` is rejected; a malformed line is rejected naming its line number; a `RevocationEntry` carrying `conditionSha256` is rejected by `.strict()`.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `ledger.ts`**
- [ ] **Step 4: Focused tests green, then `npm test && npm run typecheck`**
- [ ] **Step 5: Commit**

---

### Task 4: The staleness set

Spec §4 and §4.1.

**Files:**
- Create: `src/verification/staleness.ts`
- Test: `test/verification-staleness.test.ts`

**Interfaces:**
- Consumes: `SigningEntry` (Task 3).
- Produces:
  - `type StalenessReason = 'source_reissued' | 'stale_source_text' | 'stale_encoding' | 'stale_render' | 'stale_closure' | 'stale_result' | 'normalizer_changed'`
  - `interface CurrentState { requirementInputSha256, conditionSha256, renderedConditionSha256, corpusClosureSha256, resultSha256: string; corpus: Array<{ docId, sha256Raw, sha256Normalized, normalizerVersion }>; }`
  - `deriveStaleness(entry: SigningEntry, current: CurrentState): StalenessReason[]` — sorted, deduplicated
  - `BLOCKING: ReadonlySet<StalenessReason>`
  - `blocks(reasons: StalenessReason[]): boolean`

**Required behaviours:**

1. **Returns a set, never a ranked primary.** `stale_encoding` and `stale_source_text` co-occur when a condition was corrected *and* the law's text moved, and both must appear. A precedence order would invent which is "the" reason and hide the other from the person deciding what to do. Return sorted and deduplicated so comparison is stable.
2. **`deriveStaleness` never returns `revoked`.** Revocation is not staleness — nothing moved under a revoked signature; a person withdrew authority. `revoked` is not a member of `StalenessReason`, so this is enforced by the type, not by discipline.
3. **`source_reissued` is advisory** — raw hash moved, normalized identical. It is **not** in `BLOCKING`. Everything else is.
4. **`normalizer_changed`** fires when a pinned document's `normalizerVersion` differs from the current one. The plan's scope stops at detecting it: renormalising stored raw bytes to decide whether the text actually moved is B1b-ii-b's concern, and this task must not silently treat a version change as text change.
5. **`stale_result`** fires when `current.resultSha256` differs from `entry.resultSha256`. A **missing** result file is not a staleness reason — the caller raises an integrity failure before calling, exactly as a missing pinned corpus document does. `CurrentState.resultSha256` is therefore non-nullable, and that is deliberate: the type makes the integrity case unrepresentable here.
6. **A document present in the entry's `corpus[]` but absent from `current.corpus`** is likewise an integrity concern, not staleness. Document this in the JSDoc; do not add a reason for it.

**Required test cases:** every reason fires individually; `stale_encoding` + `stale_source_text` both present when both apply; `source_reissued` alone does not block; `stale_result` fires on a differing result hash and blocks; identical state yields an empty set; the returned array is sorted and deduplicated.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `staleness.ts`**
- [ ] **Step 4: Focused tests green, then `npm test && npm run typecheck`**
- [ ] **Step 5: Commit**

---

### Task 5: The status projection

Spec §4.

**Files:**
- Create: `src/verification/status.ts`
- Test: `test/verification-status.test.ts`

**Interfaces:**
- Consumes: `LedgerEntry`, `governingEntry` (Task 3); `StalenessReason`, `blocks` (Task 4).
- Produces:
  - `type DerivedStatus = 'draft' | 'verified' | 'ratified'`
  - `type StatusReason = StalenessReason | 'revoked' | 'unsigned'`
  - `interface RequirementStatus { derivedStatus: DerivedStatus; statusReasons: StatusReason[] }`
  - `deriveStatus(governing: LedgerEntry | null, staleness: StalenessReason[]): RequirementStatus`

**Required behaviours:**

1. **No governing entry** → `{ derivedStatus: 'draft', statusReasons: ['unsigned'] }`. Status and staleness are two axes: an unsigned requirement has nothing for staleness to be about.
2. **A `RevocationEntry` governs** → `{ derivedStatus: 'draft', statusReasons: ['revoked'] }`, **without consulting staleness at all**. A revoked signature's freshness is irrelevant and computing it would imply otherwise.
3. **A `SigningEntry` with no blocking staleness** → `derivedStatus` equals the entry's `kind`, `statusReasons` carries any advisory reasons (`source_reissued`).
4. **A `SigningEntry` with blocking staleness** → `{ derivedStatus: 'draft', statusReasons: <the full set> }`. The reasons travel with the status so every surface can say *why*, rather than merely refusing.
5. **Pure and total** — every input combination returns a value; no throws.

**Required test cases:** each of the four cases above; a blocked signing entry carries all its reasons, not one; an advisory-only entry keeps its `kind` and still reports `source_reissued`; a revocation ignores a non-empty staleness array passed alongside it.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `status.ts`**
- [ ] **Step 4: Focused tests green, then `npm test && npm run typecheck`**
- [ ] **Step 5: Commit**

---

### Task 6: Field accounting

Spec §6. The hardest acceptance test in this plan, and the one that closes a class rather than an instance.

**Files:**
- Create: `src/verification/accounting.ts`
- Test: `test/verification-accounting.test.ts`

**Interfaces:**
- Consumes: `verificationResultSchema` (Task 2); `ledgerEntrySchema` (Task 3).
- Produces:
  - `type FieldRole = 'authority' | 'signability' | 'freshness' | 'integrity' | 'display' | 'audit'`
  - `leafPaths(schema: z.ZodTypeAny): string[]` — every leaf path, sorted
  - `FIELD_ROLES: Record<string, FieldRole[]>` — the classification table
  - `assertFieldAccounting(schemas: Record<string, z.ZodTypeAny>): void` — throws naming every unclassified path

**The six roles** carry the meanings in spec §6.1. Note especially: **`freshness` means the field participates in freshness derivation, not that it invalidates.** `corpus[].sha256Raw` participates and yields `source_reissued`, which is advisory — a role called `staleness` defined as "invalidates" would misdescribe it, and misdescription in this table is how the last hole opened.

**The traversal.** zod 3.25.76 is installed and its internals are stable enough to walk. Verified by probe:

| Node | How to descend |
|---|---|
| `ZodObject` | `_def.shape()` → record of child schemas; path segment is the key |
| `ZodArray` | `_def.type` → element schema; path segment is `[]` |
| `ZodRecord` | `_def.valueType` → value schema; path segment is `{}` |
| `ZodOptional` / `ZodNullable` / `ZodDefault` | `_def.innerType` — unwrap, do **not** emit a path segment |
| `ZodDiscriminatedUnion` | `_def.options` is an **array** of object schemas; descend into every option and union the results |
| `ZodUnion` | `_def.options` array; descend into all |
| everything else | a leaf — emit the accumulated path |

So `challenges[].evidence[]` and `corpus[].sha256Normalized` are real emitted paths.

**Required behaviours:**

1. **`leafPaths` derives from the runtime zod schema, never from a TypeScript interface.** TypeScript disappears at runtime and cannot be walked; zod exists and can. This is the whole reason the guard can be complete.
2. **The walker descends into arrays, optionals, discriminated unions and records** with wildcard path segments, rather than stopping at the container. A walker that classifies a container and calls the job done reproduces the original hole at one remove.
3. **`assertFieldAccounting` fails when any leaf path across any supplied schema has no role**, naming every unclassified path. It fails **equally** when `FIELD_ROLES` contains a path that no schema produces — a stale classification is a lie about the shape and hides a removal.
4. **Both discriminated-union variants are covered.** A path present only on `RevocationEntry` must still be classified.

**The classification table** starts from spec §6.2 and must be completed for every path the walker actually emits. These are given verbatim and must be used verbatim:

```
kind                           authority
packId                         authority
requirementId                  authority
revokes                        authority, integrity
entryId                        integrity, audit
requirementVersion             integrity, audit
requirementSha256              integrity, audit
requirementInputSha256         freshness, audit
conditionSha256                freshness, audit
renderedConditionSha256        freshness, audit
rendererVersion                audit
corpusClosureSha256            freshness, audit
corpus[].sha256Normalized      freshness, audit
corpus[].sha256Raw             freshness, audit
corpus[].normalizerVersion     freshness, audit
resultSha256                   freshness, integrity, audit
pipelineVersion                signability, audit
challenges[].verdict           signability, display
challenges[].evidence[]        signability, audit
openQuestions[]                signability, display
by                             display, audit
on                             display, audit
note                           audit
reason                         display, audit
```

For any remaining path, choose a role and **state your reasoning in the report**. `on` is `display, audit` and deliberately **not** `authority` — Task 3 orders by file position, and this row is what stops a later reader "improving" that to use the date.

**Required test cases:** `leafPaths` on a hand-built fixture schema with an array of objects, an optional, a record and a discriminated union returns exactly the expected wildcard paths; a path present on only one union variant appears; `assertFieldAccounting` fails naming an unclassified path; it fails naming a stale classified path no schema emits; both real schemas pass with the completed table.

- [ ] **Step 1: Write the failing tests**, including the hand-built fixture schema covering all five node kinds
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `accounting.ts`**
- [ ] **Step 4: Complete the classification table** for every path the walker emits from the two real schemas
- [ ] **Step 5: Prove the guard bites.** Add a new optional field to a nested variant of `verificationResultSchema` — for instance `challenges[].confidence` — confirm `npm test` fails naming exactly that path, then revert and confirm green. This is the B1b-i `missReason` scenario reproduced deliberately; record both outputs.
- [ ] **Step 6: `npm test && npm run typecheck`, then commit**

---

## Self-review

**Spec coverage.** §3's two variants and referential validation are Task 3. §3.1's registry, historical mappings and no-overwrite property are Task 1. §4's staleness set and the `revoked` exclusion are Task 4; §4.1's `stale_result` and the canonical semantic hash are Tasks 4 and 2. §4's projection is Task 5. §6's six roles, path-level classification and zod-derived guard are Task 6.

**Deferred to B1b-ii-b, correctly.** The sign and revoke CLIs, post-write verification, the review sheet, `minStatus`, the public migration and both goldens. Renormalising raw bytes to resolve `normalizer_changed` is B1b-ii-b's, and Task 4 detects the condition without resolving it.

**Known scope edge, stated.** `CurrentState.resultSha256` is non-nullable, which makes the missing-result case unrepresentable in `deriveStaleness`. That is deliberate — it is an integrity failure and belongs to the caller — but it means B1b-ii-b must raise it, and nothing in *this* plan enforces that. Task 4's JSDoc records the obligation; the enforcement lands with the CLI.

**Type consistency checked.** `SigningEntry`/`RevocationEntry`/`LedgerEntry` are defined in Task 3 and consumed unchanged in Tasks 4, 5 and 6. `StalenessReason` is defined in Task 4 and widened to `StatusReason` in Task 5 by union with `'revoked' | 'unsigned'`. `canonicalJson` is defined in Task 2 and used by Task 3's `entryId`. `verificationResultSchema` and `ledgerEntrySchema` are exported by Tasks 2 and 3 for Task 6 to walk.
