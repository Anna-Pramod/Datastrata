/**
 * The prosecutors — §3.2 — and the bidirectional coverage table.
 *
 * **What this file does not claim.** Nothing here is evidence about what live
 * lenses discover. An earlier revision of the plan proposed running N=1 against
 * N=3 over the same recording and reading the difference as proof that lenses
 * are not decorative; under replay N=3 replays three recorded outputs and the
 * union differs trivially, so the assertion is satisfied unconditionally
 * (failure mode #5) and says nothing about any model. Whether several live
 * lenses find meaningfully different defects is a B3 benchmark property, and
 * §5.2 says only a live run tests the agents. Every check below is about
 * machinery: types, gates, address vocabulary, assembly and configuration.
 *
 * The failure modes from `docs/superpowers/TEST-EVIDENCE-STANDARD.md` this file
 * is written against:
 *
 *  - **#1** — the address vocabulary is derived from `verification/features.ts`,
 *    the walker the render checker already uses, rather than from a second one
 *    written here that would agree with this module's own mistakes.
 *  - **#4** — `assertEveryLensRan` and the missing-exchange refusal are two
 *    separate guards with two distinct errors, and each is exercised on its own
 *    so neither can mask the other. `assertEveryLensRan` is additionally called
 *    directly with lists its natural caller cannot produce.
 *  - **#5 / #7** — every refusal below is paired with the case where the same
 *    seam accepts, and every "does not appear" with a case where it does.
 *  - **compile boundary** — asserted with `@ts-expect-error`, which
 *    `npm run typecheck` fails on if the line ever *would* compile. A runtime
 *    assertion in its place would pass unconditionally.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertBothDirectionsWalked,
  assertEveryLensRan,
  assertProsecutorCoverage,
  assertVerdictVocabulariesDisjoint,
  buildCoverageTable,
  conditionPathsFor,
  configuredLenses,
  coverageContextFor,
  ADVERSE_COVERAGE_VERDICTS,
  OneDirectionalCoverageError,
  ProsecutorLensMismatchError,
  ProsecutorTranscriptMissingError,
  prosecutorInputFor,
  PROSECUTOR_INPUT_FIELDS,
  qualifiedChallengeId,
  renderProsecutorInput,
  runProsecutors,
  type PeerFree,
  type ProsecutorChallenge,
  type ProsecutorInput,
} from '../src/pipeline/prosecutors';
import { DEFAULT_ROLE_CONFIG, lensFor, type RoleConfig } from '../src/pipeline/config';
import { EntitledClosure, renderEntitledClosure } from '../src/pipeline/entitlement';
import { loadPromptSet } from '../src/pipeline/prompts';
import { parseRoleOutput, type ProsecutorOutput, type ReaderOutput } from '../src/pipeline/role-outputs';
import { RoleOutputError } from '../src/pipeline/roles';
import { replayRunner } from '../src/pipeline/replay';
import { pipelineVersionFor, runVerificationPipeline } from '../src/pipeline/orchestrate';
import { renderReaderInput, readerInputFor } from '../src/pipeline/reader';
import { featuresFromRequirement } from '../src/verification/features';
import { ADVERSE_COVERAGE, coverageVerdictSchema } from '../src/verification/result';
import { sha256Hex } from '../src/corpus/hash';
import type { AuthoredRequirement, Condition } from '../src/types';
import {
  docText,
  fixtureAuthorisedCorpus,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  NOT_INGESTED,
  stubProsecutorOutput,
  stubReaderOutput,
  stubRunner,
  fixtureRegister,
} from './pipeline-fixtures';
import { fixtureSourceUniverse } from './pipeline-fixtures';

const corpus = fixtureAuthorisedCorpus();
const prompts = loadPromptSet();
const ctxRender = fixtureRenderContext();

function fixtureClosure(): EntitledClosure {
  return EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']);
}

/** Two atoms under one `all`, so the address vocabulary has groups in it. */
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

function quote(text = 'The operative test is stated here.') {
  return {
    kind: 'quote' as const,
    docId: 'DOC-A',
    sha256Normalized: sha256Hex(docText('DOC-A')),
    text,
  };
}

function reading(ids: readonly string[] = ['RE-1']): ReaderOutput {
  return {
    elements: ids.map((id) => ({ id, statement: `reading element ${id}`, evidence: [quote()] })),
    gaps: [],
  };
}

function challenge(id: string, lens: string) {
  return { id, lens, statement: `challenge ${id}`, evidence: [quote()] };
}

// ---------------------------------------------------------------------------
// Layer 1 — the compile boundary
// ---------------------------------------------------------------------------

/** A prosecutor input that can see another prosecutor's work. It may not be one. */
type PeerBearingInput = ProsecutorInput & { peers: readonly ProsecutorOutput[] };

// @ts-expect-error a prosecutor input carrying another prosecutor's output is not PeerFree
const peerBearingWitness: PeerBearingInput extends PeerFree<PeerBearingInput> ? true : never = true;

/** The positive control: the real input does inhabit the witness type. */
const peerFreeWitness: ProsecutorInput extends PeerFree<ProsecutorInput> ? true : never = true;

/** The same rule for the single-output shape, which is what a peer really is. */
type SinglePeerInput = ProsecutorInput & { earlierPass: ProsecutorOutput };
// @ts-expect-error one peer output is as disqualifying as a list of them
const singlePeerWitness: SinglePeerInput extends PeerFree<SinglePeerInput> ? true : never = true;

/** A challenge carrying an adjudication. There is no key for it. */
type VerdictBearingChallenge = ProsecutorChallenge & { verdict: 'MISMATCH' };

// @ts-expect-error `verdict` is a key of this type, so the witness resolves to never
const verdictBearingWitness: 'verdict' extends keyof VerdictBearingChallenge ? never : true = true;

/** The positive control: the real challenge has no `verdict` key. */
const verdictFreeWitness: 'verdict' extends keyof ProsecutorChallenge ? never : true = true;

const adjudicatingChallenge: ProsecutorChallenge = {
  id: 'C1',
  lens: 'missing_criterion',
  statement: 's',
  evidence: [quote()],
  // @ts-expect-error a prosecutor challenge has nowhere to put an adjudication
  verdict: 'MISMATCH',
};

/** The positive control: the same object without the verdict is a challenge. */
const honestChallenge: ProsecutorChallenge = {
  id: 'C1',
  lens: 'missing_criterion',
  statement: 's',
  evidence: [quote()],
};

const peerBearingInput: ProsecutorInput = prosecutorInputFor({
  reading: reading(),
  renderedCondition: 'x',
  conditionPaths: [],
  lens: 'missing_criterion',
  closure: fixtureClosure(),
  // @ts-expect-error a prosecutor input has no field for a peer's output
  peers: [],
});

/** Referenced so the declarations above are not dead code to a linter. */
export type ProsecutorCompileWitnesses = [
  typeof peerBearingWitness,
  typeof peerFreeWitness,
  typeof singlePeerWitness,
  typeof verdictBearingWitness,
  typeof verdictFreeWitness,
  typeof adjudicatingChallenge,
  typeof honestChallenge,
  typeof peerBearingInput,
];

// ---------------------------------------------------------------------------
// Layer 2 — a verdict is refused at runtime too
// ---------------------------------------------------------------------------

describe('a prosecutor challenges and never adjudicates', () => {
  const base = {
    lens: 'missing_criterion',
    coverage: [],
    challenges: [challenge('C1', 'missing_criterion')],
    gaps: [],
  };

  it('refuses a challenge carrying an adjudication, naming the field', () => {
    let error: unknown;
    try {
      parseRoleOutput('prosecutor', 1, {
        ...base,
        challenges: [{ ...challenge('C1', 'missing_criterion'), verdict: 'MISMATCH' }],
      });
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(RoleOutputError);
    const problems = (error as RoleOutputError).problems.join(' ');
    expect(problems).toContain('verdict');
    expect((error as RoleOutputError).message).toContain('prosecutor[1]');
  });

  it('refuses an adjudication word in a coverage cell', () => {
    // The two vocabularies are disjoint enums, so `MISMATCH` is not a coverage
    // verdict and the enum refuses it. Without this the cell would be the one
    // place a prosecutor could still adjudicate.
    expect(() =>
      parseRoleOutput('prosecutor', 0, {
        ...base,
        coverage: [{ direction: 'reading_to_condition', readingElementId: 'RE-1', verdict: 'MISMATCH' }],
      }),
    ).toThrow(/verdict/);
  });

  it('refuses a verdict at the top of the output', () => {
    expect(() => parseRoleOutput('prosecutor', 0, { ...base, verdict: 'CONFIRMED' })).toThrow(
      /verdict/,
    );
  });

  it('positive control: the same output without any verdict is accepted', () => {
    // Without this the three refusals above are satisfied by a seam that
    // refuses everything — failure mode #7.
    const parsed = parseRoleOutput('prosecutor', 0, JSON.parse(JSON.stringify(base)));
    expect(parsed.challenges).toHaveLength(1);
    expect(Object.keys(parsed.challenges[0] ?? {})).not.toContain('verdict');
  });

  it('the coverage and adjudication vocabularies are disjoint, derived from both enums', () => {
    // Derived from `.options` on the two schemas rather than restated, so a
    // future widening of `coverageVerdictSchema` fails here rather than
    // silently handing a prosecutor an adjudication word.
    expect(() => assertVerdictVocabulariesDisjoint()).not.toThrow();
    expect(coverageVerdictSchema.options).toContain('MAPPED');
    // Positive control for the predicate: it does detect an overlap when given
    // one, so the pass above is not vacuous.
    const adjudication = new Set(['CONFIRMED', 'MISMATCH', 'OPEN_QUESTION']);
    expect(['MAPPED', 'MISMATCH'].filter((v) => adjudication.has(v))).toEqual(['MISMATCH']);
    expect(coverageVerdictSchema.options.filter((v) => adjudication.has(v))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Blindness to peers, observed as well as typed
// ---------------------------------------------------------------------------

describe('each prosecutor is blind to the others', () => {
  it('the built input carries exactly §3.2’s fields and no more', () => {
    const input = prosecutorInputFor({
      reading: reading(),
      renderedCondition: 'the condition in English',
      conditionPaths: ['root'],
      lens: 'missing_criterion',
      closure: fixtureClosure(),
    });
    expect(Object.keys(input).sort()).toEqual([...PROSECUTOR_INPUT_FIELDS]);
  });

  it('no prosecutor’s message contains an earlier prosecutor’s output', async () => {
    const config: RoleConfig = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 3 };
    const runner = stubRunner((request) =>
      request.role === 'prosecutor'
        ? JSON.stringify({
            lens: lensFromRequest(request),
            coverage: [
              {
                direction: 'reading_to_condition',
                readingElementId: 'RE-1',
                verdict: 'UNMAPPED',
                challengeId: `C-${request.index}`,
              },
              {
                direction: 'condition_to_reading',
                conditionPath: 'root',
                readingElementId: 'RE-1',
                verdict: 'MAPPED',
              },
            ],
            challenges: [challenge(`C-${request.index}`, lensFromRequest(request))],
            gaps: [],
          })
        : '{}',
    );

    const outcome = await runProsecutors({
      reading: reading(),
      renderedCondition: 'the condition in English',
      conditionPaths: conditionPathsFor(fixtureRequirement(), ctxRender),
      closure: fixtureClosure(),
      config,
      prompt: prompts.prosecutor,
      runner,
    });
    expect(outcome.executions).toHaveLength(3);

    const rendered = runner.requests.map(
      (request) => request.messages.find((message) => message.from === 'input')?.content ?? '',
    );
    // Prosecutor 0's challenge id and statement must not appear in what 1 and 2
    // were sent.
    expect(rendered[1]).not.toContain('C-0');
    expect(rendered[2]).not.toContain('C-0');
    // Word-bounded: the closure's standing block now renders source values
    // and the fixture's `SRC-100` would otherwise match as a substring.
    expect(rendered[2]).not.toMatch(/\bC-1\b/);
    // Positive control (failure mode #7): the messages are not empty, and each
    // *does* carry the material a prosecutor is entitled to — so "C-0 is
    // absent" is a statement about peer output rather than about a blank page.
    for (const message of rendered) {
      expect(message).toContain('# Blind reading');
      expect(message).toContain('RE-1');
      expect(message).toContain('# Rendered condition');
    }
    // And prosecutor 0's own output really did contain the string being sought,
    // so the absence above is not an absence of the thing from the whole run.
    expect(JSON.stringify(outcome.outputs[0])).toContain('C-0');
  });
});

// ---------------------------------------------------------------------------
// The address vocabulary of the encoding
// ---------------------------------------------------------------------------

describe('condition addresses are derived, not invented', () => {
  it('takes atom addresses from the feature walker the render checker uses', () => {
    const requirement = compoundRequirement();
    const paths = conditionPathsFor(requirement, ctxRender);
    const atoms = featuresFromRequirement(requirement, ctxRender).condition?.atoms ?? [];
    expect(atoms.map((atom) => atom.path)).toEqual(['all[0]', 'all[1]']);
    // Every atom address is in the vocabulary, and so is the group they sit in.
    for (const atom of atoms) expect(paths).toContain(atom.path);
    expect(paths).toContain('root');
    expect([...paths]).toEqual(['all[0]', 'all[1]', 'root']);
  });

  it('a bare leaf condition addresses only the root', () => {
    expect([...conditionPathsFor(fixtureRequirement(), ctxRender)]).toEqual(['root']);
  });

  it('nests group addresses so a conjunction inside a conjunction has one', () => {
    const nested: Condition = {
      op: 'all',
      of: [
        { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 1 },
        { op: 'any', of: [{ op: 'cmp', fact: 'entity.turnover', cmp: 'lt', value: 2 }] },
      ],
    };
    const paths = conditionPathsFor(fixtureRequirement({ condition: nested }), ctxRender);
    expect([...paths]).toEqual(['all[0]', 'all[1]', 'all[1].any[0]', 'root']);
  });

  it('a condition with no atoms has no addresses at all', () => {
    // The guard case for `assertBothDirectionsWalked`: nothing to walk over.
    const empty = fixtureRequirement();
    delete (empty as { condition?: Condition }).condition;
    expect([...conditionPathsFor(empty, ctxRender)]).toEqual([]);
  });

  it('refuses a cell naming an address this condition does not have', () => {
    const ctx = coverageContextFor(reading(), conditionPathsFor(compoundRequirement(), ctxRender));
    let error: unknown;
    try {
      assertProsecutorCoverage(
        {
          lens: 'missing_criterion',
          coverage: [
            { direction: 'condition_to_reading', conditionPath: 'all[7]', readingElementId: 'RE-1', verdict: 'MAPPED' },
          ],
          challenges: [],
          gaps: [],
        },
        ctx,
        2,
      );
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(RoleOutputError);
    expect((error as RoleOutputError).problems.join(' ')).toContain('all[7]');
    // Positive control: the same cell at a real address is accepted.
    expect(() =>
      assertProsecutorCoverage(
        {
          lens: 'missing_criterion',
          coverage: [
            { direction: 'condition_to_reading', conditionPath: 'all[0]', readingElementId: 'RE-1', verdict: 'MAPPED' },
          ],
          challenges: [],
          gaps: [],
        },
        ctx,
        2,
      ),
    ).not.toThrow();
  });

  it('refuses a cell naming a reading element the reading never made', () => {
    const ctx = coverageContextFor(reading(['RE-1']), ['root']);
    expect(() =>
      assertProsecutorCoverage(
        {
          lens: 'l',
          coverage: [
            { direction: 'reading_to_condition', readingElementId: 'RE-9', conditionPath: 'root', verdict: 'MAPPED' },
          ],
          challenges: [],
          gaps: [],
        },
        ctx,
      ),
    ).toThrow(/RE-9/);
  });
});

// ---------------------------------------------------------------------------
// The per-cell rules
// ---------------------------------------------------------------------------

describe('the coverage gate, rule by rule', () => {
  const ctx = coverageContextFor(reading(['RE-1']), ['root']);

  function output(
    coverage: ProsecutorOutput['coverage'],
    challenges: ProsecutorOutput['challenges'] = [challenge('C1', 'l')],
  ): ProsecutorOutput {
    return { lens: 'l', coverage, challenges, gaps: [] };
  }

  it('refuses UNMAPPED walked the condition→reading way', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([{ direction: 'condition_to_reading', conditionPath: 'root', verdict: 'UNMAPPED', challengeId: 'C1' }]),
        ctx,
      ),
    ).toThrow(/belongs to reading_to_condition/);
  });

  it('refuses UNSUPPORTED walked the reading→condition way', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([
          { direction: 'reading_to_condition', readingElementId: 'RE-1', verdict: 'UNSUPPORTED', challengeId: 'C1' },
        ]),
        ctx,
      ),
    ).toThrow(/belongs to condition_to_reading/);
  });

  it('positive control: each direction accepts its own definite adverse verdict', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([
          { direction: 'reading_to_condition', readingElementId: 'RE-1', verdict: 'UNMAPPED', challengeId: 'C1' },
          { direction: 'condition_to_reading', conditionPath: 'root', verdict: 'UNSUPPORTED', challengeId: 'C1' },
        ]),
        ctx,
      ),
    ).not.toThrow();
  });

  it('refuses a cell that does not name the axis it was walked along', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([{ direction: 'reading_to_condition', conditionPath: 'root', verdict: 'UNCERTAIN', challengeId: 'C1' }]),
        ctx,
      ),
    ).toThrow(/must name its own readingElementId/);
    expect(() =>
      assertProsecutorCoverage(
        output([
          { direction: 'condition_to_reading', readingElementId: 'RE-1', verdict: 'UNCERTAIN', challengeId: 'C1' },
        ]),
        ctx,
      ),
    ).toThrow(/must name its own conditionPath/);
  });

  it('refuses a MAPPED cell that maps to nothing', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([{ direction: 'reading_to_condition', readingElementId: 'RE-1', verdict: 'MAPPED' }]),
        ctx,
      ),
    ).toThrow(/must name the conditionPath it mapped to/);
  });

  it('refuses an UNMAPPED cell that names a counterpart', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([
          {
            direction: 'reading_to_condition',
            readingElementId: 'RE-1',
            conditionPath: 'root',
            verdict: 'UNMAPPED',
            challengeId: 'C1',
          },
        ]),
        ctx,
      ),
    ).toThrow(/UNMAPPED names a conditionPath/);
  });

  it('refuses adverse coverage that names no challenge — the link originates here', () => {
    for (const verdict of ['UNMAPPED', 'UNCERTAIN'] as const) {
      expect(() =>
        assertProsecutorCoverage(
          output([{ direction: 'reading_to_condition', readingElementId: 'RE-1', verdict }]),
          ctx,
        ),
      ).toThrow(/carries no challengeId/);
    }
  });

  it('refuses adverse coverage naming a challenge this prosecutor did not raise', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([
          { direction: 'reading_to_condition', readingElementId: 'RE-1', verdict: 'UNMAPPED', challengeId: 'C-NOPE' },
        ]),
        ctx,
      ),
    ).toThrow(/names no challenge this prosecutor raised/);
  });

  it('refuses a MAPPED cell that names a challenge', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([
          {
            direction: 'reading_to_condition',
            readingElementId: 'RE-1',
            conditionPath: 'root',
            verdict: 'MAPPED',
            challengeId: 'C1',
          },
        ]),
        ctx,
      ),
    ).toThrow(/a mapped cell has nothing to challenge/);
  });

  it('refuses two challenges sharing an id', () => {
    expect(() =>
      assertProsecutorCoverage(output([], [challenge('C1', 'l'), challenge('C1', 'l')]), ctx),
    ).toThrow(/duplicate challenge id/);
  });

  it('refuses a challenge filed under a lens this prosecutor does not work', () => {
    expect(() =>
      assertProsecutorCoverage(output([], [challenge('C1', 'some_other_lens')]), ctx),
    ).toThrow(/this prosecutor works lens l/);
  });

  it('refuses a challenge resting entirely on absence', () => {
    expect(() =>
      assertProsecutorCoverage(
        output([], [
          {
            id: 'C1',
            lens: 'l',
            statement: 'nothing like this appears',
            evidence: [{ kind: 'absence', docIds: ['DOC-A'], term: 'turnover' }],
          },
        ]),
        ctx,
      ),
    ).toThrow(/sole evidence/);
    // Positive control: absence *alongside* a quote is fine — the rule is over
    // kinds, not counts.
    expect(() =>
      assertProsecutorCoverage(
        output([], [
          {
            id: 'C1',
            lens: 'l',
            statement: 'the operative test says X and never mentions Y',
            evidence: [quote(), { kind: 'absence', docIds: ['DOC-A'], term: 'turnover' }],
          },
        ]),
        ctx,
      ),
    ).not.toThrow();
  });

  it('reports every problem, not the first', () => {
    let error: unknown;
    try {
      assertProsecutorCoverage(
        output(
          [
            { direction: 'reading_to_condition', readingElementId: 'RE-9', verdict: 'MAPPED' },
            { direction: 'condition_to_reading', conditionPath: 'nope', verdict: 'UNSUPPORTED' },
          ],
          [challenge('C1', 'wrong_lens')],
        ),
        ctx,
      );
    } catch (thrown) {
      error = thrown;
    }
    expect((error as RoleOutputError).problems.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// The assembled table
// ---------------------------------------------------------------------------

describe('the bidirectional coverage table', () => {
  const ctx = coverageContextFor(reading(['RE-1']), ['root']);

  const first: ProsecutorOutput = {
    lens: 'missing_criterion',
    coverage: [
      { direction: 'reading_to_condition', readingElementId: 'RE-1', verdict: 'UNMAPPED', challengeId: 'C1' },
      { direction: 'condition_to_reading', conditionPath: 'root', readingElementId: 'RE-1', verdict: 'MAPPED' },
    ],
    challenges: [challenge('C1', 'missing_criterion')],
    gaps: [],
  };
  const second: ProsecutorOutput = {
    lens: 'wrong_conjunction',
    coverage: [
      { direction: 'condition_to_reading', conditionPath: 'root', verdict: 'UNSUPPORTED', challengeId: 'C1' },
      {
        direction: 'reading_to_condition',
        readingElementId: 'RE-1',
        conditionPath: 'root',
        verdict: 'MAPPED',
      },
    ],
    challenges: [challenge('C1', 'wrong_conjunction')],
    gaps: [],
  };

  it('carries both directions', () => {
    const table = buildCoverageTable([first, second]);
    expect(table.cells.map((cell) => cell.direction).sort()).toEqual([
      'condition_to_reading',
      'condition_to_reading',
      'reading_to_condition',
      'reading_to_condition',
    ]);
    expect(() => assertBothDirectionsWalked(table, ctx)).not.toThrow();
  });

  it('refuses a table walked only one way', () => {
    const oneWay = buildCoverageTable([
      { ...first, coverage: first.coverage.filter((c) => c.direction === 'reading_to_condition') },
    ]);
    let error: unknown;
    try {
      assertBothDirectionsWalked(oneWay, ctx);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(OneDirectionalCoverageError);
    expect((error as OneDirectionalCoverageError).missing).toEqual(['condition_to_reading']);
    // The other way round too, so the refusal is about the missing direction
    // and not about `condition_to_reading` in particular.
    const otherWay = buildCoverageTable([
      { ...first, coverage: first.coverage.filter((c) => c.direction === 'condition_to_reading') },
    ]);
    expect(() => assertBothDirectionsWalked(otherWay, ctx)).toThrow(/no reading_to_condition/);
  });

  it('does not demand cells when there is nothing to walk over', () => {
    const empty = buildCoverageTable([]);
    expect(() => assertBothDirectionsWalked(empty, coverageContextFor(reading([]), ['root']))).not.toThrow();
    expect(() => assertBothDirectionsWalked(empty, coverageContextFor(reading(['RE-1']), []))).not.toThrow();
    // Positive control: with material on both axes, the same empty table is
    // refused — so the two passes above are the guard and not a dead check.
    expect(() => assertBothDirectionsWalked(empty, ctx)).toThrow(OneDirectionalCoverageError);
  });

  it('qualifies challenge ids by the prosecutor that raised them', () => {
    const table = buildCoverageTable([first, second]);
    expect(table.challenges.map((entry) => entry.id)).toEqual(['P0-C1', 'P1-C1']);
    expect(new Set(table.challenges.map((entry) => entry.id)).size).toBe(2);
    // Both prosecutors called it `C1`; without qualification the record would
    // carry one id naming two challenges, which `assertResultConsistency`
    // refuses and a gate could only resolve by guessing.
    expect(first.challenges[0]?.id).toBe(second.challenges[0]?.id);
    expect(qualifiedChallengeId(1, 'C1')).toBe('P1-C1');
  });

  it('rewrites the cells’ links in the same pass, so none is left dangling', () => {
    const table = buildCoverageTable([first, second]);
    const adverse = table.cells.filter((cell) => cell.verdict !== 'MAPPED');
    expect(adverse).toHaveLength(2);
    expect(adverse.map((cell) => cell.challengeId)).toEqual(['P0-C1', 'P1-C1']);
    // The property `assertResultConsistency` enforces on the whole record,
    // checked where it originates: every adverse cell names a challenge the
    // table actually carries, and no MAPPED cell names one.
    const ids = new Set(table.challenges.map((entry) => entry.id));
    for (const cell of table.cells) {
      if (cell.verdict === 'MAPPED') expect(cell.challengeId).toBeUndefined();
      else expect(ids.has(cell.challengeId ?? '')).toBe(true);
    }
  });

  it('carries no verdict on any challenge it assembles', () => {
    const table = buildCoverageTable([first, second]);
    for (const entry of table.challenges) {
      expect(Object.keys(entry).sort()).toEqual(['evidence', 'id', 'lens', 'statement']);
    }
  });

  it('does not reconcile two lenses that disagree about one address', () => {
    // Both prosecutors reached `RE-1` walking reading→condition and answered
    // differently. Both cells stand: choosing between them is an adjudication.
    const table = buildCoverageTable([first, second]);
    const atRe1 = table.cells.filter(
      (cell) => cell.direction === 'reading_to_condition' && cell.readingElementId === 'RE-1',
    );
    expect(atRe1.map((cell) => cell.verdict)).toEqual(['UNMAPPED', 'MAPPED']);
  });
});

// ---------------------------------------------------------------------------
// Configuration is real machinery
// ---------------------------------------------------------------------------

describe('the prosecutor count and the lens set are configuration', () => {
  function run(config: RoleConfig) {
    return runProsecutors({
      reading: reading(),
      renderedCondition: 'the condition in English',
      conditionPaths: ['root'],
      closure: fixtureClosure(),
      config,
      prompt: prompts.prosecutor,
      runner: stubRunner((request) =>
        JSON.stringify(stubProsecutorOutput(lensFromRequest(request), { readingElementId: 'RE-1' })),
      ),
    });
  }

  it('runs exactly as many prosecutors as the configuration says', async () => {
    for (const prosecutorCount of [1, 2, 5]) {
      const outcome = await run({ ...DEFAULT_ROLE_CONFIG, prosecutorCount });
      expect(outcome.executions).toHaveLength(prosecutorCount);
      expect(outcome.executions.map((execution) => execution.transcript.index)).toEqual(
        Array.from({ length: prosecutorCount }, (_, i) => i),
      );
    }
  });

  it('hands prosecutor i the configured lens i, wrapping when there are fewer', async () => {
    const config: RoleConfig = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 5, lenses: ['a', 'b'] };
    expect(configuredLenses(config)).toEqual(['a', 'b', 'a', 'b', 'a']);
    const outcome = await run(config);
    expect(outcome.outputs.map((output) => output.lens)).toEqual(['a', 'b', 'a', 'b', 'a']);
    // and the lens sequence really did come from the configuration, not from a
    // default: a different lens set produces a different sequence.
    const other = await run({ ...DEFAULT_ROLE_CONFIG, prosecutorCount: 2, lenses: ['q', 'r'] });
    expect(other.outputs.map((output) => output.lens)).toEqual(['q', 'r']);
    expect(lensFor(config, 3)).toBe('b');
  });
});

describe('both configured inputs reach pipelineVersion, one at a time', () => {
  const closure = fixtureClosure();
  const identity = (config: RoleConfig) =>
    pipelineVersionFor({ prompts, config, closure, resultSchemaVersion: '1.3.0' });
  const before = identity(DEFAULT_ROLE_CONFIG);

  it('varying neither leaves it byte-identical', () => {
    expect(identity({ ...DEFAULT_ROLE_CONFIG })).toBe(before);
    expect(identity(DEFAULT_ROLE_CONFIG)).toBe(before);
  });

  it('moves when only the prosecutor count moves', () => {
    expect(
      identity({ ...DEFAULT_ROLE_CONFIG, prosecutorCount: DEFAULT_ROLE_CONFIG.prosecutorCount + 1 }),
    ).not.toBe(before);
  });

  it('moves when only the lens set moves', () => {
    expect(
      identity({ ...DEFAULT_ROLE_CONFIG, lenses: [...DEFAULT_ROLE_CONFIG.lenses, 'wrong_currency'] }),
    ).not.toBe(before);
  });

  it('moves when only the lens order moves', () => {
    const reversed = [...DEFAULT_ROLE_CONFIG.lenses].reverse();
    expect([...reversed].sort()).toEqual([...DEFAULT_ROLE_CONFIG.lenses].sort());
    expect(identity({ ...DEFAULT_ROLE_CONFIG, lenses: reversed })).not.toBe(before);
  });
});

// ---------------------------------------------------------------------------
// A configured lens with no recorded exchange fails by name
// ---------------------------------------------------------------------------

describe('three configured lenses require three recorded exchanges', () => {
  const requirement = fixtureRequirement();

  function runInput(runner: Parameters<typeof runVerificationPipeline>[0]['runner'], config = DEFAULT_ROLE_CONFIG) {
    return {
      packId: 'testpack',
      requirementId: requirement.id,
      requirement,
      renderContext: ctxRender,
      closure: fixtureClosure(),
      corpus,
      prompts,
      config,
      runner,
    };
  }

  it('fails by name when a configured lens has no recorded exchange', async () => {
    const config: RoleConfig = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 3 };
    const live = await runVerificationPipeline(
      runInput(
        stubRunner((request) =>
          request.role === 'reader'
            ? JSON.stringify(stubReaderOutput())
            : request.role === 'prosecutor'
              ? JSON.stringify(stubProsecutorOutput(lensFromRequest(request)))
              : JSON.stringify({ adjudications: [], gaps: [] }),
        ),
        config,
      ),
    );
    expect(live.executions.prosecutors).toHaveLength(3);

    // Drop prosecutor[2]'s recording and replay. The third configured lens now
    // has no exchange.
    const short = {
      ...live.transcript,
      roles: live.transcript.roles.filter(
        (role) => !(role.role === 'prosecutor' && role.index === 2),
      ),
    };
    let error: unknown;
    try {
      await runVerificationPipeline(runInput(replayRunner(short), config));
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(ProsecutorTranscriptMissingError);
    const failure = error as ProsecutorTranscriptMissingError;
    expect(failure.index).toBe(2);
    expect(failure.lens).toBe(lensFor(config, 2));
    expect(failure.message).toContain(lensFor(config, 2));
    expect(failure.message).toContain('no recorded exchange');

    // Positive control: the complete recording replays all three cleanly, so
    // the refusal is about the missing exchange and not about replay at all.
    const replayed = await runVerificationPipeline(runInput(replayRunner(live.transcript), config));
    expect(replayed.executions.prosecutors).toHaveLength(3);
    expect(replayed.prosecution.outputs.map((output) => output.lens)).toEqual(
      configuredLenses(config),
    );
  });
});

describe('the lenses that answered are the lenses that were configured', () => {
  // Called directly with lists `runProsecutors` cannot produce without a
  // mutation, so this guard and the missing-exchange guard cannot mask one
  // another (failure mode #4).
  it('accepts the exact configured sequence', () => {
    expect(() => assertEveryLensRan(['a', 'b'], ['a', 'b'])).not.toThrow();
  });

  it('refuses a short list', () => {
    expect(() => assertEveryLensRan(['a', 'b', 'c'], ['a', 'b'])).toThrow(ProsecutorLensMismatchError);
  });

  it('refuses a long list', () => {
    expect(() => assertEveryLensRan(['a'], ['a', 'b'])).toThrow(ProsecutorLensMismatchError);
  });

  it('refuses the right lenses in the wrong order', () => {
    // §5.1 pins ordering: prosecutor i taking a different lens is a different
    // pipeline even when the same lenses run.
    expect(() => assertEveryLensRan(['a', 'b'], ['b', 'a'])).toThrow(ProsecutorLensMismatchError);
  });

  it('refuses a live prosecutor answering under a lens nobody configured', async () => {
    // The case the loop cannot catch: an exchange exists, it is just under the
    // wrong lens.
    await expect(
      runProsecutors({
        reading: reading(),
        renderedCondition: 'x',
        conditionPaths: ['root'],
        closure: fixtureClosure(),
        config: { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 2 },
        prompt: prompts.prosecutor,
        runner: stubRunner(() =>
          JSON.stringify(stubProsecutorOutput('a_lens_nobody_configured', { readingElementId: 'RE-1' })),
        ),
      }),
    ).rejects.toBeInstanceOf(ProsecutorLensMismatchError);
  });
});

// ---------------------------------------------------------------------------
// A prosecutor halts on a gap, exactly as the reader does
// ---------------------------------------------------------------------------

describe('a prosecutor is bound by the same closure and halts on a gap', () => {
  const requirement = fixtureRequirement();

  function pipelineInput(runner: Parameters<typeof runVerificationPipeline>[0]['runner']) {
    return {
      packId: 'testpack',
      requirementId: requirement.id,
      requirement,
      renderContext: ctxRender,
      closure: fixtureClosure(),
      corpus,
      prompts,
      config: { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 3 },
      runner,
    };
  }

  function haltingRunner(docId: string) {
    return stubRunner((request) =>
      request.role === 'reader'
        ? JSON.stringify(stubReaderOutput())
        : request.role === 'prosecutor'
          ? request.index === 0
            ? JSON.stringify({
                lens: lensFromRequest(request),
                coverage: [],
                challenges: [],
                gaps: [{ kind: 'corpus_gap', docId, detail: 'the prosecutor needed this' }],
              })
            : JSON.stringify(stubProsecutorOutput(lensFromRequest(request)))
          : JSON.stringify({ adjudications: [], gaps: [] }),
    );
  }

  it('classifies the gap itself rather than believing the role’s label', async () => {
    // DOC-D is in the corpus and outside the closure, so the honest class is
    // `closure_gap` — and the role said `corpus_gap`. The machinery decides.
    const outcome = await runVerificationPipeline(pipelineInput(haltingRunner('DOC-D')));
    expect(outcome.prosecution.gaps.map((gap) => gap.kind)).toEqual(['closure_gap']);
    expect(outcome.prosecution.gaps[0]?.docId).toBe('DOC-D');

    // And the other class is reachable through the same seam, so the answer
    // above is a classification and not a constant.
    const absent = await runVerificationPipeline(pipelineInput(haltingRunner(NOT_INGESTED)));
    expect(absent.prosecution.gaps.map((gap) => gap.kind)).toEqual(['corpus_gap']);
  });

  it('stops the run there: no later lens, no adjudicator, no coverage', async () => {
    const runner = haltingRunner('DOC-D');
    const outcome = await runVerificationPipeline(pipelineInput(runner));
    expect(outcome.halted).toBe(true);
    expect(outcome.prosecution.executions).toHaveLength(1);
    expect(outcome.prosecution.table.cells).toEqual([]);
    expect(outcome.prosecution.table.challenges).toEqual([]);
    expect(outcome.executions.adjudicator).toBeNull();
    expect(runner.requests.filter((request) => request.role === 'prosecutor')).toHaveLength(1);
    expect(runner.requests.filter((request) => request.role === 'adjudicator')).toHaveLength(0);
    // The gap reaches the tail, which is what makes a gap-bearing dossier
    // possible at all.
    expect(outcome.tail.gaps.map((gap) => gap.docId)).toEqual(['DOC-D']);
    // The transcript keeps what the prosecutor actually said, so a human can
    // see what it had managed before it stopped.
    expect(outcome.transcript.roles.some((role) => role.role === 'prosecutor')).toBe(true);
  });

  it('positive control: the same wiring runs all three and the adjudicator', async () => {
    // Without this, every count above is equally green against a pipeline that
    // never runs a prosecutor at all (failure mode #7).
    const runner = stubRunner((request) =>
      request.role === 'reader'
        ? JSON.stringify(stubReaderOutput())
        : request.role === 'prosecutor'
          ? JSON.stringify(stubProsecutorOutput(lensFromRequest(request)))
          : JSON.stringify({ adjudications: [], gaps: [] }),
    );
    const outcome = await runVerificationPipeline(pipelineInput(runner));
    expect(outcome.halted).toBe(false);
    expect(outcome.prosecution.executions).toHaveLength(3);
    expect(outcome.executions.adjudicator).not.toBeNull();
    expect(runner.requests.filter((request) => request.role === 'prosecutor')).toHaveLength(3);
    expect(outcome.tail.gaps).toEqual([]);
    expect(outcome.prosecution.table.cells.map((cell) => cell.direction)).toContain(
      'condition_to_reading',
    );
  });

  it('refuses a prosecutor claiming a gap over a document it was handed', async () => {
    const runner = stubRunner((request) =>
      request.role === 'reader'
        ? JSON.stringify(stubReaderOutput())
        : JSON.stringify({
            lens: lensFromRequest(request),
            coverage: [],
            challenges: [],
            gaps: [{ kind: 'closure_gap', docId: 'DOC-A', detail: 'pretending' }],
          }),
    );
    await expect(runVerificationPipeline(pipelineInput(runner))).rejects.toBeInstanceOf(
      RoleOutputError,
    );
  });
});

// ---------------------------------------------------------------------------
// Both gates are reached from the run, not merely callable
// ---------------------------------------------------------------------------

/**
 * A gate is not tested until its **removal from the production path** reddens
 * something.
 *
 * Every rule above calls `assertProsecutorCoverage` or
 * `assertBothDirectionsWalked` directly, which proves the function and says
 * nothing about the wiring. Deleting either call from `runProsecutors` left all
 * 1083 tests green — failure mode #6, a guarantee stated but unenforced, and the
 * third instance of this exact shape in this plan (Task 1's `sourceShapedGaps`,
 * Task 2's, and these two). The two cases below go through `runProsecutors` and
 * nothing else, so each one dies when its call site does.
 *
 * They are kept independent on purpose: the coverage-gate case emits a
 * well-formed *bidirectional* table so the other gate cannot be what refuses it,
 * and the bidirectionality case emits cells that satisfy every per-cell rule so
 * the coverage gate cannot be what refuses it.
 */
describe('the run reaches both gates', () => {
  function runWith(coverage: unknown, challenges: unknown = []) {
    return runProsecutors({
      reading: reading(['RE-1']),
      renderedCondition: 'the condition in English',
      conditionPaths: ['root'],
      closure: fixtureClosure(),
      config: { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 1 },
      prompt: prompts.prosecutor,
      runner: stubRunner((request) =>
        JSON.stringify({ lens: lensFromRequest(request), coverage, challenges, gaps: [] }),
      ),
    });
  }

  const bothDirections = [
    { direction: 'reading_to_condition', readingElementId: 'RE-1', verdict: 'UNMAPPED' },
    {
      direction: 'condition_to_reading',
      conditionPath: 'root',
      readingElementId: 'RE-1',
      verdict: 'MAPPED',
    },
  ];

  it('the coverage gate runs: adverse coverage naming no challenge fails the run', async () => {
    // The adverse→challenge link the brief calls the origin of
    // `assertResultConsistency`'s requirement, asserted where it originates —
    // in a run, not in a direct call.
    let error: unknown;
    try {
      await runWith(bothDirections);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(RoleOutputError);
    expect((error as RoleOutputError).problems.join(' ')).toContain('carries no challengeId');
    expect((error as RoleOutputError).message).toContain('prosecutor[0]');
  });

  it('positive control: the same run succeeds once the link is there', async () => {
    // Without this, the refusal above is equally green against a
    // `runProsecutors` that refuses everything (failure mode #7).
    const outcome = await runWith(
      [{ ...bothDirections[0], challengeId: 'C1' }, bothDirections[1]],
      [challenge('C1', DEFAULT_ROLE_CONFIG.lenses[0] ?? '')],
    );
    expect(outcome.halted).toBe(false);
    expect(outcome.table.cells).toHaveLength(2);
    expect(outcome.table.cells[0]?.challengeId).toBe('P0-C1');
  });

  it('the bidirectionality gate runs: a one-directional table fails the run', async () => {
    // Every cell here satisfies every per-cell rule, so the coverage gate is
    // not what refuses this — only the assembled-table guard can.
    await expect(
      runWith([
        {
          direction: 'reading_to_condition',
          readingElementId: 'RE-1',
          conditionPath: 'root',
          verdict: 'MAPPED',
        },
      ]),
    ).rejects.toBeInstanceOf(OneDirectionalCoverageError);
  });

  it('positive control: the same run succeeds once the second direction is walked', async () => {
    const outcome = await runWith([
      {
        direction: 'reading_to_condition',
        readingElementId: 'RE-1',
        conditionPath: 'root',
        verdict: 'MAPPED',
      },
      {
        direction: 'condition_to_reading',
        conditionPath: 'root',
        readingElementId: 'RE-1',
        verdict: 'MAPPED',
      },
    ]);
    expect(outcome.table.cells.map((cell) => cell.direction)).toEqual([
      'reading_to_condition',
      'condition_to_reading',
    ]);
  });
});

// ---------------------------------------------------------------------------
// "Adverse" has one definition
// ---------------------------------------------------------------------------

describe('the adverse vocabulary has a single authority', () => {
  it('the seam’s list is exactly result.ts’s set, in both directions', () => {
    // `result.ts` owns the record boundary and therefore owns the word. A fifth
    // coverage verdict added to the enum but not to `ADVERSE_COVERAGE` must not
    // leave this seam demanding a `challengeId` that
    // `assertResultConsistency` never checks for — nor the reverse.
    expect([...ADVERSE_COVERAGE_VERDICTS].sort()).toEqual([...ADVERSE_COVERAGE].sort());
    // and the set really is a subset of the live enum, so neither side is
    // carrying a verdict the schema cannot produce.
    for (const verdict of ADVERSE_COVERAGE) {
      expect(coverageVerdictSchema.options).toContain(verdict);
    }
    // Positive control: the list is not empty and does not contain MAPPED, so
    // the equality above is over real content.
    expect(ADVERSE_COVERAGE_VERDICTS.length).toBeGreaterThan(0);
    expect(ADVERSE_COVERAGE_VERDICTS).not.toContain('MAPPED');
  });
});

// ---------------------------------------------------------------------------
// The shared closure renderer was not forked
// ---------------------------------------------------------------------------

describe('the closure renderer stays shared', () => {
  it('the prosecutor’s message renders the closure through the shared function', () => {
    const closure = fixtureClosure();
    const rendered = renderProsecutorInput(
      prosecutorInputFor({
        reading: reading(),
        renderedCondition: 'x',
        conditionPaths: ['root'],
        lens: 'missing_criterion',
        closure,
      }),
    );
    expect(rendered).toContain(renderEntitledClosure(closure));
  });

  it('the reader sees byte-identical closure content, so nothing was forked', () => {
    // Task 2's forward note: a prosecutor-specific presentation change would
    // also change what the *blind reader* sees, which is the blindness boundary.
    // Asserted as an equality between the two rendered messages' closure
    // sections rather than as a promise in a comment.
    const closure = fixtureClosure();
    const readerMessage = renderReaderInput(
      readerInputFor({ packId: 'testpack', requirement: fixtureRequirement(), closure }),
    );
    const prosecutorMessage = renderProsecutorInput(
      prosecutorInputFor({
        reading: reading(),
        renderedCondition: 'x',
        conditionPaths: ['root'],
        lens: 'missing_criterion',
        closure,
      }),
    );
    const section = (text: string) => text.slice(text.indexOf('# Entitled closure'));
    expect(section(prosecutorMessage)).toBe(section(readerMessage));
    // Positive control: the sections are not empty, and they do carry document
    // text — so the equality is over real content.
    expect(section(readerMessage)).toContain('DOC-A');
    expect(section(readerMessage).length).toBeGreaterThan(100);
  });

  it('no second closure renderer exists in the prosecutor module', () => {
    const source = readFileSync('src/pipeline/prosecutors.ts', 'utf8');
    // Since B-PROMPT the whole message goes through the shared composer, which
    // renders the closure itself; the prosecutor module no longer even names
    // the closure renderer, so a fork would have to reintroduce the call.
    expect(source).toContain('composeRoleMessage(');
    expect(source).not.toContain('renderEntitledClosure(');
    // The construct a fork would use: iterating the closure's documents here.
    const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(strip(source)).not.toContain('.documents()');
    // Positive control over the *codebase*, not over a string literal: the one
    // place that legitimately iterates the closure is the shared renderer in
    // `entitlement.ts`, and the pattern finds it there. Asserting the matcher
    // against `'closure.documents()'` — as this line first did — proved only
    // that `toContain` works.
    expect(strip(readFileSync('src/pipeline/entitlement.ts', 'utf8'))).toContain('.documents()');
  });
});
