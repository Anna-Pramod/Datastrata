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
 * # Why a function, while the field is still authored
 *
 * Today this returns `requirement.sources` — the authored array — so the
 * derivation is the identity and nothing about the system's behaviour changes
 * by introducing it. **That is transitional and it is stated here rather than
 * left to be inferred.** The D1(a) design (`2026-08-24-d1a-corpus-provenance-design.md`
 * §5.2) settles that `provenance` becomes the single authored declaration and
 * `sources` stops being authored at all, derived instead as
 * `provenance[*].sourceId`. Task 4 of the implementation plan replaces the body
 * below; nothing else has to move, because by then every consumer already asks
 * this question here.
 *
 * Extracting the seam first is deliberate. The alternative — changing the
 * schema and thirteen call sites in one commit — would mean auditing every
 * consumer under a shape that was moving while it was being audited, and a
 * consumer quietly left reading the old field would be invisible until it
 * produced a wrong closure.
 *
 * # Why it returns a copy
 *
 * The authored array is pack state, and a caller that sorted or spliced the
 * value in place would be editing the requirement every later caller reads.
 * `review-sheet.ts` already spread it defensively for exactly that reason; this
 * makes the guarantee the derivation's rather than each caller's to remember.
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
 * the corpus serves none of them. **Nothing on the run path pins that through
 * this function today** — `pipeline-reader.test.ts` pins gap ordering by
 * handing `unservedSourceGaps` a literal array, so a body that sorted would
 * leave it green. What such a body would move is `requirementInputSha256`, over
 * every requirement whose authored `sources` are not already in sorted order.
 * That is a real red, but it names a hash rather than the ordering, so
 * `knowledge-provenance.test.ts` asserts the property here directly.
 */
export function sourceIdsOf(requirement: AuthoredRequirement): string[] {
  return [...requirement.sources];
}
