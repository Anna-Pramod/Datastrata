# Handoff — CSRD-S-002's scope against the timing requirements, and the v2 role guidance, after the capture's temporal objection

Written on 2026-10-18 (+0530), 2026-10-18 UTC, in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD `2b4d9ca`, the identifier
contract). Offline: no inference, network, subagent, live run, closure
expansion or capture package; `pipeline-live.agents.test.ts` not run;
`b1b-record` untouched; the filed execution and the frozen packages verify
unchanged (below). The user runs every `git add` and `git commit`.

## 1. The determination

**The case.** In the S-002 capture, `prosecutor[3]` (lens
`wrong_measurement_period`) raised two challenges and one gap. `C1`: the
encoding gives no measurement point for the turnover criterion. `C2`: "the
encoding tests the thresholds without saying which financial years they
govern", citing Article 5(2) of Directive (EU) 2022/2464 as amended. The gap
asked for that Article 5(2) because "the full point (a) criteria for
financial years 2024–2026 cannot be read" from the closure.

**What the pack already distinguishes.** Two questions, three requirements:

| Question | Requirement | Condition | Cites |
|---|---|---|---|
| Does the group meet the consolidated size thresholds? | `CSRD-S-002` (Consolidated scope, `direct_legal`) | EU incorporation, Accounting-Directive form, parent, turnover > 450 000 000, employees > 1 000; **no financial-year operator** | `SRC-001` Article 29a(1) |
| Was it a first-wave (FY2024) reporter? | `CSRD-S-003` (Wave history, `timing_context`) | `entity.reported_csrd_fy2024` | `SRC-002` Article 5(2) |
| Is it relieved for FY2025–26 by the national option? | `CSRD-S-004` (Transition exemption) | `fy_start_year_in [2025, 2026]`, below either threshold, Member State option | `SRC-002` Article 5(2), fifth subparagraph |
| Must it report? | `CSRD-S-014` (Reporting duty) | `S-001 or S-002` APPLIES **and not** (`S-004`, `S-005`, `S-006`) | `SRC-001` Articles 19a(1), 29a(1) |

So "meets the consolidated size thresholds" is S-002. "Must report" is
S-014, which composes the threshold results with the exemptions — S-004
directly, S-003 not at all — and whose own caution delegates the first
reporting year and the filing calendar to the national overlay (S-013) and
the timing rules. S-003 and S-004 carry the Article 5(2) timing facts the
pack has encoded so far. The reporting calendar as a whole is not implemented
here and this handoff does not implement it. No sibling is needed.

**Challenge or missing evidence?** `C2` is a **challenge to S-002's
encoding, decidable from the closure**, not a question that needs Article
5(2):

- Article 29a(1), first subparagraph (`32013L0034.txt:2309`, M8, and the
  amending instruction at `32026L0470.txt:581–585`, both in the closure)
  states the thresholds, the measurement point ("on its balance sheet
  date") and the averaging period ("during the financial year"), and
  carries no financial-year applicability of its own.
- S-002 encodes exactly that provision and cites exactly that locator. The
  encoding is right to carry no financial-year fact; an adjudicator with the
  closure can confirm it against Article 29a(1) itself.
- Article 5(2) governs when Member States *apply* the measures. The pack
  encodes that in S-003/S-004 and composes it in S-014. The dates that
  matter under the current thresholds (post-2027; the 2025–26 derogation)
  are in the closure in the amending text (`32026L0470.txt:963–1058`); what
  the closure lacks is the 2024–26 point (a) criteria (`32022L2464.txt:
  1992–2000`), which bear on S-003/S-004's question and not on S-002's.

The gap was therefore a **halt the lens did not need**: the prosecutor
converted an out-of-scope timing question into an evidence gap. A genuine
gap — a document needed to read or compare the encoded condition — is a
different thing, and nothing here changes how one is handled.

`C1` is a legitimate measurement-period challenge about the rendered labels
("consolidated net turnover" carries no "on the balance sheet date"); it
is decidable from Article 29a(1) in the closure and is the adjudicator's to
weigh. It is not corrected here: the fact-type labels are shared with S-001
and rendered into the recorded S-001 transcripts.

## 2. The smallest supported correction, and why it is this one

**What was corrected (review-sheet wording, narrowed on review).**
`CSRD-S-002`'s `plainEnglish` now ends: "This is the consolidated size test
only; it does not decide whether or when the group must report. CSRD-S-014
composes the threshold and exemption results into the reporting duty, and
the financial-year questions rest with CSRD-S-003, CSRD-S-004 (Article 5(2)
of Directive (EU) 2022/2464) and the national overlay (CSRD-S-013)." Its
`version` is 4, and `verification/requirement-versions/csrd.json` binds
version 4 to the whole-record hash
`71356cd08addf4a1ca6e2363ecac94be1dcc5790822217a7c1e369ac95180a35`
(computed with the engine's own `requirementSha256`; as a control, HEAD's v3
text reproduced the recorded v3 digest `bfd77b17…` exactly; the first
draft's wording, hash `ea61cd4c…`, was never committed). S-001's `caution`
already says the same of the individual test; S-002 now says it too.

**The roles never see `plainEnglish`.** The review found the correction
incomplete for that reason, and it was: the verification roles needed the
distinction too. That is section 2a below, the v2 prompt set. The reasoning
that follows explains why the first pass stopped at the review sheet — every
other lever was bound by a frozen artefact — and section 2a is how the prompt
lever was then taken without touching any of them.

- *Role guidance (the prompts).* `requestSha256` digests the prompt file's
  text and `promptSha256` into every recorded exchange
  (`request-identity.ts`), and the recorded CSRD-S-001 transcripts under
  `test/verification-transcripts/` bind the current prompt digests
  (`4d21d2b9…`, `87eb0a21…`). Any prompt edit makes every replay a
  `TranscriptReplayError`; re-recording is a live run. The two identity
  literals (`pipeline-identity.test.ts:752`, `live-capture.test.ts:4576`)
  would move as well.
- *The rendered condition, title or locators.* Rendered into the same
  recorded messages for S-001 (labels and templates are shared), and `title`
  and `locators` are recorded in the goldens.
- *`caution`.* The field designed for this note — but four goldens record
  S-002's caution verbatim (`test/golden/provenance-engine-golden.json`,
  `migration-engine-golden.json`, and the two frontend public goldens), the
  provenance golden compares whole determinations, and goldens are read,
  never written, with no regeneration path.
- *`plainEnglish`* is in none of them: the roles are never shown it, the
  goldens do not record it, and it is rendered to reviewers in the review
  sheet (`review-sheet.ts:1355`, `<p class="plain-english">`). It is also
  outside `requirementInputSha256` (`canonical.ts`), so the verification
  input is unchanged.

**What is unchanged, deliberately.** No renderer, no corpus entry, no closure
edge, no traversal policy, no change to the halt rule: a gap still stops the
run and skips the adjudicator, and the engine still classifies it out of
corpus metadata (the identifier contract). What *did* change beyond the
requirement text is in section 2a: the prosecutor and adjudicator prompts
(v2), two small engine additions that version the prompt set and let the run
path take a prompt set (`prompts.ts`, `run.ts`), and the tests that pin
identities.

## 2a. The v2 role guidance: a challenge the closure can carry, against a document a judgment needs

**The change.** The prosecutor and the adjudicator prompts gain one
distinction; the reader's prompt is byte-identical, because the blind
reader's isolation is the point of it.

- *Prosecutor* (`prompts/verification/prosecutor.md`, new section "A gap and
  a challenge are different findings", and rule 3 pointing at it): a gap is
  for a document the lens **needs** — without its text the cell or challenge
  cannot be stated or quoted. An objection the prosecutor can state and quote
  from the closure is a **challenge**, even when an outside document would
  strengthen or settle it; the statement names that document, and the
  adjudicator may leave it `OPEN_QUESTION`, a recorded outcome. Whether the
  encoding ought to cover a question it does not pose — when a provision
  applies, which periods it governs, how it is phased in — is a challenge
  about scope where the closure holds the text that supports it; where
  assessing it needs text the closure does not hold — the provision stating
  the omitted exception or applicability condition is itself out of reach —
  the prosecutor reports the gap and halts. The distinction is evidence
  availability, not the kind of question: an objection the closure can
  evidence is a challenge, and a comparison the closure cannot support is a
  gap, including for an omitted exception or applicability condition. A
  genuine gap is still a gap.
- *Adjudicator* (rule 4): halt only for a document **necessary** to
  adjudicate — without which no verdict can be reached or honestly left open.
  A challenge an outside document would settle, but that the closure lets the
  adjudicator state and bound, is `OPEN_QUESTION` with evidence showing why;
  that blocks signing, which is what a missing deciding document warrants.
  Where the text needed to assess an omitted exception or applicability
  condition is itself unavailable, that is a gap, and the adjudicator halts.
- Neither prompt names a requirement, tells the model to accept any
  encoding, or tells it to drop temporal objections; both keep the output
  contract's last line. Nothing in the engine bypasses a gap: a gap still
  halts (`pipeline-gap-vs-challenge.test.ts`, the halting fixtures).

**Versioned, with its identity.** The superseded set is kept byte for byte
as `prompts/history/v1/` (beside `prompts/verification/`, which keeps exactly
the three current files) (digests `4d21d2b9…`, `87eb0a21…`,
`f38ba1f0…`), the current set is v2 (`4d21d2b9…` unchanged, `9c0ecc66…`,
`cea3e6f0…`); `prompts/VERSIONS.md` records both.
`src/pipeline/prompts.ts` gains `CURRENT_PROMPT_SET_VERSION`,
`HISTORICAL_PROMPT_SET_VERSIONS`, `historicalPromptPath` and
`loadHistoricalPromptSet`, each file by its own literal path (the tracer rule
in that module's header). The identities move with the set: over S-002's
closure the current set derives `pipeline-v3-a0f59e79…` (HTTP),
`…a408775f…` (@1), `…9599bc1e…` (@2) and `…3d7265b7…` (@3); the kept v1 set
still derives `…06789a36…`, `…fd3ed34d…`, `…737f8d50…` and `…ecb06a30…`, the
identities the S-001 recordings, the probes, the rehearsal and the S-002
capture carry. Both sets of four are pinned in `pipeline-identity.test.ts`,
the v2 @2 and @3 values also by that file's hand-written derivation over the
current files; `live-capture.test.ts`'s harness literals move to the v2
values, with the v1 values noted beside them.

**Historical recordings replay against their historical contract.** A
recording binds its prompts by `promptSha256` on every exchange and by the
prompt text inside `requestSha256`, so the committed CSRD-S-001 recordings
can only ever be asked their question under v1. `RunCapabilities` on the CLI
run path gains an optional `prompts` (default: the current set), and the
replay tests pass `loadHistoricalPromptSet('v1')` through the same production
`dispatch(['run', …])` path they always used. No recording was edited, no
digest check relaxed, nothing re-recorded. The S-002 capture transcript's
digests are v1's, so it too remains replayable (asserted).

**Fixtures, and what they do not show.** `pipeline-gap-vs-challenge.test.ts`
drives the production orchestration with **synthetic, labelled stub
outputs** under the v2 prompts: the capture's objection raised as a
challenge continues to the adjudicator, who leaves it `OPEN_QUESTION`, and
the run is not halted; the same prosecutor asking for an unreached document
as a gap halts before adjudication; a document the corpus lacks halts the
same way; and the adjudicator can still halt on a document it needs. The
historical-contract check reads the repository's own committed CSRD-S-001
recording (`test/verification-transcripts/…/run-v1-8717925d….json`, filed
under the HTTP identity over v1), whose every exchange carries the v1
digests; no test reads anything under `pilot-evidence/`. These show what the
pipeline does with each shape a role may return. They do not
show that a model given the v2 prompts will choose the right shape; only a
live run can, and none was made.

## 3. Verification

### 3a. Earlier results, before the v2 guidance (first pass: review-sheet wording only)

- **Red first**: `knowledge-scope-vs-timing.test.ts` against the unedited
  pack — `1 failed | 5 passed (6)`, the failure `AssertionError: CSRD-S-014:
  expected 'A parent undertaking falls within Art…' to contain
  'CSRD-S-014'`; the five structural tests passed, which is the evidence
  that the pack already kept timing out of S-002 (`scope-red.*.log`).
- **Control**: the engine's `requirementSha256` over HEAD's S-002 v3 text
  equals the registry's recorded v3 entry `bfd77b17…`.
- **Green**: the new file plus `knowledge-integrity`, `knowledge-provenance`,
  `provenance-golden`, `migration-golden`, `verification-registry`,
  `cli-sign`, `cli-review-sheet`, `pipeline-identity`, `golden-profiles`:
  10 files, 300 passed. The goldens pass unchanged, which is what
  `plainEnglish`'s absence from them predicts.
- **What the regression pins** (six tests): S-002's text names S-014, S-003,
  S-004 and Article 5(2) and is at version 4; S-001 carries the matching
  note; S-002's condition has no temporal operator while S-004's has
  `fy_start_year_in [2025, 2026]` (with the regex's own positive and
  negative control); S-003 and S-004 cite `SRC-002` Article 5(2) and S-002
  cites `SRC-001` Article 29a(1) only; S-014 references S-002 (APPLIES) and
  S-004; and `requirementInputSha256(S-002)` still equals the digest the
  capture filed, `fecc5050…`, with a widened condition as the control that
  the digest can move.
- **No mutation campaign**, as instructed. The red-first run is the
  evidence that the statement test can fail.
- **Full engine suite, first run** (`tests-scope.20261018T134131Z.log`): `Test Files 2 failed | 77 passed (79)`,
  `Tests 3 failed | 3108 passed (3111)`, `vitest exit 1`. The three failures
  were not in the correction's own tests: `min-status.test.ts › the version
  registry after the bump › records every requirement at version 3 …` and
  `… has appended version 3 and nothing beyond it`, and
  `pipeline-source-completeness.test.ts › the migrated pack cites exactly
  what the audit determined`, each `AssertionError: CSRD-S-002: expected 4
  to be 3`. All three hard-coded "every requirement at version 3", a
  snapshot of the earlier v3 bump; a version bump on any requirement was
  always going to red them, and that is what they are for.
- **The two test edits, disclosed.** `min-status.test.ts` now declares the
  current version per requirement (`CURRENT_VERSION`: S-002 → 4, every other
  → 3), checks each requirement's content hash against *its* current
  registry entry, keeps the version-3 digest bound for every requirement
  (a later version appends, never rewrites), and requires the registry to
  hold exactly versions 1 to the current one — with S-002's `4` present and
  S-001's absent as the pair of controls. `pipeline-source-completeness
  .test.ts` keeps the audit's source sets untouched and expects version 4
  for S-002 alone, with a comment saying why. The frozen historical-digest
  table (32 entries) and the "three versions distinct" test are unchanged.
  Neither edit touches a golden or a recorded transcript.
- **After the edits**: `min-status`, `pipeline-source-completeness`,
  `knowledge-scope-vs-timing`, `verification-registry`: 4 files, 85 passed;
  `npx tsc --noEmit` exit 0 (`typecheck-scope-3`).
- **Typecheck, earlier**: the first `npx tsc --noEmit` failed with six errors,
  all in the new test file (an optional `condition`, and a locator union
  whose `whole_document` member has no `text`); the test was corrected to
  narrow both. No source file was involved.
- **Frontend workspace** (`tests-frontend-scope.*.log`): `Test Files 8 passed
  (8)`, `Tests 50 passed (50)`, `vitest exit 0` — the two public goldens
  unchanged.
- **Before the v2 guidance — full engine suite after the test edits** (`tests-scope-2.20261018T134535Z.log`): `Test Files 79 passed (79)`,
  `Tests 3111 passed (3111)`, `vitest exit 0` — the r2 baseline's 3,105 plus the six
  added here, every recorded transcript replayed, both engine goldens
  compared whole and unchanged.

### 3b. Final verification, over the complete change (prompts v2, versioning, fixtures, wording)

These are the only results that describe the state offered for commit;
everything in 3a predates the v2 guidance.

- **Focused checks** (after the final wording of the gap rule):
  `pipeline-gap-vs-challenge`, `pipeline-identity`, `pipeline-replay`,
  `knowledge-scope-vs-timing`, `pipeline-prompt-boundary`, `live-capture`:
  6 files, 334 passed; `npx tsc --noEmit` exit 0.
- **Full offline engine suite** (`tests-final-v2.20261018T145528Z.log`; the
  default config, offline and process guards in place, `*.agents.test.ts`
  excluded): `Test Files 80 passed (80)`, `Tests 3126 passed (3126)`, `vitest exit 0`.
- **Engine typecheck** (`typecheck-final-v2.20261018T145525Z.log`): `npx tsc --noEmit`
  exit 0.
- **Frontend workspace** (`tests-frontend-final-v2.20261018T145525Z.log`): `Test Files
  8 passed (8)`, `Tests 50 passed (50)`, `vitest exit 0` — the two public goldens unchanged.
- **Preserved**: `prompts/history/v1/*.md` hash exactly as HEAD's
  `prompts/verification/*.md` (`4d21d2b9…`, `87eb0a21…`, `f38ba1f0…`);
  `test/verification-transcripts/` has no change in `git status`; the S-002
  execution's manifest verifies 12 of 12 and nothing under `pilot-evidence/`
  is newer than it; no test added here reads `pilot-evidence/`.
- **Control retained**: the kept v1 set reproduces all four historical
  identities (`06789a36…`, `fd3ed34d…`, `737f8d50…`, `ecb06a30…`) through
  the builder, asserted in `pipeline-identity.test.ts`.

## 4. User-visible behaviour after this change

- **Assessment output** (`assess`): unchanged. The determinations table
  prints `caution`, not `plainEnglish`, and S-002's caution is as before.
  S-002 still answers only whether the group meets the consolidated
  thresholds; S-014 still answers whether it must report, taking S-004's
  FY2025–26 relief into account.
- **The review sheet**: S-002's plain-English paragraph now tells the
  reviewer that it is the size test only and where the financial-year
  question is decided. A reviewer reading a future S-002 dossier with a
  temporal challenge or gap can dispose of it against that statement.
- **The verification pipeline**: unchanged. If a prosecutor again asks for
  Article 5(2) as a gap, the run still halts there, now filed honestly as a
  `closure_gap` over `DOC-32022L2464` (the identifier contract). If it
  raises the point as a challenge instead, the adjudicator decides it from
  Article 29a(1) in the closure. Nothing offline can steer which of the two
  the role does; that is the one thing a prompt edit could add, at the cost
  of re-recording every transcript.
- **Identity**: `requirementInputSha256`, the closure pin, the `runId`
  derivation and the `pipelineVersion` are unchanged. The reader's input
  for S-002 now says `v4`, and a future result records `requirementVersion
  4` against the registry's new entry.

## 5. Binding, and commit

A later capture package binds to the committed state after this work: the
new HEAD, with `knowledge/csrd/requirements.json` and
`verification/requirement-versions/csrd.json` at their new digests (both are
in the r1 binding's 27-file list, so no spent package's binding is
disturbed, and none could be reused anyway).

```sh
cd /Users/vivin/Documents/DataStrata/b1b-opus55-candidate && git add backend/engine/knowledge/csrd/requirements.json backend/engine/verification/requirement-versions/csrd.json backend/engine/prompts/verification/prosecutor.md backend/engine/prompts/verification/adjudicator.md backend/engine/prompts/history/v1 backend/engine/prompts/VERSIONS.md backend/engine/src/pipeline/prompts.ts backend/engine/src/cli/run.ts backend/engine/test/pipeline-gap-vs-challenge.test.ts backend/engine/test/pipeline-identity.test.ts backend/engine/test/pipeline-replay.test.ts backend/engine/test/live-capture.test.ts backend/engine/test/knowledge-scope-vs-timing.test.ts backend/engine/test/min-status.test.ts backend/engine/test/pipeline-source-completeness.test.ts docs/superpowers/HANDOFF-2026-10-18-s002-scope-vs-timing.md
```

```sh
cd /Users/vivin/Documents/DataStrata/b1b-opus55-candidate && git commit -m "Tell the prosecutor and adjudicator when a halt is the wrong finding, and keep every recording replayable under the prompts it was made with

The S-002 capture's fourth prosecutor turned a scope objection it could state
from the closure into an evidence gap for Article 5(2) of Directive 2022/2464,
and the run stopped before adjudication. The v2 prosecutor and adjudicator
prompts distinguish a challenge the closure can carry, which the adjudicator
may leave open, from a document a judgment genuinely needs, which still
halts; the reader is untouched. Because a recording binds its prompts by
digest, the v1 set is kept byte for byte and historical recordings replay
against it through the same run path, with the identities of both sets
pinned. S-002's plain-English text now says it is the size test only, at
version 4; the tests that froze every requirement at version 3 declare the
current version instead."
```
