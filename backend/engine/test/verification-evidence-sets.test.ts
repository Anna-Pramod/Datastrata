/**
 * The evidence surface, enumerated once — and policed by the schema.
 *
 * Schema 1.2.0 added `challenges[].adjudicationEvidence`. Three authoritative
 * consumers each carried their own hand-written list of where evidence lives,
 * and all three went on working while two of them ignored the new array. The
 * sign gate's miss was the dangerous one: an adjudication citing text that is
 * nowhere in the corpus would have signed clean, because the corpus re-check
 * simply never looked at it.
 *
 * The repair is one runtime enumeration, `evidenceSetsOf`. The repair is not
 * *proved* by a test that spells the same three field names a third time — that
 * moves the duplication rather than removing it, and it goes stale in exactly
 * the way the consumers did. So the expectation here is **derived**:
 *
 *     verificationResultSchema
 *       -> accountableNodes  (the accounting traversal, unchanged and reused)
 *       -> arrays whose element node IS evidenceItemSchema  (node identity)
 *       -> the authoritative evidence paths
 *
 * and compared against what `evidenceSetsOf` claims. Nothing on the derived side
 * comes from `evidence-sets.ts`; nothing on the enumerated side comes from the
 * schema. A fourth evidence-bearing array added to the record therefore reds
 * this file, **naming the path nobody enumerated**, before any consumer can go
 * quiet about it.
 *
 * **Node identity rather than a name convention.** `evidenceItemSchema` is one
 * exported object, and `z.array(x).min(1)` keeps `_def.type === x`, so the
 * filter asks the only question that cannot be fooled by spelling: is the thing
 * in this array *the* evidence item schema? A filter matching paths ending in
 * `evidence` would be a second hand-maintained rule about names — the artefact
 * this whole mechanism exists to abolish.
 *
 * **The record under test is assembled, never hand-built.** Everything below
 * runs over a `VerificationResult` that `runVerificationPipeline` and
 * `assembleVerificationResult` produced from replayed role outputs, then
 * mutated. A test approximation of the contract shape proves nothing about the
 * contract shape: Task 4 passed 44 of 46 tests against a schema its own
 * adjudicator output could not satisfy.
 *
 * **E-P and E-A are distinguishable on purpose.** The prosecutor's evidence
 * quotes DOC-A and the adjudicator's quotes DOC-C, different documents with
 * different words, both legitimately inside the closure. Only an assertion that
 * names one of them can tell the two propositions apart, so each direction is
 * corrupted by its own test and a mutation that crosses them one way reds an
 * assertion that could not have fired for the other.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { evidenceItemSchema } from '../src/corpus/evidence';
import { sha256Hex } from '../src/corpus/hash';
import { assembleVerificationResult } from '../src/pipeline/assemble';
import { DEFAULT_ROLE_CONFIG, type RoleConfig } from '../src/pipeline/config';
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
import { accountableNodes, accountablePaths } from '../src/verification/accounting';
import { requirementSha256 } from '../src/verification/canonical';
import { enumeratedEvidencePaths, evidenceSetsOf } from '../src/verification/evidence-sets';
import { registerVersion } from '../src/verification/registry';
import {
  parseVerificationResult,
  ResultConsistencyError,
  verificationResultSchema,
  type GapIdentityRegisters,
  type VerificationResult,
} from '../src/verification/result';
import {
  docText,
  fixtureAuthorisedCorpus,
  fixtureIndex,
  fixtureRenderContext,
  fixtureRequirement,
  lensFromRequest,
  stubRunner,
  fixtureRegister,
} from './pipeline-fixtures';
import { fixtureSourceUniverse } from './pipeline-fixtures';

// ---------------------------------------------------------------------------
// The oracle: the evidence surface, read off the schema
// ---------------------------------------------------------------------------

/**
 * Every array in the record whose elements are evidence items, by node
 * identity, addressed as the array rather than as its container row.
 *
 * `accountableNodes` is the accounting walker — the one traversal — now
 * returning the node standing at each path as well as the path. Writing a
 * second recursion here would reproduce failure mode 1: a checker built from
 * the same model as the thing checked agrees with its systematic errors.
 */
function schemaEvidencePaths(): string[] {
  const found = accountableNodes(verificationResultSchema)
    .filter((entry) => {
      const def = entry.node._def as { typeName?: unknown; type?: unknown };
      return def.typeName === z.ZodFirstPartyTypeKind.ZodArray && def.type === evidenceItemSchema;
    })
    // The walker's container row is `…evidence[]`; the array itself is
    // `…evidence`. One trailing marker is stripped, never a nested one.
    .map((entry) => entry.path.replace(/\[\]$/, ''));
  return [...new Set(found)].sort();
}

// ---------------------------------------------------------------------------
// One real record, from the real pipeline over replayed role outputs
// ---------------------------------------------------------------------------

const corpus = fixtureAuthorisedCorpus();
const prompts = loadPromptSet();
const renderContext = fixtureRenderContext();

/** Two atoms under one `all`, so the prosecutor has two addresses to walk. */
const COMPOUND: Condition = {
  op: 'all',
  of: [
    { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450_000_000 },
    { op: 'cmp', fact: 'entity.turnover', cmp: 'lt', value: 900_000_000 },
  ],
};

const REQUIREMENT = {
  ...fixtureRequirement({ condition: COMPOUND }),
  sources: ['SRC-100'],
  derivedStatus: 'draft',
  statusReasons: [],
} as Requirement;

const REGISTRY = registerVersion(
  {},
  REQUIREMENT.id,
  REQUIREMENT.version,
  requirementSha256(REQUIREMENT),
);

const REGISTERS: GapIdentityRegisters = {
  docIds: fixtureIndex().documents.map((document) => document.docId),
  sourceIds: ['SRC-100', 'SRC-900', 'SRC-901', 'SRC-999'],
};

const EP_DOC = 'DOC-A';
const EP_TEXT = 'The operative test is stated here.';
const EA_DOC = 'DOC-C';
const EA_TEXT = 'Synthetic legal text for DOC-C.';

/** E-P — the prosecutor's basis. */
function evidenceP() {
  return { kind: 'quote' as const, docId: EP_DOC, sha256Normalized: sha256Hex(docText(EP_DOC)), text: EP_TEXT };
}

/** E-A — the adjudicator's basis. A different document and different words. */
function evidenceA() {
  return { kind: 'quote' as const, docId: EA_DOC, sha256Normalized: sha256Hex(docText(EA_DOC)), text: EA_TEXT };
}

/** The reader's own evidence, over a third document again. */
function evidenceR(docId: string) {
  return {
    kind: 'quote' as const,
    docId,
    sha256Normalized: sha256Hex(docText(docId)),
    text: `Synthetic legal text for ${docId}.`,
  };
}

const PATHS = conditionPathsFor(REQUIREMENT, renderContext);
const MAPPED_PATH = 'all[0]';
const UNSUPPORTED_PATH = 'all[1]';

const READING: ReaderOutput = {
  elements: [
    { id: 'RE-1', statement: 'The provision states a lower turnover bound.', evidence: [evidenceR('DOC-A')] },
    { id: 'RE-2', statement: 'The provision states an obligation the encoding does not carry.', evidence: [evidenceR('DOC-B')] },
  ],
  gaps: [],
};

function prosecution(lens: string): ProsecutorOutput {
  return {
    lens,
    coverage: [
      { direction: 'reading_to_condition', readingElementId: 'RE-1', conditionPath: MAPPED_PATH, verdict: 'MAPPED' },
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

const RESOLUTION = 'DOC-C states the upper bound in terms the encoding does not carry.';

const ADJUDICATION: AdjudicatorOutput = {
  adjudications: [
    { challengeId: 'P0-C1', verdict: 'MISMATCH', resolution: RESOLUTION, evidence: [evidenceA()] },
    { challengeId: 'P0-C2', verdict: 'OPEN_QUESTION', evidence: [evidenceA()] },
  ],
  gaps: [],
};

const SINGLE_PROSECUTOR: RoleConfig = { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 1 };

/** The whole gate, end to end, exactly as production would run it. */
async function assembled(): Promise<VerificationResult> {
  const run = await runVerificationPipeline({
    packId: 'testpack',
    requirementId: REQUIREMENT.id,
    requirement: REQUIREMENT,
    renderContext,
    closure: EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), REQUIREMENT.sources),
    corpus,
    prompts,
    config: SINGLE_PROSECUTOR,
    runner: stubRunner((request) => {
      switch (request.role) {
        case 'reader':
          return JSON.stringify(READING);
        case 'prosecutor':
          return JSON.stringify(prosecution(lensFromRequest(request)));
        case 'adjudicator':
          return JSON.stringify(ADJUDICATION);
      }
    }),
  });
  return assembleVerificationResult({
    run,
    requirement: REQUIREMENT,
    registry: REGISTRY,
    registers: REGISTERS,
  });
}

/**
 * The problems `parseVerificationResult` reports over a record, joined, or a
 * failure saying it reported none.
 *
 * The authoritative consumer, on the authoritative shape — not a direct call to
 * the enumerator. A record that parses clean is a test that proved nothing.
 *
 * Joined into one string rather than returned as a list, so that every
 * assertion below is a `toContain` over the report itself. `problems.some(...)`
 * reads more naturally and fails as `expected false to be true`, which names
 * neither the address that was wanted nor the addresses that were actually
 * collected — and this file exists precisely to prove that a failure names the
 * array at fault. A check whose own red says nothing is the standard's second
 * half unmet.
 */
function problemsFrom(record: VerificationResult): string {
  try {
    parseVerificationResult(record, REGISTERS);
  } catch (thrown) {
    if (thrown instanceof ResultConsistencyError) return thrown.problems.join('\n');
    throw thrown;
  }
  throw new Error('expected the record to be refused, and it parsed clean');
}

// ---------------------------------------------------------------------------
// The completeness guard
// ---------------------------------------------------------------------------

describe('the evidence surface, derived from the record schema', () => {
  it('finds evidence arrays by node identity rather than by what they are called', () => {
    // The premise of the guard below. Without it the comparison could be two
    // empty lists agreeing — failure mode 7, a claim green because the path
    // never ran.
    const derived = schemaEvidencePaths();
    expect(derived.length).toBeGreaterThan(1);
    expect(derived).toContain('challenges[].adjudicationEvidence');

    // The negative control in the same walk: `corpus[]` is an array the walker
    // certainly emits, and it is not an evidence array. A filter that matched
    // every array, or matched on the path spelling, would fail one of these.
    expect(accountablePaths(verificationResultSchema)).toContain('corpus[]');
    expect(derived).not.toContain('corpus');
    expect(derived).not.toContain('challenges[].hops');
  });

  it('enumerates exactly the evidence-bearing arrays the schema carries', () => {
    const derived = schemaEvidencePaths();
    const enumerated = enumeratedEvidencePaths();

    // Both directions, reported separately and by name. A bare length
    // comparison would say "expected 4, received 3" and leave whoever added the
    // field to go looking for which one it was.
    const unenumerated = derived.filter((path) => !enumerated.includes(path));
    const invented = enumerated.filter((path) => !derived.includes(path));

    expect(
      unenumerated,
      `the record schema carries evidence at [${unenumerated.join(
        ', ',
      )}], which evidenceSetsOf does not enumerate; every authoritative consumer — the record's consistency pass, the sign gate's corpus re-check, the review sheet — would silently ignore that array`,
    ).toEqual([]);
    expect(
      invented,
      `evidenceSetsOf enumerates [${invented.join(
        ', ',
      )}], which no array in the record schema carries; a stale entry is a lie about the shape that hides a removal`,
    ).toEqual([]);
  });

  it('reaches every enumerated path on a record the pipeline actually produced', async () => {
    // The claim above is about the descriptor table. This is about its
    // accessors: a descriptor naming a path whose accessor returns nothing
    // would satisfy the guard and enumerate no evidence at all.
    const record = await assembled();
    const reached = [...new Set(evidenceSetsOf(record).map((set) => set.path))].sort();
    expect(reached).toEqual(enumeratedEvidencePaths());
    expect(evidenceSetsOf(record).every((set) => set.items.length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Attribution — two propositions, not one anonymous bag
// ---------------------------------------------------------------------------

describe('a shared enumeration keeps the two challenge propositions apart', () => {
  it('gives each challenge two sets, adjacent, and never crosses their contents', async () => {
    const record = await assembled();
    const challenge = record.challenges[0];
    expect(challenge).toBeDefined();
    if (challenge === undefined) return;

    const sets = evidenceSetsOf(record).filter((set) => set.ownerId === challenge.id);
    expect(sets).toHaveLength(2);

    const [raised, decided] = sets;
    expect(raised?.path).toBe('challenges[].evidence');
    expect(raised?.label).toBe(`challenge ${challenge.id}`);
    expect(raised?.heading).toBe(`challenge ${challenge.id} — why it was raised`);
    expect(raised?.items).toEqual(challenge.evidence);

    expect(decided?.path).toBe('challenges[].adjudicationEvidence');
    expect(decided?.label).toBe(`challenge ${challenge.id} adjudication`);
    expect(decided?.heading).toBe(
      `challenge ${challenge.id} — why it was decided (${challenge.verdict})`,
    );
    expect(decided?.items).toEqual(challenge.adjudicationEvidence);

    // The premise that makes every assertion above discriminating: the two
    // arrays hold different documents and different words, so a crossed
    // accessor could not pass by accident.
    expect(raised?.items).not.toEqual(decided?.items);
    expect(challenge.evidence[0]).toMatchObject({ docId: EP_DOC, text: EP_TEXT });
    expect(challenge.adjudicationEvidence[0]).toMatchObject({ docId: EA_DOC, text: EA_TEXT });
  });

  it('names the PROSECUTOR array when only E-P is corrupted', async () => {
    // Through `parseVerificationResult` — the authoritative consumer — over the
    // assembled record, with the adjudicator's evidence left impeccable. Only
    // the array actually at fault may be named, or a signer repairs the wrong
    // producer's work.
    const record = await assembled();
    const broken = structuredClone(record);
    const item = broken.challenges[0]?.evidence[0];
    expect(item?.kind).toBe('quote');
    if (item?.kind !== 'quote') return;
    item.sha256Normalized = sha256Hex('a text this record does not pin');

    const problems = problemsFrom(broken);
    const id = record.challenges[0]?.id;
    expect(problems).toContain(`challenges[0] (${id}).evidence[0]`);
    expect(problems).not.toContain('adjudicationEvidence');
  });

  it('names the ADJUDICATION array when only E-A is corrupted', async () => {
    // The mirror. The prosecutor's evidence is impeccable here, so nothing but
    // the second array can be producing the problem — which is exactly the
    // defect that signed clean before the array was enumerated at all.
    const record = await assembled();
    const broken = structuredClone(record);
    const item = broken.challenges[0]?.adjudicationEvidence[0];
    expect(item?.kind).toBe('quote');
    if (item?.kind !== 'quote') return;
    item.sha256Normalized = sha256Hex('a text this record does not pin');

    const problems = problemsFrom(broken);
    const id = record.challenges[0]?.id;
    expect(problems).toContain(`challenges[0] (${id}).adjudicationEvidence[0]`);
    expect(problems).not.toContain(`challenges[0] (${id}).evidence[`);
  });

  it('names the reading element when only its evidence is corrupted', async () => {
    // The third proposition, and the positive control for the two above: a
    // consistency pass that named every set on every failure would satisfy each
    // "names X" assertion and none of the "does not name Y" ones.
    const record = await assembled();
    const broken = structuredClone(record);
    const item = broken.reading.elements[0]?.evidence[0];
    expect(item?.kind).toBe('quote');
    if (item?.kind !== 'quote') return;
    item.sha256Normalized = sha256Hex('a text this record does not pin');

    const problems = problemsFrom(broken);
    expect(problems).toContain('reading.elements[0] (RE-1).evidence[0]');
    expect(problems).not.toContain('challenges[');
  });
});
