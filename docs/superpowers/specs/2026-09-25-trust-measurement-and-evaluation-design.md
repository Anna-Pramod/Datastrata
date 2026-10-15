# Trust measurement and held-out evaluation: design

- **Date:** 2026-09-25
- **Status:** design. Two parts are implemented, offline only, as §2 states
  them: the four-tier record (`execution.json.trust` on `claude-code-cli@2`,
  plan Task 5's third sub-task, 5c, in the parent's split of Task 5) and the
  evidence measurement it files (`checkResultEvidence`, Task 4). No `@2`
  execution has run, so neither has been seen on a real capture
  (`CHECKPOINT-opus55-migration.md`). The rest (§3) needs its own plan. Paths
  in §2 are under `backend/engine/`.
- **Relates to:** `plans/2026-09-25-opus55-subscription-migration.md`
  (D-9; Tasks 4, 5 (sub-task 5c) and 6); `TEST-EVIDENCE-STANDARD.md`.

## 1. Why

A run that finishes is not a run that is right. Four claims get confused, and
each one needs its own evidence:

1. **Execution succeeded.** The run reached its end, cleaned up, and spent what
   it was allowed to spend.
2. **Schema validity.** Every role output parsed at its own seam, and the
   result assembled valid.
3. **Evidence validity.** The quotations the dossier relies on are found again
   in the documents and at the hashes they pin, its absence terms are searched
   for again and not found, and the edges it cites are found in the corpus
   index (§2.2).
4. **Substantive correctness.** The dossier's findings about the law are
   right: nothing missed, nothing unsupported, exceptions and amendments
   respected, and abstention where the record cannot settle a point.

Each claim implies the one before it, with one exception: schema validity does
not imply that the execution succeeded. A result can assemble valid in a run
that a later harness rule then fails and withholds (the usage backstop,
`IncludedUsageUnconfirmed`), and the record files that as schema `valid`
beside execution `failed`, evidence `withheld` (§2). None implies the one
after it.

- A schema-valid dossier can quote text that is not in the document. At
  capture, the only evidence check that can refuse a record compares each
  quote's docId and digest with the record's own pins (the consistency pass,
  run at assembly). The prompt fence shows the model both, so that check
  proves only that the header was copied. §2's evidence tier re-finds the
  text, and refuses nothing.
- An evidence-valid dossier can still misread the law.

DATASTRATA already has a status vocabulary: `DerivedStatus 'verified'` is
conferred only by signing. No tier's status or method uses the word
"verified"; §2.1 says what a tier carries verbatim.

## 2. The four tiers as recorded

Every `claude-code-cli@2` `execution.json` carries a `trust` key: `null` in the
summary written when the run starts, and the four tiers in the summary written
when it finishes (`test/live-capture.ts:1945`, `:2259`). An `@1`
`execution.json` carries no such key (a parent decision, P-5c-1), and the HTTP
route's carries none either: only the subscription path writes the key
(`captureSubscriptionRun`, `test/live-capture.ts:1811`). Each tier is a status
and the method that produced it; `execution` adds the error's name, and
`evidenceValidity` the sets it measured. `trustOf`
(`test/live-capture.ts:1717-1738`) computes the block from values alone.

| Tier | Values | Method, as filed | What it cannot establish |
|---|---|---|---|
| `execution` | `completed` / `failed`, with `error`: the error's name, or `null` | the harness's own account: the gate, the launches, the drain, cleanup confirmation and usage stops | anything about content |
| `schemaValidity` | `valid` / `invalid` / `unassessed` | role outputs parsed at their seams (RoleOutputError otherwise), then assembleVerificationResult (structure, cross-field consistency, pins, gap identity, version registry) | that any quote exists in the text |
| `evidenceValidity` | `passed` / `failed` / `withheld` / `unassessed`, with `sets` | checkResultEvidence: every evidence set from evidenceSetsOf, judged by the signing gate's own checkEvidenceSet against the corpus the run authorised; quotes and absence terms compared whitespace-collapsed and lower-cased, not byte-exact; edges looked up across the loaded corpus index, not only the entitled closure; whether evidence supports its proposition is not assessed | that a quote supports the proposition it is attached to (that is `verifyEvidenceUse`, a signing and reviewer matter), or that anything is correct |
| `substantiveCorrectness` | always `unassessed` | none at capture time | everything in §3 |

Each method is, word for word, the literal `trustOf` files (`TRUST_METHODS`,
`test/live-capture.ts:1651-1656`). The evidence method keeps the word
"whitespace-collapsed" in §2.2's sense, the normalisation listed there and
not every whitespace character collapsed; a parent decision (P-5c-5) changed
only the case word, "case-folded" to "lower-cased" (§2.3).

### 2.1 How each status is decided

- **Execution:** `completed` exactly when the final `execution.json.error` is
  `null`; otherwise `failed`, and `error` is that error's name, carried
  verbatim.
- **Schema validity** is read off the stage `runSubscriptionCommand` reached
  (`SubscriptionCommandStage`, `test/live-capture.ts:1629`):
  - `valid` for `written`, and for `write_failed`, whose record assembled
    valid before the filesystem refused it;
  - `invalid` for `role_output_refused` (a `RoleOutputError` at a role's
    seam) and for `result_invalid` (`writeVerificationResult` returned
    `invalid`: assembly refused the record);
  - `unassessed` for `world_refused` (`readWorld` or `readRegistryOrFail`
    threw and `outcomeFor` mapped the error), and when there is no stage
    because `runSubscriptionCommand` was never reached or threw.
- **Evidence validity**, decided in this order:
  1. `withheld`, with `sets: null`, when either withhold fact holds
     (`resultWithheld`, or a withhold rule named in `withheldBy`:
     `SensitiveOutputWithheldError`, `TerminationUnconfirmed` or
     `IncludedUsageUnconfirmed`), whatever the stage or the error (P-5c-3). A
     withheld run is never measured, so it is never `passed`.
  2. Otherwise `unassessed`, with `sets: null`, unless the schema tier is
     `valid` and both the written record and the corpus the run authorised
     (`world.corpus`) were handed in (P-5c-2): `checkResultEvidence` does not
     validate the schema.
  3. Otherwise `checkResultEvidence(record, world.corpus)`
     (`src/verification/evidence-validity.ts:84-90`): no evidence set at all
     is `unassessed` with `sets: []` (a halted, gap-bearing record, in which
     nothing failed and nothing was found); every set ok is `passed`;
     anything else is `failed`. For `passed` and `failed`, `sets` is every
     set it reports, passing ones included, in `evidenceSetsOf` order, each
     `{ recordPath, label, ok, problems }` (P-5c-2). These sets replace this
     spec's draft "`evidence_failed` per set": for a schema-valid record, a
     failed set's `` `${label}: ${problems.join('; ')}` `` is the detail of
     the sign gate's `evidence_failed` refusal for that set
     (`src/verification/sign.ts:516`; Task 4's equivalence test).
- **Substantive correctness:** always `unassessed`.

The block is taken after every withhold decision: the sensitive-output
withhold (`SensitiveOutputWithheldError`, set as a launch with a sensitive
pattern in its model output is filed, `test/live-capture.ts:1998`), the
`TerminationUnconfirmed` rule (`:2187`), the usage backstop
`IncludedUsageUnconfirmed` (`:2197`), and the deletion of a result the
pipeline wrote for an execution that did not complete (`:2209-2212`); the
three rules are the only values `withheldBy` takes besides `null` (`:1912`).
So
`resultWithheld` and `withheldBy` are final when it is taken
(`test/live-capture.ts:2213-2222`). V2-T9 and V2-T10 file a sensitive output
as evidence `withheld` (`test/live-capture.test.ts:4203`, `:4215`).

**What the block never says, and what it carries verbatim** (P-5c-4). No
status and no method says "verified", the status only signing confers. Data
carried verbatim is not rewritten: an error's name (one engine class,
`UnverifiedProviderAdapterError`, contains the word; the harness does not
reach it, because its role wrapper always forwards the adapter), and a failed
set's problems, which quote the record's own text: a quote's first 80
characters; an absence term, a docId or an edgeId whole.

### 2.2 What the evidence tier compares

`checkResultEvidence` hands every set to `checkEvidenceSet`
(`src/corpus/evidence.ts:192-342`), the check the sign gate runs, called as
the gate calls it.

- **The comparison form.** Both sides pass through `searchable`
  (`src/corpus/evidence.ts:133-135`): `normalizeWhitespace`
  (`src/corpus/normalize.ts:254-263`), then `toLowerCase`. A quote is found,
  and an absence term occurs, when the document's form contains it as a
  substring. `normalizeWhitespace` applies NFC; turns only U+00A0, U+1680,
  U+2000 to U+200A, U+202F, U+205F and U+3000 into a space; turns CRLF and a
  lone CR into LF; collapses runs of spaces and tabs to one space; removes
  spaces around a line break; turns three or more line breaks into two; and
  trims. So a line break is not a space (a quote that joins two lines with a
  space is not found), and a single line break is not a paragraph break;
  zero-width space (U+200B), U+2028, U+2029, `\v` and `\f` are not normalised
  inside the text; and `toLowerCase` is a plain lower-casing, not Unicode case
  folding.
- **Quotes** (`checkQuote`, `src/corpus/evidence.ts:137-162`): the text must
  not be blank; the docId must name a document the loaded corpus holds; the
  quote's `sha256Normalized` must equal that document's exactly; then the
  quote must be found in that document's text. The measurement accepts any
  document the loaded corpus holds: it is restricted neither to the entitled
  closure nor to the record's own `corpus[]` pins. Holding the evidence to
  the record's own pins (the entitled closure's documents at their hashes:
  `producePins`, `src/verification/current-state.ts:183-199`), a quote by its
  docId and hash and an absence item's documents by docId, is the consistency
  pass's rule (`assertResultConsistency`, `src/verification/result.ts:511`).
  Assembly runs that pass before a record can be written
  (`src/pipeline/assemble.ts:201`, through `parseVerificationResult`,
  `src/verification/result.ts:769`), so every record the evidence tier
  measures has met it; the sign gate runs it again
  (`src/verification/sign.ts:439`).
- **Absence items** (`src/corpus/evidence.ts:317-338`): the docIds must not be
  empty and the term must not be blank; each named document must be held, and
  the term must occur in none of them. An absence item carries no hash pin,
  so it is judged against the text the handed corpus holds.
- **Edges** (`edgeById`, `src/corpus/evidence.ts:164-171`): an
  `amendment_chain` hop's and a `cross_reference`'s `edgeId` are looked up
  across every document's edges in the corpus index
  (`corpus.index.documents[].edges`), not only the entitled closure's; the
  consistency pass reads no `edgeId`. The edge's kind and endpoints are then
  checked against the item, and each quote the item carries is checked as
  above.
- **Set rules**, which are policy rather than search: an empty set fails
  (`src/corpus/evidence.ts:198-200`), and a set made only of absence items
  fails even when every term is absent (`:202-206`). As `checkEvidenceSet`
  defines `failed`, it therefore includes these policy failures as well as
  text not found. Through the harness neither can occur: a record reaches the
  tier only after it assembled valid, and both rules are enforced before
  that, by the schema's `.min(1)` on every evidence array
  (`src/verification/result.ts:96`, `:161`, `:163`) and by the consistency
  pass's sole-absence rule (`src/verification/result.ts:309-311`, `:571-575`).

### 2.3 Where D-9's wording differs from the code

Plan D-9 says that quotes and absence terms "are re-found in the pinned
document text, whitespace-collapsed and case-folded", and that edges "are
found in the loaded corpus index, not restricted to the entitled closure".
The edge sentence matches the code. The comparison sentence overstates it,
and §2.2 states what the code does instead:

- whitespace is normalised as listed there, not collapsed wholesale: line
  breaks are kept (a run of three or more becomes two), and zero-width space,
  U+2028, U+2029, `\v` and `\f` are left inside the text;
- case is lower-cased by `toLowerCase`, not case-folded, which is why the
  method literal says "lower-cased" (a parent decision, P-5c-5);
- "pinned" holds for quotes, whose hash must equal the corpus's; an absence
  item carries no pin, and its term is searched for so as not to be found,
  not re-found.

**The measurement never gates writing.** Capture semantics, the HTTP route and
replay are unchanged. A dossier whose evidence fails is filed with
`evidenceValidity: failed` and is refused at `verify sign` as it always was.
By the time the block is taken, the run's status, transcript and result are
decided, and nothing reads the block but the summary
(`test/live-capture.ts:2213-2222`).

**Source documents are untrusted data.** Every prompt already carries the
evidence-not-instruction rule, and the closure renderer fences documents. The
tiers add nothing that would let text inside a document change a status. An
instruction found inside a source is at most a finding about the source.

**Preservation.** A dossier keeps its exceptions, dates, scope and unresolved
contradictions as they come:

- `OPEN_QUESTION` verdicts;
- gaps;
- the prosecutors' `UNCERTAIN` cells;
- `resolution` text.

No tier summarises them away. A trust report lists `OPEN_QUESTION` counts
beside the tiers, so that "passed" evidence is never read as "settled". (Not
implemented: the `trust` block carries no such count.)

## 3. The held-out evaluation (specified, not implemented)

### 3.1 What it measures

Substantive correctness is measured against a **held-out set**: a set of
requirements with independently authored reference judgements. The pipeline's
prompts, lenses, budgets and model settings are never tuned against it. It
covers six defect classes:

| Class | A case is | Scored as |
|---|---|---|
| **Missed obligations** | an encoding with a criterion, conjunction, threshold, period or addressee omitted or altered (a seeded mutation of a correct encoding, or a real historical defect) | recall: was a challenge raised and `MISMATCH` found on that point |
| **Unsupported claims** | a reading element or challenge whose proposition the closure does not support | the rate of propositions without support: evidence that fails `checkEvidenceSet` or `verifyEvidenceUse`, or that a reviewer marks as not supporting |
| **Misleading quotations** | a quote that re-finds but is cut so that it reverses or narrows the provision (an exception dropped, a "not" outside the span, a proviso omitted) | a reviewer judgement on each quote in the sample; this class is measured by humans because `checkEvidenceSet` passes such quotes by construction |
| **Exceptions** | requirements whose correct answer turns on an exclusion, derogation or transitional measure | did the reading carry the exception, did `missing_exclusion` raise it, did the adjudicator keep it |
| **Amendment effects** | requirements whose governing text was produced by an amendment chain (consolidated versus as-published, dates in force) | the right version, the right date, and `superseded_or_miscited_provision` raised where it applies |
| **Abstention** | cases the closure cannot settle (a missing document, an ambiguous provision) | `OPEN_QUESTION` or a gap where the reference judgement says "not settleable", and no confident verdict there; confident-but-wrong answers are scored separately from abstentions |

### 3.2 How the set is built and held

- **Authors and custody.** Reference judgements are written by a named expert
  (the same authority that ratifies pack content), before any model output
  for that case is seen. They are stored under a custody that prompts and
  tuning work cannot read. The set is versioned, and its digest is recorded
  with every evaluation result.
- **Cases.** Real requirements (never S-002 alone), plus seeded mutations of
  correct encodings for the missed-obligation class. Each seeded mutation is
  recorded with the defect it plants. Suggested initial size: about 40 cases,
  with no class below 5, grown over time. The size is a judgement to revisit
  once per-case cost is measured.
- **Held out.** A case used to diagnose or tune a prompt, lens or setting is
  moved to a separate development set and never scored as held-out again.

### 3.3 Scoring and reporting

- **Per class:** counts of correct, missed, wrong-confident and abstained,
  with the case list.
- **Never aggregated into a single "accuracy" number** that hides a class.
- Every report records the following:
  - the pipeline identity (`pipelineVersion`, the adapter and its
    invocation);
  - the reported models;
  - the CLI version and hash;
  - the held-out set's digest;
  - the four trust tiers for each case.
- **Agreement is not correctness.** Two roles or two models agreeing is never
  scored as correct. Only a reference judgement scores a case.

### 3.4 The efficiency rule

A later change made to save usage or time must show **non-inferiority on the
held-out set** before it replaces the baseline. Such changes include:

- fewer prosecutors;
- lower effort;
- a smaller ceiling;
- a cheaper model;
- a Qwen pre-pass;
- retrieval instead of a full closure.

Non-inferiority means no class loses correct answers beyond a margin stated in
advance, and no class gains confident-but-wrong answers.

A verification role is never removed merely because it costs usage. Removing
one requires evidence that its findings are covered elsewhere on the held-out
set.

### 3.5 What the first S-002 execution can and cannot show

The first genuine S-002 capture yields at most:

- execution, schema-validity and evidence-validity tiers for one requirement;
- one set of reported models and usage.

It establishes no substantive correctness, no failure frequency and no
comparison between models. Its dossier is reviewed and signed, or not,
through the existing signing workflow, which remains the only path to
`verified`.
