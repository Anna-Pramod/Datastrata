/**
 * The site's two error pages, `app/not-found.tsx` and `app/error.tsx` — what they show, and what they never show (DP1 plan, Task 7;
 * EXP-6, EXP-9).
 *
 * **Why this file exists.** Every path the site does not serve, and every route of the pilot surface while it is off, ends on the 404
 * page; any error a page throws ends on the error page. Both are public, and both are where a careless page says too much: an error's
 * message, its digest, a stack with the server's paths in it, a variable's name. So each page is rendered with `react-dom/server` (it
 * ships with `react-dom`; no new dependency), as Task 6's render tests render the check, and its markup is read.
 *
 * **What each page may say.** The approved wording for its state, read through `lib/wording.ts` and never retyped there: the first
 * sentence is the page's heading and the rest is said beneath it, so joined they are exactly the approved words. Beside them, the
 * wordmark and one navigation label, the link home. The expected sentences are literals from the approved table (Task 5), so a page
 * that split or reworded them differently fails here rather than agreeing with itself. The approved words are entries of the wording
 * module, whose implied-case and unbuilt-capability scans read them (`wording.test.ts`); the page's visible text is held to exactly
 * those words, the wordmark and the label, so nothing on either page can say the visitor's answers were kept or sent (plan §1, Data).
 *
 * **What neither page may say.** The error page is handed an error carrying a message, a digest, a stack and a path, each with a
 * marker; none may reach the markup, and the same scan finds every marker in markup that does print them (failure mode 7). Each page
 * shows its own state's words and none of the other's (failure mode 5). Neither uses the shared ghost or faint inks for content, which
 * fall below 4.5:1 on white (Task 6's WCAG review).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ServerErrorPage from '@/app/error';
import NotFound from '@/app/not-found';
import { DP1_WORDING, ERROR_STATES, wordingEntries } from '@/lib/wording';

/** The approved words (Task 5's table, §6), split as each page shows them: the heading, then the rest. Literals, not read from the module. */
const APPROVED = {
  not_found: { heading: 'Page not found.', detail: 'The address may be mistyped, or the page may have moved.' },
  server_error: { heading: 'Something went wrong on our side.', detail: 'Try again later. No result is shown.' },
} as const;
/** The one navigation label either page adds to the approved words. */
const HOME_LABEL = 'Go to the home page';
/** The wordmark's text, which every page of the site carries at its top. */
const WORDMARK = 'DataStrata';

/** As React escapes text. */
const unesc = (value: string): string => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
/** The visible text: tags removed, entities read back, whitespace collapsed. */
const textOf = (markup: string): string => unesc(markup.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
/** The text of the first element of `tag`. */
function textOfFirst(markup: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(markup);
  return match === null ? null : textOf(match[1]);
}

/** An error carrying everything a careless page could print, each with a marker. */
const LEAKY = Object.assign(new Error('message-marker-4c1e names DATASTRATA_PILOT_ACCESS_SECRET'), {
  digest: 'digest-marker-9a07',
  stack: 'Error: stack-marker-2b5d\n    at pilotRecord (/srv/datastrata/frontend/web/lib/record.ts:61:18)',
});
const MARKERS = ['message-marker-4c1e', 'DATASTRATA_PILOT_ACCESS_SECRET', 'digest-marker-9a07', 'stack-marker-2b5d', '/srv/datastrata', 'record.ts', 'pilotRecord'];

const notFoundMarkup = () => renderToStaticMarkup(createElement(NotFound));
const errorMarkup = (reset = vi.fn()) => renderToStaticMarkup(createElement(ServerErrorPage, { error: LEAKY, reset }));

const PAGES: [string, () => string, keyof typeof APPROVED][] = [
  ['the 404 page', notFoundMarkup, 'not_found'],
  ['the error page', () => errorMarkup(), 'server_error'],
];

describe('the approved words', () => {
  it.each(PAGES)('%s shows its state\'s approved words: the first sentence as its one heading, the rest beneath it, joined exactly the words', (_name, render, state) => {
    const markup = render();
    expect(`${APPROVED[state].heading} ${APPROVED[state].detail}`).toBe(ERROR_STATES[state].words);
    expect(markup.match(/<h1\b/g)).toHaveLength(1);
    expect(textOfFirst(markup, 'h1')).toBe(APPROVED[state].heading);
    expect(textOfFirst(markup, 'p')).toBe(APPROVED[state].detail);
  });

  it.each(PAGES)('%s shows nothing but the wordmark, its approved words and the link home, which goes to /', (_name, render, state) => {
    const markup = render();
    expect(textOf(markup)).toBe(`${WORDMARK} ${ERROR_STATES[state].words} ${HOME_LABEL}`);
    expect(markup).toMatch(new RegExp(`<a\\b[^>]*href="/"[^>]*>${HOME_LABEL}</a>`));
  });

  it('each page shows its own state\'s words and none of the other\'s, so neither page is a generic error that fits both', () => {
    const notFound = textOf(notFoundMarkup());
    const error = textOf(errorMarkup());
    expect(notFound).toContain(ERROR_STATES.not_found.words);
    expect(notFound).not.toContain(APPROVED.server_error.heading);
    expect(notFound).not.toContain(APPROVED.server_error.detail);
    expect(error).toContain(ERROR_STATES.server_error.words);
    expect(error).not.toContain(APPROVED.not_found.heading);
    expect(error).not.toContain(APPROVED.not_found.detail);
  });

  it('the words are the wording module\'s own entries, which its implied-case and unbuilt-capability scans read', () => {
    const entries = wordingEntries(DP1_WORDING);
    expect(entries).toContainEqual({ entry: 'error not_found', text: ERROR_STATES.not_found.words });
    expect(entries).toContainEqual({ entry: 'error server_error', text: ERROR_STATES.server_error.words });
    expect(ERROR_STATES.not_found.status).toBe(404);
    expect(ERROR_STATES.server_error.status).toBe(500);
  });
});

describe('what the error page never shows', () => {
  it('shows no message, digest, stack, path or variable name of the error it is handed, though the error carries each', () => {
    const markup = errorMarkup();
    for (const marker of MARKERS) expect(markup, `the error page shows ${marker}`).not.toContain(marker);
    expect(markup).not.toContain('DATASTRATA_');
  });

  it('is read by a scan that finds every marker in markup that does print the error, which is what makes the silence above mean something', () => {
    for (const marker of MARKERS) expect(`${LEAKY.message}\n${LEAKY.digest}\n${LEAKY.stack}`, marker).toContain(marker);
    const careless = renderToStaticMarkup(createElement('main', null, createElement('p', null, LEAKY.message), createElement('p', null, LEAKY.digest), createElement('pre', null, LEAKY.stack)));
    for (const marker of MARKERS) expect(careless, marker).toContain(marker);
  });

  it('does not call reset while it renders: retrying is not offered, because the approved words say to try again later', () => {
    const reset = vi.fn();
    const markup = errorMarkup(reset);
    expect(reset).not.toHaveBeenCalled();
    expect(markup).not.toMatch(/<button\b/);
  });

  it('the 404 page shows no variable name or path either', () => {
    const markup = notFoundMarkup();
    expect(markup).not.toContain('DATASTRATA_');
    expect(markup).not.toMatch(/\/(srv|Users|home|private|var)\//);
  });
});

describe('ink and source', () => {
  /** Text in the shared classes or inks below 4.5:1 on white: the ghost (2.76:1) and faint (3.81:1) inks, by class or by colour. */
  const lowContrast = /class="[^"]*\b(ds-micro|ds-label|ds-caption|ds-faint)\b|color:\s*var\(--ds-text-(faint|ghost)\)/;

  it.each(PAGES)('%s sets no content in the ghost or faint inks', (_name, render) => {
    expect(render()).not.toMatch(lowContrast);
  });

  it('is a scan that finds the classes and inks it is there to forbid', () => {
    for (const planted of ['<p class="ds-micro">x</p>', '<p class="a ds-label">x</p>', '<span class="ds-caption b">x</span>', '<p style="color:var(--ds-text-faint)">x</p>', '<p style="color: var(--ds-text-ghost)">x</p>']) {
      expect(planted).toMatch(lowContrast);
    }
    expect('<p class="ds-body-sm" style="color:var(--ds-text-muted)">x</p>').not.toMatch(lowContrast);
  });

  const code = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const importsOf = (relative: string) =>
    [...new Set([...code(relative).matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1]))].sort();

  it('the error page is a client component, as Next requires of an error boundary', () => {
    expect(code('../app/error.tsx').trimStart()).toMatch(/^['"]use client['"];?/);
    expect(code('../app/not-found.tsx')).not.toMatch(/['"]use client['"]/);
  });

  it('both pages import only Next\'s link, the site primitives and the wording, and read no environment, so neither can reach a profile, a secret or the pack', () => {
    for (const page of ['../app/not-found.tsx', '../app/error.tsx']) {
      expect(importsOf(page), page).toEqual(['@/components/ui/primitives', '@/lib/wording', 'next/link']);
      expect(code(page), page).not.toMatch(/process\.env/);
    }
  });
});
