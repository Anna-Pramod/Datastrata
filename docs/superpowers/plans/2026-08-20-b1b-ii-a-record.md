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
- **Program-agnostic.** No regulation name in `src/`. `grep -ri csrd backend/engine/src/` must not gain a hit beyond the **five** pre-existing ones, verified at Task 1: `types.ts` comment (1), `cli/assess.ts` pack path (1), `verification/render.ts` comments (2, both `CSRD-S-013`), `engine/summary.ts` comment (1). An earlier draft of this plan said three, having missed `render.ts`; the count is corrected here so the constraint stays checkable rather than raising a false alarm on every later task.
- **`src/verification/` is pure** — no filesystem, network or clock. Loading from disk belongs to `src/knowledge/loader.ts` and to tests.
- **Every file starts with a JSDoc block saying *why* the file exists**, not what it does — match `src/corpus/store.ts`.
- **Invisible or visually ambiguous characters in code are escape sequences** (non-breaking spaces, combining marks, zero-width). Visible punctuation stays literal.
- **Commit message style is imperative sentence-case with no prefix.** No `Co-Authored-By` trailer.
- **`npm test` green before every commit.** No test performs a network fetch.
- Work from `backend/engine`. The suite stood at **477 tests** green at the start of this plan. It grows as tasks land — 532 after Task 1, 572 after Task 2 — so each task's baseline is the previous task's finishing count, not 477.

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
6. **`requirementSha256`'s domain is the *validated authored* requirement, before loader enrichment.** Hash the representation the pack's own zod schema returns — `requirementSchema.parse(raw)` — and **never** a hand-written list of authored fields. zod strips undeclared keys, so this single rule has both consequences the design needs: a future authored field added to the schema **automatically** enters the hash, and a loader-attached field such as `derivedStatus` or `statusReasons` **never** can, because it is not in the schema and is stripped before hashing.

   A whitelist would produce the same hashes today and rot the first time someone adds an authored field without thinking about signatures — silently, because a hash that fails to move looks exactly like content that did not change.

   The pack's `requirement` zod object is currently module-private in `src/knowledge/loader.ts`, which imports `node:fs`. Export it — extracting it and the schemas it depends on into a pure module if that is what it takes — so the hash function consumes the authoritative schema without `src/verification/` gaining a filesystem import. Do not copy it: a second copy is a second definition of what "authored" means, and they will diverge.

   **`requirementSha256` is not `requirementInputSha256`.** The existing `requirementInputSha256` in `canonical.ts` covers provisions, sources and the logical payload only — deliberately, so that editing `caution` does not invalidate a verification input. `requirementSha256` covers the whole authored record, because version integrity asks a different question: did *anything* the author wrote change without a version bump? Both exist and neither replaces the other. Put `requirementSha256` beside its sibling in `canonical.ts`, reusing the private `canonicalize` already there.

**Required test cases:** a clean pack and registry pass; a content edit without a bump fails naming the requirement; a bump without registration fails; re-registering the same `(id, version)` with a different hash throws; with the same hash is a no-op; two offenders are both named; `version: 0` and `version: 1.5` are rejected by the schema.

- [ ] **Step 1: Write the failing tests** for all five behaviours
- [ ] **Step 2: Run them; confirm they fail for the right reason**
- [ ] **Step 3: Implement `registry.ts`**
- [ ] **Step 4: Add `version: 1` to all 16 requirements and `version: number` to the `Requirement` type**
- [ ] **Step 5: Establish the hash domain before seeding anything.** The first registry is unavoidably trust-on-first-use — a correct and an incorrect SHA-256 look equally random, so reading the file proves nothing. What *is* independently establishable is what the hash covers. Write these tests first and get them green:
  - `requirementSha256` **moves** for an edit to every class of authored content: `title`, `plainEnglish`, `condition`, `sources`, `provisions`, `caution`, `obligationTemplates`, `severity`, `legalStatus`, `version`
  - it is **stable** under JSON key reordering and under whitespace or pretty-printing changes
  - it is computed over the **authored requirement only** — adding a loader-attached field such as `derivedStatus` or `statusReasons` to the object **must not** change it
  - it follows the **schema, not a list** — temporarily add a field to the authored requirement schema, set it on a requirement, and confirm the hash **moves**; then remove both. This is the test that fails if someone reintroduces a whitelist, and it is the only one of these that distinguishes the two implementations

  That last one is load-bearing for B1b-ii-b: if the hash covered loader-added fields, a status change would read as a requirement revision and every derived-status update would trip version integrity.
- [ ] **Step 6: Generate `verification/requirement-versions/csrd.json`** — 16 entries, each version `"1"`, computed with the now-characterised hash function
- [ ] **Step 7: Wire `assertVersionIntegrity` into the loader** so a mismatch fails `npm test`
- [ ] **Step 8: Prove the gate bites** — change one character in one requirement's `plainEnglish`, confirm `npm test` fails naming that requirement, revert, confirm green. Record both outputs.
- [ ] **Step 9: `npm test && npm run typecheck`, then commit**

---

### Task 2: The verification-result schema and its canonical hash

Spec §4.1. This is the interface B2's agents will produce. It does not exist yet, so this task defines it.

**Files:**
- Create: `src/verification/result.ts`
- Modify: `src/verification/canonical.ts` (add `canonicalJson`)
- Modify: `src/corpus/evidence.ts` (export the authoritative `evidenceItemSchema`)
- Test: `test/verification-result.test.ts`

**Interfaces:**
- Produces:
  - `canonicalJson(value: unknown): string` in `canonical.ts` — key-sorted, JSON-escaped, deterministic
  - `verificationResultSchema` (zod), exported for the accounting guard to walk
  - `type VerificationResult = z.infer<typeof verificationResultSchema>`
  - `assertResultConsistency(result: VerificationResult): void` — the cross-field semantic validator, throwing `ResultConsistencyError { problems: string[] }`; kept out of the schema so the schema stays walkable
  - `parseVerificationResult(raw: unknown): VerificationResult` — `verificationResultSchema.parse` then `assertResultConsistency`
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
coverage                       { cells: [{ direction, readingElementId?, conditionPath?, verdict, challengeId? }] }
challenges[]                   { id, lens, statement, verdict, evidence[], resolution? }
openQuestions[]                { id, statement }
gaps[]                         { kind, docId, detail }
narrative?                     string
```

**`evidence[]` consumes exactly one authoritative runtime schema, and it lives in `src/corpus/evidence.ts`.** That file today exports TypeScript interfaces only — `QuoteEvidence`, `AmendmentChainEvidence`, `CrossReferenceEvidence`, `AbsenceEvidence` and the `EvidenceItem` union — and no zod at all. **Create and export `evidenceItemSchema` there**, annotated `z.ZodType<EvidenceItem>` so the compiler holds the runtime schema against the existing interfaces, and import that exact schema into `result.ts`.

Do **not** define a mirror schema in `result.ts` and reconcile the two with a round-trip test. A mirror is a second definition of one data contract, and a round-trip fixture only proves the two agree on the shapes that fixture happens to contain — which is the `missReason` failure again, one layer up.

The distinction B1a and B1b-i draw is between a shared **data contract** and a shared **derivation**. Sharing the contract is correct and is what this instruction requires: one definition of what an `EvidenceItem` *is*. What must stay independent are competing semantic **derivations** — the renderer against its feature checker, a result's hash against the ledger's. This task derives nothing from the evidence schema; it only validates against it, so there is no independence to preserve and a mirror buys nothing but drift.

`verdict` on a challenge is `'CONFIRMED' | 'MISMATCH' | 'OPEN_QUESTION'`. Coverage `verdict` is `'MAPPED' | 'UNMAPPED' | 'UNSUPPORTED' | 'UNCERTAIN'`. `direction` is `'reading_to_condition' | 'condition_to_reading'`.

**Four things the schema must represent, because the sign gate polices them and cannot police what is not there:**

**`openQuestions[]` carries no `blocking` flag.** The signing rule is that *any* outstanding `OPEN_QUESTION` blocks. A per-item `blocking: false` would introduce a second, competing policy and let a result declare its own open question harmless. If non-blocking observations are ever wanted, they are a different concept and get their own field — they are not open questions with a flag turned off.

**`gaps[]` is structural.** `gaps[].kind` is `'corpus_gap' | 'closure_gap'`, with the `docId` and a detail string. The sign CLI must refuse an unresolved gap, and leaving B1b-ii-b to infer gaps from transcripts would make a refusal depend on prose. An empty array is the normal case.

**Adverse coverage must name the challenge that addresses it.** A `coverage.cells[]` entry whose `verdict` is `UNMAPPED`, `UNSUPPORTED` or `UNCERTAIN` **must** carry a `challengeId`, and `parseVerificationResult` must reject a result where that id names no challenge in `challenges[]`. Without the link, a result could report `UNMAPPED` coverage while carrying no `MISMATCH` and no `OPEN_QUESTION` — and a sign gate looking only at verdicts would sign it, with the adjudicator's judgement silently bypassed. `MAPPED` cells carry no `challengeId`, and one supplying it is rejected.

**Ids are unique, and every internal reference resolves.** Added after Task 2's review, which probed the implemented contract and found four referential gaps still open. The serious one: `challenges[].id` was not unique, so an adverse cell could name an id carried by **two** challenges — one `CONFIRMED`, one `OPEN_QUESTION` — and a sign gate reading that link would have to guess which adjudicated the gap. That satisfies the letter of the rule above while defeating the reason it exists, which is the precise failure this project keeps rediscovering: a check that agrees with a systematic error.

So `assertResultConsistency` also enforces:

```
challenges[].id            unique
reading.elements[].id      unique
openQuestions[].id         unique
coverage.cells[].readingElementId   must resolve to a reading.elements[].id
```

The uniqueness rules come first in the reasoning, not the reference rules: resolution is only meaningful once an id names one thing. All four are semantic, so they live in `assertResultConsistency` alongside the others and the schema stays a walkable `ZodObject`.

**A legal conclusion with no evidence at all must be unrepresentable.** `checkEvidenceSet` in `src/corpus/evidence.ts` decides whether evidence is *valid*; this contract decides whether evidence *exists*. Those are different guarantees and the second cannot be delegated to the first, because `checkEvidenceSet([])` has nothing to reject and returns clean. So, structurally in the schema:

```
reading.elements[].evidence      .min(1)
challenges[].evidence            .min(1)
```

and semantically, keyed on the challenge verdict:

```
CONFIRMED       -> resolution required, and non-empty after trimming
MISMATCH        -> resolution required, and non-empty after trimming
OPEN_QUESTION   -> resolution may be absent; it is precisely what is unresolved
```

`resolution` therefore stays `.optional()` in the schema: the obligation is conditional on `verdict`, and forcing it structurally would either demand a resolution for an open question or wrap the object in a refinement. A present-but-blank `resolution: '   '` is a rejection, not a pass — whitespace is not an adjudication.

This is what makes `verification-result.json` a self-consistent record rather than a bag of pipeline outputs.

**Evidence must rest on the corpus this record itself pins, and absence is never enough on its own.** Added after Task 2b's review, which probed the contract and found three more gaps — one of them a guarantee the factory spec states as already enforced.

```
evidence: an `absence` item may never be the SOLE evidence for a conclusion
          — applies to reading.elements[] and to challenges[] alike
corpus[].docId                          must be unique
evidence quote docId                    must name a docId the record's own corpus[] pins
evidence quote sha256Normalized         must equal that pin's sha256Normalized
```

**Correction, from Task 2c's review — the absence control existed but was never reachable on the signing path.** `checkEvidenceSet` in `src/corpus/evidence.ts` has carried an absence-sole check all along. The defect was not a missing control but an unreachable one: `parseVerificationResult` → `resultSha256` → sign never calls `checkEvidenceSet`, so a record could be parsed, hashed and signed with that check never running. Duplicating the rule in `assertResultConsistency` is therefore correct rather than redundant — the record contract must hold on its own, because it is the contract the signing path actually goes through.

Two spec errors also worth fixing when either spec is next touched: factory §2.2 points at `src/verification/evidence.ts`, but the file is and always has been `src/corpus/evidence.ts`; and §2.2's claim that *"The schema enforces this"* remains inaccurate even now — the rule is enforced by `assertResultConsistency`, and it **cannot** live in the schema without wrapping it in a `ZodEffects` and making Task 6's walker unbuildable. Left uncorrected, that sentence invites someone to "fix" the discrepancy by moving the rule into a `.refine()`, which would break the field-accounting guard.

**The absence rule restated, and why `.min(1)` cannot carry it.** Factory spec §2.2: a deterministic search can establish that a phrase does not occur, but it cannot establish that the law contains no economically equivalent criterion under different words — that is a legal judgment. The spec says outright that *"an `absence` item cannot be the sole evidence for any conclusion"* and that *"the schema enforces this"*. Nothing did. `.min(1)` counts items and cannot tell one kind from another, so a conclusion resting entirely on "I searched and did not find it" parsed clean. This is the anti-hallucination control the whole corpus stage exists to serve, so it is closed here rather than deferred.

**The corpus rules close the same class the id rules closed, one layer down.** Two pins sharing a `docId` with different `sha256Normalized` means the record pins one document at two different texts, and a quote citing that `docId` then resolves to two authoritative sources — structurally the duplicate-challenge defect, sitting under the field that decides what a conclusion rests on. And a quote naming a `docId` no pin carries, or claiming a hash its own pin contradicts, means the evidence was taken from a text **the signature never froze**: freshness would then compare the pinned hash against the world while the reasoning rested on something else entirely.

`checkEvidenceSet` does not cover this. It validates quotes against the corpus **on disk**, which is a different question from whether the record is internally consistent with its own pins. Both checks are wanted; neither substitutes for the other. All four rules are in-record cross-field checks needing no I/O, so they live in `assertResultConsistency` and the schema stays a walkable `ZodObject`.

**The exported schema stays structurally walkable; every cross-field rule goes in a separate validator.** Task 6's guard walks `verificationResultSchema` and **throws on any zod node kind it does not recognise**, `ZodEffects` among them. So the exported root must **not** be wrapped in `.refine()`, `.superRefine()`, `.transform()` or `z.preprocess()` — and neither must any nested object inside it, since a refinement buried on `challenges` would hide every field beneath it from the walker. The layering is:

```
verificationResultSchema.parse(raw)      structure only, and walkable
        |
        v
assertResultConsistency(parsed)          deterministic, cross-field
        |
        v
parseVerificationResult(raw)             runs both, in that order
```

Every rule that reads two fields at once lives in the second stage: `coverage.cells[].challengeId` resolving to a real `challenges[]` id, the `MAPPED`-carries-no-`challengeId` rule, and the verdict/resolution pairing above. `assertResultConsistency` is a plain function over the parsed value — deterministic, no clock, no I/O, throwing an error that names **every** inconsistency rather than the first.

This is not a stylistic preference about where validation lives. A `.refine()` on the root makes Task 6's walker throw and the field-accounting guard unbuildable; the guard is the acceptance test that closes the `missReason` class, so a schema that cannot be walked forfeits it.

**Prove the seam exists.** Write a test in which `verificationResultSchema.parse(fixture)` **succeeds** while `parseVerificationResult(fixture)` **throws**, on a record that is structurally valid but semantically inconsistent — an `UNMAPPED` cell naming a `challengeId` no challenge carries. If that test cannot be written, the two stages have been collapsed into one and Task 6 will not be able to walk the schema.

**Required behaviours:**

1. **`canonicalJson` is key-sorted and escaped**, never delimiter-joined. Recursive through objects and arrays; array order preserved (order is meaning), object key order normalised (order is not).
2. **`resultSha256` is a canonical *semantic* hash**: `parse → validate → canonicalJson → sha256Hex`. It must **not** hash the raw file. Reformatting the file, or reordering its keys, must produce the identical hash — otherwise cosmetic churn becomes a trust alarm, which is the raw-versus-normalized lesson from the corpus applied one layer up.
3. **All zod objects are `.strict()`.** An unknown key is a validation failure, not a silently dropped field — that is how `missReason` escaped in B1b-i.

**Required test cases:** key reordering yields an identical `resultSha256`; whitespace/pretty-printing yields an identical hash; changing a challenge `verdict` changes the hash; changing an `evidence[]` item changes the hash; an unknown top-level key is rejected; an unknown key nested inside `challenges[]` is rejected; the `EvidenceItem` round-trip agrees with `src/corpus/evidence.ts`.

**Plus, for evidence and corpus pins:** a reading element whose only evidence is an `absence` item is rejected; a challenge whose only evidence is an `absence` item is rejected; an `absence` item **alongside a quote** is accepted, asserted separately so the rule cannot be satisfied by banning `absence` outright; two corpus pins sharing a `docId` are rejected; a quote naming a `docId` no pin carries is rejected; a quote whose `sha256Normalized` contradicts its own pin is rejected; a valid record whose quotes agree with their pins is accepted.

**Plus, for referential integrity:** two challenges sharing an id are rejected **even when no cell names it**, and the rejection is asserted separately from the case where an adverse cell does name it, so the uniqueness rule is not accidentally tested only through the resolution rule; two reading elements sharing an id are rejected; two open questions sharing an id are rejected; a cell whose `readingElementId` names no element is rejected; a valid record with several distinct ids is accepted.

**Plus, for the structural/semantic seam:** a structurally valid but semantically inconsistent fixture passes `verificationResultSchema.parse` and is rejected by `parseVerificationResult`; `assertResultConsistency` names every problem in a record carrying two distinct inconsistencies, not just the first; `verificationResultSchema` is not a `ZodEffects` — assert its `_def.typeName` is `'ZodObject'`, which is the regression test for someone later adding a root `.refine()`.

**Plus, for evidence:** a `reading.elements[]` entry with `evidence: []` is rejected; a `challenges[]` entry with `evidence: []` is rejected; a `CONFIRMED` challenge with no `resolution` is rejected; a `MISMATCH` challenge with `resolution: '   '` is rejected; an `OPEN_QUESTION` challenge with no `resolution` is accepted; the `evidenceItemSchema` imported into `result.ts` is the identical object exported by `src/corpus/evidence.ts`.

**Plus, for signability completeness:** an `UNMAPPED` cell with no `challengeId` is rejected; an `UNSUPPORTED` cell naming a challenge id absent from `challenges[]` is rejected; an `UNCERTAIN` cell naming a present challenge is accepted; a `MAPPED` cell carrying a `challengeId` is rejected; an `openQuestions[]` item carrying `blocking` is rejected by `.strict()`; a `gaps[]` entry with an unknown `kind` is rejected.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `canonicalJson` in `canonical.ts`**, and refactor `canonicalizeCondition` to use it if it does not already — one canonical serialiser, not two
- [ ] **Step 4: Export `evidenceItemSchema` from `src/corpus/evidence.ts`**, typed `z.ZodType<EvidenceItem>` against the interfaces already there
- [ ] **Step 5: Implement `result.ts`** — the structural schema, `assertResultConsistency`, and `parseVerificationResult` composing them in that order
- [ ] **Step 6: Focused tests green, then `npm test && npm run typecheck`**
- [ ] **Step 7: Commit**

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
  - `type UnsignedLedgerEntry = Omit<SigningEntry, 'entryId'> | Omit<RevocationEntry, 'entryId'>` — written explicitly as a union of omits, **not** `Omit<LedgerEntry, 'entryId'>`, which collapses a discriminated union into one object type carrying the union of all properties and loses the discrimination
  - `entryId(entry: UnsignedLedgerEntry): string` — canonical hash of the entry excluding `entryId` itself
  - `parseLedger(text: string): LedgerEntry[]` — the raw ledger text, one JSON object per line. It takes the **text**, not pre-split lines: the framing rule below is part of the contract, and a caller that splits for itself is free to `.filter(Boolean)` and quietly repair the file before this function ever sees it
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
4. **A malformed line fails the whole load**, naming the line number. An append-only file that nothing can rewrite must not be partially readable. `parseLedger` **collects every framing and parse problem and throws once**, as `LedgerIntegrityError` with its `problems: string[]` — matching `PackIntegrityError`'s existing idiom in `src/knowledge/loader.ts`. Failing on the first problem would make a damaged ledger take as many read-fix-read cycles as it has damaged lines, and the person doing that repair needs to see the extent of the damage before touching anything.
5. **JSONL framing is exact, and a blank line is damage rather than noise.** Split `text` on `\n` and judge each segment by physical position:

   | Segment | Verdict |
   |---|---|
   | The single trailing empty segment produced by a terminal `\n` | **valid** — a POSIX text file ends with a newline. Discard it, and discard **at most one** |
   | An empty segment anywhere else | **integrity failure**, naming the physical line number |
   | A segment of only whitespace, anywhere at all | **integrity failure**, naming the physical line number |
   | Anything else | parse as one JSON object |

   So `…}\n` is a well-formed ledger and `…}\n\n` is not: the second has an internal blank line. The empty string is an empty ledger and yields `[]`; a file consisting of a single `\n` is a failure, because it has one line and that line is empty.

   **Do not write `.filter(Boolean)`, `.filter(l => l.trim())`, or any equivalent.** The filter *is* the defect. A blank line inside an append-only ledger means an append was interrupted, two files were concatenated wrongly, or an entry was deleted by hand — and every one of those is a fact about the integrity of the history. Filtering converts each into a clean read, so the file that most needs to refuse to be read becomes the one that reads most smoothly.

   **Line numbers are physical and 1-based**: the number in an error must be the number a person sees opening the file in an editor. Count before discarding anything, never after — dropping segments and then indexing is exactly how an off-by-one enters, and a misreported line number in an append-only file sends the reader to the wrong entry.

**Required test cases:** empty ledger → `governingEntry` is `null`; two signings → the later governs; signing then revocation → the revocation governs; `revokes` naming a later entry is rejected; naming a different requirement is rejected; naming a different pack is rejected; naming another revocation is rejected; a duplicate `entryId` is rejected; a tampered `entryId` is rejected; a malformed line is rejected naming its line number; a `RevocationEntry` carrying `conditionSha256` is rejected by `.strict()`.

**Plus, for framing:** text ending in a single `\n` parses to exactly the same entries as the same text without it; a trailing `\n\n` is rejected; a blank line between two valid entries is rejected, naming its physical line number; a whitespace-only line is rejected, tested with both `'   '` and a line containing a tab; the empty string parses to `[]`; a lone `'\n'` is rejected. **And the one that catches a filtered implementation:** build a four-line ledger — a valid entry, a blank line, a malformed line, a valid entry — and assert the thrown error names **both** line 2 (blank) and line 3 (malformed). A `.filter(Boolean)` implementation reports neither: it drops line 2 silently and blames the malformed line on line 2. Asserting the pair, rather than just that it threw, is what makes this test able to fail against the defect it claims to detect.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail**
**Composition, decided at Task 3's review.** `parseLedger` runs framing and structural parsing first, throwing once with every framing problem, then calls `verifyLedgerIntegrity` on the parsed entries, throwing once with every referential problem. Both stay exported and independently testable.

The consequence is deliberate and worth stating plainly: **a ledger containing one tampered `entryId` cannot be read at all**, so B1b-ii-b's `revoke` CLI will refuse to operate on it. That is correct, and it does not conflict with "revocation must remain possible when things are broken". Spec §3's guarantee is that a revocation carries no *verification pins*, so withdrawal does not depend on a recomputable corpus or an intact result file. It is not a guarantee that a **compromised ledger** stays writable. If a stored `entryId` no longer matches its contents, the append-only history itself is in question, and appending a revocation to it would build a new authority claim on a foundation nothing can vouch for. The right response is human forensics on the file, not another append.

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
  - `CurrentState`, carrying `requirementInputSha256`, `conditionSha256`, `renderedConditionSha256`, `corpusClosureSha256` and `resultSha256` as `string`, plus `corpus: Array<{ docId, sha256Raw, sha256Normalized, normalizerVersion }>`. Written out here as prose because the shorthand an earlier draft used — `{ a, b, c: string }` — is not valid TypeScript: it types only the last member and leaves the rest as errors. Expand every field explicitly. (Task 4's review claimed Task 5's block had the same problem; it does not — `RequirementStatus` types both members explicitly. The hazard is real but confined to this one block.)
  - Note `CurrentState.corpus` omits `versionLabel`, which `SigningEntry.corpus` **does** pin. Deliberate: `versionLabel` is display, so a publisher re-labelling a byte-identical document must not fire a reason. The asymmetry between what is pinned and what is compared is otherwise silent, so it is stated here.
  - `deriveStaleness(entry: SigningEntry, current: CurrentState): StalenessReason[]` — sorted, deduplicated
  - `BLOCKING: ReadonlySet<StalenessReason>`
  - `blocks(reasons: StalenessReason[]): boolean`

**The authoritative trigger table** is factory spec §4.3, reproduced here because this plan never spelled every trigger out and Task 4's review found the omission:

| Reason | Trigger | Blocks |
|---|---|---|
| `source_reissued` | raw hash moved, normalized identical | advisory only |
| `stale_source_text` | normalized hash moved: the words changed | yes |
| `stale_encoding` | **`requirementInputSha256` or `conditionSha256` moved** | yes |
| `stale_render` | `renderedConditionSha256` moved | yes |
| `stale_closure` | `corpusClosureSha256` moved | yes |
| `stale_result` | `resultSha256` moved (§4.1) | yes |
| `normalizer_changed` | pinned `normalizerVersion` differs, per document | yes |

Note `stale_encoding` is **one reason fired by two different fields**, so both triggers need independent tests — exercising only one leaves the other wholly uncovered. And `stale_render` derives from the output hash, never from `rendererVersion`: a renderer bump that does not change this rule's English must not invalidate a signature. `CurrentState` carries no `rendererVersion`, deliberately.

**Required behaviours:**

1. **Returns a set, never a ranked primary.** `stale_encoding` and `stale_source_text` co-occur when a condition was corrected *and* the law's text moved, and both must appear. A precedence order would invent which is "the" reason and hide the other from the person deciding what to do. Return sorted and deduplicated so comparison is stable.
2. **`deriveStaleness` never returns `revoked`.** Revocation is not staleness — nothing moved under a revoked signature; a person withdrew authority. `revoked` is not a member of `StalenessReason`, so this is enforced by the type, not by discipline.
3. **`source_reissued` is advisory** — raw hash moved, normalized identical. It is **not** in `BLOCKING`. Everything else is.
4. **`normalizer_changed`, and the comparison order it forces.** Normalized hashes produced by *different* normalizer versions are not comparable — asserting `stale_source_text` from them would claim the law's text changed on the evidence of an algorithm change. So the rule is **per document, in this order**:

   ```
   if entry.normalizerVersion !== current.normalizerVersion
       → normalizer_changed, and infer nothing further for this document
   else if sha256Normalized differs
       → stale_source_text
   else if sha256Raw differs
       → source_reissued
   ```

   Different documents in the same closure still contribute independently, so a set may carry `normalizer_changed` for one document and `stale_source_text` for another. What must never happen is both for the *same* document.

   Detection is where this task stops. Renormalising the retained raw bytes to decide whether the text actually moved resolves `normalizer_changed`, and that is B1b-ii-b's work.

   **A named contradiction with the specs, resolved here so it is not rediscovered as a bug.** Found at Task 4's review. Factory spec §4.3 defines `normalizer_changed` as the *outcome of renormalising*: the checker renormalises the stored raw bytes under the new normalizer and compares, and **"Identical means still `fresh`"**. Under that definition a version bump alone is not a reason at all. Record-design §4 then says "States are as the factory spec §4.3 defines them", pulling those semantics in by reference. This plan says the opposite: any version difference fires `normalizer_changed`, and a required test asserts that a version change with an identical normalized hash **still** yields it.

   The two disagree on the same input, and this plan governs for B1b-ii-a. The disagreement is forced rather than chosen: `deriveStaleness` is pure and receives only hashes, so it **cannot** renormalise — that needs the raw bytes and the normalizer itself. The spec's definition is unimplementable at this layer.

   So at this layer `normalizer_changed` carries the weaker meaning *"the normalizer version moved and whether the text moved with it is not yet determined"*, not §4.3's *"the normalizer's opinion of the text changed"*. Both are blocking, so B1b-ii-a errs **conservative**: it blocks a superset of the cases §4.3 would block and can never wrongly report `verified`. The cost is false alarms, not unsoundness.

   **The obligation this creates for B1b-ii-b, stated so it cannot be missed:** as shipped here, a normalizer bump blocks **every signature in the pack**, which is precisely the alarm-fatigue failure the raw-versus-normalized split exists to prevent — an operator who learns to dismiss the alarm has no alarm. B1b-ii-b must narrow it by renormalising the retained raw bytes and dropping the reason where the normalized text is unchanged, restoring §4.3's definition. Until it does, this reason is only correct as an intermediate state.
5. **`stale_result`** fires when `current.resultSha256` differs from `entry.resultSha256`. A **missing** result file is not a staleness reason — the caller raises an integrity failure before calling, exactly as a missing pinned corpus document does. `CurrentState.resultSha256` is therefore non-nullable, and that is deliberate: the type makes the integrity case unrepresentable here.
6. **A document present in the entry's `corpus[]` but absent from `current.corpus`** is likewise an integrity concern, not staleness. Document this in the JSDoc; do not add a reason for it.

**Two traps in factory §4.3's table, both found at Task 4's review.** It lists `fresh` as a state — it is **not** a `StalenessReason` here, and adding it would turn `reasons.includes('fresh')` into a freshness test that disagrees with the set itself. And the table omits `stale_result` entirely, which record-design §4.1 adds; anyone implementing from §4.3 alone would ship the exact hole §4.1 exists to close.

**Required test cases:** every reason fires individually; `stale_encoding` + `stale_source_text` both present when both apply; `source_reissued` alone does not block; `stale_result` fires on a differing result hash and blocks; identical state yields an empty set; the returned array is sorted and deduplicated.

**Plus, for the comparison order:** a document whose `normalizerVersion` differs **and** whose normalized hash differs yields `normalizer_changed` **only** — never `stale_source_text` alongside it for that document; a two-document closure where one has a version change and the other has genuinely moved text yields both reasons; a version change with an identical normalized hash still yields `normalizer_changed`.

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
  - `type StatusReason = StalenessReason | 'revoked'`
  - `interface RequirementStatus { derivedStatus: DerivedStatus; statusReasons: StatusReason[] }`
  - `deriveStatus(governing: LedgerEntry | null, staleness: StalenessReason[]): RequirementStatus`

**Required behaviours:**

1. **No governing entry** → `{ derivedStatus: 'draft', statusReasons: [] }` — an **empty** reason set, not `['unsigned']`. `draft` already expresses the absence of signing authority, and adding a reason would break B1b-ii-b's migration golden, whose one sanctioned transformation is `ratificationStatus: 'draft'` → `derivedStatus: 'draft', statusReasons: []`. A reason here would force the adapter to normalise it away, which is how a small invention becomes a permanent fixture. Status and staleness are two axes: an unsigned requirement has nothing for staleness to be about.
2. **A `RevocationEntry` governs** → `{ derivedStatus: 'draft', statusReasons: ['revoked'] }`, **without consulting staleness at all**. A revoked signature's freshness is irrelevant and computing it would imply otherwise.
3. **A `SigningEntry` with no blocking staleness** → `derivedStatus` equals the entry's `kind`, `statusReasons` carries any advisory reasons (`source_reissued`).
4. **A `SigningEntry` with blocking staleness** → `{ derivedStatus: 'draft', statusReasons: <the full set> }`. The reasons travel with the status so every surface can say *why*, rather than merely refusing.
5. **Pure and total** — every input combination returns a value; no throws.

**Required test cases:** each of the four cases above; **no governing entry yields exactly `[]`, asserted with `toEqual([])` rather than a length check**; a blocked signing entry carries all its reasons, not one; an advisory-only entry keeps its `kind` and still reports `source_reissued`; a revocation ignores a non-empty staleness array passed alongside it.

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
- Consumes: `verificationResultSchema` (Task 2); `ledgerEntrySchema`, `signingEntrySchema`, `revocationEntrySchema` (Task 3).
- Produces:
  - `type FieldRole = 'authority' | 'signability' | 'freshness' | 'integrity' | 'display' | 'audit'`
  - `accountablePaths(schema: z.ZodTypeAny): string[]` — every accountable path, sorted
  - `FIELD_ROLES: Record<string, FieldRole[]>` — the classification table, **schema-qualified**
  - `assertFieldAccounting(schemas: Record<string, z.ZodTypeAny>): void` — throws naming every discrepancy
  - `class FieldAccountingError extends Error { problems: string[] }`

**The six roles** carry the meanings in spec §6.1. Note especially: **`freshness` means the field participates in freshness derivation, not that it invalidates.** `corpus[].sha256Raw` participates and yields `source_reissued`, which is advisory — a role called `staleness` defined as "invalidates" would misdescribe it, and misdescription in this table is how the last hole opened.

**Accountable paths, not leaf paths.** An earlier draft emitted only leaves while the table named containers like `openQuestions[]` — a contradiction that could not validate, since the guard also rejects classified paths no schema emits. The container is not an accident of notation: **whether `openQuestions[]` is non-empty decides signability**, and a leaf-only model cannot express collection cardinality. So the walker emits **both a semantic container and its descendants**:

```
openQuestions[]                  signability
openQuestions[].id               audit
openQuestions[].statement        display, audit
```

Read that example carefully, because an earlier wording invited a wrong reading. The array at key `openQuestions` emits **`openQuestions[]`** and nothing else at that level — there is no bare `openQuestions` row. "The container is emitted too" means the `[]` form *is* the container path, distinct from its descendants; it does **not** mean emit both `openQuestions` and `openQuestions[]`. Emitting both would contradict the verbatim table below, which classifies only the `[]` form.

**A container's role never covers its descendants.** A new nested field still requires its own classification — otherwise "the container is accounted for" becomes the same excuse "the op has a handler" was in B1b-i.

**Schema-qualified keys.** Classifications are namespaced by schema, so `result.requirementVersion` and `ledger.signing.requirementVersion` are distinct rows. A bare `requirementVersion` key would let a role appropriate to one artifact silently govern the other.

**The traversal, and it fails closed.** zod 3.25.76 is installed; its internals were probed directly for this plan:

| Node | How to descend | Emits a path segment? |
|---|---|---|
| `ZodObject` | `_def.shape()` → record of children | yes, the key |
| `ZodArray` | `_def.type` → element schema | yes: emit `<path>[]`, **then** descend, appending `.key` to that same `[]` form |
| `ZodRecord` | `_def.valueType` → value schema | yes, `{}` — container emitted too |
| `ZodOptional` / `ZodNullable` / `ZodDefault` | `_def.innerType` — unwrap | no |
| `ZodDiscriminatedUnion` | `_def.options` is an **array**; descend every option, union the results | no |
| `ZodUnion` | `_def.options` array; descend all | no |
| `ZodString` `ZodNumber` `ZodBoolean` `ZodLiteral` `ZodEnum` | terminal | yes, the leaf |
| **anything else** | **throw** | — |

**An unrecognised node kind must throw, never be treated as a leaf.** If someone later wraps an object in `ZodEffects` for a refinement, silently classifying the whole composite as one leaf would hide every field beneath it — which is exactly the `missReason` failure, reproduced by a walker that guesses instead of refusing.

**Required behaviours:**

1. **`accountablePaths` derives from the runtime zod schema, never from a TypeScript interface.** TypeScript disappears at runtime and cannot be walked; zod exists and can. That is the whole reason the guard can be complete.
2. **Descends into arrays, optionals, discriminated unions and records** with wildcard segments, emitting containers *and* descendants.
3. **Throws on an unrecognised node kind**, naming the `typeName` and the path where it was found.
4. **`assertFieldAccounting` fails in both directions**, naming every discrepancy: a path a schema emits with no classification, **and** a classified path no schema emits. A stale classification is a lie about the shape that hides a removal.
5. **Both discriminated-union variants are covered.** A path present only on `RevocationEntry` must still be classified.

**The classification table** starts from spec §6.2, schema-qualified. These are given verbatim and must be used verbatim:

```
ledger.signing.kind                          authority
ledger.signing.packId                        authority
ledger.signing.requirementId                 authority
ledger.signing.entryId                       integrity, audit
ledger.signing.requirementVersion            integrity, audit
ledger.signing.requirementSha256             integrity, audit
ledger.signing.requirementInputSha256        freshness, audit
ledger.signing.conditionSha256               freshness, audit
ledger.signing.renderedConditionSha256       freshness, audit
ledger.signing.rendererVersion               audit
ledger.signing.corpusClosureSha256           freshness, audit
ledger.signing.corpus[]                      freshness, audit
ledger.signing.corpus[].docId                integrity, audit
ledger.signing.corpus[].sha256Normalized     freshness, audit
ledger.signing.corpus[].sha256Raw            freshness, audit
ledger.signing.corpus[].normalizerVersion    freshness, audit
ledger.signing.resultSha256                  freshness, integrity, audit
ledger.signing.pipelineVersion               signability, audit
ledger.signing.packVersion                   integrity, audit
ledger.signing.corpus[].versionLabel         display, audit
ledger.signing.by                            display, audit
ledger.signing.on                            display, audit
ledger.signing.note                          audit
ledger.revocation.kind                       authority
ledger.revocation.packId                     authority
ledger.revocation.requirementId              authority
ledger.revocation.revokes                    authority, integrity
ledger.revocation.entryId                    integrity, audit
ledger.revocation.by                         display, audit
ledger.revocation.on                         display, audit
ledger.revocation.reason                     display, audit
result.openQuestions[]                       signability, display
result.challenges[].verdict                  signability, display
result.challenges[].evidence[]               signability, audit
result.gaps[]                                signability
result.pipelineVersion                       signability, audit
result.resultSchemaVersion                   integrity, audit
```

Three of those rows were added after Task 3's review, which found the plan's block silently incomplete against spec §3's entry shape: `packVersion`, `corpus[].versionLabel` and `note` are required fields the schema necessarily emits, and a table missing a path the walker emits fails the guard in the unclassified direction. `note` is `audit` per spec §6.2 line 48. `packVersion` is `integrity` rather than `freshness` because nothing derives staleness from it — it identifies which pack build was signed, which is what `integrity` means here. `versionLabel` is the human-readable edition of a document and decides nothing, so it is `display, audit` while the hashes beside it carry `freshness`.

`result.openQuestions[]` is `signability, display`, corrected from `signability` to match spec §6.2, which the plan's block had narrowed. The container's emptiness is both what the sign gate reads and what the review sheet shows a person.

`on` is `display, audit` and deliberately **not** `authority` — Task 3 orders by file position, and this row is what stops a later reader "improving" that to use the date.

For every remaining path the walker emits, choose a role and **state your reasoning in the report**. The result schema will produce considerably more than the rows above — `result.reading.elements[].statement`, `result.coverage.cells[].verdict` and so on — and those are where a wrong role is most likely to land unnoticed, so they are the ones to justify explicitly rather than fill in quietly.

**Required test cases:** `accountablePaths` on a hand-built fixture schema containing an array of objects, an optional, a record and a discriminated union returns exactly the expected paths, **containers included**; a path present on only one union variant appears; an unrecognised node kind (wrap something in `z.preprocess` or `.refine()` to produce a `ZodEffects`) **throws** naming the type and path; `assertFieldAccounting` fails naming an unclassified path; it fails naming a stale classified path; a container's role does not satisfy a descendant's requirement; both real schemas pass with the completed table.

- [ ] **Step 1: Write the failing tests**, including the fixture schema covering all node kinds and the throw-on-unknown case
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `accounting.ts`**
- [ ] **Step 4: Complete the classification table** for every path the walker emits from both real schemas, justifying each addition beyond the verbatim rows
- [ ] **Step 5: Prove the guard bites, twice.** First add a new optional field to a nested variant of `verificationResultSchema` — for instance `challenges[].confidence` — and confirm `npm test` fails naming exactly that path. Then wrap a nested object in `.refine()` and confirm the walker **throws** rather than silently collapsing it to a leaf. Revert both; confirm green. The first is the B1b-i `missReason` scenario reproduced deliberately; the second is the way a future refactor would reopen it. Record all outputs.
- [ ] **Step 6: `npm test && npm run typecheck`, then commit**

**Decisions taken at Task 6's implementation and review, recorded so they can be overturned deliberately rather than by accident:**

1. **A plain `ZodObject` emits no row of its own.** The traversal table's "yes, the key" for `ZodObject` is ambiguous between "contributes a key to its children's paths" and "is itself a row". It is the former: `result.reading` and `result.coverage` are not classifiable paths, while `result.reading.elements[]` is. Two things settle it — the verbatim table contains no plain-object row anywhere, and the stated reason for emitting containers is collection **cardinality** (*"whether `openQuestions[]` is non-empty decides signability"*), which an object does not have. Its presence is fixed by the schema.

2. **`accountablePaths` needs a prefix argument.** The declared signature `(schema: z.ZodTypeAny): string[]` cannot produce schema-qualified keys like `result.*`. An optional second parameter defaulting to `''` keeps the declared signature valid. `assertFieldAccounting` needs the same for an injectable roles table, or the required failure-mode tests cannot be written without mutating the module-level one.

3. **`ledgerEntrySchema` must NOT be handed to `assertFieldAccounting`, despite being listed among Task 6's consumed interfaces.** Walking the union under any single name emits merged rows (`ledger.entryId`, `ledger.kind`, …) that the verbatim table does not carry, so the guard would fail in the unclassified direction *against its own required table* — a contradiction inside this section. Walk `signingEntrySchema` and `revocationEntrySchema` separately under `ledger.signing` and `ledger.revocation`, and cover the union traversal by test: assert the union walk equals the union of the two variant walks and contains both a signing-only and a revocation-only path.

4. **The `corpus[]` roles differ between the ledger and the result, deliberately — the single row most worth a reviewer's attention.** Spec §6.2's table is unqualified (`corpus[].sha256Raw — freshness + audit`) and this plan qualifies it only as `ledger.signing.*`, but the result schema carries a `corpus[]` with identical field names. The ledger's copy is `freshness` because `deriveStaleness(entry, current)` genuinely reads it. Nothing reads the **result's** copy — it is the value that later gets pinned — so it is `audit`, and giving it `freshness` would assert a derivation nobody implemented. `result.corpus[].sha256Normalized` is `signability` rather than `audit` because every quote's hash is checked against it before signing; `sha256Raw` has no such in-record role. **No result-side path carries `freshness` at all**, per record-design §4.1: any post-signing edit anywhere in the record moves the enclosing `resultSha256` and surfaces as `stale_result`, so a second independent freshness derivation would be exactly the misdescription §6 exists to prevent.

5. **A zod *discriminant* is `authority`; a plain enum a gate merely branches on is not.** `evidence[].kind` selects which shape applies, so it routes — `authority`. `challenges[].verdict` and `gaps[].kind` are branched on but select nothing structural, so they are not.

**Two spec errors to fix when §6 is next touched.** §6.3 says the guard "enumerates every **leaf** path" — the leaf-only model is the earlier draft error this plan already corrects, and an implementer reading the spec alone would build a leaf-only walker and then find `openQuestions[]`, `gaps[]`, `corpus[]` and `challenges[].evidence[]` unemittable. And note `z.lazy` is absent from the traversal table; it correctly falls into "anything else → throw", which is now pinned by a test so any future convenience case has to be added deliberately.

**A name collision worth knowing before re-running Step 5.** Task 2's test *"rejects an unknown key nested inside `challenges[]`"* uses `confidence` as its unknown key — the same name this plan nominates for the teeth check. Adding the field legitimately makes `.strict()` accept it, so Step 5 produces **three** failures rather than two. The extra one is not a defect; two independent tests biting on one mutation is the guard and the schema agreeing.

---

## Self-review

**Spec coverage.** §3's two variants and referential validation are Task 3, with `entryId` taking an explicit union of omits rather than `Omit` over the union, which would collapse the discrimination. §3.1's registry, historical mappings and no-overwrite property are Task 1. §4's staleness set and the `revoked` exclusion are Task 4; §4.1's `stale_result` and the canonical semantic hash are Tasks 4 and 2. §4's projection is Task 5. §6's six roles, path-level classification and zod-derived guard are Task 6.

**Deferred to B1b-ii-b, correctly.** The sign and revoke CLIs, post-write verification, the review sheet, `minStatus`, the public migration and both goldens. Renormalising raw bytes to resolve `normalizer_changed` is B1b-ii-b's, and Task 4 detects the condition without resolving it.

**Known scope edge, stated.** `CurrentState.resultSha256` is non-nullable, which makes the missing-result case unrepresentable in `deriveStaleness`. That is deliberate — it is an integrity failure and belongs to the caller — but it means B1b-ii-b must raise it, and nothing in *this* plan enforces that. Task 4's JSDoc records the obligation; the enforcement lands with the CLI.

**Type consistency checked.** `SigningEntry`/`RevocationEntry`/`LedgerEntry`/`UnsignedLedgerEntry` are defined in Task 3 and consumed unchanged in Tasks 4, 5 and 6. `StalenessReason` is defined in Task 4 and widened to `StatusReason` in Task 5 by union with `'revoked'` only — there is no `'unsigned'` reason, because an unsigned requirement returns an empty set. `canonicalJson` is defined in Task 2 and used by Task 3's `entryId`. `verificationResultSchema` and `ledgerEntrySchema` are exported by Tasks 2 and 3 for Task 6 to walk.
