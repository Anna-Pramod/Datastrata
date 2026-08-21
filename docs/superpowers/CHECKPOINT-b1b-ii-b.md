# B1b-ii-b checkpoint — COMPLETE 2026-08-21

All six tasks done. Everything is in the working tree of the `b1b-record`
worktree on branch `feature/b1b-ii-a-record`; the last task is **uncommitted**
— the user commits their own work.

State: **7 frontend + 875 engine tests green, `tsc --noEmit` exit 0** across
both workspaces.
705 at phase start → 709/7+4 (T1) → 7+708 (T2) → 7+774 (T3) → 7+814 (T4) →
7+855 (T5) → 7+875 (T6).

`grep -ri csrd backend/engine/src/` unchanged at **five**. `src/verification/`
still free of filesystem, network and clock.

---

## Task status

| Task | State |
|---|---|
| 1. Clock-free check response + frontend test runner | Done, verified independently |
| 2. Both goldens recorded | Done, verified independently |
| 3. Promotion ledger + frozen signature candidate | Done, verified independently |
| 4. Append, verify-after-write, revoke | Done, verified independently |
| 5. Review sheet | Done, verified independently |
| 6. The migration | Done, verified independently |

Every teeth check was re-run by the parent rather than accepted from the
report. The plan, `docs/superpowers/plans/2026-08-21-b1b-ii-b-signing-surfaces-migration.md`,
was amended during execution and is authoritative over this file.

---

## The one blocking prerequisite for B2

**The loader over-claims a signed-but-stale requirement as `verified`.**

`loadPack` calls `deriveStatus(governing, [])` — an empty staleness set —
because it has no corpus, rendered condition or pinned result to compute one
from. Confirmed directly:

```
deriveStatus(signed, [])               ->  { derivedStatus: 'verified', statusReasons: [] }
deriveStatus(signed, ['stale_result']) ->  { derivedStatus: 'draft', statusReasons: ['stale_result'] }
```

It propagates to the `minStatus` filter, `containsDraftContent` (the prototype
banner) and the public site's counts. **Unreachable today** — the ledger is
empty and every requirement derives to `draft` — and live the moment B2 signs.

Three options and the reasoning are in the plan's "Handed to B2" section.
**Do not sign anything before this is decided.** Deriving status was meant to
mean a requirement stops reading `draft` only when a person signs it *and that
signature still holds*; the second half is unenforced at this surface.

---

## Also handed to B2

- **`conditionSha256` and `renderedConditionSha256` both need agreed
  producers.** A `selection` requirement has no top-level condition, and
  `renderCondition` cannot be called on one at all; `renderCondition` and
  `renderRequirement` also produce different text for the same boolean
  requirement. Resolved here as `candidateConditionSha256` and
  `candidateRenderedConditionSha256`. **B2's result producer must use the same
  two functions**, or every selection requirement gets a permanent, silent
  candidate inconsistency. Carry to factory §4.2.
- **`CSRD-S-012` cannot be verified or signed end to end.** Its `sources[]`
  (`SRC-005`, `SRC-006`, `SRC-007`) resolve to **zero** corpus documents — the
  only one of the sixteen — so no quote evidence can ever be produced for it.
  It is also the only `selection` requirement with no top-level `condition`.
  This is a content and corpus-ingest backlog item, not a code defect.
- **Benchmark metrics and `verification/pipeline/<version>.json` are B3's.**
  The promotion *gate* exists (sign refuses a `pipelineVersion` with no
  promotion record) and the review sheet prints the metrics as unavailable
  rather than omitting the block.

## Spec corrections to make when either document is next touched

- Factory §2.2 points at `src/verification/evidence.ts`; the file is
  `src/corpus/evidence.ts`. Its claim that *"the schema enforces"* the
  absence-sole rule is inaccurate — the rule lives in `assertResultConsistency`
  and cannot move into the schema without making the accounting guard
  unbuildable.
- Record-design §6.3 says the guard enumerates every **leaf** path; the
  leaf-only model is the error the B1b-ii-a plan corrects.
- Factory §4.2 needs the two hash-producer decisions above.
- Factory §4.5's "signable summary" (`overallOutcome`, `mismatches`,
  `allEvidenceValid`) names no field the result schema has, and none should be
  added: a result declaring its own signability would be the defect
  `openQuestions[]` avoided by carrying no `blocking` flag.

---

## What each task surfaced

Every task found a real defect, and four of the six were defects in **tests**
rather than code. That pattern is the most transferable thing here.

1. **T1** — the check route stamps `new Date().toISOString()`, which is UTC
   while the machine is local. Observed live: the teeth check ran just after
   local midnight and produced `2026-08-20` against a local `2026-08-21`. Two
   customers answering minutes apart can differ by a day. Pre-existing,
   preserved verbatim. Also found `answersSchema` types two fields as free
   strings where their neighbours use enums.
2. **T2** — *the plan's own teeth check proved nothing.* Mutating a threshold
   trips version integrity at `loadPack`, so every test died before comparing
   anything; "both goldens fail" was satisfied by an unrelated failure. Fixed
   by a two-stage check where only the second counts.
3. **T3** — every test passed on first implementation, so none had been
   observed failing against a wrong one. Ran a mutant per property; one escaped
   (`isPromoted` via `startsWith`) and revealed a real hole. Also found
   `CSRD-S-012` could never be signed.
4. **T4** — three post-write conjuncts **masked one another**, and one was
   unreachable through its natural caller. Mutating conjuncts away left the
   suite green. Closed by calling the predicate directly with states the caller
   cannot produce.
5. **T5** — assertions of the form "output contains X" pass against a generator
   emitting X unconditionally. Each was paired with a counterexample in the same
   document and proved independently killable by 13 mutants.
6. **T6** — the plan's masking warning was **inverted**: a leftover
   `ratification` is stripped before hashing, so version integrity passes and
   the explicit `verifyIntegrity` check is the *only* thing catching it.

**The generalisation, earned three separate times:** a green check is not
evidence unless you know it can fail against the defect it claims to detect —
and a *red* check is not evidence either until you have read the failure
message and confirmed it names the assertion you intended. Coverage says the
line ran; it does not say the line decided anything.

---

## Execution protocol in force

- One fresh subagent per task; parent reviews and re-runs every teeth check
  before the next is dispatched.
- **Subagents never commit.** The user runs every `git add` / `git commit`.
- No `Co-Authored-By` trailer in any commit message.
- Mutations restored from a copy taken first, never `git checkout`.
- Both golden artifacts are read and never written. **No regeneration path
  exists anywhere in the repository**, and both were confirmed byte-unchanged
  against HEAD after the migration.
