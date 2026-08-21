/**
 * The shared pin producer — one construction, four callers.
 *
 * `currentStateOf`'s header records what three constructions of this record
 * already cost. B2's deterministic tail is the fourth caller, and it is the one
 * that makes the property load-bearing rather than tidy: `src/cli/sign.ts`
 * builds the candidate a result's pins are compared against, and two
 * constructions that drift would make `verify sign` refuse every dossier the
 * pipeline produces with `candidate_inconsistent` — never as a diff anyone can
 * read.
 *
 * The strongest evidence for that reuse is a mutation: change `producePins` and
 * watch `cli-sign`, `cli-review-sheet` and the pipeline tail go red together.
 * That is recorded in the task report. What is asserted here is the shape of the
 * split and the agreement between the producer, the canonical helpers and the
 * tail.
 */

import { describe, expect, it } from 'vitest';
import { currentStateOf, producePins } from '../src/verification/current-state';
import { resultSha256 } from '../src/verification/result';
import { requirementInputSha256 } from '../src/verification/canonical';
import {
  candidateConditionSha256,
  candidateRenderedConditionSha256,
} from '../src/verification/sign';
import { computeClosure, docsForSources } from '../src/corpus/closure';
import { runDeterministicTail } from '../src/pipeline/tail';
import {
  fixtureCorpus,
  fixtureIndex,
  fixtureRenderContext,
  fixtureRequirement,
  stubAdjudicatorOutput,
  stubProsecutorOutput,
  stubReaderOutput,
} from './pipeline-fixtures';

const corpus = fixtureCorpus();
const index = fixtureIndex();
const closure = computeClosure(index, docsForSources(index, ['SRC-100']));
const requirement = fixtureRequirement();
const renderContext = fixtureRenderContext();

const pinInput = {
  requirement,
  renderContext,
  closure: { sha256: closure.sha256, docIds: closure.docIds },
  corpus,
};

describe('producePins', () => {
  it('produces the five result-independent pins and no result hash', () => {
    const pins = producePins(pinInput);
    expect(Object.keys(pins).sort()).toEqual([
      'conditionSha256',
      'corpusClosureSha256',
      'corpus',
      'renderedConditionSha256',
      'requirementInputSha256',
    ].sort());
    expect(pins).not.toHaveProperty('resultSha256');
  });

  it('routes to the canonical helpers the signing path uses', () => {
    const pins = producePins(pinInput);
    expect(pins.requirementInputSha256).toBe(requirementInputSha256(requirement));
    expect(pins.conditionSha256).toBe(candidateConditionSha256(requirement));
    expect(pins.renderedConditionSha256).toBe(
      candidateRenderedConditionSha256(requirement, renderContext),
    );
    expect(pins.corpusClosureSha256).toBe(closure.sha256);
    expect(pins.corpus.map((document) => document.docId)).toEqual(closure.docIds);
  });

  it('each pin moves for its own reason and stands still for the others', () => {
    const before = producePins(pinInput);

    // `caution` is authored text the agents never consumed: it must move
    // neither the input hash nor the condition hash.
    const cautioned = producePins({
      ...pinInput,
      requirement: fixtureRequirement({ caution: 'a warning nobody verified' }),
    });
    expect(cautioned.requirementInputSha256).toBe(before.requirementInputSha256);
    expect(cautioned.conditionSha256).toBe(before.conditionSha256);

    // The logical payload moving must move both.
    const retuned = producePins({
      ...pinInput,
      requirement: fixtureRequirement({
        condition: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 40_000_000 },
      }),
    });
    expect(retuned.requirementInputSha256).not.toBe(before.requirementInputSha256);
    expect(retuned.conditionSha256).not.toBe(before.conditionSha256);
    expect(retuned.renderedConditionSha256).not.toBe(before.renderedConditionSha256);

    // The closure hash comes from the closure and from nowhere else.
    expect(
      producePins({ ...pinInput, closure: { sha256: 'a'.repeat(64), docIds: closure.docIds } })
        .corpusClosureSha256,
    ).toBe('a'.repeat(64));
  });
});

/**
 * A schema-valid but empty result. It carries no verdicts and asserts nothing:
 * `resultSha256` needs a parseable record, and Task 1 has no judgments to put
 * in one.
 */
function minimalResult(): Parameters<typeof currentStateOf>[0]['result'] {
  return {
    packId: 'testpack',
    requirementId: 'TEST-R-001',
    requirementVersion: 1,
    resultSchemaVersion: '1.1.0',
    pipelineVersion: 'pipeline-v1-unpromoted',
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
  };
}

describe('currentStateOf', () => {
  it('is the producer plus the one pin that needs a result', () => {
    const result = minimalResult();
    const state = currentStateOf({ ...pinInput, result });
    const pins = producePins(pinInput);
    expect(Object.keys(state).sort()).toEqual(
      [...Object.keys(pins), 'resultSha256'].sort(),
    );
    for (const key of Object.keys(pins) as Array<keyof typeof pins>) {
      expect(state[key]).toEqual(pins[key]);
    }
    // Value-asserted, not merely typed: `typeof … === 'string'` is satisfied
    // by any hash of anything, including a hash of the wrong record.
    expect(state.resultSha256).toBe(resultSha256(result));
  });

  it('the result hash tracks the result, and the other five do not', () => {
    // The counterexample that makes the assertion above mean something: change
    // the result alone and exactly one field of the record moves.
    const before = currentStateOf({ ...pinInput, result: minimalResult() });
    const after = currentStateOf({
      ...pinInput,
      result: { ...minimalResult(), openQuestions: [{ id: 'Q-1', statement: 'carried forward' }] },
    });
    expect(after.resultSha256).not.toBe(before.resultSha256);
    expect(after.requirementInputSha256).toBe(before.requirementInputSha256);
    expect(after.conditionSha256).toBe(before.conditionSha256);
    expect(after.renderedConditionSha256).toBe(before.renderedConditionSha256);
    expect(after.corpusClosureSha256).toBe(before.corpusClosureSha256);
    expect(after.corpus).toEqual(before.corpus);
  });
});

describe('the deterministic tail', () => {
  it('computes its pins through the same producer', () => {
    const outcome = runDeterministicTail({
      packId: 'testpack',
      requirementId: 'TEST-R-001',
      requirement,
      renderContext,
      closure: { sha256: closure.sha256, docIds: closure.docIds },
      corpus,
      pipelineVersion: 'pipeline-v1-unpromoted',
      rendererVersion: 'renderer-1.1.0',
      resultSchemaVersion: '1.1.0',
      roleOutputs: {
        reading: stubReaderOutput(),
        prosecutions: [stubProsecutorOutput('stub_lens')],
        adjudication: stubAdjudicatorOutput(),
      },
    });
    expect(outcome.pins).toEqual(producePins(pinInput));
  });
});
