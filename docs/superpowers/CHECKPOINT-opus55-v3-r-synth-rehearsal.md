# Checkpoint — the one `claude-code-cli@3` R-SYNTH three-role rehearsal, completed and accepted, on `bdda33f`

Written on 2026-10-18 (+0530), 2026-10-17 UTC, by a later session, after the
run, in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD
`bdda33f7ae1099faced3180eb0e4c0a016b484b4`). Every time below is UTC.

- **Scope of this change.** This file is the only addition to the candidate.
  No code changed. Nothing is committed: the user runs every `git add` and
  `git commit`.
- **Where the evidence is.**
  - **PR**: the rehearsal package
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-18-opus55-v3-r-synth-rehearsal-prep/`
    (`README.md`, `HANDOVER.md`).
  - **XR**: the execution
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/synthetic-rehearsal/opus55-v3-r-synth-three-role/20261017T214001Z-84c359/`.
    Its label calls it R-SYNTH rehearsal evidence with synthetic inputs, "not
    a verification recording, not an S-002 capture, and not an input to
    promotion".
  - **Cited, not read here:** the records in the table below.
- **Unchanged.** Neither PR nor XR was written after the run. Their hashes
  are below.
- **Nothing further is on file.** The shared root holds X, X3 and XR, and
  nothing under it is newer than XR's manifest (checked at 21:49Z). Nothing
  further live is authorised.
- **Offline.** This session executed no Claude Code, `ollama` or Node binary,
  ran no test, and used no network and no subagent.

| Cited | `MANIFEST.sha256` | Recorded in |
|---|---|---|
| P, the first (`@2`) probe package | `f6bc53aaeb84ea5ccca74a972b25395d59092f09e28514a69cb7e3a2f9ec2aec` | the first checkpoint |
| X, its execution | `fc1c2e674079239e5bc20291346ed7fcbbd9f5276d36180037da4fe94dd3a0eb` | the first checkpoint |
| P3, the `@3` probe package | `d8c2ce88b0256cb288b605d1cca9af7a0e70a97746a528033ff17f34428af44b` | the probe checkpoint |
| X3, its execution | `9e20975d2247e5966fa2b56e54e6fec6e793f948626f04571c55727f1a53b431` | the probe checkpoint |
| R-SYNTH's frozen driver | `9ddeb1d6a8ab635fbe1b0b8f92e76c3ba4a7a711f1e7aadf6599c8e148e8b77a` | PR's `HANDOVER.md` |
| R-SYNTH's accepted run | `cecdeedf4d38e299cb841a76ae30951df638efa67100ff2a99bb625d51d1ba0d` | PR's `HANDOVER.md` |

"The first checkpoint" is `CHECKPOINT-opus55-minimal-probe.md`, and "the
probe checkpoint" is `CHECKPOINT-opus55-v3-probe.md`. PR's
`offline-checks/inputs-final.20261017T212908Z.log` records all of these as
matching, every entry OK, ten minutes before the run. This session did not
read them again; it read X's and X3's `execution.json` for their `status` and
`usageStop` fields only, and X3's stream for its subtypes only.

## The outcome

The letter after each item names its class of evidence, defined below.

- **The run.** After a pre-flight, the operator ran the hash-bound launcher
  once, in Terminal.app, and it completed with verdict `accepted` (A). The
  execution ran from 21:40:01.368Z to 21:41:17.743Z (C1).
- **The gate passed** (C1).
- **The three role launches completed, in order.** `reader[0]`,
  `prosecutor[0]` and `adjudicator[0]`, each one launch of `claude-opus-5-5`
  at effort `high`, ran to completion (C1). Each answered through one
  `StructuredOutput` call under the committed role schema (B).
- **The mode.** `--permission-mode default` was requested on every launch
  and passed (C1). Each init event, at line 1 of its stream, reported
  `permissionMode "default"` (B). The committed init check accepted each
  (C2).
- **The committed later checks passed on three real streams in one run**
  (C2). R-SYNTH's checks accepted all three roles, every check `ok` (C1).
  The outputs were accepted and filed (C1).
- **Filed result.** Status `completed`, verdict `accepted`, `error` null
  (C1). `usageStop` is `null` (C1), so there is no reset hold (C2). No bound
  was breached (C1).
- **The package is spent.** Its single-use rule (A6, the case directory
  exists) refuses any second start.

## The execution, bound by hash

- `MANIFEST.sha256`:
  `47d24954ca44244b061c1966d4a9f2bcb45bfd5095431d6a546e7e0a523c3b52`. It
  covers ten files, all verified by this session with `shasum -a 256 -c`. No
  file is unlisted but the manifest itself.

  | File | sha256 |
  |---|---|
  | `execution.json` | `605bbf51bdce9e41e392c2b31cd3104ae3a3a3c0ad4ef4cc7ff0b4029c472d14` |
  | `attempts.jsonl` | `0526f950c53369621adefccf2fb4565e9733cfc645a6729192254de9e927a11c` |
  | `launches.jsonl` | `1761dd7dc486a51912b3db4ad8dec43c1ad6ac616e456c079e178bacab13fae2` |
  | `model-output/reader.json` | `b85eb0b3eb24012fcd3b61f09fabd6ac64f979744f823149cf8db2415963f5a9` |
  | `model-output/prosecutor.json` | `910c2b72a3cac47dbbcd2c09d52996faaf021fd3b1864659f2480388709eb41a` |
  | `model-output/adjudicator.json` | `74fa104858d5d51ca016617970aaff18984817069ecef49eb7ae3193761e1b89` |
  | `streams/gate-launch1.sanitised.jsonl` | `51dfc1d2e2fa73bc8212e6bd1283bcc1905426880cc05acdaeef66bab5c409ab` |
  | `streams/role-reader[0]-launch2.sanitised.jsonl` | `52d1ebbc929c05051146734df679d1c9e15cb78e8e051ba7ae4746ad048ea067` |
  | `streams/role-prosecutor[0]-launch3.sanitised.jsonl` | `df19679742c0219faf8ed1d66dcbdb63a7c1329d5f025ff34ce143a9040bc458` |
  | `streams/role-adjudicator[0]-launch4.sanitised.jsonl` | `ab0714723cbebe38970ca87d8191d34a6500a5b8a9b8bc626608bd3b7758ec3d` |

- **The package as run.** The PR manifest is
  `df4d1ba6db9418eb0967d8fa9b08519a4c1bc04953331c947fbb47afeb97fe91`
  (22 entries), and the `offline-checks/` manifest is
  `1de55c126bd5f1bfd1c4f2e17c63418702da45210f9c076fd84b573034b05b3f`
  (64 entries). This session verified every entry after the run.
- **`model-output/` exists.** Only a completed rehearsal files it. It holds
  the three outputs, 4,854, 6,062 and 1,436 bytes, each the bytes of its
  role's `StructuredOutput` call.

## Three kinds of evidence

Each fact below is in exactly one class. **A** is the operator's word. **B**
is the CLI's word about itself, which nothing here can check. **C** was
established without relying on either.

### A. The operator's steps

- **Source.** This session took no part in the readiness step. The items
  below are as the user gave them in the brief for this checkpoint, and
  nothing here checks them.
- **The pre-flight.** The operator ran the check-only pre-flight in
  Terminal.app. It showed only `ReviewedEnvironmentMismatch`. That is the one
  refusal the handover allows, because only `run-rehearsal.sh` sets the two
  tokens.
- **The readiness step.** Against the handover's three numbered items the
  user wrote:
  1. `confirmed`, against the five D-6 items as a list;
  2. `session used up until now 31%, weekly 51%`, with no reset times;
  3. `approved`.
  - **This checkpoint records these replies in those words.** The D-6 reply
    was one word against the list of five, not five statements. The
    handover asked for each item "stated in words", "one by one, by name".
    This checkpoint does not record an item-by-item confirmation, because
    none was given in that form; it records "1. confirmed" against the list.
  - The usage reading was given as two percentages, with no reset time for
    either window. The handover asked for each window's utilisation and
    reset time.
  - "3. approved" is the separate approval of the future command.
- **The launch.** The operator then ran the handover's hash-bound launcher
  command once, in Terminal.app, at 21:40:01Z. It completed with verdict
  `accepted`.
- **What nothing here checks.**
  - No code can check the account settings. Of the D-6 items, only managed
    settings has a check: A3, which reads the documented macOS location
    alone. It passed at run time (C2).
  - The CLI's overage fields (B) are consistent with extra usage being off.
    They prove none of D-6.
  - XR's `unobserved.extraUsage` calls extra usage being off "the
    user-confirmed precondition of D-6". That text is a constant filed on
    every `@2` and `@3` record (`SUBSCRIPTION_V2_UNOBSERVED`,
    `live-capture.ts:1464–1470`). For this rehearsal it confirms nothing.
  - The user's "31%" and the CLI's 0.38 (B, below) are two sources at two
    instants. This checkpoint reconciles neither to the other.

### B. CLI-reported facts

**The gate** (`auth status --json`). The gate stream is filed as twelve
unparsed lines by design; these are the gate's labels, from `execution.json`:

- `loggedIn` true, `authMethod` `"claude.ai"`, `apiProvider` `"firstParty"`,
  `subscriptionType` `"max"`, `analyticsDisabled` true;
- `apiKeySource` and `forcedLoginMethod` absent;
- the identifiers present and never reproduced;
- no `allowedProviders` key.

**The init events**, line 1 of each of the three role streams, identical in
every field below:

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

This matches the probe checkpoint's list for X3's init.

**The streams** (720, 894 and 232 lines), each in the same shape:

- one `system/status` `"requesting"`;
- one model message and one request ID, the request ID on both assistant
  items:

  | Role | message | request |
  |---|---|---|
  | reader | `msg_011Cg8XxgqnEe79T6MLPXLjZ` | `req_011Cg8XxfPUE6vF19SUbagHq` |
  | prosecutor | `msg_011Cg8XztUKRKmdLS6Tg8wN8` | `req_011Cg8Xzr7gxjQ5WGWEJiEAp` |
  | adjudicator | `msg_011Cg8Y39v4sTDqT2BHRpZqk` | `req_011Cg8Y39FskXwmTKKPbotcx` |

- **one `thinking` block** at index 0, new on a real stream: its `thinking`
  text is empty on the block start and on each of five `thinking_delta`
  events, which carry `estimated_tokens` instead (50, 50, 200, 250, null on
  the reader), with `thinking_display` `"updates"` on the stream item; then
  one `signature_delta`. The CLI withheld the thinking text and reported
  estimates;
- **five `system/thinking_tokens` events** per stream, also new on a real
  stream, each with a cumulative `estimated_tokens` and an
  `estimated_tokens_delta`. The last estimate was 605, 681 and 527;
- one `tool_use` block for `StructuredOutput` at index 1
  (`toolu_01EwFDFPuG4JuJzqPWySRjnM`, `toolu_015QqEphjgu5ATrSCHvXPqtW`,
  `toolu_011VMvkq56wSp2esD3DnEFoC`), whose `input_json_delta` events (695,
  869 and 207) concatenate to the filed model output; the assistant item and
  the result restate it as the parsed object;
- the tool result `"Structured output provided successfully"`, with
  `permission_decision` `{decision: "accept", source: "config"}` in
  `tool_result_meta`;
- `message_delta` stop reason `tool_use`, with no `safeguard_results` entry;
- one `rate_limit_event`;
- the result.

**The usage the CLI reported,** from each `result.usage`:

| | reader | prosecutor | adjudicator |
|---|---|---|---|
| `input_tokens` | 2 | 2 | 2 |
| `cache_creation_input_tokens` (all one-hour ephemeral) | 127,808 | 128,190 | 127,920 |
| `cache_read_input_tokens` | 0 | 0 | 0 |
| `output_tokens` | 2,644 | 3,212 | 1,203 |
| `output_tokens_details.thinking_tokens` | 625 | 737 | 554 |
| interim `output_tokens` on `message_start` | 7 | 6 | 6 |

Service tier and speed `standard`, `inference_geo` `"global"`,
`fallback_credit` null, `server_tool_use` counts 0, on each. The same
thinking figures appear on each `message_delta` and under
`modelUsage["claude-opus-5-5"].thinkingTokens`. The key
`result.usage.thinking_tokens` is absent from all three results.

**The `rate_limit_event`,** one per stream, each with `status` `"allowed"`,
`rateLimitType` `"five_hour"`, `resetsAt` 1792286400
(2026-10-18T01:20:00Z), `overageStatus` `"rejected"`,
`overageDisabledReason` `"org_level_disabled"`, `isUsingOverage` false, and
no `overageEnabled` key:

| | reader | prosecutor | adjudicator |
|---|---|---|---|
| `unifiedWindows.five_hour.utilization` (resetting 2026-10-18T01:20:00Z) | 0.38 | 0.39 | 0.40 |
| `unifiedWindows.seven_day.utilization` (resetting 1792540800, 2026-10-21T00:00:00Z) | 0.51 | 0.51 | 0.51 |

**The results,** each `subtype` `"success"`, `is_error` false,
`terminal_reason` `"completed"`, `stop_reason` `"tool_use"`, `num_turns` 2,
`permission_denials` `[]`, `safety_stops` 0, every `subagent_stats` count 0,
`fast_mode_state` `"off"`, `api_error_status` null, and a `structured_output`
equal to the filed model output:

| | reader | prosecutor | adjudicator |
|---|---|---|---|
| `duration_ms` | 29,335 | 30,888 | 15,064 |
| `duration_api_ms` | 29,320 | 30,872 | 15,050 |
| `total_cost_usd` | 1.075352 | 1.089768 | 1.047428 |

`modelUsage` has one entry each, `claude-opus-5-5`, provider `firstParty`,
`contextWindow` 1,000,000, `maxOutputTokens` 128,000, `costBasis: "list"`.
The three `total_cost_usd` figures sum to 3.212548. They are list-price
estimates, not billing.

### C. Independently checked evidence

#### C1. Recorded by the rehearsal's own code at run time

These are the process and binding facts the rehearsal observed itself, not
the CLI's account:

- **Binding.** HEAD `bdda33f`; the nine engine digests and the six package
  digests in `execution.json`; the pin's size, 239,695,888 bytes, and sha256,
  `494870c9…f8230bdf6`; Node `v24.19.0` (recorded, not compared).
- **A production launch.** `synthetic` is false, and neither the pin nor the
  bounds were injected. `adapterDifference` is `none`: the adapter was the
  committed `claude-code-cli@3` object itself.
- **The inputs, held to R-SYNTH's.** `rsynthInputs` files the closure
  (420,000 bytes, `79183a87…`) and, per role, the prompt, question, stdin
  message and schema, by byte length and sha256, beside the reviewed digests
  from R-SYNTH's accepted run. Generated and reviewed agree on every entry.
  The launch descriptions were 427,675, 428,460 and 427,929 bytes, against a
  bound of 1,048,576: each 127 bytes longer than the accepted run's `@1`
  description for the same role, as PR's README anticipated.
- **The mode, requested and observed, per launch.**
  - `requested.permissionMode` and `requested.invocation.permissionMode` are
    `"default"`.
  - `permissionMode.launches[]`: for seq 2, 3 and 4, observed from one init
    event at line 1, present, value `"default"`, `matchesRequested` true;
    `allMatchRequested` true.
- **The gate process.** pid 67224, exit 0, 117 ms, 382 stdout bytes and 0
  stderr bytes, streams closed.
- **The role processes,** each exit 0, no signal, 0 stderr bytes, streams
  closed, no termination needed, prompt file removed:

  | | reader | prosecutor | adjudicator |
  |---|---|---|---|
  | pid | 67230 | 67291 | 67357 |
  | duration | 29,521 ms | 31,066 ms | 15,233 ms |
  | stdout bytes | 245,678 | 303,499 | 84,791 |
  | prompt file bytes | 1,779 | 1,972 | 1,855 |
  | stdin bytes | 421,392 | 421,489 | 421,455 |

  The prompt-file and stdin byte counts equal the digested inputs' lengths,
  which is R-SYNTH's byte check, kept in `onLaunch`.
- **What the transport launched** (`launches.jsonl`).
  - Each role argv is X3's, as the probe checkpoint lists it, with the
    committed role schema as the `--json-schema` value: `--permission-mode
    default` at `argv[13]` and `argv[14]`, after `--no-session-persistence`
    and before `--settings`. The flag occurs once per launch.
  - The environment names, for the gate and the three roles alike: the
    thirteen launch controls, `HOME`, `PATH` and `USER`.
  - Each role line carries the role's input digests.
- **Counts.**
  - Runner attempts 3 of 3, run attempts 1, 2 and 3, each with outcome
    `completed`, `possiblyBilled` true and usage source `cli_report`.
  - Launches started 3, gate launches 1, records written 3, unsent events 0,
    bounds breached none, interrupts none.
  - `cancelled` false; termination confirmed; output not withheld; no
    finalisation after a throw.
- **R-SYNTH's checks** (`rsynth`): `accepted` `["reader","prosecutor",
  "adjudicator"]`, `rejected` null. Every check `ok`: 14 for the reader
  (12 elements, 12 quotes), 15 for the prosecutor (lens `synthetic-lens-A`,
  6 coverage cells, 4 challenges, 9 quotes), 14 for the adjudicator (exactly
  `C-1`, `C-2`, 3 quotes). Each role's `fact_present` and `fact_quoted` held
  for all three planted facts. The record's own note: these are retrieval
  checks that do not establish semantic or legal-reasoning quality.
- **Output and error.** `output.accepted` true, three files under
  `model-output/`. `error` and `escapedError` are null.
- **Usage and holds.** `usageStop` `null`, from the committed `usageStopOf`
  over the observation. `inFlightStopKinds` `["long_context_boundary",
  "unnatural_reset"]`. The three hold roots were read at 21:40:01.368Z, the
  start.
- **Times.** The gate's line in `launches.jsonl` at 21:40:01.588Z, the
  reader's at 21:40:31.217Z, the prosecutor's at 21:41:02.397Z, the
  adjudicator's at 21:41:17.739Z; drained at 21:41:17.742Z; finished at
  21:41:17.743Z.

#### C2. Checked by this session afterwards, offline

- **Manifests.**
  - XR's manifest hashes to `47d24954…`, and its ten entries verify. No file
    in XR is unlisted but the manifest, and none is newer than it.
  - PR's manifests hash to `df4d1ba6…` (22 of 22 entries OK) and `1de55c12…`
    (64 of 64). Every package file is listed in one of them, and none is
    newer than the top manifest, written at 21:30:35Z.
  - Neither directory holds a symbolic link.
  - **Controls.** Against a scratch copy of XR's manifest with one digest
    altered, `shasum -a 256 -c` reported `attempts.jsonl: FAILED`, exit 1;
    the same against PR's reported `HANDOVER.md: FAILED`. With one name
    removed from a scratch copy of the listed set, the listing comparison
    reported it.
- **The record against the commit.**
  - Each of the nine engine digests in `execution.json` equals the sha256 of
    `git show bdda33f:backend/engine/<file>`. **Control:** with one digest
    altered in a scratch copy, the comparison failed.
  - The six package digests equal PR's manifest entries, and the pin digest
    equals the handover's.
- **Candidate.** HEAD `bdda33f`, on its branch, before and after this file
  was written, read with `git --no-optional-locks`. The status was only the
  two `node_modules` symlinks before, and those and this file after.
  `bdda33f` adds only the probe checkpoint, so every engine file is
  `0c59998`'s.
- **The mode, three ways, three times.** For each launch the argv pair, the
  init line and the record's entry agree. The key `"permissionMode"` occurs
  once in each role stream, on line 1.
- **The binding and stage A passed at run time.** The entry refuses on any
  binding refusal before it loads the engine, and `runRehearsal` returns on
  any stage-A refusal before it constructs or creates anything (PR's README,
  "What the rehearsal does"). XR exists, so every binding and stage-A rule
  passed. They include `TERM_PROGRAM`, the HEAD, branch, status and
  tracked-contents rules (`rehearsal-binding.ts:239–247`),
  `PermissionModeNotRequested`, `RSynthInputsChanged`, `BoundsMismatch`,
  `PinMismatch`, A3, A6 for the new case, and A7 over the three hold roots.
- **The exit.** The filed status `completed` is the one `exitCodeFor`
  (`rehearsal-binding.ts:180–189`) maps to exit 0, and the entry prints
  `status: completed; verdict: accepted` (`rehearsal.ts:77`), which is what
  the operator reported.
- **The later checks.** See "What ran, in order", below.
- **The outputs.** For each role, the `input_json_delta` events joined equal
  `model-output/<role>.json` byte for byte, and hash to the manifest's
  entry; parsed, they equal the result's `structured_output`.
- **R-SYNTH's checks, re-read.** Independently of `rsynth/checks.ts`, this
  session parsed the three outputs: every `quote` item names `docId`
  `SSR-1` and carries `sha256Normalized` equal to the closure digest, and
  each of `ZK-4471`, `thirty-one months` and `OSS-9027` is a substring of at
  least one quote text in each output. The adjudicator's verdicts are
  `CONFIRMED` for `C-1` and `C-2`. No output has a `gaps` entry.
- **The rate-limit events, against the allowlist.**
  - The allowlist admits two statuses, `"allowed"` and `"allowed_warning"`
    (`claude-code-cli.ts:2156`, `:2253`).
  - It requires `overageStatus` `"rejected"` (`:2258–2259`) and
    `isUsingOverage` present and false (`:2255–2256`). It admits
    `overageEnabled` only absent or false (`:2263`).
  - All three events meet each of these, and rule 1's overage facts
    (`:1669–1676`) find none in them.
- **The in-flight stop.** The restated set is `long_context_boundary` and
  `unnatural_reset` (`rehearsal-lib.ts:144`), compared with the committed
  line by a test. The per-request context each result reported, about
  128,000 tokens, is below the committed 190,000 ceiling
  (`included-usage.ts:75`), and no reset fact arose, so no stop fired after
  any launch.
- **No hold.** A `completed` record whose `usageStop` is `null` holds
  nothing.
  - The committed `assertNoResetPending` (`live-capture.ts:1668–1755`) holds
    a start only for a usable `usageStop.resetsAt` or an exhausted or
    overage fact. It refuses outright only a status other than `completed`
    or `failed`.
  - PR's restated walk is the probe's, byte-identical, with the same logic.
  - This is a reading of the code. No test ran here.
- **The gate stream.** Its twelve lines record only their byte counts. It is
  byte-identical to X's and X3's (`51dfc1d2…`), so the three gate answers
  had the same line lengths.
- **New shapes, known to the walk.** The `thinking` block, its
  `thinking_delta` and `signature_delta` events, and the
  `system/thinking_tokens` events had not appeared on a real stream before
  (X3's stream has no block but the tool call and no system subtype but
  `init` and `status`). The committed walk already admits them:
  `V2_SYSTEM_SUBTYPES` is `init`, `status`, `thinking_tokens`
  (`claude-code-cli.ts:1836`), `V2_BLOCK_TYPES` includes `thinking` and
  `redacted_thinking` (`:1838`), and a thinking block's deltas are
  `thinking_delta` and `signature_delta` (`:1843`). That the run completed
  shows the walk accepted them; the package's synthetic fixtures had
  exercised the same shapes offline.
- **No personal strings.** `vivin` and `/Users/` occur in none of XR's ten
  files. The `[REDACTED]` values in each role stream are under `session_id`
  and `uuid` (one each per line) and `cwd` (1). Paths in `execution.json`
  are filed under `$HOME`.
- **The CLI's sockets.** `/tmp/cc-socks/67230.sock`, `67291.sock` and
  `67357.sock` were absent after the run.
- **The shared root,** listed by name only, at 21:49Z.
  - 37 entries, the root included: 24 files, 13 directories, no symbolic
    link.
  - Three execution directories, each with an `execution.json`: X (`@2`,
    `failed`, `usageStop` null), X3 (`@3`, `completed`, `usageStop` null)
    and XR (`@3`, `completed`, verdict `accepted`, `usageStop` null).
  - XR's pack, case, execution and two subdirectories add 16 entries. The
    21 outside them match the count PR's inputs log recorded before the run.
  - Nothing under the root is newer than XR's manifest.

## What ran, in order

`@3`'s projection is `@2`'s own `projectResponseV2`
(`claude-code-cli.ts:2365–2381`, bound at `:2466`). It runs in order, throws
at the first refusal, and returns only after `checkOutput`. It ran once per
role launch, on three real streams:

| Step | Here, on each of the three streams |
|---|---|
| `classify` (D-7: overage, exhaustion, credits, long context, substitution, refusal, truncation, fast mode, other kind) | passed |
| exit and signal | passed |
| first malformed line | none |
| `walkStreamV2` (every event, subtype, block, item and delta known) | passed, with a `thinking` block and five `system/thinking_tokens` events |
| `checkLaunchContextV2` | passed: `permissionMode "default"` |
| `checkResultV2` | passed |
| `checkUsageObservedV2` (the rate-limit allowlist) | passed: `"allowed"` |
| `checkModelUsageV2` | passed |
| `theStructuredOutputBlock` | passed: one `StructuredOutput` call |
| `checkStopReasonsV2` | passed |
| `checkToolLoop` | passed |
| `checkResultRestatementV2` | passed |
| `checkOutput` | passed: the joined deltas returned |

- **How this is known.** XR files `error` null and three outputs accepted,
  and each filed output is the value `projectResponseV2` returns. A refusal
  at any step would have thrown before that return, and nothing later would
  have launched.
- **Stage D, after each launch,** in PR's order: the in-flight usage stop
  found no `long_context_boundary` or `unnatural_reset` fact; then R-SYNTH's
  `checkRoleOutput` accepted the role. A stop or a rejection would have
  ended the run there, and the next role would not have launched. All three
  launched, so each earlier role passed both.
- **The rehearsal's own stage E then passed:**
  - termination confirmed;
  - one gate and three role launches;
  - no launch over 20,971,520 bytes of stdout and stderr (`boundsBreached`
    `[]`; the largest was 303,499);
  - no fact against included usage (`usageStop` `null`);
  - R-SYNTH's verdict: all three roles accepted, in order, so not
    `RehearsalIncomplete`;
  - only then the outputs filed.
- **The first time three real streams were judged in one run.** The `@3`
  probe accepted one 16-line stream with no thinking. These three carry
  thinking blocks, thinking-token events and 207 to 869 output deltas each.
  Three real streams accepted show that the checks accept them, not that
  they refuse bad ones. PR's teeth and R-SYNTH's tests cover refusal.

## Retries and spend

- Three runner attempts, three role processes and one gate process were
  recorded. No runner retry or relaunch occurred.
- **HTTP attempts are unobserved.** Three request IDs and three model
  messages were observed, one of each per launch. The HTTP attempts inside
  the CLI are not (`httpAttempts: null`). `num_turns` 2 is the CLI's own
  count and does not show a second request.
- **Billing is not proven.** The ledger counts three possibly billed
  attempts, 6 known input tokens and 7,059 known output tokens. The CLI's
  `total_cost_usd` figures, summing to 3.212548, are list-price estimates
  with `costBasis: "list"`, not charges.
- **What the run spent, as the CLI reports it:** 383,918 cache-creation
  input tokens, 7,059 output tokens of which 1,916 thinking, across the
  three launches. The handover's expectation, from R-SYNTH's accepted run on
  `@1`, was about 127,000 cache-creation tokens and 1,500 to 4,000 output
  tokens per launch.
- **Usage refusals come after the launch.** The rehearsal decides them only
  once a launch has ended. Here no usage fact arose.

## Observed metadata, and what it does not show

- **Plugins and agents,** recorded and not judged (R-3).
  - Each init lists two built-in plugins and four agents under
    `--safe-mode`, as X's and X3's did.
  - Listing is not execution:
    - the tool list was exactly `StructuredOutput`, so no agent tool existed
      to spawn one;
    - every `subagent_stats` count is 0;
    - no stream carries a hook or plugin event.
  - Whether a built-in plugin contributed text to the request is
    **unobserved**. The reported usage adds up to about 127,810 to 128,192
    context tokens for a 1,779-to-1,972-byte system prompt, a ~421 KB
    message and a 2,168-to-2,651-byte schema.
- **Model limits.** `contextWindow` 1,000,000 and `maxOutputTokens` 128,000
  are the CLI's description of the model, not the request's ceiling.
  `CLAUDE_CODE_MAX_OUTPUT_TOKENS` was 64,000, and the wire-level `max_tokens`
  is unobserved.
- **Effort.** `--effort high` was passed, and each init says
  `per_turn_effort_active` true. The CLI reported 625, 737 and 554 thinking
  tokens, so thinking occurred. Whether the effort was applied is
  **unobserved**.
- **The thinking count: where 2.1.295 writes it, and what the record holds.**
  - `cliObserved.thinkingTokens` is `[null, null, null]`. The committed
    `observeStream` reads `result.usage.thinking_tokens`
    (`live-capture.ts:997`), and no result carries that key. The record's
    `thinkingTokensNote` says so.
  - On these streams 2.1.295 writes the figure in five places, none of them
    that key:
    1. `system/thinking_tokens` events, five per launch, each with a
       cumulative `estimated_tokens` and an `estimated_tokens_delta`; the
       last estimates were 605, 681 and 527;
    2. `thinking_delta` events, each with an `estimated_tokens` (null on the
       last), and an empty `thinking` text;
    3. `message_delta.usage.output_tokens_details.thinking_tokens`: 625,
       737, 554;
    4. `result.usage.output_tokens_details.thinking_tokens`: the same
       figures, kept raw in `cliObserved.reportedUsage[]`;
    5. `result.modelUsage["claude-opus-5-5"].thinkingTokens`: the same
       figures.
  - The estimates (1, 2) run below the final counts (3, 4, 5) by 20 to 56
    tokens on each launch.
  - The thinking **text** is not in the stream: the block and its deltas
    carry `thinking: ""` with `thinking_display: "updates"`, and one
    `signature_delta`. So the sanitised streams hold no reasoning text to
    redact.
  - **Not repaired here.** No engine code changed. Whether to make the
    observer read `output_tokens_details.thinking_tokens` is an open
    decision (below).
- **The mode's effect.** `"default"` is each init's report (B). Each tool
  call was accepted by configuration, as X3's was. These streams therefore
  show no behaviour that differs between the reported modes. That 2.1.295
  applies the flag beyond reporting it rests on S's static reading.

## What one rehearsal settled

For these three launches, at this time:

- **The question this package added.** The pinned 2.1.295 carried a ~421 KB
  stdin message and a 2–3 KB prompt file under `--permission-mode default`,
  three times; each init reported `"default"`; each structured output
  arrived as one `StructuredOutput` call under the real role schema, in 15
  to 31 seconds against an 1,800,000 ms timeout; and `claude-opus-5-5`
  quoted the three planted facts in each role, so R-SYNTH's checks accepted
  all three on `@3`.
- **The later checks** and the rehearsal's stage D and E accepted three
  real streams in one run. Neither the in-flight stop nor the post-drain
  checks fired.
- **None of the handover's fail-closed runtime unknowns occurred** (its
  blocker 5). Each init reported `"default"`, the expired embedded catalog
  did not stop the model, a `StructuredOutput` call arrived each time, the
  walk knew every subtype and field, each `rate_limit_event` fell inside the
  allowlist, no long-context fact arose at ~128,000 cache-creation tokens,
  and no output was rejected.
- **The gate** answered as for X and X3: `@2`'s allowlisted keys, no
  `allowedProviders`, and `analyticsDisabled` true.
- **The model.** `claude-opus-5-5` was accepted three more times, after the
  embedded catalog's expiry. Where the catalog came from stays unknown.
- **The controls, as the streams show them.** Fast mode was off
  (`disabled_by_env`), speed standard, and no model other than the requested
  one appeared in any of the five places each stream names a model. The
  tools and MCP restriction held.
- **Structured output** arrived as one `StructuredOutput` tool call per
  launch under `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS=1`.
- **New: thinking on a real stream.** The first real streams with a
  `thinking` block, `thinking_delta` and `signature_delta` events and
  `system/thinking_tokens` events. The walk admitted them, as its sets
  provide. The thinking text was withheld by the CLI.
- **New: `"allowed"` events at 0.38 to 0.40.** X3's one event was
  `"allowed_warning"` at 0.91 with `overageEnabled` false; these three are
  `"allowed"` with no `overageEnabled` key, which the allowlist admits as
  absent.
- **The thinking-count gap, confirmed on real streams.** The probe
  checkpoint inferred it from one result; three results now show the key
  the observer reads absent and the figure present elsewhere.

## Carried forward

- **Settled for these launches,** from the probe checkpoint's list:
  - the committed later checks on three real streams at R-SYNTH's size,
    which ran and passed;
  - the mode as the init reports it, three more times.
- **Still unobserved:**
  - billing;
  - HTTP attempts inside the CLI;
  - whether `--effort high` was applied;
  - why `@2`'s launch reported `"auto"` with no flag supplied;
  - substantive correctness or legal-reasoning quality: R-SYNTH's checks are
    mechanical retrieval checks, as the record's own note says;
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
- **The package's residuals,** unchanged from its handover: tsx, zod and
  Node are not digest-bound; the main checkout's in-repository root is not
  read; R-SYNTH's byte check on each launch has no tooth; the sensitivity
  check's email pattern is quadratic on an unbroken run of word characters.

## What it means next

- **The five-hour window read 0.38 to 0.40.**
  - At 21:40Z to 21:41Z the CLI reported the five-hour window at 0.38, 0.39
    and 0.40 across the three launches, resetting at 2026-10-18T01:20:00Z,
    and the seven-day window at 0.51, resetting at 2026-10-21T00:00:00Z.
  - The probe checkpoint records 0.91 for X3 at 18:44Z, resetting at
    20:20Z. That window reset before this run. The 0.38 at the first
    launch's end is a reading of the new window.
  - The operator's readiness reading was "31%" and "51%" (A), given before
    the run and without reset times. The CLI's first figure, 0.38, came
    after a launch of about 128,000 cache-creation tokens. Nothing here
    relates the two beyond stating them.
  - Should a launch meet an exhausted window, the committed rules refuse it
    only after it has run, so it can have spent. They then file a stop that
    holds every later start reading the shared root until the reported
    reset, or until an operator reviews it if no usable reset was reported.
  - So a readiness step should read both windows afresh, with their reset
    times. The 21:41Z figures go stale at 01:20Z.
- **The shared root holds three records, in 37 entries.**
  - X (`@2`, `failed`, `usageStop` null), X3 (`@3`, `completed`,
    `usageStop` null) and XR (`@3`, `completed`, `accepted`, `usageStop`
    null).
  - None holds a later start: X and X3 as the probe checkpoint records, XR
    by the committed check's code (C2).
  - A check that counts the root must now expect 37 entries, two packs and
    three cases. PR's inputs log recorded 21, one pack and two cases.
- **`claude-code-cli@3` has two executions on file:** X3, the probe at
  `0c59998`, and XR, this rehearsal at `bdda33f`.
- **The rehearsal package is spent.** Its A6 refuses any start while the
  case directory `synthetic-rehearsal/opus55-v3-r-synth-three-role` exists
  (`filedEntryRefusal`, `rehearsal-binding.ts:337–367`), and it now holds
  XR. No second run of PR
  is possible, by design.
- **Committing this file moves the candidate past `bdda33f`.** PR refuses
  any HEAD but `bdda33f` (`EngineHeadMismatch`) and any status line but the
  two symlinks (`RepositoryStatusNotClean`, `rehearsal-binding.ts:239–243`),
  so this file already breaks its binding. PR is spent either way. A later
  package binds to the new HEAD.
- **The thinking count** is read from a key 2.1.295 does not write (above).
  The five places it does write are now documented from three real
  streams. Whether to change `observeStream` is open; nothing changed here.

## Decisions recorded

1. **Rehearsal first, checkpoint after,** as with both probes. PR's handover
   placed this checkpoint after the run, since adding any file to the
   candidate breaks PR's binding.
2. **The D-6 reply is recorded as "1. confirmed" against the list of five,
   in those words,** not as an item-by-item confirmation (the user,
   2026-10-18, in the brief for this checkpoint).
3. **The usage reading is recorded as "session used up until now 31%,
   weekly 51%", with no reset times,** as given.
4. **No relaunch of PR.** A6 also enforces it.
5. **The thinking-count gap is documented, not repaired.** No engine code
   changed (the user, in the same brief).
6. **Nothing further live is authorised** (the user, in the same brief).

## Handed forward

- **The next decision is the user's:** S-002, or another rehearsal. Nothing
  further live is authorised.
- **The shared hold root,**
  `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions`,
  stays the execution root, or a hold root, for every later subscription
  execution: any probe, rehearsal or S-002.
- **A future live run needs all of these,** as before:
  - a new reviewed package with a new case ID, bound to the candidate's HEAD
    at that time, since PR is spent and bound to `bdda33f`;
  - the same hold root, now holding three records in 37 entries;
  - a fresh readiness step: the operator's Terminal.app pre-flight; the five
    D-6 items, each stated in words, one by one, as the handover asked; and
    both usage windows read afresh, each with its utilisation and reset
    time;
  - a separate explicit approval.
- **The harness's thinking count** reads `result.usage.thinking_tokens`
  (`live-capture.ts:997`), which 2.1.295 does not write; it writes
  `result.usage.output_tokens_details.thinking_tokens`,
  `modelUsage[model].thinkingTokens`, the same key on `message_delta`, and
  estimates on `system/thinking_tokens` and `thinking_delta` events. Whether
  to change the observer is open. The figure is in every record's raw
  `reportedUsage` meanwhile.
- **Open decisions, unchanged** (the repair checkpoint): `--settings` as an
  identity input; `disableAutoMode` in `--settings`, beside the flag and
  never instead of the check.

## Process notes

- **Who.** A later session wrote this file, started by another session with
  the user's brief. It took no part in preparing PR or in the readiness
  step, and it took the operator's steps from that brief.
- **Write locations.** In the candidate, only this file. Outside the
  repository: its logs, scratch manifests for the controls and two Python
  scripts in its own scratchpad. Nothing in pilot-evidence was written.
- **Reads.**
  - XR, in full: `execution.json`, `attempts.jsonl`, `launches.jsonl`, the
    three model outputs, the gate stream, and the three role streams through
    a script;
  - PR's manifests, `README.md`, `HANDOVER.md`, inputs log and pre-flight
    log, and the single-use, binding and exit-code rules in
    `rehearsal-binding.ts`, `rehearsal-lib.ts` and `rehearsal.ts` by
    search;
  - the committed candidate's code by search: `claude-code-cli.ts`,
    `live-capture.ts`, `included-usage.ts`;
  - the shared root, by name; X's and X3's `execution.json` for `status`
    and `usageStop` only; X3's role stream for its subtypes only.

  P, P3, S, R and R-SYNTH's frozen candidate were not read.
- **What ran.** Hashing, listing, `stat` under `TZ=UTC`,
  `git --no-optional-locks` queries, and Python scripts (`python3 -I`,
  standard library only) that read XR and compared digests. No Claude Code,
  `ollama` or Node binary ran, and no test, network or subagent was used.
- **b1b-record.** This session ran no command in it and read nothing from
  it.
- **Logs.** Each has a unique UTC-timestamped name in the session's
  scratchpad. They are working notes, not filed evidence, and every check
  above can be re-run from its description.
