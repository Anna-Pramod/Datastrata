# Source Register Foundation (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tiered, validated register of every source DataStrata watches, so that corroboration is enforced by the type system and test suite rather than by memory.

**Architecture:** A new program-agnostic module `src/monitoring/` holds the register schema, a tier-based corroboration policy, and an integrity checker that cross-validates the register against a loaded knowledge pack. The existing `monitoring/watchlist.json` is migrated into `monitoring/source-register.json` and deleted. A `/sweep map` project command discovers new sources and proposes register rows for human acceptance — it never writes to the register itself.

**Tech Stack:** TypeScript (strict, ESM), zod v3 for schema validation, vitest for tests. No new runtime dependencies.

## Global Constraints

Copied from `backend/engine/CLAUDE.md` and the design spec. Every task's requirements implicitly include these.

- **TypeScript strict.** No new runtime dependencies — zod only.
- **Engine code stays program-agnostic.** `grep -r "CSRD" backend/engine/src/` must only ever hit comments and docs. The string `"CSRD"` may appear in JSON data under `monitoring/` and `knowledge/`, never in `src/`.
- **No `Date.now()` in engine logic.** Dates arrive as data. (The `/sweep map` prompt is not engine logic and may use the real date.)
- **`npm test` must be green before any commit.** Run from `backend/engine/`.
- **Commits are handed to the user, not executed.** Every "Commit" step in this plan means: print the exact `git add` and `git commit` commands in separate bash-tagged blocks and stop. The user runs them.
- **No `Co-Authored-By: Claude` trailer** in any commit message.
- **All pack content stays `ratification.status: "draft"`.** This plan changes no requirement content.
- **Four tiers, exactly:** `legal_record`, `official_body`, `tracker`, `news`. The register never stores any other value. A candidate whose tier cannot be determined stays in a proposal file and is never accepted into the register.

## File Structure

| Path | Responsibility |
|---|---|
| `backend/engine/src/monitoring/types.ts` (create) | Register type definitions only — no logic |
| `backend/engine/src/monitoring/register.ts` (create) | zod schema, tier policy, `parseSourceRegister`, `loadSourceRegister`, `verifyRegisterIntegrity` |
| `backend/engine/test/source-register.test.ts` (create) | Unit tests on fixtures + integration test on the real register |
| `backend/engine/monitoring/source-register.json` (create) | The register data — 10 migrated rows |
| `backend/engine/monitoring/watchlist.json` (delete) | Absorbed by the register |
| `backend/engine/monitoring/automation-prompt.md` (modify) | Stop referencing the deleted watchlist |
| `backend/engine/src/index.ts` (modify) | Export the new public API |
| `backend/engine/CLAUDE.md` (modify) | Map section gains the new module and file |
| `.claude/commands/sweep.md` (create, repo root) | The `/sweep map` command |

Paths below are relative to `backend/engine/` unless stated otherwise.

---

### Task 1: Register schema and parser

**Files:**
- Create: `backend/engine/src/monitoring/types.ts`
- Create: `backend/engine/src/monitoring/register.ts`
- Test: `backend/engine/test/source-register.test.ts`

**Interfaces:**
- Consumes: `KnowledgePack` from `../types` (later tasks only)
- Produces: `parseSourceRegister(raw: unknown): SourceRegister`, `RegisterIntegrityError`, and the types `SourceTier`, `SourceCadence`, `RegisterSource`, `SourceRegister`, `TierPolicy`

- [ ] **Step 1: Write the failing test**

Create `backend/engine/test/source-register.test.ts`:

```typescript
/**
 * The surface register is the second content firewall. sources.json says what
 * may be cited; this file says where we look and how much weight each place
 * carries. A malformed row is a build failure, not a runtime surprise.
 */

import { describe, expect, it } from 'vitest';
import { parseSourceRegister, RegisterIntegrityError } from '../src/monitoring/register';
import type { RegisterSource } from '../src/monitoring/types';

/** A minimal valid row. Tests override single fields to isolate one failure. */
function row(over: Partial<RegisterSource> = {}): RegisterSource {
  return {
    id: 'W-001',
    tier: 'legal_record',
    name: 'EUR-Lex — a directive',
    authority: 'EU Publications Office',
    url: 'https://eur-lex.europa.eu/eli/dir/2026/470/oj/eng',
    feed: null,
    feedNote: 'Not yet investigated',
    governs: 'Legal status and corrigenda',
    cadence: 'weekly',
    affectsRequirements: [],
    expectedProvenance: [],
    mustCorroborateWith: [],
    lastSeen: null,
    discoveredBy: 'test fixture',
    tierRationale: 'The Official Journal is the legal record',
    ...over,
  };
}

const register = (sources: RegisterSource[]) => ({ program: 'TEST', updated: '2026-08-14', sources });

describe('source register schema', () => {
  it('accepts a well-formed register', () => {
    const parsed = parseSourceRegister(register([row()]));
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0]?.tier).toBe('legal_record');
  });

  it('rejects a tier outside the four allowed values', () => {
    expect(() => parseSourceRegister(register([row({ tier: 'blog' as never })]))).toThrow();
  });

  it('rejects an unknown field, so typos cannot pass silently', () => {
    const bad = register([{ ...row(), tierr: 'news' } as never]);
    expect(() => parseSourceRegister(bad)).toThrow();
  });

  it('rejects a duplicate source id', () => {
    const dup = register([row({ id: 'W-001' }), row({ id: 'W-001', name: 'Another' })]);
    expect(() => parseSourceRegister(dup)).toThrow(RegisterIntegrityError);
  });

  it('requires a tierRationale, so a tier is never assigned without a stated reason', () => {
    expect(() => parseSourceRegister(register([row({ tierRationale: '' })]))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: FAIL — cannot resolve `../src/monitoring/register`

- [ ] **Step 3: Write the types**

Create `backend/engine/src/monitoring/types.ts`:

```typescript
/**
 * Surface register schema.
 *
 * `sources.json` in a knowledge pack is the citation record — official legal
 * instruments only. This is a different list: every surface we look at,
 * including ones that may never be cited. The tier decides which.
 */

/** Ordered by evidential weight, strongest first. */
export type SourceTier = 'legal_record' | 'official_body' | 'tracker' | 'news';

export type SourceCadence = 'daily' | 'daily_until_effective' | 'weekly' | 'monthly';

export interface RegisterSource {
  /** W-NNN. Stable across renames — briefs and state files reference it. */
  id: string;
  tier: SourceTier;
  name: string;
  /** Who operates the surface, in their own terms. */
  authority: string;
  /** Always populated, always clickable. Auditability is a product property. */
  url: string;
  /** Machine feed (RSS/API/SPARQL) if one exists, else null. */
  feed: string | null;
  /** Why `feed` is null, or what the feed is. Never blank. */
  feedNote: string;
  governs: string;
  cadence: SourceCadence;
  /** Requirement IDs this surface can affect — impact analysis is a lookup. */
  affectsRequirements: string[];
  /** SRC-NNN records a claim from here should trace back to. */
  expectedProvenance: string[];
  /** Derived from tier; stored so integrity checks can assert consistency. */
  mustCorroborateWith: SourceTier[];
  /** ISO date of the last successful read, or null if never read. */
  lastSeen: string | null;
  /** How this row entered the register. */
  discoveredBy: string;
  /** Why this tier was assigned. Required — tier is never inferred silently. */
  tierRationale: string;
  /** Optional instruction for the watch sweep when this surface moves. */
  onEvent?: string;
}

export interface SourceRegister {
  program: string;
  /** ISO date the register was last edited by a human. */
  updated: string;
  sources: RegisterSource[];
}

export interface TierPolicy {
  /**
   * Whether a finding from this tier alone can justify a change proposal.
   * `non_binding_only` covers facts like expected dates and guidance, never a
   * change to what the law requires.
   */
  sufficientAlone: 'yes' | 'no' | 'non_binding_only';
  /** Whether a surface at this tier may ever appear in a pack's sources.json. */
  citable: boolean;
  mustCorroborateWith: SourceTier[];
}
```

- [ ] **Step 4: Write the parser**

Create `backend/engine/src/monitoring/register.ts`:

```typescript
/**
 * Surface register loader + firewall.
 *
 * Corroboration is structural here, not procedural: a surface's tier decides
 * whether it may ever be cited, and the integrity check proves no pack cites a
 * surface that may not be. Nobody has to remember the rule.
 */

import { z } from 'zod';
import type { RegisterSource, SourceRegister, SourceTier, TierPolicy } from './types';

export const TIER_POLICY: Record<SourceTier, TierPolicy> = {
  legal_record: { sufficientAlone: 'yes', citable: true, mustCorroborateWith: [] },
  official_body: { sufficientAlone: 'non_binding_only', citable: true, mustCorroborateWith: [] },
  tracker: { sufficientAlone: 'no', citable: false, mustCorroborateWith: ['legal_record'] },
  news: { sufficientAlone: 'no', citable: false, mustCorroborateWith: ['legal_record'] },
};

const tier = z.enum(['legal_record', 'official_body', 'tracker', 'news']);
const cadence = z.enum(['daily', 'daily_until_effective', 'weekly', 'monthly']);

const registerSource = z
  .object({
    id: z.string().regex(/^W-\d{3}$/, 'source id must be W-NNN'),
    tier,
    name: z.string().min(1),
    authority: z.string().min(1),
    url: z.string().url(),
    feed: z.string().url().nullable(),
    feedNote: z.string().min(1),
    governs: z.string().min(1),
    cadence,
    affectsRequirements: z.array(z.string()),
    expectedProvenance: z.array(z.string()),
    mustCorroborateWith: z.array(tier),
    lastSeen: z.string().nullable(),
    discoveredBy: z.string().min(1),
    tierRationale: z.string().min(1),
    onEvent: z.string().optional(),
  })
  .strict();

const sourceRegister = z
  .object({
    program: z.string().min(1),
    updated: z.string().min(1),
    sources: z.array(registerSource).min(1),
  })
  .strict();

export class RegisterIntegrityError extends Error {
  constructor(public problems: string[]) {
    super(`Source register failed integrity checks:\n - ${problems.join('\n - ')}`);
  }
}

/** Structural validation + checks that need nothing outside the register. */
export function parseSourceRegister(raw: unknown): SourceRegister {
  const reg = sourceRegister.parse(raw) as SourceRegister;

  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of reg.sources) {
    if (seen.has(s.id)) problems.push(`${s.id}: duplicate source id`);
    seen.add(s.id);
  }

  if (problems.length > 0) throw new RegisterIntegrityError(problems);
  return reg;
}

export type { RegisterSource, SourceRegister, SourceTier, TierPolicy };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 6: Typecheck**

Run: `cd backend/engine && npm run typecheck`
Expected: no output (success)

- [ ] **Step 7: Hand the commit to the user**

Print these two blocks and stop. Do not run them.

```bash
git add backend/engine/src/monitoring/types.ts backend/engine/src/monitoring/register.ts backend/engine/test/source-register.test.ts
```

```bash
git commit -m "Add surface register schema and parser

Four tiers (legal_record, official_body, tracker, news) with a stated
rationale required on every row. Strict zod objects so a typo'd field
fails at load rather than being silently ignored."
```

---

### Task 2: Tier corroboration policy enforced on every row

**Files:**
- Modify: `backend/engine/src/monitoring/register.ts` (extend `parseSourceRegister`)
- Test: `backend/engine/test/source-register.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `TIER_POLICY`, `parseSourceRegister` from Task 1
- Produces: no new exports — `parseSourceRegister` gains a check

- [ ] **Step 1: Write the failing test**

Append to `backend/engine/test/source-register.test.ts`:

```typescript
describe('tier corroboration policy', () => {
  it('accepts a tracker row that declares it must corroborate with the legal record', () => {
    const parsed = parseSourceRegister(
      register([row({ tier: 'tracker', mustCorroborateWith: ['legal_record'] })]),
    );
    expect(parsed.sources[0]?.mustCorroborateWith).toEqual(['legal_record']);
  });

  it('rejects a tracker row that claims it needs no corroboration', () => {
    expect(() =>
      parseSourceRegister(register([row({ tier: 'tracker', mustCorroborateWith: [] })])),
    ).toThrow(RegisterIntegrityError);
  });

  it('rejects a news row that claims it needs no corroboration', () => {
    expect(() =>
      parseSourceRegister(register([row({ tier: 'news', mustCorroborateWith: [] })])),
    ).toThrow(RegisterIntegrityError);
  });

  it('rejects a legal_record row that claims it needs corroboration', () => {
    expect(() =>
      parseSourceRegister(register([row({ tier: 'legal_record', mustCorroborateWith: ['legal_record'] })])),
    ).toThrow(RegisterIntegrityError);
  });

  it('names the offending source and both tiers in the error', () => {
    try {
      parseSourceRegister(register([row({ id: 'W-042', tier: 'news', mustCorroborateWith: [] })]));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as RegisterIntegrityError).problems[0]).toContain('W-042');
      expect((e as RegisterIntegrityError).problems[0]).toContain('legal_record');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: FAIL — the four rejection tests pass no error; "expected to throw"

- [ ] **Step 3: Add the check to `parseSourceRegister`**

In `backend/engine/src/monitoring/register.ts`, replace the body of the duplicate-id loop with this expanded loop:

```typescript
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of reg.sources) {
    if (seen.has(s.id)) problems.push(`${s.id}: duplicate source id`);
    seen.add(s.id);

    // mustCorroborateWith is stored per row so it is visible when reading the
    // register, but it is not a free choice — the tier decides it.
    const expected = TIER_POLICY[s.tier].mustCorroborateWith;
    const actual = s.mustCorroborateWith;
    const same = expected.length === actual.length && expected.every((t) => actual.includes(t));
    if (!same) {
      problems.push(
        `${s.id}: tier ${s.tier} requires mustCorroborateWith [${expected.join(', ')}], found [${actual.join(', ')}]`,
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Hand the commit to the user**

```bash
git add backend/engine/src/monitoring/register.ts backend/engine/test/source-register.test.ts
```

```bash
git commit -m "Enforce tier corroboration policy on every register row

A tracker or news row that claims it needs no corroboration is now a
load-time failure. The rule lives in TIER_POLICY; the per-row field
exists so a human reading the register sees it, not so it can differ."
```

---

### Task 3: Cross-pack referential integrity

**Files:**
- Modify: `backend/engine/src/monitoring/register.ts` (add `verifyRegisterIntegrity`)
- Test: `backend/engine/test/source-register.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `KnowledgePack` from `../types`; `csrdPack()` from `./helpers` in tests
- Produces: `verifyRegisterIntegrity(register: SourceRegister, pack: KnowledgePack): void` — throws `RegisterIntegrityError`

- [ ] **Step 1: Write the failing test**

Append to `backend/engine/test/source-register.test.ts`. Add `verifyRegisterIntegrity` to the existing import from `../src/monitoring/register`, and add `import { csrdPack } from './helpers';` at the top of the file.

```typescript
describe('register ↔ pack referential integrity', () => {
  const pack = csrdPack();

  it('accepts references that resolve against the pack', () => {
    const reg = parseSourceRegister(
      register([row({ affectsRequirements: ['CSRD-S-001'], expectedProvenance: ['SRC-004'] })]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).not.toThrow();
  });

  it('rejects a reference to a requirement that does not exist', () => {
    const reg = parseSourceRegister(register([row({ affectsRequirements: ['CSRD-S-999'] })]));
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/CSRD-S-999/);
  });

  it('rejects provenance pointing at a source that does not exist', () => {
    const reg = parseSourceRegister(register([row({ expectedProvenance: ['SRC-999'] })]));
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/SRC-999/);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const reg = parseSourceRegister(
      register([row({ affectsRequirements: ['CSRD-S-998'], expectedProvenance: ['SRC-997'] })]),
    );
    try {
      verifyRegisterIntegrity(reg, pack);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as RegisterIntegrityError).problems).toHaveLength(2);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: FAIL — `verifyRegisterIntegrity is not exported`

- [ ] **Step 3: Implement `verifyRegisterIntegrity`**

Add to `backend/engine/src/monitoring/register.ts`. Add `import type { KnowledgePack } from '../types';` at the top:

```typescript
/**
 * Cross-validate the register against a loaded pack. Separate from parsing
 * because the register is meaningful on its own; only these checks need a pack.
 */
export function verifyRegisterIntegrity(register: SourceRegister, pack: KnowledgePack): void {
  const problems: string[] = [];
  const reqIds = new Set(pack.requirements.map((r) => r.id));
  const srcIds = new Set(pack.sources.map((s) => s.id));

  for (const s of register.sources) {
    for (const r of s.affectsRequirements) {
      if (!reqIds.has(r)) problems.push(`${s.id}: affects unknown requirement ${r}`);
    }
    for (const p of s.expectedProvenance) {
      if (!srcIds.has(p)) problems.push(`${s.id}: expectedProvenance cites unknown source ${p}`);
    }
  }

  if (problems.length > 0) throw new RegisterIntegrityError(problems);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: PASS — 14 tests

- [ ] **Step 5: Hand the commit to the user**

```bash
git add backend/engine/src/monitoring/register.ts backend/engine/test/source-register.test.ts
```

```bash
git commit -m "Cross-validate the register against the knowledge pack

A register row that names a requirement or source ID which does not
exist now fails loudly. This is what makes impact analysis a lookup
instead of research when a source moves."
```

---

### Task 4: The citation firewall

This is the check that makes the whole design hold: a surface tiered `tracker` or `news` must never appear in a pack's `sources.json`, because requirements cite from there. Corroboration becomes impossible to bypass rather than merely required.

**Files:**
- Modify: `backend/engine/src/monitoring/register.ts` (extend `verifyRegisterIntegrity`)
- Test: `backend/engine/test/source-register.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `verifyRegisterIntegrity` from Task 3
- Produces: no new exports

- [ ] **Step 1: Write the failing test**

Append to `backend/engine/test/source-register.test.ts`:

```typescript
describe('citation firewall', () => {
  const pack = csrdPack();

  it('allows an official_body surface to share a host with a cited source', () => {
    // SRC-011 is a finance.ec.europa.eu page; the Commission is citable.
    const reg = parseSourceRegister(
      register([
        row({
          tier: 'official_body',
          url: 'https://finance.ec.europa.eu/some/other/page_en',
          tierRationale: 'European Commission, authoritative but not the legal record',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).not.toThrow();
  });

  it('rejects a pack citing a host registered as a tracker', () => {
    const reg = parseSourceRegister(
      register([
        row({
          id: 'W-090',
          tier: 'tracker',
          // Deliberately a host the CSRD pack really cites.
          url: 'https://eur-lex.europa.eu/some/commentary',
          mustCorroborateWith: ['legal_record'],
          tierRationale: 'Fixture: pretend commentary to prove the firewall fires',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/W-090/);
  });

  it('rejects a pack citing a host registered as news', () => {
    const reg = parseSourceRegister(
      register([
        row({
          id: 'W-091',
          tier: 'news',
          url: 'https://www.efrag.org/newsroom',
          mustCorroborateWith: ['legal_record'],
          tierRationale: 'Fixture: pretend press surface to prove the firewall fires',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/W-091/);
  });

  it('ignores a www. prefix when matching hosts', () => {
    const reg = parseSourceRegister(
      register([
        row({
          id: 'W-092',
          tier: 'tracker',
          url: 'https://www.eur-lex.europa.eu/commentary',
          mustCorroborateWith: ['legal_record'],
          tierRationale: 'Fixture: same host as SRC-001 with a www prefix',
        }),
      ]),
    );
    expect(() => verifyRegisterIntegrity(reg, pack)).toThrow(/W-092/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: FAIL — the three rejection tests do not throw

- [ ] **Step 3: Add the firewall to `verifyRegisterIntegrity`**

In `backend/engine/src/monitoring/register.ts`, add this helper above `verifyRegisterIntegrity`:

```typescript
/**
 * Host comparison is deliberately coarse. A tracker hosted on a domain that
 * also serves citable content will trip this check — which is the intended
 * outcome: a human adjudicates rather than the tool guessing.
 */
function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}
```

Then insert this block inside `verifyRegisterIntegrity`, immediately before the `if (problems.length > 0)` line:

```typescript
  // The firewall. sources.json is the citation record; a surface that may not
  // be cited must not appear there, or corroboration could be bypassed.
  const uncitable = new Map<string, string>();
  for (const s of register.sources) {
    if (!TIER_POLICY[s.tier].citable) uncitable.set(hostOf(s.url), `${s.id} (${s.tier})`);
  }
  for (const ps of pack.sources) {
    const owner = uncitable.get(hostOf(ps.url));
    if (owner) {
      problems.push(
        `${ps.id} cites ${hostOf(ps.url)}, which the register lists as ${owner} — a non-citable tier must never appear in sources.json`,
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: PASS — 18 tests

- [ ] **Step 5: Run the full suite to confirm nothing regressed**

Run: `cd backend/engine && npm test`
Expected: PASS — all existing tests plus the 18 new ones

- [ ] **Step 6: Hand the commit to the user**

```bash
git add backend/engine/src/monitoring/register.ts backend/engine/test/source-register.test.ts
```

```bash
git commit -m "Add the citation firewall between register and pack sources

A surface tiered tracker or news can never appear in sources.json, so a
non-official claim has no path into a requirement's citations except
through an official record. Host matching is coarse on purpose: a shared
domain trips the check and a human decides."
```

---

### Task 5: Migrate the watchlist into the register

Ten existing watchlist entries become register rows. All ten are official — none is a tracker or news surface, because none has ever been added. That is expected: tiers 3 and 4 arrive with the first `/sweep map` run.

**Field mapping**, so nothing looks lost in review:

| `watchlist.json` | `source-register.json` |
|---|---|
| `site` | `name` |
| `track` | `governs` |
| `eventWhen` | folded into `governs`; the actionable half moves to `onEvent` where one exists |
| `linkedSources` | `expectedProvenance` |
| `affectsRequirements` | unchanged |
| `cadence`, `url`, `authority` | unchanged |
| `priority` | **dropped** — `cadence` already encodes how closely a surface is watched, and a second ranking would drift out of step with it |
| — | `tier`, `tierRationale`, `discoveredBy`, `feed`, `feedNote`, `mustCorroborateWith`, `lastSeen` are new |

**Files:**
- Create: `backend/engine/monitoring/source-register.json`
- Delete: `backend/engine/monitoring/watchlist.json`
- Modify: `backend/engine/src/monitoring/register.ts` (add `loadSourceRegister`)
- Modify: `backend/engine/src/index.ts`
- Modify: `backend/engine/monitoring/automation-prompt.md`
- Test: `backend/engine/test/source-register.test.ts`

**Interfaces:**
- Consumes: `parseSourceRegister`, `verifyRegisterIntegrity` from Tasks 1–4
- Produces: `loadSourceRegister(dir: string): SourceRegister` — reads `source-register.json` from `dir`

- [ ] **Step 1: Write the failing test**

Append to `backend/engine/test/source-register.test.ts`. Add `loadSourceRegister` to the import from `../src/monitoring/register`, and add these imports at the top of the file:

```typescript
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
```

```typescript
describe('the real CSRD source register', () => {
  const pack = csrdPack();
  const here = dirname(fileURLToPath(import.meta.url));
  const reg = loadSourceRegister(join(here, '..', 'monitoring'));

  it('loads, validates and cross-references cleanly', () => {
    expect(() => verifyRegisterIntegrity(reg, pack)).not.toThrow();
    expect(reg.program).toBe('CSRD');
  });

  it('carries every surface migrated from the watchlist', () => {
    expect(reg.sources).toHaveLength(10);
    const ids = reg.sources.map((s) => s.id);
    expect(ids).toContain('W-001');
    expect(ids).toContain('W-010');
  });

  it('states a tier rationale and a feed note for every surface', () => {
    for (const s of reg.sources) {
      expect(s.tierRationale.length, s.id).toBeGreaterThan(0);
      expect(s.feedNote.length, s.id).toBeGreaterThan(0);
    }
  });

  it('holds no tracker or news surface yet — those arrive with the first map sweep', () => {
    expect(reg.sources.every((s) => s.tier === 'legal_record' || s.tier === 'official_body')).toBe(true);
  });

  it('marks the Official Journal and EUR-Lex records as the legal record', () => {
    const legal = reg.sources.filter((s) => s.tier === 'legal_record').map((s) => s.id);
    expect(legal).toEqual(expect.arrayContaining(['W-001', 'W-002', 'W-005']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: FAIL — `loadSourceRegister is not exported`

- [ ] **Step 3: Add the file loader**

Add to `backend/engine/src/monitoring/register.ts`. Add `import { readFileSync } from 'node:fs';` and `import { join } from 'node:path';` at the top:

```typescript
/** Read and validate `source-register.json` from a directory. */
export function loadSourceRegister(dir: string): SourceRegister {
  return parseSourceRegister(JSON.parse(readFileSync(join(dir, 'source-register.json'), 'utf8')));
}
```

- [ ] **Step 4: Write the register data**

Create `backend/engine/monitoring/source-register.json`. Every `feed` is `null` with an honest note — determining which of these surfaces offers a real machine feed is the first `/sweep map` run's job, and inventing feed URLs now would be exactly the fabrication this system exists to prevent.

```json
{
  "program": "CSRD",
  "updated": "2026-08-14",
  "sources": [
    {
      "id": "W-001",
      "tier": "legal_record",
      "name": "EUR-Lex — Directive (EU) 2026/470 (Omnibus I)",
      "authority": "EU Publications Office",
      "url": "https://eur-lex.europa.eu/eli/dir/2026/470/oj/eng",
      "feed": null,
      "feedNote": "EUR-Lex exposes ELI and CELEX identifiers and machine endpoints; the exact feed for this act is not yet confirmed. Resolve on the first map sweep.",
      "governs": "Legal status, corrigenda and relationships of the amending directive",
      "cadence": "weekly",
      "affectsRequirements": ["CSRD-S-001", "CSRD-S-002", "CSRD-S-004", "CSRD-S-007", "CSRD-S-008", "CSRD-S-009", "CSRD-S-010", "CSRD-S-011", "CSRD-S-014"],
      "expectedProvenance": ["SRC-004"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "The Official Journal text of an adopted directive is the legal record itself."
    },
    {
      "id": "W-002",
      "tier": "legal_record",
      "name": "EUR-Lex — National Transposition Measures for 2026/470",
      "authority": "EU Publications Office / Member States",
      "url": "https://eur-lex.europa.eu/legal-content/EN/NIM/?uri=CELEX:32026L0470",
      "feed": null,
      "feedNote": "No feed confirmed. Resolve on the first map sweep.",
      "governs": "Each Member State's implementing law and exercised options",
      "cadence": "weekly",
      "affectsRequirements": ["CSRD-S-004", "CSRD-S-005", "CSRD-S-013", "CSRD-S-014"],
      "expectedProvenance": ["SRC-015"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "NIM entries are the official record of notified national measures."
    },
    {
      "id": "W-003",
      "tier": "official_body",
      "name": "European Commission — CSRD policy hub",
      "authority": "European Commission",
      "url": "https://finance.ec.europa.eu/financial-markets/company-reporting-and-auditing/company-reporting/corporate-sustainability-reporting_en",
      "feed": null,
      "feedNote": "No feed confirmed. Resolve on the first map sweep.",
      "governs": "Policy timeline, legal initiatives, consultations and official announcements",
      "cadence": "daily",
      "affectsRequirements": [],
      "expectedProvenance": ["SRC-011"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "Authoritative institutional communication, but a policy page is not the enacted text; a binding change still needs the OJ."
    },
    {
      "id": "W-004",
      "tier": "official_body",
      "name": "European Commission — CSRD delegated acts (revised ESRS + voluntary standard)",
      "authority": "European Commission",
      "url": "https://finance.ec.europa.eu/regulation-and-supervision/financial-services-legislation/implementing-and-delegated-acts/corporate-sustainability-reporting-directive_en",
      "feed": null,
      "feedNote": "No feed confirmed. Resolve on the first map sweep.",
      "governs": "Scrutiny period, OJ publication and entry into force of the pending delegated acts",
      "cadence": "daily_until_effective",
      "affectsRequirements": ["CSRD-S-011", "CSRD-S-012"],
      "expectedProvenance": ["SRC-007", "SRC-008"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "Commission status page: authoritative for expected timing, not sufficient alone to flip a pack flag.",
      "onEvent": "On confirmed entry into force, propose setting packFlags.revised_esrs_in_force / voluntary_standard_in_force, bumping the pack version, running golden profiles, and re-evaluating stored determinations. The proposal must cite the OJ record (W-005), not this page."
    },
    {
      "id": "W-005",
      "tier": "legal_record",
      "name": "EUR-Lex Official Journal — L series daily view",
      "authority": "EU Publications Office",
      "url": "https://eur-lex.europa.eu/oj/daily-view/L-series/default.html",
      "feed": null,
      "feedNote": "The OJ daily view is a strong candidate for a real feed. Resolve on the first map sweep.",
      "governs": "Publication of delegated acts — the moment pending law becomes effective law",
      "cadence": "daily_until_effective",
      "affectsRequirements": ["CSRD-S-012"],
      "expectedProvenance": ["SRC-007", "SRC-008"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "Publication in the Official Journal is the legal event itself."
    },
    {
      "id": "W-006",
      "tier": "official_body",
      "name": "EFRAG Knowledge Hub",
      "authority": "EFRAG",
      "url": "https://knowledgehub.efrag.org/eng",
      "feed": null,
      "feedNote": "No feed confirmed. Resolve on the first map sweep.",
      "governs": "Technical ESRS versions, explanations and Q&A",
      "cadence": "weekly",
      "affectsRequirements": ["CSRD-S-012"],
      "expectedProvenance": ["SRC-013"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "EFRAG is the appointed technical adviser; its guidance is authoritative but not law."
    },
    {
      "id": "W-007",
      "tier": "official_body",
      "name": "EFRAG implementation support",
      "authority": "EFRAG",
      "url": "https://www.efrag.org/en/sustainability-reporting/esrs-workstreams/implementation-support",
      "feed": null,
      "feedNote": "No feed confirmed. Resolve on the first map sweep.",
      "governs": "Materiality, value-chain and datapoint implementation guidance",
      "cadence": "weekly",
      "affectsRequirements": [],
      "expectedProvenance": ["SRC-012"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "EFRAG guidance: authoritative interpretation, never the enacted text."
    },
    {
      "id": "W-008",
      "tier": "official_body",
      "name": "EFRAG — Article 40a / non-EU groups standard setting",
      "authority": "EFRAG",
      "url": "https://www.efrag.org/en/projects/noneu-groups-standard-setting/research-phase",
      "feed": null,
      "feedNote": "No feed confirmed. Resolve on the first map sweep.",
      "governs": "N-ESRS exposure drafts, consultation and technical advice",
      "cadence": "weekly",
      "affectsRequirements": ["CSRD-S-008", "CSRD-S-009"],
      "expectedProvenance": ["SRC-014"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "Standard-setting project page: authoritative on progress, not on obligation."
    },
    {
      "id": "W-009",
      "tier": "official_body",
      "name": "European Commission — value-chain cap explanatory page",
      "authority": "European Commission",
      "url": "https://finance.ec.europa.eu/news/feedback-sustainability-reporting-standards-additional-explanatory-information-regarding-value-chain-2026-05-06_en",
      "feed": null,
      "feedNote": "No feed confirmed. Resolve on the first map sweep.",
      "governs": "Official clarification of the value-chain cap and its item mapping",
      "cadence": "weekly",
      "affectsRequirements": ["CSRD-S-010", "CSRD-S-011"],
      "expectedProvenance": ["SRC-010"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "Commission explanatory material: authoritative interpretation of an act, not the act."
    },
    {
      "id": "W-010",
      "tier": "official_body",
      "name": "European Commission — Taxonomy delegated acts",
      "authority": "European Commission",
      "url": "https://finance.ec.europa.eu/regulation-and-supervision/financial-services-legislation/implementing-and-delegated-acts/taxonomy-regulation_en",
      "feed": null,
      "feedNote": "No feed confirmed. Resolve on the first map sweep.",
      "governs": "Article 8 disclosure changes linked to CSRD reporting",
      "cadence": "monthly",
      "affectsRequirements": [],
      "expectedProvenance": ["SRC-016", "SRC-017"],
      "mustCorroborateWith": [],
      "lastSeen": null,
      "discoveredBy": "migrated from watchlist.json 2026-08-14",
      "tierRationale": "Commission status page for acts whose enacted texts are SRC-016/017 on EUR-Lex."
    }
  ]
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend/engine && npx vitest run test/source-register.test.ts`
Expected: PASS — 23 tests

- [ ] **Step 6: Delete the watchlist**

Run: `git rm backend/engine/monitoring/watchlist.json`

This removes the file and stages the deletion in one step, so the commit in Step 10 needs no separate `git rm`.

- [ ] **Step 7: Export the new API**

In `backend/engine/src/index.ts`, add these two lines after the existing `loadPack` export:

```typescript
export { loadSourceRegister, parseSourceRegister, verifyRegisterIntegrity, RegisterIntegrityError, TIER_POLICY } from './monitoring/register';
export type { RegisterSource, SourceRegister, SourceTier, SourceCadence, TierPolicy } from './monitoring/types';
```

- [ ] **Step 8: Repoint the automation prompt at the register**

In `backend/engine/monitoring/automation-prompt.md`, replace the entire `**Watchlist (id | cadence | url | affects):**` section — the heading and all ten bullet lines beneath it — with:

```markdown
**Sources:** read `monitoring/source-register.json`. Each row carries its tier,
cadence, URL, machine feed (or an honest note that none is known), the
requirement IDs it can affect, and the `SRC-###` records a claim from it must
trace back to.

**Tier rules — these govern what a finding may do, not merely how it is worded:**

- `legal_record` — the enacted text. Sufficient alone to justify a change proposal.
- `official_body` — authoritative but not enacted. Sufficient alone only for
  non-binding facts (expected dates, guidance, consultations). Never sufficient
  to flip a pack flag or change what the law requires.
- `tracker` / `news` — never sufficient. A finding enters the brief as
  UNCORROBORATED and must be traced to a `legal_record` before it may propose
  anything. If no official record is found, it stays in a "Claims we could not
  verify" section: visible to the operator, never shown to a customer, never a
  basis for a pack change.
```

Also change the `**Status: SPEC ONLY (not yet enabled).**` line's activation sentence to:

```markdown
**Status: SPEC ONLY (not yet enabled).** The `watch` sweep is Plan C of
`docs/superpowers/specs/2026-08-14-csrd-knowledge-accuracy-design.md`. The
source register it depends on exists; this prompt is the draft it will become.
```

- [ ] **Step 9: Run the full suite and typecheck**

Run: `cd backend/engine && npm test && npm run typecheck`
Expected: PASS — all tests green, no type errors

- [ ] **Step 10: Hand the commit to the user**

```bash
git add backend/engine/monitoring/source-register.json backend/engine/monitoring/automation-prompt.md backend/engine/src/monitoring/register.ts backend/engine/src/index.ts backend/engine/test/source-register.test.ts
```

```bash
git commit -m "Migrate the watchlist into the tiered source register

Ten surfaces carried over with a tier and a stated rationale each: the
EUR-Lex act, NIM and OJ pages are legal_record; the Commission and EFRAG
pages are official_body, authoritative on timing and interpretation but
never sufficient alone to change what the law requires. No tracker or
news surface exists yet — those arrive with the first map sweep.

Every feed is null with an honest note. Which of these offers a real
machine feed is a question for the sweep, not something to invent here."
```

---

### Task 6: The `/sweep map` command

**Files:**
- Create: `.claude/commands/sweep.md` (repo root)
- Modify: `backend/engine/CLAUDE.md`

**Interfaces:**
- Consumes: `monitoring/source-register.json` from Task 5
- Produces: a proposal file at `backend/engine/monitoring/proposals/YYYY-MM-DD-register.md` — never an edit to the register

- [ ] **Step 1: Create the command**

Create `.claude/commands/sweep.md` at the repository root:

````markdown
---
description: Discover regulatory sources (map) or detect change (watch, not yet built)
argument-hint: map
---

You are DataStrata's regulatory source sweeper. Mode: **$ARGUMENTS**

If the mode is anything other than `map`, stop and say: "Only `map` is
implemented. The `watch` sweep is Plan C of the accuracy design spec."

## Ground rules — these are product laws, not preferences

1. **You never edit `backend/engine/monitoring/source-register.json`.** You
   write a proposal file. A human accepts rows into the register.
2. **Every claim carries a URL and a quoted snippet from the page.** No quote,
   no claim. If you did not read it, you do not report it.
3. **A source you could not fetch is not a source that said nothing.** Record
   it as unreachable, with the error. Never treat silence as absence.
4. **Never assign a tier from a domain name or reputation.** Tier comes from
   what you read on the page. If you could not fetch it, propose the row with
   the tier field omitted and a note — a human assigns it.
5. **Never propose adding a `tracker` or `news` surface to `sources.json`.**
   That file is the citation record and holds official legal instruments only.

## Procedure

1. Read `backend/engine/monitoring/source-register.json`. These are the
   surfaces already known — you are extending, not restarting.
2. Read `backend/engine/knowledge/csrd/sources.json` so you know which
   `SRC-###` records exist, for the `expectedProvenance` field.
3. Search for CSRD-governing surfaces not already in the register. Cover all
   four tiers deliberately — the register currently holds only official
   sources, so trackers and news outlets are the gap:
   - **legal_record** — EUR-Lex, the Official Journal, national official
     gazettes of Member States
   - **official_body** — European Commission, EFRAG, national ministries,
     national regulators and supervisors, accountancy and audit oversight bodies
   - **tracker** — Big Four and law-firm briefing hubs, specialist CSRD and
     transposition trackers, industry association monitors
   - **news** — outlets that actually break EU regulatory stories
4. Fetch every candidate. Confirm it resolves, read what it actually covers,
   and check whether it offers a machine feed (RSS, Atom, API, SPARQL).
5. For each candidate, draft a register row using the exact schema in
   `backend/engine/src/monitoring/types.ts`. `mustCorroborateWith` must match
   the tier: `[]` for `legal_record` and `official_body`, `["legal_record"]`
   for `tracker` and `news`. Fill `discoveredBy` with how you found it and
   `tierRationale` with why that tier — both are required and neither may be
   generic.
6. Re-check the existing ten rows: does each URL still resolve? Has a feed
   appeared? Report dead links and feed discoveries as proposed edits.
7. Write `backend/engine/monitoring/proposals/YYYY-MM-DD-register.md` with:
   - **New surfaces** — one section per candidate: the proposed JSON row in a
     fenced block, the quoted snippet that justified the tier, and the search
     or link that found it
   - **Proposed edits to existing rows** — same format, with what changed
   - **Unreachable candidates** — URL, the error, and no tier assigned
   - **Rejected candidates** — what you found and why it does not belong
     (duplicate, out of scope, dead project)
   - **Coverage note** — which tiers and which Member States you did *not*
     manage to cover, so the gap is visible rather than implied
8. End with a summary: candidates found, by tier; existing rows still healthy;
   dead links; feeds discovered.

## After the run

Tell the user to review the proposal file and say which rows to accept. When
they do, add the accepted rows to `source-register.json` and run
`cd backend/engine && npm test` — the register's integrity checks and the
citation firewall must stay green.
````

- [ ] **Step 2: Verify the command is discoverable**

Run: `ls -la .claude/commands/sweep.md`
Expected: the file exists

Confirm the frontmatter parses by checking the file starts with `---`, contains a `description:` line, and closes with `---` before the body.

- [ ] **Step 3: Update the engine guide**

In `backend/engine/CLAUDE.md`, in the `## Map` code block, replace this line:

```
monitoring/                  source watchlist + scheduled-task prompt (spec; not yet enabled)
```

with:

```
src/monitoring/register.ts   source-register schema, tier policy, citation firewall
monitoring/source-register.json  every surface watched, tiered; corroboration rules are data
monitoring/automation-prompt.md  draft watch-sweep prompt (Plan C; not yet enabled)
monitoring/proposals/        /sweep map output awaiting human acceptance
```

Then add this bullet to the end of the `## Product laws` list:

```markdown
9. **Tiered sources, structural corroboration.** `monitoring/source-register.json`
   tiers every surface as `legal_record | official_body | tracker | news`. A
   `tracker` or `news` surface may never appear in a pack's `sources.json` — the
   test suite enforces it — so a non-official claim has no path into a citation
   except through an official record.
```

- [ ] **Step 4: Run the full suite one last time**

Run: `cd backend/engine && npm test && npm run typecheck`
Expected: PASS — all green

- [ ] **Step 5: Hand the commit to the user**

```bash
git add .claude/commands/sweep.md backend/engine/CLAUDE.md
```

```bash
git commit -m "Add the /sweep map command and document the register

map discovers candidate surfaces across all four tiers, fetches each to
confirm what it covers, and writes a proposal file. It never edits the
register: a human accepts rows. Every claim must carry a quoted snippet,
and an unreachable candidate is recorded as unreachable rather than
silently dropped."
```

---

## After the plan

Run `/sweep map` for real. It writes a proposal file; review it and accept the rows you trust. That corrected register is the input to Plan B (verification), because the verification pass reads legal text from the sources the register names.

## Self-review notes

Checked against `docs/superpowers/specs/2026-08-14-csrd-knowledge-accuracy-design.md` §3 and §9 steps 1–2:

| Spec requirement | Task |
|---|---|
| Four tiers with corroboration policy | 1, 2 |
| Row schema incl. `feed`, `feedNote`, `expectedProvenance`, `tierRationale`, `discoveredBy` | 1, 5 |
| `sources.json` stays the citation record; corroboration structural | 4 |
| Loader validation, referential integrity | 3 |
| Absorb `watchlist.json` | 5 |
| `/sweep map` proposes, never writes | 6 |
| Unfetchable candidate gets no tier | 6 |
| `WebSearch` + `WebFetch` discovery | 6 |

Deferred to later plans, by design: `national-status.json` and `coverage.json` (Plan C), the `verified` status and review sheet (Plan B), `/sweep watch` and `monitoring/state/last-seen.json` (Plan C).
