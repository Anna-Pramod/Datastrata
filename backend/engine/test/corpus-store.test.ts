/**
 * Loading the corpus is where "the text did not move" stops being an
 * assumption. Stored hashes are re-derived from the files on every load, so a
 * document edited in place fails loudly rather than silently backing a
 * signature that no longer describes it.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CorpusIntegrityError, verifyCorpusServesCoverage } from '../src/corpus/schema';
import { computeClosure, docsForSources } from '../src/corpus/closure';
import { csrdPack } from './helpers';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import { CorpusDocumentNotFoundError, loadCorpus } from '../src/corpus/store';

let dir = '';

const RAW_A = '<p>Article 19a: net turnover of EUR&nbsp;450 000 000</p>';
const RAW_B = '<p>Directive (EU) 2026/470 amends Article 19a.</p>';

/** Writes a corpus whose hashes are correct by construction. */
function writeCorpus(
  overrides: { rawA?: string; selectorA?: string | null; indexPatch?: (i: any) => void } = {},
): void {
  const rawA = overrides.rawA ?? RAW_A;
  const selectorA = overrides.selectorA ?? null;
  mkdirSync(join(dir, 'raw'), { recursive: true });
  mkdirSync(join(dir, 'normalized'), { recursive: true });

  const docs = [
    { id: 'DOC-A', slug: 'a', raw: rawA, selector: selectorA },
    { id: 'DOC-B', slug: 'b', raw: RAW_B, selector: null as string | null },
  ];

  const documents = docs.map((d) => {
    const normalized = normalize(d.raw, d.selector ?? undefined);
    writeFileSync(join(dir, 'raw', `${d.slug}.html`), d.raw, 'utf8');
    writeFileSync(join(dir, 'normalized', `${d.slug}.txt`), normalized, 'utf8');
    return {
      docId: d.id,
      serves: ['SRC-001'],
      title: `Instrument ${d.slug}`,
      url: `https://eur-lex.europa.eu/eli/dir/2013/34/oj/eng#${d.slug}`,
      versionLabel: 'consolidated 18 Mar 2026',
      retrievedOn: '2026-08-20',
      rawPath: `raw/${d.slug}.html`,
      normalizedPath: `normalized/${d.slug}.txt`,
      sha256Raw: sha256Hex(d.raw),
      sha256Normalized: sha256Hex(normalized),
      normalizerVersion: NORMALIZER_VERSION,
      contentSelector: d.selector,
      edges: [] as unknown[],
    };
  });

  const index = { updated: '2026-08-20', documents };
  overrides.indexPatch?.(index);
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

/**
 * Two raw payloads that differ in bytes and decode to the identical string:
 * 0x80 and 0x81 are both stray UTF-8 continuation bytes, so each decodes to
 * U+FFFD. Only a hash taken over bytes can tell them apart.
 */
const RAW_BYTES_A = Buffer.from([0x3c, 0x70, 0x3e, 0x80, 0x3c, 0x2f, 0x70, 0x3e]);
const RAW_BYTES_B = Buffer.from([0x3c, 0x70, 0x3e, 0x81, 0x3c, 0x2f, 0x70, 0x3e]);

/** A one-document corpus whose raw side is written as bytes, not as a string. */
function writeByteCorpus(rawBytes: Buffer): void {
  mkdirSync(join(dir, 'raw'), { recursive: true });
  mkdirSync(join(dir, 'normalized'), { recursive: true });
  const normalized = normalize(rawBytes.toString('utf8'));
  writeFileSync(join(dir, 'raw', 'a.html'), rawBytes);
  writeFileSync(join(dir, 'normalized', 'a.txt'), normalized, 'utf8');
  const index = {
    updated: '2026-08-20',
    documents: [
      {
        docId: 'DOC-A',
        serves: ['SRC-001'],
        title: 'Instrument a',
        url: 'https://eur-lex.europa.eu/eli/dir/2013/34/oj/eng#a',
        versionLabel: 'consolidated 18 Mar 2026',
        retrievedOn: '2026-08-20',
        rawPath: 'raw/a.html',
        normalizedPath: 'normalized/a.txt',
        sha256Raw: sha256Hex(rawBytes),
        sha256Normalized: sha256Hex(normalized),
        normalizerVersion: NORMALIZER_VERSION,
        contentSelector: null,
        edges: [],
      },
    ],
  };
  writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'corpus-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadCorpus', () => {
  it('loads a corpus whose files match their hashes', () => {
    writeCorpus();
    const corpus = loadCorpus(dir);
    expect(corpus.index.documents).toHaveLength(2);
    expect(corpus.document('DOC-A').title).toBe('Instrument a');
  });

  it('exposes normalized text', () => {
    writeCorpus();
    const corpus = loadCorpus(dir);
    expect(corpus.normalizedText('DOC-A')).toContain('EUR 450 000 000');
  });

  it('exposes raw text', () => {
    writeCorpus();
    const corpus = loadCorpus(dir);
    expect(corpus.rawText('DOC-A')).toContain('&nbsp;');
  });

  it('throws for an unknown document', () => {
    writeCorpus();
    const corpus = loadCorpus(dir);
    expect(() => corpus.document('DOC-NOPE')).toThrow(CorpusDocumentNotFoundError);
  });

  it('rejects a raw file edited after indexing', () => {
    writeCorpus();
    writeFileSync(join(dir, 'raw', 'a.html'), '<p>tampered</p>', 'utf8');
    expect(() => loadCorpus(dir)).toThrow(/sha256Raw/);
  });

  it('hashes the raw side as bytes, so a decode-identical mutation still moves sha256Raw', () => {
    // The two payloads decode to the same string, so a hash taken over the
    // decoded rendition cannot separate them. sha256Raw covers "the bytes as
    // fetched" (spec 2.1), and the raw store is what a future normalizer is
    // re-run over, so it has to discriminate here.
    expect(RAW_BYTES_A.toString('utf8')).toBe(RAW_BYTES_B.toString('utf8'));
    expect(sha256Hex(RAW_BYTES_A)).not.toBe(sha256Hex(RAW_BYTES_B));
  });

  it('rejects a raw file mutated into decode-identical but different bytes', () => {
    writeByteCorpus(RAW_BYTES_A);
    expect(() => loadCorpus(dir)).not.toThrow();
    writeFileSync(join(dir, 'raw', 'a.html'), RAW_BYTES_B);
    expect(() => loadCorpus(dir)).toThrow(/sha256Raw/);
  });

  it('rejects a normalized file edited after indexing', () => {
    writeCorpus();
    writeFileSync(join(dir, 'normalized', 'a.txt'), 'tampered', 'utf8');
    expect(() => loadCorpus(dir)).toThrow(/sha256Normalized/);
  });

  it('rejects a missing file as an integrity failure, not a staleness state', () => {
    writeCorpus();
    rmSync(join(dir, 'raw', 'a.html'));
    expect(() => loadCorpus(dir)).toThrow(CorpusIntegrityError);
  });

  it('rejects normalized text that its own raw bytes do not reproduce', () => {
    // Same normalizer version, but the stored normalized form is not what the
    // normalizer produces from the raw bytes. Both stored hashes are repointed
    // at the tampered content, so only the reproduction check can catch it.
    writeCorpus();
    const wrong = 'Article 19a: something else entirely';
    writeFileSync(join(dir, 'normalized', 'a.txt'), wrong, 'utf8');
    const idxPath = join(dir, 'index.json');
    const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
    idx.documents[0].sha256Normalized = sha256Hex(wrong);
    writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf8');
    expect(() => loadCorpus(dir)).toThrow(/does not reproduce/);
  });

  it('skips the reproduction check when the normalizer version differs', () => {
    // A document normalized by an older normalizer is not corrupt; recovering
    // it is the normalizer_changed path, handled in B1b.
    writeCorpus({
      indexPatch: (i) => {
        i.documents[0].normalizerVersion = '0.9.0';
      },
    });
    expect(() => loadCorpus(dir)).not.toThrow();
  });

  it('reproduces a document ingested with a content selector, using the recorded selector', () => {
    const wrapped =
      '<div id="wrapper">chrome outside the region' +
      '<div id="text"><p>Article 19a: net turnover of EUR&nbsp;450 000 000</p></div>' +
      '</div>';
    writeCorpus({ rawA: wrapped, selectorA: '#text' });
    const corpus = loadCorpus(dir);
    expect(corpus.document('DOC-A').contentSelector).toBe('#text');
    expect(corpus.normalizedText('DOC-A')).toContain('EUR 450 000 000');
    expect(corpus.normalizedText('DOC-A')).not.toContain('chrome outside the region');
  });

  it('rejects a document whose recorded selector does not reproduce the stored normalized text', () => {
    // The selector is recorded as "#text", but the stored normalized text was
    // actually produced without scoping to it (full-page extraction) -- an
    // integrity problem the reproduction check must catch, not the hash checks
    // alone, since both stored hashes are repointed at the mismatched content.
    const wrapped =
      '<div id="wrapper">chrome outside the region' +
      '<div id="text"><p>Article 19a: net turnover of EUR&nbsp;450 000 000</p></div>' +
      '</div>';
    writeCorpus({ rawA: wrapped, selectorA: '#text' });

    const fullPageNormalized = normalize(wrapped); // no selector: includes the chrome text
    writeFileSync(join(dir, 'normalized', 'a.txt'), fullPageNormalized, 'utf8');
    const idxPath = join(dir, 'index.json');
    const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
    idx.documents[0].sha256Normalized = sha256Hex(fullPageNormalized);
    writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf8');

    expect(() => loadCorpus(dir)).toThrow(/does not reproduce/);
  });
});

/**
 * The committed corpus, loaded as it stands. Every fixture above builds its own
 * store, so without this block nothing in the suite ever checks the two
 * documents the branch actually ships — and loading them is what re-derives
 * every stored hash from the bytes on disk.
 */
describe('the real corpus', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const corpusDir = join(here, '..', 'corpus');

  it('loads, which re-derives every stored hash from the files on disk', () => {
    expect(() => loadCorpus(corpusDir)).not.toThrow();
  });

  it('holds the documents behind the sources they serve', () => {
    const { index } = loadCorpus(corpusDir);
    expect(docsForSources(index, ['SRC-001', 'SRC-004'])).toEqual([
      'DOC-32013L0034',
      'DOC-32026L0470',
    ]);
  });

  it('resolves a closure over those entries that carries the amendment edge', () => {
    const { index } = loadCorpus(corpusDir);
    const closure = computeClosure(index, docsForSources(index, ['SRC-001', 'SRC-004']));
    expect(closure.docIds).toEqual(['DOC-32013L0034', 'DOC-32026L0470']);
    expect(closure.edgeIds).toEqual(['EDGE-32013L0034-amendedBy-32026L0470']);
    expect(closure.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sits at the current normalizer version for every document', () => {
    // The reproduction check in loadCorpus is skipped for a document recorded
    // under an older normalizer -- deliberately, since that is the
    // normalizer_changed recovery path. This is what stops that skip from
    // being usable as a hiding place: if any committed document drifts off the
    // current version, the population is visible here rather than silent.
    const { index } = loadCorpus(corpusDir);
    for (const d of index.documents) {
      expect(d.normalizerVersion, d.docId).toBe(NORMALIZER_VERSION);
    }
  });

  it('serves only sources the pack actually cites', () => {
    const { index } = loadCorpus(corpusDir);
    expect(() => verifyCorpusServesCoverage(index, csrdPack())).not.toThrow();
  });
});
