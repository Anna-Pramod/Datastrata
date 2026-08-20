/**
 * The entitlement closure — what an agent may read, and what a signature pins.
 *
 * Bounded on purpose. An unbounded transitive walk eventually reaches most of
 * the corpus, and every ingest would then invalidate every signature. The bound
 * is asymmetric because the edge kinds are: structural edges do not lead
 * somewhere new, they lead to the same law in the form that currently governs,
 * so they cost no depth. `references` leads to different law, so it does.
 *
 * Structural edges are followed in both directions — an amending act is needed
 * whether you start from the amended text or the amendment. `references` is
 * followed forwards only: reading an instrument does not require every document
 * that happens to cite it.
 *
 * The hash covers document text hashes AND edge identity and provenance, so a
 * relationship claim cannot be retyped or re-sourced with the documents
 * byte-identical and nothing going stale.
 *
 * referenceDepth: 1 is a v0 hypothesis, not a derived value. B3 measures both
 * evidence excluded by the bound and signature churn under closure change.
 */

import type { CorpusEdge, CorpusIndex, EdgeKind } from './types';
import { sha256Hex } from './hash';

export interface ClosurePolicy {
  /** How many `references` hops from the entry documents are permitted. */
  referenceDepth: number;
  /** Kinds that cost no depth and are followed in both directions. */
  structuralKinds: readonly EdgeKind[];
  /** Kinds that cost a hop and are followed forwards only. */
  referenceKinds: readonly EdgeKind[];
}

/**
 * Kinds that lead to the same law in its currently governing form. Declared
 * here, with the traversal policy that gives them their meaning, and nowhere
 * else.
 */
export const STRUCTURAL_EDGE_KINDS: readonly EdgeKind[] = [
  'amends',
  'amendedBy',
  'consolidates',
  'definesTermsFor',
];

export const CLOSURE_POLICY_V0: ClosurePolicy = {
  referenceDepth: 1,
  structuralKinds: STRUCTURAL_EDGE_KINDS,
  referenceKinds: ['references'],
};

/**
 * An entry document the corpus does not hold. Spec 4.2 files "the document does
 * not exist locally at all" as `corpus_gap`, answered by ingesting it. Building
 * a closure over it anyway would let a signature pin an entitlement over a
 * document nobody has, under a hash covering an empty digest for it.
 */
export class ClosureEntryNotFoundError extends Error {
  constructor(public docId: string) {
    super(
      `Closure entry ${docId} is not in the corpus: that is a corpus_gap — ingest the document rather than closing over it`,
    );
    this.name = 'ClosureEntryNotFoundError';
  }
}

export interface Closure {
  /** Sorted. Every document the reader is entitled to open. */
  docIds: string[];
  /** Sorted. Every edge with both endpoints inside the closure. */
  edgeIds: string[];
  /** Covers document text hashes plus edge identity and provenance. */
  sha256: string;
}

/** Documents that hold the text behind the given SRC-### records. */
export function docsForSources(index: CorpusIndex, sourceIds: string[]): string[] {
  const wanted = new Set(sourceIds);
  const found = new Set<string>();
  for (const d of index.documents) {
    if (d.serves.some((s) => wanted.has(s))) found.add(d.docId);
  }
  return [...found].sort();
}

function allEdges(index: CorpusIndex): CorpusEdge[] {
  return index.documents.flatMap((d) => d.edges);
}

/**
 * Breadth-first over the edge graph, tracking reference depth per document and
 * always keeping the shortest one, so a document reached cheaply can still
 * expand structurally even if it was first seen down an expensive path.
 */
export function computeClosure(
  index: CorpusIndex,
  entryDocIds: string[],
  policy: ClosurePolicy = CLOSURE_POLICY_V0,
): Closure {
  const structural = new Set<EdgeKind>(policy.structuralKinds);
  const reference = new Set<EdgeKind>(policy.referenceKinds);
  const edges = allEdges(index);
  const byId = new Map(index.documents.map((d) => [d.docId, d]));

  const bestDepth = new Map<string, number>();
  const queue: Array<{ docId: string; depth: number }> = [];

  for (const id of entryDocIds) {
    // Membership is checked before seeding, not papered over at hash time: an
    // entry the corpus does not hold is a corpus_gap, and swallowing it here
    // would produce a closure naming a document that does not exist.
    if (!byId.has(id)) throw new ClosureEntryNotFoundError(id);
    if (!bestDepth.has(id) || (bestDepth.get(id) ?? Infinity) > 0) {
      bestDepth.set(id, 0);
      queue.push({ docId: id, depth: 0 });
    }
  }

  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined) break;
    const { docId, depth } = item;
    if ((bestDepth.get(docId) ?? Infinity) < depth) continue;

    for (const e of edges) {
      let next: string | null = null;
      let nextDepth = depth;

      if (structural.has(e.kind)) {
        // Both directions: the amending act is needed from either end.
        if (e.from === docId) next = e.to;
        else if (e.to === docId) next = e.from;
      } else if (reference.has(e.kind) && e.from === docId) {
        if (depth + 1 > policy.referenceDepth) continue;
        next = e.to;
        nextDepth = depth + 1;
      }

      if (next === null) continue;
      if ((bestDepth.get(next) ?? Infinity) <= nextDepth) continue;
      bestDepth.set(next, nextDepth);
      queue.push({ docId: next, depth: nextDepth });
    }
  }

  const docIds = [...bestDepth.keys()].sort();
  const inClosure = new Set(docIds);

  const included = edges
    .filter((e) => inClosure.has(e.from) && inClosure.has(e.to))
    .sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));

  // Canonical serialisation. Every field that changes what the reader was
  // entitled to know, and nothing that does not.
  //
  // Fields are JSON-encoded rather than delimiter-joined. `provenance.source`
  // is free text and `human` provenance is an expected input, so a tab or
  // newline pasted into a citation would otherwise shift field boundaries and
  // let two different edge sets serialise identically. A hash that can collide
  // is a hash that silently fails to move when the entitlement basis changes,
  // which is the exact failure this hash exists to prevent.
  const lines: string[] = [];
  for (const id of docIds) {
    const doc = byId.get(id);
    // Entries are checked above and every traversed node came from an edge
    // endpoint the index resolves (verifyCorpusIntegrity enforces that), so
    // this cannot be missing. If it ever is, the closure hash would silently
    // cover an empty digest for a document — fail instead of defaulting.
    if (doc === undefined) {
      throw new Error(`Closure reached ${id}, which the index does not hold: closure is inconsistent`);
    }
    lines.push(JSON.stringify(['doc', id, doc.sha256Normalized]));
  }
  for (const e of included) {
    lines.push(
      JSON.stringify([
        'edge',
        e.edgeId,
        e.kind,
        e.from,
        e.to,
        e.provenance.type,
        e.provenance.source,
        e.provenance.recordedOn,
      ]),
    );
  }

  return {
    docIds,
    edgeIds: included.map((e) => e.edgeId),
    sha256: sha256Hex(lines.join('\n')),
  };
}
