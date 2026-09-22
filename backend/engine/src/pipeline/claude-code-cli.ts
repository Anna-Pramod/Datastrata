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
 * Pure: no filesystem, no clock, no network, no child process. The transport
 * (`claude-code-cli-transport.ts`) performs the launch this module describes.
 */

import { z } from 'zod';
import {
  MAX_OUTPUT_TOKENS,
  ProviderOutputTruncatedError,
  ProviderRefusalError,
  roleOutputJsonSchema,
} from './anthropic-messages';
import type { ProviderAdapter, ProviderAdapterIdentity, ProviderEndpointConfig, ProviderHttpRequest, ProviderUsage } from './provider-adapter';
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

/** `PINNED_CLI.path` with `~` replaced by the given home directory. Pure: nothing is checked to exist. */
export function resolvePinnedCliPath(home: string): string {
  if (!home.startsWith('/')) throw new Error(`the pinned CLI path is resolved against an absolute home directory; received ${JSON.stringify(home)}`);
  return `${home.replace(/\/+$/, '')}${PINNED_CLI.path.slice(1)}`;
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

/** The message ended for a reason other than the tool call. */
export class CliStopReasonError extends Error {
  constructor(request: RoleRequest, readonly stopReason: unknown) {
    super(`${label(request)}: the message carrying the ${STRUCTURED_OUTPUT_TOOL} call ended with stop_reason ${JSON.stringify(stopReason)} rather than "tool_use"; its content is not a role result`);
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

// ---------------------------------------------------------------------------
// buildRequest
// ---------------------------------------------------------------------------

function buildRequest(request: RoleRequest, config: ProviderEndpointConfig): ProviderHttpRequest {
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
  const spec: CliLaunchSpec = {
    model: request.model,
    systemPrompt: prompt[0]!.content,
    userMessage: input[0]!.content,
    jsonSchema: roleOutputJsonSchema(request.role),
    effort: 'high',
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
