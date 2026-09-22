/**
 * Why this file exists: the process guard's exemption is the one hole in the
 * default suite's "no executable starts" claim, so its edges are what decide
 * whether the pinned CLI can be launched by a test that registers the wrong
 * directory or points a symlink the wrong way. An independent review found
 * both: `allowDummyDir` took any absolute directory, and containment was a
 * string-prefix test on the unresolved path. Each rule that closed those is
 * asserted here by the message it names, with a positive control beside the
 * refusals so a guard that refused everything could not pass.
 *
 * This file imports the setup module, so it proves the rules, not that
 * vitest installed the guard first — `process-guard-precedence.test.ts` is
 * that evidence. Every launch attempted here is either refused before the
 * original `spawn` is reached, or is a `/bin/sh` script that exits without
 * doing anything. The one symlink at the pinned CLI's path is created
 * pointing at the path string only; the guard refuses it before any spawn,
 * and the assertions include that the original was never reached.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { PROCESS_GUARD_MESSAGE, allowDummyDir, processGuard } from './setup/process-guard';

const HOME = homedir();
const PINNED_CLI_PATH = join(HOME, '.local', 'share', 'claude', 'versions', '2.1.226');

/** The exemption set before a case, so a case can assert exactly what it added. */
function registeredSnapshot(): Set<string> {
  return new Set(processGuard().allowedDirs);
}

describe('allowDummyDir — what a registered directory may be', () => {
  it('R1 — a relative path is refused as not absolute', () => {
    const before = registeredSnapshot();
    expect(() => allowDummyDir('relative/dir')).toThrow(/allowDummyDir needs an absolute path/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R2 — the filesystem root is refused by name', () => {
    const before = registeredSnapshot();
    expect(() => allowDummyDir('/')).toThrow(/the filesystem root is refused/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R3 — the home directory is refused by name', () => {
    const before = registeredSnapshot();
    expect(() => allowDummyDir(HOME)).toThrow(/the home directory is refused/);
    expect(() => allowDummyDir(`${HOME}/`)).toThrow(/the home directory is refused/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R4 — the pinned CLI versions directory is refused for what it names, whether or not it exists', () => {
    const before = registeredSnapshot();
    // The refusal must come from the rule, not from existence: a version
    // directory the operator has not installed is refused with the same
    // words as one they have.
    const notInstalled = join(HOME, '.local', 'share', 'claude', 'versions', 'not-a-version', 'nested');
    expect(existsSync(notInstalled)).toBe(false);
    expect(() => allowDummyDir(notInstalled)).toThrow(/HOME\/\.local is refused, it is where the pinned CLI lives/);
    expect(() => allowDummyDir(join(HOME, '.local', 'share', 'claude', 'versions'))).toThrow(/HOME\/\.local is refused/);
    expect(() => allowDummyDir(join(HOME, '.local'))).toThrow(/HOME\/\.local is refused/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R5 — the system directories are refused by name, root and beneath', () => {
    const before = registeredSnapshot();
    expect(() => allowDummyDir('/usr/bin')).toThrow(/\/usr is a system directory and is refused/);
    expect(() => allowDummyDir('/usr')).toThrow(/\/usr is a system directory and is refused/);
    expect(() => allowDummyDir('/bin')).toThrow(/\/bin is a system directory and is refused/);
    expect(() => allowDummyDir('/etc')).toThrow(/\/etc is a system directory and is refused/);
    expect(() => allowDummyDir('/Library/Application Support')).toThrow(/\/Library is a system directory and is refused/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R6 — the engine root and anything under it are refused by name', () => {
    const before = registeredSnapshot();
    const engineRoot = process.cwd();
    expect(existsSync(join(engineRoot, 'vitest.config.ts')), 'the test runs from the engine root').toBe(true);
    expect(() => allowDummyDir(engineRoot)).toThrow(/the engine root is refused/);
    expect(() => allowDummyDir(join(engineRoot, 'test'))).toThrow(/the engine root is refused/);
    expect(() => allowDummyDir(join(engineRoot, 'node_modules', '.bin'))).toThrow(/the engine root is refused/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R7 — os.tmpdir() itself is refused; only a subdirectory of it may be registered', () => {
    const before = registeredSnapshot();
    expect(() => allowDummyDir(tmpdir())).toThrow(/os\.tmpdir\(\) itself is refused/);
    expect(() => allowDummyDir(realpathSync(tmpdir()))).toThrow(/os\.tmpdir\(\) itself is refused/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R8 — an existing directory outside os.tmpdir() that no name-rule covers is refused by the temp-directory rule', () => {
    const before = registeredSnapshot();
    // The parent of the temp directory exists by construction and is under
    // none of the named roots, so the only rule left to refuse it is this one.
    const parent = dirname(realpathSync(tmpdir()));
    expect(lstatSync(parent).isDirectory()).toBe(true);
    expect(() => allowDummyDir(parent)).toThrow(/which is not inside os\.tmpdir\(\)/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R9 — a directory that does not exist is refused, even under os.tmpdir()', () => {
    const before = registeredSnapshot();
    const missing = join(tmpdir(), `ds-process-guard-missing-${process.pid}-${Date.now()}`);
    expect(existsSync(missing)).toBe(false);
    expect(() => allowDummyDir(missing)).toThrow(/it does not exist/);
    expect(processGuard().allowedDirs).toEqual(before);
  });

  it('R10 — a file under os.tmpdir() is refused as not a directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-process-guard-file-'));
    try {
      const before = registeredSnapshot();
      const file = join(dir, 'a-file');
      writeFileSync(file, '');
      expect(() => allowDummyDir(file)).toThrow(/it is not a directory/);
      expect(processGuard().allowedDirs).toEqual(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('R11 — positive control: a mkdtemp subdirectory is accepted, as written or resolved, and its realpath is what is registered and returned', () => {
    // As written: on macOS `os.tmpdir()` is `/var/...`, a symlink into
    // `/private/var/...`, which is the form the transport tests resolve
    // before registering; both forms register the same realpath.
    const written = mkdtempSync(join(tmpdir(), 'ds-process-guard-accept-'));
    const resolved = realpathSync(written);
    try {
      const before = registeredSnapshot();
      expect(before.has(resolved)).toBe(false);
      expect(allowDummyDir(written)).toBe(resolved);
      expect(allowDummyDir(resolved)).toBe(resolved);
      expect(allowDummyDir(`${written}/`)).toBe(resolved);
      const added = [...processGuard().allowedDirs].filter((dir) => !before.has(dir));
      expect(added).toEqual([resolved]);
      // A nested subdirectory of a temp directory is accepted too.
      const nested = join(resolved, 'nested');
      mkdirSync(nested);
      expect(allowDummyDir(nested)).toBe(nested);
    } finally {
      rmSync(written, { recursive: true, force: true });
    }
  });
});

describe('launch — what an executable inside a registered directory may be', () => {
  let registered: string;
  let unregistered: string;

  beforeEach(() => {
    registered = allowDummyDir(mkdtempSync(join(tmpdir(), 'ds-process-guard-launch-')));
    unregistered = realpathSync(mkdtempSync(join(tmpdir(), 'ds-process-guard-sibling-')));
  });

  afterEach(() => {
    rmSync(registered, { recursive: true, force: true });
    rmSync(unregistered, { recursive: true, force: true });
  });

  function scriptAt(path: string): string {
    writeFileSync(path, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    return path;
  }

  it('L1 — positive control: a /bin/sh script that is a regular file inside the registered directory runs, and the guard records the call without refusing it', () => {
    const script = scriptAt(join(registered, 'exit-zero.sh'));
    const calls = processGuard().calls.length;
    const refused = processGuard().refused.length;
    const result = spawnSync(script, [], { encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(processGuard().calls.slice(calls)).toEqual([`spawnSync ${script}`]);
    expect(processGuard().refused.slice(refused)).toEqual([]);
  });

  it('L2 — a symlink inside the registered directory to /bin/echo is refused as a symlink, and the message says it resolves outside', () => {
    const link = join(registered, 'echo-link');
    symlinkSync('/bin/echo', link);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    const calls = processGuard().calls.length;
    const refused = processGuard().refused.length;
    expect(() => spawnSync(link, ['escaped'])).toThrow(`${PROCESS_GUARD_MESSAGE} ${link} via spawnSync: a symlink is refused whatever it points to`);
    expect(processGuard().calls.slice(calls)).toEqual([`spawnSync ${link}`]);
    const [entry] = processGuard().refused.slice(refused);
    expect(entry).toMatch(/a symlink is refused whatever it points to/);
    // Containment is decided on the realpath and reported beside the
    // symlink rule; a string-prefix test on the unresolved path would have
    // called this link "inside".
    expect(entry).toMatch(/it resolves to \/bin\/echo, outside every registered dummy directory/);
  });

  it('L3 — a symlink inside the registered directory at the pinned CLI path is refused synchronously, as a symlink, before the original spawn is reached', () => {
    const link = join(registered, 'claude');
    // The link is made to the path string; whether the operator has that
    // version installed does not change the rule that refuses it.
    symlinkSync(PINNED_CLI_PATH, link);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    const calls = processGuard().calls.length;
    const refused = processGuard().refused.length;

    // Thrown synchronously from `spawn` itself: no ChildProcess is returned,
    // so nothing was started and there is nothing to wait for or kill.
    let thrown: unknown;
    let child: unknown = 'not assigned';
    try {
      child = spawn(link, ['-p', 'hello']);
    } catch (error) {
      thrown = error;
    }
    expect(child).toBe('not assigned');
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain(`${PROCESS_GUARD_MESSAGE} ${link} via spawn: a symlink is refused whatever it points to`);

    expect(processGuard().calls.slice(calls)).toEqual([`spawn ${link}`]);
    const [entry] = processGuard().refused.slice(refused);
    expect(entry).toMatch(/a symlink is refused whatever it points to/);
    if (existsSync(PINNED_CLI_PATH)) {
      expect(entry).toMatch(/outside every registered dummy directory/);
    } else {
      expect(entry).toMatch(/its target does not exist/);
    }
  });

  it('L4 — a symlinked intermediate directory is refused, even though the script it leads to is a regular file', () => {
    const script = scriptAt(join(unregistered, 'exit-zero.sh'));
    const linkedDir = join(registered, 'linked-dir');
    symlinkSync(unregistered, linkedDir);
    const viaLink = join(linkedDir, 'exit-zero.sh');
    expect(lstatSync(viaLink).isFile()).toBe(true);
    const refused = processGuard().refused.length;
    expect(() => spawnSync(viaLink)).toThrow(`${PROCESS_GUARD_MESSAGE} ${viaLink} via spawnSync: ${linkedDir} is a symlinked directory between the registered dummy directory and the executable`);
    expect(processGuard().refused.slice(refused)).toHaveLength(1);
    // The same script reached directly is refused for being outside; the
    // symlinked-directory rule is what named the link, not the destination.
    expect(() => spawnSync(script)).toThrow(/outside every registered dummy directory/);
  });

  it('L5 — a symlink to the registered directory itself is refused as a symlinked directory: the rule is about the link, not where it leads', () => {
    scriptAt(join(registered, 'exit-zero.sh'));
    const alias = join(unregistered, 'alias-to-registered');
    symlinkSync(registered, alias);
    expect(() => spawnSync(join(alias, 'exit-zero.sh'))).toThrow(/is a symlinked directory between the registered dummy directory and the executable/);
  });

  it('L6 — a regular-file script under an unregistered sibling temp directory is refused as outside every registered directory', () => {
    const script = scriptAt(join(unregistered, 'exit-zero.sh'));
    const refused = processGuard().refused.length;
    expect(() => spawnSync(script)).toThrow(`${PROCESS_GUARD_MESSAGE} ${script} via spawnSync: it resolves to ${script}, outside every registered dummy directory`);
    expect(processGuard().refused.slice(refused)).toHaveLength(1);
  });

  it('L7 — a path that is not normalised is refused before any directory is consulted', () => {
    const script = scriptAt(join(registered, 'exit-zero.sh'));
    expect(() => spawnSync(`${registered}/./exit-zero.sh`)).toThrow(/not a normalised path/);
    expect(() => spawnSync(`${registered}//exit-zero.sh`)).toThrow(/not a normalised path/);
    expect(() => spawnSync(`${registered}/sub/../exit-zero.sh`)).toThrow(/not a normalised path/);
    expect(() => spawnSync(`${script}/`)).toThrow(/not a normalised path/);
    // And the normalised form of the same file runs.
    expect(spawnSync(script).status).toBe(0);
  });

  it('L8 — a missing file and a directory inside the registered directory are refused by their own rules', () => {
    expect(() => spawnSync(join(registered, 'missing.sh'))).toThrow(/the executable does not exist/);
    const sub = join(registered, 'a-directory');
    mkdirSync(sub);
    expect(() => spawnSync(sub)).toThrow(/not a regular file/);
  });
});
