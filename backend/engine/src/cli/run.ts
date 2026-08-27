/**
 * `npm run verify -- run <packId> <requirementId>` — the verification pipeline,
 * reached through the CLI everything else in this layer is reached through.
 *
 * Every piece of machinery below already existed and is already tested where it
 * lives. This file is **orchestration over it**, and its whole discipline is
 * negative:
 *
 * ```text
 * readWorld (cli/sign.ts)      the pack, the requirement, the corpus, the render context
 * EntitledClosure.forSources   the capability every role reads through
 * loadPromptSet                the files pipelineVersion pins
 * runVerificationPipeline      reader -> prosecutors -> adjudicator -> deterministic tail
 * writeVerificationResult      assemble + validate + canonical bytes + one atomic publish
 * ```
 *
 * **It loads no world of its own.** `readWorld` is `verify sign`'s loader,
 * exported rather than copied: `run` and `sign` are two operations over one
 * repository, and a second loader would be a second answer to which documents a
 * requirement opens onto — the very closure the signature pins.
 *
 * **It builds no path of its own.** The writer's `destination` is
 * `resultPath(paths, packId, requirementId)`, imported from `cli/sign.ts` — the
 * one join the sign gate reads through, at `runSign`'s `readResultOrRefuse` and
 * again at its `resultPresent` check. A join written here would let this command
 * publish to a location the reader never looks at, and the two would agree
 * only by inspection. The tooth for that is not a comparison of two joins: it is
 * `cli-run.test.ts` feeding a run's output into the **actual sign path** and
 * requiring the refusal to be `unpromoted_pipeline` rather than "there is
 * nothing to sign".
 *
 * **It serialises nothing, creates no directory, writes no temp file, consults
 * no signature ledger and inspects no existing result.** All of that is the
 * writer's, which owns publication mechanics whole (`pipeline/write-result.ts`).
 * This file calls it exactly once.
 *
 * **It classifies nothing.** Complete, gap-bearing and Invalid are decided
 * upstream — a gap-bearing run is canonicalised at orchestration's single
 * return, and Invalid is `assembleVerificationResult` refusing. What this file
 * chooses is only the exit code and the lines:
 *
 * ```text
 * COMPLETE      valid result      -> published -> EXIT_OK
 * GAP-BEARING   valid gap dossier -> published -> EXIT_OK
 * INVALID       no result         -> nothing written -> EXIT_REFUSED
 * ```
 *
 * **A gap is not a command failure.** A gap-bearing dossier is a *successful*
 * verification outcome that happens to record an incomplete evidence surface;
 * it is the artefact a human is asked to repair from, and a CLI that exited
 * non-zero on it would make the repair path indistinguishable from a broken
 * run. The gap count is reported, and it is read off the published record
 * rather than recomputed here.
 *
 * # The capability boundary
 *
 * The runner arrives as a parameter and there is **no fallback**: this module
 * imports no provider SDK, reads no environment credential, names no endpoint
 * and has no implicit live mode. A run that reaches a judgment role with no
 * capability supplied is refused by `requireRunner` before any I/O
 * (`pipeline/runner.ts`), and that refusal is reported here by name. The
 * process edge in `verify.ts` supplies `null`, deliberately: B2 authorises no
 * live execution, and Task 5e supplies replay through this same seam rather
 * than through a second one.
 */

import { DEFAULT_ROLE_CONFIG } from '../pipeline/config';
import { EntitledClosure } from '../pipeline/entitlement';
import { runVerificationPipeline } from '../pipeline/orchestrate';
import { loadPromptSet, MissingPromptFileError } from '../pipeline/prompts';
import { RoleOutputError } from '../pipeline/roles';
import { MissingAgentRunnerError, type AgentRunner } from '../pipeline/runner';
import type { RunTranscript } from '../pipeline/transcript';
import { writeVerificationResult } from '../pipeline/write-result';
import { sourceIdsOf } from '../knowledge/provenance';
import type { GapIdentityRegisters } from '../verification/result';
import { EXIT_INTEGRITY_FAILURE, EXIT_OK, EXIT_REFUSED, type CliOutcome } from './exit-codes';
import {
  outcomeFor,
  readRegistryOrFail,
  readWorld,
  resultPath,
  type CurrentWorld,
  type VerifyPaths,
} from './sign';

export interface RunArgs {
  packId: string;
  requirementId: string;
}

/**
 * What the caller supplies that this module may not obtain for itself.
 *
 * One field, and it is the seam the pipeline already declares
 * (`PipelineRunInput.runner`). Nothing here widens it into a place a model id,
 * an endpoint or a credential could be passed: the runner *is* the whole
 * execution capability, and a run without one does not begin.
 */
export interface RunCapabilities {
  /**
   * The agent runner, or nothing.
   *
   * Typed as possibly absent because "absent" is the honest default for a CLI
   * that must never contact a model on its own initiative. `requireRunner`
   * turns it into a named refusal with nothing contacted.
   */
  runner?: AgentRunner | null;
  /**
   * Where this run's recording goes, if anywhere.
   *
   * A capability rather than a flag, and a *callback* rather than a directory,
   * for the same reason `runner` is one: this module must not decide that a
   * transcript is written, where it is written, or whether writing it is
   * allowed. A live capture harness supplies a callback that writes under
   * `TRANSCRIPT_ROOT`; the default suite supplies one that keeps the recording
   * in memory; the process edge in `verify.ts` supplies none, so an ordinary
   * `verify run` records nothing anywhere.
   *
   * It is handed the transcript orchestration *already built* — this module
   * assembles no recording of its own. A second assembly would be a second
   * account of what the roles were sent.
   *
   * Called before the result is written and outside the write's atomicity: a
   * transcript is execution evidence, not part of the published record, and a
   * recording that survived a failed publish is better than a published record
   * whose recording was lost.
   */
  record?(transcript: RunTranscript): void;
}

/**
 * The two registers 1.2.0's gap-identity rules are checked against, taken off
 * the world that was actually loaded.
 *
 * Neither may be empty and neither may be invented. A gap identity rule over an
 * empty register is vacuous in the worst possible direction: every membership
 * test passes for the wrong reason, so a `SRC-###` sitting in a field called
 * `docId` — the exact confusion the two-identity gap shape exists to remove —
 * would be published as a valid record.
 *
 * The two halves come from the two files that define them, through the same
 * expressions `runSign` hands the sign gate: the corpus index's documents, and
 * the pack's own source register. Written from `world` rather than from
 * anything this module assembled, so "the registers describe the repository
 * this run was over" holds by construction.
 */
function registersFor(world: CurrentWorld): GapIdentityRegisters {
  return {
    docIds: world.corpus.index.documents.map((document) => document.docId),
    sourceIds: world.pack.sources.map((source) => source.id),
  };
}

/**
 * One verification run, published or refused.
 *
 * Async because the pipeline is; nothing else about it differs from `runSign`,
 * which is why `dispatch` awaits every subcommand rather than branching on
 * which ones happen to be synchronous today.
 */
export async function runRun(
  args: RunArgs,
  paths: VerifyPaths,
  capabilities: RunCapabilities = {},
): Promise<CliOutcome> {
  let world: CurrentWorld;
  let registry;
  try {
    world = readWorld(paths, args.packId, args.requirementId);
    registry = readRegistryOrFail(paths, args.packId);
  } catch (error) {
    const mapped = outcomeFor(error);
    if (mapped !== null) return mapped;
    throw error;
  }

  // The capability object, built once and handed to every role. Not a second
  // traversal: `EntitledClosure.forSources` wraps `docsForSources` and
  // `computeClosure`, which is the same pair `readWorld` went through.
  const closure = EntitledClosure.forSources(world.corpus, sourceIdsOf(world.requirement));

  let run;
  try {
    run = await runVerificationPipeline({
      packId: args.packId,
      requirementId: args.requirementId,
      requirement: world.requirement,
      renderContext: world.renderCtx,
      closure,
      corpus: world.corpus,
      prompts: loadPromptSet(),
      config: DEFAULT_ROLE_CONFIG,
      // The whole execution capability, and no default behind it.
      runner: capabilities.runner ?? null,
    });
  } catch (error) {
    if (error instanceof MissingAgentRunnerError) {
      return {
        exitCode: EXIT_REFUSED,
        lines: [
          'REFUSED — no execution capability was supplied, so no run began.',
          `  - no_execution_capability: ${error.message}`,
          '  Nothing was contacted and no verification result was written.',
        ],
      };
    }
    if (error instanceof MissingPromptFileError) {
      return {
        exitCode: EXIT_INTEGRITY_FAILURE,
        lines: [
          'INTEGRITY FAILURE — a role prompt file is missing, so no pipelineVersion can be derived.',
          `  - ${error.message}`,
        ],
      };
    }
    if (error instanceof RoleOutputError) {
      // A role's own boundary refused its own output. Named against the role
      // that produced it rather than reported as an invalid record three stages
      // later — and distinct from the Invalid outcome below, which is the
      // *record* boundary refusing a well-formed run.
      return {
        exitCode: EXIT_REFUSED,
        lines: [
          'REFUSED — a role output was refused at its own boundary.',
          `  - role_output: ${error.message}`,
          '  No verification result was written.',
        ],
      };
    }
    throw error;
  }

  // The recording, if anybody asked for one. Orchestration built it; this
  // hands it over unchanged.
  capabilities.record?.(run.transcript);

  // Exactly one call, and everything it needs is already decided. The
  // destination is the sign gate's own join; the registers are the world's.
  const written = writeVerificationResult({
    run,
    requirement: world.requirement,
    registry,
    registers: registersFor(world),
    destination: resultPath(paths, args.packId, args.requirementId),
  });

  if (written.status === 'invalid') {
    // The record boundary refused. Nothing was serialised, no directory was
    // created and nothing exists at the destination that was not there before
    // — which is the writer's guarantee, not a repair performed here. The run
    // is *not* converted into a gap-bearing dossier: a gap is a finding about
    // the evidence surface, and an unassemblable record is not one.
    return {
      exitCode: EXIT_REFUSED,
      lines: [
        'REFUSED — the run did not produce a verification result, so nothing was written.',
        ...written.error.message.split('\n').map((line) => `  - invalid_result: ${line.trim()}`),
      ],
    };
  }

  if (written.status === 'write_failed') {
    return {
      exitCode: EXIT_INTEGRITY_FAILURE,
      lines: [
        `INTEGRITY FAILURE — the record was valid and the filesystem refused it at the ${written.stage} stage.`,
        `  ${written.error.message}`,
      ],
    };
  }

  // Read off the published artefact, never recomputed. A line that recomputed
  // the hash beside the writer's would be a second answer to "what was
  // published", and the two would be free to disagree in exactly the case the
  // line exists to report.
  const gapCount = written.result.gaps.length;
  return {
    exitCode: EXIT_OK,
    lines: [
      `Wrote ${written.path}`,
      `  resultSha256 ${written.resultSha256}`,
      `  pipelineVersion ${written.result.pipelineVersion}`,
      gapCount === 0
        ? '  gaps: none'
        : `  gaps: ${gapCount} — the evidence surface was incomplete, so this dossier records the gap and carries no judgment. It is written, and it may not be signed until the gap is answered.`,
    ],
  };
}
