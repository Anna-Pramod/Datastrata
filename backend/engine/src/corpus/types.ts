/**
 * Corpus schema — the snapshotted legal record.
 *
 * A requirement cites `SRC-###` records; this store holds the actual text
 * behind them, byte-pinned, so a signature can name the exact words that were
 * read. Edges are legal claims about how instruments relate, not bookkeeping,
 * so each one carries where it came from and when it was recorded.
 */

/**
 * `references` is the only kind that costs traversal depth; the rest lead to
 * the same law in the form that currently governs it. See closure.ts.
 */
export type EdgeKind = 'amends' | 'amendedBy' | 'consolidates' | 'references' | 'definesTermsFor';

/**
 * `human` is legitimate and expected — not every relation is published as
 * metadata. Labelling it honestly is what makes hand-asserted relations
 * countable rather than indistinguishable from derived ones.
 */
export type EdgeProvenanceType = 'eli_metadata' | 'celex_metadata' | 'human';

export interface EdgeProvenance {
  type: EdgeProvenanceType;
  /** Where the claim came from, in enough detail to re-check it by hand. */
  source: string;
  /** ISO date (YYYY-MM-DD) the relation was recorded. */
  recordedOn: string;
}

export interface CorpusEdge {
  /** Stable identity. Hashed into the closure, so it must not be recycled. */
  edgeId: string;
  kind: EdgeKind;
  /** Always the docId of the document carrying this edge. Validated. */
  from: string;
  to: string;
  provenance: EdgeProvenance;
}

export interface CorpusDocument {
  docId: string;
  /** SRC-### records in a knowledge pack this document is the text behind. */
  serves: string[];
  title: string;
  url: string;
  /** The version that matters legally, e.g. "consolidated 18 Mar 2026". */
  versionLabel: string;
  /** ISO date (YYYY-MM-DD) of retrieval. */
  retrievedOn: string;
  /** Bytes exactly as fetched. Retained so a normalizer change is recoverable. */
  rawPath: string;
  /** The text agents actually read. */
  normalizedPath: string;
  sha256Raw: string;
  sha256Normalized: string;
  /** Which normalizer produced normalizedPath. */
  normalizerVersion: string;
  edges: CorpusEdge[];
}

export interface CorpusIndex {
  /** ISO date the index was last edited. */
  updated: string;
  documents: CorpusDocument[];
}
