/**
 * The sign CLI — the one sanctioned way a judgement becomes a line in the
 * ledger.
 *
 * `src/verification/` is pure by constraint: no filesystem, no clock, no
 * network. Everything it needs is handed to it. This file is the layer that
 * does the handing — it reads the pack, the corpus, the closure, the result,
 * the promotion ledger and the signature ledger, calls `buildSignature` once,
 * runs the gate against that frozen candidate, appends it, and then reads the
 * ledger back off disk to check what actually landed.
 *
 * **Why there is a second read at all.** The freeze closes the
 * check-then-recompute gap: the values checked and the values written are the
 * same object, so nothing can move between the check and the write. It cannot
 * close the gap around the *whole operation*. Between the append and the
 * report, another signing event can become governing — today only through
 * operator error, later through genuine concurrency — and the world can move
 * underneath both. Only a read from disk sees that.
 *
 * **The post-write check asserts three things together, and the entry-id
 * comparison is the load-bearing one** (record design §5):
 *
 * ```
 * verified | ratified:
 *   governing.entryId === candidate.entryId
 *   AND staleness(governing) is empty
 *   AND derivedStatus === candidate.kind
 * ```
 *
 * Confirming freshness alone is not enough. A check asking only "is the
 * governing entry fresh?" reports success for *someone else's* entry, which is
 * a report about a different operation than the one the operator ran. Asserting
 * the governing entry **is the one just written** is what makes the report
 * about this signing.
 *
 * **`normalizer_changed` is resolved here, not detected here.** Factory §4.3
 * defines the state as the *outcome* of renormalising: re-run the current
 * normalizer over the retained raw bytes and compare; identical means still
 * fresh. `deriveStaleness` is pure and has no bytes, so it can only detect the
 * version difference. Resolving it belongs to the layer that can open the raw
 * store — this one. Without the resolution, one normalizer bump blocks every
 * signature in the pack at once, which is precisely the alarm-fatigue failure
 * the raw-versus-normalized split exists to prevent: an alarm that fires on
 * cosmetic churn is an alarm that gets ignored, and then it has stopped
 * working.
 *
 * **Structural validation happens before `buildSignature`.** `buildSignature`
 * calls `resultSha256`, which parses, so a structurally invalid result throws
 * before a candidate exists and never reaches `assertSignable`. Only cross-field
 * inconsistency reaches the gate through the natural path — deliberately, since
 * `resultSha256` does not re-run `assertResultConsistency`, which is what lets
 * `stale_result` hash a record that has drifted. So the structural case is
 * raised here and reported as `invalid_result`, rather than a raw `ZodError`
 * escaping a CLI whose entire contract is a documented exit code.
 *
 * **The append is one `appendFileSync` of one line plus `\n`**, matching the
 * framing `parseLedger` requires: a POSIX text file ends with exactly one
 * newline, and any other blank segment is damage. The line is `canonicalJson`,
 * the same serialiser `entryId` hashes, so the bytes on disk and the bytes the
 * id was taken over cannot drift into two answers to "is this still what was
 * signed".
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ClosureEntryNotFoundError, computeClosure, docsForSources } from '../corpus/closure';
import { sha256Hex } from '../corpus/hash';
import { normalize } from '../corpus/normalize';
import { loadCorpus, type LoadedCorpus } from '../corpus/store';
import { CorpusIntegrityError } from '../corpus/schema';
import { loadPack, PackIntegrityError } from '../knowledge/loader';
import type { KnowledgePack, Requirement } from '../types';
import { canonicalJson, requirementInputSha256 } from '../verification/canonical';
import {
  governingEntry,
  LedgerIntegrityError,
  parseLedger,
  type LedgerEntry,
  type SigningEntry,
} from '../verification/ledger';
import {
  parsePromotions,
  PromotionsIntegrityError,
  type PromotionRecord,
} from '../verification/promotions';
import { RENDERER_VERSION, type RenderContext } from '../verification/render';
import {
  parseVersionRegistry,
  VersionIntegrityError,
  type VersionRegistry,
} from '../verification/registry';
import { verificationResultSchema, type VerificationResult } from '../verification/result';
import {
  assertSignable,
  buildSignature,
  candidateConditionSha256,
  candidateRenderedConditionSha256,
  IntegrityFailureError,
  RefusalError,
} from '../verification/sign';
import { currentStateOf } from '../verification/current-state';
import {
  deriveStaleness,
  resolveNormalizerChanged,
  type CurrentState,
  type StalenessReason,
} from '../verification/staleness';
import { deriveStatus, toStatusInput } from '../verification/status';
import {
  EXIT_FORENSICS_REQUIRED,
  EXIT_INTEGRITY_FAILURE,
  EXIT_OK,
  EXIT_REFUSED,
  EXIT_USAGE,
  type CliOutcome,
} from './exit-codes';

/**
 * The three roots the CLI reads. Parameters rather than constants, so a test can
 * point the writes at a temp directory while still reading the real pack and the
 * real corpus — the CLI's job *is* reading the world, and a test against a
 * synthetic world would exercise the fixture instead.
 */
export interface VerifyPaths {
  /** `knowledge/<packId>` — the authored pack. */
  packDir: string;
  /** The corpus root holding `index.json`, `raw/` and `normalized/`. */
  corpusDir: string;
  /** `verification/` — the ledger, the promotion ledger, the registry, the results. */
  verificationDir: string;
}

export interface SignArgs {
  packId: string;
  requirementId: string;
  by: string;
  /** Which of the two levels this signature asserts. */
  kind: 'verified' | 'ratified';
  /** The signing date. Supplied rather than read, so the operation is reproducible. */
  on: string;
  note?: string;
  /**
   * Whether `npm test` is green. A signature over a red build attests to
   * nothing, so the gate refuses without it. Running the suite is the entry
   * point's job, never this function's: a `runSign` that shelled out to
   * `npm test` could not be called from inside `npm test`.
   */
  testSuiteGreen: boolean;
}

/**
 * Seams for exercising what is otherwise unreachable in a single-threaded test.
 *
 * `onAppended` fires after the line is on disk and before the ledger is read
 * back — the exact window in which another entry can become governing. The race
 * is real and the window is real; only its *timing* is beyond a test's reach,
 * and a post-write check nobody can make fail is a post-write check nobody has
 * tested.
 */
export interface WriteHooks {
  onAppended?: () => void;
}

// ---------------------------------------------------------------------------
// Paths, by convention
// ---------------------------------------------------------------------------

export const ledgerPath = (paths: VerifyPaths): string =>
  join(paths.verificationDir, 'signatures.jsonl');

export const promotionsPath = (paths: VerifyPaths): string =>
  join(paths.verificationDir, 'promotions.jsonl');

/** Factory §4.2: `verification/<packId>/<requirementId>/verification-result.json`. */
export const resultPath = (paths: VerifyPaths, packId: string, requirementId: string): string =>
  join(paths.verificationDir, packId, requirementId, 'verification-result.json');

const registryDir = (paths: VerifyPaths): string =>
  join(paths.verificationDir, 'requirement-versions');

// ---------------------------------------------------------------------------
// Failure, with its exit code already chosen
// ---------------------------------------------------------------------------

/**
 * A failure carrying the code it maps to.
 *
 * Choosing the code where the condition is detected — rather than re-deriving
 * it from an error class at the outermost `catch` — is what keeps "you may not
 * sign this yet" and "this repository is damaged" from collapsing into each
 * other as new cases are added.
 */
class CliFailure extends Error {
  constructor(
    readonly exitCode: number,
    readonly lines: string[],
  ) {
    super(lines.join('\n'));
    this.name = 'CliFailure';
  }
}

/** Builds a `CliFailure` from outside this module, so the class itself stays private. */
export function cliFailure(exitCode: number, lines: string[]): Error {
  return new CliFailure(exitCode, lines);
}

/**
 * Turns a thrown `CliFailure` back into an outcome for callers outside this
 * module — `revoke.ts` runs the same read-or-fail helpers and must not
 * re-derive the mapping.
 */
export function outcomeFor(error: unknown): CliOutcome | null {
  return error instanceof CliFailure ? { exitCode: error.exitCode, lines: error.lines } : null;
}

// ---------------------------------------------------------------------------
// Reading the world
// ---------------------------------------------------------------------------

/**
 * A file that may legitimately not exist yet.
 *
 * An absent ledger is an empty ledger — nothing has been signed. An absent
 * promotion ledger is one with no promotions, which refuses every signature
 * rather than admitting one. Absence fails closed in both.
 */
function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Everything current state is derived from, read once. */
interface CurrentWorld {
  pack: KnowledgePack;
  requirement: Requirement;
  corpus: LoadedCorpus;
  renderCtx: RenderContext;
  requirementInputSha256: string;
  conditionSha256: string;
  renderedConditionSha256: string;
  closureSha256: string;
  /** The closure's documents as the corpus holds them now. */
  pins: SigningEntry['corpus'];
}

function readWorld(paths: VerifyPaths, packId: string, requirementId: string): CurrentWorld {
  let pack: KnowledgePack;
  try {
    pack = loadPack(paths.packDir, { versionRegistryDir: registryDir(paths) });
  } catch (error) {
    if (error instanceof VersionIntegrityError || error instanceof PackIntegrityError) {
      throw new CliFailure(EXIT_INTEGRITY_FAILURE, [
        'INTEGRITY FAILURE — the knowledge pack does not load.',
        ...error.problems.map((problem) => `  - ${problem}`),
      ]);
    }
    throw error;
  }

  if (pack.id !== packId) {
    throw new CliFailure(EXIT_USAGE, [
      `Usage: ${paths.packDir} holds pack ${pack.id}, but ${packId} was named.`,
    ]);
  }

  const requirement = pack.requirements.find((r) => r.id === requirementId);
  if (requirement === undefined) {
    throw new CliFailure(EXIT_USAGE, [
      `Usage: pack ${packId} carries no requirement ${requirementId}.`,
    ]);
  }

  let corpus: LoadedCorpus;
  try {
    corpus = loadCorpus(paths.corpusDir);
  } catch (error) {
    if (error instanceof CorpusIntegrityError) {
      throw new CliFailure(EXIT_INTEGRITY_FAILURE, [
        'INTEGRITY FAILURE — the corpus does not load.',
        ...error.problems.map((problem) => `  - ${problem}`),
      ]);
    }
    throw error;
  }

  const renderCtx: RenderContext = { factTypes: pack.factTypes, catalogues: pack.catalogues };

  let closure;
  try {
    closure = computeClosure(corpus.index, docsForSources(corpus.index, requirement.sources));
  } catch (error) {
    if (error instanceof ClosureEntryNotFoundError) {
      // Factory §4.2 files this as a `corpus_gap`, answered by ingesting the
      // document rather than by closing over its absence.
      throw new CliFailure(EXIT_REFUSED, [
        'REFUSED — the entitled closure cannot be computed.',
        `  - unresolved_gap: ${error.message}`,
      ]);
    }
    throw error;
  }

  const pins = closure.docIds.map((docId) => {
    const document = corpus.document(docId);
    return {
      docId,
      versionLabel: document.versionLabel,
      sha256Raw: document.sha256Raw,
      sha256Normalized: document.sha256Normalized,
      normalizerVersion: document.normalizerVersion,
    };
  });

  return {
    pack,
    requirement,
    corpus,
    renderCtx,
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderCtx),
    closureSha256: closure.sha256,
    pins,
  };
}

/**
 * Reads the ledger, or refuses to operate at all.
 *
 * An unreadable ledger is **forensics required**, not a refusal. A tampered
 * `entryId`, a blank line or a revocation naming no earlier entry fails the
 * whole load, because an append-only file nothing may rewrite must not be
 * partially readable — and appending to a history whose contents are in question
 * would add a line whose meaning depends on lines nobody can trust.
 *
 * `revoke` is subject to the same rule, and that is correct rather than a gap:
 * record design §3 guarantees a revocation carries no *verification pins*, so
 * withdrawal survives a broken corpus and a deleted result file. It was never a
 * guarantee that a compromised ledger stays writable.
 */
export function readLedgerOrFail(paths: VerifyPaths): LedgerEntry[] {
  const text = readIfPresent(ledgerPath(paths)) ?? '';
  try {
    return parseLedger(text);
  } catch (error) {
    if (error instanceof LedgerIntegrityError) {
      throw new CliFailure(EXIT_FORENSICS_REQUIRED, [
        'FORENSICS REQUIRED — the signature ledger cannot be read, so its history is itself in question.',
        `  ${ledgerPath(paths)}`,
        ...error.problems.map((problem) => `  - ${problem}`),
        '  Nothing may be appended to a history that cannot be read. Investigate before writing.',
      ]);
    }
    throw error;
  }
}

function readPromotionsOrFail(paths: VerifyPaths): PromotionRecord[] {
  const text = readIfPresent(promotionsPath(paths)) ?? '';
  try {
    return parsePromotions(text);
  } catch (error) {
    if (error instanceof PromotionsIntegrityError) {
      throw new CliFailure(EXIT_INTEGRITY_FAILURE, [
        'INTEGRITY FAILURE — the promotion ledger cannot be read.',
        ...error.problems.map((problem) => `  - ${problem}`),
      ]);
    }
    throw error;
  }
}

function readRegistryOrFail(paths: VerifyPaths, packId: string): VersionRegistry {
  const path = join(registryDir(paths), `${packId}.json`);
  const raw = readIfPresent(path);
  if (raw === null) {
    throw new CliFailure(EXIT_INTEGRITY_FAILURE, [
      `INTEGRITY FAILURE — no version registry for pack ${packId} at ${path}.`,
      "  Every requirement's version is unverifiable without it.",
    ]);
  }
  return parseVersionRegistry(JSON.parse(raw));
}

/**
 * Reads and **structurally** validates the result being signed.
 *
 * Structure only. Cross-field consistency belongs to `assertSignable`, so that a
 * record which is well-formed but incoherent still reaches the gate and is
 * reported alongside every other refusal rather than as a lone early exit.
 */
function readResultOrRefuse(
  paths: VerifyPaths,
  packId: string,
  requirementId: string,
): VerificationResult {
  const path = resultPath(paths, packId, requirementId);
  const raw = readIfPresent(path);
  if (raw === null) {
    throw new CliFailure(EXIT_REFUSED, [
      'REFUSED — there is nothing to sign.',
      `  - invalid_result: no verification result at ${path}`,
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliFailure(EXIT_REFUSED, [
      'REFUSED — the verification result cannot be read.',
      `  - invalid_result: ${path} is not valid JSON — ${detail}`,
    ]);
  }

  const structural = verificationResultSchema.safeParse(parsed);
  if (!structural.success) {
    throw new CliFailure(EXIT_REFUSED, [
      'REFUSED — the verification result does not satisfy its schema.',
      ...structural.error.issues.map(
        (issue) => `  - invalid_result: ${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    ]);
  }

  const result = structural.data;
  if (result.packId !== packId || result.requirementId !== requirementId) {
    throw new CliFailure(EXIT_REFUSED, [
      'REFUSED — the verification result is a record of something else.',
      `  - invalid_result: ${path} names ${result.packId}/${result.requirementId}, but ${packId}/${requirementId} was named`,
    ]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// normalizer_changed, resolved against the retained raw bytes
// ---------------------------------------------------------------------------

/**
 * Renormalises each pinned document whose `normalizerVersion` has moved, and
 * returns the hash of the result.
 *
 * Only the moved ones: renormalising a document the entry already agrees with
 * answers a question nobody asked, and these are whole legal instruments rather
 * than fixtures. A document the corpus no longer holds, or whose recorded
 * selector no longer matches, contributes **nothing** —
 * `resolveNormalizerChanged` then keeps the reason, which is the fail-closed
 * answer. An unanswerable question is not an answer of "fresh".
 */
export function renormalisedHashes(entry: SigningEntry, corpus: LoadedCorpus): Map<string, string> {
  const out = new Map<string, string>();
  for (const pinned of entry.corpus) {
    let document;
    try {
      document = corpus.document(pinned.docId);
    } catch {
      continue;
    }
    if (document.normalizerVersion === pinned.normalizerVersion) continue;
    try {
      out.set(
        pinned.docId,
        sha256Hex(normalize(corpus.rawText(pinned.docId), document.contentSelector ?? undefined)),
      );
    } catch {
      // A selector that no longer matches, or bytes that cannot be read. The
      // question is unanswerable, so it stays unanswered.
    }
  }
  return out;
}

/** The staleness of an existing entry, with `normalizer_changed` resolved. */
export function resolvedStaleness(
  entry: SigningEntry,
  current: CurrentState,
  corpus: LoadedCorpus,
): StalenessReason[] {
  return resolveNormalizerChanged(
    entry,
    current,
    deriveStaleness(entry, current),
    renormalisedHashes(entry, corpus),
  );
}

/**
 * Current state in the shape `deriveStaleness` compares an entry against.
 *
 * The record is built by `currentStateOf` in `src/verification/`, not here. The
 * review sheet assembled the same six fields in a literal of its own and the
 * public resolver would have been a third construction — so what freshness is
 * measured *over* now has one definition, and this function is only the layer
 * that hands it the world it has already read.
 */
function currentWorldState(world: CurrentWorld, result: VerificationResult): CurrentState {
  return currentStateOf({
    requirement: world.requirement,
    renderContext: world.renderCtx,
    closure: { sha256: world.closureSha256, docIds: world.pins.map((pin) => pin.docId) },
    corpus: world.corpus,
    result,
  });
}

// ---------------------------------------------------------------------------
// Verification after write
// ---------------------------------------------------------------------------

/** What the post-write read must find, and which variant's triple applies. */
export interface PostWriteExpectation {
  entryId: string;
  kind: 'verified' | 'ratified' | 'revoked';
}

/**
 * Re-reads the ledger from disk and asserts the whole triple, variant-aware.
 *
 * Everything is re-read, not reused: the pack, the corpus, the result and the
 * ledger. Reusing the values the operation already held would make the freshness
 * conjunct tautological — it would compare the world against itself — and the
 * point of this read is to catch the world moving underneath the *whole*
 * operation, which is exactly what the frozen candidate cannot see.
 *
 * The revoked variant re-reads **only the ledger**, and that is the design
 * rather than an economy. A revocation carries no verification pins, so it has
 * no freshness to assert and must not be measured against a status it never
 * claims — and withdrawal has to stay possible when the corpus is broken or the
 * result file is gone, which is when withdrawing a signature is most urgent.
 */
export function verifyAfterWrite(
  paths: VerifyPaths,
  packId: string,
  requirementId: string,
  expected: PostWriteExpectation,
): CliOutcome {
  const entries = readLedgerOrFail(paths);
  const governing = governingEntry(entries, packId, requirementId);

  if (governing === null) {
    return {
      exitCode: EXIT_INTEGRITY_FAILURE,
      lines: [
        'INTEGRITY FAILURE — the entry was appended, but no entry governs the requirement on re-read.',
        `  expected ${expected.entryId} to govern ${packId}/${requirementId}`,
      ],
    };
  }

  // The load-bearing half. Freshness alone would report success for whichever
  // entry happens to govern, which need not be the one just written.
  if (governing.entryId !== expected.entryId) {
    return {
      exitCode: EXIT_INTEGRITY_FAILURE,
      lines: [
        'INTEGRITY FAILURE — the entry was appended, but it is not the entry that governs.',
        `  wrote     ${expected.entryId}`,
        `  governing ${governing.entryId} (by ${governing.by}, on ${governing.on})`,
        '  Another entry became governing between the append and this check.',
        '  The ledger is append-only, so the line just written stays; it no longer decides the status.',
      ],
    };
  }

  if (expected.kind === 'revoked') {
    // The narrowing *is* the check now. `toStatusInput` will not accept an
    // unnarrowed ledger entry, and a governing signature where a revocation was
    // expected is exactly what "the revocation did not take" looks like from
    // here — so there is no status to project in that case, and the branch says
    // so by construction rather than by deriving one and then disbelieving it.
    // A revocation's projection is draft plus `revoked` by type, which leaves
    // the assertion below unfalsifiable through this variant and load-bearing
    // through the other; both halves are reported the same way as before.
    const status = governing.kind === 'revoked' ? deriveStatus(toStatusInput(governing)) : null;
    if (
      status === null ||
      status.derivedStatus !== 'draft' ||
      !status.statusReasons.includes('revoked')
    ) {
      return {
        exitCode: EXIT_INTEGRITY_FAILURE,
        lines: [
          'INTEGRITY FAILURE — the revocation was appended, but the projection does not read as revoked.',
          `  derivedStatus  ${status?.derivedStatus ?? governing.kind} (expected draft)`,
          `  statusReasons  ${status?.statusReasons.join(', ') || 'none'} (expected to contain revoked)`,
        ],
      };
    }
    return {
      exitCode: EXIT_OK,
      lines: [
        `Verified after write: ${governing.entryId} governs, derivedStatus draft, statusReasons revoked.`,
      ],
    };
  }

  if (governing.kind === 'revoked') {
    return {
      exitCode: EXIT_INTEGRITY_FAILURE,
      lines: ['INTEGRITY FAILURE — a signature was written, but the governing entry is a revocation.'],
    };
  }

  const world = readWorld(paths, packId, requirementId);
  const result = readResultOrRefuse(paths, packId, requirementId);
  const staleness = resolvedStaleness(governing, currentWorldState(world, result), world.corpus);
  // Checked, and here is what was found. This CLI is one of the two places that
  // can honestly say so: it has just re-read the corpus, the result and the
  // ledger from disk.
  const status = deriveStatus(toStatusInput(governing, { checked: true, reasons: staleness }));

  if (staleness.length > 0) {
    return {
      exitCode: EXIT_INTEGRITY_FAILURE,
      lines: [
        'INTEGRITY FAILURE — the entry was appended, but it is already not fresh.',
        `  ${governing.entryId}`,
        ...staleness.map((reason) => `  - ${reason}`),
        '  The world moved underneath the operation between the read and this check.',
      ],
    };
  }

  if (status.derivedStatus !== expected.kind) {
    return {
      exitCode: EXIT_INTEGRITY_FAILURE,
      lines: [
        'INTEGRITY FAILURE — the entry was appended, but the projection does not read as signed.',
        `  derivedStatus ${status.derivedStatus} (expected ${expected.kind})`,
        `  statusReasons ${status.statusReasons.join(', ') || 'none'}`,
      ],
    };
  }

  return {
    exitCode: EXIT_OK,
    lines: [
      `Verified after write: ${governing.entryId} governs, staleness none, derivedStatus ${status.derivedStatus}.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// The operation
// ---------------------------------------------------------------------------

/**
 * Signs one requirement, or explains why it may not be signed.
 *
 * Returns rather than exits, so the exit-code mapping is a value a test can
 * assert on. The entry point is the only thing that calls `process.exit`.
 */
export function runSign(args: SignArgs, paths: VerifyPaths, hooks: WriteHooks = {}): CliOutcome {
  try {
    const world = readWorld(paths, args.packId, args.requirementId);
    const entries = readLedgerOrFail(paths);
    const promotions = readPromotionsOrFail(paths);
    const registry = readRegistryOrFail(paths, args.packId);
    const result = readResultOrRefuse(paths, args.packId, args.requirementId);

    const lines: string[] = [];

    // The existing governing entry, and its staleness — displayed, never
    // blocking. Signing is how a stale status is repaired (record design §5.1);
    // refusing on existing staleness inverts the mechanism and makes recovery
    // impossible exactly when it is required.
    const governing = governingEntry(entries, args.packId, args.requirementId);
    const existing = governing !== null && governing.kind !== 'revoked' ? governing : null;

    if (existing !== null) {
      const staleness = resolvedStaleness(existing, currentWorldState(world, result), world.corpus);
      lines.push(
        `Existing signature ${existing.entryId} (${existing.kind}, by ${existing.by}).`,
        staleness.length === 0
          ? '  staleness: none'
          : `  staleness (informational, never blocking): ${staleness.join(', ')}`,
      );
    } else if (governing !== null) {
      lines.push(`Existing governing entry ${governing.entryId} is a revocation.`);
    } else {
      lines.push('No existing signature for this requirement.');
    }

    // One frozen derivation. Everything below runs against this object, and the
    // line appended is this object serialised.
    const candidate = buildSignature({
      kind: args.kind,
      packId: args.packId,
      packVersion: world.pack.version,
      requirement: world.requirement,
      result,
      renderedConditionSha256: world.renderedConditionSha256,
      rendererVersion: RENDERER_VERSION,
      corpusClosureSha256: world.closureSha256,
      corpus: world.pins,
      by: args.by,
      on: args.on,
      ...(args.note === undefined ? {} : { note: args.note }),
    });

    try {
      assertSignable(candidate, {
        result,
        corpus: world.corpus,
        registry,
        promotions,
        existing:
          existing === null
            ? null
            : {
                entry: existing,
                resultPresent: existsSync(resultPath(paths, args.packId, args.requirementId)),
              },
        testSuiteGreen: args.testSuiteGreen,
      });
    } catch (error) {
      if (error instanceof IntegrityFailureError) {
        return {
          exitCode: EXIT_INTEGRITY_FAILURE,
          lines: [
            ...lines,
            'INTEGRITY FAILURE — signed or pinned state is missing or contradicted.',
            ...error.refusals.map((refusal) => `  - ${refusal.code}: ${refusal.detail}`),
          ],
        };
      }
      if (error instanceof RefusalError) {
        return {
          exitCode: EXIT_REFUSED,
          lines: [
            ...lines,
            'REFUSED — every reason is listed, so one re-run answers all of them.',
            ...error.refusals.map((refusal) => `  - ${refusal.code}: ${refusal.detail}`),
          ],
        };
      }
      throw error;
    }

    if (candidate.advisories.length > 0) {
      lines.push(`Advisory, not blocking: ${candidate.advisories.join(', ')}`);
    }

    appendFileSync(ledgerPath(paths), `${canonicalJson(candidate.entry)}\n`, 'utf8');
    lines.push(`Appended ${candidate.entry.entryId} to ${ledgerPath(paths)}.`);

    hooks.onAppended?.();

    const verified = verifyAfterWrite(paths, args.packId, args.requirementId, {
      entryId: candidate.entry.entryId,
      kind: args.kind,
    });
    return { exitCode: verified.exitCode, lines: [...lines, ...verified.lines] };
  } catch (error) {
    const mapped = outcomeFor(error);
    if (mapped !== null) return mapped;
    throw error;
  }
}
