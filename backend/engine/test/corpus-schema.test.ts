/**
 * The corpus index is a content firewall like the source register: a malformed
 * row is a build failure, not a runtime surprise. An edge without provenance
 * is an unsourced legal claim, so the schema refuses it outright.
 */

import { describe, expect, it } from 'vitest';
import {
  CorpusIntegrityError,
  parseCorpusIndex,
  verifyCorpusIntegrity,
} from '../src/corpus/schema';
import type { CorpusDocument, CorpusEdge, CorpusIndex } from '../src/corpus/types';

function edge(over: Partial<CorpusEdge> = {}): CorpusEdge {
  return {
    edgeId: 'EDGE-A-amendedBy-B',
    kind: 'amendedBy',
    from: 'DOC-A',
    to: 'DOC-B',
    provenance: {
      type: 'celex_metadata',
      source: 'CELEX:32013L0034 amended-by relation',
      recordedOn: '2026-08-20',
    },
    ...over,
  };
}

function doc(over: Partial<CorpusDocument> = {}): CorpusDocument {
  return {
    docId: 'DOC-A',
    serves: ['SRC-001'],
    title: 'An instrument',
    url: 'https://eur-lex.europa.eu/eli/dir/2013/34/oj/eng',
    versionLabel: 'consolidated 18 Mar 2026',
    retrievedOn: '2026-08-20',
    rawPath: 'corpus/raw/a.html',
    normalizedPath: 'corpus/normalized/a.txt',
    sha256Raw: 'a'.repeat(64),
    sha256Normalized: 'b'.repeat(64),
    normalizerVersion: '1.0.0',
    contentSelector: null,
    edges: [],
    ...over,
  };
}

const index = (documents: CorpusDocument[]): CorpusIndex => ({
  updated: '2026-08-20',
  documents,
});

describe('corpus index schema', () => {
  it('accepts a well-formed index', () => {
    const parsed = parseCorpusIndex(index([doc()]));
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0]?.docId).toBe('DOC-A');
  });

  it('rejects a docId that does not follow DOC-*', () => {
    expect(() => parseCorpusIndex(index([doc({ docId: 'A' })]))).toThrow();
  });

  it('rejects an unknown key', () => {
    const bad = index([{ ...doc(), extra: true } as unknown as CorpusDocument]);
    expect(() => parseCorpusIndex(bad)).toThrow();
  });

  it('rejects an edge with no provenance', () => {
    const noProv = { ...edge() } as Partial<CorpusEdge>;
    delete noProv.provenance;
    const bad = index([doc({ edges: [noProv as CorpusEdge] })]);
    expect(() => parseCorpusIndex(bad)).toThrow();
  });

  it('rejects an edge with an unknown kind', () => {
    const bad = index([doc({ edges: [edge({ kind: 'supersedes' as CorpusEdge['kind'] })] })]);
    expect(() => parseCorpusIndex(bad)).toThrow();
  });

  it('rejects an edge whose from is not the document carrying it', () => {
    const bad = index([doc({ edges: [edge({ from: 'DOC-Z' })] })]);
    expect(() => parseCorpusIndex(bad)).toThrow(/from/);
  });

  it('rejects a non-ISO recordedOn', () => {
    const bad = index([doc({ edges: [edge({ provenance: { type: 'human', source: 'read it', recordedOn: '20 Aug 2026' } })] })]);
    expect(() => parseCorpusIndex(bad)).toThrow();
  });

  it('rejects a document missing contentSelector', () => {
    const noSelector = doc() as Partial<CorpusDocument>;
    delete noSelector.contentSelector;
    const bad = index([noSelector as CorpusDocument]);
    expect(() => parseCorpusIndex(bad)).toThrow();
  });

  it('accepts a document with contentSelector null', () => {
    const parsed = parseCorpusIndex(index([doc({ contentSelector: null })]));
    expect(parsed.documents[0]?.contentSelector).toBeNull();
  });

  it('accepts a document with a well-formed #id contentSelector', () => {
    const parsed = parseCorpusIndex(index([doc({ contentSelector: '#text' })]));
    expect(parsed.documents[0]?.contentSelector).toBe('#text');
  });

  it('rejects a contentSelector that is not a bare #id', () => {
    const bad = index([doc({ contentSelector: '.panel-body' })]);
    expect(() => parseCorpusIndex(bad)).toThrow();
  });
});

describe('corpus index integrity', () => {
  it('accepts an index whose edges all resolve', () => {
    const idx = parseCorpusIndex(
      index([doc({ edges: [edge()] }), doc({ docId: 'DOC-B', rawPath: 'corpus/raw/b.html', normalizedPath: 'corpus/normalized/b.txt' })]),
    );
    expect(() => verifyCorpusIntegrity(idx)).not.toThrow();
  });

  it('rejects an edge pointing at an unknown document', () => {
    const idx = parseCorpusIndex(index([doc({ edges: [edge({ to: 'DOC-MISSING' })] })]));
    expect(() => verifyCorpusIntegrity(idx)).toThrow(CorpusIntegrityError);
  });

  it('rejects a duplicate docId', () => {
    const idx = parseCorpusIndex(index([doc(), doc({ rawPath: 'corpus/raw/a2.html', normalizedPath: 'corpus/normalized/a2.txt' })]));
    expect(() => verifyCorpusIntegrity(idx)).toThrow(/duplicate document id/);
  });

  it('rejects a duplicate edgeId across documents', () => {
    const idx = parseCorpusIndex(
      index([
        doc({ edges: [edge()] }),
        doc({
          docId: 'DOC-B',
          rawPath: 'corpus/raw/b.html',
          normalizedPath: 'corpus/normalized/b.txt',
          edges: [edge({ from: 'DOC-B', to: 'DOC-A' })],
        }),
      ]),
    );
    expect(() => verifyCorpusIntegrity(idx)).toThrow(/duplicate edge id/);
  });

  it('rejects two documents sharing a file path', () => {
    const idx = parseCorpusIndex(index([doc(), doc({ docId: 'DOC-B' })]));
    expect(() => verifyCorpusIntegrity(idx)).toThrow(/path/);
  });

  it('rejects a cycle in the amendment graph', () => {
    const idx = parseCorpusIndex(
      index([
        doc({ edges: [edge({ edgeId: 'EDGE-1', kind: 'amendedBy', from: 'DOC-A', to: 'DOC-B' })] }),
        doc({
          docId: 'DOC-B',
          rawPath: 'corpus/raw/b.html',
          normalizedPath: 'corpus/normalized/b.txt',
          edges: [edge({ edgeId: 'EDGE-2', kind: 'amendedBy', from: 'DOC-B', to: 'DOC-A' })],
        }),
      ]),
    );
    expect(() => verifyCorpusIntegrity(idx)).toThrow(/cycle/);
  });

  it('does not treat the same relation stated from both ends as a cycle', () => {
    // "A is amended by B" and "B amends A" are one fact written twice.
    const idx = parseCorpusIndex(
      index([
        doc({ edges: [edge({ edgeId: 'EDGE-1', kind: 'amendedBy', from: 'DOC-A', to: 'DOC-B' })] }),
        doc({
          docId: 'DOC-B',
          rawPath: 'corpus/raw/b.html',
          normalizedPath: 'corpus/normalized/b.txt',
          edges: [edge({ edgeId: 'EDGE-2', kind: 'amends', from: 'DOC-B', to: 'DOC-A' })],
        }),
      ]),
    );
    expect(() => verifyCorpusIntegrity(idx)).not.toThrow();
  });
});
