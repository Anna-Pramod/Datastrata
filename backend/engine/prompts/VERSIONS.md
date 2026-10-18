# Prompt set versions

A role's prompt file is hashed into `pipelineVersion` and into every recorded
exchange's `requestSha256`. A recording is therefore replayable only against
the set it was made under. Superseded sets are kept byte for byte under
`history/<version>/` and read by `loadHistoricalPromptSet` (`src/pipeline/prompts.ts`);
the current set is the three files in `verification/`, which holds exactly those
three and nothing else. Nothing here is a path
anything resolves — each file is named by its own literal path in the loader.

| Version | reader | prosecutor | adjudicator | In force |
|---|---|---|---|---|
| v1 (`history/v1/`) | `4d21d2b93df0e23b5ae6d95987d9c72ef167bc01d03cb48f7eb742ade2f3ed6e` | `87eb0a212ec3b5e97ec4ce26dbe416a47bcf3562e87f45dcbf08ff73829c3edb` | `f38ba1f0cf217904f63501300d14a925928ed0eb929b4fb6c83d5d72e798a46a` | every recording before 2026-10-18: the S-001 replay fixtures, the two probes, the rehearsal, the S-002 capture |
| v2 (`verification/`) | `4d21d2b93df0e23b5ae6d95987d9c72ef167bc01d03cb48f7eb742ade2f3ed6e` (unchanged) | `9c0ecc66306d2107518aeeb92ada4deb4010a1436a8f9481559004dd6d6ca0b5` | `cea3e6f02951b300c84b603d9b36b538f77fb7f2a3c8ac9c6bc470961ec24698` | from 2026-10-18 |

**v2** adds to the prosecutor and the adjudicator the distinction between an
objection the closure can carry — a challenge, which the adjudicator may leave
`OPEN_QUESTION` — and a document a judgment genuinely needs, which is a gap
and halts the run. The reader is untouched: its isolation is the point of it.
See `docs/superpowers/HANDOFF-2026-10-18-s002-scope-vs-timing.md`.
