/**
 * Why this file exists: the fifth S-002 capture's author review (2026-10-19)
 * found two defects that no size test could carry — the reporting duty had no
 * first-application rule (Article 5(2) of Directive (EU) 2022/2464; issue C),
 * and one exemption removed both duties, because `parent.report_includes_entity`
 * says the intermediate parent is included and nothing about its subsidiaries
 * while Article 29a(8) exempts a parent only where it *and its subsidiary
 * undertakings* are included (issue G). The design of 2026-10-19
 * (`docs/superpowers/specs/2026-10-19-timing-and-exemption-composition-design.md`)
 * and the user's resolutions on it are what this file holds as behaviour:
 *
 *  - two timing requirements, individual (`CSRD-S-017`) and consolidated
 *    (`CSRD-S-018`), each the point (a) first-wave criteria for financial years
 *    starting 2024–2026 OR the point (b) date composed with the size test — the
 *    first-wave route independent of the new thresholds, and the Article 1(4)
 *    exclusion above both branches;
 *  - timing and exemptions composed separately per route (`CSRD-S-020`,
 *    `CSRD-S-021`), `CSRD-S-014` their disjunction, so an individual exemption
 *    never extinguishes a consolidated duty;
 *  - coverage of the undertaking *and its subsidiaries* wherever the cited
 *    provision says so: `CSRD-S-019` (Article 29a(8)/(9)) and, by the same
 *    words in Article 19a(9), `CSRD-S-005`/`CSRD-S-006` at version 4 — so the
 *    design's counterexample rows 1 and 8 are corrected here: entity-only
 *    coverage establishes neither exemption;
 *  - the Article 3(4)/(7) size category as a stated, reviewed status fact,
 *    never derived from one year's figures while Article 3(10)'s
 *    two-consecutive-years rule is unrepresented; unknown stays unresolved;
 *  - the Article 29a(7a) financial-holding option (`CSRD-S-023`) encoded as a
 *    deferred bracket that never silently reads "not exercised" where the
 *    assessed undertaking is a holding, and never touches a non-holding;
 *  - `CSRD-S-003` kept as history, composed into nothing; the national-law gate
 *    kept at the summary boundary.
 *
 * Every profile below states its facts; nothing here relies on a default. The
 * registry tests read the authored files directly so that a missing entry
 * fails *their* assertion rather than every test at load time (evidence
 * standard, mode 2).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assess } from '../src/engine/evaluate';
import { loadPack } from '../src/knowledge/loader';
import { requirementSchema } from '../src/knowledge/schema';
import type { AssessmentResult, AuthoredRequirement, Condition, Determination, KnowledgePack, Profile, Requirement } from '../src/types';
import { requirementSha256 } from '../src/verification/canonical';
import { parseVersionRegistry } from '../src/verification/registry';
import { ProfileBuilder, ctx } from './helpers';

const ENGINE = join(__dirname, '..');
const PACK_DIR = join(ENGINE, 'knowledge', 'csrd');
const REQUIREMENTS_FILE = join(PACK_DIR, 'requirements.json');
const REGISTRY_FILE = join(ENGINE, 'verification', 'requirement-versions', 'csrd.json');

const EXCLUSION = 'entity.excluded_by_article_1_4';
const PIE = 'entity.is_public_interest_entity';
const LARGE = 'entity.is_large_undertaking';
const LARGE_GROUP = 'group.is_large_group';
const ALL_SUBS = 'parent.report_includes_all_subsidiaries';
const DISCLOSURES = 'entity.exemption_disclosures_in_management_report';
const HOLDING = 'entity.is_financial_holding_undertaking';
const INDEPENDENT = 'group.subsidiaries_business_models_independent';
const OPTION = 'entity.art_29a_7a_option_exercised';
/** Articles 19a(9) and 29a(8), fourth subparagraph: the Article 37 alternative to the exemption disclosures, stated and never assumed. */
const ARTICLE_37 = 'entity.article_37_exempt_publishing_consolidated_report';
/** The country of the parent that reports at group level — not necessarily the group's ultimate parent. */
const REPORTING_PARENT = 'parent.reporting_parent_country';

/** The branch both timing requirements carry above their routes (E, restated). */
const EXCLUDED_BRANCH: Condition = { op: 'not', of: { op: 'eq', fact: EXCLUSION, value: true } };

let cached: KnowledgePack | undefined;
const pack = (): KnowledgePack => (cached ??= loadPack(PACK_DIR));

const fy = (year: number, subject: string) => ctx(`${year}-01-01`, `${year}-12-31`, subject);

function det(result: AssessmentResult, requirementId: string, scopeId: string): Determination {
  const found = result.determinations.find((d) => d.requirementId === requirementId && d.scopeId === scopeId);
  if (found === undefined) throw new Error(`no determination for ${requirementId} on ${scopeId}`);
  return found;
}

const truth = (result: AssessmentResult, requirementId: string, scopeId: string) => det(result, requirementId, scopeId).result;
const questionIds = (result: AssessmentResult) => result.nextQuestions.map((q) => q.question.id);
const obligationIds = (result: AssessmentResult) => result.obligations.map((o) => o.templateId);

// ---------------------------------------------------------------------------
// Profiles. Every fact a route needs is stated; what a case leaves out, it
// leaves out on purpose and says so.
// ---------------------------------------------------------------------------

type Tri = boolean | 'absent';
const set = (b: ProfileBuilder, scope: string, fact: string, v: Tri | undefined): ProfileBuilder =>
  v === undefined || v === 'absent' ? b : b.bool(scope, fact, v);

interface ParentOpts {
  /** Is the parent itself a subsidiary of a higher parent (an intermediate parent)? */
  intermediate?: boolean;
  entityTurnover?: number;
  entityEmployees?: number;
  groupTurnover?: number;
  groupEmployees?: number;
  pie?: Tri;
  largeGroup?: Tri;
  /** Default false: an ordinary parent, not a financial holding. 'absent' leaves the bracket open. */
  holding?: Tri;
  independent?: Tri;
  option?: Tri;
  transitionOption?: Tri;
  /** The group's ultimate parent's country: what the Article 40a route (CSRD-S-007) concerns. */
  ultimateParentCountry?: string;
  /** The country of the parent that reports at group level: EU → the Articles 29/29a sentence of Articles 19a(9) and 29a(8), else the third-country sentence. 'absent' states nothing. */
  reportingParentCountry?: string | 'absent';
  includesEntity?: Tri;
  /** The Article 37 alternative to the disclosures (fourth subparagraph of Articles 19a(9) and 29a(8)). */
  article37?: Tri;
  includesAllSubsidiaries?: Tri;
  disclosures?: Tri;
  reportStandard?: 'ESRS' | 'EQUIVALENT' | 'OTHER';
  assurance?: Tri;
  taxonomy?: Tri;
  excluded?: Tri;
}

/** An EU parent `p` of group `grp`, NL incorporated, private limited company. */
function parentOf(o: ParentOpts): Profile {
  let b = new ProfileBuilder()
    .org('grp', 'Vestfold Group')
    .euEntity('p', 'Vestfold Holding BV', 'NL', { parentId: 'grp', isParent: true, isSubsidiary: o.intermediate ?? false })
    .num('p', 'entity.net_turnover_eur', o.entityTurnover ?? 300_000_000)
    .num('p', 'entity.avg_employees', o.entityEmployees ?? 400)
    .num('grp', 'group.consolidated_net_turnover_eur', o.groupTurnover ?? 900_000_000)
    .num('grp', 'group.avg_employees', o.groupEmployees ?? 4000)
    .str('p', 'entity.governing_member_state', 'NL');
  b = set(b, 'p', EXCLUSION, o.excluded ?? false);
  b = set(b, 'p', PIE, o.pie);
  b = set(b, 'grp', LARGE_GROUP, o.largeGroup);
  b = set(b, 'p', HOLDING, o.holding ?? false);
  b = set(b, 'grp', INDEPENDENT, o.independent);
  b = set(b, 'p', OPTION, o.option);
  b = set(b, 'p', 'entity.member_state_transition_option', o.transitionOption);
  if (o.ultimateParentCountry !== undefined) b = b.str('grp', 'group.ultimate_parent_country', o.ultimateParentCountry);
  if (o.reportingParentCountry !== undefined && o.reportingParentCountry !== 'absent') b = b.str('grp', REPORTING_PARENT, o.reportingParentCountry);
  b = set(b, 'p', 'parent.report_includes_entity', o.includesEntity);
  b = set(b, 'p', ARTICLE_37, o.article37);
  b = set(b, 'p', ALL_SUBS, o.includesAllSubsidiaries);
  b = set(b, 'p', DISCLOSURES, o.disclosures);
  if (o.reportStandard !== undefined) {
    b = b.str('grp', 'parent.report_standard', o.reportStandard).str('grp', 'parent.report_public_url', 'https://example.com/group-report');
    b = b.bool('p', 'entity.national_publication_conditions_met', true);
  }
  b = set(b, 'grp', 'parent.assurance_opinion_available', o.assurance);
  b = set(b, 'grp', 'parent.taxonomy_information_included', o.taxonomy);
  return b.build();
}

/** An intermediate parent covered, or not, by its EU ultimate parent's ESRS report, which that parent itself draws up: the design's P. */
function intermediate(o: Partial<ParentOpts> & { includesAllSubsidiaries: Tri }): Profile {
  return parentOf({
    intermediate: true,
    entityTurnover: 520_000_000,
    entityEmployees: 1350,
    ultimateParentCountry: 'DE',
    reportingParentCountry: 'DE',
    includesEntity: true,
    reportStandard: 'ESRS',
    disclosures: true,
    ...o,
  });
}

interface StandaloneOpts {
  turnover: number;
  employees: number;
  pie?: Tri;
  large?: Tri;
  transitionOption?: Tri;
  excluded?: Tri;
}

/** A standalone EU private limited company `e1`, FR incorporated, FR governed. */
function standalone(o: StandaloneOpts): Profile {
  let b = new ProfileBuilder()
    .euEntity('e1', 'Alpine Industrie SAS', 'FR')
    .num('e1', 'entity.net_turnover_eur', o.turnover)
    .num('e1', 'entity.avg_employees', o.employees)
    .str('e1', 'entity.governing_member_state', 'FR');
  b = set(b, 'e1', EXCLUSION, o.excluded ?? false);
  b = set(b, 'e1', PIE, o.pie);
  b = set(b, 'e1', LARGE, o.large);
  b = set(b, 'e1', 'entity.member_state_transition_option', o.transitionOption);
  return b.build();
}

/** A subsidiary `sub` that is not itself a parent, covered by its parent's report, with the disclosures made unless a case says otherwise: P-004's shape. */
function coveredSubsidiary(o: { ultimateParentCountry: string; reportingParentCountry: string | 'absent'; reportStandard: 'ESRS' | 'EQUIVALENT'; assurance?: Tri; taxonomy?: Tri; includesAllSubsidiaries?: Tri; disclosures?: Tri; article37?: Tri }): Profile {
  let b = new ProfileBuilder()
    .org('grp', 'Continental Foods Group')
    .euEntity('sub', 'Continental Foods GmbH', 'DE', { parentId: 'grp', isSubsidiary: true })
    .num('sub', 'entity.net_turnover_eur', 520_000_000)
    .num('sub', 'entity.avg_employees', 1350)
    .str('grp', 'group.ultimate_parent_country', o.ultimateParentCountry)
    .bool('sub', 'parent.report_includes_entity', true)
    .str('grp', 'parent.report_standard', o.reportStandard)
    .str('grp', 'parent.report_public_url', 'https://example.com/group-report')
    .bool('sub', 'entity.national_publication_conditions_met', true)
    .str('sub', 'entity.governing_member_state', 'DE')
    .bool('sub', EXCLUSION, false);
  if (o.reportingParentCountry !== 'absent') b = b.str('grp', REPORTING_PARENT, o.reportingParentCountry);
  b = set(b, 'sub', DISCLOSURES, o.disclosures ?? true);
  b = set(b, 'sub', ARTICLE_37, o.article37);
  b = set(b, 'grp', 'parent.assurance_opinion_available', o.assurance);
  b = set(b, 'grp', 'parent.taxonomy_information_included', o.taxonomy);
  b = set(b, 'sub', ALL_SUBS, o.includesAllSubsidiaries);
  return b.build();
}

// ---------------------------------------------------------------------------
// The authored records, read without the loader (so a registry fault fails here)
// ---------------------------------------------------------------------------

function authored(): AuthoredRequirement[] {
  return z.array(requirementSchema).parse(JSON.parse(readFileSync(REQUIREMENTS_FILE, 'utf8'))) as AuthoredRequirement[];
}
function authoredOne(id: string): AuthoredRequirement {
  const found = authored().find((r) => r.id === id);
  if (found === undefined) throw new Error(`requirements.json has no ${id}`);
  return found;
}
const registry = () => parseVersionRegistry(JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')));

function requirement(id: string): Requirement {
  const found = pack().requirements.find((r) => r.id === id);
  if (found === undefined) throw new Error(`pack has no ${id}`);
  return found;
}
function conditionOf(req: AuthoredRequirement | Requirement): Condition {
  if (req.condition === undefined) throw new Error(`${req.id} carries no condition`);
  return req.condition;
}
function allOf(c: Condition): Condition[] {
  if (c.op !== 'all') throw new Error(`expected an ALL, got ${c.op}`);
  return c.of;
}
function anyOf(c: Condition): Condition[] {
  if (c.op !== 'any') throw new Error(`expected an ANY, got ${c.op}`);
  return c.of;
}
function locatorTexts(req: AuthoredRequirement | Requirement): string[] {
  return req.provenance.flatMap((p) => p.locators.map((l) => ('text' in l ? l.text : l.kind)));
}
function referencedRequirements(condition: Condition): string[] {
  const refs: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record['op'] === 'requirement_ref') refs.push(String(record['requirement']));
    for (const value of Object.values(record)) walk(value);
  };
  walk(condition);
  return refs;
}
const opsOf = (condition: Condition): string[] => {
  const ops: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record['op'] === 'string') ops.push(record['op']);
    for (const value of Object.values(record)) walk(value);
  };
  walk(condition);
  return ops;
};

// ---------------------------------------------------------------------------
// 1. The facts, stated and never derived
// ---------------------------------------------------------------------------

describe('the facts the composition states, never derives', () => {
  const fact = (id: string) => pack().factTypes.find((f) => f.id === id);

  it.each([
    [PIE, 'legal_entity', 'Article 2(1)'],
    [LARGE, 'legal_entity', 'Article 3(4)'],
    [LARGE_GROUP, 'organization', 'Article 3(7)'],
    [ALL_SUBS, 'legal_entity', 'subsidiary undertaking'],
    [DISCLOSURES, 'legal_entity', 'weblinks'],
    [HOLDING, 'legal_entity', 'Article 2(15)'],
    [INDEPENDENT, 'organization', 'independent'],
    [OPTION, 'legal_entity', 'Article 29a(7a)'],
    [ARTICLE_37, 'legal_entity', 'Article 37'],
  ])('%s is a boolean %s fact whose absence is a missing answer, labelled by its provision', (id, scopeType, token) => {
    const f = fact(id);
    expect(f).toBeDefined();
    expect(f?.scopeType).toBe(scopeType);
    expect(f?.dataType).toBe('boolean');
    expect(f?.missingReason).toBe('missing_fact');
    expect(f?.label, token).toContain(token);
  });

  it('the reporting parent\'s country is a stated country fact, distinct from the ultimate parent\'s', () => {
    const f = fact(REPORTING_PARENT);
    expect(f?.scopeType).toBe('organization');
    expect(f?.dataType).toBe('country');
    expect(f?.missingReason).toBe('missing_fact');
    expect(f?.notes).toContain('group.ultimate_parent_country');
    expect(fact('group.ultimate_parent_country')).toBeDefined();
  });

  it('the two size-category facts say why they are stated rather than computed: Article 3(10)', () => {
    for (const id of [LARGE, LARGE_GROUP]) {
      expect(fact(id)?.notes, id).toContain('Article 3(10)');
      expect(fact(id)?.notes, id).toMatch(/two consecutive financial years/);
    }
  });

  it('the exemption obligations trigger on the new exemptions too', () => {
    const template = (id: string) => pack().obligationTemplates.find((o) => o.id === id);
    expect(template('O-010')?.trigger.anyOf).toEqual(['CSRD-S-004', 'CSRD-S-022']);
    expect(template('O-011')?.trigger.anyOf).toEqual(['CSRD-S-005', 'CSRD-S-006', 'CSRD-S-019']);
  });
});

// ---------------------------------------------------------------------------
// 2. The questions, offered only where an unresolved determination needs them
// ---------------------------------------------------------------------------

describe('the questions, offered only where an unresolved determination needs them', () => {
  it('nine items collect the ten facts', () => {
    const q = (id: string) => pack().questions.find((x) => x.id === id);
    expect(q('Q-040')?.factTypes).toEqual([PIE]);
    expect(q('Q-041')?.factTypes).toEqual([LARGE]);
    expect(q('Q-042')?.factTypes).toEqual([LARGE_GROUP]);
    expect(q('Q-043')?.factTypes).toEqual([ALL_SUBS]);
    expect(q('Q-044')?.factTypes).toEqual([DISCLOSURES]);
    expect(q('Q-045')?.factTypes).toEqual([HOLDING]);
    expect(q('Q-046')?.factTypes).toEqual([INDEPENDENT, OPTION]);
    expect(q('Q-047')?.factTypes).toEqual([REPORTING_PARENT]);
    expect(q('Q-048')?.factTypes).toEqual([ARTICLE_37]);
    for (const id of ['Q-040', 'Q-041', 'Q-042', 'Q-043', 'Q-044', 'Q-045', 'Q-046', 'Q-047', 'Q-048']) {
      expect(q(id)?.showWhen.always, id).toBeUndefined();
      expect(q(id)?.whyAsked.length, id).toBeGreaterThan(20);
    }
  });

  it('the holding question is offered to a parent whose consolidated duty waits on it, and not to a standalone', () => {
    const waiting = assess(pack(), parentOf({ holding: 'absent' }), fy(2027, 'p'));
    expect(truth(waiting, 'CSRD-S-021', 'p')).toBe('INDETERMINATE');
    expect(det(waiting, 'CSRD-S-021', 'p').needs.map((n) => n.factType)).toContain(HOLDING);
    expect(questionIds(waiting)).toContain('Q-045');
    // Answered: the duty resolves and the question is no longer offered.
    const answered = assess(pack(), parentOf({ holding: false }), fy(2027, 'p'));
    expect(truth(answered, 'CSRD-S-021', 'p')).toBe('APPLIES');
    expect(questionIds(answered)).not.toContain('Q-045');
    // A standalone has no consolidated duty for the option to touch.
    const alone = assess(pack(), standalone({ turnover: 520_000_000, employees: 1350 }), fy(2027, 'e1'));
    expect(truth(alone, 'CSRD-S-021', 'e1')).toBe('DOES_NOT_APPLY');
    expect(questionIds(alone)).not.toContain('Q-045');
  });

  it('the option questions follow a stated holding, and only then', () => {
    const holding = assess(pack(), parentOf({ holding: true }), fy(2027, 'p'));
    expect(truth(holding, 'CSRD-S-021', 'p')).toBe('INDETERMINATE');
    expect(questionIds(holding)).toContain('Q-046');
    expect(questionIds(assess(pack(), parentOf({ holding: false }), fy(2027, 'p')))).not.toContain('Q-046');
  });

  it('the first-wave identity questions are offered for a FY2025 entity whose first application is open, and not at FY2027', () => {
    const open = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, transitionOption: false }), fy(2025, 'e1'));
    expect(truth(open, 'CSRD-S-017', 'e1')).toBe('INDETERMINATE');
    expect(questionIds(open)).toEqual(expect.arrayContaining(['Q-040', 'Q-041']));
    const later = assess(pack(), standalone({ turnover: 200_000_000, employees: 700 }), fy(2027, 'e1'));
    expect(truth(later, 'CSRD-S-017', 'e1')).toBe('DOES_NOT_APPLY');
    expect(questionIds(later)).not.toContain('Q-040');
    expect(questionIds(later)).not.toContain('Q-041');
  });

  it('the coverage and disclosure questions follow an included intermediate parent', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: 'absent', disclosures: 'absent' }), fy(2027, 'p'));
    expect(questionIds(r)).toEqual(expect.arrayContaining(['Q-043', 'Q-044']));
    const covered = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'DE', reportStandard: 'ESRS', disclosures: 'absent' }), fy(2027, 'sub'));
    // A subsidiary with no subsidiaries of its own is never asked about them —
    // but it is asked about its own disclosures (Article 19a(9)(a)), and about the
    // reporting parent's country when that is unknown.
    expect(questionIds(covered)).not.toContain('Q-043');
    expect(questionIds(covered)).toContain('Q-044');
    const noCountry = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'absent', reportStandard: 'ESRS' }), fy(2027, 'sub'));
    expect(questionIds(noCountry)).toContain('Q-047');
  });

  it('the Article 37 alternative is asked only once the disclosures are stated as not made, and the third-country questions follow the reporting parent, not the ultimate one', () => {
    const undisclosed = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'DE', reportStandard: 'ESRS', disclosures: false }), fy(2027, 'sub'));
    expect(questionIds(undisclosed)).toContain('Q-048');
    const disclosed = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'DE', reportStandard: 'ESRS', disclosures: true }), fy(2027, 'sub'));
    expect(questionIds(disclosed)).not.toContain('Q-048');
    // Q-016 (assurance and Taxonomy information) concerns a third-country *reporting* parent.
    const thirdCountryReporter = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'US', reportStandard: 'EQUIVALENT' }), fy(2027, 'sub'));
    expect(questionIds(thirdCountryReporter)).toContain('Q-016');
    const euReporter = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'US', reportingParentCountry: 'DE', reportStandard: 'ESRS' }), fy(2027, 'sub'));
    expect(questionIds(euReporter)).not.toContain('Q-016');
  });
});

// ---------------------------------------------------------------------------
// 3. The timing requirements, as authored and as they decide
// ---------------------------------------------------------------------------

describe('CSRD-S-017 and CSRD-S-018 as authored: two routes, the exclusion tested on the first-wave one and inherited on the other', () => {
  it.each([
    ['CSRD-S-017', 'CSRD-S-001', 'entity.avg_employees', LARGE, '(a)(i)', '(b)(i)'],
    ['CSRD-S-018', 'CSRD-S-002', 'group.avg_employees', LARGE_GROUP, '(a)(ii)', '(b)(ii)'],
  ])('%s: ANY(first-wave criteria for 2024–2026 with the Article 1(4) exclusion, the 2027 date with %s)', (id, sizeTest, employees, large, pointA, pointB) => {
    const req = requirement(id);
    expect(req.relationshipClass).toBe('timing_context');
    expect(req.version).toBe(1);
    const routes = anyOf(conditionOf(req));
    expect(routes).toHaveLength(2);
    const a = allOf(routes[0]!);
    // The exclusion is tested where nothing else would test it; the 2027 route
    // reaches it through the size test (E), and restating it there would count
    // one open question twice in the interview ranking.
    expect(a).toContainEqual(EXCLUDED_BRANCH);
    expect(JSON.stringify(routes[1])).not.toContain(EXCLUSION);
    expect(a).toContainEqual({ op: 'fy_start_year_in', years: [2024, 2025, 2026] });
    expect(a).toContainEqual({ op: 'in_catalogue', fact: 'entity.incorporation_country', catalogue: 'eu_member_states' });
    expect(a).toContainEqual({ op: 'in_catalogue', fact: 'entity.legal_form', catalogue: 'accounting_directive_forms' });
    expect(a).toContainEqual({ op: 'eq', fact: PIE, value: true });
    expect(a).toContainEqual({ op: 'eq', fact: large, value: true });
    expect(a).toContainEqual({ op: 'cmp', fact: employees, cmp: 'gt', value: 500 });
    // The first-wave route never references the new-threshold size test.
    expect(referencedRequirements(routes[0]!)).toEqual([]);
    const b = allOf(routes[1]!);
    expect(b).toEqual([
      { op: 'fy_starts_on_or_after', date: '2027-01-01' },
      { op: 'requirement_ref', requirement: sizeTest, expect: 'APPLIES' },
    ]);
    expect(req.provenance.map((p) => p.sourceId)).toEqual(['SRC-002', 'SRC-001']);
    expect(locatorTexts(req)).toEqual([`Article 5(2), first subparagraph, point ${pointA}`, `Article 5(2), first subparagraph, point ${pointB}`, 'Article 1(4)']);
  });

  it('CSRD-S-018 also requires the undertaking to be a parent on the first-wave route', () => {
    expect(allOf(anyOf(conditionOf(requirement('CSRD-S-018')))[0]!)).toContainEqual({ op: 'eq', fact: 'entity.is_parent_undertaking', value: true });
  });

  it('CSRD-S-022 is the fifth-subparagraph derogation on a consolidated basis', () => {
    const req = requirement('CSRD-S-022');
    expect(req.relationshipClass).toBe('direct_legal_exemption');
    const top = allOf(conditionOf(req));
    expect(top).toContainEqual({ op: 'fy_start_year_in', years: [2025, 2026] });
    expect(top).toContainEqual({ op: 'eq', fact: 'entity.member_state_transition_option', value: true });
    expect(top.some((c) => c.op === 'any' && c.of.some((x) => JSON.stringify(x).includes('group.consolidated_net_turnover_eur')) && c.of.some((x) => JSON.stringify(x).includes('group.avg_employees')))).toBe(true);
    expect(locatorTexts(req)).toEqual(['Article 5(2), fifth subparagraph']);
    expect(req.provenance.map((p) => p.sourceId)).toEqual(['SRC-002']);
  });
});

describe('first application, by route and financial year', () => {
  it('row 3 — a FY2026 group above the new thresholds that is not a public-interest entity has no consolidated first application yet', () => {
    const r = assess(pack(), parentOf({ pie: false, transitionOption: false }), fy(2026, 'p'));
    expect(truth(r, 'CSRD-S-002', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-018', 'p')).toBe('DOES_NOT_APPLY');
    expect(det(r, 'CSRD-S-018', 'p').reason).toBeUndefined();
  });

  it('rows 4 and 5 — a FY2026 first-wave public-interest-entity parent of a large group with 800 employees is in, and only the exercised national derogation relieves it', () => {
    const exercised = assess(pack(), parentOf({ pie: true, largeGroup: true, groupEmployees: 800, groupTurnover: 300_000_000, transitionOption: true }), fy(2026, 'p'));
    expect(truth(exercised, 'CSRD-S-002', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(exercised, 'CSRD-S-018', 'p')).toBe('APPLIES');
    expect(truth(exercised, 'CSRD-S-022', 'p')).toBe('APPLIES');
    const notExercised = assess(pack(), parentOf({ pie: true, largeGroup: true, groupEmployees: 800, groupTurnover: 300_000_000, transitionOption: false }), fy(2026, 'p'));
    expect(truth(notExercised, 'CSRD-S-018', 'p')).toBe('APPLIES');
    expect(truth(notExercised, 'CSRD-S-022', 'p')).toBe('DOES_NOT_APPLY');
  });

  it('row 6 — from FY2027 the consolidated route follows the size test, whatever the public-interest status', () => {
    const r = assess(pack(), parentOf({}), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-018', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-022', 'p')).toBe('DOES_NOT_APPLY');
  });

  it('rows 9 and 10 — a standalone first-wave public-interest entity with 700 employees and EUR 200 million is in for FY2025 and out from FY2027', () => {
    const early = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, pie: true, large: true, transitionOption: false }), fy(2025, 'e1'));
    expect(truth(early, 'CSRD-S-001', 'e1')).toBe('DOES_NOT_APPLY');
    expect(truth(early, 'CSRD-S-017', 'e1')).toBe('APPLIES');
    expect(truth(early, 'CSRD-S-004', 'e1')).toBe('DOES_NOT_APPLY');
    const later = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, pie: true, large: true }), fy(2027, 'e1'));
    expect(truth(later, 'CSRD-S-017', 'e1')).toBe('DOES_NOT_APPLY');
    expect(det(later, 'CSRD-S-017', 'e1').reason).toBeUndefined();
  });

  it('row 11 — an unanswered public-interest status or size category for FY2024–26 leaves first application unresolved, naming the fact', () => {
    const noPie = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, large: true, transitionOption: false }), fy(2025, 'e1'));
    const d = det(noPie, 'CSRD-S-017', 'e1');
    expect(d.result).toBe('INDETERMINATE');
    expect(d.reason).toBe('missing_fact');
    expect(d.needs.map((n) => n.factType)).toContain(PIE);
    const noSize = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, pie: true, transitionOption: false }), fy(2025, 'e1'));
    expect(truth(noSize, 'CSRD-S-017', 'e1')).toBe('INDETERMINATE');
    expect(det(noSize, 'CSRD-S-017', 'e1').needs.map((n) => n.factType)).toContain(LARGE);
    // The size category is a stated status: figures above EUR 50 million and 250 employees do not stand in for it.
    expect(det(noSize, 'CSRD-S-017', 'e1').needs.map((n) => n.factType)).not.toContain('entity.net_turnover_eur');
  });

  it('row 12 — an Article 1(4) exclusion takes the undertaking out of both routes in every year', () => {
    const earlyWave = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, pie: true, large: true, excluded: true }), fy(2025, 'e1'));
    expect(truth(earlyWave, 'CSRD-S-017', 'e1')).toBe('DOES_NOT_APPLY');
    const later = assess(pack(), parentOf({ excluded: true, entityTurnover: 520_000_000, entityEmployees: 1350 }), fy(2027, 'p'));
    expect(truth(later, 'CSRD-S-001', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(later, 'CSRD-S-002', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(later, 'CSRD-S-017', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(later, 'CSRD-S-018', 'p')).toBe('DOES_NOT_APPLY');
    // And an unknown exclusion status is unresolved, never read as not excluded.
    const unknown = assess(pack(), parentOf({ excluded: 'absent' }), fy(2027, 'p'));
    expect(truth(unknown, 'CSRD-S-018', 'p')).toBe('INDETERMINATE');
  });
});

// ---------------------------------------------------------------------------
// 4. Coverage of the undertaking and its subsidiaries
// ---------------------------------------------------------------------------

describe('CSRD-S-005 and CSRD-S-006 version 4: the undertaking and its subsidiary undertakings', () => {
  it('a subsidiary with no subsidiaries of its own is exempted on its own inclusion, as before', () => {
    const eu = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'DE', reportStandard: 'ESRS' }), fy(2027, 'sub'));
    expect(truth(eu, 'CSRD-S-005', 'sub')).toBe('APPLIES');
    const thirdCountry = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'US', reportingParentCountry: 'US', reportStandard: 'EQUIVALENT', assurance: true, taxonomy: true }), fy(2027, 'sub'));
    expect(truth(thirdCountry, 'CSRD-S-006', 'sub')).toBe('APPLIES');
  });

  it('an intermediate parent whose own subsidiaries are not included is not exempted on its own inclusion (row 1, corrected)', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: false }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-005', 'p')).toBe('DOES_NOT_APPLY');
    expect(det(r, 'CSRD-S-005', 'p').reason).toBeUndefined();
    const third = assess(pack(), intermediate({ includesAllSubsidiaries: false, ultimateParentCountry: 'US', reportingParentCountry: 'US', assurance: true, taxonomy: true }), fy(2027, 'p'));
    expect(truth(third, 'CSRD-S-006', 'p')).toBe('DOES_NOT_APPLY');
  });

  it('coverage of the subsidiaries left unanswered leaves the exemption unresolved, naming the fact', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: 'absent' }), fy(2027, 'p'));
    const d = det(r, 'CSRD-S-005', 'p');
    expect(d.result).toBe('INDETERMINATE');
    expect(d.needs.map((n) => n.factType)).toContain(ALL_SUBS);
  });

  it.each(['CSRD-S-005', 'CSRD-S-006'])('%s as authored: the coverage ANY follows the inclusion conjunct, at version 4, its version-3 digest kept', (id) => {
    const req = authoredOne(id);
    expect(req.version).toBe(4);
    const top = allOf(conditionOf(req));
    const inclusion = top.findIndex((c) => c.op === 'eq' && c.fact === 'parent.report_includes_entity');
    expect(inclusion).toBeGreaterThan(-1);
    expect(top[inclusion + 1]).toEqual({
      op: 'any',
      of: [
        { op: 'eq', fact: 'entity.is_parent_undertaking', value: false },
        { op: 'eq', fact: ALL_SUBS, value: true },
      ],
    });
    // The exemption turns on the *reporting* parent's country, never the ultimate parent's.
    const countryConjunct = id === 'CSRD-S-005'
      ? { op: 'in_catalogue', fact: REPORTING_PARENT, catalogue: 'eu_member_states' }
      : { op: 'not', of: { op: 'in_catalogue', fact: REPORTING_PARENT, catalogue: 'eu_member_states' } };
    expect(top).toContainEqual(countryConjunct);
    expect(JSON.stringify(top)).not.toContain('group.ultimate_parent_country');
    // The second-subparagraph disclosures, or the Article 37 alternative — stated, either way.
    expect(top).toContainEqual({ op: 'any', of: [{ op: 'eq', fact: DISCLOSURES, value: true }, { op: 'eq', fact: ARTICLE_37, value: true }] });
    expect(locatorTexts(req)).toEqual(['Article 19a(9)']);
    expect(registry()[id]?.['4']).toBe(requirementSha256(req as Requirement));
    expect(registry()[id]?.['3']).toBe(id === 'CSRD-S-005' ? 'be1b2c217043c0a2231a51da95abb568f4a5bae5486acbd687e56a462227c781' : '452921f804f002fdfd9c63db2012d0cba52027f800d4371fb27656f51334e0d6');
  });
});

describe('the Article 19a(9) disclosures are a condition of the individual exemption, with the Article 37 alternative stated and never assumed', () => {
  const eu = (o: { disclosures: Tri; article37?: Tri }) => coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'DE', reportStandard: 'ESRS', ...o });
  const third = (o: { disclosures: Tri; article37?: Tri }) => coveredSubsidiary({ ultimateParentCountry: 'US', reportingParentCountry: 'US', reportStandard: 'EQUIVALENT', assurance: true, taxonomy: true, ...o });

  it.each([
    ['CSRD-S-005', 'an EU reporting parent', eu],
    ['CSRD-S-006', 'a third-country reporting parent', third],
  ] as const)('%s, %s: disclosures made → exempt; not made and no Article 37 alternative → not exempt; unanswered → unresolved, naming the disclosures', (id, _label, build) => {
    expect(truth(assess(pack(), build({ disclosures: true }), fy(2027, 'sub')), id, 'sub')).toBe('APPLIES');
    const refused = det(assess(pack(), build({ disclosures: false, article37: false }), fy(2027, 'sub')), id, 'sub');
    expect(refused.result).toBe('DOES_NOT_APPLY');
    expect(refused.reason).toBeUndefined();
    const open = det(assess(pack(), build({ disclosures: 'absent' }), fy(2027, 'sub')), id, 'sub');
    expect(open.result).toBe('INDETERMINATE');
    expect(open.needs.map((n) => n.factType)).toContain(DISCLOSURES);
  });

  it.each([
    ['CSRD-S-005', eu],
    ['CSRD-S-006', third],
  ] as const)('%s: an undertaking exempted under Article 37 that publishes the consolidated management report need not carry the disclosures — but that is a stated fact, never assumed from their absence', (id, build) => {
    expect(truth(assess(pack(), build({ disclosures: false, article37: true }), fy(2027, 'sub')), id, 'sub')).toBe('APPLIES');
    const unstated = det(assess(pack(), build({ disclosures: false }), fy(2027, 'sub')), id, 'sub');
    expect(unstated.result).toBe('INDETERMINATE');
    expect(unstated.needs.map((n) => n.factType)).toEqual([ARTICLE_37]);
  });
});

describe('the reporting parent\'s country decides the exemption route; the ultimate parent\'s country decides the Article 40a route', () => {
  it('an EU reporting parent below a third-country ultimate parent: the Articles 29/29a sentence, S-005 and not S-006', () => {
    const r = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'US', reportingParentCountry: 'DE', reportStandard: 'ESRS' }), fy(2027, 'sub'));
    expect(truth(r, 'CSRD-S-005', 'sub')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-006', 'sub')).toBe('DOES_NOT_APPLY');
    const p = assess(pack(), intermediate({ includesAllSubsidiaries: true, ultimateParentCountry: 'US', reportingParentCountry: 'DE' }), fy(2027, 'p'));
    expect(truth(p, 'CSRD-S-019', 'p')).toBe('APPLIES');
  });

  it('a third-country reporting parent below an EU ultimate parent: the third-country sentence, S-006 and not S-005, with assurance and the Taxonomy information', () => {
    const r = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'US', reportStandard: 'EQUIVALENT', assurance: true, taxonomy: true }), fy(2027, 'sub'));
    expect(truth(r, 'CSRD-S-006', 'sub')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-005', 'sub')).toBe('DOES_NOT_APPLY');
    const p = assess(pack(), intermediate({ includesAllSubsidiaries: true, ultimateParentCountry: 'DE', reportingParentCountry: 'US', reportStandard: 'EQUIVALENT', assurance: true, taxonomy: true }), fy(2027, 'p'));
    expect(truth(p, 'CSRD-S-019', 'p')).toBe('APPLIES');
  });

  it('an unknown reporting-parent country leaves all three exemptions unresolved, naming it — it is never inferred from the ultimate parent', () => {
    const r = assess(pack(), coveredSubsidiary({ ultimateParentCountry: 'DE', reportingParentCountry: 'absent', reportStandard: 'ESRS', assurance: true, taxonomy: true }), fy(2027, 'sub'));
    for (const id of ['CSRD-S-005', 'CSRD-S-006']) {
      expect(truth(r, id, 'sub'), id).toBe('INDETERMINATE');
      expect(det(r, id, 'sub').needs.map((n) => n.factType), id).toContain(REPORTING_PARENT);
    }
    const p = assess(pack(), intermediate({ includesAllSubsidiaries: true, reportingParentCountry: 'absent', assurance: true, taxonomy: true }), fy(2027, 'p'));
    expect(truth(p, 'CSRD-S-019', 'p')).toBe('INDETERMINATE');
    expect(det(p, 'CSRD-S-019', 'p').needs.map((n) => n.factType)).toContain(REPORTING_PARENT);
  });

  it('the Article 40a route still turns on the ultimate parent: a third-country group whose EU intermediate parent reports is still a third-country group', () => {
    // P-006's shape, with an EU reporting parent stated beside the US ultimate parent.
    const profile = new ProfileBuilder()
      .org('grp', 'Lakeshore Holdings Inc. group')
      .euEntity('sub', 'Lakeshore Europe GmbH', 'DE', { parentId: 'grp', isSubsidiary: true })
      .str('grp', 'group.ultimate_parent_country', 'US')
      .str('grp', REPORTING_PARENT, 'DE')
      .num('grp', 'third_country.eu_turnover_year_1_eur', 480_000_000)
      .num('grp', 'third_country.eu_turnover_year_2_eur', 470_000_000)
      .bool('grp', 'third_country.qualifying_eu_subsidiary_exists', true)
      .num('sub', 'third_country.eu_subsidiary_turnover_eur', 240_000_000)
      .num('sub', 'entity.net_turnover_eur', 240_000_000)
      .num('sub', 'entity.avg_employees', 600)
      .str('sub', 'entity.governing_member_state', 'DE')
      .bool('sub', EXCLUSION, false)
      .build();
    const r = assess(pack(), profile, fy(2028, 'grp'));
    expect(truth(r, 'CSRD-S-007', 'grp')).toBe('APPLIES');
    expect(JSON.stringify(conditionOf(requirement('CSRD-S-007')))).toContain('group.ultimate_parent_country');
    expect(JSON.stringify(conditionOf(requirement('CSRD-S-007')))).not.toContain(REPORTING_PARENT);
  });
});

describe('CSRD-S-019: the consolidated exemption of Article 29a(8) and (9)', () => {
  it('row 2 — a higher EU parent covering the whole sub-group, with the disclosures made, exempts the intermediate parent', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: true }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('APPLIES');
    expect(det(r, 'CSRD-S-019', 'p').reason).toBeUndefined();
  });

  it('row 1 — inclusion of the parent alone, with its subsidiaries outside the higher report, never exempts', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: false }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('DOES_NOT_APPLY');
    expect(det(r, 'CSRD-S-019', 'p').reason).toBeUndefined();
  });

  it('row 7 — a public-interest-entity intermediate parent is exempted on the same conditions (Article 29a(9))', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: true, pie: true }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('APPLIES');
  });

  it('the third-country sentence: a qualifying parent report under ESRS or an equivalent standard, with assurance and the Taxonomy information', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: true, ultimateParentCountry: 'US', reportingParentCountry: 'US', reportStandard: 'EQUIVALENT', assurance: true, taxonomy: true }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('APPLIES');
    const noAssurance = assess(pack(), intermediate({ includesAllSubsidiaries: true, ultimateParentCountry: 'US', reportingParentCountry: 'US', reportStandard: 'EQUIVALENT', assurance: false, taxonomy: true }), fy(2027, 'p'));
    expect(truth(noAssurance, 'CSRD-S-019', 'p')).toBe('DOES_NOT_APPLY');
  });

  it('the disclosures of the second subparagraph are a condition: unanswered, the exemption is unresolved; not made, it is refused unless the Article 37 alternative is stated', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: true, disclosures: 'absent' }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('INDETERMINATE');
    expect(det(r, 'CSRD-S-019', 'p').needs.map((n) => n.factType)).toContain(DISCLOSURES);
    expect(truth(assess(pack(), intermediate({ includesAllSubsidiaries: true, disclosures: false, article37: false }), fy(2027, 'p')), 'CSRD-S-019', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(assess(pack(), intermediate({ includesAllSubsidiaries: true, disclosures: false, article37: true }), fy(2027, 'p')), 'CSRD-S-019', 'p')).toBe('APPLIES');
    expect(truth(assess(pack(), intermediate({ includesAllSubsidiaries: true, disclosures: false }), fy(2027, 'p')), 'CSRD-S-019', 'p')).toBe('INDETERMINATE');
  });

  it('a parent that is not itself a subsidiary has nothing to be exempted from under Article 29a(8)', () => {
    expect(truth(assess(pack(), parentOf({}), fy(2027, 'p')), 'CSRD-S-019', 'p')).toBe('DOES_NOT_APPLY');
  });

  it('as authored: version 1, the four gates then the two kinds of higher report, cited to Article 29a(8) and (9), with no public-interest carve-out', () => {
    const req = requirement('CSRD-S-019');
    expect(req.version).toBe(1);
    expect(req.relationshipClass).toBe('direct_legal_exemption');
    const top = allOf(conditionOf(req));
    expect(top.slice(0, 4)).toEqual([
      { op: 'eq', fact: 'entity.is_parent_undertaking', value: true },
      { op: 'eq', fact: 'entity.is_subsidiary', value: true },
      { op: 'eq', fact: 'parent.report_includes_entity', value: true },
      { op: 'eq', fact: ALL_SUBS, value: true },
    ]);
    expect(top).toContainEqual({ op: 'any', of: [{ op: 'eq', fact: DISCLOSURES, value: true }, { op: 'eq', fact: ARTICLE_37, value: true }] });
    expect(top).toContainEqual({ op: 'exists', fact: 'parent.report_public_url' });
    expect(JSON.stringify(conditionOf(req))).toContain(REPORTING_PARENT);
    expect(JSON.stringify(conditionOf(req))).not.toContain('group.ultimate_parent_country');
    expect(JSON.stringify(conditionOf(req))).not.toContain(PIE);
    expect(locatorTexts(req)).toEqual(['Article 29a(8)', 'Article 29a(9)']);
    expect(req.provenance.map((p) => p.sourceId)).toEqual(['SRC-001']);
  });
});

describe('CSRD-S-023: the Article 29a(7a) option, deferred but never assumed', () => {
  it('a standalone is definitively untouched by the option', () => {
    expect(truth(assess(pack(), standalone({ turnover: 520_000_000, employees: 1350 }), fy(2027, 'e1')), 'CSRD-S-023', 'e1')).toBe('DOES_NOT_APPLY');
  });

  it('a parent whose holding status is unknown leaves the bracket, and with it the consolidated duty, unresolved', () => {
    const r = assess(pack(), parentOf({ holding: 'absent' }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-023', 'p')).toBe('INDETERMINATE');
    // An ALL names every open conjunct, so the option facts are listed beside the holding status; the holding question is the one offered (Q-045).
    expect(det(r, 'CSRD-S-023', 'p').needs.map((n) => n.factType)).toContain(HOLDING);
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('INDETERMINATE');
  });

  it('a parent that is not a financial holding undertaking is out of the bracket, and its consolidated duty stands', () => {
    const r = assess(pack(), parentOf({ holding: false }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-023', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('APPLIES');
  });

  it('a financial holding undertaking that has exercised the option over independent subsidiaries is relieved; one whose option is unanswered is not assumed either way', () => {
    const relieved = assess(pack(), parentOf({ holding: true, independent: true, option: true }), fy(2027, 'p'));
    expect(truth(relieved, 'CSRD-S-023', 'p')).toBe('APPLIES');
    expect(truth(relieved, 'CSRD-S-021', 'p')).toBe('DOES_NOT_APPLY');
    const open = assess(pack(), parentOf({ holding: true }), fy(2027, 'p'));
    expect(truth(open, 'CSRD-S-023', 'p')).toBe('INDETERMINATE');
    expect(det(open, 'CSRD-S-023', 'p').needs.map((n) => n.factType).sort()).toEqual([OPTION, INDEPENDENT].sort());
    expect(truth(open, 'CSRD-S-021', 'p')).toBe('INDETERMINATE');
  });

  it('as authored: four stated conditions, cited to Article 29a(7a) and the Article 2(15) definition, and a caution that names what is deferred', () => {
    const req = requirement('CSRD-S-023');
    expect(req.version).toBe(1);
    expect(allOf(conditionOf(req))).toEqual([
      { op: 'eq', fact: 'entity.is_parent_undertaking', value: true },
      { op: 'eq', fact: HOLDING, value: true },
      { op: 'eq', fact: INDEPENDENT, value: true },
      { op: 'eq', fact: OPTION, value: true },
    ]);
    expect(locatorTexts(req)).toEqual(['Article 29a(7a)', 'Article 2(15)']);
    expect(req.caution).toMatch(/CSRD-S-013/);
    expect(req.caution).toMatch(/deferred/i);
  });
});

// ---------------------------------------------------------------------------
// 5. The composition, per route
// ---------------------------------------------------------------------------

describe('the composition: CSRD-S-020, CSRD-S-021 and CSRD-S-014 version 4', () => {
  it('each route composes its own timing with its own exemptions, and the duty is their disjunction', () => {
    const s020 = requirement('CSRD-S-020');
    const s021 = requirement('CSRD-S-021');
    const s014 = requirement('CSRD-S-014');
    expect(conditionOf(s020)).toEqual({
      op: 'all',
      of: [
        { op: 'requirement_ref', requirement: 'CSRD-S-017', expect: 'APPLIES' },
        { op: 'not', of: { op: 'any', of: [
          { op: 'requirement_ref', requirement: 'CSRD-S-004', expect: 'APPLIES' },
          { op: 'requirement_ref', requirement: 'CSRD-S-005', expect: 'APPLIES' },
          { op: 'requirement_ref', requirement: 'CSRD-S-006', expect: 'APPLIES' },
        ] } },
      ],
    });
    expect(conditionOf(s021)).toEqual({
      op: 'all',
      of: [
        { op: 'requirement_ref', requirement: 'CSRD-S-018', expect: 'APPLIES' },
        { op: 'not', of: { op: 'any', of: [
          { op: 'requirement_ref', requirement: 'CSRD-S-022', expect: 'APPLIES' },
          { op: 'requirement_ref', requirement: 'CSRD-S-019', expect: 'APPLIES' },
          { op: 'requirement_ref', requirement: 'CSRD-S-023', expect: 'APPLIES' },
        ] } },
      ],
    });
    expect(conditionOf(s014)).toEqual({
      op: 'any',
      of: [
        { op: 'requirement_ref', requirement: 'CSRD-S-020', expect: 'APPLIES' },
        { op: 'requirement_ref', requirement: 'CSRD-S-021', expect: 'APPLIES' },
      ],
    });
    expect(s014.version).toBe(4);
    for (const r of [s020, s021, s014]) {
      expect(r.decisionArea, r.id).toBe('Reporting duty');
      expect(r.relationshipClass, r.id).toBe('direct_legal');
      expect(r.severity, r.id).toBe('critical');
    }
    // The size tests enter only through the timing requirements' point (b) route.
    expect(referencedRequirements(conditionOf(s020))).not.toContain('CSRD-S-001');
    expect(referencedRequirements(conditionOf(s021))).not.toContain('CSRD-S-002');
  });

  it('S-003, the FY2024 reporting history, is composed into nothing: history never substitutes for eligibility', () => {
    for (const r of pack().requirements) {
      if (r.condition === undefined) continue;
      expect(referencedRequirements(r.condition), r.id).not.toContain('CSRD-S-003');
    }
    expect(requirement('CSRD-S-003').relationshipClass).toBe('timing_context');
  });

  it('the national-law gate stays at the summary boundary, not inside either duty', () => {
    for (const id of ['CSRD-S-020', 'CSRD-S-021', 'CSRD-S-014']) {
      expect(referencedRequirements(conditionOf(requirement(id))), id).not.toContain('CSRD-S-013');
    }
    const r = assess(pack(), parentOf({}), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('APPLIES');
    expect(r.summary.nationalLawResolved).toBe(false);
    expect(r.summary.statusFlags).toContain('national_review_required');
  });
});

describe('the twelve counterexamples, end to end', () => {
  it('row 1 — P included, S2 not: neither exemption is established, and both duties stand', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: false }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-005', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-020', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-014', 'p')).toBe('APPLIES');
    expect(obligationIds(r)).toContain('O-001');
    expect(obligationIds(r)).not.toContain('O-011');
  });

  it('row 2 — the whole sub-group covered and the disclosures made: both exemptions, no duty, the maintenance obligation', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: true }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-005', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-020', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-014', 'p')).toBe('DOES_NOT_APPLY');
    expect(obligationIds(r)).toContain('O-011');
    expect(obligationIds(r)).not.toContain('O-001');
    expect(r.summary.statusFlags).toContain('in_scope_but_exempt');
    expect(r.summary.statusFlags).not.toContain('no_direct_duty_identified');
  });

  it('row 2b — the sub-group covered but the disclosures not made and no Article 37 alternative: neither exemption, both duties', () => {
    // Articles 19a(9) and 29a(8) both make the disclosures a condition; the
    // Article 37 alternative is stated, and here stated as not applying.
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: true, disclosures: false, article37: false }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-005', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-020', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-014', 'p')).toBe('APPLIES');
  });

  it('row 2c — the sub-group covered, the disclosures not made, the Article 37 alternative stated: both exemptions', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: true, disclosures: false, article37: true }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-005', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-019', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-014', 'p')).toBe('DOES_NOT_APPLY');
  });

  it('row 5b — the individual derogation never relieves the consolidated duty: a FY2026 first-wave parent individually below the new thresholds with the national option exercised, its group above them', () => {
    const r = assess(pack(), parentOf({ entityTurnover: 300_000_000, entityEmployees: 700, pie: true, largeGroup: true, transitionOption: true }), fy(2026, 'p'));
    expect(truth(r, 'CSRD-S-004', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-022', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-014', 'p')).toBe('APPLIES');
  });

  it('row 3 — FY2026, above the new thresholds, not a public-interest entity: threshold in scope, no duty yet, no silent unknown', () => {
    const r = assess(pack(), parentOf({ pie: false, transitionOption: false }), fy(2026, 'p'));
    expect(truth(r, 'CSRD-S-002', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-014', 'p')).toBe('DOES_NOT_APPLY');
    expect(r.summary.statusFlags).toContain('threshold_in_scope');
    expect(r.summary.statusFlags).not.toContain('reporting_duty_active');
    expect(obligationIds(r)).not.toContain('O-001');
  });

  it('rows 4 and 5 — the FY2026 first-wave parent: relieved only where the national derogation was exercised', () => {
    const exercised = assess(pack(), parentOf({ pie: true, largeGroup: true, groupEmployees: 800, groupTurnover: 300_000_000, transitionOption: true }), fy(2026, 'p'));
    expect(truth(exercised, 'CSRD-S-021', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(exercised, 'CSRD-S-014', 'p')).toBe('DOES_NOT_APPLY');
    expect(obligationIds(exercised)).toContain('O-010');
    const notExercised = assess(pack(), parentOf({ pie: true, largeGroup: true, groupEmployees: 800, groupTurnover: 300_000_000, transitionOption: false }), fy(2026, 'p'));
    expect(truth(notExercised, 'CSRD-S-021', 'p')).toBe('APPLIES');
    expect(truth(notExercised, 'CSRD-S-014', 'p')).toBe('APPLIES');
    expect(obligationIds(notExercised)).toContain('O-001');
  });

  it('row 6 — FY2027, above the thresholds: the consolidated duty', () => {
    const r = assess(pack(), parentOf({}), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-014', 'p')).toBe('APPLIES');
  });

  it('row 7 — a public-interest-entity intermediate parent fully covered: exempted', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: true, pie: true }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-014', 'p')).toBe('DOES_NOT_APPLY');
  });

  it('row 8 — E covered individually but heading an uncovered sub-group: neither exemption, both duties (corrected)', () => {
    const r = assess(pack(), intermediate({ includesAllSubsidiaries: false }), fy(2027, 'p'));
    expect(truth(r, 'CSRD-S-001', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-002', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-005', 'p')).toBe('DOES_NOT_APPLY');
    expect(truth(r, 'CSRD-S-020', 'p')).toBe('APPLIES');
    expect(truth(r, 'CSRD-S-021', 'p')).toBe('APPLIES');
  });

  it('rows 9 and 10 — the standalone first-wave public-interest entity: a FY2025 duty, none from FY2027', () => {
    const early = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, pie: true, large: true, transitionOption: false }), fy(2025, 'e1'));
    expect(truth(early, 'CSRD-S-020', 'e1')).toBe('APPLIES');
    expect(truth(early, 'CSRD-S-014', 'e1')).toBe('APPLIES');
    expect(obligationIds(early)).toContain('O-001');
    const later = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, pie: true, large: true }), fy(2027, 'e1'));
    expect(truth(later, 'CSRD-S-020', 'e1')).toBe('DOES_NOT_APPLY');
    expect(truth(later, 'CSRD-S-014', 'e1')).toBe('DOES_NOT_APPLY');
  });

  it('row 11 — an unanswered first-wave fact or coverage fact leaves the duty unresolved, never a silent "no duty"', () => {
    const r = assess(pack(), standalone({ turnover: 200_000_000, employees: 700, large: true, transitionOption: false }), fy(2025, 'e1'));
    expect(truth(r, 'CSRD-S-020', 'e1')).toBe('INDETERMINATE');
    expect(truth(r, 'CSRD-S-014', 'e1')).toBe('INDETERMINATE');
    expect(det(r, 'CSRD-S-014', 'e1').needs.map((n) => n.factType)).toContain(PIE);
    expect(r.summary.statusFlags).toContain('unresolved_items');
    expect(r.summary.statusFlags).not.toContain('no_direct_duty_identified');
    const coverage = assess(pack(), intermediate({ includesAllSubsidiaries: 'absent' }), fy(2027, 'p'));
    expect(truth(coverage, 'CSRD-S-020', 'p')).toBe('INDETERMINATE');
    expect(truth(coverage, 'CSRD-S-021', 'p')).toBe('INDETERMINATE');
  });

  it('row 12 — an excluded undertaking has no duty on any route, definitively', () => {
    const r = assess(pack(), parentOf({ excluded: true, entityTurnover: 520_000_000, entityEmployees: 1350 }), fy(2027, 'p'));
    for (const id of ['CSRD-S-017', 'CSRD-S-018', 'CSRD-S-020', 'CSRD-S-021', 'CSRD-S-014']) {
      expect(truth(r, id, 'p'), id).toBe('DOES_NOT_APPLY');
      expect(det(r, id, 'p').reason, id).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The version registry
// ---------------------------------------------------------------------------

describe('the version registry after the composition', () => {
  const NEW = ['CSRD-S-017', 'CSRD-S-018', 'CSRD-S-019', 'CSRD-S-020', 'CSRD-S-021', 'CSRD-S-022', 'CSRD-S-023'];

  it('binds the seven new requirements at version 1 and the three re-authored ones at version 4, by the engine’s own digest', () => {
    const reg = registry();
    for (const id of NEW) {
      const r = authoredOne(id);
      expect(r.version, id).toBe(1);
      expect(Object.keys(reg[id] ?? {}), id).toEqual(['1']);
      expect(reg[id]?.['1'], id).toBe(requirementSha256(r as Requirement));
    }
    for (const id of ['CSRD-S-005', 'CSRD-S-006', 'CSRD-S-014']) {
      const r = authoredOne(id);
      expect(r.version, id).toBe(4);
      expect(Object.keys(reg[id] ?? {}).sort(), id).toEqual(['1', '2', '3', '4']);
      expect(reg[id]?.['4'], id).toBe(requirementSha256(r as Requirement));
    }
    // The version-3 digests the registry bound before this change, verbatim.
    expect(reg['CSRD-S-014']?.['3']).toBe('d9ced936383882d7522a0eb82fb627bb1d13b56245cdb30fafecf488a85a1be0');
    // Controls: the size tests and the next requirement untouched.
    expect(Object.keys(reg['CSRD-S-001'] ?? {}).sort()).toEqual(['1', '2', '3', '4']);
    expect(Object.keys(reg['CSRD-S-002'] ?? {}).sort()).toEqual(['1', '2', '3', '4', '5']);
    expect(Object.keys(reg['CSRD-S-003'] ?? {}).sort()).toEqual(['1', '2', '3']);
  });

  it('the pack holds twenty-four requirements: the seven appended in id order after CSRD-S-016, then CSRD-S-024', () => {
    expect(pack().requirements.map((r) => r.id).slice(16, 23)).toEqual(NEW);
    // E-2 (QD-4, DG-7, 2026-10-23) appended the third-country issuer route after the seven.
    expect(pack().requirements.map((r) => r.id).slice(23)).toEqual(['CSRD-S-024']);
    expect(pack().requirements).toHaveLength(24);
  });
});
