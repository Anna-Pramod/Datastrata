/**
 * The atomic result writer, and the three outcome states as three states.
 *
 * **Every result written below came out of a real `runVerificationPipeline`
 * run.** Nothing here hand-builds a `VerificationResult` and hands it to the
 * writer: the fixtures control the role *responses*, and the reader gate, the
 * prosecutor gate, the coverage table, the adjudicator, the whole-run gap
 * canonicalisation, the deterministic tail and Task 5b's assembly all run for
 * real. A writer proved against a hand-built record would be a writer proved
 * against a shape the pipeline may not produce — the Task 4 pattern.
 *
 * Five filesystem cases, each proved independently, because each can pass for a
 * reason the others cannot expose:
 *
 * ```text
 * 1  A absent + valid B                   -> B authoritative, exact bytes, no residue
 * 2  A exists + valid B                   -> B replaces A, exact bytes, no residue
 * 3  A exists + invalid B                 -> A byte-identical, NO temp, no destination mutation
 * 4  A exists + valid B + publish failure -> A byte-identical, temp cleaned, failure returned
 * 5  A absent + valid B + publish failure -> no authoritative file, temp cleaned, failure returned
 * ```
 *
 * Case 5 is not a variant of case 4. Without it, a failure test passes by
 * relying on "the old file survived" when there was no old file — and a writer
 * that created the destination and then failed would look identical to one that
 * never touched it.
 *
 * Temp-write failure and publish failure are separated for the same reason:
 * they prove different stages. A temp-write failure shows the authoritative
 * path was never reached; a publish failure shows that once prepared bytes
 * exist, replacement is all-or-nothing.
 *
 * Every path below is inside a fresh `mkdtemp` root. Nothing in this file can
 * write into the repository.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sha256Hex } from '../src/corpus/hash';
import type { ReaderOutput } from '../src/pipeline/role-outputs';
import { NOT_INGESTED } from './pipeline-fixtures';
import {
  nodeResultWriterFs,
  RESULT_FILE_FRAMING,
  writeVerificationResult,
  type ResultWriteOutcome,
  type ResultWriterFs,
} from '../src/pipeline/write-result';
import {
  canonicalResultJson,
  parseVerificationResult,
  resultSha256,
  type VerificationResult,
} from '../src/verification/result';
import {
  EA_DOC,
  EA_TEXT,
  EP_DOC,
  EP_TEXT,
  evidenceR,
  prosecutionHalting,
  PROSECUTOR_GAP_MARK,
  readingOutput,
  REGISTERS,
  REGISTRY,
  REQUIREMENT,
  runPipeline,
  type RunOverrides,
} from './pipeline-run-fixtures';

const RESULT_FILE = 'verification-result.json';

let root: string;
let resultDir: string;
let destination: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'datastrata-writer-'));
  // The factory's own layout, under a temp root:
  // `verification/<packId>/<requirementId>/verification-result.json`.
  resultDir = join(root, 'verification', 'testpack', REQUIREMENT.id);
  destination = join(resultDir, RESULT_FILE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------

/** One real run, taken to the production writer. */
async function write(
  overrides: RunOverrides & {
    fs?: ResultWriterFs;
    destination?: string;
    injectPreparationFailure?: () => void;
  } = {},
): Promise<ResultWriteOutcome> {
  const { fs, destination: to, injectPreparationFailure, ...runOverrides } = overrides;
  const run = await runPipeline(runOverrides);
  return writeVerificationResult({
    run,
    requirement: runOverrides.requirement ?? REQUIREMENT,
    registry: REGISTRY,
    registers: REGISTERS,
    destination: to ?? destination,
    ...(fs === undefined ? {} : { fs }),
    ...(injectPreparationFailure === undefined ? {} : { injectPreparationFailure }),
  });
}

/** The message the injected byte-preparation failure carries. */
const PREPARATION_FAILURE = 'INJECTED byte-preparation failure';

/**
 * The outcome, or a marker saying the writer **threw** instead of returning one.
 *
 * Without this, a writer that let a semantic failure escape would red with the
 * raw error and the failure would read as "something went wrong" rather than as
 * "the contract says every semantic failure arrives as a value, and this one
 * did not".
 */
async function outcomeOrThrown(
  promise: Promise<ResultWriteOutcome>,
): Promise<ResultWriteOutcome | { status: 'threw'; error: Error }> {
  try {
    return await promise;
  } catch (thrown) {
    return { status: 'threw', error: thrown instanceof Error ? thrown : new Error(String(thrown)) };
  }
}

/**
 * The production filesystem with exactly one operation made to fail.
 *
 * A wrapper rather than a substitute: every operation that is not the injected
 * one runs against the real filesystem, so a failure test exercises the real
 * writer over real files and the surviving bytes below are bytes on disk.
 */
function failingAt(stage: 'temp_write' | 'publish'): ResultWriterFs {
  return {
    mkdirSync: (directory, options) => nodeResultWriterFs.mkdirSync(directory, options),
    writeFileSync: (path, data) => {
      if (stage === 'temp_write') throw new Error('INJECTED temp-write failure');
      nodeResultWriterFs.writeFileSync(path, data);
    },
    renameSync: (from, to) => {
      if (stage === 'publish') throw new Error('INJECTED publish failure');
      nodeResultWriterFs.renameSync(from, to);
    },
    rmSync: (path, options) => nodeResultWriterFs.rmSync(path, options),
  };
}

/** Everything in the destination directory, so residue cannot hide. */
function entriesInResultDir(): string[] {
  return existsSync(resultDir) ? readdirSync(resultDir).sort() : [];
}

/** The outcome, narrowed, or a failure naming what was expected instead. */
function written(outcome: ResultWriteOutcome): Extract<ResultWriteOutcome, { status: 'written' }> {
  if (outcome.status !== 'written') {
    throw new Error(`expected the writer to publish, and it returned ${outcome.status}: ${String((outcome as { error?: Error }).error)}`);
  }
  return outcome;
}

/**
 * A previous authoritative result, A, on disk — produced by the pipeline rather
 * than typed here.
 *
 * A gap-bearing dossier, because that is the real recovery path: a gap is
 * repaired and the rerun replaces the gap-bearing result with a complete one.
 * Its bytes are returned so "byte-identical" below is a comparison against what
 * was actually published rather than against a re-derivation.
 */
async function publishPriorResult(): Promise<string> {
  const outcome = written(await write({ prosecutor: prosecutionHalting() }));
  expect(outcome.result.gaps.length).toBeGreaterThan(0);
  return readFileSync(destination, 'utf8');
}

/**
 * A reading whose evidence quotes a hash the pinned corpus does not carry.
 *
 * Genuinely Invalid and genuinely **not** gap-bearing: the run completes, every
 * judgment container is populated, and the record fails the cross-field
 * evidence rule. Using a gap-bearing run as the invalid case would let gap
 * handling take the credit for "nothing was written".
 */
function readingWithUnpinnedEvidence(): ReaderOutput {
  return readingOutput({
    elements: [
      {
        id: 'RE-1',
        statement: 'The provision states a lower turnover bound.',
        // An absence claim over a document the record does not pin: every role
        // seam accepts it (the quote beside it is pinned, so absence is not the
        // sole evidence) and only `assertResultConsistency` refuses it. A quote
        // at a wrong hash would not do since the r2 repair: the reader's seam
        // refuses that itself (`pipeline-quote-pins.test.ts`).
        evidence: [evidenceR(EP_DOC), { kind: 'absence', docIds: [NOT_INGESTED], term: 'a term no record pins' }],
      },
      {
        id: 'RE-2',
        statement: 'The provision states an obligation the encoding does not carry.',
        evidence: [evidenceR('DOC-B')],
      },
    ],
  });
}

/**
 * What the file must contain, derived from the **record contract** rather than
 * from the writer.
 *
 * `readFileSync(destination) === outcome.bytes` compares the writer against
 * itself: a writer that consistently prepared *and* reported the wrong bytes
 * satisfies it. The oracle here is `canonicalResultJson` — the one canonical
 * serialisation `resultSha256` is the digest of — plus the file framing written
 * as a literal, so neither half of the expected value comes from the module
 * under test. That independence is the same property Task 5b.2's completeness
 * oracle turned on: an expected value derived from the code being mutated
 * proves nothing.
 *
 * Both claims are kept. The self-comparison says "what it reported is what it
 * wrote"; this one says "what it wrote is what the contract says it must be".
 */
function authoritativeBytesFor(result: VerificationResult): string {
  return `${canonicalResultJson(result)}\n`;
}

// ---------------------------------------------------------------------------
// The five filesystem cases
// ---------------------------------------------------------------------------

describe('case 1 — no existing result, and a valid one is published', () => {
  it('creates the destination and writes exactly the prepared bytes, with no residue', async () => {
    expect(existsSync(destination)).toBe(false);

    const outcome = written(await write());

    expect(existsSync(destination)).toBe(true);
    // The bytes on disk are the bytes the writer prepared — not merely a file
    // that parses to the same record. Semantic equality would be satisfied by
    // a second serialiser that agrees today.
    expect(readFileSync(destination, 'utf8')).toBe(outcome.bytes);
    // The publish left nothing behind. A `.tmp` here would mean the temp file
    // is not the thing that got renamed.
    expect(entriesInResultDir()).toEqual([RESULT_FILE]);
  });
});

describe('case 2 — an existing result is atomically replaced', () => {
  it('replaces A with B byte for byte, and leaves no residue', async () => {
    const priorBytes = await publishPriorResult();

    const outcome = written(await write());

    const onDisk = readFileSync(destination, 'utf8');
    expect(onDisk).toBe(outcome.bytes);
    // A is gone rather than merged into, appended to, or partially overwritten.
    expect(onDisk).not.toBe(priorBytes);
    // And what replaced it is the Complete record, not a second gap-bearing one.
    expect(outcome.result.gaps).toEqual([]);
    expect(entriesInResultDir()).toEqual([RESULT_FILE]);
  });
});

describe('case 3 — an invalid result never reaches the filesystem', () => {
  it('leaves an existing result byte-identical, creates no temp file, and mutates nothing', async () => {
    const priorBytes = await publishPriorResult();

    const outcome = await write({ reader: readingWithUnpinnedEvidence() });

    expect(outcome.status).toBe('invalid');
    // Soft, so a mutant that both damages A and leaves residue names both.
    expect.soft(readFileSync(destination, 'utf8')).toBe(priorBytes);
    expect.soft(entriesInResultDir()).toEqual([RESULT_FILE]);
  });

  it('does not even create the destination directory when there is no prior result', async () => {
    // The sharpest form of the preflight boundary: with no prior file, "A is
    // unchanged" is vacuous, and the only observable is whether the writer
    // touched the filesystem at all before it knew the record was valid.
    expect(existsSync(resultDir)).toBe(false);

    const outcome = await write({ reader: readingWithUnpinnedEvidence() });

    expect(outcome.status).toBe('invalid');
    expect.soft(existsSync(resultDir)).toBe(false);
    expect.soft(existsSync(destination)).toBe(false);
  });

  it('names the record rule it refused for, rather than a filesystem problem', async () => {
    const outcome = await write({ reader: readingWithUnpinnedEvidence() });
    if (outcome.status !== 'invalid') throw new Error('expected the writer to refuse');
    // "Nothing was written" is only evidence if the reason is the record's.
    expect(String(outcome.error)).toContain(`absence claim names docId ${NOT_INGESTED}, which no entry in corpus[] pins`);
  });
});

describe('case 4 — publication fails over an existing result', () => {
  it('leaves A byte-identical, cleans the temp file, and returns the failure', async () => {
    const priorBytes = await publishPriorResult();

    const outcome = await write({ fs: failingAt('publish') });

    // First, and soft: this is the atomicity claim. A writer that wrote
    // straight to the destination would red here even though the injected
    // failure never fired.
    expect.soft(readFileSync(destination, 'utf8')).toBe(priorBytes);
    expect.soft(entriesInResultDir()).toEqual([RESULT_FILE]);
    expect(outcome.status).toBe('write_failed');
    if (outcome.status !== 'write_failed') return;
    expect(outcome.stage).toBe('publish');
    expect(String(outcome.error)).toContain('INJECTED publish failure');
  });
});

describe('case 5 — publication fails with no existing result', () => {
  it('leaves no authoritative file at all, cleans the temp file, and returns the failure', async () => {
    expect(existsSync(destination)).toBe(false);

    const outcome = await write({ fs: failingAt('publish') });

    // Nothing may stand where the result goes. Without this case, case 4 could
    // pass on the strength of a file the writer never had to protect.
    expect.soft(existsSync(destination)).toBe(false);
    // The directory exists — it was created before the temp write — and holds
    // nothing. Residue here would be a half-written record beside the record.
    expect.soft(entriesInResultDir()).toEqual([]);
    expect(outcome.status).toBe('write_failed');
    if (outcome.status !== 'write_failed') return;
    expect(outcome.stage).toBe('publish');
  });
});

describe('a temp-write failure is a different stage from a publish failure', () => {
  it('reports temp_write, and the authoritative path was never touched', async () => {
    const priorBytes = await publishPriorResult();

    const outcome = await write({ fs: failingAt('temp_write') });

    expect(outcome.status).toBe('write_failed');
    if (outcome.status !== 'write_failed') return;
    // The two stages are the evidence that the failure seam distinguishes
    // "the bytes never landed anywhere" from "the bytes landed and the swap
    // did not happen".
    expect(outcome.stage).toBe('temp_write');
    expect(String(outcome.error)).toContain('INJECTED temp-write failure');
    expect.soft(readFileSync(destination, 'utf8')).toBe(priorBytes);
    expect.soft(entriesInResultDir()).toEqual([RESULT_FILE]);
  });

  it('reports temp_write with no prior result, and creates no authoritative file', async () => {
    const outcome = await write({ fs: failingAt('temp_write') });

    expect(outcome.status).toBe('write_failed');
    if (outcome.status !== 'write_failed') return;
    expect(outcome.stage).toBe('temp_write');
    expect.soft(existsSync(destination)).toBe(false);
    expect.soft(entriesInResultDir()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Byte preparation fails inside the guard, and before the filesystem
// ---------------------------------------------------------------------------

/**
 * The committed tooth for Minor 1.
 *
 * `canonicalResultJson` and `resultSha256` both re-parse through
 * `verificationResultSchema`, so both can throw. Moving them inside the
 * validation guard was the fix; until this test existed the fix was defended by
 * a mutation run once rather than by the suite — the call-site rule applied to
 * the fix itself.
 *
 * **The claim is stronger than "it returned a value instead of throwing".**
 * Byte preparation sits before every filesystem call, so its failure must leave
 * the filesystem *untouched*, not merely leave the previous result intact. Both
 * shapes are proved because they fail differently, and the second is the only
 * one where "the directory was never created" is observable at all.
 */
describe('a byte-preparation failure is returned, and the filesystem is never touched', () => {
  it('with a prior result: returns invalid, leaves A byte-identical, and leaves no residue', async () => {
    const priorBytes = await publishPriorResult();

    const outcome = await outcomeOrThrown(
      write({
        injectPreparationFailure: () => {
          throw new Error(PREPARATION_FAILURE);
        },
      }),
    );

    // Mapped as intended rather than thrown. A red here reading 'threw' names
    // the escape the guard exists to prevent.
    expect(outcome.status).toBe('invalid');
    if (outcome.status !== 'invalid') return;
    expect(String(outcome.error)).toContain(PREPARATION_FAILURE);
    expect.soft(readFileSync(destination, 'utf8')).toBe(priorBytes);
    expect.soft(entriesInResultDir()).toEqual([RESULT_FILE]);
  });

  it('with no prior result: returns invalid, and the destination directory is not created', async () => {
    // The substantive claim. With no prior file, "A survived" is vacuous, and
    // the only observable is whether any filesystem operation happened at all.
    expect(existsSync(resultDir)).toBe(false);

    const outcome = await outcomeOrThrown(
      write({
        injectPreparationFailure: () => {
          throw new Error(PREPARATION_FAILURE);
        },
      }),
    );

    expect(outcome.status).toBe('invalid');
    expect.soft(existsSync(resultDir)).toBe(false);
    expect.soft(existsSync(destination)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// COMPLETE — the positive control, driven through the whole deterministic path
// ---------------------------------------------------------------------------

describe('COMPLETE — a full dossier is written and reads back as itself', () => {
  it('writes the validated record, and the file bytes are the prepared bytes', async () => {
    const outcome = written(await write());
    const result = outcome.result;

    // Complete: every judgment container carries something and no gap does.
    expect(result.gaps).toEqual([]);
    expect(result.reading.elements.length).toBeGreaterThan(0);
    expect(result.coverage.cells.length).toBeGreaterThan(0);
    expect(result.challenges.length).toBeGreaterThan(0);

    const onDisk = readFileSync(destination, 'utf8');
    // The independent oracle first, so a serialisation defect names the byte
    // mismatch rather than being masked by the writer agreeing with itself.
    // Soft, so a serialisation defect is reported as a byte mismatch *and* the
    // readback below still runs — the two together are what show the defect is
    // invisible to semantic validation.
    expect.soft(onDisk).toBe(authoritativeBytesFor(result));
    // The weaker, self-consistent claim, kept: what it reported is what it wrote.
    expect.soft(onDisk).toBe(outcome.bytes);

    // Re-validated from the file rather than trusted from memory: what a
    // consumer will read is a record the current schema and the current
    // cross-field rules accept.
    const readback = parseVerificationResult(JSON.parse(onDisk), REGISTERS);
    expect(readback).toEqual(result);
  });

  it('keeps resultSha256 identical across the write and the readback', async () => {
    const outcome = written(await write());
    const before = resultSha256(outcome.result);
    expect(outcome.resultSha256).toBe(before);

    const readback = parseVerificationResult(JSON.parse(readFileSync(destination, 'utf8')), REGISTERS);
    // The number a signature pins does not move by being stored and read back.
    expect(resultSha256(readback)).toBe(before);
  });

  it('preserves E-P and E-A separately, through the file', async () => {
    written(await write());
    const readback = parseVerificationResult(JSON.parse(readFileSync(destination, 'utf8')), REGISTERS);

    expect(readback.challenges.length).toBeGreaterThan(0);
    for (const challenge of readback.challenges) {
      // E-P: the prosecutor's basis. Named by document and by text, so this
      // assertion cannot fire for the opposite crossing.
      const prosecuted = challenge.evidence.map((item) => item as { docId: string; text: string });
      expect.soft(prosecuted.map((item) => item.docId)).toEqual([EP_DOC]);
      expect.soft(prosecuted.map((item) => item.text)).toEqual([EP_TEXT]);

      // E-A: the adjudicator's basis. A different document and different words.
      const adjudicated = challenge.adjudicationEvidence.map((item) => item as { docId: string; text: string });
      expect.soft(adjudicated.map((item) => item.docId)).toEqual([EA_DOC]);
      expect.soft(adjudicated.map((item) => item.text)).toEqual([EA_TEXT]);
    }
  });
});

// ---------------------------------------------------------------------------
// GAP-BEARING — a later-role gap, written
// ---------------------------------------------------------------------------

describe('GAP-BEARING — a canonical gap dossier is written like any other', () => {
  it('writes a prosecutor-origin gap result with all four judgment containers empty', async () => {
    // A *later-role* gap on purpose. Reader-origin is the one position where
    // the record invariant held incidentally, and it is what masked the defect
    // Task 5b.3 fixed. How each origin becomes canonical is 5b.3's proof; what
    // this asserts is that the writer publishes the canonical dossier.
    const outcome = written(await write({ prosecutor: prosecutionHalting() }));
    const result = outcome.result;

    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps[0]!.detail).toContain(PROSECUTOR_GAP_MARK);
    expect.soft(result.reading.elements).toEqual([]);
    expect.soft(result.coverage.cells).toEqual([]);
    expect.soft(result.challenges).toEqual([]);
    expect.soft(result.openQuestions).toEqual([]);

    // Written, and readable as a result rather than as a note about a failure.
    const onDisk = readFileSync(destination, 'utf8');
    // Same independent oracle as the Complete control: a canonical gap dossier
    // is stored by exactly the same byte contract as any other record.
    expect.soft(onDisk).toBe(authoritativeBytesFor(result));
    expect.soft(onDisk).toBe(outcome.bytes);
    const readback = parseVerificationResult(JSON.parse(onDisk), REGISTERS);
    expect(readback).toEqual(result);
    expect(readback.gaps[0]!.detail).toContain(PROSECUTOR_GAP_MARK);
  });
});

// ---------------------------------------------------------------------------
// INVALID, beside its positive control
// ---------------------------------------------------------------------------

describe('INVALID never writes, and the writer that never writes is excluded', () => {
  it('writes the valid one and refuses the invalid one, in the same directory', async () => {
    // The pairing is the point. "No file written" passes trivially for a writer
    // that never writes; the first half is what makes the second half evidence.
    const valid = written(await write());
    expect(readFileSync(destination, 'utf8')).toBe(valid.bytes);

    const invalid = await write({ reader: readingWithUnpinnedEvidence() });
    expect(invalid.status).toBe('invalid');
    expect.soft(readFileSync(destination, 'utf8')).toBe(valid.bytes);
    expect.soft(entriesInResultDir()).toEqual([RESULT_FILE]);
  });
});

// ---------------------------------------------------------------------------
// Canonical bytes versus filesystem bytes
// ---------------------------------------------------------------------------

describe('the hashed text and the stored bytes are deliberately different', () => {
  it('hashes the canonical text and stores it plus the file framing', async () => {
    const outcome = written(await write());
    const result = outcome.result;

    // One serialisation, from the record module. Not a second formatter here.
    expect(outcome.canonicalJson).toBe(canonicalResultJson(outcome.result));
    expect(outcome.bytes).toBe(`${outcome.canonicalJson}${RESULT_FILE_FRAMING}`);
    expect(outcome.bytes).not.toBe(outcome.canonicalJson);

    // The framing is storage, and it is outside the hash. If it were inside,
    // adopting or dropping a trailing newline would move what a signature pins.
    //
    // THE CONTROL, and it comes first: both operands are the record module's,
    // so nothing the writer computed can satisfy it. The assertion below is the
    // same shape the byte assertions had before round 2 — `sha256Hex(x)` and
    // `resultSha256` both read off `outcome`, the writer's own report — and a
    // writer that computed the canonical text and its digest consistently wrong
    // satisfies it. Kept, because it says something weaker but true: what the
    // writer reported about its text and its hash agree with each other.
    expect.soft(resultSha256(result)).toBe(sha256Hex(canonicalResultJson(result)));
    expect.soft(sha256Hex(outcome.canonicalJson)).toBe(outcome.resultSha256);
    expect.soft(sha256Hex(outcome.bytes)).not.toBe(outcome.resultSha256);

    const onDisk = readFileSync(destination, 'utf8');
    expect(onDisk.endsWith(RESULT_FILE_FRAMING)).toBe(true);
    expect(onDisk.slice(0, -RESULT_FILE_FRAMING.length)).toBe(outcome.canonicalJson);
  });
});

// ---------------------------------------------------------------------------
// The precondition the atomicity claim rests on
// ---------------------------------------------------------------------------

describe('the publish is one rename within one directory', () => {
  it('stages the temp file beside the destination and promotes it exactly once', async () => {
    // `rename` is atomic only within a filesystem, so a temp file staged
    // anywhere else would make the publish a cross-device copy — non-atomic,
    // and able to leave a half-written authoritative file exactly where this
    // design promises there can never be one. Nothing else in this file can
    // observe that: on this machine the OS temp directory and the test root are
    // the same filesystem, so a misplaced temp file would still rename cleanly
    // and every case above would stay green. Direct contract, deliberately.
    const staged: string[] = [];
    const promoted: [string, string][] = [];
    const recording: ResultWriterFs = {
      mkdirSync: (directory, options) => nodeResultWriterFs.mkdirSync(directory, options),
      writeFileSync: (path, data) => {
        staged.push(path);
        nodeResultWriterFs.writeFileSync(path, data);
      },
      renameSync: (from, to) => {
        promoted.push([from, to]);
        nodeResultWriterFs.renameSync(from, to);
      },
      rmSync: (path, options) => nodeResultWriterFs.rmSync(path, options),
    };

    const outcome = written(await write({ fs: recording }));

    expect(staged).toHaveLength(1);
    expect(staged[0]).not.toBe(destination);
    expect(dirname(staged[0]!)).toBe(dirname(destination));
    // One publish, from that staged file to the destination. Two renames would
    // mean an intermediate state a reader could observe.
    expect(promoted).toEqual([[staged[0], destination]]);
    expect(readFileSync(destination, 'utf8')).toBe(outcome.bytes);
  });
});

// ---------------------------------------------------------------------------
// The destination is somebody else's to choose
// ---------------------------------------------------------------------------

describe('the writer publishes where it is told', () => {
  it('creates missing parent directories under the given destination', async () => {
    const deeper = join(root, 'a', 'b', 'c', RESULT_FILE);
    expect(existsSync(dirname(deeper))).toBe(false);

    const outcome = written(await write({ destination: deeper }));

    expect(readFileSync(deeper, 'utf8')).toBe(outcome.bytes);
    expect(readdirSync(dirname(deeper))).toEqual([RESULT_FILE]);
  });

  it('publishes into a directory that already holds unrelated files, without disturbing them', async () => {
    // The temp file lands in this directory, so a cleanup that removed more
    // than its own temp file would be visible here.
    mkdirSync(resultDir, { recursive: true });
    writeFileSync(join(resultDir, 'notes.md'), 'a human left this here\n', 'utf8');

    written(await write());

    expect(entriesInResultDir()).toEqual(['notes.md', RESULT_FILE]);
    expect(readFileSync(join(resultDir, 'notes.md'), 'utf8')).toBe('a human left this here\n');
  });
});
