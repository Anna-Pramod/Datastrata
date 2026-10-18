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
| v3 (`history/v3/`) | `d35043566ce39aa369b1d71466328ba5b991a0f2b0fc900cf1c6ce0d3b4ad5f1` | `148f12a94231128edbd2224ca6d130d859b372b825bd16af7260d9c5e41a7e54` | `9292026f228fab2623970912000f994452056a49194221a19d9d55e85029c998` | 2026-10-18/19: the third S-002 capture (r3), failed at `prosecutor[0]`, which delivered its answer as fenced text and never called the StructuredOutput tool |
| v4 (`verification/`) | `3aa48bfddf53749463f74f5ae7f98dfa47426a941d05993782eaca1e06480cff` | `92556391c7668b2f2a0dcdc42e4281d9f9a658e7e7abae18f8294363596cb32a` | `a134ce8e3ccc09b63a94308c67db63eefc701b2448359b884c2a4ce2358051d5` | from 2026-10-19, after r3 |

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
`docs/superpowers/CHECKPOINT-opus55-s002-capture-r2.md`.

**v4** replaces, in all three prompts, the one-line delivery instruction every
earlier set ended with — "Output the JSON object and nothing else." — with a
paragraph that names the delivery channel: when the StructuredOutput tool is
available, call it exactly once with the required JSON object as its input,
and never deliver the answer as a text message or Markdown code block; when
the tool is unavailable, output the JSON object directly, without fences or
commentary. Nothing else in the three files changes (each v4 file is its v3
file with that one line replaced, which `test/pipeline-quote-pins.test.ts`
asserts character for character). Why: r3's `prosecutor[0]` answered under
the v3 prompt with one text block holding the prosecutor output as a
```` ```json ```` fence and never called the tool; the CLI's enforce message
fired, and with the committed launch control `MAX_STRUCTURED_OUTPUT_RETRIES=0`
the launch ended with exit 1 and the run was cancelled
(`docs/superpowers/CHECKPOINT-opus55-s002-capture-r3.md`). The instruction
reduces the observed delivery risk; it cannot guarantee that a model complies.
The HTTP route, which offers no tool, keeps the direct JSON it always had.
Retries stay at zero, the schemas and the launch controls are unchanged, and
fenced text from a failed launch is never salvaged.

Compatibility, as far as r3 showed it: r3's reader and prosecutor requests
were not rejected for the supplied schemas, each carrying the 64-hex
`pattern` (both completed at the API). That does not establish native
constrained decoding, and it says nothing about the adjudicator schema, which
has not been sent: the adjudicator never launched.

The identities each set derives over the S-002 closure are pinned in
`test/pipeline-identity.test.ts`.
