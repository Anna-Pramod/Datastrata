# Checkpoint — pilot step 1: the record screen over a configured profile, each requirement's verification status as loaded, and the r5 dossier labelled by what it binds

Written on 2026-10-19 (UTC) by the session that made the recommendation of 2026-10-19T1943Z (shared notes, `2026-10-19T1943Z-pilot-path-recommendation.md`), in the candidate worktree `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (branch `feature/opus55-subscription-migration`, HEAD `e30c0c0`, the C/G commit). The user's instruction of the same evening: proceed with pilot step 1 — a real-profile dashboard and accurate evidence status, run locally for a screen-shared evaluation, prototype banner and national-review warnings kept — without starting the verification track, changing promotion policy, capturing, signing, installing, authenticating or deploying. Every time below is UTC.

- **Scope of this change.** `frontend/web` only: four new modules under `lib/`, one bundled synthetic profile document, four new test files, the dashboard page, the shell's topbar, the chart's caption and the README. **No module under `backend/engine/src/` changed**, no prompt, no corpus entry, no recorded transcript, no golden, no pack file (`grep -ri csrd backend/engine/src/` stays 7; `git status` shows nothing under `backend/` or `docs/` but this file). Nothing is committed by the session: the user runs every `git add` and `git commit`.
- **Where the evidence is.** The shared side-session notes folder `local_043075c1-dc26-44e4-b3a9-257ce611215c/2026-10-19T2015Z-pilot-step-1/`: `before/` (the four files as committed), `diffs/` (the tracked diff and copies of every new file), `logs/` (every run named below, red and green, the teeth outputs, the suite, the typecheck, the build check, the frozen-evidence checks), `scripts/` (the one-off oracle and the profile generator), `teeth-copies/`, `MANIFEST.sha256`. The frozen pilot evidence was verified read-only before and after (`logs/frozen-evidence-after.log`: XS 12/12 `35268592…`, XS2 14/14 `2e318748…`, XS3 7/7 `e2c458e3…`, XS4 16/16 `e435e42d…`, XS5 16/16 `cd70ae8a…`, P5 20/20 `1c85e586…` and 13/13 `f5b67dfa…`, launcher `602a4143…`, nothing newer than XS5's manifest).

## What was found

The dashboard assessed one company authored in TypeScript (`lib/sample.ts`) and could render no other; no surface showed a requirement's `derivedStatus`, although every determination carries it; the only model-produced verification record (r5, `CSRD-S-002` version 4) had no surface at all, and a surface that showed it beside the current version 5 text without saying so would imply a verification that has not happened. A pilot company's facts had no way in.

## What was decided

The user's bullets, applied as stated: a profile loaded from a server-side file path configured through the environment, validated, with a clear error when missing or invalid and never a silent substitution of Meridian; each fact's source and stated unknowns preserved and no company fact invented; each determination's actual verification status shown; the r5 dossier labelled explicitly as historical evidence for version 4 with its dispositions, never implying verification of version 5; the profile and its path kept out of public assets and browser-visible configuration; a clearly labelled synthetic profile for development. Decisions taken in implementation:

- *Unset means the synthetic document, by name; set means a file, or a refusal.* An unset variable renders the synthetic development profile, labelled synthetic in the topbar, the banner and the document's own `record.note`, with the banner saying no pilot profile is configured. A variable that is set — even blank — is an operator's intention to serve a file, so blank, unreadable, not-JSON and invalid all refuse. The sample is never a fallback.
- *The path is operator detail.* A refusal has two voices: `publicDetail` (the variable's name, the kind of failure, every problem by field) for the page, and `operatorDetail` (the path, the system error) for the server log. The test pairs the negative claim with its positive control (evidence standard, failure mode 7).
- *The synthetic document is the sample, transcribed by script.* `profiles/synthetic-meridian.json` was generated from the before-copy of `lib/sample.ts` by `scripts/generate-synthetic-profile.py` — 42 facts, 7 scope objects, the same context — and the retired sample's assessment was captured first (`logs/before-sample-assessment.json`) as the oracle the record test now holds the document to: 110 determinations, 6 / 60 / 44, no obligation, 16 next questions, draft content, and the S-014 result per entity.
- *Validation is strict and referential.* Beyond the shape (strict objects, every `FactValue` kind, `source`, `confirmed`, `asOf`, `reviewDue`), the loader refuses a fact type the pack does not know, a fact stated on a scope object of the wrong type, a dangling scope, parent, counterparty or subject reference, a duplicate statement, a value kind that does not fit the fact type, and an unknown key — all problems listed in one refusal. A compile-time assertion holds the schema to the engine's `Profile`, `AssessmentContext` and `FactValue`.
- *Status is read, never assumed.* The requirements table takes each row's `derivedStatus` and `statusReasons` from the pack as `lib/pack.ts` loaded it (the ledger projected through the freshness resolver). The page's draft banner follows `containsDraftContent`, and the national-review sentence follows the ratified-country-pack count.
- *The evidence notice is computed, not written.* `lib/evidence.ts` compares the r5 dossier's pinned `requirementInputSha256` (`fecc5050…`, version 4) with the current requirement's through the engine's own `requirementInputSha256` at request time, so the headline says "does not verify" for as long as that is true. The identifiers and counts are transcribed from the sealed record (`execution.json`, the result) and the committed checkpoint and dispositions, which the module names by path; the execution record is referred to by id and manifest digest, never by a filesystem path.
- *The page is dynamic.* `export const dynamic = 'force-dynamic'`: the file is read per request, nothing about a pilot company is baked into a build, and editing the profile and reloading is the evaluation loop. No cache.
- *Out of scope, deliberately.* The public free check's report (`CheckFlow`) shows no per-determination status: its payload is byte-pinned by two goldens, and adding a field is a reviewed golden rewrite. Its banner already says what the status is.

## What landed

| File | What |
| --- | --- |
| `frontend/web/lib/profile.ts` (new) | `PILOT_PROFILE_ENV`, the strict document schema, the referential checks, `ProfileConfigurationError` (`code`, `headline`, `problems`, `publicDetail`, `operatorDetail`), `parseProfileDocument`, `loadProfileDocument(env, deps)`. Pure. |
| `frontend/web/lib/record.ts` (new) | `resolvePilotRecord(env, deps)` (pure: select, validate, assess; a refusal becomes a value) and `pilotRecord()` (the production wiring: `process.env`, `readFileSync`, `csrdPack()`, the operator detail to `console.error`). `server-only`. |
| `frontend/web/lib/dashboard.ts` (new) | `entityColumns`, `requirementStatusRows`, `statusSummary`, `factRows`, `formatFactValue` — the view model, locale-independent formatting. |
| `frontend/web/lib/evidence.ts` (new) | `S002_R5_DOSSIER` (identifiers, trust tiers, counts, the twelve verdicts in eight dispositions A–H, not promoted, not signed, the records it rests on) and `historicalEvidenceNotice(dossier, pack)`. |
| `frontend/web/profiles/synthetic-meridian.json` (new) | The synthetic development profile, `record.kind: "synthetic"`, generated by script from the retired sample. |
| `frontend/web/app/dashboard/page.tsx` | Dynamic; a refusal state that prints the headline, every problem and the variable's name; the record label and banner from the document; the counts, chart and obligations as before over the configured record; a requirements table (status chip and reasons per requirement, result glyph per scope object); the stated facts with sources and standing; the verification-evidence card. |
| `frontend/web/components/app/Shell.tsx` | `Topbar` takes `label`; the hard-coded "Sample record" chip is gone. |
| `frontend/web/components/app/CrossSectionChart.tsx` | The caption no longer says "sample group". |
| `frontend/web/README.md` | The route row, the comparison table, and a "Pilot profile" section: the variable's three cases, the document shape, what the loader refuses, what the page shows, the local start. |
| `frontend/web/lib/sample.ts` | Removed; its before-copy is in the notes folder. |
| `frontend/web/test/pilot-profile.test.ts` (14), `pilot-record.test.ts` (3), `pilot-dashboard.test.ts` (7), `pilot-evidence.test.ts` (4) | 28 tests, each file red first against the absent module (`logs/red-pilot-profile.log`, `logs/red-record-dashboard-evidence.log`: "Cannot find module"), then green (`logs/green-*.log`). |

## Teeth checks

Each from a copy taken first and restored by hash (`teeth-copies/`), the mutation confirmed to have landed before the run; outputs verbatim in `logs/teeth-*.log`.

1. *A read failure silently renders the sample* — the `readFile` catch replaced by a return of the synthetic document: "expected a ProfileConfigurationError and none was thrown" (profile) and "expected true to be false" (record, `ok`).
2. *The browser-visible refusal prints the path* — `${path}` appended to the public headline: "expected 'The profile file named by DATASTRATA_…' not to contain 'secret-location'" and "… not to contain 'secret'".
3. *Every requirement shown as draft whatever the ledger says* — `status: requirement.derivedStatus` replaced by `status: 'draft'`: "expected 'draft' to be 'ratified'" (the fixture repository that signs CSRD-S-002).
4. *The r5 dossier shown as binding the current text* — `bindsCurrent` replaced by `true`: "expected true to be false".
5. *A transcription defect in the synthetic document* — Lyon's turnover range replaced by a number: "expected [ … ] to have a length of 16 but got 15" (next questions) and "expected '600,000,000 EUR' to be '400,000,000 – 600,000,000 EUR'".

After the last restoration the four files run green again (28 of 28).

## Checks

| Check | Result |
| --- | --- |
| Frontend suite | 12 files, 86 tests, green (`logs/frontend-suite.log`; 8 files / 58 tests before this change) |
| `tsc --noEmit` (frontend) | 0 (`logs/tsc-frontend.log`) |
| Engine | no file changed; suite not re-run by design; `grep -ri csrd backend/engine/src/` = 7 |
| Build and agreement check (`npm run test:standalone`) | Phase 1 (liveness, the real repository) passed with the change (`logs/test-standalone.log`): `next build` compiled, `/dashboard` is `ƒ (Dynamic)`, and `/api/check` answered from the isolated artifact. Phase 2 (agreement, a copied fixture repository) failed at `next build` with `EACCES: permission denied, mkdir '/private/var/folders/0c/Users'` while copying Next's own traced `pages/_app.js` and `_document.js`. The same failure occurs over the committed before-state (`logs/test-standalone-control-before-state-attempt-2.log`: phase 1 passed with `/dashboard` static, phase 2 the same error on the same files), so it is independent of this change: the harness copies the checkout with symlinks kept verbatim, this worktree's `node_modules` is an absolute symlink into `b1b-record`, and the tracer records that file as a path climbing above the temporary root (`../../…/Users/vivin/Documents/DataStrata/b1b-record/node_modules/next/dist/pages/_app.js` in the kept fixture's `_app.js.nft.json`). Phase 2 needs a checkout with its own `node_modules`, as CI has. The only network use was Next's build-time fetch of the layout's three Google fonts. |
| Frozen pilot evidence | identical before and after |
| The retired sample's assessment versus the synthetic document's | identical on every figure the record test holds (the oracle in `logs/before-sample-assessment.json`) |

Not run, by rule: `next dev`, `pipeline-live.agents.test.ts`, any live run. The session did not start the server; the user does, as the README says.

## Corrections (2026-10-19, 20:40Z–20:50Z), at the user's instruction

- **The loader boundary refuses more, each by field, before assessment; the engine unchanged.** A scope object that is its own parent; a parent chain that cycles (reported once per cycle, from its smallest member, with the chain written out); a range stated max to min; a date the calendar does not have — in `context.assessmentDate`, the financial year, `record.statedOn`, a fact's `asOf` and `reviewDue`, and a date-kind value; and a fact without a `source` or with a blank reference, since the record promises a source beside every fact. A stated unknown and an unconfirmed value still pass with their sources (controls).
- **Tests.** `test/pilot-profile-integrity.test.ts` (14: the negative cases beside valid controls), red first — 11 failing "expected a ProfileConfigurationError and none was thrown", the three controls passing; one control's count was wrong in the test and corrected — then green. The facts the earlier `pilot-profile.test.ts` pushes now carry sources, so each case isolates its own defect. No further mutation campaign, as instructed.
- **After the final edits:** frontend suite 13 files / 100 tests, `tsc --noEmit` 0 (`logs/frontend-suite-corrections.log`, `logs/tsc-frontend-corrections.log`).
- **Smoke check**, local, `next dev -H 127.0.0.1 -p 3100` started through the app's preview from `frontend/web`, over a clearly synthetic external profile ("Northwind Example Group (synthetic test data)", two entities, every fact sourced, one stated unknown) kept in the session scratchpad; the Google-font loader was served from a local mock so the server made no network fetch; the HTML of every state is in `logs/smoke/` with the server log excerpt. (1) The configured company rendered under the "Pilot record · evaluation" label with 9 applies, 18 does not apply, 11 requires judgment and 10 obligations, the DE entity's Article 19a row applying. (2) One fact edited in the file — the DE headcount 1500 → 800 — and reloaded: 4, 21, 13 and no obligation; the Article 19a row does not apply and the reporting-duty cell requires judgment. (3) Invalid JSON showed the refusal naming the variable and the parse error; an invalid document (a self-parenting entity, a reversed range) showed the two field-specific problems; neither page carried Meridian, the company's data or the path, and the server log carried the path with the operator detail. (4) The file restored, the company rendered again at 9, 18, 11 and 10. (5) The evidence card read "Historical evidence for version 4 … The pack now carries version 5 … and this record does not verify it" in every rendered state. The server was stopped afterwards.
- **README:** the local start names the working directory (`cd frontend/web`), binds to the loopback interface (`npm run dev -- -H 127.0.0.1 -p 3000`), opens `http://127.0.0.1:3000/dashboard`, and says the file is read per request and how the fonts behave offline.
- **Standalone phase 2** stays the documented baseline failure of this worktree's layout; it was not rerun, and the full standalone gate is not claimed to pass.

## Carried forward

- The pilot company and its profile document, authored by the user with each fact's source, placed outside the repository and named by `DATASTRATA_PILOT_PROFILE`.
- The public free check's report shows no per-determination status (a reviewed golden rewrite, if wanted).
- The recommendation's verification track is untouched: no capture, no promotion decision, no signing.
