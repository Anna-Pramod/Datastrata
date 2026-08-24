/**
 * `verify run` — the deterministic chain, driven from the command line.
 *
 * Every test here goes through the **production** path and nothing beside it:
 * `dispatch(['run', …])` → `runRun` → `readWorld` → `EntitledClosure` →
 * `runVerificationPipeline` → `writeVerificationResult` → a file. Nothing in
 * this file hand-builds a `VerificationResult`, constructs a result path, or
 * serialises a record. What it controls is the *input* side — which world, which
 * requirement, and what the injected execution capability answers.
 *
 * # The worlds
 *
 * Two temporary repositories, built once and never written to by a run:
 *
 * ```text
 * connected   the real pack and the real corpus, copied
 * split       the same, with the index's edges removed
 * ```
 *
 * They are copies rather than the checkout because a `verify run` publishes a
 * `verification-result.json`, and a test that pointed a publish at the
 * repository would leave a dossier behind in it. Each test additionally gets a
 * fresh `verificationDir`, so the destination, the registry, the promotion
 * ledger and the signature ledger are all per-test and all temporary.
 *
 * `split` exists for one reason. The real index carries a single edge
 * (`DOC-32013L0034 amendedBy DOC-32026L0470`), and traversal follows it, so
 * **every** real requirement's closure is both documents — there is no
 * document the corpus holds and a closure does not reach, and therefore no
 * reachable `closure_gap`. Removing the edge makes `CSRD-S-008` (which cites
 * only `SRC-004`) open onto one document while the corpus still holds two,
 * which is the only shape that exercises the **document** register at the
 * assembly boundary.
 *
 * # What the assertions are worth
 *
 * The trap Task 5c fell into four times is an assertion whose expected value
 * comes from the thing it is testing — and the sentence *claiming* independence
 * needs the same scrutiny as the assertion it describes. So the two byte-level
 * claims here are distinguished rather than lumped together:
 *
 *  - **the hash the CLI printed** is compared against `resultSha256(readback)`.
 *    Genuinely toothed: the two sides have different inputs — a value the writer
 *    computed before the write, against a digest recomputed from the file that
 *    is actually on disk — so a CLI reporting a hash of something other than
 *    what it published reds.
 *  - **the bytes on disk** are compared against `canonicalResultJson(readback)
 *    + RESULT_FILE_FRAMING`. This is a canonical **fixpoint** check, *not* an
 *    independent oracle: the writer calls those same two things. It has teeth
 *    against non-canonical publication and no unique kill here.
 *
 * And the load-bearing claim of the whole task — that the writer's destination
 * *is* the path the sign gate reads — is not asserted as a comparison of two
 * joins. It is asserted by running the real `runSign` over the file the real
 * `runRun` published and requiring the refusal to be `unpromoted_pipeline`.
 * A `run` writing anywhere else produces `invalid_result: no verification
 * result at …` instead, and the test names that.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCorpus, type LoadedCorpus } from '../src/corpus/store';
import { EXIT_OK, EXIT_REFUSED, EXIT_USAGE } from '../src/cli/exit-codes';
import { runSign, resultPath, type VerifyPaths } from '../src/cli/sign';
import type { RunCapabilities } from '../src/cli/run';
import { dispatch } from '../src/cli/verify';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { PIPELINE_IDENTITY_SCHEME } from '../src/pipeline/identity';
import { qualifiedChallengeId } from '../src/pipeline/prosecutors';
import { RESULT_FILE_FRAMING } from '../src/pipeline/write-result';
import type { RoleRequest } from '../src/pipeline/roles';
import {
  canonicalResultJson,
  resultSha256,
  verificationResultSchema,
  type VerificationResult,
} from '../src/verification/result';
import { installNetworkTrap, type NetworkTrap } from './helpers';
import { lensFromRequest, stubRunner } from './pipeline-fixtures';

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = join(here, '..');

const PACK_ID = 'csrd';
/** Two served sources, so the closure is real and both roles have text. */
const COMPLETE_REQ = 'CSRD-S-001';
/** One served source, so the split world's closure is one document of two. */
const SPLIT_REQ = 'CSRD-S-008';
/** Cites SRC-005/006/007, which no document serves: the deterministic source gap. */
const GAP_REQ = 'CSRD-S-012';
const GAP_SOURCES = ['SRC-005', 'SRC-006', 'SRC-007'];

const DOC_A = 'DOC-32013L0034';
const DOC_B = 'DOC-32026L0470';
const QUOTE_A = 'DIRECTIVE 2013/34/EU OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';
const QUOTE_B = 'DIRECTIVE (EU) 2026/470 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';

const READING_A = 'The host instrument governs annual and consolidated reporting.';
const READING_B = 'The amending Directive restates the reporting perimeter.';

let worldsRoot = '';
let CONNECTED = '';
let SPLIT = '';
let corpus: LoadedCorpus;
let verificationDir = '';
let trap: NetworkTrap;

// ---------------------------------------------------------------------------
// The worlds
// ---------------------------------------------------------------------------

function buildWorld(root: string): void {
  mkdirSync(join(root, 'knowledge'), { recursive: true });
  cpSync(join(engineRoot, 'knowledge', PACK_ID), join(root, 'knowledge', PACK_ID), {
    recursive: true,
  });
  cpSync(join(engineRoot, 'corpus'), join(root, 'corpus'), { recursive: true });
}

/**
 * Removes every edge from a world's corpus index.
 *
 * The documents, their bytes and their hashes are untouched — only the
 * relationships are — so the corpus still loads and still verifies. What
 * changes is the traversal: `SPLIT_REQ` then opens onto one of the two
 * documents, and the other becomes a document the corpus holds and the closure
 * does not reach.
 */
function severEdges(root: string): void {
  const path = join(root, 'corpus', 'index.json');
  const index = JSON.parse(readFileSync(path, 'utf8')) as {
    documents: Array<Record<string, unknown>>;
  };
  for (const document of index.documents) document['edges'] = [];
  writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

beforeAll(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'verify-run-worlds-'));
  CONNECTED = join(worldsRoot, 'connected');
  SPLIT = join(worldsRoot, 'split');
  buildWorld(CONNECTED);
  buildWorld(SPLIT);
  severEdges(SPLIT);
  corpus = loadCorpus(join(CONNECTED, 'corpus'));
});

afterAll(() => {
  rmSync(worldsRoot, { recursive: true, force: true });
});

beforeEach(() => {
  verificationDir = mkdtempSync(join(tmpdir(), 'verify-run-out-'));
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

function pathsFor(world: string): VerifyPaths {
  return {
    packDir: join(world, 'knowledge', PACK_ID),
    corpusDir: join(world, 'corpus'),
    verificationDir,
  };
}

const green = (): boolean => true;

/** The production command path, exactly as `verify.ts` reaches it. */
function verifyRun(
  world: string,
  requirementId: string,
  capabilities: RunCapabilities,
): Promise<{ exitCode: number; lines: string[] }> {
  return dispatch(['run', PACK_ID, requirementId], pathsFor(world), green, undefined, capabilities);
}

function destinationIn(world: string, requirementId: string): string {
  return resultPath(pathsFor(world), PACK_ID, requirementId);
}

/** The published record, re-read from disk and re-parsed by the record contract. */
function readback(path: string): VerificationResult {
  return verificationResultSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

// ---------------------------------------------------------------------------
// The injected execution capability
// ---------------------------------------------------------------------------

function quote(docId: string, text: string) {
  return {
    kind: 'quote' as const,
    docId,
    sha256Normalized: corpus.document(docId).sha256Normalized,
    text,
  };
}

/** E-P — the prosecutor's basis: the amending Directive's own title line. */
const evidenceP = () => quote(DOC_B, QUOTE_B);
/** E-A — the adjudicator's basis: a different document and different words. */
const evidenceA = () => quote(DOC_A, QUOTE_A);

function reading(firstStatement = READING_A) {
  return {
    elements: [
      { id: 'RE-1', statement: firstStatement, evidence: [quote(DOC_A, QUOTE_A)] },
      { id: 'RE-2', statement: READING_B, evidence: [quote(DOC_B, QUOTE_B)] },
    ],
    gaps: [],
  };
}

function prosecution(lens: string) {
  return {
    lens,
    coverage: [
      {
        direction: 'reading_to_condition' as const,
        readingElementId: 'RE-1',
        conditionPath: 'all[0]',
        verdict: 'MAPPED' as const,
      },
      {
        direction: 'reading_to_condition' as const,
        readingElementId: 'RE-2',
        verdict: 'UNMAPPED' as const,
        challengeId: 'C1',
      },
      {
        direction: 'condition_to_reading' as const,
        conditionPath: 'all[1]',
        verdict: 'UNSUPPORTED' as const,
        challengeId: 'C2',
      },
    ],
    challenges: [
      {
        id: 'C1',
        lens,
        statement: 'The reading carries an element the encoding never states.',
        evidence: [evidenceP()],
      },
      {
        id: 'C2',
        lens,
        statement: 'The encoding states a bound the reading does not support.',
        evidence: [evidenceP()],
      },
    ],
    gaps: [],
  };
}

/**
 * Every challenge the configured prosecutors raise, adjudicated once each.
 *
 * The ids come from `qualifiedChallengeId` and the count from
 * `DEFAULT_ROLE_CONFIG` — the configuration the production command actually
 * runs — so this stays an *input* derived from production rather than a
 * hard-coded list that would silently under-answer if the count moved.
 */
function adjudication(adjudicationHash?: string) {
  const evidence = adjudicationHash === undefined
    ? evidenceA()
    : { ...evidenceA(), sha256Normalized: adjudicationHash };
  const ids: string[] = [];
  for (let i = 0; i < DEFAULT_ROLE_CONFIG.prosecutorCount; i += 1) {
    ids.push(qualifiedChallengeId(i, 'C1'), qualifiedChallengeId(i, 'C2'));
  }
  return {
    adjudications: ids.map((challengeId) => ({
      challengeId,
      verdict: 'CONFIRMED' as const,
      resolution: 'The challenge is upheld and the encoding already carries the bound.',
      evidence: [evidence],
    })),
    gaps: [],
  };
}

interface Injected extends RunCapabilities {
  requests: RoleRequest[];
}

/**
 * A deterministic execution capability.
 *
 * Not replay: there is no transcript, no recording and no loader here. It is
 * the seam `PipelineRunInput.runner` already declares, answering with fixed
 * text. Task 5e replaces the answers with recorded ones through this same
 * parameter.
 */
function capability(
  options: { firstStatement?: string; adjudicationHash?: string; readerGapDocId?: string } = {},
): Injected {
  const runner = stubRunner((request) => {
    switch (request.role) {
      case 'reader':
        return JSON.stringify(
          options.readerGapDocId === undefined
            ? reading(options.firstStatement)
            : {
                elements: [],
                gaps: [
                  {
                    kind: 'corpus_gap',
                    docId: options.readerGapDocId,
                    detail: 'the reader needed the host instrument',
                  },
                ],
              },
        );
      case 'prosecutor':
        return JSON.stringify(prosecution(lensFromRequest(request)));
      case 'adjudicator':
        return JSON.stringify(adjudication(options.adjudicationHash));
    }
  });
  return { runner, requests: runner.requests };
}

// ---------------------------------------------------------------------------
// COMPLETE
// ---------------------------------------------------------------------------

describe('verify run — a complete run', () => {
  it('publishes the record at the canonical path and exits ok', async () => {
    const injected = capability();
    const outcome = await verifyRun(CONNECTED, COMPLETE_REQ, injected);

    // The refusal text is the assertion message so that a mutation which turns
    // this run into a refusal *names its own reason* in the red, rather than
    // reporting only that 1 is not 0.
    expect(outcome.exitCode, outcome.lines.join('\n')).toBe(EXIT_OK);
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);
    expect(existsSync(destination)).toBe(true);

    // Parses under the record contract, at 1.2.0 and no other version.
    const published = readback(destination);
    expect(published.resultSchemaVersion).toBe('1.2.0');
    expect(published.packId).toBe(PACK_ID);
    expect(published.requirementId).toBe(COMPLETE_REQ);
    expect(published.gaps).toEqual([]);

    // The capability was the only thing that produced a judgment, and nothing
    // was contacted.
    expect(injected.requests.length).toBeGreaterThan(0);
    expect(trap.calls).toEqual([]);
  });

  it('publishes exactly the canonical bytes, taken from the record contract', async () => {
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);
    await verifyRun(CONNECTED, COMPLETE_REQ, capability());

    const bytes = readFileSync(destination, 'utf8');
    // A canonical **fixpoint** check, and named as one rather than as an
    // independent oracle: the writer reaches for `canonicalResultJson` and
    // `RESULT_FILE_FRAMING` itself (`write-result.ts`), so this shares that code
    // path. What it has real teeth against is *non-canonical* publication —
    // bytes that re-serialise to something else, or framing that is not the
    // convention — because re-canonicalising the readback must land back on the
    // file. It has no unique kill in this task's mutation surface; 5c's M9
    // (publication encoding switched to `JSON.stringify(result, null, 2)`) is
    // what establishes it, and that mutant lives in the writer's own suite.
    expect(bytes).toBe(`${canonicalResultJson(readback(destination))}${RESULT_FILE_FRAMING}`);
  });

  it('reports the hash the record contract takes over the published record', async () => {
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);
    const outcome = await verifyRun(CONNECTED, COMPLETE_REQ, capability());

    // Not the writer's report compared against itself: the expected value is
    // the contract's digest of the file that is actually on disk.
    expect(outcome.lines.join('\n')).toContain(resultSha256(readback(destination)));
  });

  it('carries the pipeline identity the run derived, and the pins of the real closure', async () => {
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);
    await verifyRun(CONNECTED, COMPLETE_REQ, capability());
    const published = readback(destination);

    // Contract restatement, not a unique kill: the identity's *content* is
    // `pipeline-identity.test.ts`'s, and the proof that this exact string is
    // the one the gate reads is the promotion positive control below.
    // Through the constant, not a literal `v1`: the scheme is carried in the
    // identity precisely so a change to what is hashed is visible, and a test
    // asserting the old prefix would have to be "repaired" on every such change
    // — which is how a shape assertion quietly stops tracking the shape.
    expect(published.pipelineVersion).toMatch(
      new RegExp(`^pipeline-${PIPELINE_IDENTITY_SCHEME}-[0-9a-f]{64}$`),
    );

    // The pins name both documents of the real closure, at the hashes the
    // corpus files carry. Cross-checked against the corpus rather than against
    // another derivation of the pins.
    expect(published.corpus.map((pin) => pin.docId).sort()).toEqual([DOC_A, DOC_B]);
    for (const pin of published.corpus) {
      expect(pin.sha256Normalized).toBe(corpus.document(pin.docId).sha256Normalized);
      expect(pin.sha256Raw).toBe(corpus.document(pin.docId).sha256Raw);
    }
  });

  it('carries E-P and E-A distinguishably, neither standing in for the other', async () => {
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);
    await verifyRun(CONNECTED, COMPLETE_REQ, capability());
    const published = readback(destination);

    const challenge = published.challenges.find((c) => c.id === qualifiedChallengeId(0, 'C1'));
    expect(challenge).toBeDefined();
    // Crossing the two arrays compiles, satisfies every arity and presence
    // check, and is caught only by naming the document and the words.
    expect.soft(challenge?.evidence[0]).toMatchObject({ docId: DOC_B, text: QUOTE_B });
    expect.soft(challenge?.adjudicationEvidence[0]).toMatchObject({ docId: DOC_A, text: QUOTE_A });
  });
});

// ---------------------------------------------------------------------------
// GAP-BEARING
// ---------------------------------------------------------------------------

describe('verify run — a gap-bearing run', () => {
  it('publishes the gap dossier, exits ok, and never calls the capability', async () => {
    const injected = capability();
    const outcome = await verifyRun(CONNECTED, GAP_REQ, injected);

    // A gap is a verification outcome, not a command failure. The lines are
    // the assertion message so a mutation that refuses this run names the
    // reason it refused.
    expect(outcome.exitCode, outcome.lines.join('\n')).toBe(EXIT_OK);
    const destination = destinationIn(CONNECTED, GAP_REQ);
    expect(existsSync(destination)).toBe(true);

    const published = readback(destination);
    expect(published.gaps.length).toBeGreaterThan(0);
    // The source register is real: these are the requirement's own cited
    // sources, recorded in `sourceId` and never in `docId`.
    expect(published.gaps.map((gap) => gap.sourceId).sort()).toEqual(GAP_SOURCES);
    for (const gap of published.gaps) expect(gap.docId).toBeUndefined();

    // All four judgment containers, one claim each: a conjunction would let
    // three empty ones cover for the fourth.
    expect.soft(published.reading.elements).toEqual([]);
    expect.soft(published.coverage.cells).toEqual([]);
    expect.soft(published.challenges).toEqual([]);
    expect.soft(published.openQuestions).toEqual([]);

    // No agent is required on this path, and none ran. Without this the case
    // passes against a pipeline that asked a model to read an empty surface and
    // discarded the answer.
    expect(injected.requests).toEqual([]);
    expect(trap.calls).toEqual([]);
  });

  it('publishes a document-shaped gap when the corpus holds what the closure does not reach', async () => {
    const injected = capability({ readerGapDocId: DOC_A });
    const outcome = await verifyRun(SPLIT, SPLIT_REQ, injected);

    expect(outcome.exitCode, outcome.lines.join('\n')).toBe(EXIT_OK);
    const published = readback(destinationIn(SPLIT, SPLIT_REQ));
    // Classified by the machinery, not believed from the role: the role said
    // `corpus_gap` and the corpus holds the document, so it is a closure gap.
    expect(published.gaps).toHaveLength(1);
    expect.soft(published.gaps[0]?.kind).toBe('closure_gap');
    expect.soft(published.gaps[0]?.docId).toBe(DOC_A);
    expect.soft(published.gaps[0]?.sourceId).toBeUndefined();
    expect.soft(published.reading.elements).toEqual([]);
    expect(trap.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// INVALID
// ---------------------------------------------------------------------------

describe('verify run — an invalid run', () => {
  it('refuses, and names the record boundary rather than any earlier one', async () => {
    // A genuine record-boundary failure: the adjudicator's quote pins a hash
    // the run's own `corpus[]` does not. No role gate checks a quote hash, so
    // this reaches `assertResultConsistency` inside assembly and nowhere else.
    const outcome = await verifyRun(
      CONNECTED,
      COMPLETE_REQ,
      capability({ adjudicationHash: 'f'.repeat(64) }),
    );

    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    const text = outcome.lines.join('\n');
    // Named specifically, so a `RoleOutputError`, a loader failure or a missing
    // capability could not satisfy this test in place of the record boundary.
    expect.soft(text).toContain('invalid_result');
    expect.soft(text).toContain('adjudicationEvidence');
    expect.soft(text).not.toContain('role_output');
    expect.soft(text).not.toContain('no_execution_capability');
  });

  it('creates nothing at all — not the file, and not its directory', async () => {
    // Separate from the refusal above, and deliberately so. A CLI that simply
    // stopped early would satisfy the refusal test while writing nothing; a CLI
    // that caught the Invalid result and published a repaired dossier would
    // satisfy neither. Only this test distinguishes the second from the first,
    // which is what makes "Invalid publishes nothing" attributable on its own.
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);
    await verifyRun(CONNECTED, COMPLETE_REQ, capability({ adjudicationHash: 'f'.repeat(64) }));

    expect.soft(existsSync(destination)).toBe(false);
    expect.soft(existsSync(dirname(destination))).toBe(false);
  });

  it('leaves a previously published result byte-identical', async () => {
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);
    await verifyRun(CONNECTED, COMPLETE_REQ, capability());
    const before = readFileSync(destination, 'utf8');

    const outcome = await verifyRun(
      CONNECTED,
      COMPLETE_REQ,
      capability({ adjudicationHash: 'f'.repeat(64) }),
    );

    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(readFileSync(destination, 'utf8')).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// REPLACEMENT
// ---------------------------------------------------------------------------

describe('verify run — an existing result', () => {
  it('is replaced by a later valid run at the same destination', async () => {
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);

    await verifyRun(CONNECTED, COMPLETE_REQ, capability({ firstStatement: READING_A }));
    const first = readFileSync(destination, 'utf8');

    const second = await verifyRun(
      CONNECTED,
      COMPLETE_REQ,
      capability({ firstStatement: 'A different reading of the same provision.' }),
    );
    expect(second.exitCode, second.lines.join('\n')).toBe(EXIT_OK);

    const bytes = readFileSync(destination, 'utf8');
    expect(bytes).not.toBe(first);
    expect(readback(destination).reading.elements[0]?.statement).toBe(
      'A different reading of the same provision.',
    );
    // And the replacement is the whole record, not a merge of the two.
    expect(bytes).not.toContain(READING_A);
  });
});

// ---------------------------------------------------------------------------
// THE CAPABILITY AND NETWORK BOUNDARY
// ---------------------------------------------------------------------------

describe('verify run — the execution capability', () => {
  it('refuses by name when none is supplied, writing nothing and contacting nothing', async () => {
    const destination = destinationIn(CONNECTED, COMPLETE_REQ);
    const outcome = await verifyRun(CONNECTED, COMPLETE_REQ, {});

    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    const text = outcome.lines.join('\n');
    expect(text).toContain('no_execution_capability');
    expect(text).toContain('no agent runner was supplied');
    expect(existsSync(destination)).toBe(false);
    // The other half. Without it this passes against a CLI that fell through to
    // a live call and happened to fail for some other reason.
    expect(trap.calls).toEqual([]);
  });

  it('refuses an explicit null exactly as it refuses an absent one', async () => {
    const outcome = await verifyRun(CONNECTED, COMPLETE_REQ, { runner: null });
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toContain('no_execution_capability');
    expect(trap.calls).toEqual([]);
  });

  it('refuses the deterministic source-gap path too, because the guard precedes the work', async () => {
    // Recorded rather than asserted as desirable. §5.2's guard is the first
    // thing orchestration does — deliberately, so a run with no runner never
    // *begins* — and that precedence applies even where no agent would have
    // been asked anything. Relaxing it to let this one path through would make
    // "no runner" reachable only after work had started, which is the property
    // the guard exists to deny.
    const outcome = await verifyRun(CONNECTED, GAP_REQ, {});
    expect(outcome.exitCode).toBe(EXIT_REFUSED);
    expect(outcome.lines.join('\n')).toContain('no_execution_capability');
    expect(existsSync(destinationIn(CONNECTED, GAP_REQ))).toBe(false);
    expect(trap.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE GRAMMAR
// ---------------------------------------------------------------------------

describe('verify run — the command grammar', () => {
  it('is a usage error without a requirementId, never a refusal', async () => {
    const outcome = await dispatch(['run', PACK_ID], pathsFor(CONNECTED), green, undefined, capability());
    expect(outcome.exitCode).toBe(EXIT_USAGE);
    expect(outcome.lines.join('\n')).toContain('npm run verify -- run');
  });

  it('takes no --by, because a pipeline record has no signer', async () => {
    // The positive control for the split: `sign` in the same grammar demands
    // one, and `run` reaching the pipeline without one is what proves the
    // check was skipped rather than merely satisfied.
    const outcome = await verifyRun(CONNECTED, COMPLETE_REQ, capability());
    expect(outcome.exitCode).toBe(EXIT_OK);
  });
});

// ---------------------------------------------------------------------------
// UNPROMOTED BY CONSTRUCTION
// ---------------------------------------------------------------------------

describe('what verify run publishes, fed to verify sign', () => {
  const signArgs = {
    packId: PACK_ID,
    requirementId: COMPLETE_REQ,
    by: 'A. Reviewer',
    kind: 'verified' as const,
    on: '2026-08-21',
    testSuiteGreen: true,
  };

  it('is found at the path the sign gate reads, and refused only for being unpromoted', async () => {
    await verifyRun(CONNECTED, COMPLETE_REQ, capability());

    const signed = runSign(signArgs, pathsFor(CONNECTED));
    const text = signed.lines.join('\n');

    expect(signed.exitCode).toBe(EXIT_REFUSED);
    // The one refusal that must be there.
    expect(text).toContain('unpromoted_pipeline');
    // And the four that must not. `invalid_result` is the path defect: a run
    // that published to a sibling location produces
    // `invalid_result: no verification result at …` here. The other three
    // would mean the dossier itself was unacceptable.
    expect.soft(text).not.toContain('invalid_result');
    expect.soft(text).not.toContain('candidate_inconsistent');
    expect.soft(text).not.toContain('evidence_failed');
    expect.soft(text).not.toContain('unresolved_gap');
  });

  it('becomes signable for that exact identity once it is promoted, and not before', async () => {
    await verifyRun(CONNECTED, COMPLETE_REQ, capability());
    const published = readback(destinationIn(CONNECTED, COMPLETE_REQ));

    // The positive control, and it is test-local: a promotion for exactly the
    // identity the record carries. `isPromoted` compares the whole string, so
    // this only removes the refusal if the record's `pipelineVersion` is the
    // identity the gate read.
    writeFileSync(
      join(verificationDir, 'promotions.jsonl'),
      `${JSON.stringify({
        pipelineVersion: published.pipelineVersion,
        by: 'A. Promoter',
        on: '2026-08-01',
      })}\n`,
      'utf8',
    );

    const signed = runSign(signArgs, pathsFor(CONNECTED));
    expect(signed.lines.join('\n')).not.toContain('unpromoted_pipeline');
  });

  it('is not made signable by a promotion of some other identity', async () => {
    await verifyRun(CONNECTED, COMPLETE_REQ, capability());
    writeFileSync(
      join(verificationDir, 'promotions.jsonl'),
      `${JSON.stringify({
        pipelineVersion: `pipeline-v1-${'0'.repeat(64)}`,
        by: 'A. Promoter',
        on: '2026-08-01',
      })}\n`,
      'utf8',
    );

    const signed = runSign(signArgs, pathsFor(CONNECTED));
    expect(signed.exitCode).toBe(EXIT_REFUSED);
    expect(signed.lines.join('\n')).toContain('unpromoted_pipeline');
  });

  it('writes no ledger of its own — running is not signing, and not promoting', async () => {
    // After a run that *succeeded*, so the absence is a statement about what a
    // publishing `verify run` did. Asserted before any run, it would be a
    // tautology: `beforeEach` mints an empty `verificationDir`, so no
    // implementation could make it red.
    const outcome = await verifyRun(CONNECTED, COMPLETE_REQ, capability());
    expect(outcome.exitCode, outcome.lines.join('\n')).toBe(EXIT_OK);
    expect(existsSync(destinationIn(CONNECTED, COMPLETE_REQ))).toBe(true);

    // A run publishes a dossier and nothing else. Appending to either ledger
    // would make the pipeline its own signer — the separation the whole
    // unpromoted-by-construction property rests on.
    expect.soft(existsSync(join(verificationDir, 'signatures.jsonl'))).toBe(false);
    expect.soft(existsSync(join(verificationDir, 'promotions.jsonl'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE REAL CHECKOUT
// ---------------------------------------------------------------------------

describe('the repository this suite runs in', () => {
  it('holds no result, signature ledger or promotion ledger after any of the above', () => {
    // Every path a run could have published to is under a temp
    // `verificationDir`, and every world is a copy. This states the
    // consequence so a future change that pointed a run at the checkout fails
    // here rather than in a commit.
    expect(existsSync(join(engineRoot, 'verification', 'signatures.jsonl'))).toBe(false);
    expect(existsSync(join(engineRoot, 'verification', 'promotions.jsonl'))).toBe(false);
    for (const requirementId of [COMPLETE_REQ, SPLIT_REQ, GAP_REQ]) {
      expect(
        existsSync(
          join(engineRoot, 'verification', PACK_ID, requirementId, 'verification-result.json'),
        ),
      ).toBe(false);
    }
  });
});
