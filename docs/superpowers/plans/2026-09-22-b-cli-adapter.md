# B-CLI-ADAPTER — a capture-only subscription route through the pinned Claude Code CLI

**Date:** 2026-09-22
**Base:** `1104e8f` *Account for every live attempt before it can spend, and file executions apart from recordings* (branch `feature/b1b-ii-a-record`)
**Status:** authorised offline implementation. No live rehearsal, no S-002 run, no promotion, no signing. The user runs every `git add` and `git commit`.
**Evidence standard:** `docs/superpowers/TEST-EVIDENCE-STANDARD.md` governs every task's teeth check below. Every teeth check names the defect it detects; the parent re-runs every one before dispatching the next task.

**Path convention.** `src/…` and `test/…` are relative to `backend/engine/`; `docs/…` is repository-root-relative.

---

## 0. Decisions carried in

Settled by the user on 2026-09-22 after the accepted synthetic probe (`pilot-evidence/run-live-20260922T062542Z-11315-a5ea08`, verdict accepted, reviewer-verified).

| # | Decision |
|---|---|
| D-1 | A second provider adapter, identity **`claude-code-cli@1`**, reaches Claude through the pinned Claude Code CLI on the Max subscription. `anthropic-messages@1` is unchanged and stays the default selection. |
| D-2 | The pinned executable (`~/.local/share/claude/versions/2.1.226`, SHA-256 `013a1cf17df5ff1dcc189d5d6fd3fdd5f097ddc3cd41aa9992e99805574febbe`, 279 661 952 bytes) is a constant inside the adapter; moving the pin moves the adapter version. |
| D-3 | **Capture-only.** `verify run` refuses the identity by name. Only `captureLiveRun`'s subscription path constructs a runner, after an execution-scoped authentication gate. |
| D-4 | The channel is identified **before execution**, from the adapter, never inferred from a response. Records distinguish transport calls attempted from children actually started. HTTP attempt counts under this channel are unknown and are recorded as unknown. |
| D-5 | Evidence-observation failures keep their identity, are accounted for once, and halt the run. Cleanup of every active child is awaited before the final execution status is written; operator interruption goes through the same path; a second interrupt escalates termination. |
| D-6 | The 16 000-token output ceiling and the thinking configuration are recorded as **configured / unobserved** at the wire level. No long-output experiment. |
| D-7 | Qwen integration, multi-model orchestration and ordinary `verify run` subscription support are out of scope. |
| D-8 | Offline safety: no real CLI execution, no authentication check, no provider call. Only explicitly registered local dummy processes may run under the default suite. |

## 1. Reconnaissance at `1104e8f`

| Gate | Value |
|---|---|
| Engine tests / files | **1797 / 68** (`npx vitest run`, 2026-09-22) |
| `typecheck` | 0 |
| `grep -ri csrd src/` | 7 hits, per `CLAUDE.md` |
| Role dispatch | sequential: one `runner.run` await in `agent-role.ts`; `runProsecutors` loops in order |
| Runner record contract | `AttemptRecord` and `BudgetLedger` in `live-runner.ts`; `possiblyBilled = usage === null` on the HTTP success path; `#emit` books once then observes; observer failure → `ObservationFailedError`, runner halted |
| Capture harness | `test/live-capture.ts`: one lifetime `AbortController`, `attempts.jsonl`, `execution.json` written at start (`running`) and at end |
| Offline guard | `test/setup/offline-guard.ts` from `setupFiles`, precedence proved by `offline-guard-precedence.test.ts` |

## 2. Global constraints

- No new runtime dependency. `node:child_process` is built in.
- `src/verification/` untouched. `grep -ri csrd src/` stays at seven.
- `anthropic-messages.ts`, `transcript.ts`, every recording under `test/verification-transcripts/`, the two protected untracked files and the external probe evidence are untouched.
- Every file opens with a JSDoc block saying why it exists.
- Baseline for each task is the previous task's finishing count.
- Mutations are made on a copy, restored from the copy, and restoration is confirmed by hash.

---

## 3. Task 1 — channel-aware records in the runner (backwards compatible)

**Files:** `src/pipeline/live-runner.ts`, `src/pipeline/provider-adapter.ts`, `test/live-transport.test.ts` (+ new cases).

### Interface additions (all optional or additive)

```text
provider-adapter.ts
  ProviderAdapter.channel?: 'http' | 'process'        absent = 'http'

live-runner.ts
  ProcessFacts {
    started: boolean                 a child process was actually spawned
    pid: number | null
    exitCode: number | null
    signal: string | null
    durationMs: number
    stdoutBytes: number, stderrBytes: number
    promptFileBytes: number | null, stdinBytes: number | null
    promptFileRemoved: boolean | null,  promptFileRemovalError: string | null
    termination: { forced: boolean, processGroupMade: boolean, signalsSent: string[],
                   childReaped: boolean, groupGone: boolean | null } | null
  }
  ProviderHttpResponse.process?: ProcessFacts
  AttemptRecord.channel: 'http' | 'process'            ALWAYS present on new records
  AttemptRecord.launched?: boolean                      process channel: facts.started
  AttemptRecord.process?: ProcessFacts
  AttemptRecord.usageSource?: 'provider_envelope' | 'cli_report'
  AttemptOutcome gains 'observation_failed'
  BudgetLedger.attemptUnit: 'http_attempt' | 'cli_launch'
  BudgetLedger.httpAttemptsObserved: number | null      attemptsUsed for http; null for process
  BudgetLedger.launchesStarted: number                  process: children started; http: 0
  class EvidenceObservationFailedError extends Error    base class; transports throw it (or a subclass)
  class ProcessTransportError extends Error { process: ProcessFacts }   thrown by process transports on abort
```

### Behaviour

- Channel comes from `adapter.channel ?? 'http'`, fixed at construction, stamped on **every** record including `not_sent`, `cancelled` before send, spawn failure and observer failure.
- Process channel, success path: `status: null` (no HTTP status was observed; a synthetic 200 is never recorded), `launched: response.process.started`, `possiblyBilled: launched` regardless of usage, `usageSource: 'cli_report'` when usage is non-null. `RETRYABLE_STATUSES`, `retry-after` and `diagnose` never apply: a response with `process` present goes to projection unconditionally.
- Process channel, thrown path: any error carrying `.process` (duck-typed: object with boolean `started`) contributes `launched` and `process` to the record; `possiblyBilled = launched`. Cancelled/timeout classification is unchanged (from `controller.signal.reason`). `TransportFailure('before_send')` with `started: false` keeps its retry semantics.
- `EvidenceObservationFailedError` thrown by a transport: one record, outcome `observation_failed`, `sent: true`, `launched`/`process` from the error if present, `possiblyBilled = launched`; runner sets `#halted` to that error and rethrows **it**, never wrapping it in `ProviderAmbiguousFailureError`.
- HTTP channel: every record and ledger field is identical to today, plus `channel: 'http'`, `attemptUnit: 'http_attempt'`, `httpAttemptsObserved: attemptsUsed`, `launchesStarted: 0`.

### Tests

- Regression: replay every existing HTTP case; assert records deep-equal the pre-change shape once the three new fields are removed (a helper strips them), and that `channel === 'http'` everywhere.
- New: process-channel fake transport: (a) success → `status null`, `possiblyBilled true`, usage tagged; (b) throw with `process.started false` before send → `possiblyBilled false`, retried per `before_send`; (c) abort with `ProcessTransportError` → `cancelled`, facts retained; (d) `EvidenceObservationFailedError` → outcome `observation_failed`, same error instance rethrown, next `run()` refuses with it, exactly one record.

### Teeth checks (defect → case that must go red, message read)

- T1-a: stamp channel only in the success branch → (c) reds on `channel`.
- T1-b: `possiblyBilled = usage === null` on the process path → (a) reds on `possiblyBilled`.
- T1-c: wrap the observation error in `ProviderAmbiguousFailureError` → (d) reds on `toThrow(sameInstance)`.
- T1-d: remove the `process`-present short-circuit so a process response with `status: null` reaches `diagnose` → (a) reds.

---

## 4. Task 2 — the adapter, pure

**Files:** `src/pipeline/claude-code-cli.ts`, `test/claude-code-cli.test.ts`, `test/fixtures/claude-code-cli/README.md`, `test/fixtures/claude-code-cli/probe-accepted.stream.jsonl`, `test/fixtures/claude-code-cli/probe-auth-failed.stream.jsonl` (byte copies of the two sanitised probe streams; sources preserved; README labels them derived evidence).

### Identity and constants

`CLAUDE_CODE_CLI_IDENTITY = { id: 'claude-code-cli', version: '1' }`, `channel: 'process'`. `PINNED_CLI = { path: '~/.local/share/claude/versions/2.1.226' (resolved against HOME at use), version: '2.1.226', sha256, sizeBytes }`. `MAX_OUTPUT_TOKENS` reused from `anthropic-messages.ts` (export already exists). `LAUNCH_CONTROL_ENV`: the nine variables and values from the probe.

### `buildRequest(request, config)`

Refuses `config.apiKey !== ''` by name (`ApiKeySuppliedToSubscriptionRouteError`). Message rules identical to `anthropic-messages.ts` (exactly one prompt, one input). Returns:
```text
url:     'claude-code-cli:pinned'
method:  'SPAWN'
headers: {}
body:    JSON { model, systemPrompt: prompt.content, userMessage: input.content,
                jsonSchema: roleOutputJsonSchema(role), effort: 'high' }
```
The adapter header states: `bodyBytes` (what the runner admits) is the UTF-8 length of this JSON; it is an upper bound on the bytes the transport writes to the prompt file and stdin, and **not** the provider request size, which includes CLI-added content of unmeasured size (626 cache-creation tokens on the probe, unattributed).

### `projectResponse(body, request)`

`body` is the transport's `CliEnvelope` JSON: `{ exitCode, signal, stdout, stderrBytes }`. Refusals, each a named class, all before any content is returned:
- `exitCode !== 0` or `signal !== null` → `CliExitError`.
- stdout lines: every non-blank line must parse as one JSON object → `CliStreamMalformedError` naming the line.
- Lifecycle state machine (r2, ported): allowed top-level types `system, stream_event, assistant, user, result, rate_limit_event`; system `init` exactly once, other system subtypes ignored; stream events `ping` ignored; `message_start` while a message is open, any block event outside an open message, duplicate index, start while a block is open, delta after stop, delta type not matching block type, duplicate stop, `message_stop` without `message_delta`, non-integer index, unknown stream event type (including `error`) → `CliStreamLifecycleError` naming the event position. Every block ever started is kept and counted.
- Init: model `=== request.model`, `apiKeySource === 'none'`, tools exactly `['StructuredOutput']`, `mcp_servers` empty → `CliLaunchContextError`.
- Model on `message_start` and every assistant message `=== request.model`; result `modelUsage` keys exactly `[request.model]` → `CliModelMismatchError`.
- `rate_limit_event` with `isUsingOverage === true` or `status === 'rejected'` → `CliOverageError`.
- Exactly one `tool_use` block named `StructuredOutput`, completed, inside a completed message; zero → `CliNoStructuredOutputError`; more → `CliMultipleStructuredOutputError`.
- Message `stop_reason`: `max_tokens` → `ProviderOutputTruncatedError` (reused class); `refusal` → `ProviderRefusalError`; otherwise must be `tool_use`.
- Result: exactly one, last event, `subtype === 'success'` **and** `is_error === false`, `structured_output` present → `CliResultError`.
- Output = concatenation of the block's `partial_json` deltas, byte-exact. Must parse as one JSON object; assistant `tool_use.input` and `result.structured_output` must be structurally equal to it (canonical JSON) → `CliOutputConflictError`. Returns the concatenated string unchanged (no re-serialisation).

### `readUsage(body)`

Non-null only when the result is `success` and `is_error === false`; fields from `result.usage` via `countOrNull`; else `null`.

### Tests

Fixture-driven: `probe-accepted` projects to exactly `{"token": "DS-SYNTH-001", "sum": 5}` (35 bytes, SHA-256 `ee0644e9…`) with `request.model = 'claude-opus-5'`; `probe-auth-failed` refuses with `CliResultError` naming `is_error` (its `subtype` is `success`). A generator builds a synthetic good stream from a payload and applies mutations for every refusal above, plus: escapes/whitespace preserved byte-exact; one-character deltas; thinking-then-tool, text-then-tool, ping, assistant-before-block-stop, non-zero tool index accepted. `readUsage` null on the auth-failed fixture.

### Teeth checks

- T2-a: overwrite the block on index reuse (the first-candidate defect) → index-reuse case reds on `CliMultipleStructuredOutputError`.
- T2-b: re-serialise the output through `JSON.stringify(JSON.parse())` → escapes case reds on byte equality.
- T2-c: drop the `is_error` conjunct → auth-failed fixture reds.
- T2-d: drop the `exitCode` check → exit-1 case reds.

---

## 5. Task 3 — the process transport

**Files:** `src/pipeline/claude-code-cli-transport.ts`, `test/claude-code-cli-transport.test.ts`, `test/fixtures/claude-code-cli/dummies/` (shell scripts created by the tests at run time under a temp dir, never committed).

### Contract

```text
createSpawnTransport(options): SpawnTransport
  options: {
    executable: { path, sha256, sizeBytes }        the pin, from the adapter
    inheritedEnv: { HOME, USER, PATH }              supplied by the caller; nothing else is inherited
    controls: Record<string,string>                 LAUNCH_CONTROL_ENV
    launch?: typeof child_process.spawn             injected in tests
    onLaunch?: (record: LaunchRecord, partialStdout: string) => void   evidence; throwing => EvidenceObservationFailedError
    tempRoot?: string                               where prompt files go; default os.tmpdir()
    maxOutputBytes?: number                         default 20 MiB, stdout+stderr
    termGraceMs?: number, killGraceMs?: number      default 5000 each
  }
  SpawnTransport = ProviderTransport & {
    runGate(signal): Promise<GateResult>            `auth status --json` under the same env/pin; not an attempt
    activeChildren(): number
    escalate(): void                                TERM->KILL every tracked child now (second interrupt)
    drain(): Promise<void>                          resolves when every tracked child is reaped or given up on
  }
  LaunchRecord = ProcessFacts & { kind: 'gate' | 'role', role, index, argv: string[], envNames: string[] }
```

### Behaviour, in order, per role launch

1. Refuse any request whose `url !== 'claude-code-cli:pinned'` (`WrongTransportError`).
2. Hash the executable (streaming SHA-256, size check); mismatch → `TransportFailure('before_send', …)` with `process.started = false` — nothing launched.
3. `mkdtemp(tempRoot, 'ds-cli-')` mode `0700`; write `system-prompt.txt` with `O_WRONLY|O_CREAT|O_EXCL`, mode `0600`. Path never appears in any record.
4. Spawn with `shell: false`, argv exactly: `-p --model <model> --effort high --safe-mode --tools "" --strict-mcp-config --setting-sources "" --disable-slash-commands --no-session-persistence --settings {"switchModelsOnFlag":false} --system-prompt-file <path> --json-schema <schema> --output-format stream-json --verbose --include-partial-messages`; `detached: true` (own process group); env exactly `inheritedEnv + controls`; cwd = the temp dir; user message written to stdin then stdin closed.
5. Drain stdout/stderr concurrently into bounded buffers; exceeding `maxOutputBytes` → terminate (step 7) and throw `ProcessTransportError` with facts naming `output_too_large`.
6. On `signal` abort: run step 7, hand `(record, partialStdout)` to `onLaunch`, throw `ProcessTransportError` carrying facts.
7. Termination: TERM to `-pid`; wait ≤ `termGraceMs` polling `waitpid`-equivalent (the `exit` event) and `kill(-pid, 0)`; KILL; wait ≤ `killGraceMs`; facts record `childReaped` and `groupGone` as observed. Never claims termination it did not observe.
8. On natural exit: facts; `onLaunch(record, stdout)` — if it throws, throw `EvidenceObservationFailedError` (with `.process` facts) **as the primary error**; cleanup failures are appended to `facts.promptFileRemovalError`, never replacing the primary.
9. Cleanup: `unlink` then `rmdir`; outcome recorded, not assumed.
10. Return `{ status: 0, headers: {}, body: JSON CliEnvelope, process: facts }` — `status` is a placeholder the runner ignores on this channel; the record's status is `null`.

`runGate`: same pin check, env and process handling with argv `auth status --json`; returns the parsed allowlisted fields plus process facts; presence rules from the r2 probe harness: `loggedIn === true`, `authMethod === 'claude.ai'`, `apiProvider === 'firstParty'`, `subscriptionType === 'max'`, `apiKeySource` and `forcedLoginMethod` **absent** (any presence blocks), no unexpected keys, clean process outcome (exit 0, no leftover, reaped, group gone). Never includes email/orgId/orgName values in the result.

Tracked children: a `Set` of live children; `escalate()` sends TERM then KILL to every one; `drain()` awaits their exit events with the same bounded grace.

### Tests (real dummies, `/bin/sh` scripts written by the test under a temp dir and registered with the process guard)

Exact argv and env: the dummy writes `argv` and `env` NUL-separated; the test asserts the **complete** vectors and every env value against literals stated in the test file (not imported from the transport). Cases: success (stdout = accepted fixture); exit 1; stalled holding pipes (timeout via the runner's controller); streams closed but alive; TERM-ignoring child (KILL path, facts show both signals); output bound exceeded; prompt file created `0600` in a `0700` dir and removed (assert absence and `promptFileRemoved: true`); removal failure simulated (dummy `chmod 500` the dir) → `promptFileRemoved: false`, error name recorded, primary result unaffected; pin mismatch → `before_send`, `started: false`, no dummy marker; wrong url refused; `onLaunch` throws → `EvidenceObservationFailedError` is the thrown error, facts attached, one `onLaunch` call; gate success/failure/presence cases; two concurrent launches then `escalate()` → both reaped within grace; `drain()` awaits.

### Teeth checks

- T3-a: drop `detached: true` → TERM-ignoring case reds (child survives; `groupGone` false / test times out on leftover check).
- T3-b: skip the KILL step → same case reds on `signalsSent`.
- T3-c: swallow the `onLaunch` throw → observer case reds.
- T3-d: report `promptFileRemoved: true` without unlinking → removal-failure case reds.
- T3-e: change one argv literal (`--tools ""` → `--tools default`) → exact-argv case reds naming the position.

---

## 6. Task 4 — process guard, import boundary, registry and capture-only refusal

**Files:** `test/setup/process-guard.ts`, `test/process-guard-precedence.test.ts`, `vitest.config.ts` (add the setup file), `test/pipeline-runner.test.ts` (extend the static boundary), `src/cli/live-wiring.ts`, `test/live-wiring.test.ts`.

- Guard: replaces `spawn, spawnSync, exec, execSync, execFile, execFileSync, fork` on the `node:child_process` module object with functions that throw `PROCESS GUARD: …` unless `file` is absolute and inside a directory registered via `allowDummyDir(dir)` exported from the setup, and that refuse `shell: true` always. Marker: the replaced `spawn.name === 'processGuardSpawn'`. Precedence test imports nothing from the setup and checks the name literally, then spawns `/bin/echo` and expects the guard message.
- Static boundary: the only `src/` file importing `child_process` (any form) is `src/pipeline/claude-code-cli-transport.ts`; no `src/` file imports `worker_threads`; positive control on the regex.
- Registry: `PRODUCTION_ADAPTERS` registers `CLAUDE_CODE_CLI_ADAPTER` beside the HTTP adapter. `liveCapabilityFrom`: when the configured identity is the CLI adapter, throw `SubscriptionRouteCaptureOnlyError` **before** reading any prerequisite variable; `liveWiringRefusal` maps it. Tests: `verify run` with the CLI identity and a full HTTP-style live env refuses by name, spawns nothing (guard call count 0, and a positive control that the HTTP path with an injected transport still reaches the runner).

### Teeth checks

- T4-a: remove `setupFiles` entry → precedence test reds on the marker name (before any spawn).
- T4-b: guard checks `basename === 'claude'` only → precedence test spawning `/bin/echo` reds.
- T4-c: remove the capture-only refusal → wiring test reds (runner constructed).
- T4-d: add `import { spawn } from 'node:child_process'` to a pipeline file → static boundary reds naming the file.

---

## 7. Task 5 — the capture harness's subscription path

**Files:** `test/live-capture.ts`, `test/live-capture.test.ts` (+ new cases), `test/pipeline-live.agents.test.ts` (one gated case, never run offline).

### Behaviour

`captureLiveRun` accepts `route: 'http' | 'subscription'` (default `http`, everything as today). Subscription route:

1. Config: `DATASTRATA_VERIFICATION_AGENTS=1`, `DATASTRATA_AGENT_MAX_ATTEMPTS` (launch budget), `DATASTRATA_AGENT_MAX_INPUT_BYTES`; **refuse** if `DATASTRATA_AGENT_API_KEY`, `DATASTRATA_AGENT_ENDPOINT`, any `ANTHROPIC_*`, `CLAUDE_CODE_USE_*`, `CLAUDE_CODE_SIMPLE` or `CLAUDE_CODE_SAFE_MODE` is present (`SubscriptionEnvironmentError` naming them; values never echoed).
2. Transport: `createSpawnTransport` (injected `launch` for tests) with `onLaunch` appending to `launches.jsonl` and writing `streams/<role>[<index>]-launch<n>.sanitised.jsonl` (redaction: `session_id`, `uuid`, `cwd` keys; email pattern; HOME and USER literals; model-output subtrees untouched, fail closed if they contain a sensitive pattern — write nothing, record `streamOmitted: reason`).
3. Gate: `transport.runGate(lifetime.signal)` before `dispatch`; result (allowlisted fields + facts) into `execution.json.gate`; failure → status `failed`, `gate.pass false`, no `dispatch`, no role launch.
4. Runner: `createLiveAgentRunner` with `apiKey: ''`, `maxAttempts: 1`, adapter, budget, `observe`, `signal`.
5. First failure: a role error aborts `lifetime` immediately (reason `role_failed:<name>`), so nothing later is sent and any active child is terminated.
6. Signals: an injectable `interrupts: EventEmitter` (default `process`); first `SIGINT`/`SIGTERM` → `interruptedBy`, `lifetime.abort('operator:<signal>')`; second → `transport.escalate()`; recorded as `interrupts: [{signal, at, action}]`.
7. Finalise: `await transport.drain()` **before** writing the final `execution.json`; status `failed` with `cancelled: true` when the lifetime fired; `terminationUnconfirmed: true` when any launch record shows `childReaped false` or `groupGone false`.
8. `execution.json` additions: `route`, `attemptUnit: 'cli_launch'`, `launches` (started), `gateLaunches`, `httpAttempts: null`, `cliObserved: { requestIds, numTurns, thinkingTokens[], rateLimitEvents, reportedUsage }`, `unobserved: { outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000; wire-level max_tokens unobserved', thinking: 'CLI-decided for effort high; not asserted' }`, `measured: { admittedLaunchInputBytes: 'UTF-8 length of the JSON launch description; upper bound on prompt-file + stdin bytes; not the provider request size' }`. HTTP route summaries gain `route: 'http'` and `attemptUnit: 'http_attempt'` and nothing else changes.

### Tests

Full run over dummies emitting fixture streams per role (the reader/prosecutor/adjudicator outputs from `pipeline-fixtures` wrapped in a synthetic tool-call stream): completes, transcript written and replayable, `launches === 9`, `httpAttempts === null`, gate recorded without identifiers. Gate failure → no role launch. Mid-run role failure (third launch exits 1) → exactly three launches, later roles never started, status failed, error names the role. Timeout during launch two → cancelled, facts retained, drain awaited before summary (assert summary `finishedAt` ≥ child exit). Observer failure (launches.jsonl made unwritable) → status failed, error name `EvidenceObservationFailedError`, one record, no further launch. Simulated first interrupt during a stalled launch → cancelled with `interruptedBy`; second interrupt → `escalate` called, child reaped, `terminationUnconfirmed false`. TERM-ignoring dummy with a simulated give-up → `terminationUnconfirmed true` reported. Env refusal cases. HTTP route regression: existing capture tests unchanged plus `route: 'http'` in the summary.

### Teeth checks

- T5-a: write the final summary before `drain()` → the timeout case reds on ordering.
- T5-b: do not abort the lifetime on the first role failure → mid-run failure case reds (a fourth launch starts).
- T5-c: gate result ignored → gate-failure case reds (a role launch starts).
- T5-d: second interrupt not escalated → reds on `escalate` count / leftover child.
- T5-e: `terminationUnconfirmed` hard-coded false → give-up case reds.

---

## 8. Task 6 — checkpoint and full verification

- `docs/superpowers/CHECKPOINT-b-cli-adapter.md`: what exists, what was verified, what remains unobserved (ceiling, thinking, CLI-added content size, HTTP attempt count, server-side billing), the rehearsal probe as the next approval.
- Full `npx vitest run`, `npx tsc --noEmit`, `npm test` from the repository root (both workspaces), `grep -ri csrd src/` = 7, `git status` shows only intended paths plus the two protected files.

---

## 9. Out of scope, restated

Live rehearsal (file-plus-stdin argv, role schemas through `--json-schema`, large prompt), S-002, promotion, signing, Qwen, orchestration, ordinary `verify run` over the subscription route, and any experiment to observe the wire-level output ceiling.
