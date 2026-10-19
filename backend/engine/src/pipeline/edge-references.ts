/**
 * The edge-reference rule at the role seam — before the next role launches.
 *
 * Why this exists: the fourth genuine S-002 capture (2026-10-19, r4) ran the
 * reader, seven prosecutors and the adjudicator to completion, and its record
 * was filed with `evidenceValidity: failed`, because the reader's one
 * `amendment_chain` and one `cross_reference` named four edge ids the corpus
 * does not hold. The rule that found it — `checkEvidenceSet`'s "names edge …,
 * which the corpus does not hold" — is correct and stays. What was missing is
 * the same rule *where the edge was named*: the seams checked every quote's
 * `docId` and hash against the closure (`quote-pins.ts`) and nothing checked
 * an edge, so a reading resting on invented relationships passed to the next
 * role, and nine launches were spent before anything objected.
 *
 * **The same rules, one scope narrower.** `edgeReferenceProblems`
 * (`corpus/evidence.ts`) is the gate's own function, taking an `EdgeLookup`;
 * the seam hands it the entitled closure's edges — the list every role is
 * shown under `# Entitled relationships` — so an id outside that list is
 * refused here whether it is an invention or a real edge the role was never
 * shown. Existence, kind, endpoints and chain continuity are decided by the
 * one function, so the seam cannot come to apply a rule the gate does not,
 * or the reverse.
 *
 * **Never filled, never corrected.** The id is the model's claim about which
 * relationship it relied on. Replacing a wrong one with a listed one would
 * make the record agree with the catalog by construction; the output is
 * refused, and what the model returned stays in the transcript.
 *
 * **After the quote gate, by design.** A quote's hash is checked before its
 * edge, so a role whose output fails both is told about the hash; the edge
 * problems are reported once the quotes are sound. This module reads no
 * quote text and no hash.
 *
 * Pure: handed values, reads nothing, keeps no state.
 */

import { edgeReferenceProblems, type EdgeLookup } from '../corpus/evidence';
import type { EntitledEdge } from './entitlement';
import type { LabelledEvidenceSet } from './quote-pins';
import type { AdjudicatorOutput, ProsecutorOutput, ReaderOutput } from './role-outputs';
import { RoleOutputError, type RoleName } from './roles';

/**
 * What the check needs of a closure, and no more: the edges it lists.
 * `EntitledClosure` satisfies it structurally; a test can hand in a plain
 * list to exercise a rule the fixture corpus could never produce
 * (TEST-EVIDENCE-STANDARD, failure mode #4).
 */
export interface EdgeReferenceSource {
  readonly edges: readonly EntitledEdge[];
}

/** How a refusal names the scope an id was looked up in: the list the role was shown. */
export const ENTITLED_EDGE_SCOPE = 'the entitled closure (the ids listed under # Entitled relationships)';

/**
 * Every edge problem across the given evidence sets, in order, none omitted —
 * a run is the expensive thing, so one refusal carries every defect.
 */
export function edgeReferenceSeamProblems(sets: readonly LabelledEvidenceSet[], closure: EdgeReferenceSource): string[] {
  const byId = new Map(closure.edges.map((edge) => [edge.edgeId, edge]));
  const lookup: EdgeLookup = { scope: ENTITLED_EDGE_SCOPE, edge: (edgeId) => byId.get(edgeId) };
  const problems: string[] = [];
  for (const set of sets) {
    set.items.forEach((item, i) => {
      problems.push(...edgeReferenceProblems(item, `${set.label}[${i}]`, lookup));
    });
  }
  return problems;
}

function assertEntitled<R extends RoleName>(role: R, index: number, sets: readonly LabelledEvidenceSet[], closure: EdgeReferenceSource): void {
  const problems = edgeReferenceSeamProblems(sets, closure);
  if (problems.length > 0) throw new RoleOutputError(role, index, problems);
}

/** The reader's elements, each under `elements[i] (id).evidence`. Returns the output unchanged. */
export function assertReaderEdgesEntitled(output: ReaderOutput, closure: EdgeReferenceSource, index = 0): ReaderOutput {
  assertEntitled(
    'reader',
    index,
    output.elements.map((element, i) => ({ label: `elements[${i}] (${element.id}).evidence`, items: element.evidence })),
    closure,
  );
  return output;
}

/** One prosecutor's challenges, each under `challenges[i] (id).evidence`. Returns the output unchanged. */
export function assertProsecutorEdgesEntitled(output: ProsecutorOutput, closure: EdgeReferenceSource, index = 0): ProsecutorOutput {
  assertEntitled(
    'prosecutor',
    index,
    output.challenges.map((challenge, i) => ({ label: `challenges[${i}] (${challenge.id}).evidence`, items: challenge.evidence })),
    closure,
  );
  return output;
}

/** The adjudicator's adjudications, each under `adjudications[i] (challengeId).evidence`. Returns the output unchanged. */
export function assertAdjudicatorEdgesEntitled(output: AdjudicatorOutput, closure: EdgeReferenceSource, index = 0): AdjudicatorOutput {
  assertEntitled(
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
