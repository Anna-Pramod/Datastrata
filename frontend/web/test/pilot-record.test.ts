/**
 * The record behind the dashboard: the selected document assessed by the real
 * engine, or a refusal the page can print.
 *
 * Pilot step 1. `resolvePilotRecord` is the pure half of `pilotRecord()`: the
 * environment, the file reader and the pack are handed in, so the synthetic
 * path and the refusal path are both observable without Next. The synthetic
 * document must reproduce the assessment the dashboard rendered from the
 * TypeScript sample it replaces — the figures below were taken from that
 * sample before the change (notes folder 2026-10-19T2015Z-pilot-step-1,
 * `logs/before-sample-assessment.json`) and are the regression oracle for the
 * transcription.
 */

import { describe, expect, it } from 'vitest';
import { csrdPack } from '@/lib/pack';
import { PILOT_PROFILE_ENV } from '@/lib/profile';
import { resolvePilotRecord } from '@/lib/record';
import synthetic from '@/profiles/synthetic-meridian.json';

const pack = csrdPack();
const deps = (readFile: (path: string) => string = () => { throw new Error('ENOENT'); }) => ({ readFile, synthetic: synthetic as unknown, pack });

describe('resolvePilotRecord', () => {
  it('assesses the synthetic document exactly as the retired TypeScript sample was assessed', () => {
    const record = resolvePilotRecord({}, deps());
    if (!record.ok) throw new Error(record.error.publicDetail);
    expect(record.origin).toEqual({ kind: 'synthetic' });
    expect(record.document.record.kind).toBe('synthetic');
    const { determinations, obligations, containsDraftContent, nextQuestions, gaps } = record.assessment;
    expect(determinations).toHaveLength(110);
    expect(determinations.filter((d) => d.result === 'APPLIES')).toHaveLength(6);
    // The sample's figures were 60 and 44. On 2026-10-23 E-1 (QD-4, DG-6) gave
    // the Article 40a route its 2028 start (CSRD Art 5(2), second
    // subparagraph), so for this FY2027 document four determinations move from
    // unresolved to does-not-apply: CSRD-S-007 on the group, and CSRD-S-008,
    // which follows it, on e-de, e-nl and e-fr. The document is unchanged.
    expect(determinations.filter((d) => d.result === 'DOES_NOT_APPLY')).toHaveLength(64);
    expect(determinations.filter((d) => d.result === 'INDETERMINATE')).toHaveLength(40);
    const gate = (id: string, scopeId: string) => determinations.find((d) => d.requirementId === id && d.scopeId === scopeId);
    for (const [id, scopeId] of [['CSRD-S-007', 'org'], ['CSRD-S-008', 'e-de'], ['CSRD-S-008', 'e-nl'], ['CSRD-S-008', 'e-fr']] as const) {
      expect(gate(id, scopeId)?.result, `${id} on ${scopeId}`).toBe('DOES_NOT_APPLY');
      expect(gate(id, scopeId)?.reason, `${id} on ${scopeId}`).toBeUndefined();
    }
    expect(obligations).toHaveLength(0);
    expect(nextQuestions).toHaveLength(16);
    expect(gaps).toHaveLength(0);
    expect(containsDraftContent).toBe(true);
    const duty = new Map(determinations.filter((d) => d.requirementId === 'CSRD-S-014').map((d) => [d.scopeId, d]));
    expect(duty.get('e-hold')?.result).toBe('INDETERMINATE');
    expect(duty.get('e-hold')?.reason).toBe('upstream_indeterminate');
    expect(duty.get('e-nl')?.result).toBe('DOES_NOT_APPLY');
    expect(duty.get('e-fr')?.result).toBe('INDETERMINATE');
    expect(duty.get('e-uk')?.result).toBe('DOES_NOT_APPLY');
  });

  it('assesses a pilot file under its own context, with the record kind carried through', () => {
    const document = JSON.parse(JSON.stringify(synthetic)) as { record: Record<string, unknown>; context: { assessmentDate: string } };
    document.record = { kind: 'pilot', name: 'Test Pilot AG', note: 'as stated', statedOn: '2026-10-19' };
    document.context.assessmentDate = '2026-10-19';
    const record = resolvePilotRecord({ [PILOT_PROFILE_ENV]: '/pilot/test.json' }, deps(() => JSON.stringify(document)));
    if (!record.ok) throw new Error(record.error.publicDetail);
    expect(record.origin).toEqual({ kind: 'file' });
    expect(record.document.record.kind).toBe('pilot');
    expect(record.assessment.determinations[0]?.evaluatedAt).toBe('2026-10-19');
  });

  it('returns the refusal rather than throwing, and the refusal carries no path', () => {
    const record = resolvePilotRecord({ [PILOT_PROFILE_ENV]: '/pilot/secret/acme.json' }, deps());
    expect(record.ok).toBe(false);
    if (record.ok) return;
    expect(record.error.code).toBe('unreadable');
    expect(record.error.publicDetail).toContain(PILOT_PROFILE_ENV);
    expect(record.error.publicDetail).not.toContain('secret');
    expect(record.error.operatorDetail).toContain('/pilot/secret/acme.json');
  });
});
