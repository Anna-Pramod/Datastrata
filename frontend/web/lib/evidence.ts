/**
 * Verification evidence the site may show for a requirement, and the one rule
 * about showing it: a dossier is evidence over the text it was made over, and
 * says nothing about a later text.
 *
 * **Why this exists.** The r5 capture of CSRD-S-002 (2026-10-19) is the only
 * genuine model-produced verification record the project holds: nine role
 * launches, every evidence quote re-found, twelve adjudicated verdicts, read
 * and dispositioned by the author afterwards. It is worth showing a pilot
 * customer beside the requirement. It was made over version 4; the pack now
 * carries version 5 (the Article 1(4) exclusion, which that very dossier
 * found). The gate refuses to sign it on both counts, and a page that showed
 * it beside the current text without saying so would imply a verification
 * that has not happened.
 *
 * **Why the comparison is computed, not written.** The notice compares the
 * dossier's pinned `requirementInputSha256` with the current requirement's,
 * through the engine's own producer — the same field `verify sign` compares
 * when it refuses `candidate_inconsistent`. Written as a sentence, "version 4,
 * not 5" would stay true after a version 6 and false after a revert; computed,
 * it says what holds at request time.
 *
 * **What is transcribed, and from where.** The identifiers and counts below
 * are copied from the sealed execution record (`execution.json` and the
 * result it points to) and from the committed checkpoint and dispositions,
 * which the `records` field names by repository path. The execution record
 * itself is held outside the repository and is referred to by its id and
 * manifest digest only — never by a filesystem path.
 */

import type { KnowledgePack } from '@datastrata/engine';
import { requirementInputSha256 } from '../../../backend/engine/src/verification/canonical';

export interface Disposition {
  issue: string;
  title: string;
  /** The challenge ids the issue groups, with the adjudicator's verdict on each. */
  verdicts: string;
  disposition: string;
}

export interface HistoricalDossier {
  requirementId: string;
  /** The requirement version the dossier was made over. */
  boundVersion: number;
  /** The requirement input the result pins — what the sign gate compares. */
  requirementInputSha256: string;
  executionId: string;
  runId: string;
  manifestSha256: string;
  pipelineVersion: string;
  adapter: string;
  startedAt: string;
  finishedAt: string;
  trust: { execution: string; schema: string; evidence: string; substantive: string };
  counts: { readingElements: number; challenges: number; evidenceSets: number; quotes: number };
  verdicts: { confirmed: number; mismatch: number; openQuestion: number };
  promoted: false;
  signed: false;
  dispositions: Disposition[];
  /** Repository paths of the committed records this transcription rests on. */
  records: string[];
}

export const S002_R5_DOSSIER: HistoricalDossier = {
  requirementId: 'CSRD-S-002',
  boundVersion: 4,
  requirementInputSha256: 'fecc50505cb4779323b70203924c012b783bf5186e34ecf9ed4d3df20b6fea95',
  executionId: '20261019T141716Z-b588bc',
  runId: 'run-v1-2c07b78cb61edaa32a407d57ba3a271bf20ba7c95f42599703626dcf04fe3c5c',
  manifestSha256: 'cd70ae8ad33f6b770290c25429dc2f6bbe718e6b0e825455f9edda18ee6e69b0',
  pipelineVersion: 'pipeline-v3-85810d540c7c5f31a7539c0419e88520a65da74f90f2858e66b91831ab6dc2fa',
  adapter: 'claude-code-cli@3',
  startedAt: '2026-10-19T14:17:16Z',
  finishedAt: '2026-10-19T14:27:50Z',
  trust: {
    execution: 'completed',
    schema: 'valid',
    evidence: 'passed on 39 of 39 sets',
    substantive: 'unassessed at capture; reviewed by the author afterwards',
  },
  counts: { readingElements: 15, challenges: 12, evidenceSets: 39, quotes: 114 },
  verdicts: { confirmed: 2, mismatch: 7, openQuestion: 3 },
  promoted: false,
  signed: false,
  dispositions: [
    {
      issue: 'A',
      title: 'Article 1(3) insurers and credit institutions against the legal-form gate',
      verdicts: 'P1-C1 MISMATCH, P4-C1 MISMATCH',
      disposition:
        'Supported catalogue disposition, no change: the legal-form catalogue records regulated status (credit institution, insurance undertaking) beside the corporate forms, which the roles could not see — they are shown a catalogue\'s name, never its entries.',
    },
    {
      issue: 'B',
      title: 'The Annex II member-liability proviso',
      verdicts: 'P0-MC-1 OPEN_QUESTION, P4-C2 OPEN_QUESTION',
      disposition:
        'Supported catalogue disposition, no change: the proviso is folded into the enum pair the questionnaire collects, and an unmapped form routes to analyst review rather than out of scope.',
    },
    {
      issue: 'C',
      title: 'Which financial years the thresholds govern',
      verdicts: 'P0-MC-2 MISMATCH, P3-C2 MISMATCH, P5-C1 MISMATCH',
      disposition:
        'Dispositioned duplicates of the 2026-10-18 scope-versus-timing decision: S-002 is the consolidated size test alone; the pack-level first-application gap was closed on 2026-10-20 by CSRD-S-017/S-018/S-020/S-021 and S-014 version 4.',
    },
    {
      issue: 'D',
      title: 'The turnover criterion\'s measurement point and period',
      verdicts: 'P3-C1 OPEN_QUESTION',
      disposition:
        'Deferred: a legitimate reading of the shared fact label, which needs a versioned label plan because the label is rendered into every recorded run identity.',
    },
    {
      issue: 'E',
      title: 'The Article 1(4) exclusion',
      verdicts: 'P6-C1 MISMATCH',
      disposition:
        'Supported encoding defect, implemented red first: an explicit exclusion fact and a negated conjunct in both size tests — CSRD-S-002 version 5 and CSRD-S-001 version 4, the change that moved the pack past the text this dossier was made over.',
    },
    {
      issue: 'F',
      title: 'The Article 29a(7a) financial-holding option',
      verdicts: 'P6-C2 CONFIRMED',
      disposition:
        'Agreed, no S-002 change: encoded on 2026-10-20 as the deferred bracket CSRD-S-023 over stated facts, the Member State\'s implementation behind CSRD-S-013.',
    },
    {
      issue: 'G',
      title: 'The Article 29a(8)/(9) intermediate-parent exemption',
      verdicts: 'P6-C3 MISMATCH',
      disposition:
        'Closed on 2026-10-20 outside S-002: CSRD-S-019 over coverage of the parent and its subsidiaries, with CSRD-S-005/S-006 version 4 demanding the same.',
    },
    {
      issue: 'H',
      title: 'The Article 29a(4a) group-composition derogation',
      verdicts: 'P6-C4 CONFIRMED',
      disposition: 'Accepted, no scope change: content-level relief belongs with reporting-content requirements, if ever encoded.',
    },
  ],
  records: [
    'docs/superpowers/CHECKPOINT-opus55-s002-capture-r5.md',
    'docs/superpowers/DISPOSITIONS-opus55-s002-r5-verdicts.md',
  ],
};

export interface EvidenceNotice {
  requirementId: string;
  boundVersion: number;
  boundInputSha256: string;
  currentVersion: number;
  currentInputSha256: string;
  bindsCurrent: boolean;
  headline: string;
  standing: string;
}

const short = (sha256: string): string => `${sha256.slice(0, 12)}…`;

/** A derived identity such as `pipeline-v3-<digest>`: its scheme prefix and the first hex of its digest. */
const shortIdentity = (identity: string): string => {
  const match = /^(.*?-)([0-9a-f]{64})$/.exec(identity);
  return match === null ? short(identity) : `${match[1]}${match[2].slice(0, 12)}…`;
};

/** What the dossier is evidence of, against the requirement the pack carries now. */
export function historicalEvidenceNotice(dossier: HistoricalDossier, pack: Pick<KnowledgePack, 'requirements'>): EvidenceNotice {
  const requirement = pack.requirements.find((r) => r.id === dossier.requirementId);
  if (requirement === undefined) {
    throw new Error(`the pack carries no ${dossier.requirementId}; the dossier has no current text to be compared with`);
  }
  const currentInputSha256 = requirementInputSha256(requirement);
  const bindsCurrent = dossier.requirementInputSha256 === currentInputSha256;
  const headline = bindsCurrent
    ? `This dossier binds the current version ${requirement.version} of ${requirement.id} (input ${short(currentInputSha256)}).`
    : `Historical evidence: this dossier was made over version ${dossier.boundVersion} of ${requirement.id} (input ${short(dossier.requirementInputSha256)}). The pack now carries version ${requirement.version} (input ${short(currentInputSha256)}), and this record does not verify it.`;
  const standing = `This dossier is not promoted and not signed: pipeline ${shortIdentity(dossier.pipelineVersion)} has no promotion record, and the ledger holds no signature for ${requirement.id}. Execution ${dossier.trust.execution}; schema ${dossier.trust.schema}; evidence ${dossier.trust.evidence}; substantive correctness ${dossier.trust.substantive}.`;
  return {
    requirementId: requirement.id,
    boundVersion: dossier.boundVersion,
    boundInputSha256: dossier.requirementInputSha256,
    currentVersion: requirement.version,
    currentInputSha256,
    bindsCurrent,
    headline,
    standing,
  };
}
