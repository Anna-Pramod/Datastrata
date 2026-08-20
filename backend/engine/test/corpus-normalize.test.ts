/**
 * Normalization is the floor the whole system stands on: every hash, every
 * quote check and every absence search is computed over its output. It is
 * deliberately minimal — unicode form and whitespace only, plus enough HTML
 * extraction to read what EUR-Lex actually serves. It never lowercases and
 * never rewrites punctuation, because both change legal text.
 */

import { describe, expect, it } from 'vitest';
import {
  extractText,
  normalize,
  normalizeWhitespace,
  NORMALIZER_VERSION,
  selectContent,
} from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';

describe('text extraction', () => {
  it('strips tags and keeps the text', () => {
    expect(extractText('<p>Article <b>19a</b></p>')).toBe('Article 19a');
  });

  it('drops script and style content entirely', () => {
    const html = '<style>p{color:red}</style><p>Kept</p><script>var x = 1;</script>';
    expect(extractText(html)).toBe('Kept');
  });

  it('turns block boundaries into line breaks so paragraphs do not merge', () => {
    // A closing and an opening tag each yield a break, so blocks end up
    // separated by a blank line. The property that matters is that they do not
    // run together; the exact gap is stable and survives normalization.
    expect(extractText('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
  });

  it('separates list items the same way', () => {
    expect(extractText('<ul><li>a</li><li>b</li></ul>')).toBe('a\n\nb');
  });

  it('decodes the named entities legal text actually uses', () => {
    expect(extractText('<p>EUR&nbsp;450&nbsp;000 &amp; more &lt;here&gt;</p>')).toBe(
      'EUR\u00a0450\u00a0000 & more <here>',
    );
  });

  it('decodes numeric entities', () => {
    expect(extractText('<p>&#8364;450m</p>')).toBe('\u20ac450m');
  });

  it('leaves plain text untouched', () => {
    expect(extractText('Article 19a')).toBe('Article 19a');
  });

  it('drops header, nav and footer content entirely, as site chrome not legal text', () => {
    // EUR-Lex wraps its megamenu, language switcher and document toolbar in
    // <header>/<nav>, and its site footer in <footer>. None of it is part of
    // the instrument (regression: v1.0.0 stored this chrome as if it were text).
    const html =
      '<header id="op-header"><nav class="MenuBlock">EU law Treaties</nav>Log in</header>' +
      '<p>Article 19a</p>' +
      '<footer class="ecl-site-footer">Legal notice Cookies policy</footer>';
    expect(extractText(html)).toBe('Article 19a');
  });

  it('drops a standalone nav sitting beside the legal text', () => {
    const html = '<nav class="Sidebar">Table of contents</nav><p>Kept</p>';
    expect(extractText(html)).toBe('Kept');
  });

  it('does not survive a DOCTYPE declaration', () => {
    const html = '<!DOCTYPE html><html><body><p>Article 19a</p></body></html>';
    expect(extractText(html)).toBe('Article 19a');
  });

  it('still drops an HTML comment alongside the declaration strip', () => {
    const html = '<!DOCTYPE html><!-- nav redesign 2026 --><p>Kept</p>';
    expect(extractText(html)).toBe('Kept');
  });

  it('still lets "turnover < 40 million" survive alongside declaration stripping', () => {
    // Regression guard: the new declaration-strip pass must not reopen the
    // Task 2 bare-less-than hole.
    expect(
      extractText('<!DOCTYPE html><p>Applies where turnover < 40 million and cost > 10.</p>'),
    ).toBe('Applies where turnover < 40 million and cost > 10.');
  });

  it('scopes extraction to a matching selector, dropping chrome outside it', () => {
    const html =
      '<!DOCTYPE html><header>Skip to main content</header>' +
      '<div id="text"><p>Article 19a</p></div>' +
      '<footer>Top / Table of contents</footer>';
    expect(extractText(html, '#text')).toBe('Article 19a');
  });

  it('throws when a given selector does not match, naming the selector', () => {
    const html = '<div id="other"><p>Article 19a</p></div>';
    expect(() => extractText(html, '#text')).toThrow(/#text/);
  });

  it('does not fall back to the whole document when the selector misses', () => {
    // A silent fallback would store chrome under a config that claims it was
    // excluded. Confirm the throw, not just its message.
    const html = '<header>Skip to main content</header><div id="other">Article 19a</div>';
    expect(() => extractText(html, '#text')).toThrow();
  });
});

describe('selectContent', () => {
  it('returns the outer HTML of the element with a matching id', () => {
    const html = '<div id="wrap"><p>hi</p></div><div id="text"><p>Article 19a</p></div>';
    expect(selectContent(html, '#text')).toBe('<div id="text"><p>Article 19a</p></div>');
  });

  it('returns null when no element has the id', () => {
    const html = '<div id="other"><p>Article 19a</p></div>';
    expect(selectContent(html, '#text')).toBeNull();
  });

  it('does not truncate early at a nested element of the same tag name', () => {
    const html = '<div id="text"><div class="inner"><p>Article 19a</p></div><p>tail</p></div>';
    expect(selectContent(html, '#text')).toBe(html);
  });

  it('is unaffected by several levels of same-name nesting', () => {
    const html =
      '<div id="text"><div><div><p>deep</p></div></div><p>after</p></div>';
    expect(selectContent(html, '#text')).toBe(html);
  });

  it('returns null for a malformed region with no closing tag, rather than running to end of file', () => {
    const html = '<div id="text"><p>Article 19a, unterminated';
    expect(selectContent(html, '#text')).toBeNull();
  });

  it('rejects a selector that is not a bare #id, naming the supported form', () => {
    expect(() => selectContent('<p>x</p>', '.panel-body')).toThrow(/#id/);
    expect(() => selectContent('<p>x</p>', 'div#text')).toThrow(/#id/);
    expect(() => selectContent('<p>x</p>', '#text .child')).toThrow(/#id/);
  });

  it('is not fooled by an id substring match', () => {
    const html = '<div id="text2">wrong</div><div id="text">right</div>';
    expect(selectContent(html, '#text')).toBe('<div id="text">right</div>');
  });

  it('finds the id regardless of attribute order', () => {
    const html = '<div class="panel-body" id="text">Article 19a</div>';
    expect(selectContent(html, '#text')).toBe(html);
  });

  it('is not fooled by an attribute name merely ending in "id"', () => {
    // Regression: a plain `\bid` boundary treats `-`, `:` and `.` as word
    // boundaries too, so it also matches inside data-id=, xml:id=, aria-id=.
    // Each case below places the decoy earlier in the bytes than the real
    // element, which is exactly the arrangement that made the old matcher
    // silently select the wrong region instead of the right one.
    const decoyAttrs = ['data-id', 'xml:id', 'aria-id'];
    for (const attr of decoyAttrs) {
      const html = `<div ${attr}="text">decoy</div><div id="text">real</div>`;
      expect(selectContent(html, '#text')).toBe('<div id="text">real</div>');
    }
  });

  it('matches the id attribute name case-insensitively, like HTML attribute names generally', () => {
    const html = '<div ID="text">Article 19a</div>';
    expect(selectContent(html, '#text')).toBe(html);
  });
});

describe('normalization', () => {
  it('collapses runs of spaces and tabs', () => {
    expect(normalize('EUR   450 \t 000')).toBe('EUR 450 000');
  });

  it('normalises line endings', () => {
    expect(normalize('one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
  });

  it('converts non-breaking spaces to ordinary ones', () => {
    expect(normalize('EUR\u00a0450')).toBe('EUR 450');
  });

  it('applies unicode NFC so decomposed and composed forms agree', () => {
    const decomposed = 'Tu\u0308rkiye'; // u + combining diaeresis
    const composed = 'T\u00fcrkiye'; // precomposed u-umlaut
    expect(decomposed).not.toBe(composed); // different bytes, same word
    expect(normalize(decomposed)).toBe(normalize(composed));
  });

  it('collapses three or more blank lines to one blank line', () => {
    expect(normalize('one\n\n\n\ntwo')).toBe('one\n\ntwo');
  });

  it('preserves case, because case carries meaning in legal text', () => {
    expect(normalize('Large Undertaking')).toBe('Large Undertaking');
  });

  it('preserves dashes, because they appear inside legal identifiers', () => {
    expect(normalize('2013/34/EU \u2014 Accounting Directive')).toBe(
      '2013/34/EU \u2014 Accounting Directive',
    );
  });

  it('normalizeWhitespace is idempotent', () => {
    // The property the system actually relies on: quote checking and absence
    // search run over already-extracted text, so the comparison form must be
    // a fixed point. Asserted on normalizeWhitespace because that is what
    // those call sites use.
    const once = normalizeWhitespace('EUR\u00a0450   000\r\n\r\n\r\n\r\nx');
    expect(normalizeWhitespace(once)).toBe(once);
  });

  it('normalizeWhitespace leaves entities alone, so it cannot double-decode', () => {
    expect(normalizeWhitespace('&amp;lt;')).toBe('&amp;lt;');
  });

  it('extractText decodes a doubly-escaped entity exactly one level', () => {
    // Republished legal HTML routinely carries these. One pass, one level:
    // running extraction again would wrongly decode the result to '<'.
    expect(extractText('&amp;lt;')).toBe('&lt;');
  });

  it('does not delete text around a bare less-than sign', () => {
    // "turnover < 40 million" must survive. A tag stripper that matches any
    // `<...>` deletes from the `<` to the next `>`, silently.
    expect(extractText('<p>Applies where turnover < 40 million and cost > 10.</p>')).toBe(
      'Applies where turnover < 40 million and cost > 10.',
    );
  });

  it('declares a version', () => {
    expect(NORMALIZER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('bumped the normalizer version for the content-selection behaviour change', () => {
    expect(NORMALIZER_VERSION).toBe('1.0.2');
  });
});

describe('hashing', () => {
  it('produces a lowercase 64-character hex digest', () => {
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for the same input', () => {
    expect(sha256Hex('Article 19a')).toBe(sha256Hex('Article 19a'));
  });

  it('differs for different input', () => {
    expect(sha256Hex('Article 19a')).not.toBe(sha256Hex('Article 29a'));
  });

  it('hashes bytes and their utf-8 string form identically', () => {
    const text = 'EUR 450 000 000';
    expect(sha256Hex(new TextEncoder().encode(text))).toBe(sha256Hex(text));
  });
});
