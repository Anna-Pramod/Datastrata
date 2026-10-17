# Checkpoint — `claude-code-cli@3`: `@2` with `--permission-mode default` requested, offline

Written 2026-10-17 by the parent session that carried out
`docs/superpowers/plans/2026-10-17-opus55-permission-mode-repair.md` (committed
at `2d8ed3e`).

- **Where.** The candidate worktree
  `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate`, branch
  `feature/opus55-subscription-migration`. The work was done in the working
  tree over HEAD `2d8ed3e`, whose `backend/` is `2eef70d`'s.
- **Not committed.** The user runs every `git add` and `git commit`.
- **Who.** No subagent took part (R-5). The parent wrote every change and ran
  every check and every tooth.
- **Offline.**
  - No Claude Code or `ollama` binary was executed. The pinned 2.1.295 was
    only read and hashed.
  - No authentication, inference, network, probe, rehearsal, S-002,
    promotion, signing or account change.
  - The live agents suite was not run.
  - Only focused test files ran.
- **Evidence directory R:**
  `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-17-opus55-cli-v3-permission-mode/`.
  Every log named below is in it. Its `MANIFEST.sha256` is given at the end.
- **Frozen and unchanged,** each verified by its manifest at the start and at
  the end:
  - the probe package P;
  - the execution X;
  - the static reading S;
  - the shared hold root.

## Why

- **The probe.** In the one synthetic `@2` probe
  (`CHECKPOINT-opus55-minimal-probe.md`), the CLI's init event reported
  `permissionMode "auto"`. No permission flag was supplied, and why the build
  selected `auto` is unknown. `@2`'s strict init check refused it.
- **The repair.** `claude-code-cli@3`:
  - requests `--permission-mode default`;
  - shares `@2`'s strict, default-only init check;
  - names the mode in its invocation identity.

  `@2` is unchanged, so the one `@2` execution on file still names code that
  exists as it ran (R-1(b)).

## What changed

| File | Change |
|---|---|
| `src/pipeline/claude-code-cli.ts` | `CliProfile.permissionMode?` (optional; absent on `@1`'s and `@2`'s profiles); `CLAUDE_CODE_CLI_V3_IDENTITY`, `CLAUDE_CODE_CLI_V3_PROFILE` (`@2`'s profile spread, with its identity and `permissionMode: 'default'`), `buildRequestV3` (`@2`'s construction for `@3`'s profile, plus the key after `settings`), `CLAUDE_CODE_CLI_V3_ADAPTER` (`projectResponse` and `readUsage` are `@2`'s own functions); the launch description's optional `permissionMode`, schema-checked as exactly `"default"`; `invocationOf` names the mode where the profile states one; the module comment's `@3` paragraph |
| `src/pipeline/claude-code-cli-transport.ts` | the launch description's optional `permissionMode` (exactly `"default"`); the argv pair `--permission-mode default` after `--no-session-persistence` when present; the option `permissionMode`, compared before the pin, refusing as `LaunchPermissionModeMismatchError`; the module comment |
| `src/pipeline/provider-adapter.ts` | `InvocationIdentity.permissionMode?: 'default'`; validated when defined; compared by `invocationDifferences` (so `InvocationMismatchError` enforces it both ways); shown by `describeInvocation` |
| `src/pipeline/identity.ts` | `identityPayload` emits `invocation.permissionMode` only when defined |
| `src/cli/live-wiring.ts` | `@3` registered in `PRODUCTION_ADAPTERS`; comments |
| `test/live-capture.ts` (the harness) | `SUBSCRIPTION_ROLE_CONFIG_V3`; `subscriptionVersionOf` knows `"3"`, and still refuses any other by name; `subscriptionRoleConfigFor` and `subscriptionProfileFor` are explicit per-version switches with no default; `subscriptionProtectionsFor` gives `@2` and `@3` every protection and `@1` none; the default adapter and `runFirstLiveCase`'s subscription adapter are `@3`; `subscriptionLifetimeMs`'s default timeouts read `@3`'s profile (equal values); `requested.permissionMode` and the transport option where the profile states a mode; `SUBSCRIPTION_V3_UNOBSERVED`; `SubscriptionBudgetError` names the adapter's own key; the route-mismatch refusal's prefix names `@3` |
| `test/fixtures/claude-code-cli/probe-2.1.295-permission-auto.derived.stream.jsonl` | new: the derived, normalised fixture (Task 2) |
| `test/fixtures/claude-code-cli/README.md` | the fixture's section and the intro's one added sentence |
| seven test files | the tests below, and the edits to existing tests listed under "Existing tests changed" |

`@1`'s and `@2`'s launch descriptions, argv, profiles, invocations and
identities are unchanged. The checks below show it.

## Task 0 — pre-flight

- **Sandbox** (`sandbox-controls.20261017T163455Z.log`). Writes were refused
  into:
  - a denied scratch path;
  - the pilot-evidence root outside R, the rule that also covers P, X, S and
    the hold root, none of which was probed;
  - b1b-record;
  - the candidate's fixtures.

  Further controls:
  - a write into R was allowed;
  - exec from a denied path failed;
  - outbound TCP returned `EPERM` inside the sandbox and `ECONNREFUSED`
    outside it;
  - the write logger recorded a write into R.

  The profile's `~/.claude.json` rule was not probed, because a failure would
  have overwritten it.
- **Inputs** (`task0-inputs.20261017T163519Z.log`):
  - S's, P's two and X's manifests all matched the recorded digests, with
    8, 19, 134 and 5 entries OK;
  - `backend/` was unchanged since `2eef70d`;
  - the status was only the two `node_modules` symlinks;
  - the hold root had 11 entries;
  - csrd was 7.
- **S re-checked** (`task0-static-recheck.20261017T163537Z.log`). The pin
  hashed to its digest. The windows at 204570344, 204521918, 190129550 and
  190142035 were byte-identical to S's logs.
  - **Tooth:** shifted by one byte, all four differ
    (`task0-static-recheck-tooth.20261017T163537Z.log`).
- **Baseline** (`task0-baseline-focused.20261017T163553Z.log`, titles in
  `task0-baseline-titles.20261017T163553Z.txt`): 7 files, 988 tests, all
  passing.

  | File | Baseline |
  |---|---|
  | `claude-code-cli-transport.test.ts` | 70 |
  | `claude-code-cli.test.ts` | 205 |
  | `claude-code-cli-v2.test.ts` | 378 |
  | `pipeline-identity.test.ts` | 46 |
  | `provider-adapter.test.ts` | 120 |
  | `live-capture.test.ts` | 159 |
  | `live-wiring.test.ts` | 10 |

  0 paths written in b1b-record.

## Task 1 — the two replays, against the engine as committed at `2eef70d`

Separately labelled; **neither establishes live flag behaviour, neither is a
probe, neither shows what 2.1.295 would emit.** All under `R/replay/`.

- **Binding.** `replay.ts` refused to load the engine unless:
  - the eight engine files hashed to X's recorded digests;
  - `backend/` was unchanged since `2eef70d`;
  - the tree was clean.

  The restated prompt and message matched X's input digests.
  - **Tooth:** with one expected digest altered, it refused before the engine
    loaded (`replay-task1-tooth-digest.20261017T163958Z.log`, exit 64, no
    `engine loaded` line).
- **The derivation** (`derive-task1.20261017T163932Z.log`). The original byte
  copy is `a3a7a577…` (X's entry). The counterfactual changes one field on
  line 1, +3 bytes, every other line byte-identical.
  - **Tooth:** deriving from the counterfactual itself refused ("found 0").
- **Redactions** (`redacted-keys-unread.20261017T164019Z.log`). There are 33
  `[REDACTED]` values, under `session_id` (16), `uuid` (16) and `cwd` (1).
  `claude-code-cli.ts` names none of those keys; the harness, the positive
  control, does.
- **Outcomes** (`replay-task1.20261017T163943Z.log`,
  `replay-task1-mutants.20261017T163958Z.log`):

| Case | Through `@2` |
|---|---|
| **1A ORIGINAL-STREAM REPLAY** | refused, `CliLaunchContextError`, **exactly** X's message: `reader[0]: the CLI's init event describes a launch this adapter did not request — permissionMode "auto" (must be "default") (init at line 1)` |
| **1B PERMISSIONMODE-ONLY COUNTERFACTUAL** | **returned** `{"probe": "minimal-shape-ok"}` (the deltas, spaced), canonically equal to the expected object: no later check refused it |
| COUNTERFACTUAL-M1, `terminal_reason` `"max_turns"` | refused, `CliResultError`: `terminal_reason "max_turns" at line 16 (must be "completed")` |
| COUNTERFACTUAL-M2, `isUsingOverage` removed | refused, `CliUsageUnobservedError`: `the rate_limit_event at line 15: isUsingOverage absent (must be present and false)` |
| COUNTERFACTUAL-M3, `structured_output` `{"probe":"other"}` | refused, `CliOutputConflictError`: `result.structured_output at line 16 differs from the concatenated deltas` |

- **Usage read:** `inputTokens` 2, `outputTokens` 60,
  `cacheCreationInputTokens` 1182, `cacheReadInputTokens` 0, for 1A and 1B
  alike.
- **CLI-reported metadata, not judged (R-3):** two built-in plugins, four
  agents, and `modelUsage` `contextWindow` 1,000,000 and `maxOutputTokens`
  128,000. Listing is not execution, and a catalog figure is not the
  request's ceiling.
- **Stop rule.** 1A reproduced the refusal and 1B was not refused, so Task 1
  did not stop the plan.

## Task 2 — the derived fixture (R-4)

- **Derivation** (`fixture/derive-fixture.20261017T164130Z.log`). It was made
  from 1A's byte copy by `fixture/normalise.py`, outside the repository:
  - the message ID (12 occurrences);
  - the request ID (1);
  - the tool-use ID (4);
  - the socket path (1);
  - the two resets (2 and 1);
  - the two utilisations, 1 each.

  The structural proof covers 14 of 16 lines changed, and no difference
  outside the map. The result is 7574 bytes, sha256 `08223ed4…f0da`.
- **Equivalence** (`fixture/equivalence.20261017T164154Z.log`). 5 of 5 pairs
  pass: the outcome, the error class and the message after the map, and the
  usage reading. They are DERIVED, DERIVED-COUNTERFACTUAL and M1 to M3.
- **Teeth** (`fixture/teeth-*.20261017T164210Z.log`). Both failed the
  equivalence as intended:
  - **A, an inconsistent map:** the tool loop's `CliOutputConflictError`, `the tool_result at line 12 answers "toolu_018HYPbNMJDCdkxu6pcaKYgG"; the StructuredOutput call started at line 4 is "toolu_fixture_0001"`;
  - **B, utilisation 1.5:** `CliUsageUnobservedError`, `unifiedWindows["five_hour"].utilization 1.5 (must be a number no greater than 1)`, and the same for `seven_day`.
- **Committed.** The fixture was copied `cp -n`, sha256 equal, and its README
  section records the origin, both hashes, the map, the retained list, and
  what it shows and cannot show. The original stays only in X.

## Task 3 — `@3`'s objects and launch path

- **Tests:** `claude-code-cli-transport.test.ts` +14 (84), and
  `claude-code-cli.test.ts` +17 (Task 4 adds one more).
  - **Transport:** `V3-A1`; `V3-A2`; `V3-S1` ×9 (`"auto"`,
    `"bypassPermissions"`, `"plan"`, `"dontAsk"`, `"manual"`, `""`,
    `"Default"`, `null`, `1`); `V3-H1`, `V3-H2`, `V3-H3`.
  - **Adapter:** `C1-v3`, `C2-v3`, `C5-v3`, `R1-v3`, `R2-v3`, `R4-v3`;
    `R6-v3` ×10; `R7-v3`.
- **Run:** 684 of 684 (`task3-focused.20261017T164750Z.log`, 31 titles added).
- **Controls.** `V2-A1`, `V1-A1`, `R1-v2` and `R2-v2`, unchanged, stay green.
  They hold `@2`'s and `@1`'s argv and bodies byte for byte.

## Task 4 — `@3`'s invocation identity and its enforcement

- **The new identity.** `@3`'s is
  `pipeline-v3-ecb06a30764aff78ecf25bde4a8c3e25fcf4d827ce336a5cd757863ae8eb332d`,
  taken by a placeholder run (`task4-placeholder-identity.20261017T165440Z.log`).
  The builder over the literal configuration, the builder over
  `SUBSCRIPTION_ROLE_CONFIG_V3` and the hand-written derivation all received
  it.
- **Controls:**
  - **(i)** `@3`'s exported configuration, with version `"2"` and no mode,
    derives exactly `@2`'s `pipeline-v3-737f8d50…`;
  - **(ii)** the version alone and the mode alone each derive a further
    distinct identity, and the hand-writer reaches both;
  - **(iii)** unmoved: HTTP `pipeline-v3-06789a36…` and S-001, `@1`
    `pipeline-v3-fd3ed34d…`, `@2` `pipeline-v3-737f8d50…`, `GOLDEN_IDENTITY`
    and the present-invocation golden, all in unchanged tests that pass.
- **Enforcement** (`provider-adapter.test.ts`). A `@3` configuration with a
  runner lacking the mode is refused, and so is the reverse, each naming only
  `permissionMode`. The matching pair, as a distinct object, runs and binds
  once.
- **Tests:**
  - `pipeline-identity.test.ts` +6;
  - `provider-adapter.test.ts` +9: one positive control, five validation
    rows, three enforcement cases;
  - `claude-code-cli.test.ts` +1: `C6-v3`, the literal invocation.
- **Run:** 404 of 404 (`task4-focused.20261017T165624Z.log`); engine
  `tsc --noEmit` exit 0 (`task4-engine-tsc.20261017T165624Z.log`).

## Teeth, Tasks 3 and 4

Each tooth ran through `tooth.sh`, with its target, mutation, diff, tests and
restore in one log under `R/teeth/`:

1. the target's sha256 was checked;
2. a copy was taken;
3. one replacement was made, refused unless unique;
4. the named files were run under the sandbox;
5. the target was restored from the copy and the restore confirmed by
   sha256.

Every log ends `restore CONFIRMED by hash`. For each tooth, the named test
fails on the intended assertion. Further failures were read, and each is
explained by the mutation; the untouched `@1` and `@2` controls stayed green.

| Tooth | Mutation | Failed | Named test and first failure (verbatim) |
|---|---|---|---|
| T3a | the argv drops the pair | 3 of 84 | V3-A1: `argv[13]: expected '--settings' to be '--permission-mode'`; also V3-H2, V3-H3; V2-A1 and V1-A1 green |
| T3b | the pair emitted for every description | 9 of 84 | V2-A1 and V1-A1: `argv[13]: expected '--permission-mode' to be '--settings'`; V3-A2: `expected [ '-p', '--model', …(23) ] to not include '--permission-mode'`; six further argv cases whose positions shifted |
| T3c (transport) | the transport schema accepts any string | 9 of 84 | every V3-S1 row: `expected 'ExecutablePinMismatchError' to be 'LaunchSpecError'` (the string accepted, then refused by the unmatched pin); `null` and `1` by the changed message |
| T3c (adapter) | the adapter schema accepts any string | 10 of 222 | R6-v3: `"auto" was not refused: expected undefined to be an instance of CliLaunchSpecMalformedError`, and every string row; `null`, `1` and `{}` by the changed message |
| T3d | the transport comparison removed | 1 of 84 | V3-H1: `expected 'ExecutablePinMismatchError' to be 'LaunchPermissionModeMismatchError'`; V3-H2 green |
| T3e | the comparison moved after the pin check | 1 of 84 | V3-H1: `expected 'ExecutablePinMismatchError' to be 'LaunchPermissionModeMismatchError'` |
| T3f | `@3`'s `buildRequest` omits the key | 5 of 306 | V3-A1: `argv[13]: expected '--settings' to be '--permission-mode'`; R1-v3, R2-v3; V3-H2 (the mismatch now refuses it), V3-H3 |
| T3g | `@3`'s `projectResponse` a copy that swallows the launch-context refusal | 1 of 222 | C5-v3: `expected [Function projectResponse] to be [Function projectResponseV2]` |
| T4a | `identityPayload` drops the mode | 3 of 181 | the `@3` literal: `expected 'pipeline-v3-bb7349d0…' to be 'pipeline-v3-ecb06a30…'`; the export; control (ii): `expected 'pipeline-v3-737f8d50…' not to be 'pipeline-v3-737f8d50…'` (the mode-only identity collapsed onto `@2`'s); the unmoved five green |
| T4b | `permissionMode: null` emitted when absent | 11 of 181 | `@2`'s literal: `expected 'pipeline-v3-fe9318d8…' to be 'pipeline-v3-737f8d50…'`; the present-invocation golden: `expected 'pipeline-v3-079ddbc7…' to be 'pipeline-v3-002ec70e…'`; every identity derived over an invocation moved |
| T4c | `invocationOf` omits it | 3 of 404 | C6-v3: `expected { effort: 'high', …(3) } to strictly equal { effort: 'high', …(4) }`; the `SUBSCRIPTION_ROLE_CONFIG_V3` case; "accepts … the invocation the @3 adapter actually declares" |
| T4d | differences ignore it | 2 of 129 | both enforcement rows: `expected undefined to be an instance of InvocationMismatchError`; the matching pair green |
| T4e | validation accepts any string | 3 of 129 | the `"auto"`, `"Default"` and `""` rows: `expected undefined to be an instance of InvalidInvocationIdentityError`; `null` and number rows still refused |

## Task 5 — `@3` in the harness and the registry

- **Every protection `@2` has, for `@3`.** Each has its own test, beside its
  negative control:
  - configuration and profile selection, by explicit per-version switches
    with no default;
  - production registration;
  - default routing, so that with no adapter handed in the route runs `@3`;
    `runFirstLiveCase`'s subscription adapter is `@3` too;
  - the included-usage stop, the in-flight stops and the backstop;
  - the reset hold, which holds every version;
  - trust reporting;
  - the launch budget;
  - the `requested` and `unobserved` records;
  - the transport's permission-mode comparison, handed the mode from the
    profile.
- **Unknown versions refuse.** `claude-code-cli@4` is refused by name:
  - as the adapter handed in (`SubscriptionRouteMismatchError`, before
    anything exists);
  - in each lookup (`subscriptionRoleConfigFor`);
  - by the registry (`UnknownProviderAdapterError`).
- **Tests:**
  - `live-capture.test.ts` +9 (168): V3-U1 to V3-U4 and V3-U2b, nested under
    the included-usage describe; V3-E1, V3-R1, V3-B1 and V3-H1 in a top-level
    `@3` describe. V3-U2b was added during Task 7; see below;
  - `live-wiring.test.ts` +1 (11): W0b. W0 now lists three CLI adapters and
    resolves `@3`, and W9 gains the rows `@3, registered` and
    `@4, unregistered`;
  - `pipeline-identity.test.ts`: its `subscriptionRoleConfigFor` case maps
    `@3` to its own configuration and refuses `@4`. The count is unchanged,
    at 52.
- **Run:** 230 of 230 (`task5-focused.20261017T170736Z.log`).
  - **The first run** (`task5-focused.20261017T170508Z.log`) failed one test,
    V2-D2: `"adapter": "claude-code-cli@3"` where `@2` was expected. Its
    helper `captureUninjected` relied on the default, which is now `@3`.
  - **The fix** hands in `CLAUDE_CODE_CLI_V2_ADAPTER`, as the three `captureV2`
    helpers now do. Every other direct subscription call in the test file was
    confirmed to name its adapter.

### Teeth, Task 5

The same `tooth.sh`. Every log is `teeth/T5-*.20261017T171016Z.log`, and
every one ends `restore CONFIRMED by hash`. T5-4's hash is `4ddc48ec…`; every
other hash is `172d0d21…`. The counts are of the files before V3-U2b was
added. For each tooth the named test fails on the intended assertion. Further
failures were read, and each is explained by the mutation. Every failing test
is a `@3` or `@4` case: no `@1` or `@2` test failed in any of these thirteen.
T5-7b, below, is separate. The identity file's `subscriptionRoleConfigFor` case covers every
version. It stopped at its `@3` row (T5-2, line 653) or its `@4` row (T5-1,
line 660), after its `@1` and `@2` assertions on lines 646–651 had passed.

| Tooth | Mutation | Failed | Named test and first failure (verbatim) |
|---|---|---|---|
| T5-1 | `subscriptionVersionOf` lets any `claude-code-cli` identity fall through to `"3"` | 2 of 219 | V3-R1: `expected { status: 'failed', …(26) } to be an instance of SubscriptionRouteMismatchError` (the `@4` adapter handed in ran as `@3`); the identity file's `subscriptionRoleConfigFor` case, at its `claude-code-cli@4` row: `AssertionError: claude-code-cli@4` (no refusal thrown) |
| T5-2 | `"3"` selects `@2`'s configuration | 9 of 219 | V3-R1 and the identity file's case: `expected { prosecutorCount: 7, …(5) } to be { prosecutorCount: 7, …(5) }` (`@2`'s object returned for `@3`). Every `@3` run (F1, V3-U1 to V3-U4, V3-E1, V3-H1) was refused before launch by the engine's own cross-check: `ProviderAdapterMismatchError`, `this run's pipelineVersion is derived over provider adapter claude-code-cli@2 but the execution capability speaks claude-code-cli@3`. That is why V3-U4's dummy `never wrote ready` |
| T5-3 | `"3"` selects `@2`'s profile | 3 of 167 | V3-E1: `expected { …(6) } to deeply equal { …(7) }` (`requested` lacks the mode); F1: `expected { …(6) } to match object { permissionMode: 'default' }`; V3-H1: `role children launched for a description without the profile's mode: expected 9 to be +0` (the transport is no longer handed the mode) |
| T5-4 | `@3` missing from the registry | 1 of 11 | W0: `expected [ 'anthropic-messages@1', …(2) ] to deeply equal [ 'anthropic-messages@1', …(3) ]`. W0b and W9 stay green: W9's rows are capture-only refusals that come before any registry lookup, `@4`'s included |
| T5-5 | the default adapter stays `@2` | 2 of 167 | V3-E1: `expected 'pipeline-v3-737f8d5015ea4249eef93cfa6…' to be 'pipeline-v3-ecb06a30764aff78ecf25bde4…'`; V3-B1: `expected 'the subscription route on claude-code…' to contain 'claude-code-cli@3 admits a launch bud…'` |
| T5-5b | `runFirstLiveCase` keeps `@2` | 1 of 167 | F1: `expected 'claude-code-cli@2' to be 'claude-code-cli@3'` |
| T5-6 | included usage off for `"3"` | 4 of 167 | V3-U1: `expected undefined to strictly equal { kind: 'exhausted', …(6) }`; V3-U3, V3-U4 and V3-E1 fail because the included-usage protection is what files `usageStop`, so it is absent where the stop or `null` was expected. No `@2` included-usage test failed |
| T5-7 | the reset hold skipped for `"3"` | 1 of 167 | V3-U2: `not refused: the capture returned status completed: expected { status: 'completed', …(26) } to be an instance of UsageResetPendingError` |
| T5-8 | trust off for `"3"` | 4 of 167 | V3-E1, V3-U4, F1 and V3-U1: `execution.json carries a trust key: expected false to be true` (V3-U4: `@3's running execution.json carries a trust key`) |
| T5-9 | the launch budget skipped for `"3"` | 1 of 167 | V3-B1: `expected { status: 'completed', …(26) } to be an instance of SubscriptionBudgetError`; nine, the positive control, still completes (V3-E1 green) |
| T5-10 | `requested` drops the mode | 2 of 167 | V3-E1: `expected { …(6) } to deeply equal { …(7) }`; F1: `expected { …(6) } to match object { permissionMode: 'default' }` |
| T5-11 | `"3"` gets `@2`'s unobserved statements | 1 of 167 | V3-E1: `expected { …(5) } to deeply equal { …(6) }` (the `permissionMode` statement missing) |
| T5-12 | the transport not handed the profile's mode | 1 of 167 | V3-H1: `role children launched for a description without the profile's mode: expected 9 to be +0` (the description without the mode launched, the comparison no longer armed); V3-E1, the positive control, green |

**V3-U2b and T5-7b, added during Task 7.**

- **The gap.** The plan's reset-hold row named two negative controls:
  - the reset passed, so the start proceeds (V3-U2 has it);
  - "A `failed` record with `usageStop` null, as the probe filed: no hold".
    No test had it as a stated control, for `@2` or `@3`. T5-7b later showed
    two `@2` cases relying on it implicitly.

  It matters for the next milestone: X is exactly such a record (`"failed"`,
  `usageStop` null, `claude-code-cli@2`) under the shared hold root.
- **V3-U2b** files that record under a scratch root and starts `@3`, which
  completes. Its sibling stops the same record until a reset ahead of the
  clock, and the next `@3` start is held, so the test shows that root is read.
  - **Run:** 168 of 168 (`task7-v3u2b.20261017T173501Z.log`). The titles file
    is `task7-v3u2b-titles.20261017T173501Z.txt`: 1 added, 0 removed, against
    Task 5's.
- **T5-7b** made the hold check treat a `failed` record without a usage stop
  as unfinished. The defect it detects is such a record, X's shape, holding
  every later start.
  - **Result:** 3 failed of 168 (`teeth/T5-7b.20261017T173648Z.log`), with
    the restore confirmed, `172d0d21…`. V3-U2b failed:
    `UsageResetPendingError: refusing to start a subscription execution: the earlier execution record synthetic-probe/opus55-minimal-shape/failed-no-stop/execution.json under the execution root has status "failed", neither "completed" nor "failed": …`.
  - **The two other failures are `@2` cases,** V2-D2 and V2-GT11. Each is
    refused by an earlier `failed` record with no usage stop under its own
    root (`csrd/CSRD-S-002/no-injection` and a generated ID). The check is
    shared by every version, so those cases already relied on this
    behaviour implicitly. The mutation touches the check they use, so they
    are explained, not controls the mutation leaves alone.

**T5-3 and the argv, a correction to the plan's expectation.** The plan said
T5-3 must red "the default-routing argv and the `@3` `requested` case". It
reddened the `requested` case, but the argv went unobserved:

- V3-E1 stopped at its `requested` assertion, before its argv assertion:
  lines 4637 and 4644 as the file stood for the T5 teeth, before V3-U2b moved
  them. F1 stopped likewise, at line 2180.
- By the code, `@3`'s request, and so its argv, is built by `@3`'s adapter
  from `@3`'s own profile. The harness's profile selection does not reach it.
  It reaches `requested`, the transport's mode option (V3-H1, red), the pin
  and the lifetime.
- The request's key has its own tooth, T3f.

## Task 6 — the shared init check refuses `auto`, by name, for `@2` and `@3` (tests only)

No code changed in this task.

- **Rows added to "claude-code-cli@2 — D-8 launch context"** (+7), beside
  the existing `acceptEdits` and absent rows:
  - `"auto"`, the probe's value;
  - `"bypassPermissions"`, `"plan"` and `"dontAsk"`;
  - `"manual"`, read statically (S) as the build's own alias for default.
    It is refused because the check compares the exact string requested;
  - `"Default"` and `null`.

  Each throws `CliLaunchContextError` with
  `permissionMode <value> (must be "default") (init at line 1)`. The function
  is shared (C5-v3), so the rows cover `@3`.
- **The derived fixture** (+7):
  - **V-P0:** the file is the README's: 7574 bytes, its sha256, 16 lines, and
    one `"permissionMode":"auto"`.
  - **V-P1**, through `@2` and through `@3`: as derived, it is refused with
    exactly X's message.
  - **V-P2**, through each, COUNTERFACTUAL: only `permissionMode` is changed,
    in the test. The projection returns `{"probe": "minimal-shape-ok"}`,
    Task 2's normalised 1B outcome. Its title says this is the projection's
    handling of such a stream, not evidence that the flag works live.
  - **V-P3**, through each, V-P2's sibling: with `isUsingOverage` also
    removed, `CliUsageUnobservedError`. The later checks do run on the
    fixture.
- **Run:** 392 of 392 (`task6-focused.20261017T172918Z.log`). The titles file
  is `task6-focused-titles.20261017T172918Z.txt`: 14 added, 0 removed, against
  the baseline's 378.

### Teeth, Task 6

All three use target `src/pipeline/claude-code-cli.ts` and test file
`claude-code-cli-v2.test.ts`. The logs are `teeth/T6*.20261017T172947Z.log`,
and each restore was confirmed by hash, `6327158f…`.

| Tooth | Mutation | Failed | Named test and first failure (verbatim) |
|---|---|---|---|
| T6a | the check also accepts `"auto"` | 3 of 392 | the `"auto"` row: `expected a CliLaunchContextError: expected undefined to be 'CliLaunchContextError'`; V-P1 through `@2` and through `@3`, the same |
| T6b | the permission-mode check removed | 12 of 392 | all nine permission-mode rows and both V-P1 cases: `expected a CliLaunchContextError: expected undefined to be 'CliLaunchContextError'`. Also V-D2, the existing ordering test whose second case pairs a mode fault with a result fault: `expected 'CliResultError' to be 'CliLaunchContextError'` (with the check gone, the result check refuses first) |
| T6c | the comparison made case-insensitive | 1 of 392 | the `"Default"` row: `expected a CliLaunchContextError: expected undefined to be 'CliLaunchContextError'` |

## Task 7 — the replays on the repaired tree, and the finish

### The two replays, again: on the working tree, through `@2` and `@3`

Separately labelled, as in Task 1. **Neither establishes live flag behaviour.
Neither is a probe, and neither shows what 2.1.295 would emit.**

- **The run** (`replay/replay-task7.20261017T173024Z.log`, `--mode working`).
  The engine digests were recorded, not required.
  - Five of X's eight recorded files differ, exactly the recorded files this
    repair changed: `claude-code-cli.ts`, `claude-code-cli-transport.ts`,
    `provider-adapter.ts`, `live-wiring.ts` and `test/live-capture.ts`.
  - The other three equal their recorded digests: `live-runner.ts`,
    `anthropic-messages.ts` and `test/included-usage.ts`.
  - The restated prompt and message still equal X's input digests.
  - `v3.projectResponse === v2.projectResponse` is `true`.
- **The comparison** (`replay/compare-task7.20261017T173040Z.log`). It
  requires a line for every Task 1 label through `v2` and through `v3`. All
  20 lines are SAME as Task 1's: 0 differing, missing or unexpected.
  - **Teeth**, on scratch copies of the Task 7 log:
    - with M3's two messages altered by one character, both are reported
      DIFFERS (`compare-task7-tooth-altered.20261017T173040Z.log`, exit 1);
    - with `USAGE ORIGINAL-1A v3` removed, it is reported missing
      (`Task 7: null`; `compare-task7-tooth-missing.20261017T173040Z.log`,
      exit 1).

| Case | Through `@2` and through `@3`, on the repaired tree |
|---|---|
| **1A ORIGINAL-STREAM REPLAY** (the recorded bytes, `a3a7a577…`) | refused, `CliLaunchContextError`, exactly X's message, the same as Task 1's |
| **1B PERMISSIONMODE-ONLY COUNTERFACTUAL** (not the recorded bytes) | returned `{"probe": "minimal-shape-ok"}`, canonically the expected object, the same as Task 1's |
| COUNTERFACTUAL-M1, M2, M3 | refused by `CliResultError`, `CliUsageUnobservedError` and `CliOutputConflictError`, each message the same as Task 1's |

The usage read is identical in every case: 2, 60, 1182, 0.

### Finish checks

- **The final focused run** (`task7-final-focused.20261017T173846Z.log`;
  titles in `task7-final-focused-titles.20261017T173846Z.txt`): 9 files,
  1,310 of 1,310, 0 paths written in b1b-record.

  | File | Baseline (Task 0) | Final | New | Renamed |
  |---|---|---|---|---|
  | `claude-code-cli-transport.test.ts` | 70 | 84 | 14 | |
  | `claude-code-cli.test.ts` | 205 | 223 | 18 | |
  | `claude-code-cli-v2.test.ts` | 378 | 392 | 14 | |
  | `pipeline-identity.test.ts` | 46 | 52 | 6 | |
  | `provider-adapter.test.ts` | 120 | 129 | 9 | |
  | `live-capture.test.ts` | 159 | 168 | 9 | F1, V2-E1 |
  | `live-wiring.test.ts` | 10 | 11 | 1 | W0 |
  | **the seven** | **988** | **1,059** | **71** | **3** |
  | `included-usage.test.ts`, a dependent, unchanged | — | 172 | | |
  | `pipeline-replay.test.ts`, a dependent, unchanged | — | 79 | | |

  - **Against the baseline's titles,** 74 titles were added in the seven
    files (71 new, 3 renamed) and 3 removed, the renamed titles' old forms.
  - **The two dependents** were not in the baseline. Their test files are
    unchanged since `2d8ed3e`, and every case passes.
  - **The run before V3-U2b** (`task7-focused.20261017T173107Z.log`) passed
    1,309 of 1,309. It is superseded by the final run.
- **Typechecks:**
  - engine `tsc --noEmit`, exit 0 (`task7-engine-tsc.20261017T173846Z.log`);
  - root `npm run typecheck`, both workspaces, exit 0
    (`task7-root-typecheck.20261017T173846Z.log`).
- **csrd:** 7, the seven pre-existing hits, distributed as CLAUDE.md lists
  (`task7-inputs.20261017T173846Z.log`).
- **Write summaries.** 50 logs in R record a Node run through the write
  logger, and every one reports 0 paths in b1b-record. The others record
  Python, shell or git steps, or the sandbox controls, or say there was no
  write log.
- **The frozen inputs, re-verified as at Task 0**
  (`task7-inputs.20261017T173846Z.log`):
  - every manifest MATCHes its digest, with every entry OK: S `a35f198e…`
    8/8, P `f6bc53aa…` 19/19, P's offline checks `cbff1a01…` 134/134, and X
    `fc1c2e67…` 5/5;
  - the hold root has 11 entries, as at Task 0;
  - the pin hashes to `494870c9…`, its pinned digest;
  - HEAD is `2d8ed3e`, and `backend/` at HEAD is unchanged since `2eef70d`;
  - the status lists the 14 modified files, the fixture and this checkpoint
    as new, and the two `node_modules` symlinks.
- **The final diff** (`final-backend.20261017T174205Z.diff`, sha256
  `c20dbead79ebe786af79d62aad1c363f04a695ceab49d633c6d478509a64b75d`). Its
  stat and per-file hashes are in `final-backend-stat.20261017T174205Z.log`.
  - It covers `backend/` against `2d8ed3e`: 14 files changed, 1,152
    insertions and 82 deletions, and the new fixture's 16 lines.
  - `git apply --check --reverse` of it against the working tree exits 0.
  - This checkpoint is not in it, because the checkpoint records R's
    manifest.

## The identity impact

- **New:** `@3`'s pipeline identity,
  `pipeline-v3-ecb06a30764aff78ecf25bde4a8c3e25fcf4d827ce336a5cd757863ae8eb332d`.
  It differs from `@2`'s in the adapter's version and the invocation's
  permission mode, and in nothing else (controls (i) and (ii)).
- **Unmoved,** each asserted by an unchanged test that passes:
  - HTTP `pipeline-v3-06789a36…`, and the S-001 binding;
  - `@1` `pipeline-v3-fd3ed34d…`;
  - `@2` `pipeline-v3-737f8d50…`;
  - `GOLDEN_IDENTITY` `pipeline-v3-1d566c99…`;
  - the present-invocation golden `pipeline-v3-002ec70e…`.
- **Why they do not move.** `identityPayload` emits `permissionMode` only when
  an invocation declares it, and only `@3`'s does. T4b shows the alternative,
  emitting `null`, moving every one of them.
- **`@2`'s one execution.** X's `binding.engineFileDigests` name the files as
  committed at `2eef70d`, which stay in history. Five of those eight files
  now hash differently (Task 7's replay records which), because `@3` was added
  beside `@2`'s code. What X ran is unchanged in behaviour: `@2`'s profile,
  adapter, launch description, argv and identity. The unchanged V2-A1, V1-A1,
  R1-v2 and R2-v2 tests and the `@2` literal pass.

## Existing tests changed

No case was removed, split or weakened. Three titles were renamed: F1, V2-E1
and W0.

- **`live-capture.test.ts`:**
  - **The four `@2` helpers.** The three `captureV2` helpers (the `@2` route,
    usage and trust blocks) and `captureUninjected` took the route's default.
    That default is now `@3`, so each now hands in `CLAUDE_CODE_CLI_V2_ADAPTER`
    explicitly. Their doc comments say so, and the `SubOver` comment names the
    default as `@3`. Their assertions are unchanged.
  - **V2-E1**, renamed: "on the default adapter" became "`@2` handed in
    explicitly".
  - **F1**, renamed: "on `@2`" became "on `@3` with its permission mode
    requested". Its adapter assertion is now `claude-code-cli@3`, with two
    assertions added: `requested.permissionMode` and the reader's argv pair.
  - **D1:** its expected route-mismatch prefix now names `@3`:
    `the subscription route runs claude-code-cli@3 or claude-code-cli@2, or claude-code-cli@1 over an injected launch only`.
- **`live-wiring.test.ts`:**
  - **W0**, renamed: "two CLI adapters" became "three". The exact key list
    gains `claude-code-cli@3`, and W0 resolves `@3`.
  - **W9:** its row `@3, unregistered` became `@3, registered`, and a row
    `@4, unregistered` was added. Both are refused the same way.
- **`pipeline-identity.test.ts`:**
  - **The hand-written derivation** emits `"permissionMode"` last inside the
    invocation, where one is declared. For every invocation without it the
    text is unchanged, as the unmoved literals show.
  - **`subscriptionRoleConfigFor`'s refused row** moved from `@3` to `@4`, and
    `@3` assertions were added.
- **`claude-code-cli-v2.test.ts`:** seven rows added to an existing table,
  and nothing else changed.
- **`test/fixtures/claude-code-cli/README.md`:** one sentence added to the
  intro, and the new fixture's section.

## Decisions taken while implementing

These are choices the plan left open. Each is routine and reversible.

1. **`buildRequestV3` is its own function:** `@2`'s construction plus the key.
   `buildRequestV2` is untouched in code as well as in output.
2. **`@3`'s profile is `@2`'s, spread,** with its own identity and the mode,
   so every other field is `@2`'s by construction. C2-v3 checks each is the
   same value.
3. **Per-version switches.** `subscriptionProtectionsFor`, one exhaustive
   switch, gives each version its protections, replacing the harness's
   `version === '2'` conditions: `@2` and `@3` get all four, and `@1` none, as
   before. The configuration and profile selections are likewise exhaustive
   switches with no default.
4. **`SubscriptionBudgetError` names the adapter's own key.** It named `@2`
   literally, and V3-B1 needs `claude-code-cli@3` in the refusal.
5. **The route-mismatch refusal's prefix** names `@3` beside `@2` and `@1`.
   D1's expected text follows.
6. **`captureUninjected` is handed `@2` explicitly too.** The plan named only
   the three `captureV2` helpers; V2-D2's first-run failure found the fourth.
7. **V3-U2b and its tooth** were added during Task 7, to supply a control the
   plan specified.
8. **Task 7's replay** also re-ran M1–M3 beside 1A and 1B. Its comparator
   requires every Task 1 label through both adapters.

## What stays unobserved

- **Whether `--permission-mode default` takes effect at run time.** This
  phase shows that `@3` requests it (argv, tests) and that `@3` refuses
  anything but `"default"` at init (tests, replays). Only a live `@3` launch's
  init event can show what the pinned build reports when the flag is passed.
  S's reading, that an explicit mode precedes the `auto` fallback, is a
  reading of bytes, not an observation.
- **Why the probe's launch reported `auto`** with no flag supplied. Unknown.
- **HTTP attempts inside the CLI.** One request ID per launch is all a stream
  shows.
- **Billing.** It is not provable from the client.
- **Whether `--effort high` is applied.**
- **The checks after the init check, on a real stream.** They are examined
  only counterfactually (Tasks 1, 2, 6 and 7).
- **The rest, unchanged:**
  - where the catalog came from;
  - whether `--setting-sources ''` excludes `~/.claude`;
  - native structured output;
  - refusal retry;
  - exhaustion;
  - long-context, nine-launch and variance behaviour;
  - the wire-level `max_tokens`;
  - whether `-p` honours every `--settings` key;
  - what built-in plugins add to a request (R-3).

## Handed forward

- **The next milestone** is the user's: a new minimal `@3` probe package
  bound to the commit of this repair, then operator readiness, then one
  separately approved live probe. Nothing here prepares or runs it.
- **What that probe needs,** as the plan states:
  - **a new reviewed package with a new case ID,** not
    `synthetic-probe/opus55-minimal-shape`. It is bound to the candidate's
    HEAD after this commit and to its engine digests;
  - **the same shared hold root,**
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions`,
    as its filing root and as a hold root. That root holds X, a `failed`
    record with `usageStop` null, which by V3-U2b holds nothing;
  - **a fresh readiness step:** the operator's Terminal.app pre-flight, and
    the D-6 account confirmations asked again;
  - **the user's separate explicit approval.**
- **Its scope and statements** follow the first probe's:
  - one gate and at most one role launch;
  - one runner attempt and at most one role process;
  - HTTP attempts inside the CLI unobserved;
  - billing not proven.
- **P is `@2`'s package,** bound to `@2` and the pre-repair engine digests. It
  cannot run `@3` and is not reused. P and X stay frozen.
- **The agents suite.** `runFirstLiveCase`, which
  `pipeline-live.agents.test.ts` calls, now routes the subscription route to
  `@3`. The suite was not run in this phase.
- **Open decisions, unchanged:**
  - `--settings` as an identity input, the spend-controls checkpoint's open
    decision 1;
  - `disableAutoMode` in `--settings`, beside the flag and never instead of
    the check, under the plan's "Considered and not taken".

## Process notes

- **No subagents** (R-5). The parent wrote every change, ran every check and
  tooth itself, and read every failure message quoted here.
- **V2-D2, V3-U2b and T5-3's argv expectation** are described in Task 5.
- **The comparator** was tightened before its first run. As first written it
  took its labels and adapters from the Task 7 log, so a Task 7 log missing
  the `v3` lines would have passed.
- **A stray call.** One Task 7 command included an unintended
  `replace-once.py /dev/null /dev/null /dev/null`. It opened `/dev/null` for
  writing and wrote an empty string. No file was touched.
- **The `~/.npm` `mkdir`.** Every write summary lists one call outside the
  known roots, the baseline's included: npx's `mkdir` of the existing
  `/Users/vivin/.npm`. Its mtime is still 2026-08-09T15:39:48, so no
  modification was observed.
- **Editor state.** After teeth rewrote files outside the editor, the editor
  refused an edit until the file was re-read. Each target's hash was
  confirmed after its restore.
- **A comment made precise** before Task 6's tests first ran: `"manual"` is,
  read statically, the build's alias for default.
- **What ran.** Only the focused files named here: never `npm test`, never the
  agents suite.

## R's manifest

- **`R/MANIFEST.sha256`:** 99 entries, every file in R but itself, each
  verified OK after writing. Its sha256 is
  `120b70934f70acfc8444a2bcdbe69968b899a295948c4ec192201f639c208bbf`.
- **`R/replay/MANIFEST.sha256`:** 21 entries, each verified OK. Its sha256 is
  `103bba0de6a3d747dd142ace167629e86070d39556670fc622b0a487c99dd84d`, and it
  is itself one of R's entries.
- **How they were written.** Both were built in the scratchpad and copied in
  with `cp -n`, so neither lists a temporary file. Nothing in R was written
  after them.
- **A superseded save.** The first save of the final diff carried the
  fixture's absolute path in its `diff --git` header. It was regenerated from
  the repository root with a relative path. The first save and its stat were
  moved to the scratchpad, not deleted, before either manifest was written.

