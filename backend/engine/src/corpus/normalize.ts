/**
 * Raw bytes to readable text.
 *
 * Deliberately minimal. Normalization touches unicode form and whitespace and
 * nothing else: it never lowercases and never rewrites punctuation, because
 * both alter legal text, and a quote check that passes on altered text proves
 * nothing. HTML extraction exists only because EUR-Lex serves HTML.
 *
 * The extractor is honest about its limits: it recovers running text, not
 * table structure or footnote association. Improving it is a NORMALIZER_VERSION
 * bump, which the design already handles as `normalizer_changed` — raw bytes
 * are retained precisely so the improved normalizer can be re-run over them.
 */

/** Bump on any change to extractText or normalize. */
export const NORMALIZER_VERSION = '1.0.1';

/** Entities that actually occur in EU legal text. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0', // decoded faithfully; normalize() collapses it to a space
};

/** Tags after which a line break is needed or paragraphs run together. */
const BLOCK_TAGS =
  'p|div|br|tr|li|h1|h2|h3|h4|h5|h6|section|article|table|thead|tbody|blockquote|dt|dd';

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Recover running text from HTML. Plain text passes through unchanged, so this
 * is safe to run over any document.
 *
 * NOT idempotent, and it cannot be: entity decoding turns `&amp;lt;` into
 * `&lt;`, which a second pass would decode again. It is applied exactly once,
 * at ingest, to raw bytes. Anything operating on already-extracted text uses
 * normalizeWhitespace instead.
 */
export function extractText(rawText: string): string {
  if (!/<[a-zA-Z!/]/.test(rawText)) return decodeEntities(rawText);

  let text = rawText;
  // Content of these elements is machinery, not text.
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  // Site chrome, not legal text: page header/nav/footer wrap the same running
  // text on every EUR-Lex page (megamenu, language switcher, document
  // toolbar, consolidated-version picker, site footer). None of it is part of
  // the instrument. HTML5 pages nest at most one of each at the page level,
  // so a non-greedy match to the first closing tag is correct here.
  text = text.replace(/<header\b[^>]*>[\s\S]*?<\/header\s*>/gi, '');
  text = text.replace(/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/gi, '');
  text = text.replace(/<footer\b[^>]*>[\s\S]*?<\/footer\s*>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Block boundaries become line breaks before tags are stripped.
  text = text.replace(new RegExp(`<\\s*/?\\s*(${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n');
  // A tag-shaped opener is required: `<` followed by a letter or `/`. Legal
  // text says "turnover < 40 million"; a bare `<[^>]*>` deletes everything
  // from that `<` to the next `>`, silently, which is the worst possible
  // failure for a corpus whose whole purpose is that the words did not move.
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  return decodeEntities(text).trim();
}

/**
 * Unicode form and whitespace only. Idempotent by construction — it decodes
 * nothing, so there is no second-pass transformation to apply.
 *
 * This is the form comparisons run over, because quote checking and absence
 * search operate on text that has already been extracted, and running full
 * extraction over it again would shift the haystack.
 */
export function normalizeWhitespace(text: string): string {
  let out = text.normalize('NFC');
  // Unicode spaces that are not line breaks become ordinary spaces.
  out = out.replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ');
  out = out.replace(/\r\n?/g, '\n');
  out = out.replace(/[ \t]+/g, ' ');
  out = out.replace(/ *\n */g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/**
 * The ingest path: raw bytes to the canonical stored form. Applied once per
 * document, never to its own output.
 */
export function normalize(rawText: string): string {
  return normalizeWhitespace(extractText(rawText));
}
