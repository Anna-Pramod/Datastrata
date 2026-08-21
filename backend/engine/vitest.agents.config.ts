/**
 * The live suite — §5.2's `verification-agents`.
 *
 * Live agent runs. Proves that a changed model or prompt still rediscovers the
 * planted defects, which recorded transcripts structurally cannot. **Blocks
 * pipeline promotion; never blocks a commit.** On demand only.
 *
 * Running this file's suite is not by itself permission to spend: every live
 * runner also checks `DATASTRATA_VERIFICATION_AGENTS` at each call
 * (`src/pipeline/live-runner.ts`). Two gates, because a suite selector is a
 * command-line argument and a command-line argument can be typed by mistake.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.agents.test.ts'],
    exclude: ['**/node_modules/**'],
  },
});
