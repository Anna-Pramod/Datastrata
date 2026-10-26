/**
 * `/healthz` and the report behind it (DP1 plan, Task 8; PLT-6, its DP1 part).
 *
 * **Why this file exists.** A hosted site that answers 200 can still be answering from the wrong state: a runtime input the build
 * never traced reads as absent or empty, and the ledger in particular degrades silently (`verification-runtime-inputs.mjs`). So
 * `/healthz` reports three things and refuses unless all three hold: the pack loaded with its integrity, every runtime-input
 * directory was readable (each reported as a digest a clean clone can recompute, Task 13's check 5), and a fixed synthetic check
 * gave the cells the authored oracle states. Each is held here in both directions:
 *
 * ```
 * the identity      release and deployment are what the platform supplied, matched by pattern, or unknown
 * the directories   named the way the readers name them, never from the tracing globs (failure mode 1)
 * the digest        equal to an oracle walked and hashed separately here; a changed byte changes it (failure mode 7)
 * the fixed check   the constant is the authored case, and a changed cell or a throw refuses
 * the report        pure, and each part able to refuse on its own (failure mode 4)
 * the route         200 on the repository; 503 on a damaged record, an unreadable directory, a changed cell, no engine root;
 *                   no path, stack or message in the body; one log line when it refuses, none when it answers
 * ```
 *
 * The route is driven the way `public-resolver-seam.test.ts` drives the check: the shipped `engineRoot()` probe finds the
 * repository from the working directory, and a fixture repository in the production layout is reached by `process.chdir`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';
import { IntegrityFailureError } from '@datastrata/engine';
import type { Condition, KnowledgePack } from '@datastrata/engine';
import { buildCheckTimeline, TimelineRefusalError } from '@/lib/check-timeline';
import { csrdPack, engineRoot, loadVerifiedCsrdPack } from '@/lib/pack';
import {
  deploymentOf,
  directoryDigest,
  fixedCheckHolds,
  HEALTH_CHECK_CASE,
  healthReport,
  releaseOf,
  RUNTIME_INPUT_KEYS,
  runtimeInputDirectories,
  UNSHIPPED_FILES,
  type HealthObservations,
  type RuntimeInputKey,
} from '@/lib/health';
import { GET } from '@/app/healthz/route';
import { buildFixtureRepository, REAL_ENGINE_ROOT } from './fixture-repository';

/** Vercel's own example values (`HOST-VARIABLES-SOURCE.md`): a commit SHA and a deployment ID. */
const SHA = 'fa1eade47b73733d6312d5abfad33ce9e4068081';
const DEPLOYMENT = 'dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3';

// ---------------------------------------------------------------------------
// The oracle: the digest rule written out again, and walked its own way
// ---------------------------------------------------------------------------

interface Digest {
  files: number;
  sha256: string;
}

/**
 * The digest of `dir` by the rule, computed without `lib/health.ts`: an explicit stack rather than recursion, `statSync` to follow
 * links as `readFileSync` does, and the lines built and hashed here. `excluded` is relative to `dir`, written out per directory
 * below rather than taken from the module's list.
 */
function oracleDigest(dir: string, excluded: readonly string[] = []): Digest {
  const lines: [path: string, sha256: string][] = [];
  const pending: string[] = [''];
  while (pending.length > 0) {
    const at = pending.pop()!;
    for (const name of readdirSync(join(dir, at))) {
      const path = at === '' ? name : `${at}/${name}`;
      const stats = statSync(join(dir, path));
      if (stats.isDirectory()) pending.push(path);
      else if (!excluded.includes(path)) lines.push([path, createHash('sha256').update(readFileSync(join(dir, path))).digest('hex')]);
    }
  }
  lines.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const text = lines.map(([path, sha256]) => `${sha256}  ${path}\n`).join('');
  return { files: lines.length, sha256: createHash('sha256').update(text, 'utf8').digest('hex') };
}

/** The four directories of the repository this checkout holds, by the oracle, with the three named files left out. */
const REPO: Record<'knowledge' | 'corpus' | 'verification' | 'monitoring', Digest> = {
  knowledge: oracleDigest(join(REAL_ENGINE_ROOT, 'knowledge', 'csrd')),
  corpus: oracleDigest(join(REAL_ENGINE_ROOT, 'corpus'), ['.gitkeep']),
  verification: oracleDigest(join(REAL_ENGINE_ROOT, 'verification'), ['CSRD-S-001.md']),
  monitoring: oracleDigest(join(REAL_ENGINE_ROOT, 'monitoring'), ['automation-prompt.md']),
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Runs `fn` as a process whose working directory is `dir`, and puts it back (as `public-resolver-seam.test.ts`). */
async function inRepository<T>(dir: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

/** What `/healthz` answered: the status, its `Cache-Control`, the raw text and the parsed body. */
async function healthz(get: typeof GET = GET): Promise<{ status: number; cache: string | null; text: string; body: Record<string, unknown> }> {
  const response = await get();
  const text = await response.text();
  return { status: response.status, cache: response.headers.get('cache-control'), text, body: JSON.parse(text) as Record<string, unknown> };
}

/** The pack's identity as the report gives it. */
function identityOf(pack: KnowledgePack): { version: string; legalSnapshot: string } {
  return { version: pack.version, legalSnapshot: pack.legalSnapshot };
}

/**
 * Everything written during one test, by channel: standard output and standard error, and the five console methods. Vitest gives
 * each worker its own console, whose output never passes through `process.stdout.write`, so a spy on stdout alone would miss a
 * `console.log`. Reset before each test, restored after it.
 */
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
type Channel = 'stdout' | 'stderr' | `console.${(typeof CONSOLE_METHODS)[number]}`;
let captured: Record<Channel, string[]>;
const lines = (): string[] => captured.stdout.join('').split('\n').filter((line) => line.length > 0);
/** What reached any channel but standard output, as `channel: text`, so a failure names where it went. */
const elsewhere = (): string[] =>
  (Object.keys(captured) as Channel[]).filter((channel) => channel !== 'stdout' && captured[channel].length > 0).map((channel) => `${channel}: ${captured[channel].join('')}`);

beforeEach(() => {
  captured = { stdout: [], stderr: [], 'console.log': [], 'console.info': [], 'console.warn': [], 'console.error': [], 'console.debug': [] };
  for (const [stream, channel] of [[process.stdout, 'stdout'], [process.stderr, 'stderr']] as const) {
    vi.spyOn(stream, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      captured[channel].push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stdout.write);
  }
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      captured[`console.${method}`].push(`${format(...args)}\n`);
    });
  }
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', undefined);
  vi.stubEnv('VERCEL_DEPLOYMENT_ID', undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  expect([process.stdout.write, process.stderr.write, ...CONSOLE_METHODS.map((method) => console[method])].map((fn) => vi.isMockFunction(fn))).toEqual([false, false, false, false, false, false, false]);
});

/** The one refusal line `/healthz` writes, parsed, with the fields that identify it; and nothing written anywhere else. */
function theRefusalLine(): { keys: string[]; event: unknown; route: unknown; status: unknown } {
  const all = lines();
  expect(all, 'exactly one line for the refusal').toHaveLength(1);
  expect(elsewhere(), 'nothing written on any other channel').toEqual([]);
  const parsed = JSON.parse(all[0]!) as Record<string, unknown>;
  return { keys: Object.keys(parsed), event: parsed['event'], route: parsed['route'], status: parsed['status'] };
}

/** Strings the body of a refusal must never carry, with the fixture's own paths in both spellings. */
function leaks(text: string, paths: readonly string[]): string[] {
  const needles = [
    ...paths,
    ...paths.map((path) => realpathSync(path)),
    'verification-result.json',
    'invalid_result',
    'IntegrityFailureError',
    'TimelineRefusalError',
    'Error',
    'pack.json',
    'VERCEL_',
    'DATASTRATA_',
    '    at ',
  ];
  return [...new Set(needles)].filter((needle) => text.includes(needle));
}

// ---------------------------------------------------------------------------
// release and deployment
// ---------------------------------------------------------------------------

describe('release and deployment: what the platform supplies, or unknown, never guessed', () => {
  it('are unknown when the platform supplies nothing', () => {
    expect(releaseOf(undefined)).toBe('unknown');
    expect(deploymentOf(undefined)).toBe('unknown');
  });

  it('are the value itself when it matches its pattern: 40 lowercase hexadecimal characters; 1 to 64 of [A-Za-z0-9_-]', () => {
    expect(releaseOf(SHA)).toBe(SHA);
    expect(deploymentOf(DEPLOYMENT)).toBe(DEPLOYMENT);
    for (const id of ['x', 'A', '0', '_', '-', 'a'.repeat(64), 'dpl-ABC_09']) expect(deploymentOf(id), id).toBe(id);
  });

  it.each([
    ['an uppercase SHA', SHA.toUpperCase()],
    ['39 characters', SHA.slice(0, 39)],
    ['41 characters', `${SHA}0`],
    ['a space inside', `${SHA.slice(0, 20)} ${SHA.slice(21)}`],
    ['a leading space, never trimmed', ` ${SHA}`],
    ['a trailing newline, never trimmed', `${SHA}\n`],
    ['a slash', `${SHA.slice(0, 39)}/`],
    ['a non-hex letter', `${SHA.slice(0, 39)}g`],
    ['empty', ''],
  ])('release is unknown for %s, never echoed, trimmed or repaired', (_name, value) => {
    expect(releaseOf(value)).toBe('unknown');
    // The counterexample in the same test: the pattern is not refusing everything.
    expect(releaseOf(SHA)).toBe(SHA);
  });

  it.each([
    ['a space', 'dpl 7Gw5ZMBpQA8h9GF832KGp7nwbuh3'],
    ['a slash', 'dpl/7Gw5ZMBpQA8h9GF832KGp7nwbuh3'],
    ['a dot', 'dpl_7Gw5.x'],
    ['65 characters', 'a'.repeat(65)],
    ['a trailing newline, never trimmed', `${DEPLOYMENT}\n`],
    ['empty', ''],
  ])('deployment is unknown for %s', (_name, value) => {
    expect(deploymentOf(value)).toBe('unknown');
    expect(deploymentOf(DEPLOYMENT)).toBe(DEPLOYMENT);
  });

  it('are read when /healthz answers, not when it was loaded: set after import, they appear; unset, unknown', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SHA);
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', DEPLOYMENT);
    const set = await healthz();
    expect({ release: set.body['release'], deployment: set.body['deployment'] }).toEqual({ release: SHA, deployment: DEPLOYMENT });

    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SHA.toUpperCase());
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl/7Gw5');
    const wrong = await healthz();
    expect({ release: wrong.body['release'], deployment: wrong.body['deployment'] }).toEqual({ release: 'unknown', deployment: 'unknown' });
    // Neither variable's value nor its name reaches the body when it is refused.
    expect(wrong.text).not.toContain(SHA.toUpperCase());
    expect(wrong.text).not.toContain('dpl/7Gw5');
  });
});

describe('the environment the health report and the log line read', () => {
  const FILES = ['../lib/health.ts', '../lib/log.ts', '../app/healthz/route.ts'];
  /** A module's code with its comments removed, so prose that names a variable is not taken for reading it. */
  const code = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const READ = /process\.env(?:\.\w+|\[|\b)/g;
  const readsOf = (text: string) => [...text.matchAll(READ)].map((match) => match[0]).sort();

  /**
   * Every other way to reach the environment: `process` indexed by a string (`process['env']`), `env` destructured from
   * `process`, `process` reached through `globalThis`, and `process` or its `env` imported from the module (`node:process`).
   * Each, if written, would read the environment without matching `READ`, so each is refused outright.
   */
  const OTHER_ACCESS: [string, RegExp][] = [
    ['process indexed by a string', /\bprocess\s*\[/],
    ['env destructured from process', /\{[^}]*\benv\b[^}]*\}\s*=\s*process\b/],
    ['process through globalThis', /\bglobalThis\s*(?:\.\s*process|\[)/],
    ['an import of the process module', /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"](?:node:)?process['"]/],
  ];

  it.each([
    ['../lib/health.ts', 'none: the report is handed the two values', []],
    ['../lib/log.ts', 'VERCEL_GIT_COMMIT_SHA alone, for the line’s release', ['process.env.VERCEL_GIT_COMMIT_SHA']],
    ['../app/healthz/route.ts', 'VERCEL_GIT_COMMIT_SHA and VERCEL_DEPLOYMENT_ID, each once, when it answers', ['process.env.VERCEL_DEPLOYMENT_ID', 'process.env.VERCEL_GIT_COMMIT_SHA']],
  ])('%s reads %s, each by name, never the whole environment or a computed key', (file, _what, expected) => {
    expect(readsOf(code(file))).toEqual(expected);
  });

  it.each(FILES)('%s reaches the environment no other way: no process[…], no destructured env, no globalThis.process, no process import', (file) => {
    const found = OTHER_ACCESS.filter(([, pattern]) => pattern.test(code(file))).map(([name]) => name);
    expect(found, `${file} reaches the environment another way: ${found.join(', ')}`).toEqual([]);
  });

  it('never names the automation bypass secret or the OIDC token, the two variables the host marks secret', () => {
    const all = FILES.map(code).join('\n');
    expect(all).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(all).not.toContain('VERCEL_OIDC_TOKEN');
  });

  it('positive control: the scan finds a named read, a computed key and the whole environment where they are written', () => {
    const planted = "const a = process.env.VERCEL_AUTOMATION_BYPASS_SECRET; const b = process.env['X']; const { c } = process.env;";
    expect([...planted.matchAll(READ)].map((match) => match[0])).toEqual(['process.env.VERCEL_AUTOMATION_BYPASS_SECRET', 'process.env[', 'process.env']);
  });

  it('positive control: each other access form is found where it is written', () => {
    const planted: Record<string, string> = {
      'process indexed by a string': "const e = process['env'];",
      'env destructured from process': 'const { env } = process;',
      'process through globalThis': 'const v = globalThis.process.env.X;',
      'an import of the process module': "import { env } from 'node:process';",
    };
    for (const [name, pattern] of OTHER_ACCESS) {
      expect([name, pattern.test(planted[name]!)]).toEqual([name, true]);
      // And none fires on the plain named read the files are allowed.
      expect([name, pattern.test('const sha = process.env.VERCEL_GIT_COMMIT_SHA;')]).toEqual([name, false]);
    }
    expect(OTHER_ACCESS.find(([name]) => name === 'an import of the process module')![1].test("import process from 'process';")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The runtime-input directories
// ---------------------------------------------------------------------------

describe('the runtime-input directories, named the way the readers name them', () => {
  const healthCode = () =>
    readFileSync(fileURLToPath(new URL('../lib/health.ts', import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('are four, hand-named: knowledge, corpus, verification and monitoring', () => {
    expect([...RUNTIME_INPUT_KEYS]).toEqual(['knowledge', 'corpus', 'verification', 'monitoring']);
  });

  it('resolve under the engine root they are given: the pack directory, the corpus, the verification state, and the register beside knowledge/', () => {
    const root = '/an/engine/root';
    const dirs = runtimeInputDirectories(root);
    expect(dirs).toEqual({
      knowledge: join(root, 'knowledge', 'csrd'),
      corpus: join(root, 'corpus'),
      verification: join(root, 'verification'),
      monitoring: join(root, 'monitoring'),
    });
    // The loader's convention for the register (`defaultSourceRegisterDir`): two levels up from the pack directory.
    expect(dirs.monitoring).toBe(join(dirs.knowledge, '..', '..', 'monitoring'));
  });

  it('are not taken from the tracing declaration, so an untraced file shows as a digest that differs (failure mode 1)', () => {
    expect(healthCode()).not.toMatch(/verification-runtime-inputs|verificationTracingGlobs|VERIFICATION_RUNTIME_INPUTS/);
    // The control: the build configuration does spend the declaration, so the scan can see it where it is.
    expect(readFileSync(fileURLToPath(new URL('../next.config.mjs', import.meta.url)), 'utf8')).toMatch(/verificationTracingGlobs/);
  });

  it('are derived from the root handed in, never from a folded working-directory path or a clock', () => {
    expect(healthCode()).not.toMatch(/process\.cwd\(|__dirname|import\.meta|Date\.now|new Date\(/);
    // The control: the scan finds the working-directory probe in the module that owns it.
    expect(readFileSync(fileURLToPath(new URL('../lib/pack.ts', import.meta.url)), 'utf8')).toMatch(/process\.cwd\(/);
  });

  it('reuse the readers’ own helpers for three of them: packDirOf, corpusDirOf and verificationDirOf, imported from lib/pack and called, with no join of their own', () => {
    const imported = /import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/pack['"]/.exec(healthCode())?.[1]?.split(',').map((name) => name.trim()) ?? [];
    const OWN_JOIN = /\bjoin\(\s*root\s*,|\bjoin\([^)]*['"](?:knowledge|corpus|verification)['"]/;
    for (const helper of ['packDirOf', 'corpusDirOf', 'verificationDirOf']) {
      expect([helper, imported.includes(helper), new RegExp(`\\b${helper}\\(\\s*root\\s*\\)`).test(healthCode())]).toEqual([helper, true, true]);
    }
    expect(healthCode()).not.toMatch(OWN_JOIN);
    // The controls: the scan finds the import list it reads, and the forbidden join where one is written.
    expect(imported).toContain('loadVerifiedCsrdPack');
    for (const planted of ["corpus: join(root, 'corpus'),", "join(base, 'knowledge', 'csrd')", "verification: join(r, 'verification')"]) expect(planted).toMatch(OWN_JOIN);
  });

  it('are traced into /healthz’s own function exactly as into /api/check’s: both routes spend the one declaration, called again, never a second list', async () => {
    const config = ((await import(/* @vite-ignore */ new URL('../next.config.mjs', import.meta.url).href)) as { default: { outputFileTracingIncludes?: Record<string, string[]> } }).default;
    const declaration = (await import(/* @vite-ignore */ new URL('../verification-runtime-inputs.mjs', import.meta.url).href)) as { verificationTracingGlobs: () => string[] };
    const includes = config.outputFileTracingIncludes ?? {};
    expect(Object.keys(includes).sort()).toEqual(['/api/check', '/healthz']);
    expect(includes['/healthz'], '/healthz traces the declared closure').toEqual(declaration.verificationTracingGlobs());
    expect(includes['/api/check'], '/api/check traces the declared closure').toEqual(declaration.verificationTracingGlobs());
    // The control: the closure is not empty, and it carries the member whose absence is silent.
    expect(declaration.verificationTracingGlobs()).toContain('../../backend/engine/verification/signatures.jsonl');
    // Spent, not copied: each key's value is a call of the projection in the configuration's own text.
    const text = readFileSync(fileURLToPath(new URL('../next.config.mjs', import.meta.url)), 'utf8');
    for (const route of ['/api/check', '/healthz']) expect([route, new RegExp(`'${route}':\\s*verificationTracingGlobs\\(\\)`).test(text)]).toEqual([route, true]);
  });

  it('leave out exactly three files the repository holds there, by name, each of which exists', () => {
    expect([...UNSHIPPED_FILES]).toEqual(['verification/CSRD-S-001.md', 'monitoring/automation-prompt.md', 'corpus/.gitkeep']);
    for (const file of UNSHIPPED_FILES) expect([file, statSync(join(REAL_ENGINE_ROOT, file)).isFile()]).toEqual([file, true]);
  });
});

// ---------------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------------

describe('the digest of each directory', () => {
  const dirs = runtimeInputDirectories(REAL_ENGINE_ROOT);

  it('equals, over the repository, the oracle computed here by the rule: shasum lines, sorted by path, hashed', () => {
    for (const key of RUNTIME_INPUT_KEYS) {
      expect([key, directoryDigest(REAL_ENGINE_ROOT, dirs[key])]).toEqual([key, REPO[key]]);
      expect([key, REPO[key].files > 0]).toEqual([key, true]);
    }
  });

  /**
   * A known answer, computed outside this code: the three files below were written with `printf`, and the digest taken with
   * standard tools on 2026-10-26 (evidence `logs/12-f6-known-answer-vector.log`):
   *
   *   find -L "$D" -type f | sed "s|^$D/||" | LC_ALL=C sort \
   *     | while IFS= read -r f; do printf '%s  %s\n' "$(shasum -a 256 "$D/$f" | cut -d' ' -f1)" "$f"; done > lines.txt
   *   wc -l < lines.txt       -> 3
   *   shasum -a 256 < lines.txt -> de43d950f8ed53f7c6215ea626d6bc9276e2678159ad973b9c2c4c79ca65d5e6
   *
   * The names make the order matter: code-unit order puts `B.txt` (0x42) before `a…` (0x61) and `a-b.txt` (0x2D) before
   * `a/c.txt` (0x2F), where a locale sort gives `a-b.txt a/c.txt B.txt` and a sorted depth-first walk gives `a/c.txt` before
   * `a-b.txt`. The oracle above re-implements the rule in this language; this constant pins it to the tools Task 13 uses.
   */
  const VECTOR = { files: 3, sha256: 'de43d950f8ed53f7c6215ea626d6bc9276e2678159ad973b9c2c4c79ca65d5e6' };

  it('gives the shasum-computed known answer for a three-file directory whose order depends on code units', () => {
    const root = mkdtempSync(join(tmpdir(), 'health-vector-'));
    const dir = join(root, 'vector');
    mkdirSync(join(dir, 'a'), { recursive: true });
    writeFileSync(join(dir, 'B.txt'), 'B\n');
    writeFileSync(join(dir, 'a-b.txt'), 'dash\n');
    writeFileSync(join(dir, 'a', 'c.txt'), 'nested\n');
    expect(directoryDigest(root, dir)).toEqual(VECTOR);
    // The control: one byte of one file moves the answer, so the constant is not met by any directory at all.
    writeFileSync(join(dir, 'a', 'c.txt'), 'nestee\n');
    expect(directoryDigest(root, dir).sha256).not.toBe(VECTOR.sha256);
  });

  it('leaves the three named files out, and each would have changed its digest had it been counted', () => {
    for (const [key, name] of [['corpus', '.gitkeep'], ['verification', 'CSRD-S-001.md'], ['monitoring', 'automation-prompt.md']] as const) {
      const counted = oracleDigest(dirs[key]);
      expect([key, counted.files]).toEqual([key, REPO[key].files + 1]);
      expect([key, name, counted.sha256]).not.toEqual([key, name, REPO[key].sha256]);
    }
  });

  it('changes with one byte of a copied file, with a file added beside a named one, and not with the named file itself', () => {
    const root = mkdtempSync(join(tmpdir(), 'health-digest-'));
    cpSync(join(REAL_ENGINE_ROOT, 'knowledge'), join(root, 'knowledge'), { recursive: true });
    cpSync(join(REAL_ENGINE_ROOT, 'monitoring'), join(root, 'monitoring'), { recursive: true });
    const copy = runtimeInputDirectories(root);

    // The copy agrees with the repository before anything is changed.
    expect(directoryDigest(root, copy.knowledge)).toEqual(REPO.knowledge);
    expect(directoryDigest(root, copy.monitoring)).toEqual(REPO.monitoring);

    const manifest = join(copy.knowledge, 'pack.json');
    const original = readFileSync(manifest);
    const changed = Buffer.from(original);
    changed[0] = changed[0]! ^ 0x01;
    writeFileSync(manifest, changed);
    expect(directoryDigest(root, copy.knowledge).sha256).not.toBe(REPO.knowledge.sha256);
    expect(directoryDigest(root, copy.knowledge)).toEqual(oracleDigest(copy.knowledge));
    writeFileSync(manifest, original);
    expect(directoryDigest(root, copy.knowledge)).toEqual(REPO.knowledge);

    writeFileSync(join(copy.monitoring, 'automation-prompt.md'), 'changed, and still not counted\n');
    expect(directoryDigest(root, copy.monitoring)).toEqual(REPO.monitoring);
    writeFileSync(join(copy.monitoring, 'notes.md'), 'a file nothing names\n');
    expect(directoryDigest(root, copy.monitoring).files).toBe(REPO.monitoring.files + 1);
    expect(directoryDigest(root, copy.monitoring).sha256).not.toBe(REPO.monitoring.sha256);
  });

  it('follows links the way the readers do: a fixture whose knowledge, corpus and register are links digests as the repository', () => {
    const fixture = buildFixtureRepository({ requirementIds: [] });
    const linked = runtimeInputDirectories(fixture.engineRoot);
    expect(lstatSync(join(fixture.engineRoot, 'corpus')).isSymbolicLink()).toBe(true);
    for (const key of ['knowledge', 'corpus', 'monitoring'] as const) {
      expect([key, directoryDigest(fixture.engineRoot, linked[key])]).toEqual([key, REPO[key]]);
    }
  });

  it('is readable and empty for a directory holding no counted file', () => {
    const root = mkdtempSync(join(tmpdir(), 'health-empty-'));
    mkdirSync(join(root, 'corpus'));
    writeFileSync(join(root, 'corpus', '.gitkeep'), '');
    expect(directoryDigest(root, join(root, 'corpus'))).toEqual({ files: 0, sha256: createHash('sha256').update('').digest('hex') });
  });

  it.each([
    ['missing', (dir: string) => dir],
    ['a file, not a directory', (dir: string) => (writeFileSync(dir, 'not a directory\n'), dir)],
    ['holding a link that does not resolve', (dir: string) => (mkdirSync(dir), symlinkSync(join(dir, 'nowhere'), join(dir, 'index.json')), dir)],
    ['holding a link that loops', (dir: string) => (mkdirSync(dir), symlinkSync(dir, join(dir, 'again')), dir)],
  ])('throws for a directory %s, rather than digesting what it could see', (_name, make) => {
    const root = mkdtempSync(join(tmpdir(), 'health-unreadable-'));
    expect(() => directoryDigest(root, make(join(root, 'corpus')))).toThrow();
  });

  it('throws for a directory holding a file that cannot be read, and the file really cannot be (the control)', () => {
    const root = mkdtempSync(join(tmpdir(), 'health-unreadable-'));
    mkdirSync(join(root, 'corpus'));
    const file = join(root, 'corpus', 'index.json');
    writeFileSync(file, '{}\n');
    chmodSync(file, 0o000);
    try {
      expect(() => readFileSync(file)).toThrow();
      expect(() => directoryDigest(root, join(root, 'corpus'))).toThrow();
    } finally {
      chmodSync(file, 0o644);
    }
  });
});

// ---------------------------------------------------------------------------
// The fixed synthetic check
// ---------------------------------------------------------------------------

interface CasesFile {
  assessmentDate: string;
  cases: { id: string; answers: Record<string, unknown>; routes: { id: string; lines: { kind: string; requirement: string; cells: string[] }[] }[] }[];
}

describe('the fixed synthetic check', () => {
  const FILE = JSON.parse(readFileSync(fileURLToPath(new URL('./checker-cases.json', import.meta.url)), 'utf8')) as CasesFile;

  it('is the authored case itself: its id, its answers, its rows, lines and cells as checker-cases.json writes them, at the file’s date', () => {
    const authored = FILE.cases.find((c) => c.id === HEALTH_CHECK_CASE.id);
    expect(authored, `checker-cases.json holds ${HEALTH_CHECK_CASE.id}`).toBeDefined();
    expect({ id: HEALTH_CHECK_CASE.id, answers: HEALTH_CHECK_CASE.answers, routes: HEALTH_CHECK_CASE.routes }).toEqual({
      id: authored!.id,
      answers: authored!.answers,
      routes: authored!.routes,
    });
    expect(HEALTH_CHECK_CASE.assessmentDate).toBe(FILE.assessmentDate);
  });

  it('is a case with more than one cell state and the national line, so a column or a state moved is seen', () => {
    const states = new Set(HEALTH_CHECK_CASE.routes.flatMap((r) => r.lines.flatMap((l) => l.cells.map((cell) => cell.split(' ')[0]))));
    expect(states.size).toBeGreaterThanOrEqual(2);
    expect(HEALTH_CHECK_CASE.routes.map((r) => r.id)).toContain('national');
  });

  it('holds over the repository’s pack', () => {
    expect(fixedCheckHolds(csrdPack())).toBe(true);
  });

  it('fails when a cell differs: the individual route’s first-application line made to apply in every year', () => {
    const changed = structuredClone(csrdPack());
    changed.requirements.find((r) => r.id === 'CSRD-S-017')!.condition = { op: 'in_catalogue', fact: 'entity.incorporation_country', catalogue: 'eu_member_states' } as Condition;
    // The control: the change builds without throwing, and really moves a cell.
    const timeline = buildCheckTimeline(changed, HEALTH_CHECK_CASE.answers, HEALTH_CHECK_CASE.assessmentDate);
    expect(timeline.routes[0]!.lines[0]!.cells.map((c) => c.state)).toEqual(['applies', 'applies', 'applies', 'applies']);
    expect(fixedCheckHolds(changed)).toBe(false);
  });

  it('lets a refusal out rather than reading it as a pass: the national line made to apply throws TimelineRefusalError', () => {
    const refusing = structuredClone(csrdPack());
    refusing.requirements.find((r) => r.id === 'CSRD-S-013')!.condition = { op: 'in_catalogue', fact: 'entity.incorporation_country', catalogue: 'eu_member_states' } as Condition;
    expect(() => fixedCheckHolds(refusing)).toThrow(TimelineRefusalError);
  });
});

// ---------------------------------------------------------------------------
// healthReport, pure
// ---------------------------------------------------------------------------

describe('healthReport: pure, and each part able to refuse on its own (failure mode 4)', () => {
  const PACK = { version: '0.1.0', legalSnapshot: '2026-07-26' };
  const READABLE = {
    knowledge: { files: 11, sha256: 'a'.repeat(64) },
    corpus: { files: 9, sha256: 'b'.repeat(64) },
    verification: { files: 1, sha256: 'c'.repeat(64) },
    monitoring: { files: 1, sha256: 'd'.repeat(64) },
  };
  const WELL: HealthObservations = { commitSha: undefined, deploymentId: undefined, pack: PACK, inputs: READABLE, fixedCheck: true };

  it('is ok when the pack loaded, every directory was readable and the fixed check held, with its keys in order', () => {
    const report = healthReport(WELL);
    expect(report).toEqual({ status: 'ok', release: 'unknown', deployment: 'unknown', pack: PACK, inputs: READABLE, engine: 'ok' });
    expect(Object.keys(report)).toEqual(['status', 'release', 'deployment', 'pack', 'inputs', 'engine']);
    expect(Object.keys(report.inputs)).toEqual(['knowledge', 'corpus', 'verification', 'monitoring']);
  });

  it('refuses when the pack did not load, even with every other observation passing (an input the route never produces)', () => {
    expect(healthReport({ ...WELL, pack: null })).toEqual({ status: 'refused', release: 'unknown', deployment: 'unknown', pack: null, inputs: READABLE, engine: 'refused' });
  });

  it('refuses when the fixed check did not hold, with the pack and the directories passing', () => {
    expect(healthReport({ ...WELL, fixedCheck: false })).toEqual({ status: 'refused', release: 'unknown', deployment: 'unknown', pack: PACK, inputs: READABLE, engine: 'refused' });
  });

  it.each(['knowledge', 'corpus', 'verification', 'monitoring'] as const)('refuses when %s was not readable, with the engine still ok', (key) => {
    const report = healthReport({ ...WELL, inputs: { ...READABLE, [key]: null } });
    expect(report).toEqual({ status: 'refused', release: 'unknown', deployment: 'unknown', pack: PACK, inputs: { ...READABLE, [key]: null }, engine: 'ok' });
  });

  it('gives release and deployment through the same functions as the log line, never the raw value', () => {
    expect(healthReport({ ...WELL, commitSha: SHA, deploymentId: DEPLOYMENT })).toMatchObject({ release: SHA, deployment: DEPLOYMENT });
    expect(healthReport({ ...WELL, commitSha: ` ${SHA}`, deploymentId: 'dpl/7' })).toMatchObject({ release: 'unknown', deployment: 'unknown' });
  });
});

// ---------------------------------------------------------------------------
// GET /healthz
// ---------------------------------------------------------------------------

describe('GET /healthz', () => {
  it('answers 200 over the repository, with the pack, the four digests the oracle gives, no-store, and writes no line', async () => {
    const { status, cache, body } = await healthz();
    expect(body).toEqual({ status: 'ok', release: 'unknown', deployment: 'unknown', pack: identityOf(csrdPack()), inputs: REPO, engine: 'ok' });
    expect(status).toBe(200);
    expect(cache).toBe('no-store');
    // Silence here is meaningful only beside the refusals below, each of which writes its line through the same capture.
    expect(lines()).toEqual([]);
    expect(elsewhere(), 'nothing written on any channel').toEqual([]);
  });

  it('answers 503 when the verification record is damaged (a pinned result gone): the pack part fails, the directories do not, and no path or message reaches the body', async () => {
    const fixture = buildFixtureRepository({ omitResults: true });

    // The positive control: the underlying failure carries the path, so a body without it shows the route removed it.
    let thrown: unknown;
    try {
      loadVerifiedCsrdPack(fixture.engineRoot);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IntegrityFailureError);
    expect(JSON.stringify((thrown as IntegrityFailureError).refusals)).toContain(join(fixture.engineRoot, 'verification', 'csrd'));

    const { status, cache, text, body } = await inRepository(fixture.repoRoot, () => healthz());

    // The property first: a record that fails its integrity check is not a loaded pack, whatever the status code says.
    expect(body['pack'], 'the pack part: a damaged verification record is not a loaded pack').toBeNull();
    expect(body['engine']).toBe('refused');
    expect(body['status']).toBe('refused');
    expect(status).toBe(503);
    expect(cache).toBe('no-store');
    expect(body).toEqual({
      status: 'refused',
      release: 'unknown',
      deployment: 'unknown',
      pack: null,
      inputs: { knowledge: REPO.knowledge, corpus: REPO.corpus, verification: oracleDigest(join(fixture.engineRoot, 'verification')), monitoring: REPO.monitoring },
      engine: 'refused',
    });
    expect(leaks(text, [fixture.repoRoot, fixture.engineRoot])).toEqual([]);
    expect(theRefusalLine()).toEqual({ keys: ['at', 'event', 'route', 'status', 'ms', 'release'], event: 'health.refused', route: '/healthz', status: 503 });
  });

  it.each([
    ['missing', (dir: string) => unlinkSync(dir)],
    ['a file in its place', (dir: string) => (unlinkSync(dir), writeFileSync(dir, 'not a directory\n'))],
    ['a link that does not resolve', (dir: string) => (unlinkSync(dir), symlinkSync(join(dir, '..', 'nowhere'), dir))],
  ])('answers 503 when one directory is %s: only that input is null, and the pack and the engine still pass', async (_name, damage) => {
    const fixture = buildFixtureRepository({ requirementIds: [] });
    const corpus = join(fixture.engineRoot, 'corpus');
    // A link to the real corpus: removing it removes the link alone, never the corpus.
    expect(lstatSync(corpus).isSymbolicLink()).toBe(true);
    damage(corpus);

    const { status, text, body } = await inRepository(fixture.repoRoot, () => healthz());

    expect((body['inputs'] as Record<string, unknown>)['corpus'], 'the corpus part').toBeNull();
    expect(status).toBe(503);
    expect(body).toEqual({
      status: 'refused',
      release: 'unknown',
      deployment: 'unknown',
      pack: identityOf(csrdPack()),
      inputs: { knowledge: REPO.knowledge, corpus: null, verification: oracleDigest(join(fixture.engineRoot, 'verification')), monitoring: REPO.monitoring },
      engine: 'ok',
    });
    expect(leaks(text, [fixture.repoRoot, fixture.engineRoot])).toEqual([]);
    expect(theRefusalLine()).toMatchObject({ event: 'health.refused', route: '/healthz', status: 503 });
  });

  it('answers 503 when a directory holds a file that cannot be read', async () => {
    const fixture = buildFixtureRepository({ requirementIds: [] });
    const corpus = join(fixture.engineRoot, 'corpus');
    expect(lstatSync(corpus).isSymbolicLink()).toBe(true);
    unlinkSync(corpus);
    mkdirSync(corpus);
    const file = join(corpus, 'index.json');
    writeFileSync(file, '{}\n');
    chmodSync(file, 0o000);
    try {
      expect(() => readFileSync(file)).toThrow();
      const { status, body } = await inRepository(fixture.repoRoot, () => healthz());
      expect(body).toMatchObject({ status: 'refused', pack: identityOf(csrdPack()), engine: 'ok' });
      expect((body['inputs'] as Record<string, unknown>)['corpus']).toBeNull();
      expect(status).toBe(503);
    } finally {
      chmodSync(file, 0o644);
    }
  });

  /**
   * The fixture's own copy of a runtime-input directory, made a real copy first where the fixture links it to the repository's,
   * so that damage written into it never reaches the real knowledge, corpus or register.
   */
  function ownCopy(engineRoot: string, key: RuntimeInputKey): string {
    const top = join(engineRoot, key);
    if (lstatSync(top).isSymbolicLink()) {
      const target = realpathSync(top);
      unlinkSync(top);
      cpSync(target, top, { recursive: true });
    }
    expect([key, lstatSync(top).isSymbolicLink()]).toEqual([key, false]);
    return runtimeInputDirectories(engineRoot)[key];
  }

  it.each(['knowledge', 'corpus', 'verification', 'monitoring'] as const)(
    'answers 503 when %s holds a link that does not resolve: only that input is null, and the pack and the engine still pass',
    async (key) => {
      const fixture = buildFixtureRepository({ requirementIds: [] });
      const fixtureVerification = oracleDigest(join(fixture.engineRoot, 'verification'));
      const dir = ownCopy(fixture.engineRoot, key);
      symlinkSync(join(dir, 'nowhere'), join(dir, 'stray'));

      const { status, text, body } = await inRepository(fixture.repoRoot, () => healthz());

      expect((body['inputs'] as Record<string, unknown>)[key], `the ${key} part`).toBeNull();
      expect(status).toBe(503);
      expect(body).toEqual({
        status: 'refused',
        release: 'unknown',
        deployment: 'unknown',
        pack: identityOf(csrdPack()),
        inputs: { knowledge: REPO.knowledge, corpus: REPO.corpus, verification: fixtureVerification, monitoring: REPO.monitoring, [key]: null },
        engine: 'ok',
      });
      expect(leaks(text, [fixture.repoRoot, fixture.engineRoot])).toEqual([]);
      expect(theRefusalLine()).toMatchObject({ event: 'health.refused', route: '/healthz', status: 503 });
    },
  );

  it.each([
    ['corpus', 'only that input is null; the pack and the engine still pass, since nothing unsigned reads the corpus', true, ['corpus']],
    ['verification', 'that input is null, and the pack does not load (its version registry lives there), so the engine refuses too', false, ['verification']],
    ['monitoring', 'that input is null, and the pack does not load (the loader refuses without the register), so the engine refuses too', false, ['monitoring']],
    ['knowledge', 'no engine root is found at all (the root is named by the pack manifest inside it), so every input is null and the pack and the engine refuse', false, ['knowledge', 'corpus', 'verification', 'monitoring']],
  ] as const)('answers 503 when %s is missing: %s', async (key, _what, packLoads, unread) => {
    const fixture = buildFixtureRepository({ requirementIds: [] });
    const readable = { knowledge: REPO.knowledge, corpus: REPO.corpus, verification: oracleDigest(join(fixture.engineRoot, 'verification')), monitoring: REPO.monitoring };
    // Moved aside, never deleted: for a link, the link alone moves, and the repository's directory is untouched.
    renameSync(join(fixture.engineRoot, key), join(fixture.engineRoot, `${key}.moved`));

    const { status, text, body } = await inRepository(fixture.repoRoot, () => healthz());

    expect((body['inputs'] as Record<string, unknown>)[key], `the ${key} part`).toBeNull();
    expect(status).toBe(503);
    expect(body).toEqual({
      status: 'refused',
      release: 'unknown',
      deployment: 'unknown',
      pack: packLoads ? identityOf(csrdPack()) : null,
      inputs: { ...readable, ...Object.fromEntries(unread.map((k) => [k, null])) },
      engine: packLoads ? 'ok' : 'refused',
    });
    expect(leaks(text, [fixture.repoRoot, fixture.engineRoot])).toEqual([]);
    expect(theRefusalLine()).toMatchObject({ event: 'health.refused', route: '/healthz', status: 503 });
  });

  it.each([
    ['individual', 0, 'CSRD-S-017', 3],
    ['individual', 1, 'CSRD-S-020', 1],
    ['national', 0, 'CSRD-S-013', 3],
  ] as const)('answers 503 when one cell of the %s route’s line %i (%s) differs, in start-year column %i: every line of the fixed case can refuse', async (routeId, lineIndex, requirement, column) => {
    const authored = HEALTH_CHECK_CASE.routes.find((r) => r.id === routeId)!.lines[lineIndex]!;
    expect(authored.requirement).toBe(requirement);
    vi.resetModules();
    vi.doMock('@/lib/check-timeline', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/check-timeline')>();
      return {
        ...actual,
        buildCheckTimeline: (...args: Parameters<typeof actual.buildCheckTimeline>) => {
          const timeline = actual.buildCheckTimeline(...args);
          const line = timeline.routes.find((r) => r.id === routeId)!.lines[lineIndex]!;
          const cell = line.cells[column]!;
          line.cells[column] = { ...cell, state: cell.state === 'applies' ? 'does_not_apply' : cell.state === 'does_not_apply' ? 'applies' : 'cannot_decide' };
          return timeline;
        },
      };
    });
    try {
      // The control: the mocked timeline really moves that cell, and only that line's.
      const mocked = await import('@/lib/check-timeline');
      const moved = mocked.buildCheckTimeline(csrdPack(), HEALTH_CHECK_CASE.answers, HEALTH_CHECK_CASE.assessmentDate);
      const movedLine = moved.routes.find((r) => r.id === routeId)!.lines[lineIndex]!;
      expect(movedLine.requirement).toBe(requirement);
      expect(movedLine.cells[column]!.state).not.toBe(authored.cells[column]!.split(' ')[0]);

      const { GET: changedGet } = await import('@/app/healthz/route');
      const { status, body } = await healthz(changedGet);
      expect(body['engine'], `the engine part, with ${requirement}'s ${2025 + column} cell moved`).toBe('refused');
      expect(status).toBe(503);
      expect(body).toEqual({ status: 'refused', release: 'unknown', deployment: 'unknown', pack: identityOf(csrdPack()), inputs: REPO, engine: 'refused' });
      expect(theRefusalLine()).toMatchObject({ event: 'health.refused', route: '/healthz', status: 503 });
    } finally {
      vi.doUnmock('@/lib/check-timeline');
      vi.resetModules();
    }
  });

  it('answers 503 when the fixed check’s cells differ: the engine part fails, the pack and the directories do not', async () => {
    vi.resetModules();
    vi.doMock('@/lib/check-timeline', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/check-timeline')>();
      return {
        ...actual,
        buildCheckTimeline: (...args: Parameters<typeof actual.buildCheckTimeline>) => {
          const timeline = actual.buildCheckTimeline(...args);
          const line = timeline.routes[0]!.lines[0]!;
          line.cells[2] = { ...line.cells[2]!, state: line.cells[2]!.state === 'applies' ? 'does_not_apply' : 'applies' };
          return timeline;
        },
      };
    });
    try {
      const { GET: changedGet } = await import('@/app/healthz/route');
      const { status, body } = await healthz(changedGet);
      expect(body['engine'], 'the engine part').toBe('refused');
      expect(status).toBe(503);
      expect(body).toEqual({ status: 'refused', release: 'unknown', deployment: 'unknown', pack: identityOf(csrdPack()), inputs: REPO, engine: 'refused' });
      expect(theRefusalLine()).toMatchObject({ event: 'health.refused', route: '/healthz', status: 503 });
    } finally {
      vi.doUnmock('@/lib/check-timeline');
      vi.resetModules();
    }
  });

  it('answers 503 when the fixed check throws, the throw becoming the engine part’s failure and never a message', async () => {
    vi.resetModules();
    vi.doMock('@/lib/check-timeline', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/check-timeline')>();
      return {
        ...actual,
        buildCheckTimeline: () => {
          throw new actual.TimelineRefusalError('CSRD-S-013', 'national', 2025, 'APPLIES');
        },
      };
    });
    try {
      const { GET: throwingGet } = await import('@/app/healthz/route');
      const { status, text, body } = await healthz(throwingGet);
      expect(body).toEqual({ status: 'refused', release: 'unknown', deployment: 'unknown', pack: identityOf(csrdPack()), inputs: REPO, engine: 'refused' });
      expect(status).toBe(503);
      expect(text).not.toContain('CSRD-S-013');
      expect(leaks(text, [])).toEqual([]);
    } finally {
      vi.doUnmock('@/lib/check-timeline');
      vi.resetModules();
    }
  });

  it('answers 503 with every part failed when no engine root can be found, and the probe’s paths stay out of the body', async () => {
    const nowhere = mkdtempSync(join(tmpdir(), 'healthz-no-engine-'));

    // The control: the probe's own error names the absolute paths it looked at.
    const probe = await inRepository(nowhere, () => {
      try {
        engineRoot();
        return 'found';
      } catch (error) {
        return String(error);
      }
    });
    expect(probe).toContain(realpathSync(nowhere));

    const { status, text, body } = await inRepository(nowhere, () => healthz());
    expect(body).toEqual({
      status: 'refused',
      release: 'unknown',
      deployment: 'unknown',
      pack: null,
      inputs: { knowledge: null, corpus: null, verification: null, monitoring: null },
      engine: 'refused',
    });
    expect(status).toBe(503);
    expect(leaks(text, [nowhere])).toEqual([]);
    expect(text).not.toContain('backend');
    expect(theRefusalLine()).toMatchObject({ event: 'health.refused', route: '/healthz', status: 503 });
  });
});
