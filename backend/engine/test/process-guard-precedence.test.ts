/**
 * Why this file exists: the tests that import the process-guard setup
 * module install the guard by importing it, so they prove the guard works,
 * not that vitest installed it before any test module ran. This file imports
 * nothing from the setup module and nothing from `src` statically. Its first
 * case checks the guard's marker by literal name on both routes to the
 * builtin — the CJS module object and the ESM named export — before touching
 * any launch API, and only then asks the guard to refuse `/bin/echo` and a
 * shell string. Remove the setup entry from `vitest.config.ts` and the first
 * case goes red on the marker, before any spawn.
 *
 * The later cases import the transport and the setup module dynamically,
 * after the first case has already decided: the transport's production
 * default `launch` must reach the guard (a transport that captured the
 * original `spawn` at import time would not), and the guard's positive
 * side must hold — a dummy inside a registered directory does launch,
 * through the real `spawn`, while `shell: true`, a relative path, a `..`
 * escape and `fork` are refused even there. The registration and launch
 * rules themselves — what a directory may be, what a file may be — are
 * `process-guard.test.ts`'s, which imports the setup module freely.
 */
import { describe, expect, it } from 'vitest';
import * as childProcessEsm from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const childProcessCjs = require('node:child_process') as typeof childProcessEsm;

const MESSAGE = 'PROCESS GUARD: the default suite attempted to launch';
const APIS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const;

describe('the process guard precedes every test module', () => {
  it('P0 — a module that imports nothing from the setup finds the guard already installed, by its literal name, on both routes to the builtin', () => {
    // Literal, on purpose: an import from the setup module would install the
    // guard and prove nothing about `setupFiles`.
    expect(childProcessCjs.spawn.name).toBe('processGuardSpawn');
    // The ESM named export is what `src/pipeline/claude-code-cli-transport.ts`
    // imports; a guard that patched only the CJS object would leave it bare.
    expect(childProcessEsm.spawn.name).toBe('processGuardSpawn');
    for (const api of APIS) {
      expect(childProcessCjs[api].name, api).toMatch(/^processGuard/);
      expect(childProcessEsm[api].name, api).toMatch(/^processGuard/);
    }
  });

  it('P1 — an absolute path outside every registered directory is refused by name on either route, and a shell string is refused always', () => {
    expect(() => childProcessCjs.spawn('/bin/echo', ['precedence'])).toThrow(`${MESSAGE} /bin/echo`);
    expect(() => childProcessEsm.spawn('/bin/echo', ['precedence'])).toThrow(`${MESSAGE} /bin/echo`);
    expect(() => childProcessCjs.execSync('true')).toThrow(`${MESSAGE} true`);
    expect(() => childProcessCjs.exec('true')).toThrow(`${MESSAGE} true`);
    expect(() => childProcessCjs.spawnSync('/bin/echo')).toThrow(`${MESSAGE} /bin/echo`);
    expect(() => childProcessCjs.execFile('/bin/echo')).toThrow(`${MESSAGE} /bin/echo`);
    expect(() => childProcessCjs.execFileSync('/bin/echo')).toThrow(`${MESSAGE} /bin/echo`);
    expect(() => childProcessCjs.fork('/bin/echo')).toThrow(`${MESSAGE} /bin/echo`);
  });

  it('P2 — the transport, imported afterwards with its production default launch, is stopped by the guard on a pin that passes', async () => {
    const { createSpawnTransport } = await import('../src/pipeline/claude-code-cli-transport');
    const { processGuard } = await import('./setup/process-guard');
    // A pin that passes, so the only thing between the transport and a child
    // is the guard: `/bin/echo` as it is on this machine.
    const bytes = readFileSync('/bin/echo');
    const executable = { path: '/bin/echo', sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length };
    const tempRoot = mkdtempSync(join(tmpdir(), 'ds-process-guard-precedence-'));
    try {
      const transport = createSpawnTransport({ executable, inheritedEnv: { HOME: '/nonexistent', USER: 'precedence', PATH: '/usr/bin:/bin' }, controls: {}, tempRoot });
      const before = processGuard().calls.length;
      await expect(transport.runGate(new AbortController().signal)).rejects.toThrow(`${MESSAGE} /bin/echo via spawn`);
      expect(processGuard().calls.slice(before)).toEqual(['spawn /bin/echo']);
      expect(transport.activeChildren()).toBe(0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('P3 — positive control: a dummy inside a registered directory launches through the real spawn; shell, relative, escape and fork are refused even there', async () => {
    const { allowDummyDir, processGuard } = await import('./setup/process-guard');
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ds-process-guard-dummy-')));
    try {
      const dummy = join(dir, 'dummy.sh');
      writeFileSync(dummy, '#!/bin/sh\nprintf dummy-ran\n', { mode: 0o700 });
      // Not yet registered: refused, so registration is what decides.
      expect(() => childProcessCjs.spawn(dummy)).toThrow(`${MESSAGE} ${dummy}`);
      expect(allowDummyDir(dir)).toBe(dir);

      const before = processGuard().calls.length;
      const child = childProcessCjs.spawn(dummy, [], { stdio: ['ignore', 'pipe', 'ignore'] });
      let stdout = '';
      child.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      const exitCode = await new Promise<number | null>((resolve) => child.once('exit', resolve));
      expect(exitCode).toBe(0);
      expect(stdout).toBe('dummy-ran');
      // The other file-taking APIs reach their originals for a registered dummy too.
      expect(childProcessCjs.execFileSync(dummy, { encoding: 'utf8' })).toBe('dummy-ran');
      expect(childProcessCjs.spawnSync(dummy, { encoding: 'utf8' }).stdout).toBe('dummy-ran');
      expect(processGuard().calls.slice(before)).toEqual([`spawn ${dummy}`, `execFileSync ${dummy}`, `spawnSync ${dummy}`]);

      const refusedBefore = processGuard().refused.length;
      expect(() => childProcessCjs.spawn(dummy, [], { shell: true })).toThrow(/shell: true is refused/);
      expect(() => childProcessCjs.execFileSync(dummy, { shell: true })).toThrow(/shell: true is refused/);
      expect(() => childProcessCjs.spawn('dummy.sh', [], { cwd: dir })).toThrow(/not an absolute path/);
      // A `..` escape is refused for not being normalised, before any
      // directory is consulted: the kernel resolves `..` after the symlink
      // before it, so a lexically-normalised path would not be the one run.
      expect(() => childProcessCjs.spawn(`${dir}/../../../../../../bin/echo`)).toThrow(/not a normalised path/);
      expect(() => childProcessCjs.fork(dummy)).toThrow(/fork launches the Node executable/);
      expect(() => childProcessCjs.exec(dummy)).toThrow(/a shell command string never resolves/);
      expect(() => allowDummyDir('relative/dir')).toThrow(/absolute/);
      // Every refusal above is on the record, and the allowed launches are not.
      expect(processGuard().refused.slice(refusedBefore)).toHaveLength(6);
      expect(processGuard().refused.slice(refusedBefore).map((entry) => entry.split(' ')[0])).toEqual(['spawn', 'execFileSync', 'spawn', 'spawn', 'fork', 'exec']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
