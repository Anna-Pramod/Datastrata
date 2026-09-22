/**
 * The suite-wide process guard — installed before any test module loads.
 *
 * B-CLI-ADAPTER adds a provider route that is a local process: the pinned
 * Claude Code CLI on a subscription. Under the default suite that executable
 * must never start, for the same reason the offline guard exists for
 * `fetch`: a test that reaches it by mistake would authenticate as the
 * operator and spend against the subscription, and a green run that did so
 * would be indistinguishable from one that did not. So this module, run from
 * `setupFiles` and deliberately absent from `vitest.agents.config.ts`,
 * replaces every launch API on the `node:child_process` module object with a
 * function that records the attempt and refuses it — unless the executable
 * is a regular file inside a directory a test has registered through
 * `allowDummyDir`, which is how the transport tests run the `/bin/sh` dummies
 * they write under `mkdtemp`.
 *
 * **What it covers.** `spawn`, `spawnSync`, `execFile`, `execFileSync`,
 * `exec`, `execSync` and `fork` — the seven ways Node starts a process.
 * Shell mediation is refused outright: `shell: true` on any call, and the
 * command string `exec`/`execSync` take, both resolve an executable the guard
 * cannot see, so neither can ever name a registered dummy. `fork` launches
 * the Node executable itself, which is never a dummy, so it is refused too.
 * A relative path is refused because what it resolves to depends on `PATH`
 * and `cwd`; a path that is not already normalised (`.`, `..`, doubled or
 * trailing separators) is refused because the kernel resolves `..` *after*
 * the symlink before it, so a lexically-normalised path and the path the
 * kernel would run can differ.
 *
 * **What a registered directory may be.** An earlier version accepted any
 * absolute directory, so a test could have registered `/`, `$HOME` or
 * `~/.local/share/claude/versions` and exempted the pinned CLI itself. Now
 * `allowDummyDir` refuses by name the filesystem root, the home directory,
 * anything under `HOME/.local` (where the pinned CLI lives), the system
 * directories and the engine root; then requires the directory to exist and
 * resolve, through `realpathSync`, to a strict subdirectory of the resolved
 * `os.tmpdir()` — a `mkdtemp` directory, not the temp root itself. The
 * resolved path is what is registered and returned.
 *
 * **What a launch must be.** The earlier version compared the unresolved
 * path against the registered prefix as a string, so a symlink inside a
 * registered directory pointing at `/bin/echo` — or at the pinned CLI —
 * passed. Now the executable must be an absolute, normalised path; no
 * directory component between the registered directory and the file may be
 * a symlink; the file itself, by `lstatSync`, must be a regular file and not
 * a symlink of any kind; and its `realpathSync` must lie strictly inside a
 * registered directory's realpath. The symlink rule and the containment rule
 * are decided independently and both named in a refusal, so that removing
 * either one changes the message a test can assert on.
 *
 * **How it reaches the transport.** The replacement is made on the CJS
 * module object, and `module.syncBuiltinESMExports()` then re-points the ESM
 * named exports at it, so `import { spawn } from 'node:child_process'` in
 * `src/pipeline/claude-code-cli-transport.ts` sees the guard whether that
 * module loaded before or after this one. `process-guard-precedence.test.ts`
 * asserts both routes by the marker name, then drives the transport's own
 * production default through to the guard. `process-guard.test.ts` holds the
 * registration and launch rules above, each with the message it names.
 *
 * **What it does not claim.** It cannot stop a process started by a native
 * addon, by another runtime, or by a module that captured the original
 * function before this file ran — the static boundary in
 * `pipeline-runner.test.ts` (one importer under `src/pipeline`, no
 * `worker_threads` anywhere) is what keeps such a path out of the engine.
 * It cannot see a hard link: `realpathSync` reports a hard link as the link's
 * own path, so a hard link made inside a registered temp directory to an
 * executable elsewhere on the same filesystem would pass the containment and
 * symlink rules. That is a real gap, not a theoretical one: on the machine
 * this was written on, the pinned CLI and the temp directory sit on the same
 * device (checked with `stat`, never by launching anything), so no
 * cross-volume argument closes it, and a hashed pin would not either, since a
 * hard link to the pinned CLI hashes as the pinned CLI. Nothing here detects
 * it; what stands against it is only that a hard link is a deliberate act by
 * a test author, and that the static boundary keeps every launch path out of
 * the engine but one. And it
 * is not the reason the CLI route refuses to run under `verify run` — that
 * is `SubscriptionRouteCaptureOnlyError` in `live-wiring.ts` — it is the
 * backstop that turns a mistake into a loud failure.
 */

import { lstatSync, realpathSync, type Stats } from 'node:fs';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

export const PROCESS_GUARD_MESSAGE = 'PROCESS GUARD: the default suite attempted to launch';

/**
 * Named, so a test that imports nothing from this module can tell whether the
 * guard was installed before it ran — `process-guard-precedence.test.ts` is
 * that test. Importing this module installs the guard too, which is why the
 * tests that import it cannot serve as that evidence.
 */
export const PROCESS_GUARD_SPAWN_NAME = 'processGuardSpawn';

export const GUARDED_LAUNCH_APIS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const;
export type GuardedLaunchApi = (typeof GUARDED_LAUNCH_APIS)[number];

export interface ProcessGuard {
  /** Every launch attempted through a guarded API, `"<api> <file>"`, allowed or not. */
  readonly calls: string[];
  /** The subset that was refused, with the refusal's reason. */
  readonly refused: string[];
  /** The directories registered through `allowDummyDir`, as their realpaths. */
  readonly allowedDirs: ReadonlySet<string>;
}

type LaunchApi = (this: unknown, ...args: unknown[]) => unknown;

interface GuardState extends ProcessGuard {
  readonly calls: string[];
  readonly refused: string[];
  readonly allowedDirs: Set<string>;
  readonly originals: Readonly<Record<GuardedLaunchApi, LaunchApi>>;
}

const STATE_KEY = Symbol.for('datastrata.process-guard');
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process') as Record<string, unknown>;

/** The state an already-installed guard carries on the replaced `spawn`, if one is installed. */
function installedState(): GuardState | undefined {
  const spawn = childProcess['spawn'];
  if (typeof spawn !== 'function' || spawn.name !== PROCESS_GUARD_SPAWN_NAME) return undefined;
  return (spawn as unknown as Record<symbol, GuardState | undefined>)[STATE_KEY];
}

// Originals are captured once. A second evaluation of this module in the
// same process — vitest re-evaluates setup files per test file when it
// reuses a worker — finds the guard on the module object and keeps the
// originals it already holds, rather than capturing the guard as "original".
const state: GuardState =
  installedState() ??
  {
    calls: [],
    refused: [],
    allowedDirs: new Set<string>(),
    originals: Object.freeze(Object.fromEntries(GUARDED_LAUNCH_APIS.map((api) => [api, childProcess[api] as LaunchApi]))) as Record<GuardedLaunchApi, LaunchApi>,
  };

// ---------------------------------------------------------------------------
// Filesystem helpers. Each answers `undefined` for a path that is not there,
// so a rule can decide what a missing path means for itself.
// ---------------------------------------------------------------------------

function tryLstat(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

function tryRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/** A path with any trailing separator removed, except the root itself. */
function trimSep(path: string): string {
  return path.length > 1 && path.endsWith(sep) ? path.slice(0, -sep.length) : path;
}

/** `true` when `path` is `root` or lies beneath it. The root `/` contains everything, so it is matched exactly by its own rule. */
function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root === sep ? sep : root + sep);
}

/** `true` when `path` lies strictly beneath `root` — at least one component deeper. */
function strictlyWithin(path: string, root: string): boolean {
  return path !== root && within(path, root);
}

// ---------------------------------------------------------------------------
// Registration rules.
// ---------------------------------------------------------------------------

interface ForbiddenRoot {
  readonly path: string;
  /** `true` refuses everything beneath the root as well as the root itself. */
  readonly subtree: boolean;
  readonly rule: string;
}

/**
 * The places a dummy directory may never be, checked by name before the
 * temp-directory rule so the refusal says which place was named. Each root
 * is compared both as written and as resolved, against the candidate both
 * as written and as resolved, so that neither side's symlink hides a match.
 * Computed per call because `process.cwd()` can change.
 */
function forbiddenRoots(): ForbiddenRoot[] {
  const home = trimSep(normalize(homedir()));
  const systemDirs = ['/usr', '/bin', '/sbin', '/opt', '/etc', '/System', '/Library', '/Applications'];
  return [
    { path: sep, subtree: false, rule: 'the filesystem root is refused' },
    { path: home, subtree: false, rule: 'the home directory is refused' },
    { path: join(home, '.local'), subtree: true, rule: 'HOME/.local is refused, it is where the pinned CLI lives' },
    ...systemDirs.map((path) => ({ path, subtree: true, rule: `${path} is a system directory and is refused` })),
    { path: trimSep(normalize(process.cwd())), subtree: true, rule: 'the engine root is refused' },
  ];
}

/** The forbidden rule `candidates` (the directory as written and as resolved) fall under, or `null`. */
function forbiddenBy(candidates: readonly string[]): string | null {
  for (const root of forbiddenRoots()) {
    const resolvedRoot = tryRealpath(root.path);
    const roots = resolvedRoot === undefined || resolvedRoot === root.path ? [root.path] : [root.path, resolvedRoot];
    for (const candidate of candidates) {
      for (const r of roots) {
        if (root.subtree ? within(candidate, r) : candidate === r) return `${root.rule} (${r})`;
      }
    }
  }
  return null;
}

/**
 * Registers a directory whose executables the guard lets through, and
 * returns its realpath, which is what is registered. A test that writes
 * dummies under `mkdtemp` calls this with that directory. The rules, in the
 * order they are checked so the message names the first one broken:
 *
 * 1. absolute;
 * 2. not, by name, the filesystem root, the home directory, anything under
 *    `HOME/.local`, a system directory, or the engine root or anything under
 *    it — decided on the path as written, so a directory that does not exist
 *    is still refused for what it names;
 * 3. an existing directory, resolved through `realpathSync`;
 * 4. rule 2 again on the resolved path;
 * 5. a strict subdirectory of the resolved `os.tmpdir()` — not the temp
 *    root itself.
 */
export function allowDummyDir(dir: string): string {
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw new Error(`allowDummyDir needs an absolute path, got ${JSON.stringify(dir)}`);
  const written = trimSep(normalize(dir));
  const refuse = (reason: string): never => {
    throw new Error(`allowDummyDir refuses ${JSON.stringify(dir)}: ${reason}`);
  };

  const byName = forbiddenBy([written]);
  if (byName !== null) refuse(byName);

  const resolved = tryRealpath(written);
  if (resolved === undefined) {
    // Thrown here rather than through `refuse`, so the narrowing below holds.
    throw new Error(`allowDummyDir refuses ${JSON.stringify(dir)}: it does not exist; a dummy directory is a real directory made with mkdtemp under os.tmpdir()`);
  }
  const resolvedStat = tryLstat(resolved);
  if (resolvedStat === undefined || !resolvedStat.isDirectory()) refuse(`it is not a directory (resolves to ${resolved})`);

  const resolvedByName = forbiddenBy([resolved]);
  if (resolvedByName !== null) refuse(`resolves to ${resolved}; ${resolvedByName}`);

  const tempRoot = realpathSync(tmpdir());
  if (resolved === tempRoot) refuse(`os.tmpdir() itself is refused (${tempRoot}); register a subdirectory made with mkdtemp`);
  if (!strictlyWithin(resolved, tempRoot)) refuse(`resolves to ${resolved}, which is not inside os.tmpdir() (${tempRoot})`);

  state.allowedDirs.add(resolved);
  return resolved;
}

// ---------------------------------------------------------------------------
// Launch rules.
// ---------------------------------------------------------------------------

/** `true` when any options-shaped argument (an object that is not an array) carries a truthy `shell`. */
function asksForShell(args: readonly unknown[]): boolean {
  return args.some((arg) => typeof arg === 'object' && arg !== null && !Array.isArray(arg) && Boolean((arg as { shell?: unknown }).shell));
}

/** The registered directory whose realpath strictly contains `resolved`, or `undefined`. */
function registeredDirContaining(resolved: string): string | undefined {
  for (const dir of state.allowedDirs) {
    if (strictlyWithin(resolved, dir)) return dir;
  }
  return undefined;
}

/**
 * Walks the directory components of `file` upwards until one resolves to a
 * registered directory. A component that is itself a symlink is refused
 * before its target is considered, so a symlink to a registered directory
 * is refused too — the rule is that nothing between the registered
 * directory and the file may be a link, not that links may point anywhere
 * convenient. A component that is not there cannot be a link and is passed
 * over. Answers the reason to refuse, or `null` when the walk found a
 * registered directory or ran out of components (containment then decides).
 */
function symlinkedDirectoryReason(file: string): string | null {
  let dir = dirname(file);
  for (;;) {
    const stat = tryLstat(dir);
    if (stat?.isSymbolicLink()) return `${dir} is a symlinked directory between the registered dummy directory and the executable`;
    if (stat !== undefined) {
      const resolved = tryRealpath(dir);
      if (resolved !== undefined && state.allowedDirs.has(resolved)) return null;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The reason a call must be refused, or `null` when it may reach the original. */
function refusalReason(api: GuardedLaunchApi, file: unknown, rest: readonly unknown[]): string | null {
  if (api === 'exec' || api === 'execSync') return 'a shell command string never resolves to a registered dummy';
  if (api === 'fork') return 'fork launches the Node executable, which is never a registered dummy';
  if (typeof file !== 'string') return 'the executable is not a string path';
  if (asksForShell(rest)) return 'shell: true is refused whatever the path';
  if (!isAbsolute(file)) return 'not an absolute path';
  if (normalize(file) !== file || (file.length > 1 && file.endsWith(sep))) {
    return 'not a normalised path; `.`, `..`, doubled and trailing separators are refused because the kernel resolves them after any symlink before them';
  }

  const symlinkedDirectory = symlinkedDirectoryReason(file);
  if (symlinkedDirectory !== null) return symlinkedDirectory;

  const stat = tryLstat(file);
  if (stat === undefined) return 'the executable does not exist, so it is inside no registered dummy directory';

  // Containment is decided on the realpath, independently of the symlink
  // rule, and reported alongside it: a symlink is refused for being a
  // symlink, and the message also says where it would have led.
  const resolved = tryRealpath(file);
  const containment =
    resolved === undefined
      ? 'its target does not exist'
      : registeredDirContaining(resolved) === undefined
        ? `it resolves to ${resolved}, outside every registered dummy directory`
        : null;

  if (stat.isSymbolicLink()) return `a symlink is refused whatever it points to${containment === null ? '' : `; ${containment}`}`;
  if (containment !== null) return containment;
  if (!stat.isFile()) return 'not a regular file';
  return null;
}

function describe(file: unknown): string {
  return typeof file === 'string' ? file : String(file);
}

function guarded(api: GuardedLaunchApi): LaunchApi {
  const replacement: LaunchApi = function (this: unknown, ...args: unknown[]): unknown {
    const [file, ...rest] = args;
    state.calls.push(`${api} ${describe(file)}`);
    const reason = refusalReason(api, file, rest);
    if (reason !== null) {
      state.refused.push(`${api} ${describe(file)}: ${reason}`);
      throw new Error(`${PROCESS_GUARD_MESSAGE} ${describe(file)} via ${api}: ${reason}`);
    }
    return state.originals[api].apply(this, args);
  };
  const name = api === 'spawn' ? PROCESS_GUARD_SPAWN_NAME : `processGuard${api[0]!.toUpperCase()}${api.slice(1)}`;
  Object.defineProperty(replacement, 'name', { value: name });
  Object.defineProperty(replacement, STATE_KEY, { value: state });
  return replacement;
}

for (const api of GUARDED_LAUNCH_APIS) childProcess[api] = guarded(api);
// The ESM named exports of a builtin are snapshots until this is called.
Module.syncBuiltinESMExports();

/** The guard's record, for the positive controls and the wiring tests. */
export function processGuard(): ProcessGuard {
  const installed = installedState();
  if (installed === undefined) throw new Error('the process guard is not installed; vitest.config.ts must list test/setup/process-guard.ts in setupFiles');
  return installed;
}
