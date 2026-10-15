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
 * The efforts a registered adapter passes, and therefore the only ones an
 * invocation may declare.
 *
 * Declared here, beside the rule that reads it, so that orchestration can
 * validate an invocation without importing any particular adapter: the
 * pipeline core names no provider. It lists what registered adapters actually
 * pass — today `claude-code-cli@2`'s `high` — and grows only by a reviewed
 * change made beside the adapter that needs the new value. Anything else is
 * refused before it is hashed, because an effort no adapter passes (`HIGH`,
 * `medium`) would be the identity of a pipeline nothing can run.
 */
export const INVOCATION_EFFORTS: readonly string[] = Object.freeze(['high']);

/**
 * Which declaration of an invocation was refused: the configuration's, which a
 * pipeline identity is derived over, or the execution capability's, which a
 * run compares against it.
 */
export type InvocationSide = 'configuration' | 'capability';

/** What a refusal calls the declaration it refuses. */
function invalidInvocationSubject(side: InvocationSide | null): string {
  switch (side) {
    case 'configuration':
      return 'the invocation the configuration declares';
    case 'capability':
      return 'the invocation the execution capability declares';
    default:
      return 'the invocation identity';
  }
}

/**
 * A declared invocation that is not usable as one.
 *
 * `side` names whose declaration it was, because the repair differs: a
 * configuration declaring an unusable invocation is edited, a capability
 * declaring one is given the adapter that declares a usable one. The same
 * problems on the two sides are two different refusals. `null` when the caller
 * named no side, as a direct call does.
 */
export class InvalidInvocationIdentityError extends Error {
  readonly side: InvocationSide | null;

  constructor(
    readonly problems: readonly string[],
    side: InvocationSide | null,
  ) {
    super(`${invalidInvocationSubject(side)} is not usable:\n - ${problems.join('\n - ')}`);
    this.side = side;
    this.name = 'InvalidInvocationIdentityError';
  }
}

/** A value as a problem message shows it: strings quoted, so `'64000'` and `64000` read differently. */
function shown(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/**
 * Rejects an invocation that would make the pipeline identity ambiguous, or
 * that no registered adapter makes.
 *
 * **Checked at runtime, whatever the static type says.** A configuration is a
 * value that may have been read from anywhere, and the type `InvocationIdentity`
 * protects nothing that arrived as JSON. Every problem is collected, and each
 * names its field.
 *
 * - `effort` is one of `INVOCATION_EFFORTS`.
 * - `maxOutputTokens` is a positive safe integer: a rounded or overflowed
 *   ceiling is not the one a launch is configured with.
 * - `executable.version` is refused, never trimmed, when it is empty or carries
 *   whitespace, for the reason the adapter identity's fields are.
 * - `executable.sha256` is 64 **lowercase** hex characters, so that two
 *   spellings of one digest cannot be two pipelines.
 *
 * `side` is carried onto the refusal. Which inputs are refused, and the
 * problems named, do not depend on it.
 */
export function assertValidInvocationIdentity(
  value: unknown,
  side: InvocationSide | null = null,
): asserts value is InvocationIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidInvocationIdentityError(['invocation is not an object'], side);
  }
  const record = value as Record<string, unknown>;
  const problems: string[] = [];

  const effort = record['effort'];
  if (typeof effort !== 'string') problems.push('effort is not a string');
  else if (!INVOCATION_EFFORTS.includes(effort)) {
    problems.push(`effort ${shown(effort)} is not one a registered adapter passes (${INVOCATION_EFFORTS.join(', ')})`);
  }

  const maxOutputTokens = record['maxOutputTokens'];
  if (!Number.isSafeInteger(maxOutputTokens) || (maxOutputTokens as number) <= 0) {
    problems.push(`maxOutputTokens ${shown(maxOutputTokens)} is not a positive safe integer`);
  }

  const executable = record['executable'];
  if (typeof executable !== 'object' || executable === null || Array.isArray(executable)) {
    problems.push('executable is not an object');
  } else {
    const { version, sha256 } = executable as Record<string, unknown>;
    if (typeof version !== 'string') problems.push('executable.version is not a string');
    else if (version.length === 0) problems.push('executable.version is empty');
    else if (version.trim().length !== version.length) problems.push('executable.version has surrounding whitespace');
    else if (/\s/.test(version)) problems.push('executable.version contains whitespace');
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
      problems.push(`executable.sha256 ${shown(sha256)} is not 64 lowercase hex characters`);
    }
  }

  if (problems.length > 0) throw new InvalidInvocationIdentityError(problems, side);
}

/**
 * The fields two declared invocations differ in, in a fixed order, compared
 * with `===` one by one. The one comparison orchestration makes and
 * `InvocationMismatchError` reports, so the check and its message cannot
 * disagree about what differed.
 */
export function invocationDifferences(configured: InvocationIdentity, actual: InvocationIdentity): string[] {
  const fields: string[] = [];
  if (configured.effort !== actual.effort) fields.push('effort');
  if (configured.maxOutputTokens !== actual.maxOutputTokens) fields.push('maxOutputTokens');
  if (configured.executable.version !== actual.executable.version) fields.push('executable.version');
  if (configured.executable.sha256 !== actual.executable.sha256) fields.push('executable.sha256');
  return fields;
}

/** One field's value, for a mismatch message. */
function invocationField(invocation: InvocationIdentity, field: string): string {
  switch (field) {
    case 'effort':
      return shown(invocation.effort);
    case 'maxOutputTokens':
      return shown(invocation.maxOutputTokens);
    case 'executable.version':
      return shown(invocation.executable.version);
    default:
      return shown(invocation.executable.sha256);
  }
}

/** An invocation, in full, for a mismatch message. */
function describeInvocation(invocation: InvocationIdentity): string {
  return `{effort ${shown(invocation.effort)}, maxOutputTokens ${shown(invocation.maxOutputTokens)}, executable ${shown(invocation.executable.version)} sha256 ${shown(invocation.executable.sha256)}}`;
}

/**
 * The invocation a run makes is not the one its identity claims.
 *
 * Either side may be absent. `fields` lists the differing fields only when
 * both sides declare an invocation; when one side declares none it is empty,
 * and the message says which side that is, because the repair differs: a
 * configuration missing its invocation is edited, a capability missing one is
 * given the adapter that declares it.
 */
export class InvocationMismatchError extends Error {
  readonly fields: readonly string[];

  constructor(
    readonly configured: InvocationIdentity | undefined,
    readonly actual: InvocationIdentity | undefined,
  ) {
    const consequence = 'the recorded identity would describe a pipeline that did not run';
    const fields = configured !== undefined && actual !== undefined ? invocationDifferences(configured, actual) : [];
    super(
      configured === undefined
        ? `the execution capability declares invocation ${actual === undefined ? 'none' : describeInvocation(actual)}, but the configuration this run's pipelineVersion is derived over declares none: ${consequence}`
        : actual === undefined
          ? `this run's pipelineVersion is derived over invocation ${describeInvocation(configured)}, but the execution capability declares none: ${consequence}`
          : `this run's pipelineVersion is derived over an invocation the execution capability does not make: ${fields
              .map((field) => `${field} configured ${invocationField(configured, field)}, actual ${invocationField(actual, field)}`)
              .join('; ')}: ${consequence}`,
    );
    this.fields = fields;
    this.name = 'InvocationMismatchError';
  }
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

/**
 * How an adapter invokes the model, where that is not already implied by the
 * adapter's identity and the role configuration.
 *
 * On the HTTP route every request parameter is written by the adapter, so its
 * identity covers them. On a route that launches a pinned executable, three
 * things that decide what the model is asked to do are settings of the launch
 * rather than bytes the adapter writes: the effort, the output ceiling (which
 * thinking also counts toward) and the executable itself. A run that changed
 * any of them could answer differently under the same adapter identity, so
 * they are declared here, as data, for the pipeline identity to carry.
 *
 * Every field is required when the object is present. An adapter that has
 * nothing to declare leaves `invocation` off entirely — never `null`, never
 * `{}` — so that an identity computed without it is unchanged.
 */
export interface InvocationIdentity {
  /** The effort the launch requests, exactly as the adapter passes it. */
  readonly effort: string;
  /** The output-token ceiling the launch is configured with. */
  readonly maxOutputTokens: number;
  /** The pinned executable, by version and SHA-256 — not by path, which is deployment. */
  readonly executable: {
    readonly version: string;
    readonly sha256: string;
  };
}

export interface ProviderAdapter {
  readonly identity: ProviderAdapterIdentity;
  /**
   * The invocation this adapter declares, when its identity does not already
   * imply it. Absent means the adapter declares none; see `InvocationIdentity`.
   * Declared, never inferred from a response, for the reason `channel` is.
   */
  readonly invocation?: InvocationIdentity;
  /**
   * How the runner reaches this provider: over HTTP, or by launching a local
   * process that reaches it on the runner's behalf. Absent means `http`.
   *
   * A declared property of the adapter, fixed before anything is executed,
   * and never inferred from a response. The channel decides what an attempt
   * record can truthfully say — whether a `status` was observed at all,
   * whether the unit spent was a request or a launch, whether an HTTP attempt
   * count is known — and those are claims about what the run *was going to
   * do*, not about what came back. Reading the channel off a response would
   * let a transport's answer rewrite the account of the attempt that produced
   * it, and would leave an attempt that produced no response — refused
   * unsent, cancelled, failed to launch — with no channel at all. It travels
   * with the identity: an adapter that speaks a protocol over a different
   * channel is a different adapter, and its identity says so.
   */
  readonly channel?: 'http' | 'process';
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
