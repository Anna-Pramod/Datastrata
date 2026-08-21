# What counts as test evidence

**Status:** Standing engineering standard. Every implementation plan in this
project references this file from its Global Constraints, and every task's
teeth check is judged against it.

Derived from B1a, B1b-i, B1b-ii-a and B1b-ii-b. It is not theory: every rule
below is here because a specific check in this repository passed while proving
nothing, and the incident is named.

---

## The rule, in two halves

**A green check is not evidence unless you know it can fail against the defect
it claims to detect.**

**A red check is not evidence either, until you have read the failure message
and confirmed it names the assertion you intended.**

The second half is the one this project keeps relearning. Coverage says the
line ran. It does not say the line decided anything.

---

## Six ways a test passes while proving nothing

Each has happened here. When writing or reviewing a test, check it against
this list.

### 1. The check reproduces the mechanism it is checking

A checker built from the same model as the thing checked will agree with the
thing's systematic errors. **B1b-i:** the renderer and its feature checker
agreed about every variant they knew, and `in_catalogue.missReason` escaped
both. Exhaustiveness over *variants* did not close it; only deriving the field
list from the runtime schema did.

*Counter-measure:* make the two derivations independent, or derive the
obligation list from something neither party authored.

### 2. The mutation kills the test for the wrong reason

**B1b-ii-b Task 2:** the plan's own teeth check said "change a threshold,
confirm both goldens fail". Both did fail — with `VersionIntegrityError` at
`loadPack`, before either compared a single field. Every unrelated test failed
too. "The test went red" was satisfied by a failure with nothing to do with the
property.

The reviewer then made the same mistake mutating `sign.ts`, got a `TypeError`,
and reddened five tests while proving nothing.

*Counter-measure:* read the failure message. If it does not name your
assertion, your mutation is wrong, not your code.

### 3. No test was ever observed failing

**B1b-ii-b Task 3:** every test passed on the first implementation run, so not
one had been seen failing against a wrong implementation. A mutant per property
was run; one escaped — `isPromoted` replaced by `startsWith` was caught by
nothing, because no fixture used versions where one is a prefix of another.

*Counter-measure:* if a test never failed, you do not know what it tests. Write
it first, or mutate afterwards.

### 4. Conjuncts mask one another

**B1b-ii-b Task 4:** the post-write check asserted three things together.
Mutating away the freshness conjunct left the suite green; so did mutating away
the status conjunct — through the normal caller each fully covered the other.
A third was *unreachable* through that caller at all, and a fourth was a
tautology.

*Counter-measure:* where several conditions are asserted together, call the
predicate **directly** with inputs the natural caller cannot produce, and check
each conjunct can fail alone.

### 5. The assertion is satisfied unconditionally

**B1b-ii-b Task 5:** "the output contains X" passes against a generator that
emits X for every input regardless of state. A review sheet is especially prone
to it.

*Counter-measure:* pair every positive claim with a counterexample **in the
same output** — the requirement that must *not* carry the note, the count that
must differ. Then mutate to prove each can fail.

### 6. The guarantee is stated but unenforced

**B1b-ii-b Task 6:** the spec said an asserted `ratification` left in the data
"becomes a load error". It did not. The schema strips unknown keys, so a
leftover was invisible even to the content hash — the same digest with or
without it. **B1b-ii-b Task 3:** the spec said the schema enforces that
`absence` may never be the sole evidence; the rule existed but the signing path
never called it.

*Counter-measure:* a property nothing checks is a comment. Grep the spec for
"enforces", "must", "cannot" and confirm each has a test that fails when
violated.

---

## Obligations this places on a plan

- **Every task carries a teeth check** naming the defect it must detect, and
  requiring the output be recorded verbatim.
- **The plan's own teeth checks are suspect.** Two in B1b-ii-b were defective
  as written and had to be corrected during execution. A plan author cannot
  verify a check without running it.
- **Prefer specifying behaviour over reference code.** B1a's plan supplied full
  implementations and eight defects were found *in the plan's code*, with zero
  transcription errors by implementers. Plans since specify interfaces and
  behaviours; the defects that remain are in specification, which reviews catch
  more cheaply.
- **State the baseline as the previous task's finishing count**, never a fixed
  number — a stale baseline makes an agent stop on a false alarm.

## Obligations this places on a reviewer

- **Re-run every teeth check yourself.** Do not accept it from a report. Three
  times in B1b-ii-b the reviewer's own reproduction found something the report
  had not.
- **Verify claims that correct you.** Twice a subagent reported that a briefing
  premise was wrong — a stale `git checkout` hazard, and a `String(version)`
  failure mode that cannot occur in JavaScript. Both were right.
- **Restore mutations from a copy taken first**, never `git checkout`, and
  confirm restoration by hash rather than by assumption.
