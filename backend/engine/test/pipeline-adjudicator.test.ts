/**
 * The adjudicator — §3.3 — and the `openQuestions[]` projection.
 *
 * **What this file does not claim.** Nothing here is evidence about what a live
 * adjudicator decides. Every adjudication below is a canned response replayed
 * through the real seam; whether a model reaches the right verdict on a real
 * law is a B3 benchmark property and §5.2 says only a live run tests the
 * agents. Every check here is about machinery: the projection, the input
 * boundary, the gates, and whether production actually invokes them.
 *
 * **Every gate is proved twice.** The plan's Global Constraints require it:
 * *a gate is not tested until its removal from the production path reddens
 * something.* A direct call proves the function; only a run through
 * `runVerificationPipeline` or `runAdjudicator` proves the wiring. Each section
 * below carries both layers, and the mutation that must redden the second is
 * named in the section header.
 *
 * The failure modes from `docs/superpowers/TEST-EVIDENCE-STANDARD.md` this file
 * is written against:
 *
 *  - **#1** — the projection is compared against a set derived independently in
 *    the test from `challenges[].verdict`, not against a second call to
 *    `projectOpenQuestions`, which would agree with its own mistakes.
 *  - **#4** — `CONFIRMED` and `MISMATCH` are enforced through separate entries
 *    of `RESOLUTION_REQUIRED_BY_VERDICT`, and each is exercised alone so
 *    neither can mask the other. The input-widening gate is additionally called
 *    directly with an input its natural caller cannot construct.
 *  - **#5 / #7** — every refusal is paired with the case where the same seam
 *    accepts, and every "does not appear" with a case where it does. The
 *    unresolvable challenge that stays `OPEN_QUESTION` sits in the *same*
 *    adjudication as a resolvable one that reaches `CONFIRMED`, so an
 *    adjudicator returning `OPEN_QUESTION` for everything cannot pass.
 *  - **compile boundary** — asserted with `@ts-expect-error`, which
 *    `npm run typecheck` fails on if the line ever *would* compile. A runtime
 *    assertion in its place would pass unconditionally.
 *
 * **The sign gate is deliberately not the evidence for the projection.**
 * `sign.ts` refuses on a challenge verdicted `OPEN_QUESTION` *and* on every
 * `openQuestions[]` entry, so in the valid design both refusals fire together
 * and "signing was refused" says nothing about which producer wrote the list.
 * Set equality — ids and statements, not cardinality — is what is asserted.
 */

import { describe, expect, it } from 'vitest';
import {
  adjudicatorInputFor,
  assembleChallenges,
  assertAdjudication,
  assertAdjudicatorInputFields,
  AdjudicatorInputWidenedError,
  ADJUDICATOR_INPUT_FIELDS,
  projectOpenQuestions,
  renderAdjudicatorInput,
  RESOLUTION_REQUIRED_BY_VERDICT,
  runAdjudicator,
  type AdjudicatorChallenge,
  type AdjudicatorInput,
  type ReasoningFree,
  type ResultChallenge,
} from '../src/pipeline/adjudicator';
import { DEFAULT_ROLE_CONFIG, lensFor, type RoleConfig } from '../src/pipeline/config';
import { EntitledClosure, renderEntitledClosure } from '../src/pipeline/entitlement';
import { loadPromptSet } from '../src/pipeline/prompts';
import {
  adjudicatorOutputSchema,
  parseRoleOutput,
  type AdjudicatorOutput,
  type ProsecutorOutput,
  type ReaderOutput,
} from '../src/pipeline/role-outputs';
import { RoleOutputError, type RoleExecution } from '../src/pipeline/roles';
import { buildCoverageTable, type CoverageTable } from '../src/pipeline/prosecutors';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import type { RoleTranscript } from '../src/pipeline/transcript';
import {
  assertResultConsistency,
  challengeVerdictSchema,
  parseVerificationResult,
  RESOLVED_VERDICTS,
} from '../src/verification/result';
import { sha256Hex } from '../src/corpus/hash';
import type { AuthoredRequirement, Condition } from '../src/types';
import {
  docText,
  fixtureCorpus,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  NOT_INGESTED,
  stubReaderOutput,
  stubRunner,
} from './pipeline-fixtures';

const corpus = fixtureCorpus();
const prompts = loadPromptSet();
const ctxRender = fixtureRenderContext();

function fixtureClosure(): EntitledClosure {
  return EntitledClosure.forSources(corpus, ['SRC-100']);
}

function quote(text = 'The operative test is stated here.') {
  return {
    kind: 'quote' as const,
    docId: 'DOC-A',
    sha256Normalized: sha256Hex(docText('DOC-A')),
    text,
  };
}

/**
 * **E-A** — the *adjudicator's* evidence, deliberately unlike `quote()` above.
 *
 * `quote()` is **E-P**, the prosecutor's: `DOC-A`, and the operative-test
 * sentence. This one names a **different document** (`DOC-C`, also inside the
 * SRC-100 closure) and quotes **different text**. Both differences are
 * load-bearing. `evidence` and `adjudicationEvidence` are both
 * `EvidenceItem[]`, so the type system cannot tell them apart and crossing them
 * compiles; if the two fixtures held the same quote, a record that wrote the
 * prosecutor's reasoning into the adjudicator's field would look identical to a
 * correct one, and every arity and presence check would stay green. Task 3.5's
 * own fixtures split `DOC-1`/`DOC-2` for exactly this reason.
 */
const ADJUDICATION_QUOTE_TEXT = 'Synthetic legal text for DOC-C.';

function quoteA(text = ADJUDICATION_QUOTE_TEXT) {
  return {
    kind: 'quote' as const,
    docId: 'DOC-C',
    sha256Normalized: sha256Hex(docText('DOC-C')),
    text,
  };
}

/** Sole-absence evidence: checkable lexically, and never sufficient alone. */
function absence(term = 'consolidated group') {
  return { kind: 'absence' as const, docIds: ['DOC-A'], term };
}

/** The same, over the document the adjudicator quotes. */
function absenceA(term = 'consolidated group') {
  return { kind: 'absence' as const, docIds: ['DOC-C'], term };
}

/** Two atoms under one `all`, so the address vocabulary has more than `root`. */
const COMPOUND: Condition = {
  op: 'all',
  of: [
    { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450_000_000 },
    { op: 'cmp', fact: 'entity.turnover', cmp: 'lt', value: 900_000_000 },
  ],
};

function compoundRequirement(): AuthoredRequirement {
  return fixtureRequirement({ condition: COMPOUND });
}

function reading(ids: readonly string[] = ['RE-1']): ReaderOutput {
  return {
    elements: ids.map((id) => ({ id, statement: `reading element ${id}`, evidence: [quote()] })),
    gaps: [],
  };
}

function seed(id: string, lens = 'missing_criterion'): AdjudicatorChallenge {
  return { id, lens, statement: `challenge ${id}`, evidence: [quote()] };
}

function tableOf(challenges: readonly AdjudicatorChallenge[]): CoverageTable {
  return { cells: [], challenges: [...challenges] };
}

function inputWith(challenges: readonly AdjudicatorChallenge[]): AdjudicatorInput {
  return adjudicatorInputFor({
    reading: reading(),
    renderedCondition: 'the encoding, in English',
    table: tableOf(challenges),
    closure: fixtureClosure(),
  });
}

// ---------------------------------------------------------------------------
// A run that produces real challenges to adjudicate
// ---------------------------------------------------------------------------

/**
 * One prosecutor raising two challenges, one per direction.
 *
 * Both cells are adverse and each names its own challenge, which is Task 3's
 * rule and not re-checked here. Two directions because the *panel* table must
 * carry both; nothing below asks a single prosecutor to be bidirectional, and
 * nothing below may come to.
 */
function prosecutionRaising(lens: string): ProsecutorOutput {
  return {
    lens,
    coverage: [
      {
        direction: 'reading_to_condition',
        readingElementId: 'RE-STUB',
        verdict: 'UNMAPPED',
        challengeId: 'C1',
      },
      { direction: 'condition_to_reading', conditionPath: 'all[1]', verdict: 'UNSUPPORTED', challengeId: 'C2' },
    ],
    challenges: [
      { id: 'C1', lens, statement: 'challenge C1', evidence: [quote()] },
      { id: 'C2', lens, statement: 'challenge C2', evidence: [quote()] },
    ],
    gaps: [],
  };
}

/**
 * The adjudication the run replays: one challenge settled, one left open.
 *
 * The positive control is inside the same response, deliberately. An
 * adjudicator that returned `OPEN_QUESTION` for everything would satisfy "the
 * unresolvable one stayed open" and prove nothing (failure mode #5), so `P0-C1`
 * must reach `CONFIRMED` *with* a resolution in the very same output.
 */
const CONFIRMED_RESOLUTION =
  'DOC-A Article 1 states the operative test in the terms the encoding uses; the challenge rests on a reading the quoted text does not support.';

function adjudicationFor(overrides: Partial<AdjudicatorOutput> = {}): AdjudicatorOutput {
  return {
    adjudications: [
      {
        challengeId: 'P0-C1',
        verdict: 'CONFIRMED',
        resolution: CONFIRMED_RESOLUTION,
        evidence: [quoteA()],
      },
      { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
    ],
    gaps: [],
    ...overrides,
  };
}

const SINGLE_PROSECUTOR: RoleConfig = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 1 };

/**
 * A full pipeline run whose adjudicator answers with `adjudication`.
 *
 * The reader and the prosecutor are canned too, so the only thing varying
 * between cases below is the adjudicator's response — which is what makes a red
 * attributable to the adjudicator's gates rather than to anything upstream.
 */
function basePipelineInput() {
  const requirement = compoundRequirement();
  return {
    packId: 'testpack',
    requirementId: requirement.id,
    requirement,
    renderContext: ctxRender,
    closure: fixtureClosure(),
    corpus,
    prompts,
    config: SINGLE_PROSECUTOR,
  };
}

function pipelineRun(adjudication: unknown, config: RoleConfig = SINGLE_PROSECUTOR) {
  return runVerificationPipeline({
    ...basePipelineInput(),
    config,
    runner: stubRunner((request) => {
      switch (request.role) {
        case 'reader':
          return JSON.stringify(stubReaderOutput());
        case 'prosecutor':
          return JSON.stringify(prosecutionRaising(lensFromRequest(request)));
        case 'adjudicator':
          return JSON.stringify(adjudication);
      }
    }),
  });
}

async function refusalFrom(promise: Promise<unknown>): Promise<RoleOutputError> {
  let error: unknown;
  try {
    await promise;
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(RoleOutputError);

  // A rewrapped crash is not a gate firing (#2). `runAdjudicator` wraps whatever
  // gap classification throws into a `RoleOutputError`, so a mutation that
  // removes a gate can still produce one of these — from a `TypeError` reaching
  // into a shape the seam would have refused. Every refusal in this file must
  // name a rule rather than a crash, and this is asserted once here rather than
  // per test so a future case cannot be added without it.
  const joined = (error as RoleOutputError).problems.join(' ');
  expect(joined).not.toMatch(/Cannot read properties|is not a function|is not iterable/);
  return error as RoleOutputError;
}

// ---------------------------------------------------------------------------
// Gate 2, layer 1 — the compile boundary: claims, not arguments about claims
// ---------------------------------------------------------------------------

/** An adjudicator input carrying the prosecutors' outputs. It may not be one. */
type OutputBearingInput = AdjudicatorInput & { prosecutions: readonly ProsecutorOutput[] };

// @ts-expect-error an adjudicator input carrying a prosecutor's output is not ReasoningFree
const outputBearingWitness: OutputBearingInput extends ReasoningFree<OutputBearingInput>
  ? true
  : never = true;

/** One output is as disqualifying as a list of them. */
type SingleOutputInput = AdjudicatorInput & { prosecution: ProsecutorOutput };
// @ts-expect-error a single prosecutor output leads back to the argument just as a list does
const singleOutputWitness: SingleOutputInput extends ReasoningFree<SingleOutputInput>
  ? true
  : never = true;

/** The execution, which carries the transcript by construction. */
type ExecutionBearingInput = AdjudicatorInput & {
  executions: readonly RoleExecution<ProsecutorOutput>[];
};
// @ts-expect-error a RoleExecution carries the transcript, which is the argument itself
const executionBearingWitness: ExecutionBearingInput extends ReasoningFree<ExecutionBearingInput>
  ? true
  : never = true;

/** The transcript on its own — the reasoning, with nothing else attached. */
type TranscriptBearingInput = AdjudicatorInput & { transcripts: readonly RoleTranscript[] };
// @ts-expect-error a role transcript is the prosecutor's reasoning verbatim
const transcriptBearingWitness: TranscriptBearingInput extends ReasoningFree<TranscriptBearingInput>
  ? true
  : never = true;

/** The positive control: the real input does inhabit the witness type. */
const reasoningFreeWitness: AdjudicatorInput extends ReasoningFree<AdjudicatorInput>
  ? true
  : never = true;

/** A challenge the adjudicator is shown carrying a verdict. There is no key. */
type VerdictBearingChallenge = AdjudicatorChallenge & { verdict: 'MISMATCH' };
// @ts-expect-error `verdict` is a key of this type, so the witness resolves to never
const verdictBearingWitness: 'verdict' extends keyof VerdictBearingChallenge ? never : true = true;

/** The positive controls: the real challenge has neither key. */
const verdictFreeWitness: 'verdict' extends keyof AdjudicatorChallenge ? never : true = true;
const resolutionFreeWitness: 'resolution' extends keyof AdjudicatorChallenge ? never : true = true;
const adjudicationEvidenceFreeWitness: 'adjudicationEvidence' extends keyof AdjudicatorChallenge
  ? never
  : true = true;

/** A challenge pre-supplying the adjudicator's own evidence. There is no key. */
type AdjudicationEvidenceBearingChallenge = AdjudicatorChallenge & {
  adjudicationEvidence: readonly { kind: 'quote' }[];
};
// @ts-expect-error a prosecutor may not pre-supply the reasoning for a verdict it cannot reach
const adjudicationEvidenceBearingWitness: 'adjudicationEvidence' extends keyof AdjudicationEvidenceBearingChallenge
  ? never
  : true = true;

describe('the compile-boundary witnesses are inhabited at runtime too', () => {
  it('holds every witness', () => {
    expect([
      outputBearingWitness,
      singleOutputWitness,
      executionBearingWitness,
      transcriptBearingWitness,
      reasoningFreeWitness,
      verdictBearingWitness,
      verdictFreeWitness,
      resolutionFreeWitness,
      adjudicationEvidenceFreeWitness,
      adjudicationEvidenceBearingWitness,
    ]).toEqual([true, true, true, true, true, true, true, true, true, true]);
  });
});

// ---------------------------------------------------------------------------
// Gate 2, layer 2 — production wiring
// Mutation that must redden this section:
//   remove `assertAdjudicatorInputFields` from `runAdjudicator`, or make
//   orchestration build the adjudicator's input somewhere other than
//   `adjudicatorInputFor`.
// ---------------------------------------------------------------------------

describe('the adjudicator receives §3.3 claims and no argument about them', () => {
  it('refuses a widened input before contacting the model', async () => {
    // Directly callable with an input `adjudicatorInputFor` cannot construct, so
    // this gate and the compile boundary cannot mask one another (#4).
    const widened = {
      ...inputWith([seed('C1')]),
      prosecutions: [prosecutionRaising('missing_criterion')],
    } as unknown as AdjudicatorInput;

    expect(() => assertAdjudicatorInputFields(widened)).toThrow(AdjudicatorInputWidenedError);
    try {
      assertAdjudicatorInputFields(widened);
    } catch (error) {
      expect((error as AdjudicatorInputWidenedError).unexpected).toEqual(['prosecutions']);
      expect((error as Error).message).toContain('prosecutions');
      expect((error as Error).message).toContain('adjudicates claims');
    }
  });

  it('refuses the widened input through the production entry point, with nothing contacted', async () => {
    const runner = stubRunner(() => JSON.stringify({ adjudications: [], gaps: [] }));
    const widened = {
      ...inputWith([]),
      transcripts: [],
    } as unknown as AdjudicatorInput;

    await expect(
      runAdjudicator({ input: widened, prompt: prompts.adjudicator, model: 'm', runner }),
    ).rejects.toBeInstanceOf(AdjudicatorInputWidenedError);

    // The negative observation needs something observing (#7): the run must not
    // have recorded an exchange over material §3.3 does not grant.
    expect(runner.requests).toHaveLength(0);

    // Positive control: the same seam does contact the runner for an honest input.
    const honest = await runAdjudicator({
      input: inputWith([]),
      prompt: prompts.adjudicator,
      model: 'm',
      runner,
    });
    expect(runner.requests).toHaveLength(1);
    expect(honest.challenges).toEqual([]);
  });

  it('hands the run adjudicator exactly the five fields, and no sixth', async () => {
    const outcome = await pipelineRun(adjudicationFor());
    expect(outcome.adjudication).not.toBeNull();
    expect(Object.keys(outcome.adjudication!.input).sort()).toEqual(ADJUDICATOR_INPUT_FIELDS);
  });

  it('the message actually sent carries the claims and not the arguments', async () => {
    const outcome = await pipelineRun(adjudicationFor());
    const sent = outcome.transcript.roles.find((role) => role.role === 'adjudicator');
    expect(sent).toBeDefined();
    const rendered = sent!.messages.find((message) => message.from === 'input')?.content ?? '';

    // Positive control first, or "the argument does not appear" is satisfied by
    // a message that carries nothing at all (#7).
    expect(rendered).toContain('# Blind reading');
    expect(rendered).toContain('# Rendered condition');
    expect(rendered).toContain('# Coverage');
    expect(rendered).toContain('# Challenges');
    expect(rendered).toContain('# Entitled closure');
    expect(rendered).toContain('P0-C1');
    expect(rendered).toContain('challenge C2');
    expect(rendered).toContain('UNSUPPORTED');
    expect(rendered).toContain(docText('DOC-A'));

    // The prosecutor's own envelope, which is the argument's container, is not
    // in the message. `# Prosecutions` was the pre-Task-4 heading.
    expect(rendered).not.toContain('# Prosecutions');
    const headings = [...rendered.matchAll(/^# (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      'Blind reading',
      'Rendered condition',
      'Coverage',
      'Challenges',
      `Entitled closure (${fixtureClosure().sha256})`,
    ]);
  });

  it('uses the shared closure renderer rather than a second one', () => {
    // Task 2 made `renderEntitledClosure` shared across every role renderer so
    // two copies could not drift. A fork here would change what the adjudicator
    // reads without any test of the reader's blindness going red.
    const closure = fixtureClosure();
    const rendered = renderAdjudicatorInput(inputWith([seed('C1')]));
    expect(rendered).toContain(renderEntitledClosure(closure));
  });
});

// ---------------------------------------------------------------------------
// Gate 1 — the OPEN_QUESTION projection
// Mutations that must redden this section:
//   A. `runAdjudicator` returns `openQuestions: []` instead of calling
//      `projectOpenQuestions`.
//   B. `projectOpenQuestions` appends a synthetic `{ id: 'Q-X', … }`.
// ---------------------------------------------------------------------------

/** The set an open-questions list must equal, derived from the verdicts here. */
function expectedOpenQuestions(challenges: readonly ResultChallenge[]) {
  return challenges
    .filter((challenge) => challenge.verdict === 'OPEN_QUESTION')
    .map((challenge) => ({ id: challenge.id, statement: challenge.statement }));
}

describe('openQuestions[] is a projection of the OPEN_QUESTION verdicts', () => {
  const settled: ResultChallenge = {
    id: 'P0-C1',
    lens: 'missing_criterion',
    statement: 'challenge C1',
    evidence: [quote()],
    verdict: 'CONFIRMED',
    resolution: CONFIRMED_RESOLUTION,
    adjudicationEvidence: [quoteA()],
  };
  const open: ResultChallenge = {
    id: 'P0-C2',
    lens: 'missing_criterion',
    statement: 'challenge C2',
    evidence: [quote()],
    verdict: 'OPEN_QUESTION',
    // Required for OPEN_QUESTION too, and that is the load-bearing case: an
    // open question is not "the adjudicator had nothing", it is evidence
    // sufficient to establish that this record cannot settle the challenge.
    adjudicationEvidence: [quoteA()],
  };

  it('projects ids and statements, not cardinality', () => {
    expect(projectOpenQuestions([settled, open])).toEqual([
      { id: 'P0-C2', statement: 'challenge C2' },
    ]);
  });

  it('projects nothing when nothing is open', () => {
    // The counterexample in the same suite (#5): without it, "the list equals
    // the open set" passes against a producer that emits one entry always.
    expect(projectOpenQuestions([settled])).toEqual([]);
  });

  it('projects a MISMATCH as settled, not as open', () => {
    const mismatch: ResultChallenge = { ...settled, id: 'P0-C3', verdict: 'MISMATCH' };
    expect(projectOpenQuestions([mismatch, open]).map((q) => q.id)).toEqual(['P0-C2']);
  });

  it('preserves challenge order', () => {
    const second: ResultChallenge = { ...open, id: 'P0-C4', statement: 'challenge C4' };
    expect(projectOpenQuestions([open, settled, second]).map((q) => q.id)).toEqual([
      'P0-C2',
      'P0-C4',
    ]);
  });

  it('the adjudicator has no key it could author the list in', () => {
    // The structural half: this is why the list has one producer. `.strict()`
    // refuses an `openQuestions` key rather than stripping it silently.
    const error = parseAndCatch({
      ...adjudicationFor(),
      openQuestions: [{ id: 'Q-X', statement: 'authored by the adjudicator' }],
    });
    expect(error.problems.join(' ')).toContain('openQuestions');
    expect('openQuestions' in adjudicatorOutputSchema.shape).toBe(false);

    // Positive control: the same object without the key parses.
    expect(() => parseRoleOutput('adjudicator', 0, adjudicationFor())).not.toThrow();
  });

  it('the run-level list equals the OPEN_QUESTION verdict set exactly', async () => {
    const outcome = await pipelineRun(adjudicationFor());
    const adjudication = outcome.adjudication;
    expect(adjudication).not.toBeNull();

    // The positive control is in the same output: one challenge reached
    // CONFIRMED with a resolution, so an adjudicator answering OPEN_QUESTION for
    // everything cannot pass this (#5).
    expect(
      adjudication!.challenges.map((challenge) => [challenge.id, challenge.verdict]),
    ).toEqual([
      ['P0-C1', 'CONFIRMED'],
      ['P0-C2', 'OPEN_QUESTION'],
    ]);
    expect(adjudication!.challenges[0]?.resolution).toBe(CONFIRMED_RESOLUTION);
    expect(adjudication!.challenges[1]?.resolution).toBeUndefined();

    // Set equality, ids and statements, against a set derived here from the
    // verdicts rather than from a second call to the producer (#1).
    expect(adjudication!.openQuestions).toEqual(expectedOpenQuestions(adjudication!.challenges));
    expect(adjudication!.openQuestions).toEqual([{ id: 'P0-C2', statement: 'challenge C2' }]);

    // Mutant A reds here: with the projection removed the list is empty while
    // the challenges still carry an OPEN_QUESTION. Mutant B reds here: an
    // appended Q-X has no matching verdict.
    expect(adjudication!.openQuestions).toHaveLength(1);
    expect(adjudication!.openQuestions.map((q) => q.id)).not.toContain('Q-X');
  });

  it('a run with nothing open carries an empty list', async () => {
    // The negative control at run level: the projection tracks the verdicts
    // rather than always producing an entry.
    const outcome = await pipelineRun(
      adjudicationFor({
        adjudications: [
          {
            challengeId: 'P0-C1',
            verdict: 'CONFIRMED',
            resolution: CONFIRMED_RESOLUTION,
            evidence: [quoteA()],
          },
          {
            challengeId: 'P0-C2',
            verdict: 'MISMATCH',
            resolution: 'DOC-A Article 1 sets the threshold the encoding contradicts.',
            evidence: [quoteA()],
          },
        ],
      }),
    );
    expect(outcome.adjudication!.openQuestions).toEqual([]);
    expect(outcome.adjudication!.challenges.map((c) => c.verdict)).toEqual([
      'CONFIRMED',
      'MISMATCH',
    ]);
  });
});

function parseAndCatch(raw: unknown): RoleOutputError {
  let error: unknown;
  try {
    parseRoleOutput('adjudicator', 0, raw);
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(RoleOutputError);
  return error as RoleOutputError;
}

// ---------------------------------------------------------------------------
// Gate 4 — verdict / resolution consistency
// Mutations that must redden this section:
//   `RESOLUTION_REQUIRED_BY_VERDICT.CONFIRMED = false` reds only the CONFIRMED
//   case; `.MISMATCH = false` reds only the MISMATCH case.
// ---------------------------------------------------------------------------

describe('a reached verdict states what reached it', () => {
  const challenges = [seed('C1')];

  function output(
    verdict: 'CONFIRMED' | 'MISMATCH' | 'OPEN_QUESTION',
    resolution?: string,
  ): AdjudicatorOutput {
    return {
      adjudications: [
        {
          challengeId: 'C1',
          verdict,
          ...(resolution === undefined ? {} : { resolution }),
          evidence: [quoteA()],
        },
      ],
      gaps: [],
    };
  }

  it('the required set is the record boundary\'s, not a second list', () => {
    // One authority. A local list that agreed today would be free to relax
    // while `assertResultConsistency` stayed strict.
    for (const verdict of challengeVerdictSchema.options) {
      expect(RESOLUTION_REQUIRED_BY_VERDICT[verdict]).toBe(RESOLVED_VERDICTS.has(verdict));
    }
    expect(Object.keys(RESOLUTION_REQUIRED_BY_VERDICT).sort()).toEqual(
      [...challengeVerdictSchema.options].sort(),
    );
  });

  it('refuses CONFIRMED with no resolution', () => {
    const error = catchDirect(() => assertAdjudication(output('CONFIRMED'), challenges));
    expect(error.problems.join(' ')).toContain('verdict CONFIRMED requires a non-empty resolution');
    expect(error.problems.join(' ')).toContain('none is present');
  });

  it('refuses CONFIRMED with a blank resolution', () => {
    const error = catchDirect(() => assertAdjudication(output('CONFIRMED', '   '), challenges));
    expect(error.problems.join(' ')).toContain('verdict CONFIRMED requires a non-empty resolution');
    expect(error.problems.join(' ')).toContain('the one present is blank');
  });

  it('refuses MISMATCH with no resolution', () => {
    const error = catchDirect(() => assertAdjudication(output('MISMATCH'), challenges));
    expect(error.problems.join(' ')).toContain('verdict MISMATCH requires a non-empty resolution');
  });

  it('refuses MISMATCH with a blank resolution', () => {
    const error = catchDirect(() => assertAdjudication(output('MISMATCH', '\t\n'), challenges));
    expect(error.problems.join(' ')).toContain('verdict MISMATCH requires a non-empty resolution');
  });

  it('accepts CONFIRMED and MISMATCH with a real resolution', () => {
    // The positive control (#5): without it every refusal above is satisfied by
    // a gate that refuses everything.
    expect(() => assertAdjudication(output('CONFIRMED', 'settled by Article 1'), challenges)).not.toThrow();
    expect(() => assertAdjudication(output('MISMATCH', 'contradicted by Article 1'), challenges)).not.toThrow();
  });

  it('lets OPEN_QUESTION omit a resolution', () => {
    // The open question is a real outcome, not a failure to try. It must not
    // accidentally inherit the non-blank requirement.
    expect(() => assertAdjudication(output('OPEN_QUESTION'), challenges)).not.toThrow();
    expect(RESOLUTION_REQUIRED_BY_VERDICT.OPEN_QUESTION).toBe(false);
  });

  it('still refuses a blank resolution under OPEN_QUESTION', () => {
    const error = catchDirect(() => assertAdjudication(output('OPEN_QUESTION', ' '), challenges));
    expect(error.problems.join(' ')).toContain('may omit a resolution, but a blank one is not an adjudication');
  });

  it('refuses a blank CONFIRMED resolution through the production entry point', async () => {
    const error = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            { challengeId: 'P0-C1', verdict: 'CONFIRMED', resolution: '  ', evidence: [quoteA()] },
            { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
          ],
        }),
      ),
    );
    expect(error.role).toBe('adjudicator');
    expect(error.problems.join(' ')).toContain('verdict CONFIRMED requires a non-empty resolution');
  });

  it('refuses a resolution-free MISMATCH through the production entry point', async () => {
    const error = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            { challengeId: 'P0-C1', verdict: 'MISMATCH', evidence: [quoteA()] },
            { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
          ],
        }),
      ),
    );
    expect(error.problems.join(' ')).toContain('verdict MISMATCH requires a non-empty resolution');
  });

  it('positive control: the honest adjudication completes the run', async () => {
    const outcome = await pipelineRun(adjudicationFor());
    expect(outcome.halted).toBe(false);
    expect(outcome.executions.adjudicator).not.toBeNull();
  });
});

function catchDirect(fn: () => unknown): RoleOutputError {
  let error: unknown;
  try {
    fn();
  } catch (thrown) {
    error = thrown;
  }
  expect(error).toBeInstanceOf(RoleOutputError);
  return error as RoleOutputError;
}

// ---------------------------------------------------------------------------
// Gate 3 — evidence binding
// Mutation that must redden this section:
//   remove `assertAdjudication` from `runAdjudicator`'s `parse`.
// ---------------------------------------------------------------------------

describe('every adjudicated conclusion carries evidence, and absence is never sole', () => {
  const challenges = [seed('C1')];

  it('refuses an adjudication resting entirely on absence', () => {
    const error = catchDirect(() =>
      assertAdjudication(
        {
          adjudications: [
            {
              challengeId: 'C1',
              verdict: 'CONFIRMED',
              resolution: 'nothing in the closure says otherwise',
              evidence: [absenceA(), absenceA('turnover')],
            },
          ],
          gaps: [],
        },
        challenges,
      ),
    );
    expect(error.problems.join(' ')).toContain('every evidence item is an absence claim');
  });

  it('accepts absence accompanied by a quote', () => {
    // The rule is over kinds, not counts: absence is a component of reasoning
    // and never the whole of it.
    expect(() =>
      assertAdjudication(
        {
          adjudications: [
            {
              challengeId: 'C1',
              verdict: 'CONFIRMED',
              resolution: 'Article 1 states the test; the sought term is not in it',
              evidence: [quoteA(), absenceA()],
            },
          ],
          gaps: [],
        },
        challenges,
      ),
    ).not.toThrow();
  });

  it('the schema refuses an adjudication with no evidence at all', () => {
    const error = parseAndCatch({
      adjudications: [{ challengeId: 'C1', verdict: 'OPEN_QUESTION', evidence: [] }],
      gaps: [],
    });
    expect(error.problems.join(' ')).toMatch(/evidence/);
  });

  it('refuses an adjudication with no evidence, through the production entry point', async () => {
    // The run-level counterpart of the direct schema test above. `.min(1)` on
    // `adjudicationSchema.evidence` is what binds every verdict to evidence, and
    // a schema rule nothing exercises through production is a comment.
    const empty = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            { challengeId: 'P0-C1', verdict: 'CONFIRMED', resolution: CONFIRMED_RESOLUTION, evidence: [] },
            { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
          ],
        }),
      ),
    );
    expect(empty.role).toBe('adjudicator');
    expect(empty.problems.join(' ')).toContain('adjudications.0.evidence');

    // Omitted entirely is a different zod failure from present-but-empty, and
    // both must be refused — a required field and a non-empty one are separate
    // rules that a single test would let mask one another (#4).
    const omitted = await refusalFrom(
      pipelineRun({
        adjudications: [
          { challengeId: 'P0-C1', verdict: 'CONFIRMED', resolution: CONFIRMED_RESOLUTION },
          { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
        ],
        gaps: [],
      }),
    );
    expect(omitted.problems.join(' ')).toContain('adjudications.0.evidence');

    // OPEN_QUESTION is bound too, and that is the load-bearing case: an open
    // question with no evidence would mean "the adjudicator had nothing".
    const openWithout = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            { challengeId: 'P0-C1', verdict: 'CONFIRMED', resolution: CONFIRMED_RESOLUTION, evidence: [quoteA()] },
            { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [] },
          ],
        }),
      ),
    );
    expect(openWithout.problems.join(' ')).toContain('adjudications.1.evidence');
  });

  it('refuses sole-absence evidence through the production entry point', async () => {
    const error = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            {
              challengeId: 'P0-C1',
              verdict: 'CONFIRMED',
              resolution: CONFIRMED_RESOLUTION,
              evidence: [absenceA()],
            },
            { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
          ],
        }),
      ),
    );
    expect(error.role).toBe('adjudicator');
    expect(error.problems.join(' ')).toContain('every evidence item is an absence claim');
  });

  it('does not demand completeness from a halted adjudicator', () => {
    // The sibling of the refusal below (#7). A gap-bearing run is **written**;
    // turning it into an Invalid one would leave `gaps[]` with no producer for
    // this role and make `sign.ts`'s `unresolved_gap` refusal unreachable here.
    expect(() =>
      assertAdjudication(
        {
          adjudications: [],
          gaps: [{ kind: 'corpus_gap', docId: NOT_INGESTED, detail: 'needed to settle C1' }],
        },
        challenges,
      ),
    ).not.toThrow();
  });

  it('refuses an unadjudicated challenge through the production entry point', async () => {
    const error = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            {
              challengeId: 'P0-C1',
              verdict: 'CONFIRMED',
              resolution: CONFIRMED_RESOLUTION,
              evidence: [quoteA()],
            },
          ],
        }),
      ),
    );
    // `assembleChallenges` throws for this same defect as a backstop, and its
    // message is the bare `challenges: P0-C2 was raised and never adjudicated`.
    // Asserting the trailing clause pins *which* mechanism fired, so this test
    // reds when `assertAdjudication` is unwired and stays green when the
    // backstop is removed instead. Without it the test is satisfied by either.
    expect(error.problems.join(' ')).toContain(
      'P0-C2 was raised and never adjudicated; the adjudicator produces a verdict per challenge',
    );
  });

  it('refuses an adjudication of a challenge nobody raised, through the production entry point', async () => {
    // Uniquely `assertAdjudication`'s. `assembleChallenges` walks the
    // *challenges* and looks each one up, so a surplus adjudication naming an
    // invented id is silently ignored by it — every real challenge here is
    // adjudicated, so the backstop has nothing to throw about.
    const error = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            ...adjudicationFor().adjudications,
            {
              challengeId: 'P9-INVENTED',
              verdict: 'MISMATCH',
              resolution: 'a judgment about a challenge no prosecutor raised',
              evidence: [quoteA()],
            },
          ],
        }),
      ),
    );
    expect(error.role).toBe('adjudicator');
    expect(error.problems.join(' ')).toContain('names no challenge this run raised');
    expect(error.problems.join(' ')).toContain('P9-INVENTED');
  });

  it('refuses one challenge adjudicated twice, through the production entry point', async () => {
    // Also uniquely `assertAdjudication`'s: `assembleChallenges` builds a `Map`
    // keyed by `challengeId`, so a duplicate is resolved last-wins without a
    // throw — the record would silently carry whichever verdict came second.
    const error = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            ...adjudicationFor().adjudications,
            { challengeId: 'P0-C1', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
          ],
        }),
      ),
    );
    expect(error.role).toBe('adjudicator');
    expect(error.problems.join(' ')).toContain(
      'challenge P0-C1 is adjudicated more than once',
    );
  });

  it('refuses an adjudication of a challenge nobody raised', () => {
    const error = catchDirect(() =>
      assertAdjudication(
        {
          adjudications: [
            {
              challengeId: 'C-INVENTED',
              verdict: 'CONFIRMED',
              resolution: 'r',
              evidence: [quoteA()],
            },
          ],
          gaps: [],
        },
        challenges,
      ),
    );
    const joined = error.problems.join(' ');
    expect(joined).toContain('names no challenge this run raised');
    expect(joined).toContain('C1 was raised and never adjudicated');
  });

  it('refuses one challenge adjudicated twice', () => {
    const error = catchDirect(() =>
      assertAdjudication(
        {
          adjudications: [
            { challengeId: 'C1', verdict: 'CONFIRMED', resolution: 'r', evidence: [quoteA()] },
            { challengeId: 'C1', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
          ],
          gaps: [],
        },
        challenges,
      ),
    );
    expect(error.problems.join(' ')).toContain('adjudicated more than once');
  });
});

// ---------------------------------------------------------------------------
// Schema 1.2.0 — the dossier itself carries why each verdict was reached
//
// The property, in my human partner's words: *the authoritative dossier itself
// — not merely the transcript — contains the evidence supporting each
// adjudicated verdict.* The seam has always validated the adjudicator's
// evidence; before 1.2.0 that validated evidence was then dropped, surviving
// only in `execution.transcript`. A transcript is not a dossier: the result is
// what gets hashed, signed and read by B4's human.
//
// Mutations that must redden this section:
//   1. `adjudicationEvidence: adjudication.evidence` -> `challenge.evidence`
//      (field crossing — compiles, and every arity/presence check stays green)
//   2. the `assembleChallenges` call removed from `runAdjudicator`
// ---------------------------------------------------------------------------

describe('the record carries the adjudicator\'s own evidence, not only the prosecutor\'s', () => {
  it('E-P and E-A are distinguishable, or nothing below can detect a crossing', () => {
    // Asserted first and on its own. Every check in this section compares the
    // two arrays; if the fixtures happened to agree, all of them would pass
    // against a record that wrote the prosecutor's reasoning into the
    // adjudicator's field (#1 — a checker that shares the thing it checks).
    expect(quote().docId).toBe('DOC-A');
    expect(quoteA().docId).toBe('DOC-C');
    expect(quote().docId).not.toBe(quoteA().docId);
    expect(quote().text).not.toBe(quoteA().text);
    expect(quote().sha256Normalized).not.toBe(quoteA().sha256Normalized);
    // Both inside the SRC-100 closure, so the difference is not "one of them is
    // unreachable" — a distinction the evidence checks would reject for the
    // wrong reason.
    expect(fixtureClosure().docIds).toEqual(expect.arrayContaining(['DOC-A', 'DOC-C']));
  });

  it('carries what the adjudicator actually returned, quote for quote', async () => {
    const outcome = await pipelineRun(adjudicationFor());
    const returned = outcome.executions.adjudicator!.output.adjudications;
    const recorded = outcome.adjudication!.challenges;

    // Property 1: the evidence in the record is the evidence the adjudicator
    // produced for that verdict — matched by challenge id, not by position.
    for (const adjudication of returned) {
      const challenge = recorded.find((entry) => entry.id === adjudication.challengeId);
      expect(challenge).toBeDefined();
      expect(challenge!.adjudicationEvidence).toEqual(adjudication.evidence);
    }
    expect(recorded).toHaveLength(2);
  });

  it('the prosecutor\'s evidence survives the merge, byte for byte', async () => {
    // The mirror of `carries what the adjudicator actually returned`, and the
    // reason it exists: the *reverse* crossing — `evidence: adjudication.evidence`
    // — is a different defect from the forward one, and the symmetric
    // `not.toEqual` below reds for both without saying which array was
    // clobbered. This one names E-P specifically, compared against what the
    // prosecutor actually returned rather than against a literal restated here.
    //
    // It is the mutation a clean textual merge makes plausible: disjoint
    // regions merging without conflict means nothing forces anyone to check
    // that *both* propositions survived, only that the new field was added.
    const outcome = await pipelineRun(adjudicationFor());
    const raised = new Map(
      buildCoverageTable(outcome.prosecution.outputs).challenges.map((challenge) => [
        challenge.id,
        challenge,
      ]),
    );
    expect(raised.size).toBe(2);

    for (const challenge of outcome.adjudication!.challenges) {
      const original = raised.get(challenge.id);
      expect(original).toBeDefined();
      // Why the challenge was raised — unchanged by adjudication.
      expect(challenge.evidence).toEqual(original!.evidence);
      expect(challenge.statement).toBe(original!.statement);
      expect(challenge.lens).toBe(original!.lens);
      // And it is not the adjudicator's, which is the reverse crossing.
      expect(challenge.evidence).not.toEqual(challenge.adjudicationEvidence);
      expect(challenge.evidence.map((item) => (item as { docId: string }).docId)).toEqual(['DOC-A']);
    }
  });

  it('keeps the two arrays apart — the crossing is what a mutation would do', async () => {
    const outcome = await pipelineRun(adjudicationFor());
    for (const challenge of outcome.adjudication!.challenges) {
      // Property 2. Compared by content rather than by reference: a crossing
      // that copied the array would defeat an identity check.
      expect(challenge.adjudicationEvidence).not.toEqual(challenge.evidence);
      expect(challenge.adjudicationEvidence.map((item) => (item as { docId: string }).docId)).toEqual(['DOC-C']);
      expect(challenge.evidence.map((item) => (item as { docId: string }).docId)).toEqual(['DOC-A']);
    }
    // Never concatenated: separate arrays are what let `assertSignable` name
    // which one a refusal is about and let the review sheet label them.
    expect(outcome.adjudication!.challenges[0]!.adjudicationEvidence).toHaveLength(1);
    expect(outcome.adjudication!.challenges[0]!.evidence).toHaveLength(1);
  });

  it('binds all three verdicts, and OPEN_QUESTION still needs no resolution', async () => {
    // Property 3. One run carrying every verdict, so this cannot pass by only
    // ever exercising the settled ones.
    const outcome = await runVerificationPipeline({
      ...basePipelineInput(),
      config: { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 2 },
      runner: stubRunner((request) => {
        switch (request.role) {
          case 'reader':
            return JSON.stringify(stubReaderOutput());
          case 'prosecutor':
            return JSON.stringify(prosecutionRaising(lensFromRequest(request)));
          case 'adjudicator':
            return JSON.stringify({
              adjudications: [
                { challengeId: 'P0-C1', verdict: 'CONFIRMED', resolution: CONFIRMED_RESOLUTION, evidence: [quoteA()] },
                { challengeId: 'P0-C2', verdict: 'MISMATCH', resolution: 'DOC-C contradicts the encoded threshold.', evidence: [quoteA()] },
                { challengeId: 'P1-C1', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
                { challengeId: 'P1-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA(), absenceA()] },
              ],
              gaps: [],
            });
        }
      }),
    });

    const byId = new Map(
      outcome.adjudication!.challenges.map((challenge) => [challenge.id, challenge]),
    );
    // Keyed by id, not by verdict: two challenges share `OPEN_QUESTION` here and
    // a verdict-keyed map would silently inspect whichever came last.
    expect([...byId.keys()]).toEqual(['P0-C1', 'P0-C2', 'P1-C1', 'P1-C2']);
    expect([...new Set([...byId.values()].map((c) => c.verdict))].sort()).toEqual([
      'CONFIRMED',
      'MISMATCH',
      'OPEN_QUESTION',
    ]);
    for (const challenge of byId.values()) {
      expect(challenge.adjudicationEvidence.length).toBeGreaterThan(0);
      expect(challenge.adjudicationEvidence).not.toEqual(challenge.evidence);
    }
    // The load-bearing asymmetry: evidence required, resolution not — asserted
    // on a named open question rather than on whichever one a map kept.
    const open = byId.get('P1-C1')!;
    expect(open.verdict).toBe('OPEN_QUESTION');
    expect(open.resolution).toBeUndefined();
    expect(open.adjudicationEvidence).toEqual([quoteA()]);
    expect(byId.get('P1-C2')!.adjudicationEvidence).toEqual([quoteA(), absenceA()]);
    // The settled ones do carry a resolution, so the line above is not
    // satisfied by a record that drops every resolution (#5).
    expect(byId.get('P0-C1')!.resolution).toBe(CONFIRMED_RESOLUTION);
    expect(byId.get('P0-C2')!.resolution).toContain('DOC-C contradicts');
  });

  it('the assembled challenges satisfy the 1.2.0 record contract, not merely this module', async () => {
    // Property 1, at its strongest. `challengeSchema` and
    // `assertResultConsistency` are the record boundary and this module is a
    // producer; asserting the producer against itself would be failure mode #1.
    // No file is written and no result is emitted — Task 5 owns that. This
    // builds the record shape in the test and holds the produced challenges to
    // the boundary they will have to pass.
    const outcome = await pipelineRun(adjudicationFor());
    const result = {
      packId: outcome.tail.packId,
      requirementId: outcome.tail.requirementId,
      requirementVersion: compoundRequirement().version,
      resultSchemaVersion: outcome.tail.resultSchemaVersion,
      pipelineVersion: outcome.pipelineVersion,
      rendererVersion: outcome.tail.rendererVersion,
      ...outcome.tail.pins,
      // `producePins` omits `versionLabel`, which `corpusPinSchema` requires —
      // a gap in the tail's assembly that belongs to Task 5, not here. Filled
      // in from the corpus so this test is about the challenges it is checking
      // rather than about an unrelated missing field.
      corpus: outcome.tail.pins.corpus.map((pin) => ({
        ...pin,
        versionLabel: corpus.document(pin.docId).versionLabel,
      })),
      reading: { elements: outcome.reader.output.elements },
      coverage: { cells: outcome.prosecution.table.cells },
      challenges: outcome.adjudication!.challenges,
      openQuestions: outcome.adjudication!.openQuestions,
      gaps: outcome.tail.gaps,
    };

    const parsed = parseVerificationResult(result);
    expect(parsed.resultSchemaVersion).toBe('1.2.0');
    expect(() => assertResultConsistency(parsed)).not.toThrow();

    // And the boundary really does see the adjudicator's evidence: every quote
    // in `adjudicationEvidence` resolves to a document this result pins.
    const pinned = new Map(parsed.corpus.map((pin) => [pin.docId, pin.sha256Normalized]));
    for (const challenge of parsed.challenges) {
      for (const item of challenge.adjudicationEvidence) {
        expect(item.kind).toBe('quote');
        const quoteItem = item as { docId: string; sha256Normalized: string };
        expect(pinned.get(quoteItem.docId)).toBe(quoteItem.sha256Normalized);
      }
    }

    // Positive control that the boundary can fail: crossing the two arrays is
    // structurally legal, so consistency alone cannot catch it — which is why
    // the content comparison above is the check that matters, not this one.
    expect(() =>
      assertResultConsistency({
        ...parsed,
        challenges: parsed.challenges.map((challenge) => ({ ...challenge, adjudicationEvidence: [] })),
      }),
    ).not.toThrow();
    expect(() => parseVerificationResult({
      ...result,
      challenges: parsed.challenges.map((challenge) => ({ ...challenge, adjudicationEvidence: [] })),
    })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Gate 5 — the output seam, before the deterministic tail sees anything
// Mutation that must redden this section:
//   `parse: (raw) => raw as AdjudicatorOutput` in `runAdjudicator`.
// ---------------------------------------------------------------------------

describe('malformed adjudicator output fails at the adjudicator boundary', () => {
  it('refuses a verdict outside the vocabulary, named against the adjudicator', async () => {
    const error = await refusalFrom(
      pipelineRun(
        adjudicationFor({
          adjudications: [
            {
              challengeId: 'P0-C1',
              // A word the record has no place for. `MAYBE` is what a model
              // reaches for when it wants to hedge; the seam is where that stops.
              verdict: 'MAYBE' as unknown as 'CONFIRMED',
              resolution: CONFIRMED_RESOLUTION,
              evidence: [quoteA()],
            },
            { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
          ],
        }),
      ),
    );
    expect(error.role).toBe('adjudicator');
    expect(error.index).toBe(0);
    expect(error.problems.join(' ')).toContain('adjudications.0.verdict');
  });

  it('refuses an authoritative pin arriving from the adjudicator', async () => {
    const error = await refusalFrom(
      pipelineRun({ ...adjudicationFor(), corpusClosureSha256: 'f'.repeat(64) }),
    );
    expect(error.problems.join(' ')).toContain('corpusClosureSha256');
  });

  it('refuses a response that is not this role\'s shape at all', async () => {
    const error = await refusalFrom(pipelineRun({ verdict: 'CONFIRMED' }));
    expect(error.role).toBe('adjudicator');
    // Named against the schema path, not as whatever `TypeError` a downstream
    // step happens to throw first when it reaches into a shape that is not
    // there. The distinction is the gate: a seam that fails is a seam; code
    // crashing on an absent field afterwards is not.
    const joined = error.problems.join(' ');
    expect(joined).toContain('adjudications');
    expect(joined).toContain('gaps');
    expect(joined).not.toMatch(/Cannot read properties/);
  });

  it('positive control: the well-formed response passes the same seam and reaches the tail', async () => {
    // Without this, every refusal above is satisfied by a seam that refuses
    // everything (#7), and "the tail never saw raw output" is vacuous.
    const outcome = await pipelineRun(adjudicationFor());
    expect(outcome.tail.gaps).toEqual([]);
    expect(outcome.executions.adjudicator?.output.adjudications).toHaveLength(2);
    expect(outcome.adjudication!.output.adjudications.map((a) => a.verdict)).toEqual([
      'CONFIRMED',
      'OPEN_QUESTION',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The adjudicator is bound by the same closure, and stops at a gap
// ---------------------------------------------------------------------------

describe('the adjudicator halts on a gap, exactly as the reader and prosecutors do', () => {
  it('classifies the gap and discards the judgments formed against the surface', async () => {
    const outcome = await pipelineRun({
      adjudications: [],
      gaps: [{ kind: 'corpus_gap', docId: NOT_INGESTED, detail: 'needed to settle P0-C2' }],
    });

    expect(outcome.halted).toBe(true);
    expect(outcome.adjudication!.halted).toBe(true);
    expect(outcome.adjudication!.challenges).toEqual([]);
    expect(outcome.adjudication!.openQuestions).toEqual([]);
    expect(outcome.adjudication!.gaps.map((gap) => gap.kind)).toEqual(['corpus_gap']);

    // The classification is derived from the corpus and the closure, not
    // believed from the role: DOC-D is *in* the corpus and outside the closure,
    // so the same role wording produces a closure_gap instead.
    const closureGap = await pipelineRun({
      adjudications: [],
      gaps: [{ kind: 'corpus_gap', docId: 'DOC-D', detail: 'needed to settle P0-C2' }],
    });
    expect(closureGap.adjudication!.gaps.map((gap) => gap.kind)).toEqual(['closure_gap']);

    // The tail collated it, and the agent's words survive in the transcript.
    expect(outcome.tail.gaps.map((gap) => gap.docId)).toEqual([NOT_INGESTED]);
    expect(outcome.transcript.roles.some((role) => role.role === 'adjudicator')).toBe(true);
  });

  it('positive control: the ungapped run keeps its judgments', async () => {
    const outcome = await pipelineRun(adjudicationFor());
    expect(outcome.halted).toBe(false);
    expect(outcome.adjudication!.challenges).toHaveLength(2);
    expect(outcome.tail.gaps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Assembly: Task 3 owns the claim, Task 4 owns the judgment
// ---------------------------------------------------------------------------

describe('the record challenge is Task 3\'s claim with Task 4\'s judgment attached', () => {
  it('keeps the prosecutor\'s id, lens, statement and evidence', () => {
    const claims = [seed('P0-C1'), seed('P0-C2')];
    const assembled = assembleChallenges(claims, adjudicationFor());
    expect(assembled.map((c) => [c.id, c.lens, c.statement])).toEqual([
      ['P0-C1', 'missing_criterion', 'challenge P0-C1'],
      ['P0-C2', 'missing_criterion', 'challenge P0-C2'],
    ]);
    expect(assembled[0]?.evidence).toEqual(claims[0]?.evidence);
    expect(assembled[0]?.verdict).toBe('CONFIRMED');
    expect(assembled[1]?.verdict).toBe('OPEN_QUESTION');
  });

  it('follows challenge order rather than the order the model answered in', () => {
    // The canonical result carries `challenges[]` in order, and a list that
    // reshuffled with the model's phrasing would move `resultSha256` for no
    // substantive reason.
    const claims = [seed('P0-C1'), seed('P0-C2')];
    const reversed: AdjudicatorOutput = {
      ...adjudicationFor(),
      adjudications: [...adjudicationFor().adjudications].reverse(),
    };
    expect(assembleChallenges(claims, reversed).map((c) => c.id)).toEqual(['P0-C1', 'P0-C2']);
  });

  it('the backstop fires for a direct caller that skipped the seam', () => {
    // `assertAdjudication` catches this first through `runAdjudicator`, so this
    // throw is unreachable via the production entry point — proved by the fix
    // round's direction-B mutation, where removing it reddened nothing. It is
    // kept because `assembleChallenges` is exported and a direct caller could
    // otherwise construct a `ResultChallenge` with no verdict, which is not a
    // record entry at all. Reachable through its *own* entry point, so it is a
    // tested guard rather than an ornament — and its message is deliberately
    // the bare one, so a failure names which of the two mechanisms fired.
    let error: unknown;
    try {
      assembleChallenges([seed('P0-C1'), seed('P0-C2')], {
        adjudications: [
          { challengeId: 'P0-C1', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
        ],
        gaps: [],
      });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(RoleOutputError);
    expect((error as RoleOutputError).problems).toEqual([
      'challenges: P0-C2 was raised and never adjudicated',
    ]);
    // Distinct from `assertAdjudication`'s message, which carries the reason.
    expect((error as RoleOutputError).problems.join(' ')).not.toContain(
      'the adjudicator produces a verdict per challenge',
    );
  });

  it('omits `resolution` entirely rather than writing an empty one', () => {
    const assembled = assembleChallenges([seed('P0-C2')], {
      adjudications: [{ challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [quoteA()] }],
      gaps: [],
    });
    expect('resolution' in assembled[0]!).toBe(false);
  });

  it('carries the qualified ids the assembled table produced', async () => {
    // Task 3 qualifies a challenge id with the prosecutor that raised it; the
    // adjudicator adjudicates the qualified id, so the record's adverse cells
    // and its challenges name the same thing.
    const outcome = await pipelineRun(adjudicationFor());
    const table = buildCoverageTable(outcome.prosecution.outputs);
    expect(outcome.adjudication!.challenges.map((c) => c.id)).toEqual(
      table.challenges.map((c) => c.id),
    );
    expect(outcome.adjudication!.input.coverage).toEqual(table.cells);
    expect(table.cells.map((cell) => cell.challengeId)).toEqual(['P0-C1', 'P0-C2']);
  });

  it('does not re-check what Task 3 owns: a one-directional prosecutor is not this gate\'s business', async () => {
    // Coverage bidirectionality is a PANEL-level invariant. Two prosecutors,
    // each walking one direction only, assemble into a bidirectional table —
    // and the adjudicator settles their challenges without objecting to either
    // one being one-directional. A check here that had that effect would
    // destroy the intended lens diversity.
    const oneWay = (lens: string, index: number): ProsecutorOutput =>
      index === 0
        ? {
            lens,
            coverage: [
              {
                direction: 'reading_to_condition',
                readingElementId: 'RE-STUB',
                verdict: 'UNMAPPED',
                challengeId: 'C1',
              },
            ],
            challenges: [{ id: 'C1', lens, statement: 'challenge C1', evidence: [quote()] }],
            gaps: [],
          }
        : {
            lens,
            coverage: [
              {
                direction: 'condition_to_reading',
                conditionPath: 'all[0]',
                verdict: 'UNSUPPORTED',
                challengeId: 'C1',
              },
            ],
            challenges: [{ id: 'C1', lens, statement: 'challenge C1', evidence: [quote()] }],
            gaps: [],
          };

    const requirement = compoundRequirement();
    const outcome = await runVerificationPipeline({
      packId: 'testpack',
      requirementId: requirement.id,
      requirement,
      renderContext: ctxRender,
      closure: fixtureClosure(),
      corpus,
      prompts,
      config: { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 2 },
      runner: stubRunner((request) => {
        switch (request.role) {
          case 'reader':
            return JSON.stringify(stubReaderOutput());
          case 'prosecutor':
            return JSON.stringify(oneWay(lensFromRequest(request), request.index));
          case 'adjudicator':
            return JSON.stringify({
              adjudications: [
                {
                  challengeId: 'P0-C1',
                  verdict: 'MISMATCH',
                  resolution: 'the encoding omits the criterion Article 1 states',
                  evidence: [quoteA()],
                },
                { challengeId: 'P1-C1', verdict: 'OPEN_QUESTION', evidence: [quoteA()] },
              ],
              gaps: [],
            });
        }
      }),
    });

    expect(outcome.halted).toBe(false);
    expect(outcome.adjudication!.challenges.map((c) => [c.id, c.verdict])).toEqual([
      ['P0-C1', 'MISMATCH'],
      ['P1-C1', 'OPEN_QUESTION'],
    ]);
    expect(outcome.adjudication!.openQuestions).toEqual([
      { id: 'P1-C1', statement: 'challenge C1' },
    ]);
    // Each prosecutor walked one way; the panel walked both.
    expect(outcome.prosecution.outputs.map((o) => o.coverage[0]?.direction)).toEqual([
      'reading_to_condition',
      'condition_to_reading',
    ]);
    expect(lensFor(DEFAULT_ROLE_CONFIG, 1)).not.toBe(lensFor(DEFAULT_ROLE_CONFIG, 0));
  });
});
