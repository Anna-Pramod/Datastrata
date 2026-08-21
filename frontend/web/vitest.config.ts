/**
 * The site's first test runner.
 *
 * The public checker is a customer-visible surface with a recorded golden over
 * it, and a golden that cannot be executed is a document rather than a test.
 * The aliases exist because the site is compiled by Next, not by node: `@/*`
 * and `@datastrata/engine` are resolved from `tsconfig.json` paths at build
 * time, so a test runner has to be told the same two things. `server-only` is
 * mapped to its own `react-server` entry point — the marker module the React
 * team ships for exactly this case — so that importing a server module under
 * the runner does not trip the guard meant for client bundles.
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@datastrata/engine': fileURLToPath(new URL('../../backend/engine/src/index.ts', import.meta.url)),
      'server-only': fileURLToPath(new URL('../../node_modules/server-only/empty.js', import.meta.url)),
      '@/': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
