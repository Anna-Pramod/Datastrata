/**
 * The binding-preserving feature model — the independent check on the renderer.
 *
 * WHY THIS FILE EXISTS
 *
 * Re-running the renderer is not verification of the renderer. If it
 * systematically misreads a condition it produces the same wrong English
 * every time, and every check that re-renders agrees with itself. This
 * project has already shipped that defect shape twice at Critical severity.
 * So this module builds a second, *independent* path — from the rendered
 * English back to structure — which can therefore disagree.
 *
 * Two rules make the disagreement possible:
 *
 * 1. `featuresFromEnglish` was written from `docs/verification-grammar.md`
 *    alone, never from `render.ts`. The grammar document is the renderer's
 *    stated output contract; a reader who transcribed the renderer's
 *    templates instead would have re-coupled the two sides through the
 *    author, which is the same defect wearing different clothes.
 *
 * 2. The import boundary is drawn at *symbol* granularity, not module
 *    granularity, and separates lookups from derivations. `factLabel` and
 *    `factUnit` are lookups into pack data: both sides may safely agree on
 *    what a fact is called, because a wrong answer there is wrong in the pack,
 *    not in either side's reasoning. `renderValue` is a *derivation*, and is
 *    banned: if both sides formatted numbers through it, a formatter that
 *    dropped a digit would yield the same wrong string on both sides and the
 *    check would pass. So the AST side records the canonical raw value
 *    (`450000000`), the English side parses the displayed value back to
 *    canonical with its own reader (`45 000 000` -> `45000000`), and a
 *    formatting defect shows up as a divergence. Units work the same way: the
 *    English side reads the unit token out of the text next to the threshold
 *    and must never call `factUnit()` for the fact it just identified, or the
 *    unit check would be a lookup compared against itself.
 *
 * WHY BINDINGS, NOT AN INVENTORY
 *
 * "turnover exceeds 450 000 000 EUR; employees exceed 1 000" and
 * "turnover exceeds 1 000; employees exceed 450 000 000 EUR" hold the
 * identical multiset of facts, comparators and thresholds. A checker
 * comparing collections self-agrees on that swap. So every atom carries a
 * structural `path` and atoms are compared *by path*, and `shape` pins the
 * whole operator tree rather than its depth.
 *
 * Divergence is a finding, never a throw: the caller decides severity.
 *
 * Pure: no filesystem, network or clock.
 */

import type { Condition, FactType, Requirement } from '../types';
import { factLabel, factUnit } from './vocabulary';

/** The slice of the render context this module needs. Structural, so a `RenderContext` satisfies it. */
export interface FeatureContext {
  factTypes: FactType[];
}

export interface AtomFeature {
  /** Structural address, e.g. `all[0]`, `all[1].any[0]`. Atoms are compared by this. */
  path: string;
  /** The primitive's op. */
  op: string;
  /** True when an odd number of `not` nodes enclose this atom. */
  negated: boolean;
  /** Rendered fact label — the one thing both sides may look up. */
  fact?: string;
  /** Canonical comparator token: gt | gte | lt | lte. */
  comparator?: string;
  /** CANONICAL value, e.g. "450000000" — never the displayed form. */
  threshold?: string;
  /** Canonical unit token, e.g. "EUR", or null when the atom carries none. */
  unit?: string | null;
  /** Scope type of a `sum_cmp`, in canonical (underscored) form. */
  scope?: string;
  /** Catalogue id, canonical (underscored) form. */
  catalogue?: string;
  requirementRef?: string;
  expect?: string;
  /** eq / in_set / prefix_in / pack_flag / date / year payloads, canonicalised. */
  literal?: string;
}

export interface ConditionFeatures {
  /** Ordered by path (document order, which is path order). */
  atoms: AtomFeature[];
  /** The operator tree, e.g. `all(cmp,cmp,any(eq,eq))`. Two distinct trees never share one. */
  shape: string;
}

export interface CaseFeature {
  index: number;
  when: ConditionFeatures;
  value: string;
}

export interface RequirementFeatures {
  kind: 'boolean' | 'selection';
  condition?: ConditionFeatures;
  cases?: CaseFeature[];
  defaultValue?: string;
}

// ---------------------------------------------------------------------------
// The intermediate tree
//
// Both producers build this, and one shared walk turns it into features. The
// independence that matters is between this module and `render.ts`; sharing a
// path/shape convention between this module's own two producers is what makes
// their outputs comparable at all.
// ---------------------------------------------------------------------------

type Leaf = { kind: 'leaf'; atom: Omit<AtomFeature, 'path' | 'negated'> };
type Node =
  | { kind: 'group'; op: 'all' | 'any'; of: Node[] }
  | { kind: 'not'; of: Node }
  | { kind: 'quantifier'; scope: string; of: Node }
  | Leaf;

function segment(path: string, op: string, index: number): string {
  const seg = `${op}[${index}]`;
  return path === '' ? seg : `${path}.${seg}`;
}

function collect(node: Node, path: string, negated: boolean, atoms: AtomFeature[]): string {
  switch (node.kind) {
    case 'group': {
      const parts = node.of.map((child, i) => collect(child, segment(path, node.op, i), negated, atoms));
      return `${node.op}(${parts.join(',')})`;
    }
    case 'not':
      return `not(${collect(node.of, segment(path, 'not', 0), !negated, atoms)})`;
    case 'quantifier':
      // The scope lives in the shape: `quantifier_any` alone would let a
      // rendering silently change which scope it quantifies over.
      return `quantifier_any<${node.scope}>(${collect(node.of, segment(path, 'quantifier_any', 0), negated, atoms)})`;
    case 'leaf':
      atoms.push({ path: path === '' ? 'root' : path, negated, ...node.atom });
      return node.atom.op;
  }
}

function assemble(node: Node): ConditionFeatures {
  const atoms: AtomFeature[] = [];
  const shape = collect(node, '', false, atoms);
  return { atoms, shape };
}

// ---------------------------------------------------------------------------
// Producer A — from the AST
//
// Values are taken raw from the AST and stringified with `String()`, which is
// not a formatter: no grouping, no unit splicing, no locale. That is the whole
// point of the `renderValue` ban.
// ---------------------------------------------------------------------------

/** Unit only ever attaches to a magnitude — never to a string or a boolean. */
function unitForNumber(value: unknown, fact: string, ctx: FeatureContext): string | null {
  return typeof value === 'number' ? factUnit(fact, ctx.factTypes) : null;
}

function conditionToNode(c: Condition, ctx: FeatureContext): Node {
  switch (c.op) {
    case 'all':
    case 'any':
      return { kind: 'group', op: c.op, of: c.of.map((child) => conditionToNode(child, ctx)) };
    case 'not':
      return { kind: 'not', of: conditionToNode(c.of, ctx) };
    case 'quantifier_any':
      return { kind: 'quantifier', scope: c.scopeType, of: conditionToNode(c.where, ctx) };
    case 'cmp':
    case 'count_cmp':
      return {
        kind: 'leaf',
        atom: {
          op: c.op,
          fact: factLabel(c.fact, ctx.factTypes),
          comparator: c.cmp,
          threshold: String(c.value),
          unit: factUnit(c.fact, ctx.factTypes),
        },
      };
    case 'sum_cmp':
      return {
        kind: 'leaf',
        atom: {
          op: c.op,
          fact: factLabel(c.fact, ctx.factTypes),
          comparator: c.cmp,
          threshold: String(c.value),
          unit: factUnit(c.fact, ctx.factTypes),
          scope: c.scopeType,
        },
      };
    case 'eq':
      return {
        kind: 'leaf',
        atom: {
          op: 'eq',
          fact: factLabel(c.fact, ctx.factTypes),
          literal: String(c.value),
          unit: unitForNumber(c.value, c.fact, ctx),
        },
      };
    case 'in_set':
      return {
        kind: 'leaf',
        atom: {
          op: 'in_set',
          fact: factLabel(c.fact, ctx.factTypes),
          literal: JSON.stringify(c.set.map(String)),
          unit: c.set.some((v) => typeof v === 'number') ? factUnit(c.fact, ctx.factTypes) : null,
        },
      };
    case 'in_catalogue':
      return {
        kind: 'leaf',
        atom: { op: 'in_catalogue', fact: factLabel(c.fact, ctx.factTypes), catalogue: c.catalogue },
      };
    case 'prefix_in':
      return {
        kind: 'leaf',
        atom: { op: 'prefix_in', fact: factLabel(c.fact, ctx.factTypes), literal: JSON.stringify(c.prefixes) },
      };
    case 'exists':
      return { kind: 'leaf', atom: { op: 'exists', fact: factLabel(c.fact, ctx.factTypes) } };
    case 'fy_starts_on_or_after':
      return { kind: 'leaf', atom: { op: 'fy_starts_on_or_after', literal: c.date } };
    case 'fy_start_year_in':
      return { kind: 'leaf', atom: { op: 'fy_start_year_in', literal: JSON.stringify(c.years.map(String)) } };
    case 'year_diff_lt':
      return {
        kind: 'leaf',
        atom: { op: 'year_diff_lt', fact: factLabel(c.fromFact, ctx.factTypes), literal: String(c.years) },
      };
    case 'requirement_ref':
      return { kind: 'leaf', atom: { op: 'requirement_ref', requirementRef: c.requirement, expect: c.expect } };
    case 'pack_flag':
      return { kind: 'leaf', atom: { op: 'pack_flag', literal: c.flag } };
  }
}

export function featuresFromCondition(condition: Condition, ctx: FeatureContext): ConditionFeatures {
  return assemble(conditionToNode(condition, ctx));
}

export function featuresFromRequirement(requirement: Requirement, ctx: FeatureContext): RequirementFeatures {
  if (requirement.kind === 'selection') {
    return {
      kind: 'selection',
      cases: (requirement.cases ?? []).map((c, index) => ({
        index,
        when: featuresFromCondition(c.when, ctx),
        value: c.value,
      })),
      defaultValue: requirement.defaultValue,
    };
  }
  return {
    kind: 'boolean',
    condition: requirement.condition ? featuresFromCondition(requirement.condition, ctx) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Producer B — from the English
//
// Everything below is written against docs/verification-grammar.md. Section
// references are to that document.
// ---------------------------------------------------------------------------

/**
 * Thousands separator per grammar §1: an ordinary space, written as an escape
 * so nobody has to squint at the source to decide which space character this
 * is.
 */
const SEP = '\u0020';

/** §4.1 comparator map, read backwards. Independent of the renderer's forward map by construction. */
const COMPARATOR_PHRASES: [string, string][] = [
  ['exceeds', 'gt'],
  ['is at least', 'gte'],
  ['is below', 'lt'],
  ['is at most', 'lte'],
];

/** §3's closed scope-phrase set, de-slugged. Mirrors `ScopeType`, which is a closed enum. */
const SCOPE_PHRASES = [
  'organization',
  'legal entity',
  'branch',
  'facility',
  'product',
  'trade lane',
  'supplier',
  'request',
  'counterparty',
];

const TRUTH_TOKENS = ['APPLIES', 'DOES_NOT_APPLY', 'INDETERMINATE'];

const NO_CONDITION_LINE = '(no condition — this requirement is never satisfied)';
const BOOLEAN_PREAMBLE = 'This applies when:';
const SELECTION_PREAMBLE = 'The applicable value is chosen by the first matching case below, in order:';
const OTHERWISE_NO_DEFAULT = 'Otherwise, no case matched and no default value is defined.';

export class EnglishParseError extends Error {}

/**
 * Inverts §4.4/§4.13's `DESLUG` (underscores to spaces) and §3's scope
 * de-slug. Deliberately its own reader rather than a shared helper: if the
 * renderer's de-slug ever mangled a character, this would recover a different
 * id and the comparison would say so.
 */
function reslug(text: string): string {
  return text.split(SEP).join('_');
}

/**
 * Reads a displayed value (§1) back to canonical form, splitting off any unit
 * token that follows it. `450 000 000 EUR` -> `{ canonical: '450000000', unit:
 * 'EUR' }`. Deliberately lenient about grouping: a renderer that grouped
 * wrongly must still be *readable*, so that the wrong number surfaces as a
 * threshold divergence rather than as a parse failure.
 */
function readValue(text: string): { canonical: string; unit: string | null } | null {
  const m = /^(-?[0-9\u0020]*[0-9](?:\.[0-9]+)?)(?:\u0020(.+))?$/.exec(text);
  if (!m) return null;
  const canonical = (m[1] ?? '').split(SEP).join('');
  if (!/^-?[0-9]+(?:\.[0-9]+)?$/.test(canonical)) return null;
  return { canonical, unit: m[2] ?? null };
}

/** §4.3's `JOIN_OR`, read backwards. */
function splitJoinOr(text: string): string[] {
  if (text === '(none)') return [];
  if (text.includes(`,${SEP}`)) {
    const parts = text.split(`,${SEP}`);
    const last = parts[parts.length - 1];
    if (last !== undefined && last.startsWith(`or${SEP}`)) parts[parts.length - 1] = last.slice(3);
    return parts;
  }
  const at = text.indexOf(`${SEP}or${SEP}`);
  if (at !== -1) return [text.slice(0, at), text.slice(at + 4)];
  return [text];
}

/** A set/list item, canonicalised: numbers lose their grouping and shed their unit; strings stay verbatim. */
function readListItem(text: string): { canonical: string; unit: string | null } {
  const v = readValue(text);
  return v ?? { canonical: text, unit: null };
}

/**
 * Every label the context knows, longest first. Labels are the one thing both
 * sides may look up (§ the header of this file), and anchoring on the known
 * set is what keeps a label containing a template word — "exceeds", "is at
 * least", "the number of" — from mis-splitting a line.
 */
function labelsOf(ctx: FeatureContext): string[] {
  const labels = ctx.factTypes.map((ft) => factLabel(ft.id, ctx.factTypes));
  return [...new Set(labels)].sort((a, b) => b.length - a.length);
}

/**
 * Tries every known label that sits at `text`'s start after `prefix`, longest
 * first, handing each to `attempt`. Returns the first non-null result, so a
 * label that anchors but whose remainder does not fit the template falls
 * through to the next candidate rather than failing the whole line.
 */
function withLabel<T>(
  text: string,
  prefix: string,
  ctx: FeatureContext,
  attempt: (label: string, rest: string) => T | null,
): T | null {
  if (!text.startsWith(prefix)) return null;
  const body = text.slice(prefix.length);
  for (const label of labelsOf(ctx)) {
    if (!body.startsWith(label)) continue;
    const got = attempt(label, body.slice(label.length));
    if (got !== null) return got;
  }
  return null;
}

function leaf(atom: Omit<AtomFeature, 'path' | 'negated'>): Leaf {
  return { kind: 'leaf', atom };
}

/** §4.1's comparator followed by §1's value: the tail shared by cmp, count_cmp and sum_cmp. */
function readComparison(rest: string): { comparator: string; threshold: string; unit: string | null } | null {
  for (const [phrase, token] of COMPARATOR_PHRASES) {
    const head = `${SEP}${phrase}${SEP}`;
    if (!rest.startsWith(head)) continue;
    const value = readValue(rest.slice(head.length));
    if (!value) continue;
    return { comparator: token, threshold: value.canonical, unit: value.unit };
  }
  return null;
}

/**
 * Reads one flat (never-a-marker) line, per §4 and the flat forms of §5.
 *
 * Order matters: the fixed-prefix templates are tried before the
 * label-anchored ones so that a fact label which happens to start with "the"
 * cannot swallow "the number of"; and the §4.2 boolean-false un-negation is
 * tried last, because a label that genuinely begins "is not" must win as a
 * boolean-true reading of itself.
 */
function readFlat(text: string, ctx: FeatureContext): Node {
  // §5.1 flat `not`.
  const notPrefix = `it is not the case that${SEP}`;
  if (text.startsWith(notPrefix)) return { kind: 'not', of: readFlat(text.slice(notPrefix.length), ctx) };

  // §5.2 flat `quantifier_any`.
  for (const scope of SCOPE_PHRASES) {
    const head = `at least one ${scope} scope where${SEP}`;
    if (text.startsWith(head)) {
      return { kind: 'quantifier', scope: reslug(scope), of: readFlat(text.slice(head.length), ctx) };
    }
  }

  // §4.12 requirement_ref.
  const ref = /^requirement (\S+) evaluates to (\S+)$/.exec(text);
  if (ref && TRUTH_TOKENS.includes(ref[2] ?? '')) {
    return leaf({ op: 'requirement_ref', requirementRef: ref[1], expect: ref[2] });
  }

  // §4.9 / §4.10 financial-year forms.
  const onOrAfter = /^the financial year starts on or after (.+)$/.exec(text);
  if (onOrAfter) return leaf({ op: 'fy_starts_on_or_after', literal: onOrAfter[1] });

  const startsIn = /^the financial year starts in (.+)$/.exec(text);
  if (startsIn) {
    const years = splitJoinOr(startsIn[1] ?? '').map((y) => readListItem(y).canonical);
    return leaf({ op: 'fy_start_year_in', literal: JSON.stringify(years) });
  }

  // §4.11 year_diff_lt.
  const yearDiff = /^fewer than ([0-9]+) years have passed since (.+)$/.exec(text);
  if (yearDiff) return leaf({ op: 'year_diff_lt', fact: yearDiff[2], literal: yearDiff[1] });

  // §4.13 pack_flag.
  const flag = /^the '(.+)' pack flag is set$/.exec(text);
  if (flag) return leaf({ op: 'pack_flag', literal: reslug(flag[1] ?? '') });

  // §4.8 sum_cmp.
  const sum = withLabel(text, 'the total ', ctx, (label, rest) => {
    for (const scope of SCOPE_PHRASES) {
      const head = `, summed across ${scope} scopes,`;
      if (!rest.startsWith(head)) continue;
      const cmp = readComparison(rest.slice(head.length));
      if (!cmp) continue;
      return leaf({ op: 'sum_cmp', fact: label, scope: reslug(scope), ...cmp });
    }
    return null;
  });
  if (sum) return sum;

  // §4.7 count_cmp.
  const count = withLabel(text, 'the number of ', ctx, (label, rest) => {
    const cmp = readComparison(rest);
    return cmp ? leaf({ op: 'count_cmp', fact: label, ...cmp }) : null;
  });
  if (count) return count;

  // §4.1 / §4.2 / §4.3 / §4.4 / §4.5 / §4.6 — all anchored on a known label.
  const anchored = withLabel(text, '', ctx, (label, rest) => {
    // §4.2 boolean true: the label alone.
    if (rest === '') return leaf({ op: 'eq', fact: label, literal: 'true', unit: null });

    // §4.4 in_catalogue.
    const cat = /^ is listed in the '(.+)' catalogue$/.exec(rest);
    if (cat) return leaf({ op: 'in_catalogue', fact: label, catalogue: reslug(cat[1] ?? '') });

    // §4.6 exists.
    if (rest === `${SEP}is on record`) return leaf({ op: 'exists', fact: label });

    // §4.5 prefix_in — items verbatim, never value-formatted.
    const pre = /^ starts with (.+)$/.exec(rest);
    if (pre) return leaf({ op: 'prefix_in', fact: label, literal: JSON.stringify(splitJoinOr(pre[1] ?? '')) });

    // §4.1 cmp.
    const cmp = readComparison(rest);
    if (cmp) return leaf({ op: 'cmp', fact: label, ...cmp });

    // §4.2 string/number eq, and §4.3 in_set. A one-item list is
    // indistinguishable from `eq` (grammar §4.3, "Non-injectivity"); the
    // reading below reports `eq`, and the comparison then surfaces the
    // ambiguity as an op divergence rather than hiding it.
    const is = /^ is (.+)$/.exec(rest);
    if (is) {
      const items = splitJoinOr(is[1] ?? '').map(readListItem);
      const unit = items.find((i) => i.unit !== null)?.unit ?? null;
      if (items.length === 1) {
        return leaf({ op: 'eq', fact: label, literal: items[0]?.canonical, unit });
      }
      return leaf({ op: 'in_set', fact: label, literal: JSON.stringify(items.map((i) => i.canonical)), unit });
    }

    return null;
  });
  if (anchored) return anchored;

  // §4.2 boolean false — the three negated-label forms, read backwards.
  const known = new Set(labelsOf(ctx));
  const asFalse = (label: string): Leaf | null =>
    known.has(label) ? leaf({ op: 'eq', fact: label, literal: 'false', unit: null }) : null;

  if (text.startsWith(`is not${SEP}`)) {
    const got = asFalse(`is${SEP}${text.slice(7)}`);
    if (got) return got;
  }
  const doesNotExist = `${SEP}does not exist`;
  if (text.endsWith(doesNotExist)) {
    const got = asFalse(`${text.slice(0, -doesNotExist.length)}${SEP}exists`);
    if (got) return got;
  }
  if (text.startsWith(`not${SEP}`)) {
    const got = asFalse(text.slice(4));
    if (got) return got;
  }

  throw new EnglishParseError(`unrecognised rendered line: ${JSON.stringify(text)}`);
}

// --- the structural layer (§2, §3, §6) -------------------------------------

const MARKER =
  /^(ALL of:|ANY of:|NOT:|at least one (organization|legal entity|branch|facility|product|trade lane|supplier|request|counterparty) scope where:)$/;

interface Line {
  indent: number;
  text: string;
}

function toLines(block: string): Line[] {
  return block
    .split('\n')
    .filter((raw) => raw.trim() !== '')
    .map((raw) => {
      const indent = raw.length - raw.trimStart().length;
      return { indent, text: raw.slice(indent) };
    });
}

/**
 * Parses one node starting at `lines[i]`, which must sit at `indent`. Returns
 * the node and the index just past its subtree. §2's rule — children of a
 * marker at indent d sit at exactly d + 2, and their own subtrees deeper
 * still — is the only thing that decides where a block ends.
 */
function readNode(lines: Line[], i: number, indent: number, ctx: FeatureContext): { node: Node; next: number } {
  const line = lines[i];
  if (!line) throw new EnglishParseError(`expected a line at index ${i}`);
  if (line.indent !== indent) {
    throw new EnglishParseError(`expected indent ${indent} but found ${line.indent} at ${JSON.stringify(line.text)}`);
  }

  // §2: the numbering token sits immediately after the indent. A root line carries none.
  const numbered = /^([0-9]+)\. (.*)$/.exec(line.text);
  const text = numbered ? (numbered[2] ?? '') : line.text;

  if (!MARKER.test(text)) return { node: readFlat(text, ctx), next: i + 1 };

  const children: Node[] = [];
  let j = i + 1;
  while (j < lines.length) {
    const child = lines[j];
    if (!child || child.indent <= indent) break;
    if (child.indent !== indent + 2) {
      throw new EnglishParseError(`unexpected indent ${child.indent} at ${JSON.stringify(child.text)}`);
    }
    const parsed = readNode(lines, j, indent + 2, ctx);
    children.push(parsed.node);
    j = parsed.next;
  }

  if (text === 'ALL of:' || text === 'ANY of:') {
    const op = text === 'ALL of:' ? 'all' : 'any';
    if (children.length === 0) throw new EnglishParseError(`${text} has no children`);
    return { node: { kind: 'group', op, of: children }, next: j };
  }

  const only = children[0];
  if (children.length !== 1 || !only) throw new EnglishParseError(`${text} must have exactly one child`);
  if (text === 'NOT:') return { node: { kind: 'not', of: only }, next: j };

  const scope = /^at least one (.+) scope where:$/.exec(text)?.[1] ?? '';
  return { node: { kind: 'quantifier', scope: reslug(scope), of: only }, next: j };
}

function readConditionBlock(block: string, ctx: FeatureContext): Node {
  const lines = toLines(block);
  if (lines.length === 0) throw new EnglishParseError('empty condition block');
  const base = lines[0]?.indent ?? 0;
  const normalised = lines.map((l) => ({ indent: l.indent - base, text: l.text }));
  const { node, next } = readNode(normalised, 0, 0, ctx);
  if (next !== normalised.length) throw new EnglishParseError('trailing lines after the condition block');
  return node;
}

/** Reads a bare `renderCondition` output (grammar §2–§6) into features. */
export function conditionFeaturesFromEnglish(text: string, ctx: FeatureContext): ConditionFeatures {
  return assemble(readConditionBlock(text, ctx));
}

// --- the requirement layer (§7) --------------------------------------------

/**
 * Splits the case's value from §7.4/§7.5's optional ` (<label>)` suffix. The
 * label is presentational and is not part of the compared model, but it has to
 * come off the value or every labelled case would diverge on `value`.
 */
function valueWithoutLabelSuffix(text: string): string {
  const m = /^(.*?) \(.*\)$/.exec(text);
  return m?.[1] ?? text;
}

/**
 * Reads a full `renderRequirement` output.
 *
 * §3's warning drives the order of operations: the fixed §7 templates are
 * matched *first*, to isolate the exact substrings that are `renderCondition`
 * output, and only then are the four marker forms applied inside them. A line
 * ending in `:` proves nothing on its own — a selection case's block header
 * ends in one too.
 */
export function featuresFromEnglish(text: string, ctx: FeatureContext): RequirementFeatures {
  const lines = text.split('\n');
  const header = lines[0] ?? '';
  if (!header.includes(`${SEP}—${SEP}`)) throw new EnglishParseError(`missing "<id> — <title>" header`);
  if ((lines[1] ?? '') !== '') throw new EnglishParseError('missing the blank line after the header');

  const preamble = lines[2] ?? '';

  if (preamble === BOOLEAN_PREAMBLE) {
    const body = lines.slice(3);
    while (body.length > 0 && (body[body.length - 1] ?? '').trim() === '') body.pop();
    if (body.length === 1 && body[0] === NO_CONDITION_LINE) return { kind: 'boolean', condition: undefined };
    return { kind: 'boolean', condition: conditionFeaturesFromEnglish(body.join('\n'), ctx) };
  }

  if (preamble !== SELECTION_PREAMBLE) throw new EnglishParseError(`unrecognised preamble: ${JSON.stringify(preamble)}`);

  // §7.3: cases run until the blank line that precedes the Otherwise trailer.
  const caseLines: string[] = [];
  let i = 3;
  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line === '') break;
    caseLines.push(line);
  }

  const trailer = lines.slice(i).find((l) => l.startsWith('Otherwise,')) ?? '';
  let defaultValue: string | undefined;
  if (trailer !== OTHERWISE_NO_DEFAULT) {
    const withDefault = /^Otherwise, the applicable value is (.+)\.$/.exec(trailer);
    if (!withDefault) throw new EnglishParseError(`missing the Otherwise trailer`);
    defaultValue = withDefault[1];
  }

  // §7.4/§7.5: a case header sits at exactly two spaces; a block's own lines
  // start at four, so this cannot mistake block content for a new case.
  const groups: { header: string; block: string[] }[] = [];
  for (const line of caseLines) {
    if (/^ {2}[0-9]+\. /.test(line)) groups.push({ header: line.slice(2), block: [] });
    else {
      const current = groups[groups.length - 1];
      if (!current) throw new EnglishParseError(`case block line before any case header: ${JSON.stringify(line)}`);
      current.block.push(line);
    }
  }

  const cases: CaseFeature[] = groups.map((group, index) => {
    const numbered = /^([0-9]+)\. (.*)$/.exec(group.header);
    if (!numbered) throw new EnglishParseError(`unnumbered case: ${JSON.stringify(group.header)}`);
    const body = numbered[2] ?? '';

    const block = /^If the following holds, the applicable value is (.+):$/.exec(body);
    if (block) {
      if (group.block.length === 0) throw new EnglishParseError(`case ${index + 1} has an empty block`);
      return {
        index,
        when: conditionFeaturesFromEnglish(group.block.join('\n'), ctx),
        value: valueWithoutLabelSuffix(block[1] ?? ''),
      };
    }

    const inline = /^If (.+), the applicable value is (.+)\.$/.exec(body);
    if (!inline) throw new EnglishParseError(`unrecognised case entry: ${JSON.stringify(body)}`);
    if (group.block.length > 0) throw new EnglishParseError(`inline case ${index + 1} carries block lines`);
    return {
      index,
      when: assemble(readFlat(inline[1] ?? '', ctx)),
      value: valueWithoutLabelSuffix(inline[2] ?? ''),
    };
  });

  return { kind: 'selection', cases, defaultValue };
}

// ---------------------------------------------------------------------------
// Comparison — every divergence is reported, none is thrown
// ---------------------------------------------------------------------------

const ATOM_FIELDS = [
  'op',
  'negated',
  'fact',
  'comparator',
  'threshold',
  'unit',
  'scope',
  'catalogue',
  'requirementRef',
  'expect',
  'literal',
] as const;

function show(value: unknown): string {
  return value === undefined ? '(absent)' : value === null ? '(none)' : String(value);
}

function line(path: string, feature: string, a: unknown, b: unknown): string {
  return `${path}: ${feature}: requirement=${show(a)} english=${show(b)}`;
}

/** Compares two condition feature sets. `a` is the requirement side, `b` the English side. */
export function compareConditionFeatures(a: ConditionFeatures, b: ConditionFeatures, prefix = ''): string[] {
  const at = (path: string): string => `${prefix}${path}`;
  const found: string[] = [];

  if (a.shape !== b.shape) found.push(line(at('condition'), 'shape', a.shape, b.shape));

  const byPathA = new Map(a.atoms.map((atom) => [atom.path, atom] as const));
  const byPathB = new Map(b.atoms.map((atom) => [atom.path, atom] as const));
  const paths = [...new Set([...byPathA.keys(), ...byPathB.keys()])].sort();

  for (const path of paths) {
    const left = byPathA.get(path);
    const right = byPathB.get(path);
    if (!left) {
      found.push(line(at(path), 'atom', '(absent)', right?.op));
      continue;
    }
    if (!right) {
      found.push(line(at(path), 'atom', left.op, '(absent)'));
      continue;
    }
    for (const field of ATOM_FIELDS) {
      if (left[field] !== right[field]) found.push(line(at(path), field, left[field], right[field]));
    }
  }

  return found;
}

/**
 * Compares two requirement feature sets, reporting every divergence. `a` is
 * the requirement side, `b` the English side. An empty array means the English
 * says what the structure says.
 */
export function compareRequirementFeatures(a: RequirementFeatures, b: RequirementFeatures): string[] {
  const found: string[] = [];

  if (a.kind !== b.kind) {
    found.push(line('requirement', 'kind', a.kind, b.kind));
    return found;
  }

  if (a.condition && b.condition) found.push(...compareConditionFeatures(a.condition, b.condition));
  else if (a.condition !== b.condition) {
    found.push(line('requirement', 'condition', a.condition ? 'present' : 'absent', b.condition ? 'present' : 'absent'));
  }

  const casesA = a.cases;
  const casesB = b.cases;
  if (casesA || casesB) {
    const lengthA = casesA?.length ?? 0;
    const lengthB = casesB?.length ?? 0;
    if (lengthA !== lengthB) found.push(line('requirement', 'caseCount', lengthA, lengthB));
    for (let i = 0; i < Math.max(lengthA, lengthB); i += 1) {
      const left = casesA?.[i];
      const right = casesB?.[i];
      if (!left || !right) {
        found.push(line(`case[${i}]`, 'case', left ? 'present' : 'absent', right ? 'present' : 'absent'));
        continue;
      }
      if (left.value !== right.value) found.push(line(`case[${i}]`, 'value', left.value, right.value));
      found.push(...compareConditionFeatures(left.when, right.when, `case[${i}].`));
    }
  }

  if (a.defaultValue !== b.defaultValue) {
    found.push(line('requirement', 'defaultValue', a.defaultValue, b.defaultValue));
  }

  return found;
}
