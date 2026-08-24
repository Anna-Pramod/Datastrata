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
import { mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AgentCapabilityError,
  createLiveAgentRunner,
  liveAgentsEnabled,
  MissingResponseProjectorError,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  type ProviderResponseProjector,
} from '../src/pipeline/live-runner';
import { PACK_ID, REQUIREMENT_ID, engineRoot } from './replay-fixtures';
import { captureLiveRun, liveCaptureConfigFrom } from './live-capture';

/**
 * The provider adapter the first live run must supply.
 *
 * **B2 chooses none**, so this is `undefined` rather than a throwing stub. The
 * distinction matters: a stub that threw would make the capture below die with
 * an anonymous local error *before* reaching `captureLiveRun`, shadowing the
 * production refusal this suite exists to demonstrate. Leaving it absent means
 * the run refuses exactly as a real unconfigured live run would —
 * `MissingResponseProjectorError`, from `live-runner.ts`, before any request.
 */
const providerResponseProjector: ProviderResponseProjector | undefined = undefined;

describe('the live agents suite', () => {
  it('runs in a suite the default run excludes', () => {
    // If this file were collected by `npm test`, this assertion would still
    // pass — the exclusion is asserted from the other side, in
    // `pipeline-runner.test.ts`, which reads the config and the scripts.
    expect(import.meta.url).toMatch(/\.agents\.test\.ts$/);
  });

  it('still refuses to construct a live runner without the capability token', () => {
    expect(liveAgentsEnabled({})).toBe(false);
    expect(() =>
      createLiveAgentRunner({ endpoint: 'https://unused.invalid/', apiKey: 'unused' }),
    ).toThrow(AgentCapabilityError);
    expect(liveAgentsEnabled({ [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN })).toBe(true);
  });
});

/**
 * The capture path, built and gated, and inert until three separate things are
 * true at once.
 *
 * `it.runIf` rather than an unconditional test: running this suite is not by
 * itself permission to spend, so even `npm run test:agents` performs nothing
 * without the token, the endpoint and the credential. **Task 5e does not run
 * it**, and — as the first case below proves — it would refuse even if it were
 * run with all three, because a fourth thing is still missing.
 *
 * The first live run is a separate, explicitly authorised decision that settles
 * the requirement, the provider and model, the configuration and the maximum
 * spend, plus two items this task deliberately left open:
 *
 * ```text
 * ProviderResponseProjector   how this provider's envelope yields content
 *                             — seamed by Task 5e, refused until supplied
 * the request shape           `x-api-key` and {model, messages} are still
 *                             one provider's; not seamed, only recorded
 * ```
 */
describe('capturing a live run', () => {
  it('is inert without all three gates, however this suite was invoked', () => {
    expect(() => liveCaptureConfigFrom({})).toThrow(/is a separate, deliberate act/);
  });

  it('is inert without a provider adapter, whatever the environment says', async () => {
    await expect(
      captureLiveRun({
        packId: PACK_ID,
        requirementId: REQUIREMENT_ID,
        paths: { packDir: 'unused', corpusDir: 'unused', verificationDir: 'unused' },
        transcriptRoot: 'unused',
        env: {
          [LIVE_AGENTS_ENV]: LIVE_AGENTS_TOKEN,
          DATASTRATA_AGENT_ENDPOINT: 'https://unused.invalid/',
          DATASTRATA_AGENT_API_KEY: 'unused',
        },
      }),
    ).rejects.toBeInstanceOf(MissingResponseProjectorError);
  });

  it.runIf(liveAgentsEnabled())(
    'records a real transcript into the replay fixture root',
    async () => {
      const out = mkdtempSync(join(tmpdir(), 'live-capture-out-'));
      try {
        mkdirSync(join(out, 'requirement-versions'), { recursive: true });
        cpSync(
          join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`),
          join(out, 'requirement-versions', `${PACK_ID}.json`),
        );
        const captured = await captureLiveRun({
          packId: PACK_ID,
          requirementId: REQUIREMENT_ID,
          paths: {
            packDir: join(engineRoot, 'knowledge', PACK_ID),
            corpusDir: join(engineRoot, 'corpus'),
            verificationDir: out,
          },
          // A temporary root, never the committed fixture directory. Promoting
          // the first real recording into `test/verification-transcripts/` is a
          // human act on a reviewed file, not a side effect of a test run — the
          // path is printed so it can be moved deliberately.
          transcriptRoot: join(out, 'transcripts'),
          env: process.env,
          // The first live run supplies this alongside the provider, the model,
          // the endpoint and the spend ceiling. Until then it is absent, and
          // `captureLiveRun` refuses before constructing a runner — so with the
          // token set this case reaches that refusal rather than a capture.
          ...(providerResponseProjector === undefined
            ? {}
            : { projectResponse: providerResponseProjector }),
        });
        // Until a provider is chosen this line is unreachable: `captureLiveRun`
        // refuses above. It is the shape the first authorised live run runs, not
        // a claim that B2 ran it.
        expect(captured.transcript.roles.length).toBeGreaterThan(0);
        expect(captured.transcriptPath).toContain(captured.transcript.runId);
        process.stdout.write(`\ncaptured live transcript: ${captured.transcriptPath}\n`);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
  );
});
