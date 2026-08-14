# Docs

The specification both halves of the repo are built against.

| File | What it is |
|---|---|
| `briefs/product-architecture-pass2.txt` | Decision-grade condensation of the 11,000-word product design. The two-graph architecture, the six-phase customer journey, the AI rules, staged activation (wedge → operations → assurance) and the five enduring principles. **Read this first.** |
| `briefs/ui-ux-mockup-brief.txt` | The design brief the prototypes implement. Roles and permissions, experience principles, information architecture, screen-by-screen requirements, status/certainty visual language, the internal workbench, accessibility rules and acceptance criteria. |
| `source-documents/` | Original `.docx` of the two briefs. `Deltamere_*.orig` are the pre-rename versions — same documents under the earlier product name. |

Engineering-side documentation lives with the code it describes:

- `backend/engine/CLAUDE.md` — the nine product laws and working conventions
- `backend/engine/docs/architecture.md` — schema v0, Kleene semantics, condition language, deliberate deviations from the pack workbook
- `backend/engine/monitoring/automation-prompt.md` — the source-watcher spec
