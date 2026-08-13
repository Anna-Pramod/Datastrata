# Backend

Everything that computes an answer. Today that is one thing: the applicability engine.

```
engine/     Applicability engine v0.1 — pure TypeScript library + CLI, no I/O, no database
```

## engine/

A **deterministic, three-valued, source-cited evaluator** over versioned regulatory knowledge packs.

```
assess(pack, profile, context)
  → determinations   APPLIES / DOES_NOT_APPLY / INDETERMINATE(reason), each with trace + citations
  → obligations      instantiated only from in-force + APPLIES determinations
  → gaps             readiness tests against those obligations
  → nextQuestions    the interview, compiled from whatever is still unresolved
  → summary          a projection, never the authoritative output
```

Internal layout:

| Path | Role |
|---|---|
| `src/types.ts` | Schema v0 — facts, conditions, requirements, determinations, obligations |
| `src/condition/evaluate.ts` | Three-valued Kleene evaluator, range-safe thresholds, trace building |
| `src/engine/facts.ts` | Fact resolution across the scope graph — the confirmed-only trust boundary |
| `src/engine/evaluate.ts` | `assess()` — requirements × scope objects, memoised cross-references |
| `src/engine/obligations.ts` | Obligation instantiation, deduped per scope |
| `src/engine/gaps.ts` | Gap ledger derivation |
| `src/engine/nextQuestion.ts` | Ranks unresolved facts by how many determinations they unblock |
| `src/knowledge/loader.ts` | Zod validation + referential integrity — the content firewall |
| `knowledge/csrd/` | The CSRD knowledge pack. **All regulatory content lives here as data.** |
| `monitoring/` | Source watchlist + scheduled-watcher prompt (spec, not enabled) |
| `test/golden-profiles.test.ts` | P-001..P-010 — regression tests for law, not for code |

**The standing architecture gate:** adding CBAM must mean a new `knowledge/cbam/` folder and zero program-specific branches under `src/`. Grep for "CSRD" in `src/` should only hit comments.

Read `engine/CLAUDE.md` before changing anything — it carries the eight product laws the tests enforce.

## Not built yet (in build order)

1. Extraction pipeline for candidate facts (`confirmed=false` already exists in the schema)
2. Regulatory-event → selective re-evaluation → delta briefing
3. Country packs with real content (content sprint, not engine work)
4. Persistence, tenancy and an HTTP API wrapping the library — this is where `backend/api/` and `backend/db/` will land
