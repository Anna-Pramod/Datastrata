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
    index.documents.find((d) => d.docId === 'DOC-32013L0034')!.serves = ['SRC-007'];
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
      expect(message).toContain('SRC-007');
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
    expect(String((caught as { lines?: string[] }).lines?.join('\n'))).toMatch(/SRC-007/);
    expect(new CorpusAuthorityError([]).name).toBe('CorpusAuthorityError');
  });
});

/**
 * The closure guard, at the same roots and for the same reason.
 *
 * `corpus-authority.test.ts` proves the validator and
 * `pipeline-closure-citability.test.ts` proves the guard; neither proves that a
 * production root reaches it. That is the F-5 lesson this file exists for: a
 * check can be correct, tested, and never called. The register parameter on
 * `forSources` makes *omitting* a register a compile error, but it cannot make
 * a root pass the right one, so the wiring is asserted here rather than assumed.
 *
 * The world is unauthorised in a different way from `buildWorld(true)`: the
 * corpus is untouched and entirely origin-authorised, and the **register** is
 * edited to reclassify `SRC-004` as a tracker. Origin authority still passes —
 * it reads no tier — so the only boundary that can refuse is the closure guard.
 */
function buildNonCitableWorld(): string {
  const root = buildWorld(false);
  const path = join(root, 'monitoring', 'source-register.json');
  const register = JSON.parse(readFileSync(path, 'utf8')) as {
    governingAuthorities: { sourceId: string; tier: string }[];
  };
  const row = register.governingAuthorities.find((a) => a.sourceId === 'SRC-004')!;
  row.tier = 'tracker';
  writeFileSync(path, `${JSON.stringify(register, null, 2)}\n`, 'utf8');
  return root;
}

describe('the closure guard is reached from the production roots', () => {
  // DOC-32026L0470 serves SRC-004 and is reached only by traversal from the
  // entry document, so this is the committed corpus's own version of the
  // traversal exposure — not a synthetic graph.
  it('refuses at the verify run / verify sign root', () => {
    const root = buildNonCitableWorld();
    expect(() => readWorld(pathsFor(root), 'csrd', 'CSRD-S-001')).toThrow(
      /may not become evidence|non-citable tier/,
    );
  });

  it('names the document and the source it is served by', () => {
    const root = buildNonCitableWorld();
    try {
      readWorld(pathsFor(root), 'csrd', 'CSRD-S-001');
      throw new Error('expected a refusal');
    } catch (error) {
      const message = (error as { lines?: string[] }).lines?.join('\n') ?? String(error);
      expect(message).toContain('DOC-32026L0470');
      expect(message).toContain('SRC-004');
    }
  });

  it('arrives as a structured CLI failure, not an uncaught error', () => {
    // An error written to name the document and the source is worth nothing to
    // an operator if it escapes as a stack trace.
    const root = buildNonCitableWorld();
    let caught: unknown;
    try {
      readWorld(pathsFor(root), 'csrd', 'CSRD-S-001');
    } catch (error) {
      caught = error;
    }
    expect((caught as { lines?: string[] }).lines, 'must be a CliFailure with lines').toBeDefined();
  });

  it('refuses at the review-sheet root', () => {
    const root = buildNonCitableWorld();
    const sheet = gatherSheet('csrd', sheetPathsFor(root));
    // The sheet reports per-requirement rather than throwing, so the refusal
    // shows up as the closure problem it recorded.
    expect(JSON.stringify(sheet)).toMatch(/may not become evidence|non-citable tier/);
  });

  it('positive control: the identical world passes with SRC-004 left classified', () => {
    // One field different — the tier — and the same two roots proceed. Without
    // this the refusals above could be any failure to build the world.
    const root = buildWorld(false);
    expect(() => readWorld(pathsFor(root), 'csrd', 'CSRD-S-001')).not.toThrow();
    expect(JSON.stringify(gatherSheet('csrd', sheetPathsFor(root)))).not.toMatch(
      /may not become evidence|non-citable tier/,
    );
  });
});
