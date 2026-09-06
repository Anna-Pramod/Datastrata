/**
 * The process edge routes the live capability to the one command that needs
 * it, and maps a missing live prerequisite to the ordinary named refusal
 * (B-ADAPTER).
 *
 * Driven through `runCli`, the function the process edge itself calls with
 * `process.argv` and `process.env`, over a temporary verification root — so
 * what is tested is the production argument and environment routing, not a
 * capability handed to `dispatch` by hand. The suite-wide offline guard is
 * the only thing between the full-environment case and the network.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli/verify';
import { LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV } from '../src/cli/live-wiring';
import { EXIT_OK, EXIT_REFUSED } from '../src/cli/exit-codes';
import { LIVE_AGENTS_ENV, LIVE_AGENTS_TOKEN } from '../src/pipeline/live-runner';
import { offlineGuard, OFFLINE_GUARD_MESSAGE } from './setup/offline-guard';
import { engineRoot, PACK_ID, REQUIREMENT_ID } from './replay-fixtures';

let root = '';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cli-live-routing-'));
  mkdirSync(join(root, 'verification', 'requirement-versions'), { recursive: true });
  cpSync(join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`), join(root, 'verification', 'requirement-versions', `${PACK_ID}.json`));
});
afterEach(() => {
  delete process.env[LIVE_AGENTS_ENV];
  rmSync(root, { recursive: true, force: true });
});

const TOKEN_ONLY = { [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN };
const roots = () => ({ engineRoot, verificationDir: join(root, 'verification'), outPath: join(root, 'review-sheet.html') });

describe('offline commands under incomplete live configuration', () => {
  it('X1 — the sheet renders with the token set and no endpoint or credential: live wiring is never consulted for it', async () => {
    const outcome = await runCli(['sheet', PACK_ID], TOKEN_ONLY, roots());
    expect(outcome.exitCode, outcome.lines.join('\n')).toBe(EXIT_OK);
    expect(existsSync(join(root, 'review-sheet.html'))).toBe(true);
  });

  it('X2 — a usage error is still a usage error, and a sign request still reaches its own refusals, whatever the live environment lacks', async () => {
    const usage = await runCli(['singh'], TOKEN_ONLY, roots());
    expect(usage.exitCode).not.toBe(EXIT_OK);
    expect(usage.lines.join('\n')).toContain('Unknown subcommand');
    const sign = await runCli(['sign', PACK_ID, REQUIREMENT_ID, '--by', 'A. Reviewer'], TOKEN_ONLY, roots(), () => true);
    expect(sign.exitCode).toBe(EXIT_REFUSED);
    expect(sign.lines.join('\n')).toContain('invalid_result');
  });
});

describe('the run command, and only it, resolves the live capability', () => {
  it('X3 — with the token set and no endpoint, a run is refused by the ordinary named path, not an uncaught exception', async () => {
    const outcome = await runCli(['run', PACK_ID, REQUIREMENT_ID], TOKEN_ONLY, roots());
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toMatch(/live_capability.*DATASTRATA_AGENT_ENDPOINT/);
    expect(existsSync(join(root, 'verification', PACK_ID, REQUIREMENT_ID, 'verification-result.json'))).toBe(false);
  });

  it('X4 — without the token a run is refused by name with nothing contacted, whatever else is set', async () => {
    const before = offlineGuard().calls.length;
    const outcome = await runCli(['run', PACK_ID, REQUIREMENT_ID], { [LIVE_ENDPOINT_ENV]: 'https://routing.invalid/v1/messages', [LIVE_API_KEY_ENV]: 'sk-ant-routing' }, roots());
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toContain('no agent runner');
    expect(offlineGuard().calls.length).toBe(before);
  });

  it('X5 — with the full live environment, production routing reaches the offline guard and nothing beyond it', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const endpoint = 'https://routing-full.invalid/v1/messages';
    const before = offlineGuard().calls.length;
    await expect(runCli(['run', PACK_ID, REQUIREMENT_ID], { ...TOKEN_ONLY, [LIVE_ENDPOINT_ENV]: endpoint, [LIVE_API_KEY_ENV]: 'sk-ant-routing' }, roots())).rejects.toThrow(OFFLINE_GUARD_MESSAGE);
    expect(offlineGuard().calls.slice(before)).toEqual([endpoint]);
    expect(existsSync(join(root, 'verification', PACK_ID, REQUIREMENT_ID, 'verification-result.json'))).toBe(false);
  });
});
