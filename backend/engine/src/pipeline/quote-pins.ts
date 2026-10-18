/**
 * The quote-pin rule at the role seam — before the next role launches.
 *
 * Why this exists: the second genuine S-002 capture (2026-10-18, r2) ran the
 * reader, seven prosecutors and the adjudicator to completion, and was then
 * refused at assembly because every one of its 120 quotes carried
 * `sha256Normalized` as the empty string. The rule that refused it —
 * `assertResultConsistency`'s "a quote pins the hash `corpus[]` pins for its
 * docId" — is correct and stays. What was missing is the same rule *where the
 * quote was produced*: a reader that returns a quote whose hash is not its
 * document's fence hash, or whose `docId` names a document it was never
 * handed, has returned a defective output, and the defect should be named
 * against the reader after one launch, not against the record after nine.
 *
 * **Two facts per quote, both decided against the closure the role was
 * handed.** The `docId` must be a document of the entitled closure — the
 * capability object every role reads through, so "entitled" here means exactly
 * what it means for `document()`. The `sha256Normalized` must equal the hash
 * that document's fence line carried, which is the closure's own
 * `document(docId).sha256Normalized`; the role was told to copy it from the
 * `<<<BEGIN DOCUMENT <docId> sha256Normalized=<hash>>>>` line, and a copy
 * either matches or it does not. A well-formed hash that is some *other*
 * document's pin is a mismatch like any other, reported with both values.
 *
 * **Never filled, never corrected.** The hash is the model's claim about which
 * text it quoted. Overwriting a wrong one with the closure's pin would make
 * every quote agree with the corpus by construction and turn the pin check at
 * assembly into a tautology — the output is refused, and what the model
 * returned stays in the transcript for a human to read.
 *
 * **One enumeration of a quote's positions.** `quotesOf` is `result.ts`'s, so
 * a hop inside an `amendment_chain` and either end of a `cross_reference` are
 * checked here under the same paths the record boundary would report them
 * at. The format of the hash itself (64 lowercase hex) is the schema's job
 * (`corpus/evidence.ts`) and runs before this does; this checks truth, not
 * shape.
 *
 * Pure: handed values, reads nothing, keeps no state.
 */

import type { EvidenceItem } from '../corpus/evidence';
import { quotesOf } from '../verification/result';
import type { EntitledDocument } from './entitlement';
import type { AdjudicatorOutput, ProsecutorOutput, ReaderOutput } from './role-outputs';
import { RoleOutputError, type RoleName } from './roles';

/**
 * What the check needs of a closure, and no more: which documents it holds and
 * each one's pinned hash. `EntitledClosure` satisfies it structurally; a test
 * can hand in a plain object to exercise the predicate with pins the fixture
 * corpus would never produce (TEST-EVIDENCE-STANDARD, failure mode #4).
 */
export interface QuotePinSource {
  readonly docIds: readonly string[];
  document(docId: string): Pick<EntitledDocument, 'sha256Normalized'>;
}

/** One conclusion's evidence, with the path of the **array** it sits at. */
export interface LabelledEvidenceSet {
  label: string;
  items: readonly EvidenceItem[];
}

/** A hash in message form; the empty string is said in words, since twelve characters of nothing read as a typo. */
function describeHash(hash: string): string {
  return hash === '' ? '"" (the empty string)' : `${hash.slice(0, 12)}…`;
}

/**
 * Every quote-pin problem across the given evidence sets, in order, none
 * omitted — a run is the expensive thing, so one refusal carries every defect.
 *
 * The pins are read off the closure once, by `docIds`, so a `docId` the
 * closure does not list is "outside the entitled closure" without ever asking
 * the closure for a document it would refuse.
 */
export function quotePinProblems(sets: readonly LabelledEvidenceSet[], closure: QuotePinSource): string[] {
  const pins = new Map<string, string>();
  for (const docId of closure.docIds) pins.set(docId, closure.document(docId).sha256Normalized);

  const problems: string[] = [];
  for (const set of sets) {
    set.items.forEach((item, i) => {
      for (const { quote, path } of quotesOf(item, `${set.label}[${i}]`)) {
        const pin = pins.get(quote.docId);
        if (pin === undefined) {
          problems.push(
            `${path}: quote names docId ${quote.docId}, which is not a document of the entitled closure (${closure.docIds.join(', ') || 'empty'}); a role may quote only what it was handed`,
          );
        } else if (pin !== quote.sha256Normalized) {
          problems.push(
            `${path}: quote pins ${quote.docId} at hash ${describeHash(quote.sha256Normalized)}, but that document's fence line carries ${describeHash(pin)}; the hash is copied from the <<<BEGIN DOCUMENT …>>> line of the document quoted, never computed, shortened or left empty`,
          );
        }
      }
    });
  }
  return problems;
}

function assertPinned<R extends RoleName>(role: R, index: number, sets: readonly LabelledEvidenceSet[], closure: QuotePinSource): void {
  const problems = quotePinProblems(sets, closure);
  if (problems.length > 0) throw new RoleOutputError(role, index, problems);
}

/** The reader's elements, each under `elements[i] (id).evidence`. Returns the output unchanged. */
export function assertReaderQuotesPinned(output: ReaderOutput, closure: QuotePinSource, index = 0): ReaderOutput {
  assertPinned(
    'reader',
    index,
    output.elements.map((element, i) => ({ label: `elements[${i}] (${element.id}).evidence`, items: element.evidence })),
    closure,
  );
  return output;
}

/** One prosecutor's challenges, each under `challenges[i] (id).evidence`. Returns the output unchanged. */
export function assertProsecutorQuotesPinned(output: ProsecutorOutput, closure: QuotePinSource, index = 0): ProsecutorOutput {
  assertPinned(
    'prosecutor',
    index,
    output.challenges.map((challenge, i) => ({ label: `challenges[${i}] (${challenge.id}).evidence`, items: challenge.evidence })),
    closure,
  );
  return output;
}

/** The adjudicator's adjudications, each under `adjudications[i] (challengeId).evidence`. Returns the output unchanged. */
export function assertAdjudicatorQuotesPinned(output: AdjudicatorOutput, closure: QuotePinSource, index = 0): AdjudicatorOutput {
  assertPinned(
    'adjudicator',
    index,
    output.adjudications.map((adjudication, i) => ({
      label: `adjudications[${i}] (${adjudication.challengeId}).evidence`,
      items: adjudication.evidence,
    })),
    closure,
  );
  return output;
}
