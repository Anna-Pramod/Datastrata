# Write-result cleanup guard port: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. One task, one fresh subagent; the parent re-runs every teeth check itself. The user runs every `git add` and `git commit`.

**Goal:** bring the 2026-10-15 cleanup guard for `writeVerificationResult` into the candidate as its own small change, with fresh red-before/green-after evidence and mutation checks on the current candidate, while preserving the later quote-hash repair in the test file.

**Architecture:** both stage `catch` blocks in `backend/engine/src/pipeline/write-result.ts` call a `removeTemp` guard that returns the removal's failure instead of throwing it; `write_failed` keeps the stage's own `error` and gains an optional `cleanupError` set only when the removal failed. Nothing else changes. The test file gains the two real-filesystem cases and the absence assertions; its current fixtures (`NOT_INGESTED`, the absence-claim evidence) stay as they are.

**Tech Stack:** TypeScript (engine, zod only), vitest, Node.

**Source of the intended change:** the modified files in `/Users/vivin/Documents/DataStrata/datastrata/.claude/worktrees/affectionate-easley-513cab` (read only; nothing there is edited, moved or deleted) and the hand-over `write-result-cleanup-guard.handover.md` in the shared notes folder `local_5da6fadb-0595-4c2e-8570-bdeb5df7aa03`. The historical evidence under `pilot-evidence/2026-10-15-write-result-cleanup-guard/` is not reused as evidence; it is read only to confirm the intended mutants.

## Global Constraints

- `docs/superpowers/TEST-EVIDENCE-STANDARD.md` applies; teeth checks are applied from copies and restored by hash; outputs recorded verbatim in the notes folder `2026-10-20T1230Z-write-result-cleanup-guard-port/`.
- No file other than `backend/engine/src/pipeline/write-result.ts` and `backend/engine/test/pipeline-write-result.test.ts` changes. `grep -ri csrd backend/engine/src/` stays at 7.
- No live agents test (`*.agents.test.ts`), no `npm run test:agents`, no network, no spend. The engine's default suite only.
- The original worktree, its two modified files, and the historical evidence folder are untouched (verified by hash before and after).
- Baseline: the parent records the engine suite's file and test counts and `tsc --noEmit` exit code at HEAD `1ad8d89` before the task.

---

### Task 1: port the guard and the tests

**Files:**
- Modify: `backend/engine/src/pipeline/write-result.ts` (the `ResultWriterFs.rmSync` doc comment, the `write_failed` variant, a new `removeTemp(fs, temp): Error | undefined`, both stage catches)
- Modify: `backend/engine/test/pipeline-write-result.test.ts` (the header paragraph; `expect(outcome.cleanupError).toBeUndefined()` added to the four existing injected-failure cases; the new section "A cleanup that fails as well never takes the stage failure's place" with the helpers `writeFailed`, `errnoOf`, `tempPathBeside`, `directoryBecomesFileBeforePublish` and the two cases, exactly as the worktree's version has them, placed before the byte-preparation section)

**Interfaces:**
- Produces: `ResultWriteOutcome`'s `write_failed` variant gains `cleanupError?: Error`; `removeTemp` is module-private.

- [ ] **Step 1: Baseline and hashes.** Record sha256 of both candidate files and both worktree files; copy both candidate files to `teeth-copies/`. Run `npx vitest run test/pipeline-write-result.test.ts` → record the passing count (the current file's).
- [ ] **Step 2: Tests first.** Apply the test-file changes only. Run the file → expected: exactly the two new cases red with `threw: Error: ENOTDIR: not a directory, lstat '…verification-result.json.<hex>.tmp'` (the cause from the unguarded `rmSync`), the four absence assertions green, everything else green. Record verbatim.
- [ ] **Step 3: The fix.** Apply the source change. Run the file → all green; count = baseline + 2. Run `npx tsc --noEmit` → 0.
- [ ] **Step 4: Teeth (parent re-runs each from a copy, restores by hash):** M0 guard removed (both catches call `fs.rmSync` directly) → both new cases red with the ENOTDIR throw; M3 the cleanup error returned as `error` → red at the `errnoOf(outcome.error)` equality (`lstat` where `mkdir` or `rename` is expected); M4 the cleanup error dropped → red at `toBeInstanceOf(Error)`; M5 the cleanup error always reported → exactly the four absence assertions red; M6 the stage error duplicated as the cleanup error → red at `not.toBe`.
- [ ] **Step 5: Exposure check.** `grep -rn 'cleanupError\|write_failed' backend/engine/src backend/engine/test --include='*.ts'` and read every consumer: `src/cli/run.ts` (prints `error.message` only) and `test/live-capture.ts` (prints `error.message` only; the trust block carries the stage, not the error). Confirm nothing serialises the whole outcome into `execution.json` or a customer-visible surface (`frontend/web` imports nothing from `write-result`). Record the finding; if any surface would carry the absolute temp path, stop and report rather than redact silently.
- [ ] **Step 6: Suite and runtime.** `npm test` in `backend/engine` (the default suite, agents excluded) → green, count = baseline + 2; `npx tsc --noEmit` → 0; `grep -ri csrd src/ | wc -l` → 7. Node runtime: record `node --version`. If a Node 20 runtime is available (`nvm use 20` after the user's go-ahead to install it, or any installed 20.x), run the write-result file and the suite under it and record both; if not, state that the supported CI runtime (Node 20) was not exercised locally and that CI runs it on push.
- [ ] **Step 7: Hand-off.** Diff against HEAD for the two files, the logs, the manifest, and a reviewer hand-off listing the verification results and limitations.
