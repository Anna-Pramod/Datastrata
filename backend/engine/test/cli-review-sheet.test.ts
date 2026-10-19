/**
 * The review sheet — tests.
 *
 * Factory §4.6: *the reviewer never opens JSON*. So the sheet is the surface a
 * human uses to decide whether to sign, and **what it fails to say is as
 * important as what it says**. That shapes every test here, in two ways.
 *
 * **Absence is asserted, not assumed.** A requirement with no signature, no
 * result file or no golden profile must carry a stated "none". An omitted
 * section reads as a section that passed, which is the same discipline
 * `absence` evidence follows: a claim has to be visible to be checkable.
 *
 * **Every "the sheet says X" assertion is paired with a requirement that must
 * *not* say X.** A sheet is unusually prone to the failure Task 3 found: a test
 * asserting "the output contains X" passes against an implementation that emits
 * X for every requirement regardless of state. The fixture ledger below is
 * built so that each claim has a counterexample in the same document —
 * `CSRD-S-001` is signed and fresh, `CSRD-S-002` is signed and stale in two
 * ways, `CSRD-S-003` is revoked, `CSRD-S-004` is signed against an unpromoted
 * pipeline, and the remaining twelve are unsigned.
 *
 * **The teeth check lives here.** `CSRD-S-002` carries *two* staleness reasons
 * and the sheet must show both. An implementation printing `reasons[0]` passes
 * a one-reason test and fails this one — and "shows why" collapsing to "shows
 * one why" is exactly how a reviewer forms a wrong picture while every test
 * stays green.
 *
 * The fixtures use the **real** pack, corpus and golden-profile suite, because
 * what is under test is a generator whose job is reading the world. Only the
 * ledger, the promotion ledger, the results and the generated HTML live in a
 * temp directory, so no test can leave a signature or an artifact behind.
 */

import { evidenceSetsOf } from '../src/verification/evidence-sets';
import { quotesOf, resolveEvidenceUse } from '../src/verification/evidence-use';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeClosure, docsForSources } from '../src/corpus/closure';
import { loadCorpus, type LoadedCorpus } from '../src/corpus/store';
import { loadPack } from '../src/knowledge/loader';
import type { KnowledgePack, Requirement } from '../src/types';
import { requirementInputSha256, requirementSha256 } from '../src/verification/canonical';
import { entryId, type RevocationEntry, type SigningEntry } from '../src/verification/ledger';
import {
  RENDERER_VERSION,
  renderCondition,
  renderRequirement,
  type RenderContext,
} from '../src/verification/render';
import type { EvidenceItem } from '../src/corpus/evidence';
import { resultSha256, type VerificationResult } from '../src/verification/result';
import {
  candidateConditionSha256,
  candidateRenderedConditionSha256,
} from '../src/verification/sign';
import { EXIT_FORENSICS_REQUIRED, EXIT_OK, EXIT_USAGE } from '../src/cli/exit-codes';
import type { VerifyPaths } from '../src/cli/sign';
import {
  gatherSheet,
  goldenProfilesByRequirement,
  renderSheet,
  runSheet,
  type SheetPaths,
} from '../src/cli/review-sheet';
import { dispatch } from '../src/cli/verify';
import { pinnedStandingFor, standingMapFor } from '../src/corpus/standing';
import { csrdPack } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = join(here, '..');
const PACK_DIR = join(engineRoot, 'knowledge', 'csrd');
const CORPUS_DIR = join(engineRoot, 'corpus');
const GOLDEN_PROFILES = join(engineRoot, 'test', 'golden-profiles.test.ts');
const REGISTRY_DIR = join(engineRoot, 'verification', 'requirement-versions');

const PACK_ID = 'csrd';
const PIPELINE = 'pipeline-1.0.0';
const UNPROMOTED = 'pipeline-9.9.9';

const FRESH = 'CSRD-S-001';
const STALE = 'CSRD-S-002';
const REVOKED = 'CSRD-S-003';
const UNPROMOTED_REQ = 'CSRD-S-004';
/** One of the twenty-three that no golden profile mentions. Verified against the suite. */
const NO_GOLDEN = 'CSRD-S-006';
/** The one `selection` requirement: no top-level condition at all. */
const SELECTION = 'CSRD-S-012';
/** Fires nine obligation templates; `CSRD-S-001` fires none. Verified against the pack. */
const OBLIGED = 'CSRD-S-014';

const DOC_A = 'DOC-32013L0034';
const DOC_B = 'DOC-32026L0470';
// Sentences the two documents carry exactly once, each inside a declared
// operative range, so the fixture's signing entries can record where their
// support lies (B-EVID-SPAN) and read fresh rather than `stale_ranges`.
const QUOTE_A = 'The information referred to in the first subparagraph shall be clearly identifiable within the consolidated management report';
const QUOTE_B = 'For the purposes of the third, fourth and fifth subparagraphs, the following definitions apply';

/**
 * The adjudicators' quotes, and the point of them is that they appear **in no
 * other field of this fixture**.
 *
 * `QUOTE_A` and `QUOTE_B` each reach the page through a reading element and
 * through a prosecutor's `evidence` as well, and C1 and C2 use them inverted.
 * So a sheet that rendered `adjudicationEvidence` nowhere at all would still
 * show every one of those strings, and an assertion over them would be green
 * against a page missing half the record's evidence — failure mode 5, a
 * positive claim satisfied by something other than the thing it names.
 *
 * These two strings are reachable only through `challenges[].adjudicationEvidence`.
 * Their presence on the page is therefore evidence that *that array* was
 * rendered, and `adjudicationQuotesAreUniqueToTheirArray` below fails if a
 * later edit ever reuses one elsewhere and quietly destroys that premise.
 */
const ADJUDICATION_ONLY_C1 = 'For the purposes of this Directive, the following definitions shall apply:';
const ADJUDICATION_ONLY_C2 = 'Protected undertakings have the right to decline to provide information exceeding the information specified in the voluntary standards';

/** The exact sentence factory §4.6 obliges until B3 exists. */
const NO_METRICS = 'no benchmark metrics — pipeline promotion records carry none until B3';

let pack: KnowledgePack;
let corpus: LoadedCorpus;
let renderCtx: RenderContext;

let dir = '';
let verificationDir = '';
let outPath = '';
let paths: SheetPaths;

function requirementOf(id: string): Requirement {
  const found = pack.requirements.find((r) => r.id === id);
  if (found === undefined) throw new Error(`fixture requires ${id}`);
  return found;
}

/** The closure of a requirement's sources, as the corpus holds it now. */
function closureOf(id: string): { sha256: string; pins: SigningEntry['corpus'] } {
  const requirement = requirementOf(id);
  const closure = computeClosure(corpus.index, docsForSources(corpus.index, requirement.sources), standingMapFor(corpus.index, csrdPack()));
  return {
    sha256: closure.sha256,
    pins: closure.docIds.map((docId) => {
      const d = corpus.document(docId);
      return {
        docId,
        versionLabel: d.versionLabel,
        sha256Raw: d.sha256Raw,
        sha256Normalized: d.sha256Normalized,
        normalizerVersion: d.normalizerVersion,
        artefactAuthenticity: d.artefactAuthenticity,
        nonOperativeSections: [...d.nonOperativeSections],
        sources: pinnedStandingFor(standingMapFor(corpus.index, csrdPack()), docId),
      };
    }),
  };
}

/** Recomputes `entryId` over the entry's own contents, as the ledger requires. */
function sealed<T extends { entryId?: string }>(entry: T): T & { entryId: string } {
  const unsigned = { ...(entry as Record<string, unknown>) };
  delete unsigned['entryId'];
  return {
    ...(unsigned as T),
    entryId: entryId(unsigned as never),
  };
}

/** A valid, self-consistent result that agrees with the pack and the corpus. */
function makeResult(id: string, overrides: Record<string, unknown> = {}): VerificationResult {
  const requirement = requirementOf(id);
  const { sha256, pins } = closureOf(id);
  const a = corpus.document(DOC_A);
  const b = corpus.document(DOC_B);
  return {
    packId: PACK_ID,
    requirementId: id,
    requirementVersion: requirement.version,
    resultSchemaVersion: '1.3.0',
    pipelineVersion: PIPELINE,
    rendererVersion: RENDERER_VERSION,
    closureRendererVersion: 'closure-renderer-1.0.0',
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderCtx),
    corpusClosureSha256: sha256,
    corpus: pins,
    reading: {
      elements: [
        {
          id: 'R1',
          statement: 'The Directive governs annual and consolidated reporting.',
          evidence: [
            { kind: 'quote', docId: DOC_A, sha256Normalized: a.sha256Normalized, text: QUOTE_A },
          ],
        },
        {
          id: 'R2',
          statement: 'A criterion the encoding never mapped.',
          evidence: [
            { kind: 'quote', docId: DOC_B, sha256Normalized: b.sha256Normalized, text: QUOTE_B },
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
        {
          direction: 'condition_to_reading',
          readingElementId: 'R2',
          conditionPath: 'all[0]',
          verdict: 'UNMAPPED',
          challengeId: 'C2',
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
        // E-A: a different document and different words from the E-P above,
        // and a text that occurs nowhere else in this fixture.
        adjudicationEvidence: [
          {
            kind: 'quote',
            docId: DOC_A,
            sha256Normalized: a.sha256Normalized,
            text: ADJUDICATION_ONLY_C1,
          },
        ],
      },
      {
        id: 'C2',
        lens: 'coverage',
        statement: 'Is the second criterion encoded anywhere?',
        verdict: 'OPEN_QUESTION',
        evidence: [
          { kind: 'quote', docId: DOC_A, sha256Normalized: a.sha256Normalized, text: QUOTE_A },
        ],
        // An OPEN_QUESTION is evidence-bound too, and its evidence is not the
        // prosecutor's: it is what establishes the record cannot settle this.
        // This is the case the sheet was blindest to — no `resolution` for the
        // challenges table to print either, so before the fix an OPEN_QUESTION
        // reached the reviewer with no visible basis whatsoever.
        adjudicationEvidence: [
          {
            kind: 'quote',
            docId: DOC_B,
            sha256Normalized: b.sha256Normalized,
            text: ADJUDICATION_ONLY_C2,
          },
        ],
      },
    ],
    openQuestions: [{ id: 'Q1', statement: 'Which balance-sheet dates fix the measurement period?' }],
    gaps: [],
    ...overrides,
  } as VerificationResult;
}

/** A complete signing entry for `id`, pinned to the world as it stands now. */
function makeEntry(id: string, overrides: Record<string, unknown> = {}): SigningEntry {
  const requirement = requirementOf(id);
  const { sha256, pins } = closureOf(id);
  return sealed({
    kind: 'verified',
    packId: PACK_ID,
    packVersion: pack.version,
    requirementId: id,
    requirementVersion: requirement.version,
    requirementSha256: requirementSha256(requirement),
    requirementInputSha256: requirementInputSha256(requirement),
    conditionSha256: candidateConditionSha256(requirement),
    renderedConditionSha256: candidateRenderedConditionSha256(requirement, renderCtx),
    rendererVersion: RENDERER_VERSION,
    closureRendererVersion: 'closure-renderer-1.0.0',
    corpusClosureSha256: sha256,
    corpus: pins,
    resultSha256: resultSha256(makeResult(id)),
    pipelineVersion: PIPELINE,
    by: 'A. Reviewer',
    on: '2026-08-21',
    // Every set of the fixture result designated support and resolved over the
    // real declarations — the record a signature would actually carry.
    evidenceUse: resolveEvidenceUse({
      result: makeResult(id),
      designation: { resultSha256: resultSha256(makeResult(id)), sets: evidenceSetsOf(makeResult(id)).map((set) => ({ set: set.recordPath, use: 'support' as const, items: quotesOf(set.items).map((q) => ({ item: q.path, use: 'support' as const })) })) },
      corpus,
    }).records,
    ...overrides,
  } as unknown as SigningEntry);
}

function makeRevocation(id: string, revokes: string): RevocationEntry {
  return sealed({
    kind: 'revoked',
    packId: PACK_ID,
    requirementId: id,
    revokes,
    by: 'R. Withdrawer',
    on: '2026-08-21',
    reason: 'The provision citation points at the wrong article.',
  } as unknown as RevocationEntry);
}

function writeResult(id: string, result: unknown): void {
  mkdirSync(join(verificationDir, PACK_ID, id), { recursive: true });
  writeFileSync(
    join(verificationDir, PACK_ID, id, 'verification-result.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );
}

function writeLedger(entries: unknown[]): void {
  writeFileSync(
    join(verificationDir, 'signatures.jsonl'),
    entries.map((e) => `${JSON.stringify(e)}\n`).join(''),
    'utf8',
  );
}

/** The HTML of exactly one requirement's section, so an assertion cannot drift into another's. */
function sectionFor(html: string, requirementId: string): string {
  const marker = `<section class="requirement" data-requirement="${requirementId}"`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`the sheet carries no section for ${requirementId}`);
  const end = html.indexOf('</section>', start);
  if (end === -1) throw new Error(`the section for ${requirementId} is unterminated`);
  return html.slice(start, end);
}

function sheetHtml(): string {
  return renderSheet(gatherSheet(PACK_ID, paths));
}

beforeEach(() => {
  pack = loadPack(PACK_DIR);
  corpus = loadCorpus(CORPUS_DIR);
  renderCtx = { factTypes: pack.factTypes, catalogues: pack.catalogues };

  dir = mkdtempSync(join(tmpdir(), 'review-sheet-'));
  // The output lives outside `verification/`, exactly as the generator requires.
  verificationDir = join(dir, 'verification');
  outPath = join(dir, 'out', 'review-sheet.html');
  mkdirSync(join(verificationDir, 'requirement-versions'), { recursive: true });
  cpSync(
    join(REGISTRY_DIR, `${PACK_ID}.json`),
    join(verificationDir, 'requirement-versions', `${PACK_ID}.json`),
  );

  // CSRD-S-001: signed, fresh, promoted pipeline, with a result on disk.
  const fresh = makeEntry(FRESH);
  writeResult(FRESH, makeResult(FRESH));

  // CSRD-S-002: signed, and stale in exactly two ways — the encoding moved and
  // the entitled closure moved. Deliberately two, and deliberately not three:
  // `resultSha256` still agrees with the result on disk, so `stale_result` does
  // not join them and the count under test is exact.
  const stale = makeEntry(STALE, {
    requirementInputSha256: 'a'.repeat(64),
    corpusClosureSha256: 'b'.repeat(64),
  });
  writeResult(STALE, makeResult(STALE));

  // CSRD-S-003: signed, then withdrawn.
  const signedThenRevoked = makeEntry(REVOKED);
  const revocation = makeRevocation(REVOKED, signedThenRevoked.entryId);
  writeResult(REVOKED, makeResult(REVOKED));

  // CSRD-S-004: signed against a pipeline nobody ever promoted.
  const unpromoted = makeEntry(UNPROMOTED_REQ, {
    pipelineVersion: UNPROMOTED,
    resultSha256: resultSha256(makeResult(UNPROMOTED_REQ, { pipelineVersion: UNPROMOTED })),
  });
  writeResult(UNPROMOTED_REQ, makeResult(UNPROMOTED_REQ, { pipelineVersion: UNPROMOTED }));

  writeLedger([fresh, stale, signedThenRevoked, revocation, unpromoted]);
  writeFileSync(
    join(verificationDir, 'promotions.jsonl'),
    `${JSON.stringify({ pipelineVersion: PIPELINE, by: 'A. Promoter', on: '2026-08-01' })}\n`,
    'utf8',
  );

  paths = {
    packDir: PACK_DIR,
    corpusDir: CORPUS_DIR,
    verificationDir,
    goldenProfilesPath: GOLDEN_PROFILES,
    outPath,
  };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The portfolio header
// ---------------------------------------------------------------------------

describe('portfolio header', () => {
  it('counts by derived status, and the counts move with the ledger', () => {
    const html = sheetHtml();
    // 23 requirements (sixteen, plus the seven of the C/G composition of
    // 2026-10-20): S-001 verified; S-002 blocked back to draft; S-003 revoked,
    // so draft; S-004 verified; the remaining nineteen unsigned.
    expect(html).toContain('<tr><td>verified</td><td>2</td></tr>');
    expect(html).toContain('<tr><td>draft</td><td>21</td></tr>');
    expect(html).toContain('<tr><td>ratified</td><td>0</td></tr>');

    // The same generator over an empty ledger must not print the same numbers.
    writeLedger([]);
    const empty = renderSheet(gatherSheet(PACK_ID, paths));
    expect(empty).toContain('<tr><td>draft</td><td>23</td></tr>');
    expect(empty).toContain('<tr><td>verified</td><td>0</td></tr>');
  });

  it('counts by staleness reason, naming every reason including the ones at zero', () => {
    const html = sheetHtml();
    expect(html).toContain('<tr><td>stale_encoding</td><td>1</td></tr>');
    expect(html).toContain('<tr><td>stale_closure</td><td>1</td></tr>');
    expect(html).toContain('<tr><td>stale_source_text</td><td>0</td></tr>');
    expect(html).toContain('<tr><td>normalizer_changed</td><td>0</td></tr>');
    expect(html).toContain('<tr><td>source_reissued</td><td>0</td></tr>');
    expect(html).toContain('<tr><td>stale_render</td><td>0</td></tr>');
    expect(html).toContain('<tr><td>stale_result</td><td>0</td></tr>');
  });

  it('counts the unsigned and the revoked, which the status table folds into draft', () => {
    const html = sheetHtml();
    expect(html).toContain('19 of 23 requirements carry no signature at all');
    expect(html).toContain('1 requirement has been revoked');

    writeLedger([]);
    const empty = renderSheet(gatherSheet(PACK_ID, paths));
    expect(empty).toContain('23 of 23 requirements carry no signature at all');
    expect(empty).toContain('0 requirements have been revoked');
  });

  it('labels the live benchmark run as governing nothing until promoted', () => {
    const html = sheetHtml();
    expect(html).toContain('governing nothing until promoted');
    expect(html).toContain(NO_METRICS);
  });
});

// ---------------------------------------------------------------------------
// Status, staleness, and the signature
// ---------------------------------------------------------------------------

describe('derived status and its reasons', () => {
  it('renders draft with an explicit no-signature note when no entry governs', () => {
    const section = sectionFor(sheetHtml(), NO_GOLDEN);
    expect(section).toContain('Derived status: <strong>draft</strong>');
    expect(section).toContain('none — no signature; nobody has stood behind this requirement');
  });

  it('does not carry the no-signature note on a requirement that is signed', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('Derived status: <strong>verified</strong>');
    expect(section).not.toContain('none — no signature');
    expect(section).toContain('A. Reviewer');
  });

  it('shows a revoked requirement as revoked, with who withdrew it and why', () => {
    const section = sectionFor(sheetHtml(), REVOKED);
    expect(section).toContain('Derived status: <strong>draft</strong>');
    expect(section).toContain('revoked');
    expect(section).toContain('R. Withdrawer');
    expect(section).toContain('The provision citation points at the wrong article.');
    // and a requirement that was never revoked must not say so
    expect(sectionFor(sheetHtml(), FRESH)).not.toContain('R. Withdrawer');
  });

  /**
   * THE TEETH CHECK. Two reasons, and both must appear.
   *
   * An implementation printing `reasons[0]` passes a one-reason test and fails
   * here. The fixture is built so the set is exactly two — `stale_result` is
   * kept out by pinning the entry to the result actually on disk — so this
   * cannot pass by accident on a longer list.
   */
  it('shows every staleness reason, not the first one', () => {
    const section = sectionFor(sheetHtml(), STALE);
    expect(section).toContain('Derived status: <strong>draft</strong>');
    expect(section).toContain('stale_closure');
    expect(section).toContain('stale_encoding');
    expect(section).toContain(
      '<span class="k">Reasons:</span> stale_closure, stale_encoding',
    );
  });

  /**
   * `normalizer_changed` resolved before display — requirement 6, and the
   * surface where Task 4's narrowing actually pays off.
   *
   * The entry pins an older `normalizerVersion` but the *same* normalized hash,
   * so `deriveStaleness` raises the reason on the version difference alone and
   * the resolution has to renormalise the retained raw bytes to withdraw it.
   * Without the resolution, one normalizer bump paints every requirement in the
   * pack with a blocking reason on a day when no law moved.
   */
  it('resolves normalizer_changed against the retained raw bytes before showing it', () => {
    const { pins } = closureOf(FRESH);
    const entry = makeEntry(FRESH, {
      corpus: pins.map((pin) => ({ ...pin, normalizerVersion: 'normalizer-0.0.1-old' })),
    });
    writeLedger([entry]);

    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).not.toContain('normalizer_changed');
    expect(section).toContain('Derived status: <strong>verified</strong>');
  });

  it('keeps normalizer_changed when renormalising does not reproduce the pinned text', () => {
    const { pins } = closureOf(FRESH);
    const entry = makeEntry(FRESH, {
      corpus: pins.map((pin) => ({
        ...pin,
        normalizerVersion: 'normalizer-0.0.1-old',
        sha256Normalized: 'c'.repeat(64),
      })),
    });
    writeLedger([entry]);

    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('normalizer_changed');
    expect(section).toContain('Derived status: <strong>draft</strong>');
  });

  it('says "none" rather than omitting the line when a fresh signature has no reasons', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('<span class="k">Reasons:</span> <span class="none">none</span>');
    expect(section).not.toContain('stale_encoding');
  });
});

// ---------------------------------------------------------------------------
// The rendered English — the same text the signature pins
// ---------------------------------------------------------------------------

describe('the rendered condition', () => {
  it('is renderRequirement()\'s output verbatim, which is what the signature hashes', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    const expected = renderRequirement(requirementOf(FRESH), renderCtx);
    expect(section).toContain(escapeForTest(expected));
  });

  it('agrees with candidateRenderedConditionSha256, shown by printing the hash', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain(candidateRenderedConditionSha256(requirementOf(FRESH), renderCtx));
  });

  /**
   * The distinction that makes the choice load-bearing. `renderCondition` and
   * `renderRequirement` produce different text from the same input, so a sheet
   * that reached for the former would show the reviewer text no signature pins.
   */
  it('is not renderCondition()\'s output, which differs from the same input', () => {
    const requirement = requirementOf(FRESH);
    const condition = requirement.condition;
    if (condition === undefined) throw new Error(`fixture requires ${FRESH} to carry a condition`);
    const whole = renderRequirement(requirement, renderCtx);
    const subtree = renderCondition(condition, renderCtx);
    expect(whole).not.toBe(subtree);
  });

  it('renders the selection requirement, which renderCondition cannot be called on at all', () => {
    const requirement = requirementOf(SELECTION);
    expect(requirement.condition).toBeUndefined();
    const section = sectionFor(sheetHtml(), SELECTION);
    expect(section).toContain(escapeForTest(renderRequirement(requirement, renderCtx)));
    expect(section).toContain(candidateRenderedConditionSha256(requirement, renderCtx));
  });
});

// ---------------------------------------------------------------------------
// What the result carries — and what a missing result must still say
// ---------------------------------------------------------------------------

describe('the dossier sections', () => {
  it('renders both directions of the coverage table from the result', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('reading_to_condition');
    expect(section).toContain('condition_to_reading');
    expect(section).toContain('MAPPED');
    expect(section).toContain('UNMAPPED');
    expect(section).toContain('all[0]');
  });

  it('renders challenges with their adjudicated verdicts and resolutions', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('CONFIRMED');
    expect(section).toContain('The threshold is as encoded.');
    expect(section).toContain('OPEN_QUESTION');
    expect(section).toContain('not adjudicated');
  });

  it('links evidence into the corpus by docId, title and url', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    const document = corpus.document(DOC_A);
    expect(section).toContain(DOC_A);
    expect(section).toContain(escapeForTest(document.title));
    expect(section).toContain(document.url);
  });

  /**
   * **Evidence completeness: every item the record carries reaches the page.**
   *
   * The expectation is *derived from the result itself* rather than written out
   * beside it. A hand-listed set of expected quotes is built from the same
   * mental model as the renderer and agrees with its omissions — which is
   * exactly how `challenges[].adjudicationEvidence` came to be absent from this
   * sheet while every existing assertion stayed green. Walking the record and
   * demanding each item appear makes the obligation grow on its own the next
   * time the record gains an evidence-bearing field.
   */
  const everyEvidenceItemIn = (
    result: VerificationResult,
  ): Array<{ path: string; text: string }> => {
    const out: Array<{ path: string; text: string }> = [];
    const push = (path: string, items: readonly EvidenceItem[]): void => {
      items.forEach((item, i) => {
        // A `switch` over `kind` rather than a chain of `if`s, and with the
        // `never` assignment in `default` that makes the exhaustiveness real.
        //
        // The switch alone is not enough here and the distinction matters. This
        // callback returns `void` with nothing after the switch, so TypeScript
        // has no missing-return to complain about: a fifth `EvidenceItem` kind
        // would fall through `default` in silence, and this walker — the guard
        // built precisely to detect an evidence consumer that skipped
        // something — would under-count while reporting success. Assigning
        // `item` to `never` is what turns "I handled the four I know about"
        // into "I handled all of them", and it fails **here**, in the guard,
        // rather than relying on an unrelated production file failing first.
        //
        // `describeEvidence` renders the quoted words, or the searched-for term
        // for an `absence` claim; both are the string a reviewer reads.
        switch (item.kind) {
          case 'quote':
            out.push({ path: `${path}[${i}]`, text: item.text });
            break;
          case 'amendment_chain':
            item.hops.forEach((hop, h) =>
              out.push({ path: `${path}[${i}].hops[${h}]`, text: hop.quote.text }),
            );
            break;
          case 'cross_reference':
            out.push({ path: `${path}[${i}].from`, text: item.from.text });
            out.push({ path: `${path}[${i}].to`, text: item.to.text });
            break;
          case 'absence':
            out.push({ path: `${path}[${i}]`, text: item.term });
            break;
          default: {
            // Unreachable at runtime, load-bearing at compile time: an evidence
            // kind added without a case here makes this assignment fail `tsc`.
            const unhandled: never = item;
            throw new Error(
              `the evidence walker does not handle kind ${JSON.stringify(
                (unhandled as { kind: string }).kind,
              )}; the completeness assertion would silently under-count it`,
            );
          }
        }
      });
    };
    result.reading.elements.forEach((element) =>
      push(`reading.elements[${element.id}].evidence`, element.evidence),
    );
    result.challenges.forEach((challenge) => {
      push(`challenges[${challenge.id}].evidence`, challenge.evidence);
      push(`challenges[${challenge.id}].adjudicationEvidence`, challenge.adjudicationEvidence);
    });
    return out;
  };

  it('renders every evidence item the record carries, both arrays of every challenge', () => {
    const result = makeResult(FRESH);
    const section = sectionFor(sheetHtml(), FRESH);
    const items = everyEvidenceItemIn(result);

    // The premise, asserted rather than assumed: the walk found the second
    // array. Without this the loop below would pass vacuously against a walk
    // that never looked at `adjudicationEvidence` — failure mode 7, a claim
    // green because the path never executed.
    expect(items.filter((i) => i.path.includes('adjudicationEvidence'))).toHaveLength(2);
    expect(items.length).toBe(6);

    for (const { path, text } of items) {
      expect(section, `${path} is missing from the rendered sheet`).toContain(escapeForTest(text));
    }
  });

  it('keeps the adjudication quotes unique to their array, so the check above can fail', () => {
    // The positive control for the two markers. If a later edit reuses either
    // string in a reading element or a prosecutor's `evidence`, the assertion
    // above would still pass with `adjudicationEvidence` unrendered, and this
    // is what says so instead of letting it rot silently.
    const result = makeResult(FRESH);
    const elsewhere = [
      ...result.reading.elements.flatMap((e) => e.evidence),
      ...result.challenges.flatMap((c) => c.evidence),
    ].map((item) => (item.kind === 'quote' ? item.text : ''));

    for (const marker of [ADJUDICATION_ONLY_C1, ADJUDICATION_ONLY_C2]) {
      expect(elsewhere).not.toContain(marker);
    }
    expect(result.challenges[0]?.adjudicationEvidence[0]).toMatchObject({
      text: ADJUDICATION_ONLY_C1,
    });
    expect(result.challenges[1]?.adjudicationEvidence[0]).toMatchObject({
      text: ADJUDICATION_ONLY_C2,
    });
  });

  it('shows an OPEN_QUESTION the basis of its own verdict, not only that it has none', () => {
    // The case the omission hurt most. The challenges table prints "not
    // adjudicated" in the Resolution column, which is true and, alone, reads as
    // "the adjudicator had nothing". It did not — this array is what
    // establishes the record cannot settle the challenge, and that is the
    // finding a reviewer is here to weigh.
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('not adjudicated');
    expect(section).toContain(escapeForTest(ADJUDICATION_ONLY_C2));
    expect(section).toContain('cannot settle the challenge');
  });

  it('labels the two evidence arrays of a challenge apart', () => {
    // Two producers under one challenge id. Merged under one heading a reviewer
    // could not say which role stood behind any quote.
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('challenge C1 — why it was raised');
    expect(section).toContain('challenge C1 — why it was decided (CONFIRMED)');
    expect(section).toContain('challenge C2 — why it was decided (OPEN_QUESTION)');
    // The adjudication heading carries the resolution, so the sentence and the
    // evidence behind it sit together rather than in two distant sections.
    expect(section).toContain('The threshold is as encoded.');
  });

  it('renders each array of a challenge under its own label, not merely both somewhere', () => {
    // The assertion above is satisfied by a sheet that prints both labels and
    // then puts the prosecutor's quotes under the adjudication heading — the
    // labels would still both be present, and both quotes would still be on the
    // page. Since one enumeration now feeds every consumer, that is exactly the
    // mistake a crossed accessor would make and nothing else here would catch:
    // failure mode 5, a positive claim satisfied unconditionally.
    //
    // So each block is read from its own heading up to the next one, and the
    // quote that belongs to it has to be inside.
    const section = sectionFor(sheetHtml(), FRESH);
    const blockUnder = (label: string): string => {
      const start = section.indexOf(escapeForTest(label));
      if (start === -1) throw new Error(`the sheet carries no evidence set labelled ${label}`);
      const next = section.indexOf('<p class="evidence-set">', start + 1);
      return next === -1 ? section.slice(start) : section.slice(start, next);
    };

    const raised = blockUnder('challenge C1 — why it was raised');
    const decided = blockUnder('challenge C1 — why it was decided (CONFIRMED)');

    expect(decided).toContain(escapeForTest(ADJUDICATION_ONLY_C1));
    expect(raised).not.toContain(escapeForTest(ADJUDICATION_ONLY_C1));
    // The prosecutor's own quote, in the block that raised the challenge and
    // not in the one that decided it: without this half, a sheet that rendered
    // the adjudication twice would pass.
    expect(raised).toContain(escapeForTest(QUOTE_B));
    expect(decided).not.toContain(escapeForTest(QUOTE_B));
  });

  it('renders every text-bearing shape of adjudicationEvidence, not only a bare quote', () => {
    // `FIELD_ROLES` classifies five paths under this array as `display`:
    // `.text`, `.hops[].quote.text`, `.from.text`, `.to.text` and `.term`. A
    // role is a claim that something exercises that authority, so each one has
    // to be a page a human can actually read — otherwise the table describes a
    // rendering nobody performs, which is the class of error §6 exists to
    // close. The default fixture carries bare quotes only, so the composite
    // shapes and the absence term would go unrendered and unnoticed.
    const a = corpus.document(DOC_A);
    const b = corpus.document(DOC_B);
    const q = (text: string) => ({
      kind: 'quote' as const,
      docId: DOC_A,
      sha256Normalized: a.sha256Normalized,
      text,
    });
    const texts = {
      hop: 'the hop quote inside an amendment chain',
      from: 'the near end of a cross reference',
      to: 'the far end of a cross reference',
      term: 'a term searched for and not found',
    };
    const base = makeResult(FRESH);
    writeResult(FRESH, {
      ...base,
      challenges: [
        {
          ...base.challenges[0],
          adjudicationEvidence: [
            { kind: 'amendment_chain', hops: [{ edgeId: 'E-CHAIN', quote: q(texts.hop) }] },
            {
              kind: 'cross_reference',
              edgeId: 'E-XREF',
              from: q(texts.from),
              to: { ...q(texts.to), docId: DOC_B, sha256Normalized: b.sha256Normalized },
            },
            { kind: 'absence', docIds: [DOC_A], term: texts.term },
          ],
        },
        base.challenges[1],
      ],
    });

    const section = sectionFor(sheetHtml(), FRESH);
    for (const [path, text] of Object.entries(texts)) {
      expect(section, `adjudicationEvidence ${path} text is not on the page`).toContain(
        escapeForTest(text),
      );
    }
  });

  it('names the entitled evidence surface, and warns when it is empty', () => {
    const html = sheetHtml();
    // CSRD-S-001's sources resolve to two corpus documents.
    expect(sectionFor(html, FRESH)).toContain(DOC_A);
    expect(sectionFor(html, FRESH)).not.toContain('the corpus holds no document serving any of them');
    // **CSRD-S-012's surface is no longer empty, and the sheet must say so.**
    // T6 ingested the ESRS consolidation for SRC-005, so the requirement now
    // names a real document while still halting on the unserved SRC-007, and
    // the empty-surface warning would be false here.
    const selection = sectionFor(html, SELECTION);
    expect(selection).toContain('DOC-32023R2772');
    expect(selection).not.toContain('the corpus holds no document serving any of them');

    // **The warning still has to be provably reachable, and now needs a world
    // built for it.** CSRD-S-012 was this suite's only positive witness until
    // T6 served SRC-005; CSRD-S-003 took over until T9 served SRC-002. No
    // requirement in the real corpus opens onto an empty evidence surface any
    // more, so every assertion available here is a negative — which an
    // implementation that never emitted the warning at all would satisfy just
    // as well. The positive witness therefore moves to a corpus copy with
    // SRC-002 unserved: the state this sheet exists to describe, preserved
    // rather than dropped when the real corpus outgrew it.
    const scratch = mkdtempSync(join(tmpdir(), 'sheet-unserved-'));
    try {
      cpSync(CORPUS_DIR, join(scratch, 'corpus'), { recursive: true });
      const indexPath = join(scratch, 'corpus', 'index.json');
      const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
        documents: { serves: string[] }[];
      };
      for (const document of index.documents) {
        document.serves = document.serves.filter((sourceId) => sourceId !== 'SRC-002');
      }
      writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

      const unserved = renderSheet(
        gatherSheet(PACK_ID, { ...paths, corpusDir: join(scratch, 'corpus') }),
      );
      const revoked = sectionFor(unserved, REVOKED);
      expect(revoked).toContain('the corpus holds no document serving any of them');
      expect(revoked).toContain('Nobody could have read the law behind this rule');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('renders open questions', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('Which balance-sheet dates fix the measurement period?');
  });

  it('states the absence of a result rather than omitting its sections', () => {
    const section = sectionFor(sheetHtml(), NO_GOLDEN);
    expect(section).toContain('none — no verification result on disk');
    expect(section).toContain('Coverage');
    expect(section).toContain('Challenges');
    expect(section).toContain('Open questions');
    // and the requirement that has one must not claim it is missing
    expect(sectionFor(sheetHtml(), FRESH)).not.toContain('none — no verification result on disk');
  });
});

// ---------------------------------------------------------------------------
// Facts, questions, obligations
// ---------------------------------------------------------------------------

describe('facts, questions and obligations', () => {
  it('lists the facts a requirement consumes and the questions that collect them', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    const requirement = requirementOf(FRESH);
    const facts = new Set<string>();
    const walk = (c: unknown): void => {
      if (c === null || typeof c !== 'object') return;
      const node = c as Record<string, unknown>;
      if (typeof node['fact'] === 'string') facts.add(node['fact']);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
      }
    };
    walk(requirement.condition);
    expect(facts.size).toBeGreaterThan(0);
    for (const fact of facts) expect(section).toContain(fact);

    const collecting = pack.questions.filter((q) => q.factTypes.some((f) => facts.has(f)));
    expect(collecting.length).toBeGreaterThan(0);
    expect(section).toContain(collecting[0]!.id);
  });

  it('lists the obligation templates this requirement triggers', () => {
    const requirement = requirementOf(OBLIGED);
    const firing = pack.obligationTemplates.filter(
      (t) =>
        (t.trigger.allOf ?? []).includes(requirement.id) ||
        (t.trigger.anyOf ?? []).includes(requirement.id),
    );
    expect(firing.length).toBeGreaterThan(0);
    const section = sectionFor(sheetHtml(), OBLIGED);
    for (const template of firing) expect(section).toContain(template.id);
    // and the counterexample: CSRD-S-001 fires none, so it must not list one
    expect(sectionFor(sheetHtml(), FRESH)).not.toContain(firing[0]!.id);
  });

  it('states "none" for a requirement that fires no obligation', () => {
    const barren = pack.requirements.find(
      (r) =>
        !pack.obligationTemplates.some(
          (t) => (t.trigger.allOf ?? []).includes(r.id) || (t.trigger.anyOf ?? []).includes(r.id),
        ),
    );
    if (barren === undefined) throw new Error('fixture requires a requirement firing no obligation');
    expect(sectionFor(sheetHtml(), barren.id)).toContain('none — this requirement fires no obligation');
  });
});

// ---------------------------------------------------------------------------
// Golden profiles
// ---------------------------------------------------------------------------

describe('golden profiles', () => {
  it('names the profiles that exercise a rule', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain('P-001');
    expect(section).not.toContain('no golden profile exercises this rule');
  });

  it('warns explicitly when none do', () => {
    const section = sectionFor(sheetHtml(), NO_GOLDEN);
    expect(section).toContain('no golden profile exercises this rule');
    expect(section).not.toContain('P-001');
  });

  it('reads the suite program-agnostically, by the pack\'s own requirement ids', () => {
    const source = readFileSync(GOLDEN_PROFILES, 'utf8');
    const ids = pack.requirements.map((r) => r.id);
    const byRequirement = goldenProfilesByRequirement(source, ids);
    expect(byRequirement.get(FRESH)).toContain('P-001 EU standalone above thresholds');
    expect(byRequirement.get(NO_GOLDEN) ?? []).toEqual([]);
  });

  it('warns for every requirement when the suite cannot be read at all', () => {
    const html = renderSheet(
      gatherSheet(PACK_ID, { ...paths, goldenProfilesPath: join(dir, 'nowhere.ts') }),
    );
    expect(sectionFor(html, FRESH)).toContain('no golden profile exercises this rule');
  });
});

// ---------------------------------------------------------------------------
// Benchmark metrics — B3's, labelled rather than faked
// ---------------------------------------------------------------------------

describe('benchmark metrics', () => {
  it('resolves the signature\'s pipelineVersion through its promotion record', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    expect(section).toContain(PIPELINE);
    expect(section).toContain('promoted by A. Promoter on 2026-08-01');
    expect(section).toContain(NO_METRICS);
  });

  it('says so when the bound pipelineVersion has no promotion record', () => {
    const section = sectionFor(sheetHtml(), UNPROMOTED_REQ);
    expect(section).toContain(UNPROMOTED);
    expect(section).toContain('has no promotion record');
    expect(section).not.toContain('promoted by A. Promoter');
  });

  it('says so when no signature binds a pipelineVersion at all', () => {
    const section = sectionFor(sheetHtml(), NO_GOLDEN);
    expect(section).toContain('none — no signature, so no pipelineVersion is bound');
    expect(section).toContain(NO_METRICS);
  });
});

// ---------------------------------------------------------------------------
// The sign-off block
// ---------------------------------------------------------------------------

describe('support relied upon — the signature\'s evidence use, shown where the signer can inspect it', () => {
  const pageOf = (html: string, id: string): string => {
    const start = html.indexOf(`id="req-${id}"`);
    expect(start).toBeGreaterThan(-1);
    const next = html.indexOf('<section class="requirement"', start + 1);
    return html.slice(start, next === -1 ? undefined : next);
  };

  it('shows, for a fresh signature, each supporting occurrence with its document, range, line and an excerpt of the stored text', () => {
    const page = pageOf(sheetHtml(), FRESH);
    const at = page.indexOf('<h3>Support relied upon</h3>');
    expect(at).toBeGreaterThan(-1);
    const section = page.slice(at, page.indexOf('<h3>', at + 10));
    expect(section).toContain('reading element R1');
    expect(section).toContain('support');
    expect(section).toContain(`<code>${DOC_A}</code>`);
    expect(section).toContain('range <code>art-29a</code>');
    expect(section).toContain('line 2311');
    // The excerpt is the stored text around the occurrence, so the signer sees context, not only the quote.
    expect(section).toContain(escapeForTest(QUOTE_A.slice(0, 60)));
    expect(section).toContain(`<code>${DOC_B}</code>`);
    expect(section).toContain('range <code>art-2-pt-5</code>');
  });

  it('shows a contextual set with its stated reason, and no occurrence', () => {
    const entry = makeEntry(FRESH);
    const contextual = {
      ...entry,
      evidenceUse: (entry.evidenceUse ?? []).map((record) =>
        record.set === 'challenges[0] (C1).evidence'
          ? { set: record.set, use: 'context' as const, reason: 'Quotes the amending point to show what the challenge is about.', occurrences: [], contextual: [] }
          : record,
      ),
    };
    writeLedger([sealed(contextual)]);
    const section = pageOf(sheetHtml(), FRESH);
    expect(section).toContain('context');
    expect(section).toContain('Quotes the amending point to show what the challenge is about.');
  });

  it('says so when the governing signature carries no evidence-use record, which is why it reads stale_ranges', () => {
    const { evidenceUse: _omitted, ...legacy } = makeEntry(FRESH);
    writeLedger([sealed(legacy)]);
    const page = pageOf(sheetHtml(), FRESH);
    expect(page).toContain('no evidence-use record');
    expect(page).toContain('stale_ranges');
  });
});

describe('evidence use, pending — the designation reviewed before any signature exists', () => {
  const UNSIGNED = 'CSRD-S-005';
  const designationPath = (id: string) => join(verificationDir, PACK_ID, id, 'evidence-use.json');
  const pageOf = (html: string, id: string): string => {
    const start = html.indexOf(`id="req-${id}"`);
    expect(start).toBeGreaterThan(-1);
    const next = html.indexOf('<section class="requirement"', start + 1);
    return html.slice(start, next === -1 ? undefined : next);
  };
  const pendingSection = (page: string): string => {
    const at = page.indexOf('<h3>Evidence use, pending</h3>');
    expect(at).toBeGreaterThan(-1);
    return page.slice(at, page.indexOf('<h3>', at + 10));
  };

  it('shows the selected occurrences with surrounding text, and the contextual reasons, for an unsigned requirement', () => {
    const result = makeResult(UNSIGNED, {
      challenges: [{ id: 'C1', lens: 'miscitation', statement: 'The title line is cited as operative.', verdict: 'CONFIRMED',
        evidence: [{ kind: 'quote', docId: DOC_A, sha256Normalized: corpus.document(DOC_A).sha256Normalized, text: 'DIRECTIVE 2013/34/EU OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL' }],
        resolution: 'x', adjudicationEvidence: [{ kind: 'quote', docId: DOC_A, sha256Normalized: corpus.document(DOC_A).sha256Normalized, text: ADJUDICATION_ONLY_C1 }] }],
      openQuestions: [],
    });
    writeResult(UNSIGNED, result);
    const sets = evidenceSetsOf(result).map((set) =>
      set.recordPath === 'challenges[0] (C1).evidence'
        ? { set: set.recordPath, use: 'context' as const, reason: 'The prosecutor quotes the title line to show the miscitation.' }
        : { set: set.recordPath, use: 'support' as const, items: quotesOf(set.items).map((q) => ({ item: q.path, use: 'support' as const })) },
    );
    writeFileSync(designationPath(UNSIGNED), JSON.stringify({ resultSha256: resultSha256(result), sets }, null, 2), 'utf8');
    const section = pendingSection(pageOf(sheetHtml(), UNSIGNED));
    expect(section).toContain('not signed');
    expect(section).toContain('reading element R1');
    expect(section).toContain('range <code>art-29a</code>');
    expect(section).toContain('line 2311');
    expect(section).toContain('offset');
    expect(section).toContain(escapeForTest(QUOTE_A.slice(0, 60)));
    expect(section).toContain('The prosecutor quotes the title line to show the miscitation.');
    expect(section).not.toContain('unresolved');
  });

  it('shows an unresolved choice with every candidate by offset, and a leftover quote by name, before signing', () => {
    const a = corpus.document(DOC_A);
    const result = makeResult(UNSIGNED, {
      reading: { elements: [{ id: 'R1', statement: 'The thresholds.', evidence: [
        { kind: 'quote', docId: DOC_A, sha256Normalized: a.sha256Normalized, text: 'net turnover of EUR 450 000 000 and an average number of 1 000 employees' },
        { kind: 'quote', docId: DOC_A, sha256Normalized: a.sha256Normalized, text: 'DIRECTIVE 2013/34/EU OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL' },
      ] }] },
      challenges: [],
      openQuestions: [],
    });
    writeResult(UNSIGNED, result);
    writeFileSync(designationPath(UNSIGNED), JSON.stringify({ resultSha256: resultSha256(result), sets: [
      { set: 'reading.elements[0] (R1).evidence', use: 'support', items: [{ item: 'evidence[0]', use: 'support' }] },
    ] }, null, 2), 'utf8');
    const section = pendingSection(pageOf(sheetHtml(), UNSIGNED));
    expect(section).toContain('unresolved');
    expect(section).toContain('evidence[1] is not designated');
    // Once the leftover is designated, the ambiguity is what remains, with both candidates and their offsets.
    writeFileSync(designationPath(UNSIGNED), JSON.stringify({ resultSha256: resultSha256(result), sets: [
      { set: 'reading.elements[0] (R1).evidence', use: 'support', items: [{ item: 'evidence[0]', use: 'support' }, { item: 'evidence[1]', use: 'context', reason: 'title line' }] },
    ] }, null, 2), 'utf8');
    const ambiguous = pendingSection(pageOf(sheetHtml(), UNSIGNED));
    expect(ambiguous).toContain('unresolved');
    expect(ambiguous).toContain('range <code>art-1</code>');
    expect(ambiguous).toContain('offset 4170');
    expect(ambiguous).toContain('range <code>art-29a</code>');
    expect(ambiguous).toContain('offset 116298');
    // Each candidate is shown with its surrounding text, so the choice can be made from the page.
    expect(ambiguous).toContain('⟦');
  });

  it('says when no designation has been written, and when the one written is bound to another result', () => {
    writeResult(UNSIGNED, makeResult(UNSIGNED));
    expect(pendingSection(pageOf(sheetHtml(), UNSIGNED))).toContain('no evidence-use designation');
    writeFileSync(designationPath(UNSIGNED), JSON.stringify({ resultSha256: 'f'.repeat(64), sets: [] }), 'utf8');
    expect(pendingSection(pageOf(sheetHtml(), UNSIGNED))).toContain('bound to result');
  });
});

describe('support relied upon — historical entries are shown truthfully', () => {
  const pageOf = (html: string, id: string): string => {
    const start = html.indexOf(`id="req-${id}"`);
    expect(start).toBeGreaterThan(-1);
    const next = html.indexOf('<section class="requirement"', start + 1);
    return html.slice(start, next === -1 ? undefined : next);
  };
  const supportSection = (page: string): string => {
    const at = page.indexOf('<h3>Support relied upon</h3>');
    expect(at).toBeGreaterThan(-1);
    return page.slice(at, page.indexOf('<h3>', at + 10));
  };

  it('never slices the current text at a historical offset once the pinned hash differs; shows the pinned quotation instead', () => {
    const moved = 'c'.repeat(64);
    const entry = makeEntry(FRESH);
    const historical = sealed({
      ...entry,
      corpus: entry.corpus.map((pin) => (pin.docId === DOC_A ? { ...pin, sha256Normalized: moved } : pin)),
      evidenceUse: (entry.evidenceUse ?? []).map((record) => ({
        ...record,
        occurrences: record.occurrences.map((o) => (o.docId === DOC_A ? { ...o, sha256Normalized: moved, offset: 7 } : o)),
      })),
    });
    writeLedger([historical]);
    const section = supportSection(pageOf(sheetHtml(), FRESH));
    // The current document is not the one signed: no excerpt is cut from it at the old offset.
    expect(section).toContain('cannot be reconstructed from the current document');
    expect(section).toContain('pinned quotation');
    expect(section).toContain(escapeForTest(QUOTE_A.slice(0, 60)));
    // The occurrence in DOC_B, whose hash still matches, keeps its verified excerpt.
    expect(section).toContain(`<code>${DOC_B}</code>`);
    expect(section).toContain('⟦');
    // And the DOC_A occurrence's stale offset is not rendered as an excerpt: the text at offset 7 is the consolidation header.
    expect(section).not.toContain('⟦02013L0034');
  });

  it('states that the pinned quotation is unavailable when the signed result itself is gone', () => {
    const moved = 'c'.repeat(64);
    const entry = makeEntry(FRESH);
    const historical = sealed({
      ...entry,
      corpus: entry.corpus.map((pin) => (pin.docId === DOC_A ? { ...pin, sha256Normalized: moved } : pin)),
      evidenceUse: (entry.evidenceUse ?? []).map((record) => ({ ...record, occurrences: record.occurrences.map((o) => (o.docId === DOC_A ? { ...o, sha256Normalized: moved } : o)) })),
    });
    writeLedger([historical]);
    rmSync(join(verificationDir, PACK_ID, FRESH, 'verification-result.json'));
    const section = supportSection(pageOf(sheetHtml(), FRESH));
    expect(section).toContain('cannot be reconstructed from the current document');
    expect(section).toContain('the signed result is absent');
  });
});

describe('the sign-off block', () => {
  it('carries who signed, when, at which level, and everything the entry pins', () => {
    const section = sectionFor(sheetHtml(), FRESH);
    const entry = makeEntry(FRESH);
    expect(section).toContain(entry.entryId);
    expect(section).toContain('A. Reviewer');
    expect(section).toContain('2026-08-21');
    expect(section).toContain(entry.requirementSha256);
    expect(section).toContain(entry.corpusClosureSha256);
    expect(section).toContain(RENDERER_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Escaping — legal text is full of angle brackets and ampersands
// ---------------------------------------------------------------------------

describe('escaping', () => {
  it('escapes result text rather than emitting it as markup', () => {
    writeResult(
      FRESH,
      makeResult(FRESH, {
        openQuestions: [{ id: 'Q1', statement: '<script>alert(1)</script> & "quotes"' }],
      }),
    );
    const html = sheetHtml();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
  });
});

// ---------------------------------------------------------------------------
// Writing the file
// ---------------------------------------------------------------------------

describe('runSheet', () => {
  it('writes the HTML to the requested path and reports it', () => {
    const outcome = runSheet({ packId: PACK_ID }, paths);
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(existsSync(outPath)).toBe(true);
    expect(readFileSync(outPath, 'utf8')).toContain('<section class="requirement"');
    expect(outcome.lines.join('\n')).toContain(outPath);
  });

  it('refuses to write into verification/', () => {
    const outcome = runSheet(
      { packId: PACK_ID },
      { ...paths, outPath: join(verificationDir, 'sheet.html') },
    );
    expect(outcome.exitCode).toBe(EXIT_USAGE);
    expect(existsSync(join(verificationDir, 'sheet.html'))).toBe(false);
    expect(outcome.lines.join('\n')).toContain('verification');
  });

  it('refuses to write into test/', () => {
    const outcome = runSheet(
      { packId: PACK_ID },
      { ...paths, outPath: join(engineRoot, 'test', 'sheet.html') },
    );
    expect(outcome.exitCode).toBe(EXIT_USAGE);
    expect(existsSync(join(engineRoot, 'test', 'sheet.html'))).toBe(false);
  });

  it('reports an unreadable ledger as forensics required rather than generating a sheet', () => {
    writeFileSync(join(verificationDir, 'signatures.jsonl'), 'not json\n', 'utf8');
    const outcome = runSheet({ packId: PACK_ID }, paths);
    expect(outcome.exitCode).toBe(EXIT_FORENSICS_REQUIRED);
    expect(existsSync(outPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

describe('verify sheet', () => {
  const green = (): boolean => true;

  it('is reachable through the dispatcher without --by', async () => {
    const verifyPaths: VerifyPaths = {
      packDir: PACK_DIR,
      corpusDir: CORPUS_DIR,
      verificationDir,
    };
    const outcome = await dispatch(['sheet', PACK_ID], verifyPaths, green, {
      goldenProfilesPath: GOLDEN_PROFILES,
      outPath,
    });
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(existsSync(outPath)).toBe(true);
  });

  it('honours --out', async () => {
    const other = join(dir, 'out', 'elsewhere.html');
    const verifyPaths: VerifyPaths = {
      packDir: PACK_DIR,
      corpusDir: CORPUS_DIR,
      verificationDir,
    };
    const outcome = await dispatch(['sheet', PACK_ID, '--out', other], verifyPaths, green, {
      goldenProfilesPath: GOLDEN_PROFILES,
      outPath,
    });
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(existsSync(other)).toBe(true);
    expect(existsSync(outPath)).toBe(false);
  });

  it('rejects sheet without a packId', async () => {
    const verifyPaths: VerifyPaths = {
      packDir: PACK_DIR,
      corpusDir: CORPUS_DIR,
      verificationDir,
    };
    expect(
      (
        await dispatch(['sheet'], verifyPaths, green, {
          goldenProfilesPath: GOLDEN_PROFILES,
          outPath,
        })
      ).exitCode,
    ).toBe(EXIT_USAGE);
  });
});

// ---------------------------------------------------------------------------
// The output is git-ignored
// ---------------------------------------------------------------------------

describe('the generated output', () => {
  it('is git-ignored', () => {
    const ignore = readFileSync(join(engineRoot, '.gitignore'), 'utf8');
    expect(ignore).toContain('review-sheet.html');
  });
});

/** The same escaping the sheet applies, so an expectation can be compared against it. */
function escapeForTest(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Standing reaching the human — B11a–B11d
// ---------------------------------------------------------------------------

/**
 * "Document standing, reaching verification" is not satisfied by a field a
 * verifier cannot see. Four surfaces carry it on the sheet — the artefact's
 * authenticity, the per-source standing with its ids preserved, the declared
 * non-operative sections, and the closure renderer's grammar — and each is
 * asserted on its own, with a counterexample in the same output, so a sheet
 * that printed one of them unconditionally could not pass.
 */
describe('the pins table and signoff table carry standing', () => {
  const ID = 'CSRD-S-001';

  it('B11a — authenticity renders each pinned artefact’s own value, and two documents in one signature differ', () => {
    writeResult(ID, makeResult(ID));
    writeLedger([makeEntry(ID)]);
    const section = sectionFor(sheetHtml(), ID);
    expect(section).toContain('<th>authenticity</th>');
    // The consolidated host Directive and the as-published amending Directive
    // sit in the same closure: one consolidation, one authentic publication.
    expect(section).toMatch(/DOC-32013L0034<\/code><\/td>.*?<td>official_consolidation<\/td>/s);
    expect(section).toMatch(/DOC-32026L0470<\/code><\/td>.*?<td>authentic_publication<\/td>/s);
  });

  it('B11b — standing renders one entry per served source with its SRC-NNN preserved and sorted, proved on a multi-source pin', () => {
    const { pins } = closureOf(ID);
    const multi = { ...pins[0]!, sources: [
      { sourceId: 'SRC-008', temporalStanding: 'adopted_not_effective' as const },
      { sourceId: 'SRC-001', temporalStanding: 'in_force' as const },
    ] };
    writeResult(ID, makeResult(ID));
    writeLedger([makeEntry(ID, { corpus: [multi, ...pins.slice(1)] })]);
    const section = sectionFor(sheetHtml(), ID);
    // Sorted by id, ids kept, one entry each — never collapsed to one word.
    expect(section).toContain('<td>SRC-001 in_force; SRC-008 adopted_not_effective</td>');
    // The single-source sibling in the same table renders exactly one entry.
    expect(section).toContain('<td>SRC-004 in_force</td>');
  });

  it('B11c — nonOperative renders the declared headings in authored order, and — for the canonical []', () => {
    const { pins } = closureOf(ID);
    const declared = { ...pins[0]!, nonOperativeSections: ['EXPLANATORY MEMORANDUM', 'ANNEX III'] };
    writeResult(ID, makeResult(ID));
    writeLedger([makeEntry(ID, { corpus: [declared, ...pins.slice(1)] })]);
    const section = sectionFor(sheetHtml(), ID);
    expect(section).toContain('<td>EXPLANATORY MEMORANDUM; ANNEX III</td>');
    expect(section).toContain('<td>—</td>');
    expect(section).toContain('<th>nonOperative</th>');
  });

  it('B11d — closureRendererVersion appears in the signature-metadata table with the entry’s value', () => {
    writeResult(ID, makeResult(ID));
    writeLedger([makeEntry(ID, { closureRendererVersion: 'closure-renderer-9.9.9' })]);
    const section = sectionFor(sheetHtml(), ID);
    expect(section).toContain('<tr><td>closureRendererVersion</td><td>closure-renderer-9.9.9</td></tr>');
    // Beside, not instead of, the condition renderer's version.
    expect(section).toContain('<tr><td>rendererVersion</td><td>1.1.0</td></tr>');
    // And the empty-state row spans the widened table.
    expect(section).not.toContain('colspan="4"');
  });
});

describe('the widened pins table', () => {
  it('spans all seven columns in its empty state, so a signature pinning nothing is not a malformed row', () => {
    const ID = 'CSRD-S-001';
    writeResult(ID, makeResult(ID));
    writeLedger([makeEntry(ID, { corpus: [] })]);
    const section = sectionFor(sheetHtml(), ID);
    expect(section).toContain('<tr><td colspan="7" class="none">none — this signature pins no corpus document</td></tr>');
    // The sibling with pins renders no empty-state row at all.
    writeLedger([makeEntry(ID)]);
    expect(sectionFor(sheetHtml(), ID)).not.toContain('pins no corpus document');
  });
});
