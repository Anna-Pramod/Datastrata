/**
 * The promotion ledger — which pipelines a human ever approved.
 *
 * A signature pins `pipelineVersion`, and that pin is worth nothing on its own:
 * it is a string the run that produced the dossier chose for itself. This file
 * is what turns it into a claim somebody stood behind. `verify sign` refuses a
 * `pipelineVersion` with no promotion record (factory spec §4.5), so without
 * this reader the sign CLI would ship with one of its nine refusals missing —
 * and a missing refusal is invisible: everything passes.
 *
 * **This is the gate, not the measurement.** `verification/pipeline/<version>.json`
 * and the benchmark metrics that justify a promotion belong to B3. A record
 * here carries only `pipelineVersion`, `by` and `on` — enough to answer "was
 * this approved, and by whom", which is the only question signing asks. B3
 * widens the schema when it has metrics to put in it; the review sheet
 * meanwhile prints that the metrics are unavailable rather than omitting them,
 * because a block that is absent reads as a block that passed.
 *
 * **`.strict()`, so B3's metrics cannot arrive silently.** A record carrying
 * fields this reader does not know is refused rather than stripped. The
 * alternative — zod's default, which drops unknown keys — would let the
 * evidence that justified a promotion vanish between the file and the reader,
 * with the gate still answering "promoted" over a record it did not fully
 * read. `result.ts` carries the same rule for the same reason.
 *
 * **The framing rules are `ledger.ts`'s, deliberately identical.** Same file
 * format, same append-only guarantee, so the same discipline: one JSON object
 * per line, at most one trailing empty segment discarded, an internal blank or
 * whitespace-only line is damage rather than noise, physical 1-based line
 * numbers computed before anything is dropped, every problem in one throw, and
 * no `.filter(Boolean)` anywhere near it. Writing a second, laxer reader for
 * the same format is the realistic failure — the file looks simple enough that
 * a `split` and a `try/catch` feel sufficient — and the parity tests in
 * `test/verification-promotions.test.ts` feed both readers the same damaged
 * frames so a divergence fails rather than merely being noticed.
 *
 * Pure — no filesystem, no clock. Reading the file belongs to the CLI.
 */

import { z } from 'zod';

/**
 * One promotion: the version approved, who approved it, and when.
 *
 * `on` is a plain string, exactly as the ledger's is, and for the same reason:
 * it is display and audit only. Nothing here orders by it or compares it, so
 * parsing it into a date would create a value with more authority than the
 * field is allowed to exercise.
 */
export const promotionRecordSchema = z
  .object({
    pipelineVersion: z.string(),
    by: z.string(),
    on: z.string(),
  })
  .strict();

export type PromotionRecord = z.infer<typeof promotionRecordSchema>;

/** Every problem found in one read, never only the first. */
export class PromotionsIntegrityError extends Error {
  constructor(public problems: string[]) {
    super(`Promotion ledger failed integrity checks:\n - ${problems.join('\n - ')}`);
    this.name = 'PromotionsIntegrityError';
  }
}

/** A message for a line that carries no JSON at all. */
function framingProblem(line: number, segment: string): string | null {
  if (segment === '') {
    return `line ${line}: blank line in an append-only promotion ledger — an interrupted append, a bad concatenation, or a record removed by hand`;
  }
  if (segment.trim() === '') {
    return `line ${line}: whitespace-only line, which carries no record and cannot be an accident of framing`;
  }
  return null;
}

/**
 * Reads the whole promotion ledger, or refuses the whole promotion ledger.
 *
 * Takes the raw text rather than pre-split lines, which is the contract that
 * keeps a caller from repairing the file before this function sees it. A
 * damaged promotion ledger must not be partially readable: the half that
 * parsed would answer "not promoted" for every version recorded in the half
 * that did not, and a refusal to sign is exactly what a broken file should not
 * be able to manufacture quietly.
 */
export function parsePromotions(text: string): PromotionRecord[] {
  const segments = text.split('\n');
  // Discard at most one trailing empty segment, and only from the end, so a
  // segment's index remains its physical line number minus one.
  const lines = segments.at(-1) === '' ? segments.slice(0, -1) : segments;

  const problems: string[] = [];
  const records: PromotionRecord[] = [];

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

    const parsed = promotionRecordSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      problems.push(`line ${line}: not a valid promotion record — ${detail}`);
      return;
    }

    records.push(parsed.data);
  });

  if (problems.length > 0) throw new PromotionsIntegrityError(problems);

  return records;
}

/**
 * Whether this exact `pipelineVersion` was ever promoted.
 *
 * Exact string equality, never a prefix or substring test: promoting
 * `pipeline-1.0.0` must not carry `pipeline-1.0.0-rc1`, which is a different
 * artefact that happens to share a name's opening. The version identifies a
 * pinned set of prompts, models and role configuration (factory §5.1), so two
 * versions that differ by any character are two different pipelines.
 */
export function isPromoted(
  records: readonly PromotionRecord[],
  pipelineVersion: string,
): boolean {
  return records.some((record) => record.pipelineVersion === pipelineVersion);
}
