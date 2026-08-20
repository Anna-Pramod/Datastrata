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

import type { CorpusEdge } from './types';
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
 *
 * Precondition: `corpus` came from `loadCorpus`, which re-derived every stored
 * hash from the files on disk. That is why the document's recorded
 * `sha256Normalized` is treated here as authoritative rather than re-derived
 * per quote: this function checks that a quote pins the hash the corpus holds,
 * and `loadCorpus` is what makes that hash a fact about the bytes. Handed a
 * corpus assembled some other way, these checks are only as good as it is.
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
      // A chain has to chain. Checking each hop in isolation would make this
      // item a bag of unrelated (edge, quote) pairs: an agent could assert a
      // chain A -> D out of a genuine A -> B edge and a genuine C -> D edge,
      // with both quotes checking, and nothing would object.
      //
      // Consecutive hops must share a document. Sharing, not `previous.to ===
      // current.from`: the same relation is recorded from either end
      // (`amends` and `amendedBy`), so an edge's direction does not tell you
      // which way the chain is being walked, and requiring a particular
      // orientation would reject honest chains.
      let previous: CorpusEdge | undefined;
      item.hops.forEach((hop, h) => {
        const hopLabel = `${label}.hops[${h}]`;
        const edge = edgeById(corpus, hop.edgeId);
        if (edge === undefined) {
          problems.push(`${hopLabel}: names edge ${hop.edgeId}, which the corpus does not hold`);
        } else {
          if (hop.quote.docId !== edge.from && hop.quote.docId !== edge.to) {
            problems.push(
              `${hopLabel}: quote is taken from ${hop.quote.docId}, which is neither endpoint of edge ${hop.edgeId} (${edge.from} -> ${edge.to})`,
            );
          }
          if (previous !== undefined) {
            const shares =
              previous.from === edge.from ||
              previous.from === edge.to ||
              previous.to === edge.from ||
              previous.to === edge.to;
            if (!shares) {
              problems.push(
                `${hopLabel}: edge ${hop.edgeId} (${edge.from} -> ${edge.to}) does not continue the chain from ${previous.edgeId} (${previous.from} -> ${previous.to}): consecutive hops must share a document`,
              );
            }
          }
          previous = edge;
        }
        checkQuote(hop.quote, corpus, hopLabel, problems);
      });
      return;
    }

    if (item.kind === 'cross_reference') {
      const edge = edgeById(corpus, item.edgeId);
      if (edge === undefined) {
        problems.push(`${label}: names edge ${item.edgeId}, which the corpus does not hold`);
      } else {
        // Spec 2.2: "Both quotes check; a `references` edge connects them."
        // The kind is the claim. "X cites Y" and "X was amended by Y" are
        // different legal relations, and an amendment edge does not establish
        // that one provision cross-refers to another.
        if (edge.kind !== 'references') {
          problems.push(
            `${label}: edge ${item.edgeId} is a ${edge.kind} edge; a cross_reference must rest on a references edge`,
          );
        }
        if (edge.from !== item.from.docId || edge.to !== item.to.docId) {
          problems.push(
            `${label}: edge ${item.edgeId} does not connect ${item.from.docId} to ${item.to.docId}`,
          );
        }
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
