/**
 * The evidence surface of a verification result, enumerated once.
 *
 * Schema 1.2.0 added `challenges[].adjudicationEvidence` and immediately showed
 * what it costs for a record's authoritative consumers to each carry their own
 * idea of where evidence lives. The sign gate, the record's own consistency
 * pass and the review sheet were three hand-written enumerations of the same
 * surface; all three kept working while two of them silently ignored the new
 * array. The sign gate's miss was the serious one — an adjudication citing text
 * that is nowhere in the corpus would have signed clean, because the corpus
 * re-check simply never looked at the array §3.3 binds the verdict to.
 *
 * So this module is the one runtime enumeration, and `OWNERS` below is the one
 * list that knows how to reach each array. That list is not the problem the
 * task set out to remove; it is the *concentration* of it. A consumer list of
 * three fields plus a test list of the same three fields is duplication moved,
 * not duplication removed — which is why the completeness guard's expectation
 * is derived from `verificationResultSchema` through the accounting traversal
 * (`accountableNodes`), by node identity against `evidenceItemSchema`, and
 * never from anything written here. A fourth evidence-bearing array added to
 * the record reds that guard, by name, before any consumer can go quiet.
 *
 * **Attribution is preserved, not flattened.** Concatenating a challenge's two
 * arrays into one anonymous bag would be the cheap way to share an
 * enumeration, and it would destroy the thing the arrays exist for: `evidence`
 * is the prosecutor's answer to "there is something here worth challenging",
 * `adjudicationEvidence` is the adjudicator's answer to "here is why that
 * challenge was decided", and a refusal or a review page that cannot say which
 * of the two failed is telling a signer to repair a challenge without telling
 * them which producer's work is at fault. Every set below therefore carries its
 * own identity, and the three naming fields are three genuinely different
 * questions rather than three renderings of one:
 *
 *     recordPath  where in the record it sits    challenges[0] (C1).adjudicationEvidence
 *     label       how a refusal names it         challenge C1 adjudication
 *     heading     how a reviewer reads it        challenge C1 — why it was decided (CONFIRMED)
 *
 * The three exist because their consumers answer to different readers — a
 * repair address, a refusal line and a page heading — and collapsing them would
 * either put array indices on a review page or drop the verdict from a heading
 * a human is meant to weigh. They are produced here rather than derived by each
 * consumer from `path`, because a `switch` over paths in each consumer is the
 * per-consumer field list this module exists to abolish, one indirection along.
 *
 * **The trade-off that buys, recorded rather than left to be rediscovered.**
 * `heading` and `statement` are reviewer-facing copy — `why it was decided
 * (CONFIRMED)`, and the sentence an `OPEN_QUESTION` gets in place of a
 * resolution — and they now live in the record layer rather than in the review
 * sheet that prints them. Nothing here is impure; it is prose, not I/O. The
 * judgement is that at three consumers, one owner of the propositions beats
 * three consumers each re-deriving them, and it was taken with the cost in
 * view. **The trigger to revisit is a fourth consumer** wanting a fourth
 * phrasing: at that point this interface either grows a field per reader or the
 * per-consumer `switch` comes back, and whoever is standing there should choose
 * between those two knowingly instead of adding the fourth string by reflex.
 *
 * Pure — no filesystem, no network, no clock, and no corpus. Whether the
 * evidence is *true* is `checkEvidenceSet`'s question and needs the corpus on
 * disk; this module only says what evidence the record carries and what each
 * set is evidence *for*.
 */

import type { EvidenceItem } from '../corpus/evidence';
import type { VerificationResult } from './result';

/** One conclusion's evidence, with enough identity to name the proposition. */
export interface EvidenceSet {
  /**
   * The stable schema path of the array this set came from — the identity the
   * completeness guard compares against the schema, and the only field here
   * that is the same for every set drawn from one array.
   */
  readonly path: string;
  /** Position of the owning entry in its array. */
  readonly index: number;
  /** Id of the owning entry: a reading element's or a challenge's. */
  readonly ownerId: string;
  /** Where this set sits in the record: `challenges[0] (C1).adjudicationEvidence`. */
  readonly recordPath: string;
  /** How a refusal names this set: `challenge C1 adjudication`. */
  readonly label: string;
  /** How a review page heads it: `challenge C1 — why it was decided (CONFIRMED)`. */
  readonly heading: string;
  /** The sentence this set stands behind, as a reader should see it. */
  readonly statement: string;
  /** The evidence itself. */
  readonly items: readonly EvidenceItem[];
}

type ReadingElement = VerificationResult['reading']['elements'][number];
type Challenge = VerificationResult['challenges'][number];

/** One evidence-bearing array of one kind of owner. */
interface EvidenceArraySpec<E> {
  /** The field name, spelled as the schema spells it. */
  readonly field: string;
  readonly items: (entry: E) => readonly EvidenceItem[];
  /** Refusal name, given the owner already named (`challenge C1`). */
  readonly label: (subject: string, entry: E) => string;
  readonly heading: (subject: string, entry: E) => string;
  readonly statement: (entry: E) => string;
}

/** A kind of owner, and every evidence array it carries. */
interface EvidenceOwnerSpec<E> {
  /** The owning container's schema path: `challenges[]`. */
  readonly container: string;
  readonly entries: (result: VerificationResult) => readonly E[];
  readonly id: (entry: E) => string;
  /** The owner, named for a human: `challenge C1`. */
  readonly subject: (entry: E) => string;
  readonly arrays: ReadonlyArray<EvidenceArraySpec<E>>;
}

/**
 * One owner spec with its element type erased, so the table below can hold
 * owners of different shapes without a consumer ever having to know which is
 * which.
 */
interface EvidenceSurface {
  readonly paths: readonly string[];
  readonly setsOf: (result: VerificationResult) => EvidenceSet[];
}

function surface<E>(spec: EvidenceOwnerSpec<E>): EvidenceSurface {
  const pathOf = (array: EvidenceArraySpec<E>): string => `${spec.container}.${array.field}`;
  return {
    paths: spec.arrays.map(pathOf),
    setsOf: (result) =>
      spec.entries(result).flatMap((entry, index) => {
        const id = spec.id(entry);
        const subject = spec.subject(entry);
        // `challenges[]` becomes `challenges[0] (C1)`, so a consistency message
        // addresses one entry rather than the container. The array's own field
        // name is appended, which is what tells a challenge's two arrays apart
        // in every message the record produces.
        const entryPath = `${spec.container.slice(0, -2)}[${index}] (${id})`;
        return spec.arrays.map((array) => ({
          path: pathOf(array),
          index,
          ownerId: id,
          recordPath: `${entryPath}.${array.field}`,
          label: array.label(subject, entry),
          heading: array.heading(subject, entry),
          statement: array.statement(entry),
          items: array.items(entry),
        }));
      }),
  };
}

/** An adjudication states its resolution; an open question has none to state. */
function adjudicationStatement(challenge: Challenge): string {
  return challenge.resolution !== undefined && challenge.resolution.trim().length > 0
    ? challenge.resolution
    : 'not adjudicated — the evidence below is what establishes that this record cannot settle the challenge';
}

/**
 * Every evidence-bearing array in the record, and how to reach it.
 *
 * Owner-major, and the order is load-bearing: a challenge's two arrays are
 * emitted together, immediately after that challenge's own index, so a
 * consumer reporting problems in enumeration order reports them the way a
 * signer reads the record. Emitting all prosecutor evidence and then all
 * adjudication evidence would separate the two halves of one challenge by the
 * whole of the rest of the dossier.
 */
const OWNERS: readonly EvidenceSurface[] = [
  surface<ReadingElement>({
    container: 'reading.elements[]',
    entries: (result) => result.reading.elements,
    id: (element) => element.id,
    subject: (element) => `reading element ${element.id}`,
    arrays: [
      {
        field: 'evidence',
        items: (element) => element.evidence,
        // A reading element carries one evidence array, so its own name is the
        // whole of the address: there is no second proposition to tell it from.
        label: (subject) => subject,
        heading: (subject) => subject,
        statement: (element) => element.statement,
      },
    ],
  }),
  surface<Challenge>({
    container: 'challenges[]',
    entries: (result) => result.challenges,
    id: (challenge) => challenge.id,
    subject: (challenge) => `challenge ${challenge.id}`,
    arrays: [
      {
        field: 'evidence',
        items: (challenge) => challenge.evidence,
        label: (subject) => subject,
        heading: (subject) => `${subject} — why it was raised`,
        statement: (challenge) => challenge.statement,
      },
      {
        field: 'adjudicationEvidence',
        items: (challenge) => challenge.adjudicationEvidence,
        label: (subject) => `${subject} adjudication`,
        heading: (subject, challenge) => `${subject} — why it was decided (${challenge.verdict})`,
        statement: adjudicationStatement,
      },
    ],
  }),
];

/**
 * Every evidence set the record carries, in reading-then-challenges order.
 *
 * The single runtime enumeration. A consumer that must consider *all* the
 * evidence — the record's consistency pass, the sign gate's corpus re-check,
 * the review sheet — iterates this and nothing else. Consumers that legitimately
 * care about one array are not obliged to use it: total coverage is a property
 * of the authoritative consumers, not a rule about every reader of a
 * `VerificationResult`.
 */
export function evidenceSetsOf(result: VerificationResult): EvidenceSet[] {
  return OWNERS.flatMap((owner) => owner.setsOf(result));
}

/**
 * The schema paths this module claims to enumerate, sorted.
 *
 * Read off the same specs `evidenceSetsOf` evaluates, so it cannot claim a path
 * no accessor reaches. It exists for the completeness guard to compare against
 * the schema — and the comparison is only worth anything because the other side
 * of it is derived from `verificationResultSchema`, never from here.
 */
export function enumeratedEvidencePaths(): string[] {
  return [...new Set(OWNERS.flatMap((owner) => owner.paths))].sort();
}
