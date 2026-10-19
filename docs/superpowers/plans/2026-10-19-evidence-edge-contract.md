# Evidence-edge contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, in this session, with no subagent (the session's standing rule). Steps use checkbox (`- [ ]`) syntax for tracking. The user runs every `git add` and `git commit`; each task ends by handing over the exact commands.

**Goal:** A role can name a corpus relationship only by an edge id the pipeline listed to it, and an id it was not listed is refused at that role's seam before the next role launches — so the defect r4 demonstrated (the reader named four edge ids the corpus does not hold, every seam passed, nine launches were spent, and the record boundary's evidence check failed) cannot spend a run again.

**Architecture:** Three mechanical changes and one versioning move. (1) The edge rules the signing gate already applies inside `checkEvidenceSet` — existence, kind, endpoints, amendment-chain continuity — are extracted into one exported pure function that takes an edge lookup, so the gate and the new seam run the same rules over different scopes (the whole corpus, the entitled closure). (2) The `EntitledClosure` capability exposes its edges (id, kind, from, to — never provenance) and `composeRoleMessage` renders them to every role as a deterministic `# Entitled relationships` section under closure-renderer grammar `1.2.0`. (3) A new seam module refuses, at each role, any `amendment_chain` hop or `cross_reference` whose edge id the closure does not list, or that breaks the shared rules. (4) The grammar version becomes selectable the way prompt sets are: `1.1.0` is kept and renders exactly today's bytes, `1.2.0` is current; prompt set v4 is kept under `prompts/history/v4/` and v5 tells every role to use only listed ids; every identity derived over the current set and grammar moves, every kept identity is still derived from the kept files and grammar, and the committed S-001 recording replays unchanged under `1.1.0` + v1.

**Tech Stack:** TypeScript (strict), zod (the only runtime dependency; none added), vitest, the candidate's own binaries under `node_modules/.bin`.

## Global Constraints

- `docs/superpowers/TEST-EVIDENCE-STANDARD.md` applies to every task: a green check is evidence only when it is known to fail against the defect it names; a red check is evidence only once its message has been read and names the intended assertion. Every task below carries a teeth check naming its defect.
- The baseline for each task is **the previous task's finishing count**, never a fixed number; Task 0 records the starting count.
- `backend/engine/src/` stays program-agnostic: `grep -ri csrd backend/engine/src/` stays at exactly seven hits. No new runtime dependency. `src/verification/` stays pure.
- Frozen executions stay unchanged: nothing under `pilot-evidence/` is created, changed or deleted; `test/verification-transcripts/` is read, never written (the S-001 recording's digest is asserted before and after). Golden artifacts are read, never written.
- No live run, no promotion, no signing, no new capture package. The live agents suite (`test/pipeline-live.agents.test.ts`) is never run.
- Reader blindness is preserved: the catalog carries edge ids, kinds and document ids only — no source ids, no requirement content — and is emitted by the shared composer identically for every role.
- Never add corpus metadata to accommodate generated output: the four ids r4 named stay absent from `corpus/index.json`.
- The user runs every `git add` and `git commit`; subjects are imperative sentence-case, explain why, carry no prefix and no trailer.
- The loader-fallback commit (`backend/engine/src/pipeline/prompts.ts`, `backend/engine/test/pipeline-quote-pins.test.ts`) must have landed before Task 5 edits those two files; Task 5 checks `git log` first and stops if it has not.

---

## File structure

| File | Responsibility after this plan |
|---|---|
| `backend/engine/src/corpus/evidence.ts` (modify) | owns the evidence item schema, `checkEvidenceSet`, and the new shared pure edge rules `edgeReferenceProblems` over an `EdgeLookup` |
| `backend/engine/src/pipeline/entitlement.ts` (modify) | the capability gains `edges` (`EntitledEdge[]`), the renderer `renderEntitledRelationships`, the selectable grammar (`ClosureRendererVersion`, kept `1.1.0`, current `1.2.0`, `UnknownClosureRendererVersionError`), and `composeRoleMessage` emits the catalog section under `1.2.0` |
| `backend/engine/src/pipeline/edge-references.ts` (create) | the seam: `edgeReferenceSeamProblems` and the three `assert<Role>EdgesEntitled` gates, pure, modelled on `quote-pins.ts` |
| `backend/engine/src/pipeline/reader.ts`, `prosecutors.ts`, `adjudicator.ts` (modify, one line each) | the parse chain gains the edge gate after the quote-pin gate |
| `backend/engine/src/pipeline/orchestrate.ts` (modify) | `pipelineVersionFor` and the tail take the closure's grammar version instead of the constant |
| `backend/engine/src/cli/run.ts` (modify) | `RunCapabilities.closureRendererVersion`, threaded to `EntitledClosure.forSources` |
| `backend/engine/src/pipeline/prompts.ts` (modify) | v5 current, v4 kept (`prompts/history/v4/`) |
| `backend/engine/prompts/verification/*.md` (modify), `prompts/history/v4/*.md` (create), `prompts/VERSIONS.md` (modify) | the v5 texts, the kept v4 bytes, the version log |
| `backend/engine/test/corpus-evidence.test.ts` (modify) | the shared rules, called directly over a structural lookup, and the gate/seam equivalence |
| `backend/engine/test/pipeline-entitlement.test.ts` (modify) | `edges`, the catalog render, the grammar selection and its refusal |
| `backend/engine/test/pipeline-edge-references.test.ts` (create) | the seam at every role, the r4 shapes, positive controls, "before the next launch" through `runVerificationPipeline` |
| `backend/engine/test/pipeline-prompt-boundary.test.ts` (modify) | the `1.2.0` grammar: the section's lines, its place, its absence under `1.1.0` |
| `backend/engine/test/pipeline-identity.test.ts`, `pipeline-quote-pins.test.ts`, `live-capture.test.ts`, `pipeline-gap-vs-challenge.test.ts`, `pipeline-replay.test.ts`, `pipeline-standing.test.ts` (modify) | the identities that move and the ones that must not; the replay call sites select grammar `1.1.0` with the v1 set |
| `docs/superpowers/CHECKPOINT-evidence-edge-contract.md` (create, Task 7) | what was found, decided and handed forward, with every teeth output verbatim |

---

### Task 0: Baseline

**Files:** none changed.

- [ ] **Step 1: Run the engine suite once and record the count**

Run, from `backend/engine`: `./node_modules/.bin/vitest run`
Record: the `Test Files` and `Tests` lines. This is Task 1's baseline.

- [ ] **Step 2: Record the S-001 recording's digest and the csrd count**

Run, from `backend/engine`: `/usr/bin/shasum -a 256 test/verification-transcripts/csrd/CSRD-S-001/run-v1-8717925d731334f6162bdc2fd35a230d3bde7a5d1dc66588db5f5544a0748310.json` and `/usr/bin/grep -ri csrd src/ | wc -l` (expected 7).

---

### Task 1: One set of edge rules, shared by the gate and the seam

**Files:**
- Modify: `backend/engine/src/corpus/evidence.ts` (the `amendment_chain` and `cross_reference` branches of `checkEvidenceSet`)
- Test: `backend/engine/test/corpus-evidence.test.ts`

**Interfaces:**
- Produces:
  - `export interface EdgeLookup { readonly scope: string; edge(edgeId: string): Pick<CorpusEdge, 'edgeId' | 'kind' | 'from' | 'to'> | undefined }` — `scope` is the noun a message uses for where the id was looked up (`'the corpus'` at the gate; `'the entitled closure'` at the seam).
  - `export function edgeReferenceProblems(item: EvidenceItem, label: string, edges: EdgeLookup): string[]` — pure; for a `quote` or `absence` returns `[]`; for an `amendment_chain` reports, per hop under `${label}.hops[h]`: an id the lookup does not hold (`names edge <id>, which <scope> does not hold`), a hop quote whose `docId` is neither endpoint, a hop resting on an edge that is not `amends`/`amendedBy`; then the chain's orientation rule exactly as today (every hop runs the same way), and an empty chain; for a `cross_reference`: an id the lookup does not hold, an edge that is not `references`, an edge that does not connect `from.docId` to `to.docId`. The message texts are the ones `checkEvidenceSet` emits today, with `the corpus` replaced by `<scope>` where it names the lookup.
  - `export function corpusEdgeLookup(corpus: LoadedCorpus): EdgeLookup` — scope `'the corpus'`, backed by the index's documents' edges.
- `checkEvidenceSet` keeps its signature and its quote checks, and obtains every edge problem by calling `edgeReferenceProblems(item, label, corpusEdgeLookup(corpus))`; it must not re-implement any edge rule.

- [ ] **Step 1: Write the failing tests** (a new `describe('the edge rules, shared')` in `corpus-evidence.test.ts`): over a structural lookup built in the test — `{ scope: 'a fixture', edge: (id) => FIXTURE_EDGES.get(id) }` with amendment edges `X1: amends B->A`, `X2: amends C->B`, a `references` edge `R1: A->C`, and a `consolidates` edge `K1` — assert, calling `edgeReferenceProblems` directly: (a) a hop naming `NOPE` yields exactly one problem containing `names edge NOPE, which a fixture does not hold`; (b) a hop on `R1` yields the kind problem (`an amendment_chain hop must rest on an amends or amendedBy edge`); (c) a hop on `X1` quoting `C` yields the endpoint problem; (d) hops `X1` then `X2` (one direction) yield no problem, and `X2` then `X1` none either (the other walk), while `X1` then `K1`-shaped nonsense yields the kind problem and a chain `X1`,`X1` reversed yields the continuity problem naming both ids; (e) a `cross_reference` on `X1` yields `must rest on a references edge`; on `R1` with `from.docId` `C` yields `does not connect`; (f) a `quote` and an `absence` yield `[]`; (g) **the equivalence**: for every `amendment_chain` and `cross_reference` case already in this file, `checkEvidenceSet(items, corpus).problems` filtered to lines not about quote text equals `edgeReferenceProblems(item, 'evidence[i]', corpusEdgeLookup(corpus))` for the same item — one function, two gates.

- [ ] **Step 2: Run the new describe and read the red**

Run: `./node_modules/.bin/vitest run test/corpus-evidence.test.ts -t "shared"`
Expected: every new test fails with `edgeReferenceProblems is not a function` (or an import error naming it). Read it; it must name the function, not an unrelated assertion.

- [ ] **Step 3: Implement** `EdgeLookup`, `corpusEdgeLookup`, `edgeReferenceProblems` in `evidence.ts`, moving the existing edge logic into the function unchanged in substance, and make `checkEvidenceSet` call it.

- [ ] **Step 4: Run the file, then the whole suite**

Run: `./node_modules/.bin/vitest run test/corpus-evidence.test.ts` → all green, including every pre-existing amendment-chain and cross-reference test (their expected messages must not have moved: that is the refactor's own teeth).
Run: `./node_modules/.bin/vitest run` → Task 0's count plus the new tests, 0 failed.

- [ ] **Step 5: Teeth check** (defect: the gate silently stops applying a rule). Take a copy of `evidence.ts`; in the copy-in-place delete the continuity block inside `edgeReferenceProblems`; run `test/corpus-evidence.test.ts`; expected red names `rejects a chain that changes direction part way along`, `rejects hops that share a document without succeeding one another` and the new continuity case; restore from the copy and confirm by sha256. Record the output.

- [ ] **Step 6: Hand the commands** — `git add backend/engine/src/corpus/evidence.ts backend/engine/test/corpus-evidence.test.ts`; subject: `Make the evidence-edge rules one function so the role seams and the signing gate cannot disagree`.

---

### Task 2: The capability lists its relationships

**Files:**
- Modify: `backend/engine/src/pipeline/entitlement.ts`
- Test: `backend/engine/test/pipeline-entitlement.test.ts`

**Interfaces:**
- Produces:
  - `export interface EntitledEdge { readonly edgeId: string; readonly kind: EdgeKind; readonly from: string; readonly to: string }` — never provenance.
  - `EntitledClosure.edges: readonly EntitledEdge[]` (getter) — one entry per `edgeIds` entry, in that (sorted) order, read off the index the closure was computed from; both endpoints are closure members by construction.
  - `export function renderEntitledRelationships(closure: Pick<EntitledClosure, 'edges'>): string` — deterministic: when empty, the single line `No relationship between the documents of this closure is recorded in the corpus.`; otherwise one line per edge, in order: `- edgeId: <edgeId>; kind: <kind>; from: <from>; to: <to>`. No other text.

- [ ] **Step 1: Write the failing tests** in `pipeline-entitlement.test.ts`: the SRC-100 closure's `edges` is exactly `[E-1 amendedBy DOC-A->DOC-B, E-2 references DOC-A->DOC-C]` (E-3 is excluded because DOC-D is outside; the objects carry exactly the four keys); `renderEntitledRelationships` of it is the two expected lines joined by `\n`; of a closure with no edges (an index whose entry has none) it is the one sentence; the render contains no `provenance`, no `SRC-` and no `recordedOn`.

- [ ] **Step 2: Run and read the red**

Run: `./node_modules/.bin/vitest run test/pipeline-entitlement.test.ts`
Expected: `edges` undefined / `renderEntitledRelationships is not a function`, named.

- [ ] **Step 3: Implement** the getter (index lookup by id over `this.#closure.edgeIds`, throwing if an id is not found — a closure inconsistent with its index, as `documents()` already treats a missing document) and the renderer.

- [ ] **Step 4: Run the file and the suite** → green; count = Task 1's finishing count + the new tests.

- [ ] **Step 5: Teeth check** (defect: the catalog leaks provenance or source ids). Assert in the test that `JSON.stringify(closure.edges)` contains no `provenance`; mutate the getter in a copy-in-place to spread the whole corpus edge; the assertion goes red naming `provenance`; restore by hash.

- [ ] **Step 6: Hand the commands** — `git add backend/engine/src/pipeline/entitlement.ts backend/engine/test/pipeline-entitlement.test.ts`; subject: `Let the entitled closure list its relationships so a role can be handed the edge ids it may cite`.

---

### Task 3: The seam — an unlisted edge id is refused at its role, before the next launch

**Files:**
- Create: `backend/engine/src/pipeline/edge-references.ts`
- Modify: `backend/engine/src/pipeline/reader.ts` (the `parse` chain), `prosecutors.ts` (the `parse` chain near line 812), `adjudicator.ts` (near line 661)
- Test: `backend/engine/test/pipeline-edge-references.test.ts` (create)

**Interfaces:**
- Consumes: `edgeReferenceProblems`, `EdgeLookup` (Task 1); `EntitledClosure.edges` (Task 2); `LabelledEvidenceSet` from `quote-pins.ts`; `quotesOf`-style labels.
- Produces:
  - `export interface EdgeReferenceSource { readonly edges: readonly EntitledEdge[] }` — what the seam needs of a closure; `EntitledClosure` satisfies it structurally; a test may hand in a plain object (TEST-EVIDENCE-STANDARD #4).
  - `export function edgeReferenceSeamProblems(sets: readonly LabelledEvidenceSet[], closure: EdgeReferenceSource): string[]` — builds an `EdgeLookup` with scope `the entitled closure (the ids listed under # Entitled relationships)` over `closure.edges` and concatenates `edgeReferenceProblems(item, \`${set.label}[${i}]\`, lookup)` over every item of every set.
  - `assertReaderEdgesEntitled(output: ReaderOutput, closure: EdgeReferenceSource, index = 0): ReaderOutput`, `assertProsecutorEdgesEntitled(output: ProsecutorOutput, closure, index = 0)`, `assertAdjudicatorEdgesEntitled(output: AdjudicatorOutput, closure, index = 0)` — each throws `RoleOutputError(role, index, problems)` when any problem exists and otherwise returns the output unchanged; labels are the same as the quote-pin gates' (`elements[i] (id).evidence`, `challenges[i] (id).evidence`, `adjudications[i] (challengeId).evidence`).
- The three roles' parse chains become `assert<Role>EdgesEntitled(assert<Role>QuotesPinned(<existing>), closure, index)`.

- [ ] **Step 1: Write the failing tests** in the new file, with the quote-pins harness (`fixtureAuthorisedCorpus`, `fixtureClosure`, `readerWith`, `prosecutorWith`, `adjudicatorWith`, `runnerWith`, `launched`, copied, because the file must read on its own):
  - seam-level, direct: a hop on `E-3` (held by the corpus, outside the closure) is refused with `names edge E-3, which the entitled closure (the ids listed under # Entitled relationships) does not hold`; a hop on `NOT-AN-EDGE` likewise; a hop on `E-2` (references) is refused for kind; a `cross_reference` on `E-1` is refused for kind; on `E-2` with `from` quoting `DOC-C` and `to` quoting `DOC-A` is refused for endpoints; the continuity rule, called with a plain `EdgeReferenceSource` carrying `X1 amends DOC-B->DOC-A` and `X2 amends DOC-C->DOC-B`, passes `X1,X2`, passes `X2,X1`, and refuses `X1` followed by a reversed-direction hop; positive control: a hop on `E-1` quoting `DOC-B` and a `cross_reference` on `E-2` from `DOC-A` to `DOC-C` pass all three gates and the outputs come back unchanged (`toBe`).
  - **the r4 shapes**, verbatim ids: an element whose evidence is an `amendment_chain` with hops `DOC-32026L0470:Art2(5)(a)->DOC-32013L0034:Art29a(1)-sub1`, `DOC-32026L0470:Art2(5)(a)-replacement-text`, `DOC-32013L0034:M8-consolidation-Art29a(1)` (quotes from `DOC-A`/`DOC-B` at their fixture pins) and another whose evidence is a `cross_reference` on `DOC-32013L0034:Art3(13)(b)->DOC-32013L0034:Art29a(1)-sub1` — exactly four problems, each naming its id and the closure scope, under `elements[0] (E9-amendment-chain).evidence[0].hops[0..2]` and `elements[1] (E16-threshold-inflation-review).evidence[0]`.
  - through `runVerificationPipeline`: the r4-shaped reader is refused at the reader seam and `launched` is `['reader[0]']`; a prosecutor[0] challenge carrying a hop on `E-3` stops before `prosecutor[1]` with `error.index` 0; an adjudicator evidence item on `NOT-AN-EDGE` is refused at the adjudicator seam; the positive control with listed ids at every role runs all four launches.
  - ordering: a reader output with both a wrong quote hash and an unlisted edge is refused with the quote problem first (the quote gate runs before the edge gate), proving the gate order.

- [ ] **Step 2: Run and read the red**

Run: `./node_modules/.bin/vitest run test/pipeline-edge-references.test.ts`
Expected: a module-not-found error naming `edge-references`. Then, after creating an empty module exporting nothing, `is not a function` per gate.

- [ ] **Step 3: Implement** the module and the three one-line wirings.

- [ ] **Step 4: Run the file, the quote-pins file (unchanged behaviour), then the suite** → green; count = Task 2's finishing count + the new tests.

- [ ] **Step 5: Teeth check** (defect: a role's parse chain forgets the gate). Remove the prosecutor wiring in a copy-in-place; the `prosecutor[0]` test goes red with `launched` equal to `['reader[0]', 'prosecutor[0]', 'prosecutor[1]', …]` — the run continued; restore by hash. Repeat for the adjudicator wiring.

- [ ] **Step 6: Hand the commands** — the four source files and the test; subject: `Refuse an edge id the closure does not list at the role seam, before the next role launches`.

---

### Task 4: Grammar 1.2.0 — every role is shown the catalog, and 1.1.0 is kept

**Files:**
- Modify: `backend/engine/src/pipeline/entitlement.ts` (`CLOSURE_RENDERER_VERSION`, the grammar type and the kept list, `forSources`, `composeRoleMessage`), `backend/engine/src/pipeline/orchestrate.ts` (`pipelineVersionFor`, the tail's `closureRendererVersion`), `backend/engine/src/cli/run.ts` (`RunCapabilities.closureRendererVersion`)
- Test: `backend/engine/test/pipeline-prompt-boundary.test.ts`, `pipeline-entitlement.test.ts`, `pipeline-standing.test.ts`

**Interfaces:**
- Produces:
  - `export type ClosureRendererVersion = '1.1.0' | '1.2.0'`; `export const CLOSURE_RENDERER_VERSION: ClosureRendererVersion = '1.2.0'`; `export const HISTORICAL_CLOSURE_RENDERER_VERSIONS: readonly ClosureRendererVersion[] = ['1.1.0']`; `export class UnknownClosureRendererVersionError extends Error` (constructor `(version: string)`, message naming the kept and current versions).
  - `EntitledClosure.forSources(source, register, pack, sourceIds, policy = CLOSURE_POLICY_V1, rendererVersion: ClosureRendererVersion = CLOSURE_RENDERER_VERSION)`; a value outside the union (a cast or a parsed string) is refused by name at construction; `readonly rendererVersion: ClosureRendererVersion` on the instance.
  - `composeRoleMessage(sections, closure)`: under `1.1.0` the message and its structural-line check are exactly today's; under `1.2.0` the section `# Entitled relationships\n\n<renderEntitledRelationships(closure)>` is inserted immediately before `# Entitled closure (…)`, and the structural check expects its heading there.
  - `pipelineVersionFor` hashes `input.closure.rendererVersion`; `runVerificationPipeline` hands the same value to the tail, so `result.closureRendererVersion` is the grammar the roles were shown.
  - `RunCapabilities.closureRendererVersion?: ClosureRendererVersion`, forwarded by `runRun` to `forSources` (absent: the current grammar).

- [ ] **Step 1: Write the failing tests**: P5 becomes `1.2.0`; P11: under `1.2.0`, every role's rendered message (reader, prosecutor, adjudicator — through `renderReaderInput`, `renderProsecutorInput`, `renderAdjudicatorInput`) contains the heading `# Entitled relationships` exactly once, immediately followed by the catalog lines of Task 2, immediately before `# Entitled closure (`; P12: under a closure built with `'1.1.0'` the same three messages contain no `Entitled relationships` and equal, byte for byte, the messages composed today (assert against a message captured from a `1.1.0` closure before the change is applied, stored as a literal digest in the test — take it in Step 2 before implementing); P13: `forSources(..., '9.9.9' as ClosureRendererVersion)` throws `UnknownClosureRendererVersionError` naming `9.9.9`, `1.1.0` and `1.2.0`; identity: two closures over the same world differing only in grammar derive two `pipelineVersion`s, and `result.closureRendererVersion` of a run over a `1.1.0` closure is `1.1.0` (pipeline-standing B15 extended).

- [ ] **Step 2: Capture the 1.1.0 reference digests before changing anything**: with the current code, compute sha256 of each of the three rendered messages over the fixture world and paste them into P12 as literals (these are the bytes `1.1.0` must keep producing).

- [ ] **Step 3: Run and read the red**: P5 fails on `'1.1.0' !== '1.2.0'`; P11 fails with the heading absent; P13 with nothing thrown.

- [ ] **Step 4: Implement** the type, the constant, the refusal, the field, the composer's two grammars, the identity and tail threading, the capability.

- [ ] **Step 5: Run the three files, then the suite.** Expected: the files green; in the suite, exactly the tests pinning an identity derived over the **current** grammar go red — `pipeline-identity.test.ts` (the `V4_PROMPTS` block and the hand-writer's `"closureRendererVersion":"1.1.0"`), `live-capture.test.ts` (`V3_PIPELINE_VERSION`, `V2_PIPELINE_VERSION`, `V1_PIPELINE_VERSION` where they are derived live), `pipeline-gap-vs-challenge.test.ts:91` and `pipeline-replay.test.ts` (which replay the S-001 recording under the current grammar). Read each failure: every one must be a `pipelineVersion` or `TranscriptRunMismatchError` naming `pipelineVersion`, and nothing else. Record the list; Tasks 5 and 6 resolve them.

- [ ] **Step 6: Teeth check** (defect: the kept grammar drifts). Change one character of the catalog heading in a copy-in-place; P11 goes red naming the heading; P12 stays green (the kept grammar emits no heading); restore by hash. Then, in a copy-in-place, make `composeRoleMessage` emit the section under `1.1.0` too; P12 goes red on the digest; restore by hash.

- [ ] **Step 7: Hand the commands** (with Task 5's and 6's, see Task 6 Step 6 — the suite is not green until then, so the three tasks are handed over together).

---

### Task 5: Prompt set v5 — use only listed ids; v4 kept; identities moved once

**Precondition:** `git --no-optional-locks log -1 --format=%s` is `Refuse an unknown prompt-set version at runtime instead of reading the current prompt file` (or a later commit on top of it). If not, stop and ask the user to run the two handed commits first.

**Files:**
- Create: `backend/engine/prompts/history/v4/reader.md`, `prosecutor.md`, `adjudicator.md` (byte-for-byte copies of today's `prompts/verification/` files)
- Modify: `backend/engine/prompts/verification/reader.md`, `prosecutor.md`, `adjudicator.md`; `backend/engine/prompts/VERSIONS.md`; `backend/engine/src/pipeline/prompts.ts`
- Test: `backend/engine/test/pipeline-quote-pins.test.ts` (the kept-sets describe and the loader refusal's expected message), `backend/engine/test/pipeline-identity.test.ts`, `backend/engine/test/live-capture.test.ts`

**Interfaces:**
- `CURRENT_PROMPT_SET_VERSION = 'v5'`; `HistoricalPromptSetVersion = 'v1' | 'v2' | 'v3' | 'v4'`; `HISTORICAL_PROMPT_SET_VERSIONS = ['v1', 'v2', 'v3', 'v4']`; `historicalPromptPath('v4', role)` resolves `prompts/history/v4/<role>.md` by literal path; the `UnknownPromptSetVersionError` message lists `v1, v2, v3, v4` and `v5`.
- The v5 text: each of the three prompts gains, after `## A quote carries its document's hash`, the section `## A relationship between documents carries its edge id` stating: the `# Entitled relationships` section lists every relationship the corpus holds between documents of the closure, one line per edge with its `edgeId`, `kind` (`amends`, `amendedBy`, `consolidates`, `references`, `definesTermsFor`), `from` and `to`; an `amendment_chain` hop and a `cross_reference` each name an `edgeId`, and the only ids a role may write are those listed, copied character for character; a hop rests on an `amends` or `amendedBy` edge, its quote comes from one of that edge's two documents, and consecutive hops continue one chain in one direction; a `cross_reference` rests on a `references` edge whose `from` and `to` are the documents of its two quotes; where the list holds no edge carrying the relationship, show it with `quote` evidence from the documents and say in the statement what the quoted text establishes; never write an id the list does not hold, never compose one from article numbers or document ids, never present a relationship as an edge because the text implies it; the pipeline checks every edge id against the list as soon as the output arrives, and an id it does not hold is a defect, not a gap, and the run is refused. The reader's `## What you are given` gains a bullet for the relationships section. Nothing else in the three files changes (the test asserts: v4 with the section inserted and the bullet added is v5, character for character).

- [ ] **Step 1: Copy v4 into history** and confirm `shasum` of the three copies equals the VERSIONS.md v4 row.

- [ ] **Step 2: Write the failing tests**: in `pipeline-quote-pins.test.ts` the kept-sets describe asserts `CURRENT_PROMPT_SET_VERSION === 'v5'`, `HISTORICAL_PROMPT_SET_VERSIONS` equals the four, `historicalPromptPath('v4', role)` points under `history/v4`, `promptHashes(loadHistoricalPromptSet('v4'))` equals the v4 digests (`3aa48bfd…`, `92556391…`, `a134ce8e…`), every v5 prompt contains `# Entitled relationships`, `copied character for character` and `never compose one from article numbers`, no kept set contains `Entitled relationships`, and v4 with the section inserted (and the reader's bullet) is v5 character for character; the loader-refusal test's expected message becomes `the kept sets are v1, v2, v3, v4`. In `pipeline-identity.test.ts`: the describe becomes "the v5 set over grammar 1.2.0 derives new identities; the kept v1–v4 sets over a 1.1.0 closure still derive the historical ones" — the historical block constructs its closure with `'1.1.0'` and keeps every existing literal (`V4_PROMPTS` now the kept v4's, with `at3` `f13257de…` exactly as r4 ran), the current block takes its four literals once after the prompts are final, corroborated by the hand-writer with `closureRendererVersion` `'1.2.0'` (the hand-writer gains that parameter, default `'1.1.0'` for the kept sets). In `live-capture.test.ts`: `V3_PIPELINE_VERSION` (line 4609) becomes the v5/1.2.0 `at3` literal; `V2_PIPELINE_VERSION` and `V1_PIPELINE_VERSION` where derived over the current set and grammar likewise; the comment records r4's identity as the kept v4 one.

- [ ] **Step 3: Run and read the red**: version literals and digests, named.

- [ ] **Step 4: Implement** `prompts.ts` and the three v5 files; update `VERSIONS.md` (v5 row with the three new digests, computed by `shasum`; the v5 paragraph: why — r4's reader named four edge ids the corpus does not hold, no seam checked edges, nine launches were spent; what — the catalog, the instruction, the seam, the grammar).

- [ ] **Step 5: Take the four v5 identities once** (`pipelineVersionFor` over `loadPromptSet()` and a `1.2.0` closure for http/@1/@2/@3) and paste them into the two test files; run the three files → green; run the suite → only the replay-bound tests of Task 4 Step 5 remain red.

- [ ] **Step 6: Teeth check** (defect: a kept set is silently edited). Change one byte of `history/v4/reader.md` in a copy-in-place; the v4-digest assertion and the historical `at3` identity assertion go red naming `reader`/`f13257de`; restore by hash.

---

### Task 6: Historical replay is preserved under the kept grammar

**Files:**
- Modify: `backend/engine/test/pipeline-replay.test.ts` (the `dispatch` call near line 255 gains `closureRendererVersion: '1.1.0'`), `backend/engine/test/pipeline-gap-vs-challenge.test.ts` (its replay runs likewise; its `pipelineVersionFor` comparisons use a `1.1.0` closure for v1 and the current closure for the current set)

- [ ] **Step 1: Read the red first**: run `test/pipeline-replay.test.ts` as it stands after Task 5. Expected: `TranscriptRunMismatchError` naming `pipelineVersion` (the recording was made under `1.1.0`; the run derived `1.2.0`). Read it: it must name `pipelineVersion` and nothing else.

- [ ] **Step 2: Add the capability** at the replay call sites; run the two files → green with the recording file unchanged.

- [ ] **Step 3: Assert the frozen recording**: `shasum -a 256` of `test/verification-transcripts/csrd/CSRD-S-001/run-v1-8717925d….json` equals Task 0's value; `git status` shows no change under `test/verification-transcripts/`.

- [ ] **Step 4: Run the whole suite** → green; count = Task 3's finishing count + Tasks 4–5's new tests; `tsc --noEmit` exit 0; csrd count 7.

- [ ] **Step 5: Teeth check** (defect: the kept grammar is not what the recording was made under). Pass `'1.2.0'` at the replay call site in a copy-in-place; the replay suite goes red with `TranscriptRunMismatchError` naming `pipelineVersion`; restore by hash.

- [ ] **Step 6: Hand the commands for Tasks 4–6 as one commit** (`entitlement.ts`, `orchestrate.ts`, `run.ts`, `prompts.ts`, the three v5 prompts, the three v4 history files, `VERSIONS.md`, and the six test files); subject: `Show every role the closure's relationships and version the grammar and prompts so the kept recordings still replay`.

---

### Task 7: The saved r4 failures, re-run; the checkpoint

**Files:**
- Create: `docs/superpowers/CHECKPOINT-evidence-edge-contract.md`
- Scratchpad only (not committed): a script that loads the real S-002 world (`readWorld`), reads XS4's recorded reader output from its sealed transcript, and runs `assertReaderEdgesEntitled` over the real closure; prints counts and the four problem lines (ids only).

- [ ] **Step 1: Run the script**, read-only against `pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T090314Z-b34711/`; expected: `RoleOutputError` for `reader[0]` with exactly four problems naming the four ids and `the entitled closure`; the positive control (the same reading with E9's chain replaced by one hop on `EDGE-32013L0034-amendedBy-32026L0470` quoting `DOC-32026L0470`, and E16's cross-reference replaced by its two quotes) passes the gate. Save the output to the shared notes folder; re-verify XS4's manifest afterwards.

- [ ] **Step 2: Write the checkpoint**: what was found (the defect, the four ids, the seams' blind spot), what was decided (the shared rules, the catalog on the capability, the selectable grammar, v5, no corpus edit), the verbatim teeth outputs of Tasks 1–6 and this step, what is handed forward (a new package bound to the HEAD after these commits; the adjudicator-schema and constrained-decoding residuals unchanged; the quote-hash option 2 and the `MISMATCH` verdicts still open), and the unresolved issues for review.

- [ ] **Step 3: Hand the commands** — `git add docs/superpowers/plans/2026-10-19-evidence-edge-contract.md docs/superpowers/CHECKPOINT-evidence-edge-contract.md`; subject: `Record the evidence-edge contract change and the checks that prove it refuses r4's edge ids before spend`.
