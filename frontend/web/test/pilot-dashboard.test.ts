/**
 * The dashboard's view model: what the page prints, computed from the record
 * and the pack, with the requirement's verification status read from the
 * pack as loaded and never assumed.
 *
 * Pilot step 1. The page is a server component and is not rendered here; the
 * functions it maps to JSX are. The status rows are proved in both
 * directions, as the evidence standard requires: over the real repository
 * every requirement reads `draft`, and over a fixture repository whose ledger
 * signs one requirement that one row reads `ratified` while the assessment
 * still carries draft content, so the banner stays.
 */

import { describe, expect, it } from 'vitest';
import { assess } from '@datastrata/engine';
import { entityColumns, factRows, formatFactValue, requirementStatusRows, statusSummary } from '@/lib/dashboard';
import { csrdPack, loadVerifiedCsrdPack } from '@/lib/pack';
import { parseProfileDocument, type ProfileDocument } from '@/lib/profile';
import synthetic from '@/profiles/synthetic-meridian.json';
import { buildFixtureRepository } from './fixture-repository';

const pack = csrdPack();
const document = parseProfileDocument(synthetic, pack);
const assessment = assess(pack, document.profile, document.context);

describe('entityColumns', () => {
  it('lists the legal entities in profile order with the record\'s short names', () => {
    const columns = entityColumns(document);
    expect(columns.map((c) => c.id)).toEqual(['e-de', 'e-hold', 'e-nl', 'e-fr', 'e-in', 'e-uk']);
    expect(columns[0]).toEqual({ id: 'e-de', name: 'Meridian Steelworks GmbH', short: 'Meridian GmbH · DE' });
  });

  it('falls back to the scope object\'s name when the record gives no short name', () => {
    const bare: ProfileDocument = { ...document, record: { ...document.record, shortNames: undefined } };
    expect(entityColumns(bare)[0]?.short).toBe('Meridian Steelworks GmbH');
  });
});

describe('requirementStatusRows', () => {
  const entityIds = entityColumns(document).map((c) => c.id);

  it('carries every requirement with its status as loaded: all draft over the real repository', () => {
    const rows = requirementStatusRows(pack, assessment, entityIds);
    expect(rows).toHaveLength(23);
    expect(rows.every((r) => r.status === 'draft')).toBe(true);
    const duty = rows.find((r) => r.id === 'CSRD-S-014');
    expect(duty?.version).toBe(4);
    expect(duty?.results['e-nl']?.result).toBe('DOES_NOT_APPLY');
    expect(duty?.results['e-hold']?.result).toBe('INDETERMINATE');
    expect(duty?.results['e-hold']?.reason).toBe('upstream_indeterminate');
    const article40a = rows.find((r) => r.id === 'CSRD-S-007');
    expect(article40a?.scopeType).toBe('organization');
    expect(article40a?.results['e-nl']).toBeUndefined();
  });

  it('reads a signed requirement as the ledger says, while the assessment still carries draft content', () => {
    const fixture = buildFixtureRepository({ requirementIds: ['CSRD-S-002'] });
    const signedPack = loadVerifiedCsrdPack(fixture.engineRoot);
    const signedAssessment = assess(signedPack, document.profile, document.context);
    const rows = requirementStatusRows(signedPack, signedAssessment, entityIds);
    expect(rows.find((r) => r.id === 'CSRD-S-002')?.status).toBe('ratified');
    expect(rows.find((r) => r.id === 'CSRD-S-001')?.status).toBe('draft');
    expect(rows.filter((r) => r.status !== 'draft')).toHaveLength(1);
    expect(signedAssessment.containsDraftContent).toBe(true);
    expect(statusSummary(signedPack)).toEqual({ draft: 22, verified: 0, ratified: 1 });
  });
});

describe('statusSummary', () => {
  it('counts the pack as loaded', () => {
    expect(statusSummary(pack)).toEqual({ draft: 23, verified: 0, ratified: 0 });
  });
});

describe('factRows and formatFactValue', () => {
  it('keeps every stated fact with its source, and says when a value is stated as unknown', () => {
    const withUnknown: ProfileDocument = {
      ...document,
      profile: {
        ...document.profile,
        facts: [
          ...document.profile.facts,
          { factType: 'entity.avg_employees', scopeId: 'e-in', value: { kind: 'unknown' }, confirmed: true, source: { kind: 'customer_statement', ref: 'onboarding call' } },
          { factType: 'entity.is_public_interest_entity', scopeId: 'e-nl', value: { kind: 'boolean', value: false }, confirmed: false, source: { kind: 'extraction', ref: 'OCR', page: '3' } },
        ],
      },
    };
    const rows = factRows(withUnknown, pack);
    expect(rows).toHaveLength(44);
    const unknown = rows.find((r) => r.scopeId === 'e-in' && r.factType === 'entity.avg_employees');
    expect(unknown?.value).toBe('unknown (stated)');
    expect(unknown?.source).toBe('customer statement · onboarding call');
    const unconfirmed = rows.find((r) => r.factType === 'entity.is_public_interest_entity');
    expect(unconfirmed?.confirmed).toBe(false);
    expect(unconfirmed?.source).toBe('extraction · OCR · p. 3');
    const turnover = rows.find((r) => r.scopeId === 'e-fr' && r.factType === 'entity.net_turnover_eur');
    expect(turnover?.value).toBe('400,000,000 – 600,000,000 EUR');
    expect(turnover?.label).toBe(pack.factTypes.find((f) => f.id === 'entity.net_turnover_eur')?.label);
    expect(turnover?.scopeName).toBe('Meridian France SAS');
  });

  it('formats each value kind without inventing precision', () => {
    const employees = pack.factTypes.find((f) => f.id === 'entity.avg_employees');
    expect(formatFactValue({ kind: 'number', value: 1920 }, employees)).toBe('1,920 employees');
    expect(formatFactValue({ kind: 'boolean', value: true })).toBe('yes');
    expect(formatFactValue({ kind: 'boolean', value: false })).toBe('no');
    expect(formatFactValue({ kind: 'string', value: 'DE' })).toBe('DE');
    expect(formatFactValue({ kind: 'date', value: '2026-01-31' })).toBe('2026-01-31');
    expect(formatFactValue({ kind: 'year', value: 2025 })).toBe('2025');
    expect(formatFactValue({ kind: 'list', values: ['a', 'b'] })).toBe('a, b');
    expect(formatFactValue({ kind: 'unknown' })).toBe('unknown (stated)');
  });
});
