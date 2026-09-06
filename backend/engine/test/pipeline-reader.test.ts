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
import { CLOSURE_POLICY_V1, computeClosure, docsForSources } from '../src/corpus/closure';
import { readFileSync } from 'node:fs';
import { authoriseCorpus } from '../src/corpus/authority';
import { parseSourceRegister } from '../src/monitoring/register';
import { loadCorpus } from '../src/corpus/store';
import { EntitledClosure, OutsideEntitlementError } from '../src/pipeline/entitlement';
import {
  classifyUnreachableDocument,
  corpusGapsForUnservedSources,
  EntitledDocumentIsNotAGapError,
  unservedSourceGaps,
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
  citing,
  docText,
  fixtureAuthorisedCorpus,
  fixtureIndex,
  fixtureRegister,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  NOT_INGESTED,
  stubProsecutorOutput,
  stubRunner,
  UNSERVED_SOURCE_IDS,
} from './pipeline-fixtures';
import { fixtureSourceUniverse } from './pipeline-fixtures';
import { fixtureStanding } from './pipeline-fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const prompts = loadPromptSet();
const corpus = fixtureAuthorisedCorpus();

function fixtureClosure(sourceIds: readonly string[] = ['SRC-100']): EntitledClosure {
  return EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), sourceIds);
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
  'packId' | 'requirementId' | 'requirementVersion' | 'locators' | 'closure'
> = true;

/** Each of the four §3.1 exclusions, refused by the type. */
const closureForCompileChecks = fixtureClosure();
const base = {
  packId: 'testpack',
  requirementId: 'TEST-R-001',
  requirementVersion: 1,
  locators: ['Fixture Act Art. 1'],
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
// @ts-expect-error the reader may not be handed the authored provenance, which carries source identity
const withProvenance: ReaderInput = { ...base, provenance: [{ sourceId: 'SRC-100', locators: [] }] };
// @ts-expect-error the reader may not be handed the cited source ids under any name
const withSources: ReaderInput = { ...base, sources: ['SRC-100'] };

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
  typeof withProvenance,
  typeof withSources,
  typeof honestInput,
];

// ---------------------------------------------------------------------------
// Blindness — what actually reaches the model
// ---------------------------------------------------------------------------

describe('the reader’s input is a positive projection', () => {
  it('carries the identifiers, the addresses and the capability, and nothing else', () => {
    const projected = input();
    expect(Object.keys(projected).sort()).toEqual([
      'closure',
      'locators',
      'packId',
      'requirementId',
      'requirementVersion',
    ]);
    expect(projected.requirementId).toBe('TEST-R-001');
    expect(projected.locators).toEqual(['Fixture Act Art. 1']);
  });

  it('gives the reader the address and never the source it came from', () => {
    // The discriminating pair, in one output. The locator must be present —
    // otherwise an implementation that projected nothing would satisfy the
    // absence half — and no `SRC-` identity may appear anywhere in the rendered
    // text the model receives.
    const requirement = fixtureRequirement({
      provenance: [
        { sourceId: 'SRC-900', locators: [{ kind: 'provision', text: 'Fixture Act Art. 7' }] },
      ],
    });
    const rendered = renderReaderInput(
      readerInputFor({ packId: 'testpack', requirement, closure: fixtureClosure() }),
    );
    expect(rendered).toContain('Fixture Act Art. 7');
    expect(rendered).not.toContain('SRC-900');
    expect(rendered).not.toMatch(/SRC-\d{3}/);
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
    expect(closure.sha256).toBe(computeClosure(index, entries, fixtureStanding(), CLOSURE_POLICY_V1).sha256);

    // Had DOC-D been entitled, the pinned digest would be a different number.
    const wider = computeClosure(index, [...entries, 'DOC-D'], fixtureStanding(), CLOSURE_POLICY_V1);
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
    //
    // Worth noting what this used to be worth. Under the old closure-cardinality
    // guard it passed because the closure was non-empty — it could not tell
    // "SRC-100 is served" from "some other source was served". Under the
    // per-source rule it passes for the reason its name claims, and the mixed
    // case below is what distinguishes them.
    expect(unservedSourceGaps(closure, ['SRC-100'])).toEqual([]);
    expect(closure.docIds).toEqual(['DOC-A', 'DOC-B', 'DOC-C']);
  });

  it('gaps a cited source nothing serves, even though the closure is not empty', () => {
    // The case no fixture built, and the whole defect: one served source, one
    // unserved, a real non-empty closure, and a gap that must still be named.
    const gaps = unservedSourceGaps(closure, ['SRC-100', 'SRC-900']);
    expect(closure.docIds).toEqual(['DOC-A', 'DOC-B', 'DOC-C']);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.kind).toBe('corpus_gap');
    expect(gaps[0]!.sourceId).toBe('SRC-900');
    expect(gaps[0]!.docId).toBeUndefined();
  });

  it('names only the sources nothing serves, never the ones that are', () => {
    // The second defect, which the obvious fix activates:
    // `corpusGapsForUnservedSources` asserts of every id it is handed that
    // nothing serves it, and checks nothing. Removing the old guard without
    // filtering would emit a gap claiming SRC-100 is unserved.
    const gaps = unservedSourceGaps(closure, ['SRC-100', 'SRC-900', 'SRC-901']);
    expect(gaps.map((gap) => gap.sourceId)).toEqual(['SRC-900', 'SRC-901']);
    // Order follows the requirement's own source order, not the filesystem's.
    expect(unservedSourceGaps(closure, ['SRC-901', 'SRC-900']).map((g) => g.sourceId)).toEqual([
      'SRC-901',
      'SRC-900',
    ]);
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
          requirement: fixtureRequirement({ provenance: citing(...sourceIds) }),
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
    // The guard has two conditions, and this case is why the second exists: a
    // gap list alone would not fire here, because there is no source to name.
    // A guard on the gap list only would send the reader off to read an empty
    // evidence surface — a reading from general knowledge, which is what this
    // branch exists to prevent —
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
        requirement: fixtureRequirement({ provenance: [] }),
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
    expect(outcome.transcript.roles).toHaveLength(2 + DEFAULT_ROLE_CONFIG.prosecutorCount);
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
    resultSchemaVersion: '1.3.0',
    pipelineVersion: 'pipeline-1.0.0',
    rendererVersion: 'renderer-1.1.0',
    closureRendererVersion: 'closure-renderer-1.0.0',
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
    expect(computeClosure(fixtureIndex(), [], fixtureStanding()).sha256).toBe(EMPTY_CLOSURE_SHA256);
  });
});

// ---------------------------------------------------------------------------
// The real corpus: CSRD-S-012's sources are served by nothing
// ---------------------------------------------------------------------------

describe('a requirement whose evidence is only partly served (the real corpus)', () => {
  // Authorised, like every production consumer of the real corpus: `forSources`
  // takes only a validated corpus, and a test that reached round it would be
  // exercising a path production cannot use.
  const realRegister = parseSourceRegister(
    JSON.parse(readFileSync(join(here, '..', 'monitoring', 'source-register.json'), 'utf8')),
  );
  const realCorpus = authoriseCorpus(loadCorpus(join(here, '..', 'corpus')), realRegister, csrdPack());
  const pack = csrdPack();
  const requirement = pack.requirements.find((entry) => entry.id === 'CSRD-S-012');
  const registers = {
    docIds: realCorpus.index.documents.map((document) => document.docId),
    sourceIds: pack.sources.map((source) => source.id),
  };

  it('is one of none: no requirement now opens onto an empty closure', () => {
    // Measured, not assumed. The set is computed from the real corpus rather
    // than asserted from a list, so the number is a reading of what the corpus
    // holds today and moves when the corpus does.
    const empty = pack.requirements.filter(
      (entry) => EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), entry.sources).docIds.length === 0,
    );
    // **None, and the movement is T9.** T6 took CSRD-S-012 out of this set by
    // serving SRC-005; T9 took the last two out by serving SRC-002, which was
    // the only source either of them cites. Every requirement in the pack now
    // opens onto at least one real document — which is a measurement of the
    // corpus, not a claim that every requirement can be verified: CSRD-S-011
    // and CSRD-S-012 still halt, over closures that are no longer empty.
    expect(empty.map((entry) => entry.id)).toEqual([]);
    expect(pack.requirements).toHaveLength(16);

    // **Empty closure is not the same question as gap-bearing.** `CSRD-S-011`
    // cites the served `SRC-001` and the unserved `SRC-008`, so it gaps over a
    // closure that is genuinely non-empty — and since T9 that is the only shape
    // left: two requirements halt, neither of them over nothing. Asserted here
    // so the set above is not
    // read as the pack's halt list.
    const eleven = pack.requirements.find((entry) => entry.id === 'CSRD-S-011')!;
    expect(EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), eleven.sources).docIds.length).toBeGreaterThan(0);
  });

  it('gaps on its one unserved source over a closure that is not empty', async () => {
    // **The T6 tooth.** Two cited sources, one of them now served: the closure
    // holds real text, exactly one `corpus_gap` remains, and the reader is
    // still never called. Closing a gap is not the same as becoming readable,
    // and a requirement that gained evidence without gaining reachability is
    // the case where those two could most easily be confused.
    expect(requirement).toBeDefined();
    if (requirement === undefined) throw new Error('unreachable');
    expect(requirement.sources).toEqual(['SRC-005', 'SRC-007']);

    const closure = EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), requirement.sources);
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
    expect(outcome.gaps).toEqual([...corpusGapsForUnservedSources(['SRC-007'])]);
    expect(outcome.gaps.map((gap) => gap.docId)).toEqual([undefined]);

    // Served and unserved, side by side on one requirement.
    expect(closure.corpusServes('SRC-005')).toBe(true);
    expect(closure.corpusServes('SRC-007')).toBe(false);
    expect(closure.docIds).toEqual(['DOC-32023R2772']);
    expect(closure.sha256).not.toBe(EMPTY_CLOSURE_SHA256);

    // And still nothing was asked of a model.
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
        closure: EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), requirement.sources),
      }),
      sourceIds: requirement.sources,
      prompt: prompts.reader,
      model: 'model-under-test',
      runner: stubRunner(() => JSON.stringify(wholeReading())),
    });
    const gaps = outcome.gaps;
    // The closure's own digest, not the empty constant: since T6 this
    // requirement halts over a closure that holds a document.
    const liveClosureSha = EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), requirement.sources).sha256;
    const accompanied = resultOver({
      requirementId: requirement.id,
      corpusClosureSha256: liveClosureSha,
      gaps,
    });
    // The identifiers land in the field their own register owns, checked
    // against the real corpus index and the real source register.
    expect(() => assertResultConsistency(accompanied, registers)).not.toThrow();

    // **The refusal half is about the record's shape, not about this corpus.**
    // The rule is that a result claiming an empty closure must carry gaps. It
    // once used CSRD-S-012, then CSRD-S-003 after T6 served SRC-005; T9 served
    // SRC-002 and no requirement opens onto an empty closure any more. Rather
    // than hunt for a fourth subject, the case is stated as what it actually
    // is: a *record* asserting `EMPTY_CLOSURE_SHA256` with no gaps is refused,
    // whatever the corpus happens to hold for that requirement today.
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
      closure: EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), requirement.sources),
      corpus: realCorpus,
      prompts,
      config: DEFAULT_ROLE_CONFIG,
      runner,
    });

    expect(outcome.halted).toBe(true);
    // No agent ran at all: no reader, and therefore no prosecutor and no
    // adjudicator either. `prosecutorCount` is 7, so the zero below is a halt
    // rather than a configuration that asks for nobody.
    expect(DEFAULT_ROLE_CONFIG.prosecutorCount).toBe(7);
    expect(runner.requests).toEqual([]);
    expect(outcome.executions.reader).toBeNull();
    expect(outcome.executions.prosecutors).toEqual([]);
    expect(outcome.executions.adjudicator).toBeNull();
    expect(outcome.transcript.roles).toEqual([]);

    // The tail still computed pins and collated the gap-bearing dossier: it
    // performs no substantive judgment, but a record that cannot be pinned is
    // Invalid whatever else is true of it.
    // Pinned over a real closure, not an empty one: T6 gave this requirement a
    // document while leaving it halted, so the tail must pin what was entitled
    // even though no role read it.
    expect(outcome.tail.pins.corpusClosureSha256).not.toBe(EMPTY_CLOSURE_SHA256);
    expect(outcome.tail.pins.corpus.map((pin) => pin.docId)).toEqual(['DOC-32023R2772']);
    expect(outcome.tail.gaps.map((gap) => gap.sourceId)).toEqual(['SRC-007']);

    // The positive control: a served requirement runs every role through the
    // same call, so the emptiness above is the halt and not a broken wiring.
    //
    // Selected by the property this control needs — **every** cited source
    // served — and not by `id !== requirement.id`, which is what it used to be.
    // That predicate was a sound proxy only while `CSRD-S-012` was the one
    // requirement that halted; four of sixteen halt now, so "not S-012" no longer
    // implies "runs to completion". It stayed green purely because the first
    // entry in `requirements.json` happens to be fully served, and a reorder of
    // that file — or ingesting the missing material — would have broken this
    // control for a reason with nothing to do with what it tests.
    const closureFor = (entry: (typeof pack.requirements)[number]) =>
      EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), entry.sources);
    const served = pack.requirements.find(
      (entry) =>
        entry.id !== requirement.id &&
        entry.sources.every((sourceId) => closureFor(entry).corpusServes(sourceId)),
    );
    if (served === undefined) throw new Error('the real pack has no fully served requirement');
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
      closure: EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), served.sources),
      corpus: realCorpus,
      prompts,
      config: DEFAULT_ROLE_CONFIG,
      runner: liveRunner,
    });
    expect(whole.halted).toBe(false);
    expect(whole.tail.gaps).toEqual([]);
    expect(liveRunner.requests).toHaveLength(2 + DEFAULT_ROLE_CONFIG.prosecutorCount);
    expect(whole.executions.adjudicator).not.toBeNull();
  });

  it('now holds a document outside other closures — the day the predecessor predicted', () => {
    // The predecessor of this test asserted that **no** document sat outside a
    // non-empty closure, and said in as many words that the day the corpus grew
    // a third document it would fail and its justification would have to be
    // rewritten rather than inherited. T6 is that day, so it is rewritten here.
    //
    // `DOC-32023R2772` serves only `SRC-005` and carries no edge, so it is
    // entitled for `CSRD-S-012` and outside every other requirement's closure —
    // which is the real-corpus shape `closure_gap` needs and could previously
    // only be exercised against the fixture corpus.
    const held = new Set(realCorpus.index.documents.map((document) => document.docId));
    expect(held).toContain('DOC-32023R2772');

    const closureOf = (id: string) => {
      const entry = pack.requirements.find((r) => r.id === id)!;
      return EntitledClosure.forSources(realCorpus, realRegister, csrdPack(), entry.sources);
    };
    expect(closureOf('CSRD-S-012').entitled('DOC-32023R2772')).toBe(true);
    expect(closureOf('CSRD-S-001').entitled('DOC-32023R2772')).toBe(false);

    // …and it is outside because nothing links it, not because it is unheld.
    const isolated = realCorpus.index.documents.find((d) => d.docId === 'DOC-32023R2772')!;
    expect(isolated.edges).toEqual([]);
  });
});
