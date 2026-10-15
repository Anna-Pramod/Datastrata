# Checkpoint — `claude-code-cli@2`, the subscription capture route on Claude Opus 5.5, as a reviewable candidate on `651178c`

Written 2026-10-15 IST (around midnight UTC, 2026-10-14 to 2026-10-15) in plan
Task 6, from the working tree
of the candidate worktree `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate`
(detached at `651178c21e6d65314121a43456c262d3df668c6e`), not from the plan
(`plans/2026-09-25-opus55-subscription-migration.md`, v2). Tasks 0–5c were
implemented by fresh subagents, one per task or repair round, except that
5c's one fix round went back to its first-pass implementer, resumed (5c
summary); each was reviewed read-only and then parent-verified: the parent
re-ran the task's finishing set and its teeth checks on copy-restored files
and confirmed every restoration by hash (what each summary records of its
teeth, the reading of failure messages included, is in §Teeth). Its logs are
in the review directory
`/Users/vivin/Documents/DataStrata/pilot-evidence/2026-09-24-opus55-candidate-review/`
(called R below). This checkpoint's author, the Task 6 subagent, read those
logs and the code and ran the finishing set once more; it re-ran no teeth
check. Nothing is committed: the user runs every `git add` and `git commit`.

**Labels used throughout.** *Parent-verified*: run or read by the parent
session, as its log in R records. *Checked here*: run or read by this
checkpoint's author, with the log named (every such log is `task6-impl-*` in
R). *Reported*: stated by a handover or summary in R and not re-checked here.
Nothing in this checkpoint, and nothing in the candidate, confers the status
`verified`, which only signing does.

**What this is.** A new provider adapter version, `claude-code-cli@2`,
registered beside `anthropic-messages@1` and `claude-code-cli@1`: Claude Opus
5.5 (`claude-opus-5-5`) through a pinned Claude Code CLI on the Max
subscription, included usage only, usable only from the capture harness behind
its authentication gate. The invocation (effort, output ceiling, pinned
executable) is a pipeline identity input (D-3); the CLI's stream is projected
by rule priority, then strictly (D-7, D-8); usage outside the included
allowance is observed, stopped on and withheld (D-6); and D-9's four trust
tiers are filed in every `@2` `execution.json`. The subscription route defaults
to `@2`. `@1` stays byte-identical and is refused for any execution that would
spawn the real executable (D-1).

**What it is not.** Not a probe, rehearsal, S-002 run, promotion or signing:
in Tasks 0–6, as their handovers and summaries record, nothing ran live, no
authentication check was made, no Claude Code or `ollama` binary was run, and
`test/pipeline-live.agents.test.ts` was never run. Before Task 0, bare `grep`
calls in the earlier chat, and some investigator subagents' calls, ran a
Claude Code binary (recorded as the desktop 2.1.280) as a search tool, a
disclosed deviation (§Environment). Not a
change to `anthropic-messages@1`, `sign.ts`, `DEFAULT_ROLE_CONFIG`, the HTTP
identity or the result schema. Not the held-out evaluation (trust spec §3) and
not Qwen code (`specs/2026-09-25-local-qwen-assistance-design.md` is cited,
unchanged). And, as pinned, not runnable today: the 2.1.280 executable the
`@2` profile pins is no longer at its pinned path (§The pin today).

Paths are engine paths (`backend/engine/`) unless written from the repository
root, as in the plan.

## What exists now

| Piece | Where | Note |
|---|---|---|
| Task 0: the identities that must not move | `test/pipeline-identity.test.ts` | the HTTP literal, equal to the committed S-001 recording's value (a case reads the recording), and the `@1` subscription literal, both over the real prompts and the S-002 closure (§Identities and pins) |
| Task 1: the invocation type | `src/pipeline/provider-adapter.ts` | `InvocationIdentity` `{ effort, maxOutputTokens, executable: { version, sha256 } }`; `ProviderAdapter.invocation?`, declared by `CLAUDE_CODE_CLI_V2_ADAPTER` only |
| Task 1: the profiles | `src/pipeline/claude-code-cli.ts` | `CliProfile`, `CliGateRules`; `CLAUDE_CODE_CLI_PROFILE` (`@1`, read from its existing constants); `CLAUDE_CODE_CLI_V2_PROFILE`: the 2.1.280 pin, `permittedModels ['claude-opus-5-5']`, effort `high`, `maxOutputTokens` 64,000, eleven controls (`@1`'s nine with `CLAUDE_CODE_MAX_OUTPUT_TOKENS` at 64000, plus `CLAUDE_CODE_NO_MODEL_FALLBACK=1` and `CLAUDE_CODE_DISABLE_FAST_MODE=1`), settings `{"switchModelsOnFlag":false,"fastMode":false,"autoContinueAtUsageLimit":false}`, launch timeout 1,800,000 ms, gate timeout 60,000 ms, and `@2`'s gate rules (`analyticsDisabled` required `true`; `projectsDirectory` and `configDirectory` allowed as identifier fields, never reproduced); `CLAUDE_CODE_CLI_V2_ADAPTER`; `resolvePinPath`; `CliModelNotAllowedError`; `CliOutputTruncatedError` (names 64,000) |
| Task 1: the transport | `src/pipeline/claude-code-cli-transport.ts` | the launch spec's optional `settings` (the text of one JSON object; shape-checked only); `roleArgv` launches `spec.settings ?? DEFAULT_LAUNCH_SETTINGS` (`{"switchModelsOnFlag":false}`), so `@1`'s argv and body are unchanged; the gate's rules per profile (`SpawnTransportOptions.gate`, default `@1`'s); `GATE_FIELD_ALLOWLIST` is now `@1`'s rules' array |
| Task 2: the `@2` projection | `src/pipeline/claude-code-cli.ts` | `projectResponseV2`: a tolerant parse; one classification pass by rule priority over every line, before the exit check (D-7); then the exit check, the first malformed line, the strict `@2` walk with its allowlists, launch context, result, usage observed, one `modelUsage` entry, one StructuredOutput call, stop reasons, tool loop and output (D-8); eight new error classes (`CliIncludedUsageExhaustedError`, `CliCreditsRequiredError`, `CliLongContextRouteError`, `CliModelSubstitutionError`, `CliFastModeError`, `CliEffortRefusedError`, `CliPinObsoleteError`, `CliUsageUnobservedError`). `@1`'s `walkStream` to `projectResponse` and `CLAUDE_CODE_CLI_ADAPTER` have no diff hunk against `651178c` (reported, Task 2 summary) |
| Tasks 1–2: tests | `test/claude-code-cli-v2.test.ts` (new), `test/claude-code-cli.test.ts`, `test/claude-code-cli-transport.test.ts` | C1-v2, C2-v2, C5 and the full `@2` argv literal (V2-A1); the gate cases; a literal-only `@2` stream builder that never imports the profile; the committed probe fixtures transformed in memory (V-F1 to V-F4); a lone case per rule, position and API-error kind; precedence pairs; `@1` characterisation (G8) |
| Task 3: the identity carries the invocation | `src/pipeline/config.ts`, `identity.ts`, `orchestrate.ts`, `runner.ts`, `live-runner.ts`, `provider-adapter.ts` | `RoleConfig.invocation?`; `PipelineIdentityInput.invocation?`, emitted field by field and only when defined (absent is an absent key); `pipelineVersionFor` validates it (side `configuration`) and forwards it; for a live runner, after the adapter checks, a defined capability invocation is validated (side `capability`) and a difference, or one side only, is refused (`InvocationMismatchError`); replay exempt; `AgentRunner.invocation?`; `LiveAgentRunner`'s `get invocation()`; `INVOCATION_EFFORTS` (`['high']`), `InvocationSide`, `InvalidInvocationIdentityError`, `assertValidInvocationIdentity`, `invocationDifferences`, `InvocationMismatchError` |
| Task 3: tests | `test/provider-adapter.test.ts`, `test/pipeline-identity.test.ts` | the present-invocation golden, derived independently (hand-written canonical JSON hashed with `node:crypto`); "moves when" per field; extra keys move nothing; invalid invocations refused; the orchestration mismatch cases and controls; the `@2` identity literal |
| Task 4: evidence validity | `src/verification/evidence-validity.ts` (new) | `checkResultEvidence(result, corpus)` → `{ ok, sets: [{ recordPath, label, ok, problems }] }`: every `evidenceSetsOf` set, in order, through `checkEvidenceSet` exactly as `sign.ts` calls it; pure; `sign.ts` unchanged |
| Task 4: the doc sentence | `docs/evidence-use.md` | the opening sentence corrected (§`docs/evidence-use.md`) |
| Task 4: tests | `test/verification-evidence-validity.test.ts`, `test/verification-purity.test.ts` (both new) | an in-memory corpus through the production index parser; equivalence with `assertSignable` over ten schema-valid records, the accepted control and nine fixtures (`test/verification-evidence-validity.test.ts:590-600`); a TypeScript-compiler-API purity scanner over `src/verification/` |
| Task 5a: wiring | `src/cli/live-wiring.ts` | `@2` registered; `isSubscriptionRoute` matches the id `claude-code-cli`, any version, so `verify run` refuses `@2` as it refuses `@1` (`SubscriptionRouteCaptureOnlyError`) |
| Task 5a: the harness | `test/live-capture.ts` | `SUBSCRIPTION_ROLE_CONFIG` (`@2`: `claude-opus-5-5` for all three roles, the `@2` identity, the adapter's invocation), `SUBSCRIPTION_ROLE_CONFIG_V1`, `subscriptionRoleConfigFor`; the role wrapper forwards `invocation`; D-1: the route defaults to `@2`, and `@1` without an injected launch is refused (`SubscriptionRouteMismatchError`) before anything exists; from the profile: `subscriptionExecutableFor`, the controls, gate rules and settings, the summary's `requested`, `budgets` and per-version `unobserved` (`SUBSCRIPTION_V2_UNOBSERVED`); the launch timeout to the runner; the gate under its own timer (`GateTimeout`, `gate_timeout`, `subscriptionErrorOf`, `gateVerdictErrorOf`); `SubscriptionBudgetError` above `maxRoleLaunchesFor` (9 for `@2`); `subscriptionLifetimeMs` (16,470,000 for 9); `UnsupportedTimeoutError`; `projectsDirectory` and `configDirectory` redacted |
| Task 5a: transport hardening (H1) | `src/pipeline/claude-code-cli-transport.ts` | `SpawnTransportOptions.settings`; `LaunchSettingsMismatchError` before the pin check, the launch directory and the prompt file; `DEFAULT_LAUNCH_SETTINGS` exported |
| Task 5a: the agents test | `test/pipeline-live.agents.test.ts` | the local timeout renamed `subscriptionTestTimeoutMs`, computed from the export; **never run** |
| Task 5a: tests | `test/live-capture.test.ts`, `test/live-wiring.test.ts`, `test/pipeline-identity.test.ts`, `test/claude-code-cli-transport.test.ts` | `SUB_ENV_V2` (budget 9), `GATE_V2`, `syntheticStreamV2` and the `v2` dummy; V2-E1 (nine role launches end to end), V2-E2, V2-B1 to V2-B6, V2-GT1 to V2-GT11, V2-D2, V2-D3, V2-H1, V2-R1, V1-X1, W0, W9, E3b |
| Task 5b: the usage module | `test/included-usage.ts` (new; imports nothing) | `observeUsage`, `usageViolations` (sixteen facts: the plan's fifteen plus `long_context_route`), `usageStopOf` (`{ kind, facts, seq, role, index, resetsAt, note }`), `describeUsageFacts` |
| Task 5b: the harness | `test/live-capture.ts` | `observeStream` merges `observeUsage`; `redactObservation`; `@2` only: `usageStop` in every `execution.json`, the in-flight `UsageStopError` (`long_context_boundary`, `unnatural_reset`) and the post-drain `IncludedUsageUnconfirmed` backstop; both adapters: the reset-pending check before `prepareExecutionDir` (`UsageResetPendingError`) |
| Task 5b: tests | `test/included-usage.test.ts` (new), `test/live-capture.test.ts` | each fact alone with a clean control; the stops V2-U1 to V2-U13 (with lettered variants); P5 extended |
| Task 5c: trust in four tiers | `test/live-capture.ts` | `trustOf` (pure), `TRUST_METHODS` (not exported), `TrustBlock`, `TrustInputs`, `SubscriptionCommandStage`; `runSubscriptionCommand`, now exported, returns `{ outcome, stage, world, written }`; `trust` in every `@2` `execution.json` (`null` while running), no key for `@1` (trust spec §2) |
| Task 5c: tests | `test/live-capture.test.ts` | V2-T1 to V2-T10; `expectTrust` in every `@2` case that files a block (reported, 5c summary) |
| Documents | `docs/superpowers/` (repository root) | plan v2 (unchanged); the trust spec (aligned in Task 6); the Qwen spec (unchanged); this checkpoint. All four untracked |

## Verified on this tree

Each fact below says who verified it: the parent, by its log, or this
checkpoint's author ("checked here"), by a `task6-impl-*` log.

### Counts

Each task's baseline was the previous task's finishing count. Every count
below is the `Tests` line of the named log, checked here by the cited-log
check (§Checks made for this checkpoint); the rounds are reported by the
task's summary.

| After | Files / tests | Finishing log in R (parent's unless marked) | Rounds (reported) |
|---|---|---|---|
| baseline at `651178c` | 27 / 807 | `baseline-targeted-full.20260924T184330Z.log` (plan §1) | — |
| Task 0 | 27 / 812 | `parent-task0-targeted.20260925T110157Z.log` | one pass, then parent wording repairs |
| Task 1 | 27 / 851 | `parent-task1-targeted.20260925T114214Z.log` | one pass, then two parent test repairs |
| Task 2 | 28 / 1303 | `parent-task2res-targeted.20260925T145112Z.log` (after round 3: 1293, `parent-task2-targeted.20260925T143232Z.log`) | first pass and three repair rounds, then a tests-and-comments residual pass: 1106, 1181, 1258, 1293, 1303 |
| Task 3 | 28 / 1370 | `parent-task3-targeted.20260925T174959Z.log` | first pass and two repair rounds, then a parent comment-only edit: 1361, 1369, 1370 |
| Task 4 | 30 / 1475 | `parent-task4-targeted.20260925T193034Z.log` | first pass and three repair rounds: 1424, 1463, 1472, 1475 |
| Task 5a | 30 / 1515 | `parent-task5a-targeted.20260926T063640Z.log` | first pass and two repair rounds: 1498, 1510, 1515 |
| Task 5b | 31 / 1683 | no full run on 2026-09-27 was clean: `parent-task5b-r4-targeted.20260927T142622Z.log` (2 failed, 1681 passed: S9 and V2-U9e timed out) and `parent-task5b-r4-rerun-targeted.20260927T150947Z.log` (3 failed, 1680 passed: S7 and V2-U12 timed out; S8 raced, `expected 'ProcessTransportError' to be 'ExecutionCancelledError'`), judged by the 5b parent environmental or a latent race (reported); after the reboot, clean: `parent-task5c-baseline-targeted.20261014T213415Z.log` (1683 passed, 67.04 s) | first pass and four repair rounds, then a parent comment-only edit: 1635, 1659, 1674, 1676, 1683 |
| Task 5c | 31 / 1693 | `parent-task5c-targeted.20261014T232027Z.log` | first pass and one fix round (R1–R6), then a scoped re-review: 1693, 1693 |
| Task 6 (documents only) | 31 / 1693 | `task6-impl-targeted.20261014T234634Z.log` (checked here: 75.51 s, exit 0) | — |

- **Scope of the counts.** Every count above is of the targeted set only: the
  31 paths of the 5c brief's start state (the 27 baseline paths of plan §1
  and HANDOVER-2026-09-25, plus `test/claude-code-cli-v2.test.ts` from Task 2,
  the two Task 4 files and `test/included-usage.test.ts` from 5b, as
  HANDOVER-b, HANDOVER-c and HANDOVER-2026-09-28 list them). In this
  migration neither the engine's full default suite nor the repository-root
  `npm test` was run, as far as R records: no run in R reports more than 31
  test files, and none is a frontend run (checked here,
  `task6-impl-r1-no-full-run.20261015T004424Z.log`).
  The full default suite is `npx --no -- vitest run` from `backend/engine`,
  whose `vitest.config.ts:23-31` includes `test/**/*.test.ts`, excludes
  `test/**/*.agents.test.ts` and installs the offline and process guards as
  setup files: it would collect 77 test files, the 31 targeted ones and 46
  more (counted here with `/usr/bin/find`, nothing run,
  `task6-impl-r1-suite-files.20261015T003909Z.log`). The root `npm test` runs
  both workspaces, the frontend's tests included (`package.json`:
  `npm test --workspaces --if-present`). The authorisation covered targeted
  offline tests (HANDOVER-2026-09-25, "Authorised"), so both runs are left as
  the user's gate before committing; the default suite's own header says it
  "blocks commits" (`vitest.config.ts:4`). `CHECKPOINT-b-cli-adapter.md`
  reported both for its phase (its lines 32 and 117); this checkpoint does
  not.
- **Typecheck and csrd.** Engine `npx --no -- tsc --noEmit` exit 0 and root
  `npm run typecheck` exit 0 at every task's finish, and the csrd count 7 in
  the six expected files (checked here in each log,
  `task6-impl-r1-typecheck-logs.20261015T004304Z.log`). The parent's final
  set per task, engine tsc / root typecheck / csrd: Task 0
  `parent-task0-engine-tsc.20260925T110229Z.log`,
  `parent-task0-root-typecheck.20260925T110230Z.log`,
  `parent-task0-csrd.20260925T110233Z.log`; Task 1
  `parent-task1-engine-tsc.20260925T114246Z.log`,
  `parent-task1-root-typecheck.20260925T114247Z.log`,
  `parent-task1-csrd.20260925T114250Z.log`; Task 2
  `parent-task2res-engine-tsc.20260925T145144Z.log`,
  `parent-task2res-root-typecheck.20260925T145145Z.log`,
  `parent-task2res-csrd.20260925T145148Z.log`; Task 3
  `parent-task3-engine-tsc.20260925T175031Z.log`,
  `parent-task3-root-typecheck.20260925T175033Z.log`,
  `parent-task3-csrd.20260925T175035Z.log`; Task 4
  `parent-task4-engine-tsc.20260925T193106Z.log`,
  `parent-task4-root-typecheck.20260925T193108Z.log`,
  `parent-task4-csrd.20260925T193110Z.log`; 5a
  `parent-task5a-engine-tsc.20260926T063732Z.log`,
  `parent-task5a-root-typecheck.20260926T063734Z.log`,
  `parent-task5a-csrd.20260926T063736Z.log`; 5b
  `parent-task5b-r4-rerun-engine-tsc.20260927T152701Z.log`,
  `parent-task5b-r4-rerun-root-typecheck.20260927T152704Z.log`,
  `parent-task5b-r4-rerun-csrd.20260927T152710Z.log`; 5c
  `parent-task5c-engine-tsc.20261014T232142Z.log`,
  `parent-task5c-root-typecheck.20261014T232144Z.log`,
  `parent-task5c-csrd.20261014T232146Z.log`. Checked here after Task 6: engine
  tsc exit 0 (`task6-impl-engine-tsc.20261014T234816Z.log`), root typecheck
  exit 0 (`task6-impl-root-typecheck.20261014T234823Z.log`), csrd 7, as
  `cli/assess.ts` 1, `engine/summary.ts` 1, `monitoring/register.ts` 1,
  `monitoring/types.ts` 1, `types.ts` 1, `verification/render.ts` 2
  (`task6-impl-csrd.20261014T234831Z.log`, with the `--untracked` command of
  plan §2).
- **Untouched** (checked here, `task6-impl-untouched.20261014T234611Z.log`):
  `git diff` against HEAD is empty, and no untracked entry exists, for
  `src/verification/sign.ts` (blob `52425af0633d840110735187a428fa99bede998b`,
  HEAD's; sha256 `6e21a7ddd42f041d8045d5001f0fd655aa9067d8ea84bb5561215b032949dcd4`),
  `src/pipeline/anthropic-messages.ts`, `src/pipeline/transcript.ts`,
  `src/pipeline/role-outputs.ts` (sha256
  `decf7a9515d9468a7c2b80ef176f8580f3169e61d0821d0b969e0bb7ab0dfcd3`),
  `src/pipeline/write-result.ts`, `test/pipeline-replay.test.ts`, every
  recording under `test/verification-transcripts/`, the committed probe
  fixtures `test/fixtures/claude-code-cli/`, `corpus/`, `knowledge/` and
  `verification/`. The production execution root `test/live-executions/` does
  not exist in the candidate. `git status` shows 29 entries (18 modified, 6
  new engine files, the 3 untracked documents, the 2 `node_modules` symlinks),
  30 with this checkpoint.
- **No new dependency**: no `package.json` or lock file differs from HEAD
  (checked here, `task6-impl-untouched-b.20261014T235911Z.log`).

### Changed-file hashes

Every changed or new code, test and document file, computed here after the
finishing runs and machine-checked: the table extracted to a
`shasum -a 256 -c` file, 27 of 27 OK
(`task6-impl-sha-check.20261015T000130Z.log`); with one hex digit changed in
the extracted copy the check failed on that file, and passed again once the
copy was restored from its backup and confirmed by hash
(`task6-impl-sha-check-control.20261015T000142Z.log`). Fix round 1 changed
only the trust spec's row; the same check and control were run again on this
text, and the fix report names those runs. Paths are from the repository
root. This checkpoint cannot carry its own hash; the Task 6 reports do.

| File | Changed by | sha256 |
|---|---|---|
| `backend/engine/docs/evidence-use.md` | 4 | `79e6ef6ee10c04b92504d10faf6c5dc3ebc9bd44b5077acdb07bb745ee5f7528` |
| `backend/engine/src/cli/live-wiring.ts` | 5a | `6617734984804a5dea60a7814c63d27789cebbc741028c0bc8f536aff3f98b15` |
| `backend/engine/src/pipeline/claude-code-cli-transport.ts` | 1, 5a | `98ccfb8dc0b47978342f59bafa7f26e9da53246b380bdfeb672f55c6bbfeb5a6` |
| `backend/engine/src/pipeline/claude-code-cli.ts` | 1, 2 | `7bebe5f812c1539fdbab7d119c105c114da17e33cf825a050f7570b1f5d03bf7` |
| `backend/engine/src/pipeline/config.ts` | 3 | `42228328b7d221499e1b0c992882ef6889b64f7b6ae759c4099dd3d75f98f864` |
| `backend/engine/src/pipeline/identity.ts` | 3 | `229d884075bf3aa10ae5719c0fe3c2a08302dc3c12f0fe5fb8a52d50f077eb8e` |
| `backend/engine/src/pipeline/live-runner.ts` | 3 | `0b8faf772dda919d987a8a6cd69909f8f673caabc54ceaa6132703cb47a201a9` |
| `backend/engine/src/pipeline/orchestrate.ts` | 3 | `494f7583e1c3eb81351873ff76ccc68d413fef3c182bcd137f16590b6d812d9c` |
| `backend/engine/src/pipeline/provider-adapter.ts` | 1, 3 | `43d82d2a84d14a872300284472ebaae4702ed8cd336140d5bd3534c0b7587ff9` |
| `backend/engine/src/pipeline/runner.ts` | 3 | `d2dc03ea2e32976fb3f81b033ff033317ba52e2e50863ad67593caa0ae93dff8` |
| `backend/engine/src/verification/evidence-validity.ts` | 4 (new) | `e3368b60a8c11217232c224b0b60edfacf9793721d383d80081dab8b8f7c13f4` |
| `backend/engine/test/claude-code-cli-transport.test.ts` | 1, 5a | `27a7ebb46ac43db0fb0471751bf9619ee2769d16a1ba976b78003c64d666fadb` |
| `backend/engine/test/claude-code-cli.test.ts` | 1, 2 | `4d66b5023b8b5de4c41c943525d0d722ecfed7b7d0117ad84b750c9d30059a71` |
| `backend/engine/test/claude-code-cli-v2.test.ts` | 2 (new) | `5f8ccbd3f1953c347761cffc495a7e6d34d9be065083aa12dd9bddcdcfe7e594` |
| `backend/engine/test/included-usage.ts` | 5b (new) | `b3943e3e53b94236e64fade3aa9a2b3ed260bb0333e2974b5e7325354c38f31b` |
| `backend/engine/test/included-usage.test.ts` | 5b (new) | `c7cefd23302af8b823161d1038f81c1c73eb0658cff84cae0ed75df1460097aa` |
| `backend/engine/test/live-capture.ts` | 5a, 5b, 5c | `e82ed41cfc67f91704f53acc541e61631e92cac9e22b1ab29c355b8217d5e6c8` |
| `backend/engine/test/live-capture.test.ts` | 5a, 5b, 5c | `d8a5f59510d9a60139df79058276e10f509fe01d9606953fe0050e45b72f9dce` |
| `backend/engine/test/live-wiring.test.ts` | 5a | `ba9c776178d24975fa00d216077ab37b0f96cdd72e1cfaf46b872118cf7fa168` |
| `backend/engine/test/pipeline-identity.test.ts` | 0, 3, 5a | `e98e372a0f1086fb56b429a0e9b6db0ffa43da1a31e9881a2147b43835e7af06` |
| `backend/engine/test/pipeline-live.agents.test.ts` | 5a (rename only; never run) | `4688a53293ee13029533384616c7786c9748af1848abae658d893762f1bc47e3` |
| `backend/engine/test/provider-adapter.test.ts` | 3 | `b3df456d7b2b06ae801fc2e4456604593c1fe5f7b20ec194da1c518c3700159c` |
| `backend/engine/test/verification-evidence-validity.test.ts` | 4 (new) | `30826ac3777602b8f50e76dec317dc520df8f4cb16e3fce6f0fba24a2ef5bc23` |
| `backend/engine/test/verification-purity.test.ts` | 4 (new) | `0bf8d6431a22f92b75fe295e26f5f1ca2433b4b9a03acf31e687af0b201cdb92` |
| `docs/superpowers/plans/2026-09-25-opus55-subscription-migration.md` | plan v2, unchanged | `7549fe6c6289542a3a48282d7f7f8afc875a96540fc84842cf1d2a065f053e0d` |
| `docs/superpowers/specs/2026-09-25-local-qwen-assistance-design.md` | unchanged | `bda6ec0812a35d20b701c0293d6e5e50a717298b79fe0f8d67c329bb312d3a9d` |
| `docs/superpowers/specs/2026-09-25-trust-measurement-and-evaluation-design.md` | 6 (drafted `00d48027de979ce37294495b4860774c12def316d939a593c6ea421d367ddb4b`) | `5a209dff1859236489a0d332cb5df7d0f656ca507ad6f40dc8ed293aba081830` |

## Identities and pins

The literals the tests pin (each located here with `git grep -n`,
`task6-impl-literals.20261015T000045Z.log`):

| Identity | Value | Pinned at | State |
|---|---|---|---|
| `GOLDEN_IDENTITY` (no invocation) | `pipeline-v3-1d566c9903cb90711e3e52750460759d4c87a5900765d4349c61eca37e285b7c` | `test/provider-adapter.test.ts:110` | unmoved: the same literal is in HEAD's file |
| HTTP (`DEFAULT_ROLE_CONFIG`) | `pipeline-v3-06789a364d220899535cbf0cc40fcd5b816becf4328be70b795f54340d4ad7c0` | `test/pipeline-identity.test.ts:417` | unmoved; equal to the committed S-001 recording (`test/verification-transcripts/csrd/CSRD-S-001/run-v1-8717925d731334f6162bdc2fd35a230d3bde7a5d1dc66588db5f5544a0748310.json`) |
| `@1` subscription (`SUBSCRIPTION_ROLE_CONFIG_V1`) | `pipeline-v3-fd3ed34d558145c09ef7105506c76767d1dc335ce2d82d57fbc6e2c148509ae5` | `test/pipeline-identity.test.ts:415`, `test/live-capture.test.ts:2197` | unmoved (Task 0) |
| present-invocation golden (over `goldenInput()`) | `pipeline-v3-002ec70e66b27d39ffb742112ec22d5b96812221b4012ffc8bb5fdece59f4237` | `test/provider-adapter.test.ts:152` | new (Task 3) |
| `@2` subscription (`SUBSCRIPTION_ROLE_CONFIG`) | `pipeline-v3-e0570a0805b3df74fd2e391f8a1b8594dd1f1ada487d51a67e9215fcfd48f690` | `test/pipeline-identity.test.ts:526`, `test/live-capture.test.ts:2196` | new (Task 3): taken by a placeholder run and reproduced by an independent hand-written canonical JSON hashed with `node:crypto` (reported, Task 3 summary) |

The `@2` invocation, declared by `CLAUDE_CODE_CLI_V2_ADAPTER` and read from its
profile (literal in `test/claude-code-cli.test.ts:1189-1192`, C5, and
`test/pipeline-identity.test.ts:506-510`):

```text
{ effort: 'high', maxOutputTokens: 64000, executable: { version: '2.1.280', sha256: '862db5f39398606acd531777565505e14c792b9da72fd31df0b309b8eb55406e' } }
```

The `@2` profile's pin as recorded (`src/pipeline/claude-code-cli.ts:375-382`):
`~/Library/Application Support/Claude/claude-code/2.1.280/claude.app/Contents/MacOS/claude`,
version 2.1.280, sha256
`862db5f39398606acd531777565505e14c792b9da72fd31df0b309b8eb55406e`,
217,221,744 bytes. Plan D-4 records the file as observed read-only on
2026-09-24 and 2026-09-25 (reported). `@1`'s pin is unchanged
(`PINNED_CLI`, `src/pipeline/claude-code-cli.ts:200-206`):
`~/.local/share/claude/versions/2.1.226`, version 2.1.226, sha256
`013a1cf17df5ff1dcc189d5d6fd3fdd5f097ddc3cd41aa9992e99805574febbe`,
279,661,952 bytes.

## The pin today (a finding of this checkpoint)

Superseded on 2026-10-15: `@2` now pins a preserved, read-only copy of the desktop-managed Claude Code 2.1.295 bundle, outside the updater's directory, with this checkpoint's facts below kept as recorded; see `CHECKPOINT-opus55-pin-2.1.295.md`.

The parent listed the pin directories read-only (nothing executed or hashed)
between 2026-10-14T21:45:37Z and 21:46:07Z, that is 2026-10-15
03:15 to 03:16 IST: `parent-task6-pin-presence.20261014T214537Z.log` (its last
line, a glob with a zsh qualifier, failed with `bad pattern`; kept),
`parent-task6-pin-presence-b.20261014T214601Z.log` and
`parent-task6-pin-presence-c.20261014T214607Z.log`. The facts below are read
here from those logs. This checkpoint's author opened, listed and hashed
nothing under `~/Library/Application Support/Claude/` or
`~/.local/share/claude/`.

- The desktop app's `claude-code` directory holds a single version directory,
  `2.1.295` (dated Oct 10 05:19 in the listing), under a new layout:
  `2.1.295/9d6405864fdc/` holding `claude.app` and, beside it, an entry named
  `.verified` (the last line of `parent-task6-pin-presence-c.20261014T214607Z.log`;
  its name only, its type not shown and its contents not read), with
  `claude.app/Contents/` holding `CodeResources`, `_CodeSignature`, `MacOS`
  and `Info.plist`. The old-layout path
  `2.1.295/claude.app/Contents/MacOS/claude` is absent. The listing stops at
  the `MacOS` directory, so no 2.1.295 executable was listed, and its version,
  size and sha256 are unrecorded.
- D-4's pinned 2.1.280 executable is **absent**, and so is any `2.1.280`
  directory.
- The `@1` pin is present: `~/.local/share/claude/versions/2.1.226`, 279661952
  bytes in the listing (not hashed), and `~/.local/bin/claude` still links to
  it.

The consequences, read from the code and the plan (none was run against the
real HOME):

1. **Every `@2` execution would now be refused at the pin check, before any
   launch.** `verifyExecutablePin` (`src/pipeline/claude-code-cli-transport.ts:409-422`)
   cannot `stat` an absent file and reports it `not readable`; the gate's
   `assertPin` (`:925-928`, called at `:974`) then throws
   `ExecutablePinMismatchError`. V2-D2 (`test/live-capture.test.ts:2757`)
   shows this offline under a HOME where the pin does not exist: the
   execution directory is created, `execution.json` is filed `failed` with
   `ExecutablePinMismatchError` and the message `executable pin mismatch: …
   not readable (ENOENT)`, its trust block is `failed` / `unassessed` /
   `unassessed`, and no gate or role launch happens.
2. **D-4's alternative (a), a read-only copy of the 2.1.280 bundle, can no
   longer be made from the desktop app's directory**, which no longer holds
   it. No other copy of the 2.1.280 bundle is recorded in this review's
   sources.
3. **Any new pin moves the `@2` invocation and the `@2` identity.** A copy of
   a newer desktop bundle (such as the 2.1.295 one) or a standalone install
   (D-4 (b)) has a different version and a different sha256, so the `@2`
   profile's pin, the adapter's declared invocation, the `@2` identity literal
   `pipeline-v3-e0570a08…f690` and every test literal of the 2.1.280 pin move
   with it (D-3: the invocation is an identity input; Task 3's "moves when"
   cases).
4. **None of plan §0's static facts has been checked on any other build.**
   They were established on 2.1.280 only, read-only and with nothing
   executed: the list quoted below (`strings` read through `/usr/bin/grep`;
   reported by HANDOVER-2026-09-25), and what the plan states of 2.1.280
   besides: that it defaults `autoContinueAtUsageLimit` to on (D-6), honours
   output-ceiling values up to the model's upper limit (D-5, "static"), states
   that a request over a 200K-token context needs usage credits (D-5), has
   seven new system subtypes (D-8), and that its `auth status --json` adds
   `analyticsDisabled`, `projectsDirectory` and `configDirectory`
   (HANDOVER-2026-09-25, Task 1).

   Verbatim, `HANDOVER-2026-09-25.md` lines 171-178:

   ```text
   From `strings` on the 2.1.280 binary, read with `/usr/bin/grep` and nothing executed:
   - It knows `claude-opus-5-5`; 2.1.226 and 2.1.275 don't.
   - `--json-schema` becomes an unforced StructuredOutput tool (`toolChoice` undefined; a forced tool is demoted to auto when thinking is on).
   - The refusal-fallback gate is `!CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK && !CLAUDE_CODE_NO_MODEL_FALLBACK`.
   - `overageStatus` values are `allowed`, `allowed_warning` and `rejected`. `rateLimitType` values include `overage` and `seven_day_overage_included`.
   - API-error kinds: `model_requires_usage_credits`, `long_context_credits_required`, `model_substitution_disabled`, `no_allowed_fallback`, `consent_unanswered`, `claude_code_version_too_old`, `effort_requires_thinking`, `safety_monitor_blocked`.
   - `fast_mode_state` is optional.
   - The embedded catalog runs from 2026-09-20T14:56:08Z to 2026-09-27T14:56:08Z.
   ```

5. **A new pin can still be `@2`.** D-4 (b) states the rule: a new pin "can
   still be `@2` if no `@2` execution exists yet, otherwise it is `@3`". No
   `@2` execution exists: no task was authorised a live step, and
   `test/live-executions/` does not exist in the candidate (checked here,
   `task6-impl-untouched.20261014T234611Z.log`); the
   main checkout was not inspected.
6. **The 2026-09-27 sighting of Claude Code 2.1.281 beside 2.1.280** (a
   process listing, not stat'ed or hashed; 5b summary, "Environment notes") is
   superseded by this observation.

## Teeth re-run by the parent

Each task's teeth ran through the parent's runner (backup, an exact-once
mutation, the landed count and diff, the targeted run, restore and a sha256
check, as HANDOVER-2026-09-25-b describes `teeth.py`). What each summary
records differs, and only that is reported here:

- **who wrote them**: the Task 3, 4, 5a, 5b and 5c summaries say the parent
  wrote them from the code; the Task 2 summary says its 72 specs were
  "re-run through the parent's own runner", red "on the implementer-reported
  targeted cases"; the Task 0 and 1 summaries list them as parent teeth;
- **the failure messages**: the Task 1, 3, 4, 5a and 5c summaries say each
  red's first failure message was read and was the intended one (Task 1: "each
  red naming the intended assertion"); the Task 0, 2 and 5b summaries record
  the red cases and the restores only;
- **the restores**: every summary records them confirmed by sha256.

The summary and per-run logs named are in R. Every failure message quoted
below was read here in its per-run log; the rest of each row is the
summary's.

### Task 0 (`parent-task0-review-summary.20260925T110333Z.log`): 9 parent teeth

| Plan tooth | Parent mutant | Red on |
|---|---|---|
| change one prompt byte on a copy of a test input → both literals red | 0.1 prompt byte | the 2 literal digest cases |

The other eight: 0.2a `@1` version (the `@1` digest and identity literal red,
HTTP green); 0.2b HTTP adapter (HTTP digest red only); 0.3 HTTP literal (the
digest and the S-001 recording case red); 0.4 an extra config field (the first
conjunct red); R1 `invocation: null` in `identityPayload` (both literal
digests red, 30 others green; the baseline for Task 3's tooth 1); R2 the `@1`
config with the HTTP adapter (the middle conjunct red); R3 the `@1` literal
equal to the HTTP literal (the last conjunct red); and R4, the S-001 closure,
**green as a characterisation**: the closure enters the identity only through
its policy. So 8 red and 1 characterisation.

### Task 1 (`parent-task1-review-summary.20260925T115304Z.log`): 21 parent teeth

| Plan tooth | Parent mutant | Red on |
|---|---|---|
| 1. one profile constant changed → C1-v2 reds, naming that field | T1 pin sha | C1-v2 (sha256 diff) and C5 (invocation) |
| 2. the settings fallback taken for `@2` → the argv literal reds at the settings element | T2 | V2-A1 `argv[14]` (and V2-S3) |
| 3. the directory keys off the identifier list → the "no directory value" case reds | T3 | V2-G1, the reproduced value (and the C3-v2, V2-G3, V2-G5 fields) |
| 4. `--tools ''` dropped from `roleArgv` → both argv literals red | T4 | V2-A1 and V1-A1 at `argv[6]`; the pre-existing `@1` argv test reds first at its prompt-path position check |

The other seventeen: T5–T10 (six by the parent), R1–R5e (ten closing reviewer
gaps), and S1, a known survivor recorded green: the `@2` projection delegating
to `@1` was caught by nothing until Task 2, whose T15 reds 289 tests (closed).

### Task 2 (`parent-task2-teeth-summary.20260925T143335Z.log`; per-run `parent-task2-teeth-T01-…` to `-T14-…`): 72 parent teeth, plus the residual pass's 6

| Plan tooth | Parent mutant | Red on (a named case's failure, as logged) |
|---|---|---|
| 1. classification after the exit check | T01 | 34 cases, among them V-R rule 2 exhaustion at exit 1: `expected 'CliExitError' to be 'CliIncludedUsageExhaustedError'` |
| 2. line order instead of rule priority | T02 | V-Q1 to V-Q9; V-Q9, exhaustion over substitution: `expected 'CliModelSubstitutionError' to be 'CliIncludedUsageExhaustedError'` |
| 3. exhaustion ordered before overage | T03 | V-Q10: `expected 'CliIncludedUsageExhaustedError' to be 'CliOverageError'` (and V-U-window, V-Q1) |
| 4. `fallback` removed from the substitution signals | T04 | the fallback content block and the fallback assistant item: `expected 'CliStreamLifecycleError' to be 'CliModelSubstitutionError'` |
| 5. the block allowlist removed | T05 | V-W-block (`server_tool_use`) accepted: `expected undefined to be 'CliStreamLifecycleError'` |
| 6. `canonicalModel` removed | T06 | the canonicalModel substitution cases accepted: `expected undefined to be 'CliModelSubstitutionError'` (and V-A4, V-L, V-Q5) |
| 7. the `<synthetic>` API-error exemption removed | T07 | V-F3 (F3-v2): `expected 'CliModelSubstitutionError' to be 'CliExitError'` (29 failed) |
| 8. `model_refusal_no_fallback` as substitution | T08 | V-P1: `expected 'CliModelSubstitutionError' to be 'ProviderRefusalError'` (and V-Q5) |
| 9. `overageStatus` back to `=== 'allowed'` | T09 | `overageStatus` `allowed_warning`, on the event and in a window: `expected 'CliUsageUnobservedError' to be 'CliOverageError'` |
| 10. rate-limit presence dropped | T10 | V-U-event: `expected undefined to be 'CliUsageUnobservedError'` |
| 11. only the last rate-limit event classified | T11 | V-Q11: `expected 'CliUsageUnobservedError' to be 'CliIncludedUsageExhaustedError'` (and V-Q10, V-H1, V-H2) |
| 12. truncation message not overridden | T12 | X1: `expected 'adjudicator[0]: the model\'s output s…' to match /64000/`; V-T1 to V-T3: `expected 'reader[0]: the model\'s output stoppe…' to contain 'the model\'s output stopped at max_to…'`; the V-R rule-7 cases at exit 0 and exit 1, and V-Q7: `… to contain 'stopped at max_tokens (64000)'` |
| 13. the credit-kind rule removed | T13 | 33 failed, among them V-R rule 3 credits at exit 1: `expected 'CliExitError' to be 'CliCreditsRequiredError'` |
| 14. the tolerant parse removed | T14 | V-Q12: `expected 'CliStreamMalformedError' to be 'CliOverageError'` (and V-D1) |

The other 58 (T15–T24, RT1–RT10, RX1–RX4, SS1–SS12, SX1–SX3, UU1–UU6, UU7b,
UX1–UX3, LA–LI): 72 of 72 red on the implementer-reported cases with matching
counts, 72 of 72 restored by sha256. The residual pass's six (RA, RB, RB2, RC1,
RC2, RD) were each red only on its case and restored
(`parent-task2-review-summary.20260925T145214Z.log`).

### Task 3 (`parent-task3-teeth-summary.20260925T175046Z.log`, part A, 27; `parent-task3-teeth-summary.20260925T175120Z.log`, part B, 23): 50 parent teeth

| Plan tooth | Parent mutant | Red on |
|---|---|---|
| 1. absent encoded as `null` → `GOLDEN_IDENTITY` and the S-001 binding red | T01-absent-as-null | 25 red: `GOLDEN_IDENTITY`, both Task 0 literals and 20 `pipeline-replay` S-001 binding cases among them (Task 3 summary) |
| 2. `pipelineVersionFor` not forwarding → the 63,999 case reds | T02-not-forwarded | 4 red: the 63,999 case, the invocation-removed case, the `@2` literal and a positive control |
| 3. the mismatch check removed → the three cases red, the controls green | T03-check-removed | 7 refusals red, the three mismatch cases among them; 5 controls green |

The other 47 cover `undefined` emitted as present, each validator rule, each
compared field, the replay exemption, ordering, exposure, the emission spread,
each emitted field, the effort set, runner-side validation, its gate and its
absence, deep and reference equality, bind ordering, `pipelineVersionFor`
validation, and messages and sides. All 50 red on the named cases with the
named controls green, and every file back at its pre-teeth hash.

### Task 4 (`parent-task4-teeth-summary.20260925T193120Z.log`, 20; `parent-task4-teeth-summary.20260925T193132Z.log`, 18): 38 parent teeth

| Plan tooth | Parent mutant | Red on |
|---|---|---|
| 1. `checkEvidenceSet` bypassed → the fabricated case reds | P1-bypass | 19 red, the fabricated case among them |
| 2. one kind filtered inside `checkResultEvidence` → equivalence reds, naming that label | P2-filter-reading, P2-filter-challenge, P2-filter-adjudication | 16, 10 and 12 red: the per-kind case and the equivalence rows |
| 3. `import { readFileSync } from 'node:fs'` planted in `evidence-validity.ts` → the purity test reds, naming the file | P3-plant-node-fs | 2 red: the real scan |

The other 33 cover the third tooth's siblings (a bare `path`, `require`, a
dynamic import, a store value import, an allowlist-violating import, a
`Date.now()` global), first-set-only and skip-last, writes to the result and
the corpus, problem order (truncated, sorted either way), U+00A0 dropped from
`normalize.ts`, the enumeration's adjudication path, and each scanner rule
(S1–S15). The summary records one parent expectation-string error: "one parent
expectation string, S9's, was worded 'class extends Date' where the case is
named 'a class expression that extends Date': that exact row is the one red".

### Task 5 (5a, 5b, 5c)

| Plan tooth | Sub-task and parent mutant | Red on |
|---|---|---|
| 1. exact-version `isSubscriptionRoute` | 5a P01 | W9 |
| 2. the budget cap removed | 5a P02 | V2-B2 |
| 3. the gate timer removed → names `deadline of 5000 ms` | 5a P03 | V2-B3: `expected 'deadline of 5000 ms' to be 'gate_timeout'` (and V2-GT10, V2-GT11; V2-GT6 a collateral vitest timeout) |
| 4. the evidence tier derived from "written" | 5c P01 | V2-T4: `trust.evidenceValidity.status: expected 'passed' to be 'failed'`; the V2-T1 fabricated row |
| 5. the evidence tier computed before withholding → names `passed` | 5c P02 | V2-U11: `trust.evidenceValidity.status: expected 'passed' to be 'withheld'`; V2-T9, V2-T10 |
| 6. the harness passing `LAUNCH_CONTROL_ENV` | 5a P06 | V2-E2 |
| 7. the wrapper not forwarding `invocation` → names `InvocationMismatchError` | 5a P07 | V2-E1 (and F1, V2-E2, V2-B4); the log shows `InvocationMismatchError` |
| 8. the post-drain `usageViolations` call removed → status `completed` | 5b H01 | V2-U11: `expected 'completed' to be 'failed'` |
| 9. each `usageViolations` fact removed | 5b Q01–Q30, Q36–Q38 | one lone case per fact and per repaired trigger |
| 10. the `@1` spawn refusal removed | 5a P10 | D1 |
| 11. the reset-pending check removed | 5b H07 | V2-U9, V2-U9c, V2-U9d |
| 12. the profile launch timeout not passed to the runner | 5a P12 | V2-B4, and V2-E1's count of timers armed at 1,800,000 ms |

- **5a** (`parent-task5a-teeth-summary.20260926T064039Z.log`): 40 parent teeth,
  38 red on the named cases (the seven plan teeth above and 31 more: the gate
  rules not passed, each redaction key, the V1 configuration given an
  invocation, the `@2` configuration replaced by V1's, H1's comparison
  removed, the settings not handed, the first case's HTTP lifetime, the HTTP
  rule exact to `@1`, the lifetime terms, the registry without `@2`, the `@2`
  configuration without invocation, `unobserved` swapped each way, the D-1
  refusal's conjuncts and prefix, the default executable, the cap literal, the
  reader schema text's sha pin, the override check, and the gate-timer rows).
  Two characterisation survivors, green as expected.
  Verbatim, `parent-task5a-review-summary.20260926T071152Z.log` line 16:

  ```text
  - 2 characterisations GREEN as expected (recorded survivors): S01 a verdict read after the timer is decided before or after gate.pass (no case orders the two); S02 `phase = 'roles'` removed (dead state kept as defence in depth, observable only directly).
  ```

  One parent spec error: A06's expected text `LaunchSettingsMismatchError`;
  the red names the property (9 role children launched).
- **5b** (`parent-task5b-pure-teeth-summary.20260927T212633Z.log`, Q01–Q39;
  `parent-task5b-harness-teeth-summary.20260927T215444Z.log`, H01–H25;
  re-runs in `parent-task5b-pure-rerun-teeth-summary.20260927T214425Z.log`
  (Q08, Q38), `parent-task5b-harness-rerun-teeth-summary.20260927T222320Z.log`
  (H05) and `parent-task5b-teeth-H05x-v2e1-only.20260927T230613Z.log`): 64
  parent teeth, all red on the named cases. Verbatim,
  `parent-task5b-review-summary.20260927T233514Z.log` lines 22-24:

  ```text
  - Harness teeth ran only their named red cases and green controls (vitest -t), a parent choice: full-file runs took 10-20 min and hung intermittently.
  - All 64 red on the named cases. Plan teeth 8 (H01: V2-U11 'completed'), 9 (Q01-Q30, one per fact and per repaired trigger, plus Q36-Q38), 11 (H07: V2-U9, V2-U9c, V2-U9d). In-flight (H03, H04), @2-only (H05, H06), reset-pending (H08-H19, H24, H25), redaction (H20-H23), usageStopOf (Q31-Q34), independence scan (Q35, Q39).
  - Controls: U-C2 (Q01) and U-N3 (Q16) red as legitimate collateral: each carries the mutated rule's positive control; V2-E1 under H06 red as legitimate collateral (its @1 control capture fails when @1 is held to the rules). Environmental: Q08's first run collected no test (vitest worker timeout loading typescript.js), re-run red as named; Q38's and H05's V2-E1 control timed out, V2-E1 green under Q38 re-run and under H05 run alone.
  ```

- **5c** (`parent-task5c-teeth-summary.20261014T232159Z.log`, P01–P29b): 31
  parent teeth, all red on their named cases, each first failure read; P29a
  (the record guard dropped) red as a crash, `TypeError: Cannot read
  properties of null (reading 'reading')`, not an assertion-named red, and
  recorded as such. The per-mutant list is in that log and in
  `parent-task5c-review-summary.20261014T232611Z.log`, which records the two
  parent spec errors, verbatim (line 23):

  ```text
  - Parent spec errors (not code defects): P14/P15 listed V2-U11 as a green control, but since 5c V2-U11 carries a clean control that measures passed, so its red is legitimate collateral (read: the control's assertion); P29b expected a TypeError, but the measurement over a null corpus returns failed (an assertion-named red, better than predicted).
  ```

  Plus the implementer's 13, each red on the intended assertion and restored
  (reported): 9 in the first pass (`task5c-impl-teeth-*-final.*.log`) and 4 in
  fix round 1 (`task5c-impl-r1-teeth-*.log`).

## Decisions taken during execution

Every parent decision, verbatim from its source. Each quote names its
source's lines, and the section they sit in where the source has one.

**Tasks 0, 1 and 2.** Verbatim, `HANDOVER-2026-09-25-b.md` lines 59-85
(section "Parent decisions to record in the Task 6 checkpoint"):

```text
Task 0
- The HTTP literal is the S-001 recording's value; a case reads the committed recording to prove it. The `@1` subscription literal (`pipeline-v3-fd3ed34d…ae5`) was taken from today's code by a placeholder run and is corroborated (not independently derived) by `pilot-evidence/2026-09-24-s002-capture-prep/README.md:104`. The closure enters the identity only through its policy (`CLOSURE_POLICY_V1`), so the S-002 closure's documents are not pinned by these literals (they are pinned by `corpusClosureSha256`).
- The implementer ran a read-only `git status` in the main checkout (a rule-1 breach, disclosed). Parent check: status unchanged, worktree index mtime unchanged (Sep 22). Since then only the parent touches the main checkout.

Task 1
- `@1`'s profile records `settings: null`, `launchTimeoutMs: null`, `gateTimeoutMs: null` (it has no timers or settings of its own; its effective `--settings` is the transport fallback `{"switchModelsOnFlag":false}`, and its effective launch timeout is the runner default 600,000 ms). `permittedModels ['claude-opus-5']` is recorded, not enforced.
- `GATE_FIELD_ALLOWLIST` keeps its name, value and order but is now the frozen `@1` rules' array (pinned by V2-G6, a parent-added test).
- `@2`'s controls spread `@1`'s `LAUNCH_CONTROL_ENV` then override/add; C2-v2 pins all 11 as literals.
- `@2` makes `@1`'s refusals (API key, message shape) before the permitted-model check (pinned by R3-v2).
- The C1-v2 invocation literal was moved by the parent into C5 so a changed pin reds C5 too (derivation evidence).
- The transport's settings check is shape-only (any JSON object passes); only adapter-written bodies reach it.

Task 2 (the plan's D-6/D-7/D-8 are the specification; these go beyond its wording under D-8's "Unknown means refused")
- Deviations accepted from the first pass: refusal/truncation errors cannot name a line (anthropic-messages.ts untouched); the result step refuses an assistant API-error item in a success stream; stop_reason is read on assistant items too; an assistant event without a content array is refused; `CliStopReasonError` gained an optional position argument (`@1`'s message byte-identical).
- R1 `usage.speed: null` is exempt only on an `is_api_error_message` item's usage; elsewhere null is fast mode.
- R2/S7 API-error kinds are read from `error`, `apiError` and `api_error` (every string candidate), on flagged assistant items and system `api_error` events.
- R3/S2/U1 `unifiedWindows`: non-object entries refused; every object at any depth is read; utilization must be a number in [0,1] (negative refused, top level too); a rejected window anywhere is exhaustion, overage facts anywhere are overage; any key or string value containing "overage" (case-insensitive) is refused except D-6's own overage fields.
- R4 `fast_mode_state` must be exactly "off" at init and result (beyond on/cooldown).
- R5 a system `status` event must carry status "requesting" ("compacting" refused).
- R6/S3 user content must be a non-empty array of `tool_result` items only. U6 assistant content must be non-empty.
- R8 first hit by line within a rule; R9 refusal category/explanation read from `apiRefusalCategory`/`apiRefusalExplanation` for `safety_monitor_blocked` and `model_refusal_no_fallback`; R11 the model check skips every flagged API-error item (safe because the result step refuses such items in a success stream).
- S1/U5 result `stop_reason` must be "tool_use" or "end_turn" and equal the last completed message's; a result with no completed message is refused; unflagged assistant items must state null/"tool_use"/"end_turn".
- S6/U3 any event other than a flagged assistant API-error item or a system `api_error` event carrying an `error`/`apiError`/`api_error` key is refused.
- S8 the result restatement is compared before `@1`'s shared `checkOutput`, naming the result line.
- U2 a rejected nested window carries its own rateLimitType/resetsAt, else the event's.
- U4 `result.api_error_status` must be absent or null.
- Deliberate fail-closed overlaps (teeth red on class, not acceptance): rateLimitProblems vs rules 1-2 (T09, T11), window allowlist vs rules 1-2 (SS3, SX1), fast_mode "off" vs rule 8 (T17), U5 tie vs S1 (SS1), assistant stop allowlist vs rules 6-7 (T23).
```

**Task 3.** Verbatim, `parent-task3-review-summary.20260925T175232Z.log` lines
19-23:

```text
- The plan's 'SUBSCRIPTION_ROLE_CONFIG_V1 equals Task 0's literal' test moves to Task 5 (the export is created there), with its teeth.
- INVOCATION_EFFORTS (['high']) is declared in provider-adapter.ts so orchestration imports no adapter; a deliberate second declaration bound to the @2 adapter by 'accepts the invocation the @2 adapter actually declares'.
- Runner-side validation (R1): a defined capability invocation is validated before comparison, so null or malformed is refused by name. Consequence accepted: with one registered effort, an effort difference is refused as InvalidInvocationIdentityError (side 'capability') before the comparison; D-3's InvocationMismatchError covers differences between two valid declarations; the effort conjunct is held by a direct invocationDifferences case, and the orchestration effort row must return when a second effort is registered.
- R8: InvalidInvocationIdentityError carries side 'configuration' | 'capability' | null; the two refusals are distinguishable by field and message.
- The present-invocation golden is taken over goldenInput() (GOLDEN_IDENTITY's own literal input), not baseline(); baseline() is a builder/hand-writer agreement case.
```

**Task 4.** Verbatim, `parent-task4-review-summary.20260925T193232Z.log` lines
20-22:

```text
- The purity test goes beyond the plan's import list: a literal value-import allowlist with a stale-entry check, clock/network/environment globals in value positions, non-.ts entries and subdirectories faulted, and a reviewed ignore list containing exactly '.DS_Store' (so Finder cannot fail npm test on macOS).
- The corpus fixture is in memory (production index parser, normalize and hashing; never written to disk).
- docs/evidence-use.md: the one sentence corrected twice (first pass, then round 1) so it is true of quotes, absence claims and edges alike.
```

**The Task 5 split.** Verbatim, `HANDOVER-2026-09-25-c.md` line 80 (section
"Task 5, split into three sub-tasks (parent decision, for the checkpoint)"):

```text
Plan Task 5 is too large for one implementer to do well (the harness `test/live-capture.ts` is 1,442 lines and its test 1,615). The previous parent split it into 5a, 5b and 5c, each a full cycle: one fresh implementer, reviewers, repair rounds, parent finish and parent teeth, and a review summary. Each sub-task's baseline is the previous one's finishing count. Every plan Task 5 test and teeth check below is assigned to exactly one sub-task. Check each brief against the code before dispatching; line numbers are from `651178c` plus Tasks 0-4.
```

**5a.** Verbatim, `parent-task5a-review-summary.20260926T071152Z.log` lines
18-23:

```text
- H1 transport-settings hardening implemented (closes HANDOVER-b open decision 7 fail-closed): SpawnTransportOptions.settings; LaunchSettingsMismatchError (plain Error, started:false facts) before the pin check, launch directory and prompt file; the harness hands profile.settings when non-null; @1 unchanged; DEFAULT_LAUNCH_SETTINGS exported (value unchanged).
- The @2 budget cap (maxRoleLaunchesFor = 1 + prosecutorCount + 1) applies to @2 only; @1 injected captures stay uncapped (SUB_ENV 27).
- execution.json gains requested {pin, permittedModels, effort, maxOutputTokens, settings, settingsFrom} and budgets {launchTimeoutMs, gateTimeoutMs, lifetimeMs, injected}; lifetimeMs = D-5 formula at DEFAULT_GRACE_MS over the effective (profile or injected) timeouts, null for @1; @1 budgets.launchTimeoutMs records the runner default 600,000.
- GateTimeout semantics: only the gate call, only the transport's own abort, only under lifetime reason gate_timeout; three wordings; a verdict read after the timer is not taken; any other error keeps its name with a timer note.
- Injected test timeouts validated (UnsupportedTimeoutError). SubscriptionRouteMismatchError prefix: 'the subscription route runs claude-code-cli@2, or claude-code-cli@1 over an injected launch only, ...'.
- Plan Task 5 split into 5a/5b/5c (previous parent, confirmed here).
```

**5b, P-5b-1 to P-5b-14.** Verbatim,
`parent-task5b-review-summary.20260927T233514Z.log` lines 26-37:

```text
- P-5b-1 the usage readings and rules in a pure module, test/included-usage.ts, with no import at all (stricter than the plan's 'only types from claude-code-cli.ts'); the static scan (U-I1) refuses any import or export-from, type-only included.
- P-5b-2 a sixteenth fact, long_context_route (D-7 rule 4's paid [1m] route).
- P-5b-3 reportedContextTokens per request (message_start and assistant usage; the result's only as a fallback).
- P-5b-4 facts carry kinds; usageStop.kind by priority overage, exhausted, unnatural_reset, credits, long_context_route, long_context_boundary, fast_mode, unobserved; from the facts, never the error name.
- P-5b-5 usageStop {kind, facts, seq, role, index, resetsAt, note}; resetsAt the latest finite among exhausted and overage facts.
- P-5b-6 in-flight harness stops only for long_context_boundary and unnatural_reset, after a launch resolves (UsageStopError; lifetime aborted usage_stop:<role>[<index>]).
- P-5b-7 the reset-pending check for both adapters, across every pack and requirement under the execution root handed in (not every root on the machine), fail closed.
- P-5b-8 @1 has no usageStop key and neither stop.
- P-5b-9 an unfinished earlier record refused. P-5b-10 links at every level (root included, resolved) and unreadable or unlistable entries refused.
- P-5b-11 the observation filed redacted by the stream's key and value rules (count-map keys renamed); own-data-property copies (__proto__).
- P-5b-12 (narrowed) the refusal explanation reaches execution.json error.message and attempts.jsonl detail through ProviderRefusalError's own message; characterised at the message_delta position; the other four positions and any projection error quoting a stream value are an open risk under the user's open decision 13.
- P-5b-13 recorded limitations (below). P-5b-14 a finished record whose usageStop carries an exhausted or overage fact with resetsAt null holds until an operator reviews it.
```

**5c, P-5c-1 to P-5c-6.** Verbatim,
`parent-task5c-review-summary.20261014T232611Z.log` lines 25-30:

```text
- P-5c-1 the trust block is @2-only: no key for @1; null in the first 'running' summary (gated by its own flag, trustTiers).
- P-5c-2 evidence is measured only when the schema tier is valid and a written record and its corpus exist; zero sets is unassessed with sets []; sets (every set, passing ones included, in evidenceSetsOf order, each {recordPath, label, ok, problems}) are filed for passed as well as failed.
- P-5c-3 evidence is withheld when either withhold fact holds (resultWithheld, or withheldBy non-null), whatever the stage or the error.
- P-5c-4 the "verified" rule binds the block's own vocabulary (statuses and methods); data carried verbatim is not rewritten: an error's name (UnverifiedProviderAdapterError is the one engine class whose name matches /verified/i, unreachable through the harness, whose role wrapper always forwards the adapter) and a failed set's problems, which quote the record's own text: a quote's first 80 characters; an absence term, a docId or an edgeId whole.
- P-5c-5 the method literals: the trust spec's method column, with "lower-cased" where the spec says "case-folded" (normalizeWhitespace then toLowerCase, not Unicode case folding).
- P-5c-6 runSubscriptionCommand (now exported) returns { outcome, stage, world, written }: stages world_refused, role_output_refused, result_invalid, write_failed, written; world null only for world_refused; written the writer's written outcome or null; a thrown error propagates unchanged and the harness has no stage.
```

**Task 6** (this checkpoint and the trust spec), where the documents depart
from their sources; each is the code as read here
(`task6-impl-r1-reads.20261015T004322Z.log`; for (c), the lines the spec
cites, printed in `task6-impl-r1-spec-check-final.20261015T005145Z.log`):

- (a) The trust spec states the code's comparison, `normalizeWhitespace` then
  `toLowerCase`, not D-9's "whitespace-collapsed and case-folded" (spec §2.2,
  §2.3). Plan v2's D-9 (plan line 295) and its Task 6, which "takes D-9's
  exact wording on edges and comparison" (plan lines 786-788), therefore now
  disagree with the spec on the comparison; on edges they agree.
- (b) The consistency pass runs at assembly, not only at the gate:
  `writeVerificationResult` calls `assembleVerificationResult`
  (`src/pipeline/write-result.ts:255`), which returns through
  `parseVerificationResult` (`src/pipeline/assemble.ts:201`), which runs
  `assertResultConsistency` (`src/verification/result.ts:769`; the rules
  holding quotes and absence items to the record's pins at `:580-603`); the
  sign gate runs it again (`src/verification/sign.ts:439`). This corrects
  `HANDOVER-2026-09-25-c.md` line 117, the Task 4 summary's line 16 and the
  Task 6 brief's §A, which say that only the gate's consistency pass enforces
  those pins.
- (c) The evidence tier's policy failures, an empty set and a set made only
  of absence items, cannot occur through the harness: the tier measures only
  a record that assembled valid, and the schema's `.min(1)` and the
  consistency pass's sole-absence rule refuse both before that (spec §2.2).

## Recorded limitations — stated, not closed

**Tasks 1 and 2.** Verbatim, `HANDOVER-2026-09-25-b.md` lines 89-95 (section
"Recorded limitations (not repaired; for the checkpoint)"); the Task 1
summary's two checkpoint items (line 22) are this list's second and third:

```text
- Refusal (`ProviderRefusalError`) and truncation (`CliOutputTruncatedError`) messages name no line; `CliNoStructuredOutputError` names none.
- Transport `--settings` check is shape-only; a transport built with `@2`'s pin but handed a body without `settings` would launch 2.1.280 with `@1`'s fallback settings (closed in practice only by D-1's `@1` spawn refusal and the harness pairing adapter and transport; see Task 5 hand-forwards).
- A non-string gate directory value is labelled `null`/`UNEXPECTED_TYPE` and passes (never reproduced).
- The gate's raw stdout, carrying both directory paths, still reaches `onLaunch` (Task 5 must redact them from the stream file).
- U2's fallback can attach the event's rateLimitType/resetsAt to a rejected window that names a different window by key or `window` field (probe question).
- Unobserved shapes, each a probe question beside the code: the system `api_error` event, the serialized spelling of the kind field, `apiRefusalCategory`/`apiRefusalExplanation`, `unifiedWindows`, `thinking_tokens` (builder shape invented), status values beyond "requesting", user items under autoContinue.
- Earlier survivors now closed: the `@2` placeholder delegating to `@1` (T15 reds 289), a type-only import of the transport (purity test V-Y1).
```

Since then: the second item's settings path was hardened in 5a (H1:
`LaunchSettingsMismatchError`), and the fourth item's two paths are redacted
from the filed stream in 5a (V2-R1). Task 0 recorded no limitation beyond its
R4 characterisation (§Teeth).

**Task 3.** Verbatim, `parent-task3-review-summary.20260925T175232Z.log` lines
25-28:

```text
- The invocation check, like the pre-existing unverified-adapter check, runs for runner.kind === 'live' only; an untyped runner with an unknown kind skips both.
- R7 pins validation-after-adapter-checks only for a null declaration; a partial hoist validating non-null malformed declarations first survives (both paths refuse before any work; only the reported reason differs).
- buildPipelineIdentity called directly with invocation null throws a TypeError; only pipelineVersionFor validates (as for the adapter identity).
- Two literal-only assertions (commented as such) cannot be reddened by src.
```

**Task 4.** Verbatim, `parent-task4-review-summary.20260925T193232Z.log` lines
24-26:

```text
- The purity scan covers direct imports only (a transitive node:crypto through ../corpus/hash is out of scope); globals are matched by name (a shadowing local is flagged; globalThis.fetch, crypto, Math.random, queueMicrotask, eval are not listed).
- The aggregation control puts its impure source last (a keep-only-last aggregation would pass it); a destructuring default ({ get = fetch }) and a property value ({ get: fetch } in an object literal, a class field) have no rows.
- 'The scan read every .ts file' and 'sign.ts and evidence-validity.ts are among them' are asserted over the real directory only.
```

**5a.** Verbatim, `parent-task5a-review-summary.20260926T071152Z.log` lines
25-30:

```text
- H1's refusal is booked by the runner as sent: true, outcome 'ambiguous', possiblyBilled false, launched false (fails closed; not retryable).
- GateTimeout 'ended' wording is chosen from the transport's text: an abort landing after the gate child exited but before its pipes closed is worded 'ended' though the child exited itself.
- S01 and S02 above; V2-D2 tracks the default-spawned gate pid after four assertions (a red there leaves that group unscanned); V2-GT11's control asserts the refusal by name only, and its empty-tempRoot assertion has no positive control; the after-answer absence assertions were not observed red; V2-GT10/11 impose timer order through holdTimersAt, so the test header's 'ordering was observed, not declared' is untrue for them; V2-B3 relies on the 200 ms timer not firing during the dummy's pin check.
- The --json-schema argv element is computed from roleOutputJsonSchema and pinned by a characterisation sha256 (ca1406ec...), not a literal.
- Pre-existing (651178c), not introduced here: execution.json is not literal-redacted: a pin-mismatch error carries the pin path under the inherited HOME, and in production transcriptPath, resultPath and lines are absolute paths under the operator's HOME. NEVER_FILED is tested only with a fake HOME outside the execution root. New open decision for the user.
- Pre-existing ID collisions across files (X1, C1, S1, P5 ...); Task 5a's own IDs are unique across the 30 files.
```

In 5c, V2-D2's new trust assertion on its control was placed after the
tracking (`test/live-capture.test.ts:2810-2812`, Task 5c review repair R3);
the four 5a assertions before the tracking (`:2794-2797`) are unchanged
(checked here by reading `:2789-2812`, printed in
`task6-impl-r1-reads.20261015T004322Z.log`).

**5b.** Verbatim, `parent-task5b-review-summary.20260927T233514Z.log` lines
39-46:

```text
- The backstop mirrors included usage only: D-7 rules 5-7 and 9, D-8's walk and allowlists and R5, R6/S3, U3-U6, S1, S8 are the projection's alone.
- unnatural_reset: a window named neither by type nor by key is not compared; a window that never reported its own reset has no gate; 'before' is the launch's end, so a launch straddling a reset fails open; alternating double reports can make a false in-flight stop.
- Redaction: a value under a redacted key is read by no rule, except an object-form window keyed by a redacted key, which becomes a false rate_limit_unobserved fact; replaced strings lose credits, [1m], context-1m and overage-name facts, make false fast_mode facts from 'off'/'standard', and lose a replaced 'rejected' and its hold; a key carrying an email pattern or HOME/USER still refuses the launch line and its facts; the inherited USER/HOME must be contained in no compared literal (a user precondition).
- apiErrors kinds filed verbatim; observation line numbers count non-blank lines, the projection raw lines.
- Reset pending reads one root; an untyped directory entry (not on APFS) and a regular file at a directory level are passed over; a crashed execution blocks new ones until reviewed (by design).
- TerminationUnconfirmed takes precedence over IncludedUsageUnconfirmed in the error's name (both withhold; usageStop keeps the facts).
- The stream sanitiser's own `out[key] =` (live-capture.ts ~:784) would drop a __proto__ key from a filed stream (pre-existing, out of 5b's scope).
- The launch in flight has already spent before any in-flight stop or refusal (D-6's residual risk).
```

[The stream sanitiser's `out[key] =` is now at `test/live-capture.ts:809`
(checked here, `task6-impl-r1-reads.20261015T004322Z.log`).]

**5c.** Verbatim, `parent-task5c-review-summary.20261014T232611Z.log` lines
32-38 and, under "Pre-existing defect found (src, out of 5c's scope; not
repaired)", line 40:

```text
- The TerminationUnconfirmed withhold rule cannot be reached with a clean error, so "TerminationUnconfirmed -> withheld" is shown in the pure table only; likewise "after the deletion" is stated but unpinnable (no natural caller's deletion changes resultWithheld), and the trust call's equivalent mutants (withheldBy: null; resultWithheld: false; the statement moved between the backstop and the deletion) cannot red through the harness. Only the order against the usage backstop is pinned (V2-U11, plan teeth 5).
- expectTrust matches /verified/i over the whole stringified block (the plan's and the brief's wording), stricter than P-5c-4: a future fixture whose data says "verified" would red for the wrong reason.
- write_failed handed a record is measured (the brief's literal rule; inputs the harness never produces; pure rows only).
- V2-T4 compares the filed status, error, resultWithheld, resultPath and transcriptPath, not runId, exitCode, lines, cancelled, cancellationReason or terminationUnconfirmed: a survivor gating those on the evidence tier would live.
- P29a's mutant crashes rather than failing an assertion (a dropped record guard).
- A failed set's problems carry model text into execution.json unbounded (absence terms, docIds, edgeIds whole): this extends the user's open decision 13 (execution.json redaction).
- If trustOf ever threw (it cannot over a parsed record and the loaded corpus: read by the correctness reviewer), execution.json would stay 'running' with trust null and the next execution under that root is refused by the reset-pending check (fails closed), as for any throw between the two summary writes (pre-existing).
```

```text
- src/pipeline/write-result.ts (= HEAD, a9a9fbd3...) :283-299: the temp_write and publish cleanups call rmSync(temp, { force: true }) unguarded inside their catch blocks; force ignores ENOENT only, so a regular file as a path component of the destination makes the cleanup throw ENOTDIR and writeVerificationResult throws instead of returning write_failed (seen on Node v24.19.0: task5c-impl-new-cases-first.20261014T221020Z.log, lstat of the .tmp path, write-result.ts:113 from :289). In a capture: no stage, the error filed as Error carrying the absolute temp path, exit null, trust schema unassessed (understated, never overclaimed). Not reachable naturally (a fresh verification directory per execution). Follow-up for the user: guard both cleanups and add a writer test with a regular file as a path component. V2-T2 reaches write_failed at the publish stage (a non-empty directory at the destination) instead.
```

## The D-6 preconditions — for the user to confirm before any live step

None is confirmed. Verbatim, plan lines 149-158:

```text
  - **User-confirmed preconditions**, recorded in the checkpoint and asked
    before any execution:
    - extra usage is off;
    - auto-reload is off;
    - no usage credits are enabled;
    - no reset card or early reset is enabled or will be used;
    - no managed-settings file exists.
  - **Residual risk:** the launch in flight can have spent before a refusal.
    Stdout is observed only when a launch ends, and stdin is closed after the
    user message, so no purchase or consent prompt can be answered.
```

One more precondition, from 5b (`test/included-usage.ts:206-214`, a recorded
limitation under P-5b-13): the operator's USER and HOME are contained in none
of the literals the usage rules compare ("rejected", "allowed",
"allowed_warning", "five_hour", "seven_day", "seven_day_opus",
"seven_day_sonnet", "overage", "standard", "off", the three credit kinds,
"claude-opus-5-5"); nothing enforces it (open decision 15).

## Date-bound facts

- **The embedded model catalog of 2.1.280** ran from 2026-09-20T14:56:08Z to
  2026-09-27T14:56:08Z (static; reported, HANDOVER-2026-09-25, quoted above).
  It had expired 17 days and more than 8 hours before this checkpoint was
  written; HANDOVER-2026-10-15 and the Task 6 brief count 18 days, by the
  local calendar dates 2026-09-27 and 2026-10-15. With 2.1.280 absent the
  point is moot for that build; for any other build the catalog's dates are
  unknown.
- The catalog is not pinned by the executable hash. Plan D-6 relies on
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` blocking a remote catalog
  (unobserved) and defers setting `CLAUDE_CODE_MODEL_CATALOG` off until a
  probe shows which values it accepts.

## The S-002 context-boundary feasibility risk (D-5)

Recorded, not resolved. Verbatim, plan lines 131-144:

```text
  - **Context boundary.** 2.1.280 states that a request over a 200K-token
    context needs usage credits. So after each `@2` launch, the harness
    compares reported `input_tokens + cache_creation_input_tokens +
    cache_read_input_tokens` with a per-launch ceiling of **190,000**, which
    is a proposed value for the user to confirm. It stops the run as usage
    stop `long_context_boundary` when the ceiling is exceeded.
  - **Feasibility risk (recorded, not resolved):**
    - S-002's closure is about 406 KB, roughly 123k tokens by the rehearsal's
      ratio.
    - The prosecutors add the reading. The adjudicator adds the reading,
      coverage and challenges.
    - The tool-loop request re-sends the turn.
    - The later roles may therefore approach 200K. Only a probe or the run
      itself can say.
```

As implemented (P-5b-3), the reading is per request (`message_start` and
assistant usage, the result's only as a fallback), and 190,000 itself is no
fact while 190,001 is one (U-B2; reported, 5b teeth Q21).

## The superseded external S-002 package

`pilot-evidence/2026-09-24-s002-capture-prep/` (its review in
`pilot-evidence/2026-09-24-s002-capture-review/`) was prepared on 2026-09-24
for `@1` and `claude-opus-5`. Under D-1 the harness now refuses `@1` for any
execution that would spawn the real executable
(`SubscriptionRouteMismatchError`, `test/live-capture.ts:1829-1831`), so the
package cannot run as prepared. It is superseded by this migration. No
task's work included it, and every handover forbade touching it
(HANDOVER-2026-09-25: "Don't run it" and "Leave it unmodified"; from
HANDOVER-2026-09-25-b on: "Leave every frozen `pilot-evidence/` directory
untouched"); it was not re-hashed here. Its directory exists, seen once in
Task 6's first pass with an unlogged `/bin/ls -d` (so not "checked here" in
this checkpoint's sense); nothing in it was opened. Its `README.md:104`
corroborates the `@1` identity literal (Task 0 decision). Plan §4 step 4 calls
for a new package.

## Unverified until a probe

Each item once. First, plan Task 6's list, verbatim (plan lines 800-815):

```text
- **Unverified until a probe:**
  - rate-limit event emission per launch;
  - `fast_mode_state` under `DISABLE_FAST_MODE`;
  - exact model strings, including `[1m]` and auxiliary keys;
  - whether effort is applied;
  - the shapes of thinking-display updates;
  - how the tripwire and refusals surface;
  - whether the `--settings` keys are accepted, including
    `autoContinueAtUsageLimit`;
  - whether `--setting-sources ''` excludes `~/.claude`;
  - whether a managed-settings file is present;
  - the model catalog source;
  - structured-output retraction;
  - `api_retry` under retries 0;
  - whether `analyticsDisabled` follows `DISABLE_TELEMETRY`;
  - how `seven_day_overage_included` and an absent `overageStatus` behave.
```

Then the probe questions recorded beside the code that the list above does not
already name (HANDOVER-b's `apiRefusalCategory` / `apiRefusalExplanation`
question is part of "how the tripwire and refusals surface"):

- the system `api_error` event's shape (HANDOVER-b);
- which of `error`, `apiError` and `api_error` carries an API-error kind, how
  the kind is spelled, and what else those fields hold (HANDOVER-b; 5b,
  `test/included-usage.ts:215-219`);
- how 2.1.280 reports rate-limit windows (`unifiedWindows`), including
  whether a window states its own `rateLimitType` and `resetsAt`, without
  which U2's fallback attaches the event's, possibly to a window named
  differently by key or `window` field (HANDOVER-b; 5b,
  `test/included-usage.ts:193-198`, `test/live-capture.ts:244`);
- the shape of `thinking_tokens` events (the builder's shape is invented);
- `status` values beyond "requesting";
- user items under auto-continue;
- which `stop_reason` values 2.1.280 states on assistant items and on the
  result (`src/pipeline/claude-code-cli.ts:1672`, `:1875`);
- whether the result always restates the last completed message's stop
  reason (`src/pipeline/claude-code-cli.ts:1880`;
  `test/claude-code-cli-v2.test.ts:1209`);
- which values the result's `api_error_status` takes
  (`src/pipeline/claude-code-cli.ts:1892`;
  `test/claude-code-cli-v2.test.ts:1241`);
- whether 2.1.280 ever writes an assistant or a user event with an empty
  content array (`src/pipeline/claude-code-cli.ts:1667`, `:1698`;
  `test/claude-code-cli-v2.test.ts:1410`);
- whether 2.1.280 writes an `error`, `apiError` or `api_error` key on any
  event but a flagged assistant API-error item or a system `api_error` event
  (`src/pipeline/claude-code-cli.ts:1630`;
  `test/claude-code-cli-v2.test.ts:1428`).

`git grep --untracked -n 'probe question' -- backend/engine` finds 27 such
comments: 15 in `src/pipeline/claude-code-cli.ts`, 9 in
`test/claude-code-cli-v2.test.ts`, 2 in `test/included-usage.ts` and 1 in
`test/live-capture.ts` (without `--untracked` it finds 16, missing the new,
untracked test files). Each falls under one item above (checked here by
reading each, `task6-impl-r1-probe-questions.20261015T004019Z.log`). And all
of these are questions about 2.1.280: on any new pin each is open again (§The
pin today, item 4).

What stays unobserved by design, beside the probe questions: every `@2`
summary files `SUBSCRIPTION_V2_UNOBSERVED` ("Stated once, filed on every
`claude-code-cli@2` summary", `test/live-capture.ts:1373-1377`). Verbatim,
`test/live-capture.ts` lines 1379-1382:

```text
  outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000, which 2.1.280 honours statically up to the model\'s own limit; wire-level max_tokens unobserved',
  effort: 'effort high passed as --effort; its application unobserved',
  thinking: 'always on for claude-opus-5-5, and counted toward the 64000 ceiling; not asserted',
  modelCatalog: 'not pinned by the executable hash: the embedded catalog expires at 2026-09-27T14:56:08Z, and a remote catalog is assumed blocked by CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, unverified',
```

And server-side billing is not observable from the client
(`CHECKPOINT-b-cli-adapter.md` line 80, for the route both adapters share):
D-6's construction "reduces, doesn't guarantee" (plan line 159), and its
residual risk stands (§The D-6 preconditions).

## `docs/evidence-use.md`

Task 4 corrected the opening sentence. Old, verbatim (`git show
HEAD:backend/engine/docs/evidence-use.md`, lines 3-4; the second sentence,
from "A signature needs more", is unchanged):

```text
A verification result proves that every quote it carries exists in a pinned
document. A signature needs more of a positive legal proposition: an
```

New, verbatim (`docs/evidence-use.md` lines 3-9):

```text
A verification result's evidence makes claims about the corpus: a quote,
that its text is in the document it names, at the hash it pins; an absence
item, that its term occurs in none of the documents it names; an edge, that
the corpus index records the relation it cites. Writing the result
establishes none of these; only re-checking them against the corpus does —
the sign gate's re-check, and `checkResultEvidence` as a measurement before
any signature. A signature needs more of a positive legal proposition: an
```

## Evidence-standard notes

- **RX4 is coarse.** Pointing `@1` at `@2`'s projection reddened 144 tests
  (`parent-task2-teeth-summary.20260925T143335Z.log`), which shows only that
  the two projections differ. The per-case `@1` evidence is the targeted leak
  mutations LA–LI, each a `@2` rule leaked into `@1`'s projection and red on
  the `@1` cases it changes (G8 characterisation cases; for LD also S4, and for
  LH eleven cases from P1 on; same log), and the residual pass's (HANDOVER-b,
  "Hand-forwards to Task 6").
- **Filtered harness teeth.** In 5b and 5c the harness teeth ran only their
  named red cases and green controls (vitest `-t`), a parent choice under the
  2026-09-27 hangs (reported). What a mutant did to the other cases of the
  same file was therefore not observed for those teeth.
- **One crash red.** 5c's P29a is red as a `TypeError`, not on an assertion,
  so it shows the guard is load-bearing but not which assertion holds it
  (failure mode 2's caution; reported as such by the parent).

## Environment

- **The shell hazard** (observed by the first parent, HANDOVER-2026-09-25):
  in Claude Code shells, bare `grep`, `find` and `rg` are zsh functions that
  execute a Claude Code binary (`$CLAUDE_CODE_EXECPATH`, recorded then as the
  desktop 2.1.280, falling back to `~/.local/bin/claude`) in search mode.
  `CLAUDE.md`'s own `grep -ri csrd` wording hits it; changing `CLAUDE.md` is
  the user's decision (open decision 5). The same handover discloses runs of
  that binary before Task 0; verbatim, `HANDOVER-2026-09-25.md` line 43:

  ```text
  - The previous chat's earlier bare `grep` calls, and some investigator subagents' calls, ran that binary as a search tool. That was not authentication or inference, but it is a disclosed deviation from "never execute the CLI".
  ```

  Task 6 searched only with `git grep`, `/usr/bin/grep`, `/usr/bin/find` and
  the Read tool, and never typed a bare `grep`, `find` or `rg`.
- **The 2026-09-27 hangs and stalls.** The three full targeted runs that day
  each failed: `parent-task5b-targeted.20260927T092259Z.log` with U2 timed
  out; `parent-task5b-r4-targeted.20260927T142622Z.log` with S9 and V2-U9e
  timed out; and `parent-task5b-r4-rerun-targeted.20260927T150947Z.log` with
  S7 and V2-U12 timed out, while S8 raced (`expected 'ProcessTransportError'
  to be 'ExecutionCancelledError'`). So one or two cases timed out per run
  (the last four each with a child's process group outliving the test), and
  in the last run S8 raced (checked here in the logs,
  `task6-impl-r1-reads.20261015T004322Z.log`). This checkpoint follows the
  logs where they contradict the 5b summary's line 19 ("every failure in every
  full run a timeout") and HANDOVER-2026-09-28's line 11 ("one to three ...
  cases time out"). The same day subagents stalled (the workflow's 180 s and
  the Agent tool's 600 s watchdogs) and the auto-mode classifier sometimes
  returned no verdict (5b summary). The 5b parent judged the hang
  environmental, or a latent race older than 5b that the machine's state
  exposed.
- **The reboot.** The user rebooted before 5c (uptime 33 min at the 5c start
  check). The 5c health check ran clean: 31 files / 1683 tests in 67.04 s, no
  hang (`parent-task5c-baseline-targeted.20261014T213415Z.log`), and so did
  the 5c finish (74.67 s) and this task's run (75.51 s). The hang did not
  survive the reboot.
- **The scratchpads were purged** between 2026-09-28 and 2026-10-14; the
  parent's three tools were recreated byte for byte in R's
  `parent-tools.20261014T2010Z/` and confirmed by hash (HANDOVER-2026-10-15).
- **Vitest's results cache** is written through the `node_modules` symlink
  into the main checkout's gitignored `backend/engine/node_modules/.vite/`,
  by every run in every session, this task's included; it does not change
  `git status`.
- **The main checkout** (`/Users/vivin/Documents/DataStrata/b1b-record`) was
  touched only by the parents' read-only
  `git --no-optional-locks -C … status --porcelain=v1` checks (only the two
  protected untracked files each time), with three disclosed exceptions: the
  Task 0 implementer's read-only `git status` there (a rule-1 breach; the
  index mtime unchanged); the 5b parent's `/usr/bin/diff` of the two
  `CLAUDE.md` files (identical); and, in 5c, subagents' Bash calls ran
  absolute-path commands with the main checkout as their default working
  directory, reading and writing nothing there. Task 6 has the same kind of
  exception: two of its Bash calls in its first pass (`sleep 20; cat <the
  background run's output file>` and `cat <that file>`) did not start with
  `cd` into the candidate and so ran with the main checkout as their working
  directory; each read only a file under `/private/tmp`, and nothing in the
  main checkout was read or written (disclosed in the Task 6 report). Every
  other Task 6 command began with `cd` into the candidate.
- **Tooling notes.** `npx --no -- <bin>` always (without `--`, npx once
  swallowed `--noEmit`). In this zsh an unmatched glob or a glob qualifier
  aborts the command, as the first pin-presence log's last line shows.
- **Process notes.** In Task 3, two reviewers wrote scratch files into the
  parent's scratchpad despite the read-only rule; the parent removed them,
  and none was in the candidate or the main checkout (Task 3 summary, line
  30). A Task 4 subagent reported a tooling hazard: a backslash-u escape typed
  into a tool parameter may reach a file as the literal character, so the
  NBSP escape in `test/verification-evidence-validity.test.ts` was checked
  with `od` for a C2 A0 byte pair, and none was found (HANDOVER-2026-09-25-c
  line 19; Task 4 summary, line 31).

## Open decisions for the user

(1)–(16) as HANDOVER-2026-09-28 lists them, with each one's detail from the
handover that raised it, and updated where this checkpoint's facts change
them; then 5c's three, (17)–(19), and (20), the standing data-terms item.

1. **The pin option, now forced.** D-4's named risk has happened: the plan
   expected the desktop app to remove the file "within about two desktop
   updates" (plan lines 90-93), and the desktop-managed 2.1.280 path, the
   plan's default, no longer exists. Alternative (a), a read-only copy of the
   2.1.280 bundle, can no longer be made from the desktop app's directory.
   What remains: a read-only copy of a newer desktop bundle (the 2.1.295 one
   under `2.1.295/9d6405864fdc/claude.app`, never listed past its `MacOS`
   directory, hashed or run), or a standalone install, D-4 (b) (plan lines
   103-111): a network download, which needs explicit permission, and a run
   of a Claude Code binary; the native installer repoints
   `~/.local/bin/claude` away from 2.1.226, which also changes what the
   shell's `grep` and `find` wrappers run, and its `cleanupOldVersions` step
   may delete the `@1` pin, so 2.1.226 is copied aside and confirmed by hash
   first. Either is a new pin with a new version and sha256 (still `@2`, since
   no `@2` execution exists), moves the `@2` invocation and identity literal,
   and leaves plan §0's static facts unchecked on that build.
2. Budget values: output ceiling 64,000; launch timeout 30 min; per-launch
   context ceiling 190,000 (proposed). The ceiling rests on 2.1.280 honouring
   values up to the model's limit, and the 190,000 on 2.1.280's statement
   about the 200K boundary (D-5): with 2.1.280 absent at its pin, any new pin
   is a different build, unless a copy of 2.1.280 is found, so both are open
   again on it.
3. Fail-closed policies: an absent `rate_limit_event`; an absent
   `overageStatus`; `seven_day_overage_included`; requiring
   `analyticsDisabled === true`; refusing unknown system subtypes. They were
   set from what was known statically of 2.1.280 and from 2.1.226's streams;
   a different build (any new pin, unless a copy of 2.1.280 is found) may emit
   shapes they refuse.
4. The D-6 preconditions (§The D-6 preconditions), confirmed by the user
   before any live step.
5. The `CLAUDE.md` wording about `grep`. Beside it, `CLAUDE.md` line 16 says
   "Six ways a test passes while proving nothing" while
   `TEST-EVIDENCE-STANDARD.md` line 26 lists seven; `CLAUDE.md` is the user's
   file and was not edited.
6. Accept or revise the Task 2 parent decisions beyond D-6/D-7/D-8, notably
   status "requesting" only, `fast_mode_state` "off" only, user content
   `tool_result` only, and the `unifiedWindows` rules, each of which will
   spend a probe launch if the build behaves otherwise. With 2.1.280 absent
   at its pin, any new pin is a different build unless a copy of 2.1.280 is
   found.
7. The transport-settings hardening, implemented in 5a fail-closed as a
   parent decision (H1): accept or reverse.
8. A plan amendment (v3) versus checkpoint-only recording. Either way, plan
   v2 carries text that must be corrected: D-9's comparison wording
   ("whitespace-collapsed and case-folded", plan line 295; the trust spec
   §2.3 states the code) and D-4's desktop pin (plan lines 82-111), whose
   file no longer exists (§The pin today).
9. Accept the Task 3 decisions: runner-side invocation validation, so an
   effort difference is refused as `InvalidInvocationIdentityError` while one
   effort is registered; the refusal naming its side; `INVOCATION_EFFORTS`
   declared in `provider-adapter.ts`.
10. Accept the Task 4 purity-test rules: a value-import allowlist and
    clock/network/environment globals beyond the plan's import list, and the
    `.DS_Store` ignore list.
11. Accept the Task 5 split.
12. Accept 5a's parent decisions: the `@2`-only budget cap; the `requested`
    and `budgets` fields and the `lifetimeMs` definition; the `GateTimeout`
    semantics; injected-timeout validation.
13. Redaction of `execution.json`: a pin-mismatch error carries the pin path
    under the inherited HOME; in production `transcriptPath`, `resultPath`
    and `lines` are absolute paths under the operator's HOME; the "never
    filed" invariant is tested only with a fake HOME outside the execution
    root; and the refusal explanation at four positions and any projection
    error quoting a stream value reach `execution.json` and `attempts.jsonl`
    unscanned. Whether a later task should redact `execution.json`. Today the
    first of these would be filed by the first `@2` execution attempted (§The
    pin today, consequence 1).
14. Accept 5b's parent decisions P-5b-1..14, notably the sixteenth fact, the
    per-request context reading, the in-flight stop kinds, the account-level
    reach of the reset-pending check (one root), and failing closed on
    unfinished, unreadable, linked and reset-less records.
15. The precondition that the operator's USER and HOME are contained in none
    of the literals the usage rules compare.
16. **Updated:** whether to investigate the 2026-09-27 launch hang further.
    It did not survive the reboot (§Environment); investigating it is needed
    only if it recurs.
17. Accept P-5c-1..6.
18. The pre-existing `src/pipeline/write-result.ts` cleanup defect (5c
    summary, "Pre-existing defect found"): a `src/` fix outside this
    migration.
19. Whether the trust block's verbatim data (an absence term, a docId or an
    edgeId whole; a quote's first 80 characters) needs bounding or redaction
    in `execution.json`. It extends (13).
20. The data terms, the standing item plan §4 step 3 names ("the
    checkpoint's standing item"). For the subscription route only
    `CHECKPOINT-b-cli-adapter.md` line 88 states its content: data terms for
    sending corpus text over the subscription route, with the
    model-improvement setting reconfirmed off (earlier documents name
    commercial and data terms for live use in general:
    `CHECKPOINT-b2-pipeline.md` line 219, `B3-RECONCILIATION-2026-09-06.md`
    lines 26 and 40; checked here,
    `task6-impl-r1-data-terms.20261015T005450Z.log`). Still open; it is §4
    step 3's approval.

## Next approvals, in order, none granted by this checkpoint

Before step 1: the pin decision (open decision 1) and the D-6 confirmations
(open decisions 4 and 15). A new pin is itself a code change (the `@2`
profile's pin and every literal that states it), to be reviewed and committed
before step 1; that is inferred here from plan §4's heading ("after the
candidate is reviewed and committed") and D-4, not stated by the plan. Before
step 3: the data terms (open decision 20), the standing item of
`CHECKPOINT-b-cli-adapter.md` line 88, which step 3 names but does not state:
data terms for sending corpus text over the subscription route, the
model-improvement setting reconfirmed off. Then plan §4, verbatim (plan lines
817-835):

```text
## 4. The bounded validation sequence (after the candidate is reviewed and committed; each step a separate approval)

1. **A minimal-shape probe.**
   - Through the `@2` harness path, from Terminal.app, after the D-6
     preconditions are confirmed.
   - One gate and one role launch.
   - A tiny synthetic prompt and schema (not S-002 and not corpus text), with
     evidence filed outside the repository.
   - Purpose: to confirm or amend each strict rule in the §3 Task 6
     "unverified" list. Any amendment is a plan change reviewed before step 2.
2. **The synthetic three-role rehearsal on `@2`.** A new external package
   reusing the frozen R-SYNTH inputs; the prompts are unchanged.
3. **The data-terms approval** (the checkpoint's standing item) and the
   S-002 context-boundary estimate from step 2's reported tokens.
4. **One S-002 capture.** A new package, the `@2` default, at most 9 launches,
   with the D-5 budgets.
5. **Review and signing** through the existing workflow, which is the only
   path to `verified`. Held-out evaluation work follows the trust spec,
   separately.
```

## Checks made for this checkpoint

Each logged in R under `task6-impl-*` (exclusive create, stamp inside the
run's own command, failed runs kept):

- the trust spec's values, methods and line references against the code:
  `task6-impl-spec-check.20261014T234440Z.log` (two false failures: the check
  compared field names as statuses; kept),
  `task6-impl-spec-check-b.20261014T234452Z.log` (0 failures) and, on the
  final text, `task6-impl-spec-check-c.20261015T000056Z.log` (0 failures); the
  check fails on a copy whose evidence method says "case-folded"
  (`task6-impl-spec-check-teeth.20261015T000108Z.log`);
- the untouched files and the manifests:
  `task6-impl-untouched.20261014T234611Z.log`,
  `task6-impl-untouched-b.20261014T235911Z.log`;
- the finishing set: `task6-impl-targeted.20261014T234634Z.log`,
  `task6-impl-engine-tsc.20261014T234816Z.log`,
  `task6-impl-root-typecheck.20261014T234823Z.log`,
  `task6-impl-csrd.20261014T234831Z.log`;
- every quoted text block against its source, 24 of 24 exact in the first
  pass (`task6-impl-verbatim.20261014T235857Z.log`), 26 after fix round 1
  added two (the fix report names the run on this final text); the check
  fails on a copy with one quoted word changed
  (`task6-impl-verbatim-teeth.20261015T000154Z.log`);
- the identity and pin literals: `task6-impl-literals.20261015T000045Z.log`;
- the hash table: `task6-impl-sha-check.20261015T000130Z.log` and its
  failing control `task6-impl-sha-check-control.20261015T000142Z.log`;
- every use of the word "verified" in both documents, for review
  (`task6-impl-verified-words.20261015T000202Z.log`; the Task 6 report names
  the run on this final text): each is the signing status, a statement saying
  who verified what, a negation, or a quotation;
- every cited log's presence and every cited count's `Tests` line: run last,
  on the final text, and named in the Task 6 report;
- fix round 1 (`task6-impl-r1-*`): the spec check extended to every cited
  reference (`task6-impl-r1-spec-check.20261015T005109Z.log`, on the final
  spec `task6-impl-r1-spec-check-final.20261015T005145Z.log`, both 0
  failures; it fails on a copy citing a line no check covers,
  `task6-impl-r1-spec-check-teeth.20261015T005157Z.log`); the default suite's
  files (`task6-impl-r1-suite-files.20261015T003909Z.log`); no run of more
  than 31 files in R (`task6-impl-r1-no-full-run.20261015T004424Z.log`); each
  task's typecheck and csrd logs
  (`task6-impl-r1-typecheck-logs.20261015T004304Z.log`); the probe-question
  comments (`task6-impl-r1-probe-questions.20261015T004019Z.log`); where the
  data-terms item is stated (`task6-impl-r1-data-terms.20261015T005450Z.log`);
  and the lines read for the round's statements
  (`task6-impl-r1-reads.20261015T004322Z.log`). The hash table, verbatim,
  cited-log and "verified" checks re-run on this final text are named in the
  fix report.
