/**
 * The purpose-built standing world, shared by every test that needs a corpus
 * with an adopted-not-effective source in it — which the real corpus does not
 * have. Defined once so the closure sets stated in `corpus-standing.test.ts`
 * and the role-facing renders asserted in `pipeline-standing.test.ts` are
 * about one world rather than two that agree by coincidence.
 *
 *   DOC-RM [911]      ──amendedBy──▶  DOC-RN [912, 913]   ← mixed: one adopted source
 *   DOC-RQ [914]      ──amendedBy──▶  DOC-RP [915, 916]   ← all in force
 *   DOC-RQ            ──references─▶  DOC-RN              ← the reference branch
 */

import { parseCorpusIndex } from '../src/corpus/schema';
import { CLOSURE_POLICY_V1, type ClosurePolicy } from '../src/corpus/closure';
import { authoriseCorpus, type AuthorisedCorpus, type CorpusCapability } from '../src/corpus/authority';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { sourceRecordSchema } from '../src/knowledge/schema';
import type { CorpusDocument, CorpusEdge, CorpusIndex } from '../src/corpus/types';
import type { KnowledgePack, TemporalStanding } from '../src/types';
import type { SourceRegister } from '../src/monitoring/types';
import { sha256Hex } from '../src/corpus/hash';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The engine root, for tests that also need the real world. */
export function engineRootOf(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

export const STANDING: Record<string, TemporalStanding> = {
  'SRC-911': 'in_force',
  'SRC-912': 'adopted_not_effective',
  'SRC-913': 'in_force',
  'SRC-914': 'in_force',
  'SRC-915': 'in_force',
  'SRC-916': 'in_force',
};

export function text(docId: string): string {
  return `Synthetic legal text for ${docId}. Article 1. The operative test is stated here.`;
}

export function doc(
  docId: string,
  serves: string[],
  edges: CorpusEdge[] = [],
  over: Partial<Pick<CorpusDocument, 'artefactAuthenticity' | 'nonOperativeSections' | 'versionLabel'>> = {},
): CorpusDocument {
  return {
    docId,
    serves,
    title: `Document ${docId}`,
    url: `https://example.invalid/${docId}`,
    versionLabel: over.versionLabel ?? 'consolidated 1 Jan 2026',
    retrievedOn: '2026-09-05',
    rawPath: `raw/${docId}.html`,
    normalizedPath: `normalized/${docId}.txt`,
    sha256Raw: sha256Hex(`raw:${text(docId)}`),
    sha256Normalized: sha256Hex(text(docId)),
    normalizerVersion: '1.0.0',
    contentSelector: null,
    artefactAuthenticity: over.artefactAuthenticity ?? 'official_consolidation',
    nonOperativeSections: over.nonOperativeSections ?? [],
    edges,
  };
}

export function edge(edgeId: string, kind: CorpusEdge['kind'], from: string, to: string): CorpusEdge {
  return { edgeId, kind, from, to, provenance: { type: 'human', source: 'fixture', recordedOn: '2026-09-05' } };
}

/**
 *   DOC-RM [911]      ──amendedBy──▶  DOC-RN [912, 913]   ← mixed: one adopted source
 *   DOC-RQ [914]      ──amendedBy──▶  DOC-RP [915, 916]   ← all in force
 *   DOC-RQ            ──references─▶  DOC-RN              ← the reference branch
 */
export function worldIndex(over: Partial<Record<string, Partial<Parameters<typeof doc>[3]>>> = {}): CorpusIndex {
  return parseCorpusIndex({
    updated: '2026-09-05',
    documents: [
      doc('DOC-RM', ['SRC-911'], [edge('E-RM-RN', 'amendedBy', 'DOC-RM', 'DOC-RN')], over['DOC-RM']),
      doc('DOC-RN', ['SRC-912', 'SRC-913'], [], over['DOC-RN']),
      doc('DOC-RQ', ['SRC-914'], [edge('E-RQ-RP', 'amendedBy', 'DOC-RQ', 'DOC-RP'), edge('E-RQ-RN', 'references', 'DOC-RQ', 'DOC-RN')], over['DOC-RQ']),
      doc('DOC-RP', ['SRC-915', 'SRC-916'], [], over['DOC-RP']),
    ],
  });
}

/** The pack half: standing per instrument, parsed through the production source schema. */
export function worldPack(standing: Record<string, TemporalStanding | undefined> = STANDING): Pick<KnowledgePack, 'sources'> {
  return {
    sources: Object.keys(STANDING).map((id) =>
      sourceRecordSchema.parse({
        id,
        title: `Instrument ${id}`,
        legalType: 'fixture instrument',
        ...(standing[id] === undefined ? {} : { temporalStanding: standing[id] }),
        usedFor: 'fixture',
        url: `https://example.invalid/${id}`,
      }),
    ),
  };
}

export function worldRegister(): SourceRegister {
  const ids = Object.keys(STANDING);
  return {
    program: 'FIXTURE',
    updated: '2026-09-05',
    governingAuthorities: ids.map((sourceId) => ({ sourceId, tier: 'legal_record', rationale: 'Fixture: the legal record.' })),
    authorisedOrigins: [
      { sourceId: 'SRC-911', origins: [{ kind: 'exact', url: 'https://example.invalid/DOC-RM' }], rationale: 'fixture' },
      { sourceId: 'SRC-912', origins: [{ kind: 'exact', url: 'https://example.invalid/DOC-RN' }], rationale: 'fixture' },
      { sourceId: 'SRC-913', origins: [{ kind: 'exact', url: 'https://example.invalid/DOC-RN' }], rationale: 'fixture' },
      { sourceId: 'SRC-914', origins: [{ kind: 'exact', url: 'https://example.invalid/DOC-RQ' }], rationale: 'fixture' },
      { sourceId: 'SRC-915', origins: [{ kind: 'exact', url: 'https://example.invalid/DOC-RP' }], rationale: 'fixture' },
      { sourceId: 'SRC-916', origins: [{ kind: 'exact', url: 'https://example.invalid/DOC-RP' }], rationale: 'fixture' },
    ],
    sources: [],
  } as unknown as SourceRegister;
}

export function capabilityOver(index: CorpusIndex): CorpusCapability {
  const byId = new Map(index.documents.map((d) => [d.docId, d]));
  return {
    index,
    document: (docId) => {
      const d = byId.get(docId);
      if (d === undefined) throw new Error(`world holds no ${docId}`);
      return d;
    },
    normalizedText: (docId) => text(docId),
  };
}

export function authorised(index = worldIndex(), pack = worldPack()): AuthorisedCorpus {
  return authoriseCorpus(capabilityOver(index), worldRegister(), pack as KnowledgePack);
}

export const MIXED = ['SRC-911'];
export const INFORCE = ['SRC-914'];
export const DIRECT = ['SRC-912'];

export function closureOf(cites: string[], index = worldIndex(), pack = worldPack(), policy: ClosurePolicy = CLOSURE_POLICY_V1): EntitledClosure {
  return EntitledClosure.forSources(authorised(index, pack), worldRegister(), pack, cites, policy);
}

