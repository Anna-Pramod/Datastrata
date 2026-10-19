# Checkpoint — the fourth genuine `CSRD-S-002` capture on `claude-code-cli@3`: nine role launches, completed, schema valid, evidence validation failed on two sets naming four nonexistent edge ids, on `7459f48`

Written on 2026-10-19 (+0530 and UTC) by the session that collected readiness,
observed the launch and read the sealed record after the run — from the r4
package's HANDOVER, the shared notes (the r4 readiness note, the slot session's
worksheet, tooling and memo), the user's pasted Terminal.app session and its
own read-only reading of the record — in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD
`7459f481c4a0fca1ddfd62ed92bf5bc1870b11a3`, the v4 delivery instruction). Every
time below is UTC.

- **Scope of this change.** This file. No code changed in this commit. It is
  committed alone, before the parked loader-fallback follow-up
  (`refuse-unknown-prompt-set-version.patch`, applied only after this file is
  on record, by the plan in the shared notes), so the record of r4 is on file
  at the HEAD it ran against. Nothing is committed by the session: the user
  runs every `git add` and `git commit`.
- **Where the evidence is.**
  - **P4**: the r4 package
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-19-opus55-v3-s002-capture-prep-r4/`
    (`README.md`, `HANDOVER.md`), manifest `049629c2…` (20 entries),
    `offline-checks` `323fd0eb…` (13), launcher `run-capture.sh`
    `592f18ae…`, token `opus55-v3-csrd-s002-one-gate-nine-launches-r4`.
  - **XS4**: the execution
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T090314Z-b34711/`,
    the committed harness's own record, beside r1's XS
    (`20261018T121625Z-2d4de0`), r2's XS2 (`20261018T164607Z-2d0d2e`), r3's
    XS3 (`20261018T191012Z-28543c`), r2's and r3's kept claim markers and
    P4's own, `claim.opus55-v3-csrd-s002-one-gate-nine-launches-r4` (an empty
    directory stamped 2026-10-19T09:03:14Z).
- **Unchanged.** Neither P4 nor XS4 was written after the run: P4's newest
  file is from 2026-10-18T20:47:32Z and both of its manifests verify after the
  run; XS4's manifest is its newest file (2026-10-19T09:12:33Z) and no entry
  under `pilot-evidence/` is newer than the seal. XS (12 of 12, `35268592…`),
  XS2 (14 of 14, `2e318748…`) and XS3 (7 of 7, `e2c458e3…`) re-verified by
  this session with `shasum -a 256 -c`, present equal to listed, before and
  after the reads.
- **Nothing further is on file.** The shared root holds X, X3, XR, XS, XS2,
  XS3 and XS4 (121 entries including the root, no symbolic link). Nothing
  further live is authorised.
- **Offline.** This session executed no Claude Code and no `ollama`, used no
  network and no subagent, and wrote nothing under `pilot-evidence/`. Node
  ran offline: the candidate's own `tsx` for the slot's
  `revalidate-execution.mts` over the record. No command was run in
  `b1b-record`.

## The outcome

The letter after each item names its class of evidence (A the operator's
word, B the CLI's word about itself, C established without either).

- **The run.** The operator ran P4's hash-bound launcher once, in
  Terminal.app, and it ended with `status: completed`, `evidence: sealed by
  the manifest`, exit 0 (A). The execution ran from 2026-10-19T09:03:14.806Z
  to 09:12:33.303Z, 9 min 18.5 s (C1).
- **The gate passed** (`gate.pass true`, no reason; C1).
- **Launches.** Nine role launches and one gate launch; every role completed
  (reader, seven prosecutors, the adjudicator); the run was not cancelled
  (`cancelled false`, `cancellationReason null`) and `status` is `completed`
  (C1).
- **The delivery channel under v4.** All nine role answers arrived through
  one `StructuredOutput` call each: every stream ends `stop_reason tool_use`,
  `terminal_reason completed`, result `success` with `is_error false`, and no
  stream carries the CLI's `[structured-output-enforce]` message (B, C2:
  `streams-summary.py`). Three roles also wrote a short text block beside
  the tool call — prosecutor[0] 1,443 characters (`42e212dd…`),
  prosecutor[2] 1,716 (`d1620361…`), the adjudicator 2,119 (`f67d3626…`),
  none of them a JSON fence — which the committed projection accepts
  (exactly one `tool_use` and one `tool_result` per stream). r3 saw one text
  answer in two role launches under v3; r2 none in nine under v2. This is the
  fact the v4 instruction was written to move; one run, not a guarantee.
- **The reader.** 17 elements (`E1-operative-obligation` to
  `E17-deemed-compliance`), 0 gaps, 28 quotes, every one at its document's
  pin (23 at `8822d68a…` for `DOC-32013L0034`, 5 at `c228f7b1…` for
  `DOC-32026L0470`), plus one `amendment_chain` and one `cross_reference`
  evidence item; its seam (schema, evidence rule, quote pins) passed, since
  prosecutor[0] launched (C1); the slot's `revalidate-execution.mts` re-ran
  the seams offline: `PASS` (C2). r3's reader had 15 elements and 25 quotes.
- **The prosecutors.** Per lens — cells, challenge ids, gaps, quotes (pins):
  `missing_criterion` 11 cells, `MC-1-annex-ii-condition`, 0 gaps, 2 quotes
  (2 at `8822d68a…`); `wrong_conjunction` 13, `C1-legal-form-conjoined-not-alternative`,
  0, 5 (4 + 1); `wrong_threshold_or_units` 8, no challenge, 0, 0;
  `wrong_measurement_period` 12, `C1-turnover-measurement-point` and
  `C2-financial-year-applicability`, 0, 7 (3 + 4);
  `wrong_scope_type_or_addressee` 11, `C1-legal-form-excludes-art1-3-addressees`
  and `C2-country-of-incorporation-proxy`, 0, 7 (6 + 1);
  `superseded_or_miscited_provision` 11,
  `C1-version-in-force-for-pre-2027-financial-years`, 0, 6 (1 + 5);
  `missing_exclusion` 13, `C1-efsf-exclusion-missing`,
  `C2-financial-holding-derogation-missing` and
  `C3-intermediate-parent-exemption-missing`, 0, 7 (5 + 2). Ten challenges,
  34 quotes, every seam (schema, coverage against the reader's 17 element ids
  and the condition paths `all[0]`–`all[4]`, `root`; quote pins) `PASS` (C2);
  no gap halted the run (C1).
- **The adjudicator.** Launch 10 happened — the first time under a schema
  carrying `pattern` — and its request was accepted for the supplied schema
  (B). 10 adjudications bound to the ten qualified challenge ids
  (`P0-MC-1-annex-ii-condition` … `P6-C3-intermediate-parent-exemption-missing`),
  verdicts `MISMATCH` 7 and `OPEN_QUESTION` 3, 0 gaps, 33 quotes (21 + 12)
  and 2 absence items; the seam (schema, binding to the qualified ids, quote
  pins) `PASS` (C2).
- **Assembly.** `assertResultConsistency` passed (`schemaValidity valid`);
  the transcript and `verification-result.json` were written; `runId`
  `run-v1-e33b9074a3e89ed47e6360582c1e7828303fe9e93065295bde69a7260797f2eb`,
  equal to the offline measurement; the harness printed `gaps: none` and
  `resultSha256 7b5fe17c…` (C1).
- **Filed record.** `usageStop null` (no reset hold for a later package);
  trust: execution `completed` / schema `valid` / **evidence `failed`** /
  substantive `unassessed` (C1). The evidence check (`checkResultEvidence`,
  the signing gate's own `checkEvidenceSet` over 37 evidence sets) passed 35
  and failed 2, both in the reader's non-quote evidence: `E9-amendment-chain`
  (three hops naming edges the corpus does not hold:
  `DOC-32026L0470:Art2(5)(a)->DOC-32013L0034:Art29a(1)-sub1`,
  `DOC-32026L0470:Art2(5)(a)-replacement-text`,
  `DOC-32013L0034:M8-consolidation-Art29a(1)`) and
  `E16-threshold-inflation-review` (one edge,
  `DOC-32013L0034:Art3(13)(b)->DOC-32013L0034:Art29a(1)-sub1`). All 20
  challenge evidence sets passed. Every quote in the record passed; what
  failed is edge naming, which no seam checks before spend.
- **P4 is spent.** Its claim marker exists under the case (A6 refuses a
  second start); the case now holds XS, XS2, XS3, XS4 and three markers.

## The execution, bound by hash

- `MANIFEST.sha256`: `e435e42d67265643d9b1287cdbdc12128a8378f239d09edc4669b4f2a8dffedf`,
  16 entries, every one verified by this session (`exec-summary.py`: 16 of 16
  OK, mismatched none, missing none, unlisted none, none newer than the
  manifest; present equal to listed by an independent `find`).

  | File | bytes | sha256 |
  |---|---|---|
  | `execution.json` | 23,061 | `1401607d…` |
  | `attempts.jsonl` | 5,543 | `2df8fd08…` |
  | `launches.jsonl` | 63,031 | `53ee450a…` |
  | `streams/gate-launch1.sanitised.jsonl` | 346 | `51dfc1d2…` (byte-identical to r3's gate stream) |
  | `streams/role-reader[0]-launch2.sanitised.jsonl` | 651,634 | `d6b50176…` |
  | `streams/role-prosecutor[0]-launch3.sanitised.jsonl` | 186,318 | `a08811a6…` |
  | `streams/role-prosecutor[1]-launch4.sanitised.jsonl` | 235,492 | `110f4bb8…` |
  | `streams/role-prosecutor[2]-launch5.sanitised.jsonl` | 94,611 | `5970c3dd…` |
  | `streams/role-prosecutor[3]-launch6.sanitised.jsonl` | 274,608 | `d0cfb651…` |
  | `streams/role-prosecutor[4]-launch7.sanitised.jsonl` | 298,833 | `922701ba…` |
  | `streams/role-prosecutor[5]-launch8.sanitised.jsonl` | 265,677 | `cdf79a9e…` |
  | `streams/role-prosecutor[6]-launch9.sanitised.jsonl` | 319,007 | `22435d93…` |
  | `streams/role-adjudicator[0]-launch10.sanitised.jsonl` | 833,112 | `2f7c854a…` |
  | `transcript/csrd/CSRD-S-002/run-v1-e33b9074….json` | 4,164,918 | `4e04fa3d…` |
  | `verification/csrd/CSRD-S-002/verification-result.json` | 72,454 | `9f129fcd…` (the harness's `resultSha256` for its content: `7b5fe17c…`) |
  | `verification/requirement-versions/csrd.json` | 4,128 | `b3972156…` (the engine's) |

- **The package as run.** P4's manifests, `049629c2…` (20 of 20) and
  `323fd0eb…` (13 of 13), verify after the run; `run-capture.sh` hashes to
  `592f18ae…`, the digest the one-liner in the user's Terminal.app session
  compared it with before running it (the paste shows the one-liner verbatim
  from the r4 note).

## Three kinds of evidence

### A. The operator's steps

- **The reviewer's final binding check.** The slot session's worksheet
  (`2026-10-18T2112Z-slot-task2-reviewer-worksheet/REVIEWER-WORKSHEET-r4.md`,
  254 lines, 254 MATCH, 0 MISMATCH: `EXPECTED_HEAD`, the 35 engine digests at
  HEAD and in the working tree, the token and the claim name, every
  `REVIEWED_INPUTS` field against a fresh measurement and the logged one, the
  four anchored digests, the launcher digest, the test literals, r3's record
  digests, 37 launcher checks, 108 tests on a copy) was handed over at the
  start of the day. The verdict, user-confirmed, pasted into the session at
  2026-10-19T08:36:51Z: "The independent reviewer completed r4's binding review: no blocking
  issue for one capture running alone. HEAD, all 35 engine bindings, both
  manifests, the launcher and preserved executions match. Implementation and
  package review are closed." At 09:03:46Z: "The reviewer accepts the r4
  preflight."
- **The pre-flight (item 4).** Run from a Terminal.app login shell, stage A
  at 2026-10-19T08:37:27.528Z, pasted into the session (received
  08:38:37Z) with `echo "exit $?"` → `exit 64`. Compared line by line with
  P4's logged in-session pre-flight (same code, same HEAD): the only
  differences were the in-session environment refusals absent from the
  operator's shell, the two refusal counts and the stage A timestamp.
  Confirmed, every one: `binding: 1 refusal(s)` (`ReviewedEnvironmentMismatch`,
  the five variables unset, P4's token named; no
  `ClaudeCodeSessionEnvironment`, `NodeEnvironmentInherited` or
  `NotTerminalApp` refusal); `code binding: passed`; `stage A … 0 refusal(s)`,
  all thirteen rules evaluated (`ExecutionAlreadyFiled` passing over XS, XS2,
  XS3 and the two markers; `ResetHoldPending` holding nothing); `runId
  run-v1-e33b9074…`; `pipelineVersion pipeline-v3-f13257de…`; closure pin
  `d1b110be…`, rendered 406,430 B `496a4342…`; `requirementInputSha256
  fecc5050…`; `renderedConditionSha256 a47f2f38…`; prompts reader 5,960 B
  `3aa48bfd…`, prosecutor 8,578 B `92556391…`, adjudicator 7,531 B
  `a134ce8e…`; schemas 2,276 B `7eef02e9…`, 2,759 B `f4c4a29a…`, 2,379 B
  `13a14130…`; reader user message 406,585 B `9eb8a24b…`; launch description
  423,948 B `25cea29f…`; sections {Requirement 33, Where to look 31, Entitled
  closure 406517}; budgets 9 of 9, 2097152, 20971520, 1800000, 60000,
  16470000, 64000, 190000; exit 64; nothing created or launched.
- **Readiness items 1–3 and 5**, user-confirmed, pasted into the session at
  2026-10-19T08:36:51Z. Verbatim:

  > The independent reviewer completed r4's binding review: no blocking issue for one capture running alone. HEAD, all 35 engine bindings, both manifests, the launcher and preserved executions match. Implementation and package review are closed.
  > Carry forward my existing data-use and account-control confirmations; ask only about changes.
  > Remaining readiness:
  >
  > * Five-hour usage: 13% used; resets in 4 hours 30 mins.
  > * Seven-day usage: 4% used; resets at 5.30am IST on wednesday.
  > * Changes to previously confirmed conditions: none
  > * I accept that a text-channel answer can still fail the capture without retry or salvage, and that adjudicator-schema compatibility and native constrained decoding remain unproven.
  > * No other capture will run concurrently.
  >
  > I will provide the complete r4 Terminal preflight output and its immediate exit code. After readiness passes, present the reviewed launcher for my separate explicit approval. Do not execute it.

  And at 09:03:46Z — after the launcher had been presented — resolving the
  two usage readings the session had queried, which were still outstanding
  when the launcher was presented:

  > The reviewer accepts the r4 preflight. Please resolve these readings before closing readiness or asking me to execute:
  >
  > * Current five-hour usage: 16%.
  > * Five-hour reset: time derived is confirmed.
  > * Current seven-day usage for the same account and weekly window used previously: confirmed as you mentioned.
  > * Seven-day reset: confirmed as you mentioned..
  > * Explanation for the reported 4% versus the earlier 75%: limit reset
  >
  > Keep my existing confirmations and risk acknowledgements on record. This message supplies readiness evidence only; it does not approve execution.

  Items 1 and 2 — r2's data-use approval (open decision 20) and the five D-6
  sentences — were carried forward by the user's 2026-10-19 instruction (ask
  only about changes and fresh evidence) and are user-confirmed unchanged
  ("Changes to previously confirmed conditions: none"; "Keep my existing
  confirmations and risk acknowledgements on record"). Item 3: five-hour 13%
  at 08:36Z and 16% at 09:03Z, resetting "in 4 hours 30 mins" (the session's
  derivation, about 13:06Z, confirmed by the user; the CLI's own `resetsAt`
  in the record is 1792414800 = 2026-10-19T13:00:00Z = 18:30 IST); seven-day
  4%, resetting 05:30 IST Wednesday = 2026-10-21T00:00Z (the CLI's
  `resetsAt` 1792540800, the same instant r3 recorded); the drop from r3's
  75–76% at the same reset time explained by the user as "limit reset". Item
  5: the user-confirmed acknowledgement of the delivery-channel risk and of
  the compatibility limitation, as pasted above.
- **The launch — the actual chronology.** At about 08:41Z, with items 1–5
  in hand but the usage clarification still outstanding (the seven-day
  reading of 4% against r3's 75–76% at the same reset time, and the derived
  five-hour reset time, both queried and unanswered), the session presented
  the launcher one-liner verbatim for a separate explicit approval that it
  did not have. At 09:03:14Z the execution directory
  `20261019T090314Z-b34711` and P4's marker were created: the launch. At
  09:03:46Z the user's message resolving the two readings arrived, stating
  that it "does not approve execution", and the session's re-verification
  at that minute found the launch already made. At 09:40:37Z the report
  paste arrived, showing the launch as the user's own command in their
  Terminal.app shell, entered after the pre-flight: the one-liner verbatim
  from the r4 note, which checked `run-capture.sh` against `592f18ae…` and
  ran it. No approval statement preceded the launch and none is recorded;
  no later message is read as one. The session did not run the launcher
  (every command it ran was a read, or a write into its scratchpad and the
  shared notes folder). The session saw the case directory once more,
  read-only, after the paste (XS, XS2, XS3, XS4, the three markers) and did
  not poll it. The report lines, verbatim:

  > capturing CSRD-S-002 on claude-code-cli@3 through the committed harness (--permission-mode default requested): one gate, at most 9 role launches (reader[0], prosecutor[0], prosecutor[1], prosecutor[2], prosecutor[3], prosecutor[4], prosecutor[5], prosecutor[6], adjudicator[0]), launch budget 9, admission 2097152 bytes, output bound 20971520 bytes (the transport's default), lifetime 16470000 ms, evidence under $HOME/Documents/DataStrata/pilot-evidence/subscription-executions
  > status: completed
  > evidence: sealed by the manifest
  > execution: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T090314Z-b34711
  > gate: pass
  > role launches: 9; gate launches: 1; ledger possibly billed: 9; HTTP attempts: unknown
  > cancelled: false; interrupted by: none
  > terminationUnconfirmed: false; resultWithheld: false
  > error: none
  > usage stop: none
  > rate-limit events: 9; thinking count as the harness reads it: [null,null,null,null,null,null,null,null,null] (the committed observeStream reads result.usage.thinking_tokens, which 2.1.295 does not write; the figure 2.1.295 writes is result.usage.output_tokens_details.thinking_tokens (also on message_delta and under modelUsage), kept raw in cliObserved.reportedUsage; deferred, not repaired)
  > trust: execution completed; schema valid; evidence failed; substantive unassessed
  > runId: run-v1-e33b9074a3e89ed47e6360582c1e7828303fe9e93065295bde69a7260797f2eb (equals the offline measurement)
  > transcript: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T090314Z-b34711/transcript/csrd/CSRD-S-002/run-v1-e33b9074a3e89ed47e6360582c1e7828303fe9e93065295bde69a7260797f2eb.json
  > result: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T090314Z-b34711/verification/csrd/CSRD-S-002/verification-result.json
  > summary: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T090314Z-b34711/execution.json
  > manifest: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T090314Z-b34711/MANIFEST.sha256 (16 entries, sha256 e435e42d67265643d9b1287cdbdc12128a8378f239d09edc4669b4f2a8dffedf)
  > exit 0  USER=vivin  HOME=/Users/vivin
- **What nothing here checks.** No code can check the account settings; A3
  passed at run time (the run started; the entry refuses otherwise) and the
  managed-settings location was absent at readiness. The CLI's overage fields
  (B: `overageStatus "rejected"`, `overageDisabledReason
  "org_level_disabled"`, `isUsingOverage false` on all nine events) are
  consistent with extra usage being off and prove none of D-6.

### B. CLI-reported facts

**The gate**: `loggedIn` true, `authMethod "claude.ai"`, `apiProvider
"firstParty"`, `subscriptionType "max"`, `analyticsDisabled` true,
`apiKeySource` and `forcedLoginMethod` absent, the identifiers present and
never reproduced; the stream byte-identical to the earlier gates'
`51dfc1d2…`.

**The init events**, line 1 of each of the nine role streams: `permissionMode
"default"`, `model claude-opus-5-5`, `claude_code_version 2.1.295`, `tools
["StructuredOutput"]`, `fast_mode_state "off"`, `analytics_disabled` true,
`per_turn_effort_active` true, `output_style "default"` — identical for every
launch.

**The streams.** Per stream (lines; blocks; deltas; stop; result):
reader[0] 2,285 lines, `thinking` then `tool_use(StructuredOutput)`, 2,229
`input_json_delta`; prosecutor[0] 607, `text` + `thinking` +
`tool_use`, 462 `input_json_delta` and 92 `text_delta`; prosecutor[1] 800,
`thinking` + `tool_use`, 762; prosecutor[2] 304, `text` + `thinking` +
`tool_use`, 150 and 119 `text_delta`; prosecutor[3] 930, `thinking` +
`tool_use`, 886; prosecutor[4] 998, 936; prosecutor[5] 872, 808;
prosecutor[6] 1,078, 1,026; adjudicator[0] 2,846, `text` + `thinking` +
`tool_use`, 2,588 and 130 `text_delta`. Every stream: one `tool_result`
user message, no enforce message, `stop_reason tool_use`, result `success`,
`is_error false`, `num_turns 2`, `permission_denials 0`, one distinct
request id (21 request-id occurrences, 9 distinct across the run).

**The usage the CLI reported** (`result.usage`):

| | reader | pros[0] | pros[1] | pros[2] | pros[3] | pros[4] | pros[5] | pros[6] | adj |
|---|---|---|---|---|---|---|---|---|---|
| `cache_creation_input_tokens` | 133,188 | 141,659 | 137,005 | 137,007 | 137,006 | 137,010 | 137,009 | 137,004 | 156,825 |
| `cache_read_input_tokens` | 0 | 0 | 4,655 | 4,655 | 4,655 | 4,655 | 4,655 | 4,655 | 0 |
| `output_tokens` | 8,961 | 4,030 | 3,740 | 2,226 | 4,536 | 5,586 | 5,448 | 5,424 | 15,233 |
| `output_tokens_details.thinking_tokens` | 2,561 | 2,162 | 1,477 | 1,032 | 1,979 | 2,888 | 3,086 | 2,521 | 7,135 |
| per-request context (input 2 + creation + read) | 133,190 | 141,661 | 141,662 | 141,664 | 141,663 | 141,667 | 141,666 | 141,661 | 156,827 |
| `duration_ms` | 85,834 | 38,083 | 52,469 | 21,198 | 52,673 | 62,476 | 53,023 | 52,101 | 137,459 |
| `total_cost_usd` (list) | 1.244732 | 1.213880 | 1.171779 | 1.141515 | 1.187707 | 1.208739 | 1.205971 | 1.205451 | 1.559268 |

Totals: cache creation 1,253,713; cache read 27,930; input 18; output 55,184
(thinking 24,841); list-price sum 11.139042 USD, the CLI's own figure. The
largest per-request context, the adjudicator's 156,827, sits 33,173 under
the 190,000 ceiling (the r4 README estimated about 157,700). (r3 for
comparison: reader 133,104 / 0 / 8,309 / 2,682 / 133,106 / 89,669 /
1.231020; prosecutor[0] 140,715 / 0 / 4,823 / 2,395 / 140,717 / 46,224 /
1.222188.)

**The `rate_limit_event`**, one per stream: `status "allowed"`,
`rateLimitType "five_hour"`, `resetsAt 1792414800` (2026-10-19T13:00:00Z),
`overageStatus "rejected"`, `overageDisabledReason "org_level_disabled"`,
`isUsingOverage false`; `unifiedWindows.five_hour.utilization` after each
launch 0.18, 0.20, 0.21, 0.22, 0.23, 0.24, 0.25, 0.26, 0.28 (reset
2026-10-19T13:00:00Z); `seven_day` 0.04 after the reader, 0.05 from the first
prosecutor on (reset 1792540800 = 2026-10-21T00:00:00Z). No reset fell
inside the run.

### C. Independently checked evidence

#### C1. Recorded by the harness's and the package's own code at run time

- `synthetic` false; pin `2.1.295`, 239,695,888 bytes, `494870c9…`, not
  injected; `requested.permissionMode "default"`, effort `high`,
  `maxOutputTokens` 64,000, settings from the profile
  (`switchModelsOnFlag false, fastMode false, autoContinueAtUsageLimit
  false`), `permittedModels ["claude-opus-5-5"]`; budgets as reviewed (9
  attempts, 2,097,152 bytes per attempt, launch 1,800,000 ms, gate 60,000
  ms, lifetime 16,470,000 ms, `deadlineMs` 16,470,000), confirmed from
  `execution.json`.
- Per launch (pid, exit, duration ms, stdout bytes, stderr bytes, prompt
  file bytes, stdin bytes; every prompt file removed afterwards): gate 85066,
  0, 118, 382, 0, —, 0; reader 85071, 0, 86,007, 770,514, 0, 5,960, 406,585;
  prosecutor[0] 85185, 0, 38,262, 217,942, 0, 8,578, 425,599; [1] 85210, 0,
  52,640, 277,152, 0, 8,578, 425,599; [2] 85264, 0, 21,362, 110,479, 0,
  8,578, 425,606; [3] 85283, 0, 52,837, 323,028, 0, 8,578, 425,606; [4]
  85315, 0, 62,643, 350,789, 0, 8,578, 425,611; [5] 85344, 0, 53,197,
  311,081, 0, 8,578, 425,614; [6] 85373, 0, 52,269, 375,123, 0, 8,578,
  425,599; adjudicator 85399, 0, 137,624, 981,164, 0, 7,531, 464,756. The
  prompt files are the v4 files by size. Role launches account for 556.8 s
  of the 558.5 s run.
- Attempts: nine, every one `completed`, channel `process`, `sent true`,
  `possiblyBilled true`, usage from the CLI's result; the ledger: 9 of 9
  attempts used, 0 remaining, largest launch description 487,470 B against
  2,097,152, known input 18 and output 55,184 tokens, 0 unknown-usage
  attempts, `httpAttemptsObserved null`, 9 launches started.
- Times: started 09:03:14.806Z, drained 09:12:33.034Z, finished
  09:12:33.303Z; no reset fell inside the run (five-hour reset 13:00Z).
- `error null`, `cancelled false`, `cancellationReason null`,
  `interruptedBy null`, `terminationUnconfirmed false`, `resultWithheld
  false`, `unsentEvents 0`, `recordsWritten 9`, `exitCode 0`,
  `transcriptPath` and `resultPath` the two files above, `runId
  run-v1-e33b9074…`.
- The package: claim marker made before the harness (09:03:14Z, the same
  second as the execution directory); the harness's execution directory
  sealed afterwards (16 entries). The report does not print `caseEntries`;
  the case directory observed by this session holds the new directory and
  the new marker beside the five earlier entries and nothing else.

#### C2. Checked by this session afterwards, offline

- **Manifests.** XS4's 16 entries verify, present equal to listed, none
  newer than the manifest (`exec-summary.py`, and `shasum -a 256 -c` with an
  independent `find`). P4's two manifests verify after the run (20 of 20,
  13 of 13; newest file 2026-10-18T20:47:32Z). XS, XS2 and XS3 verify (12,
  14, 7).
- **Candidate.** HEAD `7459f48`, the two `node_modules` symlinks the only
  untracked entries, tracked contents equal to HEAD, confirmed at
  09:43:46Z, before this file was written.
- **The mode, three ways, per launch:** argv `--permission-mode default`
  (with `--model claude-opus-5-5`, `--effort high`, `--output-format
  stream-json`, `--json-schema` present; 25 argv items; the thirteen
  control names of the `@3` profile plus `HOME`, `PATH`, `USER`, sixteen names), init
  `"default"`, record `requested.permissionMode "default"` — confirmed from
  `streams-summary.py`'s launches view for all nine.
- **Every recorded role output through the committed seams**
  (`revalidate-execution.mts`, the slot's tool, over XS4, exit 0): the
  world's closure `d1b110be…`, documents `DOC-32013L0034@8822d68a` and
  `DOC-32026L0470@c228f7b1`, condition paths `all[0]`–`all[4]` and `root`;
  the record's registry copy `b3972156…` equal to the engine's; the
  transcript's pins (`pipelineVersion pipeline-v3-f13257de…`,
  `requirementInput fecc5050…`, `renderedCondition a47f2f38…`,
  `corpusClosure d1b110be…`) equal to the world's; reader[0] `PASS`
  (elements 17, gaps 0, quotes 28, pins 23 + 5); prosecutor[0]–[6] `PASS`
  with the cells, challenges, quotes and pins listed above; adjudicator[0]
  `PASS` (adjudications 10, `MISMATCH` 7, `OPEN_QUESTION` 3, quotes 33, pins
  21 + 12); the four negative controls on prosecutor[0]'s recorded output (a
  hash one character off, a `docId` outside the closure, a bogus
  `conditionPath`, an empty hash) each refused with `RoleOutputError`;
  `summary: outputs=9 passed=9 refused=0 none=0 controls=4/4`. The tool's own
  teeth (21 checks: XS3 reproducing the r3 figures, a mutated copy refused at
  `quote-pins`, prose after a fence read as no output) are logged with the
  tool.
- **Personal strings.** `vivin` and `/Users/` occur in no file of XS4 except
  `execution.json`, where the harness's own `transcriptPath`, `resultPath`
  and its printed `Wrote …` line carry absolute paths (the known residual,
  carried since r1); `[REDACTED]` under `session_id` and `uuid` on every line
  of the nine role streams; the transcript and the result carry neither
  string.
- **The shared root.** `csrd/CSRD-S-002` holds XS, XS2, XS3, XS4 and the
  three markers; a later package's A6 would pass over XS4, which holds
  `execution.json` and `MANIFEST.sha256`; A7 reads its status `completed`
  and `usageStop null`.
- **No role text was read.** The three tools print counts, identifiers and
  digests only; every log was checked to carry no law text.

## What ran, in order

The gate (118 ms, pass); the committed `@3` projection on nine real streams,
each accepted (exactly one `StructuredOutput` call, one `tool_result`, the
restatement, usage from a `success` result); the reader's seams (schema,
evidence rule, quote pins) passed and prosecutor[0] launched; each
prosecutor's seams (schema, coverage, quote pins) passed and the next
launched; no gap at any lens; ten qualified challenges carried to the
adjudicator; launch 10 accepted for the adjudicator's schema with `pattern`;
the adjudicator's seams (schema, binding, quote pins) passed; assembly
(`assertResultConsistency`) passed and wrote the transcript and the result;
`checkResultEvidence` judged 37 evidence sets, 35 passing and 2 failing on
corpus edges; the harness filed `execution.json` with trust `evidence
failed`, sealed 16 entries under `MANIFEST.sha256` at 09:12:33Z; exit 0.

## Retries and spend

Nine runner attempts, nine role processes and one gate process; both retry
controls were zero (`CLAUDE_CODE_MAX_RETRIES=0`,
`MAX_STRUCTURED_OUTPUT_RETRIES=0`); internal HTTP attempts unobserved. Billing
not proven: nine possibly billed attempts, list-price sum 11.139042 USD by
the CLI's own figures. Tokens: 18 input, 1,253,713 cache creation, 27,930
cache read, 55,184 output (24,841 thinking). The five-hour window moved from
16% (the user's reading at 09:03Z, before the run) through 0.18 after the
reader to 0.28 after the adjudicator (the CLI's readings), 0.12 for the
run, against the readiness estimate of about 0.10; the seven-day window from
0.04 to 0.05.

## What this capture settled

- **Whether an instruction that names the tool changes the delivery
  behaviour.** Nine of nine role launches called `StructuredOutput` under v4
  (r2: nine of nine under v2; r3: one of two under v3). One run; not a
  guarantee. No role answered in text; three wrote a short text block beside
  the tool call, which the committed checks accept and the record keeps.
- **Compatibility, as far as it goes.** All nine requests were accepted for
  schemas carrying the 64-hex `pattern`; the adjudicator's schema was sent
  for the first time and accepted. Still not established: native constrained
  decoding (the build's native structured-output gate stays off; the tool's
  schema is what was enforced).
- **The quote-hash contract on real inputs beyond the reader.** 95 quotes
  across the nine outputs (28 + 34 + 33), every one at its document's pin;
  no role failed the hash contract at its seam; the four negative controls
  still refuse.
- **The gap-versus-challenge behaviour under v4.** No gap at any lens;
  every objection went as a challenge (ten), so the run reached adjudication
  (r1 halted at the fourth lens; r2 carried its objections as challenges).
- **Assembly, the record boundary and the dossier.** Reached: the result and
  the transcript were written, the registry copy equals the engine's, the
  pins equal the world's. The record boundary's evidence check failed on the
  reader's two non-quote evidence items, which name four edges the corpus
  does not hold; **nothing before that boundary checks edges** — the seams
  check quotes (docId, hash), coverage and adjudication binding — so the
  nine launches were spent before the failure was found, as r2's were
  before the empty-hash failure. The dossier stands as a completed, schema-
  valid result whose evidence the signing gate would refuse at those two
  sets; promotion and signing are separate, unauthorised steps.
- **Substantive correctness is not established by any of this.**

## Carried forward

- **Still unobserved:** billing; HTTP attempts; whether `--effort high` was
  applied; native constrained decoding; substantive correctness of every
  element, cell, challenge and verdict; the thinking count through the
  committed observer (the figure 2.1.295 writes is kept raw).
- **Open decisions:** the evidence-edge contract — whether an edge named by
  a role is checked at its seam before the next launch (as the quote-pin
  seam checks quotes), whether the engine derives or validates edges from
  the corpus instead of asking the model for them (the quote-hash question's
  twin), or whether the corpus should hold the four edges the reader named;
  the engine filling the quote hash itself (r2 open decision 2, undecided);
  the adjudicator's seven `MISMATCH` and three `OPEN_QUESTION` verdicts on
  S-002's encoding, for the requirement author; the thinking-count observer;
  the harness's absolute paths; the 190,000 ceiling's confirmation (the
  adjudicator used 156,827).
- **The package's residuals,** unchanged (tsx, zod and Node not
  digest-bound; `capture.ts` never executed before the run; a marker an
  operator could remove by hand; the main checkout's root not read).

## Decisions recorded

1. **Capture first, checkpoint after; the checkpoint alone**, before the
   loader-fallback follow-up, so the record of r4 sits at the HEAD it ran
   against.
2. **r2's data-use approval (open decision 20) and the five D-6 sentences
   carried forward** by the user's 2026-10-19 instruction and user-confirmed
   unchanged ("Changes to previously confirmed conditions: none").
3. **The usage reading recorded as given** (item 3), with the CLI's own
   reset times beside it; the seven-day drop recorded with the user's
   explanation ("limit reset").
4. **The review verdict recorded:** "no blocking issue for one capture
   running alone … Implementation and package review are closed"; "The
   reviewer accepts the r4 preflight."
5. **The two limitations acknowledged, user-confirmed, before the launch**
   (item 5): the delivery channel and the adjudicator-schema compatibility.
6. **No relaunch.** P4 is spent; the marker and A6 enforce it.
7. **Retries stay at zero.** No role answered in text, so the decision memo's
   options are not triggered by this run.
8. **The strict tool-output checks are kept;** no salvage of fenced text from
   a failed launch; no schema or spend-control change; confirmed by this run.
9. **What the record showed and what follows from it.** The record shows
   nine tool calls, every seam passed, assembly written, and the evidence
   check failed on four corpus edges named by the reader's non-quote
   evidence. What follows — an edge seam, engine-derived edges, or corpus
   edges — is the user's decision; nothing is decided here.
10. **The loader-fallback follow-up is applied only after this file is
    committed**, by the apply plan in the shared notes (test hunk first, red
    read, loader hunk, green, one commit with the agreed subject).
11. **No live execution without the user's separate approval** stays the
    rule. The r4 launch ran by the user's own hand in Terminal.app while the
    usage clarification was still outstanding and before any approval
    statement reached the session; none is recorded, and the record states
    the chronology as it happened.

## Handed forward

- **The loader-fallback follow-up** (`UnknownPromptSetVersionError`): the
  next commit after this one; the plan and its expected red and green are in
  `2026-10-18T2130Z-slot-task4-loader-fallback-apply-plan.md`.
- **The evidence-edge contract**, the open decision above: the user's
  choice, then a red-first engine change and a new package bound to the HEAD
  at that time, if a change is made.
- **The dossier's standing.** XS4's result is completed and schema-valid
  with its evidence check failed at two reader sets; promotion and signing
  are separate, unauthorised steps; the requirement author's reading of the
  ten verdicts and of the four named edges.
- **The shared hold root** stays the execution root, now holding seven
  records (X, X3, XR, XS, XS2, XS3, XS4), none holding (`usageStop null`
  everywhere a status is read).
- **A future live run needs,** as before: a new reviewed package bound to the
  HEAD at that time; the readiness step afresh; a separate approval.

## Process notes

- **Who.** The session started on 2026-10-19 from the r4 return task: it
  re-verified the package and the candidate (08:05Z), handed over the
  reviewer's worksheet, collected the user-confirmed verdict and readiness
  items 1–5 (08:36Z–08:38Z), presented the launcher for the user's separate
  approval at about 08:41Z with the usage clarification still outstanding,
  received that clarification and observed the launch already made
  (09:03:46Z; the launch itself at 09:03:14Z), received the report paste
  (09:40:37Z) and read the record
  (09:41Z–09:44Z). The slot session before it (2026-10-18 21:00–21:33Z)
  prepared the reviewer's worksheet, the reading tools and the draft of this
  file offline, without the run.
- **Write locations.** In the candidate: this file (its own commit). Outside
  the repository: the session scratchpad and the shared side-session notes
  folder; nothing under `pilot-evidence/` after the run.
- **Reads.** XS4 in full through `exec-summary.py`, `streams-summary.py`
  (counts, identifiers and digests; no role text) and
  `revalidate-execution.mts`, plus a standard-library pass over
  `execution.json` for the evidence-set counts; P4's manifests and launcher;
  XS's, XS2's and XS3's manifests; the shared notes.
- **What ran.** Hashing, listing, `stat` under `TZ=UTC`, `git
  --no-optional-locks` queries, Python (standard library, `-I`) and Node
  offline through the candidate's own `tsx`. No Claude Code, no `ollama`, no
  network, no subagent, no live run by the session, no new package.
- **b1b-record.** No command, nothing read.
