/**
 * The public site's navigation offers no way into the pilot surface — what it is held to (DP1 plan, Task 7; DG-10; the user's
 * direction of 2026-10-26).
 *
 * **Why this file exists.** The passphrase pilot surface (`/dashboard`, `/pilot-access`, `/login` and the two `/api/pilot-access`
 * routes) answers 404 unless a server sets `DATASTRATA_PILOT_GATE=on`, and the host never sets it. A "Sign in" link in the header,
 * the mobile menu or the footer would then send every visitor to a 404, and on a local screen-share it would advertise a sign-in
 * that DP1 does not offer the public. So for DP1 the navigation carries no sign-in at all, neither live nor greyed out, and an
 * operator who has switched the surface on opens `/pilot-access` by its address.
 *
 * **What is held.** `MarketingNav` and `Footer` are rendered with `react-dom/server` (it ships with `react-dom`; no new dependency),
 * as the error pages' tests render them, and every `<a href>` is collected. The desktop links, the mobile menu's panel and the footer
 * each have their exact list of targets, written here as literals, so a link added, removed or reordered fails by name. Beside the
 * lists: no target lies in the pilot surface, no text or target says "sign in", "log in" or "login", and no anchor or button is
 * disabled. A source scan then holds every public page and every marketing component, `LoginCard` alone excepted (it is rendered
 * only by `/login`, itself part of the surface), to naming no pilot-surface path at all. Each matcher is shown to catch what it is
 * there to catch, planted (evidence standard, failure mode 7).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Footer } from '@/components/marketing/Footer';
import { MarketingNav } from '@/components/marketing/MarketingNav';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const navMarkup = () => renderToStaticMarkup(createElement(MarketingNav));
const footerMarkup = () => renderToStaticMarkup(createElement(Footer, { packVersion: '9.9.9-test', legalSnapshot: '2026-01-01' }));

/** As React escapes attribute values and text. */
const unesc = (value: string): string => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
/** Every `<a>`'s `href`, in document order. */
const hrefsIn = (markup: string): string[] => [...markup.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((match) => unesc(match[1]));
/** The visible text: tags removed, entities read back, whitespace collapsed. */
const textOf = (markup: string): string => unesc(markup.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** The markup of the first `<div>` carrying `className`, opening tag to its first closing `</div>`: these two hold only links. */
function divOf(markup: string, className: string): string {
  const start = markup.indexOf(`<div class="${className}"`);
  if (start === -1) throw new Error(`no <div class="${className}"> in the markup`);
  const end = markup.indexOf('</div>', start);
  return markup.slice(start, end + '</div>'.length);
}

/** A target inside the pilot surface: one of its five paths, or anything under one of them. */
const PILOT_TARGET = /^\/(?:login|pilot-access|dashboard|api\/pilot-access)(?:[/?#]|$)/;
/** Words that offer a sign-in, in any letter case. */
const SIGN_IN_WORDS = /\bsign[\s-]?in\b|\blog[\s-]?in\b|\blogin\b/i;
/** An anchor or a button that is disabled, natively or for assistive technology. */
const DISABLED_CONTROL = /<(?:a|button)\b[^>]*\s(?:disabled|aria-disabled)(?:=|\s|>)/i;

describe('the public navigation', () => {
  it('the desktop links go to exactly these targets, in this order', () => {
    expect(hrefsIn(divOf(navMarkup(), 'ds-nav-links'))).toEqual(['/#product', '/#how', '/#coverage', '/company', '/contact']);
  });

  it('the mobile menu\'s panel goes to exactly these targets, in this order', () => {
    expect(hrefsIn(divOf(navMarkup(), 'ds-nav-panel'))).toEqual(['/#product', '/#how', '/#coverage', '/company', '/contact', '/check']);
  });

  it('the whole header is the wordmark home, the desktop links, the call to action and the mobile panel, and nothing else', () => {
    expect(hrefsIn(navMarkup())).toEqual([
      '/',
      '/#product', '/#how', '/#coverage', '/company', '/contact',
      '/check',
      '/#product', '/#how', '/#coverage', '/company', '/contact', '/check',
    ]);
  });

  it('the footer goes to exactly these targets, in this order', () => {
    expect(hrefsIn(footerMarkup())).toEqual(['/#product', '/#how', '/#coverage', '/check', '/company', '/contact']);
  });

  it.each([
    ['the header', navMarkup],
    ['the footer', footerMarkup],
  ])('%s points nowhere into the pilot surface', (_name, render) => {
    const targets = hrefsIn(render());
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => PILOT_TARGET.test(target))).toEqual([]);
  });

  it.each([
    ['the header', navMarkup],
    ['the footer', footerMarkup],
  ])('%s says nothing of signing in, in its text or its targets', (_name, render) => {
    const markup = render();
    expect(textOf(markup)).not.toMatch(SIGN_IN_WORDS);
    expect(hrefsIn(markup).filter((target) => SIGN_IN_WORDS.test(target))).toEqual([]);
  });

  it.each([
    ['the header', navMarkup],
    ['the footer', footerMarkup],
  ])('%s holds no disabled anchor or button, so no greyed-out sign-in is left in its place', (_name, render) => {
    expect(render()).not.toMatch(DISABLED_CONTROL);
  });

  it('is read by matchers that catch what they are there to catch, and let by what they are not', () => {
    for (const target of ['/login', '/pilot-access', '/pilot-access?reason=refused', '/dashboard', '/dashboard/records/42', '/api/pilot-access', '/api/pilot-access/sign-out', '/login#x']) {
      expect(target, target).toMatch(PILOT_TARGET);
    }
    for (const target of ['/', '/check', '/company', '/contact', '/#coverage', '/loginx', '/dashboards', '/api/check']) {
      expect(target, target).not.toMatch(PILOT_TARGET);
    }
    for (const words of ['Sign in', 'SIGN IN', 'sign-in', 'Log in', 'log-in', 'Login', '/login']) expect(words, words).toMatch(SIGN_IN_WORDS);
    for (const words of ['Sign out', 'Check what applies', 'About us', 'Contact']) expect(words, words).not.toMatch(SIGN_IN_WORDS);
    for (const control of ['<a href="/x" aria-disabled="true">x</a>', '<button disabled="">x</button>', '<button type="submit" disabled>x</button>', '<A ARIA-DISABLED="true">x</A>']) {
      expect(control, control).toMatch(DISABLED_CONTROL);
    }
    for (const control of ['<a href="/check">x</a>', '<button type="submit">x</button>', '<a class="ds-btn" href="/disabled">x</a>']) {
      expect(control, control).not.toMatch(DISABLED_CONTROL);
    }
    // And the link collector reads the markup it is handed: the planted sign-in link is found where it is.
    expect(hrefsIn('<nav><a class="x" href="/login">Sign in</a></nav>')).toEqual(['/login']);
  });
});

describe('the public sources', () => {
  /** A quoted string that is a pilot-surface path, or a path under one: how a link, a form or a list of links would name it. */
  const PILOT_PATH_LITERAL = /(['"`])\/(?:login|pilot-access|dashboard|api\/pilot-access)(?:[/?#][^'"`]*)?\1/g;

  /** Every `.tsx` file under a directory, as paths relative to the app root. */
  function tsxFiles(dir: string): string[] {
    return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return tsxFiles(path);
      return entry.name.endsWith('.tsx') ? [path] : [];
    });
  }

  /** The surface's own pages, and `LoginCard`, which only `/login` renders: the files that may name a pilot path. */
  const SURFACE = ['app/dashboard/page.tsx', 'app/pilot-access/page.tsx', 'app/login/page.tsx', 'components/marketing/LoginCard.tsx'];
  /** Every public page, the root layout and the two error pages, and every marketing component, without the surface's own files. */
  const PUBLIC = [
    ...tsxFiles('app').filter((file) => /(?:^|\/)(?:page|layout|not-found|error)\.tsx$/.test(file)),
    ...tsxFiles('components/marketing'),
  ]
    .filter((file) => !SURFACE.includes(file))
    .sort();

  /** The pilot paths a file's code names, its comments removed so prose about the surface is not taken for a link to it. */
  const pilotPathsIn = (text: string): string[] =>
    [...text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').matchAll(PILOT_PATH_LITERAL)].map((match) => match[0]);

  it('reads the pages, the layout, the error pages and the marketing components, and leaves out exactly the surface\'s own files', () => {
    for (const file of ['app/page.tsx', 'app/company/page.tsx', 'app/check/page.tsx', 'app/contact/page.tsx', 'app/layout.tsx', 'app/not-found.tsx', 'app/error.tsx', 'components/marketing/MarketingNav.tsx', 'components/marketing/Footer.tsx']) {
      expect(PUBLIC, file).toContain(file);
    }
    for (const file of SURFACE) expect(PUBLIC, file).not.toContain(file);
  });

  it('no public page and no marketing component names a path in the pilot surface', () => {
    const found = PUBLIC.flatMap((file) => pilotPathsIn(readFileSync(join(ROOT, file), 'utf8')).map((path) => `${file}: ${path}`));
    expect(found).toEqual([]);
  });

  it('is a scan that finds a pilot path written as a link, a form target or an entry in a list of links, and lets every other path by', () => {
    const planted = [
      '<Link href="/login">Sign in</Link>',
      "{ href: '/login', label: 'Sign in', key: 'login' }",
      '<form method="post" action="/api/pilot-access">',
      '<a href={`/pilot-access?reason=refused`}>x</a>',
      'href={"/dashboard/records"}',
    ].join('\n');
    expect(pilotPathsIn(planted)).toEqual(['"/login"', "'/login'", '"/api/pilot-access"', '`/pilot-access?reason=refused`', '"/dashboard/records"']);
    expect(pilotPathsIn("<Link href=\"/check\">x</Link> { href: '/company' } href=\"/#coverage\" '/api/check' '/loginx'")).toEqual([]);
    // A comment about the surface is not a link to it.
    expect(pilotPathsIn("/** links to '/login' were removed */\n// '/dashboard'\n{/* '/pilot-access' */}")).toEqual([]);
  });
});
