/**
 * The sign and revoke CLIs — tests.
 *
 * Three properties carry this file, and each has one test that would accept a
 * broken implementation if it were removed.
 *
 * **The post-write check must be about *this* operation.** Record design §5
 * asserts a triple after the append, and the load-bearing member is
 * `governing.entryId === candidate.entryId`. Confirming freshness alone is not
 * enough: another signing event can become governing between the append and the
 * check — today only through operator error, later through genuine concurrency
 * — and a check asking only "is the governing entry fresh?" reports success for
 * *someone else's* entry. `appends a second entry between the append and the
 * check` is the test that catches that, and the entry it injects is deliberately
 * **valid, fresh and of the same kind**, differing only in `by`. Anything less
 * would fail the freshness or status conjunct too, and the test would pass
 * against an implementation that never compared ids at all.
 *
 * **The check is variant-aware.** A revocation has no freshness to assert and
 * must not be measured against a status it never claims, so the revoked triple
 * is `entryId` plus `draft` plus a `revoked` reason — never `derivedStatus ===
 * kind`, which for a revocation is a status it does not have.
 *
 * **`normalizer_changed` is the *outcome* of renormalising, not the version
 * difference.** Factory §4.3: renormalise the retained raw bytes under the
 * current normalizer and compare; identical means still fresh. Detection stays
 * in `deriveStaleness`, which is pure and has no bytes; the CLI resolves it.
 * Without the narrowing, one normalizer bump blocks every signature in the pack
 * — the alarm-fatigue failure the raw-versus-normalized split exists to
 * prevent — so both halves are pinned: identical renormalisation resolves to
 * fresh, and a differing one stays blocking.
 *
 * The fixtures use the **real** pack, corpus and version registry, because the
 * thing under test is a CLI whose job is reading the world. Only what the CLI
 * writes — the ledger, the promotion ledger, the verification result — lives in
 * a temp directory, so no test can leave a signature behind in the repository.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPack } from '../src/knowledge/loader';
import { loadCorpus, type LoadedCorpus } from '../src/corpus/store';
import { computeClosure, docsForSources } from '../src/corpus/closure';
import { normalize, NORMALIZER_VERSION } from '../src/corpus/normalize';
import { sha256Hex } from '../src/corpus/hash';
import { requirementInputSha256, requirementSha256 } from '../src/verification/canonical';
import { RENDERER_VERSION, type RenderContext } from '../src/verification/render';
import {
  candidateConditionSha256,
  candidateRenderedConditionSha256,
} from '../src/verification/sign';
import {
  entryId,
  LedgerIntegrityError,
  parseLedger,
  type LedgerEntry,
  type RevocationEntry,
  type SigningEntry,
} from '../src/verification/ledger';
import {
  deriveStaleness,
  resolveNormalizerChanged,
  type CurrentState,
  type StalenessReason,
} from '../src/verification/staleness';
import { resultSha256, type VerificationResult } from '../src/verification/result';
import type { KnowledgePack, Requirement } from '../src/types';
import {
  EXIT_FORENSICS_REQUIRED,
  EXIT_INTEGRITY_FAILURE,
  EXIT_OK,
  EXIT_REFUSED,
  EXIT_USAGE,
} from '../src/cli/exit-codes';
import { runSign, verifyAfterWrite, type VerifyPaths } from '../src/cli/sign';
import { runRevoke } from '../src/cli/revoke';
import { dispatch, parseFlags } from '../src/cli/verify';

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = join(here, '..');
const PACK_DIR = join(engineRoot, 'knowledge', 'csrd');
const CORPUS_DIR = join(engineRoot, 'corpus');
const REGISTRY_DIR = join(engineRoot, 'verification', 'requirement-versions');

const PACK_ID = 'csrd';
const REQ_ID = 'CSRD-S-001';
const PIPELINE = 'pipeline-1.0.0';

const DOC_A = 'DOC-32013L0034';
const DOC_B = 'DOC-32026L0470';
const QUOTE_A = 'DIRECTIVE 2013/34/EU OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';
const QUOTE_B = 'DIRECTIVE (EU) 2026/470 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';

let pack: KnowledgePack;
let corpus: LoadedCorpus;
let requirement: Requirement;
let renderCtx: RenderContext;
let closureSha256: string;
let closureDocIds: string[];

let dir = '';
let paths: VerifyPaths;

/** The closure's documents as the corpus holds them now — the entry's pin shape. */
function currentPins(): SigningEntry['corpus'] {
  return closureDocIds.map((docId) => {
    const d = corpus.document(docId);
    return {
      docId,
      versionLabel: d.versionLabel,
      sha256Raw: d.sha256Raw,
      sha256Normalized: d.sha256Normalized,
      normalizerVersion: d.normalizerVersion,
    };
  });
}

/**
 * A result that is valid, self-consistent, and agrees with the pack and the
 * corpus on disk. Overrides replace whole keys.
 */
function makeResult(overrides: Record<string, unknown> = {}): VerificationResult {
  const a = corpus.document(DOC_A);
  const b = corpus.document(DOC_B);
  return {
    packId: PACK_ID,
    requirementId: REQ_ID,
    requirementVersion: requirement.version,
    resultSchemaVersion: '1.2.0',
    pipelineVersion: PIPELINE,
    rendererVersion: RENDERER_VERSION,
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderCtx),
    corpusClosureSha256: closureSha256,
    corpus: currentPins(),
    reading: {
      elements: [
        {
          id: 'R1',
          statement: 'The Directive governs annual and consolidated reporting.',
          evidence: [
            { kind: 'quote', docId: DOC_A, sha256Normalized: a.sha256Normalized, text: QUOTE_A },
          ],
        },
      ],
    },
    coverage: {
      cells: [
        {
          direction: 'reading_to_condition',
          readingElementId: 'R1',
          conditionPath: '$',
          verdict: 'MAPPED',
        },
      ],
    },
    challenges: [
      {
        id: 'C1',
        lens: 'threshold',
        statement: 'Does the amending Directive move the threshold?',
        verdict: 'CONFIRMED',
        evidence: [
          { kind: 'quote', docId: DOC_B, sha256Normalized: b.sha256Normalized, text: QUOTE_B },
        ],
        resolution: 'The threshold is as encoded.',
        // E-A: a different document and different words from the E-P above.
        adjudicationEvidence: [
          { kind: 'quote', docId: DOC_A, sha256Normalized: a.sha256Normalized, text: QUOTE_A },
        ],
      },
    ],
    openQuestions: [],
    gaps: [],
    ...overrides,
  } as VerificationResult;
}

const resultPath = (): string =>
  join(dir, PACK_ID, REQ_ID, 'verification-result.json');
const ledgerPath = (): string => join(dir, 'signatures.jsonl');
const promotionsPath = (): string => join(dir, 'promotions.jsonl');

function writeResult(result: VerificationResult | unknown): void {
  mkdirSync(join(dir, PACK_ID, REQ_ID), { recursive: true });
  writeFileSync(resultPath(), JSON.stringify(result, null, 2), 'utf8');
}

function readLedger(): LedgerEntry[] {
  return parseLedger(readFileSync(ledgerPath(), 'utf8'));
}

function signArgs(overrides: Record<string, unknown> = {}) {
  return {
    packId: PACK_ID,
    requirementId: REQ_ID,
    by: 'A. Reviewer',
    kind: 'verified' as const,
    on: '2026-08-21',
    testSuiteGreen: true,
    ...overrides,
  };
}

/**
 * A complete, fresh signing entry for the same requirement, differing from the
 * one the CLI writes only in `by`.
 *
 * Deliberately valid and fresh: an injected entry that was stale, revoked or of
 * another kind would fail the freshness or the status conjunct as well, and the
 * concurrent-append test would then pass against an implementation that never
 * compared entry ids. This one fails *only* the id comparison.
 */
function rivalEntry(by = 'B. Other'): SigningEntry {
  return sealed({
    kind: 'verified',
    packId: PACK_ID,
    packVersion: pack.version,
    requirementId: REQ_ID,
    requirementVersion: requirement.version,
    requirementSha256: requirementSha256(requirement),
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderCtx),
    rendererVersion: RENDERER_VERSION,
    corpusClosureSha256: closureSha256,
    corpus: currentPins(),
    resultSha256: resultSha256(makeResult()),
    pipelineVersion: PIPELINE,
    by,
    on: '2026-08-21',
  });
}

/** Recomputes `entryId` over the entry's own contents, as the ledger requires. */
function sealed(entry: Omit<SigningEntry, 'entryId'> | SigningEntry): SigningEntry {
  const unsigned = { ...(entry as SigningEntry) } as Record<string, unknown>;
  delete unsigned['entryId'];
  const clean = unsigned as unknown as Omit<SigningEntry, 'entryId'>;
  return { ...clean, entryId: entryId(clean) };
}

beforeEach(() => {
  pack = loadPack(PACK_DIR);
  corpus = loadCorpus(CORPUS_DIR);
  const found = pack.requirements.find((r) => r.id === REQ_ID);
  if (found === undefined) throw new Error(`fixture requires ${REQ_ID}`);
  requirement = found;
  renderCtx = { factTypes: pack.factTypes, catalogues: pack.catalogues };
  const closure = computeClosure(corpus.index, docsForSources(corpus.index, requirement.sources));
  closureSha256 = closure.sha256;
  closureDocIds = closure.docIds;

  dir = mkdtempSync(join(tmpdir(), 'verify-cli-'));
  mkdirSync(join(dir, 'requirement-versions'), { recursive: true });
  cpSync(join(REGISTRY_DIR, `${PACK_ID}.json`), join(dir, 'requirement-versions', `${PACK_ID}.json`));

  writeResult(makeResult());
  writeFileSync(ledgerPath(), '', 'utf8');
  writeFileSync(
    promotionsPath(),
    `${JSON.stringify({ pipelineVersion: PIPELINE, by: 'A. Promoter', on: '2026-08-01' })}\n`,
    'utf8',
  );

  paths = { packDir: PACK_DIR, corpusDir: CORPUS_DIR, verificationDir: dir };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// A clean sign
// ---------------------------------------------------------------------------

describe('runSign', () => {
  it('appends one entry and verifies it after the write', () => {
    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_OK);

    const entries = readLedger();
    expect(entries).toHaveLength(1);
    const written = entries[0];
    expect(written?.kind).toBe('verified');
    expect(written?.requirementId).toBe(REQ_ID);
    expect(outcome.lines.join('\n')).toContain(written?.entryId ?? 'no entry');
  });

  it('pins, in the line it appended, exactly what the world says — every field', () => {
    // The run-level half of "the sign CLI derives its pins from `producePins`".
    // Every assertion above is satisfied by an entry whose pins are wrong: they
    // read `kind`, `requirementId` and `entryId`, and nothing the producer
    // computed. Nulling `versionLabel` inside `producePins` left this entire
    // file green — which is how a wrong label could reach the ledger unobserved.
    //
    // `currentPins()` and the three hash helpers are derived here from the pack
    // and the corpus **independently** of the producer, so this reddens when the
    // producer drifts rather than moving along with it.
    runSign(signArgs(), paths);
    const written = readLedger()[0] as SigningEntry;

    expect(written.corpus).toEqual(currentPins());
    expect(written.requirementInputSha256).toBe(requirementInputSha256(requirement));
    expect(written.conditionSha256).toBe(candidateConditionSha256(requirement));
    expect(written.renderedConditionSha256).toBe(
      candidateRenderedConditionSha256(requirement, renderCtx),
    );
    expect(written.corpusClosureSha256).toBe(closureSha256);

    // The counterexample that stops `toEqual` from being satisfied by a pin
    // shape carrying nothing: the closure is non-empty, and every label really
    // is this corpus's.
    expect(written.corpus.length).toBeGreaterThan(0);
    for (const pin of written.corpus) {
      expect(pin.versionLabel).toBe(corpus.document(pin.docId).versionLabel);
    }
  });

  it('appends exactly one line plus a newline, in the framing parseLedger requires', () => {
    runSign(signArgs(), paths);
    const text = readFileSync(ledgerPath(), 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.trimEnd().split('\n')).toHaveLength(1);
    expect(() => parseLedger(text)).not.toThrow();
  });

  it('appends after an existing entry rather than rewriting the ledger', () => {
    const first = rivalEntry('E. Earlier');
    writeFileSync(ledgerPath(), `${JSON.stringify(first)}\n`, 'utf8');

    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_OK);

    const entries = readLedger();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.entryId).toBe(first.entryId);
  });

  it('signs over an existing signature that is stale, and shows the staleness', () => {
    // Signing is how a stale status is repaired. Existing staleness is
    // displayed and never blocking (record design §5.1).
    const stale = sealed({ ...rivalEntry('S. Stale'), corpusClosureSha256: 'f'.repeat(64) });
    writeFileSync(ledgerPath(), `${JSON.stringify(stale)}\n`, 'utf8');

    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(outcome.lines.join('\n')).toContain('stale_closure');
  });
});

// ---------------------------------------------------------------------------
// Verification after write — the entryId comparison is the load-bearing half
// ---------------------------------------------------------------------------

describe('verification after write', () => {
  it('fails when a different entry becomes governing between the append and the check', () => {
    const rival = rivalEntry();
    const outcome = runSign(signArgs(), paths, {
      onAppended: () => {
        // The race window, made deterministic. The rival is valid, fresh and of
        // the same kind, so only the entry-id comparison can catch it.
        writeFileSync(ledgerPath(), `${readFileSync(ledgerPath(), 'utf8')}${JSON.stringify(rival)}\n`, 'utf8');
      },
    });

    expect(outcome.exitCode).toBe(EXIT_INTEGRITY_FAILURE);
    const said = outcome.lines.join('\n');
    expect(said).toContain(rival.entryId);
    expect(said).toMatch(/governing/i);
  });

  it('leaves the appended entry in place when the post-write check fails', () => {
    // The ledger is append-only: a failed check cannot un-write the line, and
    // pretending otherwise would be a rewrite.
    runSign(signArgs(), paths, {
      onAppended: () => {
        writeFileSync(
          ledgerPath(),
          `${readFileSync(ledgerPath(), 'utf8')}${JSON.stringify(rivalEntry())}\n`,
          'utf8',
        );
      },
    });
    expect(readLedger()).toHaveLength(2);
  });

  it('fails on an advisory-only staleness reason, because the conjunct is emptiness', () => {
    // Isolates the freshness conjunct. `source_reissued` does not block, so
    // `derivedStatus` still reads `verified` and the status conjunct passes —
    // which means only "staleness is empty" can catch this. Without a case
    // where the two disagree, the three conjuncts mask one another and a
    // missing one is invisible.
    const reissued = sealed({
      ...rivalEntry('R. Reissue'),
      corpus: currentPins().map((pin, i) => (i === 0 ? { ...pin, sha256Raw: 'a'.repeat(64) } : pin)),
    });
    writeFileSync(ledgerPath(), `${JSON.stringify(reissued)}\n`, 'utf8');

    const outcome = verifyAfterWrite(paths, PACK_ID, REQ_ID, {
      entryId: reissued.entryId,
      kind: 'verified',
    });
    expect(outcome.exitCode).toBe(EXIT_INTEGRITY_FAILURE);
    expect(outcome.lines.join('\n')).toContain('source_reissued');
  });

  it('fails when the projection does not read as the level that was claimed', () => {
    // Isolates the status conjunct: staleness is empty, so freshness passes and
    // only `derivedStatus === kind` can catch a `verified` entry reported as a
    // ratification.
    const entry = rivalEntry('V. Verified');
    writeFileSync(ledgerPath(), `${JSON.stringify(entry)}\n`, 'utf8');

    const outcome = verifyAfterWrite(paths, PACK_ID, REQ_ID, {
      entryId: entry.entryId,
      kind: 'ratified',
    });
    expect(outcome.exitCode).toBe(EXIT_INTEGRITY_FAILURE);
    expect(outcome.lines.join('\n')).toContain('expected ratified');
  });

  it('refuses to measure a revocation against a status it never claims', () => {
    // Variant-awareness, from the other side: a governing revocation reported
    // as a signature must fail, and reported as a revocation must pass. An
    // implementation running one triple over both variants fails one of these.
    const signed = rivalEntry('S. Signed');
    writeFileSync(ledgerPath(), `${JSON.stringify(signed)}\n`, 'utf8');
    runRevoke(
      {
        packId: PACK_ID,
        requirementId: REQ_ID,
        revokes: signed.entryId,
        by: 'A. Reviewer',
        reason: 'Withdrawn.',
        on: '2026-08-22',
      },
      paths,
    );
    const revocation = readLedger()[1];
    const id = revocation?.entryId ?? '';

    expect(
      verifyAfterWrite(paths, PACK_ID, REQ_ID, { entryId: id, kind: 'verified' }).exitCode,
    ).toBe(EXIT_INTEGRITY_FAILURE);
    expect(
      verifyAfterWrite(paths, PACK_ID, REQ_ID, { entryId: id, kind: 'revoked' }).exitCode,
    ).toBe(EXIT_OK);
  });

  it('fails a revoked expectation when a signature, not a revocation, governs', () => {
    // The revoked triple's own teeth. Through `runRevoke` the assertion is
    // unfalsifiable — `deriveStatus` answers draft plus `revoked` for every
    // revocation — so the only way to exercise it is an expectation of
    // `revoked` over a governing signature, which is exactly what "the
    // revocation did not take" looks like from the checker's side.
    const signed = rivalEntry('S. Signed');
    writeFileSync(ledgerPath(), `${JSON.stringify(signed)}\n`, 'utf8');

    const outcome = verifyAfterWrite(paths, PACK_ID, REQ_ID, {
      entryId: signed.entryId,
      kind: 'revoked',
    });
    expect(outcome.exitCode).toBe(EXIT_INTEGRITY_FAILURE);
    expect(outcome.lines.join('\n')).toContain('expected to contain revoked');
  });

  it('fails when the pinned result is edited between the append and the check', () => {
    // The freeze closes the check-then-recompute gap; this is the gap it
    // cannot close, and the post-write read is what catches it.
    const outcome = runSign(signArgs(), paths, {
      onAppended: () => {
        const edited = makeResult({
          challenges: [
            {
              id: 'C1',
              lens: 'threshold',
              statement: 'Does the amending Directive move the threshold?',
              verdict: 'CONFIRMED',
              evidence: [
                {
                  kind: 'quote',
                  docId: DOC_B,
                  sha256Normalized: corpus.document(DOC_B).sha256Normalized,
                  text: QUOTE_B,
                },
              ],
              resolution: 'A different adjudication entirely.',
              adjudicationEvidence: [
                {
                  kind: 'quote',
                  docId: DOC_A,
                  sha256Normalized: corpus.document(DOC_A).sha256Normalized,
                  text: QUOTE_A,
                },
              ],
            },
          ],
        });
        writeResult(edited);
      },
    });

    expect(outcome.exitCode).toBe(EXIT_INTEGRITY_FAILURE);
    expect(outcome.lines.join('\n')).toContain('stale_result');
  });
});

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

describe('runRevoke', () => {
  function seedSignature(): SigningEntry {
    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_OK);
    const entries = readLedger();
    const first = entries[0];
    if (first === undefined || first.kind === 'revoked') throw new Error('seed failed');
    return first;
  }

  it('appends a revocation and verifies against the revoked triple', () => {
    const signed = seedSignature();
    const outcome = runRevoke(
      {
        packId: PACK_ID,
        requirementId: REQ_ID,
        revokes: signed.entryId,
        by: 'A. Reviewer',
        reason: 'The encoding was corrected.',
        on: '2026-08-22',
      },
      paths,
    );

    expect(outcome.exitCode).toBe(EXIT_OK);
    const said = outcome.lines.join('\n');
    expect(said).toContain('revoked');
    expect(said).toContain('draft');

    const entries = readLedger();
    expect(entries).toHaveLength(2);
    expect(entries[1]?.kind).toBe('revoked');
  });

  it('refuses a revocation whose target does not exist, without writing', () => {
    seedSignature();
    const outcome = runRevoke(
      {
        packId: PACK_ID,
        requirementId: REQ_ID,
        revokes: 'a'.repeat(64),
        by: 'A. Reviewer',
        reason: 'Mistyped.',
        on: '2026-08-22',
      },
      paths,
    );

    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(readLedger()).toHaveLength(1);
  });

  it('refuses to revoke a revocation', () => {
    const signed = seedSignature();
    const first = runRevoke(
      {
        packId: PACK_ID,
        requirementId: REQ_ID,
        revokes: signed.entryId,
        by: 'A. Reviewer',
        reason: 'The encoding was corrected.',
        on: '2026-08-22',
      },
      paths,
    );
    expect(first.exitCode).toBe(EXIT_OK);
    const revocation = readLedger()[1];

    const second = runRevoke(
      {
        packId: PACK_ID,
        requirementId: REQ_ID,
        revokes: revocation?.entryId ?? '',
        by: 'A. Reviewer',
        reason: 'Undo.',
        on: '2026-08-23',
      },
      paths,
    );
    expect(second.exitCode).toBe(EXIT_REFUSED);
    expect(second.lines.join('\n')).toMatch(/revocation/i);
    expect(readLedger()).toHaveLength(2);
  });

  it('is forensics-required on an unreadable ledger, not an ordinary refusal', () => {
    const signed = seedSignature();
    // A tampered entryId makes the whole ledger unreadable, so revoke cannot
    // operate on it. Spec §3 guarantees a revocation carries no verification
    // pins; it does not guarantee a compromised ledger stays writable.
    const tampered = { ...signed, entryId: 'd'.repeat(64) };
    writeFileSync(ledgerPath(), `${JSON.stringify(tampered)}\n`, 'utf8');

    const outcome = runRevoke(
      {
        packId: PACK_ID,
        requirementId: REQ_ID,
        revokes: signed.entryId,
        by: 'A. Reviewer',
        reason: 'The encoding was corrected.',
        on: '2026-08-22',
      },
      paths,
    );

    expect(outcome.exitCode).toBe(EXIT_FORENSICS_REQUIRED);
    expect(outcome.lines.join('\n')).toMatch(/history/i);
    expect(readLedger.bind(null)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Exit codes — each produced by its own case
// ---------------------------------------------------------------------------

describe('exit codes', () => {
  it('0 for a clean sign', () => {
    expect(runSign(signArgs(), paths).exitCode).toBe(EXIT_OK);
  });

  it('1 for a refusal: an outstanding open question', () => {
    writeResult(
      makeResult({ openQuestions: [{ id: 'Q1', statement: 'Which turnover figure applies?' }] }),
    );
    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toContain('open_question');
    expect(readFileSync(ledgerPath(), 'utf8')).toBe('');
  });

  it('1 for an adjudication resting entirely on an absence claim', () => {
    // End to end through the real CLI, which is the only thing that proves the
    // rule is wired rather than merely written: `runSign` → `assertSignable` →
    // `assertResultConsistency`. The prosecutor's `evidence` here is the same
    // sound quote the clean fixture carries, so nothing but the adjudicator's
    // array can be producing this refusal.
    writeResult(
      makeResult({
        challenges: [
          {
            id: 'C1',
            lens: 'threshold',
            statement: 'Does the amending Directive move the threshold?',
            verdict: 'CONFIRMED',
            evidence: [
              {
                kind: 'quote',
                docId: DOC_B,
                sha256Normalized: corpus.document(DOC_B).sha256Normalized,
                text: QUOTE_B,
              },
            ],
            resolution: 'The threshold is as encoded.',
            adjudicationEvidence: [{ kind: 'absence', docIds: [DOC_A], term: 'value added tax' }],
          },
        ],
      }),
    );
    const outcome = runSign(signArgs(), paths);
    const printed = outcome.lines.join('\n');
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(printed).toContain('invalid_result');
    expect(printed).toContain('adjudicationEvidence');
    expect(readFileSync(ledgerPath(), 'utf8')).toBe('');
  });

  it('1 for a structurally invalid result, reported as invalid_result', () => {
    // `buildSignature` calls `resultSha256`, which parses — so a structurally
    // invalid result throws before a candidate exists and never reaches the
    // gate. The CLI validates first rather than letting a ZodError escape.
    writeResult({ ...(makeResult() as unknown as Record<string, unknown>), requirementVersion: 'one' });
    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toContain('invalid_result');
    expect(outcome.lines.join('\n')).not.toContain('ZodError');
  });

  it('2 for an integrity failure: a vanished pinned document', () => {
    const signed = rivalEntry('P. Prior');
    const withGhost = sealed({
      ...signed,
      corpus: [
        ...signed.corpus,
        {
          docId: 'DOC-GONE',
          versionLabel: 'v1',
          sha256Raw: 'a'.repeat(64),
          sha256Normalized: 'b'.repeat(64),
          normalizerVersion: NORMALIZER_VERSION,
        },
      ],
    });
    writeFileSync(ledgerPath(), `${JSON.stringify(withGhost)}\n`, 'utf8');

    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_INTEGRITY_FAILURE);
    expect(outcome.lines.join('\n')).toContain('DOC-GONE');
  });

  it('3 for forensics-required: a tampered entryId makes the ledger unreadable', () => {
    const signed = rivalEntry('P. Prior');
    writeFileSync(
      ledgerPath(),
      `${JSON.stringify({ ...signed, entryId: 'd'.repeat(64) })}\n`,
      'utf8',
    );

    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_FORENSICS_REQUIRED);
    expect(outcome.lines.join('\n')).toMatch(/history/i);
  });

  it('64 for usage: a requirement the pack does not carry', () => {
    const outcome = runSign(signArgs({ requirementId: 'CSRD-S-999' }), paths);
    expect(outcome.exitCode).toBe(EXIT_USAGE);
  });

  it('keeps the four documented codes distinct from one another', () => {
    const codes = [EXIT_OK, EXIT_REFUSED, EXIT_INTEGRITY_FAILURE, EXIT_FORENSICS_REQUIRED];
    expect(new Set(codes).size).toBe(codes.length);
  });
});

// ---------------------------------------------------------------------------
// normalizer_changed, narrowed
// ---------------------------------------------------------------------------

describe('resolveNormalizerChanged', () => {
  /** An entry pinning one document under an older normalizer version. */
  function pinnedUnderOldNormalizer(sha256Normalized: string): {
    entry: SigningEntry;
    current: CurrentState;
  } {
    const now = corpus.document(DOC_A);
    const entry = sealed({
      ...rivalEntry('N. Normalizer'),
      corpus: [
        {
          docId: DOC_A,
          versionLabel: now.versionLabel,
          sha256Raw: now.sha256Raw,
          sha256Normalized,
          normalizerVersion: '0.9.0',
        },
      ],
    });
    const current: CurrentState = {
      requirementInputSha256: entry.requirementInputSha256,
      conditionSha256: entry.conditionSha256,
      renderedConditionSha256: entry.renderedConditionSha256,
      corpusClosureSha256: entry.corpusClosureSha256,
      resultSha256: entry.resultSha256,
      corpus: [
        {
          docId: DOC_A,
          sha256Raw: now.sha256Raw,
          sha256Normalized: now.sha256Normalized,
          normalizerVersion: now.normalizerVersion,
        },
      ],
    };
    return { entry, current };
  }

  it('drops normalizer_changed when renormalising the raw bytes reproduces the pinned text', () => {
    const now = corpus.document(DOC_A);
    const { entry, current } = pinnedUnderOldNormalizer(now.sha256Normalized);
    const reasons = deriveStaleness(entry, current);
    expect(reasons).toContain('normalizer_changed');

    const renormalised = new Map([[DOC_A, now.sha256Normalized]]);
    expect(resolveNormalizerChanged(entry, current, reasons, renormalised)).toEqual([]);
  });

  it('keeps normalizer_changed when renormalising produces different text', () => {
    const { entry, current } = pinnedUnderOldNormalizer('c'.repeat(64));
    const reasons = deriveStaleness(entry, current);
    expect(reasons).toContain('normalizer_changed');

    const renormalised = new Map([[DOC_A, corpus.document(DOC_A).sha256Normalized]]);
    expect(resolveNormalizerChanged(entry, current, reasons, renormalised)).toEqual([
      'normalizer_changed',
    ]);
  });

  it('keeps normalizer_changed when the raw bytes could not be renormalised at all', () => {
    // Fail closed: an unanswerable question is not an answer of "fresh".
    const now = corpus.document(DOC_A);
    const { entry, current } = pinnedUnderOldNormalizer(now.sha256Normalized);
    const reasons = deriveStaleness(entry, current);
    expect(resolveNormalizerChanged(entry, current, reasons, new Map())).toEqual([
      'normalizer_changed',
    ]);
  });

  it('leaves every other reason untouched', () => {
    const { entry, current } = pinnedUnderOldNormalizer(corpus.document(DOC_A).sha256Normalized);
    const moved: CurrentState = { ...current, corpusClosureSha256: 'e'.repeat(64) };
    const reasons = deriveStaleness(entry, moved);
    const resolved = resolveNormalizerChanged(
      entry,
      moved,
      reasons,
      new Map([[DOC_A, corpus.document(DOC_A).sha256Normalized]]),
    );
    expect(resolved).toEqual(['stale_closure']);
  });

  it('does not alter a set that never carried normalizer_changed', () => {
    const now = corpus.document(DOC_A);
    const { entry, current } = pinnedUnderOldNormalizer(now.sha256Normalized);
    const same: SigningEntry = {
      ...entry,
      corpus: [{ ...(entry.corpus[0] as SigningEntry['corpus'][number]), normalizerVersion: NORMALIZER_VERSION }],
    };
    const reasons: StalenessReason[] = deriveStaleness(same, current);
    expect(reasons).toEqual([]);
    expect(resolveNormalizerChanged(same, current, reasons, new Map())).toEqual([]);
  });
});

describe('the CLI resolves normalizer_changed against the retained raw bytes', () => {
  /**
   * Writes a governing entry pinning `DOC_A` under an older normalizer, so the
   * displayed existing staleness carries `normalizer_changed` before
   * resolution. `sha256Normalized` decides whether renormalising the retained
   * raw bytes reproduces it.
   */
  function seedOldNormalizer(sha256Normalized: string): void {
    const now = corpus.document(DOC_A);
    const entry = sealed({
      ...rivalEntry('N. Normalizer'),
      corpus: [
        {
          docId: DOC_A,
          versionLabel: now.versionLabel,
          sha256Raw: now.sha256Raw,
          sha256Normalized,
          normalizerVersion: '0.9.0',
        },
      ],
    });
    writeFileSync(ledgerPath(), `${JSON.stringify(entry)}\n`, 'utf8');
  }

  it('reports the existing signature as fresh when the renormalised text is identical', () => {
    seedOldNormalizer(corpus.document(DOC_A).sha256Normalized);
    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(outcome.lines.join('\n')).not.toContain('normalizer_changed');
  });

  it('still reports normalizer_changed when the renormalised text differs', () => {
    seedOldNormalizer('c'.repeat(64));
    const outcome = runSign(signArgs(), paths);
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(outcome.lines.join('\n')).toContain('normalizer_changed');
  });

  it('renormalises the bytes the corpus retains, under the current normalizer', () => {
    // The property the narrowing rests on: the raw store holds the publisher's
    // bytes precisely so a later normalizer can be re-run over them.
    const doc = corpus.document(DOC_A);
    const again = sha256Hex(normalize(corpus.rawText(DOC_A), doc.contentSelector ?? undefined));
    expect(again).toBe(doc.sha256Normalized);
  });
});

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

describe('dispatch', () => {
  const green = (): boolean => true;

  it('signs through the documented command line', async () => {
    const outcome = await dispatch(
      ['sign', PACK_ID, REQ_ID, '--by', 'A. Reviewer', '--on', '2026-08-21', '--skip-suite'],
      paths,
      green,
    );
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(readLedger()).toHaveLength(1);
  });

  it('revokes through the documented command line', async () => {
    await dispatch(['sign', PACK_ID, REQ_ID, '--by', 'A. Reviewer', '--on', '2026-08-21', '--skip-suite'], paths, green);
    const signed = readLedger()[0];
    const outcome = await dispatch(
      [
        'revoke',
        PACK_ID,
        REQ_ID,
        '--revokes',
        signed?.entryId ?? '',
        '--by',
        'A. Reviewer',
        '--reason',
        'The encoding was corrected.',
        '--on',
        '2026-08-22',
      ],
      paths,
      green,
    );
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(readLedger()[1]?.kind).toBe('revoked');
  });

  it('is a usage error, never a refusal, for an unknown subcommand', async () => {
    // A typo must not read as "you may not sign this yet": one is a fact about
    // the invocation, the other about the repository.
    const outcome = await dispatch(['singh', PACK_ID, REQ_ID, '--by', 'A. Reviewer'], paths, green);
    expect(outcome.exitCode).toBe(EXIT_USAGE);
    expect(outcome.lines.join('\n')).toContain('singh');
  });

  it('is a usage error when --by is missing', async () => {
    expect((await dispatch(['sign', PACK_ID, REQ_ID, '--skip-suite'], paths, green)).exitCode).toBe(
      EXIT_USAGE,
    );
  });

  it('is a usage error when a revocation names no target or no reason', async () => {
    expect(
      (await dispatch(['revoke', PACK_ID, REQ_ID, '--by', 'A. Reviewer'], paths, green)).exitCode,
    ).toBe(EXIT_USAGE);
  });

  it('is a usage error for a kind that is not one of the two levels', async () => {
    expect(
      (
        await dispatch(
          ['sign', PACK_ID, REQ_ID, '--by', 'A. Reviewer', '--kind', 'probably', '--skip-suite'],
          paths,
          green,
        )
      ).exitCode,
    ).toBe(EXIT_USAGE);
  });

  it('reads the suite result rather than assuming it, and refuses over a red one', async () => {
    const outcome = await dispatch(
      ['sign', PACK_ID, REQ_ID, '--by', 'A. Reviewer', '--on', '2026-08-21'],
      paths,
      () => false,
    );
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toContain('red_suite');
    expect(readFileSync(ledgerPath(), 'utf8')).toBe('');
  });

  it('parses value flags and bare switches in one pass', () => {
    const { positional, flags } = parseFlags(['sign', 'p', 'r', '--by', 'A. N.', '--skip-suite']);
    expect(positional).toEqual(['sign', 'p', 'r']);
    expect(flags['by']).toBe('A. N.');
    expect(flags['skip-suite']).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Authority provenance — who stood behind what, propagated exactly and never
// blank
// ---------------------------------------------------------------------------

/**
 * Two properties, three layers, and a note about what they are *not*.
 *
 * **Property A — the line on disk carries the caller's values.** The existing
 * post-write check proves `candidate == line written`: `runSign` freezes one
 * object and appends that same object, so comparing entry ids shows that what
 * was checked is what landed. It says nothing about where the candidate's
 * fields came from. Substituting `by: args.by -> by: 'WRONG-SIGNER'` inside the
 * `buildSignature` call left the whole suite green, because every id, hash and
 * status assertion moves with the substitution. The missing link is *CLI input
 * == candidate == line written*, and only reading the appended line back off
 * disk and comparing it against the arguments supplies it.
 *
 * Each field gets its own case, deliberately. A single "the entry equals what
 * was supplied" assertion reddens on all four substitutions and names none of
 * them, which is the difference between knowing a value was corrupted and
 * knowing which one.
 *
 * **Property B — blank authority is impossible, in three distinct places.**
 *
 * ```
 * CLI, before the append   friendly refusal, and no bytes written
 * schema, on the way in    a hand-authored blank makes the ledger unreadable
 * propagation, after       the supplied value is the value stored
 * ```
 *
 * The middle layer is not redundant with the first. A ledger produced outside
 * the sanctioned CLIs — hand-edited, migrated, inherited from before the rule —
 * still has to announce its damage. The first layer is not redundant with the
 * middle either, and that is the more important direction: post-write detection
 * in an append-only file is a report that an unreadable line is now permanent.
 *
 * **`note` is not authority.** It carries no non-blank rule and must not
 * acquire one; what is proved about it is only that a supplied value survives.
 */
describe('authority provenance', () => {
  const SIGNER = 'A. Reviewer';
  const SIGNED_ON = '2026-08-21';
  const SIGNING_NOTE = 'Read the amending Directive twice before signing.';
  const REVOKER = 'R. Revoker';
  const REVOKED_ON = '2026-08-22';
  const REVOCATION_REASON = 'The encoding was corrected.';

  /**
   * The last line of the ledger as it actually landed, parsed as plain JSON.
   *
   * Deliberately not `readLedger()`. The property is what reached the bytes on
   * disk, and routing the read through the entry schema would let a contract
   * change decide the answer to a question about propagation.
   */
  function appendedLine(): Record<string, unknown> {
    const written = readFileSync(ledgerPath(), 'utf8')
      .split('\n')
      .filter((line) => line !== '');
    const last = written.at(-1);
    if (last === undefined) throw new Error('the ledger carries no appended line');
    return JSON.parse(last) as Record<string, unknown>;
  }

  /** Seeds a signature and withdraws it, returning the arguments actually used. */
  function revokeOver(overrides: Record<string, unknown> = {}) {
    expect(runSign(signArgs(), paths).exitCode).toBe(EXIT_OK);
    const signed = readLedger()[0];
    if (signed === undefined) throw new Error('seed failed');
    const args = {
      packId: PACK_ID,
      requirementId: REQ_ID,
      revokes: signed.entryId,
      by: REVOKER,
      on: REVOKED_ON,
      reason: REVOCATION_REASON,
      ...overrides,
    };
    return { args, outcome: runRevoke(args, paths) };
  }

  /**
   * A two-line ledger — one signature, then a revocation of it — that is
   * correct in every other respect.
   *
   * Everything else being valid is the point: a fixture that also mis-named the
   * pack would throw for a reason unrelated to the blank field, and the test
   * would pass while proving nothing about authority.
   */
  function ledgerWithRevocation(overrides: Partial<Omit<RevocationEntry, 'entryId'>> = {}): string {
    const signed = rivalEntry('E. Earlier');
    const unsigned: Omit<RevocationEntry, 'entryId'> = {
      kind: 'revoked',
      packId: PACK_ID,
      requirementId: REQ_ID,
      revokes: signed.entryId,
      by: REVOKER,
      on: REVOKED_ON,
      reason: REVOCATION_REASON,
      ...overrides,
    };
    const revocation: RevocationEntry = { ...unsigned, entryId: entryId(unsigned) };
    return `${JSON.stringify(signed)}\n${JSON.stringify(revocation)}\n`;
  }

  // -------------------------------------------------------------------------
  // Property A — exact propagation through the sanctioned write paths
  // -------------------------------------------------------------------------

  describe('runSign propagates each supplied value into the appended line', () => {
    function signOnce(): void {
      const outcome = runSign(
        signArgs({ by: SIGNER, on: SIGNED_ON, note: SIGNING_NOTE }),
        paths,
      );
      expect(outcome.exitCode).toBe(EXIT_OK);
    }

    it('`by` — the appended signatory is the one the caller named', () => {
      signOnce();
      expect(appendedLine()['by'], 'signing `by` is not the value runSign was handed').toBe(SIGNER);
    });

    it('`on` — the appended date is the one the caller supplied', () => {
      signOnce();
      expect(appendedLine()['on'], 'signing `on` is not the value runSign was handed').toBe(
        SIGNED_ON,
      );
    });

    it('`note` — the appended note is the one the caller supplied', () => {
      signOnce();
      expect(appendedLine()['note'], 'signing `note` is not the value runSign was handed').toBe(
        SIGNING_NOTE,
      );
    });
  });

  describe('runRevoke propagates each supplied value into the appended line', () => {
    it('`by` — the appended revoker is the one the caller named', () => {
      const { args, outcome } = revokeOver();
      expect(outcome.exitCode).toBe(EXIT_OK);
      expect(appendedLine()['by'], 'revocation `by` is not the value runRevoke was handed').toBe(
        args.by,
      );
    });

    it('`on` — the appended date is the one the caller supplied', () => {
      const { args, outcome } = revokeOver();
      expect(outcome.exitCode).toBe(EXIT_OK);
      expect(appendedLine()['on'], 'revocation `on` is not the value runRevoke was handed').toBe(
        args.on,
      );
    });

    it('`reason` — the appended reason is the one the caller supplied', () => {
      const { args, outcome } = revokeOver();
      expect(outcome.exitCode).toBe(EXIT_OK);
      expect(
        appendedLine()['reason'],
        'revocation `reason` is not the value runRevoke was handed',
      ).toBe(args.reason);
    });

    it('`revokes` — the appended target is the named signature, not another valid one', () => {
      // **Two signatures, because one makes this assertion untestable.** Over a
      // single-entry ledger the only substitution available for `revokes` is an
      // id that resolves to nothing, and that fails `verifyLedgerIntegrity` at
      // the post-write read: every revocation test then dies on its exit code
      // having compared no field at all, which is TEST-EVIDENCE-STANDARD §2 —
      // the mutation killing the test for the wrong reason.
      //
      // With a second signature present, a *valid alternative* target exists.
      // Substituting it leaves the reference resolvable, the pack and
      // requirement matching, the target earlier in the file and a signature
      // rather than a revocation — so integrity stays satisfied and the exit
      // code stays `EXIT_OK`. The only thing wrong is that the line withdraws
      // the wrong signature, which is precisely what this assertion is for.
      expect(runSign(signArgs({ by: 'E. Earlier' }), paths).exitCode).toBe(EXIT_OK);
      expect(runSign(signArgs({ by: SIGNER }), paths).exitCode).toBe(EXIT_OK);
      const seeded = readLedger();
      const earlier = seeded[0];
      const target = seeded[1];
      if (earlier === undefined || target === undefined) throw new Error('seed failed');
      // Both are genuine, distinct, resolvable targets, so "any valid id" is
      // not an answer this assertion accepts.
      expect(earlier.entryId).not.toBe(target.entryId);

      const args = {
        packId: PACK_ID,
        requirementId: REQ_ID,
        revokes: target.entryId,
        by: REVOKER,
        on: REVOKED_ON,
        reason: REVOCATION_REASON,
      };
      const outcome = runRevoke(args, paths);

      // Asserted before the propagation check, and in this order deliberately:
      // together they say the ledger is still well-formed and the operation
      // still succeeded, so anything the next assertion catches was caught by
      // the comparison itself rather than by integrity or by an exit code.
      expect(outcome.exitCode).toBe(EXIT_OK);
      expect(readLedger()).toHaveLength(3);

      expect(
        appendedLine()['revokes'],
        'revocation `revokes` is not the value runRevoke was handed',
      ).toBe(args.revokes);
      expect(appendedLine()['revokes']).not.toBe(earlier.entryId);
    });
  });

  describe('the non-blank rule tests the value without rewriting it', () => {
    const PADDED_SIGNER = '  A. Reviewer  ';
    const PADDED_REASON = '\tThe encoding was corrected.\n';

    it('stores a signing `by` byte for byte, surrounding whitespace included', () => {
      expect(runSign(signArgs({ by: PADDED_SIGNER, on: SIGNED_ON }), paths).exitCode).toBe(EXIT_OK);

      expect(appendedLine()['by']).toBe(PADDED_SIGNER);
      // The counterexample. Without it the assertion above is also satisfied by
      // a schema that trims, whenever the fixture happens to carry no padding.
      expect(appendedLine()['by']).not.toBe(PADDED_SIGNER.trim());
      // And the stored value is the value hashed: a rewrite between the id and
      // the bytes would make the entry fail its own recomputation on read.
      expect(readLedger()).toHaveLength(1);
    });

    it('stores a revocation `reason` byte for byte, surrounding whitespace included', () => {
      const { outcome } = revokeOver({ reason: PADDED_REASON });
      expect(outcome.exitCode).toBe(EXIT_OK);

      expect(appendedLine()['reason']).toBe(PADDED_REASON);
      expect(appendedLine()['reason']).not.toBe(PADDED_REASON.trim());
      expect(readLedger()).toHaveLength(2);
    });

    it('leaves `note` unconstrained — commentary is not authority', () => {
      // A blank note claims nothing. A blank `by` claims a judgement with
      // nobody behind it. Only the second is damage, and this pins the
      // difference so the rule cannot spread to the field it does not govern.
      expect(runSign(signArgs({ by: SIGNER, note: '   ' }), paths).exitCode).toBe(EXIT_OK);
      expect(appendedLine()['note']).toBe('   ');
    });
  });

  // -------------------------------------------------------------------------
  // Property B, layer 1 — the CLI refuses before the irreversible append
  // -------------------------------------------------------------------------

  describe('the CLI refuses blank authority before writing anything', () => {
    const BLANKS: Array<[string, string]> = [
      ['empty', ''],
      ['three spaces', '   '],
      ['a tab and a newline', '\t\n'],
    ];

    it.each(BLANKS)('runSign refuses %s `by`, and the ledger bytes do not move', (_label, blank) => {
      const before = readFileSync(ledgerPath(), 'utf8');
      const outcome = runSign(signArgs({ by: blank }), paths);

      expect(outcome.exitCode).toBe(EXIT_REFUSED);
      expect(outcome.lines.join('\n')).toMatch(/by is blank/);
      expect(readFileSync(ledgerPath(), 'utf8')).toBe(before);
    });

    it('positive control: the same path writes when `by` names somebody', () => {
      // Required. Every case above is satisfied by a CLI that refuses every
      // signature, which would be a different defect wearing the same green.
      const before = readFileSync(ledgerPath(), 'utf8');
      const outcome = runSign(signArgs({ by: SIGNER }), paths);

      expect(outcome.exitCode).toBe(EXIT_OK);
      expect(readFileSync(ledgerPath(), 'utf8')).not.toBe(before);
      expect(readLedger()).toHaveLength(1);
    });

    it.each(BLANKS)(
      'runRevoke refuses %s `by`, and the ledger bytes do not move',
      (_label, blank) => {
        expect(runSign(signArgs(), paths).exitCode).toBe(EXIT_OK);
        const before = readFileSync(ledgerPath(), 'utf8');
        const { outcome } = revokeOverExisting({ by: blank });

        expect(outcome.exitCode).toBe(EXIT_REFUSED);
        expect(outcome.lines.join('\n')).toMatch(/no signatory/);
        expect(readFileSync(ledgerPath(), 'utf8')).toBe(before);
      },
    );

    it.each(BLANKS)(
      'runRevoke refuses %s `reason`, and the ledger bytes do not move',
      (_label, blank) => {
        expect(runSign(signArgs(), paths).exitCode).toBe(EXIT_OK);
        const before = readFileSync(ledgerPath(), 'utf8');
        const { outcome } = revokeOverExisting({ reason: blank });

        expect(outcome.exitCode).toBe(EXIT_REFUSED);
        expect(outcome.lines.join('\n')).toMatch(/no reason/);
        expect(readFileSync(ledgerPath(), 'utf8')).toBe(before);
      },
    );

    it('positive control: the same path writes when both fields carry a value', () => {
      expect(runSign(signArgs(), paths).exitCode).toBe(EXIT_OK);
      const before = readFileSync(ledgerPath(), 'utf8');
      const { outcome } = revokeOverExisting({});

      expect(outcome.exitCode).toBe(EXIT_OK);
      expect(readFileSync(ledgerPath(), 'utf8')).not.toBe(before);
      expect(readLedger()).toHaveLength(2);
    });

    /** Withdraws whatever signature is already at the head of the ledger. */
    function revokeOverExisting(overrides: Record<string, unknown>) {
      const signed = readLedger()[0];
      if (signed === undefined) throw new Error('seed failed');
      const args = {
        packId: PACK_ID,
        requirementId: REQ_ID,
        revokes: signed.entryId,
        by: REVOKER,
        on: REVOKED_ON,
        reason: REVOCATION_REASON,
        ...overrides,
      };
      return { args, outcome: runRevoke(args, paths) };
    }
  });

  // -------------------------------------------------------------------------
  // Property B, layer 2 — the read path refuses a ledger it did not write
  // -------------------------------------------------------------------------

  describe('a blank authority already in the ledger makes it unreadable', () => {
    it('positive control: the same fixtures parse when every authority carries a value', () => {
      // Without this, every case below is satisfied by a fixture that is broken
      // for some other reason entirely.
      expect(parseLedger(`${JSON.stringify(rivalEntry('E. Earlier'))}\n`)).toHaveLength(1);
      expect(parseLedger(ledgerWithRevocation())).toHaveLength(2);
    });

    it('refuses a signing entry whose `by` is whitespace', () => {
      const text = `${JSON.stringify(sealed({ ...rivalEntry(), by: '   ' }))}\n`;
      expect(() => parseLedger(text)).toThrow(LedgerIntegrityError);
      expect(() => parseLedger(text)).toThrow(/by: is blank/);
    });

    it('refuses a revocation whose `by` is whitespace', () => {
      const text = ledgerWithRevocation({ by: ' ' });
      expect(() => parseLedger(text)).toThrow(LedgerIntegrityError);
      expect(() => parseLedger(text)).toThrow(/line 2: .*by: is blank/);
    });

    it('refuses a revocation whose `reason` is whitespace', () => {
      const text = ledgerWithRevocation({ reason: '\t' });
      expect(() => parseLedger(text)).toThrow(LedgerIntegrityError);
      expect(() => parseLedger(text)).toThrow(/line 2: .*reason: is blank/);
    });
  });
});
