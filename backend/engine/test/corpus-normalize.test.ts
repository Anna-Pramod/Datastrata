/**
 * Normalization is the floor the whole system stands on: every hash, every
 * quote check and every absence search is computed over its output. It is
 * deliberately minimal — unicode form and whitespace only, plus enough HTML
 * extraction to read what EUR-Lex actually serves. It never lowercases and
 * never rewrites punctuation, because both change legal text.
 */

import { describe, expect, it } from 'vitest';
import { extractText, normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
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
      'EUR 450 000 & more <here>',
    );
  });

  it('decodes numeric entities', () => {
    expect(extractText('<p>&#8364;450m</p>')).toBe('€450m');
  });

  it('leaves plain text untouched', () => {
    expect(extractText('Article 19a')).toBe('Article 19a');
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
    expect(normalize('EUR 450')).toBe('EUR 450');
  });

  it('applies unicode NFC so decomposed and composed forms agree', () => {
    const decomposed = 'Türkiye'; // u + combining diaeresis
    const composed = 'Türkiye'; // precomposed u-umlaut
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
    expect(normalize('2013/34/EU — Accounting Directive')).toBe(
      '2013/34/EU — Accounting Directive',
    );
  });

  it('is idempotent', () => {
    const once = normalize('<p>EUR&nbsp;450   000</p>\r\n\r\n\r\n<p>x</p>');
    expect(normalize(once)).toBe(once);
  });

  it('declares a version', () => {
    expect(NORMALIZER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
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

  it('renormalising raw text reproduces the normalized hash', () => {
    // This is the property that makes a normalizer upgrade recoverable: raw
    // bytes plus a normalizer always reconstruct the normalized form.
    const raw = '<p>EUR&nbsp;450   000</p>';
    const normalized = normalize(raw);
    expect(sha256Hex(normalize(raw))).toBe(sha256Hex(normalized));
  });
});
