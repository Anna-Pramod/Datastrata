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
| v1 (`history/v1/`) | `4d21d2b93df0e23b5ae6d95987d9c72ef167bc01d03cb48f7eb742ade2f3ed6e` | `87eb0a212ec3b5e97ec4ce26dbe416a47bcf3562e87f45dcbf08ff73829c3edb` | `f38ba1f0cf217904f63501300d14a925928ed0eb929b4fb6c83d5d72e798a46a` | every recording before 2026-10-18: the S-001 replay fixtures, the two probes, the rehearsal, the first S-002 capture (r1) |
| v2 (`history/v2/`) | `4d21d2b93df0e23b5ae6d95987d9c72ef167bc01d03cb48f7eb742ade2f3ed6e` (unchanged) | `9c0ecc66306d2107518aeeb92ada4deb4010a1436a8f9481559004dd6d6ca0b5` | `cea3e6f02951b300c84b603d9b36b538f77fb7f2a3c8ac9c6bc470961ec24698` | 2026-10-18: the second S-002 capture (r2), refused at assembly on empty quote hashes |
| v3 (`verification/`) | `d35043566ce39aa369b1d71466328ba5b991a0f2b0fc900cf1c6ce0d3b4ad5f1` | `148f12a94231128edbd2224ca6d130d859b372b825bd16af7260d9c5e41a7e54` | `9292026f228fab2623970912000f994452056a49194221a19d9d55e85029c998` | from 2026-10-18, after r2 |

**v2** adds to the prosecutor and the adjudicator the distinction between an
objection the closure can carry — a challenge, which the adjudicator may leave
`OPEN_QUESTION` — and a document a judgment genuinely needs, which is a gap
and halts the run. The reader is untouched: its isolation is the point of it.
See `docs/superpowers/HANDOFF-2026-10-18-s002-scope-vs-timing.md`.

**v3** adds to all three prompts the section "A quote carries its document's
hash": a quote's `sha256Normalized` is the hash on its document's
`<<<BEGIN DOCUMENT <docId> sha256Normalized=<hash>>>>` line, copied character
for character, never empty, computed or taken from another fence — and the
adjudicator's pin rule now names that as the one hash a role writes. The
reader changes for the first time, because the reader is where r2's 120 empty
hashes were produced. Beside the prompts, the quote schema requires 64 lowercase
hex (`src/corpus/evidence.ts`, carried into the provider schema as `pattern`),
and each role seam checks every quote's `docId` and hash against the closure
before the next role launches (`src/pipeline/quote-pins.ts`). See
`docs/superpowers/CHECKPOINT-opus55-s002-capture-r2.md`. The identities each
set derives over the S-002 closure are pinned in `test/pipeline-identity.test.ts`.
