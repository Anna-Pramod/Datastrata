# Questionnaire and intake design: a proposal (revision 3)

> **Status: PROPOSED, revision 3, for your decisions. Nothing here is approved.** Revision 3 makes the five final corrections asked for after revision 2 (§12.2), and the review closes with it.
> **Revision 2 status line, kept for the record: PROPOSED, revision 2, for your review and Codex's.** Written 2026-10-23 against the candidate at `dc3339d` (branch `feature/opus55-subscription-migration`). Uncommitted: you commit it.
> **Revision 2** answers Codex's six findings on revision 1 (§12 gives each corrected passage). It also follows your three directions of 2026-10-23:
> - a short, plain free checker, with the technical facts taken from the company's reports afterwards;
> - launch research beyond Germany;
> - a standalone proposal built on public sources only.
> **Delivers** board rows **CHK-1** (the free checker's questions) and **PRF-12** (the full intake and its fact types). **Touches** CHK-2, CHK-3, CHK-5, CHK-8, PRF-2 to PRF-9, PRF-13, PRF-15, APP-11, APP-12, RC-4, RC-10, KNW-1, KNW-3 and KNW-9.
> **Does not** edit the pack, the board or any code, sequence or plan implementation, or run anything. People decisions P1 to P5, the eight Suggested rows and the business decisions (customer segment, launch country) stay open. §2 gives research and a recommendation, not a decision.
> **Sources:** public official texts only, read on 2026-10-23 and listed in Appendix A. A client questionnaire was also reviewed, for its topics only; that mapping is kept in confidential notes outside the repository, and nothing here depends on it.
> This is not legal advice, and nothing here is ratified (law 8; people decision P3).

## How to read this

- **§0** the summary.
- **§1** the law, verified, with every point that depends on national application marked as such.
- **§2** where to launch: the EU as a whole, a first country, the UK and others.
- **§3** how we should ask, including the rule that keeps the individual and consolidated routes separate.
- **§4** the free checker, revised to be short and plain: questions, exact stored values, "Not sure", path counts.
- **§5** after the checker: facts taken from reports, the onboarding questions, and financial periods.
- **§6** fact types, including the redesign of Q-011.
- **§7** what every unknown answer leads to.
- **§8** findings for the content track, in four kinds: confirmed defects, coverage gaps, design inconsistencies, and national-application questions.
- **§9** route coverage: which routes the checker, onboarding and extraction can settle.
- **§10** decisions for you. **§11** limits. **§12** revisions 2 and 3, finding by finding. **§13** a review guide for Codex.
- **Appendix A** sources; **Appendix B** method.

Identifiers used only in this document:

| Prefix | Meaning |
|---|---|
| C-n | A free-checker question |
| NQ-n | A new onboarding question |
| NF-n | A new fact type |
| CD / CG / DI / NA-n | A content finding: confirmed defect, coverage gap, design inconsistency, national-application question |
| QD-n | A decision for you |

Pack questions keep their IDs (Q-001 to Q-048). Revision 1's CK, QF and other numbers are mapped to the new ones in §12.

---

## §0. Summary

### What changed since revision 1

- **The free checker is short and plain.** It has 5 core questions (today 9, and 10 for a parent), at most 7 with its conditional questions, and 3 for a non-EU group. Technical facts (legal-form detail, size class, holding status, exemption conditions) move to onboarding, where they are taken from the company's annual and sustainability reports and confirmed by the customer.
- **The checker shows a hypothetical timeline instead of asking a year.** It shows one what-if column per year a financial year *starts* in (2025, 2026, 2027, 2028), so it asks no year or month. Every current rule tests only the start year, or a 1 January date, so the answers are exact for any start month (§4.2). Onboarding records real dates, with a path for short, long and irregular periods (§5.3).
- **The individual and consolidated routes stay separate everywhere.** No answer stands in for another route's fact, and Art 29a(7)'s deemed compliance is never used to skip the individual route (§3, rule R).
- **Stored values are exact.** The answer bands do not overlap, every stored value is defined and true for any figure in its band, and "Not sure" is offered and recorded on every question (§4.3, §4.4).
- **Q-011 becomes a history fact,** with its own type, a reader change in S-003, and a migration (§6.2).
- **Findings are split:** what the EU text confirms, what is a coverage gap, what conflicts with the vision's laws, and what depends on each Member State's application (§8). Qualified points stay qualified throughout.
- **Decisions are reconciled with the items they cover;** investigation is separated from authorising pack edits (§10).

### What I found

1. **The EU population.** The Commission estimates **6,753 companies** stay in scope after Omnibus I: 1,535 first-wave and 5,218 second-wave (SWD(2026) 500). Germany's own estimate is about 1,236 of them, plus about 200 third-country cases from 2028 (Bundestag committee motion 21(6)73). No official per-country breakdown was found for the other Member States.
2. **Transposition varies.**
   - Of the 27 Member States, 22 have notified measures for the CSRD. Germany, Spain, Luxembourg, the Netherlands and Portugal have notified none.
   - For Omnibus I, only Belgium, Croatia, Poland and Finland have notified any; the deadline is 19 March 2027 (EUR-Lex national transposition records, read 2026-10-23).
3. **The UK is outside the CSRD and has its own regime:**
   - Companies Act 2006, s414CA, applies climate and sustainability statements to listed companies, banks, insurers, AIM companies and companies with turnover above £500 million, each with more than 500 employees.
   - The FCA's PS26/19 moves UK-listed issuers to UK SRS on a comply-or-explain basis for periods beginning on 1 January 2027.
   - Otherwise UK SRS is voluntary.

   UK groups meet the CSRD through their EU subsidiaries, and from 2028 through Art 40a.
4. **The EEA and Switzerland.** The CSRD is not yet part of the EEA Agreement: EFTA lists the decision as a draft under consideration. Switzerland runs its own regime, not verified in this pass.
5. **The CSRD law itself** is as verified in revision 1. The financial year decides the test:
   - 2024–26: large public-interest entities with more than 500 employees;
   - 2025–26: a national option to exempt those below €450m or 1,000 employees;
   - from 2027: more than €450m net turnover **and** more than 1,000 employees;
   - from 2028: Art 40a.

   The revised ESRS (2026/1563) enter into force on 10 November 2026. The value-chain cap (2026/1560) applies from 2027.
6. **Several pack answers depend on when each Member State applies Omnibus I's changes:** the exemption for large listed subsidiaries in 2024–26, the holding option, and the right to decline value-chain requests. These are national-application questions, not settled defects (§8.4).

### What I propose

- **Launch EU-wide at the EU-level screen,** with a transposition register for all 27 Member States (KNW-9). Choose the first ratified national pack by evidence: where the first customers are, how many companies, how settled the law is, and whose expert can ratify (P3). CBAM stays the agreed second pack (KNW-8); a UK pack is proposed only as a Suggested row (GTD-17), after CBAM unless you change that order (§2.5).
- **The checker of §4,** the onboarding and extraction of §5, and the fact types of §6:
  - no new fact type now (§6.1); one existing fact wired to a question;
  - two fact types replaced through content changes;
  - four added only with their content changes;
  - three national-law facts moved to the shared side;
  - one legal-form value retired;
  - German and UK facts deferred.

  Nothing is added that no rule reads (law 16).

### What I need from you

Decisions QD-1 to QD-13 in §10. QD-9 of revision 1 is settled by your instruction.

---

## §1. The law, verified

All dates and article references were read in the official texts on 2026-10-23 (Appendix A). Where an answer depends on how or when a Member State applies a provision, the text says so and §8.4 lists it.

### 1.1 The instruments and their status

| Instrument | What it does for scope | Status on 2026-10-23 | Dates that matter |
|---|---|---|---|
| Directive 2013/34/EU, the Accounting Directive (consolidated text of 18.03.2026, a documentation tool) | Hosts Art 19a, 29a and 40a; definitions (Art 2); size categories (Art 3) | In force | — |
| Directive (EU) 2022/2464, the CSRD (OJ L 322, 16.12.2022) | Art 5(2) sets first application by financial year | In force | Transposition was due 6.7.2024 |
| Directive (EU) 2025/794, "stop-the-clock" (OJ L 2025/794, 16.4.2025) | Second wave from financial years starting 2027 | In force since 17.4.2025 | Transposition was due 31.12.2025 |
| Directive (EU) 2026/470, Omnibus I (OJ L 2026/470, 26.2.2026) | New thresholds; first wave limited to 2024–26; the 2025–26 national option; value-chain cap; Art 40a thresholds; holding options; removes listed SMEs | In force since 18.3.2026 (Art 6) | Transposition of the CSRD parts due **19.3.2027** (Art 5(1)). The Directive gives no separate application date for some of its changes (§8.4) |
| Delegated Regulation (EU) 2023/2772 (ESRS), as last amended by (EU) 2025/1416 | The standards up to 2026 | In force | — |
| Delegated Regulation (EU) 2026/1563 (OJ L 2026/1563, 21.9.2026) | The revised ESRS | **Enters into force 10.11.2026** (Art 3) | Applies from financial years starting 1.1.2027; for 2026, a choice of three versions (Art 2) |
| Delegated Regulation (EU) 2026/1560 (OJ L 2026/1560, 21.9.2026) | The voluntary standard; the value-chain cap is its Annex II | In force since 24.9.2026 | The cap (Art 3) applies from financial years starting 1.1.2027 (Art 4) |
| Regulation (EU) 2020/852, Art 8; Delegated Regulation (EU) 2026/73 | Taxonomy disclosures follow the Art 19a or 29a duty; simplified templates | In force; 2026/73 applies from 1.1.2026, with the old versions allowed for 2025 | — |
| Commission Notice C/2024/6792, the CSRD FAQs | Interpretation, written before Omnibus I | Guidance, not law | — |

### 1.2 The scope tests, by the year a financial year starts

| Start year | Individual (Art 19a) | Consolidated (Art 29a) | Source |
|---|---|---|---|
| 2024–2026 | A large undertaking (Art 3(4)) that is a public-interest entity (Art 2(1)) and exceeds 500 average employees on its balance sheet date | A public-interest-entity parent of a large group (Art 3(7)) exceeding 500 average employees, consolidated | CSRD Art 5(2), first subparagraph, point (a), as limited by 2026/470 Art 3(1)(a)(i) |
| 2025–2026 | Member States **may** exempt first-wave undertakings not exceeding €450m net turnover **or** 1,000 employees. The option is national | The same, "on a consolidated basis where applicable" | CSRD Art 5(2), subparagraph added by 2026/470 Art 3(1)(c); recitals 31 and 33 |
| From 2027 | Net turnover above €450m **and** more than 1,000 average employees, on the balance sheet date | The group, consolidated: above €450m and more than 1,000 | Art 19a(1), 29a(1) as replaced by 2026/470 Art 2(4)(a), (5)(a); CSRD Art 5(2)(b), dated 2027 by 2025/794 |
| From 2028 | Art 40a: an EU subsidiary above €200m net turnover in the preceding year, or failing that an EU branch above €200m, of a third-country undertaking whose EU net turnover exceeded €450m in each of the last two consecutive years | — | Art 40a(1) as amended by 2026/470 Art 2(13); CSRD Art 5(2), second subparagraph |
| Issuers | The same windows and thresholds under the Transparency Directive, which reaches non-EU issuers whose securities are on an EU regulated market | | CSRD Art 5(2), third subparagraph; Directive 2004/109/EC Art 4(5), 23(4); FAQ C/2024/6792 Q89 |

Further rules the questions depend on:

- **Banks and insurers** are covered whatever their legal form, subject to the same thresholds (Art 1(3) as amended).
- **Excluded:** the EFSF, alternative investment funds and UCITS (Art 1(4); Regulation (EU) 2019/2088 Art 2(12), points (b) and (f)).
- **Listed SMEs are out of scope:** CSRD Art 5(2), point (c), and Art 29c (the standards for listed SMEs) are deleted.
- **Deemed compliance:** a parent that complies with Art 29a(1) to (5) "shall be deemed to have complied with" Art 19a (Art 29a(7)). This is about discharging the individual duty, not about whether it exists. It needs the consolidated reporting to be in place, so it never removes the individual route from the assessment (§3, rule R).
- **New options added by 2026/470:** leaving out undertakings acquired, merged or leaving the group (Art 29a(4a)); the financial-holding option (Art 29a(7a), and its Art 40a twin); and the subsidiary exemption opened to all public-interest entities (Art 19a(10), 29a(9) as replaced). The original text excluded large listed EU companies from the exemption. **When each Member State applies these changes is a national question:** 2026/470 sets a transposition deadline, not an application date for each provision (§8.4, NA-1 and NA-2).
- **Value chain.** A protected undertaking has at most 1,000 average employees in the preceding year. It may decline CSRD-purpose requests beyond the voluntary standard (Art 19a(3), 29a(3) as amended). The cap's content applies from 2027, by a directly applicable regulation (2026/1560 Art 4). The right to decline binds companies only through national law, which is a national question (NA-3).

### 1.3 The definitions the questions depend on

- **Net turnover** (Art 2(5)): special definitions apply for insurers and credit institutions; Art 40a undertakings use their own framework's revenue.
- **Average number of employees:** EU law sets no counting method; national rules apply (FAQ C/2024/6792; recital 7 of 2026/470). Germany: the average of four quarter-end counts, excluding apprentices (§ 267(5) HGB). The UK, for its own regime: a monthly average (s414CA(5) CA 2006).
- **"On their balance sheet dates":** figures for a year that has not closed are estimates.
- **Two consecutive years:** Art 3(10) applies to the Art 3 size categories, so it matters for "large" in 2024–26. It does not attach to the €450m and 1,000 tests at EU level; national law may add it (NA-5).
- **Short and long years:** EU law gives no annualisation rule for these tests. Some national regimes do: the UK proportionately adjusts turnover (s414CA(2B)), and Germany's size classes use turnover over the twelve months before the balance sheet date (§ 267(1)–(3) HGB). Both are national (NA-5).
- **Currency:** EU law converts only the Art 3 thresholds (Art 3(9)); the €450m and €200m tests have no EU conversion rule (NA-5).
- **Public-interest entity** (Art 2(1)): (a) listed on an EU regulated market and governed by a Member State's law; (b) a credit institution; (c) an insurer; (d) designated by a Member State.

### 1.4 What is enacted, and what is only proposed

- **Enacted and applying:** the instruments of §1.1, except the next two items.
- **Enacted, not yet in force:** 2026/1563, from 10.11.2026.
- **Enacted, applying only through national law:** 2026/470's amendments to the Accounting Directive. Each Member State's application of them is tracked in §2.1 and §8.4.
- **Proposals:** Germany's bill and committee motion (§2.2). At EU level, a search of official domains found no pending proposal to change the CSRD scope again; that shows only that none turned up, not that none exists. The Commission's review reports are due by 30.4.2029 and 30.4.2031.
- **Superseded:** COM(2025) 81, replaced by 2026/470.

---

## §2. Where to launch: the EU as a whole, a first country, the UK and others

### 2.1 The EU as a whole

- **Population:** about 6,753 companies remain in scope: 1,535 first-wave and 5,218 second-wave (SWD(2026) 500, §2.3.1). Their suppliers with up to 1,000 employees are protected by the value-chain cap; that larger group is not counted here.
- **Transposition:** measures notified to the Commission, as recorded by EUR-Lex on 2026-10-23. The record is updated weekly. A count shows that measures exist, not that a transposition is complete; the Member States are responsible for the data.

| Member State | CSRD (2022/2464) | Stop-the-clock (2025/794) | Omnibus I (2026/470) |
|---|---|---|---|
| Austria | 1 | 1 | 0 |
| Belgium | 3 | 1 | 1 |
| Bulgaria | 2 | 1 | 0 |
| Croatia | 9 | 2 | 2 |
| Cyprus | 3 | 2 | 0 |
| Czechia | 18 | **0** | 0 |
| Denmark | 2 | 2 | 0 |
| Estonia | 9 | 1 | 0 |
| Finland | 8 | 1 | 2 |
| France | 3 | 1 | 0 |
| **Germany** | **0** | **0** | 0 |
| Greece | 2 | 1 | 0 |
| Hungary | 14 | 5 | 0 |
| Ireland | 2 | 2 | 0 |
| Italy | 1 | 1 | 0 |
| Latvia | 12 | 2 | 0 |
| Lithuania | 11 | 3 | 0 |
| **Luxembourg** | **0** | **0** | 0 |
| Malta | 2 | 1 | 0 |
| **Netherlands** | **0** | **0** | 0 |
| Poland | 4 | 2 | 1 |
| **Portugal** | **0** | **0** | 0 |
| Romania | 18 | 7 | 0 |
| Slovakia | 7 | 2 | 0 |
| Slovenia | 3 | 1 | 0 |
| **Spain** | **0** | **0** | 0 |
| Sweden | 24 | 3 | 0 |

### 2.2 Germany

Germany's own figures put its population at about a fifth of the Commission's EU total. No comparable official figure was found for other Member States:

- about 160 first-wave companies for 2025;
- about 1,076 more for 2027;
- about 200 third-country cases from 2028 (committee motion 21(6)73, explanatory statement).

It has transposed neither the CSRD nor stop-the-clock:

- DIP shows government bill 21/1857 still in committee ("Überwiesen"; last step 6.11.2025).
- § 289b HGB still carries the 2014 non-financial-statement wording.

The coalition's committee motion of 30.3.2026, a proposal, would:

- apply the CSRD for financial years 2025–26, then Omnibus I from 1.1.2027 (its Articles 2 and 4);
- set the new thresholds with § 267(4)–(5) HGB "entsprechend", that is, Germany's two-consecutive-years rule and counting method;
- keep, in its Article 1, the carve-out that excludes capital-market-oriented large companies from the subsidiary exemption, and delete it from 1.1.2027;
- relieve, for years before 2027, companies at or below **both** 1,000 employees and €450m. That is narrower than the EU option's "or".

### 2.3 The United Kingdom: outside the CSRD, with a regime of the same shape

- **Companies Act 2006, s414CA** (legislation.gov.uk states the section is up to date to 23.10.2026). The strategic report must include a non-financial and sustainability information statement for:
  - traded, banking, insurance, insurance-market and AIM companies;
  - "high turnover" companies, above £500m, measured at group level for a parent.

  It does not apply to small and medium companies, nor where the company or group has **500 employees or fewer**. Employees are a monthly average, aggregated across a group. A subsidiary covered by a qualifying group strategic report is exempt. Turnover is proportionately adjusted for a year that is not twelve months long.
- **FCA PS26/19 (September 2026).** UK-listed issuers report against UK SRS S2 and S1 on a comply-or-explain basis. It covers the commercial-companies, transition and non-equity categories, and also secondary listings and depositary receipts. It replaces the TCFD-aligned rules for accounting periods beginning on 1 January 2027, with first reports in 2028. Scope 3 has a one-year relief and S1 a two-year relief.
- **UK SRS S1 and S2** are final and available for voluntary use. gov.uk records no decision yet on mandatory use for other companies (last updated 25.2.2026).
- **For DataStrata:** UK groups are a CSRD audience through their EU subsidiaries, and from 2028 through Art 40a, all handled by the EU screen. A UK *domestic* pack (s414CA and the FCA rules) would be a separate regime. Its tests (employees, turnover, listing, groups, subsidiary exemption, short-year adjustment) fit the same engine and the same question pattern.

### 2.4 The EEA and Switzerland

- **The EEA:** EFTA's factsheet lists the CSRD's incorporation as a draft Joint Committee Decision still under consideration (sent 9.10.2024). The CSRD is therefore not yet EEA law. National rules in Norway, Iceland and Liechtenstein were not researched.
- **Switzerland:** its own non-financial reporting regime is under revision. It was not verified in this pass, so nothing here relies on it.

### 2.5 Recommendation (for your decision; business decision E6 item 2 stays yours)

| Option | For | Against |
|---|---|---|
| **A. EU-wide at the EU-level screen**, with a 27-country transposition register (KNW-9) | The largest market (about 6,753 reporters plus their suppliers). Groups span Member States. The engine already works at EU level. Results must say "national-law status requires review" anyway until a national pack is ratified (law 6, P3), so going EU-wide costs no accuracy | No final ("Supported") answers anywhere until a first national pack is ratified. The register must be kept current for 27 Member States: EUR-Lex records first, then national gazettes |
| B. One country first | Depth, one language, one national pack | One country is a fraction of the market (Germany's own figures are about a fifth of the EU total). National law is moving (Germany is not enacted). Multinational groups need several Member States anyway |
| C. The UK first | Law in force and stable; English; one regime | It is not the CSRD (CSRD first is settled). Less uncertainty means less need for change-tracking. A new pack is needed before anything works |

**Recommended: A.** For the first ratified national pack, choose by evidence:

- **Germany** has a strong case on size (its own figures) and on need, because its law is not yet enacted.
- **France** has the strongest case on settled law (CSRD and stop-the-clock measures notified).
- Decide by where the first paying customers are, and by which country's legal expert you can engage (P3).

**CBAM stays the agreed second pack** (KNW-8). A UK domestic pack enters the board only as a Suggested row (GTD-17, If approved), ordered after CBAM unless you change that order. Keep the EEA and Switzerland on watch only.

---

## §3. How we should ask

| # | Principle | Evidence |
|---|---|---|
| R | **Routes stay separate.** The individual duty (Art 19a), the consolidated duty (Art 29a), the two exemptions, Art 40a, the issuer route and the value chain are each evaluated and shown on their own line. A group figure never stands in for an entity figure, nor the reverse. Art 29a(7)'s deemed compliance is shown as an explanation once the parent's consolidated reporting is confirmed; it never removes the individual route. An unasked route is shown as "not checked", never dropped | Art 19a, 29a(1), 29a(7); Codex finding 1; P-003 (obligations not duplicated) |
| P-a | Ask for facts, not legal conclusions. Statuses a company is routinely told by its auditor or registry, such as public-interest status, may be asked plainly, with examples and "Not sure" | Laws 2 and 4 |
| P-b | Keep the first check short and plain. Ask only what the visitor knows without documents; take the rest from the reports after registration | Your direction of 2026-10-23; GOV.UK "Question pages" (one question per page; know why you ask; only what you need); PRF-14 |
| P-c | Answer bands sit at the legal thresholds and never overlap; their stored values are exact (§4.3). A labelled band near each threshold catches uncertainty. Nothing is preselected | Juster and Smith (RAND DRU-988): bands cut non-response; Hurd (NBER t0219): the first band anchors answers |
| P-d | "Not sure" on every question, stored as an explicit unknown. It yields "cannot decide yet" with its reason and a next step | Laws 3 and 13; PRF-6; APP-11; `types.ts:70`; `facts.ts:88` |
| P-e | Ask a question only where its answer can change a result for a year shown | Law 16 |
| P-f | Never ask twice: checker answers seed the profile (CHK-5); extraction proposes facts rather than retyping them (PRF-4) | GOV.UK |
| P-g | National law is not a customer question; it lives in the country pack and the transposition register | Laws 1, 4 and 6; KNW-3, KNW-9 |
| P-h | Label estimates; replace them with actuals at the yearly refresh | §1.3; PRF-8 |

---

## §4. The free checker, revised (CHK-1)

### 4.1 The questions

| C | Shown when | Asked (plain wording) | Answers | Facts set | Why the law needs it |
|---|---|---|---|---|---|
| C-1 | Always | "Where is your company registered?" | EU Member States · other countries · Another country · Not sure | `entity.incorporation_country` | Art 1(1), 2(1)(a); Art 40a |
| C-2 | Always | "Is your company part of a group?" | No · Yes, we are the parent (top) company · Yes, another company owns us · Yes, we own companies and another company owns us · Not sure | `entity.is_parent_undertaking`, `entity.is_subsidiary` | Art 2(9)–(11); Art 29a; Art 19a(9), 29a(8) |
| C-3 | C-1 is an EU Member State | "What kind of organisation is it?" | Private limited company (e.g. GmbH, SARL, SAS, BV, Ltd) · Public limited company (e.g. AG, SE, SA, NV, plc) · Bank · Insurer · Investment fund (UCITS or alternative investment fund) · Something else (cooperative, foundation, partnership, public body …) · Not sure | `entity.legal_form`: `private_limited_company`, `public_limited_company`, `credit_institution`, `insurance_undertaking` or `other`. `entity.excluded_by_article_1_4`: true for the fund; false for every other kind, each labelled "not an investment fund"; unknown for "Not sure" | Art 1(1) with Annexes I and II; Art 1(3); Art 1(4) |
| C-4 | As C-3 | No group, or owned: "About how many people work for your company?" Parent: "… across the whole group?" Both: "… in your company and the companies it owns?" Hint: the average for the year, as your accounts state it | The bands of §4.3 · type the number · Not sure | Parent or both: `group.avg_employees`. Otherwise: `entity.avg_employees` | CSRD Art 5(2)(a): 500 for 2024–26; Art 19a(1), 29a(1): 1,000 |
| C-5 | As C-3 | Turnover, scoped exactly as C-4. Hint: revenue after rebates and VAT; banks and insurers, we'll confirm the right figure later | The bands of §4.3 · type the figure · Not sure | Parent or both: `group.consolidated_net_turnover_eur`. Otherwise: `entity.net_turnover_eur` | Art 19a(1), 29a(1); CSRD Art 5(2)(b) and the 2025–26 option; Art 2(5) |
| C-6 | An EU country; not a fund; C-4 is not "450 or fewer" | "Is your company a public-interest entity? That means its shares or bonds are admitted to trading on an EU regulated market (growth markets and other multilateral trading facilities do not count), it is a bank or an insurer, or its country has designated it a public-interest entity. Your auditor will know." For a parent: "… the parent company …" | Yes · No · Not sure | `entity.is_public_interest_entity` | CSRD Art 5(2)(a): the 2024–26 first wave |
| C-7 | Owned, or both; and the company's or its sub-group's figures could exceed both thresholds for a year shown | "Does your parent company publish a group sustainability report that includes your company?" | Yes · No · Not sure | `parent.report_includes_entity` | Art 19a(9), 29a(8). The other conditions are confirmed in onboarding: Q-043, Q-044, Q-047, Q-048 |
| C-8 | A non-EU country: a listed one, or one typed under "Another country". Every EU Member State is listed, so a typed country is non-EU; an uncatalogued code still reads `catalogue_unknown` until it is added | "Has your group's turnover from the EU been more than €450 million in each of the last two financial years?" | Yes, both years · Only the most recent year · Only the year before · No · Not sure | `third_country.eu_turnover_year_1_eur` (the most recent year), `_year_2_eur` (the year before), mapped per §4.3. For "no group" or "parent", also `group.ultimate_parent_country` | Art 40a(1), fifth subparagraph; from 2028 |
| C-9 | *Optional*, offered on the result for a parent or both: "Check the parent company on its own too" | "How many people does the parent company itself employ?" | As C-4 | `entity.avg_employees` | Art 19a(1); CSRD Art 5(2)(a) |
| C-10 | As C-9 | "And the parent company's own turnover?" | As C-5 | `entity.net_turnover_eur` | Art 19a(1) |

**Asked only after a content change:**

- **C-11**, for non-EU countries: "Does your group have a company or branch in the EU?" It sets NF-5 and depends on CG-3.
- **C-12**, for non-EU countries: "Are any of your group's shares or bonds admitted to trading on an EU regulated market?" Hint: growth markets and other multilateral trading facilities do not count. It sets NF-2 and depends on CG-1.
- **C-13 to C-15**, the supplier path: only if QD-2 is yes.

**What moves out of the checker, and where it goes:**

| Removed from the checker | Now |
|---|---|
| The year selector | The start-year timeline (§4.2); real dates in onboarding (Q-004) |
| Governing Member State | Onboarding Q-012. The result names the country of registration, with a note |
| Large-undertaking and large-group status | Onboarding Q-041 and Q-042, or the size class stated in the notes to the accounts |
| Financial-holding status | Onboarding Q-045 and Q-046 |
| FY2024 reporting history | Onboarding, redesigned (§6.2) |
| The separate fund-exclusion question | Folded into C-3 |

### 4.2 What the checker shows: a timeline by start year

- **Columns:** the four start years 2025, 2026, 2027 and 2028, each read as "financial years that start in" that year.
- **Rows:** one per route that applies to the visitor (rule R):
  - an EU company with no group: the individual duty;
  - a parent: the consolidated duty, and the parent company on its own (shown "not checked" unless C-9 and C-10 are answered);
  - a subsidiary: its own duty, and the exemption through its parent;
  - a non-EU group: Art 40a, with the note that issuer routes are not yet covered;
  - every EU result: a national line reading "national-law status requires review" (law 6).
- **Exact for any start month.** The checker runs the engine once per start year, with the period's start set to 1 January of that year. Every period test in the pack reads only the start year or compares the start date with a 1 January date:
  - `fy_start_year_in` and `fy_starts_on_or_after "2027-01-01"` in S-004, S-012, S-017, S-018 and S-022;
  - `year_diff_lt` in S-016;
  - the period end is never read by a condition (`backend/engine/src/condition/evaluate.ts:141`, `:289`).

  So the result is the same for any month the year starts. The stored run records "start-year basis", never invented dates. **Guard:** a test that fails if any rule tests a date other than 1 January, or reads the period's end. Its teeth check changes one rule's date to 1 July and must see the guard fail.
- **Hypothetical, and labelled so.** Every column uses the same answers, so the timeline is a what-if: never a forecast, and never a determination for a year that has not happened. Each column is headed "If your size stays about the same", and the stored run records the answers as a hypothetical projection. Figures for years not yet closed are estimates, and the result says so (QD-7, QD-13).
- **Unresolved routes** show their plain reason and the one step that would settle it (APP-11). The headline per route uses the first-application result (S-017, S-018), which the checker can settle. The duty after exemptions (S-020, S-021) lists its open conditions.

### 4.3 Stored values: exact, non-overlapping ranges

Engine ranges are inclusive `[min, max]` (`types.ts:64`); "exceed" is true when `min > threshold` and false when `max ≤ threshold` (`evaluate.ts:102-106`).

**How a band is stored.** Each answer band is a half-open interval (the "Meaning" column), so the bands neither overlap nor leave gaps, at any precision. Its stored engine range is chosen so that it is *true* of every figure in the band and gives exactly the band's result against every threshold.

- **Money** is reported in whole cents at most. So a band after the first starts one cent above the previous band's top. That is exact for every amount that can be reported, including at the €450m threshold.
- **Headcount** can be an average with any number of decimals (a quarterly average, or annual work units). So its stored range is the band's closed range: "more than 450, up to 550" is stored as 450 to 550, which is true of every figure in the band.
  - Neighbouring headcount ranges then share one end point, which is never a legal threshold: 500 and 1,000 sit at least 50 away from every boundary.
  - The shared point therefore cannot change a result. The engine compares only a range's ends with the threshold (`evaluate.ts:102-118`), and both ends lie on the same side of every threshold as the band itself does.
  - A guard test fails if any headcount threshold in the pack ever equals a band boundary.
- **A typed figure** is stored exactly as entered, never rounded.

The upper limit `9007199254740991` (the largest exact integer the engine's number type holds) stands for "no upper bound stated". It is true of every company.

**Average employees** (thresholds: more than 500 for 2024–26; more than 1,000)

| Shown | Meaning | Stored | Exceeds 500 | Exceeds 1,000 |
|---|---|---|---|---|
| 450 or fewer | 0 ≤ x ≤ 450 | `{range, 0, 450}` | No | No |
| More than 450, up to 550 (about 500) | 450 < x ≤ 550 | `{range, 450, 550}` | Cannot tell | No |
| More than 550, up to 900 | 550 < x ≤ 900 | `{range, 550, 900}` | Yes | No |
| More than 900, up to 1,100 (about 1,000) | 900 < x ≤ 1,100 | `{range, 900, 1100}` | Yes | Cannot tell |
| More than 1,100 | x > 1,100 | `{range, 1100, 9007199254740991}` | Yes | Yes |
| Typed number | as entered | `{number, x}` | Exact | Exact |
| Not sure | — | `{unknown}` | Missing | Missing |

**Net turnover, EUR** (threshold: more than €450m)

| Shown | Meaning | Stored | Exceeds €450m |
|---|---|---|---|
| Up to €400 million | 0 ≤ x ≤ 400,000,000 | `{range, 0, 400000000}` | No |
| More than €400m, up to €500m (about €450m) | 400,000,000 < x ≤ 500,000,000 | `{range, 400000000.01, 500000000}` | Cannot tell |
| More than €500 million | x > 500,000,000 | `{range, 500000000.01, 9007199254740991}` | Yes |
| Typed figure | as entered | `{number, x}` | Exact |
| Not sure | — | `{unknown}` | Missing |

**EU turnover for Art 40a** (threshold: more than €450m in *each* of two years)

| Answer | Year 1 (most recent) | Year 2 (the year before) | Gate |
|---|---|---|---|
| Yes, both years | `{range, 450000000.01, 9007199254740991}` | same | Met |
| Only the most recent year | over, as above | `{range, 0, 450000000}` | Not met |
| Only the year before | `{range, 0, 450000000}` | over | Not met |
| No | `{range, 0, 450000000}` | same | Not met |
| Not sure | `{unknown}` | `{unknown}` | Missing |

Revision 1 asked "In one year only" without saying which year, which forced an invented assignment. The two "only" answers remove that.

### 4.4 "Not sure", on every question

Every question offers "Not sure". The answer is stored as `{ kind: 'unknown' }` with the question, the time and the respondent (CHK-8). A question never shown stores nothing, so "asked, unknown" and "never asked" stay distinct (PRF-6). The evaluator treats an unknown exactly like a missing fact (`facts.ts:88`): the route reads "cannot decide yet", with the fact type's reason.

| Question | Routes left open | The visitor sees | Next step |
|---|---|---|---|
| C-1 | Every route. The checker stops after C-1 and C-2 | "We need the country where your company is registered" | Onboarding, or a company-register extract |
| C-2 | The consolidated route and both exemptions. The individual route is assessed with the company's own figures | "Group position unknown: we checked your company on its own" | A group chart, or the list of shareholdings in the notes |
| C-3 | The individual and consolidated size routes | "We need the kind of organisation" | Articles of association, or the register extract |
| C-4 or C-5 | Those size routes, in every year | "We need your headcount" or "your turnover" | The notes or the income statement, taken from your report (§5.1) |
| C-6 | The 2025 and 2026 columns of the first-wave route | "Ask your auditor whether you are a public-interest entity" | The auditor's report (§5.1) |
| C-7 | Both exemptions | "We'll check your parent's group report" | Link or upload the parent's report |
| C-8 | Art 40a | "We need your EU turnover for two years" | The segment note (geographic revenue) |
| C-9 or C-10 | The parent company's own route | "Parent company on its own: not checked" | As C-4 and C-5 |

### 4.5 How many questions each visitor answers

| Visitor | Core | Conditional | Optional | Total | Today |
|---|---|---|---|---|---|
| EU company, no group | C-1–C-5 | C-6 if more than 450 employees, or unsure | — | **5–6** | 9 |
| EU parent | C-1–C-5 | C-6 | C-9, C-10 | **5–6** (+2) | 10 |
| EU subsidiary | C-1–C-5 | C-6; C-7 | — | **5–7** | 9 |
| EU intermediate parent (owns and is owned) | C-1–C-5 | C-6; C-7 | C-9, C-10 | **5–7** (+2) | 10 |
| EU, group position "Not sure" | C-1–C-5 | C-6 | — | **5–6** | 9 |
| Non-EU company or group | C-1, C-2, C-8 | C-11, C-12 only after their content changes | — | **3** (5) | 9–10 |
| Country "Not sure" | C-1, C-2 | — | — | **2** | — |
| Supplier path (only if QD-2 is yes) | — | C-13–C-15 | — | **+3** | — |

### 4.6 Golden profiles the checker should be covered by

These are behaviours to encode later through the content procedure, not code now:

1. Each band of §4.3 against each threshold: the "cannot tell" bands give "cannot decide yet" with the exact figure ranked first.
2. A parent whose group exceeds both thresholds while the parent itself is small. The consolidated route applies; the parent's own route shows "not checked" (and is settled only through C-9 and C-10); nothing is copied between routes.
3. An intermediate parent with all four routes shown.
4. The start-year guard of §4.2.
5. A fund: "does not apply" through Art 1(4).
6. A bank in a legal form outside Annexes I and II, above both thresholds in 2027: in scope through Art 1(3).
7. An unknown on each question, giving the result of §4.4.

---

## §5. After the checker: reports, onboarding and periods

### 5.1 Facts taken from the company's reports (PRF-2, PRF-4, PRF-13)

After registration, the customer links or uploads its reports. Extraction proposes each fact with its page and passage, and the customer confirms it; threshold-critical facts are confirmed one at a time (PRF-15). Extraction runs only with the company's AI setting switched on (law 20), on Qwen only after its evaluation (CNF-7). Otherwise facts are entered by hand. PRF-13 can fetch the public annual report from the company's website.

| Fact | Usually found in | Fills |
|---|---|---|
| `entity.legal_form`; registered office; governing law | Cover and general-information note; a company-register extract | Q-003, Q-012 |
| `entity.net_turnover_eur` | The company's own income statement, separate from the consolidated one | Q-007 |
| `group.consolidated_net_turnover_eur` | The consolidated income statement | Q-009 |
| `entity.avg_employees`, `group.avg_employees` | The notes: average number of employees, by the national method | Q-008, Q-010 |
| `entity.is_public_interest_entity` | The auditor's report (a public-interest entity audit), investor information | Q-040 |
| `entity.is_large_undertaking`, `group.is_large_group` | The size class, where the notes state it | Q-041, Q-042 |
| Group position, perimeter, ultimate and reporting parent | The notes: list of shareholdings, parent undertakings | Q-005, Q-006, Q-047 |
| `parent.report_includes_entity` and the report's standard, link, assurance and Taxonomy information | The parent's consolidated report: scope, basis of preparation, assurance report | Q-014–Q-017, Q-043 |
| `entity.exemption_disclosures_in_management_report` | The company's management report: the exemption statement | Q-044, Q-048 |
| `entity.is_financial_holding_undertaking` | The object clause; the business description. A judgment, so it goes to a case if unclear | Q-045, Q-046 |
| `history.fy2024_published_statement` (NF-6) | The 2024 report, which states the law it was prepared under | Q-011 |
| `reporting.fy2026_esrs_version` (NF-1) | The 2026 sustainability statement's basis of preparation (2026/1563 Art 2(2)) | NQ-1 |
| `reporting.value_chain_info_unavailable` | The sustainability statement's value-chain disclosures | NQ-2 |
| `third_country.eu_turnover_year_1_eur`, `_year_2_eur` | The segment note (geographic revenue) | Q-018 |

### 5.2 The onboarding questions (PRF-12)

Every one of the 48 questions falls into exactly one row:

| Change | Questions | Detail |
|---|---|---|
| **Unchanged (26)** | Q-001, Q-006, Q-012, Q-014–Q-017, Q-019, Q-020, Q-022, Q-024–Q-026, Q-028–Q-031, Q-035–Q-038, Q-043, Q-044, Q-046–Q-048 | — |
| **Help text only (2)** | Q-033, Q-034 | Q-033: the Taxonomy templates changed from 2026 (2026/73). Q-034: the limited-assurance standards are due by 1.7.2027 |
| **Reworded; same facts, same gate (9)** | Q-002, Q-005, Q-007–Q-010, Q-018, Q-039, Q-045 | Q-002: the document list of §5.1. Q-005: add "Not sure". Q-007–Q-010: the definitions, banks and insurers, counting method, currency and basis (estimate or actual). Q-018: "the third-country undertaking at group level, or individual level if it has no group". Q-039: "an investment fund (UCITS or alternative investment fund), or the EFSF". Q-045: plain words. **Q-045 and Q-046 keep their current gate: no year gate is added** (NA-2) |
| **Reworded and gated by year (3)** | Q-040, Q-041, Q-042 | Shown only for start years 2024–26. This gate is the Directive's own date (CSRD Art 5(2)(a)), not a hypothesis |
| **Reworded, with a fact-type change (2)** | Q-003, Q-011 | Q-003 loses the `listed_company` value (DI-3). Q-011 becomes a history question on a new fact (§6.2) |
| **Period redesign (1)** | Q-004 | Dates, with a standard shortcut and an irregular path (§5.3) |
| **Gate widened (1)** | Q-021 | Shown also when the duty is unresolved, not only when it does not apply |
| **Reuse an earlier answer (1)** | Q-023 | The preceding period's confirmed `entity.avg_employees` is the same fact; asked only if absent |
| **Off the customer interview (1)** | Q-013 | National law; see DI-1 and QD-5 |
| **Wire to a gap test, or retire (2)** | Q-027, Q-032 | No gap test reads their facts (QD-6) |

Totals: 26 + 2 + 9 + 3 + 2 + 1 + 1 + 1 + 1 + 2 = **48**; **22** change.

**New onboarding questions:**

| NQ | Status | Asks | Fact |
|---|---|---|---|
| NQ-2 | **Active now**: S-016 already reads the fact | "Is any value-chain information this report needs unavailable?" Shown in the first three reporting years when a duty applies | `reporting.value_chain_info_unavailable` (add `missingReason: missing_fact`) |
| NQ-1 | After CD-1's content change | "For financial year 2026, which ESRS will you apply?" The 2023 set as amended in 2025 · the 2023 set with the 2026 reliefs · the revised ESRS · not decided. Asked from 10.11.2026 | NF-1 |
| NQ-3 | After NA-1 or CG-1's change | "Are the company's shares or bonds admitted to trading on an EU regulated market?" Hint: growth markets and other multilateral trading facilities do not count | NF-2 |
| NQ-4 | After CG-3's change | "Does the group have a company or branch in the EU?" | NF-5 |
| NQ-5 | After CD-2's change, and NA-3's resolution | The requester's financial year the request serves, and the requester's country | NF-3, NF-4 |

### 5.3 Financial periods: the standard shortcut, exact dates, irregular periods and unknowns

- **Standard shortcut:** "Our financial year is the calendar year", or "12 months starting on [day] [month]". Twelve-month periods are generated from it, and 52- and 53-week periods count as standard.
- **Exact dates:** start and end dates for any period. This covers a first year, a short or extended year, a change of year-end, and periods whose start and end fall in different windows. Two periods starting in the same year (for example a short January–June year followed by July–June) are both assessed under that year's rules.
- **Irregular period** means a length other than twelve months.
  - The tests use the period's figures as reported; EU law has no annualisation rule for them.
  - National rules may differ: the UK adjusts turnover proportionately (s414CA(2B)); Germany's size classes use twelve months' turnover (§ 267(1)–(3) HGB).
  - A short period below a threshold, or a long period above one, therefore reads "requires review (national rule on short or long years)". Annualising would raise a short year's figure or lower a long year's.
  - The engine cannot see period length today (CG-4).
- **Preceding-year tests** (Art 40a's subsidiary and branch; the value-chain protection; Art 40a's "two consecutive years") use the period immediately before, whatever its length. A company with no preceding period reads "requires review", never "met" or "not met".
- **Groups:** the consolidated tests use the parent's balance sheet date (Art 3(7)); subsidiaries keep their own periods.
- **Unknown dates:** onboarding falls back to the checker's start-year basis, labelled "dates to confirm". Dates are then a missing fact for deadlines, which depend on national calendars.
- **Open and future periods:** figures are estimates (QD-7).

---

## §6. Fact types (PRF-12)

There are 62 fact types today. Each row below says how it meets PRF-12's acceptance: an active purpose, a missing reason, and golden coverage.

### 6.1 Added now

None. Every fact a current rule reads already exists. The one fact a rule reads but nobody asks for is wired instead (§6.3).

### 6.2 Replaced through content changes

| From | To | Why | Reader change | Migration |
|---|---|---|---|---|
| `entity.early_adoption_revised_esrs`, boolean (`fact-types.json:50`) | **NF-1** `reporting.fy2026_esrs_version`: enum `ESRS_2023_AS_AMENDED_2025`, `ESRS_2023_WITH_2026_RELIEFS`, `ESRS_REVISED_2026`; unknown allowed | 2026/1563 Art 2 allows three versions for 2026; a boolean holds two | S-012 gains a case for each version for start year 2026. Unknown means "the report must state its version" (Art 2(2)), never a silent 2023 set | No stored values exist; NQ-1 asks it fresh |
| `entity.reported_csrd_fy2024`, boolean (`fact-types.json:22`) | **NF-6** `history.fy2024_published_statement`: enum `mandatory_csrd_statement` (a sustainability statement under national law implementing the CSRD), `mandatory_non_financial_statement` (a non-financial statement under the earlier rules, in any framework, ESRS included), `voluntary_only`, `none`; unknown allowed; source: the published 2024 report, which states its legal basis; reviewed once | The old fact asks for a legal conclusion ("required to report under CSRD"), which has no clean answer where the CSRD was not transposed. The new one records what was *published* and on what stated legal basis, which can be checked from the report. A German first-wave company that used the ESRS inside its § 289b HGB statement answers `mandatory_non_financial_statement` | S-003 reads it. APPLIES for either mandatory value: the first-wave population under the CSRD or under the earlier rules. DOES_NOT_APPLY for `voluntary_only` or `none`. Unknown stays unresolved. S-003 remains informational: no rule references it, and a test must keep it so | `true` and `false` both migrate to unknown and are asked again. `true` cannot tell which mandatory basis applied; `false` meant "not required under CSRD", which says nothing about what was published. Golden P-010 moves to one of the two mandatory values, with unchanged expectations. The checker stops asking it (`checker.ts:223-227`, `:386-388`) |

The redesigned **Q-011** reads: "What did the company publish for financial year 2024, and on what basis?" The answers are: a sustainability statement required by national law implementing the CSRD · a non-financial statement required by the earlier rules, in any framework, ESRS included · a voluntary report only · none of these · Not sure. Hint: your 2024 report says which law it was prepared under; this is history only, and it never decides whether you must report now.

### 6.3 Wired to a question

`reporting.value_chain_info_unavailable` (`fact-types.json:49`) is read by S-016 and asked by no question. NQ-2 asks it, and it gains `missingReason: missing_fact`.

### 6.4 Added only with their content changes (law 16)

| NF | Fact type | Scope and type | Purpose, once its rule exists | Missing reason |
|---|---|---|---|---|
| NF-2 | `entity.securities_admitted_eu_regulated_market` | legal entity; boolean | NA-1 (which large listed subsidiaries the carve-out affects); CG-1 (non-EU issuers) | `missing_fact` |
| NF-3 | `value_chain.request_reporting_year` | request; year | CD-2: the cap applies to requests serving years from 2027 | `missing_fact` |
| NF-4 | `value_chain.requestor_governing_member_state` | counterparty; country | NA-3: the right to decline exists under the requester's national law | `national_law_unresolved` |
| NF-5 | `third_country.eu_presence` | organization; enum: `eu_subsidiary`, `eu_branch_only`, `none` | CG-3: "none" settles Art 40a | `missing_fact` |

### 6.5 Moved to the shared side (QD-5)

| Fact type | Why it is not a company fact | Where it would live |
|---|---|---|
| `entity.member_state_transposition_status` (`fact-types.json:23`) | National law, the same for every company; no rule reads it | The transposition register (KNW-9) |
| `entity.member_state_transition_option` (`:24`) | Whether the Member State used the 2025–26 option; read by S-004 and S-022, yet law 4 lets only the customer confirm its facts | A catalogue keyed by Member State, read with `in_catalogue` on `entity.governing_member_state` (the pattern S-013 uses). No new primitive is needed |
| `entity.national_publication_conditions_met` (`:25`) | It mixes national conditions with company compliance | The conditions in the country pack; whether the company met them stays a company fact, asked once the pack defines them |

### 6.6 Retired, deferred and unchanged

- **Retired:** the value `listed_company` of `entity.legal_form` (`fact-types.json:3`; `catalogues.json`; `checker.ts:86`), because listing is public-interest status (DI-3). Its migration goes through the content procedure, with a golden showing that no determination flips unexplained.
- **Deferred to a German pack** (KNW-3; only if the committee text is enacted, and with P3):
  - prior-year turnover and headcount, individual and group;
  - formation or conversion in the period (§ 267(4) HGB);
  - capital-market orientation, which § 264d HGB also gives to a company that has applied for admission.
- **Deferred to a UK pack** (GTD-17, if approved): the s414CA facts.
- **Unchanged:** 55 of the 62. The 7 changed are the 2 replaced, the 1 wired, the 3 moved, and `entity.legal_form`'s enum.

---

## §7. What every unknown answer leads to

The coded reasons are those the engine already records (APP-11; `checker.ts:410-421`).

| Reason | Example | The customer sees | Next step | Who acts | Where it comes back |
|---|---|---|---|---|---|
| `missing_fact`, including a stored unknown | Public-interest status unknown | "We can't decide this yet: we need …" | Where to find it (§5.1); upload or link the report; invite a colleague | The customer | "Needs you"; the weekly briefing; RC-10 |
| `range_crosses_threshold` | Turnover of €400m–€500m | "Your band includes the €450m threshold" | The exact figure and its source page, confirmed on its own (PRF-15) | The customer | "Needs you"; ranked first |
| `legal_ambiguity`, or a judgment | Is this a financial holding? Is the parent's standard "equivalent"? | "This needs a judgment" | State the facts; DataStrata opens a case | A reviewer proposes; the customer confirms facts (law 4); a rule or interpretation for everyone (law 11); escalation to an expert (ADJ-7, P3) | The case list (ADJ-2) |
| `national_law_unresolved` | Any EU result; every national-application item in §8.4 | "National-law status requires review" | Nothing for the customer | DataStrata: the register (KNW-9), the country pack (KNW-3), ratification (P3) | Reassessment on publication (RC-3); a notice (RC-5) |
| `catalogue_unknown` | "Another country"; "Something else" | "We don't hold this yet" | Nothing for the customer | DataStrata, through a published catalogue change | Reassessment |
| `not_yet_effective` | The revised ESRS before 10.11.2026; the cap before 2027 | "Adopted, not yet in force" | — | — | The change centre |
| `upstream_indeterminate` | A duty unresolved because its size test is | "This depends on an earlier answer" | The named question | The customer | — |
| Irregular period, or no preceding period (§5.3) | A six-month year | "Requires review: national rule on short years" | Nothing for the customer | DataStrata (NA-5) | Reassessment |
| Estimate basis (QD-7) | 2027 figures, given in 2026 | "Based on your estimates" | Confirm actuals at year end | The customer | The yearly refresh (PRF-8) |

---

## §8. Findings for the content track

Nothing in the pack has been changed. Each item can be **investigated and drafted** in a content session if you approve QD-4. That session follows the engine's procedure (`backend/engine/CLAUDE.md`): the source record, the requirement, the fact and question, a golden including its "must not", `npm test` in a clean clone, draft status, and the legal justification in the commit message. **Each resulting pack edit needs its own approval after its draft.** QD-4 authorises no edit.

### 8.1 Confirmed against the EU text

These rest on a directly applicable regulation, or on a date the Directive itself sets.

| CD | What | Evidence | Affects |
|---|---|---|---|
| CD-1 | **Revised ESRS:** CW-001 expects "20 Nov 2026" (`pack.json:15`); the act enters into force on 10.11.2026, when `revised_esrs_in_force` (`pack.json:7`) must change. S-012 cannot hold 2026's third choice | 2026/1563 Art 2, 3 | S-012; NF-1; NQ-1 |
| CD-2 | **Voluntary standard:** `voluntary_standard_in_force: false` (`pack.json:8`) and S-011's caution are stale. 2026/1560 has been in force since 24.9.2026, and its cap applies from financial years starting 2027. S-010 and S-011 have no year gate for the cap | 2026/1560 Art 3, 4 | S-010, S-011; NF-3 |
| CD-3 | **Art 40a has no year gate:** S-007 to S-009 can read "applies" before 2028 | CSRD Art 5(2), second subparagraph (Art 1 point (14) applies from 2028) | S-007–S-009 |
| CD-4 | **Wiring:** S-012's and S-016's facts have no question; no gap test reads Q-027's or Q-032's fact | `questionnaire.json`; `gap-tests.json` | NQ-1, NQ-2; QD-6 |
| CD-5 | **The checker's code** (not the pack): the calendar-year assumption (`checker.ts:393-404`); overlapping bands (`:110-124`); a group figure copied to the entity (`:356`, `:362`); the "Q-016" label (`:244`); no public-interest question for 2025–26 | `checker.ts` | Fixed by QD-1's design |

### 8.2 Coverage gaps: routes not encoded

| CG | What | Affects |
|---|---|---|
| CG-1 | The issuer route under the Transparency Directive, non-EU issuers included. Until it is encoded, a non-EU result must say "not yet covered" (law 3) | New requirement; NF-2; C-12 |
| CG-2 | The Art 40a financial-holding option (2026/470 Art 2(13)(c)) | S-008, S-009 |
| CG-3 | "No EU subsidiary or branch" cannot be stated, because S-008 and S-009 need those scope objects to exist | NF-5; C-11; NQ-4 |
| CG-4 | Irregular periods: the engine cannot see a period's length (§5.3). Two options need a design choice: a reusable condition primitive on period length (an engine change), or a period-length fact derived from confirmed dates | §5.3 |

### 8.3 Design inconsistencies with the vision's laws

| DI | What | Affects |
|---|---|---|
| DI-1 | National-law facts modelled as company facts (law 4: only the customer confirms its facts; law 1: shared knowledge is built once) | §6.5; Q-013; QD-5 |
| DI-2 | Q-011 asks for a legal conclusion, stored as `entity.reported_csrd_fy2024` | §6.2 |
| DI-3 | The legal-form value `listed_company` mixes listing into legal form | §6.6 |

### 8.4 Questions that depend on national application: not defects

The pack today gives one answer to each of these. The EU text leaves them to each Member State's transposition or application, so they are not settled defects. The proposed interim behaviour at EU level is "requires review" for the affected population and years, until the register (KNW-9) and a country pack (KNW-3) say otherwise.

| NA | The open question | Why it is national | Proposed interim behaviour | What resolves it |
|---|---|---|---|---|
| NA-1 | For financial years starting 2024–26, can a **large listed subsidiary** use the exemption? The original Art 19a(10) and 29a(9) said no; the replaced text says yes. S-005, S-006 and S-019 apply the replaced text to every year | 2026/470 gives no application date for the replacement. Germany's committee draft keeps the carve-out until 1.1.2027 | Large listed subsidiaries in 2024–26: "requires review", which needs NF-2 to identify them | Each Member State's transposition (KNW-9), a country pack (KNW-3), ratification (P3) |
| NA-2 | From when is the **financial-holding option** of Art 29a(7a) available? S-023 applies it to every year | It is inserted by 2026/470; Member States "shall ensure" it once they transpose | Holdings stating the option, for years before their Member State's application date is recorded: "requires review" | As NA-1 |
| NA-3 | From when may a protected supplier **decline** above-cap requests? | It is a directive right; it binds through the requester's national law, due 19.3.2027 | Requests whose requester's Member State has not applied it: "requires review" (NF-4) | As NA-1 |
| NA-4 | Did a Member State use the **2025–26 option**? (S-004, S-022) | A national option | Already unresolved; it moves to the shared side (DI-1) | As NA-1 |
| NA-5 | **Counting, two-year rules, currency, and short or long years** for the new thresholds | No EU rule; national methods differ (Germany's draft applies § 267(4)–(5) HGB; the UK adjusts turnover by proportion) | "Requires review" near a threshold, or for an irregular period (§5.3) | Country packs |
| NA-6 | **Banks and insurers outside Annex I and II forms** in 2024–26: does Art 1(3) as amended narrow the first-wave route? | S-017 and S-018 record this as an open source question | Already "open question" in the cautions | Interpretation; ratification (P3) |
| NA-7 | **Transposition status** itself | National measures (§2.1) | Shown per Member State, with its source and date | KNW-9 |

---

## §9. Route coverage

### 9.1 Routes against where they are settled

| Route | Rules | Years | Free checker settles | Free checker shows as open | Onboarding | From reports | National dependency | Encoding |
|---|---|---|---|---|---|---|---|---|
| Individual duty: no group, or subsidiary | S-001, S-017 → S-020 (with S-004, S-005, S-006) | All | 2027–28 from C-1, C-3–C-5. 2025–26 is "no" when C-6 is no | 2025–26 when public-interest status is yes: large status (Q-041). The exemptions (C-7, then Q-043–Q-048). S-004 (national) | Q-003, Q-007, Q-008, Q-039–Q-041, Q-014–Q-016, Q-043, Q-044, Q-047, Q-048 | §5.1: legal form, turnover, headcount, status, group and exemption rows | NA-1, NA-4, NA-5 | Encoded; NA-1 interim |
| Individual duty: parent, or intermediate parent | As above | All | Only if C-9 and C-10 are answered (optional) | "Parent company on its own: not checked." Deemed compliance shown only once the consolidated reporting is confirmed | Q-007, Q-008, Q-040, Q-041, plus as above | As above | As above | Encoded |
| Consolidated duty | S-002, S-018 → S-021 (with S-019, S-022, S-023) | All | 2027–28 from C-1–C-5 (group or sub-group figures). 2025–26 is "no" when C-6 is no | 2025–26: large group (Q-042). The exemption via a higher parent (C-7). The holding option (Q-045, Q-046). S-022 (national) | Q-009, Q-010, Q-042, Q-017, Q-043–Q-046 | As above | NA-1, NA-2, NA-4, NA-5 | Encoded; NA-1, NA-2 interim |
| Third country (Art 40a) | S-007 → S-008, S-009 | From 2028 | The group gate, from C-8 | The gateways (Q-019, Q-020); EU presence (C-11, after CG-3) | Q-018–Q-020 | The segment note | National application of Art 40a | CD-3 (year gate); CG-2, CG-3 |
| Issuer (Transparency Directive) | Not encoded | All | — | "Not yet covered: requires review" (CG-1) | NQ-3 (after CG-1) | Listing information | Each issuer's home Member State | CG-1 |
| Value chain | S-010 → S-011 | Cap from 2027 | Supplier path only if QD-2 is yes | — | Q-021–Q-025, NQ-5 | The request itself | NA-3 | CD-2 |
| National-law gate | S-013 | All | Always "requires review" until a ratified pack exists | — | Q-012 | — | NA-7 | Encoded |
| Standards and relief | S-012, S-015, S-016 | 2026; first three years | — | — | NQ-1, NQ-2, Q-034 | The sustainability statement | — | CD-1, CD-4 |
| History | S-003 | 2024 | — (dropped from the checker) | — | Q-011, redesigned | The 2024 report | — | DI-2 |

### 9.2 Visitor types against routes, in the free checker

Key:
- **Settled** — settled for the years shown when the answers are definite.
- **Partly** — settled for some years; open for 2025–26 or after an exemption.
- **Open** — shown with its reason and next step.
- **Optional** — settled only through C-9 and C-10.
- **Not covered** — not yet encoded.
- **—** — not applicable.

| Visitor | Individual | Consolidated | Exemption | Art 40a | Issuer | National line |
|---|---|---|---|---|---|---|
| EU company, no group | Settled (Partly for 2025–26 if a public-interest entity) | — | — | — | — | Requires review |
| EU parent | Optional | Settled (Partly for 2025–26 and after the holding option) | — | — | — | Requires review |
| EU subsidiary | Settled (Partly as above) | — | Open (C-7, then conditions in onboarding) | Open if the ultimate parent is non-EU (from 2028) | — | Requires review |
| EU intermediate parent | Optional | Settled for the sub-group (Partly as above) | Open (both exemptions, C-7) | As for a subsidiary | — | Requires review |
| Non-EU group | — | — | — | Settled for the gate (C-8); gateways open | Not covered | — |
| Non-EU group's EU subsidiary (checks as an EU subsidiary) | As an EU subsidiary | — | As an EU subsidiary | Open (from 2028) | — | Requires review |

---

## §10. Decisions for you

| QD | Decision | Covers | My recommendation |
|---|---|---|---|
| QD-1 | Approve the free checker's design | C-1–C-8 (C-6 and C-7 conditional), C-9–C-10 (optional), the start-year timeline (§4.2), the stored values (§4.3), the "Not sure" policy (§4.4). Fixes CD-5. Excludes C-11–C-15 | Approve |
| QD-2 | A supplier path in the checker (C-13–C-15)? It is new behaviour: Suggested row **CHK-10** | APP-12; depends on CD-2 and NA-3 | Your call. Valuable after Omnibus I, honest only after CD-2 |
| QD-3 | Approve the onboarding changes of §5.2 and the extraction map of §5.1 *as question-set design* | 22 changed questions, NQ-2; the fact changes inside them go through QD-4 and QD-5 | Approve |
| QD-4 | Approve a content session to **investigate and draft** CD-1–CD-4, CG-1–CG-4, DI-2, DI-3, NA-1–NA-6 (their interim behaviours) and the facts NF-1–NF-6. **This authorises no pack edit.** Each edit comes back for its own approval with its draft | §8 | Approve the investigation. Hold every edit until you see its draft |
| QD-5 | Move national-law facts to the shared side; Q-013 leaves the customer interview. Suggested row **KNW-13** | DI-1, §6.5 | Approve (Codex: sound direction) |
| QD-6 | Q-027 and Q-032: give each a gap test, or retire them | CD-4 | Give each a gap test |
| QD-7 | Record a basis, estimate or actual, on figures for open or future years, and label the results. Suggested row **PRF-16** | §1.3, §5.3, §7 | Approve (Codex: sound direction) |
| QD-8 | Coverage-gap requirements so no route not yet encoded reads "does not apply". Suggested row **KNW-14** | CG-1 now; CG-2 with the 2028 work | Approve CG-1 |
| QD-9 | *Settled by your instruction of 2026-10-23:* the client-questionnaire mapping stays in confidential notes, and this file uses public sources only | — | — |
| QD-10 | Launch scope: EU-wide at the EU-level screen, with a 27-country register (business decision E6 item 2) | §2.5 | Option A; choose the first national pack by evidence |
| QD-11 | Add a UK domestic pack as Suggested row **GTD-17** (If approved), "UK sustainability reporting (Companies Act s414CA statements; FCA rules on UK SRS)", ordered after CBAM, the agreed second pack | §2.3, §2.5 | Add as Suggested; CBAM stays second |
| QD-12 | Range representation: accept §4.3 (money in one-cent steps; headcount stored as closed ranges whose shared end points are never thresholds, with a guard test), or later add exclusive bounds to the engine's range type (an engine change needing its own approval) | §4.3 | Accept §4.3 now |
| QD-13 | The checker's timeline: show all four start years from one set of answers as a clearly hypothetical what-if, or ask one year | §4.2 | Show all four, labelled hypothetical |

I have edited no board row. CHK-10, KNW-13, KNW-14, PRF-16 and GTD-17 are proposals under change control (VISION, "Change control", rule 1).

---

## §11. Limits

- **The engine was not run.** Engine behaviour comes from reading `requirements.json`, `types.ts`, `evaluate.ts`, `facts.ts` and `checker.ts`. Each golden in §4.6 is the test that would confirm it.
- **Snapshots:**
  - EUR-Lex's transposition records were read on 2026-10-23; they are weekly and count notified measures, not completeness.
  - DIP and German law were read the same day. The committee motion is a draft.
  - The FCA policy statement and the gov.uk page were read as published; the gov.uk page was last updated 25.2.2026.
- **Not researched:** counting and currency rules beyond Germany and the UK; Member States' public-interest designations; national rules in the EEA; Switzerland; regimes outside Europe.
- **Population figures** are the Commission's and Germany's own estimates, made by different methods. The Commission gives no per-country breakdown.
- **No independent review has run** on revision 2. Codex's review of revision 1 is answered in §12.
- **Not legal advice; nothing ratified** (law 8; P3).

## §12. Revision 2, finding by finding

| Codex finding (revision 1) | Corrected passage, and where |
|---|---|
| 1. The parent path was incomplete; meeting consolidated thresholds does not establish deemed compliance | §3, rule R: "Art 29a(7)'s deemed compliance is shown as an explanation once the parent's consolidated reporting is confirmed; it never removes the individual route. An unasked route is shown as 'not checked', never dropped." §4.2: the parent's own line is "not checked" unless C-9 and C-10 are answered. §5.2: onboarding asks the parent's own figures (Q-007, Q-008) and its public-interest and large status (Q-040, Q-041) for every year, with no "from 2027" restriction. §9 shows each route separately |
| 2. Bands overlapped at their endpoints | §4.3, in its final wording from revision 3: answer bands are half-open intervals that never overlap; money is stored in one-cent steps; headcount as closed ranges whose shared end points are never thresholds, with a guard test; every stored value is listed with its result against each threshold. The "In one year only" answer is split into "Only the most recent year" and "Only the year before" |
| 3. Unknown answers and periods were not fully designed | §4.4: "Every question offers 'Not sure'", stored as `{ kind: 'unknown' }`, with a table of consequences for every checker question. §4.2: the checker asks no year or month, and the start-year basis is exact because no rule reads more than the start year (verified list). §5.3: the standard shortcut, exact dates, irregular periods, preceding-year tests, group year-ends and unknown dates |
| 4. Q-011 changes meaning and type | §6.2: NF-6 `history.fy2024_published_statement` replaces `entity.reported_csrd_fy2024`, with S-003's new reading, the migration of `true` and `false` to unknown, golden P-010's update, and removal from the checker. §5.2 counts Q-011 under "Reworded, with a fact-type change". §6.6's tally counts the replacement |
| 5. Hypotheses were presented as settled corrections | §8 separates confirmed defects (8.1) from national-application questions (8.4). The holding option's timing and the 2024–26 exemption carve-out are now NA-2 and NA-1, with an interim "requires review". §5.2: Q-045 and Q-046 get no year gate. §1.2 and the summary keep the qualification |
| 6. The approval list was incomplete | §10 lists what each decision covers; QD-1 names every checker question. QD-4 approves investigation only: "This authorises no pack edit." §4.5 recalculates the paths, including intermediate parents and "Not sure" positions |

Revision 1's identifiers map as follows:

| Revision 1 | Revision 2 |
|---|---|
| CK-1, CK-2, CK-4 | C-1, C-3, C-2 |
| CK-5 (turnover), CK-6 (headcount) | C-5, C-4, both scoped by group position |
| CK-16 (parent's own turnover), CK-17 (parent's own headcount) | C-10, C-9 |
| CK-3 | Replaced by the timeline (§4.2) and Q-004 (§5.3) |
| CK-7 | Moved to Q-012 |
| CK-8 | C-6 |
| CK-9 and CK-10 | Moved to onboarding (Q-041, Q-042; Q-045, Q-046) |
| CK-11, CK-12 | C-7, C-8 |
| CK-13, CK-14, CK-15 | C-11, C-12, C-13–C-15 |
| QF-1, QF-2 | CD-1, CD-2 |
| QF-3 | CD-2 (the cap's year gate) and NA-3 (the right to decline) |
| QF-4, QF-5 | NA-1 plus NF-2; NA-2 |
| QF-6, QF-7, QF-8 | CG-1, CG-2, CG-3 |
| QF-9 | DI-1 |
| QF-10 | CD-4 and CD-5 |
| QF-11 | CD-3 |

### 12.2 Revision 3: the final corrections

The review closes with these. Nothing else changed: no feature was added, and no resolved finding was reopened.

| Correction asked for | Corrected passage, and where |
|---|---|
| Restore "EU regulated market" and nationally designated public-interest entities in the checker's guidance | C-6 (§4.1): "That means its shares or bonds are admitted to trading on an EU regulated market (growth markets and other multilateral trading facilities do not count), it is a bank or an insurer, or its country has designated it a public-interest entity. Your auditor will know." C-12 (§4.1) now asks about admission to trading on an EU regulated market, not an "EU stock exchange" |
| Resolve the mismatch between the 0.01 range mapping and higher-precision values | §4.3: money stays in one-cent steps, exact because amounts are reported in whole cents at most. Headcount, which can carry any number of decimals, is stored as the band's closed range ("more than 450, up to 550" as 450 to 550), so the stored value is true of every figure in the band. Neighbouring ranges share only an end point that is never a threshold, with a guard test. Typed figures are stored unrounded. QD-12 is reworded to match |
| Keep CBAM as the agreed second pack; the UK stays Suggested | §0, §2.5 and QD-11: "CBAM stays the agreed second pack (KNW-8). A UK domestic pack enters the board only as a Suggested row (GTD-17, If approved), ordered after CBAM unless you change that order" |
| Keep the timeline clearly hypothetical | §0 and §4.2: "the timeline is a what-if: never a forecast, and never a determination for a year that has not happened … the stored run records the answers as a hypothetical projection". QD-13 is reworded to match |
| Record dashboard rendering verification separately | Not in this proposal. It is recorded in its own note outside the repository (`DASHBOARD-VERIFICATION.md` in the notes folder), because the dashboard is a working tool, not part of the question design |

## §13. A review guide for Codex

1. Check §4.3's stored values against `evaluate.ts:102-118`. Every band must give the result shown. Answer bands must not overlap or leave gaps, money steps must be one cent, and no headcount threshold may equal a band boundary.
2. Check §4.2's claim that no rule reads more than the start year (§4.2 lists them), and that the guard can fail.
3. Check rule R across §4, §5 and §9: no answer is reused across routes, and no route is dropped.
4. Check that every item in §8.4 is presented as open, everywhere it appears (the summary, §1.2, §5.2, §10).
5. Check §2.1's counts against EUR-Lex's transposition pages; they change weekly.
6. Check that the file holds no client material.

---

## Appendix A. Sources

**Legal record (EU), read on EUR-Lex on 2026-10-23**

- Directive (EU) 2026/470: <http://data.europa.eu/eli/dir/2026/470/oj>. Art 2–6; recitals 7, 8, 26, 31–33.
- Directive (EU) 2025/794: <http://data.europa.eu/eli/dir/2025/794/oj>.
- Directive (EU) 2022/2464: <http://data.europa.eu/eli/dir/2022/2464/oj>. Art 1(4), (7), (14); Art 2; Art 5.
- Directive 2013/34/EU, consolidated text of 18.03.2026, a documentation tool: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02013L0034-20260318>.
- Delegated Regulations (EU) 2026/1563, 2026/1560 and 2026/73: <http://data.europa.eu/eli/reg_del/2026/1563/oj>, <http://data.europa.eu/eli/reg_del/2026/1560/oj>, <http://data.europa.eu/eli/reg_del/2026/73/oj>.
- Regulation (EU) 2020/852, Art 8; Regulation (EU) 2019/2088, Art 2(12).
- National transposition records: <https://eur-lex.europa.eu/legal-content/EN/NIM/?uri=CELEX:32022L2464>, <https://eur-lex.europa.eu/legal-content/EN/NIM/?uri=CELEX:32025L0794>, <https://eur-lex.europa.eu/legal-content/EN/NIM/?uri=CELEX:32026L0470>.

**Official bodies (EU and EEA)**

- Commission Notice C/2024/6792, the CSRD FAQs: <http://data.europa.eu/eli/C/2024/6792/oj>.
- Commission Staff Working Document SWD(2026) 500 (3.7.2026), §2.3.1: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52026SC0500>.
- EFTA, EEA-Lex factsheet for 32022L2464: <https://www.efta.int/eea-lex/32022l2464>.

**Germany, read on 2026-10-23**

- §§ 267, 289b HGB: <https://www.gesetze-im-internet.de/hgb/__267.html>, <https://www.gesetze-im-internet.de/hgb/__289b.html>.
- DIP, procedure 325513: <https://dip.bundestag.de/vorgang/gesetz-zur-umsetzung-der-richtlinie-eu-2022-2464-hinsichtlich-der/325513>.
- Ausschussdrucksache 21(6)73 (30.3.2026): <https://www.bundestag.de/resource/blob/1161158/21-6-73_AeA_KOA.pdf>.

**United Kingdom, read on 2026-10-23**

- Companies Act 2006, s414CA: <https://www.legislation.gov.uk/ukpga/2006/46/section/414CA>.
- FCA Policy Statement PS26/19 (September 2026): <https://www.fca.org.uk/publication/policy/ps26-19.pdf>.
- UK Sustainability Reporting Standards (gov.uk, last updated 25.2.2026): <https://www.gov.uk/guidance/uk-sustainability-reporting-standards>.

**Method**

- GOV.UK Design System, "Question pages": <https://design-system.service.gov.uk/patterns/question-pages/>.
- Juster and Smith, RAND DRU-988 (1995): <https://www.rand.org/pubs/drafts/DRU988.html>.
- Hurd, NBER Technical Working Paper 219 (1997): <https://www.nber.org/system/files/working_papers/t0219/t0219.pdf>. The title is as recalled; the file was not opened.

**Repository (candidate at `dc3339d`)**

`backend/engine/knowledge/csrd/*.json`; `backend/engine/src/types.ts`, `condition/evaluate.ts`, `engine/facts.ts`, `engine/nextQuestion.ts`; `frontend/web/lib/checker.ts`; `docs/vision/VISION.md`, `VISION-BOARD.md`.

## Appendix B. Method

- **EUR-Lex** pages were read in the app's own browser pane, because the web fetcher received empty pages. DIP and legislation.gov.uk were read the same way.
- **The Bundestag motion and the FCA policy statement** were fetched as PDFs, each copied into its own empty scratch folder, and their text layers extracted with macOS PDFKit.
- **The repository** was read only. No code was run, no server was contacted, and no agent or paid run took place.
- **No confidential client material** was used to write this file.
