# Status truth boundary — COMPLETE 2026-08-21

All three tasks done. Everything is in the working tree of the `b1b-record`
worktree on branch `feature/b1b-ii-a-record`, **uncommitted** — the user commits
their own work.

State: **12 frontend + 909 engine tests green, `tsc --noEmit` exit 0** across
both workspaces. (7 + 875 at plan start.)

`grep -ri csrd backend/engine/src/` unchanged at **five**. Both migration golden
artifacts byte-unchanged against HEAD; neither was regenerated and no
regeneration path exists.

---

## The two gates

**Architecture gate — CLOSED.**

- `StatusInput` introduced; `deriveStatus(governing, reasons)` no longer compiles.
- A loader without a resolver yields `freshness_unchecked`, never `verified`.
- `sign.ts` and `review-sheet.ts` are structurally `unsigned` / `revoked`.
- The fixture resolver contract is established; `loadPack` acquires no
  verification I/O.
- Positive and negative controls prove the boundary discriminates **in both
  directions**.
- The migration golden remains green and unregenerated.

**Operational signing gate — STILL CLOSED.**

Completing this is **not** permission to create the first real signature.
Outstanding:

1. B2's real result producer writing to
   `verification/<packId>/<requirementId>/verification-result.json` — the path
   convention already exists in `cli/sign.ts:175`.
2. The live resolver reading it.
3. **A production change to `frontend/web/lib/pack.ts`** — see below.
4. A fresh real signature reaching the customer-facing path as `verified`.
5. Mutating one of its pinned inputs demoting that same path correctly.

The system is *safe* today — it reports `freshness_unchecked` — but that is not
the desired operating state, and 12 + 909 green must not be read as readiness
to sign.

---

## The finding that changes B2's scope

**`lib/pack.ts` has no resolver seam at all.** `csrdPack()` calls
`loadPack(dir)` with **no options** and memoises the result, so the site as
shipped can never supply a resolver — and `packStats().ratified` is therefore
structurally pinned at 0.

Task 3 reached the public path without touching production code, by mocking at
the module boundary. That is correct for a test and proves the projection holds.
It does **not** mean the site can resolve freshness. The plan was written as
though a resolver could already flow through the public path; it cannot.

**Closing the operational gate requires a production change to `lib/pack.ts`,
and that change was not in any plan.** It also reopens the caching question
recorded in the design's §9: the memoised pack currently carries status for the
process lifetime, which is acceptable under sign → commit → deploy but must be
revisited if a resolver makes status genuinely dynamic.

---

## What each task surfaced

**Task 1 — five status tests were unfalsifiable.** They asserted "the value
handed in is discarded", which an implementation that computes staleness and
throws it away also satisfies. Their subject is now unconstructible, so they
became `@ts-expect-error` assertions that the variants have *nowhere to put* a
freshness answer — a strictly stronger claim. Each directive was proven
load-bearing by deleting it and watching the build go red.

Also found: three file-list omissions (`loader.ts`, `canonical.ts`, `render.ts`
all had to change), and a **spec self-contradiction** — §5.1 declared
`renderCtx` while the rest of the section used `renderContext`.

**Task 2 — a spy count of zero is trivially satisfied.** The tests proving the
resolver is not called for unsigned and revoked requirements would also pass
against a loader that never calls it at all. Mutating the loader to call it for
*every* requirement fails the counts — while **every status assertion stays
green**, because `deriveStatus` discards the value. Only the call count catches
over-calling.

> **A new instance of failure mode 5:** an assertion that something *does not
> happen* is satisfied when nothing happens at all.

Also found: the spec's `IntegrityFailureError('...')` examples do not compile —
the real constructor takes `Refusal[]`. And §5.1's staging block silently
renames a variable, where handing the wrong array to `verifyIntegrity` would
disable the leftover-`ratification` guarantee silently.

**Task 3 — one red output did not name its assertion, and was fixed rather than
accepted.** A cascade from an aborted earlier stage produced
`expected {...} to deeply equal undefined`. The subagent traced it, moved the
capture out of the stage, and re-ran both directions to get exactly the two
intended failures each. That is the standard's second half working as intended.

---

## Verification performed by the parent

Not taken from reports:

- Task 1: confirmed `deriveStatus(governing, [])` no longer compiles (`TS2554`),
  and the unnarrowed union is rejected (`TS2345`).
- Task 2: re-ran the **hard-stop** teeth check. The forbidden catch fails
  exactly 2 of 893, both naming `expected undefined to be an instance of
  IntegrityFailureError`, with the pack loading successfully — so not the
  `loadPack`-reddens-everything trap.
- Task 3: re-ran teeth direction 1. An always-fresh resolver fails exactly the 6
  expected tests; stages 1 and 3 correctly stay green.
- Every mutation restored from a copy and confirmed by hash. No `git checkout`.

---

## Corrections the subagents made to the parent

Worth recording, because the review direction is not one-way:

- Task 1 found the plan's Task 1 file list incomplete in three places.
- Task 1 and Task 2 both found errors in the **design spec**, not just the plan.
- Task 3 found that the plan's premise about the public path having a resolver
  seam was false.

The parent also propagated one unverified claim from an earlier phase (a stale
`git checkout` hazard) and had a teeth-check mutation of its own produce a
`TypeError` that reddened five tests while proving nothing — caught only by
reading the message.
