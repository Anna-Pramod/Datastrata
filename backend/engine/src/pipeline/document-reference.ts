/**
 * How a document a role *named* is matched to a document the corpus *holds*.
 *
 * Why this file exists: the first genuine S-002 capture halted on a prosecutor
 * gap naming `CELEX-32022L2464`. The corpus held that directive as
 * `DOC-32022L2464`, but `corpusHolds` compared the two strings byte for byte,
 * so the engine filed a `corpus_gap` and told a human to ingest a document the
 * corpus already had. The role's naming was recognisable to a person; the
 * engine had no way to recognise it. A prompt could ask roles to use the
 * `DOC-` form, and may, but a model's compliance is not a guarantee, and §4.2's
 * two populations are only countable if the engine itself decides what a
 * reference means — out of what the corpus author declared, never by guessing.
 *
 * **Two rules, both declared metadata, neither a guess.**
 *
 *   1. The reference *is* a document id. Exact, case-sensitive; unique by
 *      `verifyCorpusIntegrity`, so never ambiguous, and it outranks rule 2.
 *   2. The reference is a declared `aliases[]` entry of a document — another
 *      published form of its identity the corpus author chose to record
 *      (`CELEX-32022L2464`, a consolidated CELEX code, an ELI). Metadata,
 *      validated like the rest of the index: never a document id, never
 *      declared by two documents.
 *
 * **What is deliberately not here: stripping a scheme prefix.** A rule that
 * read `<anything>-32022L2464` as `DOC-32022L2464` would resolve
 * `UNRELATED-32022L2464` too, asserting an identity nobody declared. Every
 * scheme a role might use is a relationship between a name and a document,
 * and relationships in this corpus are recorded (`edges[]`, `serves[]`,
 * `aliases[]`), not inferred. So a reference under a scheme the index does
 * not declare stays **unknown**, and is reported under the role's own words.
 *
 * One matching document is a resolution. Several are **ambiguous** — reachable
 * only from an index whose integrity check did not run, since the check
 * refuses shared aliases — and ambiguity is reported, never broken by
 * preference. The outcome carries the reference exactly as given, so the
 * record can preserve what the role said beside what the engine made of it.
 *
 * **Resolution grants nothing.** This module sees ids and aliases, never text,
 * and `EntitledClosure.document()` keeps comparing exact ids. A reference that
 * resolves to an entitled document does not open it; it tells the gap seam
 * that calling it a gap would be false.
 *
 * Pure: no filesystem, no network, no clock.
 */

import type { CorpusDocument } from '../corpus/types';

export type DocumentReferenceResolution =
  | { outcome: 'resolved'; reference: string; docId: string; matchedBy: 'docId' | 'alias' }
  | { outcome: 'ambiguous'; reference: string; candidates: readonly string[] }
  | { outcome: 'unknown'; reference: string };

/** What the resolver reads of a document: its identity, never its text. */
export type ReferenceableDocument = Pick<CorpusDocument, 'docId' | 'aliases'>;

export function resolveDocumentReference(
  documents: readonly ReferenceableDocument[],
  rawReference: string,
): DocumentReferenceResolution {
  const reference = rawReference.trim();
  if (reference.length === 0) return { outcome: 'unknown', reference: rawReference };

  for (const document of documents) {
    if (document.docId === reference) {
      return { outcome: 'resolved', reference: rawReference, docId: document.docId, matchedBy: 'docId' };
    }
  }

  const candidates = [
    ...new Set(documents.filter((document) => (document.aliases ?? []).includes(reference)).map((d) => d.docId)),
  ].sort();
  if (candidates.length === 0) return { outcome: 'unknown', reference: rawReference };
  if (candidates.length > 1) return { outcome: 'ambiguous', reference: rawReference, candidates };
  return { outcome: 'resolved', reference: rawReference, docId: candidates[0] as string, matchedBy: 'alias' };
}

/**
 * A reference two or more held documents declare as their alias.
 *
 * Not a gap of either kind: a `corpus_gap` would assert the document is absent
 * when at least one candidate is held, and a `closure_gap` needs one document
 * to name. Breaking the tie by any preference would let the engine decide which
 * document the role meant, which is the role's statement to make. So it is a
 * defect in the role's output, named with the candidates so the author of the
 * reference can see exactly what it could have meant.
 */
export class AmbiguousDocumentReferenceError extends Error {
  constructor(
    readonly reference: string,
    readonly candidates: readonly string[],
  ) {
    super(
      `the document reference ${reference} is ambiguous: it could name ${candidates.join(' or ')}; name the document by its id`,
    );
    this.name = 'AmbiguousDocumentReferenceError';
  }
}
