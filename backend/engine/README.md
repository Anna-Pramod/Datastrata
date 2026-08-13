# DataStrata Applicability Engine (v0.1)

Deterministic applicability engine for sustainability regulatory programs. First knowledge pack: **CSRD** (post-Omnibus, legal snapshot 26 July 2026).

**What it does:** joins DataStrata's shared, versioned requirement library to a private, sourced company profile and produces requirement-level **determinations** — `APPLIES / DOES_NOT_APPLY / INDETERMINATE(reason)` — each with a derivation trace and official citations; then instantiates **obligations**, derives **gaps**, and compiles the **next best questions** to ask.

**What it deliberately is not:** a chatbot, an ESRS datapoint collector, a report-drafting tool, or a CSRD-only codebase.

```bash
npm install
npm test                                              # 45 tests: golden profiles P-001..P-010 + semantics + pack integrity
npm run assess -- examples/p001-eu-standalone.json    # cited scope report
npm run assess -- examples/p008-protected-supplier.json
```

> **Status: prototype.** All requirement content is `draft` (unratified) and every report carries that banner. Expert ratification + pilot-country legal review are required before any customer reliance. No country pack is ratified yet, so every result correctly ends with "national-law status requires review".

Read `CLAUDE.md` for the product laws and working conventions (start every Claude Code session there). Architecture rationale: `docs/architecture.md`. Monitoring automation spec: `monitoring/automation-prompt.md`.
