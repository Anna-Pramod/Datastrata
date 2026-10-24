/**
 * Golden profile regression suite — "regression testing for law" (Pass 2 §4).
 *
 * These are the pack's 10 golden company profiles (sheet 08), P-011, added
 * with the Article 40a start date (QD-4 E-1), and P-012, added with the
 * third-country issuer route read as not yet covered (QD-4 E-2). Every content or
 * engine change must keep this suite green; an unexpected flip blocks
 * publication until a human reviews the legal justification.
 *
 * Each test asserts BOTH the expected results and the sheet's "must not
 * happen" constraints.
 */

import { describe, expect, it } from 'vitest';
import { assess } from '../src/engine/evaluate';
import type { AssessmentResult, Determination } from '../src/types';
import { ProfileBuilder, csrdPack, ctx } from './helpers';

function det(result: AssessmentResult, reqId: string, scopeId?: string): Determination {
  const found = result.determinations.filter((x) => x.requirementId === reqId && (!scopeId || x.scopeId === scopeId));
  if (found.length === 0) throw new Error(`No determination for ${reqId}${scopeId ? ` on ${scopeId}` : ''}`);
  return found[0]!;
}

const templateIds = (r: AssessmentResult) => r.obligations.map((o) => o.templateId);
const questionIds = (r: AssessmentResult) => r.nextQuestions.map((q) => q.question.id);
const FY2027 = ['2027-01-01', '2027-12-31'] as const;

describe('P-001 EU standalone above thresholds', () => {
  const p = new ProfileBuilder()
    .euEntity('e1', 'Alpine Industrie SAS', 'FR')
    .num('e1', 'entity.net_turnover_eur', 520_000_000)
    .num('e1', 'entity.avg_employees', 1350)
    .str('e1', 'entity.governing_member_state', 'FR')
    // Not excluded by Article 1(4) (Q-039): stated for this scenario, never defaulted.
    .bool('e1', 'entity.excluded_by_article_1_4', false);
  const r = assess(csrdPack(), p.build(), ctx(...FY2027, 'e1'));

  it('individual EU scope applies and the reporting duty is active', () => {
    expect(det(r, 'CSRD-S-001').result).toBe('APPLIES');
    expect(det(r, 'CSRD-S-014').result).toBe('APPLIES');
    expect(det(r, 'CSRD-S-015').result).toBe('APPLIES');
  });

  it('subject to national-law completeness — never a final answer without the country pack', () => {
    const gate = det(r, 'CSRD-S-013');
    expect(gate.result).toBe('INDETERMINATE');
    expect(gate.reason).toBe('national_law_unresolved');
    expect(r.summary.nationalLawResolved).toBe(false);
    expect(r.summary.statusFlags).toContain('national_review_required');
  });

  it('standard selection: 2023 ESRS while the revised act is not in force — even for FY2027', () => {
    expect(det(r, 'CSRD-S-012').selected).toBe('ESRS_2023');
  });

  it('core reporting obligations instantiate (and exemption maintenance does not)', () => {
    expect(templateIds(r)).toEqual(expect.arrayContaining(['O-001', 'O-002', 'O-003', 'O-006', 'O-009', 'O-017']));
    expect(templateIds(r)).not.toContain('O-011');
  });

  it('MUST NOT ask Article 40a or value-chain questions; DOES offer national overlay then readiness', () => {
    const ids = questionIds(r);
    expect(ids).not.toContain('Q-018');
    expect(ids).not.toContain('Q-021');
    expect(ids).not.toContain('Q-022');
    expect(ids).toContain('Q-013');
    expect(ids).toContain('Q-026');
  });

  it('prototype content is flagged as draft', () => {
    expect(r.containsDraftContent).toBe(true);
  });
});

describe('P-002 one threshold only', () => {
  const p = new ProfileBuilder().entity('e1', 'Nordwind GmbH');
  p.str('e1', 'entity.incorporation_country', 'DE');
  p.str('e1', 'entity.legal_form', 'private_limited_company');
  p.num('e1', 'entity.net_turnover_eur', 700_000_000);
  p.num('e1', 'entity.avg_employees', 850);
  const r = assess(csrdPack(), p.build(), ctx(...FY2027, 'e1'));

  it('turnover alone is NOT sufficient — individual threshold definitively does not apply', () => {
    const d = det(r, 'CSRD-S-001');
    expect(d.result).toBe('DOES_NOT_APPLY');
    expect(d.reason).toBeUndefined(); // definitive, not a silent unknown
  });

  it('group role is unresolved, so the next questions check parent/group structure', () => {
    expect(det(r, 'CSRD-S-002').result).toBe('INDETERMINATE');
    expect(questionIds(r)).toContain('Q-005');
  });

  it('no obligations from an out-of-threshold + unresolved profile', () => {
    expect(r.obligations).toHaveLength(0);
  });
});

describe('P-003 consolidated group scope', () => {
  const p = new ProfileBuilder()
    .org('grp', 'Vestfold Group')
    .euEntity('parent', 'Vestfold Holding BV', 'NL', { parentId: 'grp', isParent: true })
    .num('parent', 'entity.net_turnover_eur', 300_000_000)
    .num('parent', 'entity.avg_employees', 400)
    .num('grp', 'group.consolidated_net_turnover_eur', 900_000_000)
    .num('grp', 'group.avg_employees', 4000)
    .str('parent', 'entity.governing_member_state', 'NL')
    // Not excluded by Article 1(4) (Q-039): stated for this scenario, never defaulted.
    .bool('parent', 'entity.excluded_by_article_1_4', false)
    // Not a financial holding undertaking (Q-045): stated, so the Article 29a(7a) bracket (CSRD-S-023) is closed for this scenario.
    .bool('parent', 'entity.is_financial_holding_undertaking', false);
  const r = assess(csrdPack(), p.build(), ctx(...FY2027, 'parent'));

  it('consolidated scope applies while the individual route is negative', () => {
    expect(det(r, 'CSRD-S-001').result).toBe('DOES_NOT_APPLY');
    expect(det(r, 'CSRD-S-002').result).toBe('APPLIES');
    expect(det(r, 'CSRD-S-014').result).toBe('APPLIES');
  });

  it('MUST NOT duplicate individual and consolidated obligations', () => {
    const o001 = r.obligations.filter((o) => o.templateId === 'O-001');
    expect(o001).toHaveLength(1);
  });
});

describe('P-004 exempt subsidiary (threshold in scope, duty exempt)', () => {
  const p = new ProfileBuilder()
    .org('grp', 'Continental Foods Group')
    .euEntity('sub', 'Continental Foods GmbH', 'DE', { parentId: 'grp', isSubsidiary: true })
    .num('sub', 'entity.net_turnover_eur', 520_000_000)
    .num('sub', 'entity.avg_employees', 1350)
    .str('grp', 'group.ultimate_parent_country', 'FR')
    // The parent that draws up the report is the ultimate parent here — stated, not inferred (Q-047).
    .str('grp', 'parent.reporting_parent_country', 'FR')
    .bool('sub', 'parent.report_includes_entity', true)
    // The Article 19a(9) disclosures are made (Q-044): stated for this scenario.
    .bool('sub', 'entity.exemption_disclosures_in_management_report', true)
    .str('grp', 'parent.report_standard', 'ESRS')
    .str('grp', 'parent.report_public_url', 'https://example.com/group-report')
    .bool('sub', 'entity.national_publication_conditions_met', true)
    .str('sub', 'entity.governing_member_state', 'DE')
    // Not excluded by Article 1(4) (Q-039): stated for this scenario, never defaulted.
    .bool('sub', 'entity.excluded_by_article_1_4', false);
  const r = assess(csrdPack(), p.build(), ctx(...FY2027, 'sub'));

  it('threshold applies AND the exemption applies — two separate determinations', () => {
    expect(det(r, 'CSRD-S-001').result).toBe('APPLIES');
    expect(det(r, 'CSRD-S-005').result).toBe('APPLIES');
  });

  it('the post-exemption reporting duty does NOT apply', () => {
    expect(det(r, 'CSRD-S-014').result).toBe('DOES_NOT_APPLY');
  });

  it("MUST NOT be summarised as 'CSRD does not apply' — summary shows in-scope-but-exempt", () => {
    expect(r.summary.statusFlags).toContain('in_scope_but_exempt');
    expect(r.summary.statusFlags).not.toContain('no_direct_duty_identified');
  });

  it('exemption maintenance obligation (O-011) instantiates; core reporting obligations do not', () => {
    expect(templateIds(r)).toContain('O-011');
    expect(templateIds(r)).not.toContain('O-001');
  });
});

describe('P-005 threshold-straddling range', () => {
  const p = new ProfileBuilder()
    .euEntity('e1', 'Baltika Components OÜ', 'EE')
    .num('e1', 'entity.net_turnover_eur', 600_000_000)
    .range('e1', 'entity.avg_employees', 900, 1100);
  const r = assess(csrdPack(), p.build(), ctx(...FY2027, 'e1'));

  it('the determination is INDETERMINATE because the range crosses the legal threshold', () => {
    const d = det(r, 'CSRD-S-001');
    expect(d.result).toBe('INDETERMINATE');
    expect(d.reason).toBe('range_crosses_threshold');
  });

  it('MUST NOT create obligations and MUST NOT give an all-clear', () => {
    expect(r.obligations).toHaveLength(0);
    expect(r.summary.statusFlags).not.toContain('reporting_duty_active');
    expect(r.summary.statusFlags).not.toContain('no_direct_duty_identified');
    expect(r.summary.statusFlags).toContain('unresolved_items');
  });

  it('the top next question asks for the exact employee count', () => {
    expect(r.nextQuestions[0]!.question.id).toBe('Q-008');
  });
});

describe('P-006 third-country subsidiary gateway', () => {
  const p = new ProfileBuilder()
    .org('grp', 'Lakeshore Holdings Inc. group')
    .euEntity('sub', 'Lakeshore Europe GmbH', 'DE', { parentId: 'grp', isSubsidiary: true })
    .str('grp', 'group.ultimate_parent_country', 'US')
    .num('grp', 'third_country.eu_turnover_year_1_eur', 480_000_000)
    .num('grp', 'third_country.eu_turnover_year_2_eur', 470_000_000)
    .bool('grp', 'third_country.qualifying_eu_subsidiary_exists', true)
    .num('sub', 'third_country.eu_subsidiary_turnover_eur', 240_000_000)
    .num('sub', 'entity.net_turnover_eur', 240_000_000)
    .num('sub', 'entity.avg_employees', 600)
    .str('sub', 'entity.governing_member_state', 'DE');
  const r = assess(csrdPack(), p.build(), ctx('2028-01-01', '2028-12-31', 'grp'));

  it('the Article 40a route applies through the subsidiary gateway', () => {
    expect(det(r, 'CSRD-S-007', 'grp').result).toBe('APPLIES');
    expect(det(r, 'CSRD-S-008', 'sub').result).toBe('APPLIES');
    expect(templateIds(r)).toEqual(expect.arrayContaining(['O-012', 'O-013']));
  });

  it('MUST NOT apply the EU individual threshold to the non-EU parent route (subsidiary judged on its own facts)', () => {
    expect(det(r, 'CSRD-S-001', 'sub').result).toBe('DOES_NOT_APPLY');
  });

  it('readiness is offered off the third-country route', () => {
    expect(questionIds(r)).toContain('Q-026');
  });
});

describe('P-007 third-country group with no qualifying gateway', () => {
  const p = new ProfileBuilder()
    .org('grp', 'Meridian Corp group')
    .euEntity('sub', 'Meridian Iberia SL', 'ES', { parentId: 'grp', isSubsidiary: true })
    .branch('br', 'Meridian France branch', 'grp')
    .str('grp', 'group.ultimate_parent_country', 'US')
    .num('grp', 'third_country.eu_turnover_year_1_eur', 500_000_000)
    .num('grp', 'third_country.eu_turnover_year_2_eur', 520_000_000)
    .bool('grp', 'third_country.qualifying_eu_subsidiary_exists', false)
    .num('sub', 'third_country.eu_subsidiary_turnover_eur', 150_000_000)
    .num('sub', 'entity.net_turnover_eur', 150_000_000)
    .num('sub', 'entity.avg_employees', 300)
    .num('br', 'third_country.eu_branch_turnover_eur', 180_000_000);
  const r = assess(csrdPack(), p.build(), ctx('2028-01-01', '2028-12-31', 'grp'));

  it('the group gate is met but neither gateway threshold is exceeded', () => {
    expect(det(r, 'CSRD-S-007', 'grp').result).toBe('APPLIES');
    expect(det(r, 'CSRD-S-008', 'sub').result).toBe('DOES_NOT_APPLY');
    expect(det(r, 'CSRD-S-009', 'br').result).toBe('DOES_NOT_APPLY');
  });

  it('MUST NOT ignore the EUR 200m gateway threshold — no third-country obligations', () => {
    expect(templateIds(r)).not.toContain('O-012');
    expect(templateIds(r)).not.toContain('O-013');
  });
});

describe('P-008 protected supplier with above-cap CSRD-purpose request', () => {
  const p = new ProfileBuilder()
    .org('sup', 'Sundaram Textiles group')
    .euEntity('e-in', 'Sundaram Textiles Pvt Ltd', 'IN', { parentId: 'sup' })
    .counterparty('buyer', 'RheinMode AG (buyer)')
    .request('req', 'RheinMode 2026 supplier questionnaire', 'sup', 'buyer')
    .num('sup', 'value_chain.respondent_avg_employees', 250)
    .bool('req', 'value_chain.request_received', true)
    .bool('buyer', 'value_chain.requestor_is_csrd_reporter', true)
    .str('req', 'value_chain.request_purpose', 'CSRD_REPORTING')
    .list('req', 'value_chain.request_items', ['ghg_scope_1_2', 'workforce_detail_by_site', 'biodiversity_impact_study'])
    .list('req', 'value_chain.items_above_cap', ['workforce_detail_by_site', 'biodiversity_impact_study']);
  const r = assess(csrdPack(), p.build(), ctx('2026-01-01', '2026-12-31', 'sup'));

  it('protected-undertaking status and item-level decline right apply', () => {
    expect(det(r, 'CSRD-S-010', 'req').result).toBe('APPLIES');
    expect(det(r, 'CSRD-S-011', 'req').result).toBe('APPLIES');
    expect(templateIds(r)).toEqual(expect.arrayContaining(['O-014', 'O-015']));
  });

  it('MUST NOT tell the supplier it has a direct ESRS reporting duty', () => {
    expect(det(r, 'CSRD-S-001', 'e-in').result).toBe('DOES_NOT_APPLY');
    expect(templateIds(r)).not.toContain('O-001');
    expect(r.summary.statusFlags).toContain('value_chain_protected');
    expect(r.summary.statusFlags).not.toContain('reporting_duty_active');
  });
});

describe('P-009 same supplier, due-diligence purpose', () => {
  const p = new ProfileBuilder()
    .org('sup', 'Sundaram Textiles group')
    .counterparty('buyer', 'RheinMode AG (buyer)')
    .request('req', 'RheinMode due-diligence request', 'sup', 'buyer')
    .num('sup', 'value_chain.respondent_avg_employees', 250)
    .bool('req', 'value_chain.request_received', true)
    .bool('buyer', 'value_chain.requestor_is_csrd_reporter', true)
    .str('req', 'value_chain.request_purpose', 'DUE_DILIGENCE')
    .list('req', 'value_chain.items_above_cap', ['workforce_detail_by_site']);
  const r = assess(csrdPack(), p.build(), ctx('2026-01-01', '2026-12-31', 'sup'));

  it('MUST NOT infer the cap from the requestor being a CSRD reporter — purpose limits the cap', () => {
    expect(det(r, 'CSRD-S-010', 'req').result).toBe('DOES_NOT_APPLY');
    expect(det(r, 'CSRD-S-011', 'req').result).toBe('DOES_NOT_APPLY');
    expect(templateIds(r)).not.toContain('O-014');
  });
});

describe('P-010 former FY2024 reporter below new thresholds, national option unknown', () => {
  const p = new ProfileBuilder()
    .euEntity('e1', 'Aquitaine Matériaux SA', 'FR')
    .bool('e1', 'entity.reported_csrd_fy2024', true)
    .num('e1', 'entity.net_turnover_eur', 500_000_000)
    .num('e1', 'entity.avg_employees', 800)
    .str('e1', 'entity.governing_member_state', 'FR');
  const r = assess(csrdPack(), p.build(), ctx('2025-01-01', '2025-12-31', 'e1'));

  it('EU-level threshold is negative but the FY2025 transition position is unresolved pending national law', () => {
    expect(det(r, 'CSRD-S-001').result).toBe('DOES_NOT_APPLY');
    expect(det(r, 'CSRD-S-003').result).toBe('APPLIES'); // wave history context
    const transition = det(r, 'CSRD-S-004');
    expect(transition.result).toBe('INDETERMINATE');
    expect(transition.reason).toBe('national_law_unresolved');
  });

  it('MUST NOT issue a stop-work all-clear', () => {
    expect(r.summary.nationalLawResolved).toBe(false);
    expect(r.summary.statusFlags).toContain('national_review_required');
    expect(r.summary.statusFlags).not.toContain('no_direct_duty_identified');
    expect(r.obligations).toHaveLength(0);
  });
});

// CSRD Art 5(2), second subparagraph: Member States apply Article 40a "for
// financial years starting on or after 1 January 2028" (QD-4 E-1).
describe('P-011 third-country subsidiary gateway before 2028', () => {
  // P-006's facts, unchanged; only the financial year differs.
  const p = new ProfileBuilder()
    .org('grp', 'Lakeshore Holdings Inc. group')
    .euEntity('sub', 'Lakeshore Europe GmbH', 'DE', { parentId: 'grp', isSubsidiary: true })
    .str('grp', 'group.ultimate_parent_country', 'US')
    .num('grp', 'third_country.eu_turnover_year_1_eur', 480_000_000)
    .num('grp', 'third_country.eu_turnover_year_2_eur', 470_000_000)
    .bool('grp', 'third_country.qualifying_eu_subsidiary_exists', true)
    .num('sub', 'third_country.eu_subsidiary_turnover_eur', 240_000_000)
    .num('sub', 'entity.net_turnover_eur', 240_000_000)
    .num('sub', 'entity.avg_employees', 600)
    .str('sub', 'entity.governing_member_state', 'DE');
  const r = assess(csrdPack(), p.build(), ctx(...FY2027, 'grp'));
  const control = assess(csrdPack(), p.build(), ctx('2028-01-01', '2028-12-31', 'grp'));

  it('the group gate and the subsidiary gateway do not apply for FY2027 — a definitive no on the Directive’s date', () => {
    expect(det(r, 'CSRD-S-007', 'grp').result).toBe('DOES_NOT_APPLY');
    expect(det(r, 'CSRD-S-007', 'grp').reason).toBeUndefined();
    expect(det(r, 'CSRD-S-008', 'sub').result).toBe('DOES_NOT_APPLY');
  });

  it('MUST NOT apply either gate before 2028 — no third-country obligations', () => {
    expect(det(r, 'CSRD-S-007', 'grp').result).not.toBe('APPLIES');
    expect(det(r, 'CSRD-S-008', 'sub').result).not.toBe('APPLIES');
    expect(templateIds(r)).not.toContain('O-012');
    expect(templateIds(r)).not.toContain('O-013');
  });

  it('positive control: the same facts for FY2028 still apply through the gateway', () => {
    expect(det(control, 'CSRD-S-007', 'grp').result).toBe('APPLIES');
    expect(det(control, 'CSRD-S-008', 'sub').result).toBe('APPLIES');
    expect(templateIds(control)).toEqual(expect.arrayContaining(['O-012', 'O-013']));
  });
});

// CSRD Article 2 amends the Transparency Directive, and Art 5(2), third
// subparagraph, applies it to issuers under Directive 2004/109/EC, Art 2(1)(d),
// on the same size tests: a company registered outside the EU with securities
// on an EU regulated market can have the duty. The route is not encoded
// (KNW-14), so a non-EU result reads "not yet covered: requires review", never
// "does not apply" (QD-4 E-2, DG-7 option A). EU issuers are assessed through
// CSRD-S-001, S-002, S-017 and S-018, so the gate is closed for them.
describe('P-012 third-country issuer route not yet encoded', () => {
  // Explicit facts, not a helper whose name says "EU". The two companies are
  // identical except for the country of incorporation.
  const company = (id: string, name: string) =>
    new ProfileBuilder()
      .entity(id, name)
      .str(id, 'entity.legal_form', 'public_limited_company')
      .bool(id, 'entity.is_parent_undertaking', false)
      .bool(id, 'entity.is_subsidiary', false)
      .num(id, 'entity.net_turnover_eur', 520_000_000)
      .num(id, 'entity.avg_employees', 1350)
      .bool(id, 'entity.excluded_by_article_1_4', false);
  const us = assess(csrdPack(), company('e-us', 'Lakeshore Holdings Inc.').str('e-us', 'entity.incorporation_country', 'US').build(), ctx(...FY2027, 'e-us'));
  const fr = assess(csrdPack(), company('e-fr', 'Alpine Industrie SA').str('e-fr', 'entity.incorporation_country', 'FR').build(), ctx(...FY2027, 'e-fr'));
  // The checker's "Not sure" records the fact as unknown; a fact never asked is absent.
  const unknown = assess(csrdPack(), company('e-x', 'Unnamed Holdings').fact('e-x', 'entity.incorporation_country', { kind: 'unknown' }).build(), ctx(...FY2027, 'e-x'));
  const absent = assess(csrdPack(), company('e-y', 'Unnamed Holdings').build(), ctx(...FY2027, 'e-y'));

  it('a US-registered company reads the route as not yet covered: indeterminate, source_status_unresolved, asking for the country', () => {
    const d = det(us, 'CSRD-S-024', 'e-us');
    expect(d.result).toBe('INDETERMINATE');
    expect(d.reason).toBe('source_status_unresolved');
    expect(d.needs).toEqual([{ factType: 'entity.incorporation_country', scopeId: 'e-us', reason: 'source_status_unresolved' }]);
  });

  it('MUST NOT read as does not apply for a non-EU company, nor as no direct duty, and instantiates no obligation', () => {
    expect(det(us, 'CSRD-S-024', 'e-us').result).not.toBe('DOES_NOT_APPLY');
    expect(us.summary.statusFlags).not.toContain('no_direct_duty_identified');
    expect(us.obligations.flatMap((o) => o.derivedFrom)).not.toContain('CSRD-S-024');
  });

  it('positive control: an FR-registered company reads does not apply, with no reason — the gate evaluates', () => {
    const d = det(fr, 'CSRD-S-024', 'e-fr');
    expect(d.result).toBe('DOES_NOT_APPLY');
    expect(d.reason).toBeUndefined();
    expect(d.needs).toEqual([]);
    // The obligation seam the US case reads is populated here, so its "none from S-024" is not vacuous.
    expect(fr.obligations.flatMap((o) => o.derivedFrom)).toContain('CSRD-S-014');
    expect(fr.obligations.flatMap((o) => o.derivedFrom)).not.toContain('CSRD-S-024');
  });

  it('a country recorded as unknown reads missing_fact, never does not apply', () => {
    const d = det(unknown, 'CSRD-S-024', 'e-x');
    expect(d.result).toBe('INDETERMINATE');
    expect(d.reason).toBe('missing_fact');
    expect(new Set(d.needs.map((n) => `${n.factType}/${n.reason}`))).toEqual(new Set(['entity.incorporation_country/missing_fact']));
  });

  it('a country never asked reads missing_fact, never does not apply', () => {
    const d = det(absent, 'CSRD-S-024', 'e-y');
    expect(d.result).toBe('INDETERMINATE');
    expect(d.reason).toBe('missing_fact');
    expect(new Set(d.needs.map((n) => `${n.factType}/${n.reason}`))).toEqual(new Set(['entity.incorporation_country/missing_fact']));
  });
});
