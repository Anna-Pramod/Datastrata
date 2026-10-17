/**
 * The capture path: one live execution, with everything it produced kept
 * together, outside every fixture root.
 *
 * **Nothing in the default suite executes this against a provider.** The
 * agents suite reaches it, and even there it is inert without the capability
 * token, the endpoint, the credential and a stated budget. What the default
 * suite proves about it, offline and under the network guard, is in
 * `live-capture.test.ts`: the S-002 route completes through the accepted
 * adapter over an injected transport, a failed execution keeps its
 * diagnostics and writes no transcript, and nothing overwrites.
 *
 * # Why executions, not runs, are what gets filed
 *
 * A recording under `test/verification-transcripts/` is filed by `runId`,
 * which is derived from the run's inputs and is therefore the same for every
 * genuine execution of one question under one pipeline identity. That is the
 * right property for replay — a recording answers to the question it was made
 * from — and the wrong one for evidence of what happened when: two genuine
 * executions of S-002 would name one file, and the second would overwrite the
 * first. The identity semantics are not changed to get unique names. Instead
 * each execution gets its own directory under `LIVE_EXECUTION_ROOT`, named by
 * an execution id that is not an identity of anything, and inside it the
 * transcript is still filed by `runId`, the dossier under its own
 * `verification/` root, and the per-attempt diagnostics beside both:
 *
 * ```text
 * <executionRoot>/<packId>/<requirementId>/<executionId>/
 *   execution.json                  status, ids, adapter, ledger, error, timestamps
 *   attempts.jsonl                  one AttemptRecord per attempt, in order
 *   launches.jsonl                  subscription route: one line per child launched, gate included
 *   streams/                        subscription route: each launch's stdout, sanitised
 *   transcript/<packId>/<requirementId>/<runId>.json   only if the run completed
 *   verification/<packId>/<requirementId>/verification-result.json   the dossier
 * ```
 *
 * An execution root inside the fixture root — or containing it — is refused
 * before anything is written, and an execution id that already exists is
 * refused rather than reused. Promoting a genuine transcript into the fixture
 * tree remains a human act on a reviewed file. The fixture root the guard
 * compares against defaults to the real one and is injectable, so the guard
 * can be exercised — and mutated — against a disposable tree.
 *
 * # Two routes
 *
 * `route: 'http'` (everything the paragraphs above describe) reaches a provider
 * through `anthropic-messages@1` over an injected or real `fetch`.
 * `route: 'subscription'` (B-CLI-ADAPTER) reaches Claude through a pinned
 * Claude Code CLI on a Max subscription, over `claude-code-cli@2` by default
 * (the Opus 5.5 migration) and the process transport, and it is the **only**
 * place in the repository that constructs a runner over a CLI adapter —
 * `verify run` refuses every `claude-code-cli` identity by name
 * (`SubscriptionRouteCaptureOnlyError`). **The environment selects
 * the route**: `DATASTRATA_SUBSCRIPTION_CAPTURE=1` and nothing else selects
 * the subscription route, its absence the HTTP route, and a request whose
 * stated route, adapter, transport or variables belong to the other one is
 * refused by name (`CaptureRouteConflictError`) before anything is created —
 * there is no default that could quietly send a subscription request to the
 * HTTP path or the reverse. What differs on the subscription route:
 *
 * - **Configuration.** The token and the two budget variables are required;
 *   the endpoint and the credential are *refused* if present, and so is any
 *   `ANTHROPIC_*`, `CLAUDE_CODE_USE_*`, `CLAUDE_CODE_SIMPLE` or
 *   `CLAUDE_CODE_SAFE_MODE` variable — each would make the CLI authenticate
 *   or behave other than the accepted probe did. The refusal names variables,
 *   never values. The environment is the one this function is *handed*;
 *   `process.env` is never read here.
 * - **Two adapters, one profile each (plan 2026-09-25, D-1, D-2, D-5).**
 *   The route runs `claude-code-cli@2`, or `claude-code-cli@1` over an
 *   injected launch only: `@1` has none of `@2`'s included-usage, fast-mode
 *   or exact-model protections, so an execution that would spawn the real
 *   executable under it is refused (`SubscriptionRouteMismatchError`)
 *   before anything is created. The adapter carries no link to its profile,
 *   so the identity selects it here, and the profile is the authority for
 *   what the execution runs and reports: the executable
 *   (`subscriptionExecutableFor`), the launch controls, the gate's rules,
 *   the `--settings` text the transport holds every role launch to, the
 *   launch timeout handed to the runner, the gate's own timeout, and the
 *   summary's `pin`, `requested`, `budgets` and `unobserved`. For `@2` the
 *   launch budget may not exceed the configuration's role launches, one
 *   reader, the prosecutors and one adjudicator (`SubscriptionBudgetError`,
 *   before anything is created).
 * - **An execution-scoped gate.** Before any role is dispatched the
 *   transport runs `auth status --json` under the same pin and environment;
 *   the verdict (labels and process facts, never the account's email or
 *   organisation identifiers) is filed as `execution.json.gate`, and a
 *   refusal ends the execution with nothing dispatched. Where the profile
 *   bounds the gate (`@2`), it runs under its own controller, which follows
 *   the lifetime and also fires at the gate timeout: a gate that outlives it
 *   fails the execution as `GateTimeout` with the cancellation reason
 *   `gate_timeout`, nothing dispatched, and the message says how the timer
 *   met the launch — it ended the running child (whose launch line is still
 *   filed), it fired before any child was launched, or it fired after the
 *   child had answered, whose verdict is then not taken
 *   (`gateVerdictErrorOf`). Only the transport's own abort of the gate
 *   launch and that late verdict are filed so; an error the gate throws for
 *   another reason — a pin mismatch, an evidence failure — keeps its own
 *   name, and says the timer had fired (`subscriptionErrorOf`).
 * - **Every child is evidence.** The transport hands each launch's record and
 *   stdout to `onLaunch`, which appends one line to `launches.jsonl` and
 *   writes the stdout, sanitised, under `streams/`. A record that cannot be
 *   written is an `EvidenceObservationFailedError` and halts the run.
 * - **The first failure ends the run.** A rejected role aborts the
 *   execution's lifetime at once (`role_failed:<role>[<index>]`), so nothing
 *   later is sent and any child still running is ended.
 * - **Interrupts are handled, and recorded.** The first `SIGINT`/`SIGTERM`
 *   aborts the lifetime (`operator:<signal>`); a second escalates termination
 *   through the transport. Listeners go on an injectable emitter, `process`
 *   by default, and come off in `finally`.
 * - **Drain before the final status.** The final `execution.json` is written
 *   only after `transport.drain()` has waited, bounded, for every tracked
 *   child; `terminationUnconfirmed` says whether any launch record — gate or
 *   role — shows a child the transport could not confirm reaped, a group it
 *   could not confirm gone, or pipes still held when the launch was given
 *   up on (`streamsClosed: false`). **An unconfirmed cleanup never publishes
 *   a run.** The transport refuses such a launch where it happens: a gate
 *   blocks with `streams_not_closed` and no role starts; a role launch
 *   throws naming `streams_not_closed` (as a leftover throws naming
 *   `leftover_processes_terminated`), the runner books it as possibly
 *   billed, nothing projects its output, and the role wrapper below aborts
 *   the lifetime so nothing later launches. Acting on the record only after
 *   the run let a gate with unclosed pipes pass and let a role with unclosed
 *   pipes be taken for an answer while later roles launched. The post-drain
 *   rule (`unconfirmedLaunches`) stays as the backstop: a run that somehow
 *   completed with an unconfirmed launch is filed as failed under
 *   `TerminationUnconfirmed`, no transcript is written, a result the pipeline
 *   already wrote is deleted and `resultWithheld` says so, and every observed
 *   fact stays in `launches.jsonl` and `execution.json`.
 * - **Included usage is observed, stopped on and held (plan 2026-09-25, D-5,
 *   D-6; Task 5b).** Every role launch's line carries what its stream reports
 *   about included usage — the models, the CLI version and every init's
 *   betas, every rate-limit reading, the fast-mode states of every init and
 *   result event and the speeds, the stop reasons and categories (never an
 *   explanation), the API-error kinds, block and subtype counts, and the
 *   largest per-request context — read by `observeUsage` in
 *   `included-usage.ts`, which imports nothing, so this account is
 *   independent of the `@2` projection it backs up. It is filed redacted by
 *   the stream's own key and value rules (`redactObservation`, below), and
 *   every rule reads the lines as filed. For `@2`,
 *   `usageViolations` turns every launch line into facts, and
 *   `execution.json.usageStop` files them: `null` while the run is running,
 *   then `usageStopOf` of every fact, completed or failed, whatever failed.
 *   After each launch the projection accepted, a fact no projection rule
 *   covers — the per-request context above D-5's ceiling
 *   (`long_context_boundary`), or a window reset early (`unnatural_reset`) —
 *   aborts the lifetime (`usage_stop:<role>[<index>]`) and fails the run as
 *   `UsageStopError`, and nothing later launches. After the drain, and after
 *   the `TerminationUnconfirmed` rule, a `@2` run still completed with any
 *   fact is failed as `IncludedUsageUnconfirmed`, its result deleted and
 *   withheld as that rule's are. The precedence (Task 5b review repair M5):
 *   a completed run with both an unconfirmed termination and a usage fact is
 *   named `TerminationUnconfirmed`; both withhold the result, and `usageStop`
 *   still carries the facts. `@1`, whose 2.1.226 streams report no
 *   fast-mode state, files no `usageStop` and has neither stop. Before any
 *   subscription execution is created, on either adapter, every
 *   `execution.json` at depth three under the execution root it is handed
 *   (`<pack>/<requirement>/<execution>/`) is read — across every pack and
 *   requirement under that root (production uses the one fixed root,
 *   `LIVE_EXECUTION_ROOT`), not every root on the machine (Task 5b review
 *   repair M5) — and a start before the latest reset any of them recorded,
 *   its `usageStop.resetsAt` or a later reset of one of its exhausted or
 *   overage facts, is refused (`UsageResetPendingError`), as is a finished
 *   record whose stop recorded an exhaustion or overage that reported no
 *   reset time as a number, which holds until an operator reviews it (Task
 *   5b review repair M4, a parent decision P-5b-14), and one any of whose
 *   exhausted or overage facts reports no usable reset (a safe integer of
 *   epoch seconds greater than 0), whatever its aggregate says (the
 *   reset-hold repair), a record that cannot be
 *   read, a record of an execution that never finished, a symbolic link at
 *   any level of the walk, the execution root included, which is neither
 *   followed nor passed over, and a root or an entry the walk cannot list or
 *   examine: a resume is a new, separately approved execution. A recorded
 *   limitation (Task 5b review repair M5): a directory entry whose type the
 *   filesystem does not report (a `Dirent` neither a file, a directory nor
 *   a link; not on APFS) is passed over by the walk, as a regular file is.
 * - **Trust in four tiers (plan 2026-09-25, D-9; Task 5c).** Every `@2`
 *   `execution.json` carries `trust`: `null` while the run is running, then
 *   `trustOf`'s four tiers, each a status and the method behind it —
 *   `execution` (completed or failed, and the error's name),
 *   `schemaValidity` (read off how far `runSubscriptionCommand` got),
 *   `evidenceValidity` (`checkResultEvidence` over the written record and
 *   the corpus the run authorised) and `substantiveCorrectness`, always
 *   `unassessed`. It is taken after every withhold decision, so a withheld
 *   run's evidence tier is `withheld`, never `passed`; it is a measurement,
 *   and gates no status, transcript or result. No status and no method says
 *   "verified", the status only signing confers. `@1` files no such key.
 * - **The command is composed here.** `runRun` (`src/cli/run.ts`) fixes
 *   `DEFAULT_ROLE_CONFIG`, whose `providerAdapter` is the HTTP identity, and
 *   orchestration refuses a live runner whose adapter differs from the
 *   configured one — correctly, because the identity is a `pipelineVersion`
 *   input and the subscription route *is* a different pipeline (D-1). Nothing
 *   under `src/` is changed for this: the subscription path composes the same
 *   production functions `runRun` composes (`readWorld`,
 *   `EntitledClosure.forSources`, `loadPromptSet`, `runVerificationPipeline`,
 *   `writeVerificationResult`) with the configuration for the adapter it
 *   runs (`subscriptionRoleConfigFor`): `SUBSCRIPTION_ROLE_CONFIG`, `@2`'s,
 *   which differs from the default in its models, its adapter and its
 *   invocation, or `SUBSCRIPTION_ROLE_CONFIG_V1`, which differs in the
 *   adapter alone. The role wrapper forwards the runner's invocation, which
 *   orchestration compares with the configuration's.
 *
 * # What the sanitised streams keep, and what they never keep
 *
 * Each stdout line that parses as a JSON object is written back with
 * `session_id`, `uuid`, `cwd`, `email`, `orgId`, `orgName`,
 * `projectsDirectory` and `configDirectory` replaced wherever they occur as
 * keys, and every other string that matches an email
 * pattern or contains the inherited `HOME` or `USER` value replaced by
 * `[REDACTED]`. The model's own output — `event.delta`, `event.content_block`,
 * `message.content`, `result` and `structured_output` — is never modified,
 * because a modified model output would be a different answer from the one
 * the transcript records. If such a subtree contains a sensitive pattern the
 * stream is withheld, the launch line says why by path and kind
 * (`streamOmitted`), and the execution **fails closed** under
 * `SensitiveOutputWithheldError`: an answer that cannot be filed is not
 * handed to the role, so it reaches neither the transcript nor the result,
 * and the payload appears nowhere under the execution directory. The same
 * rule holds for the partial stdout of a launch ended by an abort.
 * A line that is not a JSON object is written as `{"unparsed": true, "bytes": N}`.
 *
 * The launch line's observation, read from the same raw lines, is held to
 * the same rules before it is filed (`redactObservation`; Task 5b review
 * repairs R15 and N3, a parent decision P-5b-11, extended): a value under
 * any of those keys, and any string that matches an email pattern or carries
 * the inherited `HOME` or `USER` value, wherever it sits in a subtree the
 * observation copied, is `[REDACTED]`; a block type or system subtype that
 * would be is counted under `[REDACTED]`. Without the value rule, such a
 * string copied into the observation would make `onLaunch`'s leak check
 * refuse the whole launch line, and the launch's facts with it. What this
 * does not do (Task 5b review repair O3, a parent decision P-5b-13; each is a
 * recorded limitation in `included-usage.ts`): only a count map's keys are
 * renamed, so a key inside a copied subtree that matches the email pattern or
 * carries the inherited `HOME` or `USER` value still makes the leak check
 * refuse that launch line, and that launch's facts, a rejected window's reset
 * hold among them, are lost (fail closed: the projection still judges the
 * launch); a replaced string is read by no rule as what it was, so a replaced
 * credit kind, `[1m]` model, context-1M beta or window string naming overage
 * leaves no fact while the projection still refuses, a replaced "off" or
 * "standard" makes a false `fast_mode` fact on a clean run, a replaced
 * rate-limit status, type or overage status becomes a fact of another kind,
 * and a replaced "rejected" loses the exhaustion and its reset hold; and the
 * value rule depends on the inherited `USER` and `HOME`, so an operator whose
 * either is contained in any literal those rules compare would meet the last
 * on every launch, a precondition for the user to confirm before the first
 * `@2` execution and not enforced here. A window reported in two positions
 * with different values, in events that alternate between reporting both and
 * reporting one, can also make a false in-flight `unnatural_reset` stop,
 * which fails closed; how the pinned build reports windows is a probe
 * question.
 *
 * An open risk, recorded under the user's open decision 13 and not repaired
 * here (Task 5b review repair N6, a parent decision P-5b-12, narrowed): the
 * harness files an error's message verbatim, as `execution.json`'s
 * `error.message` and as `attempts.jsonl`'s `detail`, and no rule scans
 * either. A refusal's explanation (D-7 rule 6) is carried in
 * `ProviderRefusalError`'s message as reported. Only where it sits under a
 * model-output path — a `message_delta`'s `stop_details`, under
 * `event.delta` — does the sanitiser withhold a sensitive one, and
 * `onLaunch` fail the launch before anything projects it. At the four other
 * positions — a result's `stop_details`, an assistant message's
 * `stop_details`, and `apiRefusalExplanation` on a system
 * `model_refusal_no_fallback` event or on an API-error item — and in any
 * projection error that quotes a stream value, a sensitive value reaches
 * both files unscanned: the class of that decision, which Task 5a recorded
 * for the inherited `HOME` in a pin-mismatch error.
 *
 * # Lifetime
 *
 * An execution has a deadline. `runFirstLiveCase` derives it from the stated
 * budget: on the HTTP route, every permitted attempt at its full local
 * timeout plus the longest permitted wait, and a minute besides
 * (`executionLifetimeMs`); on the subscription route, D-5's lifetime over
 * `@2`'s profile, every permitted launch at its launch timeout and the
 * transport's cleanup bound, the gate at its timeout and one cleanup bound,
 * and a minute besides (`subscriptionLifetimeMs`). When it fires,
 * the runner aborts the attempt in flight, ends any wait, and refuses every
 * later send; the execution is filed as failed with `cancelled: true`. A test
 * runner's own timeout is therefore never what stops provider work — the
 * harness is, with its account written.
 *
 * # Counts that must agree
 *
 * `execution.json` carries `attemptUnit`, naming what the ledger counted. On
 * the HTTP route `httpAttempts` is the runner's own `ledger.attemptsUsed` —
 * sends, retries included. On the subscription route `httpAttempts` is
 * `null`: the CLI makes the HTTP requests and this harness sees none of them;
 * `launches` is `ledger.launchesStarted`, children that existed, and
 * `gateLaunches` counts the gate's own. Separately, `unsentEvents` are the
 * admission, budget and cancellation refusals that sent nothing, and
 * `recordsWritten` their sum with the sent attempts as lines of
 * `attempts.jsonl`.
 *
 * # What a failed execution leaves
 *
 * `attempts.jsonl` and `execution.json` with `status: "failed"` and the error's
 * name and redacted message. No `transcript/` directory: orchestration hands
 * over a transcript only when the run completes, and this file writes nothing
 * shaped like a recording for a run that did not. Incomplete evidence is kept
 * as diagnostics, never presented as a completed transcript.
 *
 * # Gates, and a credential is none of them
 *
 * ```text
 * DATASTRATA_VERIFICATION_AGENTS=1   the capability token — an act, not a state
 * DATASTRATA_AGENT_ENDPOINT          http: the endpoint, named explicitly; subscription: refused
 * DATASTRATA_AGENT_API_KEY           http: the credential; subscription: refused
 * DATASTRATA_AGENT_MAX_ATTEMPTS      the run's attempt (http) or launch (subscription) budget
 * DATASTRATA_AGENT_MAX_INPUT_BYTES   the largest request body admitted per attempt
 * adapter                            the named provider protocol itself
 * ```
 *
 * All are required and none implies another. `liveCaptureConfigFrom`,
 * `subscriptionCaptureConfigFrom` and `assertLiveAgentsEnabled` read the env
 * this function is *handed*; `createLiveAgentRunner` and `LiveAgentRunner.run`
 * read the ambient `process.env`, so the composition is fail-closed in both
 * directions.
 *
 * # What is kept, and what it is worth
 *
 * The transcript is the one orchestration built. `outputJson` is the runner's
 * response text, stored verbatim, so replay hands the same bytes to the same
 * seam. `attempts.jsonl` is the runner's own account of every attempt:
 * status, request id, the usage the envelope or the CLI reported or `null`
 * for unknown, and the outcome — the figures a bill is reconciled against.
 * The credential, where there is one, is redacted by the runner and, as a
 * second layer, by this file before any summary is written.
 */

import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, type Dirent, type Stats } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { join, resolve, sep } from 'node:path';

import { EXIT_INTEGRITY_FAILURE, EXIT_OK, EXIT_REFUSED, type CliOutcome } from '../src/cli/exit-codes';
import { liveBudgetFrom, LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV } from '../src/cli/live-wiring';
import { ANTHROPIC_MESSAGES_ADAPTER } from '../src/pipeline/anthropic-messages';
import { outcomeFor, readRegistryOrFail, readWorld, resultPath, type CurrentWorld, type VerifyPaths } from '../src/cli/sign';
import { dispatch } from '../src/cli/verify';
import type { LoadedCorpus } from '../src/corpus/store';
import {
  CLAUDE_CODE_CLI_IDENTITY,
  CLAUDE_CODE_CLI_PROFILE,
  CLAUDE_CODE_CLI_V2_ADAPTER,
  CLAUDE_CODE_CLI_V2_IDENTITY,
  CLAUDE_CODE_CLI_V2_PROFILE,
  CLI_LAUNCH_URL,
  resolvePinPath,
  type CliProfile,
} from '../src/pipeline/claude-code-cli';
import {
  createSpawnTransport,
  DEFAULT_GRACE_MS,
  DEFAULT_LAUNCH_SETTINGS,
  type ExecutablePin,
  type GateResult,
  type InheritedEnv,
  type LaunchFunction,
  type LaunchRecord,
} from '../src/pipeline/claude-code-cli-transport';
import { DEFAULT_ROLE_CONFIG, type RoleConfig } from '../src/pipeline/config';
import { EntitledClosure } from '../src/pipeline/entitlement';
import {
  assertLiveAgentsEnabled,
  createLiveAgentRunner,
  DEFAULT_TIMEOUT_MS,
  EvidenceObservationFailedError,
  liveAgentsEnabled,
  MAX_RETRY_AFTER_MS,
  ProcessTransportError,
  requireProviderAdapter,
  LIVE_AGENTS_ENV,
  LIVE_AGENTS_TOKEN,
  type AttemptRecord,
  type BudgetLedger,
  type LiveAgentRunner,
  type ProcessFacts,
  type ProviderTransport,
  type RunBudget,
} from '../src/pipeline/live-runner';
import { runVerificationPipeline } from '../src/pipeline/orchestrate';
import { loadPromptSet } from '../src/pipeline/prompts';
import { providerAdapterKey, type ProviderAdapter } from '../src/pipeline/provider-adapter';
import { RoleOutputError } from '../src/pipeline/roles';
import type { AgentRunner } from '../src/pipeline/runner';
import { TRANSCRIPT_ROOT, writeRunTranscript, type RunTranscript } from '../src/pipeline/transcript';
import { writeVerificationResult, type ResultWriteOutcome } from '../src/pipeline/write-result';
import { checkResultEvidence, type EvidenceSetValidity } from '../src/verification/evidence-validity';
import type { VerificationResult } from '../src/verification/result';
import { sourceIdsOf } from '../src/knowledge/provenance';
import { describeUsageFacts, observeUsage, usageStopOf, usageViolations, type UsageObservation, type UsageStop } from './included-usage';
import { engineRoot } from './replay-fixtures';

export { LIVE_ENDPOINT_ENV, LIVE_API_KEY_ENV };

/** Where genuine executions are filed, relative to the engine root. Under `test/` so no artifact ever carries one; never the fixture root. */
export const LIVE_EXECUTION_ROOT = join('test', 'live-executions');

/** The first live case: the recommended requirement, declared once. */
export const FIRST_LIVE_CASE = { packId: 'csrd', requirementId: 'CSRD-S-002' } as const;

/** The fixture tree replay reads, which no execution may be filed inside or around. Injectable for tests; this is production's value. */
export const DEFAULT_FIXTURE_ROOT = resolve(engineRoot, TRANSCRIPT_ROOT);

/**
 * The longest an execution under a budget may take: every permitted attempt
 * at the full local timeout plus the longest permitted wait, and a minute of
 * margin. An enforced bound on wall time, derived from enforced bounds; not a
 * latency estimate.
 */
export function executionLifetimeMs(budget: RunBudget): number {
  return budget.maxRunAttempts * (DEFAULT_TIMEOUT_MS + MAX_RETRY_AFTER_MS) + 60_000;
}

/** A launch's time bounds, as D-5's lifetime reads them. */
export interface SubscriptionTimeouts {
  launchTimeoutMs: number;
  gateTimeoutMs: number;
}

/**
 * The subscription route's lifetime (plan 2026-09-25, D-5): every permitted
 * launch at its launch timeout plus the transport's cleanup bound, the gate
 * at its timeout plus one cleanup bound, and a minute of margin —
 * `maxRunAttempts × (launchTimeoutMs + termGrace + killGrace + termGrace) +
 * gateTimeoutMs + (termGrace + killGrace + termGrace) + 60,000`. The cleanup
 * bound is the transport's drain bound (TERM grace, KILL grace, then the
 * bounded wait for the pipes) at its default graces, which production never
 * overrides. The timeouts default to `@2`'s profile, so a budget of 9 is
 * 16,470,000 ms. Like `executionLifetimeMs`, an enforced bound on wall time
 * derived from enforced bounds; not a latency estimate.
 */
export function subscriptionLifetimeMs(
  budget: Pick<RunBudget, 'maxRunAttempts'>,
  timeouts: SubscriptionTimeouts = { launchTimeoutMs: CLAUDE_CODE_CLI_V2_PROFILE.launchTimeoutMs, gateTimeoutMs: CLAUDE_CODE_CLI_V2_PROFILE.gateTimeoutMs },
): number {
  const cleanupMs = DEFAULT_GRACE_MS + DEFAULT_GRACE_MS + DEFAULT_GRACE_MS;
  return budget.maxRunAttempts * (timeouts.launchTimeoutMs + cleanupMs) + timeouts.gateTimeoutMs + cleanupMs + 60_000;
}

/**
 * The largest delay a timer honours: 2^31 - 1 ms, about 24.8 days. Node's
 * `setTimeout` does not refuse a larger value; it fires after one millisecond
 * and warns, which would turn an accepted attempt budget into an execution
 * cancelled at once, its account saying "deadline". The lifetime is therefore
 * checked against this range before anything is created, and the outer test
 * timeout — the lifetime plus `LIFETIME_MARGIN_MS` — must fit it too.
 */
export const MAX_TIMER_MS = 2 ** 31 - 1;
/** What the agents test adds above the harness deadline for its own timeout. */
export const LIFETIME_MARGIN_MS = 60_000;
/** The largest deadline the harness accepts: leaves room for the outer margin inside the timer range. */
export const MAX_EXECUTION_LIFETIME_MS = MAX_TIMER_MS - LIFETIME_MARGIN_MS;

/** A deadline the timers cannot honour as stated. Refused by name, before any execution file exists. */
export class UnsupportedLifetimeError extends Error {
  constructor(readonly deadlineMs: unknown) {
    super(`refusing an execution lifetime of ${String(deadlineMs)} ms: a deadline must be a positive integer of at most ${MAX_EXECUTION_LIFETIME_MS} ms, so that it and the outer margin of ${LIFETIME_MARGIN_MS} ms fit the timer range of ${MAX_TIMER_MS} ms; a larger value would fire after one millisecond, not never`);
    this.name = 'UnsupportedLifetimeError';
  }
}

/** The complete check, applied to a derived lifetime and to an explicit override alike. */
export function assertSupportedLifetime(deadlineMs: number): void {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > MAX_EXECUTION_LIFETIME_MS) throw new UnsupportedLifetimeError(deadlineMs);
}

/**
 * A test-only time bound (`launchTimeoutMs`, `gateTimeoutMs`) the timers
 * cannot honour as stated. Refused by name, before any execution file exists
 * (Task 5a review repair R10): zero, a negative, a fraction, `NaN` or a value
 * above the timer range would fire at once rather than bound anything, and
 * `NaN` would also make the recorded lifetime `NaN`.
 */
export class UnsupportedTimeoutError extends Error {
  constructor(readonly option: 'launchTimeoutMs' | 'gateTimeoutMs', readonly value: unknown) {
    super(`refusing subscription.${option} of ${String(value)} ms: an injected time bound must be a positive integer of at most ${MAX_TIMER_MS} ms, the timer range; any other value would fire at once rather than bound the launch it is for`);
    this.name = 'UnsupportedTimeoutError';
  }
}

/** The check for an injected time bound: a positive safe integer within the timer range, or a refusal naming the option. */
function assertSupportedTimeout(option: UnsupportedTimeoutError['option'], value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMER_MS) throw new UnsupportedTimeoutError(option, value);
}

/**
 * A live capture was asked for without everything it explicitly requires.
 *
 * An exported `LIVE_CAPTURE_GATES` constant stood here briefly and was removed:
 * nothing but this message consumed it, so its *contents* had no unique kill —
 * a mutation dropping an entry reddened nothing, because the only test that read
 * it iterated the very list under test. What makes each gate load-bearing is
 * that removing its *enforcement* reds a case.
 */
export class LiveCaptureConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `a live capture requires ${LIVE_AGENTS_ENV}, ${LIVE_ENDPOINT_ENV}, ${LIVE_API_KEY_ENV}, ${LIVE_MAX_ATTEMPTS_ENV}, ${LIVE_MAX_INPUT_BYTES_ENV} and a provider adapter, and is missing [${missing.join(', ')}]. A credential on its own is not permission to spend: ${LIVE_AGENTS_ENV}=${LIVE_AGENTS_TOKEN} is a separate, deliberate act, the endpoint is named rather than defaulted so that no host is contacted unless somebody typed it, the budget is stated rather than defaulted, and the adapter is the provider protocol without which no request can be built and no answer read.`,
    );
    this.name = 'LiveCaptureConfigError';
  }
}

/** The execution root would put genuine executions inside, or around, the fixture tree replay reads. */
export class ExecutionRootError extends Error {
  constructor(readonly executionRoot: string, readonly fixtureRoot: string) {
    super(`refusing execution root ${executionRoot}: it lies inside, or contains, the replay fixture root ${fixtureRoot}, where recordings are filed by run identity and a genuine execution would overwrite or be mistaken for one`);
    this.name = 'ExecutionRootError';
  }
}

/** An execution directory with this id already exists. Nothing in it is touched. */
export class ExecutionExistsError extends Error {
  constructor(readonly executionDir: string) {
    super(`refusing to reuse execution directory ${executionDir}: an execution is filed once, and a second under the same id would overwrite evidence of the first`);
    this.name = 'ExecutionExistsError';
  }
}

export interface LiveCaptureConfig {
  endpoint: string;
  apiKey: string;
  budget: RunBudget;
}

/**
 * The environment gates, or a named refusal listing exactly which are absent.
 * The budget's *values* are then parsed by the production wiring, which
 * refuses a non-integer by name.
 */
export function liveCaptureConfigFrom(env: NodeJS.ProcessEnv): LiveCaptureConfig {
  const missing: string[] = [];
  if (!liveAgentsEnabled(env)) missing.push(LIVE_AGENTS_ENV);
  for (const name of [LIVE_ENDPOINT_ENV, LIVE_API_KEY_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV]) {
    const value = env[name];
    if (value === undefined || value === '') missing.push(name);
  }
  if (missing.length > 0) throw new LiveCaptureConfigError(missing);
  return { endpoint: env[LIVE_ENDPOINT_ENV]!, apiKey: env[LIVE_API_KEY_ENV]!, budget: liveBudgetFrom(env) };
}

// ---------------------------------------------------------------------------
// The subscription route's configuration
// ---------------------------------------------------------------------------

export type CaptureRoute = 'http' | 'subscription';

/** The route selector: present with exactly this value, the capture takes the subscription route; absent, the HTTP route. */
export const SUBSCRIPTION_CAPTURE_ENV = 'DATASTRATA_SUBSCRIPTION_CAPTURE';
export const SUBSCRIPTION_CAPTURE_TOKEN = '1';

/** `true` only for the exact value, as for the capability token. */
export function subscriptionCaptureSelected(env: NodeJS.ProcessEnv): boolean {
  return env[SUBSCRIPTION_CAPTURE_ENV] === SUBSCRIPTION_CAPTURE_TOKEN;
}

/** The route the environment selects. This is the only place a route is defaulted. */
export function captureRouteFor(env: NodeJS.ProcessEnv): CaptureRoute {
  return subscriptionCaptureSelected(env) ? 'subscription' : 'http';
}

/**
 * The request and the environment disagree about which route this is: a
 * stated route the selector contradicts, or an adapter, a transport or a
 * variable that belongs to the other route. Refused by name before anything
 * is constructed or written, because a capture that takes the wrong route
 * spends against the wrong account.
 */
export class CaptureRouteConflictError extends Error {
  constructor(detail: string) {
    super(`the HTTP and subscription routes exclude each other, and this request straddles them: ${detail}. ${SUBSCRIPTION_CAPTURE_ENV}=${SUBSCRIPTION_CAPTURE_TOKEN} selects the subscription route and nothing else does; without it the HTTP route is taken, and a request carrying the other route's adapter, transport or variables is refused rather than routed`);
    this.name = 'CaptureRouteConflictError';
  }
}

/** Variables whose presence, by exact name, refuses the subscription route. */
export const SUBSCRIPTION_FORBIDDEN_ENV_NAMES: readonly string[] = [LIVE_API_KEY_ENV, LIVE_ENDPOINT_ENV, 'CLAUDE_CODE_SIMPLE', 'CLAUDE_CODE_SAFE_MODE'];
/** Prefixes any of whose variables refuses the subscription route. */
export const SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES: readonly string[] = ['ANTHROPIC_', 'CLAUDE_CODE_USE_'];
/** The three variables the child inherits on the subscription route, read from the handed environment unless injected. */
export const SUBSCRIPTION_INHERITED_ENV_NAMES: readonly (keyof InheritedEnv)[] = ['HOME', 'USER', 'PATH'];

/** Every forbidden variable the environment carries, by name, sorted. Presence is the key being set at all, empty or not. */
export function subscriptionForbiddenEnvNames(env: NodeJS.ProcessEnv): string[] {
  const names: string[] = [];
  for (const name of Object.keys(env)) {
    if (env[name] === undefined) continue;
    if (SUBSCRIPTION_FORBIDDEN_ENV_NAMES.includes(name) || SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))) names.push(name);
  }
  return names.sort();
}

/**
 * The environment carries a variable the subscription route refuses. Names
 * only: a value here could be a credential, and the point of the refusal is
 * that no credential reaches this route.
 */
export class SubscriptionEnvironmentError extends Error {
  constructor(readonly names: readonly string[]) {
    super(
      `the subscription route refuses to run with [${names.join(', ')}] set: the CLI authenticates through its own subscription session, and each of ${SUBSCRIPTION_FORBIDDEN_ENV_NAMES.join(', ')} and any ${SUBSCRIPTION_FORBIDDEN_ENV_PREFIXES.map((p) => `${p}*`).join(' or ')} variable would make it authenticate or behave other than the accepted probe did; unset them and run again`,
    );
    this.name = 'SubscriptionEnvironmentError';
  }
}

/** The subscription route lacks a variable it requires. */
export class SubscriptionCaptureConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `a subscription capture requires ${LIVE_AGENTS_ENV}=${LIVE_AGENTS_TOKEN}, ${LIVE_MAX_ATTEMPTS_ENV} (the launch budget), ${LIVE_MAX_INPUT_BYTES_ENV}, and the inherited ${SUBSCRIPTION_INHERITED_ENV_NAMES.join(', ')} unless injected; missing [${missing.join(', ')}]. No endpoint and no credential: the CLI's own session authenticates, and the budget is stated rather than defaulted.`,
    );
    this.name = 'SubscriptionCaptureConfigError';
  }
}

/**
 * The subscription route was handed an adapter or a transport that is not its
 * own, or `claude-code-cli@1` for an execution that would spawn the real
 * executable (plan 2026-09-25, D-1).
 */
export class SubscriptionRouteMismatchError extends Error {
  constructor(detail: string) {
    super(`the subscription route runs claude-code-cli@2, or claude-code-cli@1 over an injected launch only, over the process transport and nothing else: ${detail}`);
    this.name = 'SubscriptionRouteMismatchError';
  }
}

/**
 * The stated launch budget is larger than the run's own role launches (plan
 * 2026-09-25, D-5). One reader, the configured prosecutors and one
 * adjudicator are every launch a run makes, and each may spend; a budget
 * above that admits only launches no run of this configuration makes, so it
 * is refused rather than clamped, before anything is created. The
 * configuration's prosecutor count is handed in, never derived from the
 * maximum (Task 5a review repair R7).
 */
export class SubscriptionBudgetError extends Error {
  constructor(readonly adapter: string, readonly stated: number, readonly maxRoleLaunches: number, readonly prosecutorCount: number) {
    super(`the subscription route on ${adapter} admits a launch budget of at most ${maxRoleLaunches}, the configuration's role launches (one reader, ${prosecutorCount} prosecutors, one adjudicator), and ${LIVE_MAX_ATTEMPTS_ENV} states ${stated}; a budget is not clamped, so state one no larger than the run's launches`);
    this.name = 'SubscriptionBudgetError';
  }
}

export interface SubscriptionCaptureConfig {
  budget: RunBudget;
}

/**
 * The subscription route's gates: forbidden variables first, because a
 * credential in the environment is the more serious fact and is refused
 * before anything else is considered; then the required ones.
 */
export function subscriptionCaptureConfigFrom(env: NodeJS.ProcessEnv): SubscriptionCaptureConfig {
  const forbidden = subscriptionForbiddenEnvNames(env);
  if (forbidden.length > 0) throw new SubscriptionEnvironmentError(forbidden);
  const missing: string[] = [];
  if (!liveAgentsEnabled(env)) missing.push(LIVE_AGENTS_ENV);
  for (const name of [LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV]) {
    const value = env[name];
    if (value === undefined || value === '') missing.push(name);
  }
  if (missing.length > 0) throw new SubscriptionCaptureConfigError(missing);
  return { budget: liveBudgetFrom(env) };
}

/**
 * The role configuration the subscription route runs under by default,
 * `claude-code-cli@2`'s (plan 2026-09-25, D-3): the default's roles, lenses
 * and order, every role on the `@2` profile's permitted model, the `@2`
 * adapter identity, and the invocation the `@2` adapter declares. A
 * different `pipelineVersion` and a different `runId` from the HTTP route's
 * and from `@1`'s, by design.
 */
export const SUBSCRIPTION_ROLE_CONFIG: RoleConfig = {
  ...DEFAULT_ROLE_CONFIG,
  models: {
    reader: CLAUDE_CODE_CLI_V2_PROFILE.permittedModels[0]!,
    prosecutor: CLAUDE_CODE_CLI_V2_PROFILE.permittedModels[0]!,
    adjudicator: CLAUDE_CODE_CLI_V2_PROFILE.permittedModels[0]!,
  },
  providerAdapter: CLAUDE_CODE_CLI_V2_IDENTITY,
  invocation: CLAUDE_CODE_CLI_V2_ADAPTER.invocation,
};

/**
 * `claude-code-cli@1`'s configuration, as the route ran it before the
 * migration: the default in every field but the adapter identity, and no
 * invocation at all, so `@1`'s identity does not move.
 */
export const SUBSCRIPTION_ROLE_CONFIG_V1: RoleConfig = { ...DEFAULT_ROLE_CONFIG, providerAdapter: CLAUDE_CODE_CLI_IDENTITY };

const SUBSCRIPTION_V1_KEY = providerAdapterKey(CLAUDE_CODE_CLI_IDENTITY);
const SUBSCRIPTION_V2_KEY = providerAdapterKey(CLAUDE_CODE_CLI_V2_IDENTITY);

/**
 * Which subscription adapter this is, by identity — never by object, so a
 * copy of an adapter is the adapter it copies — or a refusal naming it.
 */
function subscriptionVersionOf(adapter: Pick<ProviderAdapter, 'identity'>): '1' | '2' {
  const key = providerAdapterKey(adapter.identity);
  if (key === SUBSCRIPTION_V1_KEY) return '1';
  if (key === SUBSCRIPTION_V2_KEY) return '2';
  throw new SubscriptionRouteMismatchError(`the adapter handed in is ${key}`);
}

/** The configuration the subscription route runs a given adapter under, matched by identity; any other adapter is refused by name. */
export function subscriptionRoleConfigFor(adapter: Pick<ProviderAdapter, 'identity'>): RoleConfig {
  return subscriptionVersionOf(adapter) === '1' ? SUBSCRIPTION_ROLE_CONFIG_V1 : SUBSCRIPTION_ROLE_CONFIG;
}

/** The profile an adapter launches under. The adapter carries no link to it, so the identity selects it here. */
function subscriptionProfileFor(adapter: Pick<ProviderAdapter, 'identity'>): CliProfile {
  return subscriptionVersionOf(adapter) === '1' ? CLAUDE_CODE_CLI_PROFILE : CLAUDE_CODE_CLI_V2_PROFILE;
}

/**
 * The executable an adapter's profile pins, resolved against `home`: the
 * path the transport launches and the sha256 and size it checks before
 * every launch. Pure: nothing is checked to exist, hashed or read.
 */
export function subscriptionExecutableFor(adapter: Pick<ProviderAdapter, 'identity'>, home: string): ExecutablePin {
  const { pin } = subscriptionProfileFor(adapter);
  return { path: resolvePinPath(pin.path, home), sha256: pin.sha256, sizeBytes: pin.sizeBytes };
}

/**
 * Every role launch one run of a configuration makes: one reader, its
 * prosecutors, one adjudicator — the most launches D-5 lets a `@2` budget
 * state. Exported so the count is shown to follow the configuration, not to
 * be the nine the harness's own configurations happen to make (Task 5a
 * review repair R7).
 */
export function maxRoleLaunchesFor(config: Pick<RoleConfig, 'prosecutorCount'>): number {
  return 1 + config.prosecutorCount + 1;
}

// ---------------------------------------------------------------------------
// Stream sanitisation, pure
// ---------------------------------------------------------------------------

/**
 * Keys whose values are replaced wherever they occur outside a model-output
 * subtree. `projectsDirectory` and `configDirectory` are 2.1.280's gate
 * answer's two directories, which carry the operator's home and so their user
 * name: the gate labels them, and the filed gate stream must not carry them.
 */
export const STREAM_REDACTED_KEYS: ReadonlySet<string> = new Set(['session_id', 'uuid', 'cwd', 'email', 'orgId', 'orgName', 'projectsDirectory', 'configDirectory']);
/** Dotted paths, from the event root, below which nothing is modified. */
export const MODEL_OUTPUT_PATHS: readonly string[] = ['event.delta', 'event.content_block', 'message.content', 'result', 'structured_output'];
export const REDACTED = '[REDACTED]';
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** An inherited value that must never appear in filed evidence, with the name it is reported under. */
export interface SensitiveLiteral {
  name: string;
  value: string;
}

/** Why a string is sensitive, or `null`. Empty literals match nothing: `''.includes` would match everything. */
function sensitivityOf(text: string, literals: readonly SensitiveLiteral[]): string | null {
  if (EMAIL_PATTERN.test(text)) return 'email pattern';
  for (const literal of literals) {
    if (literal.value.length > 0 && text.includes(literal.value)) return `${literal.name} literal`;
  }
  return null;
}

/** The first sensitive string anywhere under a value, described, or `null`. */
function firstSensitiveIn(value: unknown, literals: readonly SensitiveLiteral[]): string | null {
  if (typeof value === 'string') return sensitivityOf(value, literals);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstSensitiveIn(item, literals);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      const found = sensitivityOf(key, literals) ?? firstSensitiveIn(item, literals);
      if (found !== null) return found;
    }
  }
  return null;
}

export interface SanitisedEvent {
  event: Record<string, unknown>;
  /** Set when a model-output subtree carried a sensitive pattern; the event must then not be filed. Names the path and the kind, never the value. */
  omitted: string | null;
}

/**
 * One stream event, sanitised: redacted keys and sensitive strings replaced
 * outside the model-output subtrees, which are returned byte-for-byte and
 * scanned. Pure, so each rule can be exercised alone.
 */
export function sanitiseStreamEvent(event: Record<string, unknown>, literals: readonly SensitiveLiteral[]): SanitisedEvent {
  let omitted: string | null = null;
  const walk = (value: unknown, path: readonly string[]): unknown => {
    const dotted = path.join('.');
    if (MODEL_OUTPUT_PATHS.includes(dotted)) {
      const found = firstSensitiveIn(value, literals);
      if (found !== null && omitted === null) omitted = `model output at ${dotted} contains an ${found}`.replace('an HOME', 'a HOME').replace('an USER', 'a USER');
      return value;
    }
    if (typeof value === 'string') return sensitivityOf(value, literals) === null ? value : REDACTED;
    if (Array.isArray(value)) return value.map((item, i) => walk(item, [...path, String(i)]));
    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = STREAM_REDACTED_KEYS.has(key) ? REDACTED : walk(item, [...path, key]);
      }
      return out;
    }
    return value;
  };
  return { event: walk(event, []) as Record<string, unknown>, omitted };
}

/**
 * A model-output subtree carried a sensitive pattern. The sanitiser never
 * modifies model output, so it cannot be filed; and an execution whose answer
 * cannot be filed cannot go on — the payload would otherwise reach the role
 * output, the transcript and the result, where nothing scans it. Thrown from
 * `onLaunch` after the launch line has been written, so the facts and the
 * reason (path and kind, never the value) are on record; the transport
 * rethrows it unchanged, the runner books `observation_failed` and halts,
 * and the execution fails closed under this name.
 */
export class SensitiveOutputWithheldError extends EvidenceObservationFailedError {
  constructor(readonly seq: number, readonly launchName: string, readonly reason: string, facts?: ProcessFacts) {
    super(`launch ${seq} (${launchName}) is withheld: ${reason}; the stream is not filed and the execution fails closed, because the model's output is never modified and cannot be filed as it is`, facts);
    this.name = 'SensitiveOutputWithheldError';
  }
}

export interface ParsedStreamLine {
  /** The event, when the line parsed as one JSON object; otherwise `null`. */
  event: Record<string, unknown> | null;
  bytes: number;
}

/** Every non-blank stdout line: the object it parses to, or its byte count. */
export function parseStreamLines(stdout: string): ParsedStreamLine[] {
  const out: ParsedStreamLine[] = [];
  for (const text of stdout.split(/\r?\n/)) {
    if (text.trim() === '') continue;
    let event: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) event = parsed as Record<string, unknown>;
    } catch {
      // Filed as unparsed, by size.
    }
    out.push({ event, bytes: Buffer.byteLength(text, 'utf8') });
  }
  return out;
}

export interface SanitisedStream {
  /** One JSON line per stdout line, in order. Empty when `omitted` is set. */
  lines: string[];
  omitted: string | null;
}

/** The whole stream, sanitised, or withheld with the first reason. */
export function sanitiseStream(parsed: readonly ParsedStreamLine[], literals: readonly SensitiveLiteral[]): SanitisedStream {
  const lines: string[] = [];
  for (const { event, bytes } of parsed) {
    if (event === null) {
      lines.push(JSON.stringify({ unparsed: true, bytes }));
      continue;
    }
    const sanitised = sanitiseStreamEvent(event, literals);
    if (sanitised.omitted !== null) return { lines: [], omitted: sanitised.omitted };
    lines.push(JSON.stringify(sanitised.event));
  }
  return { lines, omitted: null };
}

/**
 * What one role launch's stream said about itself, read from the CLI's own
 * events; `null` where the stream said nothing. The fields it shares with
 * `UsageObservation` are what the stream reports about included usage, read
 * by `observeUsage` (plan 2026-09-25, D-6; Task 5b).
 */
export interface StreamObservation extends UsageObservation {
  /** Every `request_id` on an `assistant` event, in order. */
  requestIds: string[];
  /** `result.num_turns`. */
  numTurns: number | null;
  /** `result.usage.thinking_tokens`, a figure the CLI 2.1.226 stream has not been seen to report; `null` means it reported none. */
  thinkingTokens: number | null;
  /** How many `rate_limit_event` lines arrived. */
  rateLimitEvents: number;
  /** `result.usage`, as reported. */
  reportedUsage: Record<string, unknown> | null;
}

function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Reads the observation off the parsed events, and what they report about
 * included usage through `observeUsage`, for a role launch of either adapter.
 * Never throws: a stream that says nothing observes nothing.
 */
export function observeStream(parsed: readonly ParsedStreamLine[]): StreamObservation {
  const observation: Pick<StreamObservation, 'requestIds' | 'numTurns' | 'thinkingTokens' | 'rateLimitEvents' | 'reportedUsage'> = { requestIds: [], numTurns: null, thinkingTokens: null, rateLimitEvents: 0, reportedUsage: null };
  for (const { event } of parsed) {
    if (event === null) continue;
    if (event['type'] === 'assistant' && typeof event['request_id'] === 'string') observation.requestIds.push(event['request_id']);
    if (event['type'] === 'rate_limit_event') observation.rateLimitEvents += 1;
    if (event['type'] === 'result') {
      observation.numTurns = countOrNull(event['num_turns']);
      const usage = event['usage'];
      if (typeof usage === 'object' && usage !== null && !Array.isArray(usage)) {
        observation.reportedUsage = usage as Record<string, unknown>;
        observation.thinkingTokens = countOrNull((usage as Record<string, unknown>)['thinking_tokens']);
      }
    }
  }
  return { ...observation, ...observeUsage(parsed) };
}

/** The observation's count maps: their keys are stream strings and their values counts, not copied subtrees. */
const OBSERVATION_COUNTS: ReadonlySet<string> = new Set(['blockTypes', 'systemSubtypes']);

/**
 * An observation as it is filed, held to the stream's own rules outside the
 * model's output (Task 5b review repairs R15 and N3, a parent decision
 * P-5b-11, extended): the value of every `STREAM_REDACTED_KEYS` key, and
 * every string that matches an email pattern or carries an inherited
 * literal, replaced by `[REDACTED]`, wherever it sits in what the
 * observation copied from the stream. `observeStream` reads the raw parse,
 * and `observeUsage` copies whole subtrees — a `unifiedWindows`, an
 * object-valued `overageScope`, the `fast_mode*` fields, a result's `usage`
 * — so an `orgId` or an email address inside one would reach
 * `launches.jsonl` though the stream filed beside it is redacted; and
 * `onLaunch`'s leak check, which refuses a line carrying either, would then
 * refuse the launch line itself, and the launch's facts — a rejected
 * window's reset among them — would be filed nowhere. The count maps keep
 * their counts, and a key the value rule would replace is renamed
 * `[REDACTED]`, its count added to any already there; the observation's own
 * field names never collide with either rule. Pure.
 */
export function redactObservation(observation: StreamObservation, literals: readonly SensitiveLiteral[]): StreamObservation {
  // Every copy is built with own-data-property semantics (Object.fromEntries), never `out[key] =` (Task 5b review
  // repair O1): JSON.parse makes "__proto__" an own key, and assigning it would set the copy's prototype instead,
  // so a window keyed "__proto__" that reports "rejected" would vanish from the filed observation and its reset hold with it.
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return sensitivityOf(value, literals) === null ? value : REDACTED;
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, STREAM_REDACTED_KEYS.has(key) ? REDACTED : walk(item)]));
  };
  const counted = (counts: Record<string, number>): Record<string, number> => {
    const merged = new Map<string, number>();
    for (const [key, count] of Object.entries(counts)) {
      const name = sensitivityOf(key, literals) === null ? key : REDACTED;
      merged.set(name, (merged.get(name) ?? 0) + count);
    }
    return Object.fromEntries(merged);
  };
  const out = Object.fromEntries(Object.entries(observation).map(([key, item]) => [key, OBSERVATION_COUNTS.has(key) ? counted(item as Record<string, number>) : walk(item)]));
  return out as unknown as StreamObservation;
}

// ---------------------------------------------------------------------------
// The request and the outcome
// ---------------------------------------------------------------------------

/** What tests inject on the subscription route; production supplies none of it. */
export interface SubscriptionCaptureOptions {
  /** The pin. Defaults to the adapter's profile's pin resolved against the inherited `HOME` (`subscriptionExecutableFor`). */
  executable?: ExecutablePin;
  /** The launch function. Defaults to the real `spawn`; `claude-code-cli@1` without an injected one is refused (D-1). */
  launch?: LaunchFunction;
  /** Test-only: the bound on each role launch in place of the profile's. Marks the execution synthetic and `budgets.injected`. A positive integer of at most `MAX_TIMER_MS`, or refused (`UnsupportedTimeoutError`). */
  launchTimeoutMs?: number;
  /** Test-only: the bound on the gate launch in place of the profile's. Marks the execution synthetic and `budgets.injected`. A positive integer of at most `MAX_TIMER_MS`, or refused (`UnsupportedTimeoutError`). */
  gateTimeoutMs?: number;
  /** The three inherited variables. Defaults to `HOME`, `USER`, `PATH` from the handed environment. */
  inheritedEnv?: InheritedEnv;
  /** Where `SIGINT`/`SIGTERM` are listened for. Defaults to `process`. */
  interrupts?: EventEmitter;
  termGraceMs?: number;
  killGraceMs?: number;
  tempRoot?: string;
}

export interface LiveCaptureRequest {
  packId: string;
  requirementId: string;
  /**
   * The world to run over. `verificationDir` is read for its
   * `requirement-versions/<packId>.json`, which is copied into the execution's
   * own verification root; nothing is written under the caller's directory.
   */
  paths: VerifyPaths;
  /** Where this execution is filed. Absolute. Refused if it meets the fixture root. */
  executionRoot: string;
  /** The environment the gates are read from. Never defaulted to `process.env`. */
  env: NodeJS.ProcessEnv;
  /** Which route. Defaults to `http`. */
  route?: CaptureRoute;
  /** The provider adapter. Refused before construction when absent. On the subscription route it must be `claude-code-cli@2`, or `@1` over an injected launch, and defaults to `@2`. */
  adapter?: ProviderAdapter;
  /** Injected by offline tests on the HTTP route. A genuine execution supplies none and is marked as such. Refused on the subscription route. */
  transport?: ProviderTransport;
  /** Subscription route only. */
  subscription?: SubscriptionCaptureOptions;
  /** Fixed by tests; otherwise a timestamp with a random suffix. Not an identity of anything. */
  executionId?: string;
  /** Wall clock for timestamps in the diagnostics. Never used for identity. */
  now?: () => Date;
  /** After this many milliseconds the execution is cancelled: in-flight attempt aborted, waits ended, no further sends. */
  deadlineMs?: number;
  /** The fixture root the guard compares against. Defaults to the real one. */
  fixtureRoot?: string;
}

/** One operator interrupt, as handled. */
export interface InterruptRecord {
  signal: 'SIGINT' | 'SIGTERM';
  at: string;
  action: 'abort' | 'escalate';
}

export interface LiveCaptureOutcome {
  status: 'completed' | 'failed';
  route: CaptureRoute;
  executionId: string;
  executionDir: string;
  /** The run identity, once orchestration derived it. `null` for an execution that did not complete. */
  runId: string | null;
  transcriptPath: string | null;
  resultPath: string | null;
  attemptsPath: string;
  summaryPath: string;
  /** Subscription route only; `null` on the HTTP route. */
  launchesPath: string | null;
  streamsDir: string | null;
  /** HTTP attempts actually sent, retries included: the runner's `ledger.attemptsUsed`. `null` on the subscription route, where they are unknown. */
  httpAttempts: number | null;
  /** Children that started: the runner's `ledger.launchesStarted`. Zero on the HTTP route. */
  launches: number;
  gateLaunches: number;
  /** Refusals that sent nothing: admission, budget, cancellation before send. */
  unsentEvents: number;
  /** Lines in `attempts.jsonl`: sent attempts plus `unsentEvents`. */
  recordsWritten: number;
  cancelled: boolean;
  cancellationReason: string | null;
  gate: GateResult | null;
  interrupts: InterruptRecord[];
  interruptedBy: 'SIGINT' | 'SIGTERM' | null;
  terminationUnconfirmed: boolean;
  /** The harness withheld the run's outputs: a completed run whose termination was unconfirmed, a completed `@2` run whose launches report a fact against included usage, or a launch whose model output could not be filed. Any result already written was deleted. */
  resultWithheld: boolean;
  ledger: BudgetLedger;
  error: { name: string; message: string } | null;
  exitCode: number | null;
  lines: string[];
}

function redact(text: string, secret: string): string {
  return secret.length === 0 ? text : text.split(secret).join('[redacted]');
}

function contains(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** The execution directory, made once, with the requirement-versions register copied in. */
function prepareExecutionDir(request: LiveCaptureRequest, executionId: string): { executionDir: string; verificationDir: string } {
  const caseDir = join(request.executionRoot, request.packId, request.requirementId);
  const executionDir = join(caseDir, executionId);
  mkdirSync(caseDir, { recursive: true });
  try {
    mkdirSync(executionDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ExecutionExistsError(executionDir);
    throw error;
  }
  const verificationDir = join(executionDir, 'verification');
  mkdirSync(join(verificationDir, 'requirement-versions'), { recursive: true });
  cpSync(join(request.paths.verificationDir, 'requirement-versions', `${request.packId}.json`), join(verificationDir, 'requirement-versions', `${request.packId}.json`));
  return { executionDir, verificationDir };
}

function describeError(thrown: unknown, secret: string): { name: string; message: string } {
  return thrown instanceof Error
    ? { name: thrown.name, message: redact(thrown.message, secret) }
    : { name: 'UnknownFailure', message: redact(String(thrown), secret) };
}

/**
 * One live execution, through the production command path, with everything it
 * produced filed together.
 *
 * The gates are checked **before anything is constructed or written**:
 * the route's configuration first, then `assertLiveAgentsEnabled`, then the
 * adapter, then the execution root — so an unauthorised or misdirected call
 * fails having contacted nothing and created nothing.
 */
export async function captureLiveRun(request: LiveCaptureRequest): Promise<LiveCaptureOutcome> {
  // The route, before anything else: the selector decides, and a stated
  // route that contradicts it is refused rather than obeyed.
  const selected = subscriptionCaptureSelected(request.env);
  const selectorPresent = request.env[SUBSCRIPTION_CAPTURE_ENV] !== undefined;
  let route: CaptureRoute;
  if (request.route === undefined) route = captureRouteFor(request.env);
  else {
    if (request.route === 'http' && selectorPresent) throw new CaptureRouteConflictError(`route http was requested with ${SUBSCRIPTION_CAPTURE_ENV} set`);
    if (request.route === 'subscription' && !selected) throw new CaptureRouteConflictError(`route subscription was requested without ${SUBSCRIPTION_CAPTURE_ENV}=${SUBSCRIPTION_CAPTURE_TOKEN}`);
    route = request.route;
  }
  if (route === 'subscription') return captureSubscriptionRun(request);
  // The HTTP path refuses anything of the other route's: the selector in any
  // form, a process-channel adapter, or a CLI identity — any version — on any
  // channel.
  if (selectorPresent) throw new CaptureRouteConflictError(`the HTTP route was derived while ${SUBSCRIPTION_CAPTURE_ENV} is set to a value other than ${SUBSCRIPTION_CAPTURE_TOKEN}`);
  if (request.adapter !== undefined) {
    const { identity } = request.adapter;
    if (request.adapter.channel === 'process') throw new CaptureRouteConflictError(`the adapter ${identity.id}@${identity.version} speaks the process channel, which only the subscription route runs`);
    if (identity.id === CLAUDE_CODE_CLI_IDENTITY.id) throw new CaptureRouteConflictError(`the adapter identity is ${identity.id}@${identity.version}, which only the subscription route runs`);
  }
  const config = liveCaptureConfigFrom(request.env);
  assertLiveAgentsEnabled(request.env);
  const adapter = requireProviderAdapter(request);
  const fixtureRoot = resolve(request.fixtureRoot ?? DEFAULT_FIXTURE_ROOT);
  if (contains(fixtureRoot, request.executionRoot) || contains(request.executionRoot, fixtureRoot)) {
    throw new ExecutionRootError(resolve(request.executionRoot), fixtureRoot);
  }
  // Before the first directory exists: a lifetime the timer cannot honour is
  // refused here, whether derived from the budget or supplied explicitly.
  if (request.deadlineMs !== undefined) assertSupportedLifetime(request.deadlineMs);

  const now = request.now ?? (() => new Date());
  const startedAt = now();
  const executionId = request.executionId ?? `${stamp(startedAt)}-${randomBytes(3).toString('hex')}`;
  const { executionDir, verificationDir } = prepareExecutionDir(request, executionId);
  const attemptsPath = join(executionDir, 'attempts.jsonl');
  const summaryPath = join(executionDir, 'execution.json');
  const adapterName = `${adapter.identity.id}@${adapter.identity.version}`;
  const synthetic = request.transport !== undefined;

  const writeSummary = (fields: Record<string, unknown>): void => {
    const summary = {
      packId: request.packId,
      requirementId: request.requirementId,
      executionId,
      route: 'http',
      attemptUnit: 'http_attempt',
      adapter: adapterName,
      transport: synthetic ? 'injected' : 'fetch',
      synthetic,
      budget: config.budget,
      deadlineMs: request.deadlineMs ?? null,
      startedAt: startedAt.toISOString(),
      ...fields,
    };
    writeFileSync(summaryPath, redact(`${JSON.stringify(summary, null, 2)}\n`, config.apiKey), 'utf8');
  };
  writeSummary({ status: 'running', runId: null, finishedAt: null, httpAttempts: 0, unsentEvents: 0, recordsWritten: 0, cancelled: false, ledger: null, exitCode: null, lines: [], error: null });

  let unsentEvents = 0;
  let recordsWritten = 0;
  const observe = (record: AttemptRecord): void => {
    appendFileSync(attemptsPath, redact(`${JSON.stringify({ at: now().toISOString(), ...record })}\n`, config.apiKey), 'utf8');
    recordsWritten += 1;
    if (!record.sent) unsentEvents += 1;
  };
  // `attempts.jsonl` exists even for an execution that never sends: an empty
  // file says "no attempt was made", where an absent one would say nothing.
  writeFileSync(attemptsPath, '', 'utf8');

  // The lifetime: one controller for the whole execution, handed to the
  // runner, fired by the deadline and cleared when the execution ends.
  const lifetime = new AbortController();
  const deadline = request.deadlineMs === undefined ? null : setTimeout(() => lifetime.abort(`deadline of ${request.deadlineMs} ms`), request.deadlineMs);

  const runner = createLiveAgentRunner({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    adapter,
    budget: config.budget,
    observe,
    signal: lifetime.signal,
    ...(request.transport === undefined ? {} : { transport: request.transport }),
  }) as LiveAgentRunner;

  // A holder rather than a `let`: the assignment happens inside a callback,
  // and TypeScript would otherwise narrow the variable to `null` for good.
  const handed: { transcript: RunTranscript | null } = { transcript: null };
  let exitCode: number | null = null;
  let lines: string[] = [];
  let error: { name: string; message: string } | null = null;
  try {
    const outcome = await dispatch(
      ['run', request.packId, request.requirementId],
      { ...request.paths, verificationDir },
      () => true,
      undefined,
      {
        runner,
        record: (transcript) => {
          handed.transcript = transcript;
        },
      },
    );
    exitCode = outcome.exitCode;
    lines = outcome.lines.map((line) => redact(line, config.apiKey));
    if (outcome.exitCode !== EXIT_OK) {
      error = { name: 'RunRefused', message: `the run did not complete (exit ${outcome.exitCode}): ${lines.join(' | ')}` };
    } else if (handed.transcript === null) {
      error = { name: 'NoRecording', message: `the run exited ${outcome.exitCode} but orchestration handed over no transcript` };
    }
  } catch (thrown) {
    error = describeError(thrown, config.apiKey);
  } finally {
    if (deadline !== null) clearTimeout(deadline);
  }
  const cancelled = lifetime.signal.aborted;

  const transcript: RunTranscript | null = error === null ? handed.transcript : null;
  let transcriptPath: string | null = null;
  if (transcript !== null) {
    transcriptPath = writeRunTranscript(join(executionDir, 'transcript'), transcript);
  }
  const resultCandidate = join(verificationDir, request.packId, request.requirementId, 'verification-result.json');
  const resultPathOut = transcript !== null && existsSync(resultCandidate) ? resultCandidate : null;
  const status: LiveCaptureOutcome['status'] = transcript !== null ? 'completed' : 'failed';
  const ledger = runner.ledger;
  // `httpAttempts` is the ledger's figure, never a count of observer calls:
  // the two must agree, and the ledger is the runner's own account.
  const httpAttempts = ledger.attemptsUsed;
  writeSummary({
    status,
    runId: transcript?.runId ?? null,
    finishedAt: now().toISOString(),
    httpAttempts,
    unsentEvents,
    recordsWritten,
    cancelled,
    ledger,
    exitCode,
    lines,
    error,
    transcriptPath,
    resultPath: resultPathOut,
  });

  return {
    status,
    route: 'http',
    executionId,
    executionDir,
    runId: transcript?.runId ?? null,
    transcriptPath,
    resultPath: resultPathOut,
    attemptsPath,
    summaryPath,
    launchesPath: null,
    streamsDir: null,
    httpAttempts,
    launches: 0,
    gateLaunches: 0,
    unsentEvents,
    recordsWritten,
    cancelled,
    cancellationReason: cancelled ? String(lifetime.signal.reason) : null,
    gate: null,
    interrupts: [],
    interruptedBy: null,
    terminationUnconfirmed: false,
    resultWithheld: false,
    ledger,
    error,
    exitCode,
    lines,
  };
}

// ---------------------------------------------------------------------------
// The subscription route
// ---------------------------------------------------------------------------

/** The name of the gate's refusal in `execution.json.error`. */
export const GATE_REFUSED_ERROR_NAME = 'AuthenticationGateRefused';
/** The name in `execution.json.error` of a gate that outlived its own timeout. */
export const GATE_TIMEOUT_ERROR_NAME = 'GateTimeout';
/** The lifetime's abort reason, and so the cancellation reason, when the gate's timer fires. */
export const GATE_TIMEOUT_REASON = 'gate_timeout';

/** Where in a subscription execution an error was thrown: the gate call, or the roles dispatched after the gate passed. */
export type SubscriptionPhase = 'gate' | 'roles';

/** The transport's words for a launch its signal refused before the child existed. */
const ABORTED_BEFORE_LAUNCH = 'aborted before launch';

/** The transport's own words for a launch its signal ended: refused before the child existed, or ended while it ran. */
function isTransportAbort(thrown: unknown): thrown is ProcessTransportError {
  return thrown instanceof ProcessTransportError && (thrown.message === ABORTED_BEFORE_LAUNCH || thrown.message.startsWith('aborted while the child was running ('));
}

/**
 * How the gate's timer met the gate launch: it ended the running child; it
 * fired before the child was launched (during the pin check, so none was); or
 * it fired after the child had answered, before the verdict was read.
 */
type GateTimeoutPath = 'ended' | 'before_launch' | 'after_answer';

/**
 * `execution.json.error` for a gate that outlived its own timeout, saying
 * which way the timer met the launch (Task 5a review repair N2): one message
 * for every path said the gate child was ended, which on two of them no
 * timer did.
 */
function gateTimeoutErrorFor(gateTimeoutMs: number | null, path: GateTimeoutPath): { name: string; message: string } {
  const what =
    path === 'ended' ? 'the gate child was ended and no role was dispatched'
    : path === 'before_launch' ? 'the timer fired before the gate child was launched (none was), and no role was dispatched'
    : 'the timer fired after the gate child had answered, so its verdict was not taken, and no role was dispatched';
  return { name: GATE_TIMEOUT_ERROR_NAME, message: `the authentication gate did not finish within its gate timeout of ${gateTimeoutMs} ms; ${what}` };
}

/**
 * What `execution.json.error` says for an error a subscription execution
 * threw (Task 5a review repair R3). `GateTimeout` only when all three hold:
 * the gate call threw it; it is the transport's own abort of the gate launch;
 * and the lifetime was aborted for `gate_timeout`, which only the gate's
 * timer does. Its message says whether the transport ended the running gate
 * child or refused to launch one (N2). Filing every error thrown once the
 * timer had fired as a timeout hid a pin mismatch or an evidence failure
 * behind the timer's name, and would have renamed a role's error too. Any
 * other error keeps its own name and message, and when the lifetime was
 * aborted for `gate_timeout` the message says the timer had fired. Pure, so
 * each condition is shown to decide alone.
 */
export function subscriptionErrorOf(thrown: unknown, phase: SubscriptionPhase, abortReason: unknown, gateTimeoutMs: number | null): { name: string; message: string } {
  const timerFired = abortReason === GATE_TIMEOUT_REASON;
  if (phase === 'gate' && timerFired && isTransportAbort(thrown)) return gateTimeoutErrorFor(gateTimeoutMs, thrown.message === ABORTED_BEFORE_LAUNCH ? 'before_launch' : 'ended');
  const own = describeError(thrown, '');
  return timerFired ? { name: own.name, message: `${own.message} (the gate timer of ${gateTimeoutMs} ms had fired, and the lifetime was aborted for ${GATE_TIMEOUT_REASON})` } : own;
}

/**
 * What `execution.json.error` says, if anything, for a gate call that
 * returned a verdict rather than throwing (Task 5a review repair N1). The
 * timer can fire after the gate child has answered and before the verdict is
 * read — while the transport cleans up and files the launch — and then the
 * lifetime is already over: the verdict is not taken, and the execution fails
 * as `GateTimeout`, saying the child had answered. Under any other reason, or
 * none, `null`: the verdict's own handling applies. Pure, so the decision is
 * shown directly as well as through the harness.
 */
export function gateVerdictErrorOf(abortReason: unknown, gateTimeoutMs: number | null): { name: string; message: string } | null {
  return abortReason === GATE_TIMEOUT_REASON ? gateTimeoutErrorFor(gateTimeoutMs, 'after_answer') : null;
}

/** Stated once, filed on every `claude-code-cli@1` summary: what this route configures without observing. */
export const SUBSCRIPTION_UNOBSERVED = Object.freeze({
  outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=16000; wire-level max_tokens unobserved',
  thinking: 'CLI-decided for effort high; not asserted',
});
/**
 * Stated once, filed on every `claude-code-cli@2` summary: what `@2`'s
 * profile configures without the stream showing it (plan 2026-09-25, D-5,
 * D-6). The ceiling and catalog statements are the pinned 2.1.295's, read
 * statically by the parent's recheck
 * (`parent-static-recheck-summary.20261015T073247Z.log`) when the pin moved
 * from 2.1.280 on 2026-10-15. The extra-usage statement is the parent's
 * later static reading of the same bytes
 * (`parent-bytes-findings.20261015T135500Z.md`, D2): the build reports
 * `overageEnabled` only on some `allowed_warning` events, behind a gate, so
 * a stream without it says nothing about extra usage.
 */
export const SUBSCRIPTION_V2_UNOBSERVED = Object.freeze({
  outputCeiling: 'configured CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000, which 2.1.295 honours statically up to the model\'s own limit; wire-level max_tokens unobserved',
  effort: 'effort high passed as --effort; its application unobserved',
  thinking: 'always on for claude-opus-5-5, and counted toward the 64000 ceiling; not asserted',
  modelCatalog: 'not pinned by the executable hash: the embedded catalog expires at 2026-10-15T05:28:34Z, and a remote catalog is assumed blocked by CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, unverified',
  extraUsage: 'overageEnabled is reported only on some allowed_warning events (2.1.295, statically); its absence is not read as extra usage off, and extra usage being off remains the user-confirmed precondition of D-6',
});
export const SUBSCRIPTION_MEASURED = Object.freeze({
  admittedLaunchInputBytes: 'UTF-8 length of the JSON launch description; upper bound on prompt-file + stdin bytes; not the provider request size',
});

/** One line of `launches.jsonl`. */
export interface LaunchLine {
  at: string;
  seq: number;
  kind: LaunchRecord['kind'];
  role: string | null;
  index: number | null;
  argv: string[];
  envNames: string[];
  facts: ProcessFacts;
  /** Both pipes were seen to close; `false` means the launch was given up on while an untracked process still held them. */
  streamsClosed: boolean;
  /** Relative to the execution directory; `null` when withheld. */
  stream: string | null;
  streamOmitted: string | null;
  observed: StreamObservation | null;
}

/**
 * Every launch whose cleanup was not confirmed, with the facts that say so:
 * a termination whose child was not seen reaped or whose group was not seen
 * gone, or a launch — gate or role — whose pipes were still held when it was
 * given up on. The transport refuses such a launch where it happens, so no
 * natural caller reaches this rule with a clean error; it is the backstop,
 * pure so each fact can be proved to trip it alone.
 */
export function unconfirmedLaunches(lines: readonly LaunchLine[]): string[] {
  return lines.flatMap((line) => {
    const facts: string[] = [];
    if (line.facts.termination !== null) {
      if (!line.facts.termination.childReaped) facts.push('childReaped false');
      if (line.facts.termination.groupGone !== true) facts.push(`groupGone ${String(line.facts.termination.groupGone)}`);
    }
    if (!line.streamsClosed) facts.push('streamsClosed false');
    return facts.length === 0 ? [] : [`launch ${line.seq} (${line.kind === 'gate' ? 'gate' : `${line.role}[${line.index}]`}): ${facts.join(', ')}`];
  });
}

/** The name in `execution.json.error` of a completed `@2` run whose launches report a fact against included usage (plan 2026-09-25, D-6). */
export const INCLUDED_USAGE_UNCONFIRMED = 'IncludedUsageUnconfirmed';

/**
 * The kinds the harness stops a run for in flight, after a launch the
 * projection accepted: the two no projection rule covers (Task 5b, a parent
 * decision P-5b-6). Every other fact is the projection's to refuse (D-7 is
 * its authority) and the post-drain backstop's to catch.
 */
const IN_FLIGHT_STOP_KINDS: ReadonlySet<string> = new Set(['long_context_boundary', 'unnatural_reset']);

/**
 * A `@2` launch the projection accepted reports a context above D-5's
 * per-request ceiling, or a window reset early (D-6), and the run stops
 * there: the lifetime is aborted (`usage_stop:<role>[<index>]`) so nothing
 * later launches, the launch stays booked as the runner booked it, and the
 * usage stop is carried here and filed in `execution.json`.
 */
export class UsageStopError extends Error {
  constructor(readonly usageStop: UsageStop, readonly launch: { seq: number | null; role: string; index: number }) {
    super(`included usage stops the run after launch ${launch.seq ?? 'unknown'} (${launch.role}[${launch.index}]): usage stop ${usageStop.kind} — ${describeUsageFacts(usageStop.facts)}; no later role is launched, and ${usageStop.note}`);
    this.name = 'UsageStopError';
  }
}

/**
 * An earlier execution under the execution root stopped for included usage
 * until a time not yet reached, or left a record this check cannot read, or
 * never finished; or the walk met the execution root or an entry under it
 * that it cannot examine, or that is a symbolic link, which it neither
 * follows nor passes over. Refused before anything is created (plan
 * 2026-09-25, D-6; Task 5b, a parent decision P-5b-7, and review repairs R9,
 * R10, N4 and N5, parent decisions P-5b-9 and P-5b-10): usage limits are the
 * account's, not a requirement's.
 */
export class UsageResetPendingError extends Error {
  constructor(detail: string, readonly resetsAt: number | null = null, readonly recordedBy: string | null = null) {
    super(`refusing to start a subscription execution: ${detail}; a resume is a new, separately approved execution`);
    this.name = 'UsageResetPendingError';
  }
}

const isJsonObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A filesystem error's code, or what the error is when it carries none: never its message, which names the whole path. */
function errorCodeOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === 'string' ? code : error instanceof Error ? error.name : String(error);
}

/**
 * The names of the directories directly under `<executionRoot>/<relative>`,
 * sorted, for the reset-pending walk. A file is not one and is passed over; a
 * symbolic link is refused by name, never followed and never passed over,
 * and so is a directory that cannot be listed (Task 5b review repair R10, a
 * parent decision P-5b-10): either could hide an earlier execution's record.
 */
function directoriesUnder(executionRoot: string, relative: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(join(executionRoot, relative), { withFileTypes: true });
  } catch (error) {
    throw new UsageResetPendingError(`${relative === '' ? 'the execution root' : `the directory ${relative} under the execution root`} cannot be listed (${errorCodeOf(error)}), so whether an earlier execution in it stopped for included usage is unknown`);
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new UsageResetPendingError(`the entry ${join(relative, entry.name)} under the execution root is a symbolic link, which this check neither follows nor passes over`);
    if (entry.isDirectory()) names.push(entry.name);
  }
  return names.sort();
}

/**
 * What `lstat` says of an execution directory's record, or `null` when there
 * is none (ENOENT): an execution directory without a record holds no usage
 * stop. Any other error is refused by name, never taken for an absence (Task
 * 5b review repair R10, a parent decision P-5b-10): `existsSync` said "no
 * record" for a directory it could not search.
 */
function recordStatsOf(file: string, named: string): Stats | null {
  try {
    return lstatSync(file);
  } catch (error) {
    if (errorCodeOf(error) === 'ENOENT') return null;
    throw new UsageResetPendingError(`the earlier execution record ${named} under the execution root cannot be examined (${errorCodeOf(error)}), so whether it stopped for included usage is unknown`);
  }
}

/**
 * A reset time the reset-pending check can hold a start to (the reset-hold repair): a safe integer of epoch seconds
 * greater than 0, as 2.1.295's schema types `resetsAt`. Anything else — `null`, a string (a numeric one included), a
 * boolean, an object, `0`, a negative number, a fraction — is unknown. Its own definition, not `included-usage.ts`'s:
 * the check reads records `usageStopOf` may not have written, and must not agree with a defect there.
 */
const isUsableResetTime = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** A recorded value for a refusal: absent, or its JSON. */
const asRecorded = (value: unknown): string => (value === undefined ? 'absent' : JSON.stringify(value));

/** An epoch-seconds instant as ISO text, or a note when it lies outside the Date range. */
function isoOfSeconds(seconds: number): string {
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? `an instant outside the Date range` : date.toISOString();
}

/**
 * D-6's reset-pending check, over the clock the execution would start at:
 * every `<executionRoot>/<packId>/<requirementId>/<executionId>/execution.json`
 * at exactly depth three, any pack, any requirement. Each record holds until
 * the latest of its `usageStop.resetsAt` and the reset of every exhausted or
 * overage fact in its `usageStop.facts`, so its aggregate cannot shorten the
 * hold (the reset-hold repair). A start before the latest such time any of
 * them recorded is refused, naming it, where it was recorded and the
 * execution that recorded it; a start at or after it proceeds. A usable
 * reset is a safe integer of epoch seconds greater than 0. This check fails
 * closed, refusing by name:
 * - a record that is not a JSON object, or whose `usageStop` is neither
 *   `null` nor an object, or whose `usageStop.resetsAt` is present and
 *   neither `null` nor a usable reset (`0`, a negative number and a fraction
 *   among them, since the reset-hold repair);
 * - a finished record whose stop has an exhausted or overage fact and whose
 *   `usageStop.resetsAt` is `null` (Task 5b review repair M4, a parent
 *   decision P-5b-14), and a finished record any of whose exhausted or
 *   overage facts has a `resetsAt` that is absent or not a usable reset,
 *   naming the fact by its position, name and kind and the value as
 *   recorded, whatever the aggregate says and whatever the clock (the
 *   reset-hold repair): an operator must review either before any new
 *   subscription execution starts;
 * - a record whose `status` is neither "completed" nor "failed" (Task 5b
 *   review repair R9, a parent decision P-5b-9): a crashed or still-running
 *   execution never wrote its usage stop, and its `launches.jsonl` may record
 *   a rejected window, so an operator must review it first;
 * - a symbolic link at the pack, requirement, execution or record level,
 *   which is neither followed nor passed over, and any entry the walk cannot
 *   list or examine (Task 5b review repair R10, a parent decision P-5b-10);
 *   and the execution root itself when it is a symbolic link, or cannot be
 *   examined for any reason but its absence (Task 5b review repairs N4 and
 *   N5, a parent decision P-5b-10, extended).
 * An absent root holds no earlier execution, and an execution directory
 * without a record holds no usage stop. A regular file where the walk
 * expects a directory is no execution and is passed over. The check only
 * reads: it never writes, renames or deletes a record.
 */
function assertNoResetPending(namedRoot: string, startedAt: Date): void {
  // The root as resolved (Task 5b review repair O2): POSIX lstat follows a link named with a trailing separator, and
  // resolve drops it, so the link check sees the link itself; the walk below reads the same resolved path.
  const executionRoot = resolve(namedRoot);
  let rootStats: Stats;
  try {
    rootStats = lstatSync(executionRoot);
  } catch (error) {
    if (errorCodeOf(error) === 'ENOENT') return;
    throw new UsageResetPendingError(`the execution root cannot be examined (${errorCodeOf(error)}), so whether an earlier execution under it stopped for included usage is unknown`);
  }
  // The root is held to the rule every level below it is (Task 5b review repair N5, a parent decision P-5b-10,
  // extended): `lstat` reports its last component only, so a link above it (macOS's /var) is not one here.
  if (rootStats.isSymbolicLink()) throw new UsageResetPendingError('the execution root is a symbolic link, which this check neither follows nor passes over');
  let latest: { resetsAt: number; source: string; recordedBy: string } | null = null;
  for (const packId of directoriesUnder(executionRoot, '')) {
    for (const requirementId of directoriesUnder(executionRoot, packId)) {
      for (const executionId of directoriesUnder(executionRoot, join(packId, requirementId))) {
        const recordedBy = join(packId, requirementId, executionId);
        const file = join(executionRoot, recordedBy, 'execution.json');
        const named = join(recordedBy, 'execution.json');
        const stats = recordStatsOf(file, named);
        if (stats === null) continue;
        if (stats.isSymbolicLink()) throw new UsageResetPendingError(`the earlier execution record ${named} under the execution root is a symbolic link, which this check neither follows nor passes over`);
        let summary: unknown;
        try {
          summary = JSON.parse(readFileSync(file, 'utf8'));
        } catch (error) {
          throw new UsageResetPendingError(`the earlier execution record ${named} under the execution root cannot be read as JSON (${error instanceof Error ? error.message : String(error)}), so whether it stopped for included usage is unknown`);
        }
        if (!isJsonObject(summary)) throw new UsageResetPendingError(`the earlier execution record ${named} under the execution root is not a JSON object, so whether it stopped for included usage is unknown`);
        const usageStop = Object.hasOwn(summary, 'usageStop') ? summary['usageStop'] : null;
        if (usageStop !== null && !isJsonObject(usageStop)) throw new UsageResetPendingError(`the earlier execution record ${named} under the execution root carries a usageStop that is neither null nor an object`);
        const resetsAt = usageStop === null || !Object.hasOwn(usageStop, 'resetsAt') ? null : usageStop['resetsAt'];
        if (resetsAt !== null && !isUsableResetTime(resetsAt)) throw new UsageResetPendingError(`the earlier execution record ${named} under the execution root carries usageStop.resetsAt ${JSON.stringify(resetsAt)}, which is neither null nor a usable reset time (a safe integer of epoch seconds greater than 0)`);
        // A stop's facts are read to see what it recorded, so a shape other than an array of objects fails closed
        // (Task 5b review repair M4, a parent decision P-5b-14).
        const facts = usageStop === null ? [] : Object.hasOwn(usageStop, 'facts') ? usageStop['facts'] : undefined;
        if (!Array.isArray(facts) || !facts.every(isJsonObject)) {
          throw new UsageResetPendingError(`the earlier execution record ${named} under the execution root carries usageStop.facts ${facts === undefined ? 'absent' : JSON.stringify(facts)}, which is not an array of objects, so whether it stopped for included usage is unknown`);
        }
        const status = summary['status'];
        if (status !== 'completed' && status !== 'failed') {
          throw new UsageResetPendingError(
            `the earlier execution record ${named} under the execution root has status ${status === undefined ? 'absent' : JSON.stringify(status)}, neither "completed" nor "failed": a crashed or still-running execution, whose usage stop, if any, was never written and whose launches.jsonl may record a rejected window, so an operator must review it before any new subscription execution starts`,
          );
        }
        // An exhaustion or overage whose reset time was not usable holds until reviewed (Task 5b review repair M4, a parent
        // decision P-5b-14): usageStopOf files resetsAt null for it (since the reset-hold repair, whatever reset another
        // fact reports), and a null would let the next start at once. The words are unchanged from M4's.
        if (resetsAt === null && facts.some((fact) => fact['kind'] === 'exhausted' || fact['kind'] === 'overage')) {
          throw new UsageResetPendingError(
            `the earlier execution record ${named} under the execution root recorded an exhaustion or overage that reported no reset time as a number (usageStop.resetsAt null), so an operator must review it before any new subscription execution starts`,
            null,
            recordedBy,
          );
        }
        // Every exhausted or overage fact is read itself (the reset-hold repair), so the check does not rely on
        // usageStopOf having written the aggregate: a record written before the repair can file a usable aggregate
        // beside a fact that reported no usable reset, which holds until an operator reviews it, whatever the clock.
        let holds: { resetsAt: number; source: string } | null = typeof resetsAt === 'number' ? { resetsAt, source: 'usageStop.resetsAt' } : null;
        for (let position = 0; position < facts.length; position += 1) {
          const fact = facts[position]!;
          const kind = fact['kind'];
          if (kind !== 'exhausted' && kind !== 'overage') continue;
          const factResetsAt = Object.hasOwn(fact, 'resetsAt') ? fact['resetsAt'] : undefined;
          if (!isUsableResetTime(factResetsAt)) {
            throw new UsageResetPendingError(
              `the earlier execution record ${named} under the execution root recorded, at usageStop.facts[${position}], the ${kind} fact ${asRecorded(fact['fact'])} with resetsAt ${asRecorded(factResetsAt)}, which is not a usable reset time (a safe integer of epoch seconds greater than 0), so an operator must review it before any new subscription execution starts`,
              null,
              recordedBy,
            );
          }
          // The aggregate cannot shorten the hold: a fact's later reset holds instead.
          if (holds === null || factResetsAt > holds.resetsAt) holds = { resetsAt: factResetsAt, source: `usageStop.facts[${position}].resetsAt` };
        }
        if (holds !== null && (latest === null || holds.resetsAt > latest.resetsAt)) latest = { ...holds, recordedBy };
      }
    }
  }
  if (latest !== null && startedAt.getTime() < latest.resetsAt * 1000) {
    throw new UsageResetPendingError(
      `the execution ${latest.recordedBy} under the execution root stopped for included usage until ${isoOfSeconds(latest.resetsAt)} (${latest.source} ${latest.resetsAt}, epoch seconds), the latest any earlier execution recorded, and this one would start at ${startedAt.toISOString()}, before it`,
      latest.resetsAt,
      latest.recordedBy,
    );
  }
}

/**
 * How far `runSubscriptionCommand` got, which only it can say (Task 5c, a
 * parent decision P-5c-6). The trust block's schema tier is read off it,
 * because an exit code and lines do not tell a role output refused at its
 * seam from a world refused before any role ran, nor a record the writer
 * refused as invalid from one the filesystem refused after it assembled
 * valid.
 *
 * ```text
 * world_refused        readWorld or readRegistryOrFail threw, and outcomeFor mapped the error
 * role_output_refused  a RoleOutputError at a role's seam
 * result_invalid       writeVerificationResult returned invalid
 * write_failed         it returned write_failed: the record had assembled valid
 * written              it returned written
 * ```
 */
export type SubscriptionCommandStage = 'world_refused' | 'role_output_refused' | 'result_invalid' | 'write_failed' | 'written';

/** What `runSubscriptionCommand` returns (Task 5c, a parent decision P-5c-6). */
export interface SubscriptionCommand {
  /** The command's own account, word for word as before: what the harness files as `exitCode` and `lines`. */
  outcome: CliOutcome;
  stage: SubscriptionCommandStage;
  /** The world the run was read over; `null` only for `world_refused`. */
  world: CurrentWorld | null;
  /** The writer's `written` outcome, its validated record included, for stage `written`; `null` otherwise. */
  written: Extract<ResultWriteOutcome, { status: 'written' }> | null;
}

/**
 * The method each of D-9's tiers is filed under, stated once (Task 5c, a
 * parent decision P-5c-5): the trust spec's method column, with "lower-cased"
 * where it says "case-folded", because the comparison is
 * `normalizeWhitespace` then `toLowerCase`, which is not Unicode case
 * folding. None says "verified", the status only signing confers (a parent
 * decision P-5c-4). Not exported, so no test can compute its expectations
 * from it (Task 5c review repair R6): the tests type every method again.
 */
const TRUST_METHODS = Object.freeze({
  execution: 'the harness\'s own account: the gate, the launches, the drain, cleanup confirmation and usage stops',
  schemaValidity: 'role outputs parsed at their seams (RoleOutputError otherwise), then assembleVerificationResult (structure, cross-field consistency, pins, gap identity, version registry)',
  evidenceValidity: 'checkResultEvidence: every evidence set from evidenceSetsOf, judged by the signing gate\'s own checkEvidenceSet against the corpus the run authorised; quotes and absence terms compared whitespace-collapsed and lower-cased, not byte-exact; edges looked up across the loaded corpus index, not only the entitled closure; whether evidence supports its proposition is not assessed',
  substantiveCorrectness: 'none at capture time',
});

/** `execution.json.trust` on `@2` (plan 2026-09-25, D-9): four tiers, each a status and the method behind it. */
export interface TrustBlock {
  execution: { status: 'completed' | 'failed'; method: string; error: string | null };
  schemaValidity: { status: 'valid' | 'invalid' | 'unassessed'; method: string };
  evidenceValidity: { status: 'passed' | 'failed' | 'withheld' | 'unassessed'; method: string; sets: EvidenceSetValidity[] | null };
  substantiveCorrectness: { status: 'unassessed'; method: string };
}

/** What `trustOf` is handed: values only, as the harness holds them once every withhold decision is made. */
export interface TrustInputs {
  /** The final `execution.json.error`'s name, or `null` when the execution completed. */
  error: string | null;
  /** How far `runSubscriptionCommand` got, or `null` when it was never reached or threw. */
  stage: SubscriptionCommandStage | null;
  /** The validated record the writer wrote, or `null`. */
  result: VerificationResult | null;
  /** The corpus the run authorised (`world.corpus`), or `null`. */
  corpus: LoadedCorpus | null;
  /** The final `resultWithheld`: a withhold rule fired, or a result the pipeline wrote was deleted. */
  resultWithheld: boolean;
  /** The harness rule, if any, that withheld the run's outputs. */
  withheldBy: string | null;
}

/**
 * D-9's four tiers (Task 5c). Without them, "the run completed" and "the
 * result was written" would be all a capture says about itself, and writing
 * a result proves nothing about whether its quotes exist. Pure — handed
 * values, with no filesystem, clock or environment — so each rule is shown
 * to decide alone, over inputs the harness never produces.
 *
 * - **Execution:** `completed` exactly when there is no error, whose name is
 *   carried verbatim.
 * - **Schema validity:** the stage's. `valid` once the record assembled valid
 *   (`written`, and `write_failed`, whose record the filesystem refused after
 *   it was valid); `invalid` for a role output refused at its seam or a record
 *   the writer refused; `unassessed` for a refused world, and when
 *   `runSubscriptionCommand` was never reached or threw.
 * - **Evidence validity,** decided in this order. `withheld`, with no sets,
 *   when either withhold fact holds, `resultWithheld` or `withheldBy`,
 *   failing closed on either (a parent decision P-5c-3): a withheld run is
 *   never measured, so it is never `passed`. Otherwise `unassessed`, with no
 *   sets, unless the schema tier is `valid` and a written record and its
 *   corpus were handed (P-5c-2): `checkResultEvidence` does not validate the
 *   schema, and can say ok, or throw, over an invalid record. Otherwise
 *   `checkResultEvidence`: no evidence set at all is `unassessed` with
 *   `sets: []` — a halted, gap-bearing record, in which nothing failed,
 *   which is not evidence found — every set ok is `passed`, and anything
 *   else `failed`; for both, `sets` is every set it reports, passing ones
 *   included, in its order (P-5c-2).
 * - **Substantive correctness:** always `unassessed`.
 *
 * The measurement gates nothing: by the time it is taken, status, transcript
 * and result are decided. No status and no method says "verified"; that rule
 * binds the block's own vocabulary, and data carried verbatim — an error's
 * name, and a failed set's problems, which quote the record's own text: a
 * quote's first 80 characters; an absence term, a docId or an edgeId whole
 * — is not rewritten (a parent decision P-5c-4).
 */
export function trustOf(inputs: TrustInputs): TrustBlock {
  const schema: TrustBlock['schemaValidity']['status'] =
    inputs.stage === 'written' || inputs.stage === 'write_failed' ? 'valid'
    : inputs.stage === 'role_output_refused' || inputs.stage === 'result_invalid' ? 'invalid'
    : 'unassessed';
  return {
    execution: { status: inputs.error === null ? 'completed' : 'failed', method: TRUST_METHODS.execution, error: inputs.error },
    schemaValidity: { status: schema, method: TRUST_METHODS.schemaValidity },
    evidenceValidity: evidenceTierOf(inputs, schema),
    substantiveCorrectness: { status: 'unassessed', method: TRUST_METHODS.substantiveCorrectness },
  };
}

/** The evidence tier, in `trustOf`'s order (Task 5c, parent decisions P-5c-2 and P-5c-3). */
function evidenceTierOf(inputs: TrustInputs, schema: TrustBlock['schemaValidity']['status']): TrustBlock['evidenceValidity'] {
  const method = TRUST_METHODS.evidenceValidity;
  if (inputs.resultWithheld || inputs.withheldBy !== null) return { status: 'withheld', method, sets: null };
  if (schema !== 'valid' || inputs.result === null || inputs.corpus === null) return { status: 'unassessed', method, sets: null };
  const measured = checkResultEvidence(inputs.result, inputs.corpus);
  if (measured.sets.length === 0) return { status: 'unassessed', method, sets: [] };
  return { status: measured.ok ? 'passed' : 'failed', method, sets: measured.sets };
}

/**
 * `runRun` without `DEFAULT_ROLE_CONFIG`: the same production functions in
 * the same order, over the configuration it is handed — the one for the
 * adapter the runner speaks (`subscriptionRoleConfigFor`). See the header for
 * why this is composed here rather than reached through `dispatch`.
 *
 * It returns the outcome `runRun` would report, word for word, with how far
 * it got, the world it read and the record it wrote (Task 5c, a parent
 * decision P-5c-6): the trust block needs all three, and none can be read
 * back off the outcome. An error it throws today still propagates unchanged
 * — an unmapped world error, every projection refusal, the usage stops — and
 * the harness then has no stage. Exported so each stage is shown directly.
 */
export async function runSubscriptionCommand(
  packId: string,
  requirementId: string,
  paths: VerifyPaths,
  config: RoleConfig,
  runner: AgentRunner,
  record: (transcript: RunTranscript) => void,
): Promise<SubscriptionCommand> {
  let world: CurrentWorld;
  let registry: ReturnType<typeof readRegistryOrFail>;
  try {
    world = readWorld(paths, packId, requirementId);
    registry = readRegistryOrFail(paths, packId);
  } catch (error) {
    const mapped = outcomeFor(error);
    if (mapped !== null) return { outcome: mapped, stage: 'world_refused', world: null, written: null };
    throw error;
  }
  const closure = EntitledClosure.forSources(world.corpus, world.sourceRegister, world.pack, sourceIdsOf(world.requirement));
  let run;
  try {
    run = await runVerificationPipeline({
      packId,
      requirementId,
      requirement: world.requirement,
      renderContext: world.renderCtx,
      closure,
      corpus: world.corpus,
      prompts: loadPromptSet(),
      config,
      runner,
    });
  } catch (error) {
    if (error instanceof RoleOutputError) {
      return { outcome: { exitCode: EXIT_REFUSED, lines: ['REFUSED — a role output was refused at its own boundary.', `  - role_output: ${error.message}`, '  No verification result was written.'] }, stage: 'role_output_refused', world, written: null };
    }
    throw error;
  }
  record(run.transcript);
  const written = writeVerificationResult({
    run,
    requirement: world.requirement,
    registry,
    registers: {
      docIds: world.corpus.index.documents.map((document) => document.docId),
      sourceIds: world.pack.sources.map((source) => source.id),
    },
    destination: resultPath(paths, packId, requirementId),
  });
  if (written.status === 'invalid') {
    return { outcome: { exitCode: EXIT_REFUSED, lines: ['REFUSED — the run did not produce a verification result, so nothing was written.', ...written.error.message.split('\n').map((line) => `  - invalid_result: ${line.trim()}`)] }, stage: 'result_invalid', world, written: null };
  }
  if (written.status === 'write_failed') {
    return { outcome: { exitCode: EXIT_INTEGRITY_FAILURE, lines: [`INTEGRITY FAILURE — the record was valid and the filesystem refused it at the ${written.stage} stage.`, `  ${written.error.message}`] }, stage: 'write_failed', world, written: null };
  }
  return { outcome: { exitCode: EXIT_OK, lines: [`Wrote ${written.path}`, `  resultSha256 ${written.resultSha256}`, `  pipelineVersion ${written.result.pipelineVersion}`, `  gaps: ${written.result.gaps.length === 0 ? 'none' : written.result.gaps.length}`] }, stage: 'written', world, written };
}

async function captureSubscriptionRun(request: LiveCaptureRequest): Promise<LiveCaptureOutcome> {
  const sub = request.subscription ?? {};
  const config = subscriptionCaptureConfigFrom(request.env);
  assertLiveAgentsEnabled(request.env);
  // `@2` unless another adapter is handed in; `@1` or `@2` by identity, and
  // nothing else (plan 2026-09-25, D-1).
  const adapter = request.adapter ?? CLAUDE_CODE_CLI_V2_ADAPTER;
  const version = subscriptionVersionOf(adapter);
  // D-6's usage facts, the in-flight stops and the backstop hold `@2` only:
  // `@1`'s 2.1.226 streams report no fast-mode state and would trip the rules
  // on every launch (Task 5b, a parent decision P-5b-8).
  const includedUsage = version === '2';
  // D-9's trust block is `@2`'s alone (Task 5c, a parent decision P-5c-1):
  // `null` while the run is running, the four tiers once it has finished;
  // `@1` files no such key in either summary.
  const trustTiers = version === '2';
  // D-1: `@1` never spawns the real executable. Without an injected launch
  // this execution would, so it is refused here, before anything exists.
  if (version === '1' && sub.launch === undefined) {
    throw new SubscriptionRouteMismatchError(`${SUBSCRIPTION_V1_KEY} was handed in without an injected launch, so its execution would spawn the real executable; ${SUBSCRIPTION_V1_KEY} has none of ${SUBSCRIPTION_V2_KEY}'s included-usage, fast-mode or exact-model protections and runs over an injected launch only`);
  }
  if (request.transport !== undefined) throw new SubscriptionRouteMismatchError('an HTTP transport was handed in; the process transport is constructed here and only its launch function is injectable');
  const profile = subscriptionProfileFor(adapter);
  const roleConfig = subscriptionRoleConfigFor(adapter);
  // D-5: `@2`'s launch budget is at most the run's own role launches, from
  // the configuration. After the route, adapter, D-1 and transport refusals,
  // and before anything is created. `@1`, which runs over injected launches
  // only, is not capped.
  if (version === '2' && config.budget.maxRunAttempts > maxRoleLaunchesFor(roleConfig)) {
    throw new SubscriptionBudgetError(SUBSCRIPTION_V2_KEY, config.budget.maxRunAttempts, maxRoleLaunchesFor(roleConfig), roleConfig.prosecutorCount);
  }
  // The inherited variables, from the handed environment unless injected —
  // checked before any directory exists, like every other gate.
  let inheritedEnv: InheritedEnv;
  if (sub.inheritedEnv !== undefined) inheritedEnv = { ...sub.inheritedEnv };
  else {
    const missing = SUBSCRIPTION_INHERITED_ENV_NAMES.filter((name) => request.env[name] === undefined || request.env[name] === '');
    if (missing.length > 0) throw new SubscriptionCaptureConfigError(missing);
    inheritedEnv = { HOME: request.env['HOME']!, USER: request.env['USER']!, PATH: request.env['PATH']! };
  }
  const executable: ExecutablePin = sub.executable ?? subscriptionExecutableFor(adapter, inheritedEnv.HOME);
  const fixtureRoot = resolve(request.fixtureRoot ?? DEFAULT_FIXTURE_ROOT);
  if (contains(fixtureRoot, request.executionRoot) || contains(request.executionRoot, fixtureRoot)) {
    throw new ExecutionRootError(resolve(request.executionRoot), fixtureRoot);
  }
  if (request.deadlineMs !== undefined) assertSupportedLifetime(request.deadlineMs);
  // An injected time bound is held to the timer range as the deadline is,
  // before anything exists (Task 5a review repair R10).
  assertSupportedTimeout('launchTimeoutMs', sub.launchTimeoutMs);
  assertSupportedTimeout('gateTimeoutMs', sub.gateTimeoutMs);

  // The time bounds, from the profile unless a test injects one (D-2, D-5).
  // `@1`'s profile sets neither: its launches keep the runner's default and
  // its gate has no timer of its own, exactly as before.
  const launchTimeoutMs = sub.launchTimeoutMs ?? profile.launchTimeoutMs;
  const gateTimeoutMs = sub.gateTimeoutMs ?? profile.gateTimeoutMs;
  const budgetsInjected = sub.launchTimeoutMs !== undefined || sub.gateTimeoutMs !== undefined;
  const budgets = {
    launchTimeoutMs: launchTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    gateTimeoutMs,
    lifetimeMs: launchTimeoutMs === null || gateTimeoutMs === null ? null : subscriptionLifetimeMs(config.budget, { launchTimeoutMs, gateTimeoutMs }),
    injected: budgetsInjected,
  };
  // What the profile asks each launch for. `@1`'s profile states no
  // `--settings`, so its launches carry the transport's default, named as
  // such rather than read off a profile field that is `null`.
  const requested = {
    pin: { version: profile.pin.version, sha256: profile.pin.sha256, sizeBytes: profile.pin.sizeBytes },
    permittedModels: [...profile.permittedModels],
    effort: profile.effort,
    maxOutputTokens: profile.maxOutputTokens,
    settings: profile.settings ?? DEFAULT_LAUNCH_SETTINGS,
    settingsFrom: profile.settings === null ? 'transport default' : 'profile',
  };
  const unobserved = version === '1' ? SUBSCRIPTION_UNOBSERVED : SUBSCRIPTION_V2_UNOBSERVED;

  const now = request.now ?? (() => new Date());
  const startedAt = now();
  const executionId = request.executionId ?? `${stamp(startedAt)}-${randomBytes(3).toString('hex')}`;
  // D-6: no execution, on either adapter, starts before the latest reset an
  // earlier one under this root recorded. After every other refusal, at the
  // instant it would start, and before anything exists (Task 5b, a parent
  // decision P-5b-7).
  assertNoResetPending(request.executionRoot, startedAt);
  const { executionDir, verificationDir } = prepareExecutionDir(request, executionId);
  const attemptsPath = join(executionDir, 'attempts.jsonl');
  const launchesPath = join(executionDir, 'launches.jsonl');
  const streamsDir = join(executionDir, 'streams');
  const summaryPath = join(executionDir, 'execution.json');
  const synthetic = sub.launch !== undefined || sub.executable !== undefined || budgetsInjected;
  const literals: SensitiveLiteral[] = [
    { name: 'HOME', value: inheritedEnv.HOME },
    { name: 'USER', value: inheritedEnv.USER },
  ];

  const launchLines: LaunchLine[] = [];
  const interrupts: InterruptRecord[] = [];
  let interruptedBy: InterruptRecord['signal'] | null = null;
  let gate: GateResult | null = null;
  let drainedAt: string | null = null;
  /** The harness rule, if any, that withheld the run's outputs. */
  let withheldBy: 'SensitiveOutputWithheldError' | 'TerminationUnconfirmed' | typeof INCLUDED_USAGE_UNCONFIRMED | null = null;

  const writeSummary = (fields: Record<string, unknown>): void => {
    const summary = {
      packId: request.packId,
      requirementId: request.requirementId,
      executionId,
      route: 'subscription',
      attemptUnit: 'cli_launch',
      adapter: `${adapter.identity.id}@${adapter.identity.version}`,
      transport: sub.launch === undefined ? 'spawn' : 'injected-launch',
      synthetic,
      // The executable actually launched; `requested.pin` is what the profile pins.
      pin: { version: profile.pin.version, sha256: executable.sha256, sizeBytes: executable.sizeBytes, injected: sub.executable !== undefined },
      requested,
      budget: config.budget,
      budgets,
      deadlineMs: request.deadlineMs ?? null,
      startedAt: startedAt.toISOString(),
      unobserved,
      measured: SUBSCRIPTION_MEASURED,
      gate,
      interrupts,
      interruptedBy,
      launchesPath: 'launches.jsonl',
      streamsDir: 'streams',
      ...fields,
    };
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  };
  // `@2`'s usage stop is on file from the start, as none so far, and so is its
  // trust block, as none yet (Task 5c, a parent decision P-5c-1); `@1` files
  // neither key.
  writeSummary({ status: 'running', runId: null, finishedAt: null, drainedAt: null, httpAttempts: null, launches: 0, gateLaunches: 0, unsentEvents: 0, recordsWritten: 0, cancelled: false, cancellationReason: null, terminationUnconfirmed: false, resultWithheld: false, cliObserved: null, ledger: null, exitCode: null, lines: [], error: null, ...(includedUsage ? { usageStop: null } : {}), ...(trustTiers ? { trust: null } : {}) });

  let unsentEvents = 0;
  let recordsWritten = 0;
  const observe = (record: AttemptRecord): void => {
    appendFileSync(attemptsPath, `${JSON.stringify({ at: now().toISOString(), ...record })}\n`, 'utf8');
    recordsWritten += 1;
    if (!record.sent) unsentEvents += 1;
  };
  writeFileSync(attemptsPath, '', 'utf8');
  writeFileSync(launchesPath, '', 'utf8');
  mkdirSync(streamsDir);

  // Evidence of every launch. Anything thrown here reaches the transport,
  // which raises EvidenceObservationFailedError and halts the runner: an
  // execution whose account cannot be written must not go on launching.
  const onLaunch = (record: LaunchRecord, stdout: string): void => {
    const seq = launchLines.length + 1;
    const { kind, role, index, argv, envNames, streamsClosed, ...facts } = record;
    const parsed = parseStreamLines(stdout);
    const sanitised = sanitiseStream(parsed, literals);
    // Filed, and read by every usage rule, redacted by key and by value under the literals the leak check below
    // holds the line to (Task 5b review repairs R15 and N3, a parent decision P-5b-11, extended).
    const observed = kind === 'role' ? redactObservation(observeStream(parsed), literals) : null;
    const name = kind === 'gate' ? `gate-launch${seq}` : `role-${role}[${index}]-launch${seq}`;
    const streamFile = `${name}.sanitised.jsonl`;
    const line: LaunchLine = {
      at: now().toISOString(),
      seq,
      kind,
      role,
      index,
      argv: [...argv],
      envNames: [...envNames],
      facts,
      streamsClosed,
      stream: sanitised.omitted === null ? join('streams', streamFile) : null,
      streamOmitted: sanitised.omitted,
      observed,
    };
    // The record itself must carry no inherited value: the argv holds the
    // prompt path's placeholder, never the path, and nothing here should
    // hold HOME or USER. Fail closed if it would.
    const serialised = JSON.stringify(line);
    const leak = sensitivityOf(serialised, literals);
    if (leak !== null) throw new Error(`the launch record for ${name} would carry an ${leak}; not filed`);
    if (sanitised.omitted === null) writeFileSync(join(streamsDir, streamFile), sanitised.lines.map((l) => `${l}\n`).join(''), 'utf8');
    appendFileSync(launchesPath, `${serialised}\n`, 'utf8');
    launchLines.push(line);
    // The line is on record — facts, and the reason by path and kind — and
    // now the execution fails closed: a model output that cannot be filed is
    // not handed on to the role, the transcript or the result.
    if (sanitised.omitted !== null) {
      withheldBy = 'SensitiveOutputWithheldError';
      throw new SensitiveOutputWithheldError(seq, name, sanitised.omitted, facts);
    }
  };

  // Built from the profile (D-2): its controls and its gate's rules, and its
  // `--settings` text where it states one, which the transport then holds
  // every role launch's description to.
  const transport = createSpawnTransport({
    executable,
    inheritedEnv,
    controls: profile.controls,
    gate: profile.gate,
    ...(profile.settings === null ? {} : { settings: profile.settings }),
    onLaunch,
    ...(sub.launch === undefined ? {} : { launch: sub.launch }),
    ...(sub.tempRoot === undefined ? {} : { tempRoot: sub.tempRoot }),
    ...(sub.termGraceMs === undefined ? {} : { termGraceMs: sub.termGraceMs }),
    ...(sub.killGraceMs === undefined ? {} : { killGraceMs: sub.killGraceMs }),
  });

  const lifetime = new AbortController();
  const deadline = request.deadlineMs === undefined ? null : setTimeout(() => lifetime.abort(`deadline of ${request.deadlineMs} ms`), request.deadlineMs);

  const inner = createLiveAgentRunner({
    endpoint: CLI_LAUNCH_URL,
    apiKey: '',
    adapter,
    transport,
    budget: config.budget,
    observe,
    signal: lifetime.signal,
    maxAttempts: 1,
    // The profile's launch timeout, or an injected one (D-5). Where neither
    // exists (`@1`) none is passed, and the runner's own default applies.
    ...(launchTimeoutMs === null ? {} : { timeoutMs: launchTimeoutMs }),
  }) as LiveAgentRunner;
  // The first failure ends the execution: the lifetime is aborted before the
  // rejection propagates, so nothing later is sent and any child still
  // tracked is ended by the transport. The invocation is forwarded, so
  // orchestration compares the one the adapter declares with the
  // configuration's (D-3). For `@2`, a launch the projection accepted is
  // read again for the two usage facts no projection rule covers, and either
  // stops the run in the same way, under its own reason (Task 5b, a parent
  // decision P-5b-6); the attempt stays booked as the runner booked it.
  const runner: AgentRunner = {
    kind: inner.kind,
    adapter: inner.adapter,
    invocation: inner.invocation,
    async run(roleRequest) {
      let response: Awaited<ReturnType<AgentRunner['run']>>;
      try {
        response = await inner.run(roleRequest);
      } catch (thrown) {
        if (!lifetime.signal.aborted) lifetime.abort(`role_failed:${roleRequest.role}[${roleRequest.index}]`);
        throw thrown;
      }
      if (includedUsage) {
        const facts = usageViolations(launchLines);
        if (facts.some((fact) => IN_FLIGHT_STOP_KINDS.has(fact.kind))) {
          const roleLines = launchLines.filter((line) => line.kind === 'role');
          if (!lifetime.signal.aborted) lifetime.abort(`usage_stop:${roleRequest.role}[${roleRequest.index}]`);
          throw new UsageStopError(usageStopOf(facts)!, { seq: roleLines[roleLines.length - 1]?.seq ?? null, role: roleRequest.role, index: roleRequest.index });
        }
      }
      return response;
    },
  };

  const interruptSource: EventEmitter = sub.interrupts ?? process;
  const onInterrupt = (signal: InterruptRecord['signal']) => (): void => {
    if (interrupts.length === 0) {
      interruptedBy = signal;
      interrupts.push({ signal, at: now().toISOString(), action: 'abort' });
      lifetime.abort(`operator:${signal}`);
      return;
    }
    interrupts.push({ signal, at: now().toISOString(), action: 'escalate' });
    transport.escalate();
  };
  const onSigint = onInterrupt('SIGINT');
  const onSigterm = onInterrupt('SIGTERM');
  interruptSource.on('SIGINT', onSigint);
  interruptSource.on('SIGTERM', onSigterm);

  // The gate, under its own controller where it has a timeout (D-5): the
  // controller follows the lifetime, so a deadline or an operator's
  // interrupt ends the gate as it always did and is accounted as it always
  // was; and when the gate's own timer fires first, the lifetime is aborted
  // for `gate_timeout`, the gate child, if one is running, is ended (its
  // launch line still filed, since the transport reports a launch before it
  // throws for an abort), and the transport's abort is filed as
  // `GateTimeout` with no role dispatched — as is a timer that fires before
  // the child is launched or after it has answered, each in its own words
  // (Task 5a review repair N2). Without a gate timeout (`@1`) the gate runs
  // under the lifetime alone, exactly as before.
  const runGateUnderItsTimeout = async (): Promise<GateResult> => {
    if (gateTimeoutMs === null) return transport.runGate(lifetime.signal);
    const gateController = new AbortController();
    const follow = (): void => gateController.abort(lifetime.signal.reason);
    if (lifetime.signal.aborted) follow();
    else lifetime.signal.addEventListener('abort', follow, { once: true });
    // A lifetime already ended — by a deadline or an operator — has already
    // ended the gate through `follow`, and aborting either controller again
    // changes neither's reason, so it keeps its own account: nothing needs to
    // be asked first (Task 5a review repair R3 removed a guard and a flag
    // that no outcome could observe once the error was decided by reason).
    const onGateTimeout = (): void => {
      gateController.abort(GATE_TIMEOUT_REASON);
      lifetime.abort(GATE_TIMEOUT_REASON);
    };
    const gateTimer = setTimeout(onGateTimeout, gateTimeoutMs);
    try {
      return await transport.runGate(gateController.signal);
    } finally {
      clearTimeout(gateTimer);
      lifetime.signal.removeEventListener('abort', follow);
    }
  };

  const handed: { transcript: RunTranscript | null } = { transcript: null };
  let exitCode: number | null = null;
  let lines: string[] = [];
  let error: { name: string; message: string } | null = null;
  // Which call an error came from: `GateTimeout` is decided for the gate
  // call alone (`subscriptionErrorOf`, Task 5a review repair R3).
  let phase: SubscriptionPhase = 'gate';
  // What `runSubscriptionCommand` returned — its stage, world and written
  // record, for the trust block — or `null` when it was never reached or
  // threw (Task 5c, a parent decision P-5c-6).
  let command: SubscriptionCommand | null = null;
  try {
    gate = await runGateUnderItsTimeout();
    // The timer may have fired after the child answered but before the
    // verdict was read: the lifetime is already over, and nothing is
    // dispatched (`gateVerdictErrorOf`, Task 5a review repair N1).
    const lateVerdict = gateVerdictErrorOf(lifetime.signal.reason, gateTimeoutMs);
    if (lateVerdict !== null) {
      error = lateVerdict;
    } else if (!gate.pass) {
      error = { name: GATE_REFUSED_ERROR_NAME, message: `the authentication gate refused the execution before any role was dispatched: ${gate.reasons.join('; ')}` };
    } else {
      // Kept though no outcome through this function can observe it (Task 5a
      // review repair N4): the gate's timer is cleared before any role is
      // dispatched, so the lifetime is never aborted for `gate_timeout` once
      // roles run, and a role's error reaches the catch below in the runner's
      // own classes (an aborted launch as `ExecutionCancelledError`), never as
      // the transport's abort. It is defence in depth for a runner that
      // rethrew the transport's abort unchanged, and is shown only directly,
      // in `subscriptionErrorOf`'s phase row.
      phase = 'roles';
      command = await runSubscriptionCommand(request.packId, request.requirementId, { ...request.paths, verificationDir }, roleConfig, runner, (transcript) => {
        handed.transcript = transcript;
      });
      const outcome = command.outcome;
      exitCode = outcome.exitCode;
      lines = outcome.lines;
      if (outcome.exitCode !== EXIT_OK) {
        error = { name: 'RunRefused', message: `the run did not complete (exit ${outcome.exitCode}): ${lines.join(' | ')}` };
      } else if (handed.transcript === null) {
        error = { name: 'NoRecording', message: `the run exited ${outcome.exitCode} but orchestration handed over no transcript` };
      }
    }
  } catch (thrown) {
    // An aborted gate throws the transport's `ProcessTransportError`; one the
    // gate's own timer aborted is a gate timeout, and is filed as that.
    // Anything else keeps its own name, saying so if the timer had fired.
    error = subscriptionErrorOf(thrown, phase, lifetime.signal.reason, gateTimeoutMs);
  } finally {
    if (deadline !== null) clearTimeout(deadline);
    interruptSource.off('SIGINT', onSigint);
    interruptSource.off('SIGTERM', onSigterm);
  }

  // Every tracked child, reaped or given up on, before the final status is
  // written: an account that says "failed" while a child still runs would be
  // an account of a different state than the machine is in.
  await transport.drain();
  drainedAt = now().toISOString();
  const cancelled = lifetime.signal.aborted;
  // Every launch whose cleanup was not confirmed, with the facts that say so:
  // a termination whose child was not seen reaped or whose group was not
  // seen gone, or a role launch whose pipes were still held when it was
  // given up on. Such an execution has a child, or a holder of its output,
  // that this harness could not account for, and its transcript is not
  // published as a completed one.
  const unconfirmed = unconfirmedLaunches(launchLines);
  const terminationUnconfirmed = unconfirmed.length > 0;
  if (error === null && terminationUnconfirmed) {
    withheldBy = 'TerminationUnconfirmed';
    error = { name: 'TerminationUnconfirmed', message: `the run completed but its cleanup was not confirmed, so nothing it produced is published: ${unconfirmed.join('; ')}` };
  }
  // D-6's facts over every launch line of a `@2` execution, completed or
  // failed, independently of the error's name. The backstop: a run the
  // projection let through, still completed here, with any fact is not
  // published — failed under its own name, its result deleted below, as the
  // TerminationUnconfirmed rule's is.
  const usageFacts = includedUsage ? usageViolations(launchLines) : null;
  if (usageFacts !== null && error === null && usageFacts.length > 0) {
    withheldBy = INCLUDED_USAGE_UNCONFIRMED;
    error = { name: INCLUDED_USAGE_UNCONFIRMED, message: `the run completed but its launches report included usage this route does not accept, so nothing it produced is published: ${describeUsageFacts(usageFacts)}` };
  }

  const transcript: RunTranscript | null = error === null ? handed.transcript : null;
  let transcriptPath: string | null = null;
  if (transcript !== null) transcriptPath = writeRunTranscript(join(executionDir, 'transcript'), transcript);
  const resultCandidate = join(verificationDir, request.packId, request.requirementId, 'verification-result.json');
  // A result the pipeline wrote for an execution that is not completed is
  // deleted: a dossier under a failed execution would be evidence of a run
  // this harness has refused to vouch for.
  let resultWithheld = withheldBy !== null;
  if (transcript === null && existsSync(resultCandidate)) {
    rmSync(resultCandidate);
    resultWithheld = true;
  }
  // D-9's four tiers, for `@2` (Task 5c, a parent decision P-5c-1), taken
  // here and nowhere earlier: after the TerminationUnconfirmed rule, the
  // usage backstop and the deletion above, so `resultWithheld` and
  // `withheldBy` are final and a withheld run's evidence tier is `withheld`,
  // never `passed`. From what `runSubscriptionCommand` returned, each `null`
  // when it was never reached or threw. Nothing below reads it but the
  // summary: the measurement gates no status, transcript or result.
  const trust = trustTiers
    ? trustOf({ error: error?.name ?? null, stage: command?.stage ?? null, result: command?.written?.result ?? null, corpus: command?.world?.corpus ?? null, resultWithheld, withheldBy })
    : null;
  const resultPathOut = transcript !== null && existsSync(resultCandidate) ? resultCandidate : null;
  const status: LiveCaptureOutcome['status'] = transcript !== null ? 'completed' : 'failed';
  const ledger = inner.ledger;
  const roleLines = launchLines.filter((line) => line.kind === 'role');
  const cliObserved = {
    requestIds: roleLines.flatMap((line) => line.observed?.requestIds ?? []),
    numTurns: roleLines.map((line) => line.observed?.numTurns ?? null),
    thinkingTokens: roleLines.map((line) => line.observed?.thinkingTokens ?? null),
    rateLimitEvents: roleLines.reduce((sum, line) => sum + (line.observed?.rateLimitEvents ?? 0), 0),
    reportedUsage: roleLines.map((line) => ({ role: line.role, index: line.index, seq: line.seq, usage: line.observed?.reportedUsage ?? null })),
  };
  const launches = ledger.launchesStarted;
  const gateLaunches = launchLines.filter((line) => line.kind === 'gate').length;
  const cancellationReason = cancelled ? String(lifetime.signal.reason) : null;
  writeSummary({
    status,
    runId: transcript?.runId ?? null,
    finishedAt: now().toISOString(),
    drainedAt,
    httpAttempts: null,
    launches,
    gateLaunches,
    unsentEvents,
    recordsWritten,
    cancelled,
    cancellationReason,
    terminationUnconfirmed,
    resultWithheld,
    cliObserved,
    ledger,
    exitCode,
    lines,
    error,
    transcriptPath,
    resultPath: resultPathOut,
    ...(usageFacts === null ? {} : { usageStop: usageStopOf(usageFacts) }),
    ...(trustTiers ? { trust } : {}),
  });

  return {
    status,
    route: 'subscription',
    executionId,
    executionDir,
    runId: transcript?.runId ?? null,
    transcriptPath,
    resultPath: resultPathOut,
    attemptsPath,
    summaryPath,
    launchesPath,
    streamsDir,
    httpAttempts: null,
    launches,
    gateLaunches,
    unsentEvents,
    recordsWritten,
    cancelled,
    cancellationReason,
    gate,
    interrupts,
    interruptedBy,
    terminationUnconfirmed,
    resultWithheld,
    ledger,
    error,
    exitCode,
    lines,
  };
}

// ---------------------------------------------------------------------------
// The first live case, on either route
// ---------------------------------------------------------------------------

export interface FirstLiveCaseOptions {
  /** The environment the gates, the route and the budget are read from. */
  env: NodeJS.ProcessEnv;
  /** Where the execution is filed. The agents suite passes `LIVE_EXECUTION_ROOT` under the engine root. */
  executionRoot: string;
  /** Injected by offline tests only, HTTP route. A genuine execution supplies none; the subscription route refuses one. */
  transport?: ProviderTransport;
  /** Injected by offline tests only, subscription route. A genuine execution supplies none, and launches the pinned CLI. */
  subscription?: SubscriptionCaptureOptions;
  now?: () => Date;
  /** Defaults to the lifetime of the stated budget on the route the environment selects: `executionLifetimeMs` on HTTP, `subscriptionLifetimeMs` on the subscription route. */
  deadlineMs?: number;
}

/** The world the first live case runs over: the real pack, corpus and registry. */
function firstLiveCasePaths(): VerifyPaths {
  return {
    packDir: join(engineRoot, 'knowledge', FIRST_LIVE_CASE.packId),
    corpusDir: join(engineRoot, 'corpus'),
    verificationDir: join(engineRoot, 'verification'),
  };
}

/**
 * The first live case, exactly as the agents suite runs it — the same
 * function, so what the offline tests prove over an injected transport is
 * the route the authorised run takes: the accepted adapter, the real pack and
 * corpus, the real requirement-versions registry, and a lifetime derived from
 * the stated budget. Every gate is checked by `captureLiveRun` before anything
 * is constructed or written.
 */
export async function runFirstLiveCase(options: FirstLiveCaseOptions): Promise<LiveCaptureOutcome> {
  // The route is the environment's, never stated here: the adapter and the
  // budget follow it, and `captureLiveRun` derives the same answer again.
  const route = captureRouteFor(options.env);
  const budget = route === 'http' ? liveCaptureConfigFrom(options.env).budget : subscriptionCaptureConfigFrom(options.env).budget;
  const deadlineMs = options.deadlineMs ?? (route === 'http' ? executionLifetimeMs(budget) : subscriptionLifetimeMs(budget));
  return captureLiveRun({
    packId: FIRST_LIVE_CASE.packId,
    requirementId: FIRST_LIVE_CASE.requirementId,
    paths: firstLiveCasePaths(),
    executionRoot: options.executionRoot,
    env: options.env,
    // The subscription route runs `@2`: `@1` would spawn the real executable
    // here, which D-1 refuses.
    adapter: route === 'http' ? ANTHROPIC_MESSAGES_ADAPTER : CLAUDE_CODE_CLI_V2_ADAPTER,
    deadlineMs,
    ...(options.transport === undefined ? {} : { transport: options.transport }),
    ...(options.subscription === undefined ? {} : { subscription: options.subscription }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

export type FirstSubscriptionCaseOptions = Omit<FirstLiveCaseOptions, 'transport'>;

/**
 * The first live case, on the condition that the environment selects the
 * subscription route: the same function as `runFirstLiveCase`, refused by
 * name when `DATASTRATA_SUBSCRIPTION_CAPTURE=1` is absent, because a
 * subscription run authenticates as the operator and the caller asked for
 * that route specifically.
 */
export async function runFirstSubscriptionCase(options: FirstSubscriptionCaseOptions): Promise<LiveCaptureOutcome> {
  if (!subscriptionCaptureSelected(options.env)) throw new CaptureRouteConflictError(`the subscription case was asked for without ${SUBSCRIPTION_CAPTURE_ENV}=${SUBSCRIPTION_CAPTURE_TOKEN}`);
  return runFirstLiveCase(options);
}
