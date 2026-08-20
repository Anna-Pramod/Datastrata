/**
 * Loading the corpus is where "the text did not move" stops being an
 * assumption. Stored hashes are re-derived from the files on every load, so a
 * document edited in place fails loudly rather than silently backing a
 * signature that no longer describes it.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CorpusIntegrityError } from '../src/corpus/schema';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import { CorpusDocumentNotFoundError, loadCorpus } from '../src/corpus/store';

let dir = '';

const RAW_A = '<p>Article 19a: net turnover of EUR&nbsp;450 000 000</p>';
const RAW_B = '<p>Directive (EU) 2026/470 amends Article 19a.</p>';

/** Writes a corpus whose hashes are correct by construction. */
function writeCorpus(overrides: { rawA?: string; indexPatch?: (i: any) => void } = {}): void {
  const rawA = overrides.rawA ?? RAW_A;
  mkdirSync(join(dir, 'raw'), { recursive: true });
  mkdirSync(join(dir, 'normalized'), { recursive: true });

  const docs = [
    { id: 'DOC-A', slug: 'a', raw: rawA },
    { id: 'DOC-B', slug: 'b', raw: RAW_B },
  ];

  const documents = docs.map((d) => {
    const normalized = normalize(d.raw);
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
      edges: [] as unknown[],
    };
  });

  const index = { updated: '2026-08-20', documents };
  overrides.indexPatch?.(index);
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
});
