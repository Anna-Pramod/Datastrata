# The verification factory — agent-driven regulatory knowledge manufacturing and QA

**Date:** 2026-08-20
**Status:** Design approved, ready for implementation planning
**Supersedes:** §4 of `2026-08-14-csrd-knowledge-accuracy-design.md` (the verification pass). §§1–3 and §§5–9 of that spec stand.
**Scope:** Program-agnostic. CSRD is the first tenant; CBAM packs and country packs run through the same machinery unchanged.

---

## 1. The problem

All 16 CSRD requirements carry `ratification.status: "draft"`. One has been checked by hand — `backend/engine/verification/CSRD-S-001.md` — and that record shows why the remaining fifteen have not been. Checking one rule meant locating the consolidated Accounting Directive, finding the Omnibus I amendment that replaced Art. 19a(1)'s formulation, quoting the operative wording, recording three consequences for future encoders, and carrying forward two questions that remain unresolved. It is careful, valuable work, and at that cost the pack does not get verified — nor do the country packs, nor CBAM when it lands.

The failure mode this addresses is **encoding error**: the law says X, the pack says Y, the source never changed and no sweep will ever notice. It is caught only by reading source text against the encoding. It is distinct from **staleness**, which the sweep (Plan C) addresses. Neither substitutes for the other.

### Why this is not "have an LLM review the rules"

The output of this system is an answer to a company about whether a legal duty binds it. A model that reads a rule and says "looks right" produces agreement, and agreement is worthless — it is what a model produces when it cannot tell. The design below exists to make each of the following true rather than hoped for:

> Law is snapshotted. Reading is independent. Challenges are adversarial. Conclusions are evidence-bound. Verification is structured. Signing is deterministic. Validity is derived. Every historical decision is replayable.

Each sentence is a mechanism in the sections that follow, not an aspiration.

### Current state of the repo (verified 2026-08-20)

| Fact | Value |
|---|---|
| Requirements in the CSRD pack | 16, all `draft` |
| Sources in the citation record | 17 |
| Surfaces in the source register | 10 (3 `legal_record`, 7 `official_body`) |
| Engine tests | 74, green |
| Requirements verified by hand | 1 (`CSRD-S-001`), unsigned, 2 open questions |
| Requirements the public site can reach | **All 16** |

That last row corrects the earlier spec. `frontend/web/lib/checker.ts` no longer uses a `BASE_REQUIREMENTS` subset — it builds a full profile from eight questions and runs `assess()` over the whole pack. Every encoded rule is capable of making a public claim today.

---

## 2. Architecture

Four layers, in dependency order. Nothing in any of them names a program: identity is `packId` + `requirementId` throughout, and the standing gate holds — grep for "CSRD" under `backend/engine/src/` returns only comments.

### 2.1 The corpus — law is snapshotted

`backend/engine/corpus/` is a content-addressed store of primary legal text, git-tracked. It is the defence file: the answer to "which words did you read when you signed this?"

`corpus/index.json` holds one entry per document:

```json
{
  "docId": "DOC-32013L0034-C-20260318",
  "serves": ["SRC-001"],
  "title": "Directive 2013/34/EU — consolidated text of 18 March 2026",
  "url": "https://eur-lex.europa.eu/eli/dir/2013/34/2026-03-18/eng",
  "versionLabel": "consolidated 18 Mar 2026",
  "retrievedOn": "2026-08-20",
  "rawPath": "corpus/raw/32013L0034-c-20260318.html",
  "normalizedPath": "corpus/normalized/32013L0034-c-20260318.txt",
  "sha256Raw": "…",
  "sha256Normalized": "…",
  "normalizerVersion": "1.0.0",
  "edges": [
    {
      "edgeId": "EDGE-32013L0034-amendedBy-32026L0470",
      "kind": "amendedBy",
      "from": "DOC-32013L0034-C-20260318",
      "to": "DOC-32026L0470",
      "provenance": {
        "type": "celex_metadata",
        "source": "CELEX:32013L0034 — amended-by relation as published by EUR-Lex",
        "recordedOn": "2026-08-20"
      }
    },
    {
      "edgeId": "EDGE-32013L0034-consolidates-32022L2464",
      "kind": "consolidates",
      "from": "DOC-32013L0034-C-20260318",
      "to": "DOC-32022L2464",
      "provenance": {
        "type": "eli_metadata",
        "source": "ELI consolidation chain for eli/dir/2013/34",
        "recordedOn": "2026-08-20"
      }
    }
  ]
}
```

**Every edge is provenance-bearing.** `provenance.type` is `eli_metadata`, `celex_metadata` or `human`, with the source stated and the date recorded. An edge is an assertion about how two instruments relate — which is a legal claim, not a bookkeeping detail — so it carries the same burden as any other claim in this system: where it came from, and when.

`human` provenance is legitimate and expected, since not every relation is published as metadata. It is simply the honest label, and it makes the population of hand-asserted relations countable rather than indistinguishable from the derived ones.

**Both forms are stored, not just both hashes.** `rawPath` holds the bytes exactly as fetched and `normalizedPath` the text agents actually read. Retaining raw is what makes `normalizer_changed` (§4.3) recoverable: without the original bytes there is nothing to renormalise, and a normalizer upgrade would invalidate every signature with no way to tell whether the text had actually moved.

**The normalizer is two layers, and the split is load-bearing.** Extraction (HTML to running text, entity decoding) runs exactly once, at ingest, over raw bytes — it cannot be idempotent, because decoding `&amp;lt;` yields `&lt;`, which a second pass would decode again. Whitespace normalisation (unicode NFC, whitespace) decodes nothing and is therefore idempotent by construction, which is what every *comparison* runs over: quote checking and absence search (§2.2) operate on text that has already been extracted, and re-running extraction over it would shift the haystack out from under the quote. Collapsing the two into one function makes the anti-hallucination control depend on a property it does not have. `normalizerVersion` covers both layers.

Extraction also requires a tag-shaped opener — `<` followed by a letter or `/` — rather than matching any `<…>`. Legal text says *"turnover < 40 million"*, and a naive stripper deletes from that `<` to the next `>` silently, which is the worst available failure for a store whose entire purpose is that the words did not move. Declarations (`<!DOCTYPE …>`) and comments are removed explicitly rather than relying on the tag pass, since the tag-shaped-opener rule deliberately does not match them.

**Each document records the region its text was taken from.** `contentSelector` names the element holding the legal text — EUR-Lex publishes it under `id="text"` — and extraction is scoped to it. Without that scope, site furniture (navigation, breadcrumbs, the table-of-contents toolbar) lands inside `sha256Normalized`, and a publisher's redesign then invalidates every signature over the document while the law sits untouched. That is precisely the alarm-fatigue failure the raw/normalized split and the non-blocking `source_reissued` state exist to prevent, so chrome inside the normalized text is a correctness problem rather than untidiness.

The selector lives on the document entry rather than in the normalizer, because it is knowledge about one publisher's markup. National gazettes will each need their own, and a general-purpose normalizer that hardcodes one publisher's DOM would silently do nothing for the rest. A selector that fails to match is an error, never a fallback to the whole document: falling back would store chrome under a configuration claiming it was excluded, so the stored text would not be what the index says it is. `contentSelector` is not part of the closure hash — it is how the text was derived, and its effect is already fully captured by `sha256Normalized`.

**Two hashes, deliberately.** `sha256Raw` covers the bytes as fetched; `sha256Normalized` covers whitespace- and encoding-normalised text under a named `normalizerVersion`. The split decides whether this system survives contact with EUR-Lex. A raw change with an identical normalized hash means the page was re-rendered and the words did not move — advisory, non-blocking. A normalized change means the legal text changed — blocking. Without the split, every cosmetic re-issue invalidates a signature, the operator learns to dismiss the alarm, and the alarm stops working.

**Edges make the corpus a graph.** `amends`, `amendedBy`, `consolidates`, `references`, `definesTermsFor`. The blind reader (§3.1) traverses them, so the graph is part of the evidence surface and is pinned as such (§4.2).

**Ingest is the only door to the network.** A separate command with live web access fetches documents, normalises, hashes and indexes them. Verification agents never fetch. A failed fetch is recorded as unreachable with its error and never folded into a success.

**Ingest does not discover legal relationships.** Edges are either supplied explicitly by a human and validated (both endpoints resolve, the kind is one of the five, provenance is complete, no cycles among `amends`/`amendedBy`), or derived from mechanically knowable metadata — the CELEX and ELI identifiers EUR-Lex already publishes, which state consolidation and amendment relations as data rather than as inference. Working out that one instrument amends another by *reading* them is a legal judgment, and putting it inside the supposedly agent-free phase would smuggle reasoning into the layer whose entire value is that it contains none. Automatic edge discovery is a later, separately measured capability.

### 2.2 The evidence checker — conclusions are evidence-bound

`src/verification/evidence.ts` mechanically validates every evidence item an agent produces.

| Evidence kind | Contents | Deterministic check |
|---|---|---|
| `quote` | `docId`, `sha256Normalized`, verbatim span | The span is a literal substring of that exact document under its pinned normalizer |
| `amendment_chain` | Ordered hops, each an amendment edge plus a quote | Every hop is an `amends`/`amendedBy` edge that exists in the graph; every quote sits on one of its own hop's endpoints; consecutive hops are **oriented**, not merely connected (see below); every quote checks |
| `cross_reference` | Source and target `docId` + provision, with quotes at both ends | Both quotes check; a `references` edge connects them |
| `absence` | Documents searched, the search performed, the term sought | **The search is re-run.** The claim fails if the term occurs |

`absence` is the item that would otherwise be pure assertion — you cannot quote a thing that is not there. Re-running the search turns it from a claim into a checked fact.

**`absence` means lexical absence, and only that.** A deterministic search can establish that the phrase *"balance sheet total"* does not occur within named spans of named documents. It cannot establish that the law contains no economically equivalent criterion under different words — that is a legal judgment, and no amount of string matching produces it. So a conclusion may never rest on an `absence` item alone. It is a component: the quoted operative provision establishes what the test *is*, and the absence check establishes that the sought criterion does not appear within it. Together they support the composite conclusion; separately neither does. The schema enforces this — an `absence` item cannot be the sole evidence for any conclusion.

**The standing rule:** every positive legal proposition carries at least one verified quote; composite reasoning is expressed as several evidence items plus a stated inference; no conclusion may rest on inference alone. A single quote is never forced where the reasoning genuinely spans provisions.

A fabricated quote fails the build, not the review. That is what makes a dossier readable without re-reading the law.

### 2.3 The condition renderer

`src/verification/render.ts` — a pure, unit-tested function covering every v0 primitive, carrying a `rendererVersion`.

It is a prerequisite rather than a presentation nicety. Prosecutors argue against the rule stated in English; arguing against JSON tests whether a model can read JSON, not whether the encoding matches the law. The same rendering feeds the review sheet, so the reviewer and the prosecutors are looking at identical text — which is what makes the rendered output worth pinning into a signature (§4.2).

### 2.4 The pipeline

Four agent roles and a deterministic tail. Detailed in §3.

### 2.5 Data flow

```
sources.json ── ingest (the only network access) ──▶ corpus/  (raw + normalized hashes, edges)
                                                        │
requirements.json ── render → English ──┐               │
                                        │               │
                                        │        entitled closure (bounded)
                          (encoding)    │      (blind)  ▼
                                        │      Reader: independent legal reading
                                        │               │
                                        └──────┬────────┘
                                               ▼
                        Prosecutors (N, lens-diverse, blind to any defence)
                        bidirectional coverage table + CHALLENGE items
                                               ▼
                        Adjudicator: CONFIRMED | MISMATCH | OPEN_QUESTION
                        every conclusion bound to evidence[]
                                               ▼
                        verification-result.json  (authoritative)
                                               ▼
              evidence check · schema validation · Markdown render · review sheet
                                               ▼
                        human adjudication ──▶ sign CLI ──▶ signatures.jsonl
                                               ▼
                        derived status + derived staleness, computed at read time
```

---

## 3. The pipeline — reading is independent, challenges are adversarial

Each role is a separate agent context. Verdict vocabulary is scoped by role, and the scoping is the point: a role may not reach a conclusion that a later role exists to reach.

### 3.0 The evidence surface is the pinned closure — for every role

**Reader, prosecutors and adjudicator may read the full text of the entitled closure (§4.2), and nothing outside it.** Not the wider corpus.

This is a trust-boundary invariant rather than a convenience. If a prosecutor could inspect a document outside the closure, its challenge might depend on evidence the signature never pins — and the signature would then attest to a reading produced from a surface it does not describe. The guarantee we want is exact:

> Everything the agents were entitled to know is exactly what the signature pins.

When any role determines an outside document is necessary, it does not read it. It halts and emits `corpus_gap` or `closure_gap` (§4.2). A human ingests the document or adds the relationship, the closure is recomputed, and **the run restarts** — because a reading produced under a narrower entitlement cannot simply be topped up with the new document.

### 3.1 Reader — blind to the encoding, not to related law

**Receives:** the requirement's provision citation (`"Accounting Directive Art. 19a as amended by Directive (EU) 2026/470"`) and the entitled closure computed from its `sources[]` (§4.2).

**Does not receive:** the condition, `plainEnglish`, `caution`, the facts, or the obligation templates.

**Produces:** an independent structured reading of what the law requires — the operative test, each criterion, the conjunction between criteria, the measurement period, the addressee, the exclusions, and the amendment chain that produced the current text. Every element carries evidence.

This is the change that does the most work in the design. A reader that can see the encoding writes down the encoding; the comparison that follows is then circular. A blind reader produces a genuinely independent document, and divergence becomes a comparison between two readings rather than a judgment formed while looking at the answer.

**Traversal is blind to the answer, not to the law.** `sources[]` is an entry point into the closure, not a fence at its edge. Two consequences are deliberate:

1. A requirement whose `sources[]` omits the act that proves it wrong is still caught, and the omission itself is reported as a **provenance defect against `sources[]`**. The citation list becomes verifiable rather than assumed.
2. When the reader needs a document outside its entitlement, it **halts** with `corpus_gap` (absent from the corpus) or `closure_gap` (present but unreachable under policy), naming the document. It may not proceed from memory and it may not fetch. This is product law 1 applied to reading: a document we could not read is not a document that said nothing. The requirement is not verifiable until the gap is filled and the run restarted.

### 3.2 Prosecutors — N, lens-diverse, blind to any defence

**Receive:** the blind reading, the rendered English condition, and the full text of the entitled closure — not the wider corpus (§3.0).

**Produce**, as structured output rather than prose:

**A bidirectional coverage table.**

| Direction | Cell values | What it catches |
|---|---|---|
| legal-reading element → condition atom | `MAPPED`, `UNMAPPED`, `UNCERTAIN` | Law the encoding missed |
| condition atom → legal-reading element | `MAPPED`, `UNSUPPORTED`, `UNCERTAIN` | Encoding the law does not support |

This converts "does this look right?" into a completeness test with two failure directions. `UNMAPPED` catches missing law; `UNSUPPORTED` catches invented encoding.

**Challenges**, each carrying evidence, raised through distinct lenses: missing criterion, wrong conjunction, wrong threshold or units, wrong measurement period, wrong scope type or addressee, superseded or mis-cited provision, missing exclusion.

**Verdict scope: a prosecutor emits `CHALLENGE` only.** Uncertainty escalates to a challenge; it never resolves to a finding of mismatch. A prosecutor concluding `MISMATCH` would be making the exact judgment that adjudication exists to reserve.

### 3.3 Adjudicator

**Receives:** the blind reading, the rendered English, the coverage table, all challenges, and the entitled closure.

**Produces:** a verdict per challenge — `CONFIRMED` (encoding correct), `MISMATCH` (encoding wrong), or `OPEN_QUESTION` (not settleable from the closure) — each bound to `evidence[]`. It may never dissolve a challenge by reasoning alone. It writes nothing under `knowledge/`.

`OPEN_QUESTION` is load-bearing. It is what stops "I checked but could not fully settle this" from silently becoming "it's fine", and it blocks signing (§4.5). `CSRD-S-001`'s two carried-forward questions are exactly this shape.

`MISMATCH` blocks signing too, and by a different route: it is not a defect in the verification, it is a finding about the encoding, and it exits this pipeline into a correction cycle (§4.5).

### 3.4 The deterministic tail

Evidence check → result-schema validation → Markdown render → review sheet. No agent participates.

### 3.5 The record — verification is structured

`verification/<packId>/<requirementId>/verification-result.json` is **authoritative**. The Markdown dossier beside it is **generated from it**, carrying one human-authored `narrative` block that round-trips back into the JSON. Two artifacts, one truth; otherwise they drift and the reviewer cannot tell which one to believe.

The result holds: pack and requirement identity, the pinned input hashes (§4.2), the corpus closure, the blind reading, the coverage table, every challenge with its adjudicated verdict and evidence, open questions, `pipelineVersion`, `rendererVersion`, and `resultSchemaVersion`.

---

## 4. Signing and validity — signing is deterministic, validity is derived

### 4.1 The ledger is authoritative; status is a projection

`verification/signatures.jsonl` is append-only: one JSON object per line, never rewritten.

`requirements.json` **stops asserting `ratification.status`**. Signing appends one line to one file; the loader derives effective status from the ledger at load time; a generated projection file serves any surface that cannot run the loader. There is no two-file atomic write, because there cannot be one — asserting atomicity across two files would place a falsehood at the centre of the trust boundary.

This applies the rule already adopted for staleness one level up: **status is derived, never asserted.**

Three levels survive from the earlier spec:

| Status | Means | Customer-facing treatment |
|---|---|---|
| `draft` | Encoded, unchecked | Prototype banner |
| `verified` | Checked against source text by a named person on a date — not legal advice | Caveat, usable |
| `ratified` | Professionally opined | Clean. Reserved; unused for now |

### 4.2 What a signature pins

```
packId, packVersion
requirementId, requirementVersion, requirementSha256
requirementInputSha256          provision citation + sources[] + condition, canonicalised
conditionSha256                 canonicalised condition subtree
renderedConditionSha256         the exact English prosecutors and the reviewer read
rendererVersion
corpusClosureSha256             the entitled document + edge closure
corpus[]                        { docId, versionLabel, sha256Raw, sha256Normalized, normalizerVersion }
resultSha256                    the verification-result.json this rests on
pipelineVersion
status, by, on, note?
```

Three of these are answers to specific holes:

**`corpusClosureSha256` covers the *entitled* closure, not the traversed one** — the set of documents and edges the reader was permitted to reach, whether or not it quoted them. If it covered only what was traversed, adding a newly relevant document that the reader *would now* find would leave the signature looking fresh, which is precisely the gap.

The closure must be **bounded**, or it degenerates: an unbounded transitive walk eventually reaches most of the corpus, and every ingest then invalidates every signature. The bound distinguishes two kinds of edge:

> **Structural edges** — `amends`, `amendedBy`, `consolidates`, `definesTermsFor` — do **not** increment reference depth and are followed to fixpoint from every node in the closure.
>
> **`references` edges** increment reference depth, bounded at **depth 1** from the requirement's `sources[]`.

The asymmetry is the whole design. Structural edges do not lead somewhere new; they lead to *the same law in the form that currently governs*. So from a document reached at depth 1:

```
Art. 19a ──references──▶ instrument Y        reference depth 1
                              └──amendedBy──▶ Y′   still depth 1, and required
```

`Y′` is in the closure. Without that rule the reader would be entitled to `Y` only in an obsolete form, which is worse than not reaching it at all.

The closure hash covers the resulting `docId` set with their `sha256Normalized` values, plus the connecting edge set **including each edge's identity and provenance**.

**Every field is escaped before it enters the digest** — JSON-encoded, not joined by a delimiter. `provenance.source` is free text, and `human` provenance is an expected input rather than a degenerate one, so a tab or newline pasted into a citation would otherwise shift field boundaries and let two genuinely different edge sets serialise to identical bytes. A hash that can collide is a hash that silently fails to move when the entitlement basis changes, which is the precise failure this hash exists to prevent.

Hashing the edges' provenance rather than merely their existence closes a hole that documents alone cannot: an edge can be retyped, re-sourced, or silently switched from `celex_metadata` to `human` while every document in the closure remains byte-identical. The reader's entitlement would change, or the basis for its entitlement would change, and nothing else in the signature would move. With provenance in the hash, that edit is both auditable and staleness-producing — it lands as `stale_closure` (§4.3), which is the correct outcome, because the reading was produced under a relationship claim that no longer holds in the form it held.

**Depth 1 is a v0 hypothesis, not a derived value.** It is part of `pipelineVersion`, so changing it is recorded rather than silent, and B3 measures both sides of the trade-off rather than only one:

| Measured | Tells you |
|---|---|
| Ground-truth evidence documents excluded by the closure | Whether depth 1 is too shallow |
| Signature churn caused by closure expansion or policy change | Whether it is too loose |

Optimising for churn alone would drive the bound to zero and quietly starve the reader. The bound may end up relation-specific rather than a single number.

**`closure_gap` is distinct from `corpus_gap`**, and the distinction is what makes the measurement possible:

| Signal | Means | Response |
|---|---|---|
| `corpus_gap` | The document does not exist locally at all | Ingest it, then rerun |
| `closure_gap` | The document is in the corpus, but traversal policy did not entitle the reader to reach it | Add the missing relationship, or record it as evidence that the bound is too tight; then rerun |

Collapsing the two would hide exactly the population B3 needs to count.

**`requirementSha256` and `requirementInputSha256` are separate.** The first covers the whole record; the second covers only what the agents actually consumed. Editing a `caution` string moves the first and not the second, so it does not invalidate — the same alarm-fatigue logic as raw versus normalized hashing.

**`requirementVersion` is new.** `pack.json` carries a single version, too coarse to name a requirement revision. B1b adds a per-requirement `version` — an integer, **bumped by hand** as part of any content edit, and enforced by a loader test: if a requirement's `requirementSha256` differs from the last one recorded against its current `version`, the build fails until the version is bumped. Hand-maintained with a machine backstop, because a fully generated version cannot distinguish a revision from a reformat. This is what makes the ledger portable across CSRD, CBAM and country packs.

### 4.3 Derived staleness

Computed at read time. Never stored, never written back — the signature is immutable.

| State | Trigger | Blocks |
|---|---|---|
| `fresh` | everything pinned still matches | — |
| `source_reissued` | raw hash moved, normalized hash identical | advisory only |
| `stale_source_text` | normalized hash moved: the words changed | yes |
| `stale_encoding` | `requirementInputSha256` or `conditionSha256` moved | yes |
| `stale_render` | re-rendering produces different English | yes |
| `stale_closure` | `corpusClosureSha256` moved: the entitled evidence surface changed | yes |
| `normalizer_changed` | see below | yes |

Status and staleness are two axes over the same ledger, and they do not overlap: a requirement with **no** ledger entry has status `draft` and no staleness at all, because there is no signature for anything to have gone stale against. Staleness is defined only where a signature exists. A blocking staleness state does not rewrite the signature — it withholds the derived `verified` status, so the requirement reads as `draft` with a stated reason until a fresh verification supersedes it.

**`stale_render` derives from the output hash, not `rendererVersion`.** A renderer bump that does not change this rule's English must not invalidate a signature; the version is carried for diagnosis only.

**`normalizer_changed` handles an inevitability.** The normalizer will change, so requiring `normalizerVersion` to hold constant would freeze it. Instead the checker **renormalises the stored raw bytes** under the new normalizer and compares. Identical means still `fresh`. Different means the normalizer's opinion of the text changed — a distinct, blocking state for a human to adjudicate. Raw bytes are retained precisely so this is answerable rather than assumed.

### 4.4 Integrity failure is not staleness

`corpus_gap` — a document pinned by an existing signature is no longer present in the corpus — is **not** a staleness state. It is an `INTEGRITY_FAILURE` with its own category, its own test, and its own exit code. In an append-only git-tracked corpus a signed snapshot cannot vanish through ordinary drift; it is tampering-shaped, and filing it beside "the law changed" would understate it.

### 4.5 The sign CLI

A requirement is signable as `verified` only when the result satisfies, in full:

```
overallOutcome   = CONFIRMED
mismatches       = []
openQuestions    = []
allEvidenceValid = true
```

`npm run verify -- sign <packId> <requirementId> --by "<name>"` refuses on any of:

- any `MISMATCH` verdict
- outstanding `OPEN_QUESTION` items
- a failing evidence check (including a failing `absence` re-search)
- an unresolved `corpus_gap` or `closure_gap`
- an invalid result schema
- derived staleness other than `fresh` or `source_reissued`
- an integrity failure
- a red test suite
- a `pipelineVersion` with no promotion record

Refusal is the feature. Every item is a way a signature could mean less than it appears to.

**`MISMATCH` is refused categorically**, not weighed. `verified` asserts that the encoding matches the law, so it must never be possible to sign "we verified that this encoding is wrong" — a status that would be technically truthful and operationally catastrophic, since downstream code reads `verified` as fit to rely on. A confirmed mismatch instead exits into a correction cycle:

```
MISMATCH  ─▶  finding recorded in the result
          ─▶  separate reviewed engineering session corrects the encoding
          ─▶  requirementVersion bumped, golden profiles re-run
          ─▶  verification rerun from the blind reading
          ─▶  a new result, and only then a signature
```

The rerun starts at the blind reading rather than re-adjudicating the old one, because the corrected encoding is a different object and the prior challenges were raised against the old one.

### 4.6 The review sheet

`npm run verify -- sheet` generates HTML (git-ignored).

**Portfolio header:** counts by derived status and staleness, plus the most recent live benchmark run — **labelled as governing nothing until promoted**.

**Per requirement:** derived status and staleness with its reason; the English condition; the bidirectional coverage table; challenges with adjudicated verdicts; evidence linked into the corpus; open questions; facts consumed and the questions that collect them; obligations that fire; golden profiles exercising the rule, or a warning that none do; the sign-off block; and **the benchmark metrics for the `pipelineVersion` bound to that requirement's signature**, resolved through its promotion record — not whichever live run happened most recently.

The reviewer never opens JSON.

---

## 5. Measuring the pipeline — every historical decision is replayable

### 5.1 `pipelineVersion` is an artifact, not a label

`verification/pipeline/<version>.json` pins:

- per-role prompt file hashes
- exact model identifiers per role
- role configuration: prosecutor count, lens set, ordering
- `resultSchemaVersion`
- benchmark suite version and hash
- measured benchmark results

Promotion appends to `verification/promotions.jsonl`: version, promoted by, date, the metrics that justified it. "Pipeline v7 was approved" then resolves to evidence rather than to a string someone can reuse later. Every signature pins the `pipelineVersion` that produced its dossier.

### 5.2 Two suites with structurally different powers

| Suite | Input | Proves | Power |
|---|---|---|---|
| `verification-machinery` | Recorded agent transcripts | Parsing, schema validation, evidence and absence checking, coverage computation, verdict handling, staleness derivation have not regressed | **Blocks commits.** Runs in `npm test`. No network, no spend |
| `verification-agents` | Live agent runs | A changed model or prompt still rediscovers the planted defects | **Blocks pipeline promotion.** On demand. Never blocks a commit |

The distinction is structural rather than conventional, because CI can never prove the second thing. Recorded transcripts test the deterministic machinery around the agents; only a live run tests the agents.

### 5.3 The adversarial golden suite

`test/verification-golden/`. Mutants of `CSRD-S-001` establish the floor:

| Case | Ground truth | Must |
|---|---|---|
| S-001 as encoded | Correct; one real open question | Surface the balance-sheet-**dates** measurement-period question. **Not** raise two-of-three as a defect — Omnibus I settled it |
| Threshold mutated | €450m → €40m | Catch it |
| Conjunction mutated | `all` → `any` | Catch it |
| Criterion deleted | employees atom removed | Catch it as `UNMAPPED` |
| Provision mis-cited | points at Art. 3(4) | Catch the provenance defect |
| Known-correct rule | No defects | Raise **zero** challenges — the false-positive control |

**No quality claim may be made from S-001 variants alone.** Before the subsystem is considered proven, the suite must include structurally different cases, each with recorded ground truth:

| Shape | CSRD candidate |
|---|---|
| Exemption | `CSRD-S-005` / `CSRD-S-006` (subsidiary exemption) |
| Application-date rule | `CSRD-S-004` or `CSRD-S-016` (transition relief) |
| Cross-reference / definition | `CSRD-S-012` (applicable ESRS version, selection cases) |
| Scope-object error | `CSRD-S-009` (branch gateway, `scopeType`) |
| Superseded amendment | `CSRD-S-003` against the stop-the-clock chain (`SRC-003`) |

### 5.4 The four metrics

| Metric | Why |
|---|---|
| **Material-defect recall, severity-weighted** | A missed defect is a false all-clear. Missing a €450m threshold is not the same as missing a wording nuance, and an unweighted average hides the difference |
| **False-positive rate** | Reviewer fatigue destroys the system. A pipeline that flags everything is indistinguishable from no pipeline, because the reviewer reads the law anyway |
| **Open-question rate** | Distinguishes genuine legal ambiguity from an adjudicator that will not commit |
| **Adjudicator reversal rate** | Calibration in both directions: very high means noisy prosecutors, near-zero means timid prosecutors or a rubber-stamping adjudicator — and the other three metrics cannot tell those apart |

Recall and false-positive rate are **co-primary**. Both are reported per promotion and stored in the promotion record.

Two closure measurements accompany them, per §4.2: **evidence documents excluded by the bound** (is depth 1 too shallow) and **signature churn under closure change** (is it too loose). They are reported alongside the four but govern the traversal policy rather than promotion.

---

## 6. Error handling

| Condition | Behaviour |
|---|---|
| Ingest fetch fails | Recorded as unreachable with the error. Never folded into a success |
| Any role needs a document absent from the corpus | Halt with `corpus_gap`. Never proceed from memory, never fetch. Ingest, then restart the run |
| Any role needs a corpus document outside its entitlement | Halt with `closure_gap`. Add the relationship or record the bound as too tight, then restart the run |
| Quote not a substring of the pinned document | Hard fail. Result rejected |
| `absence` term found on re-search | Hard fail. Result rejected |
| `absence` offered as the sole evidence for a conclusion | Schema rejection. Lexical absence is never sufficient alone |
| Prosecutor uncertain | Escalates to `CHALLENGE`. Never a verdict |
| Adjudicator cannot settle from the closure | `OPEN_QUESTION`. Blocks signing |
| Adjudicator finds the encoding wrong | `MISMATCH`. Blocks signing; exits to the correction cycle |
| Sign attempted with open questions or a mismatch | Refused |
| Pinned corpus document missing | `INTEGRITY_FAILURE`, distinct exit code |
| Pack fails validation | Site refuses to answer (already true in `frontend/web/lib/pack.ts`) |
| Correction flips a golden profile | Blocked until reviewed and justified in writing (existing law) |

Text inside a fetched or corpus document is evidence about that document, never an instruction to an agent.

---

## 7. Testing

Added to the existing 74:

- **Renderer** — every v0 primitive; output stability across key reordering
- **Evidence checker** — a fabricated quote must fail; an `absence` claim whose term is present must fail; an `absence` item standing as sole evidence must fail; an `amendment_chain` hop with no corresponding edge must fail; a connected-but-unoriented chain must fail; a `cross_reference` on a non-`references` edge must fail
- **Canonical hashing** — `conditionSha256` and `requirementInputSha256` stable under key reordering and whitespace
- **Normalizer** — renormalising stored raw bytes reproduces `sha256Normalized`
- **Loader** — a `verified` projection with no ledger entry fails; with open questions fails; when stale fails
- **Version discipline** — a requirement whose `requirementSha256` moved without a `version` bump fails the build
- **Closure bound** — the entitled closure is stable under ingesting an unrelated document; moves when an `amendedBy` edge is added to an entry-point source; and includes the amended form of a document reached at reference depth 1 (the structural-edges-do-not-increment rule)
- **Edge provenance in the closure hash** — retyping an edge, or switching its provenance from `celex_metadata` to `human`, moves `corpusClosureSha256` with every document byte-identical; an edge missing provenance fails ingest validation
- **Sign refusal** — one test per item in §4.5, `MISMATCH` included
- **Staleness derivation** — one test per state in §4.3, including `normalizer_changed` both ways
- **Integrity** — a missing pinned document raises `INTEGRITY_FAILURE`, not staleness
- **Result schema** — malformed results rejected at load
- **Machinery suite** — recorded transcripts, per §5.2

No network anywhere in `npm test`.

---

## 8. Non-goals

- **No AI writing into a knowledge pack.** Ever. Product law 2. The pipeline proposes a dossier; a human signs; the sign CLI is the only writer, and it writes a signature, never content.
- **No agent-proposed encoding fixes.** A confirmed `MISMATCH` produces a finding, not a diff. Correcting the encoding is a separate reviewed engineering session. Revisitable once measured metrics justify it.
- **No scheduled runs.** On command only until the benchmark says the pipeline is worth trusting.
- **No authoring workbench.** Still deferred, per the earlier spec §8.
- **No change detection.** That is the `watch` sweep, Plan C, unchanged by this document.

---

## 9. Build order

Five plans. B1a and B1b are **agent-free, with every trust-critical transformation deterministically testable against fixtures** before any agent runs — which also means the agents are later developed against machinery that already works.

The precision matters because B1a deliberately touches the live web, and a network response is external and not reproducible. What is deterministic is everything downstream of the bytes:

```
received bytes ─▶ normalization ─▶ hashing ─▶ indexing ─▶ closure ─▶ evidence checking
```

Every stage in that chain is testable from a stored fixture with no network, which is the property the trust boundary actually needs. B1b is agent-free end to end: renderer, hashes, schema, ledger, status and staleness derivation, sign CLI and review sheet all develop against hand-authored fixture `verification-result.json` records. The agents are simply a future producer of an interface that already exists and is already tested.

| Plan | Delivers | Agents |
|---|---|---|
| **B1a — Corpus** | Store with raw and normalized text, index with validated provenance-bearing graph edges, ingest command, hashing with `normalizerVersion`, closure computation over documents and edge provenance, evidence checker including `absence` re-search | No |
| **B1b — Record** | Condition→English renderer, canonical hashing, per-requirement `version`, `verification-result.json` schema, signature ledger, derived status projection, derived staleness, integrity check, sign CLI, review sheet | No |
| **B2 — Pipeline** | `/verify`, the four roles, prompts, transcript recording, machinery suite | Yes |
| **B3 — Benchmark** | Mutant suite, the five structurally diverse cases, the four metrics, `pipelineVersion` artifacts, promotion ledger and gate | Yes |
| **B4 — The pass** | CSRD requirements verified, adjudicated and signed | Yes |

**B3 precedes B4 deliberately:** the factory is measured before it is pointed at content anyone intends to sign.

**B4 orders by reachability and severity**, not by the earlier spec's six-rule subset — that subset no longer exists (§1). Every requirement `assess()` can reach makes public claims, so ordering runs `severity: critical` rules first, then the rest.

**Migration touched by B1b:** `frontend/web/lib/pack.ts:53` reads `r.ratification.status === 'ratified'` directly. It moves to the derived projection, as does the CLI banner logic in `src/cli/assess.ts` and `Determination.ratificationStatus` in `src/types.ts`.

---

## 10. Open items carried into implementation

- **`CSRD-S-001`'s measurement-period question is unresolved** and inherited: the operative wording is "on their balance sheet **dates**" (plural), Art. 3(10) generally requires two consecutive balance sheet dates, and the encoding tests a single year with no prior-year facts in the pack. It blocks signing S-001 and is the first real `OPEN_QUESTION` the pipeline must reproduce rather than resolve.
- **`CSRD-S-002` (Art. 29a) is not settled by the S-001 check** and must be verified separately.
- **Prosecutor count and lens set are unfixed.** B3 measures them; B2 must make both configurable rather than hard-coded, since they are `pipelineVersion` inputs.
- **Corpus size is unmeasured.** Consolidated EU instruments are large. If git-tracking full text proves impractical, the fallback is tracking normalized text plus raw hashes, which weakens `normalizer_changed` recovery — decide with real numbers in B1a, not now.
- **`CSRD-S-006` and `CSRD-S-016` still have zero golden-profile coverage.** Verification does not substitute for a test; carried forward from the earlier spec.
