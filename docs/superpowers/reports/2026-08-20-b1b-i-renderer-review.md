# B1b-i — The condition renderer: final review report

**Branch:** `feature/b1b-i-renderer`
**Commit range:** `309cc86..feature/b1b-i-renderer` — **12 commits**, of which the commit adding this report is the last. `git log --oneline 309cc86..HEAD | wc -l` on the branch head returns exactly that number.
**Date:** 2026-08-20
**Plan:** `docs/superpowers/plans/2026-08-20-b1b-i-renderer.md`
**Spec:** `docs/superpowers/specs/2026-08-20-verification-factory-design.md` §2.3, §4.2

---

## 1. Verdict

B1b-i is complete and mergeable. Five tasks, each gated by its own review, then a whole-branch review, a seven-finding fix wave, and a scoped re-review that closed all of them with nothing weakened.

**State:** 477 tests green (from a 233-test baseline), `tsc --noEmit` clean, working tree clean, no network in `npm test`. The program-agnostic gate holds.

**The number that matters:** the independent checker reports **zero divergences across all 16 real CSRD requirements** (59 atoms compared), **17/17 primitive round-trip parity**, and **13/13 mutations detected**. The zero is not vacuous — neutering `compareRequirementFeatures` to `return []` fails exactly the 13 mutation tests while both controls pass, verified independently rather than taken from the report.

**The single most important thing to know:** the whole-branch review found a **fourth instance of the self-agreeing-check pattern** in this project, and it arrived by a route none of the previous three did. It is fixed, and the fix closes the class rather than the instance. See §3.

---

## 2. What the subsystem guarantees

| Guarantee | Mechanism |
|---|---|
| A rule can be argued about in English rather than JSON | All seventeen `Condition` primitives render, with a fixed structural grammar and natural atom prose |
| The English says what the condition says — structurally | `features.ts` reads the English back into a binding-preserving model and compares by structural path |
| A wrong binding is caught, not just a wrong word-bag | Atoms carry `{path, op, negated, fact, comparator, threshold, unit, missReason, …}` and compare by path; `shape` pins the operator tree |
| The check cannot inherit the renderer's misreading | Symbol-level import boundary: only `factLabel` and `factUnit` (lookups) — never `renderValue` (a derivation), never `render.ts` |
| A material edit moves the hash; a cosmetic one does not | `logicalPayloadSha256` covers ordered cases, each `when` and `value`, and `defaultValue` — not a case `label`. `requirementInputSha256` covers provisions, `sources[]` and the payload |
| The English is bound to its provision | Requirement id and title are compared, so the right condition cannot appear under the wrong provision |
| An unlabelled or ambiguous fact cannot reach a signature | The vocabulary gate fails the build on a missing label, an unresolved `labelNote`, a missing unit on a comparison fact, or two referenced facts sharing an effective label |
| A new primitive cannot silently escape coverage | Fixture table typed `Record<Condition['op'], Condition>` — an eighteenth op fails typecheck |
| A new *field* cannot silently escape coverage | A field-accounting guard derives the field set from the `Condition` union in `src/types.ts` and fails until every field is handled by both sides |

---

## 3. The fourth instance, and why it was different

The previous three were **shared code**: a check calling the same function that produced the value it checked. A region selector verified by re-running the same selector; a byte hash verified by re-running the same lossy decode; and this branch was built specifically to avoid a third — a renderer verified by re-rendering.

This one was **shared omission**.

`in_catalogue` carries an optional `missReason`. `src/engine/evaluate.ts` reads it to decide the reason code on a catalogue miss, and **CSRD-S-013** — `severity: critical`, the national-law completeness gate — sets it to `national_law_unresolved`, which is that requirement's entire purpose.

Nobody rendered it. So nobody parsed it. So nobody compared it. And the grammar contract then wrote the absence down as fact, declaring the op's shape to be `{fact, catalogue}` — a false statement about the type, and the mechanism by which the hole propagated into a parser that was in every other respect independently built.

Deleting `missReason` from CSRD-S-013 left the rendered English **byte-identical** and produced **zero divergences**, while `conditionSha256` moved. So a signature would attest review of an encoding whose reviewer was never shown the deciding field — and re-verification after an edit would be blind on exactly that field, while the moved hash made the system *insist* on re-verifying it.

Three modules and a specification all agreed, and all four were wrong in the same direction.

**The generalisable lesson, and the fix:** `never`-based exhaustiveness catches a dropped **op**. It does not catch a dropped **field**. Every op had a case; one op's optional field had no home anywhere in the subsystem. The guard now derives the field set from the `Condition` union itself — 32 fields across 17 ops, verified by an independent count — and fails until every field is handled by both the renderer and the feature model.

**Carry this into B1b-ii and B2.** The question to ask of any verification layer is not only "does every case have a branch?" but "does every *field* of every case reach the thing that checks it?"

---

## 4. What it does not guarantee

Stated so nothing is assumed that was not built.

- **Word choice is not independently checked.** The grammar contract pins its templates by rendering and reading output back, so it inherits the renderer's lexicon. If `gt` mapped to *"is below"*, the contract would have recorded it and the checker would invert it, and the two would agree forever. Structure and bindings are machine-checked; wording is checked by the human reading the English against the law. That division is deliberate and is now stated in `features.ts`'s header — a wrong word is visible to a reader, a wrong binding is not.
- **A wrong label in the pack is read identically by both sides.** `factLabel`/`factUnit` are shared lookups by design. A *colliding* label is now a build failure; a *wrong but distinct* one is a content defect, and it is what B2's blind reader and adversarial prosecutors exist to catch.
- **The feature model checks structure and bindings, not meaning.** A mutation preserving every atom binding, canonical value, unit and the tree shape would pass.
- **Regex-based English parsing**, no grammar engine. Stated limits in the contract.
- **The field-probe guard proves a probe exists per field**, not that each probe is well-targeted. A careless future probe could satisfy the completeness check without exercising its named field.
- **`prefix_in`, `quantifier_any` and `sum_cmp` have synthetic coverage only** — the CSRD pack exercises none of them. That is exactly why the parity fixtures exist.

---

## 5. Process record

**Where the defects came from.** Eight defects in plan-supplied material across five tasks; **zero implementer transcription errors**. Implementers found and correctly reported several themselves, including two that were mine and that I had waved through.

This plan deliberately specified **interfaces and required behaviours rather than reference code**, after B1a's plan supplied full implementations and produced eight defects in that code while implementers made none. The change worked: the defects that remained were in *specification* (an incomplete grammar contract, a mis-aimed collision probe, an under-drawn import boundary) rather than in transcribed code, and specification defects are cheaper to find because reviews read specifications closely.

**Three controller errors worth recording**, since a report that only lists the agents' mistakes is not an accurate account:

1. **I drew the import boundary at module granularity.** `features.ts` "may import `vocabulary.ts`" let `renderValue` — a derivation — cross a boundary meant to stop derivations crossing. The owner caught it; the fix was symbol granularity, and the value path had to be re-specified as canonical-on-the-AST-side, parsed-on-the-English-side.
2. **I accepted a claim that a test was toothless without verifying it.** An implementer reported my delimiter-collision probe could not catch a naive implementation. It could — against the fixed-declared-order join, which is the pattern this codebase actually shipped at Critical severity. My own spot-check produced the disconfirming evidence and I routed it onward instead of following it. Both probes are now present, each commented with the model it discriminates. **"This check is useless" needs verifying as hard as "this check passed"** — both are claims about discriminating power, and the first sounds like rigour.
3. **I scoped the `RENDERER_VERSION` bump out by excluding its pinning test.** The emitted grammar changed twice in the fix wave, leaving `1.0.0` describing two different output grammars. The version exists to answer which renderer produced the English a signature was taken over; a version mapping to two grammars makes that unanswerable, and silently. The implementer caught it.

**Two tests that could not fail were found and fixed** — one in Task 2's fix round (a `quantifier_any` shape with zero coverage), one in Task 3 (the mis-aimed probe). Mutation and teeth checks were required of every task after B1a taught the lesson, and they kept earning their place.

---

## 6. Open items

| Item | Where | Disposition |
|---|---|---|
| Five deferred minors from task reviews | various | All triaged **LEAVE** by the whole-branch review, each with a reason stronger than "low risk" — see the ledger |
| Field-probe targeting | `test/verification-features.test.ts` | Completeness is enforced; per-probe quality is not. Remember when adding a field |
| Synthetic-only coverage for three primitives | parity fixtures | Unavoidable until a pack uses them; the fixtures are the mitigation |
| 21 fact types still unlabelled | `knowledge/csrd/fact-types.json` | Only referenced facts are gated. Labelling the rest is content work, not a blocker |

---

## 7. Next steps

1. **Merge B1b-i.**
2. **B1b-ii — the record**: `verification-result.json` schema, the signature ledger, derived status projection, derived staleness, the integrity check, the sign CLI, the review sheet, and the migration moving `ratification.status` from asserted to derived — which changes what `frontend/web/lib/pack.ts` reads.
3. **Carry the field-accounting question into B1b-ii's design.** The signature pins a set of hashes; ask early whether every field those hashes cover reaches the thing that verifies them.
4. `RENDERER_VERSION` is `1.1.0` and `renderedConditionSha256` will pin the English a reviewer read. B1b-ii should record both.
