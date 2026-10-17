# Plan — `claude-code-cli@3`: `@2` with `--permission-mode default` requested, offline

**Status:** written 2026-10-17 and revised the same day after the user's
decisions. **Not started.**

- Every decision is taken (below).
- Nothing here runs anything live.
- The parent session performs every task itself. No subagent is used at any
  point (R-5).

## Why

- **What the probe showed.** In the one synthetic probe
  (`docs/superpowers/CHECKPOINT-opus55-minimal-probe.md`), the CLI's init
  event reported `permissionMode "auto"`. No permission flag was supplied.
  **Why the build selected `auto` is unknown.** The static reading of the
  pinned 2.1.295 (S, below) shows paths that could, and does not show which
  one did. `@2`'s strict init check refused the launch, correctly.
- **The repair.** A new adapter version, `claude-code-cli@3`: `@2` plus one
  requested flag, `--permission-mode default`, under the same strict,
  default-only init check. `auto` is never accepted, and no account setting
  is changed.
- **Why a new version** (R-1(b), the user, 2026-10-17). `@2` has one
  execution on file. Keeping `@2` byte-identical means that record names code
  that still exists exactly as it ran.
- **Why the check stays strict.**
  - A requested flag does not show the build applied it. Only the init event
    can show that.
  - By the build's own description, auto mode can approve tool use through a
    model classifier (S, finding 6). That is a request no adapter here counts.

## Decisions (the user, 2026-10-17)

- **R-1(b): a new version `@3`.**
  - `@1`'s and `@2`'s behaviour, launch descriptions, argv and identities are
    preserved.
  - `permissionMode` is part of `@3`'s invocation identity and of its
    mismatch enforcement.
- **R-2:** the mode accepted anywhere is exactly `"default"`.
- **R-3:** plugin and agent metadata are recorded, and no allowlist is added
  for them.
- **R-4:** the original stream stays only in external frozen evidence (X).
  The repository gets a documented derivative fixture:
  - incidental identifiers and account-usage metadata are normalised;
  - everything needed to reproduce the refusal and the downstream checks is
    retained.
- **R-5:** no subagents throughout this repair. The parent performs the
  focused work.

## What `@3` is, and is not

- **Identity:** `{ id: 'claude-code-cli', version: '3' }`.
- **Profile:** `@2`'s profile with exactly two differences, its identity and
  `permissionMode: 'default'`. These are equal to `@2`'s, field by field:
  - the pin;
  - the permitted models, effort and output ceiling;
  - the thirteen controls;
  - the `--settings` text;
  - both timeouts and the gate rules.
- **Adapter:**
  - Identity and invocation come from `@3`'s profile.
  - `buildRequest` is `@2`'s request construction applied to `@3`'s profile,
    which also carries the mode.
  - `projectResponse` and `readUsage` are `@2`'s own functions, the same
    objects. So the init check, which requires exactly `"default"`, is the
    same check for both.
- **Invocation identity:** `@2`'s four fields (effort, ceiling, executable,
  controls) plus `permissionMode: 'default'`.
- **What it is not:**
  - no change to `@1` or `@2` (behaviour, launch description, argv,
    identity, harness records);
  - no change to the projection's rules, the gate, the controls, the
    `--settings` text or the pin;
  - **no adapter framework.**

  The only new mechanisms are these:

  | New mechanism | Present for |
  |---|---|
  | an optional profile field | `@3` |
  | an optional launch-description key | `@3` |
  | an optional transport option | `@3` |
  | an optional invocation-identity field | `@3` |
  | the harness's explicit per-version entries | `@1`, `@2`, `@3` |

## Global Constraints

- **Test evidence.** `docs/superpowers/TEST-EVIDENCE-STANDARD.md` governs every
  check in this plan.
  - Every task carries a teeth check naming the defect it detects, with the
    output recorded verbatim.
  - A red counts only once its message has been read and names the intended
    assertion.
  - A mutation counts only once it is shown to have landed.
  - Every "must not happen" assertion has a sibling proving the guarded path
    runs.
  - The plan's own teeth checks are suspect until run.
- **One session writes and checks** (R-5).
  - Each task ends with the parent re-reading its own diff against the task's
    behaviour list, before any tooth runs.
  - Every tooth runs through the tooth procedure:
    1. the target's sha256 is checked;
    2. a copy is taken first;
    3. one replacement is made, refused unless the old text occurs exactly
       once, and the landed diff is shown;
    4. only the named test files are run;
    5. the target is restored from the copy and the restore confirmed by
       sha256.
- **Offline only.**
  - No Claude Code or `ollama` binary is executed. The pinned 2.1.295 is read
    and hashed only.
  - No authentication, inference, network, probe, rehearsal, S-002,
    promotion, signing or account change.
  - `pipeline-live.agents.test.ts` is never run.
  - Only the test files a task names are run. There is no engine-wide or
    root-wide test run.
- **Frozen, never written:**
  - the probe package P (`pilot-evidence/2026-10-17-opus55-minimal-probe-prep/`);
  - the execution X
    (`pilot-evidence/subscription-executions/synthetic-probe/opus55-minimal-shape/20261017T153205Z-1c89aa/`);
  - the static reading S (`pilot-evidence/2026-10-17-opus55-post-probe/`);
  - every hold root: `pilot-evidence/subscription-executions`, the
    candidate's `backend/engine/test/live-executions`, and
    `pilot-evidence/2026-09-24-s002-capture-prep/executions`. No file of
    this plan is created under any of them;
  - the main checkouts;
  - golden artifacts.
- **No regeneration path enters the repository** (CLAUDE.md). The fixture
  derivation in Task 2 runs from R and is described in the fixtures' README,
  never committed as code.
- **Engine constraints:**
  - `backend/engine/src/` stays program-agnostic, and `grep -ri csrd` stays
    at 7;
  - `src/verification/` stays pure;
  - every new file opens with a JSDoc *why* block;
  - no new runtime dependency;
  - `npm test` makes no network fetch.
- **Unknown versions refuse.**
  - Every harness lookup keyed on the subscription version is an explicit
    entry for `"1"`, `"2"` and `"3"`.
  - A version with no entry is refused by name before anything is created.
  - No lookup has a fall-through branch. Today's
    `=== '1' ? … : <@2's value>` form gives any non-`"1"` version `@2`'s
    values, and it is replaced.
  - A protection is on for `"2"` and `"3"`, and off only for `"1"`. No lookup
    may hand a version weaker behaviour by default.
- **Runs.** Every Node run goes through the parent's sandbox wrapper with the
  write logger and `--no-cache`, as in the spend-controls phase. Every run log
  carries its write summary, which must report 0 paths in b1b-record.
- **Evidence directory R:** `pilot-evidence/<date>-opus55-cli-v3-permission-mode/`,
  created at Task 0. Every log has a unique UTC-timestamped name, and R's
  `MANIFEST.sha256` is written last.
- **Tooling.**
  - Use `git --no-optional-locks`.
  - Bare `grep`, `find` and `rg` are forbidden: use `git grep`,
    `/usr/bin/grep`, `/usr/bin/find` or Read.
  - Never use `path` as a zsh loop variable, and never echo a bare `=====`.
  - Never write a manifest's temporary file inside the directory it lists.
- **Mutations** are restored from a copy and confirmed by sha256, never by
  `git checkout`.
- **Commits.** The user runs every `git add` and `git commit`: imperative
  sentence case, *why* not what, no `Co-Authored-By`.
- **Baselines.** Each task's baseline is the previous task's finishing count
  over the files it names. Task 0 records the first.
- **Stop rules.** Stop and report to the user, with no further task, if any
  of these happens:
  - Task 0's re-check differs from S;
  - Task 1A does not reproduce X's refusal exactly;
  - Task 1B is refused by any check;
  - Task 2's equivalence fails;
  - any red is for a reason other than the one intended.

## Already established, statically (S)

From `S/static-permission-mode-summary.20261017T155921Z.md`; S's manifest
is `a35f198ec130388d3b52895b1c9f1db54c9dbb3e21fe597131972280f0f6dbe6`.
The pinned 2.1.295 was read and never executed. By that reading:

1. The main command defines `--permission-mode <mode>`, parsed by a function
   that accepts the build's mode list plus an alias (offsets 204570344,
   204521918).
2. `default` is accepted. The evidence is the SDK's mode enum, the alias
   mapping, and the build spawning itself with `--permission-mode default`
   (offsets 187122978, 186805442, 199374610, 199399973). The list's literal
   itself was not located.
3. The starting mode is decided by one resolver (offset 190129550):
   - an explicit CLI mode is its first candidate, and the first candidate
     wins;
   - a fallback, which can pick `auto`, runs only when none of the
     resolver's inputs supplies a mode.
4. The two variables that would drop an explicit mode are not passed by the
   transport (offset 201388516).

**What this does not establish:**

- any runtime behaviour;
- that the init event reports the resolved mode;
- the feature values the build reads;
- **why the probe's launch reported `auto`.**

Only the init check on a later live launch, under a separately approved
probe, can show whether the flag takes effect.

## Task 0 — the plan's own pre-flight

- **Verify the inputs:**
  - S's manifest, P's two manifests (`f6bc53aa…`, `cbff1a01…`) and X's
    (`fc1c2e67…`);
  - the candidate's engine unchanged since `2eef70d`:
    `git --no-optional-locks diff --quiet 2eef70d HEAD -- backend/` holds.
    The only commits after `2eef70d` add the probe's checkpoint and this
    plan, docs only;
  - the tracked tree clean, with only the two `node_modules` symlinks
    untracked.
- **Create R.**
- **Re-check S:** re-dump the windows at offsets 204570344, 204521918,
  190129550 and 190142035 of the pinned executable, after confirming its
  sha256 `494870c9…f8230bdf6`, and compare each with S's logs byte for byte.
- **Record** the focused counts at HEAD, whose `backend/` is `2eef70d`'s:
  - `claude-code-cli-transport.test.ts`, `claude-code-cli.test.ts`,
    `claude-code-cli-v2.test.ts`;
  - `pipeline-identity.test.ts`, `provider-adapter.test.ts`;
  - `live-capture.test.ts`, `live-wiring.test.ts`.

**Teeth.** Compare one window against a deliberately shifted offset (+1).
The comparison must report a mismatch.

## Task 1 — two replays against the engine as committed at `2eef70d` (no code change)

**Two separately labelled replays.** They share a script and never a file
name, a log section or a conclusion. **Neither establishes live flag
behaviour.** Neither is a probe, and neither shows what 2.1.295 would emit.

- **1A, the ORIGINAL-STREAM REPLAY**, over a byte copy of X's role stream:
  `R/replay/ORIGINAL.role-reader[0]-launch2.sanitised.jsonl`. Its sha256 must
  equal `a3a7a577e45a5b31edd5dc5d7f7afa7c1bf5f6e51bdc5c2626746491031cf195`,
  checked when copied and again at the end.
  - It must throw `CliLaunchContextError` with exactly X's message:
    `reader[0]: the CLI's init event describes a launch this adapter did not request — permissionMode "auto" (must be "default") (init at line 1)`.
  - It is the positive control for the replay path. If it fails, stop.
- **1B, the PERMISSIONMODE-ONLY COUNTERFACTUAL**, over
  `R/replay/COUNTERFACTUAL.permissionMode-default.role-reader[0]-launch2.jsonl`.
  This is 1A's copy with one change: `"permissionMode":"auto"` on line 1
  becomes `"permissionMode":"default"`.
  - The derivation refuses unless the old bytes occur exactly once.
  - It shows the landed diff.
  - It confirms every other line is byte-identical, by per-line sha256, and
    the length grew by 3 bytes.
  - **If 1B is refused, stop.** Record the check that refused it, verbatim.
    Whether that refusal joins the repair is the user's decision.
  - **If 1B returns,** compare the returned text canonically, keys sorted and
    never trimmed or repaired, with `{"probe":"minimal-shape-ok"}`.
- **Mutants of 1B** show that 1B's later checks are live. Each is labelled
  `COUNTERFACTUAL-M<n>`, made by one change refused unless its old bytes
  occur exactly once, and must be refused by the check named:
  - **M1:** `"terminal_reason":"completed"` becomes `"max_turns"`. Refused by
    `CliResultError` naming `terminal_reason` (`checkResultV2`).
  - **M2:** `"isUsingOverage":false,` is removed. Refused by
    `CliUsageUnobservedError` naming `isUsingOverage absent`
    (`checkUsageObservedV2`).
  - **M3:** the result's `structured_output` becomes `{"probe":"other"}`.
    Refused by `CliOutputConflictError` naming `result.structured_output`
    (`checkResultRestatementV2`).

  A mutant refused by another check is a defective mutant: correct the
  mutant, not the conclusion.

**The script** lives in `R/replay/`, with its own `package.json` and
`tsconfig.json`, and opens with a *why* block.

- **Before loading the engine,** it refuses unless:
  - the eight engine files' sha256s equal X's `binding.engineFileDigests`;
  - `git --no-optional-locks diff --quiet 2eef70d HEAD -- backend/` holds;
  - the tracked tree is clean.
- **It loads `CLAUDE_CODE_CLI_V2_ADAPTER`** by absolute path.
- **It restates the probe's request,** without importing P:
  - role `reader`, index 0, model `claude-opus-5-5`;
  - the system prompt and message, checked against X's digests (`30dba10e…`,
    218 bytes; `936627…`, 71 bytes).
- **It wraps each stream in the transport's envelope:** exit 0, signal null,
  stderr 0.

**Also recorded:**

- Every `[REDACTED]` occurrence, by line and key path. The expectation is
  `session_id`, `uuid` and `cwd` only.
  - It comes with `git grep` evidence that the projection reads none of
    those keys.
  - It comes with the sanitiser's other differences from raw stdout:
    re-serialised lines, blank lines dropped, strings carrying `HOME`, `USER`
    or an email replaced.
- **CLI-reported metadata `@2` does not judge** (R-3), verbatim:
  - the init's `plugins` and `agents`;
  - the result's `modelUsage` `contextWindow` and `maxOutputTokens`.

  These carry the checkpoint's caveats: listing is not execution, and a
  catalog figure is not the request's ceiling.

**Output:** `R/replay/replay.<UTC>.log`, with separate sections headed
`ORIGINAL-STREAM REPLAY` and `COUNTERFACTUAL`; then `R/replay/MANIFEST.sha256`,
last. No repository file changes.

**Teeth:**

- run the derivation on a copy whose field already reads `default`: it must
  refuse;
- run the binding check with one engine digest altered: it must refuse
  before the engine loads.

## Task 2 — the derivative fixture (R-4), derived in R

**Purpose.** A committed test can exercise the real 2.1.295 stream shape
without the repository holding the original or the account's usage at that
hour.

**Source:** 1A's byte copy, never X directly.

**Normalised.** Each original value maps to one fixture value wherever it
occurs as a whole JSON value, never as a substring:

| What | Where | Fixture value |
|---|---|---|
| the message ID | `message.id`, every `api_message_id` | `msg_fixture_0001` |
| the request ID | the assistant item's `request_id` | `req_fixture_0001` |
| the tool-use ID | the block's `id`, the restatement's `id`, the tool result's `tool_use_id`, `tool_result_meta[].id` | `toolu_fixture_0001` |
| the CLI's socket path | init `messaging_socket_path` | `/tmp/cc-socks/0.sock` |
| the five-hour reset | `rate_limit_info.resetsAt`, `unifiedWindows.five_hour.resetsAt` | `1800000000` |
| the seven-day reset | `unifiedWindows.seven_day.resetsAt` | `1800272400` (the original 272,400 s gap and order kept) |
| each utilisation | `unifiedWindows.*.utilization` | `0.25` |

**Retained unchanged**, because the refusal or a downstream check needs it,
or because it is the recorded shape:

- every line, its order, and every key and its order;
- the init's checked fields, `permissionMode "auto"` included, and its
  `plugins`, `agents` and `capabilities`;
- every model name;
- the `partial_json` deltas, byte for byte;
- the restatement, `structured_output`, and the tool result's text and
  permission decision;
- every stop reason, `subtype`, `is_error`, `terminal_reason`, `num_turns`,
  `api_error_status`, fast-mode field and `speed`;
- the token counts and `modelUsage`;
- the rate-limit event's categorical fields: `status`, `rateLimitType`,
  `overageStatus`, `overageDisabledReason` and `isUsingOverage`;
- the `[REDACTED]` values;
- the timing fields and `total_cost_usd`. These are neither identifiers nor
  account usage, and the README names them.

**Equivalence, the gate for committing.** The replay script runs over the
derivative exactly as Task 1 ran over the original:

- as recorded;
- with only `permissionMode` changed;
- with M1 to M3.

Each outcome must match the original's: the same error class and the same
check. Each message must equal the original's message after the
normalisation map is applied to it. Under 1B, `readUsage` must agree as well.

**What is committed:**

- `backend/engine/test/fixtures/claude-code-cli/probe-2.1.295-permission-auto.derived.stream.jsonl`;
- a new section and table row in that directory's `README.md`, following its
  existing convention:
  - the origin, X's path, with the original's bytes (7,782) and sha256;
  - the derivative's bytes and sha256;
  - the normalisation table and the retained list;
  - **"DERIVED and NORMALISED from sanitised evidence; not a recording; the
    original is preserved, unmodified, at the origin"**;
  - what the fixture shows, and what it cannot show: live flag behaviour.

**Teeth**, each on a copy in R:

- **an inconsistent map**, one tool-use ID left unnormalised (the tool
  result's `tool_use_id`): the equivalence must fail, under the permission-only
  change, with the tool loop's `CliOutputConflictError` naming that line;
- **a value moved out of its class**, a utilisation of `1.5`: the
  equivalence must fail, with `CliUsageUnobservedError` naming
  `utilization`.

## Task 3 — `@3`'s objects and launch path

**Files:** `src/pipeline/claude-code-cli.ts` and
`src/pipeline/claude-code-cli-transport.ts`.

**Behaviour:**

- **New objects:** `CLAUDE_CODE_CLI_V3_IDENTITY`, `CLAUDE_CODE_CLI_V3_PROFILE`
  and `CLAUDE_CODE_CLI_V3_ADAPTER`, as specified under "What `@3` is". The
  profile's comment says why `@3` exists, citing the probe's checkpoint and S,
  and says the init check observes the outcome.
- **The profile field.** `CliProfile` gains an optional
  `permissionMode?: 'default'`. `@1`'s and `@2`'s profile objects do not
  change.
- **The launch description** gains an optional `permissionMode`, after
  `settings` and before `role`.
  - Only `@3`'s `buildRequest` writes it, always, from its profile.
  - `@1`'s and `@2`'s bodies stay byte-identical.
  - `@3`'s description is `@2`'s plus `"permissionMode":"default",`, which
    counts against the admitted-bytes bound.
- **The schemas.** Both strict launch-description schemas accept the key only
  as `"default"`. Any other value or type is refused before anything is
  created: `CliLaunchSpecMalformedError` and `LaunchSpecError` respectively.
- **The role argv.** A description carrying the key launches with
  `--permission-mode` and `default` immediately after
  `--no-session-persistence`. Any other description launches exactly as
  today, and the recorded argv matches what was launched.
- **The transport option.** A transport handed the optional `permissionMode`
  option:
  - refuses a role launch whose description's mode is not exactly that
    mode, absent included;
  - the refusal is `LaunchPermissionModeMismatchError`, naming both;
  - it happens before the pin check, the launch directory and the prompt
    file;
  - without the option, nothing is compared.
- **The gate's argv** is unchanged.

**Tests** (in `claude-code-cli-transport.test.ts`, `claude-code-cli.test.ts`
and `claude-code-cli-v2.test.ts`):

- **Argument construction:**
  - a new V3-A1: `@3`'s request, built by its adapter, reaches the child as
    exactly this argv, with `--permission-mode` once, followed by `default`;
  - V2-A1 and V1-A1 stay **unchanged** as controls: neither argv has the
    flag;
  - the transport given a description without the key launches today's argv.
- **Bodies:**
  - `@3`'s body carries `"permissionMode":"default"` exactly once, between
    `settings` and `role`;
  - `@2`'s body for a fixed request equals a literal taken from `2eef70d`'s
    code before any edit;
  - `@1`'s body equals its pinned literal.
- **The profile:**
  - each `@3` profile field equals `@2`'s, except `identity` and
    `permissionMode`;
  - `@2`'s profile has no `permissionMode` key.
- **Shared functions.** `@3`'s `projectResponse` and `readUsage` are `@2`'s
  (`toBe`). `@3`'s pin equals `@2`'s, so the shared init check's pin-version
  read holds for both.
- **Refused descriptions.** One row each for `"auto"`, `"bypassPermissions"`,
  `"plan"`, `"dontAsk"`, `"manual"`, `""`, `"Default"`, `null` and `1`. Each
  is refused at parse, with no launch record and no directory.
- **The mismatch.**
  - A transport handed `'default'` with a description lacking the key throws
    `LaunchPermissionModeMismatchError`, and no directory is created.
  - The pin path in that case does not exist, so reaching the pin check
    would throw `ExecutablePinMismatchError` instead.
  - Sibling: the matching description launches the dummy.

**Teeth:**

| Tooth | Mutation | Defect | Must red |
|---|---|---|---|
| T3a | the argv drops the pair | `@3` never sends the flag | V3-A1; V2-A1 and V1-A1 green |
| T3b | the pair is emitted for every description | `@1` and `@2` changed | V2-A1, V1-A1 and the no-key row |
| T3c | the schemas accept any string | a non-default mode launched | the `"auto"` and `"bypassPermissions"` rows, as accepted |
| T3d | the transport comparison removed | a description without the flag launching under `@3`'s transport | the mismatch row; its sibling green |
| T3e | the comparison moved after the pin check | work done before the refusal | the mismatch row, red with `ExecutablePinMismatchError` |
| T3f | `@3`'s `buildRequest` omits the key | `@3`'s profile and request disagreeing | V3-A1 and the `@3` body case |
| T3g | `@3`'s `projectResponse` replaced by a copy that skips the launch-context check | `@3` not sharing `@2`'s strict check | the shared-function case |

**Counts:** the baseline is Task 0's. Every added test is accounted for by
title, and every renamed title is listed.

## Task 4 — `@3`'s identity and its enforcement

**Files:** `src/pipeline/provider-adapter.ts`, `src/pipeline/identity.ts`,
`src/pipeline/claude-code-cli.ts` and `test/live-capture.ts`.

**Behaviour** (the controls precedent of the spend-controls phase):

- **The type.** `InvocationIdentity` gains an optional
  `permissionMode: 'default'`.
- **`invocationOf`** declares it when the profile states one, so only
  `@3`'s invocation carries it.
- **`identityPayload`** emits `invocation.permissionMode` only when defined,
  never as `null`.
- **`assertValidInvocationIdentity`** refuses a present value other than
  `"default"`.
- **`invocationDifferences`** reports a missing or differing mode in both
  directions.
- **`describeInvocation`** appends it.
- **Enforcement.** Orchestration's existing `InvocationMismatchError` therefore
  refuses a live runner whose permission mode differs from the
  configuration's.
- **`SUBSCRIPTION_ROLE_CONFIG_V3`** (`test/live-capture.ts`): `@2`'s
  configuration with `@3`'s identity and invocation.
  `SUBSCRIPTION_ROLE_CONFIG` (`@2`) is unchanged.
- **`@3`'s identity literal** is taken by a placeholder run. It is then
  confirmed by the builder over `SUBSCRIPTION_ROLE_CONFIG_V3`, by the builder
  over a literal configuration, and by a hand-written derivation hashed with
  `node:crypto`.

**Controls:**

- **(i)** `SUBSCRIPTION_ROLE_CONFIG_V3` with version `"2"` and no
  `permissionMode` derives exactly `@2`'s
  `pipeline-v3-737f8d5015ea4249eef93cfa66c0b1b9bbb323fd633e7d5a71c26f453f8ce90e`.
  So the version and the mode are the only differences.
- **(ii)** Without `permissionMode` but with version `"3"`, it derives a third
  literal, unequal to both. So each difference moves the identity on its own.
- **(iii)** Unmoved:
  - HTTP `pipeline-v3-06789a36…` and the S-001 binding;
  - `@1` `pipeline-v3-fd3ed34d…`;
  - `@2` `pipeline-v3-737f8d50…`;
  - `GOLDEN_IDENTITY` `pipeline-v3-1d566c99…`;
  - the present-invocation golden `pipeline-v3-002ec70e…`.

**Tests** (in `pipeline-identity.test.ts` and `provider-adapter.test.ts`):

- the `@3` literal and the three controls;
- validation rows: `"auto"`, `""`, a number, `null`;
- mismatch rows: a `@3` configuration with a runner lacking the mode, and the
  reverse, each refused naming `permissionMode`;
- the matching pair accepted.

**Teeth:**

| Tooth | Mutation | Defect | Must red |
|---|---|---|---|
| T4a | `identityPayload` drops the mode | `@3`'s identity not naming its launch | the `@3` literal and control (ii); the unmoved five green |
| T4b | `permissionMode: null` emitted when absent | every other identity moving | control (iii)'s `@2` and the present-invocation golden |
| T4c | `invocationOf` omits it | `@3`'s adapter and configuration disagreeing silently | the `@3` configuration case |
| T4d | differences ignore it | a runner under another mode accepted | both mismatch rows; the matching pair green |
| T4e | validation accepts any string | a malformed identity accepted | the validation rows |

**Counts:** the baseline is Task 3's finishing count.

## Task 5 — `@3` in the harness and the production registry

**Files:** `test/live-capture.ts`, `test/live-capture.test.ts`,
`src/cli/live-wiring.ts` and `test/live-wiring.test.ts`.

**Behaviour.** Each site is explicit, and an unknown version refuses.

| # | Site | `@3`'s behaviour |
|---|---|---|
| 1 | version lookup (`subscriptionVersionOf`) | `"1"`, `"2"` or `"3"`; any other identity refused by name (`SubscriptionRouteMismatchError`) before anything exists |
| 2 | configuration selection (`subscriptionRoleConfigFor`) | an explicit entry: `@3` → `SUBSCRIPTION_ROLE_CONFIG_V3` |
| 3 | profile selection (`subscriptionProfileFor`, and through it `subscriptionExecutableFor`) | an explicit entry: `@3` → `@3`'s profile |
| 4 | production registration (`PRODUCTION_ADAPTERS`) | `@3` registered after `@2`; `verify run` refuses it as capture-only, as it does every CLI version |
| 5 | default routing | `captureSubscriptionRun` with no adapter handed in runs `@3`; `runFirstLiveCase` routes the subscription route to `@3`; `subscriptionLifetimeMs`'s default timeouts read `@3`'s profile (the values are equal, and the 16,470,000 ms literal is unchanged) |
| 6 | included-usage stops (the facts, the in-flight stop and the backstop) | on for `"2"` and `"3"` |
| 7 | reset holds | unchanged: every version is held, by every earlier record under its root |
| 8 | trust reporting (D-9) | on for `"2"` and `"3"` |
| 9 | launch budget (D-5) | on for `"2"` and `"3"` |
| 10 | `requested` in `execution.json` | carries `permissionMode` only for a profile that states one (`@3`) |
| 11 | the unobserved statements | `SUBSCRIPTION_V3_UNOBSERVED`: `@2`'s five statements, and one more, below; `@2`'s are unchanged |
| 12 | the transport option | the harness hands the transport the profile's mode for `@3` |

Site 11's added statement says:

- the mode is requested by flag, and checked at init to be exactly
  `"default"`;
- the build's handling of the flag is a static reading (S) only;
- why the probe's `@2` launch reported `auto` is unknown.

**Existing tests keep testing `@2`.**

- The three `captureV2` helpers in `live-capture.test.ts` (the `@2` route,
  usage and trust blocks) take the route's default today. They hand in
  `CLAUDE_CODE_CLI_V2_ADAPTER` explicitly instead.
- Their doc comments and V2-E1's title ("on the default adapter") are
  corrected to say so. These are renames, listed; no case is removed.
- `live-wiring.test.ts`'s exact key list gains `claude-code-cli@3`, an
  intended change.

**New tests:** one `@3` case per protection, each with its negative control.

| Protection | `@3` case | Negative control |
|---|---|---|
| version lookup | `@3` accepted | an identity `claude-code-cli@4` refused by name, with no directory created |
| configuration and profile | `@3`'s configuration, identity literal, pin and settings on file | `@2` handed in: `@2`'s configuration and profile, no `permissionMode` |
| registration | `@3` resolves from `PRODUCTION_ADAPTERS`; `verify run` refuses it capture-only | `claude-code-cli@4` refused by `UnknownProviderAdapterError` |
| default routing | no adapter handed in: the record names `claude-code-cli@3`, and the reader's argv carries the pair | `@2` handed in: `V2_READER_ARGV` exactly, no flag |
| first live case | `runFirstLiveCase` on the subscription route runs `@3` | the HTTP route unchanged |
| included-usage stop | a `@3` stream with a rejected window: the usage stop is filed, the run stops and the result is withheld | a clean `@3` run: `usageStop` null, completed |
| reset hold | a `@3` start before an earlier record's reset: `UsageResetPendingError`, nothing created | the reset passed: it starts. A `failed` record with `usageStop` null, as the probe filed: no hold |
| `@3`'s own hold | `@3`'s stop holds the next execution under the same root | the same stop under another root: not held there (the stated residual) |
| trust | `@3`: `trust` null while running, four tiers once finished | `@1`: no `trust` key |
| budget | `@3` with 10 launches: `SubscriptionBudgetError` before anything is created | 9: accepted |
| `requested` | `@3`: `permissionMode` `"default"` | `@2`: no key |
| unobserved | `@3`: `@2`'s five statements and the mode's | `@2`: its five exactly |
| transport option | an adapter copy of `@3` whose `buildRequest` drops the key: `LaunchPermissionModeMismatchError` before any launch line | `@3` itself launches |

`@3` runs on the `v2` capture dummy, which records its argv and does not
check it.

**Teeth.** One per site. Each mutation gives `"3"` the weaker or `@2`'s
branch at that site alone.

- **The named test must fail for the intended reason.** Its failure message
  is read and must name the intended assertion.
- **Every other failure is inspected.** A mutation of the selected profile or
  configuration can legitimately break several dependent `@3` tests.
  - Each additional failure is recorded verbatim and must be explained by
    the mutation.
  - One that is not explained is a finding, investigated before the next
    tooth.
- **The `@1` and `@2` controls the mutation does not touch stay green.**
- **No test is weakened, split or reordered** to make a mutation fail only
  one case.

| Tooth | Mutation | Named test that must fail |
|---|---|---|
| T5-1 | the version lookup maps an unknown version to `"3"` | the `@4` refusal |
| T5-2 | `"3"` selects `@2`'s configuration | the `@3` configuration case |
| T5-3 | `"3"` selects `@2`'s profile | the default-routing argv and the `@3` `requested` case |
| T5-4 | `@3` missing from the registry | the registration case |
| T5-5 | the default stays `@2` | the default-routing case |
| T5-5b | `runFirstLiveCase` keeps `@2` | the first-live-case case |
| T5-6 | included usage off for `"3"` | the `@3` stop case |
| T5-8 | trust off for `"3"` | the `@3` trust case |
| T5-9 | the budget skipped for `"3"` | the `@3` budget case |
| T5-10 | `requested` drops the mode | the `@3` `requested` case |
| T5-11 | `"3"` gets `@2`'s unobserved statements | the `@3` unobserved case |
| T5-12 | the option not handed over | the dropped-key case |

Site 7 needs no code change. Its two cases are evidence that the shared check
holds for `@3`. Their tooth is T5-7: the hold check skipped for `"3"` only,
which must red the `@3` hold case.

**Counts:** the baseline is Task 4's finishing count.

## Task 6 — the init check rejects `auto`, by name, for both `@2` and `@3` (tests only)

**Files:** `claude-code-cli-v2.test.ts`, and the derivative fixture from
Task 2.

**Behaviour already in the code:** the shared check refuses every
`permissionMode` but exactly `"default"`.

**Tests:**

- **Rows added to "claude-code-cli@2 — D-8 launch context"**, beside the
  existing `acceptEdits` and absent rows:
  - `"auto"`, the probe's value;
  - `"bypassPermissions"`, `"plan"` and `"dontAsk"`;
  - `"manual"`, the build's alias for default, refused because the check
    compares the exact string requested;
  - `"Default"` and `null`.

  Each must throw `CliLaunchContextError` with
  `permissionMode <value> (must be "default") (init at line 1)`. The
  `"default"` acceptance case stays the positive control. Because the function
  is shared (Task 3), these rows cover `@3`.
- **The derivative fixture.** Its sha256 is asserted equal to the README's
  value, and each case runs through `@2`'s and `@3`'s `projectResponse` both:
  - **as derived:** `CliLaunchContextError` with exactly X's message;
  - **COUNTERFACTUAL** (its title says: "only `permissionMode` changed;
    shows the projection's handling of such a stream; not evidence the flag
    works live"): the outcome equals Task 2's normalised 1B outcome;
  - **its sibling**, the counterfactual with `isUsingOverage` removed:
    `CliUsageUnobservedError`. This shows the downstream checks run on the
    fixture.

**Teeth:**

| Tooth | Mutation | Must red |
|---|---|---|
| T6a | the check also accepts `"auto"` | the `"auto"` row and the fixture's as-derived case |
| T6b | the permission-mode check removed | every permission-mode row |
| T6c | the comparison made case-insensitive | the `"Default"` row |

**Counts:** the baseline is Task 5's finishing count.

## Task 7 — re-run both replays on the repaired tree, finish, checkpoint

- **Re-run Task 1's 1A and 1B,** labelled as before, through `@2`'s and
  `@3`'s `projectResponse` on the working tree, recording its engine digests.
  The outcomes must be byte-identical to Task 1's, because the projection is
  unchanged and shared.
- **Finish checks:**
  - final focused counts;
  - engine `tsc --noEmit` and root `npm run typecheck`;
  - csrd 7;
  - every log's write summary.
- **Checkpoint** `docs/superpowers/CHECKPOINT-opus55-cli-v3-permission-mode.md`:
  - what changed and why, and the decisions;
  - the identity impact;
  - every tooth with its first failure verbatim;
  - counts and write locations;
  - what stays unobserved;
  - the hand-forward below.
- **Hand the user** the exact `git add` and `git commit` commands.

## Unknowns this plan does not touch (carried forward)

- **HTTP attempts inside the CLI.** One request ID per launch is all a stream
  shows.
- **Billing.** It is not provable from the client.
- **Whether `--effort high` is applied.**
- **Why the probe's launch reported `auto`** while no permission flag was
  supplied.
- **Whether the explicit flag takes effect at run time.**
- **The unreached checks on a real stream.** Tasks 1 and 2 examine them only
  counterfactually.
- **The rest:** where the catalog came from; whether `--setting-sources ''`
  excludes `~/.claude`; native structured output; refusal retry; exhaustion;
  long-context, nine-launch and variance behaviour; the wire-level
  `max_tokens`; whether `-p` honours every `--settings` key; what built-in
  plugins add to a request (R-3).

## Considered and not taken

- **R-1(a), changing `@2` in place.** The user chose `@3`, so `@2`'s one
  execution keeps naming code that still exists unchanged.
- **Accepting `auto`.** It allows classifier requests that nothing counts.
- **Changing account settings, or relying on them.** The user's instruction.
- **`disableAutoMode` in the launch's `--settings` text.** It would be a
  second, unverified control, in a text whose honouring under `-p` is itself
  unobserved. It may be considered later beside the flag, never instead of
  the check.
- **`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`.** It forces `default` by S, but it
  also scrubs the subprocess environment, unread.
- **An init allowlist for plugins and agents.** R-3.
- **Making `--settings` an identity input.** That is the spend-controls
  checkpoint's open decision 1, unchanged.

## After this plan: what a future probe of `@3` needs

Nothing here prepares or runs a probe. A future probe would be the first
`@3` execution, and needs all of these:

- **a new reviewed package with a new case ID**, not
  `synthetic-probe/opus55-minimal-shape`. It must be bound to the final
  candidate's HEAD and engine digests;
- **the same shared hold root**,
  `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions`,
  as its filing root and as a hold root;
- **a fresh readiness step:** the operator's Terminal.app pre-flight, and the
  D-6 account confirmations asked again;
- **the user's separate explicit approval.**

Its scope and statements follow the first probe's:

- one gate and at most one role launch;
- one runner attempt and at most one role process;
- HTTP attempts inside the CLI unobserved;
- billing not proven.
