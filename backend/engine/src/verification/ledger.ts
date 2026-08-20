/**
 * The signature ledger — the append-only record of who stood behind what.
 *
 * `verification/signatures.jsonl` is never rewritten, and that single property
 * decides almost everything in this file. A file nothing may repair has to be
 * read strictly, because every tolerance is permanent: a reader that quietly
 * accepts damage today is the reason nobody can tell, years later, whether the
 * history is intact.
 *
 * **Two variants, not one shape with optional fields.** A `RevocationEntry`
 * carries no verification pins at all — only who withdrew which signature,
 * when, and why. That is deliberate rather than an economy. Withdrawal matters
 * most exactly when the corpus is broken, the result file has been deleted, or
 * the encoding has drifted; requiring a fresh verification-shaped payload would
 * make withdrawing a signature depend on the very thing being withdrawn.
 * `.strict()` is what keeps the absence enforced rather than merely intended.
 *
 * **Authority is file position, never `on`.** The last line matching
 * `(packId, requirementId)` governs, whichever variant it is. Dates collide,
 * can be mistyped, and are supplied by the signer; position is a property of
 * the append-only file itself. `on` is display and audit only, and the field
 * accounting table records that classification so nobody later "improves" the
 * ordering to use the date.
 *
 * **A blank line is damage, not noise.** `parseLedger` takes the raw text
 * rather than pre-split lines precisely so that no caller gets the chance to
 * `.filter(Boolean)` first. A blank line inside an append-only ledger means an
 * append was interrupted, two files were concatenated wrongly, or an entry was
 * removed by hand — each a fact about the integrity of the history. Filtering
 * turns all three into a clean read, so the file that most needs to refuse to
 * be read becomes the one that reads most smoothly. Line numbers are physical
 * and 1-based, counted before anything is discarded, because a misreported
 * number in a file nobody may rewrite sends the repairer to the wrong entry.
 *
 * **Structure and reference are two stages**, as in `result.ts` and for the
 * same reason: the field-accounting guard walks the exported schemas and
 * refuses any node kind it does not recognise, so no schema here may be
 * wrapped in `.refine()`, `.superRefine()`, `.transform()`, `z.preprocess()`
 * or `z.lazy()`. Every rule that reads two entries at once lives in
 * `verifyLedgerIntegrity` instead.
 *
 * Pure by construction — no filesystem, no clock. Reading the file from disk
 * belongs to the caller.
 */

import { z } from 'zod';
import { sha256Hex } from '../corpus/hash';
import { canonicalJson } from './canonical';

/**
 * A pinned corpus document, as the closure held it when the signature was
 * made. Both hashes are retained: `sha256Normalized` is the text the
 * conclusion rests on, and `sha256Raw` moving alone means the publisher
 * reissued the file without changing the words — advisory, not invalidating.
 */
const corpusPinSchema = z
  .object({
    docId: z.string(),
    versionLabel: z.string(),
    sha256Raw: z.string(),
    sha256Normalized: z.string(),
    normalizerVersion: z.string(),
  })
  .strict();

/**
 * A human's positive judgement, with everything it was a judgement *about*
 * pinned by hash. `kind` doubles as the derived status the entry claims, so a
 * signing entry cannot exist without saying which of the two levels it asserts.
 *
 * `requirementVersion` is `number().int().min(1)`, matching both
 * `requirementSchema.version` and the verification result's field, so the three
 * artefacts that name a requirement revision agree on what one is. (The version
 * *registry* keys its historical mappings by string, because JSON object keys
 * are strings — a lookup-time concern, not a disagreement about the type.)
 */
export const signingEntrySchema = z
  .object({
    entryId: z.string(),
    kind: z.enum(['verified', 'ratified']),
    packId: z.string(),
    packVersion: z.string(),
    requirementId: z.string(),
    requirementVersion: z.number().int().min(1),
    requirementSha256: z.string(),
    requirementInputSha256: z.string(),
    conditionSha256: z.string(),
    renderedConditionSha256: z.string(),
    rendererVersion: z.string(),
    corpusClosureSha256: z.string(),
    corpus: z.array(corpusPinSchema),
    resultSha256: z.string(),
    pipelineVersion: z.string(),
    by: z.string(),
    on: z.string(),
    note: z.string().optional(),
  })
  .strict();

/**
 * A human's withdrawal of a specific earlier signature.
 *
 * It carries no verification pins, and `.strict()` makes that a rule rather
 * than a habit: a revocation offering a `conditionSha256` is rejected. The
 * entry means only "a person withdraws the authority of signature X", which is
 * a claim that must stay expressible when nothing else about the requirement
 * can be recomputed.
 *
 * `revokes` names the historical decision being withdrawn. File position
 * already decides what the current state *is*; `revokes` answers the different
 * question of what a human *intended* to withdraw, and both are wanted for the
 * audit trail.
 */
export const revocationEntrySchema = z
  .object({
    entryId: z.string(),
    kind: z.literal('revoked'),
    packId: z.string(),
    requirementId: z.string(),
    revokes: z.string(),
    by: z.string(),
    on: z.string(),
    reason: z.string(),
  })
  .strict();

/** One line of the ledger, discriminated on `kind`. */
export const ledgerEntrySchema = z.discriminatedUnion('kind', [
  signingEntrySchema,
  revocationEntrySchema,
]);

export type SigningEntry = z.infer<typeof signingEntrySchema>;
export type RevocationEntry = z.infer<typeof revocationEntrySchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/**
 * An entry as it exists before it has an id — the input to `entryId`.
 *
 * Written as an explicit union of omits rather than `Omit<LedgerEntry,
 * 'entryId'>`. `Omit` over a union distributes nothing: it collapses the two
 * variants into a single object type carrying the union of every property, so
 * the discrimination is lost and a revocation carrying `conditionSha256`
 * becomes type-correct — the exact confusion the two-variant design exists to
 * prevent.
 */
export type UnsignedLedgerEntry = Omit<SigningEntry, 'entryId'> | Omit<RevocationEntry, 'entryId'>;

/** Every problem found in one read, never only the first. */
export class LedgerIntegrityError extends Error {
  constructor(public problems: string[]) {
    super(`Ledger failed integrity checks:\n - ${problems.join('\n - ')}`);
    this.name = 'LedgerIntegrityError';
  }
}

/**
 * A shallow copy without `entryId`, whatever the runtime value actually
 * carries. The parameter type already excludes the key, but a value reaching
 * here through a cast or a `JSON.parse` may still hold it, and an id that fed
 * its own computation would verify against itself.
 */
function withoutEntryId(entry: UnsignedLedgerEntry | LedgerEntry): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(entry as unknown as Record<string, unknown>) };
  delete copy['entryId'];
  return copy;
}

/**
 * The entry's id: SHA-256 over its canonical form, excluding `entryId` itself.
 *
 * Excluding the id is what makes it *verifiable* rather than merely present —
 * any reader can recompute it from the line's own contents and detect an entry
 * edited after the fact. `canonicalJson` is the same serialiser the condition
 * and result hashes use, so key order in the file cannot change an id and two
 * canonical serialisers cannot drift apart into two different answers to "is
 * this still what was signed".
 */
export function entryId(entry: UnsignedLedgerEntry): string {
  return sha256Hex(canonicalJson(withoutEntryId(entry)));
}

/**
 * Every referential rule the ledger has, checked across already-parsed
 * entries and reported together.
 *
 * Kept out of the schemas as a plain function, exactly as
 * `assertResultConsistency` is: a rule that reads two entries at once cannot
 * be a zod refinement without wrapping the schema in a `ZodEffects` and hiding
 * every field beneath it from the accounting walker.
 *
 * "Earlier in the file" is enforced by consulting only the entries already
 * walked, so it needs no second pass and cannot be satisfied by a target that
 * appears further down.
 */
export function verifyLedgerIntegrity(entries: LedgerEntry[]): void {
  const problems: string[] = [];
  /** Ids seen so far, in file order — the "appears earlier" test. */
  const earlier = new Map<string, { position: number; entry: LedgerEntry }>();

  entries.forEach((entry, index) => {
    const position = index + 1;
    const label = `entry ${position} (${entry.entryId})`;

    const recomputed = entryId(withoutEntryId(entry) as unknown as UnsignedLedgerEntry);
    if (recomputed !== entry.entryId) {
      problems.push(
        `${label}: stored entryId does not match its contents, which hash to ${recomputed}`,
      );
    }

    const duplicate = earlier.get(entry.entryId);
    if (duplicate !== undefined) {
      problems.push(`${label}: duplicate entryId, already carried by entry ${duplicate.position}`);
    }

    if (entry.kind === 'revoked') {
      const target = earlier.get(entry.revokes);
      if (target === undefined) {
        problems.push(
          `${label}: revokes ${entry.revokes}, which names no entry appearing earlier in the ledger`,
        );
      } else if (target.entry.kind === 'revoked') {
        problems.push(
          `${label}: revokes ${entry.revokes}, which is itself a revocation; un-revoking is expressed by appending a fresh signature, never by revoking a revocation`,
        );
      } else {
        if (target.entry.packId !== entry.packId) {
          problems.push(
            `${label}: revokes an entry in pack ${target.entry.packId}, but the revocation names pack ${entry.packId}`,
          );
        }
        if (target.entry.requirementId !== entry.requirementId) {
          problems.push(
            `${label}: revokes an entry for requirement ${target.entry.requirementId}, but the revocation names requirement ${entry.requirementId}`,
          );
        }
      }
    }

    if (duplicate === undefined) earlier.set(entry.entryId, { position, entry });
  });

  if (problems.length > 0) throw new LedgerIntegrityError(problems);
}

/** A message for a line that carries no JSON at all. */
function framingProblem(line: number, segment: string): string | null {
  if (segment === '') {
    return `line ${line}: blank line in an append-only ledger — an interrupted append, a bad concatenation, or an entry removed by hand`;
  }
  if (segment.trim() === '') {
    return `line ${line}: whitespace-only line, which carries no entry and cannot be an accident of framing`;
  }
  return null;
}

/**
 * Reads the whole ledger, or refuses the whole ledger.
 *
 * Takes the raw text rather than pre-split lines. That is part of the
 * contract, not an inconvenience: the framing rules below are what make a
 * damaged history announce itself, and a caller handed an array of lines is
 * one `.filter(Boolean)` away from repairing the file before this function
 * ever sees it.
 *
 * Framing, judged by physical position:
 *
 *  - the single trailing empty segment produced by a terminal newline is
 *    valid — a POSIX text file ends with one — and at most one is discarded;
 *  - an empty segment anywhere else is a failure;
 *  - a whitespace-only segment anywhere at all is a failure;
 *  - anything else must parse as one JSON object and validate as one entry.
 *
 * So `…}\n` is well-formed and `…}\n\n` is not, the empty string is an empty
 * ledger, and a file of one newline is a failure because it has one line and
 * that line is empty. Line numbers are computed before the trailing segment is
 * dropped, never after: dropping first and indexing second is how an off-by-one
 * enters, and the number in the error has to be the number an editor shows.
 *
 * A malformed line fails the entire load — an append-only file nothing can
 * rewrite must not be partially readable — and every framing and parse problem
 * is collected into one throw. Failing on the first would cost the person
 * repairing the file one read-fix-read cycle per damaged line, and they need
 * to see the extent of the damage before touching anything.
 *
 * Referential validation runs last, over the parsed entries, so a load either
 * yields a ledger that is intact in both senses or throws.
 */
export function parseLedger(text: string): LedgerEntry[] {
  const segments = text.split('\n');
  // Discard at most one trailing empty segment, and only from the end, so a
  // segment's index remains its physical line number minus one.
  const lines = segments.at(-1) === '' ? segments.slice(0, -1) : segments;

  const problems: string[] = [];
  const entries: LedgerEntry[] = [];

  lines.forEach((segment, index) => {
    const line = index + 1;

    const framing = framingProblem(line, segment);
    if (framing !== null) {
      problems.push(framing);
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(segment);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      problems.push(`line ${line}: not valid JSON — ${detail}`);
      return;
    }

    const parsed = ledgerEntrySchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      problems.push(`line ${line}: not a valid ledger entry — ${detail}`);
      return;
    }

    entries.push(parsed.data);
  });

  if (problems.length > 0) throw new LedgerIntegrityError(problems);

  verifyLedgerIntegrity(entries);
  return entries;
}

/**
 * The entry that decides the requirement's current status: the last one by
 * **file position** matching `(packId, requirementId)`, or `null`.
 *
 * Never ordered by `on`. A signer supplies that date, two entries can share it,
 * and a typo can move one backwards by a decade; position is a property of the
 * append-only file and cannot be misstated by whoever wrote the line. Scanning
 * backwards rather than sorting makes that structural — there is no comparator
 * here for anyone to "improve" into a date comparison.
 */
export function governingEntry(
  entries: LedgerEntry[],
  packId: string,
  requirementId: string,
): LedgerEntry | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry !== undefined && entry.packId === packId && entry.requirementId === requirementId) {
      return entry;
    }
  }
  return null;
}
