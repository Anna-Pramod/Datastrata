/**
 * The ledger — tests.
 *
 * `verification/signatures.jsonl` is append-only and nothing may rewrite it,
 * so the tests here are mostly about what the reader must *refuse*. Three of
 * them are written to fail against a specific wrong implementation rather than
 * merely to describe the right one:
 *
 *  - **Physical line numbers.** A four-line fixture — valid entry, blank line,
 *    malformed line, valid entry — asserts the error names both line 2 and
 *    line 3. A `.filter(Boolean)` implementation names neither: it drops the
 *    blank silently and then blames the malformed line on line 2, sending
 *    whoever repairs the file to the wrong entry. Asserting the pair is what
 *    makes this test able to fail against the defect it claims to detect.
 *  - **Ordering by file position.** The last entry by position carries an
 *    *earlier* `on` date than the entry before it, and the last-by-position
 *    must govern. An implementation that sorts by `on` returns the other one.
 *  - **No `ZodEffects` anywhere.** Task 6's accounting guard walks these
 *    schemas and refuses any node kind it does not recognise, so a `.refine()`
 *    added later — at the root or buried on `corpus` — would make the guard
 *    unbuildable. A walker in this file re-derives that fact from the schema
 *    objects rather than trusting the source to have stayed clean.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  entryId,
  governingEntry,
  LedgerIntegrityError,
  ledgerEntrySchema,
  parseLedger,
  revocationEntrySchema,
  signingEntrySchema,
  verifyLedgerIntegrity,
  type LedgerEntry,
  type RevocationEntry,
  type SigningEntry,
  type UnsignedLedgerEntry,
} from '../src/verification/ledger';

const HASH = (c: string): string => c.repeat(64);

/** A signing entry's fields, minus the `entryId` that is derived from them. */
function unsignedSigning(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'verified',
    packId: 'testpack',
    packVersion: '2024.1',
    requirementId: 'REQ-001',
    requirementVersion: 1,
    requirementSha256: HASH('a'),
    requirementInputSha256: HASH('b'),
    conditionSha256: HASH('c'),
    renderedConditionSha256: HASH('d'),
    rendererVersion: 'renderer-1.0.0',
    closureRendererVersion: 'closure-renderer-1.0.0',
    corpusClosureSha256: HASH('e'),
    corpus: [
      {
        docId: 'DOC-1',
        versionLabel: '2024-01-01',
        sha256Raw: HASH('f'),
        sha256Normalized: HASH('0'),
        normalizerVersion: 'normalize-1.0.0',
        artefactAuthenticity: 'official_consolidation',
        nonOperativeSections: [],
        sources: [{ sourceId: 'SRC-001', temporalStanding: 'in_force' }],
      },
    ],
    resultSha256: HASH('1'),
    pipelineVersion: 'pipeline-1.0.0',
    by: 'A. Reviewer',
    on: '2026-08-20',
    ...overrides,
  };
}

/** A valid signing entry, its `entryId` computed from its own contents. */
function signing(overrides: Record<string, unknown> = {}): SigningEntry {
  const unsigned = unsignedSigning(overrides) as unknown as UnsignedLedgerEntry;
  return signingEntrySchema.parse({ ...unsignedSigning(overrides), entryId: entryId(unsigned) });
}

/** A valid revocation of `target`, its `entryId` computed the same way. */
function revocation(target: LedgerEntry, overrides: Record<string, unknown> = {}): RevocationEntry {
  const fields = {
    kind: 'revoked',
    packId: target.packId,
    requirementId: target.requirementId,
    revokes: target.entryId,
    by: 'B. Reviewer',
    on: '2026-08-21',
    reason: 'the reading was withdrawn pending re-verification',
    ...overrides,
  };
  return revocationEntrySchema.parse({
    ...fields,
    entryId: entryId(fields as unknown as UnsignedLedgerEntry),
  });
}

/** JSONL as a POSIX text file: one object per line, terminal newline. */
function ledgerText(entries: unknown[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

/** The `problems` array of the `LedgerIntegrityError` a thunk throws. */
function problemsFrom(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof LedgerIntegrityError) return error.problems;
    throw error;
  }
  throw new Error('expected a LedgerIntegrityError, but nothing was thrown');
}

describe('entryId', () => {
  it('reproduces an entry’s stored id from its own contents', () => {
    const entry = signing();
    const { entryId: stored, ...rest } = entry;
    expect(entryId(rest as UnsignedLedgerEntry)).toBe(stored);
  });

  it('excludes entryId itself, so a stored id cannot influence its own value', () => {
    const unsigned = unsignedSigning() as unknown as UnsignedLedgerEntry;
    const withGarbageId = { ...unsignedSigning(), entryId: 'not-the-real-id' };
    expect(entryId(withGarbageId as unknown as UnsignedLedgerEntry)).toBe(entryId(unsigned));
  });

  it('is stable under JSON key reordering', () => {
    const fields = unsignedSigning();
    const reordered = Object.fromEntries(Object.entries(fields).reverse());
    expect(entryId(reordered as unknown as UnsignedLedgerEntry)).toBe(
      entryId(fields as unknown as UnsignedLedgerEntry),
    );
  });

  it('moves when any pinned field moves', () => {
    const base = entryId(unsignedSigning() as unknown as UnsignedLedgerEntry);
    expect(entryId(unsignedSigning({ resultSha256: HASH('2') }) as unknown as UnsignedLedgerEntry)).not.toBe(base);
    expect(entryId(unsignedSigning({ kind: 'ratified' }) as unknown as UnsignedLedgerEntry)).not.toBe(base);
    expect(entryId(unsignedSigning({ by: 'C. Reviewer' }) as unknown as UnsignedLedgerEntry)).not.toBe(base);
  });

  it('distinguishes a signing entry from a revocation', () => {
    const entry = signing();
    const withdrawal = revocation(entry);
    expect(withdrawal.entryId).not.toBe(entry.entryId);
  });
});

describe('the entry schemas', () => {
  it('rejects a revocation carrying a verification pin', () => {
    const entry = signing();
    const withdrawal = revocation(entry);
    const result = revocationEntrySchema.safeParse({
      ...withdrawal,
      conditionSha256: HASH('c'),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a revocation carrying a verification pin through the union too', () => {
    const entry = signing();
    const withdrawal = revocation(entry);
    expect(ledgerEntrySchema.safeParse({ ...withdrawal, conditionSha256: HASH('c') }).success).toBe(
      false,
    );
  });

  it('rejects an unknown key on a signing entry', () => {
    expect(signingEntrySchema.safeParse({ ...signing(), reason: 'why' }).success).toBe(false);
  });

  it('accepts both signing kinds and no other', () => {
    expect(signingEntrySchema.safeParse(signing({ kind: 'ratified' })).success).toBe(true);
    expect(signingEntrySchema.safeParse({ ...signing(), kind: 'revoked' }).success).toBe(false);
    expect(signingEntrySchema.safeParse({ ...signing(), kind: 'draft' }).success).toBe(false);
  });

  it('types requirementVersion as an integer >= 1, matching the result schema', () => {
    const valid = signing();
    expect(signingEntrySchema.safeParse({ ...valid, requirementVersion: 0 }).success).toBe(false);
    expect(signingEntrySchema.safeParse({ ...valid, requirementVersion: 1.5 }).success).toBe(false);
    expect(signingEntrySchema.safeParse({ ...valid, requirementVersion: '1' }).success).toBe(false);
    expect(signingEntrySchema.safeParse({ ...valid, requirementVersion: 2 }).success).toBe(true);
  });

  it('carries `note` as optional on a signing entry', () => {
    expect(signingEntrySchema.safeParse(signing({ note: 'checked twice' })).success).toBe(true);
    expect(signingEntrySchema.safeParse(signing()).success).toBe(true);
  });
});

describe('parseLedger framing', () => {
  it('parses the empty string to an empty ledger', () => {
    expect(parseLedger('')).toEqual([]);
  });

  it('treats a terminal newline as framing, not as a line', () => {
    const entries = [signing(), signing({ on: '2026-08-21' })];
    const withNewline = ledgerText(entries);
    const withoutNewline = withNewline.slice(0, -1);
    expect(parseLedger(withNewline)).toEqual(parseLedger(withoutNewline));
    expect(parseLedger(withNewline)).toHaveLength(2);
  });

  it('rejects a lone newline, because that file has one line and it is empty', () => {
    const problems = problemsFrom(() => parseLedger('\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^line 1\b/);
  });

  it('rejects a doubled terminal newline, because the second is an internal blank', () => {
    const problems = problemsFrom(() => parseLedger(ledgerText([signing()]) + '\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^line 2\b/);
  });

  it('rejects a blank line between two valid entries, naming its physical line number', () => {
    const text = [JSON.stringify(signing()), '', JSON.stringify(signing({ on: '2026-08-21' }))].join(
      '\n',
    );
    const problems = problemsFrom(() => parseLedger(text + '\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^line 2\b/);
  });

  it('rejects a whitespace-only line of spaces', () => {
    const text = [JSON.stringify(signing()), '   ', JSON.stringify(signing({ on: '2026-08-21' }))].join(
      '\n',
    );
    const problems = problemsFrom(() => parseLedger(text + '\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^line 2\b/);
  });

  it('rejects a whitespace-only line containing a tab', () => {
    const text = [JSON.stringify(signing()), '\t', JSON.stringify(signing({ on: '2026-08-21' }))].join(
      '\n',
    );
    const problems = problemsFrom(() => parseLedger(text + '\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^line 2\b/);
  });

  it('rejects a malformed line, naming its line number', () => {
    const text = [JSON.stringify(signing()), '{ this is not json'].join('\n') + '\n';
    const problems = problemsFrom(() => parseLedger(text));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^line 2\b/);
    expect(problems[0]).toMatch(/JSON/i);
  });

  it('rejects a line that is valid JSON but not a valid entry, naming its line number', () => {
    const text = [JSON.stringify(signing()), JSON.stringify({ kind: 'verified' })].join('\n') + '\n';
    const problems = problemsFrom(() => parseLedger(text));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^line 2\b/);
  });

  /**
   * The test that fails against a filtered implementation.
   *
   * Four physical lines: a valid entry, a blank, a malformed line, a valid
   * entry. Both damaged lines must be named, at the numbers an editor shows.
   * `.filter(Boolean)` reports neither — it swallows line 2 and renumbers the
   * malformed line to 2.
   */
  it('names both a blank line and a malformed line, at their physical numbers', () => {
    const text =
      [
        JSON.stringify(signing()),
        '',
        '{ this is not json',
        JSON.stringify(signing({ on: '2026-08-21' })),
      ].join('\n') + '\n';

    const problems = problemsFrom(() => parseLedger(text));

    expect(problems).toHaveLength(2);
    expect(problems.some((p) => /^line 2\b/.test(p) && /blank|empty/i.test(p))).toBe(true);
    expect(problems.some((p) => /^line 3\b/.test(p) && /JSON/i.test(p))).toBe(true);
    expect(problems.some((p) => /^line 2\b/.test(p) && /JSON/i.test(p))).toBe(false);
  });

  it('collects every framing problem in one throw', () => {
    const text = ['', '   ', '{ nope', ''].join('\n') + '\n';
    const problems = problemsFrom(() => parseLedger(text));
    expect(problems).toHaveLength(4);
    expect(problems.map((p) => p.slice(0, 6))).toEqual(['line 1', 'line 2', 'line 3', 'line 4']);
  });
});

describe('parseLedger referential validation', () => {
  it('accepts a signing followed by its revocation', () => {
    const entry = signing();
    const entries = parseLedger(ledgerText([entry, revocation(entry)]));
    expect(entries).toHaveLength(2);
    expect(entries[1]?.kind).toBe('revoked');
  });

  it('rejects a revocation naming an entry that appears later in the file', () => {
    const entry = signing();
    const problems = problemsFrom(() => parseLedger(ledgerText([revocation(entry), entry])));
    expect(problems.some((p) => p.includes('earlier'))).toBe(true);
  });

  it('rejects a revocation naming an entryId no entry carries', () => {
    const entry = signing();
    const orphan = revocation(entry, { revokes: HASH('9') });
    const problems = problemsFrom(() => parseLedger(ledgerText([entry, orphan])));
    expect(problems.some((p) => p.includes(orphan.entryId))).toBe(true);
  });

  it('rejects a revocation naming an entry for a different requirement', () => {
    const other = signing({ requirementId: 'REQ-002' });
    const withdrawal = revocation(other, { requirementId: 'REQ-001' });
    const problems = problemsFrom(() => parseLedger(ledgerText([other, withdrawal])));
    expect(problems.some((p) => p.includes('REQ-001') || p.includes('REQ-002'))).toBe(true);
  });

  it('rejects a revocation naming an entry in a different pack', () => {
    const other = signing({ packId: 'otherpack' });
    const withdrawal = revocation(other, { packId: 'testpack' });
    const problems = problemsFrom(() => parseLedger(ledgerText([other, withdrawal])));
    expect(problems.some((p) => p.includes('otherpack') || p.includes('testpack'))).toBe(true);
  });

  it('rejects a revocation of a revocation', () => {
    const entry = signing();
    const first = revocation(entry);
    const second = revocation(first, { revokes: first.entryId, on: '2026-08-22' });
    const problems = problemsFrom(() => parseLedger(ledgerText([entry, first, second])));
    expect(problems.some((p) => /revocation/i.test(p))).toBe(true);
  });

  it('rejects a duplicate entryId', () => {
    const entry = signing();
    const problems = problemsFrom(() => parseLedger(ledgerText([entry, entry])));
    expect(problems.some((p) => p.includes(entry.entryId))).toBe(true);
  });

  it('rejects a tampered entryId', () => {
    const entry = signing();
    const tampered = { ...entry, by: 'Somebody Else' };
    const problems = problemsFrom(() => parseLedger(ledgerText([tampered])));
    expect(problems.some((p) => /entryId/.test(p))).toBe(true);
  });

  it('names every referential problem rather than only the first', () => {
    const entry = signing();
    const tampered = { ...signing({ on: '2026-08-21' }), by: 'Somebody Else' };
    const orphan = revocation(entry, { revokes: HASH('9'), on: '2026-08-22' });
    const problems = problemsFrom(() => parseLedger(ledgerText([entry, tampered, orphan])));
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });

  it('verifyLedgerIntegrity is callable on already-parsed entries', () => {
    const entry = signing();
    expect(() => verifyLedgerIntegrity([entry, revocation(entry)])).not.toThrow();
    expect(() => verifyLedgerIntegrity([entry, entry])).toThrow(LedgerIntegrityError);
  });
});

describe('governingEntry', () => {
  it('returns null for an empty ledger', () => {
    expect(governingEntry([], 'testpack', 'REQ-001')).toBeNull();
  });

  it('returns null when no entry matches the pack and requirement', () => {
    const entries = parseLedger(ledgerText([signing()]));
    expect(governingEntry(entries, 'testpack', 'REQ-999')).toBeNull();
    expect(governingEntry(entries, 'otherpack', 'REQ-001')).toBeNull();
  });

  it('returns the later of two signings', () => {
    const first = signing({ kind: 'verified' });
    const second = signing({ kind: 'ratified', on: '2026-08-21' });
    const entries = parseLedger(ledgerText([first, second]));
    expect(governingEntry(entries, 'testpack', 'REQ-001')?.entryId).toBe(second.entryId);
  });

  it('returns the revocation when a signing is followed by one', () => {
    const entry = signing();
    const withdrawal = revocation(entry);
    const entries = parseLedger(ledgerText([entry, withdrawal]));
    const governing = governingEntry(entries, 'testpack', 'REQ-001');
    expect(governing?.entryId).toBe(withdrawal.entryId);
    expect(governing?.kind).toBe('revoked');
  });

  it('ignores entries for other requirements and packs', () => {
    const target = signing({ on: '2026-08-19' });
    const noise = [
      signing({ requirementId: 'REQ-002', on: '2026-08-25' }),
      signing({ packId: 'otherpack', on: '2026-08-26' }),
    ];
    const entries = parseLedger(ledgerText([target, ...noise]));
    expect(governingEntry(entries, 'testpack', 'REQ-001')?.entryId).toBe(target.entryId);
  });

  /**
   * The test that fails against an implementation ordering by `on`.
   *
   * The last entry by file position carries the *earlier* date. Position is a
   * property of the append-only file; `on` is signer-supplied, collides, and
   * can be mistyped. Sorting by date returns the first entry here.
   */
  it('orders by file position even when the last entry carries an earlier date', () => {
    const earlierInFile = signing({ kind: 'ratified', on: '2026-01-01' });
    const laterInFile = signing({ kind: 'verified', on: '2020-01-01' });
    const entries = parseLedger(ledgerText([earlierInFile, laterInFile]));

    const governing = governingEntry(entries, 'testpack', 'REQ-001');

    expect(governing?.entryId).toBe(laterInFile.entryId);
    expect(governing?.kind).toBe('verified');
    expect(governing && 'on' in governing ? governing.on : null).toBe('2020-01-01');
  });

  it('orders a revocation by position too, even with an earlier date than its target', () => {
    const entry = signing({ on: '2026-08-20' });
    const withdrawal = revocation(entry, { on: '2019-01-01' });
    const entries = parseLedger(ledgerText([entry, withdrawal]));
    expect(governingEntry(entries, 'testpack', 'REQ-001')?.kind).toBe('revoked');
  });
});

/**
 * Task 6's walker refuses any node kind outside this set, so a `.refine()`,
 * `.transform()`, `z.preprocess()` or `z.lazy()` added to any of these schemas
 * would make the field-accounting guard unbuildable. Re-derive that from the
 * schema objects rather than trusting the source file to have stayed clean.
 */
const WALKABLE = new Set([
  'ZodObject',
  'ZodArray',
  'ZodRecord',
  'ZodOptional',
  'ZodNullable',
  'ZodDefault',
  'ZodDiscriminatedUnion',
  'ZodUnion',
  'ZodString',
  'ZodNumber',
  'ZodBoolean',
  'ZodLiteral',
  'ZodEnum',
]);

function collectNodeKinds(schema: z.ZodTypeAny, path: string, into: Map<string, string>): void {
  const def = schema._def as Record<string, unknown>;
  const typeName = String(def['typeName']);
  into.set(path, typeName);
  switch (typeName) {
    case 'ZodObject': {
      const shape = (schema as z.ZodObject<z.ZodRawShape>)._def.shape();
      for (const key of Object.keys(shape)) {
        const child = shape[key];
        if (child) collectNodeKinds(child, `${path}.${key}`, into);
      }
      return;
    }
    case 'ZodArray':
      collectNodeKinds(def['type'] as z.ZodTypeAny, `${path}[]`, into);
      return;
    case 'ZodRecord':
      collectNodeKinds(def['valueType'] as z.ZodTypeAny, `${path}{}`, into);
      return;
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      collectNodeKinds(def['innerType'] as z.ZodTypeAny, path, into);
      return;
    case 'ZodDiscriminatedUnion':
    case 'ZodUnion': {
      const options = def['options'] as z.ZodTypeAny[];
      options.forEach((option, i) => collectNodeKinds(option, `${path}|${i}`, into));
      return;
    }
    default:
      return;
  }
}

describe('walkability, for the accounting guard', () => {
  it('exports plain object schemas and a discriminated union at the root', () => {
    expect(signingEntrySchema._def.typeName).toBe('ZodObject');
    expect(revocationEntrySchema._def.typeName).toBe('ZodObject');
    expect(ledgerEntrySchema._def.typeName).toBe('ZodDiscriminatedUnion');
  });

  it('contains no node kind outside the walkable set', () => {
    for (const [name, schema] of [
      ['signing', signingEntrySchema],
      ['revocation', revocationEntrySchema],
      ['ledger', ledgerEntrySchema],
    ] as Array<[string, z.ZodTypeAny]>) {
      const kinds = new Map<string, string>();
      collectNodeKinds(schema, name, kinds);
      const offenders = [...kinds].filter(([, kind]) => !WALKABLE.has(kind));
      expect(offenders).toEqual([]);
    }
  });

  it('reaches both union variants and every corpus pin field', () => {
    const kinds = new Map<string, string>();
    collectNodeKinds(ledgerEntrySchema, 'ledger', kinds);
    const paths = [...kinds.keys()].join(' ');
    expect(paths).toMatch(/corpus\[\]\.sha256Normalized/);
    expect(paths).toMatch(/\.revokes/);
    expect(paths).toMatch(/\.reason/);
  });
});
