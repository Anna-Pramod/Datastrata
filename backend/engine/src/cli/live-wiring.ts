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
 * **Three prerequisites, none implying another.**
 *
 * ```text
 * DATASTRATA_VERIFICATION_AGENTS=1   the capability token — an act, not a state
 * DATASTRATA_AGENT_ENDPOINT          the endpoint, named explicitly
 * DATASTRATA_AGENT_API_KEY           the credential
 * ```
 *
 * Without the token there is no runner, whatever credential and endpoint the
 * environment carries: an API key sitting in a developer's shell is not
 * permission to spend, and an ordinary `verify run` then refuses by name with
 * nothing contacted. With the token, a missing endpoint or credential is a
 * refusal naming the variable, and so is a configured adapter identity no
 * registered adapter answers to. The endpoint is named rather than defaulted
 * so that no host is contacted unless somebody typed it.
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
 * This module reads the environment, which is why it lives under `src/cli/`.
 */

import type { RunCapabilities } from './run';
import { ANTHROPIC_MESSAGES_ADAPTER } from '../pipeline/anthropic-messages';
import type { RoleConfig } from '../pipeline/config';
import { AgentCapabilityError, createLiveAgentRunner, liveAgentsEnabled, MissingProviderAdapterError, type ProviderTransport } from '../pipeline/live-runner';
import {
  isProviderAdapterSelected,
  ProviderAdapterNotSelectedError,
  registerProviderAdapter,
  resolveProviderAdapter,
  UnknownProviderAdapterError,
  type ProviderAdapterRegistry,
} from '../pipeline/provider-adapter';

export const LIVE_ENDPOINT_ENV = 'DATASTRATA_AGENT_ENDPOINT';
export const LIVE_API_KEY_ENV = 'DATASTRATA_AGENT_API_KEY';

/** Every adapter production may execute, keyed by identity. One today. */
export const PRODUCTION_ADAPTERS: ProviderAdapterRegistry = registerProviderAdapter(new Map(), ANTHROPIC_MESSAGES_ADAPTER);

/** The token was set and something else the live capability needs was not. */
export class LiveWiringError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(
      `the capability token is set but the live capability is missing [${missing.join(', ')}]: ${LIVE_ENDPOINT_ENV} names the host so that none is contacted unless somebody typed it, and ${LIVE_API_KEY_ENV} carries the credential; neither is defaulted`,
    );
    this.name = 'LiveWiringError';
  }
}

export interface LiveWiringOptions {
  env: NodeJS.ProcessEnv;
  /** The run's configuration: its `providerAdapter` identity selects the adapter. */
  config: RoleConfig;
  registry?: ProviderAdapterRegistry;
  /** Defaults to the real transport. Tests inject a fake. */
  transport?: ProviderTransport;
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
  if (!liveAgentsEnabled(env)) return { runner: null };

  const missing: string[] = [];
  const endpoint = env[LIVE_ENDPOINT_ENV];
  const apiKey = env[LIVE_API_KEY_ENV];
  if (endpoint === undefined || endpoint === '') missing.push(LIVE_ENDPOINT_ENV);
  if (apiKey === undefined || apiKey === '') missing.push(LIVE_API_KEY_ENV);
  if (missing.length > 0) throw new LiveWiringError(missing);

  if (!isProviderAdapterSelected(config.providerAdapter)) throw new ProviderAdapterNotSelectedError();
  const adapter = resolveProviderAdapter(options.registry ?? PRODUCTION_ADAPTERS, config.providerAdapter);

  return {
    runner: createLiveAgentRunner({
      endpoint: endpoint!,
      apiKey: apiKey!,
      adapter,
      ...(options.transport === undefined ? {} : { transport: options.transport }),
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
    error instanceof ProviderAdapterNotSelectedError ||
    error instanceof UnknownProviderAdapterError ||
    error instanceof MissingProviderAdapterError ||
    error instanceof AgentCapabilityError
  ) {
    return error.message;
  }
  return null;
}
