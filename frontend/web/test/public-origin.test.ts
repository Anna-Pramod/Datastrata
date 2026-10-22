/**
 * The configured public origin — what a value must be before the gate builds a redirect from it.
 *
 * Pilot readiness B3 (2026-10-22). Middleware cannot redirect relatively, and the URL Next hands it is built from the hostname the
 * server was started with, not the one a browser used (investigation B3.1–B3.3), so the gate's redirects are built from one
 * configured origin, `DATASTRATA_PUBLIC_ORIGIN`. A value that is not exactly an origin would build a wrong URL, a plain-http origin
 * on a network name would send the session over plain text, and a loopback address is rewritten by Next to `localhost`, which moves
 * a browser off the host its cookie belongs to. `readPublicOrigin` is the one place those rules are applied. It is pure, so it is
 * called directly here with one value per rule, values the middleware and the route are never handed among them (evidence
 * standard, failure mode 4). Each refusal is checked against the problem of its own rule, so a mutant that removes one rule is
 * caught even where a later rule would still refuse the value: `http://127.0.0.1:3000` is refused as a loopback address, and
 * without that rule it would be refused as plain http, which is a different problem.
 *
 * Every refusal stands beside the usable values one step from it: `https` with and without a port beside `https` with its default
 * port written out, `http://localhost` beside plain http on any other name and on a loopback address. The expected problems are
 * literals, not read from the module (failure mode 1). Every problem names the variable and holds no part of the value it refused:
 * each refused value carries markers (a host, a path, a query, a fragment, a user name) that occur in no problem's wording, and
 * the problems ask for placeholders (`https://<host>`), never an example host or port, so a problem that printed the value would
 * be found. The last case shows the scan finding each marker in its value and in a problem that echoes it (failure mode 7).
 *
 * Pilot readiness B2 (2026-10-22). `sameOriginVerdict` decides whether a sign-in or sign-out post came from the site itself, from
 * the `Origin` and `Sec-Fetch-Site` a browser writes and the configured origin. It is called here directly, with header pairs no
 * browser sends (another site's `Origin` beside `Sec-Fetch-Site: same-origin`, the configured `Origin` beside `cross-site`) and with
 * no usable origin, which sign-in never reaches, so each rule can fail alone (failure mode 4): the exact `Origin` comparison, the
 * `Sec-Fetch-Site` rule when `Origin` is absent, the `Sec-Fetch-Site` rule standing in when there is nothing to compare `Origin`
 * with, and the pass for a request with neither. Every row of the plan's rule is run, the rows without `Origin` both with and
 * without a usable origin, and every refusal table holds the pass one step from it (failure modes 5 and 7). The expected verdicts
 * are literals and name the case that decided, so a verdict that reached the right answer by the wrong rule is caught too.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PUBLIC_ORIGIN_ENV, readPublicOrigin, sameOriginVerdict, type SameOriginVerdict } from '@/lib/public-origin';

/** What every problem asks for: placeholders, never an example host or port, so no value a test uses can occur in it. */
const WANTED =
  'Set it to the origin browsers use to reach this site: https://<host>, or https://<host>:<port>, or http://localhost:<port> on one machine.';
const NOT_SET = `DATASTRATA_PUBLIC_ORIGIN is not set. ${WANTED}`;
const BLANK = `DATASTRATA_PUBLIC_ORIGIN is set but blank. ${WANTED}`;
const NOT_EXACT = `DATASTRATA_PUBLIC_ORIGIN is not an origin as a browser writes one: the scheme and host in lower case, a port only when it is not the scheme's default, and no path, trailing slash, query, fragment, user name or surrounding space. ${WANTED}`;
const NOT_HTTPS = `DATASTRATA_PUBLIC_ORIGIN does not use https, and only localhost may use plain http. ${WANTED}`;
const LOOPBACK = `DATASTRATA_PUBLIC_ORIGIN names a loopback address, which Next rewrites to localhost in a redirect, so a browser would be moved off the host its session cookie belongs to; write localhost in its place. ${WANTED}`;

/** A refused value, the problem its rule gives, and the parts of it no problem may contain. Blank values have no part to look for. */
type Refusal = [name: string, value: string | undefined, problem: string, markers: string[]];

const refused: Refusal[] = [
  ['unset', undefined, NOT_SET, []],
  ['empty', '', BLANK, []],
  ['whitespace alone', ' \t ', BLANK, []],
  ['an origin with surrounding space', ' https://gate-space.example.test ', NOT_EXACT, ['gate-space']],
  ['an origin with the trailing newline an env file can leave', 'https://gate-newline.example.test\n', NOT_EXACT, ['gate-newline']],
  ['an origin with a trailing slash', 'https://gate-slash.example.test/', NOT_EXACT, ['gate-slash']],
  ['an origin with a path', 'https://gate-path.example.test/p-3e9a', NOT_EXACT, ['gate-path', 'p-3e9a']],
  ['an origin with a query', 'https://gate-query.example.test?q-5d2b=1', NOT_EXACT, ['gate-query', 'q-5d2b']],
  ['an origin with a fragment', 'https://gate-fragment.example.test#f-8a1c', NOT_EXACT, ['gate-fragment', 'f-8a1c']],
  ['an origin with userinfo', 'https://u-4f6e:pw-2b7d@gate-user.example.test', NOT_EXACT, ['u-4f6e', 'pw-2b7d', 'gate-user']],
  ['an upper-case scheme', 'HTTPS://gate-scheme.example.test', NOT_EXACT, ['HTTPS:', 'gate-scheme']],
  ['an upper-case host', 'https://Gate-Case.Example.Test', NOT_EXACT, ['Gate-Case']],
  ['an explicit :443 on https', 'https://gate-port.example.test:443', NOT_EXACT, ['gate-port', ':443']],
  ['an explicit :80 on http://localhost', 'http://localhost:80', NOT_EXACT, ['localhost:80']],
  ['a bare host', 'gate-bare.example.test', NOT_EXACT, ['gate-bare']],
  ['a host and port without a scheme', 'localhost:3000', NOT_EXACT, ['localhost:3000']],
  ['a loopback address written short', 'http://127.1:3000', NOT_EXACT, ['127.1']],
  ['plain http on a host other than localhost', 'http://gate-plain.example.test', NOT_HTTPS, ['gate-plain']],
  ['plain http on a host that only begins with localhost', 'http://localhost.gate-prefix.example.test', NOT_HTTPS, ['gate-prefix']],
  ['a scheme that is not HTTP', 'ftp://gate-ftp.example.test', NOT_HTTPS, ['ftp:', 'gate-ftp']],
  ['http://127.0.0.1:3000', 'http://127.0.0.1:3000', LOOPBACK, ['127.0.0.1']],
  ['https://127.0.0.1', 'https://127.0.0.1', LOOPBACK, ['127.0.0.1']],
  ['another address in 127.0.0.0/8, over https', 'https://127.12.34.56:8443', LOOPBACK, ['127.12.34.56']],
  ['http://[::1]:3000', 'http://[::1]:3000', LOOPBACK, ['[::1]']],
  ['the IPv6 loopback over https', 'https://[::1]:8443', LOOPBACK, ['[::1]']],
];

describe('PUBLIC_ORIGIN_ENV', () => {
  it('is the name the middleware, the route and the README use', () => {
    expect(PUBLIC_ORIGIN_ENV).toBe('DATASTRATA_PUBLIC_ORIGIN');
  });
});

describe('readPublicOrigin', () => {
  const usable: [string, string][] = [
    ['https without a port', 'https://gate.example.test'],
    ['https with a port', 'https://gate.example.test:8443'],
    ['plain http on localhost without a port', 'http://localhost'],
    ['plain http on localhost with a port', 'http://localhost:3000'],
    ['https on localhost', 'https://localhost:8443'],
  ];
  it.each(usable)('accepts %s, and hands back exactly the value: %s', (_name, value) => {
    expect(readPublicOrigin(value)).toStrictEqual({ ok: true, origin: value });
  });

  it.each(refused)('refuses %s with the problem of the rule it breaks', (_name, value, problem) => {
    expect(readPublicOrigin(value)).toStrictEqual({ ok: false, problem });
  });

  it.each(refused)('names the variable, and holds no part of the value, in the problem for %s', (_name, value, _problem, markers) => {
    const verdict = readPublicOrigin(value);
    expect(verdict, 'the value is refused').toMatchObject({ ok: false });
    const problem = verdict.ok ? '' : verdict.problem;
    expect(problem).toContain('DATASTRATA_PUBLIC_ORIGIN');
    const parts = value === undefined || value.trim() === '' ? markers : [value, value.trim(), ...markers];
    for (const part of parts) expect(problem, `the problem echoes ${JSON.stringify(part)}`).not.toContain(part);
  });

  it('gives each rule a problem of its own, and the table above refuses a value under every one of them', () => {
    expect(new Set(refused.map(([, , problem]) => problem))).toEqual(new Set([NOT_SET, BLANK, NOT_EXACT, NOT_HTTPS, LOOPBACK]));
  });

  it('is a scan that finds each marker in the value it stands for and in a problem that echoes that value, which is what makes the silence above mean something', () => {
    for (const [name, value, problem, markers] of refused) {
      if (value !== undefined && value.trim() !== '') expect(markers.length, `${name} carries a marker`).toBeGreaterThan(0);
      for (const marker of markers) {
        expect(value, name).toContain(marker);
        expect(`${problem} (${value})`, name).toContain(marker);
      }
    }
  });
});

describe('sameOriginVerdict', () => {
  /** The configured origin in every row that has a usable one: a reserved test name. */
  const PUBLIC = 'https://gate.example.test';
  const EVIL = 'https://evil.example';
  const BY_ORIGIN_ALLOWED: SameOriginVerdict = { case: 'origin', allowed: true };
  const BY_ORIGIN_REFUSED: SameOriginVerdict = { case: 'origin', allowed: false };
  const BY_FETCH_SITE_ALLOWED: SameOriginVerdict = { case: 'sec-fetch-site', allowed: true };
  const BY_FETCH_SITE_REFUSED: SameOriginVerdict = { case: 'sec-fetch-site', allowed: false };
  const NEITHER: SameOriginVerdict = { case: 'neither', allowed: true };

  type Row = [name: string, origin: string | null, secFetchSite: string | null, verdict: SameOriginVerdict];

  /** `Origin` present and a usable origin configured: the exact comparison decides, and `Sec-Fetch-Site` is not consulted. */
  const originWithUsable: Row[] = [
    ['the configured origin alone', PUBLIC, null, BY_ORIGIN_ALLOWED],
    ['the configured origin with Sec-Fetch-Site: same-origin, which is what a browser sends from the site', PUBLIC, 'same-origin', BY_ORIGIN_ALLOWED],
    ['the configured origin with Sec-Fetch-Site: cross-site, which no browser sends, because Origin decides when it is present', PUBLIC, 'cross-site', BY_ORIGIN_ALLOWED],
    ['another scheme', 'http://gate.example.test', null, BY_ORIGIN_REFUSED],
    ['another host', EVIL, null, BY_ORIGIN_REFUSED],
    ['another site, as a current browser sends it', EVIL, 'cross-site', BY_ORIGIN_REFUSED],
    ['a sibling subdomain', 'https://sibling.example.test', null, BY_ORIGIN_REFUSED],
    ['the configured host under another name it contains', 'https://gate.example.test.evil.example', null, BY_ORIGIN_REFUSED],
    ['another port', 'https://gate.example.test:8443', null, BY_ORIGIN_REFUSED],
    ['the default port written out', 'https://gate.example.test:443', null, BY_ORIGIN_REFUSED],
    ['a trailing slash', 'https://gate.example.test/', null, BY_ORIGIN_REFUSED],
    ['the host in upper case', 'https://GATE.example.test', null, BY_ORIGIN_REFUSED],
    ['the opaque origin null', 'null', null, BY_ORIGIN_REFUSED],
    ['two joined values, the configured one first', `${PUBLIC}, ${EVIL}`, null, BY_ORIGIN_REFUSED],
    ['an empty Origin', '', null, BY_ORIGIN_REFUSED],
    ['another host with Sec-Fetch-Site: same-origin, which no browser sends, because Origin decides when it is present', EVIL, 'same-origin', BY_ORIGIN_REFUSED],
  ];
  it.each(originWithUsable)('with a usable origin, judges an Origin of %s by comparing it exactly', (_name, origin, secFetchSite, verdict) => {
    expect(sameOriginVerdict({ origin, secFetchSite }, PUBLIC)).toStrictEqual(verdict);
  });

  /** `Origin` present and no usable origin (sign-out on a misconfigured server): nothing to compare it with, so `Sec-Fetch-Site` decides. */
  const originWithoutUsable: Row[] = [
    ['an Origin with Sec-Fetch-Site: same-origin, which a current browser sends from the site', PUBLIC, 'same-origin', BY_ORIGIN_ALLOWED],
    ['an Origin no configured value can vouch for, with Sec-Fetch-Site: same-origin, which then decides', EVIL, 'same-origin', BY_ORIGIN_ALLOWED],
    ['an Origin alone', PUBLIC, null, BY_ORIGIN_REFUSED],
    ['the opaque origin null alone', 'null', null, BY_ORIGIN_REFUSED],
    ['an Origin with Sec-Fetch-Site: cross-site', PUBLIC, 'cross-site', BY_ORIGIN_REFUSED],
    ['an Origin with Sec-Fetch-Site: same-site', PUBLIC, 'same-site', BY_ORIGIN_REFUSED],
    ['an Origin with Sec-Fetch-Site: none', PUBLIC, 'none', BY_ORIGIN_REFUSED],
  ];
  it.each(originWithoutUsable)('with no usable origin, judges %s by Sec-Fetch-Site alone', (_name, origin, secFetchSite, verdict) => {
    expect(sameOriginVerdict({ origin, secFetchSite }, null)).toStrictEqual(verdict);
  });

  /** `Origin` absent, `Sec-Fetch-Site` present: only `same-origin` passes, whatever is configured. */
  const fetchSiteAlone: [name: string, secFetchSite: string, verdict: SameOriginVerdict][] = [
    ['same-origin', 'same-origin', BY_FETCH_SITE_ALLOWED],
    ['same-site, which a sibling subdomain is', 'same-site', BY_FETCH_SITE_REFUSED],
    ['cross-site', 'cross-site', BY_FETCH_SITE_REFUSED],
    ['none, which a request the user started is', 'none', BY_FETCH_SITE_REFUSED],
    ['same-origin in another letter case', 'Same-Origin', BY_FETCH_SITE_REFUSED],
    ['an empty value', '', BY_FETCH_SITE_REFUSED],
    ['two joined values, same-origin first', 'same-origin, cross-site', BY_FETCH_SITE_REFUSED],
  ];
  const configurations: [string, string | null][] = [
    ['a usable origin', PUBLIC],
    ['no usable origin', null],
  ];
  for (const [configured, publicOrigin] of configurations) {
    it.each(fetchSiteAlone)(`with ${configured}, judges a request with no Origin and Sec-Fetch-Site: %s by Sec-Fetch-Site`, (_name, secFetchSite, verdict) => {
      expect(sameOriginVerdict({ origin: null, secFetchSite }, publicOrigin)).toStrictEqual(verdict);
    });

    it(`with ${configured}, lets a request with neither header through, the compatibility exception for scripts`, () => {
      expect(sameOriginVerdict({ origin: null, secFetchSite: null }, publicOrigin)).toStrictEqual(NEITHER);
    });
  }

  it('refuses in every case that can refuse and allows in every case, so no table above is all one answer', () => {
    const verdicts = [
      ...originWithUsable.map(([, , , verdict]) => verdict),
      ...originWithoutUsable.map(([, , , verdict]) => verdict),
      ...fetchSiteAlone.map(([, , verdict]) => verdict),
    ];
    for (const verdict of [BY_ORIGIN_ALLOWED, BY_ORIGIN_REFUSED, BY_FETCH_SITE_ALLOWED, BY_FETCH_SITE_REFUSED]) expect(verdicts).toContainEqual(verdict);
    for (const table of [originWithUsable, originWithoutUsable]) {
      expect(new Set(table.map(([, , , verdict]) => verdict.allowed))).toEqual(new Set([true, false]));
    }
  });
});

describe('the public-origin module', () => {
  const SOURCE = fileURLToPath(new URL('../lib/public-origin.ts', import.meta.url));

  /** The module's code with its comments removed, so prose that names a module, a header or a variable is not taken for using it. */
  function code(): string {
    return readFileSync(SOURCE, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  const IMPORT = /(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  const ENVIRONMENT = /process\.env/;
  const HEADERS = /\.headers\b/;

  it('opens with a JSDoc block saying why it exists', () => {
    expect(readFileSync(SOURCE, 'utf8').startsWith('/**\n')).toBe(true);
  });

  it('imports nothing and reads neither the environment nor a header, so the Edge middleware and the Node route use it as it is, and the caller decides where the value comes from', () => {
    expect([...code().matchAll(IMPORT)]).toEqual([]);
    expect(code()).not.toMatch(ENVIRONMENT);
    expect(code()).not.toMatch(HEADERS);
    // The patterns, and the control that they match what they are there to forbid.
    expect([..."import { x } from 'next/server';".matchAll(IMPORT)].map((match) => match[1])).toEqual(['next/server']);
    expect('process.env.DATASTRATA_PUBLIC_ORIGIN').toMatch(ENVIRONMENT);
    expect("request.headers.get('host')").toMatch(HEADERS);
  });
});
