/**
 * The provider boundary, named and versioned.
 *
 * # Why this is a pipeline-identity input and not provenance
 *
 * A provider's HTTP response is an envelope, and more than one reading of it is
 * defensible:
 *
 * ```text
 * {content:[{text:'A'},{text:'B'}]}   ->  'A'      one reading
 *                                    ->  'AB'     another
 * ```
 *
 * The model invocation is identical in both cases. What differs is the string
 * the role boundary is handed — which changes what the seam validates, what the
 * reading says, what the adjudicator settles, and therefore `resultSha256`. A
 * projection is not a detail of transport; it decides what the model's answer
 * *was*.
 *
 * So adapter identity is an input to `pipelineVersion`, alongside prompt-file
 * hashes, model ids, role configuration, the result schema version and the
 * closure policy. A provenance-only field would be strictly too weak: B3 could
 * benchmark and promote interpretation A, and a later live run could execute
 * interpretation B under the same promoted identity, with every gate green.
 * Provenance records what happened; identity is what a promotion is *about*.
 * The transcript may additionally carry the identity for a human reader, but
 * that is a projection of this fact and never a second authority for it.
 *
 * # Identity is declared, never derived
 *
 * Nothing here hashes a function, its source text or its behaviour. Source
 * hashing would make every cosmetic refactor a new pipeline — retiring
 * benchmark evidence for a renamed variable — and would still not catch a
 * semantic change made by editing a dependency. Identity is therefore a
 * *claim* the adapter's author makes, and the rule for changing it is a rule
 * about semantics:
 *
 * ```text
 * MUST bump the version
 *   the model-content string produced from a given response envelope changes
 *   the request sent for a given RoleRequest changes in a way a provider
 *     could answer differently
 *
 * MUST NOT bump the version
 *   renaming, reformatting, refactoring, adding comments or tests
 *   any change where every (RoleRequest, envelope) pair maps to the same
 *     request bytes and the same model-content string
 * ```
 *
 * The registry below is what stops the first rule being broken *accidentally by
 * collision* — two different adapters registered under one identity — but it
 * cannot stop an author editing an adapter's semantics in place without moving
 * its version. That is a review obligation, and it is stated here so that the
 * review knows it owns it.
 *
 * **Nothing in `src/` constructs a registry yet**, and saying so matters: no
 * provider has been selected, so there is nothing to register and no production
 * path resolves an identity through one. The collision refusal is therefore a
 * *mechanism the first live run will use*, exercised today only by its own
 * tests — not a protection currently standing between anything and anything.
 * When a provider is chosen, `createLiveAgentRunner` should take the configured
 * identity and resolve it here rather than being handed an adapter object, and
 * that is the point at which this becomes live.
 *
 * # What this boundary owns, and what it must never own
 *
 * ```text
 * OWNS   canonical role request  -> provider request bytes, headers, URL
 *        provider response body  -> exact model-content string
 *
 * NEVER  role-output JSON parsing or schema validation
 *        transcript semantics or transcript binding
 *        deterministic pins, gap semantics, adjudication semantics
 *        result assembly, canonical serialisation, resultSha256, signing
 * ```
 *
 * Once `projectResponse` returns, the string goes through the ordinary role
 * boundary — the same one replay and every deterministic test runner go
 * through. There is no provider-specific validation path, and `agent-role.ts`
 * never asks where a response came from.
 *
 * Pure: nothing here performs I/O. `buildRequest` *describes* a request;
 * `live-runner.ts` is what sends one.
 */

import type { RoleRequest } from './roles';

/**
 * A provider adapter's semantic identity.
 *
 * Two fields rather than one string so that the identity is structured the way
 * every other `pipelineVersion` component is, and so `id` can be matched
 * independently of `version` when a human is reading a ledger.
 */
export interface ProviderAdapterIdentity {
  /** Stable name of the provider protocol this adapter speaks. */
  readonly id: string;
  /** Bumped when, and only when, the adapter's semantics move. */
  readonly version: string;
}

/** `id@version`, for messages and registry keys. Never for hashing. */
export function providerAdapterKey(identity: ProviderAdapterIdentity): string {
  return `${identity.id}@${identity.version}`;
}

/** An identity that is not usable as one. */
export class InvalidProviderAdapterIdentityError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`the provider adapter identity is not usable:\n - ${problems.join('\n - ')}`);
    this.name = 'InvalidProviderAdapterIdentityError';
  }
}

/**
 * Rejects identities that would make the pipeline identity ambiguous.
 *
 * Blank and whitespace-bearing values are refused rather than trimmed, for the
 * reason the ledger authority fields are: a value that is preserved exactly is
 * one a reader can compare, and trimming makes two different declarations equal.
 */
export function assertValidProviderAdapterIdentity(identity: ProviderAdapterIdentity): void {
  const problems: string[] = [];
  for (const [field, value] of [
    ['id', identity.id],
    ['version', identity.version],
  ] as const) {
    if (value.length === 0) problems.push(`${field} is empty`);
    else if (value.trim().length !== value.length) problems.push(`${field} has surrounding whitespace`);
    else if (/\s/.test(value)) problems.push(`${field} contains whitespace`);
    else if (value.includes('@')) problems.push(`${field} contains '@', which separates id from version`);
  }
  if (problems.length > 0) throw new InvalidProviderAdapterIdentityError(problems);
}

/**
 * The identity a run declares when no provider has been chosen.
 *
 * Not `undefined` and not optional. Every run has an adapter identity, because
 * every run's `pipelineVersion` must say which provider semantics it was
 * produced under — and "none was selected" is an answer to that question, not
 * an absence of one. It is also what keeps a deterministic offline run from
 * aliasing a real provider's identity by default: a stub answering from a table
 * is emphatically not `anthropic-messages@1`, and the identity says so.
 *
 * A live capability under this identity is refused by orchestration
 * (`ProviderAdapterNotSelectedError`), and that refusal is a *different fact*
 * from a runner arriving without an adapter object: one says the configuration
 * chose no provider, the other says the capability brought no protocol. They
 * are separate failures with separate names, because an operator repairing the
 * first edits configuration and repairing the second supplies an adapter.
 *
 * Selecting a provider changes the configuration, which changes
 * `pipelineVersion`, which is exactly right: a pipeline that calls a real
 * provider is not the pipeline that never could.
 */
export const UNSELECTED_PROVIDER_ADAPTER: ProviderAdapterIdentity = {
  id: 'unselected',
  version: '0',
};

export function isProviderAdapterSelected(identity: ProviderAdapterIdentity): boolean {
  return identity.id !== UNSELECTED_PROVIDER_ADAPTER.id;
}

/**
 * What an adapter says to send. Described, not sent.
 *
 * Returned as data so the request an adapter would make is inspectable without
 * making it — which is how the offline suite tests request construction at all.
 */
export interface ProviderHttpRequest {
  url: string;
  method: string;
  headers: Readonly<Record<string, string>>;
  body: string;
}

/**
 * Where a run reaches this provider, and with what credential.
 *
 * **Deployment configuration, deliberately kept out of the identity.** An
 * endpoint that routes to the same protocol — a regional host, a gateway, a
 * mock server — is the same verification method, and hashing it would make
 * every environment a different pipeline and retire B3's evidence on a DNS
 * change. A credential is a secret and must never enter a digest that is
 * published in a result and a signature.
 *
 * The line is *semantics*: if an endpoint speaks a different protocol or
 * projects differently, that is a different **adapter**, and the adapter's
 * identity is what moves. Routing is not semantics.
 */
export interface ProviderEndpointConfig {
  endpoint: string;
  apiKey: string;
}

/**
 * What a provider reports having metered for one completed request.
 *
 * Every field is what the provider said, in the provider's units. A field the
 * envelope does not carry is `null` — unknown — never zero: a zero would read
 * as "nothing was billed", which is the one thing an absent figure cannot
 * establish.
 */
export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
}

export interface ProviderAdapter {
  readonly identity: ProviderAdapterIdentity;
  /** Canonical role request -> this provider's request protocol. */
  buildRequest(request: RoleRequest, config: ProviderEndpointConfig): ProviderHttpRequest;
  /** This provider's response envelope -> the exact model-content string. */
  projectResponse(body: string, request: RoleRequest): string;
  /**
   * The usage a completed envelope reports, or `null` when it reports none the
   * adapter can read. Diagnostic only: it changes neither the request nor the
   * projected content, so an adapter that gains it keeps its identity. Optional
   * because a synthetic adapter has nothing to meter.
   */
  readUsage?(body: string): ProviderUsage | null;
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/** Two different adapters were registered under one identity. */
export class ProviderAdapterCollisionError extends Error {
  constructor(readonly identity: ProviderAdapterIdentity) {
    super(
      `two different provider adapters are registered as ${providerAdapterKey(identity)}: an identity is what a promotion is about, so two implementations answering to one identity would let B3 benchmark one and a live run execute the other under the same pipelineVersion`,
    );
    this.name = 'ProviderAdapterCollisionError';
  }
}

/** A run declared an adapter identity nothing implements. */
export class UnknownProviderAdapterError extends Error {
  constructor(
    readonly identity: ProviderAdapterIdentity,
    readonly known: readonly string[],
  ) {
    super(
      `no provider adapter is registered as ${providerAdapterKey(identity)}; registered: [${known.join(', ')}]. A configured identity with no implementation is refused rather than defaulted, because a default would execute semantics the pipeline identity does not describe`,
    );
    this.name = 'UnknownProviderAdapterError';
  }
}

/** The adapter a run executes is not the one its identity claims. */
export class ProviderAdapterMismatchError extends Error {
  constructor(
    readonly configured: ProviderAdapterIdentity,
    readonly actual: ProviderAdapterIdentity,
  ) {
    super(
      `this run's pipelineVersion is derived over provider adapter ${providerAdapterKey(configured)} but the execution capability speaks ${providerAdapterKey(actual)}: the recorded identity would describe a pipeline that did not run`,
    );
    this.name = 'ProviderAdapterMismatchError';
  }
}

/** A capability that executes a provider protocol did not say which one. */
export class UnverifiedProviderAdapterError extends Error {
  constructor(readonly configured: ProviderAdapterIdentity) {
    super(
      `this run's pipelineVersion is derived over provider adapter ${providerAdapterKey(configured)} but the execution capability declares no adapter at all: a capability that speaks a provider protocol must say which one, because an undeclared adapter is an unverifiable claim rather than an exemption from the check`,
    );
    this.name = 'UnverifiedProviderAdapterError';
  }
}

/** A live run was attempted with no provider selected. */
export class ProviderAdapterNotSelectedError extends Error {
  constructor() {
    super(
      `no provider adapter has been selected: this run's configuration declares ${providerAdapterKey(UNSELECTED_PROVIDER_ADAPTER)}, which describes a pipeline that cannot call a provider. Selecting one is part of authorising the first live run, and it changes pipelineVersion — a pipeline that reaches a model is not the pipeline that never could.`,
    );
    this.name = 'ProviderAdapterNotSelectedError';
  }
}

export type ProviderAdapterRegistry = ReadonlyMap<string, ProviderAdapter>;

/**
 * Adds one adapter, refusing to let two answer to one identity.
 *
 * Registering the *same* adapter object twice is idempotent; registering a
 * different one under an identity already taken is the collision. That is the
 * one aliasing failure a machine can catch — an author editing an adapter's
 * semantics in place without moving its version is a review obligation, stated
 * in this file's header.
 */
export function registerProviderAdapter(
  registry: ProviderAdapterRegistry,
  adapter: ProviderAdapter,
): ProviderAdapterRegistry {
  assertValidProviderAdapterIdentity(adapter.identity);
  const key = providerAdapterKey(adapter.identity);
  const existing = registry.get(key);
  if (existing !== undefined && existing !== adapter) {
    throw new ProviderAdapterCollisionError(adapter.identity);
  }
  return new Map(registry).set(key, adapter);
}

/** The adapter a configured identity names, or a named refusal. */
export function resolveProviderAdapter(
  registry: ProviderAdapterRegistry,
  identity: ProviderAdapterIdentity,
): ProviderAdapter {
  const adapter = registry.get(providerAdapterKey(identity));
  if (adapter === undefined) {
    throw new UnknownProviderAdapterError(identity, [...registry.keys()]);
  }
  return adapter;
}
