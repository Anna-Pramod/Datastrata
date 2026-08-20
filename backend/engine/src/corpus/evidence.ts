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

import { z } from 'zod';
import { amendmentDirection } from './schema';
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

/**
 * The runtime schema for `EvidenceItem`, and the only one.
 *
 * The interfaces above describe an evidence item to the compiler; this
 * describes the same item to a validator at runtime, and it lives here beside
 * them rather than in whichever module happens to need validation first. A
 * verification result carries evidence, and defining a second evidence schema
 * there would be two definitions of one data contract — which diverge the
 * first time a field is added to one of them, silently, because neither side
 * has any reason to look at the other.
 *
 * The distinction worth holding is between a shared *contract* and a shared
 * *derivation*. Competing derivations must stay independent, which is why the
 * renderer and its feature checker are separate implementations. Nothing here
 * derives anything from evidence; it only says what an evidence item is. There
 * is no independence to preserve, so a mirror would buy nothing but drift.
 *
 * The `z.ZodType<EvidenceItem>` annotation is what makes that a compiler-
 * enforced claim rather than a comment: adding a field to an interface without
 * adding it here, or the reverse, fails `tsc`.
 *
 * `.strict()` throughout, so an unrecognised key is a validation failure
 * rather than a silently dropped one. A field nobody declared and nobody
 * checks is how `in_catalogue.missReason` survived three modules and a
 * specification all agreeing about it, all wrong.
 *
 * This schema answers "is this well-formed evidence?". `checkEvidenceSet`
 * below answers "is it true?" — it re-reads the corpus and re-finds every
 * quote. Neither substitutes for the other, and neither answers whether
 * evidence *exists at all*: `checkEvidenceSet([])` has nothing to reject and
 * returns clean, so cardinality is the caller's obligation.
 */
const quoteEvidenceSchema = z
  .object({
    kind: z.literal('quote'),
    docId: z.string(),
    sha256Normalized: z.string(),
    text: z.string(),
  })
  .strict() satisfies z.ZodType<QuoteEvidence>;

export const evidenceItemSchema: z.ZodType<EvidenceItem> = z.discriminatedUnion('kind', [
  quoteEvidenceSchema,
  z
    .object({
      kind: z.literal('amendment_chain'),
      hops: z.array(z.object({ edgeId: z.string(), quote: quoteEvidenceSchema }).strict()),
    })
    .strict(),
  z
    .object({
      kind: z.literal('cross_reference'),
      edgeId: z.string(),
      from: quoteEvidenceSchema,
      to: quoteEvidenceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('absence'),
      docIds: z.array(z.string()),
      term: z.string(),
    })
    .strict(),
]);

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
      // A chain has to chain, and a chain has to run one way.
      //
      // Checking hops in isolation would make this item a bag of unrelated
      // (edge, quote) pairs: an agent could assert a chain A -> D out of a
      // genuine A -> B edge and a genuine C -> D edge, both quotes checking,
      // and nothing would object. Requiring only that consecutive hops *touch*
      // is not enough either: two edges that both amend from the same document
      // are connected without either succeeding the other.
      //
      // Orientation is decidable because the direction is canonicalised first.
      // `amends` and `amendedBy` state one relation from opposite ends, so the
      // raw from/to pair says nothing on its own -- but amendmentDirection()
      // resolves both spellings to one (amender, amended) pair, the same one
      // the schema's cycle detection uses. A chain is then oriented when every
      // junction runs the same way: each hop amending the previous hop's
      // amender, or each hop being amended by the previous hop's amended
      // document. Either walk direction is fine; mixing them is not.
      type Amendment = { edgeId: string; amender: string; amended: string };
      const walk: Array<Amendment | null> = [];

      item.hops.forEach((hop, h) => {
        const hopLabel = `${label}.hops[${h}]`;
        const edge = edgeById(corpus, hop.edgeId);
        if (edge === undefined) {
          problems.push(`${hopLabel}: names edge ${hop.edgeId}, which the corpus does not hold`);
          walk.push(null);
        } else {
          if (hop.quote.docId !== edge.from && hop.quote.docId !== edge.to) {
            problems.push(
              `${hopLabel}: quote is taken from ${hop.quote.docId}, which is neither endpoint of edge ${hop.edgeId} (${edge.from} -> ${edge.to})`,
            );
          }
          // A hop must be an amendment. A `references` edge has no amender, so
          // orientation is not a question that can be asked of it -- and a
          // chain of references is not an amendment chain in the first place.
          const direction = amendmentDirection(edge);
          if (direction === null) {
            problems.push(
              `${hopLabel}: edge ${hop.edgeId} is a ${edge.kind} edge; an amendment_chain hop must rest on an amends or amendedBy edge`,
            );
          }
          walk.push(direction === null ? null : { edgeId: hop.edgeId, ...direction });
        }
        checkQuote(hop.quote, corpus, hopLabel, problems);
      });

      // Orientation needs every hop to have a direction; any hop that failed
      // above already carries its own problem, so there is nothing to add.
      const hops: Amendment[] = walk.filter((h): h is Amendment => h !== null);
      if (hops.length === walk.length) {
        let forward = true; // each hop amends the previous hop's amender
        let backward = true; // each hop is amended by the previous hop's amended document
        for (let h = 1; h < hops.length; h += 1) {
          const prev = hops[h - 1] as Amendment;
          const next = hops[h] as Amendment;
          forward = forward && next.amended === prev.amender;
          backward = backward && next.amender === prev.amended;
          // The first junction at which no single walk direction survives the
          // chain so far: where the succession provably breaks, whether the
          // chain never connected or changed direction here.
          if (!forward && !backward) {
            problems.push(
              `${label}.hops[${h}]: edge ${next.edgeId} (${next.amender} amends ${next.amended}) does not continue the amendment chain from ${prev.edgeId} (${prev.amender} amends ${prev.amended}): every hop must run the same way, each one either amending the previous hop's amender or being amended by the previous hop's amended document`,
            );
            break;
          }
        }
      }
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
