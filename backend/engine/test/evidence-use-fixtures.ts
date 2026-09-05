/**
 * A schema-valid verification result for the first case, over the real corpus.
 *
 * Evidence-use tests need results the result hash will accept — `resultSha256`
 * parses what it hashes — with quotes drawn from the real first-case documents
 * and their real declared ranges, because the ambiguity that motivates
 * explicit selection exists only there. Building that world once keeps every
 * evidence-use test asserting on the same pins rather than on a private
 * approximation of them.
 *
 * Synthetic reasoning, real evidence: the statements are placeholders; the
 * quotes are sentences the documents really carry, so the checker and the
 * locator have something true to find.
 */

import { join } from 'node:path';
import { loadPack } from '../src/knowledge/loader';
import { loadCorpus, type LoadedCorpus } from '../src/corpus/store';
import { computeClosure, docsForSources } from '../src/corpus/closure';
import { pinnedStandingFor, standingMapFor } from '../src/corpus/standing';
import { requirementInputSha256 } from '../src/verification/canonical';
import { RENDERER_VERSION, type RenderContext } from '../src/verification/render';
import { candidateConditionSha256, candidateRenderedConditionSha256 } from '../src/verification/sign';
import type { VerificationResult } from '../src/verification/result';
import type { KnowledgePack, Requirement } from '../src/types';

const engineRoot = join(__dirname, '..');

export const HOST = 'DOC-32013L0034';
export const AMENDING = 'DOC-32026L0470';
export const UNDECLARED = 'DOC-32022L2464';

/** Sentences the first-case documents really carry, chosen for where they sit. */
export const THRESHOLD = 'net turnover of EUR 450 000 000 and an average number of 1 000 employees';
export const UNIQUE_29A = 'The information referred to in the first subparagraph shall be clearly identifiable within the consolidated management report';
export const HEADER_HOST = 'DIRECTIVE 2013/34/EU OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';
export const HEADER_AMENDING = 'DIRECTIVE (EU) 2026/470 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';
export const UNIQUE_PT5 = 'For the purposes of the third, fourth and fifth subparagraphs, the following definitions apply';

export interface FirstCaseWorld {
  pack: KnowledgePack;
  corpus: LoadedCorpus;
  requirement: Requirement;
  renderCtx: RenderContext;
  closureSha256: string;
  closureDocIds: string[];
}

let cached: FirstCaseWorld | undefined;

/** The real pack and corpus, the requirement, and its closure — loaded once. */
export function firstCaseWorld(requirementId = 'CSRD-S-002'): FirstCaseWorld {
  if (cached !== undefined && cached.requirement.id === requirementId) return cached;
  const pack = loadPack(join(engineRoot, 'knowledge', 'csrd'));
  const corpus = loadCorpus(join(engineRoot, 'corpus'));
  const requirement = pack.requirements.find((r) => r.id === requirementId);
  if (requirement === undefined) throw new Error(`the pack carries no ${requirementId}`);
  const closure = computeClosure(corpus.index, docsForSources(corpus.index, requirement.sources), standingMapFor(corpus.index, pack));
  cached = {
    pack,
    corpus,
    requirement,
    renderCtx: { factTypes: pack.factTypes, catalogues: pack.catalogues },
    closureSha256: closure.sha256,
    closureDocIds: [...closure.docIds],
  };
  return cached;
}

export function quoteOf(world: FirstCaseWorld, docId: string, text: string) {
  return { kind: 'quote' as const, docId, sha256Normalized: world.corpus.document(docId).sha256Normalized, text };
}

/** The closure's documents as the corpus holds them now — the record's pin shape. */
export function pinsOf(world: FirstCaseWorld): VerificationResult['corpus'] {
  return world.closureDocIds.map((docId) => {
    const d = world.corpus.document(docId);
    return {
      docId,
      versionLabel: d.versionLabel,
      sha256Raw: d.sha256Raw,
      sha256Normalized: d.sha256Normalized,
      normalizerVersion: d.normalizerVersion,
      artefactAuthenticity: d.artefactAuthenticity,
      nonOperativeSections: [...d.nonOperativeSections],
      sources: pinnedStandingFor(standingMapFor(world.corpus.index, world.pack), docId),
    };
  });
}

/**
 * A valid result whose one reading element is supported by a discriminating
 * quote inside Article 29a. Overrides replace whole fields.
 */
export function firstCaseResult(world: FirstCaseWorld, overrides: Partial<VerificationResult> = {}): VerificationResult {
  const { requirement, renderCtx } = world;
  return {
    packId: 'csrd',
    requirementId: requirement.id,
    requirementVersion: requirement.version,
    resultSchemaVersion: '1.3.0',
    pipelineVersion: 'pipeline-1.0.0',
    rendererVersion: RENDERER_VERSION,
    closureRendererVersion: 'closure-renderer-1.0.0',
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderCtx),
    corpusClosureSha256: world.closureSha256,
    corpus: pinsOf(world),
    reading: {
      elements: [
        {
          id: 'R1',
          statement: 'FIXTURE — parent undertakings above the thresholds report on a consolidated basis.',
          evidence: [quoteOf(world, HOST, UNIQUE_29A)],
        },
      ],
    },
    coverage: { cells: [{ direction: 'reading_to_condition', readingElementId: 'R1', conditionPath: 'root', verdict: 'MAPPED' }] },
    challenges: [],
    openQuestions: [],
    gaps: [],
    ...overrides,
  } as VerificationResult;
}
