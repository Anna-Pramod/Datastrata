# Checkpoint — the fifth genuine `CSRD-S-002` capture on `claude-code-cli@3`: nine role launches, completed, schema valid, evidence passed on all 39 sets, every edge reference the one listed edge, on `52aadb3`

Written on 2026-10-19 (+0530 and UTC) by the session that built and sealed the
r5 package, collected readiness, recorded the approval and read the sealed
record after the run — from the r5 package's README and HANDOVER, the shared
notes (the readiness note with the pre-flight paste, the reviewer's verdict
and the approval, the reviewer's worksheet, the post-run tooling and reading),
the user's pasted Terminal.app session and its own read-only reading of the
record — in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD
`52aadb349d951f7fc15c93020f6fa0a42dd4fba3`, the evidence-edge contract). Every
time below is UTC.

- **Scope of this change.** This file. No code changed in this commit. Nothing
  is committed by the session: the user runs every `git add` and `git commit`.
- **Where the evidence is.**
  - **P5**: the r5 package
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-19-opus55-v3-s002-capture-prep-r5/`
    (`README.md`, `HANDOVER.md`), manifest `1c85e586…` (20 entries),
    `offline-checks` `f5b67dfa…` (13), launcher `run-capture.sh`
    `602a4143…`, token `opus55-v3-csrd-s002-one-gate-nine-launches-r5`.
  - **XS5**: the execution
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T141716Z-b588bc/`,
    the committed harness's own record, beside r1's XS
    (`20261018T121625Z-2d4de0`), r2's XS2 (`20261018T164607Z-2d0d2e`), r3's
    XS3 (`20261018T191012Z-28543c`), r4's XS4 (`20261019T090314Z-b34711`),
    r2's, r3's and r4's kept claim markers and P5's own,
    `claim.opus55-v3-csrd-s002-one-gate-nine-launches-r5` (an empty
    directory stamped 2026-10-19T14:17:16Z).
  - **The shared side-session notes folder**
    `local_043075c1-dc26-44e4-b3a9-257ce611215c/`: the build scripts and the
    first measurement (`2026-10-19T1325Z-r5-package-build-scripts/`), the
    reviewer's worksheet (`2026-10-19T1330Z-r5-reviewer-worksheet/`), the
    readiness note (`2026-10-19T1342Z-r5-readiness-received.md` and its
    folder: the pre-flight paste, the comparison log, the pre-launcher
    re-verification), the post-run tooling
    (`2026-10-19T1420Z-r5-post-run-tooling/`) and the post-run reading
    (`2026-10-19T1429Z-r5-post-run-reading/`: the report paste verbatim and
    every log named below).
- **Unchanged.** Neither P5 nor XS5 was written after the run: P5's newest
  file is from 2026-10-19T13:22:28Z (the seal) and both of its manifests
  verify after the run; XS5's manifest is its newest file
  (2026-10-19T14:27:50Z) and no entry under `pilot-evidence/` is newer than
  it outside XS5; nothing under `pilot-evidence/` outside P5 changed between
  the seal and the launch. XS (12 of 12, `35268592…`), XS2 (14 of 14,
  `2e318748…`), XS3 (7 of 7, `e2c458e3…`) and XS4 (16 of 16, `e435e42d…`)
  re-verified by this session with `shasum -a 256 -c`, present equal to
  listed, before and after the reads.
- **Nothing further is on file.** The shared root holds X, X3, XR, XS, XS2,
  XS3, XS4 and XS5 (148 entries including the root, no symbolic link).
  Nothing further live is authorised.
- **Offline.** This session executed no Claude Code and no `ollama`, used no
  network and no subagent, and wrote under `pilot-evidence/` only the r5
  package, before the run; nothing after it. Node ran offline: the
  candidate's own `tsx`, `vitest` and `tsc` for the package's checks, and
  `tsx` for `revalidate-execution-r5.mts` over the sealed records, every run
  under the r5 sandbox profile with the write logger. No command was run in
  `b1b-record`.

## The outcome

The letter after each item names its class of evidence (A the operator's
word, B the CLI's word about itself, C established without either).

- **The run.** The operator ran P5's hash-bound launcher once, in
  Terminal.app, and it ended with `status: completed`, `evidence: sealed by
  the manifest`, exit 0 (A). The execution ran from 2026-10-19T14:17:16.062Z
  to 14:27:50.591Z, 10 min 34.5 s (C1).
- **The gate passed** (`gate.pass true`, no reason; C1).
- **Launches.** Nine role launches and one gate launch; every role completed
  (reader, seven prosecutors, the adjudicator); the run was not cancelled
  (`cancelled false`, `cancellationReason null`) and `status` is `completed`
  (C1).
- **The delivery channel under v5.** All nine role answers arrived through
  one `StructuredOutput` call each: every stream ends `stop_reason tool_use`,
  `terminal_reason completed`, result `success` with `is_error false`, and no
  stream carries the CLI's `[structured-output-enforce]` message (B, C2:
  `streams-summary.py`). One role, prosecutor[3], also wrote a short text
  block beside the tool call (1,741 characters, `8bfe6e63…`, not a JSON
  fence), which the committed projection accepts. r4 saw nine of nine with
  three text blocks under v4; r3 one text answer in two role launches under
  v3; r2 none in nine under v2. Four runs, not a guarantee.
- **The edge seam, live for the first time.** Every role passed the edge gate
  at its own seam. The nine outputs carry seven edge references in all —
  the reader's one `amendment_chain`, one `amendment_chain` in each of
  prosecutors [1], [4], [5] and [6], two in the adjudicator — and every one
  names `EDGE-32013L0034-amendedBy-32026L0470`, the one edge the
  `# Entitled relationships` section lists for S-002 (C2:
  `revalidate-execution-r5.mts`, `streams-summary.py`). No role composed an
  id; no output carries a `cross_reference` or an `absence` item. r4's
  reader, shown no list, had named four invented ids; r3's reader, re-run
  through the new seam offline, had named one invented id in three hops.
- **The reader.** 15 elements (`E1-addressee-and-obligation` to
  `E15-transposition-and-timing`), 0 gaps, 26 quotes, every one at its
  document's pin (19 at `8822d68a…` for `DOC-32013L0034`, 7 at `c228f7b1…`
  for `DOC-32026L0470`), plus one `amendment_chain` on the listed edge; its
  seam (schema, evidence rule, quote pins, edge references) passed, since
  prosecutor[0] launched (C1); re-run offline: `PASS` (C2). r4's reader had
  17 elements and 28 quotes; r3's 15 and 25.
- **The prosecutors.** Per lens — cells, challenge ids, gaps, quotes (pins),
  edge references: `missing_criterion` 17 cells, `MC-1-annex-ii-qualifier`
  and `MC-2-temporal-applicability`, 0 gaps, 7 quotes (3 + 4), 0;
  `wrong_conjunction` 10, `C1-legal-form-conjoined-not-alternative`, 0, 5
  (3 + 2), 1; `wrong_threshold_or_units` 10, no challenge, 0, 0, 0;
  `wrong_measurement_period` 11, `C1-turnover-no-balance-sheet-anchor` and
  `C2-no-financial-year-applicability`, 0, 8 (4 + 4), 0;
  `wrong_scope_type_or_addressee` 13,
  `C1-legal-form-gate-excludes-art1-3-financial-undertakings` and
  `C2-annex-ii-forms-conditional`, 0, 11 (9 + 2), 1;
  `superseded_or_miscited_provision` 14,
  `C1-m8-version-applied-without-temporal-standing`, 0, 6 (1 + 5), 1;
  `missing_exclusion` 16, `C1-efsf-and-financial-products-exclusion`,
  `C2-financial-holding-derogation`, `C3-intermediate-parent-exemption` and
  `C4-group-composition-derogation`, 0, 11 (9 + 2), 1. Twelve challenges,
  48 quotes, four edge references; every seam (schema, coverage against the
  reader's 15 element ids and the condition paths `all[0]`–`all[4]`, `root`;
  quote pins; edge references) `PASS` (C2); no gap halted the run (C1). r4
  raised ten challenges with 34 quotes.
- **The adjudicator.** Launch 10, the second time its schema carrying
  `pattern` was sent, accepted (B). 12 adjudications bound to the twelve
  qualified challenge ids (`P0-MC-1-annex-ii-qualifier` …
  `P6-C4-group-composition-derogation`), verdicts `CONFIRMED` 2, `MISMATCH`
  7 and `OPEN_QUESTION` 3, 0 gaps, 40 quotes (23 + 17) and two edge
  references on the listed edge; the seam (schema, binding to the qualified
  ids, quote pins, edge references) `PASS` (C2). r4's adjudicator returned
  `MISMATCH` 7 and `OPEN_QUESTION` 3 on ten challenges with 33 quotes and
  two `absence` items; r5 is the first run with a `CONFIRMED` verdict.
- **Assembly.** `assertResultConsistency` passed (`schemaValidity valid`);
  the transcript (4,214,813 B, `a7c334e7…`) and `verification-result.json`
  (85,761 B, `0a94f36c…`) were written; `runId`
  `run-v1-2c07b78cb61edaa32a407d57ba3a271bf20ba7c95f42599703626dcf04fe3c5c`,
  equal to the offline measurement; `pipelineVersion`
  `pipeline-v3-85810d540c7c5f31a7539c0419e88520a65da74f90f2858e66b91831ab6dc2fa`;
  the harness printed `gaps: none` and `resultSha256 f86a7c5e…` (C1).
- **Filed record.** `usageStop null` (no reset hold for a later package);
  trust: execution `completed` / schema `valid` / **evidence `passed`** /
  substantive `unassessed` (C1). The evidence check (`checkResultEvidence`,
  the signing gate's own `checkEvidenceSet` over 39 evidence sets: the 15
  reading elements and two sets for each of the 12 challenges) passed every
  set — the first S-002 record whose evidence the signing gate accepts. r4
  passed 35 of 37; r2 was refused at assembly.
- **P5 is spent.** Its claim marker exists under the case (A6 refuses a
  second start); the case now holds XS, XS2, XS3, XS4, XS5 and four markers.

## The execution, bound by hash

- `MANIFEST.sha256`: `cd70ae8ad33f6b770290c25429dc2f6bbe718e6b0e825455f9edda18ee6e69b0`,
  16 entries, every one verified by this session (`exec-summary.py`: 16 of
  16 OK, mismatched none, missing none, unlisted none, none newer than the
  manifest; present equal to listed by an independent `find`).

  | File | bytes | sha256 |
  |---|---|---|
  | `execution.json` | 23,155 | `8fc50848…` |
  | `attempts.jsonl` | 5,550 | `7c954294…` |
  | `launches.jsonl` | 62,631 | `f73f7b50…` |
  | `streams/gate-launch1.sanitised.jsonl` | 346 | `51dfc1d2…` (byte-identical to r3's and r4's gate streams) |
  | `streams/role-reader[0]-launch2.sanitised.jsonl` | 651,571 | `01d57b1f…` |
  | `streams/role-prosecutor[0]-launch3.sanitised.jsonl` | 321,958 | `84f69c9e…` |
  | `streams/role-prosecutor[1]-launch4.sanitised.jsonl` | 220,230 | `f1727822…` |
  | `streams/role-prosecutor[2]-launch5.sanitised.jsonl` | 72,076 | `df2ec649…` |
  | `streams/role-prosecutor[3]-launch6.sanitised.jsonl` | 324,610 | `d1d3fdd3…` |
  | `streams/role-prosecutor[4]-launch7.sanitised.jsonl` | 394,991 | `2f7f5852…` |
  | `streams/role-prosecutor[5]-launch8.sanitised.jsonl` | 263,468 | `913a0a8f…` |
  | `streams/role-prosecutor[6]-launch9.sanitised.jsonl` | 449,378 | `4a327a76…` |
  | `streams/role-adjudicator[0]-launch10.sanitised.jsonl` | 991,633 | `6c0715af…` |
  | `transcript/csrd/CSRD-S-002/run-v1-2c07b78c….json` | 4,214,813 | `a7c334e7…` |
  | `verification/csrd/CSRD-S-002/verification-result.json` | 85,761 | `0a94f36c…` (the harness's `resultSha256` for its content: `f86a7c5e…`) |
  | `verification/requirement-versions/csrd.json` | 4,128 | `b3972156…` (the engine's) |

- **The package as run.** P5's manifests, `1c85e586…` (20 of 20) and
  `f5b67dfa…` (13 of 13), verify after the run; `run-capture.sh` hashes to
  `602a4143…`, the digest the one-liner in the user's Terminal.app session
  compared it with before running it (the paste shows the one-liner verbatim
  from the README).

## Three kinds of evidence

### A. The operator's steps

- **The reviewer's final binding check.** The worksheet
  (`2026-10-19T1330Z-r5-reviewer-worksheet/REVIEWER-WORKSHEET-r5.md`,
  `fb5952d2…`, 324 rows, 324 MATCH, 0 MISMATCH: `EXPECTED_HEAD`, the branch,
  the status lines, tracked contents, the 37 engine digests at HEAD and in
  the working tree with the eleven moved and the two added entries, the
  token and the claim name, every `REVIEWED_INPUTS` field against a fresh
  measurement and the logged one, the prompt digests across the two maps,
  the four anchored digests and the launcher digest, both manifests, the
  test literals, XS4's two digests in U2-8, 37 launcher checks and 108 tests
  on a copy) was handed over at 13:3xZ. The verdict, relayed by the user and
  received 2026-10-19T14:08:31Z: "r5 review passes: no blocking issue for
  one capture running alone. Package review is closed; live execution is not
  yet approved." The user added that the reviewer verified all 37 engine
  bindings, both manifests, the launcher hashes and the preservation of
  earlier executions, and that the verdict itself does not approve
  execution.
- **The pre-flight (item 4).** Run from a Terminal.app login shell, stage A
  at 2026-10-19T13:41:45.148Z, pasted into the session (received 13:44:12Z)
  with `echo "exit $?"` → `exit 64`. Compared line by line with the README's
  expected block: 16 of 16 lines MATCH, nothing missing, nothing extra;
  diffed against P5's logged in-session pre-flight (same code, same HEAD):
  the only differences were the three session environment refusals and
  stage A's `ForbiddenEnvironment` absent from the operator's shell, the two
  refusal counts (binding 4 → 1, stage A 1 → 0) and the stage A instant.
  Confirmed, every one: `binding: 1 refusal(s)` (`ReviewedEnvironmentMismatch`,
  the five variables unset, P5's token named); `code binding: passed`;
  `stage A … 0 refusal(s)`, all thirteen rules evaluated
  (`ExecutionAlreadyFiled` passing over XS, XS2, XS3, XS4 and the three
  markers; `ResetHoldPending` holding nothing); `runId run-v1-2c07b78c…`;
  `pipelineVersion pipeline-v3-85810d54…`; closure pin `d1b110be…`, rendered
  406,430 B `496a4342…`; `requirementInputSha256 fecc5050…`;
  `renderedConditionSha256 a47f2f38…`; prompts reader 7,630 B `9f9f0db4…`,
  prosecutor 10,248 B `685266b9…`, adjudicator 9,201 B `42c93b0f…`; schemas
  2,276 B `7eef02e9…`, 2,759 B `f4c4a29a…`, 2,379 B `13a14130…`; reader user
  message 406,718 B `ad7cf1e4…`; launch description 425,781 B `76764d43…`;
  sections {Requirement 33, Where to look 31, Entitled relationships 131,
  Entitled closure 406517}; budgets 9 of 9, 2097152, 20971520, 1800000,
  60000, 16470000, 64000, 190000; exit 64; nothing created or launched.
- **Readiness items 1–3 and 5**, received 2026-10-19T13:42:42Z. Verbatim:

  > Carry forward my existing data-use, account-control and delivery-channel/constrained-decoding acknowledgements.
  >
  > * Changes to previously confirmed conditions: none
  > * Five-hour usage: 20%; resets resets by 11.30pm ist today
  > * Seven-day usage: 17% ; resets wednesday at 5..30am ist
  > * No other capture will run concurrently: confirm
  > * I accept that an invalid edge reference can stop this single-use capture at that role, potentially consuming usage, with no retry.
  >
  > I will supply the complete Terminal preflight output and immediate exit code. After readiness passes, present the reviewed hash-bound launcher for my separate explicit approval. This message does not approve execution.

  Items 1 and 2 — r2's data-use approval (open decision 20) and the five D-6
  sentences — were carried forward by the user's instruction and are
  user-confirmed unchanged ("Changes to previously confirmed conditions:
  none"). Item 3: five-hour 20% at 13:42Z, resetting "by 11.30pm ist today"
  (the session's derivation 2026-10-19T18:00Z, which the CLI's own `resetsAt`
  in the record confirms: 1792432800 = 2026-10-19T18:00:00Z = 23:30 IST);
  seven-day 17%, resetting Wednesday 05:30 IST = 2026-10-21T00:00Z (the
  CLI's `resetsAt` 1792540800, the instant r3 and r4 recorded). Item 5: the
  delivery-channel and constrained-decoding acknowledgements carried forward
  in the user's words, the edge-seam acknowledgement given fresh, as pasted
  above. The additional statement "No other capture will run concurrently:
  confirm" was recorded.
- **The launch — the actual chronology.** With the verdict and items 1–5 in
  hand, the session re-verified read-only at 14:08:31Z (P5 20 of 20 and 13
  of 13; launcher `602a4143…` naming the r5 token only; HEAD `52aadb3`
  clean; the case's seven entries and no r5 marker; no managed-settings
  directory) and presented the launcher one-liner verbatim from the README
  at about 14:09Z for a separate, explicit approval. The approval, received
  2026-10-19T14:11:37Z, verbatim: "I approve running the r5 launcher
  one-liner exactly as presented, once, in Terminal.app, now. I will run it
  myself and paste the complete report with its exit code afterwards." The
  execution directory `20261019T141716Z-b588bc` and P5's marker were created
  at 14:17:16Z: the launch, 5 min 39 s after the approval. While the run was
  in progress the user asked for the one-liner twice more (at about 14:19Z
  and 14:2xZ, saying the earlier rendering was not visible) and it was given
  again, verbatim, each time; the stamps show the launch had already
  happened. The report paste arrived at 14:29:39Z, after the run had
  finished (14:27:50Z); it shows the one-liner run in the same Terminal.app
  session as the pre-flight, followed by `echo "exit $?"` → `exit 0`. The
  session did not run the launcher (every command it ran was a read, or a
  write into its scratchpad and the shared notes folder) and did not read
  the case directory between the approval and the paste. The report lines,
  verbatim:

  > capturing CSRD-S-002 on claude-code-cli@3 through the committed harness (--permission-mode default requested): one gate, at most 9 role launches (reader[0], prosecutor[0], prosecutor[1], prosecutor[2], prosecutor[3], prosecutor[4], prosecutor[5], prosecutor[6], adjudicator[0]), launch budget 9, admission 2097152 bytes, output bound 20971520 bytes (the transport's default), lifetime 16470000 ms, evidence under $HOME/Documents/DataStrata/pilot-evidence/subscription-executions
  > status: completed
  > evidence: sealed by the manifest
  > execution: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T141716Z-b588bc
  > gate: pass
  > role launches: 9; gate launches: 1; ledger possibly billed: 9; HTTP attempts: unknown
  > cancelled: false; interrupted by: none
  > terminationUnconfirmed: false; resultWithheld: false
  > error: none
  > usage stop: none
  > rate-limit events: 9; thinking count as the harness reads it: [null,null,null,null,null,null,null,null,null] (the committed observeStream reads result.usage.thinking_tokens, which 2.1.295 does not write; the figure 2.1.295 writes is result.usage.output_tokens_details.thinking_tokens (also on message_delta and under modelUsage), kept raw in cliObserved.reportedUsage; deferred, not repaired)
  > trust: execution completed; schema valid; evidence passed; substantive unassessed
  > runId: run-v1-2c07b78cb61edaa32a407d57ba3a271bf20ba7c95f42599703626dcf04fe3c5c (equals the offline measurement)
  > transcript: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T141716Z-b588bc/transcript/csrd/CSRD-S-002/run-v1-2c07b78cb61edaa32a407d57ba3a271bf20ba7c95f42599703626dcf04fe3c5c.json
  > result: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T141716Z-b588bc/verification/csrd/CSRD-S-002/verification-result.json
  > summary: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T141716Z-b588bc/execution.json
  > manifest: $HOME/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T141716Z-b588bc/MANIFEST.sha256 (16 entries, sha256 cd70ae8ad33f6b770290c25429dc2f6bbe718e6b0e825455f9edda18ee6e69b0)
  > exit 0
- **What nothing here checks.** No code can check the account settings; A3
  passed at run time (the run started; the entry refuses otherwise) and the
  managed-settings location was absent at readiness, at the pre-launcher
  re-verification and after the reads. The CLI's overage fields (B:
  `overageStatus "rejected"`, `overageDisabledReason "org_level_disabled"`,
  `isUsingOverage false` on all nine events) are consistent with extra usage
  being off and prove none of D-6.

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
reader[0] 2,268 lines, `thinking` + `tool_use(StructuredOutput)`, 2,203 `input_json_delta`; prosecutor[0] 1,071 lines, `thinking` + `tool_use(StructuredOutput)`, 1,001 `input_json_delta`; prosecutor[1] 736 lines, `thinking` + `tool_use(StructuredOutput)`, 694 `input_json_delta`; prosecutor[2] 224 lines, `thinking` + `tool_use(StructuredOutput)`, 195 `input_json_delta`; prosecutor[3] 1,116 lines, `text` + `thinking` + `tool_use(StructuredOutput)`, 949 `input_json_delta` and 114 `text_delta`; prosecutor[4] 1,326 lines, `thinking` + `tool_use(StructuredOutput)`, 1,254 `input_json_delta`; prosecutor[5] 873 lines, `thinking` + `tool_use(StructuredOutput)`, 811 `input_json_delta`; prosecutor[6] 1,537 lines, `thinking` + `tool_use(StructuredOutput)`, 1,468 `input_json_delta`; adjudicator[0] 3,334 lines, `thinking` + `tool_use(StructuredOutput)`, 3,158 `input_json_delta`.
Every stream: one `tool_result` user message, no enforce message,
`stop_reason tool_use`, result `success`, `is_error false`, `num_turns 2`,
`permission_denials 0`, one distinct request id (19 request-id occurrences,
9 distinct across the run).

**The usage the CLI reported** (`result.usage`):

| | reader | pros[0] | pros[1] | pros[2] | pros[3] | pros[4] | pros[5] | pros[6] | adj |
|---|---|---|---|---|---|---|---|---|---|
| `cache_creation_input_tokens` | 133,799 | 141,919 | 136,728 | 136,731 | 136,727 | 136,733 | 136,729 | 136,726 | 161,510 |
| `cache_read_input_tokens` | 0 | 0 | 5,195 | 5,195 | 5,195 | 5,195 | 5,195 | 5,195 | 0 |
| `output_tokens` | 9,480 | 6,281 | 3,923 | 1,510 | 5,410 | 7,502 | 5,117 | 7,483 | 19,304 |
| `output_tokens_details.thinking_tokens` | 3,345 | 3,365 | 1,855 | 802 | 2,074 | 3,817 | 2,726 | 3,363 | 10,333 |
| per-request context (input 2 + creation + read) | 133,801 | 141,921 | 141,925 | 141,928 | 141,924 | 141,930 | 141,926 | 141,923 | 161,512 |
| `duration_ms` | 83,328 | 58,709 | 35,885 | 14,169 | 54,899 | 67,541 | 49,675 | 89,876 | 177,048 |
| `total_cost_usd` (list) | 1.260000 | 1.260980 | 1.173331 | 1.125095 | 1.203063 | 1.244951 | 1.197219 | 1.244515 | 1.678168 |

Totals: cache creation 1,257,602; cache read 31,170; input 18; output 66,010
(thinking 31,680); list-price sum 11.387322 USD, the CLI's own figure. The
largest per-request context, the adjudicator's 161,512, sits 28,488 under the
190,000 ceiling (the r5 README estimated about 157,400; twelve challenges and
40 quotes made the adjudicator's input larger than r4's, whose largest was
156,827).

**The `rate_limit_event`**, one per stream: `status "allowed"`,
`rateLimitType "five_hour"`, `resetsAt 1792432800` (2026-10-19T18:00:00Z),
`overageStatus "rejected"`, `overageDisabledReason "org_level_disabled"`,
`isUsingOverage false`; `unifiedWindows.five_hour.utilization` after each
launch 0.26, 0.28, 0.30, 0.31, 0.33, 0.34, 0.36, 0.38, 0.39 (reset
2026-10-19T18:00:00Z); `seven_day` 0.18 after every launch (reset 1792540800
= 2026-10-21T00:00:00Z). No reset fell inside the run.

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
  file bytes, stdin bytes; every prompt file removed afterwards): gate 44319,
  0, 144, 382, 0, —, 0; reader 44324, 0, 83,509, 769,567, 0, 7,630, 406,718;
  prosecutor[0] 44367, 0, 58,885, 377,710, 0, 10,248, 425,112; [1] 44396, 0,
  36,064, 258,562, 0, 10,248, 425,112; [2] 44424, 0, 14,352, 83,784, 0,
  10,248, 425,119; [3] 44440, 0, 55,082, 382,702, 0, 10,248, 425,119; [4]
  44472, 0, 67,721, 464,003, 0, 10,248, 425,124; [5] 44505, 0, 49,857,
  308,924, 0, 10,248, 425,127; [6] 44540, 0, 90,067, 529,362, 0, 10,248,
  425,112; adjudicator 44579, 0, 177,231, 1,165,061, 0, 9,201, 475,327. The
  prompt files are the v5 files by size; the reader's stdin equals the
  measured user message (406,718 B). Role launches account for 632.8 s of the
  634.5 s run.
- Attempts: nine, every one `completed`, channel `process`, `sent true`,
  `possiblyBilled true`, usage from the CLI's result; the ledger: 9 of 9
  attempts used, 0 remaining, largest launch description 500,313 B against
  2,097,152 (r4: 487,470), known input 18 and output 66,010 tokens, 0
  unknown-usage attempts, `httpAttemptsObserved null`, 9 launches started.
- Times: started 14:17:16.062Z, drained 14:27:50.287Z, finished
  14:27:50.591Z; no reset fell inside the run (five-hour reset 18:00Z).
- `error null`, `cancelled false`, `cancellationReason null`,
  `interruptedBy null`, `terminationUnconfirmed false`, `resultWithheld
  false`, `unsentEvents 0`, `recordsWritten 9`, `exitCode 0`,
  `transcriptPath` and `resultPath` the two files above, `runId
  run-v1-2c07b78c…`.
- The package: claim marker made before the harness (14:17:16Z, the same
  second as the execution directory); the harness's execution directory
  sealed afterwards (16 entries). The case directory observed by this
  session holds the new directory and the new marker beside the seven
  earlier entries and nothing else.

#### C2. Checked by this session afterwards, offline

- **Manifests.** XS5's 16 entries verify, present equal to listed, none
  newer than the manifest (`exec-summary.py`, and `shasum -a 256 -c` with an
  independent `find`). P5's two manifests verify after the run (20 of 20,
  13 of 13; newest file 2026-10-19T13:22:28Z). XS, XS2, XS3 and XS4 verify
  (12, 14, 7, 16).
- **Candidate.** HEAD `52aadb3`, the two `node_modules` symlinks the only
  untracked entries, tracked contents equal to HEAD, confirmed at
  14:31:08Z, before this file was written.
- **The mode, three ways, per launch:** argv `--permission-mode default`
  (with `--model claude-opus-5-5`, `--effort high`, `--output-format
  stream-json`, `--json-schema` present; 25 argv items; the `@3` profile's
  control names in the environment), init `"default"`, record
  `requested.permissionMode "default"` — confirmed from
  `streams-summary.py`'s launches view for all nine.
- **Every recorded role output through the committed seams, the edge gate
  included** (`revalidate-execution-r5.mts`, the slot's tool extended with
  the three gates of `src/pipeline/edge-references.ts` after the quote gate,
  so the order it re-runs is the committed one — parse, the evidence rule /
  coverage / adjudication, quote pins, edge references — over XS5, exit 0):
  the world's closure `d1b110be…`, documents `DOC-32013L0034@8822d68a` and
  `DOC-32026L0470@c228f7b1`, condition paths `all[0]`–`all[4]` and `root`,
  one listed edge `EDGE-32013L0034-amendedBy-32026L0470` under grammar
  1.2.0; the record's registry copy `b3972156…` equal to the engine's; the
  transcript's pins (`pipelineVersion pipeline-v3-85810d54…`,
  `requirementInput fecc5050…`, `renderedCondition a47f2f38…`,
  `corpusClosure d1b110be…`) equal to the world's; reader[0] `PASS`
  (elements 15, gaps 0, quotes 26, pins 19 + 7, one edge reference);
  prosecutor[0]–[6] `PASS` with the cells, challenges, quotes, pins and edge
  references listed above; adjudicator[0] `PASS` (adjudications 12,
  `CONFIRMED` 2, `MISMATCH` 7, `OPEN_QUESTION` 3, quotes 40, pins 23 + 17,
  two edge references); five negative controls on prosecutor[0]'s recorded
  output (a hash one character off, a `docId` outside the closure, a bogus
  `conditionPath`, an empty hash, and new: an unlisted edge id in a
  `cross_reference` appended with two closure-pinned quotes, which passes
  the schema and the quote gate and is refused at the edge gate) each
  refused with `RoleOutputError`; `summary: outputs=9 passed=9 refused=0
  none=0 controls=5/5`. The tool's own teeth, run before the record was
  read: over XS4 it refuses r4's reader at the edge gate with exactly the
  four ids the record boundary found and passes the eight other outputs;
  over XS3 it reproduces the slot's baseline and shows that r3's reader had
  also named an invented edge id (elements[7] `E8-amendment-chain`, three
  hops, one id), never seen because that run died at prosecutor[0]'s launch
  before any evidence check.
- **The evidence sets, by a standard-library pass over `execution.json`:**
  `evidenceValidity.status passed`, 39 sets, 39 ok, 0 failed — the 15
  reading elements and two sets for each of the 12 challenges.
- **Personal strings.** `vivin` and `/Users/` occur in no file of XS5 except
  `execution.json`, where the harness's own `transcriptPath`, `resultPath`
  and its printed `Wrote …` line carry absolute paths (the known residual,
  carried since r1); `[REDACTED]` on every line of the nine role streams;
  the transcript and the result carry neither string.
- **The shared root.** `csrd/CSRD-S-002` holds XS, XS2, XS3, XS4, XS5 and
  the four markers; a later package's A6 would pass over XS5, which holds
  `execution.json` and `MANIFEST.sha256`; A7 reads its status `completed`
  and `usageStop null`.
- **No role text was read.** The tools print counts, identifiers and digests
  only; every log was checked to carry no law text.

## What ran, in order

The gate (144 ms, pass); the committed `@3` projection on nine real streams,
each accepted (exactly one `StructuredOutput` call, one `tool_result`, the
restatement, usage from a `success` result); the reader's seams (schema,
evidence rule, quote pins, edge references) passed and prosecutor[0]
launched; each prosecutor's seams (schema, coverage, quote pins, edge
references) passed and the next launched; no gap at any lens; twelve
qualified challenges carried to the adjudicator; launch 10 accepted for the
adjudicator's schema with `pattern`; the adjudicator's seams (schema,
binding, quote pins, edge references) passed; assembly
(`assertResultConsistency`) passed and wrote the transcript and the result;
`checkResultEvidence` judged 39 evidence sets, every one passing; the
harness filed `execution.json` with trust `evidence passed`, sealed 16
entries under `MANIFEST.sha256` at 14:27:50Z; exit 0.

## Retries and spend

Nine runner attempts, nine role processes and one gate process; both retry
controls were zero (`CLAUDE_CODE_MAX_RETRIES=0`,
`MAX_STRUCTURED_OUTPUT_RETRIES=0`); internal HTTP attempts unobserved. Billing
not proven: nine possibly billed attempts, list-price sum 11.387322 USD by
the CLI's own figures (r4: 11.139042). Tokens: 18 input, 1,257,602 cache
creation, 31,170 cache read, 66,010 output (31,680 thinking). The five-hour
window moved from 20% (the user's reading at 13:42Z, 35 minutes before the
launch) through 0.26 after the reader to 0.39 after the adjudicator (the
CLI's readings): about 0.13 over the eight launches after the reader, and
about 0.15 for the whole run if the reader cost what r4's did (r4 moved
0.12 for nine launches); the seven-day window read 0.18 after every launch
(the user's 17% at 13:42Z). Other usage on the account drew on both windows
between the user's readings and the run.

## What this capture settled

- **The edge seam, live.** Nine of nine outputs passed the edge gate at
  their seams; seven edge references, every one the listed edge; the
  prompts' instruction, the `# Entitled relationships` list and the seam
  together produced, in one run, a record the signing gate's evidence check
  accepts at every set. One run; not a guarantee that a role never composes
  an id — but the seam now refuses one at its role after one launch, as the
  offline re-run of r4's and r3's recorded readers shows.
- **The delivery channel under v5.** Nine of nine role launches called
  `StructuredOutput` (r4: nine of nine under v4; r2: nine of nine under v2;
  r3: one of two under v3); one role wrote a short text block beside the
  call, which the committed checks accept and the record keeps. Still an
  instruction, not a control.
- **Compatibility, as far as it goes.** All nine requests were accepted for
  schemas carrying the 64-hex `pattern`; the adjudicator's schema was
  accepted for the second time. Still not established: native constrained
  decoding (the build's native structured-output gate stays off; the tool's
  schema is what was enforced).
- **The quote-hash contract on real inputs.** 114 quotes across the nine
  outputs (26 + 48 + 40), every one at its document's pin; no role failed
  the hash contract at its seam; the negative controls still refuse.
- **The gap-versus-challenge behaviour under v5.** No gap at any lens;
  every objection went as a challenge (twelve), so the run reached
  adjudication; two challenges were `CONFIRMED`, the first such verdicts in
  any S-002 run.
- **Assembly, the record boundary and the dossier.** Reached, and for the
  first time passed in full: the result and the transcript were written, the
  registry copy equals the engine's, the pins equal the world's, and the
  record boundary's evidence check accepted all 39 sets. The dossier stands
  as a completed, schema-valid, evidence-valid result; promotion and signing
  are separate, unauthorised steps, and the requirement author's reading of
  the twelve verdicts is pending.
- **Substantive correctness is not established by any of this.**

## Carried forward

- **Still unobserved:** billing; HTTP attempts; whether `--effort high` was
  applied; native constrained decoding; substantive correctness of every
  element, cell, challenge and verdict; the thinking count through the
  committed observer (the figure 2.1.295 writes is kept raw).
- **Open decisions:** whether the engine should derive or validate edges
  from the corpus instead of asking the model for them (r4's twin question,
  now with one passing run on the seam design); the engine filling the quote
  hash itself (r2 open decision 2, undecided); the adjudicator's two
  `CONFIRMED`, seven `MISMATCH` and three `OPEN_QUESTION` verdicts on
  S-002's encoding, for the requirement author; whether to promote and sign
  the r5 dossier (separate, unauthorised steps); the thinking-count
  observer; the harness's absolute paths; the 190,000 ceiling's margin,
  which narrowed to 28,488 at the adjudicator.
- **A note for the record:** the offline re-run of r3's reader through the
  new seam shows the edge-id invention predates r4 (XS3's reader named one
  invented id in three hops under v3); it was unseen because that run died
  at the first prosecutor's launch.
- **The package's residuals,** unchanged (tsx, zod and Node not
  digest-bound; `capture.ts` never executed before the run; a marker an
  operator could remove by hand; the main checkout's root not read).

## Decisions recorded

1. **Capture first, checkpoint after; the checkpoint alone**, so the record
   of r5 sits at the HEAD it ran against.
2. **r2's data-use approval (open decision 20) and the five D-6 sentences
   carried forward** by the user's instruction and user-confirmed unchanged
   ("Changes to previously confirmed conditions: none").
3. **The usage reading recorded as given** (item 3), with the CLI's own
   reset times beside it, which confirm the session's derivations.
4. **The review verdict recorded:** "r5 review passes: no blocking issue for
   one capture running alone. Package review is closed; live execution is
   not yet approved."
5. **The three limitations acknowledged, user-confirmed, before the launch**
   (item 5): the delivery channel and constrained decoding carried forward
   in the user's words, the edge seam acknowledged fresh.
6. **The approval recorded before the launch** (14:11:37Z, verbatim above),
   as the r4 checkpoint's decision 11 required; the launch followed it by
   5 min 39 s.
7. **No relaunch.** P5 is spent; the marker and A6 enforce it.
8. **Retries stay at zero.** No role answered in text, so the decision memo's
   options are not triggered by this run.
9. **The strict tool-output checks are kept;** no salvage of fenced text;
   no schema or spend-control change.
10. **What the record showed and what follows from it.** The record shows
    nine tool calls, every seam passed with the edge gate live, assembly
    written, and the evidence check passed on all 39 sets with every edge
    reference the listed one. What follows — promotion and signing, the
    requirement author's reading of the twelve verdicts, the engine-derived
    edges question — is the user's decision; nothing is decided here.
11. **No live execution without the user's separate approval** stays the
    rule, and this time it held: the approval statement preceded the launch
    and is on record with its time.

## Handed forward

- **The dossier's standing.** XS5's result is completed, schema-valid and
  evidence-valid; promotion and signing are separate, unauthorised steps;
  the requirement author's reading of the twelve verdicts (two `CONFIRMED`,
  seven `MISMATCH`, three `OPEN_QUESTION`) is the next substantive step.
- **The shared hold root** stays the execution root, now holding eight
  records (X, X3, XR, XS, XS2, XS3, XS4, XS5), none holding (`usageStop
  null` everywhere a status is read).
- **The reading tool** `revalidate-execution-r5.mts` (the slot's tool with
  the edge gates) lives in the shared notes with its teeth logs; a later
  reading should use it or its successor so the seam order it re-runs stays
  the committed one.
- **A future live run needs,** as before: a new reviewed package bound to the
  HEAD at that time; the readiness step afresh; a separate approval recorded
  before the launch.

## Process notes

- **Who.** A fresh session started from the r4 return session's hand-over
  prompt (pasted by the user), in the user's presence. It built and sealed
  P5 offline (13:12Z–13:22Z) by a scripted derivation from r4 (every edit
  asserted before any write; the 37 digests from `git show HEAD:` equal to
  the working tree; the first measurement drifting from r4's values exactly
  where expected and the second equal; the suite 6 files and 108 tests, 37
  launcher checks, both typechecks, the in-session pre-flight and the frozen
  manifests all logged under the r5 sandbox), generated the reviewer's
  worksheet (13:28Z; 324 rows, 324 MATCH), collected readiness items 1–5
  (13:42Z, 13:44Z) and the reviewer's verdict (14:08Z), re-verified and
  presented the launcher (14:09Z), recorded the approval (14:11:37Z),
  prepared the post-run tooling while the user ran the capture (its teeth
  over XS3 and XS4 at about 14:20Z), received the report paste (14:29:39Z)
  and read the record (14:29Z–14:31Z). No subagent.
- **Write locations.** In the candidate: this file (its own commit). Outside
  the repository: the r5 package under `pilot-evidence/` (before the run),
  the session scratchpad and the shared side-session notes folder; nothing
  under `pilot-evidence/` after the run.
- **Reads.** XS5 in full through `exec-summary.py`, `streams-summary.py`
  (counts, identifiers and digests; no role text) and
  `revalidate-execution-r5.mts`, plus standard-library passes over
  `execution.json` for the evidence-set counts and the usage totals, and a
  personal-strings count per file; P5's manifests and launcher; XS's, XS2's,
  XS3's and XS4's manifests; the shared notes.
- **What ran.** Hashing, listing, `stat` under `TZ=UTC`, `git
  --no-optional-locks` queries, Python (standard library, `-I`) and Node
  offline through the candidate's own `tsx`, `vitest` and `tsc` under the r5
  sandbox profile with the write logger. No Claude Code, no `ollama`, no
  network, no subagent, no live run by the session.
- **b1b-record.** No command, nothing read.
