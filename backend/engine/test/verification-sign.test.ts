/**
 * The signature candidate and the sign gate — tests.
 *
 * The load-bearing test in this file is `passes over an existing signature that
 * is stale`. Record design §5.1 calls the correction it encodes "the correction
 * that matters most in this document": an earlier draft refused to sign on
 * blocking staleness, which inverts the mechanism, because **signing is how a
 * stale status is repaired**. A requirement reading `stale_encoding` today is
 * reading it precisely because its condition was corrected — which is why a
 * fresh verification exists and wants signing. A suite without that test would
 * accept the inverted implementation without complaint, since every other test
 * here passes against it.
 *
 * Its opposite number is candidate consistency, which asks a different
 * question — does the result being signed describe the world as it is *now*? —
 * and blocks. It is exercised for each of the five compared hashes
 * independently, because a test that moved all five at once would pass against
 * an implementation comparing only one.
 *
 * The rest follow from three properties:
 *
 *  - **Refusal is the feature, and every refusal is reported.** A signer fixing
 *    one problem at a time learns the next only after re-running, so the
 *    two-simultaneous-refusals test asserts on the set rather than on the
 *    presence of either.
 *  - **Integrity failure is a separate category** (factory §4.4) with its own
 *    error class and exit code. A missing pinned result or a vanished pinned
 *    document is not staleness and not an ordinary refusal.
 *  - **One frozen derivation.** Every precondition runs against the candidate
 *    object, and Task 4 appends that same object — so the candidate is frozen,
 *    and the freeze is asserted rather than assumed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCorpus, type LoadedCorpus } from '../src/corpus/store';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import {
  conditionSha256,
  requirementInputSha256,
  requirementSha256,
} from '../src/verification/canonical';
import { entryId, type SigningEntry } from '../src/verification/ledger';
import { deriveStaleness, type CurrentState } from '../src/verification/staleness';
import { resultSha256, type VerificationResult } from '../src/verification/result';
import type { PromotionRecord } from '../src/verification/promotions';
import type { VersionRegistry } from '../src/verification/registry';
import type { Requirement } from '../src/types';
import {
  assertSignable,
  buildSignature,
  candidateConditionSha256,
  IntegrityFailureError,
  RefusalError,
  type CorpusPin,
  type RefusalCode,
  type SignabilityInput,
  type SignatureCandidate,
  type SignatureInput,
} from '../src/verification/sign';

const HASH = (c: string): string => c.repeat(64);

const TEXT_A =
  'Article 19a\nUndertakings which, on their balance sheet dates, exceed a net turnover of EUR 450 000 000 shall report sustainability information.';
const TEXT_B =
  'Directive (EU) 2026/470\nArticle 1(4)(a) substitutes the opening words of Article 19a(1).';

const prov = { type: 'celex_metadata', source: 'CELEX', recordedOn: '2026-08-20' } as const;

let dir = '';
let corpus: LoadedCorpus;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sign-'));
  mkdirSync(join(dir, 'raw'), { recursive: true });
  mkdirSync(join(dir, 'normalized'), { recursive: true });

  const docs = [
    { id: 'DOC-A', slug: 'a', text: TEXT_A },
    { id: 'DOC-B', slug: 'b', text: TEXT_B },
  ];

  const documents = docs.map((d) => {
    const normalized = normalize(d.text);
    writeFileSync(join(dir, 'raw', `${d.slug}.txt`), d.text, 'utf8');
    writeFileSync(join(dir, 'normalized', `${d.slug}.txt`), normalized, 'utf8');
    return {
      docId: d.id,
      serves: ['SRC-001'],
      title: d.id,
      url: `https://eur-lex.europa.eu/eli/dir/2013/34/oj/eng#${d.slug}`,
      versionLabel: 'v1',
      retrievedOn: '2026-08-20',
      rawPath: `raw/${d.slug}.txt`,
      normalizedPath: `normalized/${d.slug}.txt`,
      sha256Raw: sha256Hex(d.text),
      sha256Normalized: sha256Hex(normalized),
      normalizerVersion: NORMALIZER_VERSION,
      contentSelector: null,
      artefactAuthenticity: 'official_consolidation',
      nonOperativeSections: [],
      edges:
        d.id === 'DOC-A'
          ? [{ edgeId: 'E1', kind: 'amendedBy', from: 'DOC-A', to: 'DOC-B', provenance: prov }]
          : [],
    };
  });

  writeFileSync(
    join(dir, 'index.json'),
    JSON.stringify({ updated: '2026-08-20', documents }, null, 2),
    'utf8',
  );
  corpus = loadCorpus(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function requirement(overrides: Partial<Requirement> = {}): Requirement {
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
    ...overrides,
  };
}

/** The current corpus, in the shape a closure hands to `buildSignature`. */
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

const CLOSURE = HASH('e');
const RENDERED = HASH('d');

/**
 * A result that is valid, self-consistent, and agrees with both the corpus on
 * disk and the requirement above. Overrides replace whole keys.
 */
/**
 * The canonical gap-bearing record: every judgment-bearing container empty and
 * `gaps[]` carrying the explanation.
 *
 * A gap says the evidence surface itself was incomplete, so agent verification
 * stopped and nothing was judged — a result pairing a gap with a full reading is
 * inconsistent for that reason alone, and every gap refusal asserted below would
 * arrive with an `invalid_result` beside it that has nothing to do with the gap.
 */
function haltedResult(overrides: Record<string, unknown> = {}): VerificationResult {
  return result({
    reading: { elements: [] },
    coverage: { cells: [] },
    challenges: [],
    openQuestions: [],
    ...overrides,
  });
}

function result(overrides: Record<string, unknown> = {}): VerificationResult {
  const req = requirement();
  const a = corpus.document('DOC-A');
  const b = corpus.document('DOC-B');
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
            {
              kind: 'quote',
              docId: 'DOC-A',
              sha256Normalized: a.sha256Normalized,
              text: 'a net turnover of EUR 450 000 000',
            },
            { kind: 'absence', docIds: ['DOC-B'], term: 'value added tax' },
          ],
        },
      ],
    },
    coverage: {
      cells: [
        { direction: 'reading_to_condition', readingElementId: 'R1', conditionPath: '$', verdict: 'MAPPED' },
      ],
    },
    challenges: [
      {
        id: 'C1',
        lens: 'threshold',
        statement: 'Is the turnover threshold EUR 450 000 000?',
        verdict: 'CONFIRMED',
        evidence: [
          {
            kind: 'quote',
            docId: 'DOC-B',
            sha256Normalized: b.sha256Normalized,
            text: 'substitutes the opening words',
          },
        ],
        resolution: 'The threshold is as encoded.',
        // E-A: a different document and different words from the E-P above, so
        // that a defect crossing the two fields shows up as the wrong docId.
        adjudicationEvidence: [
          {
            kind: 'quote',
            docId: 'DOC-A',
            sha256Normalized: a.sha256Normalized,
            text: 'on their balance sheet dates',
          },
        ],
      },
    ],
    openQuestions: [],
    gaps: [],
    ...overrides,
  } as VerificationResult;
}

function signatureInput(overrides: Partial<SignatureInput> = {}): SignatureInput {
  return {
    kind: 'verified',
    packId: 'testpack',
    packVersion: '2026.1',
    requirement: requirement(),
    result: result(),
    renderedConditionSha256: RENDERED,
    rendererVersion: 'renderer-1.1.0',
    corpusClosureSha256: CLOSURE,
    corpus: currentPins(),
    by: 'A. Reviewer',
    on: '2026-08-21',
    ...overrides,
  };
}

function registryFor(req: Requirement = requirement()): VersionRegistry {
  return { [req.id]: { [String(req.version)]: requirementSha256(req) } };
}

const PROMOTIONS: PromotionRecord[] = [
  { pipelineVersion: 'pipeline-1.0.0', by: 'A. Promoter', on: '2026-08-01' },
];

/**
 * The pack's source register, as the gate sees it. `SRC-001` is the fixture
 * requirement's own source; `SRC-005` is a registered source the fixture corpus
 * serves with no document, which is the shape a source-level `corpus_gap`
 * names.
 */
const SOURCE_IDS: readonly string[] = ['SRC-001', 'SRC-005'];

function checks(overrides: Partial<SignabilityInput> = {}): SignabilityInput {
  return {
    result: result(),
    corpus,
    sourceIds: SOURCE_IDS,
    registry: registryFor(),
    promotions: PROMOTIONS,
    existing: null,
    testSuiteGreen: true,
    ...overrides,
  };
}

/** The refusal codes `assertSignable` reports, sorted for set comparison. */
function refusalCodes(candidate: SignatureCandidate, c: SignabilityInput): RefusalCode[] {
  try {
    assertSignable(candidate, c);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(RefusalError);
    return [...new Set((error as RefusalError).refusals.map((r) => r.code))].sort();
  }
}

/** Every refusal detail, joined, for substring assertions. */
function refusalDetail(candidate: SignatureCandidate, c: SignabilityInput): string {
  try {
    assertSignable(candidate, c);
    return expect.unreachable('expected assertSignable to refuse');
  } catch (error) {
    return (error as RefusalError).refusals.map((r) => `${r.code}: ${r.detail}`).join('\n');
  }
}

// ---------------------------------------------------------------------------
// buildSignature — one frozen derivation
// ---------------------------------------------------------------------------

describe('buildSignature', () => {
  it('derives an entry whose id verifies against its own contents', () => {
    const { entry } = buildSignature(signatureInput());
    const { entryId: id, ...rest } = entry;
    expect(id).toBe(entryId(rest as Omit<SigningEntry, 'entryId'>));
  });

  it('pins the requirement hashes derived from the requirement itself', () => {
    const req = requirement();
    const { entry } = buildSignature(signatureInput());
    expect(entry.requirementSha256).toBe(requirementSha256(req));
    expect(entry.requirementInputSha256).toBe(requirementInputSha256(req));
    expect(entry.conditionSha256).toBe(conditionSha256(req.condition!));
    expect(entry.requirementVersion).toBe(1);
  });

  it('pins the corpus as it is now, not as the result recorded it', () => {
    // The entry describes the world at signing time. Task 4 renormalises the
    // retained raw bytes when the normalizer moves, so the bytes pinned must
    // be the ones on disk now.
    const reissued = currentPins().map((p) =>
      p.docId === 'DOC-A' ? { ...p, sha256Raw: HASH('9') } : p,
    );
    const { entry } = buildSignature(signatureInput({ corpus: reissued }));
    expect(entry.corpus.find((p) => p.docId === 'DOC-A')?.sha256Raw).toBe(HASH('9'));
  });

  it('carries the result hash and the pipeline that produced it', () => {
    const r = result();
    const { entry } = buildSignature(signatureInput({ result: r }));
    expect(entry.resultSha256).toBe(resultSha256(r));
    expect(entry.pipelineVersion).toBe('pipeline-1.0.0');
  });

  it('returns a frozen candidate, down to each corpus pin', () => {
    // Task 4 appends this object. A precondition that ran against a value
    // something could still change afterwards would be checking a different
    // line from the one written.
    const candidate = buildSignature(signatureInput());
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.entry)).toBe(true);
    expect(Object.isFrozen(candidate.entry.corpus)).toBe(true);
    expect(Object.isFrozen(candidate.entry.corpus[0])).toBe(true);
    expect(Object.isFrozen(candidate.advisories)).toBe(true);
    expect(() => {
      (candidate.entry as { by: string }).by = 'Someone Else';
    }).toThrow();
  });

  it('refuses to build a candidate from a result for another requirement', () => {
    // A precondition violation by the caller, not a state of the world: there
    // is no candidate for a refusal to be reported against.
    expect(() =>
      buildSignature(signatureInput({ result: result({ requirementId: 'REQ-002' }) })),
    ).toThrow(/REQ-002/);
    expect(() =>
      buildSignature(signatureInput({ result: result({ packId: 'otherpack' }) })),
    ).toThrow(/otherpack/);
  });

  it('reads nothing: the same input twice yields the same entryId', () => {
    const a = buildSignature(signatureInput());
    const b = buildSignature(signatureInput());
    expect(a.entry.entryId).toBe(b.entry.entryId);
  });
});

describe('candidateConditionSha256', () => {
  it('is the condition subtree hash for a boolean requirement', () => {
    const req = requirement();
    expect(candidateConditionSha256(req)).toBe(conditionSha256(req.condition!));
  });

  it('falls back to the logical payload for a selection requirement', () => {
    // A selection requirement has no top-level condition, and the field is not
    // optional in the ledger. The fallback is documented rather than implied,
    // and it must at least be stable and distinct.
    const selection = requirement({
      kind: 'selection',
      condition: undefined,
      cases: [{ when: { op: 'exists', fact: 'entity.turnover' }, value: 'A', label: 'A' }],
      defaultValue: 'B',
    });
    const hash = candidateConditionSha256(selection);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(candidateConditionSha256(requirement()));
  });
});

// ---------------------------------------------------------------------------
// The clean case
// ---------------------------------------------------------------------------

describe('assertSignable', () => {
  it('passes a clean candidate', () => {
    const candidate = buildSignature(signatureInput());
    expect(() => assertSignable(candidate, checks())).not.toThrow();
    expect(candidate.advisories).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §5.1 — the correction that matters most
// ---------------------------------------------------------------------------

describe('existing-signature staleness', () => {
  /**
   * A governing entry whose pinned encoding no longer matches the world: the
   * requirement's condition was corrected after it was signed. This is the
   * state a fresh verification exists to repair.
   */
  function staleGoverningEntry(): SigningEntry {
    const req = requirement();
    const unsigned: Omit<SigningEntry, 'entryId'> = {
      kind: 'verified',
      packId: 'testpack',
      packVersion: '2026.1',
      requirementId: 'REQ-001',
      requirementVersion: 1,
      requirementSha256: HASH('a'),
      // The encoding this signature was made over, before the correction.
      requirementInputSha256: HASH('b'),
      conditionSha256: HASH('c'),
      renderedConditionSha256: RENDERED,
      rendererVersion: 'renderer-1.1.0',
      closureRendererVersion: 'closure-renderer-1.0.0',
      corpusClosureSha256: CLOSURE,
      corpus: currentPins(),
      resultSha256: HASH('1'),
      pipelineVersion: 'pipeline-1.0.0',
      by: 'A. Reviewer',
      on: '2026-01-01',
    };
    void req;
    return { ...unsigned, entryId: entryId(unsigned) };
  }

  /** The current world, for `deriveStaleness` — the candidate's own view. */
  function currentState(candidate: SignatureCandidate): CurrentState {
    return {
      requirementInputSha256: candidate.entry.requirementInputSha256,
      conditionSha256: candidate.entry.conditionSha256,
      renderedConditionSha256: candidate.entry.renderedConditionSha256,
      corpusClosureSha256: candidate.entry.corpusClosureSha256,
      resultSha256: candidate.entry.resultSha256,
      corpus: currentPins(),
    };
  }

  it('is genuinely stale in the fixture, so the test below is about something', () => {
    const candidate = buildSignature(signatureInput());
    const reasons = deriveStaleness(staleGoverningEntry(), currentState(candidate));
    expect(reasons).toContain('stale_encoding');
  });

  it('passes over an existing signature that is stale', () => {
    // Record design §5.1. Staleness belongs to the *existing governing entry*,
    // and signing is how a stale status is repaired. `CSRD-S-001` reading
    // `stale_encoding` today is exactly why a fresh verification exists and
    // wants signing; refusing on it inverts the mechanism and makes recovery
    // impossible precisely when it is required.
    const candidate = buildSignature(signatureInput());
    const c = checks({ existing: { entry: staleGoverningEntry(), resultPresent: true } });
    expect(() => assertSignable(candidate, c)).not.toThrow();
  });

  it('reports existing staleness nowhere in the refusal set, even alongside a real refusal', () => {
    const candidate = buildSignature(signatureInput());
    const c = checks({
      existing: { entry: staleGoverningEntry(), resultPresent: true },
      testSuiteGreen: false,
    });
    expect(refusalCodes(candidate, c)).toEqual(['red_suite']);
    expect(refusalDetail(candidate, c)).not.toMatch(/stale/i);
  });
});

// ---------------------------------------------------------------------------
// Candidate consistency — the gate that does block
// ---------------------------------------------------------------------------

describe('candidate consistency', () => {
  const MOVED: Array<[string, Record<string, unknown>]> = [
    ['requirementInputSha256', { requirementInputSha256: HASH('7') }],
    ['conditionSha256', { conditionSha256: HASH('7') }],
    ['renderedConditionSha256', { renderedConditionSha256: HASH('7') }],
    ['corpusClosureSha256', { corpusClosureSha256: HASH('7') }],
  ];

  for (const [field, override] of MOVED) {
    it(`refuses when the result's ${field} no longer equals the current one`, () => {
      const moved = result(override);
      const candidate = buildSignature(signatureInput({ result: moved }));
      const c = checks({ result: moved });
      expect(refusalCodes(candidate, c)).toEqual(['candidate_inconsistent']);
      expect(refusalDetail(candidate, c)).toContain(field);
    });
  }

  it("refuses when a pinned document's normalized hash has moved", () => {
    // The words the reader read are not the words on disk now.
    const moved = currentPins().map((p) =>
      p.docId === 'DOC-A' ? { ...p, sha256Normalized: HASH('8') } : p,
    );
    const candidate = buildSignature(signatureInput({ corpus: moved }));
    const c = checks();
    expect(refusalCodes(candidate, c)).toEqual(['candidate_inconsistent']);
    expect(refusalDetail(candidate, c)).toContain('DOC-A');
    expect(refusalDetail(candidate, c)).toContain('sha256Normalized');
  });

  it('refuses when a document the result pinned is no longer in the closure', () => {
    const candidate = buildSignature(
      signatureInput({ corpus: currentPins().filter((p) => p.docId !== 'DOC-B') }),
    );
    expect(refusalCodes(candidate, checks())).toEqual(['candidate_inconsistent']);
    expect(refusalDetail(candidate, checks())).toContain('DOC-B');
  });

  it('does NOT refuse when only sha256Raw moved: the words did not move', () => {
    // Factory §4.3's raw-versus-normalized logic, one layer up. Cosmetic churn
    // that raises a trust alarm teaches everyone to ignore the alarm.
    const reissued = currentPins().map((p) =>
      p.docId === 'DOC-A' ? { ...p, sha256Raw: HASH('9') } : p,
    );
    const candidate = buildSignature(signatureInput({ corpus: reissued }));
    expect(() => assertSignable(candidate, checks())).not.toThrow();
    expect(candidate.advisories).toEqual(['source_reissued']);
  });

  it('records one advisory per reissued document, deduplicated and sorted', () => {
    const reissued = currentPins().map((p) => ({ ...p, sha256Raw: HASH('9') }));
    const candidate = buildSignature(signatureInput({ corpus: reissued }));
    expect(candidate.advisories).toEqual(['source_reissued']);
  });
});

// ---------------------------------------------------------------------------
// The refusal set — factory §4.5, verbatim
// ---------------------------------------------------------------------------

describe('the nine refusals', () => {
  it('refuses any MISMATCH verdict', () => {
    const r = result({
      challenges: [
        {
          id: 'C1',
          lens: 'threshold',
          statement: 'Is the threshold right?',
          verdict: 'MISMATCH',
          evidence: [
            {
              kind: 'quote',
              docId: 'DOC-B',
              sha256Normalized: corpus.document('DOC-B').sha256Normalized,
              text: 'substitutes the opening words',
            },
          ],
          resolution: 'The encoding states 450m; the law now states 40m.',
          adjudicationEvidence: [
            {
              kind: 'quote',
              docId: 'DOC-A',
              sha256Normalized: corpus.document('DOC-A').sha256Normalized,
              text: 'on their balance sheet dates',
            },
          ],
        },
      ],
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['mismatch']);
    expect(refusalDetail(candidate, checks({ result: r }))).toContain('C1');
  });

  it('refuses an outstanding open question', () => {
    const r = result({ openQuestions: [{ id: 'Q1', statement: 'Which balance sheet dates?' }] });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['open_question']);
    expect(refusalDetail(candidate, checks({ result: r }))).toContain('Q1');
  });

  it('refuses a challenge left at OPEN_QUESTION', () => {
    // An unadjudicated challenge is an outstanding OPEN_QUESTION item too. A
    // gate reading only `openQuestions[]` would sign over an argument the
    // adjudicator never settled.
    const r = result({
      challenges: [
        {
          id: 'C1',
          lens: 'measurement period',
          statement: 'Which dates does the threshold measure on?',
          verdict: 'OPEN_QUESTION',
          evidence: [
            {
              kind: 'quote',
              docId: 'DOC-A',
              sha256Normalized: corpus.document('DOC-A').sha256Normalized,
              text: 'on their balance sheet dates',
            },
          ],
          // An OPEN_QUESTION is still evidence-bound: this array is what
          // establishes that the record cannot settle the challenge.
          adjudicationEvidence: [
            {
              kind: 'quote',
              docId: 'DOC-B',
              sha256Normalized: corpus.document('DOC-B').sha256Normalized,
              text: 'substitutes the opening words',
            },
          ],
        },
      ],
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['open_question']);
    expect(refusalDetail(candidate, checks({ result: r }))).toContain('C1');
  });

  it('refuses a failing evidence check', () => {
    const r = result({
      reading: {
        elements: [
          {
            id: 'R1',
            statement: 'A large undertaking must report.',
            evidence: [
              {
                kind: 'quote',
                docId: 'DOC-A',
                sha256Normalized: corpus.document('DOC-A').sha256Normalized,
                text: 'a net turnover of EUR 40 000 000',
              },
              { kind: 'absence', docIds: ['DOC-B'], term: 'value added tax' },
            ],
          },
        ],
      },
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['evidence_failed']);
    expect(refusalDetail(candidate, checks({ result: r }))).toMatch(/not found in DOC-A/);
  });

  /**
   * The adjudication's own evidence, at the gate that actually runs.
   *
   * These are **run-level** checks, not direct calls: they go through
   * `assertSignable`, which is the only production entry point that reaches
   * `assertResultConsistency` and `checkEvidenceSet` at all. Removing either
   * call from `assertSignable` must redden something here — a rule the sign
   * gate never invokes is a comment, whatever its own unit tests say.
   *
   * Every fixture keeps E-P and E-A on different documents with different
   * words, so a refusal naming one array is evidence that the gate read *that*
   * array and not the other.
   */
  it('refuses an adjudicationEvidence set that is nothing but absence claims', () => {
    // Through the sign gate, so this fails if `assertSignable` stops calling
    // `assertResultConsistency`. The prosecutor's `evidence` is impeccable, so
    // nothing but the second array can be producing the refusal.
    const r = result({
      challenges: [
        {
          id: 'C1',
          lens: 'threshold',
          statement: 'Is the turnover threshold EUR 450 000 000?',
          verdict: 'CONFIRMED',
          evidence: [
            {
              kind: 'quote',
              docId: 'DOC-B',
              sha256Normalized: corpus.document('DOC-B').sha256Normalized,
              text: 'substitutes the opening words',
            },
          ],
          resolution: 'The threshold is as encoded.',
          adjudicationEvidence: [{ kind: 'absence', docIds: ['DOC-B'], term: 'value added tax' }],
        },
      ],
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    // Two gates catch this independently and both are asserted: the record
    // contract (`invalid_result`, from `assertResultConsistency`) and the
    // corpus re-check (`evidence_failed`, from `checkEvidenceSet`). Asserting
    // the pair rather than one of them is deliberate — either call being
    // dropped from `assertSignable` loses its code here, so neither can hide
    // behind the other.
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual([
      'evidence_failed',
      'invalid_result',
    ]);
    const detail = refusalDetail(candidate, checks({ result: r }));
    expect(detail).toContain('invalid_result');
    expect(detail).toContain('adjudicationEvidence');
    expect(detail).toContain('absence');
    // The prosecutor's array is not implicated, which is what tells the signer
    // which of the two producers has to repair its work.
    expect(detail).not.toContain('(C1).evidence:');
  });

  it('refuses an adjudicationEvidence quote that cannot be re-found in the corpus', () => {
    // The other production call: `checkEvidenceSet` over the corpus on disk.
    // The prosecutor's quote is real; only the adjudicator's is invented, so a
    // gate that checked `evidence` alone would sign this.
    const r = result({
      challenges: [
        {
          id: 'C1',
          lens: 'threshold',
          statement: 'Is the turnover threshold EUR 450 000 000?',
          verdict: 'CONFIRMED',
          evidence: [
            {
              kind: 'quote',
              docId: 'DOC-B',
              sha256Normalized: corpus.document('DOC-B').sha256Normalized,
              text: 'substitutes the opening words',
            },
          ],
          resolution: 'The threshold is as encoded.',
          adjudicationEvidence: [
            {
              kind: 'quote',
              docId: 'DOC-A',
              sha256Normalized: corpus.document('DOC-A').sha256Normalized,
              text: 'a sentence this directive does not contain',
            },
          ],
        },
      ],
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['evidence_failed']);
    const detail = refusalDetail(candidate, checks({ result: r }));
    expect(detail).toMatch(/not found in DOC-A/);
    // Named as the adjudication rather than as the challenge, so the signer
    // repairs the right array.
    expect(detail).toContain('challenge C1 adjudication');
  });

  it('names the bare challenge when it is the PROSECUTOR quote that cannot be re-found', () => {
    // The mirror of the case above, and the assertion the two labels need in
    // order to be a *pair*. `challenge C1 adjudication` was pinned exactly and
    // `challenge C1` was not, so the prosecutor label could have drifted — to
    // `challenge C1 prosecution`, or to a bare id — with every test green,
    // while Task 3.5's whole point is that the two are distinguishable and both
    // say which producer must repair its work.
    //
    // The trailing colon is load-bearing: it is the separator `refuse` writes
    // after the label, and without it `toContain('challenge C1')` would be
    // satisfied by the adjudication label, which carries the bare one as a
    // prefix. That is the assertion-satisfied-unconditionally trap in one
    // substring.
    const r = result({
      challenges: [
        {
          id: 'C1',
          lens: 'threshold',
          statement: 'Is the turnover threshold EUR 450 000 000?',
          verdict: 'CONFIRMED',
          evidence: [
            {
              kind: 'quote',
              docId: 'DOC-B',
              sha256Normalized: corpus.document('DOC-B').sha256Normalized,
              text: 'a sentence this amending directive does not contain',
            },
          ],
          resolution: 'The threshold is as encoded.',
          adjudicationEvidence: [
            {
              kind: 'quote',
              docId: 'DOC-A',
              sha256Normalized: corpus.document('DOC-A').sha256Normalized,
              text: 'a net turnover of EUR 450 000 000',
            },
          ],
        },
      ],
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['evidence_failed']);
    const detail = refusalDetail(candidate, checks({ result: r }));
    expect(detail).toMatch(/not found in DOC-B/);
    expect(detail).toContain('challenge C1: ');
    // And the adjudicator's array is not implicated: its quote is sound, so a
    // gate that labelled both sets the same way would fail here.
    expect(detail).not.toContain('challenge C1 adjudication');
  });

  it('signs a challenge whose two evidence arrays are both sound and distinct', () => {
    // The positive control for the two refusals above. Without it they would
    // pass equally against a gate that refused every challenge with two
    // arrays, or one that never looked at `adjudicationEvidence` and was
    // refusing for some unrelated reason.
    const r = result();
    const challenge = r.challenges[0];
    expect(challenge?.adjudicationEvidence).toHaveLength(1);
    expect(challenge?.adjudicationEvidence).not.toEqual(challenge?.evidence);
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual([]);
  });

  it('refuses a failing absence re-search', () => {
    // The absence claim is the item that would otherwise be pure assertion;
    // re-running the search is what makes it checkable.
    const r = result({
      reading: {
        elements: [
          {
            id: 'R1',
            statement: 'A large undertaking must report.',
            evidence: [
              {
                kind: 'quote',
                docId: 'DOC-A',
                sha256Normalized: corpus.document('DOC-A').sha256Normalized,
                text: 'a net turnover of EUR 450 000 000',
              },
              { kind: 'absence', docIds: ['DOC-B'], term: 'substitutes the opening words' },
            ],
          },
        ],
      },
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['evidence_failed']);
    expect(refusalDetail(candidate, checks({ result: r }))).toMatch(/is not absent/);
  });

  it('refuses an unresolved corpus_gap', () => {
    const r = haltedResult({
      gaps: [{ kind: 'corpus_gap', docId: 'DOC-Z', detail: 'the consolidating act is not held' }],
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['unresolved_gap']);
    expect(refusalDetail(candidate, checks({ result: r }))).toContain('corpus_gap');
  });

  it('refuses an unresolved closure_gap', () => {
    // Distinct from a corpus gap, and reported as itself: collapsing the two
    // would hide the population B3 counts to judge the traversal bound.
    const r = haltedResult({
      gaps: [{ kind: 'closure_gap', docId: 'DOC-B', detail: 'reachable but not entitled' }],
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['unresolved_gap']);
    expect(refusalDetail(candidate, checks({ result: r }))).toContain('closure_gap');
  });

  it('refuses a corpus_gap that names a source rather than a document, saying so', () => {
    // The gap shape B2's first producer actually found: `sources[]` resolving
    // to no document at all. There is no missing file to name, and the refusal
    // has to say which register the signer must go and fix — a message reading
    // `corpus_gap on undefined` would be the old shape leaking through.
    const r = haltedResult({
      gaps: [{ kind: 'corpus_gap', sourceId: 'SRC-005', detail: 'no document in the corpus serves it' }],
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['unresolved_gap']);
    const detail = refusalDetail(candidate, checks({ result: r }));
    expect(detail).toContain('sourceId SRC-005');
    expect(detail).not.toContain('undefined');
    // The counterexample in the same suite: a document-identified gap still
    // says `docId`, so the branch above is not printing one label for both.
    const byDoc = haltedResult({ gaps: [{ kind: 'corpus_gap', docId: 'DOC-Z', detail: 'not held' }] });
    expect(refusalDetail(buildSignature(signatureInput({ result: byDoc })), checks({ result: byDoc }))).toContain(
      'docId DOC-Z',
    );
  });

  it('refuses a gap that names no identity as invalid_result, and prints no undefined', () => {
    // The consistency pass rejects it, and the refusal loop still runs over it.
    const r = haltedResult({ gaps: [{ kind: 'corpus_gap', detail: 'something is missing' }] });
    const candidate = buildSignature(signatureInput({ result: r }));
    const codes = refusalCodes(candidate, checks({ result: r }));
    expect(codes).toContain('invalid_result');
    expect(codes).toContain('unresolved_gap');
    expect(refusalDetail(candidate, checks({ result: r }))).not.toContain('undefined');
  });

  it('refuses a gap whose docId is really a source id, naming the register violation', () => {
    // The lie schema 1.1.0 exists to remove, checked at the one place whose job
    // is to refuse a result that lies about itself. Cardinality alone cannot
    // catch it — `docId: 'SRC-005'` names exactly one identity — so this passes
    // only if the gate consulted the two registers.
    const r = haltedResult({ gaps: [{ kind: 'corpus_gap', docId: 'SRC-005', detail: 'no document serves it' }] });
    const candidate = buildSignature(signatureInput({ result: r }));
    const c = checks({ result: r });
    expect(refusalCodes(candidate, c)).toEqual(['invalid_result', 'unresolved_gap']);
    const detail = refusalDetail(candidate, c);
    expect(detail).toContain('invalid_result');
    expect(detail).toContain('names an entry in the source register');
    expect(detail).toContain('SRC-005');
  });

  it('does not raise invalid_result when the same source is recorded as a sourceId', () => {
    // The positive control for the case above. The gate still refuses — every
    // outstanding gap does — but it refuses as `unresolved_gap` only, so the
    // register violation above is the register rule firing rather than a gap
    // being present.
    const r = haltedResult({ gaps: [{ kind: 'corpus_gap', sourceId: 'SRC-005', detail: 'no document serves it' }] });
    const candidate = buildSignature(signatureInput({ result: r }));
    const c = checks({ result: r });
    expect(refusalCodes(candidate, c)).toEqual(['unresolved_gap']);
    expect(refusalDetail(candidate, c)).not.toContain('source register');
  });

  it('refuses a closure_gap over a document the corpus does not hold', () => {
    // The document register the gate uses is `corpus.index` itself, not a list
    // handed in beside it, so this cannot pass over a corpus the gate is not
    // also re-finding every quote against.
    const r = haltedResult({ gaps: [{ kind: 'closure_gap', docId: 'DOC-Z', detail: 'not entitled' }] });
    const candidate = buildSignature(signatureInput({ result: r }));
    const c = checks({ result: r });
    expect(refusalCodes(candidate, c)).toEqual(['invalid_result', 'unresolved_gap']);
    expect(refusalDetail(candidate, c)).toContain('the corpus index does not hold');
    // And the counterexample in the same suite: DOC-B is held, so the same
    // shape over a real document raises no `invalid_result`.
    const held = haltedResult({ gaps: [{ kind: 'closure_gap', docId: 'DOC-B', detail: 'not entitled' }] });
    expect(
      refusalCodes(buildSignature(signatureInput({ result: held })), checks({ result: held })),
    ).toEqual(['unresolved_gap']);
  });

  it('refuses a structurally invalid result', () => {
    const candidate = buildSignature(signatureInput());
    const broken = { ...result(), resultSchemaVersion: '2.0.0' } as unknown as VerificationResult;
    expect(refusalCodes(candidate, checks({ result: broken }))).toContain('invalid_result');
  });

  it('refuses a result that is structurally valid but internally inconsistent', () => {
    // `resultSha256` deliberately does not re-check consistency, so a record
    // can be hashed, and therefore signed over, while contradicting itself.
    const r = result({
      coverage: {
        cells: [
          {
            direction: 'reading_to_condition',
            readingElementId: 'R1',
            conditionPath: '$',
            verdict: 'UNMAPPED',
          },
        ],
      },
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual(['invalid_result']);
    expect(refusalDetail(candidate, checks({ result: r }))).toMatch(/challengeId/);
  });

  it('refuses a red test suite', () => {
    const candidate = buildSignature(signatureInput());
    expect(refusalCodes(candidate, checks({ testSuiteGreen: false }))).toEqual(['red_suite']);
  });

  it('refuses a pipelineVersion with no promotion record', () => {
    const candidate = buildSignature(signatureInput());
    const c = checks({ promotions: [] });
    expect(refusalCodes(candidate, c)).toEqual(['unpromoted_pipeline']);
    expect(refusalDetail(candidate, c)).toContain('pipeline-1.0.0');
  });

  it('refuses a pipelineVersion promoted only under a different name', () => {
    const candidate = buildSignature(signatureInput());
    const c = checks({
      promotions: [{ pipelineVersion: 'pipeline-2.0.0', by: 'A. Promoter', on: '2026-08-01' }],
    });
    expect(refusalCodes(candidate, c)).toEqual(['unpromoted_pipeline']);
  });

  it('refuses a release candidate of a promoted version', () => {
    // The gate must resolve the version exactly, and must do it *through*
    // `isPromoted`. A comparison written here with `startsWith` — or any other
    // near-match — promotes `pipeline-1.0.0-rc1` on the strength of the record
    // for the release it has not become, and the two tests above cannot see
    // the difference because neither version is a prefix of the other.
    const r = result({ pipelineVersion: 'pipeline-1.0.0-rc1' });
    const candidate = buildSignature(signatureInput({ result: r }));
    const c = checks({ result: r });
    expect(refusalCodes(candidate, c)).toEqual(['unpromoted_pipeline']);
    expect(refusalDetail(candidate, c)).toContain('pipeline-1.0.0-rc1');
  });

  it('reports two simultaneous refusals, not the first', () => {
    // Refusal is the feature. A signer fixing one thing at a time learns the
    // next problem only after re-running, which is one wasted cycle per defect.
    const candidate = buildSignature(signatureInput());
    const c = checks({ testSuiteGreen: false, promotions: [] });
    expect(refusalCodes(candidate, c)).toEqual(['red_suite', 'unpromoted_pipeline']);
  });

  it('reports two refusals arising from the result itself', () => {
    // `open_question` and `unresolved_gap` cannot co-occur any more, and that is
    // a property rather than an inconvenience: a gap means agent verification
    // stopped, so there is no completed dossier to hold an outstanding
    // question, while an `OPEN_QUESTION` is precisely a *complete* surface that
    // did not settle a proposition. So the pair here is the open question and a
    // failing evidence check — both borne by the result, neither borrowed from
    // the world around it.
    const r = result({
      openQuestions: [{ id: 'Q1', statement: 'Which balance sheet dates?' }],
      reading: {
        elements: [
          {
            id: 'R1',
            statement: 'A large undertaking must report.',
            evidence: [
              {
                kind: 'quote',
                docId: 'DOC-A',
                sha256Normalized: corpus.document('DOC-A').sha256Normalized,
                text: 'a net turnover of EUR 40 000 000',
              },
              { kind: 'absence', docIds: ['DOC-B'], term: 'value added tax' },
            ],
          },
        ],
      },
    });
    const candidate = buildSignature(signatureInput({ result: r }));
    expect(refusalCodes(candidate, checks({ result: r }))).toEqual([
      'evidence_failed',
      'open_question',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Integrity failure — a separate category, per factory §4.4
// ---------------------------------------------------------------------------

describe('integrity failure', () => {
  function existingEntry(overrides: Partial<SigningEntry> = {}): SigningEntry {
    const unsigned: Omit<SigningEntry, 'entryId'> = {
      kind: 'verified',
      packId: 'testpack',
      packVersion: '2026.1',
      requirementId: 'REQ-001',
      requirementVersion: 1,
      requirementSha256: HASH('a'),
      requirementInputSha256: HASH('b'),
      conditionSha256: HASH('c'),
      renderedConditionSha256: RENDERED,
      rendererVersion: 'renderer-1.1.0',
      closureRendererVersion: 'closure-renderer-1.0.0',
      corpusClosureSha256: CLOSURE,
      corpus: currentPins(),
      resultSha256: HASH('1'),
      pipelineVersion: 'pipeline-1.0.0',
      by: 'A. Reviewer',
      on: '2026-01-01',
      ...overrides,
    } as Omit<SigningEntry, 'entryId'>;
    return { ...unsigned, entryId: entryId(unsigned) };
  }

  it('raises INTEGRITY_FAILURE, not a refusal, for a missing pinned result', () => {
    // A signed artefact cannot vanish through ordinary drift in an append-only
    // git-tracked repository. Filing it beside "the law changed" would
    // understate it.
    const candidate = buildSignature(signatureInput());
    const c = checks({ existing: { entry: existingEntry(), resultPresent: false } });
    let thrown: unknown;
    try {
      assertSignable(candidate, c);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IntegrityFailureError);
    expect((thrown as IntegrityFailureError).category).toBe('integrity_failure');
    expect(refusalCodes(candidate, c)).toEqual(['integrity_failure']);
    expect(refusalDetail(candidate, c)).toMatch(/result/i);
  });

  it('raises INTEGRITY_FAILURE for a document pinned by an existing entry that has vanished', () => {
    const gone = existingEntry({
      corpus: [
        ...currentPins(),
        {
          docId: 'DOC-GONE',
          versionLabel: 'v1',
          sha256Raw: HASH('2'),
          sha256Normalized: HASH('3'),
          normalizerVersion: NORMALIZER_VERSION,
          artefactAuthenticity: 'official_consolidation',
          nonOperativeSections: [],
          sources: [{ sourceId: 'SRC-001', temporalStanding: 'in_force' }],
        },
      ],
    });
    const candidate = buildSignature(signatureInput());
    const c = checks({ existing: { entry: gone, resultPresent: true } });
    expect(refusalCodes(candidate, c)).toEqual(['integrity_failure']);
    expect(refusalDetail(candidate, c)).toContain('DOC-GONE');
  });

  it('is distinguishable from an ordinary refusal by class and by category', () => {
    // Task 4 maps these onto distinct exit codes: a caller scripting the CLI
    // must be able to tell "you may not sign this yet" from "this repository
    // is damaged". `category` is what makes that a switch rather than an
    // ordered chain of `instanceof` checks.
    const candidate = buildSignature(signatureInput());
    let refusal: unknown;
    try {
      assertSignable(candidate, checks({ testSuiteGreen: false }));
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(RefusalError);
    expect(refusal).not.toBeInstanceOf(IntegrityFailureError);
    expect((refusal as RefusalError).category).toBe('refusal');
  });

  it('reports ordinary refusals alongside an integrity failure', () => {
    const candidate = buildSignature(signatureInput());
    const c = checks({
      existing: { entry: existingEntry(), resultPresent: false },
      testSuiteGreen: false,
    });
    expect(refusalCodes(candidate, c)).toEqual(['integrity_failure', 'red_suite']);
  });
});

// ---------------------------------------------------------------------------
// The version registry — keyed by string, typed as a number
// ---------------------------------------------------------------------------

describe('the version registry lookup', () => {
  it('resolves a requirement signed at version 2', () => {
    // `requirementVersion` is a `number` on the requirement, the result and the
    // ledger entry, while `verification/requirement-versions/<packId>.json`
    // keys by string. The lookup needs a deliberate `String(version)`; an
    // implementation that keeps the version in a Map or compares keys strictly
    // reports a missing registration here instead of resolving.
    const req = requirement({ version: 2 });
    const r = result({ requirementVersion: 2 });
    const candidate = buildSignature(signatureInput({ requirement: req, result: r }));
    expect(candidate.entry.requirementVersion).toBe(2);
    const c = checks({ result: r, registry: registryFor(req) });
    expect(() => assertSignable(candidate, c)).not.toThrow();
  });

  it('raises INTEGRITY_FAILURE when the declared version is not registered', () => {
    const req = requirement({ version: 2 });
    const r = result({ requirementVersion: 2 });
    const candidate = buildSignature(signatureInput({ requirement: req, result: r }));
    const c = checks({ result: r, registry: registryFor(requirement()) });
    expect(refusalCodes(candidate, c)).toEqual(['integrity_failure']);
    expect(refusalDetail(candidate, c)).toMatch(/version 2/);
  });

  it('raises INTEGRITY_FAILURE when the registered hash names other content', () => {
    const candidate = buildSignature(signatureInput());
    const c = checks({ registry: { 'REQ-001': { '1': HASH('a') } } });
    expect(refusalCodes(candidate, c)).toEqual(['integrity_failure']);
    expect(refusalDetail(candidate, c)).toMatch(/registry/i);
  });
});
