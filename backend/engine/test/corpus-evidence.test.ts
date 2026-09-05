/**
 * The evidence checker is the anti-hallucination control. A quote that is not
 * in the document it names fails mechanically, so a dossier can be trusted
 * without re-reading the law. Absence is checkable too — by re-running the
 * search — but only lexically, so it can never stand alone.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import { loadCorpus, type LoadedCorpus } from '../src/corpus/store';
import { checkEvidenceSet, type EvidenceItem, type QuoteEvidence } from '../src/corpus/evidence';

const prov = { type: 'celex_metadata', source: 'CELEX', recordedOn: '2026-08-20' } as const;

/**
 * The amendment graph, canonically (amender -> amended): B -> A, C -> B,
 * B -> D, E -> D. Acyclic, so the index passes integrity.
 *
 * E1 and E2 are the two hops of a real chain, written in *different*
 * phrasings and carried by different endpoints on purpose: E1 is an
 * `amendedBy` carried by the amended document, E2 an `amends` carried by the
 * amending one. Both canonicalise to the same amender/amended direction.
 *
 * E6 shares a document with E1 (both have DOC-B as the amender) without
 * succeeding it -- the shape a shared-endpoint rule wrongly admits. E7 shares
 * nothing with E1. E3 and E4 are `references` edges: cross-reference evidence
 * needs one, and an amendment chain must refuse one.
 */
const EDGES: Record<string, unknown[]> = {
  'DOC-A': [
    { edgeId: 'E1', kind: 'amendedBy', from: 'DOC-A', to: 'DOC-B', provenance: prov },
    { edgeId: 'E3', kind: 'references', from: 'DOC-A', to: 'DOC-B', provenance: prov },
  ],
  'DOC-C': [
    { edgeId: 'E2', kind: 'amends', from: 'DOC-C', to: 'DOC-B', provenance: prov },
    { edgeId: 'E4', kind: 'references', from: 'DOC-C', to: 'DOC-D', provenance: prov },
  ],
  'DOC-D': [
    { edgeId: 'E6', kind: 'amendedBy', from: 'DOC-D', to: 'DOC-B', provenance: prov },
    { edgeId: 'E7', kind: 'amendedBy', from: 'DOC-D', to: 'DOC-E', provenance: prov },
  ],
};

const TEXT_A =
  'Article 19a\nUndertakings which, on their balance sheet dates, exceed a net turnover of EUR 450 000 000 and an average number of 1 000 employees during the financial year shall report.';
const TEXT_B = 'Directive (EU) 2026/470\nArticle 1(4)(a) substitutes the opening words of Article 19a(1).';
const TEXT_C = 'Directive (EU) 2027/999\nArticle 2 replaces the thresholds inserted by Directive (EU) 2026/470.';
const TEXT_D = 'Regulation (EU) 2020/852\nArticle 8 concerns taxonomy-aligned turnover and is unrelated to the chain above.';
const TEXT_E = 'Directive (EU) 2028/111\nArticle 3 revises the taxonomy reporting annex and touches nothing in Article 19a.';

let dir = '';
let corpus: LoadedCorpus;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'corpus-ev-'));
  mkdirSync(join(dir, 'raw'), { recursive: true });
  mkdirSync(join(dir, 'normalized'), { recursive: true });

  const docs = [
    { id: 'DOC-A', slug: 'a', text: TEXT_A },
    { id: 'DOC-B', slug: 'b', text: TEXT_B },
    { id: 'DOC-C', slug: 'c', text: TEXT_C },
    { id: 'DOC-D', slug: 'd', text: TEXT_D },
    { id: 'DOC-E', slug: 'e', text: TEXT_E },
  ];

  const documents = docs.map((d) => {
    const normalized = normalize(d.text);
    writeFileSync(join(dir, 'raw', `${d.slug}.txt`), d.text, 'utf8');
    writeFileSync(join(dir, 'normalized', `${d.slug}.txt`), normalized, 'utf8');
    return {
      docId: d.id,
      serves: ['SRC-001'],
      title: d.id,
      url: `https://eur-lex.europa.eu/eli/dir/2013/34/oj/eng#${d.slug}`,
      versionLabel: 'v1',
      retrievedOn: '2026-08-20',
      rawPath: `raw/${d.slug}.txt`,
      normalizedPath: `normalized/${d.slug}.txt`,
      sha256Raw: sha256Hex(d.text),
      sha256Normalized: sha256Hex(normalized),
      normalizerVersion: NORMALIZER_VERSION,
      contentSelector: null,
      artefactAuthenticity: 'official_consolidation',
      nonOperativeSections: [],
      // E1/E2 chain A -> B -> C. E3 is the references edge a cross_reference
      // needs. E4 hangs off DOC-C so a chain can be built out of two edges
      // that share no endpoint.
      edges: EDGES[d.id] ?? [],
    };
  });

  writeFileSync(
    join(dir, 'index.json'),
    JSON.stringify({ updated: '2026-08-20', documents }, null, 2),
    'utf8',
  );
  corpus = loadCorpus(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function quote(text: string, docId = 'DOC-A'): QuoteEvidence {
  return {
    kind: 'quote',
    docId,
    sha256Normalized: corpus.document(docId).sha256Normalized,
    text,
  };
}

describe('quote evidence', () => {
  it('accepts a quote present in the named document', () => {
    const result = checkEvidenceSet([quote('a net turnover of EUR 450 000 000')], corpus);
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('rejects a fabricated quote', () => {
    const result = checkEvidenceSet([quote('a net turnover of EUR 40 000 000')], corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/not found in DOC-A/);
  });

  it('rejects a quote attributed to the wrong document', () => {
    const result = checkEvidenceSet([quote('a net turnover of EUR 450 000 000', 'DOC-B')], corpus);
    expect(result.ok).toBe(false);
  });

  it('rejects a quote pinned to a hash the document no longer has', () => {
    const stale: QuoteEvidence = { ...quote('Article 19a'), sha256Normalized: 'f'.repeat(64) };
    const result = checkEvidenceSet([stale], corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/hash/);
  });

  it('rejects a quote naming a document not in the corpus', () => {
    const missing: QuoteEvidence = {
      kind: 'quote',
      docId: 'DOC-NOPE',
      sha256Normalized: 'a'.repeat(64),
      text: 'anything',
    };
    const result = checkEvidenceSet([missing], corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/DOC-NOPE/);
  });

  it('tolerates whitespace differences, because normalization already settled them', () => {
    const result = checkEvidenceSet([quote('a net turnover  of   EUR 450 000 000')], corpus);
    expect(result.ok).toBe(true);
  });

  it('rejects an empty quote', () => {
    const result = checkEvidenceSet([quote('   ')], corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/empty/);
  });
});

describe('absence evidence', () => {
  it('accepts a term genuinely absent, when something else supports the conclusion', () => {
    const items: EvidenceItem[] = [
      quote('a net turnover of EUR 450 000 000'),
      { kind: 'absence', docIds: ['DOC-A'], term: 'balance sheet total' },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(true);
  });

  it('rejects an absence claim whose term is present', () => {
    const items: EvidenceItem[] = [
      quote('Article 19a'),
      { kind: 'absence', docIds: ['DOC-A'], term: 'net turnover' },
    ];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/occurs in DOC-A/);
  });

  it('searches case-insensitively, so casing cannot hide an occurrence', () => {
    const items: EvidenceItem[] = [
      quote('Article 19a'),
      { kind: 'absence', docIds: ['DOC-A'], term: 'NET TURNOVER' },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(false);
  });

  it('rejects absence standing as the sole evidence for a conclusion', () => {
    // Lexical absence cannot establish that no economically equivalent
    // criterion exists under different words. That is a legal judgment.
    const items: EvidenceItem[] = [{ kind: 'absence', docIds: ['DOC-A'], term: 'balance sheet total' }];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/sole evidence/);
  });

  it('rejects absence over a document not in the corpus', () => {
    const items: EvidenceItem[] = [
      quote('Article 19a'),
      { kind: 'absence', docIds: ['DOC-NOPE'], term: 'anything' },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(false);
  });

  it('rejects an absence claim naming no documents', () => {
    const items: EvidenceItem[] = [quote('Article 19a'), { kind: 'absence', docIds: [], term: 'x' }];
    const result = checkEvidenceSet(items, corpus).problems;
    expect(result[0]).toMatch(/no documents/);
  });
});

describe('amendment chain evidence', () => {
  it('accepts a hop whose edge exists and whose quote checks', () => {
    const items: EvidenceItem[] = [
      {
        kind: 'amendment_chain',
        hops: [{ edgeId: 'E1', quote: quote('substitutes the opening words', 'DOC-B') }],
      },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(true);
  });

  it('accepts a single-hop chain, which is trivially oriented', () => {
    const items: EvidenceItem[] = [
      { kind: 'amendment_chain', hops: [{ edgeId: 'E2', quote: quote('replaces the thresholds', 'DOC-C') }] },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(true);
  });

  it('accepts a genuine multi-hop chain written in mixed phrasings', () => {
    // DOC-A amended by DOC-B (E1, an `amendedBy` carried by the amended
    // document), then DOC-B amended by DOC-C (E2, an `amends` carried by the
    // amending one). Canonically (amender B, amended A) then (amender C,
    // amended B): amended(hop2) === amender(hop1), consistently. Neither the
    // phrasing nor the carrying endpoint may change that verdict -- which is
    // what canonicalising the direction buys, and what a rule keyed on the raw
    // from/to pair would have got wrong.
    const items: EvidenceItem[] = [
      {
        kind: 'amendment_chain',
        hops: [
          { edgeId: 'E1', quote: quote('substitutes the opening words', 'DOC-B') },
          { edgeId: 'E2', quote: quote('replaces the thresholds', 'DOC-C') },
        ],
      },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(true);
  });

  it('rejects hops that share a document without succeeding one another', () => {
    // The shape connectivity alone admits: E1 is (amender B, amended A) and
    // E6 is (amender B, amended D). Both touch DOC-B, so they are connected --
    // but DOC-B is the amender in both, so nothing succeeds anything and this
    // is not a chain.
    const items: EvidenceItem[] = [
      {
        kind: 'amendment_chain',
        hops: [
          { edgeId: 'E1', quote: quote('substitutes the opening words', 'DOC-B') },
          { edgeId: 'E6', quote: quote('taxonomy-aligned turnover', 'DOC-D') },
        ],
      },
    ];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    const orientation = result.problems.find((p) => /does not continue the amendment chain/.test(p));
    expect(orientation).toBeDefined();
    expect(orientation).toMatch(/E6/);
    expect(orientation).toMatch(/E1/);
  });

  it('rejects a chain that changes direction part way along', () => {
    // Each junction on its own can be read as a succession, but not the same
    // way twice, so no single walk direction fits the whole chain.
    const items: EvidenceItem[] = [
      {
        kind: 'amendment_chain',
        hops: [
          { edgeId: 'E2', quote: quote('replaces the thresholds', 'DOC-C') },
          { edgeId: 'E1', quote: quote('substitutes the opening words', 'DOC-B') },
          { edgeId: 'E6', quote: quote('taxonomy-aligned turnover', 'DOC-D') },
        ],
      },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(false);
  });

  it('rejects a chain whose hops do not connect at all', () => {
    // E1 is (amender B, amended A), E7 is (amender E, amended D): two real
    // amendment edges, two checking quotes, no succession. Without this the
    // item is a bag of unrelated pairs, so an agent could assert a chain out
    // of edges that never meet.
    const items: EvidenceItem[] = [
      {
        kind: 'amendment_chain',
        hops: [
          { edgeId: 'E1', quote: quote('substitutes the opening words', 'DOC-B') },
          { edgeId: 'E7', quote: quote('revises the taxonomy reporting annex', 'DOC-E') },
        ],
      },
    ];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => /does not continue the amendment chain/.test(p))).toBe(true);
  });

  it('rejects a hop resting on an edge that is not an amendment', () => {
    // A `references` edge has no amender, so orientation is not a question
    // that can be asked of it at all.
    const items: EvidenceItem[] = [
      { kind: 'amendment_chain', hops: [{ edgeId: 'E3', quote: quote('Article 19a', 'DOC-A') }] },
    ];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/references edge/);
  });

  it('rejects a hop naming an edge the corpus does not hold', () => {
    const items: EvidenceItem[] = [
      {
        kind: 'amendment_chain',
        hops: [{ edgeId: 'E-INVENTED', quote: quote('substitutes the opening words', 'DOC-B') }],
      },
    ];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/E-INVENTED/);
  });

  it('rejects a hop whose quote is fabricated', () => {
    const items: EvidenceItem[] = [
      { kind: 'amendment_chain', hops: [{ edgeId: 'E1', quote: quote('deletes Article 19a', 'DOC-B') }] },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(false);
  });

  it('rejects a hop whose quote comes from neither endpoint of its own edge', () => {
    const items: EvidenceItem[] = [
      {
        kind: 'amendment_chain',
        hops: [{ edgeId: 'E1', quote: quote('taxonomy-aligned turnover', 'DOC-D') }],
      },
    ];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => /neither endpoint/.test(p))).toBe(true);
  });

  it('rejects an empty chain', () => {
    const items: EvidenceItem[] = [{ kind: 'amendment_chain', hops: [] }];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/no hops/);
  });
});

describe('cross reference evidence', () => {
  it('accepts a reference carried by a references edge whose quotes both check', () => {
    // Spec 2.2: "Both quotes check; a `references` edge connects them."
    const items: EvidenceItem[] = [
      {
        kind: 'cross_reference',
        edgeId: 'E3',
        from: quote('Article 19a', 'DOC-A'),
        to: quote('Article 1(4)(a)', 'DOC-B'),
      },
    ];
    expect(checkEvidenceSet(items, corpus).ok).toBe(true);
  });

  it('rejects a reference resting on an edge that is not a references edge', () => {
    // E1 connects the same two documents, but as an amendment. "X cites Y" and
    // "X was amended by Y" are different legal claims, and only one of them is
    // a cross-reference.
    const items: EvidenceItem[] = [
      {
        kind: 'cross_reference',
        edgeId: 'E1',
        from: quote('Article 19a', 'DOC-A'),
        to: quote('Article 1(4)(a)', 'DOC-B'),
      },
    ];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/references/);
  });

  it('rejects a reference whose edge does not connect the quoted documents', () => {
    const items: EvidenceItem[] = [
      {
        kind: 'cross_reference',
        edgeId: 'E3',
        from: quote('Article 1(4)(a)', 'DOC-B'),
        to: quote('Article 19a', 'DOC-A'),
      },
    ];
    const result = checkEvidenceSet(items, corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/does not connect/);
  });
});

describe('evidence sets', () => {
  it('rejects an empty set', () => {
    const result = checkEvidenceSet([], corpus);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/no evidence/);
  });

  it('reports every problem, not just the first', () => {
    const items: EvidenceItem[] = [quote('not in here at all'), quote('nor is this')];
    expect(checkEvidenceSet(items, corpus).problems).toHaveLength(2);
  });
});
