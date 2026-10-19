# Checkpoint — the C/G composition: first application by route, exemptions per route, coverage of the undertaking and its subsidiaries, and the holding option never assumed

Written on 2026-10-20 (UTC) by the session that landed E, in the candidate worktree `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch `feature/opus55-subscription-migration`, HEAD `8844dd3`, the E commit). Plan: `docs/superpowers/plans/2026-10-19-cg-timing-and-exemption-composition.md`; design: `docs/superpowers/specs/2026-10-19-timing-and-exemption-composition-design.md`, whose §8 is the implementation record. Every time below is UTC.

- **Scope of this change.** The pack (`fact-types.json`, `questionnaire.json`, `requirements.json`, `obligation-templates.json`), the registry, the engine test tree, the two provenance goldens, the public checker (`lib/checker.ts`, `app/api/check/route.ts`, `components/marketing/CheckFlow.tsx`), the frontend tests, the design, the dispositions, the plan and this file. **No module under `backend/engine/src/` changed**, no prompt, no corpus entry, no recorded transcript, no migration golden. Nothing is committed by the session: the user runs every `git add` and `git commit`.
- **Where the evidence is.** The shared side-session notes folder `local_043075c1-dc26-44e4-b3a9-257ce611215c/2026-10-19T1830Z-cg-composition/`: `before/` (the goldens, `requirements.json` and the registry as committed), `diffs/` (both golden diffs, the full change diff), `logs/` (every run named below), `scripts/` (the authoring, pin, registry, measurement and teeth scripts), `MANIFEST.sha256`. The frozen pilot evidence was verified read-only before and after (`logs/frozen-evidence-after.log`: XS 12/12 `35268592…`, XS2 14/14 `2e318748…`, XS3 7/7 `e2c458e3…`, XS4 16/16 `e435e42d…`, XS5 16/16 `cd70ae8a…`, P5 20/20 `1c85e586…` and 13/13 `f5b67dfa…`, launcher `602a4143…`, nothing newer than XS5's manifest).

## What was found

The r5 author review's issues C and G, as the design states them (§0): the reporting duty had no first-application rule, so a FY2026 group above the new thresholds read as having a duty and a first-wave public-interest entity below them read as having none; and one single-entity inclusion fact removed both duties, although Articles 19a(9) and 29a(8) exempt only where the undertaking *and its subsidiary undertakings* are included. Measured before the change over the design's twelve rows (`logs/rows-before.log`): rows 1, 2, 7 and 8 exempt on the single-entity fact; rows 5 and 9 with no duty found; row 3 unresolved only because the measured profile leaves the national option open.

## What was decided

The user's resolutions of 2026-10-19 (the design's §6 decisions), verbatim in §8 of the design and in the plan's Global Constraints. Decisions taken in implementation, each explained in the design's §8: the Article 1(4) exclusion conjunct sits in the first-wave branch and is inherited on the 2027 branch (restating it above both counted an open question twice in the interview ranking); coverage is two facts, `parent.report_includes_entity` and `parent.report_includes_all_subsidiaries`; `CSRD-S-023` encodes the holding option's three stated conditions as a deferred bracket rather than a caution; `missingReason: missing_fact` on every new fact, as for E; S-005/S-006 at first tested coverage and not the Article 19a(9) disclosures; the independent review corrected that before the commit (see "Review corrections" below).

## What landed

**Requirements and registry.** Seven authored at version 1 and three re-authored at version 4, bound by the engine's own `requirementSha256` after the control reproduced the version-3 entries of S-005 (`be1b2c21…`), S-006 (`452921f8…`) and S-014 (`d9ced936…`), which stay in the registry verbatim (`logs/task0-registry-control.log`, `logs/task1-4-register.log`, `logs/task5-reregister-timing.log` — S-017/S-018's version-1 entries were replaced once, within this uncommitted change, when the exclusion conjunct moved):

| Id | Version | `requirementSha256` | `requirementInputSha256` |
| --- | --- | --- | --- |
| CSRD-S-005 | 4 | `80f65e2821b1d62720d5ec18aea765a03474b794c2858c9966acb4a6e730e816` (after the review corrections; `0059c951…` before them) | `bdf8bfe2…` |
| CSRD-S-006 | 4 | `06f25580783e82a38ff30d9bee32721810b1676e4b3aeda1a8fc2a9f8ef6e99e` (after the review corrections; `3847b133…` before them) | `c372d23a…` |
| CSRD-S-014 | 4 | `31780088e95f9317f56162b6e3e11a6ce59d10431fb42a66a3fc4e203915124f` | `e29c9ad4…` |
| CSRD-S-017 | 1 | `bd35944db37b885f19d9497bdd153e6e02a736863b1524f2ce17e9a704026c08` | `203552db…` |
| CSRD-S-018 | 1 | `0d87b7dc58d58e18ed119dc126bee46665647a0bdae87e325a1ef360cbc37fd7` | `e1dda349…` |
| CSRD-S-019 | 1 | `36327ccb4b21bee951c94dffe403a187c3a0e1f2566e559d70dbcdb488cd09f9` (after the review corrections; `e247b4cd…` before them) | `ce6e927e…` |
| CSRD-S-020 | 1 | `ca2df81b00ed80f33f5413fa88e9652cf6b2c3dfc743280fc54f2384dc0c8a68` | `833b5f87…` |
| CSRD-S-021 | 1 | `b79401519312cd0cc54effd55576fd883f754cf913020a9f98a1c91f0d405284` | `99d69e2c…` |
| CSRD-S-022 | 1 | `a831df724f3dcf1dad830ad4afdde4bd20af6f0e484a72253e2d5be892613916` | `b886071f…` |
| CSRD-S-023 | 1 | `7d23b54010495ce953cf44f9ef6590414a9b7c9adee8116144944e9f37ca85a5` | `80e8cc99…` |

S-001 (v4, input `340cf514…`) and S-002 (v5, input `93ad5a91…`) are untouched, so the r1–r5 S-002 records and the six S-001 recordings keep their bindings (recordings' digests unchanged, `logs/task8-invariants.log`).

**Facts, questions, obligations.** Eight stated boolean facts and seven questions as the design's §8 lists them, plus the two facts and two questions of the review corrections; `O-010` also on S-022, `O-011` also on S-019. The pack holds 23 requirements, 48 questions and 57 fact types.

**Tests.** `test/knowledge-timing-and-exemption-composition.test.ts` (new, 58 tests): the facts, the question gates, each new requirement as authored, S-005/S-006 version 4, the twelve counterexample rows plus row 2b, S-023's four outcomes, the registry. Red first against the unchanged pack: 55 of 57 failing, every failure naming a missing requirement, fact or version (`logs/task1-4-red-unedited-pack.log`). The existing pins re-specified, each after its own red (`logs/task5-red-pins.log`, 27 failures across twelve files): `knowledge-scope-vs-timing` (the composition per route, S-003 in none), `knowledge-integrity` (23/46/≥55), `min-status` (the version table; the historical digest table covers the sixteen pre-migration requirements by name; the seven have version 1 alone), `pipeline-source-completeness` (23; `EXPECTED_SOURCES` = the audit's sixteen plus `POST_AUDIT_SOURCES`, the seven from the design; the reachable partition 21/2), `verification-features`, `pipeline-reader`, `corpus-src002-ingestion` (the SRC-002 population: S-003, S-004 and the five that cite Article 5(2)), `corpus-src005-ingestion`, `loader-freshness`, both status-truth boundaries (the fixture ledgers sign all 23), `cli-review-sheet` (draft 21 of 23; 19 unsigned), `golden-profiles` (P-003 states the holding status), `knowledge-article-1-4-exclusion` (its consolidated fixture states it too).

**Teeth checks** (`logs/teeth-1-4.log`, `logs/teeth-2-4-rerun.log`, `logs/teeth-6-checker.log`, `logs/teeth-6-checker-rerun.log`), each from a copy taken first and restored by hash, the mutation confirmed to have landed before the run:

1. *A question shown to an entity it cannot concern* — Q-045's gate set to `always`: "expected [ 'Q-012', 'Q-011', … ] to not include 'Q-045'".
2. *A FY2026 non-first-wave group above the new thresholds read as already in* — the 2027 date deleted from S-018's second route and the mutant re-registered: row 3 "expected 'APPLIES' to be 'DOES_NOT_APPLY'". The first attempt had addressed the pre-move condition shape, so the pack was unmutated and its green proved nothing; recorded and rerun.
3. *Inclusion of the parent alone treated as Article 29a(8) coverage* — the coverage conjunct deleted from S-019: row 1 "expected 'APPLIES' to be 'DOES_NOT_APPLY'".
4. *An individual exemption extinguishing the consolidated duty* — S-005 added to S-021's negated ANY: row 2b "expected 'DOES_NOT_APPLY' to be 'APPLIES'". The first target, row 8, could not detect it (there S-005 is itself refused), which is how row 2b was found and added.
5. *The public checker ignoring the holding answer* — "no": "expected 'INDETERMINATE' to be 'APPLIES'"; "yes": "expected [ …(3) ] to not include 'entity.is_financial_holding_undertaking'" (after the "yes" case gained that assertion; before it, an ALL that lists every open conjunct let the mutant pass). *A silent "not a holding" default* — absent: "expected 'APPLIES' to be 'INDETERMINATE'".

**The two provenance goldens**, rewritten once as a reviewed change by the one-off scripts of the E landing (`scripts/write-provenance-*-golden.mts`, outside the repository), the expected diff stated before generating and the installed diffs byte-identical to the reviewed ones (`logs/task7-generate.log`, `diffs/`):

- *Engine* (`2b2a0e00…` of E → `b552cdf5…`; 7 hunks, +855/−12): seven determinations appended after the historical eleven for `e1` in id order — S-017 APPLIES, S-018, S-019 DOES_NOT_APPLY, S-020 APPLIES, S-021, S-022, S-023 DOES_NOT_APPLY, none with needs; S-005's and S-006's traces gain the coverage ANY (APPLIES through `is_parent_undertaking = false`); S-014's trace becomes `any of 2` over S-020 APPLIES and S-021 DOES_NOT_APPLY, result APPLIES as before, and its caution now names S-017/S-018. `changeWatch`, `context`, `gaps`, `nextQuestions`, `obligations`, `summary`, `containsDraftContent` identical, checked field by field.
- *Public* (`3e418c6a…` → `6b348cb1…`; 3 hunks, +172/−3): the same seven appended; counts applies 4 → 6, doesNotApply 6 → 11, indeterminate 3; headline, obligations, gaps, nextQuestions identical; S-014's caution moved.

The transition layer of both golden tests is re-specified as a partition: the historical determinations are a prefix in order, the seven follow; outside the determinations everything is identical, except the public counts, whose delta is asserted as exactly the seven. The source oracle runs over `EXPECTED_SOURCES`; the audited table and its arithmetic are untouched. Both migration goldens keep their digests (`33f3addd…`, `7bcdb241…`).

**The public checker.** `holding?: 'yes' | 'no' | 'unknown'` for a parent, stated as `entity.is_financial_holding_undertaking` for yes/no and as nothing otherwise; a step after the group position, shown only to a parent, nothing preselected; `FACT_COPY` for the eight facts, each saying the answer is what is missing. Four new cases in `check-response.test.ts`.

## Review corrections (2026-10-20, before the commit)

An independent review found two bounded defects in the exemption encodings (design §8.1); the timing and separate-duty work stayed as landed.

1. **The disclosures condition.** Article 19a(9), second subparagraph, point (a), makes the disclosures a condition of the subsidiary exemption, as Article 29a(8) does for the consolidated one, and both paragraphs add in the local text that an undertaking exempted from preparing a management report under Article 37 need not carry them *provided it publishes the consolidated management report in accordance with Article 37*. `S-005`, `S-006` and `S-019` carry `ANY(entity.exemption_disclosures_in_management_report = true, entity.article_37_exempt_publishing_consolidated_report = true)`: the Article 37 alternative is a stated fact, asked (`Q-048`) only once the disclosures are stated as not made, never inferred from the absence of a management report; `Q-044` is offered to every included subsidiary. The former row 2b was the artefact of the omission; rows 2b and 2c now state that neither exemption stands without the disclosures or the alternative, and that both stand with the alternative stated; row 5b carries the composition's independence (the individual derogation never relieves the consolidated duty).
2. **The reporting parent's country.** `parent.reporting_parent_country` (organization, country, `missing_fact`, `Q-047`) replaces `group.ultimate_parent_country` in `S-005`, `S-006`, `S-019` and `Q-016`'s gate; `S-007`, `Q-006` and the public checker's non-EU route keep the ultimate parent. Nothing infers one from the other: both mixed directions and the unknown country are tested, and `S-007` is shown still to turn on the ultimate parent.

Red first (`logs/review-red.log`): 18 of 71 failing, each naming a missing fact, question or conjunct. Green (`logs/review-focused.log`): the composition file 71/71 and seven neighbouring files. The registry entries of `S-005`, `S-006` and `S-019` were replaced in place (`logs/review-register.log`): they were created inside this uncommitted change, so no committed version is rewritten and the versions stay at 4, 4 and 1. P-004 states the reporting parent's country and the disclosures.

Teeth (`logs/teeth-review.log`), each from a copy restored by hash with the mutation confirmed: 6. *the individual exemption granted without the disclosures or the stated alternative* — the ANY deleted from S-005: "expected 'APPLIES' to be 'DOES_NOT_APPLY'"; 7. *the ultimate parent's country read as the reporting parent's* — S-005 reverted to `group.ultimate_parent_country`: the EU-reporting-below-US-ultimate case "expected 'DOES_NOT_APPLY' to be 'APPLIES'"; 4 (retargeted). *an individual exemption extinguishing the consolidated duty* — S-004 added to S-021's negated ANY: row 5b "expected 'DOES_NOT_APPLY' to be 'APPLIES'".

The engine golden was rewritten once more (`7a9cd1ad…`; `diffs/provenance-engine-golden.review.diff`, 10 hunks): only the traces of S-005, S-006 and S-019 move — the reporting parent's country in place of the ultimate parent's, the disclosures ANY — and S-019's caution; nothing else, checked field by field. The public golden moved by that one caution (`74e78270ba47099dd3d14bc0f601d10a319caa123647362df105241827993cfe`; `diffs/provenance-public-golden.review.diff`, one hunk), contrary to the expectation stated before generating, which had overlooked that the public surface carries the caution; the twelve rows measure identically with the reporting parent stated (`logs/rows-after-review.log`).

## Checks

| Check | Result |
| --- | --- |
| Engine default suite | 84 files, 3308 tests, green after the review corrections (`logs/review-engine-suite.log`; 3295 before them, `logs/task8-engine-suite-final.log`) |
| Frontend suite | 8 files, 58 tests, green (`logs/review-frontend-suite.log`) |
| `tsc --noEmit` | engine 0, frontend 0 |
| `grep -ri csrd backend/engine/src/` | 7 |
| The six S-001 recordings and `PROVENANCE.md`; both migration goldens | digests unchanged |
| The rows after (`logs/rows-after.log`) | the design's §8 table |
| Frozen pilot evidence | identical before and after |

Not run, by rule: `pipeline-live.agents.test.ts`, `next dev`, `next build`, the standalone harness.

## Carried forward

- The open source questions of the design's §8: Article 1(3) as amended and the first-wave route for credit institutions and insurers below the new thresholds; Article 3(10) and the stated size category; the Article 29a(8) language option and the Article 29a(7a) national implementation behind S-013. (The Article 19a(9) disclosures and the reporting parent's country were resolved by the review corrections.)
- A future S-002 capture package binds to version 5 under the current `@3` identity; none was built, and nothing here changes S-002.
- The residual of ALL semantics (every open conjunct listed in `needs`) is noted, not changed: an engine change was outside this scope.
