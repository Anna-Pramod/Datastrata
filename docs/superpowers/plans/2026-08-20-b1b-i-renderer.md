# B1b-i — The condition renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an encoded requirement into plain English a non-programmer can argue against, hash the requirement's logical payload canonically, and prove — by a check that shares no semantics with the renderer — that the English says what the requirement says.

**Architecture:** Four pure modules under `backend/engine/src/verification/`. `vocabulary.ts` turns fact ids and values into words. `render.ts` turns a `Requirement` into English, carrying a `RENDERER_VERSION`. `canonical.ts` hashes the logical payload stably. `features.ts` extracts a **binding-preserving** structural model from a requirement and, independently, from rendered English, and compares them. Nothing here reads the filesystem, the network, or the clock.

**Tech Stack:** TypeScript (strict, ESM), zod for the schema changes, vitest. No new runtime dependencies.

## Why this plan is specified by behaviour, not reference code

B1a's plan supplied full reference implementations, and eight defects were found in that reference code — two of them Critical — while implementers made zero transcription errors and caught four of the eight themselves. The one task specified by interface and required behaviour instead produced the cleanest implementation on that branch.

So this plan gives exact interfaces, exact required behaviours and exact test cases, and leaves the implementation to the implementer. Where a specific string or value is required it is given verbatim and must be used verbatim.

## Global Constraints

- **No new runtime dependencies.** `zod` only; `node:*` builtins are fine.
- **TypeScript strict, with `noUncheckedIndexedAccess: true`.**
- **Program-agnostic.** No regulation name in `src/`. `grep -ri csrd backend/engine/src/` must not gain a hit beyond the three pre-existing ones (`types.ts` comment, `assess.ts` pack path, `summary.ts` comment).
- **Pure functions only.** No filesystem, no network, no clock.
- **Every file starts with a JSDoc block saying *why* the file exists**, not what it does — match `src/corpus/store.ts`.
- **Invisible or visually ambiguous characters in code are escape sequences** (non-breaking spaces, combining marks, zero-width). Visible punctuation stays literal.
- **Commit message style is imperative sentence-case with no prefix.** No `Co-Authored-By` trailer.
- **`npm test` green before every commit.** No test performs a network fetch.
- Work from `backend/engine`. The suite stands at **233 tests** green at the start of this plan.

## Spec reference

`docs/superpowers/specs/2026-08-20-verification-factory-design.md` §2.3 (the renderer), §4.2 (what a signature pins). Read both first.

## The seventeen primitives

Derived from the `Condition` discriminated union in `src/types.ts`, which is the source of truth:

```
all  any  not
cmp  eq  in_set  in_catalogue  prefix_in  exists  count_cmp
quantifier_any  sum_cmp
fy_starts_on_or_after  fy_start_year_in  year_diff_lt
requirement_ref  pack_flag
```

Seventeen. Fourteen appear in the CSRD pack today; `prefix_in`, `quantifier_any` and `sum_cmp` do not and exist for CBAM — omitting them fails the standing architecture gate.

Before starting, re-derive the list and confirm it still has seventeen members:

```bash
node -e "const s=require('fs').readFileSync('src/types.ts','utf8');const m=s.match(/export type Condition =([\s\S]*?);\n/)[1];const ops=[...m.matchAll(/op:\s*'([a-z_]+)'/g)].map(x=>x[1]);console.log(ops.length, ops.join(' '))"
```

If it returns anything other than seventeen, the union has changed since this plan was written — stop and report before proceeding.

**Requirement kinds.** `kind: 'boolean'` carries a single `condition`. `kind: 'selection'` carries ordered `cases[]` (each a `when` condition, a `value`, an optional `label`) plus a `defaultValue`. Both are logical payload. `CSRD-S-012` is the only selection requirement today.

## File structure

| File | Responsibility |
|---|---|
| `src/verification/vocabulary.ts` | Fact ids and values to words. No knowledge of condition structure |
| `src/verification/render.ts` | `Requirement` to English. `RENDERER_VERSION` |
| `src/verification/canonical.ts` | Canonical serialisation and hashes of the logical payload |
| `src/verification/features.ts` | Binding-preserving feature model from a requirement and from English; comparison |
| `knowledge/csrd/fact-types.json` | Gains `label` and, for numeric facts, `unit` |
| `src/knowledge/loader.ts` | Gains the label/unit coverage assertion |

Tests: `test/verification-vocabulary.test.ts`, `verification-render.test.ts`, `verification-canonical.test.ts`, `verification-features.test.ts`, `verification-mutation.test.ts`.

**Dependency order:** Task 1 → Task 2 → Task 3 (independent of 2) → Task 4 → Task 5.

---

### Task 1: Fact and value vocabulary

`fact-types.json` carries no human label — only ids like `entity.net_turnover_eur`. Mechanically de-slugging that gives *"net turnover eur"*, which is not what the law says and would generate false challenges in the very pass this exists to support.

It also carries no unit. `dataType` is `number_or_range` for **both** `entity.net_turnover_eur` (EUR) and `entity.avg_employees` (a headcount), so `dataType` cannot supply one — and a checker that cannot see units cannot tell a EUR 450 000 000 threshold from a 450 000 000-employee threshold.

**Decision, deliberate:** explicit `label` and `unit` on the fact type are the source of truth; a mechanical fallback keeps an unlabelled fact rendering rather than crashing; and a loader assertion makes any referenced fact with a missing label, a missing unit where one is required, or an unresolved label **fail the build**. The gap is visible and blocking, matching the corpus's `corpus_gap` pattern.

**Files:**
- Create: `src/verification/vocabulary.ts`
- Modify: `knowledge/csrd/fact-types.json`
- Modify: `src/knowledge/loader.ts`
- Test: `test/verification-vocabulary.test.ts`

**Interfaces:**
- Produces:
  - `factLabel(factId: string, factTypes: FactType[]): string`
  - `factUnit(factId: string, factTypes: FactType[]): string | null`
  - `mechanicalLabel(factId: string): string`
  - `renderValue(value: string | number | boolean, unit?: string | null): string`
  - `factsReferencedBy(requirement: Requirement): string[]` — deduped, sorted; walks `condition` **and** every case's `when`
  - `assertFactVocabularyCoverage(pack: KnowledgePack): void`

**Required behaviours:**

1. `mechanicalLabel` drops the scope prefix and replaces underscores with spaces: `entity.net_turnover_eur` → `net turnover eur`. It does **not** expand abbreviations — a wrong guess is worse than a visibly unfinished string.
2. `factLabel` returns the explicit `label` when present, the mechanical fallback otherwise.
3. `renderValue` formats numbers with **ordinary space** (U+0020) thousands separators — `450000000` → `450 000 000` — appends the unit when one is given, renders booleans as `yes`/`no`, and strings verbatim. Use U+0020, not a narrow or non-breaking space: the legal text uses ordinary spaces, `normalizeWhitespace` collapses the exotic variants to U+0020 anyway, and an invisible separator in source would breach the escape constraint for no gain.
4. `factsReferencedBy` walks `of`, `where`, and every case's `when`, collecting `fact` and `fromFact`. `quantifier_any` and `sum_cmp` contribute their inner facts.
5. **`assertFactVocabularyCoverage` throws when any referenced fact:**
   - has no explicit `label`; **or**
   - carries `labelNote: "requires review"` — an unresolved label must not pass the gate, because recording uncertainty is not the same as resolving it; **or**
   - is used in a `cmp`, `count_cmp` or `sum_cmp` comparison and has no explicit `unit`.

   The error names **every** offender, not the first.

**Vocabulary to add.** These four labels and units are given verbatim because they carry Art. 19a/29a weight:

| Fact id | `label` | `unit` |
|---|---|---|
| `entity.net_turnover_eur` | `net turnover` | `EUR` |
| `entity.avg_employees` | `average number of employees during the financial year` | `employees` |
| `group.consolidated_net_turnover_eur` | `consolidated net turnover` | `EUR` |
| `group.avg_employees` | `consolidated average number of employees during the financial year` | `employees` |

For the remaining referenced facts, write the label from the fact's `module`, `notes` and the requirement text that uses it. **Do not invent legal wording.** Where the legal term is genuinely unclear, add `"labelNote": "requires review"` — which fails the build by design, surfacing the item for a human rather than letting it through. Report every fact you marked that way.

- [ ] **Step 1: Enumerate the referenced facts** — this is your work list

```bash
node -e "const rs=require('./knowledge/csrd/requirements.json');const s=new Set();const w=c=>{if(!c||typeof c!=='object')return;if(c.fact)s.add(c.fact);if(c.fromFact)s.add(c.fromFact);for(const k of ['of','where','when']){const v=c[k];if(Array.isArray(v))v.forEach(w);else if(v)w(v)}};rs.forEach(r=>{w(r.condition);(r.cases||[]).forEach(c=>w(c.when))});console.log([...s].sort().join('\n'))"
```

- [ ] **Step 2: Write the failing tests** — mechanical fallback; explicit label wins; `450000000` renders as `450 000 000` with ordinary spaces; unit appended when given; `factsReferencedBy` reaches a fact nested inside `quantifier_any` **and** a fact inside a selection case's `when`; `assertFactVocabularyCoverage` names **two** offenders when two facts are unlabelled; a fact carrying `labelNote: "requires review"` **fails**; a `cmp`-referenced fact with no `unit` **fails**
- [ ] **Step 3: Run them; confirm they fail for the right reason**
- [ ] **Step 4: Implement `vocabulary.ts`**
- [ ] **Step 5: Add `label` and `unit` to `fact-types.json`** for every fact from Step 1
- [ ] **Step 6: Wire `assertFactVocabularyCoverage` into the loader**
- [ ] **Step 7: Focused tests, then `npm test && npm run typecheck`**
- [ ] **Step 8: Commit**

---

### Task 2: The renderer

**Files:** Create `src/verification/render.ts`; test `test/verification-render.test.ts`

**Interfaces:**
- `RENDERER_VERSION: string` (start `1.0.0`)
- `renderCondition(condition: Condition, ctx: RenderContext): string`
- `renderRequirement(requirement: Requirement, ctx: RenderContext): string`
- `interface RenderContext { factTypes: FactType[]; catalogues: Record<string, unknown>; }`

**Required behaviours:**

1. **All seventeen primitives render**, including the three CBAM ones.
2. **Exhaustiveness is enforced by the compiler.** The `op` switch ends in a `default` branch assigning the narrowed value to `never`:
   ```ts
   default: {
     const exhaustive: never = condition;
     throw new Error(`unhandled condition op: ${JSON.stringify(exhaustive)}`);
   }
   ```
   Adding a member to the `Condition` union without a renderer case must make `npm run typecheck` fail. That compile-time failure is the guarantee — a `@ts-expect-error` test on an invalid op proves only that invalid ops are rejected, which is a different and much weaker property.
3. **Nesting is unambiguous, and the structure follows a fixed grammar.** Prose alone cannot carry a tree, and `featuresFromEnglish` must recover paths like `all[1].any[0]` from the text — so the plan defines the presentation contract rather than leaving the extractor to guess at one.

   Operator lines are fixed markers on their own line; children are numbered and indented two spaces per level:

   ```
   ALL of:
     1. <atom prose>
     2. ANY of:
       1. <atom prose>
       2. <atom prose>
   ```

   Markers are exactly `ALL of:`, `ANY of:` and `NOT:` (which takes a single numbered child). Paths derive directly: the atoms above are `all[0]`, `all[1].any[0]`, `all[1].any[1]`.

   **The atom prose stays natural** — the grammar constrains the scaffolding, not the sentences. `all[a, any[b, c]]` and `any[all[a, b], c]` therefore differ in their marker lines, not merely in comma placement.
4. **`not` negates the whole inner clause**, never by flipping an inner comparator. `not(cmp gt 1000)` is *"it is not the case that … exceeds 1 000"*, not *"… is at most 1 000"*: the two differ on `INDETERMINATE`, and the renderer must not perform a logical transformation the evaluator does not.
5. **Comparators render distinctly and directionally:** `gt` → `exceeds`, `gte` → `is at least`, `lt` → `is below`, `lte` → `is at most`. `gt` and `gte` must never render identically.
6. **Thresholds carry value and unit exactly**, via `renderValue` and `factUnit`.
7. **`requirement_ref` names the requirement id and the expected truth verbatim** (`APPLIES`, `DOES_NOT_APPLY`, `INDETERMINATE`). Do not paraphrase into "applies" / "does not apply" — that blurs the three-valued logic the engine rests on.
8. **Selection requirements render as ordered cases**, with the ordering stated explicitly because the evaluator takes the first match, and with `defaultValue` as an explicit final fallback.
9. **Pure and deterministic.**

**Required test cases:** one per primitive asserting the load-bearing tokens (fact label, comparator phrase, value, unit); the two nesting shapes render differently; `not(cmp gt)` does not contain the `lte` phrase; all four comparators render distinctly; a selection requirement renders cases in order and names the default; identical input renders identically twice.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail for the right reason**
- [ ] **Step 3: Implement `render.ts` with the `never` exhaustiveness branch**
- [ ] **Step 4: Focused tests green**
- [ ] **Step 5: Prove the exhaustiveness branch works.** Temporarily add a member to the `Condition` union in `src/types.ts`, confirm `npm run typecheck` **fails** pointing at the renderer, then revert and confirm it passes. Record both outputs — this is the guarantee, so demonstrate it rather than assuming it.
- [ ] **Step 6: Render all 16 CSRD requirements and read the output yourself.** Print each. This is not a test; it is the check that the English is English. Include `CSRD-S-001` and `CSRD-S-012` renderings in your report so a human can judge. If any reads as machine output rather than a sentence, fix it and say what you changed.
- [ ] **Step 7: `npm test && npm run typecheck`**
- [ ] **Step 8: Commit**

---

### Task 3: Canonical hashing of the logical payload

**Files:** Create `src/verification/canonical.ts`; test `test/verification-canonical.test.ts`

**Interfaces:**
- `canonicalizeCondition(condition: Condition): string`
- `conditionSha256(condition: Condition): string`
- `logicalPayloadSha256(requirement: Requirement): string`
- `requirementInputSha256(requirement: Requirement): string`

**Required behaviours:**

1. **Stable under key reordering.** Two conditions differing only in JSON key order hash identically.
2. **Not stable under array reordering.** `all[a, b]` and `all[b, a]` hash **differently**. They are logically equivalent but they are not the same encoding, and a signature pins the encoding that was read.
3. **Escaped, not delimiter-joined.** Fact ids and string values are free text; a delimiter-joined serialisation can be forged by a value containing the delimiter. This reached Critical in B1a's closure hash — do not reintroduce it. Use `JSON.stringify` over a key-sorted structure or an equivalent escaping encoding.
4. **`logicalPayloadSha256` covers the whole logical payload for both kinds.** For `boolean`: the `condition`. For `selection`: the **ordered** `cases[]` — each case's `when` and `value` — **and** `defaultValue`. Reordering cases, changing an emitted value, or changing the default are each semantic edits and must each move the hash.

   **A case's `label` is explicitly NOT part of the payload.** It is presentation: it changes what a reader sees, not what the engine selects. Including it would make a wording improvement register as `stale_encoding` and invalidate a signature over an encoding that did not change — the alarm-fatigue failure the raw/normalized split exists to prevent, one layer up. A label edit will still move `renderedConditionSha256` when B1b-ii pins it, which is the correct and weaker signal: the English the reviewer read has changed, the logic has not.
5. **`requirementInputSha256` covers the provision citation, `sources[]`, and `logicalPayloadSha256` — and nothing else.** Per spec §4.2 it must move when the verification input changes and stay still when an unrelated field is edited.

**Required test cases:** key reordering stable; array reordering not stable; a value containing a delimiter-like character does not collide with a differently-structured condition; **reordering two selection cases changes the hash**; **changing a case's emitted `value` changes the hash**; **changing `defaultValue` changes the hash**; **changing a case's `label` leaves `logicalPayloadSha256` unchanged**; editing `caution` leaves `requirementInputSha256` unchanged; editing `sources[]` changes it; editing the condition changes it.

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `canonical.ts`**
- [ ] **Step 4: Focused tests, then `npm test && npm run typecheck`**
- [ ] **Step 5: Commit**

---

### Task 4: The binding-preserving feature model

This is the independent check, and its design is the heart of this plan.

**An inventory of words is not enough.** A checker comparing facts, comparators and thresholds as separate collections self-agrees on a materially wrong rendering: *"turnover exceeds 450 000 000 EUR; employees exceed 1 000"* and *"turnover exceeds 1 000; employees exceed 450 000 000 EUR"* contain the identical multiset of facts, comparators and thresholds. Likewise `maxDepth` plus conjunction order does not pin a tree — several distinct trees share both.

So the model preserves **bindings** (which threshold belongs to which fact under which comparator) and **structural paths** (where in the tree each atom sits).

**Files:** Create `src/verification/features.ts`; test `test/verification-features.test.ts`

**Interfaces:**

```ts
interface AtomFeature {
  path: string;            // structural address, e.g. "all[0]", "all[1].any[0]"
  op: string;              // the primitive's op
  negated: boolean;        // an odd number of enclosing `not`
  fact?: string;           // rendered fact label
  comparator?: string;     // canonical token: gt | gte | lt | lte
  threshold?: string;      // CANONICAL value (e.g. "450000000"), never the displayed form
  unit?: string | null;    // canonical unit token (e.g. "EUR")
  catalogue?: string;
  requirementRef?: string;
  expect?: string;
  literal?: string;        // eq / in_set / prefix_in / pack_flag payloads
}

interface ConditionFeatures {
  atoms: AtomFeature[];    // ordered by path
  shape: string;           // operator tree, e.g. "all(cmp,cmp,any(eq,eq))"
}

interface CaseFeature { index: number; when: ConditionFeatures; value: string; }

interface RequirementFeatures {
  kind: 'boolean' | 'selection';
  condition?: ConditionFeatures;
  cases?: CaseFeature[];   // ordered
  defaultValue?: string;
}

featuresFromRequirement(requirement: Requirement, ctx: RenderContext): RequirementFeatures
featuresFromEnglish(text: string, ctx: RenderContext): RequirementFeatures
compareRequirementFeatures(a: RequirementFeatures, b: RequirementFeatures): string[]
```

**Required behaviours:**

1. **Atoms compare by path.** The atom at `all[0]` on one side is compared against the atom at `all[0]` on the other — fact, comparator, threshold and unit together. The turnover/employee swap therefore diverges at both paths.
2. **`shape` pins the operator tree**, not merely its depth. Two distinct trees must not share a shape string.
3. **Units are part of the atom**, so a threshold that keeps its digits but loses or changes its unit diverges.
4. **Selection requirements compare case by case, in order**, including each case's `value` and the `defaultValue`. A reordering diverges.
5. **`compareRequirementFeatures` reports every divergence**, each line naming the path, the feature, the requirement-side value and the English-side value.
6. Divergence is a **finding, not a throw** — the caller decides severity.

**Independence — the load-bearing constraint.**

The boundary is drawn at **function** granularity, not module granularity. What matters is whether a thing is a *lookup* of source data or a *derivation*: two sides may safely agree on what a fact is called, because that is read from the pack, but they must not agree on any transformation, because a faulty transformation agrees with itself.

`features.ts` **may** import, from `vocabulary.ts` and nothing else:
- `factLabel()` — a lookup into `fact-types.json`
- `factUnit()` — a lookup into `fact-types.json`

`features.ts` **may not** import:
- **`renderValue()`** — it is a derivation, not a lookup. If both the renderer and the condition-side extractor format numbers through it, a formatter that drops a digit produces `450000000` on one side and `"45 000 000"` on the other, and they agree. That is precisely the B1a defect pattern, surviving inside a boundary drawn one level too coarse.
- `render.ts`, **nor any module `render.ts` uses for semantics** — no shared traversal, comparator mapping, conjunction or negation mapping, operator-to-English table, or structural helper. Extracting those into a third module imported by both would recreate the same self-agreeing check.

**Consequences for the value path, which must be implemented as stated:**
- `featuresFromRequirement` records the **canonical raw value** taken straight from the AST — `450000000`, not any formatted form.
- `featuresFromEnglish` **parses the displayed value back to canonical form** with its own reader, and records that. A displayed `"45 000 000"` yields `45000000`, which diverges from `450000000` and is caught.
- The same applies to units: `featuresFromEnglish` must read the unit **token out of the text** adjacent to the threshold. It may not call `factUnit()` for the fact it just identified — that would compare a lookup against itself and make the unit check vacuous. `factUnit()` is available to the *condition* side only.

The English-side recognition of comparator phrases, conjunctions, negation and values must therefore be **implemented independently in `features.ts`**. This duplication is deliberate and load-bearing. A consequence worth stating: changing the renderer's word for `gt` will make the checker diverge until it is updated too. That friction is the mechanism working — it forces a deliberate change on both sides rather than a silent one on either.

A test must assert the import boundary at the **symbol** level: `features.ts` imports nothing beyond `types.ts`, node builtins, and exactly the two named symbols `factLabel` and `factUnit` from `vocabulary.ts`. An import of `renderValue` must fail that test.

**Required test cases:**

- **Zero divergences across all 16 CSRD requirements** — the false-positive control on real content.
- **Round-trip parity across all seventeen primitives, from synthetic fixtures.** The CSRD pack exercises only fourteen; `prefix_in`, `quantifier_any` and `sum_cmp` appear nowhere in it. Without this, the English-side extractor for those three could be entirely broken and the main acceptance gate would still pass — the plan would be measuring the extractor against the fourteen cases that happen to exist rather than the seventeen it claims to cover.

  Build one synthetic `Condition` per primitive in a fixture table, and for each run:

  ```
  condition -> renderCondition -> featuresFromEnglish
                              \-> featuresFromRequirement
  compare -> expect zero divergences
  ```

  The table must be **derived from the union**, not hand-listed: a test asserts every op in `Condition` has a fixture, so adding an eighteenth primitive fails until it is covered.
- A **value-formatting divergence** is caught: an English string displaying `45 000 000` against a condition holding `450000000` diverges. This is the test that proves the `renderValue` boundary is doing work.
- The turnover/employee **swap** diverges, at both paths.
- A hand-corrupted English string diverges naming the right path and feature.
- A threshold with the right digits and the wrong unit diverges.
- A selection requirement with two cases reordered diverges.
- The symbol-level import-boundary assertion.

- [ ] **Step 1: Write the failing tests**, including the zero-divergence control and the swap case
- [ ] **Step 2: Run them; confirm they fail**
- [ ] **Step 3: Implement `features.ts`** within the import boundary
- [ ] **Step 4: Focused tests green**
- [ ] **Step 5: Report the false-positive count across all 16 requirements.** If it is not zero, **do not tune the extractor to force it to zero without saying so** — report which requirement diverged and why. A genuine divergence here means the renderer or the extractor is wrong, and that finding is the point of this plan.
- [ ] **Step 6: `npm test && npm run typecheck`**
- [ ] **Step 7: Commit**

---

### Task 5: The mutation suite

The acceptance gate. A test that cannot fail against a broken implementation is not evidence.

**Files:** Create `test/verification-mutation.test.ts`

For each mutation, applied to a real requirement's **logical payload**, then rendered, the rendered English compared against the features of the **original** requirement must report at least one divergence. That sequence simulates a renderer misreading: the English describes something the requirement does not say.

| Mutation | Applied to | Detected as |
|---|---|---|
| Wrong conjunction | `CSRD-S-001`: `all` → `any` | shape divergence |
| Dropped atom | `CSRD-S-001`: remove the `avg_employees` atom | atom set / shape divergence |
| Inverted comparator | `CSRD-S-001`: `gt` → `lt` on turnover | comparator divergence at that path |
| Wrong threshold | `CSRD-S-001`: `450000000` → `40000000` | threshold divergence at that path |
| Wrong unit | `CSRD-S-001`: turnover threshold carrying the employee unit | unit divergence at that path |
| **Swapped bindings** | `CSRD-S-001`: exchange the two thresholds between the turnover and employee atoms | threshold divergence at **both** paths |
| Wrong nesting | a nested rule: re-associate a nested `any` into its parent `all` | shape divergence |
| **Case reordering** | `CSRD-S-012`: swap two `cases[]` entries | case-order divergence |
| **Default changed** | `CSRD-S-012`: change `defaultValue` | default divergence |
| **Displayed value corrupted** | any `cmp` atom: English shows `45 000 000` for a `450000000` threshold | threshold divergence at that path |
| **`prefix_in` corrupted** | synthetic fixture: alter one prefix in the list | literal divergence at that path |
| **`quantifier_any` corrupted** | synthetic fixture: change the quantified `scopeType` | atom / shape divergence |
| **`sum_cmp` corrupted** | synthetic fixture: change the comparator | comparator divergence at that path |

Plus a **clean control**: the unmutated requirement reports zero divergences.

The last three run against the synthetic fixtures from Task 4, because CSRD does not exercise those primitives. They are the higher-risk ones precisely because no real content would catch a mistake in them.

- [ ] **Step 1: Write the suite** — all thirteen mutations and the control
- [ ] **Step 2: Run it.** Every mutation must be detected. If one is not, that is a real gap in the feature model — **report it rather than weakening the test**, and say which feature would have to be added.
- [ ] **Step 3: Confirm teeth in the other direction** — temporarily make `compareRequirementFeatures` return `[]` always, confirm all thirteen mutation tests fail and the control still passes, then restore and confirm green
- [ ] **Step 4: `npm test && npm run typecheck`**
- [ ] **Step 5: Commit**

---

## Self-review

**Spec coverage.** §2.3's "pure, unit-tested function covering every v0 primitive, carrying a `rendererVersion`" is Task 2, all seventeen enumerated and the count re-derived from the union at execution time. §4.2's `conditionSha256` and `requirementInputSha256` are Task 3, extended with `logicalPayloadSha256` so selection requirements' ordered cases and default are covered. The acceptance criterion — an independently implemented structural check plus a mutation suite detecting wrong conjunction, dropped atom, inverted comparator, wrong threshold and wrong nesting — is Tasks 4 and 5, extended with unit, binding-swap, case-order and default mutations.

**Deferred to B1b-ii, correctly.** `renderedConditionSha256` is pinned by a signature and no signature exists yet. The review sheet consumes the renderer but belongs with the record. The `ratification.status` migration touching `frontend/web/lib/pack.ts` is record work.

**Known limit, stated rather than hidden.** The feature model checks structure and bindings, not meaning. A mutation preserving every atom binding and the tree shape would pass — for instance substituting one fact for another that happens to share a label. The mitigation is that the model covers the failure modes that matter for threshold rules, and Task 5 proves each is caught. If B2's prosecutors find a divergence class it misses, the model grows.

**Type consistency checked.** `RenderContext` is defined in Task 2 and consumed in Task 4 unchanged. `RequirementFeatures` is produced by both `featuresFromRequirement` and `featuresFromEnglish` and consumed by `compareRequirementFeatures`. `factLabel`, `factUnit` and `factsReferencedBy` are named identically in Tasks 1, 2 and 4. `renderValue` is defined in Task 1 and used by Task 2 only — Task 4 is barred from it by the symbol-level import boundary, which is why the value path is specified as canonical-on-the-AST-side and parsed-on-the-English-side. `logicalPayloadSha256` is defined in Task 3 and referenced nowhere earlier.
