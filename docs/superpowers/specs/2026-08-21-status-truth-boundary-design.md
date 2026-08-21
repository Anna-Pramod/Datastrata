# The status truth boundary

**Date:** 2026-08-21
**Status:** Design approved, ready for implementation planning
**Refines:** `2026-08-20-b1b-ii-record-design.md` §4 and §7.4. Where the two differ, this document governs.
**Scope:** Program-agnostic. One plan. Blocks the first real signature in B2.

---

## 1. The problem, and the evidence for it

B1b-ii-b made a requirement's status derived rather than asserted. The loader attaches it:

```ts
deriveStatus(governingEntry(entries, packId, r.id), [])
```

That second argument is an **empty staleness set**, supplied because `loadPack` has no corpus, no rendered condition and no pinned result to compute one from. Confirmed directly against the current tree:

```
deriveStatus(signed, [])               ->  { derivedStatus: 'verified', statusReasons: [] }
deriveStatus(signed, ['stale_result']) ->  { derivedStatus: 'draft', statusReasons: ['stale_result'] }
```

So the moment the ledger holds a signature, a signature that has since gone stale reads **`verified`** through the loader, and that value propagates to the `minStatus` filter in `evaluate.ts`, to `containsDraftContent` (the prototype banner), and to the public site's counts in `frontend/web/lib/pack.ts`.

It is harmless **only** while the ledger is empty.

The defect is not that someone forgot to compute staleness. It is that `[]` is a valid, meaningful value that happens to mean the opposite of what the caller meant: *"I checked and nothing is stale"* used where *"I did not check"* was true. A contract saying "callers should supply real staleness" leaves the same call compiling, so the same mistake recurs.

**The invariant this design establishes:**

> A customer-facing surface may say `verified` only if a human signature governs **and** freshness was positively evaluated against the current record. Absence of a freshness evaluation is never evidence of freshness.

### 1.1 Two call sites that are already correct, and why they still change

`grep` finds three `deriveStatus(governing, [])` call sites, but only the loader is unsound:

| Site | Context | Sound? |
|---|---|---|
| `knowledge/loader.ts:154` | every requirement, unconditionally | **no** |
| `cli/sign.ts:571` | inside `if (expected.kind === 'revoked')` | yes |
| `cli/review-sheet.ts:512` | inside `if (signature === null)` | yes |

The latter two sit in branches where `deriveStatus` genuinely ignores staleness, and the sheet says so in a comment: *"deriveStatus consults staleness in neither case, so nothing needs to be computed for it."*

They are correct **by comment**. Under this design they stop passing a meaningless empty array and become `{ kind: 'revoked', entry }` and `{ kind: 'unsigned' }` — correct **by construction**. The type change does not merely fix the bug; it retires the pattern that made the bug expressible, including at the sites that had already dodged it.

---

## 2. Four concepts that were one

The old signature conflated four questions. This design separates them, and the separation is the design:

| Concept | Question |
|---|---|
| **Authority** | Is there a governing signature or revocation? |
| **Freshness evaluation** | Was that signature actually checked against current state? |
| **Drift** | If checked, what moved? |
| **Integrity failure** | Could the check not be performed, because trusted material is missing or damaged? |

The fourth is the one most easily lost. **"I checked and the record is broken" must never become "I have not checked."** §5 makes that structural rather than disciplinary.

**Ledger-history integrity precedes all four.** You cannot answer *"what authority governs?"* if the append-only authority record itself cannot be trusted. `attachDerivedStatus` calls `parseLedger(text)` **before** `governingEntry(entries, …)`, so a damaged history throws `LedgerIntegrityError` before any authority is resolved and before a resolver could be called. That ordering is verified in the current tree and is load-bearing for §5.

---

## 3. The type model

```ts
interface CheckedFreshness {
  checked: true;
  reasons: StalenessReason[];
}

type FreshnessAssessment =
  | { checked: false }
  | CheckedFreshness;

type StatusInput =
  | { kind: 'unsigned' }
  | { kind: 'revoked'; entry: RevocationEntry }
  | { kind: 'signed'; entry: SigningEntry; freshness: FreshnessAssessment };

function deriveStatus(input: StatusInput): RequirementStatus;
```

**The outer discriminant is required, not stylistic.** An earlier draft discriminated on the nested `governing` property. It does not compile — TypeScript will not narrow an outer union from a nested discriminant check. Verified:

```
error TS2339: Property 'freshness' does not exist on type
  '{ governing: RevocationEntry } | { governing: SigningEntry; freshness: FreshnessAssessment }'
```

That shape would force a cast or a hand-written type guard, and writing one returns the burden to discipline — the exact thing this design removes.

**`freshness_unchecked` is a `StatusReason`, never a `StalenessReason`:**

```ts
type StatusReason = StalenessReason | 'revoked' | 'freshness_unchecked';
```

It describes our epistemic state about a signature, not a way the world moved underneath it. `deriveStaleness` therefore cannot return it, enforced by the type rather than by care — the same mechanism B1b-ii-a used to exclude `revoked`.

**`deriveStatus` switches exhaustively** over `input.kind`, with an `assertNever`-style terminal branch. If someone later adds `{ kind: 'suspended' }`, status derivation must fail the build rather than silently acquire default behaviour. Making authority-state expansion compile-time visible is the point of the discriminant, not merely easier narrowing.

### 3.1 The adapter, and its deliberate friction

Freshness is not merely *ignored* for unsigned and revoked authority — it is **not a meaningful input there at all**. Overloads say so:

```ts
function toStatusInput(governing: null): StatusInput;
function toStatusInput(governing: RevocationEntry): StatusInput;
function toStatusInput(governing: SigningEntry, freshness: FreshnessAssessment): StatusInput;
```

A caller holding `governingEntry()`'s `LedgerEntry | null` must narrow before calling. That friction is the feature: the only branch in which the compiler asks *"was freshness checked?"* is the branch where the question has meaning.

Verified against the real compiler — each of these is an error, and each legal call compiles:

| Call | Result |
|---|---|
| `toStatusInput(unnarrowed)` | **error** — the caller must branch |
| `toStatusInput(signed)` | **error** — must say whether freshness was checked |
| `toStatusInput(null, fresh)` | **error** — meaningless for unsigned authority |
| `toStatusInput(revoked, fresh)` | **error** — meaningless for a revocation |
| `toStatusInput(null)` / `toStatusInput(revoked)` | compiles |
| `toStatusInput(signed, fresh)` / `toStatusInput(signed, { checked: false })` | compiles |

There is no `toStatusInput(governing: LedgerEntry \| null, freshness?: …)` overload. Accepting an unnarrowed union with optional freshness would rebuild `deriveStatus(governing, [])` one layer up.

---

## 4. The projection

| Governing authority | Freshness state | Projection |
|---|---|---|
| none | n/a | `draft`, `[]` |
| revocation | n/a | `draft`, `['revoked']` |
| signing | unchecked | `draft`, `['freshness_unchecked']` |
| signing | checked, no reasons | `entry.kind`, `[]` |
| signing | checked, advisory only | `entry.kind`, `[advisory reasons]` |
| signing | checked, blocking | `draft`, `[full reason set]` |
| signing | check attempted, trusted material missing | **throw** — no projection |

`draft, []` keeps its exact current meaning: **no governing signature**. `freshness_unchecked` must never appear merely because nothing is signed. That compatibility is asserted, not assumed — see §6.

---

## 5. The resolver contract

```ts
function resolveFreshness(…): CheckedFreshness;
```

The return type is `CheckedFreshness`, **not** `FreshnessAssessment`. That single choice gives `{ checked: false }` exactly one provenance — *a caller deliberately did not invoke a resolver* — and makes it impossible for any resolver outcome to produce it.

| Situation | Result |
|---|---|
| not checked | `{ checked: false }`, supplied by the caller |
| checked, fresh | `{ checked: true, reasons: [] }` |
| checked, ordinary drift | `{ checked: true, reasons: [...] }` |
| check attempted, pinned result absent **or** pinned corpus document vanished | **throws `IntegrityFailureError`** |
| signature ledger unreadable | **the resolver is never called** — the ledger load fails first with `LedgerIntegrityError`, which the CLI boundary maps to forensics-required |

**A damaged ledger is not the resolver's to discover, and must not be folded into `IntegrityFailureError`.** You cannot obtain a trustworthy governing `SigningEntry` until the history has parsed, so by the time a resolver could run, ledger integrity is already settled. B1b-ii-b deliberately paid to establish forensics-required as a category distinct from ordinary integrity failure — a damaged append-only history means the record itself is in question, not that one pinned artefact is missing. Collapsing the two here would spend that distinction for nothing.

**There must be no `catch` in this layer that converts an `IntegrityFailureError` into `{ checked: false }`.** A caller can still catch and lie, but that now requires visible code a reviewer can see rather than a silent fallback. TypeScript cannot make that impossible — a determined caller can always catch and fabricate — so the boundary is *visible code plus a mutation-proven propagation test* (§7.4), which is the appropriate strength here rather than an attempt at structural prohibition.

### 5.1 How a resolver reaches the loader

The seam must be settled here, not invented during planning. `LoadPackOptions` currently carries only `versionRegistryDir` and `ledgerPath`, and `attachDerivedStatus` reads the ledger and projects status itself.

```ts
interface FreshnessResolverInput {
  packId: string;
  /** The authored requirement, before any status is attached. */
  requirement: AuthoredRequirement;
  /** The governing entry whose freshness is in question. */
  entry: SigningEntry;
  /** `{ factTypes, catalogues }` from the pack being assembled. */
  renderCtx: RenderContext;
}

type FreshnessResolver = (input: FreshnessResolverInput) => CheckedFreshness;

interface LoadPackOptions {
  versionRegistryDir?: string;
  ledgerPath?: string;
  freshnessResolver?: FreshnessResolver;
}
```

**Behavioural rules, all binding:**

1. The resolver is invoked **only** for a governing `SigningEntry`.
2. No resolver supplied → `toStatusInput(signing, { checked: false })`.
3. Resolver supplied → its `CheckedFreshness` goes directly into the signed `StatusInput`, unexamined and unmodified.
4. Unsigned and revoked requirements **never** invoke it. There is nothing for it to be about, and calling it would cost work to produce a value `deriveStatus` discards.
5. **Resolver exceptions propagate.** The loader must not catch them and manufacture unchecked freshness.

**Why `renderContext` and the requirement are in the input, and not just the entry.** The future live resolver must compare the entry's pinned `conditionSha256` and `renderedConditionSha256` against *current* values, which means calling `candidateConditionSha256(requirement)` and `candidateRenderedConditionSha256(requirement, renderContext)`. If the input carried only a `SigningEntry`, obtaining those current values would require loading the very pack whose statuses are being resolved — a recursive `loadPack()`.

**The division of responsibility, stated precisely.** The loader supplies **all pack-local deterministic inputs** needed to derive the current hashes: the authored requirement and the render context. The resolver **closes over the external verification state it owns** — corpus, result storage and verification paths. Do not describe the input as containing "everything the resolver needs"; that phrasing is how someone later justifies adding corpus or result reads to `loadPack`, which is exactly the coupling this design exists to avoid.

#### The loader needs a staging change, and the plan must not discover it

`RenderContext` is `{ factTypes, catalogues }` and both are conceptually available — but **not in the current evaluation order**. `attachDerivedStatus` is called at the `requirements:` property *inside the object literal*, and `catalogues:` is parsed four properties later. Object literal properties evaluate in order, so `catalogues` does not exist when status attachment runs. Verified in the current tree.

Stage the parses before construction:

```ts
const m = manifestSchema.parse(read('pack.json'));

// Raw as well as parsed: zod strips unknown keys, so a deleted authored field
// such as `ratification` is invisible in the parsed record.
const rawRequirements: unknown[] = read('requirements.json');

const sources = z.array(sourceRecordSchema).parse(read('sources.json'));
const factTypes = z.array(factTypeSchema).parse(read('fact-types.json'));
const catalogues = z.record(catalogueSchema).parse(read('catalogues.json'));
const authoredRequirements = z.array(requirementSchema).parse(rawRequirements);

const renderContext: RenderContext = { factTypes, catalogues };

const requirements = attachDerivedStatus(
  m.id,
  authoredRequirements,
  options.ledgerPath ?? defaultLedgerPath(dir),
  renderContext,
  options.freshnessResolver,
);

const pack: KnowledgePack = {
  ...m,
  sources,
  factTypes,
  requirements,
  obligationTemplates: z.array(obligationTemplateSchema).parse(read('obligation-templates.json')),
  gapTests: z.array(gapTestSchema).parse(read('gap-tests.json')),
  questions: z.array(questionSchema).parse(read('questionnaire.json')),
  catalogues,
};
verifyIntegrity(pack, rawRequirements);
```

`verifyIntegrity` must keep receiving the **raw** array — that is what Task 6's leftover-`ratification` check reads, and it is invisible in the parsed record.

Beyond making the resolver possible, the staging says something true that the current shape obscures: **status attachment is a projection over already-parsed authored knowledge**, not something happening halfway through building the pack.

#### `AuthoredRequirement` needs a neutral owner

`candidateConditionSha256` and `candidateRenderedConditionSha256` currently take `Requirement`, which carries `derivedStatus` and `statusReasons` — loader projections that must have no bearing on a content hash. The loader holds only the authored shape at that point.

`AuthoredRequirement` is today **module-private inside `knowledge/loader.ts`** (declared without `export`). Do **not** solve this by exporting it and importing it into `verification/sign.ts`: that would make a verification primitive depend on the knowledge loader merely to describe the absence of two projected fields.

Give the concept a neutral owner in `types.ts`:

```ts
export type AuthoredRequirement = Omit<Requirement, 'derivedStatus' | 'statusReasons'>;
```

and widen both producers:

```ts
function candidateConditionSha256(requirement: AuthoredRequirement): string;
function candidateRenderedConditionSha256(
  requirement: AuthoredRequirement,
  ctx: RenderContext,
): string;
```

Widening the parameter — rather than casting at the call site, or reaching into the loader — makes the load-bearing claim visible in the API itself:

> Derived verification status is not an input to the content whose verification status is being established.

---

## 6. Scope: fixture-first, and why

This design establishes **status semantics, the resolver interface, and fail-closed loader behaviour** — all against hand-authored fixtures. It does **not** wire a live resolver and does **not** create a results-directory convention.

**The path contract already exists.** `cli/sign.ts:175` defines, citing Factory §4.2:

```
verification/<packId>/<requirementId>/verification-result.json
```

`verification/` currently holds `CSRD-S-001.md` and `requirement-versions/csrd.json` — no result tree. So the convention exists while its artifacts do not, which is exactly the separation fixture-first work needs: B2 becomes the *producer* at an established location rather than inventing storage semantics later.

The dependency direction stays clean:

```
this spec:   status semantics -> resolver interface -> loader fail-closed
B2:          result producer -> existing resultPath -> live resolver
```

The status model does not depend on an unfinished pipeline to prove its own semantics.

---

## 7. Testing

### 7.1 The matrix

Every row of §4's projection table, exercised through the same loader / customer-facing seam.

### 7.2 The central acceptance test

Four steps, in order, each red output **read** to confirm it names the intended assertion rather than an upstream version-integrity or pack-integrity gate:

1. signed + fresh fixture → **`verified`**
2. mutate the pinned-versus-current result relationship → **`draft`, `['stale_result']`** specifically
3. suppress freshness resolution → **`draft`, `['freshness_unchecked']`** — specifically **not** `draft, []`
4. restore → **`verified`** again

Steps 1 and 4 are the positive control and they are mandatory. "A stale signed requirement cannot appear `verified`" is satisfied by a system in which *nothing ever* appears `verified` — a stubbed resolver, a fixture that never signed, a filter that drops everything. That is failure mode 5 in `docs/superpowers/TEST-EVIDENCE-STANDARD.md`. Only the pair is evidence.

### 7.3 The no-catch rule, given teeth

A fixture resolver that throws `IntegrityFailureError('missing pinned result')`:

```
loadPack must throw that failure
  -> and must NOT return draft + freshness_unchecked
```

Then mutate the loader to catch the resolver exception and substitute `{ checked: false }`. **The test must fail on the specific expected-error assertion**, not merely by going red. Without the mutation, §5's prose rule is a comment.

### 7.4 Two further tests

**Migration-golden compatibility, an architectural test rather than regression coverage.** With an empty ledger, unsigned must remain `draft, []`, byte-compatible with B1b-ii-b's migration expectation and its one sanctioned adapter mapping. This proves the new distinction does not retroactively redefine the unsigned state.

**Compile-time type boundary, both sides.** `tsconfig.json` includes `test` (62 test files in the program), so `npm run typecheck` compiles these:

```ts
// @ts-expect-error freshness_unchecked is epistemic status, not staleness
const impossible: StalenessReason = 'freshness_unchecked';
const valid: StatusReason = 'freshness_unchecked';
```

Widening `StalenessReason` to contain it makes the `@ts-expect-error` itself fail the build. The positive line establishes the other side of the boundary, so the test states the rule rather than only its exclusion.

---

## 8. Two gates

**Architecture gate — closes with this work.**

- `StatusInput` introduced; the old `deriveStatus(governing, reasons)` API becomes impossible to call.
- A loader without a resolver yields `freshness_unchecked`, never `verified`.
- The `sign.ts` and `review-sheet.ts` call sites become structurally `unsigned` / `revoked`.
- The fixture resolver contract is established.
- Positive and negative controls prove the boundary.
- The existing migration golden stays green.

**Operational signing gate — remains closed into B2.** Do not create the first real signature until:

- B2 produces a real `verification-result.json` at the existing path;
- the live resolver reads it through that convention;
- a fresh real signature reaches the customer-facing path as `verified`;
- mutating one of its pinned inputs demotes that same path correctly.

Until then the system is *safe* but reports `freshness_unchecked`, which is not the desired operating state.

---

## 9. Deployment contract, and the cache that already exists

> **Deployment revision is the invalidation boundary.** Public verification status reflects the verification state contained in the deployed revision. Signing locally, or committing verification state without deploying that revision, does not change the live site's status.

**Status is already cached for the process lifetime, and this design does not change that.** `csrdPack()` holds the loaded `KnowledgePack` in a module-scope variable, and `loadPack` attaches `derivedStatus` and `statusReasons` **onto the requirements inside that pack**. So a running server instance may continue to expose the status it loaded at startup. No separate status-map cache is needed for process-lifetime status caching to occur — it is already happening.

An earlier draft of this section said the first implementation "performs no independent status-map memoisation." Technically true, and misleading: it implied status is uncached when the pack cache already covers it. Stating the behaviour is the point — a caching property nobody chose is how an invariant arrives by accident.

That behaviour is **acceptable under the current sign → commit → deploy model**, and it is chosen here rather than inherited. It also makes "I signed it and the site still says draft" a predictable answer rather than a support mystery.

**The first implementation adds no additional status-specific cache.** Sixteen requirements is the moment to measure, not to optimise.

**The condition under which this stops being acceptable, stated in advance:** if a future workflow lets signatures, revocations, results or corpus state change *independently of deployment*, the public pack cache must be split, or invalidated by verification-state identity — ledger and content hashes — **before that workflow ships**. Process lifetime is not a valid invalidation key for operational state that can change under a running process.

---

## 10. Non-goals

- **No generated projection file.** B1b-ii §2's rejection stands: no consumer needs one, and materialising status would create a second apparent source of truth. If measured cost ever demands it, it is a derived cache carrying enough input identity to prove what it came from — never a writable source of status.
- **No live resolver, no results directory.** Both are B2's, at the path that already exists.
- **No change to what the public checker claims.** The site is not moved to `minStatus: 'verified'`; that remains a separate product decision. Resolving freshness and filtering out drafts are different questions.
- **No signing-layer accommodation for `CSRD-S-012`.** Its selection shape is a representation problem with a legitimate code answer (`candidateConditionSha256`). Its zero-document closure is an evidence-availability problem, and allowing signing around it would violate the provenance model. That gap is closed by corpus ingestion or not at all.
