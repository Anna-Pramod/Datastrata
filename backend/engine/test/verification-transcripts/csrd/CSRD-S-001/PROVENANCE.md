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

## Three generations live here

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
| standing-era | `run-v1-a6743df7d36b8…` | current |

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
`requirementInputSha256` and `renderedConditionSha256` did **not** move. Both
partitions are measured in `pipeline-replay.test.ts` between the retired recordings
themselves, not asserted from a plan.

`SUPERSEDED_RUN_IDS` in `test/replay-fixtures.ts` is the list of retired identities.
Adding a generation means appending to it, never overwriting a file.

Regenerate with `npx tsx test/record-replay-fixture.ts` from `backend/engine`.
