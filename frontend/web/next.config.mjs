import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The applicability engine lives at backend/engine and is imported as TypeScript
  // source via the "@datastrata/engine" tsconfig path alias. externalDir lets Next
  // compile it from outside this app directory, so the engine stays a plain library
  // with no build step and no packaging changes.
  experimental: {
    externalDir: true,
  },
  // The engine loads its knowledge pack from disk at runtime. Trace those JSON files
  // into the standalone output so /api/check works in a deployed build, not just dev.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    '/api/check': ['../../backend/engine/knowledge/**/*.json'],
  },
};

export default nextConfig;
