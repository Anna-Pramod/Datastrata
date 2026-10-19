# Checkpoint — E, the Article 1(4) exclusion, landed as one reviewable change: both size tests refuse an excluded entity and leave an unknown status unresolved, the fixtures state the fact, the public checker asks it, the two provenance goldens are rewritten once, and a sixth synthetic S-001 generation replaces the retired adapter-era recording

Written on 2026-10-19 (UTC) by the session started from
`HANDOFF-PROMPT-for-a-new-session-E-landing.md` in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD `b1790d1`: the r5 checkpoint
`1a87f7e` plus the two document commits of the previous session, `6860df8`
the C/G design and `b1790d1` the dispositions). Every time below is UTC.

- **Scope of this change.** The pack (`fact-types.json`, `questionnaire.json`,
  `requirements.json`), the version registry, the engine test tree (three
  new or regenerated artefacts: the exclusion test file, the historical
  version-3 fixture, the sixth S-001 recording with its `PROVENANCE.md`),
  the two provenance goldens, the public checker (`lib/checker.ts`,
  `app/api/check/route.ts`, `components/marketing/CheckFlow.tsx`), the
  frontend test fixtures, the standalone harness's request body, the
  dispositions document and this file. **No module under
  `backend/engine/src/` changed**, no prompt file, no corpus file, no
  migration golden, and no recorded transcript's bytes. Nothing is committed
  by the session: the user runs every `git add` and `git commit`.
- **Where the evidence is.** The shared side-session notes folder
  `local_043075c1-dc26-44e4-b3a9-257ce611215c/`: the previous session's note
  `2026-10-19T1550Z-e-exclusion-and-cg-design.md` (the patch, the red-first
  file, the three teeth checks, the dry assessment and its exact failing
  assertions) and this session's `2026-10-19T1706Z-e-landing.md` with its
  folder (`before/` the pre-change goldens, `PROVENANCE.md` and
  `requirements.json`; `diffs/` the two golden diffs, the provenance diff and
  the full change diff; `logs/` every run named below, including both frozen
  evidence verifications; `scripts/` every edit and generation script;
  `MANIFEST.sha256`). Nothing under `pilot-evidence/` was created, changed or
  deleted; the frozen records verified identically before and after (XS
  12/12 `35268592…`, XS2 14/14 `2e318748…`, XS3 7/7 `e2c458e3…`, XS4 16/16
  `e435e42d…`, XS5 16/16 `cd70ae8a…`, P5 20/20 `1c85e586…` and 13/13
  `f5b67dfa…`, launcher `602a4143…`, nothing newer than XS5's manifest).

## What was found

The r5 capture's one supported encoding defect (`P6-C1`, disposition E):
Article 1(4) of Directive 2013/34/EU, as replaced by Directive (EU)
2026/470 Article 2(1)(b), says Articles 19a, 29a and 29d do not apply to the
European Financial Stability Facility or to the financial products listed in
points (b) and (f) of Article 2(12) of Regulation (EU) 2019/2088. Neither
size test carried the exclusion, so an excluded undertaking meeting every
threshold read as in scope.

The previous session implemented the correction red first in a scratch copy
and stopped, as its hand-over required, because the dry assessment showed
the change reaching beyond the pack: 28 engine reds (the provenance engine
golden, seven golden-profile assertions over P-001, P-003 and P-004, and
twenty replay bindings on `run-v1-d9d6415d…`, the identity S-001 derives at
version 4 that no recording answered) and one frontend red (the provenance
public golden), every one because the existing fixtures lacked the new fact
or because S-001's verification input had moved. Reproduced in the
candidate at the start of this session, exactly (`logs/task2-5-red-before-fixtures.log`).

## What was decided

The user's decision, verbatim:

> Proceed with E as one complete, reviewable change. This explicitly authorizes the following supporting updates:
>
> 1. Apply the held patch to both requirements: S-001 v4 and S-002 v5. Preserve all existing registry entries.
> 2. Add an explicit yes/no/unsure exclusion question to the public checker and wire it through to the profile. No preselected "no", inferred exemption answer or default false. Unanswered/unsure stays unresolved. Explain that the missing answer needs clarification; do not tell users the law itself is ambiguous merely because they have not answered.
> 3. Give the synthetic P-001/P-003/P-004 fixtures and the provenance fixture explicit "not excluded" facts where that is their intended scenario. Keep separate excluded and unknown cases. Do not introduce a shared default that hides missing inputs.
> 4. Update the two provenance goldens as an explicit reviewed change after the fixtures and UI are correct. Explain the meaningful before/after differences; do not simply accept the current cascade of unresolved results.
> 5. Add one new offline synthetic S-001 replay generation using the canned transport and network trap. Preserve every existing transcript byte-for-byte; update retirement/provenance metadata without erasing history. Make the new generation and replay tests use matching requirement, prompt and grammar versions. Retain a historical replay check against the preserved pre-change inputs. Do not weaken identity checks or relabel synthetic output as model evidence.
>
> Complete focused checks, then the relevant engine/frontend suites and typechecks once the change is complete. Return the full diff, golden comparison, replay provenance and saved results for review. No further mutation campaign is needed.
> C/G remains design-only. The correction that pre-2027 first-wave eligibility cannot depend on the new thresholds is accepted in principle; do not implement the composition yet.
> No live run, capture package, promotion, signing, publishing or commits. Do not stop again merely because these expressly authorized fixtures, goldens or synthetic replay bindings change.

One decision taken in the hand-over and kept here: the fact's
`missingReason` is `missing_fact`, not `legal_ambiguity`. The patch had
matched the sibling identity gate `entity.legal_form`, but the public
checker renders `legal_ambiguity` as "The law is ambiguous here", which
point 2 forbids for an unanswered question; `missing_fact` renders "A fact
we need is missing", and the `needs` line names the exclusion question. An
absent or unsure answer is INDETERMINATE under either code; only the
explanation changes. The previous session's teeth check 2a (dropping the
missing reason) therefore no longer discriminates and was not re-run; its
teeth 2b (a default-false mutant in `facts.ts`, "expected 'APPLIES' to be
'INDETERMINATE'") remains the engine-side evidence that an unknown status is
unresolved, and this session's teeth 3 is the public-path counterpart.

## What landed

**The correction (Task 1).** The held patch
(`e-article-1-4-exclusion.patch`, sha256 `d49f536b…`) applied cleanly; all
nine post-patch digests match the previous note; the registry holds
`CSRD-S-001` 1–4, `CSRD-S-002` 1–5 and every other requirement 1–3, every
pre-existing entry untouched. The fact `entity.excluded_by_article_1_4`
(boolean, `legal_entity`, `missingReason: missing_fact`), the question
`Q-039` (order 39, shown once the entity is EU-incorporated with a known
legal form), and `{op: not, of: {op: eq, fact, value: true}}` as the last
conjunct of each size test's ALL with an `Article 1(4)` locator on `SRC-001`
beside the threshold provision. Digests, through the engine's own modules:

| Requirement | `requirementSha256` (registry entry) | `requirementInputSha256` | `renderedConditionSha256` |
| --- | --- | --- | --- |
| CSRD-S-001 v3 (before) | `026154c0…` | `9b8b8436fee1e7db7b3bfe7da9f3f47e32522858c1e982a2038921a6f50dbd8f` | `ee7f97a38bf165dec2a45bd3c44043d2acede8073812d93b85207afff94722a4` |
| CSRD-S-001 v4 (now) | `ea6ec4932a8c6ccda873ea8a0b08d63a64d7ab84037f19ec0a7b17ce69367fa0` | `340cf51442b1e30349f2d4863d479bcff32d19a1dc2b6da7da1c81b62546849d` | `3bd1ae18f61248241c32ce4510744c1e48a88a953f38e6f04a22fb866297d8a8` |
| CSRD-S-002 v4 (before, the r1–r5 records) | `71356cd0…` | `fecc50505cb4779323b70203924c012b783bf5186e34ecf9ed4d3df20b6fea95` | — |
| CSRD-S-002 v5 (now) | `0ea6f4ddefe8a09fc71f70227307bc63d85f5893b887f02958f27807b22a3f72` | `93ad5a911f14aac849dc95dfde262ce7a260eae9a162626b0c1d006b0592610f` | — |

The control "EQUAL (control holds)" printed for both current entries. The
new test file `knowledge-article-1-4-exclusion.test.ts` (16 tests: excluded
is out with no reason code, not excluded is in, absent and unknown are
INDETERMINATE naming the fact with `missing_fact`, the encoding as authored,
the registry read from the files, the input digests with their positive
control) is green; so are the eleven focused files (402 tests).

**The fixtures (Task 2).** P-001 (`e1`), P-003 (`parent`) and P-004 (`sub`)
in `golden-profiles.test.ts` and `fixedProfile()` in
`provenance-golden.test.ts` state
`.bool(<scope>, 'entity.excluded_by_article_1_4', false)` with a one-line
comment each; `euEntity()` in `helpers.ts` is unchanged (no shared default);
the excluded and unknown cases live only in the exclusion test file. The
golden profiles went from 7 red to 28/28. On the public side,
`check-response.test.ts` gained four cases, red first: `exclusion: 'no'`
with an in-scope EU profile → S-001 APPLIES with no reason and nothing to
resolve; `'yes'` → DOES_NOT_APPLY with no reason, no needs, the `Article
1(4)` locator; absent and `'unknown'` → INDETERMINATE, reason `missing_fact`,
copy "A fact we need is missing" and not "The law is ambiguous here",
`needs` exactly the fact with the label "Whether Article 1(4) excludes the
entity (answer needed)". `exclusion: 'no'` was then stated, with a comment,
in `EU_ABOVE_THRESHOLD`, in `ANSWERS` of
`status-truth-boundary-public.test.ts`, in `ANSWERS` of
`public-resolver-seam.test.ts` (not in the hand-over's list, but the same
"widest slice the check reaches" comment, so judged the same way), in
`FIXED_ANSWERS` of `provenance-public-golden.test.ts` and in
`CHECK_REQUEST_BODY` of `scripts/standalone-harness.mjs`, the answers JSON
`deployment-projection.ts` reads ("answering every question"). The
historical goldens' answers (`migration-public-golden.test.ts`) and
`migration-golden.test.ts` were left alone; their artefacts' sha256 are
unchanged (`33f3addd…`, `7bcdb241…`).

**The public checker (Task 3).** `CheckerAnswers.exclusion?: 'yes' | 'no' |
'unknown'`; `buildAssessmentInput` states the boolean fact for `'yes'` and
`'no'` and nothing for `'unknown'` or an absent answer — no default in
either direction; `FACT_COPY` names the missing answer; the route's zod
schema accepts the enum; `CheckFlow.tsx` asks the question directly after
the legal form, for every entity, through `Chips` over `YES_NO_UNSURE` with
nothing preselected, `why` reading "Q-039 · Article 1(4) removes both from
Articles 19a and 29a. 'Not sure' leaves the size tests unresolved until
clarified." Verified through the tests, not a browser. Teeth 3
(`logs/teeth-3-checker-default-false.log`): a mutant pushing the fact
unconditionally, so that an absent or unsure answer reads as `false`,
reddened exactly the absent and "I'm not sure" cases — "expected 'APPLIES'
to be 'INDETERMINATE'" — and the file was restored from a copy taken first,
hash equal (`78f37f86…`), 8/8 after.

**The two provenance goldens (Task 4).** The expected diff was written down
before generating. Two one-off scripts in the session scratchpad (copies in
the notes folder; none added to the repository) reproduced each test's
serialisation exactly — `canonicalPretty(assess(csrdPack(), fixedProfile(),
ctx('2027-01-01', '2027-12-31', 'e1')))` and
`serialise(buildCheckResponse(csrdPack(), FIXED_ANSWERS, '2026-07-26'))` —
into the scratchpad; the diffs against the before state were read in full
before anything was installed, and the installed diffs are byte-identical to
them (headers aside).

- *Engine* (`test/golden/provenance-engine-golden.json`, `2b2a0e00…` →
  `69b268f5…`; 4 hunks, +58/−4 lines): S-001's `locators` gain "Article
  1(4)"; S-001's trace becomes "all of 5" with one new last child, a `not`
  node (APPLIES) over an `eq` node (DOES_NOT_APPLY, detail
  "entity.excluded_by_article_1_4 (false) == true") whose `factsUsed` carry
  the fact with value `false` from the test fixture; S-002's `locators` gain
  "Article 1(4)" and its trace becomes "all of 6" with the same new child.
  S-001 stays APPLIES and S-002 DOES_NOT_APPLY; reasons, `needs`,
  obligations, gaps, `nextQuestions` (no Q-039), `summary`, `changeWatch`,
  `context` and `containsDraftContent` are identical to the before state,
  checked field by field.
- *Public* (`frontend/web/test/golden/provenance-public-golden.json`,
  `de987c8b…` → `3e418c6a…`; 2 hunks, +4/−2 lines): the same two locators,
  nothing else — counts 4 / 6 / 3, headline, obligations, gaps and
  `nextQuestions` identical.

Both golden tests pass byte for byte (engine 12/12 beside
`migration-golden` 6/6; public 12/12 beside `migration-public-golden` 4/4),
including each file's independent oracle (the audit's sources and the
authored provenance's locators) and its transition layer against the
unchanged historical generation.

**The sixth S-001 generation (Task 5).** `RETIRED.adapterEra` and
`SUPERSEDED_RUN_IDS` gained `run-v1-8717925d…` (appended, order preserved);
the byte-for-byte test pins its digest `def7f7fc…` as the fifth. Red first:
with the adapter-era recording retired and no new one yet, 58 of the replay
file's 79 tests failed, 52 of them on `committed()` finding no current
recording. The recorder's provenance text was rewritten (six generations,
the adapter-era row retired 2026-10-19, the E paragraph) and
`test/record-replay-fixture.ts` ran offline from `backend/engine`:

```text
Recorded 9 role exchange(s) through anthropic-messages@1 over a canned transport (9 canned answers, network trap unfired)
  runId           run-v1-fc345f42bea3a9677b8c827da42ce47f3b195588bb4cd1d489371c9a42c6015a
  pipelineVersion pipeline-v3-06d40e116109b94dcd219bcd5fa468840a85c8a6a556cf4ac6264ef3ed32b5b7
```

| Generation | `runId` | Status | File sha256 |
| --- | --- | --- | --- |
| pre-D1(a) | `run-v1-764e571e…` | retired 2026-08-27 | `91ad7485…` (unchanged) |
| provenance-era | `run-v1-e77e9d0d…` | retired 2026-09-05 | `84e3d2ca…` (unchanged) |
| standing-era | `run-v1-a6743df7…` | retired 2026-09-05 | `534ffe43…` (unchanged) |
| prompt-era | `run-v1-14b51960…` | retired 2026-09-06 | `0d71e28a…` (unchanged) |
| adapter-era | `run-v1-8717925d…` | retired 2026-10-19 | `def7f7fc…` (unchanged) |
| exclusion-era | `run-v1-fc345f42…` | current | `fe5e5b2bc6f33f3a800a1b6c5ed6758b92fff87a75c715112913d8a5eb1d977d` |

The new recording's binding, read off the file and checked against values
stated elsewhere: `transcriptSchemaVersion 1.1.0`; `requirementInputSha256
340cf514…` and `renderedConditionSha256 3bd1ae18…` (the version-4 digests
above); `corpusClosureSha256 d1b110be…`, equal to the adapter-era
recording's; `promptSha256` on every exchange the v5 digests
(`9f9f0db4…`, `685266b9…`, `42c93b0f…`); `pipelineVersion` equal to the V5
HTTP literal `pipeline-identity.test.ts` pins over the S-002 closure, as the
closure policy and grammar alone reach the identity; nine exchanges, one
reader, seven prosecutors in lens order, one adjudicator; 30 `SYNTHETIC
FIXTURE` markers in the role outputs; `model` `claude-opus-5` recorded
truthfully as the configured id. No seam refused the canned outputs, so
`replay-fixtures.ts`'s synthetic outputs were not extended.
`PROVENANCE.md` (now `1f0521cd…`) carries the six-generation table and the E
paragraph (the diff is `diffs/PROVENANCE.md.diff`).

The tests: `verifyRun` replays the current recording under `loadPromptSet()`
and grammar `'1.2.0'`, stated rather than defaulted; `verifyHistoricalRun`
(the kept v1 set and the kept `'1.1.0'` grammar, over any world) is the
second helper; the B-ADAPTER partition now compares two kept files; a new
partition "the binding E moved" measures exactly `pipelineVersion`,
`requirementInputSha256`, `renderedConditionSha256` and `runId` between the
adapter-era and exclusion-era recordings, with `packId`, `requirementId` and
the closure unchanged and the four digest literals restated.
`test/historical-requirements/CSRD-S-001.v3.json` (sha256 `d99e72df…`) is
the `CSRD-S-001` element of `1a87f7e:backend/engine/knowledge/csrd/requirements.json`,
verbatim (dedented by two spaces, trailing comma dropped), no header
comment; a test asserts its `requirementSha256` equals the registry's
version-3 entry `026154c0…` and its `requirementInputSha256` equals
`9b8b8436…`, the value the retired recording carries. Over a copy of the
connected world with S-001's record replaced by that text — the registry
holds version 3, so `loadPack` accepts it — the retired adapter-era
recording replays through the production `dispatch(['run', …])` path under
the historical contract and publishes a valid dossier (`requirementInputSha256
9b8b8436…`, no gaps, the reader's own statement, no network); over the
current world the same recording is refused with `TranscriptRunMismatchError`
naming `requirementInputSha256` (the run `340cf514…`, the recording
`9b8b8436…`) and `renderedConditionSha256`, with the closure and
`pipelineVersion` not among the differences — the dry assessment's error,
now asserted as intended. Red first: both historical tests failed with
ENOENT until the fixture existed; then 85/85. `pipeline-identity.test.ts`
gained an assertion that the exclusion-era recording's `pipelineVersion`
equals the current-set HTTP identity derived through `pipelineVersionFor`
over the current prompts and S-001's own closure under the current grammar
— red against the retired file first ("expected 'pipeline-v3-06789a36…' to
be 'pipeline-v3-06d40e11…'"), then green (59/59); the retired file's own
assertions, and `pipeline-gap-vs-challenge.test.ts`'s reading of it by
name, are unchanged and still true. Teeth 5
(`logs/teeth-5-historical-fixture-digest.log`): one paraphrased sentence in
the fixture — a plausible reconstruction rather than the committed bytes —
reddened the digest pin ("expected '6c399887…' to be '026154c0…'"); restored
from a copy, hash equal.

## Checks (Task 6)

| Check | Result |
| --- | --- |
| Engine default suite (`vitest run`, `backend/engine`) | 83 files, 3223 tests, all green, exit 0 (baseline 82 / 3200; +16 exclusion, +6 replay, +1 identity) |
| Frontend suite (`vitest run`, `frontend/web`) | 8 files, 54 tests, all green, exit 0 (baseline 50; +4) |
| `tsc --noEmit`, engine and frontend | exit 0, exit 0 |
| `grep -ri csrd backend/engine/src/` | 7 |
| The five earlier S-001 recordings | digests unchanged; `PROVENANCE.md` six generations |
| The two migration goldens | sha256 unchanged |
| Frozen pilot evidence, before and after | identical to the expected manifests; nothing newer than XS5 |
| `git status --porcelain` | exactly the intended files (listed in the note's `commit-files.txt`) |

Not run, by rule: `pipeline-live.agents.test.ts`, `next dev`, `next build`,
the standalone harness.

## Carried forward

- The r1–r5 S-002 records (`requirementInputSha256 fecc5050…`) and the five
  retired S-001 recordings describe the previous encodings; a future S-002
  capture package binds to version 5 (`93ad5a91…`) under the current `@3`
  identity (`pipeline-v3-85810d54…`), and no package was built.
- The next genuine S-001 recording, when one is authorised, is filed beside
  the six under its own identity; none is deleted for it.
- C/G remains design-only (`specs/2026-10-19-timing-and-exemption-composition-design.md`);
  the correction that pre-2027 first-wave eligibility cannot depend on the
  new thresholds is accepted in principle and not implemented. The previous
  note's remaining decisions stand: F; S-003's future; one timing
  requirement or two; whether S-005/S-006 demand sub-group coverage; where
  the national-law gate sits; whether Article 1(4) is restated in the timing
  requirements' point (a) branch.
- Residuals noted, not acted on: `stepEightIsParentReport` keeps its name
  though the parent-report step is now the ninth (its comments say "the last
  step"); the engine's `legal_ambiguity` copy for the legal-form gate reads
  as it did before.

## Decisions recorded

- `missingReason: missing_fact` for the new fact (above).
- `public-resolver-seam.test.ts`'s answers were given the explicit fact on
  the strength of their own comment, beyond the hand-over's list.
- The new generation is named `exclusion-era` in the provenance table and
  the fixtures' comments, after the change that retired its predecessor.
