/**
 * The public site's corpus root refuses an unauthorised corpus.
 *
 * `buildCsrdFreshnessResolver` computes freshness pins rather than
 * model-visible evidence, and it is still a production consumer of the corpus's
 * source-identity claim: it decides which documents a requirement's closure
 * contains and what digest that closure has. A raw index reaching it would let
 * an unauthorised document decide a pin that a signature is compared against.
 *
 * This is the third root's own tooth. The engine's two roots have theirs in
 * `corpus-authority-roots.test.ts`; neither says anything about this one,
 * because each is independently bypassable.
 *
 * The unauthorised state is written straight to disk, bypassing ingest.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCsrdFreshnessResolver, loadVerifiedCsrdPack } from '@/lib/pack';
import { loadPack } from '@datastrata/engine';
import type { SigningEntry } from '@datastrata/engine';

const REAL_ENGINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'backend', 'engine');

let root = '';
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

/** A repository the site can read, optionally with a relabelled document. */
function buildRoot(unauthorise: boolean): string {
  root = mkdtempSync(join(tmpdir(), 'pack-authority-'));
  const engine = join(root, 'backend', 'engine');
  mkdirSync(engine, { recursive: true });
  for (const dir of ['knowledge', 'corpus', 'monitoring']) {
    cpSync(join(REAL_ENGINE_ROOT, dir), join(engine, dir), { recursive: true });
  }
  mkdirSync(join(engine, 'verification'), { recursive: true });
  cpSync(
    join(REAL_ENGINE_ROOT, 'verification', 'requirement-versions'),
    join(engine, 'verification', 'requirement-versions'),
    { recursive: true },
  );

  if (unauthorise) {
    // `serves` is covered by no hash, so corpus integrity is untouched and only
    // the authority question moves.
    const path = join(engine, 'corpus', 'index.json');
    const index = JSON.parse(readFileSync(path, 'utf8')) as { documents: { docId: string; serves: string[] }[] };
    index.documents.find((d) => d.docId === 'DOC-32013L0034')!.serves = ['SRC-002'];
    writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }
  return engine;
}

/**
 * The resolver is **lazy** — it consumes the corpus only when a requirement has
 * a ledger entry whose freshness must be judged. An unsigned repository never
 * touches the corpus at all, so `loadVerifiedCsrdPack` alone cannot be the
 * tooth: there is nothing to authorise until something asks. These call the
 * resolver directly, which is exactly the moment the corpus is consumed.
 */
function resolverInput(engine: string, entry: Partial<SigningEntry> = {}) {
  const pack = loadPack(join(engine, 'knowledge', 'csrd'), {
    versionRegistryDir: join(engine, 'verification', 'requirement-versions'),
  });
  const requirement = pack.requirements.find((r) => r.id === 'CSRD-S-001')!;
  return {
    packId: 'csrd',
    requirement,
    renderContext: { factTypes: pack.factTypes, catalogues: pack.catalogues },
    entry: {
      packId: 'csrd',
      requirementId: 'CSRD-S-001',
      requirementVersion: requirement.version,
      ...entry,
    } as SigningEntry,
  };
}

describe('the public site refuses a corpus that is not authorised for what it claims', () => {
  it('refuses when the freshness root consumes the corpus', () => {
    const engine = buildRoot(true);
    const resolve = buildCsrdFreshnessResolver(engine);
    expect(() => resolve(resolverInput(engine) as never)).toThrow(/SRC-002|authoris/i);
  });

  it('positive control: the identical repository resolves when the corpus is authorised', () => {
    // Without this the refusal above could be any failure to build a temporary
    // repository. This one reaches the same code with one field different in
    // index.json — and gets past authorisation.
    const engine = buildRoot(false);
    const resolve = buildCsrdFreshnessResolver(engine);
    let authorityFailure: unknown;
    try {
      resolve(resolverInput(engine) as never);
    } catch (error) {
      authorityFailure = /authoris|SRC-002/i.test(String(error)) ? error : undefined;
    }
    expect(authorityFailure, 'authorised corpus must not fail authorisation').toBeUndefined();
  });

  it('loads the pack itself when nothing asks the corpus a question', () => {
    // The lazy boundary, stated rather than left implicit: with no ledger
    // entries the resolver never runs, so an unauthorised corpus is not yet
    // consumed — and nothing has been decided from it either.
    const engine = buildRoot(true);
    expect(() => loadVerifiedCsrdPack(engine)).not.toThrow();
  });
});
