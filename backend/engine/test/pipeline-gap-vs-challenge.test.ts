/**
 * The v2 role guidance: a challenge the closure can carry, against a document
 * a judgment genuinely needs — and the pipeline's handling of each.
 *
 * Why this file exists: the first genuine S-002 capture (2026-10-18) halted
 * because a prosecutor turned a scope objection it could state from the
 * closure into an evidence gap for a document outside it. The v1 prompts told
 * the roles how to halt and never said when a halt is the wrong finding. The
 * v2 prosecutor and adjudicator say it; the reader is byte-identical to v1,
 * because its isolation is the point of it.
 *
 * **What these tests are, and are not.** The pipeline cases below drive the
 * production orchestration with **synthetic, labelled fixtures**: a stub
 * runner returning role outputs written here. They show what the pipeline
 * does with each shape a role may return — a challenge continues to
 * adjudication, a gap halts the run — under the v2 prompts. They do not, and
 * cannot, show that a model given the v2 prompts will choose the right shape;
 * only a live run can, and none has. The prompt cases pin the text and its
 * versioning: the v1 set is kept byte for byte and derives the historical
 * identities, the current set derives new ones.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { runVerificationPipeline, pipelineVersionFor } from '../src/pipeline/orchestrate';
import {
  CURRENT_PROMPT_SET_VERSION,
  HISTORICAL_PROMPT_SET_VERSIONS,
  historicalPromptPath,
  loadHistoricalPromptSet,
  loadPromptSet,
  promptHashes,
} from '../src/pipeline/prompts';
import { EntitledClosure } from '../src/pipeline/entitlement';
import {
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

const here = __dirname;
const engineRoot = join(here, '..');

// ---------------------------------------------------------------------------
// The prompt sets: v1 kept, v2 current, the reader untouched
// ---------------------------------------------------------------------------

describe('the prompt sets are versioned, and the kept v1 set is the one every recording so far was made under', () => {
  const v1 = loadHistoricalPromptSet('v1');
  const v2 = loadHistoricalPromptSet('v2');
  const current = loadPromptSet();

  /** The v1 digests, as the S-002 capture's transcript and the S-001 recordings carry them. */
  const V1_DIGESTS = {
    reader: '4d21d2b93df0e23b5ae6d95987d9c72ef167bc01d03cb48f7eb742ade2f3ed6e',
    prosecutor: '87eb0a212ec3b5e97ec4ce26dbe416a47bcf3562e87f45dcbf08ff73829c3edb',
    adjudicator: 'f38ba1f0cf217904f63501300d14a925928ed0eb929b4fb6c83d5d72e798a46a',
  };

  it('v1 is kept byte for byte: its digests are the ones the recordings carry', () => {
    // v2 joined the kept sets when v3 (the quote-hash instruction) became current.
    expect(HISTORICAL_PROMPT_SET_VERSIONS).toEqual(['v1', 'v2']);
    expect(CURRENT_PROMPT_SET_VERSION).toBe('v3');
    expect(promptHashes(v1)).toEqual(V1_DIGESTS);
    // Each kept file is a file, resolved by its own literal path.
    for (const role of ['reader', 'prosecutor', 'adjudicator'] as const) {
      expect(historicalPromptPath('v1', role)).toBe(join(engineRoot, 'prompts', 'history', 'v1', `${role}.md`));
    }
  });

  it('the committed CSRD-S-001 replay recording carries v1\'s digests on every exchange — replayable against the kept set, not the current one', () => {
    // The repository's own historical fixture, read in place and never written.
    // Its `pipelineVersion` is the HTTP identity over v1 that
    // `pipeline-identity.test.ts` pins; its digests are the pinned v1 literals.
    const path = join(engineRoot, 'test', 'verification-transcripts', 'csrd', 'CSRD-S-001', 'run-v1-8717925d731334f6162bdc2fd35a230d3bde7a5d1dc66588db5f5544a0748310.json');
    const transcript = JSON.parse(readFileSync(path, 'utf8')) as {
      pipelineVersion: string;
      roles: { role: 'reader' | 'prosecutor' | 'adjudicator'; promptSha256: string }[];
    };
    expect(transcript.pipelineVersion).toBe('pipeline-v3-06789a364d220899535cbf0cc40fcd5b816becf4328be70b795f54340d4ad7c0');
    expect(transcript.roles.length).toBeGreaterThan(0);
    expect(new Set(transcript.roles.map((role) => role.role))).toEqual(new Set(['reader', 'prosecutor', 'adjudicator']));
    for (const role of transcript.roles) expect(role.promptSha256, role.role).toBe(V1_DIGESTS[role.role]);
  });

  it('v2 changes the prosecutor and the adjudicator and leaves the blind reader byte-identical (v3, the current set, moves all three for the quote-hash rule — pipeline-quote-pins.test.ts)', () => {
    expect(v2.reader.sha256).toBe(v1.reader.sha256);
    expect(v2.reader.text).toBe(v1.reader.text);
    expect(v2.prosecutor.sha256).not.toBe(v1.prosecutor.sha256);
    expect(v2.adjudicator.sha256).not.toBe(v1.adjudicator.sha256);
    expect(current.reader.sha256).not.toBe(v2.reader.sha256);
  });

  it('the v2 prosecutor distinguishes a challenge from a gap, in words v1 did not have, and still ends as the schema route expects', () => {
    for (const phrase of [
      'A gap and a challenge are different findings',
      'An objection you can state and quote from the closure is a **challenge**',
      'an exception or applicability condition it omits',
      'the\nprovision stating the omitted exception or applicability condition is itself\nout of reach — report the gap and halt',
      'A genuine gap is still a gap',
    ]) {
      expect(current.prosecutor.text, phrase).toContain(phrase);
      expect(v1.prosecutor.text, `v1 lacks: ${phrase}`).not.toContain(phrase);
    }
    // Nothing names a requirement, a verdict to reach, or an objection to drop.
    expect(current.prosecutor.text).not.toMatch(/CSRD-S-\d{3}/);
    expect(current.prosecutor.text).not.toMatch(/dismiss|ignore the objection|accept the encoding/i);
    // The lens list and the output contract are unchanged.
    expect(current.prosecutor.text).toContain('a wrong measurement period; a wrong scope type or\naddressee');
    expect(current.prosecutor.text.trimEnd().endsWith('Output the JSON object and nothing else.')).toBe(true);
    expect(v1.prosecutor.text.trimEnd().endsWith('Output the JSON object and nothing else.')).toBe(true);
  });

  it('the v2 adjudicator reserves the halt for a document judgment needs, and names OPEN_QUESTION for a challenge the closure cannot settle', () => {
    for (const phrase of [
      '**necessary** to adjudicate',
      'is `OPEN_QUESTION`, with evidence showing why the closure',
      'kept for the case where judgment itself is impossible',
      'assess that omitted exception or applicability condition is itself\n   unavailable, that is a gap, and you halt',
    ]) {
      expect(current.adjudicator.text, phrase).toContain(phrase);
      expect(v1.adjudicator.text, `v1 lacks: ${phrase}`).not.toContain(phrase);
    }
    expect(current.adjudicator.text).not.toMatch(/CSRD-S-\d{3}/);
    expect(current.adjudicator.text.trimEnd().endsWith('Output the JSON object and nothing else.')).toBe(true);
  });

  it('the identity moves with the set: v1 derives the historical @3 identity the capture filed, the current set derives another', () => {
    // The S-002 closure through the fixture-free production path is pinned in
    // `pipeline-identity.test.ts`; here the fixture closure suffices to show
    // the two sets are two pipelines under one configuration.
    const closure = EntitledClosure.forSources(fixtureAuthorisedCorpus(), fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']);
    const underV1 = pipelineVersionFor({ prompts: v1, config: DEFAULT_ROLE_CONFIG, closure });
    const underCurrent = pipelineVersionFor({ prompts: current, config: DEFAULT_ROLE_CONFIG, closure });
    expect(underV1).toMatch(/^pipeline-v3-[0-9a-f]{64}$/);
    expect(underCurrent).toMatch(/^pipeline-v3-[0-9a-f]{64}$/);
    expect(underCurrent).not.toBe(underV1);
  });
});

// ---------------------------------------------------------------------------
// FIXTURES: how the pipeline handles each finding shape under the v2 prompts
// ---------------------------------------------------------------------------

describe('FIXTURE — a scope objection raised as a challenge continues to adjudication; a genuine gap halts (synthetic outputs, not model behaviour)', () => {
  const requirement = fixtureRequirement();
  const corpus = fixtureAuthorisedCorpus();
  const prompts = loadPromptSet();
  const ctxRender = fixtureRenderContext();

  function closure(): EntitledClosure {
    return EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']);
  }

  function pipelineInput(runner: Parameters<typeof runVerificationPipeline>[0]['runner']) {
    return {
      packId: 'testpack',
      requirementId: requirement.id,
      requirement,
      renderContext: ctxRender,
      closure: closure(),
      corpus,
      prompts,
      config: { ...DEFAULT_ROLE_CONFIG, prosecutorCount: 2 },
      runner,
    };
  }

  /**
   * The capture's objection, in the shape v2 asks for: a challenge about the
   * encoding's scope, stated and quoted from the closure, naming the document
   * that would settle it — and no gap. The statement text is a fixture; the
   * pipeline does not read it.
   */
  const SCOPE_CHALLENGE_ID = 'C1-scope-not-tied-to-a-period';
  function scopeChallengeOutput(lens: string) {
    const base = stubProsecutorOutput(lens);
    return {
      ...base,
      challenges: [
        ...base.challenges,
        {
          id: SCOPE_CHALLENGE_ID,
          lens,
          statement:
            'FIXTURE: the encoding names no period for the test it encodes; the provision that would settle which periods it governs is outside the closure, so this is raised as a challenge rather than a gap.',
          // Quoted from the fixture closure, as the schema requires of every challenge.
          evidence: stubReaderOutput().elements[0]!.evidence,
        },
      ],
      gaps: [],
    };
  }

  it('continues: the challenge reaches the adjudicator, who may leave it OPEN_QUESTION, and the run is not halted', async () => {
    const runner = stubRunner((request) => {
      if (request.role === 'reader') return JSON.stringify(stubReaderOutput());
      if (request.role === 'prosecutor') {
        return JSON.stringify(request.index === 0 ? scopeChallengeOutput(lensFromRequest(request)) : stubProsecutorOutput(lensFromRequest(request)));
      }
      // The adjudicator answers every challenge it was given; the scope one is
      // left open, which is the recorded outcome the v2 guidance points to.
      // The challenges as the adjudicator is shown them (`# Challenges`, JSON), each under its pipeline-qualified id.
      const given = JSON.parse(request.messages[1]?.content.split('# Challenges')[1]?.split('\n# ')[0] ?? '[]') as { id?: string; challengeId?: string }[];
      const idOf = (c: { id?: string; challengeId?: string }): string => c.challengeId ?? c.id ?? '';
      return JSON.stringify({
        adjudications: given.map((c) =>
          idOf(c).endsWith(SCOPE_CHALLENGE_ID)
            ? { challengeId: idOf(c), verdict: 'OPEN_QUESTION', evidence: stubReaderOutput().elements[0]!.evidence }
            : { challengeId: idOf(c), verdict: 'CONFIRMED', resolution: 'FIXTURE: confirmed', evidence: stubReaderOutput().elements[0]!.evidence },
        ),
        gaps: [],
      });
    });
    const outcome = await runVerificationPipeline(pipelineInput(runner));
    expect(outcome.halted).toBe(false);
    expect(outcome.tail.gaps).toEqual([]);
    expect(runner.requests.filter((r) => r.role === 'adjudicator')).toHaveLength(1);
    const scope = outcome.adjudication?.challenges.find((c) => c.id.endsWith(SCOPE_CHALLENGE_ID));
    expect(scope, 'the scope challenge reached the record').toBeDefined();
    expect(scope?.verdict).toBe('OPEN_QUESTION');
    expect(outcome.adjudication?.openQuestions.some((q) => q.id.endsWith(SCOPE_CHALLENGE_ID))).toBe(true);
  });

  it('halts: the same prosecutor asking for a genuinely unreachable document as a gap stops the run before adjudication', async () => {
    const runner = stubRunner((request) => {
      if (request.role === 'reader') return JSON.stringify(stubReaderOutput());
      if (request.role === 'prosecutor') {
        return JSON.stringify(
          request.index === 0
            ? { lens: lensFromRequest(request), coverage: [], challenges: [], gaps: [{ kind: 'closure_gap', docId: 'DOC-D', detail: 'FIXTURE: the lens cannot be worked without this annex' }] }
            : stubProsecutorOutput(lensFromRequest(request)),
        );
      }
      return JSON.stringify({ adjudications: [], gaps: [] });
    });
    const outcome = await runVerificationPipeline(pipelineInput(runner));
    expect(outcome.halted).toBe(true);
    expect(outcome.tail.gaps.map((g) => [g.kind, g.docId])).toEqual([['closure_gap', 'DOC-D']]);
    expect(runner.requests.filter((r) => r.role === 'adjudicator')).toHaveLength(0);
    expect(runner.requests.filter((r) => r.role === 'prosecutor')).toHaveLength(1);
    // And a document the corpus does not hold at all halts the same way.
    const absent = await runVerificationPipeline(
      pipelineInput(
        stubRunner((request) =>
          request.role === 'reader'
            ? JSON.stringify(stubReaderOutput())
            : request.role === 'prosecutor'
              ? JSON.stringify({ lens: lensFromRequest(request), coverage: [], challenges: [], gaps: [{ kind: 'corpus_gap', docId: NOT_INGESTED, detail: 'FIXTURE' }] })
              : JSON.stringify({ adjudications: [], gaps: [] }),
        ),
      ),
    );
    expect(absent.halted).toBe(true);
    expect(absent.tail.gaps[0]?.kind).toBe('corpus_gap');
  });

  it('the adjudicator can still halt on a document it genuinely needs, after the prosecutors ran', async () => {
    const runner = stubRunner((request) =>
      request.role === 'reader'
        ? JSON.stringify(stubReaderOutput())
        : request.role === 'prosecutor'
          ? JSON.stringify(stubProsecutorOutput(lensFromRequest(request)))
          : JSON.stringify({ adjudications: [], gaps: [{ kind: 'closure_gap', docId: 'DOC-D', detail: 'FIXTURE: no verdict can be reached without this' }] }),
    );
    const outcome = await runVerificationPipeline(pipelineInput(runner));
    expect(outcome.halted).toBe(true);
    expect(outcome.tail.gaps.map((g) => g.docId)).toEqual(['DOC-D']);
    expect(outcome.adjudication?.challenges).toEqual([]);
  });
});
