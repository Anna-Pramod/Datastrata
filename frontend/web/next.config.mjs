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
  //
  // `/healthz` spends the same declaration, called again: it loads the same pack
  // and digests the same directories `/api/check` reads, so it needs exactly that
  // closure. `.next/standalone` copies the union of every route's trace, which hid
  // the need locally; a host may instead build each route's function from that
  // route's own trace, and `/healthz` would then answer from nothing. Two lists
  // would let the two routes ship different closures; one projection, spent
  // twice, cannot.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    '/api/check': verificationTracingGlobs(),
    '/healthz': verificationTracingGlobs(),
  },
  // Next otherwise adds `X-Powered-By: Next.js` to every page it renders. It serves
  // no reader and tells a prober which framework's advisories to try.
  poweredByHeader: false,
  // One set for every response, pages, route handlers and the gate's own `/dashboard`
  // answers alike, so no route can be added without it. Next applies these rules
  // before the middleware runs and lays the middleware's headers over them, so the
  // gate's `Cache-Control` and `Vary` stand. That the set reaches the middleware's
  // 303, 401 and 503 is read from a production build, not assumed from here.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // No other site may frame a page, so a click cannot be lured onto the
          // gate's sign-in or sign-out inside someone else's page.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          // The same refusal for browsers that predate `frame-ancestors`.
          { key: 'X-Frame-Options', value: 'DENY' },
          // A response is read as the type it declares, never sniffed into a script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // A link to another site sends this origin alone, never a path or a query
          // such as `?reason=...`, and nothing at all from HTTPS to plain HTTP.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HTTPS only, for a year. Browsers ignore it over plain HTTP (RFC 6797
          // §8.1), so local use is unaffected. No `includeSubDomains` or `preload`,
          // so nothing outside this host is committed. It is sent whatever the host
          // does; if the chosen host adds its own, one of the two is removed at
          // deployment.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
    ];
  },
};

export default nextConfig;
