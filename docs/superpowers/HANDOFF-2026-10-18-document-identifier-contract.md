# Handoff — the document-identifier contract at the gap seam, and the Article 5(2) question

Written on 2026-10-18 (+0530), 2026-10-18 UTC, in the candidate worktree
`/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch
`feature/opus55-subscription-migration`, HEAD `10fb1d3`, the S-002 capture
checkpoint). Offline: no authentication, inference, network, subagent, capture,
promotion or signing; `pipeline-live.agents.test.ts` was not run; `b1b-record`
was not touched; every filed execution and frozen package is unchanged (their
manifests re-verified below). The user runs every `git add` and `git commit`.

## 1. What this patch does

**The defect.** The S-002 capture (`CHECKPOINT-opus55-s002-capture.md`)
halted on a prosecutor gap naming `CELEX-32022L2464`. The corpus holds that
directive as `DOC-32022L2464`. `gapForUnreachableDocument` classified the gap
through `corpusHolds`, an exact string comparison, so the engine filed a
`corpus_gap` whose remedy, "ingest it", was false guidance about a document
already ingested. The role's naming was recognisable; the engine's recognition
was absent.

**The contract now (r2, after independent review).** A role's document
reference is *resolved* against declared corpus metadata before it is
*classified*, in `backend/engine/src/pipeline/document-reference.ts` (new),
through `EntitledClosure.resolveDocumentReference`. Two rules, both declared,
neither a guess:

1. **Exact document id** — unique by `verifyCorpusIntegrity`, so never
   ambiguous; outranks rule 2.
2. **A declared alias** — a new optional `aliases: string[]` field on a corpus
   document (`corpus/types.ts`, `corpus/schema.ts`): another published form of
   its identity the corpus author chose to record. Validated like the rest of
   the index: trimmed, non-empty, no duplicates on a document; across the
   index, never a document id and never declared by two documents
   (`verifyCorpusIntegrity`, two new problems).

**Removed on review.** The first version of this patch also stripped one
scheme prefix from a reference and matched the remainder to what follows
`DOC-` in a held document's id. The review's blocker: that *guesses*
identity — `UNRELATED-32022L2464` resolved to `DOC-32022L2464` with no
declared relationship. The fallback is gone. A reference under a scheme the
index does not declare is **unknown**, whatever its suffix; the equivalence
the capture observed is now stated where relationships live in this corpus,
as metadata (below).

One matching document is a resolution. Several are **ambiguous** — reachable
only from an index whose integrity check did not run, since the check refuses
a shared alias — and `gapForUnreachableDocument` throws
`AmbiguousDocumentReferenceError` naming every candidate, which the three
producers' existing `catch` turns into a `RoleOutputError` naming the role:
the run is refused rather than the engine choosing what the role meant. None
is **unknown**: a `corpus_gap` under the reference exactly as the role wrote
it, with a detail that says no id or declared alias matched and names
declaring the alias as a remedy beside ingesting.

**What the record carries.** A resolved reference is classified under the
document's own id (`gap.docId`), and the detail keeps the role's identifier
beside it: "the corpus holds DOC-32022L2464 (named by the role as
CELEX-32022L2464), but the entitled closure … does not reach it …". No field
was added to `verification-result.json`; `resultSchemaVersion` is unchanged,
so the record invariant and `assertResultConsistency`'s mirrored register
rules apply unchanged, and the gap now satisfies them (a `closure_gap` over a
held id) where the capture's gap only passed because `CELEX-32022L2464` was
in neither register.

**What it does not do.**

- **It grants nothing.** `EntitledClosure.entitled`, `document()` and `text()`
  keep comparing exact ids; the resolver sees ids and aliases, never text. A
  reference that resolves to an *entitled* document is refused as a gap
  (`EntitledDocumentIsNotAGapError`, now naming the reference), as before.
  `requestDocument` resolves the reference and then asks `entitled` on the
  resolved id, so a reader asking for an entitled document under another
  scheme is granted that document and nothing else.
- **No prompt changed.** `pipeline-identity.test.ts:752` and
  `live-capture.test.ts:4576` pin `pipeline-v3-ecb06a30…` as the identity
  over the real prompts; any prompt edit changes the identity of every future
  run and those two literals. The brief allows prompt guidance as a
  supplement but not as the protection, and the protection is now in the
  engine, so the prompts are left as they are. If a supplement is wanted
  later ("name a document by the `DOC-…` id in its closure heading"), it is a
  one-line edit to each of the three prompts plus the two literals, and a new
  `pipelineVersion`.
- **`corpus/index.json` now declares the observed CELEX form, and only
  that.** Each of the four documents carries `aliases: ["CELEX-<its CELEX
  number>"]` — `CELEX-32013L0034`, `CELEX-32022L2464`, `CELEX-32023R2772`,
  `CELEX-32026L0470` — and `updated` is `2026-10-18`. No other form (the
  colon spelling, the consolidated code, an ELI) is declared; a role using one
  gets an explicit unknown until the author declares it. **Metadata and
  binding consequences, checked:** the closure hash covers each member's
  `sha256Normalized`, `nonOperativeSections`, served-source standing and the
  edges (`corpus/closure.ts`), and pins carry `versionLabel`, the two
  digests, the normaliser and the authenticity (`current-state.ts:190–195`);
  neither reads `aliases`, and the closure rendering shows `docId`, title and
  `versionLabel` only. So the S-002 closure pin `d1b110be…`, every replay
  transcript's `requestSha256`, the `runId` and the `pipelineVersion` are
  unchanged — `pipeline-identity.test.ts`'s literal over the real corpus
  still passes, and the full suite below replays every recorded transcript
  against the edited index. What does change is the file itself: its bytes
  and its `updated` date. No live package binds `corpus/index.json` by digest
  (the r1 binding lists `knowledge/csrd/*` and the version registry, not the
  index), and the r1 package is spent regardless.
- **`classifyUnreachableDocument`, `entitled`, `document()` and `text()`
  still speak exact ids.** The resolver and the classifier are two layers,
  and the tests hold them apart; a declared alias of an entitled document is
  refused text under that alias.
- **No change to the halt rule, the pipeline, the harness, the thinking-count
  observer or the record's absolute paths** (deferred, per the brief).
- `grep -ri csrd backend/engine/src/` is still exactly 7.

**Files.**

| File | Change |
|---|---|
| `backend/engine/src/pipeline/document-reference.ts` | new: `resolveDocumentReference` (exact id, declared alias), `AmbiguousDocumentReferenceError` |
| `backend/engine/src/pipeline/entitlement.ts` | `EntitledClosure.resolveDocumentReference` |
| `backend/engine/src/pipeline/gaps.ts` | `gapForUnreachableDocument` resolves before classifying; `EntitledDocumentIsNotAGapError` carries the reference |
| `backend/engine/src/pipeline/reader.ts` | `requestDocument` resolves, then decides entitlement on the resolved id |
| `backend/engine/src/corpus/types.ts`, `corpus/schema.ts` | optional `aliases`, validated per document and across the index |
| `backend/engine/corpus/index.json` | `aliases: ["CELEX-…"]` on each of the four documents; `updated` 2026-10-18 |
| `backend/engine/test/pipeline-document-reference.test.ts` | new: 22 tests, including three over the shipped index |
| `backend/engine/test/pipeline-prosecutors.test.ts` | 3 tests appended: the capture's shape through `runVerificationPipeline`, over a fixture world with declared aliases |

## 2. Verification, per `TEST-EVIDENCE-STANDARD.md`

Logs are working notes in this session's scratchpad
(`…/scratchpad/idfix/`), named with UTC timestamps; the lines below are
quoted from them verbatim. Every check can be re-run from its description.

- **Baseline** (before any change): `npx vitest run` — `Test Files 77 passed
  (77)`, `Tests 3080 passed (3080)` (`baseline-tests.20261018T124143Z.log`).
- **Red first** (`red.20261018T124731Z.log`): the new unit file failed to
  load (`Failed to load url ../src/pipeline/document-reference`); the
  prosecutor integration test failed with `AssertionError: expected
  'corpus_gap' to be 'closure_gap'` and `promise resolved "{ …(9) }" instead
  of rejecting` — the capture's defect, reproduced on the fixture world.
- **Green**: the two files, then `pipeline-reader`, `corpus-closure`,
  `pipeline-entitlement`, `pipeline-assemble`: 170 passed.
- **Teeth**, each mutation applied to a copy-backed file, its landing
  confirmed by `grep` count, the file restored by copy and confirmed by
  sha256 (`a58f4fdb…` for `document-reference.ts`, `22262db5…` for
  `schema.ts`), the two test files green again afterwards (78 passed):
  1. *Resolver exact-only* (candidate collection removed; `grep` of the
     mutant line = 1): 10 tests failed, among them
     `gapForUnreachableDocument … a held, unreached document named under
     another scheme is a closure_gap over its real id — AssertionError:
     expected 'corpus_gap' to be 'closure_gap'` and the same assertion in
     `pipeline-prosecutors.test.ts … files the gap under the corpus's own id`
     (`tooth1-exact-only.20261018T125001Z.log`). This is the defect the patch
     exists to detect, named by the assertion.
  2. *Ambiguity broken by preference* (the `ambiguous` return removed; `grep`
     = 0 remaining): exactly 2 failed — `expected { outcome: 'resolved', …(3)
     } to deeply equal { outcome: 'ambiguous', …(2) }` and `expected error to
     be instance of AmbiguousDocumentReferenceError`
     (`tooth2-no-ambiguity.20261018T125001Z.log`).
  3. *Alias integrity removed* (both `problems.push` lines removed; `grep`
     = 0): exactly 1 failed — `declared aliases are validated metadata >
     refuses, across the index, an alias that is another document's id or
     alias — expected function to throw an error, but it didn't`
     (`tooth3-no-alias-integrity.20261018T125002Z.log`).
- **Typecheck (r1)**: `npx tsc --noEmit`, exit 0
  (`typecheck-final.20261018T125027Z.log`).
- **Full offline suite (r1)** (`tests-final.20261018T125029Z.log`):
  `Test Files 78 passed (78)`, `Tests 3101 passed (3101)`, `vitest exit 0`.
- **r2, after review** (no new mutation campaign, as instructed):
  - *Control against the previous resolver.* The narrowed tests were run once
    with the r1 `document-reference.ts` (the one with the prefix fallback)
    copied back in: see the r2 control line below for the failures, which
    name the review's counter-example — `UNRELATED-D` resolving where it must
    stay unknown. The r2 file was restored by copy and confirmed by sha256.
  - *Affected tests*: `pipeline-document-reference`, `pipeline-prosecutors`,
    `pipeline-reader`, `corpus-closure`, `pipeline-entitlement`,
    `pipeline-assemble`, `corpus-ingest`, `pipeline-identity`: 8 files, 255
    passed. `npx tsc --noEmit` exit 0.
  - *The control's result* (`r2-control-old-resolver.20261018T132601Z.log`): `Tests 6 failed | 76 passed
    (82)`, among them `an undeclared scheme over a held document's suffix
    stays unknown — nothing is inferred from the shape — AssertionError:
    UNRELATED-D: expected { outcome: 'resolved', …(3) } to deeply equal {
    outcome: 'unknown', …(1) }`, `pipeline-prosecutors.test.ts … an
    undeclared scheme over the same suffix stays a corpus_gap under the
    reference — expected [ [ 'closure_gap', 'DOC-D' ] ] to deeply equal [ [
    'corpus_gap', 'UNRELATED-D' ] ]`, and, over the shipped index,
    `UNRELATED-32022L2464` resolving where it must not. After restoring r2
    (sha256 `5f09c99b…`, `SCHEME_PREFIX` count 0): 82 passed.
  - *Full offline suite (r2)* (`tests-r2.20261018T132628Z.log`): `Test Files 78 passed (78)`,
    `Tests 3105 passed (3105)`, `vitest exit 0` — the baseline's 3,080 plus the 25
    added here (22 and 3), every recorded transcript replayed against the
    edited index, `npx tsc --noEmit` exit 0 (`typecheck-r2`).
- **Filed evidence after the patch**: the S-002 execution's manifest
  `35268592…` verifies 12 of 12 OK; the r1 package's `b364ecd0…` 20 of 20 and
  its `offline-checks` `77c4daa8…` 17 of 17; 0 files anywhere under
  `pilot-evidence/` are newer than the execution's manifest.
- **Positive controls** are in the tests themselves: exact ids still resolve
  and classify as before; an unknown reference is still a `corpus_gap`; the
  entitlement route refuses an alias of an entitled document; the
  unambiguous id of an ambiguity's candidate is a plain `closure_gap`.

## 3. The Article 5(2) question: identifier error, or missing dependency?

Read offline from the frozen normalised texts under
`backend/engine/corpus/normalized/` (the versions the capture pinned:
`DOC-32013L0034` consolidated 2026-03-18, `DOC-32026L0470` as published) and,
outside the closure, `32022L2464.txt` (consolidated 2026-03-18, held as
`DOC-32022L2464`, serving `SRC-002`). Line numbers are into those files.

**What the prosecutor said** (`prosecutor[3]`, lens
`wrong_measurement_period`): the closure "does not contain Article 5(2) of
Directive (EU) 2022/2464, which sets the financial-year application dates.
Only the amending text in Directive 2026/470 is available, so the full point
(a) criteria for financial years 2024–2026 cannot be read."

**What the closure holds.**

- *Article 29a(1), first subparagraph* (`32013L0034.txt:2309`, marked ►M8;
  the same words as the amending instruction at `32026L0470.txt:581–585`):
  "Parent undertakings of a group which, **on its balance sheet date**,
  exceeds, on a consolidated basis, a net turnover of EUR 450 000 000 and an
  average number of 1 000 employees **during the financial year** shall
  include in the consolidated management report …". The measurement point
  (the balance sheet date) and the averaging period (the financial year) of
  `CSRD-S-002`'s two thresholds are stated in the provision the requirement
  cites. Nothing about *how* the thresholds are measured depends on Article
  5(2).
- *Article 3 of Directive 2026/470* (`32026L0470.txt:963–1058`) amends
  Article 5(2) of Directive 2022/2464 by replacing point (a)'s introductory
  wording ("for financial years starting between 1 January 2024 and 31
  December 2026"), replacing point (b)(i) and (ii) with the EUR 450 000 000 /
  1 000 test, deleting point (c), and adding the Member State derogation for
  undertakings below either threshold "for the financial years starting
  between 1 January 2025 and 31 December 2026". Recital 30
  (`32026L0470.txt:152`) says why. So the dates that matter under the current
  thresholds — the post-2027 regime and the 2025–2026 derogation — are in the
  closure, in the amending text, and the reader's `E15` read them from there.

**What the closure lacks.** Article 5(2), first subparagraph, point (a)(i)
and (ii) of Directive 2022/2464 (`32022L2464.txt:1992–2000`), unchanged by
the Omnibus and therefore absent from the amending text: for financial years
starting 2024–2026 the measures apply to large public-interest entities, and
to public-interest-entity parents of large groups, "exceeding on their
balance sheet dates the average number of 500 employees during the financial
year". The prosecutor's factual statement is accurate: the pre-2027
criteria cannot be read from the closure.

**Does `CSRD-S-002` depend on them?** The requirement (`requirements.json`,
version 3) encodes the Article 29a(1) scope test as it now stands — EU
incorporation, an Accounting-Directive legal form, parent-undertaking status,
consolidated net turnover above EUR 450 000 000 and average employees above
1 000 — with `legalStatus: in_force` and provenance `SRC-001` at "Article
29a(1)" only. It has no financial-year fact and claims nothing about which
financial years the test governs. Article 5(2) is a transposition and
application provision addressed to Member States (when they must *apply*
the measures); it does not alter what Article 29a(1) measures or when it
measures it. The prosecutor's challenge `C2` ("the encoding is not tied to
any financial year") is a legitimate observation about the requirement's
*temporal scope*, and `C1` ("gives no measurement point for the turnover
criterion") is a legitimate observation about the encoding against text the
closure already holds. Neither needs Article 5(2) to be *decided*; both are
the adjudicator's to weigh, and the adjudicator never ran because the gap
halted the run first.

**Conclusion.** Two different things happened at once:

1. **An identifier error**, now fixed: the gap should have been a
   `closure_gap` over `DOC-32022L2464`. With this patch, the same output
   produces exactly that, with `CELEX-32022L2464` preserved in the detail.
2. **A halt the lens did not need.** Under §3.0 any gap stops the run, so
   whether the dependency was genuine decides whether the halt was right.
   For `CSRD-S-002` as encoded, Article 5(2) is not a dependency of the
   measurement-period question: the measurement point and period are in
   Article 29a(1) itself, and the application dates that the current
   thresholds carry are in the amending text. What the prosecutor could not
   read is the 2024–2026 transitional regime, which the requirement does not
   encode and does not claim to.

**Recommendation — concrete, and not what the model asked for.** The context
figures below are estimates from one run's ratio, not a measurement of what a
future request would carry.

- **Do not add an edge from `DOC-32013L0034` to `DOC-32022L2464`, and do not
  widen the traversal policy, on the strength of this run.** Two reasons
  beyond the brief's own rule:
  - *Estimated cost near the ceiling.* `32022L2464.txt` is 139,593 bytes.
    At the one ratio observed so far (about 0.32 tokens per byte over the
    S-002 requests), every `SRC-001` closure would grow by an estimated
    45,000 tokens, which would put a prosecutor request at roughly 185,000
    tokens against the committed 190,000 per-request ceiling, and an
    adjudicator request, which also carries the challenges, close to or over
    it. These are estimates, not proof that any particular future request
    would exceed its ceiling: the ratio came from one run, and the estimate
    leaves out whatever the CLI adds. They are enough to say that widening
    the closure is a budget decision for every `SRC-001` requirement, not a
    local repair for this one.
  - *Legal grounding exists, but it is a corpus decision, not a repair.*
    Directive 2022/2464 did amend Directive 2013/34/EU (it inserted Article
    29a; the consolidation marks that text M4), so an `amendedBy` edge with
    `celex_metadata` provenance would be true. Its absence from the index is
    an authored choice about the closure's size, and reversing it belongs
    with the corpus author, with the context cost above in front of them.
- **If the temporal scope of the threshold test is wanted in the pack,
  encode it as a requirement, not as a wider closure.** The 2024–2026 regime
  (500-employee public-interest entities; the 2025–2026 Member State
  derogation) is a separate scope question with its own facts (the financial
  year; public-interest-entity status). A sibling requirement, or a
  versioned `CSRD-S-002` with a financial-year fact, would cite `SRC-002`
  (which `DOC-32022L2464` already serves) in its own `provenance`, and that
  requirement's closure would then reach the directive through
  `docsForSources` as an entry document, without changing any other
  requirement's closure or pin.
- **Rerun `CSRD-S-002` only after one of the above is decided**, under a new
  package bound to the new HEAD. With this patch alone, the same prosecutor
  output would still halt the run — honestly, as a `closure_gap` — because
  the halt rule is unchanged and the role would still be asking for a
  document outside its closure. Whether a prosecutor should be able to raise
  a temporal-scope observation as a *challenge* rather than a *gap* when the
  provision it needs is outside the requirement's declared scope is the
  open design question this leaves; nothing here decides it.

## 4. Preserved, deferred, and handed forward

- **Preserved.** No file under `pilot-evidence/` was written. Re-verified
  after the patch: the S-002 execution's `MANIFEST.sha256`
  (`35268592…`, 12 of 12 OK) and the r1 package's (`b364ecd0…`, 20 of 20;
  `offline-checks` `77c4daa8…`, 17 of 17); nothing under `pilot-evidence/`
  is newer than the execution's manifest (section 2).
- **Deferred, per the brief.** The thinking-count observer
  (`live-capture.ts:997`); the harness's absolute paths in
  `execution.json`; the prompt supplement above. The result-hash difference
  noted in the capture checkpoint is explained by the documented trailing
  newline and is not reopened.
- **Open decisions this leaves.** The edge or the sibling requirement
  (above); whether to declare further forms as `aliases` (the colon
  spelling, consolidated CELEX codes, ELIs — each an explicit declaration,
  none inferred; no pin changes); the gap-versus-challenge question for
  out-of-scope provisions.

## 5. Commit

Committing moves HEAD past `10fb1d3`. No live package is bound to `10fb1d3`,
so nothing is spent by it; the next capture package binds to the new HEAD.

```sh
cd /Users/vivin/Documents/DataStrata/b1b-opus55-candidate && git add backend/engine/src/pipeline/document-reference.ts backend/engine/src/pipeline/entitlement.ts backend/engine/src/pipeline/gaps.ts backend/engine/src/pipeline/reader.ts backend/engine/src/corpus/types.ts backend/engine/src/corpus/schema.ts backend/engine/corpus/index.json backend/engine/test/pipeline-document-reference.test.ts backend/engine/test/pipeline-prosecutors.test.ts docs/superpowers/HANDOFF-2026-10-18-document-identifier-contract.md
```

```sh
cd /Users/vivin/Documents/DataStrata/b1b-opus55-candidate && git commit -m "Resolve a role's document reference against corpus metadata so a held document is never reported as missing

The S-002 capture filed a corpus gap for CELEX-32022L2464 and told a human to
ingest a document the corpus holds as DOC-32022L2464, because the gap seam
compared identifiers byte for byte. The seam now resolves a reference through
the document id or an alias the corpus declares, classifies the document it
names, keeps the role's own identifier in the detail, refuses an ambiguous
reference explicitly, and still opens no text; nothing is inferred from the
shape of a reference, so an undeclared scheme stays an explicit unknown. The
index declares the CELEX form each document was named by. The handoff
assesses the Article 5(2) request against the frozen texts and recommends
against widening the closure for it."
```
