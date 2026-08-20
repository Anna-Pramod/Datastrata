# B1b-ii — The record: ledger, derived status, signing, and the public migration

**Date:** 2026-08-20
**Status:** Design approved, ready for implementation planning
**Refines:** `2026-08-20-verification-factory-design.md` §4. Where the two differ, this document governs; §4.5's refusal list has been corrected in place.
**Scope:** Program-agnostic. Two plans: **B1b-ii-a (the record)** and **B1b-ii-b (signing, surfaces, migration)**.

---

## 1. What this builds, and what makes it risky

B1a snapshotted the law. B1b-i made a rule arguable in English and proved the English says what the encoding says. This plan makes a human's judgement about that pair **recordable, derivable and revocable** — and then moves the public site from an asserted status to a derived one.

That last part is the first change in this project that alters what a customer-facing surface reads. Everything before it was additive.

**Current state.** All 16 CSRD requirements assert `ratification.status: "draft"`. Seven code sites consume it, three semantically:

| Site | Role |
|---|---|
| `evaluate.ts:42` | Filters requirements: `includeDraft \|\| status === 'ratified'` |
| `evaluate.ts:172` | Stamps `ratificationStatus` onto every determination |
| `evaluate.ts:183` | `containsDraftContent` — drives the prototype banner |
| `loader.ts:126` | Zod schema asserting the field |
| `types.ts` ×2 | `Ratification`, and `Determination.ratificationStatus: 'draft' \| 'ratified'` |
| `frontend/web/lib/pack.ts:53` | Counts ratified for display |

**A finding that shapes the migration:** `includeDraft` defaults to `true` and **no caller anywhere passes it**. The filter is inert today. Meanwhile `evaluate.ts:28` documents that *"customer-warranted output must run with includeDraft=false"* — which, with zero ratified requirements, returns an empty assessment. The documented safe mode is a mode that answers nothing.

---

## 2. Architecture

Five modules under `backend/engine/src/verification/`, each with one job.

| Module | Responsibility |
|---|---|
| `result.ts` | `verification-result.json` zod schema and validation — the interface B2's agents will produce |
| `ledger.ts` | Parse `signatures.jsonl`; resolve the governing entry per `(packId, requirementId)` |
| `staleness.ts` | Governing entry + current state → the **set** of reasons |
| `status.ts` | Governing entry + staleness set → `derivedStatus` and `statusReasons[]` |
| `accounting.ts` | Field classification and its completeness guard |

Plus `cli/sign.ts` and `cli/review-sheet.ts` in B1b-ii-b.

**No generated projection file.** An earlier draft proposed `ratification-status.generated.json` for surfaces that cannot run the loader. There are none: `frontend/web/lib/pack.ts` imports `loadPack` from the engine. Building it would create a second apparent source of truth for no consumer. If one ever appears, the file must carry `GENERATED — DO NOT EDIT` plus `sourceLedgerSha256`, `packSha256` and `generatedByVersion`, and its consumer must reject it when those pins no longer match.

---

## 3. The ledger

`verification/signatures.jsonl`, append-only, one JSON object per line, never rewritten.

**Entry shape:**

```
entryId            content hash of the entry's canonical form, excluding entryId itself
kind               'verified' | 'ratified' | 'revoked'
packId, packVersion
requirementId, requirementVersion, requirementSha256
requirementInputSha256, conditionSha256
renderedConditionSha256, rendererVersion
corpusClosureSha256
corpus[]           { docId, versionLabel, sha256Raw, sha256Normalized, normalizerVersion }
resultSha256, pipelineVersion
by, on, note?
revokes?           entryId of the signing event this withdraws — required when kind is 'revoked'
```

**Authority: the last line matching `(packId, requirementId)` governs.** Ordering is by **file position**, never by `on`. Dates collide, can be mistyped, and are supplied by the signer; position is a property of the append-only file itself. `on` is display and audit only, and §6 records that classification so nobody later "improves" the ordering to use it.

**Revocation identifies its target.** File position already determines *what the current state is*. `revokes` answers a different question — *which historical decision did a human intend to withdraw* — and both are wanted for auditability. Validation, all enforced at load:

- `revokes` must name an `entryId` appearing **earlier** in the ledger
- the target must share the same `packId` and `requirementId`
- the target must be a signing event (`verified` or `ratified`), **not another revocation** — un-revoking is expressed by appending a fresh signature, not by revoking a revocation
- `revokes` is required when `kind` is `revoked` and forbidden otherwise

A `revoked` governing entry yields `derivedStatus: 'draft'` with reason `revoked`.

---

## 3.1 `requirementVersion` and the version-integrity registry

The entry pins `requirementVersion`, which does not exist yet. `pack.json` carries one version for the whole pack — too coarse to name a requirement revision, and the ledger has to be portable across CSRD, CBAM and country packs.

Each requirement gains `version`, an integer **bumped by hand** as part of any content edit. A generated version cannot distinguish a revision from a reformat, which is the distinction that matters here.

The factory spec mandates a machine backstop: content changing without a version bump must fail the build. That needs a record of what content each version described, and none exists — an unsigned requirement has no ledger entry to compare against. So B1b-ii-a adds:

```
verification/requirement-versions/<packId>.json
```

**It lives under `verification/`, not under `knowledge/`.** The requirement remains authoritative for its own content; this registry only enforces that a declared version stays bound to the content hash it originally named. Putting it beside authored regulatory knowledge would invite reading it as content.

**It retains every historical mapping, not just the latest pair:**

```json
{
  "CSRD-S-001": { "1": "sha256:A", "2": "sha256:B", "3": "sha256:C" }
}
```

So a version number acquires permanent meaning and cannot quietly be reused for different content. The requirement's current `version: 3` must match the hash recorded for version 3 — not merely "the most recent hash we saw".

The loader fails when a requirement's current `requirementSha256` differs from the hash recorded against its current `version`. Editing content without bumping fails; bumping without registering the new hash fails from the other side; re-using an old version number for new content fails against the historical record.

**This is a version-integrity registry, never a status source.** It is classified `integrity` in §6: the loader refuses the pack on its evidence, which is more than audit and less than authority — it can stop a load, and it can never decide a status.

---

## 4. Derived status and staleness

**Staleness returns a set, never a ranked primary.** `stale_encoding` and `stale_source_text` co-occur when a condition was corrected *and* the law's text moved; a precedence order would have to invent which is "the" reason and would hide the other from the person deciding what to do. `blocks` is a predicate over the set.

States are as the factory spec §4.3 defines them, plus `stale_result` (§4.1). `INTEGRITY_FAILURE` is not a member — it is a separate category with its own exit code, per §4.4.

**`revoked` is not a staleness reason and `deriveStaleness()` never returns it.** Nothing moved underneath a revoked signature; a human deliberately withdrew its authority. Conflating the two would blur the distinction the ledger exists to record:

> staleness = the world moved · revocation = a person withdrew authority

`deriveStatus(governingEntry, staleness)` handles it instead: a governing entry of kind `revoked` yields `derivedStatus: 'draft'` with `statusReasons: ['revoked']`, without consulting staleness at all.

### 4.1 `stale_result` — the rule the pinned result was missing

The entry pins `resultSha256`, and without a corresponding validity rule that pin does nothing. The failure it leaves open:

> Sign with `challenges[0].verdict = CONFIRMED`. Afterwards, edit `verification-result.json` so that verdict reads `MISMATCH`. The condition, the corpus and the rendering are all untouched, so no other freshness comparison fires — and the signature keeps producing `verified` over a result that now says the opposite of what was signed.

So: **`stale_result` fires when the current `verification-result.json` hash differs from the governing entry's `resultSha256`, and it blocks.** If the pinned result file is absent entirely, that is an `INTEGRITY_FAILURE`, exactly as a missing pinned corpus document is — a signed artefact cannot vanish through ordinary drift.

**This is why nested result fields do not each need their own freshness rule.** `challenges[].evidence[]` is `signability` — evidence validity is checked before signing — and `audit` thereafter. Any post-signing edit to it changes the enclosing `resultSha256` and surfaces as `stale_result`. One invalidation mechanism, rather than re-implementing freshness independently for every field inside the result.

**Projection.** `derivedStatus` is `draft | verified | ratified`, with `statusReasons[]` attached. A blocking reason withholds `verified` and yields `draft` **carrying its reasons**, so every surface can say *why* rather than merely refusing. No ledger entry means `draft` with an empty reason set — status and staleness are two axes and they do not overlap.

---

## 5. Signing

**One frozen derivation.** `buildSignature()` reads pack, corpus, result and renderer **once** and returns an immutable candidate. Every precondition runs against that object, and the appended line is that object serialised. There is no window between checking and writing, because the checked values and the written values are the same values.

**Then verify after write.** Re-read the ledger from disk and assert three things together:

```
governingEntry.entryId === candidate.entryId
staleness(governingEntry) is empty
derivedStatus === candidate.kind
```

Confirming freshness alone is not enough. Another signing event could become governing between the append and the check — today only through operator error, later through genuine concurrency — and a check that asked only "is the governing entry fresh?" would report success for someone else's entry. Asserting the governing entry **is the one just written** is what makes the report about this operation.

The freeze closes the check-then-recompute gap; the post-write read catches the world moving underneath the whole operation, which the freeze cannot.

### 5.1 The gate is candidate consistency, not existing staleness

This is the correction that matters most in this document.

An earlier draft refused to sign on "blocking staleness". That is wrong in the worst direction: **staleness belongs to the existing governing entry, and signing is how a stale status is repaired.** If `CSRD-S-001` reads `stale_encoding` today because its condition was corrected, that is precisely why a fresh verification exists and wants signing. Refusing on it inverts the mechanism and makes recovery impossible exactly when it is required.

| | Question | At signing |
|---|---|---|
| **Existing-signature staleness** | Why does this requirement read `draft` right now? | Informational. Displayed, never blocking |
| **Candidate consistency** | Does the result being signed describe the world as it is *now*? | Blocking |

Candidate consistency compares the result's pinned inputs against current state: `requirementInputSha256`, `conditionSha256`, `renderedConditionSha256`, `corpusClosureSha256`, and each pinned document's `sha256Normalized`. A pinned `sha256Raw` differing while normalized matches is **advisory**, not blocking — the same raw-versus-normalized logic as §4.3, since the words did not move.

**Refusals:** any `MISMATCH`; outstanding `OPEN_QUESTION`; failing evidence check; unresolved `corpus_gap` or `closure_gap`; invalid result schema; **candidate inconsistency**; integrity failure; red test suite; unpromoted `pipelineVersion`.

---

## 6. Field accounting

The direct lesson from B1b-i, where `in_catalogue.missReason` was rendered by nobody, recorded by neither feature producer, and declared away in the grammar contract — three modules and a specification agreeing, all wrong in the same direction.

But "is this field used?" is the wrong question, and it is where an earlier draft of this section stopped. The question that generalises the lesson is **what kind of authority does this field exercise?** A field can be read everywhere and still be misclassified if nobody asked whether it decides something.

### 6.1 Six roles

| Role | Meaning |
|---|---|
| `authority` | Determines routing, governing state, or status |
| `signability` | The candidate must satisfy this before signing |
| `freshness` | Participates in post-signing validity and reason derivation |
| `integrity` | Malformed, tampered or missing state causes a hard failure |
| `display` | Shown to a human; decides nothing |
| `audit` | Retained for the record; decides nothing |

Roles compose — most fields carry two.

**`freshness`, not `staleness`.** Participation in the derivation is not the same as invalidating. `corpus[].sha256Raw` participates: a changed raw hash with unchanged normalized text yields `source_reissued`, which is advisory. A class named "staleness" and defined as "invalidates" would misdescribe it, and misdescription in this table is how the last hole opened. **The reason decides whether it blocks; the field classification only says the field takes part.**

### 6.2 Representative classifications

Paths, not top-level keys — classifying `result.challenges` as a unit recreates the same hole one level down.

```
entryId                        integrity + audit
kind                           authority
packId, requirementId          authority
revokes                        authority + integrity
requirementVersion             integrity + audit
requirementSha256              integrity + audit
requirementInputSha256         freshness + audit
conditionSha256                freshness + audit
renderedConditionSha256        freshness + audit
rendererVersion                audit
corpusClosureSha256            freshness + audit
corpus[].sha256Normalized      freshness + audit
corpus[].sha256Raw             freshness + audit
corpus[].normalizerVersion     freshness + audit
resultSha256                   freshness + integrity + audit
pipelineVersion                signability + audit
challenges[].verdict           signability + display
challenges[].evidence[]        signability + audit
openQuestions[]                signability + display
by                             display + audit
on                             display + audit
note                           audit
```

`entryId` is `integrity` because the ledger's internal consistency rests on it, and `revokes` is `authority + integrity` because it both redirects governing state and must resolve to a real earlier entry. `on` is `display + audit` and deliberately **not** `authority` — §3 orders by file position, and this row is what stops a later reader "improving" that to use the date.

`resultSha256` carries three roles: `freshness` because it produces `stale_result`, `integrity` because a missing pinned result is a hard failure, `audit` because it names what was signed.

### 6.3 The guard

**The completeness guard derives its path set from the runtime zod schemas, not from TypeScript interfaces.** TypeScript disappears at runtime and cannot be walked; zod schemas exist and can. The guard enumerates every leaf path across every variant of every schema and fails until each carries at least one role.

This is B1b-ii-a's hardest acceptance test, and the one that closes the class rather than the instance.

---

## 7. The migration, and its recorded golden

### 7.1 Capture the golden first

**Before any migration code changes**, record two levels from the current implementation:

1. **Engine golden** — a fixed profile through `assess()`: determinations, obligations, and status-facing output.
2. **Public rendered golden** — the user-visible checker result for that same profile.

The second catches frontend behaviour the first cannot see.

**Freeze nondeterminism before capturing**: assessment date, any incidental ordering. The assessment date already enters through `AssessmentContext` rather than the clock, which is what makes this tractable.

**The golden must not be regenerated by the migration.** Updating it requires an explicit, reviewed change — a migration that rewrites its own expected output proves nothing. The test compares against the recorded artifact, and a regeneration script, if one exists at all, is separate and never runs in CI.

### 7.2 The invariant

With an empty ledger:

```
16 requirements       → all derivedStatus = draft
minStatus = draft     → all 16 evaluated
containsDraftContent  → true
public checker        → observably identical result
```

This is a hard acceptance test, not a cleanup step.

### 7.3 The filter

`includeDraft: boolean` becomes `minStatus: 'draft' | 'verified' | 'ratified'`, defaulting to `'draft'` so current behaviour is bit-identical. A boolean cannot express a three-way choice, and leaving it would force a wrong guess about where `verified` sits.

Separate tests prove `minStatus: 'verified'` yields verified plus ratified, and `minStatus: 'ratified'` yields ratified only.

**The public checker is not moved to `minStatus: 'verified'` as part of this migration.** That is a later product decision about what the site should claim, and bundling it here would hide a product change inside an infrastructure one.

### 7.4 Consumer changes

`Requirement.ratification` is deleted from the type and from `requirements.json`; the loader attaches `derivedStatus` and `statusReasons[]`. The rename makes the compiler enumerate all seven consumers so none can keep its old behaviour by accident. An asserted status remaining in `requirements.json` becomes a **load error**, not an ignored field.

---

## 8. Decomposition

**B1b-ii-a — The record.** Per-requirement `version` and its lockfile backstop → result schema → ledger → governing-entry resolution → staleness set → derived status → field accounting. Touches no product behaviour; every part is exercisable with fixtures.

**B1b-ii-b — Signing, surfaces, migration.** Sign CLI → post-write verification → review sheet → `minStatus` migration → public-site migration → the pre/post golden.

The public migration lands *after* the derivation machinery exists and is tested. Reversing that order would make production semantics depend on unfinished infrastructure.

---

## 9. Testing

Beyond per-module unit tests:

- **Governing-entry resolution** — multiple entries, revocation, revocation of a non-existent target, revocation across packs, revocation of a revocation (all four rejected at load)
- **Staleness as a set** — co-occurring causes both present; `blocks` correct over the set; `deriveStaleness()` **never** returns `revoked`
- **`stale_result`** — editing a verdict in the pinned result after signing, with condition, corpus and rendering untouched, withholds `verified`; a missing pinned result is an `INTEGRITY_FAILURE`, not a staleness reason
- **Candidate consistency** — a stale existing signature does **not** block signing; a candidate whose pinned inputs no longer match current state **does**
- **Post-write verification** — asserts the governing entry is the one just written, not merely that some governing entry is fresh
- **Version registry** — re-using an old version number for new content fails against the historical record, not only against the latest pair
- **Field accounting** — a new field on any schema variant fails until classified; nested and union paths reached; roles derived from zod, not TypeScript
- **Migration golden** — engine and public levels, compared against the recorded artifact, with regeneration explicitly excluded from CI
- **`minStatus`** — one test per level
- **Version backstop** — editing a requirement's content without bumping `version` fails the build; bumping without updating the lockfile fails the same way

No network anywhere in `npm test`.

---

## 10. Non-goals

- No change to what the public checker *claims* — only to how status is derived.
- No generated projection file until a consumer needs one.
- No agents. B1b-ii is deterministic machinery end to end, as B1a and B1b-i were.
- No `ratified` content. The status exists and is reserved; nothing sets it.
