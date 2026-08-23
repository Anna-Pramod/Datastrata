/**
 * Where every field producer meets one authoritative record.
 *
 * Tasks 2–4 each own part of a `verification-result.json` and none of them owns
 * the file. This is the one function that puts the parts together, and its
 * whole discipline is negative: it **transcribes**. Every value it writes is
 * read off the producer the ownership table names, and there is no branch here
 * that invents, repairs, infers or defaults an agent-owned field. A field that
 * cannot be filled from its owner is a contradiction to report, not a hole to
 * plug — an assembler that quietly supplied a missing `verdict` or an empty
 * `adjudicationEvidence` would make the record satisfy the schema while saying
 * something no role ever said.
 *
 *     packId / requirementId                     run identity (the tail)
 *     requirementVersion                         the authored requirement,
 *                                                checked against the registry
 *     pipelineVersion                            identity.ts, via the tail
 *     rendererVersion                            RENDERER_VERSION, via the tail
 *     the five pins and corpus[]                 producePins, via the tail
 *     reading.elements[]                         the reader
 *     coverage.cells[] and challenge identity    the prosecutors
 *     verdict / resolution / adjudicationEvidence the adjudicator
 *     openQuestions[]                            projectOpenQuestions
 *     gaps[]                                     the tail's collation
 *
 * **It walks no corpus.** `corpus[]` is `run.tail.pins.corpus`, which is
 * `producePins`'s single traversal of the closure — the one Task 5a established
 * after three surfaces had each written their own. There is no
 * `closure.docIds.map(...)` in this file and there must never be one: a second
 * walk here would make "the result and the signature candidate agree about this
 * document" a coincidence again, and the disagreement would surface as
 * `verify sign` refusing every dossier this pipeline produces.
 *
 * **It re-derives no judgment.** `challenges[]` is `AdjudicatorOutcome`'s
 * assembled list and `openQuestions[]` is that outcome's projection of it, both
 * built by `pipeline/adjudicator.ts`. Recomputing either here would be the
 * second author `projectOpenQuestions` exists to prevent.
 *
 * **The record it returns has been parsed.** `parseVerificationResult` is
 * called on the way out, with the gap-identity registers, so nothing downstream
 * can be handed a draft that only looks like a result. That is structure *and*
 * cross-field consistency, by the central 1.2.0 rules — this module states no
 * rule of its own about coverage links, evidence binding, gap identity or
 * judgment exclusivity, because a second statement of any of them is a rule
 * that can come to disagree with the one the sign gate reads.
 *
 * Pure. No filesystem, no network, no clock: the two registers and the run
 * outcome are handed in by a caller that has already loaded them.
 */

import type { Requirement } from '../types';
import { requirementInputSha256, requirementSha256 } from '../verification/canonical';
import { assertVersionIntegrity, type VersionRegistry } from '../verification/registry';
import {
  parseVerificationResult,
  type GapIdentityRegisters,
  type VerificationResult,
} from '../verification/result';
import type { PipelineRunOutcome } from './orchestrate';

/**
 * The requirement handed to assembly is not the requirement the run was over.
 *
 * Its own error rather than a `ResultConsistencyError`, because the defect is
 * upstream of the record: nothing about the assembled JSON is wrong yet, and
 * the record cannot say which requirement its `requirementVersion` was taken
 * from. Reporting it as a consistency problem would point a repair at the file
 * instead of at the call.
 */
export class ResultAssemblyError extends Error {
  problems: string[];

  constructor(problems: string[]) {
    super(`The run and the requirement handed to assembly do not describe the same subject:\n  ${problems.join('\n  ')}`);
    this.name = 'ResultAssemblyError';
    this.problems = problems;
  }
}

export interface ResultAssemblyInput {
  /**
   * Exactly what `runVerificationPipeline` returned. Not a reshaping of it.
   *
   * The whole outcome rather than the handful of fields this function reads,
   * because a parameter list of extracted pieces is a seam at which a caller
   * can substitute one — and "the objects assembled are the ones the roles
   * produced" is the property this task exists to establish.
   */
  run: PipelineRunOutcome;
  /**
   * The authored requirement the run was over, as the pack holds it.
   *
   * A whole `Requirement` because `requirementSha256` — the hash the version
   * registry binds a version to — is defined over one. The two loader-projected
   * fields are stripped by `requirementSchema` before either hash sees them, so
   * a derived status cannot reach the record or the registry check.
   */
  requirement: Requirement;
  /** The parsed `verification/requirement-versions/<packId>.json`. */
  registry: VersionRegistry;
  /**
   * The corpus index's document ids and the source register's source ids.
   *
   * Handed in rather than read: both live in files and this module opens none.
   * They are passed straight to `assertResultConsistency`, which owns every
   * rule about which register a gap identity belongs to. Nothing here inspects
   * them.
   */
  registers: GapIdentityRegisters;
}

/**
 * That the requirement handed in is the one the run pinned, and the one the
 * run identifies.
 *
 * Two conditions and two problems, never one conjunction: they fail for
 * different reasons and a combined message would let either cover for the
 * other.
 *
 * **The hash is `requirementInputSha256`, the shared producer's**, compared
 * against the value `producePins` already computed for this run. That is a
 * comparison, not a fourth derivation — the number on both sides comes from one
 * function.
 *
 * **The id is checked separately because the hash cannot see it.**
 * `requirementInputSha256` covers the provisions, the cited sources and the
 * logical payload; two requirements with different ids and identical
 * verification input hash alike. Without this the record could carry one
 * requirement's `requirementId` beside another's `requirementVersion`, and both
 * fields would be individually truthful.
 */
function assertRequirementIsTheRunSubject(input: ResultAssemblyInput): void {
  const problems: string[] = [];
  const { run, requirement } = input;

  if (requirement.id !== run.tail.requirementId) {
    problems.push(
      `requirementId: the run identifies ${run.tail.requirementId} and the requirement handed to assembly is ${requirement.id}; requirementVersion would be taken from a different requirement than the one this record names`,
    );
  }

  const pinned = run.tail.pins.requirementInputSha256;
  const handed = requirementInputSha256(requirement);
  if (handed !== pinned) {
    problems.push(
      `requirementInputSha256: the run pinned ${pinned} and the requirement handed to assembly hashes to ${handed}; the version recorded would describe content the run never read`,
    );
  }

  if (problems.length > 0) throw new ResultAssemblyError(problems);
}

/**
 * One `VerificationResult`, assembled from what the roles returned and parsed.
 *
 * The order is load-bearing:
 *
 *  1. **The requirement is bound to the run** before its version is read off.
 *  2. **The declared version is checked against the registry**, through the
 *     shared `assertVersionIntegrity` rather than a lookup written here. The
 *     loader runs the same check over a whole pack at load and the sign gate
 *     runs it again over a ledger entry; neither is in this path, and between
 *     them sits the moment a version number is written into a record.
 *  3. **The fields are transcribed** from their producers, and from nowhere
 *     else.
 *  4. **The record is parsed** — structure, then cross-field consistency, with
 *     the registers — so that what this returns is a result rather than a
 *     draft.
 */
export function assembleVerificationResult(input: ResultAssemblyInput): VerificationResult {
  assertRequirementIsTheRunSubject(input);
  assertVersionIntegrity([input.requirement], input.registry, requirementSha256);

  const { tail, reader, prosecution, adjudication } = input.run;

  const draft = {
    packId: tail.packId,
    requirementId: tail.requirementId,
    requirementVersion: input.requirement.version,
    resultSchemaVersion: tail.resultSchemaVersion,
    pipelineVersion: tail.pipelineVersion,
    rendererVersion: tail.rendererVersion,
    requirementInputSha256: tail.pins.requirementInputSha256,
    conditionSha256: tail.pins.conditionSha256,
    renderedConditionSha256: tail.pins.renderedConditionSha256,
    corpusClosureSha256: tail.pins.corpusClosureSha256,
    corpus: tail.pins.corpus,
    reading: { elements: reader.output.elements },
    coverage: { cells: prosecution.table.cells },
    // Both from the adjudicator's outcome, and `null` only where no adjudicator
    // ran at all — a halted run, whose judgment-bearing containers the record
    // contract requires to be canonically empty. Not a default: there is no
    // adjudication to transcribe, and the empty container is what the schema
    // makes representable in its place.
    challenges: adjudication === null ? [] : adjudication.challenges,
    openQuestions: adjudication === null ? [] : adjudication.openQuestions,
    gaps: tail.gaps,
  };

  return parseVerificationResult(draft, input.registers);
}
