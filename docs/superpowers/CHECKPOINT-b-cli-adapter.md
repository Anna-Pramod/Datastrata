# Checkpoint — B-CLI-ADAPTER, the capture-only subscription route, as a reviewable candidate on `1104e8f`

Written 2026-09-22 from the working tree, **revised the same day after two independent read-only reviews (§Review repairs and §Second review round below)**, not from the plan
(`plans/2026-09-22-b-cli-adapter.md`). Everything marked *verified* was run by
the parent on this tree after each task's subagent reported; every teeth check
below was re-run by the parent on a copy-restored file and its failure message
read. Nothing is committed: the user runs every `git add` and `git commit`.

**What this is.** A second provider adapter, `claude-code-cli@1`, that reaches
Claude through the pinned Claude Code CLI on the Max subscription, usable only
from the capture harness behind an execution-scoped authentication gate.
**What it is not.** Not a live rehearsal, not an S-002 run, not a promotion
input, not a change to `anthropic-messages@1`, and not a local-model
integration.

## What exists now

| Piece | Where | Note |
|---|---|---|
| Channel-aware runner records | `src/pipeline/live-runner.ts`, `src/pipeline/provider-adapter.ts` | `ProviderAdapter.channel` declared before execution; `AttemptRecord.channel` on every record; `launched`, `process`, `usageSource`; `BudgetLedger.attemptUnit`, `httpAttemptsObserved`, `launchesStarted`; outcome `observation_failed`; `EvidenceObservationFailedError` rethrown unwrapped. HTTP records and ledger proven identical to `1104e8f` once the new fields are stripped |
| The adapter, pure | `src/pipeline/claude-code-cli.ts` | identity `claude-code-cli@1`, `channel: 'process'`; pin constants (2.1.226, sha256 `013a1cf1…574febbe`, 279 661 952 bytes); the nine launch controls; launch spec `{model, systemPrompt, userMessage, jsonSchema, effort, role, index}`; strict lifecycle projection; byte-exact output from `partial_json` deltas; conflicts refused |
| The process transport | `src/pipeline/claude-code-cli-transport.ts` | the only process launcher under `src/pipeline`; `spawn` with `shell: false`, `detached: true`, pinned absolute path hashed before every launch; prompt file `0600` in a `0700` mkdtemp, user message on stdin; bounded output; TERM→KILL with observed facts; `runGate`, `escalate()`, `drain()` |
| Process guard | `test/setup/process-guard.ts`, `vitest.config.ts` | installed from `setupFiles` before any test module; replaces the seven `child_process` launch APIs on both the CJS and ESM routes; allows only absolute paths under a directory a test registered; refuses shell strings and `fork` always; absent from the agents config on purpose |
| Static boundary | `test/pipeline-runner.test.ts` | exact importer set of `child_process` is `[src/cli/verify.ts (execFileSync, pre-existing sign gate), src/pipeline/claude-code-cli-transport.ts]`; nothing imports `worker_threads` |
| Wiring | `src/cli/live-wiring.ts` | both adapters registered; `verify run` refuses `claude-code-cli@1` by `SubscriptionRouteCaptureOnlyError` before reading any environment variable |
| Capture harness | `test/live-capture.ts` | `route: 'subscription'`: environment refusal, gate, `launches.jsonl`, sanitised streams, first-failure abort, operator interrupts with escalation, drain before the final summary, `terminationUnconfirmed`, `httpAttempts: null`, `cliObserved`, `unobserved`, `measured` |
| Fixtures | `test/fixtures/claude-code-cli/` | byte copies of the two sanitised probe streams (accepted `ce7a3dba…`, auth-failed `83ab6da2…`), README states origin and that they are derived, sanitised, synthetic-probe evidence with no corpus text |
| Gated live case | `test/pipeline-live.agents.test.ts` | `it.runIf(token && DATASTRATA_SUBSCRIPTION_CAPTURE === '1')`; inert under `npm test`; **never run** |

## Verified on this tree (2026-09-22)

- `npx vitest run` (engine): **73 files / 2018 tests** green after the second review round (2000 after the first, 1951 before it; baseline at `1104e8f`: 68 / 1797). Repository-root `npm test`: both workspaces green (frontend 8 / 50). `npx tsc --noEmit`: 0.
- `grep -ri csrd src/`: 7, the same six files. No new dependency.
- Untouched: `anthropic-messages.ts`, `transcript.ts`, `src/verification/`, every recording under `test/verification-transcripts/`, `corpus/`, `knowledge/`, the two protected untracked files (sizes and dates unchanged), the external probe evidence (both manifests verify), the r2 harness (`e9a02d69…`). `test/live-executions/` does not exist. No stray dummy processes.

### Teeth checks re-run by the parent

Each mutant was applied to a copy-restored file, confirmed to have landed by hash, run against its targeted case, restored, and the restoration confirmed by hash.

| Task | Mutant | Red on |
|---|---|---|
| 1 | channel stamped only on the completed record | `- "channel": "process"` |
| 1 | `possiblyBilled = usage === null` on the process path | `possiblyBilled true → false` |
| 1 | evidence error wrapped as ambiguous | `Object.is` on the error instance |
| 1 | process response reaches `diagnose` | `ProviderHttpError: … answered 0` |
| 2 | block overwritten on index reuse | `not an instance of CliMultipleStructuredOutputError` |
| 2 | output re-serialised | Buffer inequality (whitespace bytes) |
| 2 | `is_error` conjunct dropped | message does not match `/is_error true/` |
| 2 | exit code unchecked | `expected function to throw` |
| 3 | `detached: false` | `childReaped`, `processGroupMade`, `signalsSent` differ |
| 3 | KILL step removed | `groupGone false`, `SIGKILL` missing |
| 3 | `onLaunch` throw swallowed | `rejected … but it resolved` |
| 3 | `promptFileRemoved` forced true | `expected true to be false` |
| 3 | `--tools ""` → `default` | argv diff at that position |
| 4 | `setupFiles` entry removed | marker `'spawn'` ≠ `'processGuardSpawn'` |
| 4 | guard matches only `…/claude` | `/bin/echo` not refused |
| 4 | capture-only refusal removed | `expected function to throw` |
| 4 | `child_process` import added to a pipeline file | importer set gains the file |
| 5 | drain not awaited before the final summary | `drainedAt` null |
| 5 | lifetime not aborted on the first role failure | `cancelled true → false`, reason null |
| 5 | gate result ignored | `'completed'` ≠ `'failed'` |
| 5 | second interrupt not escalated | one TERM observed instead of two |
| 5 | `terminationUnconfirmed` forced false | `expected false to be true` |

## Decisions taken during execution (deviations from the plan, all reviewed)

1. **The subscription path does not go through `dispatch`.** `run.ts` hard-codes `DEFAULT_ROLE_CONFIG` (adapter `anthropic-messages@1`) and orchestration refuses a `claude-code-cli@1` runner under it. The harness composes the same production functions `runRun` composes, under `SUBSCRIPTION_ROLE_CONFIG` (the default with the CLI identity). A test asserts the resulting `runId` differs from the HTTP route's. A `config` capability on `run.ts` is the cleaner later shape; out of this boundary's `src/` scope.
2. **Refusal order in the adapter.** The result check (`subtype: success` **and** `is_error: false`) runs directly after the init check, ahead of model and tool-count checks, so the real auth-failed stream is refused by the reason a reader needs (`is_error`), not by a consequence of it.
3. **`src/cli/verify.ts` already imports `execFileSync`** for the sign command's suite gate. The plan's "only importer" wording was wrong; the boundary now asserts the exact two-file set and that `verify.ts` imports exactly `{ execFileSync }`.
4. **Two teeth checks could not red as the plan worded them** because orchestration is sequential and the transport awaits termination before rejecting: "a fourth launch starts" and "a leftover child" are unreachable. Both were rewritten to the observable the property actually has (`cancellationReason` / `cancelled`; a second accepted TERM to the group).
5. `role` and `index` are carried in the launch-spec body so the launch record can name the role; `bodyBytes` therefore includes them.
6. Redaction covers `email`, `orgId`, `orgName` keys as well as `session_id`, `uuid`, `cwd`, the email pattern and the HOME/USER literals; model-output subtrees are never modified, and a sensitive pattern inside one omits the stream file and records why.

## What remains unobserved or unverified — stated, not closed

- **Output ceiling.** `CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000` is set in every launch environment (tested by value). The wire-level `max_tokens` is unobserved; `modelUsage.maxOutputTokens: 64000` on the probe is not evidence either way. Truncation (`stop_reason: max_tokens`) is refused regardless.
- **Thinking.** CLI-decided for `--effort high`; not configurable, not asserted. `thinking_tokens` is recorded per launch when reported (`0` on the probe).
- **CLI-added request content.** The probe's 626 cache-creation tokens are unattributed between CLI injections and supplied content. `admittedLaunchInputBytes` is the UTF-8 length of the JSON launch description: an upper bound on prompt-file plus stdin bytes, **not** the provider request size.
- **HTTP attempt count.** Unknown under this channel and recorded as `httpAttempts: null`. Launches are counted; every started launch is `possiblyBilled`.
- **Server-side billing.** Not observable from the client. `total_cost_usd` is an API-price estimate. The probe's server-reported `overageStatus: rejected / org_level_disabled` is the strongest client-visible signal and is not a billing record.
- **The gate does not validate the stored login**; an expired session surfaces only at the first role launch, as it did on the first probe attempt.
- **Untested live:** the file-plus-stdin argv form, the real role schemas through `--json-schema`, a ~405 KB system prompt, and the production default `spawn` against the real pinned binary (the guard proves the default is guarded; nothing proves the real binary accepts these arguments).
- **The guard covers `node:child_process` only**; a native addon or another runtime would bypass it, and the static import test is what keeps such a path out of the engine.

## Next approvals, in order, none granted by this checkpoint

1. **Rehearsal probe** through the production code path: three synthetic launches (reader, prosecutor, adjudicator schemas), file-plus-stdin argv, a ≥500 KB synthetic system prompt, evidence outside the repository. This is where the untested-live items above are settled.
2. **Data terms** for sending corpus text over the subscription route; model-improvement setting reconfirmed off.
3. **The S-002 run**: stated launch budget (9), byte limit, lifetime, a fresh gate, evidence filed under the capture root (filed, not committed).
4. Promotion and signing: separate, unchanged.

## Review repairs (2026-09-22, after the first candidate)

An independent read-only review of the first candidate found six defects. Each was repaired offline with a red-first test and an accepted control, and every teeth check below was re-run by the parent on a copy-restored file with the failure message read. Nothing live ran.

| # | Defect found | Repair | Parent-verified mutant → red on |
|---|---|---|---|
| 1 | The abort listener was registered only after `spawn` and the stdin write, so an abort in that window was lost; the wait for the pipes' `close` was unbounded when the child had exited and its group looked gone | Listener registered before `launch()`, races consumed in abort-first order; the pipe wait always bounded by `termGraceMs`, raced against abort, pipes destroyed on give-up, `LaunchRecord.streamsClosed` reported | listener moved below stdin → `still pending … to be an instance of ProcessTransportError`; unbounded wait restored → `expected 2002 to be less than 2000` |
| 2 | A leftover found after a natural exit was terminated and the launch then *returned* an envelope, so it was projected as an answer; the harness wrote a transcript whenever `error === null` | Role launch with a leftover throws `ProcessTransportError` (`leftover_processes_terminated`, facts kept); gate leftover → `pass: false` with `leftover_processes_after_exit`; harness: unconfirmed termination or `streamsClosed: false` on a role launch → `TerminationUnconfirmed`, no transcript, any written result deleted and `resultWithheld: true` | leftover rejection removed → `rejected … but it resolved`; gate leftover ignored → `- "leftover_processes_after_exit"`; transcript written regardless → `a transcript directory exists … expected true to be false` |
| 3 | A sensitive pattern in a model-output subtree only omitted the stream file; the run continued and the payload reached `outputJson`, the transcript and the result | `SensitiveOutputWithheldError extends EvidenceObservationFailedError` thrown from `onLaunch` after the safe launch line (facts and reason by path and kind, never the value); the transport rethrows a subclass unchanged; runner halts under `observation_failed`; status failed, no transcript, result deleted; applied to abort partials too; model output never modified | omit-and-continue restored → `files under the execution directory carrying the planted marker: expected [ …(2) ] to deeply equal []` (the transcript and the result) |
| 4 | The projection selected "exactly one block *named* StructuredOutput", ignoring any other tool call, and compared only assistant restatements whose id matched | Exactly one `tool_use` of any name across the whole stream (`CliUnexpectedToolCallError` lists every call); every assistant `tool_use` item must be that call by name and id; one assistant message may not carry two; exactly one `tool_result` with the block's id | name filter restored → `the Bash block was not refused`; id-only matching restored → `the assistant's extra Bash item was not refused`; tool-loop check dropped → `the wrong tool_use_id was not refused` |
| 5 | `route` defaulted to `http`, so a request carrying the CLI adapter with no route entered the HTTP path; nothing in the environment selected the route | `DATASTRATA_SUBSCRIPTION_CAPTURE=1` selects the subscription route; a stated route that contradicts it, a present selector on the HTTP path, or a process-channel / CLI-identity adapter on the HTTP path → `CaptureRouteConflictError` before anything is created; ordinary HTTP selection unchanged (positive control) | `route = 'http'` when omitted → subscription-only environment reaches `CaptureRouteConflictError` instead of the subscription path; channel rule and identity rule each dropped alone → E3 `promise resolved … instead of rejecting` (a channel-alone assertion was added by the parent because the two rules masked each other under the first mutant) |
| 6 | `allowDummyDir` accepted any absolute directory (`/`, HOME, `/usr/bin`, the pinned CLI's parent) and containment was a string prefix on the unresolved path, so a symlink inside a registered directory escaped | Registration: absolute, existing, realpath a strict subdirectory of `realpath(os.tmpdir())`, and refused by name for `/`, HOME, `HOME/.local`, system directories and the engine root; launch: normalised path only, no symlinked component, `lstat` regular file (symlinks refused outright), realpath strictly inside a registered directory | tmpdir rule removed → `R7/R8 expected [Function] to throw`; by-name rules disabled → refusals fall to the wrong rule (asserted by message); prefix containment restored → L2 loses the containment verdict; symlinks allowed → the pinned-path symlink is still refused by containment and **never executed** |

Limitations that remain after the repairs, in addition to §"What remains unobserved": hard links are invisible to `realpath`; the leftover harness case (T2) was not observed red on its own because the transport already refuses it (its kill is the transport suite's leftover test); the `childReaped`/`groupGone` half of the unconfirmed rule is reachable only with a failing run, where the original error is kept; a selector value other than `1` derives the HTTP route and is then refused on it (fail closed on presence).

## Second review round (2026-09-22)

Two remaining gaps and one documentation error, each repaired offline with red-first tests and clean controls; every teeth check re-run by the parent on a copy-restored file.

| # | Gap found | Repair | Parent-verified mutant → red on |
|---|---|---|---|
| 7 | A launch whose pipes were still held when the bounded wait gave up (`streamsClosed: false`) was only acted on at finalisation: a gate with unclosed streams could pass and roles start; a role with unclosed streams was projected and later roles launched | Transport: a gate that gave up on its pipes returns `pass: false` with reason `streams_not_closed`; a role launch that did so throws `ProcessTransportError` naming `streams_not_closed` after `onLaunch` has the record, so projection never runs and the harness aborts the lifetime. The post-drain `TerminationUnconfirmed` rule stays as a backstop and now counts gate launches too. Cases: gate (zero role launches), reader (one launch, nothing after), middle prosecutor (launch count equals its position), final adjudicator (the immediate refusal now fires there, not the backstop), and a full-completion control with every `streamsClosed: true` | gate ignores `streamsClosed` → transport `expected true to be false` on `pass`; harness V1 `expected 9 to be +0` role launches. Role returns the envelope → transport `expected { status: +0, … } to be an instance of ProcessTransportError`; harness V2 `expected 9 to be 1` |
| 8 | The single StructuredOutput block's `id` could be absent, null, empty or a non-string; with no id the assistant-restatement comparison fell back to name-only matching and the `tool_result` comparison was bypassed, so conflicting ids were accepted | `CliToolCallIdError` when the block's `content_block.id` is not a non-empty string (message names the line and what was found); every `block.id === undefined` fallback removed, so restatement and `tool_result` ids are always compared to the proven id. Cases: absent, null, `''`, `42`, `{}`, restatement id absent, `tool_use_id` absent, plus the existing mismatch cases and the probe fixture as the valid control (35 bytes unchanged) | requirement removed → I1/I2 `expected 'CliOutputConflictError' to be 'CliToolCallIdError'` (five cases); name-only fallback restored → I3 `a restatement without an id was matched by name`; `tool_result` comparison skipped → T8/I4 `was not refused` / `was accepted` |
| — | The process guard's header claimed a hard link "cannot cross volumes" and that the pinned CLI lives on another volume than the temp directory. False here: `stat` shows the pinned CLI and the temp directory on the same device (`16777232`) | Header rewritten: a hard link inside a registered temp directory to an executable on the same filesystem passes the containment and symlink rules; no cross-volume argument closes it, and neither does the pin hash (a hard link to the pinned CLI hashes as the pinned CLI); nothing here detects it. Checked with `stat`, never by launching anything; no real-CLI hard-link launch was performed | documentation only; guard tests 23/23 unchanged |

Verified after this round: engine `npx vitest run` **73 files / 2018 tests**; root `npm test` both workspaces green (frontend 8 / 50); `tsc --noEmit` 0; `grep -ri csrd src/` 7; no stray processes; `test/live-executions/` absent; recordings, corpus, knowledge, `src/verification/`, both adapters' untouched files, both protected untracked files, both probe manifests, the r2 harness and both fixture copies unchanged.

Remaining limitations after this round: the hard-link gap above is documented, not closed; `resultWithheld` is `true` only when a written result was deleted or a completed run was withheld — under the immediate refusals nothing was written, so it reads `false` beside `terminationUnconfirmed: true`; the reaped/group-gone half of the backstop remains reachable only with an already-failing run.
