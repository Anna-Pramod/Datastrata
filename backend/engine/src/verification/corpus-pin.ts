/**
 * The corpus pin — one structural contract, used by two artefacts.
 *
 * A pinned corpus document is what a conclusion rests on: the document's id,
 * the edition label it bore, both hashes, and the normalizer that produced the
 * normalized one. `verification-result.json` records that shape and
 * `signatures.jsonl` records it again, and the sign gate compares the two field
 * by field — which only means anything if they are the same concept rather than
 * two concepts that currently look alike.
 *
 * They used to be two definitions, byte-identical and independent, one in
 * `result.ts` and one in `ledger.ts`. Identical definitions agree by
 * coincidence, not by construction: had one moved, a producer would have
 * emitted a result that parses and a candidate that cannot be signed, with
 * nothing naming the field the two differ about. A tooth watching for that
 * divergence is strictly weaker than removing the second definition, so there
 * is now one object and `import` is what makes the two artefacts agree.
 *
 * **This module is owned by neither artefact, and that is the point.** Had
 * `ledger.ts` kept the definition and `result.ts` imported it, the record's pin
 * would be "whatever the ledger says a pin is" — a dependency direction neither
 * artefact is entitled to, since the result exists before any signature does
 * and the ledger outlives every result file. Both hashes are retained for the
 * same reason in both places: `sha256Normalized` is the text a conclusion rests
 * on, and `sha256Raw` moving alone means the publisher reissued the file
 * without changing the words — advisory, not invalidating.
 *
 * **Sharing the structure does not share the accounting.** `accounting.ts`
 * walks each artefact root separately and schema-qualifies every key, so
 * `result.corpus[].sha256Raw` and `ledger.signing.corpus[].sha256Raw` remain
 * distinct rows carrying different roles: the record merely carries the value
 * (`audit`), while the ledger's copy is compared against the world by
 * `deriveStaleness` (`freshness`). One shape, two accounting identities, and
 * neither artefact's role table may govern the other.
 *
 * **So a field added here costs two classifications, not one.** Adding a sixth
 * key to this object makes it surface under *both* roots at once — as
 * `result.corpus[].<key>` and as `ledger.signing.corpus[].<key>` — and
 * `assertFieldAccounting` refuses until `FIELD_ROLES` in `accounting.ts`
 * carries a row for each. That is the correct answer rather than a tax: the
 * record merely carrying a value and the ledger comparing its copy against the
 * world are different authorities, and one shared structure must not let one
 * answer for the other. The guard names both paths when it fails, but nobody
 * should have to learn this from a red suite while editing this file.
 *
 * **A plain `.strict()` `ZodObject`, permanently.** `.refine()`,
 * `.superRefine()`, `.transform()` and `z.preprocess()` all wrap the schema in
 * a `ZodEffects`, which the field-accounting walker refuses rather than
 * treating as a leaf — and a wrapper here would hide all five fields from
 * *both* roots at once, which is exactly twice the hole `accounting.ts` exists
 * to close. Any rule that reads two pins at once belongs in
 * `assertResultConsistency` or `verifyLedgerIntegrity`, as every other
 * cross-field rule does.
 *
 * Pure — no filesystem, no network, no clock.
 */

import { z } from 'zod';

/** A pinned corpus document, as the closure held it when the pin was taken. */
export const corpusPinSchema = z
  .object({
    docId: z.string(),
    versionLabel: z.string(),
    sha256Raw: z.string(),
    sha256Normalized: z.string(),
    normalizerVersion: z.string(),
  })
  .strict();

/**
 * The pin as a value. Inferred from the schema rather than declared beside it,
 * so the type cannot describe a shape the parser would reject.
 */
export type CorpusPin = z.infer<typeof corpusPinSchema>;
