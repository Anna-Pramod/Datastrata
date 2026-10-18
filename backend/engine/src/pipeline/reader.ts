/**
 * The blind reader — §3.1, as a type rather than as an instruction.
 *
 * The reader produces an independent structured reading of the law and has not
 * been shown the encoding it will later be compared against. Blindness is the
 * property that makes that comparison mean anything: a reader that can see the
 * `Condition` writes down the `Condition`, and coverage agreement then measures
 * transcription rather than correctness.
 *
 * **So blindness is enforced by the input type, not by the prompt.** A prompt
 * that says "you are not given the condition" is a promise the pipeline makes to
 * itself; `ReaderInput` is a shape in which the condition has nowhere to sit.
 * The prompt still says it, because a model reading its own instructions is
 * better for knowing, but nothing rests on it.
 *
 * **A positive projection, never `Omit<AuthoredRequirement, …>`.** The
 * difference is what happens to a field added to the requirement next year.
 * Under `Omit` the new field flows into the reader automatically and blindness
 * decays with no edit to this file and no test going red — the exclusion list
 * names what was known to be dangerous when it was written, and says nothing
 * about what is added later. Under a positive projection the new field is simply
 * not here, and adding it is a visible edit to this line. Every field below is
 * named individually for that reason, and `readerInputFor` is the only function
 * in the pipeline that touches an `AuthoredRequirement` on the reader's behalf.
 *
 * Excluded, and each because §3.1 names it: `condition`, the rendered English,
 * `plainEnglish`, `caution`, the customer's facts, the obligation templates, and
 * any prior reading — including the hand-written human review log kept beside
 * the corpus, which records the very finding this pipeline exists to rediscover
 * independently. There is no parameter through which any of them could arrive.
 *
 * **Document access is the `EntitledClosure` and nothing else.** No corpus
 * handle, no path, no loader, no index. A document the closure does not hand
 * over does not come back as text; it comes back as a classified gap, and agent
 * verification stops.
 *
 * This module opens no file and calls no model. The prompt is handed in already
 * read and hashed, and the runner is injected.
 */

import type { AuthoredRequirement } from '../types';
import { evidenceIsSolelyAbsence } from '../verification/result';
import { createAgentRole } from './agent-role';
import { locatorTextsOf } from '../knowledge/provenance';
import { composeRoleMessage, type EntitledClosure, type EntitledDocument } from './entitlement';
import {
  unservedSourceGaps,
  gapForUnreachableDocument,
  type DocumentGap,
  type PipelineGap,
} from './gaps';
import type { RolePrompt } from './prompts';
import { assertReaderQuotesPinned } from './quote-pins';
import { parseRoleOutput, type ReaderOutput } from './role-outputs';
import { RoleOutputError, type RoleExecution } from './roles';
import type { AgentRunner } from './runner';

/**
 * Everything the reader is entitled to, and it is a closed list.
 *
 * `packId`, `requirementId` and `requirementVersion` identify *which*
 * requirement is being read so a transcript can be placed; none of them says
 * anything about what the law requires. `locators` are the addresses the
 * requirement's provenance carries, which §3.1 gives the reader so it knows
 * where in the closure to look — an address is not an answer, and a reader told
 * to read Article 29a still has to decide for itself what Article 29a says.
 * **The source ids those locators came from are not here**: which record the
 * author cited is a claim about the answer, and the reader's blindness to
 * `sources[]` is what the source-completeness check at the boundary exists to
 * compensate for. `closure` is the evidence surface and the only route to any
 * text.
 */
export interface ReaderInput {
  packId: string;
  requirementId: string;
  requirementVersion: number;
  /**
   * Where in the closure to look — addresses only, never source identity.
   *
   * Built by `locatorTextsOf`, which drops `sourceId` on the way out. The type
   * is `string[]` rather than the authored `ProvenanceEntry[]` for that reason:
   * a reader handed entries could read the ids off them, and a projection that
   * *could* leak is one refactor away from leaking. `sources[]` was always kept
   * out of this input, and structuring provenance must not smuggle it back in.
   */
  locators: string[];
  /** The capability. The whole of the evidence surface, and the only route to it. */
  closure: EntitledClosure;
}

/**
 * Builds the projection, field by named field.
 *
 * The only place an `AuthoredRequirement` is read on the reader's behalf. It
 * takes the whole requirement rather than pre-extracted pieces so that the
 * projection is visible in one place — a caller assembling a `ReaderInput` from
 * loose arguments would be a second projection, and the second one is where
 * `plainEnglish` eventually gets passed as `provisions` by mistake.
 */
export function readerInputFor(input: {
  packId: string;
  requirement: AuthoredRequirement;
  closure: EntitledClosure;
}): ReaderInput {
  return {
    packId: input.packId,
    requirementId: input.requirement.id,
    requirementVersion: input.requirement.version,
    locators: locatorTextsOf(input.requirement),
    closure: input.closure,
  };
}

/**
 * The message the reader receives, as a function of `ReaderInput` alone.
 *
 * That signature is the second half of the blindness guarantee. The type says
 * the condition cannot be *held*; this says it cannot be *written into the
 * prompt*, because the only thing in scope here is the projection. A renderer
 * taking the requirement — even to interpolate one harmless field — would put
 * every other field one keystroke away.
 */
export function renderReaderInput(input: ReaderInput): string {
  return composeRoleMessage(
    [
      { heading: 'Requirement', body: `${input.packId}/${input.requirementId} v${input.requirementVersion}` },
      { heading: 'Where to look', body: input.locators.join('\n') },
    ],
    input.closure,
  );
}

/** What a request for a document comes back as. Text, or a gap. Never both. */
export type ReaderDocumentRequest =
  | { granted: true; document: EntitledDocument }
  | { granted: false; gap: PipelineGap };

/**
 * The reader asking for one document.
 *
 * Entitlement is *enforced* here rather than requested: an unentitled id
 * produces a gap and no text, and there is no branch in which text is returned
 * anyway. The refusal is classified in the same step, so the caller never holds
 * an unexplained "no".
 */
export function requestDocument(closure: EntitledClosure, reference: string): ReaderDocumentRequest {
  // The reference is resolved the way the gap seam resolves it, so a request
  // and a halt agree about what a name means. Entitlement is still decided on
  // the exact id: resolution says which document was named, `entitled` says
  // whether that document may be opened, and only the second grants anything.
  const resolution = closure.resolveDocumentReference(reference);
  const docId = resolution.outcome === 'resolved' ? resolution.docId : reference;
  if (!closure.entitled(docId)) {
    return {
      granted: false,
      gap: gapForUnreachableDocument(closure, reference, `the reader requested ${reference}`),
    };
  }
  return { granted: true, document: closure.document(docId) };
}

/**
 * The evidence rule at the role boundary: §2.2, applied where it was produced.
 *
 * A second *gate* over one rule, not a second rule — the predicate is
 * `result.ts`'s, so this cannot come to disagree with the record boundary. It is
 * here as well as there because a reading that fails it is the reader's defect
 * and should be named against the reader, at the moment it arrives, rather than
 * three stages later as an inconsistent `verification-result.json` whose message
 * points at a schema path.
 *
 * Cardinality is the schema's job (`.min(1)`), so this checks kinds only.
 */
export function assertReaderEvidence(output: ReaderOutput, index = 0): ReaderOutput {
  const problems: string[] = [];
  output.elements.forEach((element, position) => {
    if (evidenceIsSolelyAbsence(element.evidence)) {
      problems.push(
        `elements[${position}] (${element.id}): every evidence item is an absence claim; lexical absence cannot establish that no equivalent criterion exists under different words, so it may not be the sole evidence for a conclusion`,
      );
    }
  });
  if (problems.length > 0) throw new RoleOutputError('reader', index, problems);
  return output;
}

/** What the reader was asked, what came back, and what the run may rely on. */
export interface ReaderOutcome {
  /** The projection the reader actually received. */
  input: ReaderInput;
  /**
   * The reading, canonically empty when a gap was hit.
   *
   * §3.0 forbids topping a reading up: a gap means the surface itself was
   * incomplete, so elements produced against it are discarded here rather than
   * carried forward into a dossier with hybrid provenance. The agent's original
   * words survive verbatim in the transcript, which is where a human looks to
   * see what it had managed before it stopped.
   */
  output: ReaderOutput;
  /**
   * Every gap, classified by the machinery. The authoritative list.
   *
   * A superset of `output.gaps`: a role can only ever name a document, and the
   * shape that names a *source* is produced before any role runs.
   */
  gaps: PipelineGap[];
  /**
   * The execution, or `null` when no agent ran at all.
   *
   * `null` is not "the reader returned nothing". It is the honest record of a
   * requirement whose entitled closure is empty: there was no evidence surface
   * to read, so asking a model to read it could only have produced a reading
   * from general knowledge — which is precisely the finding, inverted.
   */
  execution: RoleExecution<ReaderOutput> | null;
}

export interface BlindReaderRun {
  /** Already projected. This function never sees an `AuthoredRequirement`. */
  input: ReaderInput;
  /**
   * The requirement's cited sources, for the source-completeness check.
   *
   * Deliberately a parameter here rather than a field of `ReaderInput`: the
   * pipeline needs the source ids to *name* what is missing, and the reader must
   * not be told which sources it is expected to find its way to. §3.1's
   * provenance-defect property is a finding about `sources[]`, not an input.
   */
  sourceIds: readonly string[];
  prompt: RolePrompt;
  model: string;
  runner: AgentRunner;
  index?: number;
}

/**
 * Runs the blind reader, or refuses to run it.
 *
 * Three outcomes, in the order they are decided:
 *
 *  1. **A cited source is unserved, or the closure is empty.** No agent runs.
 *     The dominant case is the first: some evidence exists and is entitled, and
 *     a source the requirement declared is missing from the corpus, so the run
 *     stops before the first call with one `corpus_gap` per unserved source.
 *     The closure is kept and pinned as itself — a gap records what is missing
 *     and must not erase what was available. The second case is the separate
 *     latent one of a requirement citing no sources at all. Not a weakened
 *     reader: the gap is the finding.
 *  2. **The reader halted on a document.** Its gaps are classified by the
 *     machinery, its elements are discarded, and agent verification stops.
 *  3. **The reading is whole.** Elements and no gaps.
 */
export async function runBlindReader(run: BlindReaderRun): Promise<ReaderOutcome> {
  const index = run.index ?? 0;
  const { closure } = run.input;

  // Source completeness, decided here and never by the reader.
  //
  // The reader is blind to the requirement's source declaration — that is what
  // its blindness means — so it cannot notice that a cited source is unserved.
  // Only the machinery can, and it must, because a run over an evidence surface
  // the author declared and the corpus does not hold is a run whose judgments
  // have no standing. `gaps.ts` carries the full argument and the decision it
  // reverses.
  const sourceGaps = unservedSourceGaps(closure, run.sourceIds);

  // Two conditions, not one, and the second is not redundant.
  //
  // A gap means the declared surface is incomplete: halt, whatever the closure's
  // size. An empty closure with *no* gap is the separate latent case of a
  // requirement citing no sources at all — nothing to report, and nothing to
  // read either. `min(1)` on `provenance` in `knowledge/schema.ts` makes that
  // unreachable from a loaded pack today — `sources` is derived from it, so the
  // guarantee is the authored field's — and it stays latent; the guard states
  // the rule anyway, because the schema is a different module's promise.
  //
  // **What the second condition covers, precisely.** It stops *this role* from
  // reading an empty surface, and no more. `orchestrate.ts` derives
  // `readerHalted` from `reader.gaps.length > 0`, and that case produces no
  // gap — so in it the prosecutors and the adjudicator still run, over an empty
  // entitled closure, until `assertResultConsistency`'s "an empty closure never
  // travels alone" rule refuses the record. Nothing unsound publishes, and
  // nothing reaches a model that a loaded pack could produce. It is recorded
  // here rather than fixed because closing it means changing how orchestration
  // derives its halt, which is a wider change than this repair.
  if (sourceGaps.length > 0 || closure.docIds.length === 0) {
    return {
      input: run.input,
      output: { elements: [], gaps: [] },
      gaps: sourceGaps,
      execution: null,
    };
  }

  const role = createAgentRole<ReaderInput, ReaderOutput>({
    name: 'reader',
    index,
    model: run.model,
    prompt: run.prompt,
    runner: run.runner,
    renderInput: renderReaderInput,
    // Three gates, in order: the shape (schema, 64-hex hashes included), the
    // evidence rule (§2.2), then every quote's docId and hash against the
    // closure the reader was handed — so a reader quoting a document it was
    // never shown, or at a hash that is not that document's fence hash, is
    // refused here after one launch rather than at assembly after nine
    // (`quote-pins.ts`).
    parse: (raw) =>
      assertReaderQuotesPinned(assertReaderEvidence(parseRoleOutput('reader', index, raw), index), closure, index),
  });

  const execution = await role.run(run.input);

  // The role said *that* it could not reach a document. Which population that
  // belongs to is a fact about the corpus and the closure, so it is derived
  // rather than believed — see `gaps.ts`.
  let gaps: DocumentGap[];
  try {
    gaps = execution.output.gaps.map((gap) =>
      gapForUnreachableDocument(closure, gap.docId, gap.detail),
    );
  } catch (error) {
    throw new RoleOutputError('reader', index, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  return {
    input: run.input,
    // The classified gaps, not the role's own wording of them, and the reading
    // discarded when there are any. The agent's original response survives
    // verbatim in `execution.transcript`, which is where a human looks to see
    // what it had managed before it stopped.
    output: { elements: gaps.length > 0 ? [] : execution.output.elements, gaps },
    gaps,
    execution,
  };
}
