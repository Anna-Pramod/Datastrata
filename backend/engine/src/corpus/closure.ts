/**
 * The entitlement closure — what an agent may read, and what a signature pins.
 *
 * Bounded on purpose. An unbounded transitive walk eventually reaches most of
 * the corpus, and every ingest would then invalidate every signature. The bound
 * is asymmetric because the edge kinds are: structural edges lead to the same
 * law in another form, so they cost no depth; `references` leads to different
 * law, so it does.
 *
 * **Expansion is gated on standing.** A structural edge from law in force can
 * lead to a *future* form of it — an adopted amending act not yet in force —
 * and a `references` edge can lead to future law directly. Under
 * `CLOSURE_POLICY_V1` a document is reached by expansion, along either kind of
 * edge, only if every source it serves is `in_force`; a document is indivisible
 * and its text is rendered whole, so one adopted-not-effective source makes the
 * whole artefact ineligible. Direct citation still admits it: a requirement
 * that names an adopted act is entitled to read it, labelled as what it is.
 * Standing is handed in (`standing.ts`), never read from a pack here, so this
 * module stays pure over the index.
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
import { MissingStandingError, type StandingMap } from './standing';

/**
 * Whether expansion consults standing. Behavioural rather than a version
 * label: `computeClosure` reads it, so a policy cannot claim the standing-aware
 * traversal without performing it, and `pipelineVersion` hashes it, so the
 * claim is part of every identity.
 */
export type ExpansionRule = 'unconditional' | 'served_sources_in_force';

export interface ClosurePolicy {
  /** How many `references` hops from the entry documents are permitted. */
  referenceDepth: number;
  /** Kinds that cost no depth and are followed in both directions. */
  structuralKinds: readonly EdgeKind[];
  /** Kinds that cost a hop and are followed forwards only. */
  referenceKinds: readonly EdgeKind[];
  /** Which documents an expansion step may reach. */
  expansion: ExpansionRule;
}

/**
 * Kinds that lead to the same law in another form — its amendment, its
 * consolidation, its definitions. Not necessarily its *currently governing*
 * form: an adopted-not-effective amending act is a future form, which is why
 * expansion along these kinds is gated on standing rather than free. Declared
 * here, with the traversal policy that gives them their meaning, and nowhere
 * else.
 */
export const STRUCTURAL_EDGE_KINDS: readonly EdgeKind[] = [
  'amends',
  'amendedBy',
  'consolidates',
  'definesTermsFor',
];

/**
 * The pre-standing policy, retained as a value so the discriminator can be
 * proved behavioural: under it every neighbour is reached whatever its
 * standing. **Not for production use** — `CLOSURE_POLICY_V1` is the default
 * everywhere a closure is built for a role.
 */
export const CLOSURE_POLICY_V0: ClosurePolicy = {
  referenceDepth: 1,
  structuralKinds: STRUCTURAL_EDGE_KINDS,
  referenceKinds: ['references'],
  expansion: 'unconditional',
};

/** The governing policy: expansion reaches only documents whose every served source is in force. */
export const CLOSURE_POLICY_V1: ClosurePolicy = {
  referenceDepth: 1,
  structuralKinds: STRUCTURAL_EDGE_KINDS,
  referenceKinds: ['references'],
  expansion: 'served_sources_in_force',
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
 *
 * `standing` is **required**, and precedes the defaulted `policy` on purpose:
 * an optional map would let a caller omit it and compute a different digest
 * for the same closure, and every call site lacking it fails to compile
 * instead. It carries only the pack-derived half; authenticity and the
 * non-operative sections are read off the document itself, so a caller cannot
 * hand in a copy that disagrees with the index the hash describes.
 *
 * **Absence fails closed, per closure member.** A neighbour whose standing is
 * unknown is simply not eligible for expansion; a document that *is* in the
 * closure — an entry, or reached under `unconditional` — and is served by a
 * source with no declared standing is refused with `MissingStandingError`,
 * because the hash below would otherwise have to describe it, and the roles
 * would be shown it without being told what it is.
 */
export function computeClosure(
  index: CorpusIndex,
  entryDocIds: string[],
  standing: StandingMap,
  policy: ClosurePolicy = CLOSURE_POLICY_V1,
): Closure {
  const structural = new Set<EdgeKind>(policy.structuralKinds);
  const reference = new Set<EdgeKind>(policy.referenceKinds);
  const edges = allEdges(index);
  const byId = new Map(index.documents.map((d) => [d.docId, d]));

  // R-b: eligible only if *every* served source is in force. The quantifier is
  // exactly that — a document serving no source is vacuously eligible here and
  // is refused later by closure citability (`no served source`), which owns
  // that question; a document the map does not know is not eligible. Under
  // `unconditional` the question is not asked, which is what makes the
  // discriminator behavioural rather than a label.
  const eligible = (docId: string): boolean => {
    if (policy.expansion === 'unconditional') return true;
    const sources = standing.get(docId);
    return sources !== undefined && sources.every((s) => s.temporalStanding === 'in_force');
  };

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
      // Not enqueued at all: an ineligible document neither joins the closure
      // nor expands further. Checked on both branches, because a `references`
      // edge into future law is the same exposure as a structural one.
      if (!eligible(next)) continue;
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

  // Fail closed before hashing: every closure member must carry a standing
  // for every source it serves. Reported all at once, naming the source.
  const missing: { docId: string; sourceId: string }[] = [];
  for (const id of docIds) {
    const sources = standing.get(id);
    const doc = byId.get(id);
    if (doc === undefined) continue; // reported below
    if (sources === undefined) {
      for (const sourceId of doc.serves) missing.push({ docId: id, sourceId });
      continue;
    }
    for (const s of sources) if (s.temporalStanding === null) missing.push({ docId: id, sourceId: s.sourceId });
  }
  if (missing.length > 0) throw new MissingStandingError(missing);

  // Canonical serialisation. Every field that changes what the reader was
  // entitled to know, and nothing that does not: the text, what kind of
  // artefact it is, which of its sections are declared non-operative, and the
  // standing of every source it serves. A role that is told all four is shown a
  // different surface from one that is told only the first, so the hash moves.
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
    const sources = (standing.get(id) ?? []).map((s) => [s.sourceId, s.temporalStanding]);
    lines.push(
      JSON.stringify([
        'doc',
        id,
        doc.sha256Normalized,
        doc.artefactAuthenticity,
        doc.nonOperativeSections,
        sources,
      ]),
    );
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
