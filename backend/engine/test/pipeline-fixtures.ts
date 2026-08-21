/**
 * Shared fixtures for the B2 pipeline tests.
 *
 * **Nothing here is a reading, a challenge or an adjudication.** Task 1 builds
 * infrastructure and produces no judgments, real or faked, so the role outputs
 * below are structurally valid placeholders whose text says so in words. They
 * exist to exercise a seam, a transcript and a tail; they must never be
 * mistaken for, or promoted into, a fixture representing a real reading of any
 * law. Tasks 2–4 produce real role outputs, and Task 5's replay fixtures are
 * recorded from runs rather than written by hand.
 *
 * The corpus fixture is synthetic and program-agnostic for the same reason
 * `verification-render.test.ts`'s is: the properties under test are about
 * closure identity and pin derivation, not about any particular law.
 */

import { parseCorpusIndex } from '../src/corpus/schema';
import type { CorpusDocument, CorpusEdge, CorpusIndex } from '../src/corpus/types';
import { sha256Hex } from '../src/corpus/hash';
import type { AuthoredRequirement, FactType } from '../src/types';
import type { RenderContext } from '../src/verification/render';
import type { EntitlementSource } from '../src/pipeline/entitlement';
import type { CurrentCorpusSource } from '../src/verification/current-state';
import type { AgentRunner, RoleResponse } from '../src/pipeline/runner';
import type { RoleRequest } from '../src/pipeline/roles';
import type {
  AdjudicatorOutput,
  ProsecutorOutput,
  ReaderOutput,
} from '../src/pipeline/role-outputs';

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

/** Deterministic per-document text, so every hash below is reproducible. */
export function docText(docId: string): string {
  return `Synthetic legal text for ${docId}. Article 1. The operative test is stated here.`;
}

function doc(docId: string, edges: CorpusEdge[] = [], serves: string[] = []): CorpusDocument {
  const text = docText(docId);
  return {
    docId,
    serves,
    title: `Document ${docId}`,
    url: `https://example.invalid/${docId}`,
    versionLabel: 'consolidated 1 Jan 2026',
    retrievedOn: '2026-08-21',
    rawPath: `raw/${docId}.html`,
    normalizedPath: `normalized/${docId}.txt`,
    sha256Raw: sha256Hex(`raw:${text}`),
    sha256Normalized: sha256Hex(text),
    normalizerVersion: '1.0.0',
    contentSelector: null,
    edges,
  };
}

function edge(edgeId: string, kind: CorpusEdge['kind'], from: string, to: string): CorpusEdge {
  return {
    edgeId,
    kind,
    from,
    to,
    provenance: { type: 'celex_metadata', source: 'fixture metadata', recordedOn: '2026-08-21' },
  };
}

/**
 * A corpus with an outside, which the real one does not have.
 *
 * Every requirement in the real corpus closes over both documents it holds, so
 * "the reader read only the entitled closure" is *vacuously* true there and
 * `closure_gap` cannot occur at all — there is no document outside any closure
 * to fail to reach. Both properties therefore have to be exercised here, and
 * this index is shaped to make each of the three outcomes reachable:
 *
 *     DOC-A   serves SRC-100; the entry document
 *     DOC-B   amendedBy from DOC-A — structural, free, inside
 *     DOC-C   one `references` hop from DOC-A — depth 1, inside
 *     DOC-D   one further `references` hop from DOC-C — depth 2, and the
 *             reference-depth bound is 1, so the corpus holds it and the
 *             traversal policy does not entitle it: a `closure_gap`
 *     DOC-Z   in the corpus, connected to nothing — also outside, and the
 *             case the entitlement refusal has always been tested against
 *
 * A document id the index does not hold at all is the `corpus_gap` case, and
 * `SRC-900`/`SRC-901` (served by nothing) are the empty-closure case.
 *
 * **It runs the real machinery.** This is a different `index.json`, not a
 * different code path: `docsForSources`, `computeClosure` and
 * `CLOSURE_POLICY_V0` are the production ones. A hand-rolled stand-in would
 * make these tests prove things about test code.
 *
 * DOC-D changes no existing closure hash: the SRC-100 closure is still
 * {DOC-A, DOC-B, DOC-C}, and E-3 is excluded from the hash because one of its
 * endpoints sits outside.
 */
export function fixtureIndex(): CorpusIndex {
  return parseCorpusIndex({
    updated: '2026-08-21',
    documents: [
      doc('DOC-A', [edge('E-1', 'amendedBy', 'DOC-A', 'DOC-B'), edge('E-2', 'references', 'DOC-A', 'DOC-C')], ['SRC-100']),
      doc('DOC-B'),
      doc('DOC-C', [edge('E-3', 'references', 'DOC-C', 'DOC-D')]),
      doc('DOC-D'),
      doc('DOC-Z', [], ['SRC-999']),
    ],
  });
}

/** A document id the fixture corpus does not hold — the `corpus_gap` case. */
export const NOT_INGESTED = 'DOC-NOT-INGESTED';

/** Sources the fixture corpus serves with nothing — the empty-closure case. */
export const UNSERVED_SOURCE_IDS: readonly string[] = ['SRC-900', 'SRC-901'];

/** Satisfies both `EntitlementSource` and `CurrentCorpusSource`. */
export function fixtureCorpus(index: CorpusIndex = fixtureIndex()): EntitlementSource & CurrentCorpusSource {
  const byId = new Map(index.documents.map((document) => [document.docId, document]));
  return {
    index,
    document(docId: string): CorpusDocument {
      const document = byId.get(docId);
      if (document === undefined) throw new Error(`fixture corpus holds no ${docId}`);
      return document;
    },
    normalizedText(docId: string): string {
      return docText(docId);
    },
  };
}

// ---------------------------------------------------------------------------
// Requirement and render context
// ---------------------------------------------------------------------------

const FACT_TYPES: FactType[] = [
  {
    id: 'entity.turnover',
    scopeType: 'legal_entity',
    dataType: 'number_or_range',
    module: 'Test module',
    reusableAcrossPrograms: 'yes',
    label: 'net turnover',
    unit: 'EUR',
  },
];

export function fixtureRenderContext(): RenderContext {
  return { factTypes: FACT_TYPES, catalogues: {} };
}

export function fixtureRequirement(
  overrides: Partial<AuthoredRequirement> = {},
): AuthoredRequirement {
  return {
    id: 'TEST-R-001',
    version: 1,
    title: 'Test requirement',
    program: 'TESTPROG',
    decisionArea: 'Test area',
    plainEnglish: 'A synthetic requirement used to exercise pin derivation.',
    scopeType: 'legal_entity',
    relationshipClass: 'direct',
    severity: 'blocking',
    kind: 'boolean',
    condition: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450_000_000 },
    legalStatus: 'in_force',
    sources: ['SRC-100'],
    provisions: 'Fixture Act Art. 1',
    ...overrides,
  } as AuthoredRequirement;
}

// ---------------------------------------------------------------------------
// Placeholder role outputs — structurally valid, and judgments of nothing
// ---------------------------------------------------------------------------

const PLACEHOLDER = 'PLACEHOLDER — Task 1 produces no readings, challenges or adjudications.';

export function stubReaderOutput(): ReaderOutput {
  return {
    elements: [
      {
        id: 'RE-STUB',
        statement: PLACEHOLDER,
        evidence: [
          {
            kind: 'quote',
            docId: 'DOC-A',
            sha256Normalized: sha256Hex(docText('DOC-A')),
            text: 'The operative test is stated here.',
          },
        ],
      },
    ],
    gaps: [],
  };
}

export function stubProsecutorOutput(lens: string): ProsecutorOutput {
  return { lens, coverage: [], challenges: [], gaps: [] };
}

export function stubAdjudicatorOutput(): AdjudicatorOutput {
  return { adjudications: [], openQuestions: [], gaps: [] };
}

// ---------------------------------------------------------------------------
// A runner that replays canned text, and records what it was asked
// ---------------------------------------------------------------------------

export interface StubRunner extends AgentRunner {
  readonly requests: RoleRequest[];
}

/**
 * Answers each role with the JSON it is given, and remembers every request.
 *
 * The recording half matters: several checks below are negative — "no live call
 * happened", "the tail read no pin off a role" — and a negative observation
 * needs something observing, or it passes because nothing ever ran.
 */
export function stubRunner(
  responses: (request: RoleRequest) => string,
): StubRunner {
  const requests: RoleRequest[] = [];
  return {
    kind: 'replay',
    requests,
    run(request: RoleRequest): Promise<RoleResponse> {
      requests.push(request);
      return Promise.resolve({ outputJson: responses(request) });
    },
  };
}

/** The default stub: structurally valid placeholders for all three roles. */
export function placeholderRunner(lensFor: (index: number) => string = () => 'stub_lens'): StubRunner {
  return stubRunner((request) => {
    switch (request.role) {
      case 'reader':
        return JSON.stringify(stubReaderOutput());
      case 'prosecutor':
        return JSON.stringify(stubProsecutorOutput(lensFor(request.index)));
      case 'adjudicator':
        return JSON.stringify(stubAdjudicatorOutput());
    }
  });
}
