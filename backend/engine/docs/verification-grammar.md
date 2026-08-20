# Verification renderer — output grammar contract

This is the specification of the text `renderCondition`/`renderRequirement`
(`src/verification/render.ts`, `RENDERER_VERSION = '1.0.0'`) produce. It exists
so that a parser recovering structure from that text — `featuresFromEnglish`,
and its round-trip parity tests across all seventeen `Condition` primitives —
can be built without opening `render.ts`. Every template below was pinned by
actually rendering the example and reading the string back, not by reading
the renderer's source and describing its control flow; each worked example is
verbatim output. If a future change to `render.ts` makes any example below
stop matching, this document is stale and must be regenerated the same way:
render the case, read the output, update the template.

## 1. Value and unit formatting (used by several templates below)

Several templates below have a `<VALUE>` slot. It is filled by the
vocabulary layer's `renderValue(value, unit)`:

- A number is written with its integer part grouped in 3s from the right
  using an ordinary space (U+0020) — `100` stays `100` (fewer than 4
  digits), `1000` → `1 000`, `450000000` → `450 000 000`.
- If the fact type carries a `unit` (e.g. `EUR`, `employees`, `tonnes`,
  `items`) and the value is a number, the unit is appended after one space:
  `450 000 000 EUR`.
- A string value is written verbatim, with no unit ever appended.
- (`renderValue` also defines a boolean → `yes`/`no` form, but no template
  below ever reaches it: every primitive that can carry a boolean value
  — only `eq` — intercepts booleans before calling `renderValue` at all;
  see §5.2. A parser will never see a bare `yes`/`no` token from this
  renderer.)

`<FACT_LABEL>` is `factLabel(fact, factTypes)`: the fact type's explicit
`label` if it has one, otherwise a mechanical de-slug of the fact id (scope
prefix dropped, underscores to spaces). It is always one lowercase-first
noun/verb phrase with no trailing punctuation.

## 2. The indent rule (applies uniformly, stated once)

Define the **indent** of a line as the count of leading U+0020 space
characters, counted *before* any `<N>. ` numbering token — i.e. before the
digits, not after them. Indent is always a multiple of 2.

A line that is a **structural marker** (§4) opens a block: its own indent is
some depth *d*, and every line belonging to its numbered children — whether
those children are themselves one-line atoms or further marker lines — has
indent *d + 2*. This nests without limit: a marker line found at indent *d*
as the text of numbered child *N* of an outer block still opens its own
block at children-indent *d + 2*, exactly as if it were a root marker.

```
ALL of:                     d=0 (root marker)
  1. <atom>                 d=2 (child of the d=0 block)
  2. ANY of:                d=2 (child of the d=0 block; itself a marker)
    1. <atom>                d=4 (child of the d=2 block)
    2. <atom>                d=4 (child of the d=2 block)
```

The numbering token itself (`1.`, `2.`, …) is always `<N>. ` — the 1-based
position of that child among its siblings — immediately after the indent
and immediately before either another marker or a one-line atom. A root
marker line (the outermost line of a `renderCondition` call) carries no
number.

## 3. The four structural markers (closed set — exact forms)

A line is a **`Condition`-tree structural marker** if and only if, after
stripping its indent and an optional `<N>. ` prefix, it matches one of
exactly these four forms:

| Condition shape | Marker text (exact) |
|---|---|
| `all` | `ALL of:` |
| `any` | `ANY of:` |
| `not` wrapping a structural child | `NOT:` |
| `quantifier_any` wrapping a structural `where` | `at least one <SCOPE> scope where:` |

`<SCOPE>` is the condition's `scopeType`, de-slugged (underscores → spaces,
nothing else changed). `scopeType` is a closed enum, so the closed regex for
the fourth form is:

```
^at least one (organization|legal entity|branch|facility|product|trade lane|supplier|request|counterparty) scope where:$
```

Combined, a full marker-line regex (after stripping indent and numbering)
is:

```
^(ALL of:|ANY of:|NOT:|at least one (organization|legal entity|branch|facility|product|trade lane|supplier|request|counterparty) scope where:)$
```

**A line ending in `:` is not sufficient evidence of a marker.** `render.ts`
emits at least one other fixed template that also ends in `:` and is *not*
one of the four forms above: the selection-case block header (§7.4),
`` If the following holds, the applicable value is <VALUE>:``. This is not a
hypothetical collision — rendering a selection case whose `when` is itself a
compound `quantifier_any` produces exactly this adjacency, observed
verbatim:

```
  1. If the following holds, the applicable value is CASE_Q:
    at least one facility scope where:
      1. ALL of:
        1. net turnover exceeds 1 EUR
        2. average number of employees exceeds 2 employees
```

Both the first and second lines here end in `:`; only the second is a
`Condition`-tree marker. **Do not scan a rendered `Requirement` for
colon-terminated lines and classify them as `Condition` markers globally.**
The correct order of operations is: first split a rendered `Requirement`
into its fixed template parts (§7) — the header, the boolean/selection
preamble, each case's bullet — to isolate the exact substring that is a
`renderCondition` output (the text after `This applies when:`, or after a
case's `If …:`/`If … holds, the applicable value is …:`). Only *within* that
isolated substring do the four closed forms above apply, and within it they
are unambiguous — no other template in this document produces a line
matching that regex.

## 4. The thirteen always-flat leaf primitives

These never open a block; each renders as exactly one line, with no marker,
regardless of what wraps them. `<...>` denotes a substitution; literal text
outside `<...>` is exact, including spacing and punctuation.

### 4.1 `cmp` — `{ fact, cmp, value }`

Template: `<FACT_LABEL> <COMPARATOR> <VALUE>`

`<COMPARATOR>` (closed map, all four distinct, `cmp`/`cmp.cmp` never varies
by context — see §6 for confirmation this holds even under `not`):

| `cmp` | `<COMPARATOR>` |
|---|---|
| `gt` | `exceeds` |
| `gte` | `is at least` |
| `lt` | `is below` |
| `lte` | `is at most` |

Examples (all four, same fact and value magnitude to isolate the
comparator):

```
net turnover exceeds 450 000 000 EUR
net turnover is at least 100 EUR
net turnover is below 100 EUR
net turnover is at most 100 EUR
```

### 4.2 `eq` — `{ fact, value }`, `value: string | number | boolean`

Three cases on the type of `value`:

**Boolean, `true`:** Template: `<FACT_LABEL>` — the label alone, unmodified.

```
is a parent undertaking
```

**Boolean, `false`:** Template: `<NEGATED_FACT_LABEL>`, computed from
`<FACT_LABEL>` by the first pattern that matches, in this order:

1. If the label starts with the word `is` (case-insensitive, word
   boundary): replace that leading `is` with `is not`.
   `is a parent undertaking` → `is not a parent undertaking`
2. Else if the label ends with the word `exists` (case-insensitive, word
   boundary): replace it with `does not exist`.
   `qualifying EU subsidiary exists` → `qualifying EU subsidiary does not exist`
3. Else: prefix the label with `not `.
   `reported under CSRD for FY2024` → `not reported under CSRD for FY2024`
   `unlabelled flag` → `not unlabelled flag` (mechanical-fallback label, no explicit `label` on the fact type)

**String or number:** Template: `<FACT_LABEL> is <VALUE>`

```
standard used to prepare the parent's report is ESRS
net turnover is 100 EUR
```

### 4.3 `in_set` — `{ fact, set: (string|number)[] }`

Template: `<FACT_LABEL> is <JOIN_OR(set, rendered via VALUE)>`

`JOIN_OR` (closed rule, used again in §4.5 and §4.10 with different item
types — stated once here):

| item count | form |
|---|---|
| 0 | `(none)` (not reachable from valid pack data — `set`/`prefixes`/`years` are always non-empty — documented for completeness) |
| 1 | the item alone |
| 2 | `A or B` |
| 3+ | `A, B, …, or Z` (Oxford comma before the final `or`) |

```
standard used to prepare the parent's report is ESRS
standard used to prepare the parent's report is ESRS or EQUIVALENT
standard used to prepare the parent's report is ESRS, EQUIVALENT, or OTHER
```

**Numeric set items get the full §1 `<VALUE>` treatment, per item.** The
worked examples above are all strings, which left the numeric case
unspecified; pinned by rendering it and reading the string back. Each item
is grouped in 3s *and* carries the fact type's unit, appended per item —
not once at the end of the list:

```
net turnover is 1 000 EUR or 2 000 000 EUR
chosen standard is 1 000 or 2 000 000
```

(second line: same set, on a fact type with no `unit`.)

**Non-injectivity — `in_set` with one item is indistinguishable from `eq`.**
A single-item `in_set` renders `<FACT_LABEL> is <VALUE>`, which is
character-for-character the §4.2 string/number `eq` template. Rendering
`{ op: 'in_set', fact, set: ['ESRS'] }` and `{ op: 'eq', fact, value: 'ESRS' }`
against the same fact type produces the identical line:

```
chosen standard is ESRS
```

This is the one place in this grammar where the English does not determine
the `Condition` op. A parser recovering structure from the text cannot tell
the two apart and must not pretend to: it should report the op it read and
let the comparison surface the ambiguity, rather than silently accepting
either. No CSRD pack requirement contains a single-item `in_set`, so this
does not arise on real content today.

**`JOIN_OR` is not injective either**, for the same structural reason: an
item whose own text contains `, ` or ` or ` cannot be told from an item
boundary. Every `set`/`prefixes`/`years` value in the pack today is a bare
token, so this is latent rather than live, but a parser splitting a
`JOIN_OR` list is making an assumption the renderer does not guarantee.

### 4.4 `in_catalogue` — `{ fact, catalogue }`

Template: `<FACT_LABEL> is listed in the '<DESLUG(catalogue)>' catalogue`

`DESLUG(id)` replaces every `_` with a space; nothing else changes (no case
changes, no expansion of abbreviations — `catalogues.json` carries no human
label for a catalogue, so this is a mechanical fallback, deliberately never
guessed). The de-slugged name is always wrapped in single quotes here.

```
country of incorporation is listed in the 'eu member states' catalogue
```

### 4.5 `prefix_in` — `{ fact, prefixes: string[] }`

Template: `<FACT_LABEL> starts with <JOIN_OR(prefixes, verbatim)>`

Prefixes are joined exactly as given — no `VALUE` formatting, no quoting.

```
CN code starts with 72
CN code starts with 72 or 73
```

### 4.6 `exists` — `{ fact }`

Template: `<FACT_LABEL> is on record`

```
URL where the parent's report is published is on record
```

### 4.7 `count_cmp` — `{ fact, cmp, value }`

Template: `the number of <FACT_LABEL> <COMPARATOR> <VALUE>` (same
`<COMPARATOR>` map as §4.1)

```
the number of request items above the voluntary-standard cap exceeds 0 items
```

### 4.8 `sum_cmp` — `{ scopeType, fact, cmp, value }`

Template: `the total <FACT_LABEL>, summed across <DESLUG(scopeType)> scopes, <COMPARATOR> <VALUE>`

`scopeType` here is inlined bare (no quotes), unlike `in_catalogue`'s
catalogue name. `sum_cmp` carries no nested `Condition` — it can never be a
structural marker; this is its only form.

```
the total annual throughput, summed across facility scopes, exceeds 5 000 tonnes
```

### 4.9 `fy_starts_on_or_after` — `{ date }`

Template: `the financial year starts on or after <date>` — `date` is the
ISO string verbatim, no reformatting.

```
the financial year starts on or after 2027-01-01
```

### 4.10 `fy_start_year_in` — `{ years: number[] }`

Template: `the financial year starts in <JOIN_OR(years, as plain decimal strings — no thousands grouping)>`

```
the financial year starts in 2026
the financial year starts in 2025 or 2026
```

### 4.11 `year_diff_lt` — `{ fromFact, years }`

Template: `fewer than <years> years have passed since <FACT_LABEL(fromFact)>`
— `years` is a plain integer, no `VALUE` formatting (never over 3 digits in
practice, but not run through the grouping rule regardless).

```
fewer than 3 years have passed since first reporting year
```

### 4.12 `requirement_ref` — `{ requirement, expect }`

Template: `requirement <requirement> evaluates to <expect>` — both the
requirement id and `expect` are emitted verbatim, character for character.
`expect` is always exactly one of `APPLIES`, `DOES_NOT_APPLY`,
`INDETERMINATE` (the `Truth` union) — never paraphrased into lower-case
prose, so a parser can match it as a fixed enum, not free text.

```
requirement CSRD-S-007 evaluates to APPLIES
```

### 4.13 `pack_flag` — `{ flag }`

Template: `the '<DESLUG(flag)>' pack flag is set` — same `DESLUG` as §4.4,
same single-quote wrapping.

```
the 'revised esrs in force' pack flag is set
```

## 5. The two conditionally-structural primitives

`not` and `quantifier_any` are the only primitives with a nested
`Condition` that can go either way: they render as a §3 structural marker
when their one child would itself be structural, and collapse to a single
flat line otherwise. The rule is symmetric and recursive: **a `not` or
`quantifier_any` is structural exactly when its own single child — `not.of`
or `quantifier_any.where` — is structural by this same rule** (a leaf is
never structural; `all`/`any` always are). This is why `not(quantifier_any(...))`
and `not(not(...))` both nest correctly with no extra case: each layer's
structural-ness is decided purely by looking at what it wraps.

### 5.1 `not` — `{ of: Condition }`

**Flat form** (child is a leaf, or a `not`/`quantifier_any` that is itself
flat). Template: `it is not the case that <CHILD_FLAT_RENDERING>` — the
child is rendered by its own template, completely unmodified. This is the
mechanism that guarantees a `not` never flips a comparator: `cmp`'s
`<COMPARATOR>` (§4.1) is chosen from `cmp.cmp` alone and this template never
touches it.

```
it is not the case that net turnover exceeds 1 EUR
```

Doubled `not` renders as a doubled prefix, each layer independent:

```
it is not the case that it is not the case that net turnover exceeds 1 EUR
```

**Structural form** (child is `all`/`any`, or a structural `not`/`quantifier_any`):
marker line `NOT:`, exactly one numbered child (always `1.`), per §2/§3.

```
NOT:
  1. ALL of:
    1. net turnover exceeds 1 EUR
    2. average number of employees exceeds 2 employees
```

### 5.2 `quantifier_any` — `{ scopeType, where: Condition }`

**Flat form** (`where` is a leaf, or a flat `not`/`quantifier_any`).
Template: `at least one <DESLUG(scopeType)> scope where <WHERE_FLAT_RENDERING>`
— `where` rendered by its own template, unmodified, inlined with no colon.

```
at least one facility scope where annual throughput is at least 1 000 tonnes
```

**Structural form** (`where` is `all`/`any`, or itself structural): marker
line `at least one <SCOPE> scope where:` (§3), exactly one numbered child
(always `1.`) — the rendering of `where`.

```
at least one facility scope where:
  1. ALL of:
    1. net turnover exceeds 1 EUR
    2. average number of employees exceeds 2 employees
```

Wrapping the structural form in `not` composes exactly as §2's indent rule
predicts, with the comparators still untouched:

```
NOT:
  1. at least one facility scope where:
    1. ALL of:
      1. net turnover exceeds 1 EUR
      2. average number of employees exceeds 2 employees
```

## 6. `all`/`any` (always structural)

Marker `ALL of:` / `ANY of:`, one numbered child per member of `of`
(`of.length` is always ≥ 1), each child indented per §2.

```
ALL of:
  1. net turnover exceeds 1 EUR
  2. average number of employees exceeds 2 employees
```

```
ANY of:
  1. net turnover exceeds 1 EUR
  2. average number of employees exceeds 2 employees
```

Two shapes that are semantically distinct (`all[a, any[b,c]]` vs.
`any[all[a,b], c]`) always differ starting at the very first line — the root
marker itself — so a parser never has to look past line 1 to tell them
apart at the root:

```
ALL of:
  1. net turnover exceeds 1 EUR
  2. ANY of:
    1. net turnover exceeds 1 EUR
    2. average number of employees exceeds 2 employees
```

## 7. `renderRequirement` templates

A `Requirement` renders as a header, a blank line, then either the boolean
form or the selection form. These templates are what a parser must
recognize *first*, to correctly isolate the substrings that are pure
`Condition`-grammar text (§2–§6) before applying the marker rules to them —
see the warning in §3.

### 7.1 Header (both kinds)

Template: `<id> — <title>` (em dash, U+2014, surrounded by single spaces)
followed by a blank line.

```
R-BOOL — Example boolean requirement

```

### 7.2 Boolean form

```
<HEADER>

This applies when:
<CONDITION_RENDERING>
```

`<CONDITION_RENDERING>` is exactly a `renderCondition(requirement.condition, ctx)`
output (§2–§6), or, when the requirement has no `condition` at all, the
fixed literal line:

```
(no condition — this requirement is never satisfied)
```

Worked example:

```
R-BOOL — Example boolean requirement

This applies when:
ALL of:
  1. net turnover exceeds 1 EUR
  2. average number of employees exceeds 2 employees
```

### 7.3 Selection form — preamble

```
<HEADER>

The applicable value is chosen by the first matching case below, in order:
<CASE_1>
<CASE_2>
...
<CASE_N>

<OTHERWISE_LINE>
```

Note the blank line before `<OTHERWISE_LINE>`. Cases appear in
`requirement.cases` array order — this order is semantically load-bearing
(the evaluator takes the first match) and is exactly the rendered order,
1-indexed starting at `1.`.

### 7.4 Selection form — one case entry, inline

Used when the case's `when` renders as a single flat line (§2's
`whenLines.length === 1`, i.e. `when` is a leaf, or a flat `not`/`quantifier_any`).

Template: `  <N>. If <WHEN_FLAT>, the applicable value is <value><LABEL_SUFFIX>.`

`<LABEL_SUFFIX>` is ` (<label>)` when the case carries an optional `label`,
otherwise empty. Note the trailing `.` (period) that closes the sentence —
present only in the inline form, not the block form below.

```
  1. If net turnover exceeds 1 EUR, the applicable value is CASE_A (first case).
```

### 7.5 Selection form — one case entry, block

Used when `when` is structural (§2–§6 apply to `<WHEN_BLOCK>` below,
indented one further level per §2 — i.e. the block's own lines, which start
at indent 0 as standalone `renderCondition` output, are each prefixed with 4
additional spaces here).

Template:
```
  <N>. If the following holds, the applicable value is <value><LABEL_SUFFIX>:
    <WHEN_BLOCK line 1, +4 spaces>
    <WHEN_BLOCK line 2, +4 spaces>
    ...
```

This line — `If the following holds, the applicable value is …:` — is the
one that also ends in `:` and is **not** a §3 marker; see §3's worked
counter-example.

```
  2. If the following holds, the applicable value is CASE_B:
    ALL of:
      1. net turnover exceeds 1 EUR
      2. average number of employees exceeds 2 employees
```

### 7.6 Selection form — `Otherwise` (two variants, mutually exclusive)

**`defaultValue` present:**

```
Otherwise, the applicable value is <defaultValue>.
```

**`defaultValue` absent (`undefined`):**

```
Otherwise, no case matched and no default value is defined.
```

### 7.7 Full worked example — selection, both case forms, both label styles

```
R-SEL — Example selection requirement

The applicable value is chosen by the first matching case below, in order:
  1. If net turnover exceeds 1 EUR, the applicable value is CASE_A (first case).
  2. If the following holds, the applicable value is CASE_B:
    ALL of:
      1. net turnover exceeds 1 EUR
      2. average number of employees exceeds 2 employees

Otherwise, the applicable value is FALLBACK.
```

And with no `defaultValue`, only the trailer changes:

```
R-SEL-NODEF — Example selection requirement

The applicable value is chosen by the first matching case below, in order:
  1. If net turnover exceeds 1 EUR, the applicable value is CASE_A (first case).
  2. If the following holds, the applicable value is CASE_B:
    ALL of:
      1. net turnover exceeds 1 EUR
      2. average number of employees exceeds 2 employees

Otherwise, no case matched and no default value is defined.
```

## 8. Regex cheat-sheet

For quick reference; each is defined precisely in the section named.

```
# §3 — Condition-tree structural marker (apply only within an isolated
# renderCondition substring, never across a whole rendered Requirement):
^(ALL of:|ANY of:|NOT:|at least one (organization|legal entity|branch|facility|product|trade lane|supplier|request|counterparty) scope where:)$

# §7.5 — selection-case block header (NOT a Condition marker, despite the
# trailing colon):
^If the following holds, the applicable value is .+:$

# §7.4 — selection-case inline entry:
^If .+, the applicable value is .+\.$

# §7.6 — Otherwise trailer, two variants:
^Otherwise, the applicable value is .+\.$
^Otherwise, no case matched and no default value is defined\.$
```
