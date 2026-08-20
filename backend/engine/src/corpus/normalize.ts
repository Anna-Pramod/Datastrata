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
 *
 * Ingest can optionally scope extraction to one element via a `#id` selector
 * (see `selectContent`), so that a hash meant to move only when the law's
 * words move is not also moved by a site's navigation redesign.
 */

/** Bump on any change to extractText or normalize. */
export const NORMALIZER_VERSION = '1.0.2';

/**
 * v0 selector syntax: a bare `#id`, nothing else. There is no dependency
 * budget for a real DOM/CSS-selector parser (see selectContent), so rather
 * than accept CSS-selector-shaped input and silently mishandle everything
 * past the first `#id` (descendant combinators, classes, attribute
 * selectors, pseudo-classes), the contract only claims what it can actually
 * do and rejects the rest outright.
 */
export const CONTENT_SELECTOR_PATTERN = /^#[A-Za-z][-A-Za-z0-9_:.]*$/;

/** Elements that never have a closing tag and so never carry nested content. */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locates the element carrying `id="<selector's id>"` and returns its outer
 * HTML (opening tag through matching closing tag, inclusive), or `null` when
 * no element carries that id.
 *
 * Algorithm, since there is no HTML parser available: find a literal `id`
 * attribute by exact value match, walk back to the `<` that opens the tag
 * carrying it, read that tag's name, then scan forward counting opens and
 * closes of that same tag name (self-closing and void instances of it do not
 * change the count) until the count returns to zero. That is the matching
 * close. Depth counting handles same-name nesting correctly by construction:
 * it is oblivious to how many other elements sit inside, only to how many
 * more opens-of-this-name occur before the next close-of-this-name. If the
 * count never returns to zero the region is malformed and `null` is
 * returned, rather than running to end of file and calling that "the
 * region".
 *
 * The `id` match requires an actual attribute-name boundary (whitespace or
 * `<` immediately before it): `\b` alone is not enough, because `-`, `:`
 * and `.` are non-word characters, so a plain `\bid` also matches inside
 * `data-id=`, `xml:id=` and `aria-id=`. Without the boundary check, a decoy
 * attribute carrying the selector's value earlier in the bytes than the real
 * element would win silently (`exec` returns the first match) -- no `null`,
 * no throw, just the wrong region, one that reproduces identically on every
 * later `normalize` call because the function is deterministic. The attribute
 * *name* is matched case-insensitively (`[iI][dD]`), matching HTML's own
 * attribute-name case-insensitivity and the case-insensitive tag-name scan
 * below; the attribute *value* stays case-sensitive, since `#Text` and
 * `#text` must not be treated as the same selector.
 *
 * Known imprecision, inherent to a regex scanner rather than a DOM parser:
 * the tag-close scan below (`[^>]*?`) ends a tag at the first `>`, so an
 * attribute value containing a literal `>` (e.g. `data-foo="a>b"`) would
 * terminate that tag's match early. Out of dependency budget to fix
 * properly (see the module-level note on why there is no DOM parser here).
 *
 * Throws only for a syntactically unsupported selector, never for one that
 * is well-formed but simply does not appear in the document.
 */
export function selectContent(rawText: string, selector: string): string | null {
  if (!CONTENT_SELECTOR_PATTERN.test(selector)) {
    throw new Error(
      `Unsupported content selector "${selector}": v0 supports only a bare "#id" ` +
        '(a letter, then letters, digits, "-", "_", ":" or "."). ' +
        'There is no CSS/DOM selector engine here, so anything else is rejected rather than silently mishandled.',
    );
  }
  const id = selector.slice(1);

  const idAttr = new RegExp(`(?<=[\\s<])[iI][dD]\\s*=\\s*(["'])${escapeRegExp(id)}\\1`);
  const attrMatch = idAttr.exec(rawText);
  if (attrMatch === null) return null;

  // Walk back to the '<' that opens this attribute's element. If a '>'
  // appears between that '<' and the attribute, the attribute is not
  // actually inside an open tag (malformed markup); treat that as no match.
  const tagStart = rawText.lastIndexOf('<', attrMatch.index);
  if (tagStart === -1) return null;
  if (rawText.slice(tagStart, attrMatch.index).includes('>')) return null;

  const tagNameMatch = /^<([A-Za-z][A-Za-z0-9]*)/.exec(rawText.slice(tagStart));
  if (tagNameMatch === null) return null;
  const tagName = tagNameMatch[1] as string;

  const openTagEnd = rawText.indexOf('>', attrMatch.index);
  if (openTagEnd === -1) return null;

  // `<div id="x"/>` or a same-named void element: no body to scan.
  const selfClosing = rawText[openTagEnd - 1] === '/';
  if (selfClosing || VOID_TAGS.has(tagName.toLowerCase())) {
    return rawText.slice(tagStart, openTagEnd + 1);
  }

  const sameNameTag = new RegExp(`<(/?)${escapeRegExp(tagName)}\\b[^>]*?(/?)>`, 'gi');
  sameNameTag.lastIndex = openTagEnd + 1;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = sameNameTag.exec(rawText)) !== null) {
    const isClose = m[1] === '/';
    const isSelfClosingInstance = m[2] === '/';
    if (isSelfClosingInstance && !isClose) continue; // e.g. <div class="x"/> — no body, no depth change
    depth += isClose ? -1 : 1;
    if (depth === 0) {
      return rawText.slice(tagStart, m.index + m[0].length);
    }
  }
  return null; // no matching close: malformed region, not "the rest of the file"
}

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
 * With `selector` supplied, extraction runs only over the element it names
 * (see `selectContent`) — a selector that does not match is an error, never a
 * silent fallback to the whole document, because falling back would store
 * chrome under a config that claims it was excluded, and the stored text
 * would then not be what the index says it is.
 *
 * Without a selector, extraction runs over the whole document; the tag-based
 * header/nav/footer strip below stays in for that path as defence-in-depth,
 * since nothing else keeps page chrome out. With a selector, that strip is
 * skipped: the region boundary has already excluded page-level chrome (it
 * lives outside the selected element), and HTML5 permits a `<header>` or
 * `<footer>` *inside* an `<article>`/`<section>` to mark a sub-unit's own
 * heading or closing material — stripping by tag name inside an already-
 * trusted content region would risk deleting exactly that legitimate text.
 *
 * NOT idempotent, and it cannot be: entity decoding turns `&amp;lt;` into
 * `&lt;`, which a second pass would decode again. It is applied exactly once,
 * at ingest, to raw bytes. Anything operating on already-extracted text uses
 * normalizeWhitespace instead.
 */
export function extractText(rawText: string, selector?: string): string {
  let scoped = rawText;
  if (selector !== undefined) {
    const region = selectContent(rawText, selector);
    if (region === null) {
      throw new Error(
        `Content selector "${selector}" did not match any element in the document. ` +
          'Refusing to fall back to the whole document: that would store chrome under a ' +
          'configuration claiming it was excluded.',
      );
    }
    scoped = region;
  }

  if (!/<[a-zA-Z!/]/.test(scoped)) return decodeEntities(scoped);

  let text = scoped;
  // Content of these elements is machinery, not text.
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  if (selector === undefined) {
    // Site chrome, not legal text: page header/nav/footer wrap the same
    // running text on every EUR-Lex page (megamenu, language switcher,
    // document toolbar, consolidated-version picker, site footer). None of
    // it is part of the instrument. The property this non-greedy match
    // depends on is that these elements do not nest *inside themselves*
    // (a <nav> is never a descendant of another <nav>) — EUR-Lex pages carry
    // several sibling <nav> blocks, so "at most one at the page level" does
    // not hold, but non-self-nesting is all a non-greedy match needs: it
    // only has to reach the correct closing tag for whichever occurrence it
    // is currently matching, not count depth.
    text = text.replace(/<header\b[^>]*>[\s\S]*?<\/header\s*>/gi, '');
    text = text.replace(/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/gi, '');
    text = text.replace(/<footer\b[^>]*>[\s\S]*?<\/footer\s*>/gi, '');
  }
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Declarations (<!DOCTYPE ...> and the like) are not comments and are not
  // tags; strip them explicitly, before the tag pass. The negative lookahead
  // keeps this independent of the comment strip's position: `<!--` is never
  // matched here, so it can never truncate a comment at an internal '>'.
  text = text.replace(/<!(?!--)[^>]*>/g, '');
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
 * document, never to its own output. `selector`, when given, is passed
 * straight through to `extractText`.
 */
export function normalize(rawText: string, selector?: string): string {
  return normalizeWhitespace(extractText(rawText, selector));
}
