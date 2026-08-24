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

Regenerate with `npx tsx test/record-replay-fixture.ts` from `backend/engine`.
