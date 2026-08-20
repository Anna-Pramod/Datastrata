/**
 * Condition-tree renderer.
 *
 * A `Condition` tree is the encoding of a legal rule; a reviewer (human, or
 * later an AI prosecutor) checks that encoding against the law itself. That
 * check has to happen in English, not JSON — arguing against JSON only
 * proves a model can read JSON, not that the encoding matches the law. This
 * module is the one place that turns a `Condition` (and a `Requirement`
 * built from one) into prose a reviewer can actually argue with.
 *
 * Two constraints hold in tension:
 *  - `featuresFromEnglish` (a later module) must recover structural paths
 *    like `all[1].any[0]` from the rendered text, so `all`/`any`/`not`
 *    nesting is emitted through a fixed, parseable grammar: exactly the
 *    markers `ALL of:`, `ANY of:` and `NOT:`, two-space indent per level,
 *    numbered children.
 *  - Everything *inside* that scaffolding — the individual comparisons,
 *    lookups and references a rule is built from — has to read as English a
 *    person would write, not a transliteration of the op name. So `not`
 *    only ever wraps a leaf clause (a single comparison, membership test,
 *    etc.) unmodified: it renders as one flat sentence, "it is not the case
 *    that …", rather than a nested `NOT:` block, because nesting a nine-word
 *    negation for no structural reason is exactly the kind of stilted output
 *    this module exists to avoid. `NOT:` is reserved for the case where it
 *    is structurally necessary — negating a compound (`all`/`any`) clause,
 *    where the reader genuinely needs the nested, numbered breakdown.
 *
 * The three-valued evaluator (`src/condition/evaluate.ts`) never turns
 * `not(cmp gt X)` into a `lte` comparison — `INDETERMINATE` behaves
 * differently under the two. This renderer must not perform that
 * transformation either: `cmp`'s comparator phrase is chosen once, from
 * `cmp.cmp` alone, and never varies by whether a `not` wraps it.
 *
 * Pure and deterministic: no filesystem, network, clock or randomness — the
 * same `Condition` renders identically every time, which is what lets a
 * verification pass diff renderings across pack versions.
 */

import type { CmpOp, Condition, FactType, Requirement } from '../types';
import { factLabel, factUnit, renderValue } from './vocabulary';

export const RENDERER_VERSION = '1.0.0';

export interface RenderContext {
  factTypes: FactType[];
  /**
   * The pack's catalogues, keyed by name. `catalogues.json` carries no
   * human label for a catalogue (only `entries`, `missReason` and an
   * optional `note`), so `in_catalogue` renders the catalogue name the same
   * way `mechanicalLabel` handles an unlabelled fact: de-slugged, never
   * guessed at. The contents are not currently read; carried on the context
   * because a catalogue's `note` may be worth surfacing later.
   */
  catalogues: Record<string, unknown>;
}

const COMPARATOR_PHRASE: Record<CmpOp, string> = {
  gt: 'exceeds',
  gte: 'is at least',
  lt: 'is below',
  lte: 'is at most',
};

function pad(level: number): string {
  return '  '.repeat(level);
}

/** Joins prose alternatives with ", " and a final "or" (Oxford-comma style for 3+). */
function joinOr(items: string[]): string {
  if (items.length === 0) return '(none)';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

/**
 * Negates a boolean fact label written as a predicate ("is a parent
 * undertaking", "qualifying EU subsidiary exists") into its negative form,
 * handling the two patterns the real labels use and falling back to a plain
 * "not " prefix otherwise — deliberately dumb, in the same spirit as
 * `mechanicalLabel`: a slightly informal fallback beats a wrong guess at
 * grammar.
 */
function negateBooleanLabel(label: string): string {
  if (/^is\b/i.test(label)) return label.replace(/^is\b/i, 'is not');
  if (/\bexists$/i.test(label)) return label.replace(/\bexists$/i, 'does not exist');
  return `not ${label}`;
}

/** De-slugs a scope type or pack-flag identifier for inline prose: underscores to spaces only, never guessed expansions. */
function deslug(id: string): string {
  return id.replace(/_/g, ' ');
}

/** True for `all`/`any`, and for `not` wrapping (transitively) one of those — the shapes that need the multi-line marker grammar. */
function isStructural(condition: Condition): boolean {
  if (condition.op === 'all' || condition.op === 'any') return true;
  if (condition.op === 'not') return isStructural(condition.of);
  return false;
}

/**
 * Renders a leaf condition (never `all`/`any`; `not` only when its own
 * child is itself a leaf) as prose. May return a multi-line string in one
 * edge case: `quantifier_any` whose `where` clause is itself compound — the
 * nested clause still needs the block grammar, just introduced by this
 * primitive's own leaf-level phrasing rather than by `ALL of:`/`ANY of:`
 * directly.
 *
 * This switch is where all seventeen `Condition` primitives are enumerated,
 * and it is the exhaustiveness guarantee: adding a member to the `Condition`
 * union without a case here fails `npm run typecheck` at the `never`
 * assignment below, not silently at runtime.
 */
function renderFlat(condition: Condition, ctx: RenderContext): string {
  switch (condition.op) {
    case 'all':
    case 'any':
      // Never reached through the public entry points: renderConditionLines
      // and renderNumberedChild both route all/any through the block-marker
      // path before renderFlat is called. Guarded here only so the switch
      // stays total over every Condition member for the exhaustiveness check.
      throw new Error(`renderFlat called on a structural op: ${condition.op}`);

    case 'not':
      return `it is not the case that ${renderFlat(condition.of, ctx)}`;

    case 'cmp': {
      const label = factLabel(condition.fact, ctx.factTypes);
      const unit = factUnit(condition.fact, ctx.factTypes);
      return `${label} ${COMPARATOR_PHRASE[condition.cmp]} ${renderValue(condition.value, unit)}`;
    }

    case 'eq': {
      const label = factLabel(condition.fact, ctx.factTypes);
      if (typeof condition.value === 'boolean') {
        return condition.value ? label : negateBooleanLabel(label);
      }
      const unit = factUnit(condition.fact, ctx.factTypes);
      return `${label} is ${renderValue(condition.value, unit)}`;
    }

    case 'in_set': {
      const label = factLabel(condition.fact, ctx.factTypes);
      const unit = factUnit(condition.fact, ctx.factTypes);
      return `${label} is ${joinOr(condition.set.map((v) => renderValue(v, unit)))}`;
    }

    case 'in_catalogue': {
      const label = factLabel(condition.fact, ctx.factTypes);
      return `${label} is listed in the '${deslug(condition.catalogue)}' catalogue`;
    }

    case 'prefix_in': {
      const label = factLabel(condition.fact, ctx.factTypes);
      return `${label} starts with ${joinOr(condition.prefixes)}`;
    }

    case 'exists': {
      const label = factLabel(condition.fact, ctx.factTypes);
      return `${label} is on record`;
    }

    case 'count_cmp': {
      const label = factLabel(condition.fact, ctx.factTypes);
      const unit = factUnit(condition.fact, ctx.factTypes);
      return `the number of ${label} ${COMPARATOR_PHRASE[condition.cmp]} ${renderValue(condition.value, unit)}`;
    }

    case 'quantifier_any': {
      const scope = deslug(condition.scopeType);
      const whereLines = renderConditionLines(condition.where, ctx);
      if (whereLines.length === 1) {
        return `at least one ${scope} scope where ${whereLines[0]}`;
      }
      return `at least one ${scope} scope where:\n${whereLines.map((l) => `${pad(1)}${l}`).join('\n')}`;
    }

    case 'sum_cmp': {
      const label = factLabel(condition.fact, ctx.factTypes);
      const unit = factUnit(condition.fact, ctx.factTypes);
      const scope = deslug(condition.scopeType);
      return `the total ${label}, summed across ${scope} scopes, ${COMPARATOR_PHRASE[condition.cmp]} ${renderValue(condition.value, unit)}`;
    }

    case 'fy_starts_on_or_after':
      return `the financial year starts on or after ${condition.date}`;

    case 'fy_start_year_in':
      return `the financial year starts in ${joinOr(condition.years.map(String))}`;

    case 'year_diff_lt': {
      const label = factLabel(condition.fromFact, ctx.factTypes);
      return `fewer than ${condition.years} years have passed since ${label}`;
    }

    case 'requirement_ref':
      // Rule: name the requirement id and the expected Truth verbatim — never
      // paraphrase APPLIES/DOES_NOT_APPLY/INDETERMINATE into prose, which
      // would blur the engine's three-valued logic.
      return `requirement ${condition.requirement} evaluates to ${condition.expect}`;

    case 'pack_flag':
      return `the '${deslug(condition.flag)}' pack flag is set`;

    default: {
      const exhaustive: never = condition;
      throw new Error(`unhandled condition op: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Renders one numbered child within a block (`ALL of:`/`ANY of:`/`NOT:`) at
 * the given indent level. Recurses into the marker grammar for a structural
 * child; falls back to `renderFlat` (which may itself be multi-line, see
 * `quantifier_any` above) for a leaf.
 */
function renderNumberedChild(condition: Condition, ctx: RenderContext, indent: number, n: number): string[] {
  if (condition.op === 'all' || condition.op === 'any') {
    const marker = condition.op === 'all' ? 'ALL of:' : 'ANY of:';
    const lines = [`${pad(indent)}${n}. ${marker}`];
    condition.of.forEach((child, i) => lines.push(...renderNumberedChild(child, ctx, indent + 1, i + 1)));
    return lines;
  }
  if (condition.op === 'not' && isStructural(condition.of)) {
    const lines = [`${pad(indent)}${n}. NOT:`];
    lines.push(...renderNumberedChild(condition.of, ctx, indent + 1, 1));
    return lines;
  }
  const text = renderFlat(condition, ctx);
  const [first = '', ...rest] = text.split('\n');
  return [`${pad(indent)}${n}. ${first}`, ...rest.map((l) => `${pad(indent + 1)}${l}`)];
}

/** Renders a condition at the root (no numbering, indent 0) as an array of lines. */
function renderConditionLines(condition: Condition, ctx: RenderContext): string[] {
  if (condition.op === 'all' || condition.op === 'any') {
    const marker = condition.op === 'all' ? 'ALL of:' : 'ANY of:';
    const lines = [marker];
    condition.of.forEach((child, i) => lines.push(...renderNumberedChild(child, ctx, 1, i + 1)));
    return lines;
  }
  if (condition.op === 'not' && isStructural(condition.of)) {
    const lines = ['NOT:'];
    lines.push(...renderNumberedChild(condition.of, ctx, 1, 1));
    return lines;
  }
  return renderFlat(condition, ctx).split('\n');
}

/**
 * Renders a `Condition` tree to English. `all`/`any` always use the fixed
 * `ALL of:`/`ANY of:` marker grammar with two-space indent per level and
 * numbered children; `not` uses the same for a compound child but collapses
 * to one flat "it is not the case that …" sentence for a leaf child, since a
 * `NOT:` block around a single comparison has no structure worth exposing.
 * Every other primitive renders as one atom of natural prose built from
 * `factLabel`/`factUnit`/`renderValue`.
 */
export function renderCondition(condition: Condition, ctx: RenderContext): string {
  return renderConditionLines(condition, ctx).join('\n');
}

/**
 * Renders a `SelectionCase`'s `when` clause and value as one ordered entry.
 * Inline ("If X, the applicable value is Y.") when `when` renders flat;
 * introduces an indented block when `when` is compound, since the evaluator
 * takes the first matching case and the reviewer needs to see exactly what
 * each one tests.
 */
function renderCaseEntry(when: Condition, value: string, label: string | undefined, ctx: RenderContext, n: number): string[] {
  const suffix = label ? ` (${label})` : '';
  const whenLines = renderConditionLines(when, ctx);
  if (whenLines.length === 1) {
    return [`  ${n}. If ${whenLines[0]}, the applicable value is ${value}${suffix}.`];
  }
  return [
    `  ${n}. If the following holds, the applicable value is ${value}${suffix}:`,
    ...whenLines.map((l) => `     ${l}`),
  ];
}

/**
 * Renders a `Requirement` to English: its id and title, then either the
 * boolean condition it evaluates, or — for a selection requirement — every
 * case in evaluation order (the evaluator takes the first match, so order is
 * meaningful and stated explicitly) followed by the explicit fallback to
 * `defaultValue`.
 */
export function renderRequirement(requirement: Requirement, ctx: RenderContext): string {
  const header = `${requirement.id} — ${requirement.title}`;

  if (requirement.kind === 'selection') {
    const cases = requirement.cases ?? [];
    const lines = [header, '', 'The applicable value is chosen by the first matching case below, in order:'];
    cases.forEach((c, i) => lines.push(...renderCaseEntry(c.when, c.value, c.label, ctx, i + 1)));
    lines.push(
      '',
      requirement.defaultValue !== undefined
        ? `Otherwise, the applicable value is ${requirement.defaultValue}.`
        : 'Otherwise, no case matched and no default value is defined.',
    );
    return lines.join('\n');
  }

  const conditionText = requirement.condition
    ? renderCondition(requirement.condition, ctx)
    : '(no condition — this requirement is never satisfied)';
  return `${header}\n\nThis applies when:\n${conditionText}`;
}
