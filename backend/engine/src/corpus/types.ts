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
import type { OperativeRange } from './ranges';

export type { OperativeRange } from './ranges';
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

/**
 * What kind of artefact this is — a property of the artefact, orthogonal to the
 * standing of the instrument it serves. An official consolidation of law in
 * force, an authentic Official Journal publication, and an official text
 * published ahead of the Journal are three different things a reader must be
 * told apart; none of them says whether the law is in force.
 */
export type ArtefactAuthenticity =
  | 'authentic_publication'
  | 'official_consolidation'
  | 'official_pre_publication_text';

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
  /**
   * The `#id` region extraction was scoped to, or `null` when extraction ran
   * over the whole raw document. Not part of the closure hash: it is how the
   * text was derived, and its effect is already fully captured by
   * sha256Normalized.
   */
  contentSelector: string | null;
  artefactAuthenticity: ArtefactAuthenticity;
  /**
   * Headings of the sections that are **not** operative provision, in the
   * order they appear in the artefact. Required, `[]` when none are declared:
   * one intended list has exactly one expression, so the closure hash cannot
   * carry three spellings of "none". Says nothing about sections not named.
   */
  nonOperativeSections: string[];
  /**
   * The operative-provision ranges a signature may locate its support inside,
   * authored against this document's stored normalized text (`ranges.ts`).
   * Optional and absent by default, and absence means **none**: unlike
   * `nonOperativeSections` this field never enters a closure hash — it is not
   * shown to any role — so three spellings of "none" cannot hash three ways,
   * and an undeclared document simply cannot supply support. A declaration is
   * added only where a signature needs it, with its justification.
   */
  operativeRanges?: OperativeRange[];
  /**
   * Other published forms of this document's identity a role might use to
   * name it — a consolidated CELEX code, an ELI — recorded so that a reference
   * in one of them resolves to this document rather than reading as a document
   * the corpus does not hold (`pipeline/document-reference.ts`). Optional and
   * absent by default; unique across the index and never equal to a document
   * id (`verifyCorpusIntegrity`). Not part of any closure hash: it is how the
   * document may be *named*, and says nothing about what it *is*.
   */
  aliases?: string[];
  edges: CorpusEdge[];
}


export interface CorpusIndex {
  /** ISO date the index was last edited. */
  updated: string;
  documents: CorpusDocument[];
}
