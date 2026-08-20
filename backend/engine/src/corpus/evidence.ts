/**
 * Mechanical evidence checking — the anti-hallucination control.
 *
 * A conclusion in a verification result is only as good as the text behind it,
 * so every quote is checked as a literal substring of the exact document it
 * names, at the hash it names. A fabricated quote fails the build, not the
 * review, which is what lets a reviewer trust a dossier without re-reading the
 * law.
 *
 * `absence` is the item that would otherwise be pure assertion. Re-running the
 * search makes it checkable — but only lexically. A search can prove a phrase
 * does not occur; it cannot prove no economically equivalent criterion exists
 * under different words. That is a legal judgment, so absence may never be the
 * sole evidence for a conclusion.
 */

import type { LoadedCorpus } from './store';
import { normalizeWhitespace } from './normalize';

export interface QuoteEvidence {
  kind: 'quote';
  docId: string;
  /** The document hash at the time of quoting. Must still match. */
  sha256Normalized: string;
  text: string;
}

export interface AmendmentChainEvidence {
  kind: 'amendment_chain';
  hops: Array<{ edgeId: string; quote: QuoteEvidence }>;
}

export interface CrossReferenceEvidence {
  kind: 'cross_reference';
  edgeId: string;
  from: QuoteEvidence;
  to: QuoteEvidence;
}

export interface AbsenceEvidence {
  kind: 'absence';
  docIds: string[];
  term: string;
}

export type EvidenceItem =
  | QuoteEvidence
  | AmendmentChainEvidence
  | CrossReferenceEvidence
  | AbsenceEvidence;

export interface EvidenceCheckResult {
  ok: boolean;
  problems: string[];
}

/**
 * Comparison form: whitespace-normalized, then case-folded. Casing must not
 * hide a hit.
 *
 * Uses normalizeWhitespace, NOT normalize: both sides of every comparison here
 * are already-extracted text, and re-running extraction over it would decode
 * entities a second time and shift the haystack out from under the quote.
 */
function searchable(text: string): string {
  return normalizeWhitespace(text).toLowerCase();
}

function checkQuote(q: QuoteEvidence, corpus: LoadedCorpus, label: string, problems: string[]): void {
  if (q.text.trim().length === 0) {
    problems.push(`${label}: quote is empty`);
    return;
  }

  let expectedHash: string;
  try {
    expectedHash = corpus.document(q.docId).sha256Normalized;
  } catch {
    problems.push(`${label}: quote names ${q.docId}, which the corpus does not hold`);
    return;
  }

  if (expectedHash !== q.sha256Normalized) {
    problems.push(
      `${label}: quote pins ${q.docId} at hash ${q.sha256Normalized.slice(0, 12)}\u2026, corpus holds ${expectedHash.slice(0, 12)}\u2026`,
    );
    return;
  }

  const haystack = searchable(corpus.normalizedText(q.docId));
  if (!haystack.includes(searchable(q.text))) {
    problems.push(`${label}: quote not found in ${q.docId}: "${q.text.slice(0, 80)}"`);
  }
}

function edgeById(corpus: LoadedCorpus, edgeId: string) {
  for (const d of corpus.index.documents) {
    for (const e of d.edges) {
      if (e.edgeId === edgeId) return e;
    }
  }
  return undefined;
}

/**
 * Checks one evidence set — the items backing a single conclusion. Returns
 * every problem found rather than the first, so a result can be repaired in one
 * pass instead of one round trip per defect.
 */
export function checkEvidenceSet(items: EvidenceItem[], corpus: LoadedCorpus): EvidenceCheckResult {
  const problems: string[] = [];

  if (items.length === 0) {
    return { ok: false, problems: ['evidence set contains no evidence'] };
  }

  if (items.every((i) => i.kind === 'absence')) {
    problems.push(
      'absence is the sole evidence for this conclusion: lexical absence cannot establish that no equivalent criterion exists under different words',
    );
  }

  items.forEach((item, i) => {
    const label = `evidence[${i}]`;

    if (item.kind === 'quote') {
      checkQuote(item, corpus, label, problems);
      return;
    }

    if (item.kind === 'amendment_chain') {
      if (item.hops.length === 0) {
        problems.push(`${label}: amendment chain has no hops`);
        return;
      }
      item.hops.forEach((hop, h) => {
        const hopLabel = `${label}.hops[${h}]`;
        if (edgeById(corpus, hop.edgeId) === undefined) {
          problems.push(`${hopLabel}: names edge ${hop.edgeId}, which the corpus does not hold`);
        }
        checkQuote(hop.quote, corpus, hopLabel, problems);
      });
      return;
    }

    if (item.kind === 'cross_reference') {
      const edge = edgeById(corpus, item.edgeId);
      if (edge === undefined) {
        problems.push(`${label}: names edge ${item.edgeId}, which the corpus does not hold`);
      } else if (edge.from !== item.from.docId || edge.to !== item.to.docId) {
        problems.push(
          `${label}: edge ${item.edgeId} does not connect ${item.from.docId} to ${item.to.docId}`,
        );
      }
      checkQuote(item.from, corpus, `${label}.from`, problems);
      checkQuote(item.to, corpus, `${label}.to`, problems);
      return;
    }

    // absence
    if (item.docIds.length === 0) {
      problems.push(`${label}: absence claim names no documents`);
      return;
    }
    if (item.term.trim().length === 0) {
      problems.push(`${label}: absence claim has an empty term`);
      return;
    }
    const needle = searchable(item.term);
    for (const docId of item.docIds) {
      let text: string;
      try {
        text = corpus.normalizedText(docId);
      } catch {
        problems.push(`${label}: absence claim names ${docId}, which the corpus does not hold`);
        continue;
      }
      if (searchable(text).includes(needle)) {
        problems.push(`${label}: "${item.term}" occurs in ${docId}, so it is not absent`);
      }
    }
  });

  return { ok: problems.length === 0, problems };
}
