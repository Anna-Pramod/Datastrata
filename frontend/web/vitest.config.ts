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
 *
 * JSX is compiled with React's automatic runtime, as Next compiles it. The
 * tsconfig leaves JSX to Next (`"jsx": "preserve"`), and without this the
 * runner falls back to the classic `React.createElement` form, which a
 * component that never imports `React` cannot run under. It is what lets the
 * check's result component be rendered with `react-dom/server` in a test (DP1
 * Task 6), with no new dependency.
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
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
