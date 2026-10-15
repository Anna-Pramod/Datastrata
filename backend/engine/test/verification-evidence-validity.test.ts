/**
 * Evidence validity as a measurement — tests.
 *
 * `checkResultEvidence` is the sign gate's corpus re-check taken out of the
 * gate so a run can be measured before, and without, any signature (plan D-9's
 * evidence-validity tier). Two things could make that measurement lie, and
 * this file exists to catch both.
 *
 * **It could stop measuring.** A tier that reports every set clean passes the
 * accepted control as happily as a working one. So every failing case below
 * pins the failing set's literal `recordPath` and `label`, and asserts in the
 * same output that every *other* set is clean — the positive control that
 * tells "this set failed" from "everything fails" (failure mode 5).
 *
 * **It could drift from the gate.** `sign.ts` is not refactored to call this
 * module — the plan keeps it untouched — so two loops now walk the same
 * enumeration. The equivalence cases run both over the same schema-valid
 * results and require the failed sets' `${label}: ${problems.join('; ')}` to
 * equal the gate's `evidence_failed` details, in order. At least one fixture
 * fails in two kinds at once, so the comparison is never between two empty
 * lists, and the accepted control passes the whole gate, so an empty list there
 * is the gate's verdict rather than the gate never having been reached. One set
 * fails with three problems, found in an order that neither an ascending nor a
 * descending sort reproduces, so the join and its order are compared, not only
 * a single problem that a truncated or reordered list would still reproduce.
 *
 * **The corpus is synthetic and held in memory.** Its index goes through the
 * production parser and integrity check and its text through the production
 * normalizer; only the file reads `loadCorpus` would do are absent, because a
 * measurement over values needs none. Nothing here reads the real `corpus/`,
 * and nothing is written to disk.
 */

import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/corpus/hash';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { resolveRanges } from '../src/corpus/ranges';
import { parseCorpusIndex, verifyCorpusIntegrity } from '../src/corpus/schema';
import { CorpusDocumentNotFoundError, type LoadedCorpus } from '../src/corpus/store';
import { requirementInputSha256, requirementSha256 } from '../src/verification/canonical';
import { enumeratedEvidencePaths, evidenceSetsOf } from '../src/verification/evidence-sets';
import { quotesOf, resolveEvidenceUse, type ResolvedEvidenceUse } from '../src/verification/evidence-use';
import { checkResultEvidence } from '../src/verification/evidence-validity';
import type { PromotionRecord } from '../src/verification/promotions';
import type { VersionRegistry } from '../src/verification/registry';
import { resultSha256, verificationResultSchema, type VerificationResult } from '../src/verification/result';
import {
  assertSignable,
  buildSignature,
  candidateConditionSha256,
  RefusalError,
  type CorpusPin,
  type SignabilityInput,
  type SignatureInput,
} from '../src/verification/sign';
import type { Requirement } from '../src/types';

// ---------------------------------------------------------------------------
// The corpus: two synthetic documents, in memory
// ---------------------------------------------------------------------------

// Paragraphs, so the normalized text has headings and blank lines, and the
// two-line anchors below can declare the operative ranges the evidence-use
// resolver needs before the accepted control can pass the whole gate.
const TEXT_A =
  '<p>Article 19a</p><p>Sustainability reporting</p><p>Undertakings which, on their balance sheet dates, exceed a net turnover of EUR 450 000 000 shall report sustainability information. The reporting period is the financial year.</p><p>Article 20</p><p>Corporate governance statement</p><p>The statement. The reporting period is the financial year.</p><p>Article 21</p><p>Final provisions</p><p>End.</p>';
const TEXT_B =
  '<p>Directive (EU) 2026/470</p><p>Article 1</p><p>Amendments</p><p>Article 1(4)(a) substitutes the opening words of Article 19a(1).</p><p>Article 2</p><p>Entry into force</p><p>This Directive enters into force.</p>';
const RANGES: Record<string, unknown[]> = {
  'DOC-A': [
    { id: 'art-19a', start: ['Article 19a', 'Sustainability reporting'], end: ['Article 20', 'Corporate governance statement'], justification: 'fixture' },
    { id: 'art-20', start: ['Article 20', 'Corporate governance statement'], end: ['Article 21', 'Final provisions'], justification: 'fixture' },
  ],
  'DOC-B': [{ id: 'art-1', start: ['Article 1', 'Amendments'], end: ['Article 2', 'Entry into force'], justification: 'fixture' }],
};

/**
 * A `LoadedCorpus` over the two texts above, built without touching disk.
 *
 * The index is parsed and integrity-checked by the production functions, and
 * the declared ranges must resolve against the normalized text, as
 * `loadCorpus` requires. An unknown id throws `CorpusDocumentNotFoundError`,
 * the error `loadCorpus`'s accessor throws, because `checkEvidenceSet` turns
 * that throw into its "does not hold" problem.
 */
function inMemoryCorpus(): LoadedCorpus {
  const docs = [
    { docId: 'DOC-A', slug: 'a', raw: TEXT_A },
    { docId: 'DOC-B', slug: 'b', raw: TEXT_B },
  ];
  const normalized = new Map(docs.map((d) => [d.docId, normalize(d.raw)]));
  const raw = new Map(docs.map((d) => [d.docId, d.raw]));
  const textOf = (texts: Map<string, string>, docId: string): string => {
    const text = texts.get(docId);
    if (text === undefined) throw new Error(`fixture holds no text for ${docId}`);
    return text;
  };

  const index = parseCorpusIndex({
    updated: '2026-08-20',
    documents: docs.map((d) => ({
      docId: d.docId,
      serves: ['SRC-001'],
      title: d.docId,
      url: `https://example.invalid/${d.slug}`,
      versionLabel: 'v1',
      retrievedOn: '2026-08-20',
      rawPath: `raw/${d.slug}.txt`,
      normalizedPath: `normalized/${d.slug}.txt`,
      sha256Raw: sha256Hex(d.raw),
      sha256Normalized: sha256Hex(textOf(normalized, d.docId)),
      normalizerVersion: NORMALIZER_VERSION,
      contentSelector: null,
      artefactAuthenticity: 'official_consolidation',
      nonOperativeSections: [],
      operativeRanges: RANGES[d.docId],
      edges:
        d.docId === 'DOC-A'
          ? [{ edgeId: 'E1', kind: 'amendedBy', from: 'DOC-A', to: 'DOC-B', provenance: { type: 'celex_metadata', source: 'CELEX', recordedOn: '2026-08-20' } }]
          : [],
    })),
  });
  verifyCorpusIntegrity(index);
  for (const d of index.documents) {
    const ranges = resolveRanges(textOf(normalized, d.docId), d.operativeRanges ?? []);
    if (!ranges.ok) throw new Error(`fixture ranges do not resolve: ${ranges.problems.join('; ')}`);
  }

  const byId = new Map(index.documents.map((d) => [d.docId, d]));
  const document = (docId: string) => {
    const d = byId.get(docId);
    if (d === undefined) throw new CorpusDocumentNotFoundError(docId);
    return d;
  };
  return {
    index,
    document,
    normalizedText: (docId) => textOf(normalized, document(docId).docId),
    rawText: (docId) => textOf(raw, document(docId).docId),
  };
}

const corpus = inMemoryCorpus();

// ---------------------------------------------------------------------------
// The record: two reading elements and two challenges, six evidence sets
// ---------------------------------------------------------------------------

const HASH = (c: string): string => c.repeat(64);
const CLOSURE = HASH('e');
const RENDERED = HASH('d');

function requirement(): Requirement {
  return {
    id: 'REQ-001',
    version: 1,
    title: 'Test requirement',
    program: 'TESTPROG',
    decisionArea: 'Test area',
    plainEnglish: 'A large undertaking must report.',
    scopeType: 'legal_entity',
    relationshipClass: 'direct_legal',
    severity: 'high',
    kind: 'boolean',
    condition: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450000000 },
    legalStatus: 'in_force',
    derivedStatus: 'draft',
    statusReasons: [],
    sources: ['SRC-001'],
    provenance: [{ sourceId: 'SRC-001', locators: [{ kind: 'provision', text: 'Article 19a(1)' }] }],
  };
}

function currentPins(): CorpusPin[] {
  return ['DOC-A', 'DOC-B'].map((docId) => {
    const d = corpus.document(docId);
    return {
      docId,
      versionLabel: d.versionLabel,
      sha256Raw: d.sha256Raw,
      sha256Normalized: d.sha256Normalized,
      normalizerVersion: d.normalizerVersion,
      artefactAuthenticity: d.artefactAuthenticity,
      nonOperativeSections: [...d.nonOperativeSections],
      sources: [{ sourceId: 'SRC-001', temporalStanding: 'in_force' }],
    };
  });
}

/** A quote pinned at the docId and hash the corpus holds: only its text can be wrong. */
function quote(docId: 'DOC-A' | 'DOC-B', text: string) {
  return { kind: 'quote' as const, docId, sha256Normalized: corpus.document(docId).sha256Normalized, text };
}

/** Valid, self-consistent, and every quote really in the corpus. */
function accepted(): VerificationResult {
  const req = requirement();
  return {
    packId: 'testpack',
    requirementId: 'REQ-001',
    requirementVersion: 1,
    resultSchemaVersion: '1.3.0',
    pipelineVersion: 'pipeline-1.0.0',
    rendererVersion: 'renderer-1.1.0',
    closureRendererVersion: 'closure-renderer-1.0.0',
    requirementInputSha256: requirementInputSha256(req),
    conditionSha256: candidateConditionSha256(req),
    renderedConditionSha256: RENDERED,
    corpusClosureSha256: CLOSURE,
    corpus: currentPins(),
    reading: {
      elements: [
        {
          id: 'R1',
          statement: 'A large undertaking must report.',
          evidence: [
            quote('DOC-A', 'a net turnover of EUR 450 000 000'),
            { kind: 'absence', docIds: ['DOC-B'], term: 'value added tax' },
          ],
        },
        {
          id: 'R2',
          statement: 'What it reports is sustainability information.',
          evidence: [quote('DOC-A', 'shall report sustainability information')],
        },
      ],
    },
    coverage: {
      cells: [
        { direction: 'reading_to_condition', readingElementId: 'R1', conditionPath: '$', verdict: 'MAPPED' },
        { direction: 'reading_to_condition', readingElementId: 'R2', conditionPath: '$', verdict: 'MAPPED' },
      ],
    },
    challenges: [
      {
        id: 'C1',
        lens: 'threshold',
        statement: 'Is the turnover threshold EUR 450 000 000?',
        verdict: 'CONFIRMED',
        evidence: [quote('DOC-B', 'substitutes the opening words')],
        resolution: 'The threshold is as encoded.',
        adjudicationEvidence: [quote('DOC-A', 'on their balance sheet dates')],
      },
      {
        id: 'C2',
        lens: 'measurement date',
        statement: 'Is the threshold measured on the balance sheet date?',
        verdict: 'CONFIRMED',
        evidence: [quote('DOC-A', 'exceed a net turnover')],
        resolution: 'It is measured on the balance sheet dates.',
        adjudicationEvidence: [quote('DOC-B', 'the opening words of Article 19a(1)')],
      },
    ],
    openQuestions: [],
    gaps: [],
  } as VerificationResult;
}

/** The accepted record with one edit applied to a copy of it. */
function variant(edit: (r: VerificationResult) => void): VerificationResult {
  const r = structuredClone(accepted());
  edit(r);
  return r;
}

/** Text that is nowhere in DOC-A, on DOC-A's pinned id and hash. */
const FABRICATED = 'a net turnover of EUR 40 000 000';
/** Text that is nowhere in DOC-B, on DOC-B's pinned id and hash. */
const FABRICATED_B = 'the closing words of Article 19a(1)';

const READING_FAILS = variant((r) => {
  r.reading.elements[1]!.evidence = [quote('DOC-A', 'shall report value added tax information')];
});
const CHALLENGE_EVIDENCE_FAILS = variant((r) => {
  r.challenges[0]!.evidence = [{ ...quote('DOC-B', 'substitutes the opening words'), docId: 'DOC-Z' }];
});
const ADJUDICATION_FAILS = variant((r) => {
  r.challenges[1]!.adjudicationEvidence = [{ ...quote('DOC-B', 'the opening words of Article 19a(1)'), sha256Normalized: HASH('0') }];
});
const LAST_FAILS = variant((r) => {
  r.challenges[1]!.adjudicationEvidence = [quote('DOC-B', FABRICATED_B)];
});
const TWO_KINDS_FAIL = variant((r) => {
  r.reading.elements[0]!.evidence[0] = quote('DOC-A', FABRICATED);
  r.challenges[0]!.adjudicationEvidence = [quote('DOC-A', 'on their balance sheet date is 31 December')];
});
const FABRICATED_TEXT = variant((r) => {
  r.reading.elements[0]!.evidence[0] = quote('DOC-A', FABRICATED);
});
const ABSENCE_PRESENT = variant((r) => {
  // Present in DOC-B in other casing: the search is case-insensitive.
  r.reading.elements[0]!.evidence[1] = { kind: 'absence', docIds: ['DOC-B'], term: 'Substitutes The Opening Words' };
});
/**
 * One set, three problems in a known order: a fabricated quote on DOC-A, then
 * an absence term that DOC-B and DOC-A both hold, searched in that order, so
 * the problems name the quote, then DOC-B, then DOC-A. The quote keeps the
 * absence from being the sole evidence, so these three are the set's only
 * problems.
 */
const THREE_PROBLEMS_ONE_SET = variant((r) => {
  r.reading.elements[0]!.evidence = [
    quote('DOC-A', FABRICATED),
    // Found as evidence[0], DOC-B, DOC-A: neither the ascending nor the descending sorted order.
    { kind: 'absence', docIds: ['DOC-B', 'DOC-A'], term: 'Article 19a' },
  ];
});

/** The one-set-per-kind fixtures, which between them must fail every enumerated path. */
const PER_KIND_FAILING: readonly VerificationResult[] = [READING_FAILS, CHALLENGE_EVIDENCE_FAILS, ADJUDICATION_FAILS];

/**
 * The canonical gap-bearing record: every judgment-bearing container empty.
 * Schema-valid with no evidence set at all — the one shape where the
 * measurement has nothing to measure.
 */
const HALTED = variant((r) => {
  r.reading.elements = [];
  r.coverage.cells = [];
  r.challenges = [];
  r.gaps = [{ kind: 'corpus_gap', docId: 'DOC-Z', detail: 'the consolidating act is not held' }];
});

/** Every set of `accepted()`, in enumeration order, as literals. */
const ADDRESSES = [
  { recordPath: 'reading.elements[0] (R1).evidence', label: 'reading element R1' },
  { recordPath: 'reading.elements[1] (R2).evidence', label: 'reading element R2' },
  { recordPath: 'challenges[0] (C1).evidence', label: 'challenge C1' },
  { recordPath: 'challenges[0] (C1).adjudicationEvidence', label: 'challenge C1 adjudication' },
  { recordPath: 'challenges[1] (C2).evidence', label: 'challenge C2' },
  { recordPath: 'challenges[1] (C2).adjudicationEvidence', label: 'challenge C2 adjudication' },
] as const;

/** The measurement over `r`, with set `failing` expected to carry `problems` and every other set clean. */
function expectOnlyFailing(r: VerificationResult, failing: number, problems: string[]): void {
  const measured = checkResultEvidence(r, corpus);
  // The sets first, so a failure names the set and its problems rather than
  // only the top-level flag.
  expect(measured.sets).toEqual(
    ADDRESSES.map((address, i) =>
      i === failing ? { ...address, ok: false, problems } : { ...address, ok: true, problems: [] },
    ),
  );
  expect(measured.ok).toBe(false);
}

// ---------------------------------------------------------------------------
// The measurement
// ---------------------------------------------------------------------------

describe('checkResultEvidence — the accepted control', () => {
  it('reports every set clean, in enumeration order, one entry per set', () => {
    const r = accepted();
    expect(verificationResultSchema.safeParse(r).success).toBe(true);
    const measured = checkResultEvidence(r, corpus);
    expect(measured.ok).toBe(true);
    expect(measured.sets).toHaveLength(evidenceSetsOf(r).length);
    expect(measured.sets).toEqual(ADDRESSES.map((address) => ({ ...address, ok: true, problems: [] })));
  });

  it('reports ok over a schema-valid record with no evidence set, and says so by an empty list', () => {
    // A halted, gap-bearing record is the one schema-valid shape with zero
    // sets. `ok: true` there means nothing failed, not that evidence was
    // found; `sets: []` is how a caller tells the two apart.
    expect(verificationResultSchema.safeParse(HALTED).success).toBe(true);
    expect(evidenceSetsOf(HALTED)).toEqual([]);
    expect(checkResultEvidence(HALTED, corpus)).toEqual({ ok: true, sets: [] });
  });
});

describe('checkResultEvidence — one failing set in each of the three kinds', () => {
  it('reading.elements[].evidence', () => {
    expectOnlyFailing(READING_FAILS, 1, ['evidence[0]: quote not found in DOC-A: "shall report value added tax information"']);
  });

  it('challenges[].evidence', () => {
    expectOnlyFailing(CHALLENGE_EVIDENCE_FAILS, 2, ['evidence[0]: quote names DOC-Z, which the corpus does not hold']);
  });

  it('challenges[].adjudicationEvidence', () => {
    const held = corpus.document('DOC-B').sha256Normalized.slice(0, 12);
    expectOnlyFailing(ADJUDICATION_FAILS, 5, [
      `evidence[0]: quote pins DOC-B at hash 000000000000…, corpus holds ${held}…`,
    ]);
  });

  it('between them, fail every path the enumeration claims, which is every path the schema carries', () => {
    // The paths come from the failing sets themselves, looked up by their
    // record address, so a fixture list that lost a kind is named by the path
    // it no longer reaches. `enumeratedEvidencePaths()` is held to the schema
    // by the completeness guard in verification-evidence-sets.test.ts; the
    // literal pins today's three here.
    const failedPaths = PER_KIND_FAILING.flatMap((r) => {
      const pathOf = new Map(evidenceSetsOf(r).map((set) => [set.recordPath, set.path]));
      return checkResultEvidence(r, corpus)
        .sets.filter((set) => !set.ok)
        .map((set) => pathOf.get(set.recordPath));
    }).sort();
    expect(failedPaths).toEqual(enumeratedEvidencePaths());
    expect(failedPaths).toEqual(['challenges[].adjudicationEvidence', 'challenges[].evidence', 'reading.elements[].evidence']);
  });
});

describe('checkResultEvidence — one set with three problems', () => {
  it('reports every problem of the set, in the order checkEvidenceSet found them', () => {
    expectOnlyFailing(THREE_PROBLEMS_ONE_SET, 0, [
      'evidence[0]: quote not found in DOC-A: "a net turnover of EUR 40 000 000"',
      'evidence[1]: "Article 19a" occurs in DOC-B, so it is not absent',
      'evidence[1]: "Article 19a" occurs in DOC-A, so it is not absent',
    ]);
  });
});

describe('checkResultEvidence — only the last set fails', () => {
  it('reports the result failed although every set before the last is clean', () => {
    const measured = checkResultEvidence(LAST_FAILS, corpus);
    expect(measured.ok).toBe(false);
    expect(measured.sets).toHaveLength(6);
    expect(measured.sets.slice(0, 5).map((set) => set.ok)).toEqual([true, true, true, true, true]);
    expect(measured.sets[5]).toEqual({
      recordPath: 'challenges[1] (C2).adjudicationEvidence',
      label: 'challenge C2 adjudication',
      ok: false,
      problems: [`evidence[0]: quote not found in DOC-B: "${FABRICATED_B}"`],
    });
  });
});

describe('checkResultEvidence — what is compared', () => {
  it('fails fabricated text on the pinned docId and hash, naming the quote', () => {
    // The pin is exactly the corpus's: only the words are invented, which is
    // the case a hash check alone cannot see.
    const fabricated = FABRICATED_TEXT.reading.elements[0]!.evidence[0]!;
    expect(fabricated).toEqual({
      kind: 'quote',
      docId: 'DOC-A',
      sha256Normalized: corpus.document('DOC-A').sha256Normalized,
      text: FABRICATED,
    });
    expectOnlyFailing(FABRICATED_TEXT, 0, [`evidence[0]: quote not found in DOC-A: "${FABRICATED}"`]);
  });

  it('fails an absence term that is present in the text, naming it', () => {
    expectOnlyFailing(ABSENCE_PRESENT, 0, [
      'evidence[1]: "Substitutes The Opening Words" occurs in DOC-B, so it is not absent',
    ]);
  });

  it('tolerates case and runs of spaces, and does not treat a paragraph break as a space', () => {
    // What the measurement compares, pinned so a trust statement can quote it
    // exactly: `normalizeWhitespace` then `toLowerCase` on both sides. Spaces,
    // tabs and no-break spaces collapse; a line break stays a line break. The
    // no-break space is written as an escape, so no formatter can turn it into
    // the ordinary space it is meant to be tolerated as.
    expect(corpus.normalizedText('DOC-A')).toContain('Sustainability reporting\n\nUndertakings which');
    const tolerated = variant((r) => {
      r.reading.elements[0]!.evidence[0] = quote('DOC-A', ' A NET\u00a0TURNOVER \t of eur  450 000 000 ');
    });
    const acrossBreak = variant((r) => {
      r.reading.elements[0]!.evidence[0] = quote('DOC-A', 'Sustainability reporting Undertakings which');
    });
    expect(checkResultEvidence(tolerated, corpus).sets[0]).toEqual({ ...ADDRESSES[0], ok: true, problems: [] });
    expect(checkResultEvidence(acrossBreak, corpus).sets[0]).toEqual({
      ...ADDRESSES[0],
      ok: false,
      problems: ['evidence[0]: quote not found in DOC-A: "Sustainability reporting Undertakings which"'],
    });
  });

  it('reads the result and the corpus without writing to either', () => {
    const deepFreeze = <T>(value: T): T => {
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        for (const key of Object.getOwnPropertyNames(value)) deepFreeze((value as Record<string, unknown>)[key]);
        Object.freeze(value);
      }
      return value;
    };
    const r = deepFreeze(structuredClone(TWO_KINDS_FAIL));
    // The whole handle, not only its index: its own properties are the
    // accessors a measurement calls, and a write that replaced one would go
    // unseen by any comparison of values. The texts behind the accessors sit
    // in closures the measurement cannot reach.
    const frozenCorpus = deepFreeze(inMemoryCorpus());
    // The freeze is live: a write to either would throw, so a measurement that
    // wrote would fail here rather than pass silently.
    const writeResult = () => {
      (r as { packId: string }).packId = 'another';
    };
    expect(writeResult).toThrow(TypeError);
    expect(writeResult).toThrow(/Cannot assign to read only property 'packId'/);
    const writeIndex = () => {
      (frozenCorpus.index as { updated: string }).updated = 'another';
    };
    expect(writeIndex).toThrow(TypeError);
    expect(writeIndex).toThrow(/Cannot assign to read only property 'updated'/);
    const writeHandle = () => {
      (frozenCorpus as { rawText: LoadedCorpus['rawText'] }).rawText = frozenCorpus.rawText;
    };
    expect(writeHandle).toThrow(TypeError);
    expect(writeHandle).toThrow(/Cannot assign to read only property 'rawText'/);

    const before = JSON.stringify(r);
    let measured: ReturnType<typeof checkResultEvidence> | undefined;
    expect(() => {
      measured = checkResultEvidence(r, frozenCorpus);
    }).not.toThrow();
    expect(measured?.ok).toBe(false);
    expect(JSON.stringify(r)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Equivalence with the sign gate
// ---------------------------------------------------------------------------

/** Every set designated support, bound to `r`'s hash, as the reviewer would. */
function resolvedFor(r: VerificationResult): ResolvedEvidenceUse {
  return resolveEvidenceUse({
    result: r,
    designation: {
      resultSha256: resultSha256(r),
      sets: evidenceSetsOf(r).map((set) => ({
        set: set.recordPath,
        use: 'support' as const,
        items: quotesOf(set.items).map((q) => ({ item: q.path, use: 'support' as const })),
      })),
    },
    corpus,
  });
}

function signatureInput(r: VerificationResult): SignatureInput {
  return {
    kind: 'verified',
    packId: 'testpack',
    packVersion: '2026.1',
    requirement: requirement(),
    result: r,
    renderedConditionSha256: RENDERED,
    rendererVersion: 'renderer-1.1.0',
    corpusClosureSha256: CLOSURE,
    corpus: currentPins(),
    by: 'A. Reviewer',
    on: '2026-08-21',
    evidenceUse: resolvedFor(r).records,
  };
}

const REGISTRY: VersionRegistry = { 'REQ-001': { '1': requirementSha256(requirement()) } };
const PROMOTIONS: PromotionRecord[] = [{ pipelineVersion: 'pipeline-1.0.0', by: 'A. Promoter', on: '2026-08-01' }];

function checksFor(r: VerificationResult): SignabilityInput {
  return {
    result: r,
    corpus,
    sourceIds: ['SRC-001'],
    registry: REGISTRY,
    promotions: PROMOTIONS,
    existing: null,
    testSuiteGreen: true,
    evidenceUse: resolvedFor(r),
  };
}

/** The gate's `evidence_failed` details over `r`, in the order it refused them. */
function gateEvidenceFailures(r: VerificationResult): string[] {
  try {
    assertSignable(buildSignature(signatureInput(r)), checksFor(r));
    return [];
  } catch (error) {
    if (!(error instanceof RefusalError)) throw error;
    return error.refusals.filter((refusal) => refusal.code === 'evidence_failed').map((refusal) => refusal.detail);
  }
}

/** The measurement's failed sets, in the gate's refusal wording. */
function measuredFailures(r: VerificationResult): string[] {
  return checkResultEvidence(r, corpus)
    .sets.filter((set) => !set.ok)
    .map((set) => `${set.label}: ${set.problems.join('; ')}`);
}

describe('checkResultEvidence agrees with assertSignable', () => {
  it('the accepted control passes the whole gate, so its empty list is a verdict', () => {
    const r = accepted();
    expect(() => assertSignable(buildSignature(signatureInput(r)), checksFor(r))).not.toThrow();
    expect(measuredFailures(r)).toEqual([]);
  });

  it.each([
    ['the accepted control', accepted(), 0],
    ['a failing reading element', READING_FAILS, 1],
    ['a failing prosecutor array', CHALLENGE_EVIDENCE_FAILS, 1],
    ['a failing adjudication array', ADJUDICATION_FAILS, 1],
    ['failures in two kinds at once', TWO_KINDS_FAIL, 2],
    ['only the last set failing', LAST_FAILS, 1],
    ['fabricated text', FABRICATED_TEXT, 1],
    ['a present absence term', ABSENCE_PRESENT, 1],
    ['three problems in one set', THREE_PROBLEMS_ONE_SET, 1],
    ['a record with no evidence set', HALTED, 0],
  ])('%s: the failed sets are the gate\'s evidence_failed details, in order', (_name, r, count) => {
    expect(verificationResultSchema.safeParse(r).success).toBe(true);
    const gate = gateEvidenceFailures(r);
    // The count is a literal, so a gate that stopped refusing and a measurement
    // that stopped measuring cannot agree on an empty list and pass.
    expect(gate).toHaveLength(count);
    expect(measuredFailures(r)).toEqual(gate);
  });

  it('names both kinds when two fail at once, in enumeration order', () => {
    expect(gateEvidenceFailures(TWO_KINDS_FAIL)).toEqual([
      `reading element R1: evidence[0]: quote not found in DOC-A: "${FABRICATED}"`,
      'challenge C1 adjudication: evidence[0]: quote not found in DOC-A: "on their balance sheet date is 31 December"',
    ]);
  });

  it('joins one set\'s problems with "; ", in order, as the gate does', () => {
    const detail =
      'reading element R1: evidence[0]: quote not found in DOC-A: "a net turnover of EUR 40 000 000"; evidence[1]: "Article 19a" occurs in DOC-B, so it is not absent; evidence[1]: "Article 19a" occurs in DOC-A, so it is not absent';
    expect(gateEvidenceFailures(THREE_PROBLEMS_ONE_SET)).toEqual([detail]);
    expect(measuredFailures(THREE_PROBLEMS_ONE_SET)).toEqual([detail]);
  });
});
