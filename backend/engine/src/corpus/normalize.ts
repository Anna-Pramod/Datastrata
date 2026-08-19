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
export const NORMALIZER_VERSION = '1.0.0';

/** Entities that actually occur in EU legal text. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ', // decoded faithfully; normalize() collapses it to a space
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
 */
export function extractText(rawText: string): string {
  if (!/<[a-zA-Z!/]/.test(rawText)) return decodeEntities(rawText);

  let text = rawText;
  // Content of these elements is machinery, not text.
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Block boundaries become line breaks before tags are stripped.
  text = text.replace(new RegExp(`<\\s*/?\\s*(${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n');
  text = text.replace(/<[^>]*>/g, '');
  return decodeEntities(text).trim();
}

/**
 * The canonical form every hash, quote check and absence search runs over.
 * Idempotent: normalize(normalize(x)) === normalize(x).
 */
export function normalize(rawText: string): string {
  let text = extractText(rawText);
  text = text.normalize('NFC');
  // Unicode spaces that are not line breaks become ordinary spaces.
  text = text.replace(/[   -   　]/g, ' ');
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
