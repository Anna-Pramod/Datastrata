/**
 * The status projection — what a requirement's verification state *is* right
 * now, given who signed it and what has moved since.
 *
 * The ledger records decisions and staleness describes drift; neither is a
 * status. This file is the one place the two are combined, so that every
 * surface — the CLI, the review sheet, the public checker — reads the same
 * projection instead of each deriving its own from the same parts. Derived at
 * read time and never written back: a stored status would be a fourth thing
 * that could disagree with the three it was derived from.
 *
 * **Status and staleness are two axes, and an unsigned requirement has nothing
 * for staleness to be about.** So no governing entry yields `draft` with an
 * *empty* reason set, not `['unsigned']`. `draft` already means "no one has
 * stood behind this"; a reason repeating it would be a second vocabulary for
 * one fact, and B1b-ii-b's migration — whose one sanctioned transformation is
 * `ratificationStatus: 'draft'` to `derivedStatus: 'draft', statusReasons: []`
 * — would have to normalise it away, which is how a small invention becomes a
 * permanent fixture. There is deliberately no `'unsigned'` member of
 * `StatusReason`: the type is what enforces this, not the care taken here.
 *
 * **A revocation does not consult staleness at all.** Not computed and then
 * discarded — never asked for. A revoked signature's freshness is irrelevant,
 * and reporting it would imply the withdrawal might be undone by the world
 * settling back down. It cannot: only a fresh signature restores authority.
 * The `staleness` parameter is untouched on that path, which is why the branch
 * comes before any use of it rather than after.
 *
 * **A blocked signature keeps all of its reasons, advisory ones included.**
 * The reasons travel with the status so a surface can say *why* rather than
 * merely refusing, and a person deciding what to repair needs the whole set.
 * Returning only the blocking reasons would hide the fact that the source was
 * also reissued; returning one would invent a precedence the staleness set
 * deliberately refuses to have.
 *
 * **`derivedStatus` is the entry's own `kind` when nothing blocks**, never a
 * fixed `verified`. Ratification is a second, higher assertion, and a
 * projection that flattened it would silently demote every ratified
 * requirement in the pack.
 *
 * Pure and total — every input combination returns a value, nothing throws,
 * and neither argument is mutated.
 */

import type { LedgerEntry } from './ledger';
import { blocks, type StalenessReason } from './staleness';

/** The three levels a requirement can be at, lowest first. */
export type DerivedStatus = 'draft' | 'verified' | 'ratified';

/**
 * Why the requirement reads as it does.
 *
 * `StalenessReason` widened by `'revoked'` and by nothing else. Revocation is
 * the one reason that is not drift — a person withdrew authority rather than
 * the world moving — so it belongs here and not in `StalenessReason`, and the
 * union is the seam where the two axes finally meet.
 */
export type StatusReason = StalenessReason | 'revoked';

/** A requirement's verification state, with the reasons that produced it. */
export interface RequirementStatus {
  derivedStatus: DerivedStatus;
  statusReasons: StatusReason[];
}

/**
 * Project the governing ledger entry and the staleness set onto a status.
 *
 * The four cases, in the order the branches take them:
 *
 * ```
 * governing === null          -> draft, []                  staleness not consulted
 * a revocation governs        -> draft, ['revoked']         staleness not consulted
 * a signature, nothing blocks -> entry.kind, <advisory>
 * a signature, blocked        -> draft, <the full set>
 * ```
 *
 * `staleness` is copied rather than returned, so a caller holding the array
 * cannot alter a status it has already been handed.
 */
export function deriveStatus(
  governing: LedgerEntry | null,
  staleness: StalenessReason[],
): RequirementStatus {
  if (governing === null) {
    // Nothing has been signed, so there is nothing for staleness to be about.
    return { derivedStatus: 'draft', statusReasons: [] };
  }

  if (governing.kind === 'revoked') {
    // `staleness` is deliberately not read on this path.
    return { derivedStatus: 'draft', statusReasons: ['revoked'] };
  }

  const statusReasons: StatusReason[] = [...staleness];
  return {
    derivedStatus: blocks(staleness) ? 'draft' : governing.kind,
    statusReasons,
  };
}
