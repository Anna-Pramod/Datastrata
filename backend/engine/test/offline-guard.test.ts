/**
 * Positive controls for the suite-wide offline guard (B-ADAPTER).
 *
 * A guard nobody has seen fire is a guard that may not be installed. These
 * tests install no trap of their own: they rely on `setupFiles` alone, set
 * live-looking environment variables, drive the production wiring with its
 * default transport, and assert that the attempt reaches the guard and
 * nothing else. The static half keeps the engine on the one network path the
 * guard covers.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { offlineGuard, OFFLINE_GUARD_MESSAGE } from './setup/offline-guard';
import { liveCapabilityFrom, LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV } from '../src/cli/live-wiring';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { LIVE_AGENTS_ENV, LIVE_AGENTS_TOKEN } from '../src/pipeline/live-runner';
import type { RoleRequest } from '../src/pipeline/roles';

afterEach(() => {
  delete process.env[LIVE_AGENTS_ENV];
});

describe('the guard is in place before any test runs', () => {
  it('G1 — a bare fetch anywhere in the suite is refused by the guard and recorded', async () => {
    const before = offlineGuard().calls.length;
    await expect(Promise.resolve().then(() => fetch('https://guard-control.invalid/'))).rejects.toThrow(OFFLINE_GUARD_MESSAGE);
    expect(offlineGuard().calls.slice(before)).toEqual(['https://guard-control.invalid/']);
  });

  it('G2 — live-looking environment variables with the production wiring and its default transport reach the guard, not the network', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const endpoint = 'https://guard-live.invalid/v1/messages';
    const capability = liveCapabilityFrom({
      env: { [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN, [LIVE_ENDPOINT_ENV]: endpoint, [LIVE_API_KEY_ENV]: 'sk-ant-inherited-looking', [LIVE_MAX_ATTEMPTS_ENV]: '27', [LIVE_MAX_INPUT_BYTES_ENV]: '4000000' },
      config: DEFAULT_ROLE_CONFIG,
    });
    const request: RoleRequest = {
      role: 'reader',
      index: 0,
      model: 'claude-opus-5',
      promptSha256: 'a'.repeat(64),
      messages: [
        { from: 'prompt', content: 'p' },
        { from: 'input', content: 'i' },
      ],
    };
    const before = offlineGuard().calls.length;
    await expect(capability.runner!.run(request)).rejects.toThrow(OFFLINE_GUARD_MESSAGE);
    expect(offlineGuard().calls.slice(before)).toEqual([endpoint]);
  });
});

describe('the engine has one network path, and the guard covers it', () => {
  const code = (path: string): string => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
    });

  it('G3 — no engine source imports http, https, net, tls, dns or undici; fetch is the only way out', () => {
    const offenders = files('src').filter((path) => /from\s+'(node:)?(http|https|net|tls|dns|http2|undici)'/.test(code(path)));
    expect(offenders).toEqual([]);
    // Positive control: the pattern matches a real import.
    expect(/from\s+'(node:)?(http|https|net|tls|dns|http2|undici)'/.test("import { request } from 'node:https';")).toBe(true);
    // And `fetch(` occurs in exactly two engine sources — the ingest command,
    // which fetches a document to ingest, and the live runner's transport —
    // both on the path the guard replaces.
    const callers = files('src').filter((path) => /\bfetch\(/.test(code(path))).sort();
    expect(callers).toEqual([join('src', 'cli', 'ingest.ts'), join('src', 'pipeline', 'live-runner.ts')]);
  });

  it('G4 — the agents configuration does not install the guard; the default one does', () => {
    // The offline guard is first; B-CLI-ADAPTER's process guard follows it.
    expect(readFileSync('vitest.config.ts', 'utf8')).toContain("setupFiles: ['test/setup/offline-guard.ts', 'test/setup/process-guard.ts']");
    expect(readFileSync('vitest.agents.config.ts', 'utf8')).not.toContain('offline-guard');
  });
});
