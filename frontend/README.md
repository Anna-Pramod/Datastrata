# Frontend

**Status: design prototypes only.** There is no application code yet — no framework, no build step, no API calls. Every file here is a self-contained clickable mockup that runs by opening it in a browser.

```
prototypes/
  landing.dc.html      Marketing page + free checker, in two visual directions (retro / modern)
  app-modern.dc.html   The full product, restrained navy-teal editorial direction
  app-retro.dc.html    The same product, warm period palette — plus the landing page inline
  support.js           Shared runtime: parses <x-dc> templates and renders them with React

screenshots/           Rendered stills of the above (numbered by iteration)
```

Each `.dc.html` loads `./support.js` from the same folder — keep them together.

## Screens covered by the app prototypes

Both app files carry the same fourteen views, driven by one `nav` state value:

| View | What it proves |
|---|---|
| Home | Posture, what changed, needs you, horizon, evidence health, exposure, assurance readiness — the seven standing answers |
| Regulatory Universe | Applies / Does not apply / Missing fact / Requires judgment, as list **and** interactive map |
| Determination drawer | The universal "Why?" — condition tree, facts used, provisions, versions, sign-off, history |
| Obligations | Register + gap ledger; status derived, never typed |
| Changes | Weekly briefing, change ledger, explicit dated all-clear |
| Actions & Calendar | Plans, tasks, 90-day horizon, .ics export |
| Evidence & Controls | Registry with provenance, freshness, acceptance |
| Assurance | Scoped review, readiness blockers, reviewer portal |
| Reports | Reproducible projections at a date |
| Company Profile | Entities, products, lanes, sourced facts, refresh cadence |
| Ask DataStrata | Cited Q&A over the warranted record |
| Admin | Users, roles, integrations, audit log |
| Onboarding | Document intake → extraction review → guided interview → applicability run |
| Workbench | The internal analyst factory: source queue, extraction bench, simulator, publication gate |
| Portal | The read-only auditor/buyer aperture |

## Design constraints (from the brief — these are not decoration)

- Never start empty; never show a blank dashboard.
- **No single "compliance score."** States with named blockers instead.
- Negative determinations get equal weight and are exportable.
- Certainty is explicit: Deterministic / Expert-signed / Requires counsel, badged near the assertion.
- Colour never carries state alone — word plus shape, WCAG 2.2 AA.
- Desktop-first at 1440px; mobile serves the briefing, all-clear, inbox and evidence capture only.

Full requirements: `docs/briefs/ui-ux-mockup-brief.txt` (sections 6–15 are the screen-by-screen spec).

## When this becomes a real app

The prototypes are the contract, not the codebase. A real frontend will need: a component library for the state/trust/work/data components listed in brief §13, and a backend HTTP API — which does not exist yet either (see `backend/README.md`).
