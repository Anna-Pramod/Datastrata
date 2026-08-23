/**
 * The first authoritative record: one Complete `VerificationResult` assembled
 * from what Tasks 2, 3 and 4 actually returned.
 *
 * **Nothing in this file hand-builds a role object and hands it to assembly.**
 * Every result below is assembled from a `PipelineRunOutcome` that
 * `runVerificationPipeline` produced — the real reader gate, the real
 * prosecutor gate, the real coverage table with its qualified challenge ids,
 * the real `assembleChallenges` and the real `projectOpenQuestions`. What the
 * tests control is the *input side*: the requirement, the closure, the
 * configuration and the three role responses, replayed through the injected
 * runner. That distinction is the point of the task. Task 4 passed 44 of 46
 * tests against a schema its adjudicator's output could not satisfy, because
 * only two tests ever built a whole `ResultChallenge`; a test approximation of
 * the shape proves nothing about the shape.
 *
 * The two challenge propositions are deliberately distinguishable:
 *
 *     E-P   the prosecutor's basis    DOC-A, the operative-test sentence
 *     E-A   the adjudicator's basis   DOC-C, a different sentence
 *
 * Both are `EvidenceItem[]`, so crossing them compiles and every arity, presence
 * and `.min(1)` check stays green. Only an assertion that names the document and
 * the text can tell them apart — and each direction is named by its own test, so
 * a mutation that crosses them one way reds an assertion that could not have
 * fired for the other. A symmetric `not.toEqual()` would fire either way and
 * name neither.
 */

import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../src/corpus/hash';
import { assembleVerificationResult, ResultAssemblyError } from '../src/pipeline/assemble';
import { DEFAULT_ROLE_CONFIG, type RoleConfig } from '../src/pipeline/config';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { canonicaliseGapBearingRun, runVerificationPipeline } from '../src/pipeline/orchestrate';
import { loadPromptSet } from '../src/pipeline/prompts';
import { conditionPathsFor } from '../src/pipeline/prosecutors';
import type {
  AdjudicatorOutput,
  ProsecutorOutput,
  ReaderOutput,
} from '../src/pipeline/role-outputs';
import type { Condition, Requirement } from '../src/types';
import { requirementSha256 } from '../src/verification/canonical';
import { producePins } from '../src/verification/current-state';
import { registerVersion, VersionIntegrityError } from '../src/verification/registry';
import { RENDERER_VERSION } from '../src/verification/render';
import {
  ADVERSE_COVERAGE,
  assertResultConsistency,
  parseVerificationResult,
  ResultConsistencyError,
  type GapIdentityRegisters,
  type VerificationResult,
} from '../src/verification/result';
import {
  docText,
  fixtureCorpus,
  fixtureIndex,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  NOT_INGESTED,
  stubRunner,
} from './pipeline-fixtures';

const corpus = fixtureCorpus();
const prompts = loadPromptSet();
const renderContext = fixtureRenderContext();

/** Two atoms under one `all`, so the address vocabulary is richer than `root`. */
const COMPOUND: Condition = {
  op: 'all',
  of: [
    { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450_000_000 },
    { op: 'cmp', fact: 'entity.turnover', cmp: 'lt', value: 900_000_000 },
  ],
};

/**
 * The requirement, as a whole `Requirement`.
 *
 * Assembly takes one because `requirementSha256` — the hash the version
 * registry binds a version to — is defined over one. Both projected fields are
 * stripped by `requirementSchema` before either hash sees them, and the same
 * object is handed to the run, so the run and the assembly describe one subject
 * by construction rather than by two fixtures agreeing.
 *
 * This was the first caller to take a requirement through
 * `requirementSchema`, and so the first to find the shared fixture's
 * `relationshipClass` and `severity` outside the production enums. It carried
 * a local correction of both until Task 5b.1 repaired the fixture itself; the
 * override existed only for that, so it is gone and the values below are the
 * shared fixture's own. `derivedStatus` and `statusReasons` remain, because
 * those are the projected fields a `Requirement` has and an
 * `AuthoredRequirement` does not.
 */
function subject(overrides: Partial<Requirement> = {}): Requirement {
  return {
    ...fixtureRequirement({ condition: COMPOUND }),
    derivedStatus: 'draft',
    statusReasons: [],
    ...overrides,
  } as Requirement;
}

const REQUIREMENT = subject();

function closureForRun(): EntitledClosure {
  return EntitledClosure.forSources(corpus, REQUIREMENT.sources);
}

const CLOSURE = closureForRun();

/** The registry entry the declared version is checked against. */
const REGISTRY = registerVersion({}, REQUIREMENT.id, REQUIREMENT.version, requirementSha256(REQUIREMENT));

/**
 * The two registers 1.2.0's gap-identity rules are validated by.
 *
 * Files in production, handed in here — `src/verification/` opens none. Both
 * are populated, because a register the rule cannot look anything up in makes
 * every membership check vacuous.
 */
const REGISTERS: GapIdentityRegisters = {
  docIds: fixtureIndex().documents.map((document) => document.docId),
  sourceIds: ['SRC-100', 'SRC-900', 'SRC-901', 'SRC-999'],
};

// ---------------------------------------------------------------------------
// E-P and E-A
// ---------------------------------------------------------------------------

const EP_DOC = 'DOC-A';
const EP_TEXT = 'The operative test is stated here.';
const EA_DOC = 'DOC-C';
const EA_TEXT = 'Synthetic legal text for DOC-C.';

/** E-P — the prosecutor's basis. */
function evidenceP() {
  return {
    kind: 'quote' as const,
    docId: EP_DOC,
    sha256Normalized: sha256Hex(docText(EP_DOC)),
    text: EP_TEXT,
  };
}

/** E-A — the adjudicator's basis. A different document and different words. */
function evidenceA() {
  return {
    kind: 'quote' as const,
    docId: EA_DOC,
    sha256Normalized: sha256Hex(docText(EA_DOC)),
    text: EA_TEXT,
  };
}

/** The reader's own evidence, over a third document again. */
function evidenceR(docId = 'DOC-B') {
  return {
    kind: 'quote' as const,
    docId,
    sha256Normalized: sha256Hex(docText(docId)),
    text: `Synthetic legal text for ${docId}.`,
  };
}

// ---------------------------------------------------------------------------
// The three role responses the run replays
// ---------------------------------------------------------------------------

const PATHS = conditionPathsFor(REQUIREMENT, renderContext);

/** Guards the fixture: the addresses below must be this condition's own. */
const MAPPED_PATH = 'all[0]';
const UNSUPPORTED_PATH = 'all[1]';

function readingOutput(overrides: Partial<ReaderOutput> = {}): ReaderOutput {
  return {
    elements: [
      {
        id: 'RE-1',
        statement: 'The provision states a lower turnover bound.',
        evidence: [evidenceR('DOC-A')],
      },
      {
        id: 'RE-2',
        statement: 'The provision states an obligation the encoding does not carry.',
        evidence: [evidenceR('DOC-B')],
      },
    ],
    gaps: [],
    ...overrides,
  };
}

/**
 * One prosecutor: one mapped cell and two adverse ones, each naming its own
 * challenge.
 *
 * The `MAPPED` cell is the counterexample inside the same table — a table whose
 * every cell were adverse would satisfy "adverse coverage names a challenge"
 * without ever exercising the converse rule that a mapped cell names none.
 */
function prosecution(lens: string): ProsecutorOutput {
  return {
    lens,
    coverage: [
      {
        direction: 'reading_to_condition',
        readingElementId: 'RE-1',
        conditionPath: MAPPED_PATH,
        verdict: 'MAPPED',
      },
      { direction: 'reading_to_condition', readingElementId: 'RE-2', verdict: 'UNMAPPED', challengeId: 'C1' },
      { direction: 'condition_to_reading', conditionPath: UNSUPPORTED_PATH, verdict: 'UNSUPPORTED', challengeId: 'C2' },
    ],
    challenges: [
      { id: 'C1', lens, statement: 'The reading carries an element the encoding never states.', evidence: [evidenceP()] },
      { id: 'C2', lens, statement: 'The encoding states an upper bound the reading does not support.', evidence: [evidenceP()] },
    ],
    gaps: [],
  };
}

const MISMATCH_RESOLUTION =
  'DOC-C states the upper bound in terms the encoding does not carry; the challenge is upheld against the encoding.';

/**
 * One challenge settled and one left open, in the same response.
 *
 * The settled one is the positive control for the projection: an adjudicator
 * answering `OPEN_QUESTION` to everything would satisfy "the open one is
 * projected" and prove nothing about which verdicts the projection selects.
 */
function adjudication(overrides: Partial<AdjudicatorOutput> = {}): AdjudicatorOutput {
  return {
    adjudications: [
      { challengeId: 'P0-C1', verdict: 'MISMATCH', resolution: MISMATCH_RESOLUTION, evidence: [evidenceA()] },
      { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [evidenceA()] },
    ],
    gaps: [],
    ...overrides,
  };
}

const SINGLE_PROSECUTOR: RoleConfig = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 1 };

interface RunOverrides {
  requirement?: Requirement;
  reader?: ReaderOutput;
  /**
   * The prosecutor's response, so a *prosecutor*-origin halt is reachable.
   *
   * Added by Task 5b.3. Until then the only halt this file could drive was the
   * reader's — which is exactly the halt position the record invariant held for
   * incidentally, so the two positions where it did not hold had no test.
   */
  prosecutor?: ProsecutorOutput;
  adjudicator?: AdjudicatorOutput;
  resultSchemaVersion?: string;
}

/** One real run of the real pipeline over replayed role responses. */
function runPipeline(overrides: RunOverrides = {}) {
  const requirement = overrides.requirement ?? REQUIREMENT;
  return runVerificationPipeline({
    packId: 'testpack',
    requirementId: requirement.id,
    requirement,
    renderContext,
    closure: EntitledClosure.forSources(corpus, requirement.sources),
    corpus,
    prompts,
    config: SINGLE_PROSECUTOR,
    ...(overrides.resultSchemaVersion === undefined
      ? {}
      : { resultSchemaVersion: overrides.resultSchemaVersion }),
    runner: stubRunner((request) => {
      switch (request.role) {
        case 'reader':
          return JSON.stringify(overrides.reader ?? readingOutput());
        case 'prosecutor':
          return JSON.stringify(
            overrides.prosecutor === undefined
              ? prosecution(lensFromRequest(request))
              : { ...overrides.prosecutor, lens: lensFromRequest(request) },
          );
        case 'adjudicator':
          return JSON.stringify(overrides.adjudicator ?? adjudication());
      }
    }),
  });
}

/** The whole gate, end to end, exactly as production would run it. */
async function assembleFromRun(
  overrides: RunOverrides & { registry?: typeof REGISTRY; registers?: GapIdentityRegisters } = {},
): Promise<VerificationResult> {
  const run = await runPipeline(overrides);
  return assembleVerificationResult({
    run,
    requirement: overrides.requirement ?? REQUIREMENT,
    registry: overrides.registry ?? REGISTRY,
    registers: overrides.registers ?? REGISTERS,
  });
}

/** The thrown value, or a failure naming what was expected. */
async function refusalFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (thrown) {
    return thrown;
  }
  throw new Error('expected assembly to refuse, and it returned a record');
}

// ---------------------------------------------------------------------------
// The fixture's own preconditions
// ---------------------------------------------------------------------------

describe('the fixture addresses this condition', () => {
  it('uses two addresses the requirement actually carries', () => {
    // Otherwise the prosecutor gate would refuse for a fixture reason and every
    // red below would be about the fixture rather than about assembly.
    expect(PATHS).toContain(MAPPED_PATH);
    expect(PATHS).toContain(UNSUPPORTED_PATH);
  });

  it('gives E-P and E-A different documents and different words', () => {
    // The premise of every attribution assertion in this file.
    expect(evidenceP().docId).not.toBe(evidenceA().docId);
    expect(evidenceP().text).not.toBe(evidenceA().text);
    expect(CLOSURE.docIds).toContain(EP_DOC);
    expect(CLOSURE.docIds).toContain(EA_DOC);
  });
});

// ---------------------------------------------------------------------------
// The first authoritative result
// ---------------------------------------------------------------------------

describe('one Complete VerificationResult, from the actual role outputs', () => {
  it('parses under schema 1.2.0 and is the run’s own values', async () => {
    const run = await runPipeline();
    const assembled = assembleVerificationResult({
      run,
      requirement: REQUIREMENT,
      registry: REGISTRY,
      registers: REGISTERS,
    });

    // The acceptance: the authoritative shape, not an intermediate that
    // resembles it. Re-parsed here rather than trusted from assembly, so the
    // record this test inspects is one the current schema accepted.
    const parsed = parseVerificationResult(assembled, REGISTERS);
    expect(parsed).toEqual(assembled);
    expect(parsed.resultSchemaVersion).toBe('1.2.0');

    // Complete: every judgment container carries something and no gap does.
    expect(parsed.gaps).toEqual([]);
    expect(parsed.reading.elements.length).toBeGreaterThan(0);
    expect(parsed.coverage.cells.length).toBeGreaterThan(0);
    expect(parsed.challenges.length).toBeGreaterThan(0);

    // Field ownership, one producer at a time. `toBe` on the containers where
    // the producer hands over an array, because the object assembly received is
    // the object the role module returned — not one that merely equals it.
    expect(parsed.packId).toBe(run.tail.packId);
    expect(parsed.requirementId).toBe(run.tail.requirementId);
    expect(parsed.requirementVersion).toBe(REQUIREMENT.version);
    expect(parsed.pipelineVersion).toBe(run.pipelineVersion);
    expect(parsed.rendererVersion).toBe(RENDERER_VERSION);
    expect(parsed.requirementInputSha256).toBe(run.tail.pins.requirementInputSha256);
    expect(parsed.conditionSha256).toBe(run.tail.pins.conditionSha256);
    expect(parsed.renderedConditionSha256).toBe(run.tail.pins.renderedConditionSha256);
    expect(parsed.corpusClosureSha256).toBe(run.tail.pins.corpusClosureSha256);
    expect(parsed.reading.elements).toEqual(run.reader.output.elements);
    expect(parsed.coverage.cells).toEqual(run.prosecution.table.cells);
    expect(parsed.challenges).toEqual(run.adjudication!.challenges);
    expect(parsed.openQuestions).toEqual(run.adjudication!.openQuestions);
  });

  it('takes corpus[] from the shared pin producer, and walks the closure nowhere else', async () => {
    const run = await runPipeline();
    const assembled = assembleVerificationResult({
      run,
      requirement: REQUIREMENT,
      registry: REGISTRY,
      registers: REGISTERS,
    });

    // The pins the tail computed, and the pins `producePins` computes for the
    // same inputs, are the same pins. A second traversal in the assembler would
    // be free to differ — the defect Task 5a collapsed and this task must not
    // reintroduce.
    const shared = producePins({
      requirement: REQUIREMENT,
      renderContext,
      closure: CLOSURE.pinInput,
      corpus,
    });
    expect(assembled.corpus).toEqual(run.tail.pins.corpus);
    expect(assembled.corpus).toEqual(shared.corpus);
    // Every pin is five fields wide, including the label `producePins` is the
    // only producer of — the join Task 5's blocking precondition was about.
    for (const pin of assembled.corpus) {
      expect(Object.keys(pin).sort()).toEqual([
        'docId',
        'normalizerVersion',
        'sha256Normalized',
        'sha256Raw',
        'versionLabel',
      ]);
      expect(pin.versionLabel.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-field consistency, over the real registers
// ---------------------------------------------------------------------------

describe('cross-field consistency, by the central 1.2.0 rules', () => {
  it('links every adverse cell to a challenge and leaves the mapped one alone', async () => {
    const assembled = await assembleFromRun();
    expect(() => assertResultConsistency(assembled, REGISTERS)).not.toThrow();

    const ids = new Set(assembled.challenges.map((challenge) => challenge.id));
    const adverse = assembled.coverage.cells.filter((cell) => ADVERSE_COVERAGE.has(cell.verdict));
    const mapped = assembled.coverage.cells.filter((cell) => !ADVERSE_COVERAGE.has(cell.verdict));

    // Both populations non-empty, so neither claim passes vacuously.
    expect(adverse.length).toBeGreaterThan(0);
    expect(mapped.length).toBeGreaterThan(0);
    for (const cell of adverse) expect(ids.has(cell.challengeId!)).toBe(true);
    for (const cell of mapped) expect(cell.challengeId).toBeUndefined();

    // The ids are the prosecutors' qualification, not the raw role ids.
    expect([...ids].sort()).toEqual(['P0-C1', 'P0-C2']);
  });

  it('projects openQuestions[] exactly from the OPEN_QUESTION verdicts', async () => {
    const assembled = await assembleFromRun();
    const open = assembled.challenges.filter((challenge) => challenge.verdict === 'OPEN_QUESTION');
    const settled = assembled.challenges.filter((challenge) => challenge.verdict !== 'OPEN_QUESTION');

    // The counterexample beside the claim: a record whose every verdict were
    // OPEN_QUESTION would satisfy the projection without exercising selection.
    expect(open).toHaveLength(1);
    expect(settled).toHaveLength(1);
    expect(settled[0]!.verdict).toBe('MISMATCH');

    expect(assembled.openQuestions).toEqual(
      open.map((challenge) => ({ id: challenge.id, statement: challenge.statement })),
    );
    expect(assembled.openQuestions.map((question) => question.id)).not.toContain(settled[0]!.id);
  });

  it('binds both evidence arrays to the corpus this record pins, separately', async () => {
    const assembled = await assembleFromRun();
    const pinned = new Map(assembled.corpus.map((pin) => [pin.docId, pin.sha256Normalized]));

    const quotesOf = (items: readonly unknown[]) =>
      items.map((item) => item as { docId: string; sha256Normalized: string });

    for (const element of assembled.reading.elements) {
      for (const quote of quotesOf(element.evidence)) {
        expect(pinned.get(quote.docId)).toBe(quote.sha256Normalized);
      }
    }
    for (const challenge of assembled.challenges) {
      for (const quote of quotesOf(challenge.evidence)) {
        expect(pinned.get(quote.docId)).toBe(quote.sha256Normalized);
      }
      for (const quote of quotesOf(challenge.adjudicationEvidence)) {
        expect(pinned.get(quote.docId)).toBe(quote.sha256Normalized);
      }
    }
  });

  it('keeps gaps and judgments exclusive, in both directions', async () => {
    const complete = await assembleFromRun();
    expect(complete.gaps).toEqual([]);
    expect(complete.challenges.length).toBeGreaterThan(0);

    // The positive control: a run that did halt writes the gap and canonically
    // empty containers, and it parses. Without this case "gaps is empty" above
    // would be satisfied by a pipeline that can never record a gap at all.
    const halted = await assembleFromRun({
      reader: readingOutput({
        elements: [],
        gaps: [{ kind: 'corpus_gap', docId: NOT_INGESTED, detail: 'the reader needed it and it is not ingested' }],
      }),
    });
    expect(halted.gaps.length).toBeGreaterThan(0);
    expect(halted.gaps[0]!.docId).toBe(NOT_INGESTED);
    expect(halted.reading.elements).toEqual([]);
    expect(halted.coverage.cells).toEqual([]);
    expect(halted.challenges).toEqual([]);
    expect(halted.openQuestions).toEqual([]);
    expect(() => assertResultConsistency(halted, REGISTERS)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// E-P and E-A, each named by its own assertion
// ---------------------------------------------------------------------------

describe('the two challenge propositions survive assembly', () => {
  it('records the PROSECUTOR’s evidence, and only that, in challenge.evidence', async () => {
    const assembled = await assembleFromRun();
    expect(assembled.challenges.length).toBeGreaterThan(0);
    for (const challenge of assembled.challenges) {
      const items = challenge.evidence.map((item) => item as { docId: string; text: string });
      // Names E-P by document and by text. This assertion cannot fire for the
      // opposite crossing: writing E-P into `adjudicationEvidence` leaves this
      // array untouched.
      expect(items.map((item) => item.docId)).toEqual([EP_DOC]);
      expect(items.map((item) => item.text)).toEqual([EP_TEXT]);
    }
  });

  it('records the ADJUDICATOR’s evidence, and only that, in adjudicationEvidence', async () => {
    const assembled = await assembleFromRun();
    expect(assembled.challenges.length).toBeGreaterThan(0);
    for (const challenge of assembled.challenges) {
      const items = challenge.adjudicationEvidence.map((item) => item as { docId: string; text: string });
      // Names E-A by document and by text, and cannot fire for the opposite
      // crossing for the mirror-image reason.
      expect(items.map((item) => item.docId)).toEqual([EA_DOC]);
      expect(items.map((item) => item.text)).toEqual([EA_TEXT]);
    }
  });

  it('carries adjudicationEvidence under every verdict, OPEN_QUESTION included', async () => {
    const assembled = await assembleFromRun();
    const byVerdict = new Map(assembled.challenges.map((challenge) => [challenge.verdict, challenge]));
    expect([...byVerdict.keys()].sort()).toEqual(['MISMATCH', 'OPEN_QUESTION']);
    for (const challenge of byVerdict.values()) {
      expect(challenge.adjudicationEvidence.length).toBeGreaterThan(0);
    }
    // The open question has evidence and no resolution — the asymmetry 1.2.0
    // exists to make representable.
    expect(byVerdict.get('OPEN_QUESTION')!.resolution).toBeUndefined();
    expect(byVerdict.get('MISMATCH')!.resolution).toBe(MISMATCH_RESOLUTION);
  });
});

// ---------------------------------------------------------------------------
// Every gate, reached through the production assembly entry point
// ---------------------------------------------------------------------------

describe('assembly refuses rather than repairs', () => {
  /**
   * A registry that records the substitute as faithfully as the subject.
   *
   * Without it the registry gate fires first on any substitute — the version
   * would simply be unregistered — and "assembly refused" would prove nothing
   * about the binding checks, because a defect a later gate also catches cannot
   * establish that the earlier one runs. Registered, the only thing standing
   * between a substituted requirement and a record that parses clean is
   * `assertRequirementIsTheRunSubject`.
   */
  function registryFor(...requirements: readonly Requirement[]) {
    return requirements.reduce(
      (registry, requirement) =>
        registerVersion(registry, requirement.id, requirement.version, requirementSha256(requirement)),
      REGISTRY,
    );
  }

  it('refuses a requirement whose verification input the run never pinned', async () => {
    // Same id, different provisions: `requirementInputSha256` moves and the id
    // check cannot fire, so a red here names this gate alone. The substitute is
    // registered, so the registry gate has nothing to say about it.
    const other = subject({ provisions: 'Some Other Act Art. 9', version: 2 });
    const run = await runPipeline();
    const error = await refusalFrom(
      Promise.resolve().then(() =>
        assembleVerificationResult({
          run,
          requirement: other,
          registry: registryFor(other),
          registers: REGISTERS,
        }),
      ),
    );
    expect(error).toBeInstanceOf(ResultAssemblyError);
    const problems = (error as ResultAssemblyError).problems.join(' ');
    expect(problems).toContain('requirementInputSha256');
    expect(problems).not.toContain('requirementId:');
  });

  it('refuses a requirement the run does not identify', async () => {
    // Different id, identical verification input — `requirementInputSha256`
    // covers provisions, sources and the logical payload, and not the id — so a
    // red here names the identity check alone. Registered for the same reason.
    const other = subject({ id: 'TEST-R-999' });
    const run = await runPipeline();
    const error = await refusalFrom(
      Promise.resolve().then(() =>
        assembleVerificationResult({
          run,
          requirement: other,
          registry: registryFor(other),
          registers: REGISTERS,
        }),
      ),
    );
    expect(error).toBeInstanceOf(ResultAssemblyError);
    const problems = (error as ResultAssemblyError).problems.join(' ');
    expect(problems).toContain('requirementId');
    expect(problems).not.toContain('requirementInputSha256');
  });

  it('refuses a declared version the registry does not record', async () => {
    const error = await refusalFrom(assembleFromRun({ registry: {} }));
    expect(error).toBeInstanceOf(VersionIntegrityError);
    expect((error as VersionIntegrityError).problems.join(' ')).toContain('not recorded in the registry');
  });

  it('refuses a record written against a schema version this shape is not', async () => {
    // Structural, and produced by the real run: `resultSchemaVersion` is handed
    // down by orchestration and the schema's literal is what refuses it.
    const error = await refusalFrom(assembleFromRun({ resultSchemaVersion: '1.1.0' }));
    expect(String(error)).toContain('resultSchemaVersion');
    expect(error).not.toBeInstanceOf(ResultConsistencyError);
  });

  it('refuses evidence that does not rest on the corpus this record pins', async () => {
    // Cross-field only: the role seams check evidence kinds and cardinality and
    // nothing checks a quote's hash against the pins until the record exists.
    const error = await refusalFrom(
      assembleFromRun({
        reader: readingOutput({
          elements: [
            {
              id: 'RE-1',
              statement: 'The provision states a lower turnover bound.',
              evidence: [{ kind: 'quote', docId: 'DOC-A', sha256Normalized: sha256Hex('not the pinned text'), text: EP_TEXT }],
            },
            {
              id: 'RE-2',
              statement: 'The provision states an obligation the encoding does not carry.',
              evidence: [evidenceR('DOC-B')],
            },
          ],
        }),
      }),
    );
    expect(error).toBeInstanceOf(ResultConsistencyError);
    const problems = (error as ResultConsistencyError).problems.join(' ');
    expect(problems).toContain('reading.elements[0] (RE-1).evidence[0]');
    expect(problems).toContain('corpus[] pins it at');
  });

  it('refuses a gap that records a source id in the field documents own', async () => {
    // The register rule, and only it: with no registers the same record passes
    // every cardinality check, because `corpus_gap` + one identity is exactly
    // what this is. It is the central 1.2.0 rule that tells the two apart.
    const error = await refusalFrom(
      assembleFromRun({
        reader: readingOutput({
          elements: [],
          gaps: [{ kind: 'corpus_gap', docId: 'SRC-100', detail: 'nothing in the corpus serves it' }],
        }),
      }),
    );
    expect(error).toBeInstanceOf(ResultConsistencyError);
    const problems = (error as ResultConsistencyError).problems.join(' ');
    expect(problems).toContain('names an entry in the source register, not a document');

    // The positive control for the register: the same shape over an identifier
    // that really is a document id is accepted, so the refusal above tracks the
    // register rather than firing at every corpus_gap.
    const accepted = await assembleFromRun({
      reader: readingOutput({
        elements: [],
        gaps: [{ kind: 'corpus_gap', docId: NOT_INGESTED, detail: 'an expected document is absent' }],
      }),
    });
    expect(accepted.gaps[0]!.docId).toBe(NOT_INGESTED);
  });
});

// ---------------------------------------------------------------------------
// Whole-run gap canonicalisation, from all three gap origins
// ---------------------------------------------------------------------------

/**
 * A gap found anywhere invalidates every judgment formed earlier in that run.
 *
 * Before Task 5b.3 each role canonicalised only *its own* output, so the record
 * invariant held for a reader-origin gap and for nothing else — and only
 * incidentally, because the reader runs first and the downstream roles never
 * ran. A prosecutor-origin gap carried `reading.elements` into the record and an
 * adjudicator-origin gap carried `reading.elements` and `coverage.cells`; both
 * assembled to **Invalid**, and Invalid writes nothing, so two of the three
 * legitimate gap producers silently destroyed the gap they had found. Neither
 * case had a test, because neither was reachable from this file's fixtures.
 *
 * The three gaps below are deliberately distinguishable — a different `docId`
 * each, a different classified `kind` for the prosecutor's, and a marker word in
 * each `detail` — so an assertion that the right gap survived cannot be
 * satisfied by the wrong one. `gaps.length === 1` is never the whole claim.
 */
const READER_GAP_MARK = 'READER-ORIGIN';
const PROSECUTOR_GAP_MARK = 'PROSECUTOR-ORIGIN';
const ADJUDICATOR_GAP_MARK = 'ADJUDICATOR-ORIGIN';

/** Absent from the fixture corpus entirely: the machinery classifies `corpus_gap`. */
const READER_GAP = {
  kind: 'corpus_gap' as const,
  docId: NOT_INGESTED,
  detail: `${READER_GAP_MARK}: the reader needed the consolidating instrument`,
};

/** In the corpus, outside the closure at reference depth 2: `closure_gap`. */
const PROSECUTOR_GAP = {
  kind: 'closure_gap' as const,
  docId: 'DOC-D',
  detail: `${PROSECUTOR_GAP_MARK}: the lens needed the referenced implementing act`,
};

/** In the corpus, connected to nothing, so outside the closure: `closure_gap`. */
const ADJUDICATOR_GAP = {
  kind: 'closure_gap' as const,
  docId: 'DOC-Z',
  detail: `${ADJUDICATOR_GAP_MARK}: the adjudicator needed the unconnected annex`,
};

/** A prosecutor that halts, and produced no table of its own to be cleared. */
function prosecutionHalting(): ProsecutorOutput {
  return { lens: 'placeholder', coverage: [], challenges: [], gaps: [PROSECUTOR_GAP] };
}

/**
 * The one gap of a halted run, checked field by field against what the role
 * said.
 *
 * `detail` is checked by containment rather than equality on purpose: the
 * machinery prefixes the role's own words onto its own explanation of the
 * class, and asserting the composed string here would reproduce
 * `gapForUnreachableDocument`'s formatting rule in the test that is supposed to
 * be independent of it. What must survive exactly is the role's own sentence,
 * and the marker is how that is named.
 */
function expectOneGap(
  gaps: readonly { kind: string; docId?: string; sourceId?: string; detail: string }[],
  expected: { kind: string; docId: string; mark: string },
  absentMarks: readonly string[],
): void {
  expect(gaps).toHaveLength(1);
  const gap = gaps[0]!;
  // Soft, so one mutation of the gap names every field it moved rather than
  // only the first: `kind`, `docId`, the identity field it does *not* occupy,
  // and the role's own words are four separate claims about provenance.
  expect.soft(gap.kind).toBe(expected.kind);
  expect.soft(gap.docId).toBe(expected.docId);
  expect.soft(gap.sourceId).toBeUndefined();
  expect.soft(gap.detail).toContain(expected.mark);
  for (const mark of absentMarks) expect.soft(gap.detail).not.toContain(mark);
}

describe('a gap found at any role produces one canonical gap-bearing record', () => {
  it('reader-origin: the run and the record carry the reader’s gap and no judgment', async () => {
    const run = await runPipeline({ reader: readingOutput({ elements: [], gaps: [READER_GAP] }) });

    // The canonical run shape, container by container, so a red here names the
    // container that survived rather than only "the record is invalid".
    expect.soft(run.reader.output.elements).toEqual([]);
    expect.soft(run.prosecution.table.cells).toEqual([]);
    expect(run.adjudication).toBeNull();

    // Nothing downstream of the reader ran at all — the halt, not merely an
    // empty answer from a prosecutor that was asked.
    expect(run.executions.prosecutors).toEqual([]);
    expect(run.executions.adjudicator).toBeNull();

    const assembled = assembleVerificationResult({
      run,
      requirement: REQUIREMENT,
      registry: REGISTRY,
      registers: REGISTERS,
    });
    expect(assembled.reading.elements).toEqual([]);
    expect(assembled.coverage.cells).toEqual([]);
    expect(assembled.challenges).toEqual([]);
    expect(assembled.openQuestions).toEqual([]);

    // Provenance: the role's gap, the run's gap and the record's gap are one
    // gap, and it is this origin's rather than another's.
    expectOneGap(assembled.gaps, { kind: 'corpus_gap', docId: NOT_INGESTED, mark: READER_GAP_MARK }, [
      PROSECUTOR_GAP_MARK,
      ADJUDICATOR_GAP_MARK,
    ]);
    expect(run.tail.gaps).toEqual(run.reader.gaps);
    expect(assembled.gaps).toEqual(run.reader.gaps);
  });

  it('prosecutor-origin: the reading that existed before the halt reaches neither run nor record', async () => {
    const run = await runPipeline({ prosecutor: prosecutionHalting() });

    // The judgments genuinely existed. Read off the reader's own parsed
    // response, which canonicalisation does not touch — without this the test
    // would pass against a fixture whose upstream output was already empty, and
    // would prove nothing about the defect.
    expect(run.executions.reader!.output.elements.map((element) => element.id)).toEqual([
      'RE-1',
      'RE-2',
    ]);

    // And they are gone from the run handed downstream. This is the assertion
    // the defect reddens: before Task 5b.3 `reading.elements` survived here.
    //
    // Soft, so a mutant that leaves more than one container populated names
    // every one of them rather than stopping at the first — the difference
    // between a failure that identifies the surviving judgment and one that
    // says only that something is wrong.
    expect.soft(run.reader.output.elements).toEqual([]);
    expect.soft(run.prosecution.table.cells).toEqual([]);
    expect(run.adjudication).toBeNull();
    expect(run.executions.adjudicator).toBeNull();

    const assembled = assembleVerificationResult({
      run,
      requirement: REQUIREMENT,
      registry: REGISTRY,
      registers: REGISTERS,
    });
    expect(assembled.reading.elements).toEqual([]);
    expect(assembled.coverage.cells).toEqual([]);
    expect(assembled.challenges).toEqual([]);
    expect(assembled.openQuestions).toEqual([]);

    expectOneGap(assembled.gaps, { kind: 'closure_gap', docId: 'DOC-D', mark: PROSECUTOR_GAP_MARK }, [
      READER_GAP_MARK,
      ADJUDICATOR_GAP_MARK,
    ]);
    expect(run.tail.gaps).toEqual(run.prosecution.gaps);
    expect(assembled.gaps).toEqual(run.prosecution.gaps);
  });

  it('adjudicator-origin: the reading and the coverage table shown to it reach neither run nor record', async () => {
    const run = await runPipeline({ adjudicator: adjudication({ gaps: [ADJUDICATOR_GAP] }) });

    // The judgments genuinely existed, and this is what the adjudicator was
    // actually handed: its own input still points at the reading and the table
    // that were live when it halted. Two containers, named separately, because
    // the adjudicator-origin defect discarded two.
    expect(run.adjudication!.input.reading.elements.map((element) => element.id)).toEqual([
      'RE-1',
      'RE-2',
    ]);
    expect(run.adjudication!.input.coverage.length).toBeGreaterThan(0);
    expect(run.executions.prosecutors[0]!.output.coverage.length).toBeGreaterThan(0);
    // The adjudicator had formed verdicts of its own before it stopped.
    expect(run.executions.adjudicator!.output.adjudications.length).toBeGreaterThan(0);

    // And none of it reaches the run handed downstream. Soft, for the reason
    // the prosecutor-origin test gives: this origin's defect left *two*
    // containers populated, and a failure naming only the first would not say
    // which judgments survived.
    expect.soft(run.reader.output.elements).toEqual([]);
    expect.soft(run.prosecution.table.cells).toEqual([]);
    expect.soft(run.adjudication!.challenges).toEqual([]);
    expect.soft(run.adjudication!.openQuestions).toEqual([]);

    const assembled = assembleVerificationResult({
      run,
      requirement: REQUIREMENT,
      registry: REGISTRY,
      registers: REGISTERS,
    });
    expect(assembled.reading.elements).toEqual([]);
    expect(assembled.coverage.cells).toEqual([]);
    expect(assembled.challenges).toEqual([]);
    expect(assembled.openQuestions).toEqual([]);

    expectOneGap(assembled.gaps, { kind: 'closure_gap', docId: 'DOC-Z', mark: ADJUDICATOR_GAP_MARK }, [
      READER_GAP_MARK,
      PROSECUTOR_GAP_MARK,
    ]);
    expect(run.tail.gaps).toEqual(run.adjudication!.gaps);
    expect(assembled.gaps).toEqual(run.adjudication!.gaps);
  });

  it('clears all four containers of a run that populated all four, and leaves the original alone', async () => {
    // The canonicaliser's own contract, over the shape the defect produced: a
    // run whose four judgment containers are full, beside a gap. No role path
    // reaches that today — a halting adjudicator discards its own adjudications
    // and an earlier halt never has one — so `challenges` and `openQuestions`
    // have no end-to-end mutant, and this is where those two clears are held to
    // account. Nothing here is written by hand: the judgments come from a real
    // complete run and the gap from a real halted one.
    const complete = await runPipeline();
    expect(complete.tail.gaps).toEqual([]);
    expect(complete.reader.output.elements.length).toBeGreaterThan(0);
    expect(complete.prosecution.table.cells.length).toBeGreaterThan(0);
    expect(complete.adjudication!.challenges.length).toBeGreaterThan(0);
    expect(complete.adjudication!.openQuestions.length).toBeGreaterThan(0);

    const halted = await runPipeline({ prosecutor: prosecutionHalting() });
    expect(halted.tail.gaps).toHaveLength(1);

    const hybrid = {
      ...complete,
      tail: { ...complete.tail, gaps: halted.tail.gaps },
      halted: true,
    };
    const canonical = canonicaliseGapBearingRun(hybrid);

    expect.soft(canonical.reader.output.elements).toEqual([]);
    expect.soft(canonical.prosecution.table.cells).toEqual([]);
    expect.soft(canonical.adjudication!.challenges).toEqual([]);
    expect.soft(canonical.adjudication!.openQuestions).toEqual([]);
    expect(canonical.tail.gaps).toEqual(halted.tail.gaps);

    // Immutably. The adjudicator's input and the raw executions are the record
    // of what the run held before it stopped, and clearing in place would erase
    // it — which would also make every "it existed first" assertion above
    // vacuous.
    expect.soft(complete.reader.output.elements.length).toBeGreaterThan(0);
    expect.soft(complete.prosecution.table.cells.length).toBeGreaterThan(0);
    expect.soft(complete.adjudication!.challenges.length).toBeGreaterThan(0);
    expect.soft(complete.adjudication!.openQuestions.length).toBeGreaterThan(0);

    // Non-judgment run metadata survives: the pins, the identities and the
    // transcript are what a gap-bearing record still needs.
    // Soft: four separate things a canonicalisation could drop, and a mutant
    // that drops more than one should name each.
    expect.soft(canonical.tail.pins).toEqual(complete.tail.pins);
    expect.soft(canonical.pipelineVersion).toBe(complete.pipelineVersion);
    expect.soft(canonical.runId).toBe(complete.runId);
    expect.soft(canonical.transcript).toEqual(complete.transcript);

    const assembled = assembleVerificationResult({
      run: canonical,
      requirement: REQUIREMENT,
      registry: REGISTRY,
      registers: REGISTERS,
    });
    expect(assembled.reading.elements).toEqual([]);
    expect(assembled.coverage.cells).toEqual([]);
    expect(assembled.challenges).toEqual([]);
    expect(assembled.openQuestions).toEqual([]);
    expectOneGap(assembled.gaps, { kind: 'closure_gap', docId: 'DOC-D', mark: PROSECUTOR_GAP_MARK }, [
      READER_GAP_MARK,
      ADJUDICATOR_GAP_MARK,
    ]);
  });

  it('leaves an OPEN_QUESTION result alone: a complete surface keeps its judgments', async () => {
    // `OPEN_QUESTION` is not a gap and must never be canonicalised as one. An
    // unresolved proposition over a *complete* evidence surface is a finding the
    // record keeps in full; an incomplete surface is what discards judgments.
    const run = await runPipeline();
    expect(run.tail.gaps).toEqual([]);
    expect(run.adjudication!.openQuestions.length).toBeGreaterThan(0);

    // By identity: a run with no gap comes back as the same object, so nothing
    // was rebuilt and nothing could have been cleared on the way through.
    expect(canonicaliseGapBearingRun(run)).toBe(run);

    const assembled = assembleVerificationResult({
      run,
      requirement: REQUIREMENT,
      registry: REGISTRY,
      registers: REGISTERS,
    });
    expect(assembled.gaps).toEqual([]);
    expect(assembled.openQuestions.map((question) => question.id)).toEqual(['P0-C2']);
    expect(assembled.reading.elements.length).toBeGreaterThan(0);
    expect(assembled.coverage.cells.length).toBeGreaterThan(0);
    expect(assembled.challenges.length).toBeGreaterThan(0);
    expect(assembled.challenges.some((challenge) => challenge.verdict === 'OPEN_QUESTION')).toBe(true);
  });
});
