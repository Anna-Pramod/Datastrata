/**
 * The check's result as markup: every field the route sends is rendered, the
 * labels are present exactly when they are true, and each error state reads as
 * itself (DP1 plan, Task 6; CHK-2, CHK-3, EXP-3, EXP-6, KNW-10).
 *
 * **Why this file exists.** CHK-2's acceptance is "rendered or not sent": the
 * payload carries exactly `SENT_FIELDS` (Task 4's contract test), so a field the
 * page silently stops printing is the remaining way for the check to compute
 * something a visitor never sees. So the presentational component is rendered
 * with `react-dom/server` (it ships with `react-dom`; no new dependency) over
 * the 40 authored cases, and every path in `SENT_FIELDS` that a case populates
 * is looked for in the markup of the element that renders it: a cell's fields
 * in that cell, a line's in that line, a row's in that row. A code the words
 * translate (a state, a reason, a kind, a fact type) is carried as a `data-`
 * attribute beside its words; a value a visitor reads (a title, a locator, a
 * date) is looked for as text. The rule for each path is declared below, and
 * the declaration is held equal to `SENT_FIELDS`, so a new field cannot arrive
 * without a rule (failure mode 1).
 *
 * The labels are checked with their counterexample in the same suite: a signed,
 * fresh repository renders no draft label (failure mode 5). The six error
 * states are checked against each other: each renders its own words and none
 * of the others'.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { csrdPack, loadVerifiedCsrdPack } from '@/lib/pack';
import { checkerAnswersSchema, type CheckerAnswers } from '@/lib/check-answers';
import { buildCheckTimeline, SENT_FIELDS, type CheckTimeline } from '@/lib/check-timeline';
import { COLUMN_HEADING, DRAFT_LABEL, ERROR_STATES, PRELIMINARY_LABEL, thresholdWords, type ErrorState } from '@/lib/wording';
import { checkView, errorStateFor, type CheckOutcome } from '@/lib/check-view';
import { CheckError, CheckTimeline as CheckTimelineView } from '@/components/marketing/CheckTimeline';
import { buildFixtureRepository } from './fixture-repository';

interface CasesFile {
  assessmentDate: string;
  cases: { id: string; answers: Record<string, unknown> }[];
}

const FILE = JSON.parse(readFileSync(fileURLToPath(new URL('./checker-cases.json', import.meta.url)), 'utf8')) as CasesFile;
const DATE = FILE.assessmentDate;
const pack = csrdPack();

/** The component's markup for a timeline and the answers behind it. */
const render = (timeline: CheckTimeline, answers: CheckerAnswers): string => renderToStaticMarkup(createElement(CheckTimelineView, { view: checkView(timeline, answers) }));

const FIXTURES = FILE.cases.map((c) => {
  const answers = checkerAnswersSchema.parse(c.answers);
  const timeline = buildCheckTimeline(pack, answers, DATE);
  return { id: c.id, answers, timeline, markup: render(timeline, answers) };
});

// ---------------------------------------------------------------------------
// Reading the markup
// ---------------------------------------------------------------------------

/** As React escapes text and attribute values. */
const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const unesc = (value: string): string => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
/** The visible text: tags removed, entities read back. */
const textOf = (markup: string): string => unesc(markup.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');

/** The element of `tag` carrying `attr="value"`, opening tag to closing tag. Elements of these tags do not nest here. */
function element(markup: string, tag: string, attr: string, value: string): string | null {
  const at = markup.indexOf(`${attr}="${esc(value)}"`);
  if (at === -1) return null;
  const start = markup.lastIndexOf(`<${tag}`, at);
  const end = markup.indexOf(`</${tag}>`, at);
  return start === -1 || end === -1 ? null : markup.slice(start, end + tag.length + 3);
}
const openingTag = (markup: string): string => markup.slice(0, markup.indexOf('>') + 1);
/** Every value of `attr` in a piece of markup. */
const attrValues = (markup: string, attr: string): string[] => [...markup.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, 'g'))].map((m) => unesc(m[1]!));

// ---------------------------------------------------------------------------
// Every sent field is rendered (CHK-2)
// ---------------------------------------------------------------------------

type Scope = 'root' | 'row' | 'line' | 'cell';
type Rule = { scope: Scope; attr: string; contains?: true } | { scope: Scope; text: true };

/**
 * How each sent path is rendered. `root` paths are read from the result's own
 * opening tag, except the start years, which head the columns. `attr` is a
 * `data-` (or `href`) attribute whose value is the sent value; `contains` where
 * the attribute lists several (a cell's needs); `text` is visible text.
 */
const RULES: Record<(typeof SENT_FIELDS)[number], Rule> = {
  assessedAt: { scope: 'root', attr: 'data-assessed-at' },
  basis: { scope: 'root', attr: 'data-basis' },
  'startYears[]': { scope: 'root', attr: 'data-start-year' },
  hypothetical: { scope: 'root', attr: 'data-hypothetical' },
  preliminary: { scope: 'root', attr: 'data-preliminary' },
  'pack.id': { scope: 'root', attr: 'data-pack-id' },
  'pack.version': { scope: 'root', attr: 'data-pack-version' },
  'pack.legalSnapshot': { scope: 'root', attr: 'data-legal-snapshot' },
  'content.draft': { scope: 'root', attr: 'data-draft' },
  'content.threshold': { scope: 'root', attr: 'data-threshold' },
  country: { scope: 'root', attr: 'data-country' },
  'routes[].id': { scope: 'row', attr: 'data-row' },
  'routes[].lines[].kind': { scope: 'line', attr: 'data-kind' },
  'routes[].lines[].requirement': { scope: 'line', attr: 'data-requirement' },
  'routes[].lines[].legalBasis.sources[].id': { scope: 'line', attr: 'data-source' },
  'routes[].lines[].legalBasis.sources[].title': { scope: 'line', text: true },
  'routes[].lines[].legalBasis.sources[].url': { scope: 'line', attr: 'href' },
  'routes[].lines[].legalBasis.locators[]': { scope: 'line', text: true },
  'routes[].lines[].cells[].startYear': { scope: 'cell', attr: 'data-start-year' },
  'routes[].lines[].cells[].state': { scope: 'cell', attr: 'data-state' },
  'routes[].lines[].cells[].reason': { scope: 'cell', attr: 'data-reason' },
  'routes[].lines[].cells[].needs[].factType': { scope: 'cell', attr: 'data-needs', contains: true },
  'routes[].lines[].cells[].needs[].reason': { scope: 'cell', attr: 'data-needs', contains: true },
};

interface Leaf {
  path: string;
  value: string;
  /** The row, line and cell the leaf belongs to, where it does. */
  row?: string;
  line?: string;
  cell?: string;
}

/** Every leaf of a timeline with its declared path (arrays written `[]`) and the element it belongs to. */
function leaves(timeline: CheckTimeline): Leaf[] {
  const out: Leaf[] = [];
  const walk = (value: unknown, path: string, where: Omit<Leaf, 'path' | 'value'>): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, `${path}[]`, where);
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) walk(inner, path === '' ? key : `${path}.${key}`, where);
      return;
    }
    out.push({ path, value: value === null ? '' : String(value), ...where });
  };
  const { routes, ...top } = timeline;
  walk(top, '', {});
  for (const route of routes) {
    out.push({ path: 'routes[].id', value: route.id, row: route.id });
    for (const line of route.lines) {
      const at = { row: route.id, line: `${route.id} ${line.requirement}` };
      const { cells, ...rest } = line;
      walk(rest, 'routes[].lines[]', at);
      for (const cell of cells) walk(cell, 'routes[].lines[].cells[]', { ...at, cell: `${route.id} ${line.requirement} ${cell.startYear}` });
    }
  }
  return out;
}

/** Why a leaf is not found where its rule says, or null when it is. */
function unrendered(markup: string, leaf: Leaf): string | null {
  const rule = RULES[leaf.path as keyof typeof RULES];
  if (rule === undefined) return `${leaf.path} has no rendering rule`;
  let scope: string | null;
  if (rule.scope === 'root') scope = markup;
  else if (rule.scope === 'row') scope = element(markup, 'tbody', 'data-row', leaf.row!);
  else if (rule.scope === 'line') scope = element(markup, 'tr', 'data-line', leaf.line!);
  else scope = element(markup, 'td', 'data-cell', leaf.cell!);
  if (scope === null) return `${leaf.path}: the ${rule.scope} element for ${leaf.cell ?? leaf.line ?? leaf.row ?? 'the result'} is not rendered`;
  if ('text' in rule) return textOf(scope).includes(leaf.value) ? null : `${leaf.path}: "${leaf.value}" is not shown in its ${rule.scope}`;
  // A line's values sit on its own tag and inside it (its sources); the start years head the columns; every other value sits on its element's own tag.
  const values = attrValues(rule.scope === 'line' || leaf.path === 'startYears[]' ? scope : openingTag(scope), rule.attr);
  const found = rule.contains === true ? values.some((v) => v.split(/[\s;]+/).includes(leaf.value)) : values.includes(leaf.value);
  return found ? null : `${leaf.path}: "${leaf.value}" is not in ${rule.attr} of its ${rule.scope}`;
}

describe('every path in SENT_FIELDS that a fixture populates appears in the rendered markup (CHK-2)', () => {
  it('a rendering rule is declared for exactly the paths SENT_FIELDS declares', () => {
    expect(Object.keys(RULES).sort()).toEqual([...SENT_FIELDS].sort());
  });

  it('positive control: the 40 cases between them populate every declared path', () => {
    const populated = new Set(FIXTURES.flatMap((f) => leaves(f.timeline).map((l) => l.path)));
    expect([...SENT_FIELDS].filter((p) => !populated.has(p))).toEqual([]);
  });

  it('every populated leaf of every case is rendered in its own element', () => {
    const missing: string[] = [];
    for (const f of FIXTURES) {
      for (const leaf of leaves(f.timeline)) {
        const problem = unrendered(f.markup, leaf);
        if (problem !== null) missing.push(`${problem} (case ${f.id})`);
      }
    }
    expect([...new Set(missing)].slice(0, 12)).toEqual([]);
  });

  it('counterexample: the search finds nothing the markup does not hold (a cell from another case, a planted title)', () => {
    const golden = FIXTURES.find((f) => f.id === 'golden-widest-slice')!;
    const us = FIXTURES.find((f) => f.id === 'non-eu-group-both-years')!;
    const issuerLeaf = leaves(us.timeline).find((l) => l.path === 'routes[].lines[].cells[].state' && l.row === 'issuer')!;
    expect(unrendered(golden.markup, issuerLeaf)).toContain('is not rendered');
    const titleLeaf = leaves(golden.timeline).find((l) => l.path === 'routes[].lines[].legalBasis.sources[].title')!;
    expect(unrendered(golden.markup, { ...titleLeaf, value: `${titleLeaf.value} (planted)` })).toContain('is not shown');
  });
});

// ---------------------------------------------------------------------------
// What a visitor reads
// ---------------------------------------------------------------------------

describe('each cell shows its words and glyph, its reason’s words and its step; each line its label and legal basis', () => {
  it('in its own element', () => {
    const missing: string[] = [];
    for (const f of FIXTURES) {
      const view = checkView(f.timeline, f.answers);
      for (const row of view.rows) {
        const rowMarkup = element(f.markup, 'tbody', 'data-row', row.id) ?? '';
        if (!textOf(rowMarkup).includes(row.label)) missing.push(`${f.id}: row ${row.id} label`);
        if (row.note !== null && !textOf(rowMarkup).includes(row.note)) missing.push(`${f.id}: row ${row.id} note`);
        for (const line of row.lines) {
          const lineMarkup = element(f.markup, 'tr', 'data-line', `${row.id} ${line.requirement}`) ?? '';
          if (!textOf(lineMarkup).includes(line.label)) missing.push(`${f.id}: line ${row.id} ${line.requirement} label`);
          for (const cell of line.cells) {
            const text = textOf(element(f.markup, 'td', 'data-cell', `${row.id} ${line.requirement} ${cell.startYear}`) ?? '');
            const key = `${f.id}: ${row.id} ${line.requirement} ${cell.startYear}`;
            for (const [what, words] of [['words', cell.words], ['glyph', cell.glyph], ['reason', cell.reason], ['step', cell.step?.words ?? null], ['link', cell.step?.askLabel ?? null]] as const) {
              if (words !== null && !text.includes(words)) missing.push(`${key} ${what}`);
            }
          }
        }
      }
    }
    expect(missing.slice(0, 12)).toEqual([]);
  });

  it('a glyph is never the only sign of a state: it is hidden from assistive technology beside its words', () => {
    const golden = FIXTURES.find((f) => f.id === 'golden-widest-slice')!;
    const cell = element(golden.markup, 'td', 'data-cell', 'consolidated CSRD-S-018 2027')!;
    expect(cell).toMatch(/<span[^>]*aria-hidden="true"[^>]*>●<\/span>/);
    expect(textOf(cell)).toContain('Scope test met at EU level');
  });
});

describe('the labels (CHK-3; KNW-10)', () => {
  const golden = FIXTURES.find((f) => f.id === 'golden-widest-slice')!;
  const labelled = (markup: string, label: string): string | null => {
    const el = element(markup, 'p', 'data-label', label) ?? element(markup, 'h1', 'data-label', label) ?? element(markup, 'th', 'data-label', label);
    return el === null ? null : textOf(el).trim();
  };

  it('the preliminary label heads the result, and the hypothetical heading spans the four start-year columns', () => {
    expect(labelled(golden.markup, 'preliminary')).toBe(PRELIMINARY_LABEL);
    expect(labelled(golden.markup, 'column-heading')).toBe(COLUMN_HEADING);
    expect(golden.markup).toMatch(/<th[^>]*scope="colgroup"[^>]*colspan="4"|<th[^>]*colspan="4"[^>]*scope="colgroup"/i);
  });

  it('the draft label while content.draft is true', () => {
    expect(golden.timeline.content.draft).toBe(true);
    expect(labelled(golden.markup, 'draft')).toBe(DRAFT_LABEL);
  });

  it('counterexample: a signed, fresh repository renders no draft label, and still the preliminary label and the hypothetical heading', () => {
    const signed = loadVerifiedCsrdPack(buildFixtureRepository().engineRoot);
    const timeline = buildCheckTimeline(signed, golden.answers, DATE);
    expect(timeline.content.draft).toBe(false);
    const markup = render(timeline, golden.answers);
    expect([labelled(markup, 'draft'), labelled(markup, 'preliminary'), labelled(markup, 'column-heading')]).toEqual([null, PRELIMINARY_LABEL, COLUMN_HEADING]);
  });

  it('the threshold in force, worded without any internal reference; nothing the visitor reads names an internal document or id', () => {
    expect(labelled(golden.markup, 'threshold')).toBe(thresholdWords('draft_labelled'));
    const internal = /vision|choice \d|proposal|\bDP\d|\b(KNW|EXP|APP|CHK|PRF|DG|QD|CD|CG)-\d|CSRD-S-|\bTask \d/i;
    const hits = FIXTURES.filter((f) => internal.test(textOf(f.markup))).map((f) => `${f.id}: ${internal.exec(textOf(f.markup))![0]}`);
    expect(hits).toEqual([]);
    // Positive control: the requirement ids are in the markup, as attributes, where the scan above does not look.
    expect(golden.markup).toContain('data-requirement="CSRD-S-018"');
  });
});

describe('the table has row and column headers, and the result’s heading can take focus (EXP-5)', () => {
  const golden = FIXTURES.find((f) => f.id === 'golden-widest-slice')!;

  it('a column header per start year, a header for each row of routes and for each line', () => {
    expect((golden.markup.match(/<th[^>]*scope="col"/g) ?? []).length).toBe(4);
    const lines = golden.timeline.routes.flatMap((r) => r.lines).length;
    expect((golden.markup.match(/<th[^>]*scope="row"/g) ?? []).length).toBe(lines);
    expect((golden.markup.match(/<th[^>]*scope="rowgroup"/g) ?? []).length).toBe(golden.timeline.routes.length);
  });

  it('the heading is focusable by script, not by tab', () => {
    expect(golden.markup).toMatch(/<h1[^>]*tabindex="-1"[^>]*data-label="preliminary"|<h1[^>]*data-label="preliminary"[^>]*tabindex="-1"/);
  });
});

// ---------------------------------------------------------------------------
// The errors (EXP-6)
// ---------------------------------------------------------------------------

describe('the six error states each render their own words and none of the others’', () => {
  const OUTCOMES: [string, CheckOutcome, ErrorState][] = [
    ['400', { kind: 'status', status: 400 }, 'bad_request'],
    ['413', { kind: 'status', status: 413 }, 'too_large'],
    ['429', { kind: 'status', status: 429 }, 'rate_limited'],
    ['503', { kind: 'status', status: 503 }, 'refused'],
    ['network failure', { kind: 'network' }, 'network'],
    ['timeout', { kind: 'timeout' }, 'timeout'],
  ];

  for (const [label, outcome, expected] of OUTCOMES) {
    it(label, () => {
      const markup = renderToStaticMarkup(createElement(CheckError, { state: errorStateFor(outcome) }));
      const text = textOf(markup);
      const others = Object.entries(ERROR_STATES)
        .filter(([state]) => state !== expected)
        .filter(([, e]) => text.includes(e.words))
        .map(([state]) => state);
      expect([label, text.includes(ERROR_STATES[expected].words), others]).toEqual([label, true, []]);
      // No error presents a result: the result's element is absent (its positive control is every case above).
      expect([label, markup.includes('data-check-result')]).toEqual([label, false]);
    });
  }

  it('any other status reads as the server’s own failure, never as one of the six', () => {
    for (const status of [500, 502, 404]) expect([status, errorStateFor({ kind: 'status', status })]).toEqual([status, 'server_error']);
  });

  it('the 429 says to try again in a minute', () => {
    expect(textOf(renderToStaticMarkup(createElement(CheckError, { state: errorStateFor({ kind: 'status', status: 429 }) }))).toLowerCase()).toContain('try again in a minute');
  });
});
