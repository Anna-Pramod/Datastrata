/**
 * The quote-hash contract, enforced before spend.
 *
 * Why this file exists: the second genuine S-002 capture (2026-10-18, r2) ran
 * nine role launches to completion and was refused at assembly because every
 * one of its 120 quotes carried `sha256Normalized` as the empty string. Three
 * things let that through until the last moment: the quote schema accepted any
 * string, so the JSON schema the CLI enforced accepted `""`; no prompt said a
 * quote must carry its document's hash; and the only pin check lived in
 * `assertResultConsistency`, which runs after the last launch. r1's reader,
 * under byte-identical prompt bytes, had filled every hash correctly — two
 * behaviours, one contract that let both through.
 *
 * What is held here, each with its positive control (TEST-EVIDENCE-STANDARD
 * failure modes #5 and #7): the schema refuses a hash that is not 64 lowercase
 * hex at every quote position; the provider schema derived from it carries the
 * same constraint; each role's seam refuses a well-formed hash that is not the
 * closure's pin for its document, and a document outside the closure, naming
 * the role, the path and the mismatch; a bad output stops the run before the
 * next role launches; the v3 prompts tell every role to copy the fence hash,
 * and the v2 set is kept byte for byte under its own version.
 *
 * **Synthetic fixtures throughout.** A stub runner returns outputs written
 * here; nothing shows what a model will do with the v3 prompts. Only a live
 * run can, and none has.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { evidenceItemSchema, type EvidenceItem, type QuoteEvidence } from '../src/corpus/evidence';
import { sha256Hex } from '../src/corpus/hash';
import { roleOutputJsonSchema, toProviderJsonSchema, UnsupportedSchemaFeatureError } from '../src/pipeline/anthropic-messages';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { pipelineVersionFor, runVerificationPipeline } from '../src/pipeline/orchestrate';
import {
  CURRENT_PROMPT_SET_VERSION,
  HISTORICAL_PROMPT_SET_VERSIONS,
  historicalPromptPath,
  loadHistoricalPromptSet,
  loadPromptSet,
  promptHashes,
  UnknownPromptSetVersionError,
  type HistoricalPromptSetVersion,
} from '../src/pipeline/prompts';
import { qualifiedChallengeId } from '../src/pipeline/prosecutors';
import {
  assertAdjudicatorQuotesPinned,
  assertProsecutorQuotesPinned,
  assertReaderQuotesPinned,
  quotePinProblems,
} from '../src/pipeline/quote-pins';
import { parseRoleOutput, type AdjudicatorOutput, type ProsecutorOutput, type ReaderOutput } from '../src/pipeline/role-outputs';
import { RoleOutputError } from '../src/pipeline/roles';
import {
  docText,
  fixtureAuthorisedCorpus,
  fixtureRegister,
  fixtureRenderContext,
  fixtureRequirement,
  fixtureSourceUniverse,
  lensFromRequest,
  NOT_INGESTED,
  stubProsecutorOutput,
  stubReaderOutput,
  stubRunner,
} from './pipeline-fixtures';

const engineRoot = join(__dirname, '..');

// ---------------------------------------------------------------------------
// The fixture world: SRC-100's closure is {DOC-A, DOC-B, DOC-C}; DOC-Z is in
// the corpus and outside it; NOT_INGESTED is in neither.
// ---------------------------------------------------------------------------

const corpus = fixtureAuthorisedCorpus();
function fixtureClosure(): EntitledClosure {
  return EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']);
}

/** The pin the closure's fence line carries for a fixture document. */
const PIN = (docId: string): string => sha256Hex(docText(docId));

/** A well-formed SHA-256 that is no fixture document's pin. */
const WRONG = '5c'.repeat(32);

const TEXT = 'The operative test is stated here.';

function quote(docId: string, sha256Normalized: string = PIN(docId), text: string = TEXT): QuoteEvidence {
  return { kind: 'quote', docId, sha256Normalized, text };
}

function readerWith(evidence: EvidenceItem[]): ReaderOutput {
  return { elements: [{ id: 'RE-STUB', statement: 'FIXTURE: a placeholder proposition.', evidence }], gaps: [] };
}

function prosecutorWith(lens: string, evidence: EvidenceItem[]): ProsecutorOutput {
  return {
    ...stubProsecutorOutput(lens),
    challenges: [{ id: 'C1-fixture', lens, statement: 'FIXTURE: a placeholder challenge.', evidence }],
  };
}

/** The challenge `prosecutorWith` raises as prosecutor 0, under the id the adjudicator is shown. */
const RAISED = qualifiedChallengeId(0, 'C1-fixture');

function adjudicatorWith(evidence: EvidenceItem[], challengeId: string = RAISED): AdjudicatorOutput {
  return {
    adjudications: [{ challengeId, verdict: 'CONFIRMED', resolution: 'FIXTURE: confirmed.', evidence }],
    gaps: [],
  };
}

/** One quote at every position a quote can occupy, all carrying `hash` for `docId`. */
function everyPosition(docId: string, hash: string): EvidenceItem[] {
  return [
    quote(docId, hash),
    { kind: 'amendment_chain', hops: [{ edgeId: 'E-1', quote: quote(docId, hash) }] },
    { kind: 'cross_reference', edgeId: 'E-2', from: quote(docId, hash), to: quote(docId, hash) },
  ];
}

async function rejection(promise: Promise<unknown>): Promise<RoleOutputError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RoleOutputError);
    return error as RoleOutputError;
  }
  throw new Error('expected the promise to reject with a RoleOutputError, and it resolved');
}

function caught(fn: () => unknown): RoleOutputError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(RoleOutputError);
    return error as RoleOutputError;
  }
  throw new Error('expected a RoleOutputError, and nothing was thrown');
}

// ---------------------------------------------------------------------------
// 1. The schema: exactly 64 lowercase hex, at every quote position
// ---------------------------------------------------------------------------

describe('the quote schema requires sha256Normalized to be exactly 64 lowercase hexadecimal characters', () => {
  const MALFORMED: ReadonlyArray<[string, string]> = [
    ['the empty string (the r2 shape)', ''],
    ['63 characters', '5c'.repeat(31) + '5'],
    ['65 characters', '5c'.repeat(32) + 'c'],
    ['a non-hex character', 'g' + '5c'.repeat(31) + '5'],
    ['uppercase hex', '5C'.repeat(32)],
  ];

  it.each(MALFORMED)('the reader seam refuses %s at the top level, inside an amendment-chain hop, and at both ends of a cross-reference, naming each path', (_what, hash) => {
    const error = caught(() => parseRoleOutput('reader', 0, JSON.parse(JSON.stringify(readerWith(everyPosition('DOC-A', hash))))));
    expect(error.role).toBe('reader');
    const problems = error.problems.join('\n');
    for (const path of [
      'elements.0.evidence.0.sha256Normalized',
      'elements.0.evidence.1.hops.0.quote.sha256Normalized',
      'elements.0.evidence.2.from.sha256Normalized',
      'elements.0.evidence.2.to.sha256Normalized',
    ]) {
      expect(problems, path).toContain(path);
    }
    expect(problems).toContain('64 lowercase hexadecimal');
  });

  it.each(MALFORMED)('the prosecutor and adjudicator seams refuse %s the same way, on their own paths', (_what, hash) => {
    const prosecutor = caught(() => parseRoleOutput('prosecutor', 3, JSON.parse(JSON.stringify(prosecutorWith('stub_lens', [quote('DOC-A', hash)])))));
    expect(prosecutor.role).toBe('prosecutor');
    expect(prosecutor.index).toBe(3);
    expect(prosecutor.problems.join('\n')).toContain('challenges.0.evidence.0.sha256Normalized');
    const adjudicator = caught(() => parseRoleOutput('adjudicator', 0, JSON.parse(JSON.stringify(adjudicatorWith([quote('DOC-A', hash)])))));
    expect(adjudicator.role).toBe('adjudicator');
    expect(adjudicator.problems.join('\n')).toContain('adjudications.0.evidence.0.sha256Normalized');
  });

  it('positive control: 64 lowercase hex is accepted at every position, whether or not it is the pin — the schema says well-formed, the seam says true', () => {
    expect(() => parseRoleOutput('reader', 0, JSON.parse(JSON.stringify(readerWith(everyPosition('DOC-A', PIN('DOC-A'))))))).not.toThrow();
    expect(() => parseRoleOutput('reader', 0, JSON.parse(JSON.stringify(readerWith(everyPosition('DOC-A', WRONG)))))).not.toThrow();
  });

  it('is the one evidence schema: the record contract refuses the same values, so a result cannot carry what a role may not return', () => {
    expect(evidenceItemSchema.safeParse(quote('DOC-A', '')).success).toBe(false);
    expect(evidenceItemSchema.safeParse(quote('DOC-A', '5C'.repeat(32))).success).toBe(false);
    expect(evidenceItemSchema.safeParse(quote('DOC-A', PIN('DOC-A'))).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The provider schema derived from it carries the constraint
// ---------------------------------------------------------------------------

describe('the structured-output schema handed to the provider carries the hash constraint', () => {
  const HASH_SCHEMA = { type: 'string', pattern: '^[0-9a-f]{64}$' };

  type Props = { properties: Record<string, unknown> };
  /** The evidence item variants of a role schema, at the path `evidence` sits under for that role. */
  function evidenceVariants(role: 'reader' | 'prosecutor' | 'adjudicator'): Props[] {
    const schema = roleOutputJsonSchema(role) as { properties: Record<string, { items: Props }> };
    const container = role === 'reader' ? 'elements' : role === 'prosecutor' ? 'challenges' : 'adjudications';
    const evidence = schema.properties[container]!.items.properties['evidence'] as { items: { anyOf: Props[] } };
    return evidence.items.anyOf;
  }

  it.each(['reader', 'prosecutor', 'adjudicator'] as const)('%s: the quote, each hop quote and both cross-reference ends declare the 64-hex pattern; `text` and `docId` do not', (role) => {
    const [plain, chain, cross] = evidenceVariants(role) as [Props, Props & { properties: { hops: { items: Props } } }, Props];
    expect(plain.properties['sha256Normalized']).toEqual(HASH_SCHEMA);
    expect(chain.properties.hops.items.properties['quote']).toMatchObject({ properties: { sha256Normalized: HASH_SCHEMA } });
    expect(cross.properties['from']).toMatchObject({ properties: { sha256Normalized: HASH_SCHEMA } });
    expect(cross.properties['to']).toMatchObject({ properties: { sha256Normalized: HASH_SCHEMA } });
    // Positive control for the pattern's presence: the other strings carry none.
    expect(plain.properties['text']).toEqual({ type: 'string' });
    expect(plain.properties['docId']).toEqual({ type: 'string' });
  });

  it('the converter emits a regex check as `pattern`, refuses one with flags, and still refuses string lengths', () => {
    expect(toProviderJsonSchema(z.string().regex(/^[0-9a-f]{64}$/))).toEqual(HASH_SCHEMA);
    expect(() => toProviderJsonSchema(z.string().regex(/^abc$/i))).toThrow(UnsupportedSchemaFeatureError);
    expect(() => toProviderJsonSchema(z.string().regex(/^abc$/i))).toThrow(/flags/);
    expect(() => toProviderJsonSchema(z.string().min(1))).toThrow(/minLength/);
  });
});

// ---------------------------------------------------------------------------
// 3. The seam: entitlement and the exact pin, per role, directly callable
// ---------------------------------------------------------------------------

describe('each role seam refuses a quote whose docId is outside the closure or whose hash is not that document\'s pin', () => {
  const closure = fixtureClosure();

  it('the fixture closure is {DOC-A, DOC-B, DOC-C}, DOC-Z is held but outside, and the pins differ — or nothing below can tell the cases apart', () => {
    expect(closure.docIds).toEqual(['DOC-A', 'DOC-B', 'DOC-C']);
    expect(closure.entitled('DOC-Z')).toBe(false);
    expect(closure.corpusHolds('DOC-Z')).toBe(true);
    expect(closure.corpusHolds(NOT_INGESTED)).toBe(false);
    expect(new Set([PIN('DOC-A'), PIN('DOC-B'), PIN('DOC-C'), PIN('DOC-Z'), WRONG]).size).toBe(5);
  });

  it('reader: a well-formed hash that is not the pin is refused, naming the element, the path, the model\'s hash and the closure\'s', () => {
    const output = readerWith([quote('DOC-A', WRONG)]);
    const error = caught(() => assertReaderQuotesPinned(output, closure, 0));
    expect(error.role).toBe('reader');
    expect(error.index).toBe(0);
    expect(error.problems).toHaveLength(1);
    expect(error.problems[0]).toContain('elements[0] (RE-STUB).evidence[0]');
    expect(error.problems[0]).toContain('DOC-A');
    expect(error.problems[0]).toContain(WRONG.slice(0, 12));
    expect(error.problems[0]).toContain(PIN('DOC-A').slice(0, 12));
    // Never silently filled or overwritten: the output still carries what the model returned.
    expect((output.elements[0]!.evidence[0] as { sha256Normalized: string }).sha256Normalized).toBe(WRONG);
  });

  it('reader: another entitled document\'s real pin on the wrong docId is a mismatch, not a correction', () => {
    const error = caught(() => assertReaderQuotesPinned(readerWith([quote('DOC-A', PIN('DOC-B'))]), closure, 0));
    expect(error.problems).toHaveLength(1);
    expect(error.problems[0]).toContain('DOC-A');
    expect(error.problems[0]).toContain(PIN('DOC-B').slice(0, 12));
    expect(error.problems[0]).toContain(PIN('DOC-A').slice(0, 12));
  });

  it('reader: a docId outside the closure is refused whether the corpus holds it (DOC-Z, at its own real hash) or not', () => {
    const error = caught(() =>
      assertReaderQuotesPinned(readerWith([quote('DOC-Z', PIN('DOC-Z')), quote(NOT_INGESTED, WRONG)]), closure, 0),
    );
    expect(error.problems).toHaveLength(2);
    expect(error.problems[0]).toContain('elements[0] (RE-STUB).evidence[0]');
    expect(error.problems[0]).toContain('DOC-Z');
    expect(error.problems[0]).toContain('entitled closure');
    expect(error.problems[1]).toContain('elements[0] (RE-STUB).evidence[1]');
    expect(error.problems[1]).toContain(NOT_INGESTED);
  });

  it('reader: nested quotes are checked under their own paths — a hop inside an amendment chain and the far end of a cross-reference', () => {
    const error = caught(() =>
      assertReaderQuotesPinned(
        readerWith([
          quote('DOC-A'),
          { kind: 'amendment_chain', hops: [{ edgeId: 'E-1', quote: quote('DOC-A') }, { edgeId: 'E-1', quote: quote('DOC-B', WRONG) }] },
          { kind: 'cross_reference', edgeId: 'E-2', from: quote('DOC-A'), to: quote('DOC-C', WRONG) },
        ]),
        closure,
        0,
      ),
    );
    expect(error.problems).toHaveLength(2);
    expect(error.problems[0]).toContain('elements[0] (RE-STUB).evidence[1].hops[1].quote');
    expect(error.problems[0]).toContain('DOC-B');
    expect(error.problems[1]).toContain('elements[0] (RE-STUB).evidence[2].to');
    expect(error.problems[1]).toContain('DOC-C');
  });

  it('prosecutor: refused under challenges[i] (id).evidence[j], with the prosecutor\'s own index', () => {
    const error = caught(() => assertProsecutorQuotesPinned(prosecutorWith('stub_lens', [quote('DOC-A'), quote('DOC-B', WRONG)]), closure, 4));
    expect(error.role).toBe('prosecutor');
    expect(error.index).toBe(4);
    expect(error.problems).toHaveLength(1);
    expect(error.problems[0]).toContain('challenges[0] (C1-fixture).evidence[1]');
    expect(error.problems[0]).toContain('DOC-B');
  });

  it('adjudicator: refused under adjudications[i] (challengeId).evidence[j]', () => {
    const error = caught(() => assertAdjudicatorQuotesPinned(adjudicatorWith([quote('DOC-Z', PIN('DOC-Z'))]), closure, 0));
    expect(error.role).toBe('adjudicator');
    expect(error.problems).toHaveLength(1);
    expect(error.problems[0]).toContain(`adjudications[0] (${RAISED}).evidence[0]`);
    expect(error.problems[0]).toContain('DOC-Z');
  });

  it('positive control: every position carrying its own document\'s pin passes all three seams, and the outputs come back unchanged', () => {
    const reader = readerWith([
      quote('DOC-A'),
      { kind: 'amendment_chain', hops: [{ edgeId: 'E-1', quote: quote('DOC-A') }, { edgeId: 'E-1', quote: quote('DOC-B') }] },
      { kind: 'cross_reference', edgeId: 'E-2', from: quote('DOC-A'), to: quote('DOC-C') },
      { kind: 'absence', docIds: ['DOC-A'], term: 'FIXTURE absent term' },
    ]);
    expect(assertReaderQuotesPinned(reader, closure, 0)).toBe(reader);
    const prosecutor = prosecutorWith('stub_lens', [quote('DOC-B'), quote('DOC-C')]);
    expect(assertProsecutorQuotesPinned(prosecutor, closure, 1)).toBe(prosecutor);
    const adjudicator = adjudicatorWith([quote('DOC-C')]);
    expect(assertAdjudicatorQuotesPinned(adjudicator, closure, 0)).toBe(adjudicator);
    expect(quotePinProblems([{ label: 'x', items: reader.elements[0]!.evidence }], closure)).toEqual([]);
  });

  it('the predicate reads the pins off the closure it is handed, not off the quote: a closure pinning DOC-A elsewhere refuses the fixture pin', () => {
    // Called directly with a source the natural caller cannot produce (failure mode #4).
    const elsewhere = { docIds: ['DOC-A'] as readonly string[], document: () => ({ sha256Normalized: 'a'.repeat(64) }) };
    const problems = quotePinProblems([{ label: 'elements[0] (RE-STUB).evidence', items: [quote('DOC-A')] }], elsewhere);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('aaaaaaaaaaaa');
    expect(problems[0]).toContain(PIN('DOC-A').slice(0, 12));
    expect(quotePinProblems([{ label: 'x', items: [quote('DOC-A', 'a'.repeat(64))] }], elsewhere)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Through the pipeline: a bad output stops the run before the next role
// ---------------------------------------------------------------------------

describe('FIXTURE — through runVerificationPipeline, a quote that fails the contract stops the run at its own role, before the next role launches', () => {
  const requirement = fixtureRequirement();
  const prompts = loadPromptSet();

  function input(runner: ReturnType<typeof stubRunner>) {
    return {
      packId: 'testpack',
      requirementId: requirement.id,
      requirement,
      renderContext: fixtureRenderContext(),
      closure: fixtureClosure(),
      corpus,
      prompts,
      config: { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 2 },
      runner,
    };
  }

  /** A runner answering every role validly, with the overrides a case needs. */
  function runnerWith(over: { reader?: ReaderOutput; prosecutor?: (index: number, lens: string) => ProsecutorOutput; adjudicator?: AdjudicatorOutput }) {
    return stubRunner((request) => {
      if (request.role === 'reader') return JSON.stringify(over.reader ?? stubReaderOutput());
      if (request.role === 'prosecutor') {
        const lens = lensFromRequest(request);
        return JSON.stringify(over.prosecutor?.(request.index, lens) ?? (request.index === 0 ? prosecutorWith(lens, [quote('DOC-A')]) : stubProsecutorOutput(lens)));
      }
      return JSON.stringify(over.adjudicator ?? adjudicatorWith([quote('DOC-B')]));
    });
  }

  const launched = (runner: ReturnType<typeof stubRunner>) => runner.requests.map((request) => `${request.role}[${request.index}]`);

  it('positive control: valid quotes at every role run reader, two prosecutors and the adjudicator, and the record carries the adjudicated challenge with the hashes the roles returned', async () => {
    const runner = runnerWith({});
    const outcome = await runVerificationPipeline(input(runner));
    expect(launched(runner)).toEqual(['reader[0]', 'prosecutor[0]', 'prosecutor[1]', 'adjudicator[0]']);
    expect(outcome.halted).toBe(false);
    const challenge = outcome.adjudication?.challenges.find((c) => c.id === RAISED);
    expect(challenge?.verdict).toBe('CONFIRMED');
    expect((challenge?.evidence[0] as { sha256Normalized: string }).sha256Normalized).toBe(PIN('DOC-A'));
    expect((challenge?.adjudicationEvidence[0] as { sha256Normalized: string }).sha256Normalized).toBe(PIN('DOC-B'));
  });

  it('the r2 shape: a reader whose quote carries the empty string is refused at the reader seam after one request; no prosecutor launches', async () => {
    const runner = runnerWith({ reader: readerWith([quote('DOC-A', '')]) });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('reader');
    expect(error.problems.join('\n')).toContain('elements.0.evidence.0.sha256Normalized');
    expect(launched(runner)).toEqual(['reader[0]']);
  });

  it('a reader quote at a well-formed hash that is not the pin is refused at the reader seam; no prosecutor launches', async () => {
    const runner = runnerWith({ reader: readerWith([quote('DOC-A', WRONG)]) });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('reader');
    expect(error.message).toContain('reader[0]');
    expect(error.problems[0]).toContain('elements[0] (RE-STUB).evidence[0]');
    expect(error.problems[0]).toContain(WRONG.slice(0, 12));
    expect(launched(runner)).toEqual(['reader[0]']);
  });

  it('a reader quote naming a document outside the closure is refused the same way', async () => {
    const runner = runnerWith({ reader: readerWith([quote('DOC-Z', PIN('DOC-Z'))]) });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('reader');
    expect(error.problems[0]).toContain('DOC-Z');
    expect(launched(runner)).toEqual(['reader[0]']);
  });

  it('a bad hash inside a nested hop of the reader\'s evidence is refused before any prosecutor launches, under the hop\'s path', async () => {
    const runner = runnerWith({
      reader: readerWith([quote('DOC-A'), { kind: 'amendment_chain', hops: [{ edgeId: 'E-1', quote: quote('DOC-A') }, { edgeId: 'E-1', quote: quote('DOC-B', WRONG) }] }]),
    });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.problems[0]).toContain('elements[0] (RE-STUB).evidence[1].hops[1].quote');
    expect(launched(runner)).toEqual(['reader[0]']);
  });

  it('a bad prosecutor[0] quote stops the run before prosecutor[1] and the adjudicator launch', async () => {
    const runner = runnerWith({ prosecutor: (index, lens) => (index === 0 ? prosecutorWith(lens, [quote('DOC-A', WRONG)]) : stubProsecutorOutput(lens)) });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('prosecutor');
    expect(error.index).toBe(0);
    expect(error.problems[0]).toContain('challenges[0] (C1-fixture).evidence[0]');
    expect(launched(runner)).toEqual(['reader[0]', 'prosecutor[0]']);
  });

  it('a bad prosecutor[1] quote stops the run before the adjudicator launches, and names index 1', async () => {
    const runner = runnerWith({ prosecutor: (index, lens) => (index === 1 ? prosecutorWith(lens, [quote(NOT_INGESTED, WRONG)]) : prosecutorWith(lens, [quote('DOC-A')])) });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('prosecutor');
    expect(error.index).toBe(1);
    expect(error.problems[0]).toContain(NOT_INGESTED);
    expect(launched(runner)).toEqual(['reader[0]', 'prosecutor[0]', 'prosecutor[1]']);
  });

  it('a bad adjudicator quote is refused at the adjudicator seam, so no record is assembled from it', async () => {
    const runner = runnerWith({ adjudicator: adjudicatorWith([quote('DOC-B', WRONG)]) });
    const error = await rejection(runVerificationPipeline(input(runner)));
    expect(error.role).toBe('adjudicator');
    expect(error.problems[0]).toContain(`adjudications[0] (${RAISED}).evidence[0]`);
    expect(error.problems[0]).toContain('DOC-B');
    expect(launched(runner)).toEqual(['reader[0]', 'prosecutor[0]', 'prosecutor[1]', 'adjudicator[0]']);
  });
});

// ---------------------------------------------------------------------------
// 5. The v3, v4 and v5 prompts say it; v1, v2, v3 and v4 are kept byte for byte
//    under their own versions; v4 replaces the delivery line and nothing else;
//    v5 inserts the relationships section and entry and nothing else; and the
//    identity moves with the set
// ---------------------------------------------------------------------------

describe('the v3, v4 and v5 prompt sets tell every role to copy the fence hash; v4 adds the delivery instruction; v5 the relationships instruction; v1, v2, v3 and v4 are kept and still derive their own identities', () => {
  const current = loadPromptSet();
  const v1 = loadHistoricalPromptSet('v1');
  const v2 = loadHistoricalPromptSet('v2');
  const v3 = loadHistoricalPromptSet('v3');
  const v4 = loadHistoricalPromptSet('v4');

  /** The v4 digests, as `VERSIONS.md` recorded them while v4 was current and as the r4 capture's pre-flight and streams carry them. */
  const V4_DIGESTS = {
    reader: '3aa48bfddf53749463f74f5ae7f98dfa47426a941d05993782eaca1e06480cff',
    prosecutor: '92556391c7668b2f2a0dcdc42e4281d9f9a658e7e7abae18f8294363596cb32a',
    adjudicator: 'a134ce8e3ccc09b63a94308c67db63eefc701b2448359b884c2a4ce2358051d5',
  };

  /** The v3 digests, as `VERSIONS.md` recorded them while v3 was current and as the r3 capture's pre-flight and streams carry them. */
  const V3_DIGESTS = {
    reader: 'd35043566ce39aa369b1d71466328ba5b991a0f2b0fc900cf1c6ce0d3b4ad5f1',
    prosecutor: '148f12a94231128edbd2224ca6d130d859b372b825bd16af7260d9c5e41a7e54',
    adjudicator: '9292026f228fab2623970912000f994452056a49194221a19d9d55e85029c998',
  };
  /** The v2 digests, as `VERSIONS.md` recorded them while v2 was current and as the r2 capture's streams carry them. */
  const V2_DIGESTS = {
    reader: '4d21d2b93df0e23b5ae6d95987d9c72ef167bc01d03cb48f7eb742ade2f3ed6e',
    prosecutor: '9c0ecc66306d2107518aeeb92ada4deb4010a1436a8f9481559004dd6d6ca0b5',
    adjudicator: 'cea3e6f02951b300c84b603d9b36b538f77fb7f2a3c8ac9c6bc470961ec24698',
  };
  const V1_DIGESTS = {
    reader: '4d21d2b93df0e23b5ae6d95987d9c72ef167bc01d03cb48f7eb742ade2f3ed6e',
    prosecutor: '87eb0a212ec3b5e97ec4ce26dbe416a47bcf3562e87f45dcbf08ff73829c3edb',
    adjudicator: 'f38ba1f0cf217904f63501300d14a925928ed0eb929b4fb6c83d5d72e798a46a',
  };

  /**
   * The one-line delivery instruction every set up to v3 ended with, and the
   * paragraph v4 ends with instead: r3's prosecutor (2026-10-18) answered as a
   * fenced text block under the one-liner and never called the StructuredOutput
   * tool, so the launch failed with the committed zero retries
   * (`CHECKPOINT-opus55-s002-capture-r3.md`). The paragraph names the tool
   * for the CLI route and keeps direct JSON for the HTTP route, where no tool
   * is offered. An instruction reduces the observed risk; it guarantees nothing.
   */
  const OLD_DELIVERY_LINE = 'Output the JSON object and nothing else.\n';
  const V4_DELIVERY_PARAGRAPH =
    'When the StructuredOutput tool is available,\n' +
    'deliver your answer by calling it exactly once with the required JSON object\n' +
    'as its input.\n' +
    'Do not deliver the answer as a text message or Markdown code block.\n' +
    'When that tool is unavailable, output the required JSON object directly,\n' +
    'without Markdown fences or commentary.\n';

  /**
   * What v5 inserts into each v4 file, and nothing else: an entry under "What
   * you are given" after the `closure` entry, and a section after "A quote
   * carries its document's hash". r4's reader (2026-10-19) named four edge ids
   * the corpus does not hold; nothing had shown it which ids exist
   * (`CHECKPOINT-opus55-s002-capture-r4.md`). The section names the list the
   * pipeline now shows (`# Entitled relationships`, grammar 1.2.0), restricts
   * the ids a role may write to it, and says what to do when no listed edge
   * carries the relationship. Written out here, so the test states what v5 is
   * rather than reading it off the file under test.
   */
  const V5_RELATIONSHIPS_ENTRY =
    '- `relationships` — the `# Entitled relationships` section: every edge the\n' +
    '  corpus records between documents of the closure, as the pipeline states\n' +
    '  it. It is the complete list.\n';
  const V5_RELATIONSHIPS_SECTION =
    '## A relationship between documents carries its edge id\n' +
    '\n' +
    'The `# Entitled relationships` section lists every relationship the corpus\n' +
    'records between documents of the closure: one line per edge, giving its\n' +
    '`edgeId`, its `kind` (`amends`, `amendedBy`, `consolidates`, `references` or\n' +
    '`definesTermsFor`), the document it runs `from` and the document it runs\n' +
    '`to`. It is the complete list, and it is stated by the pipeline: a\n' +
    'relationship not listed there is not one you may cite as an edge, whatever\n' +
    'the texts imply. Each hop of an `amendment_chain` and each `cross_reference`\n' +
    'names an `edgeId`, and the only ids you may write are the ones listed,\n' +
    'copied character for character. A hop rests on an `amends` or `amendedBy`\n' +
    'edge and its quote is taken from one of that edge\'s two documents;\n' +
    'consecutive hops continue one chain in one direction. A `cross_reference`\n' +
    'rests on a `references` edge whose `from` and `to` are the documents of its\n' +
    'two quotes. When the list holds no edge that carries the relationship you\n' +
    'want to show, show it with `quote` evidence from the documents themselves\n' +
    'and say in the statement what the quoted text establishes. Never write an\n' +
    'edge id the list does not hold, never compose one from article numbers or\n' +
    'document ids, and never present a relationship as an edge because the text\n' +
    'implies it. The pipeline checks every edge id against the list as soon as\n' +
    'your output arrives; an id it does not hold is a defect in your output, not\n' +
    'a gap, and the run is refused.\n' +
    '\n';
  /** The v4 file with the entry and the section inserted — what v5 must be, character for character. */
  function v5From(v4Text: string): string {
    const closureEntry = v4Text.match(/- `closure` — the full text of every document in the entitled closure, and\n  nothing else[^\n]*\n/);
    expect(closureEntry).not.toBeNull();
    const withEntry = v4Text.replace(closureEntry![0], closureEntry![0] + V5_RELATIONSHIPS_ENTRY);
    const hashSection = withEntry.indexOf("## A quote carries its document's hash");
    expect(hashSection).toBeGreaterThan(0);
    const sectionEnd = withEntry.indexOf('and the run is refused.\n\n', hashSection) + 'and the run is refused.\n\n'.length;
    return withEntry.slice(0, sectionEnd) + V5_RELATIONSHIPS_SECTION + withEntry.slice(sectionEnd);
  }

  it('v5 is current; v1, v2, v3 and v4 are the kept sets, each read from its own literal paths', () => {
    expect(CURRENT_PROMPT_SET_VERSION).toBe('v5');
    expect(HISTORICAL_PROMPT_SET_VERSIONS).toEqual(['v1', 'v2', 'v3', 'v4']);
    for (const role of ['reader', 'prosecutor', 'adjudicator'] as const) {
      expect(historicalPromptPath('v4', role)).toBe(join(engineRoot, 'prompts', 'history', 'v4', `${role}.md`));
      expect(historicalPromptPath('v3', role)).toBe(join(engineRoot, 'prompts', 'history', 'v3', `${role}.md`));
      expect(historicalPromptPath('v2', role)).toBe(join(engineRoot, 'prompts', 'history', 'v2', `${role}.md`));
      expect(historicalPromptPath('v1', role)).toBe(join(engineRoot, 'prompts', 'history', 'v1', `${role}.md`));
    }
  });

  it('v4 is kept byte for byte (the digests the r4 capture ran under), v3, v2 and v1 are untouched, and v5 differs from all four in every role', () => {
    expect(promptHashes(v4)).toEqual(V4_DIGESTS);
    expect(promptHashes(v3)).toEqual(V3_DIGESTS);
    expect(promptHashes(v2)).toEqual(V2_DIGESTS);
    expect(promptHashes(v1)).toEqual(V1_DIGESTS);
    for (const role of ['reader', 'prosecutor', 'adjudicator'] as const) {
      expect(current[role].sha256, role).not.toBe(V4_DIGESTS[role]);
      expect(current[role].sha256, role).not.toBe(V3_DIGESTS[role]);
      expect(current[role].sha256, role).not.toBe(V2_DIGESTS[role]);
      expect(current[role].sha256, role).not.toBe(V1_DIGESTS[role]);
    }
  });

  it('every v3, v4 and v5 prompt carries the hash instruction, in words v1 and v2 do not have; v3 still ends with the one-line delivery instruction, v4 and v5 with the paragraph', () => {
    for (const role of ['reader', 'prosecutor', 'adjudicator'] as const) {
      for (const phrase of [
        '## A quote carries its document\'s hash',
        'four required fields',
        '`kind` is `"quote"`',
        'copied character for character',
        '`<<<BEGIN DOCUMENT <docId> sha256Normalized=<hash>>>>`',
        '64 lowercase hexadecimal characters',
        'never empty',
      ]) {
        expect(current[role].text, `${role}: ${phrase}`).toContain(phrase);
        expect(v4[role].text, `v4 ${role}: ${phrase}`).toContain(phrase);
        expect(v3[role].text, `v3 ${role}: ${phrase}`).toContain(phrase);
        expect(v2[role].text, `v2 ${role} lacks: ${phrase}`).not.toContain(phrase);
        expect(v1[role].text, `v1 ${role} lacks: ${phrase}`).not.toContain(phrase);
      }
      expect(v3[role].text.endsWith('\n' + OLD_DELIVERY_LINE), role).toBe(true);
      expect(v4[role].text.endsWith('\n' + V4_DELIVERY_PARAGRAPH), role).toBe(true);
      expect(current[role].text.endsWith('\n' + V4_DELIVERY_PARAGRAPH), role).toBe(true);
      expect(current[role].text, role).not.toMatch(/CSRD-S-\d{3}/);
    }
    // The adjudicator's pin rule no longer contradicts the instruction: the quote hash is the one hash it writes.
    expect(current.adjudicator.text).toContain('The one hash you write is a quote\'s `sha256Normalized`');
    expect(v4.adjudicator.text).toContain('The one hash you write is a quote\'s `sha256Normalized`');
    expect(v3.adjudicator.text).toContain('The one hash you write is a quote\'s `sha256Normalized`');
    expect(current.adjudicator.text).not.toContain('Do not emit hashes, closure identities');
    expect(v2.adjudicator.text).toContain('Do not emit hashes, closure identities');
  });

  it('v4 replaces the one-line delivery instruction with the paragraph naming the StructuredOutput tool, in words no earlier set has, and changes nothing else: v3 with that one line replaced is v4', () => {
    for (const role of ['reader', 'prosecutor', 'adjudicator'] as const) {
      for (const phrase of [
        'When the StructuredOutput tool is available',
        'deliver your answer by calling it exactly once',
        'Do not deliver the answer as a text message or Markdown code block.',
        'When that tool is unavailable, output the required JSON object directly',
        'without Markdown fences or commentary.',
      ]) {
        expect(v4[role].text, `v4 ${role}: ${phrase}`).toContain(phrase);
        expect(current[role].text, `${role}: ${phrase}`).toContain(phrase);
        for (const [label, kept] of [['v1', v1], ['v2', v2], ['v3', v3]] as const) {
          expect(kept[role].text, `${label} ${role} lacks: ${phrase}`).not.toContain(phrase);
        }
      }
      // The old line is gone from v4 and occurs exactly once in v3 (the positive control); the paragraph occurs exactly once in v4.
      expect(v4[role].text, role).not.toContain(OLD_DELIVERY_LINE.trimEnd());
      expect(v3[role].text.split(OLD_DELIVERY_LINE).length - 1, role).toBe(1);
      expect(v4[role].text.split(V4_DELIVERY_PARAGRAPH).length - 1, role).toBe(1);
      // Nothing else moved: the kept v3 file with its last line replaced is the kept v4 file, character for character.
      expect(v4[role].text, role).toBe(v3[role].text.replace(OLD_DELIVERY_LINE, V4_DELIVERY_PARAGRAPH));
    }
  });

  it('v5 inserts the relationships entry and section — use only the listed edge ids, quote evidence where no listed edge carries the relationship, never invent an id — in words no kept set has, and changes nothing else: v4 with the two insertions is v5', () => {
    for (const role of ['reader', 'prosecutor', 'adjudicator'] as const) {
      for (const phrase of [
        '## A relationship between documents carries its edge id',
        '`# Entitled relationships`',
        'the only ids you may write are the ones listed',
        'never compose one from article numbers or document ids',
        'show it with `quote` evidence from the documents themselves',
        'an id it does not hold is a defect in your output, not',
        '- `relationships` —',
      ]) {
        // Matched as prose, with the files' line wrapping removed, as the prompt-boundary tests match.
        const flat = (text: string): string => text.replace(/\s+/g, ' ');
        expect(flat(current[role].text), `${role}: ${phrase}`).toContain(flat(phrase));
        for (const [label, kept] of [['v1', v1], ['v2', v2], ['v3', v3], ['v4', v4]] as const) {
          expect(flat(kept[role].text), `${label} ${role} lacks: ${phrase}`).not.toContain(flat(phrase));
        }
      }
      // Each occurs exactly once; the hash section still precedes the relationships section; the delivery paragraph still ends the file.
      expect(current[role].text.split(V5_RELATIONSHIPS_SECTION).length - 1, role).toBe(1);
      expect(current[role].text.split(V5_RELATIONSHIPS_ENTRY).length - 1, role).toBe(1);
      expect(current[role].text.indexOf("## A quote carries its document's hash"), role).toBeLessThan(current[role].text.indexOf(V5_RELATIONSHIPS_SECTION));
      // Nothing else moved: the kept v4 file with the entry and the section inserted is the v5 file, character for character.
      expect(current[role].text, role).toBe(v5From(v4[role].text));
      // Positive control for the transformation: applied to itself it moves the text, so the equality above is not vacuous.
      expect(v5From(v4[role].text), role).not.toBe(v4[role].text);
    }
  });

  it('the identity moves with the set: v1, v2, v3, v4 and v5 derive five pipelines under one configuration', () => {
    const closure = fixtureClosure();
    const of = (prompts: typeof current) => pipelineVersionFor({ prompts, config: DEFAULT_ROLE_CONFIG, closure });
    const [underV1, underV2, underV3, underV4, underV5] = [of(v1), of(v2), of(v3), of(v4), of(current)];
    for (const identity of [underV1, underV2, underV3, underV4, underV5]) expect(identity).toMatch(/^pipeline-v3-[0-9a-f]{64}$/);
    expect(new Set([underV1, underV2, underV3, underV4, underV5]).size).toBe(5);
  });

  it('a version the repository does not keep is refused by name at runtime, never resolved to the current set; every kept version still loads its own files (the positive control)', () => {
    // The type union stops a literal at compile time; a value that arrives through a cast or a parsed string must be
    // stopped here. Before this refusal, an unknown version fell through `historicalPromptPath` to `undefined` and
    // `loadRolePrompt`'s default path then read the CURRENT prompt file — observed while v3 was being kept.
    const unknown = 'v9' as unknown as HistoricalPromptSetVersion;
    expect(() => loadHistoricalPromptSet(unknown)).toThrow(UnknownPromptSetVersionError);
    expect(() => loadHistoricalPromptSet(unknown)).toThrow('no kept prompt set for version "v9": the kept sets are v1, v2, v3, v4');
    expect(() => historicalPromptPath(unknown, 'reader')).toThrow(UnknownPromptSetVersionError);
    for (const [version, digests] of [['v1', V1_DIGESTS], ['v2', V2_DIGESTS], ['v3', V3_DIGESTS], ['v4', V4_DIGESTS]] as const) {
      expect(promptHashes(loadHistoricalPromptSet(version)), version).toEqual(digests);
      expect(loadHistoricalPromptSet(version).reader.sha256, `${version} is not the current set`).not.toBe(current.reader.sha256);
    }
  });
});
