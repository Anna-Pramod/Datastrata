/**
 * The signature candidate and the gate in front of it.
 *
 * Signing is the moment a human's judgement becomes a line in a file nothing
 * may rewrite, so two properties decide this module's shape.
 *
 * **One frozen derivation.** `buildSignature` is handed values that were read
 * once — the pack, the requirement, the corpus closure, the result, the
 * rendered condition — and returns an immutable candidate. Every precondition
 * in `assertSignable` runs against *that object*, and the line Task 4 appends
 * is *that object* serialised. There is no window between checking and writing,
 * because the checked values and the written values are the same values. This
 * file reads nothing itself: no filesystem, no clock, no network. The CLI does
 * the reading, once, which is also what makes every refusal here testable
 * without a fixture directory.
 *
 * **The gate is candidate consistency, not existing staleness**, and record
 * design §5.1 calls this "the correction that matters most in this document".
 * An earlier draft refused to sign on blocking staleness. That is wrong in the
 * worst direction:
 *
 *     staleness belongs to the existing governing entry,
 *     and signing is how a stale status is repaired.
 *
 * A requirement reading `stale_encoding` today reads it *because* its condition
 * was corrected — which is precisely why a fresh verification exists and wants
 * signing. Refusing on it inverts the mechanism and makes recovery impossible
 * exactly when it is required. So nothing in this file consults
 * `deriveStaleness`, and that absence is the design rather than an omission:
 * there is no staleness input here for a later reader to start comparing.
 *
 * Candidate consistency answers a different question — does the result being
 * signed describe the world as it is *now*? — and blocks. It compares the
 * result's pinned inputs against the candidate entry, which was built from
 * current state a moment earlier, so "the result versus the world" and "the
 * result versus the entry" are the same comparison.
 *
 * **What candidate consistency deliberately does not compare.**
 * `requirementSha256` and `requirementVersion` are left out. Editing a
 * `caution` string moves the whole-record hash and moves neither
 * `requirementInputSha256` nor `conditionSha256` — the agents consumed neither
 * — so blocking on it would refuse a sound verification over a warning nobody
 * verified. That is the same alarm-fatigue logic as raw-versus-normalized, and
 * factory §4.2 draws the two hashes apart for exactly this reason. The version
 * pin is still checked, but against the registry, and as an *integrity*
 * question rather than a freshness one.
 *
 * **Integrity failure is a separate category** (factory §4.4) with its own
 * error class and, in Task 4, its own exit code. A missing pinned result or a
 * document pinned by an existing entry but absent from the current corpus is
 * tampering-shaped: in an append-only, git-tracked repository a signed artefact
 * cannot vanish through ordinary drift. It is reported here together with any
 * ordinary refusals, because a signer needs the whole picture, but it is thrown
 * as its own class carrying its own `category` so a caller can tell "you may
 * not sign this yet" from "this repository is damaged".
 *
 * **Every refusal is reported, never the first.** A signer fixing one problem
 * at a time learns the next only after re-running, which costs one full cycle
 * per defect. Refusal is the feature.
 */

import { checkEvidenceSet, type EvidenceItem } from '../corpus/evidence';
import { sha256Hex } from '../corpus/hash';
import type { LoadedCorpus } from '../corpus/store';
import type { Requirement } from '../types';
import { renderRequirement, type RenderContext } from './render';
import {
  conditionSha256,
  logicalPayloadSha256,
  requirementInputSha256,
  requirementSha256,
} from './canonical';
import { entryId, type SigningEntry } from './ledger';
import { isPromoted, type PromotionRecord } from './promotions';
import type { VersionRegistry } from './registry';
import {
  assertResultConsistency,
  ResultConsistencyError,
  resultSha256,
  verificationResultSchema,
  type VerificationResult,
} from './result';
import type { StalenessReason } from './staleness';

/**
 * The nine ways signing is refused, from factory spec §4.5 as corrected.
 *
 * `integrity_failure` is a member although §4.4 files it as a separate
 * category: it is *surfaced* here alongside the others so a signer sees
 * everything wrong at once, and separated at the throw by class and by
 * `RefusalError.category`.
 */
export type RefusalCode =
  | 'mismatch'
  | 'open_question'
  | 'evidence_failed'
  | 'unresolved_gap'
  | 'invalid_result'
  | 'candidate_inconsistent'
  | 'integrity_failure'
  | 'red_suite'
  | 'unpromoted_pipeline';

/** One reason signing was refused, in the signer's terms. */
export interface Refusal {
  code: RefusalCode;
  detail: string;
}

/**
 * Every refusal from one gate run.
 *
 * `category` is carried as data rather than left to `instanceof` ordering.
 * `IntegrityFailureError` extends this class, so a caller mapping errors onto
 * exit codes with `instanceof` has to test the subclass first — an ordering
 * dependency that is invisible when written correctly and silent when written
 * backwards. A switch on `category` cannot be got wrong that way.
 */
export class RefusalError extends Error {
  readonly category: 'refusal' | 'integrity_failure' = 'refusal';

  constructor(public refusals: Refusal[]) {
    super(
      `Signing refused:\n - ${refusals.map((r) => `${r.code}: ${r.detail}`).join('\n - ')}`,
    );
    this.name = 'RefusalError';
  }
}

/**
 * The repository is damaged, not merely unready.
 *
 * Thrown instead of `RefusalError` when any refusal in the set is an integrity
 * failure, and carrying the whole set: the other problems are still real, and
 * hiding them behind the loudest one would cost the signer a cycle.
 */
export class IntegrityFailureError extends RefusalError {
  override readonly category = 'integrity_failure';

  constructor(refusals: Refusal[]) {
    super(refusals);
    this.name = 'IntegrityFailureError';
  }
}

/** A corpus document as the closure holds it now. Structurally the entry's pin. */
export type CorpusPin = SigningEntry['corpus'][number];

/**
 * Everything `buildSignature` needs, all of it already read.
 *
 * There is no `resultSha256`, `requirementSha256` or `conditionSha256` here:
 * each is derived below from the object it describes, so a caller cannot hand
 * in a hash of something other than what it also handed in. `renderedConditionSha256`
 * and `rendererVersion` *are* parameters, because rendering is the renderer's
 * business and re-deriving it here would put a second copy of that decision in
 * this file.
 */
export interface SignatureInput {
  /** Which of the two levels this signature asserts. */
  kind: 'verified' | 'ratified';
  packId: string;
  packVersion: string;
  /** The requirement as it stands now, already loaded and validated. */
  requirement: Requirement;
  /** The verification record being signed, already schema-parsed. */
  result: VerificationResult;
  /** The hash of the English the prosecutors and the reviewer read. */
  renderedConditionSha256: string;
  rendererVersion: string;
  /** The entitled closure's hash, as computed from the corpus now. */
  corpusClosureSha256: string;
  /** The closure's documents as they stand now. */
  corpus: readonly CorpusPin[];
  by: string;
  on: string;
  note?: string;
}

/**
 * The frozen candidate: the exact entry to be appended, plus the advisories
 * worth telling the signer about but not worth refusing over.
 */
export interface SignatureCandidate {
  entry: SigningEntry;
  advisories: StalenessReason[];
}

/**
 * The existing governing signature, when one exists, and whether the result it
 * pins is still on disk.
 *
 * A revoked governing entry carries no pins at all, so the CLI passes `null`
 * for it: there is nothing for an integrity check to be about. `resultPresent`
 * is a parameter because answering it means touching the filesystem, which
 * this module may not do.
 */
export interface ExistingSignature {
  entry: SigningEntry;
  resultPresent: boolean;
}

/**
 * Everything the gate consults beyond the candidate itself.
 *
 * `result` is passed again rather than read off the candidate because the
 * candidate carries only a *hash* of it, and most refusals are about the
 * record's contents. It must be the same object `buildSignature` was handed;
 * the identity checks below fail loudly if it is not.
 *
 * There is deliberately no staleness input. See the module header.
 */
export interface SignabilityInput {
  result: VerificationResult;
  /** Loaded once by the CLI; used to re-find every quote and re-run every absence search. */
  corpus: LoadedCorpus;
  registry: VersionRegistry;
  promotions: readonly PromotionRecord[];
  existing: ExistingSignature | null;
  /** Whether `npm test` is green. Running it is the CLI's job. */
  testSuiteGreen: boolean;
}

/**
 * The hash the entry's `conditionSha256` carries.
 *
 * A `boolean` requirement has a condition subtree and this is its hash, exactly
 * as factory §4.2 describes. A `selection` requirement has none — its logic
 * lives in ordered `cases[]` — while the ledger field is not optional, so the
 * logical payload stands in. The fallback is exported and documented rather
 * than buried, because the result and the entry must agree on which hash this
 * field holds; two callers guessing differently would produce a permanent,
 * silent candidate inconsistency for every selection requirement in the pack.
 */
export function candidateConditionSha256(requirement: Requirement): string {
  return requirement.condition === undefined
    ? logicalPayloadSha256(requirement)
    : conditionSha256(requirement.condition);
}

/**
 * The hash the entry's `renderedConditionSha256` carries: SHA-256 over the
 * *whole requirement's* English, not the condition subtree's.
 *
 * Exported for the same reason `candidateConditionSha256` is. Factory §4.2
 * calls this field "the exact English prosecutors and the reviewer read", and
 * what they read is `renderRequirement`'s output — the id, the title, and
 * either the condition or every selection case in evaluation order. A caller
 * reaching for `renderCondition` instead would produce a different hash from
 * the same requirement, and for a `selection` requirement it could produce none
 * at all, there being no top-level condition to render. Three callers must
 * agree on this value — the result producer, the entry builder and the review
 * sheet — and two of them guessing differently would show up as a permanent,
 * silent candidate inconsistency rather than as an error anyone could read.
 */
export function candidateRenderedConditionSha256(
  requirement: Requirement,
  ctx: RenderContext,
): string {
  return sha256Hex(renderRequirement(requirement, ctx));
}

/** Freezes an object and everything reachable through its own properties. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * Derives the candidate once, from values already read.
 *
 * The entry pins the world **as it is now**, never as the result recorded it.
 * That matters for `corpus[]` in particular: Task 4 resolves a
 * `normalizer_changed` by renormalising the *retained raw bytes*, so the bytes
 * a signature pins have to be the bytes on disk at signing time. Where the two
 * disagree in a way that matters, `assertSignable` refuses; where they disagree
 * only in raw bytes, that difference is recorded as an advisory here.
 *
 * A result naming a different requirement or pack throws rather than producing
 * a refusal. It is a caller error, not a state of the world: there is no
 * meaningful candidate for a refusal to be reported against, and returning one
 * would invite it to be signed.
 */
export function buildSignature(input: SignatureInput): SignatureCandidate {
  const { requirement, result } = input;

  if (result.packId !== input.packId || result.requirementId !== requirement.id) {
    throw new Error(
      `verification result names ${result.packId}/${result.requirementId}, but the candidate is for ${input.packId}/${requirement.id}`,
    );
  }

  const current = new Map(input.corpus.map((pin) => [pin.docId, pin]));

  // The documents the result rests on, taken at their current values and in
  // the result's own pin order. A pinned document missing from the closure now
  // is left out, and `assertSignable` reports it — the entry must not invent a
  // pin for a document the closure no longer holds.
  const corpus: CorpusPin[] = [];
  const advisories = new Set<StalenessReason>();
  for (const pinned of result.corpus) {
    const now = current.get(pinned.docId);
    if (now === undefined) continue;
    corpus.push({ ...now });
    if (now.sha256Normalized === pinned.sha256Normalized && now.sha256Raw !== pinned.sha256Raw) {
      // The publisher reissued the file and the words did not move.
      advisories.add('source_reissued');
    }
  }

  const unsigned: Omit<SigningEntry, 'entryId'> = {
    kind: input.kind,
    packId: input.packId,
    packVersion: input.packVersion,
    requirementId: requirement.id,
    requirementVersion: requirement.version,
    requirementSha256: requirementSha256(requirement),
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: input.renderedConditionSha256,
    rendererVersion: input.rendererVersion,
    corpusClosureSha256: input.corpusClosureSha256,
    corpus,
    resultSha256: resultSha256(result),
    pipelineVersion: result.pipelineVersion,
    by: input.by,
    on: input.on,
    ...(input.note === undefined ? {} : { note: input.note }),
  };

  return deepFreeze({
    entry: { ...unsigned, entryId: entryId(unsigned) },
    advisories: [...advisories].sort(),
  });
}

/** A hash in message form: enough to tell two apart, short enough to read. */
function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…`;
}

/**
 * Every reason this candidate may not be signed, or nothing.
 *
 * The checks are grouped by the question they answer rather than by the order
 * they are cheapest to run, and every group contributes to one list. Nothing
 * short-circuits: a candidate with a red suite and an unpromoted pipeline
 * reports both.
 */
export function assertSignable(candidate: SignatureCandidate, checks: SignabilityInput): void {
  const refusals: Refusal[] = [];
  const refuse = (code: RefusalCode, detail: string): void => {
    refusals.push({ code, detail });
  };
  const { entry } = candidate;
  const { result } = checks;

  // ── the record itself ───────────────────────────────────────────────────
  //
  // Structure first, then cross-field consistency: a rule reading two fields
  // cannot be evaluated over a value whose fields have not been checked. A
  // structurally invalid record also makes every content check below
  // meaningless, so those are skipped rather than run over rubble.
  const structural = verificationResultSchema.safeParse(result);
  if (!structural.success) {
    for (const issue of structural.error.issues) {
      refuse('invalid_result', `${issue.path.join('.') || '<root>'}: ${issue.message}`);
    }
  } else {
    try {
      assertResultConsistency(structural.data);
    } catch (error) {
      if (!(error instanceof ResultConsistencyError)) throw error;
      for (const problem of error.problems) refuse('invalid_result', problem);
    }

    // ── the verdicts ──────────────────────────────────────────────────────
    //
    // `MISMATCH` is refused categorically, never weighed: `verified` asserts
    // that the encoding matches the law, so it must never be possible to sign
    // "we verified that this encoding is wrong".
    for (const challenge of result.challenges) {
      if (challenge.verdict === 'MISMATCH') {
        refuse('mismatch', `challenge ${challenge.id} (${challenge.lens}): ${challenge.statement}`);
      }
      if (challenge.verdict === 'OPEN_QUESTION') {
        // An unadjudicated challenge is an outstanding OPEN_QUESTION item. A
        // gate reading only `openQuestions[]` would sign over an argument the
        // adjudicator never settled.
        refuse(
          'open_question',
          `challenge ${challenge.id} (${challenge.lens}) is unadjudicated: ${challenge.statement}`,
        );
      }
    }

    for (const question of result.openQuestions) {
      refuse('open_question', `${question.id}: ${question.statement}`);
    }

    for (const gap of result.gaps) {
      refuse('unresolved_gap', `${gap.kind} on ${gap.docId}: ${gap.detail}`);
    }

    // ── the evidence ──────────────────────────────────────────────────────
    //
    // Re-found against the corpus on disk, quote by quote, with every
    // `absence` search re-run. One refusal per conclusion whose evidence
    // failed, carrying all of that conclusion's problems: the signer repairs a
    // conclusion, not a quote.
    const sets: Array<{ label: string; items: EvidenceItem[] }> = [
      ...result.reading.elements.map((element) => ({
        label: `reading element ${element.id}`,
        items: element.evidence,
      })),
      ...result.challenges.map((challenge) => ({
        label: `challenge ${challenge.id}`,
        items: challenge.evidence,
      })),
    ];
    for (const { label, items } of sets) {
      const checked = checkEvidenceSet(items, checks.corpus);
      if (!checked.ok) refuse('evidence_failed', `${label}: ${checked.problems.join('; ')}`);
    }
  }

  // ── candidate consistency ───────────────────────────────────────────────
  //
  // The result's pinned inputs against the entry, which was derived from
  // current state. Existing-signature staleness is not consulted anywhere:
  // signing is how a stale status is repaired.
  const compared: Array<[string, string, string]> = [
    ['requirementInputSha256', result.requirementInputSha256, entry.requirementInputSha256],
    ['conditionSha256', result.conditionSha256, entry.conditionSha256],
    ['renderedConditionSha256', result.renderedConditionSha256, entry.renderedConditionSha256],
    ['corpusClosureSha256', result.corpusClosureSha256, entry.corpusClosureSha256],
  ];
  for (const [field, pinned, now] of compared) {
    if (pinned !== now) {
      refuse(
        'candidate_inconsistent',
        `${field}: the result was produced against ${shortHash(pinned)} but the current value is ${shortHash(now)}`,
      );
    }
  }

  const entryPins = new Map(entry.corpus.map((pin) => [pin.docId, pin]));
  for (const pinned of result.corpus) {
    const now = entryPins.get(pinned.docId);
    if (now === undefined) {
      refuse(
        'candidate_inconsistent',
        `${pinned.docId}: the result rests on this document, which the current closure no longer holds`,
      );
      continue;
    }
    if (now.sha256Normalized !== pinned.sha256Normalized) {
      refuse(
        'candidate_inconsistent',
        `${pinned.docId}: sha256Normalized was ${shortHash(pinned.sha256Normalized)} when it was read and is ${shortHash(now.sha256Normalized)} now — the words moved`,
      );
    }
    // A differing `sha256Raw` alone is advisory and already recorded on the
    // candidate. It is not repeated here: the words did not move.
  }

  // ── integrity ───────────────────────────────────────────────────────────
  //
  // The version registry first. It is classified `integrity`, never
  // `authority`: it can stop this operation and can never decide a status. The
  // lookup key is `String(version)` deliberately — every type in the system
  // holds `requirementVersion` as a number while the registry file keys by
  // string, JSON object keys being strings.
  const recorded = checks.registry[entry.requirementId]?.[String(entry.requirementVersion)];
  if (recorded === undefined) {
    refuse(
      'integrity_failure',
      `${entry.requirementId}: version ${entry.requirementVersion} is not recorded in the version registry — register ${entry.requirementSha256} against it, or restore the version this content was authored under`,
    );
  } else if (recorded !== entry.requirementSha256) {
    refuse(
      'integrity_failure',
      `${entry.requirementId}: content hashes to ${shortHash(entry.requirementSha256)} but the registry records version ${entry.requirementVersion} as ${shortHash(recorded)} — the content changed without a version bump`,
    );
  }

  const { existing } = checks;
  if (existing !== null) {
    if (!existing.resultPresent) {
      refuse(
        'integrity_failure',
        `the verification result pinned by governing entry ${existing.entry.entryId} (${shortHash(existing.entry.resultSha256)}) is absent — a signed artefact cannot vanish through ordinary drift`,
      );
    }
    const held = new Set(checks.corpus.index.documents.map((document) => document.docId));
    for (const pinned of existing.entry.corpus) {
      if (!held.has(pinned.docId)) {
        refuse(
          'integrity_failure',
          `${pinned.docId} is pinned by governing entry ${existing.entry.entryId} but is absent from the corpus — this is tampering-shaped, not staleness`,
        );
      }
    }
  }

  // ── the world around the signing ────────────────────────────────────────
  if (!checks.testSuiteGreen) {
    refuse('red_suite', 'the test suite is not green; a signature over a red build attests to nothing');
  }

  if (!isPromoted(checks.promotions, entry.pipelineVersion)) {
    refuse(
      'unpromoted_pipeline',
      `pipelineVersion ${entry.pipelineVersion} has no promotion record; "the pipeline was approved" must resolve to evidence rather than to a string`,
    );
  }

  if (refusals.length === 0) return;
  throw refusals.some((refusal) => refusal.code === 'integrity_failure')
    ? new IntegrityFailureError(refusals)
    : new RefusalError(refusals);
}
