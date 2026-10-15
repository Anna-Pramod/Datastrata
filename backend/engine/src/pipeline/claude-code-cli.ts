/**
 * The Claude Code CLI adapter — the second concrete provider protocol, on the
 * process channel.
 *
 * `anthropic-messages@1` reaches Claude over HTTP with an API key. This
 * module, `claude-code-cli@1`, reaches the same model through the pinned
 * Claude Code CLI executable running under a Max subscription: the runner
 * launches a local child process, the child makes the HTTP requests, and
 * what comes back is the child's exit status and its `stream-json` stdout.
 * The adapter's two directions are therefore not "build an HTTP request" and
 * "read an HTTP envelope" but "describe a launch" and "read a stream of CLI
 * events", and every choice below follows from that.
 *
 * **Capture-only, and why the identity is separate.** The channel changes
 * what an attempt record can truthfully say (no HTTP status is observed, the
 * unit spent is a launch, HTTP attempt counts are unknown), and the CLI adds
 * content of its own to the request. That is a different pipeline from the
 * HTTP one, so it has a different identity, and `verify run` refuses it by
 * name; only the capture harness may construct a runner over it.
 *
 * **The pin is a constant.** `PINNED_CLI` names the executable by path
 * relative to `HOME`, by version, by SHA-256 and by size. The transport hashes
 * the file before every launch and refuses a mismatch before anything is
 * started. Moving the pin moves this adapter's version: a different
 * executable may speak a different stream, and the projection below was
 * proved against exactly one.
 *
 * **The launch is controlled by environment, not trusted.** The nine
 * `LAUNCH_CONTROL_ENV` variables are what the accepted probe ran under: no
 * retries at either level (a retry would be a second request the runner did
 * not count), the 16 000-token output ceiling shared with the HTTP adapter,
 * no fallback to a non-streaming or refusal-recovery path (either would
 * change what arrives without saying so), and no telemetry, error reporting
 * or auto-update traffic. The ceiling and the thinking configuration are
 * *configured*, not *observed*: nothing here sees the wire-level
 * `max_tokens`, and the header of the checkpoint says so.
 *
 * **What `bodyBytes` measures on this channel.** The runner admits a request
 * by the UTF-8 length of `ProviderHttpRequest.body`. Here the body is the JSON
 * of a `CliLaunchSpec` — model, system prompt, user message, role schema,
 * effort, and the role name and index the launch is for — so `bodyBytes` is
 * the UTF-8 length of that JSON. It is an upper
 * bound on the bytes the transport writes to the system-prompt file and to
 * stdin, and it is **not** the provider request size: the CLI adds content of
 * its own (its system prompt, tool definitions and whatever else it decides
 * to send), and that content is of unmeasured size. The accepted probe
 * reported 626 cache-creation input tokens for a two-token user message, and
 * nothing in the stream attributes them. A budget expressed in `bodyBytes`
 * bounds what this pipeline chose to send, and nothing more.
 *
 * **No credential, by construction.** The subscription route authenticates
 * the CLI itself, so a non-empty `apiKey` is refused by name rather than
 * ignored: an operator who supplied one intended the other route, and a run
 * that silently discarded it would leave two contradictory accounts of how it
 * authenticated. The launch description carries no secret, and nothing
 * written here reaches the transcript except the projected content.
 *
 * **A stream is read as a whole, and refused as a whole.** The CLI's
 * `stream-json` output interleaves raw Messages stream events with the CLI's
 * own `system`, `assistant`, `user`, `rate_limit_event` and `result` events.
 * The projection replays the entire stream through a lifecycle state machine
 * before it looks at any content, so a stream that is out of order, that
 * carries an event this adapter does not know, or that ended with a message
 * or block still open is refused by position rather than partially read.
 * Every block ever started is kept and counted: a second `StructuredOutput`
 * call is a refusal, not a replacement, and an implementation that kept
 * blocks in a map keyed by index would silently discard the first when the
 * index came round again.
 *
 * **One call, of the one tool, answered once.** The launch offers exactly one
 * tool, so every `tool_use` block in every message is counted *whatever its
 * name*: a `Bash` or `WebSearch` call beside the `StructuredOutput` call is
 * refused by name with every call listed, not skipped because a filter was
 * looking for the other name. The same discipline is applied to what the CLI
 * says about the call: every `tool_use` item in every `assistant` message
 * must be the one `StructuredOutput` call under the id the stream started,
 * and the `user` events must carry exactly one `tool_result`, for that id —
 * the CLI's own tool loop ran once, or the stream is not the one this
 * adapter was proved against. That id must be a non-empty string on the
 * `content_block_start`, or the call is refused before anything is matched
 * to it: a call without an id would leave the restatement and the
 * `tool_result` matchable only by name, and name-only matching is exactly
 * how conflicting ids would be read as agreement.
 *
 * **The answer is the deltas, byte for byte.** The model's structured output
 * arrives as `input_json_delta` fragments; their concatenation is the exact
 * text the model produced and it is returned unchanged. The CLI also states
 * the parsed input on the `assistant` message and again as
 * `result.structured_output`; both are compared to the concatenation as
 * canonical JSON and any disagreement is refused. Neither is ever returned:
 * a re-serialisation would be the CLI's reading of the answer, not the
 * answer, and `resultSha256` is computed over what the seam is handed.
 *
 * **`subtype: "success"` is not success.** The rejected probe's `result` said
 * `subtype: "success"` with `is_error: true` when the OAuth session had
 * expired. Both conjuncts are checked, `is_error` first, and each is named in
 * the refusal.
 *
 * **Usage is read, not trusted**, exactly as on the HTTP adapter: integer
 * fields from `result.usage`, `null` for anything else, and only when the
 * result is a success with `is_error: false`. The runner stamps usage from
 * this channel `cli_report`, because it is the CLI's account of what it did,
 * not a provider envelope this pipeline saw.
 *
 * **Two profiles, and the profile is the authority.** `claude-code-cli@2`
 * sits beside `@1` rather than replacing it: `@1` stays byte-identical for
 * replay, the committed probe fixtures and the injected-launch tests, and
 * `@2` is the route onto the model `@1`'s executable does not know. Each
 * version is described by one `CliProfile` — the pinned executable, the
 * permitted models, effort, the output ceiling, the launch controls, the
 * `--settings` text, the gate's rules and the time budgets — and what the
 * adapter declares, what the transport launches and what a harness reports
 * are read from it rather than restated, because two copies of a pin are two
 * pins that can disagree. `@1`'s profile references the constants `@1` has
 * always exported; `@2`'s is new. `@2` refuses a model outside its list before
 * anything is described, and declares its invocation (effort, ceiling,
 * executable) so the pipeline identity moves when any of them does. `@1`
 * declares none and refuses no model: it answers exactly as it always has.
 *
 * **`@2` names the costliest fact first, then refuses the rest as `@1` does.**
 * On the subscription route the worst outcomes are the ones that spend
 * outside included usage — overage, an exhausted window continued past,
 * credits, the paid 1M-context route, a substituted model, fast mode — and
 * each of them can arrive in a stream that also exits non-zero, carries a
 * garbled line, or ends out of order. A generic refusal would then hide the
 * fact the operator most needs, so `@2` reads every line it can parse
 * (skipping, and remembering, the first it cannot), classifies the whole
 * stream by rule priority rather than line order, and only then applies the
 * exit check, the malformed line, and a lifecycle walk that refuses any
 * system subtype, block, item or delta it does not know. The classification
 * decides which refusal a fact it names becomes: it runs first, so while a
 * rule holds no later step answers for that rule's fact. D-7 says the later
 * steps don't re-check those facts; several do, on purpose, and fail closed.
 * These are the overlaps Task 2's teeth checks showed, each named by the
 * teeth that broke the earlier check and saw a later step refuse (under its
 * own class, or in its own words under the same class) rather than accept:
 *
 * - the rate-limit allowlist (`rateLimitProblems`) re-reads the status and
 *   overage fields rules 1 and 2 classify on the event (T09, T11);
 * - inside `unifiedWindows`, the window allowlist (`windowFieldProblems`,
 *   and the refusal of names containing "overage", which also covers rule
 *   1's `rateLimitType` "overage") re-reads what rules 1 and 2 read there
 *   (SS3, SX1);
 * - the result's `fast_mode_state` of exactly "off" re-reads rule 8's "on"
 *   and "cooldown" (T17);
 * - the assistant item's stop-reason allowlist re-reads rules 6 and 7's
 *   "refusal" and "max_tokens" on an assistant item (T23);
 * - the result's tie to the last message's stop reason re-reads what the
 *   result's own stop-reason allowlist refuses (SS1), and the one-call check
 *   refuses the stream with no completed message that the tie refuses
 *   first (UX3);
 * - the walk's block and item allowlists re-read rule 5's fallback block
 *   and item (T04), and rule 5's comparison with the requested model
 *   re-reads rule 4's `[1m]` models, though not its context-1m beta at init
 *   (T16);
 * - the API-error kind rules (3, 5, 6 and 9) are re-read by the walk's
 *   subtype allowlist on a system `api_error` event, by the result step's
 *   refusal of an API-error item beside a success, and at a non-zero exit
 *   by the exit check (T13, RT2, SS11);
 * - the tool loop's one `tool_result` re-reads the user-content allowlist
 *   where the only user event's content is not an item list (RT7, one of
 *   its four cases; the other three were accepted).
 *
 * The same construction makes the launch context's `fast_mode_state` of
 * exactly "off" re-read rule 8 at init, and the result's stop-reason
 * allowlist, its tie and the stop-reason check re-read rules 6 and 7 on the
 * result and on each message's `message_delta`; no teeth here broke those
 * halves of the rules. The list is what the teeth found, not a proof that no
 * other overlap exists. The overlaps change no answer while the rules hold.
 * Where one covers a rule's fact, a defect in that rule shows as the later
 * step's refusal rather than as an acceptance, which is why a teeth check
 * that breaks such a rule reds on the class rather than on an acceptance
 * (review repair U8, a parent decision).
 * A rate-limit window reported `rejected` is exhaustion wherever it appears,
 * because 2.1.280 continues past the limit by default and a later `allowed`
 * is what that looks like. An API-error item (model `<synthetic>`) is an
 * error, never a substitution; only its kind can classify it. None of this
 * is proved against a 2.1.280 stream yet: each rule is written from the
 * executable's strings and the 2.1.226 probes, and the first `@2` launch is
 * a probe that confirms or amends them.
 *
 * Pure: no filesystem, no clock, no network, no child process. The transport
 * (`claude-code-cli-transport.ts`) performs the launch this module describes,
 * and imports its profile data from here; nothing here imports the transport.
 */

import { z } from 'zod';
import {
  MAX_OUTPUT_TOKENS,
  ProviderOutputTruncatedError,
  ProviderRefusalError,
  roleOutputJsonSchema,
} from './anthropic-messages';
import type { InvocationIdentity, ProviderAdapter, ProviderAdapterIdentity, ProviderEndpointConfig, ProviderHttpRequest, ProviderUsage } from './provider-adapter';
import type { RoleRequest } from './roles';

export const CLAUDE_CODE_CLI_IDENTITY: ProviderAdapterIdentity = { id: 'claude-code-cli', version: '1' };

/** The one executable this adapter was proved against. Moving it moves the adapter's version. */
export const PINNED_CLI = {
  /** Relative to `HOME`; resolved by `resolvePinnedCliPath`. */
  path: '~/.local/share/claude/versions/2.1.226',
  version: '2.1.226',
  sha256: '013a1cf17df5ff1dcc189d5d6fd3fdd5f097ddc3cd41aa9992e99805574febbe',
  sizeBytes: 279661952,
} as const;

/**
 * A `~/`-relative pin path with `~` replaced by the given home directory.
 * Everything after `~` is kept verbatim — a pin under `Application Support`
 * keeps its space — because the path is handed to `spawn` as one argument,
 * never to a shell. Pure: nothing is checked to exist.
 */
export function resolvePinPath(pinPath: string, home: string): string {
  if (!pinPath.startsWith('~/')) throw new Error(`a pin path is resolved only when it is relative to the home directory ("~/..."); received ${JSON.stringify(pinPath)}`);
  if (!home.startsWith('/')) throw new Error(`the pinned CLI path is resolved against an absolute home directory; received ${JSON.stringify(home)}`);
  return `${home.replace(/\/+$/, '')}${pinPath.slice(1)}`;
}

/** `PINNED_CLI.path` with `~` replaced by the given home directory. Pure: nothing is checked to exist. */
export function resolvePinnedCliPath(home: string): string {
  return resolvePinPath(PINNED_CLI.path, home);
}

/** The nine variables the accepted probe ran under. The transport sets exactly these beside the inherited `HOME`, `USER` and `PATH`. */
export const LAUNCH_CONTROL_ENV: Readonly<Record<string, string>> = Object.freeze({
  CLAUDE_CODE_MAX_RETRIES: '0',
  MAX_STRUCTURED_OUTPUT_RETRIES: '0',
  CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(MAX_OUTPUT_TOKENS),
  CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
  CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_TELEMETRY: '1',
  DISABLE_ERROR_REPORTING: '1',
  DISABLE_AUTOUPDATER: '1',
});

/** The `url` every launch description carries; the transport refuses any other. */
export const CLI_LAUNCH_URL = 'claude-code-cli:pinned';
/** The tool the CLI exposes for structured output, and the only tool a launch may see. */
export const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput';

// ---------------------------------------------------------------------------
// Profiles: one per adapter version, and the gate's rules inside each
// ---------------------------------------------------------------------------

/**
 * What the gate (`auth status --json`, which the transport runs before any
 * role launch) accepts, held as data so that each profile carries its own.
 * The gate is an allowlist: a key the rules do not name blocks, because a
 * new key is a new fact about the account and nothing here knows what it
 * means until someone has looked. Every rule adds its own reason, so a
 * blocked gate says everything that blocked it.
 */
export interface CliGateRules {
  /** Keys the answer may carry; any other key blocks. Each is reported in the verdict's `fields`, in this order. */
  readonly allowlist: readonly string[];
  /** Allowlisted keys whose values identify the account or the machine: labelled `PRESENT` or `ABSENT`, never reproduced. */
  readonly identifierFields: readonly string[];
  /** Keys whose value must be exactly this literal, checked in this order. */
  readonly required: readonly (readonly [key: string, value: string | boolean])[];
  /** Keys that must not be present at all, whatever their value. */
  readonly requiredAbsent: readonly string[];
}

/**
 * One adapter version's launch, as data: the single authority for what that
 * version runs. The adapter's declared invocation, the transport's
 * executable, controls and gate rules, and whatever a harness reports about
 * the launch are read from here, never restated beside it.
 */
export interface CliProfile {
  readonly identity: ProviderAdapterIdentity;
  /** The executable, by `~/`-relative path, version, SHA-256 and exact size; the transport checks the last two before every launch. */
  readonly pin: {
    readonly path: string;
    readonly version: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  };
  /** The models the profile is for. Enforced by `@2`'s `buildRequest`; recorded, not enforced, for `@1`. */
  readonly permittedModels: readonly string[];
  readonly effort: CliLaunchSpec['effort'];
  /** The output-token ceiling the controls configure. Thinking counts toward it. */
  readonly maxOutputTokens: number;
  /** The launch-control environment, beside the inherited `HOME`, `USER` and `PATH`. */
  readonly controls: Readonly<Record<string, string>>;
  /** The `--settings` text the launch spec carries, or `null` when it carries none and the transport's own default applies. */
  readonly settings: string | null;
  /** The bound on one role launch, or `null` where the profile sets none of its own. */
  readonly launchTimeoutMs: number | null;
  /** The bound on the gate launch, or `null` where the profile sets none of its own. */
  readonly gateTimeoutMs: number | null;
  readonly gate: CliGateRules;
}

/** Frozen at every level, so nothing that holds a profile can edit it in place. Objects already frozen are left as they are. */
function frozen<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) frozen((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/** `@1`'s gate: the keys 2.1.226 reports, read exactly as the gate has always read them. */
export const CLAUDE_CODE_CLI_GATE_RULES: CliGateRules = frozen({
  allowlist: ['loggedIn', 'authMethod', 'apiProvider', 'apiKeySource', 'forcedLoginMethod', 'subscriptionType', 'email', 'orgId', 'orgName'],
  identifierFields: ['email', 'orgId', 'orgName'],
  required: [
    ['loggedIn', true],
    ['authMethod', 'claude.ai'],
    ['apiProvider', 'firstParty'],
    ['subscriptionType', 'max'],
  ],
  requiredAbsent: ['apiKeySource', 'forcedLoginMethod'],
});

/**
 * `@2`'s gate: `@1`'s rules and the three keys 2.1.280 adds to its answer.
 *
 * The two directories are the CLI's projects and configuration paths, which
 * carry the operator's home directory and so their user name: they are
 * identifiers, labelled and never reproduced. `analyticsDisabled` must be
 * exactly `true`, because the launch controls say no telemetry is sent and
 * an answer saying analytics is on contradicts them. Whether it follows
 * `DISABLE_TELEMETRY` is not yet observed: if it does not, this rule blocks
 * the gate, and that is the answer the rule is for.
 */
export const CLAUDE_CODE_CLI_V2_GATE_RULES: CliGateRules = frozen({
  allowlist: [...CLAUDE_CODE_CLI_GATE_RULES.allowlist, 'analyticsDisabled', 'projectsDirectory', 'configDirectory'],
  identifierFields: [...CLAUDE_CODE_CLI_GATE_RULES.identifierFields, 'projectsDirectory', 'configDirectory'],
  required: [...CLAUDE_CODE_CLI_GATE_RULES.required, ['analyticsDisabled', true]],
  requiredAbsent: [...CLAUDE_CODE_CLI_GATE_RULES.requiredAbsent],
});

/**
 * `@1`, described from the constants it has always exported, so the profile
 * and those constants cannot drift apart. It sets no timers of its own (its
 * launches are bounded by the harness's lifetime), carries no `--settings`
 * in its launch spec, and records the model it was proved with without
 * refusing any other: its `buildRequest` is unchanged.
 */
export const CLAUDE_CODE_CLI_PROFILE: CliProfile = Object.freeze({
  identity: CLAUDE_CODE_CLI_IDENTITY,
  pin: PINNED_CLI,
  permittedModels: Object.freeze(['claude-opus-5']),
  effort: 'high',
  maxOutputTokens: MAX_OUTPUT_TOKENS,
  controls: LAUNCH_CONTROL_ENV,
  settings: null,
  launchTimeoutMs: null,
  gateTimeoutMs: null,
  gate: CLAUDE_CODE_CLI_GATE_RULES,
});

export const CLAUDE_CODE_CLI_V2_IDENTITY: ProviderAdapterIdentity = frozen({ id: 'claude-code-cli', version: '2' });

/** `@2`'s own ceiling. The HTTP adapter's `MAX_OUTPUT_TOKENS` is not moved by it, and `@1` keeps that one. */
const V2_MAX_OUTPUT_TOKENS = 64000;

/**
 * `@2`: the desktop-managed 2.1.280 executable, the only local build that
 * knows `claude-opus-5-5`, run for included subscription usage only.
 *
 * The controls are `@1`'s nine with the ceiling raised to `@2`'s own, plus
 * no model fallback and no fast mode: either would change which model, or
 * which billing, answered without the stream having to say so. The
 * `--settings` text keeps `@1`'s `switchModelsOnFlag: false` and also turns
 * off fast mode and continuing automatically at the usage limit, which
 * 2.1.280 does by default. Whether `-p` mode honours those keys is not yet
 * observed, so none of this guarantees anything on its own: the projection
 * refuses what the stream shows.
 */
export const CLAUDE_CODE_CLI_V2_PROFILE = frozen({
  identity: CLAUDE_CODE_CLI_V2_IDENTITY,
  pin: {
    path: '~/Library/Application Support/Claude/claude-code/2.1.280/claude.app/Contents/MacOS/claude',
    version: '2.1.280',
    sha256: '862db5f39398606acd531777565505e14c792b9da72fd31df0b309b8eb55406e',
    sizeBytes: 217221744,
  },
  permittedModels: ['claude-opus-5-5'],
  effort: 'high',
  maxOutputTokens: V2_MAX_OUTPUT_TOKENS,
  controls: {
    ...LAUNCH_CONTROL_ENV,
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(V2_MAX_OUTPUT_TOKENS),
    CLAUDE_CODE_NO_MODEL_FALLBACK: '1',
    CLAUDE_CODE_DISABLE_FAST_MODE: '1',
  },
  settings: '{"switchModelsOnFlag":false,"fastMode":false,"autoContinueAtUsageLimit":false}',
  launchTimeoutMs: 1_800_000,
  gateTimeoutMs: 60_000,
  gate: CLAUDE_CODE_CLI_V2_GATE_RULES,
} satisfies CliProfile);

/** The invocation a profile makes, as the adapter declares it: read from the profile, never restated. */
function invocationOf(profile: CliProfile): InvocationIdentity {
  return frozen({
    effort: profile.effort,
    maxOutputTokens: profile.maxOutputTokens,
    executable: { version: profile.pin.version, sha256: profile.pin.sha256 },
  });
}

// ---------------------------------------------------------------------------
// The launch description and the transport's envelope
// ---------------------------------------------------------------------------

/**
 * What the adapter asks the transport to launch. Serialised as
 * `ProviderHttpRequest.body`, in this key order, and read back by the
 * transport with `parseCliLaunchSpec`.
 */
export interface CliLaunchSpec {
  model: string;
  systemPrompt: string;
  userMessage: string;
  jsonSchema: Record<string, unknown>;
  effort: 'high';
  /**
   * The `--settings` text, from the profile. `@1`'s spec never carries the
   * key, so its body is the one it always was and the transport's default
   * applies; `@2`'s always does, after `effort`.
   */
  settings?: string;
  /** The role and index the launch is for, last, so the transport can name the launch in its record without reading the prompt. */
  role: string;
  index: number;
}

const launchSpecSchema = z.object({
  model: z.string().min(1),
  systemPrompt: z.string(),
  userMessage: z.string(),
  jsonSchema: z.record(z.unknown()),
  effort: z.literal('high'),
  settings: z.string().optional(),
  role: z.string().min(1),
  index: z.number().int().nonnegative(),
}).strict();

/** The body handed to the transport is not a launch description this adapter wrote. */
export class CliLaunchSpecMalformedError extends Error {
  constructor(detail: string) {
    super(`the request body is not a CliLaunchSpec — ${detail}`);
    this.name = 'CliLaunchSpecMalformedError';
  }
}

export function parseCliLaunchSpec(body: string): CliLaunchSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new CliLaunchSpecMalformedError(`not JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  const result = launchSpecSchema.safeParse(parsed);
  if (!result.success) throw new CliLaunchSpecMalformedError(result.error.issues.map((issue) => `${issuePath(issue.path)}: ${issue.message}`).join('; '));
  return result.data;
}

/**
 * What the transport observed of one launch, as `ProviderHttpResponse.body`.
 * `stdout` is the child's complete standard output; `stderrBytes` is a count
 * only, because stderr may carry anything and is never projected.
 */
export interface CliEnvelope {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderrBytes: number;
}

const envelopeSchema = z.object({
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderrBytes: z.number().int().nonnegative(),
}).strict();

/** The body is not a transport envelope this adapter can read. */
export class CliEnvelopeMalformedError extends Error {
  constructor(detail: string) {
    super(`the transport's response body is not a CliEnvelope — ${detail}`);
    this.name = 'CliEnvelopeMalformedError';
  }
}

export function parseCliEnvelope(body: string): CliEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new CliEnvelopeMalformedError(`not JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  const result = envelopeSchema.safeParse(parsed);
  if (!result.success) throw new CliEnvelopeMalformedError(result.error.issues.map((issue) => `${issuePath(issue.path)}: ${issue.message}`).join('; '));
  return result.data;
}

function issuePath(path: (string | number)[]): string {
  if (path.length === 0) return '<root>';
  return path.map((segment, i) => (typeof segment === 'number' ? `[${segment}]` : i === 0 ? segment : `.${segment}`)).join('');
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

function label(request: RoleRequest): string {
  return `${request.role}[${request.index}]`;
}

/** A value as JSON, for a refusal; absence, which JSON cannot carry, is shown as `undefined`. */
function shown(value: unknown): string {
  return JSON.stringify(value) ?? 'undefined';
}

/** An API key was supplied to a route that authenticates by subscription. Refused, never discarded. */
export class ApiKeySuppliedToSubscriptionRouteError extends Error {
  constructor(request: RoleRequest) {
    super(`${label(request)}: an API key was supplied to the claude-code-cli adapter, which authenticates through the CLI's own subscription session and sends no key; a run that discarded it would leave two accounts of how it authenticated, so it is refused`);
    this.name = 'ApiKeySuppliedToSubscriptionRouteError';
  }
}

/** The child did not exit 0, or was ended by a signal. Nothing it wrote is a role result. */
export class CliExitError extends Error {
  constructor(request: RoleRequest, readonly exitCode: number | null, readonly signal: string | null, readonly stderrBytes: number) {
    super(`${label(request)}: the CLI child did not complete normally (exitCode ${exitCode === null ? 'null' : exitCode}, signal ${signal === null ? 'null' : signal}, ${stderrBytes} stderr bytes); its output is not a role result`);
    this.name = 'CliExitError';
  }
}

/** A stdout line is not one JSON object. */
export class CliStreamMalformedError extends Error {
  constructor(request: RoleRequest, readonly line: number, detail: string) {
    super(`${label(request)}: stream line ${line} is not a JSON object — ${detail}`);
    this.name = 'CliStreamMalformedError';
  }
}

/** The stream's events are not in an order this adapter can read. */
export class CliStreamLifecycleError extends Error {
  constructor(request: RoleRequest, readonly line: number | null, detail: string) {
    super(`${label(request)}: stream lifecycle at ${line === null ? 'end of stream' : `line ${line}`} — ${detail}`);
    this.name = 'CliStreamLifecycleError';
  }
}

/** The CLI's `init` event describes a launch other than the one requested. */
export class CliLaunchContextError extends Error {
  constructor(request: RoleRequest, detail: string) {
    super(`${label(request)}: the CLI's init event describes a launch this adapter did not request — ${detail}`);
    this.name = 'CliLaunchContextError';
  }
}

/** A model other than the requested one appears in the stream. */
export class CliModelMismatchError extends Error {
  constructor(request: RoleRequest, detail: string) {
    super(`${label(request)}: the stream names a model other than ${JSON.stringify(request.model)} — ${detail}`);
    this.name = 'CliModelMismatchError';
  }
}

/** The subscription was over its limit or into overage. A run that spent past the subscription is refused. */
export class CliOverageError extends Error {
  constructor(request: RoleRequest, detail: string) {
    super(`${label(request)}: the CLI reported a rate-limit state this route does not accept — ${detail}`);
    this.name = 'CliOverageError';
  }
}

/** No tool call was made at all. Whatever text the model produced is not a role result. */
export class CliNoStructuredOutputError extends Error {
  constructor(request: RoleRequest) {
    super(`${label(request)}: the stream carries no completed ${STRUCTURED_OUTPUT_TOOL} tool call; the model's answer, if any, did not arrive through the structured output and is not a role result`);
    this.name = 'CliNoStructuredOutputError';
  }
}

/**
 * A tool call other than `StructuredOutput` appears — as a block in the
 * stream, or as a `tool_use` item an assistant message restates. The launch
 * offered one tool; a call to any other is not this adapter's to read past,
 * and every call seen is listed so the refusal shows the whole picture.
 */
export class CliUnexpectedToolCallError extends Error {
  constructor(request: RoleRequest, where: 'the stream' | 'an assistant message', readonly calls: readonly { name: unknown; line: number }[]) {
    super(`${label(request)}: ${where} carries a tool call other than ${STRUCTURED_OUTPUT_TOOL} — ${calls.map((c) => `${JSON.stringify(c.name) ?? 'undefined'} at line ${c.line}`).join(', ')}; the launch offered exactly one tool, and only a single call to it is a role result`);
    this.name = 'CliUnexpectedToolCallError';
  }
}

/** More than one `StructuredOutput` call was made; which one is the answer is not this adapter's to decide. */
export class CliMultipleStructuredOutputError extends Error {
  constructor(request: RoleRequest, readonly count: number, readonly lines: readonly number[]) {
    super(`${label(request)}: the stream carries ${count} ${STRUCTURED_OUTPUT_TOOL} tool calls (started at lines ${lines.join(', ')}); exactly one is a role result and none of several is`);
    this.name = 'CliMultipleStructuredOutputError';
  }
}

/**
 * The one `StructuredOutput` call started without a usable id. Its
 * restatement and its `tool_result` are matched to it by id, so a call
 * without one cannot be matched at all — and must not be matched by name.
 */
export class CliToolCallIdError extends Error {
  constructor(request: RoleRequest, readonly line: number, detail: string) {
    super(`${label(request)}: the ${STRUCTURED_OUTPUT_TOOL} call started at line ${line} carries no usable id — ${detail}; the assistant's restatement and the tool_result are matched to the call by id, and a call without one cannot be matched`);
    this.name = 'CliToolCallIdError';
  }
}

/**
 * A message ended for a reason this adapter does not read as done. `@1` reads
 * only the message carrying the call and passes no position, so its message
 * is the one it always was; `@2` reads every message and names which one, by
 * the line it started at.
 */
export class CliStopReasonError extends Error {
  constructor(request: RoleRequest, readonly stopReason: unknown, where?: { readonly line: number; readonly carriesCall: boolean }) {
    super(
      where === undefined
        ? `${label(request)}: the message carrying the ${STRUCTURED_OUTPUT_TOOL} call ended with stop_reason ${JSON.stringify(stopReason)} rather than "tool_use"; its content is not a role result`
        : where.carriesCall
          ? `${label(request)}: the message started at line ${where.line}, which carries the ${STRUCTURED_OUTPUT_TOOL} call, ended with stop_reason ${shown(stopReason)} rather than "tool_use"; its content is not a role result`
          : `${label(request)}: the message started at line ${where.line}, which carries no ${STRUCTURED_OUTPUT_TOOL} call, ended with stop_reason ${shown(stopReason)} rather than "tool_use" or "end_turn"; the stream is not one this adapter reads as complete`,
    );
    this.name = 'CliStopReasonError';
  }
}

/** The CLI's `result` event does not report a clean success. */
export class CliResultError extends Error {
  constructor(request: RoleRequest, detail: string) {
    super(`${label(request)}: the CLI's result event does not report success — ${detail}`);
    this.name = 'CliResultError';
  }
}

/** The deltas, the assistant message and the result disagree about what the model said. */
export class CliOutputConflictError extends Error {
  constructor(request: RoleRequest, detail: string) {
    super(`${label(request)}: the structured output is not one consistent JSON object — ${detail}`);
    this.name = 'CliOutputConflictError';
  }
}

/**
 * The request names a model the profile is not for. Refused before a launch
 * is described: the pinned executable is proved against the models in the
 * list, and asking it for another would spend a launch to learn what it does.
 */
export class CliModelNotAllowedError extends Error {
  constructor(request: RoleRequest, readonly identity: ProviderAdapterIdentity, readonly permitted: readonly string[]) {
    super(`${label(request)}: model ${JSON.stringify(request.model)} is not permitted for ${identity.id}@${identity.version}, which permits [${permitted.map((m) => JSON.stringify(m)).join(', ')}]; nothing was launched`);
    this.name = 'CliModelNotAllowedError';
  }
}

/**
 * The output hit `@2`'s ceiling. Still a `ProviderOutputTruncatedError`, so
 * anything that recognises truncation recognises this, but its message names
 * the ceiling the launch actually ran under: the parent's names the HTTP
 * adapter's, which is not this route's.
 */
export class CliOutputTruncatedError extends ProviderOutputTruncatedError {
  constructor(request: RoleRequest) {
    super(request);
    this.message = `${label(request)}: the model's output stopped at max_tokens (${CLAUDE_CODE_CLI_V2_PROFILE.maxOutputTokens}); the partial content is not published as a role result`;
    this.name = 'CliOutputTruncatedError';
  }
}

/**
 * A rate-limit window was reported `rejected`: included usage is spent. One
 * such event anywhere is exhaustion, even when later events say `allowed` and
 * the result is a clean success, because that is what continuing past the
 * limit looks like. `rateLimitType` and `resetsAt` are carried as reported and
 * never validated, so whatever holds the next launch back can read when the
 * window said it would reset. A window inside `unifiedWindows` is named by
 * where it sits (review repair S2, a parent decision). It carries each fact
 * it reports itself, and the event's own otherwise, a null counting as no
 * report, so the hold has a time whenever the event reports one (review
 * repair U2, a parent decision).
 */
export class CliIncludedUsageExhaustedError extends Error {
  constructor(request: RoleRequest, readonly line: number, readonly rateLimitType: unknown, readonly resetsAt: unknown, readonly where: string | null = null) {
    super(`${label(request)}: included usage is exhausted — the rate_limit_event at line ${line} reports status "rejected"${where === null ? '' : ` at ${where}`} (rateLimitType ${shown(rateLimitType)}, resetsAt ${shown(resetsAt)}); one rejected window anywhere in the stream is refused, whatever follows it`);
    this.name = 'CliIncludedUsageExhaustedError';
  }
}

/** The CLI reported that the request needs usage credits or an answer to a consent prompt: a paid path this route never takes. */
export class CliCreditsRequiredError extends Error {
  constructor(request: RoleRequest, readonly kind: string, where: string, readonly line: number) {
    super(`${label(request)}: the CLI reported API error ${JSON.stringify(kind)} on ${where} at line ${line}; the request needs usage credits or consent, which this route never grants`);
    this.name = 'CliCreditsRequiredError';
  }
}

/** The stream reports the 1M-context route, which is paid. A `[1m]` model is never read as the requested one with a suffix. */
export class CliLongContextRouteError extends Error {
  constructor(request: RoleRequest, readonly signal: string, readonly line: number) {
    super(`${label(request)}: the stream reports the 1M-context route — ${signal} at line ${line}; that route is paid, and is never normalised to the requested model`);
    this.name = 'CliLongContextRouteError';
  }
}

/** A model other than the requested one answered, or the CLI said it fell back to one. The answer is not the requested model's. */
export class CliModelSubstitutionError extends Error {
  constructor(request: RoleRequest, readonly signal: string, readonly line: number) {
    super(`${label(request)}: the stream shows a model other than ${JSON.stringify(request.model)} answering, or a fallback to one — ${signal} at line ${line}; a substituted answer is not a role result`);
    this.name = 'CliModelSubstitutionError';
  }
}

/** The launch ran in fast mode, or reports a speed other than standard. The launch controls turn it off; a stream that shows it on is refused. */
export class CliFastModeError extends Error {
  constructor(request: RoleRequest, readonly signal: string, readonly line: number) {
    super(`${label(request)}: the stream reports fast mode — ${signal} at line ${line}; this route runs without fast mode, and a launch that ran in it is refused`);
    this.name = 'CliFastModeError';
  }
}

/** The server refused the requested effort. There is no answer at that effort to read. */
export class CliEffortRefusedError extends Error {
  constructor(request: RoleRequest, where: string, readonly line: number) {
    super(`${label(request)}: the CLI reported API error "effort_requires_thinking" on ${where} at line ${line}; the requested effort was refused, so no answer at that effort exists`);
    this.name = 'CliEffortRefusedError';
  }
}

/** The server refused the pinned executable as too old. Moving the pin is a new adapter version, not a retry. */
export class CliPinObsoleteError extends Error {
  constructor(request: RoleRequest, where: string, readonly line: number) {
    super(`${label(request)}: the CLI reported API error "claude_code_version_too_old" on ${where} at line ${line}; the server refuses the pinned executable, and moving the pin is a new adapter version, not a retry`);
    this.name = 'CliPinObsoleteError';
  }
}

/**
 * The stream does not show included usage in a state this adapter
 * recognises: no rate-limit event at all, or one carrying a field or value
 * outside the allowlist. What cannot be read is refused, never assumed
 * included.
 */
export class CliUsageUnobservedError extends Error {
  constructor(request: RoleRequest, detail: string) {
    super(`${label(request)}: the stream does not show included usage in a recognised state — ${detail}; usage this adapter cannot read is refused, never assumed included`);
    this.name = 'CliUsageUnobservedError';
  }
}

// ---------------------------------------------------------------------------
// buildRequest
// ---------------------------------------------------------------------------

/** The refusals every profile makes before describing a launch, and the two messages a launch carries. */
function roleMessages(request: RoleRequest, config: ProviderEndpointConfig): { systemPrompt: string; userMessage: string } {
  if (config.apiKey !== '') throw new ApiKeySuppliedToSubscriptionRouteError(request);
  const prompt = request.messages.filter((m) => m.from === 'prompt');
  const input = request.messages.filter((m) => m.from === 'input');
  const other = request.messages.filter((m) => m.from !== 'prompt' && m.from !== 'input');
  if (other.length > 0) {
    throw new Error(`${label(request)}: a role request carries only a prompt and an input; it also carries ${other.map((m) => m.from).join(', ')}`);
  }
  if (prompt.length !== 1 || input.length !== 1) {
    throw new Error(`${label(request)}: a role request carries exactly one prompt and one input message; found ${prompt.length} prompt and ${input.length} input`);
  }
  return { systemPrompt: prompt[0]!.content, userMessage: input[0]!.content };
}

function buildRequest(request: RoleRequest, config: ProviderEndpointConfig): ProviderHttpRequest {
  const { systemPrompt, userMessage } = roleMessages(request, config);
  const spec: CliLaunchSpec = {
    model: request.model,
    systemPrompt,
    userMessage,
    jsonSchema: roleOutputJsonSchema(request.role),
    effort: 'high',
    role: request.role,
    index: request.index,
  };
  return { url: CLI_LAUNCH_URL, method: 'SPAWN', headers: {}, body: JSON.stringify(spec) };
}

/**
 * `@2`'s launch description: `@1`'s refusals, then the model checked against
 * the profile before anything is described, then effort and `--settings`
 * from the profile, in the spec's fixed key order.
 */
function buildRequestV2(request: RoleRequest, config: ProviderEndpointConfig): ProviderHttpRequest {
  const profile = CLAUDE_CODE_CLI_V2_PROFILE;
  const { systemPrompt, userMessage } = roleMessages(request, config);
  if (!profile.permittedModels.includes(request.model)) throw new CliModelNotAllowedError(request, profile.identity, profile.permittedModels);
  const spec: CliLaunchSpec = {
    model: request.model,
    systemPrompt,
    userMessage,
    jsonSchema: roleOutputJsonSchema(request.role),
    effort: profile.effort,
    settings: profile.settings,
    role: request.role,
    index: request.index,
  };
  return { url: CLI_LAUNCH_URL, method: 'SPAWN', headers: {}, body: JSON.stringify(spec) };
}

// ---------------------------------------------------------------------------
// The stream: parsed lines, then the lifecycle walk
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface Line {
  /** 1-based position in stdout, blank lines counted. */
  line: number;
  event: Rec;
}

/** Every non-blank stdout line as one JSON object, or the first that is not. */
function parseStreamLines(stdout: string, request: RoleRequest): Line[] {
  const out: Line[] = [];
  const raw = stdout.split(/\r?\n/);
  for (let i = 0; i < raw.length; i += 1) {
    const text = raw[i]!;
    if (text.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new CliStreamMalformedError(request, i + 1, `not JSON (${error instanceof Error ? error.message : String(error)})`);
    }
    if (!isRecord(parsed)) throw new CliStreamMalformedError(request, i + 1, `parses as ${Array.isArray(parsed) ? 'an array' : parsed === null ? 'null' : `a ${typeof parsed}`}`);
    out.push({ line: i + 1, event: parsed });
  }
  return out;
}

interface Block {
  line: number;
  index: number;
  type: unknown;
  name: unknown;
  id: unknown;
  partialJson: string[];
  stopped: boolean;
  message: Message;
}

interface Message {
  line: number;
  model: unknown;
  stopReason: unknown;
  stopDetails: unknown;
  deltaSeen: boolean;
  stopped: boolean;
  /** Index -> block, for this message; blocks themselves also go to `Stream.blocks`. */
  byIndex: Map<number, Block>;
}

interface Stream {
  init: Line | null;
  messages: Message[];
  /** Every block ever started, in any message. */
  blocks: Block[];
  assistants: Line[];
  /** The CLI's own turns back to the model: where its tool loop reports each `tool_result`. */
  users: Line[];
  results: Line[];
  rateLimits: Line[];
  lastLine: number | null;
}

const TOP_LEVEL_TYPES = new Set(['system', 'stream_event', 'assistant', 'user', 'result', 'rate_limit_event']);

/** Which delta types may extend a block of each type. A block type outside this table takes no delta. */
const DELTAS_FOR_BLOCK: Readonly<Record<string, readonly string[]>> = {
  tool_use: ['input_json_delta'],
  text: ['text_delta'],
  thinking: ['thinking_delta', 'signature_delta'],
};

/**
 * Replays the whole stream through the lifecycle state machine and returns
 * the facts it collected. Refuses by position on the first event that is not
 * where it may be. Content is not examined here beyond what the lifecycle
 * needs (block and delta types, indices, the partial JSON text).
 */
function walkStream(lines: Line[], request: RoleRequest): Stream {
  const stream: Stream = { init: null, messages: [], blocks: [], assistants: [], users: [], results: [], rateLimits: [], lastLine: null };
  let open: Message | null = null;
  let openBlock: Block | null = null;

  const refuse = (line: number | null, detail: string): never => {
    throw new CliStreamLifecycleError(request, line, detail);
  };
  const indexOf = (line: number, event: Rec): number => {
    const index = event['index'];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) refuse(line, `${String(event['type'])} carries a non-integer index ${JSON.stringify(index)}`);
    return index as number;
  };

  for (const { line, event } of lines) {
    stream.lastLine = line;
    const type = event['type'];
    if (typeof type !== 'string' || !TOP_LEVEL_TYPES.has(type)) refuse(line, `unknown top-level event type ${JSON.stringify(type)}`);
    switch (type) {
      case 'system': {
        if (event['subtype'] === 'init') {
          if (stream.init !== null) refuse(line, `a second system init event (the first was line ${stream.init.line})`);
          stream.init = { line, event };
        }
        // Other system subtypes (status, …) are progress notes, ignored.
        break;
      }
      case 'assistant':
        stream.assistants.push({ line, event });
        break;
      case 'user':
        stream.users.push({ line, event });
        break;
      case 'result':
        stream.results.push({ line, event });
        break;
      case 'rate_limit_event':
        stream.rateLimits.push({ line, event });
        break;
      case 'stream_event': {
        const inner = event['event'];
        if (!isRecord(inner)) refuse(line, 'stream_event without an event object');
        const kind = (inner as Rec)['type'];
        switch (kind) {
          case 'ping':
            break;
          case 'message_start': {
            if (open !== null) refuse(line, `message_start while the message from line ${open.line} is open`);
            const message = (inner as Rec)['message'];
            open = { line, model: isRecord(message) ? message['model'] : undefined, stopReason: undefined, stopDetails: undefined, deltaSeen: false, stopped: false, byIndex: new Map() };
            break;
          }
          case 'content_block_start': {
            if (open === null) refuse(line, 'content_block_start outside an open message');
            const index = indexOf(line, inner as Rec);
            if (open!.byIndex.has(index)) refuse(line, `content_block_start reuses index ${index} within the message from line ${open!.line} (first started at line ${open!.byIndex.get(index)!.line})`);
            if (openBlock !== null) refuse(line, `content_block_start while block ${openBlock.index} (line ${openBlock.line}) is open`);
            const cb = (inner as Rec)['content_block'];
            const block: Block = {
              line,
              index,
              type: isRecord(cb) ? cb['type'] : undefined,
              name: isRecord(cb) ? cb['name'] : undefined,
              id: isRecord(cb) ? cb['id'] : undefined,
              partialJson: [],
              stopped: false,
              message: open!,
            };
            open!.byIndex.set(index, block);
            stream.blocks.push(block);
            openBlock = block;
            break;
          }
          case 'content_block_delta': {
            if (open === null) refuse(line, 'content_block_delta outside an open message');
            const index = indexOf(line, inner as Rec);
            const block = open!.byIndex.get(index);
            if (block === undefined) refuse(line, `content_block_delta for index ${index}, which was never started`);
            if (block!.stopped) refuse(line, `content_block_delta for index ${index} after its content_block_stop`);
            const delta = (inner as Rec)['delta'];
            const deltaType = isRecord(delta) ? delta['type'] : undefined;
            const allowed = typeof block!.type === 'string' ? DELTAS_FOR_BLOCK[block!.type] ?? [] : [];
            if (typeof deltaType !== 'string' || !allowed.includes(deltaType)) {
              refuse(line, `delta type ${JSON.stringify(deltaType)} does not match block type ${JSON.stringify(block!.type)} at index ${index}`);
            }
            if (deltaType === 'input_json_delta') {
              const partial = (delta as Rec)['partial_json'];
              if (typeof partial !== 'string') refuse(line, `input_json_delta at index ${index} carries a non-string partial_json`);
              block!.partialJson.push(partial as string);
            }
            break;
          }
          case 'content_block_stop': {
            if (open === null) refuse(line, 'content_block_stop outside an open message');
            const index = indexOf(line, inner as Rec);
            const block = open!.byIndex.get(index);
            if (block === undefined) refuse(line, `content_block_stop for index ${index}, which was never started`);
            if (block!.stopped) refuse(line, `duplicate content_block_stop for index ${index}`);
            block!.stopped = true;
            openBlock = null;
            break;
          }
          case 'message_delta': {
            if (open === null) refuse(line, 'message_delta outside an open message');
            if (open!.deltaSeen) refuse(line, `a second message_delta for the message from line ${open!.line}`);
            const delta = (inner as Rec)['delta'];
            open!.stopReason = isRecord(delta) ? delta['stop_reason'] : undefined;
            open!.stopDetails = isRecord(delta) ? delta['stop_details'] : undefined;
            open!.deltaSeen = true;
            break;
          }
          case 'message_stop': {
            if (open === null) refuse(line, 'message_stop outside an open message');
            if (!open!.deltaSeen) refuse(line, `message_stop without a message_delta for the message from line ${open!.line}`);
            if (openBlock !== null) refuse(line, `message_stop while block ${openBlock.index} (line ${openBlock.line}) is open`);
            open!.stopped = true;
            stream.messages.push(open!);
            open = null;
            break;
          }
          default:
            refuse(line, `unknown stream event type ${JSON.stringify(kind)}`);
        }
        break;
      }
      default:
        refuse(line, `unknown top-level event type ${JSON.stringify(type)}`);
    }
  }
  const unfinished: Message | null = open;
  if (unfinished !== null) refuse(null, `the stream ended while the message from line ${unfinished.line} is open`);
  if (stream.init === null) refuse(null, 'no system init event arrived');
  return stream;
}

// ---------------------------------------------------------------------------
// The checks, in order
// ---------------------------------------------------------------------------

function checkLaunchContext(init: Line, request: RoleRequest): void {
  const e = init.event;
  const problems: string[] = [];
  if (e['model'] !== request.model) problems.push(`model ${JSON.stringify(e['model'])}`);
  if (e['apiKeySource'] !== 'none') problems.push(`apiKeySource ${JSON.stringify(e['apiKeySource'])} (must be "none")`);
  const tools = e['tools'];
  if (!Array.isArray(tools) || tools.length !== 1 || tools[0] !== STRUCTURED_OUTPUT_TOOL) problems.push(`tools ${JSON.stringify(tools)} (must be exactly ["${STRUCTURED_OUTPUT_TOOL}"])`);
  const mcp = e['mcp_servers'];
  if (!Array.isArray(mcp) || mcp.length !== 0) problems.push(`mcp_servers ${JSON.stringify(mcp)} (must be empty)`);
  if (problems.length > 0) throw new CliLaunchContextError(request, `${problems.join('; ')} (init at line ${init.line})`);
}

function checkResult(stream: Stream, request: RoleRequest): Rec {
  if (stream.results.length === 0) throw new CliResultError(request, 'no result event arrived');
  if (stream.results.length > 1) throw new CliResultError(request, `${stream.results.length} result events (lines ${stream.results.map((r) => r.line).join(', ')})`);
  const result = stream.results[0]!;
  if (result.line !== stream.lastLine) throw new CliResultError(request, `the result at line ${result.line} is not the last event (line ${stream.lastLine})`);
  const e = result.event;
  if (e['subtype'] !== 'success') throw new CliResultError(request, `subtype ${JSON.stringify(e['subtype'])}`);
  if (e['is_error'] !== false) throw new CliResultError(request, `is_error ${JSON.stringify(e['is_error'])} (subtype "success" alone is not success)`);
  if (e['structured_output'] === undefined) throw new CliResultError(request, 'structured_output is absent');
  return e;
}

function checkOverage(stream: Stream, request: RoleRequest): void {
  for (const { line, event } of stream.rateLimits) {
    const info = event['rate_limit_info'];
    const fields = isRecord(info) ? info : {};
    if (fields['isUsingOverage'] === true) throw new CliOverageError(request, `isUsingOverage true at line ${line}`);
    if (fields['status'] === 'rejected') throw new CliOverageError(request, `status "rejected" at line ${line}`);
  }
}

function checkModels(stream: Stream, result: Rec, request: RoleRequest): void {
  for (const message of stream.messages) {
    if (message.model !== request.model) throw new CliModelMismatchError(request, `message_start at line ${message.line} names ${JSON.stringify(message.model)}`);
  }
  for (const { line, event } of stream.assistants) {
    const message = event['message'];
    const model = isRecord(message) ? message['model'] : undefined;
    if (model !== request.model) throw new CliModelMismatchError(request, `assistant message at line ${line} names ${JSON.stringify(model)}`);
  }
  const usage = result['modelUsage'];
  const keys = isRecord(usage) ? Object.keys(usage) : null;
  if (keys === null || keys.length !== 1 || keys[0] !== request.model) {
    throw new CliModelMismatchError(request, `result.modelUsage keys ${JSON.stringify(keys)} (must be exactly [${JSON.stringify(request.model)}])`);
  }
}

/** A block whose `id` has been proved a non-empty string: the only kind a restatement or a `tool_result` may be matched to. */
type ToolCall = Block & { id: string };

/** What was found in place of an id, for the refusal. `undefined` is absence: JSON cannot carry it. */
function describeMissingId(id: unknown): string {
  if (id === undefined) return 'the content_block has no id';
  if (id === null) return 'id is null';
  if (id === '') return 'id is the empty string';
  const kind = Array.isArray(id) ? 'an array' : typeof id === 'object' ? 'an object' : `a ${typeof id}`;
  return `id is ${kind} (${JSON.stringify(id)})`;
}

/**
 * The one tool call in the stream. Every `tool_use` block is counted whatever
 * it is named: a call to another tool is refused by name (listing every call),
 * not skipped, because a filter on the expected name is exactly how a `Bash`
 * call beside the answer would go unread. The single call's id is then proved
 * a non-empty string, because every later check matches to it by id and a
 * missing id must be a refusal, never a fall back to matching by name.
 */
function theStructuredOutputBlock(stream: Stream, request: RoleRequest): ToolCall {
  const calls = stream.blocks.filter((b) => b.type === 'tool_use');
  if (calls.length === 0) throw new CliNoStructuredOutputError(request);
  if (calls.some((b) => b.name !== STRUCTURED_OUTPUT_TOOL)) throw new CliUnexpectedToolCallError(request, 'the stream', calls.map((b) => ({ name: b.name, line: b.line })));
  if (calls.length > 1) throw new CliMultipleStructuredOutputError(request, calls.length, calls.map((b) => b.line));
  const call = calls[0]!;
  if (typeof call.id !== 'string' || call.id === '') throw new CliToolCallIdError(request, call.line, describeMissingId(call.id));
  return call as ToolCall;
}

/** The CLI's tool loop answered the call exactly once: one `tool_result`, across every `user` event, for this block's id. */
function checkToolLoop(block: ToolCall, stream: Stream, request: RoleRequest): void {
  const results: { line: number; id: unknown }[] = [];
  for (const { line, event } of stream.users) {
    const message = event['message'];
    const content = isRecord(message) ? message['content'] : undefined;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (isRecord(item) && item['type'] === 'tool_result') results.push({ line, id: item['tool_use_id'] });
    }
  }
  if (results.length === 0) throw new CliOutputConflictError(request, `no user event carries a tool_result for the ${STRUCTURED_OUTPUT_TOOL} call started at line ${block.line}; the CLI's tool loop runs exactly once`);
  if (results.length > 1) throw new CliOutputConflictError(request, `${results.length} tool_result items (lines ${results.map((r) => r.line).join(', ')}) answer the ${STRUCTURED_OUTPUT_TOOL} call started at line ${block.line}; the CLI's tool loop runs exactly once`);
  const only = results[0]!;
  if (only.id !== block.id) {
    throw new CliOutputConflictError(request, `the tool_result at line ${only.line} answers ${JSON.stringify(only.id) ?? 'undefined'}; the ${STRUCTURED_OUTPUT_TOOL} call started at line ${block.line} is ${JSON.stringify(block.id)}`);
  }
}

function checkStopReason(block: ToolCall, request: RoleRequest): void {
  const stop = block.message.stopReason;
  if (stop === 'max_tokens') throw new ProviderOutputTruncatedError(request);
  if (stop === 'refusal') {
    const details = isRecord(block.message.stopDetails) ? block.message.stopDetails : null;
    const category = details !== null && typeof details['category'] === 'string' ? (details['category'] as string) : null;
    const explanation = details !== null && typeof details['explanation'] === 'string' ? (details['explanation'] as string) : null;
    throw new ProviderRefusalError(request, category, explanation);
  }
  if (stop !== 'tool_use') throw new CliStopReasonError(request, stop);
}

/** JSON with object keys sorted at every level, so two readings of one value compare as strings. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checkOutput(block: ToolCall, stream: Stream, result: Rec, request: RoleRequest): string {
  const text = block.partialJson.join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CliOutputConflictError(request, `the concatenated partial_json does not parse as JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!isRecord(parsed)) throw new CliOutputConflictError(request, `the concatenated partial_json is not a JSON object`);
  const expected = canonical(parsed);

  // The assistant message restates the call with its parsed input. Every
  // tool_use item in every assistant message is read, not only the one that
  // matches: an item naming another tool is a call this adapter did not see
  // start; one naming the right tool under another id is a restatement of a
  // call the stream never made; a second item beside the first is a second
  // call. None is skipped, because skipping is how each would go unread.
  const stated: { line: number; id: unknown; name: unknown; input: unknown }[] = [];
  const perMessage = new Map<number, number>();
  for (const { line, event } of stream.assistants) {
    const message = event['message'];
    const content = isRecord(message) ? message['content'] : undefined;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!isRecord(item) || item['type'] !== 'tool_use') continue;
      stated.push({ line, id: item['id'], name: item['name'], input: item['input'] });
      perMessage.set(line, (perMessage.get(line) ?? 0) + 1);
    }
  }
  if (stated.some((s) => s.name !== STRUCTURED_OUTPUT_TOOL)) throw new CliUnexpectedToolCallError(request, 'an assistant message', stated.map(({ name, line }) => ({ name, line })));
  for (const [line, count] of perMessage) {
    if (count > 1) throw new CliOutputConflictError(request, `the assistant message at line ${line} carries ${count} tool_use items; the stream started one ${STRUCTURED_OUTPUT_TOOL} call`);
  }
  if (stated.length === 0) throw new CliOutputConflictError(request, `no assistant message restates the ${STRUCTURED_OUTPUT_TOOL} call started at line ${block.line}`);
  for (const { line, id } of stated) {
    if (id !== block.id) {
      throw new CliOutputConflictError(request, `the assistant message at line ${line} restates a ${STRUCTURED_OUTPUT_TOOL} call with id ${JSON.stringify(id) ?? 'undefined'}; the stream started ${JSON.stringify(block.id)}`);
    }
  }
  for (const { line, input } of stated) {
    if (canonical(input) !== expected) throw new CliOutputConflictError(request, `the assistant message at line ${line} states a tool_use.input that differs from the concatenated deltas`);
  }
  if (canonical(result['structured_output']) !== expected) throw new CliOutputConflictError(request, 'result.structured_output differs from the concatenated deltas');
  return text;
}

function projectResponse(body: string, request: RoleRequest): string {
  const envelope = parseCliEnvelope(body);
  if (envelope.exitCode !== 0 || envelope.signal !== null) throw new CliExitError(request, envelope.exitCode, envelope.signal, envelope.stderrBytes);
  const lines = parseStreamLines(envelope.stdout, request);
  const stream = walkStream(lines, request);
  checkLaunchContext(stream.init!, request);
  const result = checkResult(stream, request);
  checkOverage(stream, request);
  checkModels(stream, result, request);
  const block = theStructuredOutputBlock(stream, request);
  checkStopReason(block, request);
  checkToolLoop(block, stream, request);
  return checkOutput(block, stream, result, request);
}

// ---------------------------------------------------------------------------
// claude-code-cli@2: a tolerant parse, then classification by rule priority
// ---------------------------------------------------------------------------

/** The first stdout line that is not one JSON object, remembered rather than thrown. */
interface MalformedLine {
  line: number;
  detail: string;
}

/**
 * Every non-blank stdout line that is one JSON object, numbered exactly as
 * `parseStreamLines` numbers them, and the first line that is not. Nothing
 * is thrown here: a garbled line must not hide an overage fact on the line
 * before it, so the malformed line is refused only after classification.
 */
function parseStreamLinesTolerant(stdout: string): { lines: Line[]; malformed: MalformedLine | null } {
  const lines: Line[] = [];
  let malformed: MalformedLine | null = null;
  const raw = stdout.split(/\r?\n/);
  for (let i = 0; i < raw.length; i += 1) {
    const text = raw[i]!;
    if (text.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      malformed ??= { line: i + 1, detail: `not JSON (${error instanceof Error ? error.message : String(error)})` };
      continue;
    }
    if (!isRecord(parsed)) {
      malformed ??= { line: i + 1, detail: `parses as ${Array.isArray(parsed) ? 'an array' : parsed === null ? 'null' : `a ${typeof parsed}`}` };
      continue;
    }
    lines.push({ line: i + 1, event: parsed });
  }
  return { lines, malformed };
}

/** A classified fact: the refusal it is, and the line it was read from. */
interface Hit {
  line: number;
  error: Error;
}

/** One classification rule: the first line (in stream order) carrying its fact, or `null`. */
type Rule = (lines: readonly Line[], request: RoleRequest) => Hit | null;

function firstHit(lines: readonly Line[], find: (event: Rec, line: number) => Error | null): Hit | null {
  for (const { line, event } of lines) {
    const error = find(event, line);
    if (error !== null) return { line, error };
  }
  return null;
}

/** The Messages stream event a `stream_event` line carries, or `null`. */
function streamEventOf(event: Rec): Rec | null {
  return event['type'] === 'stream_event' && isRecord(event['event']) ? event['event'] : null;
}

/** The message an `assistant` line carries, or `null`. */
function assistantMessageOf(event: Rec): Rec | null {
  return event['type'] === 'assistant' && isRecord(event['message']) ? event['message'] : null;
}

const isSystem = (event: Rec, subtype: string): boolean => event['type'] === 'system' && event['subtype'] === subtype;

/** An assistant item the CLI wrote itself to report an API error (model `<synthetic>`): an error, never a model's answer. */
const isApiErrorItem = (event: Rec): boolean => event['type'] === 'assistant' && event['is_api_error_message'] === true;

/**
 * The top-level fields an API-error kind may sit in, in the order they are
 * read: the auth-failed probe's `error`, 2.1.280's constructor's `apiError`,
 * and `api_error`, snake_case as the stream serialises `is_api_error_message`
 * and `api_error_status` (review repair S7, a parent decision).
 */
const API_ERROR_KIND_FIELDS = ['error', 'apiError', 'api_error'] as const;

/**
 * Where a line reports an API error, and every kind it may carry: the one
 * reading of a kind that the credit, substitution, refusal and other-kind
 * rules share. The auth-failed probe carries a coarse category as the
 * assistant item's top-level string `error` ("authentication_failed");
 * 2.1.280's constructor names the kind `apiError`; the stream's own spelling
 * would be `api_error`. An item may carry more than one, so each string in
 * any of the three fields is a candidate (`error`'s first), and each rule
 * tests every candidate against its own kinds: a kind in one field is never
 * hidden by a coarse value in another (review repair R2, a parent decision:
 * the plan names the kinds, not the fields that carry them). Anything but a
 * string is no candidate. Which spelling 2.1.280 uses is a question for the
 * probe on both carriers — the assistant item as much as the system
 * `api_error` event, whose shape has not been observed at all (review repair
 * S7, a parent decision, added `api_error`). No other event may carry any
 * of the three fields: the walk refuses them there (review repair U3, a
 * parent decision).
 */
function apiErrorOf(event: Rec): { where: string; kinds: string[] } | null {
  let where: string;
  if (isApiErrorItem(event)) where = 'an assistant API-error item';
  else if (isSystem(event, 'api_error')) where = 'a system api_error event';
  else return null;
  const kinds = API_ERROR_KIND_FIELDS.map((field) => event[field]).filter((value): value is string => typeof value === 'string');
  return { where, kinds };
}

/** The first of a line's API-error candidates that is one of `kinds`, and where the line reports it. */
const hasKind = (event: Rec, kinds: ReadonlySet<string>): { where: string; kind: string } | null => {
  const api = apiErrorOf(event);
  const kind = api?.kinds.find((candidate) => kinds.has(candidate));
  return api === null || kind === undefined ? null : { where: api.where, kind };
};

const CREDIT_KINDS: ReadonlySet<string> = new Set(['model_requires_usage_credits', 'long_context_credits_required', 'consent_unanswered']);
const SUBSTITUTION_KINDS: ReadonlySet<string> = new Set(['model_substitution_disabled', 'no_allowed_fallback']);
const SUBSTITUTION_SUBTYPES: ReadonlySet<string> = new Set(['model_fallback', 'model_refusal_fallback', 'model_consent_fallback']);
const REFUSAL_KINDS: ReadonlySet<string> = new Set(['safety_monitor_blocked']);
const EFFORT_KINDS: ReadonlySet<string> = new Set(['effort_requires_thinking']);
const PIN_KINDS: ReadonlySet<string> = new Set(['claude_code_version_too_old']);
const FAST_MODE_STATES: ReadonlySet<unknown> = new Set(['on', 'cooldown']);

/** A model the stream reports, where, and whether it is on an API-error item (whose `<synthetic>` model is not a substitution). */
interface ReportedModel {
  where: string;
  model: unknown;
  onApiError: boolean;
}

/**
 * Every model a line reports: the init model, the `message_start` model, an
 * assistant item's model, and each `result.modelUsage` key with its
 * `canonicalModel` when present. An absent model at the first three is
 * reported as `undefined`, because each of those events states the model
 * that answered and silence there is not the requested model.
 */
function reportedModels(event: Rec): ReportedModel[] {
  const out: ReportedModel[] = [];
  if (isSystem(event, 'init')) out.push({ where: 'init.model', model: event['model'], onApiError: false });
  const inner = streamEventOf(event);
  if (inner !== null && inner['type'] === 'message_start') out.push({ where: 'message_start message.model', model: isRecord(inner['message']) ? inner['message']['model'] : undefined, onApiError: false });
  if (event['type'] === 'assistant') out.push({ where: 'assistant message.model', model: isRecord(event['message']) ? event['message']['model'] : undefined, onApiError: isApiErrorItem(event) });
  const usage = event['type'] === 'result' ? event['modelUsage'] : undefined;
  if (isRecord(usage)) {
    for (const [key, entry] of Object.entries(usage)) {
      out.push({ where: 'result.modelUsage key', model: key, onApiError: false });
      if (isRecord(entry) && Object.hasOwn(entry, 'canonicalModel')) out.push({ where: `result.modelUsage[${JSON.stringify(key)}].canonicalModel`, model: entry['canonicalModel'], onApiError: false });
    }
  }
  return out;
}

/** Every usage object a line reports, and where: the result's, an assistant item's, and `message_start`'s and `message_delta`'s. */
function usagesOf(event: Rec): { where: string; usage: Rec }[] {
  const out: { where: string; usage: Rec }[] = [];
  if (event['type'] === 'result' && isRecord(event['usage'])) out.push({ where: 'result usage', usage: event['usage'] });
  const message = assistantMessageOf(event);
  if (message !== null && isRecord(message['usage'])) out.push({ where: 'assistant message.usage', usage: message['usage'] });
  const inner = streamEventOf(event);
  if (inner !== null && inner['type'] === 'message_start' && isRecord(inner['message']) && isRecord(inner['message']['usage'])) out.push({ where: 'message_start message.usage', usage: inner['message']['usage'] });
  if (inner !== null && inner['type'] === 'message_delta' && isRecord(inner['usage'])) out.push({ where: 'message_delta usage', usage: inner['usage'] });
  return out;
}

/**
 * A line's stop reason and its details, wherever a message's end is
 * reported: a `message_delta`, an assistant item's message, or the result.
 * The assistant item is read too because D-7 says "in any message", taken
 * literally: a refusal or `max_tokens` the CLI states only in its
 * restatement is still classified. This goes beyond a reading of
 * `message_delta` and the result alone, and is recorded as such.
 */
function stopOf(event: Rec): { where: string; reason: unknown; details: unknown } | null {
  const inner = streamEventOf(event);
  if (inner !== null && inner['type'] === 'message_delta' && isRecord(inner['delta'])) return { where: 'message_delta', reason: inner['delta']['stop_reason'], details: inner['delta']['stop_details'] };
  const message = assistantMessageOf(event);
  if (message !== null) return { where: 'assistant message', reason: message['stop_reason'], details: message['stop_details'] };
  if (event['type'] === 'result') return { where: 'result', reason: event['stop_reason'], details: event['stop_details'] };
  return null;
}

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * Every `rate_limit_event` line. Each is classified, not only the latest: a
 * window reported `rejected` is not undone by a later one reported `allowed`.
 */
function rateLimitLines(lines: readonly Line[]): Line[] {
  return lines.filter(({ event }) => event['type'] === 'rate_limit_event');
}

const rateLimitInfoOf = (event: Rec): Rec | null => (isRecord(event['rate_limit_info']) ? event['rate_limit_info'] : null);

/** The entries of a `unifiedWindows` value and the path each is named by, or `null` when it is neither an array nor an object. */
function windowEntries(windows: unknown): [string, unknown][] | null {
  if (Array.isArray(windows)) return windows.map((w, i): [string, unknown] => [`[${i}]`, w]);
  if (isRecord(windows)) return Object.entries(windows).map(([k, w]): [string, unknown] => [`[${JSON.stringify(k)}]`, w]);
  return null;
}

/** Every object in a value, at any depth, through arrays and objects alike, each with where it sits; the value itself first. */
function objectsIn(value: unknown, where: string): { where: string; object: Rec }[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => objectsIn(item, `${where}[${i}]`));
  if (!isRecord(value)) return [];
  return [
    { where, object: value },
    ...Object.entries(value).flatMap(([key, inner]) => objectsIn(inner, /^[A-Za-z_$][\w$]*$/.test(key) ? `${where}.${key}` : `${where}[${JSON.stringify(key)}]`)),
  ];
}

/**
 * Every object inside a `rate_limit_info`'s `unifiedWindows`, at any depth,
 * and where it sits. D-6's per-field rules are applied to each, the
 * classification rules as surely as the allowlist: no probe has shown a
 * window's shape, so a field one level down is read as surely as one on the
 * entry itself, and every rule applied inside a window is a probe question
 * (review repair S2, a parent decision under D-8's "Unknown means refused").
 */
function windowObjectsOf(info: Rec): { where: string; object: Rec }[] {
  return (windowEntries(info['unifiedWindows']) ?? []).flatMap(([key, window]) => objectsIn(window, `unifiedWindows${key}`));
}

/** The overage facts D-6 names, on one object: a `rate_limit_info` itself (no prefix), or an object inside its `unifiedWindows` (prefixed with its path). */
function overageFacts(info: Rec, prefix: string): string[] {
  const facts: string[] = [];
  if (info['rateLimitType'] === 'overage') facts.push(`${prefix}rateLimitType "overage"`);
  if (info['isUsingOverage'] === true) facts.push(`${prefix}isUsingOverage true`);
  if (info['overageInUse'] === true) facts.push(`${prefix}overageInUse true`);
  if (info['overageStatus'] === 'allowed' || info['overageStatus'] === 'allowed_warning') facts.push(`${prefix}overageStatus ${shown(info['overageStatus'])}`);
  return facts;
}

/** 1. Overage: any overage fact D-6 names, on any rate-limit event, and on any object inside its `unifiedWindows` (review repair S2, a parent decision). */
const overageRule: Rule = (lines, request) => firstHit(rateLimitLines(lines), (event, line) => {
  const info = rateLimitInfoOf(event);
  if (info === null) return null;
  const facts = [...overageFacts(info, ''), ...windowObjectsOf(info).flatMap(({ where, object }) => overageFacts(object, `${where}.`))];
  return facts.length === 0 ? null : new CliOverageError(request, `the rate_limit_event at line ${line} reports overage: ${facts.join(', ')}`);
});

/**
 * 2. Exhaustion: any window reported `rejected`, anywhere — the event's own
 * status, or a status inside its `unifiedWindows`, named by its path (review
 * repair S2, a parent decision). A window's `rateLimitType` and `resetsAt`
 * are its own where it reports them, and the event's otherwise, a null
 * counting as no report: the reset-pending hold then has a time whenever the
 * event reports one (review repair U2, a parent decision). Where a window
 * reports its reset, if it does, is a probe question.
 */
const exhaustionRule: Rule = (lines, request) => firstHit(rateLimitLines(lines), (event, line) => {
  const info = rateLimitInfoOf(event);
  if (info === null) return null;
  if (info['status'] === 'rejected') return new CliIncludedUsageExhaustedError(request, line, info['rateLimitType'], info['resetsAt']);
  const window = windowObjectsOf(info).find(({ object }) => object['status'] === 'rejected');
  if (window === undefined) return null;
  // A known limitation of U2's fallback: a rejected window that names its own type only by its key
  // (unifiedWindows["seven_day"]) or by a `window` field, and reports no rateLimitType or resetsAt of its own, borrows
  // the event's, so the refusal can carry another window's type and reset time (the path it names is still the
  // window's own). Whether a window ever reports its type or reset only that way is a probe question.
  const reported = (key: string): unknown => window.object[key] ?? info[key];
  return new CliIncludedUsageExhaustedError(request, line, reported('rateLimitType'), reported('resetsAt'), `${window.where}.status`);
});

/** 3. Credits: an API-error kind that asks for usage credits or consent. */
const creditsRule: Rule = (lines, request) => firstHit(lines, (event, line) => {
  const api = hasKind(event, CREDIT_KINDS);
  return api === null ? null : new CliCreditsRequiredError(request, api.kind, api.where, line);
});

/** 4. The long-context route: a `[1m]` model anywhere a model is reported, or a context-1M beta at init. */
const longContextRule: Rule = (lines, request) => firstHit(lines, (event, line) => {
  for (const { where, model } of reportedModels(event)) {
    if (typeof model === 'string' && /\[1m\]$/i.test(model)) return new CliLongContextRouteError(request, `${where} ${JSON.stringify(model)}`, line);
  }
  const betas = isSystem(event, 'init') ? event['betas'] : undefined;
  if (Array.isArray(betas)) {
    for (const beta of betas) {
      if (typeof beta === 'string' && /context-1m/i.test(beta)) return new CliLongContextRouteError(request, `init.betas entry ${JSON.stringify(beta)}`, line);
    }
  }
  return null;
});

/** 5. Substitution: a fallback block or item, a fallback subtype or kind, or any reported model but the requested one. */
const substitutionRule: Rule = (lines, request) => firstHit(lines, (event, line) => {
  const substituted = (signal: string): Error => new CliModelSubstitutionError(request, signal, line);
  const inner = streamEventOf(event);
  if (inner !== null && inner['type'] === 'content_block_start' && isRecord(inner['content_block']) && inner['content_block']['type'] === 'fallback') return substituted('a content_block_start of type "fallback"');
  const content = assistantMessageOf(event)?.['content'];
  if (Array.isArray(content) && content.some((item) => isRecord(item) && item['type'] === 'fallback')) return substituted('an assistant content item of type "fallback"');
  if (event['type'] === 'system' && typeof event['subtype'] === 'string' && SUBSTITUTION_SUBTYPES.has(event['subtype'])) return substituted(`a system event of subtype ${JSON.stringify(event['subtype'])}`);
  const api = hasKind(event, SUBSTITUTION_KINDS);
  if (api !== null) return substituted(`API error ${JSON.stringify(api.kind)} on ${api.where}`);
  for (const { where, model, onApiError } of reportedModels(event)) {
    // D-7's wording: every flagged API-error item is skipped, whatever model it names. checkResultV2's refusal of an
    // API-error item beside a success is what makes that safe; the exit check refuses it otherwise.
    if (!onApiError && model !== request.model) return substituted(`${where} ${shown(model)}`);
  }
  return null;
});

/**
 * 6. Refusal: `stop_reason: refusal` anywhere a message ends,
 * `model_refusal_no_fallback`, or a safety-monitor block. Category and
 * explanation as reported. For the last two they are read from
 * `apiRefusalCategory` and `apiRefusalExplanation`, names taken from
 * 2.1.280's strings; no stream has shown them, so where the CLI really puts
 * them is a probe question.
 */
const refusalRule: Rule = (lines, request) => firstHit(lines, (event) => {
  const stop = stopOf(event);
  if (stop !== null && stop.reason === 'refusal') {
    const details = isRecord(stop.details) ? stop.details : {};
    return new ProviderRefusalError(request, stringOrNull(details['category']), stringOrNull(details['explanation']));
  }
  if (isSystem(event, 'model_refusal_no_fallback') || hasKind(event, REFUSAL_KINDS) !== null) {
    return new ProviderRefusalError(request, stringOrNull(event['apiRefusalCategory']), stringOrNull(event['apiRefusalExplanation']));
  }
  return null;
});

/** 7. Truncation: `max_tokens` anywhere a message ends, refused under `@2`'s own ceiling. */
const truncationRule: Rule = (lines, request) => firstHit(lines, (event) => (stopOf(event)?.reason === 'max_tokens' ? new CliOutputTruncatedError(request) : null));

/** 8. Fast mode: `on` or `cooldown` at init or at the result, or any reported speed but standard. */
const fastModeRule: Rule = (lines, request) => firstHit(lines, (event, line) => {
  const fast = (signal: string): Error => new CliFastModeError(request, signal, line);
  if (isSystem(event, 'init') && FAST_MODE_STATES.has(event['fast_mode_state'])) return fast(`init fast_mode_state ${shown(event['fast_mode_state'])}`);
  if (event['type'] === 'result' && FAST_MODE_STATES.has(event['fast_mode_state'])) return fast(`result fast_mode_state ${shown(event['fast_mode_state'])}`);
  for (const { where, usage } of usagesOf(event)) {
    const speed = usage['speed'];
    if (speed === undefined || speed === 'standard') continue;
    // `null` is the auth-failed probe's placeholder on its API-error item (whose result says "standard"): unreported
    // there, so no speed. Anywhere else it is a speed nobody reported as standard, and refused like any other
    // (review repair R1, a parent decision under D-8's "Unknown means refused": the only null observed is on that item).
    if (speed === null && isApiErrorItem(event)) continue;
    return fast(`${where}.speed ${shown(speed)}`);
  }
  return null;
});

/** 9. The other API-error kinds this adapter names. */
const otherKindRule: Rule = (lines, request) => firstHit(lines, (event, line) => {
  const effort = hasKind(event, EFFORT_KINDS);
  if (effort !== null) return new CliEffortRefusedError(request, effort.where, line);
  const pin = hasKind(event, PIN_KINDS);
  if (pin !== null) return new CliPinObsoleteError(request, pin.where, line);
  return null;
});

/** D-7's rules, in priority order: the costliest fact first. */
const CLASSIFICATION_RULES: readonly Rule[] = [overageRule, exhaustionRule, creditsRule, longContextRule, substitutionRule, refusalRule, truncationRule, fastModeRule, otherKindRule];

/**
 * Refuses the stream by the highest-priority rule any line satisfies — not
 * by whichever fact comes first in the stream — naming the first line that
 * satisfies it. Runs before the exit check: an exhausted window at exit 1 is
 * exhaustion, not a failed launch.
 */
function classify(lines: readonly Line[], request: RoleRequest): void {
  for (const rule of CLASSIFICATION_RULES) {
    const hit = rule(lines, request);
    if (hit !== null) throw hit.error;
  }
}

// ---------------------------------------------------------------------------
// claude-code-cli@2: strictness after classification
// ---------------------------------------------------------------------------

/** The system subtypes observed in real streams. Classified subtypes never reach the walk; everything else is refused. */
const V2_SYSTEM_SUBTYPES: ReadonlySet<unknown> = new Set(['init', 'status', 'thinking_tokens']);
/** The block types, and assistant item types, this adapter reads. */
const V2_BLOCK_TYPES: ReadonlySet<unknown> = new Set(['text', 'thinking', 'redacted_thinking', 'tool_use']);
/** Which delta types may extend a block of each type; `redacted_thinking` takes none. */
const V2_DELTAS_FOR_BLOCK: Readonly<Record<string, readonly string[]>> = {
  tool_use: ['input_json_delta'],
  text: ['text_delta'],
  thinking: ['thinking_delta', 'signature_delta'],
  redacted_thinking: [],
};
/** The stop reasons an assistant item (not an API-error item) may state: null while its message streams, or an ended turn (review repair S1, a parent decision). */
const V2_ITEM_STOP_REASONS: ReadonlySet<unknown> = new Set([null, 'tool_use', 'end_turn']);
/** The stop reasons the result may state (review repair S1, a parent decision). */
const V2_RESULT_STOP_REASONS: ReadonlySet<unknown> = new Set(['tool_use', 'end_turn']);

/**
 * `@1`'s lifecycle walk, with allowlists: a system subtype, a block type, a
 * delta type or an assistant item type this adapter does not know is refused
 * by position, not ignored, because `@1` ignoring them is how a new event
 * would go unread.
 */
function walkStreamV2(lines: Line[], request: RoleRequest): Stream {
  const stream: Stream = { init: null, messages: [], blocks: [], assistants: [], users: [], results: [], rateLimits: [], lastLine: null };
  let open: Message | null = null;
  let openBlock: Block | null = null;

  const refuse = (line: number | null, detail: string): never => {
    throw new CliStreamLifecycleError(request, line, detail);
  };
  const indexOf = (line: number, event: Rec): number => {
    const index = event['index'];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) refuse(line, `${String(event['type'])} carries a non-integer index ${JSON.stringify(index)}`);
    return index as number;
  };

  for (const { line, event } of lines) {
    stream.lastLine = line;
    const type = event['type'];
    if (typeof type !== 'string' || !TOP_LEVEL_TYPES.has(type)) refuse(line, `unknown top-level event type ${JSON.stringify(type)}`);
    // An API-error kind is read on a flagged assistant item and on a system api_error event, and nowhere else. Any other
    // event carrying an error, apiError or api_error key, whatever its value, is read neither as an API error nor as a
    // success or a model's answer, so it is refused here: a result, a user turn, a stream event, a rate-limit event, a
    // system note, or an assistant item without the flag (review repair U3, a parent decision under D-8's "Unknown means
    // refused", generalising S6, which refused only a string on an unflagged assistant item; whether 2.1.280 ever
    // writes one of these keys elsewhere is a probe question).
    if (!isApiErrorItem(event) && !isSystem(event, 'api_error')) {
      const field = API_ERROR_KIND_FIELDS.find((key) => Object.hasOwn(event, key));
      if (field !== undefined) {
        const carrier = String(type).endsWith('_event') ? `a ${String(type)}` : `a ${String(type)} event`;
        refuse(line, type === 'assistant'
          ? `an assistant event carrying ${field} ${shown(event[field])} without is_api_error_message true, which this adapter reads neither as an API error nor as a model's answer`
          : `${carrier} carrying ${field} ${shown(event[field])}, which only a flagged assistant API-error item or a system api_error event may carry; this adapter reads it neither as an API error nor as a success`);
      }
    }
    switch (type) {
      case 'system': {
        const subtype = event['subtype'];
        if (!V2_SYSTEM_SUBTYPES.has(subtype)) refuse(line, `system subtype ${shown(subtype)} is not one this adapter reads (init, status, thinking_tokens)`);
        // "requesting" is the only status either probe showed. Another, such as "compacting" (context compaction:
        // another model request nothing counted), or none at all, is refused; which values 2.1.280 emits is a probe
        // question (review repair R5, a parent decision under D-8's "Unknown means refused").
        if (subtype === 'status' && event['status'] !== 'requesting') refuse(line, `a system status event with status ${shown(event['status'])}, which this adapter does not read ("requesting")`);
        if (subtype === 'init') {
          if (stream.init !== null) refuse(line, `a second system init event (the first was line ${stream.init.line})`);
          stream.init = { line, event };
        }
        break;
      }
      case 'assistant': {
        // A kind is classified only on an item flagged is_api_error_message. An item carrying one without the flag was
        // refused above, before this case (review repair S6, a parent decision, generalised by U3).
        const message = event['message'];
        const content = isRecord(message) ? message['content'] : undefined;
        // Beyond D-8, and needed to apply its item allowlist: an item list that is not there cannot be read as allowed.
        if (!Array.isArray(content)) refuse(line, `an assistant event without a content array`);
        for (const item of content as unknown[]) {
          const itemType = isRecord(item) ? item['type'] : undefined;
          if (!V2_BLOCK_TYPES.has(itemType)) refuse(line, `an assistant content item of type ${shown(itemType)}, which this adapter does not read (text, thinking, redacted_thinking, tool_use)`);
        }
        // An item list with no item at all carries nothing this adapter reads, as S3 decided for user events (review
        // repair U6, a parent decision under D-8's "Unknown means refused"; whether 2.1.280 ever writes an assistant
        // event with an empty content array is a probe question).
        if ((content as unknown[]).length === 0) refuse(line, 'an assistant event whose message.content is an empty array, which carries no item');
        // The accepted probe's item states null. "refusal" and "max_tokens" were classified before the walk; anything
        // else, such as "pause_turn", or no stop reason at all, is refused. A flagged API-error item is exempt: its
        // "stop_sequence" is the auth-failed probe's own, and the result step refuses the item (review repair S1, a
        // parent decision under D-8's "Unknown means refused"; which values 2.1.280 states here is a probe question).
        // The allowlist refuses "refusal" and "max_tokens" too, so a defect in rule 6 or 7's reading of an item shows
        // here as CliStreamLifecycleError rather than as an acceptance: the overlap fails closed, as R14 and S5 record.
        const stopReason = (message as Rec)['stop_reason'];
        if (!isApiErrorItem(event) && !V2_ITEM_STOP_REASONS.has(stopReason)) refuse(line, `an assistant event whose message.stop_reason is ${shown(stopReason)}, which this adapter does not read (null, "tool_use", "end_turn")`);
        stream.assistants.push({ line, event });
        break;
      }
      case 'user': {
        // The CLI's own turns back to the model carry its tool loop's tool_result items and nothing else. A text item
        // (an injected "continue", say, which is what continuing past the usage limit would look like under 2.1.280's
        // autoContinueAtUsageLimit default) or content that is not an item list is refused (review repair R6, a parent
        // decision under D-8's "Unknown means refused"; D-6 records the autoContinue risk). The list is an allowlist
        // of one type, not a denylist of text: an image, a bare string, any item but a tool_result is refused (review
        // repair S4, a parent decision), and so is a list with no item at all, which carries no tool_result (review
        // repair S3, a parent decision).
        const message = event['message'];
        const content = isRecord(message) ? message['content'] : undefined;
        if (!Array.isArray(content)) {
          const found = content === undefined ? 'absent' : content === null ? 'null' : isRecord(content) ? 'an object' : `a ${typeof content}`;
          refuse(line, `a user event whose message.content is ${found}, not an array of tool_result items`);
        }
        for (const item of content as unknown[]) {
          const itemType = isRecord(item) ? item['type'] : undefined;
          if (itemType !== 'tool_result') refuse(line, `a user content item of type ${shown(itemType)}, which this adapter does not read (tool_result)`);
        }
        // S3's refusal. Whether 2.1.280 ever writes a user event with an empty content array is a probe question.
        if ((content as unknown[]).length === 0) refuse(line, 'a user event whose message.content is an empty array, which carries no tool_result item');
        stream.users.push({ line, event });
        break;
      }
      case 'result':
        stream.results.push({ line, event });
        break;
      case 'rate_limit_event':
        stream.rateLimits.push({ line, event });
        break;
      case 'stream_event': {
        const inner = event['event'];
        if (!isRecord(inner)) refuse(line, 'stream_event without an event object');
        const kind = (inner as Rec)['type'];
        switch (kind) {
          case 'ping':
            break;
          case 'message_start': {
            if (open !== null) refuse(line, `message_start while the message from line ${open.line} is open`);
            const message = (inner as Rec)['message'];
            open = { line, model: isRecord(message) ? message['model'] : undefined, stopReason: undefined, stopDetails: undefined, deltaSeen: false, stopped: false, byIndex: new Map() };
            break;
          }
          case 'content_block_start': {
            if (open === null) refuse(line, 'content_block_start outside an open message');
            const index = indexOf(line, inner as Rec);
            if (open!.byIndex.has(index)) refuse(line, `content_block_start reuses index ${index} within the message from line ${open!.line} (first started at line ${open!.byIndex.get(index)!.line})`);
            if (openBlock !== null) refuse(line, `content_block_start while block ${openBlock.index} (line ${openBlock.line}) is open`);
            const cb = (inner as Rec)['content_block'];
            const blockType = isRecord(cb) ? cb['type'] : undefined;
            if (!V2_BLOCK_TYPES.has(blockType)) refuse(line, `a content_block_start of type ${shown(blockType)}, which this adapter does not read (text, thinking, redacted_thinking, tool_use)`);
            const block: Block = {
              line,
              index,
              type: blockType,
              name: isRecord(cb) ? cb['name'] : undefined,
              id: isRecord(cb) ? cb['id'] : undefined,
              partialJson: [],
              stopped: false,
              message: open!,
            };
            open!.byIndex.set(index, block);
            stream.blocks.push(block);
            openBlock = block;
            break;
          }
          case 'content_block_delta': {
            if (open === null) refuse(line, 'content_block_delta outside an open message');
            const index = indexOf(line, inner as Rec);
            const block = open!.byIndex.get(index);
            if (block === undefined) refuse(line, `content_block_delta for index ${index}, which was never started`);
            if (block!.stopped) refuse(line, `content_block_delta for index ${index} after its content_block_stop`);
            const delta = (inner as Rec)['delta'];
            const deltaType = isRecord(delta) ? delta['type'] : undefined;
            const allowed = typeof block!.type === 'string' ? V2_DELTAS_FOR_BLOCK[block!.type] ?? [] : [];
            if (typeof deltaType !== 'string' || !allowed.includes(deltaType)) {
              refuse(line, `delta type ${JSON.stringify(deltaType)} does not match block type ${JSON.stringify(block!.type)} at index ${index}`);
            }
            if (deltaType === 'input_json_delta') {
              const partial = (delta as Rec)['partial_json'];
              if (typeof partial !== 'string') refuse(line, `input_json_delta at index ${index} carries a non-string partial_json`);
              block!.partialJson.push(partial as string);
            }
            break;
          }
          case 'content_block_stop': {
            if (open === null) refuse(line, 'content_block_stop outside an open message');
            const index = indexOf(line, inner as Rec);
            const block = open!.byIndex.get(index);
            if (block === undefined) refuse(line, `content_block_stop for index ${index}, which was never started`);
            if (block!.stopped) refuse(line, `duplicate content_block_stop for index ${index}`);
            block!.stopped = true;
            openBlock = null;
            break;
          }
          case 'message_delta': {
            if (open === null) refuse(line, 'message_delta outside an open message');
            if (open!.deltaSeen) refuse(line, `a second message_delta for the message from line ${open!.line}`);
            const delta = (inner as Rec)['delta'];
            open!.stopReason = isRecord(delta) ? delta['stop_reason'] : undefined;
            open!.stopDetails = isRecord(delta) ? delta['stop_details'] : undefined;
            open!.deltaSeen = true;
            break;
          }
          case 'message_stop': {
            if (open === null) refuse(line, 'message_stop outside an open message');
            if (!open!.deltaSeen) refuse(line, `message_stop without a message_delta for the message from line ${open!.line}`);
            if (openBlock !== null) refuse(line, `message_stop while block ${openBlock.index} (line ${openBlock.line}) is open`);
            open!.stopped = true;
            stream.messages.push(open!);
            open = null;
            break;
          }
          default:
            refuse(line, `unknown stream event type ${JSON.stringify(kind)}`);
        }
        break;
      }
      default:
        refuse(line, `unknown top-level event type ${JSON.stringify(type)}`);
    }
  }
  const unfinished: Message | null = open;
  if (unfinished !== null) refuse(null, `the stream ended while the message from line ${unfinished.line} is open`);
  if (stream.init === null) refuse(null, 'no system init event arrived');
  return stream;
}

/**
 * `@1`'s launch-context checks but the model, plus the pin's version, the
 * default permission mode and a `fast_mode_state` of exactly "off". The init
 * model is not read here: substitution is the only authority on models, and
 * its value was already classified.
 *
 * `fast_mode_state` is read here, all of it. Rule 8 classifies "on" and
 * "cooldown" first, but the check below is an allowlist of exactly "off"
 * (both probes show only "off"; review repair R4, a parent decision under
 * D-8's "Unknown means refused"), so it refuses them too, as it refuses any
 * state no rule knows. The overlap fails closed, as `rateLimitProblems`'
 * does (R14): while classification runs first it changes no answer, but a
 * defect in rule 8 shows here as `CliLaunchContextError` rather than as an
 * acceptance (review repair S5, a parent decision).
 */
function checkLaunchContextV2(init: Line, request: RoleRequest): void {
  const e = init.event;
  const pin = CLAUDE_CODE_CLI_V2_PROFILE.pin.version;
  const problems: string[] = [];
  if (e['apiKeySource'] !== 'none') problems.push(`apiKeySource ${shown(e['apiKeySource'])} (must be "none")`);
  const tools = e['tools'];
  if (!Array.isArray(tools) || tools.length !== 1 || tools[0] !== STRUCTURED_OUTPUT_TOOL) problems.push(`tools ${shown(tools)} (must be exactly ["${STRUCTURED_OUTPUT_TOOL}"])`);
  const mcp = e['mcp_servers'];
  if (!Array.isArray(mcp) || mcp.length !== 0) problems.push(`mcp_servers ${shown(mcp)} (must be empty)`);
  if (e['claude_code_version'] !== pin) problems.push(`claude_code_version ${shown(e['claude_code_version'])} (must be ${JSON.stringify(pin)}, the pin's)`);
  if (e['permissionMode'] !== 'default') problems.push(`permissionMode ${shown(e['permissionMode'])} (must be "default")`);
  // Exactly "off": this also refuses rule 8's "on" and "cooldown", so a rule-8 defect reds here on the class
  // (CliLaunchContextError), not on an acceptance (review repair S5, a parent decision, as R14 records for
  // rateLimitProblems).
  if (typeof e['fast_mode_state'] !== 'string') problems.push(`fast_mode_state ${shown(e['fast_mode_state'])} (must be present)`);
  else if (e['fast_mode_state'] !== 'off') problems.push(`fast_mode_state ${shown(e['fast_mode_state'])} (must be "off")`);
  if (problems.length > 0) throw new CliLaunchContextError(request, `${problems.join('; ')} (init at line ${init.line})`);
}

/**
 * `@1`'s result checks in `@1`'s order, each naming the result's line, then
 * a completed turn, a stop reason of "tool_use" or "end_turn" (review repair
 * S1, a parent decision) that is the last completed message's own (review
 * repair U5, a parent decision), a `fast_mode_state` of exactly "off" (as
 * at init, review repair R4; like init's, that check also refuses rule 8's
 * "on" and "cooldown", so a rule-8 defect shows here as `CliResultError`
 * rather than as an acceptance, review repair S5, a parent decision), and
 * an `api_error_status` absent or null (review repair U4, a parent
 * decision). Last, an API-error item anywhere in a stream whose result
 * claims success is refused, naming each of the three fields a kind may sit
 * in.
 *
 * That last refusal goes beyond D-8 step 5, which names only the terminal
 * reason and the fast-mode state. With retries off, a success after an API
 * error is a second request nothing counted. It is also what makes D-7's
 * broad exemption safe: the model check skips every flagged API-error item,
 * whatever model it names, so without this refusal such an item in a clean
 * exit-0 stream would be accepted.
 */
function checkResultV2(stream: Stream, request: RoleRequest): Line {
  if (stream.results.length === 0) throw new CliResultError(request, 'no result event arrived');
  if (stream.results.length > 1) throw new CliResultError(request, `${stream.results.length} result events (lines ${stream.results.map((r) => r.line).join(', ')})`);
  const result = stream.results[0]!;
  if (result.line !== stream.lastLine) throw new CliResultError(request, `the result at line ${result.line} is not the last event (line ${stream.lastLine})`);
  const e = result.event;
  const at = `at line ${result.line}`;
  if (e['subtype'] !== 'success') throw new CliResultError(request, `subtype ${shown(e['subtype'])} ${at}`);
  if (e['is_error'] !== false) throw new CliResultError(request, `is_error ${shown(e['is_error'])} ${at} (subtype "success" alone is not success)`);
  if (e['structured_output'] === undefined) throw new CliResultError(request, `structured_output is absent ${at}`);
  if (e['terminal_reason'] !== 'completed') throw new CliResultError(request, `terminal_reason ${shown(e['terminal_reason'])} ${at} (must be "completed")`);
  // "refusal" and "max_tokens" were classified before this step. Anything else but an ended turn, such as
  // "pause_turn" or "model_context_window_exceeded", or no stop reason at all, is refused (review repair S1, a parent
  // decision under D-8's "Unknown means refused"). The accepted probe's result says "tool_use"; the auth-failed
  // probe's says "stop_sequence", which is_error refuses first. Which values 2.1.280 states is a probe question.
  if (!V2_RESULT_STOP_REASONS.has(e['stop_reason'])) throw new CliResultError(request, `stop_reason ${shown(e['stop_reason'])} ${at} (must be "tool_use" or "end_turn")`);
  // The result's stop reason is the last completed message's. A result stating a turn end no streamed message shows
  // points to a request the stream did not carry, and a result with no completed message at all has nothing to state
  // (review repair U5, a parent decision under D-8's "Unknown means refused"; whether 2.1.280's result always restates
  // the last message's stop reason is a probe question). Since the result's allowlist is "tool_use" and "end_turn",
  // this also refuses a last message ending anything else, before checkStopReasonsV2 would: that check's refusal is
  // reached for a message before the last, or for a last message that carries the call and ends "end_turn".
  const last: Message | undefined = stream.messages[stream.messages.length - 1];
  if (last === undefined) throw new CliResultError(request, `stop_reason ${shown(e['stop_reason'])} ${at}, but no message completed in the stream`);
  if (e['stop_reason'] !== last.stopReason) throw new CliResultError(request, `stop_reason ${shown(e['stop_reason'])} ${at} differs from the last completed message's, which started at line ${last.line} and ended with stop_reason ${shown(last.stopReason)}`);
  // Exactly "off": this also refuses rule 8's "on" and "cooldown", so a rule-8 defect reds here on the class
  // (CliResultError), not on an acceptance (review repair S5, a parent decision, as R14 records for rateLimitProblems).
  if (typeof e['fast_mode_state'] !== 'string') throw new CliResultError(request, `fast_mode_state ${shown(e['fast_mode_state'])} ${at} (must be present)`);
  if (e['fast_mode_state'] !== 'off') throw new CliResultError(request, `fast_mode_state ${shown(e['fast_mode_state'])} ${at} (must be "off")`);
  // Both probes' results say null. Any other value reports an API error beside a claimed success, the shape the next
  // check refuses on a flagged item (review repair U4, a parent decision under D-8's "Unknown means refused"; which
  // values 2.1.280 writes here is a probe question).
  if (Object.hasOwn(e, 'api_error_status') && e['api_error_status'] !== null) throw new CliResultError(request, `api_error_status ${shown(e['api_error_status'])} ${at} (must be absent or null)`);
  const apiError = stream.assistants.find(({ event }) => isApiErrorItem(event));
  if (apiError !== undefined) {
    const fields = API_ERROR_KIND_FIELDS.map((field) => `${field} ${shown(apiError.event[field])}`).join(', ');
    throw new CliResultError(request, `the assistant item at line ${apiError.line} is an API error (${fields}) although the result ${at} reports success`);
  }
  return result;
}

const V2_RATE_LIMIT_STATUSES: ReadonlySet<unknown> = new Set(['allowed', 'allowed_warning']);
const V2_RATE_LIMIT_TYPES: ReadonlySet<unknown> = new Set(['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet']);

/**
 * A utilization this adapter reads as within the window: a number from 0 to
 * 1. Anything else is named; a negative one since review repair S2 (a parent
 * decision: no window is used less than not at all).
 */
function utilizationProblem(where: string, value: unknown): string | null {
  if (typeof value !== 'number' || value > 1) return `${where} ${shown(value)} (must be a number no greater than 1)`;
  return value < 0 ? `${where} ${shown(value)} (must be a number no less than 0)` : null;
}

/**
 * D-6's per-field rules for one object inside `unifiedWindows`, at any depth,
 * each field allowed to be absent there: a field that is present is held to
 * the value the allowlist names at the top level, and named by its path.
 * Every `utilization` found this way is read, one level down or four (review
 * repair R3), and so is every other field D-6 names (review repair S2, a
 * parent decision under D-8's "Unknown means refused": which fields a window
 * carries, and whether any of them means what it means at the top level, is
 * a probe question). Overage and `rejected` inside a window are classified
 * by rules 1 and 2 first; refusing them here too fails closed, as below.
 */
function windowFieldProblems(o: Rec, where: string): string[] {
  const has = (key: string): boolean => Object.hasOwn(o, key);
  const problems: string[] = [];
  if (has('status') && !V2_RATE_LIMIT_STATUSES.has(o['status'])) problems.push(`${where}.status ${shown(o['status'])} (must be "allowed" or "allowed_warning")`);
  if (has('rateLimitType') && !V2_RATE_LIMIT_TYPES.has(o['rateLimitType'])) problems.push(`${where}.rateLimitType ${shown(o['rateLimitType'])} (must be "five_hour", "seven_day", "seven_day_opus" or "seven_day_sonnet")`);
  if (has('isUsingOverage') && o['isUsingOverage'] !== false) problems.push(`${where}.isUsingOverage ${shown(o['isUsingOverage'])} (must be false)`);
  if (has('overageInUse') && o['overageInUse'] !== false) problems.push(`${where}.overageInUse ${shown(o['overageInUse'])} (must be absent or false)`);
  if (has('overageStatus') && o['overageStatus'] !== 'rejected') problems.push(`${where}.overageStatus ${shown(o['overageStatus'])} (must be "rejected")`);
  if (has('rateLimitGraceActive')) problems.push(`${where}.rateLimitGraceActive ${shown(o['rateLimitGraceActive'])} (must be absent)`);
  if (has('errorCode')) problems.push(`${where}.errorCode ${shown(o['errorCode'])} (must be absent)`);
  if (has('utilization')) {
    const problem = utilizationProblem(`${where}.utilization`, o['utilization']);
    if (problem !== null) problems.push(problem);
  }
  return problems;
}

/**
 * D-6's own overage fields. Inside a window `windowFieldProblems` holds their
 * values to the allowlist and rule 1 classifies their overage values, so
 * their names are not refused as names: a window carrying them at their
 * allowed values stays accepted (review repair U1, a parent decision).
 */
const V2_OVERAGE_FIELDS: ReadonlySet<string> = new Set(['isUsingOverage', 'overageInUse', 'overageStatus']);

/**
 * Every key and every string value inside one `unifiedWindows` entry, at any
 * depth, that names overage (case-insensitively), each by where it sits. An
 * array window names itself in a field such as `window`, and a window may
 * nest, so a name is read wherever it is, not only as a key of the object
 * form (review repair U1, a parent decision under D-8's "Unknown means
 * refused"; which names a window carries is a probe question). D-6's own
 * overage fields are exempt by name. Rule 1 classifies `rateLimitType`
 * "overage" first; naming it here too fails closed.
 */
function overageNamesIn(value: unknown, where: string): string[] {
  const named = (what: string): string => `${what} (a window named for overage is refused until a probe explains it)`;
  if (typeof value === 'string') return /overage/i.test(value) ? [named(`${where} ${shown(value)}`)] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => overageNamesIn(item, `${where}[${i}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, inner]) => [
    ...(/overage/i.test(key) && !V2_OVERAGE_FIELDS.has(key) ? [named(`${where} key ${JSON.stringify(key)}`)] : []),
    ...overageNamesIn(inner, /^[A-Za-z_$][\w$]*$/.test(key) ? `${where}.${key}` : `${where}[${JSON.stringify(key)}]`),
  ]);
}

/**
 * Everything about one `rate_limit_info` outside D-6's allowlist. Fields the
 * allowlist does not name, such as `resetsAt` and `overageDisabledReason`,
 * are allowed at the top level; inside `unifiedWindows` any name containing
 * "overage" but D-6's own fields is refused (review repair U1, a parent
 * decision).
 *
 * This step deliberately re-checks the fields rules 1 and 2 classify
 * (`status`, `isUsingOverage`, `overageInUse`, `overageStatus`): D-6 states
 * them as allowlist values ("present and false", "`rejected`"), and D-8 ends
 * "unknown means refused". The overlap fails closed. Overage and `rejected`
 * never reach here while classification runs first, so it changes no
 * answer; but a defect in rules 1 or 2 is caught here as the wrong class
 * (`CliUsageUnobservedError`) rather than as an acceptance, which is why
 * Task 2's teeth 9 and 11 red on the class and not on acceptance. The same
 * holds inside `unifiedWindows`, where `windowFieldProblems` re-checks what
 * rules 1 and 2 read there (review repair S2, a parent decision), and where
 * the refusal of overage names also covers rule 1's `rateLimitType`
 * "overage" (review repair U1, a parent decision).
 */
function rateLimitProblems(info: unknown): string[] {
  if (!isRecord(info)) return [`rate_limit_info ${shown(info)} (must be an object)`];
  const has = (key: string): boolean => Object.hasOwn(info, key);
  const problems: string[] = [];
  if (!V2_RATE_LIMIT_STATUSES.has(info['status'])) problems.push(`status ${shown(info['status'])} (must be "allowed" or "allowed_warning")`);
  if (!V2_RATE_LIMIT_TYPES.has(info['rateLimitType'])) problems.push(`rateLimitType ${shown(info['rateLimitType'])} (must be "five_hour", "seven_day", "seven_day_opus" or "seven_day_sonnet")`);
  if (!has('isUsingOverage')) problems.push('isUsingOverage absent (must be present and false)');
  if (has('isUsingOverage') && info['isUsingOverage'] !== false) problems.push(`isUsingOverage ${shown(info['isUsingOverage'])} (must be false)`);
  if (has('overageInUse') && info['overageInUse'] !== false) problems.push(`overageInUse ${shown(info['overageInUse'])} (must be absent or false)`);
  if (!has('overageStatus')) problems.push('overageStatus absent (must be "rejected"; absence is refused until a probe settles what it means)');
  if (has('overageStatus') && info['overageStatus'] !== 'rejected') problems.push(`overageStatus ${shown(info['overageStatus'])} (must be "rejected")`);
  if (has('rateLimitGraceActive')) problems.push(`rateLimitGraceActive ${shown(info['rateLimitGraceActive'])} (must be absent)`);
  if (has('errorCode')) problems.push(`errorCode ${shown(info['errorCode'])} (must be absent)`);
  if (has('utilization')) {
    const problem = utilizationProblem('utilization', info['utilization']);
    if (problem !== null) problems.push(problem);
  }
  if (has('unifiedWindows')) {
    const windows = info['unifiedWindows'];
    const entries = windowEntries(windows);
    if (entries === null) problems.push(`unifiedWindows ${shown(windows)} (must be an array or an object)`);
    // A window named for overage (D-6 refuses rateLimitType "seven_day_overage_included" until a probe explains it) is
    // refused by its key too, whatever it holds (review repair S2, a parent decision; a probe question).
    for (const key of isRecord(windows) ? Object.keys(windows) : []) {
      if (/overage/i.test(key)) problems.push(`unifiedWindows key ${JSON.stringify(key)} (a window named for overage is refused until a probe explains it)`);
    }
    for (const [key, window] of entries ?? []) {
      // A key or a string value naming overage anywhere inside the entry, not only a key of the object form, which the
      // loop above reads (review repair U1, a parent decision; a probe question).
      problems.push(...overageNamesIn(window, `unifiedWindows${key}`));
      // An entry that is not an object is refused by its shape, never skipped: a bare number may be a utilization.
      if (!isRecord(window)) {
        problems.push(`unifiedWindows${key} ${shown(window)} (must be an object)`);
        continue;
      }
      for (const found of objectsIn(window, `unifiedWindows${key}`)) problems.push(...windowFieldProblems(found.object, found.where));
    }
  }
  return problems;
}

/** At least one rate-limit event, and every one inside the allowlist: included usage is observed, not assumed. */
function checkUsageObservedV2(stream: Stream, request: RoleRequest): void {
  if (stream.rateLimits.length === 0) throw new CliUsageUnobservedError(request, 'no rate_limit_event arrived');
  for (const { line, event } of stream.rateLimits) {
    const problems = rateLimitProblems(event['rate_limit_info']);
    if (problems.length > 0) throw new CliUsageUnobservedError(request, `the rate_limit_event at line ${line}: ${problems.join('; ')}`);
  }
}

/** Exactly one `modelUsage` entry. Which model it names was classified; an empty or missing one is no account of the model at all. */
function checkModelUsageV2(result: Line, request: RoleRequest): void {
  const usage = result.event['modelUsage'];
  if (!isRecord(usage)) throw new CliResultError(request, `modelUsage ${shown(usage)} at line ${result.line} (must be an object with exactly one entry)`);
  const count = Object.keys(usage).length;
  if (count !== 1) throw new CliResultError(request, `modelUsage has ${count} entries at line ${result.line} (must have exactly one)`);
}

/**
 * Every message's stop reason, in stream order: the one carrying the call
 * ends `tool_use`; any other ends `tool_use` or `end_turn`. Refusal and
 * `max_tokens` were classified before this runs. The last message's stop
 * reason was also tied to the result's, whose allowlist is `tool_use` and
 * `end_turn` (review repair U5, a parent decision), so this refusal is
 * reached for a message before the last, or for a last message that carries
 * the call and ends `end_turn`, as the result then says too.
 */
function checkStopReasonsV2(block: ToolCall, stream: Stream, request: RoleRequest): void {
  for (const message of stream.messages) {
    const carriesCall = message === block.message;
    const allowed = carriesCall ? ['tool_use'] : ['tool_use', 'end_turn'];
    if (!allowed.includes(message.stopReason as string)) throw new CliStopReasonError(request, message.stopReason, { line: message.line, carriesCall });
  }
}

/**
 * The result's restatement of the answer against the concatenated deltas,
 * named by the result's line. `@1`'s `checkOutput`, which `@2` shares and
 * which stays byte-identical, makes the same comparison but names no line,
 * so `@2` makes it first (review repair S8, a parent decision); a result
 * and an assistant restatement that both disagree are therefore refused by
 * the result's line. Deltas that do not parse as one JSON object are left to
 * `checkOutput`, which refuses them in `@1`'s words and still runs after.
 *
 * Because it runs before `checkOutput`, when several faults coincide it
 * names the result conflict first. A differing result beside an assistant
 * item that restates a call to another tool, carries a second `tool_use`
 * item or restates another id is refused here as `CliOutputConflictError`
 * naming the result's line, not as the class `checkOutput` would have
 * thrown for the assistant item (`CliUnexpectedToolCallError` or its own
 * `CliOutputConflictError`). Each is a refusal; only the named fault
 * changes (review repair U8, a parent decision, recording this order).
 */
function checkResultRestatementV2(block: ToolCall, result: Line, request: RoleRequest): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(block.partialJson.join(''));
  } catch {
    return;
  }
  if (!isRecord(parsed)) return;
  if (canonical(result.event['structured_output']) !== canonical(parsed)) throw new CliOutputConflictError(request, `result.structured_output at line ${result.line} differs from the concatenated deltas`);
}

/**
 * `claude-code-cli@2`'s projection: D-7's classification over every line it
 * can parse, then D-8's strictness in order — the exit, the first malformed
 * line, the walk, the launch context, the result, the usage observed, the
 * model usage, the one call, the stop reasons, the tool loop, the result's
 * restatement and the output. Returns the concatenated deltas byte for byte,
 * as `@1` does.
 */
function projectResponseV2(body: string, request: RoleRequest): string {
  const envelope = parseCliEnvelope(body);
  const { lines, malformed } = parseStreamLinesTolerant(envelope.stdout);
  classify(lines, request);
  if (envelope.exitCode !== 0 || envelope.signal !== null) throw new CliExitError(request, envelope.exitCode, envelope.signal, envelope.stderrBytes);
  if (malformed !== null) throw new CliStreamMalformedError(request, malformed.line, malformed.detail);
  const stream = walkStreamV2(lines, request);
  checkLaunchContextV2(stream.init!, request);
  const result = checkResultV2(stream, request);
  checkUsageObservedV2(stream, request);
  checkModelUsageV2(result, request);
  const block = theStructuredOutputBlock(stream, request);
  checkStopReasonsV2(block, stream, request);
  checkToolLoop(block, stream, request);
  checkResultRestatementV2(block, result, request);
  return checkOutput(block, stream, result.event, request);
}

// ---------------------------------------------------------------------------
// readUsage
// ---------------------------------------------------------------------------

/** A non-negative integer, or nothing: a string, a float or a negative number is not a count. */
function countOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readUsage(body: string): ProviderUsage | null {
  let envelope: CliEnvelope;
  try {
    envelope = parseCliEnvelope(body);
  } catch {
    return null;
  }
  const results: Rec[] = [];
  for (const text of envelope.stdout.split(/\r?\n/)) {
    if (text.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (isRecord(parsed) && parsed['type'] === 'result') results.push(parsed);
  }
  if (results.length !== 1) return null;
  const result = results[0]!;
  if (result['subtype'] !== 'success' || result['is_error'] !== false) return null;
  const usage = result['usage'];
  if (!isRecord(usage)) return null;
  const inputTokens = countOrNull(usage['input_tokens']);
  const outputTokens = countOrNull(usage['output_tokens']);
  if (inputTokens === null || outputTokens === null) return null;
  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: countOrNull(usage['cache_creation_input_tokens']),
    cacheReadInputTokens: countOrNull(usage['cache_read_input_tokens']),
  };
}

export const CLAUDE_CODE_CLI_ADAPTER: ProviderAdapter = {
  identity: CLAUDE_CODE_CLI_IDENTITY,
  channel: 'process',
  buildRequest,
  projectResponse,
  readUsage,
};

/**
 * `claude-code-cli@2`. Its invocation is declared from its profile, so the
 * pipeline identity moves with the effort, the ceiling or the executable. Its
 * projection is its own (`projectResponseV2`), never `@1`'s, which was proved
 * against another executable's stream. `readUsage` is `@1`'s: reading
 * `result.usage` is the same act on either executable, and it is diagnostic
 * only.
 */
export const CLAUDE_CODE_CLI_V2_ADAPTER: ProviderAdapter = {
  identity: CLAUDE_CODE_CLI_V2_PROFILE.identity,
  channel: 'process',
  invocation: invocationOf(CLAUDE_CODE_CLI_V2_PROFILE),
  buildRequest: buildRequestV2,
  projectResponse: projectResponseV2,
  readUsage,
};
