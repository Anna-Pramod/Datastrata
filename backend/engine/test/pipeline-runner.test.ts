/**
 * The default suite cannot reach a live runner, and something is watching.
 *
 * A negative observation needs something observing, or it passes because nothing
 * ever ran (failure mode 7). So every case below installs a network trap — a
 * `fetch` interceptor that records the call and throws — and asserts **both**
 * halves: the named failure arrived, *and* the trap never fired. The positive
 * control drives the real live runner into the trap, so "the trap never fired"
 * is a statement about this code path rather than about a trap that cannot fire.
 *
 * The trap's endpoint is a `.invalid` host. If the trap were ever mis-installed,
 * the escape would be a DNS failure rather than a real request.
 *
 * §5.2's separation is structural rather than conventional, and it is three
 * mechanisms, each checked here:
 *
 *   1. the guard          — a run with no runner refuses before any I/O
 *   2. the capability gate — the live entrypoint refuses without an env token
 *   3. the import boundary — nothing under `src/` imports the live runner
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MissingAgentRunnerError, requireRunner } from '../src/pipeline/runner';
import {
  AgentCapabilityError,
  MissingProviderAdapterError,
  assertLiveAgentsEnabled,
  createLiveAgentRunner,
  liveAgentsEnabled,
  LiveAgentRunner,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
} from '../src/pipeline/live-runner';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { loadPromptSet } from '../src/pipeline/prompts';
import type { RoleRequest } from '../src/pipeline/roles';
import {
  fixtureAuthorisedCorpus,
  fixtureRenderContext,
  fixtureRequirement,
  placeholderRunner,
  fixtureRegister,
} from './pipeline-fixtures';
// One trap, shared with `cli-run.test.ts`. See `helpers.ts` for what it does
// and does not intercept.
import { installNetworkTrap } from './helpers';
import { SYNTHETIC_ADAPTER_V1 } from './synthetic-adapters';
import { fixtureSourceUniverse } from './pipeline-fixtures';

const TRAP_ENDPOINT = 'https://network-trap.invalid/v1/messages';

const corpus = fixtureAuthorisedCorpus();

function runInput(runner: Parameters<typeof runVerificationPipeline>[0]['runner']) {
  return {
    packId: 'testpack',
    requirementId: 'TEST-R-001',
    requirement: fixtureRequirement(),
    renderContext: fixtureRenderContext(),
    closure: EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']),
    corpus,
    prompts: loadPromptSet(),
    config: DEFAULT_ROLE_CONFIG,
    runner,
  };
}

function roleRequest(): RoleRequest {
  return {
    role: 'reader',
    index: 0,
    model: 'test-model',
    promptSha256: 'a'.repeat(64),
    messages: [{ from: 'prompt', content: 'prompt text' }],
  };
}

afterEach(() => {
  delete process.env[LIVE_AGENTS_ENV];
});

describe('the runner guard', () => {
  it('refuses a run with no runner, by name, and nothing is contacted', async () => {
    const trap = installNetworkTrap();
    try {
      let error: unknown;
      try {
        await runVerificationPipeline(runInput(undefined));
      } catch (thrown) {
        error = thrown;
      }
      expect(error).toBeInstanceOf(MissingAgentRunnerError);
      expect((error as Error).message).toContain('no agent runner was supplied');
      expect((error as Error).message).toContain('npm run test:agents');
      // The other half. Without it this case passes against a guard that fell
      // through to a live call and happened to be slow.
      expect(trap.calls).toEqual([]);
    } finally {
      trap.restore();
    }
  });

  it('refuses null as well as undefined, and returns the runner it is given', () => {
    expect(() => requireRunner(null)).toThrow(MissingAgentRunnerError);
    expect(() => requireRunner(undefined)).toThrow(MissingAgentRunnerError);
    const runner = placeholderRunner();
    expect(requireRunner(runner)).toBe(runner);
  });

  it('a supplied replay runner completes the whole run with no network', async () => {
    // The positive control for "nothing is contacted": the guarded path does
    // run, and runs to completion, when a runner is supplied.
    const trap = installNetworkTrap();
    try {
      const outcome = await runVerificationPipeline(runInput(placeholderRunner()));
      expect(outcome.transcript.roles).toHaveLength(5);
      expect(trap.calls).toEqual([]);
    } finally {
      trap.restore();
    }
  });
});

describe('the capability gate on the live entrypoint', () => {
  it('refuses without the token, before constructing anything', () => {
    const trap = installNetworkTrap();
    try {
      expect(liveAgentsEnabled({})).toBe(false);
      expect(() => assertLiveAgentsEnabled({})).toThrow(AgentCapabilityError);
      expect(() =>
        createLiveAgentRunner({ endpoint: TRAP_ENDPOINT, apiKey: 'unused' }),
      ).toThrow(AgentCapabilityError);
      expect(trap.calls).toEqual([]);
    } finally {
      trap.restore();
    }
  });

  it('refuses at call time too, so a directly constructed instance is inert', async () => {
    const trap = installNetworkTrap();
    try {
      const runner = new LiveAgentRunner({ endpoint: TRAP_ENDPOINT, apiKey: 'unused' });
      await expect(runner.run(roleRequest())).rejects.toBeInstanceOf(AgentCapabilityError);
      expect(trap.calls).toEqual([]);
    } finally {
      trap.restore();
    }
  });

  it('rejects a token that is merely truthy', () => {
    expect(liveAgentsEnabled({ [LIVE_AGENTS_ENV]: 'true' })).toBe(false);
    expect(liveAgentsEnabled({ [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN })).toBe(true);
  });

  it('refuses with the token but no provider protocol to speak, before the request', async () => {
    // The second runtime gate. A provider protocol is request *and* response,
    // and no provider has been chosen — so a run that can neither build the
    // request nor read the answer must not make it. Token set, endpoint set,
    // credential set, and it still refuses with nothing contacted.
    const trap = installNetworkTrap();
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    try {
      expect(() =>
        createLiveAgentRunner({ endpoint: TRAP_ENDPOINT, apiKey: 'unused' }),
      ).toThrow(MissingProviderAdapterError);
      const direct = new LiveAgentRunner({ endpoint: TRAP_ENDPOINT, apiKey: 'unused' });
      await expect(direct.run(roleRequest())).rejects.toBeInstanceOf(
        MissingProviderAdapterError,
      );
      expect(trap.calls).toEqual([]);
    } finally {
      delete process.env[LIVE_AGENTS_ENV];
      trap.restore();
    }
  });

  it('positive control: with the token AND an adapter, the live runner does reach the network', async () => {
    // Proves the trap can fire and that it sits on the live runner's own path.
    // Without this the "trap.calls is empty" assertions above would be equally
    // green against a trap that was never installed — and, since this task, the
    // projector refusal would be equally green against a runner that could
    // never have reached the network for some entirely different reason.
    const trap = installNetworkTrap();
    process.env[LIVE_AGENTS_ENV] = LIVE_AGENTS_TOKEN;
    try {
      const runner = new LiveAgentRunner({
        endpoint: TRAP_ENDPOINT,
        apiKey: 'unused',
        // Not a provider choice: an offline synthetic adapter standing where a
        // real one goes, so the runner gets past its second gate and the trap
        // can be shown to fire. It does **not** prove the URL came from the
        // adapter — this adapter returns `config.endpoint` verbatim, so the
        // assertion below holds either way. That proof is in
        // `provider-adapter.test.ts`, where the adapter's request and the sent
        // request are compared field by field.
        adapter: SYNTHETIC_ADAPTER_V1,
      });
      await expect(runner.run(roleRequest())).rejects.toThrow(/NETWORK TRAP/);
      expect(trap.calls).toEqual([TRAP_ENDPOINT]);
    } finally {
      delete process.env[LIVE_AGENTS_ENV];
      trap.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Static boundaries
// ---------------------------------------------------------------------------

/**
 * Source with comments removed.
 *
 * The boundary checks below are about what the code *does*. Several pipeline
 * modules explain in prose why they write no promotion record, and a check that
 * matched prose would flag exactly the files that state the rule.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('static boundaries', () => {
  it('nothing under src/ imports the live runner except itself', () => {
    const importers = sourceFiles('src').filter(
      (path) =>
        !path.endsWith(join('pipeline', 'live-runner.ts')) &&
        /from\s+'[^']*live-runner'/.test(code(path)),
    );
    expect(importers).toEqual([]);
    // Positive control: the pattern does match a real import, so an empty
    // result is a statement about the codebase rather than about the regex.
    expect(/from\s+'[^']*live-runner'/.test("import { x } from './live-runner';")).toBe(true);
  });

  it('nothing in the pipeline writes to the signature or promotion ledgers', () => {
    // B2 writes no promotion record, by anything, ever. A pipeline that could
    // promote its own identity would make `unpromoted_pipeline` unreachable.
    const offenders = sourceFiles(join('src', 'pipeline')).filter((path) =>
      /signatures\.jsonl|promotions\.jsonl|appendFileSync/.test(code(path)),
    );
    expect(offenders).toEqual([]);
    expect(/promotions\.jsonl/.test('verification/promotions.jsonl')).toBe(true);
  });

  it('the default vitest config excludes the live suite and a separate script runs it', () => {
    const config = readFileSync('vitest.config.ts', 'utf8');
    expect(config).toContain("'test/**/*.agents.test.ts'");
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['test:agents']).toBe('vitest run --config vitest.agents.config.ts');
    expect(pkg.scripts['test:agents']).not.toBe(pkg.scripts['test']);
  });
});
