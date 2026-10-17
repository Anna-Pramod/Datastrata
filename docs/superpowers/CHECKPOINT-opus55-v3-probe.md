# Checkpoint — the one `claude-code-cli@3` synthetic probe, completed, on `0c59998`

Written on 2026-10-18 (+0530), 2026-10-17 UTC, by a later session, after the
run, in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD
`0c59998e3015dba4a3a3936782a61ac5e0164eb5`). Every time below is UTC.

- **Scope of this change.** This file is the only addition to the candidate.
  No code changed. Nothing is committed: the user runs every `git add` and
  `git commit`.
- **Where the evidence is.**
  - **P3**: the `@3` probe package
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-17-opus55-v3-minimal-probe-prep/`
    (`README.md`, `HANDOVER.md`).
  - **X3**: the execution
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/synthetic-probe/opus55-v3-minimal-shape/20261017T184410Z-7c0af4/`.
    Its label calls it shape-probe evidence, "not a verification recording,
    not a rehearsal, not an S-002 capture, and not an input to promotion".
  - **Cited, not read here:** the four in the table below.
- **Unchanged.** Neither P3 nor X3 was written after the run. Their hashes are
  below.
- **Nothing further is on file.** The shared root holds only X and X3, and
  nothing under it is newer than X3's manifest (checked at 19:05Z). Nothing
  further live is authorised.
- **Offline.** This session executed no Claude Code, `ollama` or Node binary,
  ran no test, and used no network and no subagent.

| Cited | `MANIFEST.sha256` | Recorded in |
|---|---|---|
| P, the first (`@2`) probe package | `f6bc53aaeb84ea5ccca74a972b25395d59092f09e28514a69cb7e3a2f9ec2aec` | the first checkpoint |
| P's `offline-checks/` | `cbff1a01bdccdbb617ffaf2adb216411d6fd92596720cfea94a325010e47ee83` | the first checkpoint |
| X, its execution | `fc1c2e674079239e5bc20291346ed7fcbbd9f5276d36180037da4fe94dd3a0eb` | the first checkpoint |
| S, the static reading of 2.1.295 | `a35f198ec130388d3b52895b1c9f1db54c9dbb3e21fe597131972280f0f6dbe6` | the first checkpoint |
| R, the repair's evidence | `120b70934f70acfc8444a2bcdbe69968b899a295948c4ec192201f639c208bbf` | the repair checkpoint |

"The first checkpoint" is `CHECKPOINT-opus55-minimal-probe.md`, and "the
repair checkpoint" is `CHECKPOINT-opus55-cli-v3-permission-mode.md`. P3's
`offline-checks/inputs-final.20261017T183316Z.log` records all five manifests
as matching, every entry OK, eleven minutes before the run. This session did
not read them again.

## The outcome

The letter after each item names its class of evidence, defined below.

- **The run.** After a pre-flight, the operator ran the hash-bound launcher
  once, in Terminal.app, and it exited 0 (A). The execution ran from
  18:44:10.484Z to 18:44:14.084Z (C1).
- **The gate passed** (C1).
- **The role launch completed.** One `reader[0]` launch of `claude-opus-5-5`
  at effort `high` ran to completion (C1). It answered
  `{"probe": "minimal-shape-ok"}` through one `StructuredOutput` call (B).
- **The mode.** `--permission-mode default` was requested and passed (C1). The
  init event, at line 1, reported `permissionMode "default"` (B). The
  committed init check accepted it (C2).
- **The later checks passed, on a real stream for the first time** (C2). The
  output was accepted (C1).
- **Filed result.** Status `completed`, `error` null (C1). `usageStop` is
  `null` (C1), so there is no reset hold (C2).
- **The package is spent.** Its single-use rule (A6, the case directory
  exists) refuses any second start.

## The execution, bound by hash

- `MANIFEST.sha256`:
  `9e20975d2247e5966fa2b56e54e6fec6e793f948626f04571c55727f1a53b431`. It
  covers six files, all verified by this session with `shasum -a 256 -c`. No
  file is unlisted but the manifest itself.

  | File | sha256 |
  |---|---|
  | `execution.json` | `4d429fa0110662c777d1440c81d65fbda9038be8c79af6e7b7a68ae23836e30a` |
  | `attempts.jsonl` | `f41d559600b837daae21ca67fd4f7cb9519d8c12e6f6cd988be77cafe54491c8` |
  | `launches.jsonl` | `fb9360c2ac63649071774af1f42786c87fc659f962c35ed13686db652f3b36e0` |
  | `model-output.json` | `ac06df01f2860220cc6c827206e4b2cb95a3aad01621ed15d903891cdf4c00c0` |
  | `streams/gate-launch1.sanitised.jsonl` | `51dfc1d2e2fa73bc8212e6bd1283bcc1905426880cc05acdaeef66bab5c409ab` |
  | `streams/role-reader[0]-launch2.sanitised.jsonl` | `d44acde76623d9d3b35de00f5fd4bfce640294e81fd26958f8460f2ed3ae44a0` |

- **The package as run.** The P3 manifest is
  `d8c2ce88b0256cb288b605d1cca9af7a0e70a97746a528033ff17f34428af44b`
  (19 entries), and the `offline-checks/` manifest is
  `1b96ce2370633d21a95d10d6ca6f76ccbbd19e169966b85a8a4a727199341d2f`
  (87 entries). This session verified every entry after the run.
- **`model-output.json` exists.** Only a completed probe files one. It holds
  the 29 bytes `{"probe": "minimal-shape-ok"}`.

## Three kinds of evidence

Each fact below is in exactly one class. **A** is the operator's word. **B**
is the CLI's word about itself, which nothing here can check. **C** was
established without relying on either.

### A. The operator's steps

- **Source.** This session took no part in the readiness step. The items
  below are as the user gave them in the brief for this checkpoint, and
  nothing here checks them.
- **The pre-flight.** The operator ran the check-only pre-flight in
  Terminal.app, at 2026-10-17T18:41:18.459Z. It refused only
  `ReviewedEnvironmentMismatch` and exited 64. That is the one refusal the
  handover allows, because only `run-probe.sh` sets the two tokens.
- **D-6, asked again.** Asked to confirm the D-6 settings, the operator
  replied "proceed" without restating them.
  - **This checkpoint records that reply as an instruction to proceed, not as
    a confirmation.** No D-6 confirmation is on record for this probe. The
    first probe's confirmation was given for that probe.
  - The handover made restated confirmations a condition of running the
    launcher. This checkpoint has only the reply above to record.
- **The launch.** The operator then ran the handover's hash-bound launcher
  command once, in Terminal.app. It exited 0.
- **What nothing here checks.**
  - No code can check the account settings. Of the D-6 items, only managed
    settings has a check: A3, which reads the documented macOS location
    alone. It passed at run time (C2).
  - The CLI's overage fields (B) are consistent with extra usage being off.
    They prove none of D-6.
  - X3's `unobserved.extraUsage` calls extra usage being off "the
    user-confirmed precondition of D-6". That text is a constant filed on
    every `@2` and `@3` record (`SUBSCRIPTION_V2_UNOBSERVED`,
    `live-capture.ts:1464–1470`). For this probe it confirms nothing.

### B. CLI-reported facts

**The gate** (`auth status --json`). The gate stream is filed as twelve
unparsed lines by design; these are the gate's labels, from `execution.json`:

- `loggedIn` true, `authMethod` `"claude.ai"`, `apiProvider` `"firstParty"`,
  `subscriptionType` `"max"`, `analyticsDisabled` true;
- `apiKeySource` and `forcedLoginMethod` absent;
- the identifiers present and never reproduced;
- no `allowedProviders` key.

**The init event**, line 1 of the role stream:

- `permissionMode` `"default"`;
- `tools` `["StructuredOutput"]`, `mcp_servers` `[]`, `slash_commands` `[]`,
  `skills` `[]`;
- `model` `claude-opus-5-5`, `apiKeySource` `"none"`,
  `claude_code_version` `2.1.295`;
- `fast_mode_state` `"off"`, `fast_mode_disabled_reason` `"disabled_by_env"`;
- `analytics_disabled` and `product_feedback_disabled` true;
- `per_turn_effort_active` true;
- `output_style` and `view_mode` `"default"`;
- `plugins`: two entries, `cc-plugin-agents-md@builtin` and
  `cc-plugin-plugin-authoring@builtin`, each with path `builtin`;
- `agents` `["claude","Explore","general-purpose","Plan"]`;
- a `messaging_socket_path` under `/tmp/cc-socks/` and ten `capabilities`.

Apart from `permissionMode`, this matches the first checkpoint's list for X's
init.

**The stream** (16 lines):

- one `system/status` `"requesting"`;
- one model message, `msg_011Cg8JYv5Ko6qN7jK1AQV2n`, and the stream's one
  request ID, `req_011Cg8JYuRe7RrhGoHjZDfax`, on the assistant item;
- one `tool_use` block for `StructuredOutput`, whose five deltas concatenate
  to `{"probe": "minimal-shape-ok"}`; the assistant item and the result
  restate it as the object `{"probe":"minimal-shape-ok"}`;
- the tool result `"Structured output provided successfully"`, with
  `permission_decision` `{decision: "accept", source: "config"}`;
- `message_delta` stop reason `tool_use`, with no `safeguard_results` entry
  (X's carried one);
- one `rate_limit_event`;
- the result.

**The usage the CLI reported:**

- input 2, cache creation 1,181 (one-hour ephemeral), cache read 0;
- output 60, of which thinking 0 (under `output_tokens_details`);
- service tier and speed `standard`, `inference_geo` `"global"`,
  `fallback_credit` null;
- an interim output count of 24 on `message_start` and the assistant item.

**The `rate_limit_event`:**

- `status` `"allowed_warning"`, `rateLimitType` `"five_hour"`, `utilization`
  0.91, `surpassedThreshold` 0.9, `resetsAt` 1792268400
  (2026-10-17T20:20:00Z);
- `overageStatus` `"rejected"`, `overageDisabledReason`
  `"org_level_disabled"`, `isUsingOverage` false, `overageEnabled` false;
- `unifiedWindows`: five-hour utilisation 0.91, resetting 1792268400;
  seven-day 0.45, resetting 1792540800 (2026-10-21T00:00:00Z).

**The result:**

- `subtype` `"success"`, `is_error` false, `terminal_reason` `"completed"`,
  `stop_reason` `"tool_use"`, `num_turns` 2;
- `structured_output` `{"probe":"minimal-shape-ok"}`;
- `permission_denials` `[]`, `safety_stops` 0, every `subagent_stats`
  count 0;
- `fast_mode_state` `"off"`, `api_error_status` null;
- `total_cost_usd` 0.010656, with `costBasis: "list"`;
- `modelUsage`: one entry, `claude-opus-5-5`, provider `firstParty`, with
  `contextWindow` 1,000,000 and `maxOutputTokens` 128,000.

### C. Independently checked evidence

#### C1. Recorded by the probe's own code at run time

These are the process and binding facts the probe observed itself, not the
CLI's account:

- **Binding.** HEAD `0c59998`; the eight engine digests and the four package
  digests in `execution.json`; the pin's size, 239,695,888 bytes, and sha256,
  `494870c9…f8230bdf6`; Node `v24.19.0` (recorded, not compared).
- **A production launch.** `synthetic` is false, meaning no test-only
  dependency was injected (`probe-lib.ts:391–396`), and neither the pin nor
  the bounds were injected.
- **The mode, requested and observed.**
  - `requested.permissionMode` and `requested.invocation.permissionMode` are
    `"default"`.
  - The `permissionMode` block: requested `"default"`; observed from the one
    init event, at line 1, present, with value `"default"`;
    `matchesRequested` true.
- **The gate process.** pid 30482, exit 0, 123 ms, 382 stdout bytes and 0
  stderr bytes, streams closed.
- **The role process.** pid 30487, exit 0, no signal, 3,271 ms, 8,631 stdout
  bytes and 0 stderr bytes, streams closed, no termination needed.
  - The prompt file held 218 bytes and was removed; 71 stdin bytes.
  - The launch description was 672 bytes, against a bound of 4,096.
- **What the transport launched** (`launches.jsonl`).
  - The role argv is the first probe's, as its checkpoint lists it, with one
    addition: `--permission-mode default`, at `argv[13]` and `argv[14]`,
    after `--no-session-persistence` and before `--settings`. The flag occurs
    once.
  - The environment names, for the gate and the role alike: the thirteen
    launch controls, `HOME`, `PATH` and `USER`.
- **Counts.**
  - Runner attempts 1 of 1, with outcome `completed`, `possiblyBilled` true
    and usage source `cli_report`.
  - Launches started 1, gate launches 1, records written 1, unsent events 0,
    bounds breached none, interrupts none.
  - `cancelled` false; termination confirmed; output not withheld; no
    finalisation after a throw.
- **Output and error.** The output was accepted against
  `{"probe":"minimal-shape-ok"}`. `error` and `escapedError` are null.
- **Usage and holds.** `usageStop` `null`, from the committed `usageStopOf`
  over the observation. The three hold roots were read at 18:44:10.484Z,
  the start.
- **Times.** The gate's line in `launches.jsonl` at 18:44:10.707Z, the role's
  at 18:44:14.080Z; drained at 18:44:14.083Z.

#### C2. Checked by this session afterwards, offline

- **Manifests.**
  - X3's manifest hashes to `9e20975d…`, and its six entries verify. No file
    in X3 is unlisted but the manifest, and none is newer than it.
  - P3's manifests hash to `d8c2ce88…` (19 of 19 entries OK) and `1b96ce23…`
    (87 of 87). Every package file is listed in one of them, and none is
    newer than the top manifest, written at 18:36:00Z.
  - Neither directory holds a symbolic link.
  - **Controls.** Against a scratch copy of X3's manifest with one digest
    altered, `shasum -a 256 -c` reported that entry `FAILED`, exit 1. With
    one name removed from a scratch copy of the listed set, the listing
    comparison reported it. `find -newer` listed the files written after the
    gate stream.
- **The record against the commit.**
  - Each of the eight engine digests in `execution.json` equals the sha256 of
    `git show 0c59998:backend/engine/<file>`. **Control:** with one digest
    altered in a scratch copy, the comparison failed.
  - The four package digests equal P3's manifest entries, and the pin digest
    equals the handover's.
- **Candidate.** HEAD `0c59998`, on its branch, before and after this file
  was written, read with `git --no-optional-locks`. The status was only the
  two `node_modules` symlinks before, and those and this file after.
- **The mode, three ways.** The argv pair, the init line and the record's
  block agree. The key `"permissionMode"` occurs once in the role stream, on
  line 1.
- **The binding and stage A passed at run time.** The entry returns on any
  binding refusal before it loads the engine (`probe.ts:48–55`). `runProbe`
  returns on any stage-A refusal before it constructs or creates anything
  (`probe-lib.ts:790–791`), and stage B's claim comes after (`:953`). X3
  exists, so every binding and stage-A rule passed. They include the entry's
  `TERM_PROGRAM` check, `PermissionModeNotRequested`, A3, A6 for the new
  case, and A7 over the three hold roots.
- **The exit.** The filed status `completed` is the one the entry maps to
  exit 0 (P3's README, "Exit codes"), as the operator reported.
- **The later checks.** See "What ran, in order", below.
- **The output.** `model-output.json`'s 29 bytes equal the five deltas
  joined, which is what `projectResponseV2` returns. They parse equal to the
  expected object.
- **The rate-limit event, against the allowlist.**
  - The allowlist admits two statuses, `"allowed"` and `"allowed_warning"`
    (`claude-code-cli.ts:2156`, `:2253`).
  - It requires `overageStatus` `"rejected"` (`:2258–2259`) and
    `isUsingOverage` present and false (`:2255–2256`). It admits
    `overageEnabled` only absent or false (`:2263`).
  - The event meets each of these, and rule 1's overage facts
    (`:1669–1676`) find none in it.
- **No hold.** A `completed` record whose `usageStop` is `null` holds
  nothing.
  - The committed `assertNoResetPending` (`live-capture.ts:1668–1755`) holds
    a start only for a usable `usageStop.resetsAt` or an exhausted or
    overage fact. It refuses outright only a status other than `completed`
    or `failed`.
  - P3's restated walk (`probe-binding.ts:368–442`) has the same logic.
  - This is a reading of the code. No test ran here.
- **The gate stream.** Its twelve lines record only their byte counts. It is
  byte-identical to X's (`51dfc1d2…`, in the first checkpoint's table), so
  the two gate answers had the same line lengths.
- **The description's length.** 672 bytes is 27 more than X's 645: the
  length of `"permissionMode":"default",`. That is consistent with the key
  being the only addition, and does not prove it.
- **No personal strings.** `vivin` and `/Users/` occur in none of X3's six
  files; the same search finds six of each in P3's `HANDOVER.md`. The role
  stream's 33 `[REDACTED]` values are under `session_id` (16), `uuid` (16)
  and `cwd` (1).
- **The CLI's socket.** `/tmp/cc-socks/30487.sock` was absent after the run.
- **The shared root,** listed by name only; X's files were not read.
  - 21 entries, the root included: 13 files, 8 directories, no symbolic
    link.
  - Two execution directories, each with an `execution.json`: X and X3.
  - X3's case holds 10 entries. The 11 outside it match the count P3's
    inputs log recorded before the run.
  - Nothing under the root is newer than X3's manifest, as of 19:05Z.

## What ran, in order

`@3`'s projection is `@2`'s own `projectResponseV2`
(`claude-code-cli.ts:2461–2468`). It runs in order, throws at the first
refusal, and returns only after `checkOutput` (`:2365–2381`):

| Step | Here |
|---|---|
| `classify` (D-7: overage, exhaustion, credits, long context, substitution, refusal, truncation, fast mode, other kind) | passed |
| exit and signal | passed |
| first malformed line | none |
| `walkStreamV2` (every event, subtype, block, item and delta known) | passed |
| `checkLaunchContextV2` | passed: `permissionMode "default"` |
| `checkResultV2` | passed |
| `checkUsageObservedV2` (the rate-limit allowlist) | passed: `"allowed_warning"` |
| `checkModelUsageV2` | passed |
| `theStructuredOutputBlock` | passed: one `StructuredOutput` call |
| `checkStopReasonsV2` | passed |
| `checkToolLoop` | passed |
| `checkResultRestatementV2` | passed |
| `checkOutput` | passed: the joined deltas returned |

- **How this is known.** X3 files `error` null and the output accepted, and
  the filed output is the value `projectResponseV2` returns. A refusal at any
  step would have thrown before that return.
- **The probe's own stage E then passed:**
  - termination confirmed;
  - one gate and one role launch;
  - no launch over 1 MiB (`boundsBreached` `[]`);
  - no fact against included usage (`usageStop` `null`);
  - the canonical comparison with `{"probe":"minimal-shape-ok"}`.
- **The first real stream these steps judged.** The first probe stopped at
  `checkLaunchContextV2`, and the repair examined the later steps only
  counterfactually. One real stream accepted shows that they accept it, not
  that they refuse bad ones. The repair's tests and teeth cover refusal.

## Retries and spend

- One runner attempt, one role process and one gate process were recorded.
  No runner retry or relaunch occurred.
- **HTTP attempts are unobserved.** One request ID and one model message were
  observed. The HTTP attempts inside the CLI are not (`httpAttempts: null`).
  `num_turns` 2 is the CLI's own count and does not show a second request.
- **Billing is not proven.** The ledger counts one possibly billed attempt.
  The CLI's `total_cost_usd`, 0.010656, is a list-price estimate, not a
  charge.
- **Usage refusals come after the launch.** The probe decides them only once
  a launch has ended. Here no usage fact arose.

## Observed metadata, and what it does not show

- **Plugins and agents,** recorded and not judged (R-3).
  - The init lists two built-in plugins and four agents under `--safe-mode`,
    as X's did.
  - Listing is not execution:
    - the tool list was exactly `StructuredOutput`, so no agent tool existed
      to spawn one;
    - every `subagent_stats` count is 0;
    - the stream carries no hook or plugin event.
  - Whether a built-in plugin contributed text to the request is
    **unobserved**. The reported usage adds up to 1,183 context tokens for a
    218-byte system prompt, a 71-byte message and a 136-byte schema.
- **Model limits.** `contextWindow` 1,000,000 and `maxOutputTokens` 128,000
  are the CLI's description of the model, not the request's ceiling.
  `CLAUDE_CODE_MAX_OUTPUT_TOKENS` was 64,000, and the wire-level `max_tokens`
  is unobserved.
- **Effort.** `--effort high` was passed, and the init says
  `per_turn_effort_active` true. The CLI reported 0 thinking tokens. Whether
  the effort was applied is **unobserved**.
- **The record's thinking count is null.** `cliObserved.thinkingTokens` reads
  `result.usage.thinking_tokens` (`live-capture.ts:997`). 2.1.295 reports
  thinking under `output_tokens_details`, so the null means the key was
  absent, not that thinking was zero.
- **The mode's effect.** `"default"` is the init's report (B). The one tool
  call was accepted by configuration, as X's was under `"auto"`. This stream
  therefore shows no behaviour that differs between the two reported modes.
  That 2.1.295 applies the flag beyond reporting it rests on S's static
  reading.

## What one launch settled

For this launch, at this time:

- **The question this package added.** With `--permission-mode default`
  passed, 2.1.295's init event reported `"default"`, and the strict init
  check accepted it.
- **The later checks** and the probe's stage E accepted a real stream.
- **None of the handover's fail-closed runtime unknowns occurred** (its
  blocker 4). The init reported `"default"`, the expired embedded catalog did
  not stop the model, a `StructuredOutput` call arrived, the walk knew every
  subtype and field, and the one `rate_limit_event` fell inside the
  allowlist.
- **The gate** answered as for X: `@2`'s allowlisted keys, no
  `allowedProviders`, and `analyticsDisabled` true.
- **The model.** `claude-opus-5-5` was accepted again, after the embedded
  catalog's expiry. Where the catalog came from stays unknown.
- **The controls, as the stream shows them.** Fast mode was off
  (`disabled_by_env`), speed standard, and no model other than the requested
  one appeared in any of the five places the stream names a model. The tools
  and MCP restriction held.
- **Structured output** arrived as one `StructuredOutput` tool call under
  `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS=1`.
- **New: an `"allowed_warning"` event carrying `overageEnabled` false.** X's
  event, as the first checkpoint lists it, was `"allowed"` and carried no
  `overageEnabled`. The spend controls' static reading says 2.1.295 reports
  that field on some `allowed_warning` events only
  (`claude-code-cli.ts:1662–1665`). The allowlist admitted it.

## Carried forward

- **Settled for this launch,** from the repair plan's carried-forward list:
  - the unreached checks on a real stream, which ran and passed;
  - whether the explicit flag takes effect, as far as the init reports it:
    it reported `"default"`. Its effect on behaviour stays unobserved.
- **Still unobserved:**
  - billing;
  - HTTP attempts inside the CLI;
  - whether `--effort high` was applied;
  - why `@2`'s launch reported `"auto"` with no flag supplied. This probe
    passed the flag, so it did not exercise that path;
  - the plan's other carried-forward items
    (`docs/superpowers/plans/2026-10-17-opus55-permission-mode-repair.md`,
    "Unknowns this plan does not touch"):
    - where the catalog came from;
    - whether `--setting-sources ''` excludes `~/.claude`;
    - native structured output;
    - refusal retry and exhaustion;
    - long-context, nine-launch and variance behaviour;
    - the wire-level `max_tokens`;
    - whether `-p` honours every `--settings` key;
    - what the built-in plugins add to a request.
- **The package's residuals,** unchanged: tsx, zod and Node are not
  digest-bound, and the main checkout's in-repository root is not read.

## What it means next

- **The five-hour window was 91% used.**
  - At 18:44Z the CLI reported the five-hour window at 0.91, past its 0.9
    warning threshold, resetting at 20:20:00Z. It reported the seven-day
    window at 0.45, resetting at 2026-10-21T00:00:00Z.
  - The first checkpoint records 0.01 and 0.32 for X, at 15:32Z, with the
    same five-hour reset. Between the two reports the five-hour utilisation
    rose by 0.90. Neither stream shows what used it; each probe reported
    about 1,240 tokens of its own.
  - By the 18:44Z report, a live step started before 20:20Z would have at
    most 9% of the window left, and less if it has been used since.
  - Should a launch meet an exhausted window, the committed rules refuse it
    only after it has run, so it can have spent. They then file a stop that
    holds every later start reading the shared root until the reported
    reset, or until an operator reviews it if no usable reset was reported.
  - So a readiness step should read the window afresh. The 18:44Z figure
    goes stale at the reset.
- **The shared root holds two records, in 21 entries.**
  - X (`@2`, `failed`, `usageStop` null) and X3 (`@3`, `completed`,
    `usageStop` null).
  - Neither holds a later start: X by P3's D26 and the repair's V3-U2b, X3
    by the committed check's code (C2).
  - A check that counts the root must now expect 21 entries and two cases.
    P3's inputs log recorded 11 and one.
- **`claude-code-cli@3` has one execution on file:** this one, run at
  `0c59998`.
- **Committing this file moves the candidate past `0c59998`.** P3 refuses any
  HEAD but `0c59998` and any status line but the two symlinks, so this file
  already breaks its binding. P3 is spent either way. A later package binds
  to the new HEAD.

## Decisions recorded

1. **Probe first, checkpoint after,** as with the first probe. P3's handover
   placed this checkpoint after the run, since adding any file to the
   candidate breaks P3's binding.
2. **The D-6 reply is recorded as "proceed", not as a confirmation** (the
   user, 2026-10-18, in the brief for this checkpoint).
3. **No relaunch of P3.** A6 also enforces it.
4. **Nothing further live is authorised** (the user, in the same brief).

## Handed forward

- **The next decision is the user's.** Nothing further live is authorised.
- **The shared hold root,**
  `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions`,
  stays the execution root, or a hold root, for every later subscription
  execution: any probe, rehearsal or S-002.
- **A future live run needs all of these,** as before:
  - a new reviewed package with a new case ID, bound to the candidate's HEAD
    at that time;
  - the same hold root;
  - a fresh readiness step: the operator's Terminal.app pre-flight, and the
    D-6 confirmations, stated;
  - a separate explicit approval.

  Given the 91% window, the readiness step should also read the usage window
  afresh.
- **The harness's thinking count** reads a key 2.1.295 does not write (above).
  Whether to change it is open.
- **Open decisions, unchanged** (the repair checkpoint): `--settings` as an
  identity input; `disableAutoMode` in `--settings`, beside the flag and
  never instead of the check.

## Process notes

- **Who.** A later session wrote this file. It took no part in preparing P3
  or in the readiness step, and it took the operator's steps from the user's
  brief.
- **Write locations.** In the candidate, only this file. Outside the
  repository: its logs and one script in its own scratchpad, and its memory
  notes. Nothing in pilot-evidence was written.
- **Reads.**
  - X3, in full;
  - P3's manifests, `README.md`, `HANDOVER.md` and inputs log, and the entry,
    stage-A and hold-walk code in `probe.ts`, `probe-lib.ts` and
    `probe-binding.ts`;
  - the committed candidate's code and docs;
  - the shared root, by name.

  P, X, S and R were not read.
- **What ran.** Hashing, listing, `git --no-optional-locks` queries, and one
  Python script (`python3 -I`, standard library only) that read X3 and P3's
  `HANDOVER.md`. No Claude Code, `ollama` or Node binary ran, and no test,
  network or subagent was used.
- **b1b-record.** This session ran no command in it. The session's harness,
  at start, loaded its `CLAUDE.md` and attached a status snapshot of it.
- **A mislabelled log, superseded.** One verification log printed `stat`
  times in local time (+0530) under a `Z` label. A later log re-recorded them
  in UTC, and every time here is UTC.
- **Logs.** Each has a unique UTC-timestamped name in the session's
  scratchpad. They are working notes, not filed evidence, and every check
  above can be re-run from its description.
