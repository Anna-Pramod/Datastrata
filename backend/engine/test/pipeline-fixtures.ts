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
import { authoriseCorpus, type AuthorisedCorpus } from '../src/corpus/authority';
import { pinnedStandingFor, standingMapFor, type StandingMap } from '../src/corpus/standing';
import type { PinnedSourceStanding } from '../src/pipeline/entitlement';
import type { SourceRegister } from '../src/monitoring/types';
import type { KnowledgePack } from '../src/types';
import { requirementSchema } from '../src/knowledge/schema';
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
    artefactAuthenticity: 'official_consolidation',
    nonOperativeSections: [],
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
 *   DOC-D and DOC-Z are the two outside DOC-A's closure, and DOC-D is left
 *   **deliberately unsourced** (`serves: []`) where its three siblings are not.
 *   That is the split this corpus exists to show: the corpus may hold an
 *   artefact that names no source, and such an artefact may simply never become
 *   evidence. It is safe only because DOC-D is outside every closure built here
 *   — widening `referenceDepth` to 2 in a new test would reach it and refuse
 *   with `no served source`, which would be the guard working, not a bug. Give
 *   it a source (and an origin row) before widening.
 *
 *     DOC-Z   in the corpus, connected to nothing — also outside, and the
 *             case the entitlement refusal has always been tested against
 *
 * A document id the index does not hold at all is the `corpus_gap` case, and
 * `SRC-900`/`SRC-901` (served by nothing) are the empty-closure case.
 *
 * **It runs the real machinery.** This is a different `index.json`, not a
 * different code path: `docsForSources`, `computeClosure` and
 * `CLOSURE_POLICY_V1` are the production ones. A hand-rolled stand-in would
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
      // DOC-B and DOC-C serve sources of their *own*, not SRC-100: they must be
      // reached by traversal rather than selected as entry points, and they must
      // still be admissible as evidence. Since Task 5's closure guard, a
      // document inside a closure that names no source at all is refused — the
      // real corpus gives even its amending act an SRC record, so an unsourced
      // closure member models nothing.
      doc('DOC-B', [], ['SRC-101']),
      doc('DOC-C', [edge('E-3', 'references', 'DOC-C', 'DOC-D')], ['SRC-102']),
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

/**
 * The shared requirement fixture's authored content, before any override.
 *
 * `relationshipClass` and `severity` are the production enums' members, not
 * near-words. The fixture is a miniature of `CSRD-S-001` — the same
 * `legal_entity` scope, the same boolean kind, the same in-force status and
 * literally the same EUR 450m net-turnover threshold — so it is authored the
 * way that requirement is: a directly imposed legal test (`direct_legal`)
 * whose miss is a false all-clear on scope (`critical`). It carried `direct`
 * and `blocking` until Task 5b.1: neither is an enum member, and the cast
 * below hid that for as long as nothing took the fixture through
 * `requirementSchema`.
 */
const REQUIREMENT_BASE: AuthoredRequirement = {
  id: 'TEST-R-001',
  version: 1,
  title: 'Test requirement',
  program: 'TESTPROG',
  decisionArea: 'Test area',
  plainEnglish: 'A synthetic requirement used to exercise pin derivation.',
  scopeType: 'legal_entity',
  relationshipClass: 'direct_legal',
  severity: 'critical',
  kind: 'boolean',
  condition: { op: 'cmp', fact: 'entity.turnover', cmp: 'gt', value: 450_000_000 },
  legalStatus: 'in_force',
  provenance: [{ sourceId: 'SRC-100', locators: [{ kind: 'provision', text: 'Fixture Act Art. 1' }] }],
};

/**
 * Every shared fixture in this module that represents a `Requirement`, by the
 * name callers know it under. `pipeline-fixtures.test.ts` parses each one
 * through `requirementSchema`; a requirement fixture added here without being
 * listed is a fixture nothing validates, so add it in both places.
 */
export const SHARED_REQUIREMENT_FIXTURES: Readonly<Record<string, AuthoredRequirement>> = {
  fixtureRequirement: REQUIREMENT_BASE,
};

/**
 * The shared requirement fixture, optionally overridden.
 *
 * The base is parsed on every call rather than only in the fixture test, so
 * the gate sits at the call site: all nine consumers reach it, and it cannot
 * be bypassed by deleting a test. Overrides are deliberately *not* parsed —
 * `pipeline-reader.test.ts` hands in `sources: []` precisely to exercise the
 * refusal — so what this asserts is that the shared authored baseline every
 * caller starts from is a requirement the production schema accepts.
 */
/**
 * Provenance for a list of source ids, one generic locator each.
 *
 * Tests that only care *which* sources a requirement cites should say so
 * without restating the locator shape; tests that care about locators build
 * them literally.
 */
export function citing(...sourceIds: string[]): AuthoredRequirement['provenance'] {
  return sourceIds.map((sourceId) => ({
    sourceId,
    // Neutral locator text: it must not encode its own source id. A locator
    // carrying `SRC-NNN` would make any reader-blindness assertion written over
    // a `citing()` fixture red for the locator's own spelling rather than for
    // the leak it means to detect.
    locators: [{ kind: 'provision' as const, text: 'Article 1' }],
  }));
}

export function fixtureRequirement(
  overrides: Partial<AuthoredRequirement> = {},
): AuthoredRequirement {
  requirementSchema.parse(REQUIREMENT_BASE);
  return { ...REQUIREMENT_BASE, ...overrides };
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

/**
 * A structurally valid bidirectional table over placeholder material.
 *
 * Both directions are present because Task 3 refuses a one-directional table,
 * and every cell is `MAPPED` between the placeholder reading element and the
 * fixture requirement's only condition address. It is a judgment of nothing: it
 * says a placeholder statement corresponds to a placeholder encoding, which is
 * true of any two placeholders and says nothing about any law. It exists so the
 * seam, the transcript and the tail have a well-formed table to carry.
 *
 * The ids default to the fixture reading's element and the fixture
 * requirement's single atom address (`root`, from `conditionPathsFor`), and are
 * overridable so a caller over a different requirement can address its own.
 */
export function stubProsecutorOutput(
  lens: string,
  address: { readingElementId?: string; conditionPath?: string } = {},
): ProsecutorOutput {
  const readingElementId = address.readingElementId ?? 'RE-STUB';
  const conditionPath = address.conditionPath ?? 'root';
  return {
    lens,
    coverage: [
      { direction: 'reading_to_condition', readingElementId, conditionPath, verdict: 'MAPPED' },
      { direction: 'condition_to_reading', conditionPath, readingElementId, verdict: 'MAPPED' },
    ],
    challenges: [],
    gaps: [],
  };
}

export function stubAdjudicatorOutput(): AdjudicatorOutput {
  return { adjudications: [], gaps: [] };
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

/**
 * The lens a prosecutor request was actually handed, read off the request.
 *
 * Read from the rendered input rather than from a configuration this fixture
 * also holds, so a stub answers under whatever lens the run under test
 * configured — for any count and any lens set. A stub with its own idea of the
 * lens would make `assertEveryLensRan` a check against the fixture rather than
 * against the configuration.
 */
export function lensFromRequest(request: RoleRequest): string {
  const rendered = request.messages.find((message) => message.from === 'input')?.content ?? '';
  const match = /^# Lens\n\n(.+)$/m.exec(rendered);
  if (match?.[1] === undefined) {
    throw new Error(`prosecutor[${request.index}] was sent no lens heading; the stub cannot echo one`);
  }
  return match[1];
}

/** The default stub: structurally valid placeholders for all three roles. */
export function placeholderRunner(lensFor?: (index: number) => string): StubRunner {
  return stubRunner((request) => {
    switch (request.role) {
      case 'reader':
        return JSON.stringify(stubReaderOutput());
      case 'prosecutor':
        return JSON.stringify(
          stubProsecutorOutput(
            lensFor === undefined ? lensFromRequest(request) : lensFor(request.index),
          ),
        );
      case 'adjudicator':
        return JSON.stringify(stubAdjudicatorOutput());
    }
  });
}

/**
 * The fixture corpus, authorised the way production authorises one.
 *
 * `EntitledClosure.forSources` requires an `AuthorisedCorpus`, and there is no
 * unchecked test-only constructor: a bypass that exists for tests is one
 * production eventually imitates. So fixtures run the same validator over
 * synthetic declarations.
 *
 * **The declarations are written out, not derived from the corpus.** Deriving
 * "whatever this index claims" would authorise anything and pass always, which
 * is a validator in name only. Written out, a fixture that changes a document's
 * `url` or `serves` stops being authorised — which is the correct answer, and
 * the reason this builder is worth having.
 */
const FIXTURE_AUTHORISED_ORIGINS = [
  {
    sourceId: 'SRC-100',
    origins: [{ kind: 'exact' as const, url: 'https://example.invalid/DOC-A' }],
    rationale: 'Fixture: DOC-A is the only artefact SRC-100 has authorised.',
  },
  {
    sourceId: 'SRC-999',
    origins: [{ kind: 'exact' as const, url: 'https://example.invalid/DOC-Z' }],
    rationale: 'Fixture: DOC-Z is the only artefact SRC-999 has authorised.',
  },
  {
    sourceId: 'SRC-101',
    origins: [{ kind: 'exact' as const, url: 'https://example.invalid/DOC-B' }],
    rationale: 'Fixture: DOC-B is the only artefact SRC-101 has authorised.',
  },
  {
    sourceId: 'SRC-102',
    origins: [{ kind: 'exact' as const, url: 'https://example.invalid/DOC-C' }],
    rationale: 'Fixture: DOC-C is the only artefact SRC-102 has authorised.',
  },
];

/**
 * A pack carrying exactly the sources the fixture corpus claims, each with a
 * temporal standing: since B-E2 a served source without one is refused at
 * closure construction, so a fixture world that omitted them would model a
 * state no production closure can be built over. All in force, so every
 * existing traversal expectation in this world is unchanged.
 */
export function fixtureSourceUniverse(): KnowledgePack {
  return {
    sources: [
      { id: 'SRC-100', temporalStanding: 'in_force' },
      { id: 'SRC-999', temporalStanding: 'in_force' },
      { id: 'SRC-101', temporalStanding: 'in_force' },
      { id: 'SRC-102', temporalStanding: 'in_force' },
    ],
  } as unknown as KnowledgePack;
}

/**
 * A raw `Closure` in the shape `producePins` takes, with the standing of every
 * member's served sources — what `EntitledClosure.pinInput` hands over, for the
 * tests that compute closures directly.
 */
export function pinInputFor(
  closure: { sha256: string; docIds: readonly string[] },
  standing: StandingMap = fixtureStanding(),
): { sha256: string; docIds: readonly string[]; sourcesStanding: ReadonlyMap<string, readonly PinnedSourceStanding[]> } {
  return {
    sha256: closure.sha256,
    docIds: closure.docIds,
    sourcesStanding: new Map(closure.docIds.map((docId) => [docId, pinnedStandingFor(standing, docId)])),
  };
}

/** The standing map `computeClosure` needs over the fixture index, derived the production way. */
export function fixtureStanding(index: CorpusIndex = fixtureIndex()): StandingMap {
  return standingMapFor(index, fixtureSourceUniverse());
}

/** A register declaring the fixture origins, and nothing else. */
export function fixtureRegister(): SourceRegister {
  return {
    program: 'FIXTURE',
    updated: '2026-08-27',
    // Both fixture sources are classified, and citably: a fixture corpus stands
    // in for a real one, and since Task 5 a document may only become
    // model-facing evidence if every source it serves has an explicit citable
    // governing authority. Leaving these out would model a world no production
    // closure may be built over, and every downstream fixture would refuse.
    governingAuthorities: [
      { sourceId: 'SRC-100', tier: 'legal_record', rationale: 'Fixture: the legal record.' },
      { sourceId: 'SRC-999', tier: 'legal_record', rationale: 'Fixture: the legal record.' },
      { sourceId: 'SRC-101', tier: 'legal_record', rationale: 'Fixture: the legal record.' },
      { sourceId: 'SRC-102', tier: 'legal_record', rationale: 'Fixture: the legal record.' },
    ],
    authorisedOrigins: FIXTURE_AUTHORISED_ORIGINS,
    sources: [],
  } as unknown as SourceRegister;
}

/** The fixture corpus, run through the production validator. */
export function fixtureAuthorisedCorpus(
  corpus: ReturnType<typeof fixtureCorpus> = fixtureCorpus(),
): ReturnType<typeof fixtureCorpus> & AuthorisedCorpus {
  return authoriseCorpus(corpus, fixtureRegister(), fixtureSourceUniverse()) as ReturnType<
    typeof fixtureCorpus
  > &
    AuthorisedCorpus;
}
