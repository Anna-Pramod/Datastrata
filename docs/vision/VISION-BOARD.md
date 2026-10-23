# DataStrata vision board, version 1

> **Version 1, approved by you on 2026-10-23, with `VISION.md`.** The approval covers the vision only; rows marked Suggested still need your approval one by one, and PROVISIONAL designs stay open. The numbered register of every capability DataStrata has planned, accepted or been asked for, with an explicit disposition for each. It belongs to [`VISION.md`](VISION.md), whose change-control rule governs it: a new item enters as **Suggested** and is planned only after you approve it; every plan and task cites these IDs.
> Rows describe intended behaviour; only rows marked **Built** exist today. Draft 3: aligned with your corrections of 2026-10-23 (later phases committed, direct registration, AI on your MacBook, two people, confidence a required deliverable), after draft 2's revision for Codex's second review.
> Written 2026-10-23 against the candidate at `e7fc141`. Uncommitted: you commit it.

## How to read a row

| Column | Meaning |
|---|---|
| **ID** | Stable identifier. Plans and tasks cite it. IDs are never reused. |
| **Disposition** | **Retained** (kept as planned) · **Retained, modified** (kept, with the change named) · **Restored** (in the July plans, silently dropped since, now back) · **Added** (from your direction of 2026-10-23, or from Codex's review) · **Suggested** (my proposal; needs your approval) · **Superseded** (replaced by the named item) · **Excluded** (deliberately not built) |
| **Target** | **Core**: committed; part of the complete CSRD product. **Later phase**: committed; part of the wider destination, delivered after the CSRD product in the order the build plan sets, never conditional on customer demand unless you approve that (choice 5b). **If approved**: a suggestion, built only if you approve it. Excluded and superseded items are listed apart. Phases are set by the build plan, not here. |
| **Built?** | Implementation status only: **Built** (the intended workflow works end to end for its stated scope), **Partial** (some pieces exist, the workflow does not run end to end), **Not built**. |
| **Verification evidence** | What independently shows the status, kept apart from it. "Recorded" means a past run, not re-run for this board. "None" means no evidence beyond reading the code. |
| **Source** | Where the item comes from (codes as in `VISION.md`). |
| **End-to-end acceptance** | The observable result that closes the item. Each build task adds its own teeth check under `docs/superpowers/TEST-EVIDENCE-STANDARD.md`. |

Statuses are taken from the read-only audit of 2026-10-22 (AUDIT §2) unless stated. Evidence counts were recorded on 2026-10-22 and were not re-run for this board.

---

## PUB — Public site

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| PUB-1 | Landing page whose claims the record backs | Retained | Core | Built | Stage 1a: 69 mutation checks (CHECKPOINT-stage-1a) | ORIGINAL; APPROVED Stage 1a | Every figure on the page is read from the pack, ledger or register at build; removing a fact from the record removes the claim on the next build |
| PUB-2 | About page: who stands behind DataStrata | Retained | Core | Partial | None ("to be published" placeholders) | ORIGINAL; AUDIT §2.1 | Names and biographies you approved are shown; no placeholder text remains anywhere on the site |
| PUB-3 | Contact form that reaches a person | Retained, modified: delivered by the chosen email provider instead of a webhook | Core | Partial | Not verified (never configured; the smoke run got 503) | AUDIT §2.1 | A message sent from the site reaches the support mailbox within 5 minutes and is stored; a failed delivery shows the sender an honest error |
| PUB-4 | Legal pages: imprint, privacy policy, terms, cookie notice | Retained | Core | Not built | None | AUDIT §2.6; PROP | The pages exist, are linked from every page, name the controller and every processor, and carry your approval |
| PUB-5 | Pricing and plans page | Retained, pending your pricing decision | Core | Not built | None | ORIGINAL (P1, POL tiers); PROP §9.3 | Shows only plans you have decided; until then the page says pricing is by conversation |
| PUB-6 | Published analyses of rule changes ("what changed in CSRD"), the trust and distribution channel | Restored | Core | Not built | None | ORIGINAL P1 §10 | Lists every published change with date, sources and status; never shows draft or unpublished content; each analysis names who approved it |
| PUB-7 | Public status page for the knowledge: monitoring health and the change-to-briefing time | Restored | Core, late | Not built | None | ORIGINAL P2 §8 ("the trust equivalent of a status page") | Shows, per package, the last successful check and the median time from a legal change to its briefing, computed from the records |

## CHK — Free checker and registration

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| CHK-1 | Optional free checker: questions refined by the questionnaire research; ranges and "I'm not sure" | Retained, modified: questions revised after research | Core | Partial: 9 questions (10 for a parent), hard-coded, CSRD only, 20 of 23 requirements | Goldens and smoke 116/116 (recorded 2026-10-22) | ORIGINAL; U23 | Every question maps to pack fact types; every answer path, including every "I'm not sure", yields a result with no silent "does not apply"; goldens cover each threshold straddle |
| CHK-2 | Everything the check computes is shown or deliberately not sent | Retained, modified | Core | Partial: gaps, cautions and evidence expectations are sent to the browser and never shown | None | AUDIT §2.1; U23 | A test lists every field `/api/check` returns and fails if a field is neither rendered nor removed |
| CHK-3 | Headline answer on screen at once, labelled preliminary and draft | Retained, modified (choice 3) | Core | Partial | None | ORIGINAL "never start empty"; U23 | The on-screen headline and the full result opened from the emailed link come from the same stored run and agree |
| CHK-4 | Email gate: the full cited result is sent as a link | Added | Core | Not built | None | U23 | Entering an email sends one link within 5 minutes; the link opens the saved result and works for 7 days or until registration; an address that already has an account is asked to sign in instead; repeat requests are rate-limited; the address receives nothing else unless it registers |
| CHK-5 | Self-registration from the link; the checker answers seed the profile | Added; changes PROP §9.3 (self-serve "not before Stage 5") | Core | Not built | None | U23 | Registering from the link creates exactly one workspace whose profile holds the answers as preliminary facts sourced "free checker, date"; Home shows the preliminary universe at once |
| CHK-6 | Newsletter opt-in: separate, unticked, double opt-in, consent records | Added | Core | Not built | None | U23; PROVISIONAL (research R4) | No newsletter is sent before the confirmation link is used; the record holds the wording, time and origin; one-click unsubscribe is honoured |
| CHK-7 | Abuse protection for the check and the email gate | Retained, modified: body limits exist; hosted rate limits added | Core | Partial | B2 body limits accepted (2026-10-22) | APPROVED B2–B6; PROPOSED | Per-address and per-email limits hold under a scripted burst; the gate cannot be used to send volumes of mail to third parties |
| CHK-8 | Checker answers and later corrections kept in structured form (the "data flywheel"), within the retention policy | Retained | Core | Not built (nothing is stored) | None | ORIGINAL P1 (data flywheel) | Every completed check is stored as structured answers with its run; stored answers are deleted or anonymised on the schedule PRV-1 sets |
| CHK-9 | Direct registration without the checker, leading to guided onboarding | Added (your alignment of 2026-10-23) | Core | Not built | None | U23 | A visitor can register with an email address and a password, verify the address, and reach guided onboarding and a first preliminary answer without using the checker |

## ACC — Accounts and access

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| ACC-1 | Customer accounts: verified email, password (argon2id), opaque server-side sessions | Retained | Core | Not built | None | APPROVED PROP §6.1; AUTH | Sign-up, sign-in, sign-out, password reset and revocation work end to end; a revoked session is refused on its next request |
| ACC-2 | Customer roles (owner, executive, lead, contributor, viewer) enforced on the server | Retained, modified: the executive role restored from UX §2 | Core | Not built | None | ORIGINAL UX §2; APPROVED BRIEF §2 | Each role can do exactly its listed actions; only an owner or a lead can confirm a fact; every other action returns 403 and is logged; a role-by-action test matrix exists |
| ACC-3 | Invitations and entity-level access | Retained | Core | Not built | None | ORIGINAL; APPROVED | An owner invites a user to named entities; the user sees only those entities' records |
| ACC-4 | Two-factor codes (TOTP): mandatory for staff; for customer owners per choice 3 | Retained, modified (choice 3) | Core | Not built | None | APPROVED PROP §6.1 | Staff cannot reach any staff page without TOTP; the customer-owner rule chosen in choice 3 is enforced at the point it names |
| ACC-5 | Staff accounts: invitation-only, separate sign-in address, eight permissions | Added (U23 separate logins); operator, reviewer, publisher and support from PROP; approver, signer, ratifier and administrator PROPOSED | Core | Not built | None | U23; APPROVED PROP §2, §6 | A staff account cannot sign in at the customer address and vice versa; each permission gates its actions; each of the two people may hold every permission except Ratify, which needs a professional legal expert; nobody publishes a revision they approved |
| ACC-6 | Recovery and revocation: customers by email plus recovery code; staff by recovery codes plus break-glass | Retained, modified (choice 2) | Core | Not built | None | APPROVED PROP §6.3 | Each person can recover the other through the recorded two-person procedure; the break-glass, for when both are locked out, runs through a recovery-only database role that cannot read company data and notifies both out of band; every recovery is audited; no self-service link recovers a staff account |
| ACC-7 | Support access: time-boxed, granted by the owner or taken as break-glass with a mandatory reason, audited, visible to the customer | Retained | Core | Not built | None | APPROVED BRIEF §2; PROP §2, §6.4 | Support can read a company's data only inside an active grant; the customer sees the grant and its log while it is active; access ends at expiry |
| ACC-8 | Demo workspace with a demo login and synthetic data | Added | Core | Not built | None | MSG ("demo login credentials") | The demo login opens only synthetic data, cannot reach real workspaces, and its credentials can be rotated by you |
| ACC-9 | Pilot access gate (shared passphrase) | Superseded by ACC-1 when accounts exist; unchanged until then (its deferred key-derivation hardening becomes moot) | Core | Built | Gate demonstrations PASS 3/3 and 12/12 (2026-10-21); repeated on Next.js 15.5.28 (2026-10-22) | APPROVED Stage 1a | Removed in the same release that turns on individual accounts; no route still accepts the passphrase afterwards |
| ACC-10 | The authentication approach (custom, or a maintained library) re-decided with self-registration and email links in scope | Retained, modified: the note's decision 1 is still open, and self-serve sign-up is one of its re-open conditions | Core | Not built (note written and accepted) | AUTH, committed `7bfed16` | APPROVED AUTH; U23 | A short addendum to the authentication note records the choice with this journey in scope, before any account code is written |

## PRF — Company profile and intake

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| PRF-1 | Persistent, versioned company profile, editable, with history | Retained | Core | Partial: one read-only JSON file per server | None for persistence | ORIGINAL; APPROVED | A confirmed change creates a new profile version and a new run; the old version and run stay visible |
| PRF-2 | Choice of profile method: upload from a suggested list of public documents, link, or manual entry | Retained | Core | Not built (prototype only) | None | ORIGINAL P2 C0 ("give them suggested list") | A customer can complete a profile by each of the three methods; the upload step lists the documents that would settle its open facts |
| PRF-3 | Group structure: entities, parent, subsidiaries, branches, reporting perimeter | Retained | Core | Partial: the file format holds entities; no editing | Engine goldens (recorded) | ORIGINAL | A group of at least 6 entities can be entered and edited; each entity gets its own results |
| PRF-4 | Document upload with AI extraction; the customer confirms each fact | Restored | Core | Not built | None | ORIGINAL P2 C0; AUDIT §4.4 | Candidates from an uploaded annual report show page and passage; none reaches the engine until the customer confirms it; a confirmed fact cites the document and page; extraction runs on your MacBook (Qwen after its evaluation) |
| PRF-5 | Ranges first, exact values near thresholds | Retained | Core | Partial: the engine handles ranges; the check uses them | Engine tests (recorded) | ORIGINAL P2 C1 | A range straddling a threshold yields "cannot decide yet" and asks for the exact value; a range clear of it decides |
| PRF-6 | Guided interview: one question at a time, ranked, with "I don't know" | Retained | Core | Partial: ranking exists; no answer-and-re-rank loop | Engine tests (recorded) | ORIGINAL | Each answer re-runs the engine and re-ranks; "I don't know" is recorded and never treated as no |
| PRF-7 | Fact sources and confirmation trail | Retained | Core | Not built | None | ORIGINAL | Every confirmed fact shows its source, who confirmed it and when |
| PRF-8 | Yearly refresh reminders and review queue | Restored | Core | Not built | None | ORIGINAL P2 C2; AUDIT §4.4 | In the chosen month the customer is reminded, uploads the new report, and receives extracted candidates to confirm |
| PRF-9 | Reporting periods (financial years) as first-class records | Retained | Core | Not built | None | APPROVED PROP §11 | Each result, obligation and run belongs to a period; closing a period never removes it from impact analysis |
| PRF-10 | "Something changed in our business" | Retained | Core | Not built (prototype only) | None | ORIGINAL UX flow C | The customer records an actual change, sees the provisional difference, confirms it, and a new run is added without overwriting history |
| PRF-11 | Profile validation, reused for customer editing: duplicate facts, duplicate scope objects, missing parents and parent cycles refused | Retained, modified: the existing validator is reused | Core | Partial: the web loader already refuses all four for file profiles (`frontend/web/lib/profile.ts:209-282`); the engine itself does not; customer editing does not exist yet | `frontend/web/test/pilot-profile.test.ts` (recorded suite, not re-run) | Existing code; AUDIT §2.5; CODEX | Every profile edit passes through the same validator, which names the problem by field; a test proves an edit creating a duplicate or a cycle is refused |
| PRF-12 | Full intake refined from the questionnaire research: new fact types, ranges, "I don't know" handling | Added | Core | Not built (research pending) | None | U23 | Every new fact type is used by at least one active rule or compliance workflow and states that purpose to the customer (law 16), has a missing-reason, and is covered by a golden profile |
| PRF-13 | Automatic collection of a company's published reports from its public pages | Retained | Core | Not built | None | ORIGINAL (Braindump: "can even be automatically collected"); P2 C0 | Given the company's website, a separate, company-scoped fetcher (never the scanning worker, which is limited to register hosts and has no company data) finds and stores its latest annual report with source and date; extraction still needs the AI setting and the customer's confirmation |
| PRF-14 | Onboarding needs no integration and no IT project | Retained (a constraint) | Core | Built for the check | None | ORIGINAL P2 phase 1 ("Onboarding is integration-free") | A company reaches its first answer with nothing but a browser and its public documents |
| PRF-15 | Threshold-critical facts are confirmed one at a time, never in bulk | Retained | Core | Not built | None | ORIGINAL UX phase 1 ("Threshold-critical facts cannot be bulk-confirmed") | The bulk-confirm action is unavailable for any fact near a legal threshold; each such fact is confirmed with its source |

## APP — Applicability and explanation

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| APP-1 | Deterministic, three-valued, cited engine (plus "missing fact") | Retained | Core | Built | 3,310 engine tests in 84 files (recorded 2026-10-22); goldens P-001 to P-010 | ORIGINAL; E/CLAUDE.md | Goldens stay green; a new pack needs no program-specific engine code |
| APP-2 | "Why?" drawer: facts, condition, sources, versions, sign-offs | Retained | Core | Not built: traces are computed, never shown | None | ORIGINAL UX §3 | Every result opens a drawer whose facts and sources match the stored run exactly |
| APP-3 | Content status (the four dimensions, never merged) and answer tier shown with every result | Retained, modified: extended from requirements to every result | Core | Partial: Stage 1a public status words on requirements | Stage 1a checks (recorded) | ORIGINAL UX §8; APPROVED PROP §1.2, Stage 1a | No result renders without the status of the rules behind it; draft content always carries the draft label; no surface merges the four dimensions into one word |
| APP-4 | Results list with tabs and filters, with correct state labels | Retained | Core | Partial: grid and status table; missing facts mislabelled "requires judgment" (W/app/dashboard/page.tsx:67) | None | ORIGINAL | Four states shown in words and shapes; a missing fact is never labelled "requires judgment"; filters by entity, regulation, period and state |
| APP-5 | Regulatory Universe Map (secondary view), with a customisable export | Restored | Core | Not built | None | ORIGINAL P2 C3 ("modeled like a transformation map") | The map and the list show the same results for the same run; every node opens its cited detail; the export (PDF, PNG, CSV) carries a watermark and the list of sources |
| APP-6 | Negative results first-class and exportable | Retained | Core | Partial | None | ORIGINAL UX §3 | "Does not apply" results appear with their reasons and in exports |
| APP-7 | Every engine output has a place: gaps, next questions, missing-fact needs, cautions, traces, obligation details, pending law, national-law gate | Added | Core | Partial | None | U23; AUDIT §3.8 | A test enumerates the engine's output fields and fails if one has no surface |
| APP-8 | Stored, immutable runs with input hash and pack revision | Retained | Core | Not built: results are discarded; `packVersion` has never moved from 0.1.0 | None | ORIGINAL; APPROVED PROP | The same inputs and pack revision reproduce the same stored run; old runs stay readable after a new pack is published |
| APP-9 | Organised by program: every screen groups by regulation, and voluntary programs can join later | Retained | Core | Partial: the grid lists regimes | None | ORIGINAL P1 H4; P2 §3 | Every list and filter can group by program; adding a second pack adds a group without screen changes |
| APP-10 | Applicability run screen: what is being run, over what, and the summary when done | Retained | Core | Not built | None | ORIGINAL UX phase 2 | A run shows its scope, pack revision and date before it starts, and its counts by state when it ends |
| APP-11 | A coded reason for every unresolved result (missing fact, straddling range, unresolved upstream, needs judgment, national-law gate) | Retained | Core | Partial: the engine records reasons; the screens mislabel them | Engine tests (recorded) | ORIGINAL P3 §7.3 | Every "cannot decide yet" shows its coded reason and the next step that would settle it |
| APP-12 | Direct scope separate from value-chain exposure, with the right to decline requests above the statutory cap; help for suppliers receiving CSRD requests | Retained | Core | Partial: the pack holds the value-chain questions; nothing shows them | Engine goldens (recorded) | ORIGINAL P3 §5.3, §6 | A company outside direct scope sees its value-chain position and which requested items exceed the cap; "does not apply" never implies "no one will ask you" |
| APP-13 | Regulatory Library: browse everything DataStrata covers, beyond the company's own scope | Retained | Core | Not built | None | ORIGINAL P2 §8 layer 6 | Every requirement in every published pack can be browsed with its sources and content status |
| APP-14 | Confirm or contest a borderline result | Retained | Core | Not built | None | ORIGINAL P2 phase 2 | Contesting a result opens a case with the result attached; confirming is recorded with name and date |

## OBL — Obligations, gaps and work

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| OBL-1 | Obligation register: all obligations, per entity and period | Retained | Core | Partial: first six, then "+N more" | None | ORIGINAL; APPROVED PROP §5 | Every instantiated obligation is listed and filterable; a re-run of the same period creates no duplicate; a new period inherits nothing completed |
| OBL-2 | Obligation detail: basis, triggering facts, period, deadline logic, evidence expectations, owner role, open questions | Retained | Core | Not built | None | ORIGINAL | Each field matches the engine's obligation record for that run |
| OBL-3 | Owners and assignment: one named person per item, not a team | Retained | Core | Not built | None | ORIGINAL P2 ("a person, not a team") | Each obligation and task has exactly one named owner; reassignment is recorded |
| OBL-4 | Baseline: credit for existing work | Retained | Core | Not built | None | ORIGINAL P2c §3 | Confirmed readiness facts mark the work already done; the gap ledger excludes it |
| OBL-5 | Gap ledger | Retained | Core | Partial: computed by the engine, never shown | Engine tests (recorded) | ORIGINAL | Gaps derived from confirmed readiness facts are listed with their obligations |
| OBL-6 | Exposure: what happens if we do nothing | Retained | Core | Not built | None | ORIGINAL | Each gap shows its stated consequence and runway, cited |
| OBL-7 | Tasks and actions with owners and deadlines | Retained | Core | Not built | None | ORIGINAL | A gap or a change can create a task; a completed task without accepted evidence does not improve posture |
| OBL-8 | "Needs you" inbox ending with "You are current" | Retained | Core | Not built | None | ORIGINAL UX §3 | The inbox holds only the signed-in user's decisions and actions and ends with "You are current" when empty |
| OBL-9 | 90-day horizon | Retained | Core | Not built | None | ORIGINAL | Deadlines, expiries and assurance windows of the next 90 days, by date |
| OBL-10 | Calendar: `.ics` export, subscribable feed, email export | Retained | Core | Not built | None | ORIGINAL | Importing the export into a calendar shows the same deadlines as the app |
| OBL-11 | Reminders and escalation | Retained | Core | Not built | None | ORIGINAL | Due and overdue tasks trigger reminders to owners and, when overdue, to the lead |
| OBL-12 | Posture: derived states with named blockers; completion is not compliance | Retained | Core | Not built | None | ORIGINAL P2c §5; APPROVED PROP §5 | Current, Attention, At Risk or Blocked, each naming its blocker; evidence sufficiency, open judgments and source coverage are shown as separate indicators; never a single compliance score |
| OBL-13 | Signed risk acceptance | Retained | Core | Not built | None | ORIGINAL P2 §5; UX phase 3 | An executive accepts a gap's risk with a rationale and a review date; the gap stays visible, marked accepted, and reopens at the date |
| OBL-14 | A decision record for every human decision: approvals, risk acceptances, case resolutions, evidence acceptances | Retained | Core | Not built | None | ORIGINAL P2 §3 (DecisionRecord, "the defence file's spine") | Every decision is appended with name, role, rationale, time and the run it relied on; none can be edited |

## RC — Regulation checker (the continuing service)

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| RC-1 | Saved, versioned company facts as the checker's memory | Added | Core | Not built | None | U23 | A company's confirmed answers persist across sessions and periods, with history |
| RC-2 | Shared monitoring feeds every company; no per-company scanning | Retained | Core | Not built | None | ORIGINAL P2c §2 | One published change reaches every affected company through one scan |
| RC-3 | Conservative reassessment after publication and after fact changes, including companies previously out of scope | Retained | Core | Not built | None | APPROVED PROP §4 | After a publication, every company with a run in an affected period gets a new run, unless a recorded dependency proof excludes it |
| RC-4 | New questions when a rule needs facts the company has not given | Added (mechanism PROPOSED) | Core | Not built | None | U23; ORIGINAL P2c §4 | A published rule that needs a new fact makes the question appear for every company lacking it; the result reads "missing fact" until answered |
| RC-5 | Affected companies notified by email and on the site, with before, after and the next step | Added | Core | Not built | None | U23; APPROVED PROP §4 | Each affected user gets exactly one notice per company, change and period; unaffected users get none |
| RC-6 | Historical periods: previews and reassessment include closed periods; restatements sit beside originals | Retained | Core | Not built | None | APPROVED PROP §11; CODEX | The preview lists closed periods it reaches; after publication those periods show a new run beside the untouched original |
| RC-7 | Monitoring failures visible: coverage gap on the source and its requirements, degraded freshness for customers, staff alert, all-clear withheld | Retained (PROP failure semantics); made explicit for the checker | Core | Not built | None | APPROVED PROP §4; CODEX; law 15 | A failed or missed check writes a coverage gap at once; affected customers see degraded freshness until a check succeeds within cadence; you are alerted |
| RC-8 | Pending reviews shown, separately, to companies whose answer depends on a touched requirement | Retained | Core | Not built | None | ORIGINAL UX §8; APPROVED PROP §4 | The engine's dependency analysis, not AI, selects who sees a pending review; it clears when the change is disposed of; the all-clear is withheld meanwhile |
| RC-9 | Expansion arrives as applicability events: a newly published pack reaches every saved company through its facts | Retained | Core | Not built | None | ORIGINAL P2 phase 5 | Publishing a second pack re-runs every saved profile; each company is told what newly applies and asked only the new questions it needs |
| RC-10 | Drift watcher: facts past their review date flagged, re-confirmation requested, answers marked as relying on them | Restored | Core | Not built (the engine ignores review dates) | None | ORIGINAL P2c §3 phase 5; AUDIT §1.5 | A fact past its review date appears in "Needs you" and the briefing; the result names the facts due for review until they are re-confirmed |

## CHG — Change centre and briefing

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| CHG-1 | Weekly briefing in the app and by email | Retained; the email cadence Restored | Core | Not built | None | ORIGINAL P1 §5; AUDIT §4.4 | Every Monday afternoon, after a review window, each user receives a briefing listing changes affecting them, reviewed no-impact items, pending reviews and sources |
| CHG-2 | Change centre: event ledger, impact, before and after, briefing archive | Retained | Core | Not built: four hand-written pending acts shown with "WOULD MOVE" | None | ORIGINAL UX phase 5 | A change can be traced from its source snapshot to the customer's changed result, obligation and task |
| CHG-3 | Dated all-clear, derived and never suppressed by AI | Retained | Core | Not built | None | ORIGINAL UX phase 5; APPROVED PROP §4; law 15 | The all-clear appears only with no open coverage gap and no pending review in scope, and names the event, the source version's hash, the reviewer and the date; a successful fetch alone never produces it; a week with no change says so, naming the sources checked and the dates |
| CHG-4 | Pending law shown as watch items, never binding | Retained | Core | Partial: four static pending acts | None | ORIGINAL E law 4 | Pending acts appear with their status and never create obligations |
| CHG-5 | The analyst's note in the briefing: the human "so what" | Retained | Core | Not built | None | ORIGINAL UX phase 5 | A briefing can carry a short note signed by a named person, shown apart from the computed items |

## EVD — Evidence, readiness, reports and assurance

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| EVD-1 | Evidence expectations shown per obligation | Retained | Core | Not built: template data never shown | None | ORIGINAL | Each obligation lists what proof is expected |
| EVD-2 | Evidence registry: pointer or upload, hash, owner, scope, validity window | Retained | Core | Not built | None | ORIGINAL UX phase 6 | An item can be added by pointer or upload; its hash is recorded and re-checked on download |
| EVD-3 | Evidence acceptance by a person; expiry computed | Retained | Core | Not built | None | ORIGINAL | Acceptance is a named person's act; expiry moves the item to "expiring" and "expired" on schedule |
| EVD-4 | Controls and policies with attestations | Retained | Core | Not built | None | ORIGINAL P2c §7 stage 2 | A control can satisfy several obligations; a missed attestation changes posture |
| EVD-5 | Readiness view with named blockers | Retained | Core | Not built | None | ORIGINAL | Readiness by assurance event, every blocker named; a number only with its derivation |
| EVD-6 | Dated, reproducible reports with scope, sources, versions and limitations: JSON and printable HTML first, then PDF and CSV | Retained | Core | Not built | None | ORIGINAL; APPROVED BRIEF §2, PROP §8 (1d export) | A report is rendered from a run's pinned state; regenerating it for the same run yields the same content; an export for one company never contains another's data |
| EVD-7 | Assurance access: scoped, read-only, time-boxed role plus dated export | Retained, modified (PROP §10: role and export instead of a portal) | Core | Not built | None | ORIGINAL; APPROVED PROP §10 | The reviewer sees only the scope and dates granted and cannot change anything |
| EVD-8 | Findings loop into the gap ledger | Retained | Core | Not built | None | ORIGINAL | A finding raised by a reviewer becomes a gap with an owner and a due date |
| EVD-9 | Named report packs: the scope (determination) report, board pack, CFO exposure summary and buyer posture letter | Retained | Core | Not built | None | ORIGINAL P3 §1, §10 (scope report "the first thing to sell"); P2 §2 | Each pack is a dated projection of one run, with scope, sources, versions and limitations |
| EVD-10 | One piece of evidence serves several obligations and programs | Retained | Core | Not built | None | ORIGINAL P2 §3 (cross-references) | Linking one evidence item to several obligations shows it on each, with a single acceptance and expiry |
| EVD-11 | Certifications that both satisfy and create obligations | Retained | Later phase: with voluntary programs (GTD-12) | Not built | None | ORIGINAL P2 §3 | A certificate's expiry creates a renewal obligation and affects every obligation it satisfies |
| EVD-12 | Quarterly posture review and executive report | Retained | Core | Not built | None | ORIGINAL P2 phase 5 (Stage 2) | Each quarter a report of posture, changes absorbed and open decisions is generated from the record for the executive |

## NTF — Notifications and email

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| NTF-1 | Transactional email (verification, result links, resets, notices) with SPF, DKIM and DMARC | Added | Core | Not built (no email code) | None | U23; AUDIT §2.6 | Mail from the domain passes SPF, DKIM and DMARC at a major mailbox provider; each kind of message is sent only under its approved template version and the operating approval |
| NTF-2 | In-app notification centre | Retained | Core | Not built | None | ORIGINAL | Every emailed notice also appears in the app, with its read state |
| NTF-3 | Notification preferences per user | Retained | Core | Not built | None | ORIGINAL UX §2 | A user can turn off each optional kind; security and legally required notices cannot be turned off |
| NTF-4 | Newsletter: monthly digest of published changes, with consent and unsubscribe | Added | Core | Not built | None | U23 | Each issue is sent only after its own approval, only to confirmed subscribers, and contains only published content |
| NTF-5 | Onboarding email sequence (welcome, finish your profile, first briefing) | Suggested | If approved | Not built | None | PROPOSED | A new workspace receives the sequence; it stops when the step is done |
| NTF-6 | Delivery failures (bounces, complaints) visible to staff, with suppression | Suggested | If approved | Not built | None | PROPOSED | A bounced address is suppressed and shown on the admin dashboard |

## CAD — Customer administration

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| CAD-1 | Owner's administration screens: users, roles, invitations, entity access | Retained | Core | Not built | None | ORIGINAL UX §4; APPROVED BRIEF §2 | An owner manages users without staff help |
| CAD-2 | Account and plan; manual invoicing until a billing provider exists | Retained | Core | Not built | None | APPROVED PROP §9.2 | The plan and its limits are visible; staff can change them |
| CAD-3 | Customer-visible audit log | Retained | Core | Not built | None | ORIGINAL UX §4 | Every privileged action in the workspace, including support access, appears in the log |
| CAD-4 | Full export and deletion of the customer's record | Retained | Core | Not built | None | ORIGINAL P2c §2 ("fully exportable") | An owner downloads the complete record; deletion removes it, except what the law requires to be kept, which is listed |
| CAD-5 | Retention settings | Retained | Core | Not built | None | ORIGINAL UX §2 | Retention periods are shown and applied by a scheduled job |

## ASK — Ask DataStrata and scenarios

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| ASK-1 | Ask DataStrata: cited answers over the record only, saved as composed assistance | Retained (DEFERRED in PROP to Stage 6; now in the complete product, late in the sequence) | Core | Not built | None | ORIGINAL UX §9; PROP §5 | Every answer cites record objects; a question the record cannot answer says so and offers a fact request or analyst question |
| ASK-2 | What-if scenarios, non-operative until confirmed | Retained (DEFERRED in PROP to Stage 6; now in the complete product, late) | Core | Not built | None | ORIGINAL UX flow C | A scenario shows its difference, is clearly marked non-operative, and changes nothing until confirmed as actual |
| ASK-3 | Questions answered by an analyst, as a priced part of the service | Retained (pricing OPEN) | Core | Not built | None | ORIGINAL P1; P3 §9.3 ("one bounded analyst question per month") | A customer asks a question; a named person answers it with citations; the answer is saved and counted against the plan |

## EXP — Experience requirements

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| EXP-1 | App frame: scope switcher (entity, program, period) and "Something changed" on every screen | Retained | Core | Not built | None | ORIGINAL UX §13; PROTO | Every customer screen shows the current scope and can change it; the business-change action is reachable from each |
| EXP-2 | Default views by role ("one spine, three altitudes") | Retained | Core | Not built | None | ORIGINAL P2 §6; UX §2 | An executive, a lead and a contributor each land on their own default view of the same record |
| EXP-3 | Visual style and state labels: calm, words plus shapes, the Seismograph / Oxide system | Retained | Core | Partial: tokens and the landing page | None | ORIGINAL UX §8; DS | States never rely on colour alone; orange marks only change events and deadlines |
| EXP-4 | Screen sizes: the briefing and "Needs you" work on a phone | Retained | Core | Partial: the public pages | None | ORIGINAL UX §14 | The briefing and the inbox pass a check at phone width with no horizontal scrolling |
| EXP-5 | Accessibility to WCAG 2.2 AA | Retained | Core | Not verified | None | ORIGINAL UX §14 | An accessibility review of each new screen passes before it ships |
| EXP-6 | Truthful loading and error screens: failure slows the product, never misleads | Retained | Core | Partial | None | ORIGINAL P2 §5; UX §14 | A failed service shows what is unavailable and since when; no screen shows stale or guessed content as current |
| EXP-7 | Preview and confirm before any destructive or scope-changing action | Retained | Core | Not built | None | ORIGINAL UX §14 | Each such action shows what will change before it happens and can be cancelled |
| EXP-8 | Private data visibly separate from shared knowledge; preview before sharing | Retained | Core | Not built | None | ORIGINAL UX §14 | Company data and DataStrata's shared knowledge look different; anything shared outside the company is previewed first |
| EXP-9 | Standard wording for every state, empty state, error and all-clear | Retained | Core | Partial: Stage 1a status words | Stage 1a checks (recorded) | ORIGINAL UX §15 | A content specification exists, and a test fails on any state shown without its standard wording |
| EXP-10 | Reliance, not engagement: success is caught changes, all-clears and renewals | Retained (a measure, not a screen) | Core | Not built | None | ORIGINAL P2 §6; P3 §8.3, §9.2 | The admin dashboard reports reliance measures; it never targets daily use or counts checker completions as willingness to pay |
| EXP-11 | Time-to-value commitments: first answer, first briefing with an all-clear | Retained (the figures are a business decision) | Core | Not built | None | ORIGINAL P2 (value ledger) | The time from registration to first answer and to first briefing is measured for every company |
| EXP-12 | The UX brief's acceptance criteria as end-to-end product tests | Retained | Core | Not built | None | ORIGINAL UX §17 | Each of the ten criteria has an automated or scripted end-to-end check that runs before release |

## SRC — Sources and discovery (staff)

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| SRC-1 | Source register with tiers, authority, jurisdiction, affected packs and requirements, and operating state | Retained, modified: operating fields added in the platform database | Core | Partial: 13 validated, tiered rows; no operating fields; no monitoring check recorded (`lastSeen: null`) | Register tests in the engine suite (recorded) | ORIGINAL; APPROVED PROP §4 | Each source shows last attempt, last success and error class; the register validates on every change |
| SRC-2 | You add and change sources in the admin panel; each change recorded and tier-checked | Added | Core | Not built | None | U23 | A new source passes the tier rules or is refused with the rule named; every change shows who, when and why |
| SRC-3 | Tier policy and citation firewall: trackers and news never cited | Retained | Core | Built | Engine test enforces it (recorded) | ORIGINAL E law 9 | A pack citing a tracker or news source fails the suite |
| SRC-4 | Corroboration: a non-official claim needs an official record | Retained | Core | Partial: rules are data; no workflow | None | ORIGINAL; your words of 14 August | A tracker item opens a search task for the official record and cannot be cited until one is attached |
| SRC-5 | Fenced, hash-pinned source corpus; every cited source served | Retained | Core | Partial: 4 documents; SRC-007 and SRC-008 not served | Corpus tests (recorded) | APPROVED ACC, FAC | Every source a requirement cites is in the corpus at a pinned hash |
| SRC-6 | Discovery of new instruments from official feeds | Added | Core | Not built | None | U23; CODEX | A new act published in a watched feed appears in the discovery queue within one cycle, with its relevance reasons; every item the filter sets aside is logged with its reason |
| SRC-7 | Replacement sources proposed when a text moves or is superseded | Added | Core | Not built | None | CODEX | A moved or newly consolidated text produces a replacement proposal linked to the old source |

## SCN — Scanning (staff)

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| SCN-1 | Scheduled scans by source cadence | Retained | Core | Not built | None | ORIGINAL; APPROVED BRIEF §4 | Every source is attempted on its cadence; a missed cycle is visible |
| SCN-2 | "Scan now" for a regulatory package | Added | Core | Not built | None | U23 | One click runs every source of the package; results appear as observations and events |
| SCN-3 | Three records: content by hash, observations, change events | Retained | Core | Not built | None | APPROVED PROP §4 | An unchanged fetch creates no event; A to B to A creates two events over two stored contents |
| SCN-4 | Hardened fetching: only the register's hosts, size and time limits, no cross-host redirects, no script execution | Retained (hardening designed, never landed) | Core | Not built: the ingest CLI fetches before its origin check, has no limits and follows redirects | None | APPROVED PROP §4; AUDIT §2.4 | A fetch to a host outside the register, an oversize body or a cross-host redirect is refused before any byte is stored |
| SCN-5 | PDF and gazette parsing, with explicit coverage gaps until supported | Retained | Core | Not built | None | APPROVED PROP §10 | A PDF source is either parsed or recorded as a coverage gap; never silently skipped |
| SCN-6 | Coverage gaps as records | Retained | Core | Not built | None | ORIGINAL; APPROVED | Every failed or unparseable source creates a gap visible to staff and used by RC-7 |
| SCN-7 | Lawful use of sources: respect each source's terms, robots rules and copyright; store only what may be stored | Suggested: revives a Polaris-era policy that P1 to P3 did not repeat | If approved | Not built | None | POL; PROPOSED | Each register row records its reuse terms; a source whose terms forbid storage is watched by hash and cited by link only |

## RUL — From change to published rule (staff)

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| RUL-1 | Change review: disposition and legal classification | Retained | Core | Not built | None | APPROVED PROP §4 | Every event ends with a disposition by a named reviewer; a later fetch never closes it |
| RUL-2 | AI drafting of rule changes and interpretation notes, with evidence and confidence, started when you mark an event material | Retained | Core | Not built | None | ORIGINAL; APPROVED BRIEF §4, PROP §4 | A material event yields a draft whose every claim carries a pinned quotation, and a confidence level; the AI writes nothing into the pack |
| RUL-3 | Approval of a rule change (your "ratifier confirms"), with every open question answered and recorded | Added (U23), within PROP's "rule proposals" | Core | Not built | None | U23; APPROVED PROP §2, §4 | An approved change names who approved it and when, carries each open question's recorded answer, and stays draft until verified |
| RUL-4 | Verification agents launched from the admin app | Retained, modified: from the app instead of a command line | Core | Partial: operator-run harness | Five live captures on S-002 (2026-10-18/19); r5 evidence passed 39/39 on version 4 | APPROVED FAC | A launch from the app produces the same dossier shape and trust tiers as the harness |
| RUL-5 | Simulator over golden profiles and every affected company and period | Retained | Core | Partial: goldens in the test suite; no saved companies | Engine goldens (recorded) | ORIGINAL UX §10 | The draft's simulation lists expected and unexpected flips and every company and period reached |
| RUL-6 | Publication gate: impact preview with prior periods, a named publisher, a distinct act, the two-person rule | Retained, modified (choice 2) | Core | Partial: commit and redeploy; the status-truth boundary | Status-truth checks (recorded) | ORIGINAL; APPROVED PROP §4 | Publication is refused without a passing simulation and a viewed preview; a change reaching 10 or more companies, or any closed period, needs a typed confirmation; the act is recorded separately from approval, signing and ratification, and creates the authorisation record, not a publication; the publisher is never the person who approved that revision |
| RUL-7 | Publication in three records: approval; authorisation, then the commit bound to it; activation after a successful, matching deploy. The digest covers rule content and verification state, recorded separately | Retained, modified (choice 6; Codex's corrections; PROP's "signed pack revision") | Core | Not built | None | APPROVED PROP §4, §10; CODEX; PROPOSED | A commit is bound only if its digest equals the approved one; the deploy refuses unbound content; a failed or mismatched deploy creates no activation, shows nothing as published and starts no reassessment |
| RUL-8 | Signing and revocation from the app; gate unchanged | Retained | Core | Partial: CLI only; never exercised on real data | 0 signatures; no ledger file | APPROVED FAC | Signing a dossier with a MISMATCH or OPEN_QUESTION is refused from the app exactly as from the CLI; a revocation is never held back by the publication gate |
| RUL-9 | Promotion of a pipeline identity | Retained | Core | Not built: no promotion writer | None | APPROVED FAC; PROP §6.10 | A promoted identity is recorded with its approver; the gate accepts signatures only from promoted identities |
| RUL-10 | Supersede or roll back a publication | Retained | Core | Not built | None | ORIGINAL UX §10 ("publish/supersede") | Rollback republishes an earlier revision's rule content through all three records, with the reason recorded; the ledger, revocations, promotions, approvals and audit history are never rolled back, so a revoked signature stays revoked |
| RUL-11 | Interpretation notes bound to requirement versions | Retained | Core | Not built | None | APPROVED PROP §3.2 | A shared legal case closes by a note bound to the requirement version; each company's case closes when its run no longer needs it |
| RUL-12 | Condition authoring screen: readable predicate builder, fact-type picker, source anchor, validation | Retained | Core | Not built: hand-edited JSON | None | ORIGINAL UX §10 | A condition built on screen produces the same JSON the loader accepts, or names the validation error |
| RUL-13 | Ratification by a named expert (professional opinion), recorded per requirement version | Retained; unused until a professional legal expert is engaged (people decision P3) | Core | Partial: a ratification field exists; 0 of 23 ratified | None | ORIGINAL LAWS 8; APPROVED ACC | Only an account holding the Ratifier permission can ratify; the record names the expert and the date; no other act sets "ratified" |

## ADJ — Adjudication (staff)

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| ADJ-1 | Queue 1: scan findings (events, tracker and news items, discovery proposals, source changes) | Added | Core | Not built | None | U23 | Every finding ends with a named disposition; none becomes a citation without an official record |
| ADJ-2 | Queue 2: company facts, evidence and judgment cases | Retained (Milestone 2, approved) | Core | Not built | None | APPROVED PROP §3; CORR §7 | Fact questions reach the customer, whose confirmation starts a run; staff resolve interpretation and national-law questions by a recorded interpretation or a rule change; no action sets a result directly |
| ADJ-3 | Queue 3: AI verdicts on rule encodings, with dispositions | Retained, modified: in the app instead of documents | Core | Partial: static review sheet and prose dispositions | DISPOSITIONS-opus55-s002-r5-verdicts.md | APPROVED FAC | Each verdict carries a recorded disposition; signing stays refused while the dossier holds any MISMATCH or OPEN_QUESTION, whatever its disposition |
| ADJ-4 | Case lifecycle, with closures without evidence shown as such | Retained | Core | Not built | None | APPROVED PROP §3.2, §11 | "Retained unknown" and "no longer relevant" never count or display as resolved |
| ADJ-5 | Cases grouped by underlying question | Retained | Core | Not built | None | APPROVED PROP §3 | One shared question with ten affected companies is one case with ten links |
| ADJ-6 | Case assistant: AI proposes a resolution for a judgment case, with evidence and confidence | Suggested | If approved | Not built | None | PROPOSED; U23 ("AI must decide what applies initially") | The proposal is shown to the reviewer only, and only when the company's AI setting is on; accepting it sends a proposed fact to the customer, whose confirmation alone makes it count, or opens a rule draft; it never sets a result |
| ADJ-7 | Escalation of legal cases to a named expert or counsel | Retained | Core | Not built | None | APPROVED BRIEF §3 ("qualified" reviewers) | An interpretation or national-law case can be escalated with its full record; it is never decided by default or by timeout |

## WB — Ratifier workbench

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| WB-1 | Source and draft side by side; every claim linked to its highlighted quotation | Added | Core | Not built | None | U23; ORIGINAL UX §10 | Clicking a claim scrolls the source to its highlighted quotation at the pinned hash |
| WB-2 | Current rule against the draft, in plain English and condition language | Added | Core | Not built | None | U23 | Every changed field appears in both views |
| WB-3 | Evidence panel: approval prerequisites met or not; signals passed, failed or not assessed; the review level and its reason | Added | Core | Not built | None | U23; CODEX | The panel shows every unmet prerequisite and every unassessed signal; the level shown equals the rule's output for the recorded signals |
| WB-4 | One decision per screen, keyboard-friendly, Seismograph / Oxide design | Added | Core | Not built | None | U23; DS | An approval can be completed by keyboard alone; the screen passes an accessibility review |

## CNF — Confidence level

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| CNF-1 | Measured signals, each passed, failed, not assessed or not applicable, with quotation validation kept apart from substantive support | Added; a required deliverable (design PROVISIONAL) | Core | Partial: evidence integrity exists as `checkEvidenceSet` and the trust tiers | Trust tiers on r5 (recorded) | U23; TRUST §2; CODEX | Each signal recomputes identically from the stored artifacts; a check that has not run shows "not assessed", never passed; a validated quotation never counts as substantive support; the evidence-use check is mechanical and never judges support; only recorded AI or human judgments do |
| CNF-2 | The review level (Blocked, Contested, Needs judgment, Incomplete, All checks passed), with a separate calibrated or uncalibrated marker | Added; a required deliverable (design PROVISIONAL: fixed only after CNF-5 and CNF-7) | Core | Not built | None | U23; CODEX | No action is enabled or refused by the level; it never reads "passed" while a check is unassessed; agreement never raises or calibrates it |
| CNF-3 | Held-out legal evaluation set and harness, for the verification pipeline and rule drafts: custody, about 40 cases, six classes, per-class scoring | Retained (specified, not implemented) | Core | Not built | None | APPROVED TRUST §3 | Reports are per class, never one number, and record the set's digest and the pipeline identity; who writes the reference judgements is people decision P4 |
| CNF-4 | The calibration marker, per task | Added; a required deliverable (design PROVISIONAL) | Core | Not built | None | U23; TRUST | A task's proposals read "uncalibrated" until its evaluation exists; afterwards the marker shows the observed wrong-confident count and the set version |
| CNF-5 | Approval prerequisites for each kind of proposal, kept separate from the level | Added; a required deliverable (PROPOSED) | Core | Not built | None | CODEX; PROPOSED | Approve is enabled only when that proposal type's listed prerequisites are met; no level changes them; signing keeps its own gate |
| CNF-6 | Never a status, never on customer results or exports, never from self-reported certainty; customers see only how exactly an extracted value matched its passage | Added; a required deliverable (PROPOSED) | Core | Not built | None | CODEX; UX phase 1 (extraction review shows confidence); APPROVED PROP §1.2 ("never merged into one label") | A test fails if a customer result or export renders a confidence level, or if any signal reads a model's self-assessment; the extraction review shows page, passage and match |
| CNF-7 | Task-specific evaluations for extraction, change triage, discovery and case proposals | Added; a required deliverable (PROPOSED) | Core | Not built | None | CODEX; TRUST §3 (method) | Each task has its own set, written before any model output and scored per class; that task's proposals show "uncalibrated" until it exists |

## ADM — Admin dashboard and operations

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| ADM-1 | Admin dashboard: needs you, monitoring health, pipeline, publications, customers, AI work, content status, audit | Added | Core | Not built | None | U23 | Each region's numbers match the underlying records; every item links to its screen |
| ADM-2 | Operations: failed jobs, backlog, overdue work, incidents, change-to-briefing service level | Retained | Core | Not built | None | APPROVED BRIEF §2; ORIGINAL UX §10 | A failed job appears within one minute with its error and a retry action |
| ADM-3 | Customer management: companies, registrations, suspension, support grants | Retained | Core | Not built | None | APPROVED BRIEF §2 | You can find any company, see its state and grant or end support access |
| ADM-4 | Incident handling and runbook | Retained | Core | Not built | None | APPROVED PROP §9.2 | An incident record has an owner, timeline and closing note; the runbook covers the top five failures |
| ADM-5 | AI spend and usage with budgets | Suggested | If approved | Partial: spend controls exist in the harness | CHECKPOINT-opus55-spend-controls (recorded) | PROPOSED; U23 (saving tokens) | Spend per agent and per day is shown; a run that would exceed its budget is refused before launch |

## AI — AI platform

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| AI-1 | Hosted Opus 5.5 path through the API, with spend controls in money | Retained, not the default: AI runs on your MacBook (your decision of 2026-10-23) | Core | Partial: `verify run` over the API exists and has never run live | None live | APPROVED FAC; PROP §9.3 (AI provider and spend controls: open) | An API run produces the same record shape as a harness run, names `claude-opus-5-5`, and stops at a budget stated in money |
| AI-2 | The Opus 5.5 route for every AI job: Claude Code on your personal subscription, run by the worker on your MacBook | Retained, modified: from operator-launched captures to every Opus job (your decision of 2026-10-23) | Core | Partial | Five live captures (2026-10-18/19) | APPROVED | Every Opus job runs through the pinned, hash-checked CLI on your MacBook and records its usage; company data reaches it only with the company's permission for third-party AI processing (law 20) |
| AI-3 | The AI worker on your MacBook: pulls every AI job, runs Opus 5.5 (subscription) or the pinned Qwen, returns labelled results | Added | Core | Not built | None | U23; your decision of 2026-10-23; QWEN | Jobs wait while the MacBook is off and an overdue job alerts a person; Qwen output is filed beside, never inside, an authoritative record; standing Opus jobs start only after the subscription check (D4) |
| AI-4 | Qwen pins and preconditions: auto-update off, cloud off, re-pinned; the Claude Desktop gateway settings of 2026-10-21/22 checked and removed | Retained | Core | Not built: the runtime moved from 0.34.2 to 0.40.7 and `qwen3.6:27b` changed since the pins | Parent's read-only check, 2026-10-23; R3 | APPROVED QWEN §3–§4 | A job refuses to run when any pin differs from the recorded hash |
| AI-5 | Model routing policy per agent, with the efficiency rule | Added | Core | Not built | None | U23; TRUST §3.4 | Moving an agent to a cheaper model requires a recorded non-inferiority result |
| AI-6 | Hosted extraction model with EU processing | Superseded by AI-3 (your decision of 2026-10-23: AI runs on your MacBook) | Core | Not built | None | PROPOSED in draft 1 | — |
| AI-7 | Source and document text fenced as data in every prompt | Retained | Core | Partial: verification prompts fence documents | Verification tests (recorded) | APPROVED TRUST §2.3 | A document containing an instruction changes no status and is reported as a finding about the source |
| AI-8 | Evaluation tests for every AI task (extraction, triage, drafting), so models can be swapped | Retained | Core | Not built | None | ORIGINAL P2 §5 ("Models are suppliers, not architecture") | Each AI task has a fixed test set; changing its model requires the test results recorded beside the change |
| AI-9 | Permissions enforced at three levels: the operating approval; standing permissions (agent budgets, message templates); individual approvals (publications, newsletter issues, verification runs, over-budget runs, break-glass) | Added | Core | Not built (approval has been procedural) | R3: r4 ran before the user's approval was recorded | PROPOSED; law 23 | Nothing runs outside a recorded permission at the right level; a run that would exceed its standing budget waits for an individual approval; suspending the operating approval stops scheduled jobs and messages |
| AI-10 | AI failure degrades speed, never truth; every AI output keeps its provenance | Retained | Core | Partial: the verification harness withholds failed results | Harness records (recorded) | ORIGINAL P2 §5; law 22 | When a model is unavailable, its tasks wait and the dashboard says so; every stored AI output names its model, version and prompt hash |
| AI-11 | Moving a repeated task to Qwen: its own evaluation, quality bar and escalation rules | Added | Core | Not built | None | Your objective of 2026-10-23; TRUST §3.4 | A task moves to Qwen only after showing non-inferiority on its own evaluation; a failed check, invalid output or a failed sample audit escalates it to Opus 5.5 or a person; a job overdue because the MacBook is off waits and alerts a person |

## KNW — Knowledge and engine

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| KNW-1 | CSRD pack: 23 requirements, 48 questions, 62 fact types, 17 obligation templates, 16 gap tests, 17 sources | Retained | Core | Built as draft content | Engine suite (recorded) | ORIGINAL; APPROVED | Loads with full referential integrity; every requirement cites official sources |
| KNW-2 | Pack revision numbering moves with each publication; runs record it | Retained | Core | Not built (`packVersion` 0.1.0 since creation) | None | APPROVED PROP | Each publication has a new revision; a run names the revision it used |
| KNW-3 | National-law pack for the launch country | Retained; ratification needs a professional legal expert (people decision P3) | Core | Not built (DE and IE stubs, never loaded) | None | ORIGINAL E law 5 | With the pack ratified, a screen in that country can reach a final conclusion; without it, the national-law gate holds |
| KNW-4 | Release policy that makes "Supported" reachable | Retained | Core | Not built | None | APPROVED PROP §1.2 | The policy names the scenario, the requirement closure, the verification and ratification required, the national-law pack, monitoring and the scenario coverage review; the site shows "Supported" only for scope that meets them |
| KNW-5 | Truthful status on the site | Retained | Core | Built | Stage 1a (recorded) | APPROVED Stage 1a | Unchanged |
| KNW-6 | Signature and revocation ledger | Retained | Core | Partial: designed append-only; no ledger file | None | APPROVED FAC | Every signature and revocation is appended; nothing is ever rewritten or rolled back, including by a rollback of rule content |
| KNW-7 | Content track: each launch-scope requirement reaches the bar chosen in choice 4 | Retained | Core | Not built: 0 of 23 ratified or signed | None | APPROVED PROP; choice 4 | Each requirement in the launch scope shows its status and its evidence |
| KNW-8 | CBAM pack, the second pack and the architecture's stress test | Retained (DEFERRED) | Later phase: after the CSRD product | Not built | None | ORIGINAL; APPROVED PROP §10 | CBAM loads with no program-specific engine code |
| KNW-9 | Live transposition status per Member State | Restored (approved in August, never built) | Core | Not built | None | APPROVED ACC | Each Member State shows its transposition status with an official source and the date checked; the national-law gate cites it |
| KNW-10 | The public checker's content threshold (draft or verified only) | Retained as an open product decision | Core | Not built (the checker evaluates draft content, labelled) | None | APPROVED STB ("a separate product decision") | The threshold in force is shown on the check page; changing it is a recorded decision |
| KNW-11 | A relationship type on each requirement: whose duty it is (for example importer or exporter, direct or value chain) | Retained | Core | Not verified (an `actor` field is sent by the check and never shown; whether it is this class is unverified) | None | ORIGINAL P3 §2.1 | No company is shown another party's legal duty as its own; goldens cover each relationship type |
| KNW-12 | A second pack can reuse July's CBAM work (the "CBAM Engine v0" and its library) | Retained (where it is now is unverified) | Later phase: with KNW-8 | Not built | None | ORIGINAL P3 | Before the CBAM pack starts, the July material is located and its reusable parts listed |

## PLT — Platform

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| PLT-1 | PostgreSQL with tenant isolation by row-level security and four database roles (plain SQL migrations, no ORM, by default) | Retained | Core | Not built | None | APPROVED PROP §6.1, §6.4 | Connected as `app`, `worker` or `support`, a wrong or absent tenant context returns zero rows |
| PLT-2 | Background jobs and scheduler: queue, retries, idempotency (pg-boss in a separate worker process by PROP's default; Vercel Workflow with a Postgres jobs table under choice 8A) | Retained | Core | Not built | None | APPROVED PROP §6.1 | A job retried after a crash produces no duplicate effect; a missed schedule is detected by comparing due time with last attempt |
| PLT-3 | Object storage for documents and source snapshots: encryption, signed URLs, hashes | Retained | Core | Not built | None | APPROVED PROP §6.1 | A file is reachable only through a signed, expiring URL issued to an authorised user |
| PLT-4 | Append-only audit trail | Retained | Core | Not built | None | APPROVED PROP §6.1 | The database refuses UPDATE and DELETE on audit tables |
| PLT-5 | Backups and a tested restore | Retained | Core | Not built | None | APPROVED PROP | A restore drill into a fresh environment succeeds and is recorded |
| PLT-6 | Observability: structured logs, `/healthz`, alerts | Retained | Core | Partial: console logs only | None | APPROVED PROP §6.1 | `/healthz` checks database, queue and storage; a failed job or coverage gap alerts you |
| PLT-7 | Secrets in the host's secret store, rotated | Retained | Core | Partial: environment variables and sentinel scans | Sentinel scans (recorded) | APPROVED PROP | No secret in the repository or image; rotation documented and tested once |
| PLT-8 | Public-route security: headers, body limits, cross-site refusal, configured origin | Retained | Core | Built | B2–B6 accepted; 664 frontend tests (recorded 2026-10-22) | APPROVED pilot readiness | Unchanged on the hosted platform; re-checked there |
| PLT-9 | Rate limiting suitable for hosting | Retained, modified: B1 option A was local-only | Core | Partial | B1 option A (local) | APPROVED B1 | Limits hold across instances on the chosen host |
| PLT-10 | Forward-only migrations, expand and contract | Retained | Core | Not built | None | APPROVED PROP §6.5 | Every release declares whether an image rollback is safe |
| PLT-11 | Billing provider (manual invoicing until then) | Retained (DEFERRED) | Core, late | Not built | None | APPROVED PROP §9.3 | Invoices issued from recorded plans; provider chosen by you |
| PLT-12 | The scanning worker runs with no access to company data | Retained | Core | Not built | None | APPROVED PROP §4 | The scanning function runs where no company-data credential is present, enforced by the deployment rather than by code choosing a connection; a test run from inside it finds no such credential and reads zero company rows |
| PLT-13 | Internal APIs from day one: the web app, the worker and any later public API use the same platform interface | Retained, modified: the engine stays a library inside the platform | Core | Not built (the web server calls the engine directly) | None | ORIGINAL P2 §4 ("the GitHub/Stripe dogfooding rule"); APPROVED PROP §0, §6.8 (the platform package wraps the engine) | No screen reads the database directly; every action goes through the platform interface that a later public API would expose |

## PRV — Privacy and consent

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| PRV-1 | Retention and erasure policy for checker answers, emails, registrations, consents and accounts, reconciled with the append-only audit and immutable runs | Added (no accepted document covers it) | Core | Not built | None | R2; U23 (registration, newsletter) | The policy is written and approved by you before any personal data is stored; a scheduled job applies it; an erasure request removes personal identifiers while the record stays intact |
| PRV-2 | The company's AI-processing setting, switched by its owner | Retained | Core | Not built | None | APPROVED PROP §6.7 | With the setting off, no company data reaches any model and the AI features say why; a second level decides whether processing stays local (Qwen on your MacBook) or may also use Opus 5.5 through Anthropic |
| PRV-3 | A register of processors and their processing locations, feeding the privacy policy | Suggested | If approved | Not built | None | APPROVED PROP §6.7 (processing location per use); PROPOSED | Every provider that touches personal or company data is listed with its region and agreement; the privacy page is generated from it |
| PRV-4 | Handling company data on your MacBook: encrypted disk, a dedicated macOS user, no cloud sync of job data, deletion after each job, a content-free job log, and a review of any transfer outside the EU | Added | Core | Not built | None | Your decision of 2026-10-23; PROPOSED | A job's data is gone from the MacBook once its result is returned; the job log holds no content; the transfer review is written before company data is processed there |

## DEP — Deployment and hosting

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| DEP-1 | Domain bought at GoDaddy (your act) | Added | Core | Not built | None | U23 | The domain resolves to the hosted app over HTTPS |
| DEP-2 | DNS records for the app and for email (SPF, DKIM, DMARC) | Added | Core | Not built | None | U23 | DNS checks pass for the app and mail records |
| DEP-3 | Hosting, environments (preview, production) and EU region, per choice 8 | Retained, modified: PROP's provisional default was Fly.io in Frankfurt; you now name Vercel or Cloudflare | Core | Not built | None | APPROVED PROP §6.7 (provisional); U23; PROVISIONAL | Production runs in the chosen EU region; previews never touch production data; the always-on scheduler keeps "monitored" reachable; every workflow record carries identifiers only; the topology is approved only after D5's four conditions are demonstrated |
| DEP-4 | CI on the main branch | Retained | Core | Partial: workflows defined, absent from `main`, never run | None | APPROVED | Every push runs tests, typecheck and build; a red run blocks deploy |
| DEP-5 | Container image built and run, if the topology uses one | Retained | Core | Not built: the Dockerfile has never been built | None | APPROVED pilot readiness | The image builds from a clean checkout and passes the gate of PROP §6.6 |
| DEP-6 | Independent authentication review before public exposure | Retained | Core | Not built | None | APPROVED | A written review with findings closed or accepted by you |
| DEP-7 | The operating approval for an environment (law 23), given by the operating authority that people decision P2 names, against a recorded checklist | Retained, modified | Core | Not built | None | APPROVED; PROPOSED (law 23) | The checklist is complete and approved by that authority before the domain is announced; until then no scheduled job or automated message runs there |
| DEP-8 | Smoke checks on the hosted environment | Retained | Core | Partial: local standalone and production smoke passed (2026-10-22) | Recorded locally | APPROVED | The smoke suite passes against the hosted URL after each deploy |
| DEP-9 | Trust programme: professional-indemnity insurance and SOC 2 readiness, both committed; a SOC 2 certification audit is a separate business decision | Retained | Later phase | Not built | None | ORIGINAL P1 | The insurance is in force before the first paid contract; SOC 2 readiness (controls defined, documented and operating, with their evidence) is delivered in its phase; certification by an external auditor is decided separately |

## GTD — Committed for later phases (choice 5b)

| ID | Capability | Disposition | Target | Built? | Verification evidence | Source | End-to-end acceptance |
|---|---|---|---|---|---|---|---|
| GTD-1 | Suppliers as records, evidence requests to suppliers, and supplier accounts and uploads | Retained | Later phase: with the first chain-regime pack (CBAM); the data design leaves room now | Not built | None | ORIGINAL P2c §2, §7 stage 2; P1 | Obligations bind to suppliers; a supplier can be asked for evidence and upload it to a scoped request |
| GTD-2 | Buyer accounts on shared trade lanes, permissioned data sharing between organisations, and help with buyers' data demands | Retained | Later phase | Not built | None | ORIGINAL P2c §7 stage 3+; P1 (Desk Plus) | A buyer sees only the scoped record a supplier shares; every shared item is previewed and logged |
| GTD-3 | Auditor and buyer portal beyond the scoped role and export | Retained | Later phase | Not built | None | ORIGINAL; PROP §10 | As EVD-7, with a portal |
| GTD-4 | Public API | Retained | Later phase | Not built | None | ORIGINAL P2c §7 stage 3+ | Documented, authenticated, tenant-scoped, rate-limited |
| GTD-5 | MCP access | Retained | Later phase | Not built | None | ORIGINAL P2c §7 stage 3+ | Same scope rules as the API; read-only to start |
| GTD-6 | Integrations (Teams or Slack, calendar sync, evidence-storage connectors, facts fed from systems) and single sign-on; ERP and SAP links stay excluded for now (X-12) | Retained, committed: your direction of 2026-10-23 replaces PROP's "on customer demand" for SSO (DEFERRED to Stage 6 in PROP) | Later phase | Not built | None | ORIGINAL P2; APPROVED PROP §6.2, §9.3 | Each integration is configured by the owner and audited |
| GTD-7 | Managed evidence custody | Retained | Later phase: residency and retention duties settled first | Not built | None | ORIGINAL UX §18 | Same evidence objects, with custody added |
| GTD-8 | Enterprise packs | Retained | Later phase | Not built | None | ORIGINAL P2c §7 stage 3+ | Added as packs with no engine changes |
| GTD-9 | Passkeys | Retained | Later phase: after two-factor codes | Not built | None | APPROVED PROP §6.1 | A passkey can replace the password for a customer |
| GTD-10 | National ESG-law scoping across jurisdictions (EY-style compliance scoping, India included) | Suggested direction | If approved | Not built | None | U23 (questionnaire); PROPOSED | Recorded as a future product line with its own packs |
| GTD-11 | German-language interface | Suggested | If approved | Not built | None | PROPOSED | Every customer screen and email available in German |
| GTD-12 | Voluntary programs and buyer codes as requirements (EcoVadis, SBTi, buyers' codes; "buyers are sources"), including watching their sources | Retained | Later phase: after the second pack | Not built | None | ORIGINAL P2 §3; P3 §8.1 | A voluntary program loads as a pack and appears as its own program, labelled voluntary |
| GTD-13 | Verification network: assurance providers review once, reuse many times | Retained (P1 defers it by at least 24 months) | Later phase (P1: not within 24 months) | Not built | None | ORIGINAL P1 | Delivered in its later phase: an assurance provider's review is recorded once and reused |
| GTD-14 | Impact analysis for larger companies (the enterprise phase) | Retained | Later phase | Not built | None | ORIGINAL P1 | Delivered in its later phase |
| GTD-15 | Licensing the knowledge and white-label for consultancies and platforms | Retained (a channel decision) | Later phase | Not built | None | ORIGINAL P1; P3 §9.1 | Delivered in its later phase, on terms you decide |
| GTD-16 | The personalised EU market-access report for exporters (the original first deliverable) | Superseded as the first deliverable by CSRD first; retained for the CBAM pack | Later phase: with KNW-8 | Not built | None | ORIGINAL P1 §5 | Returns as a named report pack when the CBAM pack is published |

## X — Excluded

| ID | Capability | Disposition | Source | Why |
|---|---|---|---|---|
| X-1 | Completing questionnaires as a service, including AI-drafted answers to buyer questionnaires | Excluded, unless you decide otherwise: P2 let AI draft buyer-questionnaire answers "from the record", while P1 refused questionnaire completion | ORIGINAL P1; UX §18; P2 §5 | DataStrata identifies duties and proof; it does not fill in other parties' forms |
| X-2 | An "AI sustainability analyst" that drafts disclosures | Excluded | AUDIT §4.9 (Polaris era, settled) | Conflicts with law 2 |
| X-3 | Emissions calculation | Excluded | ORIGINAL UX §18 | Partnered, not built |
| X-4 | A single aggregate compliance score | Excluded | ORIGINAL P2c §5; UX §7 | Posture is states with blockers |
| X-5 | A reporting platform: ESRS data collection or report drafting | Excluded | ORIGINAL P3 §9 ("Do not build reporting workflows") | Starting with CSRD makes this temptation stronger; it stays out |
| X-6 | An evidence vault as the product | Excluded | ORIGINAL P1 ("custody is liability without moat") | Distinct from optional custody later (GTD-7) |
| X-7 | A "compliance OS" that claims to be the system of record | Excluded for 24 months | ORIGINAL P1 | Work is sent into the customer's own tools instead |
| X-8 | "Agents" as the organising idea of the product | Excluded as a framing | ORIGINAL P1 | The product is organised by program; agents remain an implementation tool |
| X-9 | The AI Act and programs outside sustainability | Excluded | ORIGINAL P1 | Out of scope |
| X-10 | "Three businesses" (software, platform, infrastructure) | Excluded as a framing | ORIGINAL P1 | One business, sold through phased channels |
| X-11 | Pricing per seat | Excluded | ORIGINAL P1 | Value grows with entities, programs and revenue at risk |
| X-12 | ERP and SAP links | Excluded for now | ORIGINAL P1; P2 ("No ERP connection") | Onboarding stays integration-free (PRF-14) |
| X-13 | Generated search pages | Excluded | POL (Polaris era) | Not repeated in any later plan |

## SUP — Superseded (kept so they are not revived without a decision)

| ID | What it was | Replaced by | Source |
|---|---|---|---|
| SUP-1 | The Polaris automation model: "runs without you", with only low-confidence items reviewed | Human approval of every shared rule change, whatever its confidence level (law 2, law 14) | POL |
| SUP-2 | Claude reasoning about "fuzzy" applicability | The deterministic engine plus adjudication | POL; P2 §4–§5; P3 §2 |
| SUP-3 | The action calendar as the screen people use every day | A Home judged at a glance; work sent out to calendars | Early notes; P1 H12; P2 §6 |
| SUP-4 | Polaris EUDR tooling for importers | A future EUDR pack, if chosen | POL |
| SUP-5 | Polaris measures of success (checker runs, "5 would pay") | Reliance measures (EXP-10) | POL; P1; P3 §9.2 |
| SUP-6 | The seven-layer platform design | The accepted platform foundations (PROP §6) | P2 §8 |
| SUP-7 | The mind-map interface, killed by P1 | The Universe Map as a secondary view (APP-5), from your comment C3 | Braindump; P1; P2 C3 |
| SUP-8 | P2's build order and P3's revised build order | The build plan of step 5, which takes both as inputs | P2 §8; P3 §10 |
| SUP-9 | The mix of the first 50 requirements (CBAM, EUDR and buyer codes; or 20 CSRD, 20 CBAM, 10 voluntary) | CSRD first (KNW-1) | P2c §9; P3 §8.1 |

---

## Reconciliation: where every source item landed

The working reports are in `side-session-notes/local_043075c1-…/2026-10-22T2049Z-vision-v1/reports/`: R1 inventories the July plans (215 items), R2 the accepted changes and policies (110 items).

### Original items the audit did not record (R1 §3, 85 items)

| R1 items | Board |
|---|---|
| O-006 market-access report | GTD-16 |
| O-007 scope report; O-116 named report packs | EVD-9 |
| O-008 organised by program | APP-9 |
| O-009 voluntary programs and buyer codes; O-172 watching buyers' program sources | GTD-12 |
| O-011 expansion as applicability events | RC-9 |
| O-012 data flywheel | CHK-8 |
| O-016 published analyses of changes | PUB-6 |
| O-017 public status page | PUB-7 |
| O-024 automatic collection of public evidence | PRF-13 |
| O-036 onboarding without integrations | PRF-14 |
| O-037 applicability run screen | APP-10 |
| O-045 coded reasons for unresolved results | APP-11 |
| O-046 relationship type per requirement | KNW-11 |
| O-047 direct versus value-chain exposure; O-128 help for suppliers receiving requests | APP-12 |
| O-048 how firm each answer is | APP-3 |
| O-053 one named owner | OBL-3 |
| O-056 signed risk acceptance | OBL-13 |
| O-071 optional evidence storage | GTD-7 |
| O-072 storage connectors; O-139 SSO; O-140 Teams and Slack; O-142 facts from integrations | GTD-6 |
| O-074 certifications | EVD-11 |
| O-075 evidence reuse across programs | EVD-10 |
| O-079 analyst's note | CHG-5 |
| O-087 quarterly review | EVD-12 |
| O-091 no single compliance score | X-4 |
| O-097 app frame | EXP-1 |
| O-099 Regulatory Library | APP-13 |
| O-101 reliance, not engagement | EXP-10 |
| O-102 visual style; O-103 screen sizes; O-104 accessibility; O-105 truthful loading; O-106 preview and confirm; O-108 standard wording; O-109 time to value | EXP-3, EXP-4, EXP-5, EXP-6, EXP-7, EXP-9, EXP-11 |
| O-117 full export and leaving | CAD-4 |
| O-123 AI-drafted questionnaire answers | X-1 |
| O-124 analyst questions | ASK-3 |
| O-125, O-126, O-127 suppliers | GTD-1 |
| O-129, O-130, O-131 buyers and data sharing | GTD-2 |
| O-132 verification network | GTD-13 |
| O-133 enterprise impact analysis | GTD-14 |
| O-134 licensing and white-label | GTD-15 |
| O-135 enterprise packs | GTD-8 |
| O-136 public API; O-137 MCP | GTD-4, GTD-5 |
| O-138 internal APIs | PLT-13 |
| O-153 retention setting | CAD-5, PRV-1 |
| O-156 two graphs, one join; O-197 five principles | `VISION.md` A5 (laws 1, 2, 8, 12, 17) and A6 |
| O-160 seven-layer design | SUP-6 |
| O-173 tests for AI tasks | AI-8 |
| O-174 content structured from the first entry | KNW-1 (the pack is structured JSON) |
| O-178 CBAM engine v0 | KNW-12 |
| O-181 P3 pricing | PUB-5; `VISION.md` E6 item 3 |
| O-186 P3's build order; O-188 validation gates; O-190 four-stage plan | SUP-8 (inputs to the build plan); gates on GTD rows |
| O-191 sales channels | `VISION.md` E6 item 9 |
| O-198 how AI is run | AI-10; law 22 |
| O-200 acceptance criteria as tests | EXP-12 |
| O-018, O-141, O-193, O-201, O-203 to O-211, O-213 to O-215 (refused or replaced) | X-13, X-12, SCN-7, X-3, X-5 to X-11, SUP-7, SUP-3, SUP-1, SUP-4, SUP-5 |

Partly covered by the audit (R1 §4): O-028 → PRF-6; O-030 → GTD-1 and law 2; O-039 → APP-6; O-041 → APP-14; O-043 → APP-5; O-049 → APP-3 and CNF-6; O-050 → ADJ-2 and `VISION.md` E6 item 5; O-057 → OBL-14; O-070 → APP-12; O-083 → RC-5; O-096 → EXP-2; O-100 → EXP rows and the laws; O-107 → EXP-8; O-169 → RUL-11 and PUB-6; O-175 → law 7; O-187 → GTD gates; O-192 → DEP-9; O-196 → law 3; O-199 → `VISION.md` A4. O-202 and O-212 → X-1 and SUP-2.

### Accepted changes and policies (R2, 110 items, by group)

| R2 group | Where it lands |
|---|---|
| A-001 to A-007: governance, approvals, git ownership, process | `VISION.md` change control, E3, E4 |
| A-008 to A-011, A-016: CSRD first, CBAM second, segment, Germany, target user | A2; KNW-8; E6 items 1–2 |
| A-012 to A-014, A-023, A-024: four dimensions, status words, launch set, status truth, checker threshold | Law 9; "Words we use"; KNW-4, KNW-5, KNW-7, KNW-10; choice 4 |
| A-015: SAP outside the repository | E2; E4 item 5 |
| A-017: national law and transposition status | Law 6; KNW-3; KNW-9 |
| A-018, A-019: product laws; tiered register | A5; SRC-1, SRC-3, SRC-4 |
| A-020 to A-022, A-025, A-026: factory, who signs and ratifies, August bars, authoring workbench, sweeps on command | "Words we use"; choices 1b and 2a; RUL-4, RUL-8, RUL-12; C2 |
| A-027 to A-035: one application, roles, areas, assurance access, staff access, owners | B1; ACC-2, ACC-5, ACC-7; CAD-1; WB; ADM-2; EVD-7; E6 item 4 |
| A-036 to A-040: the judgment workflow and Milestone 2 | ADJ-2, ADJ-4, ADJ-5; laws 11 and 13; E4 item 1 |
| A-041 to A-050: register authority, three records, review, impact, publication, scans, reassessment, no-impact statements, failure semantics, PDF later | SRC-1; SCN-1 to SCN-5; RUL-1, RUL-6, RUL-7; RC-3, RC-5, RC-7; CHG-3; PLT-12 |
| A-051 to A-057: obligation identity, work, completion versus compliance, exports, runs, periods, scenarios | OBL rows; EVD-6; APP-8; B4; RC-6; ASK-2 |
| A-058 to A-078: platform, database, queue, files, authentication, recovery, roles, audit, migrations, deployment, residency, allowlist, engine edges, signing evidence, Node 24, Next.js patch, gate hardening | PLT rows; ACC-1, ACC-4, ACC-6, ACC-9, ACC-10; DEP-3, DEP-5, DEP-6; KNW-7; D5; choice 8; E4 item 6 (Node 24 and Next.js 15.5.28 are the built baseline) |
| A-079 to A-090: Stages 1 to 6 and their increments; billing | Inputs to the build plan (SUP-8); every stage's contents are rows on this board; PLT-11 |
| A-091 to A-098: pilot step 1, B2–B6, B1 option A, pilot scope, separate decisions, local-first, the paused drafts, items left to you | ACC-9; PLT-8, PLT-9; `VISION.md` E6 item 10; choice 8 (timing); DEP-3, DEP-7; PUB-4 |
| A-099 to A-106: AI may draft, never activate; tenant AI setting; AI provider; Qwen; trust measurement; extraction; Ask | Law 2; RUL-2; PRV-2; AI-1; AI-3, AI-4; CNF-3; PRF-4; ASK-1 |
| A-107 to A-110: review responsibility, commitments, hosting, SSO and self-serve | Choice 2; E6 items 4–5; choice 8; ACC-10, GTD-6, GTD-9; choice 3 |

### Your direction of 2026-10-23

| What you asked for | Board |
|---|---|
| A free checker whose questions really drill down | CHK-1, PRF-12 |
| The engine decides what applies; the customer sees why | APP-1, APP-2, APP-7 |
| Obligations, then tasks, then evidence | OBL rows, EVD rows |
| A regulation checker that saves answers and keeps looking | RC-1 to RC-9 |
| Opus 5.5 for exploration, Qwen for repeated work | AI-1 to AI-10; `VISION.md` D2, choice 7 |
| Sources watched regularly, at a loop time I choose | SCN-1; `VISION.md` C2 |
| A scan per regulatory package from the admin panel | SCN-2 |
| AI drafts rule changes with the evidence for a ratifier | RUL-2, RUL-3, WB-1 to WB-4 |
| A confidence level, well defined | CNF-1 to CNF-6 |
| Affected customers emailed and notified on the site | RC-5, NTF-1, NTF-2 |
| A sophisticated admin dashboard | ADM-1 to ADM-5 |
| Separate admin and customer logins | ACC-5 |
| The checker result by email, registration, newsletter | CHK-3 to CHK-6 |
| Every engine output visible | APP-7, CHK-2 |
| Document extraction, the Universe Map, yearly refresh reminders | PRF-4, APP-5, PRF-8 |
| Sources added and changed by the admin; scan results shown | SRC-2, SRC-6, SRC-7, ADM-1 |
| One admin; adjudication of all three kinds | `VISION.md` C1, choice 2; ADJ-1 to ADJ-3 |
| The domain and hosting set up with help | DEP-1 to DEP-3; `VISION.md` D5, choice 8 |
| Ideal features I suggest | Every row marked **Suggested** |
| Your alignment corrections (2026-10-23): CSRD first with the wider destination committed; the checker optional with direct registration; the Opus/Qwen allocation assessed; AI on your MacBook through your subscription; confidence a required deliverable; two people mapped apart from the AI roles | `VISION.md` A2, B2 phase 0, C1, C6, D2, D4, choices 2, 3, 5 and 7, E6; rows CHK-1, CHK-9, AI-1 to AI-3, AI-6, AI-11, PRV-2, PRV-4, PRF-4, ACC-5, ACC-6, RUL-6, RUL-13, KNW-3, CNF-1 to CNF-7, every Later-phase row |

### Codex's reviews

| Point | Where |
|---|---|
| Inventory completeness: suppliers, buyer lanes, API and MCP | GTD-1, GTD-2, GTD-4, GTD-5; the R1 table above |
| What the ratifier approves | `VISION.md` C5, choice 1 |
| Confidence as evidence, not a percentage; agreement is not correctness | `VISION.md` C6; CNF rows; law 14 |
| The regulation checker as a complete continuing service | `VISION.md` B3; RC rows |
| Single-admin publication and recovery; self-registration | `VISION.md` choices 2 and 3 |
| Factual corrections | `VISION.md` E7 |
| Second review (2026-10-23T08:31Z): customer-only fact confirmation; purpose-bound readiness facts; publication ordering and rollback; permission levels; provisional confidence; single-admin dependencies; hosting conditions; PRF-11 | Laws 4, 10, 16 and 23; C3; C6; choice 2; D5; rows ADJ-6, PRF-11, PRF-12, ACC-2, RUL-6 to RUL-10, WB-3, CNF-1 to CNF-7, AI-9, NTF-1, NTF-4, DEP-3, DEP-7, PLT-12, KNW-6 |

---

## Counts

Computed from the tables above on 2026-10-23 by a script, not by hand. No ID repeats, and every ID that `VISION.md` cites exists here.

| | Count |
|---|---|
| Capabilities | 237 (211 Core, 18 Later phase, 8 If approved) |
| Excluded | 13 |
| Superseded (the SUP table) | 9 |
| **Built?** Built / Partial / Not built / Not verified | 8 / 46 / 181 / 2 |
| **Disposition** Retained / Added / Suggested / Restored / Superseded | 181 / 38 / 8 / 7 / 3 |

"Built" counts eight rows, each built only for its stated scope: the landing page, the pilot gate, the engine, the citation firewall, the truthful status words, the public-route hardening, the CSRD pack as draft content, and integration-free onboarding for the check.
