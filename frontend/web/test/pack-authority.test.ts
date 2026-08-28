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
import { CorpusAuthorityError, loadPack } from '@datastrata/engine';
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
    index.documents.find((d) => d.docId === 'DOC-32013L0034')!.serves = ['SRC-007'];
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
    // **Asserted as the authority failure, not merely as a failure.** This test
    // used to match a loose regex on the thrown value. Removing
    // `authoriseCorpus` from this root still reddened it — but only because the
    // unauthorised corpus then crashed downstream with `entry.corpus is not
    // iterable`, an incidental TypeError that says nothing about authority. A
    // tooth that passes through the wrong failure is a tooth that would accept
    // the wrong fix. The typed error and its structured failure are what the
    // root is supposed to produce, and nothing downstream can imitate them.
    const engine = buildRoot(true);
    const resolve = buildCsrdFreshnessResolver(engine);
    try {
      resolve(resolverInput(engine) as never);
      expect.unreachable('the unauthorised corpus must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(CorpusAuthorityError);
      expect((error as CorpusAuthorityError).failures).toContainEqual(
        expect.objectContaining({
          docId: 'DOC-32013L0034',
          sourceId: 'SRC-007',
          reason: 'no declaration',
        }),
      );
    }
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
      authorityFailure = /authoris|SRC-007/i.test(String(error)) ? error : undefined;
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

/**
 * The closure guard, at the public site's root.
 *
 * The engine's `corpus-authority-roots.test.ts` invokes the F-5 lesson — a
 * check can be correct, tested, and never called — and asserts the wiring at
 * the two CLI roots. That claim did not reach here until this block existed:
 * with the guard correctly wired but handed a *fabricated permissive* register
 * instead of the validated one, all 46 frontend and 1535 engine tests still
 * passed. The `register` parameter makes omission a compile error; it cannot
 * make a root pass the right object, so that has to be asserted.
 *
 * The corpus is left entirely origin-authorised and the **register** is edited
 * instead: `SRC-004` becomes a tracker. Origin authority reads no tier, so it
 * still passes, and the closure guard is the only boundary that can refuse.
 * `DOC-32026L0470` serves `SRC-004` and is reached only by traversal from the
 * entry document, so this exercises the committed corpus's own version of the
 * traversal exposure rather than a synthetic graph.
 */
function reclassifySrc004AsTracker(engine: string): void {
  const path = join(engine, 'monitoring', 'source-register.json');
  const register = JSON.parse(readFileSync(path, 'utf8')) as {
    governingAuthorities: { sourceId: string; tier: string }[];
  };
  register.governingAuthorities.find((a) => a.sourceId === 'SRC-004')!.tier = 'tracker';
  writeFileSync(path, `${JSON.stringify(register, null, 2)}\n`, 'utf8');
}

/** Did this failure come from the closure guard, or from something else? */
const isCitabilityRefusal = (error: unknown): boolean =>
  /non-citable tier|may not become evidence|no served source/.test(String(error));

describe('the public site refuses a closure holding evidence it may not show', () => {
  it('refuses when a traversal-reached document is served by a non-citable source', () => {
    const engine = buildRoot(false);
    reclassifySrc004AsTracker(engine);
    const resolve = buildCsrdFreshnessResolver(engine);
    let caught: unknown;
    try {
      resolve(resolverInput(engine) as never);
    } catch (error) {
      caught = error;
    }
    expect(caught, 'the resolver must refuse').toBeDefined();
    expect(isCitabilityRefusal(caught), `refused for the wrong reason: ${String(caught)}`).toBe(true);
    expect(String(caught)).toContain('DOC-32026L0470');
    expect(String(caught)).toContain('SRC-004');
  });

  it('positive control: the identical repository does not refuse with SRC-004 left classified', () => {
    // One field different — the tier — and the guard is silent. Asserted the way
    // its sibling above is: this stub entry carries no corpus pins, so the
    // resolver fails downstream on shape either way, and a bare `not.toThrow()`
    // would be red for a reason that has nothing to do with citability. What
    // must be absent is the *refusal*, not every failure.
    const engine = buildRoot(false);
    const resolve = buildCsrdFreshnessResolver(engine);
    let caught: unknown;
    try {
      resolve(resolverInput(engine) as never);
    } catch (error) {
      caught = error;
    }
    expect(isCitabilityRefusal(caught), 'a classified source must not be refused').toBe(false);
  });
});
