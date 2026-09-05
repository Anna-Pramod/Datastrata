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
 * **No provider-adapter field, deliberately.** The adapter's semantic identity
 * is a `pipelineVersion` input (`provider-adapter.ts`), and `runId` is derived
 * from `pipelineVersion` plus the question — so a recording made under one
 * adapter already cannot bind a run configured for another, and refuses at
 * `bind` naming `pipelineVersion`. Adding `providerAdapterId` here would buy no
 * binding and would create a second answer to which semantics a recording was
 * made under, free to disagree with the one the identity fixes.
 *
 * The cost is stated rather than hidden: a human opening a transcript alone sees
 * a digest, not `test-provider@2`. That is already true of the prompts, the lens
 * set and the closure policy, all of which are folded into the same digest. If
 * that readability is later wanted, the right shape is a *transcription* of the
 * configuration with a test asserting it agrees with the identity — never a
 * second field anything is allowed to read as authoritative.
 *
 * **No clock.** A transcript carries no timestamp and its filename is a derived
 * run identity, so recording the same run twice produces the same path and the
 * same bytes. A timestamped transcript would make the replay suite's inputs
 * unstable in the one dimension it most needs stable.
 *
 * This module is not walked by the field-accounting guard: its schemas describe
 * a test input rather than the record or the ledger. It still avoids
 * `.refine()`, so adding it to the guard later stays possible.
 *
 * # Storage trajectory — a B3 decision, recorded before it is forced
 *
 * Retaining exact messages is not free, and the cost is not in the answers.
 * B2's first five-exchange fixture is **~2.1 MB**, of which the recorded replies
 * total ~6 KB: every role reads through the entitled closure, so the closure's
 * rendered text is embedded once per exchange — five copies of two documents the
 * repository already stores once under `corpus/`.
 *
 * ```text
 * per exchange   ~3 KB prompt + ~405 KB rendered closure + ~1 KB reply
 * per run        x (2 + prosecutorCount)
 * ```
 *
 * That is acceptable for one B2 fixture and it is a trajectory for B3, which
 * creates transcript sets across a benchmark corpus. **Before B3 multiplies
 * them, measure the repository-growth curve and decide whether exact message
 * bytes need lossless deduplicated or content-addressed storage.** Two
 * constraints on any such change, both of which this file's invariants already
 * depend on:
 *
 *  - **exact recoverability** — the bytes must come back identical, because
 *    `requestSha256` is a digest over them and self-integrity is checked on read
 *  - **request binding preserved** — the digest must still be verifiable from
 *    whatever is stored
 *
 * **Dropping `messages` is not that optimisation.** Task 1 required exact
 * retention deliberately: they are the audit record of what each role was
 * actually shown, and replay's independence from them is what makes them safe
 * to keep rather than a reason to discard them.
 */

import { z } from 'zod';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { recordedRequest, requestSha256 } from './request-identity';

/**
 * The transcript format's own version, so a shape change is not silent.
 *
 * `1.1.0` adds the two binding fields — `lens` and `requestSha256` — that turn a
 * recording from "an output filed under a role name" into "an answer to a
 * request". A `1.0.0` recording carries neither, and is refused by this schema
 * rather than replayed with its binding unchecked: an unbindable recording is
 * exactly the thing the version exists to make loud. Nothing on disk was written
 * under `1.0.0` — B2 records its first transcripts here — so this is a contract
 * correction rather than a migration.
 *
 * Unrelated to `resultSchemaVersion`, which moves on its own. A transcript is
 * execution evidence for tests and never a regulatory record, so its shape is
 * not a thing any signature pins.
 */
export const TRANSCRIPT_SCHEMA_VERSION = '1.1.0';

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
    /**
     * The pass this execution worked, for the role that has one.
     *
     * Recorded separately from `requestSha256` even though the digest already
     * covers it, because the two answer different questions. The digest says
     * *that* the recording answers a different request; this says *which lens*
     * was expected and which was offered — and a prosecutor panel is the one
     * place where several executions differ in nothing else. Replay checks the
     * lens first for that reason, so the sharper diagnosis wins.
     */
    lens: z.string().optional(),
    /**
     * The digest of the request this is an answer to (`request-identity.ts`).
     *
     * The whole difference between a replayable recording and a stored output:
     * without it a `reader[0]` recorded against one requirement satisfies a
     * `reader[0]` lookup made against another, and the run proceeds over a
     * reading of a law it never read.
     *
     * Shaped here rather than asserted in a test, because "what a valid
     * recording looks like" is this file's contract and a check that lives only
     * in a suite is a contract only that suite enforces. `.regex()` is a
     * built-in refinement of the string type rather than a `.refine()`
     * predicate, so the header's note about staying walkable by the
     * field-accounting guard still holds.
     */
    requestSha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be a 64-character lowercase hex digest'),
    messages: z.array(transcriptMessageSchema).min(1),
    /**
     * The response text as the provider adapter returned it — the model's
     * content, not the HTTP envelope it arrived in (`live-runner.ts`). Replay
     * parses it at the same seam a live run does.
     */
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

/**
 * The exchanges a recording holds, addressed the way replay addresses them.
 *
 * Separate from the schema because `roleTranscriptSchema` describes one entry
 * and this is a property *between* entries, and because the header's promise
 * that this file stays free of `.refine()` predicates is worth keeping: a
 * cross-field rule expressed as a zod refinement is a rule the field-accounting
 * guard cannot walk.
 */
export function duplicateExchangeKeys(roles: readonly RoleTranscript[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const entry of roles) {
    const key = `${entry.role}[${entry.index}]`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

/**
 * The ways a recording can contradict itself, listed rather than only the first.
 *
 * Self-integrity and replay binding are **different properties**, and a system
 * that keeps ~2 MB of exact message bytes as audit evidence needs both:
 *
 * ```text
 * self-integrity   stored messages  -> stored requestSha256   (here)
 * replay binding   current request  -> stored requestSha256   (replay.ts)
 * ```
 *
 * Replay compares the digest of the request the *run* built against the stored
 * one. It never reads `messages`, so on its own it cannot notice that the
 * recording's message text has been altered — the two would disagree only if the
 * live request also changed. A transcript could therefore claim a role was shown
 * text it was never shown, and every gate would stay green while the retained
 * bytes said something false. The bytes are only worth their size if they are
 * bound to the digest that files them.
 *
 * Two invariants, because they are two different lies:
 *
 *  - **`messages` must digest to `requestSha256`.** The recording cannot
 *    misreport the question.
 *  - **There is exactly one reply, it is last, and it equals `outputJson`.** The
 *    recording cannot show a reader one answer while replay serves another, and
 *    cannot carry a second answer that no digest covers. The request digest
 *    excludes every `agent` message by construction, so without this the
 *    retained bytes could hold model-looking text nothing attests.
 *
 * **What neither invariant covers**, enumerated rather than gestured at, because
 * a paragraph naming one exception reads as exhaustive:
 *
 *  1. **The content of the answer.** `outputJson` and its message can be forged
 *     together and the seal recomputed — `resealed()` in the replay suite does
 *     exactly that. Self-integrity catches an **incoherent** recording, never an
 *     inauthentic one. What stops a coherently re-sealed forgery is the other
 *     property at the other boundary: replay comparing the digest against the
 *     request the *run* built (`replay.ts`). Neither substitutes for the other.
 *  2. **The run header.** Nothing digests `runId`, `packId`, `requirementId`,
 *     `pipelineVersion` or the three pins, and no entry is bound to the header
 *     it sits under. `bind` compares the header against the *live* run, so a
 *     replayed transcript is constrained — but a transcript read as an audit
 *     artifact, with no run to bind against, has an unverified header.
 *  3. **Membership across entries.** Entries are not bound to one another, so
 *     they can be spliced between runs. Replay's per-request fingerprints
 *     constrain this heavily; self-integrity does not constrain it at all.
 *  4. **Emptiness and index sanity.** `messages` is only `.min(1)`, which a lone
 *     reply satisfies, and the string fields carry no `.min()`.
 *  5. **Surplus exchanges on a halted run.** `settle` returns early when the run
 *     halted (`replay.ts`), by design — a halt is *owed* fewer exchanges — so a
 *     self-coherent extra exchange in a transcript replayed by a halting run is
 *     retained and never flagged.
 *  6. **Authenticity, full stop.** Nothing signs a transcript. "No model
 *     produced this" rests on `PROVENANCE.md` prose, not on a check.
 *
 * Pure, and computed from the stored entry alone — no world, no clock, no
 * filesystem.
 */
export function transcriptSelfIntegrityProblems(roles: readonly RoleTranscript[]): string[] {
  const problems: string[] = [];
  for (const entry of roles) {
    const key = `${entry.role}[${entry.index}]`;
    const recomputed = requestSha256(recordedRequest(entry));
    if (recomputed !== entry.requestSha256) {
      problems.push(
        `roles.${key}: the recorded messages digest to ${recomputed} but the entry claims ${entry.requestSha256}; the recording contradicts itself about what this role was sent, so its retained messages are not evidence of anything`,
      );
    }
    // Exactly one reply, and it is the last message.
    //
    // Not "the last `agent` message matches", which was the first version of
    // this check and left a hole precisely where the invariant is supposed to
    // close one: `recordedRequest` drops *every* `agent` message from the
    // digest, so a fabricated reply sitting anywhere before the trailing one is
    // covered by neither invariant — it would be retained, would read as model
    // output, and nothing would object. Replay could not serve it (only
    // `outputJson` is served), but "the messages are audit evidence" is the
    // whole reason they are kept, and evidence that can carry an unattributed
    // extra answer is not evidence.
    const replies = entry.messages.filter((message) => message.from === 'agent');
    const last = entry.messages[entry.messages.length - 1];
    if (replies.length === 0) {
      problems.push(
        `roles.${key}: no recorded reply from the role; an exchange with no answer in its messages is not a record of an exchange`,
      );
    } else if (replies.length > 1) {
      problems.push(
        `roles.${key}: ${replies.length} recorded replies for one exchange; a role answered once, and a second reply in the messages is retained text no digest covers and no execution produced`,
      );
    } else if (last === undefined || last.from !== 'agent') {
      problems.push(
        `roles.${key}: the recorded reply is not the last message; an answer followed by further questions is not the exchange that happened`,
      );
    } else if (last.content !== entry.outputJson) {
      problems.push(
        `roles.${key}: the recorded reply is not the response replay would serve; the messages show one answer and outputJson holds another, and only outputJson is replayed`,
      );
    }
  }
  return problems;
}

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
  // One exchange per execution, checked here rather than left to whoever
  // indexes the list. A recording holding two answers for `adjudicator[0]` is
  // not a recording of a run — it is two, and any consumer that builds a map
  // from it silently keeps one and discards the other by array position. Which
  // one survives would then decide what the published dossier says, which is
  // the opposite of a recording being evidence of an execution.
  const duplicates = duplicateExchangeKeys(parsed.data.roles);
  if (duplicates.length > 0) {
    throw new TranscriptIntegrityError(
      path,
      duplicates.map(
        (key) =>
          `roles: ${key} is recorded more than once; one execution has one recorded exchange, and a second answer for the same execution would be selected by position rather than by identity`,
      ),
    );
  }
  // Last, and only over a transcript already known to be well-shaped and
  // unambiguously addressed — so a self-integrity failure means the recording
  // contradicts itself, never that the JSON or the schema was the problem.
  assertTranscriptSelfIntegrity(parsed.data, path);

  return parsed.data;
}

/**
 * One semantic validator, for both ways a transcript reaches a run.
 *
 * A recording arrives at replay by two routes, and only one of them passes this
 * file: `readTranscriptsFor` parses from disk, and `replayRunner(run.transcript)`
 * hands over a typed object that never met the parser. Task 5e already learned
 * this boundary the hard way with duplicate `(role, index)` addressing, which had
 * to be refused in both places for the same reason — a guarantee that holds only
 * on the disk path is not a guarantee about replay.
 *
 * So this is a function rather than a step inside `parseRunTranscript`, and
 * `replay.ts` calls **this**, not a second implementation:
 *
 * ```text
 *              assertTranscriptSelfIntegrity
 *                    ↑              ↑
 *        parseRunTranscript     replay bind
 *           (disk path)        (in-memory path)
 * ```
 *
 * Pure, and deliberately re-run on the disk path too rather than skipped as
 * already-checked. Re-digesting a parsed transcript costs one pass over its
 * messages; making the check conditional on provenance would make "was this
 * validated?" a property of how the object arrived, which is exactly the
 * question the in-memory path answers wrongly.
 */
export function assertTranscriptSelfIntegrity(
  transcript: RunTranscript,
  // Neutral, not `<memory:…>`. A default that asserted provenance would have a
  // disk caller who forgot the argument print a message contradicting where the
  // file came from — during exactly the incident where provenance matters.
  label = `<transcript:${transcript.runId}>`,
): void {
  const problems = transcriptSelfIntegrityProblems(transcript.roles);
  if (problems.length > 0) throw new TranscriptIntegrityError(label, problems);
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
