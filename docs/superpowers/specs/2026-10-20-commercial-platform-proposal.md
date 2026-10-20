# Commercial platform proposal and the first bounded delivery scope — revision 2

**Status:** revision 2 of 2026-10-20, after the user's directional acceptance and eight corrections. Still a proposal: nothing is built. Codex is the independent reviewer; implementation starts only with the first increment of §8, under the usual process (`TEST-EVIDENCE-STANDARD.md`, red first, one subagent per task, teeth checks re-run by the parent, the user runs every commit). Accepted and retained from revision 1: the platform/engine separation, one application with five role-gated areas (consistent with the original brief), immutable assessment history, the review workbench and controlled publication.

**Starting point:** HEAD `1ad8d89` on `feature/opus55-subscription-migration`. Preserved untouched: the engine's laws and purity, the frozen pilot evidence, the r5 dossier and its recorded dispositions (closed work, not repeated here), and the SAP SE profile with its provenance, which stays outside the repository (§1.3).

**How to read it:** the brief's headings are outcomes. Technical defaults are recommended with their trade-offs and applied unless objected (§9.3); business decisions are identified and dated, not demanded now.

---

## 0. Recommendations

1. **Launch scope:** CSRD applicability and first-application for EU undertakings, Germany first, declared through an explicit release policy (§1.2) that keeps four assurance dimensions apart: verified encoding, legal ratification, monitored sources within cadence, and commercial support. A business decision, identified in §9.3.
2. **Wrap the engine, never change it:** `backend/platform` owns persistence, tenancy, authentication, jobs, files and scanning; the engine keeps its single dependency and its purity.
3. **One application, five role-gated areas** (§2).
4. **The review case is the unit of judgment**, keyed by tenant, reporting period, scope object and question identity; unresolved determinations produce as many cases as there are distinct underlying questions; cases have four terminal states that never blur "answered" with "no longer asked" (§3).
5. **Immutable assessment runs** pin the engine build, the full context, the profile snapshot, the pack revision, the verification state and the status labels as displayed; obligation instances are keyed by reporting period or occurrence, so re-running never duplicates tasks and a new year inherits nothing completed (§5).
6. **Scanning** keeps stored content apart from observed change events, records every transition, reassesses a conservative population, and makes every no-impact statement specific to a reviewed change, scope and date (§4).
7. **Platform defaults** (§6): Postgres with row-level security enforced through distinct database roles, a Postgres-backed queue, S3-compatible storage, custom authentication with a stated rationale and recovery, expand-and-contract migrations compatible with image rollback. Hosting, residency, costs, owners and service commitments are provisional until verified or accepted.
8. **Deployment work runs from a clean checkout with its own installed dependencies**; the existing isolated-artifact checks are kept, and the container image gate adds to them (§6.6).
9. **Delivery:** Stage 1 in four reviewable increments, the first of which corrects unsupported claims and protects access to configured profiles; the complete judgment workflow with a visual admin interface is Milestone 2 and is not displaced by foundation work (§7, §8).
10. **Decisions:** nothing blocks the first increment beyond its approval; technical defaults proceed unless objected; the business decisions are listed with the stage that needs each (§9.3).

---

## 1. Truthful launch scope

### 1.1 Customer segment (business decision, identified)

EU-incorporated undertakings and parent groups, and their advisers, whose CSRD position for financial years 2025 to 2027 is uncertain under Omnibus I: entities and groups near the amended thresholds, first-wave public-interest entities and parents of large groups, and subsidiaries weighing the exemption routes. Germany first, because `country-packs/DE.json` is the only stub with research notes and the first evaluation case is German. This keeps the CBAM exporter wedge of the strategy as the second pack's market; the first pack, its factory and its evidence are CSRD.

### 1.2 Coverage: four assurance dimensions and a release policy

The dimensions are recorded separately and never merged into one label:

| Dimension | What establishes it | Where it is recorded |
|---|---|---|
| **Verified encoding** | A fresh `verified` signature by a named reviewer over the requirement's input hash: the encoding says what the cited text says | `signatures.jsonl`, the freshness resolver |
| **Legal ratification** | A `ratified` signature by the named expert, which the ledger supports and nothing yet uses | `signatures.jsonl` |
| **Monitored** | Every source the requirement cites, and every register surface affecting it, has a successful check within its declared cadence; one historical success does not count; a lapsed cadence is a coverage gap | The platform's scan records (§4) |
| **Commercial support** | The release policy declares the scenario DataStrata supports and the conditions above that it requires | `docs/release-policy.md`, versioned per release |

**The release policy** names, per release: the supported scenario (for example "an EU-incorporated undertaking, standalone or parent, governed by German law, financial years 2025 to 2027"); the requirement set the scenario depends on, closed under `requirement_ref` and obligation triggers; the verification state required (verified encoding for every requirement in the closure; ratified where the policy says so); the national-law coverage the scenario needs (a ratified `DE` pack opens CSRD-S-013 for German entities); operational freshness (monitored within cadence); and a **scenario coverage review**, a named reviewer's recorded statement that the pack's requirements cover the scenario's legal questions, because signatures prove each encoding's fidelity, not the completeness of the set.

The public status words follow: **Supported** (under the release policy); **Draft · evaluation only** (in the pack, unsigned or stale; prototype banner); **Monitored** or **Coverage gap** (by cadence); **Planned** (named in the roadmap, no pack and no register row). Today 0 of 23 requirements are signed, so CSRD reads "Draft · evaluation only" until the release policy's conditions are met; the six regimes the site calls "watched" (CBAM, BRSR Core, IFRS S1 and S2, CSDDD, EUDR, ESPR) have no register row and no pack and become "Planned" or are removed.

**Launch candidate set.** The applicability and duty core, CSRD-S-001 to S-006, S-012 to S-015 and S-017 to S-023 (17 requirements) with the templates they trigger (O-001 to O-011, O-017), is a candidate set for the first release policy. Its count and its signatures are not proof of complete applicability coverage; the scenario coverage review decides that. Article 40a (S-007 to S-009), value chain (S-010, S-011) and transition relief (S-016) stay draft at launch.

### 1.3 SAP SE

An evaluation case, never a participating customer. The profile stays outside the repository; development and tests use synthetic fixtures (a synthetic profile shaped like it, with fourteen confirmed facts and six stated unknowns, carries no SAP data). Its six unknowns remain unknown unless new evidence and an authorised confirmation establish them through the review workflow of §3, which is the only legitimate route and must remain available; nothing makes them permanently unsettable, and nothing sets them without that route. The FTE average is never substituted for a statutory average without resolving the measurement question.

---

## 2. The surfaces

One Next.js application, one platform package, five role-gated areas; tenant roles cannot hold staff roles, so customers never reach regulatory configuration or platform administration.

| Area | Who | What it holds (stage) |
|---|---|---|
| Customer workspace | Tenant roles: owner, lead, contributor, viewer | Profile and guided intake, evidence submission, confirmations, determinations with "why", obligation register and detail, changes, actions, calendar, evidence, dated reports (Stages 1, 2, 4) |
| Customer administration | Tenant owner | Users, roles, entity access, notification preferences, integrations, account and plan (Stage 1 basic, Stage 4 full) |
| DataStrata review workbench | Staff: reviewer, publisher | Fact review, measurement questions, legal interpretation, national-law gaps, source review, rule proposals, impact analysis, controlled publication (Milestone 2, Stage 3) |
| DataStrata operations | Staff: operator | Scan health, failed jobs, review backlog, overdue work, publication history, support-access grants, incidents (Stage 1 skeleton, Stages 3, 5) |
| Assurance access | Tenant-granted assurance reviewer | Scoped, read-only, time-boxed access to evidence and assessment history; findings re-enter the tenant's cases and tasks (Stage 4) |

Three kinds of staff access to customer data are distinct (§6.4): **regulatory-review access**, scoped to the facts and discussion a case links, granted by the case's existence and logged per case; **authorised reassessment**, performed by the worker under a publication record, never by a person; and **temporary support access**, a time-boxed grant requested with a reason, approved by the tenant owner or taken as break-glass by the operator with a mandatory reason and automatic expiry, logged and shown to the customer while active.

---

## 3. Every judgment actionable: the review case

### 3.1 Identity

A case is identified by **tenant, reporting period, scope object and question**. The reporting period is the assessment context's financial year; a workspace holds one profile state per period and every run carries its period, so the same fact asked for FY2025 and FY2026 is two cases. Question identity depends on the class:

| Class | Question key | Shared across tenants? | Routed to |
|---|---|---|---|
| missing_company_fact | (factType, scope object where the fact must be stated) | No | Customer |
| threshold_range | (factType, scope object, comparison and threshold) — asks for a sourced exact value **or a sourced narrower range that no longer straddles the threshold** | No | Customer |
| measurement_ambiguity | (factType, scope object, measurement question key), opened by a reviewer or the customer; blocks the fact's confirmation until closed | The measurement rule may be shared; the fact is not | DataStrata, then customer |
| legal_interpretation | (requirement id and version, question key: a catalogue value, a flag, or the interpretive question) | **Yes**: one shared legal case in the workbench; each tenant has a case link holding only its own facts and discussion | DataStrata |
| missing_national_rule | (Member State, requirement id and version) | **Yes**, same structure | DataStrata |
| stale_evidence | (evidence item, fact) | No | Customer |
| dependency | not a case: a link from a downstream determination to the upstream case | | |

**Count rule.** The engine's `needs` are de-duplicated by key; n unresolved determinations produce exactly the number of distinct question keys among them, which is usually fewer than n and occasionally more when one determination needs several facts. `upstream_indeterminate` adds links, never cases; INDETERMINATE results with empty needs are routed by reason code as interpretation cases, never dropped.

### 3.2 Lifecycle

Routing states: open, awaiting customer, awaiting DataStrata, proposal pending. Terminal states, each recorded with actor, rationale, timestamp and the run that justifies it:

- **Resolved:** a confirmed fact, accepted evidence or a published pack revision answered the question; the resolving run is recorded.
- **Retained unknown:** an authorised decision to keep the value unknown, with rationale and a review date; the case reopens at the date or when new evidence arrives.
- **Superseded:** the question itself changed (a new requirement version, a different threshold or fact type) and a successor case replaces it, linked both ways.
- **No longer relevant:** the latest run no longer needs the question because an upstream conjunct became definitively false, the scope object was removed or the period closed. Recorded as closed *without evidence*, naming the reason; it never reads as "evidence supplied", and the same case reopens if a later run needs the question again.

A rejected proposal returns the case to open. Shared legal cases resolve through a pack revision or a recorded interpretation note bound to the requirement version; each tenant's link closes when that tenant's run no longer needs the question, with its own terminal state.

### 3.3 What a case carries, and what may be done

The plain-language question and why it matters (the affected requirements' plain English and the obligations at stake); the legal text and source references with versions (requirement version and input hash, corpus docIds and fence hashes); the company facts in play with their sources; the affected determinations and obligations; owner, priority (the engine's blocked weight), status, discussion and evidence; recorded reviewer, rationale, timestamps and review or expiry date; and a before-and-after preview computed by running the pure engine over a candidate profile.

Actions: request evidence; propose an answer (a value, or a narrower range, with a source); approve, which confirms the fact and triggers a run; reject; escalate to interpretation or national-law review; retain unknown. Nothing can set a determination or an obligation to "applies": resolution reaches the engine only as a confirmed fact, accepted evidence attached to a fact, or a published pack revision. Every resolution produces a new run; the previous run stays, and the change is explained as a diff between the two.

---

## 4. Regulatory scanning as an operational service

**Sources.** The engine's register remains the authority on what may be fetched and what a finding may do (tiers, corroboration, `affectsRequirements`). Operational fields it lacks (jurisdiction, parser, schedule state, last attempt, last success, error class) live in the platform database keyed by `W-id`.

**Content, observations and events are three records.**

- **Source content** is content-addressed: raw bytes and normalised text stored once per hash with first-seen and last-seen times; the same content observed twice is stored once.
- **An observation** is every fetch attempt: success with the observed hash, or failure with its error class. Observations are the retry unit. An observation whose normalised hash equals the source's current head creates no event and no notification, so a retried observation is harmless.
- **A change event** is a transition: (source, from hash, to hash, observation). The head advances with it. A → B → A records two events that reference the same stored content A; events are unique per (source, sequence) and idempotent on (source, from hash, to hash, observation).

**Review.** Each event opens a change review in the workbench. A later successful fetch never closes it; only a reviewer's disposition does (material, relevant, noise), naming the reviewed event. The disposition carries the legal classification fields kept apart: proposal, adopted act, entry into force, application date, national implementation.

**Impact analysis** compares the candidate pack revision with the current one: requirements added, removed or changed in condition or scope type; catalogue and flag edits; obligation-template changes; and the transitive closure through `requirement_ref` and obligation triggers. **The affected population is conservative:** every tenant with a run in an open period is reassessed, including tenants previously assessed outside scope, because a change can bring them in; a narrower population is used only when the dependency analysis proves that the untouched requirements and the tenant's facts cannot reach the changed logic, and that justification is recorded with the publication.

**Publication** is a signed pack revision authorised by a publisher distinct from the reviewer, shipped by commit and deploy as today, which keeps the status-truth boundary and the redeploy-only cache rule. The workbench records the authorisation and triggers the release. AI may draft the interpretation and the proposed edit from fenced documents under the existing spend controls; it never changes a status, a flag or a requirement.

**Reassessment and notification.** After deploy, the worker runs every affected tenant and open period, computes deltas and notifies affected users, idempotently on (tenant, event, period).

**No-impact statements are specific.** Each reads: change *event*, source version *hash*, reviewed by *name* on *date*, no impact for *scope* as assessed on *date*. The customer's "what changed" lists reviewed changes and, separately, open coverage gaps and pending reviews; a dated "nothing affects you" headline appears only when the scope has no open gap and no pending review. A successful fetch is coverage, not review, and closes nothing.

**Failure semantics.** A failed or missed check writes a coverage gap on the source and on every requirement it affects, from the last successful check; customer surfaces show degraded freshness until a check succeeds within cadence. Retries use capped backoff; parser failures and unavailable sources are failed jobs in operations; a missed schedule is detected by comparing due time with last attempt. Fetching is allowlisted to the register's hosts with size and time limits, no cross-host redirects, no script execution; fetched documents are evidence fenced with their hashes, never instructions; the scanning worker has no access to tenant data.

---

## 5. Obligations connected to business work

- **Identity.** An obligation instance is (tenant, scope object, template, occurrence key). The occurrence key is the reporting period for annual duties and the occurrence the template defines otherwise (a value-chain request for O-014 and O-015). Re-running the same period upserts the same instance and keeps its tasks and evidence; a new period creates a new instance that inherits nothing completed, though earlier evidence may be offered as credit subject to acceptance and its validity window.
- **Detail page:** basis (determination, requirement plain English, sources and versions as pinned by the run), triggering facts with sources, applicable period, required evidence, unresolved qualifications (open cases linked to the determination).
- **Work:** owners; tasks with legal deadlines distinct from internal target dates; reminders; escalation when overdue; evidence review with acceptance by a reviewer; automatic reopening when a fact, an evidence item or a pack revision changes.
- **Completion is not compliance:** evidence sufficiency, outstanding judgments and source coverage are three separate indicators; a closed task changes none of them.
- **Exports:** dated projections of one run, carrying scope, sources and versions, open questions and limitations, in JSON and printable HTML, rendered from the run's pinned state (§5.1), never from the current ledger.
- **Roadmap, kept:** integrations beyond .ics and email, scenarios as non-operative profile copies whose runs are labelled hypothetical, and grounded questions over stored records are Stage 6 items, not removed from the product.

### 5.1 Assessment history

Every run pins: the engine build (git commit and image tag of the deployed revision), the full assessment context (assessment date, financial year, subject), the profile snapshot (stored copy and hash), the pack revision (content hash of the pack directory, each requirement's version and input hash), the verification state (ledger digest, each requirement's derived status and freshness reasons), and the status labels as displayed. Historical reports render from that pinned state, so what a customer was shown on a date is reproducible with the basis on which it was shown.

---

## 6. Production foundations

### 6.1 Technical defaults (applied unless objected)

| Concern | Default | Trade-off |
|---|---|---|
| Persistence | PostgreSQL, plain SQL migrations, `pg` driver, rows validated with zod; no ORM | More hand-written SQL; in exchange, no second query language and no dependency with its own schema opinions |
| Queue | pg-boss (Postgres-backed) in a worker process | Lower throughput than Redis-based queues; one database to back up and secure |
| Files | S3-compatible object storage, tenant-prefixed keys, server-side encryption, signed expiring URLs, size limits, sha256 recorded; registry-first with optional upload | Optional custody adds residency and retention duties; pointer-only would push evidence elsewhere |
| Authentication | Custom: email and password (argon2id), opaque database sessions in secure cookies, rate limits, invitation and verification flows, **TOTP mandatory for staff and tenant owners**; passkeys next; SSO through an OIDC client only when a customer requires it | See §6.2 |
| Observability | Structured JSON logs with request and tenant ids, `/healthz` covering database, queue and storage, alerts on failed jobs and coverage gaps | No error-tracking SaaS at first |
| Secrets | The platform's secret store, rotated; none in the repository | |
| Audit | Append-only audit and history tables with database rules refusing UPDATE and DELETE | |

### 6.2 Why custom authentication

A hosted identity provider (Auth0, Clerk, Supabase Auth) would put a third party in the trust path of every privileged action, add a residency item and a monthly cost, and still leave authorisation, audit and tenancy to us. A self-hosted provider (Keycloak) is more to operate than the application itself. The needed primitives are small and well understood: argon2id hashing, opaque server-side sessions, TOTP, rate limits, email verification. The cost is owning password reset, lockout, recovery and the MFA flow, which §6.3 defines, and adding SSO later through a standard OIDC client. If a customer's procurement requires SSO before Stage 4, that is the point to add it, not to change the foundation.

### 6.3 Privileged-account recovery and revocation

- **Recovery:** TOTP enrolment issues hashed one-time recovery codes; a staff member who loses both the device and the codes is recovered only by a second staff member through a recorded two-person procedure, never by a self-service link; tenant owners recover through verified email plus a recovery code, and a tenant with a single owner is warned to appoint a second.
- **Revocation:** sessions are server-side and revocable individually or per user; removing a role or deactivating an account invalidates every session immediately and forces re-authentication; staff accounts are reviewed quarterly; a lost or compromised device triggers revocation of all sessions and re-enrolment of TOTP; every recovery and revocation is an audit event.

### 6.4 Tenant isolation with real database roles

Four database roles: `migrator` (owns the schema, used only by the migration job), `app` (the web process; `NOBYPASSRLS`, no DDL), `worker` (the job process; `NOBYPASSRLS`), and `support` (read paths used only inside an active support grant). Every tenant table has row-level security policies keyed on `current_setting('app.tenant_id')`, set per transaction from the session or the job. Reassessment jobs run as `worker` with the tenant context set per job and the publication record as their authorisation. Regulatory-review access reads through `app` with a case context that limits rows to the facts and discussion the case links. The isolation demonstrations (§9.1) connect as `app`, `worker` and `support`, never as the owner, and prove that a wrong or absent tenant context yields zero rows, that cross-tenant identifiers are 404s at the API, that exports and jobs carry and re-check the tenant, and that no tenant role resolves a staff route.

### 6.5 Migrations and rollback

Migrations are forward-only and follow expand-and-contract: a release may add columns, tables and defaults but may not remove or rename anything the previous image reads; contractions ship at least one release after the code stopped using the old shape. Within that window an image rollback is safe. Any change that breaks the window is declared in the release log with its recovery procedure (restore from the pre-release backup and replay), and no release ships without that declaration. Reverting an image is therefore sufficient only inside the compatibility window, and the release log says which it is.

### 6.6 Deployment, isolation checks and filesystem boundaries

Deployment work runs from a **clean checkout with its own `npm ci`**; nothing follows or copies dependencies through the worktree's symlinks into `b1b-record`. The standalone harness is changed to **refuse** a `node_modules` that is a symlink escaping the repository, with a message naming the clean-checkout requirement, rather than to dereference it. The existing isolated-artifact checks (`npm run test:standalone`: the traced-file closure, the isolation guard proved live, `/api/check` answered with the checkout forbidden, and the deployment-agreement fixtures) are kept as they are, run from the clean checkout. The container image gate **adds**: the image builds from the clean checkout, migrations apply as `migrator`, `/healthz` passes, the tenancy probe of §6.4 passes against the running image, and `/api/check` answers its golden. A health check alone is not the gate.

### 6.7 Residency, hosting and cost (provisional)

Every item below is a residency commitment only once its provider and region are verified and the user accepts it:

| Item | Default | To verify |
|---|---|---|
| Database and backups | Managed Postgres in an EU region; point-in-time recovery; nightly encrypted logical dumps to EU object storage | Provider region, backup location, retention |
| Object storage (evidence) | EU bucket, server-side encryption | Provider jurisdiction |
| Logs | Provider in an EU region or self-hosted; tenant ids but no evidence content in logs | Provider and retention |
| Transactional email | EU-processing provider; no evidence content in email bodies | Provider's processing location |
| Support access | Staff location and the support-grant model of §2 | Staff locations |
| AI processing | Pack drafting through the existing spend-controlled pipeline; customer data never leaves for AI processing without an explicit tenant setting | Model provider's processing location per use |

Hosting default: Fly.io in Frankfurt for Stages 1 to 4 (two machines, managed Postgres, object storage), with AWS eu-central-1 as the enterprise path; Hetzner self-managed as the low-cost alternative. Costs are estimates from memory at pilot scale (roughly $60 to $110, EUR 25 to 40, and $120 to $200 a month respectively) and must be checked against current price lists before any commitment. Hosting is not needed before Stage 3's continuous scanning; local Docker serves Stages 1 and 2.

### 6.8 Dependency exception

The engine keeps zod as its only runtime dependency, its purity tests and its seven-hit rule. `backend/platform` carries an explicit allowlist: `pg`, `pg-boss`, `argon2`, `otplib`, `@aws-sdk/client-s3`, `pino`, one transactional-email client, `zod`. `frontend/web` gains no runtime dependency. Each addition is reviewed with the lockfile.

### 6.9 Engine edges the platform must respect

Validate profiles before `assess` (reuse the web validator; the engine keeps the last duplicate and loops on a parent cycle); key determinations on (requirementId, scopeId) plus requirement version and input hash, never on `packVersion`; record a pack revision as the content hash of the pack directory, because flag and catalogue edits change results without moving any requirement hash; build the freshness resolver from `currentStateOf` and `resolvedStaleness`; choose `minStatus` floors closed under `requirement_ref`.

### 6.10 Verification evidence required for future signing (identified, not started)

Nothing below starts under this proposal's approval; no capture, signing, promotion or publication. The sign gate requires, per requirement, a verification result at the current version and input hash from a promoted pipeline version, with every evidence set valid and no MISMATCH or OPEN_QUESTION. Today: no pipeline version is promoted (the promotion decision rests on the trust-measurement design's evaluation or an explicitly recorded decision); CSRD-S-002 has r5 at version 4, so version 5 needs a new capture bound to the current HEAD; CSRD-S-001 has a manual 2026-08-14 log at an earlier version and no pipeline result at version 4 after the Article 1(4) change; every other requirement has no result. The launch candidate set therefore needs 17 current-version results, the promotion decision, and corpus coverage for the sources those requirements cite (SRC-007 and SRC-008 are not yet served, which touches CSRD-S-012's closure).

---

## 7. Delivery in stages

| Stage | Working behaviour | Verification, including failure paths | Review |
|---|---|---|---|
| **1. Truthful status and persistent workspaces**, in four increments (§8) | 1a claims and access protection; 1b platform foundation; 1c authenticated persistence; 1d stored assessments and history | Per increment: tenancy and authorisation suites, restart persistence, refusals, audit immutability, scripted failure walk-throughs | Codex per increment |
| **Milestone 2. The complete judgment workflow** | Review cases of §3 derived from runs, with a **visual workbench interface** for reviewers and a customer-visible outcome: evidence request and submission, proposal and approval, confirmation, reassessment, visible history and diff, retained-unknown and no-longer-relevant paths | A case resolved, one retained unknown, one superseded, one no longer relevant without evidence; a rejected proposal; the SAP-shaped synthetic fixture keeps its unknowns and can only change through the workflow | Codex |
| **3. Monitoring to reassessment** | Scheduled and on-demand scans; content, observations and events of §4; review; impact analysis; two-person publication; conservative reassessment; specific no-impact statements; coverage gaps | A → B → A recorded as two events; retried observations create nothing; a missed schedule, a parser failure and an unavailable source each demonstrated; a change touching only the intended tenants and periods; a fetch that does not close an open review | Codex |
| **4. Obligations, actions, evidence, reminders, reporting, administration, assurance access** | §5 in full; tenant administration; .ics and email; scoped read-only assurance access | Completion without evidence shows no compliance; reopening on change; a new period inherits nothing; export isolation; the assurance reviewer cannot mutate | Codex |
| **5. Commercial deployment within the agreed coverage** | Production environment, backups and restore drill, release and rollback drill, monitoring, support access, billing, the readiness demonstrations of §9.1, the first release policy | Every §9.1 item executed and recorded | Codex, then the user's separate approval for public deployment |
| **6. Roadmap** | Integrations beyond .ics and email, scenarios, grounded questions, the second pack (CBAM) | | |

Each stage ends with a checkpoint in `docs/superpowers/` and a reviewer hand-off of the existing form. Public deployment, live customer communications and paid commitments remain separate approvals.

---

## 8. The first bounded delivery scope: Stage 1 in four increments

**1a. Correct unsupported claims and protect configured profiles** (frontend only; no platform, no engine change). Replace `lib/regimes.ts` with a coverage register derived from the pack, the ledger and the source register, printing the four statuses of §1.2 (CSRD reads "Draft · evaluation only"; the six unbacked regimes become "Planned" or disappear). Remove or correct the hard-coded claims: "8 questions" (the check has 9, 10 for a parent); "You are current" and "nothing changed what binds you"; the fixed 100 bars; "determinations versioned, never overwritten"; "monitored sources become a dated briefing" and "exportable to your calendar"; "the same person who signs them off"; the placeholder team and email. Protect `/dashboard`: remove its public links, and gate it behind a server-side access secret set by environment, checked in middleware with a constant-time comparison and a session cookie, until real sign-in arrives in 1c (default; the alternative is an IP allowlist). Wire the contact form to a real inbox through the existing webhook variable, or hide it. Keep the prototype banner, "national-law status requires review", the status chips with reasons, and the r5 card as historical evidence for version 4. *Verification:* every removed string absent from the built site; the register prints only backed statuses; an unauthenticated request to `/dashboard` is refused and the configured profile is never served; the existing frontend suite green.

**1b. Platform foundation** (`backend/platform`, new; no customer-visible change). Schema v1 and migrations; the four database roles and row-level security; the audit tables with their refusal rules; authentication of §6.1 with TOTP for owners and staff; staff roles and the support-grant flow; the worker skeleton with one job (run assessment) and a failed-jobs list in a minimal operations page; the container image built from a clean checkout; the harness change of §6.6; CI running the existing isolated-artifact checks and the image gate; a development seed limited to the synthetic Meridian document. *Verification:* the isolation demonstrations of §6.4 as `app`, `worker` and `support`; restart persistence; audit immutability; the image gate; the existing standalone checks passing from a clean checkout.

**1c. Authenticated persistence.** Staff create a tenant and invite its first owner (no self-serve signup); users and roles; the company and group profile with scope objects and facts carrying sources and the confirmed flag, every edit a new version; guided intake from the engine's next questions, one question at a time with the reason, "I do not know" as a stated unknown, ranges allowed, a source reference required. *Verification:* two tenants cannot read each other's profiles through pages or API; a viewer cannot confirm a fact; a contributor cannot change roles; an invalid profile is refused by field; unconfirmed facts are shown "unconfirmed · not used".

**1d. Stored assessments and history.** Run assessment as a stored, immutable run pinning everything in §5.1; determinations in four tabs with the "why" drawer; the obligation register as a read-only view with the detail page's basis section and period-keyed identities; run history with a per-determination diff; dated export v1 (JSON and printable HTML) rendered from the pinned state. *Verification:* a restart preserves runs; a re-run of the same period creates no duplicate obligation instance; a new period creates new instances inheriting nothing; an export for one tenant never contains another's data; the SAP-shaped synthetic fixture (fourteen confirmed, six unknown) reproduces the determinations the offline preview recorded; the engine stays byte-untouched (`grep -ri csrd backend/engine/src/` at 7, suite green).

**Out of Stage 1:** review cases and the workbench interface (Milestone 2, next), evidence files and tasks (Milestone 2 and Stage 4), scanning (Stage 3), assurance access and billing (Stages 4 and 5).

---

## 9. Readiness, owners and decisions

### 9.1 Readiness demonstrations before commercial launch (Stage 5)

| Demonstration | How it is shown |
|---|---|
| Two customers cannot access one another's records, including exports and jobs | The isolation suite of §6.4 extended to exports and jobs, run against the production image as `app`, `worker` and `support` |
| Unauthorised users cannot confirm facts, change rules or publish | Authorisation matrix tests; workbench and publication routes refuse every tenant role; publication requires a reviewer and a distinct publisher |
| Restarting services preserves accepted records and history | Drill: stop and start web and worker; compare run digests before and after |
| Repeated scan events do not duplicate obligations or notifications | Idempotency tests on observations, events, reassessment runs and notifications |
| Failed scans visibly affect freshness and coverage | A forced fetch failure shows the coverage gap on the source and on affected requirements, and "Monitored" lapses when cadence is missed |
| Reviewed changes affect only the intended customers and periods | A published revision reassesses the conservative population and changes only the runs whose logic it reaches, with the period filter applied and the justification recorded |
| Unknowns remain unresolved until supported | The synthetic fixture's unknowns survive every run; the only route that changes them is a review case with evidence and an authorised confirmation, demonstrated both ways |
| Customers can inspect every generated obligation | Every obligation instance has a detail page reachable from the register and the determination |
| Backup restoration and release recovery work | Restore drill into a fresh database with digest comparison; rollback drill inside the compatibility window; the out-of-window procedure rehearsed once |
| Supported legal coverage has the required named review and approval | The release policy's conditions are met: fresh signatures by named reviewers, ratification where required, the scenario coverage review, and the national-law pack for the supported scenario |

### 9.2 Operating owners and commitments (provisional until accepted)

| Function | Proposed owner | Commitment to define |
|---|---|---|
| Regulatory review and ratification | The named expert of the product laws (Anna), with a publisher distinct from the reviewer | Review turnaround for interpretation and national-law cases (business decision) |
| Customer support | Vivin, interim, one shared mailbox | Response within one business day |
| Incidents | Vivin, with a written runbook; the named expert for regulatory incidents | Acknowledgement within business hours; post-incident note within five business days |
| Onboarding | Vivin creates the tenant and guides the first assessment; judgment cases to the reviewer | First assessment within two weeks of intake |
| Billing | Vivin, manual invoicing through Stage 4; a provider chosen at Stage 5 | Pricing tiers (business decision) |
| Service commitments | A legal-record change reviewed and briefed within five business days; availability target 99.5 percent monthly without credits | Business decision before any contract |

### 9.3 Decisions

**Blocking the next increment (1a): none beyond approving it.** The technical defaults of §6.1 and §6.8, the status words of §1.2 and the access-gate default of §8 apply unless objected during the review of this revision.

**Business decisions, identified with the stage that needs them:**

| Decision | Needed by |
|---|---|
| Germany-first CSRD launch scope and the first release policy's scenario | The first release policy (Stage 5), and Milestone 2's national-law cases |
| Regulatory-review responsibility: the named reviewer and ratifier, the two-person publication rule, and whether to pursue signing of the launch candidate set, including the promotion decision of §6.10 | Before any signing; before Milestone 2's shared legal cases |
| Paid service commitments and residency commitments of §6.7 and §9.2 | Before any contract (Stage 5) |
| Hosting provider and region | Before Stage 3's continuous scanning |
| Billing provider and pricing | Stage 5 |
| AI provider and spend controls for scanning assistance | Stage 3 |
| SSO, passkeys and self-serve signup | On customer demand; not before Stage 5 for self-serve |

**Settled by the user on 2026-10-20:** one application with five areas; the SAP profile stays outside the repository and synthetic fixtures are used.

---

## 10. Departures from the brief, with reasons

- **Assurance access as a scoped read-only role plus dated export**, not a portal, in Stage 4: the outcome is met with far less surface.
- **Publication stays "signed, committed, deployed"**: a workbench that wrote statuses into a running system would break the status-truth and redeploy-only cache design the repository enforces; the workbench records the authorisation and triggers the release.
- **Scanning without PDF parsing at first**: ingest is HTML-only; PDF sources are parser work in Stage 3 with explicit coverage gaps until then.
- **Integrations, scenarios and grounded questions are scheduled (Stage 6), not removed.**
- **No CBAM content in this cycle**: the architecture supports a second pack by construction; selling it needs the pack and its review.
- **Operational register fields live in the platform database**, not in the engine's register schema, so the engine's strict schema and seven-hit rule stay untouched.
