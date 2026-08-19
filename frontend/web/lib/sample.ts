/**
 * The sample record behind "See a sample report".
 *
 * This is a fabricated *company*, and the page says so — but every
 * determination drawn from it is real: the profile below is fed to the actual
 * engine and the dashboard renders whatever came back. The facts are chosen to
 * exercise the behaviours a buyer should see before trusting the product — a
 * clear yes, a clear no, a band that straddles a threshold, and a missing fact.
 */

import 'server-only';
import { assess } from '@datastrata/engine';
import type { AssessmentContext, Profile } from '@datastrata/engine';
import { csrdPack } from '@/lib/pack';

export const SAMPLE_ORG = 'Meridian Steelworks — EU lanes';

const ORG = 'org';

interface Entity { id: string; name: string; short: string; }

export const SAMPLE_ENTITIES: Entity[] = [
  { id: 'e-de', name: 'Meridian Steelworks GmbH', short: 'Meridian GmbH · DE' },
  { id: 'e-hold', name: 'Meridian Holdings SE', short: 'Group HoldCo · DE' },
  { id: 'e-nl', name: 'Meridian Rotterdam BV', short: 'Rotterdam DC · NL' },
  { id: 'e-fr', name: 'Meridian France SAS', short: 'Lyon Works · FR' },
  { id: 'e-in', name: 'Meridian Pune Works Pvt Ltd', short: 'Pune Works · IN' },
  { id: 'e-uk', name: 'Meridian UK Ltd', short: 'Sheffield · UK' },
];

const fact = (factType: string, scopeId: string, value: unknown, ref: string) => ({
  factType, scopeId, value, confirmed: true, source: { kind: 'document' as const, ref },
});

function sampleProfile(): Profile {
  const facts: unknown[] = [
    // Group HoldCo — comfortably over both thresholds: a clear reporting duty.
    fact('entity.incorporation_country', 'e-hold', { kind: 'string', value: 'DE' }, 'Handelsregister extract'),
    fact('entity.legal_form', 'e-hold', { kind: 'string', value: 'public_limited_company' }, 'Articles of association'),
    fact('entity.is_parent_undertaking', 'e-hold', { kind: 'boolean', value: true }, 'Consolidation statement'),
    fact('entity.is_subsidiary', 'e-hold', { kind: 'boolean', value: false }, 'Group structure'),
    fact('entity.governing_member_state', 'e-hold', { kind: 'string', value: 'DE' }, 'Registered office'),
    fact('entity.net_turnover_eur', 'e-hold', { kind: 'number', value: 1_240_000_000 }, 'Annual Report 2025 p.41'),
    fact('entity.avg_employees', 'e-hold', { kind: 'number', value: 4_180 }, 'Annual Report 2025 p.83'),
    fact('group.consolidated_net_turnover_eur', ORG, { kind: 'number', value: 1_240_000_000 }, 'Consolidated accounts'),
    fact('group.avg_employees', ORG, { kind: 'number', value: 4_180 }, 'Group employee note'),

    // Operating company — over thresholds individually.
    fact('entity.incorporation_country', 'e-de', { kind: 'string', value: 'DE' }, 'Handelsregister extract'),
    fact('entity.legal_form', 'e-de', { kind: 'string', value: 'private_limited_company' }, 'Articles of association'),
    fact('entity.is_parent_undertaking', 'e-de', { kind: 'boolean', value: false }, 'Group structure'),
    fact('entity.is_subsidiary', 'e-de', { kind: 'boolean', value: true }, 'Group structure'),
    fact('entity.governing_member_state', 'e-de', { kind: 'string', value: 'DE' }, 'Registered office'),
    fact('entity.net_turnover_eur', 'e-de', { kind: 'number', value: 690_000_000 }, 'Statutory accounts 2025'),
    fact('entity.avg_employees', 'e-de', { kind: 'number', value: 1_920 }, 'Employee note 2025'),
    fact('parent.report_includes_entity', 'e-de', { kind: 'boolean', value: true }, 'Group report perimeter'),

    // Rotterdam — small: a clean, dated negative.
    fact('entity.incorporation_country', 'e-nl', { kind: 'string', value: 'NL' }, 'KvK extract'),
    fact('entity.legal_form', 'e-nl', { kind: 'string', value: 'private_limited_company' }, 'Deed of incorporation'),
    fact('entity.is_parent_undertaking', 'e-nl', { kind: 'boolean', value: false }, 'Group structure'),
    fact('entity.is_subsidiary', 'e-nl', { kind: 'boolean', value: true }, 'Group structure'),
    fact('entity.governing_member_state', 'e-nl', { kind: 'string', value: 'NL' }, 'Registered office'),
    fact('entity.net_turnover_eur', 'e-nl', { kind: 'number', value: 74_000_000 }, 'Statutory accounts 2025'),
    fact('entity.avg_employees', 'e-nl', { kind: 'number', value: 210 }, 'Employee note 2025'),

    // Lyon — a range that straddles EUR 450m. The engine must refuse to guess.
    fact('entity.incorporation_country', 'e-fr', { kind: 'string', value: 'FR' }, 'RCS Lyon extract'),
    fact('entity.legal_form', 'e-fr', { kind: 'string', value: 'private_limited_company' }, 'Statuts'),
    fact('entity.is_parent_undertaking', 'e-fr', { kind: 'boolean', value: false }, 'Group structure'),
    fact('entity.is_subsidiary', 'e-fr', { kind: 'boolean', value: true }, 'Group structure'),
    fact('entity.governing_member_state', 'e-fr', { kind: 'string', value: 'FR' }, 'Siège social'),
    fact('entity.net_turnover_eur', 'e-fr', { kind: 'range', min: 400_000_000, max: 600_000_000 }, 'Management estimate — exact figure requested'),
    fact('entity.avg_employees', 'e-fr', { kind: 'number', value: 1_460 }, 'Employee note 2025'),

    // Pune — non-EU, and headcount deliberately absent.
    fact('entity.incorporation_country', 'e-in', { kind: 'string', value: 'IN' }, 'MCA master data'),
    fact('entity.legal_form', 'e-in', { kind: 'string', value: 'private_limited_company' }, 'Memorandum of association'),
    fact('entity.is_parent_undertaking', 'e-in', { kind: 'boolean', value: false }, 'Group structure'),
    fact('entity.is_subsidiary', 'e-in', { kind: 'boolean', value: true }, 'Group structure'),
    fact('entity.net_turnover_eur', 'e-in', { kind: 'number', value: 96_000_000 }, 'Statutory accounts FY25'),

    // Sheffield — non-EU, over thresholds: the Article 40a question, not the 19a one.
    fact('entity.incorporation_country', 'e-uk', { kind: 'string', value: 'GB' }, 'Companies House extract'),
    fact('entity.legal_form', 'e-uk', { kind: 'string', value: 'private_limited_company' }, 'Articles of association'),
    fact('entity.is_parent_undertaking', 'e-uk', { kind: 'boolean', value: false }, 'Group structure'),
    fact('entity.is_subsidiary', 'e-uk', { kind: 'boolean', value: true }, 'Group structure'),
    fact('entity.net_turnover_eur', 'e-uk', { kind: 'number', value: 512_000_000 }, 'Statutory accounts 2025'),
    fact('entity.avg_employees', 'e-uk', { kind: 'number', value: 1_240 }, 'Employee note 2025'),
  ];

  return {
    scopeObjects: [
      { id: ORG, type: 'organization', name: SAMPLE_ORG },
      ...SAMPLE_ENTITIES.map((e) => ({ id: e.id, type: 'legal_entity' as const, name: e.name, parentId: ORG })),
    ],
    facts: facts as Profile['facts'],
  };
}

const CONTEXT: AssessmentContext = {
  assessmentDate: '2026-08-19',
  financialYear: { start: '2027-01-01', end: '2027-12-31' },
  subjectId: ORG,
};

let cached: ReturnType<typeof assess> | undefined;

export function sampleAssessment() {
  if (!cached) cached = assess(csrdPack(), sampleProfile(), CONTEXT);
  return cached;
}

export const SAMPLE_CONTEXT = CONTEXT;
