/**
 * Transcripts: sufficient to replay, filed where a guard already forbids them
 * from shipping.
 *
 * §5.2's machinery suite runs on recorded transcripts and proves regression with
 * no network and no spend. That only holds if a transcript is enough to replay a
 * run — so the round trip below goes all the way through the replay runner and
 * back out of the orchestrator, and asserts the replayed run reproduces the
 * original's identity and pins.
 *
 * Storage lives under `backend/engine/test/`, which
 * `scripts/standalone-harness.mjs` already forbids in the deployable artifact.
 * That placement is asserted here so that moving it is a test failure rather
 * than a quiet loss of the property.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  parseRunTranscript,
  readRunTranscript,
  serialiseTranscript,
  TranscriptIntegrityError,
  transcriptPath,
  TRANSCRIPT_ROOT,
  writeRunTranscript,
} from '../src/pipeline/transcript';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { DEFAULT_ROLE_CONFIG, lensFor } from '../src/pipeline/config';
import { loadPromptSet } from '../src/pipeline/prompts';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import { replayRunner, TranscriptReplayError } from '../src/pipeline/replay';
import { ProsecutorTranscriptMissingError } from '../src/pipeline/prosecutors';
import {
  fixtureAuthorisedCorpus,
  fixtureRenderContext,
  fixtureRequirement,
  placeholderRunner,
  fixtureRegister,
} from './pipeline-fixtures';
import { fixtureSourceUniverse } from './pipeline-fixtures';

const corpus = fixtureAuthorisedCorpus();

function runInput(runner: Parameters<typeof runVerificationPipeline>[0]['runner']) {
  return {
    packId: 'testpack',
    requirementId: 'TEST-R-001',
    requirement: fixtureRequirement(),
    renderContext: fixtureRenderContext(),
    closure: EntitledClosure.forSources(corpus, fixtureRegister(), fixtureSourceUniverse(), ['SRC-100']),
    corpus,
    prompts: loadPromptSet(),
    config: DEFAULT_ROLE_CONFIG,
    runner,
  };
}

describe('transcript storage layout', () => {
  it('lives under backend/engine/test/, which the artifact guard already forbids', () => {
    expect(TRANSCRIPT_ROOT.split(sep)[0]).toBe('test');
    const guard = readFileSync(join('..', '..', 'scripts', 'standalone-harness.mjs'), 'utf8');
    expect(guard).toContain("label: 'backend/engine/test/**'");
  });

  it('files a recording under the pack, the requirement and the run identity', () => {
    expect(transcriptPath('root', 'testpack', 'TEST-R-001', 'run-v1-abc')).toBe(
      join('root', 'testpack', 'TEST-R-001', 'run-v1-abc.json'),
    );
  });
});

describe('a run, recorded and replayed', () => {
  it('round-trips through disk and reproduces the run', async () => {
    const live = await runVerificationPipeline(runInput(placeholderRunner((index) => lensFor(DEFAULT_ROLE_CONFIG, index))));
    expect(live.transcript.roles).toHaveLength(1 + DEFAULT_ROLE_CONFIG.prosecutorCount + 1);
    expect(live.transcript.roles.map((role) => `${role.role}:${role.index}`)).toEqual(['reader:0', ...DEFAULT_ROLE_CONFIG.lenses.map((_, i) => `prosecutor:${i}`), 'adjudicator:0']);

    const root = mkdtempSync(join(tmpdir(), 'datastrata-transcripts-'));
    const path = writeRunTranscript(root, live.transcript);
    expect(path).toBe(transcriptPath(root, 'testpack', 'TEST-R-001', live.runId));

    const readBack = readRunTranscript(root, 'testpack', 'TEST-R-001', live.runId);
    expect(readBack).toEqual(live.transcript);

    // The whole point: the recording alone drives a second run.
    const replayed = await runVerificationPipeline(runInput(replayRunner(readBack)));
    expect(replayed.runId).toBe(live.runId);
    expect(replayed.pipelineVersion).toBe(live.pipelineVersion);
    expect(replayed.tail.pins).toEqual(live.tail.pins);
    expect(serialiseTranscript(replayed.transcript)).toBe(serialiseTranscript(live.transcript));
  });

  it('re-recording an unchanged run writes the same bytes to the same path', async () => {
    const first = await runVerificationPipeline(runInput(placeholderRunner()));
    const second = await runVerificationPipeline(runInput(placeholderRunner()));
    expect(second.runId).toBe(first.runId);
    expect(serialiseTranscript(second.transcript)).toBe(serialiseTranscript(first.transcript));
  });

  it('a recording that does not cover a role fails loudly rather than substituting one', async () => {
    const live = await runVerificationPipeline(runInput(placeholderRunner()));
    // Missing the adjudicator: the replay runner itself refuses.
    const noAdjudicator = { ...live.transcript, roles: live.transcript.roles.slice(0, 1 + DEFAULT_ROLE_CONFIG.prosecutorCount) };
    await expect(
      runVerificationPipeline(runInput(replayRunner(noAdjudicator))),
    ).rejects.toBeInstanceOf(TranscriptReplayError);
    // Missing two prosecutors: the same refusal, renamed by the prosecutor
    // machinery so the message says which *lens* had no exchange rather than
    // only which index. Task 3 owns that translation.
    const short = { ...live.transcript, roles: live.transcript.roles.slice(0, 2) };
    await expect(runVerificationPipeline(runInput(replayRunner(short)))).rejects.toBeInstanceOf(
      ProsecutorTranscriptMissingError,
    );
    // Positive control: the complete recording drives the same run cleanly.
    await expect(runVerificationPipeline(runInput(replayRunner(live.transcript)))).resolves.toBeDefined();
  });
});

describe('transcript integrity', () => {
  it('refuses a transcript whole rather than half-reading it', () => {
    expect(() => parseRunTranscript('{ not json', 'x.json')).toThrow(TranscriptIntegrityError);
    let error: unknown;
    try {
      parseRunTranscript(JSON.stringify({ transcriptSchemaVersion: '1.0.0' }), 'x.json');
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(TranscriptIntegrityError);
    expect((error as TranscriptIntegrityError).problems.length).toBeGreaterThan(1);
  });

  it('refuses an unknown key rather than dropping it', async () => {
    const live = await runVerificationPipeline(runInput(placeholderRunner()));
    const text = JSON.stringify({ ...live.transcript, extraField: 'smuggled' });
    expect(() => parseRunTranscript(text)).toThrow(/extraField|Unrecognized/);
    // Positive control: the same transcript without the extra key parses.
    expect(() => parseRunTranscript(serialiseTranscript(live.transcript))).not.toThrow();
  });
});
