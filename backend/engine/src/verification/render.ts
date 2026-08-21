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
 *    like `all[1].any[0]` from the rendered text, so `all`/`any`/`not`/
 *    `quantifier_any` nesting is emitted through a fixed, parseable grammar:
 *    exactly the markers `ALL of:`, `ANY of:`, `NOT:`, and `quantifier_any`'s
 *    own closed-template `` `at least one <scope> scope where:` `` prose,
 *    two-space indent per level, numbered children.
 *  - Everything *inside* that scaffolding — the individual comparisons,
 *    lookups and references a rule is built from — has to read as English a
 *    person would write, not a transliteration of the op name. So `not` and
 *    `quantifier_any` only ever wrap a leaf clause (a single comparison,
 *    membership test, etc.) unmodified when there is no structure worth
 *    exposing: `not` of a leaf renders as one flat sentence, "it is not the
 *    case that …", rather than a nested `NOT:` block, because nesting a
 *    nine-word negation for no structural reason is exactly the kind of
 *    stilted output this module exists to avoid, and likewise
 *    `quantifier_any` of a leaf inlines as "at least one … scope where …".
 *    The marker grammar is reserved for when it is structurally necessary —
 *    wrapping a compound (`all`/`any`, or transitively another structural
 *    `not`/`quantifier_any`) clause, where the reader genuinely needs the
 *    nested, numbered breakdown.
 *
 *    Precisely: a `Condition` is *structural* — introduced by a marker line
 *    that consumes one numbered-child position, with its own child(ren)
 *    rendered two further spaces of indent, numbered from 1 — exactly when
 *    it is `all`/`any` (always, since they always have children to
 *    enumerate), or `not`/`quantifier_any` whose single child (`not.of` /
 *    `quantifier_any.where`) is itself structural, recursively. Every other
 *    node renders as exactly one line with no marker.
 *
 *    A parser does **not** get to treat "line ends in `:`" as the marker
 *    test — that is necessary but nowhere near sufficient. `renderRequirement`
 *    (below) emits its own fixed line for a selection case with a compound
 *    `when` — `` `If the following holds, the applicable value is <V>:` ``
 *    — which also ends in `:` and can sit directly above a genuine
 *    `quantifier_any` marker line in the same rendering. The full grammar,
 *    every closed template (all thirteen always-flat primitives, both
 *    conditionally-structural ones, and the `renderRequirement` templates
 *    that must be recognized first to isolate a pure `Condition` substring),
 *    and this exact ambiguity worked through with real output, are recorded
 *    in `docs/verification-grammar.md` — written for, and to be built
 *    against by, a parser author who will not open this file. Keep that
 *    document in sync with this one; it was derived by rendering examples
 *    and reading the output, not by transcribing the code below, and should
 *    be re-derived the same way if this file changes.
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

import type { AuthoredRequirement, CmpOp, Condition, FactType } from '../types';
import { factLabel, factUnit, renderValue } from './vocabulary';

/**
 * The version of the *output grammar* — the English this module emits — not of
 * the module's internals. A signature pins `rendererVersion` alongside a hash
 * of the rendered text so that "which renderer produced the English this
 * person read" has an answer; if one version string covered two grammars, the
 * moved hash would look like ordinary content drift and the version would have
 * lied about text somebody signed.
 *
 * So: **any change to emitted text obliges a bump.** A new or altered
 * template, a changed word, a changed separator or indent — all of them,
 * however cosmetic they look, because the reader of a signature cannot tell
 * cosmetic from substantive after the fact. Refactoring that provably leaves
 * every rendering byte-identical does not.
 *
 * Minor for a grammar that gained or reshaped a template; patch for a fix to
 * an existing one. 1.1.0 added `in_catalogue`'s miss-reason clause and changed
 * `in_set` to the `is one of: ` form that keeps it distinct from `eq`.
 */
export const RENDERER_VERSION = '1.1.0';

export interface RenderContext {
  factTypes: FactType[];
  /**
   * The pack's catalogues, keyed by name. `catalogues.json` carries no
   * human label for a catalogue (only `entries`, `missReason` and an
   * optional `note`), so `in_catalogue` renders the catalogue name the same
   * way `mechanicalLabel` handles an unlabelled fact: de-slugged, never
   * guessed at. The contents are not currently read; carried on the context
   * because a catalogue's `note` may be worth surfacing later.
   *
   * A catalogue's own `missReason` is deliberately *not* rendered from here:
   * only the `in_catalogue` condition's optional override is (see
   * `renderFlat`). Splicing the catalogue's default into every clause would
   * put pack-wide configuration into the text of each rule and make the two
   * indistinguishable to a reviewer, when it is exactly their difference
   * that a requirement like CSRD-S-013 turns on.
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

/**
 * The four `Condition` shapes that *can* be structural — the only ones with
 * a nested `Condition` to introduce a marker for. Narrowing to this type (via
 * `isStructural`'s type-predicate return below) is what turns
 * `structuralMarkerLine`/`structuralChildren`'s switches into compile-time
 * exhaustiveness checks, the same guarantee `renderFlat`'s `never` branch
 * gives the thirteen leaf primitives, rather than a runtime-only assumption.
 */
type StructuralShapedCondition = Extract<Condition, { op: 'all' | 'any' | 'not' | 'quantifier_any' }>;

/**
 * True for `all`/`any` (unconditionally — they always have children to
 * enumerate), and for `not`/`quantifier_any` when their single child
 * (`not.of`/`quantifier_any.where`) is itself structural, recursively.
 * These are exactly the shapes that need the multi-line marker grammar;
 * everything else renders as one line of prose (see `renderFlat`). A type
 * predicate, not just `boolean`: every caller that checks `isStructural`
 * gets `condition` narrowed to `StructuralShapedCondition` for free, so
 * `structuralMarkerLine`/`structuralChildren` can only ever be called with
 * an argument type they exhaustively cover.
 *
 * `sum_cmp` was checked, not assumed, against this list: unlike
 * `quantifier_any`, it carries no nested `Condition` (`{ scopeType, fact,
 * cmp, value }` only), so it can never need the block grammar and is
 * correctly absent here.
 */
function isStructural(condition: Condition): condition is StructuralShapedCondition {
  if (condition.op === 'all' || condition.op === 'any') return true;
  if (condition.op === 'not') return isStructural(condition.of);
  if (condition.op === 'quantifier_any') return isStructural(condition.where);
  return false;
}

/** The marker line for a structural condition — same fixed three for `all`/`any`/`not`, plus `quantifier_any`'s own prose acting as its marker. */
function structuralMarkerLine(condition: StructuralShapedCondition): string {
  switch (condition.op) {
    case 'all':
      return 'ALL of:';
    case 'any':
      return 'ANY of:';
    case 'not':
      return 'NOT:';
    case 'quantifier_any':
      return `at least one ${deslug(condition.scopeType)} scope where:`;
    default: {
      const exhaustive: never = condition;
      throw new Error(`unhandled structural condition op: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** The numbered children under a structural condition's marker line. `not`/`quantifier_any` always contribute exactly one. */
function structuralChildren(condition: StructuralShapedCondition): Condition[] {
  switch (condition.op) {
    case 'all':
    case 'any':
      return condition.of;
    case 'not':
      return [condition.of];
    case 'quantifier_any':
      return [condition.where];
    default: {
      const exhaustive: never = condition;
      throw new Error(`unhandled structural condition op: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Renders a non-structural condition as one line of prose: a genuine leaf
 * (`cmp`, `eq`, …), or `not`/`quantifier_any` whose single child is itself
 * non-structural (per `isStructural`). Callers (`renderNumberedChild`,
 * `renderConditionLines`) always check `isStructural` first and route a
 * structural condition through `structuralMarkerLine`/`structuralChildren`
 * instead, so by construction every value this function is ever called with
 * — including recursively, for `not`'s and `quantifier_any`'s child — is
 * guaranteed non-structural, and this always returns a single line.
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
      // "is one of:" rather than a bare "is": a one-item `in_set` and an `eq`
      // on the same value are different encodings, and rendering both as
      // `<label> is <value>` made the English non-injective — neither a
      // reviewer nor the English-side parser could tell which op they were
      // reading. The list marker costs three characters and separates them.
      const label = factLabel(condition.fact, ctx.factTypes);
      const unit = factUnit(condition.fact, ctx.factTypes);
      return `${label} is one of: ${joinOr(condition.set.map((v) => renderValue(v, unit)))}`;
    }

    case 'in_catalogue': {
      // `missReason` is the reason code the evaluator emits when the fact's
      // value is absent from the catalogue: `src/condition/evaluate.ts` reads
      // `cond.missReason ?? cat.missReason`, so a condition-level value
      // overrides the catalogue's own default. That override is part of what
      // the rule says — CSRD-S-013's entire purpose is to route a miss to
      // `national_law_unresolved` — and leaving it unrendered hid a
      // load-bearing field from the reviewer whose signature attests the
      // encoding. Rendered only when the condition carries one, so a rule
      // that simply takes the catalogue's default does not gain a clause
      // implying it overrode it.
      const label = factLabel(condition.fact, ctx.factTypes);
      const listed = `${label} is listed in the '${deslug(condition.catalogue)}' catalogue`;
      return condition.missReason ? `${listed}; a miss is recorded as '${deslug(condition.missReason)}'` : listed;
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
      // Only reached when isStructural(condition) is false, i.e. `where` is
      // itself a leaf — a structural `where` is routed through the
      // structuralMarkerLine/structuralChildren path before renderFlat is
      // ever called (see renderNumberedChild/renderConditionLines), so
      // `where` here is guaranteed flat and this is always one line.
      return `at least one ${deslug(condition.scopeType)} scope where ${renderFlat(condition.where, ctx)}`;
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
 * Renders one numbered child within a block (`ALL of:`/`ANY of:`/`NOT:`, or
 * `quantifier_any`'s own marker line) at the given indent level. Recurses
 * into the marker grammar for a structural child; falls back to
 * `renderFlat` (always exactly one line — see `renderFlat`'s doc comment)
 * for a leaf.
 */
function renderNumberedChild(condition: Condition, ctx: RenderContext, indent: number, n: number): string[] {
  if (isStructural(condition)) {
    const lines = [`${pad(indent)}${n}. ${structuralMarkerLine(condition)}`];
    structuralChildren(condition).forEach((child, i) => lines.push(...renderNumberedChild(child, ctx, indent + 1, i + 1)));
    return lines;
  }
  return [`${pad(indent)}${n}. ${renderFlat(condition, ctx)}`];
}

/** Renders a condition at the root (no numbering, indent 0) as an array of lines. */
function renderConditionLines(condition: Condition, ctx: RenderContext): string[] {
  if (isStructural(condition)) {
    const lines = [structuralMarkerLine(condition)];
    structuralChildren(condition).forEach((child, i) => lines.push(...renderNumberedChild(child, ctx, 1, i + 1)));
    return lines;
  }
  return [renderFlat(condition, ctx)];
}

/**
 * Renders a `Condition` tree to English. A structural node — `all`/`any`
 * unconditionally, or `not`/`quantifier_any` wrapping a structural child —
 * uses the fixed marker grammar (`ALL of:`/`ANY of:`/`NOT:`, or
 * `quantifier_any`'s own "at least one … scope where:" prose) with
 * two-space indent per level and numbered children. `not`/`quantifier_any`
 * wrapping a non-structural (leaf) child instead collapses to one flat
 * sentence — "it is not the case that …" / "at least one … scope where …" —
 * since a marker block around a single comparison has no structure worth
 * exposing. Every leaf primitive renders as one atom of natural prose built
 * from `factLabel`/`factUnit`/`renderValue`.
 */
export function renderCondition(condition: Condition, ctx: RenderContext): string {
  return renderConditionLines(condition, ctx).join('\n');
}

/**
 * Renders a `SelectionCase`'s `when` clause and value as one ordered entry.
 * Inline ("If X, the applicable value is Y.") when `when` renders flat;
 * introduces an indented block when `when` is compound, since the evaluator
 * takes the first matching case and the reviewer needs to see exactly what
 * each one tests. The case bullet itself sits at indent level 1 (`pad(1)`,
 * two spaces); a compound `when`'s nested lines sit at level 2 (`pad(2)`,
 * four spaces) — a multiple of two from column 0, like every other block in
 * this grammar, rather than aligned to the bullet text's own width.
 */
function renderCaseEntry(when: Condition, value: string, label: string | undefined, ctx: RenderContext, n: number): string[] {
  const suffix = label ? ` (${label})` : '';
  const whenLines = renderConditionLines(when, ctx);
  if (whenLines.length === 1) {
    return [`${pad(1)}${n}. If ${whenLines[0]}, the applicable value is ${value}${suffix}.`];
  }
  return [
    `${pad(1)}${n}. If the following holds, the applicable value is ${value}${suffix}:`,
    ...whenLines.map((l) => `${pad(2)}${l}`),
  ];
}

/**
 * Renders a `Requirement` to English: its id and title, then either the
 * boolean condition it evaluates, or — for a selection requirement — every
 * case in evaluation order (the evaluator takes the first match, so order is
 * meaningful and stated explicitly) followed by the explicit fallback to
 * `defaultValue`.
 *
 * The parameter is `AuthoredRequirement`: this text is what a signature hashes
 * and what prosecutors argued against, and a status the loader attached after
 * the fact is no part of it. A `Requirement` still satisfies it.
 */
export function renderRequirement(requirement: AuthoredRequirement, ctx: RenderContext): string {
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
