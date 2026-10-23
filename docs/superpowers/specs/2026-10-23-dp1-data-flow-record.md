# DP1 data-flow record: every place the hosting keeps data

> **What this is.** D5's condition 2 for DP1's stateless topology (`VISION.md` D5), and the input to the privacy notice (Task 10, PUB-4). It is Task 9 of the DP1 plan (`docs/superpowers/plans/2026-10-23-dp1-public-site-and-free-checker.md`, revision 3). The plan was read at sha256 `f6294e14…`; it was then committed as `ee2d2d7` (sha256 `ece8ec92…`), which adds your DG-11 content-track note and leaves Task 9's text unchanged.
> **Who reads it.** You and your co-founder, before deciding the host (DG-2, Appendix B act B-3); counsel, for the privacy notice (DG-5); Task 10's test, which reads the provider block in §12.
> **Written** 2026-10-23 (UTC), from vendor documentation read that day and from the candidate's code at `363011f` (no file read here changed in `ee2d2d7`). The topology is the plan's provisional one: Vercel Pro, functions in `fra1`, DNS at GoDaddy, CI on GitHub Actions, one external uptime monitor (provider open, DG-13), and the mailbox that receives visitors' email (DG-4): under option A the provider of the address you already run, under option B a new mailbox on the domain.
> **Not legal advice.** The record states what the providers' own pages say and where they are silent. Which records are personal data, who controls them and what the notice must say are judgements for counsel.
> **Status, recorded separately** (§11):
> - **This document: complete** on 2026-10-23, revision 2, with its checks passing. Uncommitted: you commit it.
> - **Your DG-2 review with your co-founder: pending.**
> - **Task 13's hosted verification: pending.** It needs the protected preview.
> - **Task 14's fresh, unauthenticated production-browser check: pending.** It needs DG-1.
>
> **Revision 2** (2026-10-23) makes your two corrections, and nothing else:
> 1. The blanket storage claim is replaced by a precise statement about checker answers. Hosting records and contact correspondence are described separately, and the existing mailbox's provider under DG-4 option A is included throughout (§2, §3, §8, §12, §13).
> 2. Cookie expectations on a protected preview are conditional on the authentication method. Preview protection after DG-1 is explicit, and a fresh, unauthenticated production-browser check is specified (§9, §10).
>
> These two corrections, the header-only bypass and the Observability Plus configuration check are carried into the plan's instructions, without changing its design (§10; the plan's note "Corrections carried from Task 9"). That plan edit is uncommitted, alongside Task 1's own uncommitted notes in the same file.

## Contents

- §1. Method and confidence tags
- §2. What DataStrata itself keeps
- §3. One visit, step by step
- §4. Vercel (the host)
- §5. GitHub (code and CI)
- §6. GoDaddy (registrar and DNS)
- §7. The uptime monitor (DG-13 open)
- §8. The mailbox provider (DG-4)
- §9. The visitor's browser, and what is contacted only at build
- §10. Findings that bear on other tasks
- §11. Status, the checks, and the commit
- §12. The provider block
- §13. The residency wording, for counsel
- §14. Unconfirmed items

---

## §1. Method and confidence tags

- **Read-only.** Public documentation pages only. Nothing was signed up for, signed in to, accepted, submitted or clicked. No consent banner was touched. No code ran in the candidate, and no local server was contacted.
- **How each page was read.** The list, with every URL, the page's own date and the reading method, is in the evidence folder (`PAGES-READ.md`, §11).
  - **Vercel's documentation** came through the web fetcher as the page's own Markdown text, so the facts below are read from the page itself.
  - **Vercel's DPA and privacy notice, Vercel's guide on WAF compliance, GitHub's pages, ICANN's policy, and the monitor and Next.js telemetry pages** came through the fetcher as a summary of the page. They are tagged "summarised" where cited. The DPA's key definitions were then re-read as page text in the in-app browser. The other summarised pages should be re-read before a sentence of the privacy notice rests on one of them.
  - **GoDaddy's pages refused the fetcher** (HTTP 403, as R4 found), and **Vercel's sub-processor list** renders only in a browser. Both were read as page text in the in-app browser. GoDaddy served its pages under its `/en-in/` locale path; the text is its Global Privacy Notice.
- **Paraphrase, not quotation.** Vendor text is paraphrased; names of settings and fields are given as the vendor writes them.
- **Tags.**
  - **[V]** read on the provider's own page on 2026-10-23.
  - **[V, inferred]** follows from what the provider's pages say, but no page states it in those words. The inference is spelt out.
  - **[X]** a lead: a search result or an earlier report, not read on the provider's page today.
  - **[3P]** a third-party source.
  - **[?]** unconfirmed: no page read today states it.
- **Dates.** "Page dated" is the page's own last-updated date. Every page was read on 2026-10-23.

---

## §2. What DataStrata itself keeps

Read in the candidate's code at `363011f`, with what later tasks change marked. Three things are kept apart here and in the privacy notice: checker answers (this section), hosting records (§4 to §7), and contact correspondence (this section and §8).

- **No database, storage, queue, email or worker** in DP1 (plan §4.1).
- **Checker answers are not stored by DataStrata.** The browser sends them in the body of one `POST /api/check`, never in a URL. The function uses them in memory to compute the result, and keeps no copy once it has answered: nothing is written to disk, a database or a log (plan §1, §4.3). Vercel's documented runtime-log fields include no request body (§4, V4) [V, inferred]. What the host records about the request itself (address, path, time) is a hosting record, in §4.
- **Contact correspondence is kept by DataStrata, separately.** The site collects no email address and its contact form stays off (below). But a visitor may write to the imprint's email address or call its telephone number (DG-4). That correspondence is kept in DataStrata's mailbox, held by the mailbox provider (§8):
  - under DG-4 option A, the provider of the address you already run;
  - under option B, a new mailbox on the domain.

  Calls go through your telephone provider. How long correspondence is kept is not yet set: that is your decision, for the privacy notice [?] (§14).
- **DataStrata's own log line** (Task 8, not yet built) carries the event, route, status, duration and release, and never the body, an answer, a header or an IP address. Task 8's teeth T8b checks it.
- **No analytics, no tag manager, no third-party script.** No file under `frontend/web/app`, `components` or `lib` loads one; `package.json` has no analytics package. Analytics and the host's speed tools stay out (plan §3.3), and Task 11 records them as off.
- **Cookies.** The public pages set none. The only `Set-Cookie` in the application belongs to the pilot passphrase gate (`lib/pilot-access-handler.ts`). DG-10 and Task 7 make every pilot route answer 404 on the host, so the gate's cookie is never set there.
- **The contact form** is not rendered while `CONTACT_WEBHOOK_URL` is unset (`app/api/contact/route.ts`). The host sets no environment variable (Task 11). A direct POST to `/api/contact` is parsed in memory and refused with 503; nothing leaves the function.

---

## §3. One visit, step by step

This is the path a visitor's data takes. Each record it leaves is in §4 to §9.

1. **Name lookup.** The visitor's DNS resolver asks GoDaddy's nameservers for the domain. GoDaddy sees the resolver's address, not usually the visitor's (§6).
2. **Connection.** The request reaches the nearest of Vercel's 126 points of presence. The point of presence terminates TCP and forwards the request over Vercel's private network to the nearest of 19 compute regions, which terminates TLS. So the request is decrypted in the region nearest the visitor [V: regions page]: for a visitor in Germany most likely Frankfurt, for a visitor in India Mumbai [V, inferred from the region list].
3. **Firewall.** Vercel's platform firewall (DDoS mitigation, on for every deployment) and the project's WAF rules inspect the request at that point, with the client IP address, the user agent, the path, the network (ASN), the TLS fingerprint (JA3/JA4) and the country [V: firewall pages].
4. **Protection, until DG-1.** Vercel Authentication refuses anyone not signed in to the team (§4, record V9).
5. **Serving.** A static page is served from the CDN cache of that region. `POST /api/check` is routed to the function in `fra1`, which receives the body and these headers set by Vercel: the client IP (`x-forwarded-for`, `x-real-ip`), and its derived country, region, city, latitude, longitude, postal code and time zone, plus the TLS fingerprint [V: request headers page]. The function computes the answer in memory and keeps no copy of the answers (§2).
6. **Records.** Vercel records the request in its runtime logs and observability events (§4). The answer reaches the browser, where the site sets no cookie and no web-storage entry (§9).
7. **Contact, only if the visitor chooses.** An email to the imprint's address goes to DataStrata's mailbox provider (§8: under option A the provider of the address you already run, under option B the new mailbox). A call goes through your telephone provider. Neither passes through the site.

---

## §4. Vercel (the host)

**The contracting party** is Vercel Inc., a Delaware corporation [V: DPA]. Its DPA applies to customers on the Pro and Enterprise plans [V: DPA §1]. So it would not cover a Hobby team, which may not be used commercially anyway (plan DG-2) [V, inferred].
**Roles** [V: DPA §2, §4, verified as page text]:
- Vercel is DataStrata's **processor for "Customer Data"**, which the DPA defines as the personal data in the customer's own content.
- Vercel is an **independent controller for "Service-Generated Data"**: usage data and metadata generated through the use of the services. The DPA covers it only so far as it is personal data. Vercel may use it to operate, improve and support its services, for marketing and service messages, and for analytics, benchmarking and reporting [V: DPA Schedule 1, through the fetcher's summary].
- The DPA does not say, record by record, which of the records below are Customer Data and which are Service-Generated Data [?]. Request records with visitors' IP addresses read as usage data and metadata, which would make Vercel their controller. That is DG-5's question for counsel.

**Where** [V: DPA §13.1 and Schedule 2; compliance page]:
- Vercel's primary processing facilities are in the United States. Data may be processed wherever Vercel or its sub-processors operate. The DPA makes no regional commitment.
- Customer Data is hosted in AWS, Microsoft Azure and Google Cloud data centres. Backups are taken every two hours, kept for 30 days and replicated globally.
- The customer chooses the function region (`fra1` here). The default is the United States (`iad1`).

**Transfers** [V, summarised]: the DPA incorporates the 2021 standard contractual clauses (Module 1 for Service-Generated Data, Modules 2 and 3 for Customer Data) and a UK addendum. The DPA does not mention the EU-US Data Privacy Framework; Vercel's privacy notice and compliance page state that Vercel is certified under it. Plan DG-5 records that the adequacy decision is in force, with appeal C-703/25 P pending.

**Sub-processors** [V: security.vercel.com/subprocessors, as page text; the list shows no date]: 28 entries. All are in the United States except Tinybird (analytics, Spain) and Plain (customer support, United Kingdom). Those that plausibly touch DP1's records: Amazon Web Services, Google and Microsoft (hosting and storage), Datadog and Honeycomb (monitoring), Redis (real-time logging and security), Tinybird and ClickHouse (analytics), WorkOS (audit logs), Knock Labs (customer notifications), Twilio (customer communication), Kasada (fraud prevention), Salesforce (CRM and support) and Stripe (payments). The rest are AI vendors, storage products DP1 does not use (Upstash, Neon), or support and community tools. Which sub-processor holds which record is not stated [?].

### The records

| # | Record | What it contains | Where | How long | Source | Unconfirmed |
|---|---|---|---|---|---|---|
| V1 | **Edge handling** (points of presence, CDN, routing middleware, in every region) | The request: client IP address, TLS fingerprint, headers including the user agent, path and query, and the derived geolocation headers of §3 step 5. Routing Middleware runs in every region whatever the function region [X: R4 §2.6; plan DG-2] | The point of presence and the compute region nearest the visitor, anywhere in the world; traffic fails over to the next region in an outage [V: regions page; compliance page] | Transient while serving; the records it leaves are V2 to V5 | [V] vercel.com/docs/regions (page dated 2026-08-11); /docs/headers/request-headers (2025-12-13); /docs/security/compliance (2026-09-08) | Whether a point of presence or region keeps any record of its own beyond V2 to V5 [?]. DP1's `middleware.ts` matches only `/dashboard`, which is 404 on the host |
| V2 | **Firewall data** (platform-wide DDoS mitigation and the WAF) | Client IP address, user agent, request path, ASN, JA4 fingerprint, country, the rule that applied and its action. A WAF log action records request details, including the IP address and headers. A persistent block stores the source IP address in the platform firewall for the period set [V] | Inspected at the edge in the region nearest the visitor. Where the records are stored is not stated by the provider | The traffic view offers the past hour, 24 hours or a live 10-minute window. **A retention period is not stated** [?]. Persistent blocks: the period the rule sets | [V] /docs/vercel-firewall (2026-09-10); /docs/vercel-firewall/firewall-observability (2026-09-10); /docs/vercel-firewall/firewall-concepts (2026-08-11); [V, summarised] /kb/guide/supporting-compliance-with-vercel-waf (2026-06-17) | Retention and storage region of firewall events [?] |
| V3 | **Rate-limit counters** (DG-15: 30 per 60 s per IP on `POST /api/check`) | A counter per client IP address, per region, in a fixed window | Each region keeps its own counters | At least the 60-second window; longer storage is not stated [?] | [V] /docs/vercel-firewall/vercel-waf/rate-limiting (2026-08-28) | Storage period; whether rules apply to previews (plan §10) [?] |
| V4 | **Runtime logs** (function invocations, routing middleware, CDN cache hits) | For each request: method, path, route, search parameters, time, status, host, user agent, the edge region, firewall verdict, cache status, function and deployment metadata, sub-requests, and every line the code writes to standard output (DataStrata's: Task 8's line only). Up to 256 lines and 1 MB per request [V]. **The client IP address is not among the displayed fields, but the Logs page's "logs from your browser" filter works by matching the viewer's IP address and user agent against incoming requests, so Vercel holds the IP with each request record** [V, inferred] | Not stated by the provider | **Pro: 1 day. Pro with Observability Plus: 30 days.** Observability Plus is on by default for teams created or upgraded to Pro on or after 2026-04-03, so a new DataStrata team gets 30 days unless Plus is turned off or the project excluded [V] | [V] /docs/logs/runtime (2026-08-28); /docs/observability/observability-plus (2026-07-06) | Whether the IP is stored in the log record itself or only matched at query time [?]. Storage region [?] |
| V5 | **Observability events** (CDN requests, function and middleware invocations) | Per-request events for charts and queries. Vercel's Monitoring page names a `public_ip` field among the event data. A team setting, "IP Address Visibility", hides IP addresses from the team's queries, but Vercel says it still collects them for business purposes such as DDoS mitigation. The team API describes the same setting as whether IPs are accessible in observability tooling [V] | Not stated by the provider | Pro: 1 day. Observability Plus: 30 days [V] | [V] /docs/observability (2026-09-10); /docs/query/monitoring (2026-08-11); /docs/rest-api/teams/get-a-team (2026-10-23) | How long Vercel keeps the IPs it collects for its own purposes [?]. Storage region [?] |
| V6 | **Build logs** | Build tool versions, warnings and errors, the files and dependencies installed and compiled. Secret variables of 32 characters or more, and always `VERCEL_AUTOMATION_BYPASS_SECRET`, are redacted. No visitor data. Readable only by the team (`/_logs` protected by default) [V] | Where builds run is not stated by the provider (no build-region page found; `/docs/builds/build-infrastructure` answered 404) [?] | Stored indefinitely for each deployment, truncated at 4 MB. Deployments are deleted by the retention policy (V7) [V] | [V] /docs/deployments/logs (2026-08-28); /docs/project-configuration/security-settings (2026-08-25) | Whether a build log is deleted with its deployment [?]. Build region [?] |
| V7 | **Deployment metadata and output** | Each deployment's source and build output (`/_src`, protected), commit SHA, branch, the Git author, the environment and URLs; Vercel's system variables, including the automation bypass secret. No visitor data | Customer Data in AWS, Azure or Google Cloud, region not stated; backups global [V: DPA Schedule 2] | Default on Pro: canceled 30 days, errored 90 days, preview 180 days, production 1 year. Exceptions keep the last 10 deployments, the last 20 ready production and 20 ready preview deployments, any aliased deployment and the latest preview of an active branch. A deleted deployment can be restored for 30 days [V] | [V] /docs/deployment-retention (2026-09-16) | Region [?] |
| V8 | **Team and account records** (staff data) | Names, email addresses, telephone numbers, usernames, linked Git identity; billing details (hashed card values and billing address); the activity log of every team event since the team was created; notifications (archived ones visible for 365 days); access grants; protection-bypass secrets [V] | United States primarily [V: DPA §13.1] | Activity log: since the team's creation. Account data: no period stated; Vercel keeps data for the minimum necessary period and deletes or anonymises it after. On termination, Customer Data is deleted within a commercially reasonable time, and Service-Generated Data is anonymised or deleted when Vercel no longer needs it [V] | [V] /legal/privacy-policy (page dated 2026-06-01, summarised); /docs/activity-log (2026-06-29); /docs/notifications (2026-09-14); /legal/dpa | Retention periods [?] |
| V9 | **Vercel Authentication** (every deployment until DG-1; after it, every preview and generated deployment URL, §9) | An anonymous request is redirected to Vercel's login page on vercel.com. A signed-in Vercel user without access may request access: the request triggers an email and a Vercel notification to the branch authors, and is listed under Deployment Protection, Requests. An authorised viewer gets a cookie for that one deployment URL. The automation bypass is sent as a header (or, if a tool cannot send headers, a query parameter), and can set a cookie when asked to [V]. The refused request itself also leaves V1 to V5 | United States primarily (account system) [V: DPA §13.1] | Not stated for access requests or the cookie [?] | [V] /docs/deployment-protection/methods-to-protect-deployments/vercel-authentication (2026-09-15); /docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation (2026-09-16) | What vercel.com's login page stores about a visitor (Vercel's own site, under Vercel's own privacy notice) [?] |
| V10 | **Service-generated data that Vercel keeps as its own** (DG-5) | Usage data and metadata generated through the services. Which of V1 to V9 falls here is not stated [?] | Not stated by the provider | No period; anonymised or deleted when Vercel no longer needs it [V: DPA Schedule 1] | [V] /legal/dpa (last updated 2026-03-17, effective 2026-03-31; key definitions re-read as page text) | Its scope and retention [?]: for counsel |
| V11 | **Alerts and notifications to staff** (DG-13) | Deployment failures (to the deployment's creator), promotions, domain and certificate events, usage and spend notifications; dashboard and email, SMS for spend notifications if a person sets it [V]. Firewall attack alerts by webhook or Slack only | Not stated; Knock Labs (customer notifications) and Twilio (communications) are listed US sub-processors [V, inferred] | Archived notifications visible for 365 days [V] | [V] /docs/notifications (2026-09-14) | Which provider sends the email [?] |

**The TLS certificate.** Vercel issues the custom domain's certificate through Let's Encrypt; a restrictive CAA record must allow `letsencrypt.org` [X: R4 §8.1, citing Vercel's troubleshooting page]. Every publicly trusted certificate is published in Certificate Transparency logs, which are public and permanent. It names only the domain. No visitor or staff data is in it. It is not a provider DataStrata contracts with, so it is not in §12's block.

---

## §5. GitHub (code and CI)

**The controller** for account data is GitHub, Inc. or GitHub B.V.; GitHub stores and processes personal data in several locations, including the user's region and the United States, and states that it complies with the EU-US Data Privacy Framework [V: GitHub General Privacy Statement, effective 2026-04-27, summarised].
**No visitor data** reaches GitHub. The tests use synthetic data only (plan §1).

| # | Record | What it contains | Where | How long | Source | Unconfirmed |
|---|---|---|---|---|---|---|
| G1 | **The repository** | The code, the pack, the tests and docs; the commit history, with each author's name and email address (staff data); branches and pull requests; deployment statuses that Vercel posts back (deployment URLs, which stay protected until DG-1) | Several locations, including the United States [V] | While the repository and account exist [V: privacy statement] | [V, summarised] docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement | — |
| G2 | **Actions workflow runs and logs** (`checks.yml`, `standalone.yml`) | Each run's log (test output on synthetic data, the commit, the actor), check results and commit statuses. The workflows upload no artifacts (read in `.github/workflows`) | GitHub-hosted runners are virtual machines in Microsoft Azure; no region is stated [V] | **90 days by default**; a private repository can set 1 to 400 days [V] | [V, summarised] docs.github.com/en/repositories/…/managing-github-actions-settings-for-a-repository (no page date); docs.github.com/en/actions/concepts/runners/github-hosted-runners (no page date) | Runner region [?]. The repository's actual setting [?] |
| G3 | **The Actions cache** (`setup-node` with `cache: npm`) | The npm package cache | Not stated | Removed when not accessed for over 7 days; 10 GB per repository by default [V] | [V, summarised] docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching (no page date) | Region [?] |
| G4 | **Staff accounts** | Account data, and usage data including IP address, device and session details | Several locations, including the United States [V] | While the account is active, and as contracts need [V] | [V, summarised] privacy statement | — |

---

## §6. GoDaddy (registrar and DNS)

**The controller** for EU customers of GoDaddy.com is GoDaddy.com, LLC. Its EU Article 27 representative is GoDaddy Deutschland GmbH, Cologne. GoDaddy stores personal data on its own systems and with service providers including AWS, and transfers it to the United States under the EU-US Data Privacy Framework, with standard contractual clauses where the framework is not available [V: Global Privacy Notice, last revised 2026-05-28; European Supplemental Privacy Notice, last revised 2025-11-17; both read as page text in the in-app browser].
**The domain is not yet bought** (DG-3). Its top-level domain decides the registry and the registrant-data rules.

| # | Record | What it contains | Where | How long | Source | Unconfirmed |
|---|---|---|---|---|---|---|
| D1 | **The DNS zone** | The records of Task 12: the apex A record and the `www` CNAME to Vercel; under DG-4 option A the no-mail records (null MX, `v=spf1 -all`, DMARC `p=reject`); under option B the mailbox's MX, SPF, DKIM and DMARC. Public by design. No personal data | Not stated by the provider; GoDaddy names its own systems and AWS for personal data | While the domain is registered and its DNS is at GoDaddy | [V] GoDaddy Global Privacy Notice; plan Task 12 | Where the zone is served from [?] |
| D2 | **DNS queries** | Each lookup reaches GoDaddy's nameservers from the visitor's resolver: the resolver's address and the name asked for. A resolver may add part of the visitor's subnet (EDNS Client Subnet) | Not stated | Not stated | [V] GoDaddy Global Privacy Notice (last revised 2026-05-28): GoDaddy collects device IDs, IP addresses and similar details automatically when its services are used, without naming DNS | Whether GoDaddy logs authoritative DNS queries, and for how long [?] |
| D3 | **Registrant data** | For a generic top-level domain (ICANN's Registration Data Policy, in force since 2025-08-21): the registrant's name, street, city, postal code, country, telephone and email, and the organisation if given. Name, street, city, country, telephone and email go to the registry where a legal basis and an agreement exist. Country (and state, if collected) is always published; the other fields are published unless redaction is required by law or chosen; the registrant email is replaced by a non-identifying address or a web form [V] | The registrar (GoDaddy, United States and AWS) and the registry of the chosen top-level domain | The registrar keeps the data needed for transfer disputes for at least 15 months after its sponsorship of the registration ends [V: policy §12] | [V, summarised] icann.org/en/contracted-parties/consensus-policies/registration-data-policy (revised 2026-05-12) | For a country-code domain such as `.de`, the registry's own rules apply instead (for `.de`, DENIC's) [?]: DG-3. Whether the registrant is the entity or a person [?] |
| D4 | **The customer account** (staff data) | Name, email, telephone, address, payment method; device ID and IP address when staff use GoDaddy's site and console (GoDaddy's own site uses cookies and Google Analytics) [V] | GoDaddy's systems and AWS; transfers to the United States [V] | For GoDaddy's business needs and as the law requires; no period stated [V] | [V] Global Privacy Notice | Periods [?] |

---

## §7. The uptime monitor (DG-13 open)

**A placeholder.** DG-13 is open: the provider and plan are yours to choose (plan DG-13, Appendix B act B-8). The plan recommends checks of `/healthz` and `/` at least every 5 minutes from an EU location, alerting both of you by email after two consecutive failures.

| # | Record | What it contains | Where | How long | Source | Unconfirmed |
|---|---|---|---|---|---|---|
| M1 | **Probe records** | Each check's time, location, status, response time; depending on the provider, the response's headers and body or a screenshot. `/healthz` and `/` carry no visitor data. The probes themselves also appear in Vercel's records (V2 to V5) with the monitor's addresses | Depends on the provider (leads below) | Depends on the provider (leads below) | Plan DG-13; leads [V, summarised]: checklyhq.com/security and checklyhq.com/docs/platform/data-storage (no page dates), uptimerobot.com/privacy (change log to 2026-08-28), betterstack.com/privacy (2022-11-25) | All [?] until DG-13 |
| M2 | **Alert recipients and the account** (staff data) | Both people's email addresses, the account, billing data on a paid plan | As above | As above | Plan DG-13; the same three leads | All [?] until DG-13 |

**Leads for DG-13**, each from the provider's own page today, none verified on an account:
- **Checkly.** Its security page says all data is stored in the EU, in AWS `eu-west-1` (Ireland), and that check results may also be stored in the region where a check ran. It names AWS and Vercel as its infrastructure, and Auth0, Stripe, Cloudflare and Grafana Cloud for other roles. Raw check results are kept 7 days on Hobby and Starter (30 days on Team), aggregates 30 days on those plans; stored results can include response bodies and headers, screenshots and run logs; detailed logs are purged after a month and backups go back 4 days [V, summarised: checklyhq.com/security, no page date; checklyhq.com/docs/platform/data-storage, no page date]. The page names "Checkly Inc." in its footer.
- **UptimeRobot.** Operated by UptimeRobot s.r.o. Its privacy policy names sub-processors by function (Limestone Networks, AWS, DigitalOcean, Hetzner, Cloudflare, Vercel, ClickHouse Cloud, ScyllaDB) but no countries, gives no retention periods, and offers a DPA on request [V, summarised: uptimerobot.com/privacy, change log to 2026-08-28].
- **Better Stack.** Better Stack, Inc., a Delaware corporation. Its privacy policy says it processes personal data primarily in the EU, relies on standard contractual clauses, names no hosting provider, and lists its sub-processors in its DPA, which was not read [V, summarised: betterstack.com/privacy, last updated 2022-11-25].
- **Free tiers' commercial-use terms** were not read for any of them (plan DG-13) [?].

---

## §8. The mailbox provider (DG-4): contact correspondence

Correspondence is not a hosting record. It exists only when a visitor chooses to write or call, it is kept by DataStrata, and the privacy notice describes it separately (§13). Under either DG-4 option there is a mailbox provider, and the privacy notice names it.

| Option | The mailbox provider | What it keeps | DNS (§6, D1) |
|---|---|---|---|
| **A** (recommended for DP1): an address you already run | The provider of that existing address. It is not a hosting provider and joins no hosting configuration, but it receives and stores what visitors send there | The messages and their senders' addresses, for as long as DataStrata keeps them; the provider's own mail logs (senders' addresses and IP addresses, spam-filter verdicts) under its own terms | The new domain publishes the no-mail records |
| **B**: a mailbox on the new domain | A new provider, chosen at DG-4, which joins the processors | The same | The mailbox's MX, SPF, DKIM and DMARC |

- **Telephone.** Calls to the imprint's number go through your telephone provider, which keeps its own call records. It holds no website data.
- **Not chosen or not read.** The option, the provider's identity, its data locations and terms, and how long DataStrata keeps correspondence are all open (DG-4; §14) [?].
- **In §12's block** the mailbox row covers both options, so Task 10's test asks the privacy notice to name the provider either way.

---

## §9. The visitor's browser, and what is contacted only at build

### The visitor's browser

- **The site sets no cookie and no web storage.** No cookie, `localStorage`, `sessionStorage` or IndexedDB entry is set by the site's own code (§2).
- **On a protected deployment, Vercel's cookies depend on how the checking browser gets past Vercel Authentication** (V9) [V: Vercel Authentication and bypass pages]. The check records which method it used, and expects:

  | Method | Cookies expected on the deployment's host |
  |---|---|
  | The bypass secret in the `x-vercel-protection-bypass` header on every request, without `x-vercel-set-bypass-cookie` | **None.** The bypass page describes a cookie only when `x-vercel-set-bypass-cookie` asks for one [V, inferred] |
  | The bypass header with `x-vercel-set-bypass-cookie: true` | **Vercel's bypass cookie only**, set through a redirect, `SameSite=Lax` by default [V]. Its name is not stated [?] |
  | A team member signed in through Vercel Authentication | **Vercel's authentication cookie only**, for that one deployment URL [V]. Its name is not stated [?]. Vercel's login sets its own cookies on vercel.com, a different site, which the deployment-host check does not count |

  Any other cookie, and any web-storage entry under any method, fails the check.
- **The bypass secret travels only in the header, never in a URL.** Vercel also accepts it as a query parameter, but runtime logs keep search parameters (V4), so a secret in a URL would be logged.
- **Preview protection stays after DG-1.** Under DG-1 production moves from All Deployments to Standard Protection (`prod_deployment_urls_and_all_previews` in Vercel's API) [V: Vercel Authentication page]. Only the production domain becomes public; every preview, and every generated production deployment URL, stays behind Vercel Authentication. The cookie expectations above keep applying to those URLs after DG-1.
- **The fresh, unauthenticated production-browser check (Task 14, after DG-1).** A new browser profile that has never signed in to Vercel, and carries no bypass header, query parameter or cookie, does three things on the production domain:
  - loads every page;
  - runs a check down each visitor path;
  - records every request, cookie and storage entry.

  Expected: **no cookie, no `localStorage`, `sessionStorage` or IndexedDB entry, and requests only to the production origin.** Positive control: an entry set by hand in that profile is reported. That previews stay refused is checked with a plain request outside this profile, so Vercel's login page cannot add its cookies to the profile.
- **Fonts are self-hosted at build.** `app/layout.tsx` loads Archivo, Inter and JetBrains Mono through `next/font/google`. Next.js downloads them at build time and serves them from the deployment's own domain, so the browser sends no request to Google [V: nextjs.org/docs/app/getting-started/fonts, page dated 2026-05-27].
- **Links out, only on a click.** Today's checker (`components/marketing/CheckFlow.tsx`) links each cited source in a new tab with `rel="noreferrer"`, so no `Referer` header is sent. The pack's source URLs point at **four hosts**, not only EUR-Lex: `eur-lex.europa.eu` (10), `finance.ec.europa.eu` (4), `www.efrag.org` (2) and `knowledgehub.efrag.org` (1). The DP1 checker shows the headline timeline only (CHK-2); whether its route rows link sources is settled in Tasks 4 to 6 [?]. Task 13's network check covers what ships.
- **No host toolbar or analytics script.** Vercel's toolbar is a per-team, per-environment setting (`enablePreviewFeedback`, `enableProductionFeedback` in the team API) [V]. Task 11 records it as off for previews and production.

### Contacted only at build (no visitor data)

These hold no data about visitors or staff, so they are not in §12's block. Say so to counsel if the notice is to mention them.
- **Google Fonts.** `next build` fetches the three fonts from Google, from the build machine (Vercel's, and GitHub's runners in CI). The intermittent build failure this causes stays a known risk (plan §3.3).
- **The npm registry.** `npm ci` downloads the dependencies, from the same machines.
- **Next.js telemetry.** Next.js collects anonymous usage data during builds (the command, versions, machine type, build duration, page count), not file contents, environment variables or logs. It can be turned off with `NEXT_TELEMETRY_DISABLED=1` [V, summarised: nextjs.org/telemetry, no page date]. Whether it is on by default in the host's build is not stated on that page [?]. Turning it off would add an environment variable, which Task 11 currently excludes; that is your call, not this record's.

---

## §10. Findings that bear on other tasks

Items 1, 2, 3, 9 and 10 are carried into the plan's instructions (its note of 2026-10-23, Task 9 corrections), without changing its design. The others are for the parent session and you.

1. **Runtime-log retention is 30 days, not 1, unless you turn Observability Plus off.** It is on by default for teams created or upgraded to Pro on or after 2026-04-03 (V4). The privacy notice's retention follows that setting. *In the plan:* Task 11's configuration record states the intended state, B-5 sets it, and Task 13 reads it back and checks that the privacy notice states the matching retention.
2. **Runtime logs record search parameters** (V4). The automation bypass secret therefore travels only as the `x-vercel-protection-bypass` header, never as a query parameter, or it lands in the logs. T11d's sentinel scan covers the scripts' output, not Vercel's logs. *In the plan:* §1, Task 11's scripts and Task 13's checks.
3. **Task 13's storage check expects cookies by authentication method** (§9): none with the bypass header alone; Vercel's bypass cookie alone with `x-vercel-set-bypass-cookie`; Vercel's authentication cookie alone for a signed-in team member. No web storage under any method. *In the plan:* Task 13, check 6.
4. **A WAF Challenge action, Attack Mode or a bot-protection challenge would store a challenge session in the visitor's browser** for an hour [V: firewall concepts]. That would break the site's "no cookie, no web storage". DG-15's rule answers 429 and stores nothing in the browser. Any challenge-type rule needs this record and the privacy notice changed first.
5. **The function receives the visitor's IP address and IP-derived location headers**, down to city, coordinates and postal code (§3 step 5). Task 8's log line must carry no header; T8b's no-answers test could add a header sentinel.
6. **Vercel's DPA applies to Pro and Enterprise customers** (§4). On Hobby, DataStrata would have no DPA at all [V, inferred].
7. **Two team settings reduce what Vercel exposes, without changing what it collects** (for B-5, your choice):
   - "IP Address Visibility" hides IP addresses from the team's observability queries (V5);
   - `dpAccessRequestsMode` decides who can request access to a protected deployment (`all`, `email-domain` or `none`) [V: team API]. With `none`, strangers with Vercel accounts cannot send access requests that email the branch authors (V9).
8. **The source links reach four hosts**, not only EUR-Lex (§9).
9. **The privacy notice describes checker answers, hosting records and contact correspondence separately** (§2, §13). Under DG-4 option A, the existing mailbox's provider still receives and stores what visitors send, so the notice names it under either option (§8). *In the plan:* §0, §1, §4.3, DG-4, Task 9, Task 10 and Appendix A.2.
10. **After DG-1, a fresh, unauthenticated production-browser check, with no bypass credentials** (§9): no cookie, no web storage, and requests only to the production origin. Previews stay protected and are checked with a plain request. *In the plan:* §4.2 and Task 14.

---

## §11. Status, the checks, and the commit

**Status, recorded separately.**

| Item | State | What closes it |
|---|---|---|
| This document, Task 9's deliverable | **Complete** on 2026-10-23, revision 2. Its checks pass (below). Uncommitted | You commit it |
| DG-2: you and your co-founder read it and choose the host | **Pending** | Your decision (Appendix B, B-3) |
| Task 13's hosted verification, including Task 9's teeth | **Pending** | The protected preview, after your acts B-5 to B-10 |
| Task 14's fresh, unauthenticated production-browser check (§9) | **Pending** | DG-1 |

**Teeth (pending in Task 13).** The defect this record must not have is a record or a host it omits. That is detected in Task 13 against the protected preview, which does not exist yet. It was not attempted here:
- the browser's network log for every page and every check path must show requests only to the deployment's origin;
- a request to any other host fails the record;
- positive control: a page loaded with a temporary third-party image is reported.

Task 13 check 11 also reconciles every request host, cookie and storage observation with this record, and every provider here with the privacy notice.

**The checks run here.** A one-off script outside the repository checks four things:
- **(A)** every entry in §12's block has every field, non-empty;
- **(B)** every record row (V, G, D, M) names a source;
- **(C)** neither the blanket storage claim nor a fixed two-cookie expectation appears, in this record or in the plan;
- **(D)** the block's mailbox entry covers DG-4 option A.

Result: PASS, with 5 entries and 21 rows. Each positive control fails as intended on a copy:
- **A:** GoDaddy's `retention` blanked;
- **B:** row V6's source cell blanked;
- **C:** the blanket claim put back, once in a copy of this record and once in a copy of the plan;
- **D:** option A removed from the mailbox entry.

In revision 1, control B first passed, because the row check read the Unconfirmed column. The check was fixed to find the Source column by name, and every run was repeated. The outputs, verbatim, are in the evidence folder:
`side-session-notes/local_043075c1-…/2026-10-23T1713Z-dp1-task9/` (README, the script, its output, the list of pages read, and `MANIFEST.sha256`).

**Done when** (plan, Task 9):
- every row has a source: **met**;
- the unconfirmed items are listed (§14): **met**;
- you and your co-founder have read it for DG-2: **pending**, yours.

**The commit** (you run it; one file):
```bash
git add docs/superpowers/specs/2026-10-23-dp1-data-flow-record.md
```
```bash
git commit -m "Record every place DP1's hosting keeps data, so the host is chosen and the privacy notice written against what the flows actually are"
```

---

## §12. The provider block

Task 10's test reads this block: the privacy notice must name every `provider`. The monitor and mailbox rows are placeholders until DG-13 and DG-4; when either is decided, the row is replaced and this record re-issued.

```json
[
  {
    "provider": "Vercel Inc.",
    "role": "Host (DG-2, provisional): edge network, CDN, firewall and routing middleware in every region; functions in fra1; builds and deployments; Vercel Authentication until DG-1. Processor for Customer Data; independent controller for Service-Generated Data (DPA §4)",
    "records": [
      "V1 edge handling: client IP, TLS fingerprint, headers, path and query, IP-derived location",
      "V2 firewall data: client IP, user agent, path, ASN, JA4, country, rule and action; persistent blocks store the IP",
      "V3 rate-limit counters per client IP, per region",
      "V4 runtime logs: method, path, search parameters, status, host, user agent, edge region, DataStrata's log line; IP held with the request",
      "V5 observability events, including the public IP",
      "V6 build logs (no visitor data)",
      "V7 deployment metadata and output (no visitor data)",
      "V8 team and account records (staff)",
      "V9 Vercel Authentication access requests and cookies (staff and automation; every deployment until DG-1, previews and generated deployment URLs after it)",
      "V10 service-generated data kept as Vercel's own",
      "V11 alerts and notifications to staff"
    ],
    "region": "Requests handled at the point of presence and compute region nearest the visitor, worldwide; functions in fra1 (Frankfurt); primary processing facilities in the United States; storage region of logs and firewall data not stated by the provider; backups replicated globally",
    "retention": "Runtime logs 1 day on Pro, 30 days with Observability Plus (on by default for teams created on or after 2026-04-03); observability events 1 day or 30 days; firewall data not stated; deployments 30/90/180 days or 1 year by state, plus 30 days' recovery; build logs kept with each deployment; activity log since team creation; service-generated data until Vercel no longer needs it; Customer Data backups 30 days",
    "source": [
      "https://vercel.com/legal/dpa (last updated 2026-03-17, read 2026-10-23)",
      "https://vercel.com/docs/logs/runtime (2026-08-28, read 2026-10-23)",
      "https://vercel.com/docs/observability/observability-plus (2026-07-06, read 2026-10-23)",
      "https://vercel.com/docs/vercel-firewall/firewall-observability (2026-09-10, read 2026-10-23)",
      "https://vercel.com/docs/regions (2026-08-11, read 2026-10-23)",
      "https://vercel.com/docs/deployment-retention (2026-09-16, read 2026-10-23)",
      "https://security.vercel.com/subprocessors (no date shown, read 2026-10-23)"
    ]
  },
  {
    "provider": "GitHub, Inc.",
    "role": "Code hosting and CI (GitHub Actions); no visitor data",
    "records": [
      "G1 repository: code, commit history with authors' names and emails (staff), pull requests, deployment statuses",
      "G2 Actions workflow runs and logs (synthetic test output)",
      "G3 Actions npm cache",
      "G4 staff accounts, including IP address and device data"
    ],
    "region": "Several locations including the United States (privacy statement); hosted runners in Microsoft Azure, region not stated by the provider",
    "retention": "Workflow runs and logs 90 days by default (1 to 400 days configurable for a private repository); cache entries removed after 7 days without access; account data while the account is active",
    "source": [
      "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement (effective 2026-04-27, read 2026-10-23)",
      "https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository (no date shown, read 2026-10-23)",
      "https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching (no date shown, read 2026-10-23)"
    ]
  },
  {
    "provider": "GoDaddy.com, LLC",
    "role": "Domain registrar and authoritative DNS (DG-3); no visitor data beyond DNS lookups from resolvers",
    "records": [
      "D1 the DNS zone (public records, no personal data)",
      "D2 DNS queries from visitors' resolvers",
      "D3 registrant data under the registry's rules",
      "D4 the customer account (staff)"
    ],
    "region": "GoDaddy's own systems and AWS, with transfers to the United States; DNS query handling not stated by the provider",
    "retention": "Registrant data for transfer disputes at least 15 months after sponsorship ends (ICANN, generic domains); account data for business needs and as the law requires; DNS query logging not stated",
    "source": [
      "https://www.godaddy.com/legal/agreements/privacy-policy (last revised 2026-05-28, read 2026-10-23 in the in-app browser)",
      "https://www.godaddy.com/legal/agreements/european-supplemental-privacy-notice (last revised 2025-11-17, read 2026-10-23 in the in-app browser)",
      "https://www.icann.org/en/contracted-parties/consensus-policies/registration-data-policy (revised 2026-05-12, read 2026-10-23)"
    ]
  },
  {
    "provider": "Uptime monitor (DG-13 open; leads: Checkly, UptimeRobot, Better Stack)",
    "role": "External uptime checks of /healthz and / with email alerts to both staff (DG-13); processor",
    "records": [
      "M1 probe records: time, location, status, response time, possibly response headers, bodies or screenshots",
      "M2 alert recipients' email addresses and the account (staff)"
    ],
    "region": "Not known until DG-13. Leads: Checkly states the EU, AWS eu-west-1 (Ireland); UptimeRobot names no countries; Better Stack states primarily the EU",
    "retention": "Not known until DG-13. Lead: Checkly keeps raw results 7 days and aggregates 30 days on Hobby and Starter",
    "source": [
      "https://checklyhq.com/security (no date shown, read 2026-10-23)",
      "https://uptimerobot.com/privacy/ (change log to 2026-08-28, read 2026-10-23)",
      "https://betterstack.com/privacy (last updated 2022-11-25, read 2026-10-23)",
      "Plan DG-13: docs/superpowers/plans/2026-10-23-dp1-public-site-and-free-checker.md"
    ]
  },
  {
    "provider": "Mailbox provider for the imprint's email address (DG-4 option A: the provider of the address you already run; option B: a new mailbox on DataStrata's domain)",
    "role": "Receives and stores contact correspondence that visitors choose to send by email; not a hosting record. Under option B also configured on DataStrata's domain",
    "records": [
      "Contact correspondence: the messages visitors send and DataStrata's replies, with the senders' addresses",
      "The provider's own mail logs: senders' addresses and IP addresses, spam-filter verdicts"
    ],
    "region": "Not known until DG-4 names the provider (option A: the existing provider's terms; option B: the chosen provider's)",
    "retention": "Correspondence: as long as DataStrata keeps it, a period not yet set (your decision, for the privacy notice); mail logs: the provider's terms, not read",
    "source": [
      "Plan DG-4: docs/superpowers/plans/2026-10-23-dp1-public-site-and-free-checker.md"
    ]
  }
]
```

---

## §13. The residency wording, for counsel

**Three parts, described separately.** Revision 2 replaces the plan's blanket opening sentence with a precise statement about checker answers, and states hosting records and contact correspondence apart. A draft for counsel, not legal advice. Bracketed text depends on a setting or a decision. The hosting part is the plan's draft sentence, filled with the retention read today.

> **Your checker answers.** DataStrata does not store the answers you give the free check. Your browser sends them to our host in the body of a single request. Our application uses them in memory to calculate your result and keeps no copy once it has answered. The log line our application writes for the request says only that a check was answered, with its status and duration, never an answer or your IP address; it is kept with the host's request logs, below.
>
> **Hosting records.** The host processes request data, including your IP address, at its edge in the region nearest to you and in Frankfurt, and keeps request logs for **[30 days** while Observability Plus is on, the default for a new Pro team, **or 1 day** if it is turned off]. Its parent company is in the United States, under the EU-US Data Privacy Framework and standard contractual clauses.
>
> **If you contact us.** If you email us at [the imprint's address] or call [the imprint's number], we keep that correspondence for [a period you set]. Emails are received and stored by our email provider, [its name: under DG-4 option A, the provider of the address we already use; under option B, our domain's mailbox provider]. Calls go through our telephone provider, [its name].

**Where the hosting sentence differs from the flows read today:**
1. **"Its parent company."** The contracting party is Vercel Inc. itself, a Delaware corporation (§4). No EU subsidiary is party to the DPA.
2. **"Keeps request logs for 30 days or 1 day."** That is the runtime-log window (V4). Other records hold the IP address with no stated period: firewall data (V2), observability events, where Vercel keeps collecting IPs for its own purposes (V5), and service-generated data, which Vercel keeps as an independent controller until it no longer needs it (V10). Backups of Customer Data are kept 30 days, replicated globally.
3. **"In the region nearest to you and in Frankfurt."** True of where requests are handled (§3). Where the records are stored is not stated, and Vercel's primary processing facilities are in the United States.
4. **"Under the EU-US Data Privacy Framework and standard contractual clauses."** The DPA rests on the standard contractual clauses and does not mention the framework. The framework certification is stated in Vercel's privacy notice and on its compliance page.

**An alternative hosting part closer to the flows, for counsel to weigh** (the other two parts stay as above):

> **Hosting records.** Our host, Vercel Inc., a company in the United States, receives each request, including your IP address, at the point of its network nearest to you, and runs our application in Frankfurt. Vercel keeps request logs for [30 days / 1 day], and keeps usage data and metadata for its own purposes as an independent controller. Its primary processing facilities are in the United States. Transfers rely on the EU-US Data Privacy Framework and on the EU standard contractual clauses in its data processing addendum.

---

## §14. Unconfirmed items

Each needs reading on the account (Appendix B), a provider's answer, or counsel. None is assumed away above.

1. **Whether Vercel's runtime-log record stores the client IP**, or only matches it at query time. Three Vercel pages imply that Vercel holds it (V4, V5); none lists it as a log field.
2. **Retention and storage region of Vercel's firewall data** (traffic, events, WAF log actions) (V2).
3. **Scope and retention of Vercel's service-generated data**, and which records Vercel treats as its own rather than DataStrata's (V10). For counsel (DG-5).
4. **Storage region of Vercel's runtime logs, observability events, build logs and deployment metadata.** Only the primary processing location (the United States) is stated.
5. **Where Vercel runs builds.** No page found; the build-infrastructure page answered 404.
6. **Whether a build log is deleted with its deployment** ("stored indefinitely for each deployment").
7. **How long Vercel keeps the IP addresses it collects for its own purposes** when IP visibility is turned off (V5).
8. **The storage period of rate-limit counters, and whether firewall rules apply to previews** (plan §10).
9. **Whether Observability Plus will be on for DataStrata's team** (on by default for new Pro teams): this sets 1 or 30 days. Your setting at B-5.
10. **Retention of Vercel Authentication's access requests, and its cookie's lifetime** (V9). What Vercel's own login page stores about a visitor sent to it.
11. **Which Vercel sub-processor holds which record**, and the date of the sub-processor list (none shown).
12. **GitHub:** the region of hosted runners and of the cache; this repository's actual log-retention setting.
13. **GoDaddy:** whether its nameservers log queries, and for how long; where the zone is served from; account-data periods.
14. **The domain's top-level domain (DG-3)**, and so the registry and its registrant-data rules (ICANN's policy for generic domains, the registry's own for a country-code domain such as `.de`); whether the registrant is the entity or a person.
15. **The uptime monitor (DG-13):** provider, data locations, retention, DPA, sub-processors, and the free tier's commercial-use terms.
16. **The mailbox provider (DG-4):** under option A, the provider of the address you already run, which the privacy notice must name; under option B, which provider. In both cases, its data locations and its mail-log terms.
17. **Whether the DP1 checker links sources after Tasks 4 to 6, and to which hosts** (four today).
18. **Whether Next.js telemetry runs in the host's builds by default**, where it is sent, and whether the build machine's address is kept (no visitor data either way).
19. **The certificate authority Vercel uses for the domain** (a lead from R4, not read today).
20. **The Data Privacy Framework listings** of Vercel, GitHub and GoDaddy, which rest on the providers' own statements; the DPF list itself was not searched. The pending appeal C-703/25 P is from the plan (DG-5).
21. **Pages read through the fetcher's summary** (§1): re-read each before a sentence of the privacy notice rests on it.
22. **How long DataStrata keeps contact correspondence** (email and calls): not set; your decision, for the privacy notice (§2, §8). The telephone provider's name, for the notice.
23. **The names of Vercel's bypass and authentication cookies** (§9): not stated on the pages read. Task 13 records what it observes.
