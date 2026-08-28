/**
 * Ingest is the only door to the network, so everything downstream of the
 * received bytes is tested here from fixtures: bytes to normalization to
 * hashing to a valid index entry. The fetch itself is not tested, because a
 * network response is not reproducible — which is exactly why the chain below
 * it must be.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDocumentEntry, main, mergeIntoIndex, type IngestInput } from '../src/cli/ingest';
import { parseCorpusIndex, verifyCorpusIntegrity } from '../src/corpus/schema';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import type { CorpusIndex } from '../src/corpus/types';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = '<p>Article 19a: net turnover of EUR&nbsp;450 000 000</p>';
/** Ingest takes the bytes as fetched, so fixtures encode their text first. */
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const RAW_WITH_REGION =
  '<div id="wrapper">chrome outside the region' +
  '<div id="text"><p>Article 19a: net turnover of EUR&nbsp;450 000 000</p></div>' +
  '</div>';

function input(over: Partial<IngestInput> = {}): IngestInput {
  return {
    docId: 'DOC-32013L0034-C-20260318',
    slug: '32013L0034-c-20260318',
    serves: ['SRC-001'],
    title: 'Directive 2013/34/EU — consolidated text of 18 March 2026',
    url: 'https://eur-lex.europa.eu/eli/dir/2013/34/2026-03-18/eng',
    versionLabel: 'consolidated 18 Mar 2026',
    retrievedOn: '2026-08-20',
    rawBytes: bytes(RAW),
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
    expect(entry.sha256Raw).toBe(sha256Hex(bytes(RAW)));
  });

  it('hashes the bytes, not a decoded rendition of them', () => {
    // 0x80 and 0x81 are both stray UTF-8 continuation bytes: they decode to
    // the same string, so a hash over the decoded form cannot separate them.
    // sha256Raw covers the bytes as fetched (spec 2.1), so it must.
    const a = Uint8Array.from([0x3c, 0x70, 0x3e, 0x80, 0x3c, 0x2f, 0x70, 0x3e]);
    const b = Uint8Array.from([0x3c, 0x70, 0x3e, 0x81, 0x3c, 0x2f, 0x70, 0x3e]);
    expect(new TextDecoder().decode(a)).toBe(new TextDecoder().decode(b));
    expect(buildDocumentEntry(input({ rawBytes: a })).entry.sha256Raw).not.toBe(
      buildDocumentEntry(input({ rawBytes: b })).entry.sha256Raw,
    );
  });

  it('returns the fetched bytes for storage, unchanged', () => {
    const raw = Uint8Array.from([0x3c, 0x70, 0x3e, 0x80, 0x3c, 0x2f, 0x70, 0x3e]);
    expect(Buffer.from(buildDocumentEntry(input({ rawBytes: raw })).rawBytes)).toEqual(
      Buffer.from(raw),
    );
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

  it('records a null contentSelector when none is supplied', () => {
    const { entry } = buildDocumentEntry(input());
    expect(entry.contentSelector).toBeNull();
  });

  it('records the supplied contentSelector and scopes normalization to it', () => {
    const { entry, normalizedText } = buildDocumentEntry(
      input({ rawBytes: bytes(RAW_WITH_REGION), contentSelector: '#text' }),
    );
    expect(entry.contentSelector).toBe('#text');
    expect(normalizedText).toBe(normalize(RAW_WITH_REGION, '#text'));
    expect(normalizedText).not.toContain('chrome outside the region');
  });

  it('throws when the given contentSelector does not match, naming the selector', () => {
    expect(() =>
      buildDocumentEntry(input({ rawBytes: bytes(RAW), contentSelector: '#nope' })),
    ).toThrow(/#nope/);
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

  it('does not rewind the index date when an earlier retrieval is re-ingested', () => {
    // updated is the index-level "last edited" date. Re-ingesting a document
    // with an earlier --retrieved-on must not move it backwards: the later
    // retrieval still happened.
    const { entry: late } = buildDocumentEntry(input({ retrievedOn: '2026-09-01' }));
    const { entry: early } = buildDocumentEntry(input({ docId: 'DOC-OTHER', slug: 'other', retrievedOn: '2026-07-01' }));
    const merged = mergeIntoIndex(mergeIntoIndex(emptyIndex(), late), early);
    expect(merged.updated).toBe('2026-09-01');
  });

  it('moves the index date forward for a later retrieval', () => {
    const { entry } = buildDocumentEntry(input({ retrievedOn: '2026-09-01' }));
    expect(mergeIntoIndex(emptyIndex(), entry).updated).toBe('2026-09-01');
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

describe('main (CLI, network mocked)', () => {
  class FakeProcessExit extends Error {
    constructor(public code: number) {
      super(`process.exit(${code})`);
    }
  }

  let dir = '';

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const d of [dir, authorityWorld]) if (d) rmSync(d, { recursive: true, force: true });
    dir = '';
    authorityWorld = '';
  });

  /**
   * The pack and register an ingest now needs.
   *
   * `--pack-dir` became required when ingest gained the authority preflight:
   * a document may only be written for a source that authorised its origin,
   * and without a pack there is no source universe and no register to ask.
   * These tests are about byte storage and selector handling, so they use the
   * real authority and a URL the register genuinely authorises.
   */
  let authorityWorld = '';
  function withAuthority(): string[] {
    authorityWorld = mkdtempSync(join(tmpdir(), 'ingest-authority-'));
    mkdirSync(join(authorityWorld, 'knowledge'), { recursive: true });
    cpSync(join(engineRoot, 'knowledge', 'csrd'), join(authorityWorld, 'knowledge', 'csrd'), { recursive: true });
    cpSync(join(engineRoot, 'monitoring'), join(authorityWorld, 'monitoring'), { recursive: true });
    cpSync(
      join(engineRoot, 'verification', 'requirement-versions'),
      join(authorityWorld, 'verification', 'requirement-versions'),
      { recursive: true },
    );
    return [
      '--pack-dir', join(authorityWorld, 'knowledge', 'csrd'),
      '--register-dir', join(authorityWorld, 'monitoring'),
    ];
  }
  /** Beneath SRC-001's declared path_prefix, so the preflight admits it. */
  const AUTHORISED_URL = 'https://eur-lex.europa.eu/eli/dir/2013/34/2020-01-01';

  function withMockedFetch(responseText: string): void {
    // Ingest reads the response as bytes, so the stub serves bytes.
    const body = new TextEncoder().encode(responseText);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      })),
    );
  }

  it('writes nothing and exits non-zero when the content selector does not match', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ingest-'));
    withMockedFetch(RAW); // has no id="text" element at all
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new FakeProcessExit(code ?? 0);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      main([
        '--url',
        AUTHORISED_URL,
        '--doc-id',
        'DOC-TEST',
        '--slug',
        'test',
        '--serves',
        'SRC-001',
        '--title',
        'Test instrument',
        '--version-label',
        'v1',
        '--retrieved-on',
        '2026-08-20',
        '--corpus-dir',
        dir,
        ...withAuthority(),
        '--content-selector',
        '#text',
      ]),
    ).rejects.toThrow(FakeProcessExit);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy.mock.calls.some(([msg]) => String(msg).includes('#text'))).toBe(true);
    // Nothing written: no raw/normalized files, and no index.json.
    expect(existsSync(join(dir, 'index.json'))).toBe(false);
    expect(existsSync(join(dir, 'raw'))).toBe(false);
    expect(existsSync(join(dir, 'normalized'))).toBe(false);
  });

  it('treats a flag-shaped value as a missing value rather than writing it as content', async () => {
    // --version-label consumed the next flag as its value would put
    // "--retrieved-on" into a field a signature pins.
    dir = mkdtempSync(join(tmpdir(), 'ingest-'));
    withMockedFetch(RAW);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new FakeProcessExit(code ?? 0);
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      main([
        '--url',
        AUTHORISED_URL,
        '--doc-id',
        'DOC-TEST',
        '--slug',
        'test',
        '--serves',
        'SRC-001',
        '--title',
        'Test instrument',
        '--version-label',
        '--retrieved-on',
        '2026-08-20',
        '--corpus-dir',
        dir,
        ...withAuthority(),
      ]),
    ).rejects.toThrow(FakeProcessExit);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(existsSync(join(dir, 'index.json'))).toBe(false);
  });

  it('stores the fetched bytes verbatim under rawPath', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ingest-'));
    withMockedFetch(RAW);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await main([
      '--url',
      AUTHORISED_URL,
      '--doc-id',
      'DOC-TEST',
      '--slug',
      'test',
      '--serves',
      'SRC-001',
      '--title',
      'Test instrument',
      '--version-label',
      'v1',
      '--retrieved-on',
      '2026-08-20',
      '--corpus-dir',
      dir,
      ...withAuthority(),
    ]);

    const stored = readFileSync(join(dir, 'raw', 'test.html'));
    expect(sha256Hex(stored)).toBe(sha256Hex(bytes(RAW)));
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    expect(index.documents[0]?.sha256Raw).toBe(sha256Hex(stored));
  });

  it('records the selector on the entry when the CLI ingest succeeds', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ingest-'));
    withMockedFetch(RAW_WITH_REGION);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await main([
      '--url',
      AUTHORISED_URL,
      '--doc-id',
      'DOC-TEST',
      '--slug',
      'test',
      '--serves',
      'SRC-001',
      '--title',
      'Test instrument',
      '--version-label',
      'v1',
      '--retrieved-on',
      '2026-08-20',
      '--corpus-dir',
      dir,
      ...withAuthority(),
      '--content-selector',
      '#text',
    ]);

    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    expect(index.documents[0]?.contentSelector).toBe('#text');
  });
});

// ---------------------------------------------------------------------------
// The authority preflight, and the promise that nothing was written
// ---------------------------------------------------------------------------

/**
 * A document may only be ingested for a source that authorised its origin.
 *
 * **The position of the check is the proposition.** The candidate index is
 * complete in memory before any filesystem mutation happens — the first is a
 * `mkdirSync`, not a write — so a refusal leaves the corpus exactly as it was.
 * Validating after writing and undoing would be a weaker promise, and the
 * assertions below are written to tell the two apart: they compare the whole
 * corpus tree byte for byte, not merely "the write function was not called".
 *
 * What a pass proves is that the source authorised the origin the entry
 * *records*. This process did fetch those bytes, but the corpus it writes
 * cannot later prove that, and nothing here claims otherwise.
 */
describe('ingest refuses a document the source has not authorised', () => {
  let dir = '';
  let world = '';

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const d of [dir, world]) if (d) rmSync(d, { recursive: true, force: true });
    dir = '';
    world = '';
  });

  function mockFetch(responseText: string): void {
    const body = new TextEncoder().encode(responseText);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    })));
  }

  /** A runtime world: the real pack and register, two levels above the pack. */
  function buildWorld(): { packDir: string; registerDir: string } {
    world = mkdtempSync(join(tmpdir(), 'ingest-world-'));
    mkdirSync(join(world, 'knowledge'), { recursive: true });
    cpSync(join(engineRoot, 'knowledge', 'csrd'), join(world, 'knowledge', 'csrd'), { recursive: true });
    cpSync(join(engineRoot, 'monitoring'), join(world, 'monitoring'), { recursive: true });
    cpSync(
      join(engineRoot, 'verification', 'requirement-versions'),
      join(world, 'verification', 'requirement-versions'),
      { recursive: true },
    );
    return { packDir: join(world, 'knowledge', 'csrd'), registerDir: join(world, 'monitoring') };
  }

  /** Every path under a tree, with its bytes — the atomicity snapshot. */
  function snapshot(root: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        const key = full.slice(root.length);
        if (e.isDirectory()) {
          out[`${key}/`] = '(directory)';
          walk(full);
        } else {
          out[key] = createHash('sha256').update(readFileSync(full)).digest('hex');
        }
      }
    };
    if (existsSync(root)) walk(root);
    return out;
  }

  const run = (serves: string, url: string, packDir: string, registerDir: string) =>
    main([
      '--url', url, '--doc-id', 'DOC-PROBE', '--slug', 'probe',
      '--serves', serves, '--title', 'Probe', '--version-label', 'v1',
      '--retrieved-on', '2026-08-27', '--corpus-dir', dir,
      '--pack-dir', packDir, '--register-dir', registerDir,
    ]);

  it('ingests a document whose origin the source authorised — the control', async () => {
    // SRC-001 declares path_prefix https://eur-lex.europa.eu/eli/dir/2013/34,
    // and this URL is beneath it. Without this control every refusal below
    // could be an ingest that cannot succeed at all.
    dir = mkdtempSync(join(tmpdir(), 'ingest-ok-'));
    const { packDir, registerDir } = buildWorld();
    mockFetch(RAW);
    await run('SRC-001', 'https://eur-lex.europa.eu/eli/dir/2013/34/2020-01-01', packDir, registerDir);

    const index = parseCorpusIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
    expect(index.documents.map((d) => d.docId)).toContain('DOC-PROBE');
  });

  /** Runs an ingest expected to refuse, and returns the before/after snapshots. */
  async function refusedRun(
    serves: string,
    url: string,
  ): Promise<{ before: Record<string, string>; after: Record<string, string>; errors: string[] }> {
    dir = mkdtempSync(join(tmpdir(), 'ingest-refuse-'));
    const { packDir, registerDir } = buildWorld();
    // A corpus that already holds state, so "unchanged" is a real claim rather
    // than a statement about an empty directory.
    mkdirSync(join(dir, 'raw'), { recursive: true });
    writeFileSync(join(dir, 'index.json'), `${JSON.stringify({ updated: '2026-08-01', documents: [] }, null, 2)}\n`);
    writeFileSync(join(dir, 'raw', 'pre-existing.html'), '<p>untouched</p>');
    const before = snapshot(dir);

    mockFetch(RAW);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')); });
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code ?? 0}`);
    }) as never);

    await expect(run(serves, url, packDir, registerDir)).rejects.toThrow(/exit 1/);
    exit.mockRestore();
    return { before, after: snapshot(dir), errors };
  }

  it('refuses an origin the source has not authorised, and writes nothing', async () => {
    // A real EUR-Lex URL, on the authorised host, under a *different*
    // instrument's ELI. Host coincidence confers nothing.
    const { before, after, errors } = await refusedRun(
      'SRC-001',
      'https://eur-lex.europa.eu/eli/dir/2022/2464/oj/eng',
    );
    expect(errors.join('\n')).toContain('no matching authorised origin');
    expect(errors.join('\n')).toContain('SRC-001');
    expect(errors.join('\n')).toContain('Nothing was written.');
    expect(after).toEqual(before);
  });

  it('refuses a source with no authorisedOrigins declaration, and writes nothing', async () => {
    // SRC-007 is registered and cited, and nothing has declared an origin for
    // it because nothing serves it. Fail closed.
    const { before, after, errors } = await refusedRun(
      'SRC-007',
      'https://eur-lex.europa.eu/eli/dir/2022/2464/oj/eng',
    );
    expect(errors.join('\n')).toContain('no declaration');
    expect(errors.join('\n')).toContain('SRC-007');
    expect(after).toEqual(before);
  });

  it('leaves no directory behind, not merely no file', async () => {
    // The first durable mutation in this command is a `mkdirSync`, not a write.
    // A check placed after it would leave `raw/` and `normalized/` created; the
    // snapshot compares directories as well as files, so that would fail here.
    const { before, after } = await refusedRun('SRC-001', 'https://example.invalid/elsewhere');
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(existsSync(join(dir, 'normalized'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The preflight validates the whole candidate, and gets its authority honestly
// ---------------------------------------------------------------------------

/**
 * Two properties the refusal tests above cannot distinguish on their own.
 *
 * The first is *what* is validated. `assertCorpusAuthority` is handed `merged`
 * — the candidate index, existing members included — not the incoming entry.
 * An implementation checking only the new document would pass every test above,
 * because in all of them the new document is the offending one. The test below
 * inverts that: the incoming entry is authorised and an existing member is not.
 *
 * The second is *where the authority comes from*. Ingest resolves it through
 * `loadPack`, the production loader, so a register that does not describe the
 * pack is refused before any authority question is asked — the T5.0 invariant,
 * reached rather than reimplemented.
 */
describe('ingest validates the whole candidate corpus, with authority it obtained properly', () => {
  let dir = '';
  let world = '';

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const d of [dir, world]) if (d) rmSync(d, { recursive: true, force: true });
    dir = '';
    world = '';
  });

  function mockFetch(responseText: string): void {
    const body = new TextEncoder().encode(responseText);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    })));
  }

  function buildWorld(): { packDir: string; registerDir: string } {
    world = mkdtempSync(join(tmpdir(), 'ingest-world2-'));
    mkdirSync(join(world, 'knowledge'), { recursive: true });
    cpSync(join(engineRoot, 'knowledge', 'csrd'), join(world, 'knowledge', 'csrd'), { recursive: true });
    cpSync(join(engineRoot, 'monitoring'), join(world, 'monitoring'), { recursive: true });
    cpSync(
      join(engineRoot, 'verification', 'requirement-versions'),
      join(world, 'verification', 'requirement-versions'),
      { recursive: true },
    );
    return { packDir: join(world, 'knowledge', 'csrd'), registerDir: join(world, 'monitoring') };
  }

  function snapshot(root: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, e.name);
        const key = full.slice(root.length);
        if (e.isDirectory()) { out[`${key}/`] = '(directory)'; walk(full); }
        else out[key] = createHash('sha256').update(readFileSync(full)).digest('hex');
      }
    };
    if (existsSync(root)) walk(root);
    return out;
  }

  it('refuses when an existing member is unauthorised, though the incoming entry is not', async () => {
    // The discriminator. `serves` is not covered by any hash, so relabelling an
    // existing document leaves corpus integrity intact and moves only the
    // authority question — which is exactly the state a narrowed check would
    // wave through.
    dir = mkdtempSync(join(tmpdir(), 'ingest-whole-'));
    cpSync(join(engineRoot, 'corpus'), dir, { recursive: true });
    const indexPath = join(dir, 'index.json');
    const onDisk = JSON.parse(readFileSync(indexPath, 'utf8')) as {
      documents: { docId: string; serves: string[] }[];
    };
    const victim = onDisk.documents.find((d) => d.docId === 'DOC-32013L0034')!;
    victim.serves = ['SRC-007']; // registered, cited, and declared by nothing
    writeFileSync(indexPath, `${JSON.stringify(onDisk, null, 2)}\n`, 'utf8');

    const { packDir, registerDir } = buildWorld();
    const before = snapshot(dir);
    mockFetch(RAW);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')); });
    const exit = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      throw new Error(`exit ${c ?? 0}`);
    }) as never);

    await expect(
      main([
        // The incoming document is beneath SRC-001's declared prefix, so it is
        // authorised on its own. Only the candidate as a whole is not.
        '--url', 'https://eur-lex.europa.eu/eli/dir/2013/34/2021-01-01',
        '--doc-id', 'DOC-NEW', '--slug', 'new', '--serves', 'SRC-001',
        '--title', 'New', '--version-label', 'v1', '--retrieved-on', '2026-08-27',
        '--corpus-dir', dir, '--pack-dir', packDir, '--register-dir', registerDir,
      ]),
    ).rejects.toThrow(/exit 1/);
    exit.mockRestore();

    // The refusal names the *existing* document, not the incoming one.
    expect(errors.join('\n')).toContain('DOC-32013L0034');
    expect(errors.join('\n')).toContain('SRC-007');
    expect(errors.join('\n')).not.toContain('DOC-NEW');
    expect(errors.join('\n')).toContain('Nothing was written.');
    expect(snapshot(dir)).toEqual(before);
  });

  it('refuses a register that does not describe the pack, before asking about origins', async () => {
    // Authority context comes through loadPack, so T5.0's program agreement is
    // reached rather than reimplemented. A register for another program cannot
    // be used to authorise anything here.
    dir = mkdtempSync(join(tmpdir(), 'ingest-program-'));
    const { packDir, registerDir } = buildWorld();
    const registerPath = join(registerDir, 'source-register.json');
    const register = JSON.parse(readFileSync(registerPath, 'utf8')) as Record<string, unknown>;
    register['program'] = 'NFRD';
    writeFileSync(registerPath, `${JSON.stringify(register, null, 2)}\n`, 'utf8');

    const before = snapshot(dir);
    mockFetch(RAW);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')); });
    const exit = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      throw new Error(`exit ${c ?? 0}`);
    }) as never);

    await expect(
      main([
        '--url', 'https://eur-lex.europa.eu/eli/dir/2013/34/2022-01-01',
        '--doc-id', 'DOC-NEW', '--slug', 'new', '--serves', 'SRC-001',
        '--title', 'New', '--version-label', 'v1', '--retrieved-on', '2026-08-27',
        '--corpus-dir', dir, '--pack-dir', packDir, '--register-dir', registerDir,
      ]),
    ).rejects.toThrow(/exit 1/);
    exit.mockRestore();

    // The program mismatch, not an origin verdict: the document's own URL is
    // perfectly authorised, so an origin message here would mean the register
    // had been trusted before anything vouched for it.
    expect(errors.join('\n')).toContain('does not match pack program');
    expect(errors.join('\n')).not.toContain('no matching authorised origin');
    expect(snapshot(dir)).toEqual(before);
  });
});
