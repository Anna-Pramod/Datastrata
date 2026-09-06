/**
 * Production wiring of the live capability — B-ADAPTER.
 *
 * The verify entry point used to hand orchestration no runner at all. It now
 * asks one function what capability the environment authorises, and that
 * function is what these tests exercise: with everything live-looking present
 * and a fake transport, a whole `verify run` completes through the concrete
 * adapter with the network trap unfired; with any prerequisite missing, a
 * named refusal and no runner. The guarantee is not "no live-runner import
 * reaches the suite" — the import exists — but that no real provider request
 * and no spend is possible during offline tests: the only path to the network
 * is the default transport, every test here injects a fake or installs the
 * trap, and an inherited token and credential in the ambient environment can
 * reach nothing but that trap.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  liveCapabilityFrom,
  LiveWiringError,
  LIVE_API_KEY_ENV,
  LIVE_ENDPOINT_ENV,
  PRODUCTION_ADAPTERS,
} from '../src/cli/live-wiring';
import { dispatch } from '../src/cli/verify';
import type { VerifyPaths } from '../src/cli/sign';
import { EXIT_OK, EXIT_REFUSED } from '../src/cli/exit-codes';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { LIVE_AGENTS_ENV, LIVE_AGENTS_TOKEN } from '../src/pipeline/live-runner';
import { ANTHROPIC_MESSAGES_IDENTITY } from '../src/pipeline/anthropic-messages';
import { UNSELECTED_PROVIDER_ADAPTER, UnknownProviderAdapterError, providerAdapterKey } from '../src/pipeline/provider-adapter';
import type { RunTranscript } from '../src/pipeline/transcript';
import { installNetworkTrap } from './helpers';
import { cannedAnthropicTransport, engineRoot, PACK_ID, REQUIREMENT_ID } from './replay-fixtures';

const LIVE_ENV = { [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN, [LIVE_ENDPOINT_ENV]: 'https://api.example.invalid/v1/messages', [LIVE_API_KEY_ENV]: 'sk-ant-test-inherited' };

let trap: ReturnType<typeof installNetworkTrap>;
let scratch = '';
beforeEach(() => {
  trap = installNetworkTrap();
  scratch = mkdtempSync(join(tmpdir(), 'live-wiring-'));
  mkdirSync(join(scratch, 'requirement-versions'), { recursive: true });
  cpSync(join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`), join(scratch, 'requirement-versions', `${PACK_ID}.json`));
});
afterEach(() => {
  delete process.env[LIVE_AGENTS_ENV];
  trap.restore();
  rmSync(scratch, { recursive: true, force: true });
});

const paths = (): VerifyPaths => ({ packDir: join(engineRoot, 'knowledge', PACK_ID), corpusDir: join(engineRoot, 'corpus'), verificationDir: scratch });

describe('the registry', () => {
  it('W0 — registers the Anthropic Messages adapter under the identity the default configuration selects', () => {
    expect([...PRODUCTION_ADAPTERS.keys()]).toEqual([providerAdapterKey(ANTHROPIC_MESSAGES_IDENTITY)]);
    expect(DEFAULT_ROLE_CONFIG.providerAdapter).toEqual(ANTHROPIC_MESSAGES_IDENTITY);
  });
});

describe('every prerequisite, each refused by name with no runner constructed', () => {
  it('W1 — without the capability token there is no runner, whatever credential and endpoint the environment carries', () => {
    const capability = liveCapabilityFrom({ env: { [LIVE_ENDPOINT_ENV]: LIVE_ENV[LIVE_ENDPOINT_ENV], [LIVE_API_KEY_ENV]: LIVE_ENV[LIVE_API_KEY_ENV] }, config: DEFAULT_ROLE_CONFIG });
    expect(capability.runner).toBeNull();
    const truthy = liveCapabilityFrom({ env: { ...LIVE_ENV, [LIVE_AGENTS_ENV]: 'yes' }, config: DEFAULT_ROLE_CONFIG });
    expect(truthy.runner).toBeNull();
  });

  it('W2 — with the token but no endpoint, or no credential, the wiring refuses naming the variable', () => {
    for (const missing of [LIVE_ENDPOINT_ENV, LIVE_API_KEY_ENV]) {
      const env: NodeJS.ProcessEnv = { ...LIVE_ENV };
      delete env[missing];
      const attempt = () => liveCapabilityFrom({ env, config: DEFAULT_ROLE_CONFIG });
      expect(attempt, missing).toThrow(LiveWiringError);
      expect(attempt, missing).toThrow(new RegExp(missing));
    }
  });

  it('W3 — with everything present but no adapter registered for the configured identity, the wiring refuses by name', () => {
    const attempt = () => liveCapabilityFrom({ env: LIVE_ENV, config: DEFAULT_ROLE_CONFIG, registry: new Map() });
    expect(attempt).toThrow(UnknownProviderAdapterError);
    const unselected = () => liveCapabilityFrom({ env: LIVE_ENV, config: { ...DEFAULT_ROLE_CONFIG, providerAdapter: UNSELECTED_PROVIDER_ADAPTER } });
    expect(unselected).toThrow(/no provider adapter has been selected/);
  });

  it('W4 — an ordinary run under the no-runner capability refuses by name and contacts nothing', async () => {
    const outcome = await dispatch(['run', PACK_ID, REQUIREMENT_ID], paths(), () => true, undefined, liveCapabilityFrom({ env: {}, config: DEFAULT_ROLE_CONFIG }));
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toContain('no agent runner');
    expect(trap.calls).toEqual([]);
  });
});

describe('the positive case, and the inherited-environment case', () => {
  it('W5 — with all live-looking configuration and a fake transport, a whole verify run completes through the adapter and the trap never fires', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const transport = cannedAnthropicTransport();
    let recorded: RunTranscript | null = null;
    const capability = liveCapabilityFrom({ env: LIVE_ENV, config: DEFAULT_ROLE_CONFIG, transport });
    expect(capability.runner?.kind).toBe('live');
    expect(capability.runner?.adapter).toEqual(ANTHROPIC_MESSAGES_IDENTITY);
    const outcome = await dispatch(['run', PACK_ID, REQUIREMENT_ID], paths(), () => true, undefined, { ...capability, record: (t) => { recorded = t; } });
    expect(outcome.exitCode, outcome.lines.join('\n')).toBe(EXIT_OK);
    expect(trap.calls).toEqual([]);
    // One reader, seven prosecutors, one adjudicator, each through the adapter's own request.
    expect(transport.calls).toHaveLength(2 + DEFAULT_ROLE_CONFIG.prosecutorCount);
    expect(transport.calls.every((c) => c.url === LIVE_ENV[LIVE_ENDPOINT_ENV] && c.headers['x-api-key'] === LIVE_ENV[LIVE_API_KEY_ENV])).toBe(true);
    expect(recorded).not.toBeNull();
    expect((recorded as unknown as RunTranscript).roles).toHaveLength(2 + DEFAULT_ROLE_CONFIG.prosecutorCount);
    // The credential reaches no recording.
    expect(JSON.stringify(recorded)).not.toContain(LIVE_ENV[LIVE_API_KEY_ENV]);
  });

  it('W6 — an inherited token and credential with the default transport can reach nothing but the trap: the suite cannot spend', async () => {
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    const capability = liveCapabilityFrom({ env: LIVE_ENV, config: DEFAULT_ROLE_CONFIG });
    expect(capability.runner?.kind).toBe('live');
    await expect(dispatch(['run', PACK_ID, REQUIREMENT_ID], paths(), () => true, undefined, capability)).rejects.toThrow(/NETWORK TRAP/);
    expect(trap.calls).toEqual([LIVE_ENV[LIVE_ENDPOINT_ENV]]);
  });
});
