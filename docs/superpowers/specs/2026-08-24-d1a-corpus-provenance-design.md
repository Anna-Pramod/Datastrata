# D1(a) — corpus provenance: what a cited source means, and what serves it

**Date:** 2026-08-24
**Status:** Design, revision 4 — complete. §7.1 added 2026-08-27, closing the one gate the D1a-0b audit raised. No implementation. Nothing ingested, no requirement edited, no schema changed, no PDF support written. **State at base `1e16f24`.** The present-tense clauses above describe that tree; Tasks 4–10 have since landed. Passages carrying a dated correction note are governed by `docs/superpowers/plans/2026-08-30-d1a-route-a-class-b.md` §3.
**Base:** `1e16f24` *Stop verification when any cited source is unserved*
**Branch/worktree:** `feature/b1b-ii-a-record` — `/Users/vivin/Documents/DataStrata/b1b-record`
**Blocks:** B3. The real pack cannot serve as a model-quality benchmark until every cited source has a semantically correct disposition and every requirement has correctly weighted provenance.
**Refines:** `2026-08-21-b2-pipeline.md` (the source-completeness amendment) and `2026-08-14-source-register-foundation.md` (tiers and the citation firewall). Where this document and those differ on provenance semantics, this one governs.

---

## 1. What this settles, and why it is not a data-entry task

B2 established the invariant:

> For every source named by the requirement, the reader boundary checks whether the corpus serves that source. Each unserved cited source produces one `corpus_gap` carrying that `sourceId`, and any such gap halts the run before agent execution.

That invariant is a truth-teller, not a to-do list. It says *the declared evidence surface is incomplete*; it does not say *ingest something so the gap goes away*. Ten of sixteen requirements now halt, and each halts for a different reason:

- some cite an authoritative instrument nobody has ingested;
- some cite an act adopted but not in force;
- some cite a Commission explanation of text the corpus already holds;
- some cite a weekly-mutating listing containing no normative text at all;
- and some may cite an act whose operative content now lives in a consolidated host instrument the corpus already serves.

Only the first is an ingestion problem. Treating the rest as ingestion problems would manufacture corpus documents to silence a truthful signal — the same class of error B2 reversed, applied one layer out.

**The invariant this design establishes:**

> A source is cited only if it is the authoritative text of a proposition the requirement's **current** determination rests on. Monitoring surfaces, interpretive glosses of text already held, and superseded historical acts whose content now lives in a consolidated instrument are registered and watched, not cited. Where a source was misclassified, the requirement's provenance is re-authored under the version contract — never mutated in place, and never removed because the gap it produces is inconvenient.

D1(a) is **not a general corpus-expansion programme.** It ingests the authoritative evidence the knowledge pack actually requires, not every instrument that is legally relevant in the abstract. Equally, it is not restricted to shrinking the current source sets: where the audit finds a proposition resting on text no cited source contains, it adds the source (§13.3).

---

## 2. Reconnaissance (D1a-0 findings)

Measured against the tree at `1e16f24`. Every claim is reproducible from the cited file.

### 2.1 The provenance matrix

`*` marks a source the corpus does not serve. The tier column is the source's row in `monitoring/source-register.json`, resolved through `expectedProvenance`. `provisions` is the current authored field, renamed by §5.

| Requirement | v | kind | cited sources | `provisions` | condition facts |
|---|---|---|---|---|---|
| S-001 | 2 | boolean | SRC-004 `legal_record`, SRC-001 **no row** | yes | 4 entity facts |
| S-002 | 2 | boolean | SRC-004 `legal_record`, SRC-001 **no row** | yes | 5 entity/group facts |
| S-003 | 2 | boolean | SRC-004 `legal_record`, SRC-006\* **no row** | **no** | `entity.reported_csrd_fy2024` |
| S-004 | 2 | boolean | SRC-004 `legal_record`, SRC-015\* `legal_record` | **no** | country, `member_state_transition_option` |
| S-005 | 2 | boolean | SRC-002\* **no row**, SRC-004 `legal_record` | **no** | 6 subsidiary/parent facts |
| S-006 | 2 | boolean | SRC-002\* **no row**, SRC-004 `legal_record`, SRC-009\* **no row** | **no** | 6 subsidiary/parent facts |
| S-007 | 2 | boolean | SRC-004 `legal_record`, SRC-001 **no row** | yes | 2 third-country facts |
| S-008 | 2 | boolean | SRC-004 `legal_record` | **no** | 3 facts |
| S-009 | 2 | boolean | SRC-004 `legal_record` | **no** | 2 facts |
| S-010 | 2 | boolean | SRC-004 `legal_record`, SRC-010\* `official_body` | **no** | 3 value-chain facts |
| S-011 | 2 | boolean | SRC-004 `legal_record`, SRC-010\* `official_body`, SRC-008\* `legal_record` | **no** | `value_chain.items_above_cap` |
| S-012 | 2 | selection | SRC-005\* **no row**, SRC-006\* **no row**, SRC-007\* `legal_record` | **no** | `entity.early_adoption_revised_esrs` |
| S-013 | 2 | boolean | SRC-015\* `legal_record`, SRC-001 **no row** | **no** | country, governing member state |
| S-014 | 2 | boolean | SRC-002\* **no row**, SRC-004 `legal_record` | **no** | requirement refs only |
| S-015 | 2 | boolean | SRC-002\* **no row**, SRC-004 `legal_record` | **no** | requirement ref only |
| S-016 | 2 | boolean | SRC-004 `legal_record` | **no** | 1 reporting fact |

### 2.2 Five findings the matrix forces

**F-1. `provisions` is populated on 3 of 16, and it is not a gap-bearing problem.** S-001, S-002 and S-007 carry it; thirteen do not, including three that are fully served today (S-008, S-009, S-016). D1(a) exposed the sparsity; it did not cause it.

**F-2. `provisions` is a free-text string, not a list.** `knowledge/schema.ts:157` declares `provisions: z.string().optional()`, and the three populated values are prose: `"Accounting Directive Art. 19a as amended by Directive (EU) 2026/470"`. There is no per-source structure, so the field cannot say *which* cited source supports *which* proposition.

**F-3. The blind reader is shown `provisions`, and thirteen requirements send it `(none cited)`.** `provisions` is a member of `ReaderInput` — the closed list of what the reader may see (`pipeline/reader.ts:66`) — and `renderReaderInput` emits `` `# Provisions\n\n${input.provisions ?? '(none cited)'}` `` (`reader.ts:112`). Its docstring explains why: *"a citation is an address, not an answer, and a reader told to read Article 29a still has to decide for itself what Article 29a says."* So for thirteen requirements the reader is currently sent into a 400k-character closure with no address at all. This is the operational cost of F-1 and the strongest argument for §4.2.

**F-4. Six pack sources have no register row, so they have no tier** — `SRC-001`, `SRC-002`, `SRC-003`, `SRC-005`, `SRC-006`, `SRC-009`. That set includes the already-ingested `SRC-001` and every source this design considers ingesting as an ordinary immutable instrument.

**F-5. The citation firewall passes them for a reason unrelated to them, and the one pack-aware corpus check is never called.** `verifyCitationCoverage` (`monitoring/register.ts:145`) compares the **host** of each `pack.sources[].url` against the hosts of citable register rows; the citable host set is `eur-lex.europa.eu`, `finance.ec.europa.eu`, `knowledgehub.efrag.org`, `efrag.org`, and all six rowless sources inherit citability from unrelated rows on `eur-lex.europa.eu`. Separately, `verifyCorpusServesCoverage` — the only check tying a corpus document's `serves[]` to the pack's sources — is exported from `src/index.ts` and exercised by tests, but **no production path calls it**. Grep finds call sites only in `test/corpus-schema.test.ts` and `test/corpus-store.test.ts`.

---

## 3. What "a cited source" means

A source is cited only if it is the authoritative text of a proposition the requirement's **current** determination rests on. Four consequences, and they are the whole of the concept:

1. **A source is cited because the requirement's proposition lives in it.** Not because it is relevant, not because it is worth watching, not because a reader would find it useful.
2. **Currency, not lineage.** The cited set is not the legislative history of the rule. An amending act whose operative content now appears in a consolidated instrument the corpus serves is part of that rule's history; it is a current authoritative text only if something the determination rests on is uniquely found there.
3. **Interpretive material may be cited** where the determination genuinely rests on the interpretation — carrying its tier's weight, never converting guidance into law (§7).
4. **A monitoring target is not a source.** Change-watch surfaces belong in `source-register.json`, which exists to hold them, with `affectsRequirements` recording the relationship a citation must not.

The cited set is what B2's completeness invariant runs on, what seeds `docsForSources`, and therefore what opens the entitled closure. §5 settles where it is authored and how it is derived.

---

## 4. Identity-bearing is not the same as mandatory

### 4.1 What the code proves, stated exactly

`requirementInputSha256` (`verification/canonical.ts:149`) hashes:

```ts
canonicalJson({
  provisions: requirement.provisions,
  sources: requirement.sources,
  logicalPayloadSha256: logicalPayloadSha256(requirement),
})
```

That proves two things and no more:

- **changing the field changes verification identity**, so a provenance edit cannot pass unnoticed; and
- **absence is itself committed into that identity** — `undefined` is a hashed value, so a requirement with no locator has a stable, honest digest describing a requirement with no locator.

It does **not** prove that the field must be present. The authoritative schema says `z.string().optional()` and no validator rejects absence. **Hashing is not validation**, and the tempting inference — *this field is inside the verification-input hash, therefore the system requires it* — is the error this section exists to forbid. A hash records what was authored, including the authored absence of something.

```
identity-bearing   an edit to this field moves the verification identity
mandatory          a requirement missing this field is rejected
```

The system today treats the field as **authoritative when present and optional in fact**.

### 4.2 The new invariant

> **Every requirement must carry provenance locators for every source it cites, and a pack missing them does not load.** Absence stops being a permitted state.

This is a **new explicit invariant introduced by D1(a)**, not the repair of data under an invariant already enforced. It is justified by F-3: a blind reader given `(none cited)` is told to find an unstated proposition somewhere in the whole closure, and the address is precisely what §3.1 of the B2 design gives it. It is recorded in the requirement schema, enforced at load, and — because it changes the authored shape of every requirement — carried through the version contract in §11.

---

## 5. `provenance` — one authored field, one derived source set

### 5.1 The field is renamed, and the rename is not cosmetic

`provisions` becomes **`provenance`**. The field must hold addresses into legislation, delegated acts, annexes, Commission Notices and other citable official material; "provisions" would assert that every authoritative locator is an article of legislation, which a Notice paragraph is not.

This is an authored-schema migration, not a rename of a comment. Version-2 requirements retain their historical meaning through the version registry; every requirement moves to version 3 when the migration is implemented (§11).

### 5.2 One authority, not two

**`provenance` is the single authoritative authored declaration of what a requirement's determination rests on. `sources` ceases to be authored.** The source-id set is derived from it:

```
authored requirement
    ↓
provenance[]
    ↓
sourceIdsOf(requirement)          one production derivation, nowhere else
    ↓
docsForSources(index, sourceIds)
    ↓
EntitledClosure.forSources(...)
```

The rejected alternative — `sources[]` authored, `provenance` authored, and a validator holding them equal forever — creates two independently authoritative declarations of the same fact and a permanent obligation to reconcile them. DATASTRATA has rejected duplicate authority repeatedly (a derived `derivedStatus` rather than an asserted one; a single `renderEntitledClosure` rather than per-role renderers; `mustCorroborateWith` decided by tier rather than authored per row). The same rule applies here. Set-equality enforcement is not a safeguard; it is the cost of a decision not taken.

A compatibility surface may **expose** the derived projection — the public site and the CLI both display source ids today — but no surface is separately authoritative, and no consumer re-derives the set by its own route.

### 5.3 The migration surface is larger than the rename

Every consumer that reads `requirement.sources` must read the single derivation instead. Located at `1e16f24`:

| Consumer | Use |
|---|---|
| `pipeline/orchestrate.ts:420` | `sourceIds` handed to the B2 source-completeness check |
| `cli/run.ts:180` | `EntitledClosure.forSources(world.corpus, …)` |
| `cli/sign.ts:318` | `docsForSources` for the signing closure |
| `cli/review-sheet.ts:491,613,825` | closure, sheet payload, display |
| `cli/assess.ts:61` | printed beside the provenance string |
| `knowledge/loader.ts:346` | "cites unknown source" validation |
| `verification/canonical.ts:153` | hashed into `requirementInputSha256` |
| `engine/evaluate.ts:193` | passed into the evaluation result |
| `frontend/web/lib/pack.ts:206` | closure for the public site |
| `frontend/web/lib/checkResponse.ts:123` → `components/marketing/CheckFlow.tsx:286` | public display |

That is thirteen `requirement.sources` call sites. The current `provisions` consumers are additional, and the rename touches every one: `reader.ts:95,112`; `canonical.ts:152`; `evaluate.ts:194`; `assess.ts:61`; `checkResponse.ts:124` → `CheckFlow.tsx:292`.

**One field named `sources` is deliberately out of scope:** `changeWatchItemSchema.sources` (`knowledge/schema.ts`, validated at `loader.ts:387`) belongs to change-watch items, not requirements. It stays authored and is untouched.

### 5.4 Minimal shape

No comprehensive legal-citation ontology is invented during D1(a). The minimum truthful shape:

```
provenance: [
  { sourceId: 'SRC-004', locators: [ … ] },
  { sourceId: 'SRC-009', locators: [ … ] },
]
```

Required invariants — the exact Zod/TypeScript expression is implementation-plan work, these are not:

```
provenance.length >= 1
every entry has exactly one sourceId
sourceIds are unique across entries
every sourceId resolves to a source-register entry
every entry carries >= 1 truthful locator
deterministic canonical ordering
sourceIdsOf(requirement) == provenance[*].sourceId
```

**A locator must be able to mean the whole document.** *"This determination rests on the whole Notice"* is a perfectly truthful claim, and authors must not be forced to manufacture an `Art. X para. Y` that does not exist. The schema therefore needs one semantic distinction and no more:

```
specific locator        an address within the document
whole-document locator  the document itself is the address
```

Standardising European legal citation syntax is explicitly **not** in scope. A locator is authored text plus that one discriminator.

### 5.5 The blind-reader projection

**This is a hard constraint.** The authored object contains `provenance[].sourceId` and `provenance[].locators`. The reader receives **locators only**:

```
authored provenance
      ↓  positive projection
addresses only — never sourceId
```

The reader may know *"Article 19a(9)"*. It must never know *"the pack author says SRC-002 proves this"*. `sources` was deliberately excluded from `ReaderInput` because the reader must not see the requirement's source declaration — that is what B2's blindness means, and what the source-completeness check exists to compensate for. A structured field projected naively would repeal that boundary silently.

The projection is positive — it constructs what the reader sees, rather than deleting what it must not — and the constraint is carried by the projection's type, not by a comment. **Teeth required:** a check that reds if any source id appears in a rendered reader input, and a compile-level shape that makes `sourceId` unreachable from `ReaderInput`.

### 5.6 Hash consequences

Recorded now, so the migration proves them rather than updating expected digests to match whatever the code produces.

```ts
// intended
requirementInputSha256({
  provenance: canonicalProvenance,
  logicalPayloadSha256,
})
```

**Not** `{ provenance, derivedSources, logicalPayloadSha256 }`. A derived source set adds no information the provenance does not already determine, and hashing it would restate the same fact twice inside one digest — the §5.2 defect, reappearing in the identity layer.

`requirementSha256` continues to hash the whole authored requirement, via `requirementSchema.parse()` rather than a field whitelist, so the renamed and restructured field enters it automatically and the derived `sources` — attached after validation, like `derivedStatus` — cannot.

Both identities therefore move when provenance changes, honestly and by construction. The implementation plan must **prove the migration**: a mutation that drops a locator, or reorders entries, must red a test that names the identity property — not merely a snapshot of a digest.

---

## 6. Register tier versus corpus membership

Two different questions, kept apart:

```
tier            what authority this source carries, and whether it may be cited
corpus member   whether an immutable artefact of it has been fetched, normalized,
                hashed and indexed
```

A `legal_record` nobody has ingested is citable and unserved — that is the ten halting requirements. **Corpus membership never increases legal weight.** An ingested Commission Notice is still `official_body` guidance; ingestion buys reproducibility, not authority.

`TIER_POLICY` (`monitoring/register.ts:15`) is the existing vocabulary, adopted unchanged:

| tier | `sufficientAlone` | `citable` | `mustCorroborateWith` |
|---|---|---|---|
| `legal_record` | `yes` | true | — |
| `official_body` | `non_binding_only` | true | — |
| `tracker` | `no` | **false** | `legal_record` |
| `news` | `no` | **false** | `legal_record` |

**The A/B/C/D labels from reconnaissance are planning vocabulary and must not enter any runtime schema.** They map onto what exists:

| planning label | runtime expression |
|---|---|
| A — authoritative immutable instrument | `legal_record` row + corpus document |
| B — adopted, not yet in force | `legal_record` row + corpus document whose **artefact authenticity** is recorded, with the instrument's `adopted_not_effective` **temporal standing held in the knowledge pack** (§7, §9) |
| C — mutable authoritative surface | `tracker` row; `citable: false` already forbids citing it |
| D — monitoring/context, not evidence | register row of the appropriate tier, **absent** from the cited set |

---

## 7. Authority tier and temporal legal status are orthogonal

**Settled: they are separate dimensions and must not collapse into one field.**

`tier` answers *what kind of authority is this artefact?* It must not also answer *is this law currently effective?*

```
authority          legal_record            an adopted Commission delegated act is
                                           an authoritative legal artefact

temporal status    adopted_not_effective   it is not operative law until the OJ
                                           publishes it
```

**No new tier is invented for not-yet-effective legislation.** `SRC-007` and `SRC-008` stay `legal_record`. W-004's rationale — *"authoritative for expected timing, not sufficient alone to flip a pack flag"* — remains true of the Commission *status page*, which is a different artefact from the adopted act.

**The gap this exposes.** The pack already has the vocabulary on the requirement side: `legalStatus: z.enum(['in_force', 'adopted_not_effective', 'proposed', 'superseded'])` (`knowledge/schema.ts:155`). **`CorpusDocument` has no status field at all** (`corpus/types.ts:41`): it carries `versionLabel`, `retrievedOn` and hashes, and nothing about legal effect. An adopted-not-effective act ingested today would sit in an entitled closure indistinguishable from law in force, and the blind reader — shown documents, not their standing — would read it as current obligation. *(Corrected 2026-08-30: the absence recorded here is real and still true, but it does not locate the remedy. Under §7.1 and §9 as corrected the remedy is **split by axis** — artefact authenticity is added to `CorpusDocument`; temporal standing is held per instrument in the knowledge pack and never copied onto the artefacts serving it. The gap this paragraph names is that standing does not reach the reader, not that `CorpusDocument` lacks a legal-status field.)*

**Rule:** an adopted-not-effective artefact may enter the corpus only when its temporal status is **representable and reaching verification** — held on the instrument in the knowledge pack (§9 as corrected), projected to every role beside the artefact's own authenticity — so no role can treat a future act as current operative law. Until then the requirement citing it halts, and that halt is correct.

**The same separation protects `SRC-009` in the other direction.** Its Notice is immutable and ingestible; its tier stays `official_body` with `sufficientAlone: 'non_binding_only'`. Ingesting official guidance never turns guidance into law.

### 7.1 The third axis: serving-artefact authenticity

**Added 2026-08-27, closing gate G-1 raised by the D1a-0b audit (`reports/2026-08-24-d1a-provenance-audit.md` §2). This is the semantic contract Task 4 authors provenance against.**

Two axes were not enough. The audit's disposition rests on reading the Accounting Directive from an **official EUR-Lex consolidation** — a document that shows the applicable rules at a point in time and *carries no legal effect of its own*; legal effect is produced by the authentic electronic Official Journal. Nothing in this design said which of those a corpus artefact is, so "the text we read" and "the text that has force" were one idea with two meanings.

**Three independent dimensions. Each answers a different question, and no field may answer two.**

```
source authority
    what kind of authority is the legal source?
    → legal_record | official_body | tracker | news
    → held per source in the register's governingAuthorities

serving-artefact authenticity
    is THIS corpus artefact the authentic legally effective publication,
    or an official reading/consolidation of that law?
    → a property of the artefact, not of the source

temporal legal status
    is the instrument adopted, effective, superseded?
    → a property of the instrument, not of the artefact or of the tier
```

Independence is the point, and it is not decorative:

- **An official consolidation may validly serve a `legal_record` source for current reading while itself being a non-authentic reading artefact.** `SRC-001` is a `legal_record` — Directive 2013/34/EU is an enacted directive — and `DOC-32013L0034` is an official consolidation of it. Both statements are true at once, and neither weakens the other.
- Authenticity says nothing about temporal status: an authentic OJ publication may be of an act not yet in force, and a consolidation may faithfully render law that is fully effective.
- Temporal status says nothing about tier — §7 above.

**This is a different question from §8.** §8 asks whether an artefact can be *pinned at all* (does re-retrieval under the same identifier yield the same bytes). A consolidation passes that test per consolidation date, which is what `versionLabel` records. Mutability and authenticity are separate: a stable artefact can still be a non-authentic reading of the law.

#### The invariant Task 4 relies on

> **Requirement provenance names the current host instrument and the locator within it. It never names an artefact, and it never acquires an amending act merely because that act is where the authentic wording was first published.**

*Currency, not lineage* (§3 rule 2) is therefore **unchanged and unweakened by this section**. The distinction must not be read as a reason to re-add every amending OJ act to every requirement's provenance: authentic OJ lineage belongs to artefact-level legal-basis provenance, not to the authored source set. An amending act enters a requirement's provenance on exactly the ground §3 rule 2 already gives — that the requirement rests on a proposition **uniquely** contained in it, such as a standalone transitional provision — and on no other.

So Task 4 can author provenance now, without any metadata existing: it names instruments and locators, which are unaffected by which artefact happens to serve them.

#### What is deliberately not designed here

**No authenticity metadata ontology.** This section fixes the semantics and stops. Field names, the value set, and how an artefact's authenticity class reaches a role are implementation questions, and designing them before the corpus has more than two documents would be guessing.

#### Who owns enforcement

**Envelope E2**, widened from *temporal legal status* to **document standing**: the classification that must reach verification so that no role mistakes an official reading for the authentic text, nor an adopted act for effective law, **nor official explanatory material for an operative provision**. E2 places **authenticity on `CorpusDocument`** and reads **temporal standing from the knowledge pack**, which already owns it, deriving the role-facing projection from both, and carries the artefact's own statement of which sections are non-operative. Authenticity belongs on the artefact because it is a property of the artefact; temporal status belongs to the instrument and is therefore read from the pack rather than copied onto every artefact that serves it.

**Not Task 5.** `AuthorisedCorpus` (§19) validates *origin authority* — whether an artefact comes from a surface the register authorises **for the source it claims to serve**. A EUR-Lex consolidation is an authorised origin for `SRC-001`, and Task 5 will correctly admit it. That answer is orthogonal to whether the artefact is authentic, and Task 5 must not be read as having settled it. Its scope is unchanged; §19 gains one sentence saying so.

**Not Task 3.** The register records what a *source* is. Authenticity is a property of artefacts, which the register does not hold.

#### Authenticity does not gate ingestion the way temporal status does

§7 gates an **adopted-not-effective** artefact: it may not enter the corpus until its status is representable **and reaches verification**, because a role shown that document would read a future obligation as a current one — the *answer* changes. **No equivalent gate applies to an official consolidation**, and D1a-2 is not blocked by this section.

The asymmetry is in what a misreading costs:

```
adopted-not-effective, unlabelled   a role reads law that is not yet in force
                                    as though it binds today
                                    → the determination is wrong

official consolidation, unlabelled  a role reads the current law correctly,
                                    from an official rendering of it
                                    → the determination is right; what is
                                      unstated is where legal effect comes from
```

An official consolidation is a faithful rendering of the law in force at its consolidation date; reading it yields the same obligations as reading the authentic publications it consolidates. What is missing is a claim nobody makes — no role asserts "this artefact has legal effect", and the pack's provenance names the *instrument*, not the artefact (the invariant above). So the consolidations already in the corpus, and those D1a-2 will add, are honest today and remain so; E2 makes the classification explicit rather than repairing an error.

**§14 rule 2 is unaffected and must not be read through this section.** *"Where consolidation lags a known amendment, ingest base and amending act"* is an ingestion-completeness rule about being able to **read** the current text. It creates no citation: an amending act ingested for completeness does not thereby enter any requirement's provenance. `SRC-005` was cited here as the live case, on the premise that its consolidation predates `2025/1416`. §12.1 records why that premise was wrong and why the rule is not engaged for `SRC-005`; the rule itself stands for any instrument whose consolidation does lag.

---

## 8. Immutable legal record versus mutable official surface

The test is not the publisher and not the URL shape:

> Does re-retrieving this artefact tomorrow, under the same identifier, yield the same bytes — and if not, is the difference itself legally meaningful?

An OJ-published act at a fixed ELI answers yes. A consolidated text answers yes *per consolidation date*, which is what `versionLabel` carries. A weekly-refreshed transposition listing answers no, and its differences are administrative, not legal events.

The corpus schema is built for the first kind: `sha256Raw` pins publisher bytes, `sha256Normalized` pins what agents read, `corpusClosureSha256` pins the set. Putting a mutable surface behind those hashes does not make it immutable — it records one arbitrary instant with the authority of a closed text.

---

## 9. The adopted-artefact → OJ lifecycle is not a closure relationship

**Settled: no new `EdgeKind`.**

The closure graph has one job — it decides what a role is entitled to read — and structural kinds are followed aggressively: no depth cost, both directions (`corpus/closure.ts:47`). The relation between an adopted Commission artefact and the later OJ publication of that act is a **document lifecycle** relation, not a legal dependency. Encoding it as an edge would let a lifecycle fact silently expand an entitlement, and a superseded text would arrive in closures that never asked for it.

The existing vocabulary is `'amends' | 'amendedBy' | 'consolidates' | 'references' | 'definesTermsFor'` (`corpus/types.ts:14`), and none of them is true here. `amends`/`amendedBy` are wrong — the OJ text does not amend the adopted text, it *is* the same act at a later stage, and `amendmentDirection` plus the cycle check in `corpus/schema.ts` would reason about it as an amendment. `consolidates` is wrong — consolidation merges an act with its amendments. `references` is too weak and costs traversal depth. **None of the three is used for this relation unless the law itself establishes it.**

**Corrected 2026-08-30, per decision D-5 of the Route A sub-plan** (`docs/superpowers/plans/2026-08-30-d1a-route-a-class-b.md`). Storage follows §7.1's axis assignment:

```
knowledge pack (sources)   temporalStanding      per instrument
CorpusDocument             artefactAuthenticity  per artefact
CorpusDocument             lifecycle identity / successor–predecessor  (E3, deferred)
```

A role is shown a derived projection combining both, assembled at entitlement and never stored pre-combined. Neither field may be derived from the other, and neither may be inferred from `versionLabel`.

**Required semantics, carried by document-level lifecycle metadata rather than by the edge graph:**

```
adopted artefact remains immutable and hash-addressable
OJ publication creates a NEW corpus artefact with its own docId and hashes
no old bytes or hashes are overwritten
the relationship between them is explicit
the lifecycle relation does NOT by itself expand an EntitledClosure
current verification can distinguish which artefact is legally operative
historical verification remains replayable against the adopted artefact
```

If the OJ text differs from the **adopted text**, **both are preserved**, and the later artefact becomes the current legal record according to its temporal status. Exact field names are implementation-plan work; the semantics above are not.

---

## 10. The country-pack / national-law boundary

The architecture exists and already works:

- `knowledge/csrd/country-packs/DE.json` holds `transposition`, `options.fy2025_26_transition_relief`, `filingCalendar`, `assuranceProviderRules`, each `requires_research`;
- it names the EUR-Lex NIM URL as its **`monitor`**, not as its evidence;
- it carries `ratification: { status: "draft" }` and records: *"NOT RATIFIED — S-013 correctly returns national_law_unresolved for DE until this pack is completed, golden-tested and ratified."*

The settled split:

```
generic EU proposition
    "Member States may relieve undertakings below either amended threshold
     for FY beginning 2025-01-01 .. 2026-12-31"
  → served by SRC-004, in the corpus today (normalized/32026L0470.txt:1057)

country-specific proposition
    "this Member State exercised that option, in this instrument, with these
     conditions"
  → the national implementing measure — a legal_record — referenced through
    the country pack
  → unresolved until that evidence exists and the pack is ratified
  → surfaces as national_law_unresolved, not as corpus_gap
```

Neither proposition is served by the NIM listing, which states only how many measures each Member State has notified.

---

## 11. Version consequences of re-authoring

Changing a requirement's provenance is an authored requirement change, and the code treats it as one:

- `requirementInputSha256` covers the provenance and the logical payload (§4.1, §5.6);
- `requirementSha256` covers the **whole** authored requirement, parsed through `requirementSchema` rather than a field whitelist, and is what the version registry binds;
- `verification/requirement-versions/csrd.json` maps `requirementId → version → requirementSha256`. All sixteen are at **version 2**, each with a version 1 digest still recorded;
- `assemble.ts:172` calls `assertVersionIntegrity`, and `sign.ts:541-546` refuses with *"content hashes to X but the registry records version N as Y — the content changed without a version bump"*.

**Every re-authoring must:**

1. bump `version` to 3;
2. add a version-3 entry carrying the new `requirementSha256`;
3. leave versions 1 and 2 untouched — a historical version records what the requirement meant when signatures were taken against it;
4. let `requirementInputSha256` change honestly, and expect any result pinned over the old input to read as stale rather than be re-pinned.

The §5 migration is itself a re-authoring of all sixteen and follows the same rules.

---

## 12. The eight dispositions

Investigated 2026-08-24. Repository evidence cites `file:line`; external evidence cites what was loaded and when.

**Every disposition here is an expected D1a-0b audit outcome, not a human policy choice.** The audit traces each requirement proposition by proposition (§13) and its findings govern. Three rows carry a live question already identified and are marked **conditional**; the rest are expected to survive and must still pass. The audit may also *add* a source (§13.3).

| Source | Cited by | Expected disposition | Runtime expression |
|---|---|---|---|
| SRC-002 | S-005, S-006, S-014, S-015 | **conditional** — ingest only if a surviving requirement uniquely depends on it (§13.1) | `legal_record` row; corpus document only if required |
| SRC-005 | S-012 | ingest | `legal_record` row (new) + corpus document |
| SRC-006 | S-003, S-012 | **conditional for S-003** (§13.2); expected to survive for S-012 | `legal_record` row (new) + corpus document |
| SRC-009 | S-006 | ingest, weight preserved | `official_body` row (new) + corpus document |
| SRC-007 | S-012 | ingest under Route A once **document standing (E2) and artefact origin (E4)** are in place; §16's PDF conditions are not invoked (§12.4, §16 as corrected) | `legal_record` + `adopted_not_effective` |
| SRC-008 | S-011 | ingest under Route A once **document standing (E2) and artefact origin (E4)** are in place; §16's PDF conditions are not invoked (§12.4, §16 as corrected) | `legal_record` + `adopted_not_effective` |
| SRC-010 | S-010, S-011 | re-author, **only if** §17 passes | `official_body` (W-009 exists), no longer cited |
| SRC-015 | S-004, S-013 | tier → `tracker` (settled, §18.1); citation removed **only after** the §18.2 probes | `tracker` row + country-pack monitor |

### 12.1 SRC-005 — Delegated Regulation (EU) 2023/2772

OJ L, 2023/2772, 22.12.2023; C/2023/5303; "In force: This act has been changed. Current consolidated version: **01/01/2025**."

**Corrected at T6 — the consolidation is *not* behind its own amendment.** This section previously read: *"The consolidation is behind its own amendment. It predates `2025/1416` (OJ 10.11.2025), so consolidated-text-only ingestion would silently omit the postponement. Ingest the consolidated base and the amending act, joined by a structural edge."* That reasoning compared the consolidation's date against the amendment's **publication** date. EUR-Lex dates a consolidation by the date its text **applies**, and `2025/1416` states that it *"shall apply with respect to financial years beginning on or after 1 January 2025"* — the same date the consolidation carries.

What T6 established, and nothing wider:

- `2023/2772` has a consolidated expression, CELEX **`02023R2772-20250101`**, served at `https://eur-lex.europa.eu/eli/reg_del/2023/2772/2025-01-01`.
- `2025/1416` applies with respect to financial years beginning on or after 1 January 2025.
- The pinned expression contains **M1-derived operative text in its enacting terms**, not merely an entry in its "Amended by" header — which lists an amendment whether or not the consolidation incorporates it, and is therefore not evidence of incorporation. The discriminating passage is the paragraph conditioned on *"the rows of Appendix C of ESRS 1 showing 'All disclosure requirements'"*, which cannot exist unless M1 was woven in. Asserted against the pinned bytes in `test/corpus-src005-ingestion.test.ts`.

**Consequence for §14 rule 2.** The rule is unchanged and still correct where a consolidation genuinely lags. It is simply **not engaged for `SRC-005`**, so no separate amending-act artefact is required to read the applicable text. This is a finding about this consolidation, not a general claim about EUR-Lex consolidations: the relationship between a consolidation date and an amendment's application date has to be checked per instrument.

**Consequence for `SRC-006`.** With the completeness argument withdrawn, §14 rule 1 governs: no requirement cites `2025/1416`, so it stays registered and unserved. Operational consequences in §15.

### 12.2 SRC-006 — Delegated Regulation (EU) 2025/1416

Official title, verbatim from EUR-Lex: *"Commission Delegated Regulation (EU) 2025/1416 of 11 July 2025 amending Delegated Regulation (EU) 2023/2772 as regards the postponement of the date of application of the disclosure requirements for certain undertakings."* C/2025/4812; OJ L, 2025/1416, 10.11.2025; **in force**.

**Register accuracy defect.** `sources.json` titles it *"ESRS quick-fix"* with `usedFor` *"Wave-one phase-in relief for FY2025 and FY2026"*. "Quick-fix" is a nickname; the official subject is postponement of application dates. The new register row and pack source must carry the official title.

### 12.3 SRC-009 — Commission Notice C/2024/6792

*"Commission Notice on the interpretation of certain legal provisions in Directive 2013/34/EU … as regards sustainability reporting"*; C/2024/7756; OJ C, C/2024/6792, **13.11.2024**; ELI-addressed; ≈165k chars. Immutable and citable — an ordinary ingest under §14, with the §7 weight rule. A likely first user of the whole-document locator (§5.4).

### 12.4 SRC-007 / SRC-008 — the two acts adopted 3 July 2026

Commission page, verbatim: *"Commission Delegated Regulation of 3 July 2026 amending Delegated Regulation (EU) 2023/2772 as regards the simplification of certain sustainability reporting standards **(not in force until it is published in the Official Journal)**"*, and the same parenthetical for the voluntary-standard act. The page records its own last update as 3 July 2026; no OJ publication was found as of 2026-08-24.

Stable adopted artefacts exist, linked from that page:

```
csrd-delegated-act-2026-5010_en.pdf         C(2026) 5010, revised ESRS
csrd-delegated-act-2026-5010-annex_en.pdf   its annexes
csrd-delegated-act-2026-5011_en.pdf         C(2026) 5011, voluntary standard
csrd-delegated-act-2026-5011-annex_en.pdf   its annexes — the cap catalogue S-011 needs
```

They were linked as PDFs from host `ec.europa.eu`. **Route A does not ingest them from that surface** — see the correction below. Artefact-origin authority is §19's; §16's PDF conditions are **not invoked** for these two sources (§16 as corrected).

> **Corrected 2026-08-30 — the artefacts are not PDF-only.** This section recorded only the Commission landing page's PDF links, listed above as the record of what that page offered. EUR-Lex serves both adopted acts as **complete HTML expressions including their annexes**, which the existing `NORMALIZER_VERSION 1.0.2` extractor handles with the `#text` selector — verified at `89b0b86`. Route A ingests those expressions. The retired sentence also claimed `ec.europa.eu` *"is not in the citable host set (F-5)"*: **F-5's host rule was retired at Task 5** (`src/monitoring/register.ts:312`), so that claim had already stopped being true on its own terms, and `ec.europa.eu` is not the serving host under Route A either.

### 12.5 SRC-010 — value-chain-cap explanatory page, 6 May 2026

A news/Q&A item that, as fetched, "explains existing rules from the Omnibus I Directive; it does not establish new operative requirements itself", carries **no stable document identifier**, and offers no downloadable act. W-009 already reads: *"Commission explanatory material: authoritative interpretation of an act, not the act."* Test in §17.

### 12.6 SRC-015 — EUR-Lex National Transposition Measures for 32026L0470

Read 2026-08-24: an aggregation of member-state notifications carrying **no normative text**, stating *"The collection National transposition measures is updated weekly"*, deadline 19/03/2027, measures notified by Belgium (1), Croatia (2), Poland (1), Finland (2), all others 0. Architecture in §18.

---

## 13. Current operative text versus legislative history

**These are D1a-0b audit outputs, not human architecture decisions.** For every requirement, trace and record:

```
condition
  → proposition
    → authoritative current text
      → provenance entry
```

Under §3, rule 2 (*currency, not lineage*), an act is not retained merely because it historically introduced text that now appears authoritatively in a consolidated host instrument. A source that does not survive tracing is removed only through versioned D1a-1 re-authoring.

### 13.1 SRC-002 and S-005 / S-006 / S-014 / S-015

Located at D1a-0, to be re-verified by the audit: the operative text those four requirements rest on is in the **host** Accounting Directive, already served by `SRC-001` — Art. 19a(9) subsidiary exemption including the third-country-parent branch (`normalized/32013L0034.txt:1545`); "clearly identifiable within the management report, through a dedicated section" (`:1313`, and `:2311` consolidated); the Art. 34 limited-assurance opinion (`:3099`). What 2022/2464 uniquely holds is its **own Article 5** wave timetable, which the Omnibus amends explicitly (`normalized/32026L0470.txt:156`).

If the trace shows those four are completely supported by the consolidated Accounting Directive plus the Omnibus, `SRC-002` is removed from them. It is then ingested **only** if some surviving requirement genuinely relies on something uniquely in it — its application timetable being the live candidate. Otherwise it remains a registered, monitored, uningested source, and D1(a) does not ingest it. Ingesting it to satisfy a citation the audit found wrong would be the same error as re-authoring to make a gap disappear, inverted.

### 13.2 SRC-006 and S-003

Same method. S-003's proposition is *"prior FY2024 CSRD reporters are a distinct population; their FY2025–26 position depends on the amended thresholds and the governing Member State's transitional implementation."* Whether that rests on a postponement act or on Omnibus Art. 5 timing is a textual question, and the Omnibus text carrying the FY2025–26 relief option is already in the corpus (`normalized/32026L0470.txt:1057`).

S-012's reliance on `SRC-006` is a separate trace and is expected to survive: the applicable-ESRS-version proposition names the quick-fix directly.

### 13.3 The audit runs in both directions

The same trace can find a proposition resting on text **no cited source contains**. That is a new source, and possibly a new gap — an outcome as legitimate as a removal, and one the audit must not suppress to keep §12's table stable.

One candidate is already visible. S-015's proposition is *"statutory sustainability information is subject to limited assurance under the amended audit framework"*, and its `caution` adds that *"provider eligibility and appointment rules require the national overlay"*. The amended audit framework is Directive 2006/43/EC, which Directive (EU) 2026/470 amends — and **2006/43 is not a pack source at all**: `knowledge/csrd/sources.json` carries no entry for it. The Art. 34 assurance-opinion text already in the corpus (`normalized/32013L0034.txt:3099`) may fully support S-015's determination, in which case nothing is missing. The audit establishes which, rather than assuming the absence was deliberate.

---

## 14. Class-A ingestion rules

Applies to whichever of `SRC-002`, `SRC-005`, `SRC-006`, `SRC-009` the audit leaves as pack-required evidence. Each goes through `cli/ingest.ts` unchanged — already "the only component that touches the network", already refusing to infer legal relationships.

1. **Pack-required only.** D1(a) ingests evidence a surviving requirement depends on. A source that is legally relevant but relied on by nothing stays registered and unserved.
2. **Version selection.** Consolidated text where EUR-Lex offers one, `versionLabel` naming the consolidation date and CELEX exactly as `DOC-32013L0034` does. Where consolidation lags a known amendment, ingest base and amending act.
3. **Edges are declared, never inferred.** `EdgeProvenance` is `eli_metadata`, `celex_metadata` or `human`, each with `recordedOn` and enough detail to re-check by hand.
4. **Register row first.** No source is ingested before it has a row with tier, `authority`, `governs`, `cadence`, `expectedProvenance` and `tierRationale`. This closes F-4 for the ingested set and for `SRC-001`/`SRC-003` while the file is open.
5. **Hashes as the module already computes them.** No new normalizer for class A.
6. **Order matters, because structural edges are free.** Where a base and an amending act are both ingested, ingest the base first so the amending act's edge has a live endpoint when written. This was written for `2023/2772` and `2025/1416`; per §12.1 only the base is ingested, so the ordering does not arise for them.

---

## 15. SRC-005 large-document treatment

**Settled: ingest the complete artefact if the audit confirms S-012 relies on it. Do not redesign closure or retrieval to make D1(a) pass.**

Corpus membership answers *what is the evidence*. Rendered model context answers *how a role reads it*. Conflating them would let a context limit decide what the law is.

Measured at `1e16f24`:

| Quantity | Value |
|---|---|
| `DOC-32013L0034` normalized | 269,071 chars |
| `DOC-32026L0470` normalized | 133,932 chars |
| **Rendered closure today** (`renderEntitledClosure`, both documents) | **403,231 chars ≈ 115k tokens** |
| `2023/2772` `#text` as served | **906,920 chars ≈ 259k tokens** |

Token figures are estimates at ~3.5 chars/token for consolidated legal English; no tokenizer was run, and D1a-3 must produce exact counts for the candidate pipeline's tokenizer.

**Two structural consequences:**

1. `2023/2772` alone exceeds a 200k-token context before the revised act, before scaffolding, and before any other document in its closure. `renderEntitledClosure` concatenates every document's full text.
2. **It would not have stayed confined to S-012.** `CLOSURE_POLICY_V0` follows structural kinds in **both directions at no depth cost**, so ingesting `2025/1416` with an `amends` edge to `2023/2772` would pull the ESRS text into **S-003's** closure — a requirement about FY2024 reporting history. Since §12.1's correction that ingestion is not required, no such edge exists and the document reaches only S-012. The consequence is recorded because it constrains any future decision to ingest an amending act here, not because it is scheduled.

D1a-3 measures, per requirement: closure documents; rendered closure chars and bytes; exact or estimated input tokens; and **which additional requirements inherit a document through structural traversal**.

**The gate is on the pipeline, not on the corpus.** If the rendered input exceeds the context window of a candidate pipeline we intend to benchmark, **that candidate fails B3 feasibility** and retrieval is designed then. Corpus truth does not change to accommodate model limits. D1a-2 proceeds before any retrieval redesign.

---

## 16. Class-B capability requirements

`SRC-007` and `SRC-008` may not be ingested until all eight are settled.

> **Scope, corrected 2026-08-30.** **Conditions 1 and 3 are PDF-specific: they govern only an artefact for which no official machine-readable expression exists.** `SRC-007` and `SRC-008` are not such artefacts (§12.4 as corrected), so those two are **not invoked**. The remaining conditions are format-independent and govern every Class-B artefact, Route A's included.
>
> Condition **2** applies, read in HTML terms rather than PDF ones: the raw/normalized hash split is retained exactly as it is for every other document — `sha256Raw` over the bytes as served, `sha256Normalized` over the extracted text. Conditions **4, 6 and 8 apply unchanged**. Condition **5 is amended in place below**, per the Route A sub-plan's §3.3.
>
> Condition **7** (lifecycle and supersession metadata) is **settled as not-yet-applicable rather than unmet**: no OJ successor exists, so there is no lifecycle relation to record. The head's *"may not be ingested until all eight are settled"* is satisfied — a condition with no subject is settled by that fact, and it reopens the moment an OJ expression appears.

1. **PDF acquisition and deterministic normalization.** `normalize` (`corpus/normalize.ts:270`) extracts over decoded HTML with an `#id` selector. PDF extraction must be deterministic across runs and machines, or `sha256Normalized` stops meaning anything.
2. **Raw-byte hash and normalized hash.** `sha256Raw` over the PDF bytes as served; `sha256Normalized` over extracted text. The existing split is retained, not special-cased.
3. **`NORMALIZER_VERSION` consequences.** A new extractor is a version bump from `1.0.2`. The bump must not silently re-describe already-ingested text; re-normalizing existing documents is an explicit decision.
4. **Stable adopted-document identity.** A `docId` for an act with no CELEX number. `C(2026) 5010` is the durable identifier; what happens to that identity at publication follows §9.
5. **Document standing, reaching verification** — temporal legal status (§7) **and** serving-artefact authenticity (§7.1), carried as **two fields on two axes**: temporal standing per instrument in the knowledge pack, authenticity per artefact on the corpus document (§9 as corrected). A role is shown a derived projection of both. No single field answers both questions.

   **A third distinction rides with them, and is normative rather than an implementation detail: within a composite artefact, official explanatory material is not operative provision.** An artefact may lawfully carry both — an explanatory memorandum ahead of the enacting terms — and neither of the two axes above says so: temporal standing answers *when the instrument takes effect* and authenticity answers *what kind of artefact this is*, and both apply equally to every part of the document. A role must therefore be told, per artefact, which sections are non-operative, and that statement must be committed by the same identity mechanisms as the other two. Where an artefact serves sources of differing standing, the statement must say that legal effect differs by served source.

   **This is a within-artefact region annotation, not a fourth standing axis.** §7.1's three dimensions — source authority, serving-artefact authenticity, temporal legal status — each classify a whole object, and each remains exactly as §7.1 states it. Non-operative sections partition *within* a single artefact, which is why neither document-level axis can express it, and why §7.1's *"no field may answer two"* is unweakened rather than superseded. The statement of non-operative sections partitions material *within* an artefact; it does not classify the source, the artefact or the instrument, and therefore adds no fourth dimension to §7.1's three.
6. **Tier is unaffected** — `legal_record` with `adopted_not_effective`, no new tier (§7).
7. **Lifecycle and supersession metadata, outside closure traversal** — §9.
8. **Artefact-origin authority, source-specific and generic** — §19.

---

## 17. The SRC-010 proposition-substitution test

`SRC-010` may stop being cited by `S-010` and `S-011` **only** if, proposition by proposition, `SRC-004` is shown to contain everything those requirements rely on. Removal must be justified because the source was misclassified, never because the gap is inconvenient.

Located at D1a-0, to be re-verified by the audit:

| Proposition | Located at |
|---|---|
| Protected undertaking: ≤1,000 average employees in the preceding financial year | `normalized/32026L0470.txt:450`, `:456` |
| Statutory right to decline above-cap items | `:458`, `:622` |
| Requestor must identify excess items and communicate the right to decline | `:478`, `:642` |
| Purpose limitation — CSRD reporting only, not due diligence or other purposes | `:80` (recital) |

**Passes** when every proposition in the repaired provenance for S-010 and S-011 maps to located Omnibus text. **Fails** if any proposition rests only on the Commission's gloss — in which case `SRC-010` is a mutable surface being relied on as evidence, and either it gets explicit snapshot semantics or the requirement's proposition is rewritten to rest on the act.

One dependency already survives independently: S-011's cap **catalogue** is defined by the voluntary-standard act (`SRC-008`), not by the explanatory page — Art. 29ca, inserted by the Omnibus at `:787` and referenced as the cap boundary at `:776`.

---

## 18. SRC-015 — tier settled, citation removal earned

### 18.1 Tier: `tracker`

**Settled.** W-002 is `tracker`, not `legal_record`. The listing is authoritative for *whether national measures have been notified*; it is not authoritative for the normative content of any national measure.

```
NIM listing                 → tracker → citable: false → monitoring target
national implementing measure → legal_record → country-pack evidence
```

`tracker` carries `mustCorroborateWith: ['legal_record']`, which `verifyRegisterIntegrity` enforces per tier, so the row changes with it. The consequence is the point: once W-002 is a tracker, a citation backed only by that surface becomes **mechanically** invalid under §19 rather than being discouraged in prose.

### 18.2 The citation is removed only after the probes

**This is a factual production-path question, not an open design choice.** Before either requirement is re-authored, run the actual country/national-law production path and establish, **separately for S-004 and S-013**, whether the unresolved country-specific proposition really reaches `national_law_unresolved`.

Do not infer S-004 from S-013, and do not assume both have the same generic/country-specific split: S-013 is a completeness gate, S-004 turns on `entity.member_state_transition_option`, and they may fail in different places.

For each, produce the actual chain:

```
requirement condition
  → country fact requested
    → country-pack lookup
      → authoritative national-measure evidence, or its absence
        → resulting determination / gap
```

`SRC-015` stops being cited only when this path shows that removing the tracker does not turn **visible** missing evidence into **invisible** missing evidence. If the probe shows S-004 silently determines rather than surfacing `national_law_unresolved`, that is a defect to fix before re-authoring, not after.

---

## 19. The authority firewall

### 19.1 What is wrong today

Two independent, partial checks and a hole between them:

- `verifyCitationCoverage` validates the **host** of `pack.sources[].url` against citable register hosts. An unrelated citable row on the same domain confers authority (F-5).
- `verifyCorpusServesCoverage` — the only check tying `CorpusDocument.serves[]` to the pack — **is never called in production** (F-5).
- Nothing at all validates `CorpusDocument.url`.

### 19.2 The invariant, source-specific

The invariant as first written bundled two propositions into one sentence:

> ~~Every `sourceId` in a `CorpusDocument.serves[]` resolves to an actual source-register row whose tier permits citation, and the artefact's own origin is authorised **for that source**.~~

Those are different questions with different owners, and bundling them left the second half enforced and the first half enforced nowhere. They are now stated separately.

**19.2(a) — recorded-origin authority, owned by `AuthorisedCorpus`.**

> Every `sourceId` in a `CorpusDocument.serves[]` resolves to a source the pack carries, and the artefact's own recorded origin is authorised **for that source**. An unrelated citable row on the same host never confers authority.

This reads no tier, deliberately. It decides what the corpus may **store**.

**19.2(b) — source-tier eligibility, owned by `EntitledClosure`.**

> Every document in a computed entitled closure — including documents reached only by structural traversal, not merely the entry points `docsForSources` selected — is served exclusively by sources holding an explicit governing authority whose tier permits citation. One citable source on a document does not rescue another.

This decides what a model may **see**.

**The refusal is whole-closure, and that is deliberate but worth stating.** Structural edges are traversed in both directions, so a single non-citable document anywhere in a connected component makes *every* requirement whose closure reaches it unbuildable — including requirements that do not cite the offending source at all. The run fails closed rather than silently narrowing the evidence, because quietly dropping a document from a closure would change what the agents saw without changing what the signature said they saw. The remedy is to classify the source or to remove the artefact from the corpus; there is deliberately no per-document override.

**Why the split, and why the second half cannot live in `AuthorisedCorpus`.** A corpus may legitimately hold an origin-authorised artefact for a source that may not be cited — an archived tracker page is a reasonable thing to keep. Refusing to store it is the wrong remedy; refusing to *show* it is the right one. The split is also what closes a real gap: `serves[]` selects closure entry points, and `computeClosure` then walks structural edges in both directions without consulting `serves` again, so a document no requirement could cite could be reached by traversal and rendered to the agents. Validating entry points, or validating at ingest, both leave that path open. The guard therefore sits at closure construction, after expansion and before exposure.

**`uncited` is not `non-citable`.** `SRC-004` is served by a committed document, is cited by no requirement since the S-004 correction, and is classified `legal_record`. It passes 19.2(a) on its origin and 19.2(b) on its tier. Whether anything currently rests on a source is irrelevant to both predicates, and the committed corpus is the standing discriminator for that.

**What this invariant does not answer.** It validates *origin authority* — whether an artefact came from a surface the register authorises for the source it claims to serve. It does not classify the artefact's **authenticity**: a EUR-Lex consolidation is an authorised origin for `SRC-001` and this check will correctly admit it, without thereby asserting that the consolidation is the authentic legally effective publication. That axis is §7.1's, and its enforcement belongs to envelope E2. `AuthorisedCorpus` must not be read as having settled it.

This must fail:

```
SRC-X has no citable register row
SRC-Y happens to use the same domain
→ SRC-X may NOT inherit SRC-Y's authority
```

Source-identity scoped, not host-scoped. It is what makes §18.1 mechanical, and what stops `ec.europa.eu` from being a special case: the register row for `SRC-007` names the artefact origin permitted for `SRC-007`, and nothing else on that host inherits it. If Commission PDFs require an explicit artefact-origin permission, it is designed **generically** — a per-source declaration of which surfaces may serve that source's artefacts, applying uniformly to EUR-Lex, EFRAG and Commission hosts alike. No host is named in the implementation.

### 19.3 The branded boundary

**Settled: a validated corpus capability, not caller-supplied authority facts.**

```
raw corpus index
     ↓
validate source identity + register authority + artefact origin
     ↓
AuthorisedCorpus                    producible only through this path
     ↓
EntitledClosure.forSources(authorised, …)
```

The rejected alternative — authority facts carried inside `EntitlementSource` — moves the authority claim to the very caller the guard exists to constrain: a caller could say *trust me, this source is citable*.

**The seam being changed, named exactly.** `EntitledClosure.forSources` (`pipeline/entitlement.ts:163`) today takes a structural `EntitlementSource` — `{ index, document(), normalizedText() }` (`entitlement.ts:67`) — deliberately, so that "a caller holding a corpus by some other route must still be able to build an entitlement over it". That deliberate openness is the bypass: a hand-written index satisfies the shape and produces an entitled closure with no authority check anywhere. `forSources` requires the validated capability instead, giving the invariant by construction:

> No document can become entitled unless its source and artefact authority were validated first.

**Test fixtures get a builder that performs the same validation** over synthetic register and corpus data. There is no unchecked test-only constructor: a bypass that exists for tests is a bypass production will eventually imitate.

### 19.4 Teeth

Per `TEST-EVIDENCE-STANDARD.md`, a direct test of the validator proves the validator, not the wiring — and F-5 is exactly that failure already in the tree, tested and unwired. The implementation must carry a **production-path mutation**:

```
remove the authority-validation step from the path that builds AuthorisedCorpus
  → a real entitlement/run test reds
```

not merely a unit test of the validation function.

---

## 20. Topology re-measurement

After **every** landing, through the real production path with request counting, as the B2 repair established:

- the model-reachable / gap-bearing partition over all sixteen requirements, and which gap each halting requirement carries;
- rendered-closure size per reachable requirement, with token counts and their basis, and which requirements inherit a document through structural traversal (§15);
- zero agent requests for every gap-bearing requirement;
- the four identity constants unchanged unless a change is intended and stated.

Per `TEST-EVIDENCE-STANDARD.md`: a green assertion is not evidence unless the defect can make it red, and claims about evidence must themselves be traceable. Every count in a D1(a) report cites the command that produced it.

---

## 21. Implementation sequence

Conceptual. The implementation plan comes after this spec is approved.

| Stage | Work |
|---|---|
| **D1a-0a** | Settle the provenance schema in code terms: the `provenance` field, mandatory locators (§4.2), the derived source set and its single derivation (§5.2), locator shape including whole-document (§5.4), the blind projection and its teeth (§5.5), hash consequences (§5.6); source-register rows for the six rowless sources (F-4); the `AuthorisedCorpus` boundary (§19.3) |
| **D1a-0b** | Proposition-by-proposition audit of all sixteen requirements (§13), including the S-004 and S-013 country-path probes (§18.2) |
| **D1a-1** | Versioned requirement re-authoring (§11) — the schema migration and whatever the audit determined |
| **D1a-2** | Ingest the immutable surviving evidentiary artefacts — expected `SRC-005`, `SRC-006`, `SRC-009`, plus `SRC-002` only if §13.1 leaves a real dependency, plus anything §13.3 adds |
| **D1a-3** | Production-path topology, closure and context measurement (§15, §20) |
| **D1a-4** | Adopted-not-effective corpus capability: **document standing**, artefact-origin authority, lifecycle metadata (§7, §9, §19). **PDF normalization belongs to §16 and is not invoked where an official machine-readable expression exists** |
| **D1a-5** | Ingest `SRC-007`, `SRC-008` if D1a-4 is approved |
| **D1a-6** | Complete the `SRC-010` and `SRC-015` versioned re-authoring, once the substitution test (§17) and country-path probes (§18.2) exist |
| **D1a-7** | Final production-path topology measurement |

D1a-4 and D1a-5 may be deferred indefinitely without blocking D1a-6 or D1a-7. A residual gap on an adopted-not-effective act is a truthful finding, not debt.

---

## 22. Success criterion

> **D1(a) succeeds when every cited source has a semantically correct disposition and every requirement has reproducible, correctly weighted provenance for the propositions its determination actually rests on.**
>
> **An intentionally unserved source may remain only where the inability to represent or legally rely on that evidence is itself truthful and explicit. D1(a) does not require every requirement to become model-reachable.**

The final model-reachable count is measured from the resulting corpus. It is never prescribed, and no number appears anywhere in this design as a target — any such number would become a reason to classify a source by what it does to the count.

---

## 23. Non-goals

- No promotion, no signing, no benchmark, no provider adapter, no live model call.
- No A/B/C/D labels in any runtime schema (§6).
- No comprehensive legal-citation ontology (§5.4).
- No closure or retrieval-policy redesign — §15 opens the question, gates B3 feasibility on it, and deliberately leaves it.
- No broadening into the informational findings left open by the B2 review (wrong gap identity leading to silent filtering; duplicate source ids producing duplicate gaps).

---

## 24. What remains open

**No architecture decisions remain.** The items below are implementation-plan design details, recorded so they are chosen deliberately rather than by default:

- the exact Zod and TypeScript expression of `provenance` and its locator discriminator (§5.4);
- the exact field names for corpus lifecycle metadata and the successor–predecessor relation (§9);
- the exact branded-TypeScript expression of `AuthorisedCorpus` and its test builder (§19.3);
- migration helper naming and the order in which the call sites in §5.3 are moved to the single derivation and the renamed field (§5.3).
- the field names for **document standing** — carried as **two fields on two axes** (§7.1, §9 as corrected): serving-artefact authenticity per artefact, temporal standing per instrument in the knowledge pack — together with the artefact's own statement of which sections are non-operative, and how each of the three reaches a role (envelope E2).

Two findings are settled in principle and must be **recorded as evidence** at D1a-0b rather than asserted: whether S-005/S-014/S-015 retain `SRC-002` (§13.1), and whether S-003 retains `SRC-006` (§13.2). Both are audit outputs, not open questions.

**D1a-0b has since run** (`reports/2026-08-24-d1a-provenance-audit.md`) and both were answered — neither source survives. Where that audit and this document's §12 expectation table disagree, **the audit governs**; §7.1 was added to close the one gate it raised.
