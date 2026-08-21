/**
 * Behaviour-derived read coverage: every file the public path actually opens is
 * declared in the deployable closure.
 *
 * Plan Task 2 behaviour 8; design §4.3. `VERIFICATION_RUNTIME_INPUTS` was
 * written from the design's semantics — what each member is *for* — and until
 * the resolver existed there was nothing to hold it to. This is the fast inner
 * loop that does: instrument the reads, and assert each one is matched by a
 * declared glob. It catches a new runtime read on the day it is written, which
 * the isolated-artifact gate catches only on the day someone deploys.
 *
 * **It is not the evidence, and it must not be mistaken for it.** A test run
 * inside the repository cannot prove a file reached the standalone artifact —
 * the repository masks the answer. `npm run test:standalone` is where that is
 * settled (§4.2).
 *
 * **The fixture has to make the resolver run.** Over the real repository no
 * requirement carries a governing signature, so the loader stops at
 * `freshness_unchecked` and the resolver is never called. A recorder watching
 * that would observe only the loader's own reads — authored knowledge and the
 * version registry — and a coverage test built on it would pass having proven
 * nothing about the members the resolver owns. That is failure mode 7, and the
 * span assertion below is what closes it: the recorded set must reach the
 * corpus **and** the pinned verification result, not merely be non-empty.
 *
 * **Paths are matched against the real repository, not the fixture's temporary
 * directory.** The fixture symlinks authored knowledge, the corpus and the
 * registry to the real ones and mirrors the production layout exactly, so
 * substituting the real engine root for the fixture's is a change of spelling
 * and not of subject.
 */

import { describe, expect, it, vi } from 'vitest';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildFixtureRepository, REAL_ENGINE_ROOT } from './fixture-repository';

/**
 * Every `readFileSync` performed while the recorder is armed.
 *
 * At the filesystem call, not at a seam inside `lib/pack.ts`. A production
 * function that reported its own reads would be a second declaration of what it
 * reads, agreeing with the first by construction — the derivation has to come
 * from somewhere neither the resolver nor the closure declaration authored.
 */
const recorder = vi.hoisted(() => ({ paths: [] as string[], armed: false }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const readFileSync = (path: unknown, ...rest: unknown[]): unknown => {
    if (recorder.armed && typeof path === 'string') recorder.paths.push(path);
    return (actual.readFileSync as unknown as (...args: unknown[]) => unknown)(path, ...rest);
  };
  return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});

const { loadVerifiedCsrdPack } = await import('@/lib/pack');

interface RuntimeInput {
  member: string;
  purpose: string;
  onAbsence: 'fatal' | 'silent';
  globs: string[];
}

/**
 * The declaration, imported through a computed specifier.
 *
 * `next.config.mjs` cannot import TypeScript, so the closure is declared in
 * plain `.mjs`; this app's `tsconfig.json` sets `allowJs: false`, so a static
 * import of it would not compile. The URL is built at runtime for that reason
 * alone — the module is the same one the build configuration spends.
 */
const declarationUrl = new URL('../verification-runtime-inputs.mjs', import.meta.url).href;
const declaration = (await import(/* @vite-ignore */ declarationUrl)) as {
  VERIFICATION_RUNTIME_INPUTS: RuntimeInput[];
  verificationTracingGlobs: () => string[];
};

/** The app directory, which is what `outputFileTracingIncludes` resolves globs against. */
const APP_DIR = process.cwd();

/**
 * `**` crosses directory boundaries, `*` does not, and `**​/` may match nothing
 * at all — `knowledge/**​/*.json` has to match `knowledge/csrd/pack.json`, which
 * a naive `.*` for `**` followed by a literal `/` would miss.
 */
function globToRegExp(glob: string): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; ) {
    if (glob.startsWith('**/', i)) {
      source += '(?:[^/]*/)*';
      i += 3;
    } else if (glob.startsWith('**', i)) {
      source += '.*';
      i += 2;
    } else if (glob[i] === '*') {
      source += '[^/]*';
      i += 1;
    } else {
      source += (glob[i] as string).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${source}$`);
}

/** Which declared member claims this path, or `undefined` if none does. */
function memberOwning(path: string): string | undefined {
  return declaration.VERIFICATION_RUNTIME_INPUTS.find((input) =>
    input.globs.some((glob) => globToRegExp(resolve(APP_DIR, glob)).test(path)),
  )?.member;
}

/**
 * Loads a fixture repository through the shipped path with the recorder armed,
 * and returns every read it performed, spelled against the real repository.
 */
function recordReadsOf(engineRoot: string): { engineReads: string[]; strayReads: string[]; ratified: number } {
  const prefixes = [engineRoot, realpathSync(engineRoot)];
  recorder.paths = [];
  recorder.armed = true;
  let ratified: number;
  try {
    ratified = loadVerifiedCsrdPack(engineRoot).requirements.filter(
      (r) => r.derivedStatus === 'ratified',
    ).length;
  } finally {
    recorder.armed = false;
  }

  const engineReads: string[] = [];
  const strayReads: string[] = [];
  for (const raw of recorder.paths) {
    const path = resolve(raw);
    const prefix = prefixes.find((candidate) => path.startsWith(`${candidate}/`));
    if (prefix === undefined) strayReads.push(path);
    else engineReads.push(resolve(REAL_ENGINE_ROOT, path.slice(prefix.length + 1)));
  }
  return { engineReads: [...new Set(engineReads)].sort(), strayReads, ratified };
}

describe('every runtime read of verification state is declared in the closure', () => {
  const fixture = buildFixtureRepository();
  const { engineReads, strayReads, ratified } = recordReadsOf(fixture.engineRoot);

  it('actually reached the resolver, rather than stopping at freshness_unchecked', () => {
    // The positive control for everything below. Without it the recorded set is
    // the loader's alone, and every assertion in this file is about a subject
    // that never ran.
    expect(ratified).toBe(fixture.allIds.length);
    expect(engineReads.length).toBeGreaterThan(0);
  });

  it('spans the members the resolver owns, not only the ones the loader reads', () => {
    const members = new Set(engineReads.map(memberOwning));

    // The concrete minimum: corpus state and the pinned verification result.
    // "More than one member" would be satisfied by knowledge plus the registry,
    // which the loader read before this seam existed.
    expect(members).toContain('corpus-state-for-freshness');
    expect(members).toContain('pinned-verification-results');
    expect(members).toContain('signature-ledger');
  });

  it('opens nothing it has not declared', () => {
    const uncovered = engineReads.filter((path) => memberOwning(path) === undefined);
    expect(
      uncovered,
      `runtime reads matched by no glob in VERIFICATION_RUNTIME_INPUTS:\n  ${uncovered.join('\n  ')}`,
    ).toEqual([]);
  });

  it('read nothing outside the engine root it was given', () => {
    expect(strayReads).toEqual([]);
  });

  it('declares globs and emits them — the config spends the declaration, not a copy', () => {
    // Asserted on the emitted projection rather than on the file's prose, which
    // names every member in English and would satisfy a grep for a glob that is
    // no longer there.
    expect(declaration.verificationTracingGlobs()).toEqual(
      declaration.VERIFICATION_RUNTIME_INPUTS.flatMap((input) => input.globs),
    );
  });
});
