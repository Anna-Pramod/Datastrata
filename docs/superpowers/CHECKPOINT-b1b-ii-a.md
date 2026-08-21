# B1b-ii-a checkpoint — COMPLETE 2026-08-20

All six tasks are done, plus two review-driven additions. Everything is in the
working tree of the `b1b-record` worktree on branch `feature/b1b-ii-a-record`,
and **nothing is committed** — the user commits their own work.

State: **705 tests green, `tsc --noEmit` exit 0.**
477 at plan start → 532 (T1) → 572 (T2) → 622 (T2b) → 648 (T3) → 660 (T2c,
after T4 reordering) → 678 (T5) → 705 (T6).

Scope held: no CLI, no frontend change, no migration. `grep -ri csrd src/`
unchanged at five. `src/verification/` free of fs, network and clock.

---

## Plan status

| Task | State |
|---|---|
| 1. Version-integrity registry | Done, reviewed, verified independently |
| 2. Result schema + canonical hash | Done, reviewed, verified independently |
| 2b. Result referential gaps (id uniqueness, `readingElementId`) | Done, user-approved addition |
| 3. Ledger | Done, reviewed, verified independently |
| 4. Staleness set | Done, reviewed, verified independently |
| 2c. Evidence + corpus-pin gaps (absence-sole, `docId` uniqueness, quote/pin agreement) | Done, user-approved addition |
| 5. Status projection | Done, reviewed, verified independently |
| 6. Field accounting | Done, reviewed, both teeth checks re-run by the parent |

Task 6 final state: **114 emitted paths, 114 classified rows, zero discrepancy
in both directions.** All six roles in use. Both ledger variants walked
separately; both embedded `evidenceItemSchema` variants classified.

The plan itself is `docs/superpowers/plans/2026-08-20-b1b-ii-a-record.md`. It has
been amended during execution and is authoritative over this file.

---

## Next: B1b-ii-b, and the obligations B1b-ii-a hands it

B1b-ii-a is complete and deliberately stops short of the sign CLI, the revoke
CLI, the review sheet, `minStatus`, the loader-derived `derivedStatus`, the
public migration and both goldens. Four obligations travel with it:

1. **`normalizer_changed` is over-broad as shipped and must be narrowed.** At
   this layer it means *"the version moved and whether the text moved with it is
   undetermined"*, because `deriveStaleness` is pure and cannot renormalise.
   Factory spec §4.3 defines it as the *outcome* of renormalising, where
   identical text means still fresh. As it stands, a normalizer bump blocks
   **every signature in the pack** — the alarm-fatigue failure the
   raw-versus-normalized split exists to prevent. B1b-ii-b must renormalise the
   retained raw bytes and drop the reason where the normalized text is unchanged.
2. **`CurrentState.resultSha256` is non-nullable**, so a missing result file is
   unrepresentable in `deriveStaleness` — deliberately, because it is an
   `INTEGRITY_FAILURE`. Nothing in B1b-ii-a enforces that; the CLI must raise it.
   Same for a document pinned by an entry but absent from the current corpus.
3. **A tampered `entryId` makes the whole ledger unreadable**, so `revoke` will
   refuse to operate on a damaged file. That is correct — see the reasoning
   below — but B1b-ii-b should surface it as forensics-required rather than as an
   ordinary error.
4. **The registry keys versions as strings** (`{ "1": "sha256…" }`) while the
   requirement, the result and the ledger all type `requirementVersion` as a
   number. B1b-ii-b needs a deliberate `String(version)` at the lookup.

Two spec corrections to make when either document is next touched:

- Factory §2.2 points at `src/verification/evidence.ts`; the file is
  `src/corpus/evidence.ts`. And its claim that *"the schema enforces"* the
  absence-sole rule is inaccurate — the rule lives in `assertResultConsistency`
  and **cannot** move into the schema without wrapping it in `ZodEffects` and
  making the field-accounting guard unbuildable.
- Record-design §6.3 says the guard enumerates every **leaf** path. The
  leaf-only model is the error the plan corrects; an implementer reading §6.3
  alone would build a leaf-only walker and find the table's `openQuestions[]`,
  `gaps[]`, `corpus[]` and `challenges[].evidence[]` rows unemittable.

---

## Execution protocol in force

- One fresh subagent per task; parent reviews before the next is dispatched.
- **Subagents never commit.** The user runs every `git add` / `git commit`.
- No `Co-Authored-By` trailer in any commit message.
- Standard applied at every gate: *a green check is not evidence unless we know
  it can fail against the defect it claims to detect.* Each task's teeth check
  was re-run independently by the parent, not accepted from the report.
- B1b-ii-a stays agent-free and product-behaviour-free. No signing CLI, no public
  migration — those are B1b-ii-b.

---

## Plan amendments made during execution

Before Task 1 — the reviewer's six final corrections. Four were missing, one was
present but wrong, one was already there:

1. Structural schema vs. semantic validator, with the layering, the ban on
   refinements at root *and* nested, and the seam test. **Was missing.**
2. JSONL framing: `parseLedger` takes raw text not pre-split lines, the segment
   table, the `.filter(Boolean)` prohibition, physical 1-based line numbers.
   **Was missing.**
3. Evidence-free adjudication made unrepresentable: `.min(1)` structurally,
   verdict-keyed resolution rules semantically. **Was missing.**
4. One authoritative `EvidenceItem` schema in `src/corpus/evidence.ts`. The plan
   had explicitly *permitted* the mirror the reviewer forbade. **Was wrong.**
5. Requirement hash domain stated as the validated authored representation, no
   whitelist. **Was partial** — the tests were there, the rule was not.
6. `UnsignedLedgerEntry` as an explicit union of omits. **Already present.**

Two contracts I specified that the plan had left open, both flagged rather than
buried: `parseLedger` accumulates all framing problems and throws once; `''` is
an empty ledger while a lone `'\n'` is damage.

During execution:

- Corrected the program-agnostic constraint: **five** pre-existing `csrd` hits in
  `src/`, not three. `render.ts` has two `CSRD-S-013` comments that predate the
  branch (confirmed at `1d9ce88`). A wrong baseline would either raise a false
  alarm or mask a real addition.
- Corrected the stale `477 tests` baseline to "the previous task's finishing
  count".
- Recorded the four referential rules above and their rationale.
- **Task 6 table gaps**, found at Task 3's review: added
  `ledger.signing.packVersion` (`integrity, audit`),
  `ledger.signing.corpus[].versionLabel` (`display, audit`) and
  `ledger.signing.note` (`audit`, per spec §6.2 line 48). All three are required
  fields in spec §3 that the schema necessarily emits, so the guard would have
  failed in the unclassified direction.
- **Corrected `result.openQuestions[]` to `signability, display`** to match spec
  §6.2, which the plan's block had narrowed to `signability`.
- **Resolved the `ZodArray` traversal ambiguity.** The array at key
  `openQuestions` emits `openQuestions[]` and nothing else at that level — there
  is no bare `openQuestions` row. "The container is emitted too" means the `[]`
  form *is* the container path, not that both are emitted.
- **Recorded the `parseLedger` composition decision** (see below).

---

## Decisions taken during review, with reasoning

**Spec §3.1's `"sha256:A"` is not a literal prefix.** A/B/C are placeholders for
content versions. Bare hex is correct and `parseVersionRegistry` rightly rejects
a prefixed value.

**`requirementSha256` ≠ `requirementInputSha256`.** Both exist and neither
replaces the other. The input hash deliberately ignores `caution` so editing a
warning does not invalidate a verification input; the requirement hash covers the
whole authored record, because version integrity asks whether *anything* the
author wrote moved without a bump.

**`src/verification/canonical.ts` now imports `src/knowledge/schema.ts`** —
verification depending on knowledge. Accepted: it is the direct consequence of
hashing the schema-validated representation, and the alternative splits canonical
hashing across two modules. `schema.ts` imports only zod and types, so
`src/verification/` stays free of `node:fs`.

**A missing version registry file is a hard failure**, not a skipped check. The
frontend resolves correctly — `frontend/web/lib/pack.ts` loads from
`backend/engine/knowledge/csrd`, and the derived registry dir is
`backend/engine/verification/requirement-versions`, where the file sits.

**`resultSha256` re-parses structurally but does not re-run
`assertResultConsistency`.** Task 4's `stale_result` needs the current hash of a
result precisely when that result may have been edited into inconsistency;
folding the check in would make the hash uncomputable when it matters most.

**A tampered `entryId` makes the whole ledger unreadable**, so B1b-ii-b's
`revoke` CLI will refuse to operate on it. This does not conflict with
"revocation must remain possible when things are broken": spec §3 guarantees a
revocation carries no *verification pins*, so withdrawal does not depend on a
recomputable corpus or an intact result file. It is not a guarantee that a
compromised ledger stays writable. If a stored `entryId` no longer matches its
contents, appending a new authority claim builds on a foundation nothing can
vouch for. The right response is forensics on the file, not another append.

---

## Open questions for later, not blocking

- ~~**`gaps[].docId` is required even for a `closure_gap`**, which may not always
  have one document to name. A B2 question.~~ **Settled in B2 Task 1.5, and the
  pressing case was not the one posed.** A `closure_gap` always has a document —
  the document exists and traversal did not reach it. The shape with no document
  identity to name is a *source-level* `corpus_gap`: a requirement whose
  `sources[]` are served by no document at all, where what is missing is source
  coverage rather than a file. Schema `1.1.0` makes `docId` and `sourceId` both
  optional, with the cardinality per kind and a register cross-check in
  `assertResultConsistency`.
- **Ledger field formats are unconstrained**: `on` has no date format, and the
  hash fields are plain `z.string()` with no hex regex, unlike `registry.ts`'s
  `SHA256_HEX`. For `entryId` the recompute-and-compare is strictly stronger, but
  `revokes`, `resultSha256` and the corpus pins accept any string. A regex is
  still a `ZodString` and stays walkable, so this can be tightened later without
  disturbing Task 6.
- **Task 6 note:** `ledger|0.kind` is a `ZodEnum` (`'verified'|'ratified'`) while
  `ledger|1.kind` is a `ZodLiteral`. Both are in the walker's handled set, but it
  must not assume the discriminator is always a literal.
- **The registry is authored data and nothing covers the registry file itself.**
  Editing both `requirements.json` and the registry hash together passes
  integrity. Inherent to trust-on-first-use; the ledger is the real backstop for
  signed requirements.

---

## Verification performed by the parent, not taken from reports

- Task 1's gate: re-ran the mutation independently with `sed` both ways (not
  `git checkout`, which would silently drop the 16 `version` fields). Throws,
  names `CSRD-S-001`, restores to green.
- Task 2's schema: probed the built object — root `ZodObject`, **no `ZodEffects`
  at any depth**, evidence schema object-identical in both locations, `.min(1)`
  on both, every node kind inside Task 6's table.
- Task 2's gaps: probed all four against the built contract; both plan-mandated
  controls correctly rejected.
- Task 3's framing: exercised all nine cases against the implementation —
  terminal newline, no terminal newline, trailing `\n\n`, internal blank,
  whitespace-only (spaces and tab), `''`, lone `'\n'`, and the four-line fixture.
  All behave exactly as the amended plan specifies.

Findings the subagents surfaced themselves, which is the protocol working:
Task 1 found the plan's `csrd` count wrong; Task 2 found one of **its own tests
could not fail** (schema `parse` reorders keys before hashing, so the
key-reordering test passed against a deliberately broken `resultSha256`) and
replaced it; Task 3 found the Task 6 table incomplete against spec §3.
