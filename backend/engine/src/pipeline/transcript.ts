/**
 * What a run recorded, and what a recording belongs to.
 *
 * Spec §5.2 gives the machinery suite recorded transcripts as its only input:
 * it proves that parsing, schema validation, evidence checking, coverage
 * computation, verdict handling and staleness derivation have not regressed,
 * and it proves that with no network and no spend. That is only true if a
 * transcript is *sufficient to replay the run* — so the shape below carries the
 * exact messages each role was sent and the exact JSON it returned, rather than
 * a summary of either.
 *
 * **Everything here is a string, deliberately.** A transcript that stored a
 * pre-parsed role output would be storing the parser's opinion of the response,
 * and replay would then exercise the machinery downstream of the seam while
 * skipping the seam itself — which is one of the things the machinery suite
 * exists to test. `outputJson` is the response text; replay hands it to the same
 * parser a live run would.
 *
 * **Transcripts live under `backend/engine/test/`.** They are test inputs, not
 * runtime inputs, and the artifact-hygiene guard in
 * `scripts/standalone-harness.mjs` already forbids `backend/engine/test/**` in
 * the deployable artifact. Putting them there makes "a transcript never reaches
 * production" a property an existing gate enforces rather than a convention
 * somebody remembers.
 *
 * **No clock.** A transcript carries no timestamp and its filename is a derived
 * run identity, so recording the same run twice produces the same path and the
 * same bytes. A timestamped transcript would make the replay suite's inputs
 * unstable in the one dimension it most needs stable.
 *
 * This module is not walked by the field-accounting guard: its schemas describe
 * a test input rather than the record or the ledger. It still avoids
 * `.refine()`, so adding it to the guard later stays possible.
 */

import { z } from 'zod';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/** The transcript format's own version, so a shape change is not silent. */
export const TRANSCRIPT_SCHEMA_VERSION = '1.0.0';

/** Where transcripts live, relative to `backend/engine`. */
export const TRANSCRIPT_ROOT = join('test', 'verification-transcripts');

const roleNameSchema = z.enum(['reader', 'prosecutor', 'adjudicator']);

/**
 * One message in the exchange.
 *
 * The prompt file's text and the interpolated inputs both land here, which is
 * the other half of "`promptSha256` is the hash of the file": the file is
 * pinned by its hash, and what was interpolated into it is transcript content.
 * A hash of the assembled string would pin neither reproducibly.
 */
export const transcriptMessageSchema = z
  .object({
    from: z.enum(['prompt', 'input', 'agent']),
    content: z.string(),
  })
  .strict();

export type TranscriptMessage = z.infer<typeof transcriptMessageSchema>;

/** One role execution, recorded. */
export const roleTranscriptSchema = z
  .object({
    role: roleNameSchema,
    index: z.number().int().nonnegative(),
    model: z.string(),
    promptSha256: z.string(),
    messages: z.array(transcriptMessageSchema).min(1),
    /** The response text, exactly as returned. Replay parses it at the seam. */
    outputJson: z.string(),
  })
  .strict();

export type RoleTranscript = z.infer<typeof roleTranscriptSchema>;

/**
 * A whole run.
 *
 * The pins on this record are the *tail's*, not any agent's: they say which
 * requirement, closure and pipeline identity the recording belongs to, so that
 * replaying it against a moved world is detectable rather than silently
 * comparing a recording to a different question.
 */
export const runTranscriptSchema = z
  .object({
    transcriptSchemaVersion: z.literal(TRANSCRIPT_SCHEMA_VERSION),
    runId: z.string(),
    packId: z.string(),
    requirementId: z.string(),
    pipelineVersion: z.string(),
    requirementInputSha256: z.string(),
    renderedConditionSha256: z.string(),
    corpusClosureSha256: z.string(),
    roles: z.array(roleTranscriptSchema).min(1),
  })
  .strict();

export type RunTranscript = z.infer<typeof runTranscriptSchema>;

/** Every problem found reading one transcript, never only the first. */
export class TranscriptIntegrityError extends Error {
  constructor(
    readonly path: string,
    readonly problems: string[],
  ) {
    super(`Transcript ${path} is not a valid run transcript:\n - ${problems.join('\n - ')}`);
    this.name = 'TranscriptIntegrityError';
  }
}

/**
 * Where one run's transcript lives.
 *
 * `<root>/<packId>/<requirementId>/<runId>.json`. The run identity is the
 * filename because it is derived from the run's own inputs
 * (`run-identity.ts`), so a recording cannot be filed under a question it does
 * not answer, and re-recording an unchanged run overwrites itself rather than
 * accumulating near-duplicates nobody can choose between.
 */
export function transcriptPath(
  root: string,
  packId: string,
  requirementId: string,
  runId: string,
): string {
  return join(root, packId, requirementId, `${runId}.json`);
}

/** Canonical on-disk text: pretty JSON with a trailing newline, so diffs read. */
export function serialiseTranscript(transcript: RunTranscript): string {
  return `${JSON.stringify(transcript, null, 2)}\n`;
}

/**
 * Parses a transcript, or refuses it whole.
 *
 * Partial acceptance is not offered: a run replayed from half a recording is a
 * different run, and the suite would report a pass over it.
 */
export function parseRunTranscript(text: string, path = '<memory>'): RunTranscript {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TranscriptIntegrityError(path, [`not valid JSON — ${detail}`]);
  }
  const parsed = runTranscriptSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TranscriptIntegrityError(
      path,
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    );
  }
  return parsed.data;
}

/** Writes one transcript, creating its pack/requirement directories. */
export function writeRunTranscript(root: string, transcript: RunTranscript): string {
  const path = transcriptPath(root, transcript.packId, transcript.requirementId, transcript.runId);
  mkdirSync(join(root, transcript.packId, transcript.requirementId), { recursive: true });
  writeFileSync(path, serialiseTranscript(transcript), 'utf8');
  return path;
}

/** Reads one transcript back, validated. */
export function readRunTranscript(
  root: string,
  packId: string,
  requirementId: string,
  runId: string,
): RunTranscript {
  const path = transcriptPath(root, packId, requirementId, runId);
  return parseRunTranscript(readFileSync(path, 'utf8'), path);
}
