/**
 * The shared pin producer — one construction, four callers, two widths.
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
 *
 * **The second half of this file is about the two widths.** A pinned corpus
 * document is *recorded* at its full record width and *compared* four fields wide, and
 * the producer emits the wider shape so that `pinsForFreshness` can narrow it
 * rather than every record-shaped caller widening it. Two obligations follow,
 * and each is tested against something this module did not author:
 *
 *  - what the producer emits must satisfy the record contract and the ledger
 *    contract — checked through `parseVerificationResult` and
 *    `signingEntrySchema.parse`, never against a field list restated here.
 *    Those two contracts pin the corpus through **one** shared
 *    `corpusPinSchema` object, so this is a claim about the producer's width
 *    and no longer a watch for two definitions drifting apart;
 *  - the narrowing must not become a freshness trigger — checked through
 *    `deriveStaleness`, with positive controls, because "nothing moved" is
 *    also what a harness that can never report movement says.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  currentStateOf,
  pinsForFreshness,
  producePins,
} from '../src/verification/current-state';
import {
  parseVerificationResult,
  resultSha256,
  verificationResultSchema,
} from '../src/verification/result';
import { corpusPinSchema } from '../src/verification/corpus-pin';
import { requirementInputSha256 } from '../src/verification/canonical';
import { signingEntrySchema, type SigningEntry } from '../src/verification/ledger';
import { deriveStaleness } from '../src/verification/staleness';
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
import { fixtureStanding, pinInputFor } from './pipeline-fixtures';

const corpus = fixtureCorpus();
const index = fixtureIndex();
const closure = pinInputFor(computeClosure(index, docsForSources(index, ['SRC-100']), fixtureStanding()));
const requirement = fixtureRequirement();
const renderContext = fixtureRenderContext();

const pinInput = {
  requirement,
  renderContext,
  closure: { sha256: closure.sha256, docIds: closure.docIds, sourcesStanding: closure.sourcesStanding },
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
      producePins({ ...pinInput, closure: { sha256: 'a'.repeat(64), docIds: closure.docIds, sourcesStanding: closure.sourcesStanding } })
        .corpusClosureSha256,
    ).toBe('a'.repeat(64));
  });

  it('pins each document at its record width, reading versionLabel from the corpus', () => {
    const pins = producePins(pinInput);
    expect(pins.corpus.length).toBeGreaterThan(0);
    for (const pin of pins.corpus) {
      const document = corpus.document(pin.docId);
      // Value-asserted against the corpus, not merely present: a producer that
      // wrote a constant, the docId, or the empty string would satisfy
      // "has a versionLabel" and fail here.
      expect(pin.versionLabel).toBe(document.versionLabel);
      expect(pin.sha256Raw).toBe(document.sha256Raw);
      expect(pin.sha256Normalized).toBe(document.sha256Normalized);
      expect(pin.normalizerVersion).toBe(document.normalizerVersion);
    }
  });
});

// ---------------------------------------------------------------------------
// The two widths
// ---------------------------------------------------------------------------

/**
 * A schema-valid result, with the producer's pins spread in **verbatim**.
 *
 * Nothing is patched, widened or filled in on the way. That is the point: this
 * is not a fixture standing in for what Task 5 will assemble, it is the question
 * "does the record contract accept exactly what the one producer emits?", and a
 * test that reached into the corpus to top up a field would answer a different
 * question and hide the answer to this one. (It did, once — see
 * `pipeline-adjudicator.test.ts`.)
 */
function resultOverPins(pins = producePins(pinInput)): Record<string, unknown> {
  return {
    packId: 'testpack',
    requirementId: 'TEST-R-001',
    requirementVersion: 1,
    resultSchemaVersion: '1.3.0',
    pipelineVersion: 'pipeline-v1-unpromoted',
    rendererVersion: 'renderer-1.1.0',
    closureRendererVersion: 'closure-renderer-1.0.0',
    ...pins,
    reading: { elements: [] },
    coverage: { cells: [] },
    challenges: [],
    openQuestions: [],
    gaps: [],
  };
}

describe('the record width and the freshness width', () => {
  it('the record contract accepts the producer’s pins as they stand', () => {
    const pins = producePins(pinInput);
    // `parseVerificationResult`, the current authoritative shape, rather than a
    // field list restated here. A restated list agrees with whatever the test
    // author believed on the day, including after the schema has moved.
    const parsed = parseVerificationResult(resultOverPins(pins));
    expect(parsed.resultSchemaVersion).toBe('1.3.0');
    expect(parsed.corpus).toEqual(pins.corpus);
  });

  it('and refuses the freshness projection — so the previous test is not vacuous', () => {
    // The counterexample in the same shape. Without it, "the record accepts the
    // producer's pins" would pass equally against a schema that required
    // nothing at all.
    const narrowed = pinsForFreshness(producePins(pinInput));
    expect(() => parseVerificationResult(resultOverPins(narrowed as never))).toThrow(
      /versionLabel/,
    );
  });

  it('the ledger contract accepts them too, unwidened', () => {
    const pins = producePins(pinInput);
    const entry: unknown = {
      entryId: 'E-0001',
      kind: 'verified',
      packId: 'testpack',
      packVersion: '0.1.0',
      requirementId: requirement.id,
      requirementVersion: requirement.version,
      requirementSha256: 'f'.repeat(64),
      ...pins,
      rendererVersion: 'renderer-1.1.0',
      closureRendererVersion: 'closure-renderer-1.0.0',
      resultSha256: 'e'.repeat(64),
      pipelineVersion: 'pipeline-v1-unpromoted',
      by: 'fixture',
      on: '2026-08-21',
    };
    expect(signingEntrySchema.parse(entry).corpus).toEqual(pins.corpus);
    // No counterexample is restated here. It used to be: the freshness
    // projection was pushed through this schema too, so that two independent
    // definitions of the pin drifting apart would redden. There is one
    // definition now, and the identity assertion below is what closes vacuity —
    // structurally, rather than by re-running the record's counterexample
    // against an object that is provably the same object.
  });

  it('the freshness projection drops versionLabel and the three standing fields, and nothing else', () => {
    const pins = producePins(pinInput);
    const narrowed = pinsForFreshness(pins);

    // Teeth. `{ ...pin }` and `const { versionLabel, ...rest } = pin` both keep
    // the key set open, and both would pass a test that only checked the four
    // survivors are correct. An exact key set is what reddens against them.
    expect(narrowed.corpus.length).toBe(pins.corpus.length);
    for (const document of narrowed.corpus) {
      expect(Object.keys(document).sort()).toEqual([
        'docId',
        'normalizerVersion',
        'sha256Normalized',
        'sha256Raw',
      ]);
    }

    // And nothing else about the record moved: same scalars, same documents in
    // the same order, same values on every surviving field.
    const { corpus: producedCorpus, ...producedHashes } = pins;
    const { corpus: narrowedCorpus, ...narrowedHashes } = narrowed;
    expect(narrowedHashes).toEqual(producedHashes);
    // Standing is dropped from the freshness width on purpose: it enters
    // `corpusClosureSha256`, which freshness *does* compare, so `stale_closure`
    // is the reason that names a standing change. Comparing the fields again
    // here would be a second derivation of one fact.
    expect(narrowedCorpus).toEqual(
      producedCorpus.map(
        ({ versionLabel: _label, artefactAuthenticity: _auth, nonOperativeSections: _sections, sources: _sources, ...rest }) => rest,
      ),
    );
  });

  it('so no versionLabel survives anywhere into current state', () => {
    const state = currentStateOf({ ...pinInput, result: minimalResult() });
    expect(JSON.stringify(state)).not.toContain('versionLabel');
    // The positive control for that negative: the label is in the world, and the
    // producer did see it. Otherwise the line above passes on an empty closure.
    expect(JSON.stringify(producePins(pinInput))).toContain('versionLabel');
  });
});

/**
 * One pin contract, two artefacts.
 *
 * `result.ts` and `ledger.ts` each used to define this pin object for
 * themselves, byte-identically, and the sign gate compared a result's pins
 * against an entry's pins field by field on the strength of that coincidence.
 * `src/verification/corpus-pin.ts` is now the single definition — a module
 * owned by neither artefact, so neither one's idea of a pin governs the other's.
 *
 * What is asserted here is **object identity**, not structural agreement.
 * Structural agreement is what the old arrangement already had.
 */
describe('one corpus-pin contract, two artefacts', () => {
  it('is the identical object at the corpus position of both artefact schemas', () => {
    const resultShape = verificationResultSchema._def.shape() as Record<string, z.ZodTypeAny>;
    const ledgerShape = signingEntrySchema._def.shape() as Record<string, z.ZodTypeAny>;

    const inTheRecord = (resultShape['corpus'] as z.ZodArray<z.ZodTypeAny>)._def.type;
    const inTheLedger = (ledgerShape['corpus'] as z.ZodArray<z.ZodTypeAny>)._def.type;

    // `toBe`, never `toEqual`. Two separately-written definitions of the same
    // every field satisfies `toEqual` — that is precisely the arrangement this
    // replaced — and only reference identity makes divergence unwritable.
    expect(inTheRecord).toBe(corpusPinSchema);
    expect(inTheLedger).toBe(corpusPinSchema);
    expect(inTheRecord).toBe(inTheLedger);
  });

  it('and the shared object is still a plain strict ZodObject', () => {
    // The walker in `accounting.ts` descends into this node from **both**
    // roots. Wrapping it in a `ZodEffects` for some cross-pin rule would hide
    // every field from two artefacts at once, so the constraint the two
    // module headers state is asserted here against the one object they share.
    expect(corpusPinSchema._def.typeName).toBe('ZodObject');
    expect(corpusPinSchema._def.unknownKeys).toBe('strict');
  });
});

describe('a re-labelled document is still fresh', () => {
  /** An entry pinning exactly the world `pinInput` describes. */
  function matchingEntry(over: Partial<SigningEntry['corpus'][number]> = {}): SigningEntry {
    const pins = producePins(pinInput);
    return {
      entryId: 'E-0001',
      kind: 'verified',
      packId: 'testpack',
      packVersion: '0.1.0',
      requirementId: requirement.id,
      requirementVersion: requirement.version,
      requirementSha256: 'f'.repeat(64),
      requirementInputSha256: pins.requirementInputSha256,
      conditionSha256: pins.conditionSha256,
      renderedConditionSha256: pins.renderedConditionSha256,
      rendererVersion: 'renderer-1.1.0',
      closureRendererVersion: 'closure-renderer-1.0.0',
      corpusClosureSha256: pins.corpusClosureSha256,
      corpus: pins.corpus.map((pin) => ({ ...pin, ...over })),
      resultSha256: resultSha256(minimalResult()),
      pipelineVersion: 'pipeline-v1-unpromoted',
      by: 'fixture',
      on: '2026-08-21',
    };
  }

  const state = () => currentStateOf({ ...pinInput, result: minimalResult() });

  it('the publisher relabels the file and the signature does not go stale', () => {
    // The producer now knows `versionLabel`. This is the property that must not
    // have changed because of it: a re-labelled but byte-identical document
    // reads as fresh, and there is no such thing as a `stale_version_label`.
    expect(deriveStaleness(matchingEntry(), state())).toEqual([]);
    expect(
      deriveStaleness(
        matchingEntry({ versionLabel: 'consolidated 4 Jul 2027 — bytes untouched' }),
        state(),
      ),
    ).toEqual([]);
  });

  it('but each field freshness *does* compare moves it, one at a time', () => {
    // Failure mode #7: an empty set is also what a harness incapable of ever
    // reporting movement returns. These three prove this one can move, and that
    // the fields it moves on are exactly the three the projection keeps.
    expect(deriveStaleness(matchingEntry({ sha256Raw: '9'.repeat(64) }), state())).toEqual([
      'source_reissued',
    ]);
    expect(deriveStaleness(matchingEntry({ sha256Normalized: '9'.repeat(64) }), state())).toEqual([
      'stale_source_text',
    ]);
    expect(deriveStaleness(matchingEntry({ normalizerVersion: '0.0.0-other' }), state())).toEqual([
      'normalizer_changed',
    ]);
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
    resultSchemaVersion: '1.3.0',
    pipelineVersion: 'pipeline-v1-unpromoted',
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
  };
}

/**
 * Everything `deriveStaleness` is allowed to compare, written out.
 *
 * **Deliberately a literal, and deliberately not derived from
 * `pinsForFreshness`, `CurrentState` or `producePins`.** The assertion below is
 * the one standing between a scalar added to the *record* contract and the
 * *freshness* comparison, and a version of it that read its expected key set
 * back out of the projection agreed with the projection by construction —
 * failure mode #1, the check reproducing the mechanism it checks. Widening
 * `VerificationPins` by one scalar passed it.
 *
 * The cost of a literal is that it must be edited when the freshness contract
 * genuinely changes. That is the entire point: it converts "a field appeared in
 * `CurrentState`" from something nothing observes into a line somebody has to
 * write on purpose.
 */
const FRESHNESS_FIELDS = [
  'requirementInputSha256',
  'conditionSha256',
  'renderedConditionSha256',
  'corpusClosureSha256',
  'corpus',
  'resultSha256',
] as const;

describe('currentStateOf', () => {
  it('compares exactly the freshness fields, and no field the record added', () => {
    const result = minimalResult();
    const state = currentStateOf({ ...pinInput, result });

    // Against the literal above, so the two sides can disagree. A scalar added
    // to `VerificationPins` and inherited by the projection reddens here,
    // naming itself.
    expect(Object.keys(state).sort()).toEqual([...FRESHNESS_FIELDS].sort());

    // The values still come from the producer: naming the fields must not turn
    // this into a shape test that any record of the right shape would pass.
    const projected = pinsForFreshness(producePins(pinInput));
    for (const key of Object.keys(projected) as Array<keyof typeof projected>) {
      expect(state[key]).toEqual(projected[key]);
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
      closure: { sha256: closure.sha256, docIds: closure.docIds, sourcesStanding: closure.sourcesStanding },
      corpus,
      pipelineVersion: 'pipeline-v1-unpromoted',
      rendererVersion: 'renderer-1.1.0',
      closureRendererVersion: 'closure-renderer-1.0.0',
      resultSchemaVersion: '1.3.0',
      roleOutputs: {
        reading: stubReaderOutput(),
        prosecutions: [stubProsecutorOutput('stub_lens')],
        adjudication: stubAdjudicatorOutput(),
      },
    });
    expect(outcome.pins).toEqual(producePins(pinInput));
  });
});
