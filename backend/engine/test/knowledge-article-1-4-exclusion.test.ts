/**
 * Article 1(4) of Directive 2013/34/EU, as replaced by Directive (EU) 2026/470,
 * says that Articles 19a, 29a and 29d do not apply to the European Financial
 * Stability Facility or to the financial products listed in points (b) and (f)
 * of Article 2(12) of Regulation (EU) 2019/2088. Until the fifth S-002 capture
 * (2026-10-19) neither size test carried that exclusion: an excluded undertaking
 * that met every threshold read as in scope, and the record's challenge
 * `P6-C1-efsf-and-financial-products-exclusion` was adjudicated MISMATCH — the
 * one supported encoding defect among the twelve verdicts.
 *
 * Why this file exists: the correction is a negated branch over a new boolean
 * fact, `entity.excluded_by_article_1_4`, in CSRD-S-001 (version 4) and
 * CSRD-S-002 (version 5). These tests hold the three outcomes the law requires
 * — excluded is out, not excluded is in, unknown stays unresolved and never
 * silently reads "not excluded" — together with what the correction forced on
 * the versioning: the registry appends and never rewrites, and the verification
 * input the r1–r5 S-002 records pinned has moved, so no later capture package
 * can bind to the old digest by accident.
 *
 * The registry tests read the authored files directly rather than through
 * `loadPack`, so that a registry entry removed by hand fails *their* assertion
 * rather than every test in this file at load time (evidence standard, mode 2).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assess } from '../src/engine/evaluate';
import { loadPack } from '../src/knowledge/loader';
import { requirementSchema } from '../src/knowledge/schema';
import type { AuthoredRequirement, Condition, Determination, KnowledgePack, Profile, Requirement } from '../src/types';
import { requirementInputSha256, requirementSha256 } from '../src/verification/canonical';
import { parseVersionRegistry } from '../src/verification/registry';
import { ProfileBuilder, ctx } from './helpers';

const ENGINE = join(__dirname, '..');
const PACK_DIR = join(ENGINE, 'knowledge', 'csrd');
const REQUIREMENTS_FILE = join(PACK_DIR, 'requirements.json');
const REGISTRY_FILE = join(ENGINE, 'verification', 'requirement-versions', 'csrd.json');

const FACT = 'entity.excluded_by_article_1_4';
/** The branch both size tests gained: Article 1(4) as a negated equality on the fact. */
const EXCLUSION: Condition = { op: 'not', of: { op: 'eq', fact: FACT, value: true } };
const FY2027 = ['2027-01-01', '2027-12-31'] as const;

// ---------------------------------------------------------------------------
// Digests — every literal below is stated, never recomputed from the file
// under test.
// ---------------------------------------------------------------------------

/** `requirementInputSha256(CSRD-S-002)` at version 4: the digest the r1–r5 records carry. */
const S002_INPUT_R1_TO_R5 = 'fecc50505cb4779323b70203924c012b783bf5186e34ecf9ed4d3df20b6fea95';
/** `requirementInputSha256(CSRD-S-001)` at version 3: the digest the committed S-001 recordings carry. */
const S001_INPUT_AT_V3 = '9b8b8436fee1e7db7b3bfe7da9f3f47e32522858c1e982a2038921a6f50dbd8f';
/** The verification inputs after the Article 1(4) branch and locator were added. */
const S002_INPUT_AT_V5 = '93ad5a911f14aac849dc95dfde262ce7a260eae9a162626b0c1d006b0592610f';
const S001_INPUT_AT_V4 = '340cf51442b1e30349f2d4863d479bcff32d19a1dc2b6da7da1c81b62546849d';

/** Whole-record digests the registry must keep, byte for byte, as committed before this bump. */
const HISTORICAL: readonly (readonly [string, string, string])[] = [
  ['CSRD-S-001', '1', 'c687f4c6cc56ab3699da6a860d56d52680517ef8697e5252f9de13342dbe402a'],
  ['CSRD-S-001', '2', 'fb5820d28690d5b6799bd8163e2651f68e347142243df396d87eccb93a3cd393'],
  ['CSRD-S-001', '3', '026154c0b0070f89c641ccd36f8769ac10a8f268533591b1047b3a9ceda32787'],
  ['CSRD-S-002', '1', '004072cf5439c8cd80e3ea2f0e8f57c445dea50dea4be95b495974fc1cab9e44'],
  ['CSRD-S-002', '2', 'd9c93c03c78391a7a8379af50be7ab5e08e887e640df481a22fe25b47fab3935'],
  ['CSRD-S-002', '3', 'bfd77b171a5723e310f3ea525bbc00344556cfb818d9b638311023826929c8df'],
  ['CSRD-S-002', '4', '71356cd08addf4a1ca6e2363ecac94be1dcc5790822217a7c1e369ac95180a35'],
];
/** The two entries this bump appended, computed once with the engine's `requirementSha256` and pinned here. */
const APPENDED: readonly (readonly [string, string, string])[] = [
  ['CSRD-S-001', '4', 'ea6ec4932a8c6ccda873ea8a0b08d63a64d7ab84037f19ec0a7b17ce69367fa0'],
  ['CSRD-S-002', '5', '0ea6f4ddefe8a09fc71f70227307bc63d85f5893b887f02958f27807b22a3f72'],
];

// ---------------------------------------------------------------------------
// Fixtures: every other branch of each size test satisfied, the fact varied.
// ---------------------------------------------------------------------------

type Exclusion = 'excluded' | 'not_excluded' | 'absent' | 'unknown';

function withExclusion(builder: ProfileBuilder, scopeId: string, status: Exclusion): ProfileBuilder {
  switch (status) {
    case 'excluded':
      return builder.bool(scopeId, FACT, true);
    case 'not_excluded':
      return builder.bool(scopeId, FACT, false);
    case 'unknown':
      // Recorded as unknown, which the law treats no differently from unanswered.
      return builder.fact(scopeId, FACT, { kind: 'unknown' });
    case 'absent':
      return builder;
  }
}

/** An EU private limited company over both Article 19a thresholds. */
function individual(status: Exclusion): Profile {
  const builder = new ProfileBuilder()
    .euEntity('e1', 'Alpine Industrie SAS', 'FR')
    .num('e1', 'entity.net_turnover_eur', 520_000_000)
    .num('e1', 'entity.avg_employees', 1350);
  return withExclusion(builder, 'e1', status).build();
}

/** An EU parent whose group is over both Article 29a thresholds. */
function consolidated(status: Exclusion): Profile {
  const builder = new ProfileBuilder()
    .org('grp', 'Vestfold Group')
    .euEntity('parent', 'Vestfold Holding BV', 'NL', { parentId: 'grp', isParent: true })
    .num('grp', 'group.consolidated_net_turnover_eur', 900_000_000)
    .num('grp', 'group.avg_employees', 4000);
  return withExclusion(builder, 'parent', status).build();
}

let cached: KnowledgePack | undefined;
const pack = (): KnowledgePack => (cached ??= loadPack(PACK_DIR));

function det(profile: Profile, subject: string, requirementId: string): Determination {
  const result = assess(pack(), profile, ctx(...FY2027, subject));
  const found = result.determinations.find((d) => d.requirementId === requirementId && d.scopeId === subject);
  if (found === undefined) throw new Error(`no determination for ${requirementId} on ${subject}`);
  return found;
}

function requirement(id: string): Requirement {
  const found = pack().requirements.find((r) => r.id === id);
  if (found === undefined) throw new Error(`pack has no ${id}`);
  return found;
}

function conditionOf(req: AuthoredRequirement): { op: 'all'; of: Condition[] } {
  if (req.condition === undefined || req.condition.op !== 'all') throw new Error(`${req.id} is not an ALL`);
  return req.condition;
}

function locatorTexts(req: AuthoredRequirement): string[] {
  return req.provenance.flatMap((p) => p.locators.map((l) => ('text' in l ? l.text : l.kind)));
}

/** The authored records, parsed through the same schema the registry hashes — no loader, no registry check. */
function authored(): AuthoredRequirement[] {
  return z.array(requirementSchema).parse(JSON.parse(readFileSync(REQUIREMENTS_FILE, 'utf8'))) as AuthoredRequirement[];
}

function authoredOne(id: string): AuthoredRequirement {
  const found = authored().find((r) => r.id === id);
  if (found === undefined) throw new Error(`requirements.json has no ${id}`);
  return found;
}

const registry = () => parseVersionRegistry(JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')));

// ---------------------------------------------------------------------------
// CSRD-S-001 — the individual size test
// ---------------------------------------------------------------------------

describe('CSRD-S-001 honours the Article 1(4) exclusion', () => {
  it('an excluded undertaking above both thresholds is definitively outside Article 19a, and no duty follows', () => {
    const scope = det(individual('excluded'), 'e1', 'CSRD-S-001');
    expect(scope.result).toBe('DOES_NOT_APPLY');
    // Definitive: a reason code would mean the engine guessed.
    expect(scope.reason).toBeUndefined();
    expect(det(individual('excluded'), 'e1', 'CSRD-S-014').result).toBe('DOES_NOT_APPLY');
  });

  it('an undertaking that is not excluded, above both thresholds, is in scope and carries the duty', () => {
    // The positive control for the pair of negatives around it.
    expect(det(individual('not_excluded'), 'e1', 'CSRD-S-001').result).toBe('APPLIES');
    expect(det(individual('not_excluded'), 'e1', 'CSRD-S-014').result).toBe('APPLIES');
  });

  it('an undertaking whose exclusion status is absent stays unresolved, naming the fact and its reason', () => {
    const scope = det(individual('absent'), 'e1', 'CSRD-S-001');
    expect(scope.result).toBe('INDETERMINATE');
    expect(scope.reason).toBe('missing_fact');
    expect(scope.needs).toContainEqual({ factType: FACT, scopeId: 'e1', reason: 'missing_fact' });
    // No duty is asserted while the exclusion is open.
    expect(det(individual('absent'), 'e1', 'CSRD-S-014').result).toBe('INDETERMINATE');
  });

  it('an answer recorded as unknown is unresolved too, never read as "not excluded"', () => {
    const scope = det(individual('unknown'), 'e1', 'CSRD-S-001');
    expect(scope.result).toBe('INDETERMINATE');
    expect(scope.needs.map((n) => n.factType)).toContain(FACT);
  });
});

// ---------------------------------------------------------------------------
// CSRD-S-002 — the consolidated size test
// ---------------------------------------------------------------------------

describe('CSRD-S-002 honours the Article 1(4) exclusion', () => {
  it('an excluded parent whose group is above both thresholds is definitively outside Article 29a, and no duty follows', () => {
    const scope = det(consolidated('excluded'), 'parent', 'CSRD-S-002');
    expect(scope.result).toBe('DOES_NOT_APPLY');
    expect(scope.reason).toBeUndefined();
    expect(det(consolidated('excluded'), 'parent', 'CSRD-S-014').result).toBe('DOES_NOT_APPLY');
  });

  it('a parent that is not excluded, with its group above both thresholds, is in scope and carries the duty', () => {
    expect(det(consolidated('not_excluded'), 'parent', 'CSRD-S-002').result).toBe('APPLIES');
    expect(det(consolidated('not_excluded'), 'parent', 'CSRD-S-014').result).toBe('APPLIES');
  });

  it('a parent whose exclusion status is absent stays unresolved, naming the fact and its reason', () => {
    const scope = det(consolidated('absent'), 'parent', 'CSRD-S-002');
    expect(scope.result).toBe('INDETERMINATE');
    expect(scope.reason).toBe('missing_fact');
    expect(scope.needs).toContainEqual({ factType: FACT, scopeId: 'parent', reason: 'missing_fact' });
    expect(det(consolidated('absent'), 'parent', 'CSRD-S-014').result).toBe('INDETERMINATE');
  });

  it('an answer recorded as unknown is unresolved too', () => {
    const scope = det(consolidated('unknown'), 'parent', 'CSRD-S-002');
    expect(scope.result).toBe('INDETERMINATE');
    expect(scope.needs.map((n) => n.factType)).toContain(FACT);
  });
});

// ---------------------------------------------------------------------------
// The encoding, as authored
// ---------------------------------------------------------------------------

describe('the exclusion as encoded', () => {
  it('sits last in each size test’s ALL, as a negated equality on the fact', () => {
    const s001 = conditionOf(requirement('CSRD-S-001'));
    const s002 = conditionOf(requirement('CSRD-S-002'));
    expect(s001.of).toHaveLength(5);
    expect(s002.of).toHaveLength(6);
    expect(s001.of[s001.of.length - 1]).toEqual(EXCLUSION);
    expect(s002.of[s002.of.length - 1]).toEqual(EXCLUSION);
    // And nowhere else: one branch per test, not a duplicated one.
    expect(s001.of.filter((c) => JSON.stringify(c) === JSON.stringify(EXCLUSION))).toHaveLength(1);
    expect(s002.of.filter((c) => JSON.stringify(c) === JSON.stringify(EXCLUSION))).toHaveLength(1);
  });

  it('is a boolean legal-entity fact with an explicit missing reason and a label naming Article 1(4)', () => {
    const fact = pack().factTypes.find((ft) => ft.id === FACT);
    expect(fact).toBeDefined();
    expect(fact?.scopeType).toBe('legal_entity');
    expect(fact?.dataType).toBe('boolean');
    expect(fact?.missingReason).toBe('missing_fact');
    for (const token of ['Article 1(4)', 'European Financial Stability Facility', '2019/2088']) {
      expect(fact?.label, token).toContain(token);
    }
  });

  it('is collected by one questionnaire item, shown once the entity is EU-incorporated with a known legal form, which says why it is asked', () => {
    const items = pack().questions.filter((q) => q.factTypes.includes(FACT));
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.whyAsked).toContain('Article 1(4)');
    expect(item.showWhen.always).toBeUndefined();
    const gates = item.showWhen.allOf ?? [];
    expect(gates.some((g) => g.factInSet?.fact === 'entity.incorporation_country' && g.factInSet.set.includes('FR'))).toBe(true);
    expect(gates.some((g) => g.factExists?.fact === 'entity.legal_form')).toBe(true);
  });

  it('cites Article 1(4) of SRC-001 beside each test’s threshold provision, and nothing else', () => {
    const s001 = requirement('CSRD-S-001');
    const s002 = requirement('CSRD-S-002');
    expect(s001.provenance.map((p) => p.sourceId)).toEqual(['SRC-001']);
    expect(s002.provenance.map((p) => p.sourceId)).toEqual(['SRC-001']);
    expect(locatorTexts(s001)).toEqual(['Article 19a(1)', 'Article 1(4)']);
    expect(locatorTexts(s002)).toEqual(['Article 29a(1)', 'Article 1(4)']);
  });

  it('is named in the plain-English text of both, which is not a substitute for the branch', () => {
    expect(requirement('CSRD-S-001').plainEnglish).toContain('Article 1(4)');
    expect(requirement('CSRD-S-002').plainEnglish).toContain('Article 1(4)');
  });
});

// ---------------------------------------------------------------------------
// The version registry, read from the files
// ---------------------------------------------------------------------------

describe('the version registry after the Article 1(4) bump', () => {
  it('binds CSRD-S-001 version 4 and CSRD-S-002 version 5 to their current content by the engine’s own digest', () => {
    const reg = registry();
    const s001 = authoredOne('CSRD-S-001');
    const s002 = authoredOne('CSRD-S-002');
    expect(s001.version).toBe(4);
    expect(s002.version).toBe(5);
    expect(reg['CSRD-S-001']?.['4']).toBe(requirementSha256(s001 as Requirement));
    expect(reg['CSRD-S-002']?.['5']).toBe(requirementSha256(s002 as Requirement));
    for (const [id, version, digest] of APPENDED) {
      expect(reg[id]?.[version], `${id} v${version}`).toBe(digest);
    }
  });

  it('holds exactly versions 1 to 4 and 1 to 5, every historical digest unchanged', () => {
    const reg = registry();
    expect(Object.keys(reg['CSRD-S-001'] ?? {}).sort()).toEqual(['1', '2', '3', '4']);
    expect(Object.keys(reg['CSRD-S-002'] ?? {}).sort()).toEqual(['1', '2', '3', '4', '5']);
    for (const [id, version, digest] of HISTORICAL) {
      expect(reg[id]?.[version], `${id} v${version}`).toBe(digest);
    }
    // A control that the bump touched only these two: the next requirement stays at three versions.
    expect(Object.keys(reg['CSRD-S-003'] ?? {}).sort()).toEqual(['1', '2', '3']);
  });

  it('moved the verification input of both size tests, so the r1–r5 S-002 records and the S-001 recordings describe the old encodings', () => {
    const s001 = authoredOne('CSRD-S-001');
    const s002 = authoredOne('CSRD-S-002');
    expect(requirementInputSha256(s002)).toBe(S002_INPUT_AT_V5);
    expect(requirementInputSha256(s002)).not.toBe(S002_INPUT_R1_TO_R5);
    expect(requirementInputSha256(s001)).toBe(S001_INPUT_AT_V4);
    expect(requirementInputSha256(s001)).not.toBe(S001_INPUT_AT_V3);

    // Positive control: taking the branch and the locator away — and nothing
    // else — restores the digests the records carry, so the move is exactly
    // the Article 1(4) change.
    const withoutExclusion = (req: AuthoredRequirement): AuthoredRequirement => ({
      ...req,
      condition: { op: 'all', of: conditionOf(req).of.slice(0, -1) },
      provenance: req.provenance.map((p) => ({ ...p, locators: p.locators.filter((l) => !('text' in l) || l.text !== 'Article 1(4)') })),
    });
    expect(requirementInputSha256(withoutExclusion(s002))).toBe(S002_INPUT_R1_TO_R5);
    expect(requirementInputSha256(withoutExclusion(s001))).toBe(S001_INPUT_AT_V3);
  });
});
