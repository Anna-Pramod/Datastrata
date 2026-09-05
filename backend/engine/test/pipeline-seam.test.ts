/**
 * The role seam and the two layers of the hostile-pin boundary.
 *
 * The single-layer version of this check is contradictory: if a role output type
 * structurally excludes pins you cannot construct the hostile value, and if you
 * can construct it the type does not exclude them. So both layers are here.
 *
 *   compile boundary   — a role output type declaring an authoritative pin does
 *                        not typecheck. Asserted with `@ts-expect-error`, which
 *                        `npm run typecheck` fails on if the line ever *would*
 *                        compile ("unused '@ts-expect-error' directive"). A
 *                        runtime assertion here would pass unconditionally and
 *                        prove nothing.
 *   runtime boundary   — a pin-bearing object forced through `unknown` is
 *                        rejected at the seam, by name; and where one reaches
 *                        the tail regardless, the tail-computed pin is what
 *                        lands.
 */

import { describe, expect, it } from 'vitest';
import { RoleOutputError, RoleTransportError, type AgentRole, type PinFree } from '../src/pipeline/roles';
import { parseRoleOutput, type ReaderOutput } from '../src/pipeline/role-outputs';
import { createAgentRole } from '../src/pipeline/agent-role';
import { runDeterministicTail } from '../src/pipeline/tail';
import { producePins } from '../src/verification/current-state';
import { computeClosure, docsForSources } from '../src/corpus/closure';
import { loadPromptSet } from '../src/pipeline/prompts';
import {
  fixtureCorpus,
  fixtureIndex,
  fixtureRenderContext,
  fixtureRequirement,
  stubAdjudicatorOutput,
  stubProsecutorOutput,
  stubReaderOutput,
  stubRunner,
} from './pipeline-fixtures';
import { fixtureStanding, pinInputFor } from './pipeline-fixtures';

// ---------------------------------------------------------------------------
// Layer 1 — the compile boundary
// ---------------------------------------------------------------------------

/** A role output that declares one of the tail's pins. It may not be one. */
type PinBearingOutput = { elements: []; gaps: []; corpusClosureSha256: string };

// @ts-expect-error a role output type declaring `corpusClosureSha256` fails the PinFree constraint
declare const pinBearingRole: AgentRole<unknown, PinBearingOutput>;

/**
 * The same rule stated as a value: a pin-bearing type does not satisfy
 * `PinFree`, so the witness type is `never` and no value inhabits it.
 */
// @ts-expect-error `true` does not inhabit `never`: PinBearingOutput is not PinFree
const pinBearingWitness: PinBearingOutput extends PinFree<PinBearingOutput> ? true : never = true;

/** The positive control for that witness: an honest output does inhabit it. */
const honestWitness: ReaderOutput extends PinFree<ReaderOutput> ? true : never = true;

/** The positive control: an honest role output satisfies the constraint. */
declare const honestRole: AgentRole<unknown, ReaderOutput>;

/** Referenced so the declarations above are not dead code to a linter. */
export type CompileBoundaryWitnesses = [
  typeof pinBearingRole,
  typeof pinBearingWitness,
  typeof honestWitness,
  typeof honestRole,
];

// ---------------------------------------------------------------------------
// Layer 2 — the runtime boundary
// ---------------------------------------------------------------------------

const closure = (() => {
  const index = fixtureIndex();
  const entries = docsForSources(index, ['SRC-100']);
  return pinInputFor(computeClosure(index, entries, fixtureStanding()));
})();

function tailInput(roleOutputs: Parameters<typeof runDeterministicTail>[0]['roleOutputs']) {
  return {
    packId: 'testpack',
    requirementId: 'TEST-R-001',
    requirement: fixtureRequirement(),
    renderContext: fixtureRenderContext(),
    closure: { sha256: closure.sha256, docIds: closure.docIds, sourcesStanding: closure.sourcesStanding },
    corpus: fixtureCorpus(),
    pipelineVersion: 'pipeline-v1-unpromoted',
    rendererVersion: 'renderer-1.1.0',
    closureRendererVersion: 'closure-renderer-1.0.0',
    resultSchemaVersion: '1.3.0',
    roleOutputs,
  };
}

describe('the role seam', () => {
  it('accepts a structurally valid role output', () => {
    const parsed = parseRoleOutput('reader', 0, JSON.parse(JSON.stringify(stubReaderOutput())));
    expect(parsed.elements).toHaveLength(1);
  });

  it('names the role and every problem when the structure is wrong', () => {
    let error: unknown;
    try {
      parseRoleOutput('prosecutor', 2, { lens: 7, coverage: [], challenges: [], gaps: [] });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(RoleOutputError);
    const failure = error as RoleOutputError;
    expect(failure.role).toBe('prosecutor');
    expect(failure.index).toBe(2);
    expect(failure.message).toContain('prosecutor[2]');
    expect(failure.problems.join(' ')).toContain('lens');
  });

  it('refuses a prosecutor that reaches for the adjudicator’s vocabulary', () => {
    // §3.2: a prosecutor emits CHALLENGE only. `.strict()` is what makes the
    // absence of `verdict` enforced rather than merely intended.
    expect(() =>
      parseRoleOutput('prosecutor', 0, {
        lens: 'missing_criterion',
        coverage: [],
        gaps: [],
        challenges: [
          {
            id: 'C-1',
            lens: 'missing_criterion',
            statement: 'placeholder',
            verdict: 'MISMATCH',
            evidence: [{ kind: 'absence', docIds: ['DOC-A'], term: 'x' }],
          },
        ],
      }),
    ).toThrow(/verdict/);
  });

  it('reports a non-JSON response as a transport failure against the role', async () => {
    const role = createAgentRole<undefined, ReaderOutput>({
      name: 'reader',
      index: 0,
      model: 'test-model',
      prompt: loadPromptSet().reader,
      runner: stubRunner(() => 'not json at all'),
      renderInput: () => 'input',
      parse: (raw) => parseRoleOutput('reader', 0, raw),
    });
    await expect(role.run(undefined)).rejects.toBeInstanceOf(RoleTransportError);
  });

  it('records the model and the prompt-file hash on every execution', async () => {
    const prompts = loadPromptSet();
    const role = createAgentRole<undefined, ReaderOutput>({
      name: 'reader',
      index: 0,
      model: 'test-model-x',
      prompt: prompts.reader,
      runner: stubRunner(() => JSON.stringify(stubReaderOutput())),
      renderInput: () => 'input',
      parse: (raw) => parseRoleOutput('reader', 0, raw),
    });
    const execution = await role.run(undefined);
    expect(execution.model).toBe('test-model-x');
    expect(execution.promptSha256).toBe(prompts.reader.sha256);
    expect(execution.transcript.model).toBe('test-model-x');
    expect(execution.transcript.promptSha256).toBe(prompts.reader.sha256);
    // The prompt file's own text is transcript content, and so is the
    // interpolated input. Only the file is hashed.
    expect(execution.transcript.messages.map((message) => message.from)).toEqual([
      'prompt',
      'input',
      'agent',
    ]);
    expect(execution.transcript.messages[0]?.content).toBe(prompts.reader.text);
  });
});

describe('the hostile-pin boundary at runtime', () => {
  /** A pin-bearing object with nothing left of its type. */
  const hostile: unknown = JSON.parse(
    JSON.stringify({
      ...stubReaderOutput(),
      corpusClosureSha256: 'f'.repeat(64),
      resultSha256: 'e'.repeat(64),
      pipelineVersion: 'pipeline-v1-supplied-by-an-agent',
    }),
  );

  it('rejects it at the seam, naming the pins it may not carry', () => {
    let error: unknown;
    try {
      parseRoleOutput('reader', 0, hostile);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(RoleOutputError);
    const problems = (error as RoleOutputError).problems.join(' ');
    expect(problems).toContain('corpusClosureSha256');
    expect(problems).toContain('resultSha256');
    expect(problems).toContain('pipelineVersion');
  });

  it('positive control: the same object without the pins is accepted', () => {
    // Without this, the rejection above is satisfied by a seam that rejects
    // everything — failure mode 7, a negative observation with nothing
    // observing.
    expect(() => parseRoleOutput('reader', 0, JSON.parse(JSON.stringify(stubReaderOutput())))).not.toThrow();
  });

  it('the tail computes the pin, and the supplied one does not land', () => {
    // The seam already refuses this object; force it past the seam anyway, so
    // the tail's own behaviour is what is under test rather than the seam's.
    const forced = hostile as ReaderOutput;
    const outcome = runDeterministicTail(
      tailInput({
        reading: forced,
        prosecutions: [stubProsecutorOutput('stub_lens')],
        adjudication: stubAdjudicatorOutput(),
      }),
    );

    const expected = producePins({
      requirement: fixtureRequirement(),
      renderContext: fixtureRenderContext(),
      closure: { sha256: closure.sha256, docIds: closure.docIds, sourcesStanding: closure.sourcesStanding },
      corpus: fixtureCorpus(),
    });

    expect(outcome.pins.corpusClosureSha256).toBe(expected.corpusClosureSha256);
    expect(outcome.pins.corpusClosureSha256).toBe(closure.sha256);
    expect(outcome.pins.corpusClosureSha256).not.toBe('f'.repeat(64));
    expect(outcome.pins).toEqual(expected);
    // `resultSha256` and `pipelineVersion` are not the tail's to read off a
    // role either: neither appears anywhere in the pin block.
    expect(Object.keys(outcome.pins)).not.toContain('resultSha256');
    expect(outcome.pipelineVersion).toBe('pipeline-v1-unpromoted');
  });

  it('positive control: the tail-computed closure pin moves when the closure does', () => {
    // Proves the assertion above can fail — the expected value is not a
    // constant the tail would produce for any input.
    const outcome = runDeterministicTail({
      ...tailInput({
        reading: stubReaderOutput(),
        prosecutions: [],
        adjudication: stubAdjudicatorOutput(),
      }),
      closure: { sha256: 'a'.repeat(64), docIds: [], sourcesStanding: new Map() },
    });
    expect(outcome.pins.corpusClosureSha256).toBe('a'.repeat(64));
    expect(outcome.pins.corpusClosureSha256).not.toBe(closure.sha256);
  });
});
