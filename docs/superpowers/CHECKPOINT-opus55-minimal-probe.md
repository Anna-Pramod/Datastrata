# Checkpoint — the one `claude-code-cli@2` synthetic probe, refused on its launch context, on `2eef70d`

Written 2026-10-17 by the parent session, after the run, in the candidate
worktree `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD
`2eef70d5802e7f82b8fe41a7435c181a36431f5e`).

- **Scope of this change.** This file and the repair plan it points to are
  the only additions to the candidate. No code changed. Nothing is
  committed: the user runs every `git add` and `git commit`.
- **Where the evidence is.**
  - **P**: the probe package
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-17-opus55-minimal-probe-prep/`
    (`README.md`, `HANDOVER.md`).
  - **X**: the execution
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/synthetic-probe/opus55-minimal-shape/20261017T153205Z-1c89aa/`.
  - **S**: the parent's post-probe static reading,
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-17-opus55-post-probe/`.
- **Unchanged.** Neither P nor X was written after the run. Their hashes
  are below.
- **Nothing further ran live.** After the one launch there was no relaunch,
  rehearsal, S-002 run, promotion or signing. No Claude Code or `ollama`
  binary was executed by the parent, and no test ran in this phase.

## The outcome

- **The run.** The operator ran the reviewed, hash-bound launcher once, in
  Terminal.app, at 2026-10-17T15:32:05Z. Running it was the approval, as
  presented.
- **The gate passed.**
- **The role launch completed.** One `reader[0]` launch of `claude-opus-5-5`
  at effort `high` ran to completion. It answered with exactly
  `{"probe":"minimal-shape-ok"}`, through one `StructuredOutput` call.
- **The projection refused it.** `@2`'s projection refused the launch at its
  launch-context check: the CLI's init event reported `permissionMode "auto"`,
  and `@2` accepts only `"default"`.
- **Filed result.**
  - Status `failed`, error `CliLaunchContextError`, exit 1.
  - `usageStop` is `null`, so there is no reset hold.
- **The package is spent.** Its single-use rule (A6, the case directory
  exists) refuses any second start.

```text
error: CliLaunchContextError: reader[0]: the CLI's init event describes a launch this adapter did not request — permissionMode "auto" (must be "default") (init at line 1)
```

## The execution, bound by hash

- `MANIFEST.sha256`: `fc1c2e674079239e5bc20291346ed7fcbbd9f5276d36180037da4fe94dd3a0eb`.
  It covers five files, all verified by the parent with
  `shasum -a 256 -c`. No file is unlisted but the manifest itself.

  | File | sha256 |
  |---|---|
  | `execution.json` | `59bffed85597a2a0f2ced89fec1afafb630af97b29c59514ebc4dde375e8e041` |
  | `attempts.jsonl` | `c7117ccc350e4cf31f5c37c52049d0591d6a3a44ad37f5041d2181f59f734e56` |
  | `launches.jsonl` | `e2e78ccfd1a05fd573e0016c108d2e67c32a09bc5df10267b85dcbc84b7b8369` |
  | `streams/gate-launch1.sanitised.jsonl` | `51dfc1d2e2fa73bc8212e6bd1283bcc1905426880cc05acdaeef66bab5c409ab` |
  | `streams/role-reader[0]-launch2.sanitised.jsonl` | `a3a7a577e45a5b31edd5dc5d7f7afa7c1bf5f6e51bdc5c2626746491031cf195` |

- **The package as run.** The P manifest is
  `f6bc53aaeb84ea5ccca74a972b25395d59092f09e28514a69cb7e3a2f9ec2aec`
  (19 entries) and the `offline-checks/` manifest is
  `cbff1a01bdccdbb617ffaf2adb216411d6fd92596720cfea94a325010e47ee83`
  (134 entries). All entries verified before the readiness step and again
  after the run.
- **No `model-output.json`.** Only a completed probe files one.

## Three kinds of evidence

Each fact below is in exactly one class. **A** is the operator's word.
**B** is the CLI's word about itself, which nothing here can check. **C** was
established without relying on either.

### A. Operator confirmations

- **D-6 preconditions.** The operator stated them in a chat message in the
  parent's session on 2026-10-17. It was sent after the message carrying the
  pre-flight's output (stage A at 15:25:51.836Z), and before the message
  carrying the launch's output (the execution started at 15:32:05Z). Its exact
  text, as it appears in that session:
  > I confirm, having checked my account settings: extra usage is off;
  > auto-reload is off; no usage credits are enabled; no reset card or early
  > reset is enabled or has been used, and none will be used; and no
  > managed-settings file or other policy source applies to this Mac or
  > account.
- **Where that wording came from.** The text is identical to a reply option
  the parent had drafted in that session's next-step box, and the operator
  chose to send it. **The wording is the parent's; the confirmation is the
  operator's.**
- **Not verified.** The parent did not see the account settings. Nothing here
  checks them.
- **What the operator pasted from Terminal.app.**
  - The pre-flight's output:
    - binding: one refusal, `ReviewedEnvironmentMismatch`, the two tokens
      unset;
    - code binding passed;
    - stage A: 0 refusals over its ten rules, three hold roots read;
    - exit 64.
  - `USER=vivin`, `HOME=/Users/vivin`.
  - The launcher's summary lines, then `exit 1`.
- **What nothing here checks.** No code can check the account settings. The
  CLI-reported `overageDisabledReason: "org_level_disabled"` (B) is
  consistent with them and proves none of them.

### B. CLI-reported facts

**The gate** (`auth status --json`). The gate stream is filed as twelve
unparsed lines by design; these are the gate's labels, from `execution.json`:

- `loggedIn` true, `authMethod` `"claude.ai"`, `apiProvider` `"firstParty"`,
  `subscriptionType` `"max"`, `analyticsDisabled` true;
- `apiKeySource` and `forcedLoginMethod` absent;
- the identifiers present and never reproduced;
- no `allowedProviders` key.

**The init event**, line 1 of the role stream:

- `permissionMode` `"auto"`;
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
- a `messaging_socket_path` under `/tmp/cc-socks/` and a `capabilities` list.

**The stream** (16 lines):

- one `system/status` `"requesting"`;
- one model message (`msg_011Cg83uVqtirTVBSgbMfrxn`, request
  `req_011Cg83uV6zc72VHumac3wcQ`);
- one `tool_use` block for `StructuredOutput`, whose deltas concatenate to
  `{"probe": "minimal-shape-ok"}`, restated by the assistant item as
  `{"probe":"minimal-shape-ok"}`;
- the tool result `"Structured output provided successfully"`, with
  `permission_decision` `{decision: "accept", source: "config"}`;
- `message_delta` stop reason `tool_use`, carrying a `safeguard_results`
  entry `dangerous_tool_use` / `available`, whose meaning is not
  established;
- one `rate_limit_event`;
- the result.

**The usage the CLI reported:**

- input 2, cache creation 1,182 (one-hour ephemeral), cache read 0;
- output 60, of which thinking 0;
- service tier and speed `standard`, `fallback_credit` null.

**The `rate_limit_event`:**

- `status` `"allowed"`, `rateLimitType` `"five_hour"`, `resetsAt`
  1792268400 (2026-10-17T20:20:00Z);
- `overageStatus` `"rejected"`, `overageDisabledReason`
  `"org_level_disabled"`, `isUsingOverage` false;
- `unifiedWindows`: five-hour utilisation 0.01, seven-day 0.32 resetting
  1792540800 (2026-10-21T00:00:00Z).

**The result:**

- `subtype` `"success"`, `is_error` false, `terminal_reason` `"completed"`,
  `stop_reason` `"tool_use"`, `num_turns` 2;
- `structured_output` `{"probe":"minimal-shape-ok"}`;
- `permission_denials` `[]`, `safety_stops` 0, every `subagent_stats`
  count 0;
- `fast_mode_state` `"off"`, `api_error_status` null;
- `total_cost_usd` 0.010664 with `costBasis: "list"`;
- `modelUsage`: one entry, `claude-opus-5-5`, with `contextWindow`
  1,000,000 and `maxOutputTokens` 128,000.

### C. Independently checked evidence

#### C1. Recorded by the probe's own code at run time

These are the process and binding facts the probe observed itself, not the
CLI's account:

- **Binding.** HEAD `2eef70d`; the eight engine digests and the four package
  digests in `execution.json`; the pin's size and sha256, matching
  `494870c9…f8230bdf6`; Node `v24.19.0` (recorded, not compared).
- **The gate process.** pid 93338, exit 0, 1,718 ms, 382 stdout bytes and 0
  stderr bytes, streams closed.
- **The role process.** pid 93343, exit 0, no signal, 3,239 ms, 8,674 stdout
  bytes and 0 stderr bytes, streams closed, no termination needed.
  - The prompt file held 218 bytes and was removed; 71 stdin bytes.
  - The launch description was 645 bytes, against a bound of 4,096.
- **What the transport launched** (`launches.jsonl`).
  - The role argv: `-p`, `--model claude-opus-5-5`, `--effort high`,
    `--safe-mode`, `--tools ''`, `--strict-mcp-config`,
    `--setting-sources ''`, `--disable-slash-commands`,
    `--no-session-persistence`, the `@2` `--settings` text,
    `--system-prompt-file`, the probe's `--json-schema`,
    `--output-format stream-json`, `--verbose` and
    `--include-partial-messages`. **No `--permission-mode`.**
  - The environment names: the thirteen launch controls, `HOME`, `PATH` and
    `USER`.
- **Counts.**
  - Runner attempts 1 of 1, with outcome `projection_refused` and
    `possiblyBilled` true.
  - Launches started 1, gate launches 1, records written 1, bounds breached
    none, interrupts none.
  - `cancelled` true with `cancellationReason` `role_failed:reader[0]`, the
    lifetime ended by the role's failure and not by an operator.
- **Usage and holds.** `usageStop` `null`, from the committed `usageStopOf`
  over the observation. The three hold roots were read at 15:32:05.691Z.

#### C2. Checked by the parent afterwards, offline

- **Manifests.** X's manifest holds and has no unlisted file. P's manifest
  is unchanged, with no package file newer than it.
- **Candidate.** HEAD `2eef70d` before the readiness step, after the
  pre-flight and after the run. Its status was only the two `node_modules`
  symlinks, read with `git --no-optional-locks`.
- **The filing root.** `pilot-evidence/subscription-executions` did not
  exist before the run, by the parent's check and by the pre-flight's A6.
  The run created only `synthetic-probe/opus55-minimal-shape/20261017T153205Z-1c89aa/`
  under it.
- **The refusal, against the committed code.**
  - `checkLaunchContextV2` (`claude-code-cli.ts:1996–2013`) collects every
    problem before it throws. The message names one, so the init's other
    five checked fields passed: `apiKeySource`, `tools`, `mcp_servers`,
    `claude_code_version` and `fast_mode_state`.
- **No hold.** A `failed` record whose `usageStop` is `null` holds nothing.
  This is the restated check's reading (P's `probe-binding.ts:389–425`),
  proved equal to the committed `assertNoResetPending` by P's differential
  test. The record stays readable by that check.
- **Local settings, read for permission keys only.**
  - `~/.claude/settings.json` holds only `effortLevel`, `theme` and
    `skipWorkflowUsageWarning`.
  - There is no `~/.claude/settings.local.json`, and no
    `.claude/settings.json` in P or its two parent directories.
- **`~/.claude.json`**, the global state file and not a settings source, was
  read for feature keys only.
  - Its mtime was 20:58:49 +0530 when checked after the run, earlier than
    the 21:02 launch. So no modification by the run was observed. That is not
    proof that the probe's CLI never wrote the file.
  - Its mtime later read 21:23:15 +0530, with no probe running. The writer
    is unknown, and so are the feature values the launch read.
  - S's summary (finding 5) words this more strongly: it says the file is
    "written by processes other than the probe" and guesses the writer. S is
    frozen and was not edited. This checkpoint's wording governs.
- **The CLI's socket.** `/tmp/cc-socks/93343.sock` was absent after the run.
- **Static reading of the pinned 2.1.295** (S; read and hashed, never
  executed). This is summarised under the repair below and in
  `static-permission-mode-summary.20261017T155921Z.md`. The S manifest is
  `a35f198ec130388d3b52895b1c9f1db54c9dbb3e21fe597131972280f0f6dbe6`
  (eight files). It was written after the summary's own recorded
  correction, before this checkpoint cited it.

## What was refused, and what was never reached

`projectResponseV2` (`claude-code-cli.ts:2286–2302`) runs in order and stops
at the first refusal:

| Step | Here |
|---|---|
| `classify` (D-7: overage, exhaustion, credits, long context, substitution, refusal, truncation, fast mode, other kind) | passed |
| exit and signal | passed |
| first malformed line | none |
| `walkStreamV2` (every event, subtype, block, item and delta known) | passed |
| `checkLaunchContextV2` | **refused: `permissionMode "auto"`** |
| `checkResultV2` | not reached |
| `checkUsageObservedV2` (the rate-limit allowlist) | not reached |
| `checkModelUsageV2` | not reached |
| `theStructuredOutputBlock` | not reached |
| `checkStopReasonsV2` | not reached |
| `checkToolLoop` | not reached |
| `checkResultRestatementV2` | not reached |
| `checkOutput` | not reached |

- **The probe's own stage E.** Its refusal checks run only while no error is
  set, so none ran:
  - `TerminationUnconfirmed`, `LaunchBoundExceeded`, `OutputBoundExceeded`;
  - `IncludedUsageUnconfirmed`;
  - the canonical comparison with `{"probe":"minimal-shape-ok"}`.
- **Stage E's inputs were recorded:** termination confirmed, one gate and
  one role launch, `boundsBreached` `[]`, and `usageStop` `null` (always
  filed).
- **No claim about the unreached checks.** By reading, the stream looks
  compatible with them. No committed code judged it, so nothing here says
  they pass. The repair plan examines them with a counterfactual replay,
  which can only ever be counterfactual evidence.

## Retries and spend

- One runner attempt, one role process and one gate process were recorded.
  No runner retry or relaunch occurred. Internal HTTP attempts remain
  unobserved.
- **HTTP attempts are unobserved.** One request ID and one model message
  were observed. The HTTP attempts inside the CLI are not
  (`httpAttempts: null`). `num_turns` 2 is the CLI's own count and does not
  show a second request.
- **Billing is not proven.** The ledger counts one possibly billed attempt.
  The CLI's `total_cost_usd` is a list-price estimate, not a charge.
- **Usage refusals come after the launch.** The probe decides them only once
  a launch has ended. Here no usage fact arose.

## Observed metadata, and what it does not show

- **Plugins and agents.**
  - The init lists two built-in plugins and four agents under `--safe-mode`.
  - Listing is not execution:
    - the tool list was exactly `StructuredOutput`, so no agent tool existed
      to spawn one;
    - every `subagent_stats` count is 0;
    - the stream carries no hook or plugin event.
  - Whether a built-in plugin contributed text to the request is
    **unobserved**. The CLI reported 1,184 context tokens for a 218-byte
    system prompt, a 71-byte message and a 136-byte schema. What the rest
    consists of is not shown.
  - `@2`'s init check reads neither field. By R-3 (the user, 2026-10-17),
    both are recorded as metadata, and no allowlist is added for them.
- **Model limits.**
  - The model-usage entry's `contextWindow` (1,000,000) and
    `maxOutputTokens` (128,000) are the CLI's description of the model.
  - They are not the request's ceiling. `CLAUDE_CODE_MAX_OUTPUT_TOKENS` was
    64,000, and the wire-level `max_tokens` is unobserved.
  - They are not evidence of a long-context request. The reported context was
    1,184 tokens, with no `[1m]` model and no context-1M beta at init.
- **Effort.** `--effort high` was passed and the init says
  `per_turn_effort_active` true. The CLI reported 0 thinking tokens for this
  prompt. Whether the effort was applied is **unobserved**.

## What one launch settled

For this launch, at this time:

- **The gate.** 2.1.295's gate answer carries `@2`'s allowlisted keys and no
  `allowedProviders`, and `analyticsDisabled` is `true`. The handover's
  blocker 3 did not occur.
- **The model.** `claude-opus-5-5` was accepted on 2026-10-17, after the
  embedded catalog's expiry. Where the catalog came from stays unknown.
- **The controls, as the stream shows them.** Fast mode was off
  (`disabled_by_env`), speed standard, and no model other than the requested
  one appeared in any of the five places the stream names a model. The tools
  and MCP restriction held.
- **Structured output** arrived as one `StructuredOutput` tool call under
  `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS=1`, on the tool path only.
- **One rate-limit event** arrived, in the shape listed under B, which `@2`'s
  allowlist did not get to judge.
- **The walk** knows every system subtype and event the stream carried
  (`init`, `status`).
- **New: with no permission flag supplied, the init event reported
  `permissionMode "auto"`.** Why the build selected it is unknown.

## Where `"auto"` came from: not established

- **What was supplied.**
  - No permission flag was supplied.
  - None of the inputs checked here names a mode: the argv carried
    `--setting-sources ''`; the `--settings` text has no `permissions`; the
    local settings have no permission key (C2).
  - The inputs not visible here, such as the feature values the build read
    and its built-in defaults, were not observed.
- **What the static reading of 2.1.295 shows** (S):
  - an explicit `--permission-mode` is resolved before a fallback;
  - that fallback runs only when none of the resolver's inputs supplies a
    mode, and can pick `auto` from feature values whose built-in defaults
    favour it. This is a reading of the code, not an explanation of this run.
- **What it does not show:** which values the launch read. At 21:23 the
  cached `tengu_moss_anchor` was `false`. By the same reading that would give
  `default` for a non-interactive launch, unless a condition that was not
  read held. **The origin stays unknown**, and the repair does not depend on
  it.

## Carried forward, unknown

- HTTP attempts inside the CLI.
- Billing.
- Whether `--effort high` was applied.
- The auto-mode origin.
- Every check `projectResponseV2` did not reach, and the probe's stage E
  comparison.
- Where the catalog came from.
- Whether `--setting-sources ''` excludes `~/.claude`.
- Native structured output.
- Refusal-retry behaviour and exhaustion handling.
- Long-context, nine-launch and variance behaviour.
- The wire-level `max_tokens`.
- Whether `-p` honours every `--settings` key.
- What the built-in plugins add to a request.
- The package's residuals: tsx, zod and Node are not digest-bound, and the
  main checkout's in-repository root is not read.

## Decisions recorded

1. **Probe first, checkpoint after** (the user, 2026-10-17). The candidate and
   package stayed frozen until the run.
2. **No relaunch of this package** (the user's scope). A6 also enforces it.
3. **The repair's direction** (the user, 2026-10-17):
   - request `--permission-mode default` explicitly;
   - keep the strict init check;
   - never accept `auto`;
   - do not change account settings to hide the mismatch.

   The bounded, offline plan is
   `docs/superpowers/plans/2026-10-17-opus55-permission-mode-repair.md`.
4. **The plan's decisions** (the user, 2026-10-17):
   - **R-1(b): a new adapter version, `claude-code-cli@3`.**
     - `@1`'s and `@2`'s behaviour, launch descriptions, argv and identities
       are preserved.
     - `@3` requests `--permission-mode default` and keeps the strict,
       default-only init check.
     - `permissionMode` is part of `@3`'s invocation identity and of its
       mismatch enforcement.
   - **R-2:** the mode accepted anywhere is exactly `"default"`.
   - **R-3:** plugin and agent metadata are recorded, without a speculative
     allowlist.
   - **R-4:** the original stream stays only in X, as frozen external
     evidence. The repository gets a documented derivative fixture:
     incidental identifiers and account-usage metadata are normalised, and
     everything needed to reproduce the refusal and the downstream checks is
     retained.
   - **R-5:** no subagents throughout the repair. The parent performs the
     focused work.

## Handed forward

- **The shared hold root.** Every later subscription execution (any probe,
  rehearsal or S-002) runs with
  `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions`
  as its execution root, or reads it as a hold root. The committed
  agents-test default `test/live-executions` does neither.
- **A future probe needs all of these:**
  - a new reviewed package with a new case ID, bound to the final candidate;
  - the same hold root;
  - a fresh readiness step, its account confirmations included;
  - a separate explicit approval.
- **`claude-code-cli@2` has one execution on file**, this probe, run at
  `2eef70d` without the flag.
  - By R-1(b) the repair is a new version, `@3`, and `@2` stays
    byte-identical. So this record keeps naming code that exists unchanged.
  - A future probe of `@3` would be the first `@3` execution.

## Process notes

- **Write locations.** The parent created S and wrote only there. In the
  candidate it wrote only this file and the plan. Outside the repository it
  wrote its own memory notes.
- **Reads.** The probe's evidence, P, the local settings and
  `~/.claude.json` were read. Settings and `~/.claude.json` were read for
  permission and feature keys only.
- **One static search was stopped.** It was a context regex over the
  executable and ran past 300 s. Its log is kept and marked incomplete. The
  offset-based logs supersede it.
- **Nothing else ran.** No subagents, no tests, no Node run and no network.
- **Revised before any commit** (2026-10-17), after the user's review. Three
  changes were made:
  - The account confirmation was first called "verbatim" without saying the
    wording was drafted by the parent and sent by the operator. It now cites
    its source exactly, and states that nothing verifies the settings.
  - Two sentences first read as if the absence of a flag caused `auto`. They
    now state only what was observed.
  - The plan's decisions were recorded.
- **Corrected again before any commit**, at the user's request:
  - the retry statement now says only what was recorded;
  - the `~/.claude.json` timestamp is now read as "no modification
    observed", not as proof;
  - its writer is left unknown.
