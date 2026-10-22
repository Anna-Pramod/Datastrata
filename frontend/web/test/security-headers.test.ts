/**
 * The site-wide security headers, as `next.config.mjs` declares them — what the declaration is held to.
 *
 * Pilot readiness B5 (2026-10-22). Before a hosted pilot every response is to carry five headers: `Content-Security-Policy:
 * frame-ancestors 'none'` and `X-Frame-Options: DENY` (no other site may frame a page, so a click cannot be lured onto the gate's
 * sign-in or sign-out), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and
 * `Strict-Transport-Security: max-age=31536000` without `includeSubDomains` or `preload`. And no response says
 * `X-Powered-By: Next.js`, which Next adds to every page it renders unless `poweredByHeader` is `false`.
 *
 * This file holds the declaration: the one rule, its source pattern, the exact names and values in order, nothing else in it, and
 * `poweredByHeader` set to `false` rather than left to Next's default of `true`. Every expected value is a literal written here, not
 * read back from the config, so a header removed or reworded there fails here (evidence standard, failure mode 1). Each header
 * also has a case of its own, so the failure for a header that has gone names it.
 *
 * **It is not the evidence that a response carries them.** Whether Next applies a declared rule to a page, a route handler and,
 * above all, the middleware's own `/dashboard` refusals is a property of the running server, which a unit test cannot observe. That
 * is read from the responses of a production build (the B6 smoke script; for B5, the production log in the task's evidence).
 *
 * `next.config.mjs` is plain `.mjs` and this app's `tsconfig.json` sets `allowJs: false`, so a static import of it would not
 * compile; it is imported through a computed specifier, as `verification-read-coverage.test.ts` imports the runtime-input
 * declaration. The module is the one Next loads.
 */

import { describe, expect, it } from 'vitest';

/** The part of a Next header rule this file reads; anything else a rule carried would fail the exact comparison below. */
interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/** The part of the configuration this file reads. */
interface DeclaredConfig {
  poweredByHeader?: unknown;
  headers?: unknown;
}

const configUrl = new URL('../next.config.mjs', import.meta.url).href;
const nextConfig = ((await import(/* @vite-ignore */ configUrl)) as { default: DeclaredConfig }).default;

/** Next's pattern for every path, `/` included: `:path*` matches zero or more segments. */
const EVERY_PATH = '/:path*';

/** The five headers, exactly as every response is to carry them, in the order the config declares them. */
const EXPECTED: [string, string][] = [
  ['Content-Security-Policy', "frame-ancestors 'none'"],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Strict-Transport-Security', 'max-age=31536000'],
];

/** The rules `headers()` returns. A config without `headers()` fails here by that name, not with a TypeError further on. */
async function declaredRules(): Promise<HeaderRule[]> {
  expect(typeof nextConfig.headers, 'next.config.mjs declares an async headers()').toBe('function');
  return (await (nextConfig.headers as () => Promise<HeaderRule[]>)()) ?? [];
}

/** The headers of the rule for every path, as name → value; empty when there is no such rule, so each case below names what is missing. */
async function everyPathHeaders(): Promise<Map<string, string>> {
  const rule = (await declaredRules()).find((candidate) => candidate.source === EVERY_PATH);
  expect(rule, `a header rule for every path (${EVERY_PATH})`).toBeDefined();
  return new Map((rule?.headers ?? []).map(({ key, value }) => [key, value]));
}

describe('next.config.mjs security headers', () => {
  it('declares exactly one header rule, for every path, carrying exactly the five headers in order and nothing else', async () => {
    expect(await declaredRules()).toStrictEqual([
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
    ]);
  });

  it.each(EXPECTED)('sends %s on every path, with the value %s', async (name, value) => {
    expect((await everyPathHeaders()).get(name), name).toBe(value);
  });

  it('names no header beyond the five, and none twice', async () => {
    const rule = (await declaredRules()).find((candidate) => candidate.source === EVERY_PATH);
    expect(rule?.headers.map(({ key }) => key)).toStrictEqual([
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Strict-Transport-Security',
    ]);
  });

  it('commits nothing beyond this host: Strict-Transport-Security carries neither includeSubDomains nor preload', async () => {
    const hsts = (await everyPathHeaders()).get('Strict-Transport-Security');
    // The control: the header is there, so the absence below is read from it and not from nothing (failure mode 7).
    expect(hsts, 'Strict-Transport-Security').toBe('max-age=31536000');
    expect(hsts?.toLowerCase()).not.toContain('includesubdomains');
    expect(hsts?.toLowerCase()).not.toContain('preload');
  });

  it('turns off X-Powered-By: poweredByHeader is false, not left to Next\'s default of true', () => {
    expect(nextConfig.poweredByHeader, 'poweredByHeader').toBe(false);
  });
});
