/**
 * The atomic result writer — where a validated record becomes a file.
 *
 * Its responsibility is deliberately narrow, and everything it does *not* do is
 * owned elsewhere and already tested there:
 *
 * ```text
 * validated / canonical result  ->  prepared authoritative bytes  ->  atomic publication
 * ```
 *
 * **It does not classify the run.** Complete, Gap-bearing and Invalid are
 * decided by the record itself: a gap-bearing run is canonicalised by
 * orchestration (`canonicaliseGapBearingRun`) and an invalid one is refused by
 * `assembleVerificationResult`, which is the authoritative validation path —
 * structure, cross-field consistency, evidence against the pins, gap identity
 * against the two registers, and the version registry. This module states no
 * schema, consistency, evidence or registry rule of its own. A second statement
 * of any of them is a rule that can come to disagree with the one the sign gate
 * reads.
 *
 * **It does not clear judgments, repair an invalid result, inspect signatures,
 * walk the corpus or reassemble anything.** Task 5's existing-result policy is
 * that a valid rerun replaces the previous result and the writer never consults
 * the signature ledger: signature history and result materialisation are
 * separate concerns, and a displaced signature is the already-defined
 * `stale_result` condition for the signing workflow to repair.
 *
 * # The preflight boundary
 *
 * ```text
 * assemble + validate  ->  prepare exact bytes    <- nothing above this line touches the filesystem
 * ----------------------------------------------------------------------------
 * mkdir destination -> temp file in the SAME directory -> write -> one rename -> clean residue
 * ```
 *
 * Validation and byte preparation finish **before** any `mkdir`, temp file,
 * write, rename or truncation. That ordering is what makes "an Invalid run
 * writes nothing at all" structural rather than conditional: the writer never
 * holds an invalid record, so there is no state from which it could publish
 * one, and no partially authoritative destination file ever exists to be
 * cleaned up afterwards.
 *
 * # Atomic visibility, not crash durability
 *
 * The temp file is created in the **same directory** as the destination, so the
 * final `rename` is within one filesystem and is therefore atomic: a reader
 * sees either the previous result or the new one, never a half-written file.
 * That is the whole claim. **No `fsync` is performed and no durability across a
 * machine crash is claimed** — an unsynced rename can still be lost by a power
 * failure, and asserting otherwise would be a promise nothing here tests.
 *
 * # The filesystem seam
 *
 * `ResultWriterFs` exists so a test can make one operation fail and observe
 * what the authoritative destination looks like afterwards. It is four methods
 * wide because that is every filesystem call this module makes, and it defaults
 * to the real one — there is **one** production writer, and a test injecting a
 * failure runs that same writer over real files.
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { Requirement } from '../types';
import type { VersionRegistry } from '../verification/registry';
import {
  canonicalResultJson,
  resultSha256,
  type GapIdentityRegisters,
  type VerificationResult,
} from '../verification/result';
import { assembleVerificationResult } from './assemble';
import type { PipelineRunOutcome } from './orchestrate';

/**
 * The framing the file adds and the hash does not cover.
 *
 * A terminal newline, because `verification-result.json` is a text file in a
 * Git-backed repository and a file without one is a file every diff reports as
 * modified. It is **storage framing**: `resultSha256` is taken over
 * `canonicalResultJson`, which has no newline, so adopting or dropping this
 * convention cannot move the number a signature pins. The two are named
 * separately here for that reason, and the distinction is asserted rather than
 * assumed.
 */
export const RESULT_FILE_FRAMING = '\n';

/** Every filesystem operation this module performs, and nothing else. */
export interface ResultWriterFs {
  /** Creates the destination directory and any missing parent. */
  mkdirSync(directory: string, options: { recursive: true }): void;
  /** Writes the whole prepared byte string, as UTF-8. */
  writeFileSync(path: string, data: string): void;
  /** The publish. Atomic because both paths are in one directory. */
  renameSync(from: string, to: string): void;
  /**
   * Removes temp residue. Must not throw for an absent path. It may throw for
   * anything else, and the writer reports that beside the failure it was
   * cleaning up after rather than letting it escape.
   */
  rmSync(path: string, options: { force: true }): void;
}

/** The real filesystem. The default, and what production runs. */
export const nodeResultWriterFs: ResultWriterFs = {
  mkdirSync: (directory, options) => {
    mkdirSync(directory, options);
  },
  writeFileSync: (path, data) => {
    writeFileSync(path, data, 'utf8');
  },
  renameSync: (from, to) => {
    renameSync(from, to);
  },
  rmSync: (path, options) => {
    rmSync(path, options);
  },
};

export interface ResultWriteInput {
  /**
   * Exactly what `runVerificationPipeline` returned, already canonical.
   *
   * Whole-run gap canonicalisation happens at orchestration's single return, so
   * a gap-bearing outcome arrives here with its four judgment containers
   * already empty and its gap provenance intact. Nothing in this module clears
   * a judgment or inspects `gaps` to decide anything.
   */
  run: PipelineRunOutcome;
  /** The authored requirement the run was over, as the pack holds it. */
  requirement: Requirement;
  /** The parsed `verification/requirement-versions/<packId>.json`. */
  registry: VersionRegistry;
  /** The corpus index's document ids and the source register's source ids. */
  registers: GapIdentityRegisters;
  /**
   * The absolute path of `verification-result.json`.
   *
   * Handed in rather than constructed here. `src/cli/sign.ts` already exports
   * the one `resultPath(paths, packId, requirementId)` the sign gate reads
   * through, and a path this module built for itself would be a second
   * construction — the writer could then publish to a location the reader never
   * looks at, and nothing would say so.
   */
  destination: string;
  /** Injected only to make a filesystem failure observable. */
  fs?: ResultWriterFs;
  /**
   * Injected only to make a **byte-preparation** failure observable, and it may
   * do exactly one thing: throw.
   *
   * `void` rather than a replacement serialiser, deliberately. A seam that
   * could *supply* the canonical text would be a second formatter — the thing
   * `canonicalJson` was collapsed into one function to prevent — and it could
   * publish bytes inconsistent with the `resultSha256` computed beside them.
   * This one cannot contribute a byte. It can only fail, which is the whole
   * property under test: byte preparation sits inside the validation guard and
   * **before every filesystem call**, so its failure must arrive as
   * `{status:'invalid'}` with the filesystem untouched — not merely with the
   * previous result intact, but with the destination directory never created.
   *
   * No production state reaches it: `canonicalResultJson` and `resultSha256`
   * re-parse a record assembly has already parsed. That is exactly why the
   * failure needs injecting rather than provoking.
   */
  injectPreparationFailure?: () => void;
}

/** Which half of the publish failed. */
export type ResultWriteStage = 'temp_write' | 'publish';

export type ResultWriteOutcome =
  | {
      status: 'written';
      /** The validated record, exactly as the authoritative path returned it. */
      result: VerificationResult;
      /** The canonical text the hash is taken over. No framing. */
      canonicalJson: string;
      /** What was written to disk: the canonical text plus the file framing. */
      bytes: string;
      /** `resultSha256(result)`, computed before the write. */
      resultSha256: string;
      path: string;
    }
  | {
      /**
       * The record is not a record. Nothing was validated, so nothing was
       * prepared, so no directory, temp file or destination was touched.
       */
      status: 'invalid';
      error: Error;
    }
  | {
      /**
       * The bytes were prepared and the filesystem refused them.
       *
       * `temp_write` covers the whole pre-publish half — creating the
       * destination directory and writing the temp file — because both fail
       * with the authoritative path never touched, and splitting them would add
       * a branch nothing distinguishes. `publish` is the rename, and it is the
       * one that proves replacement is all-or-nothing.
       */
      status: 'write_failed';
      stage: ResultWriteStage;
      error: Error;
      /**
       * Present only when removing the temp file failed as well. Secondary: it
       * can explain residue beside the destination, never why the write
       * failed — that is always `error`. It carries the absolute temp path.
       */
      cleanupError?: Error;
    };

/**
 * A temp path in the destination's own directory.
 *
 * The directory is not a detail: `rename` is atomic only within one filesystem,
 * so a temp file under the OS temp directory would make the publish a
 * cross-device copy — non-atomic, and capable of leaving a half-written
 * authoritative file exactly where this design promises there can never be one.
 *
 * The random component is there so two concurrent writers cannot collide on one
 * temp path and publish each other's half-written bytes.
 */
function tempPathFor(destination: string): string {
  return join(dirname(destination), `${basename(destination)}.${randomBytes(8).toString('hex')}.tmp`);
}

function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Removes the temp file after a failed write, returning — never throwing — any
 * failure to do so.
 *
 * It runs inside a stage's `catch`, where a throw would take the place of the
 * failure that put the writer there: the caller would get an exception where
 * the contract promises `write_failed`, about cleanup rather than about why the
 * record was not written. `force` excuses only an absent path. A regular file
 * where the destination needs a directory still fails the removal, with
 * `ENOTDIR` from the `lstat` Node takes of the temp path first.
 */
function removeTemp(fs: ResultWriterFs, temp: string): Error | undefined {
  try {
    fs.rmSync(temp, { force: true });
    return undefined;
  } catch (thrown) {
    return asError(thrown);
  }
}

/**
 * One validated result, published atomically.
 *
 * The order below is the contract, not an implementation detail. Every line
 * above `mkdirSync` is pure; every line below it can fail, and each failure
 * leaves the authoritative destination either untouched or completely replaced.
 */
export function writeVerificationResult(input: ResultWriteInput): ResultWriteOutcome {
  const fs = input.fs ?? nodeResultWriterFs;

  // -- PREFLIGHT. No filesystem mutation of any kind above the mkdir below. --

  // The authoritative validation path, and the only classifier of Invalid. A
  // throw here means the record does not exist, so there is nothing to write
  // and — crucially — nothing this function could write even if it tried.
  //
  // **Byte preparation is inside the same guard, and that is a contract
  // decision rather than caution.** `canonicalResultJson` and `resultSha256`
  // both re-parse through `verificationResultSchema`, so both can throw.
  // Neither can throw *today* — assembly has already parsed the same record —
  // but a return type that enumerates the failures leaves one of them reachable
  // only as an exception is a type a later caller builds on wrongly. Every
  // semantic failure of this function arrives as `{status:'invalid'}`, and
  // nothing about the guarded region touches the filesystem either way.
  let prepared: {
    result: VerificationResult;
    canonicalJson: string;
    bytes: string;
    resultSha256: string;
  };
  try {
    const result = assembleVerificationResult({
      run: input.run,
      requirement: input.requirement,
      registry: input.registry,
      registers: input.registers,
    });
    // The exact bytes, prepared in full before anything is created. Both come
    // from the record module's one canonical serialisation; the framing is this
    // module's, and it is added after the hash rather than before it.
    input.injectPreparationFailure?.();
    const canonicalJson = canonicalResultJson(result);
    prepared = {
      result,
      canonicalJson,
      bytes: `${canonicalJson}${RESULT_FILE_FRAMING}`,
      resultSha256: resultSha256(result),
    };
  } catch (thrown) {
    return { status: 'invalid', error: asError(thrown) };
  }

  const { result, canonicalJson, bytes } = prepared;
  const sha256 = prepared.resultSha256;

  // -- PUBLISH. ---------------------------------------------------------------

  const temp = tempPathFor(input.destination);

  try {
    fs.mkdirSync(dirname(input.destination), { recursive: true });
    fs.writeFileSync(temp, bytes);
  } catch (thrown) {
    // The temp file may be absent or partial; either way it is not the record
    // and must not be left behind. The destination has not been touched at all.
    const cleanupError = removeTemp(fs, temp);
    return {
      status: 'write_failed',
      stage: 'temp_write',
      error: asError(thrown),
      ...(cleanupError === undefined ? {} : { cleanupError }),
    };
  }

  try {
    fs.renameSync(temp, input.destination);
  } catch (thrown) {
    // The one atomic operation did not happen, so the destination is exactly
    // what it was — the previous result, or nothing.
    const cleanupError = removeTemp(fs, temp);
    return {
      status: 'write_failed',
      stage: 'publish',
      error: asError(thrown),
      ...(cleanupError === undefined ? {} : { cleanupError }),
    };
  }

  return {
    status: 'written',
    result,
    canonicalJson,
    bytes,
    resultSha256: sha256,
    path: input.destination,
  };
}
