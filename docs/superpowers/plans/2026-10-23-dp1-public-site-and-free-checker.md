# DP1 plan: the public site and the free checker, live

> **Revision 3, 2026-10-23,** records your two corrections after the review cap was reached, and nothing else:
> 1. **DG-19 is settled as option B,** with the corrected guard. The approved C-7 behaviour stays.
>    - The guard counts a genuine change in a relevant exemption determination as a useful outcome. It compares engine results in the same context.
>    - A change caused only by showing or hiding a line does not count (Tasks 3 and 4; DG-19).
> 2. **Exposure is protected by Vercel Authentication for All Deployments,** production included.
>    - It is configured and its settings verified before Git is connected. Anonymous and authorised URL checks run once deployments exist. It is removed from production only under DG-1.
>    - The custom exposure switch and the throwaway rehearsal are removed, and with them revision 2's other keys and the draft pull request.
>    - The hosted pilot surface stays disabled (§4.2; Tasks 7, 11, 13 and 14; DG-1; DG-16; Appendix B).
>
> Revision 2's items 2 and 3 below are superseded where they differ. The plan comes back to you for your decision.
> **Revision 2, 2026-10-23,** answers Codex's four findings on revision 1 (sha256 `cf71c114…`), and nothing else:
> 1. **Precise route semantics and labels.** Each row is made of lines, and each line reports exactly one requirement. Line kinds fix what each state means, and the definitive EU words say "at EU level". The exemption row now reports the exemptions themselves, not the duty (Tasks 4, 5 and 6).
> 2. **Exposure prevented before DG-1,** not only detected: five independent keys, K1 to K5 (§4.2; Tasks 7, 11, 13 and 14; Appendix B).
> 3. **A question guard that catches irrelevant visibility.** The shown direction is checked in every combination where a question is shown. That exposes C-7's approved rule, so DG-19 is added (Tasks 3 and 4).
> 4. **Phase completion kept apart from capability completion.** DP1 closes on each row's DP1 obligation. A row reads "Built" only when its whole acceptance has passed, so six rows stay "Partial" (§0, §3.1, §3.2, DG-14, §8).
>
> The direct consequences, cases, teeth, gates and counts, are updated with them. The scope and the task structure are unchanged.
> **Status: APPROVED by you on 2026-10-23 (revision 3). The plan review is closed.** Your words: "I approve DP1 plan revision 3 and DG-6, DG-7 with option A, DG-8, DG-9, DG-10, DG-12, DG-14, DG-15 and DG-16 as recommended. I confirm DG-19 option B with the corrected engine-result guard." DG-11 is recorded in your words (§2, DG-11).
> - **Still open:** host selection (DG-2), the other task-level decisions (DG-3, DG-4, DG-5, DG-13, DG-17, DG-18), and public exposure, which still needs DG-1.
> - **Execution.** You told me to start only Task 1 and Task 9, in parallel sessions, with their prescribed verification. No other task starts until you say so.
> - **Git.** You run every `git add`, commit and push.
> - **History.** Written on 2026-10-23 against the candidate at `363011f` (branch `feature/opus55-subscription-migration`). Four documents from the previous session were still uncommitted (§11). This plan is uncommitted too: you commit it.
> - **Corrections carried from Task 9 (2026-10-23, your instruction; the design is unchanged).** Four changes, each in the instructions named:
>   1. **Precise storage statements.** The blanket storage statements become a precise one about checker answers, with hosting records and contact correspondence described separately. The mailbox provider is included under either DG-4 option (§0, §1, §4.3, DG-4, Task 9, Task 10, Appendix A.2).
>   2. **Cookie expectations by authentication method** on protected deployments. Preview protection after DG-1 is explicit. A fresh, unauthenticated production-browser check with no bypass credentials is added (§4.2, §4.3, Task 13 check 6, Task 14).
>   3. **The bypass token travels only as a header** (§1, Tasks 11 and 13).
>   4. **The Observability Plus setting is recorded, set, read back and matched** by the privacy notice's retention (Task 11, Task 13 check 11, Appendix B, B-5).
>
>   Source: the data-flow record, `specs/2026-10-23-dp1-data-flow-record.md`, revision 2.
> **Delivers** the 32 board rows of DP1 (`VISION.md` E8; the phase map in `VISION-BOARD.md`), and nothing else.
> **What approval covers.** Approving the plan approves its tasks and their order. It does not give any gate in §2. Each gate is asked for in the words §2 gives, at the point §2 names. Approving one gate lifts nothing for a later phase (E8, rule 5).
> **Not authorised by this document:** implementation, pack edits, deployment, purchases, account creation, accepting terms, runtime work, agent runs, live communication.
> **Sources:**
> - `VISION.md` (E3, E4, E8, D4, D5, choices 3, 4 and 8, laws 3, 6, 9, 16, 22 and 23) and `VISION-BOARD.md`;
> - the questionnaire proposal, revision 3, §4 and §7 to §10 (`specs/2026-10-23-questionnaire-research-and-question-refinement.md`);
> - the QD-4 drafts (`specs/2026-10-23-qd4-content-corrections-for-dp1.md`);
> - `CHECKPOINT-pilot-readiness.md`, `CHECKPOINT-stage-1a-claims-and-access-gate.md` and `CHECKPOINT-opus55-e-article-1-4-exclusion.md`;
> - the code at `363011f`;
> - the hosting research R4 (`side-session-notes/local_043075c1-…/2026-10-22T2049Z-vision-v1/reports/R4-hosting-email-research.md`).
>
> Two read-only research passes ran on 2026-10-23 for this plan. One covered vendor documentation on Vercel and GitHub, the other German and EU legal-page requirements. Their findings are cited where used, with confidence tags; Appendix A summarises the legal pass.
> **Not legal advice.** Nothing here is ratified (law 8; people decision P3). The legal pages are drafts for you and for counsel.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. In this project the user runs every `git add`, commit, merge and push: an executor prepares each change and hands over the exact commands.

**Goal:** Put DataStrata's public site and the revised free checker live on DataStrata's own domain, stateless, with truthful content status, legal pages and monitoring, so that DP1 closes under E8 rule 1.

**Architecture:** The existing Next.js 15.5 application is deployed to a managed host from `main`, behind CI checks. It stays one application, and the engine is wrapped and never changed. The host is chosen at DG-2; provisionally Vercel Pro, with functions in Frankfurt.

The checker runs the engine once for each start year from 2025 to 2028 over the visitor's answers. It returns one row per legal route. DataStrata does not store the visitor's answers.

Two pack corrections, E-1 and E-2, land first, so the checker's routes are right before anyone sees them.

**Tech stack:**
- Node 24.19.0 and npm 11;
- Next.js 15.5.28, React 19, TypeScript 5, zod 3 and vitest 2;
- the `@datastrata/engine` workspace;
- GitHub Actions;
- the host of DG-2;
- DNS at GoDaddy.

## How to read this

- **§0** the summary.
- **§1** the Global Constraints.
- **§2** the gates and decisions, DG-1 to DG-18, each with a recommendation and the decision needed from you.
- **§3** the scope: the 32 rows, what DP1 proves for each and the board status after DP1; the rows that stay Partial; and what stays out.
- **§4** what DP1 runs: the topology, the release path, what is stored, and the hosted routes.
- **§5** the files.
- **§6** how the plan is executed.
- **§7** Tasks 1 to 14.
- **§8** closing the phase.
- **§9** the coverage check.
- **§10** the limits.
- **§11** next steps and commit commands.
- **§12** a review guide for Codex.
- **Appendix A** the legal-page checklist.
- **Appendix B** your acts, in order.

---

## §0. Summary

**What goes live.**
- The public site and the revised free checker, on DataStrata's domain.
- Stateless: DataStrata stores no checker answers, accounts, cookies or IP addresses, and the site collects no email address. Hosting records and any correspondence a visitor chooses to send are described separately (Task 9).
- Truthful content status, legal pages and monitoring.
- The pilot gate (ACC-9) stays available for local screen-shares and is switched off on the host (DG-10).

**Done when** (E8, DP1 row and rule 1):
- production serves the site and the checker from the hosted environment;
- the checker's goldens and the public-route checks pass against it;
- the legal pages carry your approval;
- alerts reach a person;
- a rollback has been rehearsed;
- every row's obligation in §3.1's "What DP1 proves" column is proven on the host.

That is the phase's completion, and the DP1 checkpoint records it. It is separate from capability completion: the board marks a row "Built" only when the row's whole acceptance has passed, so six rows stay "Partial" after DP1 closes (§3.2).

**What this plan needs from you** (§2): 19 gate items.
- **Ten with your approval of the plan:** DG-6 to DG-12 and DG-14 to DG-16. DG-6 and DG-7 are the two content edits. DG-19 is settled: you chose option B on 2026-10-23.
- **Seven before particular tasks:** DG-2, DG-3, DG-4, DG-5, DG-13, DG-17 and DG-18. DG-17 is settled by DG-2: it needs nothing if the host is Vercel.
- **One at go-live:** DG-1, public exposure.

Four items need no decision (§2).

**The tasks.**

| # | Task | Rows delivered | Waits on |
|---|---|---|---|
| 1 | E-1: the Article 40a route starts in 2028 | KNW-1, APP-1 | DG-6, DG-8 |
| 2 | E-2: the third-country issuer route reads "not yet covered" | KNW-14, KNW-1, APP-1 | DG-7, DG-8 |
| 3 | The checker's questions and the facts they set (a new module) | CHK-1, PRF-14 | — |
| 4 | The start-year timeline and the route rows (a new module) | CHK-1, CHK-2, CHK-3, APP-11, KNW-10, KNW-14 | DG-8 |
| 5 | Standard wording for every DP1 state | EXP-9, EXP-3, APP-11, KNW-10 | your approval of the wording |
| 6 | The switch: the check route and page move to the new modules | CHK-1, CHK-2, CHK-3, EXP-3 to EXP-6, PRF-14, KNW-10 | DG-8 |
| 7 | The pilot surface off on the host; error pages | ACC-9, EXP-6, EXP-9 | DG-10 |
| 8 | `/healthz` and structured logs | PLT-6 | — |
| 9 | The data-flow record (document only) | DEP-3, PUB-4 (input) | — |
| 10 | Legal pages, About, pricing, contact text | PUB-1, PUB-2, PUB-4, PUB-5 | DG-4, DG-5, DG-18 |
| 11 | Host configuration, CI on every push, hosted checks | DEP-3, DEP-4, DEP-5, DEP-8, PLT-7, PLT-8, PLT-9, CHK-7 | DG-2, DG-13, DG-15, DG-16, DG-17 |
| 12 | DNS records and their check | DEP-1, DEP-2 | DG-3, DG-4 |
| 13 | Pre-exposure acceptance on a protected preview | all rows, on the host | your acts B-5 to B-10 |
| 14 | Go-live, post-exposure acceptance, rollback and alert rehearsals | DEP-1, DEP-4, DEP-8, PLT-6, PLT-9, CHK-7 | DG-1 |

**Estimate** (E8, rule 6; a hypothesis, not a commitment):
- **Executor work:** about 10 to 13 sessions. Tasks 3 and 4 are the largest.
- **Calendar time:** set mostly by your acts in Appendix B (the domain, accounts, your texts and counsel).
- **Running cost:**
  - about USD 20 a month for one deploying seat on Vercel Pro, plus usage;
  - the firewall's allowed requests are billed at USD 0.65 per million in `fra1`, and blocked requests are not billed [V];
  - the domain is not researched;
  - the uptime monitor is between USD 0 and its paid tier;
  - counsel is not estimated.

---

## §1. Global Constraints

Every task's requirements include this section.

- **Evidence.** `docs/superpowers/TEST-EVIDENCE-STANDARD.md` governs every test and every teeth check.
  - Every task carries a teeth check naming the defect it detects, and its output is recorded verbatim.
  - A red check counts only once its failure message has been read and names the intended assertion.
  - A mutation counts only after the change is confirmed to have landed, by grep, by diff or by a count.
  - The parent re-runs every teeth check itself before the next task starts.
  - The teeth checks in this plan are unrun and are suspect until run (the standard, "Obligations this places on a plan").
- **Done means deployed** (E8, rule 1). DP1 ends only when all four hold:
  - its release runs on the hosted environment;
  - its end-to-end acceptance passes against that environment;
  - a rollback has been rehearsed;
  - monitoring alerts reach a person.

  Local tests alone close neither the phase nor any row.
- **Scope.** Only the 32 DP1 rows (§3).
  - Every task names the board IDs it delivers.
  - No optional improvement is made.
  - A needed behaviour that the board does not describe goes to the board as Suggested first (VISION, "Change control").
- **Behaviour, not reference code.** This plan states behaviour and interfaces; implementers write the code (`CLAUDE.md`).
- **Baselines.** Each task's baseline is the previous task's finishing count, as re-run by the parent.
  - Task 1's baseline is recorded at the start commit.
  - The last recorded counts are engine 84 files / 3,310 tests and frontend 25 / 664 (recorded 2026-10-22, not re-run for this plan).
  - Any difference is explained before Task 1 starts.
- **Where code runs.**
  - Only in a clean clone of the commit you name, with its own dependencies (`npm ci --ignore-scripts`), on Node 24.19.0 and npm 11, under `env -i` with a constructed environment.
  - Never in the candidate, whose `node_modules` are links into `b1b-record` (E4, constraint 8).
- **Servers.**
  - A task may start its own server from the clean clone, on a free loopback port other than 3000, 3001 and 3100, and stops it when it finishes.
  - Never contact a server you run, or the Ollama app.
  - Hosted checks contact only DataStrata's own deployments, and only after you have created them.
- **Engine.** Wrapped, never changed (E4, constraint 6).
  - No file under `backend/engine/src/` changes, and `grep -ri csrd backend/engine/src/` stays at 7.
  - Pack edits happen only in Tasks 1 and 2, through `backend/engine/CLAUDE.md`'s content procedure: draft status, and the legal justification in the commit message.
- **Dependencies.** None is added, runtime or development, in either workspace.
  - `react-dom/server` ships with `react-dom`.
  - A task that finds it needs a dependency stops and asks.
- **Goldens.** Golden artefacts are read, never written, except the changes DG-8 authorises. Each is made as E made its golden changes:
  - the expected diff is written down first;
  - it is produced by a one-off script kept outside the repository;
  - it is read in full before installing;
  - the installed bytes are the reviewed bytes.

  No regeneration path enters the repository.
- **Mutations.** Restored from a copy taken first, never with `git checkout`, and confirmed by sha256.
- **Data.** Synthetic only.
  - Never read, hash, copy or stat the SAP SE profile or its notes.
  - Never touch `b1b-record`, `pilot-evidence`, any `secrets/` folder or the demo copy `demo-15.5.28`.
  - **Searches are explicitly scoped** (your rule, 2026-10-24). Every `find`, `ls`, `grep` or glob, including a subagent's, names an absolute path inside the task's clean clone, the candidate's own tracked tree, or the notes folder. None runs without a path, or from `/Users/vivin/Documents/DataStrata` or above. Every worker brief repeats this rule.
    - *Why:* in Task 2 on 2026-10-23, an implementer ran `find` from `/Users/vivin/Documents/DataStrata`, and it listed directory entries under the protected folders. Nothing there was read, hashed, copied or changed, and the folders were not inspected afterwards.
- **DataStrata stores no checker answers, and the site stores nothing in the visitor's browser.** No answers, accounts, cookies, browser storage or IP addresses, and the site collects no email address.
  - Answers travel only in a POST body, never in a URL. They are used in memory for one request and not kept.
  - Logs carry no answers.
  - What the host and providers keep (hosting records) is listed in the data-flow record (Task 9) and in the privacy notice.
  - **Contact correspondence** is described separately. A visitor may email the imprint's address or call its number (DG-4). That correspondence is kept in DataStrata's mailbox, at the provider DG-4 names: under option A, the provider of the address you already run; under option B, the new mailbox. The privacy notice names it under either option.
- **No live communication.** DataStrata sends no email or message in DP1. Alerts come from providers to staff only (DG-12).
- **No early exposure.** Until DG-1, Vercel Authentication protects all deployments, production included. Its settings are verified before Git is connected, and anonymous and authorised URL checks run once deployments exist (§4.2). It is removed from production only under DG-1, and previews stay protected after DG-1.
- **The 2026-10-19 freeze** stays in force for capture packages and cycles, live runs, promotion, signing, and publishing verification results (DG-11).
- **Truthful labels** (laws 3, 6 and 9).
  - Every result from draft content carries "Draft · evaluation only".
  - The checker's result is labelled preliminary, and its timeline hypothetical.
  - Every EU result carries the national line.
- **Git.**
  - You run every `git add`, commit, merge and push.
  - Messages are imperative and in sentence case, and explain why.
  - No `Co-Authored-By` trailer.
- **File headers.** Every new source file opens with a JSDoc block saying why it exists.
- **Accounts, purchases, terms and agreements** are your acts (Appendix B).
  - An executor never holds an account password, or a token that can change the host's settings.
  - It may hold the preview-access token (Task 11) for the session.
  - The token is sent only in the `x-vercel-protection-bypass` header, never in a URL: the host's runtime logs keep query parameters (Task 9, record V4).

---

## §2. Gates and decisions

| ID | Gate (source) | Recommendation | The decision needed from you | Asked |
|---|---|---|---|---|
| DG-1 | Public exposure for this scope (E3; E8, rule 5) | Approve exposure of exactly the hosted release of §4.4, once Task 13's evidence is complete | "I approve public exposure of the DP1 release at commit `<sha>`." Under it you change production's protection from All Deployments to Standard Protection, the act that exposes the release. Previews stay protected | Go-live (Task 14) |
| DG-2 | The host for a stateless site (choice 8, with D5's data-flow check), decided with your co-founder | Vercel Pro, functions in `fra1`, connected to Git, for DP1 only | The host and plan, after reading Task 9's record | Before Task 11 is applied |
| DG-3 | The domain (DEP-1, your purchase) | Buy it at GoDaddy, turn on two-factor authentication, keep DNS at GoDaddy | The name, and the purchase | Before Task 12 |
| DG-4 | The legal entity for the imprint (business decision 5), and the imprint's contacts | The entity is yours to name. For contact: an email address you already run, plus a telephone number; the new domain publishes no-mail records until DP2 | The entity's details; the email address; the second channel | Before Task 10's texts |
| DG-5 | The legal-page texts (PUB-4), and counsel | Counsel reviews the privacy notice before exposure. The imprint and terms go with your approval. The cookie notice is a section of the privacy notice | Whether counsel reviews; your approval of each text | During Task 10, before DG-1 |
| DG-6 | QD-4 draft E-1 | Approve as drafted | "Apply E-1 as drafted." | Approved 2026-10-23 |
| DG-7 | QD-4 draft E-2, and reason code R | Approve, with option A (`source_status_unresolved`) | "Apply E-2 with option A" (or B) | Approved 2026-10-23 |
| DG-8 | Golden changes in Tasks 1, 2, 4 and 6 | Authorise the four changes listed below, under E's rules | "I authorise the golden changes of DG-8." | Approved 2026-10-23 |
| DG-9 | PRV-3, a Suggested row in DP1 | Not now | Approve PRV-3, or not | Approved 2026-10-23 |
| DG-10 | ACC-9 and the pilot Home on the host | Leave them out of the hosted release: the pilot surface is off unless switched on, and answers 404 on the host. Unchanged locally | Confirm | Approved 2026-10-23 |
| DG-11 | The freeze of 2026-10-19 ("no publishing") | Confirm that it does not cover deploying the public site with draft content labelled | Confirm, in your words | Approved 2026-10-23, in your words (DG-11 below) |
| DG-12 | Monitoring alerts against law 23 | Provider alerts to staff about DataStrata's own systems are outside law 23; P2 stays a DP2 gate | Decide | Approved 2026-10-23 |
| DG-13 | The alert route | Vercel's notifications and spend notifications, plus one external uptime monitor with an EU check location. Both people receive alerts | The monitor's provider and plan (your account) | Before Task 13 |
| DG-14 | Rows whose acceptance reaches later phases | DP1 closes when these rows' DP1 parts are proven. The rows stay "Partial" on the board until the phase that proves their remainder (§3.2) | Approve this separation of phase completion from capability completion | Approved 2026-10-23 |
| DG-15 | PLT-9: limits across instances | A host-level rate-limit rule on `POST /api/check`: 30 requests per 60 seconds per IP address, answered 429 | Approve the mechanism and the numbers | Approved 2026-10-23 |
| DG-16 | DEP-4: branch, merge route and deploy gate | A pull request from the feature branch to `main` for CI. You fast-forward `main` at go-live. Production deploys from `main`, held by Deployment Checks on the three CI jobs | Choose the route and the gate | Approved 2026-10-23 |
| DG-17 | DEP-5, only if the topology uses a container | Not applicable on Vercel. The `Dockerfile` stays, unbuilt, and the reason is recorded | None if DG-2 is Vercel; otherwise the plan is revised | With DG-2 |
| DG-18 | PUB-2's names and biographies | Your text | Names, roles, biographies, and the operating location | Before Task 10 |
| DG-19 | C-7's visibility under the corrected question guard | Settled by you on 2026-10-23: option B, with the corrected guard. The approved C-7 behaviour stays | None | Settled |

**No decision needed:**
- **PUB-5** says "pricing by conversation" until business decision 3.
- **KNW-10** stays draft content, labelled (choice 4).
- **The DP1 checker shows the headline timeline only.** This is derived, not decided:
  - choice 3, settled, puts the full cited result behind the emailed link, which is DP2;
  - QD-1 approved §4.2's timeline as what the checker shows;
  - nothing is public today, so no visitor loses anything.

  Obligations, gaps, evidence expectations, next questions and cautions are deliberately not sent (CHK-2). This is flagged for Codex.
- **CD-1 is not a DP1 correction.** No public page shows CW-001's date of 20 November.
  - The date appears only on `/dashboard`, behind the passphrase gate (`app/dashboard/page.tsx:219`), and DG-10 keeps that off the host.
  - The landing page lists SRC-007 as "adopted · not in force" beside the snapshot date, with no expected date (`lib/pack.ts` `traceSeries`, which reads `sources`, not `changeWatch`).
  - CD-1 is still due on 10 November 2026, on the content track.
  - Task 13 adds one check: no public page may list an act as not in force after its entry-into-force date on the go-live date.

### DG-1. Public exposure

- E3 and the pilot-readiness checkpoint approve only a local screen-share. Public exposure is your separate approval.
- The release to be exposed is §4.4's route list at one commit. Ask for it only once Task 13's `PRE-EXPOSURE-EVIDENCE.md` is complete. Approving it exposes nothing else: no accounts, no email, no stored data.

### DG-2. The host

Choice 8 option A, for its stateless part only:
- Vercel Pro (Hobby is not permitted for commercial use [V: R4 §2.9]);
- functions pinned to `fra1`;
- Git-connected, with Deployment Checks.

The database, storage, email and worker parts of choice 8 are decided at DP2 onward. D5's data-flow check is the condition from DP1 (choice 8, timing), and Task 9 provides it before you decide.

**Facts that bear on it** [V: research, 2026-10-23]:
- Routing middleware, the CDN and the firewall run at the nearest edge in every region. Only the functions are pinned to `fra1`.
- Vercel overwrites `X-Forwarded-For`, so the client address can be trusted for the rate limit.
- Each deployment has its own CDN cache, so a new deployment never serves the previous one's pages.
- On Pro, runtime logs are kept for 1 day, or 30 days with Observability Plus. Observability Plus is on by default for teams created on or after 2026-04-03.

### DG-4. The entity and the imprint's contacts

- § 5 DDG requires an email address and a second fast, direct channel (CJEU C-298/07) [V; Appendix A].
- A contact form would be a new processing operation, and the form is PUB-3, in DP2. A telephone number is the simpler second channel.
- **The email address:**
  - **(A) An address you already run (recommended for DP1).** No new provider joins the hosting. The new domain publishes no-mail records (null MX, `v=spf1 -all`, DMARC `p=reject`) until DP2 brings the email provider. The provider of that address still receives and stores what visitors send there, so Task 9's record and the privacy notice name it.
  - **(B) A mailbox on the new domain.** A mailbox provider joins the processors, and DEP-2's records then include its MX, SPF, DKIM and DMARC.
- Whatever the imprint publishes is public, and stays in web archives.
- If the entity is a UG, its name must carry "UG (haftungsbeschränkt)" (§ 5a GmbHG) [V].

### DG-5. The legal texts, and counsel

Why counsel should review the privacy notice before exposure:
- Vercel's DPA makes Vercel an independent controller for "service-generated data" (usage data and metadata) [3P: the DPA, read in the research].
- The German data-protection authorities' guidance says that a provider which reserves its own purposes falls outside Art. 28. Art. 6(1)(f) then often cannot cover passing it even the IP address [V: DSK, "OH Digitale Dienste", para. 111].
- Vercel's primary processing is in the US. Vercel is listed under the EU-US Data Privacy Framework. The adequacy decision is in force, with an appeal pending (C-703/25 P) [V].

These are judgements for counsel. The imprint and the terms carry lower risk and go with your approval (counsel optional).

**The cookie notice.** No banner is needed when nothing is stored on or read from the visitor's device (§ 25 TDDDG; DSK para. 116) [V]. The notice is therefore a section of the privacy notice, linked as "Cookies" from every page. That keeps PUB-4's four pages as three pages and an anchored section.

**Items the research found that need no page:**
- No ODR link (Regulation (EU) 2024/3228 closed the platform) [V].
- The BFSG is likely out of scope for a B2B check with no consumer contract [V]. EXP-5 applies anyway.
- § 18(2) MStV is likely to matter once published analyses arrive (PUB-6, DP4). Counsel should confirm then. DP1 needs only § 18(1)'s name and address, which the imprint carries.

### DG-8. The golden changes it authorises

1. **Task 1 (E-1).** `backend/engine/test/golden/provenance-engine-golden.json` and `frontend/web/test/golden/provenance-public-golden.json`, rewritten for S-007 version 4: the version, the new locator, the trace, and every result flip that E-1 explains.
   - *Correction found in execution (2026-10-23):* only the public golden changes.
     - The engine artefact's fixed profile is a standalone EU entity with no organisation scope, so the artefact holds no S-007 determination and no versions. S-008's reference cannot reach S-007's condition.
     - The engine artefact is byte-identical after E-1 (`7a9cd1ad…`), and it is not rewritten.
     - The public golden changes in 2 hunks, with one result flip: S-007 goes from INDETERMINATE to DOES_NOT_APPLY. Its counts and headline move with it.
     - Evidence: `side-session-notes/local_043075c1-…/2026-10-23T1704Z-dp1-task1/`.
2. **Task 2 (E-2).** The same two files, for S-024: a new determination, and the counts and any next questions that move with it.
3. **Tasks 4 and 6 (the checker).** Two parts:
   - **Task 4** records a new public generation, `checker-timeline-public-golden.json`, once.
   - **Task 6** retires `provenance-public-golden`'s forward comparison, because its fixed answers can no longer be posed to the revised checker. The artefact's bytes stay, pinned by sha256, as the record of the surface before DP1. This is the precedent of 2026-08-27 (`migration-public-golden.test.ts`).
4. **Untouched:** the historical migration goldens. Their sha256 must not change.

**Rules, as in E** (`CHECKPOINT-opus55-e-article-1-4-exclusion.md`, Task 4):
- the expected diff is written down before generating;
- one-off scripts are kept outside the repository;
- the diff is read in full;
- any change the task does not explain stops the task;
- the installed bytes equal the reviewed bytes;
- Codex reviews the diff.

### DG-9. PRV-3

PRV-3 would generate the privacy page from a register of processors. DP1 has three to five providers, and Task 10's test already fails when the privacy notice omits a provider named in Task 9's record.

**Recommended:** leave PRV-3 Suggested now. DP2's plan can propose it when the database, email and storage providers arrive.

### DG-10. The pilot surface on the host

If the gate were deployed unconfigured, `/dashboard` would show visitors a page listing the missing variable names, and the sign-in route would stay reachable (`app/dashboard/page.tsx`, `unconfigured`). Exposing the passphrase gate publicly needs DEP-6, the independent authentication review, which is a DP2 row.

**Behaviour** (Task 7):
- The pilot surface turns on only when `DATASTRATA_PILOT_GATE=on`.
- With any other value, or none, these answer 404: `/dashboard`, `/pilot-access`, `/api/pilot-access`, `/api/pilot-access/sign-out` and `/login`.
- With the surface off, no secret or profile is read.
- The host never sets the variable. A local screen-share sets it.

ACC-9 itself is unchanged and is removed in the release that turns on accounts, as its row says.

### DG-11. The freeze

Your instruction of 2026-10-19 reads: "No capture package or cycle, no live run, no promotion, no signing, no publishing."
- In this vision, "Publish" authorises a pack revision to reach customers.
- DP1 has no customers and no publication record.
- But DP1 does make the pack, with E-1 and E-2, reach visitors as draft content. So the confirmation needs your words.

**Your decision of 2026-10-23:** "For DG-11: the freeze remains in force for capture packages, cycles, live runs, promotion, signing and publishing verification results. It does not prohibit deploying the DP1 public site with draft content clearly labelled, once the separate public-exposure approval is given (or we can finalise it before deployment, make sure our work plan includes finishing this work as well - why go for draft when we can go for the real one)."

**Your note on finishing the content, and your decision of 2026-10-23:** "Keep the approved DP1 order and the clearly labelled draft-content launch. … Draft status must not relax correctness, testing or truthful customer-facing limitations. Keep completion of the content track committed under the approved phases. Public exposure still requires my separate DG-1 approval."

- **Completion is committed.** Finishing the content is E8 rule 8's content track, committed under the approved phases. It joins the product in DP7 and never holds up DP1 to DP6.
- **Two different things, with separate requirements:**
  - **Verified encoding,** meaning a requirement's encoding checked against its source text. It needs the verification and signing route end to end: promotion, fresh captures on current versions, dispositions, and a named person's signature (Sign; choice 4). **It does not need a legal expert.** The freeze still covers this route, and business decision 6 lifts it run by run.
  - **"Supported",** for one release scenario. It needs verified encoding plus the release policy's separate requirements (choice 4):
    - professional legal ratification wherever the policy requires it (people decision P3);
    - a ratified national-law pack for the scenario;
    - monitoring within cadence;
    - a scenario coverage review.
- **Draft relaxes nothing else.** "Draft · evaluation only" says the content is not yet verified. It does not relax correctness, testing or truthful customer-facing limitations. Every DP1 rule, test, golden and teeth check applies to draft content in full, and every limitation is shown as it is.
- **Public exposure** still requires your separate DG-1 approval.

### DG-12. Alerts and law 23

- Law 23's operating approval "switches scheduled jobs and automated messages on". Every message kind it lists is customer-facing: verification and result links, change notices, the weekly briefing, reminders, security notices.
- DP1's alerts are sent by providers (the host, the monitor) to the two staff, about DataStrata's own systems. No DataStrata job runs on a schedule, and DataStrata sends nothing.

**Recommended:** these alerts are outside law 23. P2 stays a DP2 gate.

**The failure case:** a DataStrata-run schedule that probes the site, for example a GitHub Actions cron, would be DataStrata's own scheduled job and fall under law 23. DP1 therefore uses none.

**Alternative:** bring P2 forward, so that you, or both of you, give the operating approval for DP1's environment, covering alerts only.

If you approve the recommendation, the closing step (§8) proposes a one-line clarification of law 23 under change control.

### DG-13. The alert route

**Facts** [V: research, 2026-10-23]:
- Vercel has no built-in uptime check.
- Its anomaly alerts need Observability Plus, start only after 24 hours of data, and may never fire on a low-traffic site.
- Deployment-failure notifications go only to the deployment's creator.

**Recommended:**
- Vercel notifications on, for your account.
- Spend Management notifications at 50, 75 and 100 percent of a budget you set.
- One external uptime monitor:
  - checking `/healthz` and `/` at least every 5 minutes, from an EU location;
  - alerting both people by email after two consecutive failures.

**Leads for the monitor** [X]: Checkly, UptimeRobot, Better Stack. Their free tiers' commercial-use terms and data locations are unconfirmed, so you read the terms.

The monitor is a processor (probe records, recipients' addresses). It joins Task 9's record and the privacy notice.

### DG-15. The rate limit

Facts [V: research, 2026-10-23]:
- Vercel's firewall offers rate-limit rules on Pro, by IP address, with a 429 by default.
- A rule matches path and method, and takes effect without a redeploy.

**What 30 requests per 60 seconds allows.** A person needs at least half a minute per check, so the limit is generous for people. It caps a scripted burst at one address.

**Assumptions and failure cases:**
- **Counters are kept per region**, so traffic spread across several edge regions can exceed the limit [V]. A distributed flood is not prevented. It is bounded by the 8 KiB body limit, the engine's small cost per check, and the spend notifications.
- **A shared office address** shares one budget.
- **Whether rules also apply to previews** is unconfirmed [?]. The burst test therefore runs on production, in Task 14.

**The alternative, a limit stored by the application,** would hold IP addresses. That brings in PRV-1, a DP2 gate.

CHK-7's per-email limits arrive with the email gate, in DP2.

### DG-16. Branch, merge route and deploy gate

**Facts:**
- `main` is an ancestor of the feature branch, 181 commits behind (read 2026-10-23).
- CI runs only on pull requests and on pushes to `main` (`.github/workflows/checks.yml`, `standalone.yml`), which is why it has never run.
- Protected branches on a private repository need a paid GitHub plan [V].
- Vercel's Deployment Checks hold a production deployment off the production domains until the required GitHub checks pass. They are available to any GitHub-connected project [V]. "Force Promote" bypasses them.

**Recommended:**
1. Task 11 makes CI run on every push and every pull request.
2. A pull request from the feature branch to `main` shows the runs. You open it (an outward-facing act).
3. The host's production branch is `main`, and Deployment Checks require the three jobs: `npm test`, `npm run typecheck`, and the standalone artifact.
4. `main` does not move until go-live. After DG-1 you fast-forward it to the release commit and push. Production then builds behind Vercel Authentication, and removing that protection under DG-1 is the act of publishing.
5. Force Promote, which bypasses Deployment Checks, is never used. Undoing the rehearsed rollback (Task 14) uses the ordinary promotion of a deployment whose checks passed.

**Alternative:** deploy from CI with a host token (`vercel deploy --prebuilt --prod`). That stores, in GitHub, a token able to deploy production. Not recommended.

### DG-18. About

`lib/company.ts` holds:
- `legalEntity: null`;
- `locations: []`;
- two team entries with `name: null` and `bio: null`.

PUB-2 needs your names, roles, biographies and the operating location. No placeholder may remain anywhere on the site.

### DG-19. C-7's visibility (settled)

**Your decision of 2026-10-23:** "Use DG-19 option B with the corrected guard: keep the approved C-7 behaviour. Count genuine changes in relevant exemption determinations as useful outcomes, comparing underlying engine results in the same context. A change caused only by showing or hiding a line does not count."

**What follows:**
- **C-7's rule.** It keeps QD-1's approved rule, made exact in Task 3.
- **The guard.** Task 4's question guard counts a different engine result for a relevant exemption determination as a useful outcome. Showing or hiding a line, by itself, never counts.
- **Withdrawn:** revision 2's option A rule. Teeth check T4f3 is redefined for option B (Task 4).
---

## §3. Scope

### 3.1 The 32 rows

Each row records two things, kept apart:
- **What DP1 proves:** the row's obligation in this phase. DP1 closes when every row's obligation is proven on the hosted environment, together with E8's done-when (§0).
- **The board status after DP1:** the capability's own status. A row is "Built" only when its whole end-to-end acceptance has passed. A row whose acceptance reaches a later phase stays "Partial" even though DP1 is done (§3.2).

| Row | Built today | What DP1 proves | Tasks | Board status after DP1 |
|---|---|---|---|---|
| ACC-9 | Built | Unchanged locally; off (404) on the host | 7 | Built, unchanged. Removed in the release that turns on accounts, as its row says (DG-10) |
| APP-1 | Built | Golden profiles P-001 to P-012 green; no engine code changed | 1, 2 | Built |
| APP-11 | Partial | Every "cannot decide yet" cell on the check shows its coded reason and its next step | 4, 5, 6 | Built (a standing requirement, §3.2) |
| CHK-1 | Partial | C-1 to C-10, the bands, "Not sure" everywhere, the start-year timeline, the goldens, on the host | 3, 4, 6 | Built |
| CHK-2 | Partial | Every field `/api/check` returns is rendered; everything else is deliberately not sent | 4, 6 | Built |
| CHK-3 | Partial | The headline timeline at once, labelled preliminary and draft | 4, 6 | Partial (§3.2) |
| CHK-7 | Partial | The per-address limit on `POST /api/check` holds under a scripted burst on the host | 11, 14 | Partial (§3.2) |
| DEP-1 | Not built | The domain resolves to the hosted app over HTTPS | 12, 14 | Built |
| DEP-2 | Not built | The app's records, and the no-mail records (or the mailbox's), pass the DNS check | 12, 14 | Partial (§3.2) |
| DEP-3 | Not built | Production in the chosen EU region; previews protected and holding no production data; D5's data-flow check done | 9, 11, 13, 14 | Partial (§3.2) |
| DEP-4 | Partial | CI on every push; a red run holds production | 11, 14 | Built |
| DEP-5 | Not built | Recorded as not applicable on the chosen host (DG-17) | 11 | Not built; its evidence column records "not applicable on Vercel (DG-17)" |
| DEP-8 | Partial | The smoke suite passes against the hosted URL after each deploy | 11, 13, 14 | Built |
| EXP-3 | Partial | States in words and shapes on every DP1 screen | 5, 6 | Built (standing) |
| EXP-4 | Partial | Every DP1 page passes at phone width | 6, 13 | Partial (§3.2): its acceptance names the briefing and the inbox |
| EXP-5 | Not verified | An accessibility review of each DP1 screen passes | 6, 10, 13 | Built (standing) |
| EXP-6 | Partial | Truthful error and failure states on every DP1 screen | 6, 7 | Built (standing) |
| EXP-9 | Partial | A content specification for every DP1 state, and the test | 5, 7 | Built (standing) |
| KNW-1 | Built as draft content | 24 requirements, with full referential integrity | 1, 2 | Built as draft content |
| KNW-5 | Built | Unchanged; re-checked on the host | 13 | Built |
| KNW-10 | Not built | The threshold in force (draft, labelled) shown on the check page, citing the decision | 4, 5, 6 | Built |
| KNW-14 | Not built | S-024. The issuer line reads "not yet covered", and a golden fails if it reads "does not apply" | 2, 4 | Built |
| PLT-6 | Partial | `/healthz` for DP1's inputs, structured logs, alerts to a person | 8, 13, 14 | Partial (§3.2) |
| PLT-7 | Partial | No secret in the repository or the build; DP1's one secret, the preview-access token, rotated once | 11, 13 | Built |
| PLT-8 | Built | Re-checked on the host | 13, 14 | Built |
| PLT-9 | Partial | A host-level limit that holds across instances (DG-15) | 11, 14 | Built, with DG-15's per-region assumption in its evidence |
| PRF-14 | Built for the check | A first answer with nothing but a browser, on the host | 13 | Built (standing: DP2's onboarding must meet it too) |
| PRV-3 | Suggested | Only if DG-9 approves it | — | Suggested (recommended) |
| PUB-1 | Built | Re-checked after E-2 (24 requirements), on the host | 2, 13 | Built |
| PUB-2 | Partial | Your names and biographies; no placeholder anywhere | 10, 13 | Built |
| PUB-4 | Not built | Imprint, privacy notice (with its cookie section) and terms, linked from every page, naming the controller and every provider, with your approval | 9, 10, 13 | Built |
| PUB-5 | Not built | A pricing page: "pricing by conversation" | 10 | Built. Its acceptance covers the period before business decision 3 |

### 3.2 Rows whose full acceptance needs a later phase (DG-14), and standing requirements

**Rows that stay Partial after DP1.**
- DP1 proves the part in the second column. That part counts toward DP1's completion.
- The row's acceptance text is unchanged, and its board status stays "Partial".
- The phase in the last column proves the remainder against its own hosted environment. Only then does the row become "Built".
- The checkpoint hands each remainder forward as an obligation, and that phase's plan must include it.

The board never shows such a row as Built while part of its acceptance is unproven, and DP1's completion is never read from these rows' statuses (§8).

| Row | Proven in DP1 | The remainder | Proven in |
|---|---|---|---|
| CHK-3 | The headline at once, labelled preliminary and draft | The on-screen headline and the emailed link's full result come from the same stored run | DP2, with CHK-4 |
| CHK-7 | Per-address limits under a scripted burst on the host | Per-email limits; the gate cannot send mail to third parties | DP2, with CHK-4 |
| DEP-2 | The app's records; the no-mail records (or the mailbox's) | The sending provider's SPF, DKIM and DMARC | DP2, with the email provider |
| DEP-3 | Production in `fra1`; previews protected and holding no production data; D5's data-flow check | The always-on scheduler; workflow records carrying identifiers only; row-level security (D5 condition 3); scanning isolation (condition 4); approval of the full topology | DP2 and DP4 |
| PLT-6 | `/healthz` checks pack integrity, the runtime inputs and the engine; structured logs; alerts reach a person | `/healthz` checks the database and storage (DP2) and the queue (DP4 and DP6); failed jobs and coverage gaps alert a person | DP2, DP4, DP6 |
| EXP-4 | Every DP1 page at phone width | The briefing and the "Needs you" inbox | The phases that build them |

**Standing requirements.** EXP-3, EXP-5, EXP-6, EXP-9, APP-11 and PRF-14 are rules every screen must meet, not workflows that finish.
- Each is Built when every screen shipped so far meets it.
- E8 rule 7 makes each later phase re-check them for its own screens.
- A later screen that fails one reopens the row as Partial until it is fixed.

### 3.3 Out of scope

Named so that no task builds them:
- the email gate, registration, the newsletter and stored checker answers (CHK-4, 5, 6, 8, 9);
- the contact form's delivery (PUB-3, DP2);
- published analyses and the knowledge status page (PUB-6, PUB-7);
- accounts and the authentication review (ACC-1 onward, DEP-6);
- the retention policy (PRV-1);
- every PRF, APP-2 onward and RC row;
- questions C-11 to C-15;
- content items CD-1, CD-2, CD-4, CG-2 to CG-4, DI-1 to DI-3, NA-1 to NA-6 and NF-1 to NF-6;
- building the container image;
- analytics, the host's analytics and speed tools, and any tracking;
- self-hosting the fonts, so the intermittent Google Fonts build failure stays a known risk (pilot-readiness checkpoint);
- widening the Content-Security-Policy.

---

## §4. What DP1 runs

### 4.1 Topology

| Layer | DP1 | Note |
|---|---|---|
| Web and API | The host of DG-2. Provisionally Vercel Pro, functions in `fra1`, root directory `frontend/web`, files outside the root included in the build | The edge (CDN, firewall, routing middleware) runs in every region; only the functions are pinned |
| Database, storage, queue, email, worker | None | Their parts of choice 8 are decided from DP2 |
| DNS | GoDaddy: an apex A record and a `www` CNAME to the host's values | Never GoDaddy's domain forwarding (R4 §8.3) |
| CI | GitHub Actions: `npm test`, `npm run typecheck`, `npm run test:standalone`, on every push and pull request | |
| Deploy gate | Deployment Checks on those three jobs (DG-16) | |
| Rate limit | The host's firewall rule (DG-15) | |
| Monitoring | `/healthz`; the host's notifications; one external uptime monitor (DG-13) | |
| Secrets | One: the host's protection-bypass token for automation, used by the hosted checks against protected previews | |

### 4.2 The release path

1. Tasks 1 to 12 land as commits on the feature branch. You commit and push.
2. Every push runs CI and builds a protected preview.
3. Task 13 runs the pre-exposure acceptance against the protected preview of the release commit.
4. You give DG-1.
5. You fast-forward `main` to the release commit and push it. The host builds production, Deployment Checks hold it until CI passes, and it is then assigned to the production domains.
6. You add the custom domain and enter the DNS records (Task 12).
7. Task 14 runs the post-exposure acceptance and the rehearsals.
8. The phase closes (§8).

**Preventing exposure before DG-1** (your correction of 2026-10-23).
- **One protection, set first.** Vercel Authentication is set for **All Deployments**, production included, before Git is connected (B-5). From then on, every deployment the project makes answers only to people signed in to your team. That covers a preview, an early merge's production build, and the old `main` if connecting deploys it.
- **What Vercel states** [V: https://vercel.com/docs/deployment-protection, last updated 2026-09-15; https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication, last updated 2026-09-15, both read 2026-10-23]:
  - "Protecting all deployments is available on all plans."
  - All Deployments protects all URLs, including the production domain and the generated `*.vercel.app` URLs.
  - "Vercel Authentication for All Deployments and Deployment Protection Exceptions do not require a paid add-on."
  - Vercel Authentication is available on all plans. Its API scope for All Deployments is `ssoProtection.deploymentType: "all"`.
  - The protection applies to every request, Routing Middleware included.
  - **Vercel also names its bypasses:** shareable links, protection bypass for automation, and trusted sources. So no shareable link is created, no trusted source is added, and the automation token is held as Task 11 says.
  - **Disabling Vercel Authentication unprotects every existing deployment.** So DG-1 changes the scope, and never disables the protection.
  - **The account-level checks stay,** because a documentation statement is not the account's setting.
- **Verified in two stages:**
  1. **Before Git is connected:** the project's Deployment Protection settings are read back, with you, on the account. Vercel Authentication must be enabled, with the scope All Deployments.
  2. **Once deployments exist,** the first preview and, once there is one, a production deployment:
     - an anonymous request to each URL is refused, with Vercel's login redirect or a refusal, never the page;
     - an authorised request, with the automation token, is served, the positive control.

  Task 13 repeats the URL checks on the deployments it uses.
- **Removed only under DG-1.** After DG-1 you change production's protection to Standard Protection. That change is the act that exposes the release, and nothing else lifts the protection.
  - **Preview protection stays after DG-1.** Standard Protection (`prod_deployment_urls_and_all_previews`) leaves only the production domain public. Every preview, and every generated production deployment URL, stays behind Vercel Authentication (Task 9, record §9).
  - **Then a fresh, unauthenticated production-browser check** runs (Task 14, step 4). It uses a new browser profile that has never signed in to Vercel and carries no bypass header, query parameter or cookie.
- **The pilot surface stays disabled on the host** (DG-10, Task 7), both behind the protection and after it.

**If a check finds a deployment answering without authentication before DG-1:**
- the step stops;
- you delete what was deployed;
- the window is recorded in the evidence;
- Codex is told.

### 4.3 What is stored, and by whom

- **DataStrata, in DP1: no checker answers.**
  - The check's answers exist only in the browser's memory and in the function's memory for one request.
  - Logs carry an event name, the route, the status, the duration and the release, nothing else (Task 8).
- **Hosting records.** The host and providers keep what Task 9 lists: request records with IP addresses at the host, the firewall's records, build logs, monitor probes. The privacy notice names each one.
- **Contact correspondence**, described separately. Correspondence a visitor chooses to send by email or telephone is kept in DataStrata's mailbox, at the provider DG-4 names: under option A, the provider of the address you already run; under option B, the new mailbox. How long it is kept is your decision, for the privacy notice (Task 9).
- **The visitor's browser.** The site sets no cookie and no web storage. Fonts are self-hosted at build, so no request leaves for a third party.
  - On a protected deployment, Vercel's own cookies depend on the authentication method (Task 9, record §9):
    - none with the bypass header alone;
    - Vercel's bypass cookie alone with `x-vercel-set-bypass-cookie`;
    - Vercel's authentication cookie alone for a signed-in team member.
  - Task 13 checks this on the protected preview, and Task 14 on production, in a fresh, unauthenticated browser.

### 4.4 The hosted release

| Route | On the host |
|---|---|
| `/` | The landing page; its figures read from the pack at build (PUB-1) |
| `/check` | The checker (Task 6) |
| `POST /api/check` | The timeline (Task 4). 8 KiB body limit (B4). 30 per 60 seconds per IP address at the host (DG-15) |
| `/company` | About (PUB-2) |
| `/pricing` | New: pricing by conversation (PUB-5) |
| `/imprint`, `/privacy`, `/terms` | New (PUB-4). Cookies at `/privacy#cookies` |
| `/contact` | Delivery stays unconfigured (PUB-3 is DP2). The page's text points to the imprint's contacts. `POST /api/contact` keeps its existing unconfigured answer |
| `/healthz` | New (PLT-6) |
| `/dashboard`, `/pilot-access`, `/api/pilot-access`, `/api/pilot-access/sign-out`, `/login` | 404 (DG-10) |
| Any other path | The standard 404 page (Task 7) |
| Every path, before DG-1 | Refused to anyone not signed in to your team (Vercel Authentication, All Deployments) |

---

## §5. Files

| Path | Change | Task | Responsibility |
|---|---|---|---|
| `backend/engine/knowledge/csrd/requirements.json` | Modify | 1, 2 | S-007 version 4; S-024 version 1 |
| `backend/engine/knowledge/csrd/catalogues.json` | Modify | 2 | `encoded_issuer_routes`, with no entries |
| `backend/engine/verification/requirement-versions/csrd.json` | Modify (append) | 1, 2 | Registry entries for S-007 v4 and S-024 v1; history kept |
| `backend/engine/test/historical-requirements/CSRD-S-007.v3.json` | Create, if the registry's procedure requires it (as S-001 v3 did in E) | 1 | The superseded text, pinned. *Not needed in execution (2026-10-23): no S-007 recording exists, and no registry test asks for it* |
| `backend/engine/test/golden-profiles.test.ts` | Modify | 1, 2 | P-011, P-012 |
| `backend/engine/test/golden/provenance-engine-golden.json`, `frontend/web/test/golden/provenance-public-golden.json` | Rewrite (DG-8) | 1 (public only, as executed), 2 | |
| `backend/engine/test/audit-expected-provenance.ts`, `min-status.test.ts`, `pipeline-source-completeness.test.ts`, `corpus-src002-ingestion.test.ts`; `frontend/web/test/provenance-public-golden.test.ts`, `pilot-record.test.ts` | Modify | 1 (added in execution, authorised by you on 2026-10-23, oracle option A) | E-1's citation, kept in a separate post-audit corrections table, with the audit's table and count unchanged; S-007 at version 4; the SRC-002 population; E-1's one flip in the public transition; the pilot record's four flips |
| Count-pinning tests (`knowledge-integrity.test.ts:21`, `coverage.test.ts`, `pilot-dashboard.test.ts:44,71`, `status-truth-boundary-public.test.ts`, and any the red run names) | Modify | 2 | 23 becomes 24, each with its reason |
| `frontend/web/lib/check-answers.ts` | Create | 3 | Questions, show-when rules, bands, the facts each answer sets, the answer schema |
| `frontend/web/lib/countries.ts` | Create | 3 | ISO 3166-1 alpha-2 names for "Another country" |
| `frontend/web/lib/check-routes.ts` | Create | 4 | The route-row table (proposal §4.2; rule R) |
| `frontend/web/lib/check-timeline.ts` | Create | 4 | `buildCheckTimeline` and the payload contract |
| `frontend/web/test/checker-cases.json` | Create | 4 | The authored oracle: §4.6, §4.4, §9.2 and KNW-14 cases. One file, two runners |
| `frontend/web/test/golden/checker-timeline-public-golden.json` | Create (DG-8) | 4 | The new public generation |
| `frontend/web/lib/wording.ts` | Create | 5 | The standard wording: the content specification as data |
| `frontend/web/app/api/check/route.ts` | Modify | 6, 8 | The new schema and the timeline (6); one log line (8) |
| `frontend/web/lib/checker.ts`, `lib/checkResponse.ts` | Delete | 6 | Replaced once nothing imports them |
| `frontend/web/lib/check-view.ts` | Create | 6 | Timeline plus wording, giving the view model (pure) |
| `frontend/web/components/marketing/CheckFlow.tsx`, `CheckTimeline.tsx` (new) | Modify, create | 6 | The question flow; the presentational timeline |
| `frontend/web/app/check/page.tsx`, `frontend/web/app/page.tsx` | Modify | 6 | Copy that states counts derives them from the question model |
| Every importer of the old modules: `test/claims.test.ts`, `check-response.test.ts`, `status-truth-boundary-public.test.ts`, `public-resolver-seam.test.ts`, `public-api-body-limits.test.ts`, `migration-public-golden.test.ts` (types only), `provenance-public-golden.test.ts` (retirement), `deployment-projection.ts`; `scripts/test-standalone.mjs`, `deployment-agreement.mjs`, `standalone-harness.mjs`, `smoke-production.mjs` (the answers they post) | Modify | 6 | Re-expressed over the timeline, meaning kept |
| `frontend/web/lib/hosting-mode.ts` | Create | 7 | `pilotSurfaceEnabled(env)` |
| `frontend/web/middleware.ts`, the four pilot routes and pages, `app/login/page.tsx` | Modify | 7 | 404 when the surface is off |
| `frontend/web/app/not-found.tsx`, `app/error.tsx` | Create | 7 | Standard wording |
| `frontend/web/lib/health.ts`, `app/healthz/route.ts`, `lib/log.ts` | Create | 8 | Health report; structured log lines |
| `docs/superpowers/specs/<date>-dp1-data-flow-record.md` | Create | 9 | D5 condition 2, with one machine-readable provider block |
| `frontend/web/content/legal/{imprint,privacy,terms}.json` | Create | 10 | Your approved texts, as structured paragraphs |
| `frontend/web/app/{imprint,privacy,terms,pricing}/page.tsx` | Create | 10 | |
| `frontend/web/lib/company.ts`, `app/company/page.tsx`, `app/contact/page.tsx`, `components/marketing/Footer.tsx` | Modify | 10 | PUB-2; contact text; footer links; the Sign-in link removed |
| `vercel.json` (at the root directory the host uses) | Create | 11 | Region `fra1` |
| `.github/workflows/checks.yml`, `standalone.yml` | Modify | 11 | Run on every push |
| `scripts/smoke-production.mjs` | Modify | 11 | A read-only `--url` mode against a hosted origin |
| `scripts/hosted-checker-goldens.mjs` | Create | 11 | Runs `checker-cases.json` against a hosted `/api/check` |
| `docs/operations/dp1-host-configuration.md`, `docs/operations/dp1-runbooks.md` | Create | 11 | Every console setting's intended value; deploy, rollback and token-rotation runbooks |
| `scripts/check-dns.mjs`, `docs/operations/dp1-dns-records.md` | Create | 12 | DNS expectations and the check |
| New tests named in each task | Create | 3–12 | |

`<date>` in Task 9's file name is the date the record is written, in the `YYYY-MM-DD` form the specs folder uses.

---

## §6. How the plan is executed

- **The clean clone.**
  - Clone the commit you name into a new directory outside the candidate.
  - Run `npm ci --ignore-scripts` on Node 24.19.0 and npm 11, under `env -i`.
  - Record `git rev-parse HEAD`, the toolchain versions and the baseline counts.
  - Check `grep -ri csrd backend/engine/src/` = 7.
- **The evidence folder.** `side-session-notes/local_043075c1-…/<UTC date and time>-dp1/` holds:
  - `README.md` and `MANIFEST.sha256`;
  - per task: the brief, the report, red and green logs, the diff, and each teeth check's mutation and verbatim output;
  - the parent's re-runs.

  Times are in UTC, and say so. Earlier folders in these notes used Indian Standard Time with a "Z" suffix.
- **One fresh subagent per task.**
  - The parent writes the brief from this plan, reviews the result, and re-runs every teeth check itself before the next task.
  - Tasks 13 and 14 are run by the parent, because each step waits on one of your acts.
  - Task 9, a document only, may run beside Tasks 1 to 8. Every other task runs one at a time, so that each baseline is the previous task's finishing count.
- **Order.** Tasks 1 to 14 in order, apart from Task 9.
  - Task 1 waits for DG-6 and DG-8; Task 2 for DG-7.
  - Task 3 may start after Task 2, so that its engine runs use the corrected pack.
- **Red first.** Every behavioural test is written and seen failing, with the failure read, before the implementation exists. If a test passes first time, it is mutated before it is relied on (failure mode 3).
- **Stops.** A task stops and reports when:
  - an unexpected test goes red;
  - a golden other than those DG-8 lists changes;
  - a dependency is needed;
  - an engine file would change;
  - a gate it waits on is not yet given.
- **Commits.** Each task ends with its change handed to you as one commit, with the exact `git add` paths and a draft message. Nothing is committed for you.
- **Codex.**
  - Codex reviews Tasks 1 and 2 (the route QD-4 §5 sets), Tasks 3 and 4 together (the checker), and Task 10's texts.
  - The whole phase is reviewed at closing (§8).
  - One review round per item, a second only if Codex asks.

---

## §7. Tasks

### Task 1: E-1, the Article 40a route starts in 2028 (CD-3)

**Delivers:** KNW-1, APP-1; the correctness of the checker's Article 40a row.
**Waits on:** DG-6, DG-8.

**Files:**
- `backend/engine/knowledge/csrd/requirements.json` (S-007 only);
- `backend/engine/verification/requirement-versions/csrd.json` (append S-007 version 4; keep version 3);
- the historical record of S-007 version 3, if the registry's tests require one (the E precedent);
- `backend/engine/test/golden-profiles.test.ts`;
- the two provenance goldens (DG-8).

*Correction found in execution (2026-10-23).* The change touches ten files:
- **The four from the list above that change:**
  - `requirements.json`;
  - the registry;
  - `golden-profiles.test.ts`;
  - the public provenance golden.
- **Not changed:**
  - the engine provenance golden, which is unchanged (DG-8, part 1);
  - the historical record, which is not needed.
- **Six supporting test files, authorised by you on 2026-10-23 with oracle option A** (§5).
  - E-1's `SRC-002` citation is recorded in a separate `POST_AUDIT_CORRECTIONS` table. The audit's table and its count of 18 are unchanged.

**Behaviour.** Exactly as QD-4 §2 drafts it:
- version 3 becomes 4;
- `condition.of` gains a first conjunct, `{ "op": "fy_starts_on_or_after", "date": "2028-01-01" }`;
- `plainEnglish` gains the sentence "The route applies for financial years starting on or after 1 January 2028.";
- `provenance` gains `SRC-002`, with the locator "Article 5(2), second subparagraph";
- ratification stays draft.

**Tests (red first):**
- Golden P-011: P-006's facts, assessed for FY2027.
  - Must: S-007 and S-008 do not apply.
  - Must not: either applies before 2028.
- Positive control: P-006 for FY2028 still applies.
- The registry and integrity tests stay green with the new entry. The executor follows how E registered S-001 version 4, and reports each file it touched.

**The golden step.** Before generating, write down the expected diff of both provenance goldens: S-007's version, its new locator and its new trace child. Then name every result that flips for the fixed FY2027 profile.

For example, S-007, S-008 or S-009 may move from "cannot decide yet" to "does not apply", and the counts or next questions may move with them. Each flip is explained by the Directive's own 2028 date. A flip that E-1 does not explain stops the task.

*Correction found in execution (2026-10-23).* Of S-007's version, its locator and its trace child, the engine golden carries none, and it does not change. The public golden carries the locator and the flip, but no version and no trace.

The observed flips, all for FY2027:
- **Public golden:** S-007, from INDETERMINATE (`missing_fact`) to DOES_NOT_APPLY. The counts go from 6 / 11 / 3 to 6 / 12 / 2, and the headline from 2 to 1 unresolved.
- **The synthetic pilot record:**
  - S-007 on `org`;
  - S-008 on `e-de`, `e-nl` and `e-fr`, which follow it.
  - Its counts go from 60 / 44 to 64 / 40. Q-006 moves down the next questions.

**Teeth.** The new conjunct deleted.
- P-011 must fail on its own assertion.
- The two rewritten provenance goldens must also go red, because they pin the conjunct's trace. That is expected.
- No other test may go red.

*Correction to QD-4's wording,* which said "nothing else may": the goldens rewritten under DG-8 detect the same change.

*Correction found in execution (2026-10-23), confirmed by the run:*

**How the mutation must be made.** Deleting the conjunct alone leaves S-007 declaring version 4 with content that no longer hashes to version 4's entry. `loadPack` then refuses the pack with `VersionIntegrityError` before any assertion runs. The literal run collected "no tests", the standard's failure mode 2.
- So the mutant deletes the conjunct **and** re-registers version 4 under the mutant's own digest.
- Both files are copied first, restored from the copies, and confirmed by sha256.

**What goes red: five tests, each on its own assertion.**
- **P-011's two FY2027 tests:**
  - `expected 'APPLIES' to be 'DOES_NOT_APPLY'`;
  - `expected 'APPLIES' not to be 'APPLIES'`.
- **The public golden, byte for byte:** exactly E-1's flip, reversed.
- **The named E-1 case in `provenance-public-golden.test.ts`:** `expected 'INDETERMINATE' to be 'DOES_NOT_APPLY'`.
- **The pilot record's count:** `to have a length of 64 but got 60`.

**What stays green:**
- the engine provenance golden, which never reaches S-007's condition;
- P-011's FY2028 control;
- every source and registry test;
- the public transition tests, which compare the two artefacts on disk and so cannot see a pack mutation.

A second mutation removed E-1's `SRC-002` citation, to prove the new oracle entry can fail. It reddened exactly five tests, each naming S-007's missing source:
- `pipeline-source-completeness`;
- `corpus-src002-ingestion`;
- the public byte test;
- the public oracle test;
- the named E-1 case.

**Baseline:** the counts recorded at the start commit. **Finishing count:** the baseline plus P-011's tests.
- *As executed (2026-10-23):* engine 84 / 3,310 → 84 / 3,313 (P-011's three); frontend 25 / 664 → 25 / 665 (the named E-1 case).

**Commit message** (the QD-4 draft): "Start the Article 40a route in 2028 so non-EU groups are not told it applies to earlier financial years (CSRD Art 5(2), second subparagraph)"

### Task 2: E-2, the third-country issuer route reads "not yet covered" (KNW-14, CG-1)

**Delivers:** KNW-14 (its content side), KNW-1, APP-1.
**Waits on:** DG-7 (with option A or B), DG-8.

**Files:**
- `catalogues.json`;
- `requirements.json`;
- the registry;
- `golden-profiles.test.ts`;
- the two provenance goldens;
- the count-pinning tests (§5).

**Behaviour.** Exactly as QD-4 §3 drafts it:
- **The catalogue** `encoded_issuer_routes`: `entries: {}`, `missReason` R, and a note saying no country's issuer route is encoded yet.
- **CSRD-S-024, version 1,** "Third-country issuer route (Transparency Directive): not yet encoded":
  - scope `legal_entity`, kind `boolean`, `in_force`, `direct_legal`, decision area "Issuer scope", severity high;
  - condition: `all` of `not in_catalogue(entity.incorporation_country, eu_member_states)` and `in_catalogue(entity.incorporation_country, encoded_issuer_routes)`;
  - the plain English and the caution as drafted;
  - provenance `SRC-002`, with the locators "Article 2" and "Article 5(2), third subparagraph";
  - draft.
- **With option A,** no engine file changes.
- **With option B,** this plan stops: B is an engine change against E4 constraint 6. It needs your explicit exception and its own task.

**Tests (red first).** Golden P-012:
- a US-registered company reads S-024 indeterminate, with reason R asserted and never "does not apply";
- positive control: an FR-registered company reads "does not apply";
- an unknown country reads `missing_fact`.

**The knock-on, stated in advance.**
- **Requirement counts move from 23 to 24.** Every red test is listed with its failure message before anything changes.
- **A count pinned as an integrity assertion** (`knowledge-integrity.test.ts:21`) becomes 24, with the reason.
- **A count a page derives from the pack** keeps deriving it. Where a test pins the page's copy, it is updated to the derived value.
- **Any other red stops the task.**
- **The landing page and the coverage register** read "0 of 24 requirements signed" by derivation (PUB-1).

**The golden step.** As in Task 1. The expected diff names:
- S-024's determination;
- the counts;
- any next questions that move.

**Teeth.**
- **The catalogue given an entry `"US": false`.** P-012's US case must fail on its own assertion.
  - If the failure is instead an integrity error at load (a pack-level digest), the mutation is wrong, not the code (failure mode 2).
  - The executor then applies the mutation to an in-memory copy of the loaded pack, and records which way was used.
- **The first conjunct deleted.**
  - The FR control must fail.
  - The provenance goldens also go red, which is expected.
  - Nothing else may go red.

**Baseline:** Task 1's finishing count.

**Commit message** (the QD-4 draft): "Show the third-country issuer route as not yet covered so a non-EU result never reads as no duty while the Transparency Directive route is unencoded (CSRD Art 2 and Art 5(2), third subparagraph)"

### Task 3: the checker's questions and the facts they set (QD-1: proposal §4.1, §4.3, §4.4)

**Delivers:** CHK-1, PRF-14.

**Files:**
- `frontend/web/lib/check-answers.ts` (new);
- `frontend/web/lib/countries.ts`;
- tests `test/checker-answers.test.ts` and `test/checker-bands.test.ts`.

The old `lib/checker.ts`, the route and the page are untouched until Task 6. Every commit therefore leaves a working check page.

**Interfaces. Produces:**
- **`CheckerAnswers`.** One field per question, each optional:
  - `country`: a listed EU code, a listed non-EU code, `other` or `not_sure`;
  - `countryOther`: an ISO 3166-1 alpha-2 code, only with `other`;
  - `group`: `none`, `parent`, `owned`, `both` or `not_sure`;
  - `organisation`: `private_limited`, `public_limited`, `bank`, `insurer`, `fund`, `something_else` or `not_sure`;
  - `employees` and `turnover`: each a band id, `{ exact: number }` or `not_sure`;
  - `pie`, `parentReport`: `yes`, `no` or `not_sure`;
  - `euTurnover`: `both`, `recent_only`, `earlier_only`, `no` or `not_sure`;
  - `parentOwnEmployees` and `parentOwnTurnover`: as `employees` and `turnover`.
- **`checkerAnswersSchema`,** the zod schema, strict, so that an unknown key is refused.
- **`visibleQuestions(answers)`,** the ids C-1 to C-10 to show, in order.
- **`EMPLOYEE_BANDS` and `TURNOVER_BANDS`.** For each band: its id, its label, its meaning as a half-open interval, and its stored range `{min, max}`.
- **`buildCheckProfile(answers)`.** The engine `Profile`: the scope objects, and confirmed customer-statement facts whose source is "Free check answer".
- **`bandGuardProblems(pack, bands)`.** Pure; returns a list of problems.

**Behaviour:**
- **The questions:** C-1 to C-10 as worded in proposal §4.1, shown by its "Shown when" column.
  - **C-6** (public-interest entity) is shown for an EU country, not a fund, when C-4 is not "450 or fewer".
  - **C-7** (the parent's report) keeps the approved rule (DG-19, option B). It is shown for an owned company or an intermediate parent when its figures could exceed both thresholds for a year shown. Made exact, in answer terms:
    - **For an owned company,** C-7 is shown when the company's own first-application route (S-017) could be met in at least one start year shown. That is the case when:
      - the public-interest answer is not "No" and the headcount could exceed 500 (2025–26); or
      - the headcount could exceed 1,000 and the turnover could exceed €450 million (2027–28).
    - **"Could exceed"** means a band whose upper end lies above the threshold, a typed figure above it, or "Not sure".
    - **A fund never sees C-7.**
    - **For an intermediate parent,** C-7 is shown when the same holds for the company's own route (S-017, whose own figures are unknown until C-9 and C-10) or for the sub-group's consolidated route (S-018, on C-4 and C-5).
    - Elsewhere the exemption row reads `not_checked`.
    - Task 4's C-7 rule check holds this predicate to the engine.
  - **C-8** is shown for a non-EU country.
  - **C-9 and C-10** are optional. `visibleQuestions` lists them, marked optional, for a parent or an intermediate parent. The flow asks them only when the visitor accepts the result's offer, "Check the parent company on its own too".
- **The facts each answer sets:** as §4.1's "Facts set" column.
  - **Scoping (CD-5).** C-4 and C-5 set `group.*` for a parent or an intermediate parent, and `entity.*` otherwise. One answer never sets both.
  - **C-9 and C-10** set `entity.avg_employees` and `entity.net_turnover_eur`.
  - **C-3** sets `entity.legal_form` and `entity.excluded_by_article_1_4`:
    - a fund sets the exclusion `true`;
    - every other kind sets `false`, labelled "not an investment fund";
    - "Not sure" sets both facts as unknown;
    - "Something else" maps to `other`, a catalogue miss.
  - **C-8** follows §4.3's table for the two years. It also sets `group.ultimate_parent_country` for "no group" and for a parent.
- **The bands:** exactly §4.3's tables.
  - **Headcount** is stored as closed ranges.
  - **Money** steps by one cent from the second band onward.
  - **The upper bound** `9007199254740991` stands for "no upper bound stated".
  - **A typed figure** is stored exactly as entered: finite, not negative, and for money at most two decimals. Otherwise the request is refused with 400.
- **"Not sure"** sets the fact with the engine's unknown value (`{ kind: 'unknown' }`), from the source "Free check answer: not sure". A question never shown sets nothing, so "asked, unknown" and "never asked" stay distinct (§4.4; PRF-6).
- **"Another country"** accepts an ISO 3166-1 alpha-2 code from the full list.
  - An EU code is refused in that field, because the EU list carries every Member State.
  - A code the pack does not catalogue reads `catalogue_unknown`.
- **Mapping and visibility are separate.** `buildCheckProfile` sets a question's facts whenever its answer is present. Whether a question is shown is decided only by `visibleQuestions`. Task 4's question guard relies on this to pose a hidden question's answers.
- **The fact types.** Every fact type the checker sets exists in the pack's fact types. This is read from the loaded pack at runtime, never from a list.
- **The removals.** The year selector, the governing-Member-State question, Q-011 (`reportedFy2024`), the holding question (Q-045) and the `listed_company` legal form leave the checker (§4.1, "What moves out").
- **The body limit** stays at 8 KiB.

**Tests (red first):**
- **The mapping.** One case per answer to each question, with counterexamples in the same assertion:
  - a parent's C-4 sets `group.avg_employees` and no `entity.avg_employees`;
  - an owned company's C-4 sets the reverse.
- **The band guard** (§4.3).
  - For every band, and every threshold the pack's conditions compare that fact type against, the engine's range comparison gives the band's result in the table. The thresholds are found by walking the loaded pack's condition trees, not from a list.
  - The stored range holds every value in the band's meaning.
  - No headcount threshold in the pack equals a headcount band boundary.
- **"Not sure" against "never asked."** Two profiles from the same answers, one with C-6 answered "Not sure" and one with C-6 never shown. The first holds the unknown fact, and the second holds no fact.
- **Visibility.** For each visitor type of proposal §4.5, `visibleQuestions` gives exactly that row's core, conditional and optional questions, and its count matches the "Total" column. The table is the oracle, written into the test from §4.5, not from the code.
- **The schema.**
  - An unknown key is refused.
  - An EU code in `countryOther` is refused.
  - A negative or non-finite typed figure is refused.
  - Money with three decimals is refused.
- **The fact types.** Every fact type in `buildCheckProfile`'s output, over a set of answers covering every question, exists in `csrdPack().factTypes`.
- **No governing Member State.** No answer set ever produces `entity.governing_member_state`. That keeps Task 4's national line unreachable as APPLIES. A positive control, that the scan sees facts at all, is the fact-types test above.

**Teeth:**
- **T3a, the CD-5 copy.** A parent's C-4 answer is also written to `entity.avg_employees`. The scoping test must fail, naming the entity fact.
- **T3b, an inexact band.** The money band "more than €400m, up to €500m" is stored from 450,000,000.01. The band guard must fail on the €450m threshold, naming the band: it expected "cannot tell" and got "exceeds".
- **T3c, a threshold on a boundary.** `bandGuardProblems` is called on an in-memory copy of the loaded pack with one 1,000-employee threshold set to 900. The guard must name the requirement.
  - The guard is pure over a pack object, so this mutation never touches a file. A file mutation would fail at load for the wrong reason (failure mode 2).
- **T3d, "Not sure" dropped.** "Not sure" omits the fact. The "asked, unknown" test must fail.
- **T3e, the fund.** The fund sets the exclusion `false`. The fund mapping case must fail.
- **T3f, visibility.** C-6 is hidden for an EU company with more than 1,100 employees. The visibility test must fail on §4.5's "EU company, no group" row.

**Baseline:** Task 2's finishing count.

**Commit message:** "Ask the free checker's plain questions and store each answer exactly, so group and company figures never stand in for each other and every unknown stays unknown"

*As executed (2026-10-23; committed `3ec4e21`; routine corrections accepted by you on 2026-10-24).*
- **Counts:** frontend 25 / 665 → 27 / 906 (two new files, 241 tests); engine unchanged at 84 / 3,313; typecheck exit 0; csrd grep 7.
- **Teeth:** the parent re-ran T3a to T3f, and each failed on its intended assertion. Evidence: `side-session-notes/local_043075c1-…/2026-10-23T1824Z-dp1-task3/`.
- **Rulings where this text left a gap:**
  - **C-6 with a typed figure.** It is shown when C-4 could exceed 500, so a typed figure from 451 to 500 hides it (law 16). For bands this is exactly "not 450 or fewer".
  - **A fund's legal form.** "Investment fund" sets `entity.legal_form` as unknown, because the answer names no legal form.
  - **The "not an investment fund" label.** Every other kind's exclusion `false` carries the source "Free check answer: not an investment fund".
  - **Cross-field refusals in the schema:**
    - `countryOther` is required with "Another country" and refused otherwise;
    - C-9 and C-10 are refused unless the group answer is a parent or both. Otherwise the engine silently keeps the last of two facts for one key;
    - money is checked to two decimals on its printed form.
  - **C-8 and the ultimate parent's country.** C-8 sets `group.ultimate_parent_country` for "no group" and for a parent, mirroring C-1's stored value.
- **Correction:** C-9 and C-10 are not offered to a fund. Article 1(4) settles the company's own route whatever its figures (law 16). It is carried into Task 4 below.

### Task 4: the start-year timeline and the route rows (proposal §4.2; rule R; §9.2)

**Delivers:** CHK-1, CHK-2 (the contract), CHK-3 (the data), APP-11, KNW-10, KNW-14.
**Waits on:** DG-8 (part 3).

**Files:**
- `lib/check-routes.ts` and `lib/check-timeline.ts` (new);
- `test/checker-cases.json` and `test/checker-cases.test.ts`;
- `test/check-start-year-guard.test.ts` and `test/check-question-guard.test.ts`;
- `test/check-response-contract.test.ts`;
- `test/golden/checker-timeline-public-golden.json` and its test.

The route and the old modules are untouched until Task 6.

**Interfaces.** It consumes Task 3's `CheckerAnswers`, `checkerAnswersSchema` and `buildCheckProfile`. It produces:
- **`CHECK_START_YEARS`:** 2025, 2026, 2027, 2028.
- **`CHECK_ROWS`:** the row table below, each row with its lines.
- **`LINE_KINDS`:** `first_application`, `duty`, `exemption`, `group_test`, `gateway`, `coverage_gap`, `national`.
- **`buildCheckTimeline(pack, answers, assessmentDate)`,** returning a `CheckTimeline`.
- **`CELL_STATES`:** `applies`, `does_not_apply`, `cannot_decide`, `not_checked`, `not_yet_covered`, `requires_review`.
- **`SENT_FIELDS`:** the declared list of every JSON path the payload may carry.
- **`startYearGuardProblems(pack)`** and **`questionGuardProblems(pack)`:** pure.

**`CheckTimeline`, the payload.** These fields, and no others:

| Field | Content |
|---|---|
| `assessedAt` | The UTC date the caller supplies; echoed |
| `basis` | `start_year` |
| `startYears` | `[2025, 2026, 2027, 2028]` |
| `hypothetical`, `preliminary` | Both `true` |
| `pack` | `id`, `version`, `legalSnapshot` |
| `content` | `draft`: true if any run contains draft content (each run's `containsDraftContent`). `threshold`: the checker's content threshold in force, `draft_labelled` (KNW-10) |
| `country` | The country of registration as answered, for the national line's note |
| `routes` | Ordered rows, one per route (rule R). Each row has an `id` and its `lines`.<br>Each line reports **exactly one requirement**, with:<br>`kind` (one of the line kinds below);<br>`requirement`, a single id;<br>`legalBasis`, that requirement's `sources` (`id`, `title`, `url`) and `locators`;<br>`cells`, four of them, each with `startYear`, `state`, and optionally `reason` and `needs`, both taken from that requirement's own determination (`needs` lists the facts behind a straddled range first) |

**What is deliberately not sent** (CHK-2): obligations, gaps, evidence expectations, next questions, cautions, and the determination list. They return with DP2's full cited result.

**The line kinds.** A line's kind fixes what its states mean. Task 5 supplies the words, and no line's words may claim more than the kind allows.

| Kind | Reports | `applies` means | `does_not_apply` means |
|---|---|---|---|
| `first_application` | Whether the Article 19a or 29a measures apply to the company or group for financial years starting that year (S-017, S-018). This is a scope test, not a duty | Met at EU level | Not met at EU level |
| `duty` | Whether a reporting duty remains after the exemptions the pack encodes (S-020, S-021) | A reporting duty at EU level | No reporting duty at EU level: either not in scope or exempt. The line does not say which |
| `exemption` | Whether one exemption is available (S-005, S-006, S-019) | This exemption is available | This exemption is not available |
| `group_test` | Whether a non-EU group passes Article 40a's EU-turnover test (S-007) | Test met | Test not met |
| `gateway` | Whether this EU company is the subsidiary through which a non-EU group reports under Article 40a (S-008) | This company reports for the group | This company does not report for the group |
| `coverage_gap` | A route the pack does not encode (S-024) | Never shown | Never shown |
| `national` | The national-law gate (S-013) | Not reachable in DP1 | Never shown: the line reads `requires_review` |

**The rows.** Per proposal §4.2 and §9.2. Lines are listed in order, each line's cell coming from its own requirement for each start year.

| Row | Shown for | Lines |
|---|---|---|
| `individual` | An EU company with no group, an owned company, or group "Not sure" | `first_application` S-017; `duty` S-020 |
| `parent_own` | An EU parent or intermediate parent | `first_application` S-017; `duty` S-020. Both are `not_checked` until C-9 and C-10 are answered, because group figures never stand in, except a cell their answers cannot change (see `not_checked` below) |
| `consolidated` | An EU parent or intermediate parent; group "Not sure" | `first_application` S-018; `duty` S-021 |
| `exemption` | An EU owned company or intermediate parent; group "Not sure" | **Owned, or group "Not sure":** `exemption` S-005 (an EU parent's report) and `exemption` S-006 (a non-EU parent's report).<br>**Intermediate parent:** `exemption` S-019 (a higher parent's report covering the group), plus S-005 and S-006, which are `not_checked` until C-9 and C-10 are answered.<br>Every exemption line is `not_checked` while C-7 is not asked |
| `art_40a` | A non-EU company | `group_test` S-007. Which EU subsidiary or branch reports (S-008, S-009) needs facts the checker does not ask (CG-3), so the row's next step points to onboarding, not to `needs` |
| `art_40a_gateway` | An EU owned company or intermediate parent | `gateway` S-008. The ultimate parent's country and the subsidiary's EU turnover are not asked, so the 2028 cell stays open (§9.2) |
| `issuer` | A non-EU company | `coverage_gap` S-024 |
| `national` | Every EU result | `national` S-013 |

- **With C-1 "Not sure",** every row that any country could bring for C-2's answer is shown, EU and non-EU alike, together with the national line. The cases expect the engine's results to be `cannot_decide`, needing the country (§4.4).
- **Row presence.** A row the table does not show for a visitor is absent. A row the table shows is never dropped.
- **Draft labels,** for Task 5's approval:
  - **Rows:**
    - `individual`: "Your company's own sustainability report (Article 19a)";
    - `parent_own`: "The parent company's own report (Article 19a)";
    - `consolidated`: "The group's consolidated report (Article 29a)";
    - `exemption`: "Exemption through a parent's group report";
    - `art_40a`: "A non-EU group's EU reporting (Article 40a, from 2028)";
    - `art_40a_gateway`: "Your company as the EU subsidiary that reports for a non-EU group (Article 40a, from 2028)";
    - `issuer`: "Shares or bonds on an EU regulated market (Transparency Directive)";
    - `national`: "National law".
  - **Lines:** "First application"; "Duty after exemptions"; "Through an EU parent's report"; "Through a non-EU parent's report"; "The group, through a higher parent's report"; "EU-turnover test"; "This company as the reporting subsidiary"; "Not yet covered"; "National-law status".

**Behaviour:**
- **One run per start year.** One engine run for each start year, with `financialYear` from 1 January to 31 December of that year, over the same profile. The assessment date is supplied by the caller and never read from the clock.
- **The mapping.** Every cell is its own line's requirement's determination for that year:
  - APPLIES gives `applies`;
  - DOES_NOT_APPLY gives `does_not_apply`;
  - INDETERMINATE gives `cannot_decide`, with that determination's reason and needs.

  No line shows another requirement's result, reason or needs.
- **The exceptions,** each tied to one line kind:
  - **`coverage_gap`.** INDETERMINATE with reason R gives `not_yet_covered`. For a non-EU company S-024 can only be R. An unknown country gives `missing_fact`, which reads `cannot_decide`.
    - *Correction found in the combined check (2026-10-24).* "Can only be R" holds for a country the pack catalogues as non-EU.
    - A typed "Another country" code that `eu_member_states` does not list (for example AR) gives INDETERMINATE with `catalogue_unknown`, in every year. That reads `cannot_decide`, never `does_not_apply`.
    - The KNW-14 cases cover both, each with its own reason.
    - *Carried from Task 2 (your direction of 2026-10-24): a known-country coverage gap needs DataStrata's review, not another answer.* For a catalogued non-EU country, S-024's determination still carries a need on `entity.incorporation_country`, with reason R, although the visitor has answered it. Task 2's evidence shows this: Q-003, the country question, re-enters the pilot record's next questions.
      - A `not_yet_covered` cell therefore carries reason R and **no `needs`**. Its next step is Task 5's DataStrata-review step for the row and state.
      - A `cannot_decide` cell keeps its needs. For a typed code the pack does not catalogue (`catalogue_unknown`), Task 5 words the next step as DataStrata's review too, never as the question again.
  - **`national`.** Any result other than APPLIES gives `requires_review`, keeping the engine's reason.
    - APPLIES is unreachable in DP1: the checker never sets `entity.governing_member_state` (Task 3 asserts it), and no country pack is ratified.
    - Should it occur, the route refuses with 503 rather than invent a label.
  - **`not_checked`.** Only where the checker deliberately does not evaluate a line:
    - the `parent_own` lines, and an intermediate parent's S-005 and S-006, until C-9 and C-10 are answered;
    - every exemption line while C-7 is not asked.

    The engine's result for such a line is not sent.
  - *Carried from Task 3 (your direction of 2026-10-24): `not_checked` never hides a settled determination.* A `parent_own` cell is `not_checked` only while some answer to C-9 and C-10 would change its engine determination for that start year. Otherwise the cell carries its engine determination, mapped as usual. Measured on the merged Task 2 and 3 tree (evidence `…/2026-10-24T2134Z-dp1-tasks2-3-combined-task3-session/`, log 10):
    - **A fund parent or intermediate parent:** S-017 and S-020 are DOES_NOT_APPLY in all four years whatever C-9 and C-10 say, through Article 1(4). Task 3 therefore never offers it C-9 and C-10, and both `parent_own` lines read `does_not_apply` "at EU level", beside the national line.
    - **A parent that answered C-6 "No":** S-017 and S-020 are DOES_NOT_APPLY for 2025 and 2026, because the first-wave route needs public-interest status. Those cells read `does_not_apply`; 2027 and 2028 stay `not_checked`.
    - **Every other combination measured:** C-9 and C-10 change the cell in every year, and it stays `not_checked`.
    - **Scope of the rule.** It covers the `parent_own` lines and C-9 and C-10 only. The intermediate parent's S-005 and S-006, and every exemption line while C-7 is not asked, keep the rule above unchanged.
- **EU wording.** Every `applies` or `does_not_apply` on an EU line is worded "at EU level", and the national line stands beside it (law 6). No EU line reads a bare "does not apply".
- **No inversion.** The checker never turns an INDETERMINATE into a definitive state, and never invents a cell.
- **Integrity.** `buildCheckTimeline` lets the pack loader's `IntegrityFailureError` propagate. It never catches it, so Task 6's route can refuse exactly as today.

**Tests (red first):**
- **The start-year guard** (§4.2).
  - It walks every requirement's condition tree in the loaded pack.
  - Every operator that reads the period must be one the guard classifies. The operator list comes from the engine's runtime condition schema, so an operator the guard does not know fails it (failure mode 1).
  - Every date compared with the period's start must be 1 January.
  - No operator may read the period's end.
- **The question guard,** for C-6, C-7, C-8, and C-9 with C-10. It runs over every reachable combination of the other answers. Bands come from the tables; typed figures are sampled at each threshold and one unit either side of it. Cells are compared by state only.
  - **Shown, in every combination** (law 16; proposal §3, P-e). In **each** reachable combination where the question is shown, at least one answer to it must make a **genuine change**.
    - A genuine change is a different engine result for at least one **relevant determination**, in at least one start year.
    - It is compared with another answer to the same question, with everything else held equal: the same other answers, start year and assessment date.
    - **Relevant determinations:**
      - the requirement of every line other than an exemption line;
      - each exemption requirement (S-005, S-006, S-019), for a start year in which the first-application determination of the route it relieves is not "does not apply". That route is S-017 for S-005 and S-006, and S-018 for S-019.
    - **Engine results, not displayed cells.** The comparison is between the engine's determinations: APPLIES, DOES_NOT_APPLY, or INDETERMINATE with its reason. It is never between displayed states. A change that comes only from showing or hiding a line, such as `not_checked` turning into an evaluated state, does not count. That also holds for C-9 and C-10: their answers count only where the parent's own determinations differ.
    - The guard fails on the first combination where the question is shown and no answer makes a genuine change, and it names the question and the combination.
    - A check over all combinations at once would pass a question that matters somewhere and is shown everywhere: that is the irrelevant visibility this guard exists to catch.
  - **Hidden** (law 3): every cell whose state some answer to the hidden question would change is open, `cannot_decide` or `not_checked`, while the question is unasked. A hidden question never leaves a definitive result that its answer could reverse.
    - The engine's three-valued logic guarantees this on its own while a hidden question sets no fact.
    - The guard therefore catches a mapping that gives a hidden question's fact a default.
    - An unasked Article 40a cell for an EU subsidiary stays open (§9.2), and passes.
  - **C-7 under this guard** (DG-19, option B). The approved rule passes.
    - Wherever it shows C-7, the relieved route is not "does not apply" in some start year.
    - In that year, C-7's answer changes S-005 and S-006 (or S-019): "No" gives DOES_NOT_APPLY, while "Yes" leaves them INDETERMINATE.
    - The guard fails only where C-7 is shown and the relieved route is not met in every year shown.
  - **The C-7 rule check.** For every reachable combination, C-7 is shown exactly when the relieved route's first-application determination is not "does not apply" for some start year shown. That is Task 3's rule, in engine terms. Both directions are checked, so the rule can neither show C-7 needlessly nor hide it where the approved rule shows it.
  - **The `not_checked` rule check** (carried from Task 3, 2026-10-24). It covers every reachable parent or intermediate-parent combination with C-9 and C-10 unanswered, and each `parent_own` cell.
    - The cell is `not_checked` exactly when some C-9/C-10 answer changes that cell's engine determination. The answers are the bands, typed figures at each threshold and one unit either side, and "Not sure".
    - Otherwise the cell is the mapping of its engine determination.
    - Both directions are checked: a settled cell never reads `not_checked`, and an open one is never evaluated early.
    - *Reachable for C-9 and C-10:* the schema refuses them except for a parent or both (Task 3). Their hidden direction therefore runs over fund parents only, where no answer changes a cell.
  - **The genuine-change rule, directly.**
    - A unit test gives the guard's comparison two evaluations whose engine determinations are identical and whose displayed lines differ only by `not_checked`, and expects no change.
    - The positive control: a sibling case whose engine result differs expects a change.
  - If the guard runs past 60 seconds, the executor reports it rather than trimming the answer space.
- **The cases,** `checker-cases.json`. Authored from the proposal's tables before the code exists, each case citing its section. Each case gives answers, then the expected rows, then per year the state, the reason code and the first need. At least these cases:
  - Every band against every threshold. A "cannot tell" band gives `cannot_decide` / `range_crosses_threshold`, with the figure ranked first (§4.6.1).
  - A parent whose group exceeds both thresholds while the parent is small. The `consolidated` first-application line is `applies` for 2027–28, and both `parent_own` lines are `not_checked` (§4.6.2).
  - An intermediate parent with all of its rows shown: `parent_own`, `consolidated`, `exemption`, `art_40a_gateway` and `national` (§4.6.3).
  - An owned company definitively above both thresholds, with C-7 answered "No", for 2027–28:
    - the `individual` duty line is `applies`;
    - both exemption lines are `does_not_apply` (this exemption is not available).

    This is the counterexample that tells an exemption line from a duty line.
  - An owned company definitively below both thresholds:
    - C-7 is not asked;
    - the exemption lines are `not_checked`;
    - the duty line is `does_not_apply` (no reporting duty at EU level).
  - A fund: "does not apply" through Article 1(4) (§4.6.5).
  - *Carried from Task 3:* an EU fund parent, and an EU fund intermediate parent:
    - C-9 and C-10 are not offered;
    - both `parent_own` lines are `does_not_apply` in all four years, never `not_checked`;
    - the `consolidated` lines are `does_not_apply` too.
  - *Carried from Task 3:* an EU parent with C-6 answered "No", above both thresholds as a group, without C-9 and C-10. The `parent_own` lines are `does_not_apply` for 2025 and 2026, and `not_checked` for 2027 and 2028.
  - A bank in a form outside Annexes I and II, above both thresholds in 2027: "applies" through Article 1(3) (§4.6.6).
  - "Not sure" on each question, giving §4.4's routes left open (§4.6.7).
  - A non-EU group:
    - the `art_40a` group-test line reads `does_not_apply` for 2025–27 (E-1), and in 2028 follows C-8's answer;
    - the `issuer` line is `not_yet_covered` in every year, never `does_not_apply` (KNW-14);
    - *added 2026-10-24:* for a typed country the pack does not catalogue (AR), the `issuer` line is `cannot_decide` with `catalogue_unknown` in every year, never `does_not_apply`;
    - *carried from Task 2:* each `not_yet_covered` cell carries no `needs`. The positive control is an unknown country, whose `issuer` cells carry the need on `entity.incorporation_country` (`missing_fact`).
  - An EU owned company: the `art_40a_gateway` line reads `does_not_apply` for 2025–27 and `cannot_decide` for 2028.
  - Every visitor type of §9.2, with its rows and lines.
  - Every EU result carries the `national` line as `requires_review`.
- **One requirement per line.** For every fixture and every line, the payload is checked against the raw engine output for the line's named requirement:
  - the cell's state is the mapping of that determination;
  - the cell's reason and needs are that determination's own, except that a `not_yet_covered` cell carries no needs (carried from Task 2).

  The raw output comes from calling `assess` directly in the test, not from `buildCheckTimeline`.
- **The contract.** For a fixture set that between them populate every row, state and optional field:
  - the payload's actual key paths are walked;
  - they must equal `SENT_FIELDS`;
  - they must contain no key outside it.
- **The draft flag.** A signed, fresh fixture (the status-truth boundary's) gives `content.draft: false`; the repository gives `true`.
- **The new public golden.**
  - One fixed set of answers, the widest slice: an EU intermediate parent whose figures show C-6, with C-6 answered "Not sure" and C-9 and C-10 answered.
  - A fixed date.
  - The serialised payload compared byte for byte.
  - An independent oracle: each row's cited sources equal the audit's expected sources for its requirements (`AUDIT_EXPECTED_SOURCES`, imported from the engine's test tree as today).

**Teeth:**
- **T4a.** All four runs use 2027. The first-wave cases for 2025 and 2026 must fail, naming the column.
- **T4b.** An in-memory pack copy has one `fy_starts_on_or_after` date set to the first of July. The start-year guard must name the requirement.
- **T4c.** The issuer row's indeterminate result is mapped to `does_not_apply`. The KNW-14 case must fail.
- **T4d.** The `consolidated` first-application line reads S-017. The parent case must fail.
- **T4h.** The exemption lines take their state from S-020. The owned, above-both-thresholds, C-7 "No" case must fail on an exemption line.
- **T4i.** The `individual` first-application line carries S-020's needs. The one-requirement test must name the line.
- **T4e.** An `obligations` field is added to the payload. The contract test must name the path.
- **T4f.** C-6 is shown for the "450 or fewer" band too. The guard's shown direction must fail, naming C-6 and a "450 or fewer" combination.
  - The earlier existential version would have stayed green here, because C-6 matters in other bands.
  - This teeth check is the evidence that the guard catches irrelevant visibility.
- **T4f3.** C-7 is shown for an owned company with "450 or fewer" employees and turnover "up to €400 million". The relieved route is not met in any year, so C-7's change to S-005 and S-006 is not relevant.
  - The guard's shown direction must fail, naming C-7 and that combination.
  - The C-7 rule check must fail too.
- **T4f4.** The guard's comparison is switched from engine results to displayed cells. The genuine-change unit test must fail on its identical-results case.
- **T4f2.** For an EU owned company, the hidden C-8 sets both EU-turnover facts to "No". The guard's hidden direction must fail, naming C-8 and the `art_40a` row's 2028 column.
  - *Why not C-6:* C-6 is hidden only where its answer cannot change a cell (a fund, a non-EU company, or 450 employees or fewer). A default there flips nothing, so that mutation would pass the guard and prove nothing (failure mode 2).
- **T4g.** `hypothetical` is set to `false`. The new golden must fail byte for byte, and its case in `checker-cases.json` must fail too.
- **T4j** (carried from Task 3). The `parent_own` lines are made `not_checked` whenever C-9 and C-10 are unanswered, which was the rule before 2026-10-24.
  - The `not_checked` rule check must fail, naming a fund-parent combination and the cell.
  - The fund-parent case must fail.
  - A second mutant evaluates every `parent_own` cell without C-9 and C-10. The rule check's other direction must fail, naming a cell that C-9 and C-10 can change.
- **T4k** (carried from Task 2). S-024's needs are passed through to its `not_yet_covered` cells. The KNW-14 non-EU case must fail, naming the `issuer` cell and the country fact.

**Baseline:** Task 3's finishing count. On the merged Task 2 and 3 tree (2026-10-24) that is engine 84 / 3,320 and frontend 27 / 907, with typecheck exit 0 and csrd grep 7. Task 4 starts from the commit that holds both tasks, so Task 2 is committed first.

**Commit message:** "Show the checker's answer as a dated timeline of separate routes, so each route is assessed on its own and no unencoded or unasked route reads as no duty"

*As executed (2026-10-24, uncommitted at hand-off).*
- **Counts:** engine 84 / 3,320, unchanged; frontend 27 / 907 → 32 / 1,235, from nine new files and no existing file changed. Typecheck exit 0; csrd grep 7.
- **The question guard** visits 396,565 reachable flows with 158,706 engine runs, in about 48 seconds. That is under the 60-second line, so nothing was trimmed.
- **Teeth:** the parent re-ran T4a to T4k in its own clone with its own mutations. Each failed on its intended assertion, and each file was restored by sha256. Evidence: `side-session-notes/local_043075c1-…/2026-10-24T2146Z-dp1-task4/`.
- **The guard reduces its work in two places, and a test proves each one:**
  - **The Member States as one class.** It is derived from the pack's catalogues, and its premise is checked: no condition reads the country except through a catalogue.
  - **Engine results remembered** by year and by the facts each requirement reads. A test checks this equals `assess` called directly.
- **Routine corrections to the text above:**
  - **The golden's oracle is the composed `EXPECTED_SOURCES`.** `AUDIT_EXPECTED_SOURCES` holds none of S-017 to S-021.
  - **The draft-flag fixture** is the shared signed, fresh repository fixture.
  - **A definitive result on a `coverage_gap` line refuses** with `TimelineRefusalError`, as the national line's APPLIES does: the line-kind table says those states are never shown.
  - **An unanswered C-1 or C-2** selects rows as "Not sure" does.
  - **A cannot-tell band's line keeps its own requirement's reason:** `missing_fact`, or `upstream_indeterminate` from 2027. `range_crosses_threshold` ranks first among the needs.
- **For Task 5:**
  - The national line's cells carry S-013's need on `entity.governing_member_state`, so its next step is the review step keyed by reason (Task 5, "Tests").
  - The draft row and line labels are held in `check-routes.ts` as `draftLabel`, and are never sent.

### Task 5: standard wording for every DP1 state (EXP-9)

**Delivers:** EXP-9, EXP-3, APP-11 (the words), KNW-10 (the words).
**Waits on:** your approval of the wording, a stop inside this task, before Task 6 uses it.

**Files:** `frontend/web/lib/wording.ts`; `test/wording.test.ts`.

**Interfaces. Produces:**
- `stateWords(kind, state)`, giving `{ words, glyph }` for a line kind of Task 4's `LINE_KINDS`;
- `rowLabel(rowId)` and `lineLabel(rowId, requirementId)`;
- `reasonWords(code)`;
- `nextStep(factType, reason)`;
- the labels: preliminary; "Draft · evaluation only"; the column heading "If your size stays about the same"; the threshold in force; the national line;
- the error states: 400, 413, 429, the 503 refusal, a network failure, 404 and 500;
- `wordingProblems(…)`: pure.

**Behaviour.** The module is the content specification: one source for every word a DP1 screen shows about a state.
- **Drafts** come from proposal §4.4 (the visitor sees, the next step) and §7 (the customer sees). For example:
  - `range_crosses_threshold`: "Your band includes the €450m threshold";
  - `national_law_unresolved`: "National-law status requires review".
- **The issuer row under option A:** "Requires review: the route for this company is not yet covered".
- **Words follow the line kind.** A state's words say what Task 4's line-kind table gives it, and no more. For example:
  - a `duty` line's `does_not_apply` reads "No reporting duty at EU level", and never "Exempt";
  - an `exemption` line's `applies` reads "This exemption is available", and never "Applies".
- **Every definitive state on an EU line** says "at EU level" (law 6).
- **The row and line labels** start from Task 4's drafts.
- **Within a line kind, no state shares another's words or glyph.** Every state carries a glyph as well as words, never colour alone (EXP-3).
- **Orange marks only change events and deadlines.** DP1 has neither, so no state uses it.
- **The words name no unbuilt capability as available** (A4; the Stage 1a claims test).
- *Carried from Task 2 (your direction of 2026-10-24), as routine presentation corrections:*
  - **A known answer is never asked for again.** `nextStep(factType, reason)` is DataStrata's review step for `source_status_unresolved` (R) and `catalogue_unknown`. It asks the visitor nothing. Only `missing_fact` and `range_crosses_threshold` give a step that asks for an answer. The issuer row's `not_yet_covered` step says the same: the gap is DataStrata's to close.
  - **Review without a case** (your direction of 2026-10-24; no further review round for this adjustment).
    - A coverage gap reads as requiring DataStrata review. For example: "Not yet covered: this route requires DataStrata review. Your answers cannot settle it here."
    - The words never imply that the visitor's answers or case were saved, queued, sent or assigned. DP1 keeps nothing (§1), so they never say "we will review your case", "we'll check", "submitted" or "we'll be in touch".
    - The same holds for every review step: `catalogue_unknown`, the national line, and §4.4's C-7 line, whose draft "We'll check your parent's group report" is reworded on the same rule.
  - **S-024's caution is not DP1 wording.** Its text, "Never read as 'does not apply'…", is a note to content authors.
    - In DP1 it never stands beside a result: cautions are not sent (CHK-2), and the `issuer` row is shown only for a non-EU company or C-1 "Not sure".
    - The `issuer` row's words come from this module only.
    - Today's pre-DP1 payload shows the caution beside a DE company's "does not apply" (Task 2's public golden). Task 6 retires that payload.
    - When DP2's full cited result brings cautions back, S-024's caution shows only with its unresolved state.

**Tests (red first):**
- *Carried from Task 2:* **review steps ask nothing.** For every fact type that can appear in `needs`, `nextStep` with R and with `catalogue_unknown` returns the review step. The counterexample in the same test: `nextStep('entity.incorporation_country', 'missing_fact')` asks for the country. No wording entry contains the caution's "Never read as".
- *Carried from Task 2:* **no implied case.** No state, reason or next-step words claim that anything was saved, queued, sent or assigned. The check uses a declared list of phrases; its positive control is that the scanner flags a planted "We'll review your case".
- **Every engine reason code has an entry.** The codes are read from the engine's runtime reason schema, not from a list.
- **Every reachable pair of line kind and state has words and a glyph.** The reachable pairs are read from Task 4's line-kind rules, not from a list.
- **Every row and line in `CHECK_ROWS` has a label.**
- **The "at EU level" rule.** Every definitive state of an EU line kind contains the phrase. The counterexample is that `group_test`, `gateway` and `coverage_gap` are not required to.
- **No kind borrows another's meaning.** A `duty` line's `applies` words differ from an `exemption` line's, and the same holds for `does_not_apply`.
- **Every fact type that can appear in `needs` has a next step.** These are found by walking the conditions of the row requirements in `CHECK_ROWS`, independently of the timeline code.
- **Every open row state that names no fact has its own next step,** keyed by row and state. That covers the issuer row's `not_yet_covered` (KNW-14: "with its reason and next step") and the national line's `requires_review`.
  - *Found in Task 4 (2026-10-24):* the national line's cells do name a fact. They carry S-013's need on `entity.governing_member_state` with `national_law_unresolved`, a question the checker moved to onboarding (Q-012).
  - Its next step is therefore the review step, keyed by that reason (§7: nothing for the customer), and never a question.
  - The review-step test covers `national_law_unresolved` beside R and `catalogue_unknown`.
- **Within each line kind, no two states share words or a glyph,** checked as a counterexample against each pair.
- **No wording contains a placeholder marker** ("TODO", "TBD", "to be published", "lorem").
- **The Stage 1a claims test** stays green over the new module.

**Teeth:**
- **T5a.** The `catalogue_unknown` entry is deleted. The test must name the code.
- **T5b.** Two states are given the same glyph. The test must name both.
- **T5c.** The next step for `entity.avg_employees` is removed. The test must name the fact type.
- **T5d.** The `exemption` kind's `applies` words are set to "Applies". The kind-distinctness test must name the pair.
- **T5e.** "at EU level" is dropped from the `duty` kind's `does_not_apply` words. The EU-level test must name it.
- **T5f** (carried from Task 2). `nextStep('entity.incorporation_country', 'catalogue_unknown')` returns the question step. The review-step test must name the fact type and the reason.
- **T5g** (carried from Task 2). The issuer row's `not_yet_covered` step reads "We'll review your case". The no-implied-case test must name that entry.

**The stop.** The draft wording goes to you as a table: line kind, then state, then words, then glyph, with the row and line labels. Task 6 starts only after your approval, quoted in the evidence.

*Carried from Task 3 (2026-10-24), for the same table.* The question wording that Task 3 drafted where §4.1 gives none comes for approval with the states:
- **C-5:** "About how much turnover does your company have in a year?"; for a parent, "… does the whole group have …"; for an intermediate parent, "… do your company and the companies it owns have …";
- **C-4's expanded parent and intermediate-parent sentences;**
- **C-6's "For a parent" variant,** which Task 3 applies to a parent only;
- **the typed-figure labels** "Type the number" and "Type the figure".

**Baseline:** Task 4's finishing count.

**Commit message:** "Give every state the check can show one approved wording and shape, so no result, reason or error reads differently from screen to screen"

*As executed (2026-10-25 and 26, uncommitted at hand-off).*
- **Counts:** engine 84 / 3,320, unchanged. Frontend 32 / 1,235 → 34 / 1,291, from two new test files. Typecheck exit 0; csrd grep 7; every golden unchanged.
- **Files:**
  - `lib/wording.ts` and `test/wording.test.ts` (new);
  - `test/check-reachable-states.test.ts` (new);
  - `lib/check-timeline.ts`, extended with the export below. No behaviour changed: every Task 4 test and the golden pass as they were.
- **The reachable (line kind, state) export,** your instruction of 2026-10-25, is `reachableCellStates(pack, kind)`. It takes the pack because its rule reads it.
  - It is computed through `stateOf` and `linePolicy` themselves, over the engine results each line's requirement can give the checker.
  - **The rule:** a requirement cannot be APPLIES when its condition cannot be TRUE while every fact the checker never sets is absent. The settable facts come from `buildCheckProfile` over every reachable flow.
  - It equals the pairs observed over the 40 cases and the full reachable sweep (396,565 flows, about 24 seconds), in both directions.
  - `exemption`·`applies` and `gateway`·`applies` are not reached, because S-005, S-006, S-019 and S-008 need facts the checker never sets. They are worded anyway: the line-kind table gives them a meaning.
- **Teeth:** T5a to T5g as written, plus:
  - T5h, the export: a state added to `stateOf` makes the wording test name the missing pair;
  - T5i, the export test's two directions;
  - T5j, below;
  - a guard against internal references.

  The parent re-ran each with its own mutations in its own clone. Each failed on its intended assertion, and each file was restored by sha256.
  Evidence: `side-session-notes/local_043075c1-…/2026-10-25T0808Z-dp1-task5/`.
- **Routine corrections to the text above:**
  - **A fact's own absent reason asks.** C-3 answered "Not sure" leaves `entity.legal_form` absent, and the pack's reason for that is `legal_ambiguity`. Read literally, "only `missing_fact` and `range_crosses_threshold` ask" made that step say "Your answers cannot settle it here", which is false.
    - `nextStep` now gives C-3's step there, as proposal §4.4's C-3 row has it. This is held as data (`absentReason`), checked against the pack in both directions, and has its own teeth check, T5j.
    - Review reasons still never ask (T5f).
  - **`legal_ambiguity`'s words** became "This turns on a legal classification that is not settled yet".
  - **The interface takes the pack:** `reachableCellStates(pack, kind)`.
  - **A timeout error state is added,** because Task 6 shows one.
  - **One 503 entry** serves both the integrity refusal and `TimelineRefusalError`.
  - **The €450m figure** moved from the reason words to the turnover steps, because a headcount band straddles 500 or 1,000.
  - **Article 40a's applies note** replaces "points to onboarding". Onboarding is not built.
  - **The stateless and unbuilt-capability rules** reworded §4.4's and §7's drafts: C-7, C-1, C-4 and C-5, `missing_fact`, range, `catalogue_unknown` and `not_yet_effective`. The evidence lists each one.
- **Your approval (2026-10-26),** quoted in the evidence's `APPROVAL.md`. You approved the wording with Codex's three corrections, each applied exactly:
  - C-7's step describes the parent report's inclusion as one condition of the exemption;
  - `not_yet_effective` reads "This rule is adopted but not yet in force. This result does not assess preparation steps.";
  - the internal reference "(vision, choice 4)" is removed from the threshold label. A test now keeps every visitor-facing entry free of internal references.
- **For Task 6:** the next-step selection you set on 2026-10-26, carried into Task 6 below.

### Task 6: the switch — the check route and page move to the new modules

**Delivers:** CHK-1, CHK-2 (rendered), CHK-3, EXP-3, EXP-4, EXP-5, EXP-6, PRF-14, KNW-10.
**Waits on:** DG-8 (part 3, the retirement).

**Why one task.** The route, the page and everything that imports the old modules move in one commit, so that no commit leaves a check page that posts answers its route refuses.

**Files:**
- `app/api/check/route.ts`;
- `lib/check-view.ts` (new);
- `components/marketing/CheckFlow.tsx` (modified) and `CheckTimeline.tsx` (new);
- `app/check/page.tsx` and `app/page.tsx` (copy only);
- `lib/checker.ts` and `lib/checkResponse.ts` (deleted);
- every importer of the old modules, listed in §5;
- tests `test/check-view.test.ts` and `test/check-timeline-render.test.ts`.

**Interfaces.** It consumes `visibleQuestions`, `CheckTimeline`, `SENT_FIELDS` and the wording module. It produces:
- **`checkView(timeline)`:** a pure view model. It gives:
  - for each row, its label;
  - for each line, its label and its legal basis;
  - for each cell, the words and glyph of its line kind and state, the reason words and the next step;
  - the banners and the column headings.
- **`CheckTimeline`:** a presentational component with no state or effects, rendering a view model.

**Behaviour:**
- **The route** validates with `checkerAnswersSchema` and returns `buildCheckTimeline`'s payload as it is.
  - A malformed body gets 400 and an oversize one 413, both as today.
  - An answer to a question that `visibleQuestions` would not show for the other answers is refused with 400, never silently dropped. A request therefore cannot produce a result the questions could not.
  - The 503 on `IntegrityFailureError` keeps its body and meaning exactly (status-truth boundary §6: refuse, never downgrade).
- **The old modules are deleted** once nothing imports them. Every importer in §5 is re-expressed over the new modules, with its meaning kept.
  - Each is listed in the report, before and after.
  - None is deleted, and no assertion is weakened, without your approval.
  - In particular:
    - the status-truth boundary's public cases keep every case, over `content.draft`;
    - the body-limit tests keep their 413 cases;
    - the standalone agreement gate (`test-standalone.mjs`, `deployment-agreement.mjs`, `deployment-projection.ts`) posts the new answers and compares the timeline.
- **The retirement** (DG-8, part 3).
  - `provenance-public-golden.test.ts` keeps its artefact pinned by sha256, and states why its forward comparison is retired.
  - Its independent oracles, the audit's expected sources, move to Task 4's new golden.
  - The two historical migration artefacts keep their sha256.
- **The question flow:**
  - one question at a time, in `visibleQuestions` order;
  - "Not sure" on every question;
  - nothing preselected;
  - the answers are posted once, as a JSON body.
- **The result** appears at once (CHK-3). It shows:
  - the preliminary label;
  - "Draft · evaluation only" while `content.draft` is true;
  - the threshold in force, with its decision cited (vision choice 4);
  - the four start-year columns under the hypothetical heading;
  - one row per route, with its lines, each line labelled with what it reports (Task 4's line kinds);
  - a reason and a next step in each `cannot_decide` cell (APP-11);
  - the national line, with the country of registration and its note.
  - *Carried from Task 5 (your direction of 2026-10-26): **the next step.*** A `cannot_decide` cell shows one step (proposal §4.2: "the one step that would settle it").
    - **The rule.** Take the cell's needs in its order, range first. The step is that of the first need whose fact is set, in this visitor's context, by a question the visitor is shown.
      - C-4 and C-9 are alternatives for a headcount, and C-5 and C-10 for a turnover.
      - The step links whichever question of the pair sets that fact for this visitor: C-4 and C-5 for a company's or a group's figure, by group position; C-9 and C-10 for the parent's own.
    - **Where no need has such a question,** the step is that of the first need whose step asks nothing: a fact the check does not ask, or a review reason.
    - **A step is never offered for a question the visitor is not shown.**
    - **Cells that name no fact** take their step from `rowStep` (`not_yet_covered`, `not_checked`).
    - **The view needs the visitor's answers** to know what is shown, so it is `checkView(timeline, answers)`. The answers stay in the page, as today.
    - **The parent's sweep at Task 5** ran over every reachable flow. Every one of 4,929,751 `cannot_decide` cells has such a step.
      - The hidden-C-6 parent gets C-9's headcount step: C-4 at "450 or fewer" or typed 499 or 500, and C-9 "Not sure".
      - Read literally, "the first need's step" would offer it C-6, which it is not shown.
  - *Carried from Task 5 (your correction of 2026-10-26):* the threshold in force is worded without any internal reference. Vision choice 4 is cited in the evidence, never on the page.
- **The offer** "Check the parent company on its own too" asks C-9 and C-10, posts again, and replaces the result.
  - *Carried from Task 3:* the offer appears only where `visibleQuestions` lists C-9 and C-10, so never for a fund.
  - `countryOther` is sent as the upper-case ISO code; the schema refuses lower case.
- **The errors** 400, 413, 429, 503, a network failure and a timeout each show their standard wording. None of them shows an earlier result as current (EXP-6). A 429 says to try again in a minute.
- **The width.** No horizontal scrolling at 320 and 375 CSS pixels (EXP-4; WCAG 2.2, criterion 1.4.10).
- **Accessibility:**
  - each question is a labelled radio group;
  - the result's table has row and column headers;
  - focus moves to the result's heading when it appears;
  - states are words plus glyphs (EXP-3).
- **Copy that states a question count** derives it from `visibleQuestions` over §4.5's visitor types, minimum and maximum. It is never a literal (the Stage 1a rule).
- **The page needs nothing but a browser** (PRF-14).

**Tests (red first):**
- **`checkView`,** for a fixture in every line kind and every reachable state: each cell's words are those of its own line kind and state.
  - Counterexample: no cell shows another state's words.
  - Counterexample: no cell shows the same state's words from another kind. A `duty` line never shows exemption words.
  - *Carried from Task 5:* **the next step**, by the rule in "The result" above. The fixtures include the hidden-C-6 case: an EU parent with C-4 "450 or fewer" and C-9 "Not sure".
    - Its `parent_own` cells show C-9's headcount step, never C-6's.
    - Counterexample: an individual company's headcount step links C-4, and a parent's own links C-9.
    - Over the reachable sweep, no cell's step offers a question the visitor is not shown.
- **The render** (`react-dom/server`, with no new dependency): every path in `SENT_FIELDS` that a fixture populates appears in the rendered markup. This is CHK-2's "rendered or not sent", tested against the declared list from Task 4.
- **The labels.** The preliminary and draft labels and the hypothetical heading are present, with a counterexample: a signed, fresh fixture renders no draft label.
- **The errors.** Each of the six error states renders its own words and none of the others'.
- **The claims test** stays green, and the copy's counts are derived.
- **The route:** 200 with the timeline; 400, including an answer to a hidden question (C-8 sent for a German company); 413; and 503 on a damaged verification record, with the refusal's body unchanged.
- **The old modules are gone:** no file imports `lib/checker` or `lib/checkResponse`.

**Teeth:**
- **T6a.** `legalBasis` is no longer rendered. The render test must name the path.
- **T6b.** The preliminary label is removed. The label test must fail.
- **T6c.** A 429 is shown with the generic error words. The error test must name 429.
- **T6d.** The draft label is shown unconditionally. The signed-fixture counterexample must fail (failure mode 5).
- **T6e, the agreement gate keeps its teeth.** Its existing teeth is re-run in the clean clone after the switch: the ledger untraced must make agreement fail while liveness passes (`deployment-agreement.mjs`).
- **T6f, the refusal.** The route catches `IntegrityFailureError` and returns a 200 marked draft. The 503 test must fail.
- **T6g** (carried from Task 5). `checkView` takes the first need's step whatever the visitor is shown. The hidden-C-6 case must fail, naming the `parent_own` cell and C-6.

**Checked in a browser on a local server** started from the clean clone (§1, Servers), at 320, 375 and 1280 pixels:
- keyboard-only completion of every visitor path of §4.5;
- the width check (`document.documentElement.scrollWidth <= innerWidth`) on every result shape, with a positive control: an element 900 pixels wide, planted temporarily, is reported;
- a WCAG 2.2 AA review of the screen, recorded as a checklist.

**Baseline:** Task 5's finishing count.

**Commit message:** "Move the free check to the timeline in one step, so a visitor sees each route's result, its reason and its next step at once, labelled preliminary and draft, and nothing still speaks the old answers"

*As executed (2026-10-26, uncommitted at hand-off).*
- **Counts:**
  - engine 84 / 3,320, unchanged;
  - frontend 34 / 1,291 → 36 / 1,350, from two new test files plus 12 tests in existing files;
  - typecheck exit 0; csrd grep 7; every golden's sha256 unchanged;
  - the standalone gate (`npm run test:standalone`) passes: liveness, agreement on both fixtures, and T6e's teeth.
- **Files: 29 paths.**
  - **New:** `lib/check-view.ts`, `components/marketing/CheckTimeline.tsx`, `test/check-view.test.ts` and `test/check-timeline-render.test.ts`.
  - **Deleted:** `lib/checker.ts` and `lib/checkResponse.ts`.
  - **Changed:**
    - the route, `CheckFlow.tsx`, and the two pages (the derived question count);
    - `lib/check-answers.ts` (the C-5 and C-10 hint);
    - `app/globals.css` and `app/tokens.css`;
    - `vitest.config.ts`: `esbuild: { jsx: 'automatic' }` for the render test, a configuration change, not a dependency;
    - 11 test files and the four standalone scripts, each re-expressed with its meaning kept.
- **The next step,** carried from Task 5, is `checkView(timeline, answers)`.
  - "Sets in this visitor's context" is read from `buildCheckProfile`: a definite answer changes the fact's value, compared with "Not sure".
  - The sweep over Task 4's enumeration covers 396,565 flows and 4,929,751 `cannot_decide` cells. Every cell has a step; none offers a hidden question. The hidden-C-6 parent gets C-9's headcount step.
  - A row's own step that would offer a hidden question is not offered: a parent whose country is "Not sure" sees its own lines "Not checked" with no step, while the same result's country step asks C-1.
- **Your direction of 2026-10-26.**
  - The C-5 and C-10 hint now reads "Revenue after rebates and VAT. Banks and insurers: if you are unsure which figure to use, choose ‘Not sure’." This is routine copy cleanup. Proposal §4.1 still holds the old hint; this note records the change.
  - Question hints and wordings are now in the no-promised-follow-up scan (`wording.test.ts`). Its positive control is the old hint, "we'll confirm the right figure later".
- **The retirement** (DG-8, part 3).
  - `provenance-public-golden.test.ts` pins its artefact (`f0ff1dcd…`) and shows why its answers can no longer be posed.
  - Its oracles moved to `checker-timeline-public-golden.test.ts` where a line carries them.
  - Two stay on the recorded artefact, because no timeline line carries them: S-004's corrected case, and the sources of requirements that have no line.
  - The migration artefacts are unchanged.
- **No test or assertion was deleted or weakened.** An independent audit found six assertions re-expressed more loosely than before (W1 to W4, H1 and H2). Each was pinned again exactly, with literals, and shown red when changed.
- **Routine corrections:**
  - **The width check's measure.** Under the browser's phone emulation (below 768 px), the plan's `scrollWidth <= innerWidth` failed its own positive control: a planted 900 px element widened `innerWidth` to 921. The check compares `scrollWidth` with the target width itself, and the control is then caught.
  - **The WCAG 2.2 AA review** found two contrast failures, both corrected:
    - the focus ring, `--ds-ring-focus`, site-wide: about 1.4:1 → 6.28:1 (1.4.11);
    - the check screens' small text, from the ghost or faint inks to `--ds-text-muted` (`.ds-check-meta`): 2.76–3.81:1 → 7.32:1 (1.4.3). The shared `.ds-micro`, `.ds-label` and `.ds-caption` rules and their ink tokens are unchanged.
  - **The request:** a 15-second timeout. A hidden answer is refused 400 with `{error, questions}`. `TimelineRefusalError` gives 503 with `{error, refusal}`. The integrity 503's body is unchanged.
  - **Navigation words** that are not state wording stay in the flow: Back, Next, Run the check, Change your answers, Try again, Run another check, "QUESTION n / m", "ANSWER THIS QUESTION TO CONTINUE".
- **Found outside Task 6, not changed:**
  - the home page `/` is 427 px wide at 320 and 431 at 375: the coverage section's status chips overflow;
  - `/company` is 321 px wide at 320.

  EXP-4 applies to the public site, so these belong in Task 13's acceptance at the latest.
- **Teeth:** T6a to T6g were red on their intended assertions, in the implementer's run and in the parent's.
  - The parent used its own mutations for T6a, T6c, T6d and T6g, ran them in its own clone, and re-ran them on the final bytes.
  - Each file was restored by sha256. T6e ran inside the standalone gate.
- **Browser checks** (local, parent-run, on 127.0.0.1:3217):
  - keyboard-only completion of all seven §4.5 visitor paths, with both offers. Each path ran at one width (paths 2 to 5 at 1280, path 6 at 320, path 7 at 375, path 1 at 1024), plus a step link followed by keyboard at 320;
  - the width check on every result shape at 320, 375 and 1280 px;
  - the WCAG 2.2 AA checklist.

  Evidence: `side-session-notes/local_043075c1-…/2026-10-26T0616Z-dp1-task6/` (`parent/BROWSER-CHECKS.md`).

### Task 7: the pilot surface off on the host; error pages

**Delivers:** ACC-9 (unchanged, off on the host), EXP-6, EXP-9.
**Waits on:** DG-10.

**Files:**
- `lib/hosting-mode.ts`;
- `middleware.ts`;
- `app/dashboard/page.tsx`, `app/pilot-access/page.tsx`, `app/api/pilot-access/route.ts`, `app/api/pilot-access/sign-out/route.ts` and `app/login/page.tsx`;
- `app/not-found.tsx` and `app/error.tsx`;
- tests `test/hosting-mode.test.ts`;
- the existing gate suites, which run with the surface on.

**Interfaces. Produces:** `pilotSurfaceEnabled(env)`, true only when `DATASTRATA_PILOT_GATE` is exactly `on`.

**Behaviour:**
- **When the surface is off,** each of the five routes answers 404 before it reads any secret, profile, cookie or body.
  - A page renders the standard 404.
  - A route handler returns `{"error":"not_found"}` with `Cache-Control: no-store`.
  - The middleware returns 404 for `/dashboard`.
- **When it is on,** every existing behaviour of the gate is unchanged.
- **`not-found` and `error`** use Task 5's wording and show no stack, path or variable name.

**Tests (red first):**
- With the variable unset, empty, `off`, `ON` or `true`, each route answers 404, and no secret or profile reader is called.
- A positive control in the same suite: with `on`, the same reader is called once, with the request's input (failure mode 7).
- No `Set-Cookie` appears on any response while the surface is off. Positive control: with it on, a correct sign-in sets `ds_pilot_access`.
- Every existing gate test passes with the surface on.

**Teeth:**
- **T7a.** The default becomes on. The 404 tests must fail.
- **T7b.** `/api/pilot-access` ignores the switch. Its 404 test must fail, and only its.
- **T7c.** The comparison is made case-insensitive. The `ON` case must fail.

*Carried from Task 6 (your direction of 2026-10-26): two phone-width fixes, a bounded addition to this task.*
- **Delivers:** EXP-4, in part (the home page and `/company` at phone width).
- **The defects,** found in Task 6's browser checks (`side-session-notes/local_043075c1-…/2026-10-26T0616Z-dp1-task6/parent/BROWSER-CHECKS.md`, §2) and present before Task 6:
  - the home page `/` is 427 px wide at 320 and 431 at 375. The coverage section's status chips, which are `ds-chip` with `white-space: nowrap` and rendered through `components/marketing/CoverageStrip.tsx`, extend past the edge;
  - `/company` is 321 px wide at 320.
- **The fix is to the underlying layout** of the elements that overflow, found by measuring them: for example, a row that wraps or stacks at narrow widths, or a cell that may shrink.
  - **No redesign:** the same content, order, words, typography and colours.
  - **No overflow clipping:** no `overflow: hidden`, `clip` or `overflow-x` on `html`, `body`, a page wrapper or a section, and no width crop such as `max-width: 100vw`, used to hide what overflows.
- **Files:** only those that lay out the overflowing elements. Expected: `CoverageStrip.tsx` and/or `app/globals.css`, plus whatever `/company`'s measurement names. Any other file needs a reason in the report.
- **Verification:**
  - Both pages, in a browser, on a local server the task starts from its clean clone (§1, Servers), at 320, 375 and 1280 px.
  - The check is `document.documentElement.scrollWidth` ≤ the **target width**. Not `innerWidth`: Task 6 found it widens under the browser's phone emulation, so `scrollWidth <= innerWidth` misses overflow.
  - Record, for each page and width, the widest element's right edge.
  - Positive control: a 900 px element, planted temporarily, is reported.
- **T7d.** The fix is reverted in a temporary copy. The width check must report `/` at 320 and 375, and `/company` at 320.
- **Separate from the gate.** It is handed over as its own commit within Task 7, with no separate approval: "Let the home page's coverage chips and the company page fit a phone screen, so no public page scrolls sideways at 320 or 375 pixels".
- **Task 13's check 6 is unchanged.** It still checks every page at 320, 375 and 1280 px on the host.

**Baseline:** Task 6's finishing count.

**Commit message:** "Keep the passphrase pilot gate off unless a server switches it on, so the hosted site exposes no sign-in that has not had its independent review"

### Task 8: `/healthz` and structured logs (PLT-6, its DP1 part)

**Delivers:** PLT-6, for DP1's scope.

**Files:**
- `lib/health.ts` and `app/healthz/route.ts`;
- `lib/log.ts`;
- `app/api/check/route.ts`, for one log line;
- tests `test/health.test.ts` and `test/log.test.ts`.

**Interfaces. Produces:**
- **`healthReport(inputs)`:** pure. Its result:
  - `status`: `ok` or `refused`;
  - `release`: the commit SHA the platform supplies, or `unknown`, never guessed;
  - `deployment`: a non-secret identifier the platform supplies for each deployment, or `unknown`. The executor confirms which variable and that it is not secret;
  - `pack`: `{version, legalSnapshot}`;
  - `inputs`: for each runtime-input directory, `{files, sha256}`;
  - `engine`: `ok` or `refused`.
- **`logEvent(event)`:** writes one JSON line to standard output, carrying `at`, `event`, `route`, `status`, `ms` and `release`.

**Behaviour:**
- **`GET /healthz` answers 200** only when all three hold:
  - the pack loads with integrity (`csrdPack()`);
  - every runtime-input directory is readable;
  - a fixed synthetic check returns its expected cells. `lib/health.ts` holds them as a constant, and a test checks that the constant equals that case in `checker-cases.json`.
- **Otherwise it answers 503,** with `status: refused` and no path, stack or variable name. It never downgrades (the status-truth rule: refuse, never downgrade).
- **The runtime-input directories** are the ones the pack loader and the verification reader open:
  - they are named by resolving each the way the reading code does;
  - they are **not** taken from `verificationTracingGlobs()`, so that an untraced file shows up as a digest that differs, rather than agreeing by construction (failure mode 1);
  - each digest is sha256 over the sorted list of (relative path, file sha256).
- **`/api/check`** logs exactly one line per request, with the event `check.answered`, `check.refused`, `check.too_large` or `check.malformed`. It never logs the body, an answer, a header or an IP address.
- **`/healthz`** logs a line only when it refuses.
- **Caching:** `Cache-Control: no-store`.

**Tests (red first):**
- **The report:** 200 on the repository; 503 on a fixture whose verification record is damaged; 503 when a directory is missing; 503 when the fixed check's cells differ.
- **The log line.** A check with distinctive answers (a typed turnover of 123456789.01, `countryOther` "XK"):
  - produces one line with the route and the status;
  - contains neither value nor any answer key.

  The positive control is that the line exists, with its fields (failure mode 7).

**Teeth:**
- **T8a.** An integrity failure is reported as `ok`. The damaged-fixture test must fail.
- **T8b.** The request body is logged. The no-answers test must name the value it found.
- **T8c, the agreement teeth, in the clean clone.** Build the standalone artifact with the ledger's glob removed from the tracing (a copy of `verification-runtime-inputs.mjs`, restored after). Then:
  - its `/healthz` `inputs.verification` digest must differ from the one computed over the repository;
  - with the glob restored, it must match.

  The run uses the existing standalone harness and a free loopback port.

**Baseline:** Task 7's finishing count.

**Commit message:** "Add a health check that proves the runtime inputs reached the server and a log line that carries no answers, so a hosted fault is seen without anything about a visitor being kept"

### Task 9: the data-flow record (D5, condition 2) — a document

**Delivers:** DEP-3 (its DP1 condition); the input to PUB-4.
**May run beside Tasks 1 to 8.**

**File:** `docs/superpowers/specs/<date>-dp1-data-flow-record.md`.

**Behaviour.** For the DP1 topology, every record that the host and each provider keep. For each:
- what it contains;
- where it is processed or stored;
- for how long;
- the source it was read from, with its date and a confidence tag;
- what is unconfirmed.

**At least:**
- **The host's edge:** the CDN, the firewall and routing middleware, in every region. Firewall data and IP addresses.
- **The host's functions in `fra1`.** The check's body is processed in memory and not kept. Runtime logs keep the method, path, query, status, host, user agent, edge region and DataStrata's log lines. Kept 1 day on Pro, or 30 days with Observability Plus [V]. Whether they keep IP addresses is unconfirmed [?].
- **The host's build logs, deployment metadata and team records** (staff data).
- **The service-generated data that the host's DPA treats as its own** (DG-5).
- **GitHub:** the code and CI logs. No visitor data.
- **GoDaddy:** the DNS zone and the registrant's data.
- **The uptime monitor:** its probe records and the alert recipients.
- **The mailbox provider,** under either DG-4 option: under option A, the provider of the address you already run; under option B, the new mailbox. Its contact correspondence is described apart from the hosting records.
- **The visitor's browser:** no cookie or web storage set by the site. Fonts self-hosted at build. Links to EUR-Lex followed only on a click. On protected deployments, Vercel's cookies by authentication method.

**The provider block.** The document ends with one fenced `json` block listing each provider:
- `provider`, `role` and `records`;
- `region` (or "not stated by the provider");
- `retention` and `source`.

Task 10's test reads it.

**Residency wording** for the privacy notice, matching the flows (D5, "Residency, honestly"), in three parts described separately (corrected from Task 9):
- **Checker answers:** "DataStrata does not store the answers you give the free check. Your browser sends them to our host in the body of a single request. Our application uses them in memory to calculate your result and keeps no copy once it has answered."
- **Hosting records:** "The host processes request data, including your IP address, at its edge in the region nearest to you and in Frankfurt, and keeps request logs for [the retention]. Its parent company is in the United States, under the EU-US Data Privacy Framework and standard contractual clauses."
- **Contact correspondence:** what DataStrata keeps when a visitor emails or calls, for how long, and the mailbox provider under either DG-4 option.

This wording is a draft for counsel. The record's §13 gives the full draft, and where the hosting sentence differs from the flows.

**Teeth.** The defect to detect is a record or a host that the record omits. It is detected in Task 13, which needs the protected preview:
- the browser's network log for every page and every check path must show requests only to the deployment's origin;
- a request to any other host fails the record;
- positive control: a page loaded with a temporary third-party image is reported.

**Done when:**
- every row has a source;
- the unconfirmed items are listed;
- you and your co-founder have read it for DG-2.

**Commit message:** "Record every place DP1's hosting keeps data, so the host is chosen and the privacy notice written against what the flows actually are"

### Task 10: the legal pages, About, pricing and the contact text

**Delivers:** PUB-4, PUB-2, PUB-5, PUB-1 (re-checked).
**Waits on:** DG-4, DG-5 and DG-18; Task 9.

**Files:**
- `content/legal/{imprint,privacy,terms}.json`;
- `app/{imprint,privacy,terms,pricing}/page.tsx`;
- `lib/company.ts`, `app/company/page.tsx` and `app/contact/page.tsx`;
- `components/marketing/Footer.tsx`;
- tests `test/legal-pages.test.ts` and `test/site-pages.test.ts`.

**Behaviour:**
- **The texts.**
  - Each text is a structured file: a title, a version, and sections, each with an id, a heading and plain paragraphs.
  - The page renders it verbatim.
  - The texts are drafted from Appendix A and Task 9, go to you, and to counsel if DG-5 says so.
  - Only the approved version is installed. Its sha256 is pinned by the test, so an unapproved edit fails.
- **The imprint** carries every item of Appendix A §A.1 that applies to the entity you name. The second channel is a telephone number (DG-4).
- **The privacy notice** carries every item of Appendix A §A.2, names every provider in Task 9's provider block, and has a `cookies` section stating that the site stores nothing on, or reads nothing from, the visitor's device.
  - It describes checker answers, hosting records and contact correspondence separately (Task 9, record §13).
  - It names the mailbox provider under the DG-4 option chosen, including the existing address's provider under option A.
  - It states the request-log retention that matches the host's Observability Plus setting as Task 11 records it.
- **The terms** are as Appendix A §A.4: information only, not legal advice; for businesses; liability drafted with counsel.
- **The footer** on every page links to the imprint, the privacy notice, the cookies section, the terms and the pricing page. It drops the link to `/login`.
- **The About page** shows your names, roles and biographies, the entity and the location (DG-18). With them filled in, no fallback text can render.
- **The pricing page** says pricing is by conversation and gives the imprint's contacts. It shows no plan and no price (PUB-5).
- **The contact page.** Its unconfigured text points to the imprint's contacts instead of saying contact details are unpublished. The form logic is unchanged.

**Tests (red first):**
- **Every page carries the footer.** The page list is read from the filesystem: `app/**/page.tsx`, excluding the pages of DG-10's five pilot-surface routes. Each page's source must render `<Footer`, in the manner of the Stage 1a claims test. Task 13 checks the rendered pages on the host. The footer is rendered with `react-dom/server`, and each of its five links is present.
- **The imprint** holds a non-empty section for each Appendix A §A.1 item, by id.
- **The privacy notice** names every `provider` in Task 9's block, and holds each §A.2 section.
- **The pins.** Each legal file's sha256 equals its pinned approval.
- **No fallbacks.** `COMPANY.legalEntity` and `locations`, and every `TEAM` name and biography, are filled.
- **Pricing.** The page contains no currency amount and no plan name. The counterexample check: a currency amount planted temporarily is found.

**Teeth:**
- **T10a.** The register section is removed from the imprint. The imprint test must name it.
- **T10b.** A provider is added to Task 9's block (in a copy). The privacy test must name it.
- **T10c.** One character of the terms is changed. The pin must fail.
- **T10d.** One team member's name is set to `null`. The fallback test must fail.
- **T10e.** The footer link to the privacy notice is removed. The footer test must fail.

**Baseline:** Task 8's finishing count. Task 9 adds no test.

**Commit message:** "Publish the imprint, privacy notice and terms you approved, and the people behind DataStrata, so the site names who is responsible and what data the hosting keeps"

### Task 11: host configuration, CI on every push, and the hosted checks

**Delivers:**
- DEP-3, DEP-4 and DEP-8;
- DEP-5 (recorded as not applicable);
- PLT-7, PLT-8 and PLT-9;
- CHK-7.

**Waits on:** DG-2, DG-13, DG-15, DG-16 and DG-17.

**Files:**
- `vercel.json`;
- `.github/workflows/checks.yml` and `standalone.yml`;
- `scripts/smoke-production.mjs` and `scripts/hosted-checker-goldens.mjs`;
- `docs/operations/dp1-host-configuration.md` and `docs/operations/dp1-runbooks.md`;
- tests for the two scripts' pure parts.

**Behaviour:**
- **`vercel.json`** pins functions to `fra1`, and nothing else the host does not need.
- **The configuration record** lists every console setting with its intended value and its source:
  - the root directory, and files outside it included in the build;
  - the install command, matching the verified recipe (`npm ci --ignore-scripts`);
  - Node 24;
  - the production branch `main`;
  - no environment variable set, and `DATASTRATA_PILOT_GATE` absent;
  - Deployment Protection: Vercel Authentication for All Deployments, production included, until DG-1; then Standard Protection, so previews stay protected;
  - the toolbar off for previews and production;
  - the host's analytics and speed tools off;
  - **Observability Plus:** its intended state, on, off, or this project excluded, as you decide. It sets the request-log retention, 30 days or 1 day (Task 9, record V4), which the privacy notice states. It is read back with the other settings;
  - Deployment Checks on the three jobs;
  - the firewall rule of DG-15;
  - notifications and the spend budget;
  - the uptime monitor's checks and recipients (DG-13).

  You apply it (Appendix B). The executor reads the settings back from the dashboard with you and records them.
- **The order of application.** The record states it, and B-5 follows it:
  1. Create the project.
  2. Set Vercel Authentication for All Deployments, and the toolbar and analytics settings.
  3. Read each setting back, on the account. This is stage 1 of §4.2.
  4. Only then connect Git.
  5. Once the first deployments exist, run the anonymous and authorised URL checks. This is stage 2 of §4.2.

**Tests (red first),** for the scripts' pure parts:
- the check functions against recorded response fixtures;
- the comparison against case fixtures;
- the secret never appearing in their output;
- the secret sent only in the `x-vercel-protection-bypass` header, never in a URL they build.

**Teeth:**
- **T11a.** Against a local production server with `X-Frame-Options` removed from a copy of the config, the smoke run must report a failure per response (as P6b did).
- **T11b.** Against a local server with the pilot surface on, the pilot-404 checks must fail. That is the positive control that they can see a live gate.
- **T11c.** Against a local server whose issuer mapping is mutated to `does_not_apply`, the goldens runner must report the KNW-14 cases.
- **T11d.** The bypass value passed as a sentinel must not appear anywhere in either script's output.
- **T11e, CI.** You push a scratch branch carrying one failing test, and the run must be red. The run's address is recorded and the branch deleted.
- **The build's sentinel scan** runs as in pilot readiness, with its positive control.

**Baseline:** Task 10's finishing count.

**Commit message:** "Configure the host and the checks that run against it, so every push is tested, production waits for green checks, and a deployment can be probed without changing it"

### Task 12: DNS records and their check

**Delivers:** DEP-1; DEP-2's DP1 part (§3.2).
**Waits on:** DG-3 and DG-4.

**Files:** `docs/operations/dp1-dns-records.md`; `scripts/check-dns.mjs`, whose pure core `dnsProblems(expected, answers)` is wrapped by a `node:dns/promises` adapter; `test/check-dns.test.ts`.

**Behaviour:**
- **The records:**
  - the apex A record and the `www` CNAME to the values on the host's domain card;
  - no AAAA at the apex or `www` (R4 §8.1);
  - no GoDaddy parking record;
  - no forwarding;
  - with DG-4 option A, the no-mail records: null MX `0 .`, `v=spf1 -all` and `_dmarc` `v=DMARC1; p=reject`;
  - with option B, the mailbox's MX, SPF, DKIM and DMARC;
  - a lowered TTL and a rollback note (R4 §8.1).
- **The check** compares live answers with the expected set, and also fetches `https://<domain>/` and `https://www.<domain>/`. One must serve the site and the other redirect to it, inside the host.

**Tests (red first),** against fixtures:
- an exact match passes;
- each defect is named.

**Teeth:**
- **T12a.** An extra AAAA record in the fixture. The check must name it.
- **T12b.** A parking A record in place of the host's. The check must name it.
- **T12c.** DMARC missing. The check must name `_dmarc`.

The live run is part of Task 14.

**Baseline:** Task 11's finishing count.

**Commit message:** "State the domain's DNS records and check them, so the site resolves only to the host and the domain cannot be used to send mail before DP2"

### Task 13: pre-exposure acceptance, on a protected preview

**Delivers:** the evidence for DG-1, across all 32 rows.
**Run by:** the parent.
**Waits on:** your acts B-5 to B-10, and the release commit pushed.

Each check is recorded verbatim in `PRE-EXPOSURE-EVIDENCE.md`, with its positive control.

1. **Nothing exposed early** (§4.2).
   - Deployment Protection reads back, on the account, as Vercel Authentication for All Deployments.
   - On the preview, and on any production deployment that exists:
     - an anonymous request is refused;
     - an authorised request with the automation token is served, the positive control.
   - Any production deployment found is recorded.
   - The pilot surface answers 404 on the preview (Task 7).
2. **Protection.** A request without the bypass token is refused. The same request with it is served (the positive control). The token is sent only as the `x-vercel-protection-bypass` header, here and in every check below, never as a query parameter.
3. **Smoke** (`--url`, with the bypass token in the header): every check passes.
4. **The checker's goldens** pass against the preview's `/api/check`. Positive control: one expectation flipped in a temporary copy is reported.
5. **`/healthz` agreement:** `release` equals the commit, and every `inputs` digest equals the one computed in the clean clone at that commit.
6. **The browser checks,** at 320, 375 and 1280 pixels, on every page and on a check down each visitor path:
   - no horizontal scrolling: `document.documentElement.scrollWidth` ≤ the target width, with a planted 900 px element as the positive control. *Carried from Task 6:* not `innerWidth`, which widens under phone emulation;
   - requests only to the preview's origin (Task 9's teeth, with its positive control);
   - cookies as Task 9's record (§9) expects for the authentication method the check uses, recorded with the result:
     - none with the bypass header alone;
     - Vercel's bypass cookie alone with `x-vercel-set-bypass-cookie`;
     - Vercel's authentication cookie alone for a signed-in team member.

     Any other cookie fails;
   - no `localStorage`, `sessionStorage` or IndexedDB entry under any method. Positive control: an entry set by hand is reported;
   - no host toolbar or analytics script.
7. **Accessibility:** a WCAG 2.2 AA review of each DP1 screen, recorded as a checklist (EXP-5).
8. **The legal pages:**
   - each served text's sha256 equals its approval;
   - the footer's five links are on every page;
   - the imprint and the privacy notice can be reached from the result page.
9. **Truthfulness:**
   - every figure on the landing page equals the pack's (PUB-1);
   - the status words follow the record (KNW-5);
   - no page lists an act as "adopted · not in force" whose entry into force has passed on the planned go-live date, read from the official record. This is the CD-1 note: SRC-007's act enters into force on 10 November 2026.
10. **No placeholder** on any rendered page. Positive control: a local page with a name set to `null` is reported.
11. **The data-flow reconciliation:**
    - every request host, cookie and storage observation is in Task 9's record;
    - every provider in the record is named in the privacy notice;
    - the host's Observability Plus setting reads back as Task 11 records, and the privacy notice states the matching request-log retention.
12. **PLT-7, the rotation:**
    - you regenerate the bypass token;
    - the old one is refused;
    - the new one is served;
    - the runbook records the steps.
13. **PRF-14:** a first answer from a browser with nothing installed.

The evidence goes to you for DG-1, with every failure fixed and re-run first. A fix is a commit through the task that owns the file.

### Task 14: go-live, post-exposure acceptance, and the rollback and alert rehearsals

**Delivers:** the done-when; DEP-1, DEP-4, DEP-8, PLT-6, PLT-9 and CHK-7 on production.
**Run by:** the parent, with you.
**Waits on:** DG-1.

1. **DG-1** is quoted verbatim in the evidence.
2. **Production.** You fast-forward `main` to the release commit and push.
   - The production deployment waits on Deployment Checks until the three jobs pass. It is then assigned to the production domains, still behind Vercel Authentication.
   - The hold and the promotion are recorded, with their times.
   - **Under DG-1, you change production's protection to Standard Protection.** That is the act that exposes the release. Then an unauthenticated request to the production alias is served, and one to a preview is still refused. Both are recorded.
3. **The domain.** You add it to the host and enter Task 12's records. Then:
   - the certificate is issued;
   - `check-dns.mjs` passes against the live answers;
   - the domain is served over HTTPS (DEP-1, DEP-2).
4. **Task 13's checks 3 to 6, again,** against the production domain with no bypass token: smoke, goldens, `/healthz` and the browser checks.
   - **The browser checks run in a fresh, unauthenticated profile:** never signed in to Vercel, with no bypass header, query parameter or cookie. On every page and down each visitor path, the expectation is:
     - no cookie;
     - no `localStorage`, `sessionStorage` or IndexedDB entry;
     - requests only to the production origin.
   - Positive control: an entry set by hand in that profile is reported.
   - Step 2's preview refusal is a plain request outside this profile, so Vercel's login page cannot add its cookies to the profile.
5. **The burst test** (PLT-9, CHK-7): 40 checks in 30 seconds from one address.
   - Up to 30 are answered 200, and the rest 429.
   - One check from the browser after the window succeeds (the positive control), and the page shows the 429 wording while limited.
6. **The alert rehearsal** (PLT-6):
   - the monitor's checks on `/healthz` and `/` are live;
   - a temporary extra check on a path that answers 404 alerts both people within its interval;
   - each person confirms receipt, and the time is recorded;
   - the temporary check is deleted.
7. **The rollback rehearsal:**
   - a second production deployment exists; a redeploy of the release commit is enough, since `/healthz` reports `deployment`;
   - you roll back to the first deployment;
   - `/healthz` shows the first deployment and the smoke run passes;
   - you promote the second back, which turns production domain assignment on again [V];
   - `/healthz` shows the second deployment and the smoke run passes;
   - the times and the steps go into the runbook.
8. **The DEP-4 teeth,** with your consent:
   - you push a commit to `main` whose only change makes one required check fail, for example a test asserting false;
   - production must stay on the previous deployment (`/healthz` unchanged) while the commit's deployment is held;
   - you then push its revert, the checks pass, and the revert is promoted.

   The deployed application is the same in both commits, so the site is unaffected even if the gate failed open. If you decline, the evidence is step 2's recorded hold, and the row's teeth is recorded as configuration evidence only.
9. **The done-when checklist** (§0) is ticked, with links to the evidence.

---

## §8. Closing the phase

- **The checkpoint.** `docs/superpowers/CHECKPOINT-dp1-public-site-and-free-checker.md` records:
  - what was found;
  - what was decided, with every DG quoted;
  - what is handed forward: the remainders of §3.2, CD-1's status, and DP2's inputs.
- **The board.**
  - Each of the 32 rows' "Built?" column set to §3.1's last column.
  - The §3.2 rows stay "Partial", with what DP1 proved in their "Verification evidence".
  - DEP-5 stays "Not built", with "not applicable on Vercel (DG-17)" in its evidence.
  - KNW-1's text updated to 24 requirements.
  - The counts recomputed by script, not by hand.
- **The vision.** If DG-12 was approved, a one-line clarification of law 23 is proposed under change control, for your approval.
- **Codex** reviews the whole phase.
- **The dashboard** is updated: DP1's progress, the deliverables, the steering log and the usage.
  - The phase's status (DP1 done) comes from the checkpoint.
  - The rows' "Built?" column shows capability status only, so the six §3.2 rows read "Partial" under a finished phase. That is intended, not drift.
- **Commits:** the commit commands for the checkpoint and the board.

---

## §9. Coverage check (run on this plan)

**Every DP1 row has a task.** §3.1 lists the 32 rows of the phase map. Each has at least one task, apart from PRV-3, which DG-9 recommends leaving out.

**Every done-when clause has its proof.**

| Clause | Proved by |
|---|---|
| Production serves the site and checker from the hosted environment | Task 14, steps 2 to 4 |
| The checker's goldens and the public-route checks pass against it | Task 13, checks 3 and 4; Task 14, step 4 |
| The legal pages carry your approval | Task 10's pins; Task 13, check 8 |
| Alerts reach a person | Task 14, step 6 |
| A rollback has been rehearsed | Task 14, step 7 |
| Every row's DP1 obligation is proven (§3.1) | Each row's tasks; Task 13; Task 14, step 9 |

**Every item of the hand-over has an answer.**

| Hand-over item | Answered by |
|---|---|
| 1. E8's gates | DG-1 to DG-5 |
| 2. The QD-4 drafts and reason code R | DG-6 to DG-8 |
| 3. PRV-3 | DG-9 |
| 4. ACC-9 and the pilot Home | DG-10 |
| 5. The freeze | DG-11 |
| 6. Alerts and law 23 | DG-12, with DG-13 |
| 7. Rows that reach later phases | DG-14 and §3.2 |
| 8. PLT-9 | DG-15 |
| 9. DEP-4 | DG-16 |
| 10. DEP-5 | DG-17 |
| 11. PUB-2 | DG-18 |
| 12. No decision needed | The list under §2's table |

**QD-1's guards and goldens:**
- the start-year guard is in Task 4;
- the band guard is in Task 3;
- the §4.6 goldens are Task 4's cases;
- law 16's rule P-e and law 3 for hidden questions are Task 4's question guard. P-e is checked in every combination where a question is shown, on engine results, with relevant exemption determinations counting (DG-19, option B).

**Three corrections are recorded:**
- QD-4's teeth wording (Tasks 1 and 2);
- the provenance goldens a version bump reaches (DG-8);
- the early-exposure guard (§4.2).

---

## §10. Limits

- **The vendor facts** were read in documentation on 2026-10-23, and some are unconfirmed:
  - whether firewall rules apply to previews;
  - who on a team can Force Promote;
  - today's default protection for new projects;
  - whether runtime logs keep IP addresses;
  - how the host treats Next's `s-maxage` on prerendered pages;
  - the monitors' free-tier terms and data locations.

  Each is verified on your account in Appendix B or in Task 13 before anything relies on it.
- **Vercel Authentication for All Deployments.**
  - Vercel's documentation states that it is available on every plan, covers production, and needs no paid add-on (§4.2, cited).
  - What remains to verify is this project's setting on your account. It is read back before Git is connected (stage 1), and the URL checks run once deployments exist (stage 2).
  - If the setting cannot be selected, or an anonymous request is served, the step stops for your decision.
- **Appendix A is research, not legal advice.** Some items rest on third-party or excerpt sources, and they are marked.
- **The counts** in §1 were recorded on 2026-10-22 and not re-run, because this session ran no code.
- **The teeth checks in this plan are unrun.** The two from QD-4 were corrected here. Others may be defective as worded, and the executor reports any that are.
- **The estimate** in §0 is a hypothesis (E8, rule 6).
- **The agreement check's directory list.** `/healthz`'s list of runtime-input directories is hand-named so that it stays independent of the tracing globs. A new input directory added later would also need adding there. The standalone agreement gate in CI still covers the artifact.

---

## §11. Next steps and commit commands

1. **The previous session's two commits,** if they have not yet been run:
   ```bash
   git add docs/vision/VISION.md docs/vision/VISION-BOARD.md
   ```
   ```bash
   git commit -m "Record the approval of vision 1.1 and the DP0 decisions: agreed service commitments before any contract, pilot contracts included, and KNW-14 so no unencoded route reads as no duty"
   ```
   ```bash
   git add docs/superpowers/specs/2026-10-23-questionnaire-research-and-question-refinement.md docs/superpowers/specs/2026-10-23-qd4-content-corrections-for-dp1.md
   ```
   ```bash
   git commit -m "Record the settled DP0 questionnaire decisions and draft the two content corrections DP1's checker needs, so each can be approved before the plan relies on it"
   ```
2. **This plan:**
   ```bash
   git add docs/superpowers/plans/2026-10-23-dp1-public-site-and-free-checker.md
   ```
   ```bash
   git commit -m "Plan DP1 so the public site and free checker can go live with every gate, task and teeth check stated before any of it is built"
   ```
3. **Codex's review** of this plan, with §12 as its guide.
4. **Your decisions** of §2 marked "With the plan", and approval of the plan.

---

## §12. A review guide for Codex

1. **Scope.**
   - Are §3.1's 32 rows exactly the phase map's?
   - Does any task build something outside them (§3.3)?
2. **The gates.**
   - Does every item of the hand-over have a recommendation and a specific decision (§9)?
   - Is DG-14's separation honest? Does each row's "What DP1 proves" match what the row's DP1 part can prove, and does no row read "Built" while part of its acceptance is unproven (§3.1, §3.2)?
3. **The checker.** Check Tasks 3 and 4 against the proposal:
   - the bands of §4.3, exactly;
   - the start-year guard's operator list derived from the schema;
   - the question guard's two directions: the shown direction checked in every combination on engine results (law 16), and the hidden direction (law 3); T4f and T4f3, the evidence that it catches irrelevant visibility; the C-7 rule check (DG-19, option B);
   - rule R's rows, against §9.2;
   - the "Not sure" and "never asked" distinction.
4. **The switch (Task 6).** Does it keep the meaning of every existing test it re-expresses, especially the status-truth boundary's public cases and the standalone agreement gate's teeth?
5. **The teeth checks.**
   - Does each one fail for the right reason?
   - In particular: the in-memory pack mutations (to avoid failing at load for the wrong reason), the provenance-golden expectations, T8c's agreement teeth, and the DEP-4 teeth on `main`.
6. **Data.**
   - Do the logs carry no answers?
   - Is nothing stored in the browser?
   - Does the data-flow record cover what the host keeps?
7. **Exposure.**
   - Does Vercel Authentication for All Deployments keep every deployment private until DG-1: an early merge, the old `main`, every preview? Its settings are verified before Git is connected, and anonymous and authorised URL checks run once deployments exist.
   - Is removing production's protection under DG-1 the only act that exposes the release?
8. **Security claims as assumptions.** Are the assumptions and failure cases stated?
   - DG-15's per-region counters;
   - the bypass token;
   - Force Promote;
   - B2's compatibility exception, which does not apply to `/api/check`, since it carries no session.
9. **The corrections** to QD-4's teeth wording, and DG-8's list.
10. **The derived checker scope.** It is listed under "No decision needed" in §2: headline timeline only, with nothing else sent.
11. **Appendix A.** Is it framed as research, with counsel's items marked?

---

## Appendix A. The legal-page checklist

From the research of 2026-10-23. **Not legal advice.** Tags: [V] read on the official page that day; [X] a lead only; [3P] a third-party source; [?] unconfirmed. Counsel decides each item marked for counsel.

**A.1 Imprint (§ 5 DDG, in force since 14 May 2024; § 18(1) MStV)** [V]
- **The rule:** easily recognised, directly reachable and always available. A footer link on every page, the result page included.
- **Name, legal form and address of establishment.** For a UG, the name must carry "UG (haftungsbeschränkt)".
- **The authorised representatives:** the managing directors.
- **Fast electronic contact:**
  - an email address;
  - a second fast, direct channel (CJEU C-298/07). A telephone number fits DP1;
  - a non-electronic route on request.
- **The register court and number.**
- **The VAT ID** (§ 27a UStG) or the economic identification number, if either exists.
- **Share capital,** only if capital is stated anywhere.
- **Liquidation status,** if any.
- **A supervisory authority,** only if the activity needs a licence.
- **§ 18(1) MStV:** name and address, and the representative of a legal entity.
- **Counsel decides:**
  - whether a free tool counts as "usually offered for payment";
  - whether § 18(2) MStV applies later, when published analyses arrive (PUB-6).

**A.2 Privacy notice (GDPR Art. 12 and 13)** [V]
- **The form:** concise, transparent and in plain language.
- **The controller:** identity and contact details.
- **A data protection officer:** unlikely to be required (Art. 37; § 38 BDSG); say so if none.
- **For each processing:** its purpose, its legal basis, and the concrete legitimate interest wherever Art. 6(1)(f) is used. The processing to cover:
  - hosting and request logs: IP address, time, URL, user agent and status, for delivery, security and error analysis (Breyer, C-582/14);
  - the check: answers processed transiently and not stored; they are personal data for a sole trader, and the legal basis is for counsel;
  - contact by email or telephone: the correspondence DataStrata keeps, for how long, and the mailbox provider under either DG-4 option, including the existing address's provider under option A. This is described apart from the hosting records (Task 9).
- **Recipients and processors:** every provider in Task 9's block. The host's DPA and its "service-generated data" are for counsel.
- **Third-country transfer:** the EU-US Data Privacy Framework (adequacy decision (EU) 2023/1795, in force; appeal C-703/25 P pending), with the standard contractual clauses named as a fallback.
- **Retention,** for each record, from Task 9.
- **The rights:** access, rectification, erasure, restriction, objection and portability.
- **A complaint to the supervisory authority** of the controller's German state (§ 40 BDSG).
- **Whether providing the data is required.**
- **Automated decision-making:** none.
- **The `cookies` section:** nothing is stored on or read from the device (§ 25 TDDDG), so there is no banner (DSK, para. 116).

**A.3 No ODR link.** The platform closed under Regulation (EU) 2024/3228 [V]. § 36 VSBG is a consumer duty; that it does not apply to a strictly B2B site is a reading for counsel [?].

**A.4 Terms** (counsel's matter)
- The result is information only, not legal advice, and is preliminary.
- Use is for businesses.
- Liability is drafted with § 309 No. 7 and § 307 BGB in mind; liability for intent can never be excluded (§ 276(3)) [V].
- If use forms an electronic contract, the terms must be retrievable and storable (§ 312i(1) No. 4) [V].

**A.5 Accessibility.** The BFSG is likely out of scope for a B2B check with no consumer contract; micro-enterprises providing services are exempt [V]. No accessibility statement is required outside the BFSG [V]. EXP-5 applies regardless.

---

## Appendix B. Your acts, in order

| # | Act | For |
|---|---|---|
| B-1 | Read §2 and give the decisions marked "With the plan"; approve the plan | DG-6 to DG-12, DG-14 to DG-16 |
| B-2 | Commit the plan and the previous session's documents (§11) | — |
| B-3 | With your co-founder, choose the host after reading Task 9's record | DG-2 |
| B-4 | Buy the domain at GoDaddy; turn on two-factor authentication | DG-3 |
| B-5 | Create the host account on Pro: accept the terms and the DPA, turn on two-factor authentication, set the spend budget and notifications. Create the project, and **before connecting Git** set Vercel Authentication for All Deployments, production included; turn the toolbar and analytics off; set no `DATASTRATA_PILOT_GATE`; set Observability Plus to the state Task 11 records. Read each setting back with the executor (stage 1 of §4.2). Create the protection-bypass token for automation and give it to the executor for the session; create no shareable link | DG-2, PLT-7 |
| B-6 | Connect the GitHub repository; production branch `main`; Deployment Checks on the three jobs. Push the feature branch. Once the first deployments exist, the executor runs the anonymous and authorised URL checks (stage 2 of §4.2). Open the pull request to `main` | DG-16 |
| B-7 | Publish the firewall rule | DG-15 |
| B-8 | Choose and create the uptime monitor; its checks and recipients as Task 11 records | DG-13 |
| B-9 | Give the entity's details, the email address and the telephone number, and the names, biographies and location | DG-4, DG-18 |
| B-10 | Approve the wording (Task 5) and each legal text (Task 10); commission counsel if DG-5 says so | DG-5 |
| B-11 | Commit each task's change as handed over, and push the feature branch. Push and then delete the scratch branch for T11e. Regenerate the bypass token when Task 13 asks | All tasks; PLT-7 |
| B-12 | After Task 13, give DG-1 | DG-1 |
| B-13 | Fast-forward `main` to the release commit and push; under DG-1, change production's protection to Standard Protection; add the domain; enter the DNS records | Task 14 |
| B-14 | Confirm that each alert arrived; carry out the rollback and the promotion; consent to the DEP-4 teeth on `main`, or decline it | Task 14 |
