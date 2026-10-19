/**
 * The loader's integrity refusals: the shapes a hand-authored profile can
 * take that are well-formed JSON and still cannot be assessed honestly.
 *
 * Pilot step 1 corrections (2026-10-19). Each refusal is field-specific and
 * raised before any assessment, so an operator reads which field to fix. The
 * engine is unchanged: it would walk a parent cycle forever, compare a
 * reversed range as if it were ordered, and read an impossible date as a
 * string, so the boundary is the only place these can be refused.
 *
 * Each negative case sits beside a valid control, so a parser that refused
 * everything would fail here too.
 */

import { describe, expect, it } from 'vitest';
import { csrdPack } from '@/lib/pack';
import { parseProfileDocument, ProfileConfigurationError, type ProfileDocument } from '@/lib/profile';
import synthetic from '@/profiles/synthetic-meridian.json';

const pack = csrdPack();

function document(): ProfileDocument {
  return JSON.parse(JSON.stringify(synthetic)) as ProfileDocument;
}

function refusal(run: () => unknown): ProfileConfigurationError {
  try {
    run();
  } catch (error) {
    if (error instanceof ProfileConfigurationError) return error;
    throw error;
  }
  throw new Error('expected a ProfileConfigurationError and none was thrown');
}

const source = { kind: 'customer_statement' as const, ref: 'onboarding call 2026-10-19' };

describe('parent chains', () => {
  it('refuses a scope object that is its own parent, naming it', () => {
    const d = document();
    d.profile.scopeObjects.push({ id: 'e-self', type: 'legal_entity', name: 'Self Ltd', parentId: 'e-self' });
    const error = refusal(() => parseProfileDocument(d, pack));
    expect(error.code).toBe('invalid_document');
    expect(error.publicDetail).toContain('e-self');
    expect(error.publicDetail).toContain('its own parent');
  });

  it('refuses a two-object cycle and a longer cycle, naming the chain', () => {
    const d = document();
    d.profile.scopeObjects.push(
      { id: 'a', type: 'legal_entity', name: 'A', parentId: 'b' },
      { id: 'b', type: 'legal_entity', name: 'B', parentId: 'a' },
      { id: 'x', type: 'legal_entity', name: 'X', parentId: 'y' },
      { id: 'y', type: 'legal_entity', name: 'Y', parentId: 'z' },
      { id: 'z', type: 'legal_entity', name: 'Z', parentId: 'x' },
    );
    const error = refusal(() => parseProfileDocument(d, pack));
    expect(error.publicDetail).toContain('cycle');
    expect(error.publicDetail).toContain('a → b → a');
    expect(error.publicDetail).toContain('x → y → z → x');
  });

  it('accepts a chain that ends at a root (control)', () => {
    const d = document();
    d.profile.scopeObjects.push(
      { id: 'mid', type: 'legal_entity', name: 'Mid', parentId: 'org' },
      { id: 'leaf', type: 'legal_entity', name: 'Leaf', parentId: 'mid' },
    );
    expect(parseProfileDocument(d, pack).profile.scopeObjects).toHaveLength(9);
  });
});

describe('numeric ranges', () => {
  it('refuses a reversed range, naming the fact', () => {
    const d = document();
    // e-in already states a turnover; replace it so the only defect is the reversed range.
    d.profile.facts = d.profile.facts.filter((f) => !(f.scopeId === 'e-in' && f.factType === 'entity.net_turnover_eur'));
    d.profile.facts.push({ factType: 'entity.net_turnover_eur', scopeId: 'e-in', value: { kind: 'range', min: 600_000_000, max: 400_000_000 }, confirmed: true, source });
    const error = refusal(() => parseProfileDocument(d, pack));
    expect(error.publicDetail).toContain('entity.net_turnover_eur');
    expect(error.publicDetail).toContain('min');
    expect(error.publicDetail).toContain('max');
  });

  it('accepts an ordered range and a point range (controls)', () => {
    const d = document();
    d.profile.facts = d.profile.facts.filter((f) => !(f.scopeId === 'e-in' && f.factType === 'entity.net_turnover_eur'));
    d.profile.facts.push(
      { factType: 'entity.net_turnover_eur', scopeId: 'e-in', value: { kind: 'range', min: 90_000_000, max: 100_000_000 }, confirmed: true, source },
      { factType: 'entity.avg_employees', scopeId: 'e-in', value: { kind: 'range', min: 500, max: 500 }, confirmed: true, source },
    );
    expect(parseProfileDocument(d, pack).profile.facts).toHaveLength(43);
  });
});

describe('calendar dates', () => {
  it.each([
    ['assessmentDate', '2026-02-30'],
    ['assessmentDate', '2026-13-01'],
    ['assessmentDate', '2025-02-29'],
  ])('refuses an impossible %s %s in the context, by field', (field, value) => {
    const d = document();
    d.context.assessmentDate = value;
    const error = refusal(() => parseProfileDocument(d, pack));
    expect(error.publicDetail).toContain(`context.${field}`);
    expect(error.publicDetail).toContain('calendar');
  });

  it('refuses an impossible date in a financial year, a fact value, asOf, reviewDue and statedOn, each by field', () => {
    const d = document();
    d.context.financialYear.end = '2027-11-31';
    d.record.statedOn = '2026-00-10';
    d.profile.facts.push(
      { factType: 'entity.avg_employees', scopeId: 'e-in', value: { kind: 'number', value: 100 }, confirmed: true, source, asOf: '2026-04-31', reviewDue: '2027-02-29' },
    );
    const error = refusal(() => parseProfileDocument(d, pack));
    expect(error.publicDetail).toContain('context.financialYear.end');
    expect(error.publicDetail).toContain('record.statedOn');
    expect(error.publicDetail).toContain('asOf');
    expect(error.publicDetail).toContain('reviewDue');
  });

  it('refuses an impossible date-kind value', () => {
    const d = document();
    const dateType = pack.factTypes.find((f) => f.dataType === 'date');
    if (dateType === undefined) throw new Error('the pack has no date-typed fact to test with');
    const scope = d.profile.scopeObjects.find((s) => s.type === dateType.scopeType);
    if (scope === undefined) throw new Error(`no scope object of type ${dateType.scopeType}`);
    d.profile.facts.push({ factType: dateType.id, scopeId: scope.id, value: { kind: 'date', value: '2026-06-31' }, confirmed: true, source });
    const error = refusal(() => parseProfileDocument(d, pack));
    expect(error.publicDetail).toContain('value');
    expect(error.publicDetail).toContain('calendar');
  });

  it('accepts a leap day in a leap year and every ordinary date (control)', () => {
    const d = document();
    d.context.assessmentDate = '2024-02-29';
    d.record.statedOn = '2026-12-31';
    expect(parseProfileDocument(d, pack).context.assessmentDate).toBe('2024-02-29');
  });
});

describe('the source requirement', () => {
  it('refuses a fact with no source, naming the fact', () => {
    const d = document();
    d.profile.facts.push({ factType: 'entity.avg_employees', scopeId: 'e-in', value: { kind: 'number', value: 100 }, confirmed: true } as ProfileDocument['profile']['facts'][number]);
    const error = refusal(() => parseProfileDocument(d, pack));
    expect(error.code).toBe('invalid_document');
    expect(error.publicDetail).toContain('source');
    expect(error.publicDetail).toMatch(/facts\.42|facts\[42\]/);
  });

  it('refuses a blank or whitespace-only source reference', () => {
    const d = document();
    d.profile.facts.push({ factType: 'entity.avg_employees', scopeId: 'e-in', value: { kind: 'number', value: 100 }, confirmed: true, source: { kind: 'document', ref: '   ' } });
    const error = refusal(() => parseProfileDocument(d, pack));
    expect(error.publicDetail).toContain('ref');
    expect(error.publicDetail).toContain('blank');
  });

  it('keeps a stated unknown and an unconfirmed value when each carries its source (controls)', () => {
    const d = document();
    d.profile.facts.push(
      { factType: 'entity.avg_employees', scopeId: 'e-in', value: { kind: 'unknown' }, confirmed: true, source },
      { factType: 'entity.is_public_interest_entity', scopeId: 'e-nl', value: { kind: 'boolean', value: false }, confirmed: false, source: { kind: 'extraction', ref: 'annual report OCR', extractionConfidence: 0.4 } },
    );
    const parsed = parseProfileDocument(d, pack);
    expect(parsed.profile.facts.at(-2)?.value).toEqual({ kind: 'unknown' });
    expect(parsed.profile.facts.at(-1)?.confirmed).toBe(false);
  });
});
