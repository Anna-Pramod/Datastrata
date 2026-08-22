/**
 * The blind reader — §3.1 — and the two gap classes it can halt on.
 *
 * Four properties are checked here, and each is checked in the only place it is
 * checkable rather than in the place it is most convenient:
 *
 *  - **Blindness is structural**, so it is asserted at compile time. A runtime
 *    assertion that "the input has no `condition` field" would pass against a
 *    type that permits one and a builder that happens not to set it today.
 *  - **The projection is positive**, so a field added to `AuthoredRequirement`
 *    must not reach the reader. Asserted as an exact key set, because the
 *    `Omit<>` form this rules out would satisfy any weaker check.
 *  - **The two gap classes are distinct**, and that is asserted against the
 *    synthetic fixture corpus. It cannot be asserted against the real one:
 *    every requirement there closes over both documents that exist, so no
 *    document is outside any closure and `closure_gap` is unreachable.
 *  - **The empty closure never travels alone**, and *that* is asserted against
 *    the real corpus, because `CSRD-S-012` really does cite three sources the
 *    corpus serves with nothing. It is the finding, not a fixture.
 *
 * The corresponding failure modes from `docs/superpowers/TEST-EVIDENCE-STANDARD.md`
 * are #5 (an assertion satisfied unconditionally) and #7 (a negative
 * observation with no positive control), so every refusal below is paired with
 * the case where the same seam grants, produces or populates.
 */

import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOSURE_POLICY_V0, computeClosure, docsForSources } from '../src/corpus/closure';
import { loadCorpus } from '../src/corpus/store';
import { EntitledClosure, OutsideEntitlementError } from '../src/pipeline/entitlement';
import {
  classifyUnreachableDocument,
  corpusGapsForUnservedSources,
  EntitledDocumentIsNotAGapError,
  emptyClosureGaps,
  gapForUnreachableDocument,
} from '../src/pipeline/gaps';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import { loadPromptSet } from '../src/pipeline/prompts';
import {
  assertReaderEvidence,
  readerInputFor,
  renderReaderInput,
  requestDocument,
  runBlindReader,
  type ReaderInput,
} from '../src/pipeline/reader';
import { RoleOutputError } from '../src/pipeline/roles';
import type { ReaderOutput } from '../src/pipeline/role-outputs';
import {
  assertResultConsistency,
  EMPTY_CLOSURE_SHA256,
  ResultConsistencyError,
  verificationResultSchema,
  type VerificationResult,
} from '../src/verification/result';
import type { AuthoredRequirement } from '../src/types';
import { csrdPack } from './helpers';
import {
  docText,
  fixtureCorpus,
  fixtureIndex,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  NOT_INGESTED,
  stubProsecutorOutput,
  stubRunner,
  UNSERVED_SOURCE_IDS,
} from './pipeline-fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const prompts = loadPromptSet();
const corpus = fixtureCorpus();

function fixtureClosure(sourceIds: readonly string[] = ['SRC-100']): EntitledClosure {
  return EntitledClosure.forSources(corpus, sourceIds);
}

/** A reader input over the fixture closure, projected the only supported way. */
function input(requirement: AuthoredRequirement = fixtureRequirement()): ReaderInput {
  return readerInputFor({ packId: 'testpack', requirement, closure: fixtureClosure() });
}

// ---------------------------------------------------------------------------
// Blindness — the compile boundary
// ---------------------------------------------------------------------------

/**
 * `[A] extends [B]` in both directions: mutual assignability, with the tuple
 * wrapper suppressing union distribution so `keyof` unions compare as sets.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * The projection's key set, written out here rather than imported.
 *
 * Independently derived on purpose (failure mode #1): a list exported from
 * `reader.ts` and compared against `keyof ReaderInput` would be the module
 * agreeing with itself. This literal is what a reviewer reads §3.1 against, and
 * *any* change to `ReaderInput` — a field added, removed or renamed — fails to
 * compile here until somebody edits this line deliberately.
 *
 * Under an `Omit<AuthoredRequirement, …>` projection this assertion fails,
 * naming every requirement field the omission list did not think to exclude.
 */
const readerInputIsExactlyTheProjection: Exact<
  keyof ReaderInput,
  'packId' | 'requirementId' | 'requirementVersion' | 'provisions' | 'closure'
> = true;

/** Each of the four §3.1 exclusions, refused by the type. */
const closureForCompileChecks = fixtureClosure();
const base = {
  packId: 'testpack',
  requirementId: 'TEST-R-001',
  requirementVersion: 1,
  provisions: 'Fixture Act Art. 1',
  closure: closureForCompileChecks,
};

// @ts-expect-error the reader may not be handed the condition it will be compared against
const withCondition: ReaderInput = { ...base, condition: { op: 'exists', fact: 'entity.turnover' } };
// @ts-expect-error the reader may not be handed the plain-English gloss of the encoding
const withPlainEnglish: ReaderInput = { ...base, plainEnglish: 'A large undertaking must report.' };
// @ts-expect-error the reader may not be handed the author's caution
const withCaution: ReaderInput = { ...base, caution: 'The revised act is not yet in force.' };
// @ts-expect-error the reader may not be handed the rendered English a reviewer reads
const withRenderedCondition: ReaderInput = { ...base, renderedCondition: 'Applies when …' };
// @ts-expect-error the reader may not be handed a prior reading to agree with
const withPriorReading: ReaderInput = { ...base, priorReading: { elements: [] } };

/** The positive control: the projection itself does compile. */
const honestInput: ReaderInput = base;

/** Referenced so none of the declarations above is dead code to a linter. */
export type BlindnessWitnesses = [
  typeof readerInputIsExactlyTheProjection,
  typeof withCondition,
  typeof withPlainEnglish,
  typeof withCaution,
  typeof withRenderedCondition,
  typeof withPriorReading,
  typeof honestInput,
];

// ---------------------------------------------------------------------------
// Blindness — what actually reaches the model
// ---------------------------------------------------------------------------

describe('the reader’s input is a positive projection', () => {
  it('carries the identifiers, the citation and the capability, and nothing else', () => {
    const projected = input();
    expect(Object.keys(projected).sort()).toEqual([
      'closure',
      'packId',
      'provisions',
      'requirementId',
      'requirementVersion',
    ]);
    expect(projected.requirementId).toBe('TEST-R-001');
    expect(projected.provisions).toBe('Fixture Act Art. 1');
  });

  it('keeps the encoding out of the message the model receives', () => {
    // The requirement carries all four, and the fixture's values are distinctive
    // enough that a leak would be unmistakable in the rendered text.
    const requirement = fixtureRequirement({
      plainEnglish: 'SENTINEL-PLAIN-ENGLISH',
      caution: 'SENTINEL-CAUTION',
      condition: { op: 'cmp', fact: 'sentinel.fact', cmp: 'gt', value: 1 },
    });
    const message = renderReaderInput(input(requirement));

    expect(message).not.toContain('SENTINEL-PLAIN-ENGLISH');
    expect(message).not.toContain('SENTINEL-CAUTION');
    expect(message).not.toContain('sentinel.fact');
    expect(message).not.toContain('cmp');

    // The positive control (failure mode #7): the renderer does put things in
    // the message, so the four absences above are not a renderer that emitted
    // nothing. The citation and the entitled text are both there.
    expect(message).toContain('Fixture Act Art. 1');
    expect(message).toContain(docText('DOC-A'));
    expect(message).toContain(fixtureClosure().sha256);
  });

  it('carries no route to a document beyond the closure, in the message or the object', () => {
    const projected = input();
    const message = renderReaderInput(projected);

    // DOC-D and DOC-Z are in the corpus and outside the closure.
    expect(message).not.toContain(docText('DOC-D'));
    expect(message).not.toContain(docText('DOC-Z'));
    // …and the three that are inside it are all present, so the two absences
    // above are entitlement rather than an empty render.
    for (const docId of ['DOC-A', 'DOC-B', 'DOC-C']) {
      expect(message).toContain(docText(docId));
    }
    // The capability is the only document-shaped thing in the input, and it
    // refuses. There is no index, no path and no loader beside it.
    expect(() => projected.closure.text('DOC-D')).toThrow(OutsideEntitlementError);
    expect(projected.closure.text('DOC-A')).toBe(docText('DOC-A'));
  });
});

// ---------------------------------------------------------------------------
// Entitlement is enforced, not requested
// ---------------------------------------------------------------------------

describe('a document request is answered by the entitlement, not by the corpus', () => {
  it('returns no text for a document the corpus holds and the closure excludes', () => {
    const closure = fixtureClosure();
    // DOC-D exists — the fixture corpus hands it over directly — so the refusal
    // below is about entitlement and not about a missing file.
    expect(corpus.document('DOC-D').docId).toBe('DOC-D');

    const refused = requestDocument(closure, 'DOC-D');
    expect(refused.granted).toBe(false);
    expect(refused).not.toHaveProperty('document');
    if (refused.granted) throw new Error('unreachable');
    expect(refused.gap.kind).toBe('closure_gap');
    expect(refused.gap.docId).toBe('DOC-D');

    // The positive control: the same call over an entitled document does hand
    // back the words, so "no text" is a refusal rather than a broken accessor.
    const granted = requestDocument(closure, 'DOC-A');
    expect(granted.granted).toBe(true);
    if (!granted.granted) throw new Error('unreachable');
    expect(granted.document.text).toBe(docText('DOC-A'));
  });

  it('pins a closure hash that does not cover the refused document', () => {
    // The other half of the §3.0 invariant: it is not enough that the reader
    // did not get DOC-D — the hash the signature pins must not describe a
    // surface that includes it.
    const index = fixtureIndex();
    const entries = docsForSources(index, ['SRC-100']);
    const closure = fixtureClosure();

    expect(closure.docIds).not.toContain('DOC-D');
    expect(closure.sha256).toBe(computeClosure(index, entries, CLOSURE_POLICY_V0).sha256);

    // Had DOC-D been entitled, the pinned digest would be a different number.
    const wider = computeClosure(index, [...entries, 'DOC-D'], CLOSURE_POLICY_V0);
    expect(wider.docIds).toContain('DOC-D');
    expect(wider.sha256).not.toBe(closure.sha256);
  });
});

// ---------------------------------------------------------------------------
// The two gap classes are genuinely distinct
// ---------------------------------------------------------------------------

describe('the gap classes are distinguished by the corpus, not by the role', () => {
  const closure = fixtureClosure();

  it('calls a document the corpus does not hold a corpus_gap', () => {
    const gap = gapForUnreachableDocument(closure, NOT_INGESTED);
    expect(gap.kind).toBe('corpus_gap');
    expect(gap.docId).toBe(NOT_INGESTED);
    expect(gap.sourceId).toBeUndefined();
    expect(gap.detail).toContain('ingest');
  });

  it('calls a document the corpus holds but traversal did not reach a closure_gap', () => {
    const gap = gapForUnreachableDocument(closure, 'DOC-D');
    expect(gap.kind).toBe('closure_gap');
    expect(gap.docId).toBe('DOC-D');
    expect(gap.sourceId).toBeUndefined();
    expect(gap.detail).toContain('traversal policy');
  });

  it('separates the two on corpus membership, which is the whole discrimination', () => {
    // Stated directly against the classifier, so the property is not read
    // through two message strings that could both be wrong.
    expect(classifyUnreachableDocument(closure, 'DOC-D')).toBe('closure_gap');
    expect(classifyUnreachableDocument(closure, 'DOC-Z')).toBe('closure_gap');
    expect(classifyUnreachableDocument(closure, NOT_INGESTED)).toBe('corpus_gap');
    expect(closure.corpusHolds('DOC-D')).toBe(true);
    expect(closure.corpusHolds(NOT_INGESTED)).toBe(false);
  });

  it('refuses to call an entitled document a gap at all', () => {
    // The positive control for both kinds: not everything unreachable-sounding
    // becomes a gap. A document the role was handed is a false halt.
    expect(() => classifyUnreachableDocument(closure, 'DOC-A')).toThrow(
      EntitledDocumentIsNotAGapError,
    );
  });

  it('produces no gap at all when the reader reaches everything it needed', () => {
    // The positive control the plan names: without it, "always a gap" would
    // satisfy both halves above.
    expect(emptyClosureGaps(closure, ['SRC-100'])).toEqual([]);
    expect(closure.docIds).toEqual(['DOC-A', 'DOC-B', 'DOC-C']);
  });
});

// ---------------------------------------------------------------------------
// The reader, end to end, over the fixture corpus
// ---------------------------------------------------------------------------

/** A reader response that reads the closure and halts on nothing. */
function wholeReading(): ReaderOutput {
  return {
    elements: [
      {
        id: 'RE-1',
        statement: 'The operative test is stated in Article 1.',
        evidence: [
          {
            kind: 'quote',
            docId: 'DOC-A',
            sha256Normalized: corpus.document('DOC-A').sha256Normalized,
            text: 'The operative test is stated here.',
          },
        ],
      },
    ],
    gaps: [],
  };
}

function readerRun(response: (docId?: string) => ReaderOutput, sourceIds = ['SRC-100']) {
  const runner = stubRunner(() => JSON.stringify(response()));
  return {
    runner,
    run: () =>
      runBlindReader({
        input: readerInputFor({
          packId: 'testpack',
          requirement: fixtureRequirement({ sources: [...sourceIds] }),
          closure: fixtureClosure(sourceIds),
        }),
        sourceIds,
        prompt: prompts.reader,
        model: 'model-under-test',
        runner,
      }),
  };
}

describe('runBlindReader', () => {
  it('returns the reading and no gap when the closure held everything', async () => {
    const { runner, run } = readerRun(wholeReading);
    const outcome = await run();
    expect(outcome.gaps).toEqual([]);
    expect(outcome.output.elements).toHaveLength(1);
    expect(outcome.execution).not.toBeNull();
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]?.role).toBe('reader');
  });

  it('classifies the role’s halt itself, rather than believing its kind', async () => {
    // The agent asserts the wrong kind for both documents. The corpus decides.
    const { run } = readerRun(() => ({
      elements: [],
      gaps: [
        { kind: 'corpus_gap', docId: 'DOC-D', detail: 'I could not find it' },
        { kind: 'closure_gap', docId: NOT_INGESTED, detail: 'I could not find it either' },
      ],
    }));
    const outcome = await run();
    expect(outcome.gaps.map((gap) => [gap.kind, gap.docId])).toEqual([
      ['closure_gap', 'DOC-D'],
      ['corpus_gap', NOT_INGESTED],
    ]);
    // The role's own words survive as context, so nothing a human needs is lost.
    expect(outcome.gaps[0]?.detail).toContain('I could not find it');
  });

  it('discards the reading when a gap was hit, and keeps it in the transcript', async () => {
    const { run } = readerRun(() => ({
      elements: wholeReading().elements,
      gaps: [{ kind: 'closure_gap', docId: 'DOC-D', detail: 'needed the referenced act' }],
    }));
    const outcome = await run();
    expect(outcome.gaps).toHaveLength(1);
    expect(outcome.output.elements).toEqual([]);
    // §3.0 discards the judgment, not the evidence of what happened.
    expect(outcome.execution?.transcript.outputJson).toContain('RE-1');
  });

  it('names a false halt against the reader rather than recording it as a gap', async () => {
    const { run } = readerRun(() => ({
      elements: [],
      gaps: [{ kind: 'corpus_gap', docId: 'DOC-A', detail: 'not there' }],
    }));
    await expect(run()).rejects.toBeInstanceOf(RoleOutputError);
    await expect(run()).rejects.toThrow(/inside the entitled closure/);
  });

  it('refuses a reading resting entirely on absence, at the reader’s own boundary', async () => {
    const { run } = readerRun(() => ({
      elements: [
        {
          id: 'RE-1',
          statement: 'Nothing in the closure imposes the criterion.',
          evidence: [{ kind: 'absence', docIds: ['DOC-A'], term: 'value added tax' }],
        },
      ],
      gaps: [],
    }));
    await expect(run()).rejects.toBeInstanceOf(RoleOutputError);
    await expect(run()).rejects.toThrow(/sole evidence/);

    // The positive control: mixed evidence over the same seam is accepted, so
    // the refusal is about kinds rather than about the gate rejecting whatever
    // it is shown.
    expect(() =>
      assertReaderEvidence({
        elements: [
          {
            id: 'RE-1',
            statement: 'The operative test is stated in Article 1.',
            evidence: [
              ...wholeReading().elements[0]!.evidence,
              { kind: 'absence', docIds: ['DOC-A'], term: 'value added tax' },
            ],
          },
        ],
        gaps: [],
      }),
    ).not.toThrow();
  });

  it('runs no agent even when there is no source to name in the gap', async () => {
    // The guard is on the closure being empty, not on there being a gap to
    // report, and the two diverge exactly here. A guard on the gap list would
    // send the reader off to read an empty evidence surface — a reading from
    // general knowledge, which is the thing this branch exists to prevent —
    // and it would do so silently, because the outcome would look like a
    // perfectly ordinary reading.
    //
    // `sources.min(1)` in `knowledge/schema.ts` makes this unreachable from a
    // loaded pack, so it is asserted against `runBlindReader` directly. A rule
    // that only holds because another module currently forbids the input is a
    // rule nothing checks.
    const runner = stubRunner(() => JSON.stringify(wholeReading()));
    const closure = fixtureClosure([...UNSERVED_SOURCE_IDS]);
    expect(closure.docIds).toEqual([]);

    const outcome = await runBlindReader({
      input: readerInputFor({
        packId: 'testpack',
        requirement: fixtureRequirement({ sources: [] }),
        closure,
      }),
      sourceIds: [],
      prompt: prompts.reader,
      model: 'model-under-test',
      runner,
    });

    expect(runner.requests).toHaveLength(0);
    expect(outcome.execution).toBeNull();
    expect(outcome.output.elements).toEqual([]);
    // Nothing to name, so nothing is named — and the record boundary refuses
    // the resulting dossier, which is where that state is caught.
    expect(outcome.gaps).toEqual([]);
    expect(
      problems(resultOver({ corpusClosureSha256: EMPTY_CLOSURE_SHA256, gaps: [] })),
    ).toHaveLength(1);
  });

  it('runs no agent at all when the entitled closure is empty', async () => {
    const { runner, run } = readerRun(wholeReading, [...UNSERVED_SOURCE_IDS]);
    const outcome = await run();

    expect(runner.requests).toHaveLength(0);
    expect(outcome.execution).toBeNull();
    expect(outcome.output).toEqual({ elements: [], gaps: [] });
    expect(outcome.gaps.map((gap) => [gap.kind, gap.sourceId])).toEqual([
      ['corpus_gap', 'SRC-900'],
      ['corpus_gap', 'SRC-901'],
    ]);
    expect(outcome.input.closure.sha256).toBe(EMPTY_CLOSURE_SHA256);

    // The positive control for the zero above (failure mode #7): the same
    // runner does get called when there is a surface to read.
    const served = readerRun(wholeReading);
    await served.run();
    expect(served.runner.requests).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// A document-shaped halt, through the whole pipeline
// ---------------------------------------------------------------------------

/**
 * The branch Tasks 3–5 build on: the reader *ran*, produced a gap over a
 * document, and everything after it was skipped.
 *
 * It has its own describe because the only other pipeline-level halt is the
 * empty-closure one, where no agent runs at all — so without this, "the reader
 * ran and then verification stopped" is entirely uncovered, and so is the
 * double-count `sourceShapedGaps` exists to prevent. A document gap reaches the
 * tail through `roleOutputs.reading.gaps`; if the pipeline also handed it over
 * as a pipeline-produced gap it would be collated twice, and a signer would be
 * told to ingest one document under two entries.
 */
describe('a reader that halts on a document stops the pipeline exactly once', () => {
  function haltingRun() {
    const runner = stubRunner((request) =>
      request.role === 'reader'
        ? JSON.stringify({
            elements: wholeReading().elements,
            gaps: [{ kind: 'corpus_gap', docId: 'DOC-D', detail: 'I needed the referenced act' }],
          })
        : JSON.stringify({ lens: 'x', coverage: [], challenges: [], gaps: [] }),
    );
    const requirement = fixtureRequirement();
    return {
      runner,
      run: () =>
        runVerificationPipeline({
          packId: 'testpack',
          requirementId: requirement.id,
          requirement,
          renderContext: fixtureRenderContext(),
          closure: fixtureClosure(),
          corpus,
          prompts,
          config: DEFAULT_ROLE_CONFIG,
          runner,
        }),
    };
  }

  it('collates the gap once, not once per route into the tail', async () => {
    const { runner, run } = haltingRun();
    const outcome = await run();

    // The guard's whole point. Two would mean the same document reported as two
    // separate things for a human to go and ingest.
    expect(outcome.tail.gaps).toHaveLength(1);
    expect(outcome.tail.gaps[0]?.docId).toBe('DOC-D');
    // …and reclassified on the way, so the role's `corpus_gap` did not survive.
    expect(outcome.tail.gaps[0]?.kind).toBe('closure_gap');
    expect(outcome.tail.gaps[0]?.sourceId).toBeUndefined();

    // Agent verification stopped, and the reader is the only role that ran.
    expect(outcome.halted).toBe(true);
    expect(outcome.transcript.roles).toHaveLength(1);
    expect(outcome.transcript.roles[0]?.role).toBe('reader');
    expect(outcome.executions.reader).not.toBeNull();
    expect(outcome.executions.prosecutors).toEqual([]);
    expect(outcome.executions.adjudicator).toBeNull();
    expect(runner.requests.map((request) => request.role)).toEqual(['reader']);

    // The reading was discarded, and the closure is real rather than empty —
    // so this is the *document* halt and not the empty-closure one wearing a
    // different hat.
    expect(outcome.reader.output.elements).toEqual([]);
    expect(outcome.tail.pins.corpusClosureSha256).not.toBe(EMPTY_CLOSURE_SHA256);
    expect(outcome.tail.pins.corpus.map((pin) => pin.docId)).toEqual([
      'DOC-A',
      'DOC-B',
      'DOC-C',
    ]);
  });

  it('runs every role and collates nothing when the reader reaches everything', async () => {
    // The positive control for all four counts above (failure mode #7): the same
    // wiring does run five roles and does produce a whole transcript.
    const runner = stubRunner((request) =>
      request.role === 'reader'
        ? JSON.stringify(wholeReading())
        : request.role === 'prosecutor'
          ? // The lens is echoed from the request and the table addresses the
            // reading element `wholeReading` actually carries: Task 3 refuses a
            // prosecutor answering under an unconfigured lens, and refuses a
            // cell naming an element the reading never made.
            JSON.stringify(
              stubProsecutorOutput(lensFromRequest(request), { readingElementId: 'RE-1' }),
            )
          : JSON.stringify({ adjudications: [], gaps: [] }),
    );
    const requirement = fixtureRequirement();
    const outcome = await runVerificationPipeline({
      packId: 'testpack',
      requirementId: requirement.id,
      requirement,
      renderContext: fixtureRenderContext(),
      closure: fixtureClosure(),
      corpus,
      prompts,
      config: DEFAULT_ROLE_CONFIG,
      runner,
    });
    expect(outcome.halted).toBe(false);
    expect(outcome.tail.gaps).toEqual([]);
    expect(outcome.transcript.roles).toHaveLength(5);
    expect(outcome.executions.adjudicator).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The capability boundary survives a cast
// ---------------------------------------------------------------------------

describe('the entitled closure hands out no back door', () => {
  it('keeps the corpus unreachable by any name from outside the class', () => {
    const closure = fixtureClosure();
    // TypeScript's `private` is erased, so this is the runtime question and it
    // has to be asked with the types off. `#source` is not a property at all
    // from out here: no cast, key walk or index access reaches it.
    const asAny = closure as unknown as Record<string, unknown>;
    expect(asAny['source']).toBeUndefined();
    expect(asAny['closure']).toBeUndefined();
    expect(Object.keys(closure)).not.toContain('source');
    expect(Reflect.ownKeys(closure).map(String)).not.toContain('source');

    // The positive control: the class itself still reaches its corpus, so the
    // undefined above is encapsulation rather than an object with no state.
    expect(closure.text('DOC-A')).toBe(docText('DOC-A'));
    expect(closure.corpusHolds('DOC-D')).toBe(true);
    // …and the only route to text still refuses what it always refused.
    expect(() => closure.text('DOC-D')).toThrow(OutsideEntitlementError);
  });
});

// ---------------------------------------------------------------------------
// A gap-bearing dossier has a canonical shape
// ---------------------------------------------------------------------------

/** A structurally valid result whose fields the caller replaces wholesale. */
function resultOver(overrides: Partial<VerificationResult>): VerificationResult {
  return verificationResultSchema.parse({
    packId: 'testpack',
    requirementId: 'REQ-001',
    requirementVersion: 1,
    resultSchemaVersion: '1.2.0',
    pipelineVersion: 'pipeline-1.0.0',
    rendererVersion: 'renderer-1.1.0',
    requirementInputSha256: 'a'.repeat(64),
    conditionSha256: 'b'.repeat(64),
    renderedConditionSha256: 'c'.repeat(64),
    corpusClosureSha256: 'd'.repeat(64),
    corpus: [],
    reading: { elements: [] },
    coverage: { cells: [] },
    challenges: [],
    openQuestions: [],
    gaps: [],
    ...overrides,
  });
}

const ONE_GAP = [{ kind: 'corpus_gap' as const, docId: 'DOC-X', detail: 'not held' }];

function problems(result: VerificationResult): string[] {
  try {
    assertResultConsistency(result);
    return [];
  } catch (error) {
    if (error instanceof ResultConsistencyError) return error.problems;
    throw error;
  }
}

describe('a gap-bearing dossier carries no judgment', () => {
  it('accepts the canonical shape: the containers empty and gaps[] populated', () => {
    expect(problems(resultOver({ gaps: ONE_GAP }))).toEqual([]);
  });

  /**
   * Each container is asserted on its own, because conjuncts mask one another
   * (failure mode #4): a single combined message would let three empty
   * containers cover for the fourth that is not.
   */
  const populated: Array<[string, Partial<VerificationResult>]> = [
    [
      'reading.elements[]',
      {
        reading: {
          elements: [
            {
              id: 'R1',
              statement: 'A large undertaking must report.',
              evidence: [
                { kind: 'quote', docId: 'DOC-X', sha256Normalized: 'e'.repeat(64), text: 'x' },
              ],
            },
          ],
        },
      },
    ],
    [
      'coverage.cells[]',
      { coverage: { cells: [{ direction: 'reading_to_condition', verdict: 'MAPPED' }] } },
    ],
    [
      'challenges[]',
      {
        challenges: [
          {
            id: 'C1',
            lens: 'threshold',
            statement: 'Is the threshold right?',
            verdict: 'OPEN_QUESTION',
            evidence: [
              { kind: 'quote', docId: 'DOC-X', sha256Normalized: 'e'.repeat(64), text: 'x' },
            ],
            adjudicationEvidence: [
              { kind: 'quote', docId: 'DOC-X', sha256Normalized: 'e'.repeat(64), text: 'y' },
            ],
          },
        ],
      },
    ],
    [
      'openQuestions[]',
      { openQuestions: [{ id: 'Q1', statement: 'Which balance sheet dates?' }] },
    ],
  ];

  for (const [path, override] of populated) {
    it(`refuses a gap-bearing record whose ${path} is populated`, () => {
      const found = problems(resultOver({ gaps: ONE_GAP, ...override })).filter((problem) =>
        problem.startsWith('gaps[]:'),
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toContain(path);
      expect(found[0]).toContain('canonically empty');

      // The positive control: the very same container populated with **no**
      // gap is accepted, so the rule is the pairing rather than a ban on
      // content (failure mode #5).
      expect(problems(resultOver(override)).filter((p) => p.startsWith('gaps[]:'))).toEqual([]);
    });
  }

  it('reports every populated container in one pass', () => {
    const all = populated.reduce<Partial<VerificationResult>>(
      (merged, [, override]) => ({ ...merged, ...override }),
      {},
    );
    const found = problems(resultOver({ gaps: ONE_GAP, ...all })).filter((problem) =>
      problem.startsWith('gaps[]:'),
    );
    expect(found).toHaveLength(4);
  });

  it('holds however the run stopped, because the record cannot say where', () => {
    // The rule is unconditional by design. There is no `stageReached` field to
    // condition it on, and §3.0 forbids topping a reading up whichever role
    // hit the gap — so a reading beside a prosecutor's gap is refused exactly
    // as a reading beside the reader's is.
    expect(verificationResultSchema.shape).not.toHaveProperty('stageReached');
    const bothKinds = resultOver({
      gaps: [
        ...ONE_GAP,
        { kind: 'closure_gap', docId: 'DOC-Y', detail: 'not entitled' },
      ],
      openQuestions: [{ id: 'Q1', statement: 'Which balance sheet dates?' }],
    });
    expect(problems(bothKinds).some((p) => p.includes('openQuestions[]'))).toBe(true);
  });
});

describe('an empty closure never travels alone', () => {
  it('accepts the empty digest when gaps[] says why', () => {
    expect(
      problems(resultOver({ corpusClosureSha256: EMPTY_CLOSURE_SHA256, gaps: ONE_GAP })),
    ).toEqual([]);
  });

  it('refuses the empty digest unaccompanied', () => {
    const found = problems(resultOver({ corpusClosureSha256: EMPTY_CLOSURE_SHA256 }));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('corpusClosureSha256');
    expect(found[0]).toContain('empty');
    expect(found[0]).toContain('unaccompanied');
  });

  it('says nothing about a non-empty closure carrying no gaps', () => {
    // The positive control: the rule is about *this* digest, not about gaps in
    // general — a completed run with a real closure and no gaps is the normal
    // case and must stay representable.
    expect(problems(resultOver({}))).toEqual([]);
  });

  it('is the digest the closure machinery actually produces over nothing', () => {
    // Derived rather than transcribed: if `computeClosure` ever stopped
    // returning this value, the rule above would be guarding a number nothing
    // produces.
    expect(computeClosure(fixtureIndex(), []).sha256).toBe(EMPTY_CLOSURE_SHA256);
  });
});

// ---------------------------------------------------------------------------
// The real corpus: CSRD-S-012's sources are served by nothing
// ---------------------------------------------------------------------------

describe('a requirement whose sources serve no document (the real corpus)', () => {
  const realCorpus = loadCorpus(join(here, '..', 'corpus'));
  const pack = csrdPack();
  const requirement = pack.requirements.find((entry) => entry.id === 'CSRD-S-012');
  const registers = {
    docIds: realCorpus.index.documents.map((document) => document.docId),
    sourceIds: pack.sources.map((source) => source.id),
  };

  it('is the only requirement in the pack with an empty entitled closure', () => {
    // Measured, not assumed — and the positive control for everything below:
    // the other fifteen requirements do open onto a real surface, so an empty
    // closure is a finding about this one rather than a broken corpus.
    const empty = pack.requirements.filter(
      (entry) => EntitledClosure.forSources(realCorpus, entry.sources).docIds.length === 0,
    );
    expect(empty.map((entry) => entry.id)).toEqual(['CSRD-S-012']);
    expect(pack.requirements).toHaveLength(16);
  });

  it('produces a corpus_gap per cited source, and no reading assembled from memory', async () => {
    expect(requirement).toBeDefined();
    if (requirement === undefined) throw new Error('unreachable');
    expect(requirement.sources).toEqual(['SRC-005', 'SRC-006', 'SRC-007']);

    const closure = EntitledClosure.forSources(realCorpus, requirement.sources);
    const runner = stubRunner(() => JSON.stringify(wholeReading()));
    const outcome = await runBlindReader({
      input: readerInputFor({ packId: pack.id, requirement, closure }),
      sourceIds: requirement.sources,
      prompt: prompts.reader,
      model: 'model-under-test',
      runner,
    });

    // The canonical gap-bearing shape, asserted in full.
    expect(outcome.output.elements).toEqual([]);
    expect(outcome.gaps).toEqual([
      ...corpusGapsForUnservedSources(['SRC-005', 'SRC-006', 'SRC-007']),
    ]);
    expect(outcome.gaps.map((gap) => gap.docId)).toEqual([undefined, undefined, undefined]);
    expect(closure.sha256).toBe(EMPTY_CLOSURE_SHA256);
    expect(runner.requests).toHaveLength(0);
    expect(outcome.execution).toBeNull();
  });

  it('assembles into a record the consistency rules accept, and refuse without the gaps', async () => {
    if (requirement === undefined) throw new Error('unreachable');
    // Through the producer rather than around it: a record built from a
    // hand-written gap list would still validate if `runBlindReader` stopped
    // producing gaps altogether, which is the defect this pairing exists for.
    const outcome = await runBlindReader({
      input: readerInputFor({
        packId: pack.id,
        requirement,
        closure: EntitledClosure.forSources(realCorpus, requirement.sources),
      }),
      sourceIds: requirement.sources,
      prompt: prompts.reader,
      model: 'model-under-test',
      runner: stubRunner(() => JSON.stringify(wholeReading())),
    });
    const gaps = outcome.gaps;
    const accompanied = resultOver({
      requirementId: requirement.id,
      corpusClosureSha256: EMPTY_CLOSURE_SHA256,
      gaps,
    });
    // The identifiers land in the field their own register owns, checked
    // against the real corpus index and the real source register.
    expect(() => assertResultConsistency(accompanied, registers)).not.toThrow();

    const unaccompanied = resultOver({
      requirementId: requirement.id,
      corpusClosureSha256: EMPTY_CLOSURE_SHA256,
    });
    let thrown: string[] = [];
    try {
      assertResultConsistency(unaccompanied, registers);
    } catch (error) {
      thrown = (error as ResultConsistencyError).problems;
    }
    expect(thrown).toHaveLength(1);
    expect(thrown[0]).toContain('unaccompanied');
  });

  it('stops agent verification at the gap, and the tail records the dossier', async () => {
    if (requirement === undefined) throw new Error('unreachable');
    const runner = stubRunner(() => JSON.stringify(wholeReading()));
    const outcome = await runVerificationPipeline({
      packId: pack.id,
      requirementId: requirement.id,
      requirement,
      renderContext: { factTypes: pack.factTypes, catalogues: pack.catalogues },
      closure: EntitledClosure.forSources(realCorpus, requirement.sources),
      corpus: realCorpus,
      prompts,
      config: DEFAULT_ROLE_CONFIG,
      runner,
    });

    expect(outcome.halted).toBe(true);
    // No agent ran at all: no reader, and therefore no prosecutor and no
    // adjudicator either. `prosecutorCount` is 3, so the zero below is a halt
    // rather than a configuration that asks for nobody.
    expect(DEFAULT_ROLE_CONFIG.prosecutorCount).toBe(3);
    expect(runner.requests).toEqual([]);
    expect(outcome.executions.reader).toBeNull();
    expect(outcome.executions.prosecutors).toEqual([]);
    expect(outcome.executions.adjudicator).toBeNull();
    expect(outcome.transcript.roles).toEqual([]);

    // The tail still computed pins and collated the gap-bearing dossier: it
    // performs no substantive judgment, but a record that cannot be pinned is
    // Invalid whatever else is true of it.
    expect(outcome.tail.pins.corpusClosureSha256).toBe(EMPTY_CLOSURE_SHA256);
    expect(outcome.tail.pins.corpus).toEqual([]);
    expect(outcome.tail.gaps.map((gap) => gap.sourceId)).toEqual([
      'SRC-005',
      'SRC-006',
      'SRC-007',
    ]);

    // The positive control: a served requirement runs every role through the
    // same call, so the emptiness above is the halt and not a broken wiring.
    const served = pack.requirements.find((entry) => entry.id !== requirement.id);
    if (served === undefined) throw new Error('unreachable');
    const liveRunner = stubRunner((request) =>
      request.role === 'reader'
        ? JSON.stringify({ elements: [], gaps: [] })
        : request.role === 'prosecutor'
          ? // An empty table over an empty reading: there are no reading
            // elements to walk from, so Task 3's bidirectionality guard has no
            // material and does not demand cells.
            JSON.stringify({ lens: lensFromRequest(request), coverage: [], challenges: [], gaps: [] })
          : JSON.stringify({ adjudications: [], gaps: [] }),
    );
    const whole = await runVerificationPipeline({
      packId: pack.id,
      requirementId: served.id,
      requirement: served,
      renderContext: { factTypes: pack.factTypes, catalogues: pack.catalogues },
      closure: EntitledClosure.forSources(realCorpus, served.sources),
      corpus: realCorpus,
      prompts,
      config: DEFAULT_ROLE_CONFIG,
      runner: liveRunner,
    });
    expect(whole.halted).toBe(false);
    expect(whole.tail.gaps).toEqual([]);
    expect(liveRunner.requests).toHaveLength(5);
    expect(whole.executions.adjudicator).not.toBeNull();
  });

  it('has no document outside any closure, which is why closure_gap is tested elsewhere', () => {
    // Recorded as a test so the claim cannot quietly go stale: the day the
    // corpus grows a third document, this fails and the fixture-corpus
    // justification has to be rewritten rather than inherited.
    const held = new Set(realCorpus.index.documents.map((document) => document.docId));
    for (const entry of pack.requirements) {
      const closure = EntitledClosure.forSources(realCorpus, entry.sources);
      const outside = [...held].filter((docId) => !closure.entitled(docId));
      if (closure.docIds.length === 0) continue;
      expect(outside).toEqual([]);
    }
  });
});
