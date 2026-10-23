# DataStrata vision, version 1.1 (proposed)

> **Version 1.1, PROPOSED on 2026-10-23 at your direction; not yet approved.** It adds **E8, delivery phases ordered for the earliest deployment**: each phase ends integrated and deployed, and the hand-over's separate document stages are folded into the phases that need them. It also updates E1, E4 (constraint 11), choice 8's timing and the board's phase map. No capability is added, removed or re-scoped. Version 1 stays the approved reference until you approve version 1.1.
> **Version 1.1, corrected on 2026-10-23 before approval, at your direction.** AI rule drafting (RUL-2) now goes live only after the legal evaluation (CNF-3), whose reference-judgement author is people decision P4: CNF-3 moves from DP7 to DP6, and P4 becomes a DP6 gate. Professional-indemnity insurance (DEP-9) is now a prerequisite to the first paid contract, a DP7 gate, while the rest of DEP-9 stays in DP8; it is business decision 9 in E6. The deployment-first order and the scope are unchanged: no capability is added, removed or re-scoped.
> **Version 1, approved by you on 2026-10-23.** This approves the product vision only, not sequencing, implementation or runtime work. Still open: the people decisions P1–P5 (E6); the eight board rows marked Suggested, each needing your approval; and every design marked PROVISIONAL, among them the confidence mechanism (C6), hosting (D5, choice 8), the subscription check (D4) and the discovery feed list (C2). Approval makes the behaviour marked PROPOSED the agreed product direction; each part still needs its own plan and approvals before it is built.
> **Version 1 changes from draft 3:** substantive support is judged only by recorded AI or human judgments; DEP-9 has no demand condition and separates SOC 2 readiness from certification; behaviour while the MacBook is off and the subscription check are consistent throughout; DEP-7 refers to the operating authority P2 will name.
> This document and its register, [`VISION-BOARD.md`](VISION-BOARD.md), are DataStrata's reference for what we build and why: the "bible" every plan and task must cite. Nothing in either file authorises building, sequencing, installing, spending, buying, creating an account, sending a live communication or running an agent.
> Everything here describes intended behaviour. Unless the board marks a row Built, it does not exist yet; anything labelled PROPOSED is a proposal awaiting your approval.
> Written 2026-10-23 (your local date) against the candidate at `e7fc141`, branch `feature/opus55-subscription-migration`. Uncommitted: you commit it.
> **Draft 3.** Draft 2 was aligned with your corrections of 2026-10-23: the free checker optional with direct registration and guided onboarding; the wider destination committed for phased delivery; AI on your MacBook (Opus 5.5 through your subscription, Qwen locally) with the Qwen allocation assessed; confidence a required deliverable, with quotation validation kept apart from substantive support; and two people mapped separately from the AI roles.
> **Draft 2.** Draft 1 was revised the same day for Codex's second review: customer-only fact confirmation, purpose-bound readiness facts, publication in three records with a coherent rollback, three levels of permission, the confidence mechanism kept provisional, the single-admin dependencies stated, hosting made conditional, and PRF-11 credited.

## How to read this

- **Part A:** what DataStrata is, who it is for, and the laws it never breaks.
- **Part B:** the customer: sign-in, the journey, the regulation checker, history and notifications.
- **Part C:** DataStrata's staff: the acts you perform, sources and scanning, the approval workbench, adjudication, the confidence level, the admin dashboard and the agents.
- **Part D:** the foundation that exists (Opus 5.5, Qwen), where rule and source updates live, data protection and the platform.
- **Part E:** the three tracks, what is settled, the boundaries still in force, the constraints the build plan inherits, the choices open with my recommendations, the corrections to the hand-over, and the delivery phases (E8, proposed in version 1.1).

`VISION-BOARD.md` lists every capability with an ID, its disposition, its implementation status, its verification evidence (kept separate), its source and its end-to-end acceptance. IDs such as **[CHK-1]** point into it.

### Change control

The rule that keeps the vision from drifting. [U23; wording PROPOSED]

1. A new feature, or any change in behaviour, enters the board as **Suggested**, with its source and a one-line acceptance.
2. You approve it, or not. Only an approved item may be planned.
3. Every plan and every task names the board IDs it delivers. Work that delivers nothing on the board is out of order.
4. Fixing a bug restores the behaviour the board already describes. If a fix needs different behaviour, that change goes on the board first.
5. Each new version of this document says what changed, why, and when you approved it.

### Labels

| Label | Meaning |
|---|---|
| ORIGINAL | Stated in the July plans |
| APPROVED | Accepted by you; the evidence is cited. Includes PROP's "accepted as direction" |
| U23 | Your direction of 2026-10-23 (quoted in the hand-over, §1) |
| DEFERRED | Approved for a later stage, not removed |
| PROPOSED | Written by me for your approval |
| PROVISIONAL | Depends on research not yet done |
| OPEN | Your decision (sometimes with your co-founder) |
| CORRECTED | A factual correction to the hand-over |

### Sources

| Code | Source |
|---|---|
| P1 | `product-strategy-pass-1.md` (20 July 2026) |
| P2 | `Pass 2 absorbed.docx`, with your comments C0–C3 of 21 July 2026 |
| P2c | `docs/briefs/product-architecture-pass2.txt` (condensed Pass 2) |
| UX | `docs/briefs/ui-ux-mockup-brief.txt` |
| P3 | `Deltamere_Pass_3_Applicability_Engine_and_CSRD_Validation.docx` (26 July 2026) |
| PROTO | `frontend/prototypes/app-modern.dc.html` (invented data) |
| DS | `New website design/handoff/design-system.md`, the Seismograph / Oxide system |
| LAWS | `backend/engine/CLAUDE.md`, the engine's product laws 1–9 |
| ACC | `docs/superpowers/specs/2026-08-14-csrd-knowledge-accuracy-design.md` |
| FAC | `docs/superpowers/specs/2026-08-20-verification-factory-design.md` |
| STB | `docs/superpowers/specs/2026-08-21-status-truth-boundary-design.md` |
| TRUST | `docs/superpowers/specs/2026-09-25-trust-measurement-and-evaluation-design.md` |
| QWEN | `docs/superpowers/specs/2026-09-25-local-qwen-assistance-design.md` |
| BRIEF, CORR | Your commercial-platform brief and your eight corrections (2026-10-20) |
| PROP | `docs/superpowers/specs/2026-10-20-commercial-platform-proposal.md`, revision 2, accepted as direction, with §11 |
| AUTH | `docs/superpowers/specs/2026-10-21-authentication-comparison-before-1b.md` |
| CPR | `docs/superpowers/CHECKPOINT-pilot-readiness.md` |
| MSG | Your message to Codex of 2026-10-22, quoted in the audit §1.4 |
| U23 | Your direction of 2026-10-23, quoted in the hand-over §1 |
| U23-P | Your direction of 2026-10-23 on phases: "it should be in an order that is aimed at deployment at the earliest. phases have to be defined and vision document to be updated accordingly" |
| AUDIT | `audits/2026-10-22-vision-and-implementation-audit.md` (outside the repository) |
| CODEX | Codex's read-only review of the audit and the hand-over, 2026-10-22T20:37Z |
| LW, F1B | The paused drafts `specs/2026-10-22-local-product-workflow-sequence.md` and `plans/2026-10-22-increment-1b-i-local-platform-foundation.md` (inputs only, not approved) |

The working reports behind this version are in `side-session-notes/local_043075c1-…/2026-10-22T2049Z-vision-v1/reports/` (R1 original inventory, R2 accepted changes and policies, R3 the Opus and Qwen foundation, R4 hosting and email).

### Words we use

Your word "ratifier" covers more than one act in the existing designs. To keep each act honest, this vision uses five words. [PROPOSED mapping; the acts come from the sources shown]

| Act | What it means | Who does it at the start | Source |
|---|---|---|---|
| **Review** | Dispose of a detected change or a scan finding; adjudicate a company case | Either person | PROP §3–§4 |
| **Approve** | Accept an AI-drafted rule change into the pack once its approval prerequisites are met and you have read its evidence. This is your "ratifier confirms". The content stays draft until it is verified | Either person | U23; PROP §4 ("AI may draft... the proposed edit") |
| **Sign** | Sign an agent verification dossier for one requirement version: "checked against source text by a named person, not legal advice". The gate refuses any MISMATCH or OPEN_QUESTION. The only route to **verified** | Either person, named | ACC (the user signs); FAC; TRUST |
| **Ratify** | A named professional legal expert's opinion; two people do not, by themselves, establish that expertise. The only route to **ratified** | Neither person, unless an expert is engaged (P3) | LAWS 8; ACC ("ratified: professionally opined") |
| **Publish** | Authorise a pack revision to reach customers, after its impact preview | The person who did not approve that revision | PROP §4 |

Other terms:
- **Pack:** the rules for one regulation (CSRD today). A **regulatory package** for scanning is a pack and the register sources that affect its requirements.
- **Period:** a company's financial year.
- **Run:** one stored evaluation by the engine.
- **Case:** one open question that needs a fact, evidence or a rule.
- **Content status:** each requirement carries four dimensions, recorded separately and never merged into one label: verified encoding, legal ratification, monitored, and commercial support. The public words built in Stage 1a are "Supported", "Draft · evaluation only", "Monitored" or "Coverage gap", and "Planned". [APPROVED: PROP §1.2]
- PROP's **"reviewer"** covers Review and Approve; its **"publisher"** covers Publish.

Technical terms, in plain words:
- **Fenced text:** official text handed to an agent inside marked boundaries, each document labelled with its identifier and fingerprint, so the agent can quote it but never take instructions from it.
- **Closure:** the set of documents an agent may read for one requirement: the cited law and what it refers to.
- **Pinned quotation:** a quotation tied to the exact version (fingerprint) of the document it came from.
- **Absence term:** a word an agent says a document does not contain; the check confirms it is absent.
- **Dossier:** the verification record for one requirement version: the reader's account, the prosecutors' challenges and the adjudicator's verdicts.
- **Golden profile:** a synthetic test company whose correct results are fixed; an unexpected change in them blocks a rule change.
- **Idempotent:** safe to run twice; a repeated job has no extra effect.

---

## Part A. What DataStrata is

### A1. In one paragraph

DataStrata is a regulatory-intelligence service for sustainability regulation. For one specific organisation it keeps answering six questions, and every answer is cited, versioned and dated [ORIGINAL: P1 §2, P2c §1]:

1. What applies to us?
2. What changed?
3. What must we do, and by when?
4. What evidence is required?
5. What happens if we do nothing?
6. Are we ready to be checked?

The customer declares sourced facts. A deterministic engine decides what applies. The answers become owned obligations, then tasks, then an evidence trail. A continuing **regulation checker** keeps the answer current as the law changes and as the company changes [ORIGINAL; U23].

Behind it, DataStrata's staff run a regulatory workbench. Official sources are watched. AI drafts each rule change with its evidence and a confidence level. A person approves it, and a person authorises its publication, before any customer is affected [ORIGINAL: P2, UX §10; U23].

### A2. Who it serves first

- **Regulation.** CSRD first [APPROVED: BRIEF §1; U23]. The destination is wider: every agreed capability is committed for phased delivery after the CSRD product, none conditional on customer demand unless you approve it (choice 5b). CBAM is the second pack [DEFERRED: PROP §1.1, §10]. Every later regime must fit the same engine with no program-specific code; that is the standing architecture gate [LAWS].
- **The customer's question.** A company in 2026 asking what is coming; law not yet transposed into national law is part of the market [APPROVED: ACC].
- **Customer segment.** PROP §1.1 recommended EU undertakings, parent groups and their advisers whose CSRD position for FY2025–27 is uncertain. **OPEN** (PROP §9.3).
- **Germany first.** **OPEN** [CORR §8; PROP §9.3]. It matters for content: a definitive answer in a Member State needs that country's national-law pack (law 6).
- **The EY questionnaire.** It informs how we ask questions. It does not by itself widen the first product beyond CSRD [PROPOSED; CODEX]. See choice 5.

### A3. What the customer ends up with

- Confidence that "the rules now hunt them" [P2].
- Protected revenue and resolved uncertainty [P1 §2].
- A defensible "what we knew, when" record that an auditor or a buyer can replay [P1 §2; P2c §3, phase 6].
- Quiet weeks: an explicit, dated all-clear when nothing affects them [P2c §5].

**How we know it works: reliance, not engagement.** Success is caught changes, honest all-clears and renewals, not daily use. Checker completions and newsletter sign-ups are not evidence that anyone will pay [ORIGINAL: P2 §6; P3 §8.3, §9.2; EXP-10].

### A4. What DataStrata does not do [ORIGINAL: UX §18]

- It does not calculate emissions, complete questionnaires as a service, or replace legal counsel.
- It is not a document vault. Evidence is a registry with provenance and pointers; managed custody is optional and late.
- Ask DataStrata is a cited lens over the record, never an open-ended regulatory oracle.
- Later-phase features (supplier networks, public API and MCP, enterprise integrations) are shown as coming later, never implied as available.

### A5. The product laws

The rules no feature, fix or plan may break. They consolidate LAWS 1–9, Pass 2's "Where AI never decides", Pass 2's five principles and operating doctrine, the UX principles, the accepted proposal and the trust design. Laws 2 and 9 change in substance (law 2 pending choice 1); laws 20, 21 and 23 are new; law 22 restores a July rule.

1. **Two graphs, one join.** Shared regulatory knowledge is built once, maintained once and used by every customer. Each customer's facts, results and history are private, isolated and exportable. Obligations join the two. [P2c §2, §8]
2. **The engine decides; AI proposes; people approve.** [Revised. LAWS 2; P2; BRIEF §4; PROP §4; U23. Pending choice 1.]
   - Every applicability result, status, deadline and all-clear is computed by the deterministic engine, from confirmed facts and published rules.
   - AI may propose rule changes, interpretations, candidate facts, triage and explanations. Each proposal carries its evidence and, once C6 is settled, a confidence level.
   - A person approves every shared rule change; a named expert ratifies where the release policy requires; customers confirm their own facts; a person authorises each publication.
   - No AI output reaches a customer as a determination until the rule it rests on is published.
   - **AI never finalises:** whether a requirement applies to a company; any status, score or readiness figure; any deadline; a publication; the acceptance of evidence; a legal interpretation without a named person's sign-off; the suppression of an escalation, the closure of a task, or the dismissal of a change as irrelevant. It may propose any of these to a person.
   - **AI never writes into a pack.** The app writes approved content; the AI's draft is an input to your approval. [FAC]
   - *Current text, for comparison (LAWS 2):* "AI may draft pack content, extract candidate facts, and explain stored results — it never decides applicability, never publishes into a pack, never generates an all-clear."
3. **No silent "does not apply".** A missing fact, unknown code, straddling range or unresolved upstream result yields "cannot decide yet" with a reason. Only definitive evidence yields a definitive no. [LAWS 1]
4. **Unconfirmed facts are invisible to the engine, and only the customer confirms them.** A fact counts only once an authorised customer user (an owner or a lead, never a viewer) confirms it. DataStrata's staff and AI may propose a fact; they never confirm one. [LAWS 3; PROP §3.1, §8 (1c); CODEX]
5. **Pending law never binds.** Proposed or adopted-but-not-effective rules can be evaluated and watched, but never create obligations. [LAWS 4]
6. **National-law gate.** No final legal conclusion while the governing Member State's national-law question is unresolved. A negative EU screen reads "threshold not met; national-law status requires review". [LAWS 5]
7. **Closed condition language.** No free-form expressions, scripts or model calls inside conditions. A new primitive must serve at least two programs. [LAWS 6]
8. **Everything cites, and only official records are cited.** Sources are tiered: legal record, official body, tracker, news. A tracker or news item can only prompt a search for the official record. [LAWS 7, 9; your words of 14 August: "double verified"]
9. **Content status is shown truthfully, in four dimensions never merged into one label.** Verified encoding (only by signing), legal ratification (only by a named expert), monitored (every source the requirement cites, and every register surface affecting it, checked successfully within its cadence; one past success does not count), and commercial support (only under a release policy). Customer-facing output from draft content carries the draft label. [Revised wording. LAWS 8; PROP §1.2; STB; TRUST §1]
10. **Nothing publishes itself.** Publication is a recorded human act, distinct from approval, signing and ratification, even when one person holds several of them. Proposed: a deploy refuses rule or register content that matches no authorisation, and only a successful, matching deploy counts as published (C3). [P2; PROP §4; CODEX]
11. **Resolution routes through facts and rules.** No one, staff or AI, sets a determination directly. A case is resolved by a confirmed fact, accepted evidence or a published rule or interpretation; each resolution creates a new run and keeps the old one. [PROP §3.3]
12. **Versions, not overwrites.** Every run is kept with its rule versions, facts and date. A prior period that is reassessed gets a new run beside the original. [P2c §8; PROP §11]
13. **Status is derived.** Never typed in, never generated by AI. Closures without evidence ("retained unknown", "no longer relevant") never read as resolved. [P2c §4; PROP §11]
14. **Confidence informs; it never decides.** A confidence level is not a status. It never replaces approval, signing or ratification; never overrides an unresolved contradiction or a signing refusal; never counts model agreement as correctness; and never disguises a missing fact. The mechanism itself is provisional (C6). [TRUST §3.3; UX §3; CODEX]
15. **Silence is never an all-clear.** "Nothing affects you" appears only when the scope has no open coverage gap and no pending review, and names the event, the source version, the reviewer and the date. A successful fetch is coverage, not review. [PROP §4; UX phase 5; CODEX]
16. **Collect only facts with a stated purpose in an active workflow.** We ask for a fact when an active rule needs it to decide applicability, or an active compliance workflow (baseline, gaps, evidence, readiness) needs it, and each question says which. We never ask in case a future rule might need it. [Revised. P2c §3, phase 1; the gap engine already works from confirmed readiness facts, `backend/engine/src/engine/gaps.ts`; CODEX]
17. **Every surface answers one of the six questions and ends in an owned next step.** [P2c §8; UX §3]
18. **Non-authoritative assistance stays labelled.** Local-model (Qwen) output is never recorded as a verification role, never fills a missing role, and never removes source text from what an authoritative role sees. [QWEN §1]
19. **Documents are data, not instructions.** Text inside a source or a customer document can never change a status or trigger an action. [TRUST §2.3; PROP §4]
20. **Company data stays where it is protected.** The scanning worker never reads company data [PROP §4]. AI processes a company's data only when that company has switched it on [PROP §6.7], on DataStrata's own AI worker (your MacBook) under the handling rules of D4, and it reaches a third-party AI model (Opus 5.5, through Anthropic) only if the company's setting allows third-party AI processing. Staff see company data only through the app, under the access rules of B1. [Revised for your decision of 2026-10-23; details PROPOSED in D4]
21. **Customers are told only what a published rule says.** No company is told it is affected by an unpublished change. [PROPOSED; follows from laws 2 and 10]
22. **An AI failure makes DataStrata slower, never wrong.** When a model is unavailable or its output fails a check, the work waits or goes to a person, and overdue work alerts a person; nothing is guessed. Every AI output keeps its maker: model, version and prompt. Models are suppliers, not architecture. [ORIGINAL: P2 §5, "Failure degrades speed, never truth"; "Provenance marks the maker, forever"]
23. **Permissions are enforced by the software, at three levels.** [PROPOSED; after r4 ran before your approval was recorded; CODEX]
   - **Operating approval:** a one-time approval, by the operating authority that people decision P2 names, to run the service in an environment. It switches scheduled jobs and automated messages on, and can be suspended.
   - **Standing permissions,** approved once and then used within their limits: each AI agent with its budget (for an Opus 5.5 agent, only after the subscription check of D4); each kind of automated message (verification and result links, change notices, the weekly briefing, reminders, security notices) with its approved template version.
   - **Individual approvals:** each publication, each newsletter issue, each verification-panel run, each AI run over its budget, and each break-glass use.
   - Nothing runs outside these.

### A6. Two graphs, one join

| Layer | What it holds | Rule |
|---|---|---|
| Shared regulatory knowledge | Sources, provisions, requirements, conditions, changes, evidence expectations | Built once, maintained once, used by every customer |
| Private company record | Each company's entities, facts, periods, results, obligations, tasks, evidence, cases and history | Isolated per customer, attributable, exportable |
| Obligation join | Created when a shared requirement is evaluated against a company's confirmed facts | Everything upstream creates it; everything downstream satisfies and proves it |

[ORIGINAL: P2c §2] Scanning lives on the shared side and never touches company data. The regulation checker is how each company's private record follows the shared side.

---

## Part B. The customer

### B1. Roles and sign-in

**Customer roles** [ORIGINAL: UX §2; APPROVED: BRIEF §2, PROP §2]

| Role | Does |
|---|---|
| Owner | Manages the workspace, users, roles, entity access and the company's AI setting |
| Lead | Maintains the profile, obligations, owners, evidence and reports |
| Contributor | Completes assigned tasks and adds evidence |
| Executive | Sees everything; approves plans and risk decisions (restored from UX §2; PROP has no executive role) |
| Viewer | Sees posture, exposure, horizon and decisions |
| Auditor or buyer reviewer | Scoped, read-only, time-boxed access (later in the sequence) |

**Staff permissions** [APPROVED: PROP §2, §6 for operator, reviewer, publisher and support; PROPOSED: approver, signer, ratifier and administrator as separate permissions; U23 "one admin to start"]: Operator (sources and scans), Reviewer, Approver, Signer, Ratifier (named experts only), Publisher, Support (time-boxed, granted, audited access to one company) and Administrator (staff accounts). Two people hold them as C1 maps; neither holds Ratifier unless a professional legal expert is engaged.

**Separate logins** [U23: "admin and customer have different logins based on their email address and registrations"; details PROPOSED]

- DataStrata stays one application with role-gated areas [APPROVED: PROP §2, settled 2026-10-20].
- Staff and customers are separate account spaces. Staff sign in at a separate staff address (for example `admin.<your domain>`), with invitation-only accounts and mandatory two-factor codes (TOTP) [APPROVED: PROP §6.1]. Customer roles never hold staff permissions [APPROVED: PROP §2].
- Customers sign in at the customer app and may register themselves through the checker (choice 3).
- An email address belongs to one account space. For a test customer account you use a different address.

### B2. The journey, end to end

| Phase | What the customer gets | What happens behind it | Who confirms |
|---|---|---|---|
| **0. Arrival** | A free check and a preliminary answer; never a blank dashboard | The engine runs the answers; nothing is guessed | No one: preliminary, labelled |
| **1. Declare** | A sourced company profile holding only facts with a stated purpose: applicability, or an active compliance workflow such as readiness | Upload, link or manual entry; AI proposes facts from documents with the page and passage; ranges allowed; exact values asked only near a threshold | The customer confirms each fact |
| **2. Discover** | A cited universe: Applies, Does not apply, Missing fact, Requires judgment | The engine's results with their "Why?" trail; list, filters, map, export | Deterministic; judgment cases go to adjudication |
| **3. Commit** | Owned obligations, credit for existing work, a gap ledger, exposure | Obligations instantiated from in-force rules that apply; gaps from confirmed readiness facts | Owners assigned by the customer |
| **4. Mobilise** | Tasks, owners, deadlines, a 90-day horizon, calendar export | Tasks from obligations and gaps; reminders | The customer |
| **5. Operate** | The answer stays current: the regulation checker, weekly briefing, change centre, "Something changed in our business", what-if | Shared scanning, publication, reassessment, notification | You for rules; the customer for facts |
| **6. Prove** | Evidence registry, readiness, dated reports, assurance access | Reproducible projections of the record at a date | Evidence accepted by a person |

[ORIGINAL: P2c §3; UX §5–§6; APPROVED: BRIEF §2]

**Phase 0 in detail: two ways in** [U23, and your alignment of 2026-10-23: "make the free checker optional, with direct registration and guided onboarding"; ORIGINAL "never start empty"; details PROPOSED, choice 3]

The free checker is optional. A visitor can start with it, or register directly and go straight to guided onboarding. Both paths end in the same workspace.

*Path 1, through the free checker:*
1. The visitor answers a short set of questions. Ranges and "I'm not sure" are allowed. The questions will be refined by the questionnaire research (step 2 of the hand-over) [CHK-1, CHK-2].
2. They see the headline answer at once, labelled preliminary and draft [CHK-3].
3. To keep it and see the full cited result, they give an email address. They receive an email with a link that opens their saved result for 7 days; using it proves they own the address. The email carries the link, not the result, which fits PROP §6.7's rule of no evidence content in email bodies [CHK-4].
4. From the link they register (set a password). Their checker answers become the start of their company profile, still labelled preliminary. If the address already has an account, they sign in instead and can add the result to their workspace [CHK-5].

*Path 2, direct registration:*
1. The visitor registers with an email address and a password, and verifies the address by a link [CHK-9].
2. Guided onboarding starts at once: they choose how to build the profile (upload, link or manual entry), then the guided interview asks only what is unresolved, one question at a time (phase 1). The first preliminary answer appears as soon as the facts allow, so the workspace is never empty [PRF-2, PRF-6].

*On both paths:*
- Newsletter consent is a separate, unticked choice, confirmed by a second email (double opt-in) and recorded with its wording and time [CHK-6; PROVISIONAL pending research R4].
- What is stored, for how long, and how it is erased follows a retention policy that does not exist yet [PRV-1; choice 3].

**Phase 1 in detail: building the profile** [ORIGINAL: P2 comments C0–C2; UX phase 1]

- Three ways in: upload suggested documents (annual report, financial statements, group chart), give a public link, or enter facts by hand.
- **Document extraction** proposes facts, each with the page and passage it came from. Nothing enters the record until the customer confirms it (law 4). Extraction runs only when the company has switched on AI processing of its data (law 20); otherwise facts are entered by hand or by link [PRF-4].
- **Ranges** are allowed for a fast first answer. Exact, sourced values are asked for only when a result is close to a threshold [PRF-5].
- **Threshold-critical facts** are confirmed one at a time, never in bulk [PRF-15; ORIGINAL UX phase 1].
- **The guided interview** asks only what is still unresolved, one question at a time, ranked by how much each answer would settle, with "I don't know" always allowed [PRF-6].
- **Groups.** Parent, subsidiaries, branches and the reporting perimeter [PRF-3].
- **Periods.** Results are per financial year (B4) [PRF-9].
- **Yearly refresh.** Each sourced fact has a review cadence. At onboarding the customer picks the month its annual report is published; DataStrata then asks for the new report each year and prepares the extracted facts for confirmation [PRF-8].

**Phase 2 in detail: the answer, explained** [ORIGINAL: UX phase 2, §8; U23 "everything the engine does... has a place in the front end"]

- Four states, in words and shapes, never colour alone.
- A **"Why?" drawer** on every result: the facts used, the condition, the sources and their versions, and any sign-off. The engine already computes this trail; it is not shown today [APP-2].
- The **content status** of the rules behind every result, in the four dimensions of law 9, and the answer tier: deterministic, expert-signed, or requires counsel [APP-3].
- **List and filters,** and the **Regulatory Universe Map** as a secondary view: regulation, requirement, obligation, action and evidence, each node expanding to its cited detail [APP-4, APP-5; P2 comment C3].
- **Every engine output has a place:** gaps, next questions, missing-fact needs, cautions, traces, obligation details (owner role, deadline logic, evidence expectations), pending law and the national-law gate [APP-7].
- **Export** of the result as a dated, reproducible report [EVD-6].

### B3. The regulation checker: the continuing service

[U23: "the regulation scanner must save the answers by the company and keep checking if any new relugations come up that may be applicable to them. Lets call this agent a regulation checker." ORIGINAL loop: P2c §3, phase 5. CODEX: define it as a complete continuing service.]

For each registered company, the regulation checker is the service that keeps its answer current. It is not an AI that decides what applies, and it is not a scanner that reads company data. It is five mechanisms working together:

1. **Saved company facts** [RC-1]. The company's answers live in a versioned profile. Each fact has a value or a range, a source, who confirmed it and when, the period it belongs to and a review cadence. A change adds a version; nothing is overwritten.
2. **Shared monitoring** [RC-2]. DataStrata watches the official sources once, for everyone (C2). The scanning worker never sees company data [APPROVED: PROP §4].
3. **Automatic reassessment** [RC-3]. When a rule change is published, the engine re-runs every company and period the change could reach, each under that company's own isolation and authorised by the publication record [APPROVED: PROP §2, §6.4]. The population is conservative: it includes companies previously assessed as out of scope, because a change can bring them in [APPROVED: PROP §4]. When a company's own facts change (a confirmed extraction, a refresh, "Something changed in our business"), the engine re-runs that company.
4. **New questions when the law needs new facts** [RC-4]. If a new or changed rule depends on a fact the company has not given, the engine's question compiler asks for it: "Answer 2 questions to keep your answer current". The result shows "Missing fact" until it is answered. This is how DataStrata covers new law without asking every possible question up front (law 16) [ORIGINAL: P2c §4, self-generating questions; PROPOSED as the checker's mechanism].
5. **Notification** [RC-5]. Each affected company is told, by email and on the site, what changed for it: before and after, why, and what to do. A company that is not affected receives the dated all-clear in its weekly briefing, under law 15.

**What it must cover** [CODEX; U23]

- **New laws, not just changes to known pages.** Discovery of new instruments (C2) [SRC-6].
- **Replacement sources.** A watched text moves, or a newer consolidated version appears [SRC-7].
- **Companies that a change brings into scope,** not only those already in scope [RC-3].
- **Historical periods.** A change that reaches a past financial year produces a reassessment beside the original (B4) [RC-6].
- **Monitoring failures.** A failed or missed check writes a coverage gap on the source and on every requirement it affects; customer surfaces show degraded freshness until a check succeeds within cadence; staff are alerted; the all-clear is withheld [APPROVED: PROP §4 failure semantics; RC-7].
- **Pending reviews.** The customer's "what changed" lists reviewed changes and, separately, open coverage gaps and pending reviews touching requirements its answer depends on. Which companies see a pending review is decided by the engine's dependency analysis, not by AI [APPROVED: PROP §4; RC-8].
- **Facts that go stale.** A fact past its review date stays in use but is flagged; the customer is asked to re-confirm it, and the answer says which facts are due for review [ORIGINAL: P2c §3, phase 5, drift monitoring; RC-10].

**What it never does:** decide applicability with AI; tell a company it is affected by a draft (law 21); issue an all-clear on silence (law 15); let the scanner read company data (law 20).

### B4. History and periods

[ORIGINAL: P2c §8 "versions, not overwritten states"; APPROVED: PROP §11; CODEX correction to LW]

The period rule, stated once. PROP §11 governs: closing a period never resolves a case (a case may still close as "no longer relevant", shown as a closure without evidence), and the "open period" population of PROP §4 extends to prior periods wherever the change can still affect them.

- A **period** is a company's financial year. CSRD duties attach to financial years.
- A **run** is one engine evaluation: company, period, pack revision, fact-set version and date. Runs are immutable and pin the engine build, the profile snapshot, the content identity and the labels as displayed [APPROVED: PROP §5.1].
- **What we knew, when.** Every period keeps every run. The current answer is the latest run; earlier runs stay visible with their date and the pack revision they used.
- **Reassessment of prior periods.** When a published change reaches a closed period (a deferral applied to a past year, for example), that period gets a new run labelled "reassessed under pack revision X, published on date D", beside the original. Nothing is overwritten.
- **Impact previews include prior periods.** Before publication, the preview lists every company and period the change reaches, open and closed [CODEX].
- **Closing a period** never resolves a case and never removes the period from impact analysis.

### B5. Notifications

[ORIGINAL: P2c §3, phase 5, UX flow B; APPROVED: PROP §4, §6.1; U23 "affected customers are emailed as well as notified on the website"; details PROPOSED]

- **Channels:** email, and in the app (a notification centre and Home's "What changed").
- **Kinds:** a change that affects you; pending reviews and coverage gaps; the weekly briefing; missing-fact requests; yearly refresh reminders; task and deadline reminders; evidence expiry; case updates; account and security notices.
- **Rules:**
  - only affected users are told about a change, once per company, change and period [APPROVED: PROP §4];
  - each user sets preferences, except for security and legally required notices;
  - every email says what happened in a sentence and links into the app; no evidence or document content in email bodies [APPROVED: PROP §6.7];
  - an email is never the only copy.
- **The newsletter** is separate from service notifications and opt-in only (choice 3). Every consent, confirmation, unsubscribe and bounce is kept in DataStrata's own consent ledger, with the exact wording shown, so consent can be proved [PROVISIONAL: R4, from the German data-protection authorities' guidance and BGH I ZR 164/09; not legal advice].
- **The weekly briefing** goes out on Monday afternoon, after a review window, so that changes found over the weekend can be disposed of first. A pending review withholds the all-clear only for companies whose answer depends on it (RC-8). In a week with no change at all it says so plainly, for example "We checked the 13 sources that cover you between 19 and 25 October. Nothing changed." In a week with changes that affect no one: "We reviewed 11 regulatory changes this week. None changes your current obligations" (UX §15), listing each event with its source version, reviewer and date (PROP §4).
- **The weekly briefing is a service message** only while it carries no promotion. German counsel should confirm that before the first one is sent [R4].
- **Delivery failures** (bounces, complaints) are visible to staff [NTF-6].
- **Automated messages run under standing permissions.** Once the operating approval switches live communication on, each kind of message runs under the template version you approved; each newsletter issue needs its own approval (law 23).

---

## Part C. DataStrata's staff

### C1. Two people, the AI roles, and the acts they perform

[U23: "one admin to start", updated by your alignment of 2026-10-23: "there will be two people... The legal agent has to carry the most weight"; CODEX: "rule verification, legal ratification and publication authorization remain distinct actions"]

**The AI roles carry the analysis.** The existing agent workflows continue unchanged: the verification pipeline's blind reader, seven prosecutors and adjudicator (together, the legal agent), and the drafting, triage, discovery, extraction and briefing agents of C8. The legal agent carries the most analytical weight: it reads the law, challenges each encoding and adjudicates with pinned evidence. No AI role performs a human act.

**Two people decide.** They examine the evidence the agents present and decide, looking hardest where the confidence level is lower (C6). Every shared rule change still needs a human approval (law 2). Two people do not, by themselves, establish professional legal expertise: unless a professional legal expert is engaged, neither of them ratifies.

| Act | Person A (you) | Person B (the second person) | Rule |
|---|---|---|---|
| **Review:** dispose of a change or finding; adjudicate a company case | Yes | Yes | Recorded with the reviewer's name |
| **Approve** a rule change | Yes | Yes | Only once its approval prerequisites are met; the depth of review follows the confidence level |
| **Sign** "verified" | Yes | Yes | Only when the gate allows; "checked against source text by a named person, not legal advice" (ACC) |
| **Publish** | Yes | Yes | Never a revision the same person approved: the approval and the publication of one revision digest come from different people |
| **Ratify:** a professional legal opinion | No | No | Only a professional legal expert, if one is engaged (people decision P3) |
| **Operate:** sources and scans | Yes | Yes | |
| **Support access** to a company | Yes | Yes | Under a time-boxed, recorded grant (ACC-7) |
| **Recover** the other person's account | Yes | Yes | The recorded two-person procedure of PROP §6.3 |
| **Operating approval** (law 23) | To decide | To decide | People decision P2 |

PROP's "reviewer" covers Review and Approve; its "publisher" covers Publish. Each act keeps its own screen action, confirmation and audit entry, and each person receives a weekly digest of the other's privileged acts. [PROPOSED mapping]

### C2. Sources and scanning

[ORIGINAL: P2, UX §10; APPROVED: BRIEF §4, PROP §4; U23: "souces should be watched regualrly, you decide what loop time... an option in the admin panel to initiate a scan for different regulatory packages... an option to mannually add the sources or change it"]

- **The source register** lists every watched official surface: tier (legal record, official body, tracker, news), authority, jurisdiction, the packs and requirements it affects, cadence and parser. The register is the authority on what may be fetched [APPROVED: PROP §4]. Its operating state (last attempt, last success, error class) lives in the platform database. Today it has 13 rows, and none has a recorded monitoring check (`lastSeen: null`) [CORRECTED; SRC-1].
- **You can add and change sources** in the admin panel. Each change is recorded (who, when, why) and tier-checked: a tracker or news surface can never become a citation [SRC-2]. Because fetching is allowed only to the register's hosts [APPROVED: PROP §4], a new host takes effect once the register change is published (choice 6).
- **Discovery of new instruments and replacement sources.** Besides watching known pages, a discovery job reads the official feeds that announce new acts (the EU Official Journal, Commission delegated acts and consultations, the gazettes of the countries we cover) and proposes (a) new instruments that may matter to a pack and (b) replacement sources when a watched text moves or a newer consolidated version appears. Proposals land in your queue; nothing joins the register until you accept it. Every item the first filter sets aside is logged with its reason, and you can open the full feed, so nothing is dropped silently [SRC-6, SRC-7; mechanism PROPOSED; feed list PROVISIONAL].
- **"Scan now" for each regulatory package.** Runs every source of that package, and its discovery queries, at once [SCN-2].
- **Three records** [APPROVED: PROP §4]: content (stored once per hash), observations (every attempt, success or failure) and change events (transitions). An unchanged fetch creates no event and no notification. Only a reviewer's disposition closes a change review; a later fetch never does.
- **What runs on its own.** Fetching and comparing run on a schedule [APPROVED: PROP §4]. AI triage of each event and AI assessment of discovery candidates run on their own within a standing approval and budget (choice 1b). Drafting starts when you mark an event material. Verification runs only on your command, until the held-out evaluation exists [FAC].
- **"Monitored" needs an always-on scheduler.** A requirement is monitored only when every source it cites, and every register surface affecting it, was checked successfully within its cadence; one past success does not count [APPROVED: PROP §1.2]. That is one reason hosting matters (choice 8).
- **Loop times** [U23 asked me to decide; PROPOSED]:

  | What | When |
  |---|---|
  | EU Official Journal and EUR-Lex | Daily, working days |
  | Official bodies (Commission, EFRAG, ESMA, national ministries) | Daily, working days |
  | National gazettes of covered countries | Daily, working days |
  | Trackers and news (triggers only, never cited) | Daily, working days |
  | Discovery of new instruments | Daily, working days, after the feeds |
  | Weekly briefing | Mondays at 14:00 CET, after the morning's review window |
  | Yearly refresh reminders | Per company, from the month it chose |
  | Reassessment | Immediately after each publication or fact change |
  | Failed fetches | Retried with capped back-off; a missed or failed cycle writes a coverage gap and alerts you |

  Why daily is enough and cheap: CSRD law changes over weeks and months. Fetching and comparing are deterministic and cost almost nothing; AI runs only when something changed, or for discovery. The service commitment proposed in PROP §9.2 (a legal-record change reviewed and briefed within five business days) fits comfortably.

### C3. From a detected change to a published rule

[ORIGINAL: UX §10; APPROVED: BRIEF §4; PROP §4]

1. **Scan** finds a change event.
2. **Review.** AI suggests a disposition (material, relevant or noise) with a plain-English summary; you decide [RUL-1, ADJ-1].
3. **Draft.** When you mark an event material, AI drafts the rule change (requirement, condition, dates, sources) and an interpretation note, from the fenced official text, with evidence and a confidence level [RUL-2].
4. **Challenge** (optional per change; needed for "verified"). The verification agents challenge the draft and produce a dossier [RUL-4].
5. **Simulate.** The engine runs the draft over the golden profiles and over every affected company and period, open and closed [RUL-5].
6. **Approve.** You read the draft against its evidence, answer every open question, and approve, amend, reject or escalate. Approval creates the first of three publication records [RUL-3]. If a dossier passed the gate, you may also sign it [RUL-8].
7. **Authorise publication.** After the impact preview, the publisher authorises publication of that approval [RUL-6].
8. **Commit and deploy.** A local command pulls the authorised change; you commit and push; the deploy runs [RUL-7].
9. **Activate.** The revision becomes active only when the deploy has succeeded and the deployed content matches the authorised content.
10. **Reassess** every affected company and period [RC-3].
11. **Notify** affected customers by email and on the site [RC-5].

**Publication in three records, in order** [PROPOSED. PROP §4 calls the result a "signed pack revision" without defining it; no Sign act is involved, so this vision calls it authorised]

| Order | Record | Created when | Holds |
|---|---|---|---|
| 1 | **Approval** | You approve a change in the workbench | The change, the approver, the time, the impact preview, and the digest of the approved content |
| 2 | **Authorisation, then commit binding** | The publisher authorises publication; later the commit is bound to it | The publisher and the time; then the commit, accepted only if its content digest equals the approved digest |
| 3 | **Activation** | The deploy has succeeded and the deployed content's digest equals the authorised one | The deployment and the time it went live |

- **Only activation counts.** A revision is published only once its activation record exists. A failed or mismatched deploy creates no activation: nothing appears published, no reassessment starts and no customer is notified, and the dashboard shows "authorised, not active" with the failure. [PROPOSED]
- **The deploy checks the binding.** Proposed: the deploy refuses rule or register content whose digest matches no authorisation, so a content edit made outside the app, for example in an engineering session, cannot publish itself (law 10).
- **What the content digest covers.** Two parts, recorded separately [PROPOSED]:
  - **rule content:** the pack's files (requirements, fact types, questions, obligation templates, gap tests, sources, catalogues, flags), the country packs, the corpus documents and their index, and the source register;
  - **verification state:** the signature ledger (signatures and revocations), the promotions file, and the verification records and evidence-use designations that signatures point to.

  An approval covers a rule-content digest and records the verification-state digest it was approved against [CODEX: the full approved-content identity, not only the pack directory].
- **Signatures and revocations** change verification state only. They are appended, reach the site by the same commit-and-deploy path (the status-truth boundary, STB), and need no impact approval beyond the signer's or revoker's own act. A revocation is never held back by the publication gate, because it only withdraws a claim. [PROPOSED]
- **Rollback is a new publication, not a restore.** It republishes an earlier revision's rule content through all three records. The signature ledger, revocations, promotions, approvals and audit history are append-only and never rolled back, and statuses are derived again against the restored content, so a revoked signature stays revoked. [PROPOSED; RUL-10]
- **The hand-off to git.** The hosted app holds no repository credentials. A local command pulls the authorised change, writes the files and prints the commit message with the legal justification the engine's content procedure requires; you review, commit and push. [PROPOSED]

### C4. The approval workbench (your "ratifier" screen)

[U23: "this should be easy on the ratifier... the presentation of evidence and the draft against it should look good, amazin UX UI"; ORIGINAL: UX §10, extraction bench and publication gate]

One screen per decision shows:

- the change in one sentence, and why it matters;
- the official text and the draft side by side, each claim linked to its pinned quotation, highlighted in the source;
- the current rule against the draft, as a readable difference in plain English and in the condition language;
- the approval prerequisites, each met or not; the signals, each passed, failed or not assessed; and the review level (C6);
- each open question and contradiction, each needing a recorded answer before approval;
- the simulation: which golden profiles change (expected or not) and which companies and periods would;
- the actions: Approve, Amend, Reject, Escalate (needs counsel), Re-run; and Sign, when a dossier exists and the gate allows it.

Design: the Seismograph / Oxide system [DS], with the prototype's workbench as the starting reference [PROTO]. Calm, keyboard-friendly, one decision per screen, nothing hidden behind a score [WB-1 to WB-4].

### C5. Adjudication: three kinds of unconfirmed item

[U23: "adjudication means all three"; APPROVED: PROP §3]

| Queue | What arrives | Who proposes | Possible outcomes | Never |
|---|---|---|---|---|
| **1. Scan findings** | Change events; tracker or news items needing an official record; discovery proposals; source changes | The scan and AI triage | Material, relevant or noise; accept or reject a source; open a draft | A news item becoming a citation; AI disposing of an event |
| **2. Company facts and cases** | Facts and evidence awaiting the customer; disputed extractions; measurement, interpretation and national-law questions | The customer, AI extraction, the engine | Fact questions go to the customer, who confirms; staff may request evidence or propose an answer with its source. Staff resolve interpretation and national-law questions by a recorded interpretation or a rule change. Escalate; keep unknown | Staff confirming a company's fact; setting applicability directly; a closure without evidence reading as resolved |
| **3. AI verdicts on rule encodings** | Verification dossiers with CONFIRMED, MISMATCH or OPEN_QUESTION verdicts | The verification agents | Dispose of each verdict; draft a fix (choice 1b); sign (only with no MISMATCH and no OPEN_QUESTION); revoke | Signing past a refusal; agreement counted as correctness |

Cases are keyed by company, period, scope object and question, and grouped by the underlying question. Fact and range questions go to the customer; measurement questions to DataStrata, then the customer; interpretation and national-law questions to DataStrata [APPROVED: PROP §3.1]. A shared legal question is answered once, by a pack revision or an interpretation note, and each company's case closes when its own run no longer needs the question. Your brief asked for qualified reviewers on legal cases [BRIEF §3]: an interpretation or national-law case you cannot settle is escalated to a named expert or counsel, never decided by default.

**What approval, adjudication and ratification each cover** (choice 1, recommended reading):

- **Shared rules and interpretations: approved** by one of the two people, once, for everyone, and **ratified** only by a professional legal expert, if one is engaged, where the release policy requires.
- **Exceptional company cases: adjudicated,** not approved or ratified. A reviewer proposes a fact for the customer to confirm, judges a piece of evidence, or decides that a rule or an interpretation is needed; each decision is recorded with their name. Only the customer confirms its facts (law 4). The result then follows from the engine (law 11).
- **Every individual assessment: neither.** It is computed by the engine from confirmed facts and published rules, and shows the content status of the rules behind it.

### C6. The confidence level (a required deliverable; its design is PROVISIONAL)

[U23: "the ratifier sees a confirmation confidence level... must be well defined and well thought out... highly sophisticated"; your alignment of 2026-10-23: "keep confidence as a required deliverable"; TRUST; CODEX]

**Status.** The confidence level is a required deliverable: the product will have one. What holds now is law 14: it never decides; never replaces approval, signing or ratification; never overrides a contradiction or a signing refusal; never counts agreement as correctness; and never hides a missing fact. The design below is **proposed and provisional** until step 4 of the hand-over defines the check behind each state, the task-specific evaluations and the approval prerequisites.

**What it is for.** The legal agent carries the analysis; the two people decide (C1). The level tells them how much checkable evidence supports a proposal, what is known against it, and how closely to examine it before deciding.

**Three things kept apart** [PROPOSED]:
1. **Approval prerequisites** decide whether a person can approve. They are explicit checks, not confidence. For a rule draft, for example: every quotation validated at its pinned version; every claim carries a quotation; the simulation has run; every open question and contradiction has a recorded answer; any unexpected golden-profile change is explained. Signing keeps its own gate.
2. **Measured signals** describe the evidence. Each is in one of four states: passed, failed, not assessed, or not applicable. A check that has not run is "not assessed" and is shown as missing; the absence of an objection is never a passed check.
3. **The review level** summarises the signals to direct attention. It gates nothing.

**Quotation validation is not substantive support** [PROPOSED; TRUST §1–§2]. Two different questions, measured separately:
- **Quotation validation** (signal 1) proves the quoted words exist in the source, at the pinned version. It is mechanical and says nothing about meaning.
- **Substantive support** (signal 2) asks whether those words actually support the claim made from them, read with the exceptions, conditions and dates around them. It is a recorded judgment, made only by the legal agent's adjudicator or by a person, and each judgment records who made it. Mechanical checks, including the existing evidence-use check, never judge support: they are reported with quotation validation (signal 1).
- Whether the whole encoding is right, its substantive correctness, is a third question that only the task evaluation measures (TRUST §3).

**The signals, with their states** [PROPOSED]

| # | Signal | Passed | Failed | Not assessed |
|---|---|---|---|---|
| 1 | Quotation validation | Every quotation is found again at its pinned version; every cited link between documents exists; every term said to be absent is absent; the existing evidence-use check's mechanical tests pass | Any of these fails | The check has not run |
| 2 | Substantive support | A recorded judgment, by the legal agent's adjudicator or by a person, found every claim supported by its quotation in context | A recorded judgment found a claim unsupported or misleading | No recorded judgment exists for some claim |
| 3 | Source authority | Every binding claim rests on a legal record | A claim rests only on a tracker or news item | A source's tier is unknown |
| 4 | Currency | The source was checked successfully within its cadence and its text is unchanged since the snapshot, however old the snapshot | A newer consolidated version or a pending amendment touches the provision | No successful check within the cadence |
| 5 | Completeness of the source text | Every cited provision, definition and amendment is in the text the agents saw | A cited provision is missing | Completeness has not been checked |
| 6 | Challenge outcome | The verification panel ran and confirmed every element | Any MISMATCH; an OPEN_QUESTION counts as "needs judgment" | The panel has not run |
| 7 | Simulation | Only expected changes | An unexpected golden-profile change | Not run |
| 8 | Stability | Re-runs gave the same substantive answer | They differed | Only one run so far |

Two further inputs are shown but are not signals: objections from a second, non-authoritative model such as Qwen, listed for attention only and never a pass or a fail (QWEN §5); and the fact basis of a company proposal, where an unconfirmed fact or a range straddling a threshold routes the case to "Missing fact" instead of lowering confidence (UX §3).

**Which signals apply to which proposal.** A signal that does not apply is shown as "not applicable".

| Proposal | Signals that apply |
|---|---|
| Rule or interpretation draft | 1 to 8 |
| Change-triage suggestion | 1, 3, 4, 8 |
| Discovery proposal | 1, 3, 4 |
| Case-resolution proposal | 1, 2, 3, 5 |
| Extraction candidate | 1 (the passage is on that page of the stored document), 2 |

**The review level, a starting proposal.** No name claims more than was checked:

| Level | Name | When |
|---|---|---|
| 0 | Blocked | Quotation validation failed |
| 1 | Contested | Any other applicable signal failed |
| 2 | Needs judgment | An open question, an unresolved contradiction, or re-runs that differ |
| 3 | Incomplete | Nothing failed, but at least one applicable check was not assessed; each is named beside the level, for example "incomplete: panel not run; support not judged" |
| 4 | All checks passed | Every applicable signal was assessed and passed |

**Calibration is shown separately,** as "calibrated" or "uncalibrated" beside the level: calibrated only when this kind of proposal has its own evaluation and met its pre-stated thresholds. Agreement between runs or models never raises a level and never calibrates anything; differing re-runs can only lower a level; Qwen's objections never move it.

**Task-specific evaluation** [PROPOSED]. The held-out legal set of TRUST §3 calibrates only the verification pipeline and rule drafts. Each other kind of proposal needs its own evaluation before it can be calibrated:

| Proposal | Evaluated against | Measured per class |
|---|---|---|
| Rule drafts and verification | The held-out legal set (TRUST §3) | Missed obligations, unsupported claims, misleading quotations, exceptions, amendment effects, abstention |
| Extraction candidates | Hand-labelled company documents | Correct, wrong and missed values, per fact type |
| Change triage | Past changes with known dispositions | Material changes missed; noise wrongly raised |
| Discovery | Instruments the feeds announced in the past | Relevant instruments missed; irrelevant ones proposed |
| Case proposals | Resolved cases with reference answers | Correct, wrong, abstained |

Each set is written before any model output for it is seen, kept away from prompts and tuning, scored per class and never folded into one number (TRUST §3.2–§3.3). TRUST gives the legal set's reference judgements to a named expert; who writes them now is people decision P4. AI rule drafting goes live only after its drafts meet the legal set's thresholds, stated in advance (E8, rule 4). A cheaper path (a Qwen pre-pass, fewer prosecutors, a cheaper model) replaces a baseline only after it shows non-inferiority on that task's set (TRUST §3.4).

**What customers see.** One form only, as the UX brief specifies for extraction review (UX phase 1): on each candidate fact they confirm, the page, the passage and how exactly the value matched. Never a level on a result or in an export.

**What step 4 must still define** before any of this becomes a rule: the exact check behind each state; how substantive support is judged and recorded, apart from quotation validation; the approval prerequisites for each kind of proposal; each evaluation's set, size, authors and thresholds; and the final level names.

### C7. The admin dashboard

[U23: "dashboard should be nice and sophisticated. it should have all the imporatnt inforamtion for the admin"; ORIGINAL: UX §10 incident and latency view; APPROVED: BRIEF §2 operations]

| Region | Shows |
|---|---|
| Needs you | Changes to review, drafts to approve, verdicts to dispose of, cases to adjudicate, publications waiting, each with its age |
| Monitoring health | Every source by state (current, failing, stale, never checked); last successful scan per package; coverage gaps; local worker online or offline |
| Change pipeline | Detected → drafted → approved → published, with ages, and the change-to-briefing service level |
| Publications | Scheduled and past publications, with their impact and reassessment progress |
| Customers | Companies, users, new registrations, companies awaiting reassessment, notification delivery failures |
| AI work | Runs by agent, failures, spend against budget, local jobs waiting |
| Content status | Per pack: the four dimensions for every requirement; country packs |
| Audit | The latest privileged actions |

Design: Seismograph / Oxide [DS], calm by default; orange only for change events and deadlines; "you are current" in neutral ink [ADM-1 to ADM-3].

### C8. The agents and automated jobs

[U23; ORIGINAL: P2, UX §10; APPROVED: BRIEF §4, PROP §4. The "Runs on" column is PROVISIONAL until choices 7 and 8 are settled.]

| ID | Agent or job | Starts it | Evidence it uses | What it produces | Human gate | Runs on | Board |
|---|---|---|---|---|---|---|---|
| AG-1 | Source watcher (deterministic) | Schedule; "Scan now" | The register | Observations, change events, failures | A person disposes of each event | Hosted worker | SCN-1–SCN-6 |
| AG-2 | Discovery | Daily; "Scan now" | Official announcement feeds; the register | Proposed new instruments and replacement sources, with confidence | A person accepts it into the register | A deterministic filter (subject codes, citations of watched acts) shortlists and logs what it sets aside; on your MacBook, Opus 5.5 (subscription) assesses the shortlist; Qwen summarises it, and may take over after its evaluation (D2); nothing is dropped | SRC-6, SRC-7 |
| AG-3 | Change triage | Each change event | Both versions of the text; requirement map | Suggested disposition, summary, requirements touched, confidence | A person disposes | On your MacBook: Opus 5.5 (subscription) proposes; Qwen indexes the changed provisions, and may give first-pass triage after its evaluation (D2); it never closes an event | RUL-1, ADJ-1 |
| AG-4 | Rule drafter | You mark an event material, or ask | The fenced, hash-pinned official text | Draft pack revision, interpretation note, evidence, confidence | A person approves | Opus 5.5 (subscription), on your MacBook | RUL-2, RUL-11 |
| AG-5 | Verification panel: reader, 7 prosecutors, adjudicator | You, per requirement version | The pinned corpus closure | A dossier of verdicts | A person signs; the gate refuses MISMATCH and OPEN_QUESTION | Opus 5.5 (subscription), on your MacBook: the existing pipeline, the legal agent. Qwen only as a labelled extra objection list | RUL-4, ADJ-3 |
| AG-6 | Simulator (deterministic) | Every draft | Golden profiles; saved company profiles | Expected and unexpected changes; companies and periods reached | Input to your approval | Hosted | RUL-5 |
| AG-7 | Reassessment (deterministic) | A publication; a fact change | The published pack; profiles | New runs and their differences | None (derived) | Hosted worker, per company | RC-3, RC-6 |
| AG-8 | Notifier (deterministic) | Differences; weekly | Runs, differences, coverage | Emails and in-app notices; an all-clear only when derived | Templates approved once | Hosted | RC-5, CHG-3, NTF-1–NTF-3 |
| AG-9 | Briefing writer | Weekly; after a publication | Computed differences only | Plain-English briefing text | The facts are computed; the prose is labelled | Qwen on your MacBook, with the company's AI setting; the template-only briefing if its figure check fails (D2) | CHG-1 |
| AG-10 | Document extraction | An upload; the yearly reminder | The customer's document | Candidate facts with page and passage | The customer confirms | Qwen on your MacBook after its evaluation, with the company's AI setting; Opus 5.5 only if the company allows third-party AI processing (D2, D4) | PRF-4, PRF-8, AI-3 |
| AG-11 | Question compiler (deterministic) | Every run | Unresolved facts and their weight | The next questions | The customer answers | Hosted | PRF-6, RC-4 |
| AG-12 | Case assistant (suggested) | A judgment case | The case's facts, rule and sources | A proposed resolution, with evidence and confidence | A person reviews it; a proposed fact goes to the customer to confirm; a rule question opens a draft | Opus 5.5 (subscription) on your MacBook, only if the company allows third-party AI processing | ADJ-6 |
| AG-13 | Ask DataStrata | A user's question | The record only | A cited answer, saved as composed assistance | It never adds to the record | Qwen on your MacBook after its evaluation; Opus 5.5 for hard questions if the company allows; with the company's AI setting | ASK-1 |
| AG-14 | Newsletter drafter (suggested) | Monthly | Published changes only (public) | A draft newsletter | A person approves each issue | Qwen: a new use beyond the three QWEN permits, so it needs your approval | NTF-4 |

Every paid run starts within a recorded approval (law 23): a standing approval with a budget for AG-2, AG-3, AG-4, AG-9, AG-10, AG-12 and AG-13, and an approval for each run of AG-5. Standing approvals for Opus 5.5 agents wait for the subscription check (D4); until then a person starts each Opus run. AG-8's messages run under standing permissions, one per message template, once the operating approval is given. Every AI run happens on your MacBook (your decision of 2026-10-23): the hosted app queues the job, the worker on your MacBook pulls it, runs Opus 5.5 through your subscription or Qwen locally, and returns the result. When your MacBook is off, AI work waits and overdue work alerts a person; nothing is guessed (law 22).

---

## Part D. Foundation and platform

### D1. What exists for scanning and checking with Opus 5.5

[R3, from the checkpoints and the code; key figures re-checked against AUDIT and the checkpoint index]

**What has really run.** One AI workflow: the verification pipeline. A blind reader, seven lens prosecutors and an adjudicator, then a deterministic tail, on `claude-opus-5-5` through a pinned Claude Code CLI (2.1.295) on your Max subscription. You started each run by hand from a hash-bound package kept outside the repository.

- Eight executions, 2026-10-17 to 2026-10-19: two synthetic probes, one synthetic rehearsal and five captures of CSRD-S-002 (r1 to r5).
- Only r5 produced a complete, evidence-valid dossier: 2 CONFIRMED, 7 MISMATCH, 3 OPEN_QUESTION, all 39 evidence sets passing. It is for S-002 version 4; S-002 is now version 5.
- Cost: the five captures came to USD 41.98 at list price (USD 45.21 with the probes and the rehearsal). Billing was never proven. One full capture costs about USD 11, takes 9 to 10 minutes and uses 10 to 15 percent of a five-hour window.

**What has never run:** the API route (`verify run`, which also names `claude-opus-5` rather than `claude-opus-5-5`); signing, revocation and promotion (no promotion writer exists); the signature ledger; the held-out evaluation; the source-discovery command and the watch automation; scanning beyond the four documents ingested by hand in August; any Qwen work inside DataStrata.

**What carries forward**

| Need | Reuse as it is | Adapt | Missing |
|---|---|---|---|
| (a) Per-package scans | The tiered register and its citation firewall; the origin allowlist; deterministic hashing that separates "reissued" from "text changed"; staleness derivation; the written scanning rules (quote every finding; an unreachable source is not silence; page text is evidence) | Ingest: land the designed hardening (timeouts, size caps, no cross-host redirects, authority checked before the fetch, storage by hash); operating fields for the register; the sweep and watch prompts turned into schema-checked roles | Observations and events, a scheduler, "Scan now", the review workbench, PDF parsing |
| (b) The regulation checker | `assess()`; next-question ranking; the fact model (confirmed, source, as-of date, review date); pending-law watch items; each source's affected requirements | Persistence and history; the re-run loop | Accounts, tenancy, deltas between runs, notifications |
| (c) AI drafting for approval | The verification pipeline as the check on any draft; the condition renderer; the version registry; golden profiles; the dispositions vocabulary; r5 to E, where one supported MISMATCH became a reviewed change by hand | The policy (choice 1b) | A drafting role and schema, a pack-revision digest, the impact preview, the workbench, publication |
| (d) Adjudication | Tier and corroboration rules; the `confirmed` trust boundary; verdicts with evidence, trust tiers, review sheet, sign, revoke and ledger | Review cases; machine-readable dispositions | Finding records, extraction, a disposition field, promotion criteria, the workbench and audit |

**The gaps that matter most**

1. **Correctness has never been measured.** There is no held-out set and no promotion, so no calibrated confidence (level 4 is unavailable) and no signature.
2. **The engine cannot record your decision on a verdict.** Dispositions are prose; the sign gate has no disposition field; r5 cannot be signed as filed, and four of its verdicts came from catalogue contents the roles cannot see.
3. **There is no runtime for product agents.** The harness is a test-tree tool fixed to S-002 and launched by an operator; there is no job runner, scheduler or persistence.
4. **Scanning is not built.**
5. **Some requirements may not fit the 190,000-token request ceiling** (an estimate, unverified): S-012's main source is about 290,000 tokens, and the timing requirements' closures about 178,000 before any reading. Using retrieval instead of the full text is an efficiency change that needs the held-out evaluation first.
6. **Approval has been procedural.** r4 ran before your approval was recorded. Product agent runs must refuse to start until your approval is recorded in the app (AI-9).

**What verifying the CSRD pack would cost.** If every requirement's sources were the size of S-002's, verifying all 23 once would cost about USD 255 to 262 at list price. Larger sources cost more, and some may not fit at all (gap 5).

### D2. Opus 5.5 and Qwen: what exists, the allocation, and the assessment

- **In the repository:** Qwen is design only (QWEN, 2026-09-25). No Qwen or Ollama code exists.
- **On your MacBook** (read-only check, 2026-10-23): Ollama 0.40.7 is installed and running; `qwen3.8:27b-q8_0` still matches its pin; `qwen3.6:27b` changed on 2026-10-22 (E7).
- **History** [R3, from the conversation archive]. On 2026-10-21/22 a Codex session connected `qwen3.6:27b` (27.3B, Q4_K_M, 32,768-token context) to Claude Desktop through Ollama's Anthropic-format gateway on `127.0.0.1:11435`. One test answer came back, and Claude Desktop labelled the model "Sonnet 5": a reported model name proves nothing, which is why QWEN pins by hashing files. Ollama's cloud was off. Nothing reached DataStrata. The session left settings behind in Claude Desktop (a gateway profile and a `deploymentMode` entry); whether they persist is unverified. Check them, by reading files, before the next Opus capture, whose gate requires a first-party provider.
- **What QWEN permits** [QWEN §1]: extracting candidate locators, terms, dates and thresholds with their spans; indexing documents; adding objections in a separate, labelled list. **Never:** suppressing or down-ranking source text, filling or replacing a verification role, counting as evidence by agreeing, or leaving the machine. Any further use needs its own approval.

**The allocation (your decision, 2026-10-23).** AI work runs on your MacBook. Opus 5.5, through your personal subscription, does the exploratory and judgment-heavy work, including the legal agent. Qwen runs locally for repeated tasks that do not need Opus. Plain code does everything that needs no model.

**Your local-Qwen objective, assessed task by task** [PROPOSED; volumes and speeds are estimates]

| Repeated task | How often | Suits Qwen? | Quality bar before Qwen does it | Escalation | Data handled | Cost note |
|---|---|---|---|---|---|---|
| Index changed provisions, old against new | Each change event | Yes, now (a permitted use) | Every span it cites is found again in the text, by a deterministic check | Span not found: re-run, then Opus | Public law | Small; saves an Opus call per event |
| Candidate locators, terms, dates and thresholds for reviewers | Each new source text | Yes, now (permitted) | As above | As above | Public law | Small |
| Extra objections beside the prosecutors | Each verification run | Yes, now (permitted, as a separate list) | Measured as its own arm on the legal set (QWEN §5) | None: advisory only | Public law | Adds MacBook time, not tokens |
| Briefing prose from computed differences | Weekly, per company | Yes, once its figure check exists | A deterministic check matches every figure, date and requirement named in the prose against the computed differences | Check fails: send the template-only briefing | Company results, derived | About a minute per briefing at roughly 10 tokens a second; runs overnight |
| Newsletter drafts | Monthly | Yes, if you approve this new use | A person approves each issue (law 23) | None | Published changes only | Negligible |
| Candidate facts from company documents | Each upload; yearly refresh | Yes, after the extraction evaluation (CNF-7) | Precision and recall per fact type on hand-labelled reports meet pre-stated thresholds; every passage is found again on its page | Failed check or a missed value: Opus 5.5 if the company allows third-party AI processing; otherwise the customer enters the fact | Company documents, kept on your MacBook (D4) | Long documents read in chunks: slow, but no tokens |
| First-pass change triage | Each change event | After the triage evaluation | No material change missed on past changes with known dispositions (non-inferiority, TRUST §3.4) | Anything Qwen calls material, relevant or unclear goes to Opus; a person still disposes of every event | Public law | The largest token saving, once proven |
| Summaries of shortlisted acts for discovery | Daily | After the discovery evaluation | No relevant instrument missed on past feeds | Flagged or unclear items to Opus; nothing is dropped | Public law | High volume, so a real saving |
| Draft answers for Ask DataStrata | Each question | After its own evaluation | Every citation resolves to a record object that supports it | Failed check or a hard question: Opus 5.5 if the company allows | The company's record | Moderate |
| The verification roles: reader, prosecutors, adjudicator | Per requirement version | No | QWEN forbids it; the legal agent stays on Opus 5.5 | — | Public law | About USD 11 a run at list price, drawn from your subscription's usage windows |
| Rule drafting, discovery assessment, analysis of legal cases | Rare and judgment-heavy | No | — | — | Public law; case analysis touches company data | Opus 5.5 |

**Operating cost, in plain terms.** Opus 5.5 costs no per-token money on your subscription but draws on its usage windows: one full verification run used 10 to 15 percent of a five-hour window (R3). Qwen costs no tokens, only your MacBook's time: slow for long text (about 10 tokens a second on the Q8 model), fine for short outputs. Code costs nothing per run. The saving comes from moving each repeated task down that ladder, from Opus to Qwen to code, only after it passes its evaluation.

**Escalation, in general** [PROPOSED]: a task moves up from Qwen to Opus 5.5, or to a person, when its deterministic check fails, its output is invalid or a sample audit finds an error. Company data moves up to Opus 5.5 only with the company's permission for third-party AI processing (law 20).

**When your MacBook is off** [PROPOSED]: every AI job, Opus and Qwen alike, waits in the queue; nothing runs elsewhere and nothing is guessed (law 22). A job still waiting past its deadline alerts a person, on the admin dashboard and by email.

- **Before any Qwen run:** take the pins again, switch auto-update off, keep cloud off, make sure no other client shares the server, and file each run beside, never inside, an authoritative record [QWEN §3–§4].
- **Once hosted:** the hosted app queues AI jobs and the worker on your MacBook pulls them (D5). When your MacBook is off, AI work waits, and overdue work alerts a person.

### D3. Where rule and source updates live

[U23: "rule updates should live where it makes sense the most"; APPROVED: PROP §4 and §10 ("signed, committed, deployed"), PROP §4 (the register is the authority, in git), STB (the deployed revision is the invalidation boundary); PROPOSED, choice 6]

**Recommendation: the pack and the source register stay in git; the admin app runs the workflow.**

- Drafts, review, the confidence level, simulation, approval and source edits happen in the admin app and are stored in its database.
- On approval, the app prepares the change to the repository's knowledge or register files, with the legal justification the engine's content procedure requires (LAWS).
- Publication then follows C3's three records: the publisher authorises it in the app; a local command pulls the change; you commit and push; the tests, golden profiles and digest check run; and only a successful, matching deploy activates it and starts reassessment [PROPOSED].
- Operating state (last attempt, last success, error class) lives in the database, as PROP §4 already says.

**Why.** The pack's integrity checks, golden profiles, Codex's review, the status-truth boundary and the fetch allowlist all work on files in git today, and the accepted proposal keeps publication "signed, committed, deployed". An in-app store would mean rebuilding all of that, and changing the cache rule before it ships (STB). The cost of git is a deploy per publication or source change (minutes) and your commit; at CSRD's pace of change that is acceptable. Revisit when publications become frequent.

### D4. Data protection and residency

[APPROVED where cited; your decision of 2026-10-23 on where AI runs; PROPOSED and PROVISIONAL where marked]

- Company data (profiles, documents, results, cases) is stored in the EU-hosted database and storage [APPROVED: PROP §6.7, residency items provisional].
- The scanning worker never reads company data [APPROVED: PROP §4].
- **Your decision:** AI work runs on your MacBook: Opus 5.5 through your personal subscription, and Qwen locally (D2).
- AI processes a company's data only when the company has switched it on [APPROVED: PROP §6.7]. By default that processing is local, by Qwen on your MacBook: **no third-party AI processing**, meaning no AI model outside DataStrata's own machine sees the data. The hosting providers that store it remain processors, listed in PRV-3. It goes to Opus 5.5, and so to Anthropic, only if the company's setting also allows third-party AI processing [PROPOSED].
- **Handling on your MacBook** [PROPOSED]: an encrypted disk; a dedicated macOS user for the worker; no cloud sync of job data; job data deleted once its result is returned; a job log that holds no content [PRV-4].
- **To verify before any unattended workflow runs on your subscription** [unverified]: whether its terms suit automated work done for customers, for every unattended job, including public-law jobs such as scheduled triage, discovery and drafting; and, before company data reaches Opus 5.5, its data-retention and model-training settings. Until verified, Opus 5.5 runs only when a person starts it; Qwen and plain code are unaffected. Subscription-first Opus 5.5 and local Qwen stay the allocation.
- **Location** [PROVISIONAL; for legal review]: if your MacBook is outside the EU, processing EU customers' personal data on it is a transfer outside the EU, to be covered by the privacy notice and the agreements.
- A retention and erasure policy is needed before any personal data is stored: checker answers, email addresses, registrations, newsletter consents. The append-only audit trail and immutable runs must be reconciled with erasure requests, for example by keeping the record and removing personal identifiers [PRV-1; legal requirements not yet verified; not legal advice].

### D5. The platform (PROVISIONAL; not approved until the conditions below are demonstrated)

[R4, researched 2026-10-23 on vendor and authority pages. Brevo's and GoDaddy's own pages refused the research fetcher, so their entries are leads to re-check, not facts. Not legal advice.]

**Recommended topology, for you and your co-founder to decide** (choice 8):

| Layer | Provisional choice | Note |
|---|---|---|
| Web and API | Vercel Pro, functions pinned to Frankfurt (`fra1`) | The native Next.js host; 800-second function limit; per-minute cron |
| Database | Neon Postgres in Frankfurt; the app connects as a role without row-level-security bypass | Supabase Pro is the alternative, with a region-directed agreement |
| Scheduled jobs | Vercel Cron calling one thin route that starts a workflow | Best-effort delivery, so every job is idempotent and catches up since its last success |
| Long jobs and agent runs | Vercel Workflow, one step per document, company or agent iteration; a Postgres jobs table as the source of truth | No server to run; a Frankfurt worker (Render or Fly) only if a step outgrows the limit |
| Files | Vercel Blob, private store in Frankfurt | |
| AI worker | Your MacBook pulls every AI job, for Opus 5.5 through your subscription and for Qwen: outbound HTTPS only, a scoped and revocable token in the Keychain, no inbound ports | Jobs carry deadlines; an overdue job alerts a person; the dashboard shows when the worker was last seen |
| Email | Brevo (EU) for transactional mail and the newsletter, with double opt-in; consent evidence also kept in DataStrata's own database. Fallback: Amazon SES in Frankfurt, with our own double opt-in | Send from a mail subdomain; start DMARC at `p=none` |
| DNS | Stay at GoDaddy: an apex A record and a `www` CNAME to the values Vercel shows; Cloudflare DNS later if wanted | Never GoDaddy's domain forwarding: it locks the apex record |

**Estimated cost:** about USD 45 to 70 a month (range 25 to 100), excluding the domain.

**What it changes in the accepted architecture** (PROP §6):
- pg-boss in a separate worker process becomes Vercel Workflow plus a Postgres jobs table.
- The S3 client on the dependency allowlist becomes Vercel Blob's SDK, unless an S3-compatible store is kept.
- The container-image gate does not apply on Vercel; the clean-checkout and isolation checks still do.
- PROP §6.7's provisional Fly.io default gives way to Vercel.
- The pilot gate's in-memory limiter needs a single instance; it retires with accounts, and hosted limits move into Postgres (AUTH).
- PROP §6.4's database roles survive only if the deployment keeps each role's credentials out of reach of the other functions. Choosing a different connection in code is not enough: the scanning function must run where company-data credentials are not present at all, for example as a separately deployed project with its own secrets.
- Everything a workflow records (its inputs, step results, errors, hooks, logs and metadata) must carry identifiers only, never company data. Vercel keeps these records, not all of them pinned to a region, and their regional behaviour depends on configuration and SDK version [R4; CODEX, citing Vercel's workflow retention documentation].

**Conditions before this topology can be approved** [PROPOSED]:
1. **Enforced isolation,** shown by a test run from inside the scanning runtime that finds no company-data credential and reads no company row.
2. **A complete data-flow check:** every record the platform and its providers keep (requests, logs, workflow records, backups, email events, and the jobs your MacBook receives and returns), what it contains and in which region.
3. **Row-level security** proven through the pooled connection, with the tenant set inside each transaction.
4. **Residency wording** that matches the demonstrated flows.

**Residency, honestly.** Vercel's agreement names US primary processing and globally replicated backups; Neon's contract runs through a US parent. The truthful promise is "customer data at rest is stored in EU regions; some metadata and logs may be processed by US-parent sub-processors under standard contractual clauses and the EU-US Data Privacy Framework". "EU-only" would mean EU providers (Scaleway, STACKIT, IONOS, Hetzner) and much more operations work.

**Cloudflare** is viable but riskier for this app. Next.js runs there through an adapter (OpenNext 1.x) or a beta; isolates have 128 MB and no native modules, so Argon2 must run as WASM; D1 has no row-level security, so Postgres through Hyperdrive would still be needed; EU-only execution needs the Enterprise Data Localization Suite. Its floor is cheaper: about USD 8 to 40 a month.

**Set-up steps.** The order belongs in the build plan. Only you can buy, create accounts, accept terms, enter payment details and sign agreements; I prepare the configuration, the record values, the checks and the runbooks.

| Step | Yours | Mine |
|---|---|---|
| Domain | Buy it at GoDaddy; turn on two-factor authentication | Say which records to add and check them with `dig` |
| Vercel | Create the team, upgrade to Pro, accept the terms and the DPA, set spend limits | Configure the project for Frankfurt; environments; secrets list |
| Neon | Create the account (or the Vercel integration), choose Frankfurt, accept the DPA | Roles without bypass, migrations, row-level-security tests through the pooled connection |
| Brevo or SES | Create the account, accept the terms, file the DPA, pass validation | The SPF, DKIM and DMARC records on a mail subdomain; the double opt-in flow; the consent ledger |
| DNS at GoDaddy | Enter the records | The exact values and a rollback note (lower the TTL first; remove parking records and any AAAA) |
| Your Mac | Approve the worker and its token; decide the sleep policy | The worker and its pins |
| Legal | Commission German counsel: the consent text, the privacy notice, the sub-processor list, and whether the weekly briefing is a service message or advertising | Draft the texts for counsel |
| Residency promise | Decide "stored in EU regions" or "EU-only" | Word the privacy page to match |

---

## Part E. Tracks, boundaries, choices

### E1. The three tracks, kept separate

| Track | What "complete" means | Where it stands (2026-10-22) |
|---|---|---|
| **Software completeness** | Every board item retained for the complete product is Built, with its end-to-end acceptance shown | The engine and a stateless public check are built; a read-only Home sits behind a shared passphrase; truthful status and gate hardening are built; almost every customer, staff and operating workflow is unbuilt |
| **Regulatory content** | The launch scope's requirements meet the content bar you choose (choice 4); the national-law pack for the launch country is ratified | 0 of 23 requirements verified or ratified; no country pack; no promoted pipeline; one evidence-valid dossier (S-002, version 4, superseded) |
| **Deployment readiness** | Hosted, backed up, monitored, with legal pages, an independent authentication review and your approval for public exposure | No hosting; container never built; no CI run recorded; local screen-share only |

Passing tests establish none of the three on their own.

The delivery phases of E8 order the software and deployment tracks, so that each phase ends integrated and deployed. The content track runs alongside them and joins the product in delivery phase 7. [PROPOSED, version 1.1; U23-P]

### E2. Already settled

From your direction of 2026-10-23 and earlier approvals:

- CSRD first, with the wider destination preserved: every agreed capability is committed for phased delivery, none conditional on customer demand unless you approve it.
- Two people run DataStrata's staff side; separate admin and customer logins.
- The legal agent carries the most weight; the two people approve on the evidence, looking hardest where confidence is lower; two people are not professional legal expertise.
- Adjudication covers all three kinds of unconfirmed item.
- A per-company regulation checker that keeps answers and watches for new law.
- Regular source watching, admin-managed sources and "Scan now" per package.
- AI drafts rule changes with evidence and a confidence level for a person to approve.
- Affected customers are emailed and notified on the site.
- The free checker is optional; its full result is gated by an email that leads to registration; visitors can also register directly, with guided onboarding; newsletter sign-up is offered.
- Document extraction, the Universe Map and yearly refresh reminders are restored.
- Every engine output gets a place in the interface.
- AI runs on your MacBook: Opus 5.5 through your personal subscription for exploratory and judgment work, including the legal agent, and Qwen locally for repeated tasks, within QWEN's limits (D2).
- The confidence level is a required deliverable; its design stays provisional until step 4 (C6).
- A GoDaddy domain; hosting on Vercel or Cloudflare is your direction, with the exact set-up still open (choice 8).
- This vision is the reference; new features enter the board first.
- One application; the engine is wrapped, never changed; the SAP profile stays outside the repository and fixtures are synthetic [APPROVED: PROP, 2026-10-20].

### E3. Boundaries still in force

The vision plans features that need each of these. None is lifted by this document; each will be asked for explicitly when its phase arrives.

- Revision 2's acceptance did not authorise public deployment, live customer communications, paid services, legal signing, promotion or regulatory capture. Each needs your separate approval [APPROVED: your acceptance of 2026-10-20; PROP §6.10, §7]. Under law 23, live communication would start with the operating approval, given by the authority P2 names, and then run under the standing permissions granted [PROPOSED].
- Your instruction of 2026-10-19: "No capture package or cycle, no live run, no promotion, no signing, no publishing." No later lifting has been found.
- The access gate is approved for a local screen-share only. Public exposure is not approved [CPR].
- You run every `git add`, commit and push; Codex reviews; no one else commits [APPROVED].

### E4. Constraints the build plan inherits

1. The judgment workflow, with a visual admin interface and a customer-visible outcome, comes right after the foundations and is not displaced by them [APPROVED: CORR §7; PROP §0, §7].
2. Publication checks the full approved-content identity, rule content and verification state as C3 lists them, not only the pack directory [PROPOSED, from Codex's requested corrections].
3. Impact previews and reassessment include prior periods [PROP §11; CODEX].
4. Publisher authorisation stays distinct from verification signatures [PROPOSED, from Codex's requested corrections; consistent with PROP §4].
5. Fixtures are synthetic and independent of SAP. PROP §8's increment 1d comparison against "the SAP-shaped synthetic fixture" is replaced, and isolation tests use a second synthetic tenant [PROPOSED, from Codex's requested corrections; PROP §1.3 keeps SAP outside the repository].
6. One application with role-gated areas; the engine is wrapped, never changed; its seven-hit rule, purity and dependency limits hold [APPROVED: PROP §2, §6.8, §6.9; repository `CLAUDE.md`].
7. Plans specify behaviour, not reference code; every task carries a teeth check; a baseline is the previous task's finishing count [`CLAUDE.md`; `TEST-EVIDENCE-STANDARD.md`].
8. Code runs only in a clean clone with its own dependencies, never through the candidate's linked `node_modules`.
9. The UX brief's acceptance criteria (UX §17) become end-to-end product tests (EXP-12).
10. The data design leaves room for later-phase items, such as suppliers as records and voluntary programs as requirements, so they arrive without a redesign (GTD-1, GTD-12).
11. **Every delivery phase ends integrated and deployed** on the hosted environment, with its end-to-end acceptance passing against that environment, never against a local build only (E8). [PROPOSED, version 1.1; U23-P]

### E5. The choices, as settled

Choices 1 to 7 are settled: 2, 3, 5 and 7 by your direction of 2026-10-23, and 1, 4 and 6 as recommended, by your approval of version 1. Choice 8 stays provisional until D5's conditions are demonstrated.

#### Choice 1. What approval covers, and the AI law

Your words: "AI must decide what applies initially and the ratifier confirms it."

- **1a. Recommended (A): approve shared rules, not every assessment.**
  - AI's "initial decision" is a drafted rule (who it applies to, in the condition language) plus the engine's simulation of which saved companies and periods it would reach. You see both, with the evidence, the approval prerequisites and, once C6 is settled, the confidence level, and you approve.
  - Once you approve and publish, the engine applies the rule to every company automatically, from their confirmed facts.
  - Company-specific exceptions (a disputed fact, an interpretation, a national-law question) come to adjudication queue 2 and are resolved through facts or rules.
  - Law 2 is rewritten as in A5.
  - *Why:* it keeps the accepted rule that decisions route through facts and rules (PROP §3.3), lets the regulation checker run unattended, and puts your attention where judgment is needed.
- **(B) Approve every company's assessment** before the company sees it. Every registration, fact change and publication would wait for you: with 50 companies, two periods each and one material change, that is a hundred approvals for one change. It also contradicts PROP §3.3.
- **(C) Show AI's assessment to customers as "preliminary (AI)"** before approval. Not recommended: it breaks laws 2 and 21, and a customer could act on an unapproved reading.
- **1b. Three August rules from the verification factory (FAC).**
  - "No AI writing into a knowledge pack. Ever." **Recommended: keep.** The app writes content you approved; the AI never writes into the pack.
  - "No agent-proposed encoding fixes" (a MISMATCH produces a finding, not a diff; "revisitable once measured metrics justify it"). **Recommended: lift it for drafts.** An AI-drafted fix goes through the same approval, confidence level and simulation as any change and is never applied by itself. *Alternative:* keep it until the held-out evaluation exists.
  - "No scheduled runs" of verification agents. **Recommended: keep** until the held-out evaluation exists. Scheduled fetching is deterministic and unaffected; drafting starts when you mark an event material.
  - "No scheduled automation; on command only until the output is trusted" (ACC), for the AI sweep that watches and classifies sources. **Recommended: lift it for proposals.** AI triage of each change and AI assessment of discovered instruments run on their own, within a standing approval and budget, because every output is only a proposal you dispose of. The verification panel stays on command. *Alternative:* keep both on command until their evaluation tests (AI-8) show the output can be trusted.
  - **The sign gate has no override.** It refuses every MISMATCH and OPEN_QUESTION, and nothing records your disagreement with a verdict. **Recommended: keep the refusal.** Record each disposition in a machine-readable form (it also feeds the held-out evaluation), and clear a disputed verdict by amending the rule or by re-running with the missing text shown to the roles. *Alternative:* a recorded human override at the gate. It would weaken an approved gate, and Codex asked that real gates not be weakened.

#### Choice 2. People: two people, mapped to the acts

**Settled by you (2026-10-23):** there will be two people; the existing agent workflows continue; the legal agent carries the most weight; the two people approve on the evidence presented, looking hardest where confidence is lower; and two people do not establish professional legal expertise. C1 maps each person's acts separately from the AI roles.

What follows from two people [PROPOSED]:
- **Two-person publication** becomes possible: nobody publishes a revision they approved (C1).
- **Account recovery** follows PROP §6.3 as written: each person can recover the other through the recorded two-person procedure. Each also has hashed one-time recovery codes, kept offline. If both are locked out at once, a sealed break-glass procedure runs through a recovery-only database role that can reset two-factor enrolment and nothing else; it cannot read company data, is audited, and notifies both of you out of band (who holds it: people decision P5).
- **The weekly digest:** each person receives the other's privileged acts.
- **Controls carried over:** typed confirmation for a change reaching 10 or more companies or any closed period; publication refused without a passing simulation and an impact preview that includes prior periods; supersede by a new publication (RUL-10); the quarterly staff review done by each of you for the other.
- **Without a professional legal expert:** nothing is ratified, so national-law conclusions stay "requires review" (law 6) and nothing is "Supported" under PROP's release policy, which needs a ratified national-law pack (choice 4); and the legal evaluation's reference judgements need an author (C6). These are people decisions P3 and P4.
- *Assumptions:* each person's recovery codes and the break-glass credentials are stored apart from their staff accounts. If an attacker takes both people's accounts and the break-glass, the admin side is lost.

The decisions about people that remain are in E6 and in the session's reply.

#### Choice 3. Entry and registration

- **Settled by you (2026-10-23):** the free checker is optional; visitors can also register directly, with guided onboarding (B2, phase 0).
- **Recommended for the checker path:**
  1. Show the headline answer on screen at once (answer-first, "never start empty").
  2. The full cited result, and saving it, need an email address. The email carries a link, not the result.
  3. The link opens the saved result and can be reused for 7 days. Using it proves the visitor owns the address.
  4. From the link the visitor registers and gets their own workspace, seeded with the checker answers as a preliminary profile. Registering ends the link.
  5. If the address already has an account, the link asks them to sign in, then offers to add the result to their workspace as a new preliminary assessment.
- **On both paths:** newsletter consent is a separate, unticked choice, confirmed by a second email; staff accounts are never self-registered; paid features stay switched on by you until billing exists.
- **What it changes.**
  - PROP plans invitation-only onboarding ("no self-serve signup") and self-serve "not before Stage 5".
  - P1 said to keep the free checker "fully ungated"; the Polaris plans captured an email. Showing the headline without an email keeps the spirit of P1.
  - The authentication note names self-serve sign-up and magic links as conditions that re-open the custom-versus-library choice. **Recommended:** re-run that short comparison with this journey in scope before accounts are built (ACC-10).
- **What it needs first.** A retention and erasure policy for checker answers, emails, registrations and consents (PRV-1); legal pages (PUB-4); an email provider (choice 8); and the operating approval before the first live email (law 23).
- **Two-factor codes for customer owners.** PROP §6.1 makes them mandatory for tenant owners. **Recommended:** require them before the workspace holds anything beyond the checker answers: the first new fact, upload or invitation, which on the direct path means at the start of onboarding. The server refuses those first actions until two-factor is set up. *Assumption:* checker answers alone are not sensitive. *Alternative:* at registration, as PROP says.

#### Choice 4. The content bar: what must be true of the rules before customers rely on them

Today 0 of 23 requirements are verified or ratified. Signing is unreachable (no promoted pipeline; the one dossier is unsignable as filed) and frozen by your instruction of 2026-10-19.

- **Recommended (A): follow the accepted release policy** (PROP §1.2). For each release it names:
  - the supported scenario (for example "an EU-incorporated undertaking, standalone or parent, governed by German law, financial years 2025 to 2027");
  - the requirements that scenario depends on, including everything they refer to and the obligations they trigger;
  - **verified** encoding for every one of them: an agent dossier passed the gate on the current version and one of you signed it (ACC: "caveat, but usable");
  - **ratified** where the policy says so. I suggest at least wherever approval needed an answer to an open question [PROPOSED addition];
  - the ratified national-law pack the scenario needs (for example the German pack);
  - **monitored:** every source each requirement cites, and every register surface affecting it, checked successfully within its cadence;
  - a scenario coverage review.

  Paying customers rely only on what this makes "Supported". Everything else shows "Draft · evaluation only" and serves the free checker and evaluation pilots. PROP's launch candidate is 17 requirements (S-001 to S-006, S-012 to S-015, S-017 to S-023); the Article 40a, value-chain and transition-relief requirements stay draft at launch.

  *Cost:* the verification route must work end to end (promotion, fresh captures on current versions, dispositions), which also means lifting the 2026-10-19 freeze run by run. One verification of all 23 requirements would cost about USD 255 to 262 at list price if every requirement's sources were the size of S-002's, and more for larger ones; some may not fit the current request ceiling (D1, gap 5). *Consequence:* without a professional legal expert, nothing is "Supported", because the national-law pack must be ratified (choice 2; people decision P3).
- **(B) Lower bar:** paying customers on content you approved but have not verified, labelled draft. Faster; an encoding error reaching a paying customer would rest on your approval alone.
- **(C) Higher bar:** every launch requirement both verified and ratified by a named expert. The cleanest; it needs a qualified expert's time for every requirement.
- **Related:** moving the public checker to verified content only is "a separate product decision" (STB). **Recommended:** keep it on draft content, labelled, until enough requirements are verified; restricting it today would leave it nothing to evaluate.

#### Choice 5. Scope: CSRD first, with the wider destination committed

- **Settled by you (2026-10-23):** CSRD first, and the wider product destination preserved. Every agreed capability is committed for phased delivery; none waits on future customer demand unless you approve that change.
- **5a. Recommended:**
  - The first complete product is CSRD applicability and readiness.
  - The EY questionnaire shapes our intake research: which questions, which ranges, which documents, and how to handle "I don't know". It does not add India's or other countries' national ESG laws to the first product.
  - The regulation checker asks for new facts only when a published rule or an active workflow needs them (law 16).
  - An EY-style "all applicable ESG laws per country" scoping service stays a suggestion (GTD-10) until you approve it.
  - *Why:* EY's questionnaire scopes national environmental, labour and pension law across a client's sites, mostly outside CSRD. Asking those questions now would collect facts no active rule or workflow uses (law 16).
- **5b. The wider destination is committed, in later phases.** Supplier objects, buyer-side shared lanes, an auditor portal, the public API, MCP, integrations and SSO, managed custody, enterprise packs, passkeys, the CBAM pack and the rest of the original ecosystem follow the CSRD product, in the order the build plan sets (the board's "Later phase" rows). The original plans' stage gates and PROP's "on customer demand" for SSO and self-serve now order the work; they no longer decide whether it happens.

#### Choice 6. Where rule and source updates live

- **Recommended:** the pack and the register stay in git; the admin app runs the workflow and prepares each change; you commit; tests and deploy publish (D3).
- **Alternative:** an in-app, versioned knowledge store with publication inside the product. Faster to publish, but it means rebuilding the integrity checks, golden-profile tests, fetch allowlist and status-truth boundary inside the app, and changing the cache rule first.

#### Choice 7. Which model does what, and where company data goes

- **Settled by you (2026-10-23):** this MacBook is your project machine, so AI work runs on it: Opus 5.5 through your personal subscription (the reason the Opus 5.5 capability was built) for work that needs it, and Qwen locally for repeated tasks that do not.
- **The allocation, assessed** against your local-Qwen objective, is in D2: which repeated tasks suit Qwen now and which after their evaluation, the quality bar, escalation, data handling and cost.
- **Constraints that still hold:** Qwen never fills a verification role (law 18); deterministic work needs no model; company data is processed only with the company's AI setting and handled as D4 describes (law 20).
- **Before Qwen runs at all:** the QWEN design's preconditions must hold again. Ollama has updated itself from 0.34.2 to 0.40.7, and `qwen3.6:27b` has changed since the pins were recorded (E7).
- **To verify, not to decide:** whether your subscription suits unattended workflows done for customers, including public-law jobs, before any of them runs; and its data settings before company data reaches Opus 5.5 (D4).

#### Choice 8. Hosting and email (provisional; your co-founder decides with you)

- **Recommended (A), provisionally: Vercel Pro in Frankfurt, Neon Postgres in Frankfurt, Vercel Cron and Workflow, Vercel Blob, Brevo, DNS at GoDaddy** (D5). It stays unapproved until D5's four conditions are demonstrated.
  - The lowest-risk host for a Next.js 15.5 app, with no servers to run, at about USD 45 to 70 a month.
  - It replaces PROP's provisional defaults: the Fly.io host, the pg-boss worker process, the S3 client and the container gate. It keeps PROP's database roles only if the deployment enforces the separation, and only if every workflow record carries identifiers alone (D5). The plan records each change.
  - The residency promise becomes "customer data stored in EU regions", not "EU-only".
- **(B) Cloudflare:** Workers, Hyperdrive to Neon, R2 in the EU jurisdiction. The cheapest (about USD 8 to 40 a month), with more adapter risk and more to prove.
- **(C) PROP's own default:** Fly.io in Frankfurt with a long-running pg-boss worker, managed Postgres and object storage. Closest to the accepted architecture, more operations work, and not the Vercel or Cloudflare you named.
- **(D) EU-only providers** (Scaleway, STACKIT, IONOS, Hetzner), if customers demand no US-parent processors. The heaviest operations load.
- **Email, recommended:** Brevo for both transactional mail and the newsletter (one EU vendor with double opt-in), with every consent also recorded in DataStrata's own consent ledger. Fallback: Amazon SES in Frankfurt with our own double opt-in. PROP allows one transactional-email client; Brevo covers both streams under it.
- **Before committing:** read the Neon and Brevo agreements and sub-processor lists; confirm Frankfurt in the Vercel-to-Neon set-up; test row-level security through the pooled connection; run a week's delivery trial to Gmail, Outlook and German business mail; and have German counsel review the consent text and the privacy notice, and say whether the weekly briefing is a service message or advertising.
- **Timing** (updated in version 1.1, proposed): deployment comes first. Delivery phase 1 deploys the stateless public site and free checker, and each later phase deploys its own workflow (E8). This replaces your direction of 2026-10-22 to build the complete product locally before hosting [U23-P]. D5's four conditions apply as the phases bring what they protect:
  - the complete data-flow check from delivery phase 1;
  - row-level security through the pooled connection, and residency wording that matches the flows, from delivery phase 2, before any company data is stored;
  - the scanning runtime's enforced isolation from delivery phase 4, when scanning first runs.

### E6. Decisions that stay open (yours, not mine to recommend)

**About people** (also returned separately in the session's reply):
- **P1.** Who the second person is, and whether both of you hold every staff permission, subject to the two-person publication rule.
- **P2.** Who gives the operating approval for an environment (law 23): you alone, or both of you.
- **P3.** Whether, and when, to engage a professional legal expert to ratify: at least the launch country's national-law pack, without which national-law conclusions stay "requires review" and nothing is "Supported".
- **P4.** Who writes the reference judgements for the legal evaluation, which TRUST assigns to a named expert. It is needed before DP6 starts, because AI rule drafting goes live only after that evaluation (E8, rule 4). TRUST §3.2 names "the same authority that ratifies pack content". If you follow it, the expert of P3 is engaged before DP6, while ratification itself stays a DP7 gate.
- **P5.** Who holds the sealed break-glass for when both of you are locked out.

**Suggestions:** the eight board rows marked Suggested each need your approval before they are planned.

**Business decisions** (the software can be built without them; launch cannot):
1. The customer segment (PROP §9.3).
2. Germany first, and so which national-law pack comes first (CORR §8; PROP §9.3; law 6).
3. Pricing, plans and the billing provider (PROP §9.3; PUB-5, PLT-11).
4. Service commitments before any contract: PROP §9.2 proposes a legal-record change reviewed and briefed within five business days, and 99.5 percent monthly availability without credits.
5. The legal entity whose details go into the imprint and privacy policy (PUB-4).
6. Whether to pursue signing of the launch requirements, including promoting a pipeline identity and lifting the 2026-10-19 freeze (PROP §9.3; RUL-9; E3).
7. Sales and marketing channels (P1; P3).
8. Who the pilot audience is. Audience, access and data stay three separate decisions; accounts never follow from audience size [APPROVED: your correction of 2026-10-22].
9. Professional-indemnity insurance (DEP-9): the cover to buy. It must be in force before the first paid contract, whichever phase that contract comes in; under E8's order that is a DP7 gate [your correction of 2026-10-23].

Hosting (choice 8) is decided with your co-founder once D5's conditions are demonstrated.

### E7. Corrections to the hand-over

From Codex's review of 2026-10-22T20:37Z, each checked here, and from the research passes.

1. **"No source has ever been checked."** The register's `lastSeen: null` (13 of 13 rows) supports only "no monitoring check is recorded". Corrected in C2 and SRC-1.
2. **Qwen's state.** The hand-over called the installation "unverified". It was inspected read-only on 2026-09-24/25 and recorded in QWEN §2. A read-only check on 2026-10-23 found:
   - Ollama is installed and running, now at version 0.40.7 (QWEN recorded 0.34.2), so the runtime pin no longer holds and auto-update is evidently on;
   - `qwen3.8:27b-q8_0` is present and its manifest still matches its pin (`8f5fb6b7…6039`);
   - `qwen3.6:27b` is present but its manifest changed on 2026-10-22 (`a853c7fe…748c`; QWEN pinned `9d5803d4…bc3`);
   - no Qwen or Ollama code exists in the product or the engine;
   - one version query reached the running Ollama app (`ollama --version`); nothing was started, stopped, pulled or loaded. That query crossed the hand-over's rule against contacting running servers, read-only or not; later inspections read files only.
3. **Codex and the 1b-i foundation draft.** The hand-over says Codex had not seen it. Codex had reviewed it and requested corrections before sequencing was paused: customer judgment and evidence cases left out of "complete", publication checking only the pack directory's hash, impact previews omitting prior periods, and publisher authorisation to be kept distinct from verification signatures. This vision carries all four (E4).
4. **"Nothing reaches a customer as a determination until the ratifier confirms it."** The hand-over's example wording could be read as approving every assessment. Choice 1 settles what approval covers.
5. **"Agreement across models" as a confidence input.** Agreement is not correctness (TRUST §3.3; QWEN §1). In C6, agreement can never raise a level; disagreement and instability can only lower it.
6. **The audit's capability matrix** had no rows for supplier objects, buyer-side shared lanes, or public API and MCP access (P2c §7). They are on the board as GTD-1, GTD-2, GTD-4 and GTD-5.
7. **"Qwen for repeated tasks."** QWEN restricts Qwen to non-authoritative assistance. Repeated authoritative work (the verification roles) stays on Opus 5.5 unless a cheaper path shows non-inferiority on the held-out set (TRUST §3.4).
8. **"The ratifier" as one person confirming everything.** The accepted designs separate the user's signature ("verified", ACC) from a named expert's ratification (LAWS 8). "Words we use" maps your "ratifier" onto Approve, and keeps Sign and Ratify distinct.
9. **The audit marks AI-written briefing prose "APPROVED (PROP §4)".** PROP §4 has no such statement (R2). It is ORIGINAL (P2c §4: AI may compose from the warranted record), and now part of this vision's proposal (AG-9).
10. **Hosting was not simply "deferred to the co-founder".** PROP §6.7 recorded a provisional default (Fly.io in Frankfurt for Stages 1 to 4; hosting not needed before Stage 3's scanning) alongside the open decision. Choice 8 weighs it against Vercel and Cloudflare.
11. **The Qwen history.** The hand-over did not mention that a Codex session connected `qwen3.6:27b` to Claude Desktop on 2026-10-21/22 and may have left settings behind (D2).
12. **The audit's inventory was incomplete beyond Codex's three examples.** The original-vision research found 85 items the audit does not record: 69 original capabilities and 16 refused or replaced ideas. Every one now has a disposition on the board, including the refused ones, so none returns without a decision.
13. **Proposed behaviour was written in the present tense** in draft 1 (for example "the deploy refuses"). It is now labelled as proposed; nothing in this vision exists unless the board marks it Built.
14. **Draft 2 made later capabilities conditional on gates such as customer demand.** Corrected: every agreed capability is committed for phased delivery (choice 5b).
15. **Draft 2 routed AI on company data to a hosted API.** Replaced by your decision that AI runs on your MacBook, through your subscription and local Qwen (choice 7, D4).

### E8. Delivery phases: deployment first (PROPOSED, version 1.1)

[U23-P. Every phase's order, scope, exit criteria and gates is PROPOSED for your approval.]

This replaces the hand-over's step list, in which document stages came first and integration and deployment came last. Finishing every one of those stages would not have produced a deployed product.

Delivery phases are not the customer journey's phases of B2. They are numbered **DP0 to DP8**, here and on the board, so they never collide with the journey's phases 0 to 6 or with people decisions P1 to P5.

#### Rules for every phase

1. **Done means deployed.** A phase ends only when all four hold:
   - its release runs on the hosted environment;
   - its end-to-end acceptance passes against that environment;
   - a rollback has been rehearsed;
   - monitoring alerts reach a person.

   Local tests alone never close a phase.
2. **A complete workflow per phase.** Each phase adds a workflow a customer or a staff member can use end to end, on top of what is already live. Foundations (accounts, database, storage, jobs, email) are built inside the first phase that needs them, never as a stage of their own.
3. **One plan per phase, written at its start.** The plan specifies behaviour and carries teeth checks (`TEST-EVIDENCE-STANDARD.md`); Codex reviews it and you approve it. It replaces one build plan for everything.
4. **Designs arrive just in time.**
   - The confidence design's approval prerequisites (CNF-5) come before DP4; its signals, levels and calibration before DP6.
   - The Opus and Qwen foundation note, with the subscription check (D4), comes before DP6.
   - The legal evaluation (CNF-3) comes before AI rule drafting (RUL-2) goes live [your correction of 2026-10-23]:
     - who writes its reference judgements (people decision P4) is decided before DP6 starts;
     - the judgements are written before any drafting output for their cases is seen (TRUST §3.2);
     - AI rule drafting goes live only after its drafts meet the set's thresholds, stated in advance.

     Until then a person drafts each rule change, as in DP4.
5. **Each permission comes at its own phase.** Public exposure, real company data, automated messages, scheduled jobs, AI jobs and paid plans each start only with their own approval, at the phase that brings them (E3; law 23; D5). Approving one phase lifts nothing for a later one. The first paid contract also needs professional-indemnity insurance in force (DEP-9), whichever phase that contract comes in. Under this order paid plans arrive in DP7, so the insurance is a DP7 gate; the rest of DEP-9, SOC 2 readiness, stays in DP8 [your correction of 2026-10-23].
6. **The order is fixed; dates are not.** The timeline is hypothetical: no date is committed until a phase's plan estimates its own work.
7. **Every board row belongs to exactly one phase:** the first phase that delivers it (the phase map at the end of `VISION-BOARD.md`). Experience requirements first delivered in DP1 also apply to every later phase's screens. When an earlier phase needs one part of a row, that part is named among the earlier phase's gates and the row stays where it is (DEP-9's insurance, a DP7 gate).
8. **The content track runs alongside.** Verification and ratification can start once sources are monitored (DP4). They join the product in DP7 and never hold up DP1 to DP6. The legal evaluation (CNF-3) is not part of this track: it measures the AI, and it gates AI rule drafting in DP6 (rule 4).

#### The phases

| Phase | What goes live | Done when | Gates (your decisions) | Board rows |
|---|---|---|---|---|
| **DP0 Ready to build** | Nothing | Version 1.1 is approved; the questionnaire decisions are answered; DP1's gates are decided; DP1's plan is approved | Version 1.1; QD-1, QD-4, QD-8, QD-10, QD-12, QD-13 (the checker and the content corrections it relies on) | None |
| **DP1 Public site and free checker, live**: the first deployment | The public site and the revised free checker on DataStrata's domain. Stateless: no answers, emails or accounts are stored. Truthful content status, legal pages, monitoring | Production serves the site and the checker from the hosted environment. The checker's goldens and the public-route checks pass against it. The legal pages carry your approval. Alerts reach a person. A rollback has been rehearsed | Public exposure for this scope (E3). The host for a stateless site (choice 8, with D5's data-flow check). The domain (DEP-1, your purchase). The legal entity for the imprint (business decision 5). The legal-page texts | 31 rows, 7 already built: PUB-1, 2, 4, 5; CHK-1, 2, 3, 7; APP-1, 11; KNW-1, 5, 10; PLT-6 to 9; DEP-1 to 5 and 8; EXP-3 to 6 and 9; ACC-9; PRF-14; PRV-3 (if approved) |
| **DP2 Accounts and saved profiles, live** | Registration by email, directly or from the checker's emailed link. Customer roles and two-factor codes. The versioned company profile per financial year, with guided onboarding and document upload. Stored, explained results (the "Why?" drawer). Customer administration, export and deletion | A registered company builds its profile and sees its stored, cited results on the hosted app. A second synthetic tenant proves isolation. Row-level security works through the pooled connection. Backups restore. The independent authentication review is done | The operating approval for automated messages (P2; law 23). The retention policy (PRV-1). The email provider (choice 8). The authentication approach (ACC-10). Real company data for a pilot (business decision 8). QD-3, QD-5, QD-7 | 57 rows; the full list is in the phase map. Among them: ACC-1 to 4, 6, 8, 10; CHK-4 to 6, 8, 9; PRF-1 to 3, 5 to 7, 9 to 12, 15; APP-2 to 4, 6 to 10, 12, 13; RC-1; NTF-1; CAD-1 to 5; PLT-1, 3 to 5, 10, 13; PRV-1; DEP-6, 7 |
| **DP3 Staff area and judgment cases, live** | Staff accounts at their own sign-in address and the admin dashboard's first regions. Adjudication queue 2: a missing fact, a contested result or a judgment question becomes a case. A reviewer resolves it through a fact the customer confirms, or a recorded interpretation, and the customer sees the outcome (E4, constraint 1) | On the hosted system a case runs from opening to a customer-visible outcome, with every decision recorded | People decisions P1 (the second person and permissions) and P5 (break-glass) | 10 rows: ACC-5, 7; ADJ-2, 4, 5, 7; APP-14; ADM-1, 3; OBL-14 |
| **DP4 The regulation checker loop, live** | The source register and scheduled scanning. Change review. Rule changes drafted by a person in the approval workbench. Publication in three records. Reassessment of every affected company and period. Notifications and the weekly briefing | On the hosted system a real official change runs from detection through review, approval, authorisation by the other person, a matching deploy, reassessment and notices. A failed check writes a coverage gap and withholds the all-clear | The operating approval covering scheduled jobs. Standing permissions for each message template (law 23). The scanning runtime's isolation (D5). The approval prerequisites (CNF-5) | 52 rows, 1 already built; the full list is in the phase map. Among them: SRC-1 to 5; SCN-1 to 7; RUL-1, 3, 5 to 7, 10 to 12; RC-2 to 10; CHG-1 to 5; NTF-2 to 4; WB-1, 2, 4; ADJ-1; KNW-2, 9; PLT-2, 12 |
| **DP5 Obligations to evidence, live** | Obligations with owners, tasks, deadlines and reminders. The gap ledger and exposure. The evidence registry, with acceptance and expiry. Readiness. Dated reports. The Universe Map | On the hosted system a company moves from its results to owned obligations and tasks, accepted evidence, readiness and a dated, reproducible report. The UX brief's acceptance criteria run as end-to-end tests | Your approval of the plan; QD-6 | 27 rows: OBL-1 to 13; EVD-1 to 10, 12; APP-5; ASK-2; EXP-12 |
| **DP6 AI assistance, live** | The worker on your MacBook and the hosted job queue. Extraction of facts from reports (with the company's AI setting), change triage, AI drafting, discovery of new instruments, briefing prose and Ask DataStrata, each with its evaluation and confidence signals | Each AI job runs from the hosted queue under its standing approval, after passing its own evaluation; for AI rule drafting, that is the legal evaluation (CNF-3). Every output keeps its maker. When the worker is off, work waits and overdue work alerts a person | P4 (who writes the legal evaluation's reference judgements), decided before DP6 starts. AI rule drafting live only after it meets the legal evaluation's thresholds (CNF-3). The subscription check (D4). Each other task's evaluation (CNF-7). The Qwen preconditions (AI-4). Choice 1b's rules. The budgets | 28 rows: AI-1 to 8, 10, 11; CNF-1 to 4, 6, 7; PRF-4, 8, 13; RUL-2; SRC-6, 7; WB-3; ASK-1; PRV-2, 4; ADJ-6 and ADM-5 (if approved) |
| **DP7 Supported content and the first national pack** | The verification route end to end: fresh captures, dispositions, signing, promotion. The release policy. The first national-law pack, ratified. "Supported" shown for one scenario. Paid plans | One release scenario meets the release policy, and the site shows "Supported" for that scope only | P3 (a professional legal expert). Lifting the 2026-10-19 freeze, run by run (business decision 6). The launch country (business decision 2). Pricing (business decision 3). Professional-indemnity insurance in force before the first paid contract (DEP-9; business decision 9) | 12 rows: KNW-3, 4, 6, 7, 11; RUL-4, 8, 9, 13; ADJ-3; PLT-11; ASK-3 |
| **DP8 CBAM, then the later phases** | The CBAM pack, the agreed second pack (KNW-8, KNW-12). Then the rest of the wider destination (choice 5b), in the order its own plan sets. Suggested rows such as GTD-10 and GTD-11 come only with your approval, and after CBAM | Per item, under its own plan | Your approval of each later item's plan; QD-11 | 20 rows: KNW-8, 12; GTD-1 to 16; EVD-11; DEP-9 (its insurance is a DP7 gate, rule 5) |

#### Where the hand-over's steps went

- **Step 2, the questionnaire research,** closes with revision 3 of the proposal. It feeds DP1 (the checker) and DP2 (onboarding).
- **Step 3, the Opus and Qwen foundation note,** is written before DP6.
- **Step 4, the confidence design,** splits: its approval prerequisites before DP4, the rest before DP6.
- **Step 5, one phased build plan,** is replaced by one plan per phase.
- **Step 6, build,** is the phases themselves.

**What approving version 1.1 does, and does not, do.** It approves the order, the rules and each phase's scope. It approves no phase plan, no gate and no implementation; each is asked for when its phase starts.
