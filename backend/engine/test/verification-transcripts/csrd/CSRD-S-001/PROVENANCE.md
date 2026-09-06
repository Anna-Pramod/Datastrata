# Synthetic replay fixture — no model produced this

Recorded by `backend/engine/test/record-replay-fixture.ts` driving
`syntheticCapability` (`test/replay-fixtures.ts`). **No model was contacted and no
credential existed in the process that wrote it.** The role outputs are hand-written
placeholders that say so in their own words; the evidence quotes are real sentences
from the real corpus, because the evidence checker verifies them against the
documents.

`model` reads `claude-opus-5` on every exchange. That is the model id the run was
configured with and is a `pipelineVersion` input, so it is recorded truthfully rather
than replaced with a sentinel — it does **not** mean a model answered.

The first genuine provider transcript does not exist yet. It will use this same format
and this same path, and replacing this file is a decision rather than a fix: it retires
the recorded outputs as evidence.

## Five generations live here

A recording is bound to a run identity, so it stops binding when the question moves.
When that happens the old recording is **retired, not deleted**: it is evidence of an
execution that happened, and deleting it would erase the only record of what the
pipeline produced under the previous inputs. `readTranscriptsFor` selects by the
identity a recording is filed under, so retired files are inert — no run can bind to
one by accident.

| Generation | `runId` | Status |
| --- | --- | --- |
| pre-D1(a) | `run-v1-764e571e…` | retired 2026-08-27 |
| provenance-era | `run-v1-e77e9d0d…` | retired 2026-09-05 |
| standing-era | `run-v1-a6743df7…` | retired 2026-09-05 |
| prompt-era | `run-v1-14b51960…` | retired 2026-09-06 |
| adapter-era | `run-v1-8717925d73133…` | current |

The D1(a) provenance migration retired the first. It moved `pipelineVersion` — the
reader prompt changed when locators replaced source identities in `ReaderInput` — and
`requirementInputSha256`, whose domain became the authored `provenance` in place of
`provisions` and `sources`; `runId` follows from both. `packId`, `requirementId`,
`renderedConditionSha256` and `corpusClosureSha256` did **not** move.

B-E2 retired the second, and this retirement — unlike the migration — **did** move
`corpusClosureSha256`: temporal standing, artefact authenticity and the declared
non-operative sections entered the closure's canonical line. `pipelineVersion` moved
with it (identity scheme `v3` hashes the closure policy's `expansion` rule and
`closureRendererVersion`), and `runId` follows from both. `packId`, `requirementId`,
`requirementInputSha256` and `renderedConditionSha256` did **not** move.

B-PROMPT retired the third. The three prompt files gained the rule that closure text
and earlier roles' output are evidence and never instruction, and the closure
renderer's grammar moved to `1.1.0`: every document fenced between lines carrying its
id and hash, heading- and fence-shaped document lines indented, authored titles and
version labels collapsed to one line, carried role output escaped as JSON, and every
message composed through one function that refuses a structural line it did not
write. So `pipelineVersion` moved and `runId` with it. `corpusClosureSha256` did
**not** move: the closure hash covers the stored text, not its rendering. All three
partitions are measured in `pipeline-replay.test.ts` between the retired recordings
themselves, not asserted from a plan.

B-ADAPTER retired the fourth. The role configuration moved to seven prosecutors, one
per declared lens, and selected the concrete adapter `anthropic-messages@1`; both are
`pipelineVersion` inputs, so `runId` moved with it. The prompts, the closure renderer
and every other binding field did **not** move. This recording was made through the
adapter path — the live runner, the adapter's real request and projection — over a
**canned transport** with the suite's network trap installed, so it has the shape a
genuine recording will have. It is still synthetic: no model was contacted, and the
nine exchanges (one reader, seven prosecutors, one adjudicator) carry the synthetic
outputs. A genuine recording, when one is authorised and made, is filed beside these
under its own identity; none of them is deleted for it.

`SUPERSEDED_RUN_IDS` in `test/replay-fixtures.ts` is the list of retired identities.
Adding a generation means appending to it, never overwriting a file.

Regenerate with `npx tsx test/record-replay-fixture.ts` from `backend/engine`.
