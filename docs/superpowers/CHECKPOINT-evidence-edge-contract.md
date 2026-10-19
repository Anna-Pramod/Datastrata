# Checkpoint — the evidence-edge contract: a role may name a corpus relationship only by an edge id the pipeline listed to it, and an unlisted id is refused at that role's seam before the next launch

Written on 2026-10-19 (UTC and +0530) by the session that read the sealed r4 record, in the candidate worktree `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch `feature/opus55-subscription-migration`), on top of `f6cb981` (the loader-fallback fix) and `13d73a0` (the r4 checkpoint). The plan this executed is `docs/superpowers/plans/2026-10-19-evidence-edge-contract.md`; the standard it was judged against is `docs/superpowers/TEST-EVIDENCE-STANDARD.md`. Every time below is UTC.

- **Scope of this change.** The engine, the prompts, their tests, and this file with its plan. No live run, no promotion, no signing, no new capture package. Nothing under `pilot-evidence/` was created, changed or deleted; the committed S-001 replay recording, the corpus index, the knowledge packs and the goldens are byte-identical to HEAD. The user runs every `git add` and `git commit`.
- **Where the evidence is.** The sealed r4 record `pilot-evidence/subscription-executions/csrd/CSRD-S-002/20261019T090314Z-b34711/` (manifest `e435e42d…`, 16 entries, re-verified after every read); the shared side-session notes folder `local_043075c1-dc26-44e4-b3a9-257ce611215c/2026-10-19T1100Z-evidence-edge-contract-progress/` (every log named below, the tracked diff, the new-file digests, under a `MANIFEST.sha256`).

## What was found

The fourth genuine S-002 capture (r4, `CHECKPOINT-opus55-s002-capture-r4.md`) completed through nine `StructuredOutput` calls, every role seam passed, assembly wrote the result, and the record boundary's evidence check failed on two of 37 evidence sets: the reader's `E9-amendment-chain` (three hops) and `E16-threshold-inflation-review` (one cross-reference) named four edge ids the corpus does not hold —

    DOC-32026L0470:Art2(5)(a)->DOC-32013L0034:Art29a(1)-sub1
    DOC-32026L0470:Art2(5)(a)-replacement-text
    DOC-32013L0034:M8-consolidation-Art29a(1)
    DOC-32013L0034:Art3(13)(b)->DOC-32013L0034:Art29a(1)-sub1

— each composed from article numbers and document ids. The S-002 closure holds exactly one edge, `EDGE-32013L0034-amendedBy-32026L0470` (`amendedBy`, `DOC-32013L0034` → `DOC-32026L0470`). Three things let the run spend nine launches before anything objected: nothing had shown the reader which edge ids exist (the closure text shows documents, not the edges between them); the role seams checked each quote's `docId` and hash (`quote-pins.ts`) and nothing checked an edge; and the only edge rules in the engine lived inside `checkEvidenceSet`, the signing gate's function, which runs at the record boundary and needs the whole loaded corpus.

## What was decided

1. **One set of edge rules, shared.** The gate's rules — the edge exists in the lookup's scope; an `amendment_chain` hop rests on an `amends`/`amendedBy` edge and its quote comes from one of that edge's two documents; a `cross_reference` rests on a `references` edge whose `from`/`to` are the documents of its two quotes; a chain's hops continue one chain in one direction — are extracted into `edgeReferenceProblems(item, label, edges: EdgeLookup)` in `src/corpus/evidence.ts`. `checkEvidenceSet` obtains every edge problem from it over `corpusEdgeLookup(corpus)` (scope "the corpus"); the seam calls it over the closure's edges (scope "the entitled closure (the ids listed under # Entitled relationships)"). A test holds the gate to the function case by case.
2. **The catalog is read off the capability.** `EntitledClosure.edges` lists the closure's edges as `{edgeId, kind, from, to}` — never provenance, never a source id — in `edgeIds` order; `renderEntitledRelationships` renders one fixed line per edge, or one sentence when there is none, and `composeRoleMessage` emits it as `# Entitled relationships` immediately before `# Entitled closure`, for every role alike. Reader blindness is preserved: the section carries document and edge identity only.
3. **The seam.** `src/pipeline/edge-references.ts` — `assertReaderEdgesEntitled`, `assertProsecutorEdgesEntitled`, `assertAdjudicatorEdgesEntitled` — runs after the quote gate in each role's parse chain, so an unlisted or misused id is refused at that role, under the record's own paths, before the next role launches. Nothing is filled or corrected; the output is refused and the transcript keeps what the model returned.
4. **The grammar is selectable, and the kept one renders the bytes it always did.** `CLOSURE_RENDERER_VERSION` is `1.2.0`; `1.1.0` is kept (`HISTORICAL_CLOSURE_RENDERER_VERSIONS`); the grammar is chosen at `EntitledClosure.forSources(..., rendererVersion)`, carried as `closure.rendererVersion`, read by the composer, hashed into `pipelineVersion` and written to the record's `closureRendererVersion`; a version outside the kept-or-current set is refused by name (`UnknownClosureRendererVersionError`). `RunCapabilities.closureRendererVersion` lets the replayer pass `1.1.0` beside the kept v1 prompts, so the committed S-001 recording replays unchanged.
5. **Prompt set v5; v4 kept.** Each v5 file is its v4 file with a `relationships` entry under "What you are given" and the section "A relationship between documents carries its edge id" inserted, and nothing else (asserted character for character): use only the listed ids, copied exactly; where no listed edge carries the relationship, show it with quote evidence and say what the text establishes; never compose an id from article numbers or document ids. v4 is kept under `prompts/history/v4/` at the digests r4 ran under (`3aa48bfd…`, `92556391…`, `a134ce8e…`); `prompts/VERSIONS.md` records v5 (`9f9f0db4…`, `685266b9…`, `42c93b0f…`).
6. **No corpus metadata was added to accommodate the output.** The four ids stay absent; `corpus/index.json` is unchanged.
7. **Identities moved once.** The kept sets under grammar `1.1.0` still derive every pinned literal (v1, v2, v3 and now v4, including r4's `@3` identity `pipeline-v3-f13257de…`); the v5 set under `1.2.0` derives four new ones: http `pipeline-v3-06d40e11…`, `@1` `pipeline-v3-13a2fbfc…`, `@2` `pipeline-v3-73be74ea…`, `@3` `pipeline-v3-85810d54…`, each corroborated by the test file's hand-written derivation.

## What was built (the diff for review)

| File | Change |
|---|---|
| `backend/engine/src/corpus/evidence.ts` | `EdgeLookup`, `corpusEdgeLookup`, `edgeReferenceProblems`; the gate calls them |
| `backend/engine/src/corpus/schema.ts` | `amendmentDirection` takes the three fields it reads |
| `backend/engine/src/pipeline/entitlement.ts` | `EntitledEdge`, `edges`, `renderEntitledRelationships`; `ClosureRendererVersion`, kept `1.1.0`, current `1.2.0`, `UnknownClosureRendererVersionError`; `forSources(..., rendererVersion)`; the relationships section in `composeRoleMessage` |
| `backend/engine/src/pipeline/edge-references.ts` (new) | the seam |
| `backend/engine/src/pipeline/reader.ts`, `prosecutors.ts`, `adjudicator.ts` | the edge gate after the quote gate |
| `backend/engine/src/pipeline/orchestrate.ts`, `src/cli/run.ts` | the identity and the record take the closure's grammar; the replay capability |
| `backend/engine/src/pipeline/prompts.ts`, `prompts/verification/*.md`, `prompts/history/v4/*.md` (new), `prompts/VERSIONS.md` | v5 current, v4 kept |
| tests: `corpus-evidence`, `pipeline-entitlement`, `pipeline-edge-references` (new), `pipeline-prompt-boundary`, `pipeline-adjudicator`, `pipeline-seven-lenses`, `pipeline-identity`, `live-capture`, `pipeline-gap-vs-challenge`, `pipeline-replay`, `pipeline-quote-pins` | the checks below |

## Verification — what ran, with the outputs

**Baseline (Task 0):** `vitest run` → 81 files, 3165 tests, exit 0; S-001 recording `def7f7fc…`; csrd count 7.

**Task 1 — the shared rules.** Nine new tests red first (`edgeReferenceProblems is not a function`, `corpusEdgeLookup is not a function`), then `corpus-evidence.test.ts` 38 of 38. Teeth (defect: the gate silently stops applying a rule), the continuity block deleted in a copy-in-place, verbatim:

    continuity text present after mutation: 0
       × amendment chain evidence > rejects hops that share a document without succeeding one another
       × amendment chain evidence > rejects a chain that changes direction part way along
       × amendment chain evidence > rejects a chain whose hops do not connect at all
       × the edge rules, shared … > continuity: a chain walked either way passes; hops that share an amender without succeeding one another are refused naming both ids
       × the edge rules, shared … > one function, two gates: for every edge-bearing item in this file, the gate's edge problems are exactly the function's over the corpus lookup
          Tests  5 failed | 33 passed (38)
    restored by hash: yes (dba80014…)

**Task 2 — the catalog.** Three tests red (`edges` undefined, `renderEntitledRelationships is not a function`), then 9 of 9. Teeth (defect: provenance leaks into what a role is shown), the getter spreading the whole corpus edge:

       × … > edges is exactly the sorted edges with both endpoints inside, each as id, kind, from and to, and nothing else
         → expected [ { edgeId: 'E-1', …(4) }, …(1) ] to deeply equal [ { edgeId: 'E-1', …(3) }, …(1) ]
          Tests  1 failed | 8 passed (9)
    restored by hash: yes (ace5671b…)

**Task 3 — the seam.** Sixteen tests red (`Failed to load url ../src/pipeline/edge-references`), then 16 of 16 with `pipeline-quote-pins.test.ts` unchanged at 39 and `tsc --noEmit` exit 0. Among them, the r4 shapes with the four ids verbatim: exactly four problems under `elements[0] (E9-amendment-chain).evidence[0].hops[0..2]` and `elements[1] (E16-threshold-inflation-review).evidence[0]`; through `runVerificationPipeline`, the r4-shaped reader leaves `launched` at `['reader[0]']`. Teeth (defect: a role's parse chain forgets the gate), each wiring removed in turn:

    mutated: prosecutor edge gate unwired
       × … > an unlisted edge in prosecutor[0]'s challenge stops the run before prosecutor[1] and the adjudicator launch, naming index 0
         → expected the promise to reject with a RoleOutputError, and it resolved
          Tests  1 failed | 15 passed (16)
    restored by hash: yes
    mutated: adjudicator edge gate unwired
       × … > an unlisted edge in the adjudicator's evidence is refused at the adjudicator seam, so no record is assembled from it
         → expected the promise to reject with a RoleOutputError, and it resolved
          Tests  1 failed | 15 passed (16)
    restored by hash: yes

Suite after Task 3: 82 files, 3193 tests, exit 0.

**Task 4 — grammar 1.2.0, 1.1.0 kept.** The `1.1.0` reference digests were taken over the fixture world before the composer changed (reader `611f78bb…`, prosecutor `2ecb5149…`, adjudicator `2e1cddcd…`) and pinned in P12. P5, P11–P15, the entitlement and standing tests red (`rendererVersion` undefined; `'1.1.0' !== '1.2.0'`; nothing thrown for an unknown grammar), then green; the two heading enumerations (`pipeline-adjudicator`, `pipeline-seven-lenses`) gained the relationships heading. Teeth, two mutations:

    mutated: heading is now # Entitled relationship
       × … P8, P9, P10 positive control (the independent structural-line enumerations)
       × … P11 — under 1.2.0 every role's message carries the relationships section once …  → reader: expected +0 to be 1
       × … P12 (its positive-control half: the section the mutated heading failed to remove)
          Tests  5 failed | 14 passed (19)
    restored by hash: yes
    mutated: 1.1.0 emits the section
       × … P12 — under the kept 1.1.0 the three messages are byte-identical …  → expected 'bd3fb510…' to be '611f78bb…'
          Tests  1 failed | 18 passed (19)
    restored by hash: yes

After Task 4 the suite showed 41 red in five files, every one explained: the identity literals derived over the current grammar (16 in `pipeline-identity`, 3 in `live-capture`), twenty replay refusals all `TranscriptRunMismatchError` naming `pipelineVersion`, and the two heading enumerations — the first two groups resolved by Tasks 5 and 6.

**Task 6 — historical replay preserved.** The red first: `no recorded transcript describes run run-v1-05be5c14… — pipelineVersion: the run is pipeline-v3-237d60d4…, the recording is pipeline-v3-14c19fec…`. With `closureRendererVersion: '1.1.0'` at the replay call site beside `loadHistoricalPromptSet('v1')`: `pipeline-replay` 79 and `pipeline-gap-vs-challenge` 9 green, the recording's digest unchanged (`def7f7fc…`), nothing under `test/verification-transcripts/` modified. Teeth (defect: the kept grammar is not what the recording was made under), `'1.2.0'` at the call site: the same `TranscriptRunMismatchError` naming `pipelineVersion`; restored by hash.

**Task 5 — v5 current, v4 kept.** Applied after the loader-fallback commit landed (it edits the same two files). `pipeline-quote-pins`, `pipeline-identity`, `pipeline-gap-vs-challenge`: 107 of 107. Teeth (defect: a kept set is silently edited), one byte of `prompts/history/v4/reader.md`:

    mutated: one byte (reader -> Reader) in the kept v4 reader file
       × … > v4 is kept byte for byte (the digests the r4 capture ran under) …  → expected { …(3) } to deeply equal { …(3) }
       × … > v4 replaces the one-line delivery instruction … v3 with that one line replaced is v4
       × … > v5 inserts the relationships entry and section … v4 with the two insertions is v5
       × … > a version the repository does not keep is refused by name … (the kept-v4 digests)
       × … > the hand-writer over the kept v2, v3 and v4 prompt files reproduces their @2 and @3 literals …  → expected 'pipeline-v3-8fa25201…' to be 'pipeline-v3-d6005bb1…'
       × … http / at1 / at2 / at3: the kept v4 set under 1.1.0 derives its historical literal  → … to be 'pipeline-v3-f13257de…' (at3)
          Tests  9 failed | 89 passed (98)
    restored by hash: yes (3aa48bfd…)

**The whole suite, after Task 5:** 82 files, 3200 tests, exit 0; `tsc --noEmit` exit 0; `grep -ri csrd src/` 7.

**Task 7 — the saved r4 failure, re-run through the seam** (read-only against the sealed record, over the real S-002 closure under `1.2.0`; counts and ids only; XS4 16 of 16 afterwards and nothing under `pilot-evidence/` newer than its seal):

    recorded reader output: elements 17 gaps 0 evidence items 25
    evidence rule and quote pins: PASS (as in r4)
    edge seam: REFUSED RoleOutputError role=reader index=0 problems=4
      - elements[8] (E9-amendment-chain).evidence[0].hops[0]: names edge DOC-32026L0470:Art2(5)(a)->DOC-32013L0034:Art29a(1)-sub1, which the entitled closure (the ids listed under # Entitled relationships) does not hold
      - elements[8] (E9-amendment-chain).evidence[0].hops[1]: names edge DOC-32026L0470:Art2(5)(a)-replacement-text, which the entitled closure (the ids listed under # Entitled relationships) does not hold
      - elements[8] (E9-amendment-chain).evidence[0].hops[2]: names edge DOC-32013L0034:M8-consolidation-Art29a(1), which the entitled closure (the ids listed under # Entitled relationships) does not hold
      - elements[15] (E16-threshold-inflation-review).evidence[0]: names edge DOC-32013L0034:Art3(13)(b)->DOC-32013L0034:Art29a(1)-sub1, which the entitled closure (the ids listed under # Entitled relationships) does not hold
    positive control: PASS — E9 as one hop on EDGE-32013L0034-amendedBy-32026L0470, E16 as two quotes; 17 elements

**Frozen records, after everything:** S-001 recording `def7f7fc…` (baseline value); `corpus/index.json`, `knowledge/` and `test/golden/` unchanged against HEAD; XS 12 of 12, XS2 14 of 14, XS3 7 of 7, XS4 16 of 16; the r4 package 20 of 20 and 13 of 13, launcher `592f18ae…`; the case directory's seven entries; no entry under `pilot-evidence/` newer than the r4 seal.

## Unresolved issues, for review

1. **The grammar is carried on the closure capability** (`EntitledClosure.rendererVersion`, chosen at construction) rather than passed to each role renderer. It keeps every renderer a function of its input alone and lets `pipelineVersionFor` read the grammar off the closure; the cost is a rendering concern on the evidence-surface object. A design choice, open to review.
2. **An edge id that itself starts a `#` or `<<<` line** would be refused at `composeRoleMessage` (a structural line the pipeline did not write) rather than collapsed as titles are; the corpus schema does not forbid such ids. The real ids are of the form `EDGE-…`.
3. **`absence` evidence is still checked only at the gate.** Its lexical search needs the corpus text the seam does not hold. Out of scope here; the seam covers quotes (docId, hash) and edges.
4. **The r4 dossier stands as filed and is not signable.** This change would have refused that reading at the reader after one launch; it repairs nothing in the record, and the requirement author's reading of the ten verdicts is unchanged.

## Handed forward

- **The next capture package binds afresh** to the HEAD after these commits: the 35 bound files move where this change touched them, the `@3` identity becomes `pipeline-v3-85810d54…`, the `runId` and the reader's launch description (which now carries the relationships section) move with it; `REVIEWED_INPUTS` must be re-measured; the readiness step and the reviewer's binding check are repeated. Not started here, by instruction.
- **Still open from earlier checkpoints:** the engine filling the quote hash itself (r2 open decision 2); the adjudicator's seven `MISMATCH` and three `OPEN_QUESTION` verdicts for the requirement author; native constrained decoding unproven; the thinking-count observer; the harness's absolute paths.
- **The loader-fallback fix** landed as `f6cb981`, before this change, as agreed.

## Process notes

- **Who.** The r4 return session, in this session's own turn after the user's instruction; no subagent; the plan executed inline, task by task, each test written and seen red before its implementation.
- **What ran.** `vitest run` (the default suite, which excludes the live agents suite), `tsc --noEmit`, `git --no-optional-locks` reads, `shasum`, `find` and `stat` under `TZ=UTC`, Python (standard library, `-I`) for exact-match edits and the record pass, Node through the candidate's own `tsx`. The first of the three commits handed over was checked green on its own in a temporary detached worktree at HEAD (removed afterwards). No live run, no network, no Claude Code or `ollama` execution, nothing under `pilot-evidence/` written, nothing in `b1b-record`.
- **Commits.** Handed to the user in three parts: the shared rules (a refactor with its equivalence test), the contract change (catalog, seam, grammar, prompts, pins, replay), and the documents.
