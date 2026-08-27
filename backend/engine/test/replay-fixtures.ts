/**
 * The synthetic role responses the committed replay recordings were made from,
 * and the world they were made against.
 *
 * # These are not readings of any law
 *
 * Every statement, challenge and adjudication below is a **synthetic fixture**
 * written to exercise machinery. The words say so in themselves, so that a
 * recording pulled out of `test/verification-transcripts/` and read on its own
 * cannot be mistaken for a reading of the CSRD corpus. No model produced any of
 * it and no model was contacted to obtain it.
 *
 * ```text
 * synthetic replay fixture   what is here, and what is committed today
 * real provider transcript   does not exist yet; the first live run makes one
 * ```
 *
 * The two share **one format**, deliberately: the recording a live run captures
 * has the same shape, the same binding fields and the same path, so the machinery
 * proven here is the machinery that will replay the real one. What differs is
 * only where the response text came from, which is exactly the difference replay
 * is designed not to care about.
 *
 * # The evidence is real even though the judgments are not
 *
 * Quotes are real sentences from the real corpus documents, pinned to the real
 * normalized hashes, because the evidence checker verifies them against the
 * documents and a fixture that failed that check would prove nothing about the
 * pipeline. So: **real evidence, synthetic reasoning**. That is the honest
 * description and it is the one the statements themselves carry.
 *
 * # Why a shared module rather than a literal in each place
 *
 * `record-replay-fixture.ts` records with these responses and
 * `pipeline-replay.test.ts` asserts against what was recorded. Two copies would
 * be free to drift, and the drift would surface as a determinism failure whose
 * cause was a fixture edit rather than anything about the pipeline.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpus, type LoadedCorpus } from '../src/corpus/store';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { qualifiedChallengeId } from '../src/pipeline/prosecutors';
import type { RoleRequest } from '../src/pipeline/roles';
import { TRANSCRIPT_ROOT } from '../src/pipeline/transcript';
import type { AgentRunner, RoleResponse } from '../src/pipeline/runner';
import { lensFromRequest } from './pipeline-fixtures';

const here = dirname(fileURLToPath(import.meta.url));
export const engineRoot = join(here, '..');

/** Where the committed recordings live, absolutely. */
export const FIXTURE_TRANSCRIPT_ROOT = join(engineRoot, TRANSCRIPT_ROOT);

export const PACK_ID = 'csrd';
/** Two served sources, so the closure is real and every role has text. */
export const REQUIREMENT_ID = 'CSRD-S-001';

/**
 * Recordings that answered a question the repository no longer asks.
 *
 * A recording is bound to a run identity, so when the identity legitimately
 * moves the old recording stops binding. It is **retired, not deleted**: it is
 * evidence of an execution that happened, and deleting it would erase the only
 * record of what the pipeline produced under the previous provenance.
 *
 * `run-v1-764e571e…` is the pre-D1(a) generation. It was retired on 2026-08-27
 * by the provenance migration, which moved `pipelineVersion` (the reader prompt
 * changed when locators replaced source identities in `ReaderInput`) and
 * `requirementInputSha256` (authored `provenance` replaced `provisions` and
 * `sources`), and `runId` with them. `packId`, `requirementId`,
 * `renderedConditionSha256` and `corpusClosureSha256` did not move — measured in
 * `pipeline-replay.test.ts`, not assumed.
 */
export const SUPERSEDED_RUN_IDS: readonly string[] = [
  'run-v1-764e571e7fb566ba75cc2ff126ac1d7b18cb59a887b033eef9f97c2f1f215d54',
];

export const DOC_HOST = 'DOC-32013L0034';
export const DOC_AMENDING = 'DOC-32026L0470';

/** Real title lines, from the real normalized documents. */
export const QUOTE_HOST = 'DIRECTIVE 2013/34/EU OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';
export const QUOTE_AMENDING =
  'DIRECTIVE (EU) 2026/470 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';

/**
 * The statements, as named constants.
 *
 * Named rather than inlined because the semantic-mutation proof has to say
 * *which field it expects to move* before it looks at any hash, and a test that
 * matched on prose it had also written would be matching itself.
 */
export const READING_ONE =
  'SYNTHETIC FIXTURE, not a reading of any law: element one stands for a provision the encoding carries.';
export const READING_TWO =
  'SYNTHETIC FIXTURE, not a reading of any law: element two stands for a provision the encoding does not carry.';
export const CHALLENGE_ONE =
  'SYNTHETIC FIXTURE: the reading carries an element the encoding never states.';
export const CHALLENGE_TWO =
  'SYNTHETIC FIXTURE: the encoding states a bound the reading does not support.';
export const RESOLUTION =
  'SYNTHETIC FIXTURE: the challenge is upheld and the encoding already carries the bound.';

/** The addresses used, which must be this requirement's own condition paths. */
export const MAPPED_PATH = 'all[0]';
export const UNSUPPORTED_PATH = 'all[1]';

let corpusCache: LoadedCorpus | undefined;
export function fixtureCorpusStore(): LoadedCorpus {
  corpusCache ??= loadCorpus(join(engineRoot, 'corpus'));
  return corpusCache;
}

function quote(docId: string, text: string) {
  return {
    kind: 'quote' as const,
    docId,
    sha256Normalized: fixtureCorpusStore().document(docId).sha256Normalized,
    text,
  };
}

/** E-P — the prosecutor's basis. */
export const evidenceP = () => quote(DOC_AMENDING, QUOTE_AMENDING);
/** E-A — the adjudicator's basis: a different document and different words. */
export const evidenceA = () => quote(DOC_HOST, QUOTE_HOST);

export function reading(firstStatement: string = READING_ONE) {
  return {
    elements: [
      { id: 'RE-1', statement: firstStatement, evidence: [quote(DOC_HOST, QUOTE_HOST)] },
      { id: 'RE-2', statement: READING_TWO, evidence: [quote(DOC_AMENDING, QUOTE_AMENDING)] },
    ],
    gaps: [],
  };
}

export function prosecution(lens: string) {
  return {
    lens,
    coverage: [
      {
        direction: 'reading_to_condition' as const,
        readingElementId: 'RE-1',
        conditionPath: MAPPED_PATH,
        verdict: 'MAPPED' as const,
      },
      {
        direction: 'reading_to_condition' as const,
        readingElementId: 'RE-2',
        verdict: 'UNMAPPED' as const,
        challengeId: 'C1',
      },
      {
        direction: 'condition_to_reading' as const,
        conditionPath: UNSUPPORTED_PATH,
        verdict: 'UNSUPPORTED' as const,
        challengeId: 'C2',
      },
    ],
    challenges: [
      { id: 'C1', lens, statement: CHALLENGE_ONE, evidence: [evidenceP()] },
      { id: 'C2', lens, statement: CHALLENGE_TWO, evidence: [evidenceP()] },
    ],
    gaps: [],
  };
}

/**
 * Every challenge the configured prosecutors raise, adjudicated once each.
 *
 * The ids come from `qualifiedChallengeId` and the count from
 * `DEFAULT_ROLE_CONFIG` — the configuration the production command actually
 * runs — so this stays an input derived from production rather than a
 * hard-coded list that would silently under-answer if the count moved.
 */
export function adjudication(verdictForFirst: 'CONFIRMED' | 'MISMATCH' = 'CONFIRMED') {
  const ids: string[] = [];
  for (let i = 0; i < DEFAULT_ROLE_CONFIG.prosecutorCount; i += 1) {
    ids.push(qualifiedChallengeId(i, 'C1'), qualifiedChallengeId(i, 'C2'));
  }
  return {
    adjudications: ids.map((challengeId, position) => ({
      challengeId,
      verdict: position === 0 ? verdictForFirst : ('CONFIRMED' as const),
      resolution: RESOLUTION,
      evidence: [evidenceA()],
    })),
    gaps: [],
  };
}

export interface SyntheticResponses {
  reading?: ReturnType<typeof reading>;
  adjudication?: ReturnType<typeof adjudication>;
}

/**
 * The deterministic capability the committed recordings were made through.
 *
 * `kind: 'replay'` because it replays a decision table rather than asking
 * anything; it holds no endpoint, no credential and no `fetch`. It answers the
 * prosecutor under whatever lens the *run* configured, read back off the
 * request, so it cannot disagree with the configuration under test.
 */
export function syntheticCapability(overrides: SyntheticResponses = {}): AgentRunner & {
  requests: RoleRequest[];
} {
  const requests: RoleRequest[] = [];
  return {
    kind: 'replay',
    requests,
    run(request: RoleRequest): Promise<RoleResponse> {
      requests.push(request);
      switch (request.role) {
        case 'reader':
          return Promise.resolve({ outputJson: JSON.stringify(overrides.reading ?? reading()) });
        case 'prosecutor':
          return Promise.resolve({
            outputJson: JSON.stringify(prosecution(lensFromRequest(request))),
          });
        case 'adjudicator':
          return Promise.resolve({
            outputJson: JSON.stringify(overrides.adjudication ?? adjudication()),
          });
      }
    },
  };
}
