/**
 * Source completeness is independent of closure cardinality.
 *
 * A requirement's `sources[]` is an **authored provenance claim**. If it says
 * the requirement depends on `SRC-A` and `SRC-B`, a factory holding only `SRC-A`
 * has no authority to decide `SRC-B` was unnecessary because `SRC-A` happened to
 * yield a usable document. Allowing that lets missing evidence become quietly
 * thinner evidence, over which an agent then forms a substantive judgment.
 *
 * Before this repair the check was gated on the closure being *entirely* empty,
 * so a requirement one of whose sources resolved published a **Complete,
 * zero-gap, signable dossier** over a surface its own author had declared
 * incomplete. Nine of sixteen real CSRD requirements were in that state.
 *
 * ```text
 * some entitled evidence exists     closure.docIds.length > 0
 * every declared source is backed   ∀ s ∈ sources: corpusServes(s)
 * ```
 *
 * Two propositions. Every test here exists because the code conflated them.
 *
 * **Everything runs through the production command path** — `runRun`, the same
 * function `dispatch` delegates to — into temporary directories. Nothing is
 * hand-assembled and nothing is written into the repository.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT_OK, EXIT_REFUSED } from '../src/cli/exit-codes';
import { runRun, type RunCapabilities } from '../src/cli/run';
import { runSign, resultPath, type VerifyPaths } from '../src/cli/sign';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { conditionPathsFor, qualifiedChallengeId } from '../src/pipeline/prosecutors';
import type { RoleRequest } from '../src/pipeline/roles';
import { loadCorpus } from '../src/corpus/store';
import { loadPack } from '../src/knowledge/loader';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { EMPTY_CLOSURE_SHA256 } from '../src/verification/result';
import type { RenderContext } from '../src/verification/render';
import { verificationResultSchema, type VerificationResult } from '../src/verification/result';
import { installNetworkTrap, type NetworkTrap } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = join(here, '..');
const PACK_ID = 'csrd';

/**
 * Fully served: it cites `SRC-004` and nothing else, and `SRC-004` resolves.
 *
 * That it cites **only** `SRC-004` is what makes it usable as the positive
 * control in the `SEVERED` world, where `SRC-001` is stripped. A comment here
 * previously claimed it cited both; the test was correct *because* that claim
 * was false, which is the worst way for a comment to be wrong.
 */
const FULLY_SERVED = 'CSRD-S-008';
/** Cites SRC-002 and SRC-009, neither served, plus SRC-004 which is. */
const TWO_MISSING = 'CSRD-S-006';
/** Cites SRC-002 (unserved) and SRC-004 (served) — the minimal partial case. */
const ONE_MISSING = 'CSRD-S-005';

let worldsRoot = '';
/** The real pack and corpus, copied. */
let REAL = '';
/**
 * The same, with `SRC-001` removed from the document that serves it.
 *
 * Built rather than reused so the partial case is exercised against a corpus
 * this suite controls: `CSRD-S-001` then cites one served source and one
 * unserved one, and its closure is genuinely non-empty. The real corpus already
 * supplies partial cases, and they are asserted separately — this one proves the
 * invariant is about the *shape*, not about which sources CSRD happens to name.
 */
let SEVERED = '';
let verificationDir = '';
let trap: NetworkTrap;

function buildWorld(root: string): void {
  mkdirSync(join(root, 'knowledge'), { recursive: true });
  cpSync(join(engineRoot, 'knowledge', PACK_ID), join(root, 'knowledge', PACK_ID), { recursive: true });
  cpSync(join(engineRoot, 'corpus'), join(root, 'corpus'), { recursive: true });
}

/** Removes one `serves` declaration. Documents, bytes and hashes untouched. */
function unserve(root: string, sourceId: string): void {
  const path = join(root, 'corpus', 'index.json');
  const index = JSON.parse(readFileSync(path, 'utf8')) as {
    documents: { serves: string[] }[];
  };
  for (const document of index.documents) {
    document.serves = document.serves.filter((s) => s !== sourceId);
  }
  writeFileSync(path, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

beforeAll(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'source-completeness-'));
  REAL = join(worldsRoot, 'real');
  SEVERED = join(worldsRoot, 'severed');
  buildWorld(REAL);
  buildWorld(SEVERED);
  unserve(SEVERED, 'SRC-001');
});

afterAll(() => {
  rmSync(worldsRoot, { recursive: true, force: true });
});

beforeEach(() => {
  verificationDir = mkdtempSync(join(tmpdir(), 'source-completeness-out-'));
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

/**
 * A deterministic capability that records every request.
 *
 * The request count is the load-bearing observation: "no agent ran" asserted
 * from the absence of a gap would be satisfied by a pipeline that never calls
 * anything, so every zero here is paired with a case in this file where the
 * same capability is genuinely reached.
 */
function capabilityFor(world: string, requirementId: string): RunCapabilities & { requests: RoleRequest[] } {
  const corpus = loadCorpus(join(world, 'corpus'));
  const pack = loadPack(join(world, 'knowledge', PACK_ID), {
    versionRegistryDir: join(verificationDir, 'requirement-versions'),
  });
  const requirement = pack.requirements.find((r) => r.id === requirementId)!;
  const renderCtx: RenderContext = { factTypes: pack.factTypes, catalogues: pack.catalogues };
  const paths = conditionPathsFor(requirement, renderCtx);
  const requests: RoleRequest[] = [];

  const quote = () => {
    const docId = corpus.index.documents[0]!.docId;
    const doc = corpus.document(docId);
    const text = readFileSync(join(world, 'corpus', doc.normalizedPath), 'utf8');
    return [{
      kind: 'quote' as const,
      docId,
      sha256Normalized: doc.sha256Normalized,
      text: text.split('\n').find((l) => l.trim().length > 40)!.trim(),
    }];
  };

  return {
    requests,
    runner: {
      kind: 'replay',
      run(request: RoleRequest) {
        requests.push(request);
        if (request.role === 'reader') {
          return Promise.resolve({ outputJson: JSON.stringify({
            elements: [{ id: 'RE-1', statement: 'Probe element.', evidence: quote() }],
            gaps: [],
          })});
        }
        if (request.role === 'prosecutor') {
          const lens = /^# Lens\n\n(.+)$/m.exec(
            request.messages.find((m) => m.from === 'input')?.content ?? '')?.[1] ?? 'x';
          return Promise.resolve({ outputJson: JSON.stringify({
            lens,
            coverage: [
              { direction: 'reading_to_condition', readingElementId: 'RE-1', conditionPath: paths[0], verdict: 'MAPPED' },
              { direction: 'condition_to_reading', conditionPath: paths[paths.length - 1], verdict: 'UNSUPPORTED', challengeId: 'C1' },
            ],
            challenges: [{ id: 'C1', lens, statement: 'Probe challenge.', evidence: quote() }],
            gaps: [],
          })});
        }
        const ids: string[] = [];
        for (let i = 0; i < DEFAULT_ROLE_CONFIG.prosecutorCount; i += 1) ids.push(qualifiedChallengeId(i, 'C1'));
        return Promise.resolve({ outputJson: JSON.stringify({
          adjudications: ids.map((challengeId) => ({
            challengeId, verdict: 'CONFIRMED', resolution: 'Probe resolution.', evidence: quote(),
          })),
          gaps: [],
        })});
      },
    },
  };
}

function readback(path: string): VerificationResult {
  return verificationResultSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * The closure digest the world genuinely produces for a requirement.
 *
 * Computed here through `EntitledClosure.forSources` — the same production
 * constructor `runRun` uses — rather than copied from the published result. An
 * expected value read out of the artefact under test would agree with a writer
 * that published any closure at all.
 */
function closureShaFor(world: string, requirementId: string): string {
  const corpus = loadCorpus(join(world, 'corpus'));
  const pack = loadPack(join(world, 'knowledge', PACK_ID), {
    versionRegistryDir: join(verificationDir, 'requirement-versions'),
  });
  const requirement = pack.requirements.find((r) => r.id === requirementId)!;
  return EntitledClosure.forSources(corpus, requirement.sources).sha256;
}

// ---------------------------------------------------------------------------
// The partial case, end to end
// ---------------------------------------------------------------------------

describe('a cited source nothing serves halts the run, whatever the closure holds', () => {
  it('publishes a gap-bearing dossier naming the source, over a real non-empty closure', async () => {
    const capability = capabilityFor(SEVERED, 'CSRD-S-001');
    const outcome = await runRun(
      { packId: PACK_ID, requirementId: 'CSRD-S-001' }, pathsFor(SEVERED), capability);

    // A gap is a finding, not a failure.
    expect(outcome.exitCode).toBe(EXIT_OK);

    const destination = resultPath(pathsFor(SEVERED), PACK_ID, 'CSRD-S-001');
    expect(existsSync(destination)).toBe(true);
    const result = readback(destination);

    // The gap names the source, and no document.
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]!.kind).toBe('corpus_gap');
    expect(result.gaps[0]!.sourceId).toBe('SRC-001');
    expect(result.gaps[0]!.docId).toBeUndefined();

    // The closure is genuinely non-empty and is pinned as itself — the point of
    // the whole repair. A gap records what is missing; it must not erase what
    // was actually available. A gap-bearing result with real entitled documents
    // is a valid shape, and no rule may require an empty closure for
    // `corpus_gap`.
    //
    // Named document, not merely a non-zero count: `SRC-004` is still served, so
    // the document it entitles must survive into the pins. A count would be
    // satisfied by any closure at all.
    //
    // The digest half is asserted in its own test below. Kept apart because
    // this line masks it: every mutation that loses the documents also moves
    // the digest, so conjoined they can never show the digest assertion firing
    // on its own (evidence standard, mode 4).
    expect(result.corpus.map((entry) => entry.docId)).toContain('DOC-32026L0470');

    // Schema-valid 1.2.0, and all four judgment containers canonically empty.
    expect(result.resultSchemaVersion).toBe('1.2.0');
    expect(result.reading.elements).toEqual([]);
    expect(result.coverage.cells).toEqual([]);
    expect(result.challenges).toEqual([]);
    expect(result.openQuestions).toEqual([]);

    // Stopped before agent execution, by the machinery and not by the reader.
    expect(capability.requests).toHaveLength(0);
    expect(trap.calls).toEqual([]);
  });

  it('pins the digest of the real closure, not of an empty one', async () => {
    // The other half of "the gap did not erase what was available", separated
    // from the document assertion so it can be observed failing alone. A run
    // that kept `corpus[]` intact while pinning some other closure digest would
    // publish a record whose documents and whose hash describe different
    // surfaces — and every signature compares the hash, not the list.
    await runRun({ packId: PACK_ID, requirementId: 'CSRD-S-001' }, pathsFor(SEVERED),
      capabilityFor(SEVERED, 'CSRD-S-001'));
    const result = readback(resultPath(pathsFor(SEVERED), PACK_ID, 'CSRD-S-001'));

    // Derived through the production constructor, not read back off the
    // artefact under test.
    expect(result.corpusClosureSha256).toBe(closureShaFor(SEVERED, 'CSRD-S-001'));
    expect(result.corpusClosureSha256).not.toBe(EMPTY_CLOSURE_SHA256);
  });

  it('runs no agent at all — asserted on its own, so nothing masks it', async () => {
    // The zero-agent property in its own test. Inside the dossier test it sat
    // behind the gap assertions, so a mutation that computed the gap and then
    // continued into the reader reddened on the gap count and never reached
    // this line. Conjuncts mask one another (evidence standard, mode 4).
    const capability = capabilityFor(SEVERED, 'CSRD-S-001');
    await runRun({ packId: PACK_ID, requirementId: 'CSRD-S-001' }, pathsFor(SEVERED), capability);

    expect(capability.requests).toHaveLength(0);
    expect(capability.requests.filter((r) => r.role === 'reader')).toHaveLength(0);
    expect(trap.calls).toEqual([]);
  });

  it('positive control: the same capability IS reached when every source is served', async () => {
    // Without this, "zero requests" would be equally green against a pipeline
    // that halts everything — the negative observation needs a positive twin.
    const capability = capabilityFor(SEVERED, FULLY_SERVED);
    const outcome = await runRun(
      { packId: PACK_ID, requirementId: FULLY_SERVED }, pathsFor(SEVERED), capability);

    expect(outcome.exitCode).toBe(EXIT_OK);
    const result = readback(resultPath(pathsFor(SEVERED), PACK_ID, FULLY_SERVED));
    expect(result.gaps).toEqual([]);
    expect(result.reading.elements.length).toBeGreaterThan(0);

    // Reader + every configured prosecutor + adjudicator.
    expect(capability.requests).toHaveLength(2 + DEFAULT_ROLE_CONFIG.prosecutorCount);
    expect(capability.requests.filter((r) => r.role === 'reader')).toHaveLength(1);
    expect(trap.calls).toEqual([]);
  });

  it('names one gap per missing source, and never invents a docId', async () => {
    // CSRD-S-006 cites SRC-002, SRC-004, SRC-009 — two unserved, one served.
    const capability = capabilityFor(REAL, TWO_MISSING);
    const outcome = await runRun(
      { packId: PACK_ID, requirementId: TWO_MISSING }, pathsFor(REAL), capability);

    expect(outcome.exitCode).toBe(EXIT_OK);
    const result = readback(resultPath(pathsFor(REAL), PACK_ID, TWO_MISSING));

    expect(result.gaps).toHaveLength(2);
    // Exact identities, and `SRC-004` correctly absent because it is served.
    //
    // This does **not** discriminate ordering: for this requirement
    // `['SRC-002','SRC-009']` is simultaneously declaration order, sorted order
    // and corpus-index order. The permutation case in `pipeline-reader.test.ts`
    // is what proves order follows the requirement's own declaration — it feeds
    // `['SRC-901','SRC-900']` in and requires the same sequence out.
    expect(result.gaps.map((gap) => gap.sourceId)).toEqual(['SRC-002', 'SRC-009']);
    for (const gap of result.gaps) {
      expect.soft(gap.kind).toBe('corpus_gap');
      expect.soft(gap.docId).toBeUndefined();
    }
    // The served source's document is still entitled and still pinned.
    expect(result.corpus.length).toBeGreaterThan(0);
    expect(capability.requests).toHaveLength(0);
    expect(trap.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A gap dossier is writable, and remains unsignable
// ---------------------------------------------------------------------------

describe('the defect cannot migrate from silently-Complete to accidentally-signable', () => {
  it('the run first publishes a readable gap-bearing dossier to sign against', async () => {
    // The precondition, in its own test. It lived inside the signing test and
    // masked it: with the gap suppressed upstream, the signing test reddened on
    // this line and never reached the `unresolved_gap` assertion, so that
    // assertion could not be shown to be live. Conjuncts mask one another.
    const outcome = await runRun({ packId: PACK_ID, requirementId: ONE_MISSING },
      pathsFor(REAL), capabilityFor(REAL, ONE_MISSING));
    expect(outcome.exitCode).toBe(EXIT_OK);
    const result = readback(resultPath(pathsFor(REAL), PACK_ID, ONE_MISSING));
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]!.sourceId).toBe('SRC-002');
  });

  it('the sign gate refuses a partial-source dossier with unresolved_gap', async () => {
    await runRun({ packId: PACK_ID, requirementId: ONE_MISSING }, pathsFor(REAL),
      capabilityFor(REAL, ONE_MISSING));

    const outcome = runSign(
      { packId: PACK_ID, requirementId: ONE_MISSING, by: 'A. Reviewer',
        kind: 'verified', on: '2026-08-24', testSuiteGreen: true },
      pathsFor(REAL));

    expect(outcome.exitCode).toBe(EXIT_REFUSED);

    // **This specific gate, not merely "something refused".** `runSign` has nine
    // refusals and `unpromoted_pipeline` would refuse this same dossier
    // independently — B2 promotes nothing, ever. A test asserting only that
    // signing failed would stay green with the gap gate removed entirely.
    const lines = outcome.lines.join('\n');
    expect(lines).toContain('unresolved_gap');
    // The missing source is named in the refusal, so an operator reading it
    // learns what to ingest rather than that something was wrong.
    expect(lines).toContain('SRC-002');

    // Nothing was appended.
    expect(existsSync(join(verificationDir, 'signatures.jsonl'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The real pack's topology, pinned as a regression
// ---------------------------------------------------------------------------

describe('the real CSRD pack, partitioned by what a live run could reach', () => {
  /**
   * Pinned deliberately, in a test rather than in production.
   *
   * This is a regression against the *content condition* that exposed the
   * defect: **ten** requirements cite at least one source the corpus does not
   * serve, and nine of those additionally obtain a non-empty closure from their
   * other sources — which is the population that used to publish a Complete
   * dossier. Ten is the number of gap cases below; nine is the number the defect
   * silently mis-served. Collapsing the two is the same conflation this repair
   * exists to remove. If the corpus is later repaired by ingesting that
   * material, this test fails and must be updated by a human who has looked at
   * why — which is the intended behaviour, not an inconvenience.
   */
  const MODEL_REACHABLE = ['CSRD-S-001', 'CSRD-S-002', 'CSRD-S-007', 'CSRD-S-008', 'CSRD-S-009', 'CSRD-S-016'];
  const DETERMINISTIC_GAP = ['CSRD-S-003', 'CSRD-S-004', 'CSRD-S-005', 'CSRD-S-006', 'CSRD-S-010',
    'CSRD-S-011', 'CSRD-S-012', 'CSRD-S-013', 'CSRD-S-014', 'CSRD-S-015'];

  it.each(DETERMINISTIC_GAP)('%s halts before any agent runs', async (requirementId) => {
    const capability = capabilityFor(REAL, requirementId);
    const outcome = await runRun({ packId: PACK_ID, requirementId }, pathsFor(REAL), capability);
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(readback(resultPath(pathsFor(REAL), PACK_ID, requirementId)).gaps.length).toBeGreaterThan(0);
    expect(capability.requests).toHaveLength(0);
  });

  it.each(MODEL_REACHABLE)('%s reaches the reader, by observed request and not by inference', async (requirementId) => {
    // Reachability asserted from a recorded call, never from `gaps.length === 0`.
    const capability = capabilityFor(REAL, requirementId);
    const outcome = await runRun({ packId: PACK_ID, requirementId }, pathsFor(REAL), capability);
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(readback(resultPath(pathsFor(REAL), PACK_ID, requirementId)).gaps).toEqual([]);
    expect(capability.requests.filter((r) => r.role === 'reader')).toHaveLength(1);
  });

  it('the partition is 6 model-reachable and 10 deterministic-gap, and covers the pack', () => {
    expect(MODEL_REACHABLE).toHaveLength(6);
    expect(DETERMINISTIC_GAP).toHaveLength(10);
    const pack = loadPack(join(REAL, 'knowledge', PACK_ID), {
      versionRegistryDir: join(verificationDir, 'requirement-versions'),
    });
    expect(new Set([...MODEL_REACHABLE, ...DETERMINISTIC_GAP])).toEqual(
      new Set(pack.requirements.map((r) => r.id)));
  });
});
