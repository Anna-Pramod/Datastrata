/**
 * The verification-result contract — tests.
 *
 * This record is what a human signs, so the tests here are about what the
 * record makes impossible to say rather than about what it can carry. Three
 * properties are pinned, and each of them exists because losing it has cost
 * something before:
 *
 *  - The structural schema and the cross-field validator are two stages, and
 *    the seam between them is asserted directly. Task 6's field-accounting
 *    guard walks the exported schema and refuses any node kind it does not
 *    recognise, `ZodEffects` included — so a `.refine()` added to the root, or
 *    buried on a nested object, would not merely be untidy: it would make the
 *    guard unbuildable and forfeit the acceptance test that closes the
 *    `missReason` class.
 *  - `resultSha256` is semantic, not byte-wise. Reformatting the file or
 *    reordering its keys must produce the same digest, or cosmetic churn
 *    becomes a trust alarm and the alarm stops being read.
 *  - Evidence-free adjudication is unrepresentable. `checkEvidenceSet` decides
 *    whether evidence is valid and returns clean over an empty set, so the
 *    question of whether evidence *exists* cannot be delegated to it and is
 *    answered here instead.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assertResultConsistency,
  parseVerificationResult,
  ResultConsistencyError,
  resultSha256,
  verificationResultSchema,
  type VerificationResult,
} from '../src/verification/result';
import { evidenceItemSchema, type EvidenceItem } from '../src/corpus/evidence';

const HASH = (c: string): string => c.repeat(64);

function quote(text = 'the undertaking shall disclose sustainability information'): EvidenceItem {
  return { kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('a'), text };
}

/**
 * The canonical gap-bearing record: the required containers empty, `gaps[]`
 * carrying the explanation.
 *
 * `reading`, `coverage`, `challenges` and `openQuestions` are all required by
 * the schema, so "the reading is absent" is not representable and this is what
 * a halted run actually looks like. Callers still pass `gaps`; everything else
 * is the empty shape.
 */
function haltedResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return result({
    reading: { elements: [] },
    coverage: { cells: [] },
    challenges: [],
    openQuestions: [],
    ...overrides,
  });
}

/** A minimal, valid, self-consistent result. Overrides replace whole keys. */
function result(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    packId: 'testpack',
    requirementId: 'REQ-001',
    requirementVersion: 1,
    resultSchemaVersion: '1.1.0',
    pipelineVersion: 'pipeline-1.0.0',
    rendererVersion: 'renderer-1.0.0',
    requirementInputSha256: HASH('b'),
    conditionSha256: HASH('c'),
    renderedConditionSha256: HASH('d'),
    corpusClosureSha256: HASH('e'),
    corpus: [
      {
        docId: 'DOC-1',
        versionLabel: '2024-01-01',
        sha256Raw: HASH('f'),
        sha256Normalized: HASH('a'),
        normalizerVersion: '1',
      },
    ],
    reading: {
      elements: [
        { id: 'R1', statement: 'A large undertaking must report.', evidence: [quote()] },
      ],
    },
    coverage: {
      cells: [
        { direction: 'reading_to_condition', readingElementId: 'R1', verdict: 'MAPPED' },
      ],
    },
    challenges: [
      {
        id: 'C1',
        lens: 'scope',
        statement: 'Does "large" carry the Accounting Directive meaning?',
        verdict: 'CONFIRMED',
        evidence: [quote()],
        resolution: 'Confirmed against Article 3(4) of Directive 2013/34/EU.',
      },
    ],
    openQuestions: [],
    gaps: [],
    ...overrides,
  };
}

describe('verificationResultSchema — structure', () => {
  it('accepts a minimal valid result', () => {
    expect(() => verificationResultSchema.parse(result())).not.toThrow();
  });

  it('is a plain ZodObject, not a ZodEffects', () => {
    // The regression test for someone later adding a root `.refine()`. Task 6's
    // walker throws on any node kind it does not recognise, so a ZodEffects at
    // the root makes the field-accounting guard unbuildable.
    expect(verificationResultSchema._def.typeName).toBe('ZodObject');
  });

  it('has no ZodEffects anywhere in the tree', () => {
    const seen: string[] = [];
    const walk = (node: z.ZodTypeAny, path: string): void => {
      const def = node._def as { typeName: string } & Record<string, unknown>;
      if (def.typeName === 'ZodEffects') seen.push(path);
      if (def.typeName === 'ZodObject') {
        const shape = (node as unknown as z.AnyZodObject)._def.shape() as Record<string, z.ZodTypeAny>;
        for (const [key, child] of Object.entries(shape)) walk(child, `${path}.${key}`);
      } else if (def.typeName === 'ZodArray') {
        walk(def['type'] as z.ZodTypeAny, `${path}[]`);
      } else if (
        def.typeName === 'ZodOptional' ||
        def.typeName === 'ZodNullable' ||
        def.typeName === 'ZodDefault'
      ) {
        walk(def['innerType'] as z.ZodTypeAny, path);
      } else if (def.typeName === 'ZodDiscriminatedUnion' || def.typeName === 'ZodUnion') {
        (def['options'] as z.ZodTypeAny[]).forEach((o, i) => walk(o, `${path}|${i}`));
      }
    };
    walk(verificationResultSchema, 'result');
    expect(seen).toEqual([]);
  });

  it('rejects an unknown top-level key', () => {
    expect(() => verificationResultSchema.parse(result({ missReason: 'catalogue_unknown' }))).toThrow();
  });

  it('rejects an unknown key nested inside challenges[]', () => {
    const raw = result({
      challenges: [
        {
          id: 'C1',
          lens: 'scope',
          statement: 'Statement.',
          verdict: 'CONFIRMED',
          evidence: [quote()],
          resolution: 'Resolved.',
          confidence: 0.9,
        },
      ],
    });
    expect(() => verificationResultSchema.parse(raw)).toThrow();
  });

  it('rejects an openQuestions[] item carrying a blocking flag', () => {
    // Any outstanding open question blocks signing. A per-item `blocking: false`
    // would be a second, competing policy.
    const raw = result({ openQuestions: [{ id: 'Q1', statement: 'Unresolved.', blocking: false }] });
    expect(() => verificationResultSchema.parse(raw)).toThrow();
  });

  it('rejects a gaps[] entry with an unknown kind', () => {
    const raw = result({ gaps: [{ kind: 'wishful_gap', docId: 'DOC-1', detail: 'Missing.' }] });
    expect(() => verificationResultSchema.parse(raw)).toThrow();
  });

  it('accepts the two structural gap kinds', () => {
    for (const kind of ['corpus_gap', 'closure_gap']) {
      const raw = result({ gaps: [{ kind, docId: 'DOC-1', detail: 'Not in the closure.' }] });
      expect(() => verificationResultSchema.parse(raw)).not.toThrow();
    }
  });

  it('rejects a resultSchemaVersion other than 1.1.0, naming the version rather than a downstream field', () => {
    // The literal is what rejects a record written against a different shape,
    // so it has to move with the shape. 1.0.0 is the shape whose `gaps[]`
    // required a `docId`, and a 1.0.0 record read as if it were this one would
    // be read by a validator that no longer knows what its docId meant.
    for (const version of ['1.0.0', '2.0.0']) {
      const parsed = verificationResultSchema.safeParse(result({ resultSchemaVersion: version }));
      expect(parsed.success, `accepted ${version}`).toBe(false);
      if (parsed.success) continue;
      expect(parsed.error.issues).toHaveLength(1);
      expect(parsed.error.issues[0]?.path).toEqual(['resultSchemaVersion']);
    }
  });

  it('accepts an optional narrative', () => {
    expect(() => verificationResultSchema.parse(result({ narrative: 'A human paragraph.' }))).not.toThrow();
  });
});

describe('verificationResultSchema — evidence must exist', () => {
  it('rejects a reading element with an empty evidence set', () => {
    const raw = result({ reading: { elements: [{ id: 'R1', statement: 'A claim.', evidence: [] }] } });
    expect(() => verificationResultSchema.parse(raw)).toThrow();
  });

  it('rejects a challenge with an empty evidence set', () => {
    const raw = result({
      challenges: [
        { id: 'C1', lens: 'scope', statement: 'S.', verdict: 'CONFIRMED', evidence: [], resolution: 'R.' },
      ],
    });
    expect(() => verificationResultSchema.parse(raw)).toThrow();
  });

  it('consumes the identical evidenceItemSchema object exported by src/corpus/evidence.ts', () => {
    const shape = verificationResultSchema._def.shape() as Record<string, z.ZodTypeAny>;

    const challengeShape = (
      (shape['challenges'] as z.ZodArray<z.AnyZodObject>)._def.type as z.AnyZodObject
    )._def.shape() as Record<string, z.ZodTypeAny>;
    expect((challengeShape['evidence'] as z.ZodArray<z.ZodTypeAny>)._def.type).toBe(evidenceItemSchema);

    const readingShape = (shape['reading'] as z.AnyZodObject)._def.shape() as Record<string, z.ZodTypeAny>;
    const elementShape = (
      (readingShape['elements'] as z.ZodArray<z.AnyZodObject>)._def.type as z.AnyZodObject
    )._def.shape() as Record<string, z.ZodTypeAny>;
    expect((elementShape['evidence'] as z.ZodArray<z.ZodTypeAny>)._def.type).toBe(evidenceItemSchema);
  });

  it('round-trips every EvidenceItem variant through the shared schema', () => {
    const items: EvidenceItem[] = [
      { kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('a'), text: 'a quote' },
      {
        kind: 'amendment_chain',
        hops: [{ edgeId: 'E-1', quote: { kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('a'), text: 'hop' } }],
      },
      {
        kind: 'cross_reference',
        edgeId: 'E-2',
        from: { kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('a'), text: 'from' },
        to: { kind: 'quote', docId: 'DOC-2', sha256Normalized: HASH('b'), text: 'to' },
      },
      { kind: 'absence', docIds: ['DOC-1'], term: 'turnover' },
    ];
    for (const item of items) {
      const parsed: EvidenceItem = evidenceItemSchema.parse(item);
      expect(parsed).toEqual(item);
    }
  });

  it('rejects an unknown evidence kind and an unknown key inside an evidence item', () => {
    expect(() => evidenceItemSchema.parse({ kind: 'vibes', docId: 'DOC-1' })).toThrow();
    expect(() =>
      evidenceItemSchema.parse({ kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('a'), text: 't', page: 4 }),
    ).toThrow();
  });
});

describe('the structural/semantic seam', () => {
  it('parses structurally but rejects semantically an UNMAPPED cell naming a challenge that does not exist', () => {
    const raw = result({
      coverage: {
        cells: [{ direction: 'condition_to_reading', conditionPath: 'all[0]', verdict: 'UNMAPPED', challengeId: 'C-NOPE' }],
      },
    });
    // Structure alone: fine. The id is a string in the right place.
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();
    // Two fields read together: the id names no challenge.
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });

  it('names every inconsistency, not just the first', () => {
    const raw = result({
      coverage: {
        cells: [
          { direction: 'condition_to_reading', conditionPath: 'all[0]', verdict: 'UNSUPPORTED', challengeId: 'C-NOPE' },
          { direction: 'reading_to_condition', readingElementId: 'R1', verdict: 'MAPPED', challengeId: 'C1' },
        ],
      },
      challenges: [
        { id: 'C1', lens: 'scope', statement: 'S.', verdict: 'MISMATCH', evidence: [quote()], resolution: '   ' },
      ],
    });
    const parsed = verificationResultSchema.parse(raw);
    let problems: string[] = [];
    try {
      assertResultConsistency(parsed);
    } catch (e) {
      problems = (e as ResultConsistencyError).problems;
    }
    expect(problems.length).toBe(3);
    expect(problems.join('\n')).toContain('C-NOPE');
    expect(problems.some((p) => p.includes('MAPPED'))).toBe(true);
    expect(problems.some((p) => p.includes('C1'))).toBe(true);
  });

  it('parseVerificationResult returns the parsed value when consistent', () => {
    const parsed: VerificationResult = parseVerificationResult(result());
    expect(parsed.requirementId).toBe('REQ-001');
    expect(parsed.challenges[0]?.verdict).toBe('CONFIRMED');
  });
});

describe('assertResultConsistency — adverse coverage names its challenge', () => {
  const withCells = (cells: unknown[], challenges?: unknown[]): Record<string, unknown> =>
    result(challenges === undefined ? { coverage: { cells } } : { coverage: { cells }, challenges });

  it('rejects an UNMAPPED cell with no challengeId', () => {
    const raw = withCells([{ direction: 'condition_to_reading', conditionPath: 'all[0]', verdict: 'UNMAPPED' }]);
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });

  it('rejects an UNSUPPORTED cell naming a challenge absent from challenges[]', () => {
    const raw = withCells([
      { direction: 'reading_to_condition', readingElementId: 'R1', verdict: 'UNSUPPORTED', challengeId: 'C-GHOST' },
    ]);
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });

  it('accepts an UNCERTAIN cell naming a present challenge', () => {
    const raw = withCells([
      { direction: 'reading_to_condition', readingElementId: 'R1', verdict: 'UNCERTAIN', challengeId: 'C1' },
    ]);
    expect(() => parseVerificationResult(raw)).not.toThrow();
  });

  it('rejects a MAPPED cell carrying a challengeId', () => {
    const raw = withCells([
      { direction: 'reading_to_condition', readingElementId: 'R1', verdict: 'MAPPED', challengeId: 'C1' },
    ]);
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });
});

describe('assertResultConsistency — an id must name exactly one thing', () => {
  /**
   * Uniqueness is logically prior to resolution. The contract already requires
   * that an adverse cell name a challenge which exists, and the reason given is
   * that the sign gate must be able to find the adjudicator's judgement rather
   * than sign past it. Duplicate ids satisfy the letter of that rule and defeat
   * its purpose: an adverse cell naming `C1` resolves to two challenges, and a
   * gate looking for *the* judgement finds two and has to guess. So the two
   * rules are exercised separately below — a uniqueness test that only ever
   * fires through the resolution rule is a test passing for the wrong reason.
   */

  /** Every problem the semantic stage collected; `[]` when it accepted. */
  const problemsOf = (raw: Record<string, unknown>): string[] => {
    const parsed = verificationResultSchema.parse(raw);
    try {
      assertResultConsistency(parsed);
    } catch (e) {
      return (e as ResultConsistencyError).problems;
    }
    return [];
  };

  const challenge = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    lens: 'scope',
    statement: 'Does "large" carry the Accounting Directive meaning?',
    verdict: 'CONFIRMED',
    evidence: [quote()],
    resolution: 'Confirmed against Article 3(4) of Directive 2013/34/EU.',
    ...overrides,
  });

  const element = (id: string, statement = 'A large undertaking must report.'): Record<string, unknown> => ({
    id,
    statement,
    evidence: [quote()],
  });

  it('rejects two challenges sharing an id even when no coverage cell names it', () => {
    // No coverage at all, so the resolution rule cannot fire. Each challenge is
    // individually valid — one CONFIRMED with a resolution, one OPEN_QUESTION
    // that needs none — and the record is well-formed in every other respect.
    // The single collected problem must therefore be the duplicated id itself.
    const raw = result({
      coverage: { cells: [] },
      challenges: [challenge('C1'), challenge('C1', { verdict: 'OPEN_QUESTION' })],
    });
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();

    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('C1');
    expect(problems[0]).toContain('challenges');
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });

  it('rejects two challenges sharing an id when an adverse cell does name it', () => {
    // Here the resolution rule *is* satisfied: `C1` names a challenge that
    // exists. It names two, one CONFIRMED and one OPEN_QUESTION, which is
    // precisely the ambiguity the sign gate cannot resolve.
    const raw = result({
      coverage: {
        cells: [
          { direction: 'reading_to_condition', readingElementId: 'R1', verdict: 'UNCERTAIN', challengeId: 'C1' },
        ],
      },
      challenges: [challenge('C1'), challenge('C1', { verdict: 'OPEN_QUESTION' })],
    });
    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('C1');
  });

  it('rejects two reading elements sharing an id', () => {
    const raw = result({
      reading: { elements: [element('R1'), element('R1', 'A different proposition entirely.')] },
    });
    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('R1');
    expect(problems[0]).toContain('reading.elements');
  });

  it('rejects two open questions sharing an id', () => {
    const raw = result({
      openQuestions: [
        { id: 'Q1', statement: 'Is the turnover threshold consolidated?' },
        { id: 'Q1', statement: 'Which financial year does it bind?' },
      ],
    });
    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('Q1');
    expect(problems[0]).toContain('openQuestions');
  });

  it('rejects a coverage cell whose readingElementId names no reading element', () => {
    const raw = result({
      coverage: {
        cells: [{ direction: 'reading_to_condition', readingElementId: 'R-GHOST', verdict: 'MAPPED' }],
      },
    });
    // Structure alone: fine. The id is a string in the right place.
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();

    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('R-GHOST');
  });

  it('accepts a cell that omits readingElementId, because a cell may have no counterpart', () => {
    // An UNMAPPED condition walked the other way has no reading element by
    // construction. The rule is that a *stated* id must resolve, not that one
    // must be stated.
    const raw = result({
      coverage: {
        cells: [
          { direction: 'condition_to_reading', conditionPath: 'all[0]', verdict: 'UNMAPPED', challengeId: 'C1' },
        ],
      },
    });
    expect(problemsOf(raw)).toEqual([]);
  });

  it('accepts a record carrying several distinct ids', () => {
    const raw = result({
      reading: {
        elements: [
          element('R1'),
          element('R2', 'The report covers the financial year.'),
          element('R3', 'Turnover is measured on a consolidated basis.'),
        ],
      },
      coverage: {
        cells: [
          { direction: 'reading_to_condition', readingElementId: 'R1', verdict: 'MAPPED' },
          { direction: 'reading_to_condition', readingElementId: 'R2', verdict: 'UNSUPPORTED', challengeId: 'C2' },
          { direction: 'condition_to_reading', conditionPath: 'all[0]', verdict: 'UNMAPPED', challengeId: 'C1' },
        ],
      },
      challenges: [challenge('C1'), challenge('C2', { verdict: 'OPEN_QUESTION' })],
      openQuestions: [
        { id: 'Q1', statement: 'Is the turnover threshold consolidated?' },
        { id: 'Q2', statement: 'Which financial year does it bind?' },
      ],
    });
    expect(() => parseVerificationResult(raw)).not.toThrow();
  });

  it('reports a duplicate id and an unresolved reference together, not just the first', () => {
    const raw = result({
      reading: { elements: [element('R1'), element('R1', 'A different proposition entirely.')] },
      coverage: {
        cells: [{ direction: 'reading_to_condition', readingElementId: 'R-GHOST', verdict: 'MAPPED' }],
      },
    });
    const problems = problemsOf(raw);
    expect(problems.length).toBe(2);
    expect(problems.some((p) => p.includes('R-GHOST'))).toBe(true);
    expect(problems.some((p) => p.includes('more than once'))).toBe(true);
  });
});

describe('assertResultConsistency — verdict and resolution', () => {
  const withChallenge = (challenge: Record<string, unknown>): Record<string, unknown> =>
    result({ challenges: [challenge], coverage: { cells: [] } });

  it('rejects a CONFIRMED challenge with no resolution', () => {
    const raw = withChallenge({ id: 'C1', lens: 'scope', statement: 'S.', verdict: 'CONFIRMED', evidence: [quote()] });
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });

  it('rejects a MISMATCH challenge with a whitespace-only resolution', () => {
    const raw = withChallenge({
      id: 'C1',
      lens: 'scope',
      statement: 'S.',
      verdict: 'MISMATCH',
      evidence: [quote()],
      resolution: '   ',
    });
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });

  it('rejects a MISMATCH challenge with no resolution', () => {
    const raw = withChallenge({ id: 'C1', lens: 'scope', statement: 'S.', verdict: 'MISMATCH', evidence: [quote()] });
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });

  it('accepts an OPEN_QUESTION challenge with no resolution', () => {
    const raw = withChallenge({
      id: 'C1',
      lens: 'scope',
      statement: 'S.',
      verdict: 'OPEN_QUESTION',
      evidence: [quote()],
    });
    expect(() => parseVerificationResult(raw)).not.toThrow();
  });

  it('rejects an OPEN_QUESTION challenge whose resolution is present but blank', () => {
    // Whitespace is not an adjudication, whatever the verdict.
    const raw = withChallenge({
      id: 'C1',
      lens: 'scope',
      statement: 'S.',
      verdict: 'OPEN_QUESTION',
      evidence: [quote()],
      resolution: '\t ',
    });
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });
});

// ---------------------------------------------------------------------------
// Gap identity — the ontology installed by the 1.1.0 migration
// ---------------------------------------------------------------------------

describe('assertResultConsistency — a gap names exactly one identity', () => {
  /**
   * `corpus_gap` covers two populations that a single `docId` could not tell
   * apart, and one of them has no document to name at all: a requirement whose
   * `sources[]` resolve to no document is missing *source coverage*, not a
   * named file. Recording `SRC-005` in a field called `docId` made the
   * structured record say "document" while the prose beside it said "source",
   * which is the semantic debt `.strict()` exists to prevent.
   *
   * So the identity is two optional fields, and which one a kind may carry is a
   * cross-field rule here rather than a discriminated union in the schema — a
   * union at the element level would hide every field beneath it from the
   * accounting walker, which is the hole that guard exists to close.
   *
   * The registers are passed in, never read: `src/verification` touches no
   * filesystem, and the ids' home registers are files.
   */
  const registers = {
    docIds: ['DOC-32013L0034', 'DOC-1'],
    sourceIds: ['SRC-001', 'SRC-005', 'SRC-006', 'SRC-007'],
  };

  /**
   * The problems one gap produces, or `[]` when it is accepted.
   *
   * Over a *gap-bearing* record — the containers canonically empty — because
   * that is the only shape a gap is representable in: a gap says the evidence
   * surface was incomplete, so agent verification stopped and nothing was
   * judged. Asserting gap identity over a record carrying a full reading would
   * be asserting it over a record that is inconsistent for a different reason,
   * and every message below would arrive with four unrelated ones beside it.
   */
  function problemsFor(gap: Record<string, unknown>): string[] {
    try {
      parseVerificationResult(haltedResult({ gaps: [gap] }), registers);
      return [];
    } catch (error) {
      if (error instanceof ResultConsistencyError) return error.problems;
      throw error;
    }
  }

  // ── the three valid shapes ────────────────────────────────────────────

  it('accepts a corpus_gap naming a sourceId that no document serves', () => {
    // CSRD-S-012's real shape: SRC-005/006/007 are registered sources and the
    // corpus serves none of them, so there is no missing document to name.
    expect(problemsFor({ kind: 'corpus_gap', sourceId: 'SRC-005', detail: 'no document serves it' })).toEqual([]);
  });

  it('accepts a corpus_gap naming a docId the corpus does not hold', () => {
    expect(problemsFor({ kind: 'corpus_gap', docId: 'DOC-X', detail: 'the consolidating act is not held' })).toEqual([]);
  });

  it('accepts a closure_gap naming a docId the corpus holds', () => {
    expect(problemsFor({ kind: 'closure_gap', docId: 'DOC-1', detail: 'reachable but not entitled' })).toEqual([]);
  });

  // ── the four lies, each rejected by its own rule ──────────────────────

  it('rejects a corpus_gap whose docId is really a source id — the lie this migration exists for', () => {
    const problems = problemsFor({ kind: 'corpus_gap', docId: 'SRC-005', detail: 'no document serves it' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('source register');
    expect(problems[0]).toContain('SRC-005');
    expect(problems[0]).toContain('sourceId');
  });

  it('rejects a closure_gap naming a sourceId', () => {
    // Entitlement traversal walks documents. A source has no position in the
    // closure graph, so a closure gap has no source identity to report.
    const problems = problemsFor({ kind: 'closure_gap', sourceId: 'SRC-005', detail: 'not entitled' });
    expect(problems.join('\n')).toContain('a closure_gap may not name a sourceId');
    expect(problems.join('\n')).toContain('carries no docId');
  });

  it('rejects a gap carrying both a docId and a sourceId', () => {
    const problems = problemsFor({
      kind: 'corpus_gap',
      docId: 'DOC-X',
      sourceId: 'SRC-005',
      detail: 'both',
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('exactly one of docId and sourceId');
    expect(problems[0]).toContain('both');
  });

  it('rejects a gap carrying neither a docId nor a sourceId', () => {
    const problems = problemsFor({ kind: 'corpus_gap', detail: 'something is missing' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('exactly one of docId and sourceId');
    expect(problems[0]).toContain('neither');
  });

  // ── the register cross-check, in both directions ──────────────────────

  it('rejects a sourceId that is really a document id', () => {
    // The mirror of the lie above, and asserted separately: a rule that only
    // policed `docId` would leave the new field free to carry the old error.
    const problems = problemsFor({ kind: 'corpus_gap', sourceId: 'DOC-1', detail: 'unserved' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('corpus index');
    expect(problems[0]).toContain('docId');
  });

  it('rejects a sourceId in neither register', () => {
    const problems = problemsFor({ kind: 'corpus_gap', sourceId: 'SRC-999', detail: 'unserved' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no entry in the source register');
  });

  it('rejects a corpus_gap over a docId the corpus index does hold', () => {
    // The mirror of the rule below, and the same defect in reverse: a
    // corpus_gap asserts the document is absent, so naming a held document
    // contradicts the record's own kind. Without this the two document rules
    // were asymmetric — a closure_gap over an absent document was rejected
    // while a corpus_gap over a held one validated.
    const problems = problemsFor({ kind: 'corpus_gap', docId: 'DOC-1', detail: 'not held' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('the corpus index does hold');
    expect(problems[0]).toContain('closure_gap');
  });

  it('rejects a closure_gap over a docId the corpus index does not hold', () => {
    // A document the corpus does not hold is a corpus_gap by definition; a
    // closure gap asserts the document exists and traversal did not reach it.
    const problems = problemsFor({ kind: 'closure_gap', docId: 'DOC-X', detail: 'not entitled' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('the corpus index does not hold');
  });

  // ── the registers are the only thing that makes the check possible ────

  it('leaves the register cross-check unrun when no registers are supplied, and still enforces cardinality', () => {
    // The positive control for the four cross-register cases above: they fail
    // because the registers were consulted, not because the shape is odd.
    expect(() =>
      parseVerificationResult(haltedResult({ gaps: [{ kind: 'corpus_gap', docId: 'SRC-005', detail: 'x' }] })),
    ).not.toThrow();
    expect(() => parseVerificationResult(haltedResult({ gaps: [{ kind: 'corpus_gap', detail: 'x' }] }))).toThrow(
      ResultConsistencyError,
    );
  });

  it('reports every gap defect in one pass, across several gaps', () => {
    let problems: string[] = [];
    try {
      parseVerificationResult(
        haltedResult({
          gaps: [
            { kind: 'corpus_gap', docId: 'SRC-005', detail: 'a' },
            { kind: 'closure_gap', docId: 'DOC-1', sourceId: 'SRC-001', detail: 'b' },
          ],
        }),
        registers,
      );
    } catch (error) {
      problems = (error as ResultConsistencyError).problems;
    }
    expect(problems.length).toBe(2);
    expect(problems[0]).toContain('gaps[0]');
    expect(problems[1]).toContain('gaps[1]');
  });
});

describe('verificationResultSchema — the gap identity is structurally optional', () => {
  it('accepts a gap carrying only a sourceId', () => {
    const raw = result({ gaps: [{ kind: 'corpus_gap', sourceId: 'SRC-005', detail: 'unserved' }] });
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();
  });

  it('accepts a gap carrying neither identity — the cardinality rule is semantic, not structural', () => {
    // Deliberate: the structural stage must stay a plain walkable ZodObject,
    // so "exactly one" cannot be expressed here. The seam is load-bearing.
    const raw = result({ gaps: [{ kind: 'corpus_gap', detail: 'unserved' }] });
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();
  });

  it('still rejects an unknown key on a gap', () => {
    const raw = result({ gaps: [{ kind: 'corpus_gap', srcId: 'SRC-005', detail: 'unserved' }] });
    expect(() => verificationResultSchema.parse(raw)).toThrow();
  });

  it('keeps gaps[] a plain object schema, not a discriminated union', () => {
    // A union at the element level emits one row to the accounting walker while
    // every field beneath it goes unaccounted — the exact hole that guard
    // exists to close. `result.ts` records the reason; this is the check.
    const shape = verificationResultSchema._def.shape() as Record<string, z.ZodTypeAny>;
    const element = (shape['gaps'] as z.ZodArray<z.ZodTypeAny>)._def.type;
    expect(element._def.typeName).toBe('ZodObject');
  });
});

describe('assertResultConsistency — evidence rests on the corpus this record pins', () => {
  /**
   * Two rules with one subject: what a conclusion is allowed to rest on.
   *
   * The absence rule is spec-mandated. Factory spec §2.2 says outright that an
   * `absence` item cannot be the sole evidence for any conclusion, and that
   * "the schema enforces this" — nothing did. `.min(1)` counts items and cannot
   * tell one kind from another, so a conclusion resting entirely on "I searched
   * and did not find it" parsed clean. A deterministic search establishes that
   * a phrase does not occur; it cannot establish that no economically
   * equivalent criterion exists under different words, which is a legal
   * judgment. So `absence` is a component of reasoning, never the whole of it.
   *
   * The pin rules close the id class one layer down. Two pins sharing a
   * `docId` pin one document at two texts, and a quote citing that `docId`
   * then resolves to two authoritative sources. A quote naming a `docId` no
   * pin carries, or claiming a hash its own pin contradicts, rests on a text
   * the signature never froze: freshness would compare the pinned hash against
   * the world while the reasoning stood on something else.
   *
   * `checkEvidenceSet` does not answer this question. It validates quotes
   * against the corpus *on disk*, which is not whether the record agrees with
   * its own pins — a record can be internally coherent and wrong about the
   * world, or right about the world and internally incoherent.
   */

  /** Every problem the semantic stage collected; `[]` when it accepted. */
  const problemsOf = (raw: Record<string, unknown>): string[] => {
    const parsed = verificationResultSchema.parse(raw);
    try {
      assertResultConsistency(parsed);
    } catch (e) {
      return (e as ResultConsistencyError).problems;
    }
    return [];
  };

  const absence = (docIds: string[] = ['DOC-1'], term = 'balance sheet total'): EvidenceItem => ({
    kind: 'absence',
    docIds,
    term,
  });

  const pin = (docId: string, normalized: string): Record<string, unknown> => ({
    docId,
    versionLabel: '2024-01-01',
    sha256Raw: HASH('f'),
    sha256Normalized: normalized,
    normalizerVersion: '1',
  });

  const withElementEvidence = (evidence: EvidenceItem[]): Record<string, unknown> =>
    result({ reading: { elements: [{ id: 'R1', statement: 'A large undertaking must report.', evidence }] } });

  const withChallengeEvidence = (evidence: EvidenceItem[]): Record<string, unknown> =>
    result({
      coverage: { cells: [] },
      challenges: [
        {
          id: 'C1',
          lens: 'scope',
          statement: 'Does "large" carry the Accounting Directive meaning?',
          verdict: 'CONFIRMED',
          evidence,
          resolution: 'Confirmed against Article 3(4) of Directive 2013/34/EU.',
        },
      ],
    });

  it('rejects a reading element whose only evidence is an absence item', () => {
    const raw = withElementEvidence([absence()]);
    // Structure alone: fine. `.min(1)` sees one item and has nothing to say.
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();

    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('reading.elements[0]');
    expect(problems[0]).toContain('absence');
    expect(() => parseVerificationResult(raw)).toThrow(ResultConsistencyError);
  });

  it('rejects a reading element whose evidence is two absence items and nothing else', () => {
    // The rule is about kinds, not cardinality: a naive `length === 1` check
    // counts two items here and passes a conclusion resting on two searches.
    const raw = withElementEvidence([absence(['DOC-1'], 'balance sheet total'), absence(['DOC-1'], 'turnover')]);
    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('reading.elements[0]');
    expect(problems[0]).toContain('absence');
  });

  it('rejects a challenge whose only evidence is an absence item', () => {
    const raw = withChallengeEvidence([absence()]);
    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('challenges[0]');
    expect(problems[0]).toContain('C1');
  });

  it('accepts an absence item alongside a quote', () => {
    // Asserted separately from the rejections above, so the rule cannot be
    // satisfied by banning `absence` outright — which would delete the one
    // evidence kind that can speak about what the law does *not* say.
    expect(problemsOf(withElementEvidence([absence(), quote()]))).toEqual([]);
    expect(problemsOf(withElementEvidence([quote(), absence()]))).toEqual([]);
    expect(problemsOf(withChallengeEvidence([absence(), quote()]))).toEqual([]);
  });

  it('rejects two corpus pins sharing a docId', () => {
    const raw = result({ corpus: [pin('DOC-1', HASH('a')), pin('DOC-1', HASH('9'))] });
    // Structure alone: fine. Both pins are well-formed on their own.
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();

    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('DOC-1');
    expect(problems[0]).toContain('corpus');
  });

  it('rejects a quote naming a docId no pin carries', () => {
    const raw = withElementEvidence([
      { kind: 'quote', docId: 'DOC-GHOST', sha256Normalized: HASH('a'), text: 'a sentence from nowhere' },
    ]);
    expect(() => verificationResultSchema.parse(raw)).not.toThrow();

    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('DOC-GHOST');
  });

  it('rejects a quote whose sha256Normalized contradicts its own pin', () => {
    const raw = withElementEvidence([
      { kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('9'), text: 'a sentence from another text' },
    ]);
    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('DOC-1');
    expect(problems[0]).toContain(HASH('9').slice(0, 12));
  });

  it('checks a quote nested inside an amendment_chain hop', () => {
    // Walking only the top-level `kind: 'quote'` case would let every quote
    // inside a composite item name any text at all.
    const raw = withElementEvidence([
      quote(),
      {
        kind: 'amendment_chain',
        hops: [
          { edgeId: 'E-1', quote: { kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('a'), text: 'pinned' } },
          { edgeId: 'E-2', quote: { kind: 'quote', docId: 'DOC-GHOST', sha256Normalized: HASH('a'), text: 'not' } },
        ],
      },
    ]);
    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('DOC-GHOST');
    expect(problems[0]).toContain('hops[1]');
  });

  it('checks both quotes nested inside a cross_reference', () => {
    const raw = withElementEvidence([
      {
        kind: 'cross_reference',
        edgeId: 'E-2',
        from: { kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('9'), text: 'from' },
        to: { kind: 'quote', docId: 'DOC-2', sha256Normalized: HASH('b'), text: 'to' },
      },
    ]);
    const problems = problemsOf(raw);
    expect(problems.length).toBe(2);
    expect(problems.some((p) => p.includes('.from'))).toBe(true);
    expect(problems.some((p) => p.includes('DOC-2'))).toBe(true);
  });

  it('rejects an absence item naming a docId no pin carries', () => {
    // An absence claim carries no hash, so there is no hash to agree with. It
    // is still a claim about a text, and a text this record does not pin is one
    // the signature never froze and freshness will never watch — the claim
    // would rot silently. Membership is the part of the rule that still applies.
    const raw = withElementEvidence([quote(), absence(['DOC-1', 'DOC-GHOST'])]);
    const problems = problemsOf(raw);
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('DOC-GHOST');
  });

  it('accepts a record whose quotes all agree with their pins', () => {
    const raw = result({
      corpus: [pin('DOC-1', HASH('a')), pin('DOC-2', HASH('b'))],
      reading: {
        elements: [
          {
            id: 'R1',
            statement: 'A large undertaking must report.',
            evidence: [
              quote(),
              absence(['DOC-2']),
              {
                kind: 'cross_reference',
                edgeId: 'E-2',
                from: { kind: 'quote', docId: 'DOC-1', sha256Normalized: HASH('a'), text: 'from' },
                to: { kind: 'quote', docId: 'DOC-2', sha256Normalized: HASH('b'), text: 'to' },
              },
              {
                kind: 'amendment_chain',
                hops: [
                  { edgeId: 'E-1', quote: { kind: 'quote', docId: 'DOC-2', sha256Normalized: HASH('b'), text: 'hop' } },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(problemsOf(raw)).toEqual([]);
    expect(() => parseVerificationResult(raw)).not.toThrow();
  });

  it('reports an absence-only element and an unpinned challenge quote together', () => {
    const raw = result({
      reading: { elements: [{ id: 'R1', statement: 'A large undertaking must report.', evidence: [absence()] }] },
      coverage: { cells: [] },
      challenges: [
        {
          id: 'C1',
          lens: 'scope',
          statement: 'Does "large" carry the Accounting Directive meaning?',
          verdict: 'CONFIRMED',
          evidence: [{ kind: 'quote', docId: 'DOC-GHOST', sha256Normalized: HASH('a'), text: 'a sentence' }],
          resolution: 'Confirmed against Article 3(4) of Directive 2013/34/EU.',
        },
      ],
    });
    const problems = problemsOf(raw);
    expect(problems.length).toBe(2);
    expect(problems.some((p) => p.includes('reading.elements[0]'))).toBe(true);
    expect(problems.some((p) => p.includes('DOC-GHOST'))).toBe(true);
  });
});

describe('resultSha256 — canonical and semantic', () => {
  const canonicalText = JSON.stringify(result());

  it('is identical under key reordering', () => {
    const forward = parseVerificationResult(JSON.parse(canonicalText));
    const reversed = JSON.parse(canonicalText) as Record<string, unknown>;
    const shuffled: Record<string, unknown> = {};
    for (const key of Object.keys(reversed).reverse()) shuffled[key] = reversed[key];
    // Reorder a nested object's keys too, not only the root's.
    const challenge = (shuffled['challenges'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
    const reorderedChallenge: Record<string, unknown> = {};
    for (const key of Object.keys(challenge).reverse()) reorderedChallenge[key] = challenge[key];
    shuffled['challenges'] = [reorderedChallenge];

    expect(Object.keys(shuffled)).not.toEqual(Object.keys(JSON.parse(canonicalText) as object));
    expect(resultSha256(parseVerificationResult(shuffled))).toBe(resultSha256(forward));
  });

  it('canonicalises on its own, not merely because parse ran first', () => {
    // The test above routes through `parseVerificationResult`, and zod rebuilds
    // an object in schema-shape order — so it would pass even for an
    // implementation that did no canonicalisation of its own. This one hands
    // `resultSha256` a reordered object directly, which is what fails if the
    // canonical serialisation is ever dropped in favour of raw stringification.
    const forward = parseVerificationResult(result());
    const shuffled: Record<string, unknown> = {};
    for (const key of Object.keys(forward as unknown as Record<string, unknown>).reverse()) {
      shuffled[key] = (forward as unknown as Record<string, unknown>)[key];
    }
    expect(Object.keys(shuffled)).not.toEqual(Object.keys(forward as unknown as object));
    expect(resultSha256(shuffled as unknown as VerificationResult)).toBe(resultSha256(forward));
  });

  it('is identical under whitespace and pretty-printing changes', () => {
    const pretty = JSON.stringify(JSON.parse(canonicalText), null, 4);
    const crammed = JSON.stringify(JSON.parse(canonicalText));
    expect(pretty).not.toBe(crammed);
    expect(resultSha256(parseVerificationResult(JSON.parse(pretty)))).toBe(
      resultSha256(parseVerificationResult(JSON.parse(crammed))),
    );
  });

  it('moves when a challenge verdict changes', () => {
    const base = resultSha256(parseVerificationResult(result()));
    const moved = resultSha256(
      parseVerificationResult(
        result({
          challenges: [
            { id: 'C1', lens: 'scope', statement: 'S.', verdict: 'MISMATCH', evidence: [quote()], resolution: 'R.' },
          ],
          coverage: { cells: [] },
        }),
      ),
    );
    expect(moved).not.toBe(base);
  });

  it('moves when an evidence item changes', () => {
    const base = resultSha256(parseVerificationResult(result()));
    const moved = resultSha256(
      parseVerificationResult(
        result({
          challenges: [
            {
              id: 'C1',
              lens: 'scope',
              statement: 'Does "large" carry the Accounting Directive meaning?',
              verdict: 'CONFIRMED',
              evidence: [quote('a different sentence entirely')],
              resolution: 'Confirmed against Article 3(4) of Directive 2013/34/EU.',
            },
          ],
        }),
      ),
    );
    expect(moved).not.toBe(base);
  });

  it('is a lowercase 64-character hex digest', () => {
    expect(resultSha256(parseVerificationResult(result()))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('preserves array order, because order is meaning', () => {
    const two = (first: string, second: string): Record<string, unknown> =>
      result({
        openQuestions: [
          { id: first, statement: 'first' },
          { id: second, statement: 'second' },
        ],
      });
    expect(resultSha256(parseVerificationResult(two('Q1', 'Q2')))).not.toBe(
      resultSha256(parseVerificationResult(two('Q2', 'Q1'))),
    );
  });
});
