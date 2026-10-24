/**
 * Source completeness is independent of closure cardinality.
 *
 * A requirement's `provenance` is an **authored claim** about what the
 * determination rests on, and `sources` is its derivation. If it says the
 * requirement depends on `SRC-A` and `SRC-B`, a factory holding only `SRC-A`
 * has no authority to decide `SRC-B` was unnecessary because `SRC-A` happened to
 * yield a usable document. Allowing that lets missing evidence become quietly
 * thinner evidence, over which an agent then forms a substantive judgment.
 *
 * Before this repair the check was gated on the closure being *entirely* empty,
 * so a requirement one of whose sources resolved published a **Complete,
 * zero-gap, signable dossier** over a surface its own author had declared
 * incomplete. Nine of sixteen real CSRD requirements were in that state — a
 * count over the *pre-audit* pack, left as the record of what the defect cost.
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
import { z } from 'zod';

import { EXIT_OK, EXIT_REFUSED } from '../src/cli/exit-codes';
import { runRun, type RunCapabilities } from '../src/cli/run';
import { runSign, resultPath, type VerifyPaths } from '../src/cli/sign';
import { DEFAULT_ROLE_CONFIG } from '../src/pipeline/config';
import { conditionPathsFor, qualifiedChallengeId } from '../src/pipeline/prosecutors';
import type { RoleRequest } from '../src/pipeline/roles';
import { loadCorpus } from '../src/corpus/store';
import { authoriseCorpus } from '../src/corpus/authority';
import { parseSourceRegister } from '../src/monitoring/register';
import { loadPack } from '../src/knowledge/loader';
import { requirementSchema } from '../src/knowledge/schema';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { requirementSha256 } from '../src/verification/canonical';
import { EntitledClosure } from '../src/pipeline/entitlement';
import { EMPTY_CLOSURE_SHA256 } from '../src/verification/result';
import type { RenderContext } from '../src/verification/render';
import { verificationResultSchema, type VerificationResult } from '../src/verification/result';
import { installNetworkTrap, type NetworkTrap } from './helpers';
import { installRealRegister, installSyntheticRegister } from './world-register';
import { AUDIT_EXPECTED_SOURCES, AUDIT_EXPECTED_CITATION_COUNT, AUDIT_EXPECTED_UNIVERSE, EXPECTED_SOURCES } from './audit-expected-provenance';
import { csrdPack } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = join(here, '..');
const PACK_ID = 'csrd';

/**
 * The real pack's anchors, chosen from the **post-audit** provenance.
 *
 * These are re-derived, not carried over. The D1a-0b audit — and the
 * 2026-08-27 S-004 correction to it — moved thirteen requirements onto
 * `SRC-001` and left `SRC-004` cited by nothing at all, so the old anchors
 * (`SRC-004` as the served backbone, `CSRD-S-006` with two unserved sources
 * plus one served) no longer describe anything in the pack. Hunting for
 * replacements that recreated the old fixture shape would have been the
 * plan's named failure inverted: preserving a test's *topology* across a
 * migration that legitimately changed it. What is anchored here instead is
 * one requirement per **shape** the invariant has to cover.
 *
 * Read against `corpus/index.json`, which serves `SRC-001` and `SRC-004`.
 */
/** `SRC-001` alone, and it is served — every source backed, nothing to gap. */
const FULLY_SERVED = 'CSRD-S-008';
/**
 * `SRC-001` (served) + `SRC-008` (unserved) — the pack's **only** partial case.
 *
 * This is the shape the whole repair exists for: a non-empty closure over which
 * a judgment must nonetheless not be formed. It carries the tests that used to
 * run against a severed CSRD corpus.
 */
const PARTIAL = 'CSRD-S-011';
/** `SRC-002` alone, unserved — a gap over a genuinely empty closure. */
const EMPTY_CLOSURE_GAP = 'CSRD-S-003';
/** Its twin, on the same unserved source, from the S-004 correction. */
const EMPTY_CLOSURE_GAP_TWIN = 'CSRD-S-004';
/**
 * `SRC-005` + `SRC-007`, of which **only `SRC-007`** is still unserved.
 *
 * T6 ingested the ESRS consolidation, so this requirement moved from two gaps
 * to one without becoming reachable — which is the property it is used for
 * here. The name is kept deliberately: what it selects is the requirement whose
 * gap set is a strict subset of its cited sources, and that is still true.
 */
const TWO_MISSING = 'CSRD-S-012';

let worldsRoot = '';
/** The real pack and corpus, copied. */
let REAL = '';
/**
 * The real world with `SRC-002` unserved, built for the one proposition the
 * real corpus can no longer carry.
 *
 * T9 ingested the consolidated CSRD, so `CSRD-S-003` and `CSRD-S-004` close
 * over a real document and **no requirement in the real pack gaps over an
 * empty closure any more**. The proposition still matters — a `corpus_gap` may
 * coincide with an empty closure, and the repair must not have swung the other
 * way into *requiring* a non-empty one — so it moves to a world built for it,
 * exactly as severing did when the audit took that shape away from the pack.
 */
let REAL_SRC002_UNSERVED = '';
let verificationDir = '';
let trap: NetworkTrap;

function buildWorld(root: string): void {
  mkdirSync(join(root, 'knowledge'), { recursive: true });
  cpSync(join(engineRoot, 'knowledge', PACK_ID), join(root, 'knowledge', PACK_ID), { recursive: true });
  cpSync(join(engineRoot, 'corpus'), join(root, 'corpus'), { recursive: true });
  // A runtime world is not complete without the register: `loadPack` refuses
  // without one, because requirement-side citability is checked against it.
  installRealRegister(root);
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

// ---------------------------------------------------------------------------
// A minimal synthetic world, for the act of severing itself
// ---------------------------------------------------------------------------

/**
 * The generic source-completeness invariant, with no CSRD in it.
 *
 * The real pack can no longer demonstrate *severing*. After the D1a-0b audit
 * and the 2026-08-27 S-004 correction, twelve of its sixteen requirements cite
 * `SRC-001` alone and none cites `SRC-004`, so removing a single `serves`
 * declaration from the real corpus either changes nothing or gaps the entire
 * pack at once — and a world in which everything halts cannot tell a working
 * barrier apart from an implementation that refuses unconditionally.
 *
 * Rather than hunt the pack for a requirement that happens to restore the old
 * fixture shape, the shape is built. Two synthetic sources, two synthetic
 * requirements, one of which cites both:
 *
 * ```text
 * SRC-901 served   SRC-902 served      SYN-R-A  → SRC-901
 *                                      SYN-R-AB → SRC-901 + SRC-902
 * ```
 *
 * Severing `SRC-902` must leave `SYN-R-A` runnable while `SYN-R-AB` halts with
 * exactly one gap, still holding `SRC-901`'s document. **The positive control
 * lives in the severed world too** — that is the whole point of building it.
 * A control drawn from the baseline world would leave a global refusal green.
 *
 * `SRC-901`/`SRC-902` rather than `SRC-A`/`SRC-B`: `provenance.sourceId` is
 * `/^SRC-\d{3}$/`, and the fixture obeys the schema rather than bending it.
 *
 * The two corpus documents are the real corpus's files, copied byte for byte
 * and re-labelled. They are **opaque payloads** here: nothing below reads their
 * text or asserts anything about what they say. Borrowing them keeps the
 * fixture honest, because a hand-written document would have to satisfy the
 * corpus's raw-reproduces-normalized check under the real normalizer, and
 * faking that is how a fixture starts lying about integrity. Their `edges` are
 * dropped so the two sources are genuinely independent: with the real
 * `amendedBy` edge left in place, `SYN-R-A`'s closure would traverse into the
 * second document and the severed source's *document* would still be reachable,
 * blurring the one distinction under test — served versus present.
 */
const SYN_PACK_ID = 'syn';
const SOURCE_A = 'SRC-901';
const SOURCE_B = 'SRC-902';
const SYN_ONE = 'SYN-R-A';
const SYN_BOTH = 'SYN-R-AB';

let SYN_BASELINE = '';
let SYN_SEVERED = '';
/** Written into each test's fresh `verificationDir` by `beforeEach`. */
let synRegistry = '';

function syntheticRequirement(id: string, sourceIds: readonly string[]): unknown {
  return {
    id,
    version: 1,
    title: `Probe ${id}`,
    program: 'SYN',
    decisionArea: 'Probe',
    plainEnglish: `Probe requirement ${id}.`,
    scopeType: 'legal_entity',
    relationshipClass: 'direct_legal',
    severity: 'low',
    kind: 'boolean',
    condition: { op: 'eq', fact: 'entity.probe_flag', value: true },
    legalStatus: 'in_force',
    provenance: sourceIds.map((sourceId) => ({ sourceId, locators: [{ kind: 'whole_document' }] })),
  };
}

const SYN_REQUIREMENTS = [
  syntheticRequirement(SYN_ONE, [SOURCE_A]),
  syntheticRequirement(SYN_BOTH, [SOURCE_A, SOURCE_B]),
];

function buildSyntheticWorld(root: string): void {
  const packDir = join(root, 'knowledge', SYN_PACK_ID);
  mkdirSync(packDir, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFileSync(join(packDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

  write('pack.json', {
    id: SYN_PACK_ID, version: '1.0.0', program: 'SYN',
    legalSnapshot: '2026-08-27', packFlags: {}, changeWatch: [],
  });
  write('requirements.json', SYN_REQUIREMENTS);
  write('sources.json', [SOURCE_A, SOURCE_B].map((id) => ({
    id, title: `Probe source ${id}`, legalType: 'probe', temporalStanding: 'in_force',
    usedFor: 'Source-completeness fixture', url: `https://example.invalid/${id}`,
  })));
  write('fact-types.json', [{
    id: 'entity.probe_flag', scopeType: 'legal_entity', dataType: 'boolean',
    module: 'probe', reusableAcrossPrograms: 'no', label: 'Probe flag',
  }]);
  write('catalogues.json', {});
  write('obligation-templates.json', []);
  write('gap-tests.json', []);
  write('questionnaire.json', []);

  // Real files, re-labelled; see the block comment above.
  cpSync(join(engineRoot, 'corpus'), join(root, 'corpus'), { recursive: true });
  const indexPath = join(root, 'corpus', 'index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { documents: Record<string, unknown>[] };
  const [first, second] = index.documents;
  index.documents = [
    { ...first, docId: 'DOC-P', serves: [SOURCE_A], edges: [] },
    { ...second, docId: 'DOC-Q', serves: [SOURCE_B], edges: [] },
  ];
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  // Both synthetic sources are stand-ins for legal instruments, and this world
  // is about *serving*, not authority — so both carry `legal_record` and the
  // severing result cannot be confused with a citability refusal.
  //
  // Origins as well as authorities. The two are different axes and this world
  // needs both: the authority says the source may be cited, the origin says
  // this artefact may serve it. They are declared from the documents' own
  // recorded URLs, which is what makes severing `serves` — not the URL — the
  // only variable between the baseline and severed worlds.
  const [originA, originB] = index.documents;
  installSyntheticRegister(
    root,
    [
      { sourceId: SOURCE_A, tier: 'legal_record', rationale: 'Fixture: a legal instrument.' },
      { sourceId: SOURCE_B, tier: 'legal_record', rationale: 'Fixture: a legal instrument.' },
    ],
    [
      { sourceId: SOURCE_A, kind: 'exact', url: originA!.url as string },
      { sourceId: SOURCE_B, kind: 'exact', url: originB!.url as string },
    ],
  );
}

function buildSyntheticWorlds(root: string): void {
  SYN_BASELINE = join(root, 'syn-baseline');
  SYN_SEVERED = join(root, 'syn-severed');
  buildSyntheticWorld(SYN_BASELINE);
  buildSyntheticWorld(SYN_SEVERED);
  // The one difference between the two worlds.
  unserve(SYN_SEVERED, SOURCE_B);

  // The registry is computed from the authored records through the production
  // hash, not transcribed, so the fixture cannot drift from its own digests.
  const registry: Record<string, Record<string, string>> = {};
  for (const requirement of SYN_REQUIREMENTS) {
    const parsed = requirementSchema.parse(requirement);
    registry[parsed.id] = { [String(parsed.version)]: requirementSha256(parsed as never) };
  }
  synRegistry = `${JSON.stringify(registry, null, 2)}\n`;
}

beforeAll(() => {
  worldsRoot = mkdtempSync(join(tmpdir(), 'source-completeness-'));
  REAL = join(worldsRoot, 'real');
  buildWorld(REAL);
  REAL_SRC002_UNSERVED = join(worldsRoot, 'real-src002-unserved');
  buildWorld(REAL_SRC002_UNSERVED);
  unserve(REAL_SRC002_UNSERVED, 'SRC-002');
  buildSyntheticWorlds(worldsRoot);
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
  writeFileSync(join(verificationDir, 'requirement-versions', `${SYN_PACK_ID}.json`), synRegistry, 'utf8');
  trap = installNetworkTrap();
});

afterEach(() => {
  trap.restore();
  rmSync(verificationDir, { recursive: true, force: true });
});

function pathsFor(world: string, packId: string = PACK_ID): VerifyPaths {
  return {
    packDir: join(world, 'knowledge', packId),
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
function capabilityFor(
  world: string,
  requirementId: string,
  packId: string = PACK_ID,
): RunCapabilities & { requests: RoleRequest[] } {
  const corpus = loadCorpus(join(world, 'corpus'));
  const pack = loadPack(join(world, 'knowledge', packId), {
    versionRegistryDir: join(verificationDir, 'requirement-versions'),
  });
  const requirement = pack.requirements.find((r) => r.id === requirementId)!;
  const renderCtx: RenderContext = { factTypes: pack.factTypes, catalogues: pack.catalogues };
  const paths = conditionPathsFor(requirement, renderCtx);
  const requests: RoleRequest[] = [];

  // **Quote from a document the requirement is actually entitled to.**
  // This used to cite `corpus.index.documents[0]`, which worked only because
  // that document happened to sit in the closure of every requirement the
  // suite exercised. T9 ended the coincidence: CSRD-S-003 and CSRD-S-004 close
  // over the newly served CSRD alone, so a quote from the Accounting Directive
  // is evidence they were never entitled to and the pipeline refuses the run —
  // correctly. Selecting from the requirement's own closure makes the stub
  // honest for every requirement rather than accidentally right for some.
  const entitledDocIds = EntitledClosure.forSources(authoriseCorpus(corpus, parseSourceRegister(
      JSON.parse(readFileSync(join(world, 'monitoring', 'source-register.json'), 'utf8')),
    ), pack), parseSourceRegister(
      JSON.parse(readFileSync(join(world, 'monitoring', 'source-register.json'), 'utf8')),
    ), pack, requirement.sources).docIds;

  const quote = () => {
    const docId = entitledDocIds[0] ?? corpus.index.documents[0]!.docId;
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
function closureShaFor(world: string, requirementId: string, packId: string = PACK_ID): string {
  const corpus = loadCorpus(join(world, 'corpus'));
  const pack = loadPack(join(world, 'knowledge', packId), {
    versionRegistryDir: join(verificationDir, 'requirement-versions'),
  });
  const requirement = pack.requirements.find((r) => r.id === requirementId)!;
  // The same authorisation the production path performs; `forSources` accepts
  // nothing else.
  const register = parseSourceRegister(
    JSON.parse(readFileSync(join(world, 'monitoring', 'source-register.json'), 'utf8')),
  );
  return EntitledClosure.forSources(authoriseCorpus(corpus, register, pack), register, pack, requirement.sources).sha256;
}

// ---------------------------------------------------------------------------
// The partial case, end to end
// ---------------------------------------------------------------------------

describe('a cited source nothing serves halts the run, whatever the closure holds', () => {
  it('publishes a gap-bearing dossier naming the source, over a real non-empty closure', async () => {
    const capability = capabilityFor(REAL, PARTIAL);
    const outcome = await runRun(
      { packId: PACK_ID, requirementId: PARTIAL }, pathsFor(REAL), capability);

    // A gap is a finding, not a failure.
    expect(outcome.exitCode).toBe(EXIT_OK);

    const destination = resultPath(pathsFor(REAL), PACK_ID, PARTIAL);
    expect(existsSync(destination)).toBe(true);
    const result = readback(destination);

    // The gap names the source, and no document.
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]!.kind).toBe('corpus_gap');
    expect(result.gaps[0]!.sourceId).toBe('SRC-008');
    expect(result.gaps[0]!.docId).toBeUndefined();

    // The closure is genuinely non-empty and is pinned as itself — the point of
    // the whole repair. A gap records what is missing; it must not erase what
    // was actually available. A gap-bearing result with real entitled documents
    // is a valid shape, and no rule may require an empty closure for
    // `corpus_gap`.
    //
    // Named document, not merely a non-zero count: `SRC-001` is still served, so
    // the document it entitles must survive into the pins. A count would be
    // satisfied by any closure at all.
    //
    // The digest half is asserted in its own test below. Kept apart because
    // this line masks it: every mutation that loses the documents also moves
    // the digest, so conjoined they can never show the digest assertion firing
    // on its own (evidence standard, mode 4).
    expect(result.corpus.map((entry) => entry.docId)).toContain('DOC-32013L0034');

    // Schema-valid 1.3.0, and all four judgment containers canonically empty.
    expect(result.resultSchemaVersion).toBe('1.3.0');
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
    await runRun({ packId: PACK_ID, requirementId: PARTIAL }, pathsFor(REAL),
      capabilityFor(REAL, PARTIAL));
    const result = readback(resultPath(pathsFor(REAL), PACK_ID, PARTIAL));

    // Derived through the production constructor, not read back off the
    // artefact under test.
    expect(result.corpusClosureSha256).toBe(closureShaFor(REAL, PARTIAL));
    expect(result.corpusClosureSha256).not.toBe(EMPTY_CLOSURE_SHA256);
  });

  it('runs no agent at all — asserted on its own, so nothing masks it', async () => {
    // The zero-agent property in its own test. Inside the dossier test it sat
    // behind the gap assertions, so a mutation that computed the gap and then
    // continued into the reader reddened on the gap count and never reached
    // this line. Conjuncts mask one another (evidence standard, mode 4).
    const capability = capabilityFor(REAL, PARTIAL);
    await runRun({ packId: PACK_ID, requirementId: PARTIAL }, pathsFor(REAL), capability);

    expect(capability.requests).toHaveLength(0);
    expect(capability.requests.filter((r) => r.role === 'reader')).toHaveLength(0);
    expect(trap.calls).toEqual([]);
  });

  it('positive control: the same capability IS reached when every source is served', async () => {
    // Without this, "zero requests" would be equally green against a pipeline
    // that halts everything — the negative observation needs a positive twin.
    const capability = capabilityFor(REAL, FULLY_SERVED);
    const outcome = await runRun(
      { packId: PACK_ID, requirementId: FULLY_SERVED }, pathsFor(REAL), capability);

    expect(outcome.exitCode).toBe(EXIT_OK);
    const result = readback(resultPath(pathsFor(REAL), PACK_ID, FULLY_SERVED));
    expect(result.gaps).toEqual([]);
    expect(result.reading.elements.length).toBeGreaterThan(0);

    // Reader + every configured prosecutor + adjudicator.
    expect(capability.requests).toHaveLength(2 + DEFAULT_ROLE_CONFIG.prosecutorCount);
    expect(capability.requests.filter((r) => r.role === 'reader')).toHaveLength(1);
    expect(trap.calls).toEqual([]);
  });

  it('names one gap per missing source, and never invents a docId', async () => {
    // CSRD-S-012 cites SRC-005 and SRC-007. Since T6 the corpus serves
    // SRC-005, so exactly one gap remains — the count follows the *unserved*
    // sources, not the cited ones and not the requirement. Before T6 this
    // asserted two; the drop to one is the ingestion's semantic consequence,
    // and the requirement staying in the gap-bearing partition below is why
    // closing one gap is not the same as becoming readable.
    const capability = capabilityFor(REAL, TWO_MISSING);
    const outcome = await runRun(
      { packId: PACK_ID, requirementId: TWO_MISSING }, pathsFor(REAL), capability);

    expect(outcome.exitCode).toBe(EXIT_OK);
    const result = readback(resultPath(pathsFor(REAL), PACK_ID, TWO_MISSING));

    expect(result.gaps).toHaveLength(1);
    // Exact identities.
    //
    // This does **not** discriminate ordering: for this requirement
    // `['SRC-005','SRC-007']` is simultaneously declaration order, sorted order
    // and corpus-index order. The permutation case in `pipeline-reader.test.ts`
    // is what proves order follows the requirement's own declaration — it feeds
    // `['SRC-901','SRC-900']` in and requires the same sequence out.
    expect(result.gaps.map((gap) => gap.sourceId)).toEqual(['SRC-007']);
    for (const gap of result.gaps) {
      expect.soft(gap.kind).toBe('corpus_gap');
      expect.soft(gap.docId).toBeUndefined();
    }
    expect(capability.requests).toHaveLength(0);
    expect(trap.calls).toEqual([]);
  });

  it.each([EMPTY_CLOSURE_GAP, EMPTY_CLOSURE_GAP_TWIN])(
    '%s gaps over a genuinely empty closure, and invents nothing to fill it',
    async (requirementId) => {
      // The other end of the range from `PARTIAL`. Both requirements cite
      // `SRC-002` alone, and in this world nothing serves it, so there is no
      // entitled document at all — the case where a `corpus_gap` and an empty
      // closure genuinely coincide. Asserted because the repair must not have
      // swung the other way: `corpus_gap` may not *require* a non-empty closure.
      //
      // **Run against a purpose-built world since T9.** The real corpus now
      // serves SRC-002, so these two requirements reach the reader there — which
      // the reachability cases below assert. Keeping this case on the real world
      // would have meant asserting something false; moving it preserves the
      // proposition with a subject that still exhibits it.
      //
      // The pair runs together deliberately. They are twins produced by the
      // 2026-08-27 correction, which moved S-004 onto S-003's host, and running
      // only one would leave the other's provenance unexercised on this path.
      const world = REAL_SRC002_UNSERVED;
      const capability = capabilityFor(world, requirementId);
      const outcome = await runRun({ packId: PACK_ID, requirementId }, pathsFor(world), capability);

      expect(outcome.exitCode).toBe(EXIT_OK);
      const result = readback(resultPath(pathsFor(world), PACK_ID, requirementId));

      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]!.kind).toBe('corpus_gap');
      expect(result.gaps[0]!.sourceId).toBe('SRC-002');
      expect(result.gaps[0]!.docId).toBeUndefined();

      expect(result.corpus).toEqual([]);
      expect(result.corpusClosureSha256).toBe(EMPTY_CLOSURE_SHA256);
      expect(capability.requests).toHaveLength(0);
      expect(trap.calls).toEqual([]);
    },
  );
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
    const outcome = await runRun({ packId: PACK_ID, requirementId: PARTIAL },
      pathsFor(REAL), capabilityFor(REAL, PARTIAL));
    expect(outcome.exitCode).toBe(EXIT_OK);
    const result = readback(resultPath(pathsFor(REAL), PACK_ID, PARTIAL));
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]!.sourceId).toBe('SRC-008');
  });

  it('the sign gate refuses a partial-source dossier with unresolved_gap', async () => {
    await runRun({ packId: PACK_ID, requirementId: PARTIAL }, pathsFor(REAL),
      capabilityFor(REAL, PARTIAL));

    const outcome = runSign(
      { packId: PACK_ID, requirementId: PARTIAL, by: 'A. Reviewer',
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
    expect(lines).toContain('SRC-008');

    // Nothing was appended.
    expect(existsSync(join(verificationDir, 'signatures.jsonl'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The real pack's topology, pinned as a regression
// ---------------------------------------------------------------------------

describe('the real CSRD pack, partitioned by what a live run could reach', () => {
  /**
   * Derived from the committed D1a-0b audit, not from the migrated pack.
   *
   * The old partition — six reachable, ten gap-bearing — is gone, and pinning
   * it here would have been the plan's named failure: a test that preserves the
   * pre-audit topology asserts that the migration did not happen. What is
   * pinned instead is the audit's source set per requirement
   * (`reports/2026-08-24-d1a-provenance-audit.md` §11 **as corrected on
   * 2026-08-27**, which re-attributed S-004 from `SRC-004` to `SRC-002`),
   * written out so the expected values have a source independent of
   * `requirements.json`. Comparing the pack against itself would agree with any
   * migration at all.
   *
   * The partition below is then *derived* from those sets and the corpus's
   * actual `serves` — a measurement, not a target.
   */
  const AUDITED_SOURCES = AUDIT_EXPECTED_SOURCES;
  /**
   * The audited sixteen (as corrected since by approved content changes), the
   * seven of the C/G composition and E-2's CSRD-S-024, each cited as its
   * authority says.
   */
  const ALL_SOURCES = EXPECTED_SOURCES;

  it('the migrated pack cites exactly what the audit determined', () => {
    const authored = z
      .array(requirementSchema)
      .parse(JSON.parse(readFileSync(join(REAL, 'knowledge', PACK_ID, 'requirements.json'), 'utf8')));
    // Twenty-four since E-2 (QD-4, DG-7, 2026-10-23) added CSRD-S-024, whose
    // SRC-002 citation is recorded in `POST_AUDIT_ADDITIONS`.
    expect(authored).toHaveLength(24);
    for (const requirement of authored) {
      expect(sourceIdsOf(requirement), requirement.id).toEqual([...ALL_SOURCES[requirement.id]!]);
      // The audit's pack stood at version 3 throughout. CSRD-S-002 has since
      // been re-authored twice (its plain-English scope statement, 2026-10-18,
      // `HANDOFF-2026-10-18-s002-scope-vs-timing.md`; the Article 1(4)
      // exclusion branch, 2026-10-19) and is at 5; CSRD-S-001 gained the same
      // branch and is at 4; the C/G composition (2026-10-20) took CSRD-S-005,
      // CSRD-S-006 and CSRD-S-014 to 4 and authored CSRD-S-017 to CSRD-S-023 at
      // 1; E-1 (QD-4, DG-6, 2026-10-23) took CSRD-S-007 to 4 with its 2028
      // start; E-2 (QD-4, DG-7, 2026-10-23) authored CSRD-S-024 at 1. A new locator on SRC-001 is not a new source, so the audited
      // sixteen's cited sources are unchanged but one: E-1 cites SRC-002 for
      // S-007, recorded in `POST_AUDIT_CORRECTIONS`, not in the audit's table,
      // whose arithmetic below stays the audit's.
      const expectedVersion =
        requirement.id === 'CSRD-S-002' ? 5
        : ['CSRD-S-001', 'CSRD-S-005', 'CSRD-S-006', 'CSRD-S-007', 'CSRD-S-014'].includes(requirement.id) ? 4
        : requirement.id >= 'CSRD-S-017' ? 1
        : 3;
      expect(requirement.version, requirement.id).toBe(expectedVersion);
    }
    // 18 citations across five sources, per the audit's §11 arithmetic as
    // corrected. The total is unchanged by the correction because S-004 was
    // re-attributed rather than stripped; the *universe* is what moved, and
    // `SRC-004` is now cited by nothing — asserted, because a re-attribution
    // that left the old citation standing would keep the total at 18 too.
    const citations = Object.values(AUDITED_SOURCES).reduce((n, ids) => n + ids.length, 0);
    expect(citations).toBe(AUDIT_EXPECTED_CITATION_COUNT);
    const universe = new Set(Object.values(AUDITED_SOURCES).flat());
    expect([...universe].sort()).toEqual([...AUDIT_EXPECTED_UNIVERSE].sort());
    expect(universe.has('SRC-004')).toBe(false);
  });

  /** What the corpus actually serves — read, not assumed. */
  const served = new Set(
    loadCorpus(join(REAL, 'corpus')).index.documents.flatMap((d) => d.serves),
  );
  const partition = (reachable: boolean) =>
    Object.entries(ALL_SOURCES)
      .filter(([, ids]) => ids.every((id) => served.has(id)) === reachable)
      .map(([id]) => id);

  const MODEL_REACHABLE = partition(true);
  const DETERMINISTIC_GAP = partition(false);

  it('the resulting partition is a measurement, and covers the pack', () => {
    // Recorded, not targeted. If ingestion later moves these numbers, that is
    // the corpus becoming more complete — the test states what is true today.
    // **Two, and the movement is T9.** T6 removed one of CSRD-S-012's two gaps
    // without moving it out of this list, because SRC-007 still blocked it —
    // fewer unserved sources is not readability. T9 is the other case: SRC-002
    // was the *only* source CSRD-S-003 and CSRD-S-004 cite, so serving it took
    // both out of the partition entirely and 12/4 became 14/2. The two kinds of
    // movement are why this counts requirements while the cases above count
    // gaps, and why reachability is asserted from an observed request rather
    // than from this list.
    // Twenty-one since the C/G composition: its seven requirements cite SRC-001
    // and SRC-002, both served, so none joins the gap-bearing two. Twenty-two
    // since E-2 (QD-4, DG-7, 2026-10-23): CSRD-S-024 cites SRC-002, served.
    expect(DETERMINISTIC_GAP).toEqual(['CSRD-S-011', 'CSRD-S-012']);
    expect(MODEL_REACHABLE).toHaveLength(22);
    expect([...MODEL_REACHABLE, ...DETERMINISTIC_GAP].sort()).toEqual(
      Object.keys(ALL_SOURCES).sort(),
    );
  });

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
    // The whole role set, so "reachable" means the run completed rather than
    // merely started, and the network trap asserted explicitly rather than
    // relied upon to throw: reachability is proven against a stub, never a
    // provider. T9 brought CSRD-S-003 and CSRD-S-004 into this case.
    expect(capability.requests).toHaveLength(2 + DEFAULT_ROLE_CONFIG.prosecutorCount);
    expect(trap.calls).toEqual([]);
  });

});

// ---------------------------------------------------------------------------
// Severing one source, in a world built for the purpose
// ---------------------------------------------------------------------------

/**
 * The generic invariant: removing one source's *serving* must halt exactly the
 * requirements that cite it, and nothing else.
 *
 * This proves nothing about CSRD topology and is not evidence for any. It is
 * deliberately program-agnostic — see the fixture's own comment above for why
 * the real pack can no longer show this, and why hunting it for a stand-in
 * would have meant preserving a fixture shape the audit legitimately retired.
 */
describe('severing one served source, over a synthetic two-source world', () => {
  it('baseline: both requirements run, so the severed world has something to lose', async () => {
    // Without this, every assertion below would be equally green against a
    // fixture that was broken from the start.
    for (const requirementId of [SYN_ONE, SYN_BOTH]) {
      const capability = capabilityFor(SYN_BASELINE, requirementId, SYN_PACK_ID);
      const outcome = await runRun(
        { packId: SYN_PACK_ID, requirementId }, pathsFor(SYN_BASELINE, SYN_PACK_ID), capability);

      expect(outcome.exitCode, requirementId).toBe(EXIT_OK);
      const result = readback(resultPath(pathsFor(SYN_BASELINE, SYN_PACK_ID), SYN_PACK_ID, requirementId));
      expect(result.gaps, requirementId).toEqual([]);
      expect(capability.requests.filter((r) => r.role === 'reader'), requirementId).toHaveLength(1);
    }
    expect(trap.calls).toEqual([]);
  });

  it('the citing requirement halts with exactly one gap, naming the severed source', async () => {
    const capability = capabilityFor(SYN_SEVERED, SYN_BOTH, SYN_PACK_ID);
    const outcome = await runRun(
      { packId: SYN_PACK_ID, requirementId: SYN_BOTH }, pathsFor(SYN_SEVERED, SYN_PACK_ID), capability);

    expect(outcome.exitCode).toBe(EXIT_OK);
    const result = readback(resultPath(pathsFor(SYN_SEVERED, SYN_PACK_ID), SYN_PACK_ID, SYN_BOTH));

    // Exactly one, and it is the severed source — not merely "a gap appeared".
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]!.kind).toBe('corpus_gap');
    expect(result.gaps[0]!.sourceId).toBe(SOURCE_B);
    expect(result.gaps[0]!.docId).toBeUndefined();
    expect(capability.requests).toHaveLength(0);
    expect(trap.calls).toEqual([]);
  });

  it('and still holds the surviving source’s document, over a non-empty closure', async () => {
    // The half that distinguishes this repair from a rule that empties the
    // closure whenever anything is missing. Separated from the gap assertions
    // so it can be observed failing alone (evidence standard, mode 4).
    await runRun({ packId: SYN_PACK_ID, requirementId: SYN_BOTH },
      pathsFor(SYN_SEVERED, SYN_PACK_ID), capabilityFor(SYN_SEVERED, SYN_BOTH, SYN_PACK_ID));
    const result = readback(resultPath(pathsFor(SYN_SEVERED, SYN_PACK_ID), SYN_PACK_ID, SYN_BOTH));

    expect(result.corpus.map((entry) => entry.docId)).toEqual(['DOC-P']);
    expect(result.corpusClosureSha256).toBe(closureShaFor(SYN_SEVERED, SYN_BOTH, SYN_PACK_ID));
    expect(result.corpusClosureSha256).not.toBe(EMPTY_CLOSURE_SHA256);
  });

  it('positive control, in the same severed world: the untouched requirement still runs', async () => {
    // **In the severed world, not the baseline.** A control drawn from the
    // baseline would leave an implementation that refuses everything once any
    // source is unserved entirely green — which is the failure this whole
    // fixture exists to exclude.
    const capability = capabilityFor(SYN_SEVERED, SYN_ONE, SYN_PACK_ID);
    const outcome = await runRun(
      { packId: SYN_PACK_ID, requirementId: SYN_ONE }, pathsFor(SYN_SEVERED, SYN_PACK_ID), capability);

    expect(outcome.exitCode).toBe(EXIT_OK);
    const result = readback(resultPath(pathsFor(SYN_SEVERED, SYN_PACK_ID), SYN_PACK_ID, SYN_ONE));
    expect(result.gaps).toEqual([]);
    expect(result.reading.elements.length).toBeGreaterThan(0);
    expect(capability.requests.filter((r) => r.role === 'reader')).toHaveLength(1);
    expect(trap.calls).toEqual([]);
  });
});
