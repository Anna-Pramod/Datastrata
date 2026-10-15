# Plan: the subscription route on Claude Opus 5.5, included Max usage only, with measured trust (v2)

- **Date:** 2026-09-25
- **Revision:** v2, after review round 1: three adversarial lenses, 50
  findings.
  - v1 is archived at
    `pilot-evidence/2026-09-24-opus55-candidate-review/plan-v1-as-reviewed.2026-09-25-opus55-subscription-migration.md`.
  - The findings are in `plan-review-digest.wf_73596780-cec.txt` there.
  - Every finding's disposition is in §5.
- **Base commit:** `651178c21e6d65314121a43456c262d3df668c6e`, in worktree
  `/Users/vivin/Documents/DataStrata/b1b-opus55-candidate` (detached). Its
  `node_modules` are symlinked read-only from the main checkout.
- **Status:** authorised offline implementation. No task has started. The
  authorisation does not cover any of these:
  - an authentication check;
  - Claude or Qwen inference;
  - an S-002 run or a probe;
  - promotion or signing.

  The user runs every `git add` and `git commit`.
- **Evidence standard:** `docs/superpowers/TEST-EVIDENCE-STANDARD.md`, all
  seven failure modes.
  - Every task carries teeth checks written as "defect → case that must go
    red, with the message read".
  - The parent re-runs every teeth check itself before dispatching the next
    task.
  - One fresh subagent per task.
- **Paths** are engine paths (`backend/engine/`) unless written from the
  repository root.

## 0. Decisions carried in

- **D-1. `claude-code-cli@2` is added beside `@1`.**
  - **`@1` stays byte-identical:** pin 2.1.226, argv, controls, projection,
    and no invocation. It stays for replay, fixtures F1–F3, and
    injected-launch tests only.
  - **`@1` cannot launch live.** The capture harness refuses `@1` for any
    execution that would spawn the real executable (no injected launch)
    before anything is created, with `SubscriptionRouteMismatchError` naming
    `@1`. It has none of the included-usage, fast-mode or exact-model
    protections.
  - **Pinned behaviour.** Characterisation tests pin `@1`'s current answer on
    each new `@2` rejection shape.
  - **Default.** The subscription route defaults to `@2`.
- **D-2. The profile is the single authority.**
  - **What it owns:** the pinned executable, the permitted model, effort, the
    output ceiling, launch controls, `--settings`, the gate allowlist, and the
    launch and gate time budgets.
  - **What derives from it:**
    - the adapter's declared invocation;
    - the identity's `invocation` (checked for mismatch in orchestration);
    - the harness transport's executable, controls and gate rules;
    - the harness summary's `pin`, `requested`, `budgets` and `unobserved`;
    - the lifetime.
  - **Test overrides.** Tests may inject `launchTimeoutMs` and `gateTimeoutMs`
    through `SubscriptionCaptureOptions`. An injected value marks the
    execution synthetic and is recorded under `budgets` with
    `injected: true`. Production injects neither.
- **D-3. The identity moves the subscription `@2` route only.**
  - **The type.** `InvocationIdentity` is
    `{ effort, maxOutputTokens, executable: { version, sha256 } }`, with every
    field required when present. It is declared by `@2`'s adapter only.
  - **Where it appears.**
    - `RoleConfig.invocation?` and `PipelineIdentityInput.invocation?`.
    - `identityPayload` emits it field by field, only when defined. Absent
      means an absent key, never `null` or `{}`.
    - `pipelineVersionFor` validates it (effort from the adapter's literal
      set, a positive safe-integer ceiling, a non-empty version, a 64-hex
      sha256) and forwards it only when defined.
  - **What doesn't move.**
    - `DEFAULT_ROLE_CONFIG` and `SUBSCRIPTION_ROLE_CONFIG_V1` carry none, so
      the HTTP identity, the S-001 recording binding and `@1`'s subscription
      identity don't move. `@1`'s identity is pinned as a literal in Task 0.
    - The scheme stays `v3`.
  - **The `@2` configuration** sets models to `claude-opus-5-5` for all three
    roles, the adapter to `@2`, and invocation from the profile.
  - **Enforcement.** Orchestration refuses a live runner whose invocation
    differs from the configuration's, or where one side has it and the other
    doesn't (`InvocationMismatchError`).
  - **Forwarding.** The capture harness's role wrapper forwards
    `inner.invocation`.
- **D-4. The pin: `@2` pins the desktop-managed 2.1.280 executable.**
  - **The file:**
    `~/Library/Application Support/Claude/claude-code/2.1.280/claude.app/Contents/MacOS/claude`,
    sha256 `862db5f39398606acd531777565505e14c792b9da72fd31df0b309b8eb55406e`,
    217,221,744 bytes, `CFBundleVersion` 2.1.280. Verified read-only on
    2026-09-24 and 2026-09-25.
  - **Why this file.** It is the only local build at or above 2.1.280. It
    knows `claude-opus-5-5`; 2.1.226 and 2.1.275 don't.
  - **Risks.**
    - The desktop app keeps only two versions (2.1.275 and 2.1.280 today), so
      the file will probably be removed within about two desktop updates. The
      pin then refuses by hash before any launch.
    - The server can refuse the build as too old
      (`claude_code_version_too_old`), which is classified by name.
  - **Alternatives, which are the user's decision before the first `@2`
    execution:**
    - **(a) Copy the desktop app bundle read-only** into a user-owned
      directory. The whole `claude.app` is copied, and the copy is checked by
      hash. There is no download and no change to any installation. The same
      sha256 means the identity doesn't move, and the copy survives desktop
      pruning. Only the profile's path changes.
    - **(b) Install a standalone copy.** This needs a network download
      (explicit permission) and runs a Claude Code binary. The native
      installer repoints `~/.local/bin/claude` away from 2.1.226, which also
      changes what the shell's `grep` and `find` wrappers run. It has a
      `cleanupOldVersions` step that may delete
      `~/.local/share/claude/versions/2.1.226`, the `@1` pin. Before any
      install, copy 2.1.226 aside and confirm it by hash. A standalone
      binary's hash differs from the desktop bundle's, so it is a new pin: it
      can still be `@2` if no `@2` execution exists yet, otherwise it is `@3`.
- **D-5. Budgets.**
  - **Output ceiling: 64,000 tokens** (`CLAUDE_CODE_MAX_OUTPUT_TOKENS`). This
    is `@2`'s own constant; the HTTP adapter's `MAX_OUTPUT_TOKENS` stays
    16,000. Thinking is always on and counts toward it. 2.1.280 honours values
    up to the model's upper limit (static). It is an identity input.
  - **Launch timeout: 1,800,000 ms. Gate timeout: 60,000 ms.**
  - **Lifetime.**
    - Formula: `maxRunAttempts × (launchTimeoutMs + termGrace + killGrace + termGrace) + gateTimeoutMs + (termGrace + killGrace + termGrace) + 60,000`.
    - For a budget of 9 at the default graces of 5,000 ms: 9 × 1,815,000 +
      60,000 + 15,000 + 60,000 = **16,470,000 ms**. A test pins this number as
      a hand-computed literal.
  - **Launch budget.** `maxRunAttempts` is at most the configuration's maximum
    role launches, 1 + prosecutorCount + 1 = 9, for `@2`. Anything more is
    refused with `SubscriptionBudgetError`, after the route, adapter and
    transport refusals and before anything is created.
  - **Input budget.** `DATASTRATA_AGENT_MAX_INPUT_BYTES` bounds the pipeline's
    launch description per launch. It does **not** bound provider input
    tokens: the CLI adds content, the tool loop re-sends the conversation, and
    cache creation is unattributed.
  - **Context boundary.** 2.1.280 states that a request over a 200K-token
    context needs usage credits. So after each `@2` launch, the harness
    compares reported `input_tokens + cache_creation_input_tokens +
    cache_read_input_tokens` with a per-launch ceiling of **190,000**, which
    is a proposed value for the user to confirm. It stops the run as usage
    stop `long_context_boundary` when the ceiling is exceeded.
  - **Feasibility risk (recorded, not resolved):**
    - S-002's closure is about 406 KB, roughly 123k tokens by the rehearsal's
      ratio.
    - The prosecutors add the reading. The adjudicator adds the reading,
      coverage and challenges.
    - The tool-loop request re-sends the turn.
    - The later roles may therefore approach 200K. Only a probe or the run
      itself can say.
  - **Where recorded.** Time budgets are operational: they go in
    `execution.json.budgets`, not in the identity.
- **D-6. Included Max usage only: prevented account-side, refused by
  observation.**
  - **User-confirmed preconditions**, recorded in the checkpoint and asked
    before any execution:
    - extra usage is off;
    - auto-reload is off;
    - no usage credits are enabled;
    - no reset card or early reset is enabled or will be used;
    - no managed-settings file exists.
  - **Residual risk:** the launch in flight can have spent before a refusal.
    Stdout is observed only when a launch ends, and stdin is closed after the
    user message, so no purchase or consent prompt can be answered.
  - **Construction (reduces, doesn't guarantee).**
    - `@2`'s controls are `@1`'s nine with the ceiling at 64,000, plus
      `CLAUDE_CODE_NO_MODEL_FALLBACK=1` and `CLAUDE_CODE_DISABLE_FAST_MODE=1`.
    - `--settings` is
      `{"switchModelsOnFlag":false,"fastMode":false,"autoContinueAtUsageLimit":false}`.
    - 2.1.280 **defaults `autoContinueAtUsageLimit` to on**. Whether
      `--settings` governs it in `-p` mode is unverified.
    - The model catalog is **not** pinned by the executable hash. The
      embedded catalog expires at **2026-09-27T14:56:08Z**, so any later
      execution runs past it with the behaviour unverified. We rely on
      `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` blocking a remote catalog
      (unverified). Setting `CLAUDE_CODE_MODEL_CATALOG` off is deferred until
      a probe shows which values it accepts.
  - **Observation (`@2` adapter): a per-event allowlist.** Every
    `rate_limit_event` must carry a `rate_limit_info` object with:
    - `status` in {`allowed`, `allowed_warning`}. `rejected` is exhaustion;
      any other value is unobserved.
    - `rateLimitType` in {`five_hour`, `seven_day`, `seven_day_opus`,
      `seven_day_sonnet`}. `overage` is refused as overage.
      `seven_day_overage_included` is refused until a probe explains it.
    - `isUsingOverage` present and `false`.
    - `overageInUse` absent or `false`.
    - `overageStatus` `rejected`. `allowed` and `allowed_warning` are
      overage. Absent is refused until a probe settles it.
    - `rateLimitGraceActive` absent.
    - No `utilization`, top-level or in `unifiedWindows`, above 1.
    - `errorCode` absent.

    Any **one** `rejected` event, anywhere, means included usage is
    exhausted. That holds even when later events are `allowed` and the result
    is a clean success: the auto-continue case.
  - **Observation (harness, `@2`).**
    - A pure `usageViolations(lines)` runs over the observations of **every**
      `@2` execution, completed or failed.
    - All facts are recorded in `usageStop.facts[]`, independently of the
      adapter's error name.
    - A completed run with any fact is withheld as `IncludedUsageUnconfirmed`
      and its result is deleted.
  - **Stopping and resuming.**
    - Exhaustion stops the run with its evidence preserved.
    - Within an execution, a window whose `resetsAt` moves earlier, or whose
      utilization falls, while the clock is still before the previously
      reported `resetsAt`, is usage stop `unnatural_reset`.
    - Before creating a new execution, the harness reads the execution root
      for earlier `usageStop.resetsAt` values. It refuses to start before the
      latest of them (`UsageResetPendingError`). A resume is always a new,
      separately approved execution.
- **D-7. Classification before generic failures, by rule priority.**
  - **Where it runs.** `@2`'s `projectResponse` parses tolerantly: it skips
    unparseable lines and remembers the first. It then runs one
    classification pass over all lines, **before** the exit check.
  - **How rules apply.** In priority order, not line order; the most costly
    fact wins:
    1. **Overage:** any overage fact from D-6 → `CliOverageError`.
    2. **Exhaustion:** `rejected` → `CliIncludedUsageExhaustedError`, carrying
       `resetsAt` and `rateLimitType`.
    3. **Credits:** an API-error kind of `model_requires_usage_credits`,
       `long_context_credits_required` or `consent_unanswered`, on an
       assistant `is_api_error_message` item or a system `api_error` event →
       `CliCreditsRequiredError`.
    4. **Long-context route:** a reported model with a `[1m]` suffix, or a
       context-1M beta in `init.betas` → `CliLongContextRouteError`. This is
       a paid route and is never normalised.
    5. **Substitution:**
       - a `fallback` content block;
       - a `fallback` assistant item;
       - system subtypes `model_fallback`, `model_refusal_fallback` and
         `model_consent_fallback`;
       - API-error kinds `model_substitution_disabled` and
         `no_allowed_fallback`;
       - a reported model other than the requested one at init,
         `message_start`, assistant (not API-error items), any `modelUsage`
         key, or any `canonicalModel`. An empty `modelUsage` is not a
         substitution.

       → `CliModelSubstitutionError`, naming the signal and line.
    6. **Refusal:**
       - `stop_reason: refusal` in any message or on the result;
       - system `model_refusal_no_fallback`;
       - API-error kind `safety_monitor_blocked`.

       → `ProviderRefusalError`, with the category and explanation as reported
       (`apiRefusalCategory` / `stop_details`). The category is never
       validated against a list.
    7. **Truncation:** `max_tokens` in any message or on the result →
       `CliOutputTruncatedError`. It calls `super(request)`, then sets its
       message to name 64,000 and its name to `CliOutputTruncatedError`.
       `anthropic-messages.ts` is not edited.
    8. **Fast mode:** `fast_mode_state` of `on` or `cooldown` at init or
       result, or `usage.speed` other than `standard` → `CliFastModeError`.
    9. **Other API-error kinds:**
       - `effort_requires_thinking` → `CliEffortRefusedError`;
       - `claude_code_version_too_old` → `CliPinObsoleteError`.
  - **API errors are not substitution.** An assistant item with
    `is_api_error_message: true` (model `<synthetic>`) is an API error. With
    no known kind, it falls through to `CliExitError` (non-zero exit) or
    `CliResultError` (naming `is_error`).
  - **This pass is the only authority** for every signal above. The later
    steps don't re-check them.
- **D-8. Strictness after classification (`@2`), in order.**
  1. The exit check (`CliExitError`).
  2. The first malformed line (`CliStreamMalformedError`).
  3. The strict lifecycle walk, with allowlists:
     - system subtypes: `init`, `status` and `thinking_tokens`, which are
       observed in real streams. Classified subtypes are handled by D-7.
       Anything else is refused, including `api_retry` and 2.1.280's seven
       new ones (`cloud_session_delta`, `cloud_session_status`, `dev_intent`,
       `peer_message_hold`, `tool_host_result`, `turn_handoff_available`,
       `turn_preempted`).
     - content blocks: `text`, `thinking`, `redacted_thinking` and
       `tool_use`. Thinking deltas: `thinking_delta` and `signature_delta`.
     - assistant items: the same set as the content blocks.
  4. Launch context, beyond today's checks:
     - `claude_code_version` equals the pin's;
     - `permissionMode` is `default`;
     - `fast_mode_state` is present at init.
  5. Result, beyond today's checks:
     - `terminal_reason` is `completed`;
     - `fast_mode_state` is present at the result.
  6. At least one rate-limit event whose status is recognised
     (`CliUsageUnobservedError`).
  7. Exactly one `modelUsage` entry.
  8. Exactly one `tool_use`, which is StructuredOutput.
  9. Stop reasons: the tool-carrying message ends in `tool_use`; every other
     message ends in `tool_use` or `end_turn`; anything else →
     `CliStopReasonError`.
  10. The tool loop and output consistency.

  Unknown means refused. Each such refusal spends a launch, so the first `@2`
  execution is a probe (§4).
- **D-9. Trust in four tiers**, recorded in every `@2` `execution.json`:
  - **Execution.**
  - **Schema validity:** the role outputs parsed at their seams, and the result
    assembled valid.
  - **Evidence validity:** from `checkResultEvidence` over `world.corpus`, the
    corpus the run authorised. Quotes and absence terms are re-found in the
    pinned document text, whitespace-collapsed and case-folded. Edges are
    found in the loaded corpus index, not restricted to the entitled closure.
    Whether evidence supports its proposition is not assessed.
  - **Substantive correctness:** always `unassessed`.

  The evidence tier is computed **after** the withhold decisions. A withheld
  run's tier is `withheld`, never `passed`. No tier contains "verified".
- **D-10. Out of this plan.**
  - Qwen code: see `specs/2026-09-25-local-qwen-assistance-design.md`.
  - The held-out evaluation: see
    `specs/2026-09-25-trust-measurement-and-evaluation-design.md`.
  - Any live execution, including the probe.

## 1. Reconnaissance at `651178c` (done 2026-09-24)

Logs are in
`/Users/vivin/Documents/DataStrata/pilot-evidence/2026-09-24-opus55-candidate-review/`.

- **Targeted set: 27 files, 807 tests, all passing**
  (`baseline-targeted-full.20260924T184330Z.log`). The files are
  `claude-code-cli`, `claude-code-cli-transport`, `live-capture`,
  `live-runner-channel`, `live-transport`, `live-wiring`, `cli-live-routing`,
  `pipeline-runner`, `process-guard`, `process-guard-precedence`,
  `offline-guard`, `offline-guard-precedence`, `pipeline-identity`,
  `provider-adapter`, `pipeline-replay`, `anthropic-messages`, `cli-run`,
  `pipeline-transcript`, `pipeline-standing`, `verification-result`,
  `verification-evidence-sets`, `verification-evidence-use`,
  `verification-pins`, `pipeline-assemble`, `pipeline-write-result`,
  `verification-sign` and `cli-sign`. Run them as
  `cd backend/engine && npx vitest run test/<file>.test.ts ...`, with exact
  paths.
- **Typecheck:** engine `npx tsc --noEmit` is 0 and root `npm run typecheck`
  is 0. The frontend compiles every `backend/engine/src/**/*.ts`.
- **csrd count:** 7, in the six expected files.
- **Shell hazard.** In Claude Code shells, bare `grep`, `find` and `rg` are
  functions that run a Claude Code binary (`$CLAUDE_CODE_EXECPATH`, the
  desktop 2.1.280, falling back to `~/.local/bin/claude`) in search mode. Use
  `git grep`, `/usr/bin/grep` or `/usr/bin/find` only.

## 2. Global constraints

- No new runtime dependency (zod only).
- **Untouched:**
  - `anthropic-messages.ts`, `transcript.ts`, `sign.ts`, `DEFAULT_ROLE_CONFIG`
    and the result schema;
  - everything under `test/verification-transcripts/`, `corpus/`,
    `knowledge/` and `verification/`;
  - the committed probe fixtures (read, never written);
  - the protected untracked files, which are absent from this worktree.
- `src/verification/` stays pure. `@1` is byte-identical. The HTTP identity,
  the S-001 binding and `GOLDEN_IDENTITY` don't move.
- **Source documents are untrusted data.** `@2` offers no tool but
  StructuredOutput, has no MCP and no setting sources, and runs with
  `--safe-mode` and `--disable-slash-commands`. The full `@2` argv is asserted
  as a literal. Evidence validity is the measurement that catches fabricated
  quotations.
- **csrd count:**
  `git -C /Users/vivin/Documents/DataStrata/b1b-opus55-candidate grep --untracked -i csrd -- backend/engine/src | /usr/bin/wc -l`
  must be 7. As a positive control, the per-file listing names exactly the six
  expected files.
- Every new file opens with a JSDoc block saying why it exists.
- **Every task finishes with:**
  - the targeted set plus the task's new files;
  - engine `npx tsc --noEmit`;
  - root `npm run typecheck`.

  Each is logged under a unique timestamped name in the review directory.
  Failed runs are kept, and no log is overwritten.
- **Baselines:** each task's baseline is the previous task's finishing count.
- **Mutations** are made on a copy taken first and restored from it; the
  restoration is confirmed by sha256. Never `git checkout`.
- **Test constants.** `@2` tests use string literals for every constant and
  never import the `@2` profile to compute an expectation.
- **Never run** `test/pipeline-live.agents.test.ts`, any Claude Code or
  `ollama` binary, or any network call.

## 3. Tasks

### Task 0: pin what must not move (tests only)

Record as literals, in `test/pipeline-identity.test.ts`:

- `pipelineVersionFor` over today's subscription configuration
  (`{...DEFAULT_ROLE_CONFIG, providerAdapter: @1}`), the real prompts and the
  S-002 closure. This is the `@1` subscription identity.
- The same over `DEFAULT_ROLE_CONFIG`. This is the HTTP identity; cross-check
  it against the S-001 recording's value
  (`pipeline-v3-06789a364d220899535cbf0cc40fcd5b816becf4328be70b795f54340d4ad7c0`).

**Teeth:** change one prompt byte on a copy of a test input → both literals
red.

### Task 1: types, profiles, transport, gate profiles

(`src/pipeline/provider-adapter.ts`, `claude-code-cli.ts`,
`claude-code-cli-transport.ts`)

**Behaviour.**

- **Types and profiles.**
  - `InvocationIdentity` and `ProviderAdapter.invocation?` are added.
  - The profile type and the two profiles follow D-1, D-2, D-4, D-5 and D-6.
    `@2`'s invocation is declared on `CLAUDE_CODE_CLI_V2_ADAPTER` only.
- **Pin paths.** Pin-path resolution is generalised to any `~`-relative pin,
  preserving spaces. `resolvePinnedCliPath` keeps its behaviour.
- **The launch spec** gains an optional `settings` string, on both the
  adapter's strict `CliLaunchSpec` and schema and the transport's schema. The
  transport's schema requires it to parse as a JSON object. `roleArgv` uses
  `spec.settings ?? '{"switchModelsOnFlag":false}'`, so `@1`'s argv and body
  are byte-identical.
- **`@2` `buildRequest`.**
  - A model outside the permitted list is refused before anything is launched
    (`CliModelNotAllowedError`).
  - The spec carries effort `high` and the settings.
- **The gate is per profile.**
  - `@1` keeps today's allowlist and rules.
  - `@2`'s allowlist adds `analyticsDisabled`, `projectsDirectory` and
    `configDirectory`.
  - The two directory keys are identifier fields: `PRESENT` or `ABSENT` only,
    and never reproduced.
  - `@2` requires `analyticsDisabled === true`. This is a probe question:
    whether it follows `DISABLE_TELEMETRY`.
  - `runGate` takes the gate rules from the transport options.
- **`CliOutputTruncatedError`** is constructed as described in D-7.

**Tests.**

- **C1-v2 and C2-v2 as literals:**
  - the identity;
  - the pin's path, version, sha256 and size;
  - the resolved path for `/Users/someone`, with its spaces;
  - permitted models, effort and the settings string;
  - all 11 controls with their values;
  - the timeouts;
  - `MAX_OUTPUT_TOKENS` still 16,000, and `@2`'s ceiling 64,000 and different
    from it;
  - the declared invocation.
- **`@1` stays byte-identical.** `@1`'s adapter has no `invocation`, and its
  argv and body are unchanged.
- **`@2` argv.** `@2`'s `buildRequest` runs through a transport with an
  injected launch. The full argv equals a literal: model `claude-opus-5-5`,
  `--effort high`, the settings literal, `--safe-mode`, `--tools ''` and the
  rest.
- **Settings.** A non-object settings string is refused.
- **Gate.**
  - A 2.1.280-shaped `auth status` passes the `@2` gate, and neither directory
    value appears in the gate result.
  - `analyticsDisabled: false` blocks the gate.
  - An unknown key still blocks it.
  - `@1`'s gate with the 2.1.280 shape blocks, as today.

**Teeth.**

1. One profile constant changed on a copy → C1-v2 reds, naming that field.
2. The settings fallback taken for `@2` → the argv literal reds at the
   settings element.
3. The directory keys taken off the identifier list → the "no directory
   value" case reds.
4. `--tools ''` dropped from `roleArgv` → both the `@1` and the `@2` argv
   literals red.

### Task 2: the `@2` projection (`src/pipeline/claude-code-cli.ts`)

**Behaviour:** D-7 and D-8 exactly. `@1`'s `projectResponse` is unchanged.

**Tests.** Every rejection asserts its error class and a message fragment
naming the signal and the line.

- **A literal-only `@2` stream builder**, never importing the profile: CLI
  2.1.280, `claude-opus-5-5`, one compliant `rate_limit_event`,
  `fast_mode_state` `off` at init and result, and `status` and
  `thinking_tokens` events. It serves as the **accepted control**, together
  with:
  - an empty progress-update `thinking` block;
  - `redacted_thinking`;
  - `status` `allowed_warning`;
  - `usage.speed` and `canonicalModel` absent.
- **Real-shape cases** from the committed fixtures, read and never written.
  The literal transform replaces `claude-opus-5` with `claude-opus-5-5` and
  `2.1.226` with `2.1.280`, then adds the missing `@2` fields as literals:
  - F1-v2 → accepted;
  - F3-v2 at exit 1 → `CliExitError`;
  - F2-v2 at exit 0 → `CliResultError`;
  - F3-v2 plus a `rejected` event → `CliIncludedUsageExhaustedError`.
- **Lone cases, one per rule:**
  - every D-6 allowlist value;
  - every D-7 rule, each with exit 0 and with exit 1;
  - each substitution position;
  - each API-error kind;
  - `model_refusal_no_fallback` → `ProviderRefusalError` carrying the
    category;
  - result-only refusal;
  - a refusal whose message never completes, at exit 1;
  - `max_tokens` in the tool-carrying message and in another message, each
    with a message matching /64000/ and not /16000/, and
    `instanceof ProviderOutputTruncatedError`;
  - `fast_mode_state` `on` or `cooldown` at init only, and at result only;
  - speed `fast`;
  - init `fast_mode_state` absent;
  - `permissionMode` `acceptEdits`;
  - `terminal_reason` other than `completed`;
  - another CLI version;
  - an unknown or new system subtype;
  - an unknown block type (for example `server_tool_use`);
  - an unknown assistant item;
  - an unknown thinking delta;
  - a non-tool message ending in `pause_turn` → `CliStopReasonError`;
  - two `modelUsage` entries;
  - `modelUsage` `{}` with an API error, which is not a substitution;
  - the category `frontier_llm` carried through unchanged.
- **Controls and precedence.**
  - A clean stream at exit 1, with `SIGTERM`, with exit 0 plus `SIGKILL`, and
    with empty stdout at exit 1 → `CliExitError`.
  - One case per adjacent priority pair, with the higher-priority signal on a
    **later** line.
  - A `rejected` event followed by `allowed` events and a clean success at
    exit 0 → exhausted.
  - An overage event followed by a malformed line → overage.
- **`@1` characterisation**, in the style of G5 and G7: one case per new `@2`
  rejection shape, asserting `@1`'s current answer.

**Teeth.**

1. Classification after the exit check → the exhausted-at-exit-1 case reds,
   naming `CliExitError`.
2. Line order instead of rule priority → the exhausted-versus-substitution
   pair reds.
3. Exhaustion ordered before overage → the overage-then-rejected case reds.
4. `fallback` removed from the substitution signals → the fallback-block case
   reds, naming `CliStreamLifecycleError`.
5. The block allowlist removed → the `server_tool_use` case reds (accepted).
6. `canonicalModel` removed → its case reds (accepted).
7. The `<synthetic>` API-error exemption removed → F3-v2 reds, naming
   `CliModelSubstitutionError`.
8. `model_refusal_no_fallback` treated as substitution → its case reds.
9. `overageStatus` rule back to `=== 'allowed'` → the `allowed_warning` case
   reds.
10. Rate-limit presence dropped → the no-event case reds.
11. Classification restricted to the last rate-limit event → the
    `rejected`-then-`allowed` case reds.
12. Truncation message not overridden → the /64000/ case reds on 16000.
13. The credit-kind rule removed → the `model_requires_usage_credits` case
    reds, naming `CliExitError`.
14. Tolerant parse removed → the overage-then-malformed case reds, naming
    `CliStreamMalformedError`.

### Task 3: the identity carries the invocation

(`config.ts`, `identity.ts`, `orchestrate.ts`, `runner.ts`, `live-runner.ts`)

**Behaviour:** D-3.

**Tests.**

- **`provider-adapter.test.ts`, beside `GOLDEN_IDENTITY`.** The existing
  golden is the absent-invocation case.
- **A present-invocation golden derived independently.** The test
  hand-writes the canonical JSON payload with sorted keys, hashes it with
  `node:crypto`, prefixes `pipeline-v3-`, and compares.
- **"Moves when"** for effort, `maxOutputTokens`, executable version and
  executable sha256.
- **An extra nested key does not move the digest** (field-by-field
  emission).
- **`pipelineVersionFor` level:**
  - the `@2` configuration versus the same with a ceiling of 63,999 differs;
  - it differs from the same configuration with the invocation removed;
  - `SUBSCRIPTION_ROLE_CONFIG_V1` equals Task 0's literal;
  - `DEFAULT_ROLE_CONFIG` equals the HTTP literal.
- **Invalid invocations** (bad sha256, bad ceiling) are refused.
- **Orchestration.**
  - A mismatch is refused, with the same adapter identity on both sides, for
    three cases: the invocations differ, the configuration has one and the
    runner doesn't, and the runner has one and the configuration doesn't.
  - Positive controls: equal invocations pass; `@1` with the `V1`
    configuration passes; replay is exempt.
- **Unchanged:** `pipeline-replay.test.ts`.

**Teeth.**

1. Absent encoded as `null` → `GOLDEN_IDENTITY` and the S-001 binding red.
2. `pipelineVersionFor` not forwarding the invocation → the 63,999 case reds.
3. The mismatch check removed → the three cases red, and the controls stay
   green.

### Task 4: evidence validity as a pure measurement

(`src/verification/evidence-validity.ts`, new; `docs/evidence-use.md`, one
sentence)

**Behaviour.**

- `checkResultEvidence(result, corpus)` → `{ ok, sets: [{ recordPath, label, ok, problems }] }`,
  built from `evidenceSetsOf` and `checkEvidenceSet`.
- `sign.ts` is not modified.
- The one sentence in `docs/evidence-use.md` that says a written result
  proves every quote exists is corrected.

**Tests.**

- **Accepted control.**
- **One failing set in each of the three kinds**, with literal `recordPath`s:
  `reading.elements[].evidence`, `challenges[].evidence` and
  `challenges[].adjudicationEvidence`.
- **A fixture where only the last set fails.**
- **Fabricated text** on the pinned docId and hash.
- **An absence term that is present** in the text.
- **Equivalence with `assertSignable`.** Over schema-valid fixtures, the
  failed sets' `${label}: ${problems.join('; ')}` equal the `evidence_failed`
  details.
- **Purity test** (new): no `src/verification/*.ts` imports `node:*`, bare
  `fs` or `path`, uses `require(` or `import(`, or value-imports
  `../corpus/store`. It asserts that the scanned list includes `sign.ts` and
  `evidence-validity.ts`.

**Teeth.**

1. `checkEvidenceSet` bypassed → the fabricated case reds.
2. One kind filtered inside `checkResultEvidence` → equivalence reds, naming
   that label.
3. A copy of `evidence-validity.ts` with `import { readFileSync } from
   'node:fs'` planted, restored by hash afterwards → the purity test reds,
   naming the file.

### Task 5: wiring and the capture harness

(`src/cli/live-wiring.ts`, `test/live-capture.ts`, and the local timeout name
in `test/pipeline-live.agents.test.ts`)

**Behaviour.**

- **Wiring.** Register `@2`. `isSubscriptionRoute` matches by id, and the
  HTTP-path refusal at `live-capture.ts:789` matches any `claude-code-cli`
  identity.
- **Configuration.**
  - `subscriptionRoleConfigFor(adapter)` returns the configuration for either
    adapter.
  - `SUBSCRIPTION_ROLE_CONFIG` is `@2`'s; `SUBSCRIPTION_ROLE_CONFIG_V1` is
    exported.
  - `runSubscriptionCommand` uses the configuration for the adapter it is
    given.
  - The role wrapper forwards `invocation`.
  - `@1` is refused for spawn executions (D-1).
- **Profile-derived transport.** From the profile: the transport's
  executable, controls and gate rules, and the summary's `pin`, `requested`,
  `budgets` and `unobserved`. For `@2`, `unobserved` states:
  - the ceiling is 64,000 (honoured statically) and the wire `max_tokens` is
    unobserved;
  - effort is passed but its application is unobserved;
  - thinking is always on and counts toward the ceiling;
  - the model catalog is not pinned.

  A pure `subscriptionExecutableFor(adapter, home)`.
- **Budgets:** D-5. The launch timeout goes to the runner. The gate runs under
  its own controller: on timeout it is filed as `{ name: 'GateTimeout' }` with
  cancellation reason `gate_timeout`. Test overrides follow D-2.
  `SubscriptionBudgetError` follows D-5's ordering. `subscriptionLifetimeMs`
  follows D-5.
- **Reset pending.** The check from D-6 runs before `prepareExecutionDir`.
- **Observation.** `observeStream` gains, per launch:
  - `reportedModels` (init, `messageStart[]`, `assistant[]`, the `modelUsage`
    keys and canonical models);
  - `cliVersion` and `initBetas`;
  - `rateLimits[]` (every `rate_limit_info` field named in D-6, plus
    `utilization`, `unifiedWindows`, `surpassedThreshold`, `overageScope`,
    `canUserPurchaseCredits` and `hasChargeableSavedPaymentMethod`);
  - `fastMode` (init and result state, reason, and speed);
  - `stops[]` (stop reason and category, never the explanation);
  - `apiErrors[]` (kinds);
  - counts of `blockTypes` and `systemSubtypes`;
  - `reportedContextTokens` (input + cache creation + cache read).
- **Usage stop:** D-6 and D-5's `long_context_boundary`. `usageStop` is
  `{ kind, facts[], seq, role, index, resetsAt }`, with the note that a resume
  is a new, separately approved execution. The facts come from the pure
  `usageViolations` over the observations of every `@2` execution:
  - `rate_limit_rejected`;
  - `is_using_overage`;
  - `overage_in_use`;
  - `overage_status_not_rejected`;
  - `rate_limit_type_not_included`;
  - `grace_active`;
  - `utilization_over_1`;
  - `rate_limit_error_code`;
  - `rate_limit_unobserved` (per role launch);
  - `fast_mode_init`;
  - `fast_mode_result`;
  - `speed_not_standard`;
  - `credits_required`;
  - `long_context_boundary`;
  - `unnatural_reset`.

  A static test checks that `usageViolations` imports only types from
  `claude-code-cli.ts`.
- **Trust:** D-9, computed after the withhold decisions, with the evidence
  tier over `world.corpus`. `runSubscriptionCommand` returns the stage it
  reached, the world, and the written result.

**Tests** (dummy-CLI and injected-launch patterns). `@2` gets its own
environment constant with `maxRunAttempts` 9.

- **`@2` end to end (9 role launches), asserting:**
  - the dummy writes its environment per launch, and all 11 control values
    match literals, including `CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000`;
  - the full recorded argv matches a literal;
  - `requested.pin` is 2.1.280 and `862db5f3…`, with `injected: true`;
  - `unobserved` names 64,000;
  - `budgets` is 1,800,000, 60,000 and 16,470,000, with `injected: false`;
  - the whole trust block, with evidence `passed`;
  - the `runId` differs from `@1`'s and from the HTTP one.
- **Explicit `@1` injected capture:** 9 controls at 16,000, the 2.1.226 pin,
  and 16,000 in `unobserved`.
- **Pure:** `subscriptionExecutableFor(@2)` returns the `@2` pin's path,
  sha256 and size.
- **`@1` spawn execution** refused before any directory exists.
- **Stops.** Exhausted at launch 2, plus overage, credits, substitution,
  refusal, fast mode, long-context boundary, unnatural reset and reset
  pending. Each asserts: status `failed`, the error name, the full
  `usageStop`, the role launches counted, no transcript, the stream filed,
  and trust evidence `unassessed`.
- **A launch killed at an injected launch timeout** whose partial stdout
  shows `rejected` → `usageStop` exhausted.
- **Backstop.**
  - Each `usageViolations` fact alone, with a clean control.
  - A test adapter carrying `@2`'s identity and invocation whose projection
    skips the overage rule, over an overage dummy → failed,
    `IncludedUsageUnconfirmed`, result deleted, `transcriptPath` null, trust
    evidence `withheld`.
- **Budgets.**
  - The `subscriptionLifetimeMs(9)` literal is 16,470,000.
  - Budget 9 succeeds (end to end).
  - Budget 10 → `SubscriptionBudgetError` naming 9, with no root directory
    and zero gate launches.
  - E6 keeps its error.
  - Hanging gate: gate timeout 200 ms, deadline 5,000 ms → `GateTimeout` and
    `gate_timeout`, elapsed under 5,000 ms, no role launch.
  - Hanging launch: an injected launch timeout → outcome `timeout`, not
    `cancelled`.
- **Malformed output.** A role output failing its seam schema → schema
  `invalid`, evidence `unassessed`.
- **Evidence failure.** A completed run whose result carries a quote with a
  pinned docId and hash but fabricated text → evidence `failed`, naming the
  set.
- **The trust block in every stop and withhold case**, including
  `TerminationUnconfirmed` and `SensitiveOutputWithheld` → `withheld`.
  `JSON.stringify(trust)` never matches /verified/i; as a positive control,
  the end-to-end block contains `passed`.
- **P5, extended** with a distinct string per model position, `overageInUse`
  true, result `fast_mode_state` `on`, speed `fast`, and a stop carrying a
  category and an explanation (the explanation absent from the output).
- **Wiring.**
  - W9 extended: `verify run` refuses `@2`.
  - The HTTP-path `@2` twin → `CaptureRouteConflictError` (the identity rule's
    message), with the canned transport never called.
  - Line 1490 is split into one assertion per message.
- **Deliberately changed tests, each with its old and new assertion stated in
  the task report.**
  - W0: adds the `@2` key.
  - S1: the new default.
  - P5: the new fields.
  - F1-subscription: moves to an `@2` dummy with budget 9 and
    `subscriptionLifetimeMs`.
  - E1: passes `@1` explicitly.
  - The `captureSubscription` helper: passes `@1` explicitly.

  The existing `@1` assertion lines don't change: confirmed by diff.
- **Agents test:** the local `subscriptionLifetimeMs` becomes
  `subscriptionTestTimeoutMs`, computed from the export. A static check shows
  it uses the route-aware function.

**Teeth.**

1. Exact-version `isSubscriptionRoute` → the `@2` capture-only case reds.
2. The budget cap removed → the budget-10 case reds.
3. The gate timer removed → the hanging-gate case reds, naming
   `deadline of 5000 ms`.
4. Evidence tier derived from "written" → the fabricated-text case reds.
5. The evidence tier computed before withholding → the withheld case reds,
   naming `passed`.
6. The harness passing `LAUNCH_CONTROL_ENV` → the environment-values case
   reds on `CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000`.
7. The wrapper not forwarding `invocation` → the end-to-end case reds, naming
   `InvocationMismatchError`.
8. The post-drain `usageViolations` call removed → the backstop case reds
   with status `completed`.
9. Each `usageViolations` fact removed → its lone case reds.
10. The `@1` spawn refusal removed → its case reds.
11. The reset-pending check removed → its case reds.
12. The profile launch timeout not passed to the runner → the hanging-launch
    case reds with `cancelled`.

### Task 6: documents and the checkpoint

**The trust spec** takes D-9's exact wording on edges and comparison
(`specs/2026-09-25-trust-measurement-and-evaluation-design.md`, already
drafted; align it). **The Qwen spec** is already drafted.

**`docs/superpowers/CHECKPOINT-opus55-migration.md`** is in the established
shape. It carries:

- the counts, teeth table and decisions;
- the D-6 preconditions, for the user to confirm;
- the pin alternatives (D-4);
- the date-bound catalog expiry;
- the S-002 context-boundary feasibility risk (D-5);
- the note that the external S-002 package prepared on 2026-09-24 runs `@1`,
  is now refused for spawn by D-1, and is superseded, not modified;
- **Unverified until a probe:**
  - rate-limit event emission per launch;
  - `fast_mode_state` under `DISABLE_FAST_MODE`;
  - exact model strings, including `[1m]` and auxiliary keys;
  - whether effort is applied;
  - the shapes of thinking-display updates;
  - how the tripwire and refusals surface;
  - whether the `--settings` keys are accepted, including
    `autoContinueAtUsageLimit`;
  - whether `--setting-sources ''` excludes `~/.claude`;
  - whether a managed-settings file is present;
  - the model catalog source;
  - structured-output retraction;
  - `api_retry` under retries 0;
  - whether `analyticsDisabled` follows `DISABLE_TELEMETRY`;
  - how `seven_day_overage_included` and an absent `overageStatus` behave.

## 4. The bounded validation sequence (after the candidate is reviewed and committed; each step a separate approval)

1. **A minimal-shape probe.**
   - Through the `@2` harness path, from Terminal.app, after the D-6
     preconditions are confirmed.
   - One gate and one role launch.
   - A tiny synthetic prompt and schema (not S-002 and not corpus text), with
     evidence filed outside the repository.
   - Purpose: to confirm or amend each strict rule in the §3 Task 6
     "unverified" list. Any amendment is a plan change reviewed before step 2.
2. **The synthetic three-role rehearsal on `@2`.** A new external package
   reusing the frozen R-SYNTH inputs; the prompts are unchanged.
3. **The data-terms approval** (the checkpoint's standing item) and the
   S-002 context-boundary estimate from step 2's reported tokens.
4. **One S-002 capture.** A new package, the `@2` default, at most 9 launches,
   with the D-5 budgets.
5. **Review and signing** through the existing workflow, which is the only
   path to `verified`. Held-out evaluation work follows the trust spec,
   separately.

## 5. Review round 1: dispositions

**Legend:** A = accepted as proposed; M = accepted with the modification
noted; D = deferred, with the reason.

| Finding | Disposition |
|---|---|
| feasibility 1 (`@1` declaring invocation) | A → D-1, D-3, Task 1 |
| feasibility 2 (wrapper not forwarding) | A → D-3, Task 5 teeth 7 |
| feasibility 3 (`pipelineVersionFor` not forwarding) | A → D-3, Task 3 |
| feasibility 4 (duplicate rules) | A → D-7 "only authority", Task 2 teeth 4–6 |
| feasibility 5 (rate-limit denylist) | A → D-6 allowlist |
| feasibility 6 (`max_tokens` unreachable) | A → D-7 rule 7 |
| feasibility 7 (timeouts not injectable) | A → D-2 overrides, Task 5 |
| feasibility 8 (unnamed reds: W0, F1, E1, E6, helper) | A → Task 5 "deliberately changed" |
| feasibility 9 (harness hard-coded to `@1`) | A → Task 5 "profile-derived" |
| feasibility 10 (truncation error construction) | A → D-7 rule 7 |
| feasibility 11 (adapter spec `settings`) | A → Task 1 |
| feasibility 12 (priority, tolerant parse, empty `modelUsage`) | A → D-7 |
| feasibility 13 (equivalence fixtures) | A → Task 4 |
| feasibility 14 (corpus for the evidence tier) | A → D-9 `world.corpus` |
| feasibility 15 (golden location) | A → Task 3 |
| feasibility 16 (agents-test shadowing) | A → Task 5 |
| feasibility 17 (typecheck per task) | A → §2 |
| evidence-standard 1 (`<synthetic>` misclassified; builder shares assumptions) | A → D-7, Task 2 real-shape cases, teeth 7 |
| evidence-standard 2 (double mechanisms; teeth 2 and 3 vacuous) | A → Task 2 teeth 4–6, class asserted per case |
| evidence-standard 3 (`@1` invocation; `@1` identity unpinned) | A → Task 0, D-3 |
| evidence-standard 4 (`pipelineVersionFor` path; golden from code under test) | A → Task 3 independent golden |
| evidence-standard 5 (no literal `@2` constants) | A → Task 1 C1-v2 and C2-v2, §2 literal rule |
| evidence-standard 6 (child never observed) | A → Task 5 environment-values case and teeth 6 |
| evidence-standard 7 (exit controls, precedence placement) | A → Task 2 controls and precedence, teeth 1–3 |
| evidence-standard 8 (lone cases) | A → Task 2 lone cases |
| evidence-standard 9 (backstop facts and reachability) | A → Task 5 facts list, test adapter, teeth 8 and 9 |
| evidence-standard 10 (lifetime formula and tests) | M → D-5 formula; the literal is **16,470,000** (the review's 16,395,000 omitted the drain and margin terms) |
| evidence-standard 11 (trust states untested; order) | A → D-9, Task 5 trust cases and teeth 5 |
| evidence-standard 12 (unnamed changed tests; `@1` characterisation) | A → Task 5, Task 2 |
| evidence-standard 13 (evidence kinds; purity control) | A → Task 4 |
| evidence-standard 14 (csrd count misses untracked files) | A → §2 `--untracked` |
| evidence-standard 15 (HTTP-path `@2` twin) | A → Task 5 wiring |
| safety-policy 1 (denylist; `allowed_warning` and others) | A → D-6 |
| safety-policy 2 (priority; malformed line hides overage; facts on failed runs) | A → D-6, D-7, Task 2 teeth 3 and 14 |
| safety-policy 3 (API-error kinds) | A → D-7 rules 3, 5, 6 and 9 |
| safety-policy 4 (input budget versus the 200K context boundary; `[1m]`) | M → D-5 (the 190,000 per-launch ceiling is a proposed value for the user to confirm), D-7 rule 4 |
| safety-policy 5 (`model_refusal_no_fallback`) | A → D-7 rule 6, Task 2 teeth 8 |
| safety-policy 6 (gate keys on 2.1.280) | A → Task 1 gate profiles; `analyticsDisabled === true` is a probe question |
| safety-policy 7 (`@1` live-runnable) | A → D-1 spawn refusal |
| safety-policy 8 (profile not enforced where the child is observed) | A → Task 5 |
| safety-policy 9 (`autoContinueAtUsageLimit` default on) | A → D-6, Task 2 and Task 5 cases |
| safety-policy 10 (reset cards; natural reset) | A → D-6 preconditions, `unnatural_reset`, reset pending |
| safety-policy 11 ("by construction" overclaims) | A → D-6 title, preconditions, residual risk. The transport-streaming abort is **D**: a follow-up once the probe shows event timing |
| safety-policy 12 (effort unobserved; stale `unobserved` text) | A → Task 5 `unobserved`; the managed-settings precondition goes in D-6 |
| safety-policy 13 (pin alternatives) | A → D-4 |
| safety-policy 14 (probe first; unverified list) | A → §4 step 1, Task 6 |
| safety-policy 15 (model catalog) | A → D-6; the `CLAUDE_CODE_MODEL_CATALOG` value is **D** until the probe |
| safety-policy 16 (fast-mode rule mismatch) | A → D-7 rule 8 and D-8 (present at init and result; `cooldown` refused) |
| safety-policy 17 (untrusted data; full argv literal) | A → §2, Task 1 teeth 4 |
| safety-policy 18 (edge wording) | A → D-9, Task 6 aligns the spec |
