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
  // The deployable unit is `.next/standalone`, not this checkout. Without this line Next
  // computes the trace into `.nft.json` files and never assembles that directory, so the
  // tracing configuration below has never taken effect and has therefore never been
  // checked. The source repository is outside the runtime contract: if the standalone
  // server cannot answer with the repository absent, the build is not deployable.
  output: 'standalone',
  // The engine loads its knowledge pack from disk at runtime. Trace those JSON files
  // into the standalone output so /api/check works in a deployed build, not just dev.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    '/api/check': [
      '../../backend/engine/knowledge/**/*.json',
      // `assertVersionIntegrity` reads `verification/requirement-versions/<packId>.json`
      // through a computed `join(dir, …)`, which no static analysis can follow, and it
      // throws `VersionIntegrityError` when the file is absent — deliberately, because
      // an integrity check that can be switched off by deleting a file is not an
      // integrity check. So `loadPack` hard-fails without it and it is mandatory today.
      // Observed, not predicted: the uncorrected standalone artifact failed on exactly
      // this file. See `npm run test:standalone`.
      '../../backend/engine/verification/requirement-versions/**/*.json',
    ],
  },
};

export default nextConfig;
