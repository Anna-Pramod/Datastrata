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
import {
  AgentCapabilityError,
  createLiveAgentRunner,
  liveAgentsEnabled,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
} from '../src/pipeline/live-runner';

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
