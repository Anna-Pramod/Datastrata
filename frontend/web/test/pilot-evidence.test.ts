/**
 * The verification-evidence notice for CSRD-S-002: the r5 dossier shown as
 * what it is — historical evidence over version 4 — never as verification of
 * the version the pack now carries.
 *
 * Pilot step 1. The dossier's identifiers are transcribed from the record;
 * the comparison with the current requirement is computed from the pack at
 * request time through the engine's own `requirementInputSha256`, so the
 * notice keeps saying "does not verify the current version" for as long as
 * that is true, and would say "binds the current version" only if the pack
 * returned to the text the dossier was made over. The positive control below
 * proves the comparison decides something.
 */

import { describe, expect, it } from 'vitest';
import { requirementInputSha256 } from '../../../backend/engine/src/verification/canonical';
import { historicalEvidenceNotice, S002_R5_DOSSIER } from '@/lib/evidence';
import { csrdPack } from '@/lib/pack';

const pack = csrdPack();
const current = pack.requirements.find((r) => r.id === 'CSRD-S-002');
if (current === undefined) throw new Error('the pack carries no CSRD-S-002');

describe('S002_R5_DOSSIER', () => {
  it('is the r5 record over version 4, not promoted and not signed, with its twelve verdicts and eight dispositions', () => {
    expect(S002_R5_DOSSIER.requirementId).toBe('CSRD-S-002');
    expect(S002_R5_DOSSIER.boundVersion).toBe(4);
    expect(S002_R5_DOSSIER.executionId).toBe('20261019T141716Z-b588bc');
    expect(S002_R5_DOSSIER.promoted).toBe(false);
    expect(S002_R5_DOSSIER.signed).toBe(false);
    const { confirmed, mismatch, openQuestion } = S002_R5_DOSSIER.verdicts;
    expect(confirmed + mismatch + openQuestion).toBe(12);
    expect(S002_R5_DOSSIER.dispositions.map((d) => d.issue)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  });
});

describe('historicalEvidenceNotice', () => {
  it('says the dossier does not verify the current version 5, with both versions named', () => {
    const notice = historicalEvidenceNotice(S002_R5_DOSSIER, pack);
    expect(notice.boundVersion).toBe(4);
    expect(notice.currentVersion).toBe(5);
    expect(notice.currentInputSha256).toBe(requirementInputSha256(current));
    expect(notice.bindsCurrent).toBe(false);
    expect(notice.headline).toContain('version 4');
    expect(notice.headline).toContain('version 5');
    expect(notice.headline).toContain('does not verify');
    expect(notice.standing).toContain('not promoted');
    expect(notice.standing).toContain('not signed');
  });

  it('would say a dossier binds the current version only when its pinned input is the current one', () => {
    const rebound = { ...S002_R5_DOSSIER, boundVersion: current.version, requirementInputSha256: requirementInputSha256(current) };
    const notice = historicalEvidenceNotice(rebound, pack);
    expect(notice.bindsCurrent).toBe(true);
    expect(notice.headline).toContain('binds the current version 5');
    expect(notice.headline).not.toContain('does not verify');
    expect(notice.standing).toContain('not promoted');
  });

  it('refuses a dossier for a requirement the pack does not carry', () => {
    expect(() => historicalEvidenceNotice({ ...S002_R5_DOSSIER, requirementId: 'CSRD-S-999' }, pack)).toThrow('CSRD-S-999');
  });
});
