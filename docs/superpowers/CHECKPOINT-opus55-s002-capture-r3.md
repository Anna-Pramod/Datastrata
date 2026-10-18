# Checkpoint — the third genuine `CSRD-S-002` capture on `claude-code-cli@3`, two launches, sealed failure at `prosecutor[0]`'s delivery channel, on `49678b7`

Written on 2026-10-19 (+0530), 2026-10-18 UTC, by the successor of the session
that prepared the r3 package and read the record after the run — from that
session's hand-over and shared notes, and from this session's own read-only
reading of the sealed record — in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD
`49678b727fabf3739574dec919a267b3176c107a`, the quote-hash repair). Every time
below is UTC.

- **Scope of this change.** This file. No code changed in this commit. It is
  committed alone, before the prompt change prepared beside it in the same
  session (prompt set v4, the delivery instruction, below), so the record of
  r3 is on file at the HEAD it ran against. Nothing is committed by the
  session: the user runs every `git add` and `git commit`.
- **Where the evidence is.**
  - **P3**: the r3 package
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-19-opus55-v3-s002-capture-prep-r3/`
    (`README.md`, `HANDOVER.md`), manifest `b85bf749…` (20 entries),
    `offline-checks` `91d274dc…` (13), launcher `run-capture.sh`
    `1d7753dd…`.
  - **XS3**: the execution
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261018T191012Z-28543c/`,
    the committed harness's own record, beside r1's XS
    (`20261018T121625Z-2d4de0`), r2's XS2 (`20261018T164607Z-2d0d2e`), r2's
    kept claim marker `claim.opus55-v3-csrd-s002-one-gate-nine-launches-r2`
    and P3's own, `claim.opus55-v3-csrd-s002-one-gate-nine-launches-r3`.
- **Unchanged.** Neither P3 nor XS3 was written after the run; both verify
  below. XS (12 of 12, `35268592…`) and XS2 (14 of 14, `2e318748…`) were
  re-verified by this session; X, X3 and XR were not re-read here (P3's
  `inputs-final` log re-verified them before the run).
- **Nothing further is on file.** The shared root holds X, X3, XR, XS, XS2
  and XS3. Nothing further live is authorised.
- **Offline.** This session executed no Claude Code and no `ollama`, used no
  network and no subagent, and wrote nothing under `pilot-evidence/`. Node
  ran offline: `tsx` for the identity derivation and for re-running the
  committed engine's seams over the prosecutor's text, and `vitest`/`tsc` for
  the focused checks of the v4 change (reported with that change). No command
  was run in `b1b-record`.

## The outcome

The letter after each item names its class of evidence (A the operator's
word, B the CLI's word about itself, C established without either).

- **The run.** After readiness closed, the operator ran P3's hash-bound
  launcher once, in Terminal.app, and it ended with `status: failed`,
  `evidence: sealed by the manifest`, exit 1 (A). The execution ran from
  19:10:12.765Z to 19:12:29.527Z, 2 minutes 17 seconds (C1).
- **The gate passed** (C1).
- **Two role launches, then nothing.** `reader[0]` (launch 2) completed;
  `prosecutor[0]` (launch 3) failed; the run was cancelled with
  `role_failed:prosecutor[0]`, and the other six prosecutors and the
  adjudicator never launched (C1).
- **The reader did what v3 asked.** `reader[0]` answered through one
  `StructuredOutput` call (B, C2): 15 elements, `E1-addressee` to
  `E15-threshold-review`, no gap, 25 quotes (22 plain, 3 inside one
  `amendment_chain`), every one carrying its document's pin — 22 ×
  `DOC-32013L0034` at `8822d68a…`, 3 × `DOC-32026L0470` at `c228f7b1…` —
  none empty, none malformed (C2). Its seam (schema, evidence rule, quote
  pins) passed, since `prosecutor[0]` launched (C1), and this session re-ran
  `assertReaderQuotesPinned` over the recorded output offline (C2). Its
  request was not rejected for the supplied schema, which carries the 64-hex
  `pattern` (B: the launch completed with `result.subtype success`).
- **The prosecutor answered, and the launch failed anyway.** The CLI child
  for `prosecutor[0]` exited 1 after 46,397 ms with 0 stderr bytes (C1). Its
  stream ends in `result.subtype error_max_structured_output_retries`,
  `terminal_reason structured_output_retry_exhausted`, `is_error true`,
  `stop_reason end_turn`, `num_turns 2`, `errors ["Failed to provide valid
  structured output after 0 attempts"]` (B). The model's one turn was one
  `thinking` block (text withheld) and one **text** block of 6,303 characters
  that is exactly one ```` ```json ```` fence holding a prosecutor output —
  no `tool_use` block, 0 `input_json_delta` events, 445 `text_delta` events
  (B, C2). The CLI then appended its synthetic user message
  `[structured-output-enforce] You MUST call the StructuredOutput tool to
  complete this request. Call this tool now.` and, `MAX_STRUCTURED_OUTPUT_RETRIES`
  being `'0'` (and `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS` `'1'`) among the
  committed `@3` launch controls (`src/pipeline/claude-code-cli.ts`), ended
  the run (B, C2). The harness filed `CliExitError`: `prosecutor[0]: the CLI
  child did not complete normally (exitCode 1, signal null, 0 stderr bytes);
  its output is not a role result` — no transcript, no result, no `runId`
  (C1). Its request, too, was not rejected for the supplied schema (B: the
  turn ended with `end_turn`, no API error).
- **The fenced text, read offline** (C2). The fence parses: lens
  `missing_criterion`, 12 coverage cells, challenges `MC-1` and `MC-2`,
  `gaps []`. Through the committed engine at `49678b7` it passes
  `parseRoleOutput('prosecutor')`, `assertProsecutorCoverage` (context: the
  reader's 15 element ids and the requirement's condition paths `all[0]` to
  `all[4]` and `root`) and `assertProsecutorQuotesPinned` (5 quotes, all
  `DOC-32013L0034` at `8822d68a…`). The implementing session found this
  first; this session re-ran it, with four negative controls — a hash one
  character off, a `docId` outside the closure, a coverage cell at a path the
  condition does not have, an empty hash — each refused by name. **That is
  offline-validation-passing, not substantively verified**: schema
  conformance and text matching do not establish evidentiary support or
  substantive correctness, and the record was refused before any such
  assessment.
- **Contrast.** r2's nine launches and r3's own reader each delivered through
  one `StructuredOutput` call; no enforce message appears in r2's streams.
  The engine's own comment (`claude-code-cli.ts`, about line 205) records the
  unforced-`StructuredOutput` fact as a runtime unknown; r3 observed it once
  in two role launches.
- **Filed record.** `usageStop` null (C1), so there is no reset hold for a
  later package (C2). Trust: execution `failed` (`CliExitError`), schema
  `unassessed`, evidence `unassessed`, substantive `unassessed` (C1).
- **P3 is spent.** Its claim marker exists under the case (A6 refuses a
  second start); the case now holds XS, XS2, XS3 and the two markers.

## The execution, bound by hash

- `MANIFEST.sha256`:
  `e2c458e3cc629e8c661cea2ba25e1c76ca4e63270d7a567a33e46b50f5599117`, 7
  entries, every one verified by this session with `shasum -a 256 -c`; the
  set of files present equals the set listed; none is newer than the
  manifest (every mtime 19:10:12Z to 19:12:29Z).

  | File | bytes |
  |---|---|
  | `execution.json` | 7,290 |
  | `attempts.jsonl` | 1,255 |
  | `launches.jsonl` | 14,213 |
  | `streams/gate-launch1.sanitised.jsonl` | 346 |
  | `streams/role-reader[0]-launch2.sanitised.jsonl` | 578,148 |
  | `streams/role-prosecutor[0]-launch3.sanitised.jsonl` | 152,770 |
  | `verification/requirement-versions/csrd.json` | 4,128 |

  No `transcript/` and no `verification/csrd/` entry: the harness wrote
  neither, because no result was produced.
- **The package as run.** P3's manifests, `b85bf749…` (20 of 20) and
  `91d274dc…` (13 of 13), verify after the run; `run-capture.sh` hashes to
  `1d7753dd…`, the digest the user named in the approval.

## Three kinds of evidence

### A. The operator's steps

- **The pre-flight (item 4).** Run from Terminal.app, stage A at
  19:04:23.878Z, pasted into the implementing session (received about
  19:07Z): `binding: 1 refusal(s)` (`ReviewedEnvironmentMismatch`, the five
  variables unset, P3's token named; no `ClaudeCodeSessionEnvironment`,
  `NodeEnvironmentInherited` or `NotTerminalApp` refusal, so a plain
  Terminal.app shell); `code binding: passed`; `stage A … 0 refusal(s)`, all
  thirteen rules evaluated, `ExecutionAlreadyFiled` and `ResetHoldPending`
  included (so XS, XS2 and r2's marker beside the case passed A6, and
  nothing held); `runId run-v1-3a97edd8…`, `pipelineVersion
  pipeline-v3-55f2fd84…`; closure pin `d1b110be…`, rendered 406,430 B
  `496a4342…`; `requirementInputSha256 fecc5050…`;
  `renderedConditionSha256 a47f2f38…`; prompts reader 5,685 B `d3504356…`,
  prosecutor 8,303 B `148f12a9…`, adjudicator 7,256 B `9292026f…`; schemas
  2,276 B `7eef02e9…`, 2,759 B `f4c4a29a…`, 2,379 B `13a14130…`; reader
  user message 406,585 B `9eb8a24b…`; launch description 423,668 B
  `7e9825cb…`; the budgets as reviewed; exit 64; nothing created or
  launched. The implementing session compared every printed value against
  `capture-binding.ts` (17 literals, 17 match). The independent reviewer
  accepted the pasted pre-flight.
- **The review verdict and readiness items 1–3 and 5**, received
  19:08:52Z, in the user's own words. Verbatim:

  > The independent reviewer has completed the r3 binding review with no
  > blocking issue for one capture running alone, and accepted the pasted
  > Terminal preflight.
  > My previous data-use and account-control confirmations remain unchanged,
  > as already confirmed.
  > Current account readings:
  >
  > * Five-hour utilisation: 73%; resets 41 mins.
  > * Seven-day utilisation: 75%; resets on Wednesday, 21 October 2026 at
  >   05:30 IST (UTC+05:30).
  >
  > I accept the unresolved provider `pattern` compatibility risk: rejection
  > could consume r3 on one failed, possibly usage-counted reader launch, with
  > no automatic retry.
  > I want to proceed before the normal reset.
  > Please close readiness against these readings and present the reviewed
  > hash-bound launcher for my separate explicit approval. This message does
  > not approve execution.

  Items 1 and 2 — r2's data-use approval (open decision 20) and the five D-6
  sentences — were carried forward by the user's 2026-10-19 instruction (ask
  only about changes and fresh evidence) and are confirmed unchanged in the
  user's words. Item 3 gives both windows with utilisation and reset time:
  five-hour 73%, resetting 41 minutes from receipt (about 19:49Z, the
  implementing session's derivation; the CLI's own `resetsAt` is 19:50:00Z);
  seven-day 75%, resetting 2026-10-21T05:30+05:30 = 2026-10-21T00:00Z (the
  user's absolute time with timezone, equal to the CLI's `1792540800`). Item
  5 is the user's acknowledgement of the unverified provider `pattern` risk,
  including its one-launch cost and the absence of automatic retry. The
  reviewer's verdict covered the bindings and the pre-flight: no blocking
  issue for one r3 capture running alone. Provenance: the wording is
  user-confirmed; the readiness items were collected by the implementing
  session, not closed by the reviewer; the launcher was presented after
  them.
- **The launch.** The user's approval, received 19:10:32Z, verbatim:
  `Approved. I am running the r3 launcher (run-capture.sh sha256
  1d7753dd7c2536f5b497884e500fddadc318c9954d50a7e3314448849f236205) from
  Terminal.app now and will paste the report.` The implementing session saw
  the case directory once, read-only, at 19:10:32Z — XS, XS2, the new
  directory `20261018T191012Z-28543c`, both markers — and did not poll it.
  The report paste followed (received about 19:36:50Z): the pre-flight
  repeated (same output as item 4, exit 64), then the one-liner, whose
  digest clause passed, then `status: failed`, `evidence: sealed by the
  manifest`, the execution path, `gate: pass`, `role launches: 2; gate
  launches: 1; ledger possibly billed: 2; HTTP attempts: unknown`,
  `cancelled: true (role_failed:prosecutor[0])`, `interrupted by: none`,
  `terminationUnconfirmed: false`, `resultWithheld: false`, `error:
  CliExitError: prosecutor[0]: the CLI child did not complete normally
  (exitCode 1, signal null, 0 stderr bytes); its output is not a role
  result`, `usage stop: none`, `rate-limit events: 2`, the thinking note
  (`[null,null]`), `trust: execution failed; schema unassessed; evidence
  unassessed; substantive unassessed`, `runId: none`, `transcript: none`,
  `result: none`, the summary path, `manifest: … (7 entries, sha256
  e2c458e3…)`, then `exit 1  USER=vivin  HOME=/Users/vivin` (the user's own
  echo). These messages are the implementing session's exchange with the
  user, not the reviewer's. The paste is kept verbatim in the shared notes.
- **What nothing here checks.** No code can check the account settings; A3
  passed at run time and the managed-settings location was absent at
  readiness. The CLI's overage fields (B: `overageStatus "rejected"`,
  `overageDisabledReason "org_level_disabled"`, `isUsingOverage false`) are
  consistent with extra usage being off and prove none of D-6. The user's
  "73%" and the CLI's 0.74 at the reader's end (B) are two sources at two
  instants.

### B. CLI-reported facts

**The gate**: `loggedIn` true, `authMethod` `"claude.ai"`, `apiProvider`
`"firstParty"`, `subscriptionType` `"max"`, `analyticsDisabled` true,
`apiKeySource` and `forcedLoginMethod` absent, the identifiers present and
never reproduced; the stream byte-identical to X's, X3's, XR's, XS's and
XS2's (`51dfc1d2…`).

**The init events**, line 1 of both role streams: `permissionMode
"default"`, `model claude-opus-5-5`, `claude_code_version 2.1.295`, `tools
["StructuredOutput"]`, `fast_mode_state "off"`, `analytics_disabled` true,
`per_turn_effort_active` true, as on XR, XS and XS2.

**The streams.** The reader's, 2,016 lines, in the known shape: one
`system/status`, one `message_start`, one `thinking` block with withheld text
(20 `thinking_delta` events, 19 `system/thinking_tokens` events), one
`StructuredOutput` `tool_use` block whose 1,960 `input_json_delta` events
concatenate to the parsed `structured_output`, the tool result accepted by
configuration, `message_delta` stop reason `tool_use`, one
`rate_limit_event`, the `success` result. The prosecutor's, 499 lines: the
same opening, one `thinking` block (20 `thinking_delta`, 19
`thinking_tokens`), then a **text** block built from 445 `text_delta`
events, `message_delta` stop reason `end_turn`, the CLI's synthetic
`[structured-output-enforce]` user message, one `rate_limit_event`, the
`error_max_structured_output_retries` result. Two distinct request IDs, one
per launch.

**The usage the CLI reported** (`result.usage`):

| | reader | pros[0] |
|---|---|---|
| `cache_creation_input_tokens` | 133,104 | 140,715 |
| `cache_read_input_tokens` | 0 | 0 |
| `output_tokens` | 8,309 | 4,823 |
| `output_tokens_details.thinking_tokens` | 2,682 | 2,395 |
| per-request context (input + creation + read) | 133,106 | 140,717 |
| `duration_ms` | 89,669 | 46,224 |
| `total_cost_usd` (list) | 1.231020 | 1.222188 |

`input_tokens` 2 on each; `result.usage.thinking_tokens` absent on both, so
`cliObserved.thinkingTokens` is `[null, null]` (the deferred observer). The
costs sum to 2.453208, list-price estimates. The prosecutor's figures are the
CLI's word about a failed launch: the harness's ledger did not take them
(C1, below).

**The `rate_limit_event`**, one per stream, `status "allowed"`,
`rateLimitType "five_hour"`, `resetsAt` 1792353000 (2026-10-18T19:50:00Z),
`overageStatus "rejected"`, `overageDisabledReason "org_level_disabled"`,
`isUsingOverage` false: five-hour utilisation 0.74 then 0.75; seven-day 0.75
then 0.75, resetting 1792540800 (2026-10-21T00:00:00Z).

### C. Independently checked evidence

#### C1. Recorded by the harness's and the package's own code at run time

- `synthetic` false; pin `2.1.295`, 239,695,888 bytes, `494870c9…`, not
  injected; `requested.permissionMode "default"`, effort `high`,
  `maxOutputTokens` 64,000, settings from the profile, the `@3` settings;
  budgets as reviewed (9 attempts, 2,097,152 bytes per attempt, launch
  1,800,000 ms, gate 60,000 ms, lifetime 16,470,000 ms).
- Gate process pid 40988, exit 0, 117 ms, 382 stdout bytes. `reader[0]`
  pid 40993, exit 0, no signal, 89,839 ms, 683,040 stdout bytes, 0 stderr,
  prompt file 5,685 bytes (the v3 reader), stdin 406,585 bytes, prompt file
  removed. `prosecutor[0]` pid 41052, **exit 1**, no signal, 46,397 ms,
  178,778 stdout bytes, 0 stderr, prompt file 8,303 bytes (the v3
  prosecutor), stdin 423,373 bytes, prompt file removed.
- Attempts: `reader[0]` `completed` at 19:11:43.013Z, usage from
  `cli_report`, possibly billed; `prosecutor[0]` `projection_refused` at
  19:12:29.526Z, detail the `CliExitError` above, usage **null**, possibly
  billed.
- Ledger: 2 of 9 attempts, 7 remaining, largest launch description 444,434
  bytes against 2,097,152, 2 known input tokens, 8,309 known output tokens
  (the reader's only: 1 unknown-usage attempt), 2 possibly billed, HTTP
  attempts unobserved, 2 launches started.
- Times: started 19:10:12.765Z; gate stream 19:10:12Z; reader stream
  19:11:43Z; drained 19:12:29.526Z; finished 19:12:29.527Z. The five-hour
  reset (19:50Z) fell after the run.
- `error.name` `CliExitError`; `lines []`; `transcriptPath` and `resultPath`
  null; `runId` null; `cancelled` true, `cancellationReason
  role_failed:prosecutor[0]`; `interruptedBy` null; `terminationUnconfirmed`
  false; `resultWithheld` false; `unsentEvents` 0; `recordsWritten` 2.
- The package: claim marker made before the harness; the harness's
  execution directory sealed afterwards (7 entries); `caseEntries` named only
  the new directory; the report's `runId: none` and `trust` lines as the
  paste shows.

#### C2. Checked by this session afterwards, offline

- **Manifests.** XS3's 7 entries verify, the listing equals the files
  present, none newer than the manifest. P3's two manifests verify after the
  run. XS and XS2 verify.
- **Candidate.** HEAD `49678b7`, the two `node_modules` symlinks the only
  untracked entries, tracked contents equal to HEAD, before this file and
  the v4 change were written.
- **The mode, three ways, twice:** argv `--permission-mode default`, init
  `"default"`, record `requested.permissionMode "default"` agree on each
  role launch; argv `--model claude-opus-5-5` on each.
- **The reader's output.** The result's `structured_output` parses as a
  reader output through `parseRoleOutput('reader')`: 15 elements, `gaps []`,
  evidence kinds 25 `quote` and 1 `amendment_chain`; `assertReaderQuotesPinned`
  passes over the S-002 closure.
- **The prosecutor's text,** as read above: the text block is exactly one
  ```` ```json ```` fence with nothing before or after; the JSON parses; it
  passes the three committed seams; each of four negative controls is
  refused by name (`RoleOutputError`). Nothing here reads the law.
- **What the two launches had in common and where they differed.** Same
  executable, same controls, same permission mode, same tool list
  (`["StructuredOutput"]`), same schema mechanism, prompts ending in the same
  sentence (`Output the JSON object and nothing else.`). The reader called
  the tool; the prosecutor wrote the object into a text block. The prompt
  never named the tool; the CLI's enforce message does, once, and the
  committed controls allow it no retry.
- **Personal strings.** None: `vivin` and `/Users/` occur in no file of XS3.
  `[REDACTED]` under `session_id`, `uuid` and `cwd` as before.
- **The shared root.** Five entries under `csrd/CSRD-S-002`: XS, XS2, XS3,
  r2's marker, r3's marker. P3's A6 would refuse a second start by its
  marker; a later package's A6 would pass, since XS3 is a directory holding
  `execution.json` and `MANIFEST.sha256`, and A7 reads its `failed` status
  and null `usageStop` as holding nothing.

## What ran, in order

The committed `@3` projection ran on two real streams: it returned the
reader's `structured_output`, and it refused the prosecutor's launch because
the child did not complete normally (exit 1 is not a role result, whatever
the stream holds). The reader's seam — schema, evidence rule, quote pins —
passed and the first prosecutor was launched. That launch ended in
`CliExitError`; the orchestration cancelled the run (`role_failed:prosecutor[0]`);
the remaining six prosecutors and the adjudicator never started; nothing was
assembled; no transcript and no result were written; the package sealed the
directory; exit 1.

## Retries and spend

Two runner attempts, two role processes and one gate process. Two role
launches were recorded, with both retry controls configured to zero
(`CLAUDE_CODE_MAX_RETRIES=0`, `MAX_STRUCTURED_OUTPUT_RETRIES=0`); internal
HTTP attempts remain unobserved. Billing not proven: two possibly billed
attempts, list-price sum 2.453208. As the CLI reports it, the run spent 273,819
cache-creation tokens, 0 cache-read tokens and 13,132 output tokens of which
5,077 thinking. The five-hour window moved from 0.73 (the user's reading
before the run) to 0.74 after the reader and 0.75 after the prosecutor; the
seven-day window read 0.75 on both events.

## What this capture settled

- **The v3 quote-hash instruction landed for the reader on real inputs:**
  25 of 25 quotes carried the pinned hash, where r2's role outputs contained
  120 empty quote hashes across all roles, and the seam passed before the next
  launch. One run, one reader; not a guarantee.
- **Compatibility, as far as it goes** (the user's qualification): r3's
  reader and prosecutor requests were not rejected for the supplied schemas,
  each carrying the 64-hex `pattern` — both completed at the API. This does
  not establish native constrained decoding, and it does not establish
  adjudicator-schema compatibility: the adjudicator never launched, and its
  schema with `pattern` has not been sent.
- **The delivery channel is a failure mode of its own.** A role can produce
  an answer that conforms to the schema and the seams and still fail the
  launch by writing it into a text block instead of calling the tool. Under
  the committed controls that is a failed launch, a cancelled run and a
  possibly billed attempt. Observed once in two role launches here, never in
  r2's nine; the engine recorded the possibility as a runtime unknown before
  r3.
- **The strict checks held.** The harness filed the launch as not a role
  result and the run as failed; no fenced text was salvaged into a result;
  nothing was assembled. That is the designed property, and its cost here
  was one launch.
- **The prosecutor's fenced content is offline-validation-passing, not
  substantively verified.**

## Carried forward

- **Still unobserved:** billing; HTTP attempts; whether `--effort high` was
  applied; native constrained decoding; the adjudicator schema at the
  provider; whether an instruction that names the tool changes the delivery
  behaviour (no live run under it); substantive correctness of the 15
  elements, the 12 coverage cells and the 2 challenges; the v2 guidance's
  gap-versus-challenge behaviour beyond r2's one run.
- **The open question this run raises:** how the delivery-channel defect is
  closed. The user has decided the first step (below): an instruction in the
  prompts, versioned as v4, with no change to retries, schemas, launch
  controls or the strict checks. Whether a structural answer is also wanted —
  one structured-output retry, or a projection that reads a fenced text
  answer — stays the user's decision and is not made here; each would move
  the identity or the controls.
- **The package's residuals,** unchanged, plus: a marker an operator could
  remove by hand.

## Decisions recorded

1. **Capture first, checkpoint after; the checkpoint alone, before the fix,**
   so the record of r3 sits at the HEAD it ran against.
2. **r2's data-use approval (open decision 20) and the five D-6 sentences
   carried forward** by the user's 2026-10-19 instruction and confirmed
   unchanged in the user's words (A, items 1 and 2).
3. **The usage reading recorded as given**, relative times beside the
   session's derivation and the CLI's own reset times.
4. **The review verdict recorded:** no blocking issue for one r3 capture
   running alone, and the pasted pre-flight accepted (relayed by the user
   before the launcher was presented; the verdict covered the bindings and
   the pre-flight, and readiness was collected separately by the session).
5. **The provider `pattern` risk accepted in the user's words before the
   launch**; r3 then showed the reader and prosecutor requests accepted, with
   the qualification above.
6. **No relaunch.** P3 is spent; the marker and A6 enforce it.
7. **Retries stay at zero** (`MAX_STRUCTURED_OUTPUT_RETRIES=0`,
   `CLAUDE_CODE_MAX_RETRIES=0`).
8. **The strict tool-output checks are kept:** the schema the CLI enforces,
   the role seams, `assertResultConsistency`.
9. **No salvage of fenced text from a failed launch**, now or later: a child
   that exits 1 has produced no role result.
10. **No schema change and no spend-control change;** `claude-code-cli.ts`'s
    launch controls and `anthropic-messages.ts` are untouched.
11. **The delivery instruction is added as prompt set v4**, in the user's
    words: when the StructuredOutput tool is available, deliver the answer
    by calling it exactly once with the required JSON object as its input,
    never as a text message or Markdown code block; when the tool is
    unavailable, output the JSON object directly, without fences or
    commentary. v3 is kept byte for byte under `prompts/history/v3/`; the
    HTTP route's direct JSON is preserved. The instruction reduces the
    observed delivery risk; it cannot guarantee model compliance. Prepared
    in this session beside this file; committed separately, after it.
12. **The prosecutor's fenced content is described as
    offline-validation-passing, not substantively verified.**
13. **No r4 package until the v4 change is reviewed and committed.**
14. **No live execution without the user's separate approval.**

## Handed forward

- **The v4 change,** in the commit after this one: the three prompts, the
  kept v3 set, the loader and `VERSIONS.md`, and the identity and prompt
  tests, with their red-then-green check logs; its delivery lists old and new
  prompt digests and the old and new identities (http, `@1`, `@2`, `@3`).
- **The next package (r4)** binds to the HEAD that carries v4 and expects
  the v4 `@3` identity and a new `runId`, both derived at package time; its
  README must carry the compatibility qualification above, the
  delivery-channel risk (an instruction reduces it; nothing guarantees it),
  and that with retries at zero a text answer still costs the run.
- **The shared hold root** stays the execution root, now holding six
  records (X, X3, XR, XS, XS2, XS3), none holding.
- **A future live run needs,** as before: a new reviewed package bound to
  the HEAD at that time; the readiness step afresh (the data terms for that
  capture, the five D-6 items, both usage windows with absolute reset times,
  the operator's pre-flight); a separate approval.
- **Open decisions, unchanged:** the thinking-count observer; the harness's
  absolute paths in records that carry them; the 190,000 ceiling's
  confirmation (not reached here: 140,717 at most); the gap-versus-challenge
  behaviour on real inputs beyond r2's one run; the three ways of closing the
  quote-hash contract further (the engine filling the hash itself remains
  undecided).

## Process notes

- **Who.** A successor session, started from the hand-over the implementing
  session wrote when its context was nearly full. That session prepared P3,
  collected the readiness items, presented the launcher, received the
  approval and the report paste, read the record and validated the
  prosecutor's text; it did not write this file. This session re-read the
  sealed record itself and re-ran the validation.
- **Write locations.** In the candidate: this file (its own commit) and the
  v4 change (the next commit; its file list is in its delivery). Outside the
  repository: the session scratchpad (the derivation and validation scripts
  and logs, the red and green check logs) and a copy of those logs in the
  shared side-session notes folder; nothing under `pilot-evidence/` after
  the run.
- **Reads.** XS3 in full (`execution.json`, `attempts.jsonl`,
  `launches.jsonl`, the three streams) through `python3 -I` and `tsx`
  scripts; P3's manifests and launcher; XS's and XS2's manifests; the
  committed `prompts.ts`, `prosecutors.ts`, `quote-pins.ts`,
  `role-outputs.ts`, `orchestrate.ts`, `identity.ts` and the tests the v4
  change edits; the shared notes.
- **What ran.** Hashing, listing, `stat` under `TZ=UTC`, `git
  --no-optional-locks` queries, Python scripts (standard library only),
  and Node offline through the candidate's own `tsx`, `vitest` and `tsc`
  binaries — the identity derivation, the prosecutor-text validation, and
  the focused checks of the v4 change under vitest's offline and process
  guards. No Claude Code, no `ollama`, no network, no subagent, no live run,
  no new package.
- **b1b-record.** No command, nothing read.
