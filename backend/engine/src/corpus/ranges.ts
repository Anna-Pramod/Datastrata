/**
 * Operative-provision ranges, and where a quote lies — B-EVID-SPAN.
 *
 * A quote passes the evidence checker when its words occur *somewhere* in a
 * pinned document. That establishes existence, not that the words sit in an
 * operative provision: the first case's threshold sentence occurs four times
 * in the consolidated Accounting Directive, once in Article 29a and three
 * times elsewhere, and the checker cannot tell them apart. This module is the
 * positional half of the answer, and only that half:
 *
 *  - a document's author declares **ranges**, each two anchors of two lines,
 *    and `resolveRanges` turns each into exactly one span of the stored
 *    normalized text or refuses it by name;
 *  - `locateQuote` finds every occurrence of a quote in that text and reports
 *    offsets **in the stored text**, so a signer can be shown the exact place;
 *  - `contains` says whether an occurrence lies wholly inside a range's body.
 *
 * **What a range establishes, precisely.** The body is the text between the
 * end of the start anchor and the beginning of the end anchor. The anchors —
 * a heading and its title line, or an amending point and its instruction —
 * are outside it by construction, so a heading alone can never be support.
 * Nothing further inside the body is excluded: an internal sub-heading, a
 * consolidation marker such as `►M8`, a paragraph label, an amending
 * instruction line, are all inside if they lie between the anchors. An
 * occurrence inside a range is therefore *located in the declared provision*;
 * whether it is substantive legal support for the proposition it is cited
 * for is a judgement the reviewer makes and this module cannot.
 *
 * **The anchor contract.** An anchor is two non-empty lines with no newline
 * inside either. It matches where the stored text holds the first line, one
 * blank line, then the second — the shape every article heading and every
 * amending point takes in the artefacts, whose headings are always followed
 * by an empty line — at a line start and ending at a line end. It must match
 * exactly once in the whole document. A bare heading is not enough: the
 * consolidated Accounting Directive repeats `Article 3` in an annex, and the
 * pair with its title is what makes the anchor unique.
 *
 * **Offsets are stored-text offsets, never search-form offsets.** Location
 * matches on exactly the comparison form the evidence checker uses — the
 * whole text whitespace-collapsed and lower-cased at once — so a quote is
 * located here if and only if signing already accepts it. A case fold can
 * change a string's length (`İ` lower-cases to two code units) and, at a
 * word end, its characters (`Σ` becomes `ς`), so positions in the folded
 * form are mapped back to the stored text through per-code-point lengths,
 * and every offset reported is a position in the text a reader can open.
 * The stored text must already be whitespace-normalised for that map to be
 * exact; the loader's texts are, and any text that is not is refused rather
 * than located approximately.
 *
 * Pure: no filesystem, no clock. The caller hands in text and declarations.
 */

import { searchable } from './evidence';
import { normalizeWhitespace } from './normalize';

/** One declared operative-provision range, as authored in `corpus/index.json`. */
export interface OperativeRange {
  /** Authored, unique within the document; how a signature names the range. */
  id: string;
  /** Two lines that begin the range: a heading and the line after its blank line. */
  start: [string, string];
  /** Two lines that end it — the next heading of any rank. Outside the body. */
  end: [string, string];
  /** Why this range is declared operative, in the author's words. */
  justification: string;
}

/** A range with its body located in the stored text: `[bodyStart, bodyEnd)`. */
export interface ResolvedRange extends OperativeRange {
  bodyStart: number;
  bodyEnd: number;
}

/** One occurrence of a quote: `[offset, offset + length)` in the stored text, and its 1-based line. */
export interface Occurrence {
  offset: number;
  length: number;
  line: number;
}

export type ResolvedRanges = { ok: true; ranges: ResolvedRange[] } | { ok: false; problems: string[] };

/** Every position where `anchor` matches under the anchor contract. */
function anchorMatches(text: string, anchor: readonly [string, string]): number[] {
  const needle = `${anchor[0]}\n\n${anchor[1]}`;
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return positions;
    const end = at + needle.length;
    const lineStart = at === 0 || text[at - 1] === '\n';
    const lineEnd = end === text.length || text[end] === '\n';
    if (lineStart && lineEnd) positions.push(at);
    from = at + 1;
  }
}

function anchorProblem(anchor: readonly [string, string]): string | null {
  for (const line of anchor) {
    if (line.length === 0 || line !== line.trim() || line.includes('\n')) {
      return `anchor line ${JSON.stringify(line)} must be one non-empty, already-trimmed line`;
    }
  }
  return null;
}

/**
 * Resolves every declared range against the stored text, or refuses.
 *
 * Every problem is reported, never the first: an author repairing a
 * declaration should see all of them in one pass. A refusal here is what the
 * loader turns into a corpus integrity failure, so an index whose ranges do
 * not resolve is unusable rather than silently range-less.
 */
export function resolveRanges(text: string, ranges: readonly OperativeRange[]): ResolvedRanges {
  const problems: string[] = [];
  const resolved: ResolvedRange[] = [];
  const ids = new Set<string>();

  for (const range of ranges) {
    if (ids.has(range.id)) problems.push(`${range.id}: range id is declared more than once`);
    ids.add(range.id);
    if (range.justification.trim().length === 0) problems.push(`${range.id}: a range needs a justification`);

    let malformed = false;
    for (const [which, anchor] of [['start', range.start], ['end', range.end]] as const) {
      const problem = anchorProblem(anchor);
      if (problem !== null) {
        problems.push(`${range.id}: ${which} ${problem}`);
        malformed = true;
      }
    }
    if (malformed) continue;

    const starts = anchorMatches(text, range.start);
    const ends = anchorMatches(text, range.end);
    if (starts.length !== 1) {
      problems.push(`${range.id}: start anchor ${JSON.stringify(range.start)} matches ${starts.length} times; it must match exactly once at a line start, its two lines separated by one blank line`);
    }
    if (ends.length !== 1) {
      problems.push(`${range.id}: end anchor ${JSON.stringify(range.end)} matches ${ends.length} times; it must match exactly once at a line start, its two lines separated by one blank line`);
    }
    if (starts.length !== 1 || ends.length !== 1) continue;

    const startAt = starts[0]!;
    const endAt = ends[0]!;
    // The body begins after the start anchor's second line and the newline
    // that ends it; it ends where the end anchor's first character sits.
    const anchorEnd = startAt + range.start[0].length + 2 + range.start[1].length;
    const bodyStart = Math.min(anchorEnd + 1, text.length);
    if (endAt <= startAt) {
      problems.push(`${range.id}: the range ends before it starts (end anchor at ${endAt}, start anchor at ${startAt})`);
      continue;
    }
    resolved.push({ ...range, bodyStart, bodyEnd: endAt });
  }

  // Overlap, over the resolved set in text order. Two ranges may share an
  // anchor line — one's end is the next one's start — because the shared
  // anchor is outside both bodies.
  const ordered = [...resolved].sort((a, b) => a.bodyStart - b.bodyStart);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1]!;
    const next = ordered[i]!;
    if (next.bodyStart < prev.bodyEnd) {
      problems.push(`${prev.id} and ${next.id} overlap: a position may lie in at most one declared range`);
    }
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, ranges: resolved };
}

/**
 * The checker's comparison form of `text`, with a map from each of its code
 * units back to the stored code point it came from.
 *
 * **The form is `searchable(text)` itself — the whole string lower-cased at
 * once — never a fold built one code point at a time.** The two differ:
 * `String.prototype.toLowerCase` maps a capital sigma at a word end to the
 * final form `ς`, so `ΟΣ` folds to `ος` as a whole and to `οσ` piecewise.
 * The evidence checker accepts the quote `ος` against that text and rejects
 * `οσ`; a locator folding piecewise would do the reverse, refusing a quote
 * signing accepts and — worse — reporting an occurrence for a quote signing
 * never recognised, which a range placed over it would turn into eligible
 * support. So the comparison contract is imported, not re-implemented.
 *
 * What is built here is only the map. The whole-string fold changes a
 * string's *characters* contextually but its *length* exactly as the
 * per-code-point fold does (`İ` becomes two code units either way; the sigma
 * stays one), so the per-code-point lengths give each unit of the form its
 * stored origin. That equality is checked rather than assumed: if the two
 * folds ever disagree in total length, no position can be trusted and the
 * caller is refused rather than located approximately.
 */
function folded(text: string): { form: string; start: number[]; end: number[] } | null {
  const form = searchable(text);
  const start: number[] = [];
  const end: number[] = [];
  let at = 0;
  for (const point of text) {
    const units = point.toLowerCase().length;
    for (let i = 0; i < units; i += 1) {
      start.push(at);
      end.push(at + point.length);
    }
    at += point.length;
  }
  return start.length === form.length ? { form, start, end } : null;
}

export type LocatedQuote = { ok: true; occurrences: Occurrence[] } | { ok: false; problem: string };

/**
 * Every occurrence of `quote` in `text`, as stored-text offsets.
 *
 * The match is exactly the evidence checker's — `searchable(text)` searched
 * for `searchable(quote)` — so a quote is located here if and only if the
 * checker accepts it, occurrence for occurrence. Two named refusals rather
 * than approximations: a text that is not already whitespace-normalised,
 * whose positions could not be mapped exactly, and an empty quote.
 */
export function locateQuote(text: string, quote: string): LocatedQuote {
  if (normalizeWhitespace(text) !== text) {
    return { ok: false, problem: 'the stored text is not whitespace-normalised, so search positions cannot be mapped to it exactly' };
  }
  const needle = searchable(quote);
  if (needle.length === 0) return { ok: false, problem: 'the quote is empty' };

  const mapped = folded(text);
  if (mapped === null) {
    return { ok: false, problem: 'the case-folded form of the stored text cannot be mapped back to it position by position' };
  }
  const { form, start, end } = mapped;
  const occurrences: Occurrence[] = [];
  let from = 0;
  for (;;) {
    const at = form.indexOf(needle, from);
    if (at === -1) break;
    const offset = start[at]!;
    const stop = end[at + needle.length - 1]!;
    occurrences.push({ offset, length: stop - offset, line: lineOf(text, offset) });
    from = at + 1;
  }
  return { ok: true, occurrences };
}

/** 1-based line number of a stored-text offset. */
export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Wholly within the body: it begins at or after the body's start and ends at or before its end. */
export function contains(range: ResolvedRange, occurrence: Occurrence): boolean {
  return occurrence.offset >= range.bodyStart && occurrence.offset + occurrence.length <= range.bodyEnd;
}
