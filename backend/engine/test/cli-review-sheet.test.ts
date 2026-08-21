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
/** Two of the sixteen that no golden profile mentions. Verified against the suite. */
const NO_GOLDEN = 'CSRD-S-006';
/** The one `selection` requirement: no top-level condition at all. */
const SELECTION = 'CSRD-S-012';
/** Fires nine obligation templates; `CSRD-S-001` fires none. Verified against the pack. */
const OBLIGED = 'CSRD-S-014';

const DOC_A = 'DOC-32013L0034';
const DOC_B = 'DOC-32026L0470';
const QUOTE_A = 'DIRECTIVE 2013/34/EU OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';
const QUOTE_B = 'DIRECTIVE (EU) 2026/470 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL';

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
  const closure = computeClosure(corpus.index, docsForSources(corpus.index, requirement.sources));
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
    resultSchemaVersion: '1.0.0',
    pipelineVersion: PIPELINE,
    rendererVersion: RENDERER_VERSION,
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
      },
      {
        id: 'C2',
        lens: 'coverage',
        statement: 'Is the second criterion encoded anywhere?',
        verdict: 'OPEN_QUESTION',
        evidence: [
          { kind: 'quote', docId: DOC_A, sha256Normalized: a.sha256Normalized, text: QUOTE_A },
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
    corpusClosureSha256: sha256,
    corpus: pins,
    resultSha256: resultSha256(makeResult(id)),
    pipelineVersion: PIPELINE,
    by: 'A. Reviewer',
    on: '2026-08-21',
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
    // 16 requirements: S-001 verified; S-002 blocked back to draft; S-003
    // revoked, so draft; S-004 verified; the remaining twelve unsigned.
    expect(html).toContain('<tr><td>verified</td><td>2</td></tr>');
    expect(html).toContain('<tr><td>draft</td><td>14</td></tr>');
    expect(html).toContain('<tr><td>ratified</td><td>0</td></tr>');

    // The same generator over an empty ledger must not print the same numbers.
    writeLedger([]);
    const empty = renderSheet(gatherSheet(PACK_ID, paths));
    expect(empty).toContain('<tr><td>draft</td><td>16</td></tr>');
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
    expect(html).toContain('12 of 16 requirements carry no signature at all');
    expect(html).toContain('1 requirement has been revoked');

    writeLedger([]);
    const empty = renderSheet(gatherSheet(PACK_ID, paths));
    expect(empty).toContain('16 of 16 requirements carry no signature at all');
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

  it('names the entitled evidence surface, and warns when it is empty', () => {
    const html = sheetHtml();
    // CSRD-S-001's sources resolve to two corpus documents.
    expect(sectionFor(html, FRESH)).toContain(DOC_A);
    expect(sectionFor(html, FRESH)).not.toContain('the corpus holds no document serving any of them');
    // CSRD-S-012's resolve to none at all: nobody could have read the law
    // behind it, and quoting cannot reveal that because there is nothing to
    // quote. Verified against the pack and the corpus.
    const selection = sectionFor(html, SELECTION);
    expect(selection).toContain('the corpus holds no document serving any of them');
    expect(selection).toContain('SRC-005');
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

  it('is reachable through the dispatcher without --by', () => {
    const verifyPaths: VerifyPaths = {
      packDir: PACK_DIR,
      corpusDir: CORPUS_DIR,
      verificationDir,
    };
    const outcome = dispatch(['sheet', PACK_ID], verifyPaths, green, {
      goldenProfilesPath: GOLDEN_PROFILES,
      outPath,
    });
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(existsSync(outPath)).toBe(true);
  });

  it('honours --out', () => {
    const other = join(dir, 'out', 'elsewhere.html');
    const verifyPaths: VerifyPaths = {
      packDir: PACK_DIR,
      corpusDir: CORPUS_DIR,
      verificationDir,
    };
    const outcome = dispatch(['sheet', PACK_ID, '--out', other], verifyPaths, green, {
      goldenProfilesPath: GOLDEN_PROFILES,
      outPath,
    });
    expect(outcome.exitCode).toBe(EXIT_OK);
    expect(existsSync(other)).toBe(true);
    expect(existsSync(outPath)).toBe(false);
  });

  it('rejects sheet without a packId', () => {
    const verifyPaths: VerifyPaths = {
      packDir: PACK_DIR,
      corpusDir: CORPUS_DIR,
      verificationDir,
    };
    expect(
      dispatch(['sheet'], verifyPaths, green, {
        goldenProfilesPath: GOLDEN_PROFILES,
        outPath,
      }).exitCode,
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
