/**
 * §5.2's `verification-agents` suite — live runs, on demand.
 *
 * Excluded from `npm test` by `vitest.config.ts` and reachable only through
 * `npm run test:agents`. Its job is to prove that a changed model or prompt
 * still rediscovers the planted defects, which recorded transcripts
 * structurally cannot — and that is Task 5's material, not Task 1's.
 *
 * What is here now is the file that makes the second suite real rather than
 * planned, plus the assertions that hold at this stage: the capability gate
 * exists, it refuses without its token, and running this suite is not by itself
 * permission to spend. **Nothing in this file performs a network call**, and
 * nothing here should until there is a live case worth the money.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  AgentCapabilityError,
  createLiveAgentRunner,
  liveAgentsEnabled,
  MissingProviderAdapterError,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
} from '../src/pipeline/live-runner';
import { engineRoot } from './replay-fixtures';
import { assertSupportedLifetime, captureLiveRun, executionLifetimeMs, FIRST_LIVE_CASE, LIFETIME_MARGIN_MS, liveCaptureConfigFrom, LIVE_EXECUTION_ROOT, runFirstLiveCase } from './live-capture';

/**
 * Runs a negative check with the capability token absent from the ambient
 * environment, and puts the environment back exactly as it was. This suite is
 * the one that runs under the very environment that authorises a live
 * execution, so a negative test that read the ambient token would fail
 * precisely when the suite is meant to be used.
 */
function withoutAmbientToken<T>(body: () => T): T {
  const saved = process.env[LIVE_AGENTS_ENV];
  delete process.env[LIVE_AGENTS_ENV];
  try {
    return body();
  } finally {
    if (saved === undefined) delete process.env[LIVE_AGENTS_ENV];
    else process.env[LIVE_AGENTS_ENV] = saved;
  }
}

describe('the live agents suite', () => {
  it('runs in a suite the default run excludes', () => {
    // If this file were collected by `npm test`, this assertion would still
    // pass — the exclusion is asserted from the other side, in
    // `pipeline-runner.test.ts`, which reads the config and the scripts.
    expect(import.meta.url).toMatch(/\.agents\.test\.ts$/);
  });

  it('still refuses to construct a live runner without the capability token, whatever the ambient environment carries', () => {
    expect(liveAgentsEnabled({})).toBe(false);
    withoutAmbientToken(() => {
      expect(() => createLiveAgentRunner({ endpoint: 'https://unused.invalid/', apiKey: 'unused' })).toThrow(AgentCapabilityError);
    });
    expect(liveAgentsEnabled({ [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN })).toBe(true);
  });
});

/**
 * The capture path, built and gated, and inert until every gate is true at
 * once.
 *
 * `it.runIf` rather than an unconditional test: running this suite is not by
 * itself permission to spend, so even `npm run test:agents` performs nothing
 * without the token, the endpoint, the credential and a stated budget. With
 * all of them, this is the shape the first authorised execution runs, through
 * `runFirstLiveCase` — the same function the offline suite proves over an
 * injected transport under the network guard, delayed and cancelled included.
 * The execution is filed under `LIVE_EXECUTION_ROOT` with its transcript,
 * dossier and per-attempt diagnostics kept together, complete or not. Nothing
 * here deletes what a run produced, and nothing here writes into the fixture
 * tree; promoting a transcript there is a human act on a reviewed file.
 *
 * The execution's lifetime is bounded by the harness, from the stated budget,
 * and this test's own timeout sits above that bound: the test runner is never
 * what stops provider work, and a deadline leaves an account behind.
 *
 * Whether this may be run at all is decided outside this file: the account,
 * the applicable terms, permission to transmit the rendered inputs, retention
 * settings and the spending limit are prerequisites this suite cannot see.
 */
describe('capturing a live run', () => {
  it('is inert without every environment gate, however this suite was invoked', () => {
    expect(() => liveCaptureConfigFrom({})).toThrow(/is a separate, deliberate act/);
  });

  it('is inert without a provider adapter, whatever the environment says', async () => {
    await expect(
      captureLiveRun({
        packId: FIRST_LIVE_CASE.packId,
        requirementId: FIRST_LIVE_CASE.requirementId,
        paths: { packDir: 'unused', corpusDir: 'unused', verificationDir: 'unused' },
        executionRoot: join(engineRoot, LIVE_EXECUTION_ROOT),
        env: {
          [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN,
          DATASTRATA_AGENT_ENDPOINT: 'https://unused.invalid/',
          DATASTRATA_AGENT_API_KEY: 'unused',
          DATASTRATA_AGENT_MAX_ATTEMPTS: '1',
          DATASTRATA_AGENT_MAX_INPUT_BYTES: '1',
        },
      }),
    ).rejects.toBeInstanceOf(MissingProviderAdapterError);
  });

  // The lifetime is read at collection time so the test's timeout can be set
  // from it, and checked against the timer range here as the harness checks
  // it again before writing. An environment that has the token but no usable
  // budget, or a budget whose lifetime the timers cannot honour, yields a zero
  // lifetime here and a named refusal from the run itself, never a timeout
  // the runner would silently shorten.
  const lifetimeMs = (() => {
    if (!liveAgentsEnabled()) return 0;
    try {
      const derived = executionLifetimeMs(liveCaptureConfigFrom(process.env).budget);
      assertSupportedLifetime(derived);
      return derived;
    } catch {
      return 0;
    }
  })();

  it.runIf(liveAgentsEnabled())(
    'executes the first live case through the accepted adapter within a bounded lifetime, and files the execution, complete or not',
    async () => {
      const outcome = await runFirstLiveCase({
        env: process.env,
        executionRoot: join(engineRoot, LIVE_EXECUTION_ROOT),
        // No transport is injected: this is the real one, and the execution
        // summary records `synthetic: false` because of it. The deadline is
        // the lifetime derived from the stated budget.
      });
      process.stdout.write(`\nlive execution ${outcome.status}: ${outcome.summaryPath}\n`);
      // The evidence exists whatever happened; only then is completion asserted,
      // so a failed or cancelled execution is reported as a failed test with its
      // diagnostics kept.
      expect(existsSync(outcome.summaryPath)).toBe(true);
      expect(existsSync(outcome.attemptsPath)).toBe(true);
      expect(outcome.httpAttempts).toBe(outcome.ledger.attemptsUsed);
      expect(outcome.status, JSON.stringify(outcome.error)).toBe('completed');
      expect(outcome.transcriptPath).toContain(outcome.runId);
      expect(outcome.resultPath).not.toBeNull();
    },
    lifetimeMs + LIFETIME_MARGIN_MS,
  );
});
