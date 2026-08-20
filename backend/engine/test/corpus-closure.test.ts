/**
 * The closure is what an agent is entitled to read and what a signature pins.
 * Two properties matter most: the amended form of a document reached at
 * reference depth 1 is still inside (otherwise the reader gets obsolete law),
 * and the hash covers edge provenance (otherwise a relationship claim can be
 * rewritten with every document byte-identical and nothing goes stale).
 */

import { describe, expect, it } from 'vitest';
import { parseCorpusIndex } from '../src/corpus/schema';
import { CLOSURE_POLICY_V0, computeClosure, docsForSources } from '../src/corpus/closure';
import type { CorpusDocument, CorpusEdge, CorpusIndex } from '../src/corpus/types';

let seq = 0;

function doc(docId: string, edges: CorpusEdge[] = [], serves: string[] = []): CorpusDocument {
  seq += 1;
  return {
    docId,
    serves,
    title: docId,
    url: `https://eur-lex.europa.eu/eli/dir/2013/34/oj/eng#${docId}`,
    versionLabel: 'v1',
    retrievedOn: '2026-08-20',
    rawPath: `raw/${docId}-${seq}.html`,
    normalizedPath: `normalized/${docId}-${seq}.txt`,
    sha256Raw: 'a'.repeat(64),
    sha256Normalized: 'b'.repeat(64),
    normalizerVersion: '1.0.0',
    edges,
  };
}

function edge(
  edgeId: string,
  kind: CorpusEdge['kind'],
  from: string,
  to: string,
  provSource = 'CELEX metadata',
): CorpusEdge {
  return {
    edgeId,
    kind,
    from,
    to,
    provenance: { type: 'celex_metadata', source: provSource, recordedOn: '2026-08-20' },
  };
}

const index = (documents: CorpusDocument[]): CorpusIndex =>
  parseCorpusIndex({ updated: '2026-08-20', documents });

describe('docsForSources', () => {
  it('maps SRC ids to the documents that serve them', () => {
    const idx = index([doc('DOC-A', [], ['SRC-001']), doc('DOC-B', [], ['SRC-004'])]);
    expect(docsForSources(idx, ['SRC-004'])).toEqual(['DOC-B']);
  });

  it('returns each document once even when it serves several sources', () => {
    const idx = index([doc('DOC-A', [], ['SRC-001', 'SRC-004'])]);
    expect(docsForSources(idx, ['SRC-001', 'SRC-004'])).toEqual(['DOC-A']);
  });

  it('returns nothing for a source no document serves', () => {
    const idx = index([doc('DOC-A', [], ['SRC-001'])]);
    expect(docsForSources(idx, ['SRC-999'])).toEqual([]);
  });
});

describe('computeClosure', () => {
  it('includes the entry document', () => {
    const idx = index([doc('DOC-A')]);
    expect(computeClosure(idx, ['DOC-A']).docIds).toEqual(['DOC-A']);
  });

  it('follows structural edges to fixpoint', () => {
    const idx = index([
      doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B')]),
      doc('DOC-B', [edge('E2', 'amendedBy', 'DOC-B', 'DOC-C')]),
      doc('DOC-C'),
    ]);
    expect(computeClosure(idx, ['DOC-A']).docIds).toEqual(['DOC-A', 'DOC-B', 'DOC-C']);
  });

  it('follows structural edges in reverse, because an amending act is needed from either end', () => {
    const idx = index([doc('DOC-A'), doc('DOC-B', [edge('E1', 'amends', 'DOC-B', 'DOC-A')])]);
    expect(computeClosure(idx, ['DOC-A']).docIds).toEqual(['DOC-A', 'DOC-B']);
  });

  it('follows a references edge to depth 1', () => {
    const idx = index([doc('DOC-A', [edge('E1', 'references', 'DOC-A', 'DOC-B')]), doc('DOC-B')]);
    expect(computeClosure(idx, ['DOC-A']).docIds).toEqual(['DOC-A', 'DOC-B']);
  });

  it('does not follow a references edge to depth 2', () => {
    const idx = index([
      doc('DOC-A', [edge('E1', 'references', 'DOC-A', 'DOC-B')]),
      doc('DOC-B', [edge('E2', 'references', 'DOC-B', 'DOC-C')]),
      doc('DOC-C'),
    ]);
    expect(computeClosure(idx, ['DOC-A']).docIds).toEqual(['DOC-A', 'DOC-B']);
  });

  it('does not follow references backwards', () => {
    // Every document that cites an instrument is not part of reading it.
    const idx = index([doc('DOC-A'), doc('DOC-B', [edge('E1', 'references', 'DOC-B', 'DOC-A')])]);
    expect(computeClosure(idx, ['DOC-A']).docIds).toEqual(['DOC-A']);
  });

  it('includes the amended form of a document reached at reference depth 1', () => {
    // The rule that makes depth 1 usable: structural edges do not increment,
    // so Y' is reachable from Y even though Y itself cost the only hop.
    const idx = index([
      doc('DOC-A', [edge('E1', 'references', 'DOC-A', 'DOC-Y')]),
      doc('DOC-Y', [edge('E2', 'amendedBy', 'DOC-Y', 'DOC-Y-PRIME')]),
      doc('DOC-Y-PRIME'),
    ]);
    expect(computeClosure(idx, ['DOC-A']).docIds).toEqual(['DOC-A', 'DOC-Y', 'DOC-Y-PRIME']);
  });

  it('reaches a document by its shortest path, not its first', () => {
    // DOC-C is reachable at reference depth 2 via B, and at depth 1 directly.
    const idx = index([
      doc('DOC-A', [
        edge('E1', 'references', 'DOC-A', 'DOC-B'),
        edge('E2', 'references', 'DOC-A', 'DOC-C'),
      ]),
      doc('DOC-B', [edge('E3', 'references', 'DOC-B', 'DOC-C')]),
      doc('DOC-C', [edge('E4', 'amendedBy', 'DOC-C', 'DOC-D')]),
      doc('DOC-D'),
    ]);
    expect(computeClosure(idx, ['DOC-A']).docIds).toEqual(['DOC-A', 'DOC-B', 'DOC-C', 'DOC-D']);
  });

  it('lists edges whose endpoints are both inside the closure', () => {
    const idx = index([
      doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B')]),
      doc('DOC-B'),
      doc('DOC-OUT', [edge('E2', 'references', 'DOC-OUT', 'DOC-A')]),
    ]);
    expect(computeClosure(idx, ['DOC-A']).edgeIds).toEqual(['E1']);
  });
});

describe('closure hash', () => {
  it('is stable across runs', () => {
    const idx = index([doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B')]), doc('DOC-B')]);
    expect(computeClosure(idx, ['DOC-A']).sha256).toBe(computeClosure(idx, ['DOC-A']).sha256);
  });

  it('is unchanged by ingesting an unrelated document', () => {
    const base = index([doc('DOC-A'), doc('DOC-B')]);
    const grown = index([doc('DOC-A'), doc('DOC-B'), doc('DOC-UNRELATED')]);
    expect(computeClosure(grown, ['DOC-A']).sha256).toBe(computeClosure(base, ['DOC-A']).sha256);
  });

  it('changes when an amendedBy edge is added to an entry document', () => {
    const before = index([doc('DOC-A'), doc('DOC-B')]);
    const after = index([doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B')]), doc('DOC-B')]);
    expect(computeClosure(after, ['DOC-A']).sha256).not.toBe(computeClosure(before, ['DOC-A']).sha256);
  });

  it('changes when a document inside the closure changes text', () => {
    const before = index([doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B')]), doc('DOC-B')]);
    const movedDoc = doc('DOC-B');
    movedDoc.sha256Normalized = 'c'.repeat(64);
    const after = index([doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B')]), movedDoc]);
    expect(computeClosure(after, ['DOC-A']).sha256).not.toBe(computeClosure(before, ['DOC-A']).sha256);
  });

  it('changes when an edge is retyped with every document byte-identical', () => {
    const before = index([doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B')]), doc('DOC-B')]);
    const after = index([doc('DOC-A', [edge('E1', 'references', 'DOC-A', 'DOC-B')]), doc('DOC-B')]);
    expect(computeClosure(after, ['DOC-A']).sha256).not.toBe(computeClosure(before, ['DOC-A']).sha256);
  });

  it('changes when edge provenance is rewritten with every document byte-identical', () => {
    // The hole this closes: a relationship claim can be re-sourced or relabelled
    // without any text moving, and the entitlement basis would silently differ.
    const before = index([
      doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B', 'CELEX metadata')]),
      doc('DOC-B'),
    ]);
    const after = index([
      doc('DOC-A', [edge('E1', 'amendedBy', 'DOC-A', 'DOC-B', 'someone said so')]),
      doc('DOC-B'),
    ]);
    expect(computeClosure(after, ['DOC-A']).sha256).not.toBe(computeClosure(before, ['DOC-A']).sha256);
  });
});

describe('closure policy', () => {
  it('bounds references at depth 1 by default', () => {
    expect(CLOSURE_POLICY_V0.referenceDepth).toBe(1);
  });

  it('honours a deeper reference bound when one is supplied', () => {
    const idx = index([
      doc('DOC-A', [edge('E1', 'references', 'DOC-A', 'DOC-B')]),
      doc('DOC-B', [edge('E2', 'references', 'DOC-B', 'DOC-C')]),
      doc('DOC-C'),
    ]);
    const deeper = { ...CLOSURE_POLICY_V0, referenceDepth: 2 };
    expect(computeClosure(idx, ['DOC-A'], deeper).docIds).toEqual(['DOC-A', 'DOC-B', 'DOC-C']);
  });
});
