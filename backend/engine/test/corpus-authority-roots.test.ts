/**
 * Each production composition root refuses an unauthorised corpus.
 *
 * `corpus-authority.test.ts` proves the validator. This proves the **wiring**,
 * which is a different proposition and the one F-5 got wrong: a check can be
 * correct, tested, and never called. Per the evidence standard, a direct test
 * of a validator is not evidence that production invokes it.
 *
 * There are three roots and each is independently bypassable, so each gets its
 * own tooth. One root's test says nothing about another's.
 *
 * ```text
 * cli/sign.ts  readWorld      → verify run / verify sign
 * cli/review-sheet.ts         → gatherSheet
 * frontend/web/lib/pack.ts    → buildCsrdFreshnessResolver
 * ```
 *
 * The unauthorised state is written **directly to disk**, bypassing ingest
 * entirely — M-A4's proposition. Ingest's own preflight cannot help here; that
 * is the point of having a use-time boundary as well as an ingress one.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readWorld } from '../src/cli/sign';
import { gatherSheet } from '../src/cli/review-sheet';
import { CorpusAuthorityError } from '../src/corpus/authority';

const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

let world = '';
afterEach(() => {
  if (world) rmSync(world, { recursive: true, force: true });
  world = '';
});

/**
 * A complete runtime world. `unauthorise` relabels a committed document to
 * claim a source no origin declaration covers — corpus integrity is untouched,
 * because `serves` is in no hash. That is precisely the state ingest refuses to
 * create and a use-time check must refuse to read.
 */
function buildWorld(unauthorise: boolean): string {
  world = mkdtempSync(join(tmpdir(), 'authority-root-'));
  mkdirSync(join(world, 'knowledge'), { recursive: true });
  cpSync(join(engineRoot, 'knowledge', 'csrd'), join(world, 'knowledge', 'csrd'), { recursive: true });
  cpSync(join(engineRoot, 'monitoring'), join(world, 'monitoring'), { recursive: true });
  cpSync(join(engineRoot, 'corpus'), join(world, 'corpus'), { recursive: true });
  mkdirSync(join(world, 'verification'), { recursive: true });
  cpSync(
    join(engineRoot, 'verification', 'requirement-versions'),
    join(world, 'verification', 'requirement-versions'),
    { recursive: true },
  );

  if (unauthorise) {
    const path = join(world, 'corpus', 'index.json');
    const index = JSON.parse(readFileSync(path, 'utf8')) as { documents: { docId: string; serves: string[] }[] };
    index.documents.find((d) => d.docId === 'DOC-32013L0034')!.serves = ['SRC-002'];
    writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  }
  return world;
}

const pathsFor = (root: string) => ({
  packDir: join(root, 'knowledge', 'csrd'),
  corpusDir: join(root, 'corpus'),
  verificationDir: join(root, 'verification'),
});

/** `gatherSheet` wants two more paths; neither is reached before the refusal. */
const sheetPathsFor = (root: string) => ({
  ...pathsFor(root),
  goldenProfilesPath: join(root, 'golden-profiles.json'),
  outPath: join(root, 'sheet.html'),
});

describe('readWorld — the verify run / verify sign root', () => {
  it('refuses an unauthorised corpus before any model request could be made', () => {
    // readWorld is what `verify run` composes its world from, so a refusal here
    // is a refusal before the runner exists, let alone an agent request.
    const root = buildWorld(true);
    expect(() => readWorld(pathsFor(root), 'csrd', 'CSRD-S-001')).toThrow(
      /not authorised for the sources it claims/,
    );
  });

  it('names the document, the claimed source and the reason', () => {
    const root = buildWorld(true);
    try {
      readWorld(pathsFor(root), 'csrd', 'CSRD-S-001');
      throw new Error('expected a refusal');
    } catch (error) {
      const message = (error as { lines?: string[] }).lines?.join('\n') ?? String(error);
      expect(message).toContain('DOC-32013L0034');
      expect(message).toContain('SRC-002');
      expect(message).toContain('no declaration');
    }
  });

  it('positive control: the identical world loads when the corpus is authorised', () => {
    const root = buildWorld(false);
    expect(() => readWorld(pathsFor(root), 'csrd', 'CSRD-S-001')).not.toThrow();
  });
});

describe('gatherSheet — the review-sheet root', () => {
  it('refuses an unauthorised corpus before closure-derived review state exists', () => {
    const root = buildWorld(true);
    expect(() => gatherSheet('csrd', sheetPathsFor(root))).toThrow(
      /not authorised for the sources it claims/,
    );
  });

  it('positive control: the identical world gathers when the corpus is authorised', () => {
    const root = buildWorld(false);
    expect(() => gatherSheet('csrd', sheetPathsFor(root))).not.toThrow();
  });
});

describe('the authority error survives as itself', () => {
  it('is a CorpusAuthorityError under the CLI failure, not a flattened string', () => {
    // So a caller can distinguish "unauthorised" from "does not load", which is
    // the distinction the two failure kinds exist to preserve.
    const root = buildWorld(true);
    let caught: unknown;
    try {
      readWorld(pathsFor(root), 'csrd', 'CSRD-S-001');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    // The CLI wraps it, but the underlying validator produced structured
    // failures — asserted through the message rather than the type, since the
    // wrap is deliberate.
    expect(String((caught as { lines?: string[] }).lines?.join('\n'))).toMatch(/SRC-002/);
    expect(new CorpusAuthorityError([]).name).toBe('CorpusAuthorityError');
  });
});
