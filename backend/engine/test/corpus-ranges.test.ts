/**
 * Operative-provision ranges and quote location — B-EVID-SPAN.
 *
 * A signature that says a proposition is supported by the law must be able to
 * say *where*: which declared range of which document the relied-upon
 * occurrence of a quote lies wholly inside. Two mechanical questions are proved
 * here, on synthetic text whose offsets are known by construction and on the
 * real corpus:
 *
 *  - a declared range resolves from two two-line anchors to exactly one span of
 *    the stored normalized text, or the declaration is refused by name;
 *  - a quote is located to every occurrence in the stored text, with offsets in
 *    that text and not in the case-folded search form, so a character whose
 *    lower-case form is longer (`İ`) cannot shift a position.
 *
 * What these establish is positional: an occurrence lies inside a span. They
 * establish nothing about whether the words support the proposition; that is
 * the reviewer's judgement, and no offset arithmetic makes it.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import { CorpusIntegrityError } from '../src/corpus/schema';
import { searchable } from '../src/corpus/evidence';
import { join } from 'node:path';
import { loadCorpus } from '../src/corpus/store';
import {
  contains,
  locateQuote,
  resolveRanges,
  type OperativeRange,
} from '../src/corpus/ranges';

const engineRoot = join(__dirname, '..');

/** Synthetic text with the real artefacts' shape: heading, blank, title, blank, body. */
const TEXT = [
  'Header line the pipeline never treats as operative',
  '',
  'Article 1',
  '',
  'Scope',
  '',
  'This Directive applies to undertakings.',
  'A second sentence of Article 1.',
  '',
  'Article 2',
  '',
  'Definitions',
  '',
  'For the purposes of this Directive the following apply.',
  '',
  'CHAPTER 2',
  '',
  'GENERAL PROVISIONS',
  '',
  'Article 3',
  '',
  'Scope',
  '',
  'A different Article 3 with the same title word.',
].join('\n');

const ART1: OperativeRange = { id: 'art-1', start: ['Article 1', 'Scope'], end: ['Article 2', 'Definitions'], justification: 'test' };
const ART2: OperativeRange = { id: 'art-2', start: ['Article 2', 'Definitions'], end: ['CHAPTER 2', 'GENERAL PROVISIONS'], justification: 'test' };

describe('resolveRanges — a declaration becomes one span or is refused', () => {
  it('R1 — resolves a two-line anchor separated by exactly one blank line, and the body excludes both anchors', () => {
    const resolved = resolveRanges(TEXT, [ART1, ART2]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const [a1, a2] = resolved.ranges;
    // Body starts after "Scope\n" and ends at the first character of "Article 2".
    expect(TEXT.slice(a1!.bodyStart, a1!.bodyEnd)).toBe('\nThis Directive applies to undertakings.\nA second sentence of Article 1.\n\n');
    expect(TEXT.slice(a2!.bodyStart, a2!.bodyEnd)).toBe('\nFor the purposes of this Directive the following apply.\n\n');
    expect(TEXT.slice(a1!.bodyEnd, a1!.bodyEnd + 9)).toBe('Article 2');
  });

  it('R2 — an anchor is refused when it does not match, matches twice, or is separated by a single newline', () => {
    const single = { ...ART1, start: ['Article 1', 'Scope'] as [string, string] };
    const collapsed = TEXT.replace('Article 1\n\nScope', 'Article 1\nScope');
    expect(resolveRanges(collapsed, [single])).toMatchObject({ ok: false, problems: [expect.stringContaining('art-1: start anchor')] });
    // "Scope" alone as a title line appears under Article 1 and Article 3: a one-line
    // anchor would be ambiguous, and the pair is what disambiguates. Prove the
    // refusal on a pair that really does occur twice.
    const twice = `${TEXT}\n\nArticle 1\n\nScope\n\nrepeated`;
    const r = resolveRanges(twice, [ART1]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems[0]).toContain('art-1: start anchor');
    expect(r.problems[0]).toContain('2 times');
    expect(resolveRanges(TEXT, [{ ...ART1, start: ['Article 9', 'Scope'] }])).toMatchObject({ ok: false, problems: [expect.stringContaining('0 times')] });
  });

  it('R2 — end before start, overlap, duplicate id and a malformed anchor line are refused by name', () => {
    const backwards = { ...ART1, start: ART1.end, end: ART1.start };
    expect(resolveRanges(TEXT, [backwards])).toMatchObject({ ok: false, problems: [expect.stringContaining('ends before it starts')] });
    const wide = { ...ART1, id: 'wide', end: ART2.end };
    const overlap = resolveRanges(TEXT, [wide, ART2]);
    expect(overlap).toMatchObject({ ok: false, problems: [expect.stringContaining('overlap')] });
    expect(resolveRanges(TEXT, [ART1, { ...ART2, id: 'art-1' }])).toMatchObject({ ok: false, problems: [expect.stringContaining('declared more than once')] });
    expect(resolveRanges(TEXT, [{ ...ART1, start: ['Article 1\n', 'Scope'] }])).toMatchObject({ ok: false, problems: [expect.stringContaining('anchor line')] });
    expect(resolveRanges(TEXT, [{ ...ART1, start: ['', 'Scope'] }])).toMatchObject({ ok: false, problems: [expect.stringContaining('anchor line')] });
  });

  it('R2 positive control — no declarations resolve to no ranges, cleanly', () => {
    expect(resolveRanges(TEXT, [])).toEqual({ ok: true, ranges: [] });
  });
});

describe('locateQuote — every occurrence, with offsets in the stored text', () => {
  it('R3 — finds each occurrence case- and whitespace-insensitively and reports stored offsets and lines', () => {
    const located = locateQuote(TEXT, 'scope');
    expect(located.ok).toBe(true);
    if (!located.ok) return;
    expect(located.occurrences.map((o) => TEXT.slice(o.offset, o.offset + o.length))).toEqual(['Scope', 'Scope']);
    expect(located.occurrences.map((o) => o.line)).toEqual([5, 22]);
    // Runs of spaces collapse; a newline does not become a space, exactly as the evidence checker treats it.
    const spaced = locateQuote(TEXT, '  this   directive applies to undertakings.');
    const broken = locateQuote(TEXT, 'this directive\napplies');
    expect(broken.ok && broken.occurrences.length).toBe(0);
    expect(spaced.ok && spaced.occurrences.length).toBe(1);
  });

  it('R3 — a quote absent from the text locates nowhere, and an empty quote is refused', () => {
    expect(locateQuote(TEXT, 'not in this text')).toEqual({ ok: true, occurrences: [] });
    expect(locateQuote(TEXT, '   ')).toMatchObject({ ok: false });
  });

  it('R4 — a character whose lower-case form is longer does not shift the offsets of what follows', () => {
    // `İ` (U+0130) lower-cases to two code units. Everything after it would be
    // off by one in a search form that was not mapped back to the stored text.
    const text = 'İstanbul convention\n\nArticle 1\n\nScope\n\nThe operative sentence.';
    const located = locateQuote(text, 'the operative sentence.');
    expect(located.ok).toBe(true);
    if (!located.ok) return;
    const [o] = located.occurrences;
    expect(text.slice(o!.offset, o!.offset + o!.length)).toBe('The operative sentence.');
    expect(o!.offset).toBe(text.indexOf('The operative'));
    // The expanding character itself can be quoted, and its occurrence is the stored one.
    const dotted = locateQuote(text, 'İSTANBUL');
    expect(dotted.ok && text.slice(dotted.occurrences[0]!.offset, dotted.occurrences[0]!.offset + dotted.occurrences[0]!.length)).toBe('İstanbul');
    // And a range declared after it resolves at stored offsets too.
    const r = resolveRanges(text, [{ id: 'a1', start: ['Article 1', 'Scope'], end: ['ZZZ', 'ZZZ'], justification: 'x' }]);
    expect(r.ok).toBe(false); // no end anchor: the refusal, not a silent open-ended range
  });

  it('R4 — text that is not whitespace-normalised is refused rather than located at unmappable offsets', () => {
    expect(locateQuote('two  spaces here', 'two spaces')).toMatchObject({ ok: false, problem: expect.stringContaining('not whitespace-normalised') });
    expect(locateQuote(' leading space', 'leading')).toMatchObject({ ok: false });
  });
});

describe('locateQuote — the evidence checker\'s comparison, with positions mapped back', () => {
  /** The checker's own verdict, so every location claim below is tied to what signing already accepts. */
  const checkerFinds = (text: string, quote: string): boolean => searchable(text).includes(searchable(quote));

  it('R8 — contextual sigma: a final sigma in the text matches a final-sigma quote exactly as the checker does', () => {
    // Whole-string lower-casing turns the capital Σ at a word end into ς. A
    // per-code-point fold would produce σ and locate nothing — while the
    // checker, which folds the whole string, accepts the quote.
    const text = 'ΟΣ';
    expect(checkerFinds(text, 'ος')).toBe(true);
    const located = locateQuote(text, 'ος');
    expect(located.ok && located.occurrences).toEqual([{ offset: 0, length: 2, line: 1 }]);
  });

  it('R8 — the opposite discrepancy: a quote in medial form matches only the occurrence the checker matches', () => {
    // `ΟΣ` folds to `ος`, `οσ` stays `οσ`. The checker finds `οσ` once; a
    // locator that folded per code point would report two occurrences, and a
    // range placed over the first would manufacture an eligible location the
    // checker never recognised.
    const text = 'ΟΣ\n\nοσ';
    expect(checkerFinds(text, 'οσ')).toBe(true);
    const located = locateQuote(text, 'οσ');
    expect(located.ok && located.occurrences).toEqual([{ offset: 4, length: 2, line: 3 }]);
    // And the final-sigma quote finds only the first.
    const other = locateQuote(text, 'ος');
    expect(other.ok && other.occurrences).toEqual([{ offset: 0, length: 2, line: 1 }]);
  });

  it('R9 — inside and outside a range are decided on stored offsets, for sigma and for the expanding İ alike', () => {
    const text = ['İ ΟΣ header', '', 'Article 1', '', 'Scope', '', 'The rule: οσ applies.', '', 'Article 2', '', 'Definitions', '', 'Terms.'].join('\n');
    const resolved = resolveRanges(text, [{ id: 'a1', start: ['Article 1', 'Scope'], end: ['Article 2', 'Definitions'], justification: 't' }]);
    if (!resolved.ok) throw new Error(resolved.problems.join('; '));
    const [range] = resolved.ranges;
    const inside = locateQuote(text, 'οσ applies');
    const outside = locateQuote(text, 'ος header');
    if (!inside.ok || !outside.ok) throw new Error('location failed');
    expect(text.slice(inside.occurrences[0]!.offset, inside.occurrences[0]!.offset + inside.occurrences[0]!.length)).toBe('οσ applies');
    expect(contains(range!, inside.occurrences[0]!)).toBe(true);
    // The header's `ΟΣ` is found through the checker's final-sigma fold, at its stored position after the expanding İ, and lies outside.
    expect(text.slice(outside.occurrences[0]!.offset, outside.occurrences[0]!.offset + outside.occurrences[0]!.length)).toBe('ΟΣ header');
    expect(outside.occurrences[0]!.offset).toBe(2);
    expect(contains(range!, outside.occurrences[0]!)).toBe(false);
    // A medial-sigma quote never reaches the header occurrence, exactly as the checker would not.
    const medial = locateQuote(text, 'οσ header');
    expect(checkerFinds(text, 'οσ header')).toBe(false);
    expect(medial.ok && medial.occurrences).toEqual([]);
  });
});

describe('contains — wholly within, never merely beginning inside', () => {
  it('R5 — an occurrence crossing a range boundary is outside, and so is one in the anchor lines', () => {
    const resolved = resolveRanges(TEXT, [ART1, ART2]);
    if (!resolved.ok) throw new Error(resolved.problems.join('; '));
    const [a1, a2] = resolved.ranges;
    const inside = locateQuote(TEXT, 'A second sentence of Article 1.');
    const crossing = locateQuote(TEXT, 'A second sentence of Article 1.\n\nArticle 2\n\nDefinitions\n\nFor the purposes');
    const heading = locateQuote(TEXT, 'Article 2\n\nDefinitions');
    if (!inside.ok || !crossing.ok || !heading.ok) throw new Error('location failed');
    expect(contains(a1!, inside.occurrences[0]!)).toBe(true);
    expect(contains(a1!, crossing.occurrences[0]!)).toBe(false);
    expect(contains(a2!, crossing.occurrences[0]!)).toBe(false);
    expect(contains(a1!, heading.occurrences[0]!)).toBe(false);
    expect(contains(a2!, heading.occurrences[0]!)).toBe(false);
  });
});

describe('the real corpus', () => {
  it('R6 — every declared range in corpus/index.json resolves against the stored text it names', () => {
    const corpus = loadCorpus(join(engineRoot, 'corpus'));
    let declared = 0;
    for (const document of corpus.index.documents) {
      const ranges = document.operativeRanges ?? [];
      declared += ranges.length;
      const resolved = resolveRanges(corpus.normalizedText(document.docId), ranges);
      expect(resolved, document.docId).toMatchObject({ ok: true });
    }
    // The first verification case's two documents carry declarations; the test is not vacuous.
    expect(declared).toBeGreaterThanOrEqual(5);
    expect(readFileSync(join(engineRoot, 'corpus', 'index.json'), 'utf8')).toContain('"operativeRanges"');
  });
});

describe('the loader validates declarations against the text', () => {
  let dir = '';
  afterEach(() => {
    if (dir !== '') rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  /** A one-document corpus whose hashes are right by construction, with the given ranges declared. */
  function writeCorpus(ranges: unknown[]): string {
    dir = mkdtempSync(join(tmpdir(), 'ranges-corpus-'));
    mkdirSync(join(dir, 'raw'), { recursive: true });
    mkdirSync(join(dir, 'normalized'), { recursive: true });
    const raw = '<p>Article 1</p><p>Scope</p><p>The operative sentence.</p><p>Article 2</p><p>Definitions</p><p>Terms.</p>';
    const normalized = normalize(raw);
    writeFileSync(join(dir, 'raw', 'a.html'), raw, 'utf8');
    writeFileSync(join(dir, 'normalized', 'a.txt'), normalized, 'utf8');
    const index = {
      updated: '2026-09-05',
      documents: [
        {
          docId: 'DOC-A',
          serves: ['SRC-001'],
          title: 'Instrument A',
          url: 'https://example.invalid/a',
          versionLabel: 'v1',
          retrievedOn: '2026-09-05',
          rawPath: 'raw/a.html',
          normalizedPath: 'normalized/a.txt',
          sha256Raw: sha256Hex(raw),
          sha256Normalized: sha256Hex(normalized),
          normalizerVersion: NORMALIZER_VERSION,
          contentSelector: null,
          artefactAuthenticity: 'official_consolidation',
          nonOperativeSections: [],
          operativeRanges: ranges,
          edges: [],
        },
      ],
    };
    writeFileSync(join(dir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
    return dir;
  }

  it('R7 — a declaration whose anchor does not resolve makes the corpus fail integrity, naming the range', () => {
    const good = { id: 'art-1', start: ['Article 1', 'Scope'], end: ['Article 2', 'Definitions'], justification: 'the scope article' };
    expect(() => loadCorpus(writeCorpus([good]))).not.toThrow();
    expect(loadCorpus(dir).document('DOC-A').operativeRanges).toEqual([good]);
    rmSync(dir, { recursive: true, force: true });
    const bad = { ...good, id: 'art-9', start: ['Article 9', 'Scope'] };
    let thrown: unknown;
    try {
      loadCorpus(writeCorpus([good, bad]));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CorpusIntegrityError);
    expect((thrown as CorpusIntegrityError).problems.join('\n')).toContain('DOC-A: art-9: start anchor');
    // The schema half: a malformed anchor line never reaches the loader's text check.
    rmSync(dir, { recursive: true, force: true });
    expect(() => loadCorpus(writeCorpus([{ ...good, start: ['Article 1 ', 'Scope'] }]))).toThrow(/anchor line/);
  });
});
