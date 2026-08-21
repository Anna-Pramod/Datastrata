# DataStrata — working conventions

## What counts as test evidence

**Read `docs/superpowers/TEST-EVIDENCE-STANDARD.md` before writing an
implementation plan, a teeth check, or a test you intend to rely on.**

It is a standing standard, not a note on one phase. Every implementation plan
must reference it from its Global Constraints, and every task must carry a
teeth check naming the defect it detects. The short form:

> A green check is not evidence unless you know it can fail against the defect
> it claims to detect — and a red check is not evidence either, until you have
> read the failure message and confirmed it names the assertion you intended.

Six ways a test passes while proving nothing, each with the incident that
produced it, are listed in that file.

## Plans

- Live in `docs/superpowers/plans/YYYY-MM-DD-<name>.md`, specs in
  `docs/superpowers/specs/`.
- **Specify behaviour and interfaces, not reference code.** B1a's plan supplied
  full implementations and eight defects were found in the plan's own code,
  with zero transcription errors by implementers. Plans since specify
  behaviour; the defects that remain are in specification, which reviews catch
  more cheaply.
- State a task's baseline as **the previous task's finishing count**, never a
  fixed number — a stale baseline stops an agent on a false alarm.
- A phase ends with a checkpoint in `docs/superpowers/` recording what was
  found, what was decided and what is handed forward.

## Execution

- One fresh subagent per task; the parent reviews and **re-runs every teeth
  check itself** before dispatching the next. Do not accept a teeth check from
  a report.
- Restore mutations from a copy taken first, never `git checkout`, and confirm
  restoration by hash.
- Golden artifacts are read, never written. No regeneration path exists in the
  repository, and none should be added.

## Commits

- **The user runs every `git add` and `git commit`.** Prepare the change and
  hand over the exact commands; never commit on their behalf.
- Imperative sentence-case, no prefix. Explain *why*, not what changed.
- **No `Co-Authored-By` trailer**, ever, including on amends and rebases.

## Engine constraints

- `backend/engine/src/` is program-agnostic. `grep -ri csrd backend/engine/src/`
  must stay at exactly **five** pre-existing hits: `types.ts` (1),
  `cli/assess.ts` (1), `verification/render.ts` (2), `engine/summary.ts` (1).
- `src/verification/` is pure — no filesystem, network or clock. The CLIs read
  and write; verification modules are handed values.
- Every file opens with a JSDoc block saying *why* it exists, not what it does.
- No new runtime dependencies. `npm test` runs both workspaces and performs no
  network fetch.
