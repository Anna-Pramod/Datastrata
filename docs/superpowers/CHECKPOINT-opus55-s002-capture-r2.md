# Checkpoint — the second genuine `CSRD-S-002` capture on `claude-code-cli@3`, nine launches completed, refused at the record boundary, on `b7b8a1e`

Written on 2026-10-18 (+0530), 2026-10-18 UTC, by the session that prepared
the r2 package, after the run, in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD
`b7b8a1e1ebb86fa0d40106dc1699efdb18ccce3a`). Every time below is UTC.

- **Scope of this change.** This file, and one correction to
  `HANDOFF-2026-10-18-s002-scope-vs-timing.md` (section 4, "Identity": the
  two sentences that said the `pipelineVersion` and the `runId` derivation
  were unchanged by the v2 prompts; they were not, and the r2 HANDOVER
  recorded the correction before the run). No code changed. Nothing is
  committed: the user runs every `git add` and `git commit`.
- **Where the evidence is.**
  - **P2**: the r2 package
    `/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-18-opus55-v3-s002-capture-prep-r2/`
    (`README.md`, `HANDOVER.md`), manifest `30ae9fdd…` (20 entries),
    `offline-checks` `37319b47…` (13).
  - **XS2**: the execution
    `/Users/vivin/Documents/DataStrata/pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261018T164607Z-2d0d2e/`,
    the committed harness's own record, beside r1's XS (`20261018T121625Z-2d4de0`)
    and beside P2's kept claim marker
    `claim.opus55-v3-csrd-s002-one-gate-nine-launches-r2`.
- **Unchanged.** Neither P2 nor XS2 was written after the run; both verify
  below. XS, the probes and the rehearsal are untouched.
- **Nothing further is on file.** The shared root holds X, X3, XR, XS and
  XS2. Nothing further live is authorised.
- **Offline.** This session executed no Claude Code, `ollama` or Node binary
  after the run, ran no test, and used no network and no subagent.

## The outcome

The letter after each item names its class of evidence (A the operator's
word, B the CLI's word about itself, C established without either).

- **The run.** After the readiness step, the operator ran P2's hash-bound
  launcher once, in Terminal.app, and it ended with `status: failed`,
  `evidence: sealed by the manifest`, exit 1 (A). The execution ran from
  16:46:07.467Z to 16:54:34.625Z, 8 minutes 27 seconds (C1).
- **The gate passed** (C1).
- **All nine role launches completed, in order**, `reader[0]`,
  `prosecutor[0]`…`[6]` and, for the first time on real inputs,
  `adjudicator[0]` (C1). Each answered through one `StructuredOutput` call
  under its committed schema; each init reported `permissionMode "default"`
  (B); the committed init check accepted each (C2).
- **No role halted.** No gap anywhere: the seven prosecutors raised twelve
  challenges, and the temporal objection that halted r1 was raised by
  `prosecutor[3]` as a **challenge**, `C2-financial-years-governed-not-posed`,
  whose statement names the document outside the closure that would settle
  it; the adjudicator answered every challenge (C2, from the streams). That
  is the shape the v2 guidance asked for. One run shows that the pipeline
  carried it; it does not show that a model will choose it again.
- **Then the record boundary refused.** `assembleVerificationResult`'s
  consistency rule found 120 problems of one kind: every quote, in every
  role's evidence, carried `sha256Normalized` as the **empty string**, where
  `corpus[]` pins `DOC-32013L0034` at `8822d68a…` and `DOC-32026L0470` at
  `c228f7b1…`. The harness filed `RunRefused`, `invalid_result`, wrote no
  transcript and no result, derived no `runId`, and recorded `status failed`
  (C1). The package sealed what the harness filed (14 entries) and exited 1
  (A, C1).
- **The role outputs remain available for analysis** in the sanitised
  streams (C2): 18 reading elements, 84 coverage cells, 12 challenges, 12
  adjudications (8 `MISMATCH`, 3 `CONFIRMED`, 1 `OPEN_QUESTION`) and 120
  quotes. Empty quote hashes caused the observed assembly refusal. This
  session re-found each quote's `text` in the closure's normalised documents
  (whitespace-collapsed, lower-cased, as the sign gate compares); text
  matching does not establish evidentiary support or substantive
  correctness.
- **Why nine launches ran before the refusal** (C2): the quote schema the
  roles are given declares `sha256Normalized` as a plain string
  (`corpus/evidence.ts:90`, no minimum length, no pattern, no description);
  the reader prompt never names the field; the reader's seam check
  (`assertReaderEvidence`, `reader.ts:173`) checks evidence *kinds* only; and
  the quote-pin rule lives in `assertResultConsistency`
  (`result.ts:580–592`), which runs at assembly, after the last launch. r1's
  reader, under byte-identical prompt and a message differing only in `v3`
  → `v4`, filled every hash correctly; r2's left every one empty. Two runs,
  two behaviours, one contract that lets both through until the end.
- **Filed record.** `usageStop` null (C1), so there is no reset hold (C2).
  Trust: execution `failed` (`RunRefused`), schema `invalid`, evidence
  `unassessed`, substantive `unassessed` (C1).
- **P2 is spent.** Its claim marker exists under the case (A6 refuses a
  second start); the case now holds XS, XS2 and the marker.

## The execution, bound by hash

- `MANIFEST.sha256`:
  `2e318748181c0630bad94c8561e0fb7e5be3ef0d067d5aee5766522a030471f8`, 14
  entries, every one verified by this session with `shasum -a 256 -c`; the
  set of files present equals the set listed; none is newer than the
  manifest (every mtime 16:46:07Z to 16:54:34Z).

  | File | bytes |
  |---|---|
  | `execution.json` | 56,410 |
  | `attempts.jsonl` | 5,535 |
  | `launches.jsonl` | 61,257 |
  | `streams/gate-launch1.sanitised.jsonl` | 346 |
  | `streams/role-reader[0]-launch2.sanitised.jsonl` | 673,915 |
  | `streams/role-prosecutor[0..6]-launch3..9.sanitised.jsonl` | 221,736 / 220,561 / 234,164 / 271,788 / 291,588 / 239,768 / 313,355 |
  | `streams/role-adjudicator[0]-launch10.sanitised.jsonl` | 975,933 |
  | `verification/requirement-versions/csrd.json` | 4,128 |

  No `transcript/` and no `verification/csrd/` entry: the harness wrote
  neither, because the result was refused.
- **The package as run.** P2's manifests, `30ae9fdd…` (20 of 20) and
  `37319b47…` (13 of 13), verify after the run; `run-capture.sh` hashes to
  `b9f9e35e…`, the digest in the operator's one-liner.

## Three kinds of evidence

### A. The operator's steps

- **The pre-flight (item 4).** Run from Terminal.app at 16:39:10.829Z,
  pasted into the session: `binding: 1 refusal(s)`
  (`ReviewedEnvironmentMismatch`, the five variables unset, P2's token
  named); `code binding: passed`; `stage A … 0 refusal(s)`, all thirteen
  rules evaluated, `ExecutionAlreadyFiled` and `ResetHoldPending` included
  (so r1's sealed execution beside the case passed A6); `runId
  run-v1-3d4759bf…`, `pipelineVersion pipeline-v3-3d7265b7…`; the budgets as
  reviewed; exit 64; nothing created or launched. As expected.
- **The review verdict and readiness items 1–3**, user-confirmed: the user
  wrote these sentences in their reply to the implementation session, which
  collected them in chat before presenting the launcher. Verbatim:

  > The independent review is complete: no blocking issue was found for one
  > r2 capture running alone.
  > For this r2 capture, I confirm:
  >
  > 1. I have checked the account's current terms and they permit this use
  >    for DataStrata. Model improvement is off. I approve sending the listed
  >    texts, v2 prompts, requirement rendering, schemas and carried role
  >    outputs.
  > 2. Extra usage is off. Auto-reload is off. No usage credits are enabled.
  >    No reset card or early reset has been used for this capture or will be
  >    used, including the existing pass. No managed-settings file or other
  >    policy source applies.
  > 3. My current usage readings are:
  >    * Five-hour utilisation: 17%; resets in 3 hours.
  >    * Seven-day utilisation: 68%; resetson wednesday at 5.30am ist.

  Item 1 is the data-terms approval for this capture (open decision 20,
  decided again for r2). Item 2 is five sentences by name, the fourth
  covering the existing reset pass. Item 3 gives both windows with
  utilisation and reset time; this session derived about 19:43Z and
  2026-10-21T00:00Z. Provenance: for r2 the user wrote the sentences in
  their reply; for r1 the items were shapes the session offered and the user
  sent back, and r1's checkpoint records them as such. In both cases the
  wording is user-confirmed. The reply's first line relays the independent
  reviewer's verdict, which covered the package; the readiness items were
  collected by the implementation session, not closed by the reviewer.
- **The launch.** In the implementation session's exchange with the user,
  after the launcher was presented: the user wrote "Approved. I ran the r2
  launcher from Terminal.app."; the paste that followed was empty; the next
  re-sent the pre-flight output; the user then pasted the launcher's report
  (received 17:00:20Z). These messages are the session's exchange with the
  user, not the independent reviewer's; the reviewer's verdict covered the
  package and did not close readiness. The report: the launcher's banner, then
  `status: failed`, `evidence: sealed by the manifest`, the execution path,
  `gate: pass`, `role launches: 9; gate launches: 1; ledger possibly billed:
  9; HTTP attempts: unknown`, `error: RunRefused: … REFUSED — the run did
  not produce a verification result, so nothing was written. | -
  invalid_result: Verification result is inconsistent: | - invalid_result:
  reading.elements[0] (E1-operative-obligation).evidence[0]: quote pins
  DOC-32013L0034 at hash …, but corpus[] pins it at 8822d68adb0e… |` and 119
  more of that shape, `usage stop: none`, `rate-limit events: 9`, the
  thinking note, `trust: execution failed; schema invalid; evidence
  unassessed; substantive unassessed`, `runId: none`, `transcript: none`,
  `result: none`, the summary path, `manifest: … (14 entries, sha256
  2e318748…)`, then `exit 1  USER=vivin  HOME=/Users/vivin`. The paste is
  kept verbatim in the shared notes.
- **What nothing here checks.** No code can check the account settings; A3
  passed at run time and the managed-settings directory was absent. The
  CLI's overage fields (B) are consistent with extra usage being off and
  prove none of D-6. The user's "17%" and the CLI's 0.19 at the reader's
  end (B) are two sources at two instants.

### B. CLI-reported facts

**The gate**: `loggedIn` true, `authMethod` `"claude.ai"`, `apiProvider`
`"firstParty"`, `subscriptionType` `"max"`, `analyticsDisabled` true,
`apiKeySource` and `forcedLoginMethod` absent, the identifiers present and
never reproduced; the stream byte-identical to X's, X3's, XR's and XS's
(`51dfc1d2…`).

**The init events**, line 1 of each of nine streams: `permissionMode
"default"`, `model claude-opus-5-5`, `claude_code_version 2.1.295`, `tools
["StructuredOutput"]`, `fast_mode_state "off"`, `analytics_disabled` true,
`per_turn_effort_active` true, as on XR and XS.

**The streams**, each in the known shape (one `system/status`, one message,
one request ID on both assistant items, one `thinking` block with withheld
text, `system/thinking_tokens` events, one `StructuredOutput` call whose
`input_json_delta` events concatenate to the parsed `structured_output`, the
tool result accepted by configuration, `message_delta` stop reason
`tool_use`, one `rate_limit_event`, the result). Nine distinct request IDs.
The reader's stream 2,328 lines and 28 thinking events; the adjudicator's
3,335 lines, 3,261 deltas and 59 thinking events.

**The usage the CLI reported** (`result.usage`):

| | reader | pros[0] | pros[1] | pros[2] | pros[3] | pros[4] | pros[5] | pros[6] | adjudicator |
|---|---|---|---|---|---|---|---|---|---|
| `cache_creation_input_tokens` | 132,724 | 140,511 | 136,321 | 136,324 | 136,320 | 136,327 | 136,325 | 136,320 | 157,244 |
| `cache_read_input_tokens` | 0 | 0 | 4,192 | 4,192 | 4,192 | 4,192 | 4,192 | 4,192 | 0 |
| `output_tokens` | 9,604 | 4,138 | 3,696 | 4,264 | 4,694 | 5,855 | 4,326 | 4,085 | 16,092 |
| `output_tokens_details.thinking_tokens` | 3,909 | 2,192 | 1,599 | 2,243 | 2,330 | 3,351 | 2,171 | 1,194 | 7,887 |
| per-request context (input + creation + read) | 132,726 | 140,513 | 140,515 | 140,518 | 140,514 | 140,521 | 140,519 | 140,514 | 157,246 |
| `duration_ms` | 79,860 | 39,808 | 32,407 | 38,152 | 46,478 | 53,203 | 43,372 | 39,540 | 131,269 |
| `total_cost_usd` (list) | 1.253880 | 1.206856 | 1.165334 | 1.176718 | 1.185286 | 1.208562 | 1.177966 | 1.173106 | 1.579800 |

`input_tokens` 2 on each; `result.usage.thinking_tokens` absent on all nine,
so `cliObserved.thinkingTokens` is nine nulls (the deferred observer). The
costs sum to 11.127510, list-price estimates. Known output tokens 56,754.

**The `rate_limit_event`**, one per stream, `status "allowed"`,
`rateLimitType "five_hour"`, `resetsAt` 1792353000 (2026-10-18T19:50:00Z),
`overageStatus "rejected"`, `isUsingOverage` false, no `overageEnabled`:
five-hour utilisation 0.19, 0.21, 0.22, 0.23, 0.24, 0.25, 0.26, 0.27, 0.29;
seven-day 0.68 to 0.69, resetting 1792540800 (2026-10-21T00:00:00Z).

### C. Independently checked evidence

#### C1. Recorded by the harness's and the package's own code at run time

- `synthetic` false; pin `2.1.295`, 239,695,888 bytes, `494870c9…`, not
  injected; `requested.permissionMode "default"`, effort `high`,
  `maxOutputTokens` 64,000, the `@3` settings; budgets as reviewed.
- Gate process pid 2651, exit 0, 126 ms. Role processes pids 2656, 2703,
  2743, 2774, 2799, 2840, 2880, 2905, 2935, each exit 0, no signal, 0 stderr
  bytes, prompt file removed; durations 80,055 / 39,984 / 32,603 / 38,325 /
  46,663 / 53,376 / 43,548 / 39,718 / 131,434 ms; stdin 406,585 (reader),
  425,737 to 425,752 (prosecutors), 470,763 (adjudicator) bytes; prompt files
  4,829 / 7,447 / 6,171 bytes (the v2 prosecutor and adjudicator prompts).
- Ledger: 9 of 9 attempts, 0 remaining, largest launch description 492,549
  bytes against 2,097,152, 18 known input tokens, 56,754 known output
  tokens, 9 possibly billed, HTTP attempts unobserved.
- Times: gate line 16:46:07.693Z; reader 16:47:27.941Z; prosecutors
  16:48:08.050Z, 16:48:40.783Z, 16:49:19.230Z, 16:50:06.017Z, 16:50:59.523Z,
  16:51:43.193Z, 16:52:23.034Z; adjudicator 16:54:34.605Z; drained and
  finished 16:54:34.625Z. The five-hour reset (19:50Z) fell after the run.
- `error.name` `RunRefused`; `error.message` and `lines[]` carry the 120
  `invalid_result` problems, each of the form `<path>: quote pins <docId> at
  hash …, but corpus[] pins it at <12 hex>…` — the `…` after "hash" is
  `shortHash('')`, the empty string.
- The package: claim marker made before the harness; the harness's
  execution directory sealed afterwards; `caseEntries` named only the new
  directory; the report's `runId: none` and `trust` lines as the paste
  shows.

#### C2. Checked by this session afterwards, offline

- **Manifests.** XS2's 14 entries verify, the listing equals the files
  present, none newer than the manifest. P2's two manifests verify after the
  run. XS (12 of 12), X, X3, XR and every earlier package were re-verified
  before the run (P2's `inputs-final` log).
- **Candidate.** HEAD `b7b8a1e`, the two symlinks only, before this file
  and the handoff correction were written.
- **The mode, three ways, nine times:** argv `--permission-mode default`,
  init `"default"`, record `requested.permissionMode "default"` agree on each
  launch.
- **The outputs.** For each role the joined `input_json_delta` events parse
  to the result's `structured_output`.
- **What the roles produced,** read from the streams, not from a transcript
  (none was written):
  - `reader[0]`: 18 elements, `E1-operative-obligation` to
    `E18-transposition-and-application`, `gaps []`.
  - the seven lenses, cells and challenges: `missing_criterion` 12 cells,
    `C1-missing-insurer-credit-institution-criterion`; `wrong_conjunction`
    14, `C1-legal-form-conjunct-excludes-art1-3-alternative`;
    `wrong_threshold_or_units` 7, `C1-net-turnover-measure-undefined`,
    `C2-threshold-hardcoded-subject-to-delegated-amendment`;
    `wrong_measurement_period` 12, `C1-turnover-period-unanchored`,
    `C2-financial-years-governed-not-posed`; `wrong_scope_type_or_addressee`
    13, `C1-legal-form-gate-excludes-art1-3-undertakings`,
    `C2-incorporation-vs-governing-law`; `superseded_or_miscited_provision`
    13, `C1-m8-thresholds-applied-without-temporal-standing`;
    `missing_exclusion` 13, `C1-financial-holding-derogation-missing`,
    `C2-exempted-parent-missing`, `C3-EFSF-exclusion-missing`. No lens
    reported a gap.
  - `prosecutor[3]`'s `C2`, the r1 objection in its v2 form: "The rendered
    condition does not say which financial years it governs. … The
    consolidated text of Directive (EU) 2022/2464, Article 5(2), which is not
    in the closure, would settle what the 2024–2026 scope is." — a challenge
    naming the settling document, as the v2 prompt describes.
  - `adjudicator[0]`: 12 adjudications: `MISMATCH` on P0-C1, P1-C1, P3-C1,
    P3-C2, P4-C1, P5-C1, P6-C2, P6-C3; `CONFIRMED` on P2-C1, P2-C2, P6-C1;
    `OPEN_QUESTION` on P4-C2; `gaps []`. On P3-C2 the resolution reads, in
    part, "Applied to any financial year, the condition misclassifies groups
    for financial years before 2027". **Whether any of this is right is
    unassessed**; nothing here reads the law. The verdicts are the
    adjudicator's and were refused with the rest of the record.
- **The quotes.** 120 quote items (and one `absence` item) across the
  reading, the challenges and the adjudications, over the two closure
  documents; 120 have `sha256Normalized` equal to `""`; 120 have a `text`
  that this session re-found in the corresponding normalised document after
  collapsing whitespace and lower-casing, which is the sign gate's own
  comparison (`checkEvidenceSet`). No quote names a document outside the
  closure. Text matching does not establish evidentiary support or
  substantive correctness: it says the characters occur in the document, not
  that the quote supports the proposition or that the proposition is right.
- **The contract that let it through.** `quoteEvidenceSchema`
  (`corpus/evidence.ts:86–93`): `sha256Normalized: z.string()`; the JSON
  schema the CLI enforces is derived from it and is the 2,168-byte reader
  schema r1 measured and r2 measured again, so it accepted `""` nine times.
  `reader.md` mentions the fence's hash as a fact about the document and
  never says the quote must carry it. `assertReaderEvidence` checks kinds
  only. `assertResultConsistency` checks pins, at assembly.
- **r1 beside r2.** r1's reader (XS, same prompt bytes, message differing in
  `v3`/`v4`) filled every quote's hash with the pinned value; r2's reader
  filled none. The prosecutors and adjudicator saw the reader's output
  carried into their inputs and matched its form in both runs.
- **Personal strings.** None: `vivin` and `/Users/` occur in no file of
  XS2 (there is no transcript or result path to carry them; the `lines[]`
  are the refusal). `[REDACTED]` under `session_id`, `uuid` and `cwd` as
  before.
- **The shared root.** Three entries under `csrd/CSRD-S-002`: XS, XS2 and
  P2's marker. P2's A6 would refuse a second start by the marker; a later
  package's A6 would pass, since XS2 is a directory holding `execution.json`
  and `MANIFEST.sha256`, and A7 reads its `failed` status and null
  `usageStop` as holding nothing.

## What ran, in order

The committed `@3` projection ran once per launch on nine real streams and
refused none (every `structured_output` was returned). Stage D's in-flight
stop found no fact: the largest per-request context, the adjudicator's
157,246 tokens, is below the 190,000 ceiling. The committed pipeline parsed
all nine outputs at their seams, ran every lens, ran the adjudicator,
assembled the result, and `assertResultConsistency` refused it on the quote
pins; `RunRefused` was filed; the package sealed the directory; exit 1.

## Retries and spend

Nine runner attempts, nine role processes and one gate process; no retry.
HTTP attempts unobserved. Billing not proven: nine possibly billed attempts,
list-price sum 11.127510. As the CLI reports it, the run spent 1,248,416
cache-creation tokens, 29,344 cache-read tokens and 56,754 output tokens of
which 26,876 thinking. The five-hour window moved from 0.19 to 0.29, about
0.011 per launch, as the P2 README estimated from r1's rate; the seven-day
window from 0.68 to 0.69.

## What this capture settled

- **The halt rule's other branch, live.** With the v2 prompts, no role
  halted: the objection that stopped r1 at the fourth lens was carried as a
  challenge to adjudication. One run, not a guarantee.
- **The adjudicator on real inputs, for the first time:** 157,246 context
  tokens, 131 seconds, 16,092 output tokens, twelve adjudications, every
  challenge answered, no gap.
- **The record boundary holds.** A result whose evidence does not pin the
  corpus it names is refused, after any amount of spend. That is the
  designed property. Its cost here was nine launches. The role outputs
  remain available for analysis in the sanitised streams. Empty quote hashes
  caused the observed assembly refusal. Text matching does not establish
  evidentiary support or substantive correctness.
- **A contract gap, now visible.** Nothing before assembly requires a
  quote's `sha256Normalized` to be the pinned hash, or to be non-empty: not
  the JSON schema the CLI enforces, not the prompt, not the role seam. Two
  runs on identical reader inputs gave two behaviours.
- **The context estimate, measured one step further:** the adjudicator's
  request at about 157,000 tokens, where the P2 README estimated 150,000 to
  160,000.

## Carried forward

- **Still unobserved:** billing; HTTP attempts; whether `--effort high` was
  applied; substantive correctness of the 18 elements, 84 cells, 12
  challenges and 12 verdicts; whether a model given the v2 prompts will
  again raise scope objections as challenges.
- **Open decisions this run raises:**
  1. Where the quote hash should be enforced before spend: a non-empty,
     64-hex constraint in the quote schema the CLI enforces (which moves the
     role schemas and so the measured inputs, not the identity), a seam check
     that each quote's hash equals the closure's pin for its `docId` (which
     refuses at the reader, after one launch, instead of after nine), a
     prompt sentence (which moves the identity), or more than one. None is
     made here.
  2. Whether the engine should fill the hash from the closure by `docId`
     rather than ask the model for it at all: the value is the pipeline's
     own fact about the fence the role quoted from, and a model copying a
     64-character hex string adds nothing but a failure mode. That is a
     design change to the evidence contract and is not made here.
  3. The adjudicator's eight `MISMATCH` verdicts on S-002's encoding,
     refused with the record, are nonetheless on file in the streams for a
     human reader; what to do with them is the requirement author's call.
- **The package's residuals,** unchanged, plus: a marker an operator could
  remove by hand; the adjudicator's size now measured once.

## Decisions recorded

1. **Capture first, checkpoint after.**
2. **Open decision 20 decided again for r2**, user-confirmed (A, item 1:
   the user wrote the sentence in their reply to the session).
3. **The five D-6 items recorded as five user-confirmed sentences** (A,
   item 2, written by the user in their reply to the session), including
   that the existing reset pass was not and will not be used.
4. **The usage reading recorded as given**, relative times beside the
   session's derivation and the CLI's own reset times.
5. **The review verdict recorded:** no blocking issue for one r2 capture
   running alone (relayed by the user before the launcher was presented; the
   verdict covered the package, and readiness was collected separately by
   the session).
6. **No relaunch.** P2 is spent; the marker and A6 enforce it.
7. **The quote-hash defect is documented, not repaired.** No engine code,
   prompt or schema changed. The three ways to close it are listed above
   for the user's decision.
8. **The stale "Identity" sentences in the scope handoff are corrected in
   this commit**, after the capture, as the r2 HANDOVER said they would be.
9. **Nothing further live is authorised.**

## Handed forward

- **The next decision is the user's:** which repair of the quote-hash
  contract to make, and then a new package bound to the HEAD that carries
  it. A rerun of `CSRD-S-002` under any new package files beside XS and XS2;
  P2's marker stays.
- **The shared hold root** stays the execution root, now holding five
  records (X, X3, XR, XS, XS2), none holding.
- **A future live run needs,** as before: a new reviewed package bound to
  the HEAD at that time; the readiness step afresh (the data terms for that
  capture, the five D-6 items, both usage windows with absolute reset times,
  the operator's pre-flight); a separate approval.
- **Open decisions, unchanged:** the thinking-count observer; the harness's
  absolute paths in records that carry them; the 190,000 ceiling's
  confirmation; the gap-versus-challenge behaviour on real inputs beyond
  this one run.

## Process notes

- **Who.** The session that recorded r1's checkpoint, built the identifier
  contract and the v2 prompts, and prepared P2; it collected the readiness
  items in chat (the user relaying the independent reviewer's verdict in the
  same reply), presented the launcher after them, and took the operator's
  steps — the approval message, the empty paste, the re-sent pre-flight and
  the report — from its own exchange with the user and the Terminal.app
  pastes.
- **Write locations.** In the candidate: this file and the one handoff
  correction. Outside the repository: the shared side-session notes
  (the pastes verbatim, the readiness items verbatim, the record's reading);
  nothing under `pilot-evidence/` after the run.
- **Reads.** XS2 in full (`execution.json`, `attempts.jsonl`,
  `launches.jsonl`, the ten streams) through `python3 -I` scripts; P2's
  manifests and launcher; the committed `corpus/evidence.ts`, `reader.ts`,
  `result.ts` by search; the two normalised closure texts for the quote
  re-finding; XS's transcript for r1's quote hashes.
- **What ran.** Hashing, listing, `stat` under `TZ=UTC`, `git
  --no-optional-locks` queries, Python scripts (standard library only). No
  Claude Code, `ollama` or Node binary, no test, no network, no subagent.
- **b1b-record.** No command, nothing read.
