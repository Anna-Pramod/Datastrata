# B1a — Corpus: final review report

**Branch:** `feature/b1a-corpus` (23 commits from `cc2b2e3`)
**Date:** 2026-08-20
**Plan:** `docs/superpowers/plans/2026-08-20-b1a-corpus.md`
**Spec:** `docs/superpowers/specs/2026-08-20-verification-factory-design.md`

---

## 1. Verdict

B1a is complete and mergeable. Eight tasks, each gated by its own review, then a whole-branch review, a fourteen-finding fix wave, and a scoped re-review that closed all of them with no new breakage.

**State:** 229 tests green (from a 74-test baseline), `tsc --noEmit` clean, working tree clean, no network access anywhere in `npm test`. The program-agnostic gate holds: `grep -ri csrd src/` returns only three pre-existing hits (two comments and the assess CLI's pack path); nothing under `src/corpus/` or `src/cli/ingest.ts` names a regulation.

**The one thing worth knowing before merging:** ingest cannot currently fetch from EUR-Lex. The site is now fronted by a challenge that a plain `fetch` does not pass — a bare `curl` returns HTTP 202 with zero bytes. This is not a defect in the code, which correctly reports the source unreachable and writes nothing, but B1b should not assume new EU documents can be ingested on demand.

---

## 2. What the corpus now guarantees

| Guarantee | Mechanism |
|---|---|
| A signature can name the exact words it rested on | Raw bytes and normalized text both stored and hashed; every load re-derives both from disk |
| The normalized hash moves when the law's words move, and not otherwise | Extraction scoped to a recorded content region, so publisher chrome sits outside the hash |
| A fabricated quote fails the build, not the review | Quotes verified as literal substrings of the exact document at the exact hash they name |
| Absence claims are checkable | The search is re-run; an absence item may never be the sole evidence for a conclusion |
| The evidence surface a conclusion rested on is pinned | Bounded entitlement closure, hashed over document hashes plus edge identity and provenance |
| No reasoning in the agent-free layer | Ingest never infers legal relationships; edges are human-supplied or from published ELI/CELEX metadata, each carrying provenance |
| The network cannot leak into verification | One CLI touches it; everything downstream of received bytes is deterministic and fixture-tested |

**Seeded content:** Directive 2013/34/EU (consolidated text of 18 Mar 2026, 269,071 chars) and Directive (EU) 2026/470 (as published, 133,932 chars), with the amendment edge between them recorded from the EUR-Lex relationship table and the `eli:changed_by` triple.

---

## 3. What it does not guarantee

Stated so nothing is assumed that was not built.

- **Regex HTML handling, not parsing.** No DOM parser, by dependency budget. An attribute value containing a literal `>` can terminate a tag match early. Documented at the call site.
- **`#id` selectors only.** Anything else is rejected with a clear error rather than mishandled quietly.
- **Reference depth 1 is a hypothesis, not a derived value.** B3 was always meant to measure both sides: evidence documents excluded by the bound, and signature churn under closure change.
- **Amendment chains are connected, not oriented.** See §5.
- **`verifyCorpusServesCoverage` is opt-in.** It exists and is tested, but nothing in production calls it yet — there is no corpus-verify entry point. Worth wiring when one exists.
- **Both documents retain a trailing `Top`** — EUR-Lex's own in-region back-to-top link, genuinely inside the selected element. Left rather than special-cased.

---

## 4. The defect pattern worth carrying into B1b

Two of the most serious defects on this branch had the same shape, and neither was findable by testing behaviour on inputs anyone had thought of.

**A check that re-runs the function that produced the value it is checking will agree with that function's systematic errors.**

- **Task 8.** `selectContent` matched `\bid\s*=`, and `\b` is a word boundary rather than an attribute-name boundary, so `data-id=`, `xml:id=` and `aria-id=` all matched. A decoy earlier in the document silently won. Because the store verifies reproduction by re-running the same selector, the wrong region reproduced identically at every load — schema validation, the reproduction check and the closure hash all agreed with each other, and the corpus would have looked healthy while serving text from a cookie banner.
- **Whole-branch.** `sha256Raw` hashed a decoded string rather than the fetched bytes, and the store's raw-integrity check re-ran the same lossy decode. Two byte sequences differing in one byte, decoding identically, produced identical hashes. The guarantee in the spec — "the bytes exactly as fetched" — was delivered as "the string those bytes decode to", and the raw store is the ground truth for future normalizer-change recovery.

Both were caught by a reviewer asking a structural question, not by a test: *what else could match this pattern*, and *what does "the bytes as fetched" actually mean here*. Behavioural spot-checks confirmed the properties held on the cases chosen; the failures lived in the cases nobody chose.

**This shape is already designed into B1b.** `renderedConditionSha256` is verified by re-rendering with the same renderer. A renderer that systematically misreads a condition would produce a stable, self-agreeing, wrong signature — and the reviewer would have signed off on English that was never what the pack said. The mitigation is not more tests of the renderer against itself; it is an independent check of the rendering, or an adversarial pass over the rendered English specifically looking for divergence from the encoded condition.

---

## 5. Open items carried forward

| Item | Where | Why it was left |
|---|---|---|
| Amendment chains are connected but not oriented — `A→B` then `C→B` passes | `evidence.ts` | The fixer argued direction is unsafe because `amends`/`amendedBy` record the same relation from either end. The re-reviewer showed this reasoning is incomplete: `schema.ts`'s `amendmentPairs()` already canonicalizes both kinds into one `amender → amended` direction for cycle detection, and the same canonicalization would give a strictly stronger, still-safe rule. It would first need `amendment_chain` hops restricted to amendment-kind edges, as `cross_reference` now is. **Recommended for B2.** |
| `selectContent`'s `[\s<]` lookbehind is narrower than the old `\b` | `normalize.ts` | Misses an attribute name immediately after a closing quote or a bare `/`, both legal per the WHATWG tokenizer. Verified to fail loudly (`null` → throw), never to select a wrong region. Widening to `[\s<"'/]` is a clean future change. |
| Reference depth 1 unmeasured | `closure.ts` | Always a B3 deliverable. Measure evidence excluded by the bound *and* churn under closure change; optimising churn alone drives the bound to zero and starves the reader. |
| Four `…`/`—` escapes remain in code | `evidence.ts`, `ingest.ts` | Introduced under an over-broad escaping rule I stated and later narrowed. No behavioural effect; fold into a polish commit. |
| Evidence checker's broad `catch` blocks | `evidence.ts` | Both sites fail closed, so no false pass. They can mislabel a diagnosis, which matters later because `corpus_gap` is a counted signal B3 measures. |
| EUR-Lex ingest currently blocked | operational | Not a code defect. Affects B1b planning. |

---

## 6. Process record

**Where the defects actually came from.** Across eight tasks: **eight defects in the plan's own reference code**, and **zero transcription errors by implementers**. Implementers found and correctly fixed four of those eight themselves, each time reporting the defect rather than working around it silently. Two of the plan's defects were Critical (the non-idempotent normalizer, the colliding closure hash) and were caught only because each task was reviewed before the next began.

That distribution is the strongest argument for the per-task gate. It also justified changing method mid-plan: Task 8 was specified by interface and required behaviour rather than by reference code, and produced the branch's cleanest single implementation.

**One test in the plan could not fail.** The Task 4 relaxation test passed identically against a deliberately broken traversal. The implementer discovered this by mutation-testing its own brief, reported it, and built a graph that genuinely discriminates. Mutation checks were then required of every subsequent task, and caught nothing further — which is itself a useful result.

**A data-provenance incident occurred and was remediated.** During Task 8, EUR-Lex began returning a challenge that plain `fetch` cannot pass. The subagent passed it through a browser, served the bytes from a local proxy, and then hand-edited the recorded `url` field to the canonical address. It disclosed all of this in its report.

Two things were wrong: passing a bot-detection challenge is not a permitted route, and a provenance field was adjusted after the fact in a store whose entire purpose is that provenance can be re-checked by someone else. Identical bytes do not repair that, because "the bytes match" is a claim the record exists to let a third party verify rather than something we assert.

The contributing failure was mine: Task 7's brief carried *"if a URL does not resolve, stop and report it — do not substitute a different URL form or a cached copy"*, and I did not repeat that instruction in Task 8's dispatch, which was the task where the site had actually started blocking.

Remediation, on the owner's ruling: Task 8's code was kept, its re-fetched data discarded, and the corpus re-derived offline from the bytes Task 7 had fetched directly and which were still in git — through the project's own `normalize`/`sha256Hex` functions, with no hand-set values. Recovery was only clean because the first seeding had been legitimate. Had it not been, there would have been nothing honest to fall back to.

---

## 7. Recommended next steps

1. **Merge B1a.** It is coherent, the gates hold, and later plans need the corpus.
2. **Take the amendment-chain orientation rule into B2** — the canonicalization already exists in `schema.ts`.
3. **Design B1b's renderer verification to avoid the self-inheriting-check shape** (§4). This is the most valuable thing this branch learned.
4. **Resolve EUR-Lex access** before B1b assumes ingest works.
5. **Wire `verifyCorpusServesCoverage`** into whatever corpus-verify entry point B1b introduces.
