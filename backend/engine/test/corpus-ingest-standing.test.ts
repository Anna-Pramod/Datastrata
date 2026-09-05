/**
 * The ingest CLI's standing contract: an artefact's authenticity is stated by
 * the ingesting human and refused if unstated or unrecognised, and declared
 * non-operative headings are collected one flag per heading, in order.
 *
 * Through `main`, over a runtime world copied from the real pack and register,
 * with `fetch` stubbed — no network, ever. The refusals are asserted with a
 * before/after snapshot of the corpus directory, because "refused" is only
 * evidence beside "and wrote nothing".
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli/ingest';
import { parseCorpusIndex } from '../src/corpus/schema';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = '<p>Article 19a: net turnover of EUR&nbsp;450 000 000</p>';
const URL_UNDER_SRC_001 = 'https://eur-lex.europa.eu/eli/dir/2013/34/2020-01-01';

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
  world = mkdtempSync(join(tmpdir(), 'ingest-standing-world-'));
  mkdirSync(join(world, 'knowledge'), { recursive: true });
  cpSync(join(engineRoot, 'knowledge', 'csrd'), join(world, 'knowledge', 'csrd'), { recursive: true });
  cpSync(join(engineRoot, 'monitoring'), join(world, 'monitoring'), { recursive: true });
  cpSync(join(engineRoot, 'verification', 'requirement-versions'), join(world, 'verification', 'requirement-versions'), { recursive: true });
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

function baseArgs(packDir: string, registerDir: string): string[] {
  return [
    '--url', URL_UNDER_SRC_001, '--doc-id', 'DOC-PROBE', '--slug', 'probe',
    '--serves', 'SRC-001', '--title', 'Probe', '--version-label', 'v1',
    '--retrieved-on', '2026-09-05', '--corpus-dir', dir,
    '--pack-dir', packDir, '--register-dir', registerDir,
  ];
}

async function refused(extra: string[]): Promise<{ before: Record<string, string>; after: Record<string, string>; errors: string[]; code: number | undefined }> {
  dir = mkdtempSync(join(tmpdir(), 'ingest-standing-refuse-'));
  const { packDir, registerDir } = buildWorld();
  mkdirSync(join(dir, 'raw'), { recursive: true });
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify({ updated: '2026-08-01', documents: [] }, null, 2)}\n`);
  writeFileSync(join(dir, 'raw', 'pre-existing.html'), '<p>untouched</p>');
  const before = snapshot(dir);
  mockFetch(RAW);
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')); });
  let code: number | undefined;
  const exit = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
    code = c;
    throw new Error(`exit ${c ?? 0}`);
  }) as never);
  await expect(main([...baseArgs(packDir, registerDir), ...extra])).rejects.toThrow(/exit/);
  exit.mockRestore();
  return { before, after: snapshot(dir), errors, code };
}

describe('--authenticity', () => {
  it('B13 — an unrecognised value is refused before any write, naming the value and the permitted set', async () => {
    const { before, after, errors, code } = await refused(['--authenticity', 'consolidated']);
    expect(code).toBe(1);
    const text = errors.join('\n');
    expect(text).toContain('--authenticity consolidated');
    expect(text).toContain('authentic_publication, official_consolidation, official_pre_publication_text');
    expect(text).toContain('Nothing was written.');
    expect(after).toEqual(before);
  });

  it('is required: omitting it is a usage error, not a defaulted ingest', async () => {
    const { before, after, code } = await refused([]);
    expect(code).toBe(2);
    expect(after).toEqual(before);
  });

  it('positive control: a permitted value ingests, and the entry records it verbatim', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ingest-standing-ok-'));
    const { packDir, registerDir } = buildWorld();
    mockFetch(RAW);
    await main([...baseArgs(packDir, registerDir), '--authenticity', 'official_pre_publication_text']);
    const index = parseCorpusIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
    const entry = index.documents.find((d) => d.docId === 'DOC-PROBE');
    expect(entry?.artefactAuthenticity).toBe('official_pre_publication_text');
    expect(entry?.nonOperativeSections).toEqual([]);
  });
});

describe('--non-operative-section', () => {
  it('B12 — repeats, one heading per occurrence, in the order given; absent means the canonical []', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ingest-standing-sections-'));
    const { packDir, registerDir } = buildWorld();
    mockFetch(RAW);
    await main([
      ...baseArgs(packDir, registerDir), '--authenticity', 'official_consolidation',
      '--non-operative-section', 'EXPLANATORY MEMORANDUM',
      '--non-operative-section', 'ANNEX, PART A',
    ]);
    const index = parseCorpusIndex(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')));
    const entry = index.documents.find((d) => d.docId === 'DOC-PROBE')!;
    // Both, in order, and a heading containing a comma survives intact —
    // which is why the flag repeats rather than taking a comma-joined list.
    expect(entry.nonOperativeSections).toEqual(['EXPLANATORY MEMORANDUM', 'ANNEX, PART A']);
  });

  it('refuses an empty, an untrimmed and a repeated heading before any write', async () => {
    for (const [extra, message] of [
      [['--authenticity', 'official_consolidation', '--non-operative-section', ' ANNEX'], 'non-empty and already trimmed'],
      // The flag followed by another flag: recorded as empty, refused by name.
      [['--authenticity', 'official_consolidation', '--non-operative-section', '--corpus-dir'], 'non-empty and already trimmed'],
      [['--authenticity', 'official_consolidation', '--non-operative-section', 'A', '--non-operative-section', 'A'], 'is repeated'],
    ] as const) {
      const { before, after, errors, code } = await refused([...extra]);
      expect(code).toBe(1);
      expect(errors.join('\n')).toContain(message);
      expect(errors.join('\n')).toContain('Nothing was written.');
      expect(after).toEqual(before);
      // fresh directories per case
      for (const d of [dir, world]) if (d) rmSync(d, { recursive: true, force: true });
      dir = ''; world = '';
      vi.unstubAllGlobals(); vi.restoreAllMocks();
    }
  });
});
