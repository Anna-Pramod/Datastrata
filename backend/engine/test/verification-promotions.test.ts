/**
 * The promotion ledger — tests.
 *
 * `verification/promotions.jsonl` answers one question at signing time: was the
 * pipeline that produced this dossier ever promoted by a human? A signature
 * pins `pipelineVersion`, and without this file that pin is a string anybody
 * can invent, so the reader has to be as strict as the signature ledger's.
 *
 * Most of these tests are therefore about framing rather than about content,
 * and two are written to fail against a specific wrong implementation:
 *
 *  - **Physical line numbers.** A four-line fixture — record, blank line,
 *    malformed line, record — asserts the error names both line 2 and line 3.
 *    A `.filter(Boolean)` reader names neither: it drops the blank silently and
 *    then blames the malformed line on line 2.
 *  - **Framing parity with `parseLedger`.** The same malformed frames are fed
 *    to both readers and both must refuse, naming the same physical lines. A
 *    second, laxer reader for the same file format is the realistic failure
 *    here — the two files look alike enough that a convenience `split` and a
 *    `try/catch` feel sufficient — and a parity assertion is what makes the
 *    divergence visible rather than a matter of remembering.
 *
 * `isPromoted` is tested for exact matching, not merely for the happy path: a
 * substring or prefix comparison would quietly promote `pipeline-1.0.0-rc1` on
 * the strength of a record for `pipeline-1.0.0`.
 */

import { describe, expect, it } from 'vitest';
import {
  isPromoted,
  parsePromotions,
  PromotionsIntegrityError,
  promotionRecordSchema,
  type PromotionRecord,
} from '../src/verification/promotions';
import { LedgerIntegrityError, parseLedger } from '../src/verification/ledger';

/** One well-formed record, as a line. */
function line(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    pipelineVersion: 'pipeline-1.0.0',
    by: 'A. Reviewer',
    on: '2026-08-20',
    ...overrides,
  });
}

/** The problems from a refused parse, joined for substring assertions. */
function problemsOf(text: string): string {
  try {
    parsePromotions(text);
    return expect.unreachable('expected parsePromotions to refuse');
  } catch (error) {
    expect(error).toBeInstanceOf(PromotionsIntegrityError);
    return (error as PromotionsIntegrityError).problems.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

describe('parsePromotions', () => {
  it('reads one record per line', () => {
    const text = `${line()}\n${line({ pipelineVersion: 'pipeline-2.0.0', by: 'B. Reviewer' })}\n`;
    const records = parsePromotions(text);
    expect(records).toEqual<PromotionRecord[]>([
      { pipelineVersion: 'pipeline-1.0.0', by: 'A. Reviewer', on: '2026-08-20' },
      { pipelineVersion: 'pipeline-2.0.0', by: 'B. Reviewer', on: '2026-08-20' },
    ]);
  });

  it('reads an empty file as an empty ledger', () => {
    expect(parsePromotions('')).toEqual([]);
  });

  it('accepts a file with no terminal newline', () => {
    expect(parsePromotions(line())).toHaveLength(1);
  });

  it('rejects an unknown key rather than stripping it', () => {
    // B3 adds benchmark metrics to this record. Until it does, a record
    // carrying them is a record this reader does not understand, and saying so
    // is better than silently dropping the evidence that justified a promotion.
    expect(problemsOf(`${line({ recall: 0.9 })}\n`)).toContain('line 1');
    expect(problemsOf(`${line({ recall: 0.9 })}\n`)).toMatch(/recall/);
  });

  it('rejects a record missing a field', () => {
    const text = `${JSON.stringify({ pipelineVersion: 'pipeline-1.0.0', by: 'A. Reviewer' })}\n`;
    expect(problemsOf(text)).toMatch(/on/);
  });

  it('rejects a line that is valid JSON but not an object', () => {
    expect(problemsOf('["pipeline-1.0.0"]\n')).toContain('line 1');
  });
});

// ---------------------------------------------------------------------------
// Framing — the ledger's discipline, applied to the same file format
// ---------------------------------------------------------------------------

describe('framing', () => {
  it('accepts the single trailing empty segment a terminal newline produces', () => {
    expect(parsePromotions(`${line()}\n`)).toHaveLength(1);
  });

  it('refuses a second trailing empty segment', () => {
    expect(problemsOf(`${line()}\n\n`)).toContain('line 2');
  });

  it('refuses a file consisting of one newline', () => {
    // One line, and that line is empty.
    expect(problemsOf('\n')).toContain('line 1');
  });

  it('refuses an internal blank line', () => {
    expect(problemsOf(`${line()}\n\n${line()}\n`)).toContain('line 2');
  });

  it('refuses a whitespace-only line', () => {
    expect(problemsOf(`${line()}\n   \n${line()}\n`)).toMatch(/line 2.*whitespace/s);
  });

  it('reports every framing and parse problem, never only the first', () => {
    const problems = problemsOf(`${line()}\n\nnot json\n${line()}\n`);
    expect(problems).toContain('line 2');
    expect(problems).toContain('line 3');
  });

  it('numbers lines physically, so a blank line does not renumber what follows', () => {
    // The `.filter(Boolean)` killer: a reader that drops the blank first
    // reports the malformed line as line 2 and never mentions the blank at
    // all, sending whoever repairs an append-only file to the wrong entry.
    const problems = problemsOf(`${line()}\n\nnot json\n${line()}\n`).split('\n');
    expect(problems.some((p) => /^line 2:/.test(p) && /blank/.test(p))).toBe(true);
    expect(problems.some((p) => /^line 3:/.test(p) && /JSON/.test(p))).toBe(true);
  });
});

describe('framing parity with the signature ledger', () => {
  /**
   * Frames that are damage in either file, with the physical line each
   * reader must name. The content of the well-formed lines differs between
   * the two files, so the fixture is built per reader from a line factory.
   */
  const FRAMES: Array<{ name: string; frame: (l: string) => string; lines: string[] }> = [
    { name: 'a lone newline', frame: () => '\n', lines: ['line 1'] },
    { name: 'a double terminal newline', frame: (l) => `${l}\n\n`, lines: ['line 2'] },
    { name: 'an internal blank line', frame: (l) => `${l}\n\n${l}\n`, lines: ['line 2'] },
    { name: 'a whitespace-only line', frame: (l) => `${l}\n \t \n${l}\n`, lines: ['line 2'] },
    {
      name: 'a blank line followed by a malformed one',
      frame: (l) => `${l}\n\nnot json\n${l}\n`,
      lines: ['line 2', 'line 3'],
    },
  ];

  /** A signing entry is heavy to build; a revocation frames identically. */
  const ledgerLine = JSON.stringify({
    entryId: 'x'.repeat(64),
    kind: 'revoked',
    packId: 'testpack',
    requirementId: 'REQ-001',
    revokes: 'y'.repeat(64),
    by: 'A. Reviewer',
    on: '2026-08-20',
    reason: 'withdrawn',
  });

  for (const { name, frame, lines } of FRAMES) {
    it(`refuses ${name} in both readers, naming the same physical lines`, () => {
      let promotionProblems = '';
      try {
        parsePromotions(frame(line()));
        expect.unreachable('parsePromotions accepted a damaged frame');
      } catch (error) {
        expect(error).toBeInstanceOf(PromotionsIntegrityError);
        promotionProblems = (error as PromotionsIntegrityError).problems.join('\n');
      }

      let ledgerProblems = '';
      try {
        parseLedger(frame(ledgerLine));
        expect.unreachable('parseLedger accepted a damaged frame');
      } catch (error) {
        expect(error).toBeInstanceOf(LedgerIntegrityError);
        ledgerProblems = (error as LedgerIntegrityError).problems.join('\n');
      }

      for (const l of lines) {
        expect(promotionProblems, `promotions must name ${l}`).toContain(l);
        expect(ledgerProblems, `the ledger must name ${l}`).toContain(l);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('isPromoted', () => {
  const records = parsePromotions(
    `${line()}\n${line({ pipelineVersion: 'pipeline-2.0.0' })}\n`,
  );

  it('is true for a version with a promotion record', () => {
    expect(isPromoted(records, 'pipeline-1.0.0')).toBe(true);
    expect(isPromoted(records, 'pipeline-2.0.0')).toBe(true);
  });

  it('is false for a version with none', () => {
    expect(isPromoted(records, 'pipeline-3.0.0')).toBe(false);
  });

  it('is false against an empty ledger', () => {
    expect(isPromoted([], 'pipeline-1.0.0')).toBe(false);
  });

  it('matches exactly, never by prefix or substring', () => {
    // A prefix comparison would promote a release candidate on the strength
    // of the record for the release it has not become.
    expect(isPromoted(records, 'pipeline-1.0.0-rc1')).toBe(false);
    expect(isPromoted(records, 'pipeline-1.0')).toBe(false);
    expect(isPromoted(records, '')).toBe(false);
  });
});

describe('promotionRecordSchema', () => {
  it('is a plain object schema, walkable by the field-accounting guard', () => {
    // The same rule `ledger.ts` and `result.ts` carry: no `.refine()`,
    // `.transform()` or `z.preprocess()`, so a walker that fails closed on an
    // unrecognised node kind can read this schema if it is ever asked to.
    expect(promotionRecordSchema._def.typeName).toBe('ZodObject');
  });
});
