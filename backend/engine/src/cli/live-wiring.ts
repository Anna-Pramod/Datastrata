/**
 * The production wiring of the live capability — what the verify entry point
 * hands orchestration, decided from the environment (B-ADAPTER).
 *
 * Until this module the process edge handed orchestration no runner at all,
 * and every `verify run` refused by name. The live runner, the adapter seam,
 * the registry and the recording path all existed; what did not exist was a
 * concrete adapter and the decision of when to construct a live runner. Both
 * live here, and nowhere else.
 *
 * **Five prerequisites, none implying another.**
 *
 * ```text
 * DATASTRATA_VERIFICATION_AGENTS=1   the capability token — an act, not a state
 * DATASTRATA_AGENT_ENDPOINT          the endpoint, named explicitly
 * DATASTRATA_AGENT_API_KEY           the credential
 * DATASTRATA_AGENT_MAX_ATTEMPTS      the run's HTTP attempt budget, retries included
 * DATASTRATA_AGENT_MAX_INPUT_BYTES   the largest request body admitted per attempt
 * ```
 *
 * Without the token there is no runner, whatever credential and endpoint the
 * environment carries: an API key sitting in a developer's shell is not
 * permission to spend, and an ordinary `verify run` then refuses by name with
 * nothing contacted. With the token, a missing endpoint, credential or budget
 * variable is a refusal naming the variable, and so is a configured adapter
 * identity no registered adapter answers to. The endpoint is named rather
 * than defaulted so that no host is contacted unless somebody typed it, and
 * the budget is stated rather than defaulted because a live run whose
 * operator has not said how many attempts it may make has not been
 * authorised. Both budget figures are exact on what they measure — attempts
 * and bytes — and neither is a token count or a sum of money.
 *
 * **What the offline guarantee actually is.** The live runner is imported here
 * and by the tests that exercise this wiring; an import is not a request. The
 * only path to the network is the runner's default transport, and every
 * offline test either injects a fake transport or installs the suite's
 * network trap, so an inherited token and credential can reach the trap and
 * nothing beyond it. That is the property `live-wiring.test.ts` proves, in
 * both directions.
 *
 * **The registry is built here, once.** Registering an adapter is a
 * declaration of which semantics may run under which identity, and
 * `RoleConfig.providerAdapter` selects among them; a run whose configured
 * identity has no implementation is refused rather than defaulted.
 *
 * **The subscription route is registered and refused (B-CLI-ADAPTER).**
 * `claude-code-cli@1` and `claude-code-cli@2` reach Claude through a pinned
 * Claude Code CLI on a subscription. Both are in the registry because the
 * capture harness resolves them from here, and both are refused here by
 * name — before any prerequisite variable is read — because an ordinary
 * `verify run` is not the place either may run: only the capture harness's
 * subscription path (`test/live-capture.ts`) constructs their runners,
 * behind an execution-scoped authentication gate. The refusal matches the
 * identity's id, not its version (Opus 5.5 migration, Task 5a), so a later
 * version of the CLI adapter is refused the day it is registered rather
 * than the day someone remembers this function. A configured identity is a
 * fact about the run, not about the environment, so the refusal consults
 * nothing in `env`.
 *
 * This module reads the environment, which is why it lives under `src/cli/`.
 */

import type { RunCapabilities } from './run';
import { ANTHROPIC_MESSAGES_ADAPTER } from '../pipeline/anthropic-messages';
import { CLAUDE_CODE_CLI_ADAPTER, CLAUDE_CODE_CLI_IDENTITY, CLAUDE_CODE_CLI_V2_ADAPTER } from '../pipeline/claude-code-cli';
import type { RoleConfig } from '../pipeline/config';
import {
  AgentCapabilityError,
  createLiveAgentRunner,
  liveAgentsEnabled,
  MissingProviderAdapterError,
  type AttemptObserver,
  type ProviderTransport,
  type RunBudget,
} from '../pipeline/live-runner';
import {
  isProviderAdapterSelected,
  ProviderAdapterNotSelectedError,
  providerAdapterKey,
  registerProviderAdapter,
  resolveProviderAdapter,
  UnknownProviderAdapterError,
  type ProviderAdapterIdentity,
  type ProviderAdapterRegistry,
} from '../pipeline/provider-adapter';

export const LIVE_ENDPOINT_ENV = 'DATASTRATA_AGENT_ENDPOINT';
export const LIVE_API_KEY_ENV = 'DATASTRATA_AGENT_API_KEY';
export const LIVE_MAX_ATTEMPTS_ENV = 'DATASTRATA_AGENT_MAX_ATTEMPTS';
export const LIVE_MAX_INPUT_BYTES_ENV = 'DATASTRATA_AGENT_MAX_INPUT_BYTES';

/**
 * Every adapter production may resolve, keyed by identity. Three: the HTTP
 * adapter, which `verify run` may execute, and the two subscription-route
 * adapters, `claude-code-cli@1` and `@2`, which it may not
 * (`SubscriptionRouteCaptureOnlyError`).
 */
export const PRODUCTION_ADAPTERS: ProviderAdapterRegistry = registerProviderAdapter(
  registerProviderAdapter(registerProviderAdapter(new Map(), ANTHROPIC_MESSAGES_ADAPTER), CLAUDE_CODE_CLI_ADAPTER),
  CLAUDE_CODE_CLI_V2_ADAPTER,
);

/**
 * The configured identity is the subscription route, which this boundary
 * makes capture-only. Thrown before any prerequisite variable is read.
 */
export class SubscriptionRouteCaptureOnlyError extends Error {
  constructor(readonly identity: ProviderAdapterIdentity) {
    super(
      `the ${providerAdapterKey(identity)} route is capture-only in this boundary: it reaches Claude through the pinned Claude Code CLI on a subscription, and only the capture harness's subscription path (test/live-capture.ts) may construct its runner, behind an execution-scoped authentication gate; verify run refuses it by name and reads no live prerequisite for it`,
    );
    this.name = 'SubscriptionRouteCaptureOnlyError';
  }
}

/** Any version of the CLI adapter is the subscription route: matched by id, never by version. */
function isSubscriptionRoute(identity: ProviderAdapterIdentity): boolean {
  return identity.id === CLAUDE_CODE_CLI_IDENTITY.id;
}

/** The token was set and something else the live capability needs was not, or was not a usable value. */
export class LiveWiringError extends Error {
  constructor(readonly missing: readonly string[], readonly invalid: readonly string[] = []) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing [${missing.join(', ')}]`);
    if (invalid.length > 0) parts.push(`not a finite positive safe integer [${invalid.join(', ')}]`);
    super(
      `the capability token is set but the live capability is ${parts.join(' and ')}: ${LIVE_ENDPOINT_ENV} names the host so that none is contacted unless somebody typed it, ${LIVE_API_KEY_ENV} carries the credential, ${LIVE_MAX_ATTEMPTS_ENV} bounds the run's HTTP attempts retries included, and ${LIVE_MAX_INPUT_BYTES_ENV} bounds each request body; none is defaulted`,
    );
    this.name = 'LiveWiringError';
  }
}

/** The variables an authorised live run must state, beyond the token. Order is the refusal's order. */
export const LIVE_PREREQUISITE_ENVS: readonly string[] = [LIVE_ENDPOINT_ENV, LIVE_API_KEY_ENV, LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV];

function absent(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name];
  return value === undefined || value === '';
}

/**
 * The budget the environment states, or a refusal naming what is missing or
 * unusable. A positive decimal integer in the text, exactly: '0', '-1',
 * '1.5', 'abc' and '27 ' are all refused. And after conversion, a finite
 * positive safe integer: a digit string past 2^53 - 1 loses precision, and a
 * long enough one converts to Infinity, and neither is a number the runner
 * can count attempts or bytes against. The runner re-checks the same contract
 * on whatever budget it is handed (`assertRunBudget`).
 */
export function liveBudgetFrom(env: NodeJS.ProcessEnv): RunBudget {
  const names = [LIVE_MAX_ATTEMPTS_ENV, LIVE_MAX_INPUT_BYTES_ENV];
  const missing = names.filter((name) => absent(env, name));
  if (missing.length > 0) throw new LiveWiringError(missing);
  const invalid = names.filter((name) => {
    const text = env[name]!;
    if (!/^[1-9][0-9]*$/.test(text)) return true;
    const value = Number(text);
    return !Number.isSafeInteger(value) || value < 1;
  });
  if (invalid.length > 0) throw new LiveWiringError([], invalid);
  return { maxRunAttempts: Number(env[LIVE_MAX_ATTEMPTS_ENV]), maxInputBytesPerAttempt: Number(env[LIVE_MAX_INPUT_BYTES_ENV]) };
}

export interface LiveWiringOptions {
  env: NodeJS.ProcessEnv;
  /** The run's configuration: its `providerAdapter` identity selects the adapter. */
  config: RoleConfig;
  registry?: ProviderAdapterRegistry;
  /** Defaults to the real transport. Tests inject a fake. */
  transport?: ProviderTransport;
  /** Receives every attempt record. A capture harness files them; an ordinary run may pass none. */
  observe?: AttemptObserver;
}

/**
 * The capability the environment authorises: a live runner through the
 * configured adapter, or none.
 *
 * `record` is deliberately absent: an ordinary `verify run` records nothing,
 * and a capture harness that wants a recording supplies its own callback.
 */
export function liveCapabilityFrom(options: LiveWiringOptions): RunCapabilities {
  const { env, config } = options;
  // Decided from the configuration alone, before the token or any other
  // variable is read: the route is refused whatever the environment says.
  if (isSubscriptionRoute(config.providerAdapter)) throw new SubscriptionRouteCaptureOnlyError(config.providerAdapter);
  if (!liveAgentsEnabled(env)) return { runner: null };

  const missing = LIVE_PREREQUISITE_ENVS.filter((name) => absent(env, name));
  if (missing.length > 0) throw new LiveWiringError(missing);
  const budget = liveBudgetFrom(env);

  if (!isProviderAdapterSelected(config.providerAdapter)) throw new ProviderAdapterNotSelectedError();
  const adapter = resolveProviderAdapter(options.registry ?? PRODUCTION_ADAPTERS, config.providerAdapter);

  return {
    runner: createLiveAgentRunner({
      endpoint: env[LIVE_ENDPOINT_ENV]!,
      apiKey: env[LIVE_API_KEY_ENV]!,
      adapter,
      budget,
      ...(options.transport === undefined ? {} : { transport: options.transport }),
      ...(options.observe === undefined ? {} : { observe: options.observe }),
    }),
  };
}

/**
 * The message a missing live prerequisite should be refused with, or `null`
 * when the error is not one of the wiring's own — a defect, which must escape.
 * Kept here so the CLI never needs to know the runner's error classes; this
 * module is the runner's only importer under `src/cli`.
 */
export function liveWiringRefusal(error: unknown): string | null {
  if (
    error instanceof LiveWiringError ||
    error instanceof SubscriptionRouteCaptureOnlyError ||
    error instanceof ProviderAdapterNotSelectedError ||
    error instanceof UnknownProviderAdapterError ||
    error instanceof MissingProviderAdapterError ||
    error instanceof AgentCapabilityError
  ) {
    return error.message;
  }
  return null;
}
