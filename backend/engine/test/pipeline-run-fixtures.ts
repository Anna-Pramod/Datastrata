/**
 * One real `runVerificationPipeline` run over replayed role responses — the
 * shared subject of every test that needs an authoritative result.
 *
 * **Nothing here hand-builds a `VerificationResult`.** What these fixtures
 * control is the *input* side: the requirement, the closure, the configuration
 * and the three role responses. The reader gate, the prosecutor gate, the
 * coverage table with its qualified challenge ids, `assembleChallenges`,
 * `projectOpenQuestions` and the whole-run gap canonicalisation are all the
 * production ones. That distinction is the point: Task 4 passed 44 of 46 tests
 * against a schema its adjudicator's output could not satisfy, because only two
 * tests ever built a whole `ResultChallenge`, and a test approximation of a
 * shape proves nothing about the shape.
 *
 * Extracted from `pipeline-assemble.test.ts` by Task 5c so that the assembly
 * proof and the writer proof run over **one** definition of the run rather than
 * two that are free to drift. A second fixture set would let the writer's
 * "Complete" and the assembler's "Complete" mean different things while both
 * files stayed green.
 *
 * The two challenge propositions are deliberately distinguishable:
 *
 *     E-P   the prosecutor's basis    DOC-A, the operative-test sentence
 *     E-A   the adjudicator's basis   DOC-C, a different sentence
 *
 * Both are `EvidenceItem[]`, so crossing them compiles and every arity, presence
 * and `.min(1)` check stays green. Only an assertion that names the document and
 * the text can tell them apart.
 */

import { expect } from 'vitest';

import { sha256Hex } from '../src/corpus/hash';
import { DEFAULT_ROLE_CONFIG, type RoleConfig } from '../src/pipeline/config';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import { loadPromptSet } from '../src/pipeline/prompts';
import { conditionPathsFor } from '../src/pipeline/prosecutors';
import type {
  AdjudicatorOutput,
  ProsecutorOutput,
  ReaderOutput,
} from '../src/pipeline/role-outputs';
import type { Condition, Requirement } from '../src/types';
import { requirementSha256 } from '../src/verification/canonical';
import { registerVersion } from '../src/verification/registry';
import type { GapIdentityRegisters } from '../src/verification/result';
import {
  docText,
  fixtureCorpus,
  fixtureAuthorisedCorpus,
  fixtureIndex,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  NOT_INGESTED,
  stubRunner,
  fixtureRegister,
} from './pipeline-fixtures';

/**
 * The shared fixture corpus, authorised.
 *
 * `forSources` requires an `AuthorisedCorpus`, so the shared fixture is one:
 * every suite reading this export gets a corpus that passed the same validator
 * production uses, rather than a structural stand-in.
 */
export const corpus = fixtureAuthorisedCorpus();
export const prompts = loadPromptSet();
export const renderContext = fixtureRenderContext();

/** Two atoms under one `all`, so the address vocabulary is richer than `root`. */
export const COMPOUND: Condition = {
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
export function subject(overrides: Partial<Requirement> = {}): Requirement {
  return {
    ...fixtureRequirement({ condition: COMPOUND }),
    derivedStatus: 'draft',
    statusReasons: [],
    ...overrides,
  } as Requirement;
}

export const REQUIREMENT = subject();

export function closureForRun(): EntitledClosure {
  return EntitledClosure.forSources(corpus, fixtureRegister(), sourceIdsOf(REQUIREMENT));
}

export const CLOSURE = closureForRun();

/** The registry entry the declared version is checked against. */
export const REGISTRY = registerVersion({}, REQUIREMENT.id, REQUIREMENT.version, requirementSha256(REQUIREMENT));

/**
 * The two registers 1.2.0's gap-identity rules are validated by.
 *
 * Files in production, handed in here — `src/verification/` opens none. Both
 * are populated, because a register the rule cannot look anything up in makes
 * every membership check vacuous.
 */
export const REGISTERS: GapIdentityRegisters = {
  docIds: fixtureIndex().documents.map((document) => document.docId),
  sourceIds: ['SRC-100', 'SRC-900', 'SRC-901', 'SRC-999'],
};

// ---------------------------------------------------------------------------
// E-P and E-A
// ---------------------------------------------------------------------------

export const EP_DOC = 'DOC-A';
export const EP_TEXT = 'The operative test is stated here.';
export const EA_DOC = 'DOC-C';
export const EA_TEXT = 'Synthetic legal text for DOC-C.';

/** E-P — the prosecutor's basis. */
export function evidenceP() {
  return {
    kind: 'quote' as const,
    docId: EP_DOC,
    sha256Normalized: sha256Hex(docText(EP_DOC)),
    text: EP_TEXT,
  };
}

/** E-A — the adjudicator's basis. A different document and different words. */
export function evidenceA() {
  return {
    kind: 'quote' as const,
    docId: EA_DOC,
    sha256Normalized: sha256Hex(docText(EA_DOC)),
    text: EA_TEXT,
  };
}

/** The reader's own evidence, over a third document again. */
export function evidenceR(docId = 'DOC-B') {
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

export const PATHS = conditionPathsFor(REQUIREMENT, renderContext);

/** Guards the fixture: the addresses below must be this condition's own. */
export const MAPPED_PATH = 'all[0]';
export const UNSUPPORTED_PATH = 'all[1]';

export function readingOutput(overrides: Partial<ReaderOutput> = {}): ReaderOutput {
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
export function prosecution(lens: string): ProsecutorOutput {
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

export const MISMATCH_RESOLUTION =
  'DOC-C states the upper bound in terms the encoding does not carry; the challenge is upheld against the encoding.';

/**
 * One challenge settled and one left open, in the same response.
 *
 * The settled one is the positive control for the projection: an adjudicator
 * answering `OPEN_QUESTION` to everything would satisfy "the open one is
 * projected" and prove nothing about which verdicts the projection selects.
 */
export function adjudication(overrides: Partial<AdjudicatorOutput> = {}): AdjudicatorOutput {
  return {
    adjudications: [
      { challengeId: 'P0-C1', verdict: 'MISMATCH', resolution: MISMATCH_RESOLUTION, evidence: [evidenceA()] },
      { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [evidenceA()] },
    ],
    gaps: [],
    ...overrides,
  };
}

export const SINGLE_PROSECUTOR: RoleConfig = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 1 };

export interface RunOverrides {
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
export function runPipeline(overrides: RunOverrides = {}) {
  const requirement = overrides.requirement ?? REQUIREMENT;
  return runVerificationPipeline({
    packId: 'testpack',
    requirementId: requirement.id,
    requirement,
    renderContext,
    closure: EntitledClosure.forSources(corpus, fixtureRegister(), sourceIdsOf(requirement)),
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

// ---------------------------------------------------------------------------
// The three gap origins
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
export const READER_GAP_MARK = 'READER-ORIGIN';
export const PROSECUTOR_GAP_MARK = 'PROSECUTOR-ORIGIN';
export const ADJUDICATOR_GAP_MARK = 'ADJUDICATOR-ORIGIN';

/** Absent from the fixture corpus entirely: the machinery classifies `corpus_gap`. */
export const READER_GAP = {
  kind: 'corpus_gap' as const,
  docId: NOT_INGESTED,
  detail: `${READER_GAP_MARK}: the reader needed the consolidating instrument`,
};

/** In the corpus, outside the closure at reference depth 2: `closure_gap`. */
export const PROSECUTOR_GAP = {
  kind: 'closure_gap' as const,
  docId: 'DOC-D',
  detail: `${PROSECUTOR_GAP_MARK}: the lens needed the referenced implementing act`,
};

/** In the corpus, connected to nothing, so outside the closure: `closure_gap`. */
export const ADJUDICATOR_GAP = {
  kind: 'closure_gap' as const,
  docId: 'DOC-Z',
  detail: `${ADJUDICATOR_GAP_MARK}: the adjudicator needed the unconnected annex`,
};

/** A prosecutor that halts, and produced no table of its own to be cleared. */
export function prosecutionHalting(): ProsecutorOutput {
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
export function expectOneGap(
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
