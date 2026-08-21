import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verificationTracingGlobs } from './verification-runtime-inputs.mjs';

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
  // The engine reads its knowledge and its verification state from disk at runtime,
  // through computed paths no static analysis can follow. *What that state is* is
  // declared once in `verification-runtime-inputs.mjs` — semantically, by member,
  // with the reason each member is load-bearing — and this is only where the
  // declaration is spent. A glob added here instead of there would be a second
  // closure, and on the first disagreement the narrower one becomes the real one.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    '/api/check': verificationTracingGlobs(),
  },
};

export default nextConfig;
