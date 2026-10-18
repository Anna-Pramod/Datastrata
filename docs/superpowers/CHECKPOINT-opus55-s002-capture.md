# Checkpoint — the first genuine `CSRD-S-002` capture on `claude-code-cli@3`, completed with one gap, on `b471efc`

Written on 2026-10-18 (+0530), 2026-10-18 UTC, by a later session, after the
run, in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD
`b471efc538fbb232f2d3c1a3baf8eae09ac3ec5a`). Every time below is UTC.

- **Scope of this change.** This file is the only addition to the candidate.
  No code changed. Nothing is committed: the user runs every `git add` and
  `git commit`.
- **Where the evidence is.**
  - **PS**: the successor capture package
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-18-opus55-v3-s002-capture-prep-r1/`
    (`README.md`, `HANDOVER.md`). Its predecessor,
    `2026-10-18-opus55-v3-s002-capture-prep`, stays frozen and was not run.
  - **XS**: the execution
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261018T121625Z-2d4de0/`.
    It is the committed harness's own record (`runFirstSubscriptionCase`,
    `backend/engine/test/live-capture.ts:2507`), filed under the shared root,
    with real inputs: the two EUR-Lex texts, the three committed prompts, the
    `CSRD-S-002` rendering and the role schemas. It is the first execution
    that sent corpus text over the subscription route.
  - **Cited, not read here:** the records in the table below.
- **Unchanged.** Neither PS nor XS was written after the run. Their hashes
  are below.
- **Nothing further is on file.** The shared root holds X, X3, XR and XS, and
  nothing under it is newer than XS's manifest (checked at 12:33Z). Nothing
  further live is authorised.
- **Offline.** This session executed no Claude Code, `ollama` or Node binary,
  ran no test, and used no network and no subagent.

| Cited | `MANIFEST.sha256` | Recorded in |
|---|---|---|
| X, the `@2` probe's execution | `fc1c2e674079239e5bc20291346ed7fcbbd9f5276d36180037da4fe94dd3a0eb` | the first checkpoint |
| X3, the `@3` probe's execution | `9e20975d2247e5966fa2b56e54e6fec6e793f948626f04571c55727f1a53b431` | the probe checkpoint |
| XR, the R-SYNTH rehearsal's execution | `47d24954ca44244b061c1966d4a9f2bcb45bfd5095431d6a546e7e0a523c3b52` | the rehearsal checkpoint |
| the frozen first S-002 package | `ffbcb52e0be42f1c67fd34b4e86b52164804da9b2cf29d9c67bfef3d35292361` | PS's `README.md` |

"The first checkpoint" is `CHECKPOINT-opus55-minimal-probe.md`, "the probe
checkpoint" is `CHECKPOINT-opus55-v3-probe.md`, and "the rehearsal
checkpoint" is `CHECKPOINT-opus55-v3-r-synth-rehearsal.md`. PS's
`offline-checks/inputs-final.20261018T114626Z.log` records all of these as
matching, every entry OK, thirty minutes before the run. This session did not
read them again; it read X's, X3's and XR's `execution.json` for their
`adapter`, `status` and `usageStop` fields only.

## The outcome

The letter after each item names its class of evidence, defined below.

- **The run.** After the readiness step, the operator ran the hash-bound r1
  launcher once, in Terminal.app, and it completed: `status: completed`,
  `evidence: sealed by the manifest`, exit 0 (A). The execution ran from
  12:16:25.517Z to 12:20:22.687Z, 3 minutes 57 seconds (C1).
- **The gate passed** (C1).
- **Five role launches completed, in order, and then the run halted on a
  gap.** `reader[0]`, `prosecutor[0]` (lens `missing_criterion`),
  `prosecutor[1]` (`wrong_conjunction`), `prosecutor[2]`
  (`wrong_threshold_or_units`) and `prosecutor[3]`
  (`wrong_measurement_period`), each one launch of `claude-opus-5-5` at
  effort `high`, ran to completion (C1). Each answered through one
  `StructuredOutput` call under the committed role schema (B).
  `prosecutor[3]`'s output named a document outside the closure, Directive
  (EU) 2022/2464, so the committed pipeline stopped there: lenses 4 to 6 and
  the adjudicator did not launch (C2, from the code and the record). Four of
  the nine budgeted launches were unused.
- **The filed result carries one gap and no judgments.**
  `verification-result.json` has `gaps` of length 1 (`corpus_gap`,
  `docId` `CELEX-32022L2464`), and `reading.elements`, `coverage.cells`,
  `challenges` and `openQuestions` all empty, as the record invariant
  requires of a gap-bearing run (C1). The roles' own outputs, 15 reading
  elements, 37 coverage cells and 4 challenges in all, are preserved in the
  transcript and discarded from the result (C2).
- **The gap's identifier.** The prosecutor named the document
  `CELEX-32022L2464`. The corpus index holds that directive as
  `DOC-32022L2464`. The engine's discriminator compares identifiers exactly,
  so it filed `corpus_gap` ("the corpus holds no document CELEX-32022L2464 at
  all; ingest it") for a document the corpus already holds. This is
  documented below (C2) and not repaired here; the gap stands as filed.
- **The mode.** `--permission-mode default` was requested on every launch
  and passed (C1). Each init event, at line 1 of its stream, reported
  `permissionMode "default"` (B). The committed init check accepted each
  (C2).
- **The committed later checks passed on five real streams in one run**
  (C2). Each role output parsed at its seam, and the result assembled
  (C1).
- **Filed record.** Status `completed`, `error` null, `usageStop` null (C1),
  so there is no reset hold (C2). The trust tiers: execution `completed`,
  schema `valid`, evidence `unassessed`, substantive correctness
  `unassessed` (C1).
- **The package is spent.** Its single-use claim (the case directory
  `csrd/CSRD-S-002` exists) refuses any second start.

## The execution, bound by hash

- `MANIFEST.sha256`:
  `35268592865636d6d5e68aefe3c5ce4d86a9f6f9241d00c4e573e380d954ce47`. It
  covers twelve files, all verified by this session with `shasum -a 256 -c`.
  No file is unlisted but the manifest itself.

  | File | sha256 |
  |---|---|
  | `execution.json` | `65c3148d55e6d3b62c0f9c351d03e8e9996a9ec15aba08fc2b16b6f49492f4ce` |
  | `attempts.jsonl` | `4d118a716bfbcd7c635bd1f6c7500dd9f1baf5f080f6209002e33f7042430595` |
  | `launches.jsonl` | `825b5e2ea2bd4b57c7e1e949fe59f283bc2ebc3cff7f4ffc84fbb0411ea76c05` |
  | `streams/gate-launch1.sanitised.jsonl` | `51dfc1d2e2fa73bc8212e6bd1283bcc1905426880cc05acdaeef66bab5c409ab` |
  | `streams/role-reader[0]-launch2.sanitised.jsonl` | `5645edca523d93e04f72f49829df407ca3bc72173c00843292d1e486798be0db` |
  | `streams/role-prosecutor[0]-launch3.sanitised.jsonl` | `531dd2abc6a1896b8d0d539310bb0678168ac3cbcbc8a4db9ca4756e02183be3` |
  | `streams/role-prosecutor[1]-launch4.sanitised.jsonl` | `3c2aec2da726be6a67bab5f5374db61fcf54ae11ab4a6744b8cd006df7e92a49` |
  | `streams/role-prosecutor[2]-launch5.sanitised.jsonl` | `ed9641c9756c786aee044b6229513bb7ff6aef55af2679dcbbf6f7d5489e099a` |
  | `streams/role-prosecutor[3]-launch6.sanitised.jsonl` | `847f24926210dc3d313bc7bd1d0844a4f463c3c2144139fba7424c8b96c65ec3` |
  | `transcript/csrd/CSRD-S-002/run-v1-30e176ef5261f992603f33547a1520c8d628e91fea55660dd319f77fd58323cf.json` | `f76c9f2bb106d1b84d0d7a7680a811cbc2d247738d849923334b7da7ca6f7b44` |
  | `verification/csrd/CSRD-S-002/verification-result.json` | `74341823ee03afc4fe62e48bd9d085d4f157966a1bb9ef5b7a6ca4527392a59a` |
  | `verification/requirement-versions/csrd.json` | `4021f07f7156cd66f6f1a1097b174674c9c294c5714ad34683d6dba8a86cf981` |

- **The package as run.** PS's manifest is
  `b364ecd069687bd267e2dc3c01e60a096083d6a36e77924e0ef7fb0ff6191237`
  (20 entries), and its `offline-checks/` manifest is
  `77c4daa8c1fbbf0cbfb95526c884e2b95d481dbb37a52472c23eddb0ca7b03ca`
  (17 entries). This session verified every entry before the run, at
  takeover, and again after it. The launcher `run-capture.sh` hashes to
  `8cbf32b478a2fd1f7aa62421f591214e3d186bc8cb3420bfa1571803e4d7c740`, the
  digest in the operator's one-liner.
- **The result's own digest.** The harness printed `resultSha256
  27dcfd3809294de907145ce917974d1dac9ebb09f535512dcee09d160175467f` for
  `verification-result.json` (C1, `execution.json` `lines[1]`); the
  manifest's entry above is the file's sha256 as filed. Which bytes the
  harness digests for `resultSha256` was not checked here.
- **The transcript** is 2,242,012 bytes and holds five roles: each with its
  `model`, `promptSha256`, `requestSha256`, three messages and the role's
  `outputJson`. The reader's `promptSha256` is `4d21d2b9…`; the four
  prosecutors share `87eb0a21…`.

## Three kinds of evidence

Each fact below is in exactly one class. **A** is the operator's word. **B**
is the CLI's word about itself, which nothing here can check. **C** was
established without relying on either.

### A. The operator's steps

- **Source.** This session collected the readiness items from the user in
  chat and recorded each reply verbatim in the shared notes folder as it
  arrived; the items are restated here in those words. Nothing here checks
  them.
- **The pre-flight (item 4).** Recorded by the preparing session, before
  this one took over: the operator ran the check-only pre-flight in
  Terminal.app at 11:51:02.580Z. It showed one refusal,
  `ReviewedEnvironmentMismatch`, the code binding passed, stage A 0
  refusals, the reviewed `runId`, the budgets as reviewed, exit 64. That is
  the one refusal the README allows, because only `run-capture.sh` sets the
  five variables.
- **The readiness step, as given.** The user replied four times. The first
  three replies did not supply the items in the required form, and the
  launcher was not presented after any of them:
  1. `1. checked and approved, all confirmed` and `2. usage window: session
     limit 53% used now, weekly 60% used, reset 5 hrs in 2.45 hours and
     weekly i have one reset pass avialble, normal reset on wednesday at
     5.30am.` (received 11:59:30Z). Item 1 was one phrase; no D-6 item was
     named; item 3 was given.
  2. The reply button's lead-in line with nothing after it.
  3. This session's own request list, returned unchanged.
  4. The fourth reply supplied the items. This session had offered example
     sentence shapes in the turn before; the user sent those shapes back
     unchanged. **Items 1 and 2 are therefore assistant-drafted wording sent
     by the user, and this checkpoint calls them that**, as PS's README
     requires. Verbatim:

     > Item 1, I have checked the account's current terms and they permit
     > this use for DataStrata's purposes. The model-improvement setting is
     > off. I approve sending the two EUR-Lex texts, the three prompt files,
     > the requirement rendering, the role schemas and the earlier roles'
     > outputs over the Max subscription for this one capture."
     >
     > Item 2, five separate sentences, each naming its setting and its
     > state, of shape:
     >
     > * "Extra usage is off."
     > * "Auto-reload is off."
     > * "No usage credits are enabled."
     > * "A reset pass is available; no reset card or early reset is enabled
     >   and I will not use the pass for this run."
     > * "No managed-settings file or other policy source exists."
     >
     > Item 3, usage window: session limit 53% used now, weekly 60% used,
     > reset 5 hrs in 2.45 hours and weekly i have one reset pass avialble,
     > normal reset on wednesday at 5.30am.

  - **Item 1, the data-terms approval (open decision 20),** states the three
    facts the README asks for: the terms permit the use for DataStrata's
    purposes, the model-improvement setting is off, the listed content is
    approved for sending over the Max subscription for this one capture.
    This is the first recorded decision on open decision 20. It is recorded
    as assistant-drafted wording sent by the user.
  - **Item 2, the five D-6 items,** are five sentences, each naming its
    setting and its state, with the lead-in "five separate sentences, each
    naming its setting and its state, of shape:" carried over from the
    request. The fourth records a new fact: a reset pass exists on the
    account, and the user states it will not be used for this run. Recorded
    as assistant-drafted wording sent by the user.
  - **Item 3, the usage windows,** is the first reply's text re-sent: the
    five-hour ("session limit") window 53% used, resetting "in 2.45 hours";
    the seven-day ("weekly") window 60% used, "normal reset on wednesday at
    5.30am" (local time, +0530). The utilisations and relative reset times
    are the user's. This session derived absolute times (about 14:27Z or
    14:44Z depending on how "2.45 hours" is read, and 2026-10-21T00:00Z) and
    asked for confirmation; the user re-sent the original text instead. The
    CLI's own reset times are under B.
- **The launcher presented.** PS's `README.md` names the frozen package's
  path in its pre-flight and future-command blocks (lines 496 and 519), with
  this package's digest; run verbatim, its future command would have printed
  `BLOCKED` on the digest mismatch (`fe68f6c1…` is the frozen launcher's
  digest). PS's `HANDOVER.md` gives both commands with the r1 path. This
  session presented the HANDOVER's one-liner, r1 path and digest
  `8cbf32b4…`, and said so; the user raised no objection. The README was not
  changed, because it is manifest-bound.
- **The launch.** The user wrote `Approved. I ran the r1 launcher from
  Terminal.app.` and, after a prompt from this session, asked for the
  one-liner again and ran it. The operator's Terminal.app paste (prompt
  `vivin@MacBook-Pro ~ %`) shows the one-liner, the launcher's banner, the
  report with `status: completed`, `evidence: sealed by the manifest`,
  `gate: pass`, `role launches: 5; gate launches: 1; ledger possibly billed:
  5; HTTP attempts: unknown`, `usage stop: none`, the trust line, the
  reviewed `runId` "(equals the offline measurement)", the five paths and
  the manifest line "(12 entries, sha256 35268592…)", then `exit 0
  USER=vivin HOME=/Users/vivin`. The paste is kept verbatim in the shared
  notes.
- **What nothing here checks.**
  - No code can check the account settings. Of the D-6 items, only managed
    settings has a check: A3, which reads
    `/Library/Application Support/ClaudeCode` alone. It passed at run time
    (C2), and the directory was absent when this session looked, before
    the launcher was presented and again at 12:33Z.
  - The CLI's overage fields (B) are consistent with extra usage being off.
    They prove none of D-6.
  - XS's `unobserved.extraUsage` calls extra usage being off "the
    user-confirmed precondition of D-6". That text is the constant
    `SUBSCRIPTION_V2_UNOBSERVED` (`live-capture.ts:1464`), filed on every
    `@2` and `@3` record. For this capture it confirms nothing.
  - The user's "53%" and the CLI's 0.54 at the reader's end (B) are two
    sources at two instants. This checkpoint reconciles neither to the
    other.

### B. CLI-reported facts

**The gate** (`auth status --json`). The gate stream is filed as twelve
unparsed lines by design; these are the gate's labels, from `execution.json`:

- `loggedIn` true, `authMethod` `"claude.ai"`, `apiProvider` `"firstParty"`,
  `subscriptionType` `"max"`, `analyticsDisabled` true;
- `apiKeySource` and `forcedLoginMethod` absent;
- `email`, `orgId`, `orgName`, `projectsDirectory` and `configDirectory`
  present and never reproduced;
- no `allowedProviders` key.

**The init events**, line 1 of each of the five role streams, identical in
every field below and equal to the rehearsal checkpoint's list for XR:

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
- ten `capabilities`; `cwd` redacted.

**The streams** (2,061, 568, 700, 132 and 934 lines), each in the same
shape as XR's:

- one `system/status` `"requesting"`;
- one model message and one request ID, the request ID on both assistant
  items:

  | Role | message | request | `StructuredOutput` call |
  |---|---|---|---|
  | `reader[0]` | `msg_011Cg9gnymY96jpP7UW89fG4` | `req_011Cg9gnxzABSjF4vxS794LG` | `toolu_01LmiwoPm6wwVa1Ttrt6sZCa` |
  | `prosecutor[0]` | `msg_011Cg9gtUy6ZcqKz13PibgcN` | `req_011Cg9gtTubcQgTqBUAJEEP1` | `toolu_01XxdgoehUhrA78qabCyfT46` |
  | `prosecutor[1]` | `msg_011Cg9gxMjd7AtZ8NvQoTVVS` | `req_011Cg9gxLePz9HaPN5zLVpv7` | `toolu_01A2CByRhAaMQugxhtknoNq6` |
  | `prosecutor[2]` | `msg_011Cg9h1VLN88Jvm33jDkLdo` | `req_011Cg9h1UrqKMbH7ckij4fQC` | `toolu_01H6mfXNkXP7PsrwNCJNHibU` |
  | `prosecutor[3]` | `msg_011Cg9h2eejHwaRVMBffQLni` | `req_011Cg9h2e7ycQgUpLpKf6o6K` | `toolu_01Lqrkej6U2JB7M7UvqjypXP` |

- one `thinking` block at index 0 with empty `thinking` text throughout and
  one `signature_delta`; the CLI withheld the thinking text, as on XR;
- `system/thinking_tokens` events, 13, 17, 16, 7 and 17 per stream, each
  with a cumulative `estimated_tokens` and a delta; the last estimates were
  1,550, 1,950, 2,050, 605 and 2,150;
- one `tool_use` block for `StructuredOutput` at index 1, whose
  `input_json_delta` events (2,018, 518, 652, 103 and 884) concatenate to
  the role's `outputJson` in the transcript; the result restates it as
  `structured_output`;
- the tool result `"Structured output provided successfully"`, with
  `permission_decision` `{decision: "accept", source: "config"}`;
- `message_delta` stop reason `tool_use`, with no `safeguard_results` entry;
- one `rate_limit_event`;
- the result. The reader's stream also carries one `ping`.

**The usage the CLI reported,** from each `result.usage`:

| | `reader[0]` | `prosecutor[0]` | `prosecutor[1]` | `prosecutor[2]` | `prosecutor[3]` |
|---|---|---|---|---|---|
| `input_tokens` | 2 | 2 | 2 | 2 | 2 |
| `cache_creation_input_tokens` (all one-hour ephemeral) | 132,725 | 139,948 | 136,307 | 136,312 | 136,310 |
| `cache_read_input_tokens` | 0 | 0 | 3,641 | 3,641 | 3,641 |
| `output_tokens` | 7,391 | 3,567 | 4,045 | 1,127 | 4,793 |
| `output_tokens_details.thinking_tokens` | 1,625 | 1,998 | 2,075 | 714 | 2,245 |
| interim `output_tokens` on `message_start` | 8 | 10 | 9 | 10 | 10 |

Service tier and speed `standard`, `inference_geo` `"global"`,
`fallback_credit` null, `server_tool_use` counts 0, on each. The same
thinking figures appear under `modelUsage["claude-opus-5-5"].thinkingTokens`.
The key `result.usage.thinking_tokens` is absent from all five results. The
sums: 681,602 cache-creation tokens, 10,923 cache-read tokens, 20,923 output
tokens of which 8,657 thinking. The per-request context, taken as input
plus cache creation plus cache read, was 132,727 for the reader and 139,950
to 139,955 for each prosecutor.

**The `rate_limit_event`,** one per stream, each with `status` `"allowed"`,
`rateLimitType` `"five_hour"`, `resetsAt` 1792334400
(2026-10-18T14:40:00Z), `overageStatus` `"rejected"`,
`overageDisabledReason` `"org_level_disabled"`, `isUsingOverage` false, and
no `overageEnabled` key:

| | `reader[0]` | `prosecutor[0]` | `prosecutor[1]` | `prosecutor[2]` | `prosecutor[3]` |
|---|---|---|---|---|---|
| `unifiedWindows.five_hour.utilization` (resetting 2026-10-18T14:40:00Z) | 0.54 | 0.55 | 0.56 | 0.57 | 0.59 |
| `unifiedWindows.seven_day.utilization` (resetting 1792540800, 2026-10-21T00:00:00Z) | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 |

**The results,** each `subtype` `"success"`, `is_error` false,
`terminal_reason` `"completed"`, `stop_reason` `"tool_use"`, `num_turns` 2,
`permission_denials` `[]`, `safety_stops` 0, every `subagent_stats` count 0,
`fast_mode_state` `"off"`, `api_error_status` null, and a
`structured_output` equal to the parsed `outputJson`:

| | `reader[0]` | `prosecutor[0]` | `prosecutor[1]` | `prosecutor[2]` | `prosecutor[3]` |
|---|---|---|---|---|---|
| `duration_ms` | 74,331 | 52,227 | 42,345 | 15,461 | 49,745 |
| `duration_api_ms` | 74,313 | 52,210 | 42,327 | 15,443 | 49,727 |
| `total_cost_usd` | 1.209628 | 1.190932 | 1.172092 | 1.113772 | 1.187076 |

`modelUsage` has one entry each, `claude-opus-5-5`, provider `firstParty`,
`contextWindow` 1,000,000, `maxOutputTokens` 128,000, `costBasis: "list"`.
The five `total_cost_usd` figures sum to 5.873501. They are list-price
estimates, not billing.

### C. Independently checked evidence

#### C1. Recorded by the harness's and the package's own code at run time

These are the process, binding and pipeline facts recorded without relying
on the CLI's account of itself:

- **A production launch.** `synthetic` is false; neither the pin nor the
  budgets were injected. `adapter` is `claude-code-cli@3`, `transport`
  `spawn`, `attemptUnit` `cli_launch`. The pin: version `2.1.295`,
  239,695,888 bytes, sha256 `494870c9…f8230bdf6`, equal to the requested
  pin and to the constant at `claude-code-cli.ts:471`.
- **What was requested.** `permittedModels` `["claude-opus-5-5"]`, `effort`
  `high`, `maxOutputTokens` 64,000, `settings`
  `{"switchModelsOnFlag":false,"fastMode":false,"autoContinueAtUsageLimit":false}`
  from the profile, `permissionMode` `"default"`.
- **The budgets, as reviewed.** `maxRunAttempts` 9, `maxInputBytesPerAttempt`
  2,097,152, `launchTimeoutMs` 1,800,000, `gateTimeoutMs` 60,000,
  `lifetimeMs` and `deadlineMs` 16,470,000.
- **The gate process.** pid 34504, exit 0, 1,383 ms, 382 stdout bytes and 0
  stderr bytes, streams closed.
- **The role processes,** each exit 0, no signal, 0 stderr bytes, streams
  closed, no termination needed, prompt file removed:

  | | `reader[0]` | `prosecutor[0]` | `prosecutor[1]` | `prosecutor[2]` | `prosecutor[3]` |
  |---|---|---|---|---|---|
  | pid | 34515 | 34555 | 34598 | 34625 | 34651 |
  | duration | 74,512 ms | 52,405 ms | 42,524 ms | 15,637 ms | 49,920 ms |
  | stdout bytes | 690,663 | 204,188 | 247,892 | 52,738 | 325,707 |
  | prompt file bytes | 4,829 | 5,636 | 5,636 | 5,636 | 5,636 |
  | stdin bytes | 406,585 | 423,826 | 423,826 | 423,833 | 423,833 |

  The prompt-file sizes are the committed prompts' sizes as PS's README
  measured them (4,829 and 5,636). The reader's stdin is the rendered
  closure (406,430 bytes) with the requirement's rendering, in the
  message's framing; each prosecutor's stdin carries the reader's output as
  well, and the last two carry seven more bytes than the first two.
- **What the transport launched** (`launches.jsonl`).
  - The gate's argv is `["auth","status","--json"]`.
  - Each role argv is XR's, with the committed role schema as the
    `--json-schema` value: `-p`, `--model claude-opus-5-5`, `--effort high`,
    `--safe-mode`, `--tools ""`, `--strict-mcp-config`,
    `--setting-sources ""`, `--disable-slash-commands`,
    `--no-session-persistence`, `--permission-mode default`, `--settings
    …`. The flag occurs once per launch.
  - The environment names, for the gate and the five roles alike: the
    launch controls (`CLAUDE_CODE_DISABLE_FAST_MODE`,
    `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
    `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK`,
    `CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK`,
    `CLAUDE_CODE_DISABLE_REFUSAL_RETRY`,
    `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS`,
    `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, `CLAUDE_CODE_MAX_RETRIES`, …), `HOME`,
    `PATH` and `USER`. Values are not filed.
  - Each role line carries its `observed` summary: request IDs, `numTurns`
    2, `thinkingTokens` null, one rate-limit event, the raw
    `reportedUsage`.
- **Counts.**
  - Runner attempts 5, run attempts 1 to 5, each with outcome `completed`,
    `possiblyBilled` true and usage source `cli_report`.
  - Launches started 5, gate launches 1, records written 5, unsent events 0,
    interrupts none.
  - `cancelled` false; termination confirmed; result not withheld.
  - The ledger: attempts used 5 of 9, 4 remaining; largest launch
    description 442,107 bytes against the 2,097,152 admission bound; 10
    known input tokens, 20,923 known output tokens, 0 attempts with unknown
    usage, 5 possibly billed; HTTP attempts unobserved.
- **The pipeline's identity.** `runId`
  `run-v1-30e176ef5261f992603f33547a1520c8d628e91fea55660dd319f77fd58323cf`,
  equal to PS's offline measurement and to the pre-flight's printed value;
  `pipelineVersion`
  `pipeline-v3-ecb06a30764aff78ecf25bde4a8c3e25fcf4d827ce336a5cd757863ae8eb332d`;
  `corpusClosureSha256`
  `d1b110be0a9755a14e2bad32e87f70b19024bd1b0fb81f3b9ceef83024cb2d13`, the
  closure pin PS reviewed; `requirementInputSha256` `fecc5050…`,
  `renderedConditionSha256` `a47f2f38…`, `conditionSha256` `39223cb9…`,
  `requirementVersion` 3, `resultSchemaVersion` `1.3.0`,
  `closureRendererVersion` and `rendererVersion` `1.1.0`.
- **The corpus pinned in the result.** Two documents: `DOC-32013L0034`
  (`official_consolidation`, "consolidated, in force from 2026-03-18 (CELEX
  02013L0034-20260318)", `sha256Normalized` `8822d68a…`, source `SRC-001`
  in force) and `DOC-32026L0470` (`authentic_publication`, "as published",
  `sha256Normalized` `c228f7b1…`, source `SRC-004` in force), normaliser
  `1.0.2`, no non-operative sections.
- **The gap, as the pipeline classified it.** `verification-result.json`
  `gaps[0]`: `kind` `corpus_gap`, `docId` `CELEX-32022L2464`, `detail` "The
  closure does not contain Article 5(2) of Directive (EU) 2022/2464, which
  sets the financial-year application dates. Only the amending text in
  Directive 2026/470 is available, so the full point (a) criteria for
  financial years 2024–2026 cannot be read. — the corpus holds no document
  CELEX-32022L2464 at all; ingest it, then restart verification". The
  harness printed `gaps: 1`.
- **The trust tiers,** as the harness filed them with their methods:
  execution `completed` ("the harness's own account: the gate, the launches,
  the drain, cleanup confirmation and usage stops"); `schemaValidity`
  `valid` ("role outputs parsed at their seams (RoleOutputError otherwise),
  then assembleVerificationResult (structure, cross-field consistency, pins,
  gap identity, version registry)"); `evidenceValidity` `unassessed`, sets
  `[]` (the method text names `checkResultEvidence` over every evidence set,
  "whether evidence supports its proposition is not assessed");
  `substantiveCorrectness` `unassessed` ("none at capture time").
- **Usage and holds.** `usageStop` `null`. `exitCode` 0. `error` null.
- **Times.** `startedAt` 12:16:25.517Z; the gate's line in `launches.jsonl`
  at 12:16:27.004Z; the reader's at 12:17:41.698Z; the prosecutors' at
  12:18:34.225Z, 12:19:16.873Z, 12:19:32.627Z and 12:20:22.671Z; `drainedAt`
  12:20:22.680Z; `finishedAt` 12:20:22.687Z. The five-hour window's reported
  reset, 14:40:00Z, fell after the run.
- **The package's part.** The r1 entry filed nothing of its own inside XS:
  the twelve files are the harness's. The package's claim is the case
  directory `csrd/CSRD-S-002`, created at 12:16Z by the non-recursive
  `mkdir` (`capture-lib.ts:659–674`), and kept.

#### C2. Checked by this session afterwards, offline

- **Manifests.**
  - XS's manifest hashes to `35268592…`, and its twelve entries verify
    (`shasum -a 256 -c`, every line `OK`). The set of files present equals
    the set listed. No file in XS is unlisted but the manifest, and none is
    newer than it (every file's mtime is 12:16:25Z to 12:20:22Z; the
    manifest's is 12:20:22Z).
  - PS's manifests hash to `b364ecd0…` (20 of 20 entries OK) and
    `77c4daa8…` (17 of 17), verified at takeover (11:56Z), again before the
    launcher was presented, and after the run, directly after the operator's
    report was received (12:22:15Z). The frozen first
    package's `ffbcb52e…` was present and not re-verified here.
  - XS holds no symbolic link.
  - **No control was run** against an altered scratch manifest this time;
    the rehearsal checkpoint's controls stand for the method.
- **The record against the commit.**
  - PS's `capture-binding.ts` binds 27 files of `backend/engine/` by
    digest: 18 under `src/`, `test/live-capture.ts` and
    `test/included-usage.ts`, the three prompts, the `csrd` version
    registry and the three `knowledge/csrd` files. Each of the 27 digests
    equals the sha256 of `git show b471efc:backend/engine/<file>`, 0
    mismatches. No control was run.
  - `bdda33f..b471efc` changes one file, the rehearsal checkpoint (737
    insertions), so every engine file at `b471efc` is `bdda33f`'s, and the
    rehearsal checkpoint's line references into `claude-code-cli.ts`,
    `live-capture.ts` and `included-usage.ts` hold here.
- **Candidate.** HEAD `b471efc`, on its branch, before and after this file
  was written, read with `git --no-optional-locks`. The status was only the
  two `node_modules` symlinks before, and those and this file after.
- **The mode, three ways, five times.** For each launch the argv pair, the
  init line and the record's `requested.permissionMode` agree on
  `"default"`. The key `"permissionMode"` occurs once in each role stream,
  on line 1.
- **The binding and stage A passed at run time.** The r1 entry refuses on
  any binding refusal before it loads the engine, and `runCapture` returns
  on any stage-A refusal before it claims or creates anything (PS's README,
  "What the capture does"; `capture-lib.ts:701`). XS exists under the
  claimed case, so every binding and stage-A rule passed, among them
  `EngineHeadMismatch`, `EngineBranchMismatch`, `RepositoryStatusNotClean`,
  `TrackedContentsChanged` (`capture-binding.ts:268–305`),
  `ReviewedEnvironmentMismatch` (`:287`), `ManagedSettingsPresent` (`:380`),
  `ExecutionAlreadyFiled` (`:404–426`), `S002InputsChanged`
  (`capture-lib.ts:357`), `BudgetMismatch` (`:436`), `BoundsMismatch`
  (`:443–460`) and `PermissionModeNotRequested` (`:498`).
- **The exit.** The filed status `completed` is the one `exitCodeFor`
  (`capture-binding.ts:225, :235–248`) maps to `EXIT.completed`, 0, which is
  what the operator's `echo "exit $?"` reported.
- **The outputs.** For each of the five roles, the `input_json_delta`
  events joined equal the transcript's `outputJson` string exactly, and
  parsed they equal the result's `structured_output`. The reader's output is
  14,721 characters, the prosecutors' 3,861, 4,830, 798 and 6,499.
- **What the roles produced, read from the transcript** (preserved there,
  discarded from the result by `canonicaliseGapBearingRun`,
  `orchestrate.ts:241–260`):
  - **`reader[0]`:** 15 elements, `E1-addressee` to
    `E15-transposition-and-transitional`, covering the addressee, the two
    criteria, the conjunction, measurement timing, the operative obligation,
    the dedicated section, the amendment chain, four exclusions or
    exemptions, the extension to insurers and credit institutions, threshold
    indexation and transposition timing; `gaps` `[]`.
  - **`prosecutor[0]`, `missing_criterion`:** 11 coverage cells (nine
    `MAPPED`, two `UNCERTAIN` on `all[0]` and `all[1]`), one challenge
    `C1-annex-ii-member-liability-criterion`.
  - **`prosecutor[1]`, `wrong_conjunction`:** 11 cells (eight `MAPPED`, one
    `UNMAPPED` on `E13`, two `UNCERTAIN`), one challenge
    `C1-legal-form-conjunct-excludes-art1-3-alternative`.
  - **`prosecutor[2]`, `wrong_threshold_or_units`:** 5 cells, all `MAPPED`,
    no challenge.
  - **`prosecutor[3]`, `wrong_measurement_period`:** 10 cells (six `MAPPED`,
    four `UNCERTAIN`), two challenges
    (`C1-turnover-measurement-point-unanchored`,
    `C2-financial-year-application-window-absent`) and **one gap**, which
    the model itself labelled `closure_gap` with `docId` `CELEX-32022L2464`.
  - Whether any of this is correct is unassessed, as the trust tiers say.
    Nothing here reads the law.
- **Why the run stopped where it did.** `runProsecutors`
  (`prosecutors.ts:830–872`) classifies each lens's `gaps` through
  `gapForUnreachableDocument` and, on the first non-empty list, breaks out
  of the lens loop ("§3.0: agent verification stops at the gap"), returns
  `halted: true` with every prosecutor's coverage and challenges emptied
  and the classified gaps on the last output. `orchestrate.ts:514–522`
  then skips the adjudicator because `agentHalted` is true. So lenses 4 to
  6 and `adjudicator[0]` were never asked, by design. The budget did not
  bind; four attempts remained.
- **The gap's kind is the engine's, not the model's, and it turns on the
  identifier.**
  - The model wrote `closure_gap`; the filed kind is `corpus_gap`. That is
    by design: `classifyUnreachableDocument` (`gaps.ts:99–107`) derives the
    kind from the corpus, and the reader prompt tells the roles so
    (`reader.md:71–72`, "the pipeline decides which it was against the
    corpus").
  - The discriminator is `corpusHolds(docId)`, an exact match on `docId`
    against `corpus/index.json` (`entitlement.ts:639–641`). The index lists
    four documents: `DOC-32013L0034`, `DOC-32022L2464` ("Directive (EU)
    2022/2464 — CSRD", consolidated text dated 2026-03-18,
    `normalized/32022L2464.txt`), `DOC-32023R2772` and `DOC-32026L0470`. Its
    only edge is `DOC-32013L0034` `amendedBy` `DOC-32026L0470`.
  - The model named the document `CELEX-32022L2464`, a form that appears
    nowhere in the index. The closure it was shown names documents as
    `DOC-32013L0034` (27 occurrences in the prosecutor's messages) and
    `DOC-32026L0470` (13), and says "CELEX" only inside two version labels.
    The prosecutor prompt says "naming the document, as the reader does"
    (`prosecutor.md:101–102`) and the reader prompt gives the gap shape with
    `"docId": "..."` (`reader.md:49–50`); neither states the identifier
    form.
  - So the filed detail, "the corpus holds no document CELEX-32022L2464 at
    all; ingest it", describes a document the corpus holds under another
    name. Under the index's own identifier the same halt would have been
    classified `closure_gap` ("the corpus holds DOC-32022L2464, but the
    entitled closure … does not reach it under the traversal policy in
    force", `gaps.ts:124`), since no edge connects it to the closure.
  - **Not repaired here.** No engine code, prompt or corpus entry changed.
    The result stands as filed. What to do about it is recorded as an open
    decision below.
- **The rate-limit events, against the allowlist.**
  - The allowlist admits two statuses, `"allowed"` and `"allowed_warning"`
    (`claude-code-cli.ts:2156`, `:2183`), and requires `isUsingOverage`
    present and false (`:2185`); rule 1's overage facts (`:1672–1675`) fire
    on `isUsingOverage` true, `overageStatus` allowed, or `overageEnabled`
    true.
  - All five events meet the allowlist and raise no overage fact.
- **The in-flight stop.** The committed set is `long_context_boundary` and
  `unnatural_reset` (`live-capture.ts:1534`). The per-request context each
  result reported, 132,727 to 139,955 tokens, is below the committed
  190,000 ceiling (`included-usage.ts:75`), and no reset fact arose, so no
  stop fired after any launch. The README's conditional estimate was about
  124,300 (reader) and 129,000 (prosecutors) at the rehearsal's ratio, and
  144,800 and 150,400 in its denser case; the observed figures lie between
  the two.
- **No hold.** A `completed` record whose `usageStop` is `null` holds
  nothing. The committed `assertNoResetPending` (`live-capture.ts:1668`)
  holds a start only for a usable `usageStop.resetsAt` or an exhausted or
  overage fact. This is a reading of the code. No test ran here.
- **The gate stream.** Its twelve lines record only their byte counts (1,
  19, 28, 30, 28, 55, 44, 35, 50, 52, 27, 1). It is byte-identical to X's,
  X3's and XR's (`51dfc1d2…`), so the four gate answers had the same line
  lengths.
- **Shapes, all known to the walk.** The `thinking` block and its deltas,
  the `system/thinking_tokens` events and the `ping` are admitted by the
  committed sets (`claude-code-cli.ts:1836`, `:1838`, `:1843`), as the
  rehearsal checkpoint recorded; the walk refused none of 4,395 stream
  lines.
- **Personal strings.** `vivin` and `/Users/` occur in none of the twelve
  files but `execution.json`, where three lines carry the operator's
  absolute paths: `lines[0]` ("Wrote /Users/vivin/…"), `transcriptPath` and
  `resultPath`. The r1 report printed these under `$HOME`; the harness's
  record did not. The `[REDACTED]` values in each role stream are under
  `session_id` and `uuid` (one each per line) and `cwd` (1). XR had no
  such paths because the rehearsal's own record filed them under `$HOME`;
  this is the committed harness's record. Noted, not changed.
- **The CLI's sockets.** No `/tmp/cc-socks/` entry for pids 34515, 34555,
  34598, 34625 or 34651 existed at 12:33Z.
- **The shared root,** listed by name only, at 12:33Z.
  - 61 entries, the root included: 37 files, 24 directories, no symbolic
    link. PS's inputs log recorded 37 entries before the run; XS's pack,
    case and execution directories, two `transcript` and `verification`
    subtrees and `streams` add 24.
  - Four execution directories, each with an `execution.json`: X (`@2`,
    `failed`, `usageStop` null), X3 (`@3`, `completed`, `usageStop` null),
    XR (`@3`, `completed`, `usageStop` null) and XS (`@3`, `completed`,
    `usageStop` null).
  - Nothing under the root is newer than XS's manifest.

## What ran, in order

`@3`'s projection is `@2`'s own `projectResponseV2`
(`claude-code-cli.ts:2365–2381`, bound at `:2466`), unchanged since the
rehearsal. It runs in order, throws at the first refusal, and returns only
after `checkOutput`. It ran once per role launch, on five real streams:

| Step | Here, on each of the five streams |
|---|---|
| `classify` (D-7: overage, exhaustion, credits, long context, substitution, refusal, truncation, fast mode, other kind) | passed |
| exit and signal | passed |
| first malformed line | none |
| `walkStreamV2` (every event, subtype, block, item and delta known) | passed, with a `thinking` block, 7 to 17 `system/thinking_tokens` events and, on the reader, a `ping` |
| `checkLaunchContextV2` | passed: `permissionMode "default"` |
| `checkResultV2` | passed |
| `checkUsageObservedV2` (the rate-limit allowlist) | passed: `"allowed"` |
| `checkModelUsageV2` | passed |
| `theStructuredOutputBlock` | passed: one `StructuredOutput` call |
| `checkStopReasonsV2` | passed |
| `checkToolLoop` | passed |
| `checkResultRestatementV2` | passed |
| `checkOutput` | passed: the joined deltas returned |

- **How this is known.** XS files `error` null, `recordsWritten` 5 and a
  transcript whose five `outputJson` values are the values
  `projectResponseV2` returns. A refusal at any step would have thrown
  before that return, and nothing later would have launched.
- **Then the committed pipeline, per role:** the output parsed at its seam
  (`RoleOutputError` otherwise; none arose), the reader's gaps found empty,
  the prosecutors run in lens order until `prosecutor[3]`'s gap, the
  adjudicator skipped, the deterministic tail run (pins, collation,
  canonicalisation), `assembleVerificationResult` passed, the result and
  the transcript written, then the harness's manifest.
- **The package's stage E** then passed: termination confirmed, one gate
  and five role launches, no usage fact, the manifest present; it printed
  the report and exited 0.
- **The first time five real streams, and real corpus text, were judged in
  one run.** XR's three streams carried a 421 KB synthetic closure; these
  five carried the 406 KB EUR-Lex closure with 2,018 to 103 output deltas
  each. Five real streams accepted show that the checks accept them, not
  that they refuse bad ones. PS's and the frozen package's teeth cover
  refusal.

## Retries and spend

- Five runner attempts, five role processes and one gate process were
  recorded. No runner retry or relaunch occurred. Four of nine budgeted
  attempts went unused because the pipeline halted, not because any bound
  bit.
- **HTTP attempts are unobserved.** Five request IDs and five model
  messages were observed, one of each per launch. The HTTP attempts inside
  the CLI are not (`httpAttempts: null`). `num_turns` 2 is the CLI's own
  count and does not show a second request.
- **Billing is not proven.** The ledger counts five possibly billed
  attempts, 10 known input tokens and 20,923 known output tokens. The CLI's
  `total_cost_usd` figures, summing to 5.873501, are list-price estimates
  with `costBasis: "list"`, not charges.
- **What the run spent, as the CLI reports it:** 681,602 cache-creation
  input tokens, 10,923 cache-read tokens, 20,923 output tokens of which
  8,657 thinking, across five launches. The README's expectation for a full
  nine-launch run was about 1.2 million cache-creation tokens plus outputs;
  this run used a little over half of that in five launches, each about
  8,000 to 11,000 context tokens heavier than the rehearsal's ratio
  predicted.
- **The five-hour window moved from 0.54 to 0.59** across five launches as
  the CLI reports it, about 0.01 per launch, resetting at 14:40Z; the
  seven-day window read 0.60 throughout. The user's reading before the run
  was 53% and 60%.
- **Usage refusals come after the launch.** The harness decides them only
  once a launch has ended. Here no usage fact arose.

## Observed metadata, and what it does not show

- **Plugins and agents,** recorded and not judged (R-3).
  - Each init lists two built-in plugins and four agents under
    `--safe-mode`, as X's, X3's and XR's did.
  - Listing is not execution: the tool list was exactly `StructuredOutput`;
    every `subagent_stats` count is 0; no stream carries a hook or plugin
    event.
  - Whether a built-in plugin contributed text to the request is
    **unobserved**. The reported usage adds up to about 132,700 context
    tokens for the reader's 4,829-byte system prompt, 406,585-byte message
    and 2,168-byte schema, and about 139,950 for each prosecutor's
    5,636-byte prompt, 423,826-to-423,833-byte message and 2,651-byte
    schema.
- **Cache reads.** `prosecutor[1]`, `[2]` and `[3]` each report 3,641
  cache-read tokens and `prosecutor[0]` none; the four prosecutor messages
  share a prefix (the prompt and the reader's output). What the CLI cached
  and why `prosecutor[0]` read nothing is **unobserved**.
- **Model limits.** `contextWindow` 1,000,000 and `maxOutputTokens` 128,000
  are the CLI's description of the model, not the request's ceiling.
  `CLAUDE_CODE_MAX_OUTPUT_TOKENS` was 64,000, and the wire-level `max_tokens`
  is unobserved. The largest output was 7,391 tokens.
- **Effort.** `--effort high` was passed, and each init says
  `per_turn_effort_active` true. The CLI reported 714 to 2,245 thinking
  tokens, so thinking occurred. Whether the effort was applied is
  **unobserved**.
- **The thinking count,** unchanged from the rehearsal checkpoint.
  `cliObserved.thinkingTokens` is `[null, null, null, null, null]` because
  the committed `observeStream` reads `result.usage.thinking_tokens`
  (`live-capture.ts:997`), which 2.1.295 does not write; the figure is at
  `result.usage.output_tokens_details.thinking_tokens`, on `message_delta`,
  under `modelUsage[model].thinkingTokens`, and as estimates on
  `system/thinking_tokens` and `thinking_delta` events. The estimates ran
  below the final counts by 25 to 109 tokens here. The r1 report says so in
  its own words ("deferred, not repaired"). **Not repaired here.**
- **The mode's effect.** `"default"` is each init's report (B). Each tool
  call was accepted by configuration. These streams show no behaviour that
  differs between the reported modes.
- **The delivery wording.** The committed prompts end "Output the JSON
  object and nothing else" and had never been sent over the CLI (PS's
  README, "Known risk"). All five launches answered with one
  `StructuredOutput` tool call, as the schema route expects, and no stream
  carries a text block beside the tool call. The risk did not materialise
  on these five launches.

## What one capture settled

For these five launches, at this time:

- **The question this package asked.** The committed harness's own first
  live case ran once on real inputs over the subscription route: the pinned
  2.1.295 carried the 406 KB EUR-Lex closure and the committed prompts
  under `--permission-mode default`, five times; each init reported
  `"default"`; each structured output arrived as one `StructuredOutput`
  call under the real role schema, in 15 to 75 seconds against an
  1,800,000 ms timeout; the committed pipeline parsed every output,
  halted where its rules say, assembled a valid gap-bearing result and
  sealed it.
- **The later checks** and the package's stages accepted five real streams
  in one run. Neither the in-flight stop nor the post-drain checks fired.
- **None of the fail-closed runtime unknowns occurred.** No refusal, no
  truncation, no model substitution, no long-context fact at about 140,000
  context tokens, no rate-limit status outside the allowlist, no manifest
  failure, no throw after the claim.
- **The gate** answered as for X, X3 and XR.
- **The model.** `claude-opus-5-5` was accepted five more times.
- **Structured output** arrived as one `StructuredOutput` tool call per
  launch under `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS=1`, on real prompts
  whose last line asks for bare JSON.
- **The pipeline's halt rule ran live for the first time.** A prosecutor's
  gap stopped the lens loop and skipped the adjudicator; the result carries
  the gap and no judgments; the transcript keeps what the roles had
  produced. The run is `completed`, not `failed`: a gap is a legitimate
  outcome, answered by changing the corpus or the closure and restarting.
- **New: the identifier form matters to the gap's kind.** A role that names
  a held document by a form the index does not use produces a `corpus_gap`
  whose remedy text ("ingest it") does not fit. Nothing in the prompts
  states the form. This is the one new finding of substance.
- **New: real reading and real challenges from `claude-opus-5-5` on
  `CSRD-S-002`,** preserved in the transcript: 15 elements, 37 cells, 4
  challenges, 1 gap. Their correctness is unassessed.
- **The thinking-count gap, confirmed again,** now on five streams.

## Carried forward

- **Settled for these launches:** the committed later checks on five real
  streams at S-002's size; the mode as the init reports it, five more
  times; the delivery wording on five launches; the halt rule live.
- **Still unobserved:**
  - billing;
  - HTTP attempts inside the CLI;
  - whether `--effort high` was applied;
  - what the CLI cached between prosecutor launches;
  - substantive correctness of the reading, the coverage and the
    challenges, and whether the gap's legal premise (that Article 5(2) of
    Directive 2022/2464 is needed to read the measurement period) is right;
  - the adjudicator on real inputs, and lenses 4 to 6: never launched;
  - the rehearsal checkpoint's list: the catalog's origin, `--setting-sources
    ''`, native structured output, refusal retry and exhaustion,
    nine-launch and variance behaviour, the wire-level `max_tokens`,
    whether `-p` honours every `--settings` key, what the built-in plugins
    add.
- **The package's residuals,** unchanged from its handover: tsx, zod and
  Node not digest-bound; the main checkout's in-repository root not read;
  the claim is a directory an operator could remove by hand; the thinking
  count deferred; the 190,000 ceiling unconfirmed by the user; the ratio
  from synthetic prose (now with one real data point: about 0.32 tokens per
  byte over the whole request, taking the prompt file, the stdin message
  and the schema as the request).

## What it means next

- **The gap decides the next step, and it is the user's.** The result says
  "ingest CELEX-32022L2464, then restart verification". The corpus already
  holds the document as `DOC-32022L2464`, with no edge from the closure to
  it. Three readings are possible, and this checkpoint chooses none:
  - the closure should reach Directive 2022/2464 (record an `amendedBy` or
    equivalent edge from `DOC-32013L0034`, or widen the traversal policy),
    then rerun from the reader;
  - the roles should be told the identifier form (`DOC-<CELEX>`), so that a
    gap names a held document in the index's terms, then rerun;
  - the gap's legal premise should be assessed first, since a reviewer may
    find the measurement period readable from the closure as it stands.
  Any rerun is a new execution under a new package: `csrd/CSRD-S-002` is
  claimed, and the harness's own `ExecutionAlreadyFiled` and the package's
  single-use rule refuse a second start. A rerun after a corpus or closure
  change also changes the closure pin and so the `runId`.
- **The result as filed is a valid gap-bearing record.** It is not a
  verification of `CSRD-S-002`, and nothing here promotes or signs it.
  `evidenceValidity` has no sets to assess because a gap-bearing result
  carries no evidence sets.
- **The usage windows read 0.54 to 0.59 and 0.60.** The five-hour window
  reset at 14:40Z; the seven-day window resets at 2026-10-21T00:00Z. These
  figures are stale for any later readiness step.
- **The shared root holds four records, in 61 entries.** None holds a later
  start: X, X3 and XR as their checkpoints record, XS by the committed
  check's code (C2). A check that counts the root must now expect 61
  entries, three packs and four cases.
- **`claude-code-cli@3` has three executions on file:** X3 (the probe,
  `0c59998`), XR (the rehearsal, `bdda33f`) and XS (this capture,
  `b471efc`).
- **The r1 package is spent,** and the frozen first package stays frozen.
- **Committing this file moves the candidate past `b471efc`.** PS refuses
  any HEAD but `b471efc` (`EngineHeadMismatch`) and any status line but the
  two symlinks (`RepositoryStatusNotClean`, `capture-binding.ts:268–305`),
  so this file already breaks its binding. PS is spent either way. A later
  package binds to the new HEAD.
- **One documentation defect in PS, recorded, not fixed:** the README's
  two command blocks name the frozen path (above, A). The file is
  manifest-bound.
- **The harness's record carries absolute paths** in three fields (C2),
  where the rehearsal's record used `$HOME`. Whether to change the
  committed harness is open.

## Decisions recorded

1. **Capture first, checkpoint after,** as with the probes and the
   rehearsal. Adding any file to the candidate breaks PS's binding.
2. **Open decision 20 is decided for this one capture,** in the words under
   A, item 1, recorded as assistant-drafted wording sent by the user
   (2026-10-18, in chat).
3. **The five D-6 items are recorded as five sentences, in the words under
   A, item 2, each as assistant-drafted wording sent by the user,** with the
   added fact that a reset pass exists and was declared unused for this
   run. The first reply, "checked and approved, all confirmed", is recorded
   as one phrase and not as a confirmation of anything.
4. **The usage reading is recorded as given,** with relative reset times
   and no confirmation of this session's derived absolute times; the CLI's
   reset times are recorded beside it under B.
5. **The launcher was presented with the r1 path and the README's digest,**
   because the README's own block names the frozen path (the session,
   stated in chat before presenting; the user did not object).
6. **No relaunch.** The claim and `ExecutionAlreadyFiled` also enforce it.
7. **The gap is documented, not repaired:** no engine code, prompt, corpus
   entry or closure edge changed. What to do about `CELEX-32022L2464` is
   open.
8. **The thinking-count gap is documented, not repaired,** as before.
9. **Nothing further live is authorised.**

## Handed forward

- **The next decision is the user's:** which of the three readings of the
  gap to act on, and whether to assess the filed reading and challenges
  before anything else.
- **The shared hold root,**
  `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions`,
  stays the execution root, or a hold root, for every later subscription
  execution, now holding four records in 61 entries with the `csrd` pack
  present and `CSRD-S-002` claimed.
- **A future live run needs all of these,** as before:
  - a new reviewed package bound to the candidate's HEAD at that time, with
    a case the root does not hold (a rerun of `CSRD-S-002` needs a decision
    on the claimed case, which this checkpoint does not make);
  - a fresh readiness step: the operator's Terminal.app pre-flight; the data
    terms, if the scope changes; the five D-6 items, each stated in words,
    one by one, in the user's own words rather than returned shapes; and
    both usage windows read afresh, each with its utilisation and an
    absolute reset time;
  - a separate explicit approval.
- **Open decisions, new:** the identifier form for gaps (prompt, index or
  both); the closure's reach to Directive 2022/2464; the harness's absolute
  paths in `execution.json`; whether `resultSha256`'s bytes are the filed
  file's.
- **Open decisions, unchanged:** the thinking-count observer; `--settings`
  as an identity input; `disableAutoMode` in `--settings`; the 190,000
  ceiling's confirmation.

## Process notes

- **Who.** A later session wrote this file. It took over from the preparing
  session with the user's handover, collected readiness items 1 to 3 in
  chat, presented the launcher, and took the operator's steps from the
  user's messages and Terminal.app paste. It did not prepare PS.
- **Write locations.** In the candidate, only this file. Outside the
  repository: five notes in the shared side-session notes folder
  (`…/side-session-notes/local_bd028995-ea7c-4967-8e66-dbcd2bb69d29/`,
  the readiness replies verbatim, the operator's paste verbatim, and the
  README path finding), and nothing in `pilot-evidence`.
- **Reads.**
  - XS, in full: `execution.json`, `attempts.jsonl`, `launches.jsonl`, the
    gate stream, the five role streams, the transcript and the result
    through `python3 -I` scripts, and `requirement-versions/csrd.json` in
    part;
  - PS's manifests, `README.md`, `HANDOVER.md`, `run-capture.sh`, the
    inputs log, and `capture-binding.ts` and `capture-lib.ts` by search;
  - the committed candidate's code by search and short reads:
    `prosecutors.ts`, `orchestrate.ts`, `gaps.ts`, `entitlement.ts`,
    `claude-code-cli.ts`, `live-capture.ts`, `included-usage.ts`, the two
    prompts, `corpus/index.json`;
  - the shared root, by name; X's, X3's and XR's `execution.json` for
    `adapter`, `status` and `usageStop` only;
  - the rehearsal checkpoint, in full, for its form.

  The frozen first package was not read beyond its launcher's digest.
- **What ran.** Hashing, listing, `stat` under `TZ=UTC`,
  `git --no-optional-locks` queries, and Python scripts (`python3 -I`,
  standard library only) that read XS and compared digests. No Claude Code,
  `ollama` or Node binary ran, and no test, network or subagent was used.
- **b1b-record.** This session ran no command in it and read nothing from
  it.
- **Logs.** None were filed; every check above can be re-run from its
  description.
