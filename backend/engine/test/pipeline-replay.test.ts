/**
 * Replay — a recorded run, driven back through the production path.
 *
 * Every run in this file goes through **`dispatch(['run', …])`** and nothing
 * beside it. Nothing here hand-builds a `VerificationResult`, constructs a
 * result path, serialises a record, or reads a transcript into anything but a
 * replay capability. What replay replaces is one thing — where a role's response
 * text comes from — and the point of driving it through `verify run` is that
 * everything else is demonstrably the same machinery:
 *
 * ```text
 * committed transcript -> replayFromRoot -> dispatch run -> readWorld
 *                      -> EntitledClosure -> runVerificationPipeline
 *                      -> assembleVerificationResult -> writeVerificationResult
 *                      -> verification-result.json
 * ```
 *
 * # What the assertions are worth
 *
 * Task 5c's lesson, applied again: an oracle derived from the thing it checks
 * agrees with a consistently wrong implementation, and the sentence *claiming*
 * independence needs the same scrutiny as the assertion it describes. So:
 *
 *  - **The determinism proof compares the two runs' bytes off disk**, read back
 *    with `readFileSync` from two roots neither run knew about. Neither side is
 *    a value a run reported about itself. Genuinely toothed.
 *  - **`resultSha256(readback)` against the hash the CLI printed** is toothed
 *    for the same reason it is in `cli-run.test.ts`: a value computed before the
 *    write, against a digest recomputed from the file on disk.
 *  - **Bytes on disk against `canonicalResultJson(readback) + framing`** is a
 *    canonical *fixpoint* check and **not an independent oracle** — the writer
 *    calls those same two functions. It has teeth against non-canonical
 *    publication and no unique kill here. Labelled, not claimed.
 *  - **The semantic-mutation test names the field it expects to move before it
 *    looks at any hash.** `hash A !== hash B` on its own is not evidence that
 *    the mutation was the cause.
 *
 * # Why the adjudicator is the role that gets mutated
 *
 * A transcript records one coherent run, and every role after the first is shown
 * what the roles before it produced. So changing the reader's answer changes the
 * prosecutors' *question*, and their recordings — which answer the original
 * question — stop binding. That is correct behaviour, and it is proved here in
 * its own test. It also means the adjudicator is the only role whose output can
 * be changed with every binding still intact, because nothing is shown its
 * answer. The semantic-mutation proof therefore moves an adjudication, and the
 * cascade gets its own proof rather than being mistaken for a bug.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { EXIT_OK, EXIT_REFUSED } from '../src/cli/exit-codes';
import { resultPath, type VerifyPaths } from '../src/cli/sign';
import { dispatch } from '../src/cli/verify';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import {
  AgentCapabilityError,
  createLiveAgentRunner,
  liveAgentsEnabled,
  MissingProviderAdapterError,
  LIVE_AGENTS_ENV,
} from '../src/pipeline/live-runner';
import {
  ProsecutorTranscriptMissingError,
  qualifiedChallengeId,
} from '../src/pipeline/prosecutors';
import {
  replayCapability,
  replayFromRoot,
  replayRunner,
  readTranscriptsFor,
  TranscriptAmbiguousRunError,
  TranscriptDuplicateExchangeError,
  TranscriptLensMismatchError,
  TranscriptMisfiledError,
  TranscriptUnboundError,
  TranscriptReplayError,
  TranscriptExchangeReusedError,
  TranscriptRequestMismatchError,
  TranscriptRunMismatchError,
  TranscriptUnconsumedError,
  bindingDifferences,
} from '../src/pipeline/replay';
import { recordedRequest, requestSha256 } from '../src/pipeline/request-identity';
import { RoleOutputError } from '../src/pipeline/roles';
import { UnverifiedProviderAdapterError } from '../src/pipeline/provider-adapter';
import {
  parseRunTranscript,
  serialiseTranscript,
  TranscriptIntegrityError,
  TRANSCRIPT_ROOT,
  TRANSCRIPT_SCHEMA_VERSION,
  transcriptPath,
  writeRunTranscript,
  type RoleTranscript,
  type RunTranscript,
} from '../src/pipeline/transcript';
import { RESULT_FILE_FRAMING } from '../src/pipeline/write-result';
import {
  canonicalResultJson,
  resultSha256,
  verificationResultSchema,
  type VerificationResult,
} from '../src/verification/result';
import { installNetworkTrap, type NetworkTrap } from './helpers';
import { installRealRegister } from './world-register';
import { SYNTHETIC_ADAPTER_V1 } from './synthetic-adapters';
import type { ProviderAdapter } from '../src/pipeline/provider-adapter';
import {
  captureLiveRun,
  liveCaptureConfigFrom,
  LiveCaptureConfigError,
  LIVE_API_KEY_ENV,
  LIVE_ENDPOINT_ENV,
} from './live-capture';
import { LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV } from '../src/cli/live-wiring';
import {
  engineRoot,
  FIXTURE_TRANSCRIPT_ROOT,
  SUPERSEDED_RUN_IDS,
  RETIRED,
  PACK_ID,
  READING_ONE,
  REQUIREMENT_ID,
  RESOLUTION,
} from './replay-fixtures';

/** A second requirement, used only as the wrong question to ask. */
const OTHER_REQUIREMENT_ID = 'CSRD-S-008';

let worldRoot = '';
let world = '';
let verificationDir = '';
let trap: NetworkTrap;

// ---------------------------------------------------------------------------
// The world, and the committed recording
// ---------------------------------------------------------------------------

beforeAll(() => {
  worldRoot = mkdtempSync(join(tmpdir(), 'replay-world-'));
  world = join(worldRoot, 'connected');
  mkdirSync(join(world, 'knowledge'), { recursive: true });
  cpSync(join(engineRoot, 'knowledge', PACK_ID), join(world, 'knowledge', PACK_ID), {
    recursive: true,
  });
  cpSync(join(engineRoot, 'corpus'), join(world, 'corpus'), { recursive: true });
  // A runtime world is incomplete without the register: `loadPack` refuses
  // without one, since requirement-side citability is checked against it.
  installRealRegister(world);
});

afterAll(() => {
  rmSync(worldRoot, { recursive: true, force: true });
});

beforeEach(() => {
  verificationDir = mkdtempSync(join(tmpdir(), 'replay-out-'));
  mkdirSync(join(verificationDir, 'requirement-versions'), { recursive: true });
  cpSync(
    join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`),
    join(verificationDir, 'requirement-versions', `${PACK_ID}.json`),
  );
  trap = installNetworkTrap();
});

afterEach(() => {
  trap.restore();
  rmSync(verificationDir, { recursive: true, force: true });
});

function pathsFor(outDir: string): VerifyPaths {
  return {
    packDir: join(world, 'knowledge', PACK_ID),
    corpusDir: join(world, 'corpus'),
    verificationDir: outDir,
  };
}

/**
 * The current-generation recording.
 *
 * The directory holds more than one now: the provenance migration retired the
 * pre-migration recording without deleting it, so the fixture carries every
 * generation and `SUPERSEDED_RUN_IDS` says which are history. Selecting by
 * "the only file" stopped being possible then, and selecting by *position*
 * would be the very thing `readTranscriptsFor` refuses to do.
 */
function committed(): RunTranscript {
  const found = readTranscriptsFor(FIXTURE_TRANSCRIPT_ROOT, PACK_ID, REQUIREMENT_ID);
  const current = found.filter((t) => !SUPERSEDED_RUN_IDS.includes(t.runId));
  expect(current).toHaveLength(1);
  return current[0]!;
}

/**
 * A retired recording, selected by the identity it is filed under — never by
 * position. With several retired generations, `retired[0]` would answer a
 * different question depending on directory order, which is the selection
 * `readTranscriptsFor` itself refuses to make.
 */
function supersededById(runId: string): RunTranscript {
  expect(SUPERSEDED_RUN_IDS).toContain(runId);
  const found = readTranscriptsFor(FIXTURE_TRANSCRIPT_ROOT, PACK_ID, REQUIREMENT_ID);
  const retired = found.filter((t) => SUPERSEDED_RUN_IDS.includes(t.runId));
  expect(retired).toHaveLength(SUPERSEDED_RUN_IDS.length);
  const match = retired.find((t) => t.runId === runId);
  if (match === undefined) throw new Error(`no retired recording is filed under ${runId}`);
  return match;
}

/** A temporary transcript root holding whatever a test wants to offer. */
function transcriptRootWith(
  transcripts: readonly RunTranscript[],
  requirementId = REQUIREMENT_ID,
): string {
  const root = mkdtempSync(join(tmpdir(), 'replay-transcripts-'));
  for (const transcript of transcripts) {
    mkdirSync(join(root, transcript.packId, requirementId), { recursive: true });
    writeFileSync(
      transcriptPath(root, transcript.packId, requirementId, transcript.runId),
      serialiseTranscript(transcript),
      'utf8',
    );
  }
  return root;
}

/** The production command path, exactly as `verify.ts` reaches it. */
function verifyRun(
  outDir: string,
  requirementId: string,
  transcriptRoot: string,
): Promise<{ exitCode: number; lines: string[] }> {
  return dispatch(['run', PACK_ID, requirementId], pathsFor(outDir), () => true, undefined, {
    runner: replayFromRoot(transcriptRoot, PACK_ID, requirementId),
  });
}

/** The published record, re-read from disk and re-parsed by the record contract. */
function readback(path: string): VerificationResult {
  return verificationResultSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** The binding a run over this recording's own question would present. */
function bindingOf(transcript: RunTranscript) {
  return {
    runId: transcript.runId,
    packId: transcript.packId,
    requirementId: transcript.requirementId,
    pipelineVersion: transcript.pipelineVersion,
    requirementInputSha256: transcript.requirementInputSha256,
    renderedConditionSha256: transcript.renderedConditionSha256,
    corpusClosureSha256: transcript.corpusClosureSha256,
  };
}

/**
 * Sets a recorded answer, in **both** places a recording holds it.
 *
 * A real exchange records the reply once as the trailing `agent` message and
 * once as `outputJson`, and `parseRunTranscript` now refuses a recording where
 * they disagree. So a test forging a different answer must forge a *coherent*
 * one — otherwise it is refused at the read boundary and proves nothing about
 * the layer it names. That is the point of the self-integrity check, and every
 * forgery below is built through this helper because of it.
 */
function withOutputJson(entry: RoleTranscript, outputJson: string): RoleTranscript {
  return {
    ...entry,
    outputJson,
    messages: entry.messages.map((message) =>
      message.from === 'agent' ? { ...message, content: outputJson } : message,
    ),
  };
}

/**
 * Re-seals every entry's request digest against its own recorded messages.
 *
 * For forgeries that change what a role was *asked* — a swapped lens, a moved
 * index, an edited input — rather than what it answered. Without this the
 * forgery is internally inconsistent and dies at the read boundary; with it the
 * transcript is a perfectly coherent recording of a different question, which is
 * the case each replay-binding test actually needs to make.
 *
 * Uses the production digest, deliberately: this is fixture *construction*, and
 * what each test asserts is which refusal arrives, never a digest value.
 *
 * Takes a predicate rather than re-sealing everything, so it cannot quietly
 * repair an entry the test did not forge — a blanket re-seal would make an
 * unrelated bad digest in the fixture invisible to exactly the check that exists
 * to find one.
 */
function resealed(
  transcript: RunTranscript,
  forged: (entry: RoleTranscript) => boolean,
): RunTranscript {
  return {
    ...transcript,
    roles: transcript.roles.map((entry) =>
      forged(entry) ? { ...entry, requestSha256: requestSha256(recordedRequest(entry)) } : entry,
    ),
  };
}

/** Replaces one role entry, leaving every other byte of the recording alone. */
function withRole(
  transcript: RunTranscript,
  match: (entry: RoleTranscript) => boolean,
  replace: (entry: RoleTranscript) => RoleTranscript,
): RunTranscript {
  return {
    ...transcript,
    roles: transcript.roles.map((entry) => (match(entry) ? replace(entry) : entry)),
  };
}

// ---------------------------------------------------------------------------
// The recording itself
// ---------------------------------------------------------------------------

describe('the committed replay fixture', () => {
  it('is a valid 1.1.0 transcript, filed beside the generation it retired', () => {
    const transcript = committed();
    expect(transcript.transcriptSchemaVersion).toBe(TRANSCRIPT_SCHEMA_VERSION);
    expect(transcript.packId).toBe(PACK_ID);
    expect(transcript.requirementId).toBe(REQUIREMENT_ID);
    // The filename matches the id the file declares. This is a *self*-agreement
    // check and proves nothing about derivation on its own — `readTranscriptsFor`
    // enforces the filing rule (tested below), and derivation is established by
    // the fact that `bind` matches during a real `verifyRun`.
    //
    // Two files, not one. The directory used to hold exactly one recording; the
    // provenance migration retired the first without deleting it, because a
    // recording is evidence of an execution and deleting it would erase the
    // only record of what the pipeline produced under the previous provenance.
    // Both are named here so a third arriving unannounced is a red.
    const files = readdirSync(join(FIXTURE_TRANSCRIPT_ROOT, PACK_ID, REQUIREMENT_ID));
    expect(files.filter((file) => file.endsWith('.json')).sort()).toEqual(
      [`${transcript.runId}.json`, ...SUPERSEDED_RUN_IDS.map((id) => `${id}.json`)].sort(),
    );
    // The provenance note the recorder writes beside it, so the directory says
    // what the recording is without anybody having to find this test.
    expect(files).toContain('PROVENANCE.md');
  });

  it('preserves every retired recording byte-for-byte', () => {
    // "Retired, not deleted" made checkable. Each digest is of the file exactly
    // as it was recorded before the migration that retired it; a re-record
    // that overwrote either, or any edit at all, reddens here.
    const digestOf = (runId: string) =>
      createHash('sha256')
        .update(readFileSync(transcriptPath(FIXTURE_TRANSCRIPT_ROOT, PACK_ID, REQUIREMENT_ID, runId)))
        .digest('hex');
    expect(digestOf(RETIRED.preD1a)).toBe('91ad7485be3572062b9af245127eab5ee6fd4ba574baeb9475a4876586e167c9');
    expect(digestOf(RETIRED.provenanceEra)).toBe('84e3d2ca67f22717f738e3ffb04fd40c2c7436a2cf2193d6b111fde701435b60');
    expect(digestOf(RETIRED.standingEra)).toBe('534ffe431d4cc380fc1e441b70f79cda45c65ed23572e223a11ace80a6e5f888');
    expect(digestOf(RETIRED.promptEra)).toBe('0d71e28a897aeba1f9e2d2818a24e44b740eeaa753ec266fff202e9188e3a8d7');
    expect(SUPERSEDED_RUN_IDS).toEqual([RETIRED.preD1a, RETIRED.provenanceEra, RETIRED.standingEra, RETIRED.promptEra]);
  });

  it('records one exchange per configured execution, each bound', () => {
    const transcript = committed();
    // Derived from the configuration the production command runs, never a
    // hard-coded 5 — a count written here would stop tracking the config.
    expect(transcript.roles).toHaveLength(2 + DEFAULT_ROLE_CONFIG.prosecutorCount);
    for (const entry of transcript.roles) {
      expect.soft(entry.requestSha256).toMatch(/^[0-9a-f]{64}$/);
      expect.soft(entry.messages.length).toBeGreaterThan(0);
      // The lens is present exactly where a lens exists, and nowhere else.
      expect.soft(entry.lens === undefined).toBe(entry.role !== 'prosecutor');
    }
  });

  it('the prosecutors’ recorded lenses are the configured sequence, in order', () => {
    const lenses = committed()
      .roles.filter((entry) => entry.role === 'prosecutor')
      .map((entry) => entry.lens);
    expect(lenses).toEqual(
      DEFAULT_ROLE_CONFIG.lenses.slice(0, DEFAULT_ROLE_CONFIG.prosecutorCount),
    );
  });

  it('lives where the artifact-hygiene guard actually refuses to ship from', async () => {
    expect(TRANSCRIPT_ROOT.split(sep)[0]).toBe('test');

    // Driven through the real guard rather than matched against the prose of
    // its `label:` field. A test asserting the label stays green when the
    // `matches` predicate beside it is deleted — the exact silent twin the
    // evidence standard names.
    const { assertArtifactHygiene } = (await import(
      join(engineRoot, '..', '..', 'scripts', 'standalone-harness.mjs')
    )) as { assertArtifactHygiene(dir: string): void };

    const artifact = mkdtempSync(join(tmpdir(), 'hygiene-probe-'));
    try {
      const engine = join(artifact, 'backend', 'engine');
      // The guard's own positive control: authored knowledge must be present,
      // or every absence below it is satisfied vacuously.
      mkdirSync(join(engine, 'knowledge', PACK_ID), { recursive: true });
      writeFileSync(join(engine, 'knowledge', PACK_ID, 'pack.json'), '{}', 'utf8');
      expect(() => assertArtifactHygiene(artifact)).not.toThrow();

      // Now a transcript at the path this task files them under.
      mkdirSync(join(engine, TRANSCRIPT_ROOT, PACK_ID, REQUIREMENT_ID), { recursive: true });
      writeFileSync(
        join(engine, TRANSCRIPT_ROOT, PACK_ID, REQUIREMENT_ID, 'run-v1-probe.json'),
        '{}',
        'utf8',
      );
      expect(() => assertArtifactHygiene(artifact)).toThrow(/ARTIFACT HYGIENE FAILED/);
    } finally {
      rmSync(artifact, { recursive: true, force: true });
    }
  });

  it('carries no credential-shaped material, by a check that can find one', () => {
    const FORBIDDEN = ['x-api-key', 'authorization', 'sk-ant', 'Bearer ', 'api_key'];
    const scan = (text: string): string[] =>
      FORBIDDEN.filter((needle) => text.toLowerCase().includes(needle.toLowerCase()));

    // The positive control first. Today's fixture was produced by a synthetic
    // capability that never held a credential, so "no matches" would be true of
    // any check at all, including a broken one — evidence-standard failure mode
    // 7. This is a tripwire for a *future live* capture, so what has to be shown
    // is that the tripwire trips.
    const planted = `${readFileSync(
      transcriptPath(FIXTURE_TRANSCRIPT_ROOT, PACK_ID, REQUIREMENT_ID, committed().runId),
      'utf8',
    ).slice(0, 2000)}\n"x-api-key": "sk-ant-planted"`;
    expect(scan(planted)).toContain('x-api-key');
    expect(scan(planted)).toContain('sk-ant');

    // And only then the absence.
    const text = readFileSync(
      transcriptPath(FIXTURE_TRANSCRIPT_ROOT, PACK_ID, REQUIREMENT_ID, committed().runId),
      'utf8',
    );
    expect(scan(text)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Replay through the production path
// ---------------------------------------------------------------------------

describe('replay through `verify run`', () => {
  it('publishes a valid dossier at the sign gate’s own path, with no network', async () => {
    const outcome = await verifyRun(verificationDir, REQUIREMENT_ID, FIXTURE_TRANSCRIPT_ROOT);
    expect(outcome.exitCode).toBe(EXIT_OK);

    const destination = resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID);
    const result = readback(destination);
    expect(result.gaps).toEqual([]);

    // Toothed: a value the writer computed before the write, against a digest
    // recomputed from the file that is actually on disk.
    expect(outcome.lines.join('\n')).toContain(resultSha256(result));

    // Canonical fixpoint, NOT an independent oracle — the writer calls these
    // same two functions. Teeth against non-canonical publication only.
    expect(readFileSync(destination, 'utf8')).toBe(
      canonicalResultJson(result) + RESULT_FILE_FRAMING,
    );

    expect(trap.calls).toEqual([]);
  });

  it('the dossier carries the recording’s judgments, not a reconstruction', async () => {
    await verifyRun(verificationDir, REQUIREMENT_ID, FIXTURE_TRANSCRIPT_ROOT);
    const result = readback(resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID));
    // The reader's own words, through the reader's schema, the coverage table
    // and the assembler — not copied out of the transcript by anything here.
    expect(result.reading.elements[0]?.statement).toBe(READING_ONE);
    // The challenge ids are the production qualification of the prosecutors'
    // local ids, which is what proves the panel ran rather than one pass.
    expect(result.challenges.map((challenge) => challenge.id)).toContain(
      qualifiedChallengeId(DEFAULT_ROLE_CONFIG.prosecutorCount - 1, 'C2'),
    );
    expect(trap.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('the same recording, replayed twice', () => {
  it('produces byte-identical dossiers in two fresh roots, and one resultSha256', async () => {
    const first = mkdtempSync(join(tmpdir(), 'replay-det-a-'));
    const second = mkdtempSync(join(tmpdir(), 'replay-det-b-'));
    try {
      for (const dir of [first, second]) {
        mkdirSync(join(dir, 'requirement-versions'), { recursive: true });
        cpSync(
          join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`),
          join(dir, 'requirement-versions', `${PACK_ID}.json`),
        );
      }
      const a = await verifyRun(first, REQUIREMENT_ID, FIXTURE_TRANSCRIPT_ROOT);
      const b = await verifyRun(second, REQUIREMENT_ID, FIXTURE_TRANSCRIPT_ROOT);
      expect(a.exitCode).toBe(EXIT_OK);
      expect(b.exitCode).toBe(EXIT_OK);

      // Off disk, from two roots neither run knew about. Neither side is a
      // value a run reported about itself.
      const bytesA = readFileSync(resultPath(pathsFor(first), PACK_ID, REQUIREMENT_ID));
      const bytesB = readFileSync(resultPath(pathsFor(second), PACK_ID, REQUIREMENT_ID));
      expect(bytesB.equals(bytesA)).toBe(true);

      // And through the record contract's own digest, recomputed from each file.
      const hashA = resultSha256(readback(resultPath(pathsFor(first), PACK_ID, REQUIREMENT_ID)));
      const hashB = resultSha256(readback(resultPath(pathsFor(second), PACK_ID, REQUIREMENT_ID)));
      expect(hashB).toBe(hashA);

      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The semantic mutation
// ---------------------------------------------------------------------------

describe('one semantically meaningful change to a recorded role output', () => {
  const MUTATED_RESOLUTION =
    'SYNTHETIC FIXTURE, MUTATED: the challenge is upheld on a different ground entirely.';

  /** The adjudicator's first adjudication, re-worded. Nothing else moves. */
  function mutatedTranscript(): RunTranscript {
    return withRole(
      committed(),
      (entry) => entry.role === 'adjudicator',
      (entry) => {
        const output = JSON.parse(entry.outputJson) as {
          adjudications: { resolution?: string }[];
        };
        const first = output.adjudications[0];
        if (first === undefined) throw new Error('the fixture adjudicator recorded no adjudication');
        expect(first.resolution).toBe(RESOLUTION);
        first.resolution = MUTATED_RESOLUTION;
        // `requestSha256` is untouched: the mutation is to the *answer*, and the
        // question the adjudicator was asked has not moved. A mutation that also
        // had to re-fingerprint would be testing the fingerprint, not the record.
        // The answer moves in both places a recording holds it, so the forgery
        // is a coherent recording rather than a self-contradictory one.
        return withOutputJson(entry, JSON.stringify(output));
      },
    );
  }

  it('moves exactly the field it changed, leaves its neighbours, and moves resultSha256', async () => {
    const baselineDir = mkdtempSync(join(tmpdir(), 'replay-base-'));
    const mutatedRoot = transcriptRootWith([mutatedTranscript()]);
    try {
      mkdirSync(join(baselineDir, 'requirement-versions'), { recursive: true });
      cpSync(
        join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`),
        join(baselineDir, 'requirement-versions', `${PACK_ID}.json`),
      );

      await verifyRun(baselineDir, REQUIREMENT_ID, FIXTURE_TRANSCRIPT_ROOT);
      await verifyRun(verificationDir, REQUIREMENT_ID, mutatedRoot);

      const before = readback(resultPath(pathsFor(baselineDir), PACK_ID, REQUIREMENT_ID));
      const after = readback(resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID));

      // The named field, stated before any hash is looked at.
      expect(before.challenges[0]?.resolution).toBe(RESOLUTION);
      expect(after.challenges[0]?.resolution).toBe(MUTATED_RESOLUTION);

      // Neighbours that must not have moved.
      expect.soft(after.challenges[0]?.id).toBe(before.challenges[0]?.id);
      expect.soft(after.challenges[0]?.verdict).toBe(before.challenges[0]?.verdict);
      expect.soft(after.challenges[0]?.statement).toBe(before.challenges[0]?.statement);
      expect.soft(after.reading.elements[0]?.statement).toBe(before.reading.elements[0]?.statement);
      expect.soft(after.coverage).toEqual(before.coverage);

      // Only now, the hash.
      expect(resultSha256(after)).not.toBe(resultSha256(before));

      // And the pins the tail owns are untouched by anything an agent said.
      expect.soft(after.requirementInputSha256).toBe(before.requirementInputSha256);
      expect.soft(after.renderedConditionSha256).toBe(before.renderedConditionSha256);
      expect.soft(after.corpusClosureSha256).toBe(before.corpusClosureSha256);

      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(baselineDir, { recursive: true, force: true });
      rmSync(mutatedRoot, { recursive: true, force: true });
    }
  });

  it('does not redefine the pipeline identity — a transcript is not an identity input', async () => {
    const baselineDir = mkdtempSync(join(tmpdir(), 'replay-base-id-'));
    const mutatedRoot = transcriptRootWith([mutatedTranscript()]);
    try {
      mkdirSync(join(baselineDir, 'requirement-versions'), { recursive: true });
      cpSync(
        join(engineRoot, 'verification', 'requirement-versions', `${PACK_ID}.json`),
        join(baselineDir, 'requirement-versions', `${PACK_ID}.json`),
      );
      await verifyRun(baselineDir, REQUIREMENT_ID, FIXTURE_TRANSCRIPT_ROOT);
      await verifyRun(verificationDir, REQUIREMENT_ID, mutatedRoot);

      const before = readback(resultPath(pathsFor(baselineDir), PACK_ID, REQUIREMENT_ID));
      const after = readback(resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID));

      // §5.1's inputs are prompt-file hashes, model ids, role configuration, the
      // result schema version and the closure policy. What an agent *said* is
      // not among them, and the record must show that separation.
      expect(after.pipelineVersion).toBe(before.pipelineVersion);
      // `resultSha256` is not a field of the record — it is the digest *of* the
      // record, computed post-assembly — so it is recomputed here rather than
      // read off one.
      expect(resultSha256(after)).not.toBe(resultSha256(before));
    } finally {
      rmSync(baselineDir, { recursive: true, force: true });
      rmSync(mutatedRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Binding: a recording cannot answer a question it was not asked
// ---------------------------------------------------------------------------

describe('transcript/request binding', () => {
  it('refuses a recording of another requirement, naming the requirement, before any role runs', async () => {
    // The same recording, filed under a different requirement's directory. It
    // parses, it is structurally perfect, and it answers a different question.
    const root = transcriptRootWith([committed()], OTHER_REQUIREMENT_ID);
    try {
      const capability = replayFromRoot(root, PACK_ID, OTHER_REQUIREMENT_ID);
      let asked = 0;
      const counted = {
        ...capability,
        run: (request: Parameters<typeof capability.run>[0]) => {
          asked += 1;
          return capability.run(request);
        },
      };
      await expect(
        dispatch(
          ['run', PACK_ID, OTHER_REQUIREMENT_ID],
          pathsFor(verificationDir),
          () => true,
          undefined,
          { runner: counted },
        ),
      ).rejects.toBeInstanceOf(TranscriptRunMismatchError);
      // Zero role executions: the refusal is at `bind`, not after a reading.
      expect(asked).toBe(0);
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('names which identity field moved, rather than only that two ids differ', async () => {
    const root = transcriptRootWith([committed()], OTHER_REQUIREMENT_ID);
    try {
      const error = await dispatch(
        ['run', PACK_ID, OTHER_REQUIREMENT_ID],
        pathsFor(verificationDir),
        () => true,
        undefined,
        { runner: replayFromRoot(root, PACK_ID, OTHER_REQUIREMENT_ID) },
      ).catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(TranscriptRunMismatchError);
      const fields = (error as TranscriptRunMismatchError).differences.map((d) => d.field);
      expect(fields).toContain('requirementId');
      expect((error as Error).message).toContain(OTHER_REQUIREMENT_ID);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses when a lens is answered by another lens’s recording, naming both', async () => {
    // Two prosecutor recordings swapped between their positions. Every byte is
    // a real recording; only which execution each answers has moved.
    const source = committed();
    const swapped: RunTranscript = {
      ...source,
      roles: source.roles.map((entry) => {
        if (entry.role !== 'prosecutor') return entry;
        if (entry.index === 0) {
          const other = source.roles.find((e) => e.role === 'prosecutor' && e.index === 1)!;
          return { ...other, index: 0 };
        }
        if (entry.index === 1) {
          const other = source.roles.find((e) => e.role === 'prosecutor' && e.index === 0)!;
          return { ...other, index: 1 };
        }
        return entry;
      }),
    };
    // Re-sealed, so this is a coherent recording of a *different* question
    // rather than a self-contradictory file. Without that it would be refused at
    // the read boundary and would prove nothing about the lens check.
    const root = transcriptRootWith([resealed(swapped, (entry) => entry.role === 'prosecutor')]);
    try {
      const error = await verifyRun(verificationDir, REQUIREMENT_ID, root).catch(
        (thrown: unknown) => thrown,
      );
      // Not wrapped as a *missing* exchange: a lens swap is not an absence, and
      // the two must stay distinguishable. `prosecutors.ts` wraps only
      // `TranscriptReplayError` and `RoleTransportError`, so this arrives by
      // its own name, carrying both lenses.
      expect(error).toBeInstanceOf(TranscriptLensMismatchError);
      expect((error as TranscriptLensMismatchError).expected).toBe(DEFAULT_ROLE_CONFIG.lenses[0]);
      expect((error as TranscriptLensMismatchError).found).toBe(DEFAULT_ROLE_CONFIG.lenses[1]);
      const message = (error as Error).message;
      expect(message).toContain(DEFAULT_ROLE_CONFIG.lenses[0]!);
      expect(message).toContain(DEFAULT_ROLE_CONFIG.lenses[1]!);
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a lens swap by name at the capability, not only at the panel check', () => {
    const source = committed();
    const first = source.roles.find((e) => e.role === 'prosecutor' && e.index === 0)!;
    const second = source.roles.find((e) => e.role === 'prosecutor' && e.index === 1)!;
    // Re-sealed, so the single-entry recording is internally coherent and
    // survives the self-integrity check at `bind`. Without that it would be
    // refused as self-contradictory and prove nothing about the lens check.
    const capability = replayCapability([
      resealed({ ...source, roles: [{ ...second, index: 0 }] }, () => true),
    ]);
    capability.bind!({
      runId: source.runId,
      packId: source.packId,
      requirementId: source.requirementId,
      pipelineVersion: source.pipelineVersion,
      requirementInputSha256: source.requirementInputSha256,
      renderedConditionSha256: source.renderedConditionSha256,
      corpusClosureSha256: source.corpusClosureSha256,
    });
    expect(() =>
      capability.run({
        role: 'prosecutor',
        index: 0,
        model: first.model,
        promptSha256: first.promptSha256,
        lens: first.lens,
        messages: first.messages.filter((message) => message.from !== 'agent'),
      }),
    ).toThrow(TranscriptLensMismatchError);
  });

  it('refuses when the request this run built is not the one recorded', () => {
    // The recording is the committed one, untouched and perfectly coherent —
    // **nothing is forged here at all**. What differs is the *question*: the
    // request handed to `run` carries one extra character in its input.
    //
    // That is the honest isolation of replay's own check. An earlier version
    // poked a bogus digest into the entry, which self-integrity now refuses at
    // `bind` — correctly, but it meant the test could no longer reach the layer
    // it names. The two properties are:
    //
    //   self-integrity   stored messages -> stored digest   (refused at bind)
    //   replay binding   live request    -> stored digest   (this test)
    const source = committed();
    const reader = source.roles.find((entry) => entry.role === 'reader')!;
    const capability = replayCapability([source]);
    capability.bind!(bindingOf(source));

    const asRecorded = reader.messages.filter((message) => message.from !== 'agent');
    const asAsked = asRecorded.map((message) =>
      message.from === 'input' ? { ...message, content: `${message.content} ` } : message,
    );

    // Control: the request as recorded is answered.
    expect(() =>
      capability.run({
        role: 'reader',
        index: 0,
        model: reader.model,
        promptSha256: reader.promptSha256,
        messages: asRecorded,
      }),
    ).not.toThrow();

    // One character different, and the recording no longer answers it.
    const second = replayCapability([source]);
    second.bind!(bindingOf(source));
    expect(() =>
      second.run({
        role: 'reader',
        index: 0,
        model: reader.model,
        promptSha256: reader.promptSha256,
        messages: asAsked,
      }),
    ).toThrow(TranscriptRequestMismatchError);
    expect(trap.calls).toEqual([]);
  });

  it('refuses the adjudicator’s recording once the coverage table it answered has moved', async () => {
    // The honest cross-input case, and not a tampered fingerprint: the reader's
    // answer is changed, so the prosecutors are asked a different question and
    // their recordings stop binding. The run refuses at the first role whose
    // question moved, which is the prosecutor — proving the binding is over the
    // *input* and not over the role name.
    const source = committed();
    const movedReading = withRole(
      source,
      (entry) => entry.role === 'reader',
      (entry) => {
        const output = JSON.parse(entry.outputJson) as { elements: { statement: string }[] };
        output.elements[0]!.statement = 'SYNTHETIC FIXTURE, MUTATED: a different reading entirely.';
        return withOutputJson(entry, JSON.stringify(output));
      },
    );
    const root = transcriptRootWith([movedReading]);
    try {
      const error = await verifyRun(verificationDir, REQUIREMENT_ID, root).catch(
        (thrown: unknown) => thrown,
      );
      // The prosecutor is the first role whose *question* moved, and it is the
      // request fingerprint — not the role name, not the lens — that catches it.
      expect(error).toBeInstanceOf(TranscriptRequestMismatchError);
      expect((error as TranscriptRequestMismatchError).role).toBe('prosecutor');
      expect((error as TranscriptRequestMismatchError).index).toBe(0);
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Cardinality
// ---------------------------------------------------------------------------

describe('cardinality', () => {
  it('refuses when a configured lens has no recording, naming that lens', async () => {
    const source = committed();
    const short: RunTranscript = {
      ...source,
      roles: source.roles.filter((entry) => !(entry.role === 'prosecutor' && entry.index === 1)),
    };
    const root = transcriptRootWith([short]);
    try {
      const error = await verifyRun(verificationDir, REQUIREMENT_ID, root).catch(
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(ProsecutorTranscriptMissingError);
      expect((error as ProsecutorTranscriptMissingError).lens).toBe(DEFAULT_ROLE_CONFIG.lenses[1]);
      expect((error as Error).message).toContain(DEFAULT_ROLE_CONFIG.lenses[1]!);
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses when the recording holds an exchange this run never asked for', async () => {
    // A fourth prosecutor recording, under a three-prosecutor configuration.
    const source = committed();
    const third = source.roles.find((e) => e.role === 'prosecutor' && e.index === 2)!;
    const surplus: RunTranscript = {
      ...source,
      roles: [...source.roles, { ...third, index: DEFAULT_ROLE_CONFIG.prosecutorCount }],
    };
    // Re-sealed: the surplus entry carries a new index, so its recorded digest
    // must be the digest of *that* entry or the file is self-contradictory and
    // never reaches the cardinality check this test is about.
    const root = transcriptRootWith([
      resealed(
        surplus,
        (entry) => entry.role === 'prosecutor' && entry.index === DEFAULT_ROLE_CONFIG.prosecutorCount,
      ),
    ]);
    try {
      const error = await verifyRun(verificationDir, REQUIREMENT_ID, root).catch(
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(TranscriptUnconsumedError);
      expect((error as TranscriptUnconsumedError).unconsumed).toEqual([
        `prosecutor[${DEFAULT_ROLE_CONFIG.prosecutorCount}]`,
      ]);
      // "Refused" and "wrote nothing" are two claims, and this refusal lands at
      // `settle` — after the tail has run and the transcript has been built —
      // which is exactly where they could come apart.
      expect(existsSync(resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID))).toBe(false);
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('one recorded exchange answers one execution, never two', async () => {
    const source = committed();
    const reader = source.roles.find((entry) => entry.role === 'reader')!;
    const capability = replayCapability([{ ...source, roles: [reader] }]);
    const binding = {
      runId: source.runId,
      packId: source.packId,
      requirementId: source.requirementId,
      pipelineVersion: source.pipelineVersion,
      requirementInputSha256: source.requirementInputSha256,
      renderedConditionSha256: source.renderedConditionSha256,
      corpusClosureSha256: source.corpusClosureSha256,
    };
    capability.bind!(binding);
    const request = {
      role: 'reader' as const,
      index: 0,
      model: reader.model,
      promptSha256: reader.promptSha256,
      messages: reader.messages.filter((message) => message.from !== 'agent'),
    };
    await expect(capability.run(request)).resolves.toBeDefined();
    expect(() => capability.run(request)).toThrow(TranscriptExchangeReusedError);
  });
});

describe('an address that is not unique is refused, never resolved', () => {
  /** The committed recording, with a second answer for one execution. */
  function withShadowAdjudication(): RunTranscript {
    const source = committed();
    const adjudicator = source.roles.find((entry) => entry.role === 'adjudicator')!;
    const output = JSON.parse(adjudicator.outputJson) as {
      adjudications: { resolution?: string }[];
    };
    output.adjudications[0]!.resolution = SHADOW_RESOLUTION;
    // Same key, same lens, same fingerprint, and internally coherent in itself.
    // Only the answer differs — which is what makes it a shadow rather than a
    // mismatch: every other binding check passes.
    return {
      ...source,
      roles: [...source.roles, withOutputJson(adjudicator, JSON.stringify(output))],
    };
  }

  const SHADOW_RESOLUTION = 'SHADOW ENTRY: this resolution was never in the genuine recording.';

  it('refuses two answers for one execution at the storage contract', () => {
    expect(() => parseRunTranscript(JSON.stringify(withShadowAdjudication()), 'shadow.json')).toThrow(
      TranscriptIntegrityError,
    );
    // Named against the address, so "a transcript was refused" is not the claim.
    expect(() => parseRunTranscript(JSON.stringify(withShadowAdjudication()), 'shadow.json')).toThrow(
      /adjudicator\[0\] is recorded more than once/,
    );
  });

  it('refuses it again at the capability, for a recording that never met the parser', () => {
    // The single-transcript path — `replayRunner(run.transcript)` — hands a
    // capability an in-memory recording directly, so a guarantee that lived only
    // in `parseRunTranscript` would not be a guarantee about replay.
    const shadowed = withShadowAdjudication();
    const capability = replayCapability([shadowed]);
    expect(() => capability.bind!(bindingOf(shadowed))).toThrow(TranscriptDuplicateExchangeError);
  });

  it('and the shadow answer never reaches a published dossier', async () => {
    const root = transcriptRootWith([withShadowAdjudication()]);
    try {
      // Thrown by `replayFromRoot` while the capability is being *built*, so
      // the refusal lands before `verify run` begins — earlier even than
      // `bind`, and at a cost of zero role executions. Synchronous, therefore,
      // rather than a rejected promise.
      let thrown: unknown;
      try {
        await verifyRun(verificationDir, REQUIREMENT_ID, root);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TranscriptIntegrityError);
      const destination = resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID);
      expect(existsSync(destination)).toBe(false);
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses two files claiming one run, rather than answering from the first', () => {
    const source = committed();
    const capability = replayCapability([source, source]);
    expect(() => capability.bind!(bindingOf(source))).toThrow(TranscriptAmbiguousRunError);
  });

  it('refuses a recording filed under a name that is not its run identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-misfiled-'));
    try {
      const dir = join(root, PACK_ID, REQUIREMENT_ID);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'aaa.json'), serialiseTranscript(committed()), 'utf8');
      expect(() => readTranscriptsFor(root, PACK_ID, REQUIREMENT_ID)).toThrow(
        TranscriptMisfiledError,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('a recording cannot lie about what it says it recorded', () => {
  const FABRICATION = 'Article 99 (FABRICATED)';

  /** Rewrites what the recording *claims* the reader was shown. */
  function withRewrittenReaderInput(transcript: RunTranscript): RunTranscript {
    return withRole(
      transcript,
      (entry) => entry.role === 'reader',
      (entry) => ({
        ...entry,
        messages: entry.messages.map((message) =>
          message.from === 'input'
            ? { ...message, content: message.content.replace('Article 1', FABRICATION) }
            : message,
        ),
      }),
    );
  }

  /**
   * Every way a recording can contradict itself, as one table.
   *
   * A table rather than four separate `it`s because the point is not only that
   * each is refused — it is that each is refused **identically by both entry
   * points**. One forgery driven through both paths cannot show that: a second,
   * divergent validator in `replay.ts` that happened to implement only the
   * digest check would satisfy it, and did (verified by mutation: 56/56 green
   * against exactly that). The invariants a round strengthens must be the
   * invariants its sharing test exercises.
   */
  const FORGERIES: readonly {
    name: string;
    build: () => RunTranscript;
    problem: string;
  }[] = [
    {
      name: 'messages altered, digest left alone',
      build: () => withRewrittenReaderInput(committed()),
      problem: 'contradicts itself about what this role was sent',
    },
    {
      name: 'no recorded reply at all',
      build: () =>
        withRole(committed(), (e) => e.role === 'reader', (e) => ({
          ...e,
          messages: e.messages.filter((m) => m.from !== 'agent'),
        })),
      problem: 'no recorded reply',
    },
    {
      name: 'a second reply nothing attests',
      build: () =>
        withRole(committed(), (e) => e.role === 'reader', (e) => ({
          ...e,
          messages: [
            ...e.messages.slice(0, -1),
            { from: 'agent' as const, content: '{"elements":[],"gaps":[],"note":"FABRICATED"}' },
            e.messages[e.messages.length - 1]!,
          ],
        })),
      problem: '2 recorded replies',
    },
    {
      name: 'a reply followed by further questions',
      // Two problems, both true: appending an `input` moves the request digest
      // *and* displaces the reply from the end. `.some()` is why the matcher
      // asks for containment rather than equality.
      build: () =>
        withRole(committed(), (e) => e.role === 'reader', (e) => ({
          ...e,
          messages: [...e.messages, { from: 'input' as const, content: 'a later question' }],
        })),
      problem: 'not the last message',
    },
    {
      name: 'the reply is not the response replay serves',
      build: () =>
        withRole(committed(), (e) => e.role === 'adjudicator', (e) => ({
          ...e,
          messages: e.messages.map((m) =>
            m.from === 'agent'
              ? { ...m, content: JSON.stringify({ adjudications: [], gaps: [] }) }
              : m,
          ),
        })),
      problem: 'not the response replay would serve',
    },
  ];

  /** The problems each entry point reports, or `null` if it accepted the forgery. */
  function viaDisk(forged: RunTranscript): string[] | null {
    try {
      parseRunTranscript(serialiseTranscript(forged), 'disk.json');
      return null;
    } catch (error) {
      return (error as TranscriptIntegrityError).problems;
    }
  }
  function viaMemory(forged: RunTranscript): string[] | null {
    try {
      replayRunner(forged).bind!(bindingOf(forged));
      return null;
    } catch (error) {
      return (error as TranscriptIntegrityError).problems;
    }
  }

  it.each(FORGERIES)('the disk path refuses: $name', ({ build, problem }) => {
    const problems = viaDisk(build());
    expect(problems).not.toBeNull();
    expect(problems!.some((entry) => entry.includes(problem))).toBe(true);
  });

  it.each(FORGERIES)('the in-memory path refuses: $name', ({ build, problem }) => {
    // The route `replayRunner(run.transcript)` takes, which never meets the
    // parser. Every invariant, not just the digest — a validator that shared
    // only the digest check would pass the sharing test below while leaving
    // these three unenforced on exactly the path this round exists to protect.
    const problems = viaMemory(build());
    expect(problems).not.toBeNull();
    expect(problems!.some((entry) => entry.includes(problem))).toBe(true);
  });

  it.each(FORGERIES)('and both report it identically: $name', ({ build }) => {
    const forged = build();
    const fromDisk = viaDisk(forged);
    const fromMemory = viaMemory(forged);
    expect(fromDisk).not.toBeNull();
    // The whole claim: one validator, so the same forgery yields the same words
    // from either door. A second implementation agreeing on one forgery kind is
    // what the previous version of this test could not tell apart.
    expect(fromMemory).toEqual(fromDisk);
  });

  it('A — altered messages with the digest left alone are refused at the read boundary', () => {
    const forged = withRewrittenReaderInput(committed());
    // The alteration is real, and it is inside `messages` and nowhere else.
    expect(
      forged.roles.find((entry) => entry.role === 'reader')!.messages.find((m) => m.from === 'input')!
        .content,
    ).toContain(FABRICATION);
    // ...and the entry still carries the digest it was recorded with.
    expect(forged.roles.find((entry) => entry.role === 'reader')!.requestSha256).toBe(
      committed().roles.find((entry) => entry.role === 'reader')!.requestSha256,
    );

    let thrown: unknown;
    try {
      parseRunTranscript(serialiseTranscript(forged), 'forged.json');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TranscriptIntegrityError);

    // The refusal must be the *digest* refusal, not JSON and not the schema —
    // the whole value of the two-stage proof is that A isolates this one thing.
    const problems = (thrown as TranscriptIntegrityError).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('roles.reader[0]');
    expect(problems[0]).toContain('contradicts itself about what this role was sent');
    expect(problems[0]).not.toContain('not valid JSON');
  });

  it('A(ii) — the in-memory path refuses the same forgery, before answering anything', async () => {
    // The route that never meets `parseRunTranscript`:
    // `replayRunner(run.transcript)` hands a capability a typed object directly.
    // Task 5e already met this boundary with duplicate `(role, index)`
    // addressing; the same reasoning applies to a recording that contradicts
    // itself, and the same *validator* is what both paths call.
    //
    // Note why this cannot be inferred from A: replay compares the **live**
    // request against the stored digest and never reads the stored messages, so
    // without a check at `bind` this forgery is not merely undetected — it is
    // answered, because the live request still matches the untouched digest.
    const forged = withRewrittenReaderInput(committed());
    const capability = replayRunner(forged);

    let thrown: unknown;
    try {
      capability.bind!(bindingOf(forged));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TranscriptIntegrityError);
    expect((thrown as TranscriptIntegrityError).problems[0]).toContain(
      'contradicts itself about what this role was sent',
    );

    // And nothing was served: the capability is unbound, so it cannot answer.
    const reader = forged.roles.find((entry) => entry.role === 'reader')!;
    expect(() =>
      capability.run({
        role: 'reader',
        index: 0,
        model: reader.model,
        promptSha256: reader.promptSha256,
        messages: reader.messages.filter((message) => message.from !== 'agent'),
      }),
    ).toThrow(TranscriptUnboundError);
    expect(trap.calls).toEqual([]);
  });


  it('B — the same alteration made internally coherent still cannot answer this run', async () => {
    // The digest is recomputed with the production function. That is fixture
    // *construction*, not the assertion's expected value: what is asserted is
    // which refusal arrives, and it arrives from `replay.ts` comparing against a
    // request built fresh from the real world.
    const coherent = withRole(
      withRewrittenReaderInput(committed()),
      (entry) => entry.role === 'reader',
      (entry) => ({ ...entry, requestSha256: requestSha256(recordedRequest(entry)) }),
    );

    // First: it really is internally coherent now. A passes, so B is testing
    // something A does not already cover.
    expect(() => parseRunTranscript(serialiseTranscript(coherent), 'coherent.json')).not.toThrow();

    const root = transcriptRootWith([coherent]);
    try {
      const error = await verifyRun(verificationDir, REQUIREMENT_ID, root).catch(
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(TranscriptRequestMismatchError);
      expect((error as TranscriptRequestMismatchError).role).toBe('reader');
      expect(
        existsSync(resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID)),
      ).toBe(false);
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });



});

describe('the recording an adjudicator answered is the table it was shown', () => {
  it('refuses the adjudicator’s recording once a prosecutor’s challenge has moved', async () => {
    // The seam the shadow-entry defect exploited, and the strongest claim
    // `replay.ts` makes. Only the *last* prosecutor's challenge text changes,
    // so every earlier binding still holds and the run reaches the adjudicator —
    // whose recorded request was fingerprinted over a table that no longer
    // exists.
    const source = committed();
    const moved = withRole(
      source,
      (entry) => entry.role === 'prosecutor' && entry.index === DEFAULT_ROLE_CONFIG.prosecutorCount - 1,
      (entry) => {
        const output = JSON.parse(entry.outputJson) as { challenges: { statement: string }[] };
        output.challenges[0]!.statement = 'SYNTHETIC FIXTURE, MUTATED: a different challenge.';
        return withOutputJson(entry, JSON.stringify(output));
      },
    );
    const root = transcriptRootWith([moved]);
    try {
      const error = await verifyRun(verificationDir, REQUIREMENT_ID, root).catch(
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(TranscriptRequestMismatchError);
      expect((error as TranscriptRequestMismatchError).role).toBe('adjudicator');
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('a capability that was never bound', () => {
  it('answers nothing, rather than serving a recording nothing checked', () => {
    // Unreachable through orchestration, which always binds first — which is
    // precisely why it needs a direct call. A stated guarantee with nothing
    // that fails when it is violated is not a guarantee.
    const source = committed();
    const capability = replayCapability([source]);
    const reader = source.roles.find((entry) => entry.role === 'reader')!;
    expect(() =>
      capability.run({
        role: 'reader',
        index: 0,
        model: reader.model,
        promptSha256: reader.promptSha256,
        messages: reader.messages.filter((message) => message.from !== 'agent'),
      }),
    ).toThrow(TranscriptUnboundError);
  });
});

// ---------------------------------------------------------------------------
// Malformed: three different things to go and fix
// ---------------------------------------------------------------------------

describe('a recording that cannot be used says which kind of broken it is', () => {
  it('damaged storage is a transcript parse failure naming the file', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-damaged-'));
    try {
      const dir = join(root, PACK_ID, REQUIREMENT_ID);
      mkdirSync(dir, { recursive: true });
      const path = join(dir, 'run-v1-damaged.json');
      writeFileSync(path, '{ this is not JSON', 'utf8');
      let thrown: unknown;
      try {
        readTranscriptsFor(root, PACK_ID, REQUIREMENT_ID);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(TranscriptIntegrityError);
      expect((thrown as TranscriptIntegrityError).path).toBe(path);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a 1.0.0 recording is refused rather than replayed with its binding unchecked', () => {
    const source = committed();
    const legacy = {
      ...source,
      transcriptSchemaVersion: '1.0.0',
      roles: source.roles.map(({ requestSha256: _ignored, lens: _lens, ...rest }) => rest),
    };
    expect(() => parseRunTranscript(JSON.stringify(legacy), 'legacy.json')).toThrow(
      TranscriptIntegrityError,
    );
  });

  it('a bad model response is an ordinary role-output failure, at the role’s own boundary', async () => {
    const source = committed();
    const nonsense = withRole(
      source,
      (entry) => entry.role === 'reader',
      (entry) => withOutputJson(entry, JSON.stringify({ notAReading: true })),
    );
    const root = transcriptRootWith([nonsense]);
    try {
      const outcome = await verifyRun(verificationDir, REQUIREMENT_ID, root);
      // Reported, not thrown: `runRun` maps a role-boundary refusal to a named
      // REFUSED outcome, and nothing is written.
      expect(outcome.exitCode).toBe(EXIT_REFUSED);
      expect(outcome.lines.join('\n')).toContain('role_output');
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('no recording at all is a run-mismatch refusal, not a fallback to anything', async () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-empty-'));
    try {
      await expect(verifyRun(verificationDir, REQUIREMENT_ID, root)).rejects.toBeInstanceOf(
        TranscriptRunMismatchError,
      );
      // The whole point: a missing recording never becomes a reason to ask a
      // model. Nothing was contacted.
      expect(trap.calls).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an execution the recording does not hold is a missing-exchange refusal', () => {
    const source = committed();
    const capability = replayCapability([{ ...source, roles: [source.roles[0]!] }]);
    capability.bind!({
      runId: source.runId,
      packId: source.packId,
      requirementId: source.requirementId,
      pipelineVersion: source.pipelineVersion,
      requirementInputSha256: source.requirementInputSha256,
      renderedConditionSha256: source.renderedConditionSha256,
      corpusClosureSha256: source.corpusClosureSha256,
    });
    expect(() =>
      capability.run({
        role: 'adjudicator',
        index: 0,
        model: 'unused',
        promptSha256: 'unused',
        messages: [{ from: 'prompt', content: 'unused' }],
      }),
    ).toThrow(TranscriptReplayError);
  });
});

// ---------------------------------------------------------------------------
// A transcript may carry judgment, and nothing else
// ---------------------------------------------------------------------------

describe('a recording cannot supply a deterministic pin', () => {
  const PIN_FIELDS = [
    'requirementInputSha256',
    'conditionSha256',
    'renderedConditionSha256',
    'corpusClosureSha256',
    'resultSha256',
    'pipelineVersion',
  ] as const;

  it.each(PIN_FIELDS)('a reader response carrying %s is refused at the seam', async (field) => {
    const source = committed();
    const hostile = withRole(
      source,
      (entry) => entry.role === 'reader',
      (entry) => {
        const output = JSON.parse(entry.outputJson) as Record<string, unknown>;
        output[field] = 'e'.repeat(64);
        return withOutputJson(entry, JSON.stringify(output));
      },
    );
    const root = transcriptRootWith([hostile]);
    try {
      const outcome = await verifyRun(verificationDir, REQUIREMENT_ID, root);
      expect(outcome.exitCode).toBe(EXIT_REFUSED);
      expect(outcome.lines.join('\n')).toContain('role_output');
      // Named against the field, so "the seam refused something" is not the
      // whole claim.
      expect(outcome.lines.join('\n')).toContain(field);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the recording and the record describe one run — every pin, not three of four', async () => {
    await verifyRun(verificationDir, REQUIREMENT_ID, FIXTURE_TRANSCRIPT_ROOT);
    const result = readback(resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID));
    const transcript = committed();
    // A **consistency** claim, and deliberately not titled as evidence that the
    // record refused a recorded pin — that property is `role-outputs.ts`'s
    // `.strict()` and is proved by the six hostile-pin cases above.
    //
    // What it is worth: the transcript is filed against `boundPins` and the
    // record carries `tail.pins` (`orchestrate.ts`), so this is the observable
    // face of the two `producePins` calls agreeing. All four pins, because
    // omitting one leaves the one place a divergence could hide.
    expect.soft(result.requirementInputSha256).toBe(transcript.requirementInputSha256);
    expect.soft(result.renderedConditionSha256).toBe(transcript.renderedConditionSha256);
    expect.soft(result.corpusClosureSha256).toBe(transcript.corpusClosureSha256);
    expect.soft(result.pipelineVersion).toBe(transcript.pipelineVersion);
  });
});

// ---------------------------------------------------------------------------
// The live harness, which nothing here runs
// ---------------------------------------------------------------------------

describe('projected content is ordinary content', () => {
  it('a malformed answer is refused at the seam, not by anything provider-aware', async () => {
    // The seam must not learn where `outputJson` came from.
    //
    // This used to drive two capabilities differing only in `kind` through
    // `verify run`. It no longer can, and the reason is a *stronger* rule
    // arriving after it: a capability declaring `kind: 'live'` is refused under
    // the default configuration, which selects no provider. So the
    // kind-independence claim moved to `provider-adapter.test.ts`, where the
    // configuration is controllable and two runs differing only in adapter
    // identity are compared field by field. What stays here is the end-to-end
    // half: a malformed answer arriving through the production command path is
    // an ordinary role-output refusal.
    //
    // **What this does not cover**, stated because the property is easy to
    // overclaim: it says nothing about an adapter that sanitises its own output
    // — stripping fences, digging JSON out of prose — before returning. Such an
    // adapter widens what the seam accepts without the seam branching on
    // anything. That is an argument for adapter identity being a pipeline
    // identity input, which it now is, not something this test establishes.
    const outcome = await dispatch(
      ['run', PACK_ID, REQUIREMENT_ID],
      pathsFor(verificationDir),
      () => true,
      undefined,
      { runner: { kind: 'replay', run: () => Promise.resolve({ outputJson: JSON.stringify({ notAReading: true }) }) } },
    );
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toContain('role_output');
    expect(trap.calls).toEqual([]);
  });

  it('a live capability that declares no protocol cannot run at all under the production configuration', async () => {
    // The rule that displaced the test above, proved through the same
    // production path. Since B-ADAPTER `DEFAULT_ROLE_CONFIG` selects the
    // concrete adapter, so the refusal a protocol-less live capability meets is
    // "unverified": it announces itself live and declares no adapter, and it
    // is refused before any role executes — and before any request could be
    // made. The unselected-configuration refusal keeps its own coverage in
    // `provider-adapter.test.ts` and `live-wiring.test.ts`.
    let asked = 0;
    const error = await dispatch(
      ['run', PACK_ID, REQUIREMENT_ID],
      pathsFor(verificationDir),
      () => true,
      undefined,
      {
        runner: {
          kind: 'live',
          run: () => {
            asked += 1;
            return Promise.resolve({ outputJson: '{}' });
          },
        },
      },
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(UnverifiedProviderAdapterError);
    expect(asked).toBe(0);
    expect(existsSync(resultPath(pathsFor(verificationDir), PACK_ID, REQUIREMENT_ID))).toBe(false);
    expect(trap.calls).toEqual([]);
  });

  it('the seam never asks a runner what kind it is', () => {
    // The static half, and **corroborating rather than independent**: it is
    // evaded by `runner['kind']` and by destructuring, and it reads
    // `agent-role.ts` only. The sibling test above is what actually kills a
    // kind-branch, including the bracket-access form and branches placed in
    // `orchestrate.ts`. This one is kept because it fails *earlier* and names
    // the file, not because it closes anything the other leaves open.
    const seam = readFileSync(join(engineRoot, 'src', 'pipeline', 'agent-role.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
      '',
    );
    expect(seam).not.toContain('.kind');
  });
});

describe('the live capture harness', () => {
  it('refuses to construct a live runner without the explicit opt-in, before any network call', () => {
    expect(liveAgentsEnabled({})).toBe(false);
    expect(() =>
      createLiveAgentRunner({ endpoint: 'https://unused.invalid/', apiKey: 'unused' }),
    ).toThrow(AgentCapabilityError);
    expect(trap.calls).toEqual([]);
  });

  it('a credential alone is not permission to spend', () => {
    // The token is a *separate* act from having an API key in the environment.
    expect(liveAgentsEnabled({ ANTHROPIC_API_KEY: 'sk-ant-whatever' })).toBe(false);
    expect(liveAgentsEnabled({ [LIVE_AGENTS_ENV]: 'true' })).toBe(false);
    expect(liveAgentsEnabled({ [LIVE_AGENTS_ENV]: '1' })).toBe(true);
    expect(trap.calls).toEqual([]);
  });

  it('refuses a capture with no opt-in, naming every gate that is missing', async () => {
    const withEverythingButTheToken = {
      [LIVE_ENDPOINT_ENV]: 'https://unused.invalid/',
      [LIVE_API_KEY_ENV]: 'sk-ant-unused',
    };
    // The whole point of the third gate: endpoint and credential present, and
    // it still refuses, because the token is the act.
    expect(() => liveCaptureConfigFrom(withEverythingButTheToken)).toThrow(LiveCaptureConfigError);
    expect(() => liveCaptureConfigFrom(withEverythingButTheToken)).toThrow(LIVE_AGENTS_ENV);

    await expect(
      captureLiveRun({
        packId: PACK_ID,
        requirementId: REQUIREMENT_ID,
        paths: pathsFor(verificationDir),
        executionRoot: join(verificationDir, 'executions'),
        env: withEverythingButTheToken,
      }),
    ).rejects.toBeInstanceOf(LiveCaptureConfigError);

    // Refused before anything was constructed, so nothing was contacted.
    expect(trap.calls).toEqual([]);
  });

  it('refuses a capture that has every gate but no provider protocol', async () => {
    // The exact shape the first-live-run decision must still fill:
    //   opt-in + endpoint + credential + model + NO adapter
    //   -> named refusal, zero network.
    const fullyConfiguredButProviderless = {
      [LIVE_AGENTS_ENV]: '1',
      [LIVE_ENDPOINT_ENV]: 'https://unused.invalid/',
      [LIVE_API_KEY_ENV]: 'sk-ant-unused',
      [LIVE_MAX_ATTEMPTS_ENV]: '27',
      [LIVE_MAX_INPUT_BYTES_ENV]: '4000000',
    };
    // The env gates all pass...
    expect(() => liveCaptureConfigFrom(fullyConfiguredButProviderless)).not.toThrow();
    // ...and the capture still refuses, by a different name, before any request.
    await expect(
      captureLiveRun({
        packId: PACK_ID,
        requirementId: REQUIREMENT_ID,
        paths: pathsFor(verificationDir),
        executionRoot: join(verificationDir, 'executions'),
        env: fullyConfiguredButProviderless,
      }),
    ).rejects.toBeInstanceOf(MissingProviderAdapterError);
    expect(trap.calls).toEqual([]);
    // And nothing was written where a capture would have written.
    expect(existsSync(join(verificationDir, 'executions'))).toBe(false);
  });

  it('every gate is separately load-bearing: drop any one and the capture refuses', async () => {
    // Enforcement, not wording. An earlier version of this test asserted that
    // the refusal *message* named each gate, and a mutation removing a gate from
    // `LIVE_CAPTURE_GATES` did not red it — the word survived in the surrounding
    // prose. A list-shaped assertion about a list is not evidence that the list
    // is enforced.
    //
    // So: six configurations, each complete except for one gate, each required
    // to refuse. Removing any gate's enforcement reds exactly one row.
    const complete = {
      env: {
        [LIVE_AGENTS_ENV]: '1',
        [LIVE_ENDPOINT_ENV]: 'https://unused.invalid/',
        [LIVE_API_KEY_ENV]: 'sk-ant-unused',
        [LIVE_MAX_ATTEMPTS_ENV]: '27',
        [LIVE_MAX_INPUT_BYTES_ENV]: '4000000',
      },
      adapter: SYNTHETIC_ADAPTER_V1,
    };

    // The control: with every gate present the refusal is *not* a gate refusal.
    // Without this, "it threw" would be satisfied by a harness that always threw.
    const control = await captureLiveRun({
      packId: PACK_ID,
      requirementId: REQUIREMENT_ID,
      paths: pathsFor(verificationDir),
      executionRoot: join(verificationDir, 'executions'),
      ...complete,
    }).catch((thrown: unknown) => thrown);
    expect(control).not.toBeInstanceOf(LiveCaptureConfigError);
    expect(control).not.toBeInstanceOf(MissingProviderAdapterError);

    // The test's own specification of what a capture needs. Deliberately a local
    // literal rather than a constant imported from the code under test: a loop
    // over the production list would shrink with it and prove nothing.
    const GATES = [
      LIVE_AGENTS_ENV,
      LIVE_ENDPOINT_ENV,
      LIVE_API_KEY_ENV,
      LIVE_MAX_ATTEMPTS_ENV,
      LIVE_MAX_INPUT_BYTES_ENV,
      'adapter',
    ] as const;

    for (const gate of GATES) {
      const env = { ...complete.env };
      let adapter: ProviderAdapter | undefined = complete.adapter;
      if (gate === 'adapter') adapter = undefined;
      else delete env[gate];

      const thrown = await captureLiveRun({
        packId: PACK_ID,
        requirementId: REQUIREMENT_ID,
        paths: pathsFor(verificationDir),
        executionRoot: join(verificationDir, 'executions'),
        env,
        ...(adapter === undefined ? {} : { adapter }),
      }).catch((error: unknown) => error);

      expect
        .soft(
          thrown instanceof LiveCaptureConfigError ||
            thrown instanceof MissingProviderAdapterError ||
            thrown instanceof AgentCapabilityError,
          `removing ${gate} did not refuse the capture`,
        )
        .toBe(true);
    }
    expect(trap.calls).toEqual([]);
  });

  it('lists each absent gate individually, so a partial setup is not a mystery', () => {
    const error = (() => {
      try {
        liveCaptureConfigFrom({ [LIVE_AGENTS_ENV]: '1' });
        return null;
      } catch (thrown) {
        return thrown as LiveCaptureConfigError;
      }
    })();
    expect(error).toBeInstanceOf(LiveCaptureConfigError);
    expect(error!.missing).toEqual([LIVE_ENDPOINT_ENV, LIVE_API_KEY_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV]);
  });

  it('the capture harness is in the suite `npm test` excludes, and needs its own script', () => {
    const config = readFileSync(join(engineRoot, 'vitest.config.ts'), 'utf8');
    expect(config).toContain("exclude: ['**/node_modules/**', 'test/**/*.agents.test.ts']");
    const scripts = JSON.parse(readFileSync(join(engineRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(scripts.scripts['test']).toBe('vitest run');
    expect(scripts.scripts['test:agents']).toContain('vitest.agents.config.ts');
  });
});

// ---------------------------------------------------------------------------
// The recording round-trips
// ---------------------------------------------------------------------------

describe('recording and reading back', () => {
  it('writes to the identity-addressed path and reads back byte-identically', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-roundtrip-'));
    try {
      const source = committed();
      const path = writeRunTranscript(root, source);
      expect(path).toBe(transcriptPath(root, PACK_ID, REQUIREMENT_ID, source.runId));
      expect(readFileSync(path, 'utf8')).toBe(serialiseTranscript(source));
      expect(parseRunTranscript(readFileSync(path, 'utf8'), path)).toEqual(source);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The provenance migration's effect on run identity
// ---------------------------------------------------------------------------

/**
 * What the D1(a) provenance migration did to the binding, measured.
 *
 * A recording answers one question, and the question is the binding. The
 * migration changed the reader prompt (locators replaced source identities in
 * `ReaderInput`) and changed `requirementInputSha256`'s domain (authored
 * `provenance` replaced `provisions` + `sources`), so the binding had to move
 * and the pre-migration recording had to stop binding.
 *
 * **The fields are measured here rather than asserted from the plan.** Three
 * were expected to move; the other four were expected to hold. Writing only the
 * three would leave a fourth field's silent movement invisible, so the whole
 * `BINDING_FIELDS` set is partitioned and both halves are named.
 */
describe('the binding the provenance migration moved', () => {
  // Static against static: the two retired recordings are compared to each
  // other with the exported comparator, so this partition is a fact about the
  // files and stays true whatever the live pipeline's identity is now.
  const preD1a = () => supersededById(RETIRED.preD1a);
  const provenanceEra = () => supersededById(RETIRED.provenanceEra);

  it('moves exactly pipelineVersion, requirementInputSha256 and runId', () => {
    const differences = bindingDifferences(provenanceEra(), preD1a());
    expect(differences.map((d) => d.field).sort()).toEqual([
      'pipelineVersion',
      'requirementInputSha256',
      'runId',
    ]);
  });

  it('leaves packId, requirementId, renderedConditionSha256 and the closure untouched', () => {
    // The other half of the partition, asserted positively rather than inferred
    // from the list above. `corpusClosureSha256` holding is the interesting one:
    // CSRD-S-001 stopped citing SRC-004, yet its entitled closure is unchanged,
    // because the host document already reached the amending one through the
    // `amendedBy` edge. Provenance moved; the surface the reader saw did not.
    const a = preD1a();
    const b = provenanceEra();
    for (const field of ['packId', 'requirementId', 'renderedConditionSha256', 'corpusClosureSha256'] as const) {
      expect(b[field], field).toBe(a[field]);
    }
    expect(b.pipelineVersion).not.toBe(a.pipelineVersion);
    expect(b.requirementInputSha256).not.toBe(a.requirementInputSha256);
    expect(b.runId).not.toBe(a.runId);
  });

  it('refuses to replay a retired recording, naming the identity and not guessing', async () => {
    // The production refusal, against the oldest generation: a recording of a
    // different question is refused rather than replayed.
    const root = transcriptRootWith([preD1a()]);
    try {
      await verifyRun(verificationDir, REQUIREMENT_ID, root);
      throw new Error('the run bound to the superseded recording, which it must not');
    } catch (error) {
      if (!(error instanceof TranscriptRunMismatchError)) throw error;
      expect(error.name).toBe('TranscriptRunMismatchError');
      expect(error.offered).toEqual([preD1a().runId]);
      expect(error.differences.length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// B-E2's effect on run identity — B16
// ---------------------------------------------------------------------------

/**
 * What B-E2 did to the binding, measured between the provenance-era recording
 * and the standing-era one. Unlike the provenance migration this retirement
 * moved `corpusClosureSha256`: standing entered the closure's canonical line.
 * The partition is stated whole so a fourth field's silent movement — or a
 * field that should have moved and did not — reddens by name.
 */
describe('the binding B-E2 moved', () => {
  const provenanceEra = () => supersededById(RETIRED.provenanceEra);
  const standingEra = () => supersededById(RETIRED.standingEra);

  it('B16 — moves exactly pipelineVersion, corpusClosureSha256 and runId', () => {
    const differences = bindingDifferences(standingEra(), provenanceEra());
    expect(differences.map((d) => d.field).sort()).toEqual([
      'corpusClosureSha256',
      'pipelineVersion',
      'runId',
    ]);
  });

  it('leaves packId, requirementId, requirementInputSha256 and renderedConditionSha256 untouched', () => {
    const before = provenanceEra();
    const now = standingEra();
    for (const field of ['packId', 'requirementId', 'requirementInputSha256', 'renderedConditionSha256'] as const) {
      expect(now[field], field).toBe(before[field]);
    }
    // The three that moved are genuinely different, and the new identity
    // scheme is visible in the value rather than only in a different number.
    expect(now.corpusClosureSha256).not.toBe(before.corpusClosureSha256);
    expect(now.pipelineVersion).not.toBe(before.pipelineVersion);
    expect(now.pipelineVersion.startsWith('pipeline-v3-')).toBe(true);
    expect(before.pipelineVersion.startsWith('pipeline-v2-')).toBe(true);
    expect(now.runId).not.toBe(before.runId);
  });

});

// ---------------------------------------------------------------------------
// B-PROMPT's effect on run identity
// ---------------------------------------------------------------------------

/**
 * What B-PROMPT did to the binding, measured between the standing-era
 * recording and the prompt-era one. Prompts are hashed into `pipelineVersion`
 * and so is the closure renderer's grammar, so the identity had to move; the
 * closure hash covers stored text rather than its rendering, so it must not.
 */
describe('the binding B-PROMPT moved', () => {
  const standingEra = () => supersededById(RETIRED.standingEra);
  const promptEra = () => supersededById(RETIRED.promptEra);

  it('P6 — moves exactly pipelineVersion and runId', () => {
    const differences = bindingDifferences(promptEra(), standingEra());
    expect(differences.map((d) => d.field).sort()).toEqual(['pipelineVersion', 'runId']);
  });

  it('leaves the closure and every other binding field untouched', () => {
    const before = standingEra();
    const now = promptEra();
    for (const field of ['packId', 'requirementId', 'requirementInputSha256', 'renderedConditionSha256', 'corpusClosureSha256'] as const) {
      expect(now[field], field).toBe(before[field]);
    }
    expect(now.pipelineVersion).not.toBe(before.pipelineVersion);
    expect(now.runId).not.toBe(before.runId);
  });
});

// ---------------------------------------------------------------------------
// B-ADAPTER's effect on run identity
// ---------------------------------------------------------------------------

/**
 * What B-ADAPTER did to the binding, measured between the prompt-era recording
 * and the adapter-era one: the role configuration (seven prosecutors) and the
 * selected adapter identity are both `pipelineVersion` inputs, so it moved and
 * `runId` with it; no prompt, closure or requirement input did. The number of
 * identity moves is measured, not imposed.
 */
describe('the binding B-ADAPTER moved', () => {
  const promptEra = () => supersededById(RETIRED.promptEra);

  it('A6 — moves exactly pipelineVersion and runId', () => {
    const differences = bindingDifferences(committed(), promptEra());
    expect(differences.map((d) => d.field).sort()).toEqual(['pipelineVersion', 'runId']);
  });

  it('leaves the closure and every other binding field untouched', () => {
    const before = promptEra();
    const now = committed();
    for (const field of ['packId', 'requirementId', 'requirementInputSha256', 'renderedConditionSha256', 'corpusClosureSha256'] as const) {
      expect(now[field], field).toBe(before[field]);
    }
    expect(now.pipelineVersion).not.toBe(before.pipelineVersion);
    expect(now.runId).not.toBe(before.runId);
  });

  it('records nine exchanges — one reader, seven prosecutors in lens order, one adjudicator — through the adapter path', () => {
    const now = committed();
    expect(now.roles.map((r) => `${r.role}:${r.index}`)).toEqual(['reader:0', ...DEFAULT_ROLE_CONFIG.lenses.map((_, i) => `prosecutor:${i}`), 'adjudicator:0']);
    expect(now.roles.filter((r) => r.role === 'prosecutor').map((r) => r.lens)).toEqual([...DEFAULT_ROLE_CONFIG.lenses]);
    // The prompt-era recording ran three prosecutors under the unselected adapter; this is the measured difference in shape.
    expect(promptEra().roles).toHaveLength(5);
  });

  it('the live pipeline binds to the adapter-era recording and to nothing retired', async () => {
    // Positive control for all four partitions: the current recording really
    // is the one the production path selects today.
    const outcome = await verifyRun(verificationDir, REQUIREMENT_ID, FIXTURE_TRANSCRIPT_ROOT);
    expect(outcome.exitCode).toBe(EXIT_OK);
  });
});
