/**
 * The edge seam — an edge id the closure does not list is refused at its
 * role, before the next role launches.
 *
 * Why this file exists: the fourth genuine S-002 capture (2026-10-19, r4,
 * `CHECKPOINT-opus55-s002-capture-r4.md`) returned a reading whose
 * `amendment_chain` named three edge ids and whose `cross_reference` named a
 * fourth, none of which the corpus holds. Every role seam passed — the seams
 * checked each quote's docId and hash (`quote-pins.ts`) and nothing checked an
 * edge — so seven prosecutors and the adjudicator ran over that reading, nine
 * launches were spent, and only the record boundary's `checkEvidenceSet`
 * refused, as "evidence failed" in the filed record. The seam under test here
 * applies the gate's own edge rules (`corpus/evidence.ts`,
 * `edgeReferenceProblems`) over the entitled closure's edge list, at the
 * moment each role's output arrives.
 *
 * Three kinds of check, as TEST-EVIDENCE-STANDARD asks:
 *
 *  - **the predicate, called directly**, over the fixture closure and over a
 *    plain edge list the fixture corpus could never produce (failure mode #4),
 *    so each rule — entitlement, kind, endpoints, continuity — can fail alone;
 *  - **the r4 shapes, ids verbatim**, so the defect that was observed is the
 *    defect that is refused;
 *  - **through `runVerificationPipeline`**, with a runner that records every
 *    request, so "before the next role launches" is a count of launches and
 *    not a claim.
 *
 * Every quote in this file carries its document's real fixture pin: the quote
 * gate runs before the edge gate, and a test here must be refused by the edge
 * gate and nothing earlier.
 */

import { describe, expect, it } from 'vitest';
import type { EvidenceItem, QuoteEvidence } from '../src/corpus/evidence';
import { sha256Hex } from '../src/corpus/hash';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import {
  assertAdjudicatorEdgesEntitled,
  assertProsecutorEdgesEntitled,
  assertReaderEdgesEntitled,
  edgeReferenceSeamProblems,
  ENTITLED_EDGE_SCOPE,
  type EdgeReferenceSource,
} from '../src/pipeline/edge-references';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import { loadPromptSet } from '../src/pipeline/prompts';
import { qualifiedChallengeId } from '../src/pipeline/prosecutors';
import type { AdjudicatorOutput, ProsecutorOutput, ReaderOutput } from '../src/pipeline/role-outputs';
import { RoleOutputError } from '../src/pipeline/roles';
import {
  docText,
  fixtureAuthorisedCorpus,
  fixtureRegister,
  fixtureRenderContext,
  fixtureRequirement,
  fixtureSourceUniverse,
  lensFromRequest,
  stubProsecutorOutput,
  stubReaderOutput,
  stubRunner,
} from './pipeline-fixtures';

// ---------------------------------------------------------------------------
// The fixture world: SRC-100's closure is {DOC-A, DOC-B, DOC-C} with two
// edges, E-1 (amendedBy, DOC-A -> DOC-B) and E-2 (references, DOC-A -> DOC-C).
// E-3 (references, DOC-C -> DOC-D) is held by the corpus and outside the
// closure, because DOC-D is: the case "the corpus holds it, the role was not
// shown it".
// ---------------------------------------------------------------------------

const corpus = fixtureAuthorisedCorpus();
function fixtureClosure(): EntitledClosure {
  return EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']);
}

const PIN = (docId: string): string => sha256Hex(docText(docId));
/** A well-formed SHA-256 that is no fixture document's pin. */
const WRONG = '5c'.repeat(32);
const TEXT = 'The operative test is stated here.';

function quote(docId: string, sha256Normalized: string = PIN(docId), text: string = TEXT): QuoteEvidence {
  return { kind: 'quote', docId, sha256Normalized, text };
}
function hop(edgeId: string, docId: string): { edgeId: string; quote: QuoteEvidence } {
  return { edgeId, quote: quote(docId) };
}
function chain(...hops: Array<{ edgeId: string; quote: QuoteEvidence }>): EvidenceItem {
  return { kind: 'amendment_chain', hops };
}
function cross(edgeId: string, from: string, to: string): EvidenceItem {
  return { kind: 'cross_reference', edgeId, from: quote(from), to: quote(to) };
}

function readerWith(evidence: EvidenceItem[], id = 'RE-STUB'): ReaderOutput {
  return { elements: [{ id, statement: 'FIXTURE: a placeholder proposition.', evidence }], gaps: [] };
}
function prosecutorWith(lens: string, evidence: EvidenceItem[]): ProsecutorOutput {
  return {
    ...stubProsecutorOutput(lens),
    challenges: [{ id: 'C1-fixture', lens, statement: 'FIXTURE: a placeholder challenge.', evidence }],
  };
}
/** The challenge `prosecutorWith` raises as prosecutor 0, under the id the adjudicator is shown. */
const RAISED = qualifiedChallengeId(0, 'C1-fixture');
function adjudicatorWith(evidence: EvidenceItem[], challengeId: string = RAISED): AdjudicatorOutput {
  return {
    adjudications: [{ challengeId, verdict: 'CONFIRMED', resolution: 'FIXTURE: confirmed.', evidence }],
    gaps: [],
  };
}

function caught(fn: () => unknown): RoleOutputError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RoleOutputError);
    return error as RoleOutputError;
  }
  throw new Error('expected a RoleOutputError, and nothing was thrown');
}
async function rejection(promise: Promise<unknown>): Promise<RoleOutputError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RoleOutputError);
    return error as RoleOutputError;
  }
  throw new Error('expected the promise to reject with a RoleOutputError, and it resolved');
}

/**
 * The four ids r4's reader wrote, verbatim, from the sealed record
 * (`20261019T090314Z-b34711`, reading elements E9 and E16). None exists in
 * any corpus; each is composed from article numbers and document ids.
 */
const R4_HOP_IDS = [
  'DOC-32026L0470:Art2(5)(a)->DOC-32013L0034:Art29a(1)-sub1',
  'DOC-32026L0470:Art2(5)(a)-replacement-text',
  'DOC-32013L0034:M8-consolidation-Art29a(1)',
] as const;
const R4_CROSS_ID = 'DOC-32013L0034:Art3(13)(b)->DOC-32013L0034:Art29a(1)-sub1';

/** r4's two failing elements, with the quotes re-pinned to the fixture closure so only the edge gate can refuse them. */
function r4ShapedReader(): ReaderOutput {
  return {
    elements: [
      {
        id: 'E9-amendment-chain',
        statement: 'FIXTURE: the shape of r4 element E9, not its words.',
        evidence: [chain(hop(R4_HOP_IDS[0], 'DOC-B'), hop(R4_HOP_IDS[1], 'DOC-B'), hop(R4_HOP_IDS[2], 'DOC-A')), quote('DOC-A')],
      },
      {
        id: 'E16-threshold-inflation-review',
        statement: 'FIXTURE: the shape of r4 element E16, not its words.',
        evidence: [cross(R4_CROSS_ID, 'DOC-A', 'DOC-A')],
      },
    ],
    gaps: [],
  };
}

// ---------------------------------------------------------------------------
// 1. The predicate, directly
// ---------------------------------------------------------------------------

describe('each role seam refuses an edge id the entitled closure does not list, and applies the gate\'s rules to the ones it does', () => {
  const closure = fixtureClosure();

  it('the fixture closure lists E-1 and E-2 and not E-3 — or nothing below can tell "unlisted" from "nonexistent"', () => {
    expect(closure.edges.map((edge) => edge.edgeId)).toEqual(['E-1', 'E-2']);
    expect(corpus.index.documents.some((document) => document.edges.some((edge) => edge.edgeId === 'E-3'))).toBe(true);
  });

  it('reader: a hop on an edge the corpus holds but the closure does not list is refused naming the id and the closure; so is an id nothing holds', () => {
    const outside = caught(() => assertReaderEdgesEntitled(readerWith([chain(hop('E-3', 'DOC-C'))]), closure));
    expect(outside.role).toBe('reader');
    expect(outside.index).toBe(0);
    expect(outside.problems).toEqual([
      `elements[0] (RE-STUB).evidence[0].hops[0]: names edge E-3, which ${ENTITLED_EDGE_SCOPE} does not hold`,
    ]);
    const invented = caught(() => assertReaderEdgesEntitled(readerWith([chain(hop('NOT-AN-EDGE', 'DOC-A'))]), closure));
    expect(invented.problems).toEqual([
      `elements[0] (RE-STUB).evidence[0].hops[0]: names edge NOT-AN-EDGE, which ${ENTITLED_EDGE_SCOPE} does not hold`,
    ]);
  });

  it('the scope names the section the role was shown', () => {
    expect(ENTITLED_EDGE_SCOPE).toBe('the entitled closure (the ids listed under # Entitled relationships)');
  });

  it('kind: a hop on a references edge, and a cross-reference on an amendment edge, are refused for their kind', () => {
    expect(caught(() => assertReaderEdgesEntitled(readerWith([chain(hop('E-2', 'DOC-A'))]), closure)).problems).toEqual([
      'elements[0] (RE-STUB).evidence[0].hops[0]: edge E-2 is a references edge; an amendment_chain hop must rest on an amends or amendedBy edge',
    ]);
    expect(caught(() => assertReaderEdgesEntitled(readerWith([cross('E-1', 'DOC-A', 'DOC-B')]), closure)).problems).toEqual([
      'elements[0] (RE-STUB).evidence[0]: edge E-1 is a amendedBy edge; a cross_reference must rest on a references edge',
    ]);
  });

  it('endpoints: a hop quoting a document that is neither end of its edge, and a cross-reference whose edge does not connect its two quotes, are refused', () => {
    expect(caught(() => assertReaderEdgesEntitled(readerWith([chain(hop('E-1', 'DOC-C'))]), closure)).problems).toEqual([
      'elements[0] (RE-STUB).evidence[0].hops[0]: quote is taken from DOC-C, which is neither endpoint of edge E-1 (DOC-A -> DOC-B)',
    ]);
    expect(caught(() => assertReaderEdgesEntitled(readerWith([cross('E-2', 'DOC-C', 'DOC-A')]), closure)).problems).toEqual([
      'elements[0] (RE-STUB).evidence[0]: edge E-2 does not connect DOC-C to DOC-A',
    ]);
  });

  it('continuity, over a plain edge list the fixture corpus cannot produce: a chain walked either way passes, a shared amender that succeeds nothing is refused', () => {
    const amendments: EdgeReferenceSource = {
      edges: [
        { edgeId: 'X1', kind: 'amends', from: 'DOC-B', to: 'DOC-A' },
        { edgeId: 'X2', kind: 'amends', from: 'DOC-C', to: 'DOC-B' },
        { edgeId: 'X6', kind: 'amendedBy', from: 'DOC-D', to: 'DOC-B' },
      ],
    };
    const sets = (item: EvidenceItem) => [{ label: 'elements[0] (RE-STUB).evidence', items: [item] }];
    expect(edgeReferenceSeamProblems(sets(chain(hop('X1', 'DOC-B'), hop('X2', 'DOC-C'))), amendments)).toEqual([]);
    expect(edgeReferenceSeamProblems(sets(chain(hop('X2', 'DOC-C'), hop('X1', 'DOC-B'))), amendments)).toEqual([]);
    const broken = edgeReferenceSeamProblems(sets(chain(hop('X1', 'DOC-B'), hop('X6', 'DOC-D'))), amendments);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toContain('elements[0] (RE-STUB).evidence[0].hops[1]: edge X6');
    expect(broken[0]).toContain('does not continue the amendment chain from X1');
  });

  it('positive control: listed ids used as the rules require pass all three gates, and each output comes back unchanged', () => {
    const items = [chain(hop('E-1', 'DOC-B')), cross('E-2', 'DOC-A', 'DOC-C'), quote('DOC-A')];
    const reader = readerWith(items);
    const prosecutor = prosecutorWith('missing_criterion', items);
    const adjudicator = adjudicatorWith(items);
    expect(assertReaderEdgesEntitled(reader, closure)).toBe(reader);
    expect(assertProsecutorEdgesEntitled(prosecutor, closure, 3)).toBe(prosecutor);
    expect(assertAdjudicatorEdgesEntitled(adjudicator, closure)).toBe(adjudicator);
  });

  it('this gate reads no quote: a listed edge whose hop quote carries a wrong hash passes it — the hash is the quote gate\'s question, asked first', () => {
    const output = readerWith([{ kind: 'amendment_chain', hops: [{ edgeId: 'E-1', quote: quote('DOC-B', WRONG) }] }]);
    expect(assertReaderEdgesEntitled(output, closure)).toBe(output);
  });

  it('the r4 shapes, ids verbatim: exactly four problems, one per invented id, under the paths the record would report', () => {
    const error = caught(() => assertReaderEdgesEntitled(r4ShapedReader(), closure));
    expect(error.role).toBe('reader');
    expect(error.problems).toEqual([
      `elements[0] (E9-amendment-chain).evidence[0].hops[0]: names edge ${R4_HOP_IDS[0]}, which ${ENTITLED_EDGE_SCOPE} does not hold`,
      `elements[0] (E9-amendment-chain).evidence[0].hops[1]: names edge ${R4_HOP_IDS[1]}, which ${ENTITLED_EDGE_SCOPE} does not hold`,
      `elements[0] (E9-amendment-chain).evidence[0].hops[2]: names edge ${R4_HOP_IDS[2]}, which ${ENTITLED_EDGE_SCOPE} does not hold`,
      `elements[1] (E16-threshold-inflation-review).evidence[0]: names edge ${R4_CROSS_ID}, which ${ENTITLED_EDGE_SCOPE} does not hold`,
    ]);
  });

  it('prosecutor: refused under challenges[i] (id).evidence[j], with the prosecutor\'s own index', () => {
    const error = caught(() => assertProsecutorEdgesEntitled(prosecutorWith('wrong_conjunction', [cross('NOT-AN-EDGE', 'DOC-A', 'DOC-C')]), closure, 4));
    expect(error.role).toBe('prosecutor');
    expect(error.index).toBe(4);
    expect(error.problems[0]).toBe(`challenges[0] (C1-fixture).evidence[0]: names edge NOT-AN-EDGE, which ${ENTITLED_EDGE_SCOPE} does not hold`);
  });

  it('adjudicator: refused under adjudications[i] (challengeId).evidence[j]', () => {
    const error = caught(() => assertAdjudicatorEdgesEntitled(adjudicatorWith([chain(hop('E-3', 'DOC-C'))]), closure));
    expect(error.role).toBe('adjudicator');
    expect(error.problems[0]).toBe(`adjudications[0] (${RAISED}).evidence[0].hops[0]: names edge E-3, which ${ENTITLED_EDGE_SCOPE} does not hold`);
  });
});

// ---------------------------------------------------------------------------
// 2. Through runVerificationPipeline: the run stops at the role, before the
//    next launch — counted, not claimed
// ---------------------------------------------------------------------------

describe('FIXTURE — through runVerificationPipeline, an unlisted edge id stops the run at its own role, before the next role launches', () => {
  const requirement = fixtureRequirement();
  const prompts = loadPromptSet();

  function input(runner: ReturnType<typeof stubRunner>) {
    return {
      packId: 'testpack',
      requirementId: requirement.id,
      requirement,
      renderContext: fixtureRenderContext(),
      closure: fixtureClosure(),
      corpus,
      prompts,
      config: { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 2 },
      runner,
    };
  }

  /** A runner answering every role validly, with the overrides a case needs. */
  function runnerWith(over: {
    reader?: ReaderOutput;
    prosecutor?: (index: number, lens: string) => ProsecutorOutput;
    adjudicator?: AdjudicatorOutput;
  }) {
    return stubRunner((request) => {
      if (request.role === 'reader') return JSON.stringify(over.reader ?? stubReaderOutput());
      if (request.role === 'prosecutor') {
        const lens = lensFromRequest(request);
        return JSON.stringify(
          over.prosecutor?.(request.index, lens) ?? (request.index === 0 ? prosecutorWith(lens, [quote('DOC-A')]) : stubProsecutorOutput(lens)),
        );
      }
      return JSON.stringify(over.adjudicator ?? adjudicatorWith([quote('DOC-B')]));
    });
  }

  const launched = (runner: ReturnType<typeof stubRunner>) => runner.requests.map((request) => `${request.role}[${request.index}]`);

  it('positive control: listed ids at every role run reader, two prosecutors and the adjudicator, and the record carries the edge evidence as returned', async () => {
    const runner = runnerWith({
      reader: readerWith([chain(hop('E-1', 'DOC-B')), quote('DOC-A')]),
      prosecutor: (index, lens) => (index === 0 ? prosecutorWith(lens, [cross('E-2', 'DOC-A', 'DOC-C')]) : stubProsecutorOutput(lens)),
      adjudicator: adjudicatorWith([chain(hop('E-1', 'DOC-A'))]),
    });
    const outcome = await runVerificationPipeline(input(runner));
    expect(launched(runner)).toEqual(['reader[0]', 'prosecutor[0]', 'prosecutor[1]', 'adjudicator[0]']);
    expect(outcome.halted).toBe(false);
    const challenge = outcome.adjudication?.challenges.find((c) => c.id === RAISED);
    expect(challenge?.evidence[0]).toMatchObject({ kind: 'cross_reference', edgeId: 'E-2' });
    expect(challenge?.adjudicationEvidence[0]).toMatchObject({ kind: 'amendment_chain' });
  });

  it('the r4 shape: the reader is refused at its seam with the four ids, and no prosecutor launches', async () => {
    const runner = runnerWith({ reader: r4ShapedReader() });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('reader');
    expect(error.problems).toHaveLength(4);
    for (const id of [...R4_HOP_IDS, R4_CROSS_ID]) expect(error.problems.join('\n')).toContain(`names edge ${id}, which`);
    expect(launched(runner)).toEqual(['reader[0]']);
  });

  it('an unlisted edge in prosecutor[0]\'s challenge stops the run before prosecutor[1] and the adjudicator launch, naming index 0', async () => {
    const runner = runnerWith({ prosecutor: (index, lens) => (index === 0 ? prosecutorWith(lens, [chain(hop('E-3', 'DOC-C'))]) : stubProsecutorOutput(lens)) });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('prosecutor');
    expect(error.index).toBe(0);
    expect(error.problems[0]).toContain('challenges[0] (C1-fixture).evidence[0].hops[0]: names edge E-3');
    expect(launched(runner)).toEqual(['reader[0]', 'prosecutor[0]']);
  });

  it('an unlisted edge in the adjudicator\'s evidence is refused at the adjudicator seam, so no record is assembled from it', async () => {
    const runner = runnerWith({ adjudicator: adjudicatorWith([cross('NOT-AN-EDGE', 'DOC-A', 'DOC-C')]) });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('adjudicator');
    expect(error.problems[0]).toContain(`adjudications[0] (${RAISED}).evidence[0]: names edge NOT-AN-EDGE`);
    expect(launched(runner)).toEqual(['reader[0]', 'prosecutor[0]', 'prosecutor[1]', 'adjudicator[0]']);
  });

  it('gate order: a reader output with a wrong quote hash and an unlisted edge is refused for the hash first, so the edge problems are never reached', async () => {
    const runner = runnerWith({
      reader: readerWith([quote('DOC-A', WRONG), chain(hop('NOT-AN-EDGE', 'DOC-A'))]),
    });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('reader');
    expect(error.problems[0]).toContain(WRONG.slice(0, 12));
    expect(error.problems.join('\n')).not.toContain('names edge');
    expect(launched(runner)).toEqual(['reader[0]']);
  });
});
