import type { Determination, Truth } from '../types';

/** The best (most positive) result for a requirement across all evaluated scopes. */
export function bestResult(determinations: Determination[], requirementId: string): Truth | undefined {
  const results = determinations.filter((d) => d.requirementId === requirementId).map((d) => d.result);
  if (results.length === 0) return undefined;
  if (results.includes('APPLIES')) return 'APPLIES';
  if (results.includes('INDETERMINATE')) return 'INDETERMINATE';
  return 'DOES_NOT_APPLY';
}
