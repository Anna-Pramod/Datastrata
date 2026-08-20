/**
 * Ingest is the only door to the network, so everything downstream of the
 * received bytes is tested here from fixtures: bytes to normalization to
 * hashing to a valid index entry. The fetch itself is not tested, because a
 * network response is not reproducible — which is exactly why the chain below
 * it must be.
 */

import { describe, expect, it } from 'vitest';
import { buildDocumentEntry, mergeIntoIndex, type IngestInput } from '../src/cli/ingest';
import { parseCorpusIndex, verifyCorpusIntegrity } from '../src/corpus/schema';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import type { CorpusIndex } from '../src/corpus/types';

const RAW = '<p>Article 19a: net turnover of EUR&nbsp;450 000 000</p>';

function input(over: Partial<IngestInput> = {}): IngestInput {
  return {
    docId: 'DOC-32013L0034-C-20260318',
    slug: '32013L0034-c-20260318',
    serves: ['SRC-001'],
    title: 'Directive 2013/34/EU — consolidated text of 18 March 2026',
    url: 'https://eur-lex.europa.eu/eli/dir/2013/34/2026-03-18/eng',
    versionLabel: 'consolidated 18 Mar 2026',
    retrievedOn: '2026-08-20',
    rawText: RAW,
    edges: [],
    ...over,
  };
}

const emptyIndex = (): CorpusIndex => ({ updated: '2026-08-20', documents: [] });

describe('buildDocumentEntry', () => {
  it('produces an entry that passes the schema', () => {
    const { entry } = buildDocumentEntry(input());
    expect(() => parseCorpusIndex({ updated: '2026-08-20', documents: [entry] })).not.toThrow();
  });

  it('hashes the raw bytes as received', () => {
    const { entry } = buildDocumentEntry(input());
    expect(entry.sha256Raw).toBe(sha256Hex(RAW));
  });

  it('hashes the normalized form the normalizer produces', () => {
    const { entry, normalizedText } = buildDocumentEntry(input());
    expect(normalizedText).toBe(normalize(RAW));
    expect(entry.sha256Normalized).toBe(sha256Hex(normalize(RAW)));
  });

  it('stamps the normalizer version that produced the text', () => {
    const { entry } = buildDocumentEntry(input());
    expect(entry.normalizerVersion).toBe(NORMALIZER_VERSION);
  });

  it('derives both paths from the slug', () => {
    const { entry } = buildDocumentEntry(input({ slug: 'abc' }));
    expect(entry.rawPath).toBe('raw/abc.html');
    expect(entry.normalizedPath).toBe('normalized/abc.txt');
  });

  it('carries supplied edges through unchanged', () => {
    const { entry } = buildDocumentEntry(
      input({
        edges: [
          {
            edgeId: 'EDGE-1',
            kind: 'amendedBy',
            from: 'DOC-32013L0034-C-20260318',
            to: 'DOC-32026L0470',
            provenance: { type: 'celex_metadata', source: 'CELEX amended-by', recordedOn: '2026-08-20' },
          },
        ],
      }),
    );
    expect(entry.edges).toHaveLength(1);
    expect(entry.edges[0]?.provenance.type).toBe('celex_metadata');
  });

  it('rejects an edge whose provenance is incomplete', () => {
    expect(() =>
      buildDocumentEntry(
        input({
          edges: [
            {
              edgeId: 'EDGE-1',
              kind: 'amendedBy',
              from: 'DOC-32013L0034-C-20260318',
              to: 'DOC-32026L0470',
              provenance: { type: 'human', source: '', recordedOn: '2026-08-20' },
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it('rejects an edge that does not start at the document being ingested', () => {
    expect(() =>
      buildDocumentEntry(
        input({
          edges: [
            {
              edgeId: 'EDGE-1',
              kind: 'amendedBy',
              from: 'DOC-SOMETHING-ELSE',
              to: 'DOC-32026L0470',
              provenance: { type: 'human', source: 'read it', recordedOn: '2026-08-20' },
            },
          ],
        }),
      ),
    ).toThrow(/from/);
  });
});

describe('mergeIntoIndex', () => {
  it('adds a new document', () => {
    const { entry } = buildDocumentEntry(input());
    const merged = mergeIntoIndex(emptyIndex(), entry);
    expect(merged.documents).toHaveLength(1);
  });

  it('replaces an existing document with the same id rather than duplicating it', () => {
    const { entry } = buildDocumentEntry(input());
    const once = mergeIntoIndex(emptyIndex(), entry);
    const { entry: refetched } = buildDocumentEntry(input({ retrievedOn: '2026-09-01' }));
    const twice = mergeIntoIndex(once, refetched);
    expect(twice.documents).toHaveLength(1);
    expect(twice.documents[0]?.retrievedOn).toBe('2026-09-01');
  });

  it('keeps documents sorted by id so the file diffs cleanly', () => {
    const { entry: a } = buildDocumentEntry(input({ docId: 'DOC-B', slug: 'b' }));
    const { entry: b } = buildDocumentEntry(input({ docId: 'DOC-A', slug: 'a' }));
    const merged = mergeIntoIndex(mergeIntoIndex(emptyIndex(), a), b);
    expect(merged.documents.map((d) => d.docId)).toEqual(['DOC-A', 'DOC-B']);
  });

  it('produces an index that still passes integrity when edges resolve', () => {
    const { entry: target } = buildDocumentEntry(input({ docId: 'DOC-32026L0470', slug: 'omnibus' }));
    const { entry: base } = buildDocumentEntry(
      input({
        edges: [
          {
            edgeId: 'EDGE-1',
            kind: 'amendedBy',
            from: 'DOC-32013L0034-C-20260318',
            to: 'DOC-32026L0470',
            provenance: { type: 'celex_metadata', source: 'CELEX amended-by', recordedOn: '2026-08-20' },
          },
        ],
      }),
    );
    const merged = mergeIntoIndex(mergeIntoIndex(emptyIndex(), target), base);
    expect(() => verifyCorpusIntegrity(parseCorpusIndex(merged))).not.toThrow();
  });
});
