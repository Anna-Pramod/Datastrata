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
import type { AuthorisedCorpus } from '../corpus/authority';
import type { SourceRegister, SourceTier } from '../monitoring/types';
import { sourceCitability } from '../monitoring/register';

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
/**
 * **Why the parameter is `AuthorisedCorpus` and not the structural shape.**
 *
 * `EntitlementSource` was deliberately open, so a caller holding a corpus by
 * some other route could still build an entitlement. That openness was the
 * bypass: a hand-written index satisfies the shape, and produced an entitled
 * closure with no authority check anywhere. Requiring a value only
 * `authoriseCorpus` returns makes the invariant structural — no document can
 * become entitled unless its `(document, source)` claims were validated first.
 *
 * The brand is a fence, not the mechanism. `as` defeats it and TypeScript is
 * erased at runtime; what holds is that every production composition root calls
 * the validator, and each root has its own tooth proving it.
 */
/**
 * A document inside a computed closure whose served source may not carry
 * normative text.
 *
 * Distinct from `RegisterIntegrityError` on purpose. That one answers "may this
 * *requirement* rest on this source?" and is raised while a pack loads. This
 * answers "may this *document*, already inside a closure, be shown to a model?"
 * and is raised at exposure. Same register, same predicate, different
 * proposition and different remedy — collapsing them into one error would hide
 * which boundary refused.
 */
export interface ClosureCitabilityFailure {
  readonly docId: string;
  /** `null` when the document names no source at all — there is none to name. */
  readonly sourceId: string | null;
  readonly reason: 'no served source' | 'no governing authority' | 'non-citable tier';
  readonly tier?: SourceTier;
}

export class ClosureCitabilityError extends Error {
  constructor(readonly failures: readonly ClosureCitabilityFailure[]) {
    super(
      `The entitled closure holds documents served by sources that may not carry normative text:\n${failures
        .map((f) => {
          if (f.reason === 'no served source') {
            return `  - ${f.docId} names no source at all, so nothing states what its text is evidence of`;
          }
          return f.reason === 'no governing authority'
            ? `  - ${f.docId} is served by ${f.sourceId}, which has no governing authority in the source register`
            : `  - ${f.docId} is served by ${f.sourceId}, whose governing authority is ${f.tier} — a non-citable tier may never become model-facing evidence`;
        })
        .join('\n')}`,
    );
    this.name = 'ClosureCitabilityError';
  }
}

/**
 * Every document in the **final** closure, not merely the entry points.
 *
 * The distinction is the whole defect. `docsForSources` reads `serves[]` to
 * choose entry points, and `computeClosure` then walks structural edges in both
 * directions without consulting `serves` again — so a document no requirement
 * could cite can still arrive by traversal. Validating entry points would leave
 * exactly that path open, which is why this runs over `closure.docIds`.
 *
 * Every `(document, sourceId)` pair is independent: one citable source on a
 * document does not rescue another. A document is a single artefact and its
 * text is shown whole, so if any source it claims may not carry normative text,
 * showing it would put that text in front of a model under a claim the register
 * does not support.
 *
 * Source *existence* is not rechecked here. `AuthorisedCorpus` is a
 * precondition of this constructor and `assertCorpusAuthority` already refuses
 * any `serves[]` id the pack does not carry, so re-deciding it would create a
 * second owner for a settled question.
 */
function assertClosureCitability(
  index: CorpusIndex,
  closure: Closure,
  register: SourceRegister,
): void {
  const byId = new Map(index.documents.map((d) => [d.docId, d]));
  const failures: ClosureCitabilityFailure[] = [];

  for (const docId of closure.docIds) {
    const document = byId.get(docId);
    // Unreachable: `computeClosure` throws `ClosureEntryNotFoundError` on an
    // entry the corpus does not hold, and only ever reaches further ids through
    // edges between held documents. It throws rather than `continue`ing anyway,
    // because `continue` here would mean "a closure member I could not resolve
    // is fine" — which is exactly the shape of the two defects this guard was
    // written to close, and the shape is worth not having.
    if (document === undefined) {
      throw new Error(
        `closure member ${docId} is not in the index it was computed from — refusing rather than skipping`,
      );
    }

    // **The quantifier is over documents, not over the ids they list.** A
    // `serves: []` document is schema-valid, and both upstream boundaries pass
    // it vacuously — origin authority loops over the same empty array, so it
    // has nothing to check either. Written as a loop alone, this guard would
    // inherit that hole: zero claims would mean zero failures, and the document
    // would be rendered to the agents having stated nothing about what its text
    // is evidence of. "No unsourced fact" makes that the one document that may
    // never become evidence, so an empty claim is a failure in its own right.
    if (document.serves.length === 0) {
      failures.push({ docId, sourceId: null, reason: 'no served source' });
      continue;
    }

    for (const sourceId of document.serves) {
      const verdict = sourceCitability(register, sourceId);
      if (verdict.citable) continue;
      failures.push(
        verdict.reason === 'no governing authority'
          ? { docId, sourceId, reason: verdict.reason }
          : { docId, sourceId, reason: verdict.reason, tier: verdict.tier },
      );
    }
  }

  if (failures.length > 0) throw new ClosureCitabilityError(failures);
}

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
    source: AuthorisedCorpus,
    register: SourceRegister,
    sourceIds: readonly string[],
    policy: ClosurePolicy = CLOSURE_POLICY_V0,
  ): EntitledClosure {
    const entryDocIds = docsForSources(source.index, [...sourceIds]);
    const closure = computeClosure(source.index, entryDocIds, policy);
    // After expansion, before the closure can be handed to anything. Origin
    // authority admitted these documents to the *corpus*; this decides which of
    // them may become *evidence*, and the two are not the same permission.
    assertClosureCitability(source.index, closure, register);
    return new EntitledClosure(source, policy, entryDocIds, closure);
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

  /**
   * Whether any document in the corpus serves this source.
   *
   * The sibling of `corpusHolds`, and here for the same reason: it is a fact
   * about `corpus/index.json`, not a judgment, so the machinery answers it
   * rather than a role. The reader is never shown the requirement's source
   * declaration — that is what its blindness means — so it cannot notice that a
   * cited source is unserved. Only this side can.
   *
   * **Deliberately independent of `docIds`.** A closure can be non-empty and
   * still be missing a cited source, because the closure is built from whichever
   * sources *did* resolve. "Some entitled evidence exists" and "every declared
   * source is backed" are two propositions, and conflating them is what let nine
   * requirements publish a Complete dossier over an evidence surface their own
   * author said was incomplete.
   */
  corpusServes(sourceId: string): boolean {
    return this.#source.index.documents.some((document) => document.serves.includes(sourceId));
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
