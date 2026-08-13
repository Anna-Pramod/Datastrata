/**
 * Program-level summary — a PROJECTION of requirement-level determinations,
 * never the authoritative output (Pass 3 §2.1). The engine must never emit an
 * unexplained binary "CSRD applies", and a negative EU-level screen with
 * unresolved national law must never read as a final all-clear.
 */

import type { Determination, KnowledgePack, ProgramSummary } from '../types';

export function summarise(pack: KnowledgePack, dets: Determination[]): ProgramSummary {
  const applies = (pred: (d: Determination) => boolean) => dets.filter((d) => d.result === 'APPLIES' && pred(d));
  const flags: string[] = [];
  const parts: string[] = [];

  const thresholdInScope = applies((d) => d.relationshipClass === 'direct_legal' && /scope/i.test(d.decisionArea));
  const dutyActive = applies((d) => d.decisionArea === 'Reporting duty');
  const exemptions = applies((d) => d.relationshipClass === 'direct_legal_exemption');
  const thirdCountry = applies((d) => d.decisionArea === 'Third-country scope' && d.relationshipClass === 'direct_legal');
  const valueChain = applies((d) => d.relationshipClass === 'indirect_operational');
  const unresolved = dets.filter((d) => d.result === 'INDETERMINATE' && (d.severity === 'critical' || d.severity === 'high'));

  // Gates that evaluate DOES_NOT_APPLY are structurally out of scope for the
  // overlay (e.g. a non-EU supplier with only value-chain exposure) — they do
  // not hold the answer hostage. Unresolved or applicable gates do.
  const gates = dets.filter((d) => d.relationshipClass === 'legal_status_gate' && d.result !== 'DOES_NOT_APPLY');
  const nationalLawResolved = gates.length === 0 ? true : gates.every((d) => d.result === 'APPLIES');

  if (dutyActive.length > 0) {
    flags.push('reporting_duty_active');
    parts.push(`Reporting duty active for ${uniq(dutyActive.map((d) => d.scopeName)).join(', ')}`);
  } else if (thresholdInScope.length > 0 && exemptions.length > 0) {
    flags.push('in_scope_but_exempt');
    parts.push(`Threshold in scope but reporting duty exempt (${uniq(exemptions.map((d) => d.requirementTitle)).join('; ')})`);
  } else if (thresholdInScope.length > 0) {
    flags.push('threshold_in_scope');
    parts.push(`Threshold scope applies for ${uniq(thresholdInScope.map((d) => d.scopeName)).join(', ')}`);
  }

  if (thirdCountry.length > 0) {
    flags.push('third_country_route');
    parts.push(`Third-country (Art. 40a) route applies via ${uniq(thirdCountry.map((d) => d.scopeName)).join(', ')}`);
  }
  if (valueChain.length > 0) {
    flags.push('value_chain_protected');
    parts.push('Value-chain protection / request rights apply');
  }
  if (thresholdInScope.length === 0 && dutyActive.length === 0 && thirdCountry.length === 0 && unresolved.length === 0) {
    flags.push('no_direct_duty_identified');
    parts.push('No direct EU-level reporting duty identified on the encoded requirements');
  }
  if (unresolved.length > 0) {
    flags.push('unresolved_items');
    parts.push(`${unresolved.length} determination(s) unresolved and awaiting input`);
  }
  if (!nationalLawResolved) {
    flags.push('national_review_required');
    parts.push('national-law status requires review — this is NOT a final legal conclusion');
  }

  return {
    program: pack.program,
    headline: parts.join('. ') + '.',
    statusFlags: flags,
    nationalLawResolved,
  };
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
