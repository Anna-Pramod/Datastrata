# Checkpoint — `claude-code-cli@2`'s spending and launch controls (D2, D3, D4), offline, on `d235557`

Written 2026-10-17 by the implementer subagent that made the change, in the
candidate worktree `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate`
(branch `feature/opus55-subscription-migration`, HEAD `d235557`). Every log
named here is in the evidence directory
`/Users/vivin/Documents/DataStrata/pilot-evidence/2026-10-15-opus55-spend-controls/`
(R below): the parent's are `parent-*`, `write-location-*`, `sandbox-*` and
`bytes-*`; this change's are `impl-*`. Nothing is committed: the user runs
every `git add` and `git commit`. The work was offline. No Claude Code or
`ollama` binary was run, and nothing was authenticated, inferred, probed,
rehearsed, promoted or signed; there was no S-002 run. Every Node run went
through the parent's sandbox wrapper with `--no-cache`, and each run's write
summary reports no path in b1b-record.

A second implementer subagent repaired one gap in this change afterwards,
from the parent's brief `parent-impl-brief-reset-hold.20261017T101500Z.md`:
see "The reset-hold repair" below, whose logs are `impl2-*`. The sections
before it describe the change as first made and reviewed; where the repair
makes a statement there untrue, the statement now says so.

**Static, not observed.** Every statement here about what the pinned Claude
Code 2.1.295 does is the parent's static reading of its bytes
(`parent-bytes-findings.20261015T135500Z.md` and the `bytes-*` logs it
names). Nothing from 2.1.295 has been run, so every such statement is
unobserved at runtime.

## What changed, and why

Three of the differences `CHECKPOINT-opus55-pin-2.1.295.md` recorded and did
not act on (D2, D3, D4) are acted on, and the pipeline identity is extended
so that the launch controls are part of what it names.

1. **D4, launch controls** (`src/pipeline/claude-code-cli.ts`).
   `CLAUDE_CODE_CLI_V2_PROFILE.controls` gains
   `CLAUDE_CODE_DISABLE_REFUSAL_RETRY: '1'` and
   `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS: '1'`: thirteen controls, from
   eleven. `CLAUDE_CODE_DISABLE_1M_CONTEXT` is not added. The profile's
   comment says what each does by the parent's reading, why the third is not
   set, and what already stands against the long-context route.
2. **The identity carries the launch controls**
   (`src/pipeline/provider-adapter.ts`, `src/pipeline/identity.ts`,
   `src/pipeline/claude-code-cli.ts`). `InvocationIdentity` gains an optional
   `controls` map. `@2`'s `invocationOf` reads it from the profile.
   `identityPayload` emits `invocation.controls` only when it is defined,
   every entry, in a new object whose keys the canonical serialiser orders.
   `assertValidInvocationIdentity` validates it when it is defined.
   `invocationDifferences` compares it as a key-sorted map, and
   `describeInvocation` shows it sorted as `NAME=value`. The controls change
   what the launched executable does, so a run under other controls is not
   the run the identity names; D-3's invocation (effort, ceiling, executable)
   did not cover them.
3. **D2, `overageEnabled`** (projection and harness). In the projection,
   rule 1 reads `overageEnabled` exactly `true` as an overage fact, on the
   event's `rate_limit_info` and on every object inside its `unifiedWindows`.
   `rateLimitProblems` refuses a top-level value that is present and not
   exactly `false`. Inside a window nothing changed: the existing
   overage-name rule refuses the key whatever its value. In the harness
   (`test/included-usage.ts`), `RATE_LIMIT_FIELDS` copies the field, and a
   new fact `overage_enabled` sits after `overage_status_not_rejected`. It is
   read on the top-level reading only: `true` is kind `overage`, any other
   value but `false` is kind `unobserved`. `SUBSCRIPTION_V2_UNOBSERVED`
   (`test/live-capture.ts`) gains `extraUsage`, the filed statement.
4. **D3, `usage_limit_reached`** (projection and harness). Rule 2 also holds
   on an API-error carrier (a flagged assistant item, or a system `api_error`
   event) one of whose kind candidates is `usage_limit_reached`. It throws
   `CliIncludedUsageExhaustedError`, the same class, whose `rateLimitType`
   and `resetsAt` come from the carrier's own params: `apiErrorParams`, else
   `api_error_params`, the first that is an object holding an object
   `rate_limit_info`. They are carried as reported, and none are carried
   when the params report none. The rule names the first line in stream
   order carrying either of its facts. `error: "rate_limit"` alone is not
   classified. In the harness, `ApiErrorReading` gains `rateLimitInfo`, a
   copy of the params' `status`, `rateLimitType` and `resetsAt`, each where
   present. A new fact `usage_limit_reached` sits after
   `rate_limit_rejected`: kind `exhausted`, one per carrier carrying the
   kind, its `resetsAt` the copied one, else `null`. This change left
   `usageStopOf` and the reset-pending check unchanged; **the reset-hold
   repair below changes both**, because a stop with a reset-less
   `usage_limit_reached` beside another exhaustion reporting a usable reset
   was held only to that reset.
5. **Comments only**:
   - `src/pipeline/config.ts` and `src/pipeline/runner.ts`. Their comments on
     `RoleConfig.invocation` and `AgentRunner.invocation` listed what an
     invocation holds ("effort, output ceiling and pinned executable"),
     which stopped being true when `controls` joined `InvocationIdentity`.
     No code changed in either file.
   - `CHECKPOINT-opus55-pin-2.1.295.md` gains one pointer line under "Open
     decisions for the user".

## Decisions, each with its evidence

- **D4 (a): `CLAUDE_CODE_DISABLE_REFUSAL_RETRY=1`, added.**
  - The build's gate `Wa` is false whenever the variable is set
    (`bytes-02`, `bytes-15`).
  - While the retry is armed, the build withholds a refused API-error item
    and the `model_refusal_no_fallback` event from the stream. It then
    retries once on the same model, a second request (`bytes-16`).
  - With the retry off, the refusal-fallback lane offers no fallback model,
    because `@2`'s `CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK` and
    `CLAUDE_CODE_NO_MODEL_FALLBACK` make `G1()` false (`bytes-17`).
  - So the refusal stays in the stream, where rule 6 classifies it, and no
    second request is spent. No rule is weakened.
- **D4 (b): `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS=1`, added.**
  - The variable makes the native structured-output gate `HUn` false
    (`bytes-18`). `HUn` gates every native format and the structured-outputs
    beta (`bytes-19`, `bytes-20`).
  - `-p --json-schema` is never a native format: it becomes the
    `StructuredOutput` tool (`bytes-22` to `bytes-24`, `bytes-27`).
  - The tool contract and every check on it are unchanged. Whether the tool
    is forced stays unknown (`bytes-26`; the pin checkpoint's second
    addendum).
- **D4 (c): `CLAUDE_CODE_DISABLE_1M_CONTEXT`, not added.**
  - For a natively 1M model, the build says the 200K limit is not enforced
    under the variable. Its only enforcement is auto-compaction at a window,
    a further request whose compact boundary `@2` would refuse (`bytes-28`
    to `bytes-30`).
  - What stands against the long-context route already: `@2` requests the
    bare `claude-opus-5-5`; rule 4 refuses a `[1m]` model or a context-1M
    beta; rule 3 classifies `long_context_credits_required`; the harness
    stops at its 190,000-token per-request ceiling.
- **Each control is read as true for `'1'`** (`bytes-03` to `bytes-05`).
  **Not located:** the object `a` every reader consults. That it reads
  `process.env` is inferred, as for `@2`'s existing controls (`bytes-06` to
  `bytes-14`).
- **The identity extension.** The controls decide what the executable does,
  so they are an identity input. They are optional on the type and emitted
  only when defined. Every identity derived without them is therefore
  unchanged, the HTTP route's, the S-001 binding's, `@1`'s and both goldens
  among them. Only `@2`'s moves.
- **D2.**
  - The build adds `overageEnabled` at the top level of `rate_limit_info`
    only, only on `allowed_warning` events whose type is not `overage`,
    behind a gate, from the cached `hasExtraUsageEnabled` (`bytes-31`,
    `bytes-32`).
  - `true` contradicts D-6's precondition, and is overage. `false` is read
    as disabled.
  - Absence says nothing, and is not read as extra usage off: extra usage
    being off remains the user-confirmed precondition of D-6, as the filed
    statement says.
- **D3.**
  - On a 429 the build writes an API-error item with `error: "rate_limit"`,
    kind `usage_limit_reached` (internally `apiError`), and params
    `{ rate_limit_info }` from the headers. There `resetsAt` is integer unix
    seconds, and the info carries no `unifiedWindows` (`bytes-31`,
    `bytes-32`).
  - The usage stop is filed with the carrier's own reset or none. A null
    reset makes the existing reset-pending check hold every later execution
    until an operator reviews it. **Corrected by the reset-hold repair:**
    that held only when the carrier was the stop's one exhausted or overage
    fact. Beside a fact reporting a finite reset, `usageStopOf` filed that
    reset and the check let a new execution start once it passed; both are
    repaired below.

### Decisions taken while implementing (for review)

- **The exhaustion error.** `CliIncludedUsageExhaustedError` gains a sixth
  constructor parameter, `apiError: { kind, reportsRateLimitInfo } | null`.
  The rate-limit-event message is byte-identical to before. The API-error
  message is `… the CLI reported API error "usage_limit_reached" on <carrier>
  at line N (rateLimitType …, resetsAt …)`, or, without params, `… (it
  reports no rate_limit_info in its params, so no rateLimitType and no reset
  time are carried)`.
- **Validation problem texts**:
  - `controls is not an object`;
  - `controls is empty`;
  - `controls key "<name>" is not an environment variable name
    (^[A-Z][A-Z0-9_]*$)`;
  - `controls["<name>"] <value> is not a string`.

  "Plain object" is checked as `executable` is (an object, not null, not an
  array); the prototype is not checked.
- **Mismatch text.** `controls configured [A=1, …], actual [ … ]`, or
  `none` for an absent map; `describeInvocation` appends `, controls [ … ]`
  when present.
- **`provider-adapter.test.ts`'s hand-written derivation** is extended to
  write the controls, as `pipeline-identity.test.ts`'s is. Its case "over the
  suite baseline … agree" uses `INVOCATION_V2`, which now carries them. Both
  write the entries in the literal's own order, with no sort. Each
  `INVOCATION_V2` literal is written with its keys sorted by hand.
  `GOLDEN_INVOCATION` and both goldens are unedited.
- **Harness.** `usage_limit_reached` is one fact per carrier even when the
  kind sits in two fields. Its detail mirrors `credits_required`'s.
- **Tests beyond the brief's list:**
  - V-X5 (values carried as reported, never defaulted);
  - V-X9 (the first line across the rule's two facts, both orders);
  - a configuration-side control refusal through `pipelineVersionFor`;
  - the reverse mismatch direction;
  - the reorder comparison case;
  - U-D2, U-D4 and U-D6;
  - `USAGE_FACTS` held to the table's order in U-F0.
- **V2-U14 and V2-U15 put the following execution's assertions first, as
  `expect.soft`.** A defect that files the wrong stop then shows both the
  wrong stop and the following execution's fate. With plain `expect` the
  case stopped at whichever assertion came first.
- **Test titles renamed** (no case removed):
  - C2-v2 and V2-E2 ("eleven" → "thirteen");
  - the included-usage describe and U-F0 ("sixteen" → "eighteen"), which
    renames each LONE row's full name;
  - the provider-adapter case "keys the identity does not hash move nothing,
    beside the declared fields …".

  An accidental rename of V2-U9b's title (a dropped space) was caught in the
  diff and restored. V2-U9b's title is unchanged.

## Identity impact

- **`@2` (`SUBSCRIPTION_ROLE_CONFIG`)**:
  - old: `pipeline-v3-68c4d29bd770f9e7bc78f24cb2da97892a9da8f7c0bcabb499dff5301806a19a`;
  - new: `pipeline-v3-737f8d5015ea4249eef93cfa66c0b1b9bbb323fd633e7d5a71c26f453f8ce90e`.
- **How the new literal was taken.** It came from the builder by a placeholder
  run, with the old literal left in place: the run's received value
  (`impl-placeholder-identity.20261015T141601Z.log`). The builder over
  `SUBSCRIPTION_ROLE_CONFIG`, the builder over the literal configuration and
  the hand-written derivation all received the same new value there. The
  derivation's JSON is written by hand, the controls as a literal map with
  sorted keys, and hashed with `node:crypto`.
- **Positive control.** The same configuration with its controls removed
  derives exactly the old literal, through the builder and through the
  hand-written derivation. That shows the controls are the only change.
- **What did not move** (all green and unedited in the final run):
  - HTTP `pipeline-v3-06789a36…` and the S-001 recording binding;
  - `@1` `pipeline-v3-fd3ed34d…`;
  - `GOLDEN_IDENTITY` `pipeline-v3-1d566c99…`;
  - the present-invocation golden `pipeline-v3-002ec70e…`.
- `@1`'s profile, `PINNED_CLI`, `LAUNCH_CONTROL_ENV`, argv and projection are
  unchanged. `@1` declares no invocation.

## Teeth

Each tooth ran through `tooth.sh`, all in one log per tooth:

1. the target's hash was checked against the expected one;
2. a copy was taken into the scratchpad;
3. one replacement was made, refused unless the old text occurred exactly
   once, and the landed diff was shown;
4. the named test files were run under the wrapper with `--no-cache`;
5. the target was restored from the copy and the restore confirmed by
   sha256. Every log ends "restore CONFIRMED by hash".

**Re-runs.** `test/live-capture.test.ts` changed after the first round, when
V2-U14 and V2-U15 were restructured. So every tooth that runs it (A1, A2, A3,
B3, D1, D3, D4) was re-run on the final tree. The table cites the re-runs,
and the first-round logs are kept. No mutated source file changed after any
tooth: the hashes the teeth checked are the final ones.

| Tooth | Mutation | Red | First failure (verbatim, trimmed) | Log |
|---|---|---|---|---|
| A1 | drop `CLAUDE_CODE_DISABLE_REFUSAL_RETRY` | 9 of 511: C2-v2, C5, V2-E1, V2-E2, pipeline-identity `SUBSCRIPTION_ROLE_CONFIG` and `subscriptionRoleConfigFor`, provider-adapter "over claude-code-cli@2" and two live-runner cases | C2-v2: `expected { CLAUDE_CODE_MAX_RETRIES: '0', …(11) } to deeply equal { CLAUDE_CODE_MAX_RETRIES: '0', …(12) }`, diff `-   "CLAUDE_CODE_DISABLE_REFUSAL_RETRY": "1"`; V2-E2: `the environment role launch 1 saw: expected { …(15) } to deeply equal …`, the same line | `impl-teeth-A1.20261015T144416Z.log` |
| A2 | drop `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS` | the same 9 of 511 | C2-v2: `…(11) } to deeply equal { … …(12) }`, diff `-   "CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS": "1"`; V2-E2 the same line | `impl-teeth-A2.20261015T144600Z.log` |
| A3 | add `CLAUDE_CODE_DISABLE_1M_CONTEXT: '1'` | the same 9 of 511 | C2-v2: `expected { …(13) } to deeply equal { …(12) }`, diff `+   "CLAUDE_CODE_DISABLE_1M_CONTEXT": "1"`; V2-E2 the same line | `impl-teeth-A3.20261015T144740Z.log` |
| B1 | `identityPayload` drops `controls` | 7 of 166: the `@2` literal, `SUBSCRIPTION_ROLE_CONFIG`, the three moves-when, the reorder case, provider-adapter "over the suite baseline"; `GOLDEN_IDENTITY`, the present-invocation golden, HTTP, S-001, `@1` and the without-controls control green | `expected 'pipeline-v3-68c4d29bd770f9e7bc78f24cb…' to be 'pipeline-v3-737f8d5015ea4249eef93cfa6…'` | `impl-teeth-B1.20261015T143133Z.log` |
| B2 | emit `controls: {}` when absent | 4 of 166: the without-controls control, the present-invocation golden ("and the builder derives the same literal"), its two extra-key cases; `GOLDEN_IDENTITY` green | `expected 'pipeline-v3-f2f2f1a61bb2750d0f8ea2540…' to be 'pipeline-v3-68c4d29bd770f9e7bc78f24cb…'` | `impl-teeth-B2.20261015T143135Z.log` |
| B3 | `invocationOf` omits `controls` | 7 of 511: C5, V2-E1, `SUBSCRIPTION_ROLE_CONFIG`, `subscriptionRoleConfigFor`, provider-adapter "over claude-code-cli@2" and two live-runner cases | C5: `expected { effort: 'high', …(2) } to deeply equal { effort: 'high', …(3) }`, diff `-   "controls": Object {` | `impl-teeth-B3.20261015T144918Z.log` |
| B4 | `invocationDifferences` ignores `controls` | 3 of 120: the two `controls` mismatch rows and the reverse direction | `expected undefined to be an instance of InvocationMismatchError` | `impl-teeth-B4.20261015T143313Z.log` |
| B4b (extra) | `controlsKey` without its sort | 2 of 120: the reorder comparison case, and the live runner's positive control (the profile's own key order differs from the sorted literal) | `expected [ 'controls' ] to deeply equal []` | `impl-teeth-B4b.20261015T143401Z.log` |
| B5a | the key-pattern conjunct removed | 3 of 120: the three key rows | `expected undefined to be an instance of InvalidInvocationIdentityError` | `impl-teeth-B5a.20261015T143314Z.log` |
| B5b | the string-value conjunct removed | 3 of 120: the three value rows | the same message | `impl-teeth-B5b.20261015T143315Z.log` |
| B5c | the empty-map conjunct removed | 2 of 120: the empty row and the `pipelineVersionFor` row | the same message | `impl-teeth-B5c.20261015T143316Z.log` |
| B5d | the array conjunct removed | 1 of 120: the array row | `expected [ …(2) ] to deeply equal [ 'controls is not an object' ]` | `impl-teeth-B5d.20261015T143318Z.log` |
| C1 | rule 1 no longer reads `overageEnabled` | 2 of 378: `true` at the top and in a window | `expected a CliOverageError: expected 'CliUsageUnobservedError' to be 'CliOverageError'`: the overlap fails closed, as the module comment now says | `impl-teeth-C1.20261015T143417Z.log` |
| C2 | `rateLimitProblems` accepts any `overageEnabled` | 6 of 378: the six malformed rows | `expected a CliUsageUnobservedError: expected undefined to be 'CliUsageUnobservedError'` (accepted) | `impl-teeth-C2.20261015T143418Z.log` |
| C3 | `rateLimitProblems` refuses an absent `overageEnabled` | 96 of 378: every builder-based acceptance, the absent row among them, and the unobserved rows whose fragment now follows the new problem; the `false` row green | V-A0: `CliUsageUnobservedError: … the rate_limit_event at line 23: overageEnabled undefined (must be absent or false; absence is not read as extra usage off); …` | `impl-teeth-C3.20261015T143420Z.log` |
| C4 | the harness fact removed | 9 of 156: the seven `overage_enabled` rows, U-D1, U-D3 | `expected [] to strictly equal [ { fact: 'overage_enabled', …(6) } ]` | `impl-teeth-C4.20261015T143604Z.log` |
| C5 | the harness treats absence as a fact | 133 of 156, the clean cases first | U-C2: `expected [ { fact: 'overage_enabled', …(6) } ] to strictly equal []` (detail `rate_limit_info.overageEnabled absent`) | `impl-teeth-C5.20261015T143605Z.log` |
| D1 | rule 2 ignores the kind | 11 of 518: V-X1 to V-X9, V2-U14, V2-U15. The streams fall to `CliResultError` (an item at exit 0), `CliStreamLifecycleError` (a system event), `CliCreditsRequiredError` (V-X8), or the rejected event's message (V-X9) | `expected a CliIncludedUsageExhaustedError: expected 'CliResultError' to be 'CliIncludedUsageExhaustedError'` | `impl-teeth-D1.20261015T145044Z.log` |
| D2a | `apiErrorParams` and `api_error_params` read in the other order | 1 of 378: V-X6 | `expected 'reader[0]: included usage is exhauste…' to contain '(rateLimitType "five_hour", resetsAt …'` (received `seven_day`, `1769999999`) | `impl-teeth-D2a.20261015T143421Z.log` |
| D2b | `resetsAt` a constant 1760000000 | 4 of 378: V-X2, V-X4, V-X5, V-X6; the cases using 1760000000 green | V-X2: expected `resetsAt 1760100000`, received `resetsAt 1760000000` | `impl-teeth-D2b.20261015T143422Z.log` |
| D2h (extra) | the harness reads the params in the other order | 1 of 156: the both-spellings row | `-     "resetsAt": 1760000000, +     "resetsAt": 1769999999,` | `impl-teeth-D2h.20261015T143606Z.log` |
| D3 | the harness fact removed | 11 of 296: eight `usage_limit_reached` rows, U-D5, V2-U14, V2-U15 | `expected [] to strictly equal [ { …(7) } ]`. V2-U14: `the following execution: expected { status: 'completed', …(26) } to be an instance of UsageResetPendingError`, then `expected null to strictly equal { kind: 'exhausted', …(6) }` | `impl-teeth-D3.20261015T145145Z.log` |
| D4 | `usageStopOf` substitutes 1790075400 when no reset is finite | 13 of 296: U-S3, U-S4, U-S5 (a–c), U-D3, U-D5, V2-U14, V2-U3, V2-U6, V2-U7, V2-U8, V2-U9l; V2-U15 (finite) green | U-D3: `expected { kind: 'overage', …(6) } to strictly equal …` (`resetsAt` null expected). V2-U14: the following execution `… to be an instance of UsageResetPendingError`, then `-   "resetsAt": null, +   "resetsAt": 1790075400` | `impl-teeth-D4.20261015T145247Z.log` |

## Counts

- **Baseline** at `d235557`: 31 files / 1699 tests, all passing
  (`parent-baseline-targeted.20261015T135546Z.log`).
- **Finish**: 31 files / 1763 tests, all passing
  (`impl-final-targeted.20261017T093814Z.log`).
- **+64, every one accounted for** (per file and by title in
  `impl-final-counts.20261017T094012Z.log`):
  - `claude-code-cli-v2.test.ts`, +20:
    - eleven `overageEnabled` rows in the D-6 table: absent, `false`, `true`,
      `true` in a window, six malformed values, `false` in a window;
    - V-X1 to V-X9.
  - `included-usage.test.ts`, +21:
    - eight `usage_limit_reached` rows and seven `overage_enabled` rows;
    - U-D1 to U-D6.
  - `live-capture.test.ts`, +2: V2-U14 and V2-U15.
  - `pipeline-identity.test.ts`, +5:
    - the without-controls control;
    - three moves-when rows;
    - the reorder case.
  - `provider-adapter.test.ts`, +16:
    - one acceptance case;
    - ten refusal rows;
    - the `pipelineVersionFor` row;
    - two mismatch rows, the reverse direction, and the reorder case.
  - `claude-code-cli.test.ts`, +0: its assertions were added inside C1-v2,
    C2-v2 and C5.
- **Renamed titles**: 94, all renames, none removed:
  - 1 in `claude-code-cli.test.ts`;
  - 91 in `included-usage.test.ts`, U-F0 and the 90 LONE rows under the
    renamed describe;
  - 1 in `live-capture.test.ts`;
  - 1 in `provider-adapter.test.ts`.
- `test/included-usage.test.ts` alone: 135 → 156.
- **Typechecks**: engine `tsc --noEmit` 0
  (`impl-final-engine-tsc.20261017T093955Z.log`); root `npm run typecheck` 0
  (`impl-final-root-typecheck.20261017T093957Z.log`).
- **csrd**: 7, in the six expected files
  (`impl-final-csrd.20261017T094005Z.log`).

## Write locations

The parent established, before this change:

- vitest's default results cache would write through the engine's
  `node_modules` symlink into b1b-record, and the sandbox refuses it
  (`write-location-vitest-default-cache.20261015T134435Z.log`);
- `--no-cache` writes none there (`write-location-vitest-no-cache…`), nor do
  the typechecks (`write-location-typechecks…`).

Every `impl-*` run log carries its own write summary: 38 of them, each
reporting `paths whose real location is in b1b-record: 0`. The final
targeted run wrote these, apart from temporary directories:

- into the candidate, only vitest's transient `vitest.config.ts.timestamp-*.mjs`,
  written and unlinked;
- outside the known roots, only a `mkdir` of `~/.npm`.

## Runtime questions

None of these has been observed, and each waits on the probe:

1. Whether a `-p` `stream-json` run serialises `apiError` / `apiErrorParams`
   or `api_error` / `api_error_params`, and on which carrier.
2. Whether a `-p` run reports `usage_limit_reached` at all, and which 429s
   arrive as `error: "rate_limit"` alone, which no rule classifies.
3. Whether `overageEnabled` appears. Its gate `vSe()`, the
   `allowed_warning`-only path and an undefined cached value can all keep it
   out.
4. Whether `a.NAME` reads `process.env` for the two new controls. The object
   was not located.
5. Whether, under the two fallback controls, the refusal-retry control
   leaves the refused item and `model_refusal_no_fallback` in the stream as
   read.
6. Whether `--json-schema`'s `StructuredOutput` tool is forced. This is
   unchanged and not rechecked.
7. Whether a 1M window is believed for `claude-opus-5-5`, and whether
   auto-compaction runs in a one-turn `-p` launch.
8. Whether the params' `resetsAt` is integer unix seconds, as the schema
   types it.

## Open decisions for the user

1. **`--settings` is still not an identity input.** The settings text
   changes what the executable does as surely as the controls do. The brief
   left it out, and so did this change.
2. **An API-error item of kind `rate_limit` alone is unclassified.** It falls
   through to `CliExitError` or `CliResultError` and files no usage stop. A
   usage stop for it would need a decision about what it means.
3. **`CLAUDE_CODE_DISABLE_1M_CONTEXT`'s blocker.** The build does not
   enforce the 200K limit under it for a natively 1M model. The only
   enforcement offered is auto-compaction (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`),
   a further request `@2` would refuse.
4. **The env object `a` was not located.** Every control's effect rests on
   the inferred `process.env` reading.
5. **The D-6 preconditions.** Among them, that extra usage is off. They
   remain unconfirmed, and `overageEnabled`'s absence does not confirm them.

The pin checkpoint's other open decisions and blockers stand.

## Parent review (2026-10-17)

Kept as history: this review is of the tree **before** the reset-hold repair
below. The hashes, counts and teeth it names are that tree's; the repair's
are in its own section.

The parent session that wrote the brief reviewed the change and re-ran every
tooth itself. It did not reuse the implementer's teeth files: it wrote each
mutation again from the code (`make_specs.py`, which refused to run unless each
mutation text occurred exactly once) and ran it through its own runner
(`teeth.py`: copy first, apply, show the landed diff, run the named files under
the sandbox wrapper with `--no-cache`, restore from the copy, confirm by
sha256).

- **State at hand-back** (`parent-review-state.20261017T094512Z.log`): HEAD
  `d235557`, the fourteen changed files and this one, each at the hash in the
  table below; no diff under `anthropic-messages.ts`, `transcript.ts`,
  `src/verification/`, `test/verification-transcripts/`, `corpus/`,
  `knowledge/`, `verification/` or the plans; all 38 implementer logs with a
  write summary report 0 paths in b1b-record.
- **Interruption.** The implementer stopped on an API network error on
  2026-10-15. Before resuming it on 2026-10-17 the parent confirmed that every
  teeth log it had written ended "restore CONFIRMED by hash"; on resuming it
  re-ran every tooth whose test file had changed since (A1 to A3, B3, D1, D3,
  D4).
- **The 23 teeth re-run, and three of the parent's own**
  (`parent-teeth-batch.20261017T094717Z.log`, one `parent-teeth-<id>.20261017T…log`
  each, read together in `parent-teeth-summary.20261017T100032Z.log`). Every one
  went red on the cases the implementer's table names, for the reason
  intended, and every restore matched; the four mutated files hashed the same
  before and after the batch. Where the parent ran a wider set of files the
  red set is wider by exactly what that file adds: A1 to A3 red the same nine
  cases of 889; B1, run with `live-capture.test.ts` too, also reds V2-E1 (8 of
  306). C3's 96 red cases each fail on `overageEnabled undefined (must be
  absent or false; absence is not read as extra usage off)`. The parent's own:
  - P1, rule 2 moved after rule 3: V-X8 and the existing V-Q2 red, as
    `expected 'CliCreditsRequiredError' to be 'CliIncludedUsageExhaustedError'`
    (the priority is pinned);
  - P2, the harness filing `usage_limit_reached` as kind `credits`: the eight
    harness rows, U-D5, V2-U14 and V2-U15 red (the reset hold rests on the
    kind);
  - P3, rule 2 borrowing the stream's own `rate_limit_event` when the carrier
    reports no params: V-X4 reds (no reset is ever borrowed).
- **Regressions, run by the parent** under the sandbox with `--no-cache`:
  - the 31-file targeted set, 31 files and 1763 tests, all passing
    (`parent-final-targeted.20261017T100104Z.log`);
  - the whole default engine suite (`vitest.config.ts`, which excludes
    `*.agents.test.ts`), 77 files and 2974 tests, all passing
    (`parent-full-engine-suite.20261017T100237Z.log`);
  - engine `tsc --noEmit` 0 (`parent-final-engine-tsc.20261017T100114Z.log`),
    root `npm run typecheck` 0 (`parent-final-root-typecheck.20261017T100114Z.log`),
    csrd 7 in the six expected files (`parent-final-csrd.20261017T100114Z.log`).

  Each run's write summary reports 0 paths in b1b-record. The only write into
  the candidate was vitest's transient `vitest.config.ts.timestamp-*.mjs`; the
  web workspace's git-ignored `frontend/web/tsconfig.tsbuildinfo` was last
  rewritten by the implementer's root typecheck (its program includes the
  engine's `src/`), and the parent's left it unchanged.
- **Where the brief was wrong.** It said B2 would red `GOLDEN_IDENTITY`; it
  cannot, since that identity carries no invocation and the controls are
  emitted inside one. B2 reds the present-invocation golden instead, which is
  the guard intended.
- **Accepted as decided by the implementer**: the comment-only edits to
  `config.ts` and `runner.ts`; the exhaustion error's sixth parameter; the
  validation and mismatch texts; `extraUsage` as the filed key; the soft
  assertions in V2-U14 and V2-U15.
- **Nothing found that blocks review.** The new `@2` identity was taken from the
  builder and reached independently by both hand-written derivations; the
  configuration without its controls still derives the previous literal.

## The reset-hold repair (2026-10-17)

Written by a second implementer subagent from the parent's brief
`parent-impl-brief-reset-hold.20261017T101500Z.md`; its logs are `impl2-*`
in R. Offline as above: no Claude Code or `ollama` binary was run, every
Node run went through the parent's sandbox wrapper with `--no-cache`, and
each of the 24 runs' write summaries reports 0 paths in b1b-record. Only
`test/included-usage.ts`, `test/live-capture.ts`, their two test files and
this file changed. `src/` is unchanged: its 77 files hash as they did
before the repair (`impl2-start-state.20261017T111850Z.log`,
`impl2-final-state.*.log`). Nothing is committed.

### The gap

The user's reproducer: an exhausted fact `usage_limit_reached` whose
`resetsAt` is `null` (a 429 carrier reporting no params) beside an
exhausted fact `rate_limit_rejected` with a finite `resetsAt`.
`usageStopOf` filed the finite time as the stop's `resetsAt`, ignoring the
unknown one, and `assertNoResetPending` asked for an operator's review only
when that aggregate was `null`. So a new execution could start once the
finite time passed, while an exhaustion with no known reset still stood.
U-S3 pinned the gap: an exhausted fact whose reset was the string
`'1790400000'`, beside finite ones, with the stop holding the finite
maximum. With the code repaired and the tests not yet changed, U-S3 and
one V2-U9 row were the only two reds of 296
(`impl2-wip-two-files-code-only.20261017T112442Z.log`): U-S3
`expected null to be 1790099999`, and V2-U9's row for the new words below.

### The rule and the two protections

- **A usable reset** is a safe integer of epoch seconds greater than 0, as
  2.1.295's schema types `resetsAt` (the parent's static reading). Anything
  else is unknown: absent, `null`, a string (a numeric one included), a
  boolean, an object, `0`, a negative number, a fraction. Each module
  defines it for itself (`isUsableReset` in `included-usage.ts`,
  `isUsableResetTime` in `live-capture.ts`), so the guard does not share a
  defect with `usageStopOf`.
- **A relevant fact** is one of kind `exhausted` or `overage`.
- **`usageStopOf`** files the latest reset of the relevant facts when every
  one is usable, and `null` when any one is not, or there is none: the
  unresolved hold. It still carries every fact as given, in order, each
  with its own `resetsAt` as reported. The doc comments on
  `UsageStop.resetsAt`, on `usageStopOf` and in the module header's
  `usage_limit_reached` bullet say so.
- **`assertNoResetPending`**, for each finished record, after its existing
  checks:
  - a present aggregate that is neither `null` nor usable is refused by
    name. `0`, a negative and a fraction now join the non-numbers, in new
    words: `carries usageStop.resetsAt <value>, which is neither null nor a
    usable reset time (a safe integer of epoch seconds greater than 0)`.
  - The aggregate-`null` refusal stays first, in its words.
  - Then each relevant fact whose `resetsAt` is absent or unusable is
    refused, whatever the aggregate and the clock: `recorded, at
    usageStop.facts[<i>], the <kind> fact <name> with resetsAt <value as
    recorded>, which is not a usable reset time (a safe integer of epoch
    seconds greater than 0), so an operator must review it before any new
    subscription execution starts`.
  - The record holds until the latest of its aggregate and its relevant
    facts' resets, so the aggregate cannot shorten the hold. Across records
    the latest holds, as before. The refusal now names where the time was
    recorded, `usageStop.resetsAt` or `usageStop.facts[<i>].resetsAt`. A
    tie keeps the aggregate's words, so every earlier message is unchanged.
  - The check only reads. The function's comment lists what it refuses and
    says so, and the module header's summary names the new refusals.

### Tests

`test/included-usage.test.ts`, 156 → 172 (+16):

- **U-S3 rewritten**, its title with it. It now holds the latest of
  relevant facts whose resets are all usable. Another kind's reset is still
  not read, and neither is a non-relevant fact (`credits`) whose reset is
  the old string `'1790400000'`. Both stops are asserted whole.
- **U-S6** (2 rows): the reproducer, both orders → `resetsAt` `null`, both
  facts kept.
- **U-S7** (2 rows): the unknown one an `overage` fact, both orders.
- **U-S8** (9 rows): the unknown value absent, `null`, a string, a numeric
  string, `0`, `-1`, `1790079000.5`, `true`, an object.
- **U-S9**: the positive control. Every relevant reset usable gives the
  latest, an earlier-positioned later time included.
- **U-S10** (2 rows): built from a stream through
  `observeUsage`/`usageViolations`. A `usage_limit_reached` carrier without
  params and a `rate_limit_event` "rejected" at 1790075400, in both line
  orders.

Every new pure case asserts the whole stop with `toStrictEqual`, against a
second, freshly built copy of the facts, so a stop that changed a fact in
place would differ. U-S5's comment no longer says `usageStopOf` is
unchanged.

`test/live-capture.test.ts`, 140 → 159 (+19), beside V2-U14/U15, injected
launches only:

- **V2-U16** (2 rows), end to end. Row (a): the carrier first, params
  missing. Row (b): the rejected event first, the carrier's params
  `resetsAt` `"soon"`. Each asserts the filed stop whole: exhausted,
  `resetsAt` `null`, both facts with their own resets. A following
  execution one second after the known reset is then refused, before
  anything exists: the case directory is unchanged and the gate count did
  not move. These assertions come first and soft, as in V2-U14. They assert
  only the words both protections share (the record, and "so an operator
  must review it …"), so either protection can be seen to hold alone.
- **V2-U17** (12 rows), the guard alone. A hand-written record has a usable
  aggregate 1790075400 beside `rate_limit_rejected` at 1790075400 and
  `usage_limit_reached` whose reset is absent, `null`, `"soon"`, `0`, `-1`
  or `1790075399.5`, in both orders. A start one second after the aggregate
  is refused naming the fact, its position and value; nothing is created,
  no gate launches, and the record is byte-identical afterwards.
- **V2-U18**: the aggregate 1790075400 earlier than an overage fact's
  1790079000. A start between the two is refused, naming
  `usageStop.facts[1].resetsAt 1790079000`; a start exactly at it proceeds
  and completes.
- **V2-U19** (3 rows): an aggregate of `0`, `-1` or `1790075400.5` is
  refused by name.
- **V2-U20**: the positive control. The aggregate 1790079000 and every
  relevant fact usable, beside non-relevant facts with unknown resets (not
  read). A start one second before the latest is refused; a start exactly
  at it proceeds and completes. V2-U9 already held a filed stop exactly at
  its reset, and V2-U9b the latest across records. What was missing, and
  is added here, is one second before, and the facts beside the aggregate.

**Existing cases changed:** U-S3, as above. V2-U9's row for the record
`{"usageStop": {"resetsAt": "1790075400"}}` expects the new words: the rule
widened, and "neither null nor a finite number" would misdescribe `0`.
Every other existing case is unedited and green.

### Teeth

Every tooth ran through `tooth2.py` over both test files. It checked each
target's hash, copied it first, refused unless each old text occurred
exactly once, and confirmed that the mutation landed (the new text present,
the old text gone). It then showed the landed diff, ran the files under the
wrapper with `--no-cache`, restored from the copy, and confirmed the
restore by sha256. Every log ends `restore CONFIRMED by hash`.

The table cites batch 2 (`impl2-teeth-batch2.20261017T114347Z.log`), run
after V2-U17 gained its record-bytes assertion. Batch 1
(`impl2-teeth-batch.20261017T113023Z.log`) is kept. It gave the same red
sets, except that its R1 also reddened V2-GT3 on `GateTimeout` (an injected
1,000 ms gate timeout exceeded). That case touches no usage stop. It was
green in batch 1's other six teeth and in every later run: a load-timing
flake. The summary is `impl2-teeth-summary.20261017T115815Z.log`.

| Tooth | Mutation | Red (of 331) | First failure (verbatim, trimmed) | Log |
|---|---|---|---|---|
| R1 | `usageStopOf` back to the latest usable reset, ignoring unknown ones | 17: U-S6 ×2, U-S7 ×2, U-S8 ×9, U-S10 ×2, V2-U16 ×2 (the filed stop only; the following execution still refused); V2-U17 green | U-S6: `expected { kind: 'exhausted', …(6) } to strictly equal { kind: 'exhausted', …(6) }`, `-   "resetsAt": null,` `+   "resetsAt": 1790075400,` | `impl2-teeth-R1.20261017T114520Z.log` |
| R2 | the guard's unknown-fact refusal removed (`continue`) | 12: V2-U17 ×12; V2-U16 green (its aggregate is `null`) | V2-U17: `not refused: the capture returned status completed: expected { status: 'completed', …(26) } to be an instance of UsageResetPendingError` | `impl2-teeth-R2.20261017T114653Z.log` |
| R3 | R1 and R2 together | 29: R1's 17 and R2's 12; V2-U16's following execution now proceeds | U-S6 as R1. V2-U16: `the following execution: expected { status: 'completed', …(26) } to be an instance of UsageResetPendingError`, then the case directory `[ 'after', 'stopped' ]` and gate launches `expected 2 to be 1`: the reproducer, observed failing | `impl2-teeth-R3.20261017T114839Z.log` |
| R4 | a fact's later reset no longer extends the hold | 1: V2-U18 | `not refused: the capture returned status completed: expected { status: 'completed', …(26) } to be an instance of UsageResetPendingError` | `impl2-teeth-R4.20261017T115027Z.log` |
| R5 | `isUsableReset` weakened to a finite number | 3: U-S8 `0`, `-1`, fraction | `expected { kind: 'exhausted', …(6) } to strictly equal …`, `-   "resetsAt": null,` `+   "resetsAt": 1790075400,` | `impl2-teeth-R5.20261017T115158Z.log` |
| R6 | `isUsableResetTime` weakened to a finite number (aggregate and facts) | 9: V2-U17 `0`, `-1`, fraction ×2 orders; V2-U19 ×3 | V2-U17: `not refused: the capture returned status completed: …`; V2-U19 the same | `impl2-teeth-R6.20261017T115327Z.log` |
| R7 | `<` made `<=` | 4: V2-U18, V2-U20, and the existing V2-U9 and V2-U9c (each starting exactly at a reset) | V2-U9: `the execution starting exactly at the reset: expected UsageResetPendingError: refusing to start… { …(2) } to not be an instance of UsageResetPendingError` | `impl2-teeth-R7.20261017T115505Z.log` |
| R8 (extra) | the guard rewrites the record it refuses on before refusing | 12: V2-U17 ×12 | `the record after the check: expected '{"status":"failed","usageStop":{"kind…' to be '{"status":"failed","usageStop":{"kind…'` | `impl2-teeth-R8.20261017T115632Z.log` |

The earlier D4 tooth's mutation text (`resets.length === 0 ? 1790075400`)
no longer occurs in `test/included-usage.ts`. Re-running it needs a new
text, for instance `null` replaced by `1790075400` in `usageStopOf`'s
`resetsAt` line.

### Counts

- **Baseline**, the tree before the repair:
  - the 31-file targeted set, 1763 tests
    (`parent-final-targeted.20261017T100104Z.log`);
  - the default engine suite, 77 files, 2974 tests
    (`parent-full-engine-suite.20261017T100237Z.log`).
- **Finish**, all passing:
  - the targeted set, 31 files and 1798 tests
    (`impl2-final-targeted.20261017T115839Z.log`);
  - the default engine suite (`npx --no -- vitest run --no-cache`,
    excluding `*.agents.test.ts`), 77 files and 3009 tests
    (`impl2-final-full-engine-suite.20261017T120013Z.log`).
- **+35 in each, the new cases exactly**: `included-usage.test.ts` +16,
  `live-capture.test.ts` +19, no other file different.
- **One title renamed and none removed**: U-S3's. The accounting is in
  `impl2-final-counts.20261017T120211Z.log`.
- **Typechecks**: engine `tsc --noEmit` 0
  (`impl2-final-engine-tsc.20261017T120153Z.log`); root `npm run typecheck`
  0 (`impl2-final-root-typecheck.20261017T120155Z.log`).
- **csrd**: 7, in the six expected files
  (`impl2-final-csrd.20261017T120218Z.log`).

### Write locations

Each run's write summary is at the end of its log.

- The two final suites wrote, apart from temporary directories under
  `/private/var/folders` and `/private/tmp`, only vitest's transient
  `vitest.config.ts.timestamp-*.mjs` into the candidate (written and
  unlinked), and a `mkdir` of `~/.npm`.
- The typechecks wrote nothing in the candidate. The web workspace's
  `tsconfig.tsbuildinfo` was not rewritten.
- The teeth's copies are in the scratchpad's `impl2/teeth/`, each restored
  from and confirmed by hash.

### Decided while implementing (for review)

- **Which refusal comes first.** The aggregate-`null` refusal comes first,
  and the unknown-fact refusal after it. So V2-U9k, V2-U9l and V2-U14 keep
  their words, R2 leaves V2-U16 green, and the new refusal is what a
  pre-repair record (usable aggregate, unknown fact) meets.
- **The aggregate-`null` refusal keeps M4's words**, "reported no reset
  time as a number (usageStop.resetsAt null)". A fact whose reset is `0` is
  a number, but the parenthesis names the aggregate.
- **Separate definitions of "usable" in the two modules**, so R5 and R6 are
  separate teeth and the guard cannot share `usageStopOf`'s defect.
- **The hold names its source.** A tie keeps the aggregate's words, so
  V2-U9, V2-U9b, V2-U9c, V2-U9d, V2-U9m and V2-U15 are unchanged.
- **R8 and the record-bytes assertion go beyond the brief.** They test its
  statement that the check only reads.

### Runtime questions (unobserved; each waits on the probe)

1. Whether a `-p` launch can report both a `usage_limit_reached` carrier
   and a rejected `rate_limit_event`, in which order, and whether their
   resets agree.
2. Whether the pinned build ever reports `resetsAt` as anything but a
   positive integer of seconds: `0` as a placeholder, a fraction, or
   milliseconds. Milliseconds would be a safe integer and so usable, but
   about 1000 times too late: the hold would fail closed, not open.
3. Whether a 429 carrier's params report `resetsAt` at all. When they do
   not, every such stop now holds for an operator's review.

### Parent review of the repair (2026-10-17)

The parent re-ran every tooth itself with mutations it wrote again from the
code (`make_specs2.py`, refusing unless each edit's text occurred exactly
once) through its own runner (`teeth2.py`, which applies one or more edits
across files together, runs both test files under the wrapper with
`--no-cache`, restores every file from the copy taken first and confirms by
sha256).

- **`src/` unchanged**: its 77 files hash as in
  `parent-reset-hold-start-state.20261017T111804Z.log`, the parent's own
  record taken before the brief was dispatched
  (`parent-reset-hold-review-state-2.20261017T120632Z.log`, with a control
  showing the comparison reports a changed hash).
  `parent-reset-hold-review-state.20261017T120622Z.log` compared against a
  record name that does not exist, and every "CHANGED" line in it is false;
  the `-2` log corrects it.
- **Teeth** (`parent-teeth2-batch.20261017T120805Z.log`; one
  `parent-teeth2-<id>.20261017T…log` each). Every one went red, every
  restore matched, and both harness files hashed the same before and after
  the batch. The red sets equal the implementer's, case for case:
  - R1 17, R2 12, R3 29, R4 1, R6 9, R7 4, R8 12.
  - R5 3, the U-S8 rows `0`, `-1` and the fraction
    (`parent-teeth2-R5full.20261017T123159Z.log`). Its first run also
    reddened V2-GT3 on `GateTimeout` (an injected 1,000 ms gate timeout), as
    the implementer's batch 1 did once: a load-timing flake in a case this
    change does not touch; it was green on the re-run and in every suite.
  - **The reproducer, observed failing.** With both protections removed
    (R3, `parent-teeth2-R3full.20261017T123019Z.log`, full output kept),
    each V2-U16 row's following execution returned "status completed"
    where `UsageResetPendingError` was expected, and its refusal texts were
    absent. With the repair it is refused before anything is created.
  - The parent's own: X1, the guard reading `exhausted` facts only (not
    `overage`), reds V2-U18; X2, `usageStopOf` reading `exhausted` facts
    only, reds U-S7 ×2, U-S1, U-D3, V2-U2 and V2-U11.
  - Round 1's teeth on the repaired `included-usage.ts`: D4 re-pointed
    (`null` → `1790075400` in `usageStopOf`'s `resetsAt` line) reds 30; C4
    9, C5 135, D2h 1, D3 15 and P2 15, each on its intended cases.
- **Regressions, run by the parent** under the sandbox with `--no-cache`:
  the targeted set 31 files and 1798 tests
  (`parent-r2-final-targeted.20261017T123355Z.log`); the default engine
  suite 77 files and 3009 tests (`parent-r2-full-engine-suite.20261017T123527Z.log`);
  engine `tsc --noEmit` 0 and root `npm run typecheck` 0
  (`parent-r2-final-engine-tsc.20261017T123355Z.log`,
  `parent-r2-final-root-typecheck.20261017T123355Z.log`); csrd 7 in the six
  expected files (`parent-r2-final-csrd.20261017T123355Z.log`). Each run's
  write summary reports 0 paths in b1b-record.
- **Accepted as decided by the implementer**: the order of the two
  refusals, M4's words kept, a definition of "usable" in each module, the
  hold naming its source, and R8 with its record-bytes assertion.
- **Nothing found that blocks review.**

## Changed files (sha256 after the change)

| File | sha256 |
|---|---|
| `backend/engine/src/pipeline/claude-code-cli.ts` | `63749ac31d4ffbbb203cc5758c33b36aeeacc3b20c65846c2e994b1f66d07a69` |
| `backend/engine/src/pipeline/provider-adapter.ts` | `ab719af2681b1e0c51ca1eff94fbd39fdb8d692584ea1cf7ca998f2009bda0af` |
| `backend/engine/src/pipeline/identity.ts` | `7358db6c93cb3da14de01f7858da8320cc1ca76ae0c6c7e188c84fb70c9fca24` |
| `backend/engine/src/pipeline/config.ts` (comment only) | `339707df45451d193dc1325d1498243a617a7d6418c805bd73fdd28f6159180e` |
| `backend/engine/src/pipeline/runner.ts` (comment only) | `5eb51bee21ce44338a71fe11045307007c12ccb94c5b8cc682a4779227ae87b8` |
| `backend/engine/test/included-usage.ts` (and the reset-hold repair; before it `e8b90ad6…01557`) | `16f8324bad8ee4901806f9db5fbc676ca590f135f823a17d7e012bbd0753f97b` |
| `backend/engine/test/live-capture.ts` (and the reset-hold repair; before it `0e27c2ba…ba18`) | `514606fed8290a0fb7874c8d175607fbb8d38a9be42f3a7de249107107523e38` |
| `backend/engine/test/claude-code-cli.test.ts` | `d3684ff5ba893590690e1731960130299733982715ab828db8349fd09b12417f` |
| `backend/engine/test/claude-code-cli-v2.test.ts` | `6d30be1f1ae25b317a25340201cfc31be851a614b0d1767dad97980f80346542` |
| `backend/engine/test/included-usage.test.ts` (and the reset-hold repair; before it `28f0fb96…40440`) | `612cc0fcd9eae3440c379d245a088566849456dff751afee80d1b9767ada63fd` |
| `backend/engine/test/live-capture.test.ts` (and the reset-hold repair; before it `acd4b5f4…ce7c`) | `0812d71391ef18faefde3be2873f4fa37dfcb12f9c52fafe336cda6db2fffabf` |
| `backend/engine/test/pipeline-identity.test.ts` | `7de29341c52700ba5000f429bfcc9d0a3ac7fc28280f5fea538f79aa8bf486c1` |
| `backend/engine/test/provider-adapter.test.ts` | `16717509eb6ce5879c201147e375d75c61dd54221b10b7caf3c2db96d6a8e136` |
| `docs/superpowers/CHECKPOINT-opus55-pin-2.1.295.md` (one pointer line) | `a7df19c70e8436b7926dea9939b9ae3d230810c42283be811a2b27c2c78ff0d5` |

This file is new. The reset-hold repair changed only the four test-directory
files marked above and this file; every other hash is as the parent
reviewed it.
