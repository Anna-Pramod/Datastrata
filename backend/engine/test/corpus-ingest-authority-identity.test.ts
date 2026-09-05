/**
 * The register that decides origin authority is the one that was validated.
 *
 * `loadPackContext` parses the register once and checks it against the pack.
 * Ingest must hand *that object* to `assertCorpusAuthority`. Re-reading the
 * file would produce a second register nothing vouched for, and "the same
 * path" would not repair it: a path is not bytes, and between two reads the
 * file can differ for reasons ranging from an editor save to a deliberate
 * substitution.
 *
 * The assertion is object identity (`toBe`), not deep equality — two parses of
 * identical bytes are `toEqual` and would hide exactly the defect this exists
 * to catch.
 *
 * Isolated in its own file because it mocks two production modules, and a mock
 * that leaked into the ingest suite would weaken tests that must exercise the
 * real thing.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceRegister } from '../src/monitoring/types';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** What each side of the boundary saw. */
const seen: { returned?: SourceRegister; passed?: SourceRegister; parses: number } = { parses: 0 };

vi.mock('../src/knowledge/loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/knowledge/loader')>();
  return {
    ...actual,
    loadPackContext: (dir: string, options?: unknown) => {
      const context = actual.loadPackContext(dir, options as never);
      seen.returned = context.sourceRegister;
      return context;
    },
  };
});

vi.mock('../src/corpus/authority', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/corpus/authority')>();
  return {
    ...actual,
    assertCorpusAuthority: (index: never, register: SourceRegister, pack: never) => {
      seen.passed = register;
      return actual.assertCorpusAuthority(index, register, pack);
    },
  };
});

vi.mock('../src/monitoring/register', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/monitoring/register')>();
  return {
    ...actual,
    parseSourceRegister: (value: unknown) => {
      seen.parses += 1;
      return actual.parseSourceRegister(value);
    },
  };
});

const { main } = await import('../src/cli/ingest');

const RAW = '<p>Article 19a: net turnover of EUR&nbsp;450 000 000</p>';

describe('the register deciding origin authority is the validated one', () => {
  let dir = '';
  let world = '';

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const d of [dir, world]) if (d) rmSync(d, { recursive: true, force: true });
    dir = '';
    world = '';
    seen.returned = undefined;
    seen.passed = undefined;
    seen.parses = 0;
  });

  it('hands assertCorpusAuthority the same object loadPackContext validated', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ingest-identity-'));
    world = mkdtempSync(join(tmpdir(), 'ingest-identity-world-'));
    mkdirSync(join(world, 'knowledge'), { recursive: true });
    cpSync(join(engineRoot, 'knowledge', 'csrd'), join(world, 'knowledge', 'csrd'), { recursive: true });
    cpSync(join(engineRoot, 'monitoring'), join(world, 'monitoring'), { recursive: true });
    cpSync(
      join(engineRoot, 'verification', 'requirement-versions'),
      join(world, 'verification', 'requirement-versions'),
      { recursive: true },
    );

    const body = new TextEncoder().encode(RAW);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    })));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await main([
      '--url', 'https://eur-lex.europa.eu/eli/dir/2013/34/2023-01-01',
      '--doc-id', 'DOC-IDENT', '--slug', 'ident', '--serves', 'SRC-001',
      '--title', 'Identity probe', '--version-label', 'v1', '--retrieved-on', '2026-08-27', '--authenticity', 'official_consolidation',
      '--corpus-dir', dir,
      '--pack-dir', join(world, 'knowledge', 'csrd'),
      '--register-dir', join(world, 'monitoring'),
    ]);

    // Both sides were actually reached — otherwise the identity below would be
    // `undefined === undefined`, which is the negative-observation trap.
    expect(seen.returned, 'loadPackContext returned a register').toBeDefined();
    expect(seen.passed, 'assertCorpusAuthority received a register').toBeDefined();

    // The invariant. `toBe`, never `toEqual`.
    expect(seen.passed).toBe(seen.returned);
  });

  it('parses the register exactly once for one ingestion', async () => {
    // A second parse anywhere on this path would produce a second object, and
    // the identity assertion above would only catch it if the *second* one were
    // the one handed on. This catches the read itself.
    dir = mkdtempSync(join(tmpdir(), 'ingest-onceread-'));
    world = mkdtempSync(join(tmpdir(), 'ingest-onceread-world-'));
    mkdirSync(join(world, 'knowledge'), { recursive: true });
    cpSync(join(engineRoot, 'knowledge', 'csrd'), join(world, 'knowledge', 'csrd'), { recursive: true });
    cpSync(join(engineRoot, 'monitoring'), join(world, 'monitoring'), { recursive: true });
    cpSync(
      join(engineRoot, 'verification', 'requirement-versions'),
      join(world, 'verification', 'requirement-versions'),
      { recursive: true },
    );

    const body = new TextEncoder().encode(RAW);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, statusText: 'OK',
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    })));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await main([
      '--url', 'https://eur-lex.europa.eu/eli/dir/2013/34/2024-01-01',
      '--doc-id', 'DOC-ONCE', '--slug', 'once', '--serves', 'SRC-001',
      '--title', 'Once probe', '--version-label', 'v1', '--retrieved-on', '2026-08-27', '--authenticity', 'official_consolidation',
      '--corpus-dir', dir,
      '--pack-dir', join(world, 'knowledge', 'csrd'),
      '--register-dir', join(world, 'monitoring'),
    ]);

    expect(seen.parses).toBe(1);
  });
});
