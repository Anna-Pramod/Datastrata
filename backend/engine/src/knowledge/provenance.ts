/**
 * The one derivation of which sources a requirement's determination rests on.
 *
 * Every production consumer that reads them *off a requirement* reads them
 * here: the reader boundary's source-completeness check, the four places that
 * open an entitled closure (`cli/run.ts`, `cli/sign.ts`, `cli/review-sheet.ts`
 * and the public site's freshness resolver), pack integrity, the engine's
 * determination projection and the verification-input hash. That single point
 * is the whole purpose of this module.
 *
 * Surfaces that read a *projection* of those ids — `Determination.sources`, the
 * review sheet's row, the public check response — are not exceptions to that
 * and do not call this function: each is fed by one of the consumers above, and
 * the design permits a compatibility surface to expose the derived projection
 * (§5.2) precisely because it is derived rather than separately authored.
 *
 * # Why the derivation exists at all
 *
 * `provenance` is the authored declaration; `sources` is a projection of it the
 * loader attaches, exactly as it attaches `derivedStatus`. Two *authored*
 * declarations of one fact would be two authorities with nothing to say which
 * wins, so there is one, and this is the only place it is unpacked.
 *
 * The seam was extracted a commit before the schema moved (Task 1), so that the
 * migration changed one function body rather than thirteen call sites under a
 * shape that was moving while it was being audited.
 *
 * # Nothing authored escapes
 *
 * `map` builds a fresh array, so no caller can sort or splice its way into pack
 * state. `review-sheet.ts` used to spread defensively for that reason; the
 * guarantee is the derivation's now rather than each caller's to remember.
 *
 * # What this is not
 *
 * Not the *entitlement*. These ids are entry points into a closure the
 * traversal decides (`corpus/closure.ts`), and B2's amendment is explicit that
 * a non-empty closure does not prove the declared source surface is complete.
 * Not the change-watch `sources` field either: `changeWatchItemSchema.sources`
 * belongs to a watch item rather than a requirement, is authored, and is
 * deliberately untouched by this module.
 *
 * Pure. No filesystem, no clock, no pack loading.
 */

import type { AuthoredRequirement } from '../types';

/**
 * The source ids a requirement cites, in authored order.
 *
 * Order is significant and preserved: it is the order gaps are reported in when
 * the corpus serves none of them, and it is `provenance`'s authored order —
 * the same order the author wrote the instruments down in.
 *
 * **Duplicate-free by the schema, not by this function.** `provenance` rejects
 * a repeated `sourceId` at load, so no de-duplication happens here; doing it
 * here would hide an authoring error rather than refuse it.
 */
export function sourceIdsOf(requirement: AuthoredRequirement): string[] {
  return requirement.provenance.map((entry) => entry.sourceId);
}

/**
 * Every locator a requirement carries, flattened, in authored order.
 *
 * **Source identities are dropped here deliberately.** This is what the blind
 * reader is shown: an address is what a reader needs to find the text, and
 * *"the pack author says SRC-002 proves this"* is an answer rather than an
 * address. `sources[]` was always kept out of `ReaderInput`; structuring
 * provenance must not smuggle it back in through the locator field.
 */
export function locatorTextsOf(requirement: AuthoredRequirement): string[] {
  return requirement.provenance.flatMap((entry) =>
    entry.locators.map((locator) =>
      locator.kind === 'whole_document' ? WHOLE_DOCUMENT_LOCATOR : locator.text,
    ),
  );
}

/** How a whole-document locator reads to a role. */
export const WHOLE_DOCUMENT_LOCATOR = 'the instrument as a whole';
