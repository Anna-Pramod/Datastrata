/**
 * `EntitledClosure` — the one object every role's document access goes through.
 *
 * §3.0 states the invariant this exists to make mechanical:
 *
 *     Everything the agents were entitled to know is exactly
 *     what the signature pins.
 *
 * Reader, prosecutors and adjudicator may read the full text of the entitled
 * closure and nothing outside it. If a prosecutor could open a document outside
 * it, its challenge might rest on evidence the signature never pins, and the
 * signature would then attest to a reading produced from a surface it does not
 * describe.
 *
 * **A capability object, not a rule three roles are asked to follow.** The
 * distinction is the whole design. Handing each role a `LoadedCorpus` and a
 * list of permitted ids makes the boundary a convention that three separate
 * agents' prompts have to restate and that nothing enforces; a role holding
 * only this object cannot express reading outside the closure, because there is
 * no method that would do it. §3.0 binds all three roles at once, so one object
 * binds all three.
 *
 * **Traversal is not reimplemented here.** `docsForSources` and
 * `computeClosure` in `src/corpus/closure.ts` decide what the closure is and
 * what its hash covers; this wraps them. A second traversal would be a second
 * answer to "what was this signature entitled to", and the two would differ in
 * whatever the author of the day forgot.
 *
 * **An entry document the corpus does not hold is not swallowed.**
 * `computeClosure` throws `ClosureEntryNotFoundError`, and that throw is
 * deliberately allowed to escape rather than being caught and recorded as a
 * gap. The distinction is between a run that *halted* and a run that never
 * began: a gap is a recorded verification outcome, carried in a dossier whose
 * `corpusClosureSha256` pins the surface the run was entitled to — and here
 * there is no such surface, because the closure could not be built. Converting
 * it would mean writing a dossier that pins an entitlement over a document
 * nobody has, which is the exact failure `ClosureEntryNotFoundError` exists to
 * prevent one document at a time. It is answered by ingesting the document
 * (§4.2) and re-running, never by closing over it anyway.
 *
 * In practice it cannot arise through this class at all: `forSources` seeds
 * `computeClosure` only with ids `docsForSources` found in the index. The throw
 * guards the direct callers of `computeClosure`, which pass entry ids of their
 * own.
 *
 * Reading text is delegated to the source it is handed, so this module opens no
 * file itself; `LoadedCorpus` satisfies the accessor structurally.
 */

import {
  CLOSURE_POLICY_V0,
  computeClosure,
  docsForSources,
  type Closure,
  type ClosurePolicy,
} from '../corpus/closure';
import type { CorpusDocument, CorpusIndex } from '../corpus/types';

/**
 * The corpus reduced to what entitlement needs of it.
 *
 * Structural rather than `LoadedCorpus` for the same reason
 * `CurrentCorpusSource` is: nothing here should depend on the module that opens
 * files, and a caller holding a corpus by some other route must still be able
 * to build an entitlement over it.
 */
export interface EntitlementSource {
  index: CorpusIndex;
  document(docId: string): CorpusDocument;
  /** The text agents read. */
  normalizedText(docId: string): string;
}

/** A document as a role sees it: its identity, its pins and its words. */
export interface EntitledDocument {
  docId: string;
  title: string;
  versionLabel: string;
  sha256Raw: string;
  sha256Normalized: string;
  normalizerVersion: string;
  text: string;
}

/**
 * A role reached for a document outside its entitlement.
 *
 * Loud, named, and carrying both the document and the closure hash, because
 * this is the trust boundary: the correct response is to halt and emit
 * `corpus_gap` or `closure_gap`, have a human ingest the document or add the
 * relationship, recompute the closure and **restart the run** — a reading
 * produced under a narrower entitlement cannot be topped up with the new
 * document.
 */
export class OutsideEntitlementError extends Error {
  constructor(
    readonly docId: string,
    readonly closureSha256: string,
  ) {
    super(
      `${docId} is outside the entitled closure ${closureSha256}: halt and emit corpus_gap or closure_gap rather than reading it — a signature may only pin a reading produced from the surface it describes`,
    );
    this.name = 'OutsideEntitlementError';
  }
}

/**
 * The entitled closure as a role sees it: every document, in closure order.
 *
 * One function, here, because this is *transcript content*. Reader, prosecutors
 * and adjudicator are all shown the same surface, and two renderers that drifted
 * would silently change what one role sees while both still looked right — a
 * replayed run would then disagree with the live one it was recorded from, and
 * the diff would be in a heading nobody was comparing. It renders through
 * `documents()`, so it can only ever emit what the closure entitles.
 */
export function renderEntitledClosure(closure: EntitledClosure): string {
  return closure
    .documents()
    .map(
      (document) =>
        `## ${document.docId} — ${document.title} (${document.versionLabel})\n\n${document.text}`,
    )
    .join('\n\n');
}

/**
 * The capability. Construct it once per run; hand the same object to every role.
 */
export class EntitledClosure {
  /**
   * The corpus, and the traversal's answer, as **genuine** private fields.
   *
   * `#` rather than TypeScript's `private`, and the difference is the whole
   * point of the class. `private` is erased at compile time, so
   * `(closure as any).source.normalizedText(docId)` hands back the text of a
   * document the closure excludes — a capability boundary that evaporates under
   * one cast is weaker than "everything the agents were entitled to know is
   * exactly what the signature pins" claims. `#` is enforced by the runtime: the
   * property is not reachable by any name, cast, `Object.keys` or index access
   * from outside this class body, so `document()` really is the only route to
   * text and `OutsideEntitlementError` really is unavoidable.
   */
  readonly #source: EntitlementSource;
  readonly #closure: Closure;

  private constructor(
    source: EntitlementSource,
    readonly policy: ClosurePolicy,
    readonly entryDocIds: readonly string[],
    closure: Closure,
  ) {
    this.#source = source;
    this.#closure = closure;
  }

  /**
   * Builds the entitlement a requirement's `sources[]` opens onto.
   *
   * `sources[]` is an entry point, not a fence at the closure's edge (§3.1): the
   * documents it names seed the traversal, and the traversal decides the rest.
   */
  static forSources(
    source: EntitlementSource,
    sourceIds: readonly string[],
    policy: ClosurePolicy = CLOSURE_POLICY_V0,
  ): EntitledClosure {
    const entryDocIds = docsForSources(source.index, [...sourceIds]);
    return new EntitledClosure(
      source,
      policy,
      entryDocIds,
      computeClosure(source.index, entryDocIds, policy),
    );
  }

  /** Sorted. Every document a role may open. */
  get docIds(): readonly string[] {
    return this.#closure.docIds;
  }

  /** Sorted. Every edge with both endpoints inside. */
  get edgeIds(): readonly string[] {
    return this.#closure.edgeIds;
  }

  /** What a signature pins, and what `producePins` is handed. */
  get sha256(): string {
    return this.#closure.sha256;
  }

  /** The shape `producePins` and `currentStateOf` take. */
  get pinInput(): { sha256: string; docIds: readonly string[] } {
    return { sha256: this.#closure.sha256, docIds: this.#closure.docIds };
  }

  entitled(docId: string): boolean {
    return this.#closure.docIds.includes(docId);
  }

  /**
   * Whether the corpus holds this document at all — and nothing more.
   *
   * The one discriminator between the two refusals: a document the corpus does
   * not hold is a `corpus_gap`, answered by ingesting it; a document it holds
   * that traversal did not reach is a `closure_gap`, answered by recording the
   * relationship or widening the policy. Without it the two kinds collapse into
   * one, and §4.2's two populations become uncountable.
   *
   * **Not a corpus handle.** It answers one boolean and hands out no document,
   * no text, no edge and no index, so a role holding this object still cannot
   * express reading outside the closure — the property the whole class exists
   * for. `document()` remains the only route to text, and it still refuses.
   */
  corpusHolds(docId: string): boolean {
    return this.#source.index.documents.some((document) => document.docId === docId);
  }

  /** The document, or a refusal. There is no unchecked accessor by design. */
  document(docId: string): EntitledDocument {
    if (!this.entitled(docId)) throw new OutsideEntitlementError(docId, this.#closure.sha256);
    const document = this.#source.document(docId);
    return {
      docId,
      title: document.title,
      versionLabel: document.versionLabel,
      sha256Raw: document.sha256Raw,
      sha256Normalized: document.sha256Normalized,
      normalizerVersion: document.normalizerVersion,
      text: this.#source.normalizedText(docId),
    };
  }

  /** The words behind one document. */
  text(docId: string): string {
    return this.document(docId).text;
  }

  /** Everything a role may read, in closure order. */
  documents(): EntitledDocument[] {
    return this.#closure.docIds.map((docId) => this.document(docId));
  }
}
