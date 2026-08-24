/**
 * Replaying a recorded run through the production pipeline.
 *
 * Replay is an **execution capability**, not a second way to produce a dossier.
 * A transcript records what the agents said; it is not a dossier and cannot
 * become one. So the shape is deliberately this:
 *
 * ```text
 * transcript -> replay capability -> the same role boundaries
 *                                 -> the same orchestration
 *                                 -> the same assembler
 *                                 -> the same writer and record contract
 * ```
 *
 * and never `transcript -> reconstructed VerificationResult`. Everything
 * downstream of the seam — the reader's blindness projection, the prosecutors'
 * lens discipline, the coverage table, the adjudicator's evidence binding, the
 * gap canonicalisation, the deterministic tail, `assembleVerificationResult`,
 * the atomic writer — runs exactly as it does live, because the only thing
 * replay replaces is where a role's response text comes from.
 *
 * # Fail-closed, in four places
 *
 * A recording that is not an answer to the question being asked must refuse,
 * and refuse with a name that says which thing went wrong. **In the order the
 * code checks them**, which is the order that decides what an operator sees when
 * a recording is wrong in more than one way at once:
 *
 * ```text
 * read      a file's name is not its run identity        TranscriptMisfiledError
 * read      the file is not a valid transcript           TranscriptIntegrityError
 * bind      two recordings claim this run                TranscriptAmbiguousRunError
 * bind      no recording describes this run              TranscriptRunMismatchError
 * bind      the recording is internally ambiguous        TranscriptDuplicateExchangeError
 * bind      the recording contradicts itself             TranscriptIntegrityError
 * run       nothing was bound                            TranscriptUnboundError
 * run       there is no recording for this execution     TranscriptReplayError
 * run       the recording is for a different lens        TranscriptLensMismatchError
 * run       the recording answers a different request    TranscriptRequestMismatchError
 * run       this recording already answered once         TranscriptExchangeReusedError
 * settle    the recording held exchanges nothing used    TranscriptUnconsumedError
 * ```
 *
 * Selection comes before inspection, deliberately: a recording that describes a
 * different run is not this run's problem to diagnose, so "wrong run" is
 * reported ahead of "and it is also self-contradictory".
 *
 * **There is no fallback anywhere in this file.** A miss is a named refusal. It
 * imports no provider SDK, names no endpoint, reads no credential and has no
 * path that reaches `fetch`. A missing recording must never become a reason to
 * ask a model, because the whole value of the machinery suite is that it cannot
 * spend money by accident.
 *
 * # Why the run-level check is not merely the request check again
 *
 * `requestSha256` already binds everything a role was shown, so a transcript
 * recorded against another requirement would fail at the reader's first call
 * anyway. `bind` is still worth its own check for two reasons: it costs the run
 * **zero role executions** rather than one, and it can say *which* of the run's
 * identity fields moved — requirement, pipeline, closure — where a fingerprint
 * can only say that the question was different. The second is what makes a
 * cross-requirement replay a diagnosis instead of a mystery.
 *
 * # Selection is by derived identity, and ambiguity is refused rather than broken
 *
 * A directory may hold several recordings. The one that answers this run is the
 * one whose `runId` equals the run's own derived `runId` — never "the first
 * one", "the newest one" or "the only prosecutor recording". `runId` is derived
 * from the pipeline identity and the exact question (`run-identity.ts`), so
 * identity-addressed selection is the only kind that cannot quietly pick the
 * wrong file.
 *
 * **Identity-addressed selection is only sound if the address is unique**, and
 * saying so is not enough — the first version of this file said exactly that
 * while building its lookup with `new Map(...)`, which resolves a duplicated
 * `(role, index)` last-one-wins and drops the other entry where nothing could
 * see it. A recording carrying two answers for one execution was then accepted,
 * and which answer reached the published dossier was decided by array position.
 * So the two ways an address can be ambiguous are both refused outright:
 *
 * ```text
 * two entries for one (role, index)     TranscriptDuplicateExchangeError
 * two files claiming one runId          TranscriptAmbiguousRunError
 * a file whose name is not its runId    TranscriptMisfiledError
 * ```
 *
 * `TranscriptAmbiguousRunError` is this file's alone — it is about two *files*
 * claiming one identity, which the parser cannot see. The other two, **duplicate
 * addressing and self-contradiction, are checked here as well as in
 * `parseRunTranscript`**: a recording can reach a capability without ever
 * passing the parser — `replayRunner(run.transcript)` does exactly that — and a
 * guarantee that only holds on the disk path is not a guarantee about replay.
 *
 * Both go through the **same functions**, `duplicateExchangeKeys` and
 * `assertTranscriptSelfIntegrity`, defined once in `transcript.ts`. Not a second
 * implementation that agrees: a digest-only copy here would satisfy a sharing
 * test that drove one forgery through both doors, and would leave the reply
 * invariants unenforced on this path. `pipeline-replay.test.ts` drives every
 * forgery kind through both.
 *
 * Filesystem access is confined to `readTranscriptsFor`; everything else is
 * pure.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { requestSha256 } from './request-identity';
import type { RoleName, RoleRequest } from './roles';
import type { AgentRunner, RoleResponse, RunBinding, RunSettlement } from './runner';
import {
  assertTranscriptSelfIntegrity,
  duplicateExchangeKeys,
  parseRunTranscript,
  type RoleTranscript,
  type RunTranscript,
} from './transcript';

/** How one recorded exchange is addressed. Never an ordinal into an array. */
function keyOf(role: RoleName, index: number): string {
  return `${role}[${index}]`;
}

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

/**
 * A recorded exchange the replay capability could not find.
 *
 * Kept in the shape `prosecutors.ts` wraps: a configured lens with no exchange
 * is re-thrown there as `ProsecutorTranscriptMissingError`, which names the lens
 * as well as the index.
 */
export class TranscriptReplayError extends Error {
  constructor(
    readonly role: RoleName,
    readonly index: number,
    readonly runId: string,
  ) {
    super(
      `transcript ${runId} holds no recorded exchange for ${role}[${index}]: the recording and the run being replayed do not describe the same pipeline`,
    );
    this.name = 'TranscriptReplayError';
  }
}

/** Which run-identity fields a candidate recording disagrees about. */
export interface BindingDifference {
  field: keyof RunBinding;
  expected: string;
  found: string;
}

/**
 * No recording describes the run being executed.
 *
 * The message names the differing fields rather than only the two run ids,
 * because "these two 64-hex strings differ" is not a diagnosis and a
 * cross-requirement replay is the case an operator most needs named.
 */
export class TranscriptRunMismatchError extends Error {
  constructor(
    readonly binding: RunBinding,
    readonly differences: readonly BindingDifference[],
    readonly offered: readonly string[],
  ) {
    const detail =
      differences.length === 0
        ? 'no recording was offered at all'
        : differences
            .map((d) => `${d.field}: the run is ${d.expected}, the recording is ${d.found}`)
            .join('; ');
    super(
      `no recorded transcript describes run ${binding.runId} (${binding.packId}/${binding.requirementId}) — ${detail}. Offered: [${offered.join(', ')}]. A recording is selected by the run identity it was filed under, never by position, so a recording of a different question is refused rather than replayed.`,
    );
    this.name = 'TranscriptRunMismatchError';
  }
}

/**
 * A recording made for a different pass answered this one.
 *
 * The prosecutor panel is the only place several executions differ in nothing
 * but their lens, and the lens set is a `pipelineVersion` input: a run that let
 * lens *j*'s recording answer for lens *i* would record an identity for a
 * pipeline that did not execute.
 */
export class TranscriptLensMismatchError extends Error {
  constructor(
    readonly role: RoleName,
    readonly index: number,
    readonly expected: string | undefined,
    readonly found: string | undefined,
  ) {
    super(
      `${keyOf(role, index)} works lens ${expected ?? '<none>'} and the recording offered for it was made for lens ${found ?? '<none>'}: the lens set is a pipelineVersion input, so a recording from another pass may not answer this one`,
    );
    this.name = 'TranscriptLensMismatchError';
  }
}

/**
 * The recording is an answer to a different question.
 *
 * The catch-all binding, and the strongest one: the digest covers the prompt
 * file's text and the interpolated input, so it moves when the requirement, the
 * rendered condition, the entitled closure, the blind reading or the assembled
 * coverage table moves. An adjudicator recording made against one coverage
 * table cannot answer for another.
 */
export class TranscriptRequestMismatchError extends Error {
  constructor(
    readonly role: RoleName,
    readonly index: number,
    readonly expected: string,
    readonly found: string,
  ) {
    super(
      `${keyOf(role, index)} was sent a request fingerprinted ${expected} and the recording offered for it answers ${found}: the recording is an answer to a different question — a different requirement, a different reading, or a different coverage table — and is refused rather than replayed`,
    );
    this.name = 'TranscriptRequestMismatchError';
  }
}

/**
 * A recording holds two answers for one execution.
 *
 * Refused rather than resolved. There is no rule for choosing between them that
 * is not arbitrary — first, last, longest — and an arbitrary rule here decides
 * what a published dossier says about a law.
 */
export class TranscriptDuplicateExchangeError extends Error {
  constructor(
    readonly runId: string,
    readonly duplicates: readonly string[],
  ) {
    super(
      `transcript ${runId} records [${duplicates.join(', ')}] more than once: one execution has one recorded exchange, and choosing between two answers by position would let a shadow entry decide what the dossier says`,
    );
    this.name = 'TranscriptDuplicateExchangeError';
  }
}

/** Two recordings claim to answer the same run. */
export class TranscriptAmbiguousRunError extends Error {
  constructor(readonly runId: string, readonly count: number) {
    super(
      `${count} recordings claim run ${runId}: selection is by derived identity, so two files answering to one identity is an ambiguity to repair rather than a choice to make`,
    );
    this.name = 'TranscriptAmbiguousRunError';
  }
}

/** A recording is filed under a name that is not the run it answers. */
export class TranscriptMisfiledError extends Error {
  constructor(readonly path: string, readonly runId: string) {
    super(
      `${path} records run ${runId}: a recording's filename is its derived run identity, and one filed under any other name is addressed by something other than the question it answers`,
    );
    this.name = 'TranscriptMisfiledError';
  }
}

/** One recording was offered to two executions. */
export class TranscriptExchangeReusedError extends Error {
  constructor(
    readonly role: RoleName,
    readonly index: number,
  ) {
    super(
      `the recording for ${keyOf(role, index)} has already answered once and was asked again: one recorded exchange answers one execution, so a run that consumed it twice would report two independent passes over one response`,
    );
    this.name = 'TranscriptExchangeReusedError';
  }
}

/**
 * The recording held exchanges the run never asked for.
 *
 * How a recording of a *larger* pipeline fails instead of quietly satisfying a
 * smaller one: three recorded prosecutors replayed under a one-prosecutor
 * configuration leaves two unconsumed, and a run that accepted that would
 * publish a dossier whose `pipelineVersion` claims a lens set it did not work.
 */
export class TranscriptUnconsumedError extends Error {
  constructor(
    readonly runId: string,
    readonly unconsumed: readonly string[],
  ) {
    super(
      `transcript ${runId} holds ${unconsumed.length} recorded exchange(s) this run never asked for — [${unconsumed.join(', ')}]. The recording describes a larger pipeline than the one that ran, and a run that ignored the surplus would claim a pipelineVersion for a configuration it did not execute`,
    );
    this.name = 'TranscriptUnconsumedError';
  }
}

/** A replay capability was asked for a response before it knew the run. */
export class TranscriptUnboundError extends Error {
  constructor(
    readonly role: RoleName,
    readonly index: number,
  ) {
    super(
      `${keyOf(role, index)} asked a replay capability that has not been bound to a run: orchestration binds the capability to the run identity before the first role call, and a capability answering without that binding would serve a recording nothing had checked`,
    );
    this.name = 'TranscriptUnboundError';
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** The binding fields a candidate recording is compared on, in report order. */
const BINDING_FIELDS: readonly (keyof RunBinding)[] = [
  'packId',
  'requirementId',
  'pipelineVersion',
  'requirementInputSha256',
  'renderedConditionSha256',
  'corpusClosureSha256',
  'runId',
];

/**
 * How a candidate differs from the run.
 *
 * The structured half of a mismatch: `TranscriptRunMismatchError` carries the
 * list on `.differences`, so an assertion that "the requirement moved" names the
 * field rather than matching prose. Exported for the same reason — a caller
 * diagnosing a mismatch should not have to parse a message.
 */
export function bindingDifferences(
  binding: RunBinding,
  candidate: RunTranscript,
): BindingDifference[] {
  const differences: BindingDifference[] = [];
  for (const field of BINDING_FIELDS) {
    if (binding[field] !== candidate[field]) {
      differences.push({ field, expected: binding[field], found: candidate[field] });
    }
  }
  return differences;
}

/**
 * The candidate whose differences are fewest, for the message only.
 *
 * Selection itself is exact — `runId` equality and nothing else. This picks
 * which near-miss to explain when nothing matched, and a wrong choice here
 * makes a message less helpful, never a wrong recording usable.
 */
function closest(binding: RunBinding, candidates: readonly RunTranscript[]): BindingDifference[] {
  let best: BindingDifference[] | null = null;
  for (const candidate of candidates) {
    const differences = bindingDifferences(binding, candidate);
    if (best === null || differences.length < best.length) best = differences;
  }
  return best ?? [];
}

// ---------------------------------------------------------------------------
// The capability
// ---------------------------------------------------------------------------

/**
 * A replay capability over one or more recordings.
 *
 * `kind` is `'replay'`, which is what `pipeline-runner.test.ts` reads to assert
 * that the machinery suite is not holding something live.
 */
export function replayCapability(transcripts: readonly RunTranscript[]): AgentRunner {
  let selected: RunTranscript | null = null;
  let byKey = new Map<string, RoleTranscript>();
  const consumed = new Set<string>();

  return {
    kind: 'replay',

    bind(binding: RunBinding): void {
      const claiming = transcripts.filter((transcript) => transcript.runId === binding.runId);
      if (claiming.length > 1) throw new TranscriptAmbiguousRunError(binding.runId, claiming.length);
      const match = claiming[0];
      if (match === undefined) {
        throw new TranscriptRunMismatchError(
          binding,
          closest(binding, transcripts),
          transcripts.map((transcript) => transcript.runId),
        );
      }
      // Before anything is indexed. `new Map` would resolve a duplicated
      // `(role, index)` last-one-wins and drop the other entry somewhere
      // nothing can observe it — not `run`, which only ever sees the survivor,
      // and not `settle`, whose unconsumed check walks the map rather than the
      // list. Checked here as well as in `parseRunTranscript` because a
      // transcript can reach a capability in memory without passing the parser.
      const duplicates = duplicateExchangeKeys(match.roles);
      if (duplicates.length > 0) throw new TranscriptDuplicateExchangeError(match.runId, duplicates);

      // And the recording must not contradict itself about what it holds.
      //
      // The same reasoning as the duplicate check directly above, and the same
      // reasoning that put `duplicateExchangeKeys` in `transcript.ts` rather
      // than here: `replayRunner(run.transcript)` hands over a typed object that
      // never met `parseRunTranscript`, so a transcript whose messages have been
      // altered while its stored digest was left alone would be accepted, and
      // would answer — because `run` compares the *live* request against the
      // stored digest and never reads the stored messages at all. The retained
      // messages would then be evidence of nothing on this path while the disk
      // path's guarantee looked like it covered them.
      //
      // One validator, two callers. Not a second algorithm.
      //
      // Only the *selected* recording is validated. A forged sibling in the same
      // capability is never served — selection is exact — and on the disk path
      // it cannot arrive unvalidated anyway, because `readTranscriptsFor` parses
      // every file in the directory before `bind` runs.
      assertTranscriptSelfIntegrity(match);
      // Exact `runId` equality is the selection, and the rest of the binding is
      // then re-checked field by field. `runId` is a digest *of* those fields,
      // so this can only fail if two different questions collided — but a
      // selection that trusted a digest it never re-derived would be trusting
      // the recording's own account of what it answers.
      const differences = bindingDifferences(binding, match);
      if (differences.length > 0) {
        throw new TranscriptRunMismatchError(binding, differences, [match.runId]);
      }
      selected = match;
      byKey = new Map(match.roles.map((entry) => [keyOf(entry.role, entry.index), entry]));
      consumed.clear();
    },

    run(request: RoleRequest): Promise<RoleResponse> {
      if (selected === null) throw new TranscriptUnboundError(request.role, request.index);
      const key = keyOf(request.role, request.index);

      const recorded = byKey.get(key);
      if (recorded === undefined) {
        throw new TranscriptReplayError(request.role, request.index, selected.runId);
      }
      if (consumed.has(key)) {
        throw new TranscriptExchangeReusedError(request.role, request.index);
      }

      // Lens before fingerprint, deliberately. A lens swap moves both — the
      // rendered input carries the lens as a heading — and the lens message is
      // the one that says which pass was expected and which was offered.
      if (recorded.lens !== request.lens) {
        throw new TranscriptLensMismatchError(
          request.role,
          request.index,
          request.lens,
          recorded.lens,
        );
      }

      const fingerprint = requestSha256(request);
      if (recorded.requestSha256 !== fingerprint) {
        throw new TranscriptRequestMismatchError(
          request.role,
          request.index,
          fingerprint,
          recorded.requestSha256,
        );
      }

      consumed.add(key);
      return Promise.resolve({ outputJson: recorded.outputJson });
    },

    settle(outcome: RunSettlement): void {
      // A halted run consumes fewer exchanges *by design*: agent verification
      // stops at a gap, so the prosecutors and the adjudicator after it never
      // run. Requiring full consumption there would turn the correct halt into
      // a replay failure.
      if (outcome.halted) return;
      if (selected === null) return;
      const unconsumed = [...byKey.keys()].filter((key) => !consumed.has(key));
      if (unconsumed.length > 0) {
        throw new TranscriptUnconsumedError(selected.runId, unconsumed);
      }
    },
  };
}

/** The single-recording case, which is what one run's own transcript is. */
export function replayRunner(transcript: RunTranscript): AgentRunner {
  return replayCapability([transcript]);
}

// ---------------------------------------------------------------------------
// Reading recordings off disk
// ---------------------------------------------------------------------------

/**
 * Every recording filed for one pack and requirement, validated.
 *
 * Reads the whole directory rather than one named file because the caller does
 * not know a run's `runId` before the run derives it — and must not compute one
 * for itself, which would be a second derivation of the run identity. Selection
 * stays exact: `bind` matches on `runId`, so reading several candidates is not
 * the same as accepting any of them.
 *
 * A file that is not a valid transcript throws `TranscriptIntegrityError`
 * naming the path. That is deliberately a *different* failure from a role
 * response that is invalid (`RoleOutputError`) and from a recording that is
 * absent (`TranscriptReplayError`): damaged storage, a bad model response and a
 * misaddressed recording are three different things to go and fix.
 *
 * An absent directory yields no recordings rather than throwing, so "there is
 * no recording for this run" arrives as one refusal at `bind` rather than as
 * two different failures depending on whether a sibling recording happens to
 * exist.
 */
export function readTranscriptsFor(
  root: string,
  packId: string,
  requirementId: string,
): RunTranscript[] {
  const dir = join(root, packId, requirementId);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => {
      const path = join(dir, entry);
      const transcript = parseRunTranscript(readFileSync(path, 'utf8'), path);
      // `writeRunTranscript` files under the derived identity; nothing on the
      // read side used to re-establish that, so two files under arbitrary names
      // could both claim one `runId` and the alphabetically-first would answer.
      // The filing rule is only a property if the reader checks it too.
      if (entry !== `${transcript.runId}.json`) {
        throw new TranscriptMisfiledError(path, transcript.runId);
      }
      return transcript;
    });
}

/** A replay capability over everything filed for one pack and requirement. */
export function replayFromRoot(root: string, packId: string, requirementId: string): AgentRunner {
  return replayCapability(readTranscriptsFor(root, packId, requirementId));
}
