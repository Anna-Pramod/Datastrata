/**
 * Fact and value vocabulary.
 *
 * `fact-types.json` carries no human label — only ids like
 * `entity.net_turnover_eur`. Mechanically de-slugging that yields "net
 * turnover eur", which is not what the law says and would generate false
 * challenges in the very verification pass this vocabulary exists to
 * support. It also carries no unit, and `dataType` is `number_or_range` for
 * both a EUR turnover fact and a headcount fact, so `dataType` alone cannot
 * tell a EUR 450 000 000 threshold from a 450 000 000-employee one.
 *
 * Explicit `label` and `unit` on the fact type are therefore the source of
 * truth. `mechanicalLabel` is a deliberately dumb fallback — it drops the
 * scope prefix and un-slugs the rest, but never guesses at expansions —
 * so an unlabelled fact still renders instead of crashing the renderer.
 * `assertFactVocabularyCoverage` is the gate that keeps that fallback from
 * silently becoming the answer: any referenced fact with no label, an
 * unresolved `labelNote`, or (where it is compared numerically) no unit
 * fails the build. Recording uncertainty via `labelNote` is not the same as
 * resolving it, so an unresolved note fails the gate exactly like a missing
 * label does.
 *
 * Every function here is pure: no filesystem, network or clock. This is the
 * vocabulary layer the renderer and the independent checker both stand on,
 * and both need it to be trustworthy in isolation from how the knowledge
 * pack was loaded.
 */

import type { Condition, FactType, KnowledgePack, Requirement } from '../types';

/**
 * The ops whose fact reference is a value being compared numerically
 * (magnitude or count), and therefore needs a unit to be unambiguous.
 * `eq`, `in_set`, `in_catalogue`, `prefix_in` and `exists` compare or test
 * identity/presence, not magnitude — a country code or a legal form has no
 * unit to give it.
 */
const NUMERIC_COMPARISON_OPS = new Set(['cmp', 'count_cmp', 'sum_cmp']);

/**
 * Mechanically de-slugs a fact id: drops the scope prefix (up to the first
 * `.`) and turns underscores into spaces. Deliberately does not expand
 * abbreviations — a wrong guess at legal wording is worse than a visibly
 * unfinished string reaching a reviewer.
 */
export function mechanicalLabel(factId: string): string {
  const dot = factId.indexOf('.');
  const rest = dot === -1 ? factId : factId.slice(dot + 1);
  return rest.replace(/_/g, ' ');
}

function findFactType(factId: string, factTypes: FactType[]): FactType | undefined {
  return factTypes.find((f) => f.id === factId);
}

/** The explicit label when the fact type carries one, the mechanical fallback otherwise. */
export function factLabel(factId: string, factTypes: FactType[]): string {
  const ft = findFactType(factId, factTypes);
  return ft?.label ?? mechanicalLabel(factId);
}

/** The explicit unit when the fact type carries one, `null` otherwise — never guessed. */
export function factUnit(factId: string, factTypes: FactType[]): string | null {
  return findFactType(factId, factTypes)?.unit ?? null;
}

/**
 * Groups the integer part of a non-negative-formatted number string with
 * ordinary space (U+0020) separators every three digits, e.g. "450000000"
 * -> "450 000 000". Written as an escape sequence, not a literal space in
 * the source: the legal text this mirrors uses ordinary spaces, and
 * `normalizeWhitespace` collapses narrow/non-breaking variants to U+0020
 * anyway, so an invisible-looking separator character in source code would
 * only invite doubt about which space it is, for no behavioural gain.
 */
const THOUSANDS_SEPARATOR = '\u0020';

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
}

function formatNumber(value: number): string {
  const negative = value < 0;
  const [intPart, fracPart] = Math.abs(value).toString().split('.');
  const grouped = groupThousands(intPart ?? '0');
  const sign = negative ? '-' : '';
  return fracPart === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${fracPart}`;
}

/**
 * Renders a fact value for prose: numbers get ordinary-space thousands
 * separators and, when a unit is given, the unit appended; booleans render
 * as yes/no; strings render verbatim. A unit is only meaningful against a
 * magnitude, so it is never appended to a boolean or string rendering.
 */
export function renderValue(value: string | number | boolean, unit?: string | null): string {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') {
    const formatted = formatNumber(value);
    return unit ? `${formatted} ${unit}` : formatted;
  }
  return value;
}

/** Walks one condition tree, adding every fact id it references (by any op) into `into`. */
function collectFacts(c: Condition, into: Set<string>): void {
  switch (c.op) {
    case 'all':
    case 'any':
      c.of.forEach((x) => collectFacts(x, into));
      break;
    case 'not':
      collectFacts(c.of, into);
      break;
    case 'quantifier_any':
      collectFacts(c.where, into);
      break;
    case 'cmp':
    case 'eq':
    case 'in_set':
    case 'in_catalogue':
    case 'prefix_in':
    case 'exists':
    case 'count_cmp':
    case 'sum_cmp':
      into.add(c.fact);
      break;
    case 'year_diff_lt':
      into.add(c.fromFact);
      break;
    default:
      break;
  }
}

/** Walks one condition tree, adding the fact id of every numeric-comparison node into `into`. */
function collectNumericComparisonFacts(c: Condition, into: Set<string>): void {
  switch (c.op) {
    case 'all':
    case 'any':
      c.of.forEach((x) => collectNumericComparisonFacts(x, into));
      break;
    case 'not':
      collectNumericComparisonFacts(c.of, into);
      break;
    case 'quantifier_any':
      collectNumericComparisonFacts(c.where, into);
      break;
    default:
      if (NUMERIC_COMPARISON_OPS.has(c.op) && 'fact' in c) into.add(c.fact);
      break;
  }
}

/**
 * Every fact id a requirement references, deduped and sorted — walking
 * `condition` and, for selection requirements, every case's `when`.
 */
export function factsReferencedBy(requirement: Requirement): string[] {
  const facts = new Set<string>();
  if (requirement.condition) collectFacts(requirement.condition, facts);
  for (const c of requirement.cases ?? []) collectFacts(c.when, facts);
  return [...facts].sort();
}

/**
 * The gate. Throws when any fact referenced by the pack's requirements:
 *  - has no explicit `label`; or
 *  - carries `labelNote: "requires review"` — recording uncertainty is not
 *    resolving it; or
 *  - is used in a `cmp`, `count_cmp` or `sum_cmp` comparison and has no
 *    explicit `unit`.
 *
 * Names every offender in one error, not just the first, so a human fixing
 * the gap does not have to re-run the gate once per fact.
 */
export function assertFactVocabularyCoverage(pack: KnowledgePack): void {
  const referenced = new Set<string>();
  const numericComparison = new Set<string>();
  for (const r of pack.requirements) {
    for (const f of factsReferencedBy(r)) referenced.add(f);
    if (r.condition) collectNumericComparisonFacts(r.condition, numericComparison);
    for (const c of r.cases ?? []) collectNumericComparisonFacts(c.when, numericComparison);
  }

  const byId = new Map(pack.factTypes.map((f) => [f.id, f] as const));
  const problems: string[] = [];
  for (const factId of [...referenced].sort()) {
    const ft = byId.get(factId);
    if (!ft?.label) {
      problems.push(`${factId}: no label`);
      continue;
    }
    if (ft.labelNote === 'requires review') {
      problems.push(`${factId}: label marked "requires review" — unresolved`);
    }
    if (numericComparison.has(factId) && !ft.unit) {
      problems.push(`${factId}: used in a numeric comparison but has no unit`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Fact vocabulary coverage failed:\n - ${problems.join('\n - ')}`);
  }
}
