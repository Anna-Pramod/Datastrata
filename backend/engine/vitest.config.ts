/**
 * The default suite — §5.2's `verification-machinery`.
 *
 * It runs on recorded transcripts, blocks commits, and performs **no network
 * call and no spend**. The live agents suite proves something CI structurally
 * cannot, so it is not merely a different set of files: it is excluded here and
 * reachable only through `npm run test:agents`.
 *
 * The exclusion is one of the three things that make that separation
 * structural rather than conventional. The others are the runner guard
 * (`src/pipeline/runner.ts`, which refuses a run with no runner before doing any
 * I/O) and the capability gate on the live entrypoint
 * (`src/pipeline/live-runner.ts`, which refuses without an explicit environment
 * token). Injection alone would not be enough: a live runner that stays
 * importable and callable under ordinary vitest is one forgotten argument away
 * from a green CI run that quietly bought tokens.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'test/**/*.agents.test.ts'],
  },
});
