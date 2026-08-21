/**
 * The status projection — what a requirement's verification state *is* right
 * now, given who signed it, whether anybody checked, and what has moved since.
 *
 * The ledger records decisions and staleness describes drift; neither is a
 * status. This file is the one place they are combined, so that every surface —
 * the CLI, the review sheet, the public checker — reads the same projection
 * instead of each deriving its own from the same parts. Derived at read time
 * and never written back: a stored status would be a fourth thing that could
 * disagree with the three it was derived from.
 *
 * **Why this module takes one argument and not two.** It used to be
 * `deriveStatus(governing, staleness)`, and the loader called it as
 * `deriveStatus(governing, [])` because it had no corpus, no rendered condition
 * and no pinned result to compute staleness from. The empty array is a valid,
 * meaningful value — *"I checked and nothing is stale"* — and it was being used
 * where *"I did not check"* was true. So the moment the ledger held its first
 * signature, a signature that had since gone stale would have read `verified`
 * on the public site. A contract saying "callers should supply real staleness"
 * leaves that same call compiling, which is why this is a type change and not a
 * rule:
 *
 *     Absence of a freshness evaluation is never evidence of freshness.
 *
 * `StatusInput` is what removes the ability to say it. There is no shape in
 * which a caller can offer a signature without answering "was its freshness
 * checked?", and no shape in which an unsigned or revoked requirement can be
 * offered an answer to a question it does not raise.
 *
 * **The discriminant is on the outside, and that is required rather than
 * stylistic.** An earlier draft discriminated on a nested `governing` property.
 * TypeScript will not narrow an outer union from a nested discriminant check —
 *
 *     error TS2339: Property 'freshness' does not exist on type
 *       '{ governing: RevocationEntry } | { governing: SigningEntry; … }'
 *
 * — so that shape needs a cast or a hand-written type guard, and writing one
 * returns the burden to discipline, which is the thing being removed.
 *
 * **Status and staleness are two axes, and an unsigned requirement has nothing
 * for staleness to be about.** So no governing entry yields `draft` with an
 * *empty* reason set, not `['unsigned']` and not `['freshness_unchecked']`.
 * `draft` already means "no one has stood behind this"; a reason repeating it
 * would be a second vocabulary for one fact, and B1b-ii-b's migration — whose
 * one sanctioned transformation is `ratificationStatus: 'draft'` to
 * `derivedStatus: 'draft', statusReasons: []` — would have to normalise it
 * away, which is how a small invention becomes a permanent fixture. There is
 * deliberately no `'unsigned'` member of `StatusReason`: the type is what
 * enforces this, not the care taken here.
 *
 * **A revocation does not consult freshness at all.** Not computed and then
 * discarded — the variant has no field to put it in. A revoked signature's
 * freshness is irrelevant, and reporting it would imply the withdrawal might be
 * undone by the world settling back down. It cannot: only a fresh signature
 * restores authority.
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
 * Pure and total — every representable input returns a value, and nothing given
 * to it is mutated.
 */

import type { LedgerEntry, RevocationEntry, SigningEntry } from './ledger';
import { blocks, type StalenessReason } from './staleness';

/** The three levels a requirement can be at, lowest first. */
export type DerivedStatus = 'draft' | 'verified' | 'ratified';

/**
 * Why the requirement reads as it does.
 *
 * `StalenessReason` widened by two reasons that are not drift, and by nothing
 * else. `revoked` is a person withdrawing authority; `freshness_unchecked` is
 * our own ignorance about a signature nobody evaluated. Neither describes the
 * world moving, so neither belongs in `StalenessReason` — and keeping them out
 * is what makes it impossible for `deriveStaleness` to return either.
 */
export type StatusReason = StalenessReason | 'revoked' | 'freshness_unchecked';

/** A requirement's verification state, with the reasons that produced it. */
export interface RequirementStatus {
  derivedStatus: DerivedStatus;
  statusReasons: StatusReason[];
}

/**
 * An answer to "was this signature's freshness evaluated, and what was found?"
 *
 * `checked: true` is a literal rather than a boolean field so that the two
 * cases are separate types. A resolver returns *this* type and never
 * `FreshnessAssessment`, which gives `{ checked: false }` exactly one
 * provenance — a caller deliberately did not invoke a resolver — and makes it
 * impossible for any resolver outcome to produce it.
 */
export interface CheckedFreshness {
  checked: true;
  reasons: StalenessReason[];
}

/**
 * What a caller knows about a signature's freshness, including the case where
 * it knows nothing. `{ checked: false }` is the caller's admission, never a
 * resolver's result.
 */
export type FreshnessAssessment = { checked: false } | CheckedFreshness;

/**
 * The authority state a status is projected from, with freshness attached to
 * the one variant it can be about.
 *
 * The three members are not three shapes of the same record: `unsigned` has no
 * entry because there is none, `revoked` has no freshness because a withdrawal
 * has none to have, and `signed` has both because a signature without an answer
 * about its freshness is precisely the state this module exists to refuse.
 */
export type StatusInput =
  | { kind: 'unsigned' }
  | { kind: 'revoked'; entry: RevocationEntry }
  | { kind: 'signed'; entry: SigningEntry; freshness: FreshnessAssessment };

/**
 * Narrow a governing entry into a `StatusInput`.
 *
 * Three overloads, and the friction between them is the feature. A caller
 * holding `governingEntry()`'s `LedgerEntry | null` must branch before calling,
 * so the only branch in which the compiler asks *"was freshness checked?"* is
 * the branch where the question has meaning:
 *
 * ```
 * toStatusInput(unnarrowed)      error — the caller must branch
 * toStatusInput(signed)          error — must say whether freshness was checked
 * toStatusInput(null, fresh)     error — meaningless for unsigned authority
 * toStatusInput(revoked, fresh)  error — meaningless for a revocation
 * ```
 *
 * There is deliberately no `(governing: LedgerEntry | null, freshness?: …)`
 * overload. Accepting an unnarrowed union with optional freshness would rebuild
 * `deriveStatus(governing, [])` one layer up, where it would be harder to see.
 * The implementation signature below is not an overload and is not callable —
 * TypeScript exposes only the three above.
 */
export function toStatusInput(governing: null): StatusInput;
export function toStatusInput(governing: RevocationEntry): StatusInput;
export function toStatusInput(governing: SigningEntry, freshness: FreshnessAssessment): StatusInput;
export function toStatusInput(
  governing: LedgerEntry | null,
  freshness?: FreshnessAssessment,
): StatusInput {
  if (governing === null) return { kind: 'unsigned' };
  if (governing.kind === 'revoked') return { kind: 'revoked', entry: governing };
  // The assessment is carried through unexamined: it is the whole of what the
  // caller learned, and re-deriving any part of it here would create a second,
  // quietly different opinion about the same question.
  //
  // `freshness` is absent only on a call the compiler already rejected, and the
  // fallback is fail-closed rather than a cast: JavaScript reached through a
  // refused overload must still not be able to produce `verified`.
  return { kind: 'signed', entry: governing, freshness: freshness ?? { checked: false } };
}

/**
 * Project the authority state onto a status.
 *
 * The five cases, in the order the branches take them:
 *
 * ```
 * nothing signed              -> draft, []
 * a revocation governs        -> draft, ['revoked']
 * a signature, unchecked      -> draft, ['freshness_unchecked']
 * a signature, nothing blocks -> entry.kind, <advisory>
 * a signature, blocked        -> draft, <the full set>
 * ```
 *
 * The switch is exhaustive over `kind`, with an `assertNever` terminal branch,
 * so a later `{ kind: 'suspended' }` fails the build here rather than silently
 * acquiring one of the behaviours above. Making authority-state expansion
 * compile-time visible is the point of the discriminant, not merely easier
 * narrowing.
 *
 * The reason set is copied rather than returned, so a caller holding the array
 * cannot alter a status it has already been handed.
 */
export function deriveStatus(input: StatusInput): RequirementStatus {
  switch (input.kind) {
    case 'unsigned':
      // Nothing has been signed, so there is nothing for freshness to be about.
      return { derivedStatus: 'draft', statusReasons: [] };

    case 'revoked':
      return { derivedStatus: 'draft', statusReasons: ['revoked'] };

    case 'signed': {
      if (!input.freshness.checked) {
        // A signature nobody evaluated. `draft` with no reason would say
        // "nobody signed", which is false and is the more comfortable lie.
        return { derivedStatus: 'draft', statusReasons: ['freshness_unchecked'] };
      }
      const { reasons } = input.freshness;
      return {
        derivedStatus: blocks(reasons) ? 'draft' : input.entry.kind,
        statusReasons: [...reasons],
      };
    }

    default:
      return assertNever(input);
  }
}

/**
 * The terminal branch of an exhaustive switch.
 *
 * Unreachable while `StatusInput` has three members: the value is the point,
 * not the throw. A new member makes the argument no longer assignable to
 * `never`, and the build fails at the call above.
 */
function assertNever(input: never): never {
  throw new Error(`unhandled status input: ${JSON.stringify(input)}`);
}
