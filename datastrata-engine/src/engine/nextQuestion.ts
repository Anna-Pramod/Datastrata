/**
 * Next-question compiler (Pass 3 §3.3): the interview is compiled from the
 * requirement library, never designed as a fixed form. Rank unresolved facts
 * by how much determination weight each answer unblocks; range answers that
 * straddle a legal threshold outrank plain missing facts (they are the
 * highest-information ask).
 */

import type { Determination, KnowledgePack, Profile, Question, QuestionShowWhen, RankedQuestion, Truth } from '../types';
import { bestResult } from './results';

const SEVERITY_WEIGHT: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0.5 };
const RANGE_BONUS = 2;
const BASE_MODULE_WEIGHT = 0.1;

interface NeedAgg {
  weight: number;
  blocked: Set<string>;
}

export function rankNextQuestions(pack: KnowledgePack, determinations: Determination[], profile: Profile): RankedQuestion[] {
  // Aggregate needs from every unresolved determination.
  const needs = new Map<string, NeedAgg>();
  for (const d of determinations) {
    if (d.result !== 'INDETERMINATE') continue;
    for (const n of d.needs) {
      const agg = needs.get(n.factType) ?? { weight: 0, blocked: new Set<string>() };
      agg.weight += (SEVERITY_WEIGHT[d.severity] ?? 1) + (n.reason === 'range_crosses_threshold' ? RANGE_BONUS : 0);
      agg.blocked.add(d.requirementId);
      needs.set(n.factType, agg);
    }
  }

  const answered = new Set(profile.facts.filter((f) => f.confirmed && f.value.kind !== 'unknown').map((f) => f.factType));

  const ranked: RankedQuestion[] = [];
  for (const q of pack.questions) {
    if (!showWhenOk(q.showWhen, determinations, profile)) continue;
    // A fact stays askable if unanswered OR still needed — a confirmed range
    // that straddles a threshold must be re-asked for a narrower value.
    const askable = q.factTypes.filter((ft) => !answered.has(ft) || needs.has(ft));
    if (askable.length === 0 && q.factTypes.length > 0) continue; // nothing left to ask
    let weight = 0;
    const blocked = new Set<string>();
    for (const ft of q.factTypes) {
      const agg = needs.get(ft);
      if (agg) {
        weight += agg.weight;
        for (const b of agg.blocked) blocked.add(b);
      }
    }
    if (weight === 0) weight = BASE_MODULE_WEIGHT; // module question shown by gate, not by blocked weight
    ranked.push({ question: q, weight, blockedDeterminations: [...blocked] });
  }

  ranked.sort((a, b) => b.weight - a.weight || a.question.order - b.question.order);
  return ranked;
}

export function showWhenOk(sw: QuestionShowWhen, determinations: Determination[], profile: Profile): boolean {
  const checks: boolean[] = [];
  const confirmed = profile.facts.filter((f) => f.confirmed && f.value.kind !== 'unknown');

  const factValue = (factType: string): string | number | boolean | undefined => {
    const f = confirmed.find((x) => x.factType === factType);
    if (!f) return undefined;
    const v = f.value;
    if (v.kind === 'string' || v.kind === 'date') return v.value;
    if (v.kind === 'boolean' || v.kind === 'number' || v.kind === 'year') return v.value;
    return undefined;
  };

  if (sw.always !== undefined) checks.push(sw.always);
  if (sw.allOf) checks.push(sw.allOf.every((c) => showWhenOk(c, determinations, profile)));
  if (sw.anyOf) checks.push(sw.anyOf.some((c) => showWhenOk(c, determinations, profile)));
  if (sw.factEquals) checks.push(factValue(sw.factEquals.fact) === sw.factEquals.value);
  if (sw.factExists) checks.push(factValue(sw.factExists.fact) !== undefined);
  if (sw.factInSet) {
    const v = factValue(sw.factInSet.fact);
    if (v === undefined) checks.push(false);
    else {
      const inSet = sw.factInSet.set.includes(String(v));
      checks.push(sw.factInSet.negate ? !inSet : inSet);
    }
  }
  if (sw.requirementIs) checks.push(bestResult(determinations, sw.requirementIs.requirement) === sw.requirementIs.truth);
  if (sw.requirementResolved) {
    const r: Truth | undefined = bestResult(determinations, sw.requirementResolved.requirement);
    checks.push(r === 'APPLIES' || r === 'DOES_NOT_APPLY');
  }

  return checks.length > 0 && checks.every(Boolean);
}
